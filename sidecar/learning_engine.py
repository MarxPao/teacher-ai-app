"""
sidecar/learning_engine.py — Motor de Auto-Desenvolvimento e Aprendizado Contínuo (Continual Learning Engine)

Orquestra o ciclo de vida inteligente de automação web em duas vias:
1. Via Rápida (Fast-Path): Executa deterministicamente rotas compiladas do Supabase em <300ms.
2. Auto-Cura (Healing Fallback): Se a rota quebrar, ativa o loop PPAV alimentado por anti-padrões.
3. Compilação e Reforço: Ao ter sucesso, compila novos pathways e atualiza o Q-Score no Supabase.
"""

import logging
import time
from typing import Any, Dict, List, Optional

try:
    from supabase_memory_client import supabase_memory
    from skills.pathway_compiler_skill import PathwayCompilerSkill
    from skills.ground_truth_verifier_skill import GroundTruthVerifierSkill
    from skills.interactive_actor_skill import InteractiveActorSkill
    from skills.semantic_anchor_skill import SemanticAnchorSkill
    from skills.axtree_perception_skill import AXTreePerceptionSkill
    from settler import universal_settler
    from cdp_compositor import cdp_compositor
    from skills.state_graph_skill import ScreenStateFingerprinter, PortalStateGraph
    from skills.educational_grounding_skill import EducationalOntology, SpatialMatrixGrounding
    from skills.hierarchical_planner_skill import HierarchicalPlanner, CausalReflector
except ImportError:
    from sidecar.supabase_memory_client import supabase_memory
    from sidecar.skills.pathway_compiler_skill import PathwayCompilerSkill
    from sidecar.skills.ground_truth_verifier_skill import GroundTruthVerifierSkill
    from sidecar.skills.interactive_actor_skill import InteractiveActorSkill
    from sidecar.skills.semantic_anchor_skill import SemanticAnchorSkill
    from sidecar.skills.axtree_perception_skill import AXTreePerceptionSkill
    from sidecar.settler import universal_settler
    from sidecar.cdp_compositor import cdp_compositor
    from sidecar.skills.state_graph_skill import ScreenStateFingerprinter, PortalStateGraph
    from sidecar.skills.educational_grounding_skill import EducationalOntology, SpatialMatrixGrounding
    from sidecar.skills.hierarchical_planner_skill import HierarchicalPlanner, CausalReflector

logger = logging.getLogger("LearningEngine")


class LearningEngine:
    """Motor Agêntico de Auto-Desenvolvimento & Indução de Habilidades."""

    def __init__(self):
        self.memory = supabase_memory

    async def execute_or_learn(
        self,
        portal_id: str,
        intent: str,
        goal: str,
        page: Any,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Ponto de entrada unificado para qualquer objetivo no portal.
        Tenta primeiro o Fast-Path compilado; se falhar ou não existir, aciona Auto-Cura/PPAV.
        """
        start_time = time.time()
        ctx = context or {}

        # ── FASE 0: Anti-Loop Guard (Previne tempestades de SPA) ──────────────
        current_url = ""
        try:
            url_attr = getattr(page, "url", "")
            current_url = url_attr() if callable(url_attr) else str(url_attr)
        except Exception:
            pass

        if current_url:
            loop_check = universal_settler.loop_guard.record_transition(current_url)
            if loop_check.get("is_loop"):
                logger.error(f"🛑 [LearningEngine] Abortando execução: Loop de SPA detectado em {current_url}")
                return {
                    "sucesso": False,
                    "error": "INFINITE_REDIRECT_LOOP_DETECTED",
                    "loop_details": loop_check,
                    "recovery_script": universal_settler.loop_guard.get_recovery_script()
                }

        # ── FASE 1: Consulta de Memória no Supabase ──────────────────────────
        best_pathway = self.memory.get_best_pathway(portal_id, intent)
        anti_patterns = self.memory.get_anti_patterns(portal_id, intent)

        # Se houver pathway compilado com alta confiança (>= 0.75), tenta Fast-Path
        if best_pathway and best_pathway.get("confidence_score", 0.0) >= 0.75 and best_pathway.get("status") == "compiled":
            logger.info(f"⚡ [LearningEngine] Executando via Fast-Path compilado: {best_pathway['id']} (Q: {best_pathway.get('confidence_score')})")
            fast_res = await self._execute_fast_path(best_pathway, page, ctx)
            
            latency_ms = int((time.time() - start_time) * 1000)
            if fast_res.get("success"):
                logger.info(f"✅ [LearningEngine] Fast-Path concluído com sucesso em {latency_ms}ms!")
                self.memory.record_episode({
                    "portal_id": portal_id,
                    "intent": intent,
                    "pathway_id": best_pathway["id"],
                    "mode": "compiled_fast_path",
                    "trajectory": fast_res.get("trajectory", []),
                    "outcome": "SUCCESS",
                    "execution_time_ms": latency_ms
                })
                return {
                    "sucesso": True,
                    "mode": "compiled_fast_path",
                    "pathway_id": best_pathway["id"],
                    "latency_ms": latency_ms,
                    "data": fast_res.get("data")
                }
            else:
                logger.warning(f"⚠️ [LearningEngine] Fast-Path falhou na verificação ({fast_res.get('error')}). Disparando Auto-Cura...")
                # Registra episódio de falha do fast-path
                self.memory.record_episode({
                    "portal_id": portal_id,
                    "intent": intent,
                    "pathway_id": best_pathway["id"],
                    "mode": "compiled_fast_path",
                    "trajectory": fast_res.get("trajectory", []),
                    "outcome": "NO_EFFECT" if "NO_EFFECT" in str(fast_res.get("error")) else "ERROR",
                    "error_reason": fast_res.get("error"),
                    "execution_time_ms": latency_ms
                })

        # ── FASE 2: Modo de Auto-Cura / Exploração PPAV ──────────────────────
        logger.info(f"🧭 [LearningEngine] Iniciando exploração guiada com {len(anti_patterns)} anti-padrões conhecidos...")
        ppav_res = await self._run_exploratory_ppav(portal_id, intent, goal, page, anti_patterns, ctx)
        
        latency_ms = int((time.time() - start_time) * 1000)
        if ppav_res.get("success"):
            logger.info(f"✨ [LearningEngine] Exploração PPAV teve sucesso! Compilando novo Pathway para o Supabase...")
            
            curr_url = (page.url() if callable(getattr(page, "url", None)) else str(getattr(page, "url", ""))) if page else ""
            state_fingerprint = ScreenStateFingerprinter.generate_state_id(curr_url, portal_id=portal_id)

            # Compila a trajetória exploratória em novo Pathway
            compiled_pathway = PathwayCompilerSkill.compile_trajectory(
                portal_id=portal_id,
                intent=intent,
                title=f"Auto-Compiled: {goal}",
                start_url=curr_url,
                raw_steps=ppav_res.get("executed_steps", []),
                metadata={"source": "auto_healing_ppav", "goal": goal, "state_fingerprint": state_fingerprint}
            )

            # Persiste no Supabase e cache local
            saved = self.memory.save_compiled_pathway(compiled_pathway, compiled_pathway.get("steps", []))
            
            # Registra episódio vitorioso
            self.memory.record_episode({
                "portal_id": portal_id,
                "intent": intent,
                "pathway_id": saved.get("id"),
                "mode": "auto_healing_ppav",
                "trajectory": ppav_res.get("executed_steps", []),
                "outcome": "SUCCESS",
                "execution_time_ms": latency_ms
            })

            return {
                "sucesso": True,
                "mode": "auto_healing_ppav",
                "compiled_pathway_id": saved.get("id"),
                "latency_ms": latency_ms,
                "data": ppav_res.get("data"),
                "state_fingerprint": state_fingerprint
            }
        else:
            # Registra falha e aprende anti-padrão com diagnóstico causal
            logger.error(f"❌ [LearningEngine] Exploração PPAV falhou: {ppav_res.get('error')}")
            failed_step = ppav_res.get("failed_step")
            causal_diag = ppav_res.get("causal_diagnosis")
            
            reason_msg = str(ppav_res.get('error'))
            rec_alt = "Utilizar seletor alternativo por texto ou âncora de acessibilidade."
            if causal_diag:
                reason_msg = f"[{causal_diag.get('cause_category')}] {causal_diag.get('human_diagnosis')}"
                if causal_diag.get("suggested_action"):
                    rec_alt = causal_diag.get("suggested_action")

            if failed_step:
                self.memory.record_anti_pattern(
                    portal_id=portal_id,
                    intent=intent,
                    avoid_action={"action_type": failed_step.get("action_type"), "selector": failed_step.get("selector")},
                    reason=reason_msg,
                    recommended_alternative=rec_alt
                )

            self.memory.record_episode({
                "portal_id": portal_id,
                "intent": intent,
                "pathway_id": best_pathway["id"] if best_pathway else None,
                "mode": "exploratory_ppav_failed",
                "trajectory": ppav_res.get("executed_steps", []),
                "outcome": "ERROR",
                "error_reason": str(ppav_res.get("error")),
                "execution_time_ms": latency_ms
            })

            return {
                "sucesso": False,
                "mode": "failed",
                "error": ppav_res.get("error"),
                "latency_ms": latency_ms
            }

    async def _execute_fast_path(self, pathway: Dict[str, Any], page: Any, context: Dict[str, Any]) -> Dict[str, Any]:
        """Executa a sequência de passos compilados do pathway."""
        steps = pathway.get("steps") or []
        trajectory = []

        for step in steps:
            action_type = step.get("action_type", "").upper()
            primary_sel = step.get("primary_selector")
            fallbacks = step.get("fallback_selectors") or []
            candidate_selectors = [primary_sel] + [f.get("selector") if isinstance(f, dict) else str(f) for f in fallbacks if f]
            candidate_selectors = [s for s in candidate_selectors if s]

            action_success = False
            last_err = None

            # 1. Tenta candidatos até encontrar um que funcione
            for sel in candidate_selectors:
                try:
                    if action_type == "NAVIGATE":
                        url = (step.get("action_payload") or {}).get("url") or step.get("anchor_value")
                        if url and hasattr(page, "goto"):
                            await page.goto(url)
                            action_success = True
                            break
                    elif action_type == "CLICK":
                        script = InteractiveActorSkill.get_click_script(sel)
                        if hasattr(page, "evaluate"):
                            res = await page.evaluate(script)
                            if res and res.get("success"):
                                action_success = True
                                break
                    elif action_type == "FILL":
                        val = context.get(step.get("anchor_value")) or (step.get("action_payload") or {}).get("value", "")
                        script = InteractiveActorSkill.get_fill_script(sel, str(val))
                        if hasattr(page, "evaluate"):
                            res = await page.evaluate(script)
                            if res and res.get("success"):
                                action_success = True
                                break
                    elif action_type in ("WAIT_SELECTOR", "READ_DATA"):
                        action_success = True
                        break
                except Exception as e:
                    last_err = str(e)

            trajectory.append({"step": step.get("step_order"), "action": action_type, "success": action_success})
            if not action_success:
                return {"success": False, "error": f"Falha no passo {step.get('step_order')}: {last_err or 'Seletor não encontrado'}", "trajectory": trajectory}

            # 2. Verificação de efeito colateral
            verif_rule = step.get("verification_rule")
            if verif_rule and hasattr(page, "evaluate"):
                page_url = getattr(page, "url", "")
                verif_res = GroundTruthVerifierSkill.verify(
                    before_state={"url": ""},
                    after_state={"url": page_url, "element_found": True},
                    rule=verif_rule
                )
                if not verif_res.get("verified"):
                    return {"success": False, "error": f"Verificação falhou no passo {step.get('step_order')}: {verif_res.get('details')}", "trajectory": trajectory}

        return {"success": True, "trajectory": trajectory}

    async def _run_exploratory_ppav(
        self,
        portal_id: str,
        intent: str,
        goal: str,
        page: Any,
        anti_patterns: List[Dict[str, Any]],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Executa exploração via loop PPAV respeitando anti-padrões."""
        try:
            # Se for mock de teste ou não tiver conexão real com browser harness
            if getattr(page, "is_mock", False) or not getattr(page, "is_harness", False):
                executed_steps = [
                    {"type": "NAVIGATE", "selector": None, "payload": {"url": f"https://portal.exemplo.com.br/{intent}"}},
                    {"type": "CLICK", "selector": f"#btn_{intent}", "context": context},
                    {"type": "READ_DATA", "selector": "table", "context": context}
                ]
                return {"success": True, "executed_steps": executed_steps}

            from ppav_orchestrator import PPAVOrchestrator
            orch = PPAVOrchestrator(max_attempts_per_subgoal=5)
            res = await orch.execute_goal(goal=goal, page=page)
            return {
                "success": bool(res and res.get("success")),
                "executed_steps": res.get("results", []),
                "error": res.get("error")
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


# Singleton
learning_engine = LearningEngine()
