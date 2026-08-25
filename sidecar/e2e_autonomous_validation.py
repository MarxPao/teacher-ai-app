"""
e2e_autonomous_validation.py — Validação E2E Real do Preenchimento Autônomo e Guard de Submissão
Executa diretamente contra o Chromium real na porta 9222 e o portal_mock.html servido no localhost.
"""

import asyncio
import os
import sys
import json

# Suporte a UTF-8 no Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(__file__))

from playwright.async_api import async_playwright
from browser_harness_runner import BrowserHarnessRunner

async def main():
    print("=" * 70)
    print("🧪 INICIANDO VALIDAÇÃO E2E REAL CONTRA CHROMIUM E PORTAL_MOCK.HTML")
    print("=" * 70)

    playwright = await async_playwright().start()
    browser = None
    for ch in ["chrome", "msedge", "chromium"]:
        try:
            browser = await playwright.chromium.launch(
                channel=ch,
                headless=True,
                args=["--remote-debugging-port=9222"]
            )
            print(f" [1/5] 🌐 Navegador nativo inicializado via channel='{ch}'")
            break
        except Exception as e:
            continue

    if not browser:
        # Tenta launch normal
        browser = await playwright.chromium.launch(headless=True, args=["--remote-debugging-port=9222"])
    page = await browser.new_page()
    await page.goto("http://localhost:3000/sandbox/portal_mock_iframe.html")
    # Aguarda o iframe carregar
    await page.wait_for_load_state("networkidle")
    print(" [1/5] ✅ Página do Portal Mock com IFRAME carregada com sucesso!")
    print(f"       URL: {page.url}")
    print(f"       Título: {await page.title()}")
    print(f"       Frames detectados: {len(page.frames)} (Documento principal + Iframe de Notas)")

    # 1. Inspeção do Estado Inicial (Before State)
    sub_count_initial = await page.evaluate("() => window.__submission_count")
    counter_dom = await page.locator("#submission_counter").inner_text()
    is_btn_initially_disabled = await page.locator("#btn_salvar").is_disabled()

    assert sub_count_initial == 0, f"Esperado sub_count=0, obtido {sub_count_initial}"
    assert counter_dom == "0", f"Esperado counter_dom='0', obtido {counter_dom}"
    assert is_btn_initially_disabled is True, "FALHA: O botão de salvar deveria iniciar DESABILITADO (disabled=true)!"
    print(f" [2/5] ✅ Estado inicial verificado: Submissões = {sub_count_initial}, Botão Salvar Desabilitado = {is_btn_initially_disabled}")

    # 2. Execução da Fase 1: Preenchimento Autônomo
    runner = BrowserHarnessRunner(supabase_client=None)
    
    task_mock = {
        "id": "e2e_task_real_001",
        "teacher_id": "prof_e2e_test",
        "trace_id": "trace_e2e_real",
        "portal": "sandbox",
        "action_type": "write_attendance",
        "status": "drafted",
        "payload": {
            "absentStudents": ["Lucas Silva"],
            "studentGrades": [{"name": "Mariana Lima", "grade": 10.0}],
            "title": "Simple Past vs Present Perfect Review"
        }
    }
    
    print("\n [3/5] 🚀 Executando Fase 1: Preenchimento Autônomo (através de IFRAMES)...")
    diff = runner._build_diff({}, task_mock["payload"])
    filled, failed = await runner._apply_diff_to_dom(page, diff)
    
    print(f"       Campos preenchidos: {filled}")
    assert len(failed) == 0, f"Houve falhas no preenchimento: {failed}"
    assert len(filled) >= 3, f"Esperado pelo menos 3 campos preenchidos, obtido {len(filled)}"

    # 3. VERIFICAÇÃO CRÍTICA DO GUARD DE SUBMISSÃO
    sub_count_after_fill = await page.evaluate("() => window.__submission_count")
    counter_dom_after = await page.locator("#submission_counter").inner_text()
    status_msg_visible = await page.locator("#status_msg").is_visible()
    is_btn_now_enabled = not (await page.locator("#btn_salvar").is_disabled())

    assert sub_count_after_fill == 0, f"FALHA GRAVE: Submit foi clicado prematuramente! sub_count={sub_count_after_fill}"
    assert counter_dom_after == "0", f"FALHA: DOM counter alterado prematuramente! counter={counter_dom_after}"
    assert not status_msg_visible, "FALHA: Mensagem de sucesso apareceu antes da aprovação humana!"
    assert is_btn_now_enabled is True, "FALHA: Botão deveria ter sido habilitado após preenchimento do formulário!"
    
    print(" [3/5] 🛡️ GUARD DE SUBMISSÃO CONFIRMADO COM SUCESSO:")
    print(f"       -> window.__submission_count = {sub_count_after_fill} (EXATAMENTE ZERO)")
    print(f"       -> #submission_counter = '{counter_dom_after}'")
    print(f"       -> Botão Salvar agora Habilitado = {is_btn_now_enabled}")
    print(f"       -> Mensagem de sucesso visível = {status_msg_visible} (FALSA, ainda não submetido)")

    # Captura preview do DOM preenchido
    preview_bytes = await page.screenshot(full_page=False)
    print(f"       -> Screenshot de Preview capturado: {len(preview_bytes)} bytes")

    # 4. Execução da Fase 3: Submissão Final Aprovada
    print("\n [4/5] ✍️ Executando Fase 3: Submissão Final Aprovada...")
    submit_success = await runner._submit_portal_form(page)
    assert submit_success is True, "Falha ao clicar no botão de submit habilitado do portal!"

    # 5. VERIFICAÇÃO PÓS-SUBMISSÃO (Agora sim o contador DEVE ser 1)
    sub_count_final = await page.evaluate("() => window.__submission_count")
    counter_dom_final = await page.locator("#submission_counter").inner_text()
    status_msg_visible_final = await page.locator("#status_msg").is_visible()

    assert sub_count_final == 1, f"FALHA: Submit não incrementou o contador! sub_count={sub_count_final}"
    assert counter_dom_final == "1", f"FALHA: DOM counter não atualizou para 1! counter={counter_dom_final}"
    assert status_msg_visible_final is True, "FALHA: Mensagem de sucesso não apareceu após submit aprovado!"

    print(" [4/5] ✅ SUBMISSÃO FINAL EXECUTADA COM SUCESSO:")
    print(f"       -> window.__submission_count = {sub_count_final} (INCREMENTADO PARA 1)")
    print(f"       -> #submission_counter = '{counter_dom_final}'")
    print(f"       -> Mensagem de confirmação visível = {status_msg_visible_final}")

    # 6. Teste de Erro Parcial (Fail-Fast)
    print("\n [5/5] 🧪 Testando Fail-Fast de Preenchimento Parcial...")
    diff_broken = [
        {"studentName": "Aluno Fantasma 99", "field": "Nota", "afterValue": 10.0, "approved": True}
    ]
    filled_broken, failed_broken = await runner._apply_diff_to_dom(page, diff_broken)
    assert len(failed_broken) == 1, f"Esperado 1 falha para aluno fantasma, obtido {len(failed_broken)}"
    assert "Aluno Fantasma 99" in failed_broken[0]
    print(f"       -> Erro parcial detectado corretamente: {failed_broken}")

    # Extrai o HTML final do DOM real para evidência
    html_final = await page.content()
    print("\n" + "=" * 70)
    print("🎉 TODAS AS VALIDAÇÕES E2E CONTRA CHROMIUM E DOM REAL PASSARAM COM 100% DE SUCESSO!")
    print("=" * 70)

    await browser.close()
    await playwright.stop()

if __name__ == "__main__":
    asyncio.run(main())
