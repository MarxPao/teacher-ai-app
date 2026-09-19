"""
test_truncated_command_safety.py — Suíte de Validação da Rede de Segurança contra Truncamento Silencioso (Parte 1)

Valida que:
1. Regressão Positiva Pura (Níveis 1 e 2): comandos de 1 e 2 saltos executam normalmente (is_possibly_truncated == False).
2. Suíte de Anti-Falso Positivo (Ajuste 2): 8 frases verbosas legítimas da professora não disparam truncamento indevido.
3. Bloqueio Preventivo em Comandos de 3+ Saltos (Níveis 3, 4 e 5): detecção honesta de truncamento,
   acionamento de mensagem acolhedora e zero cliques no navegador.
"""

import sys
from pathlib import Path
import pytest
import asyncio

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sidecar.navigation_state_machine import (
    decompose_hierarchical_command,
    HierarchicalNavigationModel,
    DecomposedSequence,
)
from sidecar.intent_parser import extract_intent, dispatch_and_execute_task
from sidecar.manual_runner import execute_task_intent


def test_regressao_positiva_pura_niveis_1_e_2():
    """
    Comandos diretos de 1 salto e 2 saltos não devem indicar truncamento.
    """
    # Nível 1 (1 salto)
    r1 = decompose_hierarchical_command("abra notas")
    assert isinstance(r1, DecomposedSequence)
    assert not r1.is_possibly_truncated
    assert len(r1) == 1
    assert r1[0].label == "Notas"
    assert r1.message_to_teacher is None

    # Nível 2 (2 saltos)
    r2 = decompose_hierarchical_command("abra notas e avaliações")
    assert isinstance(r2, DecomposedSequence)
    assert not r2.is_possibly_truncated
    assert len(r2) == 2
    assert r2[0].label == "Notas"
    assert r2[1].label == "Avaliações"
    assert r2.message_to_teacher is None


def test_suite_anti_falso_positivo_8_frases_verbosas():
    """
    Ajuste 2: Suíte de 8 frases com construções ricas, preâmbulos de cortesia,
    intensificadores e cláusulas de observação passiva que NÃO representam saltos de navegação reais.
    Nenhuma delas pode sofrer falso positivo de truncamento.
    """
    frases_teste = [
        ("abra a ficha do Pedro e veja como ele está indo, por favor", ["Meus Alunos", "Pedro"]),
        ("pode abrir notas e me mostrar rapidinho as avaliações", ["Notas", "Avaliações"]),
        ("gostaria que você acessasse o diário e desse uma olhada na turma", ["Diário de Classe"]),
        ("abra frequência e olhe se tem falta demais", ["Frequência"]),
        ("por gentileza, acesse recados para eu conferir as mensagens de hoje", ["Recados"]),
        ("vou querer que você vá até arquivos só pra ver se o documento subiu", ["Arquivos"]),
        ("abre meus alunos e dá uma checada se o cadastro do Carlos tá certo", ["Meus Alunos", "Carlos"]),
        ("preciso que você entre em avaliações com calma para eu dar uma olhada", ["Avaliações"]),
    ]

    for frase, labels_esperados in frases_teste:
        res = decompose_hierarchical_command(frase)
        assert isinstance(res, DecomposedSequence)
        assert not res.is_possibly_truncated, (
            f"Falso positivo detectado em: '{frase}' | "
            f"Remainder: {res.unparsed_remainder} | Indicadores: {res.indicators_found}"
        )
        labels_obtidos = [n.label for n in res]
        assert labels_obtidos == labels_esperados, (
            f"Divergência de nós para: '{frase}' | Esperado: {labels_esperados} | Obtido: {labels_obtidos}"
        )


def test_bloqueio_truncamento_niveis_3_4_5():
    """
    Comandos de 3, 4 e 5 saltos devem ser honestamente identificados como truncados,
    prevenindo a execução incorreta e parcial no navegador.
    """
    comandos_truncados = [
        ("abra notas e depois avaliações e depois faltas", 3, ["Notas", "Avaliações"]),
        ("abra frequência e depois faltas e depois justificativas e depois atestado", 4, ["Frequência", "Frequência"]),
        ("abra início e depois diário e depois turmas e depois alunos e depois histórico", 5, ["Início", "Diário de Classe"]),
    ]

    for comando, nivel, nos_compreendidos in comandos_truncados:
        res = decompose_hierarchical_command(comando)
        assert isinstance(res, DecomposedSequence)
        assert res.is_possibly_truncated, f"Nível {nivel} deveria indicar truncamento: '{comando}'"
        assert len(res.indicators_found) > 0
        assert res.unparsed_remainder is not None
        assert res.message_to_teacher is not None
        assert "Entendi até" in res.message_to_teacher
        assert "Pode dividir em comandos mais simples" in res.message_to_teacher

        # Validação da camada de NLU / IntentParser
        intent = extract_intent(comando)
        assert intent.get("is_complete") is False
        assert intent.get("needs_clarification") is True
        assert intent.get("is_possibly_truncated") is True
        assert intent.get("clarification_question") == res.message_to_teacher


@pytest.mark.asyncio
async def test_zero_execucao_browser_em_comando_truncado():
    """
    Garante que tanto dispatch_and_execute_task quanto execute_task_intent
    barram a chamada ao navegador com zero cliques quando o comando é truncado.
    """
    comando = "abra notas e depois avaliações e depois faltas"

    # 1. Teste via dispatch_and_execute_task
    dispatch_res = await dispatch_and_execute_task(comando)
    assert dispatch_res["sucesso"] is True
    assert dispatch_res["status"] == "needs_clarification"
    assert dispatch_res["needs_clarification"] is True
    assert "Entendi até" in dispatch_res["mensagem"]
    assert dispatch_res["card"] is None

    # 2. Teste direto via execute_task_intent (Defesa em Profundidade)
    intent = extract_intent(comando)
    exec_res = await execute_task_intent(intent)
    assert exec_res["sucesso"] is False
    assert exec_res["status"] == "needs_clarification"
    assert "Entendi até" in exec_res["mensagem"]
    assert any("Bloqueio preventivo" in step for step in exec_res.get("trace", []))
