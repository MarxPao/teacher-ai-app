"""
sidecar/harness_engine.py — Motor de Automação Nativo Teacher AI (Baseado em Browser Harness)

Elimina intermediários frágeis (Playwright / Content Scripts efêmeros) e opera via:
1. Conexão CDP direta persistente (sobrevive a recargas e navegação de URLs).
2. Cliques em nível de compositor gráfico (Input.dispatchMouseEvent) via coordenadas da AXTree.
3. Digitação à prova de frameworks reativos (fill_input com teclas Win32 virtuais + synthetic bubbles).
4. Sincronização determinística pós-ação (wait_for_load + wait_for_network_idle).
5. Operação silenciosa em segundo plano com marcador visual '🐴 ' sem roubar foco.
"""

import asyncio
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Garante acesso ao pacote vendorado browser_harness
_SIDECAR_DIR = Path(__file__).resolve().parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

try:
    from browser_harness import admin as bh_admin
    from browser_harness import helpers as bh_helpers
    from browser_harness import _ipc as bh_ipc
    HARNESS_AVAILABLE = True
except ImportError as e:
    HARNESS_AVAILABLE = False
    bh_admin = None  # type: ignore
    bh_helpers = None  # type: ignore
    bh_ipc = None  # type: ignore

logger = logging.getLogger("TeacherAI.HarnessEngine")


class HarnessEngine:
    """
    Motor nativo de automação web do Teacher AI.
    Conecta ao Chrome do professor através do daemon persistente do Browser Harness.
    """

    def __init__(self, cdp_url: str = "http://localhost:9222", name: str = "default"):
        self.cdp_url = cdp_url
        self.name = name
        self.is_harness = True
        self._connected = False
        os.environ.setdefault("BU_NAME", name)
        if cdp_url:
            os.environ.setdefault("BU_CDP_URL", cdp_url)

    @property
    def is_available(self) -> bool:
        return HARNESS_AVAILABLE

    def ensure_connected(self) -> bool:
        """Inicializa o daemon do Browser Harness ou conecta à sessão existente."""
        if not HARNESS_AVAILABLE:
            logger.error("Browser Harness não está instalado ou disponível no ambiente.")
            return False

        try:
            # Garante que o daemon está em execução e conectado ao Chrome
            bh_admin.ensure_daemon(self.name)
            self._connected = True
            return True
        except Exception as e:
            logger.warning(f"Não foi possível conectar ao daemon do Browser Harness: {e}")
            self._connected = False
            return False

    # ─────────────────────────────────────────────────────────────────────────
    # AÇÕES BÁSICAS DE NAVEGAÇÃO & CARREGAMENTO
    # ─────────────────────────────────────────────────────────────────────────

    def goto(self, url: str) -> Dict[str, Any]:
        """Navega para a URL alvo e aguarda estabilização de rede."""
        self.ensure_connected()
        res = bh_helpers.goto_url(url)
        self.wait_for_settled()
        return res

    async def async_goto(self, url: str) -> Dict[str, Any]:
        return await asyncio.to_thread(self.goto, url)

    def wait_for_settled(self, timeout: float = 12.0) -> bool:
        """
        Sincronização determinística:
        1. Aguarda document.readyState == 'complete'
        2. Aguarda buffer de rede ficar ocioso (Network.idle)
        """
        if not self._connected and not self.ensure_connected():
            return False

        try:
            bh_helpers.wait_for_load(timeout=timeout / 2)
            bh_helpers.wait_for_network_idle(timeout=timeout / 2, idle_ms=400)
            return True
        except Exception:
            return False

    async def async_wait_for_settled(self, timeout: float = 12.0) -> bool:
        return await asyncio.to_thread(self.wait_for_settled, timeout)

    # ─────────────────────────────────────────────────────────────────────────
    # AÇÕES FÍSICAS NO DOM (CLIQUE & DIGITAÇÃO)
    # ─────────────────────────────────────────────────────────────────────────

    def click_element(self, target: str, wait_idle: bool = True) -> Dict[str, Any]:
        """
        Executa clique resiliente:
        1. Se for coordenadas explícitas 'x,y', clica diretamente.
        2. Tenta obter o centroide via AXTree / BoxModel do CDP.
        3. Fallback: localiza via querySelector no DOM, faz scrollIntoView e clica via coordenadas ou JS.
        4. Sincroniza com wait_for_network_idle para que o próximo passo receba a nova página estável.
        """
        self.ensure_connected()

        # Caso 1: Coordenadas explícitas (ex: '250,380')
        coord_match = re.match(r"^\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*$", target)
        if coord_match:
            x, y = float(coord_match.group(1)), float(coord_match.group(2))
            bh_helpers.click_at_xy(x, y)
            if wait_idle:
                self.wait_for_settled()
            return {"clicked": True, "method": "coordinates", "x": x, "y": y}

        # Caso 2: Resolução de seletor / elemento via DOM para coordenadas físicas
        js_find_coords = f"""
        (() => {{
            const target = {repr(target)};
            const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
            let el = null;
            if (target.startsWith('#') || target.startsWith('.') || target.includes('>')) {{
                try {{ el = document.querySelector(target); }} catch(e) {{}}
            }}
            if (!el) {{
                const cleanTarget = norm(target.replace(/^text=/, ''));
                const all = Array.from(document.querySelectorAll('button, a, .tab-btn, [role="tab"], [role="button"], input[type="submit"]'));
                for (const item of all) {{
                    const t = norm(item.innerText || item.textContent || item.getAttribute('aria-label') || item.id || '');
                    if (t === cleanTarget || t.includes(cleanTarget)) {{ el = item; break; }}
                }}
            }}
            if (el) {{
                el.scrollIntoView({{ block: 'center', inline: 'center' }});
                const rect = el.getBoundingClientRect();
                return {{
                    found: true,
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    tag: el.tagName,
                    id: el.id
                }};
            }}
            return {{ found: false }};
        }})()
        """
        res = bh_helpers.js(js_find_coords)
        if res and res.get("found"):
            x, y = res["x"], res["y"]
            bh_helpers.click_at_xy(x, y)
            if wait_idle:
                self.wait_for_settled()
            return {"clicked": True, "method": "physical_compositor", "x": x, "y": y, "tag": res.get("tag")}

        # Caso 3: Fallback direto via Synthetic JS Click
        js_click_fallback = f"""
        (() => {{
            const el = document.querySelector({repr(target)});
            if (el) {{
                el.scrollIntoView({{ block: 'center', inline: 'center' }});
                el.click();
                return true;
            }}
            return false;
        }})()
        """
        clicked = bh_helpers.js(js_click_fallback)
        if clicked and wait_idle:
            self.wait_for_settled()
        return {"clicked": bool(clicked), "method": "js_fallback"}

    async def async_click_element(self, target: str, wait_idle: bool = True) -> Dict[str, Any]:
        return await asyncio.to_thread(self.click_element, target, wait_idle)

    def fill_element(self, selector: str, value: str, clear_first: bool = True) -> Dict[str, Any]:
        """
        Digitação com suporte a frameworks reativos (React, Vue, Ember) usando
        a primitiva de elite fill_input do Browser Harness (Win32 virtual keys + synthetic bubbles).
        """
        self.ensure_connected()
        try:
            bh_helpers.fill_input(selector, value, clear_first=clear_first, timeout=3.0)
            return {"filled": True, "selector": selector, "value": value}
        except Exception as e:
            # Fallback inline para DOM
            logger.warning(f"fill_input falhou para '{selector}', tentando fallback JS: {e}")
            js_fill = f"""
            (() => {{
                const el = document.querySelector({repr(selector)});
                if (el) {{
                    el.focus();
                    el.value = {repr(value)};
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return true;
                }}
                return false;
            }})()
            """
            ok = bh_helpers.js(js_fill)
            return {"filled": bool(ok), "selector": selector, "value": value, "fallback": True}

    async def async_fill_element(self, selector: str, value: str, clear_first: bool = True) -> Dict[str, Any]:
        return await asyncio.to_thread(self.fill_element, selector, value, clear_first)

    # ─────────────────────────────────────────────────────────────────────────
    # PERCEPÇÃO & LEITURA DA PÁGINA
    # ─────────────────────────────────────────────────────────────────────────

    def get_page_info(self) -> Dict[str, Any]:
        """Retorna informações de viewport, URL e título da aba ativa."""
        self.ensure_connected()
        try:
            return bh_helpers.page_info()
        except Exception:
            return {"url": "", "title": ""}

    def get_accessibility_tree(self) -> Dict[str, Any]:
        """Extrai a árvore completa de nós acessíveis via CDP (Full AXTree)."""
        self.ensure_connected()
        try:
            return bh_helpers.cdp("Accessibility.getFullAXTree")
        except Exception as e:
            logger.warning(f"Erro ao extrair AXTree via CDP: {e}")
            return {"nodes": []}

    def evaluate(self, expression: str, arg: Any = None) -> Any:
        """Executa JavaScript na aba controlada (compatibilidade com mocks de Page)."""
        self.ensure_connected()
        if arg is not None:
            import json
            expr = f"({expression})({json.dumps(arg)})"
        else:
            expr = expression
        return bh_helpers.js(expr)

    async def async_evaluate(self, expression: str, arg: Any = None) -> Any:
        return await asyncio.to_thread(self.evaluate, expression, arg)

    # Propriedades de compatibilidade com interfaces estilo Playwright Page
    @property
    def url(self) -> str:
        return self.get_page_info().get("url", "")

    async def title(self) -> str:
        return self.get_page_info().get("title", "")

    def screenshot(self, type: str = "png", full_page: bool = False) -> bytes:
        """Captura screenshot via CDP e retorna os bytes PNG decodificados."""
        self.ensure_connected()
        import base64
        r = bh_helpers.cdp("Page.captureScreenshot", format=type, captureBeyondViewport=full_page)
        return base64.b64decode(r.get("data", ""))

    async def async_screenshot(self, type: str = "png", full_page: bool = False) -> bytes:
        return await asyncio.to_thread(self.screenshot, type, full_page)
