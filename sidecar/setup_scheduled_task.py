"""
setup_scheduled_task.py — Registro de Inicialização Automática do Teacher AI no Logon do Windows (Caminho A)
Tenta registrar via Tarefa Agendada (schtasks /SC ONLOGON). Se houver restrição de permissão (UAC/GPO),
aplica fallback transparente para HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run e salva diagnóstico.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
import time
import winreg

TASK_NAME = "TeacherAISidecar"
RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
DIAGNOSTIC_FILE = Path(__file__).resolve().parent / "startup_diagnostic.json"


def get_pythonw_path() -> str:
    current_python = sys.executable
    parent = Path(current_python).parent

    candidate = parent / "pythonw.exe"
    if candidate.exists():
        return str(candidate)

    default_user = Path(r"C:\Users\rafae\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe")
    if default_user.exists():
        return str(default_user)

    return current_python


def get_target_command() -> str:
    pythonw = get_pythonw_path()
    manual_runner = Path(__file__).resolve().parent / "manual_runner.py"
    return f'"{pythonw}" "{manual_runner}" --tray'


def save_diagnostic(diag: dict):
    try:
        with open(DIAGNOSTIC_FILE, "w", encoding="utf-8") as f:
            json.dump(diag, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Aviso] Não foi possível gravar diagnóstico de startup: {e}")


def load_diagnostic() -> dict:
    if DIAGNOSTIC_FILE.exists():
        try:
            with open(DIAGNOSTIC_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def install_run_key(target_cmd: str) -> tuple[bool, str]:
    """Fallback no registro do usuário atual (HKCU Run) que dispensa permissões de administrador."""
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY_PATH)
        winreg.SetValueEx(key, TASK_NAME, 0, winreg.REG_SZ, target_cmd)
        winreg.CloseKey(key)
        return True, f"Chave de inicialização registrada com sucesso em HKCU\\{RUN_KEY_PATH}\\{TASK_NAME}"
    except Exception as e:
        return False, f"Falha ao registrar em HKCU Run: {e}"


def uninstall_run_key() -> tuple[bool, str]:
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY_PATH, 0, winreg.KEY_ALL_ACCESS)
        winreg.DeleteValue(key, TASK_NAME)
        winreg.CloseKey(key)
        return True, "Chave HKCU Run removida com sucesso."
    except FileNotFoundError:
        return True, "Chave HKCU Run não existia."
    except Exception as e:
        return False, f"Erro ao remover chave HKCU Run: {e}"


def is_run_key_installed() -> tuple[bool, str | None]:
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY_PATH, 0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, TASK_NAME)
        winreg.CloseKey(key)
        return True, val
    except FileNotFoundError:
        return False, None
    except Exception as e:
        return False, str(e)


def create_desktop_shortcut() -> tuple[bool, str]:
    """Cria atalho 'Teacher AI' na Área de Trabalho para contingência com 1 clique duplo da professora."""
    try:
        desktop_dir = Path.home() / "Desktop"
        if not desktop_dir.exists():
            desktop_dir = Path(os.environ.get("USERPROFILE", "")) / "Desktop"

        shortcut_path = desktop_dir / "Teacher AI.lnk"
        pythonw = get_pythonw_path()
        manual_runner = Path(__file__).resolve().parent / "manual_runner.py"

        ps_script = f'''
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut('{shortcut_path}')
        $Shortcut.TargetPath = '{pythonw}'
        $Shortcut.Arguments = '"{manual_runner}" --tray'
        $Shortcut.WorkingDirectory = '{manual_runner.parent}'
        $Shortcut.Description = "Teacher AI - Assistente Agêntico"
        $Shortcut.Save()
        '''
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            check=False
        )
        if proc.returncode == 0 and shortcut_path.exists():
            return True, f"Atalho criado com sucesso na Área de Trabalho: {shortcut_path}"
        return False, f"Falha ao criar atalho: {proc.stderr.strip() or proc.stdout.strip()}"
    except Exception as e:
        return False, f"Erro ao criar atalho: {e}"


def is_desktop_shortcut_installed() -> bool:
    desktop_dir = Path.home() / "Desktop"
    if not desktop_dir.exists():
        desktop_dir = Path(os.environ.get("USERPROFILE", "")) / "Desktop"
    return (desktop_dir / "Teacher AI.lnk").exists()


def is_scheduled_task_installed() -> tuple[bool, str]:
    """Verifica se a tarefa agendada existe no Windows Task Scheduler."""
    try:
        proc = subprocess.run(
            ["schtasks", "/Query", "/TN", TASK_NAME],
            capture_output=True,
            text=True,
            check=False
        )
        if proc.returncode == 0:
            return True, proc.stdout.strip()
        return False, proc.stderr.strip()
    except Exception as e:
        return False, str(e)


def install_startup_mechanism() -> dict:
    """
    Tenta registrar a tarefa agendada (schtasks ONLOGON).
    Se for bloqueada por permissão do Windows (UAC), ativa o fallback para HKCU Run
    e grava o diagnóstico completo para auditoria.
    """
    target_cmd = get_target_command()
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    diagnostic = {
        "timestamp": timestamp,
        "target_command": target_cmd,
        "pythonw_path": get_pythonw_path(),
        "scheduled_task_attempted": True,
        "scheduled_task_active": False,
        "scheduled_task_status": "unknown",
        "scheduled_task_details": "",
        "run_key_active": False,
        "run_key_status": "not_attempted",
        "primary_mechanism": None
    }

    print(f"[*] Configurando inicialização automática para: {target_cmd}")

    # Tentativa 1: schtasks /SC ONLOGON
    try:
        cmd = [
            "schtasks", "/Create",
            "/TN", TASK_NAME,
            "/TR", target_cmd,
            "/SC", "ONLOGON",
            "/F"
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)

        if proc.returncode == 0:
            diagnostic["scheduled_task_active"] = True
            diagnostic["scheduled_task_status"] = "active"
            diagnostic["scheduled_task_details"] = proc.stdout.strip()
            diagnostic["primary_mechanism"] = "schtasks_onlogon"
            print(" ✅ Tarefa Agendada (schtasks ONLOGON) criada com sucesso!")
        else:
            err_msg = proc.stderr.strip() or proc.stdout.strip()
            diagnostic["scheduled_task_active"] = False
            diagnostic["scheduled_task_status"] = "blocked_or_permission_denied"
            diagnostic["scheduled_task_details"] = err_msg
            print(f" ⚠️  schtasks retornou erro/bloqueio: {err_msg}")
            print(" 🔄 Acionando fallback transparente de usuário (HKCU Run Key)...")
    except Exception as e:
        diagnostic["scheduled_task_status"] = "exception"
        diagnostic["scheduled_task_details"] = str(e)
        print(f" ⚠️  Exceção ao chamar schtasks: {e}")

    # Se a tarefa agendada falhou, registra na Run Key do usuário (não requer admin)
    if not diagnostic["scheduled_task_active"]:
        ok_run, msg_run = install_run_key(target_cmd)
        if ok_run:
            diagnostic["run_key_active"] = True
            diagnostic["run_key_status"] = "active"
            diagnostic["primary_mechanism"] = "hkcu_run_key"
            print(f" ✅ Fallback HKCU Run ativado com sucesso! ({msg_run})")
        else:
            diagnostic["run_key_active"] = False
            diagnostic["run_key_status"] = "failed"
            diagnostic["run_key_details"] = msg_run
    # Cria atalho na Área de Trabalho para o cenário de contingência com 1 clique duplo
    ok_desk, msg_desk = create_desktop_shortcut()
    diagnostic["desktop_shortcut_active"] = ok_desk
    diagnostic["desktop_shortcut_details"] = msg_desk
    if ok_desk:
        print(f" ✅ {msg_desk}")
    else:
        print(f" ⚠️  Não foi possível criar atalho na Área de Trabalho: {msg_desk}")

    save_diagnostic(diagnostic)
    return diagnostic


def uninstall_startup_mechanism() -> dict:
    """Remove a tarefa agendada, chave de inicialização HKCU e atalho da Área de Trabalho."""
    results = {}
    try:
        proc = subprocess.run(
            ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
            capture_output=True,
            text=True,
            check=False
        )
        results["schtasks_removed"] = (proc.returncode == 0)
        results["schtasks_output"] = proc.stdout.strip() or proc.stderr.strip()
    except Exception as e:
        results["schtasks_removed"] = False
        results["schtasks_error"] = str(e)

    ok_run, msg_run = uninstall_run_key()
    results["run_key_removed"] = ok_run
    results["run_key_output"] = msg_run

    # Remove atalho da Área de Trabalho
    desktop_dir = Path.home() / "Desktop"
    if not desktop_dir.exists():
        desktop_dir = Path(os.environ.get("USERPROFILE", "")) / "Desktop"
    shortcut_path = desktop_dir / "Teacher AI.lnk"
    if shortcut_path.exists():
        try:
            shortcut_path.unlink()
            results["desktop_shortcut_removed"] = True
        except Exception as e:
            results["desktop_shortcut_removed"] = False
            results["desktop_shortcut_error"] = str(e)
    else:
        results["desktop_shortcut_removed"] = True

    save_diagnostic({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "scheduled_task_active": False,
        "run_key_active": False,
        "desktop_shortcut_active": False,
        "uninstalled": True
    })
    return results


def check_startup_status() -> dict:
    """Verifica e retorna o status em tempo real dos mecanismos de inicialização."""
    task_ok, task_info = is_scheduled_task_installed()
    run_ok, run_val = is_run_key_installed()
    desk_ok = is_desktop_shortcut_installed()
    diag = load_diagnostic()

    return {
        "scheduled_task_active": task_ok,
        "scheduled_task_info": task_info,
        "run_key_active": run_ok,
        "run_key_command": run_val,
        "desktop_shortcut_active": desk_ok,
        "diagnostic_log": diag,
        "is_configured": (task_ok or run_ok),
        "active_mechanism": "schtasks" if task_ok else ("hkcu_run" if run_ok else None)
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Configurador de Inicialização Automática Teacher AI (Caminho A)")
    parser.add_argument("--install", action="store_true", help="Instala a tarefa agendada com fallback em HKCU Run")
    parser.add_argument("--uninstall", action="store_true", help="Remove tarefa agendada e chave de inicialização")
    parser.add_argument("--check", action="store_true", help="Verifica status atual da inicialização")
    args = parser.parse_args()

    if args.uninstall:
        res = uninstall_startup_mechanism()
        print(f"[OK] Desinstalação concluída: {json.dumps(res, indent=2)}")
    elif args.check:
        status = check_startup_status()
        print(json.dumps(status, indent=2, ensure_ascii=False))
    else:
        # Padrão é instalar
        diag = install_startup_mechanism()
        print("\nResultado da configuração:")
        print(json.dumps(diag, indent=2, ensure_ascii=False))
