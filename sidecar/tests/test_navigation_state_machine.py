"""
test_navigation_state_machine.py — Testes unitários da Etapa 2

Coberturas:
  - Detecção de cada estado via URL, DOM, texto visível
  - LOGIN_PENDING nunca avança
  - BLOCKED nunca avança
  - TABELA_ALVO_ENCONTRADA reconhecida corretamente
  - navigate_to_target para ao primeiro requires_human
  - navigate_to_target respeita limite de passos
  - Mensagens humanas não contêm jargões técnicos

Todos os testes são unitários — nenhum precisa de Chrome rodando.
"""

import asyncio
import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from navigation_state_machine import (
    NavigationStateMachine,
    NavState,
    NavResult,
    _find_profile,
    MACHADO_SOBRINHO_PROFILE,
    GENERIC_PROFILE,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers para criar páginas mockadas
# ─────────────────────────────────────────────────────────────────────────────

def make_page(
    url: str = "https://example.com",
    title: str = "Página Teste",
    page_text: str = "",
    dom_results: dict = None,
    table_count: dict = None,
    locator_count: int = 0,
) -> MagicMock:
    """Cria um mock de Page do Playwright."""
    page = MagicMock()
    page.url = url

    async def _title():
        return title
    page.title = _title

    async def _evaluate(script, *args):
        if "_DOM_INSPECT_JS" in script or "selectors" in str(script):
            # Retorno DOM inspect
            return dom_results or {}
        if "_PAGE_TEXT_JS" in script or "chunks" in str(script):
            return page_text.lower()
        if "_COUNT_TABLE_INPUTS_JS" in script or "tableSelector" in str(script):
            return table_count or {"rows": 0, "inputs": 0, "editable": False}
        return {}
    page.evaluate = _evaluate

    # locator mock
    loc = MagicMock()
    loc.count = AsyncMock(return_value=locator_count)
    loc.is_visible = AsyncMock(return_value=locator_count > 0)
    loc.click = AsyncMock()
    loc.first = loc
    page.locator = MagicMock(return_value=loc)
    page.get_by_text = MagicMock(return_value=loc)

    page.goto = AsyncMock()
    page.wait_for_load_state = AsyncMock()

    return page


# ─────────────────────────────────────────────────────────────────────────────
# Testes de _find_profile
# ─────────────────────────────────────────────────────────────────────────────

class TestFindProfile:
    def test_machado_sobrinho_domain(self):
        p = _find_profile("https://machadosobrinho.paineldoaluno.com.br/inicio")
        assert p is MACHADO_SOBRINHO_PROFILE

    def test_paineldoprofessor_domain(self):
        p = _find_profile("https://paineldoprofessor.example.com/")
        assert p is MACHADO_SOBRINHO_PROFILE

    def test_unknown_domain_returns_generic(self):
        p = _find_profile("https://portal.exemplo.prefeitura.gov.br/")
        assert p is GENERIC_PROFILE


# ─────────────────────────────────────────────────────────────────────────────
# Testes de detect_current_state
# ─────────────────────────────────────────────────────────────────────────────

class TestDetectState:

    def _run(self, coro):
        return asyncio.run(coro)

    def setup_method(self):
        self.sm = NavigationStateMachine()

    # ── LOGIN por URL ────────────────────────────────────────────────────────

    def test_login_pending_url_login_fragment(self):
        page = make_page(url="https://machadosobrinho.paineldoaluno.com.br/login")
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.LOGIN_PENDING
        assert result.requires_human is True

    def test_login_pending_url_auth_fragment(self):
        page = make_page(url="https://portal.escola.gov.br/auth/entrar")
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.LOGIN_PENDING
        assert result.requires_human is True

    # ── LOGIN por DOM ────────────────────────────────────────────────────────

    def test_login_pending_dom_password_and_cpf(self):
        dom = {
            "input[type='password']": {"exists": True, "visible": True, "text": ""},
            "input[name*='senha' i]": {"exists": True, "visible": True, "text": ""},
            "input[placeholder*='cpf' i]": {"exists": False, "visible": False, "text": ""},
            "input[placeholder*='senha' i]": {"exists": False, "visible": False, "text": ""},
            "button[type='submit']": {"exists": True, "visible": True, "text": "Entrar"},
        }
        page = make_page(
            url="https://machadosobrinho.paineldoaluno.com.br/dashboard",
            dom_results=dom,
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.LOGIN_PENDING

    # ── LOGIN por texto visível ──────────────────────────────────────────────

    def test_login_pending_text_cpf_e_senha(self):
        page = make_page(
            url="https://portal.escola.gov.br/inicio",
            page_text="Digite seu cpf e senha para acessar o sistema",
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.LOGIN_PENDING
        assert result.requires_human is True

    def test_login_pending_text_sessao_expirou(self):
        page = make_page(
            url="https://portal.escola.gov.br/home",
            page_text="sua sessão expirou. faça login novamente.",
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.LOGIN_PENDING

    # ── BLOCKED por URL ──────────────────────────────────────────────────────

    def test_blocked_cloudflare_challenge_url(self):
        page = make_page(url="https://machadosobrinho.com/cdn-cgi/challenge")
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.BLOCKED
        assert result.requires_human is True

    # ── TABELA_ALVO_ENCONTRADA ───────────────────────────────────────────────

    def test_tabela_alvo_encontrada_com_inputs(self):
        page = make_page(
            url="https://machadosobrinho.paineldoaluno.com.br/diario/lancamento",
            table_count={"rows": 35, "inputs": 35, "editable": True},
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.TABELA_ALVO_ENCONTRADA
        assert result.requires_human is False
        assert result.details["rows"] == 35

    def test_tabela_sem_inputs_nao_e_target(self):
        """Uma tabela sem inputs (readonly) não deve ser considerada alvo de lançamento."""
        page = make_page(
            url="https://machadosobrinho.paineldoaluno.com.br/diario/lancamento",
            table_count={"rows": 10, "inputs": 0, "editable": False},
            page_text="notas frequencia alunos",
        )
        result = self._run(self.sm.detect_current_state(page))
        # Sem inputs editáveis, não é TABELA_ALVO — deve ser ETAPA_SELECIONADA
        assert result.state == NavState.ETAPA_SELECIONADA

    # ── MENU_PRINCIPAL ───────────────────────────────────────────────────────

    def test_menu_principal_por_texto(self):
        page = make_page(
            url="https://machadosobrinho.paineldoaluno.com.br/dashboard",
            page_text="bem-vindo ao painel do professor. minhas turmas e diário disponíveis.",
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.MENU_PRINCIPAL

    def test_menu_principal_por_url(self):
        page = make_page(
            url="https://machadosobrinho.paineldoaluno.com.br/dashboard",
            page_text="",
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.MENU_PRINCIPAL

    # ── ETAPA_SELECIONADA ────────────────────────────────────────────────────

    def test_etapa_selecionada_contexto_notas_sem_tabela(self):
        page = make_page(
            url="https://machadosobrinho.paineldoaluno.com.br/notas/lancamento",
            page_text="lançar nota bimestre frequência",
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.ETAPA_SELECIONADA

    # ── UNKNOWN ──────────────────────────────────────────────────────────────

    def test_unknown_pagina_generica(self):
        page = make_page(
            url="https://portal.escola.gov.br/noticias/1234",
            page_text="notícia sobre o calendário letivo",
        )
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.UNKNOWN


# ─────────────────────────────────────────────────────────────────────────────
# Testes de navigate_to_target
# ─────────────────────────────────────────────────────────────────────────────

class TestNavigateToTarget:

    def _run(self, coro):
        return asyncio.run(coro)

    def setup_method(self):
        self.sm = NavigationStateMachine(max_nav_steps=5)
        self.task = {
            "portal": "https://machadosobrinho.paineldoaluno.com.br",
            "turma": "7 ANO B",
            "disciplina": "História",
            "etapa": "2° Bimestre",
            "action_type": "lancar_nota",
        }

    def test_para_imediatamente_em_login_pending(self):
        """Se o estado inicial é LOGIN_PENDING, o navigate_to_target deve parar na primeira detecção."""
        page = make_page(url="https://machadosobrinho.paineldoaluno.com.br/login")
        result = self._run(self.sm.navigate_to_target(page, self.task))
        assert result.state == NavState.LOGIN_PENDING
        assert result.requires_human is True
        # Nenhum goto foi chamado (não tentou navegar)
        page.goto.assert_not_called()

    def test_para_imediatamente_em_blocked(self):
        """Se o estado inicial é BLOCKED, para e retorna sem tentar ações."""
        page = make_page(url="https://machadosobrinho.paineldoaluno.com.br/cdn-cgi/challenge")
        result = self._run(self.sm.navigate_to_target(page, self.task))
        assert result.state == NavState.BLOCKED
        assert result.requires_human is True

    def test_trace_e_registrado(self):
        """O trace deve conter passos registrados."""
        page = make_page(url="https://machadosobrinho.paineldoaluno.com.br/login")
        result = self._run(self.sm.navigate_to_target(page, self.task))
        assert len(result.trace) >= 1

    def test_on_state_change_chamado(self):
        """O callback on_state_change deve ser chamado com o estado detectado."""
        page = make_page(url="https://machadosobrinho.paineldoaluno.com.br/login")
        estados = []
        def cb(state, res):
            estados.append(state)
        self._run(self.sm.navigate_to_target(page, self.task, on_state_change=cb))
        assert NavState.LOGIN_PENDING in estados

    def test_respeita_limite_de_passos(self):
        """Se não consegue chegar ao alvo após max_nav_steps, retorna o estado atual."""
        # Página que nunca muda — sempre UNKNOWN
        page = make_page(
            url="https://machadosobrinho.paineldoaluno.com.br/pagina-que-nao-existe",
            page_text="",
        )
        sm = NavigationStateMachine(max_nav_steps=3)
        result = self._run(sm.navigate_to_target(page, self.task))
        # Não chegou na tabela, mas não travou para sempre
        assert result.state != NavState.TABELA_ALVO_ENCONTRADA
        assert result.elapsed_ms >= 0


# ─────────────────────────────────────────────────────────────────────────────
# Testes das mensagens humanas (sem jargões técnicos)
# ─────────────────────────────────────────────────────────────────────────────

class TestHumanMessages:
    TECHNICAL_TERMS = [
        "cdp", "playwright", "asyncio", "locator", "dom", "selector",
        "css", "exception", "traceback", "json", "api", "http", "url",
        "ECONNREFUSED", "stacktrace", "TypeError", "AttributeError",
    ]

    def _run(self, coro):
        return asyncio.run(coro)

    def setup_method(self):
        self.sm = NavigationStateMachine()

    def _check_no_jargon(self, message: str):
        msg_lower = message.lower()
        for term in self.TECHNICAL_TERMS:
            assert term.lower() not in msg_lower, (
                f"Jargão técnico '{term}' encontrado na mensagem para o usuário: {message!r}"
            )

    def test_login_message_sem_jargao(self):
        page = make_page(url="https://portal.escola.gov.br/login")
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.LOGIN_PENDING
        self._check_no_jargon(result.human_message)
        assert len(result.human_message) > 20

    def test_blocked_message_sem_jargao(self):
        page = make_page(url="https://portal.escola.gov.br/cdn-cgi/challenge")
        result = self._run(self.sm.detect_current_state(page))
        assert result.state == NavState.BLOCKED
        self._check_no_jargon(result.human_message)

    def test_login_message_menciona_professora(self):
        page = make_page(url="https://portal.escola.gov.br/login")
        result = self._run(self.sm.detect_current_state(page))
        assert "professora" in result.human_message.lower()


# ─────────────────────────────────────────────────────────────────────────────
# Testes de elapsed_ms (garantia de que o tempo é medido)
# ─────────────────────────────────────────────────────────────────────────────

class TestPerformance:
    def _run(self, coro):
        return asyncio.run(coro)

    def test_elapsed_ms_e_positivo(self):
        sm = NavigationStateMachine()
        page = make_page(url="https://portal.escola.gov.br/login")
        result = self._run(sm.detect_current_state(page))
        assert result.elapsed_ms >= 0
        assert result.elapsed_ms < 5000  # menos de 5 segundos para um mock


# ─────────────────────────────────────────────────────────────────────────────
# Runner direto (sem pytest)
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pytest as _pytest
    sys.exit(_pytest.main([__file__, "-v", "--tb=short"]))
