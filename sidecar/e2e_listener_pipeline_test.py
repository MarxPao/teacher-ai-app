"""
e2e_listener_pipeline_test.py — Teste de Ponta a Ponta do Pipeline Completo:
Supabase Real -> TaskListener (em background loop) -> BrowserHarnessRunner -> Chrome CDP -> Supabase Real
"""

import asyncio
import os
import sys
import time

# Suporte a UTF-8 no Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(__file__))

from playwright.async_api import async_playwright
from supabase import create_client
from task_listener import TaskListener

import uuid

SUPABASE_URL = "https://parxakvjvuvsmvbvrshk.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODI2ODIwNywiZXhwIjoyMDkzODQ0MjA3fQ.ElMhM8T2IJpAIs8QIQm4temIdW1P533CRA3KSfs4oNw"

TEST_TEACHER_ID = "85d017ee-60b9-46d0-bbd6-cf4aabde627c"

async def main():
    print("=" * 75)
    print("🔄 TESTE DO PIPELINE REAL DESACOPLADO (SUPABASE -> LISTENER -> RUNNER)")
    print("=" * 75)

    # 1. Inicializa o cliente Supabase Real
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print(f" [1/6] 🌐 Conectado ao Supabase Real: {SUPABASE_URL}")

    # 2. Inicializa o Chrome Real apontando para o mock com IFRAME
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(
        channel="chrome",
        headless=True,
        args=["--remote-debugging-port=9222"]
    )
    page = await browser.new_page()
    await page.goto("http://localhost:3000/sandbox/portal_mock_iframe.html")
    await page.wait_for_load_state("networkidle")
    print(f" [2/6] 🌐 Chrome CDP ativo na porta 9222: {page.url}")

    # 3. Inicializa o TaskListener rodando de forma 100% autônoma em background
    listener = TaskListener(supabase_client=supabase, teacher_id=TEST_TEACHER_ID, cdp_url="http://localhost:9222")
    listener_task = asyncio.create_task(listener.run_loop())
    print(f" [3/6] 🎧 TaskListener iniciado em background loop independente...")

    # Limpeza preventiva de tarefas de teste desse professor
    supabase.table("browser_automation_tasks").delete().eq("teacher_id", TEST_TEACHER_ID).execute()

    # 4. Cria a tarefa real no Supabase com status='drafted'
    task_id = str(uuid.uuid4())
    trace_id = str(uuid.uuid4())
    task_row = {
        "id": task_id,
        "teacher_id": TEST_TEACHER_ID,
        "trace_id": trace_id,
        "portal": "sandbox",
        "action_type": "write_attendance",
        "status": "drafted",
        "payload": {
            "absentStudents": ["Lucas Silva"],
            "studentGrades": [{"name": "Mariana Lima", "grade": 9.8}],
            "title": "Unidades Temáticas BNCC - Aula 12"
        },
        "approval_mode": "batch"
    }

    print(f"\n [4/6] 📤 Inserindo tarefa real no Supabase: {task_id} (status='drafted')...")
    supabase.table("browser_automation_tasks").insert(task_row).execute()

    # 5. Aguarda o TaskListener detectar, preencher o DOM e mover para pending_approval
    print("       Aguardando TaskListener detectar e preencher autonomamente o DOM...")
    prefilled_ok = False
    for attempt in range(20):
        await asyncio.sleep(1.0)
        res = supabase.table("browser_automation_tasks").select("status, payload").eq("id", task_id).execute()
        if res.data:
            current_status = res.data[0].get("status")
            if current_status == "pending_approval":
                print(f"       ✅ TaskListener moveu a tarefa para 'pending_approval' sozinho!")
                prefilled_ok = True
                break
            elif current_status == "error":
                print(f"       ❌ Erro reportado pelo Runner: {res.data[0].get('payload')}")
                break

    assert prefilled_ok is True, "Timeout: TaskListener não processou a tarefa drafted!"

    # Inspeciona no DOM do navegador se o Guard de Submissão foi mantido
    sub_count_phase1 = await page.evaluate("() => window.__submission_count")
    counter_phase1 = await page.locator("#submission_counter").inner_text()
    assert sub_count_phase1 == 0, f"FALHA: Submit clicado prematuramente! sub_count={sub_count_phase1}"
    assert counter_phase1 == "0", f"FALHA: Counter alterado prematuramente! counter={counter_phase1}"
    print(f"       🛡️ Guard confirmado no DOM pelo Listener: sub_count={sub_count_phase1}, counter='{counter_phase1}'")

    # 6. Simula aprovação humana: UPDATE status='approved' no Supabase
    print(f"\n [5/6] 👤 Professor aprova o lançamento -> Enviando UPDATE status='approved' no Supabase...")
    supabase.table("browser_automation_tasks").update({
        "status": "approved",
        "updated_at": "now()"
    }).eq("id", task_id).execute()

    # 7. Aguarda o TaskListener detectar o status 'approved' e executar o submit no Chrome
    print("       Aguardando TaskListener detectar 'approved' e executar o clique de submit...")
    completed_ok = False
    for attempt in range(20):
        await asyncio.sleep(1.0)
        res = supabase.table("browser_automation_tasks").select("status, payload").eq("id", task_id).execute()
        if res.data:
            current_status = res.data[0].get("status")
            if current_status == "done":
                print(f"       ✅ TaskListener executou a submissão e moveu para status='done'!")
                completed_ok = True
                break
            elif current_status == "error":
                print(f"       ❌ Erro na submissão: {res.data[0].get('payload')}")
                break

    assert completed_ok is True, "Timeout: TaskListener não completou a tarefa aprovada!"

    # 8. Verificação final no DOM do navegador
    sub_count_final = await page.evaluate("() => window.__submission_count")
    counter_final = await page.locator("#submission_counter").inner_text()
    status_visible = await page.locator("#status_msg").is_visible()

    assert sub_count_final == 1, f"FALHA: Submit não incrementou o contador no DOM! sub_count={sub_count_final}"
    assert counter_final == "1", f"FALHA: DOM counter não é '1'! counter={counter_final}"
    assert status_visible is True, "FALHA: Mensagem de confirmação não visível no portal!"

    print(f"\n [6/6] 🏆 PIPELINE COMPLETO VALIDADO COM SUCESSO DE PONTA A PONTA:")
    print(f"       -> Tarefa: {task_id}")
    print(f"       -> Ciclo: drafted -> pending_approval (preenchimento autônomo) -> approved -> done (submit efetivado)")
    print(f"       -> Efeito colateral no DOM: sub_count = {sub_count_final} e #status_msg = Visível")

    # Encerra o listener e o navegador
    listener.stop()
    listener_task.cancel()
    await browser.close()
    await playwright.stop()
    print("\n" + "=" * 75)
    print("🎉 SUCESSO TOTAL NO PIPELINE REAL!")
    print("=" * 75)

if __name__ == "__main__":
    asyncio.run(main())
