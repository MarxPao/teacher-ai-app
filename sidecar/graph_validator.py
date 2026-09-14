"""
graph_validator.py — Validador Estático de Segurança do Grafo em Python (Lote 1)

Garante que nenhum grafo contendo ações de escrita (WRITE) ou submissão (CLICK de submit)
possa ser salvo ou executado sem um nó de CHECKPOINT humano mandatório que o preceda.
"""

from typing import Dict, List, Set, Tuple, Any

class UnsafeGraphError(Exception):
    """Lançada quando um grafo viola regras inegociáveis de segurança."""
    pass

def is_risk_node(node: Dict[str, Any]) -> bool:
    """
    Retorna True se o nó for de alto risco (escrita ou submissão).
    
    ORIGEM DA CLASSIFICAÇÃO:
    - (a) Manual e explícita na definição da Skill (v0.1 / v1). Em fases futuras,
      poderá ser pré-sugerida por heurísticas do gravador (ex: button[type=submit]),
      mas a validação do grafo exige sempre a declaração explícita do valor booleano.
      
    POSTURA DE SEGURANÇA (Fail-Safe):
    - WRITE é sempre considerado risco.
    - CLICK é considerado risco por padrão (fail-safe), a menos que
      `is_submit_action` esteja expressamente definido como False.
    """
    node_type = node.get("type")
    params = node.get("params", {}) or {}
    
    if node_type == "WRITE":
        if params.get("is_filter") is True or params.get("is_submit_action") is False:
            return False
        return True
    if node_type == "CLICK":
        # Fail-safe: apenas False explícito isenta o CLICK do checkpoint
        return params.get("is_submit_action") is not False
    return False

def find_paths_without_checkpoint(
    nodes: Dict[str, Any],
    start_id: str,
    target_id: str,
    visited: Set[str],
    current_path: List[str]
) -> List[List[str]]:
    """Busca em profundidade caminhos até target_id sem encontrar nenhum CHECKPOINT."""
    if start_id == target_id:
        return [current_path + [target_id]]
    
    node = nodes.get(start_id)
    if not node:
        return []
    
    # Se o nó for CHECKPOINT, este caminho está seguro e protegido!
    if node.get("type") == "CHECKPOINT":
        return []
    
    new_visited = set(visited)
    new_visited.add(start_id)
    new_path = current_path + [start_id]
    
    results: List[List[str]] = []
    next_candidates = []
    
    on_success = node.get("on_success")
    if on_success and on_success in nodes:
        next_candidates.append(on_success)
    on_fail = node.get("on_fail")
    if on_fail and on_fail in nodes:
        next_candidates.append(on_fail)
        
    for next_id in next_candidates:
        if next_id not in new_visited:
            sub = find_paths_without_checkpoint(nodes, next_id, target_id, new_visited, new_path)
            results.extend(sub)
            
    return results

def validate_skill_graph(graph: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Valida as regras de segurança estática do grafo.
    Retorna (is_valid, errors).
    """
    errors: List[str] = []
    
    if hasattr(graph, "model_dump"):
        graph = graph.model_dump()
    elif hasattr(graph, "dict"):
        graph = graph.dict()
        
    if not isinstance(graph, dict):
        return False, ["Grafo inválido: payload deve ser um objeto dicionário."]
        
    entry_node = graph.get("entry_node")
    nodes = graph.get("nodes") or {}
    
    if not entry_node:
        errors.append("Nó de entrada 'entry_node' é obrigatório.")
        return False, errors
        
    if entry_node not in nodes:
        errors.append(f"Nó de entrada 'entry_node' ('{entry_node}') não foi encontrado na lista de nós.")
        return False, errors
        
    allowed_terminals = {"ABORT", "ASK_HUMAN", None}
    for nid, n in nodes.items():
        if n.get("type") == "CLICK":
            params = n.get("params", {}) or {}
            is_submit = params.get("is_submit_action")
            if is_submit is None or not isinstance(is_submit, bool):
                errors.append(
                    f"VIOLAÇÃO DE SEGURANÇA: O nó CLICK '{nid}' deve declarar explicitamente o campo 'is_submit_action' (true ou false). Ausência de classificação não é permitida."
                )
        succ = n.get("on_success")
        fail = n.get("on_fail")
        if succ and succ not in nodes and succ not in allowed_terminals:
            errors.append(f"Nó '{nid}': on_success aponta para nó inexistente '{succ}'.")
        if fail and fail not in nodes and fail not in allowed_terminals:
            errors.append(f"Nó '{nid}': on_fail aponta para nó inexistente '{fail}'.")
            
    if errors:
        return False, errors
        
    # Análise de caminhos de risco
    risk_node_ids = [nid for nid, n in nodes.items() if is_risk_node(n)]
    
    if risk_node_ids:
        has_checkpoint = any(n.get("type") == "CHECKPOINT" for n in nodes.values())
        if not has_checkpoint:
            errors.append(
                f"VIOLAÇÃO DE SEGURANÇA: Grafo possui ações de risco {risk_node_ids}, "
                f"mas nenhum nó 'CHECKPOINT' foi declarado."
            )
            return False, errors
            
        for rid in risk_node_ids:
            unprotected_paths = find_paths_without_checkpoint(nodes, entry_node, rid, set(), [])
            if unprotected_paths:
                path_str = " -> ".join(unprotected_paths[0])
                errors.append(
                    f"VIOLAÇÃO DE SEGURANÇA: O nó de risco '{rid}' pode ser alcançado sem passar por CHECKPOINT prévio. "
                    f"Caminho vulnerável: {path_str}"
                )
                
    return (len(errors) == 0), errors

def assert_graph_safe(graph: Dict[str, Any]) -> None:
    """Levanta UnsafeGraphError caso o grafo não passe na validação estática."""
    is_valid, errors = validate_skill_graph(graph)
    if not is_valid:
        raise UnsafeGraphError("Grafo rejeitado por violar regras de segurança: " + " | ".join(errors))


class PoisonedMemoryDetectedError(UnsafeGraphError):
    """Lançada quando ações do grafo violam o alinhamento semântico com a intenção original."""
    pass


def verify_skillgraph_alignment(
    task_id: str,
    actions_or_nodes: Union[List[Dict[str, Any]], Dict[str, Any]],
    original_intent: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[str]]:
    """
    Verifica se o trace descoberto ou nós do grafo correspondem fielmente à intenção
    pedida pela professora. Protege contra envenenamento de memória (Poisoned Memory)
    por Prompt Injection Indireto vindo de páginas do portal.
    """
    import re
    actions: List[Dict[str, Any]] = []
    if isinstance(actions_or_nodes, list):
        actions = actions_or_nodes
    elif isinstance(actions_or_nodes, dict):
        for nid, n in actions_or_nodes.items():
            if isinstance(n, dict):
                act_type = n.get("type")
                params = n.get("params", {}) or {}
                actions.append({
                    "action_type": act_type,
                    "selector": params.get("selector", ""),
                    "value": params.get("value", ""),
                    "description": n.get("description", "")
                })

    orig = original_intent or {}
    params = orig.get("parametros") or {}
    objeto_alvo = str(orig.get("objeto_alvo") or params.get("objeto_alvo") or task_id or "").lower()
    clean_task = str(task_id or "").lower()
    target_student = str(orig.get("aluno") or params.get("aluno") or "").lower().strip()

    # Identifica o domínio da intenção original
    is_nota_intent = any(k in clean_task or k in objeto_alvo for k in ["nota", "grade", "avaliacao", "pontuacao"])
    is_falta_intent = any(k in clean_task or k in objeto_alvo for k in ["falta", "ausencia", "frequencia"])
    is_presenca_intent = any(k in clean_task or k in objeto_alvo for k in ["presenca", "chamada"])
    is_read_intent = clean_task == "read_roster" or any(k in clean_task or k in objeto_alvo for k in ["ler", "roster", "alunos", "estudantes", "consultar"])

    write_actions = [a for a in actions if a.get("action_type") in ("WRITE", "CHECKBOX")]
    click_actions = [a for a in actions if a.get("action_type") == "CLICK"]

    # 1. Regra de Conflito: Intenção de NOTA não pode executar escrita em FALTAS ou PRESENÇAS
    if is_nota_intent and not (is_falta_intent or is_presenca_intent):
        for act in write_actions + click_actions:
            sel = str(act.get("selector", "")).lower()
            desc = str(act.get("description", "")).lower()
            if any(k in sel or k in desc for k in ["presenca_", "falta_", "ausencia", "presenca", "falta"]) and not ("nota" in sel or "nota" in desc):
                if act.get("action_type") == "WRITE" or ("presenca" in sel or "falta" in sel):
                    return False, f"Ação anômala '{sel}' (modificação de frequência/falta) conflita com a intenção original de lançamento de nota."

    # 2. Regra de Conflito: Intenção de FALTA/PRESENÇA não pode escrever em NOTA
    if (is_falta_intent or is_presenca_intent) and not is_nota_intent:
        for act in write_actions:
            sel = str(act.get("selector", "")).lower()
            desc = str(act.get("description", "")).lower()
            if any(k in sel or k in desc for k in ["nota_", "grade_", "avaliacao"]) and not "falta" in sel:
                return False, f"Ação anômala '{sel}' (lançamento de nota) conflita com a intenção original de registro de frequência."

    # 3. Regra de Isolamento de Aluno: Tarefa individual não pode manipular múltiplos alunos em massa
    if target_student:
        modified_ids = []
        for act in write_actions:
            sel = str(act.get("selector", "")).lower()
            matches = re.findall(r"(?:presenca|nota)_(\d+)", sel)
            if matches:
                modified_ids.extend(matches)
        if len(set(modified_ids)) > 2:
            return False, f"Ação em massa detectada ({len(set(modified_ids))} alunos atingidos) para uma tarefa destinada exclusivamente a '{target_student}'."

    # 4. Regra de Operações de Leitura
    if is_read_intent:
        if len(write_actions) > 0:
            return False, f"Ações de escrita ({len(write_actions)}) detectadas em uma intenção estritamente de leitura ('{clean_task}')."

    return True, None


def assert_skillgraph_aligned(
    task_id: str,
    actions_or_nodes: Union[List[Dict[str, Any]], Dict[str, Any]],
    original_intent: Optional[Dict[str, Any]] = None
) -> None:
    """Levanta PoisonedMemoryDetectedError se o trace ou grafo não passar no alinhamento de intenção."""
    is_aligned, error_msg = verify_skillgraph_alignment(task_id, actions_or_nodes, original_intent)
    if not is_aligned:
        raise PoisonedMemoryDetectedError(error_msg or "Violação de alinhamento de intenção (memória envenenada).")

