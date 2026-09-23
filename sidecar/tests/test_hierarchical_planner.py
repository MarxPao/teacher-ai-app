"""
sidecar/tests/test_hierarchical_planner.py — Testes Unitários do Planejador Hierárquico e Backtracking
"""

import pytest
import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from skills.hierarchical_planner_skill import HierarchicalPlanner, CausalReflector, SubGoalNode


def test_hierarchical_goal_decomposition_with_dependencies():
    goal = "Lançar nota 9.5 para Hugo Silva na turma 8B em Matemática"
    plan = HierarchicalPlanner.decompose_compound_goal(goal)

    assert plan.original_goal == goal
    assert len(plan.nodes) >= 3

    # Deve ter decomposto Turma, Disciplina e Aluno
    turma_node = plan.nodes.get("step_1_turma")
    assert turma_node is not None
    assert "8b" in turma_node.entity_target.lower()

    disc_node = plan.nodes.get("step_2_disciplina")
    assert disc_node is not None
    assert "matemática" in disc_node.entity_target.lower()
    assert turma_node.subgoal_id in disc_node.prerequisites

    action_node = plan.nodes.get("step_3_action")
    assert action_node is not None
    assert "hugo" in action_node.entity_target.lower()
    assert action_node.value_payload == "9.5"


def test_backtracking_engine_flow():
    goal = "Lançar nota para Alice na turma 9A"
    plan = HierarchicalPlanner.decompose_compound_goal(goal)

    # Conclui primeiro passo (Turma)
    node1 = plan.get_current_node()
    assert node1.subgoal_id == "step_1_turma"
    plan.mark_current_completed()

    # Chega no segundo passo (Ação do Aluno)
    node2 = plan.get_current_node()
    assert node2.subgoal_id == "step_2_action"

    # Simula bloqueio: aluna não encontrada -> dispara backtracking para passo 1
    assert plan.can_backtrack() is True
    reverted_node = plan.trigger_backtrack(reason="Aluna Alice não encontrada no grid da turma 9A")

    assert reverted_node.subgoal_id == "step_1_turma"
    assert reverted_node.is_completed is False
    assert plan.current_index == 0
    assert plan.get_current_node().subgoal_id == "step_1_turma"


def test_causal_reflector_diagnostics():
    node = SubGoalNode(
        subgoal_id="step_3",
        goal_text="Preencher nota 10 para Sofia",
        category="INPUT",
        entity_target="Sofia"
    )

    # 1. Diagnóstico de Sessão Expirada
    diag_sess = CausalReflector.diagnose_failure(
        subgoal=node,
        page_url="https://portal.escola.com.br/auth/login",
        error_text="Sua sessão expirou por inatividade"
    )
    assert diag_sess["cause_category"] == "SESSION_EXPIRED"
    assert diag_sess["suggested_action"] == "REAUTHENTICATE"

    # 2. Diagnóstico de Aluno não encontrado
    diag_student = CausalReflector.diagnose_failure(
        subgoal=node,
        page_url="https://portal.escola.com.br/diario",
        error_text="Elemento não localizado"
    )
    assert diag_student["cause_category"] == "ENTITY_NOT_FOUND"
    assert diag_student["should_backtrack"] is True

    # 3. Diagnóstico de API de Negócio
    diag_api = CausalReflector.diagnose_failure(
        subgoal=node,
        page_url="https://portal.escola.com.br/diario",
        network_outcome={
            "error_reason": "BUSINESS_VALIDATION_ERROR",
            "details": "Data de lançamento bloqueada pela coordenação"
        }
    )
    assert diag_api["cause_category"] == "API_VALIDATION_ERROR"
    assert "bloqueada pela coordenação" in diag_api["human_diagnosis"]
