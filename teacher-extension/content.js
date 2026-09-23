/**
 * TEACHER??? – Agente Content Script v3.0 (Rafinha Web Operator)
 * Injected into school portal pages.
 * Handles: EXECUTE_PORTAL_ACTION (Diários, Chamadas, Notas, Tarefas)
 * Supports: Supervised Mode & Autonomous Mode (with auto-submit & voice feedback)
 */

console.log("%c🔌 TEACHER AI Agente v3.0 (Rafinha Web Operator) Ativado!", "color: #b58900; font-weight: bold; font-size: 14px;");

if (!window.__teacherAgentLoaded) {
window.__teacherAgentLoaded = true;

// ─── DEEP DOM TRAVERSAL (Shadow DOM & Iframes) ────────────────────────────────
function querySelectorAllDeep(selector, root = document) {
  let results = [];
  try {
    if (root && root.querySelectorAll) {
      results = results.concat(Array.from(root.querySelectorAll(selector)));
    }
  } catch (e) {}

  try {
    const all = (root && root.querySelectorAll) ? Array.from(root.querySelectorAll('*')) : [];
    for (const el of all) {
      if (el.shadowRoot) {
        results = results.concat(querySelectorAllDeep(selector, el.shadowRoot));
      }
      if (el.tagName === 'IFRAME' && el.contentDocument) {
        try {
          results = results.concat(querySelectorAllDeep(selector, el.contentDocument));
        } catch (e) {}
      }
    }
  } catch (e) {}

  return results;
}
window.querySelectorAllDeep = querySelectorAllDeep;

// ——— Platform Detection ———
const CURRENT_URL = window.location.href;

const PLATFORM_PROFILES = {
  sandbox: {
    match: () => CURRENT_URL.includes('localhost') || CURRENT_URL.includes('127.0.0.1') || CURRENT_URL.includes('portal_mock') || CURRENT_URL.includes('portal_real'),
    name: 'Portal de Testes (Sandbox)',
    selectors: {
      title:       ['input[name*="conteudo"]', 'input[name*="titulo"]', 'input[id*="conteudo"]'],
      date:        ['input[type="date"]', 'input[name*="data"]'],
      description: ['textarea', 'div[contenteditable="true"]', '#observacao_pedagogica'],
      classRef:    ['select[name*="turma"]', '#turma_aluno'],
      submit:      ['button[type="submit"]', '#btn_salvar', '.btn']
    }
  },
  machado: {
    match: () => CURRENT_URL.includes('paineldoaluno.com.br'),
    name: 'Machado Sobrinho',
    selectors: {
      title:       ['input[name*="titulo"]', 'input[name*="assunto"]', 'input[id*="diario"]', 'input[placeholder*="Assunto"]'],
      date:        ['input[type="date"]', 'input[name*="data"]', 'input[id*="data"]'],
      description: ['textarea[name*="conteudo"]', 'textarea[name*="descricao"]', 'textarea[name*="pauta"]', 'div[contenteditable="true"]'],
      classRef:    ['select[name*="turma"]', 'select[id*="turma"]', 'input[name*="turma"]'],
      submit:      ['button[type="submit"]', 'input[type="submit"]', '.btn-salvar', '#btn-salvar']
    }
  },
  santacatarina: {
    match: () => CURRENT_URL.includes('redesantacatarina.org.br'),
    name: 'Rede Santa Catarina',
    selectors: {
      title:       ['input[placeholder*="planejamento"]', 'input[name*="titulo"]', 'input[name*="plano"]'],
      date:        ['input[type="date"]', 'input[name*="data"]'],
      description: ['textarea', 'div[contenteditable="true"]', 'input[name*="pauta"]'],
      classRef:    ['select[name*="turma"]', 'select[name*="classe"]'],
      submit:      ['button[type="submit"]', 'input[type="submit"]', '.btn-salvar']
    }
  },
  plural: {
    match: () => CURRENT_URL.includes('plural.net'),
    name: 'Plurall (SOMOS)',
    selectors: {
      title:       ['input[placeholder*="título"]', 'input[name*="title"]', 'input[name*="nome"]'],
      date:        ['input[type="date"]', 'input[name*="datalimite"]', 'input[name*="prazo"]'],
      description: ['textarea[name*="descricao"]', 'div[contenteditable="true"]'],
      classRef:    ['select[name*="turma"]', 'select[name*="grupo"]'],
      submit:      ['button[type="submit"]', '.btn-salvar']
    }
  },
  cambridge: {
    match: () => CURRENT_URL.includes('cambridgeone.org'),
    name: 'Cambridge One',
    selectors: {
      title:       ['input[name*="lesson"]', 'input[name*="title"]', 'input[placeholder*="lesson"]'],
      date:        ['input[type="date"]', 'input[name*="due"]'],
      description: ['textarea', 'div[contenteditable="true"]'],
      classRef:    ['select[name*="class"]', 'select[name*="group"]'],
      submit:      ['button[type="submit"]', '.btn-submit']
    }
  },
  teams: {
    match: () => CURRENT_URL.includes('teams.microsoft.com'),
    name: 'Microsoft Teams',
    selectors: {
      title:       ['input[placeholder*="título"]', 'input[placeholder*="Title"]', 'input[data-tid*="title"]'],
      date:        ['input[type="date"]', 'input[aria-label*="data"]', 'input[aria-label*="Due"]'],
      description: ['div[contenteditable="true"]', 'textarea[placeholder*="instrucoes"]'],
      classRef:    [],
      submit:      ['button[type="submit"]']
    }
  }
};

// Detect which platform we're on
let portalPlatformProfile = null;
for (const [key, profile] of Object.entries(PLATFORM_PROFILES)) {
  if (profile.match()) {
    portalPlatformProfile = { id: key, ...profile };
    break;
  }
}

// Show status badge only in top frame and NOT in auth/login/transition screens
const isAuthOrTransitionUrl = () => {
  const p = (window.location.pathname || '').toLowerCase();
  return p.includes('/auth') || p.includes('/login') || p.includes('/logoff') || 
         p.includes('/selecionar-contexto') || p.includes('/carregar-parametros') || 
         p.includes('/signin') || p.includes('/entrar');
};

const isTopFrame = window.self === window.top;

if (portalPlatformProfile && isTopFrame && !isAuthOrTransitionUrl()) {
  showStatusToast(portalPlatformProfile.name, 'connected');
}

// ——— Zero-Footprint Telemetria & Status (Sem poluição do DOM) ———
function showStatusToast(platformName, state = 'connected', customText) {
  // Limpa resquícios no DOM se existirem de versões antigas
  const existing = document.getElementById('teacher-agent-status');
  if (existing) existing.remove();
  const existingStyle = document.getElementById('teacher-agent-status-style');
  if (existingStyle) existingStyle.remove();

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'STATUS_TOAST_UPDATE',
        platformName,
        state,
        customText: customText || null,
        url: window.location.href,
        timestamp: Date.now()
      }).catch(() => {});
    }
  } catch (e) {
    // Silently ignore if port is closed
  }
}

// ——— Field filling engine ———

function fillField(platformSelectorList, semanticKeywords, value) {
  if (!value && value !== 0) return false;

  // Strategy 1: Platform-specific selectors
  if (platformSelectorList && platformSelectorList.length > 0) {
    for (const selector of platformSelectorList) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          return setFieldValue(el, value);
        }
      } catch(e) {}
    }
  }

  // Strategy 2: Semantic keyword scan
  const allInputs = Array.from(document.querySelectorAll('input, textarea, select, div[contenteditable="true"]'));
  for (const el of allInputs) {
    const id          = (el.id || '').toLowerCase();
    const name        = (el.getAttribute('name') || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const ariaLabel   = (el.getAttribute('aria-label') || '').toLowerCase();
    const dataLabel   = (el.getAttribute('data-label') || '').toLowerCase();

    let labelText = '';
    let parent = el.parentElement;
    for (let i = 0; i < 4 && parent; i++) {
      const lbl = parent.querySelector('label');
      if (lbl) { labelText = lbl.innerText.toLowerCase(); break; }
      parent = parent.parentElement;
    }

    const haystack = `${id} ${name} ${placeholder} ${ariaLabel} ${dataLabel} ${labelText}`;

    if (semanticKeywords.some(kw => haystack.includes(kw))) {
      return setFieldValue(el, value);
    }
  }

  return false;
}

function setFieldValue(el, value) {
  const currentVal = el.contentEditable === 'true' ? (el.innerText || '').trim() : String(el.value || '').trim();
  if (currentVal === String(value).trim()) {
    console.log(`%c[TEACHER-AI Rafinha] Idempotência: ${el.name || el.id || el.tagName} já possui valor "${value}". Pulando escrita redundante.`, 'color: #3b82f6;');
    return true;
  }

  el.style.outline = '3px solid #16a34a';
  el.style.backgroundColor = 'rgba(22, 163, 74, 0.08)';
  el.style.transition = 'all 0.3s ease';

  if (el.contentEditable === 'true') {
    el.focus();
    el.innerText = String(value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value) }));
  } else if (el.tagName === 'SELECT') {
    // Procura opção por texto ou valor
    const strVal = String(value).toLowerCase();
    let found = false;
    for (let i = 0; i < el.options.length; i++) {
      const optText = el.options[i].text.toLowerCase();
      const optVal = el.options[i].value.toLowerCase();
      if (optText.includes(strVal) || optVal.includes(strVal)) {
        el.selectedIndex = i;
        found = true;
        break;
      }
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // React / Vue input value hack
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (nativeInputValueSetter) {
      nativeInputValueSetter.set.call(el, String(value));
    } else {
      el.value = String(value);
    }

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));
  }

  console.log(`%c[TEACHER??? Rafinha] Preenchido: ${el.name || el.id || el.tagName} → "${value}"`, 'color: #16a34a; font-weight: bold;');
  return true;
}

// ——— Preenchimento Estruturado de Notas (Grades Table) ———
function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchStudentName(portalText, studentName) {
  const normPortal = normalizeName(portalText);
  const normStudent = normalizeName(studentName);
  
  if (!normStudent || !normPortal) return false;
  if (normPortal.includes(normStudent)) return true;

  const parts = normStudent.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    if (normPortal.includes(firstName) && normPortal.includes(lastName)) {
      return true;
    }
  }
  return false;
}

// ——— Preenchimento Estruturado de Notas (Grades Table com Fuzzy Matching) ———
function fillGradesMatrix(studentGrades) {
  if (!Array.isArray(studentGrades) || studentGrades.length === 0) return 0;

  let filledCount = 0;
  const rows = Array.from(document.querySelectorAll('tr, div.student-row, div.grade-item, div.row, li'));

  studentGrades.forEach(st => {
    const studentName = st.name;
    const grade = st.grade;

    for (const row of rows) {
      const rowText = row.innerText;
      if (matchStudentName(rowText, studentName)) {
        const gradeInput = row.querySelector('input[type="number"], input[type="text"], input[name*="nota"], input[id*="nota"], input[name*="grade"]') ||
                           row.querySelector('input:not([type="hidden"]):not([type="checkbox"])');
        if (gradeInput) {
          setFieldValue(gradeInput, grade);
          filledCount++;
          break;
        }
      }
    }
  });

  return filledCount;
}

// ——— Preenchimento de Chamada / Frequência com Fuzzy Matching ———
function fillAttendanceMatrix(absentStudents = [], presentStudents = []) {
  let markedCount = 0;
  const rows = Array.from(document.querySelectorAll('tr, div.student-row, div.row, li'));

  rows.forEach(row => {
    const rowText = row.innerText;
    const isAbsent = absentStudents.some(name => matchStudentName(rowText, name));

    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox) {
      if (isAbsent) {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        markedCount++;
      } else {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        markedCount++;
      }
    }
  });

  return markedCount;
}

// ─── GAP 8: Detecção e Auto-Bypass de Overlays/Spinners em Portais Legados ──────
async function waitForOverlaysToClear(maxWaitMs = 3000, pollIntervalMs = 100) {
  const overlaySelectors = [
    '.blockUI',
    '.modal-backdrop.show',
    '.ui-widget-overlay',
    '[aria-busy="true"]',
    '.loading-overlay',
    '.spinner-overlay',
    '.k-loading-mask',
    '.dx-loadpanel-content',
    'div[id*="loading"]:not([style*="display: none"]):not([style*="visibility: hidden"])',
    'div[class*="loading"]:not([style*="display: none"]):not([style*="visibility: hidden"])',
    'div[id*="carregando"]:not([style*="display: none"]):not([style*="visibility: hidden"])',
    'div[class*="carregando"]:not([style*="display: none"]):not([style*="visibility: hidden"])'
  ];

  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    let hasActiveOverlay = false;
    for (const sel of overlaySelectors) {
      try {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            parseFloat(style.opacity || '1') > 0 &&
            rect.width > 20 &&
            rect.height > 20 &&
            (rect.top < window.innerHeight && rect.bottom > 0)
          ) {
            hasActiveOverlay = true;
            break;
          }
        }
      } catch (e) {}
      if (hasActiveOverlay) break;
    }

    if (!hasActiveOverlay) {
      return true;
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  return false;
}

// ——— Execução de Ações Agênticas da Rafinha ———
async function handleExecutePortalAction(data) {
  // Aguarda liberação de overlays e spinners antes de interagir (GAP 8)
  await waitForOverlaysToClear(2000, 80);

  const p = data.payload || data.task || data;
  const actionType = data.actionType || p.type || p.acao || 'diary';
  const mode = data.mode || 'supervised';

  console.log(`⚡ Rafinha executando ação [${actionType}] no modo [${mode}]:`, p);
  showStatusToast(portalPlatformProfile?.name || 'Portal Escolar', 'filling', `⚡ Rafinha: preenchendo ${actionType}...`);

  const profile = portalPlatformProfile;
  const s = profile?.selectors || { title: [], date: [], description: [], classRef: [], submit: [] };

  let filledCount = 0;

  if (actionType === 'grades' || actionType === 'lancar_nota') {
    const studentGrades = p.studentGrades?.length ? p.studentGrades : (p.aluno || data.aluno ? [{ name: p.aluno || data.aluno, grade: p.nota ?? data.nota }] : []);
    filledCount = fillGradesMatrix(studentGrades);
  } else if (actionType === 'attendance' || actionType === 'lancar_falta') {
    const absentStudents = p.absentStudents?.length ? p.absentStudents : (p.aluno || data.aluno ? [p.aluno || data.aluno] : []);
    filledCount = fillAttendanceMatrix(absentStudents, p.presentStudents || []);
  } else {
    // Diário / Tarefa / Pauta
    const results = {
      title:    fillField(s.title,       ['title', 'titulo', 'nome', 'assunto', 'atividade', 'diario', 'tema', 'conteudo', 'plano', 'lesson'], p.title),
      date:     fillField(s.date,        ['date', 'data', 'limite', 'entrega', 'prazo', 'aula', 'vencimento', 'due'], p.date),
      desc:     fillField(s.description, ['desc', 'descricao', 'detalhes', 'observacoes', 'body', 'comentario', 'pauta', 'instrucoes', 'metodologia'], p.description || p.methodology || ''),
      classRef: fillField(s.classRef,    ['class', 'turma', 'grupo', 'serie', 'grade'], p.classRef || ''),
    };
    filledCount = Object.values(results).filter(Boolean).length;
  }

  const success = filledCount > 0;
  const resultPayload = {
    sucesso: success,
    success,
    status: success ? 'draft_completed_pending_submit' : 'no_matching_field_found',
    mensagem: success
      ? `Preenchimento de ${actionType} realizado com sucesso (${filledCount} campo(s) preenchido(s)).`
      : `Não encontrei campos de formulário para ${actionType} na tela atual do portal. Certifique-se de estar na aba correspondente.`,
    filledCount,
    diff: {
      aluno: p.aluno || data.aluno || (p.studentGrades?.[0]?.name) || '',
      campo: (actionType === 'grades' || actionType === 'lancar_nota') ? 'nota' : 'falta',
      depois: String(p.nota ?? data.nota ?? p.studentGrades?.[0]?.grade ?? '')
    }
  };

  setTimeout(() => {
    if (success) {
      if (mode === 'autonomous') {
        // Modo Autônomo: clica automaticamente no botão de submissão/salvar
        let submitted = false;
        if (s.submit && s.submit.length > 0) {
          for (const subSel of s.submit) {
            try {
              const btn = document.querySelector(subSel);
              if (btn) {
                btn.click();
                submitted = true;
                break;
              }
            } catch {}
          }
        }

        showStatusToast(portalPlatformProfile?.name || 'Portal', 'success', `🚀 Salvo com sucesso no ${portalPlatformProfile?.name || 'Portal'}!`);
      } else {
        // Modo Supervisionado: destaca botão para conferência humana
        showStatusToast(portalPlatformProfile?.name || 'Portal', 'success', `✅ ${filledCount} campos preenchidos. Revise e clique em Salvar!`);
      }

      chrome.runtime.sendMessage({
        action: 'FILL_RESULT',
        platform: portalPlatformProfile?.id || '',
        success: true,
        filledCount,
        message: `Ação ${actionType} executada com sucesso no ${portalPlatformProfile?.name || 'portal'}.`
      });
    } else {
      showStatusToast(portalPlatformProfile?.name || 'Portal', 'error', '⚠️ Verifique se a página correta do portal está aberta.');
      chrome.runtime.sendMessage({
        action: 'FILL_RESULT',
        platform: portalPlatformProfile?.id || '',
        success: false,
        error: 'Nenhum campo compatível foi localizado na tela ativa.'
      });
    }
  }, 1000);

  return resultPayload;
}

// Cache do hash do último snapshot inspecionado para evitar tráfego de payloads redundantes (GAP 4)
let lastScrapedPayloadHash = null;

// ——— Inspeção e Raspagem de Dados do DOM (Zero Alucinação com Pruning Estrutural) ———
function handleInspectAndScrape() {
  // Pruning de tabelas: remove células vazias e tabelas sem dados tabulares reais
  const tables = Array.from(document.querySelectorAll('table')).map(table => {
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim()).filter(Boolean);
    const rows = Array.from(table.querySelectorAll('tr')).map(tr => 
      Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()).filter(Boolean)
    ).filter(r => r.length > 0);
    return { headers, rows };
  }).filter(t => t.headers.length > 0 || t.rows.length > 0);

  // Pruning de inputs: filtra elementos ocultos sem identificação e sem relevância para automação
  const inputs = Array.from(document.querySelectorAll('input, select, textarea')).filter(el => {
    if (el.type === 'hidden' && !el.name && !el.id) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' && !el.name && !el.id) return false;
    return true;
  }).map(el => ({
    tagName: el.tagName,
    type: el.type,
    name: el.name,
    id: el.id,
    placeholder: el.placeholder,
    value: el.value
  }));

  // Hash leve para identificação de snapshots idênticos
  const snapshotSummary = `${tables.length}_${inputs.length}_${tables.reduce((acc, t) => acc + t.rows.length, 0)}`;
  const isDuplicate = (lastScrapedPayloadHash === snapshotSummary);
  lastScrapedPayloadHash = snapshotSummary;

  const payload = {
    url: window.location.href,
    title: document.title,
    platform: portalPlatformProfile?.id || 'unknown',
    tables,
    inputsCount: inputs.length,
    timestamp: Date.now(),
    isDuplicate
  };

  showStatusToast(portalPlatformProfile?.name || 'Portal', 'success', `🔍 Tela inspecionada! ${tables.length} tabelas e ${inputs.length} campos mapeados.`);

  // Envia resposta de volta para a aplicação
  window.postMessage({ action: 'INSPECT_RESULT', payload }, '*');
  try {
    const channel = new BroadcastChannel('teacher_portal_bridge');
    channel.postMessage({ action: 'INSPECT_RESULT', payload });
  } catch {}

  return payload;
}

// ——— Message Listener (App postMessage + BroadcastChannel + Chrome Runtime) ———

window.addEventListener('message', (event) => {
  const isFromApp = event.origin === 'http://localhost:3000' || event.origin === 'http://localhost:3001';
  if (!isFromApp) return;

  const isAppPage = window.location.href.includes('localhost:3000') || window.location.href.includes('localhost:3001');
  if (isAppPage) {
    chrome.runtime.sendMessage({ action: 'FORWARD_TO_PORTAL', payload: event.data });
  } else {
    if (event.data.action === 'EXECUTE_PORTAL_ACTION' || event.data.action === 'FILL_DEADLINE') {
      handleExecutePortalAction(event.data);
    } else if (event.data.action === 'INSPECT_PAGE' || event.data.action === 'EXTRACT_PAGE_DATA') {
      handleInspectAndScrape();
    }
  }
});

try {
  const bc = new BroadcastChannel('teacher_portal_bridge');
  bc.onmessage = (event) => {
    if (event.data?.action === 'FORWARD_TO_PORTAL' || event.data?.action === 'EXECUTE_PORTAL_ACTION') {
      handleExecutePortalAction(event.data.payload || event.data);
    } else if (event.data?.action === 'INSPECT_PAGE' || event.data?.action === 'EXTRACT_PAGE_DATA') {
      handleInspectAndScrape();
    }
  };
} catch {}

try {
  const entityBus = new BroadcastChannel('teacher_entity_bus');
  entityBus.onmessage = (event) => {
    if (event.data && typeof event.data === 'object') {
      window.postMessage(event.data, '*');
    }
  };
} catch {}

function showInPageCheckpointModal(preview) {
  return new Promise((resolve) => {
    const existing = document.getElementById('teacher-ai-checkpoint-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'teacher-ai-checkpoint-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    const bindingsObj = preview?.resolvedBindings || {};
    const entries = Object.entries(bindingsObj);
    const bindingsHtml = entries.length > 0
      ? `<b>Dados vinculados:</b><br>` + entries.map(([k, v]) => `• <b>${k}</b>: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('<br>')
      : `<b>Ação de risco identificada:</b> Gravação / Submissão no portal.`;

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;max-width:420px;width:90%;box-shadow:0 12px 30px rgba(0,0,0,0.3);border-top:5px solid #dc2626;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:26px;">⚠️</span>
          <div>
            <div style="font-size:14px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;">Ponto de Controle Obrigatório</div>
            <div style="font-size:11px;font-weight:700;color:#dc2626;">Checkpoint Human-in-the-Loop</div>
          </div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">${preview?.title || 'Aprovação de Ação no Portal'}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:8px;line-height:1.4;">${preview?.description || 'Confirmação necessária antes de submeter no portal.'}</div>
          <div style="font-size:11px;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:8px;max-height:120px;overflow-y:auto;font-family:monospace;">${bindingsHtml}</div>
        </div>
        <p style="font-size:11px;color:#64748b;margin-bottom:14px;line-height:1.4;">Revise as ações acima antes de autorizar. Nenhuma alteração foi realizada ainda.</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="btn-tai-checkpoint-abort" style="padding:8px 16px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#475569;font-weight:600;cursor:pointer;font-size:12px;">Cancelar Ação</button>
          <button id="btn-tai-checkpoint-approve" style="padding:8px 18px;border:none;border-radius:6px;background:#dc2626;color:#fff;font-weight:700;cursor:pointer;font-size:12px;">Aprovar e Gravar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btn-tai-checkpoint-approve').onclick = () => {
      overlay.remove();
      resolve(true);
    };
    overlay.querySelector('#btn-tai-checkpoint-abort').onclick = () => {
      overlay.remove();
      resolve(false);
    };
  });
}

// Controle de Pausa e Retomada para GraphExecutor
let isExecutionPaused = false;
let resumeExecutionResolver = null;

function waitForExecutionResume() {
  if (!isExecutionPaused) return Promise.resolve();
  return new Promise((resolve) => {
    resumeExecutionResolver = resolve;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ——— RECEPTOR DE IMPORTAÇÃO NO TEACHER AI APP (ORIGEM LOCALHOST:3000) ———
  if (message.action === 'IMPORT_STUDENTS_TO_APP') {
    const payload = message.payload || {};
    const className = (payload.className || 'Turma do Portal').trim();
    const portalName = payload.portalName || 'Machado Sobrinho';
    const students = payload.students || [];

    try {
      // 1. Localiza ou cria a turma em teacher_classes
      let classes = [];
      try { classes = JSON.parse(localStorage.getItem('teacher_classes') || '[]'); } catch(e) {}
      let targetClass = classes.find(c => (c.name || '').toLowerCase() === className.toLowerCase());
      if (!targetClass) {
        targetClass = {
          id: 'cls_' + Date.now().toString(36),
          name: className,
          schoolId: 'school_default',
          description: `Importada do portal ${portalName}`
        };
        classes.push(targetClass);
        localStorage.setItem('teacher_classes', JSON.stringify(classes));
      }

      // 2. Insere/atualiza os alunos em teacher_students
      let currentStudents = [];
      try { currentStudents = JSON.parse(localStorage.getItem('teacher_students') || '[]'); } catch(e) {}

      let added = 0;
      let updated = 0;

      for (const s of students) {
        const sName = (s.name || '').trim();
        if (!sName) continue;

        const idx = currentStudents.findIndex(
          cs => cs.classId === targetClass.id && (cs.name || '').toLowerCase() === sName.toLowerCase()
        );

        if (idx >= 0) {
          if (s.matricula) currentStudents[idx].rollNumber = s.matricula;
          currentStudents[idx].sync_status = 'synced';
          currentStudents[idx].last_synced_at = new Date().toISOString();
          updated++;
        } else {
          currentStudents.push({
            id: 'stu_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
            name: sName,
            classId: targetClass.id,
            schoolId: targetClass.schoolId || 'school_default',
            notes: `Importado de ${portalName}`,
            level: 'A2',
            grades: {},
            rollNumber: s.matricula || '',
            source_type: 'portal_scrape',
            source_portal: portalName,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString()
          });
          added++;
        }
      }

      localStorage.setItem('teacher_students', JSON.stringify(currentStudents));
      window.dispatchEvent(new Event('storage'));

      showStatusToast('Teacher AI', 'success', `🎉 ${added + updated} alunos sincronizados com a turma "${targetClass.name}"!`);
      sendResponse({ ok: true, classId: targetClass.id, className: targetClass.name, count: added + updated });
      return true;
    } catch (err) {
      console.error('[Content] Erro ao sincronizar com localStorage:', err);
      sendResponse({ ok: false, error: err.message });
      return true;
    }
  }


  // Estado de Pausa de Execução do GraphExecutor (Play / Pause Lote 3)
  if (message.action === 'PAUSE_EXECUTION') {
    isExecutionPaused = true;
    showStatusToast('Teacher AI', 'info', '⏸️ Execução pausada pelo professor.');
    sendResponse({ ok: true, isPaused: true });
    return true;
  }

  if (message.action === 'RESUME_EXECUTION') {
    isExecutionPaused = false;
    if (resumeExecutionResolver) {
      resumeExecutionResolver();
      resumeExecutionResolver = null;
    }
    showStatusToast('Teacher AI', 'info', '▶️ Execução retomada!');
    sendResponse({ ok: true, isPaused: false });
    return true;
  }

  if (message.action === 'EXECUTE_SKILL_GRAPH' || message.action === 'READ_STUDENTS_NOW' || message.action === 'PING') {
    if (message.action === 'PING') {
      sendResponse({ ok: true, url: window.location.href });
      return true;
    }

    (async () => {
      console.log('[Teacher AI Extractor] Executando ação de skill na página:', window.location.href);
      const graphToRun = message.skillGraph || CANONICAL_READ_ROSTER_GRAPH;
      let graphExecResult = null;
      let graphStudents = [];
      let executionSource = 'graph_executor';
      let fallbackReason = null;

      const isReadingTask = Boolean(graphToRun?.nodes && Object.values(graphToRun.nodes).some(n => n.type === 'READ' || n.type === 'LOOP'));

      try {
        console.log('[Teacher AI Extractor] Executando GraphExecutor com grafo:', graphToRun.id || graphToRun.task_id || 'canonical');
        graphExecResult = await executeSkillGraph(graphToRun, {
          domProvider: document,
          bindings: {},
          onCheckpoint: async (preview) => {
            console.log('[ContentScript] Ponto de controle (Checkpoint) atingido:', preview);
            showStatusToast('Teacher AI', 'warning', '⚠️ Ponto de Controle: Aguardando sua confirmação...');

            let answered = false;
            let approved = false;

            try {
              const res = await new Promise((resolve) => {
                const timeoutTimer = setTimeout(() => resolve(null), 30000);
                chrome.runtime.sendMessage({
                  action: 'CHECKPOINT_REQUEST',
                  preview
                }, (resp) => {
                  clearTimeout(timeoutTimer);
                  if (chrome.runtime.lastError) {
                    resolve(null);
                  } else {
                    resolve(resp);
                  }
                });
              });

              if (res && typeof res.approved === 'boolean') {
                answered = true;
                approved = res.approved;
              }
            } catch (err) {
              console.warn('[ContentScript] Erro ao enviar CHECKPOINT_REQUEST para side panel:', err);
            }

            // Fallback in-page modal se o side panel não respondeu
            if (!answered) {
              console.log('[ContentScript] Side panel não respondeu; exibindo modal in-page de fallback.');
              approved = await showInPageCheckpointModal(preview);
            }

            if (approved) {
              showStatusToast('Teacher AI', 'success', '✅ Checkpoint aprovado pelo professor! Continuando...');
            } else {
              showStatusToast('Teacher AI', 'error', '🛑 Ação cancelada pelo professor no Checkpoint.');
            }

            return approved;
          },
          pauseControl: {
            isPaused: () => isExecutionPaused,
            waitForResume: () => waitForExecutionResume(),
            onPauseStateChange: (paused, currentCount) => {
              console.log(`[GraphExecutor] Estado de pausa: ${paused} | Coletados: ${currentCount}`);
              try {
                chrome.runtime.sendMessage({
                  action: 'EXECUTION_PAUSE_CHANGED',
                  isPaused: paused,
                  collectedCount: currentCount
                });
              } catch (e) {}
            }
          }
        });

        if (graphExecResult && graphExecResult.success) {
          const rawRecords = graphExecResult.bindings?.records || graphExecResult.bindings?.students || graphExecResult.bindings?._collected_records || [];
          graphStudents = rawRecords.map(r => {
            const name = (r.aluno_nome || r.nome || Object.values(r)[0] || '').trim();
            const matricula = (r.matricula || r.ra || '').trim();
            return {
              name,
              matricula,
              rawSnippet: name,
              ...r
            };
          }).filter(s => s.name && s.name.length >= 2 && !/^(nome|aluno|total|situa)/i.test(s.name));

          if (isReadingTask && graphStudents.length === 0) {
            fallbackReason = 'GraphExecutor concluiu sem erros, mas 0 alunos foram acumulados pelo seletor do grafo.';
          }
        } else {
          fallbackReason = graphExecResult?.error || 'GraphExecutor falhou na resolução dos nós.';
        }
      } catch (err) {
        console.error('[Teacher AI Extractor] Exceção durante executeSkillGraph:', err);
        fallbackReason = `Exceção no GraphExecutor: ${err.message}`;
      }

      let finalStudents = [];
      const isSuccess = Boolean(graphExecResult && graphExecResult.success);

      if (!isReadingTask) {
        executionSource = 'graph_executor';
        finalStudents = [];
        if (isSuccess) {
          showStatusToast('Teacher AI', 'success', `✨ Skill "${graphToRun.name || graphToRun.task_id || 'Ação'}" executada com sucesso!`);
        } else if (graphExecResult?.status === 'ABORTED_BY_USER') {
          showStatusToast('Teacher AI', 'warning', `🛑 Skill cancelada pelo professor no checkpoint.`);
        } else {
          showStatusToast('Teacher AI', 'error', `❌ Falha na execução: ${graphExecResult?.error || 'Erro'}`);
        }
      } else if (!fallbackReason && graphStudents.length > 0) {
        executionSource = 'graph_executor';
        finalStudents = graphStudents;
        showStatusToast('Teacher AI', 'success', `🎓 ${finalStudents.length} alunos identificados via GraphExecutor!`);
      } else {
        executionSource = 'bespoke_fallback';
        console.warn(`[Teacher AI Extractor] Fallback acionado para leitura. Motivo: ${fallbackReason}`);
        finalStudents = universalExtractStudents();
        showStatusToast('Teacher AI', 'warning', `⚠️ ${finalStudents.length} alunos identificados via Fallback Bespoke`);
      }

      const recordedEvents = [
        { eventId: 1, type: 'NAVIGATE', timestamp: Date.now(), url: window.location.href, anchor: null },
        { eventId: 2, type: 'LOCATE', timestamp: Date.now(), url: window.location.href, anchor: { strategy: 'css_selector', value: 'table tbody tr', description: 'Linhas dos alunos' } },
        { eventId: 3, type: 'READ', timestamp: Date.now(), url: window.location.href, anchor: { strategy: 'css_selector', value: 'td:nth-child(1)', scope: 'row_current', description: 'Nome do Aluno' }, columnHeader: 'Nome do Aluno', tableCol: 0, sampleValue: finalStudents[0]?.name || '' }
      ];

      sendResponse({
        ok: isReadingTask ? true : isSuccess,
        status: graphExecResult?.status || (isSuccess ? 'COMPLETED' : 'FAILED'),
        source: executionSource,
        isReadingTask,
        fallbackReason: fallbackReason || null,
        error: graphExecResult?.error || null,
        students: finalStudents,
        records: finalStudents,
        trace: graphExecResult?.trace || [],
        events: recordedEvents,
        pageUrl: window.location.href
      });
    })();

    return true;
  }


  if (message.action === 'START_RECORDING') {
    isRecordingSkill = true;
    chrome.storage?.local?.set({ teacher_recording_active: true });
    recordedSkillEvents = [
      { eventId: 1, type: 'NAVIGATE', timestamp: Date.now(), url: window.location.href, anchor: null }
    ];
    skillEventCount = 1;
    showStatusToast('Teacher AI', 'info', '🎙️ Gravação iniciada! Seus cliques e navegações serão capturados.');
    try {
      chrome.runtime.sendMessage({
        action: 'RECORD_ACTION',
        event: { eventId: 1, type: 'NAVIGATE', timestamp: Date.now(), url: window.location.href, anchor: null }
      });
    } catch (e) {}
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'STOP_RECORDING') {
    isRecordingSkill = false;
    chrome.storage?.local?.set({ teacher_recording_active: false });
    const tableCells = snapshotPortalTable();
    tableCells.forEach((c) => {
      skillEventCount++;
      recordedSkillEvents.push({
        eventId: skillEventCount,
        type: 'READ',
        timestamp: Date.now(),
        url: window.location.href,
        anchor: c.anchor,
        columnHeader: c.header,
        sampleValue: c.sample,
        tableCol: c.col,
        tableRow: c.row
      });
    });
    showStatusToast('Teacher AI', 'success', `✅ Gravação finalizada!`);
    sendResponse({ ok: true, events: recordedSkillEvents, pageUrl: window.location.href });
    return true;
  }

  if (message.action === 'EXECUTE_PORTAL_ACTION' || message.action === 'FILL_DEADLINE') {
    handleExecutePortalAction(message).then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ sucesso: false, success: false, error: err?.message || String(err) });
    });
    return true;
  } else if (message.action === 'INSPECT_PAGE' || message.action === 'EXTRACT_PAGE_DATA') {
    const res = handleInspectAndScrape();
    sendResponse(res);
    return true;
  } else if (message.action === 'ENABLE_POINT_AND_CLICK') {
    enablePointAndClickMode((selectedData) => {
      sendResponse({ ok: true, selected: true, ...selectedData });
    });
    return true;
  } else if (message.action === 'HIGHLIGHT_ELEMENT') {
    const ok = highlightElementTemporarily(message.target || message.selector, message.label, message.durationMs);
    sendResponse({ ok, highlighted: ok });
    return true;
  } else if (message.action === 'CLEAR_HIGHLIGHT') {
    clearAgentVisualFocus();
    sendResponse({ ok: true });
    return true;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DESTAQUE VISUAL EM TEMPO REAL DO AGENTE (ESTILO PERPLEXITY COMET / CLAUDE)
// Desenha um contorno visual suave com glow (#38bdf8) ao redor do elemento
// sendo lido ou preenchido pela Rafinha, com fade-out automático suave (~300ms).
// ══════════════════════════════════════════════════════════════════════════════

let agentFocusOverlay = null;
let agentFocusBadge = null;
let agentFocusTimer = null;

function clearAgentVisualFocus() {
  if (agentFocusTimer) {
    clearTimeout(agentFocusTimer);
    agentFocusTimer = null;
  }
  if (agentFocusOverlay) {
    agentFocusOverlay.style.opacity = '0';
    setTimeout(() => {
      if (agentFocusOverlay && agentFocusOverlay.parentNode) {
        agentFocusOverlay.parentNode.removeChild(agentFocusOverlay);
      }
      agentFocusOverlay = null;
      agentFocusBadge = null;
    }, 300);
  }
}

function highlightElementTemporarily(target, label = 'Inspecionando...', durationMs = 1200) {
  try {
    let el = null;
    if (typeof target === 'string') {
      el = document.querySelector(target);
    } else if (target && target.nodeType === Node.ELEMENT_NODE) {
      el = target;
    }

    if (!el && (!target || typeof target.x === 'undefined')) {
      return false;
    }

    let rect = el ? el.getBoundingClientRect() : target;
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return false;
    }

    if (!agentFocusOverlay || !agentFocusOverlay.parentNode) {
      agentFocusOverlay = document.createElement('div');
      agentFocusOverlay.id = 'teacher-agent-focus-outline';
      agentFocusOverlay.style.cssText = [
        'position: fixed',
        'pointer-events: none',
        'z-index: 2147483646',
        'border: 2px solid #38bdf8',
        'background: rgba(56, 189, 248, 0.08)',
        'box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.2), 0 0 16px rgba(56, 189, 248, 0.45)',
        'border-radius: 6px',
        'transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease',
        'opacity: 0'
      ].join(';');

      agentFocusBadge = document.createElement('div');
      agentFocusBadge.id = 'teacher-agent-focus-badge';
      agentFocusBadge.style.cssText = [
        'position: absolute',
        'top: -24px',
        'left: 0',
        'background: #0284c7',
        'color: #ffffff',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size: 11px',
        'font-weight: 600',
        'padding: 2px 8px',
        'border-radius: 4px',
        'box-shadow: 0 2px 6px rgba(0,0,0,0.2)',
        'white-space: nowrap',
        'pointer-events: none',
        'display: flex',
        'align-items: center',
        'gap: 4px'
      ].join(';');

      agentFocusOverlay.appendChild(agentFocusBadge);
      document.body.appendChild(agentFocusOverlay);
    }

    const pad = 3;
    const top = Math.max(0, rect.top - pad);
    const left = Math.max(0, rect.left - pad);
    const width = rect.width + (pad * 2);
    const height = rect.height + (pad * 2);

    agentFocusOverlay.style.top = `${top}px`;
    agentFocusOverlay.style.left = `${left}px`;
    agentFocusOverlay.style.width = `${width}px`;
    agentFocusOverlay.style.height = `${height}px`;
    agentFocusOverlay.style.opacity = '1';

    if (agentFocusBadge) {
      agentFocusBadge.textContent = `🦉 Rafinha: ${label}`;
      if (top < 26) {
        agentFocusBadge.style.top = '4px';
        agentFocusBadge.style.left = '4px';
      } else {
        agentFocusBadge.style.top = '-24px';
        agentFocusBadge.style.left = '0';
      }
    }

    if (agentFocusTimer) clearTimeout(agentFocusTimer);
    agentFocusTimer = setTimeout(() => {
      clearAgentVisualFocus();
    }, durationMs);

    return true;
  } catch (err) {
    console.warn('[TeacherAI Content] Erro ao destacar elemento visualmente:', err);
    return false;
  }
}

// Expõe para uso em página e bridge
window.__teacherAiHighlight = highlightElementTemporarily;
window.__teacherAiClearHighlight = clearAgentVisualFocus;

window.addEventListener('message', (ev) => {
  if (ev.data && ev.data.type === 'TEACHER_AI_HIGHLIGHT') {
    highlightElementTemporarily(ev.data.target, ev.data.label, ev.data.durationMs);
  } else if (ev.data && ev.data.type === 'TEACHER_AI_CLEAR_HIGHLIGHT') {
    clearAgentVisualFocus();
  }
});

function enablePointAndClickMode(callback) {
  // 1. Overlay transparente em tela cheia que INTERCEPTA fisicamente todos os cliques
  // impedindo que qualquer evento chegue aos botões/formulários reais do portal
  const overlay = document.createElement('div');
  overlay.id = 'teacher-point-click-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483640;cursor:crosshair;background:rgba(15,23,42,0.03);pointer-events:auto;user-select:none;';

  // 2. Box visual de highlight sobreposto (sem pointer-events)
  const highlightBox = document.createElement('div');
  highlightBox.id = 'teacher-point-click-highlight';
  highlightBox.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483641;border:3px solid #38bdf8;background:rgba(56,189,248,0.12);border-radius:4px;display:none;transition:top 0.05s,left 0.05s,width 0.05s,height 0.05s;';

  // 3. Banner flutuante explicativo com botão cancelar
  const toast = document.createElement('div');
  toast.id = 'teacher-point-click-banner';
  toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f8fafc;padding:12px 20px;border-radius:10px;font-family:sans-serif;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.3);z-index:2147483642;border:2px solid #38bdf8;display:flex;align-items:center;gap:10px;pointer-events:auto;';
  toast.innerHTML = '<span>👉 Clique no campo ou botão do portal onde deve ser feita a ação</span><button style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:2px 6px;" id="btn-cancel-point-click" title="Cancelar">✕</button>';

  document.body.appendChild(overlay);
  document.body.appendChild(highlightBox);
  document.body.appendChild(toast);

  function cleanup() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (highlightBox.parentNode) highlightBox.parentNode.removeChild(highlightBox);
    if (toast.parentNode) toast.parentNode.removeChild(toast);
    overlay.removeEventListener('mousemove', onMouseMove);
    overlay.removeEventListener('click', onOverlayClick);
  }

  function getUnderlyingElement(x, y) {
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    overlay.style.pointerEvents = 'auto';
    return el;
  }

  function onMouseMove(e) {
    const target = getUnderlyingElement(e.clientX, e.clientY);
    if (target && !toast.contains(target) && target !== document.documentElement && target !== document.body) {
      const rect = target.getBoundingClientRect();
      highlightBox.style.top = `${rect.top}px`;
      highlightBox.style.left = `${rect.left}px`;
      highlightBox.style.width = `${rect.width}px`;
      highlightBox.style.height = `${rect.height}px`;
      highlightBox.style.display = 'block';
    } else {
      highlightBox.style.display = 'none';
    }
  }

  function onOverlayClick(e) {
    // Intercepta e anula completamente o clique antes de qualquer propagação
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = getUnderlyingElement(e.clientX, e.clientY);
    cleanup();

    if (target && !toast.contains(target)) {
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      const val = target.value || target.innerText || '';
      
      let sel = '';
      if (target.id) sel = `#${target.id}`;
      else if (target.name) sel = `${tag}[name="${target.name}"]`;
      else if (target.className && typeof target.className === 'string') {
        const first = target.className.trim().split(/\s+/)[0];
        sel = first ? `${tag}.${first}` : tag;
      } else {
        sel = tag;
      }

      callback({
        selected: true,
        tagName: tag,
        currentValue: val.trim(),
        id: target.id || '',
        name: target.name || '',
        className: target.className || '',
        selector: sel
      });
    } else {
      callback({ selected: false });
    }
  }

  // Cancelar pelo botão do toast
  toast.addEventListener('click', (e) => {
    if (e.target && (e.target.id === 'btn-cancel-point-click' || e.target.closest('#btn-cancel-point-click'))) {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      callback({ selected: false });
    }
  });

  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('click', onOverlayClick);
  // Bloqueia outros eventos de mouse de atingirem a página durante o modo
  overlay.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  overlay.addEventListener('mouseup', (e) => { e.preventDefault(); e.stopPropagation(); });
}

// Expõe globalmente para testes e automação
if (typeof window !== 'undefined') {
  window.__enablePointAndClickMode = enablePointAndClickMode;
}



// ——— PORTAL SKILL RECORDER (PERSISTENTE ENTRE PÁGINAS) ———
let isRecordingSkill = false;
let recordedSkillEvents = [];
let skillEventCount = 0;

// Restauração automática de gravação ao trocar de página no portal
try {
  chrome.storage?.local?.get(['teacher_recording_active'], (res) => {
    if (res?.teacher_recording_active) {
      isRecordingSkill = true;
      console.log('[TeacherAI Recorder] 🔄 Gravação contínua ativa na nova página:', window.location.href);
      showStatusToast('Teacher AI', 'info', '🎙️ Gravação contínua ativa nesta página!');

      // Recupera clique que desencadeou a navegação para não perder o CLICK no link/botão
      try {
        const pendingClickStr = sessionStorage.getItem('teacher_pending_nav_click');
        if (pendingClickStr) {
          sessionStorage.removeItem('teacher_pending_nav_click');
          const pendingClick = JSON.parse(pendingClickStr);
          console.log('[TeacherAI Recorder] Recuperando clique de navegação:', pendingClick);
          chrome.runtime.sendMessage({
            action: 'RECORD_ACTION',
            event: pendingClick
          }).catch(() => {});
        }
      } catch (e) {}

      chrome.runtime.sendMessage({
        action: 'RECORD_ACTION',
        event: {
          type: 'NAVIGATE',
          timestamp: Date.now(),
          url: window.location.href,
          anchor: null
        }
      }).catch(() => {});
    }
  });
} catch (e) {}

function getStableCssSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts = [];
  let cur = el;
  while (cur && cur !== document.body) {
    let seg = cur.tagName.toLowerCase();
    if (cur.id) {
      seg = `#${CSS.escape(cur.id)}`;
      parts.unshift(seg);
      break;
    }
    const siblings = Array.from(cur.parentNode?.children || []).filter(c => c.tagName === cur.tagName);
    if (siblings.length > 1) {
      seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    }
    parts.unshift(seg);
    cur = cur.parentNode;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

function extractElementAnchor(el) {
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return { strategy: 'aria_label', value: ariaLabel };

  const role = el.getAttribute('role')?.trim();
  const text = el.innerText?.trim().slice(0, 80);
  if (role && text) return { strategy: 'semantic_role', value: `${role}:${text}` };

  if (text && text.length > 0 && text.length <= 60) return { strategy: 'text_match', value: text };

  return { strategy: 'css_selector', value: getStableCssSelector(el) };
}

function captureSkillClick(e) {
  if (!isRecordingSkill) return;
  const el = e.target;
  skillEventCount++;
  const ev = {
    eventId: skillEventCount,
    type: 'CLICK',
    timestamp: Date.now(),
    url: window.location.href,
    anchor: extractElementAnchor(el),
    tagName: el.tagName.toLowerCase(),
    ariaLabel: el.getAttribute('aria-label') || null,
    role: el.getAttribute('role') || null,
    text: el.innerText?.trim().slice(0, 80) || null,
    isLink: el.tagName === 'A' || el.closest('a') !== null
  };
  recordedSkillEvents.push(ev);
  console.log('[TeacherAI Recorder] Ação capturada:', ev);

  if (ev.isLink || el.tagName === 'BUTTON' || el.closest('button')) {
    try {
      sessionStorage.setItem('teacher_pending_nav_click', JSON.stringify(ev));
    } catch (e) {}
  }

  // Despacha imediatamente antes que o navegador descarregue a página em caso de navegação
  try {
    chrome.runtime.sendMessage({ action: 'RECORD_ACTION', event: ev }).catch(() => {});
  } catch (err) {}
}

document.addEventListener('click', captureSkillClick, { capture: true, passive: true });

function snapshotPortalTable() {
  const tables = Array.from(document.querySelectorAll('table'));
  const candidates = [];
  tables.forEach((table, tIdx) => {
    const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map(th => th.innerText.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
    rows.slice(0, 5).forEach((row, rIdx) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      cells.forEach((cell, cIdx) => {
        const rawText = cell.innerText.trim();
        if (!rawText) return;
        const headerName = headers[cIdx] || `col_${cIdx}`;
        const colCssIndex = cIdx + 1;
        candidates.push({
          header: headerName,
          sample: rawText.slice(0, 40),
          col: cIdx,
          row: rIdx,
          anchor: {
            strategy: 'css_selector',
            value: `td:nth-child(${colCssIndex})`,
            scope: 'row_current',
            description: `Coluna ${colCssIndex} (${headerName})`
          }
        });
      });
    });
  });
  return candidates;
}


// ——— MOTOR GENÉRICO GRAPHEXECUTOR (LOTE 1 — SKILL GRAPH RUNTIME) ———

const CANONICAL_READ_ROSTER_GRAPH = {
  id: 'skill_read_roster_mtqeirwc',
  name: 'Leitura de read_roster — machado_sobrinho',
  portal_id: 'machado_sobrinho',
  task_id: 'read_roster',
  version: '1.0.0',
  entry_node: 'nav_0',
  nodes: {
    nav_0: {
      id: 'nav_0',
      type: 'NAVIGATE',
      anchor: { strategy: 'css_selector', value: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas' },
      params: {},
      on_success: 'locate_0',
      on_fail: null
    },
    locate_0: {
      id: 'locate_0',
      type: 'LOCATE',
      anchor: { strategy: 'css_selector', value: 'table, div.grid-meus-alunos, [class*="aluno" i]' },
      params: {},
      on_success: 'locate_aluno_row',
      on_fail: null
    },
    locate_aluno_row: {
      id: 'locate_aluno_row',
      type: 'LOCATE',
      anchor: { strategy: 'css_selector', value: 'table tbody tr' },
      params: { multiplicity: 'all' },
      on_success: 'read_0',
      on_fail: null
    },
    read_0: {
      id: 'read_0',
      type: 'READ',
      anchor: { strategy: 'css_selector', value: 'td:nth-child(1)', scope: 'row_current' },
      params: { variable_bindings: ['aluno_nome'] },
      on_success: 'loop_proxima_linha',
      on_fail: null
    },
    loop_proxima_linha: {
      id: 'loop_proxima_linha',
      type: 'LOOP',
      params: { loop_target: 'read_0', collection_node: 'locate_aluno_row' },
      on_success: null,
      on_fail: null
    }
  }
};

function interpolateBindings(template, bindings) {
  if (!template) return '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return bindings[key] !== undefined ? String(bindings[key]) : match;
  });
}

function extractCellText(rowElement, anchorValue, colIndex1Based) {
  if (!rowElement) return null;

  if (typeof rowElement.querySelector === 'function') {
    try {
      const cell = rowElement.querySelector(anchorValue);
      if (cell) {
        return (cell.textContent || cell.innerText || cell.value || '').trim();
      }
    } catch {
      // Ignora erro de seletor
    }
  }

  const cells = rowElement.cells || rowElement.children;
  if (cells && colIndex1Based !== undefined && colIndex1Based <= cells.length) {
    const c = cells[colIndex1Based - 1];
    return (c.textContent || c.innerText || c.value || '').trim();
  }

  return null;
}

async function executeSkillGraph(graph, context = {}) {
  if (!graph || !graph.nodes || !graph.entry_node) {
    return {
      success: false,
      status: 'FAILED',
      error: 'Grafo inválido ou sem nós',
      trace: []
    };
  }

  const bindings = context.bindings || {};
  const trace = [];
  let currentNodeId = graph.entry_node;
  let lastApprovedCheckpointId = null;
  let lastCheckpointPreview = null;
  const executionLimit = 500;
  let stepCount = 0;

  const loopState = {
    rows: [],
    currentIndex: 0,
    collectedRecords: [],
    currentRowBindings: {},
    active: false
  };

  while (currentNodeId && stepCount++ < executionLimit) {
    if (context.pauseControl?.isPaused()) {
      const currentCount = loopState.collectedRecords.length;
      if (context.pauseControl.onPauseStateChange) {
        context.pauseControl.onPauseStateChange(true, currentCount);
      }
      await context.pauseControl.waitForResume();
      if (context.pauseControl.onPauseStateChange) {
        context.pauseControl.onPauseStateChange(false, currentCount);
      }
    }

    if (context.pauseControl?.stepDelayMs && context.pauseControl.stepDelayMs > 0) {
      await new Promise(r => setTimeout(r, context.pauseControl.stepDelayMs));
    }

    const node = graph.nodes[currentNodeId];
    if (!node) {
      trace.push({
        nodeId: currentNodeId,
        nodeType: 'WAIT',
        status: 'FAILED',
        details: 'Nó não encontrado no grafo',
        timestamp: new Date().toISOString()
      });
      return {
        success: false,
        status: 'FAILED',
        finalNodeId: currentNodeId,
        trace,
        error: `Nó '${currentNodeId}' não encontrado.`
      };
    }

    function isRiskNode(n) {
      if (!n) return false;
      if (n.type === 'WRITE') return true;
      if (n.type === 'CLICK' && n.params?.is_submit_action) return true;
      return false;
    }

    // Trava Dupla de Runtime: Nós de risco exigem checkpoint prévio aprovado
    if (isRiskNode(node)) {
      if (!lastApprovedCheckpointId) {
        const errorMsg = `TRAVA DE RUNTIME DISPARADA: Tentativa de executar nó de risco "${node.id}" (${node.type}) sem aprovação de CHECKPOINT correspondente.`;
        console.error('[GraphExecutor]', errorMsg);
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'BLOCKED_BY_SECURITY_LOCK',
          details: errorMsg,
          timestamp: new Date().toISOString()
        });
        return {
          success: false,
          status: 'SECURITY_LOCK_TRIGGERED',
          finalNodeId: node.id,
          trace,
          error: errorMsg
        };
      }
    }

    switch (node.type) {
      case 'CHECKPOINT': {
        const actionDesc = interpolateBindings(node.params?.description || 'Confirmação necessária', bindings);
        lastCheckpointPreview = {
          nodeId: node.id,
          title: 'Aprovação de Ação no Portal',
          description: actionDesc,
          actionSummary: `Prestes a executar ação com dados: ${JSON.stringify(bindings)}`,
          resolvedBindings: { ...bindings },
          nextRiskNodeId: node.on_success
        };
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'CHECKPOINT_PAUSED',
          details: lastCheckpointPreview,
          timestamp: new Date().toISOString()
        });

        let isApproved = false;
        if (context.onCheckpoint) {
          isApproved = await context.onCheckpoint(lastCheckpointPreview);
        } else {
          isApproved = !node.params?.requires_confirmation;
        }

        if (!isApproved) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'ABORTED',
            details: 'Ação cancelada pelo professor no checkpoint',
            timestamp: new Date().toISOString()
          });
          return {
            success: false,
            status: 'ABORTED_BY_USER',
            finalNodeId: node.id,
            trace,
            error: 'Execução cancelada pelo usuário no ponto de conferência.'
          };
        }
        lastApprovedCheckpointId = node.id;
        currentNodeId = node.on_success;
        break;
      }

      case 'LOCATE': {
        const isMulti = node.params?.multiplicity === 'all';
        const selector = node.anchor?.value || '';
        let locatedElements = [];

        if (context.tableRows && context.tableRows.length > 0) {
          locatedElements = [...context.tableRows];
        } else if (context.domProvider?.querySelectorAll) {
          try {
            locatedElements = Array.from(context.domProvider.querySelectorAll(selector));
          } catch {
            locatedElements = [];
          }
        } else if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
          try {
            locatedElements = Array.from(document.querySelectorAll(selector));
          } catch {
            locatedElements = [];
          }
        }

        const resolvedCount = isMulti ? locatedElements.length : (locatedElements.length > 0 ? 1 : 0);
        const allowEmpty = typeof node.params?.allow_empty === 'boolean'
          ? Boolean(node.params.allow_empty)
          : isMulti;

        if (resolvedCount === 0 && !allowEmpty) {
          const errText = `Nenhum elemento localizado para o seletor "${selector}" (multiplicity: ${isMulti ? 'all' : 'single'}, resolvedCount: 0).`;
          console.error(`[GraphExecutor] ❌ ${errText}`);
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'element_resolution',
            details: {
              error: errText,
              multiplicity: isMulti ? 'all' : 'single',
              resolvedCount: 0,
              selector,
              allowEmpty
            },
            timestamp: new Date().toISOString()
          });

          if (node.on_fail) {
            currentNodeId = node.on_fail;
            break;
          } else {
            return {
              success: false,
              status: 'FAILED',
              finalNodeId: node.id,
              trace,
              error: errText
            };
          }
        }

        if (isMulti) {
          loopState.rows = locatedElements;
          loopState.currentIndex = 0;
          loopState.collectedRecords = [];
          loopState.currentRowBindings = {};
          loopState.active = locatedElements.length > 0;
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: 'element_resolution',
          details: {
            multiplicity: isMulti ? 'all' : 'single',
            resolvedCount,
            selector,
            allowEmpty
          },
          timestamp: new Date().toISOString()
        });

        currentNodeId = node.on_success;
        break;
      }

      case 'READ': {
        let readVal = null;
        const anchor = node.anchor;
        const isRowScope = anchor?.scope === 'row_current';

        let colIndex1Based = undefined;
        if (anchor?.value) {
          const nthMatch = anchor.value.match(/nth-child\((\d+)\)/);
          if (nthMatch) {
            colIndex1Based = parseInt(nthMatch[1], 10);
          }
        }

        if (isRowScope && loopState.active && loopState.rows.length > 0) {
          const currentRow = loopState.rows[loopState.currentIndex];
          readVal = extractCellText(currentRow, anchor?.value || '', colIndex1Based);
        } else {
          if (context.domProvider?.querySelector && anchor?.value) {
            try {
              const el = context.domProvider.querySelector(anchor.value);
              readVal = el ? (el.textContent || el.innerText || el.value || '').trim() : null;
            } catch {
              readVal = null;
            }
          } else if (typeof document !== 'undefined' && anchor?.value) {
            try {
              const el = document.querySelector(anchor.value);
              readVal = el ? (el.textContent || el.innerText || el.value || '').trim() : null;
            } catch {
              readVal = null;
            }
          }
        }

        if (readVal === null || readVal === undefined) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            details: {
              error: `Não foi possível ler elemento para âncora "${anchor?.value}" (scope: ${anchor?.scope || 'global'}).`,
              anchor,
              rowIndex: loopState.active ? loopState.currentIndex : undefined
            },
            timestamp: new Date().toISOString()
          });
          currentNodeId = node.on_fail || null;
          break;
        }

        const bindingsList = node.params?.variable_bindings || [];
        for (const varName of bindingsList) {
          bindings[varName] = readVal;
          if (loopState.active) {
            loopState.currentRowBindings[varName] = readVal;
          }
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          details: {
            readValue: readVal,
            variableBindings: bindingsList,
            rowIndex: loopState.active ? loopState.currentIndex : undefined
          },
          timestamp: new Date().toISOString()
        });

        currentNodeId = node.on_success;
        break;
      }

      case 'LOOP': {
        if (!loopState.active || loopState.rows.length === 0) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            details: { message: 'Loop finalizado ou coleção vazia' },
            timestamp: new Date().toISOString()
          });
          currentNodeId = node.on_success;
          break;
        }

        if (Object.keys(loopState.currentRowBindings).length > 0) {
          loopState.collectedRecords.push({ ...loopState.currentRowBindings });
          loopState.currentRowBindings = {};
        }

        loopState.currentIndex++;

        if (loopState.currentIndex < loopState.rows.length) {
          let targetNodeId = node.params?.loop_target;
          if (targetNodeId && graph.nodes[targetNodeId]?.type === 'LOCATE') {
            targetNodeId = graph.nodes[targetNodeId]?.on_success || targetNodeId;
          }
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            details: {
              loopAction: 'CONTINUE_LOOP',
              nextIndex: loopState.currentIndex,
              totalRows: loopState.rows.length,
              targetNodeId
            },
            timestamp: new Date().toISOString()
          });
          currentNodeId = targetNodeId || node.on_success;
        } else {
          loopState.active = false;
          bindings._collected_records = [...loopState.collectedRecords];
          bindings.records = [...loopState.collectedRecords];
          // Alias de compatibilidade retroativa para skills que esperam students
          bindings.students = [...loopState.collectedRecords];

          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            details: {
              loopAction: 'TERMINATE_LOOP',
              totalProcessed: loopState.rows.length,
              recordsCollectedCount: loopState.collectedRecords.length
            },
            timestamp: new Date().toISOString()
          });
          currentNodeId = node.on_success;
        }
        break;
      }

      case 'BRANCH': {
        const cond = node.params?.condition || 'true';
        const isTrue = Boolean(bindings[cond] || cond === 'true');
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          details: { conditionEvaluated: cond, result: isTrue },
          timestamp: new Date().toISOString()
        });
        currentNodeId = isTrue ? node.on_success : node.on_fail;
        break;
      }

      case 'NAVIGATE': {
        const targetUrl = node.anchor?.value || '';
        const preUrl = window.location.href;

        if (!targetUrl) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            verified: true,
            verification_method: 'in_place_no_url',
            details: { message: 'Nó NAVIGATE sem URL especificada; permanência confirmada na página atual.', currentUrl: preUrl },
            timestamp: new Date().toISOString()
          });
          currentNodeId = node.on_success;
          break;
        }

        try {
          const currentPath = window.location.pathname;
          const targetPath = targetUrl ? new URL(targetUrl, window.location.origin).pathname : '';
          if (targetUrl && currentPath !== targetPath && !window.location.href.includes(targetUrl.replace(/\/$/, ''))) {
            if (!window.location.hostname.includes('localhost')) {
              window.location.href = targetUrl;
              await new Promise(r => setTimeout(r, 200));
            }
          }
        } catch (e) {
          console.warn('[GraphExecutor] Falha ao navegar:', e);
        }

        const postUrl = window.location.href;
        const targetNormalized = targetUrl.replace(/\/$/, '').toLowerCase();
        const actualNormalized = postUrl.replace(/\/$/, '').toLowerCase();

        const isMatch = Boolean(actualNormalized && targetNormalized) && (
          actualNormalized === targetNormalized ||
          actualNormalized.includes(targetNormalized) ||
          actualNormalized.endsWith(targetNormalized) ||
          (targetNormalized.startsWith('http') && actualNormalized === targetNormalized)
        );

        if (!isMatch) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'url_changed_or_matched',
            details: {
              error: `Navegação não confirmada: URL esperada "${targetUrl}" não corresponde à URL observada "${postUrl}".`,
              expectedUrl: targetUrl,
              actualUrl: postUrl,
              fromUrl: preUrl
            },
            timestamp: new Date().toISOString()
          });
          if (node.on_fail) {
            currentNodeId = node.on_fail;
            break;
          } else {
            return {
              success: false,
              status: 'FAILED',
              finalNodeId: node.id,
              trace,
              error: `Navegação para "${targetUrl}" não confirmada.`
            };
          }
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: 'url_changed_or_matched',
          details: { targetUrl, currentUrl: postUrl },
          timestamp: new Date().toISOString()
        });
        console.log(`[GraphExecutor] NAVIGATE confirmado para: ${targetUrl}`);
        currentNodeId = node.on_success;
        break;
      }

      case 'CLICK': {
        const anchor = node.anchor;
        const targetVal = anchor?.value || '';
        const strategy = anchor?.strategy || 'css_selector';
        let el = null;

        // 1. Tenta por seletor CSS
        if (targetVal && (strategy === 'css_selector' || targetVal.startsWith('#') || targetVal.startsWith('.') || targetVal.includes('['))) {
          try {
            el = (context.domProvider || document).querySelector(targetVal);
          } catch (e) {}
        }

        // 2. Tenta por texto em botões, links e menus (ex: "Início", "Salvar", "Diários")
        if (!el) {
          const searchTexts = [targetVal, anchor?.description].filter(Boolean).map(t => t.trim().toLowerCase());
          const candidates = Array.from((context.domProvider || document).querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], li, span'));
          el = candidates.find(c => {
            const txt = (c.textContent || c.innerText || c.value || '').trim().toLowerCase();
            return searchTexts.some(st => txt === st || (txt.length <= 50 && txt.includes(st)));
          });
        }

        // Validação Estrita: Se não encontrou o elemento, é FALHA REAL
        if (!el) {
          const errText = `Elemento não localizado na página: "${targetVal || anchor?.description || 'botão/link'}"`;
          console.error(`[GraphExecutor] ❌ ${errText}`);
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'element_resolution',
            details: { error: errText, anchor },
            timestamp: new Date().toISOString()
          });

          if (node.on_fail) {
            currentNodeId = node.on_fail;
            break;
          } else {
            return {
              success: false,
              status: 'FAILED',
              finalNodeId: node.id,
              trace,
              error: errText
            };
          }
        }

        // Captura estado pré-clique
        const preUrl = window.location.href;
        const preInDoc = document.contains(el);
        const preDisabled = Boolean(el.disabled || el.getAttribute('disabled') !== null);
        const preClass = String(el.className || '');

        console.log('[GraphExecutor] Executando CLICK no elemento:', el);
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus?.();
          if (typeof MouseEvent !== 'undefined') {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          }
          el.click();
        } catch (e) {
          console.warn('[GraphExecutor] Erro ao disparar evento de clique:', e);
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'dom_click_dispatch',
            details: { error: e.message || String(e), anchor },
            timestamp: new Date().toISOString()
          });
          if (node.on_fail) { currentNodeId = node.on_fail; break; }
          return { success: false, status: 'FAILED', finalNodeId: node.id, trace, error: e.message };
        }

        // Aguarda ciclo de microtask para avaliar mutações observáveis
        await new Promise(r => setTimeout(r, 80));

        const postUrl = window.location.href;
        const postInDoc = document.contains(el);
        const postDisabled = Boolean(el.disabled || el.getAttribute('disabled') !== null);
        const postClass = String(el.className || '');

        let clickVerified = false;
        let verificationMethod = 'observable_mutation';
        let changeDetails = {};

        if (postUrl !== preUrl) {
          clickVerified = true;
          verificationMethod = 'url_navigation';
          changeDetails = { from: preUrl, to: postUrl };
        } else if (preInDoc && !postInDoc) {
          clickVerified = true;
          verificationMethod = 'element_removed_from_dom';
          changeDetails = { elementRemoved: true };
        } else if (node.params?.expected_target) {
          const targetEl = (context.domProvider || document).querySelector(node.params.expected_target);
          if (targetEl) {
            clickVerified = true;
            verificationMethod = 'expected_target_appeared';
            changeDetails = { target: node.params.expected_target };
          }
        } else if (preDisabled !== postDisabled || preClass !== postClass) {
          clickVerified = true;
          verificationMethod = 'element_state_mutated';
          changeDetails = { disabled: postDisabled, class: postClass };
        } else if (node.params?.is_submit_action) {
          clickVerified = false;
          verificationMethod = 'submit_no_observable_change';
        } else {
          clickVerified = false;
          verificationMethod = 'no_observable_dom_mutation';
        }

        if (!clickVerified) {
          const errText = `Ação de clique realizada, mas nenhum efeito observável foi confirmado no DOM ou URL (heurística: ${verificationMethod}).`;
          console.error(`[GraphExecutor] ❌ ${errText}`);
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: verificationMethod,
            details: {
              error: errText,
              clickedElement: targetVal,
              isSubmit: Boolean(node.params?.is_submit_action)
            },
            timestamp: new Date().toISOString()
          });

          if (node.on_fail) {
            currentNodeId = node.on_fail;
            break;
          } else {
            return {
              success: false,
              status: 'FAILED',
              finalNodeId: node.id,
              trace,
              error: errText
            };
          }
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: verificationMethod,
          details: {
            clickedElement: targetVal,
            found: true,
            tagName: el.tagName,
            textSnippet: (el.textContent || '').trim().slice(0, 50),
            isSubmit: Boolean(node.params?.is_submit_action),
            mutation: changeDetails
          },
          timestamp: new Date().toISOString()
        });

        // Consome a autorização de risco do checkpoint
        lastApprovedCheckpointId = null;
        currentNodeId = node.on_success;
        break;
      }

      case 'WRITE': {
        const selector = node.anchor?.value;
        const valToWrite = interpolateBindings(node.params?.action_value || '', bindings);
        let el = null;
        if (selector) {
          try {
            el = (context.domProvider || document).querySelector(selector);
          } catch (e) {}
        }

        if (!el) {
          const errText = `Campo de formulário não localizado: "${selector}"`;
          console.error(`[GraphExecutor] ❌ ${errText}`);
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'element_resolution',
            details: { error: errText, selector },
            timestamp: new Date().toISOString()
          });

          if (node.on_fail) {
            currentNodeId = node.on_fail;
            break;
          } else {
            return {
              success: false,
              status: 'FAILED',
              finalNodeId: node.id,
              trace,
              error: errText
            };
          }
        }

        console.log(`[GraphExecutor] Executando WRITE nativo no elemento "${selector}":`, valToWrite);
        try {
          setFieldValue(el, valToWrite);
        } catch (e) {
          console.warn('[GraphExecutor] Erro ao disparar evento de escrita nativo:', e);
        }

        // Verificação Sistêmica: confirmação por read-back do valor persistido
        const readBackValue = String(el.value !== undefined ? el.value : (el.innerText || el.textContent || '')).trim();
        const expectedValue = valToWrite.trim();
        const writeVerified = (readBackValue === expectedValue) || (expectedValue !== '' && readBackValue.includes(expectedValue));

        if (!writeVerified) {
          const errText = `Valor escrito não persistiu no elemento. Esperado: "${expectedValue}", Lido: "${readBackValue}".`;
          console.error(`[GraphExecutor] ❌ ${errText}`);
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'read_back_input_value',
            details: {
              error: errText,
              expected: expectedValue,
              actual: readBackValue,
              field: selector
            },
            timestamp: new Date().toISOString()
          });

          if (node.on_fail) {
            currentNodeId = node.on_fail;
            break;
          } else {
            return {
              success: false,
              status: 'FAILED',
              finalNodeId: node.id,
              trace,
              error: errText
            };
          }
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: 'read_back_input_value',
          details: {
            field: selector,
            writtenValue: valToWrite,
            persistedValue: readBackValue,
            found: true
          },
          timestamp: new Date().toISOString()
        });

        // Consome a autorização de risco do checkpoint
        lastApprovedCheckpointId = null;
        currentNodeId = node.on_success;
        break;
      }

      case 'WAIT': {
        const delayMs = Number(node.params?.duration_ms) || 500;
        const waitSelector = node.anchor?.value || node.params?.wait_until;

        if (waitSelector) {
          const timeoutMs = Number(node.params?.timeout_ms) || 5000;
          const start = Date.now();
          let elFound = false;
          while (Date.now() - start < timeoutMs) {
            const el = (context.domProvider || document).querySelector(waitSelector);
            if (el) {
              elFound = true;
              break;
            }
            await new Promise(r => setTimeout(r, 50));
          }

          if (!elFound) {
            const errText = `Elemento "${waitSelector}" não surgiu no DOM após ${timeoutMs}ms.`;
            trace.push({
              nodeId: node.id,
              nodeType: node.type,
              status: 'FAILED',
              verified: false,
              verification_method: 'dom_condition_wait',
              details: { error: errText, waitSelector, timeoutMs },
              timestamp: new Date().toISOString()
            });
            if (node.on_fail) { currentNodeId = node.on_fail; break; }
            return { success: false, status: 'FAILED', finalNodeId: node.id, trace, error: errText };
          }

          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            verified: true,
            verification_method: 'dom_condition_wait',
            details: { waitSelector, elapsedMs: Date.now() - start },
            timestamp: new Date().toISOString()
          });
        } else {
          await new Promise(r => setTimeout(r, delayMs));
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            verified: true,
            verification_method: 'timer_elapsed',
            details: { waitMs: delayMs },
            timestamp: new Date().toISOString()
          });
        }
        currentNodeId = node.on_success;
        break;
      }

      default: {
        const errText = `Tipo de nó "${node.type}" não possui rotina de verificação observável implementada (fallback restritivo).`;
        console.error(`[GraphExecutor] ❌ ${errText}`);
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'FAILED',
          verified: false,
          verification_method: 'unverified_fallback_contract',
          details: {
            error: errText,
            nodeType: node.type,
            anchor: node.anchor?.value
          },
          timestamp: new Date().toISOString()
        });

        if (node.on_fail) {
          currentNodeId = node.on_fail;
          break;
        } else {
          return {
            success: false,
            status: 'FAILED',
            finalNodeId: node.id,
            trace,
            bindings,
            error: errText
          };
        }
      }
    }

    if (currentNodeId === 'ABORT') {
      return {
        success: false,
        status: 'ABORTED_BY_USER',
        finalNodeId: 'ABORT',
        trace,
        bindings
      };
    }
  }

  const lastStep = trace[trace.length - 1];
  if (lastStep && lastStep.status === 'FAILED') {
    return {
      success: false,
      status: 'FAILED',
      finalNodeId: lastStep.nodeId,
      trace,
      bindings,
      error: lastStep.details?.error || `Execução falhou no nó "${lastStep.nodeId}" (${lastStep.nodeType}).`
    };
  }

  const isCompleted = stepCount < executionLimit;
  return {
    success: isCompleted,
    status: isCompleted ? 'COMPLETED' : 'FAILED',
    finalNodeId: currentNodeId,
    trace,
    bindings,
    error: isCompleted ? undefined : 'Limite de 500 passos atingido (loop infinito).'
  };
}

// ——— EXTRATOR UNIVERSAL DE ALUNOS (TABELAS, CARDS, DIVS, GRIDS — FALLBACK BESPOKE) ———

function universalExtractStudents() {
  const students = [];
  const seenNames = new Set();

  function addStudent(name, matricula, raw) {
    if (!name) return;
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const lower = cleanName.toLowerCase();
    // Filtra cabeçalhos e rótulos
    if (cleanName.length < 3 || cleanName.length > 70) return;
    if (/^(nome|aluno|matrícula|matricula|situação|situacao|status|total|relat|ações|acoes|turma|professor|perfil|código|codigo)$/i.test(lower)) return;
    if (seenNames.has(lower)) return;
    seenNames.add(lower);
    students.push({
      name: cleanName,
      matricula: (matricula || '').trim(),
      rawSnippet: (raw || cleanName).slice(0, 80)
    });
  }

  // ESTRATÉGIA 1: Tabelas padrão (table > tr)
  const tables = Array.from(document.querySelectorAll('table'));
  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) continue;

    const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map(c => (c.innerText || '').trim().toLowerCase());
    let nameCol = headerCells.findIndex(h => /nome|aluno|estudante|student/i.test(h));
    let matCol  = headerCells.findIndex(h => /matr|reg|cod|ra/i.test(h));

    if (nameCol === -1) {
      // Se não achou cabeçalho explícito, procura a coluna com texto que parece nome de pessoa
      nameCol = 1;
    }

    for (let i = 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td, th'));
      if (cells.length === 0) continue;
      const nameText = (cells[nameCol]?.innerText || cells[0]?.innerText || '').trim();
      const matText  = matCol >= 0 ? (cells[matCol]?.innerText || '').trim() : '';
      if (nameText && /^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(nameText)) {
        addStudent(nameText, matText, rows[i].innerText);
      }
    }
    if (students.length >= 2) return students;
  }

  // ESTRATÉGIA 2: Grade de Cartões / Divs (padrão Machado Sobrinho: .grid-meus-alunos, .card-aluno, etc.)
  const cardContainers = Array.from(document.querySelectorAll(
    'div.grid-meus-alunos, div.meus-alunos-grid, [class*="alunos" i], [class*="student" i], [class*="roster" i], main, #conteudo, .container'
  ));

  for (const container of cardContainers) {
    // Procura cartões filhos
    let cards = Array.from(container.querySelectorAll(
      '[class*="card" i], [class*="item" i], [class*="aluno" i], [class*="linha" i], [class*="row" i]'
    )).filter(c => {
      const t = (c.innerText || '').trim();
      return t.length >= 4 && t.length <= 400 && !c.querySelector('[class*="card" i]');
    });

    if (cards.length < 2) {
      // Tenta pegar filhos diretos que tenham altura razoável
      cards = Array.from(container.children).filter(c => {
        const t = (c.innerText || '').trim();
        return t.length >= 4 && t.length <= 400;
      });
    }

    if (cards.length >= 2) {
      for (const card of cards) {
        const fullText = (card.innerText || '').trim();
        let name = '';
        let mat = '';

        // Tenta achar nome por seletor
        const nameEl = card.querySelector(
          '[class*="nome" i], [class*="name" i], [class*="title" i], h1, h2, h3, h4, h5, strong, b'
        );
        if (nameEl) {
          const t = (nameEl.innerText || '').trim();
          if (t.length >= 3 && /^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(t)) {
            name = t;
          }
        }

        // Se não achou elemento, busca a primeira linha com cara de nome
        if (!name) {
          const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            if (/^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(line) && line.length >= 3 && !/^(matr|status|turma|aluno|nome)/i.test(line)) {
              name = line;
              break;
            }
          }
        }

        // Tenta achar matrícula
        const matMatch = fullText.match(/(?:matr[íi]cula|c[óo]d(?:igo)?|ra|id)[:\s#]*([a-zA-Z0-9\-\.\/]+)/i);
        if (matMatch) mat = matMatch[1];

        if (name) addStudent(name, mat, fullText);
      }
    }
    if (students.length >= 2) return students;
  }

  // ESTRATÉGIA 3: Listas padrão (ul > li, ol > li)
  const listItems = Array.from(document.querySelectorAll('ul > li, ol > li'));
  if (listItems.length >= 2) {
    for (const li of listItems) {
      const t = (li.innerText || '').trim();
      const firstLine = t.split('\n')[0].trim();
      if (/^[A-Za-zÀ-ÿ\s\.\'\-]+$/.test(firstLine) && firstLine.length >= 3 && firstLine.length <= 60) {
        const matMatch = t.match(/(?:matr[íi]cula|c[óo]d|ra)[:\s#]*([a-zA-Z0-9]+)/i);
        addStudent(firstLine, matMatch ? matMatch[1] : '', t);
      }
    }
  }

  return students;
}


// ═══════════════════════════════════════════════════════════════════════════════
// ROTA B: BRIDGE EXTENSÃO-APP (postMessage + content script com validação estrita)
// ═══════════════════════════════════════════════════════════════════════════════
const ALLOWED_APP_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

window.addEventListener('message', async (event) => {
  // Ignora mensagens sem payload ou de fontes não estruturadas
  if (!event.data || typeof event.data !== 'object') return;

  // ─── PING DE CONEXÃO DO RELAY ──────────────────────────────────────────────
  if (event.data.type === 'TEACHER_RELAY_PING') {
    if (!ALLOWED_APP_ORIGINS.includes(event.origin)) return;
    window.postMessage({
      type: 'TEACHER_RELAY_PONG',
      requestId: event.data.requestId || null,
      payload: { online: true, version: '3.1' }
    }, event.origin);
    return;
  }

  // ─── RELAY DE EXECUÇÃO DE FERRAMENTAS DO APP PARA A EXTENSÃO ───────────────
  if (event.data.type === 'TEACHER_RELAY_TO_EXTENSION') {
    if (!ALLOWED_APP_ORIGINS.includes(event.origin)) {
      console.warn(`[TeacherRelayBridge] ⛔ Origem rejeitada: "${event.origin}"`);
      return;
    }

    const { requestId, payload } = event.data;

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'RELAY_TOOL_EXECUTION',
          requestId,
          payload
        }, (resp) => {
          if (chrome.runtime.lastError) {
            window.postMessage({
              type: 'TEACHER_RELAY_RESPONSE',
              requestId,
              payload: {
                success: false,
                status: 'extension_error',
                error: chrome.runtime.lastError.message
              }
            }, event.origin);
            return;
          }

          window.postMessage({
            type: 'TEACHER_RELAY_RESPONSE',
            requestId,
            payload: resp || { success: false, error: 'Resposta vazia da extensão.' }
          }, event.origin);
        });
      } else {
        window.postMessage({
          type: 'TEACHER_RELAY_RESPONSE',
          requestId,
          payload: {
            success: false,
            status: 'extension_unavailable',
            error: 'API chrome.runtime não disponível no contexto da página.'
          }
        }, event.origin);
      }
    } catch (err) {
      window.postMessage({
        type: 'TEACHER_RELAY_RESPONSE',
        requestId,
        payload: {
          success: false,
          status: 'relay_exception',
          error: err.message
        }
      }, event.origin);
    }
    return;
  }

  if (event.data.type === 'TEACHER_BRIDGE_COMMAND') {
    // 1. VALIDAÇÃO DE ORIGEM OBRIGATÓRIA (Item 2.2)
    if (!ALLOWED_APP_ORIGINS.includes(event.origin)) {
      console.warn(`[TeacherBridge] ⛔ Mensagem descartada — Origem rejeitada: "${event.origin}". Origens permitidas: ${ALLOWED_APP_ORIGINS.join(', ')}`);
      return;
    }

    console.log(`[TeacherBridge] ✅ Mensagem válida recebida da origem confiável (${event.origin}):`, event.data);
    const payload = event.data.payload || {};

    try {
      // Repassa para o endpoint /api/skills/interpret
      const res = await fetch('http://localhost:3000/api/skills/interpret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-byok-key': payload.byokKey || 'gsk_mock_test_key_for_development_placeholder'
        },
        body: JSON.stringify({
          text: payload.text || '',
          portalId: payload.portalId || 'machado_sobrinho',
          turmaId: payload.turmaId || null,
          source: 'bridge_app'
        })
      });

      const result = await res.json();
      console.log('[TeacherBridge] Resposta do interpretador recebida:', result);

      // Devolve resposta de forma visível para a própria UI do app
      window.postMessage({
        type: 'TEACHER_BRIDGE_RESPONSE',
        requestId: event.data.requestId || null,
        payload: result
      }, event.origin);

    } catch (err) {
      console.error('[TeacherBridge] Erro ao comunicar com endpoint de interpretação:', err);
      window.postMessage({
        type: 'TEACHER_BRIDGE_RESPONSE',
        requestId: event.data.requestId || null,
        payload: { ok: false, error: err.message }
      }, event.origin);
    }
  }
});

// ——— OTIMIZAÇÕES AVANÇADAS: DOM Settled, Spatial Anchoring e Auto-Draft ———

/**
 * Aguarda o DOM atingir o estado de repouso absoluto (zero mutações) após re-renders assíncronos.
 */
function isDomSettled(timeoutMs = 2000, debounceMs = 250) {
  return new Promise((resolve) => {
    let timer = null;
    const maxTimeout = setTimeout(() => {
      cleanup();
      resolve(true);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        resolve(true);
      }, debounceMs);
    });

    function cleanup() {
      if (timer) clearTimeout(timer);
      clearTimeout(maxTimeout);
      observer.disconnect();
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    timer = setTimeout(() => {
      cleanup();
      resolve(true);
    }, debounceMs);
  });
}

/**
 * Localiza um input horizontalmente alinhado à direita de um elemento de rótulo (ex: nome do aluno).
 * Imune a classes CSS efêmeras ou ausência de IDs.
 */
function findInputBySpatialAnchor(labelElement, maxDistanceX = 500, maxToleranceY = 20) {
  if (!labelElement) return null;
  const rectLabel = labelElement.getBoundingClientRect();
  const labelRight = rectLabel.right;
  const labelCenterY = rectLabel.top + rectLabel.height / 2;

  const candidateInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, div[contenteditable="true"]'));
  let bestMatch = null;
  let minDistance = Infinity;

  for (const input of candidateInputs) {
    const rectInput = input.getBoundingClientRect();
    if (rectInput.width === 0 || rectInput.height === 0) continue;

    if (rectInput.left < rectLabel.left) continue;

    const distX = rectInput.left - labelRight;
    if (distX < -10 || distX > maxDistanceX) continue;

    const inputCenterY = rectInput.top + rectInput.height / 2;
    const diffY = Math.abs(inputCenterY - labelCenterY);

    if (diffY <= maxToleranceY) {
      if (distX < minDistance) {
        minDistance = distX;
        bestMatch = input;
      }
    }
  }

  return bestMatch;
}

/**
 * Captura um snapshot leve de todos os campos preenchidos no formulário (Anti-perda de trabalho).
 */
function captureFormSnapshot(storageKey = 'teacher_ai_form_draft') {
  try {
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
    const draft = [];
    inputs.forEach((el, idx) => {
      const val = el.value;
      if (val) {
        draft.push({
          idx,
          id: el.id || null,
          name: el.name || null,
          value: val
        });
      }
    });
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
    return draft.length;
  } catch (e) {
    return 0;
  }
}

/**
 * Restaura o snapshot previamente salvo no sessionStorage.
 */
function restoreFormSnapshot(storageKey = 'teacher_ai_form_draft') {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return 0;
    const draft = JSON.parse(raw);
    let restored = 0;
    draft.forEach(item => {
      let el = null;
      if (item.id) el = document.getElementById(item.id);
      if (!el && item.name) el = document.querySelector(`[name="${item.name}"]`);
      if (el) {
        setFieldValue(el, item.value);
        restored++;
      }
    });
    return restored;
  } catch (e) {
    return 0;
  }
}

window.isDomSettled = isDomSettled;
window.findInputBySpatialAnchor = findInputBySpatialAnchor;
window.captureFormSnapshot = captureFormSnapshot;
window.restoreFormSnapshot = restoreFormSnapshot;

} // end if (!window.__teacherAgentLoaded)

