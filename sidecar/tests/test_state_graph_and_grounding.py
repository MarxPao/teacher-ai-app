"""
sidecar/tests/test_state_graph_and_grounding.py — Testes Unitários de State-Graph FSM e Grounding Educacional
"""

import pytest
import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from skills.state_graph_skill import ScreenStateFingerprinter, PortalStateGraph, StateTransition
from skills.educational_grounding_skill import EducationalOntology, SpatialMatrixGrounding


def test_screen_state_fingerprint_normalization():
    # Duas URLs da mesma rota com tokens ou query params diferentes devem produzir o mesmo StateID
    url1 = "https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto?token=abc12345"
    url2 = "https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto?token=xyz98765"
    
    ctx = {"filial": "01", "ano": "2026"}
    landmarks = ["Portal da Educação", "Selecionar Contexto"]

    fp1 = ScreenStateFingerprinter.generate_state_id(url1, ctx, landmarks, portal_id="santacatarina")
    fp2 = ScreenStateFingerprinter.generate_state_id(url2, ctx, landmarks, portal_id="santacatarina")

    assert fp1 == fp2
    assert "auth:selecionar_contexto" in fp1


def test_portal_state_graph_shortest_path_dijkstra():
    graph = PortalStateGraph(portal_id="totvs")

    # Estados: Login -> Contexto -> Dashboard -> Notas
    s_login = "totvs::auth:login::no_ctx::no_landmarks"
    s_ctx = "totvs::auth:selecionar_contexto::ctx1::no_landmarks"
    s_dash = "totvs::portal:dashboard::ctx1::no_landmarks"
    s_notas = "totvs::portal:lancamento_notas::ctx1::no_landmarks"

    graph.add_transition(StateTransition(
        from_state=s_login, to_state=s_ctx, action_type="CLICK", target_selector="button#btnLogin"
    ))
    graph.add_transition(StateTransition(
        from_state=s_ctx, to_state=s_dash, action_type="CLICK", target_selector="button#btnAvancar"
    ))
    graph.add_transition(StateTransition(
        from_state=s_dash, to_state=s_notas, action_type="CLICK", target_selector="a#menuNotas"
    ))
    # Atalho direto do contexto para notas (caso especial, peso menor)
    graph.add_transition(StateTransition(
        from_state=s_ctx, to_state=s_notas, action_type="NAVIGATE", target_selector="/notas", cost=0.5
    ))

    # Caminho do Login até Notas: Login -> Contexto -> Notas (via atalho custo menor)
    path = graph.find_shortest_path(s_login, s_notas)
    assert path is not None
    assert len(path) == 2
    assert path[0].to_state == s_ctx
    assert path[1].to_state == s_notas


def test_educational_ontology_concept_matching():
    # Avalia termos típicos de secretarias e professores brasileiros
    c1, s1 = EducationalOntology.classify_concept("Caderneta Eletrônica de Aulas")
    assert c1 == "DIARIO"
    assert s1 >= 0.8

    c2, s2 = EducationalOntology.classify_concept("Folha de Presença e Frequência")
    assert c2 == "CHAMADA"
    assert s2 >= 0.8

    c3, s3 = EducationalOntology.classify_concept("Lançamento de Avaliações 1º Bimestre")
    assert c3 == "NOTAS"
    assert s3 >= 0.8

    assert EducationalOntology.matches_concept("Digitação de Notas", "NOTAS") is True
    assert EducationalOntology.matches_concept("Registro de Faltas", "CHAMADA") is True


def test_spatial_matrix_student_fuzzy_and_cell_selector():
    candidates = [
        "ALICE ALMEIDA DOS SANTOS",
        "HUGO DA SILVA PINTO JUNIOR",
        "MARIA EDUARDA PEREIRA"
    ]

    # Matching de aluno por apelido/nome abreviado
    match, score = SpatialMatrixGrounding.fuzzy_match_student("Hugo Silva", candidates)
    assert match == "HUGO DA SILVA PINTO JUNIOR"
    assert score >= 0.9

    # Geração de seletor relativo de célula
    selector_data = SpatialMatrixGrounding.generate_cell_selector(
        student_name="Hugo Silva",
        column_identifier="Nota 1",
        column_index=2
    )

    assert "hugo" in selector_data["xpath_row"].lower()
    assert "silva" in selector_data["xpath_row"].lower()
    assert "//td[2]//input" in selector_data["xpath_cell"]
    assert "norm(rowText).includes" in selector_data["js_resolver"] or "studentQuery" in selector_data["js_resolver"]
