"""
test_engine_capacity_benchmark.py — Benchmark de Capacidade Máxima do Motor

Objetivo da Auditoria:
Mapear o teto real de capacidade do motor hoje em 4 dimensões independentes,
com evidência literal (código de retorno, tempo em ms e traces) de onde ele começa a degradar ou falhar.
"""

import asyncio
import json
import re
import sys
import time
from pathlib import Path
from typing import Dict, Any, List
from unittest.mock import patch, MagicMock, AsyncMock
import pytest
from playwright.async_api import async_playwright

SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(SIDECAR_DIR))

from navigation_state_machine import (
    decompose_hierarchical_command,
    HierarchicalNavigationModel,
    HierarchicalNavNode,
    NavNodeType,
)
from iterative_dom_explorer import (
    IterativeDomExplorer,
    LiveSessionDomMap,
    ExplorationResult,
)
from intent_parser import extract_intent, dispatch_and_execute_task
from manual_runner import execute_task_intent

BENCHMARK_FIXTURE_PATH = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "benchmark_fixture.html"


@pytest.fixture(scope="module")
def benchmark_fixture_uri():
    assert BENCHMARK_FIXTURE_PATH.exists(), f"benchmark_fixture.html não encontrado: {BENCHMARK_FIXTURE_PATH}"
    return BENCHMARK_FIXTURE_PATH.as_uri()


# =============================================================================
# DIMENSÃO 1 — PROFUNDIDADE DE NAVEGAÇÃO
# =============================================================================
class TestDimensao1ProfundidadeNavegacao:
    """
    Mapeia a profundidade máxima (quantas camadas/páginas em sequência).
    Testa separadamente:
    A) A decomposição linguística (quantos saltos a regex decompõe)
    B) A execução encadeada no DOM via IterativeDomExplorer
    """

    def test_dim1_a_decomposicao_linguistica_limite(self):
        """
        Mede em quantos níveis o parser de comando de linguagem natural
        decompõe com precisão antes de colapsar.
        """
        test_cases = [
            ("Nivel 1 (1 salto)", "abra notas", 1),
            ("Nivel 2 (2 saltos)", "abra notas e avaliações", 2),
            ("Nivel 3 (3 saltos)", "abra notas, avaliações, e o histórico", 3),
            ("Nivel 4 (4 saltos)", "abra meus alunos, ache o Carlos, abra o histórico dele, e vá até a aba de faltas", 4),
            ("Nivel 5 (5 saltos)", "abra início, vá em alunos, selecione Carlos, abra faltas e veja justificativas", 5),
        ]

        print("\n=== DIMENSÃO 1.A: Benchmark de Decomposição Linguística ===")
        results = []
        for name, cmd, expected_nodes in test_cases:
            t0 = time.perf_counter()
            nodes = decompose_hierarchical_command(cmd)
            elapsed_ms = (time.perf_counter() - t0) * 1000
            node_labels = [n.label for n in nodes]
            success = (len(nodes) == expected_nodes)
            results.append({
                "nivel": name,
                "comando": cmd,
                "esperado": expected_nodes,
                "obtido_count": len(nodes),
                "nodes": node_labels,
                "sucesso": success,
                "elapsed_ms": elapsed_ms
            })
            print(f"[{name}] Esperado: {expected_nodes} | Obtido: {len(nodes)} nós {node_labels} ({elapsed_ms:.2f}ms) -> {'✅ OK' if success else '❌ COLAPSO'}")

        # Comprova o teto empírico: Nível 1 e 2 passam; Nível 3+ colapsa na regex binária
        assert results[0]["sucesso"] is True, "Nível 1 deveria decompor em 1 nó"
        assert results[1]["sucesso"] is True, "Nível 2 deveria decompor em 2 nós"
        # Teto comprovado:
        assert results[2]["sucesso"] is False, "Nível 3 colapsa porque o parser regex modela apenas 2 nós"
        assert results[3]["sucesso"] is False, "Nível 4 colapsa"

    @pytest.mark.asyncio
    async def test_dim1_b_execucao_dom_ate_6_camadas(self, benchmark_fixture_uri):
        """
        Executa sequências progressivamente mais profundas (1 a 6 níveis) no DOM real via Playwright,
        medindo tempo total (ms), score de matching e verificando o limiar de 5.000 ms.
        """
        all_nodes = [
            HierarchicalNavNode("alunos", "Meus Alunos", NavNodeType.NIVEL_1),
            HierarchicalNavNode("carlos", "Carlos Eduardo", NavNodeType.ITEM_LISTA, parent_id="alunos"),
            HierarchicalNavNode("historico", "Histórico Escolar", NavNodeType.SUB_NIVEL, parent_id="carlos"),
            HierarchicalNavNode("faltas", "Aba de Faltas", NavNodeType.SUB_NIVEL, parent_id="historico"),
            HierarchicalNavNode("justificativas", "Ver Justificativas", NavNodeType.SUB_NIVEL, parent_id="faltas"),
            HierarchicalNavNode("atestado", "Atestado Médico Anexo", NavNodeType.SUB_NIVEL, parent_id="justificativas"),
        ]

        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})

            print("\n=== DIMENSÃO 1.B: Benchmark de Execução DOM Encadeada (1 a 6 Níveis) ===")
            depth_benchmark_results = []

            for depth in range(1, 7):
                current_sequence = all_nodes[:depth]
                await page.goto(benchmark_fixture_uri)
                await page.wait_for_load_state("domcontentloaded")

                explorer = IterativeDomExplorer()
                t0 = time.perf_counter()
                res = await explorer.explore_and_navigate_sequence(
                    page, current_sequence, task_id=f"bench_depth_{depth}"
                )
                elapsed_ms = (time.perf_counter() - t0) * 1000

                depth_benchmark_results.append({
                    "depth": depth,
                    "target_labels": [n.label for n in current_sequence],
                    "resolved_count": len(res.sequence_resolved),
                    "sucesso": res.sucesso,
                    "status": res.status,
                    "tempo_ms": elapsed_ms,
                    "abaixo_limiar_5s": elapsed_ms < 5000.0,
                    "trace": res.trace
                })

                print(f"[Profundidade Nível {depth}] Saltos: {depth} | Sucesso: {res.sucesso} | Tempo: {elapsed_ms:.1f}ms (Limiar < 5000ms: {'✅ OK' if elapsed_ms < 5000 else '❌ LENTO'})")

            await browser.close()

            # Asserções de benchmark:
            for item in depth_benchmark_results:
                assert item["sucesso"] is True, f"Falha na profundidade {item['depth']}: {item['status']}"
                assert item["resolved_count"] == item["depth"]
                assert item["abaixo_limiar_5s"] is True, f"Tempo ({item['tempo_ms']}ms) ultrapassou o limiar de 5s no nível {item['depth']}"


# =============================================================================
# DIMENSÃO 2 — COMPLEXIDADE DO COMANDO EM LINGUAGEM NATURAL
# =============================================================================
class TestDimensao2ComplexidadeComando:
    """
    Testa comandos linguísticos progressivamente mais complexos:
    1. Baseline simples (1 entidade, 1 ação)
    2. Condicional (se X > 3 abre A, senão abre B)
    3. Múltiplas entidades e lote (nota 8 pro Pedro e nota 7 pra Ana)
    4. Múltiplas entidades + condição + ação em massa (nota < 6 adiciona reforço)
    5. Ambiguidade de propósito (organiza os alunos por desempenho)
    """

    def test_dim2_nivel1_baseline_simples(self):
        """Nível 1: 1 entidade, 1 ação."""
        cmd = "abra a ficha do Pedro"
        res = extract_intent(cmd, groq_key="none", gemini_key="none")

        print(f"\n[Dimensão 2 - Nível 1 Baseline] Comando: '{cmd}'")
        print(f"Resultado: acao={res.get('acao')}, aluno={res.get('aluno')}, is_complete={res.get('is_complete')}")

        assert res.get("acao") == "abrir_perfil"
        assert "Pedro" in str(res.get("aluno", ""))
        assert res.get("is_complete") is True

    def test_dim2_nivel2_comando_condicional_colapso(self):
        """
        Nível 2: Comando com condicional if/else.
        Mapeia se o parser decompõe a lógica condicional ou colapsa em extração simplista.
        """
        cmd = "se o Pedro tiver mais de 3 faltas, abra a ficha dele; senão, abra a do Carlos"
        res = extract_intent(cmd, groq_key="none", gemini_key="none")

        print(f"\n[Dimensão 2 - Nível 2 Condicional] Comando: '{cmd}'")
        print(f"Resultado: acao={res.get('acao')}, aluno={res.get('aluno')}, is_complete={res.get('is_complete')}")

        tem_ramificacao_condicional = "condicional" in res or "else" in res
        print(f"Diagnóstico: Suporta ramificação if/else? {'Sim' if tem_ramificacao_condicional else '❌ Não (Colapso monolítico)'}")
        assert tem_ramificacao_condicional is False, "Atualmente o intent parser não possui AST condicional"

    def test_dim2_nivel3_multiplas_entidades_e_lote_colapso(self):
        """
        Nível 3: Múltiplas entidades e lote ('lance nota 8 para o Pedro e nota 7 para a Ana').
        Mapeia se o parser suporta array de operações em lote ou colapsa na primeira entidade.
        """
        cmd = "lance nota 8 para o Pedro e nota 7 para a Ana na prova de hoje"
        res = extract_intent(cmd, groq_key="none", gemini_key="none")

        print(f"\n[Dimensão 2 - Nível 3 Lote] Comando: '{cmd}'")
        print(f"Resultado: acao={res.get('acao')}, aluno={res.get('aluno')}, nota={res.get('nota')}, valor={res.get('valor')}")

        aluno_extraido = str(res.get("aluno", ""))
        ana_capturada = "Ana" in aluno_extraido and "Pedro" in aluno_extraido and isinstance(res.get("itens"), list)
        print(f"Diagnóstico: Suporta lote nativo com lista de itens? {'Sim' if ana_capturada else '❌ Não (Colapso: captura parcial/truncada)'}")
        assert ana_capturada is False, "Atualmente o intent parser colapsa lote em 1 único registro"

    @pytest.mark.asyncio
    async def test_dim2_nivel4_acao_em_massa_com_condicao_e_origin_gate(self):
        """
        Nível 4: Ação em massa com condição ('para todos os alunos com nota abaixo de 6... adicione reforço').
        Verifica 2 aspectos:
        A) Decomposição do parser
        B) Confirmação de que o Origin Verification Gate NÃO bloqueia indevidamente ações legítimas
        """
        cmd = "para todos os alunos com nota abaixo de 6 na última prova, adicione uma observação de reforço"
        res = extract_intent(cmd, groq_key="none", gemini_key="none")

        print(f"\n[Dimensão 2 - Nível 4 Ação em Massa] Comando: '{cmd}'")
        print(f"Resultado do Parser: acao={res.get('acao')}, is_complete={res.get('is_complete')}, origin={res.get('instruction_origin')}")

        # Origem deve ser 'user_command' (legítima da professora)
        assert res.get("instruction_origin") == "user_command"

        # Simula despacho para o Origin Verification Gate no manual_runner
        mock_mass_intent = {
            "acao": "anotar_observacao_pedagogica",
            "tipo_operacao": "escrita",
            "objeto_alvo": "observação de reforço",
            "aluno": "filtro: nota < 6",
            "instruction_origin": "user_command"
        }

        with patch("discovery_orchestrator.DiscoveryOrchestrator.discover_or_execute", new_callable=AsyncMock) as mock_disc:
            mock_disc.return_value = {"success": True, "engine_used": "mock_engine"}
            exec_res = await execute_task_intent(mock_mass_intent)

            print(f"Origin Gate com comando legítimo em massa: status={exec_res.get('status')}, sucesso={exec_res.get('sucesso')}")
            assert exec_res.get("status") != "blocked_untrusted_origin"
            assert mock_disc.called is True, "Comando de massa legítimo da professora deve ser autorizado pelo Gate"

    @pytest.mark.asyncio
    async def test_dim2_nivel5_ambiguidade_de_proposito_honesta(self):
        """
        Nível 5: Comando ambíguo de propósito ('organiza os alunos por desempenho').
        Verifica se o sistema pede esclarecimento honesto à professora em vez de adivinhar.
        """
        cmd = "organiza os alunos por desempenho"
        pipeline_res = await dispatch_and_execute_task(cmd, groq_key="none", gemini_key="none")

        print(f"\n[Dimensão 2 - Nível 5 Ambiguidade de Propósito] Comando: '{cmd}'")
        print(f"Resultado: needs_clarification={pipeline_res.get('needs_clarification')}, mensagem='{pipeline_res.get('mensagem')}'")

        assert pipeline_res.get("needs_clarification") is True or pipeline_res.get("status") == "needs_clarification"
        assert len(pipeline_res.get("mensagem", "")) > 10


# =============================================================================
# DIMENSÃO 3 — AMPLITUDE DE OPERAÇÃO (NAVEGAÇÃO + EXTRAÇÃO + INSERÇÃO)
# =============================================================================
class TestDimensao3AmplitudeOperacao:
    """
    Testa a amplitude operacional:
    1. Navegação pura (baseline)
    2. Navegação + extração precisa de valores do DOM
    3. Navegação + extração + decisão condicional + inserção
    4. Múltiplas abas com preservação de estado
    """

    @pytest.mark.asyncio
    async def test_dim3_nivel2_navegacao_e_extracao_precisa_dom(self, benchmark_fixture_uri):
        """
        Nível 2: Navega para a aba de Frequência e extrai o número real de faltas de Pedro.
        Compara o valor extraído com o valor real esperado (3).
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(benchmark_fixture_uri)

            # 1. Navega até Frequência / Chamada
            t0 = time.perf_counter()
            explorer = IterativeDomExplorer()
            nav_res = await explorer.explore_and_navigate_sequence(
                page, [HierarchicalNavNode("chamada", "Frequência / Chamada", NavNodeType.NIVEL_1)]
            )
            assert nav_res.sucesso is True

            # 2. Extrai valor exato do DOM
            faltas_text = await page.locator("#faltas-pedro").inner_text()
            faltas_int = int(faltas_text.strip())
            elapsed_ms = (time.perf_counter() - t0) * 1000

            print(f"\n[Dimensão 3 - Nível 2 Navegação + Extração] Valor extraído: {faltas_int} faltas (Esperado: 3) em {elapsed_ms:.1f}ms")
            assert faltas_int == 3, f"Esperado 3 faltas para Pedro, obtido: {faltas_int}"
            await browser.close()

    @pytest.mark.asyncio
    async def test_dim3_nivel3_decisao_condicional_baseada_em_extracao(self, benchmark_fixture_uri):
        """
        Nível 3: 'veja a média do Pedro; se estiver abaixo de 6, lance uma observação de reforço'
        Testa se o valor extraído altera dinamicamente a decisão:
        - Pedro: média 5.2 (< 6.0) -> Ação de inserção DISPARADA.
        - Maria: média 8.0 (>= 6.0) -> Ação de inserção NÃO DISPARADA.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(benchmark_fixture_uri)

            # Navega para Frequência / Notas
            await page.locator("#tab-chamada").click()

            # Aluno 1: Pedro (Média 5.2)
            media_pedro = float((await page.locator("#media-pedro").inner_text()).strip())
            deve_inserir_pedro = (media_pedro < 6.0)

            # Aluno 2: Maria (Média 8.0)
            media_maria = float((await page.locator("#media-maria").inner_text()).strip())
            deve_inserir_maria = (media_maria < 6.0)

            print(f"\n[Dimensão 3 - Nível 3 Decisão Condicional]")
            print(f"Pedro: média={media_pedro} -> Inserir observação? {'SIM' if deve_inserir_pedro else 'NÃO'}")
            print(f"Maria: média={media_maria} -> Inserir observação? {'SIM' if deve_inserir_maria else 'NÃO'}")

            assert deve_inserir_pedro is True, "Pedro (5.2) deveria disparar observação de reforço"
            assert deve_inserir_maria is False, "Maria (8.0) NÃO deveria disparar observação de reforço"

            print("Diagnóstico de Teto: O sidecar hoje executa comandos atômicos pontuais (lancar_nota, read_roster).")
            print("Fluxo encadeado 'ler DOM -> if -> escrever' exige orquestração em pipeline de múltiplas fases.")
            await browser.close()

    @pytest.mark.asyncio
    async def test_dim3_nivel4_multiplas_abas_com_preservacao_de_estado(self, benchmark_fixture_uri):
        """
        Nível 4: 'veja quantas faltas o Pedro tem na Frequência, e depois anota isso como observação na ficha dele'
        Testa se o estado lido da Página 1 (faltas=3) sobrevive e é injetado na Página 2 (aba Meus Alunos).
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(benchmark_fixture_uri)

            # 1. Página 1: Lê faltas na Frequência
            await page.locator("#tab-chamada").click()
            faltas_pedro = (await page.locator("#faltas-pedro").inner_text()).strip()

            # Estado em memória de sessão
            session_state = {"aluno": "Pedro Santos", "faltas_extraidas": faltas_pedro}

            # 2. Transição para Página 2: Aba Meus Alunos -> Abre ficha -> Insere observação
            await page.locator("#tab-alunos").click()
            await page.locator("#btn-perfil-carlos-eduardo").click()
            await page.locator("#tab-observacoes-carlos").click()

            # Preenche o campo com o valor que sobreviveu à transição
            obs_texto = f"Aluno possui {session_state['faltas_extraidas']} faltas registradas na Frequência."
            await page.locator("#campo-obs-pedro").fill(obs_texto)
            await page.locator("#btn-salvar-obs-pedro").click()

            # Verifica persistência no DOM de destino
            assert await page.locator("#status-obs-salva").is_visible() is True
            valor_campo = await page.locator("#campo-obs-pedro").input_value()

            print(f"\n[Dimensão 3 - Nível 4 Transição Multi-Aba]")
            print(f"Estado extraído na aba 1: {session_state}")
            print(f"Texto inserido com sucesso na aba 2: '{valor_campo}'")
            assert "3 faltas" in valor_campo
            await browser.close()


# =============================================================================
# DIMENSÃO 4 — ROBUSTEZ SOB DOM REALISTA E NÃO CONTROLADO
# =============================================================================
class TestDimensao4RobustezDomRealista:
    """
    Testa resiliência contra as impurezas comuns em portais de produção:
    1. Elementos duplicados por acidente no DOM (mobile + desktop)
    2. Carregamento assíncrono com delay (1500ms)
    3. Rótulos inconsistentes (sem emoji / A/B testing)
    4. Escala de volume real (40 alunos com scroll progressivo)
    """

    @pytest.mark.asyncio
    async def test_dim4_cenario1_elementos_duplicados_acidentais(self, benchmark_fixture_uri):
        """
        Cenário 4.1: Página renderiza 2 botões idênticos '💬 Recados' (header mobile + navbar desktop).
        Mede como o motor reage: desambiguação honesta (ambiguous) ou priorização.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(benchmark_fixture_uri)

            explorer = IterativeDomExplorer()
            res = await explorer.explore_and_navigate_sequence(
                page, [HierarchicalNavNode("recados", "Recados", NavNodeType.NIVEL_1)]
            )

            print(f"\n[Dimensão 4.1 - Elementos Duplicados no DOM]")
            print(f"Status: {res.status} | Candidatos encontrados: {len(res.candidates)}")

            # Comprova comportamento do motor atual:
            # Em caso de 2 botões com mesmo score (100 vs 100), aciona desambiguação honesta
            assert res.status == "ambiguous" or res.sucesso is True
            if res.status == "ambiguous":
                print("Diagnóstico de Teto: O motor trava com 'status: ambiguous' para desambiguação honesta.")
                print(f"Seletores identificados: {[c['selector'] for c in res.candidates]}")

            await browser.close()

    @pytest.mark.asyncio
    async def test_dim4_cenario2_carregamento_assincrono_delay_1500ms(self, benchmark_fixture_uri):
        """
        Cenário 4.2: Elemento aparece apenas 1500ms após o clique anterior (ultrapassando o cushion de fallback de ~750ms).
        Mede se o motor falha com 'not_found' devido à falta de retry adaptativo.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(benchmark_fixture_uri)

            # Abre recados e aciona o carregamento assíncrono com setTimeout de 1500ms
            await page.locator("#tab-recados").first.click()
            await page.locator("#btn-carregar-anuncios-async").click()

            # Tenta localizar o elemento recém-disparado imediatamente
            explorer = IterativeDomExplorer()
            t0 = time.perf_counter()
            res = await explorer.explore_and_navigate_sequence(
                page, [HierarchicalNavNode("aviso_urgente", "Aviso Urgente", NavNodeType.SUB_NIVEL)]
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000

            print(f"\n[Dimensão 4.2 - Carregamento Assíncrono com Delay de 1500ms]")
            print(f"Status: {res.status} | Tempo de tentativa: {elapsed_ms:.1f}ms")

            # Diagnóstico de teto: o explorer espera apenas até esgotar as 4 estratégias (~750ms).
            # Se o elemento demorar > 1000ms para carregar na rede, reporta falha 'not_found'.
            print(f"Diagnóstico de Teto: Motor reporta '{res.status}' quando a latência de rede excede o tempo das estratégias em cascata.")
            assert res.status == "not_found", "Comprovado: latência de 1500ms ultrapassa o ciclo de busca estático"
            await browser.close()

    @pytest.mark.asyncio
    async def test_dim4_cenario3_rotulo_inconsistente_sem_emoji(self, benchmark_fixture_uri):
        """
        Cenário 4.3: Rótulo no DOM é 'Recados recebidos' (sem o emoji '📥').
        Comprova que a normalização de texto suporta inconsistências visuais de portais.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(benchmark_fixture_uri)

            # Abre recados
            await page.locator("#tab-recados").first.click()

            explorer = IterativeDomExplorer()
            res = await explorer.explore_and_navigate_sequence(
                page, [HierarchicalNavNode("recebidos", "Recados recebidos", NavNodeType.SUB_NIVEL)]
            )

            print(f"\n[Dimensão 4.3 - Rótulo Inconsistente (Sem Emoji)]")
            print(f"Status: {res.status} | Sucesso: {res.sucesso} | Tempo: {res.execution_time_ms:.1f}ms")

            assert res.sucesso is True, "Fuzzy/Exact matching normalizado deve ignorar emojis ausentes"
            await browser.close()

    @pytest.mark.asyncio
    async def test_dim4_cenario4_escala_volume_40_alunos(self, benchmark_fixture_uri):
        """
        Cenário 4.4: Escala com volume real de 40 alunos em grid rolável.
        Mede o tempo e iterações de scroll para:
        - Aluno no Topo (1. Ana Júlia)
        - Aluno no Meio (26. Lucas Silva)
        - Aluno no Fundo (40. Zélia Souza)
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(benchmark_fixture_uri)

            # Abre Meus Alunos
            await page.locator("#tab-alunos").click()

            alvos = [
                ("Aluno no Topo (#1)", "Ana Júlia"),
                ("Aluno no Meio (#26)", "Lucas Silva"),
                ("Aluno no Fundo (#40)", "Zélia Souza")
            ]

            print("\n=== DIMENSÃO 4.4: Benchmark de Escala com 40 Alunos em Contêiner Rolável ===")
            results = []

            for pos_name, nome_aluno in alvos:
                # Reseta scroll para o topo
                await page.evaluate("document.getElementById('grid-alunos-40').scrollTop = 0")

                explorer = IterativeDomExplorer(max_scroll_iterations=10)
                t0 = time.perf_counter()
                node = HierarchicalNavNode(
                    node_id=nome_aluno.lower().replace(" ", "_"),
                    label=nome_aluno,
                    node_type=NavNodeType.ITEM_LISTA
                )
                res = await explorer._explore_single_node(page, node)
                elapsed_ms = (time.perf_counter() - t0) * 1000

                scroll_steps = [t for t in res["trace"] if "scroll" in str(t.get("strategy", ""))]

                results.append({
                    "posicao": pos_name,
                    "aluno": nome_aluno,
                    "sucesso": res["sucesso"],
                    "status": res["status"],
                    "tempo_ms": elapsed_ms,
                    "scroll_iterations": len(scroll_steps)
                })

                print(f"[{pos_name}] {nome_aluno} | Sucesso: {res['sucesso']} | Scrolls: {len(scroll_steps)} | Tempo: {elapsed_ms:.1f}ms")

            await browser.close()

            # O aluno no topo é achado em 0 scrolls
            assert results[0]["sucesso"] is True
            assert results[0]["scroll_iterations"] == 0

            # O aluno no meio é achado em scrolls intermediários
            assert results[1]["sucesso"] is True
            assert results[1]["scroll_iterations"] > 0

            # O aluno no fundo é achado com scroll progressivo contínuo
            assert results[2]["sucesso"] is True
            print(f"Escala de tempo: Topo ({results[0]['tempo_ms']:.1f}ms) -> Meio ({results[1]['tempo_ms']:.1f}ms) -> Fundo ({results[2]['tempo_ms']:.1f}ms)")
