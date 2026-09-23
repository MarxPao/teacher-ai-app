"""
test_hierarchical_navigation_motor.py — Suíte de Testes do Motor de Navegação Multi-Nível e Exploração Iterativa (H5)

Valida as Camadas A, B e C nos 4 cenários mandatórios:
1. Bug 1: "abra recados e abra recados recebidos" (sub-navegação 2 passos sem sequestro para responder).
2. Bug 2: "acesse o perfil de alice almeida em meus alunos" (scroll progressivo em contêiner rolável + clique seguro).
3. Teste de regressão nos fluxos de nível único ("abra início", "abra frequência", "abra notas") em 1 único passo.
4. Teste de novo padrão hierárquico inédito ("em notas abra avaliações" / "no diário abra médias").
"""

import json
import sys
from pathlib import Path
import pytest
from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sidecar.navigation_state_machine import (
    decompose_hierarchical_command,
    HierarchicalNavigationModel,
    HierarchicalNavNode,
    NavNodeType,
)
from sidecar.iterative_dom_explorer import (
    IterativeDomExplorer,
    LiveSessionDomMap,
    ExplorationResult,
)
from sidecar.graph_validator import assert_graph_safe

PORTAL_MOCK_PATH = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"


@pytest.fixture(scope="module")
def portal_mock_uri():
    assert PORTAL_MOCK_PATH.exists(), f"portal_mock.html não encontrado: {PORTAL_MOCK_PATH}"
    return PORTAL_MOCK_PATH.as_uri()


@pytest.mark.asyncio
async def test_cenario_1_recados_e_recados_recebidos_sem_sequestro(portal_mock_uri):
    """
    Cenário 1 (Bug 1): 'abra recados e abra recados recebidos'
    - Deve decompor em 2 nós: Recados (nivel_1) e Recados recebidos (sub_nivel).
    - Deve acionar a aba 'Recados' e em seguida a sub-aba 'Recados recebidos'.
    - NUNCA deve clicar em 'Responder à mãe do aluno' ou abrir o formulário de resposta.
    - Deve compilar um SkillGraph de 2 passos com is_submit_action=False.
    """
    command = "abra recados e abra recados recebidos"
    nodes = decompose_hierarchical_command(command)

    assert len(nodes) == 2, f"Esperado 2 nós, obtido: {[n.label for n in nodes]}"
    assert nodes[0].node_type == NavNodeType.NIVEL_1
    assert "recados" in nodes[0].node_id
    assert nodes[1].node_type == NavNodeType.SUB_NIVEL
    assert "recebidos" in nodes[1].node_id or "recados_recebidos" in nodes[1].node_id

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(portal_mock_uri)
        await page.wait_for_load_state("domcontentloaded")

        # Estado inicial: Diário visível, Recados oculto
        assert await page.locator("#pane-diario").is_visible() is True
        assert await page.locator("#pane-recados").is_visible() is False

        explorer = IterativeDomExplorer()
        res: ExplorationResult = await explorer.explore_and_navigate_sequence(page, nodes, task_id="recados_recebidos")

        print(f"\n[Cenario 1 Trace]: {json.dumps(res.trace, ensure_ascii=True)}")

        # Asserções do Motor
        assert res.sucesso is True, f"Falha na exploração: {res.error_message}"
        assert res.status == "success"
        assert len(res.sequence_resolved) == 2
        assert res.sequence_resolved[0].label == "Recados"
        assert res.sequence_resolved[1].label == "Recados recebidos"

        # Asserções no DOM
        pane_recados = page.locator("#pane-recados")
        assert await pane_recados.is_visible() is True, "Painel de recados deveria estar visível"

        subtab_recebidos = page.locator("#subtab-recados-recebidos")
        subtab_classes = await subtab_recebidos.get_attribute("class")
        assert "active" in (subtab_classes or ""), "Sub-aba Recados recebidos deveria estar com classe 'active'"

        # Verificação mandatória anti-sequestro: formulário de resposta NÃO foi aberto
        form_resposta = page.locator("#form-resposta-hugo")
        assert await form_resposta.is_visible() is False, "Formulário de resposta foi indevidamente aberto!"

        # Verificação do SkillGraph gerado (Camada C)
        assert res.skill_graph is not None
        assert_graph_safe(res.skill_graph)
        for node in res.skill_graph.nodes.values():
            assert node.params.is_submit_action is False, "Nó de navegação não pode ter is_submit_action=True"

        await browser.close()


@pytest.mark.asyncio
async def test_cenario_2_perfil_alice_almeida_com_scroll_progressivo(portal_mock_uri):
    """
    Cenário 2 (Bug 2): 'acesse o perfil de alice almeida em meus alunos'
    - Deve decompor em 2 nós: Meus Alunos (nivel_1) e Alice Almeida (item_lista).
    - Alice Almeida está no final do contêiner rolável #grid-meus-alunos (fora do viewport inicial).
    - O motor DEVE usar scroll progressivo (Passo 2) para localizá-la.
    - DEVE clicar no botão 'Ver perfil' de Alice Almeida, abrindo o modal do perfil.
    - NUNCA deve clicar no perfil de outros alunos (ex: Ana, Bernardo, Carlos).
    """
    command = "acesse o perfil de alice almeida em meus alunos"
    nodes = decompose_hierarchical_command(command)

    assert len(nodes) == 2, f"Esperado 2 nós, obtido: {[n.label for n in nodes]}"
    assert nodes[0].node_type == NavNodeType.NIVEL_1
    assert nodes[1].node_type == NavNodeType.ITEM_LISTA
    assert "alice" in nodes[1].label.lower()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(portal_mock_uri)
        await page.wait_for_load_state("domcontentloaded")

        explorer = IterativeDomExplorer(max_scroll_iterations=6)
        res: ExplorationResult = await explorer.explore_and_navigate_sequence(page, nodes, task_id="perfil_alice")

        print(f"\n[Cenario 2 Trace]: {json.dumps(res.trace, ensure_ascii=True)}")

        assert res.sucesso is True, f"Falha na exploração: {res.error_message}"
        assert res.status == "success"
        assert len(res.sequence_resolved) == 2

        # Verifica que houve scroll progressivo para encontrar Alice Almeida
        scroll_steps = [t for t in res.trace if "scroll_iteration" in t.get("strategy", "")]
        assert len(scroll_steps) > 0, "Alice Almeida deveria ter exigido scroll_iteration no container rolável!"

        # Asserções no DOM: Modal do perfil de Alice Almeida aberto
        modal_perfil = page.locator("#modal-perfil-aluno")
        assert await modal_perfil.is_visible() is True, "Modal do perfil do aluno não foi aberto!"

        nome_perfil = page.locator("#nome-aluno-perfil")
        texto_nome = await nome_perfil.inner_text()
        assert "Alice Almeida" in texto_nome, f"Esperado 'Alice Almeida', obtido: '{texto_nome}'"

        # Verificação do SkillGraph gerado
        assert res.skill_graph is not None
        assert_graph_safe(res.skill_graph)

        await browser.close()


@pytest.mark.asyncio
async def test_cenario_3_regressao_fluxos_nivel_unico_instantaneos(portal_mock_uri):
    """
    Cenário 3 (Regressão): 'abra início', 'abra frequência', 'abra notas'
    - Devem decompor em exatamente 1 nó (nivel_1).
    - Execução DEVE ser direta em 1 único passo instantâneo.
    - NUNCA deve acionar loops de scroll ou expansão de colapsáveis desnecessários.
    """
    single_commands = [
        ("abra início", "Início", "#tab-inicio"),
        ("abra frequência", "Frequência", "#tab-chamada"),
        ("abra notas", "Notas", "#tab-notas"),
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        for cmd, expected_label, expected_selector in single_commands:
            await page.goto(portal_mock_uri)
            await page.wait_for_load_state("domcontentloaded")

            nodes = decompose_hierarchical_command(cmd)
            assert len(nodes) == 1, f"Comando '{cmd}' deveria ter 1 nó, obtido: {len(nodes)}"
            assert nodes[0].node_type == NavNodeType.NIVEL_1

            explorer = IterativeDomExplorer()
            res = await explorer.explore_and_navigate_sequence(page, nodes, task_id=f"single_{nodes[0].node_id}")

            print(f"\n[Cenario 3 Trace - {cmd}]: {json.dumps(res.trace, ensure_ascii=True)}")

            assert res.sucesso is True, f"Falha para '{cmd}': {res.error_message}"
            assert len(res.sequence_resolved) == 1
            assert res.sequence_resolved[0].node_type == NavNodeType.NIVEL_1

            # Garante que foi resolvido via exact_match e sem scroll
            assert any(t.get("strategy") == "exact_match" for t in res.trace), "Deveria ter encontrado via exact_match"
            assert not any("scroll" in t.get("strategy", "") for t in res.trace), f"Não deveria haver scroll para '{cmd}'"

            # Aba clicada deve estar ativa
            tab_el = page.locator(expected_selector)
            tab_classes = await tab_el.get_attribute("class")
            assert "active" in (tab_classes or ""), f"Aba '{expected_selector}' deveria estar com classe 'active'"

        await browser.close()


@pytest.mark.asyncio
async def test_cenario_4_novo_padrao_hierarquico_inedito_sem_codigo_especifico(portal_mock_uri):
    """
    Cenário 4: Generalização de novos padrões hierárquicos arbitrários
    - 'em notas abra avaliações' -> decompõe em [Notas (nivel_1), Avaliações (sub_nivel)]
    - 'no diário abra médias'   -> decompõe em [Diário de Classe (nivel_1), Médias (sub_nivel)]
    - O motor deve resolver a transição hierárquica autonomamente.
    """
    test_cases = [
        ("em notas abra avaliações", "#tab-notas", "#subtab-diario-avaliacoes", "#subpane-avaliacoes-msg"),
        ("no diário abra médias", "#tab-diario", "#subtab-diario-medias", None),
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        for cmd, expected_tab, expected_subtab, expected_msg_selector in test_cases:
            await page.goto(portal_mock_uri)
            await page.wait_for_load_state("domcontentloaded")

            nodes = decompose_hierarchical_command(cmd)
            assert len(nodes) == 2, f"Comando '{cmd}' deveria decompor em 2 nós"
            assert nodes[0].node_type == NavNodeType.NIVEL_1
            assert nodes[1].node_type == NavNodeType.SUB_NIVEL

            explorer = IterativeDomExplorer()
            res = await explorer.explore_and_navigate_sequence(page, nodes, task_id="inedito_nav")

            print(f"\n[Cenario 4 Trace - {cmd}]: {json.dumps(res.trace, ensure_ascii=True)}")

            assert res.sucesso is True, f"Falha na navegação de '{cmd}': {res.error_message}"
            assert len(res.sequence_resolved) == 2

            # Verifica ativação da sub-aba no DOM
            subtab_classes = await page.locator(expected_subtab).get_attribute("class")
            assert "active" in (subtab_classes or ""), f"Sub-aba '{expected_subtab}' deveria estar ativa"

            if expected_msg_selector:
                msg_el = page.locator(expected_msg_selector)
                assert await msg_el.is_visible() is True, f"Mensagem '{expected_msg_selector}' deveria estar visível"

            # SkillGraph válido
            assert res.skill_graph is not None
            assert_graph_safe(res.skill_graph)

        await browser.close()


@pytest.mark.asyncio
async def test_cenario_5_empate_real_de_score_ambiguidade_honesta(portal_mock_uri):
    """
    Cenário 5 (Caso-Limite): Empate real de score entre candidatos homônimos
    1. Injeta no DOM duas alunas 'Alice' com score idêntico (100).
    2. Executa 'acesse o perfil de alice em meus alunos' (sem sobrenome).
       - Confirma que o motor NÃO clica automaticamente.
       - Confirma que retorna status 'ambiguous' com lista rica de candidatos.
    3. Executa 'acesse o perfil de alice almeida em meus alunos' (com sobrenome).
       - Confirma que o mesmo DOM resolve para exatamente 1 candidato sem ambiguidade.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(portal_mock_uri)
        await page.wait_for_load_state("domcontentloaded")

        # Injeta duas alunas 'Alice' idênticas no grid de alunos e uma 'Alice Almeida'
        await page.evaluate("""() => {
            const grid = document.getElementById('grid-meus-alunos');
            if (grid) {
                grid.innerHTML = `
                    <div class="card-aluno" id="card-aluno-alice-1">
                        <span class="aluno-nome">Alice</span>
                        <span class="badge">9º B • Matrícula 101</span>
                        <button type="button" class="btn-perfil" id="btn-perfil-alice-1" onclick="abrirPerfilAluno('Alice 1')">Ver perfil</button>
                    </div>
                    <div class="card-aluno" id="card-aluno-alice-2">
                        <span class="aluno-nome">Alice</span>
                        <span class="badge">9º B • Matrícula 102</span>
                        <button type="button" class="btn-perfil" id="btn-perfil-alice-2" onclick="abrirPerfilAluno('Alice 2')">Ver perfil</button>
                    </div>
                    <div class="card-aluno" id="card-aluno-alice-alm">
                        <span class="aluno-nome">Alice Almeida</span>
                        <span class="badge">9º B • Matrícula 103</span>
                        <button type="button" class="btn-perfil" id="btn-perfil-alice-alm" onclick="abrirPerfilAluno('Alice Almeida')">Ver perfil</button>
                    </div>
                `;
            }
        }""")

        # ── Teste 5A: Sem sobrenome ("alice") -> Ambiguidade honesta
        cmd_sem_sobrenome = "acesse o perfil de alice em meus alunos"
        nodes_sem_sobrenome = decompose_hierarchical_command(cmd_sem_sobrenome)
        assert len(nodes_sem_sobrenome) == 2
        assert nodes_sem_sobrenome[1].label == "Alice"

        explorer = IterativeDomExplorer()
        res_ambiguous = await explorer.explore_and_navigate_sequence(page, nodes_sem_sobrenome, task_id="test_ambiguous")

        print(f"\n[Cenario 5A Trace - Ambiguidade Honesta]: {json.dumps(res_ambiguous.trace, ensure_ascii=True)}")

        # Validações 5A
        assert res_ambiguous.sucesso is False, "Não deve haver sucesso automático quando há empate real de score"
        assert res_ambiguous.status == "ambiguous", f"Status esperado 'ambiguous', obtido: '{res_ambiguous.status}'"
        assert len(res_ambiguous.candidates) == 2, f"Esperado 2 candidatos empatados, obtido: {len(res_ambiguous.candidates)}"
        for cand in res_ambiguous.candidates:
            assert cand["score"] == 100
            assert cand["matchKind"] == "exact_primary"
            assert "Alice" in cand["text"]
            assert "rect" in cand
            assert "selector" in cand

        # Garante que nenhum modal de perfil foi aberto
        modal_aberto = await page.locator("#modal-perfil-aluno").is_visible()
        assert modal_aberto is False, "Nenhum perfil deveria ter sido aberto no caso ambíguo!"

        # ── Teste 5B: Com sobrenome ("alice almeida") -> Desempate limpo, zero fricção
        await page.evaluate("() => switchTab('diario')")

        cmd_com_sobrenome = "acesse o perfil de alice almeida em meus alunos"
        nodes_com_sobrenome = decompose_hierarchical_command(cmd_com_sobrenome)
        assert len(nodes_com_sobrenome) == 2
        assert nodes_com_sobrenome[1].label == "Alice Almeida"

        res_resolved = await explorer.explore_and_navigate_sequence(page, nodes_com_sobrenome, task_id="test_desempate")

        print(f"\n[Cenario 5B Trace - Desempate Limpo]: {json.dumps(res_resolved.trace, ensure_ascii=True)}")

        assert res_resolved.sucesso is True, f"Deveria resolver com sucesso quando há sobrenome: {res_resolved.error_message}"
        assert res_resolved.status == "success"
        assert len(res_resolved.sequence_resolved) == 2

        # Modal de Alice Almeida deve ter sido aberto
        modal_aberto = await page.locator("#modal-perfil-aluno").is_visible()
        assert modal_aberto is True, "Modal do perfil deveria estar visível após desempate!"
        nome_perfil = await page.locator("#nome-aluno-perfil").inner_text()
        assert "Alice Almeida" in nome_perfil

        await browser.close()


@pytest.mark.asyncio
async def test_cenario_6_trava_anti_destrutiva_com_veto_e_fallback(portal_mock_uri):
    """
    Cenário 6 (Caso-Limite): Trava anti-destrutiva vetando elemento perigoso
    6A. Dois candidatos: um destrutivo ('Excluir Recado Selecionado') com match forte e
        um seguro ('Visualizar Recado').
        -> Confirma que o motor VETA o destrutivo (destructive_vetoed) e clica no seguro!
    6B. Único candidato é destrutivo ('Excluir Diário e Apagar Notas').
        -> Confirma que o motor RECUSA a ação e retorna status 'blocked_destructive'.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(portal_mock_uri)
        await page.wait_for_load_state("domcontentloaded")

        # ── 6A: Destrutivo vetado em favor de alternativa segura
        await page.evaluate("""() => {
            switchTab('recados');
            const lista = document.getElementById('lista-recados');
            if (lista) {
                lista.innerHTML = `
                    <div id="container-recado-teste" style="padding: 10px;">
                        <button type="button" id="btn-excluir-recado" style="background: red; color: white;" onclick="window.__destrutivo_clicado = true;">
                            Excluir Recado Selecionado
                        </button>
                        <button type="button" id="btn-visualizar-recado" style="background: blue; color: white;" onclick="window.__seguro_clicado = true;">
                            Visualizar Recado
                        </button>
                    </div>
                `;
            }
            window.__destrutivo_clicado = false;
            window.__seguro_clicado = false;
        }""")

        # Nó buscando "Excluir Recado Selecionado" com alternativa segura "Visualizar Recado"
        node_recados = HierarchicalNavNode("recados", "Recados", NavNodeType.NIVEL_1)
        node_alvo_recado = HierarchicalNavNode("recado_acao", "Excluir Recado Selecionado", NavNodeType.SUB_NIVEL, synonyms=["Visualizar Recado"], parent_id="recados")

        explorer = IterativeDomExplorer()
        res_6a = await explorer.explore_and_navigate_sequence(page, [node_recados, node_alvo_recado], task_id="test_destructive_fallback")

        print(f"\n[Cenario 6A Trace - Veto com Alternativa Segura]: {json.dumps(res_6a.trace, ensure_ascii=True)}")

        # Validações 6A
        assert res_6a.sucesso is True, "Deveria ter avançado para a alternativa segura"
        # Verifica que o trace registrou o veto
        assert any(t.get("status") == "destructive_vetoed" for t in res_6a.trace), "O elemento destrutivo deveria ter sido vetado no trace!"
        veto_entry = next(t for t in res_6a.trace if t.get("status") == "destructive_vetoed")
        assert any("excluir" in str(el).lower() for el in veto_entry.get("vetoed_elements", []))

        # Confirma que o destrutivo NUNCA foi clicado e o seguro FOI clicado
        destrutivo_clicado = await page.evaluate("() => window.__destrutivo_clicado")
        seguro_clicado = await page.evaluate("() => window.__seguro_clicado")
        assert destrutivo_clicado is False, "Elemento destrutivo NUNCA pode ser clicado!"
        assert seguro_clicado is True, "Elemento seguro deveria ter sido acionado!"

        # ── 6B: Único candidato é destrutivo -> Bloqueio explícito (blocked_destructive)
        await page.evaluate("""() => {
            const lista = document.getElementById('lista-recados');
            if (lista) {
                lista.innerHTML = `
                    <div id="container-apenas-destrutivo">
                        <button type="button" id="btn-apagar-tudo" onclick="window.__apagou_tudo = true;">
                            Excluir Diário e Apagar Notas
                        </button>
                    </div>
                `;
            }
            window.__apagou_tudo = false;
        }""")

        node_apagar = HierarchicalNavNode("apagar_notas", "Excluir Diário e Apagar Notas", NavNodeType.SUB_NIVEL, parent_id="recados")
        res_6b = await explorer.explore_and_navigate_sequence(page, [node_apagar], task_id="test_blocked_destructive")

        print(f"\n[Cenario 6B Trace - Bloqueio Explicito]: {json.dumps(res_6b.trace, ensure_ascii=True)}")

        # Validações 6B
        assert res_6b.sucesso is False, "Ação destrutiva sem alternativa segura não pode ter sucesso!"
        assert res_6b.status == "blocked_destructive", f"Esperado status 'blocked_destructive', obtido: '{res_6b.status}'"
        assert "segurança" in res_6b.error_message.lower() or "destrutivo" in res_6b.error_message.lower()
        
        # Garante que o botão destrutivo não foi acionado
        apagou = await page.evaluate("() => window.__apagou_tudo")
        assert apagou is False, "Ação destrutiva não pode ter sido executada!"

        await browser.close()


@pytest.mark.asyncio
async def test_cenario_7_reuso_real_de_skillgraph_e_recuperacao_drift(portal_mock_uri, tmp_path):
    """
    Cenário 7 (Caso-Limite): Reuso real do SkillGraph salvo e recuperação de drift
    7A. 1ª Execução: Explora o DOM a partir do zero via loop de 8 passos e grava a skill v1.
    7B. 2ª Execução: Mesmo comando exato reutiliza a skill salva (Fast-Path), sendo mensuravelmente mais rápida.
    7C. 3ª Execução: Seletor salvo é invalidado no DOM (drift). O motor detecta a falha,
        faz fallback elegante para o loop de exploração, localiza o novo seletor e compila v2.
    """
    command = "abra recados e abra recados recebidos"
    nodes = decompose_hierarchical_command(command)
    task_id = "test_replay_recados"

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(portal_mock_uri)
        await page.wait_for_load_state("domcontentloaded")

        # ── 7A: 1ª Execução (Exploração inicial e gravação de v1)
        explorer_1 = IterativeDomExplorer(skills_dir=tmp_path, use_cached_skills=True)
        res_1 = await explorer_1.explore_and_navigate_sequence(page, nodes, task_id=task_id)

        print(f"\n[Cenario 7A Trace - Gravacao Inicial]: {json.dumps(res_1.trace, ensure_ascii=True)}")
        print(f"[Cenario 7A Tempo]: {res_1.execution_time_ms:.1f}ms")

        assert res_1.sucesso is True
        assert res_1.skill_graph is not None
        assert res_1.skill_graph.version == 1
        assert any(t.get("strategy") == "exact_match" for t in res_1.trace)
        tempo_1 = res_1.execution_time_ms

        # ── 7B: 2ª Execução (Reuso Fast-Path)
        # Reseta estado visual para Diário
        await page.evaluate("() => switchTab('diario')")
        assert await page.locator("#pane-recados").is_visible() is False

        explorer_2 = IterativeDomExplorer(skills_dir=tmp_path, use_cached_skills=True)
        res_2 = await explorer_2.explore_and_navigate_sequence(page, nodes, task_id=task_id)

        print(f"\n[Cenario 7B Trace - Reuso Rapido]: {json.dumps(res_2.trace, ensure_ascii=True)}")
        print(f"[Cenario 7B Tempo]: {res_2.execution_time_ms:.1f}ms (vs {tempo_1:.1f}ms na 1ª execução)")

        assert res_2.sucesso is True
        # Verifica que usou o fast-path do SkillGraph
        assert all(t.get("strategy") == "skill_graph_replay" for t in res_2.trace), "Deveria ter usado skill_graph_replay!"
        # Verifica no DOM
        assert await page.locator("#pane-recados").is_visible() is True
        assert "active" in (await page.locator("#subtab-recados-recebidos").get_attribute("class") or "")
        # Verifica que é mensuravelmente mais rápido
        tempo_2 = res_2.execution_time_ms
        assert tempo_2 < tempo_1, f"Reuso ({tempo_2:.1f}ms) deveria ser mais rápido que exploração do zero ({tempo_1:.1f}ms)"

        # ── 7C: 3ª Execução (Drift do Seletor e Fallback com Recuperação)
        # Reseta aba para Diário
        await page.evaluate("() => switchTab('diario')")
        assert await page.locator("#pane-recados").is_visible() is False

        # Altera o ID do botão no DOM para simular drift no portal (id muda para #subtab-recados-recebidos-novo-id)
        await page.evaluate("""() => {
            const btn = document.getElementById('subtab-recados-recebidos');
            if (btn) {
                btn.id = 'subtab-recados-recebidos-novo-id';
                btn.className = 'subtab-btn';
                btn.addEventListener('click', () => {
                    btn.classList.add('active');
                });
            }
        }""")

        explorer_3 = IterativeDomExplorer(skills_dir=tmp_path, use_cached_skills=True)
        res_3 = await explorer_3.explore_and_navigate_sequence(page, nodes, task_id=task_id)

        print(f"\n[Cenario 7C Trace - Drift e Recuperacao]: {json.dumps(res_3.trace, ensure_ascii=True)}")
        print(f"[Cenario 7C Tempo]: {res_3.execution_time_ms:.1f}ms")

        assert res_3.sucesso is True, f"Recuperação após drift falhou: {res_3.error_message}"
        # Verifica que o trace registrou o drift do skill salvo
        assert any(t.get("strategy") == "skill_graph_drift_detected" for t in res_3.trace), "Deveria ter detectado drift no SkillGraph!"
        # Verifica que o fallback para exploração foi acionado e encontrou o elemento
        assert any(t.get("selector") == "#subtab-recados-recebidos-novo-id" for t in res_3.trace), "Deveria ter localizado o elemento com novo ID!"
        # Verifica que a nova versão v2 da skill foi compilada
        assert res_3.skill_graph is not None
        assert res_3.skill_graph.version >= 2, f"SkillGraph deveria ter versão incrementada, obtido: v{res_3.skill_graph.version}"

        # Verifica no DOM que o novo botão está ativo
        classes_novo_btn = await page.locator("#subtab-recados-recebidos-novo-id").get_attribute("class")
        assert "active" in (classes_novo_btn or "")

        await browser.close()

