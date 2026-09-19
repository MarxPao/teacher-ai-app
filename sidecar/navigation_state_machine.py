"""
navigation_state_machine.py — Máquina de Estados de Navegação (Etapa 2)

Responsabilidade: saber "onde o agente está" dentro de um portal escolar
e navegar autonomamente até a tabela-alvo (notas/frequência), sem nunca
tentar preencher credenciais.

Estados:
  UNKNOWN                  -> não foi possível identificar a página
  LOGIN_PENDING            -> tela de login detectada → pausar, pedir ação humana
  BLOCKED                  -> CAPTCHA, 2FA ou bloqueio ativo → pedir ação humana
  MENU_PRINCIPAL           -> logado, na página inicial/dashboard do portal
  TURMA_SELECIONADA        -> turma já escolhida, aguardando selecionar disciplina/etapa
  DISCIPLINA_SELECIONADA   -> disciplina selecionada, aguardando etapa
  ETAPA_SELECIONADA        -> etapa/bimestre selecionado, aguardando tabela
  TABELA_ALVO_ENCONTRADA   -> tabela de alunos com campos de nota/frequência visível e editável

Filosofia de detecção:
  Camada 1 (determinística, sem LLM): URL + presença de elementos DOM
  Camada 2 (heurística leve, sem LLM): palavras-chave no texto visível da página
  Camada 3 (LLM, opcional): apenas se a tarefa exigir navegação adaptativa

Garantias:
  - LOGIN_PENDING nunca tenta preencher credenciais. Retorna sinal de pausa.
  - BLOCKED nunca tenta resolver CAPTCHA. Retorna sinal de pausa.
  - Cada transição de estado gera um trace legível.

Uso:
  from navigation_state_machine import NavigationStateMachine, NavState

  async def run(page, task):
      sm = NavigationStateMachine()
      result = await sm.navigate_to_target(page, task)
      if result.requires_human:
          # Emite mensagem de voz para a professora
          say(result.human_message)
          return
      if result.state == NavState.TABELA_ALVO_ENCONTRADA:
          # Prosseguir para escrita
          ...
"""

import asyncio
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Iterable, List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Estados da máquina
# ─────────────────────────────────────────────────────────────────────────────

class NavState(str, Enum):
    UNKNOWN                = "UNKNOWN"
    LOGIN_PENDING          = "LOGIN_PENDING"
    BLOCKED                = "BLOCKED"
    MENU_PRINCIPAL         = "MENU_PRINCIPAL"
    TURMA_SELECIONADA      = "TURMA_SELECIONADA"
    DISCIPLINA_SELECIONADA = "DISCIPLINA_SELECIONADA"
    ETAPA_SELECIONADA      = "ETAPA_SELECIONADA"
    TABELA_ALVO_ENCONTRADA = "TABELA_ALVO_ENCONTRADA"


# ─────────────────────────────────────────────────────────────────────────────
# Resultado de uma navegação/detecção
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class NavResult:
    state: NavState
    requires_human: bool = False
    human_message: str = ""          # mensagem para exibir / narrar para a professora
    details: Dict[str, Any] = field(default_factory=dict)
    trace: List[str] = field(default_factory=list)
    elapsed_ms: float = 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Perfis de portal — regras determinísticas por domínio
# ─────────────────────────────────────────────────────────────────────────────

class PortalProfile:
    """
    Perfil com heurísticas específicas para um portal.
    Cada perfil tem regras de detecção de estado e seletores de navegação.
    """
    def __init__(
        self,
        domain_keywords: List[str],
        login_url_fragments: List[str],
        login_dom_selectors: List[str],
        dashboard_url_fragments: List[str],
        dashboard_text_keywords: List[str],
        target_table_selectors: List[str],
        target_table_text_keywords: List[str],
        nav_steps: List[Dict[str, Any]],          # passos de navegação em ordem
    ):
        self.domain_keywords         = domain_keywords
        self.login_url_fragments     = login_url_fragments
        self.login_dom_selectors     = login_dom_selectors
        self.dashboard_url_fragments = dashboard_url_fragments
        self.dashboard_text_keywords = dashboard_text_keywords
        self.target_table_selectors  = target_table_selectors
        self.target_table_text_keywords = target_table_text_keywords
        self.nav_steps               = nav_steps  # não usados na detecção, usados na navegação


# Perfil para o portal Machado Sobrinho (paineldoaluno / paineldoprofessor)
MACHADO_SOBRINHO_PROFILE = PortalProfile(
    domain_keywords=["machadosobrinho", "paineldoaluno", "paineldoprofessor"],
    login_url_fragments=["/login", "/professor_login", "/auth", "/signin", "/entrar"],
    login_dom_selectors=[
        "input[type='password']",
        "input[name*='senha' i]",
        "input[placeholder*='cpf' i]",
        "input[placeholder*='senha' i]",
        "button[type='submit']",
    ],
    dashboard_url_fragments=["/dashboard", "/inicio", "/home", "/index", "/professor"],
    dashboard_text_keywords=[
        "meus alunos", "minhas turmas", "diário", "lançar", "notas",
        "bem-vindo", "bem vindo", "painel do professor",
    ],
    target_table_selectors=[
        "table",
        ".tabela-alunos",
        "[class*='notas']",
        "[class*='frequencia']",
        "[class*='lancamento']",
        "table tbody tr",
    ],
    target_table_text_keywords=[
        "lançar nota", "lançar falta", "frequência", "lançamento", "nota", "falta",
        "presença", "presenca", "bimestre", "frequencia", "lancamento",
    ],
    nav_steps=[
        # Cada passo é executado pela máquina de estados na Etapa 4 (navegação autônoma)
        # Format: {"action": "click"|"navigate"|"select", "selector": ..., "text_match": ..., "description": ...}
        {"action": "navigate", "url": "https://machadosobrinho.paineldoaluno.com.br/", "description": "Abre a página inicial do portal"},
        {"action": "click", "text_match": "Diário", "selector": "a[href*='diario'], a[href*='lancamento'], nav a", "description": "Acessa o diário eletrônico"},
    ]
)

# Perfil genérico (fallback para portais desconhecidos)
GENERIC_PROFILE = PortalProfile(
    domain_keywords=[],
    login_url_fragments=["/login", "/auth", "/signin", "/entrar", "/acesso"],
    login_dom_selectors=["input[type='password']", "input[name*='senha' i]"],
    dashboard_url_fragments=["/dashboard", "/home", "/inicio", "/painel"],
    dashboard_text_keywords=["turma", "aluno", "notas", "diário", "frequência"],
    target_table_selectors=["table", "[class*='nota']", "[class*='aluno']"],
    target_table_text_keywords=["nota", "falta", "frequência", "aluno", "turma"],
    nav_steps=[],
)

ALL_PROFILES = [MACHADO_SOBRINHO_PROFILE]


def _find_profile(url: str) -> PortalProfile:
    url_lower = url.lower()
    for p in ALL_PROFILES:
        if any(kw in url_lower for kw in p.domain_keywords):
            return p
    return GENERIC_PROFILE


# ─────────────────────────────────────────────────────────────────────────────
# JS de inspeção de DOM (determinístico, sem LLM)
# ─────────────────────────────────────────────────────────────────────────────

_DOM_INSPECT_JS = r"""
(selectors) => {
  const results = {};
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      results[sel] = {
        exists: !!el,
        visible: el ? (el.offsetParent !== null || el.getBoundingClientRect().width > 0) : false,
        text: el ? (el.innerText || el.textContent || '').trim().slice(0, 200) : ''
      };
    } catch(e) {
      results[sel] = { exists: false, visible: false, text: '' };
    }
  }
  return results;
}
"""

_PAGE_TEXT_JS = r"""
() => {
  // Coleta texto visível da página (ignora scripts, estilos, noscript)
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  const chunks = [];
  let node;
  while (node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent) continue;
    const tag = parent.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'link', 'meta'].includes(tag)) continue;
    const txt = node.textContent.trim();
    if (txt.length >= 3) chunks.push(txt);
  }
  return chunks.join(' ').toLowerCase().slice(0, 3000);
}
"""

_COUNT_TABLE_INPUTS_JS = r"""
(tableSelector) => {
  const table = document.querySelector(tableSelector);
  if (!table) return { rows: 0, inputs: 0, editable: false };
  const rows = table.querySelectorAll('tbody tr, tr');
  const inputs = table.querySelectorAll("input[type='text'], input[type='number'], input:not([type='hidden'])");
  return {
    rows: rows.length,
    inputs: inputs.length,
    editable: inputs.length > 0
  };
}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Máquina de Estados de Navegação
# ─────────────────────────────────────────────────────────────────────────────

class NavigationStateMachine:
    """
    Máquina de estados que detecta e transita entre os estados de navegação
    de um portal escolar, sem nunca assumir onde está ou tentar adivinhar credenciais.
    """

    def __init__(self, max_nav_steps: int = 8, step_timeout_ms: float = 8000):
        self.max_nav_steps    = max_nav_steps
        self.step_timeout_ms  = step_timeout_ms

    # ─── API pública ──────────────────────────────────────────────────────────

    async def detect_current_state(self, page: Any) -> NavResult:
        """
        Detecta em qual estado o portal se encontra atualmente.
        Não executa nenhuma ação de navegação — apenas observa.

        Retorna NavResult com o estado detectado e, se necessário,
        a mensagem a ser narrada para a professora.
        """
        t0 = time.monotonic()
        trace = []

        try:
            url   = page.url or ""
            title = await page.title() or ""
            trace.append(f"URL={url!r} title={title!r}")
        except Exception as e:
            return NavResult(
                state=NavState.UNKNOWN,
                requires_human=False,
                trace=[f"Erro ao ler URL/title: {e}"]
            )

        profile = _find_profile(url)

        # ── Camada 1: URL determinística ─────────────────────────────────────

        url_lower = url.lower()

        # LOGIN: URL fragmentos de autenticação
        if any(frag in url_lower for frag in profile.login_url_fragments):
            trace.append("Camada1: URL contém fragmento de login")
            return self._make_login_result(trace, t0)

        # BLOCKED: URL cloudflare/captcha
        if any(kw in url_lower for kw in ["/challenge", "/cdn-cgi/", "captcha", "blocked", "access-denied"]):
            trace.append("Camada1: URL indica bloqueio/captcha")
            return NavResult(
                state=NavState.BLOCKED,
                requires_human=True,
                human_message=(
                    "Professora, o portal exibiu um desafio de segurança (CAPTCHA). "
                    "Por favor, resolva a verificação na janela do navegador e me avise quando terminar."
                ),
                trace=trace,
                elapsed_ms=(time.monotonic() - t0) * 1000,
            )

        # ── Camada 2: DOM — elementos de login ───────────────────────────────

        try:
            dom_results = await page.evaluate(_DOM_INSPECT_JS, profile.login_dom_selectors)
            visible_login_elements = [
                sel for sel, info in dom_results.items()
                if info.get("exists") and info.get("visible")
            ]
            if len(visible_login_elements) >= 2:
                trace.append(f"Camada2: {len(visible_login_elements)} elementos de login visíveis")
                return self._make_login_result(trace, t0)
        except Exception as e:
            trace.append(f"Camada2 DOM: aviso ({e})")

        # ── Camada 3: Texto visível da página ────────────────────────────────

        try:
            page_text = await page.evaluate(_PAGE_TEXT_JS)
        except Exception as e:
            page_text = ""
            trace.append(f"Camada3 text: aviso ({e})")

        # LOGIN: palavras-chave de sessão expirada
        if any(kw in page_text for kw in [
            "faça login", "faca login", "sua sessão expirou", "sessao expirou",
            "verifique se você está logado", "entrar com cpf", "cpf e senha",
            "acesse sua conta",
        ]):
            trace.append("Camada3: texto indica login necessário")
            return self._make_login_result(trace, t0)

        # CAPTCHA: palavras-chave de bloqueio
        try:
            has_captcha = await page.locator(
                "iframe[src*='recaptcha'], iframe[src*='hcaptcha'], div.g-recaptcha, div#cf-turnstile"
            ).count() > 0
            if has_captcha:
                trace.append("Camada3: CAPTCHA detectado no DOM")
                return NavResult(
                    state=NavState.BLOCKED,
                    requires_human=True,
                    human_message=(
                        "Professora, o portal exibiu uma verificação de segurança (CAPTCHA). "
                        "Resolva na janela do navegador e me avise quando terminar."
                    ),
                    trace=trace,
                    elapsed_ms=(time.monotonic() - t0) * 1000,
                )
        except Exception:
            pass

        # ── Camada 4: Tabela-alvo com inputs editáveis (busca recursiva no documento e em iframes) ──
        if hasattr(page, "frames") and isinstance(page.frames, (list, tuple)) and len(page.frames) > 0:
            frames_to_check = page.frames
        else:
            frames_to_check = [page]
        for f in frames_to_check:
            for sel in profile.target_table_selectors:
                try:
                    count_result = await f.evaluate(_COUNT_TABLE_INPUTS_JS, sel)
                    if count_result.get("editable") and count_result.get("rows", 0) >= 2:
                        frame_info = f" (frame='{getattr(f, 'name', '')}')" if f != getattr(page, "main_frame", None) else ""
                        trace.append(f"Camada4: tabela editável encontrada em '{sel}'{frame_info} ({count_result['rows']} linhas, {count_result['inputs']} inputs)")
                        return NavResult(
                            state=NavState.TABELA_ALVO_ENCONTRADA,
                            requires_human=False,
                            details={
                                "selector": sel,
                                "rows": count_result["rows"],
                                "inputs": count_result["inputs"],
                                "frame_name": getattr(f, "name", None),
                                "is_iframe": (f != getattr(page, "main_frame", None))
                            },
                            trace=trace,
                            elapsed_ms=(time.monotonic() - t0) * 1000,
                        )
                except Exception:
                    continue

        # ── Camada 5: Contexto de lançamento presente, mas sem tabela editável ──
        # Deve ter precedência sobre MENU_PRINCIPAL para evitar falso positivo.
        # Critério: pelo menos 2 palavras-chave de lançamento/notas presentes.
        target_kw_hits = sum(
            1 for kw in profile.target_table_text_keywords if kw in page_text
        )
        if target_kw_hits >= 2:
            trace.append(f"Camada5: {target_kw_hits} palavras de notas/frequência presentes, sem tabela editável → ETAPA_SELECIONADA")
            return NavResult(
                state=NavState.ETAPA_SELECIONADA,
                requires_human=False,
                details={"hint": "possível carregamento assíncrono da tabela", "kw_hits": target_kw_hits},
                trace=trace,
                elapsed_ms=(time.monotonic() - t0) * 1000,
            )

        # ── Camada 6: Dashboard / Menu principal ─────────────────────────────

        if any(kw in page_text for kw in profile.dashboard_text_keywords):
            trace.append("Camada6: texto indica dashboard/menu principal")
            return NavResult(
                state=NavState.MENU_PRINCIPAL,
                requires_human=False,
                trace=trace,
                elapsed_ms=(time.monotonic() - t0) * 1000,
            )

        if any(frag in url_lower for frag in profile.dashboard_url_fragments):
            trace.append("Camada6: URL indica dashboard")
            return NavResult(
                state=NavState.MENU_PRINCIPAL,
                requires_human=False,
                trace=trace,
                elapsed_ms=(time.monotonic() - t0) * 1000,
            )

        # ── Camada 7: Contexto de notas com 1 palavra-chave (sinal mais fraco) ─

        if target_kw_hits == 1:
            trace.append("Camada7: 1 palavra de lançamento presente, sem tabela → ETAPA_SELECIONADA")
            return NavResult(
                state=NavState.ETAPA_SELECIONADA,
                requires_human=False,
                details={"hint": "possível carregamento assíncrono da tabela", "kw_hits": target_kw_hits},
                trace=trace,
                elapsed_ms=(time.monotonic() - t0) * 1000,
            )

        # ── Fallback ─────────────────────────────────────────────────────────

        trace.append("Fallback: estado não identificado pelas heurísticas")
        return NavResult(
            state=NavState.UNKNOWN,
            requires_human=False,
            trace=trace,
            elapsed_ms=(time.monotonic() - t0) * 1000,
        )

    async def navigate_to_target(
        self,
        page: Any,
        task: Dict[str, Any],
        on_state_change: Optional[Any] = None,
    ) -> NavResult:
        """
        Tenta navegar autonomamente até TABELA_ALVO_ENCONTRADA.

        Regra fundamental: se em qualquer momento o estado for LOGIN_PENDING
        ou BLOCKED, para imediatamente e retorna com requires_human=True.

        Parâmetros do task (Dict):
          - portal: URL do portal (ex: "machadosobrinho.paineldoaluno.com.br")
          - turma: nome/ID da turma (ex: "7 ANO B")
          - disciplina: nome da disciplina (ex: "História")
          - etapa: bimestre/semestre (ex: "2° Bimestre")
          - action_type: "lancar_nota" | "lancar_falta" | "read_roster"

        Retorna NavResult com o estado final e o trace de passos.
        """
        t0 = time.monotonic()
        trace: List[str] = []
        profile = _find_profile(task.get("portal", ""))

        for step_num in range(self.max_nav_steps):
            # 1. Detecta estado atual
            result = await self.detect_current_state(page)
            trace.extend([f"[Passo {step_num+1}] {line}" for line in result.trace])

            if on_state_change:
                try:
                    on_state_change(result.state, result)
                except Exception:
                    pass

            # 2. Parar se requer intervenção humana
            if result.requires_human:
                result.trace = trace
                result.elapsed_ms = (time.monotonic() - t0) * 1000
                return result

            # 3. Chegamos na tabela?
            if result.state == NavState.TABELA_ALVO_ENCONTRADA:
                trace.append(f"[Passo {step_num+1}] CHEGAMOS. Tabela encontrada com {result.details.get('rows',0)} linhas.")
                result.trace = trace
                result.elapsed_ms = (time.monotonic() - t0) * 1000
                return result

            # 4. Executa transição de acordo com o estado
            nav_ok, nav_trace = await self._execute_nav_step(page, result.state, task, profile)
            trace.append(f"[Passo {step_num+1}] Nav: {nav_trace}")

            if not nav_ok:
                # Sem transição possível — reporta estado atual e para
                result.trace = trace
                result.elapsed_ms = (time.monotonic() - t0) * 1000
                return result

            # 5. Aguarda carregamento da página após a ação
            try:
                await page.wait_for_load_state("networkidle", timeout=self.step_timeout_ms)
            except Exception:
                # Portais dinâmicos raramente atingem "networkidle" — continua mesmo assim
                await asyncio.sleep(1.5)

        # Limite de passos atingido
        final = await self.detect_current_state(page)
        trace.append(f"[Limite de {self.max_nav_steps} passos atingido] Estado final: {final.state}")
        final.trace = trace
        final.elapsed_ms = (time.monotonic() - t0) * 1000
        return final

    # ─── Execução de passos de navegação ─────────────────────────────────────

    async def _execute_nav_step(
        self,
        page: Any,
        current_state: NavState,
        task: Dict[str, Any],
        profile: PortalProfile,
    ) -> Tuple[bool, str]:
        """
        Executa a transição correspondente ao estado atual.
        Retorna (sucesso, descrição do que foi feito).
        """
        portal  = task.get("portal", "")
        turma   = task.get("turma", "")
        discip  = task.get("disciplina", "")
        etapa   = task.get("etapa", "")

        if current_state == NavState.UNKNOWN:
            # Tenta navegar para a página inicial do portal
            target_url = portal if portal.startswith("http") else f"https://{portal}"
            try:
                await page.goto(target_url, timeout=12000, wait_until="domcontentloaded")
                return True, f"Navegado para {target_url}"
            except Exception as e:
                return False, f"Falha ao navegar para {target_url}: {e}"

        if current_state == NavState.MENU_PRINCIPAL:
            # Tenta clicar no link de lançamento/diário
            candidates = [
                "a[href*='diario']", "a[href*='lancamento']", "a[href*='notas']",
                "a[href*='frequencia']", "a[href*='diary']",
            ]
            if turma:
                # Também tenta clicar diretamente na turma pelo nome
                candidates.insert(0, f"a:has-text('{turma}')")
                candidates.insert(0, f"td:has-text('{turma}')")

            for sel in candidates:
                try:
                    elem = page.locator(sel).first
                    if await elem.count() > 0 and await elem.is_visible():
                        await elem.click()
                        return True, f"Clicado em '{sel}'"
                except Exception:
                    continue

            # Fallback: procura link com texto de lançamento
            keywords = ["diário", "diario", "notas", "lançamento", "lancamento", "frequência"]
            for kw in keywords:
                try:
                    elem = page.get_by_text(kw, exact=False).first
                    if await elem.count() > 0 and await elem.is_visible():
                        await elem.click()
                        return True, f"Clicado em texto '{kw}'"
                except Exception:
                    continue

            return False, "Nenhum link de navegação encontrado no menu principal"

        if current_state == NavState.TURMA_SELECIONADA:
            # Seleciona a disciplina
            if discip:
                try:
                    elem = page.get_by_text(discip, exact=False).first
                    if await elem.count() > 0 and await elem.is_visible():
                        await elem.click()
                        return True, f"Selecionada disciplina '{discip}'"
                except Exception:
                    pass
            return False, f"Disciplina '{discip}' não encontrada na página"

        if current_state == NavState.DISCIPLINA_SELECIONADA:
            # Seleciona a etapa/bimestre
            if etapa:
                try:
                    elem = page.get_by_text(etapa, exact=False).first
                    if await elem.count() > 0 and await elem.is_visible():
                        await elem.click()
                        return True, f"Selecionada etapa '{etapa}'"
                except Exception:
                    pass
            return False, f"Etapa '{etapa}' não encontrada na página"

        if current_state == NavState.ETAPA_SELECIONADA:
            # Aguarda a tabela carregar (pode ser renderização assíncrona)
            await asyncio.sleep(2.0)
            return True, "Aguardou carregamento assíncrono da tabela"

        return False, f"Sem transição definida para estado {current_state}"

    # ─── Helpers ─────────────────────────────────────────────────────────────

    def _make_login_result(self, trace: List[str], t0: float) -> NavResult:
        """Retorna o NavResult padrão para estado LOGIN_PENDING."""
        return NavResult(
            state=NavState.LOGIN_PENDING,
            requires_human=True,
            human_message=(
                "Professora, o portal está pedindo login. "
                "Por favor, faça login com seu CPF e senha na janela do navegador "
                "e me avise quando estiver na página inicial da escola."
            ),
            trace=trace,
            elapsed_ms=(time.monotonic() - t0) * 1000,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Camada A — Modelo de Navegação Hierárquica e Decomposição em Nós
# ─────────────────────────────────────────────────────────────────────────────

class NavNodeType(str, Enum):
    NIVEL_1 = "nivel_1"       # Abas e seções principais (Recados, Diário, Início, Frequência, etc.)
    SUB_NIVEL = "sub_nivel"   # Sub-abas e sub-seções internas (Recados recebidos, Avaliações, etc.)
    ITEM_LISTA = "item_lista" # Itens individuais, cards de aluno, linhas ou mensagens (Alice Almeida, etc.)


@dataclass
class HierarchicalNavNode:
    """Nó da hierarquia de navegação de um portal escolar."""
    node_id: str
    label: str
    node_type: NavNodeType
    synonyms: List[str] = field(default_factory=list)
    parent_id: Optional[str] = None
    selector: Optional[str] = None
    heuristic: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def matches(self, text: str) -> bool:
        """Verifica se um texto coincide com o rótulo ou algum sinônimo do nó."""
        def norm(s: str) -> str:
            clean = re.sub(r"[\s_]+", " ", (s or "").lower().strip())
            return re.sub(r"[àáâãä]", "a", re.sub(r"[éêë]", "e", re.sub(r"[íï]", "i", re.sub(r"[óôõö]", "o", re.sub(r"[úü]", "u", re.sub(r"[ç]", "c", clean))))))

        target = norm(text)
        candidates = [norm(self.label)] + [norm(s) for s in self.synonyms]
        return any(c == target or (len(c) >= 3 and (c in target or target in c)) for c in candidates)


class HierarchicalNavigationModel:
    """
    Catálogo estruturado e grafo de nós hierárquicos de navegação.
    Suporta busca por rótulo, rastreamento de nós ativos e decomposição de comandos.
    """
    def __init__(self, portal_id: str = "generic"):
        self.portal_id = portal_id
        self.nodes: Dict[str, HierarchicalNavNode] = {}
        self.active_path: List[str] = []
        self._load_default_catalog()

    def add_node(self, node: HierarchicalNavNode) -> None:
        self.nodes[node.node_id] = node

    def get_node(self, node_id: str) -> Optional[HierarchicalNavNode]:
        return self.nodes.get(node_id)

    def find_node_by_label(self, label: str, parent_id: Optional[str] = None) -> Optional[HierarchicalNavNode]:
        for n in self.nodes.values():
            if parent_id and n.parent_id != parent_id:
                continue
            if n.matches(label):
                return n
        return None

    def _load_default_catalog(self) -> None:
        # Nós de nível 1 padrão
        self.add_node(HierarchicalNavNode("inicio", "Início", NavNodeType.NIVEL_1, synonyms=["home", "dashboard", "principal"]))
        self.add_node(HierarchicalNavNode("diario", "Diário de Classe", NavNodeType.NIVEL_1, synonyms=["diário", "diario", "classe"]))
        self.add_node(HierarchicalNavNode("frequencia", "Frequência", NavNodeType.NIVEL_1, synonyms=["chamada", "presença", "presenca", "faltas"]))
        self.add_node(HierarchicalNavNode("notas", "Notas", NavNodeType.NIVEL_1, synonyms=["lançamento de notas", "boletim"]))
        self.add_node(HierarchicalNavNode("recados", "Recados", NavNodeType.NIVEL_1, synonyms=["mural de recados", "mensagens", "comunicações"]))
        self.add_node(HierarchicalNavNode("meus_alunos", "Meus Alunos", NavNodeType.NIVEL_1, synonyms=["alunos", "turmas", "cadastro de alunos", "estudantes"]))
        self.add_node(HierarchicalNavNode("arquivos", "Arquivos", NavNodeType.NIVEL_1, synonyms=["documentos", "materiais", "anexos"]))
        self.add_node(HierarchicalNavNode("horarios", "Horários", NavNodeType.NIVEL_1, synonyms=["grade horária", "aulas"]))

        # Sub-níveis de Recados
        self.add_node(HierarchicalNavNode("recados_recebidos", "Recados recebidos", NavNodeType.SUB_NIVEL, parent_id="recados", synonyms=["recebidos", "caixa de entrada", "mensagens recebidas"]))
        self.add_node(HierarchicalNavNode("recados_enviados", "Recados enviados", NavNodeType.SUB_NIVEL, parent_id="recados", synonyms=["enviados", "mensagens enviadas"]))
        self.add_node(HierarchicalNavNode("novo_recado", "Novo recado", NavNodeType.SUB_NIVEL, parent_id="recados", synonyms=["escrever recado", "enviar recado"]))

        # Sub-níveis de Notas / Diário
        self.add_node(HierarchicalNavNode("avaliacoes", "Avaliações", NavNodeType.SUB_NIVEL, parent_id="notas", synonyms=["provas", "trabalhos"]))
        self.add_node(HierarchicalNavNode("medias", "Médias", NavNodeType.SUB_NIVEL, parent_id="notas", synonyms=["médias finais", "fechamento"]))
        self.add_node(HierarchicalNavNode("diario_avaliacoes", "Avaliações", NavNodeType.SUB_NIVEL, parent_id="diario", synonyms=["provas", "trabalhos"]))
        self.add_node(HierarchicalNavNode("diario_medias", "Médias", NavNodeType.SUB_NIVEL, parent_id="diario", synonyms=["médias finais", "fechamento"]))
        self.add_node(HierarchicalNavNode("aulas", "Aulas e Frequência", NavNodeType.SUB_NIVEL, parent_id="diario", synonyms=["aulas", "frequência", "frequencia"]))
        self.add_node(HierarchicalNavNode("faltas", "Faltas", NavNodeType.SUB_NIVEL, parent_id="frequencia", synonyms=["registro de faltas", "ausências", "ausencias"]))
        self.add_node(HierarchicalNavNode("justificativas", "Justificativas", NavNodeType.SUB_NIVEL, parent_id="frequencia", synonyms=["justificativa", "atestados", "atestado"]))
        self.add_node(HierarchicalNavNode("historico", "Histórico", NavNodeType.SUB_NIVEL, parent_id="meus_alunos", synonyms=["histórico escolar", "ficha histórica", "historico escolar"]))
        self.add_node(HierarchicalNavNode("turmas", "Turmas", NavNodeType.SUB_NIVEL, parent_id="meus_alunos", synonyms=["classes", "minhas turmas"]))
        self.add_node(HierarchicalNavNode("configuracoes", "Configurações", NavNodeType.NIVEL_1, synonyms=["configuracao", "configurações do portal", "ajustes", "perfil"]))


class DecomposedSequence(list):
    """
    Subclasse de list para armazenar sequências ordenadas de nós de navegação hierárquica
    com metadados de integridade e detecção de truncamento linguístico.
    Garante 100% de retrocompatibilidade com código existente que espera list[HierarchicalNavNode].
    """
    def __init__(
        self,
        nodes: Optional[Iterable[HierarchicalNavNode]] = None,
        is_possibly_truncated: bool = False,
        unparsed_remainder: Optional[str] = None,
        indicators_found: Optional[List[str]] = None,
        understood_nodes: Optional[List[str]] = None,
        message_to_teacher: Optional[str] = None,
    ):
        super().__init__(nodes or [])
        self.is_possibly_truncated = is_possibly_truncated
        self.unparsed_remainder = unparsed_remainder
        self.indicators_found = indicators_found or []
        self.understood_nodes = understood_nodes or [n.label for n in self]
        self.message_to_teacher = message_to_teacher


# =============================================================================
# Marcadores e Verbos para Detecção de Truncamento Linguístico (Rede de Segurança)
# =============================================================================

# NOTA DE MANUTENÇÃO DE ENGENHARIA:
# A lista COURTESY_AND_DISCOURSE_MODIFIERS é uma LISTA VIVA, NÃO EXAUSTIVA.
# Deve ser revisada e expandida periodicamente conforme novos comandos reais de professoras
# revelarem gírias regionais e variações coloquiais (ex: "manda ver", "dá uma checada").
# Eventos de truncamento emitem telemetria estruturada '[TELEMETRY_TRUNCATION_TRIGGERED]'
# para alimentar ativamente a expansão desta lista sem necessidade de adivinhação.

STRICT_ACTION_VERBS = [
    "abra", "abrir", "abre", "acesse", "acessa", "acessar",
    "vá para", "va para", "vai para", "ir para", "navegue ate", "navegue até",
    "navega até", "navega ate", "clique em", "clica em", "clicar em",
    "selecione", "selecionar", "seleciona", "lance", "lancar", "lançar",
    "marque", "marcar", "marca", "cadastre", "cadastrar", "ache", "achar",
    "procure", "procurar"
]

COURTESY_AND_DISCOURSE_MODIFIERS = [
    "veja como ele está indo", "veja como ela está indo",
    "veja como ele esta indo", "veja como ela esta indo",
    "me mostrar rapidinho", "me mostra rapidinho", "mostrar rapidinho",
    "olhe se tem falta demais", "veja se tem falta demais", "olhe se tem faltas",
    "se tem falta demais", "se tem faltas", "tem falta demais", "tem faltas",
    "para eu ver", "pra eu ver", "para eu dar uma olhada", "pra eu dar uma olhada",
    "dar uma olhada na turma", "dar uma olhada", "dar uma checada", "dar uma olhadinha",
    "desse uma olhada na turma", "desse uma olhada", "der uma olhada na turma", "der uma olhada",
    "conferisse as mensagens de hoje", "conferir as mensagens de hoje",
    "conferir as mensagens", "conferisse as mensagens",
    "para eu conferir as mensagens de hoje", "pra eu conferir as mensagens de hoje",
    "se o documento subiu", "só pra ver se o documento subiu", "so pra ver se o documento subiu",
    "dá uma checada", "da uma checada",
    "por favor", "pfv", "por gentileza", "por favorzinho",
    "vou querer que você", "vou querer que voce", "vou querer que",
    "gostaria que você", "gostaria que voce", "gostaria que",
    "pode abrir", "pode acessar", "pode", "dá pra", "da pra",
    "preciso que você", "preciso que voce", "preciso que",
    "com calma", "bem rápido", "bem rapido", "rapidinho", "só pra ver", "so pra ver",
    "tá certo", "ta certo", "se o cadastro do carlos tá certo", "se o cadastro do carlos ta certo"
]

_COMMON_NON_TARGET_WORDS = {
    "aula", "classe", "turma", "turmas", "escola", "prova", "provas", "teste", "testes",
    "materia", "matéria", "exercicio", "exercício", "exercicios", "exercícios", "casa",
    "reuniao", "reunião", "recuperacao", "recuperação", "relatorio", "relatório", "relatorios",
    "arquivos", "configuracoes", "configurações", "redacao", "redação", "duvida", "dúvida",
    "conteudo", "conteúdo", "chamada", "diario", "diário", "presenca", "presença", "falta",
    "faltas", "nota", "notas", "boletim", "boletins", "quadro", "horario", "horário", "grade",
    "hoje", "ontem", "amanha", "amanhã", "tarde", "manha", "manhã", "noite", "geral", "tudo",
    "todos", "todas", "grupo", "alunos", "alunas", "estudantes", "livro", "caderno", "atividade",
    "atividades", "seção", "secao", "aba", "portal", "sistema", "dele", "dela", "deles", "delas",
    "meu", "minha", "seus", "suas", "ele", "ela", "eles", "elas", "você", "voce", "favor"
}


def _finalize_decomposed_sequence(
    command: str,
    nodes: List[HierarchicalNavNode],
    model: HierarchicalNavigationModel
) -> DecomposedSequence:
    if not command or not isinstance(command, str) or not nodes:
        return DecomposedSequence(nodes)

    clean = command.strip()
    clean_no_greet = re.sub(
        r"^(?:ol[áa]|oi|ei|rafinha|por\s+favor|pfv|ajuda|ajude|\s+)+[,:]?\s*",
        "",
        clean,
        flags=re.IGNORECASE
    ).strip()
    lower_cmd = clean_no_greet.lower()

    # 1. Sanitiza expressões de cortesia e observação passiva (lista viva)
    sanitized = lower_cmd
    for modifier in COURTESY_AND_DISCOURSE_MODIFIERS:
        sanitized = re.sub(rf"\b{re.escape(modifier)}\b", " ", sanitized, flags=re.IGNORECASE)

    # 2. Divide em orações por conectores de sequência
    clause_regex = r",|\b(?:e\s+depois|em\s+seguida|e\s+em\s+seguida|e\s+ent[ãa]o|e\s+v[áa]\s+at[ée]|e)\b"
    raw_clauses = re.split(clause_regex, sanitized)

    # 3. Analisa cláusulas que contêm intenção de ação estrita ou alvos substantivos
    action_clauses: List[str] = []
    catalog_labels = set()
    for n in model.nodes.values():
        catalog_labels.add(n.label.lower())
        for syn in n.synonyms:
            catalog_labels.add(syn.lower())

    for cl in raw_clauses:
        cl_clean = cl.strip()
        cl_words = re.findall(r"\b[a-zA-ZÀ-ÿ0-9_-]+\b", cl_clean)
        if not cl_words:
            continue

        has_strict_verb = any(v in cl_clean for v in STRICT_ACTION_VERBS)
        has_catalog_target = any(lbl in cl_clean for lbl in catalog_labels)
        has_structural_target = any(
            re.search(rf"\b{term}\b", cl_clean)
            for term in [
                "aba", "seção", "secao", "menu", "guia", "tela", "ficha", "perfil",
                "dados", "cadastro", "diário", "diario", "notas", "faltas",
                "frequencia", "frequência", "recados", "aluno", "alunos", "turma",
                "histórico", "historico", "justificativa", "justificativas", "atestado"
            ]
        )
        has_entity = any(len(w) >= 3 and w not in _COMMON_NON_TARGET_WORDS and w not in STRICT_ACTION_VERBS for w in cl_words)

        if has_strict_verb or has_catalog_target or has_structural_target or has_entity:
            action_clauses.append(cl_clean)

    step_count = len(action_clauses)
    is_truncated = False
    indicators = []
    unparsed_remainder = None
    msg = None

    if step_count > len(nodes):
        is_truncated = True
        indicators = action_clauses[len(nodes):]
        unparsed_remainder = ", ".join(indicators)
        last_understood = nodes[-1].label if nodes else "o início"
        msg = (
            f"Entendi até '{last_understood}', mas seu comando parece ter mais passos "
            f"que não consegui identificar com certeza. Pode dividir em comandos mais simples "
            f"ou confirmar o que falta? ✨"
        )

        # TELEMETRIA ESTRUTURADA DE TRUNCAMENTO (sem PII de aluno)
        sanitized_telemetry = re.sub(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", "[ENTIDADE]", command)
        try:
            print(f"[TELEMETRY_TRUNCATION_TRIGGERED] Comando sanitizado: '{sanitized_telemetry}' | Nós compreendidos: {[n.label for n in nodes]} | Indicadores: {indicators}")
        except Exception:
            pass

    return DecomposedSequence(
        nodes=nodes,
        is_possibly_truncated=is_truncated,
        unparsed_remainder=unparsed_remainder,
        indicators_found=indicators,
        understood_nodes=[n.label for n in nodes],
        message_to_teacher=msg
    )


def decompose_hierarchical_command(
    command: str,
    model: Optional[HierarchicalNavigationModel] = None
) -> DecomposedSequence:
    """
    Decompõe um comando de linguagem natural em uma sequência ordenada de nós-alvo hierárquicos.
    Gera:
      - 2 nós para sub-navegação: ["Recados" (nivel_1), "Recados recebidos" (sub_nivel)]
      - 2 nós para perfil/item:   ["Meus Alunos" (nivel_1), "Alice Almeida" (item_lista)]
      - 1 nó para nível único:     ["Início" (nivel_1)] ou ["Notas" (nivel_1)]
      - Nós dinâmicos para padrões arbitrários inéditos (ex: "em notas veja avaliações").
    Retorna DecomposedSequence (subclasse de list) com salvaguarda permanente is_possibly_truncated.
    """
    if not command or not isinstance(command, str):
        return DecomposedSequence([])

    if model is None:
        model = HierarchicalNavigationModel()

    clean = command.strip()
    clean_no_greet = re.sub(
        r"^(?:ol[áa]|oi|ei|rafinha|por\s+favor|pfv|ajuda|ajude|gostaria\s+que\s+voc[êe]\s+(?:acessasse|abrisse|fosse|entrasse)?|gostaria\s+que\s+voc[êe]|preciso\s+que\s+voc[êe]|vou\s+querer\s+que\s+voc[êe]|pode\s+abrir|pode\s+acessar|pode|poderia|\s+)+[,:]?\s*",
        "",
        clean,
        flags=re.IGNORECASE
    ).strip()

    # ── Padrão 1: "acesse o perfil de <aluno> em <secao>" ou "ver perfil de <aluno> em <secao>"
    m_profile_sec = re.search(
        r"^(?:acesse|acessa|acessar|abra|abre|abrir|ver|veja|olhe|olhar|mostrar|mostre)?\s*(?:o|a)?\s*(?:perfil|dados|detalhes|ficha|cadastro|historico)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+?)\s+(?:em|no|na|nos|nas)\s+([a-zA-ZÀ-ÿ0-9_\s-]+)$",
        clean_no_greet,
        flags=re.IGNORECASE
    )
    if m_profile_sec:
        aluno_raw = m_profile_sec.group(1).strip()
        secao_raw = m_profile_sec.group(2).strip()
        secao_clean = re.sub(r"^(?:a|o|os|as)?\s*(?:aba|menu|seção|secao|guia|tela)\s+", "", secao_raw, flags=re.IGNORECASE).strip()

        parent_node = model.find_node_by_label(secao_clean)
        if not parent_node:
            p_id = re.sub(r"\W+", "_", secao_clean.lower()).strip("_")
            parent_node = HierarchicalNavNode(node_id=p_id, label=secao_clean.title(), node_type=NavNodeType.NIVEL_1)

        item_id = re.sub(r"\W+", "_", aluno_raw.lower()).strip("_")
        child_node = HierarchicalNavNode(
            node_id=item_id,
            label=aluno_raw.title(),
            node_type=NavNodeType.ITEM_LISTA,
            parent_id=parent_node.node_id,
            metadata={"action": "abrir_perfil", "aluno": aluno_raw.title()}
        )
        return _finalize_decomposed_sequence(command, [parent_node, child_node], model)

    # ── Padrão 1B: "acesse/abra a ficha/perfil de <aluno>" (sem especificação de seção)
    m_profile_direct = re.search(
        r"^(?:acesse|acessa|acessar|abra|abre|abrir|ver|veja|olhe|olhar|mostrar|mostre)?\s*(?:o|a)?\s*(?:perfil|dados|detalhes|ficha|cadastro|historico)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+(?:e\s+.*|por\s+favor.*|\?.*))?$",
        clean_no_greet,
        flags=re.IGNORECASE
    )
    if m_profile_direct and not any(w in clean_no_greet.lower() for w in ["turma", "escola", "professor", "professora"]):
        aluno_raw = m_profile_direct.group(1).strip()
        parent_node = model.find_node_by_label("meus alunos")
        if not parent_node:
            parent_node = HierarchicalNavNode(node_id="meus_alunos", label="Meus Alunos", node_type=NavNodeType.NIVEL_1)

        item_id = re.sub(r"\W+", "_", aluno_raw.lower()).strip("_")
        child_node = HierarchicalNavNode(
            node_id=item_id,
            label=aluno_raw.title(),
            node_type=NavNodeType.ITEM_LISTA,
            parent_id=parent_node.node_id,
            metadata={"action": "abrir_perfil", "aluno": aluno_raw.title()}
        )
        return _finalize_decomposed_sequence(command, [parent_node, child_node], model)

    # ── Padrão 2: "abra <aba> e abra <sub-aba>" / "vá para <aba> e acesse <sub-aba>" / "abra <aba> e <sub-aba>"
    verb_regex = r"(?:abra|abrir|abre|acesse|acessa|acessar|acessasse|va\s+para|vá\s+para|ir\s+para|v[áa]\s+at[ée]|navegue\s+ate|navegar\s+até|clique\s+em|clicar\s+em|ver|veja|olhar|olhe|dar\s+uma\s+olhada|d[áa]\s+uma\s+olhada|selecione|selecionar|me\s+mostrar|me\s+mostra|mostrar|mostre|entre\s+em|entrar\s+em|entre)"
    m_compound = re.search(
        rf"^(?:{verb_regex}\s+)?(?:\b(?:a|o|os|as|aba|seção|secao|guia)\b\s+)?([a-zA-ZÀ-ÿ0-9_\s-]+?)\s+(?:e\s+depois|em\s+seguida|e\s+em\s+seguida|e\s+ent[ãa]o|e)\s+(?:{verb_regex}\s+)?(?:\b(?:a|o|os|as|sub-?aba|aba|guia|seção|secao)\b\s+)?([a-zA-ZÀ-ÿ0-9_\s-]+)$",
        clean_no_greet,
        flags=re.IGNORECASE
    )
    if m_compound:
        target1_raw = m_compound.group(1).strip()
        target2_raw = m_compound.group(2).strip()

        node1 = model.find_node_by_label(target1_raw)
        if not node1:
            n1_id = re.sub(r"\W+", "_", target1_raw.lower()).strip("_")
            node1 = HierarchicalNavNode(node_id=n1_id, label=target1_raw.title(), node_type=NavNodeType.NIVEL_1)

        # Se target2 referenciar o perfil/cadastro de um aluno
        m_aluno_sub = re.search(r"(?:d[áa]\s+uma\s+checada\s+se\s+o\s+|dar\s+uma\s+checada\s+se\s+o\s+|verificar\s+se\s+o\s+)?(?:cadastro|perfil|ficha|dados)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)", target2_raw, flags=re.IGNORECASE)
        if m_aluno_sub:
            aluno_nm = re.sub(r"\s+t[áa]\s+certo.*", "", m_aluno_sub.group(1), flags=re.IGNORECASE).strip().title()
            n2_id = re.sub(r"\W+", "_", aluno_nm.lower()).strip("_")
            node2 = HierarchicalNavNode(
                node_id=n2_id,
                label=aluno_nm,
                node_type=NavNodeType.ITEM_LISTA,
                parent_id=node1.node_id,
                metadata={"action": "abrir_perfil", "aluno": aluno_nm}
            )
            return _finalize_decomposed_sequence(command, [node1, node2], model)

        # Higieniza termos secundários de exibição antes da busca no catálogo
        target2_clean = re.sub(
            r"^(?:me\s+mostrar|me\s+mostra|mostrar|mostre|olhar|olhe|ver|veja|dar\s+uma\s+olhada|d[áa]\s+uma\s+olhada)?\s*(?:rapidinho|com\s+calma)?\s*(?:\b(?:as|os|a|o)\b)?\s*",
            "",
            target2_raw,
            flags=re.IGNORECASE
        ).strip()
        target2_clean = re.sub(r"\s+(?:com\s+calma|rapidinho|por\s+favor|pfv)$", "", target2_clean, flags=re.IGNORECASE).strip()

        # Se target2 for apenas um modificador de cortesia ou observação passiva
        t2_stripped = target2_raw.lower()
        for m in COURTESY_AND_DISCOURSE_MODIFIERS:
            t2_stripped = t2_stripped.replace(m.lower(), " ")
        t2_words = [w for w in re.findall(r"\b[a-zA-ZÀ-ÿ0-9_-]+\b", t2_stripped) if w not in _COMMON_NON_TARGET_WORDS]
        if not t2_words or not target2_clean:
            return _finalize_decomposed_sequence(command, [node1], model)

        node2 = model.find_node_by_label(target2_clean, parent_id=node1.node_id)
        if not node2:
            node2 = model.find_node_by_label(target2_clean)
        if not node2:
            n2_id = re.sub(r"\W+", "_", target2_clean.lower()).strip("_")
            node2 = HierarchicalNavNode(
                node_id=n2_id,
                label=target2_clean.title(),
                node_type=NavNodeType.SUB_NIVEL,
                parent_id=node1.node_id
            )
        else:
            if not node2.parent_id:
                node2.parent_id = node1.node_id

        return _finalize_decomposed_sequence(command, [node1, node2], model)

    # ── Padrão 3: "em <aba> abra/veja <sub-aba>"
    m_in_sec = re.search(
        rf"^(?:em|no|na|nos|nas)\s+([a-zA-ZÀ-ÿ0-9_\s-]+?)\s+(?:{verb_regex}\s+)?(?:a|o|os|as|sub-?aba|aba|guia|seção|secao)?\s*([a-zA-ZÀ-ÿ0-9_\s-]+)$",
        clean_no_greet,
        flags=re.IGNORECASE
    )
    if m_in_sec:
        target1_raw = m_in_sec.group(1).strip()
        target2_raw = m_in_sec.group(2).strip()

        node1 = model.find_node_by_label(target1_raw)
        if not node1:
            n1_id = re.sub(r"\W+", "_", target1_raw.lower()).strip("_")
            node1 = HierarchicalNavNode(node_id=n1_id, label=target1_raw.title(), node_type=NavNodeType.NIVEL_1)

        node2 = model.find_node_by_label(target2_raw, parent_id=node1.node_id)
        if not node2:
            n2_id = re.sub(r"\W+", "_", target2_raw.lower()).strip("_")
            node2 = HierarchicalNavNode(
                node_id=n2_id,
                label=target2_raw.title(),
                node_type=NavNodeType.SUB_NIVEL,
                parent_id=node1.node_id
            )

        return _finalize_decomposed_sequence(command, [node1, node2], model)

    # ── Padrão 4: Navegação simples de nível único (1 passo)
    single_clean = re.sub(
        rf"^(?:{verb_regex}\s+)?(?:a\s+|o\s+|as\s+|os\s+|aba\s+|seção\s+|secao\s+|guia\s+|tela\s+)?",
        "",
        clean_no_greet,
        flags=re.IGNORECASE
    ).strip()
    single_clean = re.sub(r"^(?:de|do|da)\s+", "", single_clean, flags=re.IGNORECASE).strip()

    single_node = model.find_node_by_label(single_clean)
    if not single_node and single_clean:
        s_id = re.sub(r"\W+", "_", single_clean.lower()).strip("_")
        single_node = HierarchicalNavNode(node_id=s_id, label=single_clean.title(), node_type=NavNodeType.NIVEL_1)

    if single_node:
        return _finalize_decomposed_sequence(command, [single_node], model)

    return DecomposedSequence([])

