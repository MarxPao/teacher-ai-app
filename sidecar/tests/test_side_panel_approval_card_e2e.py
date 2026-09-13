"""
test_side_panel_approval_card_e2e.py — Suíte Automatizada do Card de Aprovação no Side Panel

Valida os 5 pontos críticos de conformidade exigidos:
1. Desambiguação de Homônimos no Card (2 'João': João Silva vs João Santos).
2. Preview Real "Antes (6.0) -> Depois (8.5)".
3. Trava de Segurança Estrita (Zero mutações no DOM antes do clique em 'Confirmar').
4. Feedback Visual Duplo (Highlight verde no input do portal durante gravação).
5. Falha Honesta quando aluno não existe ('Zé Ninguém').
6. Verificação de Persistência Definitiva no DOM do portal.
"""

import asyncio
import http.server
import json
import os
import sys
import threading
from pathlib import Path
import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from intent_parser import extract_intent
from playwright.async_api import async_playwright

REPO_ROOT = _SIDECAR_DIR.parent


class SilentRepoHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, format, *args):
        pass


@pytest.fixture(scope="module")
def static_server():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SilentRepoHandler)
    port = server.server_address[1]
    th = threading.Thread(target=server.serve_forever, daemon=True)
    th.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


def test_intent_parsing_homonym_and_grade():
    """Valida que o interpretador de intenção extrai corretamente a nota e o nome."""
    res = extract_intent("Lança nota 8.5 para o João")
    assert res["acao"] == "lancar_nota"
    assert res["aluno"] == "João"
    assert res["nota"] == 8.5
    assert res["is_complete"] is True

    res_inexistente = extract_intent("Lança nota 7.0 para o Zé Ninguém")
    assert res_inexistente["acao"] == "lancar_nota"
    assert "Zé Ninguém" in res_inexistente["aluno"]
    assert res_inexistente["nota"] == 7.0


@pytest.mark.asyncio
async def test_full_side_panel_approval_workflow_e2e(static_server):
    """Executa o ciclo completo no navegador real Chromium com Playwright."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        host_url = f"{static_server}/public/sandbox/side_panel_portal_host.html"
        await page.goto(host_url)
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(1.5)

        portal_frame = page.frame(name="", url=lambda u: "portal_mock.html" in u)
        side_panel_frame = page.frame(name="", url=lambda u: "side_panel.html" in u)

        assert portal_frame is not None, "Portal frame deve carregar"
        assert side_panel_frame is not None, "Side panel frame deve carregar"

        # 1. Checa estado inicial dos campos no portal
        val_joao_silva = await portal_frame.locator("#nota_5").input_value()
        val_joao_santos = await portal_frame.locator("#nota_6").input_value()
        assert val_joao_silva == "6.0", "João Silva deve iniciar com 6.0"
        assert val_joao_santos == "7.5", "João Santos deve iniciar com 7.5"

        # 2. Professora digita comando ambíguo com homônimo "João"
        input_cmd = side_panel_frame.locator("#input-agent-command")
        btn_send = side_panel_frame.locator("#btn-send-agent-command")

        await input_cmd.fill("Lança nota 8.5 para o João")
        await btn_send.click()

        # 3. Valida Card de Desambiguação
        disambig_card = side_panel_frame.locator("#card-disambiguation")
        await disambig_card.wait_for(state="visible", timeout=6000)

        candidates = await side_panel_frame.locator(".candidate-chip").all()
        assert len(candidates) == 2, "Devem aparecer exatamente 2 candidatos homônimos"

        # 4. Seleciona "João Silva" no Card de Desambiguação
        joao_silva_chip = side_panel_frame.locator(".candidate-chip", has_text="João Silva")
        await joao_silva_chip.click()

        # 5. Valida Card de Preview com Antes (6.0) -> Depois (8.5)
        approval_card = side_panel_frame.locator("#card-approval-preview")
        await approval_card.wait_for(state="visible", timeout=4000)

        before_val = await side_panel_frame.locator("#approval-before-val").inner_text()
        after_val = await side_panel_frame.locator("#approval-after-val").inner_text()
        student_name = await side_panel_frame.locator("#approval-student-name").inner_text()

        assert "João Silva" in student_name
        assert before_val == "6.0", "Preview 'Antes' deve refletir o valor real lido no portal (6.0)"
        assert after_val == "8.5", "Preview 'Depois' deve refletir a nova nota (8.5)"

        # 6. PONTO CRÍTICO: Trava de Segurança Estrita (Nenhuma alteração antes do clique!)
        val_antes_confirmar = await portal_frame.locator("#nota_5").input_value()
        assert val_antes_confirmar == "6.0", "TRAVA DE SEGURANÇA FALHOU: DOM do portal foi alterado sem confirmação!"

        # 7. Professora clica em "Confirmar" dentro do Side Panel
        btn_confirm = side_panel_frame.locator("#btn-confirm-approval")
        await btn_confirm.click()

        # 8. Valida Destaque Visual (Highlight Verde) no campo do portal
        await asyncio.sleep(0.3)
        input_joao = portal_frame.locator("#nota_5")
        outline_val = await input_joao.evaluate("el => el.style.outline")
        bg_val = await input_joao.evaluate("el => el.style.backgroundColor")

        assert "rgb(16, 185, 129)" in outline_val or "10b981" in outline_val, f"Outline verde ausente: {outline_val}"
        assert "rgb(236, 253, 245)" in bg_val or "ecfdf5" in bg_val, f"Fundo esmeralda ausente: {bg_val}"

        # 9. Valida Feedback de Sucesso no Side Panel
        success_card = side_panel_frame.locator("#card-execution-success")
        await success_card.wait_for(state="visible", timeout=5000)
        success_text = await side_panel_frame.locator("#success-detail-text").inner_text()
        assert "João Silva" in success_text
        assert "6.0" in success_text and "8.5" in success_text
        assert "persistido no DOM" in success_text

        # 10. Valida Persistência Real pós-gravação no DOM oficial
        val_pos_gravacao = await portal_frame.locator("#nota_5").input_value()
        assert val_pos_gravacao == "8.5", f"Nota não persistiu no portal: {val_pos_gravacao}"

        # 11. Valida Cenário de Falha Honesta (Aluno Inexistente)
        await input_cmd.fill("Lança nota 7.0 para o Zé Ninguém")
        await btn_send.click()

        error_card = side_panel_frame.locator("#card-honest-error")
        await error_card.wait_for(state="visible", timeout=5000)
        error_title = await side_panel_frame.locator("#error-title").inner_text()
        error_detail = await side_panel_frame.locator("#error-detail-text").inner_text()

        assert "não encontrado" in error_title.lower() or "não encontrado" in error_detail.lower()
        assert "Zé Ninguém" in error_detail

        await browser.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
