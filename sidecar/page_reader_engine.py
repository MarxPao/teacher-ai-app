"""
page_reader_engine.py — Engine Generalista de Leitura de Página (SeeAct / WebChallenger)

Tres pilares:
1. PageMem: DOM estruturado deterministicamente via JS (sem LLM).
2. Set-of-Mark: overlay de divs numerados injetados via page.evaluate() ANTES
   do screenshot — sincronia com a renderização real, sem dependência de Pillow
   pós-processamento.
3. SeeAct: Percepção (LLM cita seção por número) separada de Ancoragem
   (código traduz número → seletor CSS real, zero invenção de seletor).

Honestidade sobre limites: falha explicitamente, nunca inventa dados.
Compatibilidade: Groq Llama (text-only) → fallback PageMem-only sem screenshot.
"""

import asyncio
import base64
import datetime
import json
import random
import re
import sys
import time
import urllib.error
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Tipos de dados
# ---------------------------------------------------------------------------

@dataclass
class PageSection:
    section_id: int
    css_selector: str
    tag_path: str
    semantic_role: str
    text_summary: str
    element_count: int
    has_table: bool
    has_list: bool
    has_form: bool
    row_count: int
    bounding_box: Optional[Dict]
    mark_number: Optional[int] = None
    has_cards: bool = False


@dataclass
class PageMemory:
    url: str
    title: str
    sections: List[PageSection]
    total_sections: int
    built_at: float

    def to_summary_text(self, max_sections: int = 20) -> str:
        lines = [f"URL: {self.url}", f"Titulo: {self.title}",
                 f"Secoes detectadas: {self.total_sections}", "---"]
        for sec in self.sections[:max_sections]:
            mark = f" [Marcacao #{sec.mark_number}]" if sec.mark_number is not None else ""
            rows = f", {sec.row_count} linhas" if sec.row_count > 0 else ""
            lines.append(
                f"[Secao {sec.section_id}]{mark} {sec.semantic_role.upper()}{rows}: "
                f"`{sec.text_summary[:120]}`"
            )
        if self.total_sections > max_sections:
            lines.append(f"... e mais {self.total_sections - max_sections} secoes.")
        return "\n".join(lines)


@dataclass
class ExtractionPlan:
    target_section_id: int
    mark_number: Optional[int]
    reasoning: str
    confidence: str
    fallback_section_ids: List[int]


@dataclass
class AnchoredTarget:
    css_selector: str
    section: PageSection
    extraction_strategy: str


@dataclass
class ExtractedData:
    success: bool
    data: List[Dict[str, Any]]
    raw_text: str
    page_title: str
    page_url: str
    section_used: Optional[str]
    failure_reason: Optional[str]
    pages_read: int = 1
    strategy_used: Optional[str] = None
    layer_used: str = "layer_2_vision"
    structured_log: Optional[List[Dict[str, Any]]] = None


# ---------------------------------------------------------------------------
# Prompts de percepcao (SeeAct — Percepcao separada de Ancoragem)
# ---------------------------------------------------------------------------

PERCEPTION_PROMPT_WITH_VISION = '''Voce e um assistente que identifica onde esta uma informacao em uma pagina web.

OBJETIVO: "{goal}"

MEMORIA DA PAGINA (estrutura DOM detectada automaticamente):
{page_mem_text}

SCREENSHOT: Veja a imagem. Elementos estruturais estao marcados com numeros em caixas verdes
(sobrepostos no DOM antes do screenshot — sincronia perfeita com o layout real).

Responda EXCLUSIVAMENTE em JSON valido (sem texto adicional, sem markdown):
{{
  "target_section_id": <numero inteiro da secao>,
  "mark_number": <numero da marcacao visivel no screenshot, ou null>,
  "reasoning": "<explicacao em 1-2 frases>",
  "confidence": "high" ou "medium" ou "low",
  "fallback_section_ids": [<ids alternativos em ordem de preferencia>]
}}

Se nao encontrar com confianca minima: {{"error": "not_found", "reasoning": "<motivo>"}}
NUNCA invente seletores CSS. Cite apenas o numero da secao/marcacao.'''

PERCEPTION_PROMPT_TEXT_ONLY = '''Voce e um assistente que identifica onde esta uma informacao em uma pagina web.

OBJETIVO: "{goal}"

MEMORIA DA PAGINA (estrutura DOM detectada automaticamente):
{page_mem_text}

Responda EXCLUSIVAMENTE em JSON valido (sem texto adicional, sem markdown):
{{
  "target_section_id": <numero inteiro da secao>,
  "mark_number": null,
  "reasoning": "<explicacao em 1-2 frases>",
  "confidence": "high" ou "medium" ou "low",
  "fallback_section_ids": [<ids alternativos>]
}}

Se nao encontrar: {{"error": "not_found", "reasoning": "<motivo>"}}'''

# ---------------------------------------------------------------------------
# JS para PageMem — deterministico, sem LLM
# ---------------------------------------------------------------------------

PAGE_MEM_JS = r"""
() => {
  const SELECTORS = [
    'table', 'tbody', 'ul', 'ol', 'form', '[role="grid"]', '[role="table"]',
    '[role="list"]', 'main', 'article', 'section', 'aside', 'nav', 'header',
    '.tabela-alunos', '.roster', '.student-list', '.aluno-item',
    '[data-aluno-id]', '[data-student-id]', 'div.card',
    '.card-grid', '.cards-container', '.grid-alunos', '.alunos-container',
    '[class*="aluno"]', '[class*="student"]', '[class*="card"]'
  ];
  const seen = new Set();
  const sections = [];
  let id = 1;

  function bbox(el) {
    try {
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y),
              width: Math.round(r.width), height: Math.round(r.height)};
    } catch(e) { return null; }
  }

  function getPath(el) {
    const p = []; let c = el, d = 0;
    while (c && c !== document.body && d < 5) {
      let s = c.tagName.toLowerCase();
      if (c.id) s += '#' + c.id;
      else if (c.className && typeof c.className === 'string') {
        const cls = c.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) s += '.' + cls;
      }
      p.unshift(s); c = c.parentElement; d++;
    }
    return p.join(' > ');
  }

  function buildSel(el) {
    if (el.id) return '#' + el.id;
    const tag = el.tagName.toLowerCase();
    const par = el.parentElement;
    if (par) {
      const sibs = Array.from(par.children).filter(x => x.tagName === el.tagName);
      const idx = sibs.indexOf(el) + 1;
      return sibs.length === 1 ? getPath(el)
        : getPath(par) + ' > ' + tag + ':nth-of-type(' + idx + ')';
    }
    return tag;
  }

  function isCardGrid(el) {
    const t = el.tagName.toLowerCase();
    if (t === 'table' || t === 'tbody' || t === 'script' || t === 'style') return false;
    const children = Array.from(el.children).filter(c => {
      const tag = c.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'link', 'svg'].includes(tag)) return false;
      const b = bbox(c);
      return b && b.width >= 40 && b.height >= 30;
    });
    if (children.length < 2) return false;
    const cardLike = children.filter(c => {
      const cls = (typeof c.className === 'string' ? c.className.toLowerCase() : '');
      const hasHeading = !!c.querySelector('h1,h2,h3,h4,h5,h6,strong,b,[class*="nome" i],[class*="name" i]');
      const hasImg = !!c.querySelector('img,svg,[style*="background-image"],[class*="avatar" i],[class*="foto" i]');
      const hasCardClass = cls.includes('card') || cls.includes('aluno') || cls.includes('student') || cls.includes('item') || cls.includes('perfil') || cls.includes('profile') || cls.includes('col');
      const text = (c.innerText || c.textContent || '').trim();
      return (hasCardClass || hasHeading || hasImg) && text.length >= 3 && text.length <= 600;
    });
    return cardLike.length >= 2 && (cardLike.length / children.length >= 0.4);
  }

  function role(el) {
    const t = el.tagName.toLowerCase();
    if (t === 'table' || t === 'tbody') return 'table';
    if (isCardGrid(el)) return 'card_grid';
    if (t === 'ul' || t === 'ol') return 'list';
    if (t === 'form' || t === 'fieldset') return 'form';
    if (t === 'nav') return 'nav';
    if (t === 'header') return 'header';
    if (t === 'main' || t === 'article') return 'main';
    if (el.querySelector('table')) return 'table';
    if (el.querySelector('ul,ol')) return 'list';
    if (el.querySelector('form,input,select')) return 'form';
    return 'card';
  }

  for (const sel of SELECTORS) {
    let elems;
    try { elems = Array.from(document.querySelectorAll(sel)); } catch(e) { continue; }
    for (const el of elems) {
      if (seen.has(el)) continue;
      const b = bbox(el);
      if (!b || b.width < 50 || b.height < 20) continue;
      // Evita aninhamento excessivo (exceto tabelas e card_grids)
      let nested = false;
      for (const s of sections) {
        const ex = document.querySelector(s.css_selector);
        if (ex && ex.contains(el) && ex !== el && el.tagName.toLowerCase() !== 'table' && s.semantic_role !== 'card_grid') {
          nested = true; break;
        }
      }
      if (nested) continue;
      seen.add(el);
      const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      if (!text || text.length < 3) continue;
      const r = role(el);
      const isGrid = r === 'card_grid';
      const cardChildren = isGrid ? Array.from(el.children).filter(c => {
        const cb = bbox(c);
        return cb && cb.width >= 40 && cb.height >= 30;
      }) : [];
      const rowCount = isGrid ? cardChildren.length : el.querySelectorAll('tr,li,[role=row]').length;

      sections.push({
        section_id: id++, css_selector: buildSel(el), tag_path: getPath(el),
        semantic_role: r, text_summary: text.slice(0, 200),
        element_count: el.children.length,
        has_table: !!el.querySelector('table'),
        has_list: !!el.querySelector('ul,ol'),
        has_form: !!el.querySelector('form,input,select'),
        has_cards: isGrid || !!el.querySelector('.card, [class*="card"], [class*="aluno"]'),
        row_count: rowCount,
        bounding_box: b
      });
      if (sections.length >= 40) break;
    }
    if (sections.length >= 40) break;
  }
  return {url: window.location.href, title: document.title, sections,
          built_at: Date.now() / 1000};
}
"""

# ---------------------------------------------------------------------------
# JS para Set-of-Mark — DOM overlay injetado ANTES do screenshot
# ---------------------------------------------------------------------------

SET_OF_MARKS_INJECT_JS = r"""
(sections) => {
  // Remove overlays anteriores
  document.querySelectorAll('[data-som-overlay]').forEach(e => e.remove());

  const injected = [];
  sections.forEach((sec, idx) => {
    const el = document.querySelector(sec.css_selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 10) return;

    const mark = idx + 1;

    // Div flutuante posicionada sobre o elemento
    const div = document.createElement('div');
    div.setAttribute('data-som-overlay', mark);
    div.style.cssText = [
      'position: fixed',
      'z-index: 2147483647',
      'pointer-events: none',
      'box-sizing: border-box',
      'border: 2px solid #22c55e',
      `left: ${Math.max(0, r.left)}px`,
      `top: ${Math.max(0, r.top)}px`,
      `width: ${Math.min(r.width, window.innerWidth - r.left)}px`,
      `height: ${Math.min(r.height, window.innerHeight - r.top)}px`
    ].join(';');

    // Badge com o numero
    const badge = document.createElement('span');
    badge.textContent = String(mark);
    badge.style.cssText = [
      'position: absolute',
      'top: -1px',
      'left: -1px',
      'background: #22c55e',
      'color: white',
      'font-size: 11px',
      'font-weight: bold',
      'font-family: monospace',
      'padding: 1px 4px',
      'line-height: 16px',
      'border-radius: 0 0 3px 0',
      'min-width: 18px',
      'text-align: center'
    ].join(';');

    div.appendChild(badge);
    document.body.appendChild(div);
    injected.push({mark, css_selector: sec.css_selector});
  });
  return injected;
}
"""

SET_OF_MARKS_REMOVE_JS = r"""
() => {
  document.querySelectorAll('[data-som-overlay]').forEach(e => e.remove());
  return true;
}
"""

# ---------------------------------------------------------------------------
# JS para extracao de dados — deterministico
# ---------------------------------------------------------------------------

EXTRACT_TABLE_JS = r"""
(sel) => {
  const t = document.querySelector(sel);
  if (!t) return {rows: [], error: 'not_found'};
  const allRows = Array.from(t.querySelectorAll('tbody tr, tr'));
  // Detecta header row
  const firstCells = allRows[0] ? Array.from(allRows[0].querySelectorAll('td,th')).map(c=>(c.innerText||'').trim().toLowerCase()) : [];
  const isHeader = firstCells.some(c => ['nome','name','aluno','matric','id','n.','no.','#'].includes(c));
  const dataRows = isHeader && allRows.length > 1 ? allRows.slice(1) : allRows;
  const rows = dataRows
    .map(r => ({
      cells: Array.from(r.querySelectorAll('td,th')).map(c => (c.innerText||'').trim()),
      full_text: (r.innerText||'').trim(),
      portal_native_id: r.getAttribute('data-aluno-id') || r.getAttribute('data-id') || '',
      nee_flag: !!r.querySelector('.tag-inclusao,.badge-nee,[title*=inclus],[title*=NEE]')
    }))
    .filter(r => r.full_text.length >= 2);
  return {rows, error: null, header_detected: isHeader};
}
"""

EXTRACT_LIST_JS = r"""
(sel) => {
  const l = document.querySelector(sel);
  if (!l) return {items: [], error: 'not_found'};
  const items = Array.from(l.querySelectorAll('li,[role=listitem],.aluno-item,[data-aluno-id]'))
    .map(li => ({
      text: (li.innerText||'').trim().replace(/\s+/g, ' '),
      id: li.getAttribute('data-aluno-id') || li.getAttribute('data-id') || ''
    }))
    .filter(i => i.text.length >= 2);
  return {items, error: null};
}
"""

EXTRACT_CARD_GRID_JS = r"""
(sel) => {
  const container = document.querySelector(sel);
  if (!container) return {cards: [], error: 'not_found'};

  function bbox(el) {
    try {
      const r = el.getBoundingClientRect();
      return {width: r.width, height: r.height};
    } catch(e) { return {width: 0, height: 0}; }
  }

  // 1. Encontra os elementos de cartões individuais
  let candidates = Array.from(container.children).filter(c => {
    const tag = c.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'link', 'svg'].includes(tag)) return false;
    const b = bbox(c);
    return b.width >= 40 && b.height >= 30;
  });

  // Se o container tiver um wrapper intermediário (ex: row > cols)
  if (candidates.length === 1 && candidates[0].children.length >= 2) {
    candidates = Array.from(candidates[0].children).filter(c => {
      const b = bbox(c);
      return b.width >= 40 && b.height >= 30;
    });
  }

  // Se o próprio elemento for um card e não tiver filhos como cards
  if (candidates.length === 0) {
    const parent = container.parentElement;
    if (parent && parent.children.length >= 2) {
      candidates = Array.from(parent.children);
    } else {
      candidates = [container];
    }
  }

  const cards = [];
  for (const card of candidates) {
    const fullText = (card.innerText || card.textContent || '').trim().replace(/\s+/g, ' ');
    if (fullText.length < 2) continue;

    // A. Extração do Nome
    let name = '';
    const nameSelectors = [
      '[class*="nome" i]', '[class*="name" i]', '[class*="aluno" i]',
      '[class*="title" i]', '[class*="heading" i]',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b'
    ];
    for (const ns of nameSelectors) {
      const el = card.querySelector(ns);
      if (el) {
        const t = (el.innerText || el.textContent || '').trim();
        const lower = t.toLowerCase();
        if (t.length >= 3 && !['matrícula', 'matricula', 'status', 'situação', 'situacao', 'ativo', 'inativo', 'turma', 'ações', 'perfil'].includes(lower)) {
          name = t;
          break;
        }
      }
    }

    if (!name) {
      const lines = (card.innerText || '').split('\n').map(l => l.trim()).filter(l => l.length >= 3);
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (['matrícula', 'matricula', 'status', 'situação', 'situacao', 'ativo', 'inativo', 'turma', 'detalhes', 'ver perfil'].some(k => lower.startsWith(k))) {
          continue;
        }
        if (/^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(line)) {
          name = line;
          break;
        }
      }
    }

    if (!name) {
      name = fullText.slice(0, 50);
    }

    // B. Matrícula / ID
    let rollNumber = '';
    let nativeId = card.getAttribute('data-aluno-id') || card.getAttribute('data-id') || '';

    const profileLink = card.querySelector('a[href*="aluno"], a[href*="codigo"], a[href*="id"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href') || '';
      const m = href.match(/codigo:([a-zA-Z0-9_\-]+)/i) || href.match(/id[=:\/]([a-zA-Z0-9_\-]+)/i);
      if (m) nativeId = m[1];
    }

    const idEl = card.querySelector('[class*="matricula" i], [class*="codigo" i], [class*="id" i], [data-aluno-id]');
    if (idEl) {
      const t = (idEl.innerText || idEl.textContent || '').trim();
      const m = t.match(/\b\d{2,12}\b/);
      if (m) rollNumber = m[0];
      else rollNumber = t.replace(/^(matr[íi]cula|id|c[óo]d(?:igo)?)[\s:]*/i, '').trim();
    }

    if (!rollNumber) {
      const m = fullText.match(/(?:matr[íi]cula|c[óo]d(?:igo)?|ra|id)[:\s#]*([a-zA-Z0-9\-\.\/]+)/i);
      if (m) rollNumber = m[1];
      else if (nativeId) rollNumber = nativeId;
    }

    // C. Status
    let status = 'active';
    const statusEl = card.querySelector('[class*="status" i], [class*="situacao" i], [class*="badge" i]');
    const statusText = (statusEl ? statusEl.innerText : fullText).toLowerCase();
    if (statusText.includes('inativ') || statusText.includes('trancad') || statusText.includes('cancelad') || statusText.includes('transferid')) {
      status = 'inactive';
    }

    // D. Avatar / Foto
    let avatar = '';
    const imgEl = card.querySelector('img');
    if (imgEl) {
      avatar = imgEl.src || imgEl.getAttribute('src') || '';
    } else {
      const bgEl = card.querySelector('[style*="background-image"]');
      if (bgEl) {
        const bg = bgEl.style.backgroundImage || '';
        const m = bg.match(/url\(['"]?(.*?)['"]?\)/);
        if (m) avatar = m[1];
      }
    }

    // E. NEE
    const neeFlag = !!card.querySelector('.tag-inclusao, .badge-nee, [title*="inclus" i], [title*="NEE" i], [class*="nee" i], [class*="inclus" i]') ||
                    /\b(nee|inclus[ãa]o|pcd|laudo)\b/i.test(fullText);

    cards.push({
      name: name.trim(),
      rollNumber: rollNumber.trim(),
      portal_native_id: nativeId || rollNumber.trim(),
      status,
      avatar,
      nee_flag: neeFlag,
      full_text: fullText
    });
  }

  return {cards, error: null};
}
"""

EXTRACT_TEXT_JS = r"""
(sel) => {
  const e = document.querySelector(sel);
  if (!e) return {text: '', error: 'not_found'};
  return {text: (e.innerText||e.textContent||'').trim().replace(/\s+/g, ' '), error: null};
}
"""

PAGINATION_CONTROL_JS = r"""
(options) => {
  const nextSelector = options.nextSelector || '.pagination .next, a[rel="next"], button.btn-proxima-pagina, a.paginate_button.next, [aria-label="Next"], [aria-label="Próxima"], [aria-label="Proxima"], .proxima-pagina, [data-action="next-page"]';

  function isVisibleAndEnabled(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const visible = (rect.width > 0 || rect.height > 0 || el.offsetWidth > 0 || el.offsetHeight > 0);
      if (!visible) return false;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

      const disabledAttr = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
      const classList = (el.className || '').toLowerCase();
      const hasDisabledClass = classList.includes('disabled') || classList.includes('desabilitado');
      if (disabledAttr || hasDisabledClass) return false;

      const parentLi = el.closest('li');
      if (parentLi && (parentLi.classList.contains('disabled') || parentLi.getAttribute('aria-disabled') === 'true')) {
        return false;
      }

      return true;
    } catch(e) {
      return false;
    }
  }

  let nextBtn = null;

  // 1. Procura por seletores CSS
  try {
    const list = document.querySelectorAll(nextSelector);
    for (const el of list) {
      if (isVisibleAndEnabled(el)) {
        nextBtn = el;
        break;
      }
    }
  } catch(e) {}

  // 2. Fallback heurístico por texto do botão ou link
  if (!nextBtn) {
    const candidates = document.querySelectorAll('button, a, [role="button"], span.page-link');
    for (const el of candidates) {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (['próxima', 'proxima', 'próximo', 'proximo', 'next', 'avançar', 'avancar', '›', '»', '>'].includes(t)) {
        if (isVisibleAndEnabled(el)) {
          nextBtn = el;
          break;
        }
      }
    }
  }

  if (!nextBtn) {
    return { has_next: false, clicked: false, reason: 'no_next_button_found' };
  }

  if (options.click) {
    try {
      nextBtn.click();
      return { has_next: true, clicked: true, selector_matched: nextBtn.tagName.toLowerCase() };
    } catch(e) {
      return { has_next: true, clicked: false, error: String(e) };
    }
  }

  return { has_next: true, clicked: false, selector_matched: nextBtn.tagName.toLowerCase() };
}
"""

# ---------------------------------------------------------------------------
# Chamadores LLM por provedor e Retry com Backoff Exponencial (429)
# ---------------------------------------------------------------------------

COMMON_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def is_rate_limit_error(e: Exception) -> bool:
    """Detecta se uma exceção representa erro HTTP 429 ou Rate Limit de qualquer provedor."""
    if isinstance(e, urllib.error.HTTPError):
        if e.code in (429, 503):
            return True
    err_str = str(e).lower()
    return any(phrase in err_str for phrase in [
        "429",
        "rate limit",
        "rate_limit",
        "resource_exhausted",
        "too many requests",
        "quota exceeded",
        "tokens per minute"
    ])


def call_llm_with_retry(
    call_fn: Callable[[], str],
    provider: str = "llm",
    max_retries: int = 3,
    base_delay: float = 2.0,
    max_delay: float = 16.0,
    log_collector: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Executa chamadas LLM com retry e backoff exponencial com jitter para erro HTTP 429 / Rate Limit.
    Mínimo de 3 retries (total de 4 tentativas).
    """
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            return call_fn()
        except Exception as e:
            last_err = e
            if attempt < max_retries and is_rate_limit_error(e):
                delay = min(max_delay, base_delay * (2 ** attempt)) + random.uniform(0.1, 0.9)
                if isinstance(e, urllib.error.HTTPError):
                    retry_after = e.headers.get("Retry-After") if hasattr(e, "headers") and e.headers else None
                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except (ValueError, TypeError):
                            pass

                retry_msg = (
                    f"[LLM Retry] Provedor '{provider}' retornou rate-limit (tentativa {attempt + 1}/{max_retries + 1}). "
                    f"Aguardando {delay:.2f}s com backoff exponencial..."
                )
                print(retry_msg, file=sys.stderr)
                if log_collector is not None:
                    log_collector.append({
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "step": "llm_retry_backoff",
                        "provider": provider,
                        "attempt": attempt + 1,
                        "max_attempts": max_retries + 1,
                        "backoff_seconds": round(delay, 2),
                        "reason": str(e)
                    })
                time.sleep(delay)
            else:
                raise e
    if last_err:
        raise last_err
    return ""


def _call_openai(b64: str, prompt: str, byok: Dict) -> str:
    import urllib.request
    parts = [{"type": "text", "text": prompt}]
    if b64:
        parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})
    payload = json.dumps({
        "model": byok.get("model", "gpt-4o"),
        "messages": [{"role": "user", "content": parts}],
        "max_tokens": 800,
        "response_format": {"type": "json_object"}
    }).encode()
    headers = {**COMMON_HEADERS, "Authorization": f"Bearer {byok['api_key']}"}
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", data=payload,
        headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]


def _call_anthropic(b64: str, prompt: str, byok: Dict) -> str:
    import urllib.request
    content: List = []
    if b64:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}})
    content.append({"type": "text", "text": prompt})
    payload = json.dumps({
        "model": byok.get("model", "claude-3-5-sonnet-20241022"),
        "max_tokens": 800,
        "messages": [{"role": "user", "content": content}]
    }).encode()
    headers = {**COMMON_HEADERS, "x-api-key": byok["api_key"], "anthropic-version": "2023-06-01"}
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=payload,
        headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["content"][0]["text"]


def _call_gemini(b64: str, prompt: str, byok: Dict) -> str:
    import urllib.request
    parts = [{"text": prompt}]
    if b64:
        parts.append({"inlineData": {"mimeType": "image/png", "data": b64}})
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{byok.get('model', 'gemini-flash-latest')}:generateContent?key={byok['api_key']}")
    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"maxOutputTokens": 800, "responseMimeType": "application/json"}
    }).encode()
    req = urllib.request.Request(url, data=payload, headers=COMMON_HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["candidates"][0]["content"]["parts"][0]["text"]


def _call_groq(prompt: str, byok: Dict) -> str:
    """Groq e modelos text-only: sem imagem."""
    import urllib.request
    payload = json.dumps({
        "model": byok.get("model", "llama-3.3-70b-versatile"),
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 800, "temperature": 0.1
    }).encode()
    headers = {**COMMON_HEADERS, "Authorization": f"Bearer {byok['api_key']}"}
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions", data=payload,
        headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]


def default_llm_caller(b64: str, prompt: str, byok: Dict, log_collector: Optional[List[Dict[str, Any]]] = None) -> str:
    """Despacha para o provedor correto com retry e backoff exponencial para 429."""
    provider = (byok.get("provider") or "").lower().strip()

    def _execute():
        if provider == "openai":
            return _call_openai(b64, prompt, byok)
        if provider == "anthropic":
            return _call_anthropic(b64, prompt, byok)
        if provider in ("gemini", "google"):
            return _call_gemini(b64, prompt, byok)
        return _call_groq(prompt, byok)   # Groq e outros: text-only

    return call_llm_with_retry(_execute, provider=provider or "groq", log_collector=log_collector)


def provider_supports_vision(byok: Dict) -> bool:
    return (byok.get("provider") or "").lower() in ("openai", "anthropic", "gemini", "google")


# ---------------------------------------------------------------------------
# PageReaderEngine — Motor Principal
# ---------------------------------------------------------------------------

class PageReaderEngine:
    """
    Engine generalista de leitura de pagina via CDP.

    Implementa SeeAct + Set-of-Mark (via DOM overlay) + PageMem.
    O LLM NUNCA inventa seletores CSS — apenas cita numeros de secao.
    A ancoragem e 100% deterministica pelo codigo.
    """

    def __init__(self, llm_caller: Optional[Callable] = None):
        self._llm = llm_caller or default_llm_caller

    # ------------------------------------------------------------------
    # Entry point principal
    # ------------------------------------------------------------------

    async def run(
        self,
        page: Any,
        goal: str,
        byok: Dict[str, str],
        output_format: str = "students",
    ) -> ExtractedData:
        """
        Ciclo completo:
        1. build_page_mem — deterministico (JS, sem LLM)
        2. inject_set_of_marks — deterministico (DOM overlay via evaluate)
        3. screenshot — captura com marcacoes ja visíveis no DOM
        4. remove_set_of_marks — limpa o DOM
        5. perceive_and_plan — LLM (unico turno com modelo)
        6. anchor_plan_to_dom — deterministico (numero → seletor real)
        7. extract_data — extrai do DOM real
        8. retry com fallbacks se necessario
        """
        print(f"[PageReader] Iniciando: '{goal}'")

        # 1. PageMem — deterministico
        page_mem = await self._build_page_mem(page)
        if not page_mem or not page_mem.sections:
            return ExtractedData(
                success=False, data=[], raw_text="", page_title="", page_url="",
                section_used=None,
                failure_reason="empty_page: DOM nao contem secoes estruturadas detectaveis."
            )
        print(f"[PageReader] PageMem: {page_mem.total_sections} secoes detectadas.")

        # 2-4. Set-of-Mark via DOM overlay + screenshot
        has_vision = provider_supports_vision(byok)
        screenshot_b64 = ""
        injected_marks: List[Dict] = []

        if has_vision:
            try:
                sections_for_marks = [
                    {"css_selector": s.css_selector, "section_id": s.section_id}
                    for s in page_mem.sections
                    if s.bounding_box and s.bounding_box.get("width", 0) > 30
                ]
                # 2. Injeta overlays no DOM
                injected_marks = await page.evaluate(SET_OF_MARKS_INJECT_JS, sections_for_marks)
                # Atualiza mark_number em cada secao
                mark_map = {m["css_selector"]: m["mark"] for m in injected_marks}
                for sec in page_mem.sections:
                    sec.mark_number = mark_map.get(sec.css_selector)
                print(f"[PageReader] Set-of-Mark: {len(injected_marks)} elementos marcados no DOM.")

                # 3. Screenshot com marcacoes visiveis
                ss_bytes = await page.screenshot(full_page=False)
                screenshot_b64 = base64.b64encode(ss_bytes).decode("ascii")

                # 4. Remove overlays
                await page.evaluate(SET_OF_MARKS_REMOVE_JS)
            except Exception as e:
                print(f"[PageReader] Aviso: Set-of-Mark/screenshot falhou ({e}). Modo text-only.")
                has_vision = False
                try:
                    await page.evaluate(SET_OF_MARKS_REMOVE_JS)
                except Exception:
                    pass

        # 5. Percepcao — LLM
        plan = await self._perceive_and_plan(
            goal, page_mem, screenshot_b64 if has_vision else "", byok
        )
        if not plan and getattr(self, "_last_llm_failed", False):
            # Fallback determinístico PageMem: se a chamada ao LLM falhar (ou sofrer 429 rate-limit),
            # seleciona a seção estruturada com maior número de itens compatível com o formato
            heuristic_section = None
            if output_format in ("students", "grades"):
                candidates = [s for s in page_mem.sections if s.semantic_role in ("card_grid", "table")]
                if candidates:
                    heuristic_section = max(candidates, key=lambda s: s.row_count or s.element_count or 0)
            elif output_format == "raw_text":
                candidates = [s for s in page_mem.sections if s.semantic_role in ("article", "main", "document_viewer")]
                if candidates:
                    heuristic_section = candidates[0]

            if heuristic_section:
                print(f"[PageReader] [FALLBACK] Usando fallback deterministico PageMem: secao {heuristic_section.section_id} ({heuristic_section.semantic_role}).")
                plan = ExtractionPlan(
                    target_section_id=heuristic_section.section_id,
                    mark_number=None,
                    reasoning="fallback_deterministico_pagemem",
                    confidence="medium",
                    fallback_section_ids=[]
                )

        if not plan:
            return ExtractedData(
                success=False, data=[], raw_text="",
                page_title=page_mem.title, page_url=page_mem.url,
                section_used=None,
                failure_reason="no_matching_section: LLM nao identificou secao com a informacao pedida."
            )
        print(f"[PageReader] Plano: secao {plan.target_section_id} "
              f"conf={plan.confidence}. Razao: {plan.reasoning}")

        # 6. Ancoragem — deterministico
        target = self._anchor_plan_to_dom(plan, page_mem)
        if not target:
            return ExtractedData(
                success=False, data=[], raw_text="",
                page_title=page_mem.title, page_url=page_mem.url,
                section_used=None,
                failure_reason=f"anchor_failed: secao {plan.target_section_id} nao encontrada na PageMem."
            )

        # 7. Extracao no DOM real
        extracted = await self._extract_data(page, target, goal, output_format)

        # 8. Retry com fallbacks
        if not extracted.success and plan.fallback_section_ids:
            for fid in plan.fallback_section_ids[:2]:
                print(f"[PageReader] Retry com secao de fallback {fid}...")
                ft = self._anchor_plan_to_dom(
                    ExtractionPlan(target_section_id=fid, mark_number=None,
                                   reasoning="fallback", confidence="low", fallback_section_ids=[]),
                    page_mem
                )
                if ft:
                    extracted = await self._extract_data(page, ft, goal, output_format)
                    if extracted.success:
                        break

        extracted.page_title = page_mem.title
        # Rotulagem estrita: Proibido rotular fallback heurístico/determinístico como visão!
        if plan.reasoning == "fallback_deterministico_pagemem":
            extracted.layer_used = "layer_1_deterministic"
        else:
            extracted.layer_used = "layer_2_vision"

        status = f"[OK] {len(extracted.data)} registros" if extracted.success else f"[FALHA] {extracted.failure_reason}"
        print(f"[PageReader] {status}")
        return extracted

    # ------------------------------------------------------------------
    # 1. PageMem — deterministico
    # ------------------------------------------------------------------

    async def _build_page_mem(self, page: Any) -> Optional[PageMemory]:
        try:
            raw = await page.evaluate(PAGE_MEM_JS)
            if not raw or not raw.get("sections"):
                return None
            sections = [
                PageSection(
                    section_id=s["section_id"], css_selector=s["css_selector"],
                    tag_path=s["tag_path"], semantic_role=s["semantic_role"],
                    text_summary=s["text_summary"], element_count=s["element_count"],
                    has_table=s.get("has_table", False), has_list=s.get("has_list", False),
                    has_form=s.get("has_form", False), row_count=s.get("row_count", 0),
                    bounding_box=s.get("bounding_box"),
                    has_cards=s.get("has_cards", False)
                )
                for s in raw["sections"]
            ]
            return PageMemory(
                url=raw.get("url", ""), title=raw.get("title", ""),
                sections=sections, total_sections=len(sections),
                built_at=raw.get("built_at", time.time())
            )
        except Exception as e:
            print(f"[PageReader] Erro PageMem: {e}")
            return None

    # ------------------------------------------------------------------
    # 5. Percepcao — LLM (SeeAct: Percepcao separada de Ancoragem)
    # ------------------------------------------------------------------

    async def _perceive_and_plan(
        self, goal: str, page_mem: PageMemory, b64: str, byok: Dict
    ) -> Optional[ExtractionPlan]:
        mem_text = page_mem.to_summary_text()
        if b64:
            prompt = PERCEPTION_PROMPT_WITH_VISION.format(goal=goal, page_mem_text=mem_text)
        else:
            prompt = PERCEPTION_PROMPT_TEXT_ONLY.format(goal=goal, page_mem_text=mem_text)
        self._last_llm_failed = False
        try:
            raw = self._llm(b64, prompt, byok)
            print(f"[PageReader] LLM resp ({len(raw)} chars).")
        except Exception as e:
            print(f"[PageReader] Falha LLM: {e}")
            self._last_llm_failed = True
            return None
        return self._parse_perception_response(raw)

    def _parse_perception_response(self, raw: str) -> Optional[ExtractionPlan]:
        """Parseia JSON da resposta de percepcao. Tolerante a markdown code blocks."""
        clean = re.sub(r"```(?:json)?\s*", "", raw).strip().strip("`").strip()
        m = re.search(r"\{.*\}", clean, re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group())
        except Exception:
            return None
        if "error" in data:
            print(f"[PageReader] LLM reportou: {data.get('reasoning', data['error'])}")
            return None
        tid = data.get("target_section_id")
        try:
            tid = int(tid)
        except (TypeError, ValueError):
            return None
        conf = str(data.get("confidence", "low")).lower()
        conf = conf if conf in ("high", "medium", "low") else "low"
        fallbacks = [int(x) for x in data.get("fallback_section_ids", [])
                     if isinstance(x, (int, float))]
        return ExtractionPlan(
            target_section_id=tid,
            mark_number=data.get("mark_number"),
            reasoning=data.get("reasoning", ""),
            confidence=conf,
            fallback_section_ids=fallbacks
        )

    # ------------------------------------------------------------------
    # 6. Ancoragem — 100% deterministico (numero → seletor CSS real)
    # ------------------------------------------------------------------

    def _anchor_plan_to_dom(
        self, plan: ExtractionPlan, page_mem: PageMemory
    ) -> Optional[AnchoredTarget]:
        # Busca por section_id
        sec = next((s for s in page_mem.sections if s.section_id == plan.target_section_id), None)
        # Fallback: busca por mark_number
        if not sec and plan.mark_number is not None:
            sec = next((s for s in page_mem.sections if s.mark_number == plan.mark_number), None)
        if not sec:
            print(f"[PageReader] Secao {plan.target_section_id} nao encontrada na PageMem.")
            return None
        # Estrategia de extracao deterministica pelo semantic_role
        if sec.semantic_role == "table" or sec.has_table:
            strategy = "table_rows"
        elif sec.semantic_role in ("card_grid", "cards") or getattr(sec, "has_cards", False) or (sec.semantic_role == "card" and sec.row_count > 1):
            strategy = "card_grid"
        elif sec.semantic_role == "list" or sec.has_list:
            strategy = "list_items"
        elif sec.semantic_role == "form" or sec.has_form:
            strategy = "form_values"
        else:
            strategy = "text_blocks"
        return AnchoredTarget(css_selector=sec.css_selector, section=sec,
                              extraction_strategy=strategy)

    # ------------------------------------------------------------------
    # 7. Extracao no DOM real
    # ------------------------------------------------------------------

    async def _extract_data(
        self, page: Any, target: AnchoredTarget, goal: str, output_format: str
    ) -> ExtractedData:
        sel = target.css_selector

        strat = target.extraction_strategy

        def fail(reason: str) -> ExtractedData:
            return ExtractedData(success=False, data=[], raw_text="",
                                 page_title="", page_url="",
                                 section_used=sel, failure_reason=reason,
                                 strategy_used=strat)

        try:
            if strat == "table_rows":
                raw = await page.evaluate(EXTRACT_TABLE_JS, sel)
                if raw.get("error") == "not_found":
                    raw = await page.evaluate(EXTRACT_TABLE_JS, sel + " table")
                rows = raw.get("rows", [])
                if not rows:
                    return fail(f"empty_extraction: tabela '{sel}' encontrada mas sem linhas de dados.")
                return ExtractedData(
                    success=True, data=self._parse_rows(rows), raw_text="",
                    page_title="", page_url="",
                    section_used=sel, failure_reason=None,
                    strategy_used=strat
                )

            elif strat == "card_grid":
                raw = await page.evaluate(EXTRACT_CARD_GRID_JS, sel)
                cards = raw.get("cards", [])
                if not cards:
                    return fail(f"empty_extraction: grade de cartões '{sel}' sem cartões detectados.")
                data = [
                    {
                        "name": c["name"],
                        "rollNumber": c.get("rollNumber", ""),
                        "portal_native_id": c.get("portal_native_id", ""),
                        "nee_flag": c.get("nee_flag", False),
                        "status": c.get("status", "active"),
                        "avatar": c.get("avatar", ""),
                        "full_text": c.get("full_text", "")
                    }
                    for c in cards
                    if len(c.get("name", "")) >= 2
                ]
                if not data:
                    return fail(f"empty_extraction: cartões encontrados em '{sel}' mas nenhum nome válido foi extraído.")
                return ExtractedData(
                    success=True, data=data, raw_text="",
                    page_title="", page_url="",
                    section_used=sel, failure_reason=None,
                    strategy_used=strat
                )

            elif strat == "list_items":
                raw = await page.evaluate(EXTRACT_LIST_JS, sel)
                items = raw.get("items", [])
                if not items:
                    return fail(f"empty_extraction: lista '{sel}' sem itens.")
                return ExtractedData(
                    success=True,
                    data=[{"name": i["text"], "portal_native_id": i["id"]} for i in items],
                    raw_text="", page_title="", page_url="",
                    section_used=sel, failure_reason=None,
                    strategy_used=strat
                )

            else:  # text_blocks / form_values
                raw = await page.evaluate(EXTRACT_TEXT_JS, sel)
                text = raw.get("text", "")
                if len(text) < 5:
                    return fail(f"empty_extraction: bloco de texto em '{sel}' esta vazio.")
                return ExtractedData(
                    success=True, data=[{"raw_text": text}], raw_text=text,
                    page_title="", page_url="",
                    section_used=sel, failure_reason=None,
                    strategy_used=strat
                )

        except Exception as e:
            return fail(f"extraction_error: {e}")

    async def extract_deterministic(
        self,
        page: Any,
        selector: str,
        strategy: str = "table_rows",
        output_format: str = "students",
        pagination_config: Optional[Dict[str, Any]] = None,
    ) -> ExtractedData:
        """
        Executa extração determinística direta (Camada 1) usando seletor e estratégia conhecidos,
        sem acionar LLM, Set-of-Marks ou captura de screenshots.
        Suporta paginação em loop controlado quando pagination_config é fornecido e ativo.
        """
        sec = PageSection(
            section_id=0,
            css_selector=selector,
            tag_path="",
            semantic_role="card_grid" if strategy == "card_grid" else "table",
            text_summary="",
            element_count=0,
            has_table=(strategy == "table_rows"),
            has_list=(strategy == "list_items"),
            has_form=False,
            row_count=0,
            bounding_box=None
        )
        target = AnchoredTarget(css_selector=selector, section=sec, extraction_strategy=strategy)

        # 1. Extração da primeira página
        res = await self._extract_data(page, target, goal="", output_format=output_format)
        res.layer_used = "layer_1_deterministic"
        res.strategy_used = strategy

        if not res.page_title and hasattr(page, "title"):
            try:
                res.page_title = await page.title()
            except Exception:
                pass
        if not res.page_url and hasattr(page, "url"):
            try:
                res.page_url = page.url
            except Exception:
                pass

        # Se a extração inicial falhou ou paginação não está configurada, retorna imediatamente
        if not res.success or not pagination_config or pagination_config.get("type") == "none":
            res.pages_read = 1
            return res

        # 2. Configurações de paginação
        max_pages = int(pagination_config.get("maxPages") or pagination_config.get("max_pages") or 10)
        delay_ms = int(pagination_config.get("delayBetweenPagesMs") or pagination_config.get("delay_between_pages_ms") or 500)
        delay_s = max(0.1, min(delay_ms / 1000.0, 3.0))
        next_selector = pagination_config.get("nextSelector") or pagination_config.get("next_selector") or ""

        if max_pages <= 1:
            res.pages_read = 1
            return res

        # 3. Loop de paginação controlado
        all_students: List[Dict[str, Any]] = list(res.data)
        seen_keys = set()

        def student_key(s: Dict[str, Any]) -> str:
            native_id = str(s.get("portal_native_id") or "").strip()
            roll = str(s.get("rollNumber") or "").strip()
            name = str(s.get("name") or "").strip().lower()
            if native_id:
                return f"id:{native_id}"
            if roll and name:
                return f"roll:{roll}_{name}"
            return f"name:{name}"

        for s in all_students:
            seen_keys.add(student_key(s))

        current_page = 1
        structured_log = res.structured_log or []
        structured_log.append({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "step": "pagination_page_extracted",
            "page": current_page,
            "items_count": len(res.data),
            "total_accumulated": len(all_students)
        })

        while current_page < max_pages:
            # A. Verifica se existe botão próximo habilitado
            check_opts = {"nextSelector": next_selector, "click": False}
            try:
                check_res = await page.evaluate(PAGINATION_CONTROL_JS, check_opts)
            except Exception as e:
                print(f"[PageReaderEngine] Erro ao checar botão de próxima página: {e}")
                break

            if not check_res or not check_res.get("has_next"):
                break

            # B. Clica no botão de próxima página
            click_opts = {"nextSelector": next_selector, "click": True}
            try:
                click_res = await page.evaluate(PAGINATION_CONTROL_JS, click_opts)
                if not click_res.get("clicked"):
                    break
            except Exception as e:
                print(f"[PageReaderEngine] Erro ao clicar no botão de próxima página: {e}")
                break

            # C. Aguarda carregamento do DOM
            if hasattr(page, "wait_for_load_state"):
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=4000)
                except Exception:
                    pass
            await asyncio.sleep(delay_s)

            current_page += 1

            # D. Extrai dados da nova página
            try:
                page_res = await self._extract_data(page, target, goal="", output_format=output_format)
            except Exception as e:
                print(f"[PageReaderEngine] Erro ao extrair página {current_page}: {e}")
                break

            if not page_res.success or not page_res.data:
                # Página vazia -> final da lista
                break

            # E. Identifica itens novos e previne estagnação/loops infinitos
            new_items_count = 0
            for item in page_res.data:
                k = student_key(item)
                if k not in seen_keys:
                    seen_keys.add(k)
                    all_students.append(item)
                    new_items_count += 1

            structured_log.append({
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "step": "pagination_page_extracted",
                "page": current_page,
                "items_count": len(page_res.data),
                "new_unique_items": new_items_count,
                "total_accumulated": len(all_students)
            })

            if new_items_count == 0:
                # Nenhum aluno novo -> página estagnada ou fim
                break

        res.data = all_students
        res.pages_read = current_page
        res.structured_log = structured_log
        return res

    # ------------------------------------------------------------------
    # Helper: inferencia de colunas (deterministico)
    # ------------------------------------------------------------------

    def _parse_rows(self, rows: List[Dict]) -> List[Dict[str, Any]]:
        """
        Converte linhas brutas de tabela em registros estruturados.
        Detecta e pula linha de cabecalho. Infere colunas deterministicamente.
        """
        if not rows:
            return []

        # Detecta header: primeira linha onde celulas sao palavras-chave conhecidas
        HEADER_KEYWORDS = {"nome", "name", "aluno", "matrícula", "matricula",
                           "matric", "id", "n.", "no.", "#", "situação", "situacao",
                           "status", "turma", "class"}
        first_cells_lower = [c.strip().lower() for c in rows[0].get("cells", [])]
        is_header = any(c in HEADER_KEYWORDS for c in first_cells_lower)
        data_rows = rows[1:] if is_header and len(rows) > 1 else rows

        if not data_rows:
            return []

        ncols = len(data_rows[0].get("cells", []))
        name_col, id_col = 0, None

        # Heuristica de coluna: se col 0 for numero → col 1 é nome
        if ncols >= 2:
            c0 = data_rows[0].get("cells", [""])[0].replace(".", "").replace("/", "").strip()
            if c0.isdigit():
                id_col, name_col = 0, 1
            else:
                name_col = 0
                id_col = 1 if ncols > 1 else None

        result = []
        for row in data_rows:
            cells = row.get("cells", [])
            name = cells[name_col].strip() if name_col < len(cells) else ""
            if not name or len(name) < 2:
                continue
            result.append({
                "name": name,
                "rollNumber": (cells[id_col].strip()
                               if id_col is not None and id_col < len(cells) else ""),
                "portal_native_id": row.get("portal_native_id", ""),
                "nee_flag": row.get("nee_flag", False),
                "status": "active",
                "all_cells": cells,
            })
        return result

