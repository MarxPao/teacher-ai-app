"""
test_compound_navigation_e2e.py — Teste de ponta a ponta de comando composto
Valida o fluxo completo de "abrir arquivos e selecionar sexto ano":
1. Separação de destino ('arquivos') sem contaminação por conjunção ('e').
2. Navegação com sucesso para a aba Arquivos no DOM do portal.
3. Execução automática do segundo passo (Discovery de 'sexto ano') no filtro da aba recém-aberta.
4. Sucesso real quando a opção existe vs pedido honesto de esclarecimento quando a opção não existe.
"""

from pathlib import Path
import pytest
from playwright.async_api import async_playwright

from sidecar.intent_parser import split_compound_command

PORTAL_MOCK_PATH = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"


@pytest.mark.asyncio
async def test_abrir_arquivos_e_selecionar_sexto_ano_e2e():
    assert PORTAL_MOCK_PATH.exists(), f"portal_mock.html não encontrado: {PORTAL_MOCK_PATH}"

    command = "abrir arquivos e selecionar sexto ano"
    compound = split_compound_command(command)

    assert compound["has_navigation"] is True
    assert compound["nav_target"] == "arquivos"
    assert "e" not in compound["nav_target"].split()
    assert compound["conjunction"] == "e"
    assert compound["remaining_command"] == "selecionar sexto ano"
    assert compound["is_compound"] is True

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(PORTAL_MOCK_PATH.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        # 1. Verifica estado inicial
        pane_diario = page.locator("#pane-diario")
        pane_arquivos = page.locator("#pane-arquivos")
        assert await pane_diario.is_visible() is True
        assert await pane_arquivos.is_visible() is False

        # 2. Passo 1: Navegação para a aba 'arquivos'
        nav_target = compound["nav_target"]
        tab_button = page.locator(f"button:has-text('{nav_target.title()}'), #tab-{nav_target}")
        assert await tab_button.count() > 0
        await tab_button.first.click()

        await page.wait_for_timeout(200)
        assert await pane_arquivos.is_visible() is True

        # 3. Passo 2: Discovery e seleção do filtro 'sexto ano'
        remaining = compound["remaining_command"]
        filter_term = remaining.replace("selecionar", "").strip()
        assert filter_term == "sexto ano"

        select_script = """
        (term) => {
            const cleanStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
            const normTerm = cleanStr(term);
            const ordinalMap = {
              'primeiro': '1', 'segundo': '2', 'terceiro': '3', 'quarto': '4',
              'quinto': '5', 'sexto': '6', 'setimo': '7', 'oitavo': '8', 'nono': '9'
            };

            const searchVariants = [normTerm];
            for (const [word, num] of Object.entries(ordinalMap)) {
              if (normTerm.includes(word)) {
                searchVariants.push(normTerm.replace(word, num));
                searchVariants.push(normTerm.replace(word, `${num}o`));
                searchVariants.push(normTerm.replace(word, `${num}º`));
                searchVariants.push(num);
                searchVariants.push(`${num}o`);
                searchVariants.push(`${num}º`);
              } else if (normTerm.includes(num)) {
                searchVariants.push(normTerm.replace(num, word));
                searchVariants.push(word);
              }
            }
            const uniqueVariants = Array.from(new Set(searchVariants.filter(Boolean)));

            const selects = Array.from(document.querySelectorAll('select'));
            for (const sel of selects) {
                for (let i = 0; i < sel.options.length; i++) {
                    const opt = sel.options[i];
                    const optText = cleanStr(opt.text);
                    const optVal = cleanStr(opt.value);
                    if (uniqueVariants.some(v => optText.includes(v) || optVal === v)) {
                        sel.selectedIndex = i;
                        sel.value = opt.value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        return { sucesso: true, elementText: opt.text.trim(), value: opt.value };
                    }
                }
            }
            return { sucesso: false };
        }
        """
        result = await page.evaluate(select_script, filter_term)

        assert result["sucesso"] is True
        assert "Sexto Ano" in result["elementText"]
        assert result["value"] == "6"

        filtro_val = await page.locator("#filtro_turma_arquivos").input_value()
        assert filtro_val == "6"

        # 4. Caso de esclarecimento honesto: termo inexistente retorna sucesso: False
        result_neg = await page.evaluate(select_script, "turma inexistente zzz")
        assert result_neg["sucesso"] is False

        await browser.close()
