"""
iterative_dom_explorer.py — Motor de Exploração Iterativa do DOM e Memória de Sessão (Camadas B e C)

Implementa a solução estrutural para a causa raiz H5:
1. Camada B: Loop de exploração iterativa em 8 passos:
   - Passo 1: Match exato de rótulo no DOM atual.
   - Passo 2: Scroll progressivo em contêineres roláveis (passos de 250px, até 6 iterações).
   - Passo 3: Expansão de elementos colapsáveis (dropdowns, accordions, "carregar mais").
   - Passo 4: Fuzzy / parcial match (tokens, primeiro nome, semelhança léxica).
   - Passo 5: Desambiguação honesta se houver 2+ candidatos válidos (padrão 'ambiguous').
   - Passo 6: Interação segura (com trava anti-destrutiva), aguardo de renderização e transição de estado.
   - Passo 7: Erro específico por nó caso esgotadas todas as estratégias.
   - Passo 8: Trace estruturado auditável para cada tentativa.

2. Camada C: Memória de Sessão (LiveSessionDomMap) e Compilação para SkillGraph:
   - Rastreia estado vivo durante a sessão.
   - Compila caminho bem-sucedido em SkillGraph seguro (is_submit_action=False).
   - Persiste via save_skill() para reuso a custo $0.00 pelo Motor Local.
"""

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    from navigation_state_machine import HierarchicalNavNode, NavNodeType
    from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams, RetryPolicy
    from graph_validator import assert_graph_safe
    from skill_store import save_skill, load_skill, DEFAULT_SKILLS_DIR
except ImportError:
    from sidecar.navigation_state_machine import HierarchicalNavNode, NavNodeType
    from sidecar.skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams, RetryPolicy
    from sidecar.graph_validator import assert_graph_safe
    from sidecar.skill_store import save_skill, load_skill, DEFAULT_SKILLS_DIR


DESTRUCTIVE_TERMS = [
    "excluir", "remover", "deletar", "cancelar", "apagar",
    "desmatricular", "delete", "remove", "cancel", "drop", "expel", "limpar"
]


def is_destructive_element_text(text: str) -> bool:
    """Verifica se o texto de um elemento contém termos destrutivos."""
    clean = (text or "").lower()
    return any(term in clean for term in DESTRUCTIVE_TERMS)


@dataclass
class ExplorationAttempt:
    node_id: str
    node_label: str
    strategy: str  # "exact_match" | "scroll_exploration" | "expand_collapsible" | "fuzzy_match"
    found_count: int
    selected_selector: Optional[str] = None
    status: str = "pending"  # "success" | "ambiguous" | "not_found" | "blocked_destructive"
    details: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class ExplorationResult:
    sucesso: bool
    status: str  # "success" | "ambiguous" | "not_found" | "error"
    active_node: Optional[HierarchicalNavNode] = None
    sequence_resolved: List[HierarchicalNavNode] = field(default_factory=list)
    trace: List[Dict[str, Any]] = field(default_factory=list)
    candidates: List[Dict[str, Any]] = field(default_factory=list)
    failed_node: Optional[HierarchicalNavNode] = None
    error_message: Optional[str] = None
    skill_graph: Optional[SkillGraph] = None
    execution_time_ms: float = 0.0


# ─────────────────────────────────────────────────────────────────────────────
# JavaScripts Injetados no Navegador (DOM Scripts)
# ─────────────────────────────────────────────────────────────────────────────

_JS_FIND_CANDIDATES = r"""
(args) => {
    const { labels, strategy, isItemLista } = args;

    const norm = (s) => (s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/gi, ' ')
        .replace(/[\s_]+/g, ' ').trim();

    const normalizedLabels = labels.map(norm).filter(Boolean);
    const primaryLabel = normalizedLabels[0] || '';
    const primaryTokens = primaryLabel.split(' ').filter(t => t.length >= 3);
    const firstName = primaryTokens[0] || '';

    const DESTRUCTIVE_TERMS = ['excluir', 'remover', 'deletar', 'cancelar', 'apagar', 'desmatricular', 'delete', 'remove', 'cancel'];

    let selectors = isItemLista 
        ? '.card-aluno, [class*="aluno"], [class*="student"], [data-aluno-id], .recado-card, tr, li, button, a, [role="button"], span'
        : 'button, a, [role="tab"], [role="menuitem"], [role="button"], .tab-btn, .subtab-btn, .tab, li, [role="link"]';

    const rawElements = Array.from(document.querySelectorAll(selectors));
    const matched = [];

    for (const el of rawElements) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-hidden') === 'true') continue;

        // Inspeção de estilo computado (bloqueio contra injeções visuais ocultas e camufladas)
        const elStyle = window.getComputedStyle(el);
        if (elStyle.display === 'none' || elStyle.visibility === 'hidden' || elStyle.visibility === 'collapse') continue;
        if (parseFloat(elStyle.opacity || '1') <= 0.05) continue;
        if (parseFloat(elStyle.fontSize || '16') <= 1) continue;

        // Bloqueio de camuflagem de cor (texto transparente ou mesma cor do fundo)
        const fgColor = (elStyle.color || '').replace(/\s+/g, '').toLowerCase();
        const bgColor = (elStyle.backgroundColor || '').replace(/\s+/g, '').toLowerCase();
        if (fgColor === 'transparent' || fgColor === 'rgba(0,0,0,0)') continue;
        if (fgColor && bgColor && fgColor === bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0,0,0,0)') continue;

        // Ignora contêineres estruturais grandes ou com muito texto
        if (el.innerText && el.innerText.length > 250) continue;
        if (!isItemLista && ['div', 'nav', 'ul', 'header'].includes(el.tagName.toLowerCase()) && el.children.length > 1) continue;
        
        // Elementos visíveis (com área e não ocultos por scroll do contêiner)
        const rect = el.getBoundingClientRect();
        if (el.offsetParent === null || (rect.width === 0 && rect.height === 0)) continue;
        // Bloqueio de posicionamento invisível fora da tela (ex: left: -9999px)
        if (rect.right < -50 || rect.bottom < -50) continue;

        // Verifica se está dentro dos contêineres roláveis ancestrais ou se algum ancestral é oculto
        let isScrolledOutOfView = false;
        let isAncestorHidden = false;
        let p = el.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
            const pStyle = window.getComputedStyle(p);
            if (pStyle.display === 'none' || pStyle.visibility === 'hidden' || p.getAttribute('aria-hidden') === 'true' || parseFloat(pStyle.opacity || '1') <= 0.05) {
                isAncestorHidden = true;
                break;
            }
            if (['auto', 'scroll', 'hidden'].includes(pStyle.overflowY) || ['auto', 'scroll', 'hidden'].includes(pStyle.overflowX)) {
                const pRect = p.getBoundingClientRect();
                if (rect.bottom <= pRect.top + 2 || rect.top >= pRect.bottom - 2) {
                    isScrolledOutOfView = true;
                    break;
                }
            }
            p = p.parentElement;
        }
        if (isAncestorHidden || isScrolledOutOfView) continue;

        const text = norm(el.innerText || el.textContent);
        const aria = norm(el.getAttribute('aria-label') || '');
        const title = norm(el.getAttribute('title') || '');
        const idStr = norm(el.id || '');
        const combined = `${text} ${aria} ${title} ${idStr}`.trim();

        if (!combined) continue;

        // Trava de segurança anti-destrutiva
        const isDestructive = DESTRUCTIVE_TERMS.some(t => combined.includes(t));

        let score = 0;
        let matchKind = 'none';

        for (let i = 0; i < normalizedLabels.length; i++) {
            const target = normalizedLabels[i];
            const isPrimary = (i === 0);
            if (text === target || aria === target) {
                const s = isPrimary ? 100 : 85;
                if (s > score) { score = s; matchKind = isPrimary ? 'exact_primary' : 'exact_synonym'; }
            } else if (text.startsWith(target) || aria.startsWith(target)) {
                const s = isPrimary ? 80 : 70;
                if (s > score) { score = s; matchKind = isPrimary ? 'prefix_primary' : 'prefix_synonym'; }
            } else if (text.includes(target) || aria.includes(target) || idStr.includes(target)) {
                const s = isPrimary ? 65 : 55;
                if (s > score) { score = s; matchKind = isPrimary ? 'contains_primary' : 'contains_synonym'; }
            }
        }

        // Fuzzy match: tolerância léxica, tokens do nome ou primeiro nome para alunos
        if (score === 0 && strategy === 'fuzzy') {
            if (primaryTokens.length > 1 && primaryTokens.every(tok => combined.includes(tok))) {
                score = 65;
                matchKind = 'all_tokens';
            } else if (firstName.length >= 3 && combined.includes(firstName)) {
                score = 50;
                matchKind = 'first_name';
            }
        }

        // Se for item de lista / card de aluno, busca botão de perfil interno ("Ver perfil", "Acessar")
        let actionElement = el;
        let actionSelector = el.id ? '#' + el.id : '';
        if (isItemLista && score > 0) {
            let innerBtn = el.querySelector('button, a, [role="button"], [class*="btn"]');
            if (!innerBtn) {
                const parentCard = el.closest('.card, [class*="card"], .card-aluno, tr, li, [data-aluno-id]');
                if (parentCard) {
                    innerBtn = parentCard.querySelector('button, a, [role="button"], [class*="btn"]');
                }
            }
            if (innerBtn) {
                actionElement = innerBtn;
                actionSelector = innerBtn.id ? '#' + innerBtn.id : (el.id ? '#' + el.id + ' button' : '');
                if (!actionSelector && innerBtn.className && typeof innerBtn.className === 'string') {
                    const firstClass = innerBtn.className.split(' ').filter(c => c && !c.includes(':'))[0];
                    if (firstClass) actionSelector = `${innerBtn.tagName.toLowerCase()}.${firstClass}`;
                }
            }
        }

        if (score > 0) {
            // Gera um seletor estável
            let finalSel = actionSelector;
            if (!finalSel) {
                if (el.id) {
                    finalSel = '#' + el.id;
                } else if (el.className && typeof el.className === 'string') {
                    const firstClass = el.className.split(' ').filter(c => c && !c.includes(':'))[0];
                    if (firstClass) finalSel = `${el.tagName.toLowerCase()}.${firstClass}`;
                }
                if (!finalSel) finalSel = el.tagName.toLowerCase();
            }

            matched.push({
                selector: finalSel,
                text: (el.innerText || el.textContent || '').trim().slice(0, 100),
                score: score,
                matchKind: matchKind,
                is_destructive: isDestructive,
                id: el.id || '',
                tagName: el.tagName.toLowerCase(),
                rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            });
        }
    }

    // Ordena por maior pontuação
    matched.sort((a, b) => b.score - a.score);
    return matched;
}
"""

_JS_SCROLL_CONTAINERS = r"""
() => {
    // Procura contêineres roláveis relevantes
    const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        const hasScroll = el.scrollHeight > el.clientHeight + 25;
        const isScrollableType = ['auto', 'scroll'].includes(style.overflowY);
        return hasScroll && isScrollableType && el.clientHeight >= 80;
    });

    if (scrollables.length > 0) {
        // Rola o maior contêiner rolável
        scrollables.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
        const target = scrollables[0];
        const prevTop = target.scrollTop;
        target.scrollBy({ top: 250, behavior: 'instant' });
        const hasMoved = target.scrollTop > prevTop;
        return { scrolled: true, container: target.tagName.toLowerCase() + (target.id ? '#' + target.id : ''), has_moved: hasMoved };
    }

    // Fallback: rola a janela principal
    const prevY = window.scrollY;
    window.scrollBy({ top: 250, behavior: 'instant' });
    const hasMoved = window.scrollY > prevY;
    return { scrolled: true, container: 'window', has_moved: hasMoved };
}
"""

_JS_EXPAND_COLLAPSIBLES = r"""
() => {
    // Expande accordions, menus recolhidos ou dropdowns sem risco destrutivo
    const candidates = Array.from(document.querySelectorAll(
        '[aria-expanded="false"], details:not([open]), .accordion-button.collapsed, [data-bs-toggle="collapse"]'
    ));

    let count = 0;
    for (const el of candidates) {
        const txt = (el.innerText || el.textContent || '').toLowerCase();
        // Veta termos destrutivos
        if (['excluir', 'cancelar', 'apagar', 'remover'].some(t => txt.includes(t))) continue;

        if (typeof el.click === 'function') {
            el.click();
            count++;
            if (count >= 3) break; // Orçamento de no máximo 3 expansões simultâneas
        }
    }
    return { expanded_count: count };
}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Camada C — Memória de Sessão (LiveSessionDomMap)
# ─────────────────────────────────────────────────────────────────────────────

class LiveSessionDomMap:
    """
    Mantém registro em memória durante a sessão da professora sobre nós visitados,
    caminhos resolvidos e seletores funcionais, alimentando o SkillGraph.
    """
    def __init__(self, portal_id: str = "generic", skills_dir: Optional[Path] = None):
        self.portal_id = portal_id
        self.skills_dir = skills_dir or DEFAULT_SKILLS_DIR
        self.visited_nodes: Dict[str, Dict[str, Any]] = {}
        self.resolved_sequences: Dict[str, List[Dict[str, Any]]] = {}

    def record_node_resolution(self, node_id: str, selector: str, strategy: str) -> None:
        self.visited_nodes[node_id] = {
            "selector": selector,
            "strategy": strategy,
            "resolved_at": time.time()
        }

    def compile_sequence_to_skill_graph(
        self,
        task_id: str,
        sequence: List[HierarchicalNavNode],
        action_trace: List[Dict[str, Any]],
        version: int = 1
    ) -> SkillGraph:
        """
        Compila uma sequência de navegação resolvida com sucesso em um SkillGraph
        imutável, tipado e com validação mandatória de segurança pré-gravação.
        """
        nodes: Dict[str, SkillNode] = {}
        node_ids: List[str] = []

        for idx, act in enumerate(action_trace):
            nid = f"nav_step_{idx}"
            act_type = act.get("action_type", "CLICK")
            sel = act.get("selector", "button")
            desc = act.get("description", f"Passo {idx + 1}")

            nodes[nid] = SkillNode(
                id=nid,
                type=act_type,
                anchor=SkillAnchor(
                    strategy="css_selector",
                    value=sel,
                    description=desc
                ),
                params=SkillNodeParams(
                    is_submit_action=False, # Pure navigation click
                    is_filter=True
                ),
                retry_policy=RetryPolicy(max_attempts=2, backoff_ms=300)
            )
            node_ids.append(nid)

        # Conecta as arestas on_success em cascata
        for i in range(len(node_ids) - 1):
            nodes[node_ids[i]].on_success = node_ids[i + 1]

        entry_node = node_ids[0] if node_ids else "nav_step_0"

        # Incrementa versão se já existir versão prévia salva no disco
        if version == 1:
            try:
                prev = load_skill(self.portal_id, task_id, base_dir=self.skills_dir)
                if prev:
                    version = prev.version + 1
            except Exception:
                version = 1

        graph = SkillGraph(
            id=f"skill_{self.portal_id}_{task_id}_v{version}",
            name=f"Navegação {task_id} ({self.portal_id})",
            portal_id=self.portal_id,
            task_id=task_id,
            version=version,
            entry_node=entry_node,
            nodes=nodes
        )

        # Validação mandatória de segurança (assert_graph_safe)
        assert_graph_safe(graph)
        return graph

    def save_learned_skill(self, graph: SkillGraph) -> Path:
        """Salva a skill compilada no disco para reuso futuro a custo zero."""
        return save_skill(graph, base_dir=self.skills_dir)


# ─────────────────────────────────────────────────────────────────────────────
# Camada B — Loop de Exploração Iterativa (IterativeDomExplorer)
# ─────────────────────────────────────────────────────────────────────────────

class IterativeDomExplorer:
    """
    Motor de exploração iterativa do DOM em 8 passos.
    Substitui tentativas estáticas por busca adaptativa multi-estratégia.
    """

    def __init__(
        self,
        max_scroll_iterations: int = 6,
        max_expand_iterations: int = 2,
        use_cached_skills: bool = False,
        session_map: Optional[LiveSessionDomMap] = None,
        skills_dir: Optional[Path] = None,
        on_attempt_callback: Optional[Callable[[ExplorationAttempt], None]] = None
    ):
        self.max_scroll_iterations = max_scroll_iterations
        self.max_expand_iterations = max_expand_iterations
        self.use_cached_skills = use_cached_skills
        self.session_map = session_map or LiveSessionDomMap(skills_dir=skills_dir)
        self.on_attempt = on_attempt_callback

    async def explore_and_navigate_sequence(
        self,
        page: Any,
        node_sequence: List[HierarchicalNavNode],
        task_id: str = "hierarchical_nav"
    ) -> ExplorationResult:
        """
        Executa a localização e interação para cada nó da sequência ordenada,
        reavaliando o DOM no novo estado a cada transição bem-sucedida.
        """
        t0 = time.monotonic()
        structured_trace: List[Dict[str, Any]] = []
        resolved_nodes: List[HierarchicalNavNode] = []
        action_trace_for_skill: List[Dict[str, Any]] = []

        # ── FAST-PATH: Reuso de SkillGraph Salvo (Nível 1 / Custo $0.00) ──
        cached_graph = None
        if self.use_cached_skills:
            try:
                cached_graph = load_skill(
                    portal_id=self.session_map.portal_id,
                    task_id=task_id,
                    base_dir=self.session_map.skills_dir
                )
            except Exception:
                cached_graph = None

        if self.use_cached_skills and cached_graph is not None and cached_graph.nodes:
            replay_trace: List[Dict[str, Any]] = []
            replay_ok = True
            current_nid = cached_graph.entry_node

            while current_nid:
                skill_node = cached_graph.nodes.get(current_nid)
                if not skill_node:
                    break
                sel = skill_node.anchor.value
                clicked = await self._click_target(page, sel)
                if clicked:
                    replay_trace.append({
                        "step": "skill_replay",
                        "strategy": "skill_graph_replay",
                        "skill_id": cached_graph.id,
                        "node_id": skill_node.id,
                        "selector": sel,
                        "status": "clicked_success"
                    })
                    try:
                        if hasattr(page, "wait_for_timeout"):
                            await page.wait_for_timeout(100)
                        else:
                            await asyncio.sleep(0.1)
                    except Exception:
                        pass
                    current_nid = skill_node.on_success
                else:
                    replay_ok = False
                    replay_trace.append({
                        "step": "skill_replay",
                        "strategy": "skill_graph_drift_detected",
                        "skill_id": cached_graph.id,
                        "failed_node_id": skill_node.id,
                        "failed_selector": sel,
                        "status": "drift_fallback_to_exploration"
                    })
                    print(f"[IterativeDomExplorer] [DRIFT] Seletor '{sel}' do SkillGraph falhou. Ativando fallback para exploracao iterativa...")
                    break

            if replay_ok and len(replay_trace) == len(node_sequence):
                total_elapsed = (time.monotonic() - t0) * 1000
                print(f"[IterativeDomExplorer] [REUSO] SkillGraph '{cached_graph.id}' executado com sucesso em {total_elapsed:.1f}ms!")
                return ExplorationResult(
                    sucesso=True,
                    status="success",
                    active_node=node_sequence[-1] if node_sequence else None,
                    sequence_resolved=node_sequence,
                    trace=replay_trace,
                    skill_graph=cached_graph,
                    execution_time_ms=total_elapsed
                )
            else:
                structured_trace.extend(replay_trace)

        for step_idx, node in enumerate(node_sequence):
            step_num = step_idx + 1
            total_steps = len(node_sequence)
            print(f"[IterativeDomExplorer] [BUSCA] [Passo {step_num}/{total_steps}] Localizando no '{node.label}' ({node.node_type.value})...")

            # Executa o loop de 8 passos para este nó específico (excluindo seletores de nós pais já visitados)
            visited_selectors = [act["selector"] for act in action_trace_for_skill if act.get("selector")]
            step_res = await self._explore_single_node(page, node, exclude_selectors=visited_selectors)

            structured_trace.extend(step_res["trace"])

            # Se a ação foi bloqueada por segurança (termo destrutivo):
            if step_res["status"] == "blocked_destructive":
                print(f"[IterativeDomExplorer] [BLOQUEADO] Acao bloqueada por seguranca no no '{node.label}'.")
                return ExplorationResult(
                    sucesso=False,
                    status="blocked_destructive",
                    active_node=node,
                    sequence_resolved=resolved_nodes,
                    trace=structured_trace,
                    candidates=step_res.get("candidates", []),
                    error_message=step_res.get("error", f"Ação bloqueada por segurança no nó '{node.label}'."),
                    execution_time_ms=(time.monotonic() - t0) * 1000
                )

            # Se encontrou ambiguidade: para imediatamente com desambiguação honesta
            if step_res["status"] == "ambiguous":
                print(f"[IterativeDomExplorer] [AVISO] Ambiguidade detectada para o no '{node.label}' ({len(step_res['candidates'])} candidatos).")
                return ExplorationResult(
                    sucesso=False,
                    status="ambiguous",
                    active_node=node,
                    sequence_resolved=resolved_nodes,
                    trace=structured_trace,
                    candidates=step_res["candidates"],
                    error_message=f"Ambiguidade: múltiplos elementos correspondem a '{node.label}'.",
                    execution_time_ms=(time.monotonic() - t0) * 1000
                )

            # Se falhou sem encontrar nenhum candidato para o nó:
            if not step_res["sucesso"]:
                err = f"No '{node.label}' ({node.node_type.value}) nao foi localizado no DOM apos esgotar estrategias."
                print(f"[IterativeDomExplorer] [ERRO] {err}")
                return ExplorationResult(
                    sucesso=False,
                    status="not_found",
                    failed_node=node,
                    sequence_resolved=resolved_nodes,
                    trace=structured_trace,
                    error_message=err,
                    execution_time_ms=(time.monotonic() - t0) * 1000
                )

            # Sucesso no nó atual: executa transição de estado e prepara o próximo
            target_element = step_res["selected_element"]
            selector = target_element["selector"]
            resolved_nodes.append(node)

            action_trace_for_skill.append({
                "action_type": "CLICK",
                "selector": selector,
                "description": f"Acessar {node.label} ({node.node_type.value})"
            })

            # Atualiza o mapa vivo de sessão
            self.session_map.record_node_resolution(node.node_id, selector, step_res.get("strategy_used", "exact_match"))

            # Aguarda a re-renderização/estabilização do DOM antes do próximo nó
            try:
                if hasattr(page, "wait_for_timeout"):
                    await page.wait_for_timeout(300)
                else:
                    await asyncio.sleep(0.3)
            except Exception:
                await asyncio.sleep(0.3)

        # Toda a sequência foi resolvida com sucesso!
        # Camada C: compila o caminho em SkillGraph reutilizável
        compiled_graph = None
        try:
            compiled_graph = self.session_map.compile_sequence_to_skill_graph(
                task_id=task_id,
                sequence=resolved_nodes,
                action_trace=action_trace_for_skill
            )
            self.session_map.save_learned_skill(compiled_graph)
            print(f"[IterativeDomExplorer] [SALVO] Caminho hierarquico compilado com sucesso em SkillGraph: {compiled_graph.id}")
        except Exception as e:
            print(f"[IterativeDomExplorer] Aviso ao compilar SkillGraph: {e}")

        total_elapsed = (time.monotonic() - t0) * 1000
        print(f"[IterativeDomExplorer] [SUCESSO] Sequencia completa de {len(resolved_nodes)} nos resolvida com sucesso em {total_elapsed:.1f}ms!")

        return ExplorationResult(
            sucesso=True,
            status="success",
            active_node=resolved_nodes[-1] if resolved_nodes else None,
            sequence_resolved=resolved_nodes,
            trace=structured_trace,
            skill_graph=compiled_graph,
            execution_time_ms=total_elapsed
        )

    async def _explore_single_node(
        self,
        page: Any,
        node: HierarchicalNavNode,
        exclude_selectors: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Executa o loop de 8 passos para um nó específico da hierarquia."""
        trace: List[Dict[str, Any]] = []
        labels_to_search = [node.label] + node.synonyms
        is_item_lista = (node.node_type == NavNodeType.ITEM_LISTA)

        # ── PASSO 1: Match Exato no DOM Atual ──
        candidates = await self._scan_dom(page, labels_to_search, strategy="exact", is_item_lista=is_item_lista)
        trace.append({
            "step": 1,
            "strategy": "exact_match",
            "node": node.label,
            "found_count": len(candidates),
            "candidates": candidates
        })

        # ── PASSO 2: Scroll Progressivo em Contêineres Roláveis ──
        if len(candidates) == 0:
            for scroll_idx in range(self.max_scroll_iterations):
                scroll_info = await self._scroll_containers(page)
                if not scroll_info.get("has_moved"):
                    break # Fim do contêiner rolável

                candidates = await self._scan_dom(page, labels_to_search, strategy="exact", is_item_lista=is_item_lista)
                trace.append({
                    "step": 2,
                    "strategy": f"scroll_iteration_{scroll_idx + 1}",
                    "node": node.label,
                    "found_count": len(candidates),
                    "container": scroll_info.get("container")
                })
                if len(candidates) > 0:
                    break

        # ── PASSO 3: Expansão de Elementos Colapsáveis ──
        if len(candidates) == 0:
            expand_info = await self._expand_collapsibles(page)
            if expand_info.get("expanded_count", 0) > 0:
                candidates = await self._scan_dom(page, labels_to_search, strategy="exact", is_item_lista=is_item_lista)
                trace.append({
                    "step": 3,
                    "strategy": "expand_collapsibles",
                    "node": node.label,
                    "expanded_count": expand_info.get("expanded_count"),
                    "found_count": len(candidates)
                })

        # ── PASSO 4: Fuzzy / Parcial Match ──
        if len(candidates) == 0:
            candidates = await self._scan_dom(page, labels_to_search, strategy="fuzzy", is_item_lista=is_item_lista)
            trace.append({
                "step": 4,
                "strategy": "fuzzy_match",
                "node": node.label,
                "found_count": len(candidates),
                "candidates": candidates
            })

        # Filtra seletores que já foram clicados em passos anteriores da sequência
        if exclude_selectors:
            candidates = [c for c in candidates if c.get("selector") not in exclude_selectors]

        # ── Veto Anti-Destrutivo (Trava de Segurança Pré-Seleção) ──
        safe_candidates = [c for c in candidates if not c.get("is_destructive")]
        destructive_candidates = [c for c in candidates if c.get("is_destructive")]

        if destructive_candidates:
            trace.append({
                "step": 6,
                "status": "destructive_vetoed",
                "vetoed_count": len(destructive_candidates),
                "vetoed_elements": [c.get("text") for c in destructive_candidates]
            })

        if not safe_candidates and destructive_candidates:
            # Caso o(s) único(s) candidato(s) seja(m) destrutivo(s) -> Bloqueio explícito por segurança
            err = f"Ação bloqueada por segurança: o elemento '{destructive_candidates[0].get('text')}' contém termos destrutivos."
            trace.append({"step": 6, "status": "blocked_destructive", "error": err})
            return {
                "sucesso": False,
                "status": "blocked_destructive",
                "error": err,
                "candidates": destructive_candidates,
                "trace": trace
            }

        candidates = safe_candidates

        # ── PASSO 5: Tratamento de Ambiguidade (2+ Candidatos Válidos) ──
        # Filtra candidatos com pontuação máxima equivalente entre os seguros
        if len(candidates) > 1:
            max_score = max(c["score"] for c in candidates)
            top_candidates = [c for c in candidates if c["score"] >= max_score - 10]
            if len(top_candidates) > 1:
                # Ambiguidade real: não chuta
                return {
                    "sucesso": False,
                    "status": "ambiguous",
                    "candidates": top_candidates,
                    "trace": trace
                }
            candidates = [top_candidates[0]]

        # ── PASSO 7: Erro Específico por Nó (Esgotou 1-4) ──
        if len(candidates) == 0:
            return {
                "sucesso": False,
                "status": "not_found",
                "trace": trace
            }

        # ── PASSO 6: Interação Segura ──
        target = candidates[0]
        if target.get("is_destructive"):
            err = f"Ação bloqueada por segurança: o elemento '{target.get('text')}' contém termos destrutivos."
            trace.append({"step": 6, "status": "blocked_destructive", "error": err})
            return {"sucesso": False, "status": "blocked_destructive", "error": err, "candidates": [target], "trace": trace}

        # Executa a interação (clique)
        click_success = await self._click_target(page, target["selector"])
        if not click_success:
            err = f"Falha ao interagir com o seletor '{target['selector']}' no nó '{node.label}'."
            trace.append({"step": 6, "status": "click_failed", "error": err})
            return {"sucesso": False, "status": "error", "error": err, "trace": trace}

        trace.append({
            "step": 6,
            "status": "clicked_success",
            "selector": target["selector"],
            "element_text": target["text"],
            "score": target["score"]
        })

        return {
            "sucesso": True,
            "status": "success",
            "selected_element": target,
            "strategy_used": next((t["strategy"] for t in reversed(trace) if "strategy" in t), "exact_match"),
            "trace": trace
        }

    async def _scan_dom(
        self,
        page: Any,
        labels: List[str],
        strategy: str = "exact",
        is_item_lista: bool = False
    ) -> List[Dict[str, Any]]:
        """Invoca o script de varredura semântica no navegador."""
        try:
            if hasattr(page, "evaluate"):
                return await page.evaluate(_JS_FIND_CANDIDATES, {
                    "labels": labels,
                    "strategy": strategy,
                    "isItemLista": is_item_lista
                })
        except Exception as e:
            print(f"[IterativeDomExplorer] Aviso no _scan_dom: {e}")
        return []

    async def _scroll_containers(self, page: Any) -> Dict[str, Any]:
        """Rola contêineres roláveis por 250px."""
        try:
            if hasattr(page, "evaluate"):
                res = await page.evaluate(_JS_SCROLL_CONTAINERS)
                await asyncio.sleep(0.15)
                return res
        except Exception as e:
            print(f"[IterativeDomExplorer] Aviso no scroll: {e}")
        return {"scrolled": False, "has_moved": False}

    async def _expand_collapsibles(self, page: Any) -> Dict[str, Any]:
        """Expande elementos colapsáveis."""
        try:
            if hasattr(page, "evaluate"):
                res = await page.evaluate(_JS_EXPAND_COLLAPSIBLES)
                await asyncio.sleep(0.2)
                return res
        except Exception as e:
            print(f"[IterativeDomExplorer] Aviso no expand: {e}")
        return {"expanded_count": 0}

    async def _click_target(self, page: Any, selector: str) -> bool:
        """Clica no elemento pelo seletor ou via DOM dispatch."""
        try:
            if hasattr(page, "locator"):
                try:
                    loc = page.locator(selector).first
                    if await loc.count() > 0:
                        await loc.click(timeout=2000)
                        return True
                except Exception:
                    pass
            if hasattr(page, "evaluate"):
                clicked = await page.evaluate("""(sel) => {
                    const el = document.querySelector(sel);
                    if (el) {
                        el.click();
                        return true;
                    }
                    return false;
                }""", selector)
                return bool(clicked)
        except Exception as e:
            print(f"[IterativeDomExplorer] Aviso no _click_target: {e}")
        return False
