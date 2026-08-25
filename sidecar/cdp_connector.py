"""
cdp_connector.py — Conector Chrome DevTools Protocol (CDP) e Detector de Desafios
Gerencia a conexão com o Google Chrome aberto pelo professor e detecta bloqueios/CAPTCHAs.
"""

import asyncio
import json
from typing import Any, Dict, List, Optional, Tuple
import requests
from playwright.async_api import Browser, BrowserContext, Page, async_playwright

class CDPConnector:
    def __init__(self, cdp_url: str = "http://localhost:9222"):
        self.cdp_url = cdp_url
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None

    def check_health(self) -> Tuple[bool, str]:
        """Verifica se o Chrome está aberto e aceitando conexões CDP."""
        try:
            r = requests.get(f"{self.cdp_url}/json/version", timeout=2.0)
            if r.status_code == 200:
                data = r.json()
                browser_ver = data.get("Browser", "Chrome")
                return (True, f"Conectado ao {browser_ver}")
            return (False, f"HTTP {r.status_code} na porta 9222")
        except Exception as e:
            return (False, f"Chrome não detectado na porta 9222: {e}")

    async def connect(self) -> BrowserContext:
        """Conecta ao browser local via CDP."""
        if not self._playwright:
            self._playwright = await async_playwright().start()

        if not self._browser:
            self._browser = await self._playwright.chromium.connect_over_cdp(self.cdp_url)
            self._context = self._browser.contexts[0] if self._browser.contexts else await self._browser.new_context()

        return self._context

    async def find_portal_page(self, portal_keyword: str) -> Optional[Page]:
        """Localiza a aba do portal alvo no navegador."""
        context = await self.connect()
        kw = portal_keyword.lower().strip()

        for p in context.pages:
            url = p.url.lower()
            title = (await p.title()).lower()
            if kw in url or kw in title:
                return p

        # Fallback: retorna a página ativa se houver
        return context.pages[0] if context.pages else None

    async def detect_security_challenge(self, page: Page) -> Tuple[bool, str]:
        """
        Detecta se a página atual está exibindo CAPTCHA, Cloudflare Turnstile, 2FA ou bloqueio.
        Retorna (is_blocked, challenge_type).
        """
        try:
            # 1. Verifica presença de iframes ou elementos de CAPTCHA
            has_recaptcha = await page.locator("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], div.g-recaptcha, div#cf-turnstile").count() > 0
            if has_recaptcha:
                return (True, "Desafio CAPTCHA / Cloudflare Turnstile detectado")

            # 2. Verifica palavras-chave de 2FA ou bloqueio no DOM
            page_text = (await page.content()).lower()
            block_keywords = [
                "código de verificação", "autenticação em duas etapas",
                "verifique seu email", "digite o código enviado",
                "sua sessão expirou", "faça login novamente", "access denied"
            ]

            for kw in block_keywords:
                if kw in page_text:
                    return (True, f"Tela de segurança ou reautenticação detectada ('{kw}')")

            return (False, "")
        except Exception:
            return (False, "")

    async def close(self):
        """Fecha a conexão CDP suavemente sem fechar o navegador do professor."""
        try:
            if self._browser:
                await self._browser.close()
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        finally:
            self._browser = None
            self._playwright = None
            self._context = None
