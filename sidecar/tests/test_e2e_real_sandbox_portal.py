"""
test_e2e_real_sandbox_portal.py — Validação Ponta a Ponta contra DOM Real de Homologação

Testa o ciclo de vida completo em navegador real (Playwright Chromium):
1. Launcher/Abertura do DOM real da sandbox (portal_mock.html).
2. Inspeção de estado inicial (Submissões = 0, Não Submetido).
3. Escrita segura com SafeWriter (press_sequentially + eventos de máscara).
4. Captura de screenshot pré-aprovação.
5. Confirmação Final humana simulada (clique de submit).
6. Verificação pós-gravação (Submissões = 1, Gravado com Sucesso).
"""

import asyncio
import os
import sys
from pathlib import Path
import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from safe_writer import SafeWriter
from playwright.async_api import async_playwright


@pytest.mark.asyncio
async def test_full_e2e_real_browser_sandbox():
    sandbox_path = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"
    assert sandbox_path.exists(), f"Arquivo sandbox não encontrado em {sandbox_path}"
    file_url = sandbox_path.as_uri()

    writer = SafeWriter(key_delay_ms=10)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # 1. Carrega o portal de homologação real
        await page.goto(file_url)
        await page.wait_for_load_state("domcontentloaded")

        # 2. Verifica estado inicial antes de qualquer escrita
        initial_counter = await page.locator("#submission_counter").inner_text()
        initial_state = await page.locator("#form_state").inner_text()
        assert initial_counter.strip() == "0"
        assert "Não Submetido" in initial_state

        # 3. Preenchimento via SafeWriter com máscara JS e eventos de framework
        nota_input = page.locator("#nota_1")
        write_res = await writer.write_input(nota_input, "9.8")
        assert write_res.success is True
        assert write_res.verified is True
        assert write_res.drift_detected is False

        # Presença aluno 2
        chk_aluno2 = page.locator("#presenca_2")
        chk_res = await writer.set_checkbox(chk_aluno2, checked=False)
        assert chk_res.success is True
        assert chk_res.actual_checked is False

        # 4. Captura screenshot de evidência prévia (como feito na Fase 1 para o Card)
        screenshot_bytes = await page.screenshot(full_page=False)
        assert len(screenshot_bytes) > 1000, "Screenshot deve conter bytes reais de imagem"

        # 5. Confirmação Final humana simulada (clique no botão salvar do portal)
        submit_btn = page.locator("#btn_salvar")
        await submit_btn.click()
        await page.wait_for_timeout(200)

        # 6. Verificação pós-gravação definitiva
        final_counter = await page.locator("#submission_counter").inner_text()
        final_state = await page.locator("#form_state").inner_text()
        status_msg_visible = await page.locator("#status_msg").is_visible()

        assert final_counter.strip() == "1", f"Esperava 1 submissão, mas obteve {final_counter}"
        assert "Gravado (Submetido com Sucesso)" in final_state
        assert status_msg_visible is True

        await browser.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
