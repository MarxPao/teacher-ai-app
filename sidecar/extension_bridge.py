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

                    elif msg_type == "PING":
                        await websocket.send(json.dumps({"type": "PONG", "timestamp": time.time()}))

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
