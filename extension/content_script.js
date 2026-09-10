/**
 * content_script.js — Gravador de Eventos de Navegação e Leitura
 *
 * Captura cliques e snapshots de DOM da página de portal.
 * Âncoras registradas por prioridade:
 *   1. aria-label (semântica de acessibilidade)
 *   2. role ARIA + texto visível
 *   3. posição em tabela/lista (3ª linha, coluna "Nome")
 *   4. seletor CSS único como fallback
 *
 * NUNCA registra coordenadas de pixel como âncora primária.
 *
 * Ao "Parar Gravação", também captura snapshot dos dados visíveis na tabela/lista
 * principal, marcando candidatos a variável (nome, matrícula, etc.).
 */

;(function () {
  'use strict'

  // ── Estado interno ──────────────────────────────────────────────────────────
  let recording    = false
  let events       = []
  let portalId     = 'unknown_portal'
  let taskId       = 'unknown_task'
  let eventCounter = 0

  // ── Utilidades de âncora ───────────────────────────────────────────────────

  /**
   * Gera um seletor CSS único e estável para um elemento.
   * Prioriza: id > [data-*] > nth-child reverso a partir do body.
   */
  function getCssSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`
    const parts = []
    let cur = el
    while (cur && cur !== document.body) {
      let seg = cur.tagName.toLowerCase()
      if (cur.id) {
        seg = `#${CSS.escape(cur.id)}`
        parts.unshift(seg)
        break
      }
      const siblings = Array.from(cur.parentNode?.children || []).filter(
        c => c.tagName === cur.tagName
      )
      if (siblings.length > 1) {
        seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`
      }
      parts.unshift(seg)
      cur = cur.parentNode
    }
    return parts.join(' > ') || el.tagName.toLowerCase()
  }

  /**
   * Extrai a posição semântica do elemento dentro de uma tabela ou lista.
   */
  function getTablePosition(el) {
    const td = el.closest('td, th')
    if (!td) return null
    const tr = td.closest('tr')
    if (!tr) return null

    const table = tr.closest('table')
    const rows  = table ? Array.from(table.querySelectorAll('tbody tr, tr')) : []
    const rowIdx = rows.indexOf(tr) + 1

    const cells = Array.from(tr.querySelectorAll('td, th'))
    const colIdx = cells.indexOf(td) + 1

    // Tenta descobrir o nome da coluna pelo <th> correspondente
    const headers = table ? Array.from(table.querySelectorAll('thead th, tr:first-child th')) : []
    const colName = headers[colIdx - 1]?.innerText?.trim() || `Coluna ${colIdx}`

    return { row: rowIdx, col: colIdx, colName }
  }

  /**
   * Monta o objeto de âncora para um elemento, seguindo hierarquia de prioridade.
   */
  function buildAnchor(el) {
    const ariaLabel = el.getAttribute('aria-label')?.trim()
    if (ariaLabel) return { strategy: 'aria_label', value: ariaLabel }

    const role = el.getAttribute('role')?.trim()
    const text = el.innerText?.trim().slice(0, 80)
    if (role && text) return { strategy: 'semantic_role', value: `${role}:${text}` }

    if (text && text.length > 0 && text.length <= 60)
      return { strategy: 'text_match', value: text }

    const tpos = getTablePosition(el)
    if (tpos)
      return {
        strategy: 'css_selector',
        value:    getCssSelector(el),
        description: `Linha ${tpos.row}, ${tpos.colName}`
      }

    return { strategy: 'css_selector', value: getCssSelector(el) }
  }

  /**
   * Captura snapshot do texto de um elemento de tabela/lista para detecção de variáveis.
   * Não registra o valor — apenas a estrutura e o tipo do dado.
   */
  function snapshotTableRows() {
    const tables = Array.from(document.querySelectorAll('table'))
    const candidates = []

    tables.forEach((table, tIdx) => {
      const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th'))
        .map(th => th.innerText.trim())

      const bodyRows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'))
      bodyRows.slice(0, 5).forEach((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('td, th'))
        cells.forEach((cell, cIdx) => {
          const rawText = cell.innerText.trim()
          if (!rawText) return
          const headerName = headers[cIdx] || `col_${cIdx}`
          candidates.push({
            tableIdx: tIdx,
            row:      rIdx,
            col:      cIdx,
            header:   headerName,
            sample:   rawText.slice(0, 40),
            anchor:   buildAnchor(cell),
            css:      getCssSelector(cell)
          })
        })
      })
    })

    return candidates
  }

  // ── Capturador de cliques ──────────────────────────────────────────────────

  function onClickCapture(e) {
    if (!recording) return
    const el = e.target
    const anchor = buildAnchor(el)
    const tpos   = getTablePosition(el)

    eventCounter++
    const ev = {
      eventId:   eventCounter,
      type:      'CLICK',
      timestamp: Date.now(),
      url:       window.location.href,
      anchor,
      tablePosition: tpos,
      tagName:   el.tagName.toLowerCase(),
      ariaLabel: el.getAttribute('aria-label') || null,
      role:      el.getAttribute('role') || null,
      text:      el.innerText?.trim().slice(0, 80) || null,
      isLink:    el.tagName === 'A' || el.closest('a') !== null,
    }
    events.push(ev)
    console.debug('[TeacherAI Recorder]', ev)
  }

  /**
   * Captura a URL de destino de navegações (popstate / hashchange / click em link).
   */
  function onNavigation(nextUrl) {
    if (!recording) return
    eventCounter++
    events.push({
      eventId:   eventCounter,
      type:      'NAVIGATE',
      timestamp: Date.now(),
      url:       nextUrl || window.location.href,
      anchor:    null
    })
  }

  document.addEventListener('click', onClickCapture, { capture: true, passive: true })
  window.addEventListener('popstate', () => onNavigation(window.location.href), { passive: true })

  // ── Listener de mensagens do background/popup ──────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.from !== 'popup') return

    if (msg.type === 'START_RECORDING') {
      recording    = true
      events       = []
      eventCounter = 0
      portalId     = msg.portalId || 'unknown_portal'
      taskId       = msg.taskId   || 'read_roster'

      // Registra o estado inicial da página como NAVIGATE implícito
      onNavigation(window.location.href)

      sendResponse({ ok: true })
      return true
    }

    if (msg.type === 'STOP_RECORDING') {
      recording = false

      // Captura snapshot das tabelas visíveis no momento do stop
      const tableSnapshot = snapshotTableRows()

      // Adiciona evento READ sintético para cada candidato a variável encontrado
      tableSnapshot.forEach((cell, idx) => {
        eventCounter++
        events.push({
          eventId:      eventCounter,
          type:         'READ',
          timestamp:    Date.now(),
          url:          window.location.href,
          anchor:       cell.anchor,
          columnHeader: cell.header,
          sampleValue:  cell.sample,
          tableRow:     cell.row,
          tableCol:     cell.col,
          isVariableCandidate: /nome|aluno|estudante|matricul|registro|student|name|enroll/i
            .test(cell.header + ' ' + cell.sample)
        })
      })

      sendResponse({
        ok:      true,
        events,
        portalId,
        taskId,
        pageUrl: window.location.href
      })
      return true
    }

    if (msg.type === 'GET_COUNT') {
      sendResponse({ count: events.length })
      return true
    }
  })

  console.info('[TeacherAI Recorder] Content script carregado. Aguardando comando de gravacao...')
})()
