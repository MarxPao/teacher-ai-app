"""
sidecar/skills/state_graph_skill.py — Topologia por Grafo de Estados (State-Graph FSM) & Screen Fingerprinting

Resolve o problema da "navegação cega":
1. ScreenStateFingerprinter: Gera um StateID canônico e invariante para a tela ativa baseado em URL pattern,
   contexto educacional ativo (filial, ano letivo, período) e âncoras estruturais de topo.
2. PortalStateGraph: Modela o portal educacional como um Grafo Direcionado de Estados Finitos G = (V, E).
   Calcula o menor caminho de transição (Dijkstra/BFS) do estado atual até a tela de destino,
   reaproveitando o contexto se o usuário já estiver na tela certa ou intermediária.
"""

import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

logger = logging.getLogger("StateGraphSkill")


class ScreenStateFingerprinter:
    """Gera identificadores de estado canônicos (StateID) para telas de portais educacionais."""

    # Padrões comuns de caminhos de portais escolares para normalização
    CANONICAL_ROUTES = [
        (r"/auth/login.*", "auth:login"),
        (r"/auth/selecionar-contexto.*", "auth:selecionar_contexto"),
        (r"/auth/trocar-perfil.*", "auth:trocar_perfil"),
        (r".*/professor_horarios.*", "portal:horarios"),
        (r".*/diario_classe.*", "portal:diario_classe"),
        (r".*/lancamento_notas.*", "portal:lancamento_notas"),
        (r".*/registro_frequencia.*", "portal:registro_frequencia"),
        (r".*/painel_turmas.*", "portal:painel_turmas"),
        (r".*/meus_alunos.*", "portal:meus_alunos"),
        (r".*/recados.*", "portal:recados"),
        (r".*/home.*|.*/dashboard.*|.*/inicio.*", "portal:dashboard")
    ]

    @classmethod
    def normalize_url_pattern(cls, url: str) -> str:
        """Normaliza a URL removendo query params efêmeros, tokens e fragmentos variáveis."""
        if not url:
            return "unknown:blank"
        parsed = urlparse(url)
        path = parsed.path.lower().rstrip("/")
        if not path:
            path = "/"

        # Verifica padrões canônicos
        for pattern, canonical in cls.CANONICAL_ROUTES:
            if re.match(pattern, path):
                return canonical

        # Limpa IDs numéricos ou UUIDs dinâmicos no path
        clean_path = re.sub(r"/[0-9a-fA-F-]{36}(?=/|$)", "/:uuid", path)
        clean_path = re.sub(r"/\d+(?=/|$)", "/:id", clean_path)
        return clean_path.replace("/", ":").strip(":") or "root"

    @classmethod
    def generate_state_id(
        cls,
        url: str,
        active_context: Optional[Dict[str, Any]] = None,
        key_landmarks: Optional[List[str]] = None,
        portal_id: str = "default"
    ) -> str:
        """
        Gera uma assinatura única e determinística para o estado atual da tela.
        Formato: <portal_id>::<route_canonical>::<context_hash>::<landmarks_hash>
        """
        route_sig = cls.normalize_url_pattern(url)
        
        # Contexto ativo (ex: Filial 1, Ano 2026, Turma 8B)
        ctx = active_context or {}
        ctx_keys = sorted([f"{k}={str(v).strip().lower()}" for k, v in ctx.items() if v])
        ctx_str = "|".join(ctx_keys) if ctx_keys else "no_ctx"
        ctx_hash = hashlib.sha256(ctx_str.encode("utf-8")).hexdigest()[:8]

        # Âncoras visíveis de topo (título da página, breadcrumbs, h1/h2)
        landmarks = [lm.strip().lower() for lm in (key_landmarks or []) if lm and len(lm.strip()) >= 3]
        landmarks_str = "|".join(sorted(set(landmarks))) if landmarks else "no_landmarks"
        landmarks_hash = hashlib.sha256(landmarks_str.encode("utf-8")).hexdigest()[:8]

        return f"{portal_id}::{route_sig}::{ctx_hash}::{landmarks_hash}"


class StateTransition:
    """Aresta direcionada no grafo de estados representando uma ação de transição."""

    def __init__(
        self,
        from_state: str,
        to_state: str,
        action_type: str,
        target_selector: str,
        action_payload: Optional[Dict[str, Any]] = None,
        preconditions: Optional[Dict[str, Any]] = None,
        cost: float = 1.0,
        description: str = ""
    ):
        self.from_state = from_state
        self.to_state = to_state
        self.action_type = action_type
        self.target_selector = target_selector
        self.action_payload = action_payload or {}
        self.preconditions = preconditions or {}
        self.cost = cost
        self.description = description

    def to_dict(self) -> Dict[str, Any]:
        return {
            "from_state": self.from_state,
            "to_state": self.to_state,
            "action_type": self.action_type,
            "target_selector": self.target_selector,
            "action_payload": self.action_payload,
            "preconditions": self.preconditions,
            "cost": self.cost,
            "description": self.description
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StateTransition":
        return cls(
            from_state=data["from_state"],
            to_state=data["to_state"],
            action_type=data["action_type"],
            target_selector=data["target_selector"],
            action_payload=data.get("action_payload"),
            preconditions=data.get("preconditions"),
            cost=data.get("cost", 1.0),
            description=data.get("description", "")
        )


class PortalStateGraph:
    """Grafo Direcionado de Estados Finitos (FSM) de um portal educacional."""

    def __init__(self, portal_id: str):
        self.portal_id = portal_id
        # Dicionário de nós: { state_id: {"name": str, "url_pattern": str, "metadata": dict} }
        self.nodes: Dict[str, Dict[str, Any]] = {}
        # Lista de adjacência: { from_state: [StateTransition, ...] }
        self.edges: Dict[str, List[StateTransition]] = {}

    def add_node(self, state_id: str, name: str = "", url_pattern: str = "", metadata: Optional[Dict[str, Any]] = None) -> None:
        """Adiciona um nó de tela/estado ao grafo."""
        if state_id not in self.nodes:
            self.nodes[state_id] = {
                "id": state_id,
                "name": name or state_id,
                "url_pattern": url_pattern,
                "metadata": metadata or {}
            }
        if state_id not in self.edges:
            self.edges[state_id] = []

    def add_transition(self, transition: StateTransition) -> None:
        """Adiciona uma aresta direcionada com a ação de transição entre estados."""
        self.add_node(transition.from_state)
        self.add_node(transition.to_state)
        
        # Evita transições duplicadas idênticas
        for existing in self.edges[transition.from_state]:
            if (existing.to_state == transition.to_state and 
                existing.action_type == transition.action_type and
                existing.target_selector == transition.target_selector):
                return
        self.edges[transition.from_state].append(transition)

    def find_shortest_path(self, start_state: str, target_state: str) -> Optional[List[StateTransition]]:
        """
        Calcula a menor sequência de transições do estado atual até o estado desejado usando Dijkstra.
        Retorna a lista de StateTransition ou None se não houver caminho.
        """
        if start_state == target_state:
            return []

        if start_state not in self.nodes or target_state not in self.nodes:
            # Se não conhece o nó exato, busca por aproximação de rota canônica
            start_approx = self._find_approximate_node(start_state)
            target_approx = self._find_approximate_node(target_state)
            if start_approx and target_approx:
                start_state = start_approx
                target_state = target_approx
            else:
                return None

        # Dijkstra
        distances: Dict[str, float] = {node: float("inf") for node in self.nodes}
        previous_edge: Dict[str, Optional[StateTransition]] = {node: None for node in self.nodes}
        distances[start_state] = 0.0

        unvisited: Set[str] = set(self.nodes.keys())

        while unvisited:
            # Seleciona o nó não visitado com menor distância
            current = min(unvisited, key=lambda n: distances[n])
            if distances[current] == float("inf") or current == target_state:
                break
            unvisited.remove(current)

            for edge in self.edges.get(current, []):
                neighbor = edge.to_state
                if neighbor in unvisited:
                    new_dist = distances[current] + edge.cost
                    if new_dist < distances[neighbor]:
                        distances[neighbor] = new_dist
                        previous_edge[neighbor] = edge

        if distances[target_state] == float("inf"):
            return None

        # Reconstrói a rota
        path: List[StateTransition] = []
        curr = target_state
        while curr != start_state:
            edge = previous_edge.get(curr)
            if not edge:
                break
            path.append(edge)
            curr = edge.from_state

        path.reverse()
        return path

    def _find_approximate_node(self, state_id: str) -> Optional[str]:
        """Localiza um nó registrado que coincida com a mesma rota canônica."""
        parts = state_id.split("::")
        if len(parts) >= 2:
            canonical_route = parts[1]
            for node_id in self.nodes:
                node_parts = node_id.split("::")
                if len(node_parts) >= 2 and node_parts[1] == canonical_route:
                    return node_id
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "portal_id": self.portal_id,
            "nodes": self.nodes,
            "transitions": [
                edge.to_dict() for edge_list in self.edges.values() for edge in edge_list
            ]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PortalStateGraph":
        graph = cls(portal_id=data.get("portal_id", "default"))
        for node_id, node_info in data.get("nodes", {}).items():
            graph.add_node(node_id, name=node_info.get("name", ""), url_pattern=node_info.get("url_pattern", ""), metadata=node_info.get("metadata"))
        for t_dict in data.get("transitions", []):
            graph.add_transition(StateTransition.from_dict(t_dict))
        return graph
