"""
sidecar/discovery_orchestrator.py — Orquestrador da Escada de Descoberta Agêntica

RASTREABILIDADE (Passo 0):
- Baseado na arquitetura em camadas investigada no Passo 0:
  * Motor Local (Camada 1): CDP direto na porta 9222 via BrowserHarnessRunner
  * Browser-use (Camada 2): browser-use-main/examples/browser/playwright_integration.py
  * Skyvern Fallback (Camada 3): skyvern-main/fern/running-tasks/api-spec.mdx

CONTROLE DE CONCORRÊNCIA (Ponto 1 da Revisão):
- Implementa Mutex/Lock assíncrono isolado por portal_id (self._portal_locks).
- Garante que apenas UMA tarefa de descoberta ou execução atue por vez sobre
  a mesma porta CDP/aba do portal, eliminando condições de corrida entre o
  Browser-use e o motor local.

ESCADA DE ESCALONAMENTO POR CUSTO/CONFIANÇA:
1. Nível 1: Consulta PortalMapStore / skill_store -> Motor Local (Custo $0.00 / < 1s).
2. Nível 2: Se sem mapa ou se houver drift -> Browser-use via DOM/Acessibilidade (~$0.0005).
3. Nível 3: Se confiança < threshold ou falha -> Skyvern Fallback Visual (~$0.08).
4. Compilação Versionada: Toda descoberta bem-sucedida é compilada em SkillGraph
   com nó CHECKPOINT mandatório (graph_validator.py) e salva como vN+1.
"""

import asyncio
import os
import time
from typing import Any, Callable, Dict, List, Optional

from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams, RetryPolicy
from graph_validator import assert_graph_safe, verify_skillgraph_alignment, assert_skillgraph_aligned, PoisonedMemoryDetectedError
from skill_store import save_skill, load_skill, list_skills, SkillNotFoundError
from portal_map_store import PortalMapStore
from browser_use_agent import BrowserUseAgent, BrowserUseTaskResult
from skyvern_fallback import SkyvernFallbackClient, SkyvernTaskResult
from ppav_orchestrator import (
    PPAVOrchestrator,
    PerceptionSnapshot,
    SessionState,
    NextAction,
    AttemptRecord,
    VerificationStatus,
    VerificationResult,
    decompose_goal,
    plan_next_action,
    verify_action_effect,
    capture_perception_snapshot,
)

try:
    from skills.state_graph_skill import ScreenStateFingerprinter, PortalStateGraph
except ImportError:
    try:
        from sidecar.skills.state_graph_skill import ScreenStateFingerprinter, PortalStateGraph
    except ImportError:
        ScreenStateFingerprinter = None  # type: ignore
        PortalStateGraph = None  # type: ignore


MAX_ORCHESTRATION_DEPTH = 3

# REGRA DE EXPLORAÇÃO ESTRITAMENTE SOMENTE-LEITURA:
# Durante a descoberta agêntica (Browser-use / Skyvern), o agente opera em modo
# estritamente não-destrutivo. É expressamente proibido clicar em qualquer elemento
# que contenha termos de remoção/cancelamento. Apenas a descoberta de seletores ocorre,
# e o preenchimento de rascunho fica condicionado ao PortalApprovalCard.
DESTRUCTIVE_TERMS = [
    "excluir", "remover", "deletar", "cancelar", "apagar", 
    "desmatricular", "delete", "remove", "cancel", "drop", "expel", "limpar"
]


def is_destructive_action(action: Dict[str, Any]) -> bool:
    """
    Verifica se uma ação, seletor ou descrição possui termos potencialmente destrutivos.
    Durante a exploração do DiscoveryOrchestrator, ações destrutivas são vetadas.
    """
    text_to_check = " ".join([
        str(action.get("description", "")),
        str(action.get("selector", "")),
        str(action.get("text", "")),
        str(action.get("label", "")),
        str(action.get("value", "")) if action.get("action_type") == "CLICK" else ""
    ]).lower()

    for term in DESTRUCTIVE_TERMS:
        if term in text_to_check:
            return True
    return False


class DiscoveryOrchestrator:
    """
    Orquestrador central de escalonamento entre Motor Local, Browser-use e Skyvern.
    """

    def __init__(
        self,
        runner: Any = None,
        map_store: Optional[PortalMapStore] = None,
        browser_use_agent: Optional[BrowserUseAgent] = None,
        skyvern_client: Optional[SkyvernFallbackClient] = None,
        confidence_threshold: Optional[float] = None,
        skills_dir: Optional[Any] = None,
    ):
        self.runner = runner
        self.map_store = map_store or (runner.map_store if runner else PortalMapStore())
        self.skills_dir = skills_dir
        
        env_threshold = os.getenv("SKILLGRAPH_CONFIDENCE_THRESHOLD")
        self.confidence_threshold = (
            float(env_threshold) if env_threshold is not None
            else (confidence_threshold if confidence_threshold is not None else 0.7)
        )
        
        self.browser_use_agent = browser_use_agent or BrowserUseAgent(
            confidence_threshold=self.confidence_threshold
        )
        self.skyvern_client = skyvern_client or SkyvernFallbackClient()
        self.ppav_orchestrator = PPAVOrchestrator(max_attempts_per_subgoal=5)

        # Mutex por portal_id para eliminar condições de corrida no CDP compartilhado
        self._portal_locks: Dict[str, asyncio.Lock] = {}
        self.state_graphs: Dict[str, Any] = {}

    def get_state_graph(self, portal_id: str) -> Optional[Any]:
        """Retorna ou inicializa a FSM do grafo de estados para o portal."""
        if not PortalStateGraph:
            return None
        if portal_id not in self.state_graphs:
            self.state_graphs[portal_id] = PortalStateGraph(portal_id=portal_id)
        return self.state_graphs[portal_id]

    def _get_portal_lock(self, portal_id: str) -> asyncio.Lock:
        """Garante uma instância única de lock para cada portal_id."""
        if portal_id not in self._portal_locks:
            self._portal_locks[portal_id] = asyncio.Lock()
        return self._portal_locks[portal_id]

    async def execute_ppav_loop(
        self,
        goal: str,
        page: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Executa um objetivo através do Loop Real PPAV de 4 passos
        (Perceber -> Planejar -> Agir -> Verificar) com decomposição de sub-objetivos,
        anti-loop infinito e verificação real de efeito pós-ação.
        """
        return await self.ppav_orchestrator.execute_goal(goal, page=page)

    async def execute(
        self,
        portal_id: str,
        acao: str,
        parametros: Dict[str, Any],
        portal_url: Optional[str] = None,
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
        depth: int = 0,
    ) -> Dict[str, Any]:
        """Alias para discover_or_execute conforme especificação com suporte a profundidade de orquestração."""
        return await self.discover_or_execute(
            portal_id=portal_id,
            acao=acao,
            parametros=parametros,
            portal_url=portal_url,
            on_progress=on_progress,
            depth=depth,
        )

    async def discover_or_execute(
        self,
        portal_id: str,
        acao: str,
        parametros: Dict[str, Any],
        portal_url: Optional[str] = None,
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
        depth: int = 0,
    ) -> Dict[str, Any]:
        """
        Função central da escada de escalonamento.
        Garante exclusão mútua por portal_id e limite de recursão via Anti-Recursion Guard.
        """
        # CAMADA 2: Limite explícito de profundidade de orquestração
        if depth >= MAX_ORCHESTRATION_DEPTH:
            err = (
                f"RecursionDepthExceeded: profundidade máxima de orquestração ({MAX_ORCHESTRATION_DEPTH}) "
                f"excedida para portal '{portal_id}' e ação '{acao}' (depth={depth}). "
                f"Execução abortada com segurança pelo Anti-Recursion Guard."
            )
            print(f"[Orchestrator] 🛑 {err}")
            return {
                "success": False,
                "engine_used": "recursion_guard",
                "skill_graph": None,
                "trace": [],
                "execution_time": 0.0,
                "estimated_cost": 0.0,
                "error": err
            }

        if depth > 0:
            return await self._run_discovery_or_execution(
                portal_id=portal_id,
                acao=acao,
                parametros=parametros,
                portal_url=portal_url,
                on_progress=on_progress,
                depth=depth,
            )

        lock = self._get_portal_lock(portal_id)
        async with lock:
            return await self._run_discovery_or_execution(
                portal_id=portal_id,
                acao=acao,
                parametros=parametros,
                portal_url=portal_url,
                on_progress=on_progress,
                depth=depth,
            )

    async def _run_discovery_or_execution(
        self,
        portal_id: str,
        acao: str,
        parametros: Dict[str, Any],
        portal_url: Optional[str] = None,
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
        depth: int = 0,
    ) -> Dict[str, Any]:
        """Corpo da execução da escada, chamado sob lock do portal ou por sub-tarefa interna."""
        start_time = time.time()
        domain = self.map_store.extract_domain(portal_url or portal_id)
        print(f"\n[Orchestrator] ════════════════════════════════════════════════════════════════")
        print(f"[Orchestrator] Recebida solicitação: portal='{portal_id}', acao='{acao}' (depth={depth})")
        print(f"[Orchestrator] ════════════════════════════════════════════════════════════════")

        # ------------------------------------------------------------------
        # CAMADA 1: Motor Local Determinístico (SkillGraph existente & sem drift)
        # ------------------------------------------------------------------
        is_drifted = self.map_store.is_drifted(domain, acao)
        existing_graph = None

        if not is_drifted:
            try:
                existing_graph = load_skill(portal_id, acao, version=None, base_dir=self.skills_dir) if self.skills_dir else load_skill(portal_id, acao, version=None)
            except SkillNotFoundError:
                existing_graph = None

        if existing_graph and not is_drifted:
            self._notify_progress(on_progress, {
                "engine": "local_motor",
                "status": "executing",
                "message": "Executando via Motor Local determinístico (CDP porta 9222)...",
                "cost_usd": 0.0
            })

            local_res = await self._execute_local_graph(existing_graph, parametros, depth=depth)
            elapsed = time.time() - start_time
            print(f"[Orchestrator] ✅ Motor Local concluído em {elapsed:.2f}s (Custo: $0.00).")
            return {
                "success": local_res.get("success", True),
                "engine_used": "local_motor",
                "skill_graph": existing_graph,
                "trace": local_res.get("trace", []),
                "execution_time": elapsed,
                "estimated_cost": 0.0,
                "error": local_res.get("error")
            }

        # ------------------------------------------------------------------
        # CAMADA 2: Descoberta Leve via Browser-use (DOM / Acessibilidade)
        # ------------------------------------------------------------------
        if is_drifted:
            print(f"[Orchestrator] ⚠️ Portal '{portal_id}' possui flag de drift para '{acao}'. Forçando nova descoberta.")
        else:
            print(f"[Orchestrator] 🔍 Nenhum mapa prévio encontrado para '{portal_id}/{acao}'. Iniciando descoberta leve.")

        self._notify_progress(on_progress, {
            "engine": "browser_use",
            "status": "discovering",
            "message": "Mapeando portal via Browser-use (árvore de acessibilidade/DOM)...",
            "cost_usd": 0.0005
        })

        # Anexa o contexto Playwright compartilhado do runner, se disponível
        if self.runner and hasattr(self.runner, "get_browser_context"):
            try:
                ctx = await self.runner.get_browser_context()
                self.browser_use_agent.attach_to_existing_context(ctx)
            except Exception as e:
                print(f"[Orchestrator] Aviso ao anexar contexto do runner: {e}")

        bu_task = {
            "acao": acao,
            "portal_id": portal_id,
            "parametros": parametros,
            "objeto_alvo": parametros.get("objeto_alvo"),
            "verbo_acao": parametros.get("verbo_acao"),
            "aluno": parametros.get("aluno"),
            "valor": parametros.get("valor"),
            "tipo_operacao": parametros.get("tipo_operacao"),
            "descricao_tarefa": parametros.get("descricao_tarefa")
        }
        bu_res: BrowserUseTaskResult = await self.browser_use_agent.execute_discovery_task(bu_task)

        # Se o Browser-use detectou ambiguidade, NUNCA escala para Skyvern nem escolhe silenciosamente!
        if getattr(bu_res, "status", "") == "ambiguous":
            print(f"[Orchestrator] ⚠️ Ambiguidade detectada pelo Browser-use ({len(bu_res.candidates)} alunos correspondentes).")
            return {
                "success": False,
                "status": "ambiguous",
                "engine_used": bu_res.engine_used,
                "skill_graph": None,
                "candidates": bu_res.candidates,
                "disambiguation_prompt": bu_res.disambiguation_prompt,
                "trace": bu_res.trace_de_acoes,
                "execution_time": time.time() - start_time,
                "estimated_cost": 0.0005,
                "error": bu_res.erro or "Ambiguidade: múltiplos alunos correspondem ao termo buscado."
            }

        # Se o Browser-use teve sucesso e confiança >= threshold, compila e salva
        if bu_res.sucesso and not bu_res.requires_escalation:
            orig_intent = {"acao": acao, "parametros": parametros, "aluno": parametros.get("aluno"), "objeto_alvo": parametros.get("objeto_alvo")}
            is_aligned, alignment_err = verify_skillgraph_alignment(
                task_id=acao,
                actions_or_nodes=bu_res.trace_de_acoes,
                original_intent=orig_intent
            )
            if not is_aligned:
                err_msg = f"Gravação de SkillGraph bloqueada por segurança: {alignment_err}"
                print(f"[Orchestrator] 🚨 ANOMALIA DE SEGURANÇA (Memória Envenenada Detectada): {err_msg}")
                return {
                    "success": False,
                    "engine_used": "browser_use_llama",
                    "skill_graph": None,
                    "trace": bu_res.trace_de_acoes,
                    "execution_time": time.time() - start_time,
                    "estimated_cost": 0.0005,
                    "error": err_msg,
                    "security_anomaly": True
                }

            new_graph = self._compile_trace_to_skill_graph(
                portal_id=portal_id,
                task_id=acao,
                trace=bu_res.trace_de_acoes,
                discovery_engine="browser_use_dom",
                confidence=bu_res.confianca,
                original_intent=orig_intent
            )
            save_path = save_skill(new_graph, base_dir=self.skills_dir) if self.skills_dir else save_skill(new_graph)
            self.map_store.clear_drift(domain, acao)
            self.map_store.mark_validated(domain)

            elapsed = time.time() - start_time
            print(f"[Orchestrator] 💾 Novo SkillGraph v{new_graph.version} compilado e salvo via Browser-use em {save_path}.")
            return {
                "success": True,
                "engine_used": "browser_use_llama",
                "skill_graph": new_graph,
                "trace": bu_res.trace_de_acoes,
                "execution_time": elapsed,
                "estimated_cost": 0.0005,
                "error": None
            }

        # ------------------------------------------------------------------
        # CAMADA 3: Escalonamento Visual via Skyvern (Docker Self-Hosted)
        # ------------------------------------------------------------------
        conf_str = f"{bu_res.confianca:.2f}" if isinstance(getattr(bu_res, "confianca", None), (int, float)) else str(getattr(bu_res, "confianca", "0.0"))
        print(f"[Orchestrator] ⚠️ Browser-use insuficiente (confiança: {conf_str}, erro: {bu_res.erro}).")
        self._notify_progress(on_progress, {
            "engine": "skyvern",
            "status": "escalating",
            "message": "Baixa confiança no DOM. Escalonando para Skyvern (fallback visual)...",
            "cost_usd": 0.08
        })

        target_url = portal_url or (
            bu_res.trace_de_acoes[0]["url"]
            if bu_res.trace_de_acoes and "url" in bu_res.trace_de_acoes[0]
            else f"https://{domain}"
        )

        sky_res: SkyvernTaskResult = await self.skyvern_client.execute_visual_task(
            url=target_url,
            portal_id=portal_id,
            acao=acao,
            parametros=parametros,
            is_authenticated_session=True  # Conforme Ponto 4: assume sessão ativa
        )

        if not sky_res.sucesso:
            elapsed = time.time() - start_time
            err = f"Falha no escalonamento Skyvern: {sky_res.erro}"
            print(f"[Orchestrator] ❌ {err}")
            return {
                "success": False,
                "engine_used": "skyvern_vision",
                "skill_graph": None,
                "trace": [],
                "execution_time": elapsed,
                "estimated_cost": 0.08,
                "error": err
            }

        # 1. Proteção de Memória Envenenada (Anti-Prompt Injection Indireto):
        orig_intent = {"acao": acao, "parametros": parametros, "aluno": parametros.get("aluno"), "objeto_alvo": parametros.get("objeto_alvo")}
        is_aligned, alignment_err = verify_skillgraph_alignment(
            task_id=acao,
            actions_or_nodes=sky_res.trace_de_acoes,
            original_intent=orig_intent
        )
        if not is_aligned:
            err_msg = f"Gravação de SkillGraph bloqueada por segurança: {alignment_err}"
            print(f"[Orchestrator] 🚨 ANOMALIA DE SEGURANÇA (Memória Envenenada Detectada): {err_msg}")
            return {
                "success": False,
                "engine_used": "skyvern_vision",
                "skill_graph": None,
                "trace": sky_res.trace_de_acoes,
                "execution_time": time.time() - start_time,
                "estimated_cost": 0.08,
                "error": err_msg,
                "security_anomaly": True
            }

        # Compilação do trace retornado pelo Skyvern
        new_graph = self._compile_trace_to_skill_graph(
            portal_id=portal_id,
            task_id=acao,
            trace=sky_res.trace_de_acoes,
            discovery_engine="skyvern_vision",
            confidence=sky_res.confianca,
            original_intent=orig_intent
        )
        save_path = save_skill(new_graph, base_dir=self.skills_dir) if self.skills_dir else save_skill(new_graph)
        self.map_store.clear_drift(domain, acao)
        self.map_store.mark_validated(domain)

        elapsed = time.time() - start_time
        print(f"[Orchestrator] 🎯 Novo SkillGraph v{new_graph.version} compilado e salvo via Skyvern em {save_path}.")
        return {
            "success": True,
            "engine_used": "skyvern_vision",
            "skill_graph": new_graph,
            "trace": sky_res.trace_de_acoes,
            "execution_time": elapsed,
            "estimated_cost": 0.08,
            "error": None
        }

    def _compile_trace_to_skill_graph(
        self,
        portal_id: str,
        task_id: str,
        trace: List[Dict[str, Any]],
        discovery_engine: str = "browser_use_llama",
        confidence: float = 0.85,
        original_intent: Optional[Dict[str, Any]] = None
    ) -> SkillGraph:
        """
        Compila o trace de ações descobertas (Browser-use ou Skyvern) em um SkillGraph
        válido e seguro, inserindo obrigatoriamente um nó CHECKPOINT antes de qualquer
        ação de escrita (WRITE) ou submissão (CLICK de submit) para aprovação em assert_graph_safe.
        Aplica também validação estrita anti-envenenamento de memória (assert_skillgraph_aligned).
        """
        # Validação estrita de alinhamento pré-compilação
        if original_intent:
            assert_skillgraph_aligned(task_id, trace, original_intent)
        # 1. Determina a próxima versão para não sobrescrever histórico
        current_version = 0
        try:
            skills_info = list_skills(base_dir=self.skills_dir) if self.skills_dir else list_skills()
            for s in skills_info:
                if s["portal_id"] == portal_id and s["task_id"] == task_id:
                    current_version = s["latest_version"]
                    break
        except Exception:
            current_version = 0
        next_version = current_version + 1

        # REGRA MANDATÓRIA DE EXPLORAÇÃO ESTRITAMENTE SOMENTE-LEITURA:
        # Filtra e elimina sumariamente qualquer ação que sugira exclusão ou impacto irreversível
        safe_trace = [act for act in trace if not is_destructive_action(act)]
        if len(safe_trace) < len(trace):
            print(f"[Orchestrator] 🛡️ {len(trace) - len(safe_trace)} ação(ões) com termos destrutivos foram bloqueadas.")
        trace = safe_trace

        nodes: Dict[str, SkillNode] = {}
        node_ids: List[str] = []

        # 2. Converte as ações em nós tipados
        step_idx = 0
        has_risk_ahead = any(
            (act.get("action_type") == "WRITE" and not act.get("is_filter", False) and act.get("is_submit_action") is not False)
            or (act.get("action_type") == "CLICK" and act.get("is_submit_action", True) is not False)
            for act in trace
        )
        checkpoint_inserted = False

        for act in trace:
            act_type = act.get("action_type", "LOCATE").upper()
            is_filter_act = act.get("is_filter", False) or (act.get("is_submit_action") is False and act_type == "WRITE")
            is_risk = (
                (act_type == "WRITE" and not is_filter_act)
                or (act_type == "CLICK" and act.get("is_submit_action", True) is not False)
            )

            # REGRA MANDATÓRIA DE SEGURANÇA:
            # Se a próxima ação for WRITE irreversível ou CLICK de submit, insere um nó CHECKPOINT antes
            if has_risk_ahead and not checkpoint_inserted and is_risk:
                chk_id = "checkpoint_seguranca"
                nodes[chk_id] = SkillNode(
                    id=chk_id,
                    type="CHECKPOINT",
                    params=SkillNodeParams(
                        description="Confirmação humana obrigatória antes de gravar/submeter dados descobertos no portal",
                        condition="requires_human_confirmation"
                    ),
                    on_success=None,  # será encadeado abaixo
                    on_fail="ABORT",
                    retry_policy=RetryPolicy(max_attempts=1, backoff_ms=0)
                )
                node_ids.append(chk_id)
                checkpoint_inserted = True

            nid = f"{act_type.lower()}_{step_idx}"
            step_idx += 1

            if act_type == "NAVIGATE":
                nodes[nid] = SkillNode(
                    id=nid,
                    type="NAVIGATE",
                    anchor=SkillAnchor(
                        strategy="css_selector",
                        value=act.get("url", ""),
                        description=act.get("description")
                    ),
                    params=SkillNodeParams(),
                    retry_policy=RetryPolicy(max_attempts=2, backoff_ms=500)
                )
            elif act_type == "LOCATE":
                nodes[nid] = SkillNode(
                    id=nid,
                    type="LOCATE",
                    anchor=SkillAnchor(
                        strategy="css_selector",
                        value=act.get("selector", "table tbody tr"),
                        description=act.get("description")
                    ),
                    params=SkillNodeParams(
                        multiplicity=act.get("multiplicity", "single")
                    ),
                    retry_policy=RetryPolicy(max_attempts=2, backoff_ms=500)
                )
            elif act_type == "WRITE":
                is_filter = act.get("is_filter", False) or act.get("is_submit_action") is False
                nodes[nid] = SkillNode(
                    id=nid,
                    type="WRITE",
                    anchor=SkillAnchor(
                        strategy="css_selector",
                        value=act.get("selector", "input"),
                        description=act.get("description")
                    ),
                    params=SkillNodeParams(
                        action_value=str(act.get("value", "")) if act.get("value") is not None else "",
                        is_submit_action=False if is_filter else None,
                        is_filter=is_filter
                    ),
                    retry_policy=RetryPolicy(max_attempts=2, backoff_ms=500)
                )
            elif act_type == "CLICK":
                nodes[nid] = SkillNode(
                    id=nid,
                    type="CLICK",
                    anchor=SkillAnchor(
                        strategy="css_selector",
                        value=act.get("selector", "button"),
                        description=act.get("description")
                    ),
                    params=SkillNodeParams(
                        is_submit_action=act.get("is_submit_action", True)
                    ),
                    retry_policy=RetryPolicy(max_attempts=2, backoff_ms=500)
                )
            elif act_type == "READ":
                nodes[nid] = SkillNode(
                    id=nid,
                    type="READ",
                    anchor=SkillAnchor(
                        strategy="css_selector",
                        value=act.get("selector", "td:nth-child(1)"),
                        description=act.get("description")
                    ),
                    params=SkillNodeParams(),
                    retry_policy=RetryPolicy(max_attempts=2, backoff_ms=500)
                )

            if nid in nodes:
                node_ids.append(nid)

        # 3. Encadeia as arestas on_success em sequência
        for i in range(len(node_ids) - 1):
            curr_id = node_ids[i]
            next_id = node_ids[i + 1]
            nodes[curr_id].on_success = next_id

        entry_node = node_ids[0] if node_ids else "checkpoint_seguranca"

        # 4. Constrói o SkillGraph tipado
        graph = SkillGraph(
            id=f"skill_{portal_id}_{task_id}_v{next_version}",
            name=f"Habilidade {task_id} ({portal_id})",
            portal_id=portal_id,
            task_id=task_id,
            version=next_version,
            entry_node=entry_node,
            nodes=nodes
        )

        # 5. Validação mandatória de segurança pré-gravação
        assert_graph_safe(graph)

        return graph

    async def _execute_local_graph(self, graph: SkillGraph, parametros: Dict[str, Any], depth: int = 0) -> Dict[str, Any]:
        """Executa um SkillGraph existente através do motor local BrowserHarnessRunner."""
        if self.runner and hasattr(self.runner, "process_task"):
            task_mock = {
                "id": f"exec_{int(time.time())}",
                "status": "drafted",
                "portal": graph.portal_id,
                "action_type": graph.task_id,
                "payload": parametros,
                "_orchestrated": True,
                "_orchestration_depth": depth + 1
            }
            res = await self.runner.process_task(task_mock, {"provider": "local"})
            return {"success": res, "trace": [{"node": graph.entry_node, "status": "SUCCESS"}]}
        return {"success": True, "trace": [{"node": graph.entry_node, "status": "SUCCESS"}]}

    def _notify_progress(self, callback: Optional[Callable], event: Dict[str, Any]) -> None:
        """Emite evento de progresso acústico/visual para a Rafinha."""
        if callback and callable(callback):
            try:
                callback(event)
            except Exception as e:
                print(f"[Orchestrator] Erro no callback de progresso: {e}")
        else:
            print(f"[Orchestrator] 📢 [{event.get('engine')}] {event.get('message')}")
