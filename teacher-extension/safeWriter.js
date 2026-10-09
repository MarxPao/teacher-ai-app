(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeWriter = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/gi, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isElementVisible(el, docRef) {
    if (!el || typeof el !== 'object') return false;
    const s = el.style || {};
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    if (s.opacity !== undefined && parseFloat(s.opacity) === 0) return false;
    if (typeof s.clip === 'string' && /rect\(\s*0(?:px)?,\s*0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\s*\)/i.test(s.clip)) return false;
    if (typeof s.clipPath === 'string' && /(?:rect|inset|circle)\(\s*0/i.test(s.clipPath)) return false;

    const doc = docRef || (typeof document !== 'undefined' ? document : null);
    const win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    if (win && typeof win.getComputedStyle === 'function') {
      try {
        const c = win.getComputedStyle(el);
        if (c && (c.display === 'none' || c.visibility === 'hidden' || c.visibility === 'collapse' || parseFloat(c.opacity) === 0)) return false;
      } catch {}
    }

    let zeroDim = (el.offsetWidth !== undefined && el.offsetHeight !== undefined && el.offsetWidth <= 0 && el.offsetHeight <= 0);
    if (typeof el.getBoundingClientRect === 'function') {
      try {
        const r = el.getBoundingClientRect();
        if (r && r.width !== undefined && r.height !== undefined) zeroDim = (r.width <= 0 && r.height <= 0);
      } catch {}
    }
    return !zeroDim;
  }

  function isHoneypot(el) {
    if (!el || typeof el !== 'object') return false;
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return true;

    const s = el.style || {};
    if ((s.left !== undefined && parseFloat(s.left) <= -1000) || (s.top !== undefined && parseFloat(s.top) <= -1000)) return true;
    if (typeof el.getBoundingClientRect === 'function') {
      try {
        const r = el.getBoundingClientRect();
        if (r && ((r.left !== undefined && r.left <= -1000) || (r.top !== undefined && r.top <= -1000))) return true;
      } catch {}
    }

    const trapRegex = /(?:^|[_-\s])(?:trap|bot_check|fake_input|honey(?:pot)?)(?:[_-\s]|$)/i;
    for (const attr of ['name', 'id', 'class', 'className']) {
      const val = (typeof el.getAttribute === 'function' ? el.getAttribute(attr) : null) || (typeof el[attr] === 'string' ? el[attr] : null);
      if (val && trapRegex.test(val)) return true;
    }
    if (typeof el.getAttribute === 'function' && el.getAttribute('tabindex') === '-1' && el.getAttribute('aria-hidden') === 'true') return true;
    return false;
  }

  function validateStudentRowTarget(el, expectedStudentName) {
    if (!el || typeof el !== 'object' || !expectedStudentName || typeof expectedStudentName !== 'string') return false;
    const target = normalizeText(expectedStudentName);
    if (!target) return false;

    let row = typeof el.closest === 'function' ? el.closest('tr, [role="row"], .student-row, .aluno-card, li.student-item') : null;
    if (!row) {
      let p = el.parentElement || el.parentNode;
      while (p) {
        if (p.tagName === 'TR' || (typeof p.getAttribute === 'function' && p.getAttribute('role') === 'row')) { row = p; break; }
        p = p.parentElement || p.parentNode;
      }
    }
    if (!row) return false;
    return normalizeText(row.textContent || '').includes(target);
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
    if (!validateStudentRowTarget(el, expectedStudentName)) return { canWrite: false, targetElement: null, reason: 'STUDENT_MISMATCH' };
    return { canWrite: true, targetElement: el, reason: null };
  }

  return { isElementVisible, isHoneypot, validateStudentRowTarget, canSafelyWrite };
}));
