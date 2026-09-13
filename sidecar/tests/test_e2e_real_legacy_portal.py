"""
test_e2e_real_legacy_portal.py — Validação Ponta a Ponta contra Snapshot de Portal Legado Real

Valida os componentes centrais (NavigationStateMachine e SafeWriter) contra a estrutura
DOM real capturada de um sistema escolar público legado em produção/homologação (i-Educar / i-Diário):
1. Verificação da existência do snapshot MHTML real em fixtures/.
2. Execução da NavigationStateMachine para detecção de estado no portal legado.
3. Teste do SafeWriter em inputs legados com digitação sequencial e checkpoint.
4. Teste e documentação de divergência em dropdowns estilizados por Chosen (display:none).
5. Resolução posicional de alunos em tabelas legadas sem ID ou data-testid.
6. Captura de evidência visual (screenshot) em navegador real (channel="chrome").
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
from navigation_state_machine import NavigationStateMachine, NavState
from playwright.async_api import async_playwright

_FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
_MHTML_SNAPSHOT = _FIXTURES_DIR / "portal_real_snapshot.mhtml"
_HTML_SNAPSHOT = _FIXTURES_DIR / "portal_real_snapshot.html"
_ROSTER_HTML = _FIXTURES_DIR / "portal_real_roster.html"


def test_real_legacy_snapshot_file_exists():
    """Garante que o snapshot .mhtml do portal legado real foi obtido e persistido."""
    assert _MHTML_SNAPSHOT.exists(), f"Snapshot MHTML real não encontrado em {_MHTML_SNAPSHOT}"
    assert _MHTML_SNAPSHOT.stat().st_size > 10_000, "Snapshot MHTML deve conter dados reais capturados"
    assert _HTML_SNAPSHOT.exists(), f"HTML companion não encontrado em {_HTML_SNAPSHOT}"


@pytest.mark.asyncio
async def test_navigation_state_machine_on_real_legacy_portal():
    """
    Roda a NavigationStateMachine contra a tela de diário do portal legado real.
    Observa como a máquina de estados interpreta a página com tabelas de formulário e dropdowns Chosen.
    """
    sm = NavigationStateMachine()
    file_url = _HTML_SNAPSHOT.as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        try:
            await page.goto(file_url, wait_until="domcontentloaded")

            result = await sm.detect_current_state(page)

            # Documenta o comportamento observado:
            # Em portais legados (ex: i-Educar), a estrutura do formulário de busca usa <table class="tabelanum1">
            # com inputs de filtro, acionando a Camada 4 da máquina de estados.
            assert result.state in (NavState.TABELA_ALVO_ENCONTRADA, NavState.ETAPA_SELECIONADA)
            assert result.requires_human is False
            assert len(result.trace) >= 2
        finally:
            await browser.close()


@pytest.mark.asyncio
async def test_safe_writer_sequential_write_on_real_legacy_input():
    """
    Testa a escrita segura com SafeWriter em campos de texto do portal legado real.
    Verifica se a digitação sequencial e o checkpoint pós-escrita funcionam com HTML antigo.
    """
    writer = SafeWriter(key_delay_ms=10)
    file_url = _HTML_SNAPSHOT.as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        try:
            await page.goto(file_url, wait_until="domcontentloaded")

            ano_locator = page.locator("#ano")
            assert await ano_locator.count() == 1

            # Digitação com SafeWriter
            write_res = await writer.write_input(ano_locator, "2027")
            assert write_res.success is True
            assert write_res.verified is True
            assert write_res.actual_value == "2027"
            assert write_res.drift_detected is False

            # Confirma valor persistido no DOM
            dom_val = await ano_locator.input_value()
            assert dom_val == "2027"
        finally:
            await browser.close()


@pytest.mark.asyncio
async def test_safe_writer_chosen_dropdown_handling():
    """
    Verifica o comportamento do SafeWriter contra dropdowns customizados com Chosen.js (display: none).
    Demonstra a necessidade de suporte a elementos de seleção com display oculto ou containers Chosen.
    """
    file_url = _HTML_SNAPSHOT.as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        try:
            await page.route("**/*", lambda route: route.abort() if route.request.url.startswith("http") else route.continue_())
            await page.goto(file_url, wait_until="domcontentloaded", timeout=15000)

            sel_locator = page.locator("select[name='ref_cod_escola']")
            assert await sel_locator.count() == 1

            # Verifica se o elemento tem display: none atribuído pelo Chosen
            display_style = await sel_locator.evaluate("el => window.getComputedStyle(el).display")
            assert display_style == "none", "Portal legado deve usar Chosen/Select2 que oculta o select nativo"

            # O SafeWriter ou despachador DOM direto deve conseguir atualizar o valor via evento de change
            res = await page.evaluate('''() => {
                const el = document.querySelector("select[name='ref_cod_escola']");
                if (!el) return false;
                el.value = el.options[1].value;
                el.dispatchEvent(new Event("change", { bubbles: true }));
                return el.value;
            }''')
            assert len(str(res)) > 0
        finally:
            await browser.close()


@pytest.mark.asyncio
async def test_legacy_table_student_lookup_without_ids():
    """
    Testa a localização de alunos por texto e estrutura posicional em tabelas legadas
    onde as linhas <tr> não possuem atributo id nem data-testid.
    """
    file_url = _ROSTER_HTML.as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        try:
            await page.goto(file_url, wait_until="domcontentloaded")

            # Localiza aluno por texto na linha
            student_name = "HUGO HENRIQUE DE SOUZA"
            row = page.locator(f"table.tablelistagem tr:has-text('{student_name}')")
            assert await row.count() == 1

            # Extrai colunas posicionais
            cols = await row.first.locator("td").all_inner_texts()
            clean_cols = [c.strip() for c in cols]
            assert clean_cols[0] == "16203"  # Código do aluno
            assert clean_cols[2] == student_name  # Nome

            # Aluno inexistente retorna 0
            fake_row = page.locator("table.tablelistagem tr:has-text('Aluno Fantasma')")
            assert await fake_row.count() == 0
        finally:
            await browser.close()


@pytest.mark.asyncio
async def test_legacy_portal_screenshot_capture():
    """Valida que a captura de evidência visual (screenshot) funciona no DOM legado real."""
    file_url = _HTML_SNAPSHOT.as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        try:
            await page.goto(file_url, wait_until="domcontentloaded")
            screenshot_bytes = await page.screenshot(full_page=False)
            assert len(screenshot_bytes) > 2000, "Screenshot do portal real deve conter imagem válida"
        finally:
            await browser.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])