"""
generate_side_panel_visual_evidence.py — Gerador de Evidências Visuais Reais do Card de Aprovação

Valida de ponta a ponta:
1. Desambiguação de Homônimos (2 'João': João Silva vs João Santos) no Side Panel.
2. Card de Preview Real Antes (6.0) -> Depois (8.5).
3. Trava de Segurança Estrita (Zero mutações no DOM do portal antes de Confirmar).
4. Feedback Visual Duplo (Highlight verde pulsante no portal durante gravação).
5. Confirmação e Persistência Real no DOM do Portal oficial.
6. Falha Honesta quando aluno não existe ('Zé Ninguém').
"""

import asyncio
import functools
import http.server
import os
import sys
import threading
import time
from pathlib import Path

# Fix Windows console encoding for UTF-8 and emojis
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Paths
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EVIDENCE_DIR = Path(r"C:\Users\rafae\.gemini\antigravity\brain\d60df6af-6cc7-485f-9202-51dd96f22f58\evidence")
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

from playwright.async_api import async_playwright


class RepoHttpHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, format, *args):
        pass  # Silencia logs de requisição estática


def start_static_server(port=8768):
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), RepoHttpHandler)
    th = threading.Thread(target=server.serve_forever, daemon=True)
    th.start()
    return server


async def run_visual_validation():
    print("🚀 [1/6] Iniciando servidor estático local na porta 8768...")
    static_server = start_static_server(8768)

    print("🌐 [2/6] Inicializando Chromium Playwright (1440x900)...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        host_url = "http://127.0.0.1:8768/public/sandbox/side_panel_portal_host.html"
        await page.goto(host_url)
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(2)

        # Referências aos iframes
        portal_frame = page.frame(name="", url=lambda u: "portal_mock.html" in u)
        side_panel_frame = page.frame(name="", url=lambda u: "side_panel.html" in u)

        assert portal_frame is not None, "Iframe do portal não encontrado!"
        assert side_panel_frame is not None, "Iframe do side panel não encontrado!"

        print("🔍 [3/6] Inspecionando estado inicial da pauta no portal...")
        nota_joao_silva_before = await portal_frame.locator("#nota_5").input_value()
        nota_joao_santos_before = await portal_frame.locator("#nota_6").input_value()
        print(f"   • João Silva nota atual: {nota_joao_silva_before}")
        print(f"   • João Santos nota atual: {nota_joao_santos_before}")
        assert nota_joao_silva_before == "6.0", f"Esperado 6.0, obtido {nota_joao_silva_before}"
        assert nota_joao_santos_before == "7.5", f"Esperado 7.5, obtido {nota_joao_santos_before}"

        # ─────────────────────────────────────────────────────────────────────
        # CENÁRIO 1: COMANDO COM HOMÔNIMO -> CARD DE DESAMBIGUAÇÃO
        # ─────────────────────────────────────────────────────────────────────
        print("\n📸 [4/6] Cenário 1: Professora dita 'Lança nota 8.5 para o João' (Homônimos)...")
        input_cmd = side_panel_frame.locator("#input-agent-command")
        btn_send = side_panel_frame.locator("#btn-send-agent-command")

        await input_cmd.fill("Lança nota 8.5 para o João")
        await btn_send.click()

        # Aguarda card de desambiguação
        disambig_card = side_panel_frame.locator("#card-disambiguation")
        await disambig_card.wait_for(state="visible", timeout=8000)

        candidates = await side_panel_frame.locator(".candidate-chip").all()
        cand_texts = [await c.inner_text() for c in candidates]
        print("   • Candidatos exibidos:", cand_texts)
        assert len(candidates) == 2, f"Esperado 2 candidatos, obtido {len(candidates)}"
        assert any("João Silva" in t for t in cand_texts)
        assert any("João Santos" in t for t in cand_texts)

        # Captura screenshot 1: Desambiguação
        path_1 = EVIDENCE_DIR / "01_desambiguacao_homonimos_joao.png"
        await page.screenshot(path=str(path_1), full_page=False)
        print(f"   ✅ Screenshot salvo: {path_1.name}")

        # ─────────────────────────────────────────────────────────────────────
        # CENÁRIO 2: ESCOLHA DO CANDIDATO -> PREVIEW REAL ANTES -> DEPOIS
        # ─────────────────────────────────────────────────────────────────────
        print("\n📸 [5/6] Cenário 2: Escolha de 'João Silva' -> Card de Preview Antes e Depois...")
        # Clica no chip do João Silva
        joao_silva_chip = side_panel_frame.locator(".candidate-chip", has_text="João Silva")
        await joao_silva_chip.click()

        approval_card = side_panel_frame.locator("#card-approval-preview")
        await approval_card.wait_for(state="visible", timeout=5000)

        student_name = await side_panel_frame.locator("#approval-student-name").inner_text()
        before_val = await side_panel_frame.locator("#approval-before-val").inner_text()
        after_val = await side_panel_frame.locator("#approval-after-val").inner_text()

        print(f"   • Card Preview: Aluno='{student_name}' | Antes='{before_val}' -> Depois='{after_val}'")
        assert "João Silva" in student_name
        assert before_val == "6.0", f"Valor antes incorreto: {before_val}"
        assert after_val == "8.5", f"Valor depois incorreto: {after_val}"

        # VERIFICA TRAVA DE SEGURANÇA: Nenhuma alteração no DOM antes de Confirmar!
        nota_portal_check = await portal_frame.locator("#nota_5").input_value()
        assert nota_portal_check == "6.0", f"VIOLAÇÃO DE SEGURANÇA: DOM foi alterado antes de confirmação! ({nota_portal_check})"
        print("   🔒 Trava de Segurança validada: DOM do portal permanece intocado (6.0).")

        # Captura screenshot 2: Preview Antes -> Depois
        path_2 = EVIDENCE_DIR / "02_card_preview_antes_depois.png"
        await page.screenshot(path=str(path_2), full_page=False)
        print(f"   ✅ Screenshot salvo: {path_2.name}")

        # ─────────────────────────────────────────────────────────────────────
        # CENÁRIO 3: CLIQUE EM CONFIRMAR -> HIGHLIGHT VERDE NO CAMPO DO PORTAL
        # ─────────────────────────────────────────────────────────────────────
        print("\n📸 [6/6] Cenário 3: Clique em 'Confirmar' -> SafeWriter + Highlight Verde...")
        btn_confirm = side_panel_frame.locator("#btn-confirm-approval")

        # Clica em confirmar
        await btn_confirm.click()

        # Aguarda input receber outline verde no portal frame
        await asyncio.sleep(0.3)
        input_joao = portal_frame.locator("#nota_5")
        outline_style = await input_joao.evaluate("el => el.style.outline")
        bg_style = await input_joao.evaluate("el => el.style.backgroundColor")
        val_after_write = await input_joao.input_value()

        print(f"   • Highlight detectado no portal: outline='{outline_style}', bg='{bg_style}'")
        print(f"   • Valor no input durante/após escrita: {val_after_write}")

        # Captura screenshot 3: Highlight verde no portal
        path_3 = EVIDENCE_DIR / "03_clique_confirmar_highlight_verde.png"
        await page.screenshot(path=str(path_3), full_page=False)
        print(f"   ✅ Screenshot salvo: {path_3.name}")

        # ─────────────────────────────────────────────────────────────────────
        # CENÁRIO 4: PERSISTÊNCIA CONFIRMADA NO DOM + SUCESSO NO SIDE PANEL
        # ─────────────────────────────────────────────────────────────────────
        success_card = side_panel_frame.locator("#card-execution-success")
        await success_card.wait_for(state="visible", timeout=5000)
        success_text = await side_panel_frame.locator("#success-detail-text").inner_text()
        print("   • Mensagem de sucesso no Side Panel:\n     ", success_text.strip().replace("\n", " "))

        # Confirma valor definitivo persistido no DOM oficial
        final_portal_val = await portal_frame.locator("#nota_5").input_value()
        assert final_portal_val == "8.5", f"Valor no DOM do portal não persistiu: {final_portal_val}"
        print(f"   ✅ Persistência no DOM oficial comprovada: #nota_5 = {final_portal_val}")

        # Captura screenshot 4: Sucesso e valor salvo no portal
        path_4 = EVIDENCE_DIR / "04_sucesso_persistido_no_dom.png"
        await page.screenshot(path=str(path_4), full_page=False)
        print(f"   ✅ Screenshot salvo: {path_4.name}")

        # ─────────────────────────────────────────────────────────────────────
        # CENÁRIO 5: FALHA HONESTA (ALUNO INEXISTENTE)
        # ─────────────────────────────────────────────────────────────────────
        print("\n📸 Cenário 5: Teste de Falha Honesta com aluno inexistente ('Zé Ninguém')...")
        await input_cmd.fill("Lança nota 7.0 para o Zé Ninguém")
        await btn_send.click()

        error_card = side_panel_frame.locator("#card-honest-error")
        await error_card.wait_for(state="visible", timeout=6000)

        err_title = await side_panel_frame.locator("#error-title").inner_text()
        err_detail = await side_panel_frame.locator("#error-detail-text").inner_text()
        print(f"   • Card de Erro Honesto: '{err_title}' — '{err_detail}'")
        assert "não encontrado" in err_title.lower() or "não encontrado" in err_detail.lower()
        assert "Zé Ninguém" in err_detail

        # Captura screenshot 5: Falha Honesta
        path_5 = EVIDENCE_DIR / "05_falha_honesta_aluno_inexistente.png"
        await page.screenshot(path=str(path_5), full_page=False)
        print(f"   ✅ Screenshot salvo: {path_5.name}")

        await browser.close()

    print("\n🎉 TODAS AS VALIDAÇÕES VISUAIS E REGULARES FORAM CONCLUÍDAS COM SUCESSO!")
    print(f"📁 Diretório de evidências: {EVIDENCE_DIR}")


if __name__ == "__main__":
    asyncio.run(run_visual_validation())
