(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SafeWriter = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^\w\s]/gi, ' ')        // pontuações para espaço
      .toLowerCase()
      .replace(/\s+/g, ' ')             // colapsa espaços
      .trim();
  }

  function isElementVisible(element, docRef) {
    if (!element || typeof element !== 'object') return false;

    // 1. Verificação de estilos inline ou mockados
    const style = element.style || {};
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (style.opacity !== undefined && parseFloat(style.opacity) === 0) return false;
    if (typeof style.clip === 'string' && /rect\(\s*0(?:px)?,\s*0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\s*\)/i.test(style.clip)) {
      return false;
    }
    if (typeof style.clipPath === 'string' && /(?:rect|inset|circle)\(\s*0/i.test(style.clipPath)) {
      return false;
    }

    // 2. Verificação via getComputedStyle no navegador real, se disponível
    const doc = docRef || (typeof document !== 'undefined' ? document : null);
    const win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    if (win && typeof win.getComputedStyle === 'function') {
      try {
        const computed = win.getComputedStyle(element);
        if (computed) {
          if (computed.display === 'none') return false;
          if (computed.visibility === 'hidden' || computed.visibility === 'collapse') return false;
          if (parseFloat(computed.opacity) === 0) return false;
        }
      } catch {
        // Fallback para estilos inline já avaliados
      }
    }

    // 3. Verificação de dimensões do elemento
    let hasZeroDimensions = false;
    if (element.offsetWidth !== undefined && element.offsetHeight !== undefined) {
      if (element.offsetWidth <= 0 && element.offsetHeight <= 0) {
        hasZeroDimensions = true;
      }
    }

    if (typeof element.getBoundingClientRect === 'function') {
      try {
        const rect = element.getBoundingClientRect();
        if (rect && rect.width !== undefined && rect.height !== undefined) {
          if (rect.width <= 0 && rect.height <= 0) {
            hasZeroDimensions = true;
          } else {
            // Se o bounding box tem dimensões positivas, não está colapsado
            hasZeroDimensions = false;
          }
        }
      } catch {
        // Ignora erro de rect em nós desconectados
      }
    }

    if (hasZeroDimensions) return false;

    return true;
  }

  function isHoneypot(element) {
    if (!element || typeof element !== 'object') return false;

    // 1. Atributo aria-hidden indica ocultação semântica e armadilha para leitores/bots
    if (typeof element.getAttribute === 'function') {
      if (element.getAttribute('aria-hidden') === 'true') {
        return true;
      }
    }

    // 2. Coordenadas fora da tela visível (técnica comum de honeypot CSS)
    const style = element.style || {};
    if (style.left !== undefined && parseFloat(style.left) <= -1000) return true;
    if (style.top !== undefined && parseFloat(style.top) <= -1000) return true;

    if (typeof element.getBoundingClientRect === 'function') {
      try {
        const rect = element.getBoundingClientRect();
        if (rect) {
          if (rect.left !== undefined && rect.left <= -1000) return true;
          if (rect.top !== undefined && rect.top <= -1000) return true;
        }
      } catch {}
    }

    // 3. Nomes, IDs e classes suspeitos de armadilhas antibot
    const checkAttributes = ['name', 'id', 'class', 'className'];
    const trapRegex = /(?:^|[_-\s])(?:trap|bot_check|fake_input|honey(?:pot)?)(?:[_-\s]|$)/i;

    for (const attr of checkAttributes) {
      let val = null;
      if (typeof element.getAttribute === 'function') {
        val = element.getAttribute(attr);
      }
      if (!val && element[attr] && typeof element[attr] === 'string') {
        val = element[attr];
      }
      if (val && trapRegex.test(val)) {
        return true;
      }
    }

    // 4. Tabindex -1 com atributos suspeitos ou invisibilidade
    if (typeof element.getAttribute === 'function' && element.getAttribute('tabindex') === '-1') {
      if (typeof element.getAttribute('aria-hidden') === 'string' && element.getAttribute('aria-hidden') === 'true') {
        return true;
      }
    }

    return false;
  }

  function validateStudentRowTarget(element, expectedStudentName, docRef) {
    if (!element || typeof element !== 'object') return false;
    if (!expectedStudentName || typeof expectedStudentName !== 'string') return false;

    const normStudent = normalizeText(expectedStudentName);
    if (!normStudent) return false;

    // Localiza o container da linha (TR ou elemento com role row ou container de card)
    let row = null;
    if (typeof element.closest === 'function') {
      row = element.closest('tr, [role="row"], .student-row, .aluno-card, li.student-item');
    }

    if (!row) {
      // Tenta subida manual até achar TR ou elemento pai
      let curr = element.parentElement || element.parentNode;
      while (curr) {
        if (curr.tagName === 'TR' || (typeof curr.getAttribute === 'function' && curr.getAttribute('role') === 'row')) {
          row = curr;
          break;
        }
        curr = curr.parentElement || curr.parentNode;
      }
    }

    if (!row) return false;

    const rowText = row.textContent || '';
    const normRowText = normalizeText(rowText);

    return normRowText.includes(normStudent);
  }

  function canSafelyWrite(targetElement, expectedStudentName, options) {
    // 1. Validação do elemento alvo
    if (!targetElement || typeof targetElement !== 'object') {
      return {
        canWrite: false,
        targetElement: null,
        reason: 'INVALID_ELEMENT'
      };
    }

    // 2. Validação do nome do estudante
    if (!expectedStudentName || typeof expectedStudentName !== 'string' || !expectedStudentName.trim()) {
      return {
        canWrite: false,
        targetElement: null,
        reason: 'INVALID_STUDENT_NAME'
      };
    }

    // 3. Controles desabilitados ou somente leitura
    if (targetElement.disabled === true) {
      return {
        canWrite: false,
        targetElement: null,
        reason: 'ELEMENT_DISABLED'
      };
    }
    if (targetElement.readOnly === true) {
      return {
        canWrite: false,
        targetElement: null,
        reason: 'ELEMENT_READONLY'
      };
    }

    // 4. Detecção de honeypots
    if (isHoneypot(targetElement)) {
      return {
        canWrite: false,
        targetElement: null,
        reason: 'HONEYPOT_DETECTED'
      };
    }

    // 5. Verificação de visibilidade
    if (!isElementVisible(targetElement, options ? options.doc : null)) {
      return {
        canWrite: false,
        targetElement: null,
        reason: 'ELEMENT_NOT_VISIBLE'
      };
    }

    // 6. Amarração relacional aluno <-> linha
    if (!validateStudentRowTarget(targetElement, expectedStudentName, options ? options.doc : null)) {
      return {
        canWrite: false,
        targetElement: null,
        reason: 'STUDENT_MISMATCH'
      };
    }

    return {
      canWrite: true,
      targetElement,
      reason: null
    };
  }

  return {
    isElementVisible,
    isHoneypot,
    validateStudentRowTarget,
    canSafelyWrite
  };
}));
