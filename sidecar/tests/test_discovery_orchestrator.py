"""
tests/test_discovery_orchestrator.py — Testes da Escada de Descoberta Agêntica
"""

import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# Adiciona sidecar ao sys.path
_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams
from skill_store import save_skill, load_skill
from portal_map_store import PortalMapStore
from browser_use_agent import BrowserUseAgent, BrowserUseTaskResult
from skyvern_fallback import SkyvernFallbackClient, SkyvernTaskResult
from discovery_orchestrator import DiscoveryOrchestrator
from graph_validator import assert_graph_safe


@pytest.fixture
def temp_skills_dir(tmp_path, monkeypatch):
    """Redireciona DEFAULT_SKILLS_DIR para uma pasta temporária."""
    import skill_store
    monkeypatch.setattr(skill_store, "DEFAULT_SKILLS_DIR", tmp_path / "skills")
    return tmp_path / "skills"


@pytest.mark.asyncio
async def test_local_motor_execution_zero_cost(temp_skills_dir):
    """
    NÍVEL 1: Se existe um SkillGraph salvo e sem drift, executa diretamente no
    motor local com custo $0.00 e sem acionar Browser-use ou Skyvern.
    """
    portal_id = "escola_teste"
    acao = "lancar_nota"

    # Cria e salva uma skill prévia v1
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
                params=SkillNodeParams()
            ),
            "write_0": SkillNode(
                id="write_0",
                type="WRITE",
                anchor=SkillAnchor(strategy="css_selector", value="input.grade"),
                on_success=None,
                params=SkillNodeParams(action_value="10")
            )
        }
    )
    save_skill(sample_graph, base_dir=temp_skills_dir)

    map_store = PortalMapStore()
    mock_runner = MagicMock()
    mock_runner.process_task = AsyncMock(return_value=True)

    bu_agent = BrowserUseAgent()
    bu_agent.execute_discovery_task = AsyncMock()

    sky_client = SkyvernFallbackClient()
    sky_client.execute_visual_task = AsyncMock()

    orchestrator = DiscoveryOrchestrator(
        runner=mock_runner,
        map_store=map_store,
        browser_use_agent=bu_agent,
        skyvern_client=sky_client,
        skills_dir=temp_skills_dir
    )

    events = []
    result = await orchestrator.discover_or_execute(
        portal_id=portal_id,
        acao=acao,
        parametros={"aluno": "Maria", "nota": "9.5"},
        on_progress=lambda e: events.append(e)
    )

    assert result["success"] is True
    assert result["engine_used"] == "local_motor"
    assert result["estimated_cost"] == 0.0
    # Confirma que Browser-use e Skyvern NÃO foram chamados
    bu_agent.execute_discovery_task.assert_not_called()
    sky_client.execute_visual_task.assert_not_called()
    assert any(e["engine"] == "local_motor" for e in events)


@pytest.mark.asyncio
async def test_browser_use_discovery_and_compilation(temp_skills_dir):
    """
    NÍVEL 2: Sem mapa prévio, aciona o Browser-use via DOM.
    Se confiança >= 0.7, compila um novo SkillGraph seguro (com CHECKPOINT) e salva v1.
    """
    portal_id = "escola_nova"
    acao = "lancar_nota"

    map_store = PortalMapStore()

    # Mock do BrowserUseAgent retornando confiança alta
    bu_agent = BrowserUseAgent(confidence_threshold=0.7)
    bu_agent.execute_discovery_task = AsyncMock(return_value=BrowserUseTaskResult(
        sucesso=True,
        confianca=0.88,
        trace_de_acoes=[
            {"action_type": "NAVIGATE", "url": "https://escola.com/notas"},
            {"action_type": "LOCATE", "selector": "table.notas tbody tr", "multiplicity": "all"},
            {"action_type": "WRITE", "selector": "input.grade_input", "value": "8.5"},
            {"action_type": "CLICK", "selector": "button.btn-gravar", "is_submit_action": True}
        ]
    ))

    sky_client = SkyvernFallbackClient()
    sky_client.execute_visual_task = AsyncMock()

    orchestrator = DiscoveryOrchestrator(
        map_store=map_store,
        browser_use_agent=bu_agent,
        skyvern_client=sky_client,
        confidence_threshold=0.7,
        skills_dir=temp_skills_dir
    )

    events = []
    result = await orchestrator.discover_or_execute(
        portal_id=portal_id,
        acao=acao,
        parametros={"nota": "8.5"},
        portal_url="https://escola.com/notas",
        on_progress=lambda e: events.append(e)
    )

    assert result["success"] is True
    assert result["engine_used"] == "browser_use_llama"
    assert result["estimated_cost"] == 0.0005
    sky_client.execute_visual_task.assert_not_called()

    # Verifica que o SkillGraph gerado foi salvo e é estritamente seguro
    compiled_graph: SkillGraph = result["skill_graph"]
    assert compiled_graph.portal_id == portal_id
    assert compiled_graph.task_id == acao
    assert compiled_graph.version == 1

    # Confirma que há um nó CHECKPOINT inserido antes da escrita/clique
    assert "checkpoint_seguranca" in compiled_graph.nodes
    assert_graph_safe(compiled_graph)


@pytest.mark.asyncio
async def test_skyvern_escalation_when_browser_use_low_confidence(temp_skills_dir):
    """
    NÍVEL 3: Quando Browser-use falha ou retorna confiança < 0.7, escala para o Skyvern.
    O Skyvern retorna o trace visual que é compilado no mesmo formato seguro.
    """
    portal_id = "portal_complexo"
    acao = "lancar_nota"

    map_store = PortalMapStore()

    # Browser-use com baixa confiança
    bu_agent = BrowserUseAgent(confidence_threshold=0.7)
    bu_agent.execute_discovery_task = AsyncMock(return_value=BrowserUseTaskResult(
        sucesso=False,
        confianca=0.45,
        trace_de_acoes=[],
        requires_escalation=True,
        erro="Elementos não identificados no DOM."
    ))

    # Skyvern Mock com sucesso visual
    sky_client = SkyvernFallbackClient()
    sky_client.execute_visual_task = AsyncMock(return_value=SkyvernTaskResult(
        sucesso=True,
        confianca=0.80,
        trace_de_acoes=[
            {"action_type": "NAVIGATE", "url": "https://portalcomplexo.com/diario"},
            {"action_type": "LOCATE", "selector": "div.grid-notas"},
            {"action_type": "WRITE", "selector": "input#aluno_1", "value": "10"},
            {"action_type": "CLICK", "selector": "button.submit", "is_submit_action": True}
        ]
    ))

    orchestrator = DiscoveryOrchestrator(
        map_store=map_store,
        browser_use_agent=bu_agent,
        skyvern_client=sky_client,
        confidence_threshold=0.7,
        skills_dir=temp_skills_dir
    )

    events = []
    result = await orchestrator.discover_or_execute(
        portal_id=portal_id,
        acao=acao,
        parametros={"nota": "10"},
        portal_url="https://portalcomplexo.com/diario",
        on_progress=lambda e: events.append(e)
    )

    assert result["success"] is True
    assert result["engine_used"] == "skyvern_vision"
    assert result["estimated_cost"] == 0.08
    sky_client.execute_visual_task.assert_called_once()

    compiled_graph: SkillGraph = result["skill_graph"]
    assert compiled_graph.version == 1
    assert "checkpoint_seguranca" in compiled_graph.nodes
    assert_graph_safe(compiled_graph)
    assert any(e["engine"] == "skyvern" for e in events)


@pytest.mark.asyncio
async def test_drift_detection_forces_rediscovery(temp_skills_dir):
    """
    TESTE DE DRIFT: Quando um portal está marcado com drift pós-escrita,
    o DiscoveryOrchestrator descarta o grafo em cache e força redescoberta.
    """
    portal_id = "escola_com_drift"
    acao = "lancar_nota"

    # Salva v1
    sample_graph = SkillGraph(
        id=f"skill_{portal_id}_{acao}_v1",
        name="Lançar Nota",
        portal_id=portal_id,
        task_id=acao,
        version=1,
        entry_node="chk",
        nodes={"chk": SkillNode(id="chk", type="CHECKPOINT", params=SkillNodeParams())}
    )
    save_skill(sample_graph, base_dir=temp_skills_dir)

    map_store = PortalMapStore()
    # Registra drift no mapa
    map_store.mark_drift("escola_com_drift", acao, details={"mismatch": True})
    assert map_store.is_drifted("escola_com_drift", acao) is True

    bu_agent = BrowserUseAgent()
    bu_agent.execute_discovery_task = AsyncMock(return_value=BrowserUseTaskResult(
        sucesso=True,
        confianca=0.9,
        trace_de_acoes=[
            {"action_type": "LOCATE", "selector": "table.novo-layout"},
            {"action_type": "WRITE", "selector": "input.nova-nota", "value": "10"}
        ]
    ))

    orchestrator = DiscoveryOrchestrator(
        map_store=map_store,
        browser_use_agent=bu_agent,
        skills_dir=temp_skills_dir
    )

    res = await orchestrator.discover_or_execute(
        portal_id=portal_id,
        acao=acao,
        parametros={"nota": "10"}
    )

    # Teve que redescobrir via browser-use
    assert res["engine_used"] == "browser_use_llama"
    # Nova versão gerada v2
    assert res["skill_graph"].version == 2
    # Drift foi limpo após a nova validação
    assert map_store.is_drifted("escola_com_drift", acao) is False


@pytest.mark.asyncio
async def test_mutex_concurrency_lock_per_portal():
    """
    PONTO 1 DA REVISÃO: Valida que chamadas concorrentes para o mesmo portal_id
    são serializadas via lock assíncrono para evitar colisão na mesma porta CDP.
    """
    orchestrator = DiscoveryOrchestrator()
    portal_id = "portal_concorrente"

    execution_order = []

    async def mock_task(task_num: int, sleep_time: float):
        lock = orchestrator._get_portal_lock(portal_id)
        async with lock:
            execution_order.append(f"start_{task_num}")
            await asyncio.sleep(sleep_time)
            execution_order.append(f"end_{task_num}")

    # Dispara duas tarefas simultâneas
    t1 = asyncio.create_task(mock_task(1, 0.05))
    t2 = asyncio.create_task(mock_task(2, 0.01))
    await asyncio.gather(t1, t2)

    # Garante que a tarefa 1 começou e terminou ANTES da tarefa 2 começar
    assert execution_order == ["start_1", "end_1", "start_2", "end_2"]


def test_agpl_isolation_guarantee():
    """
    REQUISITO NÃO-FUNCIONAL: Garante que nenhuma biblioteca interna do Skyvern
    foi importada no processo Python da aplicação (Isolamento AGPL-3.0).
    """
    import sys
    for mod_name in sys.modules.keys():
        assert not mod_name.startswith("skyvern."), f"Violação de isolamento AGPL: módulo '{mod_name}' importado!"


@pytest.mark.asyncio
async def test_skyvern_authentication_policy_rejection():
    """
    PONTO 4 DA REVISÃO: Skyvern nunca tenta fazer login sozinho.
    Se is_authenticated_session=False, aborta com erro explícito de sessão não autenticada.
    """
    client = SkyvernFallbackClient()
    res = await client.execute_visual_task(
        url="https://portal.exemplo.com/login",
        portal_id="escola_teste",
        acao="lancar_nota",
        parametros={},
        is_authenticated_session=False
    )
    assert res.sucesso is False
    assert "Sessão não autenticada" in res.erro
