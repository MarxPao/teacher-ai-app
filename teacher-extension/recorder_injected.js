// teacher-extension/recorder_injected.js
// @deprecated Gravador legado injetável. O gravador canônico de produção é compilado
// a partir de lib/recorder-dom/extensionEntry.ts para teacher-extension/dist/recorder.bundle.js.
// Mantido para compatibilidade retroativa em ambientes sem suporte a bundles modulares.

(function () {
  if (window.__TEACHER_AI_RECORDING_ACTIVE__) {
    console.log('[TeacherAI Recorder] Gravação já ativa nesta aba.')
    return
  }

  window.__TEACHER_AI_RECORDING_ACTIVE__ = true
  const startedAt = Date.now()
  const steps = []

  // Banner flutuante no topo do portal
  const banner = document.createElement('div')
  banner.id = '__teacher_ai_recorder_banner__'
  banner.style.position = 'fixed'
  banner.style.top = '12px'
  banner.style.left = '50%'
  banner.style.transform = 'translateX(-50%)'
  banner.style.zIndex = '2147483647'
  banner.style.background = '#0f172a'
  banner.style.color = '#f8fafc'
  banner.style.padding = '8px 18px'
  banner.style.borderRadius = '24px'
  banner.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
  banner.style.fontFamily = 'system-ui, sans-serif'
  banner.style.fontSize = '12px'
  banner.style.fontWeight = '600'
  banner.style.display = 'flex'
  banner.style.alignItems = 'center'
  banner.style.gap = '8px'
  banner.style.pointerEvents = 'none'
  banner.style.border = '1px solid rgba(239, 68, 68, 0.4)'
  banner.innerHTML = `
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;"></span>
    <span>Gravando demonstração Teacher AI</span>
    <span id="__teacher_ai_recorder_count__" style="background:rgba(255,255,255,0.15);padding:2px 8px;border-radius:12px;font-size:11px;">0 passos</span>
  `
  document.body.appendChild(banner)

  function updateCount() {
    const countEl = document.getElementById('__teacher_ai_recorder_count__')
    if (countEl) countEl.textContent = `${steps.length} passo${steps.length === 1 ? '' : 's'}`
  }

  function scrubText(text) {
    if (!text) return ''
    let scrubbed = String(text).trim()
    // Mascara CPFs
    scrubbed = scrubbed.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_PROTEGIDO]')
    // Mascara e-mails
    scrubbed = scrubbed.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[EMAIL_PROTEGIDO]')
    return scrubbed.slice(0, 200)
  }

  function buildCandidates(el) {
    const candidates = []
    const role = el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : el.tagName === 'A' ? 'link' : undefined)
    const accessibleName = el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || ''

    if (role && accessibleName.trim()) {
      candidates.push({
        strategy: 'role_name',
        role,
        name: scrubText(accessibleName),
        match: 'normalized',
      })
    }

    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel && ariaLabel.trim()) {
      candidates.push({
        strategy: 'aria_label',
        aria_label: scrubText(ariaLabel),
        match: 'normalized',
      })
    }

    const placeholder = el.getAttribute('placeholder')
    if (placeholder && placeholder.trim()) {
      candidates.push({
        strategy: 'placeholder',
        placeholder: scrubText(placeholder),
        match: 'normalized',
      })
    }

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test')
    if (testId) {
      candidates.push({
        strategy: 'test_id',
        test_id: testId.trim(),
        match: 'exact',
      })
    }

    const textContent = el.innerText || el.textContent || ''
    if (textContent.trim() && textContent.length < 40) {
      candidates.push({
        strategy: 'text',
        text: scrubText(textContent),
        match: 'normalized',
      })
    }

    if (el.id) {
      candidates.push({
        strategy: 'css',
        selector: `#${CSS.escape(el.id)}`,
      })
    }

    return candidates.slice(0, 5)
  }

  function buildElementDescriptor(el) {
    const tag = el.tagName.toLowerCase()
    const desc = {
      tag,
      classes: Array.from(el.classList || []),
      candidates: buildCandidates(el),
    }

    if (el.id) desc.id = el.id
    if (el.type) desc.type = el.type
    if (el.name) desc.name = el.name
    if (el.getAttribute('aria-label')) desc.aria_label = scrubText(el.getAttribute('aria-label'))
    if (el.getAttribute('placeholder')) desc.placeholder = scrubText(el.getAttribute('placeholder'))
    if (el.innerText) desc.text = scrubText(el.innerText)

    // Detecção de contexto de linha se estiver dentro de uma tabela
    const tr = el.closest('tr')
    if (tr) {
      const table = tr.closest('table')
      const headers = []
      if (table) {
        const ths = table.querySelectorAll('th')
        ths.forEach((th) => headers.push(scrubText(th.innerText || th.textContent || '')))
      }
      const cells = []
      tr.querySelectorAll('td, th').forEach((cell) => {
        cells.push(scrubText(cell.innerText || cell.textContent || ''))
      })
      const cellIndex = el.closest('td, th') ? Array.from(tr.children).indexOf(el.closest('td, th')) : 0
      desc.rowContext = {
        headers,
        column_index: cellIndex,
        cells: cells.slice(0, 10),
      }
    }

    return desc
  }

  function handleClick(e) {
    if (e.isTrusted === false) return
    if (!e.target || e.target.closest('#__teacher_ai_recorder_banner__')) return
    const el = e.target
    const descriptor = buildElementDescriptor(el)

    steps.push({
      id: 'step_' + steps.length,
      type: 'click',
      at: Date.now(),
      host: window.location.hostname,
      path: window.location.pathname,
      target: descriptor,
    })
    updateCount()
  }

  function handleChange(e) {
    if (e.isTrusted === false) return
    if (!e.target || e.target.closest('#__teacher_ai_recorder_banner__')) return
    const el = e.target
    const descriptor = buildElementDescriptor(el)
    const val = el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : scrubText(el.value)

    steps.push({
      id: 'step_' + steps.length,
      type: 'input',
      at: Date.now(),
      host: window.location.hostname,
      path: window.location.pathname,
      target: descriptor,
      value: el.type === 'password' ? '[SENSITIVE_DATA_REDACTED]' : val,
    })
    updateCount()
  }

  function handleKeyDown(e) {
    if (e.isTrusted === false) return
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      steps.push({
        id: 'step_' + steps.length,
        type: 'key',
        key: e.key,
        at: Date.now(),
        host: window.location.hostname,
        path: window.location.pathname,
      })
      updateCount()
    }
  }

  document.addEventListener('click', handleClick, true)
  document.addEventListener('change', handleChange, true)
  document.addEventListener('keydown', handleKeyDown, true)

  window.__TEACHER_AI_STOP_RECORDING__ = function () {
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('change', handleChange, true)
    document.removeEventListener('keydown', handleKeyDown, true)
    const el = document.getElementById('__teacher_ai_recorder_banner__')
    if (el) el.remove()
    window.__TEACHER_AI_RECORDING_ACTIVE__ = false

    const trace = {
      trace_version: '1.0',
      task_id: window.__TEACHER_AI_TASK_ID__ || 'custom_task',
      portal_id: window.location.hostname.replace(/[^a-zA-Z0-9_]/g, '_'),
      started_at: startedAt,
      finished_at: Date.now(),
      steps,
    }
    return trace
  }

  console.log('[TeacherAI Recorder] Gravador injetado com sucesso na página.')
})()
