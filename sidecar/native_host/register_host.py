"""
register_host.py — Registra o Host de Native Messaging do Teacher AI no Registro do Windows (HKCU)
Não requer privilégios de administrador (executa no espaço do usuário atual).
"""

import argparse
from pathlib import Path
import sys
import winreg

HOST_NAME = "com.teacherai.host"
REG_PATH = rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"


def get_manifest_path() -> Path:
    return Path(__file__).resolve().parent / f"{HOST_NAME}.json"


def register_native_host(manifest_path: Path | None = None) -> tuple[bool, str]:
    """Registra o manifesto do host no HKCU do Windows."""
    if manifest_path is None:
        manifest_path = get_manifest_path()

    if not manifest_path.exists():
        return False, f"Arquivo de manifesto não encontrado: {manifest_path}"

    try:
        # Cria ou abre a chave no HKCU (HKEY_CURRENT_USER)
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_PATH)
        # Define o valor padrão (Default) como o caminho absoluto do arquivo JSON
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path.resolve()))
        winreg.CloseKey(key)
        return True, f"Host registrado com sucesso em HKCU\\{REG_PATH} -> {manifest_path}"
    except Exception as e:
        return False, f"Falha ao registrar chave no Registro: {e}"


def unregister_native_host() -> tuple[bool, str]:
    """Remove o registro do host do HKCU."""
    try:
        parent_path = r"Software\Google\Chrome\NativeMessagingHosts"
        parent_key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, parent_path, 0, winreg.KEY_ALL_ACCESS)
        winreg.DeleteKey(parent_key, HOST_NAME)
        winreg.CloseKey(parent_key)
        return True, f"Host removido com sucesso de HKCU\\{REG_PATH}"
    except FileNotFoundError:
        return True, "Chave já não existia no Registro."
    except Exception as e:
        return False, f"Falha ao remover chave do Registro: {e}"


def is_native_host_registered() -> tuple[bool, str | None]:
    """Verifica se o host está devidamente registrado no HKCU."""
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, "")
        winreg.CloseKey(key)
        return True, val
    except FileNotFoundError:
        return False, None
    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Registrador de Native Messaging Host para Chrome")
    parser.add_argument("--unregister", action="store_true", help="Remove o host do registro")
    parser.add_argument("--check", action="store_true", help="Verifica se o host está registrado")
    args = parser.parse_args()

    if args.unregister:
        ok, msg = unregister_native_host()
        print(f"[{'OK' if ok else 'ERRO'}] {msg}")
        sys.exit(0 if ok else 1)
    elif args.check:
        registered, path = is_native_host_registered()
        if registered:
            print(f"[OK] Host registrado apontando para: {path}")
            sys.exit(0)
        else:
            print("[INFO] Host NÃO registrado no Registro do Windows.")
            sys.exit(1)
    else:
        ok, msg = register_native_host()
        print(f"[{'OK' if ok else 'ERRO'}] {msg}")
        sys.exit(0 if ok else 1)
