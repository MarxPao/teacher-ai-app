(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AttendancePolarity = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeText(text) {
    if (!text) return '';
    return String(text)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function resolveCheckboxPolarity(text) {
    if (!text) return null;
    const norm = normalizeText(text);
    if (!norm) return null;

    // Regra 0 (Ambiguidade/Agregação estrita):
    // - "sem falta", "nao faltou", "nao falta" não determinam ação diária binária -> ambíguo
    // - "total de faltas", "total de presencas", "total" são contadores/agregados -> ambíguo
    const ambiguousRegex = /\b(sem\s+falta[s]?|nao\s+falto[u]?|nao\s+falta[s]?|total\s+de|total)\b/i;
    if (ambiguousRegex.test(norm)) {
      return null;
    }

    // Regra 1 (Precedência máxima): Negações explícitas antes de radicais -> ausência
    // Ex: "não compareceu", "nao veio", "sem presenca", "não esteve", "não presente"
    const negationRegex = /\b(nao\s+compareceu|nao\s+veio|nao\s+presente|sem\s+presenca|nao\s+esteve)\b/i;
    if (negationRegex.test(norm)) {
      return 'absence';
    }

    // Regra 2: Radicais de falta / ausência com limite de palavra (\b)
    const absenceRegex = /\b(falta|faltas|ausente|ausentes|ausencia|ausencias|absent|absence)\b/i;
    const hasAbsence = absenceRegex.test(norm);

    // Regra 3: Radicais de presença / comparecimento com limite de palavra (\b para início de palavra)
    // Evita falsos positivos como "Representante" ou "Apresentação"
    const presenceRegex = /\b(presenca|presencas|presente|presentes|compareceu|compareceram|comparecimento|attend|attendance|present)\b/i;
    const hasPresence = presenceRegex.test(norm);

    // Conflito de polaridade: se contiver ambos sem negação disambiguadora -> ambíguo
    if (hasAbsence && hasPresence) {
      return null;
    }
    if (hasAbsence) {
      return 'absence';
    }
    if (hasPresence) {
      return 'presence';
    }

    return null;
  }

  function determineTargetChecked(polarity, isAbsent) {
    if (polarity === 'presence') {
      return !isAbsent;
    }
    if (polarity === 'absence') {
      return Boolean(isAbsent);
    }
    return null;
  }

  function resolveAttendancePolarity(columnHeader, controlLabel, teacherIntent) {
    const headerPol = resolveCheckboxPolarity(columnHeader);
    const labelPol = resolveCheckboxPolarity(controlLabel);

    // Detecção de conflito: cabeçalho e rótulo apontam direções opostas
    if (headerPol && labelPol && headerPol !== labelPol) {
      return {
        canResolve: false,
        polarity: 'CONFLICT',
        shouldBeChecked: null,
        reason: 'Conflito semântico direto entre cabeçalho e rótulo do checkbox'
      };
    }

    const resolvedPol = headerPol || labelPol;
    if (!resolvedPol) {
      return {
        canResolve: false,
        polarity: 'AMBIGUOUS',
        shouldBeChecked: null,
        reason: 'Sinal semântico ausente ou ambíguo (fail-closed)'
      };
    }

    const isAbsent = (teacherIntent === 'FALTA' || teacherIntent === 'AUSENCIA');
    const shouldCheck = determineTargetChecked(resolvedPol, isAbsent);
    const polarityName = (resolvedPol === 'presence') ? 'POSITIVE' : 'NEGATIVE';

    return {
      canResolve: true,
      polarity: polarityName,
      shouldBeChecked: shouldCheck,
      reason: null
    };
  }

  function getCheckboxHeaderAndLabel(element, docRef) {
    const doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!element || !doc) return { headerText: '', labelText: '' };

    let labelText = '';
    if (element.id) {
      const lbl = doc.querySelector(`label[for="${element.id}"]`);
      if (lbl) labelText = lbl.innerText || lbl.textContent || '';
    }
    if (!labelText && element.closest) {
      const parentLabel = element.closest('label');
      if (parentLabel) labelText = parentLabel.innerText || parentLabel.textContent || '';
    }
    const ariaLabel = (element.getAttribute && (element.getAttribute('aria-label') || element.getAttribute('title'))) || '';
    if (!labelText && ariaLabel) {
      labelText = ariaLabel;
    }

    let headerText = '';
    const td = element.closest ? element.closest('td, th') : null;
    const tr = td ? td.closest('tr') : null;
    const table = tr ? tr.closest('table') : null;

    if (td && tr && table) {
      const cells = Array.from(tr.children);
      const colIdx = cells.indexOf(td);
      if (colIdx >= 0) {
        let visualColIdx = 0;
        for (let i = 0; i < colIdx; i++) {
          const span = parseInt(cells[i].getAttribute('colspan') || '1', 10) || 1;
          visualColIdx += span;
        }

        let headerRows = Array.from(table.querySelectorAll('thead tr'));
        if (headerRows.length === 0) {
          headerRows = Array.from(table.querySelectorAll('tr')).filter(r => r.querySelector('th'));
        }
        const headerRow = headerRows.length > 0 ? headerRows[headerRows.length - 1] : null;

        if (headerRow) {
          const visualHeaderMap = [];
          for (const th of Array.from(headerRow.querySelectorAll('th, td'))) {
            const span = parseInt(th.getAttribute('colspan') || '1', 10) || 1;
            for (let s = 0; s < span; s++) {
              visualHeaderMap.push({ cell: th, isMergedGroup: span > 1 });
            }
          }
          if (visualColIdx < visualHeaderMap.length) {
            const entry = visualHeaderMap[visualColIdx];
            if (!entry.isMergedGroup && entry.cell.tagName && entry.cell.tagName.toLowerCase() === 'th') {
              headerText = entry.cell.innerText || entry.cell.textContent || '';
            }
          }
        }
      }
    }

    return {
      headerText: headerText.trim(),
      labelText: labelText.trim()
    };
  }

  function resolveElementPolarity(element, docRef) {
    const info = getCheckboxHeaderAndLabel(element, docRef);
    return resolveCheckboxPolarity(info.headerText) || resolveCheckboxPolarity(info.labelText) || null;
  }

  return {
    normalizeText,
    resolveCheckboxPolarity,
    determineTargetChecked,
    resolveAttendancePolarity,
    getCheckboxHeaderAndLabel,
    resolveElementPolarity
  };
}));
