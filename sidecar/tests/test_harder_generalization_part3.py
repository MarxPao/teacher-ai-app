"""
test_harder_generalization_part3.py — Suíte Formal de Generalização e Grounding Avançado

Valida formalmente as 5 tarefas escolares com Schema Aberto e Grounding Semântico no DOM:
1. Pauta / Conteúdo da aula (campo fora da tabela) -> #conteudo_aula
2. Presença individual em linha de aluno (checkbox na linha do estudante) -> #presenca_7
3. Data pedagógica da aula (campo date) -> #data_aula
4. Tarefa Avançada B: Observação livre longa em <textarea> pedagógica -> #observacao_pedagogica
5. Tarefa Avançada A: Mudar turma com navegação autônoma multi-tela -> clica #tab-cadastro e seleciona #turma_aluno

Valida também o cálculo contínuo e individual de confiança no trace (CALCULATE_CONFIDENCE).
"""

import sys
from pathlib import Path
import pytest
from playwright.async_api import async_playwright

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from intent_parser import extract_intent
from browser_use_agent import BrowserUseAgent


def test_camada1_intent_parser_five_tasks():
    """Valida a Camada 1 (NLU aberta) para as 5 tarefas sem enums fixos."""
    tasks = [
        ("preenche o conteúdo da aula como Revisão de Verbos", "preencher", "conteúdo", "escrita", "Revisão de Verbos"),
        ("marca presença para o Hugo", "marcar", "presença", "escrita", "Hugo"),
        ("preenche a data da aula como 2026-09-15", "preencher", "data", "escrita", "2026-09-15"),
        ("anota uma observação: Hugo não trouxe o material hoje", "anotar", "observação", "escrita", "material"),
        ("muda a turma do Hugo para 6º B", "mudar", "turma", "escrita", "6º B"),
    ]

    for phrase, exp_verbo, exp_objeto, exp_risco, exp_token in tasks:
        intent = extract_intent(phrase)
        assert intent["is_complete"] is True, f"Frase '{phrase}' deveria estar completa"
        assert exp_verbo in intent["verbo_acao"].lower(), f"Verbo '{exp_verbo}' esperado em '{intent.get('verbo_acao')}'"
        assert exp_objeto in intent["objeto_alvo"].lower(), f"Objeto '{exp_objeto}' esperado em '{intent.get('objeto_alvo')}'"
        assert intent["tipo_operacao"] == exp_risco
        context_str = f"{intent.get('aluno') or ''} {intent.get('valor') or ''} {intent.get('turma') or ''} {intent.get('descricao_tarefa') or ''}"
        assert exp_token.lower() in context_str.lower(), f"Token '{exp_token}' esperado em '{context_str}'"


@pytest.mark.asyncio
async def test_camada2_dom_grounding_five_tasks():
    """Valida a Camada 2 (Grounding DOM) com navegador real Playwright para as 5 tarefas."""
    sandbox_path = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"
    assert sandbox_path.exists(), f"Sandbox portal_mock.html não encontrado em {sandbox_path}"
    portal_url = sandbox_path.as_uri()

    all_tasks = [
        {
            "id": "1. Pauta / Conteúdo da aula",
            "phrase": "preenche o conteúdo da aula como Revisão de Verbos",
            "expected_target": "#conteudo_aula",
            "requires_nav": False
        },
        {
            "id": "2. Presença individual em linha de aluno",
            "phrase": "marca presença para o Hugo",
            "expected_target": "#presenca_7",
            "requires_nav": False
        },
        {
            "id": "3. Data pedagógica da aula",
            "phrase": "preenche a data da aula como 2026-09-15",
            "expected_target": "#data_aula",
            "requires_nav": False
        },
        {
            "id": "4. Tarefa Avançada B (Textarea livre de observação longo)",
            "phrase": "anota uma observação: Hugo não trouxe o material hoje",
            "expected_target": "#observacao_pedagogica",
            "requires_nav": False
        },
        {
            "id": "5. Tarefa Avançada A (Navegação para outra tela: Cadastro / Mudar Turma)",
            "phrase": "muda a turma do Hugo para 6º B",
            "expected_target": "#turma_aluno",
            "requires_nav": True,
            "expected_nav_tab": "#tab-cadastro"
        }
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        bu = BrowserUseAgent(confidence_threshold=0.7)

        for t in all_tasks:
            await page.goto(portal_url)
            await page.wait_for_load_state("domcontentloaded")

            intent = extract_intent(t["phrase"])
            task_spec = {
                "acao": intent.get("acao"),
                "objeto_alvo": intent.get("objeto_alvo"),
                "verbo_acao": intent.get("verbo_acao"),
                "aluno": intent.get("aluno"),
                "valor": intent.get("valor"),
                "turma": intent.get("turma"),
                "tipo_operacao": intent.get("tipo_operacao"),
                "descricao_tarefa": intent.get("descricao_tarefa"),
                "destino_navegacao": intent.get("destino_navegacao"),
                "portal_id": "portal_mock"
            }

            res = await bu.execute_discovery_task(task_spec, target_page=page)

            # 1. Assert sucesso e confiança suficiente
            assert res.sucesso is True, f"Falha na tarefa '{t['id']}': {res.erro}"
            assert res.confianca >= 0.70, f"Confiança insuficiente ({res.confianca}) na tarefa '{t['id']}'"

            # 2. Assert seletor alvo correto
            write_act = next((a for a in res.trace_de_acoes if a.get("action_type") == "WRITE"), None)
            assert write_act is not None, f"Ação WRITE ausente no trace da tarefa '{t['id']}'"
            assert write_act.get("selector") == t["expected_target"], (
                f"Seletor incorreto na tarefa '{t['id']}': esperado '{t['expected_target']}', obtido '{write_act.get('selector')}'"
            )

            # 3. Assert cálculo de confiança no trace com pontuação semântica individual
            calc_act = next((a for a in res.trace_de_acoes if a.get("action_type") == "CALCULATE_CONFIDENCE"), None)
            assert calc_act is not None, f"Evento CALCULATE_CONFIDENCE ausente no trace da tarefa '{t['id']}'"
            assert calc_act.get("score") is not None and calc_act.get("score") > 0, (
                f"Score semântico bruto inválido na tarefa '{t['id']}': {calc_act.get('score')}"
            )

            # 4. Assert navegação multi-tela quando exigida (Tarefa 5)
            if t.get("requires_nav"):
                click_nav_act = next(
                    (a for a in res.trace_de_acoes if a.get("action_type") == "CLICK" and "Navegar" in a.get("description", "")),
                    None
                )
                assert click_nav_act is not None, f"Navegação multi-tela não foi registrada no trace da tarefa '{t['id']}'"
                assert click_nav_act.get("selector") == t.get("expected_nav_tab"), (
                    f"Aba de navegação incorreta: esperado '{t.get('expected_nav_tab')}', obtido '{click_nav_act.get('selector')}'"
                )

        await browser.close()
