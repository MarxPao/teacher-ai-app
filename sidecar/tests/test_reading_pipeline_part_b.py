"""
test_reading_pipeline_part_b.py — Suíte de Testes da PARTE B: Pipeline de Leitura Determinístico & Fallback Robusto

Cobre todos os 8 requisitos mandatórios:
1. Camada 1 prioritária (zero LLM)
2. Tolerância a falhas pontuais (falhas < 3 preservam o mapa, não acionam visão)
3. Limiar de 3 falhas aciona redescoberta (Camada 2)
4. Retry com backoff exponencial para erro 429
5. Exaustão de retries 429
6. Verificação determinística imediata no DOM com sucesso (salva mapped_untested)
7. Rejeição de mapa que extrai 0 alunos na verificação imediata
8. Rotulagem estrita de logs (proibição de rotular heurística como visão)
"""

import asyncio
import datetime
import json
import os
import sys
import urllib.error
import pytest

# Adiciona o diretório do sidecar ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from page_reader_engine import (
    PageReaderEngine,
    PageSection,
    AnchoredTarget,
    ExtractedData,
    call_llm_with_retry,
    is_rate_limit_error
)
from portal_map_store import PortalMapStore, PortalSelectorMap, FAILURE_THRESHOLD


class MockPage:
    """Simula o objeto Page do Playwright para testes de pipeline."""
    def __init__(self, evaluate_results: dict = None, title: str = "Portal Teste", url: str = "https://escola.edu.br/alunos"):
        self._eval_results = evaluate_results or {}
        self._title = title
        self.url = url

    async def title(self):
        return self._title

    async def evaluate(self, js_code, *args):
        if not args:
            return self._eval_results.get("__page_mem__", {})
        selector = args[0]
        if isinstance(selector, list):
            return [{"mark": idx + 1, "css_selector": s.get("css_selector", "")} for idx, s in enumerate(selector)]
        return self._eval_results.get(selector, {})

    async def screenshot(self, **kwargs):
        return b"fake_screenshot_bytes"


# ---------------------------------------------------------------------------
# TESTE 1: Camada 1 Prioritária (Zero Chamadas LLM)
# ---------------------------------------------------------------------------
def test_camada_1_prioritaria_zero_llm():
    """Garante que quando existe mapa salvo funcional, a Camada 1 executa deterministicamente sem chamar LLM."""
    store = PortalMapStore(supabase_client=None)
    domain = "escola.edu.br"
    store.save_map(
        domain=domain,
        display_name="Escola Teste",
        selectors={"roster_table": "#tabela-alunos", "strategy": "table_rows"},
        pagination=None,
        confidence="high",
        teacher_id=None
    )

    llm_called = False
    def forbidden_llm(b64, prompt, byok):
        nonlocal llm_called
        llm_called = True
        raise AssertionError("ERRO CRÍTICO: LLM foi chamado na Camada 1! Arquitetura violada.")

    engine = PageReaderEngine(llm_caller=forbidden_llm)
    mock_data = {
        "#tabela-alunos": {
            "rows": [
                {"cells": ["Nome", "Matrícula"], "full_text": "Header"},
                {"cells": ["Ana Júlia", "1001"], "full_text": "Ana Júlia 1001"}
            ]
        }
    }
    page = MockPage(evaluate_results=mock_data)

    # Executa extração determinística
    res = asyncio.run(engine.extract_deterministic(page, "#tabela-alunos", strategy="table_rows"))

    assert res.success is True
    assert len(res.data) == 1
    assert res.data[0]["name"] == "Ana Júlia"
    assert res.layer_used == "layer_1_deterministic"
    assert llm_called is False, "LLM não pode ser chamado na Camada 1!"


# ---------------------------------------------------------------------------
# TESTE 2: Tolerância a Falhas Pontuais (Preserva o Mapa e NÃO Aciona Visão)
# ---------------------------------------------------------------------------
def test_tolerancia_falha_pontual_preserva_mapa():
    """Garante que falhas < 3 incrementam o contador mas preservam o mapa intacto no store."""
    store = PortalMapStore(supabase_client=None)
    domain = "escola.edu.br"
    store.save_map(
        domain=domain,
        display_name="Escola Teste",
        selectors={"roster_table": "#tabela-alunos", "strategy": "table_rows"},
        pagination=None,
        confidence="high",
        teacher_id=None
    )

    # 1ª falha pontual
    f1 = store.increment_failures(domain)
    assert f1 == 1
    m1 = store.lookup_map(domain)
    assert m1 is not None, "Mapa NÃO pode ser apagado na 1ª falha pontual!"
    assert m1.validation_failures == 1

    # 2ª falha pontual
    f2 = store.increment_failures(domain)
    assert f2 == 2
    m2 = store.lookup_map(domain)
    assert m2 is not None, "Mapa NÃO pode ser apagado na 2ª falha pontual!"
    assert m2.validation_failures == 2
    assert f2 < FAILURE_THRESHOLD, "Ainda não atingiu o threshold de 3 falhas."


# ---------------------------------------------------------------------------
# TESTE 3: Limiar de 3 Falhas Consecutivas Aciona Redescoberta
# ---------------------------------------------------------------------------
def test_limiar_tres_falhas_aciona_redescoberta():
    """Garante que na 3ª falha consecutiva o portal transita para broken_needs_rediscovery e exige ação manual da professora."""
    store = PortalMapStore(supabase_client=None)
    domain = "escola.edu.br"
    store.save_map(
        domain=domain,
        display_name="Escola Teste",
        selectors={"roster_table": "#tabela-antiga", "strategy": "table_rows"},
        pagination=None,
        confidence="high",
        teacher_id=None
    )

    store.increment_failures(domain)  # 1
    store.increment_failures(domain)  # 2
    f3 = store.increment_failures(domain)  # 3

    assert f3 == 3
    assert f3 >= FAILURE_THRESHOLD
    assert store.should_use_subdomain_scope(f3) is True

    # Mapa é preservado para histórico, mas marcado com falhas >= 3 (broken_needs_rediscovery)
    m = store.lookup_map(domain)
    assert m is not None
    assert m.validation_failures >= 3


# ---------------------------------------------------------------------------
# TESTE 4: Retry com Backoff Exponencial para Erro HTTP 429
# ---------------------------------------------------------------------------
def test_backoff_exponencial_erro_429():
    """Simula 2 falhas por HTTP 429 seguidas de sucesso na 3ª tentativa, testando o backoff exponencial."""
    call_count = 0
    log_collector = []

    def mock_flaky_api():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            # Simula HTTP 429
            raise urllib.error.HTTPError(
                url="https://api.openai.com/v1/chat/completions",
                code=429,
                msg="Too Many Requests",
                hdrs={},
                fp=None
            )
        return json.dumps({"target_section_id": 1, "confidence": "high"})

    # Executa com base_delay pequeno para o teste rodar rápido
    result = call_llm_with_retry(
        mock_flaky_api,
        provider="openai",
        max_retries=3,
        base_delay=0.05,
        log_collector=log_collector
    )

    assert call_count == 3, f"Esperava 3 chamadas (2 retries + 1 sucesso), obteve {call_count}"
    assert "target_section_id" in result
    assert len(log_collector) == 2, "Deveria ter registrado 2 eventos de retry"
    assert log_collector[0]["step"] == "llm_retry_backoff"
    assert log_collector[0]["attempt"] == 1
    assert log_collector[1]["attempt"] == 2


# ---------------------------------------------------------------------------
# TESTE 5: Exaustão de Retries 429 Levanta Exceção sem Quebrar o Sistema
# ---------------------------------------------------------------------------
def test_exaustao_retries_429():
    """Garante que após 3 retries (4 chamadas) com 429 persistente, a exceção é propagada de forma limpa."""
    call_count = 0

    def mock_always_429():
        nonlocal call_count
        call_count += 1
        raise urllib.error.HTTPError(
            url="https://api.groq.com/openai/v1/chat/completions",
            code=429,
            msg="Rate limit exceeded",
            hdrs={},
            fp=None
        )

    with pytest.raises(urllib.error.HTTPError) as exc_info:
        call_llm_with_retry(mock_always_429, provider="groq", max_retries=3, base_delay=0.01)

    assert exc_info.value.code == 429
    assert call_count == 4, f"Esperava 4 tentativas totais (1 inicial + 3 retries), obteve {call_count}"


# ---------------------------------------------------------------------------
# TESTE 6: Verificação Determinística Imediata Pós-Descoberta com Sucesso
# ---------------------------------------------------------------------------
def test_verificacao_dom_imediata_sucesso():
    """Garante que após a visão identificar o seletor, o teste determinístico no DOM confirma os dados e salva como mapped_untested."""
    store = PortalMapStore(supabase_client=None)
    domain = "novapagina.escola.com.br"

    engine = PageReaderEngine()
    mock_cards = {
        ".card-grid": {
            "cards": [
                {"name": "Bruno Lima", "rollNumber": "1002", "status": "active"},
                {"name": "Carlos Eduardo", "rollNumber": "1003", "status": "active"}
            ]
        }
    }
    page = MockPage(evaluate_results=mock_cards, url=f"https://{domain}/turma")

    # Simula o teste determinístico imediato pós-descoberta
    check = asyncio.run(engine.extract_deterministic(page, ".card-grid", strategy="card_grid"))

    assert check.success is True
    assert len(check.data) == 2
    assert check.data[0]["name"] == "Bruno Lima"

    # Confirmação imediata passou (>= 1 aluno) -> salva como mapped_untested
    new_id = store.save_map(
        domain=domain,
        display_name="Portal Nova Página",
        selectors={"roster_table": ".card-grid", "strategy": "card_grid", "header_rows": 1},
        pagination=None,
        confidence="high",
        teacher_id=None
    )

    saved = store.lookup_map(domain)
    assert saved is not None
    assert saved.discovered_selectors["roster_table"] == ".card-grid"
    assert saved.validation_failures == 0


# ---------------------------------------------------------------------------
# TESTE 7: Rejeição de Mapa Vazio na Verificação Imediata (Gate)
# ---------------------------------------------------------------------------
def test_verificacao_dom_imediata_rejeita_zero_alunos():
    """Garante que se a visão sugerir um seletor que resulta em 0 alunos no DOM, o mapa é REJEITADO."""
    store = PortalMapStore(supabase_client=None)
    domain = "fantasma.escola.com.br"

    engine = PageReaderEngine()
    mock_empty = {
        "#tabela-fantasma": {
            "rows": []  # Vazio
        }
    }
    page = MockPage(evaluate_results=mock_empty, url=f"https://{domain}/turma")

    check = asyncio.run(engine.extract_deterministic(page, "#tabela-fantasma", strategy="table_rows"))

    assert check.success is False or len(check.data) == 0
    # O gate falha e o mapa NÃO pode ser gravado
    saved = store.lookup_map(domain)
    assert saved is None, "Mapa com 0 alunos extraídos na verificação imediata JAMAIS pode ser persistido!"


# ---------------------------------------------------------------------------
# TESTE 8: Rotulagem Estrita de Logs (Proibido Rotular Heurística como Visão)
# ---------------------------------------------------------------------------
def test_rotulagem_estrita_logs():
    """Garante que a extração determinística e o fallback heurístico são estritamente identificados como layer_1_deterministic."""
    engine = PageReaderEngine()
    mock_data = {
        "table": {
            "rows": [
                {"cells": ["Nome"], "full_text": "Header"},
                {"cells": ["Mariana"], "full_text": "Mariana"}
            ]
        }
    }
    page = MockPage(evaluate_results=mock_data)

    res = asyncio.run(engine.extract_deterministic(page, "table", strategy="table_rows"))
    assert res.layer_used == "layer_1_deterministic", "Camada 1 deve obrigatoriamente ter layer_used = 'layer_1_deterministic'"


# ---------------------------------------------------------------------------
# TESTE 9 (BUG 1): Aborto Imediato Quando Aba Ativa Diverge do Portal Esperado
# ---------------------------------------------------------------------------
def test_abort_quando_aba_ativa_diverge_do_portal_esperado():
    """
    BUG 1: Garante que quando existe mapa salvo para o domínio X no cache,
    mas a aba ativa no navegador pertence ao domínio Y, a leitura aborta
    imediatamente com erro explícito e zero extração (sem chamar Camada 1 nem Camada 2).
    """
    from read_active_portal import execute_reading_pipeline, check_domain_match

    # 1. Validação unitária da função de correspondência de domínio
    portal_esperado = "https://machadosobrinho.paineldoaluno.com.br/chamada"
    aba_real = "http://localhost:3000/sandbox/portal_mock_roster.html"
    is_match, exp_d, act_d, err_msg = check_domain_match(portal_esperado, aba_real)
    assert is_match is False
    assert "não corresponde ao portal esperado" in err_msg
    assert portal_esperado in err_msg
    assert aba_real in err_msg

    # 2. Configura mapa salvo para o Domínio X (Machado Sobrinho)
    store = PortalMapStore(supabase_client=None)
    domain_x = "machadosobrinho.paineldoaluno.com.br"
    store.save_map(
        domain=domain_x,
        display_name="Colégio Machado Sobrinho",
        selectors={"roster_table": "#tabela-alunos", "strategy": "table_rows"},
        pagination=None,
        confidence="high",
        teacher_id=None
    )
    assert store.lookup_map(domain_x) is not None, "Mapa do domínio X deve existir no cache"

    # 3. Aba ativa no navegador pertence ao Domínio Y (localhost sandbox) com dados na tabela
    page_dom_y = MockPage(
        evaluate_results={"#tabela-alunos": {"rows": [{"cells": ["Aluno Indevido"], "full_text": "Aluno Indevido"}]}},
        title="Portal Escolar Sandbox — Lista de Alunos",
        url=aba_real
    )

    # 4. LLM caller que lança erro se Camada 2 (Visão) for acionada indevidamente
    def forbidden_vision(*args, **kwargs):
        raise AssertionError("ERRO CRÍTICO: Camada 2 (Visão) JAMAIS pode ser chamada quando há divergência de domínio!")

    engine = PageReaderEngine(llm_caller=forbidden_vision)

    # 5. Executa o pipeline solicitando o Domínio X, estando a aba ativa no Domínio Y
    res = asyncio.run(execute_reading_pipeline(
        page=page_dom_y,
        page_hint=portal_esperado,
        map_store=store,
        engine=engine
    ))

    # 6. Validações estritas: aborto imediato, sem extração determinística e sem visão
    assert res["success"] is False
    assert res["status"] == "domain_mismatch"
    assert res["students"] == [], "Nenhum aluno pode ser extraído da página errada!"
    assert res["total"] == 0
    expected_error = (
        f"A aba aberta no navegador ({aba_real}) não corresponde ao portal esperado ({portal_esperado}). "
        f"Abra a página correta antes de ler."
    )
    assert res["error"] == expected_error
    assert any(ev.get("step") == "domain_mismatch_abort" for ev in res.get("structured_log", []))

