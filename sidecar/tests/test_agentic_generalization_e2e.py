"""
sidecar/tests/test_agentic_generalization_e2e.py — Teste de Generalização com Tarefa de 3 Passos Inédita
Valida que o Loop ReAct resolve uma tarefa de múltiplos passos inédita (Arquivos -> Seleção de Turma -> Configurações)
emitindo mensagens de progresso dinâmicas por turno.
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
async def test_unprecedented_3step_generalization_task():
    assert PORTAL_MOCK_PATH.exists()

    progress_events = []
    def on_progress(p):
        progress_events.append(p)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(PORTAL_MOCK_PATH.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        loop = AgenticExecutionLoop(
            page=page,
            portal_id="mock_portal"
        )

        goal = "navegue para a aba arquivos, selecione a turma 7º Ano A e abra as configurações"
        result = await loop.run_loop(goal, max_turns=6, on_progress=on_progress)

        assert result["success"] is True
        assert result["status"] == "completed"
        assert result["turns_count"] >= 3

        # Valida mutações reais no DOM
        filtro_val = await page.locator("#filtro_turma_arquivos").input_value()
        assert filtro_val == "7", f"Filtro de turma esperado '7', obtido '{filtro_val}'"

        active_tab = await page.locator(".tab-btn.active").inner_text()
        assert "Configurações" in active_tab or "config" in active_tab.lower()

        # Valida que as mensagens de progresso foram emitidas por turno
        assert len(progress_events) >= 4
        assert any("Isso pode levar um minutinho" in p.get("message", "") for p in progress_events)
        assert any("arquivos" in p.get("message", "").lower() for p in progress_events)
        assert any("7º Ano A" in p.get("message", "") or "Opção '7'" in p.get("message", "") for p in progress_events)

        await browser.close()
