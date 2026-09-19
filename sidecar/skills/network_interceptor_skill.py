"""
sidecar/skills/network_interceptor_skill.py — Oráculo Factual por Intercepção de Rede CDP

Resolve o problema da "verificação cega":
1. CDPNetworkInterceptor: Monitora eventos HTTP (XHR/Fetch) via Chrome DevTools Protocol
   (Network.requestWillBeSent, Network.responseReceived, Network.loadingFinished).
2. Validação Factual de APIs: Valida cliques em 'Salvar' e 'Enviar' diretamente pelas respostas das APIs do portal.
3. Diagnóstico de Erros de Negócio: Se a API retornar erro (400/422/500), extrai a mensagem real do JSON
   do backend (ex: 'Prazo de digitação de notas expirado') eliminando falsos positivos e timeouts.
"""

import asyncio
import json
import logging
import re
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

logger = logging.getLogger("NetworkInterceptorSkill")


class CapturedRequest:
    """Registro de uma requisição de rede interceptada durante a execução de uma ação."""

    def __init__(
        self,
        request_id: str,
        url: str,
        method: str,
        resource_type: str = "Fetch",
        post_data: Optional[str] = None
    ):
        self.request_id = request_id
        self.url = url
        self.method = method.upper()
        self.resource_type = resource_type
        self.post_data = post_data
        self.status_code: Optional[int] = None
        self.status_text: str = ""
        self.response_headers: Dict[str, str] = {}
        self.response_body: Optional[str] = None
        self.error_text: Optional[str] = None
        self.start_time: float = time.time()
        self.end_time: Optional[float] = None

    @property
    def is_api_call(self) -> bool:
        """Determina se a requisição é uma chamada de API (XHR ou Fetch)."""
        if self.resource_type.lower() in ("xhr", "fetch"):
            return True
        # Exclui assets estáticos
        if re.search(r"\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)(\?.*)?$", self.url, re.I):
            return False
        return self.method in ("POST", "PUT", "PATCH", "DELETE")

    @property
    def is_success(self) -> bool:
        """Retorna True se o status HTTP for 2xx."""
        return self.status_code is not None and 200 <= self.status_code < 300

    @property
    def json_body(self) -> Optional[Any]:
        """Tenta fazer o parse do corpo da resposta como JSON."""
        if not self.response_body:
            return None
        try:
            return json.loads(self.response_body)
        except Exception:
            return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "url": self.url,
            "method": self.method,
            "status_code": self.status_code,
            "is_api_call": self.is_api_call,
            "duration_ms": int(((self.end_time or time.time()) - self.start_time) * 1000),
            "error_text": self.error_text
        }


class CDPNetworkInterceptor:
    """Interceptador e analisador de tráfego de rede para validação de ações do navegador."""

    def __init__(self, cdp_session: Optional[Any] = None):
        self.cdp = cdp_session
        self.requests: Dict[str, CapturedRequest] = {}
        self.is_monitoring = False

    def handle_request_will_be_sent(self, params: Dict[str, Any]) -> None:
        """Manipulador do evento Network.requestWillBeSent do CDP."""
        req_id = params.get("requestId", "")
        req_data = params.get("request", {})
        url = req_data.get("url", "")
        method = req_data.get("method", "GET")
        res_type = params.get("type", "Fetch")
        post_data = req_data.get("postData")

        req = CapturedRequest(
            request_id=req_id,
            url=url,
            method=method,
            resource_type=res_type,
            post_data=post_data
        )
        self.requests[req_id] = req

    def handle_response_received(self, params: Dict[str, Any]) -> None:
        """Manipulador do evento Network.responseReceived do CDP."""
        req_id = params.get("requestId", "")
        resp_data = params.get("response", {})
        req = self.requests.get(req_id)
        if req:
            req.status_code = resp_data.get("status")
            req.status_text = resp_data.get("statusText", "")
            req.response_headers = resp_data.get("headers", {})

    def handle_loading_finished(self, params: Dict[str, Any], body: Optional[str] = None) -> None:
        """Manipulador do evento Network.loadingFinished do CDP."""
        req_id = params.get("requestId", "")
        req = self.requests.get(req_id)
        if req:
            req.end_time = time.time()
            if body:
                req.response_body = body

    def handle_loading_failed(self, params: Dict[str, Any]) -> None:
        """Manipulador do evento Network.loadingFailed do CDP."""
        req_id = params.get("requestId", "")
        req = self.requests.get(req_id)
        if req:
            req.end_time = time.time()
            req.error_text = params.get("errorText", "Network failed")

    def reset(self) -> None:
        """Limpa as requisições gravadas."""
        self.requests.clear()

    def evaluate_action_network(self, filter_mutation_only: bool = True) -> Dict[str, Any]:
        """
        Analisa todas as requisições geradas pela ação e retorna o veredito factual de rede.
        Retorna:
        - success: True | False | None (None se nenhuma API foi disparada)
        - details: Explicação do status factual
        - relevant_requests: lista de chamadas de API capturadas
        """
        api_requests = [r for r in self.requests.values() if r.is_api_call]
        if filter_mutation_only:
            mutation_requests = [r for r in api_requests if r.method in ("POST", "PUT", "PATCH", "DELETE")]
            if mutation_requests:
                api_requests = mutation_requests

        if not api_requests:
            return {
                "has_api_traffic": False,
                "success": None,
                "details": "Nenhuma chamada de API observada durante a ação.",
                "relevant_requests": []
            }

        # 1. Verifica falhas explícitas de HTTP (4xx ou 5xx)
        failed = [r for r in api_requests if r.status_code and r.status_code >= 400]
        if failed:
            worst = failed[0]
            # Tenta extrair mensagem amigável do backend
            err_msg = self._extract_error_message(worst)
            return {
                "has_api_traffic": True,
                "success": False,
                "status_code": worst.status_code,
                "error_reason": "API_HTTP_ERROR",
                "details": f"API retornou HTTP {worst.status_code}: {err_msg}",
                "endpoint": worst.url,
                "relevant_requests": [r.to_dict() for r in api_requests]
            }

        # 2. Verifica falhas de rede no transporte
        net_failed = [r for r in api_requests if r.error_text]
        if net_failed:
            return {
                "has_api_traffic": True,
                "success": False,
                "error_reason": "NETWORK_FAILED",
                "details": f"Falha de transporte de rede: {net_failed[0].error_text}",
                "relevant_requests": [r.to_dict() for r in api_requests]
            }

        # 3. Verifica sucessos (2xx)
        success_reqs = [r for r in api_requests if r.is_success]
        if success_reqs:
            # Checa se o corpo JSON não carrega erro de negócio com HTTP 200 (comum em sistemas legados)
            for s_req in success_reqs:
                biz_err = self._check_business_error_in_json(s_req)
                if biz_err:
                    return {
                        "has_api_traffic": True,
                        "success": False,
                        "status_code": 200,
                        "error_reason": "BUSINESS_VALIDATION_ERROR",
                        "details": f"API retornou erro de negócio no corpo: {biz_err}",
                        "endpoint": s_req.url,
                        "relevant_requests": [r.to_dict() for r in api_requests]
                    }

            return {
                "has_api_traffic": True,
                "success": True,
                "status_code": success_reqs[0].status_code,
                "details": f"API de backend confirmou operação com HTTP {success_reqs[0].status_code}.",
                "endpoint": success_reqs[0].url,
                "relevant_requests": [r.to_dict() for r in api_requests]
            }

        return {
            "has_api_traffic": True,
            "success": None,
            "details": "Requisições de API em trânsito sem resposta definitiva.",
            "relevant_requests": [r.to_dict() for r in api_requests]
        }

    @staticmethod
    def _extract_error_message(req: CapturedRequest) -> str:
        """Extrai mensagem de erro humana do corpo JSON ou do status text."""
        body = req.json_body
        if isinstance(body, dict):
            for k in ("message", "mensagem", "error", "erro", "detail", "detalhe", "description"):
                if k in body and body[k]:
                    return str(body[k])
        return req.status_text or f"Erro {req.status_code}"

    @staticmethod
    def _check_business_error_in_json(req: CapturedRequest) -> Optional[str]:
        """Detecta respostas com HTTP 200 que carregam erro no payload JSON (ex: { sucesso: false })."""
        body = req.json_body
        if isinstance(body, dict):
            if body.get("sucesso") is False or body.get("success") is False:
                return body.get("mensagem") or body.get("message") or body.get("erro") or "Falha indicada no payload JSON"
            if body.get("temErro") is True or body.get("hasError") is True:
                return body.get("mensagem") or "Erro indicado pelo backend"
        return None
