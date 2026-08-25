"""
task_listener.py — Escutador de Tarefas e Gerenciador de Ciclo de Vida
Assina e processa tarefas na tabela 'browser_automation_tasks' do Supabase.
"""

import asyncio
import signal
import sys
import time
from typing import Any, Dict, List, Optional
from browser_harness_runner import BrowserHarnessRunner

class TaskListener:
    def __init__(self, supabase_client: Any, teacher_id: str, cdp_url: str = "http://localhost:9222"):
        self.supabase = supabase_client
        self.teacher_id = teacher_id
        self.runner = BrowserHarnessRunner(supabase_client=supabase_client, cdp_url=cdp_url)
        self._running = False
        self._current_task_id: Optional[str] = None

    def recover_orphan_running_tasks(self):
        """Recupera tarefas que ficaram presas em 'running' se o processo anterior foi morto abruptamente (kill -9)."""
        if not self.supabase or not self.teacher_id:
            return
        try:
            res = self.supabase.table("browser_automation_tasks").select("id").eq("teacher_id", self.teacher_id).eq("status", "running").execute()
            if res.data and len(res.data) > 0:
                orphan_ids = [t["id"] for t in res.data]
                print(f"[Listener] 🔄 Recuperando {len(orphan_ids)} tarefa(s) presas em 'running' após crash -> resetando para 'drafted'...")
                self.supabase.table("browser_automation_tasks").update({
                    "status": "drafted"
                }).in_("id", orphan_ids).execute()
        except Exception as e:
            print(f"[Listener] Aviso ao recuperar tarefas órfãs: {e}")

    def start(self):
        """Inicia o loop assíncrono de escuta e recupera tarefas órfãs de crashes anteriores."""
        self._running = True
        self.recover_orphan_running_tasks()

    def stop(self):
        """Interrompe o loop e realiza limpeza de tarefas em execução."""
        self._running = False
        if self._current_task_id and self.supabase:
            try:
                # Reseta task em execução para 'drafted' para evitar estado corrompido
                print(f"[Listener] 🛑 Resetando task {self._current_task_id} para 'drafted' antes de fechar...")
                self.supabase.table("browser_automation_tasks").update({
                    "status": "drafted"
                }).eq("id", self._current_task_id).execute()
            except Exception:
                pass

    async def fetch_teacher_byok(self) -> Dict[str, str]:
        """Busca o modelo BYOK configurado pelo professor no perfil do Supabase."""
        if not self.supabase or not self.teacher_id:
            return {"provider": "openai", "model": "gpt-4o"}

        try:
            res = self.supabase.table("profiles").select("settings").eq("id", self.teacher_id).execute()
            if res.data and len(res.data) > 0:
                settings = res.data[0].get("settings", {})
                active_api = settings.get("active_api", {})
                if active_api:
                    return {
                        "provider": active_api.get("provider", "openai"),
                        "model": active_api.get("model", "gpt-4o")
                    }
        except Exception:
            pass

        return {"provider": "openai", "model": "gpt-4o"}

    async def run_loop(self, on_status_change: Optional[Any] = None):
        """Loop contínuo de polling/realtime para detecção e execução de tarefas."""
        self.start()
        print(f"[Listener] 🎧 Escutando tarefas de automação para o professor {self.teacher_id}...")

        while self._running:
            try:
                if self.supabase and self.teacher_id:
                    # Busca tarefas com status 'drafted' ou 'approved' associadas ao professor
                    res = self.supabase.table("browser_automation_tasks").select("*") \
                        .eq("teacher_id", self.teacher_id) \
                        .in_("status", ["drafted", "approved"]) \
                        .order("created_at") \
                        .limit(1) \
                        .execute()

                    if res.data and len(res.data) > 0:
                        task = res.data[0]
                        self._current_task_id = task.get("id")

                        if on_status_change:
                            on_status_change("running", f"Processando tarefa {task.get('action_type')}")

                        byok = await self.fetch_teacher_byok()
                        await self.runner.process_task(task, byok)

                        self._current_task_id = None
                        if on_status_change:
                            on_status_change("idle", "Aguardando tarefas...")

                await asyncio.sleep(2)
            except asyncio.CancelledError:
                self.stop()
                break
            except Exception as e:
                print(f"[Listener] Aviso no loop de tarefas: {e}")
                await asyncio.sleep(3)
