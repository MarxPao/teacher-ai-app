"""
sidecar/tests/test_agentic_data_reading_e2e.py — Testes E2E de Leitura e Síntese de Dados Estruturados

Valida a 9ª ferramenta do Loop ReAct (answer_from_screen_data) e o snapshot tabular de tela:
1. Caso 1 (Screenshot/Horários): "vá em horários e liste os dias e horários que tenho aula"
   - Navega para a aba de Horários no Turno 1.
   - Reconhece a tabela no Turno 2 e sintetiza os horários das aulas sem procurar botões.
2. Caso 2 (Generalização Inédita): "quais alunos estão com nota igual ou superior a 9 nesta turma"
   - Lê a tabela de notas já visível na tela inicial no Turno 1 sem navegação desnecessária.
   - Responde com Ana Júlia Santos e Mariana Lima diretamente via answer_from_screen_data.
"""

import asyncio
import sys
from pathlib import Path
import pytest
from playwright.async_api import async_playwright

_sidecar_dir = str(Path(__file__).resolve().parent.parent)
if _sidecar_dir not in sys.path:
    sys.path.insert(0, _sidecar_dir)

try:
    from agentic_execution_loop import AgenticExecutionLoop
except ImportError:
    from sidecar.agentic_execution_loop import AgenticExecutionLoop

PORTAL_MOCK_PATH = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"


@pytest.mark.asyncio
async def test_read_current_screen_captures_tabular_data():
    """Valida que read_current_screen extrai tabelas, cabeçalhos e células com fidelidade."""
    assert PORTAL_MOCK_PATH.exists()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(PORTAL_MOCK_PATH.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        loop = AgenticExecutionLoop(page=page, portal_id="mock_portal")
        screen = await loop.read_current_screen()

        assert "tables" in screen, "Campo 'tables' não encontrado no snapshot de tela."
        assert len(screen["tables"]) >= 1

        grades_table = next((t for t in screen["tables"] if t["id"] == "grades_table"), None)
        assert grades_table is not None, "Tabela 'grades_table' não capturada."
        assert any("Nome do Aluno" in h for h in grades_table["headers"])
        assert len(grades_table["rows"]) == 7

        # Valida que as notas dos alunos foram extraídas das inputs
        first_row = grades_table["rows"][0]
        assert "Ana Júlia Santos" in first_row
        assert "9.0" in first_row

        await browser.close()


@pytest.mark.asyncio
async def test_react_loop_reading_horarios_e2e():
    """Caso 1: Navega para Horários e sintetiza os horários semanais via answer_from_screen_data."""
    assert PORTAL_MOCK_PATH.exists()

    progress_events = []
    def on_progress(p):
        progress_events.append(p)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(PORTAL_MOCK_PATH.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        loop = AgenticExecutionLoop(page=page, portal_id="mock_portal")

        goal = "vá em horários e liste os dias e horários que tenho aula"
        result = await loop.run_loop(goal, max_turns=4, on_progress=on_progress)

        assert result["success"] is True
        assert result["status"] == "completed"
        assert result["turns_count"] == 2, f"Esperado exatamente 2 turnos (navegar + sintetizar), obtido {result['turns_count']}"

        # Turno 1 deve ter sido navegação
        turn_1 = result["turns"][0]
        assert turn_1["tool"] == "navigate_to_tab"
        nav_target = turn_1["args"].get("nome_da_aba", "").lower()
        assert "horário" in nav_target or "horario" in nav_target

        # Turno 2 deve ter sido answer_from_screen_data
        turn_2 = result["turns"][1]
        assert turn_2["tool"] == "answer_from_screen_data"
        answer = turn_2["args"].get("resposta", "").lower() or result["summary"].lower()

        # Confirma que os dados da tabela foram sintetizados corretamente
        assert "quarta" in answer
        assert "quinta" in answer
        assert "sexta" in answer

        # Valida DOM do portal
        active_tab = await page.locator(".tab-btn.active").inner_text()
        assert "Horários" in active_tab or "horario" in active_tab.lower()
        assert await page.locator("#pane-horarios").is_visible() is True

        await browser.close()


@pytest.mark.asyncio
async def test_react_loop_generalization_query_grades_without_navigation_e2e():
    """Caso 2 (Generalização): Consulta sobre dados já visíveis na tela inicial sem navegação."""
    assert PORTAL_MOCK_PATH.exists()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(PORTAL_MOCK_PATH.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        loop = AgenticExecutionLoop(page=page, portal_id="mock_portal")

        goal = "quais alunos estão com nota igual ou superior a 9 nesta turma"
        result = await loop.run_loop(goal, max_turns=3)

        assert result["success"] is True
        assert result["status"] == "completed"
        # Deve resolver no Turno 1 pois os dados já estão visíveis na tela
        assert result["turns_count"] == 1, f"Deveria sintetizar no 1º turno sem navegação inútil, levou {result['turns_count']}"

        turn_1 = result["turns"][0]
        assert turn_1["tool"] == "answer_from_screen_data"

        answer = turn_1["args"].get("resposta", "") or result["summary"]
        # Ana Júlia Santos tem 9.0 e Mariana Lima tem 9.5
        assert "Ana Júlia" in answer or "Ana Julia" in answer or "Ana" in answer
        assert "Mariana" in answer

        await browser.close()
