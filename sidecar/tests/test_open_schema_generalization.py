"""
test_open_schema_generalization.py — Testes Automatizados da Generalização Aberta e Grounding no DOM

Valida:
1. Extração semântica com Schema Aberto (verbo_acao, objeto_alvo, tipo_operacao, valor, etc.)
   em tarefas escolares nunca antes catalogadas, sem cair em 'outro' e sem enums fixos.
2. Classificação de Risco (tipo_operacao: escrita vs leitura).
3. Grounding semântico agnóstico no DOM real do sandbox (portal_mock.html) para 3 tarefas não catalogadas:
   - Tarefa 1: Conteúdo/Pauta da Aula (fora da tabela) -> #conteudo_aula
   - Tarefa 2: Presença / Participação em linha de aluno -> #presenca_7
   - Tarefa 3: Data da aula -> #data_aula
"""

import asyncio
import os
import sys
from pathlib import Path
import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from playwright.async_api import async_playwright
from intent_parser import extract_intent
from browser_use_agent import BrowserUseAgent


def test_open_schema_intent_parser_uncatalogued_tasks():
    """Valida que tarefas inéditas são extraídas com schema aberto sem enum fixo."""
    test_cases = [
        ("preenche o conteúdo da aula como Revisão de Verbos", "preencher", "conteúdo", "escrita", "Revisão de Verbos"),
        ("marca presença para o Hugo", "marcar", "presença", "escrita", "Hugo"),
        ("preenche a data da aula como 2026-09-15", "preencher", "data", "escrita", "2026-09-15"),
        ("anota uma ocorrência disciplinar pro Hugo: conversa paralela", "anotar", "ocorrência", "escrita", "Hugo"),
    ]

    for phrase, exp_verbo, exp_objeto, exp_risco, exp_token in test_cases:
        intent = extract_intent(phrase)
        assert intent["is_complete"] is True, f"Frase '{phrase}' deveria ser completa"
        assert exp_verbo in intent["verbo_acao"].lower(), f"Verbo '{exp_verbo}' esperado em '{intent.get('verbo_acao')}'"
        assert exp_objeto in intent["objeto_alvo"].lower(), f"Objeto '{exp_objeto}' esperado em '{intent.get('objeto_alvo')}'"
        assert intent["tipo_operacao"] == exp_risco
        context_str = f"{intent.get('aluno') or ''} {intent.get('valor') or ''} {intent.get('descricao_tarefa') or ''}"
        assert exp_token.lower() in context_str.lower(), f"Token '{exp_token}' esperado no contexto extraído"


def test_open_schema_risk_classification():
    """Valida classificação estrita de risco (escrita vs leitura)."""
    escrita_phrases = [
        "lança nota 8 para a Ana",
        "registra falta pro Hugo",
        "preenche o diário de classe com Simple Past",
        "marca presença para todos os alunos",
    ]
    for p in escrita_phrases:
        intent = extract_intent(p)
        assert intent["tipo_operacao"] == "escrita", f"'{p}' deveria ser classificada como escrita"

    leitura_phrases = [
        "quem são os alunos da turma?",
        "onde estamos no portal?",
        "abrir notas",
        "ver lista de arquivos",
    ]
    for p in leitura_phrases:
        intent = extract_intent(p)
        assert intent["tipo_operacao"] == "leitura", f"'{p}' deveria ser classificada como leitura"


@pytest.mark.asyncio
async def test_e2e_open_schema_grounding_uncatalogued_tasks():
    """Valida grounding no DOM real de portal_mock.html para 3 tarefas não catalogadas."""
    sandbox_path = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"
    assert sandbox_path.exists(), f"Sandbox portal_mock.html não encontrado em {sandbox_path}"
    portal_url = sandbox_path.as_uri()

    tasks = [
        {
            "phrase": "preenche o conteúdo da aula como Revisão de Verbos",
            "expected_selector": "#conteudo_aula"
        },
        {
            "phrase": "marca presença para o Hugo",
            "expected_selector": "#presenca_7"
        },
        {
            "phrase": "preenche a data da aula como 2026-09-15",
            "expected_selector": "#data_aula"
        }
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        await page.goto(portal_url)

        bu_agent = BrowserUseAgent(confidence_threshold=0.7)

        for t in tasks:
            intent = extract_intent(t["phrase"])
            task_spec = {
                "acao": intent.get("acao"),
                "objeto_alvo": intent.get("objeto_alvo"),
                "verbo_acao": intent.get("verbo_acao"),
                "aluno": intent.get("aluno"),
                "valor": intent.get("valor"),
                "tipo_operacao": intent.get("tipo_operacao"),
                "descricao_tarefa": intent.get("descricao_tarefa"),
                "portal_id": "portal_mock"
            }

            res = await bu_agent.execute_discovery_task(task_spec, target_page=page)
            assert res.sucesso is True, f"Descoberta falhou para '{t['phrase']}': {res.erro}"
            assert res.confianca >= 0.70, f"Confiança insuficiente ({res.confianca}) para '{t['phrase']}'"

            write_actions = [a for a in res.trace_de_acoes if a.get("action_type") == "WRITE"]
            assert len(write_actions) > 0, f"Nenhuma ação WRITE gerada para '{t['phrase']}'"
            assert write_actions[0].get("selector") == t["expected_selector"], (
                f"Seletor incorreto para '{t['phrase']}': esperado '{t['expected_selector']}', obtido '{write_actions[0].get('selector')}'"
            )

        await browser.close()
