"""
sidecar/skills/pathway_compiler_skill.py — Skill de Compilação Autônoma de Trajetórias em Pathways

Converte uma sequência exploratória bem-sucedida do PPAV em uma receita
compilada pronta para ser persistida no Supabase e executada em alta velocidade:
1. Poda passos redundantes (ex: cliques em áreas vazias, scrolls sem efeito).
2. Deriva âncoras semânticas primárias e de fallback para cada nó.
3. Define regras de verificação por passo.
4. Gera a estrutura compatível com portal_pathways e portal_pathway_steps.
"""

import time
from typing import Any, Dict, List, Optional
try:
    from skills.semantic_anchor_skill import SemanticAnchorSkill
except ImportError:
    try:
        from sidecar.skills.semantic_anchor_skill import SemanticAnchorSkill
    except ImportError:
        from .semantic_anchor_skill import SemanticAnchorSkill


class PathwayCompilerSkill:
    """Skill de Síntese e Compilação de Habilidades de Navegação."""

    @staticmethod
    def compile_trajectory(
        portal_id: str,
        intent: str,
        title: str,
        start_url: str,
        raw_steps: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Compila uma lista bruta de passos exploratórios em um pathway estruturado.
        """
        pathway_id = f"path_{portal_id}_{intent}_v{int(time.time())}"
        compiled_steps = []
        step_counter = 1

        for s in raw_steps:
            action_type = (s.get("type") or s.get("action_type") or "CLICK").upper()
            target_desc = s.get("target") or s.get("selector") or s.get("description") or ""

            # Poda de passos inválidos ou sem ação
            if action_type in ("WAIT", "NOOP") and not s.get("timeout_ms") and not s.get("selector"):
                continue

            # Derivação de âncoras semânticas inteligentes
            anchor_data = SemanticAnchorSkill.build_step_anchors(
                action_type=action_type,
                target_desc=target_desc,
                context=s.get("context")
            )

            # Regra de verificação inferida
            verif_rule = s.get("verification_rule") or {}
            if not verif_rule:
                if action_type == "NAVIGATE":
                    target_url = (s.get("payload") or {}).get("url") or ""
                    if target_url:
                        verif_rule = {"url_contains": target_url.split("/")[-1]}
                elif action_type == "CLICK":
                    verif_rule = {"element_visible": True}

            step_obj = {
                "id": f"{pathway_id}_s{step_counter}",
                "pathway_id": pathway_id,
                "step_order": step_counter,
                "action_type": action_type,
                "primary_selector": anchor_data["primary_selector"],
                "anchor_strategy": anchor_data["anchor_strategy"],
                "anchor_value": anchor_data["anchor_value"],
                "fallback_selectors": anchor_data["fallback_selectors"],
                "action_payload": s.get("payload") or s.get("action_payload") or {},
                "verification_rule": verif_rule,
                "retry_policy": {"max_attempts": 2, "backoff_ms": 500}
            }
            compiled_steps.append(step_obj)
            step_counter += 1

        pathway_obj = {
            "id": pathway_id,
            "portal_id": portal_id,
            "intent": intent,
            "title": title,
            "start_url_pattern": start_url,
            "target_state_signature": {
                "compiled_at": time.time(),
                "total_steps": len(compiled_steps)
            },
            "confidence_score": 0.90,  # Confiança inicial de uma rota recém-compilada
            "total_runs": 1,
            "successful_runs": 1,
            "failed_runs": 0,
            "status": "compiled",
            "metadata": metadata or {"compiler": "PathwayCompilerSkill v2.0 (DAG-Enabled)"},
            "steps": compiled_steps
        }
        return pathway_obj

    @classmethod
    def compile_dag_trajectory(
        cls,
        portal_id: str,
        intent: str,
        title: str,
        start_url: str,
        nodes: List[Dict[str, Any]],
        edges: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Compila um grafo direcionado acíclico (DAG) completo com ramificações
        condicionais (ex: tratamento de modais inesperados, etapas alternativas).
        """
        base_pathway = cls.compile_trajectory(
            portal_id=portal_id,
            intent=intent,
            title=title,
            start_url=start_url,
            raw_steps=nodes,
            metadata=metadata
        )

        # Monta arestas do DAG
        dag_edges = edges or []
        if not dag_edges and len(base_pathway["steps"]) > 1:
            # Conexão sequencial default
            for i in range(len(base_pathway["steps"]) - 1):
                dag_edges.append({
                    "from": base_pathway["steps"][i]["id"],
                    "to": base_pathway["steps"][i + 1]["id"],
                    "condition": "on_success"
                })

        base_pathway["is_dag"] = True
        base_pathway["edges"] = dag_edges
        return base_pathway
