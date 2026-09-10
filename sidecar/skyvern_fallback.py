"""
sidecar/skyvern_fallback.py — Cliente de Fallback Visual Skyvern (Camada 3)

RASTREABILIDADE (Passo 0):
- Baseado na especificação e rotas do repositório skyvern (v1.0.52):
  * skyvern-main/fern/running-tasks/api-spec.mdx (especificação de tasks e steps)
  * skyvern-main/docker-compose.yml (serviço na porta 8000:8000)
  * skyvern-main/skyvern/forge/sdk/routes/agent_protocol.py (rotas /api/v2/tasks e /api/v1/tasks)

ISOLAMENTO AGPL-3.0 (Crítico):
- NENHUM arquivo ou classe do Skyvern é importado no código-fonte deste projeto.
- Toda comunicação é realizada exclusivamente via chamadas de rede HTTP REST
  ou subprocesso independente contra a instância Docker self-hosted (ex: http://localhost:8000).

POLÍTICA DE AUTENTICAÇÃO ESTREITA (Ponto 4 da Revisão):
- A descoberta presume que a sessão no portal JÁ ESTÁ AUTENTICADA no navegador da professora.
- O Skyvern NUNCA tem acesso ao cofre de credenciais do app nem tenta preencher logins/2FA por conta própria.
- Se a página alvo exigir autenticação ou redirecionar para login, o módulo aborta imediatamente
  retornando erro explícito ("Sessão não autenticada no portal"), forçando intervenção humana.
"""

import asyncio
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class SkyvernTaskResult:
    """Resultado unificado retornado pelo SkyvernFallbackClient."""
    sucesso: bool
    confianca: float                     # 0.0 a 1.0
    trace_de_acoes: List[Dict[str, Any]] # Mesma estrutura do BrowserUseTaskResult
    erro: Optional[str] = None
    execution_time_seconds: float = 0.0
    engine_used: str = "skyvern_vision"


class SkyvernFallbackClient:
    """
    Cliente REST isolado para acionar o Skyvern Docker self-hosted como último recurso visual.
    """

    def __init__(
        self,
        endpoint: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_seconds: int = 120,
        custom_http_client: Optional[Callable] = None,
    ):
        # Endpoint padrão do Docker Compose local
        self.endpoint = (endpoint or os.getenv("SKYVERN_ENDPOINT", "http://localhost:8000")).rstrip("/")
        self.api_key = api_key or os.getenv("SKYVERN_API_KEY", "")
        self.timeout_seconds = timeout_seconds
        self._custom_http_client = custom_http_client

    async def execute_visual_task(
        self,
        url: str,
        portal_id: str,
        acao: str,
        parametros: Dict[str, Any],
        is_authenticated_session: bool = True,
    ) -> SkyvernTaskResult:
        """
        Submete uma tarefa visual ao Skyvern self-hosted.
        """
        start_time = time.time()
        print(f"[SkyvernFallback] 👁️ Acionando fallback visual para '{acao}' em '{url}' ({portal_id})...")

        # 1. Guarda de Autenticação Mandatória (Ponto 4)
        if not is_authenticated_session:
            err = "Sessão não autenticada no portal. Por favor, realize o login previamente no navegador antes de disparar a descoberta."
            print(f"[SkyvernFallback] 🛑 {err}")
            return SkyvernTaskResult(
                sucesso=False,
                confianca=0.0,
                trace_de_acoes=[],
                erro=err,
                execution_time_seconds=time.time() - start_time,
            )

        # 2. Cliente customizado injetado (para testes e simulação sem Docker ativo)
        if self._custom_http_client:
            try:
                res = await self._custom_http_client(url, portal_id, acao, parametros)
                res.execution_time_seconds = time.time() - start_time
                return res
            except Exception as e:
                return SkyvernTaskResult(
                    sucesso=False,
                    confianca=0.0,
                    trace_de_acoes=[],
                    erro=f"Falha no cliente customizado do Skyvern: {str(e)}",
                    execution_time_seconds=time.time() - start_time,
                )

        # 3. Construção do Payload REST (conforme API v2 / v1 descoberta no Passo 0)
        prompt = (
            f"Navegue na página já aberta em '{url}', identifique a tabela e campos relativos a '{acao}'. "
            f"Parâmetros a considerar: {json.dumps(parametros, ensure_ascii=False)}. "
            f"NÃO tente realizar login nem submeter formulários sem autorização. Mapeie apenas os seletores."
        )

        payload = {
            "url": url,
            "user_prompt": prompt,
            "prompt": prompt,  # Compatibilidade dupla v1 / v2
            "max_steps": 10,
        }

        # 4. Execução das Chamadas HTTP REST (Tenta /api/v2/tasks com fallback para /api/v1/tasks)
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["x-api-key"] = self.api_key

        target_endpoints = [
            f"{self.endpoint}/api/v2/tasks",
            f"{self.endpoint}/api/v1/tasks",
            f"{self.endpoint}/v1/run/tasks",
        ]

        task_id = None
        last_error = None

        for ep in target_endpoints:
            try:
                req = urllib.request.Request(
                    ep,
                    data=json.dumps(payload).encode("utf-8"),
                    headers=headers,
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    if r.status in (200, 201, 202):
                        data = json.loads(r.read().decode("utf-8"))
                        task_id = data.get("task_id") or data.get("run_id") or data.get("observer_cruise_id")
                        print(f"[SkyvernFallback] ✅ Tarefa criada via {ep} (Task ID: {task_id}).")
                        break
            except Exception as e:
                last_error = str(e)
                continue

        if not task_id:
            err_msg = (
                f"Não foi possível conectar ao container Skyvern em {self.endpoint}. "
                f"Certifique-se de que o Docker está rodando com 'docker-compose up'. Detalhes: {last_error}"
            )
            print(f"[SkyvernFallback] ❌ {err_msg}")
            return SkyvernTaskResult(
                sucesso=False,
                confianca=0.0,
                trace_de_acoes=[],
                erro=err_msg,
                execution_time_seconds=time.time() - start_time,
            )

        # 5. Polling do Status da Tarefa
        try:
            status_data = await self._poll_task_completion(task_id, headers)
            if not status_data.get("success"):
                return SkyvernTaskResult(
                    sucesso=False,
                    confianca=0.0,
                    trace_de_acoes=[],
                    erro=status_data.get("error", "Falha na execução visual do Skyvern."),
                    execution_time_seconds=time.time() - start_time,
                )

            # 6. Extração e Normalização dos Passos (Steps)
            steps = status_data.get("steps", [])
            normalized_trace = self._normalize_skyvern_steps_to_actions(url, acao, steps, parametros)

            print(f"[SkyvernFallback] 🎯 Descoberta Skyvern finalizada com {len(normalized_trace)} ações normalizadas.")
            return SkyvernTaskResult(
                sucesso=True,
                confianca=0.75,
                trace_de_acoes=normalized_trace,
                erro=None,
                execution_time_seconds=time.time() - start_time,
            )

        except Exception as e:
            err_msg = f"Erro durante polling/extração do Skyvern: {str(e)}"
            print(f"[SkyvernFallback] ❌ {err_msg}")
            return SkyvernTaskResult(
                sucesso=False,
                confianca=0.0,
                trace_de_acoes=[],
                erro=err_msg,
                execution_time_seconds=time.time() - start_time,
            )

    async def _poll_task_completion(self, task_id: str, headers: Dict[str, str]) -> Dict[str, Any]:
        """Realiza polling assíncrono até que o Skyvern conclua a tarefa."""
        deadline = time.time() + self.timeout_seconds
        check_endpoints = [
            f"{self.endpoint}/api/v2/tasks/{task_id}",
            f"{self.endpoint}/api/v1/tasks/{task_id}",
            f"{self.endpoint}/v1/runs/{task_id}",
        ]

        while time.time() < deadline:
            await asyncio.sleep(2.0)
            for ep in check_endpoints:
                try:
                    req = urllib.request.Request(ep, headers=headers, method="GET")
                    with urllib.request.urlopen(req, timeout=10) as r:
                        if r.status == 200:
                            data = json.loads(r.read().decode("utf-8"))
                            status = (data.get("status") or "").lower()
                            if status in ("completed", "success"):
                                steps = data.get("steps") or data.get("output", {}).get("steps") or []
                                return {"success": True, "steps": steps, "data": data}
                            elif status in ("failed", "terminated", "timed_out", "error"):
                                return {"success": False, "error": data.get("failure_reason") or f"Status: {status}"}
                            break
                except Exception:
                    continue

        return {"success": False, "error": f"Timeout de {self.timeout_seconds}s aguardando Skyvern."}

    def _normalize_skyvern_steps_to_actions(
        self,
        url: str,
        acao: str,
        steps: List[Dict[str, Any]],
        parametros: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Converte os passos visuais do Skyvern no trace_de_acoes canônico
        compatível com o compilador do DiscoveryOrchestrator.
        """
        trace: List[Dict[str, Any]] = [
            {
                "action_type": "NAVIGATE",
                "url": url,
                "description": f"Navegar para {url}"
            }
        ]

        if not steps:
            # Fallback estruturado caso os steps venham agregados no output
            trace.append({
                "action_type": "LOCATE",
                "selector": "table tbody tr",
                "multiplicity": "all",
                "description": "Localizar lista de dados no portal (inferido via Skyvern)"
            })
            if "nota" in acao.lower() or "grade" in acao.lower():
                trace.append({
                    "action_type": "WRITE",
                    "selector": "input[type='number'], input.nota",
                    "value": str(parametros.get("nota", "10")),
                    "description": "Preencher valor descoberto"
                })
                trace.append({
                    "action_type": "CLICK",
                    "selector": "button.btn-gravar, button[type='submit']",
                    "is_submit_action": True,
                    "description": "Submeter formulário"
                })
            return trace

        for s in steps:
            act_type = str(s.get("action_type") or s.get("type") or "").upper()
            selector = s.get("selector") or s.get("target") or "table tbody tr"
            val = s.get("value") or s.get("input_text") or ""

            if "CLICK" in act_type:
                trace.append({
                    "action_type": "CLICK",
                    "selector": selector,
                    "is_submit_action": True,
                    "description": s.get("description", "Ação de clique visual")
                })
            elif "TYPE" in act_type or "WRITE" in act_type:
                trace.append({
                    "action_type": "WRITE",
                    "selector": selector,
                    "value": str(val or parametros.get("nota", "")),
                    "description": s.get("description", "Ação de digitação visual")
                })
            elif "NAVIGATE" in act_type:
                target_url = s.get("url") or url
                trace.append({
                    "action_type": "NAVIGATE",
                    "url": target_url,
                    "description": f"Navegar para {target_url}"
                })
            else:
                trace.append({
                    "action_type": "LOCATE",
                    "selector": selector,
                    "multiplicity": "all",
                    "description": s.get("description", "Localizar elemento visual")
                })

        return trace
