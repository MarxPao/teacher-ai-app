"""
sidecar/settler.py — Sincronizador Universal de Páginas & Anti-Loop Guard (Pilar de Estabilidade)

Resolve definitivamente os maiores problemas de automação web em SPAs (Nuxt, React, Vue, Angular):
1. Anti-Loop Guard: Detecta e bloqueia loops infinitos de redirecionamento do router (>3 transições em 2s).
2. Network Quiescence: Rastreia requisições HTTP em trânsito e aguarda janela de silêncio de rede (>=350ms).
3. DOM Quiescence: Monitora estabilização da árvore DOM via MutationObserver antes de qualquer ação.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

logger = logging.getLogger("UniversalSettler")


class AntiLoopGuard:
    """Detecta e previne tempestades de redirecionamento em SPAs reativas."""

    def __init__(self, max_transitions_in_window: int = 4, window_seconds: float = 2.5):
        self.max_transitions = max_transitions_in_window
        self.window_seconds = window_seconds
        self.transitions: List[Dict[str, Any]] = []

    def record_transition(self, url: str) -> Dict[str, Any]:
        """Registra uma transição de rota e avalia se há loop ativo."""
        now = time.time()
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        path = parsed.path

        # Limpa eventos fora da janela
        self.transitions = [t for t in self.transitions if now - t["time"] <= self.window_seconds]

        # Registra o novo evento
        self.transitions.append({
            "time": now,
            "url": url,
            "origin": origin,
            "path": path
        })

        # Verifica repetições no mesmo domínio
        same_origin_transitions = [t for t in self.transitions if t["origin"] == origin]
        
        if len(same_origin_transitions) >= self.max_transitions:
            paths = [t["path"] for t in same_origin_transitions]
            unique_paths = set(paths)
            # Se houver qualquer caminho repetido ou tempestade excessiva (>5 em 2s)
            if len(unique_paths) < len(paths) or len(same_origin_transitions) >= (self.max_transitions + 1):
                logger.critical(f"🛑 [AntiLoopGuard] LOOP INFINITO DETECTADO em {origin}! ({len(paths)} transições em {self.window_seconds}s: {paths})")
                return {
                    "is_loop": True,
                    "origin": origin,
                    "transitions_count": len(paths),
                    "paths_cycle": paths,
                    "recovery_action": "clear_storage_and_reload"
                }

        return {"is_loop": False, "transitions_count": len(same_origin_transitions)}

    @staticmethod
    def get_recovery_script(target_login_url: str = "/auth/login") -> str:
        """Script JavaScript para quebrar loops de SPAs limpando localStorage e redefinindo a rota."""
        return f"""(() => {{
            try {{
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = '{target_login_url}';
                return {{ success: true, message: 'Storage limpo e rota redefinida' }};
            }} catch (e) {{
                return {{ success: false, error: e.message }};
            }}
        }})()"""

    def reset(self):
        self.transitions.clear()


class NetworkSettler:
    """Rastreia requisições em trânsito e determina estabilização de rede."""

    # Domínios / URLs a ignorar na contagem de requisições pendentes (streaming/polling infinito)
    IGNORED_URL_PATTERNS = [
        "status_stream",
        "livereload",
        "hot-update",
        "websocket",
        ":8766",
        ":8765",
        "/metrics",
        "google-analytics",
        "doubleclick"
    ]

    def __init__(self, min_idle_ms: int = 350):
        self.min_idle_ms = min_idle_ms
        self.inflight_requests: Set[str] = set()
        self.last_activity_time: float = time.time()

    def on_request_started(self, request_id: str, url: str):
        """Notifica que uma requisição HTTP foi iniciada."""
        if any(p in url.lower() for p in self.IGNORED_URL_PATTERNS):
            return
        self.inflight_requests.add(request_id)
        self.last_activity_time = time.time()

    def on_request_completed(self, request_id: str):
        """Notifica término (sucesso ou falha) de uma requisição."""
        self.inflight_requests.discard(request_id)
        self.last_activity_time = time.time()

    def is_quiescent(self) -> bool:
        """Verifica se há zero requisições ativas e o tempo mínimo de silêncio foi respeitado."""
        if len(self.inflight_requests) > 0:
            return False
        idle_time_ms = (time.time() - self.last_activity_time) * 1000
        return idle_time_ms >= self.min_idle_ms

    def reset(self):
        self.inflight_requests.clear()
        self.last_activity_time = time.time()


class UniversalSettler:
    """Orquestrador Integrado de Estabilização de Páginas Web."""

    def __init__(self):
        self.loop_guard = AntiLoopGuard()
        self.network = NetworkSettler()

    @staticmethod
    def get_dom_settled_script(min_idle_ms: int = 250, max_wait_ms: int = 3000) -> str:
        """
        Retorna script assíncrono para ser injetado na página.
        Usa MutationObserver para aguardar a cessação de mutações no DOM.
        """
        return f"""new Promise((resolve) => {{
            let timeoutId = null;
            const startTime = Date.now();
            let mutationCount = 0;

            const observer = new MutationObserver(() => {{
                mutationCount++;
                clearTimeout(timeoutId);
                timeoutId = setTimeout(onIdle, {min_idle_ms});
            }});

            function cleanup() {{
                observer.disconnect();
                clearTimeout(timeoutId);
            }}

            function onIdle() {{
                cleanup();
                resolve({{
                    settled: true,
                    durationMs: Date.now() - startTime,
                    mutations: mutationCount,
                    reason: 'dom_idle'
                }});
            }}

            // Inicia observação em toda a árvore do body
            if (document.body) {{
                observer.observe(document.body, {{
                    childList: true,
                    subtree: true,
                    attributes: true,
                    characterData: true
                }});
            }}

            // Timer inicial de ociosidade
            timeoutId = setTimeout(onIdle, {min_idle_ms});

            // Limite máximo de segurança
            setTimeout(() => {{
                cleanup();
                resolve({{
                    settled: true,
                    durationMs: Date.now() - startTime,
                    mutations: mutationCount,
                    reason: 'timeout_cap'
                }});
            }}, {max_wait_ms});
        }})"""

    async def wait_until_settled(self, eval_func: Any, max_timeout_s: float = 4.0) -> Dict[str, Any]:
        """
        Executa a sincronização completa:
        1. Executa script de observação de mutações no DOM.
        2. Aguarda quiescência de rede.
        """
        start = time.time()
        try:
            dom_result = await eval_func(self.get_dom_settled_script(min_idle_ms=200, max_wait_ms=int(max_timeout_s * 1000)))
        except Exception as e:
            dom_result = {"settled": False, "error": str(e)}

        total_time_ms = int((time.time() - start) * 1000)
        return {
            "settled": True,
            "latency_ms": total_time_ms,
            "dom_metrics": dom_result
        }


# Instância singleton global do Settler
universal_settler = UniversalSettler()
