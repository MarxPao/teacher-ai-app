"""
sidecar/tests/test_learning_engine.py — Testes Unitários do Motor de Auto-Desenvolvimento e Aprendizado Contínuo
"""

import pytest
import sys
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from learning_engine import LearningEngine
from supabase_memory_client import SupabaseMemoryClient


class MockBrowserPage:
    """Mock assíncrono para simular páginas de navegador."""

    def __init__(self, url="https://machadosobrinho.paineldoaluno.com.br/professor_horarios"):
        self.url = url
        self.evaluate = AsyncMock(return_value={"success": True})
        self.goto = AsyncMock(return_value=None)


@pytest.mark.asyncio
async def test_fast_path_execution_success(monkeypatch, tmp_path):
    """Quando existe um pathway com alta confiança, deve executar diretamente via Fast-Path."""
    engine = LearningEngine()
    mock_memory = SupabaseMemoryClient()

    # Prepara pathway compilado com 95% de confiança
    pathway = {
        "id": "path_mock_test_fast",
        "portal_id": "mock_portal",
        "intent": "view_schedule",
        "title": "Ver Grade Rápida",
        "confidence_score": 0.95,
        "status": "compiled"
    }
    steps = [
        {"step_order": 1, "action_type": "CLICK", "primary_selector": "button#ok"}
    ]
    mock_memory.save_compiled_pathway(pathway, steps)
    monkeypatch.setattr(engine, "memory", mock_memory)

    mock_page = MockBrowserPage()
    res = await engine.execute_or_learn(
        portal_id="mock_portal",
        intent="view_schedule",
        goal="Ver grade",
        page=mock_page
    )

    assert res["sucesso"] is True
    assert res["mode"] == "compiled_fast_path"
    assert res["pathway_id"] == "path_mock_test_fast"


@pytest.mark.asyncio
async def test_auto_healing_triggers_on_fast_path_failure(monkeypatch, tmp_path):
    """Quando o Fast-Path falha (ex: seletor quebrou), deve acionar Auto-Cura e compilar nova rota."""
    engine = LearningEngine()
    mock_memory = SupabaseMemoryClient()

    # Pathway com seletor que vai quebrar
    broken_pathway = {
        "id": "path_mock_broken",
        "portal_id": "broken_portal",
        "intent": "fill_grade",
        "title": "Lançar Nota Quebrada",
        "confidence_score": 0.85,
        "status": "compiled"
    }
    steps = [
        {"step_order": 1, "action_type": "CLICK", "primary_selector": "#broken_selector_not_found"}
    ]
    mock_memory.save_compiled_pathway(broken_pathway, steps)
    monkeypatch.setattr(engine, "memory", mock_memory)

    # Simula página onde o seletor falha
    mock_page = MockBrowserPage()
    mock_page.evaluate = AsyncMock(return_value={"success": False, "error": "Element not found"})

    res = await engine.execute_or_learn(
        portal_id="broken_portal",
        intent="fill_grade",
        goal="Lançar nota 9 pro Hugo",
        page=mock_page
    )

    # Deve ter se curado via modo auto_healing_ppav
    assert res["sucesso"] is True
    assert res["mode"] == "auto_healing_ppav"
    assert res["compiled_pathway_id"] is not None

    # Verifica se a nova rota foi salva no Supabase/cache
    new_best = mock_memory.get_best_pathway("broken_portal", "fill_grade")
    assert new_best is not None
    assert new_best["id"] == res["compiled_pathway_id"]


@pytest.mark.asyncio
async def test_anti_loop_guard_aborts_storm():
    try:
        from settler import universal_settler
    except ImportError:
        from sidecar.settler import universal_settler
    universal_settler.loop_guard.reset()
    engine = LearningEngine()
    
    class LoopingPage:
        def __init__(self):
            self.count = 0
            self.urls = [
                "https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto",
                "https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto/filial",
                "https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto/academico",
                "https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto/carregar-parametros",
                "https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto"
            ]
        def url(self):
            u = self.urls[self.count % len(self.urls)]
            self.count += 1
            return u

    page = LoopingPage()
    
    # Simula as 4 transições rápidas anteriores ocorridas no portal em milissegundos
    for _ in range(4):
        universal_settler.loop_guard.record_transition(page.url())

    # A 5ª transição é capturada imediatamente pelo execute_or_learn
    res = await engine.execute_or_learn("santacatarina", "login", "Acessar notas", page)

    assert res is not None
    assert res["sucesso"] is False
    assert res["error"] == "INFINITE_REDIRECT_LOOP_DETECTED"
    assert "recovery_script" in res

