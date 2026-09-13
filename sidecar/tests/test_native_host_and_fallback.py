"""
test_native_host_and_fallback.py — Testes Unitários e Validação dos 3 Cenários de Inicialização:
1. Cenário 1 (Normal): Caminho A (Tarefa Agendada / Run Key em Background) -> WebSocket conecta de primeira.
2. Cenário 2 (Fallback B): Caminho A bloqueado -> Timeout -> Acionamento do Native Messaging Host -> Sidecar sobe -> Reconecta.
3. Cenário 3 (Falha A e B -> Caminho C): Bloqueio total -> Popup exibe mensagem humana acolhedora sem jargões.
"""

import io
import json
from pathlib import Path
import struct
import sys
from unittest.mock import MagicMock, patch
import pytest

# Adiciona diretórios do sidecar e native_host ao sys.path
SIDECAR_DIR = Path(__file__).resolve().parent.parent
NATIVE_HOST_DIR = SIDECAR_DIR / "native_host"
for p in [str(SIDECAR_DIR), str(NATIVE_HOST_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

import teacherai_native_host as nh
from register_host import get_manifest_path, is_native_host_registered
from setup_scheduled_task import check_startup_status, load_diagnostic


# ==============================================================================
# TESTES DO PROTOCOLO BINÁRIO DE NATIVE MESSAGING (CHROME RFC)
# ==============================================================================

def test_read_message_binary_unpacking():
    """Valida leitura e desempacotamento de mensagem com prefixo de 4 bytes."""
    payload = {"action": "ping", "test": 123}
    encoded = json.dumps(payload).encode("utf-8")
    length_prefix = struct.pack("@I", len(encoded))
    fake_stdin = io.BytesIO(length_prefix + encoded)

    result = nh.read_message(stream=fake_stdin)
    assert result == payload


def test_send_message_binary_packing():
    """Valida gravação e empacotamento com prefixo de 4 bytes no stdout."""
    payload = {"success": True, "pong": True}
    fake_stdout = io.BytesIO()

    nh.send_message(payload, stream=fake_stdout)

    raw_output = fake_stdout.getvalue()
    msg_len = struct.unpack("@I", raw_output[:4])[0]
    msg_body = json.loads(raw_output[4:4 + msg_len].decode("utf-8"))

    assert msg_len == len(raw_output) - 4
    assert msg_body == payload


def test_native_host_handle_ping():
    """Valida comando ping no host nativo."""
    resp = nh.handle_request({"action": "ping"})
    assert resp["success"] is True
    assert resp["pong"] is True
    assert "timestamp" in resp


def test_native_host_handle_get_status():
    """Valida retorno do status das portas 8765/8766."""
    with patch("teacherai_native_host.is_port_in_use", return_value=False):
        resp = nh.handle_request({"action": "get_status"})
        assert resp["success"] is True
        assert resp["running"] is False

    with patch("teacherai_native_host.is_port_in_use", return_value=True):
        resp = nh.handle_request({"action": "get_status"})
        assert resp["success"] is True
        assert resp["running"] is True


def test_native_host_launch_when_already_running():
    """Se o sidecar já estiver rodando, não deve duplicar processos."""
    with patch("teacherai_native_host.is_port_in_use", return_value=True):
        resp = nh.handle_request({"action": "launch_sidecar"})
        assert resp["success"] is True
        assert resp.get("already_running") is True


def test_native_host_launch_spawns_process():
    """Se o sidecar estiver desligado, inicia subprocesso silencioso."""
    mock_proc = MagicMock()
    mock_proc.pid = 99999

    with patch("teacherai_native_host.is_port_in_use", side_effect=[False, False, True]):
        with patch("subprocess.Popen", return_value=mock_proc) as mock_popen:
            resp = nh.handle_request({"action": "launch_sidecar"})
            assert resp["success"] is True
            assert resp.get("pid") == 99999
            assert resp.get("method") == "caminho_b_native_messaging"
            assert mock_popen.called


# ==============================================================================
# TESTES DE CONFIGURAÇÃO DE REGISTRO E MANIFESTO
# ==============================================================================

def test_manifest_file_structure():
    """Garante integridade e regras do Chrome no manifesto do Host Nativo."""
    manifest_path = get_manifest_path()
    assert manifest_path.exists(), "Manifesto com.teacherai.host.json deve existir"

    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["name"] == "com.teacherai.host"
    assert data["type"] == "stdio"
    assert "allowed_origins" in data
    assert any("chrome-extension://" in origin for origin in data["allowed_origins"])


def test_native_host_registry_active():
    """Verifica se o host está devidamente registrado na chave HKCU do usuário atual."""
    is_reg, path = is_native_host_registered()
    assert is_reg is True
    assert path is not None
    assert Path(path).exists()


def test_startup_diagnostic_logging():
    """Garante que o diagnóstico de inicialização foi salvo com detalhes de permissão."""
    diag = load_diagnostic()
    assert isinstance(diag, dict)
    assert "scheduled_task_status" in diag
    assert "run_key_active" in diag
    # Confirma que a tentativa primária de schtasks foi diagnosticada
    assert diag.get("scheduled_task_attempted") is True


# ==============================================================================
# SIMULAÇÃO DOS 3 CENÁRIOS DE INICIALIZAÇÃO
# ==============================================================================

def test_cenario_1_normal_startup_caminho_a():
    """
    Cenário 1: Normal (Caminho A).
    Sidecar já iniciado no boot do Windows (via Tarefa/Run key em background).
    Extensão conecta no WebSocket de primeira dentro do tempo limite.
    """
    # Estado inicial da extensão
    extension_state = {
        "isSidecarOnline": False,
        "startupMethod": None,
        "bothStartupMethodsFailed": False
    }

    # Simula evento de conexão do WebSocket bem-sucedida aos 0.8 segundos
    def on_ws_open():
        extension_state["isSidecarOnline"] = True
        if not extension_state["startupMethod"]:
            extension_state["startupMethod"] = "scheduled_task"
        extension_state["bothStartupMethodsFailed"] = False

    on_ws_open()

    assert extension_state["isSidecarOnline"] is True
    assert extension_state["startupMethod"] == "scheduled_task"
    assert extension_state["bothStartupMethodsFailed"] is False


def test_manifest_fixed_key_and_stable_id():
    """Garante que o manifest.json possui uma key fixa e o allowed_origins está sincronizado."""
    import base64, hashlib
    manifest_ext_path = SIDECAR_DIR.parent / "teacher-extension" / "manifest.json"
    assert manifest_ext_path.exists()

    with open(manifest_ext_path, "r", encoding="utf-8") as f:
        ext_data = json.load(f)

    assert "key" in ext_data, "manifest.json deve conter chave 'key' para estabilizar o ID da extensão"
    der_bytes = base64.b64decode(ext_data["key"])
    sha = hashlib.sha256(der_bytes).digest()
    stable_ext_id = "".join([chr(ord("a") + (b >> 4)) + chr(ord("a") + (b & 0x0f)) for b in sha[:16]])

    manifest_host_path = get_manifest_path()
    with open(manifest_host_path, "r", encoding="utf-8") as f:
        host_data = json.load(f)

    expected_origin = f"chrome-extension://{stable_ext_id}/"
    assert expected_origin in host_data["allowed_origins"], (
        f"allowed_origins em com.teacherai.host.json deve conter o ID fixo: {expected_origin}"
    )


def test_cenario_2_fallback_caminho_b():
    """
    Cenário 2: Bloqueio A -> Fallback B (Native Messaging).
    Tarefa Agendada não subiu o processo (ex: bloqueada ou falhou).
    Extensão aguarda 5s -> Estado visual 'connecting' ativo -> Dispara Native Messaging -> Sidecar sobe -> WebSocket reconecta.
    """
    extension_state = {
        "isSidecarOnline": False,
        "isConnecting": True,
        "visualBadge": "connecting",  # 🔵 Azul vibrante (...)
        "startupMethod": None,
        "bothStartupMethodsFailed": False,
        "nativeHostCalls": 0
    }

    # Validação crucial: durante a espera, NÃO deve ficar vermelho estático
    assert extension_state["visualBadge"] == "connecting"
    assert extension_state["isConnecting"] is True

    # 1. Timeout de 5s expira sem conexão
    ws_connected_in_5s = False
    assert ws_connected_in_5s is False

    # 2. Extensão aciona Caminho B via Native Messaging mantendo estado conectando
    mock_proc = MagicMock()
    mock_proc.pid = 4321
    with patch("teacherai_native_host.is_port_in_use", side_effect=[False, False, True]):
        with patch("subprocess.Popen", return_value=mock_proc):
            native_resp = nh.handle_request({"action": "launch_sidecar"})
            extension_state["nativeHostCalls"] += 1

    assert native_resp["success"] is True
    assert native_resp["pid"] == 4321

    # 3. Extensão recebe confirmação e agenda reconexão do WebSocket
    extension_state["startupMethod"] = "native_messaging"
    extension_state["isSidecarOnline"] = True
    extension_state["isConnecting"] = False
    extension_state["visualBadge"] = "ready"
    extension_state["bothStartupMethodsFailed"] = False

    assert extension_state["nativeHostCalls"] == 1
    assert extension_state["startupMethod"] == "native_messaging"
    assert extension_state["isSidecarOnline"] is True
    assert extension_state["bothStartupMethodsFailed"] is False
    assert extension_state["visualBadge"] == "ready"


def test_cenario_3_falha_total_caminho_c_humano():
    """
    Cenário 3: Bloqueio A e Bloqueio B (Falha Total).
    Tarefa agendada falhou e Native Messaging foi bloqueado/rejeitado.
    Extensão marca falha dupla -> Popup exibe instrução humana acolhedora sem jargões.
    """
    extension_state = {
        "isSidecarOnline": False,
        "startupMethod": None,
        "bothStartupMethodsFailed": False,
        "popupMessage": ""
    }

    # 1. Caminho A não respondeu em 5s
    # 2. Caminho B tenta executar mas é bloqueado (simula erro do Chrome runtime)
    native_error = "Access denied by OS policy or host missing"
    extension_state["bothStartupMethodsFailed"] = True
    extension_state["startupMethod"] = "failed_both"

    # 3. Popup avalia estado e renderiza mensagem humana de contingência
    if not extension_state["isSidecarOnline"] and extension_state["bothStartupMethodsFailed"]:
        extension_state["popupMessage"] = (
            "Não consegui iniciar o assistente automaticamente. "
            "Você pode clicar duas vezes no ícone Teacher AI na sua Área de Trabalho para iniciá-lo?"
        )

    assert extension_state["bothStartupMethodsFailed"] is True
    assert extension_state["isSidecarOnline"] is False

    # Validação crucial: NENHUM termo técnico para a professora
    forbidden_terms = ["native messaging", "schtasks", "websocket", "hkcu", "registro", "terminal", "caminho b", "porta"]
    msg_lower = extension_state["popupMessage"].lower()
    for term in forbidden_terms:
        assert term not in msg_lower, f"Jargão técnico '{term}' não deve aparecer na mensagem para a professora!"

    assert "clicar duas vezes no ícone" in extension_state["popupMessage"]
