"""
sidecar/skills/hierarchical_planner_skill.py — Planejador Hierárquico com Backtracking & Reflexão Causal

Resolve os problemas de 'Miopia de Horizonte' e falhas repetitivas:
1. HierarchicalGoalDecomposer: Decompõe metas compostas escolares em um Grafo de Dependências com pré-requisitos.
2. BacktrackingEngine: Se um passo falhar (ex: aluno não encontrado no grid), regride ao nó pai (seleção de turma)
   para verificar se a turma correta foi selecionada antes de esgotar tentativas em falso.
3. CausalReflector: Auto-reflexão que diagnostica a causa-raiz física/lógica da falha
   (ex: 'Prazo encerrado', 'Aluno não matriculado nesta turma', 'Sessão expirada') e gera anti-padrões para o Supabase.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    from skills.educational_grounding_skill import EducationalOntology
except ImportError:
    try:
        from sidecar.skills.educational_grounding_skill import EducationalOntology
    except ImportError:
        EducationalOntology = None  # type: ignore

logger = logging.getLogger("HierarchicalPlannerSkill")


class SubGoalNode:
    """Nó atômico no grafo de dependência do plano."""

    def __init__(
        self,
        subgoal_id: str,
        goal_text: str,
        category: str,
        prerequisites: Optional[List[str]] = None,
        entity_target: Optional[str] = None,
        value_payload: Optional[Any] = None
    ):
        self.subgoal_id = subgoal_id
        self.goal_text = goal_text
        self.category = category  # CONTEXT | NAVIGATION | SELECTION | INPUT | VERIFICATION | SUBMISSION
        self.prerequisites: List[str] = prerequisites or []
        self.entity_target = entity_target
        self.value_payload = value_payload
        self.is_completed = False
        self.attempts = 0
        self.last_error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "subgoal_id": self.subgoal_id,
            "goal_text": self.goal_text,
            "category": self.category,
            "prerequisites": self.prerequisites,
            "entity_target": self.entity_target,
            "value_payload": self.value_payload,
            "is_completed": self.is_completed,
            "attempts": self.attempts,
            "last_error": self.last_error
        }


class HierarchicalPlan:
    """Plano de execução composto por nós com dependências."""

    def __init__(self, original_goal: str, nodes: List[SubGoalNode]):
        self.original_goal = original_goal
        self.nodes = {n.subgoal_id: n for n in nodes}
        self.node_order = [n.subgoal_id for n in nodes]
        self.current_index = 0
        self.history: List[Dict[str, Any]] = []

    def get_current_node(self) -> Optional[SubGoalNode]:
        if 0 <= self.current_index < len(self.node_order):
            return self.nodes[self.node_order[self.current_index]]
        return None

    def mark_current_completed(self) -> None:
        curr = self.get_current_node()
        if curr:
            curr.is_completed = True
            self.history.append({"subgoal_id": curr.subgoal_id, "status": "COMPLETED"})
            self.current_index += 1

    def can_backtrack(self) -> bool:
        """Verifica se há um passo anterior dependente para o qual podemos regredir."""
        return self.current_index > 0

    def trigger_backtrack(self, reason: str) -> Optional[SubGoalNode]:
        """Regride para o nó pai anterior para tentar uma resolução corretiva."""
        if not self.can_backtrack():
            return None
        
        curr = self.get_current_node()
        prev_idx = self.current_index - 1
        prev_node = self.nodes[self.node_order[prev_idx]]
        
        self.history.append({
            "action": "BACKTRACK",
            "from_node": curr.subgoal_id if curr else "unknown",
            "to_node": prev_node.subgoal_id,
            "reason": reason
        })
        logger.warning(f"🔄 [Backtracking] Regredindo de '{curr.goal_text if curr else ''}' para '{prev_node.goal_text}' devido a: {reason}")
        
        prev_node.is_completed = False
        self.current_index = prev_idx
        return prev_node


class HierarchicalPlanner:
    """Decompõe e orquestra metas escolares complexas com dependências."""

    @classmethod
    def decompose_compound_goal(cls, goal: str) -> HierarchicalPlan:
        """
        Decompõe um comando em nós estruturados com grafo de dependências.
        Exemplo: 'Lançar nota 9 para Hugo Silva na turma 8B em Matemática'
        Gera:
        1. Contexto / Turma: 'Selecionar Turma 8B'
        2. Disciplina: 'Selecionar Disciplina Matemática' (depende de 1)
        3. Aluno & Nota: 'Preencher nota 9 para Hugo Silva' (depende de 2)
        4. Submissão: 'Salvar notas' (depende de 3)
        """
        clean = goal.strip()
        nodes: List[SubGoalNode] = []

        # 1. Extração de Turma (ex: 8B, 9º Ano, 3º EM, 1A)
        m_turma = re.search(r"\b(?:turma|classe|ano|s[eé]rie)\s*([0-9]+[a-zA-Zº°\s-]*)\b", clean, re.I)
        turma_val = m_turma.group(0).strip() if m_turma else None

        # 2. Extração de Disciplina
        m_disc = re.search(r"\b(?:em|de|disciplina|mat[eé]ria)\s+(matem[aá]tica|portugu[eê]s|ingl[eê]s|hist[oó]ria|geografia|ci[eê]ncias|f[ií]sica|qu[ií]mica|biologia|artes?|educa[cç][aã]o f[ií]sica)\b", clean, re.I)
        disc_val = m_disc.group(1).strip() if m_disc else None

        # 3. Extração de Nota e Aluno
        m_nota = re.search(r"\b(?:nota|grau|avalia[cç][aã]o|conceito)\s*([0-9]+(?:[\.,][0-9]+)?)\b", clean, re.I)
        nota_val = m_nota.group(1).strip() if m_nota else None

        m_aluno = re.search(r"\b(?:para|pro|do|da|aluno|aluna|estudante)\s+([A-Za-zÀ-ÿ\s]{3,30}?)(?=\s+(?:na|no|em|turma|nota|$))", clean, re.I)
        aluno_val = m_aluno.group(1).strip() if m_aluno else None

        step_idx = 1
        last_id = None

        # Nó 1: Selecionar Turma se detectada
        if turma_val:
            node_id = f"step_{step_idx}_turma"
            nodes.append(SubGoalNode(
                subgoal_id=node_id,
                goal_text=f"Selecionar {turma_val}",
                category="SELECTION",
                prerequisites=[],
                entity_target=turma_val
            ))
            last_id = node_id
            step_idx += 1

        # Nó 2: Selecionar Disciplina se detectada
        if disc_val:
            node_id = f"step_{step_idx}_disciplina"
            nodes.append(SubGoalNode(
                subgoal_id=node_id,
                goal_text=f"Selecionar Disciplina {disc_val}",
                category="SELECTION",
                prerequisites=[last_id] if last_id else [],
                entity_target=disc_val
            ))
            last_id = node_id
            step_idx += 1

        # Nó 3: Ação Principal (Preencher nota ou chamada)
        action_text = clean
        cat = "INPUT"
        if nota_val and aluno_val:
            action_text = f"Preencher nota {nota_val} para {aluno_val}"
        elif aluno_val:
            action_text = f"Localizar e interagir com {aluno_val}"

        node_id = f"step_{step_idx}_action"
        nodes.append(SubGoalNode(
            subgoal_id=node_id,
            goal_text=action_text,
            category=cat,
            prerequisites=[last_id] if last_id else [],
            entity_target=aluno_val,
            value_payload=nota_val
        ))
        last_id = node_id
        step_idx += 1

        # Se não quebrou em múltiplos nós, cria nó unitário padrão
        if not nodes:
            nodes.append(SubGoalNode(
                subgoal_id="step_1_goal",
                goal_text=clean,
                category="NAVIGATION"
            ))

        return HierarchicalPlan(original_goal=goal, nodes=nodes)


class CausalReflector:
    """Analisa a causa fundamental de falhas e formula diagnósticos objetivos."""

    @classmethod
    def diagnose_failure(
        cls,
        subgoal: SubGoalNode,
        page_url: str,
        error_text: Optional[str] = None,
        network_outcome: Optional[Dict[str, Any]] = None,
        observed_banners: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Produz diagnóstico causal categorizado:
        - API_VALIDATION_ERROR: backend rejeitou com mensagem de negócio
        - ENTITY_NOT_FOUND: elemento/aluno não existe no escopo selecionado
        - SESSION_EXPIRED: sessão expirou e portal redirecionou para login
        - PERMISSION_DENIED: usuário sem perfil para a ação
        - TIMEOUT_OR_OBSTRUCTED: modal ou loading interceptou clique
        """
        banners = observed_banners or []
        all_text = " ".join([str(error_text or ""), " ".join(banners)]).lower()

        # 1. Sessão Expirada / Desautenticação
        if "login" in page_url.lower() or any(w in all_text for w in ("sessao expirada", "sessão expirada", "faca login", "faça login", "desconectado")):
            return {
                "cause_category": "SESSION_EXPIRED",
                "human_diagnosis": "A sessão do professor no portal expirou. É necessário autenticar novamente.",
                "should_backtrack": False,
                "suggested_action": "REAUTHENTICATE",
                "anti_pattern_rule": "Sessão expirada durante a execução no portal."
            }

        # 2. Erro de Negócio retornado via API
        if network_outcome and network_outcome.get("error_reason") in ("API_HTTP_ERROR", "BUSINESS_VALIDATION_ERROR"):
            detail = network_outcome.get("details", "")
            return {
                "cause_category": "API_VALIDATION_ERROR",
                "human_diagnosis": f"O portal rejeitou a operação com a seguinte regra: {detail}",
                "should_backtrack": False,
                "suggested_action": "ABORT_HONESTLY",
                "anti_pattern_rule": f"Portal rejeitou requisição de gravação: {detail}"
            }

        # 3. Aluno ou Entidade não encontrada na tela
        if subgoal.category == "INPUT" and subgoal.entity_target:
            return {
                "cause_category": "ENTITY_NOT_FOUND",
                "human_diagnosis": f"O aluno/entidade '{subgoal.entity_target}' não foi encontrado na listagem da tela atual.",
                "should_backtrack": True,
                "suggested_action": "VERIFY_PARENT_SELECTION",
                "anti_pattern_rule": f"Aluno '{subgoal.entity_target}' ausente no grid da turma/disciplina ativa."
            }

        # 4. Falha genérica por elemento ausente ou oculto
        return {
            "cause_category": "ELEMENT_NOT_FOUND",
            "human_diagnosis": f"Não foi possível localizar o elemento para '{subgoal.goal_text}'.",
            "should_backtrack": True,
            "suggested_action": "RETRY_WITH_ALTERNATIVE_ANCHOR",
            "anti_pattern_rule": f"Elemento para '{subgoal.goal_text}' inalcançável no estado atual."
        }
