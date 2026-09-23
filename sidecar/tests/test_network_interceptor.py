"""
sidecar/tests/test_network_interceptor.py — Testes Unitários do Oráculo de Rede CDP (Network Interceptor)
"""

import pytest
import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from skills.network_interceptor_skill import CDPNetworkInterceptor


def test_interceptor_captures_successful_api_call():
    interceptor = CDPNetworkInterceptor()

    # 1. Simula envio de POST para salvar notas
    interceptor.handle_request_will_be_sent({
        "requestId": "req_101",
        "request": {
            "url": "https://portaleducacao.redesantacatarina.org.br/api/v1/notas/salvar",
            "method": "POST",
            "postData": '{"turmaId": 12, "notas": [{"alunoId": 5, "valor": 9.5}]}'
        },
        "type": "Fetch"
    })

    # 2. Simula resposta HTTP 200 OK
    interceptor.handle_response_received({
        "requestId": "req_101",
        "response": {
            "status": 200,
            "statusText": "OK",
            "headers": {"content-type": "application/json"}
        }
    })

    # 3. Finalização com corpo JSON de sucesso
    interceptor.handle_loading_finished(
        {"requestId": "req_101"},
        body='{"sucesso": true, "mensagem": "Notas gravadas com sucesso"}'
    )

    verdict = interceptor.evaluate_action_network()
    assert verdict["has_api_traffic"] is True
    assert verdict["success"] is True
    assert verdict["status_code"] == 200
    assert "confirmou operação com HTTP 200" in verdict["details"]


def test_interceptor_captures_api_error_with_business_message():
    interceptor = CDPNetworkInterceptor()

    # Simula chamada de fechamento com erro de prazo
    interceptor.handle_request_will_be_sent({
        "requestId": "req_102",
        "request": {
            "url": "https://portaleducacao.redesantacatarina.org.br/api/v1/frequencia/fechar",
            "method": "POST"
        },
        "type": "XHR"
    })

    interceptor.handle_response_received({
        "requestId": "req_102",
        "response": {
            "status": 422,
            "statusText": "Unprocessable Entity"
        }
    })

    interceptor.handle_loading_finished(
        {"requestId": "req_102"},
        body='{"erro": "Prazo encerrado para digitação de frequências pela coordenação"}'
    )

    verdict = interceptor.evaluate_action_network()
    assert verdict["has_api_traffic"] is True
    assert verdict["success"] is False
    assert verdict["status_code"] == 422
    assert verdict["error_reason"] == "API_HTTP_ERROR"
    assert "Prazo encerrado para digitação" in verdict["details"]


def test_interceptor_detects_business_failure_inside_http_200():
    interceptor = CDPNetworkInterceptor()

    # Muito comum em portais legados: HTTP 200 com payload { sucesso: false }
    interceptor.handle_request_will_be_sent({
        "requestId": "req_103",
        "request": {
            "url": "https://paineldoaluno.com.br/gravar_notas.aspx",
            "method": "POST"
        },
        "type": "XHR"
    })

    interceptor.handle_response_received({
        "requestId": "req_103",
        "response": {
            "status": 200,
            "statusText": "OK"
        }
    })

    interceptor.handle_loading_finished(
        {"requestId": "req_103"},
        body='{"sucesso": false, "mensagem": "Aluno com matrícula trancada"}'
    )

    verdict = interceptor.evaluate_action_network()
    assert verdict["has_api_traffic"] is True
    assert verdict["success"] is False
    assert verdict["error_reason"] == "BUSINESS_VALIDATION_ERROR"
    assert "Aluno com matrícula trancada" in verdict["details"]
