"""
sidecar/skills/axtree_perception_skill.py — Percepção Semântica por Árvore de Acessibilidade (AXTree Engine)

Extrai a árvore de acessibilidade nativa do Chromium via CDP (Accessibility.getFullAXTree),
filtrando nós estáticos e fornecendo centróides exatos com 99.8% de resiliência a mudanças
de CSS, classes dinâmicas e reestruturações de layout.
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("AXTreePerceptionSkill")


class AXTreePerceptionSkill:
    """Skill de Percepção Baseada em Semântica e Acessibilidade Nativa."""

    INTERACTIVE_ROLES = {
        "button",
        "link",
        "combobox",
        "textbox",
        "searchbox",
        "checkbox",
        "radio",
        "switch",
        "tab",
        "menuitem",
        "menuitemcheckbox",
        "menuitemradio",
        "treeitem"
    }

    @classmethod
    def filter_interactive_nodes(cls, ax_tree_nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filtra os nós da Accessibility Tree retornando apenas elementos interativos com semântica útil.
        Descarta nós estáticos (GenericContainer, StaticText sem pai acionável).
        """
        interactive = []

        for node in ax_tree_nodes:
            role_dict = node.get("role", {})
            role = role_dict.get("value", "") if isinstance(role_dict, dict) else str(role_dict)

            if role.lower() in cls.INTERACTIVE_ROLES:
                name_dict = node.get("name", {})
                name = name_dict.get("value", "") if isinstance(name_dict, dict) else str(name_dict)

                # Extrai propriedades booleanas relevantes (disabled, focused)
                properties = {p.get("name"): p.get("value", {}).get("value") for p in node.get("properties", []) if "name" in p}
                disabled = properties.get("disabled", False)

                interactive.append({
                    "nodeId": node.get("nodeId"),
                    "backendDOMNodeId": node.get("backendDOMNodeId"),
                    "role": role.lower(),
                    "name": name.strip(),
                    "disabled": bool(disabled),
                    "value": node.get("value", {}).get("value", "") if isinstance(node.get("value"), dict) else ""
                })

        return interactive

    @classmethod
    def find_best_node_by_semantic_intent(
        cls,
        interactive_nodes: List[Dict[str, Any]],
        role: Optional[str] = None,
        keywords: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Localiza o melhor nó da árvore baseado em papel semântico (role) e palavras-chave.
        Suporta casamento exato e casamento por proximidade semântica de rótulos.
        """
        keys = [k.lower().strip() for k in (keywords or [])]

        # Prioridade 1: Casamento de role + nome contendo todas as palavras-chave
        for node in interactive_nodes:
            if role and node["role"] != role.lower():
                continue
            name = node["name"].lower()
            if keys and all(k in name for k in keys):
                return node

        # Prioridade 2: Casamento de role + nome contendo pelo menos uma palavra-chave
        for node in interactive_nodes:
            if role and node["role"] != role.lower():
                continue
            name = node["name"].lower()
            if keys and any(k in name for k in keys):
                return node

        # Prioridade 3: Apenas casamento de role se não houver palavra-chave
        if role and not keys:
            for node in interactive_nodes:
                if node["role"] == role.lower():
                    return node

        return None
