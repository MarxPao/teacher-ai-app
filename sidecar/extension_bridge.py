"""
extension_bridge.py — Ponte WebSocket Bidirecional entre Extensão do Chrome e Sidecar (Teacher AI)

Permite que a automação opere dentro do Chrome normal da professora na MESMA aba aberta:
1. Mantém conexão WebSocket persistente com a teacher-extension.
2. Recebe atualizações em tempo real da aba ativa (URL, se é portal mapeado, se está logado).
3. Despacha comandos de automação (SafeWriter/preenchimento) para a extensão executar na aba atual.
4. Fornece fallback transparente para CDP (:9222) caso a extensão não esteja conectada.
"""

import asyncio
import json
import logging
import threading
import time
from typing import Any, Dict, Optional, Set

try:
    import websockets
    from websockets.asyncio.server import serve as ws_serve
except ImportError:
    websockets = None
    ws_serve = None

logger = logging.getLogger("ExtensionBridge")

DEFAULT_WS_PORT = 8766

KNOWN_PORTAL_DOMAINS = {
    "ieducar": ["ieducar.com.br", "comunidade.ieducar"],
    "machado_sobrinho": ["machadosobrinho", "paineldoaluno.com.br", "paineldoprofessor"],
    "plural": ["plural.net", "plurall.net"],
    "cambridge": ["cambridgeone.org"],
    "santa_catarina": ["redesantacatarina.org.br"],
    "teams": ["teams.microsoft.com"],
    "sed_sp": ["sed.educacao.sp.gov.br"],
    "sandbox": ["localhost", "127.0.0.1", "portal_mock", "portal_real"]
}


class ExtensionBridge:
    def __init__(self, port: int = DEFAULT_WS_PORT):
        self.port = port
        self.active_sockets: Set[Any] = set()
        self.pending_actions: Dict[str, asyncio.Future] = {}
        self.active_tab_state: Dict[str, Any] = {
            "tabId": None,
            "url": "",
            "title": "",
            "isMappedPortal": False,
            "portalName": None,
            "isAuthenticated": False,
            "lastUpdate": 0
        }
        self.server = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None

    def is_connected(self) -> bool:
        """Verifica se há pelo menos uma extensão conectada via WebSocket."""
        return len(self.active_sockets) > 0

    def has_active_portal_tab(self) -> bool:
        """Retorna True se a aba ativa da professora for um portal mapeado e logado."""
        return bool(
            self.is_connected()
            and self.active_tab_state.get("isMappedPortal")
            and self.active_tab_state.get("isAuthenticated")
        )

    def get_status_summary(self) -> Dict[str, Any]:
        """Retorna resumo em português simples para exibição e UI."""
        if not self.is_connected():
            return {
                "state": "offline",
                "label": "Desconectado (assistente ou extensão desligados)",
                "extension_connected": False,
                "portal_name": None,
                "is_authenticated": False
            }

        if self.active_tab_state.get("isMappedPortal") and self.active_tab_state.get("isAuthenticated"):
            portal = self.active_tab_state.get("portalName") or "Portal Escolar"
            return {
                "state": "ready",
                "label": f"Conectado e pronto ({portal})",
                "extension_connected": True,
                "portal_name": portal,
                "is_authenticated": True
            }

        if self.active_tab_state.get("isMappedPortal") and not self.active_tab_state.get("isAuthenticated"):
            return {
                "state": "needs_login",
                "label": "Portal identificado, mas requer login",
                "extension_connected": True,
                "portal_name": self.active_tab_state.get("portalName"),
                "is_authenticated": False,
                "tab_state": self.active_tab_state
            }

        return {
            "state": "unrecognized_portal",
            "label": "Portal não reconhecido",
            "extension_connected": True,
            "portal_name": None,
            "is_authenticated": False
        }

    async def _handle_connection(self, websocket: Any):
        """Gerencia o ciclo de vida da conexão WebSocket da extensão."""
        self.active_sockets.add(websocket)
        logger.info("[ExtensionBridge] 🔌 Extensão do Chrome conectada via WebSocket.")
        try:
            # Envia mensagem inicial de boas-vindas
            await websocket.send(json.dumps({
                "type": "SIDECAR_HELLO",
                "version": "3.0",
                "status": "ready"
            }))

            async for raw_message in websocket:
                try:
                    msg = json.loads(raw_message)
                    msg_type = msg.get("type")

                    if msg_type == "TAB_STATUS_UPDATE":
                        # Atualiza estado da aba do navegador da professora
                        tab_info = msg.get("data") or msg
                        url = tab_info.get("url", "")
                        title = tab_info.get("title", "")
                        is_auth = bool(tab_info.get("isAuthenticated", False))

                        # Valida contra catálogo de portais conhecidos
                        portal_matched = None
                        for p_name, domains in KNOWN_PORTAL_DOMAINS.items():
                            if any(d in url.lower() for d in domains):
                                portal_matched = p_name
                                break

                        self.active_tab_state = {
                            "tabId": tab_info.get("tabId"),
                            "url": url,
                            "title": title,
                            "friendlyPageName": tab_info.get("friendlyPageName") or title,
                            "isMappedPortal": bool(portal_matched),
                            "portalName": portal_matched,
                            "isAuthenticated": is_auth,
                            "lastUpdate": time.time()
                        }

                    elif msg_type == "ACTION_RESULT":
                        # Resposta de ação executada na aba pela extensão
                        act_id = msg.get("actionId")
                        if act_id and act_id in self.pending_actions:
                            fut = self.pending_actions.pop(act_id)
                            if not fut.done():
                                fut.set_result(msg.get("result"))

                    elif msg_type in ("APPROVAL_DECISION", "DIFF_APPROVAL_DECISION") or msg.get("action") == "APPROVAL_DECISION":
                        task_id = msg.get("task_id") or msg.get("taskId")
                        if task_id and task_id in self.pending_actions:
                            fut = self.pending_actions.pop(task_id)
                            if not fut.done():
                                fut.set_result(msg)

                    elif msg_type == "PING":
                        await websocket.send(json.dumps({"type": "PONG", "timestamp": time.time()}))

                    elif msg_type == "EXECUTE_GOAL_WITH_HARNESS":
                        goal = msg.get("goal", "")
                        portal_url = msg.get("portalUrl")
                        asyncio.create_task(self._run_harness_goal(websocket, goal, portal_url))

                    elif msg_type == "ASK_PAGE_QUESTION":
                        query = msg.get("query", "")
                        page_data = msg.get("pageData") or {}
                        request_id = msg.get("requestId") or f"req_{int(time.time()*1000)}"
                        asyncio.create_task(self._answer_page_question(websocket, request_id, query, page_data))

                    elif msg_type == "GET_PORTAL_PATHWAYS":
                        portal_id = msg.get("portalId", "")
                        intent = msg.get("intent", "")
                        request_id = msg.get("requestId") or f"req_{int(time.time()*1000)}"
                        asyncio.create_task(self._handle_get_pathway(websocket, request_id, portal_id, intent))

                    elif msg_type == "RECORD_PORTAL_EPISODE":
                        episode_data = msg.get("episode", {})
                        request_id = msg.get("requestId") or f"req_{int(time.time()*1000)}"
                        asyncio.create_task(self._handle_record_episode(websocket, request_id, episode_data))

                    elif msg_type == "EXECUTE_WITH_LEARNING_ENGINE":
                        portal_id = msg.get("portalId", "")
                        intent = msg.get("intent", "")
                        goal = msg.get("goal", "")
                        context = msg.get("context", {})
                        request_id = msg.get("requestId") or f"req_{int(time.time()*1000)}"
                        asyncio.create_task(self._handle_learning_engine_exec(websocket, request_id, portal_id, intent, goal, context))

                except Exception as parse_err:
                    logger.warning(f"[ExtensionBridge] Erro ao parsear mensagem: {parse_err}")

        except Exception as e:
            logger.info(f"[ExtensionBridge] Conexão encerrada: {e}")
        finally:
            self.active_sockets.discard(websocket)
            logger.info("[ExtensionBridge] 🔌 Extensão desconectada.")

    async def execute_task_on_tab(self, task: Dict[str, Any], timeout_s: float = 25.0) -> Optional[Dict[str, Any]]:
        """
        Envia uma tarefa estruturada (lancar_nota, lancar_falta, read_roster)
        para ser executada pela extensão diretamente na aba ativa.
        """
        # Defense-in-Depth: Trava de proveniência na ponte de extensão
        tipo_op = task.get("tipo_operacao") or task.get("risco") or "leitura"
        acao = task.get("acao") or ""
        origin = task.get("instruction_origin") or task.get("origem") or "user_command"
        if (tipo_op == "escrita" or acao in {"lancar_nota", "lancar_falta", "marcar_presenca", "marcar_presenca_massa"}) and origin != "user_command":
            return {
                "sucesso": False,
                "status": "blocked_untrusted_origin",
                "error": f"Extensão recusou execução: proveniência '{origin}' não autorizada para mutações."
            }

        if not self.active_sockets:
            return None

        act_id = f"task_{int(time.time() * 1000)}"
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self.pending_actions[act_id] = fut

        payload = {
            "type": "EXECUTE_PORTAL_ACTION",
            "actionId": act_id,
            "tabId": self.active_tab_state.get("tabId"),
            "intent": task
        }

        # Envia para todos os sockets ativos da extensão
        dead_sockets = set()
        for ws in self.active_sockets:
            try:
                await ws.send(json.dumps(payload))
            except Exception:
                dead_sockets.add(ws)

        self.active_sockets.difference_update(dead_sockets)

        try:
            result = await asyncio.wait_for(fut, timeout=timeout_s)
            return result
        except asyncio.TimeoutError:
            self.pending_actions.pop(act_id, None)
            return {
                "sucesso": False,
                "status": "extension_timeout",
                "mensagem": "A extensão no navegador da professora não respondeu a tempo."
            }

    async def request_user_diff_approval(
        self,
        entries: List[Dict[str, Any]],
        portal_name: str = "Portal Escolar",
        timeout_s: float = 60.0
    ) -> bool:
        """
        Envia o Card de Conferência com Diff Visual para o Side Panel do professor
        e aguarda a decisão humana (Confirmar ou Cancelar).
        """
        if not self.active_sockets:
            logger.warning("[ExtensionBridge] Nenhum socket ativo para aprovação; prosseguindo em modo autônomo.")
            return True

        task_id = f"approval_{int(time.time() * 1000)}"
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self.pending_actions[task_id] = fut

        payload = {
            "type": "SHOW_DIFF_APPROVAL_CARD",
            "action": "SHOW_DIFF_APPROVAL_CARD",
            "task_id": task_id,
            "portal_name": portal_name,
            "entries": entries
        }

        dead_sockets = set()
        for ws in self.active_sockets:
            try:
                await ws.send(json.dumps(payload))
            except Exception:
                dead_sockets.add(ws)
        self.active_sockets.difference_update(dead_sockets)

        try:
            res = await asyncio.wait_for(fut, timeout=timeout_s)
            return bool(res.get("approved", False))
        except asyncio.TimeoutError:
            self.pending_actions.pop(task_id, None)
            logger.warning(f"[ExtensionBridge] Timeout aguardando aprovação do professor para {task_id}.")
            return False

    async def _run_harness_goal(self, websocket: Any, goal: str, portal_url: Optional[str] = None):
        """Executa um objetivo multi-passo utilizando o motor nativo Harness e PPAVOrchestrator."""
        try:
            from harness_engine import HarnessEngine
            from ppav_orchestrator import PPAVOrchestrator, decompose_goal

            engine = HarnessEngine()
            if not engine.ensure_connected():
                await websocket.send(json.dumps({
                    "type": "HARNESS_ERROR",
                    "error": "Navegador Chrome não conectado via CDP. Inicie o Chrome com porta de depuração ou execute 'abrir-chrome-cdp.bat'."
                }))
                return

            if portal_url:
                await engine.async_goto(portal_url)

            def on_progress(p):
                asyncio.create_task(websocket.send(json.dumps({
                    "type": "HARNESS_PROGRESS",
                    "data": p
                })))

            orchestrator = PPAVOrchestrator(page=engine, on_progress=on_progress)
            sub_goals = decompose_goal(goal)

            for idx, sg in enumerate(sub_goals):
                res = await orchestrator.execute_subgoal(sg, engine, idx)
                if not res.get("success"):
                    if res.get("requires_approval"):
                        await websocket.send(json.dumps({
                            "type": "HARNESS_APPROVAL_REQUIRED",
                            "action": res.get("action"),
                            "sub_goal": sg
                        }))
                        return
                    await websocket.send(json.dumps({
                        "type": "HARNESS_STEP_FAILED",
                        "sub_goal": sg,
                        "error": res.get("error")
                    }))
                    return

            await websocket.send(json.dumps({
                "type": "HARNESS_COMPLETE",
                "goal": goal,
                "completed": orchestrator.session_state.completed_sub_goals
            }))

        except Exception as e:
            logger.error(f"[ExtensionBridge] Erro ao executar meta com Harness: {e}")
            try:
                await websocket.send(json.dumps({
                    "type": "HARNESS_ERROR",
                    "error": str(e)
                }))
            except Exception:
                pass

    async def _answer_page_question(self, websocket: Any, request_id: str, query: str, page_data: Dict[str, Any]):
        """
        Interpreta a pergunta natural da professora sobre qualquer tela do portal escolar,
        utilizando LLM (Groq / Gemini) ou fallback estruturado determinístico.
        """
        try:
            llm_answer = self._call_llm_for_page(query, page_data)
            final_answer = llm_answer or self._synthesize_page_answer_local(query, page_data)

            await websocket.send(json.dumps({
                "type": "PAGE_QUESTION_ANSWER",
                "requestId": request_id,
                "success": True,
                "answer": final_answer
            }))
        except Exception as err:
            logger.error(f"[ExtensionBridge] Erro ao responder pergunta da tela: {err}")
            await websocket.send(json.dumps({
                "type": "PAGE_QUESTION_ANSWER",
                "requestId": request_id,
                "success": False,
                "error": str(err),
                "answer": self._synthesize_page_answer_local(query, page_data)
            }))

    async def _handle_get_pathway(self, websocket: Any, request_id: str, portal_id: str, intent: str):
        try:
            from supabase_memory_client import supabase_memory
            pathway = supabase_memory.get_best_pathway(portal_id, intent)
            await websocket.send(json.dumps({
                "type": "PORTAL_PATHWAYS_RESPONSE",
                "requestId": request_id,
                "success": True,
                "pathway": pathway
            }))
        except Exception as e:
            await websocket.send(json.dumps({
                "type": "PORTAL_PATHWAYS_RESPONSE",
                "requestId": request_id,
                "success": False,
                "error": str(e)
            }))

    async def _handle_record_episode(self, websocket: Any, request_id: str, episode_data: Dict[str, Any]):
        try:
            from supabase_memory_client import supabase_memory
            saved = supabase_memory.record_episode(episode_data)
            await websocket.send(json.dumps({
                "type": "RECORD_PORTAL_EPISODE_RESPONSE",
                "requestId": request_id,
                "success": True,
                "episode": saved
            }))
        except Exception as e:
            await websocket.send(json.dumps({
                "type": "RECORD_PORTAL_EPISODE_RESPONSE",
                "requestId": request_id,
                "success": False,
                "error": str(e)
            }))

    async def _handle_learning_engine_exec(self, websocket: Any, request_id: str, portal_id: str, intent: str, goal: str, context: Dict[str, Any]):
        try:
            from learning_engine import learning_engine
            from harness_engine import HarnessEngine

            engine = HarnessEngine()
            page = engine.page if engine.ensure_connected() else None

            res = await learning_engine.execute_or_learn(
                portal_id=portal_id,
                intent=intent,
                goal=goal,
                page=page,
                context=context
            )
            await websocket.send(json.dumps({
                "type": "LEARNING_ENGINE_EXEC_RESPONSE",
                "requestId": request_id,
                "success": res.get("sucesso", False),
                "result": res
            }))
        except Exception as e:
            await websocket.send(json.dumps({
                "type": "LEARNING_ENGINE_EXEC_RESPONSE",
                "requestId": request_id,
                "success": False,
                "error": str(e)
            }))

    def _call_llm_for_page(self, query: str, page_data: Dict[str, Any]) -> Optional[str]:
        """Tenta sintetizar uma resposta semântica rica usando LLM configurado."""
        import os
        groq_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_KEY") or ""
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("NEXT_PUBLIC_GEMINI_KEY") or ""
        if not (groq_key or gemini_key):
            return None

        try:
            from page_reader_engine import _call_groq, _call_gemini
            active_tab = page_data.get("activeTab", "Tela do Portal")
            tables = page_data.get("tables") or []
            cards = page_data.get("cards") or []

            lines = [f"TELA ATIVA: {active_tab}"]
            if page_data.get("url"):
                lines.append(f"URL: {page_data['url']}")
            for i, tbl in enumerate(tables, 1):
                headers = tbl.get("headers") or []
                rows = tbl.get("rows") or []
                lines.append(f"Tabela {i}: Cabeçalhos: {' | '.join(str(h) for h in headers)}")
                for r in rows[:30]:
                    lines.append(" | ".join(str(c) for c in r))
            for c in cards[:15]:
                lines.append(f"Card: {c}")

            screen_text = "\n".join(lines)
            prompt = (
                "Você é a Rafinha, assistente agêntica especialista do Teacher AI. Analise os dados da tela do portal escolar "
                "e responda à dúvida do professor com precisão absoluta, em português brasileiro acolhedor, profissional e direto.\n"
                "DIRETIVAS OBRIGATÓRIAS:\n"
                "1. Baseie-se ESTRITAMENTE nos dados em <conteudo_da_pagina>. NUNCA invente horários, turmas ou notas.\n"
                "2. Se for sobre HORÁRIOS ou GRADE SEMANAL:\n"
                "   - Apresente SEMPRE em ordem cronológica estrita (Segunda a Domingo).\n"
                "   - Ordene os horários de cada dia do mais cedo para o mais tarde.\n"
                "   - Destaque turmas e disciplinas de forma clara.\n"
                "   - Inclua um resumo no início (ex: '🗓️ Sua grade semanal tem X aulas em Y dias letivos').\n"
                "3. Responda diretamente ao objetivo da pergunta (contagem, filtragem por turma, resumo ou detalhe).\n\n"
                f"<conteudo_da_pagina>\n{screen_text}\n</conteudo_da_pagina>\n\n"
                f"<pergunta_do_professor>\n{query}\n</pergunta_do_professor>"
            )

            if groq_key:
                return _call_groq(prompt, {"api_key": groq_key})
            if gemini_key:
                return _call_gemini("", prompt, {"api_key": gemini_key})
        except Exception as e:
            logger.warning(f"[ExtensionBridge] Falha ao invocar LLM para pergunta de tela: {e}")
            return None
        return None

    def _synthesize_page_answer_local(self, query: str, page_data: Dict[str, Any]) -> str:
        """Gera resposta determinística, cronologicamente ordenada e estruturada."""
        tables = page_data.get("tables") or []
        q_norm = (query or "").lower()

        day_names_canonical = [
            ("segunda", "2ª-feira (Segunda)"),
            ("terca", "3ª-feira (Terça)"),
            ("quarta", "4ª-feira (Quarta)"),
            ("quinta", "5ª-feira (Quinta)"),
            ("sexta", "6ª-feira (Sexta)"),
            ("sabado", "Sábado"),
            ("domingo", "Domingo"),
        ]

        by_day = {}
        for tbl in tables:
            headers = tbl.get("headers") or []
            rows = tbl.get("rows") or []
            day_cols = []
            for idx, h in enumerate(headers):
                h_str = str(h).strip()
                h_clean = h_str.lower()
                for d_key, d_name in day_names_canonical:
                    if d_key in h_clean or (d_key == "segunda" and "2ª" in h_str) or (d_key == "terca" and "3ª" in h_str) or (d_key == "quarta" and "4ª" in h_str) or (d_key == "quinta" and "5ª" in h_str) or (d_key == "sexta" and "6ª" in h_str):
                        day_cols.append((idx, d_name, d_key))
                        break

            if len(day_cols) >= 2:
                for row in rows:
                    raw_slot = str(row[0]).strip() if row else ""
                    for col_idx, col_name, col_key in day_cols:
                        if col_idx < len(row):
                            cell = str(row[col_idx]).strip()
                            if cell and cell not in ("-", "—", "", "livre", "folga", "sem aula"):
                                if col_name not in by_day:
                                    by_day[col_name] = []
                                by_day[col_name].append((raw_slot, cell))

        if by_day:
            # Pergunta por dia específico
            for d_key, d_name in day_names_canonical:
                if d_key in q_norm or (d_key == "segunda" and "2a" in q_norm) or (d_key == "terca" and "3a" in q_norm) or (d_key == "quarta" and "4a" in q_norm) or (d_key == "quinta" and "5a" in q_norm) or (d_key == "sexta" and "6a" in q_norm):
                    if d_name in by_day and by_day[d_name]:
                        items = [f"• **{slot}**: {info}" for slot, info in by_day[d_name]]
                        return f"Aqui está a sua grade para **{d_name}**: 🗓️✨<br><br>📅 **{d_name}**:<br>" + "<br>".join(items)
                    return f"Você **não tem nenhuma aula** cadastrada na **{d_name}**! 🎉✨"

            # Pergunta sobre total de aulas / contagem
            if any(w in q_norm for w in ["quantas aulas", "total de aulas", "quantidade"]):
                total = sum(len(items) for items in by_day.values())
                dias_count = len(by_day)
                return f"Você tem um total de **{total} aulas semanais** distribuídas em **{dias_count} dias letivos**! 🗓️✨"

            # Pergunta sobre turma específica (ex: 7º ano, 6º ano)
            for turma_num in ["6", "7", "8", "9", "1", "2", "3"]:
                if f"{turma_num}º" in q_norm or f"{turma_num}o" in q_norm or f"{turma_num} ano" in q_norm:
                    turma_matches = []
                    for _, d_name in day_names_canonical:
                        if d_name in by_day:
                            for slot, info in by_day[d_name]:
                                if f"{turma_num}º" in info or f"{turma_num}°" in info or f"{turma_num}o" in info.lower() or f"{turma_num} ano" in info.lower():
                                    turma_matches.append(f"• **{d_name}** às **{slot}**: {info}")
                    if turma_matches:
                        return f"Encontrei as seguintes aulas para o **{turma_num}º ano**: 📚✨<br><br>" + "<br>".join(turma_matches)

            # Visão semanal completa com ordenação cronológica estrita
            total_aulas = sum(len(items) for items in by_day.values())
            dias_letivos = len(by_day)
            lines = [f"🗓️ **Grade Semanal do Professor** ({total_aulas} aulas em {dias_letivos} dias letivos)<br>"]
            for _, d_name in day_names_canonical:
                if d_name in by_day and by_day[d_name]:
                    lines.append(f"📅 **{d_name}**:<br>" + "<br>".join([f"• **{slot}**: {info}" for slot, info in by_day[d_name]]) + "<br>")
            return "<br>".join(lines).strip()

        if tables:
            t = tables[0]
            rows = t.get("rows") or []
            preview = [" | ".join(str(c) for c in r) for r in rows[:6]]
            return "Encontrei os seguintes dados na tela:<br><br>" + "<br>".join(preview)

        return f"Não encontrei dados suficientes na tela atual para responder '{query}'. Certifique-se de estar na aba correspondente do portal. 🔍"

    def start_background(self):
        """Inicia o servidor WebSocket em thread dedicada com retry resiliente."""
        if ws_serve is None:
            logger.warning("[ExtensionBridge] Pacote 'websockets' não disponível. Operando apenas com CDP fallback.")
            return

        def _run_server():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)

            async def _start():
                max_retries = 5
                for attempt in range(1, max_retries + 1):
                    try:
                        self.server = await ws_serve(self._handle_connection, "127.0.0.1", self.port)
                        logger.info(f"[ExtensionBridge] ✅ Servidor WebSocket ativo em ws://127.0.0.1:{self.port}")
                        await self.server.wait_closed()
                        break
                    except Exception as se:
                        logger.warning(f"[ExtensionBridge] Tentativa {attempt}/{max_retries} falhou na porta {self.port}: {se}")
                        if attempt < max_retries:
                            await asyncio.sleep(1.0)
                        else:
                            logger.error(f"[ExtensionBridge] Falha definitiva ao iniciar WebSocket na porta {self.port}.")

            try:
                self._loop.run_until_complete(_start())
            except Exception as e:
                logger.warning(f"[ExtensionBridge] Loop encerrado: {e}")

        self._thread = threading.Thread(target=_run_server, daemon=True, name="ExtensionBridgeThread")
        self._thread.start()


# Instância global singleton
bridge_instance = ExtensionBridge()
