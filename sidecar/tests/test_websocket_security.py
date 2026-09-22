"""
test_websocket_security.py — Testes Automatizados de Segurança da Ponte WebSocket (:8766)

Valida as defesas contra Cross-Site WebSocket Hijacking (CSWSH) e spoofing de origem:
1. Aceitação de conexões sem Origin (scripts CLI locais e ferramentas de teste).
2. Aceitação de extensões legítimas do Chrome (chrome-extension://*).
3. Aceitação de dashboards de desenvolvimento/teste em localhost / 127.0.0.1.
4. Bloqueio imediato de sites web externos (https://malicious.com, http://evil.com).
5. Bloqueio imediato de sandboxed iframes (Origin: 'null').
6. Bloqueio imediato de domínios com subdomínio simulado (http://localhost.attacker.com).
7. Fechamento da conexão com código 1008 (Policy Violation) para origens não autorizadas.
8. Isolamento: sockets rejeitados não entram no conjunto active_sockets e não recebem SIDECAR_HELLO.
"""

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import pytest

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from extension_bridge import ExtensionBridge


class MockHeaders:
    def __init__(self, headers_dict):
        self._headers = {k.lower(): v for k, v in headers_dict.items()}

    def get(self, key, default=None):
        return self._headers.get(key.lower(), default)


class MockWebSocket:
    def __init__(self, origin=None, host="127.0.0.1:8766", api_flavor="request_headers"):
        self.sent_messages = []
        self.closed = False
        self.close_code = None
        self.close_reason = None

        headers = {}
        if origin is not None:
            headers["Origin"] = origin
        if host is not None:
            headers["Host"] = host

        mock_h = MockHeaders(headers)

        if api_flavor == "request":
            # websockets >= 13 (websocket.request.headers)
            req = MagicMock()
            req.headers = mock_h
            self.request = req
        elif api_flavor == "request_headers":
            # websockets < 13 (websocket.request_headers)
            self.request_headers = mock_h
        else:
            # direct headers dict
            self.headers = mock_h

    async def send(self, data: str):
        self.sent_messages.append(data)

    async def close(self, code: int = 1000, reason: str = ""):
        self.closed = True
        self.close_code = code
        self.close_reason = reason

    def __aiter__(self):
        return self

    async def __anext__(self):
        # Encerra a iteração após a inicialização
        raise StopAsyncIteration


# ── 1. Testes Unitários de _is_origin_allowed ─────────────────────────────────

def test_origin_allowed_none_and_empty():
    """Conexões locais sem Origin (CLI, curl, scripts internos) são autorizadas."""
    assert ExtensionBridge._is_origin_allowed(None) is True
    assert ExtensionBridge._is_origin_allowed("") is True


def test_origin_allowed_chrome_extension():
    """Extensões legítimas do Chrome (chrome-extension://*) são autorizadas."""
    assert ExtensionBridge._is_origin_allowed("chrome-extension://abcdefghijklmnop") is True
    assert ExtensionBridge._is_origin_allowed("chrome-extension://some-random-id-123") is True


def test_origin_allowed_localhost_and_loopback():
    """Aplicações locais de QA e desenvolvimento em localhost ou 127.0.0.1 são autorizadas."""
    assert ExtensionBridge._is_origin_allowed("http://localhost:3000") is True
    assert ExtensionBridge._is_origin_allowed("http://127.0.0.1:8000") is True
    assert ExtensionBridge._is_origin_allowed("https://localhost:8765") is True
    assert ExtensionBridge._is_origin_allowed("http://testserver") is True


def test_origin_rejected_null_sandboxed_iframe():
    """Sandboxed iframes com Origin 'null' são sumariamente bloqueados."""
    assert ExtensionBridge._is_origin_allowed("null") is False


def test_origin_rejected_malicious_external_domains():
    """Sites web externos arbitrários são estritamente rejeitados."""
    assert ExtensionBridge._is_origin_allowed("https://malicious-site.com") is False
    assert ExtensionBridge._is_origin_allowed("http://evil.com") is False
    assert ExtensionBridge._is_origin_allowed("https://phishing.example.org") is False


def test_origin_rejected_subdomain_spoofing():
    """Ataques de DNS/subdomínio como localhost.attacker.com são rejeitados."""
    assert ExtensionBridge._is_origin_allowed("http://localhost.attacker.com") is False
    assert ExtensionBridge._is_origin_allowed("http://127.0.0.1.attacker.com") is False
    assert ExtensionBridge._is_origin_allowed("https://evil-localhost.com") is False


# ── 2. Testes de Extração de Origin em Diferentes Versões de websockets ───────

def test_extract_origin_websockets_13_plus():
    """Extração de Origin via websocket.request.headers (websockets >= 13)."""
    ws = MockWebSocket(origin="chrome-extension://test-id", api_flavor="request")
    assert ExtensionBridge._extract_origin(ws) == "chrome-extension://test-id"


def test_extract_origin_websockets_legacy():
    """Extração de Origin via websocket.request_headers (websockets < 13)."""
    ws = MockWebSocket(origin="http://localhost:3000", api_flavor="request_headers")
    assert ExtensionBridge._extract_origin(ws) == "http://localhost:3000"


def test_extract_origin_direct_headers():
    """Extração de Origin via websocket.headers."""
    ws = MockWebSocket(origin="http://127.0.0.1:8080", api_flavor="headers")
    assert ExtensionBridge._extract_origin(ws) == "http://127.0.0.1:8080"


def test_extract_origin_missing():
    """Quando não há cabeçalho Origin, retorna None."""
    ws = MockWebSocket(origin=None)
    assert ExtensionBridge._extract_origin(ws) is None


# ── 3. Testes Assíncronos de Handshake e Bloqueio de Conexão ──────────────────

@pytest.mark.asyncio
async def test_handle_connection_allowed_origin():
    """Conexão com origem autorizada recebe SIDECAR_HELLO e entra em active_sockets."""
    bridge = ExtensionBridge(port=0)
    ws = MockWebSocket(origin="chrome-extension://authorized-teacher-ai", api_flavor="request")

    await bridge._handle_connection(ws)

    # Verificações
    assert ws.closed is False
    assert len(ws.sent_messages) >= 1
    hello_msg = json.loads(ws.sent_messages[0])
    assert hello_msg["type"] == "SIDECAR_HELLO"
    assert hello_msg["status"] == "ready"


@pytest.mark.asyncio
async def test_handle_connection_rejected_untrusted_origin():
    """Conexão de site web malicioso é imediatamente rejeitada com código 1008."""
    bridge = ExtensionBridge(port=0)
    ws = MockWebSocket(origin="https://malicious-portal-attacker.com", api_flavor="request")

    await bridge._handle_connection(ws)

    # Conexão deve ser fechada com código 1008 (Policy Violation)
    assert ws.closed is True
    assert ws.close_code == 1008
    assert "Policy Violation" in ws.close_reason
    # Nenhum handshake/SIDECAR_HELLO deve ser enviado
    assert len(ws.sent_messages) == 0
    # Socket não deve permanecer ativo
    assert ws not in bridge.active_sockets


@pytest.mark.asyncio
async def test_handle_connection_rejected_null_origin():
    """Conexão de sandboxed iframe (Origin: 'null') é rejeitada com código 1008."""
    bridge = ExtensionBridge(port=0)
    ws = MockWebSocket(origin="null", api_flavor="request_headers")

    await bridge._handle_connection(ws)

    assert ws.closed is True
    assert ws.close_code == 1008
    assert len(ws.sent_messages) == 0
    assert ws not in bridge.active_sockets


@pytest.mark.asyncio
async def test_handle_connection_allowed_local_cli():
    """Conexão local sem Origin (CLI/testes) é aceita normalmente."""
    bridge = ExtensionBridge(port=0)
    ws = MockWebSocket(origin=None)

    await bridge._handle_connection(ws)

    assert ws.closed is False
    assert len(ws.sent_messages) >= 1
    hello_msg = json.loads(ws.sent_messages[0])
    assert hello_msg["type"] == "SIDECAR_HELLO"
