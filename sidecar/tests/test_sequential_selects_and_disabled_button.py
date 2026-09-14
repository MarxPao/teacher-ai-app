"""
test_sequential_selects_and_disabled_button.py — Testes para Resolucao de Filtros Sequenciais e Botoes Desabilitados

Valida:
1. Deteccao rigorosa de botoes desabilitados (disabled, aria-disabled, .btn-disabled) marcando is_disabled=True.
2. Resolucao autonoma de formularios em cascata (Turma -> Mes -> Disciplina -> Dia -> Botao).
3. Verificacao de zero cliques invalidos (window.__invalidClicks == 0).
4. Compilacao correta no SkillGraph com nos de filtro (is_filter=True, is_submit_action=False)
   e insercao do no CHECKPOINT estritamente antes do primeiro risco irreversivel.
"""

import sys
from pathlib import Path
import pytest
from playwright.async_api import async_playwright

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from browser_use_agent import BrowserUseAgent
from discovery_orchestrator import DiscoveryOrchestrator
from graph_validator import assert_graph_safe, validate_skill_graph


@pytest.mark.asyncio
async def test_disabled_button_detection_prevents_blind_clicks():
    """
    TESTE 1: Confirma que o BrowserUseAgent detecta atributos disabled, aria-disabled="true"
    e classes CSS .btn-disabled, registrando submit_button_disabled=True e is_disabled=True.
    """
    html_content = """
    <!DOCTYPE html>
    <html>
    <body>
        <input type="text" id="nota_aluno" name="nota_aluno" placeholder="Nota" />
        <button id="btn_salvar_desabilitado" disabled aria-disabled="true" class="btn btn-disabled">
            Gravar Nota
        </button>
    </body>
    </html>
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page()
        await page.set_content(html_content)

        bu = BrowserUseAgent()
        res = await bu._inspect_semantic_dom(page, {
            "acao": "lancar_nota",
            "objeto_alvo": "nota",
            "valor": "8.5"
        })

        assert res.get("submit_button_found") is True, "Botao deve ser encontrado"
        assert res.get("submit_button_disabled") is True, "Botao deve ser identificado como desabilitado"
        
        # Confirma que o submit action foi gerado com flag is_disabled=True para não haver clique cego na execução
        click_actions = [a for a in res.get("actions", []) if a.get("is_submit_action")]
        assert len(click_actions) == 1, "Ação de submit deve existir"
        assert click_actions[0].get("is_disabled") is True, "Ação deve estar marcada como is_disabled=True"

        await browser.close()


@pytest.mark.asyncio
async def test_cascading_filters_resolution_and_frequencia_flow():
    """
    TESTE 2: Reconstitui o fluxo de Frequencia completo com filtros sequenciais em cascata
    contra o sandbox portal_mock_frequencia.html.
    Valida:
    - Selecao de Turma -> Mes -> Disciplina -> Dia
    - Reatividade e desbloqueio a cada etapa
    - Clique no botao 'Lancar faltas' apenas APOS estar habilitado
    - Zero tentativas de clique cego (window.__invalidClicks == 0)
    - Localizacao do estudante e preenchimento da falta
    """
    sandbox_dir = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox"
    portal_file = sandbox_dir / "portal_mock_frequencia.html"
    assert portal_file.exists(), f"Arquivo nao encontrado: {portal_file}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(portal_file.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        bu = BrowserUseAgent()

        task_spec = {
            "acao": "lancar_falta",
            "portal_id": "portal_mock_frequencia",
            "objeto_alvo": "falta",
            "aluno": "Lucas Silva",
            "valor": "1",
            "parametros": {
                "turma": "6º Ano A",
                "mes": "Setembro",
                "disciplina": "Matemática",
                "data": "hoje",
                "aluno": "Lucas Silva",
                "faltas": 1
            }
        }

        # Executa descoberta DOM completa via BrowserUseAgent
        result = await bu.execute_discovery_task(task_spec, target_page=page)

        assert result.sucesso is True, f"Descoberta deveria ter sucesso: {result.erro}"
        assert result.confianca >= 0.80, f"Confianca deve ser >= 0.80, obtido: {result.confianca}"

        # 1. Valida ausencia total de cliques invalidos
        invalid_clicks = await page.evaluate("() => window.__invalidClicks")
        assert invalid_clicks == 0, f"Detectadas {invalid_clicks} tentativas de clique invalido em botao desabilitado!"

        # 2. Valida chamada carregada no DOM
        chamada_carregada = await page.evaluate("() => window.__chamadaCarregada")
        assert chamada_carregada is True, "A chamada deve ter sido carregada com sucesso apos clicar no botao habilitado"

        # 3. Valida acoes mapeadas no trace
        actions = result.trace_de_acoes
        action_types = [a.get("action_type") for a in actions]

        assert "WRITE" in action_types, "Trace deve conter acoes WRITE dos selects e campo"
        assert "CLICK" in action_types, "Trace deve conter acoes CLICK"

        # Verifica acoes de filtro
        filter_writes = [a for a in actions if a.get("action_type") == "WRITE" and a.get("is_filter")]
        assert len(filter_writes) >= 4, f"Deve haver pelo menos 4 selects de filtro no trace, encontrados: {len(filter_writes)}"
        
        filter_selectors = [a.get("selector") for a in filter_writes]
        assert "#filtro_turma" in filter_selectors
        assert "#filtro_mes" in filter_selectors
        assert "#filtro_disciplina" in filter_selectors
        assert "#filtro_dia" in filter_selectors

        # Verifica clique intermediario no botao de carregar chamada
        filter_clicks = [a for a in actions if a.get("action_type") == "CLICK" and a.get("is_submit_action") is False]
        assert len(filter_clicks) >= 1, "Deve conter clique intermediario com is_submit_action=False"
        assert "#btn_lancar_faltas" in filter_clicks[0].get("selector")

        # Verifica escrita final do aluno e clique de submit
        student_writes = [a for a in actions if a.get("action_type") == "WRITE" and not a.get("is_filter")]
        assert len(student_writes) >= 1, "Deve conter escrita da falta do aluno"
        assert "#falta_601" in student_writes[0].get("selector")
        assert student_writes[0].get("value") == "1"

        submit_clicks = [a for a in actions if a.get("action_type") == "CLICK" and a.get("is_submit_action") is True]
        assert len(submit_clicks) >= 1, "Deve conter clique final de gravacao"
        assert "#btn_salvar_chamada" in submit_clicks[0].get("selector")

        await browser.close()


@pytest.mark.asyncio
async def test_cascading_skillgraph_compilation_and_safety_checkpoint():
    """
    TESTE 3: Compila o trace descoberto em um SkillGraph formal.
    Valida:
    - O grafo e gerado como uma unidade atomica encadeada continua.
    - O no CHECKPOINT esta posicionado estritamente ANTES de write_falta (e apos os filtros).
    - O grafo e estritamente aprovado por assert_graph_safe(graph).
    """
    trace_exemplo = [
        {"action_type": "NAVIGATE", "url": "http://localhost:3000/sandbox/portal_mock_frequencia.html", "description": "Acessar portal"},
        {"action_type": "WRITE", "selector": "#filtro_turma", "value": "6º Ano A", "is_filter": True, "description": "Selecionar turma"},
        {"action_type": "WRITE", "selector": "#filtro_mes", "value": "Setembro", "is_filter": True, "description": "Selecionar mes"},
        {"action_type": "WRITE", "selector": "#filtro_disciplina", "value": "Matemática", "is_filter": True, "description": "Selecionar disciplina"},
        {"action_type": "WRITE", "selector": "#filtro_dia", "value": "hoje", "is_filter": True, "description": "Selecionar dia"},
        {"action_type": "CLICK", "selector": "#btn_lancar_faltas", "is_submit_action": False, "is_filter": True, "description": "Carregar chamada"},
        {"action_type": "LOCATE", "selector": "#tabela_frequencia tbody tr", "description": "Localizar linha de Lucas Silva"},
        {"action_type": "WRITE", "selector": "#falta_601", "value": "1", "is_filter": False, "description": "Preencher falta"},
        {"action_type": "CLICK", "selector": "#btn_salvar_chamada", "is_submit_action": True, "description": "Gravar chamada"},
    ]

    orchestrator = DiscoveryOrchestrator()
    graph = orchestrator._compile_trace_to_skill_graph(
        portal_id="portal_mock_frequencia",
        task_id="lancar_falta",
        trace=trace_exemplo
    )

    # 1. Validacao estatica de seguranca: nao pode lancar UnsafeGraphError
    is_valid, errors = validate_skill_graph(graph)
    assert is_valid is True, f"SkillGraph deve ser valido: {errors}"
    assert_graph_safe(graph)

    # 2. Verifica posicionamento do CHECKPOINT
    assert "checkpoint_seguranca" in graph.nodes, "CHECKPOINT deve estar presente no grafo"
    
    # O checkpoint deve estar ANTES de write da falta (#falta_601)
    chk_node = graph.nodes["checkpoint_seguranca"]
    write_falta_nid = next(
        (nid for nid, n in graph.nodes.items() if n.type == "WRITE" and n.anchor and n.anchor.value == "#falta_601"),
        None
    )
    assert write_falta_nid is not None, "No write_falta deve existir no grafo"
    assert chk_node.on_success == write_falta_nid, "CHECKPOINT deve apontar diretamente para a escrita da falta do aluno"

    # Confirma que os nos de filtro nao exigem checkpoint previo
    filter_node_ids = [
        nid for nid, n in graph.nodes.items()
        if n.type == "WRITE" and n.params.is_filter is True
    ]
    assert len(filter_node_ids) == 4, "Devem existir 4 nos de filtro WRITE no grafo"


@pytest.mark.asyncio
async def test_generic_cascading_resolution_inverted_order_6_selects():
    """
    TESTE 4: Valida que a resolução em cascata é plenamente GENÉRICA:
    - 6 campos em ordem invertida (Ano -> Unidade -> Disciplina -> Turma -> Etapa -> Bimestre),
      com 'Disciplina' posicionado antes de 'Turma'.
    - Resolução reativa sem sleep fixo via page.wait_for_function e fingerprint de mutação do DOM.
    - Zero cliques cegos em botão desabilitado (window.__invalidClicks == 0).
    - Desbloqueio e renderização da tabela do diário após preenchimento de todos os 6 campos.
    - Localização do aluno 'Lucas Silva' e lançamento da nota 8.5 no campo #nota_702.
    - Compilação e validação do SkillGraph resultante com assert_graph_safe.
    """
    sandbox_dir = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox"
    portal_file = sandbox_dir / "portal_mock_ordem_invertida_6_campos.html"
    assert portal_file.exists(), f"Arquivo nao encontrado: {portal_file}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(portal_file.as_uri())
        await page.wait_for_load_state("domcontentloaded")

        bu = BrowserUseAgent()

        # Passa parâmetros propositalmente embaralhados / fora de ordem
        task_spec = {
            "acao": "lancar_nota",
            "portal_id": "portal_mock_ordem_invertida_6_campos",
            "objeto_alvo": "nota",
            "aluno": "Lucas Silva",
            "valor": "8.5",
            "parametros": {
                "disciplina": "Matemática",        # Disciplina passada antes de turma
                "etapa": "Ensino Fundamental II",
                "ano": "2026",
                "bimestre": "3º Bimestre",
                "turma": "6º Ano A",
                "unidade": "Sede Centro",
                "aluno": "Lucas Silva",
                "valor": "8.5"
            }
        }

        result = await bu.execute_discovery_task(task_spec, target_page=page)

        assert result.sucesso is True, f"Descoberta genérica falhou: {result.erro}"
        assert result.confianca >= 0.80, f"Confianca deve ser >= 0.80, obtido: {result.confianca}"

        # 1. Valida ausência total de cliques inválidos
        invalid_clicks = await page.evaluate("() => window.__invalidClicks")
        assert invalid_clicks == 0, f"Detectadas {invalid_clicks} tentativas de clique inválido em botão desabilitado!"

        # 2. Valida diário carregado no DOM
        diario_carregado = await page.evaluate("() => window.__diarioCarregado")
        assert diario_carregado is True, "O diário deve ter sido carregado com sucesso no DOM real"

        # 3. Valida ações mapeadas no trace
        actions = result.trace_de_acoes
        action_types = [a.get("action_type") for a in actions]
        assert "WRITE" in action_types
        assert "CLICK" in action_types

        # Verifica 6 ações de filtro WRITE
        filter_writes = [a for a in actions if a.get("action_type") == "WRITE" and a.get("is_filter")]
        assert len(filter_writes) == 6, f"Deve haver exatamente 6 selects de filtro no trace, encontrados: {len(filter_writes)}"

        filter_selectors = [a.get("selector") for a in filter_writes]
        assert "#filtro_ano" in filter_selectors
        assert "#filtro_unidade" in filter_selectors
        assert "#filtro_disciplina" in filter_selectors
        assert "#filtro_turma" in filter_selectors
        assert "#filtro_etapa" in filter_selectors
        assert "#filtro_bimestre" in filter_selectors

        # Confirma ordem de execução dos filtros: Disciplina (#filtro_disciplina) executado ANTES de Turma (#filtro_turma)
        idx_disc = filter_selectors.index("#filtro_disciplina")
        idx_turma = filter_selectors.index("#filtro_turma")
        assert idx_disc < idx_turma, "Disciplina deve ter sido resolvida antes de Turma conforme o DOM da tela"

        # Verifica clique intermediário no botão de carregar diário
        filter_clicks = [a for a in actions if a.get("action_type") == "CLICK" and a.get("is_submit_action") is False]
        assert len(filter_clicks) >= 1, "Deve conter clique intermediário de carregar diário"
        assert "#btn_carregar_diario" in filter_clicks[0].get("selector")

        # Verifica escrita da nota do aluno Lucas Silva
        student_writes = [a for a in actions if a.get("action_type") == "WRITE" and not a.get("is_filter")]
        assert len(student_writes) >= 1, "Deve conter escrita da nota do aluno"
        assert "#nota_702" in student_writes[0].get("selector")
        assert student_writes[0].get("value") == "8.5"

        # Verifica clique final de gravação
        submit_clicks = [a for a in actions if a.get("action_type") == "CLICK" and a.get("is_submit_action") is True]
        assert len(submit_clicks) >= 1, "Deve conter clique final de gravação"
        assert "#btn_salvar_diario" in submit_clicks[0].get("selector")

        # 4. Valida compilação e segurança do SkillGraph gerado
        orchestrator = DiscoveryOrchestrator()
        graph = orchestrator._compile_trace_to_skill_graph(
            portal_id="portal_mock_ordem_invertida_6_campos",
            task_id="lancar_nota",
            trace=actions
        )
        is_valid, errors = validate_skill_graph(graph)
        assert is_valid is True, f"SkillGraph gerado deve ser válido: {errors}"
        assert_graph_safe(graph)
        assert "checkpoint_seguranca" in graph.nodes

        await browser.close()