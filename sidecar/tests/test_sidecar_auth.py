"""
test_sidecar_auth.py — Testes Automatizados de Autenticação por Token (Sidecar Teacher AI)

Valida as defesas da Etapa 0 (T0.6):
1. Rejeição de requisições HTTP sem token nas portas 8765 (401 Unauthorized).
2. Rejeição de requisições HTTP com token incorreto (401 Unauthorized).
3. Aceitação de requisições HTTP com cabeçalho 'X-Sidecar-Token' válido (200 OK).
4. Aceitação de requisições HTTP com query param '?token=' válido (200 OK).
5. Rejeição de conexões WebSocket sem token na porta 8766 (1008 Policy Violation).
6. Rejeição de conexões WebSocket com token incorreto (1008 Policy Violation).
7. Aceitação de conexões WebSocket com query param '?token=' válido.
8. Aceitação de conexões WebSocket via mensagem de handshake 'AUTH'.
9. Resposta correta do Native Messaging Host para ação 'get_auth_token'.
"""

import asyncio
import json
import os
import sys
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from auth_token import initialize_auth_token, get_current_auth_token, verify_auth_token
from extension_bridge import ExtensionBridge
from manual_runner import ManualServerHandler
from native_host.teacherai_native_host import handle_request


@pytest.fixture(scope="module")
def auth_server():
    """Servidor HTTP de teste com token de autenticação fixo para o teste."""
    token = initialize_auth_token("test-secret-token-1234567890abcdef")
    server = ThreadingHTTPServer(("127.0.0.1", 0), ManualServerHandler)
    port = server.server_port
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    base_url = f"http://127.0.0.1:{port}"
    yield base_url, token
    server.shutdown()
    server.server_close()


def make_request(url: str, method: str = "GET", headers: dict = None, data: bytes = None):
    req_headers = headers.copy() if headers else {}
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return resp.status, resp.headers, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8")


# ── Testes de Token em HTTP (:8765) ──────────────────────────────────────────

def test_http_protected_endpoint_rejects_missing_token(auth_server):
    """POST /task sem token deve retornar 401 Unauthorized."""
    base_url, _ = auth_server
    status, _, body = make_request(
        f"{base_url}/task",
        method="POST",
        headers={"Origin": "chrome-extension://allowed-test-id", "Content-Type": "application/json"},
        data=json.dumps({"acao": "lancar_nota"}).encode("utf-8")
    )
    assert status == 401
    assert "Unauthorized" in body


def test_http_protected_endpoint_rejects_wrong_token(auth_server):
    """POST /task com token incorreto deve retornar 401 Unauthorized."""
    base_url, _ = auth_server
    status, _, body = make_request(
        f"{base_url}/task",
        method="POST",
        headers={
            "Origin": "chrome-extension://allowed-test-id",
            "Content-Type": "application/json",
            "X-Sidecar-Token": "token-totalmente-errado-999"
        },
        data=json.dumps({"acao": "lancar_nota"}).encode("utf-8")
    )
    assert status == 401
    assert "Unauthorized" in body


def test_http_protected_endpoint_accepts_valid_header_token(auth_server):
    """POST /task com token correto no cabeçalho X-Sidecar-Token deve retornar 200 OK."""
    base_url, token = auth_server
    mock_res = {"sucesso": True, "status": "draft_completed_pending_submit"}
    with patch("manual_runner.execute_task_intent", new=AsyncMock(return_value=mock_res)):
        status, _, body = make_request(
            f"{base_url}/task",
            method="POST",
            headers={
                "Origin": "chrome-extension://allowed-test-id",
                "Content-Type": "application/json",
                "X-Sidecar-Token": token
            },
            data=json.dumps({"acao": "lancar_nota"}).encode("utf-8")
        )
    assert status == 200
    assert json.loads(body).get("sucesso") is True


def test_http_protected_endpoint_accepts_valid_query_token(auth_server):
    """POST /task com token correto via query param (?token=) deve ser autorizado."""
    base_url, token = auth_server
    mock_res = {"sucesso": True, "status": "draft_completed_pending_submit"}
    with patch("manual_runner.execute_task_intent", new=AsyncMock(return_value=mock_res)):
        status, _, body = make_request(
            f"{base_url}/task?token={token}",
            method="POST",
            headers={
                "Origin": "chrome-extension://allowed-test-id",
                "Content-Type": "application/json"
            },
            data=json.dumps({"acao": "lancar_nota"}).encode("utf-8")
        )
    assert status == 200


def test_http_public_health_does_not_require_token(auth_server):
    """GET /health é diagnóstico de processo e não exige token."""
    base_url, _ = auth_server
    status, _, body = make_request(f"{base_url}/health")
    assert status == 200


# ── Testes de Token em WebSocket (:8766) ─────────────────────────────────────

class WSHeadersMock:
    def __init__(self, headers_dict):
        self._headers = {k.lower(): v for k, v in headers_dict.items()}

    def get(self, key, default=None):
        return self._headers.get(key.lower(), default)


class MockWSAgent:
    def __init__(self, token=None, path=None, first_msg=None):
        self.sent_messages = []
        self.closed = False
        self.close_code = None
        self.close_reason = None
        self.path = path or "/"
        self._first_msg = first_msg

        headers = {"Origin": "chrome-extension://authorized-test-id"}
        if token:
            headers["X-Sidecar-Token"] = token
        mock_h = WSHeadersMock(headers)
        self.request_headers = mock_h

    async def send(self, data: str):
        self.sent_messages.append(data)

    async def recv(self):
        if self._first_msg:
            msg = self._first_msg
            self._first_msg = None
            return msg
        raise asyncio.TimeoutError("No more messages")

    async def close(self, code: int = 1000, reason: str = ""):
        self.closed = True
        self.close_code = code
        self.close_reason = reason

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


@pytest.mark.asyncio
async def test_ws_rejects_missing_token():
    """Conexão WebSocket sem token deve ser rejeitada com código 1008."""
    bridge = ExtensionBridge(port=0)
    ws = MockWSAgent(token=None)
    await bridge._handle_connection(ws)

    assert ws.closed is True
    assert ws.close_code == 1008
    assert "Authentication Required" in ws.close_reason


@pytest.mark.asyncio
async def test_ws_rejects_invalid_token():
    """Conexão WebSocket com token inválido deve ser rejeitada com código 1008."""
    bridge = ExtensionBridge(port=0)
    ws = MockWSAgent(token="wrong-token-xyz")
    await bridge._handle_connection(ws)

    assert ws.closed is True
    assert ws.close_code == 1008


@pytest.mark.asyncio
async def test_ws_accepts_valid_query_token():
    """Conexão WebSocket com token na query param (?token=) deve ser aceita e receber SIDECAR_HELLO."""
    token = get_current_auth_token()
    bridge = ExtensionBridge(port=0)
    ws = MockWSAgent(path=f"/?token={token}")
    await bridge._handle_connection(ws)

    assert ws.closed is False
    assert len(ws.sent_messages) >= 1
    hello = json.loads(ws.sent_messages[0])
    assert hello["type"] == "SIDECAR_HELLO"


@pytest.mark.asyncio
async def test_ws_accepts_auth_message_handshake():
    """Conexão WebSocket que envia {type: 'AUTH', token} na primeira mensagem deve autenticar."""
    token = get_current_auth_token()
    bridge = ExtensionBridge(port=0)
    auth_payload = json.dumps({"type": "AUTH", "token": token})
    ws = MockWSAgent(token=None, first_msg=auth_payload)
    await bridge._handle_connection(ws)

    assert ws.closed is False
    assert len(ws.sent_messages) >= 2
    auth_resp = json.loads(ws.sent_messages[0])
    assert auth_resp["type"] == "AUTH_OK"
    hello = json.loads(ws.sent_messages[1])
    assert hello["type"] == "SIDECAR_HELLO"


# ── Teste do Native Messaging Host ───────────────────────────────────────────

def test_native_messaging_host_returns_auth_token():
    """Host nativo deve responder à ação 'get_auth_token' com o token ativo."""
    token = get_current_auth_token()
    resp = handle_request({"action": "get_auth_token"})
    assert resp.get("success") is True
    assert resp.get("token") == token
