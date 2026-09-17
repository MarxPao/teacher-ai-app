"""
sidecar/portal_structure_mapper.py — Mapeamento Estrutural Passivo do Portal (PARTE 2)

Navega sequencialmente por cada aba de navegação do portal e registra:
  - Título da aba
  - Tipo de conteúdo detectado: tabela, formulário, lista, cards, texto
  - Campos de formulário disponíveis (id, tipo, placeholder)
  - Botões de LEITURA visíveis (links, filtros) — nunca de AÇÃO (salvar, excluir, enviar)
  - Tabelas: cabeçalhos e quantidade de linhas

Regras de Ouro:
  1. NUNCA clicar em botões de ação (salvar, excluir, enviar, cancelar, confirmar, enviar resposta).
  2. NUNCA re-varredura completa automática sem solicitação explícita.
  3. Atualização incremental por aba: só re-varre uma aba se `force_refresh=True` ou
     se a aba ainda não está no mapa salvo.
  4. Persistência em `portal_structure_maps/<portal_id>.json`.
  5. O mapa é CONTEXTO para o LLM — nunca autoriza ação automática.
"""

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Diretório padrão de saída dos mapas
MAPS_DIR = Path(__file__).resolve().parent / "portal_structure_maps"

# Padrões de texto de botões de AÇÃO que NUNCA devem ser clicados durante o mapeamento
_ACAO_PATTERNS = re.compile(
    r"(salvar|excluir|apagar|deletar|enviar|confirmar|cancelar|sair|deslogar|"
    r"logout|submit|save|delete|send|cancel|remover|fechar|finalizar|encerrar|"
    r"lançar|registrar|gravar|publicar)",
    re.IGNORECASE
)


def _is_action_button(text: str) -> bool:
    """Retorna True se o texto do botão indica uma ação de escrita/risco."""
    return bool(_ACAO_PATTERNS.search(text.strip()))


class PortalStructureMapper:
    """
    Mapeia passivamente a estrutura de cada aba de navegação do portal.

    Parâmetros:
        page: Objeto Playwright Page (ou mock compatível com `.evaluate()`).
        portal_id: Identificador único do portal (ex: 'machado_sandbox').
        maps_dir: Diretório onde os JSONs de estrutura são salvos.
    """

    def __init__(
        self,
        page: Any,
        portal_id: str = "portal_escolar",
        maps_dir: Optional[Path] = None
    ):
        self.page = page
        self.portal_id = portal_id
        self.maps_dir = Path(maps_dir) if maps_dir else MAPS_DIR
        self.maps_dir.mkdir(parents=True, exist_ok=True)
        self._map_path = self.maps_dir / f"{self.portal_id}.json"

    # ──────────────────────────────────────────────────────────────────────────
    # Persistência
    # ──────────────────────────────────────────────────────────────────────────

    def load_existing_map(self) -> Dict[str, Any]:
        """Carrega o mapa persistido em disco. Retorna dict vazio se não existir."""
        if self._map_path.exists():
            try:
                return json.loads(self._map_path.read_text(encoding="utf-8"))
            except Exception:
                return {}
        return {}

    def save_map(self, portal_map: Dict[str, Any]) -> None:
        """Salva o mapa em disco de forma atômica."""
        portal_map["_saved_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        portal_map["_portal_id"] = self.portal_id
        tmp = self._map_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(portal_map, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self._map_path)

    # ──────────────────────────────────────────────────────────────────────────
    # Scraping passivo de uma aba já ativa
    # ──────────────────────────────────────────────────────────────────────────

    async def _read_active_tab_structure(self, tab_name: str) -> Dict[str, Any]:
        """
        Extrai a estrutura do painel ativo (sem clicar em nada de ação).
        Retorna um dicionário descrevendo o tipo de conteúdo e os elementos relevantes.
        """
        dom_script = """
        () => {
            const visivel = (el) => {
                const s = window.getComputedStyle(el);
                return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
            };

            // -- Tabelas --
            const tabelas = Array.from(document.querySelectorAll('table'))
                .filter(visivel)
                .map(t => ({
                    id: t.id || null,
                    cabecalhos: Array.from(t.querySelectorAll('th')).map(th => th.innerText.trim()).filter(Boolean),
                    total_linhas: t.querySelectorAll('tbody tr').length,
                    amostra_primeira_linha: Array.from(
                        (t.querySelector('tbody tr') || document.createElement('tr'))
                        .querySelectorAll('td')
                    ).map(td => td.innerText.trim()).slice(0, 4)
                }));

            // -- Formulários / Inputs --
            const campos = Array.from(document.querySelectorAll('input, textarea, select'))
                .filter(visivel)
                .map(el => ({
                    id: el.id || null,
                    name: el.name || null,
                    tipo: el.tagName.toLowerCase() === 'select' ? 'select' :
                          el.tagName.toLowerCase() === 'textarea' ? 'textarea' : el.type || 'text',
                    placeholder: el.placeholder || null,
                    opcoes: el.tagName.toLowerCase() === 'select'
                        ? Array.from(el.options).map(o => o.text.trim()).filter(Boolean).slice(0, 20)
                        : []
                }));

            // -- Cards (ex: recados) --
            const cards = Array.from(document.querySelectorAll('.recado-card, .card, [class*="card"]'))
                .filter(visivel)
                .slice(0, 10)
                .map(c => ({
                    texto_resumo: c.innerText.trim().substring(0, 120)
                }));

            // -- Botões de leitura/navegação (excluindo ação) --
            const botoes_navegacao = Array.from(document.querySelectorAll('button, .btn, a'))
                .filter(visivel)
                .map(b => ({ id: b.id || null, texto: b.innerText.trim() }))
                .filter(b => b.texto.length > 0 && b.texto.length < 60);

            // -- Títulos e headings da aba --
            const titulos = Array.from(document.querySelectorAll('h1, h2, h3, h4, strong'))
                .filter(visivel)
                .map(h => h.innerText.trim())
                .filter(t => t.length > 2 && t.length < 100)
                .slice(0, 8);

            return { tabelas, campos, cards, botoes_navegacao, titulos };
        }
        """
        try:
            raw = await self.page.evaluate(dom_script)
        except Exception as e:
            return {"erro": f"Falha ao inspecionar DOM: {e}"}

        tabelas = raw.get("tabelas", [])
        campos = raw.get("campos", [])
        cards = raw.get("cards", [])
        titulos = raw.get("titulos", [])
        botoes_raw = raw.get("botoes_navegacao", [])

        # Filtra botões de ação — mapeamento nunca os inclui
        botoes_seguros = [
            b for b in botoes_raw
            if not _is_action_button(b.get("texto", ""))
        ]

        # Classifica tipo de conteúdo dominante
        tipos = []
        if tabelas:
            tipos.append("tabela")
        if campos:
            tipos.append("formulario")
        if cards:
            tipos.append("cards")
        if not tipos:
            tipos.append("texto")

        return {
            "tab_name": tab_name,
            "tipo_conteudo": tipos,
            "titulos": titulos,
            "tabelas": tabelas,
            "campos_formulario": campos,
            "cards": cards,
            "botoes_navegacao_seguros": botoes_seguros,
            "mapeado_em": time.strftime("%Y-%m-%dT%H:%M:%S")
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Navegação passiva e mapeamento completo
    # ──────────────────────────────────────────────────────────────────────────

    async def _get_nav_tabs(self) -> List[Dict[str, str]]:
        """
        Lista todas as abas de navegação disponíveis no portal.
        Retorna lista de {'id': ..., 'texto': ...}.
        """
        tabs_script = """
        () => Array.from(document.querySelectorAll('.tab-btn, [role="tab"], nav a, .nav-link'))
            .map(b => ({ id: b.id || null, texto: b.innerText.trim() }))
            .filter(b => b.texto.length > 0)
        """
        try:
            return await self.page.evaluate(tabs_script)
        except Exception:
            return []

    async def _navigate_to_tab(self, tab_id: str, tab_text: str) -> bool:
        """
        Clica na aba de navegação identificada por id ou texto (somente .tab-btn).
        Aguarda até 1s para o painel renderizar.
        NÃO clica em botões de ação.
        """
        click_script = """
        (args) => {
            const { tab_id, tab_text } = args;
            const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
            const targets = Array.from(document.querySelectorAll('.tab-btn, [role="tab"]'));
            for (const t of targets) {
                if ((tab_id && t.id === tab_id) || norm(t.innerText) === norm(tab_text)) {
                    t.click();
                    return true;
                }
            }
            return false;
        }
        """
        try:
            clicked = await self.page.evaluate(click_script, {"tab_id": tab_id or "", "tab_text": tab_text})
            if clicked:
                await asyncio.sleep(0.5)  # aguarda renderização do painel
            return bool(clicked)
        except Exception:
            return False

    async def map_portal(
        self,
        force_refresh: bool = False,
        delay_between_tabs_s: float = 0.6
    ) -> Dict[str, Any]:
        """
        Mapeia todas as abas de navegação do portal.

        - Se `force_refresh=False` (padrão): apenas abas ainda ausentes no mapa salvo
          são re-varridas (atualização incremental).
        - Se `force_refresh=True`: todas as abas são re-varridas (atualização completa).

        Retorna o mapa completo (mescla de salvo + novas varreduras).
        """
        portal_map = self.load_existing_map() if not force_refresh else {}
        tabs_mapeadas = portal_map.get("tabs", {})

        nav_tabs = await self._get_nav_tabs()
        if not nav_tabs:
            return {
                "portal_id": self.portal_id,
                "erro": "Nenhuma aba de navegação encontrada. Verifique se o portal está carregado.",
                "tabs": {}
            }

        for tab in nav_tabs:
            tab_id = tab.get("id", "")
            tab_texto = tab.get("texto", "")
            tab_key = tab_id or tab_texto.lower().replace(" ", "_")

            # Pula se já mapeada e não forçando atualização
            if tab_key in tabs_mapeadas and not force_refresh:
                continue

            # Navega para a aba
            navegou = await self._navigate_to_tab(tab_id, tab_texto)
            if not navegou:
                tabs_mapeadas[tab_key] = {
                    "tab_name": tab_texto,
                    "erro": "Falha ao navegar para esta aba",
                    "mapeado_em": time.strftime("%Y-%m-%dT%H:%M:%S")
                }
                continue

            # Extrai estrutura passivamente
            estrutura = await self._read_active_tab_structure(tab_texto)
            tabs_mapeadas[tab_key] = estrutura

            await asyncio.sleep(delay_between_tabs_s)

        portal_map = {
            "portal_id": self.portal_id,
            "total_abas": len(tabs_mapeadas),
            "tabs": tabs_mapeadas
        }
        self.save_map(portal_map)
        return portal_map

    async def map_single_tab(self, tab_id: str = "", tab_text: str = "") -> Dict[str, Any]:
        """
        Remapeia uma única aba específica (por id ou texto).
        Útil para atualização incremental após mudança no portal.
        """
        portal_map = self.load_existing_map()
        tabs_mapeadas = portal_map.get("tabs", {})

        navegou = await self._navigate_to_tab(tab_id, tab_text)
        if not navegou:
            return {"erro": f"Não foi possível navegar para a aba '{tab_text or tab_id}'"}

        estrutura = await self._read_active_tab_structure(tab_text or tab_id)
        tab_key = tab_id or (tab_text or "").lower().replace(" ", "_")
        tabs_mapeadas[tab_key] = estrutura

        portal_map["tabs"] = tabs_mapeadas
        portal_map["total_abas"] = len(tabs_mapeadas)
        self.save_map(portal_map)
        return estrutura

    # ──────────────────────────────────────────────────────────────────────────
    # Contexto para o LLM
    # ──────────────────────────────────────────────────────────────────────────

    def build_llm_context_summary(self) -> str:
        """
        Gera um resumo textual compacto do mapa estrutural para injeção no
        system prompt do Loop ReAct — orienta o LLM sem expor dados de alunos.

        Exemplo de saída:
          [Estrutura conhecida do portal]
          - 📋 Diário de Classe: formulario, tabela (6 linhas). Campos: nota_avaliacao, presenca.
          - 📅 Horários: tabela (6 linhas). Cabeçalhos: Horário, Segunda, Terça, Quarta, Quinta, Sexta.
          - 💬 Recados: cards (1 card). Contém botões de resposta.
        """
        portal_map = self.load_existing_map()
        tabs = portal_map.get("tabs", {})
        if not tabs:
            return ""

        linhas = ["[Estrutura conhecida do portal — use para orientar navegação]"]
        for tab_key, info in tabs.items():
            if "erro" in info:
                linhas.append(f"  - {info.get('tab_name', tab_key)}: ⚠️ {info['erro']}")
                continue

            tab_name = info.get("tab_name", tab_key)
            tipos = ", ".join(info.get("tipo_conteudo", ["desconhecido"]))
            detalhes = []

            for t in info.get("tabelas", []):
                cols = ", ".join(t.get("cabecalhos", [])[:6])
                n = t.get("total_linhas", 0)
                detalhes.append(f"tabela '{t.get('id', '?')}' ({n} linhas, colunas: {cols})")

            campos = [c.get("id") or c.get("name") or c.get("tipo") for c in info.get("campos_formulario", []) if c.get("id") or c.get("name")]
            if campos:
                detalhes.append(f"campos: {', '.join(campos[:6])}")

            n_cards = len(info.get("cards", []))
            if n_cards:
                detalhes.append(f"{n_cards} card(s)")

            detalhe_str = "; ".join(detalhes) if detalhes else tipos
            linhas.append(f"  - {tab_name}: {detalhe_str}")

        return "\n".join(linhas)
