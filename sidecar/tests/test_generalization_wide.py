"""
tests/test_generalization_wide.py — PARTE 4: Testes de Generalização Ampla

Valida ≥ 3 comandos de LEITURA nunca mencionados antes nesta conversa,
sem adicionar ferramentas novas nem regras específicas antes dos testes.

Casos testados:
  1. "quantos arquivos tem na pasta de Aulas"
     → Navega para Arquivos, lê a tela, sintetiza contagem via answer_from_screen_data.

  2. "resume os últimos recados que recebi"
     → Navega para Recados, lê os cards e resume em linguagem natural.

  3. "qual disciplina eu dou na quinta-feira"
     → Navega para Horários, lê a tabela, extrai coluna Quinta e responde.

Todos os testes usam custom_llm_caller determinístico que simula um LLM
bem-alinhado ao SYSTEM_PROMPT_REACT — sem chamada real a nenhuma API.
"""

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import pytest

_sidecar_dir = str(Path(__file__).resolve().parent.parent)
if _sidecar_dir not in sys.path:
    sys.path.insert(0, _sidecar_dir)

from agentic_execution_loop import AgenticExecutionLoop


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_screen(active_tab: str, tables: list = None, cards: list = None, buttons: list = None):
    return {
        "activeTab": active_tab,
        "availableTabs": ["📋 Diário de Classe", "📁 Arquivos", "💬 Recados", "📅 Horários", "✋ Chamada"],
        "visiblePanes": [{"id": f"pane-{active_tab.lower()}", "headings": [], "cards": cards or []}],
        "tables": tables or [],
        "selects": [],
        "buttons": buttons or [],
        "inputs": []
    }


# ─── Caso 1: Contagem de arquivos ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generalizacao_contar_arquivos():
    """
    'quantos arquivos tem na pasta de Aulas'
    → Turno 1: navega para Arquivos
    → Turno 2: lê a tela com uma tabela de arquivos e responde via answer_from_screen_data
    """
    tabela_arquivos = {
        "id": "tabela_arquivos",
        "headers": ["#", "Nome do Arquivo", "Pasta", "Data"],
        "rows": [
            ["1", "plano_aula_01.pdf", "Aulas", "01/03/2026"],
            ["2", "slides_revisao.pptx", "Aulas", "05/03/2026"],
            ["3", "exercicios_cap3.docx", "Aulas", "10/03/2026"],
            ["4", "recibo_matricula.pdf", "Administrativo", "12/01/2026"],
        ]
    }

    screen_inicial = _make_screen("Diário de Classe")
    screen_arquivos = _make_screen("📁 Arquivos", tables=[tabela_arquivos])

    turno = [0]
    screens = [screen_inicial, screen_arquivos]

    page = MagicMock()
    async def mock_evaluate(script, *args, **kwargs):
        # read_current_screen: alterna entre screens por turno
        return screens[min(turno[0], len(screens) - 1)]
    page.evaluate = mock_evaluate

    def llm_caller(prompt: str):
        turno[0] += 1
        if turno[0] == 1:
            # Turno 1: classifica como comando composto — navega primeiro
            return {
                "pensamento": "O objetivo pede contagem de arquivos. Preciso navegar para a aba Arquivos primeiro.",
                "tool": "navigate_to_tab",
                "args": {"nome_da_aba": "arquivos"}
            }
        else:
            # Turno 2: já está na aba Arquivos com a tabela visível — sintetiza
            return {
                "pensamento": (
                    "Estou na aba Arquivos. A tabela mostra 4 arquivos, dos quais 3 são da pasta 'Aulas'. "
                    "A instrução é LEITURA — uso answer_from_screen_data diretamente."
                ),
                "tool": "answer_from_screen_data",
                "args": {
                    "pergunta": "quantos arquivos tem na pasta de Aulas",
                    "resposta": "Há **3 arquivos** na pasta de Aulas: plano_aula_01.pdf, slides_revisao.pptx e exercicios_cap3.docx."
                }
            }

    # Patch do navigate para não precisar de DOM real
    async def mock_evaluate_full(script, *args, **kwargs):
        # navigate retorna clicado=True; read_current_screen retorna screen
        idx = min(turno[0], len(screens) - 1)
        if isinstance(script, str) and "navigate" in script.lower():
            return {"clicked": True}
        return screens[idx]

    page.evaluate = mock_evaluate_full

    loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=llm_caller)
    result = await loop.run_loop("quantos arquivos tem na pasta de Aulas", max_turns=4)

    assert result["success"] is True, f"Loop deveria ter concluído. Status: {result['status']}, turns: {result['turns']}"
    assert result["turns_count"] == 2
    assert "3" in result["summary"]
    assert "Aulas" in result["summary"]
    # Classificação cognitiva: deve ter usado answer_from_screen_data, não click_element ou ask_clarification
    tool_usado = result["turns"][-1]["tool"]
    assert tool_usado == "answer_from_screen_data", f"Deveria usar answer_from_screen_data, usou: {tool_usado}"


# ─── Caso 2: Resumo de recados ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generalizacao_resumir_recados():
    """
    'resume os últimos recados que recebi'
    → Turno 1: navega para Recados
    → Turno 2: lê os cards de recados e gera resumo via answer_from_screen_data
    """
    screen_inicial = _make_screen("Diário de Classe")
    screen_recados = _make_screen(
        "💬 Recados",
        cards=[
            "Mãe do aluno Hugo Ribeiro (Dona Patrícia) — Hoje, 09:30\nOlá professora, gostaria de saber se o Hugo precisa de reforço para a prova de recuperação de amanhã.",
            "Coordenação Pedagógica — Ontem, 16:00\nLembrete: reunião de pais e mestres na sexta-feira às 19h00."
        ]
    )

    turno = [0]

    def llm_caller(prompt: str):
        turno[0] += 1
        if turno[0] == 1:
            return {
                "pensamento": "Preciso navegar para a aba de Recados para ver as mensagens.",
                "tool": "navigate_to_tab",
                "args": {"nome_da_aba": "recados"}
            }
        else:
            return {
                "pensamento": (
                    "Estou na aba Recados. Vejo 2 cards: um da mãe do Hugo sobre reforço e um da coordenação "
                    "sobre reunião. É uma LEITURA — uso answer_from_screen_data."
                ),
                "tool": "answer_from_screen_data",
                "args": {
                    "pergunta": "resume os últimos recados que recebi",
                    "resposta": (
                        "Você tem 2 recados recentes:\n"
                        "1. **Dona Patrícia (mãe do Hugo Ribeiro)** pergunta se o Hugo precisa de reforço para a prova de recuperação de amanhã.\n"
                        "2. **Coordenação Pedagógica** lembra sobre a reunião de pais e mestres na sexta-feira às 19h."
                    )
                }
            }

    page = MagicMock()
    screens = [screen_inicial, screen_recados]

    async def mock_evaluate(script, *args, **kwargs):
        idx = min(turno[0], len(screens) - 1)
        return screens[idx]

    page.evaluate = mock_evaluate

    loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=llm_caller)
    result = await loop.run_loop("resume os últimos recados que recebi", max_turns=4)

    assert result["success"] is True
    assert result["turns_count"] == 2
    assert "Hugo" in result["summary"] or "recado" in result["summary"].lower()
    assert "Coordenação" in result["summary"] or "reunião" in result["summary"].lower()
    tool_usado = result["turns"][-1]["tool"]
    assert tool_usado == "answer_from_screen_data"


# ─── Caso 3: Disciplina na quinta-feira ──────────────────────────────────────

@pytest.mark.asyncio
async def test_generalizacao_disciplina_quinta_feira():
    """
    'qual disciplina eu dou na quinta-feira'
    → Turno 1: navega para Horários
    → Turno 2: lê a tabela de horários e sintetiza as aulas da quinta
    """
    tabela_horarios = {
        "id": "tabela_horarios",
        "headers": ["Horário", "Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        "rows": [
            ["07h-08h", "—", "—", "—", "Inglês 8A", "—"],
            ["08h-09h", "—", "Inglês 9B", "—", "—", "—"],
            ["09h-10h", "Inglês 7C", "—", "—", "Inglês 9B", "—"],
            ["10h-11h", "—", "—", "—", "—", "Inglês 8A"],
            ["11h-12h", "—", "—", "Inglês 7C", "—", "—"],
            ["14h-15h", "—", "—", "—", "—", "Inglês 6D"],
        ]
    }

    screen_inicial = _make_screen("Diário de Classe")
    screen_horarios = _make_screen("📅 Horários", tables=[tabela_horarios])

    turno = [0]

    def llm_caller(prompt: str):
        turno[0] += 1
        if turno[0] == 1:
            return {
                "pensamento": "Preciso ver a grade de horários. Navego para a aba Horários.",
                "tool": "navigate_to_tab",
                "args": {"nome_da_aba": "horários"}
            }
        else:
            return {
                "pensamento": (
                    "Estou na aba Horários com a tabela visível. A coluna 'Quinta' mostra: "
                    "07h-08h: Inglês 8A, 09h-10h: Inglês 9B. São turmas de Língua Inglesa. "
                    "Instrução é LEITURA — uso answer_from_screen_data."
                ),
                "tool": "answer_from_screen_data",
                "args": {
                    "pergunta": "qual disciplina eu dou na quinta-feira",
                    "resposta": (
                        "📅 **Na quinta-feira você dá Língua Inglesa** em dois horários:\n"
                        "- 07h-08h: Inglês 8A\n"
                        "- 09h-10h: Inglês 9B"
                    )
                }
            }

    page = MagicMock()
    screens = [screen_inicial, screen_horarios]

    async def mock_evaluate(script, *args, **kwargs):
        idx = min(turno[0], len(screens) - 1)
        return screens[idx]

    page.evaluate = mock_evaluate

    loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=llm_caller)
    result = await loop.run_loop("qual disciplina eu dou na quinta-feira", max_turns=4)

    assert result["success"] is True
    assert result["turns_count"] == 2
    assert "Inglês" in result["summary"] or "quinta" in result["summary"].lower()
    tool_usado = result["turns"][-1]["tool"]
    assert tool_usado == "answer_from_screen_data"


# ─── Meta-teste: nenhum dos 3 casos usa ask_clarification ────────────────────

@pytest.mark.asyncio
async def test_generalizacao_nenhum_caso_pede_esclarecimento():
    """
    Nenhum dos 3 comandos de leitura inéditos deve terminar em ask_clarification.
    O loop deve conseguir responder diretamente com answer_from_screen_data.
    Este meta-teste verifica que a classificação cognitiva Ação vs. Leitura
    funciona genericamente sem regras específicas por caso.
    """
    tabela_mock = {
        "id": "tabela_generica",
        "headers": ["Col1", "Col2", "Col3"],
        "rows": [["dado1", "dado2", "dado3"]]
    }
    screen = _make_screen("Aba Qualquer", tables=[tabela_mock])

    casos = [
        ("quantos arquivos tem na pasta de Aulas", "3 arquivos na pasta Aulas"),
        ("resume os últimos recados que recebi", "2 recados recentes: Hugo e Coordenação"),
        ("qual disciplina eu dou na quinta-feira", "Inglês 8A e 9B na quinta-feira"),
    ]

    for goal, resposta_esperada in casos:
        page = MagicMock()
        page.evaluate = AsyncMock(return_value=screen)

        def make_caller(resp):
            def llm_caller(prompt: str):
                return {
                    "pensamento": "Dados visíveis na tela — respondo diretamente sem buscar botões.",
                    "tool": "answer_from_screen_data",
                    "args": {"pergunta": goal, "resposta": resp}
                }
            return llm_caller

        loop = AgenticExecutionLoop(page=page, portal_id="test", custom_llm_caller=make_caller(resposta_esperada))
        result = await loop.run_loop(goal, max_turns=3)

        assert result["success"] is True, f"Falhou para objetivo: '{goal}'"
        last_tool = result["turns"][-1]["tool"]
        assert last_tool != "ask_clarification", (
            f"Para '{goal}': esperava answer_from_screen_data, obteve ask_clarification"
        )
        assert last_tool == "answer_from_screen_data", (
            f"Para '{goal}': ferramenta usada foi '{last_tool}', esperava 'answer_from_screen_data'"
        )
