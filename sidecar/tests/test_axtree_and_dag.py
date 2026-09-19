"""
Testes Unitários da Percepção por AXTree e Compilador DAG de Pathways
"""

import pytest
from sidecar.skills.axtree_perception_skill import AXTreePerceptionSkill
from sidecar.skills.pathway_compiler_skill import PathwayCompilerSkill


def test_axtree_filter_interactive_nodes():
    mock_raw_nodes = [
        {
            "nodeId": "1",
            "backendDOMNodeId": 10,
            "role": {"value": "GenericContainer"},
            "name": {"value": ""}
        },
        {
            "nodeId": "2",
            "backendDOMNodeId": 20,
            "role": {"value": "button"},
            "name": {"value": "Salvar Diário de Classe"},
            "properties": [{"name": "disabled", "value": {"value": False}}]
        },
        {
            "nodeId": "3",
            "backendDOMNodeId": 30,
            "role": {"value": "combobox"},
            "name": {"value": "Selecionar Turma"},
            "properties": [{"name": "disabled", "value": {"value": False}}]
        },
        {
            "nodeId": "4",
            "backendDOMNodeId": 40,
            "role": {"value": "textbox"},
            "name": {"value": "Nota do Aluno"},
            "value": {"value": "7.5"}
        }
    ]

    filtered = AXTreePerceptionSkill.filter_interactive_nodes(mock_raw_nodes)
    assert len(filtered) == 3
    roles = [n["role"] for n in filtered]
    assert "button" in roles
    assert "combobox" in roles
    assert "textbox" in roles
    assert "genericcontainer" not in roles


def test_axtree_find_by_semantic_intent():
    nodes = [
        {"nodeId": "1", "role": "button", "name": "Cancelar Operação", "disabled": False},
        {"nodeId": "2", "role": "button", "name": "Gravar Frequência e Notas", "disabled": False},
        {"nodeId": "3", "role": "link", "name": "Ajuda", "disabled": False}
    ]

    found = AXTreePerceptionSkill.find_best_node_by_semantic_intent(
        interactive_nodes=nodes,
        role="button",
        keywords=["gravar", "notas"]
    )
    assert found is not None
    assert found["nodeId"] == "2"
    assert found["name"] == "Gravar Frequência e Notas"


def test_pathway_compiler_dag_generation():
    raw_nodes = [
        {
            "type": "NAVIGATE",
            "payload": {"url": "https://portal.com/diario"}
        },
        {
            "type": "CLICK",
            "target": "#btn_salvar",
            "context": {"button_text": "Salvar"}
        }
    ]

    dag = PathwayCompilerSkill.compile_dag_trajectory(
        portal_id="totvs",
        intent="salvar_diario",
        title="Salvar Diário de Classe",
        start_url="https://portal.com/diario",
        nodes=raw_nodes
    )

    assert dag["is_dag"] is True
    assert len(dag["steps"]) == 2
    assert len(dag["edges"]) == 1
    assert dag["edges"][0]["condition"] == "on_success"
    assert dag["status"] == "compiled"
