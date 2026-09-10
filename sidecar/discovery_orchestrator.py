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
from graph_validator import assert_graph_safe
from skill_store import save_skill, load_skill, list_skills, SkillNotFoundError
from portal_map_store import PortalMapStore
from browser_use_agent import BrowserUseAgent, BrowserUseTaskResult
from skyvern_fallback import SkyvernFallbackClient, SkyvernTaskResult


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

        # Mutex por portal_id para eliminar condições de corrida no CDP compartilhado
        self._portal_locks: Dict[str, asyncio.Lock] = {}

    def _get_portal_lock(self, portal_id: str) -> asyncio.Lock:
        """Garante uma instância única de lock para cada portal_id."""
        if portal_id not in self._portal_locks:
            self._portal_locks[portal_id] = asyncio.Lock()
        return self._portal_locks[portal_id]

    async def discover_or_execute(
        self,
        portal_id: str,
        acao: str,
        parametros: Dict[str, Any],
        portal_url: Optional[str] = None,
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Dict[str, Any]:
        """
        Função central da escada de escalonamento.
        Garante exclusão mútua por portal_id.
        """
        lock = self._get_portal_lock(portal_id)

        async with lock:
            start_time = time.time()
            domain = self.map_store.extract_domain(portal_url or portal_id)
            print(f"\n[Orchestrator] ════════════════════════════════════════════════════════════════")
            print(f"[Orchestrator] Recebida solicitação: portal='{portal_id}', acao='{acao}'")
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

                local_res = await self._execute_local_graph(existing_graph, parametros)
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
                "parametros": parametros
            }
            bu_res: BrowserUseTaskResult = await self.browser_use_agent.execute_discovery_task(bu_task)

            # Se o Browser-use teve sucesso e confiança >= threshold, compila e salva
            if bu_res.sucesso and not bu_res.requires_escalation:
                new_graph = self._compile_trace_to_skill_graph(
                    portal_id=portal_id,
                    task_id=acao,
                    trace=bu_res.trace_de_acoes,
                    discovery_engine="browser_use_dom",
                    confidence=bu_res.confianca
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

            # Compilação do trace retornado pelo Skyvern
            new_graph = self._compile_trace_to_skill_graph(
                portal_id=portal_id,
                task_id=acao,
                trace=sky_res.trace_de_acoes,
                discovery_engine="skyvern_vision",
                confidence=sky_res.confianca
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
        discovery_engine: str,
        confidence: float
    ) -> SkillGraph:
        """
        Compila o trace de ações descobertas (Browser-use ou Skyvern) em um SkillGraph
        válido e seguro, inserindo obrigatoriamente um nó CHECKPOINT antes de qualquer
        ação de escrita (WRITE) ou submissão (CLICK de submit) para aprovação em assert_graph_safe.
        """
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

        nodes: Dict[str, SkillNode] = {}
        node_ids: List[str] = []

        # 2. Converte as ações em nós tipados
        step_idx = 0
        has_risk_ahead = any(
            act.get("action_type") in ("WRITE", "CLICK") and act.get("is_submit_action", True)
            for act in trace
        )
        checkpoint_inserted = False

        for act in trace:
            act_type = act.get("action_type", "LOCATE").upper()

            # REGRA MANDATÓRIA DE SEGURANÇA:
            # Se a próxima ação for WRITE ou CLICK de submit, insere um nó CHECKPOINT antes
            if has_risk_ahead and not checkpoint_inserted and act_type in ("WRITE", "CLICK"):
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
                nodes[nid] = SkillNode(
                    id=nid,
                    type="WRITE",
                    anchor=SkillAnchor(
                        strategy="css_selector",
                        value=act.get("selector", "input"),
                        description=act.get("description")
                    ),
                    params=SkillNodeParams(
                        action_value=act.get("value", "")
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

    async def _execute_local_graph(self, graph: SkillGraph, parametros: Dict[str, Any]) -> Dict[str, Any]:
        """Executa um SkillGraph existente através do motor local BrowserHarnessRunner."""
        if self.runner and hasattr(self.runner, "process_task"):
            task_mock = {
                "id": f"exec_{int(time.time())}",
                "status": "drafted",
                "portal": graph.portal_id,
                "action_type": graph.task_id,
                "payload": parametros
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
