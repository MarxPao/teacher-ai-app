"""
chrome_launcher.py — Launcher Dedicado do Chrome para o Teacher AI (Etapa 1)

Responsabilidade única: garantir que um Chrome com perfil ISOLADO e porta CDP
esteja em execução e responsivo, sem nunca fechar o Chrome pessoal da professora.

Perfil dedicado em: %LOCALAPPDATA%\\TeacherAI\\browser_profile
Porta CDP: 9222

Uso direto:
    python chrome_launcher.py             -> abre/confirma o Chrome dedicado
    python chrome_launcher.py --check     -> apenas verifica se está pronto (sem abrir)
    python chrome_launcher.py --kill      -> fecha o Chrome dedicado (para testes)
    python chrome_launcher.py --diag      -> diagnóstico completo de sessão
"""

import argparse
import json
import os
import subprocess
import sys
import time
from typing import Optional, Tuple

# ─────────────────────────────────────────────────────────────────────────────
# Constantes
# ─────────────────────────────────────────────────────────────────────────────

CDP_PORT = 9222
CDP_URL  = f"http://localhost:{CDP_PORT}"

# Pasta do perfil dedicado — NUNCA aponta para o Chrome pessoal da professora
PROFILE_DIR = os.path.expandvars(r"%LOCALAPPDATA%\TeacherAI\browser_profile")

# Arquivo de lock que registra o PID do processo Chrome aberto por nós
PID_LOCK_FILE = os.path.join(PROFILE_DIR, "teacher_ai_chrome.pid")

# URL de boas-vindas aberta na primeira vez
FIRST_LAUNCH_URL = "about:blank"

# Flags obrigatórias para o Chrome dedicado:
#   --remote-debugging-port  -> habilita CDP
#   --no-first-run           -> suprime wizard de primeiro uso
#   --no-default-browser-check -> suprime popup "tornar padrão"
#   --restore-last-session   -> restaura abas da sessão anterior (persistência de sessão)
#   --disable-sync           -> evita sincronização com conta Google pessoal
EXTENSION_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "teacher-extension"))

CHROME_FLAGS = [
    f"--remote-debugging-port={CDP_PORT}",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    "--disable-sync",
    "--disable-background-networking",
    f"--disable-extensions-except={EXTENSION_DIR}",
    f"--load-extension={EXTENSION_DIR}",
]


# ─────────────────────────────────────────────────────────────────────────────
# Descoberta do executável do Chrome
# ─────────────────────────────────────────────────────────────────────────────

def find_chrome() -> Optional[str]:
    """Localiza o Google Chrome instalado no Windows."""
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Verificação de saúde do CDP
# ─────────────────────────────────────────────────────────────────────────────

def check_cdp_health(timeout: float = 2.0) -> Tuple[bool, str]:
    """
    Consulta http://localhost:9222/json/version.
    Retorna (pronto, mensagem).
    Não depende de nenhuma biblioteca externa — usa apenas urllib da stdlib.
    """
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{CDP_URL}/json/version",
            headers={"Host": "localhost"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
            browser = data.get("Browser", "Chrome")
            return True, f"CDP pronto: {browser}"
    except Exception as e:
        return False, f"CDP nao respondeu: {e}"


def wait_for_cdp(timeout_sec: float = 12.0, poll_interval: float = 0.5) -> Tuple[bool, str]:
    """Aguarda a porta CDP subir até `timeout_sec` segundos."""
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        ok, msg = check_cdp_health(timeout=1.0)
        if ok:
            return True, msg
        time.sleep(poll_interval)
    return False, f"Porta {CDP_PORT} nao respondeu em {timeout_sec}s."


# ─────────────────────────────────────────────────────────────────────────────
# Rastreamento do processo Chrome dedicado via PID lock
# ─────────────────────────────────────────────────────────────────────────────

def _read_pid_lock() -> Optional[int]:
    """Lê o PID salvo pelo launcher anterior. Retorna None se inválido."""
    try:
        with open(PID_LOCK_FILE, "r", encoding="utf-8") as f:
            return int(f.read().strip())
    except Exception:
        return None


def _write_pid_lock(pid: int) -> None:
    os.makedirs(PROFILE_DIR, exist_ok=True)
    with open(PID_LOCK_FILE, "w", encoding="utf-8") as f:
        f.write(str(pid))


def _process_alive(pid: int) -> bool:
    """Verifica se o processo PID ainda existe de forma silenciosa (Win32 API pura)."""
    try:
        import ctypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            return False
        exit_code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
        ctypes.windll.kernel32.CloseHandle(handle)
        return exit_code.value == 259  # STILL_ACTIVE
    except Exception:
        return False


def dedicated_chrome_is_running() -> Tuple[bool, Optional[int]]:
    """
    Retorna (esta_rodando, pid).
    Verdadeiro somente se:
      1. Temos um PID salvo de um lançamento anterior, E
      2. Esse processo ainda existe, E
      3. A porta CDP responde.
    """
    pid = _read_pid_lock()
    if pid and _process_alive(pid):
        ok, _ = check_cdp_health()
        if ok:
            return True, pid
    return False, None


# ─────────────────────────────────────────────────────────────────────────────
# Diagnóstico de sessão persistida (critério de pronto da Etapa 1)
# ─────────────────────────────────────────────────────────────────────────────

def check_session_files() -> dict:
    """
    Verifica se o perfil dedicado tem arquivos de sessão salvos em disco.
    Não descriptografa cookies (isso é responsabilidade do Chrome via DPAPI).
    Retorna metadados para diagnóstico.
    """
    profile_path = os.path.join(PROFILE_DIR, "Default")
    result = {
        "profile_dir_exists": os.path.isdir(profile_path),
        "login_data_exists": False,
        "login_data_size_bytes": 0,
        "network_dir_exists": False,
        "cookies_file_exists": False,
        "cookies_size_bytes": 0,
        "preferences_exists": False,
    }
    if result["profile_dir_exists"]:
        login_data  = os.path.join(profile_path, "Login Data")
        network_dir = os.path.join(profile_path, "Network")
        cookies     = os.path.join(network_dir, "Cookies")
        prefs       = os.path.join(profile_path, "Preferences")

        result["login_data_exists"]    = os.path.isfile(login_data)
        result["login_data_size_bytes"] = os.path.getsize(login_data) if result["login_data_exists"] else 0
        result["network_dir_exists"]   = os.path.isdir(network_dir)
        result["cookies_file_exists"]  = os.path.isfile(cookies)
        result["cookies_size_bytes"]   = os.path.getsize(cookies) if result["cookies_file_exists"] else 0
        result["preferences_exists"]   = os.path.isfile(prefs)

    return result


def get_open_tabs() -> list:
    """
    Retorna lista de {url, title} das abas abertas no Chrome dedicado.
    Requer CDP ativo.
    """
    try:
        import urllib.request
        with urllib.request.urlopen(f"{CDP_URL}/json", timeout=2.0) as resp:
            tabs = json.loads(resp.read())
            return [
                {"url": t.get("url", ""), "title": t.get("title", "")}
                for t in tabs
                if t.get("type") == "page"
                   and not t.get("url", "").startswith("chrome-extension")
                   and not t.get("url", "").startswith("chrome://")
            ]
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Lançamento / reutilização do Chrome dedicado
# ─────────────────────────────────────────────────────────────────────────────

def launch_dedicated_chrome(url: str = FIRST_LAUNCH_URL) -> Tuple[bool, str]:
    """
    Garante que o Chrome dedicado está em execução com CDP respondendo.

    Fluxo:
      1. CDP já responde (processo nosso vivo)? -> retorna imediatamente.
      2. Localiza o Chrome instalado.
      3. Cria a pasta do perfil se não existir.
      4. Inicia o Chrome com perfil dedicado + flags CDP.
      5. Salva o PID no lock file.
      6. Aguarda a porta CDP subir (até 12s).
      7. Retorna (sucesso, mensagem).
    """
    # 1. Verificação rápida: CDP já pronto com nosso processo?
    already_running, pid = dedicated_chrome_is_running()
    if already_running:
        return True, f"Navegador Teacher AI ja estava em execucao (PID {pid}). Sessao ativa."

    # 2. Localiza o Chrome
    chrome_exe = find_chrome()
    if not chrome_exe:
        return False, (
            "Google Chrome nao encontrado. "
            "Instale em https://www.google.com/chrome/ e tente novamente."
        )

    # 3. Garante que a pasta do perfil existe
    os.makedirs(os.path.join(PROFILE_DIR, "Default"), exist_ok=True)

    # 4. Monta o comando de lançamento
    cmd = [chrome_exe, f"--user-data-dir={PROFILE_DIR}", *CHROME_FLAGS, url]

    print(f"[Launcher] Iniciando Chrome dedicado...")
    print(f"[Launcher]   Perfil : {PROFILE_DIR}")
    print(f"[Launcher]   Porta  : {CDP_PORT}")

    # 5. Inicia o processo detached (Chrome sobrevive mesmo se o sidecar fechar)
    try:
        creation_flags = subprocess.DETACHED_PROCESS if sys.platform == "win32" else 0
        proc = subprocess.Popen(cmd, close_fds=True, creationflags=creation_flags)
        _write_pid_lock(proc.pid)
        print(f"[Launcher] Chrome iniciado com PID {proc.pid}.")
    except Exception as e:
        return False, f"Falha ao iniciar o Chrome: {e}"

    # 6. Aguarda a porta CDP subir
    ok, msg = wait_for_cdp(timeout_sec=12.0)
    if ok:
        return True, (
            f"Navegador Teacher AI conectado!\n"
            f"  Perfil: {PROFILE_DIR}\n"
            f"  {msg}\n"
            f"  Se for o primeiro acesso, faca login no portal da escola na janela que abriu."
        )
    else:
        return True, (
            f"Chrome iniciado mas porta CDP ainda nao respondeu (12s).\n"
            f"  {msg}\n"
            f"  O Chrome pode estar carregando. Aguarde e clique em 'Conectar' novamente."
        )


# ─────────────────────────────────────────────────────────────────────────────
# Encerrar o Chrome dedicado (útil para ciclos de teste)
# ─────────────────────────────────────────────────────────────────────────────

def kill_dedicated_chrome() -> Tuple[bool, str]:
    """
    Encerra APENAS o Chrome dedicado usando o PID salvo.
    Nao afeta o Chrome pessoal da professora.
    Trata o caso em que o Chrome ja saiu sozinho como sucesso
    (comportamento normal do modelo multi-processo do Chrome).
    """
    pid = _read_pid_lock()
    if not pid:
        return False, "Nenhum PID Teacher AI encontrado. Chrome pode ja estar fechado."

    # Se o processo ja nao existe, o Chrome saiu por conta propria — isso e aceitavel
    if not _process_alive(pid):
        try:
            os.remove(PID_LOCK_FILE)
        except Exception:
            pass
        return True, f"Chrome (PID {pid}) ja havia encerrado. Lock removido. (Comportamento normal do Chrome multi-processo)"

    try:
        import ctypes
        PROCESS_TERMINATE = 0x0001
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_TERMINATE, False, pid)
        if handle:
            ctypes.windll.kernel32.TerminateProcess(handle, 0)
            ctypes.windll.kernel32.CloseHandle(handle)
        time.sleep(0.5)
        # Verifica se saiu (seja por TerminateProcess ou auto-exit)
        if not _process_alive(pid):
            try:
                os.remove(PID_LOCK_FILE)
            except Exception:
                pass
            return True, f"Chrome dedicado (PID {pid}) encerrado com sucesso."
        else:
            return False, f"Processo {pid} nao respondeu ao encerramento apos 0.5s."
    except Exception as e:
        return False, f"Erro ao encerrar Chrome: {e}"


# ─────────────────────────────────────────────────────────────────────────────
# Diagnóstico completo (para relatório de Etapa 1)
# ─────────────────────────────────────────────────────────────────────────────

def full_diagnostic() -> dict:
    """
    Retorna todas as informações de estado para o relatório da Etapa 1.
    Chamado pelos testes de persistência de sessão.
    """
    cdp_ok, cdp_msg    = check_cdp_health()
    is_running, pid     = dedicated_chrome_is_running()
    session             = check_session_files()
    tabs                = get_open_tabs() if cdp_ok else []

    return {
        "cdp_ready"                : cdp_ok,
        "cdp_message"              : cdp_msg,
        "dedicated_chrome_running" : is_running,
        "chrome_pid"               : pid,
        "profile_dir"              : PROFILE_DIR,
        "session"                  : session,
        "open_tabs"                : tabs,
        "chrome_exe"               : find_chrome(),
    }


def _print_diagnostic():
    d = full_diagnostic()
    print("\n--- Diagnostico Teacher AI Chrome Launcher ---")
    print(f"  CDP Pronto         : {'SIM' if d['cdp_ready'] else 'NAO'} — {d['cdp_message']}")
    print(f"  Chrome Dedicado    : {'Rodando' if d['dedicated_chrome_running'] else 'Parado'} (PID: {d['chrome_pid']})")
    print(f"  Perfil em disco    : {d['profile_dir']}")
    s = d['session']
    print(f"  Cookies em disco   : {'Presente' if s.get('cookies_file_exists') else 'Ainda nao existe'} ({s.get('cookies_size_bytes', 0)} bytes)")
    print(f"  Login Data         : {'Presente' if s.get('login_data_exists') else 'Nao encontrado'} ({s.get('login_data_size_bytes', 0)} bytes)")
    print(f"  Abas abertas       : {len(d['open_tabs'])}")
    for tab in d['open_tabs'][:5]:
        print(f"    - {tab['title'] or tab['url']}")
    print(f"  Chrome instalado   : {d['chrome_exe'] or 'NAO ENCONTRADO'}")
    print("----------------------------------------------\n")


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Launcher do Chrome dedicado para o Teacher AI"
    )
    parser.add_argument("--check", action="store_true", help="Verifica estado sem abrir o Chrome")
    parser.add_argument("--kill",  action="store_true", help="Encerra o Chrome dedicado")
    parser.add_argument("--url",   default=FIRST_LAUNCH_URL, help="URL a abrir na inicializacao")
    parser.add_argument("--diag",  action="store_true", help="Exibe diagnostico completo e sai")
    args = parser.parse_args()

    if args.kill:
        ok, msg = kill_dedicated_chrome()
        print(msg)
        sys.exit(0 if ok else 1)

    if args.check or args.diag:
        _print_diagnostic()
        ok, _ = check_cdp_health()
        sys.exit(0 if ok else 1)

    # Lancamento normal
    print("\n=== Teacher AI — Conectando Navegador ===")
    ok, msg = launch_dedicated_chrome(url=args.url)
    print(msg)
    print()

    if ok:
        _print_diagnostic()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
