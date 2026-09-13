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
from typing import Any, Dict, List, Optional, Tuple


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
