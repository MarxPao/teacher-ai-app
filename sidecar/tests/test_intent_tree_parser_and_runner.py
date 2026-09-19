"""
test_intent_tree_parser_and_runner.py — Suíte de Testes da Árvore de Intenção e Orquestrador Recursivo (Parte 2)

Validações Obrigatórias:
1. Decomposição de N saltos com árvore hierárquica (Níveis 3, 4 e 5 sem truncamento silencioso).
2. Avaliação de condições (if/then/else) e execução do branch vencedor.
3. Execução de lotes multi-entidade (batch_item) com isolamento estrito.
4. Ajuste 3: Limites exatos de 7 e 8 saltos (tempo < 5.000 ms e matching intacto) + trava honesta em 9+ saltos.
5. Adição 1: Entidade desconhecida no roster ('Zeferino Anacleto') comprova que o Critério 3 de
   Confiança Suficiente falha e a execução transiciona para a Camada C (esclarecimento).
6. Preservação do Origin Verification Gate em nós de mutação da árvore.
"""

import sys
import time
from pathlib import Path
import pytest
import asyncio
from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sidecar.intent_tree import (
    IntentNode,
    IntentCondition,
    IntentTreeParser,
    parse_intent_tree,
    ParseTreeResult,
)
from sidecar.intent_tree_runner import IntentTreeRunner, MAX_TREE_DEPTH
from sidecar.navigation_state_machine import HierarchicalNavigationModel

PORTAL_MOCK_PATH = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"
BENCHMARK_FIXTURE_PATH = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "benchmark_fixture.html"


def test_n_hop_decomposition_levels_3_4_5():
    """
    Decompõe comandos de 3, 4 e 5 saltos em nós encadeados em profundidade,
    sem truncar nós finais.
    """
    # Nível 3 (3 saltos)
    r3 = parse_intent_tree("abra notas e depois avaliações e depois médias")
    assert r3.success
    assert r3.root is not None
    assert r3.root.depth() == 3
    assert r3.root.target == "Notas"
    assert r3.root.children[0].target == "Avaliações"
    assert r3.root.children[0].children[0].target == "Médias"

    # Nível 4 (4 saltos)
    r4 = parse_intent_tree("abra frequência e depois faltas e depois justificativas e depois atestado")
    assert r4.success
    assert r4.root is not None
    assert r4.root.depth() == 4
    assert r4.root.target == "Frequência"

    # Nível 5 (5 saltos)
    r5 = parse_intent_tree("abra início e depois diário e depois aulas e depois notas e depois avaliações")
    assert r5.success
    assert r5.root is not None
    assert r5.root.depth() == 5


def test_conditional_if_then_else_parsing_and_execution():
    """
    Valida parsing de condições (if/then/else) e a execução estrita do ramo vencedor.
    """
    roster = ["Alice Almeida", "Bernardo Silva", "Carlos Eduardo", "Pedro Santos"]
    cmd = "se faltas do Pedro > 3 então lance nota 5 para Pedro senão abra notas"
    res = parse_intent_tree(cmd, known_students=roster)
    assert res.success
    assert res.root is not None
    assert res.root.kind == "condition"
    assert res.root.condition is not None
    assert res.root.condition.subject == "faltas do Pedro"
    assert res.root.condition.operator == "gt"
    assert res.root.condition.value == 3.0
    assert res.root.condition.then_branch.kind == "action"
    assert res.root.condition.then_branch.action_name == "lancar_nota"
    assert res.root.condition.then_branch.value == 5.0
    assert res.root.condition.else_branch.kind == "navigate"
    assert res.root.condition.else_branch.target == "Notas"

    runner = IntentTreeRunner()

    # Cenário A: Faltas = 5 (> 3) -> Ramo THEN acionado
    exec_then = asyncio.run(runner.execute_tree(res.root, context={"faltas do Pedro": 5.0}))
    assert exec_then["sucesso"]
    assert exec_then["action_name"] == "lancar_nota"
    assert exec_then["value"] == 5.0
    assert exec_then["entity"] == "Pedro"

    # Cenário B: Faltas = 1 (não > 3) -> Ramo ELSE acionado
    exec_else = asyncio.run(runner.execute_tree(res.root, context={"faltas do Pedro": 1.0}))
    assert exec_else["sucesso"]
    assert exec_else["target"] == "Notas"


def test_batch_multi_entity_parsing_and_execution():
    """
    Valida parsing de lote multi-entidade garantindo que cada aluno receba sua ação
    sem fusão indevida de termos.
    """
    roster = ["Alice Almeida", "Bernardo Silva"]
    cmd = "para Alice lance nota 8 e para Bernardo lance nota 9"
    res = parse_intent_tree(cmd, known_students=roster)
    assert res.success
    assert res.root is not None
    assert res.root.kind == "sequence"
    assert len(res.root.children) == 2

    c1, c2 = res.root.children
    assert c1.kind == "batch_item"
    assert c1.entity == "Alice"
    assert c1.value == 8.0
    assert c1.action_name == "lancar_nota"

    assert c2.kind == "batch_item"
    assert c2.entity == "Bernardo"
    assert c2.value == 9.0
    assert c2.action_name == "lancar_nota"

    runner = IntentTreeRunner()
    exec_res = asyncio.run(runner.execute_tree(res.root))
    assert exec_res["sucesso"]
    assert len(exec_res["step_results"]) == 2


def test_limites_exatos_7_e_8_saltos_e_trava_9_saltos():
    """
    Ajuste 3 (Validação de AST Estrutural em Memória):
    Comprova a decomposição recursiva da árvore, cálculo de profundidade e a trava rígida
    de MAX_TREE_DEPTH = 8 a partir de 9 saltos, sem browser anexado (page=None).
    """
    runner = IntentTreeRunner()

    # Limite 7 saltos
    cmd7 = "abra início e depois diário e depois aulas e depois notas e depois avaliações e depois médias e depois recados"
    t0 = time.time()
    r7 = parse_intent_tree(cmd7)
    assert r7.success
    assert r7.root.depth() == 7
    exec7 = asyncio.run(runner.execute_tree(r7.root))
    t7_ms = (time.time() - t0) * 1000
    assert exec7["sucesso"]
    assert t7_ms < 5000.0, f"Tempo de 7 saltos ({t7_ms:.2f}ms) deve ser < 5.000ms"

    # Limite 8 saltos
    cmd8 = "abra início e depois diário e depois aulas e depois notas e depois avaliações e depois médias e depois recados e depois enviados"
    t0 = time.time()
    r8 = parse_intent_tree(cmd8)
    assert r8.success
    assert r8.root.depth() == 8
    exec8 = asyncio.run(runner.execute_tree(r8.root))
    t8_ms = (time.time() - t0) * 1000
    assert exec8["sucesso"]
    assert t8_ms < 5000.0, f"Tempo de 8 saltos ({t8_ms:.2f}ms) deve ser < 5.000ms"

    # Trava 9 saltos (Excede MAX_TREE_DEPTH = 8)
    cmd9 = "abra início e depois diário e depois aulas e depois notas e depois avaliações e depois médias e depois recados e depois enviados e depois novo recado"
    r9 = parse_intent_tree(cmd9)
    assert r9.success
    assert r9.root.depth() == 9
    exec9 = asyncio.run(runner.execute_tree(r9.root))
    assert not exec9["sucesso"]
    assert exec9["status"] == "depth_limit_exceeded"
    assert "cadeia muito longa de passos" in exec9["mensagem"]
    assert exec9["depth"] == 9
    assert exec9["max_depth"] == 8


def test_adicao_1_entidade_desconhecida_falha_criterio_3_e_cai_para_camada_c():
    """
    Adição 1: Valida que uma entidade inexistente no roster de alunos ('Zeferino Anacleto')
    provoca a falha imediata do Critério 3 de Confiança Suficiente,
    fazendo o parser transicionar com segurança para a Camada C (esclarecimento acolhedor).
    """
    roster_turma = ["Alice Almeida", "Bernardo Silva", "Carlos Eduardo"]

    # 1. Comando de perfil com aluno desconhecido
    r1 = parse_intent_tree("abra a ficha do Zeferino Anacleto", known_students=roster_turma)
    assert not r1.success
    assert r1.layer_used == "clarification"
    assert r1.needs_clarification is True
    assert "Não encontrei 'Zeferino Anacleto' na turma ativa" in r1.clarification_question
    assert "Gostaria de verificar a lista de alunos da turma?" in r1.clarification_question

    # 2. Comando de nota com aluno desconhecido
    r2 = parse_intent_tree("lance nota 8 para Zeferino Anacleto", known_students=roster_turma)
    assert not r2.success
    assert r2.layer_used == "clarification"
    assert r2.needs_clarification is True
    assert "Não encontrei 'Zeferino Anacleto' na turma ativa" in r2.clarification_question


def test_origin_verification_gate_preservado_na_arvore():
    """
    Garante que se a instrução da árvore originar-se de 'page_content' (conteúdo de terceiros),
    o IntentTreeRunner recusa mutações com status 'blocked_untrusted_origin'.
    """
    runner = IntentTreeRunner()
    node_mutacao = IntentNode(
        kind="action",
        action_name="lancar_nota",
        entity="Alice",
        value=10.0,
        target="Nota"
    )

    # Execução originada de terceiros/DOM -> BLOQUEADA
    res_bloqueado = asyncio.run(runner.execute_tree(node_mutacao, instruction_origin="page_content"))
    assert not res_bloqueado["sucesso"]
    assert res_bloqueado["status"] == "blocked_untrusted_origin"

    # Execução originada legitimamente da professora -> AUTORIZADA
    res_autorizado = asyncio.run(runner.execute_tree(node_mutacao, instruction_origin="user_command"))
    assert res_autorizado["sucesso"]
    assert res_autorizado["status"] == "action_completed"


@pytest.mark.asyncio
async def test_execucao_arvore_no_dom_real():
    """
    Validação ponta a ponta: executa uma árvore de 2 passos no mock do portal via Playwright.
    """
    if not PORTAL_MOCK_PATH.exists():
        pytest.skip(f"Portal mock não encontrado em: {PORTAL_MOCK_PATH}")

    cmd = "abra recados e depois novo recado"
    res = parse_intent_tree(cmd)
    assert res.success
    assert res.root is not None

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        await page.goto(PORTAL_MOCK_PATH.as_uri())

        runner = IntentTreeRunner()
        exec_res = await runner.execute_tree(res.root, page=page)
        await browser.close()

        assert exec_res["sucesso"]
        assert exec_res["depth"] == 2


@pytest.mark.asyncio
async def test_execucao_dom_real_7_e_8_saltos_playwright():
    """
    Ajuste 3 (DOM Real): Executa árvores de 7 e 8 saltos no DOM real via Playwright
    contra o fixture `benchmark_fixture.html`, medindo o tempo físico real de navegação
    e provando a trava de profundidade no 9º salto.
    """
    if not BENCHMARK_FIXTURE_PATH.exists():
        pytest.skip(f"Benchmark fixture não encontrado: {BENCHMARK_FIXTURE_PATH}")

    def _build_chain(nodes_list):
        root = nodes_list[0]
        curr = root
        for child in nodes_list[1:]:
            curr.children = [child]
            curr = child
        return root

    # Sequência de 7 saltos reais no DOM (profundidade exata = 7)
    nodes_7 = [
        IntentNode(kind="navigate", target="Meus Alunos", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Carlos Eduardo", action_name="abrir_perfil"),
        IntentNode(kind="navigate", target="Histórico Escolar", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Aba de Faltas", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Ver Justificativas", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Atestado Médico Anexo", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Detalhes do CID", action_name="navegar_aba"),
    ]
    tree_7 = _build_chain(nodes_7)

    # Sequência de 8 saltos reais no DOM (profundidade exata = 8)
    nodes_8 = [
        IntentNode(kind="navigate", target="Meus Alunos", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Carlos Eduardo", action_name="abrir_perfil"),
        IntentNode(kind="navigate", target="Histórico Escolar", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Aba de Faltas", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Ver Justificativas", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Atestado Médico Anexo", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Detalhes do CID", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Parecer Médico Final", action_name="navegar_aba"),
    ]
    tree_8 = _build_chain(nodes_8)

    # Sequência de 9 saltos (profundidade 9 excede MAX_TREE_DEPTH = 8)
    nodes_9 = [
        IntentNode(kind="navigate", target="Meus Alunos", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Carlos Eduardo", action_name="abrir_perfil"),
        IntentNode(kind="navigate", target="Histórico Escolar", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Aba de Faltas", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Ver Justificativas", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Atestado Médico Anexo", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Detalhes do CID", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Parecer Médico Final", action_name="navegar_aba"),
        IntentNode(kind="navigate", target="Assinatura Digital", action_name="navegar_aba"),
    ]
    tree_9 = _build_chain(nodes_9)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        runner = IntentTreeRunner()

        # 1. Executa 7 saltos no DOM Real
        await page.goto(BENCHMARK_FIXTURE_PATH.as_uri())
        t0 = time.time()
        res7 = await runner.execute_tree(tree_7, page=page)
        t7_ms = (time.time() - t0) * 1000
        assert res7["sucesso"]
        assert res7["depth"] == 7
        assert t7_ms > 500.0, f"Tempo físico real de 7 saltos ({t7_ms:.1f}ms) deve refletir interação real com DOM"

        # 2. Executa 8 saltos no DOM Real
        await page.goto(BENCHMARK_FIXTURE_PATH.as_uri())
        t0 = time.time()
        res8 = await runner.execute_tree(tree_8, page=page)
        t8_ms = (time.time() - t0) * 1000
        assert res8["sucesso"]
        assert res8["depth"] == 8
        assert t8_ms > 500.0, f"Tempo físico real de 8 saltos ({t8_ms:.1f}ms) deve refletir interação real com DOM"

        # 3. Trava de 9 saltos impede qualquer navegação no DOM
        res9 = await runner.execute_tree(tree_9, page=page)
        assert not res9["sucesso"]
        assert res9["status"] == "depth_limit_exceeded"
        assert res9["depth"] == 9
        assert res9["max_depth"] == 8

        await browser.close()
