"""
test_trio_optimizations.py — Testes Unitários do Trio de Conexão com Portais (GAPs 1, 3 e 7)

Cobre:
1. GAP 7: Probing rápido de socket TCP em check_cdp_health (evita timeout HTTP de 2s)
2. GAP 7: wait_for_cdp com detecção acelerada de porta fechada
3. GAP 7: Resposta de versão HTTP quando socket está aberto
"""

import http.server
import socket
import threading
import time
import pytest

import sidecar.chrome_launcher as launcher


def test_cdp_health_closed_port_fails_fast():
    """Valida que uma porta fechada é detectada em menos de 200ms via socket probe rápido."""
    # Encontra uma porta livre que certamente não tem servidor escutando
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    free_port = sock.getsockname()[1]
    sock.close()

    # Aponta temporariamente CDP_PORT e CDP_URL para a porta fechada
    original_port = launcher.CDP_PORT
    original_url = launcher.CDP_URL
    try:
        launcher.CDP_PORT = free_port
        launcher.CDP_URL = f"http://127.0.0.1:{free_port}"

        t0 = time.monotonic()
        ok, msg = launcher.check_cdp_health(timeout=2.0, probe_timeout=0.15)
        elapsed = time.monotonic() - t0

        assert not ok
        assert f"Porta CDP {free_port} fechada" in msg or "inacessivel" in msg
        # Deve ter retornado muito antes dos 2.0s de timeout HTTP
        assert elapsed < 0.25, f"Probe demorou {elapsed:.3f}s (esperado < 0.25s)"
    finally:
        launcher.CDP_PORT = original_port
        launcher.CDP_URL = original_url


def test_cdp_health_open_port_http_success():
    """Valida resposta com sucesso quando a porta está aberta e o endpoint /json/version responde."""
    class DummyVersionHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/json/version":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"Browser": "Chrome/123.0.0.0", "Protocol-Version": "1.3"}')
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format, *args):
            pass  # Silencia logs no terminal

    server = http.server.HTTPServer(("127.0.0.1", 0), DummyVersionHandler)
    server_port = server.server_port
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    original_port = launcher.CDP_PORT
    original_url = launcher.CDP_URL
    try:
        launcher.CDP_PORT = server_port
        launcher.CDP_URL = f"http://127.0.0.1:{server_port}"

        ok, msg = launcher.check_cdp_health(timeout=1.0, probe_timeout=0.15)
        assert ok
        assert "CDP pronto: Chrome/123.0.0.0" in msg
    finally:
        server.shutdown()
        server.server_close()
        launcher.CDP_PORT = original_port
        launcher.CDP_URL = original_url


def test_wait_for_cdp_timeout():
    """Valida que wait_for_cdp respeita timeout e sai rapidamente em porta fechada."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    free_port = sock.getsockname()[1]
    sock.close()

    original_port = launcher.CDP_PORT
    original_url = launcher.CDP_URL
    try:
        launcher.CDP_PORT = free_port
        launcher.CDP_URL = f"http://127.0.0.1:{free_port}"

        t0 = time.monotonic()
        ok, msg = launcher.wait_for_cdp(timeout_sec=0.6, poll_interval=0.1)
        elapsed = time.monotonic() - t0

        assert not ok
        assert f"Porta {free_port} nao respondeu" in msg
        assert 0.5 <= elapsed <= 1.2
    finally:
        launcher.CDP_PORT = original_port
        launcher.CDP_URL = original_url


def test_portal_map_store_l1_cache_and_invalidation():
    """Valida L1 cache em memória de PortalMapStore e invalidação automática em mutações (GAP 6)."""
    from sidecar.portal_map_store import PortalMapStore

    store = PortalMapStore(supabase_client=None)
    domain = "escola-teste.portal.com.br"
    selectors = {"btn_salvar": "#salvar-v1"}

    # Salva mapa inicial
    map_id = store.save_map(domain=domain, selectors=selectors, confidence="high")
    assert map_id

    # Cache L1 deve estar limpo após o save_map
    assert domain not in store._l1_cache

    # Primeiro lookup popula o cache L1
    m1 = store.lookup_map(domain)
    assert m1 is not None
    assert domain in store._l1_cache
    cached_ts, cached_map = store._l1_cache[domain]
    assert cached_map == m1

    # Segundo lookup deve vir diretamente do cache L1
    m2 = store.lookup_map(domain)
    assert m2 is m1

    # Mutação (mark_validated) deve invalidar o L1 cache
    store.mark_validated(domain)
    assert domain not in store._l1_cache


def test_cdp_connector_check_health_fast_socket_probe():
    """Valida que cdp_connector.check_health detecta porta fechada em <200ms sem travar 2s (GAP 2)."""
    from sidecar.cdp_connector import CDPConnector

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    free_port = sock.getsockname()[1]
    sock.close()

    connector = CDPConnector(cdp_url=f"http://127.0.0.1:{free_port}")

    t0 = time.monotonic()
    ok, msg = connector.check_health()
    elapsed = time.monotonic() - t0

    assert not ok
    assert elapsed < 0.35, f"check_health demorou {elapsed:.3f}s (esperado < 0.35s)"

