"""
test_anti_recursion_stress.py — Teste de Estresse do Anti-Recursion Guard

Cenário obrigatório solicitado para validação de segurança pré-piloto:
1. Tarefa malformada chega ao BrowserHarnessRunner SEM a flag _orchestrated=True.
2. A execução no DiscoveryOrchestrator gera sub-tarefas que DELIBERADAMENTE também não
   possuem a flag _orchestrated propagada (simula falha ou stripping do booleano).
3. O sistema NÃO pode entrar em recursão infinita, travar ou estourar a pilha.
4. O Anti-Recursion Guard (MAX_ORCHESTRATION_DEPTH = 3) deve interromper com erro explícito.
5. O status da tarefa deve ser registrado como 'error' com mensagem 'RecursionDepthExceeded'.
"""

import asyncio
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams
from skill_store import save_skill
from portal_map_store import PortalMapStore
from discovery_orchestrator import DiscoveryOrchestrator, MAX_ORCHESTRATION_DEPTH
from browser_harness_runner import BrowserHarnessRunner


@pytest.fixture
def temp_skills_dir(tmp_path, monkeypatch):
    import skill_store
    monkeypatch.setattr(skill_store, "DEFAULT_SKILLS_DIR", tmp_path / "skills")
    return tmp_path / "skills"


@pytest.mark.asyncio
async def test_stress_malformed_task_strips_orchestrated_flag(temp_skills_dir):
    """
    TESTE DE ESTRESSE 1:
    Simula um loop onde _execute_local_graph SEMPRE remove a flag _orchestrated
    (ou sub-tarefas malformadas são geradas em cadeia sem a flag).
    Garante que o contador de profundidade aborta na profundidade 3 sem loop infinito.
    """
    portal_id = "colegio_estresse.com.br"
    acao = "lancar_nota"

    # Salva skill v1 para disparar Camada 1
    sample_graph = SkillGraph(
        id=f"skill_{portal_id}_{acao}_v1",
        name="Skill Estresse",
        portal_id=portal_id,
        task_id=acao,
        version=1,
        entry_node="checkpoint_0",
        nodes={
            "checkpoint_0": SkillNode(
                id="checkpoint_0",
                type="CHECKPOINT",
                on_success="write_0",
                params=SkillNodeParams()
            ),
            "write_0": SkillNode(
                id="write_0",
                type="WRITE",
                anchor=SkillAnchor(strategy="css_selector", value="input"),
                on_success=None,
                params=SkillNodeParams(action_value="10")
            )
        }
    )
    save_skill(sample_graph, base_dir=temp_skills_dir)

    map_store = PortalMapStore()

    # Contador de chamadas reais ao runner para auditar a cascata
    runner_calls = []

    runner = BrowserHarnessRunner(
        map_store=map_store,
        supabase_client=None
    )

    orchestrator = DiscoveryOrchestrator(
        runner=runner,
        map_store=map_store,
        skills_dir=temp_skills_dir
    )
    runner._orchestrator = orchestrator

    # Deliberadamente corrompe _execute_local_graph para REMOVER _orchestrated
    original_execute_local = orchestrator._execute_local_graph

    async def malformed_execute_local(graph, parametros, depth=0):
        # Simula sub-tarefa malformada: NÃO passa _orchestrated=True
        # mas propaga depth para rastrear a cadeia
        task_mock = {
            "id": f"malformed_subtask_{depth}",
            "status": "drafted",
            "portal": graph.portal_id,
            "action_type": graph.task_id,
            "payload": parametros,
            "_orchestrated": False,  # << FALHA SIMULADA: flag stripped!
            "_orchestration_depth": depth + 1
        }
        runner_calls.append(task_mock["id"])
        res = await runner.process_task(task_mock, {"provider": "local"})
        return {"success": res, "trace": []}

    orchestrator._execute_local_graph = malformed_execute_local

    # Tarefa inicial sem flag _orchestrated
    initial_task = {
        "id": "task_initial_stress",
        "status": "drafted",
        "portal": f"https://{portal_id}",
        "action_type": acao,
        "payload": {"aluno": "Teste", "nota": 10},
        "_orchestrated": False,
        "_orchestration_depth": 0
    }

    t0 = time.time()
    # Executa o processamento que em teoria entraria em loop sem a Camada 2
    success = await runner.process_task(initial_task, {"provider": "local"})
    elapsed = time.time() - t0

    # 1. O sistema deve abortar (success == False) e NÃO travar
    assert success is False
    # 2. O tempo gasto deve ser insignificante (< 1.0s), provando ausência de loop
    assert elapsed < 1.0
    # 3. O número de chamadas ao runner foi estritamente limitado pelo guard (exatamente 3)
    assert len(runner_calls) == MAX_ORCHESTRATION_DEPTH, (
        f"Esperava {MAX_ORCHESTRATION_DEPTH} chamadas antes de abortar, mas teve {len(runner_calls)}: {runner_calls}"
    )


@pytest.mark.asyncio
async def test_direct_orchestrator_depth_boundary():
    """
    TESTE DE ESTRESSE 2:
    Chama diretamente o DiscoveryOrchestrator.execute() já com depth >= MAX_ORCHESTRATION_DEPTH.
    Garante que ele aborta imediatamente antes mesmo de tentar adquirir lock ou tocar motor local.
    """
    map_store = PortalMapStore()
    orchestrator = DiscoveryOrchestrator(map_store=map_store)

    result = await orchestrator.execute(
        portal_id="portal_qualquer",
        acao="qualquer_acao",
        parametros={},
        depth=MAX_ORCHESTRATION_DEPTH  # depth = 3
    )

    assert result["success"] is False
    assert result["engine_used"] == "recursion_guard"
    assert "RecursionDepthExceeded" in result["error"]
    assert "depth=3" in result["error"]


@pytest.mark.asyncio
async def test_runner_depth_boundary_blocks_malformed_task():
    """
    TESTE DE ESTRESSE 3:
    Verifica que o BrowserHarnessRunner.process_task() rejeita autonomamente tarefas
    que chegam com _orchestration_depth >= MAX_ORCHESTRATION_DEPTH, sem invocar o orquestrador.
    """
    runner = BrowserHarnessRunner(supabase_client=None)
    mock_orchestrator = MagicMock()
    mock_orchestrator.execute = AsyncMock()
    runner._orchestrator = mock_orchestrator

    malformed_task = {
        "id": "task_depth_overflow",
        "status": "drafted",
        "portal": "https://escola.gov.br",
        "action_type": "lancar_nota",
        "_orchestrated": False,
        "_orchestration_depth": 3  # Já atingiu o teto
    }

    res = await runner.process_task(malformed_task, {"provider": "local"})

    assert res is False
    mock_orchestrator.execute.assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
