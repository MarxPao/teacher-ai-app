"""
test_local_semantic_matcher.py — Suíte de Testes do Motor de Similaridade Semântica Vetorial Local (Fase 1)

Valida o modelo default multilíngue (sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2),
o matching de termos regionais em português, o fallback resiliente com log obrigatório,
a inicialização não-bloqueante e a integração com HierarchicalNavigationModel.
"""

import logging
import pytest
import time
from unittest.mock import patch, MagicMock

from sidecar.local_semantic_matcher import LocalSemanticMatcher, DEFAULT_MULTILINGUAL_MODEL
from sidecar.navigation_state_machine import HierarchicalNavigationModel, HierarchicalNavNode, NavNodeType


class TestLocalSemanticMatcher:

    def test_default_model_is_multilingual(self):
        """Verifica se o modelo padrão configurado é o multilíngue."""
        matcher = LocalSemanticMatcher()
        assert matcher.model_name == DEFAULT_MULTILINGUAL_MODEL
        assert matcher.model_name == "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

    def test_multilingual_regional_queries_matching(self):
        """
        Reexecução dos testes do Item 4 com o modelo multilíngue:
        - 'ver pautas' deve mapear para 'Notas' (caso que falhava no modelo em inglês)
        - 'quadro de horários' deve mapear para 'Horários'
        - 'registro de ausências' contra categorias de portal
        """
        matcher = LocalSemanticMatcher.get_instance()

        # 1. Caso 'ver pautas'
        cands_pautas = ["Notas", "Recados", "Arquivos", "Horários"]
        res_pautas = matcher.match_best_candidate("ver pautas", cands_pautas, similarity_threshold=0.50)
        assert res_pautas is not None, "ver pautas deve retornar match"
        best_cand, score, _ = res_pautas
        assert best_cand == "Notas", f"Esperado 'Notas', obtido '{best_cand}' (score={score})"
        assert score >= 0.55, f"Score de 'ver pautas' ({score}) deve ser >= 0.55"

        # 2. Caso 'quadro de horários'
        cands_horarios = ["Horários", "Notas", "Recados", "Início"]
        res_horarios = matcher.match_best_candidate("quadro de horários", cands_horarios, similarity_threshold=0.50)
        assert res_horarios is not None, "quadro de horários deve retornar match"
        best_cand, score, _ = res_horarios
        assert best_cand == "Horários", f"Esperado 'Horários', obtido '{best_cand}' (score={score})"
        assert score >= 0.70, f"Score de 'quadro de horários' ({score}) deve ser >= 0.70"

        # 3. Caso 'registro de ausências' contra categorias com contexto de faltas/ausências
        cands_ausencias = ["Faltas / Ausências", "Notas / Boletim", "Recados", "Início"]
        res_ausencias = matcher.match_best_candidate("registro de ausências", cands_ausencias, similarity_threshold=0.50)
        assert res_ausencias is not None, "registro de ausências deve retornar match"
        best_cand, score, _ = res_ausencias
        assert best_cand == "Faltas / Ausências", f"Esperado 'Faltas / Ausências', obtido '{best_cand}' (score={score})"
        assert score >= 0.70, f"Score ({score}) deve ser >= 0.70"

    def test_fallback_when_model_fails(self, caplog):
        """
        Testa o fallback forçado caso o modelo vetorial falhe ao carregar.
        Garante que match_best_candidate retorna None e emite log obrigatório [EMBEDDING_FALLBACK_TRIGGERED].
        """
        caplog.set_level(logging.INFO)
        failing_matcher = LocalSemanticMatcher(model_name="modelo/inexistente-para-teste")

        with patch.object(failing_matcher, "load_model", return_value=None):
            result = failing_matcher.match_best_candidate("ver pautas", ["Notas", "Recados"])
            assert result is None, "Matcher deve retornar None em caso de falha do modelo"

        # Verifica presença do log canônico de fallback
        assert any("[EMBEDDING_FALLBACK_TRIGGERED]" in record.message for record in caplog.records), \
            "Deve emitir log com tag [EMBEDDING_FALLBACK_TRIGGERED]"

    def test_hierarchical_navigation_integration(self):
        """
        Verifica a integração no HierarchicalNavigationModel:
        - Termo léxico já existente continua funcionando diretamente
        - Termo regional inédito ('ver pautas') faz fallback semântico e acha o nó 'notas'
        """
        nav_model = HierarchicalNavigationModel()

        # 1. Matching léxico padrão
        node_recados = nav_model.find_node_by_label("recados")
        assert node_recados is not None
        assert node_recados.node_id == "recados"

        # 2. Termo regional ('ver pautas') resolvido semanticamente pelo LocalSemanticMatcher
        node_pautas = nav_model.find_node_by_label("ver pautas")
        assert node_pautas is not None, "HierarchicalNavigationModel deve resolver 'ver pautas' via semântica"
        assert node_pautas.node_id == "notas"
        assert node_pautas.label == "Notas"

        # 3. Termo 'quadro de horários'
        node_horarios = nav_model.find_node_by_label("quadro de horários")
        assert node_horarios is not None
        assert node_horarios.node_id == "horarios"

    def test_non_blocking_background_preload(self):
        """Verifica que start_background_preload retorna imediatamente sem travar a thread chamadora."""
        matcher = LocalSemanticMatcher(auto_preload=False)
        t0 = time.perf_counter()
        matcher.start_background_preload()
        elapsed_ms = (time.perf_counter() - t0) * 1000

        # O disparo do preload não pode travar a thread (deve ser assíncrono, < 150ms, vs ~2500ms do carregamento)
        assert elapsed_ms < 150.0, f"start_background_preload demorou {elapsed_ms:.2f}ms (deve ser < 150ms)"

    def test_telemetry_status_dict(self):
        """Verifica se o dicionário de status para REST/UI contém todos os campos necessários."""
        matcher = LocalSemanticMatcher.get_instance()
        status = matcher.get_status_dict()

        assert "status" in status
        assert "model_name" in status
        assert "is_cached" in status
        assert "disk_size_mb" in status
        assert "is_loading" in status
        assert "last_load_ms" in status
        assert "last_inference_ms" in status
        assert status["model_name"] == DEFAULT_MULTILINGUAL_MODEL

    def test_level1_primary_synonyms_matching(self):
        """
        Item 1: Verifica que 'registro de ausências' resolve para 'frequencia'
        diretamente via etapa léxica com os 4 candidatos primários.
        """
        from sidecar.navigation_state_machine import HierarchicalNavNode, NavNodeType
        model_4 = HierarchicalNavigationModel()
        model_4.nodes = {
            "inicio": HierarchicalNavNode("inicio", "Início", NavNodeType.NIVEL_1, synonyms=["home", "dashboard"]),
            "frequencia": HierarchicalNavNode("frequencia", "Frequência", NavNodeType.NIVEL_1, synonyms=["chamada", "presença", "faltas", "ausências", "ausencias", "registro de ausências"]),
            "notas": HierarchicalNavNode("notas", "Notas", NavNodeType.NIVEL_1, synonyms=["boletim"]),
            "recados": HierarchicalNavNode("recados", "Recados", NavNodeType.NIVEL_1, synonyms=["mensagens"]),
        }
        node = model_4.find_node_by_label("registro de ausências")
        assert node is not None
        assert node.node_id == "frequencia"
        assert node.label == "Frequência"

    def test_subnode_synonym_inheritance(self):
        """
        Item 2: Verifica que 'frequencia' herda 'ausências' do subnó 'faltas'
        mesmo quando o nó pai não possui 'ausências' em seus sinônimos diretos.
        """
        model = HierarchicalNavigationModel()
        freq_node = model.get_node("frequencia")
        freq_node.synonyms = ["chamada", "presença", "presenca", "faltas"]

        faltas_node = model.get_node("faltas")
        assert "ausências" in faltas_node.synonyms

        node = model.find_node_by_label("registro de ausências")
        assert node is not None
        assert node.node_id == "frequencia"

        sub_node = model.find_node_by_label("registro de ausências", parent_id="frequencia")
        assert sub_node is not None
        assert sub_node.node_id == "faltas"

    def test_ambiguous_standalone_query_triggers_honest_disambiguation(self):
        """
        Ponto 1: Teste de contrato para ambiguidade por ordem de declaração (Opção B).

        Quando uma query isolada ('provas') casa via sinônimos herdados em múltiplos
        nós de nível 1 ('diario' e 'notas'), o motor NUNCA deve escolher arbitrariamente
        o primeiro declarado no catálogo. Deve registrar ambiguidade honesta e retornar None.

        Por outro lado, com contexto explícito de nó pai (ex: parent_id='notas' ou 'diario'),
        a resolução é determinística e direta para o subnó correspondente.
        """
        model = HierarchicalNavigationModel()

        # 1. Query isolada ambígua: 'provas' é herdado por 'diario' e 'notas'
        res_ambiguous = model.find_node_by_label("provas")
        assert res_ambiguous is None, "Query ambígua 'provas' sem contexto pai deve retornar None"
        assert hasattr(model, "last_ambiguous_candidates")
        ambiguous_ids = [n.node_id for n in model.last_ambiguous_candidates]
        assert "diario" in ambiguous_ids, "'diario' deve constar nos candidatos ambíguos"
        assert "notas" in ambiguous_ids, "'notas' deve constar nos candidatos ambíguos"
        assert len(ambiguous_ids) >= 2

        # 2. Query contextualizada com parent_id: resolução sem ambiguidade
        node_notas_provas = model.find_node_by_label("provas", parent_id="notas")
        assert node_notas_provas is not None
        assert node_notas_provas.node_id == "avaliacoes"
        assert node_notas_provas.parent_id == "notas"

        node_diario_provas = model.find_node_by_label("provas", parent_id="diario")
        assert node_diario_provas is not None
        assert node_diario_provas.node_id == "diario_avaliacoes"
        assert node_diario_provas.parent_id == "diario"


