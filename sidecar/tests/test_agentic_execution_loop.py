"""
sidecar/tests/test_agentic_execution_loop.py — Testes Unitários e de Integração do Loop ReAct Agêntico
"""

import asyncio
import json
import sys
from pathlib import Path
import pytest
from playwright.async_api import async_playwright

_sidecar_dir = str(Path(__file__).resolve().parent.parent)
if _sidecar_dir not in sys.path:
    sys.path.insert(0, _sidecar_dir)

try:
    from agentic_execution_loop import AgenticExecutionLoop, TOOL_DEFINITIONS, SYSTEM_PROMPT_REACT
    from skill_store import load_skill
except ImportError:
    from sidecar.agentic_execution_loop import AgenticExecutionLoop, TOOL_DEFINITIONS, SYSTEM_PROMPT_REACT
    from sidecar.skill_store import load_skill

PORTAL_MOCK_PATH = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"


def test_tool_definitions_has_all_9_tools():
    names = [t["name"] for t in TOOL_DEFINITIONS]
    expected = [
        "navigate_to_tab",
        "read_current_screen",
        "find_item_in_list",
        "select_option",
        "click_element",
        "fill_field",
        "ask_clarification",
        "answer_from_screen_data",
        "finish_task"
    ]
    for exp in expected:
        assert exp in names, f"Ferramenta '{exp}' ausente nas definições de tools."
    assert len(names) == 9


def test_system_prompt_react_guidelines():
    for tool_name in ["navigate_to_tab", "finish_task", "ask_clarification", "select_option", "answer_from_screen_data"]:
        assert tool_name in SYSTEM_PROMPT_REACT


@pytest.mark.asyncio
async def test_react_loop_abrir_arquivos_e_selecionar_sexto_ano(tmp_path):
    assert PORTAL_MOCK_PATH.exists()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(PORTAL_MOCK_PATH.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        # Mock LLM Caller determinístico para validar o fluxo de 3 turnos
        def mock_llm_caller(prompt: str):
            if "Nenhuma ação tomada" in prompt:
                # Turno 1: Precisa navegar para Arquivos
                return {
                    "pensamento": "Para abrir arquivos, primeiro preciso navegar até a aba Arquivos.",
                    "tool": "navigate_to_tab",
                    "args": {"nome_da_aba": "arquivos"}
                }
            elif "navigate_to_tab" in prompt and "select_option" not in prompt:
                # Turno 2: Selecionar sexto ano no dropdown
                return {
                    "pensamento": "Agora na aba Arquivos, preciso alterar o filtro para o sexto ano.",
                    "tool": "select_option",
                    "args": {"campo": "filtro_turma_arquivos", "valor": "sexto ano"}
                }
            else:
                # Turno 3: Finalizar
                return {
                    "pensamento": "Aba Arquivos aberta e sexto ano selecionado com sucesso.",
                    "tool": "finish_task",
                    "args": {"resumo": "Arquivos abertos e turma de 6º ano selecionada."}
                }

        loop = AgenticExecutionLoop(
            page=page,
            portal_id="mock_portal",
            custom_llm_caller=mock_llm_caller,
            skills_dir=tmp_path
        )

        result = await loop.run_loop("abrir arquivos e selecionar sexto ano")

        assert result["success"] is True
        assert result["status"] == "completed"
        assert result["turns_count"] == 3
        assert "6º ano" in result["summary"] or "sexto ano" in result["summary"].lower()

        # Valida que o DOM mudou de verdade
        pane_arquivos = page.locator("#pane-arquivos")
        assert await pane_arquivos.is_visible() is True

        filtro_val = await page.locator("#filtro_turma_arquivos").input_value()
        assert filtro_val == "6"

        # Valida compilação do SkillGraph
        assert result["compiled_skill_id"] is not None
        task_id = result["compiled_skill_id"].split("__")[1]
        saved_skill = load_skill("mock_portal", task_id, base_dir=tmp_path)
        assert saved_skill.portal_id == "mock_portal"
        assert len(saved_skill.nodes) >= 2

        await browser.close()


@pytest.mark.asyncio
async def test_react_loop_abrir_recados_e_responder_mae(tmp_path):
    assert PORTAL_MOCK_PATH.exists()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(PORTAL_MOCK_PATH.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        def mock_llm_caller(prompt: str):
            if "Nenhuma ação tomada" in prompt:
                # Turno 1: Navegar para Recados
                return {
                    "pensamento": "Preciso abrir a aba Recados para ver a mensagem da mãe.",
                    "tool": "navigate_to_tab",
                    "args": {"nome_da_aba": "recados"}
                }
            elif "navigate_to_tab" in prompt and "clicado" not in prompt:
                # Turno 2: Clicar para abrir o campo de responder
                return {
                    "pensamento": "Localizei o recado da mãe do aluno. Preciso clicar no botão para responder.",
                    "tool": "click_element",
                    "args": {"descricao": "Responder à mãe do aluno"}
                }
            else:
                # Turno 3: Parar e pedir esclarecimento honesto pois o texto da mensagem não foi dado
                return {
                    "pensamento": "O campo de resposta está aberto, mas não sei o que a professora deseja responder.",
                    "tool": "ask_clarification",
                    "args": {"pergunta": "Qual mensagem devo enviar como resposta à mãe do aluno Hugo?"}
                }

        loop = AgenticExecutionLoop(
            page=page,
            portal_id="mock_portal",
            custom_llm_caller=mock_llm_caller,
            skills_dir=tmp_path
        )

        result = await loop.run_loop("abrir recados e responder à mãe do aluno")

        assert result["success"] is False
        assert result["status"] == "paused_for_clarification"
        assert result["turns_count"] == 3
        assert "Qual mensagem devo enviar" in result["summary"]

        # Valida que o DOM mudou de verdade
        pane_recados = page.locator("#pane-recados")
        assert await pane_recados.is_visible() is True

        form_resp = page.locator("#form-resposta-hugo")
        assert await form_resp.is_visible() is True

        await browser.close()


def test_pii_detection_per_turn():
    loop = AgenticExecutionLoop(page=None)
    assert loop._contains_pii("lançar nota 8 para o Hugo") is True
    assert loop._contains_pii("abrir arquivos de planejamento") is False
    assert loop._contains_pii("aluno Mariana com falta") is True
    assert loop._contains_pii("navegar para aba de configurações") is False


# ─── PARTE 3: Auditoria de Cobertura de Ferramentas ─────────────────────────

@pytest.mark.asyncio
async def test_fill_field_marca_checkbox():
    """fill_field com valor 'sim' deve marcar checkbox e relatar 'marcado ✓'."""
    from unittest.mock import AsyncMock, MagicMock

    page = MagicMock()
    # Simula o retorno do evaluate para um checkbox marcado com sucesso
    page.evaluate = AsyncMock(return_value={"success": True, "id": "ch_presenca", "tipo": "checkbox", "checked": True})

    loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=lambda x: {})
    res = await loop.execute_tool("fill_field", {"campo": "presenca", "valor": "sim"})

    assert res["success"] is True, f"Esperado sucesso, obteve: {res}"
    assert "marcado ✓" in res["output"]


@pytest.mark.asyncio
async def test_fill_field_desmarca_checkbox():
    """fill_field com valor 'não' deve desmarcar checkbox e relatar 'desmarcado ☐'."""
    from unittest.mock import AsyncMock, MagicMock

    page = MagicMock()
    page.evaluate = AsyncMock(return_value={"success": True, "id": "ch_falta", "tipo": "checkbox", "checked": False})

    loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=lambda x: {})
    res = await loop.execute_tool("fill_field", {"campo": "falta", "valor": "não"})

    assert res["success"] is True
    assert "desmarcado ☐" in res["output"]


@pytest.mark.asyncio
async def test_fill_field_seleciona_radio():
    """fill_field deve relatar sucesso ao selecionar radio button."""
    from unittest.mock import AsyncMock, MagicMock

    page = MagicMock()
    page.evaluate = AsyncMock(return_value={"success": True, "id": "r2", "tipo": "radio", "value": "tarde"})

    loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=lambda x: {})
    res = await loop.execute_tool("fill_field", {"campo": "turno", "valor": "tarde"})

    assert res["success"] is True
    assert "tarde" in res["output"] or "Campo" in res["output"]  # output confirma o valor


@pytest.mark.asyncio
async def test_fill_field_file_upload_retorna_mensagem_clara():
    """fill_field com input[type=file] deve retornar success=False e mensagem clara de limitação."""
    from unittest.mock import AsyncMock, MagicMock

    page = MagicMock()
    page.evaluate = AsyncMock(return_value={"success": False, "motivo": "file_upload_not_supported"})

    loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=lambda x: {})
    res = await loop.execute_tool("fill_field", {"campo": "upload_arquivo", "valor": "relatorio.pdf"})

    assert res["success"] is False
    assert "upload de arquivo" in res["output"].lower()
    assert "intervenção manual" in res["output"]


def test_fill_field_descricao_menciona_checkbox_e_radio():
    """A definição de fill_field no TOOL_DEFINITIONS deve mencionar checkbox e radio."""
    fill_def = next(t for t in TOOL_DEFINITIONS if t["name"] == "fill_field")
    desc = fill_def["description"].lower()
    assert "checkbox" in desc
    assert "radio" in desc
    assert "file" in desc or "upload" in desc
