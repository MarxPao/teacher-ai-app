"""
test_iframe_and_pagination_grounding.py — Testes formais de Camada 2 para Iframes e Paginação

Cobre os dois eixos estruturais de generalização entre portais:
- Prioridade 1 (IFRAMES): Busca e escrita recursiva em iframes isolados (portal_mock_iframe.html)
- Prioridade 2 (PAGINAÇÃO): Descoberta e avanço autônomo multi-página (portal_mock_roster.html)
"""

import sys
from pathlib import Path
import pytest
from playwright.async_api import async_playwright

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from browser_use_agent import BrowserUseAgent
from navigation_state_machine import NavigationStateMachine, NavState


@pytest.mark.asyncio
async def test_priority1_iframe_traversal_reading_and_writing():
    """Valida travessia recursiva de frames: leitura, escrita e estado em portais com iframe."""
    sandbox_dir = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox"
    portal_file = sandbox_dir / "portal_mock_iframe.html"
    assert portal_file.exists(), f"Arquivo não encontrado: {portal_file}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(portal_file.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        bu = BrowserUseAgent()
        sm = NavigationStateMachine()

        # 1. State Machine detecta tabela dentro do iframe
        state_res = await sm.detect_current_state(page)
        assert state_res.state == NavState.TABELA_ALVO_ENCONTRADA
        assert state_res.details.get("is_iframe") is True

        # 2. Leitura de roster dentro do iframe
        res_read = await bu.execute_discovery_task({
            "acao": "read_roster",
            "objeto_alvo": "alunos",
            "tipo_operacao": "leitura"
        }, target_page=page)
        assert res_read.sucesso is True
        locate_act = next((a for a in res_read.trace_de_acoes if a.get("action_type") == "LOCATE"), None)
        assert locate_act is not None
        assert locate_act.get("is_iframe") is True
        assert locate_act.get("rows_count") == 4

        # 3. Escrita / localização de campo de aluno dentro do iframe
        res_write = await bu.execute_discovery_task({
            "acao": "lancar_nota",
            "objeto_alvo": "nota",
            "aluno": "Ana Júlia Santos",
            "valor": "9.5",
            "tipo_operacao": "escrita"
        }, target_page=page)
        assert res_write.sucesso is True
        write_act = next((a for a in res_write.trace_de_acoes if a.get("action_type") == "WRITE"), None)
        assert write_act is not None
        assert write_act.get("is_iframe") is True
        assert write_act.get("selector") == "#nota_1"

        # 4. Botão de submit na página host é mapeado
        submit_act = next((a for a in res_write.trace_de_acoes if a.get("is_submit_action")), None)
        assert submit_act is not None

        await browser.close()


@pytest.mark.asyncio
async def test_priority2_live_pagination_discovery():
    """Valida paginação ao vivo: totalização de lista e busca de aluno na página 2."""
    sandbox_dir = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox"
    portal_file = sandbox_dir / "portal_mock_roster.html"
    assert portal_file.exists(), f"Arquivo não encontrado: {portal_file}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(portal_file.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        bu = BrowserUseAgent()

        # 1. Leitura geral de roster: avança as páginas e acumula 13 alunos (8 pág 1 + 5 pág 2)
        res_roster = await bu.execute_discovery_task({
            "acao": "read_roster",
            "objeto_alvo": "alunos",
            "tipo_operacao": "leitura"
        }, target_page=page)
        assert res_roster.sucesso is True
        pag_act = next((a for a in res_roster.trace_de_acoes if a.get("action_type") == "PAGINATE"), None)
        assert pag_act is not None
        assert pag_act.get("total_records") == 13
        assert pag_act.get("total_pages") == 2

        # Retorna para página inicial para testar busca de aluno
        await page.goto(portal_file.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        # 2. Busca de aluna na página 2 (Mariana Costa Teixeira): avança paginação e extrai status
        res_aluno = await bu.execute_discovery_task({
            "acao": "consultar_aluno",
            "objeto_alvo": "situacao",
            "aluno": "Mariana Costa Teixeira",
            "tipo_operacao": "leitura"
        }, target_page=page)
        assert res_aluno.sucesso is True
        read_act = next((a for a in res_aluno.trace_de_acoes if a.get("action_type") == "READ"), None)
        assert read_act is not None
        assert read_act.get("value") == "Cursando"

        # Confirma que houve avanço de página no trace
        click_acts = [a for a in res_aluno.trace_de_acoes if a.get("action_type") == "CLICK"]
        assert len(click_acts) >= 1
        assert any("página 2" in a.get("description", "").lower() for a in click_acts)

        await browser.close()