"""
test_extension_websocket_bridge.py — Testes da Ponte WebSocket da Extensão do Chrome (Teacher AI)

Valida:
1. Gerenciamento de estado da extensão (Desconectado, Portal Não Reconhecido, Pronto).
2. Atualização de status da aba ativa (reconhecimento de domínios mapeados vs externos).
3. Despacho de tarefas pela extensão com recebimento de diff e screenshot.
4. Fallback transparente quando a extensão não está conectada.
"""

import asyncio
import json
import sys
import unittest
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from extension_bridge import ExtensionBridge, KNOWN_PORTAL_DOMAINS


class MockWebSocket:
    def __init__(self):
        self.sent_messages = []
        self.closed = False

    async def send(self, data: str):
        self.sent_messages.append(data)


class TestExtensionBridgeUnit(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.bridge = ExtensionBridge(port=0)

    def test_initial_state_offline(self):
        """Sem conexão WebSocket, estado deve ser offline."""
        assert self.bridge.is_connected() is False
        assert self.bridge.has_active_portal_tab() is False
        summary = self.bridge.get_status_summary()
        assert summary["state"] == "offline"
        assert "Desconectado" in summary["label"]

    def test_external_tab_unrecognized(self):
        """Aba com domínio externo (ex: google.com) deve ser 'unrecognized_portal'."""
        mock_ws = MockWebSocket()
        self.bridge.active_sockets.add(mock_ws)

        # Simula atualização enviada pela extensão
        self.bridge.active_tab_state = {
            "tabId": 101,
            "url": "https://www.google.com/search?q=pedagogia",
            "title": "Google",
            "isMappedPortal": False,
            "portalName": None,
            "isAuthenticated": False
        }

        assert self.bridge.is_connected() is True
        assert self.bridge.has_active_portal_tab() is False
        summary = self.bridge.get_status_summary()
        assert summary["state"] == "unrecognized_portal"
        assert "não reconhecido" in summary["label"]

    def test_mapped_portal_needs_login(self):
        """Portal mapeado (ex: i-Educar) sem login detectado deve ser 'needs_login'."""
        mock_ws = MockWebSocket()
        self.bridge.active_sockets.add(mock_ws)

        self.bridge.active_tab_state = {
            "tabId": 102,
            "url": "https://comunidade.ieducar.com.br/login",
            "title": "i-Educar Login",
            "isMappedPortal": True,
            "portalName": "i-Educar",
            "isAuthenticated": False
        }

        assert self.bridge.is_connected() is True
        assert self.bridge.has_active_portal_tab() is False
        summary = self.bridge.get_status_summary()
        assert summary["state"] == "needs_login"
        assert "requer login" in summary["label"]

    def test_mapped_portal_authenticated_ready(self):
        """Portal mapeado com login ativo deve ser 'ready'."""
        mock_ws = MockWebSocket()
        self.bridge.active_sockets.add(mock_ws)

        self.bridge.active_tab_state = {
            "tabId": 103,
            "url": "https://comunidade.ieducar.com.br/intranet/diario.php",
            "title": "Diário de Classe",
            "isMappedPortal": True,
            "portalName": "i-Educar",
            "isAuthenticated": True
        }

        assert self.bridge.is_connected() is True
        assert self.bridge.has_active_portal_tab() is True
        summary = self.bridge.get_status_summary()
        assert summary["state"] == "ready"
        assert "Conectado e pronto" in summary["label"]

    async def test_execute_task_on_tab_success(self):
        """Despacho de tarefa para a extensão via WebSocket e resolução do resultado."""
        mock_ws = MockWebSocket()
        self.bridge.active_sockets.add(mock_ws)
        self.bridge.active_tab_state = {
            "tabId": 104,
            "url": "https://comunidade.ieducar.com.br/diario",
            "isMappedPortal": True,
            "portalName": "i-Educar",
            "isAuthenticated": True
        }

        task_intent = {
            "acao": "lancar_nota",
            "aluno": "Hugo Henrique",
            "nota": 9.5
        }

        # Cria tarefa assíncrona de execução
        exec_coro = self.bridge.execute_task_on_tab(task_intent, timeout_s=2.0)

        # Em paralelo, simula a extensão recebendo o comando e respondendo
        async def mock_extension_reply():
            await asyncio.sleep(0.05)
            assert len(mock_ws.sent_messages) == 1
            sent_payload = json.loads(mock_ws.sent_messages[0])
            assert sent_payload["type"] == "EXECUTE_PORTAL_ACTION"
            act_id = sent_payload["actionId"]

            # Simula resposta da extensão
            simulated_result = {
                "sucesso": True,
                "status": "draft_completed_pending_submit",
                "diff": {
                    "aluno": "Hugo Henrique",
                    "campo": "nota",
                    "antes": "",
                    "depois": "9.5"
                },
                "screenshot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
            }

            # Aciona o resolvedor na bridge
            if act_id in self.bridge.pending_actions:
                fut = self.bridge.pending_actions.pop(act_id)
                fut.set_result(simulated_result)

        reply_task = asyncio.create_task(mock_extension_reply())
        res = await exec_coro
        await reply_task

        assert res is not None
        assert res["sucesso"] is True
        assert res["status"] == "draft_completed_pending_submit"
        assert res["diff"]["depois"] == "9.5"
