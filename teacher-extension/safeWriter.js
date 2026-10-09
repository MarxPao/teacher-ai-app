(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeWriter = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    const norm = normalizeText(text);
    return norm ? norm.split(' ').filter(Boolean) : [];
  }

  function containsTokenSequence(rowTokens, targetTokens) {
    if (!targetTokens.length || targetTokens.length > rowTokens.length) return false;
    for (let i = 0; i <= rowTokens.length - targetTokens.length; i++) {
      let match = true;
      for (let j = 0; j < targetTokens.length; j++) {
        if (rowTokens[i + j] !== targetTokens[j]) { match = false; break; }
      }
      if (match) return true;
    }
    return false;
  }

  function findRowContainer(el) {
    if (!el || typeof el !== 'object') return null;
    let row = typeof el.closest === 'function' ? el.closest('tr, [role="row"], .student-row, .aluno-card, li.student-item') : null;
    if (!row) {
      let p = el.parentElement || el.parentNode;
      while (p) {
        if (p.tagName === 'TR' || (typeof p.getAttribute === 'function' && p.getAttribute('role') === 'row')) {
          row = p;
          break;
        }
        p = p.parentElement || p.parentNode;
      }
    }
    return row;
  }

  function findTableContainer(row) {
    if (!row) return null;
    let container = typeof row.closest === 'function' ? row.closest('table, tbody, [role="grid"], [role="table"]') : null;
    if (!container) {
      let p = row.parentElement || row.parentNode;
      while (p) {
        if (p.tagName === 'TABLE' || p.tagName === 'TBODY' || (typeof p.getAttribute === 'function' && (p.getAttribute('role') === 'grid' || p.getAttribute('role') === 'table'))) {
          container = p;
          break;
        }
        p = p.parentElement || p.parentNode;
      }
    }
    return container;
  }

  function getRowsInContainer(container) {
    if (!container) return [];
    if (typeof container.querySelectorAll === 'function') {
      const list = container.querySelectorAll('tr');
      if (list && list.length > 0) return Array.from(list);
    }
    if (Array.isArray(container.children)) {
      return container.children.filter(function (c) { return c.tagName === 'TR'; });
    }
    return [];
  }

  function isElementVisible(el, docRef) {
    if (!el || typeof el !== 'object') return false;
    const s = el.style || {};
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    if (s.opacity !== undefined && parseFloat(s.opacity) === 0) return false;
    if (s.pointerEvents === 'none') return false;
    if (s.fontSize !== undefined) {
      const fs = String(s.fontSize).trim();
      if (fs === '0' || fs === '0px' || parseFloat(fs) === 0) return false;
    }
    if (typeof s.transform === 'string') {
      if (/(?:scale|scaleX|scaleY|scale3d)\(\s*0(?:px|%|\)|,)/i.test(s.transform)) return false;
      if (/translate(?:X|Y|3d)?\(\s*-[1-9]\d{2,}/i.test(s.transform)) return false;
    }
    if (typeof s.clip === 'string' && /rect\(\s*0(?:px)?,\s*0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\s*\)/i.test(s.clip)) return false;
    if (typeof s.clipPath === 'string') {
      const cp = s.clipPath.trim().toLowerCase();
      if (/circle\(\s*0(?:px|%|\s|\)|,)/i.test(cp) || /inset\(\s*100%/i.test(cp) || /polygon\(\s*(?:0\s*0)?\s*\)/i.test(cp)) {
        return false;
      }
    }

    // Verificação de herança e ancestrais ocultos
    let ancestor = el.parentElement || el.parentNode;
    while (ancestor) {
      const as = ancestor.style;
      if (as) {
        if (as.display === 'none' || as.visibility === 'hidden' || as.visibility === 'collapse') return false;
        if (as.opacity !== undefined && parseFloat(as.opacity) === 0) return false;
        if (typeof as.transform === 'string' && /(?:scale|scaleX|scaleY|scale3d)\(\s*0(?:px|%|\)|,)/i.test(as.transform)) return false;
      }
      ancestor = ancestor.parentElement || ancestor.parentNode;
    }

    const doc = docRef || (typeof document !== 'undefined' ? document : null);
    const win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    if (win && typeof win.getComputedStyle === 'function') {
      try {
        const c = win.getComputedStyle(el);
        if (c && (c.display === 'none' || c.visibility === 'hidden' || c.visibility === 'collapse' || parseFloat(c.opacity) === 0)) return false;
      } catch {}
    }

    // Verificação de oclusão por elemento sobreposto (elementFromPoint)
    if (doc && typeof doc.elementFromPoint === 'function' && typeof el.getBoundingClientRect === 'function') {
      try {
        const r = el.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) {
          const cx = (r.left || 0) + (r.width / 2);
          const cy = (r.top || 0) + (r.height / 2);
          const topEl = doc.elementFromPoint(cx, cy);
          if (topEl && topEl !== el) {
            const contains = typeof el.contains === 'function' ? el.contains(topEl) : false;
            const isDescendant = typeof topEl.contains === 'function' ? topEl.contains(el) : false;
            if (!contains && !isDescendant) return false;
          }
        }
      } catch {}
    }

    let zeroDim = (el.offsetWidth !== undefined && el.offsetHeight !== undefined && el.offsetWidth <= 0 && el.offsetHeight <= 0);
    if (typeof el.getBoundingClientRect === 'function') {
      try {
        const r = el.getBoundingClientRect();
        if (r && r.width !== undefined && r.height !== undefined) {
          zeroDim = (r.width <= 0 && r.height <= 0);
          if (r.right <= 0 || r.bottom <= 0 || (r.left !== undefined && r.left <= -1000) || (r.top !== undefined && r.top <= -1000)) return false;
        }
      } catch {}
    }
    return !zeroDim;
  }

  function isHoneypot(el) {
    if (!el || typeof el !== 'object') return false;

    // Defesa de Honeypots em Duas Camadas:
    // 1. SINAIS ESTRUTURAIS (Defesa Primária):
    //    Anomalias de acessibilidade, atributos fora de contexto relacional e controles duplicados.
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return true;

    const tabIdx = typeof el.getAttribute === 'function' ? el.getAttribute('tabindex') : el.tabIndex;
    if (String(tabIdx) === '-1' && typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') {
      return true;
    }

    const autoComp = typeof el.getAttribute === 'function' ? el.getAttribute('autocomplete') : el.autocomplete;
    if (autoComp === 'off') {
      const row = findRowContainer(el);
      if (!row) return true;
    }

    const row = findRowContainer(el);
    const elName = (typeof el.getAttribute === 'function' ? el.getAttribute('name') : null) || el.name;
    if (row && elName) {
      let inputsInRow = [];
      if (typeof row.querySelectorAll === 'function') {
        inputsInRow = row.querySelectorAll('input');
      } else if (Array.isArray(row.children)) {
        inputsInRow = row.children.filter(function (c) { return c.tagName === 'INPUT'; });
      }
      let dupCount = 0;
      for (let i = 0; i < inputsInRow.length; i++) {
        const inp = inputsInRow[i];
        const inpName = (typeof inp.getAttribute === 'function' ? inp.getAttribute('name') : null) || inp.name;
        if (inpName === elName) {
          dupCount++;
          if (dupCount > 1) return true;
        }
      }
    }

    const s = el.style || {};
    if ((s.left !== undefined && parseFloat(s.left) <= -1000) || (s.top !== undefined && parseFloat(s.top) <= -1000)) return true;

    // 2. HEURÍSTICA LÉXICA DE NOMES/IDs (Defesa Secundária/Acessória):
    //    Identificadores antibot comuns em name, id, class.
    const trapRegex = /(?:^|[_-\s])(?:trap|bot_check|fake_input|honey(?:pot)?)(?:[_-\s]|$)/i;
    for (const attr of ['name', 'id', 'class', 'className']) {
      const val = (typeof el.getAttribute === 'function' ? el.getAttribute(attr) : null) || (typeof el[attr] === 'string' ? el[attr] : null);
      if (val && trapRegex.test(val)) return true;
    }

    return false;
  }

  function validateStudentRowTargetDetail(el, expectedStudentName) {
    if (!el || typeof el !== 'object' || !expectedStudentName || typeof expectedStudentName !== 'string') {
      return { valid: false, reason: 'STUDENT_MISMATCH' };
    }
    const targetTokens = tokenize(expectedStudentName);
    if (targetTokens.length === 0) return { valid: false, reason: 'INVALID_STUDENT_NAME' };

    const row = findRowContainer(el);
    if (!row) return { valid: false, reason: 'STUDENT_MISMATCH' };

    const rowTokens = tokenize(row.textContent || '');
    const isContained = containsTokenSequence(rowTokens, targetTokens);
    if (!isContained) return { valid: false, reason: 'STUDENT_MISMATCH' };

    // Verificação de homônimos na mesma tabela/grid
    const tableContainer = findTableContainer(row);
    if (tableContainer) {
      const siblingRows = getRowsInContainer(tableContainer);
      let matchCount = 0;
      for (let i = 0; i < siblingRows.length; i++) {
        const sTokens = tokenize(siblingRows[i].textContent || '');
        if (containsTokenSequence(sTokens, targetTokens)) {
          matchCount++;
          if (matchCount > 1) return { valid: false, reason: 'AMBIGUOUS_HOMONYM' };
        }
      }
    }

    // Verificação de nome parcial de token único (apenas primeiro nome)
    if (targetTokens.length === 1) {
      return { valid: false, reason: 'AMBIGUOUS_PARTIAL_NAME' };
    }

    return { valid: true, reason: null };
  }

  function validateStudentRowTarget(el, expectedStudentName) {
    return validateStudentRowTargetDetail(el, expectedStudentName).valid;
  }

  function canSafelyWrite(el, expectedStudentName, options) {
    if (!el || typeof el !== 'object') return { canWrite: false, targetElement: null, reason: 'INVALID_ELEMENT' };
    if (!expectedStudentName || typeof expectedStudentName !== 'string' || !expectedStudentName.trim()) {
      return { canWrite: false, targetElement: null, reason: 'INVALID_STUDENT_NAME' };
    }
    if (el.disabled === true) return { canWrite: false, targetElement: null, reason: 'ELEMENT_DISABLED' };
    if (el.readOnly === true) return { canWrite: false, targetElement: null, reason: 'ELEMENT_READONLY' };
    if (isHoneypot(el)) return { canWrite: false, targetElement: null, reason: 'HONEYPOT_DETECTED' };
    if (!isElementVisible(el, options ? options.doc : null)) return { canWrite: false, targetElement: null, reason: 'ELEMENT_NOT_VISIBLE' };

    const rowValidation = validateStudentRowTargetDetail(el, expectedStudentName);
    if (!rowValidation.valid) {
      return { canWrite: false, targetElement: null, reason: rowValidation.reason };
    }
    return { canWrite: true, targetElement: el, reason: null };
  }

  return { isElementVisible, isHoneypot, validateStudentRowTarget, canSafelyWrite };
}));
