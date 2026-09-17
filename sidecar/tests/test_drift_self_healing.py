"""
tests/test_drift_self_healing.py — Validação do Mecanismo de Auto-recuperação (Self-Healing) de Drift

Verifica que quando um SkillGraph existente falha na Camada 1 devido a mudança
de seletor no portal (ex: 'button.btn-gravar' não encontrado), o DiscoveryOrchestrator:
1. Registra imediatamente o drift no PortalMapStore.
2. Não falha silenciosamente nem aborta a execução.
3. Escala autonomamente para a Camada 2 (BrowserUseAgent) para re-descobrir os novos seletores.
4. Salva a nova versão (v2) e limpa a flag de drift.
"""

import asyncio
import os
import sys
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
from skyvern_fallback import SkyvernFallbackClient
from discovery_orchestrator import DiscoveryOrchestrator


@pytest.fixture
def temp_skills_dir(tmp_path, monkeypatch):
    """Redireciona DEFAULT_SKILLS_DIR para uma pasta temporária."""
    import skill_store
    skills_path = tmp_path / "skills"
    monkeypatch.setattr(skill_store, "DEFAULT_SKILLS_DIR", skills_path)
    return skills_path


@pytest.mark.asyncio
async def test_drift_detected_triggers_layer2_self_healing(temp_skills_dir):
    """
    Testa que uma falha na Camada 1 (ex: nó click_0 com button.btn-gravar quebrado)
    marca drift no PortalMapStore e escala para a Camada 2 para re-descoberta.
    """
    portal_id = "machado_sobrinho"
    acao = "lancar_falta"

    # 1. Cria um SkillGraph v1 com o seletor obsoleto "button.btn-gravar"
    broken_graph = SkillGraph(
        id="skill_lancar_falta_mtqfm72i",
        name="Lançar Falta",
        portal_id=portal_id,
        task_id=acao,
        version=1,
        entry_node="checkpoint_seguranca",
        nodes={
            "checkpoint_seguranca": SkillNode(
                id="checkpoint_seguranca",
                type="CHECKPOINT",
                on_success="click_0",
                params=SkillNodeParams(requires_confirmation=True)
            ),
            "click_0": SkillNode(
                id="click_0",
                type="CLICK",
                anchor=SkillAnchor(strategy="css_selector", value="button.btn-gravar"),
                params=SkillNodeParams(is_submit_action=True)
            )
        }
    )
    save_skill(broken_graph, base_dir=temp_skills_dir)

    # 2. Configura stores e mocks
    map_store = PortalMapStore()
    assert not map_store.is_drifted(portal_id, acao), "Não deve iniciar com drift"

    # Mock do BrowserUseAgent (Camada 2) para simular re-descoberta com o seletor atualizado
    mock_browser_use = MagicMock(spec=BrowserUseAgent)
    mock_browser_use.execute_discovery_task = AsyncMock(return_value=BrowserUseTaskResult(
        sucesso=True,
        confianca=0.95,
        trace_de_acoes=[
            {"action_type": "NAVIGATE", "url": "https://machadosobrinho.paineldoaluno.com.br/professor_chamada", "description": "Navegar para chamada"},
            {"action_type": "CLICK", "selector": "#btn_salvar_chamada", "is_submit_action": True, "description": "Gravar Chamada"}
        ],
        erro=None,
        status="success",
        execution_time_seconds=1.2,
        engine_used="browser_use_llama"
    ))

    # Mock do Skyvern (não deve ser chamado)
    mock_skyvern = MagicMock(spec=SkyvernFallbackClient)
    mock_skyvern.executar_tarefa = AsyncMock()

    orchestrator = DiscoveryOrchestrator(
        map_store=map_store,
        browser_use_agent=mock_browser_use,
        skyvern_client=mock_skyvern,
        skills_dir=temp_skills_dir
    )

    # Mock do runner local que falha exatamente como no caso real do Machado Sobrinho
    async def mock_fail_local_graph(graph, params, depth=0):
        return {
            "success": False,
            "error": 'Falha no nó click_0: elemento "button.btn-gravar" não encontrado no DOM ou não clicável.',
            "trace": [{"node": "checkpoint_seguranca", "status": "SUCCESS"}, {"node": "click_0", "status": "FAILED"}]
        }
    orchestrator._execute_local_graph = mock_fail_local_graph

    # 3. Executa a orquestração
    progress_events = []
    result = await orchestrator.execute(
        portal_id=portal_id,
        acao=acao,
        parametros={"aluno": "Rodrigo", "falta": True},
        on_progress=lambda ev: progress_events.append(ev)
    )

    # 4. Asserções do Self-Healing
    assert result["success"] is True, f"Deveria ter recuperado via Camada 2: {result.get('error')}"
    assert result["engine_used"] == "browser_use_llama"
    assert result["skill_graph"].version == 2, "Deveria ter compilado a versão 2 do grafo"

    # Verifica que o nó click_0 da nova versão usa o novo seletor corrigido
    new_click_node = next(n for n in result["skill_graph"].nodes.values() if n.type == "CLICK")
    assert new_click_node.anchor.value == "#btn_salvar_chamada"

    # Verifica que o drift foi limpo após a re-descoberta bem-sucedida
    assert not map_store.is_drifted(portal_id, acao), "Drift deve ter sido limpo após re-descoberta"

    # Verifica que houve evento de progresso reportando o healing
    healing_events = [ev for ev in progress_events if ev.get("status") == "healing"]
    assert len(healing_events) > 0, "Deve haver notificação de status 'healing'"
    assert "Drift detectado" in healing_events[0]["message"]
