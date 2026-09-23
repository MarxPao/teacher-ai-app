/**
 * teacher-extension/portal_dom_reader.js
 * Módulo consolidado de leitura e inspeção semântica de DOM para portais escolares.
 * Isomórfico: funciona em Content Scripts, Background Scripts (importScripts / executeScript),
 * Side Panel e suítes de testes Node/Vitest.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const normalizer = typeof require !== 'undefined' ? require('./portal_normalizer.js') : null;
    module.exports = factory(normalizer || (typeof globalThis !== 'undefined' ? globalThis.PortalNormalizer : null));
  } else {
    const normalizer = typeof globalThis !== 'undefined' ? globalThis.PortalNormalizer : null;
    const exports = factory(normalizer);
    if (typeof globalThis !== 'undefined') {
      globalThis.PortalDOMReader = exports;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PortalNormalizer) {
  'use strict';

  // Fallbacks seguros se PortalNormalizer não estiver imediatamente disponível
  const normalizer = PortalNormalizer || {
    cleanNormalizeString: (s) => (s ? String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : ''),
    normalizeStudentName: (s) => (s ? String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim() : ''),
    normalizeBrazilianWeekday: (s) => {
      if (!s) return null;
      const n = String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (/2\s*a|segunda|seg\b/i.test(n)) return { name: '2ª-feira (Segunda)', key: 'segunda' };
      if (/3\s*a|terca|ter\b/i.test(n)) return { name: '3ª-feira (Terça)', key: 'terca' };
      if (/4\s*a|quarta|qua\b/i.test(n)) return { name: '4ª-feira (Quarta)', key: 'quarta' };
      if (/5\s*a|quinta|qui\b/i.test(n)) return { name: '5ª-feira (Quinta)', key: 'quinta' };
      if (/6\s*a|sexta|sex\b/i.test(n)) return { name: '6ª-feira (Sexta)', key: 'sexta' };
      if (/sabado|sab\b/i.test(n)) return { name: 'Sábado', key: 'sabado' };
      if (/domingo|dom\b/i.test(n)) return { name: 'Domingo', key: 'domingo' };
      return null;
    },
    extractWeekdayFromText: (s) => {
      if (!s) return null;
      const n = String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (/segunda/i.test(n)) return { name: '2ª-feira (Segunda)', key: 'segunda' };
      if (/terca/i.test(n)) return { name: '3ª-feira (Terça)', key: 'terca' };
      if (/quarta/i.test(n)) return { name: '4ª-feira (Quarta)', key: 'quarta' };
      if (/quinta/i.test(n)) return { name: '5ª-feira (Quinta)', key: 'quinta' };
      if (/sexta/i.test(n)) return { name: '6ª-feira (Sexta)', key: 'sexta' };
      if (/sabado/i.test(n)) return { name: 'Sábado', key: 'sabado' };
      if (/domingo/i.test(n)) return { name: 'Domingo', key: 'domingo' };
      return null;
    },
    normalizeGrade: (val) => {
      if (val === null || val === undefined || val === '') return null;
      const num = parseFloat(String(val).replace(',', '.'));
      if (isNaN(num)) return null;
      if (num > 10 && num <= 100) return parseFloat((num / 10).toFixed(1));
      return parseFloat(num.toFixed(1));
    }
  };

  /**
   * Verifica visibilidade computada de um elemento (evita ler elementos ocultos)
   */
  function isElementVisible(el) {
    if (!el) return false;
    if (typeof window === 'undefined') return true; // ambiente de teste sem layout
    if (el.nodeType !== 1) return false;
    try {
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
        return false;
      }
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (rect && (rect.width === 0 && rect.height === 0)) {
        if (!el.getClientRects || el.getClientRects().length === 0) return false;
      }
    } catch (e) {
      // Ignora falhas em emuladores parciais de DOM
    }
    return true;
  }

  /**
   * Extrai valor representativo de um elemento de célula ou entrada de tabela
   */
  function getCellTextOrValue(cell) {
    if (!cell) return '';
    const input = cell.querySelector ? cell.querySelector('input:not([type="hidden"]), select, textarea, [contenteditable="true"]') : null;
    if (input) {
      if (input.type === 'checkbox') {
        return input.checked ? '[X]' : '[ ]';
      }
      if (input.tagName === 'SELECT') {
        const selected = input.options && input.selectedIndex >= 0 ? input.options[input.selectedIndex] : null;
        return (selected ? selected.text || selected.value : input.value || '').trim();
      }
      if (input.isContentEditable) {
        return (input.innerText || input.textContent || '').trim();
      }
      return (input.value || cell.innerText || cell.textContent || '').trim();
    }
    return (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Lê uma única tabela HTML ou grid ARIA ([role="table"], [role="grid"])
   */
  function readTable(tableEl, options = {}) {
    if (!tableEl) return null;

    const onlyVisible = options.onlyVisible !== false;
    if (onlyVisible && !isElementVisible(tableEl)) return null;

    let headers = [];
    const rows = [];
    const rawRows = [];

    // 1. Tenta extrair headers de thead th, th
    const thEls = Array.from(tableEl.querySelectorAll ? tableEl.querySelectorAll('thead th, th, [role="columnheader"]') : []);
    headers = thEls.map(th => (th.innerText || th.textContent || '').trim()).filter(Boolean);

    // 2. Se vazio, verifica thead tr:first-child td
    if (headers.length === 0) {
      const theadTds = Array.from(tableEl.querySelectorAll ? tableEl.querySelectorAll('thead tr:first-child td') : []);
      if (theadTds.length > 0) {
        headers = theadTds.map(td => (td.innerText || td.textContent || '').trim()).filter(Boolean);
      }
    }

    // 3. Extrai linhas tr ou [role="row"]
    const trElements = Array.from(tableEl.querySelectorAll ? tableEl.querySelectorAll('tr, [role="row"]') : []);
    const seenTrs = new Set();

    for (const tr of trElements) {
      if (seenTrs.has(tr)) continue;
      seenTrs.add(tr);
      if (onlyVisible && !isElementVisible(tr)) continue;

      const cells = Array.from(tr.querySelectorAll ? tr.querySelectorAll('th, td, [role="cell"], [role="gridcell"]') : []);
      if (cells.length === 0) continue;

      const cellTexts = cells.map(c => getCellTextOrValue(c));
      if (cellTexts.some(txt => txt.length > 0)) {
        rows.push(cellTexts);
        rawRows.push({ element: tr, cells, texts: cellTexts });
      }
    }

    // 4. Promoção de primeira linha para headers se não houver tags <th>
    if (headers.length === 0 && rows.length > 1) {
      headers = rows[0];
      rows.shift();
      rawRows.shift();
    } else if (headers.length > 0 && rows.length > 0) {
      // Deduplica primeira linha se for idêntica ao header
      const matchesHeader = headers.length === rows[0].length &&
        headers.every((h, i) => normalizer.cleanNormalizeString(h) === normalizer.cleanNormalizeString(rows[0][i]));
      if (matchesHeader) {
        rows.shift();
        rawRows.shift();
      }
    }

    return {
      id: tableEl.id || tableEl.getAttribute?.('data-id') || 'tabela',
      className: tableEl.className || '',
      headers,
      rows,
      rawRows
    };
  }

  /**
   * Calcula a data YYYY-MM-DD para o próximo dia da semana
   */
  function getUpcomingDateForWeekday(weekdayKey, referenceDate = new Date()) {
    const map = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
    const targetDay = map[weekdayKey];
    if (targetDay === undefined) {
      return referenceDate.toISOString().split('T')[0];
    }
    const currentDay = referenceDate.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) {
      diff += 7; // Próxima semana se o dia já passou na semana atual
    }
    const result = new Date(referenceDate);
    result.setDate(referenceDate.getDate() + diff);
    return result.toISOString().split('T')[0];
  }

  /**
   * Extrai horários e eventos estruturados de calendário (UnifiedCalendarEvent[])
   */
  function extractScheduleEvents(docOrTables, options = {}) {
    const referenceDate = options.referenceDate || new Date();
    const events = [];
    const seenEventKeys = new Set();

    let tables = [];
    let cards = [];

    // Permite receber tanto um array de tabelas processadas quanto um Document
    if (Array.isArray(docOrTables)) {
      tables = docOrTables;
    } else if (docOrTables && docOrTables.tables) {
      tables = docOrTables.tables;
      cards = docOrTables.cards || [];
    } else if (docOrTables && docOrTables.querySelectorAll) {
      const tableEls = Array.from(docOrTables.querySelectorAll('table, [role="table"], [role="grid"]'));
      tables = tableEls.map(t => readTable(t)).filter(Boolean);
      cards = Array.from(docOrTables.querySelectorAll('.recado-card, .card, [class*="card"]'))
        .filter(isElementVisible)
        .map(c => (c.innerText || c.textContent || '').trim())
        .filter(Boolean);
    }

    // ── Estratégia 1: Grade Horizontal de Horários (dias nas colunas) ──
    for (const table of tables) {
      const headers = table.headers || [];
      const rows = table.rows || [];

      // Detecta colunas correspondentes a dias da semana
      const dayCols = [];
      headers.forEach((h, idx) => {
        const matched = normalizer.normalizeBrazilianWeekday(h);
        if (matched) {
          dayCols.push({ ...matched, colIdx: idx });
        }
      });

      // Se achou pelo menos 2 dias nas colunas, é uma grade horizontal
      if (dayCols.length >= 2) {
        for (const row of rows) {
          const rawSlot = row[0] || '';
          const timeMatch = rawSlot.match(/(\d{1,2}:\d{2})\s*(?:às|as|-|a)\s*(\d{1,2}:\d{2})/i) ||
                            rawSlot.match(/(\d{1,2}:\d{2})/);
          const startTime = timeMatch ? timeMatch[1] : '';
          const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';

          for (const col of dayCols) {
            const cell = (row[col.colIdx] || '').trim();
            if (!cell || ['-', '—', 'livre', 'folga', 'sem aula'].includes(cell.toLowerCase())) continue;

            const dateStr = getUpcomingDateForWeekday(col.key, referenceDate);
            const eventKey = `${col.key}_${startTime}_${cell}`;
            if (seenEventKeys.has(eventKey)) continue;
            seenEventKeys.add(eventKey);

            // Decompõe a célula em Disciplina e Turma se possível (ex: "Matemática - 9º Ano A")
            let subject = cell;
            let className = '';
            let room = '';

            const parts = cell.split(/\s*[-–—|]\s*/);
            if (parts.length >= 2) {
              subject = parts[0].trim();
              className = parts[1].trim();
              if (parts.length >= 3) room = parts[2].trim();
            }

            events.push({
              id: `evt_sch_${events.length + 1}_${Date.now()}`,
              title: `${subject}${className ? ` - ${className}` : ''}`,
              date: dateStr,
              dayOfWeek: col.key,
              startTime: startTime || '07:30',
              endTime: endTime || '',
              subject: subject,
              className: className,
              room: room,
              description: `Aula de ${subject}${className ? ` para ${className}` : ''}${startTime ? ` às ${startTime}` : ''}`,
              type: 'aula',
              source: 'portal_horarios',
              rawText: cell
            });
          }
        }
      }

      // ── Estratégia 2: Tabela Lista Linear (Colunas: Dia | Horário | Turma | Disciplina) ──
      const colDia = headers.findIndex(h => /dia|semana/i.test(normalizer.cleanNormalizeString(h)));
      const colHora = headers.findIndex(h => /hor[aá]rio|tempo|per[ií]odo|inicio/i.test(normalizer.cleanNormalizeString(h)));
      const colTurma = headers.findIndex(h => /turma|classe|ano/i.test(normalizer.cleanNormalizeString(h)));
      const colDisc = headers.findIndex(h => /disciplina|mat[eé]ria|aula/i.test(normalizer.cleanNormalizeString(h)));
      const isLinearSchedule = (colDia >= 0 || colHora >= 0) && (colDisc >= 0 || colTurma >= 0);

      if (dayCols.length < 2 && isLinearSchedule) {
        for (const row of rows) {
          const dayText = colDia >= 0 ? row[colDia] : '';
          const matchedDay = normalizer.extractWeekdayFromText(dayText) || normalizer.normalizeBrazilianWeekday(dayText);
          const dayKey = matchedDay ? matchedDay.key : 'segunda';
          const dateStr = getUpcomingDateForWeekday(dayKey, referenceDate);

          const horaText = colHora >= 0 ? row[colHora] : '';
          const timeMatch = (horaText || '').match(/(\d{1,2}:\d{2})\s*(?:às|as|-|a)\s*(\d{1,2}:\d{2})/i) || (horaText || '').match(/(\d{1,2}:\d{2})/);

          const turma = colTurma >= 0 ? (row[colTurma] || '').trim() : '';
          const disc = colDisc >= 0 ? (row[colDisc] || '').trim() : (row[0] || 'Aula');

          if (disc && !/^(total|observ|legenda)/i.test(disc)) {
            events.push({
              id: `evt_sch_${events.length + 1}_${Date.now()}`,
              title: `${disc}${turma ? ` - ${turma}` : ''}`,
              date: dateStr,
              dayOfWeek: dayKey,
              startTime: timeMatch ? timeMatch[1] : '07:30',
              endTime: timeMatch && timeMatch[2] ? timeMatch[2] : '',
              subject: disc,
              className: turma,
              description: `Aula de ${disc}${turma ? ` - ${turma}` : ''}`,
              type: 'aula',
              source: 'portal_horarios',
              rawText: row.join(' | ')
            });
          }
        }
      } else if (dayCols.length < 2 && rows.length >= 2) {
        // ── Estratégia 3: Grade Vertical (dias na primeira coluna de cada linha) ──
        let isVerticalSchedule = false;
        const verticalRows = [];

        rows.forEach((r) => {
          const cell0 = r[0] || '';
          const matched = normalizer.normalizeBrazilianWeekday(cell0);
          if (matched) {
            verticalRows.push({ ...matched, cells: r.slice(1) });
          }
        });

        if (verticalRows.length >= 2) {
          isVerticalSchedule = true;
          for (const vr of verticalRows) {
            const dateStr = getUpcomingDateForWeekday(vr.key, referenceDate);
            for (let cIdx = 0; cIdx < vr.cells.length; cIdx++) {
              const cell = vr.cells[cIdx];
              const cleanCell = (cell || '').trim();
              if (!cleanCell || ['-', '—', 'livre', 'folga', 'sem aula'].includes(cleanCell.toLowerCase())) continue;

              const timeMatch = cleanCell.match(/(\d{1,2}:\d{2})\s*(?:às|as|-|a)\s*(\d{1,2}:\d{2})/i) ||
                                (headers[cIdx + 1] || '').match(/(\d{1,2}:\d{2})\s*(?:às|as|-|a)\s*(\d{1,2}:\d{2})/i);

              const startTime = timeMatch ? timeMatch[1] : '';
              const endTime = timeMatch && timeMatch[2] ? timeMatch[2] : '';
              const eventKey = `${vr.key}_${startTime || cIdx}_${cleanCell}`;
              if (seenEventKeys.has(eventKey)) continue;
              seenEventKeys.add(eventKey);

              events.push({
                id: `evt_sch_${events.length + 1}_${Date.now()}`,
                title: cleanCell,
                date: dateStr,
                dayOfWeek: vr.key,
                startTime: startTime || '07:30',
                endTime: endTime || '',
                subject: cleanCell,
                className: '',
                description: `Aula de ${cleanCell} na ${vr.name}`,
                type: 'aula',
                source: 'portal_horarios',
                rawText: cleanCell
              });
            }
          }
        }
      }
    }

    // ── Estratégia 4: Cards de Horário ──
    if (events.length === 0 && cards.length > 0) {
      for (const card of cards) {
        const matchedDay = normalizer.extractWeekdayFromText(card);
        const timeMatch = card.match(/(\d{1,2}:\d{2})\s*(?:às|as|-|a)\s*(\d{1,2}:\d{2})/i) || card.match(/(\d{1,2}:\d{2})/);
        if (matchedDay && timeMatch) {
          const dateStr = getUpcomingDateForWeekday(matchedDay.key, referenceDate);
          const cleanInfo = card.replace(timeMatch[0], '').replace(/^[–—: -]+/, '').trim();
          events.push({
            id: `evt_sch_card_${events.length + 1}_${Date.now()}`,
            title: cleanInfo || 'Aula Agendada',
            date: dateStr,
            dayOfWeek: matchedDay.key,
            startTime: timeMatch[1],
            endTime: timeMatch[2] || '',
            subject: cleanInfo,
            className: '',
            description: `Aula agendada para ${matchedDay.name}`,
            type: 'aula',
            source: 'portal_horarios',
            rawText: card
          });
        }
      }
    }

    return events;
  }

  /**
   * Extrai estudantes da página unificando tabelas, cartões e listas (UnifiedStudent[])
   */
  function extractStudents(doc, options = {}) {
    if (!doc || !doc.querySelectorAll) return [];

    const students = [];
    const seenNames = new Set();

    function addStudent(name, matricula, rawSnippet, meta = {}) {
      if (!name) return;
      const cleanName = String(name).trim().replace(/\s+/g, ' ');
      const lower = cleanName.toLowerCase();

      // Filtra cabeçalhos e rótulos
      if (cleanName.length < 3 || cleanName.length > 80) return;
      if (/^(nome|aluno|estudante|matr[íi]cula|situa[çc][ãa]o|status|total|relat|a[çc][õo]es|turma|professor|perfil|c[óo]digo)$/i.test(lower)) return;
      if (seenNames.has(lower)) return;
      seenNames.add(lower);

      students.push({
        id: meta.id || `std_${students.length + 1}_${Date.now()}`,
        name: cleanName,
        matricula: (matricula || '').trim(),
        rowIndex: meta.rowIndex !== undefined ? meta.rowIndex : students.length,
        inputId: meta.inputId || null,
        inputType: meta.inputType || (meta.inputId ? 'input' : 'static_roster'),
        currentValue: meta.currentValue || '',
        rawSnippet: (rawSnippet || cleanName).slice(0, 100)
      });
    }

    // ── Estratégia 1: Tabelas de Alunos e Frequência ──
    const tables = Array.from(doc.querySelectorAll('table, [role="table"]')).filter(isElementVisible);
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr, [role="row"]')).filter(isElementVisible);
      if (rows.length < 2) continue;

      const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td, [role="columnheader"]'))
        .map(c => normalizer.cleanNormalizeString(c.innerText || c.textContent || ''));

      let nameCol = headerCells.findIndex(h => /nome|aluno|estudante|student/i.test(h));
      let matCol  = headerCells.findIndex(h => /matr|reg|cod|ra/i.test(h));

      if (nameCol === -1) {
        nameCol = 1; // Fallback comum: coluna 0 é número/ordem, coluna 1 é nome
      }

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = Array.from(row.querySelectorAll('td, th, [role="cell"]'));
        if (cells.length === 0) continue;

        const nameCell = cells[nameCol] || cells[0];
        const nameText = (nameCell ? nameCell.innerText || nameCell.textContent || '' : '').trim();
        const matText  = matCol >= 0 && cells[matCol] ? (cells[matCol].innerText || cells[matCol].textContent || '').trim() : '';

        // Procura primeiro input significativo na linha (para suporte a escrita rápida de presença/nota)
        const input = row.querySelector('input:not([type="hidden"]), select, [contenteditable="true"]');
        let currentVal = '';
        if (input) {
          if (input.type === 'checkbox') currentVal = input.checked ? 'Falta' : 'Presença';
          else if (input.tagName === 'SELECT') {
            const sel = input.options && input.selectedIndex >= 0 ? input.options[input.selectedIndex] : null;
            currentVal = (sel ? sel.text : input.value) || '';
          } else {
            currentVal = input.value || '';
          }
        }

        if (nameText && /^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(nameText)) {
          addStudent(nameText, matText, row.innerText || row.textContent, {
            rowIndex: i,
            inputId: input ? input.id || input.name || `row_input_${i}` : null,
            inputType: input ? input.type || input.tagName.toLowerCase() : null,
            currentValue: currentVal
          });
        }
      }

      if (students.length >= 2) return students;
    }

    // ── Estratégia 2: Cartões de Alunos (div.grid-meus-alunos, .card-aluno, etc.) ──
    const cardContainers = Array.from(doc.querySelectorAll(
      'div.grid-meus-alunos, div.meus-alunos-grid, [class*="alunos" i], [class*="student" i], [class*="roster" i], main, #conteudo, .container'
    )).filter(isElementVisible);

    for (const container of cardContainers) {
      let cards = Array.from(container.querySelectorAll(
        '[class*="card" i], [class*="item" i], [class*="aluno" i], [class*="linha" i], [class*="row" i]'
      )).filter(c => {
        const t = (c.innerText || c.textContent || '').trim();
        return t.length >= 4 && t.length <= 400 && !c.querySelector('[class*="card" i]');
      });

      if (cards.length < 2) {
        cards = Array.from(container.children).filter(c => {
          const t = (c.innerText || c.textContent || '').trim();
          return t.length >= 4 && t.length <= 400;
        });
      }

      if (cards.length >= 2) {
        for (const card of cards) {
          const fullText = (card.innerText || card.textContent || '').trim();
          let name = '';
          let mat = '';

          const nameEl = card.querySelector(
            '[class*="nome" i], [class*="name" i], [class*="title" i], h1, h2, h3, h4, h5, strong, b'
          );
          if (nameEl) {
            const t = (nameEl.innerText || nameEl.textContent || '').trim();
            if (t.length >= 3 && /^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(t)) {
              name = t;
            }
          }

          if (!name) {
            const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
              if (/^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(line) && line.length >= 3 && !/^(matr|status|turma|aluno|nome)/i.test(line)) {
                name = line;
                break;
              }
            }
          }

          const matMatch = fullText.match(/(?:matr[íi]cula|c[óo]d(?:igo)?|ra|id)[:\s#]*([a-zA-Z0-9\-\.\/]+)/i);
          if (matMatch) mat = matMatch[1];

          if (name) addStudent(name, mat, fullText);
        }
      }
      if (students.length >= 2) return students;
    }

    // ── Estratégia 3: Listas padrão (ul > li, ol > li) ──
    const listItems = Array.from(doc.querySelectorAll('ul > li, ol > li')).filter(isElementVisible);
    if (listItems.length >= 2) {
      for (const li of listItems) {
        const t = (li.innerText || li.textContent || '').trim();
        const firstLine = t.split('\n')[0].trim();
        if (/^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(firstLine) && firstLine.length >= 3 && firstLine.length <= 60) {
          const matMatch = t.match(/(?:matr[íi]cula|c[óo]d|ra)[:\s#]*([a-zA-Z0-9]+)/i);
          addStudent(firstLine, matMatch ? matMatch[1] : '', t);
        }
      }
    }

    return students;
  }

  /**
   * Extrai notas associadas a estudantes e colunas de avaliação (UnifiedGradeItem[])
   */
  function extractGrades(doc, tables = []) {
    if (!tables || tables.length === 0) return [];
    const gradeItems = [];

    for (const table of tables) {
      const headers = table.headers || [];
      const rows = table.rows || [];
      if (headers.length < 2 || rows.length === 0) continue;

      // Localiza coluna de aluno
      const nameCol = headers.findIndex(h => /aluno|nome|estudante/i.test(normalizer.cleanNormalizeString(h)));
      if (nameCol === -1) continue;

      // Colunas que parecem avaliações ou notas
      const gradeCols = [];
      headers.forEach((h, idx) => {
        if (idx === nameCol) return;
        const normH = normalizer.cleanNormalizeString(h);
        if (/nota|p1|p2|p3|av\d*|prova|trabalho|m[eé]dia|recupera[çc][ãa]o|exame/i.test(normH)) {
          gradeCols.push({ colIdx: idx, name: h });
        }
      });

      if (gradeCols.length === 0) continue;

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const studentName = row[nameCol];
        if (!studentName || studentName.length < 3) continue;

        for (const gCol of gradeCols) {
          const rawVal = row[gCol.colIdx];
          const normG = normalizer.normalizeGrade(rawVal);
          if (normG !== null) {
            gradeItems.push({
              studentName: studentName.trim(),
              assessmentName: gCol.name.trim(),
              grade: normG,
              rawValue: rawVal,
              rowIndex: rIdx,
              colIndex: gCol.colIdx
            });
          }
        }
      }
    }

    return gradeItems;
  }

  /**
   * Lê a página completa do portal, extraindo tabelas, cartões, alunos, eventos e notas.
   */
  function readPortalPage(doc = (typeof document !== 'undefined' ? document : null)) {
    if (!doc) {
      return { sucesso: false, mensagem: 'Documento DOM não disponível.' };
    }

    // 1. Elementos de navegação e cabeçalho ativo
    const activeNavEl = doc.querySelector ? doc.querySelector(
      '.tab-btn.active, .nav-link.active, .menu-item.active, nav a.active, aside a.active, [aria-current="page"], .selected, a[class*="active"], li.active a, .sidebar a.active'
    ) : null;
    const activeNavText = activeNavEl ? (activeNavEl.innerText || activeNavEl.textContent || '').trim() : '';

    const pageHeadings = Array.from(doc.querySelectorAll ? doc.querySelectorAll('h1, h2, h3, .page-title, .titulo-pagina, .titulo, .header-title') : [])
      .filter(isElementVisible)
      .map(h => (h.innerText || h.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    const url = typeof window !== 'undefined' ? window.location.href : '';
    const urlLower = url.toLowerCase();

    // 2. Inferência inteligente da seção ativa
    let inferredSection = activeNavText;
    if (!inferredSection) {
      if (pageHeadings.length > 0 && pageHeadings[0].length < 40) {
        inferredSection = pageHeadings[0];
      } else if (/horario/i.test(urlLower)) {
        inferredSection = 'Horários';
      } else if (/frequencia|chamada/i.test(urlLower)) {
        inferredSection = 'Frequência';
      } else if (/nota|boletim/i.test(urlLower)) {
        inferredSection = 'Notas';
      } else if (/aluno|estudante/i.test(urlLower)) {
        inferredSection = 'Alunos';
      } else if (/recado|comunicado/i.test(urlLower)) {
        inferredSection = 'Recados';
      } else if (/diario|conteudo/i.test(urlLower)) {
        inferredSection = 'Conteúdo ministrado';
      }
    }

    const activeTab = inferredSection || activeNavText || (pageHeadings[0] || '');

    // 3. Extração de tabelas
    const tableEls = Array.from(doc.querySelectorAll ? doc.querySelectorAll('table') : []).filter(isElementVisible);
    const tables = tableEls.map(t => readTable(t)).filter(t => t && (t.headers.length > 0 || t.rows.length > 0));

    // Fallback para ARIA grid se não houver <table>
    if (tables.length === 0) {
      const gridContainers = Array.from(doc.querySelectorAll ? doc.querySelectorAll('[role="table"], [role="grid"], .grade-horarios, .tabela-horarios') : []).filter(isElementVisible);
      for (const gc of gridContainers) {
        const tbl = readTable(gc);
        if (tbl && (tbl.headers.length > 0 || tbl.rows.length > 0)) {
          tables.push(tbl);
        }
      }
    }

    // 4. Extração de cards
    const cards = Array.from(doc.querySelectorAll ? doc.querySelectorAll('.recado-card, .card, [class*="card"]') : [])
      .filter(isElementVisible)
      .map(c => (c.innerText || c.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 15);

    // 5. Extração de inputs para inspeção rápida
    const inputs = Array.from(doc.querySelectorAll ? doc.querySelectorAll('input, select, textarea') : []).filter(el => {
      if (el.type === 'hidden' && !el.name && !el.id) return false;
      return isElementVisible(el);
    }).map(el => ({
      tagName: el.tagName,
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      value: el.value
    }));

    // 6. Extração semântica de entidades
    const students = extractStudents(doc);
    const events = extractScheduleEvents({ tables, cards });
    const grades = extractGrades(doc, tables);

    // 7. Determina domínio predominante
    let detectedDomain = 'general';
    if (events.length > 0 || /horario/i.test(activeTab)) {
      detectedDomain = 'schedule';
    } else if (grades.length > 0 || /nota|boletim/i.test(activeTab)) {
      detectedDomain = 'grades';
    } else if (students.length > 0 || /aluno|frequencia|chamada/i.test(activeTab)) {
      detectedDomain = 'roster';
    }

    return {
      sucesso: true,
      activeTab,
      pageTitle: (doc.title || '').trim(),
      pageHeadings,
      url,
      tables,
      cards,
      inputsCount: inputs.length,
      students,
      events,
      grades,
      detectedDomain,
      timestamp: Date.now()
    };
  }

  /**
   * Agrega resultados de múltiplos iframes sem perda de dados e sem duplicatas
   */
  function aggregateFrameResults(frameResults) {
    const valid = (frameResults || []).map(r => (r && r.result ? r.result : r)).filter(r => r && r.sucesso);
    if (valid.length === 0) {
      return { sucesso: false, mensagem: 'Nenhum dado válido extraído dos frames.' };
    }

    const primary = valid.find(r => (r.tables && r.tables.length > 0) || (r.events && r.events.length > 0) || (r.students && r.students.length > 0)) || valid[0];

    const allTables = [];
    const seenTableSigs = new Set();
    const allStudents = [];
    const seenStudentNames = new Set();
    const allEvents = [];
    const seenEventKeys = new Set();
    const allGrades = [];

    for (const fr of valid) {
      if (fr.tables) {
        for (const t of fr.tables) {
          const sig = (t.headers || []).join('|') + '::' + (t.rows ? t.rows.length : 0);
          if (!seenTableSigs.has(sig)) {
            seenTableSigs.add(sig);
            allTables.push(t);
          }
        }
      }
      if (fr.students) {
        for (const s of fr.students) {
          const k = normalizer.cleanNormalizeString(s.name);
          if (!seenStudentNames.has(k)) {
            seenStudentNames.add(k);
            allStudents.push(s);
          }
        }
      }
      if (fr.events) {
        for (const ev of fr.events) {
          const k = `${ev.dayOfWeek}_${ev.startTime}_${ev.title}`;
          if (!seenEventKeys.has(k)) {
            seenEventKeys.add(k);
            allEvents.push(ev);
          }
        }
      }
      if (fr.grades) {
        allGrades.push(...fr.grades);
      }
    }

    return {
      ...primary,
      tables: allTables,
      students: allStudents.length > 0 ? allStudents : primary.students || [],
      events: allEvents.length > 0 ? allEvents : primary.events || [],
      grades: allGrades.length > 0 ? allGrades : primary.grades || []
    };
  }

  return {
    isElementVisible,
    getCellTextOrValue,
    readTable,
    getUpcomingDateForWeekday,
    extractScheduleEvents,
    extractStudents,
    extractGrades,
    readPortalPage,
    aggregateFrameResults
  };
});
