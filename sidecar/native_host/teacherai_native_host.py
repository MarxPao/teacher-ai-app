"""
teacherai_native_host.py — Chrome Native Messaging Host para Teacher AI
Comunica-se com a extensão do Chrome via stdin/stdout binário (RFC do Chrome Native Messaging).
Permite verificar o status e iniciar silenciosamente o sidecar em background via pythonw.exe.
"""

import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import time

# Garante que nenhum print vá para o stdout para não corromper o framing binário
LOG_FILE = Path(__file__).resolve().parent / "teacherai_native_host.log"


def log(message: str):
    """Registra mensagens de depuração no arquivo de log do host nativo."""
    try:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Verifica se uma porta TCP local está aberta e respondendo."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.6)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False


def get_pythonw_executable() -> str:
    """Localiza o executável pythonw.exe correspondente ao ambiente atual."""
    current_python = sys.executable
    parent = Path(current_python).parent

    # Tenta pythonw.exe no mesmo diretório do Python atual
    candidate = parent / "pythonw.exe"
    if candidate.exists():
        return str(candidate)

    # Tenta caminho padrão do usuário se conhecido
    default_user = Path(r"C:\Users\rafae\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe")
    if default_user.exists():
        return str(default_user)

    # Fallback para sys.executable
    return current_python


def send_message(msg: dict, stream=None):
    """Envia mensagem formatada conforme especificação do Chrome Native Messaging."""
    try:
        out = stream if stream is not None else sys.stdout.buffer
        encoded_content = json.dumps(msg, ensure_ascii=False).encode("utf-8")
        length_prefix = struct.pack("@I", len(encoded_content))
        out.write(length_prefix)
        out.write(encoded_content)
        out.flush()
        log(f"Enviado: {msg.get('action') or msg.get('success')}")
    except Exception as e:
        log(f"Erro ao enviar mensagem: {e}")


def read_message(stream=None) -> dict | None:
    """Lê uma mensagem empacotada do stdin do Chrome."""
    try:
        inp = stream if stream is not None else sys.stdin.buffer
        raw_length = inp.read(4)
        if not raw_length or len(raw_length) < 4:
            return None
        msg_length = struct.unpack("@I", raw_length)[0]
        raw_content = inp.read(msg_length)
        if not raw_content:
            return None
        return json.loads(raw_content.decode("utf-8"))
    except Exception as e:
        log(f"Erro ao ler mensagem: {e}")
        return None


def launch_sidecar_process() -> dict:
    """Inicia o processo manual_runner.py --tray em segundo plano e sem janela de console."""
    is_8765 = is_port_in_use(8765)
    is_8766 = is_port_in_use(8766)

    if is_8765 or is_8766:
        log("Sidecar já está em execução (portas detectadas).")
        return {
            "success": True,
            "message": "Sidecar já estava em execução",
            "already_running": True,
            "port_8765": is_8765,
            "port_8766": is_8766
        }

    sidecar_dir = Path(__file__).resolve().parent.parent
    manual_runner = sidecar_dir / "manual_runner.py"

    if not manual_runner.exists():
        log(f"Erro: manual_runner.py não encontrado em {manual_runner}")
        return {
            "success": False,
            "message": f"Arquivo não encontrado: {manual_runner}"
        }

    pythonw = get_pythonw_executable()
    log(f"Iniciando sidecar via: {pythonw} {manual_runner} --tray")

    try:
        # Flags para desanexar completamente o processo sem janela de console no Windows
        creation_flags = 0
        if os.name == "nt":
            creation_flags = (
                subprocess.DETACHED_PROCESS |
                subprocess.CREATE_NEW_PROCESS_GROUP
            )

        proc = subprocess.Popen(
            [pythonw, str(manual_runner), "--tray"],
            cwd=str(sidecar_dir),
            creationflags=creation_flags,
            close_fds=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        log(f"Sidecar disparado com PID: {proc.pid}")

        # Aguarda brevemente para verificar se a porta sobe
        for _ in range(10):
            time.sleep(0.3)
            if is_port_in_use(8765) or is_port_in_use(8766):
                log("Sidecar confirmado e respondendo em porta local.")
                break

        return {
            "success": True,
            "message": "Sidecar iniciado com sucesso via Native Messaging",
            "pid": proc.pid,
            "method": "caminho_b_native_messaging"
        }
    except Exception as e:
        log(f"Falha ao iniciar processo do sidecar: {e}")
        return {
            "success": False,
            "message": f"Falha ao iniciar processo: {e}"
        }


def handle_request(req: dict) -> dict:
    """Processa ações recebidas da extensão."""
    action = req.get("action")
    log(f"Ação recebida: {action}")

    if action == "ping":
        return {
            "success": True,
            "pong": True,
            "timestamp": time.time()
        }

    if action == "get_status":
        is_8765 = is_port_in_use(8765)
        is_8766 = is_port_in_use(8766)
        return {
            "success": True,
            "running": (is_8765 or is_8766),
            "port_8765": is_8765,
            "port_8766": is_8766
        }

    if action == "launch_sidecar":
        return launch_sidecar_process()

    return {
        "success": False,
        "message": f"Ação desconhecida: {action}"
    }


def main():
    log("Iniciando Teacher AI Native Messaging Host...")
    try:
        while True:
            msg = read_message()
            if msg is None:
                log("Conexão stdin encerrada pelo Chrome. Finalizando host nativo.")
                break
            response = handle_request(msg)
            send_message(response)
    except Exception as e:
        log(f"Erro fatal no loop principal: {e}")


if __name__ == "__main__":
    main()
