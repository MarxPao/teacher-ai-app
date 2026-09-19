"""
sidecar/tests/test_supabase_memory.py — Testes Unitários da Camada de Memória Supabase (Local-First)
"""

import pytest
import os
import sys
import time
import json
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from supabase_memory_client import SupabaseMemoryClient, CACHE_DIR


@pytest.fixture
def test_memory_client(tmp_path):
    """Instancia um cliente de memória apontando para diretório temporário isolado."""
    client = SupabaseMemoryClient()
    # Redireciona cache para tmp_path
    client.pathways_cache_file = tmp_path / "pathways_cache.json"
    client.anti_patterns_cache_file = tmp_path / "anti_patterns_cache.json"
    client.episodes_cache_file = tmp_path / "episodes_cache.json"

    with open(client.pathways_cache_file, "w", encoding="utf-8") as f:
        json.dump({}, f)
    with open(client.anti_patterns_cache_file, "w", encoding="utf-8") as f:
        json.dump([], f)
    with open(client.episodes_cache_file, "w", encoding="utf-8") as f:
        json.dump([], f)

    # Monkeypatch nos métodos de leitura/escrita do client para usar tmp_path
    import supabase_memory_client
    orig_pathways = supabase_memory_client.PATHWAYS_CACHE_FILE
    orig_anti = supabase_memory_client.ANTI_PATTERNS_CACHE_FILE
    orig_ep = supabase_memory_client.EPISODES_CACHE_FILE

    supabase_memory_client.PATHWAYS_CACHE_FILE = client.pathways_cache_file
    supabase_memory_client.ANTI_PATTERNS_CACHE_FILE = client.anti_patterns_cache_file
    supabase_memory_client.EPISODES_CACHE_FILE = client.episodes_cache_file

    yield client

    supabase_memory_client.PATHWAYS_CACHE_FILE = orig_pathways
    supabase_memory_client.ANTI_PATTERNS_CACHE_FILE = orig_anti
    supabase_memory_client.EPISODES_CACHE_FILE = orig_ep


class TestSupabaseMemory:

    def test_save_and_retrieve_best_pathway(self, test_memory_client):
        pathway_data = {
            "id": "path_test_view_grades",
            "portal_id": "test_portal",
            "intent": "view_grades",
            "title": "Ver Notas",
            "confidence_score": 0.95,
            "status": "compiled"
        }
        steps = [
            {"step_order": 1, "action_type": "NAVIGATE", "primary_selector": None, "anchor_value": "https://portal.com/notas"},
            {"step_order": 2, "action_type": "READ_DATA", "primary_selector": "table", "anchor_value": "tabela_notas"}
        ]

        saved = test_memory_client.save_compiled_pathway(pathway_data, steps)
        assert saved["id"] == "path_test_view_grades"
        assert len(saved["steps"]) == 2

        # Recupera melhor pathway
        best = test_memory_client.get_best_pathway("test_portal", "view_grades")
        assert best is not None
        assert best["id"] == "path_test_view_grades"
        assert best["confidence_score"] == 0.95
        assert len(best["steps"]) == 2

    def test_bayesian_confidence_reinforcement(self, test_memory_client):
        """Valida que acertos aumentam a confiança e erros diminuem."""
        pathway_data = {
            "id": "path_reinforcement_test",
            "portal_id": "test_portal",
            "intent": "fill_attendance",
            "confidence_score": 0.80,
            "status": "compiled"
        }
        test_memory_client.save_compiled_pathway(pathway_data, [])

        # 1. Episódio de Sucesso (Recompensa = 1.0)
        # Novo Q = 0.80 + 0.15 * (1.0 - 0.80) = 0.83
        ep_success = {
            "portal_id": "test_portal",
            "intent": "fill_attendance",
            "pathway_id": "path_reinforcement_test",
            "outcome": "SUCCESS"
        }
        test_memory_client.record_episode(ep_success)

        updated = test_memory_client.get_best_pathway("test_portal", "fill_attendance")
        assert updated["confidence_score"] == 0.83
        assert updated["successful_runs"] == 1
        assert updated["total_runs"] == 1

        # 2. Episódio de Erro (Recompensa = 0.0)
        # Novo Q = 0.83 + 0.15 * (0.0 - 0.83) = 0.71
        ep_fail = {
            "portal_id": "test_portal",
            "intent": "fill_attendance",
            "pathway_id": "path_reinforcement_test",
            "outcome": "ERROR",
            "error_reason": "Botão salvar não respondeu"
        }
        test_memory_client.record_episode(ep_fail)

        updated2 = test_memory_client.get_best_pathway("test_portal", "fill_attendance")
        assert updated2["confidence_score"] == 0.71
        assert updated2["failed_runs"] == 1
        assert updated2["total_runs"] == 2

    def test_record_and_get_anti_patterns(self, test_memory_client):
        """Valida gravação e consulta de memória negativa."""
        anti = test_memory_client.record_anti_pattern(
            portal_id="machado",
            intent="view_schedule",
            avoid_action={"type": "CLICK", "target": "#btn_print"},
            reason="Botão abre diálogo nativo de impressão que trava o navegador",
            recommended_alternative="Extrair os dados da tabela diretamente sem imprimir"
        )
        assert anti["id"].startswith("anti_machado_")

        anti_list = test_memory_client.get_anti_patterns("machado", "view_schedule")
        assert len(anti_list) >= 1
        assert any("impressão" in a["reason"] for a in anti_list)
