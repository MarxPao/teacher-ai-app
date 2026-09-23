"""
Testes Unitários do Universal Settler & Anti-Loop Guard (Pilar de Estabilidade)
"""

import time
import pytest
from sidecar.settler import AntiLoopGuard, NetworkSettler, UniversalSettler


def test_anti_loop_guard_normal_navigation():
    guard = AntiLoopGuard(max_transitions_in_window=4, window_seconds=2.0)
    
    # 3 transições distintas e lentas
    res1 = guard.record_transition("https://portaleducacao.redesantacatarina.org.br/home")
    assert not res1["is_loop"]
    
    res2 = guard.record_transition("https://portaleducacao.redesantacatarina.org.br/notas")
    assert not res2["is_loop"]
    
    res3 = guard.record_transition("https://portaleducacao.redesantacatarina.org.br/frequencia")
    assert not res3["is_loop"]


def test_anti_loop_guard_catches_infinite_redirect_storm():
    guard = AntiLoopGuard(max_transitions_in_window=4, window_seconds=2.5)
    
    # Simula o loop do Nuxt / TOTVS RM que ocorreu na prática
    guard.record_transition("https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto")
    guard.record_transition("https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto/filial")
    guard.record_transition("https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto/academico")
    guard.record_transition("https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto/carregar-parametros")
    res_loop = guard.record_transition("https://portaleducacao.redesantacatarina.org.br/auth/selecionar-contexto")
    
    # 5 transições rápidas completando o ciclo com caminho repetido
    assert res_loop["is_loop"] is True
    assert res_loop["recovery_action"] == "clear_storage_and_reload"
    assert "clear();" in guard.get_recovery_script()


def test_network_settler_quiescence():
    settler = NetworkSettler(min_idle_ms=100)
    
    # Inicialmente silencioso
    time.sleep(0.12)
    assert settler.is_quiescent() is True
    
    # Inicia requisição XHR
    settler.on_request_started("req_1", "https://api.portal.com/turmas")
    assert settler.is_quiescent() is False
    
    # Ignora streaming / analytics
    settler.on_request_started("req_2", "https://portal.com/status_stream")
    assert len(settler.inflight_requests) == 1
    
    # Completa a requisição
    settler.on_request_completed("req_1")
    assert len(settler.inflight_requests) == 0
    # Logo após completar, ainda não deu min_idle_ms
    # Aguarda 120ms para atingir o silêncio
    time.sleep(0.12)
    assert settler.is_quiescent() is True


def test_universal_settler_script_generation():
    settler = UniversalSettler()
    script = settler.get_dom_settled_script(min_idle_ms=250, max_wait_ms=2000)
    assert "MutationObserver" in script
    assert "childList: true" in script
    assert "reason: 'dom_idle'" in script
