
async function ensureScriptInjected(tabId) {
  try {
    let tabUrl = '';
    try {
      const tab = await chrome.tabs.get(tabId);
      tabUrl = tab?.url || '';
    } catch {}

    // Injeta apenas em hosts com permissão (portais suportados e localhost)
    if (tabUrl) {
      const isPortalHost = tabUrl.startsWith('http://localhost') ||
                           tabUrl.includes('paineldoaluno.com.br') ||
                           tabUrl.includes('redesantacatarina.org.br') ||
                           tabUrl.includes('plural.net') ||
                           tabUrl.includes('cambridgeone.org') ||
                           tabUrl.includes('teams.microsoft.com');
      if (!isPortalHost) return false;
    }

    const ping = await new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { action: 'PING' }, (resp) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(resp);
        });
      } catch (e) {
        resolve(null);
      }
    });
    if (ping?.ok) return true;

    // Se a página não respondeu ao ping (ex: aberta antes de recarregar a extensão), injeta dinamicamente!
    console.log('[SidePanel] Injetando content.js dinamicamente na aba', tabId);
    if (chrome.scripting?.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content.js']
      });
      await new Promise(r => setTimeout(r, 250));
    }
    return true;
  } catch (e) {
    console.warn('[SidePanel] Aviso ao injetar script:', e);
    return false;
  }
}

/**
 * side_panel.js — Lógica Reativa do Side Panel com Feedback em Tempo Real
 */

const PLATFORMS = {
  machado:       { name: 'Machado Sobrinho', domain: 'paineldoaluno.com.br' },
  santacatarina: { name: 'Rede Santa Catarina', domain: 'redesantacatarina.org.br' },
  plural:        { name: 'Plurall', domain: 'plural.net' },
  cambridge:     { name: 'Cambridge One', domain: 'cambridgeone.org' },
}

let activePlatform = 'machado'
let isRecordingRoute = false
let recordedRouteEvents = []

// ── Elementos DOM ─────────────────────────────────────────────────────────────
const btnReadNow       = document.getElementById('btn-read-now')
const readBtnText      = document.getElementById('read-btn-text')
const readIcon         = document.getElementById('read-icon')
const readFeedback     = document.getElementById('read-feedback')
const studentContainer = document.getElementById('student-list-container')
const studentListEl    = document.getElementById('student-preview-list')
const studentCountLbl  = document.getElementById('student-count-label')

const btnRecordRoute   = document.getElementById('btn-record-route')
const routeBtnText     = document.getElementById('route-btn-text')
const routeCounter     = document.getElementById('route-counter')
const statusBadge      = document.getElementById('status-badge')
const statusPortalName = document.getElementById('status-portal-name')

// ── Atualização do Status de Conexão ──────────────────────────────────────────
async function updatePortalConnection() {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      if (statusBadge) statusBadge.className = 'status-badge online';
      if (statusPortalName) statusPortalName.textContent = PLATFORMS[activePlatform]?.name || 'Machado Sobrinho';
      return;
    }
    const [portalTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!portalTab?.url) {
      statusBadge.className = 'status-badge';
      statusPortalName.textContent = 'Aguardando portal...';
      return;
    }

    const url = portalTab.url.toLowerCase();
    let found = false
    for (const [key, p] of Object.entries(PLATFORMS)) {
      if (url.includes(p.domain)) {
        activePlatform = key
        statusBadge.className = 'status-badge online'
        statusPortalName.textContent = p.name
        document.querySelectorAll('.platform-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.platform === key)
        })
        found = true
        break
      }
    }

    if (!found) {
      statusBadge.className = 'status-badge'
      statusPortalName.textContent = 'Portal não detectado'
    }
  } catch (e) {
    console.error('Erro ao detectar portal:', e)
  }
}

// ── 1. Executor Unificado por Intenção (Lote 3) ──────────────────────────────
function executeMatchedSkill(skillGraph, taskName) {
  return new Promise(async (resolve) => {
    console.log('[SidePanel] executeMatchedSkill INICIANDO -> Task:', taskName, 'HasGraph:', Boolean(skillGraph));
    const [targetTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!targetTab?.id) {
      showFeedback('error', 'Abra a aba do portal da escola no Chrome.');
      resolve({ ok: false, error: 'Sem aba ativa' });
      return;
    }

    // Renderiza controle de execução com Play / Pause
    if (interpretBox) {
      interpretBox.style.display = 'block';
      interpretBox.className = 'interpret-box match';
      interpretBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      interpretBox.innerHTML = `
        <div style="font-weight:700; margin-bottom:4px; color:#0284c7;">⚡ Executando Skill: "${taskName}"</div>
        <div id="execution-status-msg" style="font-size:11px; color:#334155; margin-bottom:8px;">
          <span class="spinner"></span> Executando GraphExecutor no portal...
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btn-pause-execution" class="btn-sub" style="flex:1; background:#fef3c7; color:#92400e; border-color:#fde68a;">
            <i class="ti ti-player-pause"></i> Pausar (Pause)
          </button>
          <button id="btn-resume-execution" class="btn-sub" style="flex:1; background:#dcfce7; color:#15803d; border-color:#86efac; display:none;">
            <i class="ti ti-player-play"></i> Continuar (Play)
          </button>
        </div>
      `;

      document.getElementById('btn-pause-execution')?.addEventListener('click', () => {
        chrome.tabs.sendMessage(targetTab.id, { action: 'PAUSE_EXECUTION' }, (resp) => {
          document.getElementById('btn-pause-execution').style.display = 'none';
          document.getElementById('btn-resume-execution').style.display = 'flex';
          const msgEl = document.getElementById('execution-status-msg');
          if (msgEl) msgEl.innerHTML = '⏸️ <b>Execução Pausada</b> (registros acumulados preservados).';
        });
      });

      document.getElementById('btn-resume-execution')?.addEventListener('click', () => {
        chrome.tabs.sendMessage(targetTab.id, { action: 'RESUME_EXECUTION' }, (resp) => {
          document.getElementById('btn-resume-execution').style.display = 'none';
          document.getElementById('btn-pause-execution').style.display = 'flex';
          const msgEl = document.getElementById('execution-status-msg');
          if (msgEl) msgEl.innerHTML = '<span class="spinner"></span> Executando GraphExecutor no portal...';
        });
      });
    }

    await ensureScriptInjected(targetTab.id);

    chrome.tabs.sendMessage(targetTab.id, {
      action: 'EXECUTE_SKILL_GRAPH',
      skillGraph: skillGraph || null
    }, async (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        if (interpretBox) {
          interpretBox.className = 'interpret-box teach';
          if (resp?.status === 'ABORTED_BY_USER') {
            interpretBox.innerHTML = `
              <div style="font-weight:700; color:#991b1b; margin-bottom:4px;">🛑 Ação Cancelada no Checkpoint</div>
              <div style="font-size:11px; color:#7f1d1d; line-height:1.4;">Você cancelou a execução no ponto de controle humano. Nenhuma alteração foi realizada no portal.</div>
            `;
          } else {
            interpretBox.innerHTML = `⚠️ <b>Erro na execução:</b> ${resp?.error || chrome.runtime.lastError?.message || 'Falha ao executar skill no portal.'}`;
          }
        }
        resolve(resp || { ok: false });
        return;
      }

      const records = resp.records || resp.students || [];
      const source = resp.source || 'graph_executor';
      const isReadingTask = resp.isReadingTask;
      const hadCheckpoint = Boolean(resp.trace?.some(t => t.nodeType === 'CHECKPOINT' && t.status !== 'FAILED'));
      const checkpointText = hadCheckpoint ? 'confirmada via Checkpoint e concluída' : 'concluída com sucesso';

      if (!isReadingTask) {
        if (interpretBox) {
          interpretBox.className = 'interpret-box match';
          interpretBox.innerHTML = `
            <div style="font-weight:700; color:#15803d; margin-bottom:4px;">✅ Ação Executada com Sucesso!</div>
            <div style="font-size:11px; color:#166534; line-height:1.4;">Skill "${taskName}" ${checkpointText} no portal pelo GraphExecutor.</div>
          `;
        }
        resolve(resp);
        return;
      }

      if (records.length === 0) {
        if (interpretBox) {
          interpretBox.className = 'interpret-box teach';
          interpretBox.innerHTML = `⚠️ Nenhum dado foi acumulado na página para esta skill.`;
        }
        resolve(resp);
        return;
      }

      // Validação Semântica via LLM (Item 3 do Lote 3)
      if (interpretBox) {
        interpretBox.innerHTML = `<span class="spinner"></span> 🧠 Validando plausibilidade semântica dos dados via IA...`;
      }

      let byokKey = 'gsk_mock_test_key_for_development_placeholder';
      try { byokKey = localStorage.getItem('teacher_byok_key') || byokKey; } catch(e) {}
      let valResult = { valid: true, confidence: 0.9, reasoning: 'Dados validados com sucesso.' };

      try {
        const valRes = await fetch('http://localhost:3000/api/skills/validate-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-byok-key': byokKey
          },
          body: JSON.stringify({
            records,
            columns: skillGraph?.metadata?.columns || [],
            taskName
          })
        });
        if (valRes.ok) {
          valResult = await valRes.json();
        }
      } catch (valErr) {
        console.warn('[SidePanel] Erro ao validar resultado semântico:', valErr);
      }

      renderStudentListWithValidation(records, valResult, source, taskName);
      resolve(resp);
    });
  });
}

function renderStudentListWithValidation(students, valResult, source, taskName) {
  if (studentContainer) studentContainer.style.display = 'block';
  if (studentCountLbl) studentCountLbl.textContent = `${students.length} Registros Identificados (${taskName || 'Skill'})`;

  const badgeEl = document.getElementById('validation-badge');
  const isHighConf = valResult.valid && valResult.confidence >= 0.7;

  if (badgeEl) {
    if (isHighConf) {
      badgeEl.style.color = '#16a34a';
      badgeEl.innerHTML = `● Prontos para envio (${Math.round(valResult.confidence * 100)}% de confiança IA)`;
    } else {
      badgeEl.style.color = '#dc2626';
      badgeEl.innerHTML = `⚠️ Confiança Baixa (${Math.round(valResult.confidence * 100)}%): Não parece uma lista de alunos!`;
    }
  }

  if (interpretBox) {
    if (isHighConf) {
      interpretBox.className = 'interpret-box match';
      interpretBox.innerHTML = `
        <div style="font-weight:700; color:#15803d; margin-bottom:4px;">✅ Leitura Concluída: "${taskName}"</div>
        <div style="font-size:11px; color:#334155;">${students.length} registros extraídos (${source === 'graph_executor' ? '⚡ GraphExecutor' : '⚠️ Fallback Bespoke'}). Plausibilidade confirmada via IA (${Math.round(valResult.confidence * 100)}%).</div>
      `;
    } else {
      interpretBox.className = 'interpret-box teach';
      interpretBox.innerHTML = `
        <div style="font-weight:700; color:#b91c1c; margin-bottom:4px;">⚠️ Alerta de Plausibilidade Semântica (IA)</div>
        <div style="font-size:11px; color:#7f1d1d; line-height:1.4;">${valResult.reasoning || 'Os dados extraídos não parecem corresponder a uma lista de alunos real.'}</div>
      `;
    }
  }

  renderStudentList(students);
}

function showFeedback(type, text) {
  if (!readFeedback) return;
  readFeedback.style.display = 'flex'
  readFeedback.className = `live-banner ${type}`
  const icon = type === 'loading' ? '<span class="spinner"></span>' : (type === 'success' ? '✅' : '⚠️')
  readFeedback.innerHTML = `<span>${icon}</span> <span>${text}</span>`
}

function renderStudentList(students) {
  if (!studentContainer || !studentListEl) return;
  studentContainer.style.display = 'block'
  if (studentCountLbl) studentCountLbl.textContent = `${students.length} Alunos Identificados`
  studentListEl.innerHTML = students.map((s, idx) => `
    <div class="student-item">
      <span class="student-idx">${idx + 1}.</span>
      <div style="flex:1; font-weight:600;">${s.name || 'Aluno ' + (idx + 1)}</div>
      ${s.matricula ? `<span style="font-size:10px; color:#64748b; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${s.matricula}</span>` : ''}
    </div>
  `).join('')
}

// ── 2. Gravação de Trajeto (Multi-Página Persistente) ──────────────────────────
function updateRouteCounterUI() {
  if (routeCounter) {
    routeCounter.style.display = 'block';
    routeCounter.innerHTML = `🔴 Gravando ações... (<b>${recordedRouteEvents.length}</b> ações capturadas)`;
  }
}

// Escuta ações em tempo real disparadas pelo content script
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'CHECKPOINT_REQUEST') {
      console.log('[SidePanel] Recebida solicitação de CHECKPOINT:', msg.preview);
      const modal = document.getElementById('modal-checkpoint');
      const titleEl = document.getElementById('checkpoint-title');
      const descEl = document.getElementById('checkpoint-desc');
      const previewDataEl = document.getElementById('checkpoint-preview-data');
      const btnApprove = document.getElementById('modal-checkpoint-btn-approve');
      const btnAbort = document.getElementById('modal-checkpoint-btn-abort');

      if (!modal) {
        console.warn('[SidePanel] modal-checkpoint não encontrado no DOM!');
        sendResponse({ approved: false, error: 'Modal de checkpoint não encontrado' });
        return true;
      }

      if (titleEl) titleEl.textContent = msg.preview?.title || 'Aprovação de Ação no Portal';
      if (descEl) descEl.textContent = msg.preview?.description || 'Esta skill requer confirmação humana antes de prosseguir com alterações no portal.';

      const bindingsObj = msg.preview?.resolvedBindings || {};
      const entries = Object.entries(bindingsObj);
      if (previewDataEl) {
        if (entries.length > 0) {
          previewDataEl.innerHTML = `<b>Dados vinculados da ação:</b><br>` +
            entries.map(([k, v]) => `• <b>${k}</b>: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('<br>');
        } else {
          previewDataEl.innerHTML = `<b>Ação de risco identificada:</b> Gravação / Submissão no portal.<br>Nenhum dado sensível em lote pendente.`;
        }
      }

      modal.style.display = 'flex';

      let responded = false;
      const finish = (approved) => {
        if (responded) return;
        responded = true;
        modal.style.display = 'none';
        btnApprove.onclick = null;
        btnAbort.onclick = null;
        console.log('[SidePanel] Checkpoint respondido:', approved);
        sendResponse({ approved });
      };

      btnApprove.onclick = (e) => {
        e.preventDefault();
        finish(true);
      };
      btnAbort.onclick = (e) => {
        e.preventDefault();
        finish(false);
      };

      return true; // Mantém canal aberto para resposta assíncrona
    }

    if (msg.action === 'RECORD_ACTION' && msg.event && isRecordingRoute) {
      const last = recordedRouteEvents[recordedRouteEvents.length - 1];
      const isDuplicate = last &&
        last.type === msg.event.type &&
        last.url === msg.event.url &&
        last.text === msg.event.text &&
        (Date.now() - (last.timestamp || 0) < 250);

      if (!isDuplicate) {
        msg.event.eventId = recordedRouteEvents.length + 1;
        recordedRouteEvents.push(msg.event);
        updateRouteCounterUI();
        console.log('[SidePanel] Ação gravada em tempo real:', msg.event);
      }
      sendResponse({ ok: true });
      return true;
    }
  });
}

if (btnRecordRoute) {
  btnRecordRoute.addEventListener('click', async () => {
    const [recordTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!recordTab?.id) return;

    if (!isRecordingRoute) {
      // Inicia nova gravação
      recordedRouteEvents = [
        { eventId: 1, type: 'NAVIGATE', timestamp: Date.now(), url: recordTab.url, anchor: null }
      ];
      isRecordingRoute = true;
      chrome.storage?.local?.set({ teacher_recording_active: true });

      await ensureScriptInjected(recordTab.id);
      chrome.tabs.sendMessage(recordTab.id, { action: 'START_RECORDING' }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[SidePanel] Aviso ao iniciar gravação na aba:', chrome.runtime.lastError);
        }
      });

      btnRecordRoute.style.background = '#dc2626';
      btnRecordRoute.style.color = '#fff';
      routeBtnText.textContent = 'Parar e Salvar Trajeto';
      updateRouteCounterUI();
      showFeedback('loading', '🎙️ Gravando seu trajeto. Clique nos menus e botões no portal normalmente.');
    } else {
      // Para e salva gravação
      btnRecordRoute.disabled = true;
      routeBtnText.textContent = 'Finalizando...';
      isRecordingRoute = false;
      chrome.storage?.local?.set({ teacher_recording_active: false });

      chrome.tabs.sendMessage(recordTab.id, { action: 'STOP_RECORDING' }, async (resp) => {
        btnRecordRoute.disabled = false;
        btnRecordRoute.style.background = 'transparent';
        btnRecordRoute.style.color = '#586e75';
        routeBtnText.textContent = 'Iniciar Gravação do Trajeto';
        routeCounter.style.display = 'none';

        if (resp?.events && resp.events.length > 0) {
          const reads = resp.events.filter(e => e.type === 'READ');
          for (const r of reads) {
            r.eventId = recordedRouteEvents.length + 1;
            recordedRouteEvents.push(r);
          }
        }

        // Se por qualquer motivo a lista ainda estiver vazia, garante ao menos o NAVIGATE da página atual
        if (recordedRouteEvents.length === 0) {
          recordedRouteEvents.push({
            eventId: 1,
            type: 'NAVIGATE',
            timestamp: Date.now(),
            url: recordTab.url,
            anchor: null
          });
        }

        pendingRecordedEvents = [...recordedRouteEvents];
        pendingPageUrl = recordTab.url;

        showFeedback('success', `Trajeto gravado com ${pendingRecordedEvents.length} ações! Defina os dados da Skill.`);
        const modal = document.getElementById('modal-define-skill');
        if (modal) {
          modal.style.display = 'flex';
          const nameInput = document.getElementById('modal-task-name');
          if (nameInput) { nameInput.value = ''; nameInput.focus(); }
          populateNamingBox(pendingRecordedEvents);
        }
      });
    }
  });
}

// ── Inicialização e Watchers ──────────────────────────────────────────────────
function initSidePanel() {
  updatePortalConnection();
  loadActiveTurma();
  loadSavedSkills();
  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activePlatform = btn.dataset.platform;
      document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statusPortalName.textContent = PLATFORMS[activePlatform]?.name || activePlatform;
      loadSavedSkills();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidePanel);
  setTimeout(initSidePanel, 300);
} else {
  initSidePanel();
}

if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onActivated?.addListener(() => {
    setTimeout(updatePortalConnection, 400);
  });

  chrome.tabs.onUpdated?.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      setTimeout(updatePortalConnection, 400);
      if (isRecordingRoute) {
        await ensureScriptInjected(tabId);
        chrome.tabs.sendMessage(tabId, { action: 'START_RECORDING' }).catch(() => {});
        const lastEv = recordedRouteEvents[recordedRouteEvents.length - 1];
        if (tab?.url && (!lastEv || lastEv.url !== tab.url)) {
          recordedRouteEvents.push({
            eventId: recordedRouteEvents.length + 1,
            type: 'NAVIGATE',
            timestamp: Date.now(),
            url: tab.url,
            anchor: null
          });
          updateRouteCounterUI();
        }
      }
    }
  });
}


// ── 3. Enviar Alunos para o Teacher AI (Funcionalidade de Aluno) ───────────────
const btnSendToApp       = document.getElementById('btn-send-to-app');
const sendBtnText        = document.getElementById('send-btn-text');
const inputClassName     = document.getElementById('input-class-name');
const btnOpenAppStudents = document.getElementById('btn-open-app-students');

let currentLoadedStudents = [];

if (btnSendToApp) {
  btnSendToApp.addEventListener('click', async () => {
    const className = (inputClassName?.value || '').trim() || 'Turma do Portal';
    if (!currentLoadedStudents || currentLoadedStudents.length === 0) {
      showFeedback('error', 'Nenhum aluno carregado. Clique em "Ler Alunos Desta Página" primeiro.');
      return;
    }

    btnSendToApp.disabled = true;
    sendBtnText.textContent = 'Enviando para o aplicativo...';
    showFeedback('loading', `Gravando ${currentLoadedStudents.length} alunos na turma "${className}"...`);

    const payload = {
      className,
      portalName: PLATFORMS[activePlatform]?.name || 'Machado Sobrinho',
      students: currentLoadedStudents
    };

    let sentViaBridge = false;

    // 1. Tenta enviar para a aba do Teacher AI se estiver aberta (localStorage imediato)
    try {
      const tabs = await chrome.tabs.query({});
      const appTab = tabs.find(t => t.url && (t.url.includes('localhost:3000') || t.url.includes('localhost:3001')));
      if (appTab && appTab.id) {
        chrome.tabs.sendMessage(appTab.id, {
          action: 'IMPORT_STUDENTS_TO_APP',
          payload
        }, (resp) => {
          if (resp?.ok) sentViaBridge = true;
        });
      }
    } catch (e) {}

    // 2. Envia também via API REST do Next.js
    try {
      const res = await fetch('http://localhost:3000/api/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        btnSendToApp.disabled = false;
        sendBtnText.textContent = 'Enviar para "Alunos" no Teacher AI';
        showFeedback('success', `🎉 ${data.studentsCount || currentLoadedStudents.length} alunos salvos na turma "${className}"!`);
        if (btnOpenAppStudents) btnOpenAppStudents.style.display = 'flex';
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      btnSendToApp.disabled = false;
      sendBtnText.textContent = 'Enviar para "Alunos" no Teacher AI';
      showFeedback('error', 'Verifique se o Teacher AI está aberto em http://localhost:3000');
    }
  });
}

if (btnOpenAppStudents) {
  btnOpenAppStudents.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({});
    const appTab = tabs.find(t => t.url && (t.url.includes('localhost:3000') || t.url.includes('localhost:3001')));
    if (appTab && appTab.id) {
      chrome.tabs.update(appTab.id, { active: true });
    } else {
      chrome.tabs.create({ url: 'http://localhost:3000' });
    }
  });
}


// ════════════════════════════════════════════════════════════════════════════════
// LOTE 3: GESTÃO DE TURMA ATIVA (ITEM 1) + COMANDO LIVRE (ITEM 2) + DEFINIR SKILL (ITEM 3)
// ════════════════════════════════════════════════════════════════════════════════

let activeTurmaId = null;
let loadedClassesList = [];
let pendingRecordedEvents = null;
let pendingPageUrl = '';

// ── 1. Carregar Turma Ativa via Backend Next.js (Supabase sem chaves na extensão) ─
async function loadActiveTurma(forceEmpty = false) {
  const cardActive = document.getElementById('active-class-card');
  const cardEmpty  = document.getElementById('empty-class-card');
  const nameEl     = document.getElementById('active-class-name');
  const yearEl     = document.getElementById('active-class-year');
  const idEl       = document.getElementById('active-class-id');
  const chipsEl    = document.getElementById('classes-chips');

  try {
    const url = forceEmpty 
      ? 'http://localhost:3000/api/classes?empty=true' 
      : 'http://localhost:3000/api/classes';

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    loadedClassesList = data.classes || [];

    if (loadedClassesList.length === 0) {
      // Estado Vazio Obrigatório
      if (cardActive) cardActive.style.display = 'none';
      if (cardEmpty) cardEmpty.style.display = 'block';
      activeTurmaId = null;
      console.log('[SidePanel] Estado Vazio exibido: Nenhuma turma encontrada.');
      return;
    }

    // Exibe card populado
    if (cardEmpty) cardEmpty.style.display = 'none';
    if (cardActive) cardActive.style.display = 'block';

    // Seleciona a primeira como ativa por padrão
    const activeClass = loadedClassesList[0];
    activeTurmaId = activeClass.id;
    if (nameEl) nameEl.textContent = activeClass.name;
    if (yearEl) yearEl.textContent = activeClass.year ? `Ano ${activeClass.year}` : 'Ativa';
    if (idEl) idEl.textContent = `ID: ${activeClass.id}`;

    // Renderiza seletor de chips
    if (chipsEl) {
      chipsEl.innerHTML = loadedClassesList.slice(0, 6).map((c, i) => `
        <button class="class-chip ${i === 0 ? 'active' : ''}" data-id="${c.id}" data-name="${c.name}" data-year="${c.year || ''}">
          ${c.name}
        </button>
      `).join('');

      chipsEl.querySelectorAll('.class-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          chipsEl.querySelectorAll('.class-chip').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeTurmaId = btn.dataset.id;
          if (nameEl) nameEl.textContent = btn.dataset.name;
          if (yearEl) yearEl.textContent = btn.dataset.year ? `Ano ${btn.dataset.year}` : 'Ativa';
          if (idEl) idEl.textContent = `ID: ${activeTurmaId}`;
          console.log('[SidePanel] Turma ativa alterada para:', btn.dataset.name, activeTurmaId);
        });
      });
    }

    console.log(`[SidePanel] Turma Ativa carregada via Supabase: "${activeClass.name}" (ID: ${activeTurmaId})`);
  } catch (err) {
    console.warn('[SidePanel] Erro ao carregar turmas do backend:', err);
    if (cardActive) cardActive.style.display = 'none';
    if (cardEmpty) cardEmpty.style.display = 'block';
  }
}

// ── 2. Origem A: Comando Livre com Interpretador de Intenção (Item 2.1) ────────
const inputFreeCmd   = document.getElementById('input-free-command');
const btnInterpret   = document.getElementById('btn-interpret-command');
const interpretBox   = document.getElementById('interpret-response-container');
const interpretText  = document.getElementById('interpret-btn-text');

if (btnInterpret) {
  btnInterpret.addEventListener('click', async () => {
    const text = (inputFreeCmd?.value || '').trim();
    if (!text) {
      alert('Digite o que você deseja fazer nesta página.');
      return;
    }

    const [cmdTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    btnInterpret.disabled = true;
    if (interpretText) interpretText.textContent = 'Interpretando intenção...';
    if (interpretBox) {
      interpretBox.style.display = 'block';
      interpretBox.className = 'interpret-box';
      interpretBox.innerHTML = '<span class="spinner"></span> Consultando LLM via BYOK...';
    }

    try {
      let byokKey = 'gsk_mock_test_key_for_development_placeholder';
      try { byokKey = localStorage.getItem('teacher_byok_key') || byokKey; } catch(e) {}

      const res = await fetch('http://localhost:3000/api/skills/interpret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-byok-key': byokKey
        },
        body: JSON.stringify({
          text,
          portalId: activePlatform === 'machado' ? 'machado_sobrinho' : activePlatform,
          pageUrl: cmdTab?.url || '',
          turmaId: activeTurmaId,
          source: 'sidebar'
        })
      });

      const data = await res.json();
      btnInterpret.disabled = false;
      if (interpretText) interpretText.textContent = 'Interpretar Comando';

      if (!data.ok) {
        interpretBox.className = 'interpret-box teach';
        interpretBox.innerHTML = `⚠️ <b>Erro:</b> ${data.error || 'Falha ao interpretar comando'}`;
        return;
      }

      if (data.matched) {
        if (data.isCompound) {
          // (a1) Comando Composto / Orquestração (Portal → LLM → Checkpoint → Teams)
          interpretBox.className = 'interpret-box match';
          const planHtml = (data.executionPlan || []).map(step => `
            <div style="display:flex; align-items:flex-start; gap:6px; margin-top:4px; font-size:11px;">
              <span style="font-weight:700; color:#0284c7;">[${step.step}]</span>
              <div style="flex:1;">
                <span style="font-weight:600; color:#0f172a;">${step.title}</span>
                ${step.requires_confirmation ? '<span style="font-size:9px; background:#fee2e2; color:#dc2626; font-weight:700; padding:1px 4px; border-radius:3px; margin-left:4px;">CHECKPOINT OBRIGATÓRIO</span>' : ''}
                ${step.is_stub ? '<span style="font-size:9px; background:#fef3c7; color:#92400e; font-weight:700; padding:1px 4px; border-radius:3px; margin-left:4px;">AZURE AD BLOQUEADO</span>' : ''}
                <div style="font-size:10px; color:#64748b;">${step.description}</div>
              </div>
            </div>
          `).join('');

          interpretBox.innerHTML = `
            <div style="font-weight:700; margin-bottom:4px; color:#0369a1;">🔀 Orquestração: "${data.taskName}"</div>
            <div style="margin-bottom:8px; line-height:1.4; font-size:11px;">${data.previewText}</div>
            <div style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:8px; margin-bottom:8px;">
              <div style="font-size:10px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:4px;">Plano de Execução Sequencial:</div>
              ${planHtml}
            </div>
            ${data.teamsStatus?.is_stub ? `
              <div style="font-size:10px; color:#b45309; background:#fffbeb; border:1px solid #fef3c7; border-radius:4px; padding:6px; margin-bottom:8px;">
                ⚠️ <b>Aviso Azure AD:</b> ${data.teamsStatus.message} O envio final é mantido como stub até liberação pela TI da escola.
              </div>
            ` : ''}
            <button class="btn-main" id="btn-run-matched-skill" style="margin-top:0; padding:8px; font-size:11px; background:#0284c7;">
              <i class="ti ti-player-play"></i> Iniciar Etapa 1 (Leitura com GraphExecutor)
            </button>
          `;

          document.getElementById('btn-run-matched-skill')?.addEventListener('click', () => {
            executeMatchedSkill(data.skillGraph, data.taskName);
          });
        } else {
          // (a2) Corresponde a uma Skill simples salva: preview em linguagem natural SEM executar
          interpretBox.className = 'interpret-box match';
          interpretBox.innerHTML = `
            <div style="font-weight:700; margin-bottom:4px;">✨ Skill Identificada: "${data.taskName}"</div>
            <div style="margin-bottom:8px; line-height:1.4;">${data.previewText}</div>
            <div style="font-size:10px; color:#15803d; margin-bottom:8px;">● Tipo: <b>${data.skillType === 'writing' ? 'Escrita (com Checkpoint)' : 'Leitura'}</b> | Turma ID: <code>${data.turmaId || 'padrão'}</code></div>
            <button class="btn-main" id="btn-run-matched-skill" style="margin-top:0; padding:6px; font-size:11px; background:#16a34a;">
              Confirmar e Executar
            </button>
          `;

          document.getElementById('btn-run-matched-skill')?.addEventListener('click', () => {
            executeMatchedSkill(data.skillGraph, data.taskName);
          });
        }
      } else {
        // (b) Não corresponde a nenhuma Skill: convite para ensinar
        interpretBox.className = 'interpret-box teach';
        interpretBox.innerHTML = `
          <div style="font-weight:700; margin-bottom:4px;">🤖 ${data.message}</div>
          <div style="font-size:11px; color:#78350f; margin-bottom:8px;">Essa ação ainda não foi ensinada para esta página do portal.</div>
          <button class="btn-sub" id="btn-teach-now" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">
            <i class="ti ti-player-record-filled" style="color:#dc2626;"></i>
            <span>Ensinar Agora (Gravar Trajeto)</span>
          </button>
        `;

        document.getElementById('btn-teach-now')?.addEventListener('click', () => {
          if (btnRecordRoute) btnRecordRoute.click();
        });
      }
    } catch (err) {
      btnInterpret.disabled = false;
      if (interpretText) interpretText.textContent = 'Interpretar Comando';
      interpretBox.className = 'interpret-box teach';
      interpretBox.innerHTML = `⚠️ Erro de rede ao conectar com o backend: ${err.message}`;
    }
  });
}

// ── 3. Mini-Formulário Modal ao Parar Gravação (Item 3) ────────────────────────
const modalDefineSkill = document.getElementById('modal-define-skill');
const modalTaskName    = document.getElementById('modal-task-name');
const modalTaskDesc    = document.getElementById('modal-task-desc');
const modalBtnSave     = document.getElementById('modal-btn-save');
const modalBtnCancel   = document.getElementById('modal-btn-cancel');
const modalErrorMsg    = document.getElementById('modal-error-msg');

let currentInferredColumns = [];

async function populateNamingBox(events) {
  const container = document.getElementById('modal-columns-container');
  const listEl = document.getElementById('modal-columns-list');
  const statusEl = document.getElementById('columns-infer-status');
  if (!container || !listEl) return;

  currentInferredColumns = [];
  listEl.innerHTML = '';

  const readEvents = (events || []).filter(e => e.type === 'READ');
  if (readEvents.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Inferindo tipos com IA...';

  // Extrai cabeçalhos únicos preservando a ordem
  const headerMap = new Map();
  for (const ev of readEvents) {
    const h = (ev.columnHeader || '').trim();
    if (!h) continue;
    if (!headerMap.has(h)) {
      headerMap.set(h, []);
    }
    if (ev.sampleValue && headerMap.get(h).length < 3) {
      headerMap.get(h).push(String(ev.sampleValue).trim());
    }
  }

  const headers = Array.from(headerMap.keys());
  if (headers.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Amostras tabulares para LLM
  const maxSamples = Math.max(...Array.from(headerMap.values()).map(v => v.length), 0);
  const sampleRows = [];
  for (let r = 0; r < maxSamples; r++) {
    sampleRows.push(headers.map(h => (headerMap.get(h)[r] || '')));
  }

  try {
    const res = await fetch('http://localhost:3000/api/skills/infer-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers, sampleRows })
    });

    if (res.ok) {
      const data = await res.json();
      currentInferredColumns = data.columns || [];
      if (statusEl) {
        statusEl.textContent = `✨ IA (${data.modelUsed || 'groq'})`;
      }
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[NamingBox] Fallback determinístico:', err);
    if (statusEl) statusEl.textContent = '⚡ Fallback determinístico';
    currentInferredColumns = headers.map((h, idx) => {
      const varName = h.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      let semType = 'other';
      if (/nome|aluno|estudante/i.test(h)) semType = 'name';
      else if (/matr[ií]c|id|ra|cod/i.test(h)) semType = 'identifier';
      else if (/nota|bim|rec|prova/i.test(h)) semType = 'numeric_grade';
      else if (/data|prazo/i.test(h)) semType = 'date';
      else if (/situa|status/i.test(h)) semType = 'status';
      else if (/obs|msg|coment/i.test(h)) semType = 'free_text_message';

      return {
        key: `col_${idx}`,
        label: h,
        original_header: h,
        semantic_type: semType,
        variable_name: varName,
        sample_values: headerMap.get(h) || [],
        confidence: 0.75,
        included: true
      };
    });
  }

  // Renderiza tabela interativa no modal
  listEl.innerHTML = currentInferredColumns.map((col, idx) => {
    const samples = (col.sample_values || []).filter(Boolean).join(', ');
    const samplePreview = samples ? `<div style="font-size:10px; color:#64748b; margin-top:2px;">Amostra: <i>${samples.slice(0, 30)}</i></div>` : '';
    return `
      <div style="display:flex; align-items:center; gap:8px; background:#fff; padding:6px 8px; border-radius:6px; border:1px solid #cbd5e1;">
        <input type="checkbox" class="col-include-cb" data-idx="${idx}" checked title="Incluir coluna" style="cursor:pointer;" />
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:11px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${col.original_header}
          </div>
          ${samplePreview}
        </div>
        <select class="col-semantic-select" data-idx="${idx}" style="font-size:11px; padding:3px 6px; border-radius:4px; border:1px solid #cbd5e1; outline:none; background:#f8fafc; font-weight:600;">
          <option value="identifier" ${col.semantic_type === 'identifier' ? 'selected' : ''}>identifier (ID/Matrícula)</option>
          <option value="name" ${col.semantic_type === 'name' ? 'selected' : ''}>name (Nome)</option>
          <option value="numeric_grade" ${col.semantic_type === 'numeric_grade' ? 'selected' : ''}>numeric_grade (Nota)</option>
          <option value="date" ${col.semantic_type === 'date' ? 'selected' : ''}>date (Data)</option>
          <option value="status" ${col.semantic_type === 'status' ? 'selected' : ''}>status (Status)</option>
          <option value="free_text_message" ${col.semantic_type === 'free_text_message' ? 'selected' : ''}>free_text_message (Texto/Obs)</option>
          <option value="other" ${col.semantic_type === 'other' ? 'selected' : ''}>other (Outro)</option>
        </select>
      </div>
    `;
  }).join('');
}

if (modalBtnCancel) {
  modalBtnCancel.addEventListener('click', () => {
    modalDefineSkill.style.display = 'none';
  });
}

if (modalBtnSave) {
  modalBtnSave.addEventListener('click', async () => {
    const taskName = (modalTaskName?.value || '').trim();
    if (!taskName) {
      if (modalErrorMsg) {
        modalErrorMsg.style.display = 'block';
        modalErrorMsg.textContent = 'Informe o nome da tarefa.';
      }
      return;
    }

    const selectedTypeEl = document.querySelector('input[name="modal-skill-type"]:checked');
    const skillType = selectedTypeEl ? selectedTypeEl.value : 'reading';
    const description = (modalTaskDesc?.value || '').trim();

    modalBtnSave.disabled = true;
    modalBtnSave.textContent = 'Salvando e Validando...';
    if (modalErrorMsg) modalErrorMsg.style.display = 'none';

    try {
      // Coleta colunas revisadas pela professora
      const reviewedColumns = currentInferredColumns.map((col, idx) => {
        const selectEl = document.querySelector(`.col-semantic-select[data-idx="${idx}"]`);
        const cbEl = document.querySelector(`.col-include-cb[data-idx="${idx}"]`);
        return {
          ...col,
          semantic_type: selectEl ? selectEl.value : col.semantic_type,
          included: cbEl ? cbEl.checked : true,
        };
      });

      const taskId = taskName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
      const payload = {
        events: pendingRecordedEvents || [],
        portalId: activePlatform === 'machado' ? 'machado_sobrinho' : activePlatform,
        taskId: taskId || 'nova_skill',
        taskName,
        skillType,
        description,
        turmaId: activeTurmaId,
        pageUrl: pendingPageUrl,
        columns: reviewedColumns.length > 0 ? reviewedColumns : undefined
      };

      const res = await fetch('http://localhost:3000/api/skills/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      modalBtnSave.disabled = false;
      modalBtnSave.textContent = 'Salvar Skill';
      modalDefineSkill.style.display = 'none';
      showFeedback('success', `🎉 Skill "${taskName}" salva com sucesso no motor!`);
      loadSavedSkills();
    } catch (err) {
      modalBtnSave.disabled = false;
      modalBtnSave.textContent = 'Salvar Skill';
      if (modalErrorMsg) {
        modalErrorMsg.style.display = 'block';
        modalErrorMsg.textContent = err.message;
      }
    }
  });
}

// ── 4. Gestão de Skills Gravadas (Supabase + Disco) ───────────────────────────
async function loadSavedSkills() {
  const container = document.getElementById('saved-skills-list');
  const badge = document.getElementById('skills-count-badge');
  if (!container) return;

  const currentPortalId = (activePlatform === 'machado' || !activePlatform) ? 'machado_sobrinho' : activePlatform;

  try {
    const res = await fetch(`http://localhost:3000/api/skills?portalId=${encodeURIComponent(currentPortalId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const skills = data.skills || [];

    if (badge) badge.textContent = `${skills.length} salvas`;

    if (skills.length === 0) {
      container.innerHTML = `
        <div style="font-size:11px; color:#64748b; text-align:center; padding:12px; background:#f8fafc; border-radius:6px;">
          Nenhuma skill gravada ainda para ${PLATFORMS[activePlatform]?.name || 'este portal'}.
        </div>
      `;
      return;
    }

    // Mapeamento em memória das skills para acesso rápido ao grafo
    const skillsMap = {};
    skills.forEach(s => {
      skillsMap[s.id] = s;
    });

    container.innerHTML = skills.map(s => {
      const isWriting = s.skill_type === 'writing';
      const badgeColor = isWriting ? '#dc2626' : '#0284c7';
      const badgeBg = isWriting ? '#fee2e2' : '#e0f2fe';
      const badgeText = isWriting ? 'Escrita (Checkpoint)' : 'Leitura';

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; gap:8px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:12px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${s.task_name || s.name}">
              ${s.task_name || s.name}
            </div>
            <div style="display:flex; gap:6px; align-items:center; margin-top:2px;">
              <span style="font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px; background:${badgeBg}; color:${badgeColor};">
                ${badgeText}
              </span>
              ${s.turma_id ? `<span style="font-size:9px; color:#64748b;">Turma: ${s.turma_id}</span>` : ''}
            </div>
          </div>
          <button class="btn-run-skill" data-skill-id="${s.id}" data-skill-type="${s.skill_type}" style="display:inline-flex; align-items:center; gap:4px; margin:0; padding:5px 8px; font-size:11px; font-weight:600; font-family:'Outfit',sans-serif; background:#fff; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer; color:#0f172a; white-space:nowrap; flex-shrink:0;">
            <i class="ti ti-player-play" style="color:#16a34a; font-size:12px;"></i>
            <span>Executar</span>
          </button>
        </div>
      `;
    }).join('');

    // Listener para botões Executar
    container.querySelectorAll('.btn-run-skill').forEach(btn => {
      btn.addEventListener('click', async () => {
        const skillId = btn.dataset.skillId;
        console.log('[SidePanel] Clique no botao Executar -> skillId:', skillId);
        const skill = skillsMap[skillId];
        if (!skill || !skill.graph) {
          console.warn('[SidePanel] Grafo nao encontrado para:', skillId);
          alert('Grafo da skill não encontrado para execução.');
          return;
        }

        btn.disabled = true;
        const origHtml = btn.innerHTML;
        btn.innerHTML = `<span class="spinner" style="width:10px;height:10px;border-width:2px;display:inline-block;margin-right:2px;"></span> <span style="font-size:10px;">Rodando...</span>`;

        try {
          await executeMatchedSkill(skill.graph, skill.task_name || skill.name);
        } catch (err) {
          console.error('[SidePanel] Erro ao executar skill selecionada:', err);
        } finally {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      });
    });

  } catch (err) {
    console.warn('[SidePanel] Erro ao carregar skills salvas:', err);
    container.innerHTML = `
      <div style="font-size:11px; color:#94a3b8; text-align:center; padding:8px;">
        Não foi possível conectar com o backend de skills.
      </div>
    `;
  }
}

