"""
sidecar/skills/semantic_anchor_skill.py — Skill de Descoberta de Âncoras Semânticas

Deriva seletores multi-camada resilientes contra quebras de layout e mudanças de classes CSS:
- Camada 1: Árvore de Acessibilidade (AXTree: role, name, aria-label).
- Camada 2: Rótulos associados (<label for="...">, aria-labelledby, placeholder).
- Camada 3: Âncoras contextuais relativas (ex: tr contendo "Hugo" -> input[type=text]).
- Camada 4: Seletores CSS estruturais estáticos (sem IDs efêmeros).
"""

import re
from typing import Any, Dict, List, Optional


class SemanticAnchorSkill:
    """Skill de Resiliência de Seletores e Âncoras Semânticas."""

    @staticmethod
    def derive_anchors_for_element(element_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Gera uma âncora primária e uma lista ordenada de fallbacks para um elemento.
        """
        tag = (element_info.get("tag") or "button").lower()
        role = element_info.get("role") or ""
        text = (element_info.get("text") or "").strip()
        aria_label = element_info.get("aria_label") or element_info.get("aria-label") or ""
        name_attr = element_info.get("name") or ""
        id_attr = element_info.get("id") or ""
        row_context = element_info.get("row_context") or ""  # Nome do aluno ou rótulo da linha

        primary_anchor = None
        strategy = "css_selector"
        fallbacks: List[Dict[str, str]] = []

        # 1. Prioridade A: Aria-Label ou Acessibilidade Explícita
        if aria_label:
            primary_anchor = f'[aria-label="{aria_label}"]'
            strategy = "aria_label"
        elif role and text:
            primary_anchor = f'{tag}[role="{role}"]:has-text("{text}")'
            strategy = "semantic_role"
        elif text and len(text) <= 50 and not re.search(r"[\r\n]", text):
            # 2. Prioridade B: Texto Estável
            primary_anchor = f'{tag}:has-text("{text}")'
            strategy = "text_match"
        elif name_attr and not re.search(r"\d{6,}", name_attr):
            # 3. Prioridade C: Atributo name sem ID efêmero
            primary_anchor = f'{tag}[name="{name_attr}"]'
            strategy = "name_attribute"
        elif id_attr and not re.search(r"\d{5,}|[a-f0-9]{8,}", id_attr):
            # 4. Prioridade D: ID não randômico
            primary_anchor = f'#{id_attr}'
            strategy = "css_id"
        else:
            primary_anchor = tag
            strategy = "tag_generic"

        # GERAÇÃO DE FALLBACKS (Garantia de Não-Ruptura)
        if text and strategy != "text_match":
            fallbacks.append({"strategy": "text_match", "selector": f'{tag}:has-text("{text}")'})

        if row_context:
            # Seletor relativo na linha da tabela
            fallbacks.append({
                "strategy": "relative_row_context",
                "selector": f'tr:has-text("{row_context}") {tag}'
            })

        if aria_label and strategy != "aria_label":
            fallbacks.append({"strategy": "aria_label", "selector": f'[aria-label*="{aria_label}"]'})

        if name_attr and strategy != "name_attribute":
            fallbacks.append({"strategy": "name_attribute", "selector": f'{tag}[name="{name_attr}"]'})

        if id_attr and strategy != "css_id":
            fallbacks.append({"strategy": "css_selector", "selector": f'#{id_attr}'})

        return {
            "primary_selector": primary_anchor,
            "anchor_strategy": strategy,
            "anchor_value": aria_label or text or name_attr or primary_anchor,
            "fallback_selectors": fallbacks
        }

    @staticmethod
    def build_step_anchors(action_type: str, target_desc: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Cria uma definição de âncoras para um passo do Pathway."""
        ctx = context or {}
        elem_info = {
            "tag": "input" if action_type == "FILL" else "button" if action_type == "CLICK" else "a",
            "text": target_desc,
            "row_context": ctx.get("student_name") or ctx.get("row_label"),
            "name": ctx.get("field_name"),
            "aria_label": ctx.get("aria_label")
        }
        return SemanticAnchorSkill.derive_anchors_for_element(elem_info)
