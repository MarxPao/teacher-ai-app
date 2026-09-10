"""
test_end_to_end_orchestration.py — Teste de Integração Ponta-a-Ponta da Etapa 4

Valida a conexão do DiscoveryOrchestrator ao loop de processamento do BrowserHarnessRunner:
1. Tarefa recebida com status='drafted' é roteada pelo DiscoveryOrchestrator.execute().
2. Nível 1 (Motor Local): SkillGraph existente e sem drift executa o preenchimento sem custos.
3. Nível 2 (Browser-use): Sem mapa ou com drift, escala para Browser-use, compila vN+1 e preenche.
4. Nível 3 (Skyvern Fallback): Se Browser-use tiver baixa confiança, escala para Skyvern visual,
   compila vN+1 com checkpoint obrigatório e preenche.
5. Verificação anti-looping: tarefas com _orchestrated=True não re-disparam o orchestrator.
"""

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams
from skill_store import save_skill
from portal_map_store import PortalMapStore
from browser_use_agent import BrowserUseAgent, BrowserUseTaskResult
from skyvern_fallback import SkyvernFallbackClient, SkyvernTaskResult
from discovery_orchestrator import DiscoveryOrchestrator
from browser_harness_runner import BrowserHarnessRunner


@pytest.fixture
def temp_skills_dir(tmp_path, monkeypatch):
    import skill_store
    monkeypatch.setattr(skill_store, "DEFAULT_SKILLS_DIR", tmp_path / "skills")
    return tmp_path / "skills"


@pytest.mark.asyncio
async def test_e2e_orchestrator_level_1_local_motor(temp_skills_dir):
    """
    E2E Nível 1: Tarefa no portal conhecido com skill já gravada roda no Motor Local
    sem acionar agentes de IA externos (custo zero).
    """
    portal_id = "colegio_machado.com.br"
    acao = "lancar_nota"

    # 1. Salva skill prévia v1
    sample_graph = SkillGraph(
        id=f"skill_{portal_id}_{acao}_v1",
        name="Lançar Nota Teste",
        portal_id=portal_id,
        task_id=acao,
        version=1,
        entry_node="checkpoint_0",
        nodes={
            "checkpoint_0": SkillNode(
                id="checkpoint_0",
                type="CHECKPOINT",
                on_success="write_0",
                params=SkillNodeParams(condition="requires_human_confirmation")
            ),
            "write_0": SkillNode(
                id="write_0",
                type="WRITE",
                anchor=SkillAnchor(strategy="css_selector", value="input.nota"),
                on_success=None,
                params=SkillNodeParams(action_value="10")
            )
        }
    )
    save_skill(sample_graph, base_dir=temp_skills_dir)

    map_store = PortalMapStore()
    bu_agent = BrowserUseAgent()
    bu_agent.execute_discovery_task = AsyncMock()
    sky_client = SkyvernFallbackClient()
    sky_client.execute_visual_task = AsyncMock()

    runner = BrowserHarnessRunner(
        map_store=map_store,
        supabase_client=None
    )
    runner._handle_draft_phase = AsyncMock(return_value=True)

    orchestrator = DiscoveryOrchestrator(
        runner=runner,
        map_store=map_store,
        browser_use_agent=bu_agent,
        skyvern_client=sky_client,
        skills_dir=temp_skills_dir
    )
    runner._orchestrator = orchestrator

    task = {
        "id": "task_e2e_001",
        "status": "drafted",
        "portal": f"https://{portal_id}",
        "action_type": acao,
        "payload": {"aluno": "Lucas", "nota": 9.0}
    }

    success = await runner.process_task(task, {"provider": "groq"})

    assert success is True
    bu_agent.execute_discovery_task.assert_not_awaited()
    sky_client.execute_visual_task.assert_not_awaited()
    assert runner._handle_draft_phase.await_count >= 1


@pytest.mark.asyncio
async def test_e2e_orchestrator_level_2_browser_use_escalation(temp_skills_dir):
    """
    E2E Nível 2: Portal novo ou com drift ativa o Browser-use.
    Ao concluir com sucesso, compila SkillGraph v1 com CHECKPOINT obrigatório e executa draft.
    """
    portal_id = "portal_novo_educ.com.br"
    acao = "lancar_nota"

    map_store = PortalMapStore()
    bu_agent = BrowserUseAgent()
    bu_agent.execute_discovery_task = AsyncMock(return_value=BrowserUseTaskResult(
        sucesso=True,
        confianca=0.95,
        trace_de_acoes=[
            {"action_type": "NAVIGATE", "url": f"https://{portal_id}/notas"},
            {"action_type": "LOCATE", "selector": "table.roster", "semantic_role": "table"},
            {"action_type": "WRITE", "selector": "input.grade", "value": "10.0"}
        ],
        execution_time_seconds=1.5
    ))

    sky_client = SkyvernFallbackClient()
    sky_client.execute_visual_task = AsyncMock()

    runner = BrowserHarnessRunner(
        map_store=map_store,
        supabase_client=None
    )
    runner._handle_draft_phase = AsyncMock(return_value=True)

    orchestrator = DiscoveryOrchestrator(
        runner=runner,
        map_store=map_store,
        browser_use_agent=bu_agent,
        skyvern_client=sky_client,
        skills_dir=temp_skills_dir
    )
    runner._orchestrator = orchestrator

    task = {
        "id": "task_e2e_002",
        "status": "drafted",
        "portal": f"https://{portal_id}",
        "action_type": acao,
        "payload": {"aluno": "Beatriz", "nota": 10.0}
    }

    success = await runner.process_task(task, {"provider": "groq"})

    assert success is True
    bu_agent.execute_discovery_task.assert_awaited_once()
    sky_client.execute_visual_task.assert_not_awaited()
    # Confirma que draft foi acionado após gravação do grafo
    runner._handle_draft_phase.assert_awaited_once()


@pytest.mark.asyncio
async def test_e2e_orchestrator_level_3_skyvern_fallback(temp_skills_dir):
    """
    E2E Nível 3: Browser-use retorna baixa confiança -> escalona para Skyvern visual ->
    compila SkillGraph com CHECKPOINT obrigatório e preenche no DOM.
    """
    portal_id = "portal_complexo_canvas.com.br"
    acao = "lancar_nota"

    map_store = PortalMapStore()
    bu_agent = BrowserUseAgent()
    # Browser-use falha ou fica abaixo do threshold (0.7)
    bu_agent.execute_discovery_task = AsyncMock(return_value=BrowserUseTaskResult(
        sucesso=False,
        confianca=0.3,
        trace_de_acoes=[],
        requires_escalation=True,
        erro="DOM ofuscado por Web Components customizados"
    ))

    sky_client = SkyvernFallbackClient()
    sky_client.execute_visual_task = AsyncMock(return_value=SkyvernTaskResult(
        sucesso=True,
        confianca=0.98,
        trace_de_acoes=[
            {"action_type": "NAVIGATE", "url": f"https://{portal_id}/notas"},
            {"action_type": "WRITE", "selector": "#shadow-host-input", "value": "8.5"}
        ],
        execution_time_seconds=4.2
    ))

    runner = BrowserHarnessRunner(
        map_store=map_store,
        supabase_client=None
    )
    runner._handle_draft_phase = AsyncMock(return_value=True)

    orchestrator = DiscoveryOrchestrator(
        runner=runner,
        map_store=map_store,
        browser_use_agent=bu_agent,
        skyvern_client=sky_client,
        skills_dir=temp_skills_dir
    )
    runner._orchestrator = orchestrator

    task = {
        "id": "task_e2e_003",
        "status": "drafted",
        "portal": f"https://{portal_id}",
        "action_type": acao,
        "payload": {"aluno": "Thiago", "nota": 8.5}
    }

    success = await runner.process_task(task, {"provider": "groq"})

    assert success is True
    bu_agent.execute_discovery_task.assert_awaited_once()
    sky_client.execute_visual_task.assert_awaited_once()
    runner._handle_draft_phase.assert_awaited_once()


@pytest.mark.asyncio
async def test_anti_recursion_guard():
    """Garante que tarefas marcadas com _orchestrated=True executam direto sem looping infinito."""
    runner = BrowserHarnessRunner(supabase_client=None)
    runner._handle_draft_phase = AsyncMock(return_value=True)
    orchestrator = MagicMock()
    orchestrator.execute = AsyncMock()
    runner._orchestrator = orchestrator

    task = {
        "id": "task_direct_draft",
        "status": "drafted",
        "portal": "https://machado.com.br",
        "action_type": "lancar_nota",
        "_orchestrated": True
    }

    res = await runner.process_task(task, {"provider": "local"})

    assert res is True
    # O orchestrator NÃO deve ser chamado se _orchestrated=True
    orchestrator.execute.assert_not_called()
    runner._handle_draft_phase.assert_awaited_once_with(task, {"provider": "local"})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
