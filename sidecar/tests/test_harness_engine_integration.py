"""
sidecar/tests/test_harness_engine_integration.py — Suíte de Testes do Motor Nativo Browser Harness

Testa:
1. Disponibilidade e inicialização de HarnessEngine.
2. Integração do PPAVOrchestrator com o HarnessEngine (NAVIGATE, CLICK, FILL).
3. Sincronização pós-ação (async_wait_for_settled).
4. Resposta e despacho de metas via ExtensionBridge com Harness.
"""

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from harness_engine import HarnessEngine, HARNESS_AVAILABLE
from ppav_orchestrator import (
    PPAVOrchestrator,
    NextAction,
    PerceptionSnapshot,
    VerificationStatus,
    perceive_accessibility_tree
)
from extension_bridge import ExtensionBridge



def test_harness_engine_availability():
    """Verifica se o pacote vendorado browser_harness está disponível."""
    assert HARNESS_AVAILABLE is True
    engine = HarnessEngine(cdp_url="http://localhost:9222")
    assert engine.is_available is True
    assert engine.is_harness is True
    assert engine.cdp_url == "http://localhost:9222"


@pytest.mark.asyncio
async def test_ppav_orchestrator_act_with_harness_engine():
    """Valida se o PPAVOrchestrator delega para os métodos nativos do HarnessEngine."""
    mock_engine = MagicMock(spec=HarnessEngine)
    mock_engine.is_harness = True
    mock_engine.async_goto = AsyncMock(return_value={"navigated": True})
    mock_engine.async_click_element = AsyncMock(return_value={"clicked": True, "method": "physical_compositor"})
    mock_engine.async_fill_element = AsyncMock(return_value={"filled": True, "method": "harness_fill_input"})
    mock_engine.async_wait_for_settled = AsyncMock(return_value=True)

    orchestrator = PPAVOrchestrator(page=mock_engine)

    # 1. Teste de Navegação
    nav_action = NextAction(action_type="NAVIGATE", target="https://portal.escola.gov.br", strategy="url")
    nav_res = await orchestrator.act(mock_engine, nav_action)
    assert nav_res["success"] is True
    assert nav_res["method"] == "harness_cdp"
    mock_engine.async_goto.assert_awaited_once_with("https://portal.escola.gov.br")

    # 2. Teste de Clique via Compositor
    click_action = NextAction(action_type="CLICK", target="button#consultar", strategy="accessibility")
    click_res = await orchestrator.act(mock_engine, click_action)
    assert click_res["success"] is True
    assert click_res["method"] == "physical_compositor"
    mock_engine.async_click_element.assert_awaited_once_with("button#consultar", wait_idle=True)

    # 3. Teste de Digitação com Teclas Win32
    fill_action = NextAction(action_type="FILL", target="input#busca", value="Maria Eduarda", strategy="css_selector")
    fill_res = await orchestrator.act(mock_engine, fill_action)
    assert fill_res["success"] is True
    assert fill_res["method"] == "harness_fill_input"
    mock_engine.async_fill_element.assert_awaited_once_with("input#busca", "Maria Eduarda")


@pytest.mark.asyncio
async def test_perceive_accessibility_tree_with_harness():
    """Valida se o nível 1.1 de percepção consulta get_accessibility_tree() do Harness."""
    mock_engine = MagicMock(spec=HarnessEngine)
    mock_engine.is_harness = True
    mock_engine.get_accessibility_tree = MagicMock(return_value={
        "nodes": [
            {"role": "button", "name": "Entrar", "backendDOMNodeId": 42},
            {"role": "link", "name": "Minhas Turmas", "backendDOMNodeId": 43}
        ]
    })

    tree = await perceive_accessibility_tree(mock_engine)
    assert tree is not None
    assert "nodes" in tree
    assert len(tree["nodes"]) == 2
    mock_engine.get_accessibility_tree.assert_called_once()


@pytest.mark.asyncio
async def test_extension_bridge_harness_dispatch():
    """Testa o despacho e processamento da mensagem EXECUTE_GOAL_WITH_HARNESS via ExtensionBridge."""
    bridge = ExtensionBridge(port=8999)

    mock_ws = AsyncMock()
    sent_messages = []

    async def mock_send(data):
        sent_messages.append(json.loads(data))

    mock_ws.send = mock_send

    with patch("harness_engine.HarnessEngine.ensure_connected", return_value=True), \
         patch("harness_engine.HarnessEngine.async_goto", new_callable=AsyncMock), \
         patch("ppav_orchestrator.PPAVOrchestrator.execute_subgoal", new_callable=AsyncMock) as mock_exec:
        
        mock_exec.return_value = {"success": True, "sub_goal": "abrir turmas"}

        await bridge._run_harness_goal(mock_ws, goal="abrir turmas")

        # Verifica se notificou a conclusão com sucesso
        types = [m.get("type") for m in sent_messages]
        assert "HARNESS_COMPLETE" in types
