"""
main.py — Ponto de Entrada Principal do Sidecar Desktop (Teacher AI Browser Harness)
Gerencia autenticação de sessão, bandeja do sistema (system tray), conector CDP e escuta de tarefas.
"""

import asyncio
import os
import signal
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import webbrowser
from typing import Optional
from dotenv import load_dotenv

from auth import get_session, save_session, clear_session, generate_device_code
from cdp_connector import CDPConnector
from task_listener import TaskListener
from tray_app import TrayApp

load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://parxakvjvuvsmvbvrshk.supabase.co")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM")

def print_banner():
    print("=" * 68)
    print(" 🦉 TEACHER AI APP — SIDECAR DESKTOP (BROWSER HARNESS / CDP)")
    print("=" * 68)
    print(" • Modo: 100% Local (Playwright + Chrome DevTools Protocol)")
    print(" • Porta de Depuração CDP: http://localhost:9222")
    print(" • Segurança: Sessão criptografada no OS Keychain")
    print("=" * 68)

def init_supabase(token: Optional[str] = None):
    """Inicializa o cliente Supabase com a chave pública e token JWT se disponível."""
    try:
        from supabase import create_client, Client
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        if token:
            try:
                client.postgrest.auth(token)
            except Exception:
                pass
        return client
    except Exception as e:
        print(f"[Sidecar] Aviso: Supabase-py não carregado: {e}")
        return None

def perform_first_time_auth() -> Optional[dict]:
    """Valida a sessão persistida no Keychain. Recusa iniciar se não estiver autenticado."""
    session = get_session()
    if session and session.get("user_id") and session.get("access_token"):
        print(f"✅ Sessão ativa carregada do Keychain: {session.get('email', 'Professor(a)')}")
        return session

    code = generate_device_code()
    print("\n🔐 [ACESSO BLOQUEADO] Nenhuma sessão autenticada encontrada no OS Keychain!")
    print(f"   Código de Pareamento Gerado:  👉  {code}  👈")
    print("\n   Passos para autorizar este Sidecar:")
    print("   1. Acesse o Teacher AI App (http://localhost:3000)")
    print("   2. Vá em Configurações > Extensões > Parear Sidecar Desktop")
    print(f"   3. Insira o código '{code}' e clique em 'Vincular Dispositivo'")
    print("   4. Reinicie o Sidecar após a confirmação.\n")
    return None

async def main():
    print_banner()
    
    # 1. Autenticação e Carregamento de Sessão
    session = perform_first_time_auth()
    if not session:
        print("[Sidecar] 🛑 Execução abortada: autenticação obrigatória.")
        sys.exit(1)

    teacher_id = session.get("user_id")
    token = session.get("access_token")

    # 2. Inicialização do Supabase
    supabase = init_supabase(token)

    # 3. Inicialização da Bandeja do Sistema (Tray Icon)
    tray = TrayApp()
    tray.run_in_background()
    tray.update_status("idle", "Ocioso")

    # 4. Verificação de Saúde do Chrome CDP
    cdp = CDPConnector("http://localhost:9222")
    is_cdp_ok, cdp_msg = cdp.check_health()
    if is_cdp_ok:
        print(f"✅ {cdp_msg}")
    else:
        print(f"⚠️  [ATENÇÃO] {cdp_msg}")
        print("   Inicie o Chrome com: chrome.exe --remote-debugging-port=9222\n")

    # 5. Inicialização do Task Listener
    listener = TaskListener(supabase_client=supabase, teacher_id=teacher_id)

    def handle_status_change(status: str, msg: str):
        tray.update_status(status, msg)

    # 6. Loop de Execução
    try:
        await listener.run_loop(on_status_change=handle_status_change)
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("\n[Sidecar] Encerrando processos e liberando recursos...")
        listener.stop()
        tray.stop()
        await cdp.close()
        sys.exit(0)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
