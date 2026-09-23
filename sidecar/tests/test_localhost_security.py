"""
test_localhost_security.py — Testes Automatizados do Origin & Host Security Gate (Localhost HTTP Server)

Valida que o servidor HTTP local do sidecar (ManualServerHandler) bloqueia:
1. Requisições de abas web externas em TODOS os 7 endpoints do sidecar:
   - GET /ai_engine_status
   - POST /ai_engine_preload
   - POST /task
   - POST /natural_intent
   - POST /ask_page
   - GET /portal_status
   - GET /health
2. Sandboxed iframes com Origin nula ('null').
3. Ataques de DNS Rebinding via manipulação do cabeçalho Host.
4. Requisições cross-site de navegador via cabeçalho Sec-Fetch-Site.
E autoriza estritamente:
5. Extensões Chrome legítimas (chrome-extension://*) nos endpoints essenciais de telemetria e ação.
6. Painel local de QA/Debug em 127.0.0.1 / localhost.
7. Chamadas diretas de CLI e automações locais sem cabeçalho Origin.
"""

import json
import threading
import time
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import pytest
from unittest.mock import patch, AsyncMock

_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(_PROJECT_DIR))
_SIDECAR_DIR = _PROJECT_DIR / "sidecar"
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from manual_runner import ManualServerHandler


@pytest.fixture(scope="module")
def local_security_server():
    """Inicia o servidor de teste em porta efêmera dedicada."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), ManualServerHandler)
    port = server.server_port
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    base_url = f"http://127.0.0.1:{port}"
    yield base_url
    server.shutdown()
    server.server_close()


def make_http_request(url: str, method: str = "GET", headers: dict = None, data: bytes = None):
    """Auxiliar para disparar requisição HTTP e capturar resposta ou erro HTTPError."""
    req_headers = headers.copy() if headers else {}
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            return resp.status, resp.headers, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8")


# ==============================================================================
# BLOCO 1: BLOQUEIO DE ORIGENS MALICIOSAS / ABAS WEB EM TODOS OS 7 ENDPOINTS
# ==============================================================================

def test_malicious_web_origin_blocked_on_status(local_security_server):
    """Abas web comuns (https://site-malicioso.com) devem receber 403 Forbidden em /ai_engine_status."""
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_status",
        headers={"Origin": "https://site-malicioso.com"}
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body
    assert "Access-Control-Allow-Origin" not in headers


def test_malicious_web_origin_blocked_on_preload(local_security_server):
    """Abas web externas não podem disparar POST /ai_engine_preload (CSRF bloqueado)."""
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_preload",
        method="POST",
        headers={"Origin": "https://attacker-portal.edu.br"},
        data=b"{}"
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body


def test_malicious_web_origin_blocked_on_task(local_security_server):
    """Abas externas não podem disparar POST /task (automação indevida no navegador)."""
    status, headers, body = make_http_request(
        f"{local_security_server}/task",
        method="POST",
        headers={"Origin": "https://malicious-script.org", "Content-Type": "application/json"},
        data=json.dumps({"acao": "lancar_nota"}).encode("utf-8")
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body


def test_malicious_web_origin_blocked_on_natural_intent(local_security_server):
    """Abas externas não podem disparar POST /natural_intent (execução de comandos por NLU)."""
    status, headers, body = make_http_request(
        f"{local_security_server}/natural_intent",
        method="POST",
        headers={"Origin": "https://attacker-domain.com", "Content-Type": "application/json"},
        data=json.dumps({"text": "marcar falta para todos os alunos"}).encode("utf-8")
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body


def test_malicious_web_origin_blocked_on_ask_page(local_security_server):
    """Abas externas não podem disparar POST /ask_page (extração ou vazamento de contexto da página)."""
    status, headers, body = make_http_request(
        f"{local_security_server}/ask_page",
        method="POST",
        headers={"Origin": "https://attacker-domain.com", "Content-Type": "application/json"},
        data=json.dumps({"query": "extrair dados da tela", "page_data": {}}).encode("utf-8")
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body


def test_malicious_web_origin_blocked_on_portal_status(local_security_server):
    """Abas externas não podem espionar GET /portal_status (leitura do estado da professora)."""
    status, headers, body = make_http_request(
        f"{local_security_server}/portal_status",
        headers={"Origin": "https://malicious-tracker.net"}
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body


def test_malicious_web_origin_blocked_on_health(local_security_server):
    """Abas externas não podem ler abas ativas nem telemetria em GET /health."""
    status, headers, body = make_http_request(
        f"{local_security_server}/health",
        headers={"Origin": "https://malicious-tracker.net"}
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body


# ==============================================================================
# BLOCO 2: ATAQUES ESTRUTURAIS (PREFLIGHT, SANDBOX NULL, DNS REBINDING, SEC-FETCH)
# ==============================================================================

def test_options_preflight_rejected_for_untrusted_origin(local_security_server):
    """Preflight OPTIONS de origem não autorizada deve ser rejeitado com 403."""
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_preload",
        method="OPTIONS",
        headers={
            "Origin": "https://evil.com",
            "Access-Control-Request-Method": "POST"
        }
    )
    assert status == 403
    assert "Access-Control-Allow-Origin" not in headers


def test_sandboxed_iframe_null_origin_blocked(local_security_server):
    """Iframes sandboxed com Origin 'null' devem ser terminantemente bloqueados."""
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_status",
        headers={"Origin": "null"}
    )
    assert status == 403
    assert "Forbidden: Untrusted origin" in body


def test_dns_rebinding_host_header_blocked(local_security_server):
    """Requisição com Host header forjado para domínio de DNS rebinding deve ser rejeitada."""
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_status",
        headers={"Host": "rebound-dns-attacker.com:8765"}
    )
    assert status == 403
    assert "Invalid Host header" in body


def test_sec_fetch_site_cross_site_blocked_if_not_extension(local_security_server):
    """Requisições com Sec-Fetch-Site: cross-site devem ser bloqueadas se não forem de extensão."""
    status, headers, body = make_http_request(
        f"{local_security_server}/health",
        headers={"Sec-Fetch-Site": "cross-site", "Origin": "https://portal-escolar.com"}
    )
    assert status == 403


# ==============================================================================
# BLOCO 3: FLUXOS LEGÍTIMOS DA EXTENSÃO DO CHROME (chrome-extension://*)
# ==============================================================================

def test_chrome_extension_origin_allowed(local_security_server):
    """Extensões do Chrome (chrome-extension://...) consultam /ai_engine_status com sucesso e CORS estrito."""
    ext_origin = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_status",
        headers={"Origin": ext_origin}
    )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == ext_origin
    assert "Vary" in headers
    parsed = json.loads(body)
    assert "status" in parsed or "model" in parsed or "is_cached" in parsed


def test_chrome_extension_preload_allowed(local_security_server):
    """Extensão do Chrome pode acionar POST /ai_engine_preload normalmente."""
    ext_origin = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_preload",
        method="POST",
        headers={"Origin": ext_origin, "Content-Type": "application/json"},
        data=b"{}"
    )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == ext_origin
    parsed = json.loads(body)
    assert parsed.get("ok") is True


def test_chrome_extension_task_allowed(local_security_server):
    """Extensão do Chrome pode despachar tarefas de verdade em POST /task com resposta 200 e CORS restrito."""
    ext_origin = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    mock_res = {
        "sucesso": True,
        "status": "draft_completed_pending_submit",
        "acao": "lancar_nota",
        "aluno": "Hugo Henrique"
    }
    with patch("manual_runner.execute_task_intent", new=AsyncMock(return_value=mock_res)):
        status, headers, body = make_http_request(
            f"{local_security_server}/task",
            method="POST",
            headers={"Origin": ext_origin, "Content-Type": "application/json"},
            data=json.dumps({"acao": "lancar_nota", "aluno": "Hugo Henrique"}).encode("utf-8")
        )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == ext_origin
    parsed = json.loads(body)
    assert parsed.get("sucesso") is True
    assert parsed.get("status") == "draft_completed_pending_submit"


def test_chrome_extension_natural_intent_allowed(local_security_server):
    """Extensão do Chrome pode despachar linguagem natural em POST /natural_intent."""
    ext_origin = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    status, headers, body = make_http_request(
        f"{local_security_server}/natural_intent",
        method="POST",
        headers={"Origin": ext_origin, "Content-Type": "application/json"},
        data=json.dumps({"text": "lançar nota 9.5 para o aluno Hugo", "parse_only": True}).encode("utf-8")
    )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == ext_origin
    parsed = json.loads(body)
    assert parsed.get("ok") is True or "intencao" in parsed


def test_chrome_extension_portal_status_allowed(local_security_server):
    """Extensão do Chrome pode consultar o status do portal em GET /portal_status."""
    ext_origin = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    status, headers, body = make_http_request(
        f"{local_security_server}/portal_status",
        headers={"Origin": ext_origin}
    )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == ext_origin
    parsed = json.loads(body)
    assert "state" in parsed or "label" in parsed


def test_chrome_extension_health_allowed(local_security_server):
    """Extensão do Chrome pode consultar diagnóstico do navegador em GET /health."""
    ext_origin = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    status, headers, body = make_http_request(
        f"{local_security_server}/health",
        headers={"Origin": ext_origin}
    )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == ext_origin
    parsed = json.loads(body)
    assert "chrome_cdp" in parsed


def test_chrome_extension_ask_page_allowed(local_security_server):
    """Extensão do Chrome pode fazer perguntas sobre a página em POST /ask_page."""
    ext_origin = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    status, headers, body = make_http_request(
        f"{local_security_server}/ask_page",
        method="POST",
        headers={"Origin": ext_origin, "Content-Type": "application/json"},
        data=json.dumps({"query": "qual a média da turma?", "page_data": {}}).encode("utf-8")
    )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == ext_origin
    parsed = json.loads(body)
    assert parsed.get("sucesso") is True


# ==============================================================================
# BLOCO 4: FLUXOS LOCAIS (DASHBOARD EM 127.0.0.1 / LOCALHOST & CLI PYTHON)
# ==============================================================================

def test_localhost_dashboard_origin_allowed(local_security_server):
    """Dashboard de debug em localhost tem acesso liberado com reflexão da origem."""
    local_origin = "http://localhost:8765"
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_status",
        headers={"Origin": local_origin}
    )
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == local_origin


def test_direct_local_cli_no_origin_allowed(local_security_server):
    """Scripts Python, testes locais e chamadas CLI sem header Origin são aceitos normalmente."""
    status, headers, body = make_http_request(
        f"{local_security_server}/ai_engine_status",
        headers={}  # Sem Origin
    )
    assert status == 200
    parsed = json.loads(body)
    assert isinstance(parsed, dict)
