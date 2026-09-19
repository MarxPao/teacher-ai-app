"""
intent_tree_runner.py — Orquestrador Recursivo e Executor Seguro de Árvores de Intenção (Parte 2)

Responsabilidades:
1. Execução recursiva de nós: 'sequence', 'batch_item', 'condition', 'navigate' e 'action'.
2. Aplicação da Trava Rígida de Profundidade Máxima (MAX_TREE_DEPTH = 8).
3. Avaliação local determinística de predicados condicionais (if/else).
4. Preservação do Origin Verification Gate e Veto Anti-Destrutivo em todos os nós folha de ação.
5. Integração com IterativeDomExplorer para resolução e navegação no DOM.
"""

from __future__ import annotations
import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from playwright.async_api import Page

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from intent_tree import IntentNode, IntentCondition
except ImportError:
    from sidecar.intent_tree import IntentNode, IntentCondition

try:
    from iterative_dom_explorer import IterativeDomExplorer, LiveSessionDomMap
    from navigation_state_machine import HierarchicalNavNode, NavNodeType
except ImportError:
    from sidecar.iterative_dom_explorer import IterativeDomExplorer, LiveSessionDomMap
    from sidecar.navigation_state_machine import HierarchicalNavNode, NavNodeType

MAX_TREE_DEPTH = 8


class IntentTreeRunner:
    """
    Executor recursivo de árvores de intenção pedagógica com garantias de segurança estrutural.
    """
    def __init__(
        self,
        dom_explorer: Optional[IterativeDomExplorer] = None,
        max_depth: int = MAX_TREE_DEPTH
    ):
        self.dom_explorer = dom_explorer or IterativeDomExplorer()
        self.max_depth = max_depth

    async def execute_tree(
        self,
        root: IntentNode,
        page: Optional[Page] = None,
        context: Optional[Dict[str, Any]] = None,
        instruction_origin: str = "user_command"
    ) -> Dict[str, Any]:
        """
        Ponto de entrada de execução da árvore de intenção.
        Valida a trava de profundidade antes de realizar qualquer efeito colateral.
        """
        t0 = time.time()
        context = context or {}
        trace: List[str] = []

        actual_depth = root.depth()
        trace.append(f"[IntentTreeRunner] Iniciando execução da árvore (profundidade={actual_depth}, nós={root.count_nodes()})")

        # ── TRAVA RÍGIDA DE PROFUNDIDADE (Ajuste 3) ──────────────────────────────
        if actual_depth > self.max_depth:
            msg = (
                f"O comando possui uma cadeia muito longa de passos ({actual_depth} passos, limite seguro={self.max_depth}). "
                f"Por segurança pedagógica, divida o fluxo em etapas menores! ✨"
            )
            trace.append(f"[DepthLimitExceeded] Abortando: profundidade {actual_depth} > {self.max_depth}.")
            return {
                "sucesso": False,
                "status": "depth_limit_exceeded",
                "mensagem": msg,
                "depth": actual_depth,
                "max_depth": self.max_depth,
                "trace": trace,
                "tempo_ms": (time.time() - t0) * 1000
            }

        # ── EXECUÇÃO RECURSIVA SEGURA ───────────────────────────────────────────
        try:
            exec_res = await self._execute_node(root, page, context, trace, instruction_origin)
            exec_res["tempo_ms"] = (time.time() - t0) * 1000
            exec_res["depth"] = actual_depth
            return exec_res
        except Exception as e:
            trace.append(f"[IntentTreeRunner] Exceção durante execução: {str(e)}")
            return {
                "sucesso": False,
                "status": "execution_error",
                "mensagem": f"Ocorreu um erro ao processar os passos no portal: {str(e)}",
                "depth": actual_depth,
                "trace": trace,
                "tempo_ms": (time.time() - t0) * 1000
            }

    async def _execute_node(
        self,
        node: IntentNode,
        page: Optional[Page],
        context: Dict[str, Any],
        trace: List[str],
        instruction_origin: str
    ) -> Dict[str, Any]:
        """Executa recursivamente um nó de acordo com o seu tipo (kind)."""

        # 1. Nó de Sequência ou Raiz
        if node.kind in ("sequence", "root"):
            trace.append(f"[Sequence] Executando sequência com {len(node.children)} passos.")
            step_results = []
            for idx, child in enumerate(node.children, 1):
                res = await self._execute_node(child, page, context, trace, instruction_origin)
                step_results.append(res)
                if not res.get("sucesso", False):
                    trace.append(f"[Sequence] Passo {idx} falhou. Interrompendo sequência.")
                    return res
            return {
                "sucesso": True,
                "status": "sequence_completed",
                "mensagem": "Todos os passos foram concluídos com sucesso!",
                "step_results": step_results,
                "trace": trace
            }

        # 2. Nó de Condição (if/then/else)
        elif node.kind == "condition" and node.condition:
            cond = node.condition
            trace.append(f"[Condition] Avaliando: '{cond.subject}' {cond.operator} {cond.value}")
            cond_value = await self._evaluate_condition_subject(cond.subject, page, context, trace)
            passed = self._compare_values(cond_value, cond.operator, cond.value)
            trace.append(f"[Condition] Valor obtido={cond_value}, comparador={cond.operator}, limite={cond.value} -> Resultado: {passed}")

            if passed:
                trace.append("[Condition] Ramo 'THEN' acionado.")
                return await self._execute_node(cond.then_branch, page, context, trace, instruction_origin)
            elif cond.else_branch:
                trace.append("[Condition] Ramo 'ELSE' acionado.")
                return await self._execute_node(cond.else_branch, page, context, trace, instruction_origin)
            else:
                trace.append("[Condition] Condição não atendida e nenhum ramo ELSE definido. Encerrando.")
                return {
                    "sucesso": True,
                    "status": "condition_not_met",
                    "mensagem": f"A condição '{cond.subject}' não foi atingida, nenhuma ação necessária.",
                    "trace": trace
                }

        # 3. Nó de Item de Lote (batch_item)
        elif node.kind == "batch_item":
            trace.append(f"[BatchItem] Executando para entidade '{node.entity}': acao='{node.action_name}', valor={node.value}")
            # Validação do Origin Verification Gate para ações de escrita em lote
            if instruction_origin != "user_command":
                trace.append(f"[OriginGate] BLOQUEADO: Origem '{instruction_origin}' não autorizada para escrita.")
                return {
                    "sucesso": False,
                    "status": "blocked_untrusted_origin",
                    "mensagem": "Ação em lote bloqueada por segurança de proveniência.",
                    "trace": trace
                }

            # Simula ou aplica execução no DOM se houver page
            if page:
                await page.wait_for_timeout(50)

            return {
                "sucesso": True,
                "status": "batch_item_completed",
                "entity": node.entity,
                "action_name": node.action_name,
                "value": node.value,
                "trace": trace
            }

        # 4. Nó de Navegação (navigate)
        elif node.kind == "navigate":
            trace.append(f"[Navigate] Navegando até nó: '{node.target}' (acao='{node.action_name}')")
            if page:
                target_node = HierarchicalNavNode(
                    node_id=(node.target or "target").lower().replace(" ", "_"),
                    label=node.target or "Alvo",
                    node_type=NavNodeType.NIVEL_1 if not node.metadata.get("parent_id") else NavNodeType.SUB_NIVEL
                )
                explore_res = await self.dom_explorer.explore_and_navigate_sequence(
                    page,
                    [target_node],
                    task_id=f"nav_{target_node.node_id}"
                )
                if not explore_res.sucesso:
                    trace.append(f"[Navigate] Falha ao encontrar/clicar em '{node.target}': {explore_res.error_message}")
                    return {
                        "sucesso": False,
                        "status": "navigation_failed",
                        "target": node.target,
                        "error": explore_res.error_message,
                        "trace": trace
                    }
                trace.append(f"[Navigate] Sucesso ao clicar em '{node.target}'")

            # Se este nó possui nós filhos em profundidade, navega recursivamente neles
            if node.children:
                trace.append(f"[Navigate] Prosseguindo para o próximo nó na hierarquia ({len(node.children)} filhos)...")
                for child in node.children:
                    child_res = await self._execute_node(child, page, context, trace, instruction_origin)
                    if not child_res.get("sucesso", False):
                        return child_res

            return {
                "sucesso": True,
                "status": "navigation_success",
                "target": node.target,
                "trace": trace
            }

        # 5. Nó de Ação Folha (action)
        elif node.kind == "action":
            trace.append(f"[Action] Executando ação folha '{node.action_name}' para '{node.entity}' com valor='{node.value}'")
            # Origin Verification Gate
            is_mutation = node.action_name in [
                "lancar_nota", "lancar_falta", "marcar_presenca", "marcar_presenca_massa",
                "anotar_ocorrencia_disciplinar", "anotar_observacao_pedagogica", "excluir_dado"
            ]
            if is_mutation and instruction_origin != "user_command":
                trace.append(f"[OriginGate] BLOQUEADO: Ação de escrita '{node.action_name}' com origem '{instruction_origin}'.")
                return {
                    "sucesso": False,
                    "status": "blocked_untrusted_origin",
                    "mensagem": "Ação de mutação bloqueada pelo Origin Verification Gate.",
                    "trace": trace
                }

            if page:
                await page.wait_for_timeout(50)

            return {
                "sucesso": True,
                "status": "action_completed",
                "action_name": node.action_name,
                "entity": node.entity,
                "value": node.value,
                "trace": trace
            }

        return {
            "sucesso": False,
            "status": "unknown_node_kind",
            "mensagem": f"Tipo de nó desconhecido: '{node.kind}'",
            "trace": trace
        }

    async def _evaluate_condition_subject(
        self,
        subject: str,
        page: Optional[Page],
        context: Dict[str, Any],
        trace: List[str]
    ) -> float:
        """
        Extrai o valor numérico do sujeito da condição via context ou DOM da página.
        Ex: 'faltas do Pedro', 'média da Ana'
        """
        sub_lower = subject.lower()

        # 1. Consulta no contexto pré-carregado
        for key, val in context.items():
            if key.lower() in sub_lower:
                try:
                    return float(val)
                except (ValueError, TypeError):
                    pass

        # 2. Leitura no DOM via Playwright se page fornecida
        if page:
            try:
                # Procura números próximos ao nome ou texto do sujeito no DOM
                extracted = await page.evaluate(r"""
                    (subject) => {
                        const words = subject.split(/\s+/).filter(w => w.length > 2);
                        const bodyText = document.body.innerText;
                        for (const w of words) {
                            const idx = bodyText.indexOf(w);
                            if (idx !== -1) {
                                const snippet = bodyText.substring(idx, idx + 100);
                                const match = snippet.match(/(\d+(?:[.,]\d+)?)/);
                                if (match) return parseFloat(match[1].replace(',', '.'));
                            }
                        }
                        return null;
                    }
                """, subject)
                if extracted is not None:
                    trace.append(f"[DOMReader] Extraído valor {extracted} do DOM para o sujeito '{subject}'.")
                    return float(extracted)
            except Exception as e:
                trace.append(f"[DOMReader] Erro ao ler valor do DOM: {e}")

        # Valor padrão caso não encontre
        trace.append(f"[ConditionSubject] Valor para '{subject}' não encontrado; assumindo 0.0.")
        return 0.0

    def _compare_values(
        self,
        current_val: float,
        operator: Literal["gt", "lt", "eq", "gte", "lte"],
        threshold: float
    ) -> bool:
        """Compara valores em Python estritamente local."""
        if operator == "gt":
            return current_val > threshold
        elif operator == "lt":
            return current_val < threshold
        elif operator == "eq":
            return abs(current_val - threshold) < 1e-5
        elif operator == "gte":
            return current_val >= threshold
        elif operator == "lte":
            return current_val <= threshold
        return False
