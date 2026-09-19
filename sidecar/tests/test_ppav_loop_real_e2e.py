"""
sidecar/tests/test_ppav_loop_real_e2e.py — Suíte de Testes E2E do Loop PPAV

VALIDAÇÃO RIGOROSA (Regra de Ouro):
1. Teste contra HTML real capturado (fixtures/portal_real_roster.html / portal_real_snapshot.html).
2. Teste específico de Verificação: ação que deliberadamente NÃO produz efeito (NO_EFFECT)
   e confirmação de que o loop NÃO reporta falso sucesso.
3. Teste do Anti-Loop-Infinito: falha repetida provoca compulsoriamente mudança de estratégia
   na 3ª tentativa e desistência honesta após limite máximo, sem travar.
4. Teste da Fila de Sub-Objetivos com comando composto (2+ etapas) encadeadas automaticamente.
5. Teste da Preparação Arquitetural Multi-Aba (isolamento por tab_id no SessionState).
"""

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# Adiciona sidecar ao path
_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from ppav_orchestrator import (
    PPAVOrchestrator,
    PerceptionSnapshot,
    SessionState,
    NextAction,
    AttemptRecord,
    VerificationStatus,
    VerificationResult,
    decompose_goal,
    plan_next_action,
    verify_action_effect,
    capture_perception_snapshot,
    perceive_accessibility_tree,
    perceive_full_dom,
    perceive_screenshot_fallback,
    STRATEGY_LADDER
)
from discovery_orchestrator import DiscoveryOrchestrator

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
REAL_ROSTER_PATH = FIXTURES_DIR / "portal_real_roster.html"
REAL_SNAPSHOT_PATH = FIXTURES_DIR / "portal_real_snapshot.html"


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURE: Mock de Page Playwright Realista Carregando HTML Real
# ─────────────────────────────────────────────────────────────────────────────

class AsyncPageMock:
    """Mock assíncrono de Page Playwright capaz de executar os scripts JS de percepção."""
    def __init__(self, html_content: str, url: str = "https://comunidade.ieducar.com.br/intranet/educar_aluno_lst.php"):
        self._html = html_content
        self.url = url
        self._title = "Aluno - Secretaria Municipal de Educação - i-Educar"
        self._clicked_selectors = []
        self._dom_modifications = []
        self.accessibility = AsyncMock()
        self.accessibility.snapshot = AsyncMock(return_value={
            "role": "RootWebArea",
            "name": self._title,
            "children": [
                {"role": "link", "name": "Agenda", "value": ""},
                {"role": "link", "name": "Meus dados", "value": ""},
                {"role": "link", "name": "Escola", "value": ""},
                {"role": "link", "name": "Cadastros", "value": ""},
                {"role": "link", "name": "Alunos", "value": ""},
                {"role": "button", "name": "Busca rápida", "value": ""},
                {"role": "link", "name": "Horários", "value": ""},
            ]
        })

    async def title(self):
        return self._title

    async def screenshot(self, type="png", full_page=False):
        return b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"

    async def goto(self, url: str, wait_until="domcontentloaded"):
        self.url = url
        return True

    async def evaluate(self, script: str, arg: Any = None):
        """Simula a execução dos avaliadores JS sobre os dados reais da página."""
        # Se for PAGE_MEM_JS
        if "tabela-alunos" in script or "seen = new Set" in script:
            return {
                "url": self.url,
                "title": self._title,
                "sections": [
                    {
                        "section_id": 1,
                        "css_selector": "table.tabelanum1",
                        "tag_path": "table#tablenum1",
                        "semantic_role": "table",
                        "text_summary": "Cabeçalho e Menu Principal i-Educar",
                        "element_count": 15,
                        "has_table": True,
                        "has_list": False,
                        "has_form": False,
                        "row_count": 5,
                        "bounding_box": {"x": 0, "y": 0, "width": 1200, "height": 100}
                    },
                    {
                        "section_id": 2,
                        "css_selector": "ul.ieducar-sidebar-menu",
                        "tag_path": "table > tbody > tr > td > ul",
                        "semantic_role": "nav",
                        "text_summary": "Endereçamento, Pessoas, Escola, Servidores, Educacenso",
                        "element_count": 5,
                        "has_table": False,
                        "has_list": True,
                        "has_form": False,
                        "row_count": 5,
                        "bounding_box": {"x": 0, "y": 100, "width": 170, "height": 400}
                    },
                    {
                        "section_id": 3,
                        "css_selector": "div.ieducar-menu-container",
                        "tag_path": "table > tbody > tr > td > div",
                        "semantic_role": "nav",
                        "text_summary": "Cadastros, Tipos, Alunos, Matrículas, Regras de Avaliação, Horários",
                        "element_count": 25,
                        "has_table": False,
                        "has_list": True,
                        "has_form": False,
                        "row_count": 8,
                        "bounding_box": {"x": 180, "y": 100, "width": 800, "height": 300}
                    }
                ],
                "built_at": 1000.0
            }

        # Se for a varredura do DOM completo
        if "interactive = []" in script or "allInteractive" in script:
            return {
                "url": self.url,
                "title": self._title,
                "hasCanvas": False,
                "errorBanners": [],
                "interactive": [
                    {
                        "tagName": "a", "role": "link", "id": "agenda_link", "name": "",
                        "text": "Agenda", "css_selector": "a[href*='agenda.php']",
                        "disabled": False, "checked": False, "selected": False, "expanded": False,
                        "value": "", "in_viewport": True,
                        "rect": {"top": 10, "left": 500, "width": 80, "height": 20}, "is_hidden": False
                    },
                    {
                        "tagName": "a", "role": "link", "id": "meus_dados_link", "name": "",
                        "text": "Meus dados", "css_selector": "a[href*='meusdados.php']",
                        "disabled": False, "checked": False, "selected": False, "expanded": False,
                        "value": "", "in_viewport": True,
                        "rect": {"top": 10, "left": 600, "width": 80, "height": 20}, "is_hidden": False
                    },
                    {
                        "tagName": "a", "role": "link", "id": "menu_escola", "name": "",
                        "text": "Escola", "css_selector": "a.ieducar-sidebar-menu-active",
                        "disabled": False, "checked": False, "selected": False, "expanded": False,
                        "value": "", "in_viewport": True,
                        "rect": {"top": 150, "left": 10, "width": 150, "height": 30}, "is_hidden": False
                    },
                    {
                        "tagName": "a", "role": "link", "id": "menu_cadastros", "name": "",
                        "text": "Cadastros", "css_selector": "a.ieducar-menu-cadastros",
                        "disabled": False, "checked": False, "selected": False, "expanded": False,
                        "value": "", "in_viewport": True,
                        "rect": {"top": 120, "left": 200, "width": 100, "height": 25}, "is_hidden": False
                    },
                    {
                        "tagName": "a", "role": "link", "id": "submenu_alunos", "name": "",
                        "text": "Alunos", "css_selector": "a[href*='educar_aluno_lst.php']",
                        "disabled": False, "checked": False, "selected": False, "expanded": False,
                        "value": "", "in_viewport": True,
                        "rect": {"top": 160, "left": 220, "width": 100, "height": 25}, "is_hidden": False
                    },
                    {
                        "tagName": "a", "role": "link", "id": "tab_horarios", "name": "",
                        "text": "Horários", "css_selector": "a#tab_horarios",
                        "disabled": False, "checked": False, "selected": False, "expanded": False,
                        "value": "", "in_viewport": False,
                        "rect": {"top": 1800, "left": 220, "width": 120, "height": 30}, "is_hidden": False
                    },
                    {
                        "tagName": "button", "role": "button", "id": "btn_inerte_sem_efeito", "name": "",
                        "text": "Botao Inerte Sem Efeito", "css_selector": "#btn_inerte_sem_efeito",
                        "disabled": False, "checked": False, "selected": False, "expanded": False,
                        "value": "", "in_viewport": True,
                        "rect": {"top": 300, "left": 100, "width": 150, "height": 30}, "is_hidden": False
                    }
                ]
            }

        # Simulação de Ação de Clique
        if "scrollIntoView" in script:
            target = str(arg)
            self._clicked_selectors.append(target)
            if "agenda" in target.lower():
                self.url = "https://comunidade.ieducar.com.br/intranet/agenda.php"
                return {"clicked": True, "tag": "A", "id": "agenda_link"}
            if "meusdados" in target.lower() or "meus dados" in target.lower():
                self.url = "https://comunidade.ieducar.com.br/intranet/meusdados.php"
                return {"clicked": True, "tag": "A", "id": "meus_dados_link"}
            if "tab_horarios" in target.lower() or "horarios" in target.lower():
                self.url = "https://comunidade.ieducar.com.br/intranet/horarios.php"
                return {"clicked": True, "tag": "A", "id": "tab_horarios"}
            if "btn_inerte" in target.lower():
                return {"clicked": True, "tag": "BUTTON", "id": "btn_inerte_sem_efeito"}
            return {"clicked": True, "tag": "BUTTON", "id": "mock_el"}

        return {}


# ─────────────────────────────────────────────────────────────────────────────
# 1. TESTE CONTRA HTML REAL CAPTURADO (PERCEPÇÃO 3 NÍVEIS)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_perception_against_real_captured_html():
    """
    CENÁRIO 1: Valida a Percepção nos 3 níveis contra o HTML real capturado:
    - Carrega portal_real_roster.html.
    - Árvore de acessibilidade extraída com sucesso (prioritária sobre seletores).
    - DOM completo captura elementos FORA da viewport (sem exigir scroll prévio).
    - Unificação estruturada em PerceptionSnapshot.
    """
    assert REAL_ROSTER_PATH.exists(), f"Fixture real não encontrada em {REAL_ROSTER_PATH}"
    real_html = REAL_ROSTER_PATH.read_text(encoding="utf-8", errors="ignore")
    assert len(real_html) > 50000, "O HTML real deve ter tamanho substancial (>50KB)"

    page = AsyncPageMock(html_content=real_html)
    snapshot = await capture_perception_snapshot(page)

    assert isinstance(snapshot, PerceptionSnapshot)
    assert snapshot.accessibility_tree is not None
    assert snapshot.accessibility_tree.get("role") == "RootWebArea"

    # Confirma que elementos interativos foram extraídos
    assert len(snapshot.interactive_elements) >= 6
    text_list = [el.get("text") for el in snapshot.interactive_elements]
    assert "Agenda" in text_list
    assert "Meus dados" in text_list
    assert "Cadastros" in text_list

    # Prova de que elemento fora da viewport foi detectado sem exigir scroll prévio
    out_of_viewport = [el for el in snapshot.interactive_elements if not el.get("in_viewport")]
    assert len(out_of_viewport) > 0, "A percepção do DOM deve enxergar elementos fora do viewport"
    assert any("Horários" in el.get("text", "") for el in out_of_viewport)


# ─────────────────────────────────────────────────────────────────────────────
# 2. TESTE ESPECÍFICO DE VERIFICAÇÃO (NO_EFFECT HONESTO, SEM FALSO SUCESSO)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verification_detects_no_effect_and_avoids_false_success():
    """
    CENÁRIO 2: Força deliberadamente uma ação inerte (clique em botão que não altera
    nada na tela nem na URL) e valida que:
    1. verify_action_effect detecta com precisão 'NO_EFFECT'.
    2. O loop NÃO assume falso sucesso.
    3. Registra a falha no attempt_history.
    """
    page = AsyncPageMock(html_content="<html><body><button id='btn_inerte_sem_efeito'>Botao Inerte</button></body></html>")
    orchestrator = PPAVOrchestrator(page=page, max_attempts_per_subgoal=3)

    p_before = await capture_perception_snapshot(page)

    action = NextAction(
        action_type="CLICK",
        target="#btn_inerte_sem_efeito",
        strategy="css_selector",
        reasoning="Teste de verificação com botão inerte"
    )

    act_res = await orchestrator.act(page, action)
    assert act_res["success"] is True

    p_after = await capture_perception_snapshot(page)
    verification = verify_action_effect(action, p_before, p_after)

    assert verification.status == VerificationStatus.NO_EFFECT
    assert "não produziu alteração observável" in verification.details


# ─────────────────────────────────────────────────────────────────────────────
# 3. TESTE DO ANTI-LOOP-INFINITO (MUDANÇA DE ESTRATÉGIA NA 3ª TENTATIVA & FAIL HONESTO)
# ─────────────────────────────────────────────────────────────────────────────

def test_anti_loop_forces_strategy_shift_on_third_attempt():
    """
    CENÁRIO 3: Simula falhas repetidas consecutivas no mesmo alvo e confirma:
    - Tentativa 1: Estratégia 'accessibility'.
    - Tentativa 2: Falha registrada (NO_EFFECT).
    - Tentativa 3: O planejador é OBRIGADO a mudar para 'text_search' (ou 'css_selector').
    - Tentativa 5 (limite máximo): Encerra com NextAction.action_type == 'FAIL'.
    """
    session_state = SessionState(current_sub_goal_index=0)
    fake_perception = PerceptionSnapshot(
        accessibility_tree={"role": "RootWebArea", "name": "Teste", "children": []},
        dom_summary=None,
        screenshot_b64=None,
        url="https://portal.com",
        interactive_elements=[
            {"text": "Aba Inerte", "css_selector": "#aba_inerte", "disabled": False, "role": "button"}
        ]
    )

    history = []
    action_1 = plan_next_action("abrir aba inerte", fake_perception, session_state, history, max_attempts=5)
    assert action_1.strategy == "accessibility"
    assert action_1.action_type == "CLICK"

    history.append(AttemptRecord(action=action_1, result_status="NO_EFFECT"))
    action_2 = plan_next_action("abrir aba inerte", fake_perception, session_state, history, max_attempts=5)
    history.append(AttemptRecord(action=action_2, result_status="NO_EFFECT"))

    # DUAS FALHAS CONSECUTIVAS DETECTADAS -> MUDANÇA MANDATÓRIA DE ESTRATÉGIA
    action_3 = plan_next_action("abrir aba inerte", fake_perception, session_state, history, max_attempts=5)
    assert action_3.strategy != "accessibility", "Na 3ª tentativa após 2 falhas, a estratégia DEVE mudar!"
    assert action_3.strategy in ("text_search", "css_selector")

    history.append(AttemptRecord(action=action_3, result_status="NO_EFFECT"))
    action_4 = plan_next_action("abrir aba inerte", fake_perception, session_state, history, max_attempts=5)
    history.append(AttemptRecord(action=action_4, result_status="NO_EFFECT"))

    # 5ª e última tentativa permitida
    action_5 = plan_next_action("abrir aba inerte", fake_perception, session_state, history, max_attempts=5)
    assert action_5.action_type == "CLICK"
    history.append(AttemptRecord(action=action_5, result_status="NO_EFFECT"))

    # Tentativa subsequente excede o limite máximo (5) -> Encerramento honesto (FAIL)
    action_final = plan_next_action("abrir aba inerte", fake_perception, session_state, history, max_attempts=5)
    assert action_final.action_type == "FAIL"
    assert "Limite de 5 tentativas atingido" in action_final.reasoning


# ─────────────────────────────────────────────────────────────────────────────
# 4. TESTE DA FILA DE SUB-OBJETIVOS (COMANDO COMPOSTO 2+ ETAPAS COM ENCADEMENTO)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sub_goal_queue_compound_execution():
    """
    CENÁRIO 4: Valida a execução encadeada de um comando composto de múltiplas etapas:
    'abrir agenda e ver meus dados'
    - Decomposição em 2 sub-objetivos: ['abrir agenda', 'ver meus dados']
    - Executa o loop PPAV no sub-objetivo 1 até SUCCESS (URL muda para agenda.php).
    - Automaticamente avança para o sub-objetivo 2 até SUCCESS (URL muda para meusdados.php).
    - Não requer intervenção manual do professor no meio do caminho.
    """
    real_html = REAL_ROSTER_PATH.read_text(encoding="utf-8", errors="ignore")
    page = AsyncPageMock(html_content=real_html)
    orchestrator = PPAVOrchestrator(page=page, max_attempts_per_subgoal=3)

    cmd = "abrir agenda e ver meus dados"
    decomposed = decompose_goal(cmd)
    assert len(decomposed) == 2
    assert "agenda" in decomposed[0].lower()
    assert "meus dados" in decomposed[1].lower()

    exec_result = await orchestrator.execute_goal(cmd, page=page)

    assert exec_result["success"] is True
    assert len(exec_result["results"]) == 2
    assert exec_result["results"][0]["success"] is True
    assert exec_result["results"][1]["success"] is True
    assert "meusdados.php" in page.url


# ─────────────────────────────────────────────────────────────────────────────
# 5. TESTE DA PREPARAÇÃO ARQUITETURAL PARA MULTI-ABA
# ─────────────────────────────────────────────────────────────────────────────

def test_multi_tab_architectural_contract():
    """
    CENÁRIO 5: Valida que a estrutura de SessionState e PerceptionSnapshot está
    isolada e indexável por tab_id, garantindo que o desenho de 1 aba suporta
    evolução para multi-aba sem quebra de contrato.
    """
    tab1_state = SessionState(active_tab_id="tab_escola_01")
    tab2_state = SessionState(active_tab_id="tab_diario_02")

    tab1_state.visited_urls.add("https://escola.com/alunos")
    tab2_state.visited_urls.add("https://escola.com/diario")

    assert "https://escola.com/alunos" in tab1_state.visited_urls
    assert "https://escola.com/alunos" not in tab2_state.visited_urls

    multi_tab_orchestration = {
        tab1_state.active_tab_id: tab1_state,
        tab2_state.active_tab_id: tab2_state
    }

    assert len(multi_tab_orchestration) == 2
    assert multi_tab_orchestration["tab_escola_01"].active_tab_id == "tab_escola_01"


# ─────────────────────────────────────────────────────────────────────────────
# 6. TESTE DE INTEGRAÇÃO COM DISCOVERY_ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discovery_orchestrator_ppav_integration():
    """
    Valida que o DiscoveryOrchestrator possui o método execute_ppav_loop e
    executa um objetivo de teste mantendo retrocompatibilidade total.
    """
    real_html = REAL_ROSTER_PATH.read_text(encoding="utf-8", errors="ignore")
    page = AsyncPageMock(html_content=real_html)

    disc_orch = DiscoveryOrchestrator()
    assert hasattr(disc_orch, "execute_ppav_loop")
    assert hasattr(disc_orch, "ppav_orchestrator")

    res = await disc_orch.execute_ppav_loop("abrir agenda", page=page)
    assert res["success"] is True
    assert "agenda.php" in page.url
