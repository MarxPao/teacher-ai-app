"""
intent_tree.py — Modelo de Árvore de Intenção e Parser Gramatical Recursivo (Parte 2)

Arquitetura de 3 Camadas de Honestidade em Cascata:
1. Camada A: Ollama Local com JSON Schema Estrito (zero saída da máquina).
2. Camada B: Fallback Determinístico Recursivo com Critério Formal de Confiança Suficiente
   (cobertura de marcadores, consumo de sobra textual e ancoragem de entidades no roster).
3. Camada C: Resposta de Esclarecimento Amigável (nunca executa árvore aproximada ou truncada).
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Literal, Dict, Any, Union, Iterable
import re
import json
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from navigation_state_machine import (
        HierarchicalNavigationModel,
        HierarchicalNavNode,
        NavNodeType,
        STRICT_ACTION_VERBS,
        COURTESY_AND_DISCOURSE_MODIFIERS,
        _COMMON_NON_TARGET_WORDS,
    )
except ImportError:
    from sidecar.navigation_state_machine import (
        HierarchicalNavigationModel,
        HierarchicalNavNode,
        NavNodeType,
        STRICT_ACTION_VERBS,
        COURTESY_AND_DISCOURSE_MODIFIERS,
        _COMMON_NON_TARGET_WORDS,
    )


@dataclass
class IntentCondition:
    """Representa predicados lógicos e ramificações condicionais."""
    subject: str                                       # ex: "faltas do Pedro", "média da Ana"
    operator: Literal["gt", "lt", "eq", "gte", "lte"]  # >, <, ==, >=, <=
    value: float                                       # ex: 3.0, 6.0
    then_branch: "IntentNode"
    else_branch: Optional["IntentNode"] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "subject": self.subject,
            "operator": self.operator,
            "value": self.value,
            "then_branch": self.then_branch.to_dict() if self.then_branch else None,
            "else_branch": self.else_branch.to_dict() if self.else_branch else None,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> IntentCondition:
        return cls(
            subject=data["subject"],
            operator=data["operator"],
            value=float(data["value"]),
            then_branch=IntentNode.from_dict(data["then_branch"]),
            else_branch=IntentNode.from_dict(data["else_branch"]) if data.get("else_branch") else None,
        )


@dataclass
class IntentNode:
    """Nó principal da árvore de intenção pedagógica."""
    kind: Literal["navigate", "action", "condition", "sequence", "batch_item", "root"]
    target: Optional[str] = None                       # Rótulo do nó (ex: "Notas", "Avaliações", "Carlos")
    entity: Optional[str] = None                       # Nome do aluno/turma (ex: "Pedro Santos")
    value: Optional[Union[str, float]] = None          # Valor da nota, falta ou texto
    action_name: Optional[str] = None                  # ex: "navegar_aba", "abrir_perfil", "lancar_nota", "lancar_falta"
    children: List["IntentNode"] = field(default_factory=list)
    condition: Optional[IntentCondition] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def depth(self) -> int:
        """Calcula a profundidade máxima da árvore a partir deste nó."""
        child_depths = [c.depth() for c in self.children]
        cond_depths = []
        if self.condition:
            if self.condition.then_branch:
                cond_depths.append(self.condition.then_branch.depth())
            if self.condition.else_branch:
                cond_depths.append(self.condition.else_branch.depth())
        sub_depths = child_depths + cond_depths
        if not sub_depths:
            return 1
        return 1 + max(sub_depths)

    def count_nodes(self) -> int:
        """Conta o número total de nós na sub-árvore."""
        count = 1
        for c in self.children:
            count += c.count_nodes()
        if self.condition:
            if self.condition.then_branch:
                count += self.condition.then_branch.count_nodes()
            if self.condition.else_branch:
                count += self.condition.else_branch.count_nodes()
        return count

    def to_dict(self) -> Dict[str, Any]:
        return {
            "kind": self.kind,
            "target": self.target,
            "entity": self.entity,
            "value": self.value,
            "action_name": self.action_name,
            "children": [c.to_dict() for c in self.children],
            "condition": self.condition.to_dict() if self.condition else None,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> IntentNode:
        return cls(
            kind=data["kind"],
            target=data.get("target"),
            entity=data.get("entity"),
            value=data.get("value"),
            action_name=data.get("action_name"),
            children=[cls.from_dict(c) for c in data.get("children", [])],
            condition=IntentCondition.from_dict(data["condition"]) if data.get("condition") else None,
            metadata=data.get("metadata", {}),
        )


@dataclass
class ParseTreeResult:
    """Resultado estruturado do IntentTreeParser."""
    success: bool
    root: Optional[IntentNode]
    layer_used: Literal["ollama_local", "deterministic_fallback", "clarification"]
    needs_clarification: bool
    clarification_question: Optional[str] = None
    unparsed_remainder: Optional[str] = None
    telemetry: Dict[str, Any] = field(default_factory=dict)


def _normalize_name(name: str) -> str:
    """Normaliza nome para comparação insensível a acento e caixa."""
    if not name:
        return ""
    clean = unicodedata.normalize("NFD", name.strip().lower())
    return "".join(c for c in clean if unicodedata.category(c) != "Mn")


class IntentTreeParser:
    """
    Parser semântico com arquitetura em cascata de 3 camadas.
    Garante decomposição rigorosa de N saltos, condicionais e lotes sem truncamento silencioso.
    """
    def __init__(self, nav_model: Optional[HierarchicalNavigationModel] = None):
        self.nav_model = nav_model or HierarchicalNavigationModel()

    def parse(
        self,
        command: str,
        known_students: Optional[Iterable[str]] = None,
        ollama_url: Optional[str] = None,
        ollama_model: Optional[str] = None,
    ) -> ParseTreeResult:
        t0 = time.time()
        if not command or not isinstance(command, str) or not command.strip():
            return ParseTreeResult(
                success=False,
                root=None,
                layer_used="clarification",
                needs_clarification=True,
                clarification_question="Como posso ajudar você hoje no portal escolar? ✨",
                telemetry={"parse_time_ms": (time.time() - t0) * 1000}
            )

        clean_cmd = command.strip()

        # ── CAMADA A: Ollama Local (JSON Schema Estrito) ────────────────────────
        # Tenta inferência local com Ollama se configurado
        if ollama_url and ollama_model:
            ollama_res = self._try_parse_with_ollama(clean_cmd, ollama_url, ollama_model, known_students)
            if ollama_res:
                ollama_res.telemetry["parse_time_ms"] = (time.time() - t0) * 1000
                return ollama_res

        # ── CAMADA B: Fallback Determinístico Recursivo com Confiança Suficiente ──
        deterministic_res = self._parse_deterministic(clean_cmd, known_students)
        deterministic_res.telemetry["parse_time_ms"] = (time.time() - t0) * 1000
        return deterministic_res

    def _try_parse_with_ollama(
        self,
        command: str,
        ollama_url: str,
        ollama_model: str,
        known_students: Optional[Iterable[str]]
    ) -> Optional[ParseTreeResult]:
        """Tenta chamada estruturada ao Ollama local."""
        try:
            from intent_parser import _call_local_llm
            prompt = (
                f"Analise o comando da professora e retorne estritamente um JSON estruturado com 'kind', 'target', 'entity', 'action_name' e 'children'.\n"
                f"<comando_usuario>\n{command}\n</comando_usuario>"
            )
            res = _call_local_llm(prompt, model=ollama_model, ollama_url=ollama_url)
            if res:
                raw_json, _ = res
                data = json.loads(raw_json)
                if isinstance(data, dict) and "kind" in data:
                    root = IntentNode.from_dict(data)
                    return ParseTreeResult(
                        success=True,
                        root=root,
                        layer_used="ollama_local",
                        needs_clarification=False,
                        telemetry={"model": ollama_model}
                    )
        except Exception:
            pass
        return None

    def _parse_deterministic(
        self,
        command: str,
        known_students: Optional[Iterable[str]] = None
    ) -> ParseTreeResult:
        """
        Fallback determinístico recursivo.
        Aplica os 3 critérios formais de Confiança Suficiente:
        1. Cobertura Integral de Marcadores
        2. Consumo de Sobra Textual
        3. Ausência de Ambiguidade Estrutural e Validação de Roster
        """
        clean = command.strip()

        # Remove saudações e cortesias preambulares
        clean_no_greet = re.sub(
            r"^(?:ol[áa]|oi|ei|rafinha|por\s+favor|pfv|ajuda|ajude|gostaria\s+que\s+voc[êe]\s+(?:acessasse|abrisse|fosse|entrasse)?|gostaria\s+que\s+voc[êe]|preciso\s+que\s+voc[êe]|vou\s+querer\s+que\s+voc[êe]|pode\s+abrir|pode\s+acessar|pode|poderia|\s+)+[,:]?\s*",
            "",
            clean,
            flags=re.IGNORECASE
        ).strip()

        # 1. Checagem de Estrutura Condicional (if/then/else)
        cond_match = self._match_conditional_statement(clean_no_greet)
        if cond_match:
            cond_node, err = self._build_conditional_node(cond_match, known_students)
            if err:
                return ParseTreeResult(
                    success=False,
                    root=None,
                    layer_used="clarification",
                    needs_clarification=True,
                    clarification_question=err,
                    telemetry={"criterion_failed": 3}
                )
            return ParseTreeResult(
                success=True,
                root=cond_node,
                layer_used="deterministic_fallback",
                needs_clarification=False,
                telemetry={"condition_detected": True}
            )

        # 2. Checagem de Lotes Multi-Entidade (batch_item)
        batch_match = self._match_batch_statement(clean_no_greet)
        if batch_match:
            batch_node, err = self._build_batch_node(batch_match, known_students)
            if err:
                return ParseTreeResult(
                    success=False,
                    root=None,
                    layer_used="clarification",
                    needs_clarification=True,
                    clarification_question=err,
                    telemetry={"criterion_failed": 3}
                )
            return ParseTreeResult(
                success=True,
                root=batch_node,
                layer_used="deterministic_fallback",
                needs_clarification=False,
                telemetry={"batch_detected": True}
            )

        # 3. Decomposição Recursiva de N-Saltos de Navegação / Ação
        return self._parse_n_hop_sequence(clean_no_greet, command, known_students)

    def _match_conditional_statement(self, text: str) -> Optional[re.Match]:
        """Detecta orações condicionais do tipo 'se <sujeito> [for] > <valor> [então] <ação> [senão <ação2>]'"""
        pattern = (
            r"^se\s+(.+?)\s+(?:for\s+)?(maior\s+que|menor\s+que|superior\s+a|inferior\s+a|igual\s+a|>|<|>=|<=|==)\s+([0-9.,]+)\s*,?\s*"
            r"(?:ent[ãa]o\s+)?(.+?)(?:\s+sen[ãa]o\s+(.+))?$"
        )
        return re.match(pattern, text, flags=re.IGNORECASE)

    def _build_conditional_node(
        self,
        match: re.Match,
        known_students: Optional[Iterable[str]]
    ) -> tuple[Optional[IntentNode], Optional[str]]:
        subject = match.group(1).strip()
        raw_op = match.group(2).strip().lower()
        raw_val = match.group(3).strip().replace(",", ".")
        then_part = match.group(4).strip()
        else_part = match.group(5).strip() if match.group(5) else None

        # Mapeamento do operador
        op_map: Dict[str, Literal["gt", "lt", "eq", "gte", "lte"]] = {
            "maior que": "gt", ">": "gt", "superior a": "gt",
            "menor que": "lt", "<": "lt", "inferior a": "lt",
            "igual a": "eq", "==": "eq",
            ">=": "gte", "<=": "lte"
        }
        operator = op_map.get(raw_op, "gt")
        try:
            val_float = float(raw_val)
        except ValueError:
            return None, "Não compreendi o valor numérico da condição."

        # Validação de entidade no sujeito se houver aluno citado
        m_aluno = re.search(r"(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)", subject, flags=re.IGNORECASE)
        if m_aluno:
            aluno_nome = m_aluno.group(1).strip()
            ent_err = self._validate_student_roster(aluno_nome, known_students)
            if ent_err:
                return None, ent_err

        # Sub-parsing recursivo dos ramos then e else
        then_res = self._parse_deterministic(then_part, known_students)
        if not then_res.success or not then_res.root:
            return None, then_res.clarification_question or f"Não compreendi o que fazer quando a condição for atendida: '{then_part}'."

        else_node = None
        if else_part:
            else_res = self._parse_deterministic(else_part, known_students)
            if not else_res.success or not else_res.root:
                return None, else_res.clarification_question or f"Não compreendi o que fazer caso contrário: '{else_part}'."
            else_node = else_res.root

        condition = IntentCondition(
            subject=subject,
            operator=operator,
            value=val_float,
            then_branch=then_res.root,
            else_branch=else_node
        )

        return IntentNode(
            kind="condition",
            target=subject,
            condition=condition,
            metadata={"raw_expression": match.group(0)}
        ), None

    def _match_batch_statement(self, text: str) -> Optional[List[tuple[str, str, Optional[str]]]]:
        """
        Detecta comandos em lote com múltiplas entidades.
        Ex: 'para Alice lance nota 8 e para Bernardo lance nota 9'
        """
        pattern = r"para\s+([a-zA-ZÀ-ÿ\s]+?)\s+(?:lance\s+nota\s+([0-9.,]+)|marque\s+falta\s*([0-9]*)|abra\s+o\s+perfil)"
        matches = list(re.finditer(pattern, text, flags=re.IGNORECASE))
        if len(matches) >= 2:
            items = []
            for m in matches:
                student = m.group(1).strip()
                grade = m.group(2)
                falta = m.group(3)
                items.append((student, grade, falta))
            return items
        return None

    def _build_batch_node(
        self,
        batch_items: List[tuple[str, str, Optional[str]]],
        known_students: Optional[Iterable[str]]
    ) -> tuple[Optional[IntentNode], Optional[str]]:
        children: List[IntentNode] = []
        for student, grade, falta in batch_items:
            ent_err = self._validate_student_roster(student, known_students)
            if ent_err:
                return None, ent_err

            if grade:
                child = IntentNode(
                    kind="batch_item",
                    entity=student.title(),
                    action_name="lancar_nota",
                    value=float(grade.replace(",", ".")),
                    target="Nota",
                    metadata={"student": student.title(), "grade": float(grade.replace(",", "."))}
                )
            elif falta is not None:
                q = int(falta) if falta.strip() else 1
                child = IntentNode(
                    kind="batch_item",
                    entity=student.title(),
                    action_name="lancar_falta",
                    value=q,
                    target="Falta",
                    metadata={"student": student.title(), "faltas": q}
                )
            else:
                child = IntentNode(
                    kind="batch_item",
                    entity=student.title(),
                    action_name="abrir_perfil",
                    target="Perfil",
                    metadata={"student": student.title()}
                )
            children.append(child)

        return IntentNode(
            kind="sequence",
            target="Lote de Alunos",
            children=children,
            metadata={"batch_count": len(children)}
        ), None

    def _match_action_clause(
        self,
        clause: str,
        known_students: Optional[Iterable[str]]
    ) -> tuple[Optional[IntentNode], Optional[str]]:
        """Identifica se uma oração representa uma ação operacional (lancar_nota, lancar_falta, marcar_presenca)."""
        # 1. Lançar Nota
        m_nota = re.search(
            r"(?:lan[çc]ar?|lance|coloque|colocar|atribuir|inserir)\s+(?:a\s+)?nota\s+([0-9.,]+)\s+(?:para|pra|pro|de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)",
            clause,
            flags=re.IGNORECASE
        )
        if not m_nota:
            m_nota = re.search(
                r"nota\s+([0-9.,]+)\s+(?:para|pra|pro|de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)",
                clause,
                flags=re.IGNORECASE
            )
        if m_nota:
            val_str = m_nota.group(1).replace(",", ".")
            student = m_nota.group(2).strip().title()
            ent_err = self._validate_student_roster(student, known_students)
            if ent_err:
                return None, ent_err
            try:
                val = float(val_str)
            except ValueError:
                val = None
            return IntentNode(
                kind="action",
                target="Nota",
                entity=student,
                action_name="lancar_nota",
                value=val,
                metadata={"aluno": student, "nota": val}
            ), None

        # 2. Lançar Falta
        m_falta = re.search(
            r"(?:lan[çc]ar?|lance|marcar?|marque|colocar?|coloque|registrar?|registre)\s+(?:(\d+)\s+)?faltas?\s+(?:para|pra|pro|de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)",
            clause,
            flags=re.IGNORECASE
        )
        if m_falta:
            qtd_str = m_falta.group(1)
            student = m_falta.group(2).strip().title()
            ent_err = self._validate_student_roster(student, known_students)
            if ent_err:
                return None, ent_err
            qtd = int(qtd_str) if qtd_str and qtd_str.strip() else 1
            return IntentNode(
                kind="action",
                target="Falta",
                entity=student,
                action_name="lancar_falta",
                value=qtd,
                metadata={"aluno": student, "faltas": qtd}
            ), None

        # 3. Marcar Presença
        m_presenca = re.search(
            r"(?:marcar?|marque|lan[çc]ar?|lance)\s+presen[çc]a\s+(?:para|pra|pro|de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)",
            clause,
            flags=re.IGNORECASE
        )
        if m_presenca:
            student = m_presenca.group(1).strip().title()
            ent_err = self._validate_student_roster(student, known_students)
            if ent_err:
                return None, ent_err
            return IntentNode(
                kind="action",
                target="Presença",
                entity=student,
                action_name="marcar_presenca",
                metadata={"aluno": student}
            ), None

        return None, None

    def _parse_n_hop_sequence(
        self,
        clean_no_greet: str,
        original_command: str,
        known_students: Optional[Iterable[str]]
    ) -> ParseTreeResult:
        """Decompõe cadeias de 1 a N saltos hierárquicos com integridade total."""
        # 1. Sanitiza expressões de cortesia catalogadas
        sanitized = clean_no_greet
        for modifier in COURTESY_AND_DISCOURSE_MODIFIERS:
            sanitized = re.sub(rf"\b{re.escape(modifier)}\b", " ", sanitized, flags=re.IGNORECASE)

        # 2. Divide em cláusulas por conectores sequenciais
        clause_regex = r",|\b(?:e\s+depois|em\s+seguida|e\s+em\s+seguida|e\s+ent[ãa]o|e\s+v[áa]\s+at[ée]|e)\b"
        raw_clauses = re.split(clause_regex, sanitized)

        parsed_nodes: List[IntentNode] = []
        unparsed_clauses: List[str] = []
        parent_id: Optional[str] = None

        for clause in raw_clauses:
            cl = clause.strip()
            if not cl:
                continue

            # Remove verbos de ação do início da cláusula
            cl_target = re.sub(
                r"^(?:abra|abrir|abre|acesse|acessa|acessar|va\s+para|vá\s+para|ir\s+para|v[áa]\s+at[ée]|navegue\s+ate|navegar\s+até|clique\s+em|clicar\s+em|ver|veja|selecione|selecionar|entre\s+em|entrar\s+em|entre)\s+",
                "",
                cl,
                flags=re.IGNORECASE
            ).strip()
            cl_target = re.sub(r"^(?:\b(?:a|o|os|as|aba|seção|secao|guia|menu)\b\s+)?", "", cl_target, flags=re.IGNORECASE).strip()

            if not cl_target:
                continue

            # Checa se a cláusula é uma ação operacional (lancar_nota, lancar_falta, marcar_presenca)
            action_node, act_err = self._match_action_clause(cl, known_students)
            if act_err:
                return ParseTreeResult(
                    success=False,
                    root=None,
                    layer_used="clarification",
                    needs_clarification=True,
                    clarification_question=act_err,
                    telemetry={"criterion_failed": 3}
                )
            if action_node:
                parsed_nodes.append(action_node)
                continue

            # Checa se é acesso a perfil de aluno (ex: "perfil de Alice", "ficha de Pedro")
            m_aluno = re.search(r"^(?:perfil|ficha|cadastro|dados)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)$", cl_target, flags=re.IGNORECASE)
            if not m_aluno:
                m_aluno = re.search(r"^(?:ficha|perfil)\s+([a-zA-ZÀ-ÿ\s]+)$", cl_target, flags=re.IGNORECASE)

            if m_aluno:
                student_name = m_aluno.group(1).strip().title()
                ent_err = self._validate_student_roster(student_name, known_students)
                if ent_err:
                    return ParseTreeResult(
                        success=False,
                        root=None,
                        layer_used="clarification",
                        needs_clarification=True,
                        clarification_question=ent_err,
                        telemetry={"criterion_failed": 3, "unknown_entity": student_name}
                    )
                node = IntentNode(
                    kind="navigate",
                    target=student_name,
                    entity=student_name,
                    action_name="abrir_perfil",
                    metadata={"student": student_name, "parent_id": parent_id}
                )
                parsed_nodes.append(node)
                continue

            # Busca o nó correspondente no catálogo de navegação
            catalog_node = self.nav_model.find_node_by_label(cl_target, parent_id=parent_id)
            if not catalog_node:
                catalog_node = self.nav_model.find_node_by_label(cl_target)

            if catalog_node:
                node = IntentNode(
                    kind="navigate",
                    target=catalog_node.label,
                    action_name="navegar_aba",
                    metadata={"node_id": catalog_node.node_id, "parent_id": catalog_node.parent_id}
                )
                parent_id = catalog_node.node_id
                parsed_nodes.append(node)
            else:
                # Termo não reconhecido no catálogo
                unparsed_clauses.append(cl)

        # ── VERIFICAÇÃO FORMAL DE CONFIANÇA SUFICIENTE ──────────────────────────
        # Critério 1 & 2: Todos os passos foram mapeados e não há sobras textuais substantivas
        if unparsed_clauses or not parsed_nodes:
            # Fallback seguro para Camada C (Esclarecimento Honesto)
            last_understood = parsed_nodes[-1].target if parsed_nodes else "o início"
            sobras = ", ".join(unparsed_clauses)
            msg = (
                f"Entendi até '{last_understood}', mas seu comando parece ter passos adicionais "
                f"que não consegui identificar com certeza: '{sobras}'. Pode confirmar ou simplificar? ✨"
            )
            return ParseTreeResult(
                success=False,
                root=None,
                layer_used="clarification",
                needs_clarification=True,
                clarification_question=msg,
                unparsed_remainder=sobras,
                telemetry={"criterion_failed": 2, "understood_count": len(parsed_nodes), "unparsed": unparsed_clauses}
            )

        # Construção da Árvore Hierárquica
        if len(parsed_nodes) == 1:
            root_tree = parsed_nodes[0]
        else:
            # Constrói uma cadeia linear encadeada em profundidade
            root_tree = parsed_nodes[0]
            curr = root_tree
            for child in parsed_nodes[1:]:
                curr.children = [child]
                curr = child

        return ParseTreeResult(
            success=True,
            root=root_tree,
            layer_used="deterministic_fallback",
            needs_clarification=False,
            telemetry={"nodes_parsed": len(parsed_nodes), "tree_depth": root_tree.depth()}
        )

    def _validate_student_roster(
        self,
        candidate_name: str,
        known_students: Optional[Iterable[str]]
    ) -> Optional[str]:
        """
        Critério 3: Validação Estrita de Roster de Alunos.
        Se known_students for fornecido e candidate_name não coincidir com nenhum aluno,
        retorna mensagem de esclarecimento imediata sem tentar executar com dado inventado.
        """
        if not known_students or not candidate_name:
            return None

        norm_candidate = _normalize_name(candidate_name)
        matched = []
        for st in known_students:
            norm_st = _normalize_name(st)
            if norm_candidate == norm_st:
                matched.append(st)
            elif len(norm_candidate) >= 3 and (norm_candidate in norm_st or norm_st.startswith(norm_candidate)):
                matched.append(st)

        if not matched:
            return (
                f"Não encontrei '{candidate_name}' na turma ativa. "
                f"Gostaria de verificar a lista de alunos da turma? ✨"
            )

        if len(matched) > 1:
            # Ambiguidade / Homônimos
            options = ", ".join(matched)
            return (
                f"Encontrei mais de um aluno com nome compatível com '{candidate_name}' ({options}). "
                f"Pode me dizer o sobrenome completo para eu abrir a ficha correta? ✨"
            )

        return None


def parse_intent_tree(
    command: str,
    known_students: Optional[Iterable[str]] = None,
    nav_model: Optional[HierarchicalNavigationModel] = None,
    ollama_url: Optional[str] = None,
    ollama_model: Optional[str] = None,
) -> ParseTreeResult:
    """Função de conveniência para instanciar e invocar o IntentTreeParser."""
    parser = IntentTreeParser(nav_model=nav_model)
    return parser.parse(
        command=command,
        known_students=known_students,
        ollama_url=ollama_url,
        ollama_model=ollama_model
    )
