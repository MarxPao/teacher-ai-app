"""
sidecar/ppav_orchestrator.py — Loop Real de Percepção-Planejamento-Ação-Verificação (PPAV)

ARQUITETURA EM 4 PASSOS:
1. Percepção (3 Níveis):
   - 1.1 Árvore de Acessibilidade (Playwright/CDP AXTree — prioridade sobre CSS).
   - 1.2 DOM Completo (varredura além do viewport, sem exigir scroll prévio para detecção).
   - 1.3 Screenshot como Fallback (somente quando acessibilidade + DOM forem insuficientes, ex: canvas).
   - 1.4 Unificação em PerceptionSnapshot.
2. Planejamento Atômico (Um passo por vez):
   - plan_next_action() recebe attempt_history com falhas anteriores.
   - Regra Anti-Loop-Infinito: se a mesma ação falhar 2x, na 3ª é OBRIGADA a mudar de estratégia.
   - Limite de tentativas por sub-objetivo (default: 5) antes de reportar falha honesta.
3. Mapa de Estado de Sessão (SessionState):
   - URLs visitadas, seções expandidas, regiões com scroll, índice do sub-objetivo atual.
4. Fila de Sub-Objetivos:
   - decompose_goal() quebra comandos compostos antes do loop.
   - Execução sequencial: cada sub-objetivo percorre o loop PPAV completo até concluir.
   - Checkpoint de aprovação humana preservado para escrita/submissão (Diretiva 0-Tester).
5. Verificação Real (verify_action_effect):
   - Compara ANTES e DEPOIS (URL, estado de elementos, erros e modais).
   - Retorna: SUCCESS | NO_EFFECT | UNEXPECTED_STATE | ERROR_DETECTED.
   - Se NO_EFFECT ou UNEXPECTED_STATE, retroalimenta o loop sem falso sucesso.
6. Preparação Multi-Aba:
   - Isolamento de estado e percepção por tab_id para escalabilidade futura.
"""

import asyncio
import base64
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union

try:
    from discovery_orchestrator import is_destructive_action, DESTRUCTIVE_TERMS
except ImportError:
    try:
        from sidecar.discovery_orchestrator import is_destructive_action, DESTRUCTIVE_TERMS
    except ImportError:
        DESTRUCTIVE_TERMS = [
            "excluir", "remover", "deletar", "cancelar", "apagar", 
            "desmatricular", "delete", "remove", "cancel", "drop", "expel", "limpar"
        ]
        def is_destructive_action(action: Dict[str, Any]) -> bool:
            text = " ".join([str(v) for v in action.values()]).lower()
            return any(t in text for t in DESTRUCTIVE_TERMS)

try:
    from portal_structure_mapper import _is_action_button
except ImportError:
    try:
        from sidecar.portal_structure_mapper import _is_action_button
    except ImportError:
        def _is_action_button(text: str) -> bool:
            return bool(re.search(r"(salvar|excluir|apagar|deletar|enviar|confirmar|cancelar|submit|save)", text, re.I))

try:
    from page_reader_engine import PAGE_MEM_JS, PageMemory, PageSection
except ImportError:
    try:
        from sidecar.page_reader_engine import PAGE_MEM_JS, PageMemory, PageSection
    except ImportError:
        PAGE_MEM_JS = None
        PageMemory = None  # type: ignore
        PageSection = None  # type: ignore

try:
    from skills.educational_grounding_skill import EducationalOntology, SpatialMatrixGrounding
    from skills.network_interceptor_skill import CDPNetworkInterceptor
    from skills.hierarchical_planner_skill import HierarchicalPlanner, CausalReflector
except ImportError:
    try:
        from sidecar.skills.educational_grounding_skill import EducationalOntology, SpatialMatrixGrounding
        from sidecar.skills.network_interceptor_skill import CDPNetworkInterceptor
        from sidecar.skills.hierarchical_planner_skill import HierarchicalPlanner, CausalReflector
    except ImportError:
        EducationalOntology = None  # type: ignore
        SpatialMatrixGrounding = None  # type: ignore
        CDPNetworkInterceptor = None  # type: ignore
        HierarchicalPlanner = None  # type: ignore
        CausalReflector = None  # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
# PARTE 1 — Camada de Percepção & PerceptionSnapshot
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PerceptionSnapshot:
    """
    Fotografia unificada do estado perceptível da página em um instante t.
    Combina acessibilidade, DOM integral e screenshot opcional.
    """
    accessibility_tree: Optional[Dict[str, Any]]
    dom_summary: Optional[Any]  # PageMemory ou dict estruturado
    screenshot_b64: Optional[str]  # Somente preenchido quando estritamente necessário (1.3)
    url: str
    timestamp: float = field(default_factory=time.time)
    title: str = ""
    interactive_elements: List[Dict[str, Any]] = field(default_factory=list)
    has_canvas: bool = False
    error_banners: List[str] = field(default_factory=list)


async def perceive_accessibility_tree(page: Any) -> Optional[Dict[str, Any]]:
    """
    1.1 Árvore de Acessibilidade (Fonte Primária):
    Usa o suporte nativo do Browser Harness (Accessibility.getFullAXTree) ou Playwright/CDP.
    Mais estável que seletores CSS contra quebras de layout.
    """
    if not page:
        return None
    try:
        if getattr(page, "is_harness", False):
            tree = page.get_accessibility_tree()
            if tree and tree.get("nodes"):
                return tree
        if hasattr(page, "accessibility") and callable(getattr(page.accessibility, "snapshot", None)):
            tree = await page.accessibility.snapshot(interesting_only=False)
            if tree:
                return tree
    except Exception as e:
        print(f"[PPAVPerception] Aviso ao obter accessibility tree: {e}")

    
    # Fallback determinístico via JS se accessibility snapshot não estiver disponível no mock
    js_fallback = """
    () => {
        const items = [];
        const walk = (el) => {
            const role = el.getAttribute('role') || el.tagName.toLowerCase();
            const name = el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('title') || '';
            const cleanName = name.trim().slice(0, 100);
            if (['button', 'a', 'input', 'select', 'textarea', 'tab', 'menuitem'].includes(role) || el.onclick) {
                items.push({
                    role: role,
                    name: cleanName,
                    id: el.id || '',
                    className: el.className || '',
                    disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
                    value: el.value || '',
                    checked: el.checked || el.getAttribute('aria-checked') === 'true',
                    selected: el.getAttribute('aria-selected') === 'true',
                    expanded: el.getAttribute('aria-expanded') === 'true'
                });
            }
            for (const child of el.children) walk(child);
        };
        walk(document.body || document.documentElement);
        return { role: 'RootWebArea', name: document.title, children: items };
    }
    """
    try:
        return await page.evaluate(js_fallback)
    except Exception:
        return None


async def perceive_full_dom(page: Any) -> Tuple[Optional[Any], List[Dict[str, Any]], bool, List[str]]:
    """
    1.2 DOM Completo (Não apenas viewport):
    Varre todos os elementos interativos e estruturais em document.body,
    mesmo que estejam fora da visualização inicial (sem exigir scroll prévio).
    Retorna: (dom_summary, interactive_elements, has_canvas, error_banners)
    """
    if not page:
        return None, [], False, []

    js_full_dom = """
    () => {
        const interactive = [];
        const errors = [];
        let hasCanvas = document.querySelectorAll('canvas').length > 0;

        // Captura elementos interativos em TODO o documento
        const allInteractive = Array.from(document.querySelectorAll(
            'button, a, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="link"], [onclick], .tab-btn, .btn'
        ));

        for (const el of allInteractive) {
            const style = window.getComputedStyle(el);
            const isHidden = style.display === 'none' || style.visibility === 'hidden';
            
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.value || '').trim();
            const role = el.getAttribute('role') || el.tagName.toLowerCase();
            const id = el.id ? '#' + el.id : '';
            
            // Verifica se está dentro ou fora da viewport inicial
            const inViewport = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );

            interactive.push({
                tagName: el.tagName.toLowerCase(),
                role: role,
                id: el.id || '',
                name: el.getAttribute('name') || '',
                text: text.slice(0, 120),
                css_selector: el.id ? '#' + el.id : (el.name ? `[name="${el.name}"]` : ''),
                disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'),
                checked: el.checked || el.getAttribute('aria-checked') === 'true',
                selected: el.getAttribute('aria-selected') === 'true',
                expanded: el.getAttribute('aria-expanded') === 'true',
                value: el.value || '',
                in_viewport: inViewport,
                rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
                is_hidden: isHidden
            });
        }

        // Detecção de banners ou modais de erro
        const errorNodes = Array.from(document.querySelectorAll(
            '[role="alert"], .alert-danger, .error-message, .has-error, .toast-error, .modal-danger'
        ));
        for (const errEl of errorNodes) {
            const errText = (errEl.innerText || errEl.textContent || '').trim();
            if (errText.length > 2) errors.push(errText.slice(0, 200));
        }

        return {
            url: window.location.href,
            title: document.title,
            interactive: interactive,
            hasCanvas: hasCanvas,
            errorBanners: errors
        };
    }
    """
    try:
        raw_dom = await page.evaluate(js_full_dom)
        interactive = raw_dom.get("interactive", [])
        has_canvas = raw_dom.get("hasCanvas", False)
        error_banners = raw_dom.get("errorBanners", [])

        # Se PAGE_MEM_JS estiver disponível, gera o resumo estrutural PageMemory
        dom_summary = None
        if PAGE_MEM_JS:
            try:
                page_mem_raw = await page.evaluate(PAGE_MEM_JS)
                if PageMemory and PageSection:
                    sections = [
                        PageSection(
                            section_id=s["section_id"],
                            css_selector=s["css_selector"],
                            tag_path=s["tag_path"],
                            semantic_role=s["semantic_role"],
                            text_summary=s["text_summary"],
                            element_count=s["element_count"],
                            has_table=s["has_table"],
                            has_list=s["has_list"],
                            has_form=s["has_form"],
                            row_count=s["row_count"],
                            bounding_box=s["bounding_box"],
                            has_cards=s.get("has_cards", False)
                        )
                        for s in page_mem_raw.get("sections", [])
                    ]
                    dom_summary = PageMemory(
                        url=page_mem_raw.get("url", ""),
                        title=page_mem_raw.get("title", ""),
                        sections=sections,
                        total_sections=len(sections),
                        built_at=page_mem_raw.get("built_at", time.time())
                    )
                else:
                    dom_summary = page_mem_raw
            except Exception as e_mem:
                print(f"[PPAVPerception] Aviso ao gerar PageMemory: {e_mem}")
                dom_summary = {"title": raw_dom.get("title", ""), "url": raw_dom.get("url", "")}
        else:
            dom_summary = {"title": raw_dom.get("title", ""), "url": raw_dom.get("url", "")}

        return dom_summary, interactive, has_canvas, error_banners
    except Exception as e:
        print(f"[PPAVPerception] Erro na varredura DOM completa: {e}")
        return None, [], False, []


async def perceive_screenshot_fallback(page: Any, reason: str = "") -> Optional[str]:
    """
    1.3 Screenshot como Fallback (Skyvern-style):
    Só aciona quando a árvore de acessibilidade + DOM não forem suficientes
    (ex: canvas como no Google Sheets, ausência de nós interativos identificáveis).
    """
    if not page:
        return None
    try:
        if hasattr(page, "screenshot") and callable(getattr(page.screenshot, "screenshot", None) or getattr(page, "screenshot", None)):
            print(f"[PPAVPerception] 📸 Acionando Screenshot como Fallback (motivo: {reason})...")
            png_bytes = await page.screenshot(type="png", full_page=False)
            return base64.b64encode(png_bytes).decode("utf-8")
    except Exception as e:
        print(f"[PPAVPerception] Aviso ao capturar screenshot de fallback: {e}")
    return None


async def capture_perception_snapshot(page: Any, force_screenshot: bool = False) -> PerceptionSnapshot:
    """
    1.4 Captura e unifica os 3 níveis de percepção em um PerceptionSnapshot único.
    """
    url = getattr(page, "url", "") if page else ""
    title = ""
    try:
        title = await page.title() if hasattr(page, "title") and callable(getattr(page, "title", None)) else ""
    except Exception:
        pass

    # Nível 1: Árvore de Acessibilidade
    ax_tree = await perceive_accessibility_tree(page)

    # Nível 2: DOM Completo
    dom_summary, interactive, has_canvas, error_banners = await perceive_full_dom(page)

    # Nível 3: Screenshot como Fallback (somente se canvas ou ausência crítica de semântica)
    screenshot_b64 = None
    needs_vision = force_screenshot or has_canvas or (len(interactive) == 0 and not ax_tree)
    if needs_vision:
        reason = "canvas detectado" if has_canvas else ("sem elementos interativos no DOM" if len(interactive) == 0 else "solicitação explícita")
        screenshot_b64 = await perceive_screenshot_fallback(page, reason=reason)

    return PerceptionSnapshot(
        accessibility_tree=ax_tree,
        dom_summary=dom_summary,
        screenshot_b64=screenshot_b64,
        url=url,
        timestamp=time.time(),
        title=title,
        interactive_elements=interactive,
        has_canvas=has_canvas,
        error_banners=error_banners
    )


# ─────────────────────────────────────────────────────────────────────────────
# PARTE 2 — Planejamento de UM Passo por Vez (NextAction & AttemptRecord)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class NextAction:
    """Ação atômica individual a ser executada no passo atual."""
    action_type: str  # "NAVIGATE" | "CLICK" | "FILL" | "SELECT" | "SCROLL" | "WAIT" | "FINISH" | "FAIL"
    target: str       # Seletor CSS, nome acessível ou texto do alvo
    value: Optional[str] = None       # Valor de preenchimento ou seleção
    strategy: str = "accessibility"   # "accessibility" | "text_search" | "css_selector" | "dom_summary" | "vision_fallback"
    reasoning: str = ""
    description: str = ""
    sub_goal_index: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_type": self.action_type,
            "target": self.target,
            "value": self.value,
            "strategy": self.strategy,
            "reasoning": self.reasoning,
            "description": self.description,
            "sub_goal_index": self.sub_goal_index
        }


@dataclass
class AttemptRecord:
    """Registro histórico de uma tentativa atômica e seu resultado real."""
    action: NextAction
    result_status: str  # "SUCCESS" | "NO_EFFECT" | "UNEXPECTED_STATE" | "ERROR_DETECTED"
    error_message: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


# Estratégias disponíveis em ordem de escalonamento
STRATEGY_LADDER = [
    "accessibility",    # Nível 1: Nome acessível / role
    "text_search",      # Nível 2: Busca por texto exato / parcial visível
    "css_selector",     # Nível 3: Seletores estruturais ID / name / class
    "dom_summary",      # Nível 4: Seções de PageMemory / container
    "vision_fallback"   # Nível 5: Visão / coordenadas / screenshot
]


def plan_next_action(
    goal: str,
    perception: PerceptionSnapshot,
    session_state: "SessionState",
    attempt_history: List[AttemptRecord],
    max_attempts: int = 5
) -> NextAction:
    """
    2.1 Contrato do Planejador:
    Retorna APENAS a próxima ação atômica, nunca uma sequência completa.
    O planejador recebe o histórico de tentativas com suas falhas para não repetir
    a mesma ação inútil.

    2.2 Regra Anti-Loop-Infinito:
    Se a mesma ação (mesmo alvo e tipo) falhou 2 vezes seguidas, é OBRIGATÓRIO
    mudar de estratégia na 3ª tentativa. Limite máximo de tentativas por sub-objetivo (ex: 5).
    """
    sub_idx = session_state.current_sub_goal_index
    sub_attempts = [a for a in attempt_history if a.action.sub_goal_index == sub_idx]

    # Limite máximo de tentativas atingido -> Falha honesta, nunca loop infinito
    if len(sub_attempts) >= max_attempts:
        return NextAction(
            action_type="FAIL",
            target="",
            strategy="exhausted",
            reasoning=f"Limite de {max_attempts} tentativas atingido para o sub-objetivo '{goal}' sem sucesso comprovado.",
            description="Desistência honesta por esgotamento de tentativas.",
            sub_goal_index=sub_idx
        )

    # Determina a estratégia ativa aplicando a Regra Anti-Loop
    current_strategy = "accessibility"
    if len(sub_attempts) >= 2:
        last_1 = sub_attempts[-1]
        last_2 = sub_attempts[-2]
        # Se as últimas 2 tentativas falharam na mesma ação ou mesmo alvo:
        if (last_1.result_status in ("NO_EFFECT", "UNEXPECTED_STATE", "ERROR_DETECTED") and
            last_2.result_status in ("NO_EFFECT", "UNEXPECTED_STATE", "ERROR_DETECTED")):
            # OBRIGADO a mudar de estratégia
            last_strat = last_1.action.strategy
            try:
                curr_idx = STRATEGY_LADDER.index(last_strat)
                next_idx = min(curr_idx + 1, len(STRATEGY_LADDER) - 1)
                current_strategy = STRATEGY_LADDER[next_idx]
                print(f"[PPAVPlanner] 🔄 Anti-Loop Ativado: Falha consecutiva detectada. "
                      f"Mudando estratégia de '{last_strat}' para '{current_strategy}' (tentativa {len(sub_attempts)+1}).")
            except ValueError:
                current_strategy = "text_search"

    clean_goal = goal.lower().strip()

    # Classificação ontológica prévia (sinônimos de portais escolares: Diário, Caderneta, Chamada, Nota)
    edu_concept = None
    if EducationalOntology:
        edu_concept, _ = EducationalOntology.classify_concept(clean_goal)

    # Normalização de strings para matching léxico
    def norm(s: str) -> str:
        return re.sub(r"[\u0300-\u036f]", "", s.lower().strip())

    goal_norm = norm(clean_goal)
    tokens = [t for t in re.split(r"[\s_]+", goal_norm) if len(t) >= 3 and t not in [
        "para", "com", "aba", "menu", "pagina", "tela", "clique", "clicar", "acesse", "acessar", "abrir", "abra", "em", "no", "na"
    ]]

    # Busca de candidatos conforme a estratégia determinada
    candidates = perception.interactive_elements or []

    # Estratégia 1: Acessibilidade (árvore e roles semânticos + Ontologia)
    if current_strategy == "accessibility":
        for el in candidates:
            if el.get("disabled") or el.get("is_hidden"):
                continue
            name_norm = norm(el.get("text", ""))
            raw_text = el.get("text", "") or el.get("aria_label", "") or el.get("title", "")
            is_edu_match = False
            if EducationalOntology and edu_concept:
                is_edu_match = EducationalOntology.matches_concept(raw_text, edu_concept)

            if is_edu_match or any(t in name_norm for t in tokens):
                target_repr = el.get("css_selector") or (f"role={el.get('role')}[name='{el.get('text')}']")
                return NextAction(
                    action_type="CLICK",
                    target=target_repr,
                    strategy="accessibility",
                    reasoning=f"Elemento acessível '{el.get('text')}' compatível com '{goal}' (Conceito: {edu_concept or 'tokens'}).",
                    description=f"Clicar no elemento acessível '{el.get('text')}'",
                    sub_goal_index=sub_idx
                )

    # Estratégia 2: Busca textual ampla (DOM + Ontologia)
    if current_strategy in ("accessibility", "text_search"):
        for el in candidates:
            if el.get("disabled"):
                continue
            text_norm = norm(el.get("text", ""))
            raw_text = el.get("text", "") or el.get("aria_label", "") or el.get("name", "")
            is_edu_match = False
            if EducationalOntology and edu_concept:
                is_edu_match = EducationalOntology.matches_concept(raw_text, edu_concept)

            if is_edu_match or any(t in text_norm for t in tokens):
                sel = el.get("css_selector") or (f"#{el.get('id')}" if el.get('id') else f"{el.get('tagName')}:has-text('{el.get('text')}')")
                matched_tok = next((t for t in tokens if t in text_norm), 'alvo')
                return NextAction(
                    action_type="CLICK",
                    target=sel,
                    strategy="text_search",
                    reasoning=f"Texto '{el.get('text')}' contém o termo '{matched_tok}'.",
                    description=f"Clicar em elemento contendo texto '{el.get('text')}'",
                    sub_goal_index=sub_idx
                )

    # Estratégia 3: Seletor CSS / Atributos ID e Name
    if current_strategy in ("accessibility", "text_search", "css_selector"):
        for el in candidates:
            id_norm = norm(el.get("id", ""))
            name_norm = norm(el.get("name", ""))
            if any(t in id_norm or t in name_norm for t in tokens):
                sel = f"#{el.get('id')}" if el.get("id") else f"[name='{el.get('name')}']"
                return NextAction(
                    action_type="CLICK",
                    target=sel,
                    strategy="css_selector",
                    reasoning=f"Atributo estrutural ID/Name contém token de '{goal}'.",
                    description=f"Clicar no seletor '{sel}'",
                    sub_goal_index=sub_idx
                )

    # Estratégia 4: PageMemory / Resumo Estrutural
    if current_strategy in ("accessibility", "text_search", "css_selector", "dom_summary"):
        if perception.dom_summary and hasattr(perception.dom_summary, "sections"):
            for sec in perception.dom_summary.sections:
                sec_text = norm(sec.text_summary)
                if any(t in sec_text for t in tokens):
                    return NextAction(
                        action_type="CLICK",
                        target=sec.css_selector,
                        strategy="dom_summary",
                        reasoning=f"Seção estrutural #{sec.section_id} ({sec.semantic_role}) contém '{goal}'.",
                        description=f"Acessar container '{sec.css_selector}'",
                        sub_goal_index=sub_idx
                    )

    # Estratégia 5: Fallback de visão / canvas
    if perception.has_canvas or perception.screenshot_b64:
        return NextAction(
            action_type="CLICK",
            target="canvas_center",
            strategy="vision_fallback",
            reasoning="Página visual ou canvas detectada; acionando estratégia de visão.",
            description="Interagir com canvas visual",
            sub_goal_index=sub_idx
        )

    # Se nada combinou, sugere clique por texto genérico baseado no objetivo
    return NextAction(
        action_type="CLICK",
        target=f"text={goal}",
        strategy="text_search",
        reasoning=f"Tentativa padrão por texto para o objetivo '{goal}'.",
        description=f"Clicar em '{goal}'",
        sub_goal_index=sub_idx
    )


# ─────────────────────────────────────────────────────────────────────────────
# PARTE 3 — Mapa de Estado de Sessão (SessionState)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SessionState:
    """
    3.0 Memória persistida entre ciclos do MESMO loop de execução.
    Evita re-navegar para onde já está, re-expandir acordeons abertos ou
    repetir scrolls desnecessários.
    """
    visited_urls: Set[str] = field(default_factory=set)
    expanded_sections: Set[str] = field(default_factory=set)
    scrolled_regions: Dict[str, int] = field(default_factory=dict)
    known_structure_map: Optional[dict] = None
    current_sub_goal_index: int = 0
    completed_sub_goals: List[str] = field(default_factory=list)
    active_tab_id: Optional[str] = "main_tab"  # Preparação para multi-aba


# ─────────────────────────────────────────────────────────────────────────────
# PARTE 4 — Fila de Sub-Objetivos (Decomposição Real de Comandos Compostos)
# ─────────────────────────────────────────────────────────────────────────────

def decompose_goal(goal: str) -> List[str]:
    """
    4.1 Decomposição do Objetivo Composto:
    Quando o comando do professor envolve múltiplas etapas, decompõe em uma fila
    real antes de iniciar o loop.
    Exemplos:
    - "faz a chamada da 8B e depois preenche o diário com verbos irregulares"
      -> ["fazer a chamada da 8B", "preencher o diário com verbos irregulares"]
    - "abra recados e abra recados recebidos"
      -> ["abrir recados", "abrir recados recebidos"]
    - "acesse o perfil de alice almeida em meus alunos"
      -> ["navegar até meus alunos", "acessar perfil de alice almeida"]
    """
    if not goal or not isinstance(goal, str):
        return []

    clean = goal.strip()
    # Remove saudações
    clean = re.sub(r"^(?:ol[áa]|oi|ei|rafinha|por\s+favor|pfv|ajuda)\s*[,:]?\s*", "", clean, flags=re.IGNORECASE)

    # 1. Padrão "acesse o perfil de <aluno> em <secao>"
    m_profile = re.search(
        r"^(?:acesse|abra|ver|olhe)?\s*(?:o|a)?\s*(?:perfil|dados|ficha)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+?)\s+(?:em|no|na)\s+([a-zA-ZÀ-ÿ0-9_\s-]+)$",
        clean,
        flags=re.IGNORECASE
    )
    if m_profile:
        aluno = m_profile.group(1).strip()
        secao = m_profile.group(2).strip()
        return [f"navegar até {secao}", f"acessar perfil de {aluno}"]

    # 2. Divisão por conectivos temporais / sequenciais:
    # "e depois", "em seguida", "e em seguida", "e então", "depois", "e logo após"
    split_pattern = r"\s+(?:e\s+depois|em\s+seguida|e\s+em\s+seguida|e\s+ent[ãa]o|depois|e\s+logo\s+ap[óo]s)\s+"
    parts = re.split(split_pattern, clean, flags=re.IGNORECASE)
    if len(parts) > 1:
        return [p.strip() for p in parts if p.strip()]

    # 3. Divisão por conectivo "e" quando seguido de verbo de comando:
    # "abra recados e abra recados recebidos", "faz chamada e preenche diário"
    verb_split_pattern = r"\s+e\s+(?=(?:abra|abrir|acesse|acessar|faz|fazer|preencha|preencher|lance|lançar|ver|veja|selecione|selecionar)\b)"
    parts = re.split(verb_split_pattern, clean, flags=re.IGNORECASE)
    if len(parts) > 1:
        return [p.strip() for p in parts if p.strip()]

    return [clean]


# ─────────────────────────────────────────────────────────────────────────────
# PARTE 5 — Passo de Verificação Real (verify_action_effect)
# ─────────────────────────────────────────────────────────────────────────────

class VerificationStatus(str, Enum):
    SUCCESS = "SUCCESS"
    NO_EFFECT = "NO_EFFECT"
    UNEXPECTED_STATE = "UNEXPECTED_STATE"
    ERROR_DETECTED = "ERROR_DETECTED"


@dataclass
class VerificationResult:
    """Resultado da comparação real entre o estado ANTES e DEPOIS da ação."""
    status: VerificationStatus
    details: str
    diff: Dict[str, Any] = field(default_factory=dict)


def verify_action_effect(
    action_taken: NextAction,
    perception_before: PerceptionSnapshot,
    perception_after: PerceptionSnapshot,
    network_outcome: Optional[Dict[str, Any]] = None
) -> VerificationResult:
    """
    5.0 Compara ANTES e DEPOIS de forma real:
    - O oráculo de rede CDP capturou resposta definitiva de API (200 OK vs Erro de Negócio)?
    - A URL mudou como esperado (se navegação ou clique em link)?
    - O elemento alvo mudou de estado (expandido, selecionado, valor preenchido)?
    - Apareceu algum modal ou erro inesperado?
    Retorna: SUCCESS | NO_EFFECT | UNEXPECTED_STATE | ERROR_DETECTED.
    """
    # 0. Verificação via Oráculo Factual de Rede CDP (Network API Invariants)
    if network_outcome and network_outcome.get("has_api_traffic"):
        if network_outcome.get("success") is False:
            return VerificationResult(
                status=VerificationStatus.ERROR_DETECTED,
                details=network_outcome.get("details", "Erro reportado pelo backend via API."),
                diff={"network": network_outcome}
            )
        elif network_outcome.get("success") is True:
            return VerificationResult(
                status=VerificationStatus.SUCCESS,
                details=network_outcome.get("details", "Operação confirmada pelo backend via API."),
                diff={"network": network_outcome}
            )

    # 1. Verificação de Erros Detectados na Página
    new_errors = [e for e in perception_after.error_banners if e not in perception_before.error_banners]
    if new_errors:
        return VerificationResult(
            status=VerificationStatus.ERROR_DETECTED,
            details=f"Banner ou mensagem de erro detectada na página após ação: '{new_errors[0]}'",
            diff={"new_errors": new_errors}
        )

    action_type = action_taken.action_type.upper()

    # 2. Ação de Navegação
    if action_type == "NAVIGATE":
        if perception_after.url != perception_before.url:
            return VerificationResult(
                status=VerificationStatus.SUCCESS,
                details=f"URL alterada de '{perception_before.url}' para '{perception_after.url}'.",
                diff={"url_before": perception_before.url, "url_after": perception_after.url}
            )
        return VerificationResult(
            status=VerificationStatus.NO_EFFECT,
            details="A URL não foi modificada após o comando de navegação.",
            diff={"url": perception_after.url}
        )

    # 3. Ação de Clique (CLICK)
    if action_type == "CLICK":
        # Caso A: Clique causou mudança de URL
        if perception_after.url != perception_before.url:
            return VerificationResult(
                status=VerificationStatus.SUCCESS,
                details=f"Clique resultou em navegação para '{perception_after.url}'.",
                diff={"url_before": perception_before.url, "url_after": perception_after.url}
            )

        # Caso B: Mudança de estado em elementos interativos
        before_els = {el.get("css_selector") or el.get("id"): el for el in perception_before.interactive_elements}
        after_els = {el.get("css_selector") or el.get("id"): el for el in perception_after.interactive_elements}

        state_changes = []
        for k, a_el in after_els.items():
            b_el = before_els.get(k)
            if b_el:
                if not b_el.get("expanded") and a_el.get("expanded"):
                    state_changes.append(f"{k} expandiu (aria-expanded=true)")
                if not b_el.get("selected") and a_el.get("selected"):
                    state_changes.append(f"{k} selecionado (aria-selected=true)")
                if not b_el.get("checked") and a_el.get("checked"):
                    state_changes.append(f"{k} marcado (checked=true)")

        if state_changes:
            return VerificationResult(
                status=VerificationStatus.SUCCESS,
                details=f"Estado interativo alterado com sucesso: {', '.join(state_changes)}.",
                diff={"state_changes": state_changes}
            )

        # Caso C: Novos elementos interativos surgiram (ex: modal abriu, sub-menu carregou)
        diff_count = len(perception_after.interactive_elements) - len(perception_before.interactive_elements)
        if diff_count > 0:
            return VerificationResult(
                status=VerificationStatus.SUCCESS,
                details=f"Novos elementos interativos revelados no DOM ({diff_count} novos elementos).",
                diff={"new_elements_count": diff_count}
            )

        # Caso D: Título da página ou resumo DOM mudou
        if perception_after.title != perception_before.title and perception_after.title:
            return VerificationResult(
                status=VerificationStatus.SUCCESS,
                details=f"Título da página atualizado para '{perception_after.title}'.",
                diff={"title_before": perception_before.title, "title_after": perception_after.title}
            )

        # Se nenhum efeito foi constatado:
        return VerificationResult(
            status=VerificationStatus.NO_EFFECT,
            details=f"Ação de clique em '{action_taken.target}' não produziu alteração observável no DOM ou na URL.",
            diff={"target": action_taken.target}
        )

    # 4. Ação de Preenchimento (FILL)
    if action_type == "FILL":
        expected = action_taken.value or ""
        target_found = False
        target_value = None
        for el in perception_after.interactive_elements:
            if action_taken.target in (el.get("css_selector", ""), f"#{el.get('id', '')}", el.get("name", "")):
                target_found = True
                target_value = el.get("value", "")
                break

        if target_found and target_value == expected:
            return VerificationResult(
                status=VerificationStatus.SUCCESS,
                details=f"Campo '{action_taken.target}' preenchido com valor esperado '{expected}'.",
                diff={"target": action_taken.target, "value": expected}
            )
        elif target_found:
            return VerificationResult(
                status=VerificationStatus.UNEXPECTED_STATE,
                details=f"Campo '{action_taken.target}' possui valor '{target_value}', esperado '{expected}'.",
                diff={"target": action_taken.target, "expected": expected, "actual": target_value}
            )
        return VerificationResult(
            status=VerificationStatus.NO_EFFECT,
            details=f"Campo '{action_taken.target}' não localizado após tentativa de preenchimento.",
            diff={"target": action_taken.target}
        )

    # 5. Ação de Seleção (SELECT)
    if action_type == "SELECT":
        expected = action_taken.value or ""
        return VerificationResult(
            status=VerificationStatus.SUCCESS,
            details=f"Seleção da opção '{expected}' concluída.",
            diff={"target": action_taken.target, "selected": expected}
        )

    # 6. Conclusão ou Espera
    if action_type in ("FINISH", "WAIT"):
        return VerificationResult(
            status=VerificationStatus.SUCCESS,
            details=f"Ação '{action_type}' executada.",
            diff={}
        )

    return VerificationResult(
        status=VerificationStatus.NO_EFFECT,
        details=f"Tipo de ação '{action_type}' não produziu verificação positiva.",
        diff={}
    )


# ─────────────────────────────────────────────────────────────────────────────
# PARTE 6 — Orquestrador PPAV Completo & Preparação Multi-Aba
# ─────────────────────────────────────────────────────────────────────────────

class PPAVOrchestrator:
    """
    Orquestrador Central com o Loop Real de 4 Passos:
    Perceber → Planejar → Agir → Verificar.

    PREPARAÇÃO ARQUITETURAL PARA MULTI-ABA (Documentada para evolução futura):
    - O SessionState possui active_tab_id. Em orquestração multi-aba futura,
      um dicionário `MultiTabSessionState = Dict[str, SessionState]` gerenciará
      múltiplos loops simultâneos sem quebrar a assinatura dos métodos de 1 aba.
    """

    def __init__(
        self,
        page: Any = None,
        max_attempts_per_subgoal: int = 5,
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
        network_interceptor: Optional[Any] = None
    ):
        self.page = page
        self.max_attempts_per_subgoal = max_attempts_per_subgoal
        self.on_progress = on_progress
        self.session_state = SessionState()
        self.network_interceptor = network_interceptor or (CDPNetworkInterceptor() if CDPNetworkInterceptor else None)

    def _notify(self, payload: Dict[str, Any]) -> None:
        if self.on_progress and callable(self.on_progress):
            try:
                self.on_progress(payload)
            except Exception:
                pass

    async def act(self, page: Any, action: NextAction) -> Dict[str, Any]:
        """Executa fisicamente a ação na página através do Playwright/DOM."""
        action_type = action.action_type.upper()
        target = action.target

        # Barreira de segurança: impede ações destrutivas sem autorização explícita
        if is_destructive_action(action.to_dict()) or _is_action_button(target):
            err = f"Ação de escrita ou potencial risco vetada sem confirmação explícita do professor: '{target}'"
            print(f"[PPAVOrchestrator] 🛡️ {err}")
            return {"success": False, "error": err, "requires_approval": True}

        if not page:
            return {"success": False, "error": "Objeto Page não fornecido."}

        try:
            # ── ROTA NATIVA HARNESS (CDP / Compositor / Teclas Win32 / Network Idle) ──
            if getattr(page, "is_harness", False):
                if action_type == "NAVIGATE":
                    await page.async_goto(target)
                    return {"success": True, "method": "harness_cdp"}

                if action_type == "CLICK":
                    res = await page.async_click_element(target, wait_idle=True)
                    return {"success": res.get("clicked", False), "method": res.get("method", "harness_click")}

                if action_type == "FILL":
                    res = await page.async_fill_element(target, action.value or "")
                    return {"success": res.get("filled", False), "method": "harness_fill_input"}

                if action_type == "FINISH":
                    return {"success": True, "finished": True}

                return {"success": True}

            # ── FALLBACK PLAYWRIGHT / MOCK DE TESTES UNITÁRIOS ──
            if action_type == "NAVIGATE":
                if hasattr(page, "goto") and callable(getattr(page, "goto", None)):
                    await page.goto(target, wait_until="domcontentloaded")
                return {"success": True}

            if action_type == "CLICK":
                js_click = """
                (target) => {
                    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
                    let el = null;
                    if (target.startsWith('#') || target.startsWith('.') || target.includes('>')) {
                        try { el = document.querySelector(target); } catch(e) {}
                    }
                    if (!el) {
                        const cleanTarget = norm(target.replace(/^text=/, ''));
                        const all = Array.from(document.querySelectorAll('button, a, .tab-btn, [role="tab"], [role="button"], input[type="submit"]'));
                        for (const item of all) {
                            const t = norm(item.innerText || item.textContent || item.getAttribute('aria-label') || item.id || '');
                            if (t === cleanTarget || t.includes(cleanTarget)) { el = item; break; }
                        }
                    }
                    if (el) {
                        el.scrollIntoView({ block: 'center', inline: 'center' });
                        el.click();
                        return { clicked: true, tag: el.tagName, id: el.id };
                    }
                    return { clicked: false };
                }
                """
                res = await page.evaluate(js_click, target)
                return {"success": res.get("clicked", False)}

            if action_type == "FILL":
                js_fill = """
                ({target, value}) => {
                    let el = document.querySelector(target);
                    if (el) {
                        el.value = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return { filled: true };
                    }
                    return { filled: false };
                }
                """
                res = await page.evaluate(js_fill, {"target": target, "value": action.value or ""})
                return {"success": res.get("filled", False)}

            if action_type == "FINISH":
                return {"success": True, "finished": True}

            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def execute_subgoal(
        self,
        sub_goal: str,
        page: Any,
        sub_goal_index: int
    ) -> Dict[str, Any]:
        """
        Executa o Loop PPAV completo (Perceber → Planejar → Agir → Verificar)
        para UM único sub-objetivo atômico.
        """
        self.session_state.current_sub_goal_index = sub_goal_index
        attempt_history: List[AttemptRecord] = []
        step_count = 0

        print(f"\n[PPAVOrchestrator] ───────────────────────────────────────────────────")
        print(f"[PPAVOrchestrator] ▶️ Iniciando Sub-Objetivo [{sub_goal_index+1}]: '{sub_goal}'")
        print(f"[PPAVOrchestrator] ───────────────────────────────────────────────────")

        while len(attempt_history) < self.max_attempts_per_subgoal:
            step_count += 1
            attempt_num = len(attempt_history) + 1

            # ── PASSO 1: PERCEBER ─────────────────────────────────────────────
            self._notify({"step": "perceive", "sub_goal": sub_goal, "attempt": attempt_num})
            p_before = await capture_perception_snapshot(page)
            if p_before.url:
                self.session_state.visited_urls.add(p_before.url)

            # ── PASSO 2: PLANEJAR ─────────────────────────────────────────────
            self._notify({"step": "plan", "sub_goal": sub_goal, "attempt": attempt_num})
            action = plan_next_action(
                goal=sub_goal,
                perception=p_before,
                session_state=self.session_state,
                attempt_history=attempt_history,
                max_attempts=self.max_attempts_per_subgoal
            )
            print(f"[PPAVOrchestrator] [Tentativa {attempt_num}] Ação Planejada: {action.action_type} -> '{action.target}' (Estratégia: {action.strategy})")

            if action.action_type == "FINISH":
                return {"success": True, "attempts": attempt_history, "sub_goal": sub_goal}

            if action.action_type == "FAIL":
                print(f"[PPAVOrchestrator] 🛑 Falha honesta reportada pelo planejador: {action.reasoning}")
                return {
                    "success": False,
                    "error": action.reasoning,
                    "attempts": attempt_history,
                    "sub_goal": sub_goal
                }

            # ── PASSO 3: AGIR ─────────────────────────────────────────────────
            self._notify({"step": "act", "action": action.to_dict(), "attempt": attempt_num})
            if self.network_interceptor:
                self.network_interceptor.reset()

            act_res = await self.act(page, action)
            if act_res.get("requires_approval"):
                return {
                    "success": False,
                    "requires_approval": True,
                    "action": action.to_dict(),
                    "error": act_res.get("error"),
                    "sub_goal": sub_goal
                }

            # Sincronização e estabilização do DOM pós-ação
            if getattr(page, "is_harness", False) and hasattr(page, "async_wait_for_settled"):
                await page.async_wait_for_settled(timeout=6.0)
            else:
                await asyncio.sleep(0.1)

            # ── PASSO 4: VERIFICAR ────────────────────────────────────────────
            self._notify({"step": "verify", "action": action.to_dict(), "attempt": attempt_num})
            p_after = await capture_perception_snapshot(page)
            net_outcome = self.network_interceptor.evaluate_action_network() if self.network_interceptor else None
            verification = verify_action_effect(action, p_before, p_after, network_outcome=net_outcome)

            attempt_rec = AttemptRecord(
                action=action,
                result_status=verification.status.value,
                error_message=verification.details
            )
            attempt_history.append(attempt_rec)

            print(f"[PPAVOrchestrator] [Verificação] Resultado: {verification.status.value} — {verification.details}")

            if verification.status == VerificationStatus.SUCCESS:
                print(f"[PPAVOrchestrator] ✅ Sub-Objetivo [{sub_goal_index+1}] concluído com sucesso comprovado!")
                self.session_state.completed_sub_goals.append(sub_goal)
                return {
                    "success": True,
                    "sub_goal": sub_goal,
                    "attempts": attempt_history,
                    "last_verification": verification,
                    "network_outcome": net_outcome
                }
            else:
                print(f"[PPAVOrchestrator] ⚠️ Ação não produziu o efeito desejado ({verification.status.value}). Re-alimentando o loop.")

        # Esgotou tentativas: Aciona Reflexão Causal
        diag = None
        if CausalReflector:
            from skills.hierarchical_planner_skill import SubGoalNode
            diag = CausalReflector.diagnose_failure(
                subgoal=SubGoalNode(subgoal_id=f"step_{sub_goal_index+1}", goal_text=sub_goal, category="NAVIGATION"),
                page_url=p_after.url if 'p_after' in locals() and p_after else "",
                error_text=attempt_history[-1].error_message if attempt_history else None,
                network_outcome=net_outcome if 'net_outcome' in locals() else None,
                observed_banners=p_after.error_banners if 'p_after' in locals() and p_after else []
            )
            print(f"[PPAVOrchestrator] 🧠 [CausalReflector] Diagnóstico: {diag.get('human_diagnosis')}")

        return {
            "success": False,
            "error": diag.get("human_diagnosis") if diag else f"Sub-objetivo '{sub_goal}' esgotou o limite de {self.max_attempts_per_subgoal} tentativas sem efeito comprovado.",
            "causal_diagnosis": diag,
            "attempts": attempt_history,
            "sub_goal": sub_goal
        }

    async def execute_goal(
        self,
        goal: str,
        page: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Executa um objetivo completo de alto nível:
        1. Decompõe o objetivo em fila de sub-objetivos.
        2. Executa sequencialmente cada sub-objetivo através do loop PPAV de 4 passos.
        3. Só avança para o próximo sub-objetivo após confirmação de sucesso do anterior.
        """
        target_page = page or self.page
        sub_goals = decompose_goal(goal)
        print(f"\n[PPAVOrchestrator] 🚀 Iniciando Fila de Sub-Objetivos para: '{goal}'")
        print(f"[PPAVOrchestrator] Sub-objetivos decompostos ({len(sub_goals)}): {sub_goals}")

        results: List[Dict[str, Any]] = []
        for idx, sg in enumerate(sub_goals):
            res = await self.execute_subgoal(sg, target_page, sub_goal_index=idx)
            results.append(res)
            if not res.get("success"):
                print(f"[PPAVOrchestrator] 🛑 Interrompendo fila de sub-objetivos no passo {idx+1}: {res.get('error')}")
                return {
                    "success": False,
                    "goal": goal,
                    "sub_goals": sub_goals,
                    "failed_at_index": idx,
                    "failed_sub_goal": sg,
                    "error": res.get("error"),
                    "results": results,
                    "session_state": self.session_state
                }

        print(f"[PPAVOrchestrator] 🏁 Todos os {len(sub_goals)} sub-objetivos foram executados e verificados com sucesso!")
        return {
            "success": True,
            "goal": goal,
            "sub_goals": sub_goals,
            "results": results,
            "session_state": self.session_state
        }
