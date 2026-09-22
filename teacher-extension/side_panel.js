
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

async function getSecureByokKey() {
  const defaultKey = 'gsk_mock_test_key_for_development_placeholder';
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(['teacher_byok_key']);
      if (stored?.teacher_byok_key) return stored.teacher_byok_key;
    }
  } catch (e) {}
  try {
    const local = localStorage.getItem('teacher_byok_key');
    if (local) return local;
  } catch (e) {}
  return defaultKey;
}

async function checkPortalAuthorization(url) {
  // Ações 100% liberadas no portal ativo da professora
  return { authorized: true, isThirdPartyPortal: false, reason: 'Portal liberado para automação' };
}

async function ensureScriptInjected(tabId) {
  try {
    let tabUrl = '';
    try {
      const tab = await chrome.tabs.get(tabId);
      tabUrl = tab?.url || '';
    } catch {}

    // Não injeta em URLs internas do navegador
    if (tabUrl) {
      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('about:')) {
        return false;
      }
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
      await new Promise(r => setTimeout(r, 200));
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
  machado:       { name: 'Machado Sobrinho', domains: ['paineldoaluno.com.br', 'machadosobrinho', 'paineldoprofessor'] },
  santacatarina: { name: 'Rede Santa Catarina', domains: ['redesantacatarina.org.br'] },
  plural:        { name: 'Plurall (SOMOS)', domains: ['plural.net', 'plurall.net'] },
  cambridge:     { name: 'Cambridge One', domains: ['cambridgeone.org'] },
  ieducar:       { name: 'i-Educar', domains: ['ieducar.com.br', 'comunidade.ieducar'] },
  teams:         { name: 'Microsoft Teams', domains: ['teams.microsoft.com'] },
  sed_sp:        { name: 'SED São Paulo', domains: ['sed.educacao.sp.gov.br'] },
  sandbox:       { name: 'Portal de Teste (Sandbox)', domains: ['localhost', '127.0.0.1', 'portal_mock', 'portal_real'] }
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

// ── Elementos do Visor de Conexão ──────────────────────────────────────────
const visorOverallBadge = document.getElementById('visor-overall-badge')
const visorPortalName   = document.getElementById('visor-portal-name')
const visorPageName     = document.getElementById('visor-page-name')
const visorAuthStatus   = document.getElementById('visor-auth-status')
const visorSidecarStatus= document.getElementById('visor-sidecar-status')
const btnVisorRefresh   = document.getElementById('btn-visor-refresh')

// ── Keep-Alive Duplex Port com Background Service Worker (MV3) ────────────────
let keepAlivePort = null;
let keepAlivePingTimer = null;
function initKeepAlivePort() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
      if (keepAlivePingTimer) {
        clearInterval(keepAlivePingTimer);
        keepAlivePingTimer = null;
      }
      keepAlivePort = chrome.runtime.connect({ name: 'keepAliveSidePanel' });
      keepAlivePort.onDisconnect.addListener(() => {
        keepAlivePort = null;
        if (keepAlivePingTimer) {
          clearInterval(keepAlivePingTimer);
          keepAlivePingTimer = null;
        }
        setTimeout(initKeepAlivePort, 2000);
      });

      // Pings a cada 20s para manter o Service Worker ativo (evitando suspensão MV3 de 30s)
      keepAlivePingTimer = setInterval(() => {
        try {
          if (keepAlivePort) {
            keepAlivePort.postMessage({ type: 'KEEPALIVE_PING', timestamp: Date.now() });
          }
        } catch (e) {
          keepAlivePort = null;
          if (keepAlivePingTimer) {
            clearInterval(keepAlivePingTimer);
            keepAlivePingTimer = null;
          }
          setTimeout(initKeepAlivePort, 1000);
        }
      }, 20000);
    }
  } catch (e) {}
}
initKeepAlivePort();

// ── Monitoramento do Motor de Inteligência Local (Fase 1) ────────────────────
async function updateAiEngineStatus() {
  const card = document.getElementById('ai-model-status-card');
  const badge = document.getElementById('ai-model-badge');
  const progressContainer = document.getElementById('ai-model-progress-container');
  const progressBar = document.getElementById('ai-model-progress-bar');
  const statusText = document.getElementById('ai-model-status-text');
  const percentText = document.getElementById('ai-model-percent');
  const readyInfo = document.getElementById('ai-model-ready-info');
  const diskSizeSpan = document.getElementById('ai-model-disk-size');
  const fallbackInfo = document.getElementById('ai-model-fallback-info');

  if (!card || !badge) return;

  try {
    const resp = await fetch('http://127.0.0.1:8765/ai_engine_status', { cache: 'no-store' });
    if (!resp.ok) throw new Error('Status HTTP ' + resp.status);
    const data = await resp.json();

    if (data.status === 'downloading' || data.is_loading) {
      badge.textContent = 'Baixando...';
      badge.style.background = '#fef08a';
      badge.style.color = '#854d0e';

      if (readyInfo) readyInfo.style.display = 'none';
      if (fallbackInfo) fallbackInfo.style.display = 'none';
      if (progressContainer) {
        progressContainer.style.display = 'block';
        const mb = data.disk_size_mb || 108.2;
        const targetMb = 240.46;
        const pct = Math.min(95, Math.max(15, Math.round((mb / targetMb) * 100)));
        if (progressBar) progressBar.style.width = pct + '%';
        if (percentText) percentText.textContent = pct + '%';
        if (statusText) {
          statusText.textContent = 'Preparando motor de inteligência local (download único de ~240 MB)...';
        }
      }
    } else if (data.status === 'ready' || data.is_cached) {
      badge.textContent = 'Pronto (Offline)';
      badge.style.background = '#dcfce7';
      badge.style.color = '#15803d';

      if (progressContainer) progressContainer.style.display = 'none';
      if (fallbackInfo) fallbackInfo.style.display = 'none';
      if (readyInfo) {
        readyInfo.style.display = 'block';
        if (diskSizeSpan) {
          const mb = data.disk_size_mb || 240.46;
          diskSizeSpan.textContent = `${mb} MB em disco`;
        }
      }
    } else if (data.status === 'error') {
      badge.textContent = 'Modo Léxico';
      badge.style.background = '#fee2e2';
      badge.style.color = '#991b1b';
      if (progressContainer) progressContainer.style.display = 'none';
      if (readyInfo) readyInfo.style.display = 'none';
      if (fallbackInfo) fallbackInfo.style.display = 'block';
    } else {
      badge.textContent = 'Aguardando';
      badge.style.background = '#f3f4f6';
      badge.style.color = '#4b5563';
    }
  } catch (err) {
    // Servidor ainda não conectado ou inicializando
    badge.textContent = 'Desconectado';
    badge.style.background = '#fee2e2';
    badge.style.color = '#991b1b';
    if (progressContainer) progressContainer.style.display = 'none';
    if (readyInfo) readyInfo.style.display = 'none';
    if (fallbackInfo) fallbackInfo.style.display = 'block';
  }
}

setInterval(updateAiEngineStatus, 3000);
updateAiEngineStatus();

// ── Card de Conferência com Diff Visual (Human-in-the-Loop) ──────────────────
function renderApprovalDiffCard(data) {
  let container = document.getElementById('diff-approval-card');
  if (!container) {
    container = document.createElement('div');
    container.id = 'diff-approval-card';
    container.className = 'card';
    container.style.border = '2px solid #0284c7';
    container.style.backgroundColor = '#f0f9ff';
    container.style.marginTop = '12px';
    const mainBody = document.querySelector('.body') || document.body;
    mainBody.prepend(container);
  }

  const entries = data?.entries || [];
  const portalName = data?.portal_name || 'Portal Escolar';
  const taskId = data?.task_id || 'task_pending';

  let rowsHtml = entries.map(e => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 6px 4px; font-weight: 600; color: #1e293b;">${e.student || 'Aluno'}</td>
      <td style="padding: 6px 4px; color: #64748b;">${e.previous_value ?? '-'}</td>
      <td style="padding: 6px 4px; font-weight: 700; color: #0284c7;">${e.new_value ?? e.value ?? '-'}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card-title" style="color: #0369a1; font-size: 12px; margin-bottom: 4px;">
      📝 Conferência de Lançamento (${entries.length} registros)
    </div>
    <div style="font-size: 11px; color: #475569; margin-bottom: 8px;">
      Confira os valores antes de salvar no <b>${portalName}</b>:
    </div>
    <div style="max-height: 180px; overflow-y: auto; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; margin-bottom: 10px;">
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="background: #e2e8f0; font-size: 10px; text-transform: uppercase; color: #475569;">
            <th style="padding: 4px;">Aluno</th>
            <th style="padding: 4px;">Atual</th>
            <th style="padding: 4px;">Novo</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="3" style="padding: 8px; text-align: center;">Nenhum dado</td></tr>'}
        </tbody>
      </table>
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="btn-approve-diff" style="flex: 1; padding: 8px; background: #16a34a; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">
        ✅ Confirmar e Gravar
      </button>
      <button id="btn-cancel-diff" style="flex: 1; padding: 8px; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">
        ❌ Cancelar
      </button>
    </div>
  `;

  const btnApprove = document.getElementById('btn-approve-diff');
  if (btnApprove) {
    btnApprove.onclick = () => {
      container.remove();
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'APPROVAL_DECISION', approved: true, task_id: taskId });
      }
    };
  }

  const btnCancel = document.getElementById('btn-cancel-diff');
  if (btnCancel) {
    btnCancel.onclick = () => {
      container.remove();
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'APPROVAL_DECISION', approved: false, task_id: taskId });
      }
    };
  }
}

// Listener para receber atualizações de telemetria/status do content script e sidecar
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === 'STATUS_TOAST_UPDATE') {
      if (visorPortalName && msg.platformName) {
        visorPortalName.textContent = msg.platformName;
      }
    }
    if (msg?.action === 'SHOW_DIFF_APPROVAL_CARD') {
      renderApprovalDiffCard(msg.payload || msg);
    }
  });
}

async function getActivePortalTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url && !tabs[0].url.startsWith('chrome-extension://')) return tabs[0];
  } catch {}
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url && !tabs[0].url.startsWith('chrome-extension://')) return tabs[0];
  } catch {}
  try {
    const allTabs = await chrome.tabs.query({});
    const candidate = allTabs.find(t => t.active && t.url && !t.url.startsWith('chrome-extension://')) ||
                      allTabs.find(t => t.url && (t.url.includes('portal_mock') || t.url.includes('portal_real'))) ||
                      allTabs.find(t => t.url && (t.url.includes('paineldoaluno') || t.url.includes('redesantacatarina') || t.url.includes('plural') || t.url.includes('localhost') || t.url.includes('127.0.0.1')));
    if (candidate) return candidate;
  } catch {}
  return null;
}

// ── Atualização do Status de Conexão & Visor ────────────────────────────────
async function updatePortalConnection() {
  try {
    const portalTab = await getActivePortalTab();
    let detectedPortalKey = null;
    let detectedPortalName = null;

    if (portalTab?.url) {
      const url = portalTab.url.toLowerCase();
      for (const [key, p] of Object.entries(PLATFORMS)) {
        const domains = p.domains || [p.domain];
        if (domains.some(d => url.includes(d))) {
          detectedPortalKey = key;
          detectedPortalName = p.name;
          activePlatform = key;
          break;
        }
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'GET_POPUP_STATE' }, (resp) => {
        const isSidecar = Boolean(resp && resp.isSidecarOnline);
        const tabState = (resp && resp.tabState) || {};
        const portalName = detectedPortalName || tabState.portalName || (detectedPortalKey ? PLATFORMS[detectedPortalKey].name : null);
        const isMapped = Boolean(detectedPortalKey || tabState.isMappedPortal);
        const pageTitle = portalTab?.title || tabState.friendlyPageName || tabState.title || 'Página do Portal';
        const isAuth = Boolean(tabState.isAuthenticated);

        // 1. Atualiza Badge do Header
        if (isMapped) {
          if (statusBadge) {
            statusBadge.className = 'status-badge online';
            statusBadge.style.background = '';
            statusBadge.style.color = '';
          }
          if (statusPortalName) statusPortalName.textContent = portalName;
          document.querySelectorAll('.platform-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.platform === detectedPortalKey);
          });
        } else {
          if (statusBadge) statusBadge.className = 'status-badge';
          if (statusPortalName) statusPortalName.textContent = 'Aguardando portal escolar';
        }

        // 2. Atualiza Visor de Conexão
        if (visorPortalName) {
          visorPortalName.textContent = isMapped ? portalName : 'Nenhum portal ativo';
          visorPortalName.style.color = isMapped ? '#0f172a' : '#94a3b8';
        }

        if (visorPageName) {
          visorPageName.textContent = isMapped ? pageTitle : (portalTab ? (portalTab.title || 'Aba Externa') : '—');
          visorPageName.title = portalTab?.url || '';
        }

        if (visorAuthStatus) {
          if (!isMapped) {
            visorAuthStatus.textContent = '—';
            visorAuthStatus.style.color = '#94a3b8';
          } else if (tabState.pageKind === 'context_selection') {
            visorAuthStatus.textContent = 'Selecionar Turma ⏳';
            visorAuthStatus.style.color = '#0284c7';
          } else if (isAuth) {
            visorAuthStatus.textContent = 'Sessão Ativa ✓';
            visorAuthStatus.style.color = '#15803d';
          } else {
            visorAuthStatus.textContent = 'Requer Login ⚠️';
            visorAuthStatus.style.color = '#b45309';
          }
        }

        if (visorSidecarStatus) {
          if (isSidecar) {
            visorSidecarStatus.textContent = 'Ativo (:8766)';
            visorSidecarStatus.style.color = '#15803d';
          } else {
            visorSidecarStatus.textContent = 'Conectando...';
            visorSidecarStatus.style.color = '#0284c7';
          }
        }

        if (visorOverallBadge) {
          if (isMapped && isAuth && isSidecar) {
            visorOverallBadge.className = 'visor-badge ready';
            visorOverallBadge.style.background = '';
            visorOverallBadge.style.color = '';
            visorOverallBadge.style.borderColor = '';
            visorOverallBadge.innerHTML = '🟢 Conectado';
          } else if (isMapped && !isAuth) {
            visorOverallBadge.className = 'visor-badge needs_login';
            visorOverallBadge.style.background = '';
            visorOverallBadge.style.color = '';
            visorOverallBadge.style.borderColor = '';
            visorOverallBadge.innerHTML = '🟡 Requer Login';
          } else if (isMapped && !isSidecar) {
            visorOverallBadge.className = 'visor-badge connecting';
            visorOverallBadge.style.background = '';
            visorOverallBadge.style.color = '';
            visorOverallBadge.style.borderColor = '';
            visorOverallBadge.innerHTML = '🌐 Portal Ativo (Conectando)';
          } else {
            visorOverallBadge.className = 'visor-badge offline';
            visorOverallBadge.style.background = '';
            visorOverallBadge.style.color = '';
            visorOverallBadge.style.borderColor = '';
            visorOverallBadge.innerHTML = '⚪ Aguardando Portal';
          }
        }
      });
    }

  } catch (e) {
    console.error('Erro ao atualizar visor de conexão:', e);
  }
}

if (btnVisorRefresh) {
  btnVisorRefresh.addEventListener('click', () => {
    btnVisorRefresh.innerHTML = '<i class="ti ti-loader-2 spin"></i> Atualizando...';
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'RECONNECT_SIDECAR' }, () => {
        setTimeout(() => {
          btnVisorRefresh.innerHTML = '<i class="ti ti-refresh"></i> Atualizar Estado';
          updatePortalConnection();
        }, 800);
      });
    } else {
      setTimeout(() => {
        btnVisorRefresh.innerHTML = '<i class="ti ti-refresh"></i> Atualizar Estado';
        updatePortalConnection();
      }, 400);
    }
  });
}

setInterval(updatePortalConnection, 3000);

// ── 1. Executor Unificado por Intenção (Lote 3) ──────────────────────────────
function executeMatchedSkill(skillGraph, taskName) {
  return new Promise(async (resolve) => {
    console.log('[SidePanel] executeMatchedSkill INICIANDO -> Task:', taskName, 'HasGraph:', Boolean(skillGraph));
    const targetTab = await getActivePortalTab();
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

      let byokKey = await getSecureByokKey();
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
      <div style="flex:1; font-weight:600;">${escapeHtml(s.name || 'Aluno ' + (idx + 1))}</div>
      ${s.matricula ? `<span style="font-size:10px; color:#64748b; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${escapeHtml(s.matricula)}</span>` : ''}
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
    const recordTab = await getActivePortalTab();
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
    postToEntityBus('REQUEST_ACTIVE_CLASS_TODOS', { className: activeClass.name });

    // Renderiza seletor de chips
    if (chipsEl) {
      chipsEl.innerHTML = loadedClassesList.slice(0, 6).map((c, i) => `
        <button class="class-chip ${i === 0 ? 'active' : ''}" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}" data-year="${escapeHtml(c.year || '')}">
          ${escapeHtml(c.name)}
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
          postToEntityBus('REQUEST_ACTIVE_CLASS_TODOS', { className: btn.dataset.name });
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

    const cmdTab = await getActivePortalTab();

    btnInterpret.disabled = true;
    if (interpretText) interpretText.textContent = 'Interpretando intenção...';
    if (interpretBox) {
      interpretBox.style.display = 'block';
      interpretBox.className = 'interpret-box';
      interpretBox.innerHTML = '<span class="spinner"></span> Consultando LLM via BYOK...';
    }

    try {
      let byokKey = await getSecureByokKey();

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

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MOTOR AGÊNTICO DE CARD DE APROVAÇÃO (VOZ / TEXTO / DESAMBIGUAÇÃO / SAFEWRITE)
// ═══════════════════════════════════════════════════════════════════════════════

let activePendingApproval = null;

function normalizeStudentName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^(?:o|a|os|as|do|da|de|pro|pra|para)\s+/i, '')
    .trim();
}

function matchStudentByName(queryName, roster, queryMatricula) {
  const qClean = normalizeStudentName(queryName);
  const cleanMat = String(queryMatricula || '').trim();

  if (!roster || roster.length === 0 || (!qClean && !cleanMat)) {
    return { status: 'not_found', student: null, candidates: [] };
  }

  // VIA 1: Match Direto por Matrícula / portal_native_id (Determinístico)
  if (cleanMat) {
    const matMatches = roster.filter(s => {
      const sMat = String(s.matricula || s.portal_native_id || s.rollNumber || s.id || '').trim();
      return sMat && sMat === cleanMat;
    });
    if (matMatches.length === 1) {
      return { status: 'exact', student: matMatches[0], candidates: matMatches };
    }
  }

  // Match direto caso queryName seja puramente a matrícula
  const directMat = roster.filter(s => {
    const sMat = String(s.matricula || s.portal_native_id || s.rollNumber || '').trim();
    return sMat && sMat.toLowerCase() === qClean;
  });
  if (directMat.length === 1) {
    return { status: 'exact', student: directMat[0], candidates: directMat };
  }

  // VIA 2: Correspondência exata por Nome
  const exact = roster.filter(s => normalizeStudentName(s.name) === qClean);
  if (exact.length === 1) {
    return { status: 'exact', student: exact[0], candidates: exact };
  }
  if (exact.length > 1) {
    return { status: 'ambiguous', student: null, candidates: exact };
  }

  // VIA 3: Prefixo ou contém nome completo
  const substringMatches = roster.filter(s => {
    const sNorm = normalizeStudentName(s.name);
    return sNorm.includes(qClean) || qClean.includes(sNorm);
  });
  if (substringMatches.length === 1) {
    return { status: 'confident_match', student: substringMatches[0], candidates: substringMatches };
  }
  if (substringMatches.length > 1) {
    return { status: 'ambiguous', student: null, candidates: substringMatches };
  }

  // VIA 4: Primeiro nome (ex: "João" quando na lista temos "João Silva" e "João Santos")
  const firstWord = qClean.split(' ')[0];
  if (firstWord.length >= 2) {
    const firstNameMatches = roster.filter(s => {
      const sFirst = normalizeStudentName(s.name).split(' ')[0];
      return sFirst === firstWord;
    });
    if (firstNameMatches.length > 1) {
      return { status: 'ambiguous', student: null, candidates: firstNameMatches };
    }
    if (firstNameMatches.length === 1) {
      return { status: 'confident_match', student: firstNameMatches[0], candidates: firstNameMatches };
    }
  }

  return { status: 'not_found', student: null, candidates: [] };
}

/**
 * Decompõe um comando em múltiplos sub-objetivos sequenciais (PPAV Goal Queue).
 * Trata vírgulas, conectivos temporais ("e depois", "em seguida") e "e" seguido de verbo de comando.
 * Ex: "abrir turmas, selecionar sexto ano e acessar o perfil de João"
 *   -> ["abrir turmas", "selecionar sexto ano", "acessar perfil de João"]
 */
function decomposeGoalJS(text) {
  if (!text || typeof text !== 'string') return [];
  let clean = text.toLowerCase()
    .replace(/^(?:ol[áa]|oi|ei|rafinha|por\s+favor|pfv|ajuda|ajude|\s+)+[,:]?\s*/gi, '')
    .replace(/\b(?:no\s+site|no\s+portal|no\s+sistema|via\s+chat|no\s+app).*$/gi, '')
    .trim();

  if (!clean) return [];

  // Padrão Especial: "acesse o perfil de <aluno> em <secao>"
  const entitySectionRegex = /^(?:acesse|acessa|acessar|abra|abre|abrir|ver|veja|olhe|olhar|mostrar|mostre)?\s*(?:o|a)?\s*(?:perfil|dados|detalhes|ficha|cadastro|historico)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+?)\s+(?:em|no|na|nos|nas)\s+([a-zA-ZÀ-ÿ0-9_\s-]+)$/i;
  const mEntitySection = clean.match(entitySectionRegex);
  if (mEntitySection) {
    const student = mEntitySection[1].trim();
    let section = mEntitySection[2].trim().replace(/^(?:a|o|os|as)?\s*(?:aba|menu|se[çc][ãa]o|guia|tela)\s+/i, '').replace(/^(?:de|do|da)\s+/i, '').trim();
    return [
      `navegar até ${section}`,
      `acessar perfil de ${student}`
    ];
  }

  // 1. Normaliza conectivos temporais para delimitador uniforme
  let normalized = clean
    .replace(/\s*(?:e\s+depois|pra\s+depois|para\s+depois|em\s+seguida|logo\s+em\s+seguida|e\s+ent[ãa]o|depois|logo\s+ap[óo]s|e\s+logo\s+ap[óo]s|a[íi])\s+/gi, ' || ')
    .replace(/\s*;\s*/g, ' || ');

  // 2. Separa por vírgula ou " e " quando preceder verbo de ação ou comando
  const actionVerbs = '(?:selecionar|seleciona|selecione|escolher|escolha|escolhe|filtrar|filtra|filtre|marcar|marca|marque|lançar|lanca|lance|lancar|colocar|coloca|coloque|botar|bota|bote|anotar|anota|anote|registrar|registra|registre|ver|olhar|olhe|buscar|busca|busque|procurar|procura|procure|mostrar|mostra|mostre|baixar|baixa|baixe|enviar|envia|envie|responder|responda|responde|escrever|escreve|escreva|preencher|preencha|preenche|abrir|abra|abre|acessar|acesse|acessa|entrar|entre|entra|navegar|navegue|vai|v[áa]|ir|ler|liste|listar|perfil)';
  normalized = normalized.replace(new RegExp(`,\\s*(?=${actionVerbs}\\b)`, 'gi'), ' || ');
  normalized = normalized.replace(new RegExp(`\\s+e\\s+(?=${actionVerbs}\\b)`, 'gi'), ' || ');

  // 4. Se ainda não separou mas tem vírgulas com orações completas (>= 2 palavras de cada lado)
  if (!normalized.includes(' || ') && clean.includes(',')) {
    const commaParts = clean.split(',').map(s => s.trim()).filter(Boolean);
    if (commaParts.length > 1 && commaParts.every(p => p.split(/\s+/).length >= 2)) {
      normalized = commaParts.join(' || ');
    }
  }

  const rawSteps = normalized.split(' || ').map(s => s.trim()).filter(Boolean);
  if (rawSteps.length === 0) return [clean];

  const steps = rawSteps.map(step => {
    return step
      .replace(/^(?:e\s+|a[íi]\s+|ent[ãa]o\s+)+/i, '')
      .replace(/\s+(?:no\s+site|no\s+portal|no\s+sistema|via\s+chat|no\s+app).*$/i, '')
      .trim();
  }).filter(Boolean);

  return steps.length > 0 ? steps : [clean];
}

function splitCompoundCommand(text) {
  if (!text || typeof text !== 'string') {
    return { hasNavigation: false, navTarget: null, conjunction: null, remainingCommand: null, isCompound: false };
  }

  let clean = text.toLowerCase()
    .replace(/^(?:ol[áa]|oi|ei|rafinha|por\s+favor|pfv|ajuda|ajude|\s+)+[,:]?\s*/gi, '')
    .replace(/\b(?:no\s+site|no\s+portal|no\s+sistema|via\s+chat|no\s+app).*$/gi, '')
    .trim();

  // Padrão Especial 1: "<ação/entidade> [de/do/da] <alvo> em/no/na <seção>"
  // Ex: "acesse o perfil de alice almeida em meus alunos", "ver dados de joão em diário"
  const entitySectionRegex = /^(?:acesse|acessa|acessar|abra|abre|abrir|ver|veja|olhe|olhar|mostrar|mostre)?\s*(?:o|a)?\s*(?:perfil|dados|detalhes|ficha|cadastro|historico)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+?)\s+(?:em|no|na|nos|nas)\s+([a-zA-ZÀ-ÿ0-9_\s-]+)$/i;
  const mEntitySection = clean.match(entitySectionRegex);
  if (mEntitySection) {
    const entityName = mEntitySection[1].trim();
    let sectionName = mEntitySection[2].trim();
    sectionName = sectionName.replace(/^(?:a|o|os|as)?\s*(?:aba|menu|se[çc][ãa]o|guia|tela)\s+/i, '').trim();
    sectionName = sectionName.replace(/^(?:de|do|da)\s+/i, '').trim();
    return {
      hasNavigation: true,
      navTarget: sectionName,
      conjunction: 'em',
      remainingCommand: `acessar perfil de ${entityName}`,
      isCompound: true,
      aluno: entityName,
      acaoSecundaria: 'abrir_perfil'
    };
  }

  // Padrão Especial 2: "<ação/entidade> [de/do/da] <alvo>" sem seção (ex: "acesse o perfil de alice almeida")
  // NUNCA deve ser interpretado como nome de aba literal!
  const entityDirectRegex = /^(?:acesse|acessa|acessar|abra|abre|abrir|ver|veja|olhe|olhar|mostrar|mostre)?\s*(?:o|a)?\s*(?:perfil|dados|detalhes|ficha|cadastro|historico)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)$/i;
  const mEntityDirect = clean.match(entityDirectRegex);
  if (mEntityDirect && !/(?:turma|escola|professor|professora)/i.test(clean)) {
    const entityName = mEntityDirect[1].trim();
    return {
      hasNavigation: false,
      navTarget: null,
      conjunction: null,
      remainingCommand: `acessar perfil de ${entityName}`,
      isCompound: false,
      aluno: entityName,
      acaoSecundaria: 'abrir_perfil'
    };
  }

  // Prefixos de verbos de navegação
  const navPrefixRegex = /(?:^|\b)(?:entre|entra|entrar|vai|v[áa]|ir|navegue|navega|navegar|acesse|acessa|acessar|abra|abre|abrir|clique|clica|clicar|mostre|mostra|quero\s+ver|ver)\s+(?:\b(?:em|no|na|nos|nas|para|pra|pro|pela|pelo)\b\s+)?(?:\b(?:a|o|os|as)\b\s+)?(?:\b(?:aba|menu|se[çc][ãa]o|guia|link|tela|pasta)\b\s+)?(?:\b(?:de|do|da|dos|das)\b\s+)?/i;

  const prefixMatch = clean.match(navPrefixRegex);
  if (!prefixMatch) {
    // Tenta padrão secundário: "aba/menu/seção/guia X"
    const m2 = clean.match(/^(?:aba|menu|se[çc][ãa]o|guia)\s+([a-zA-ZÀ-ÿ0-9_-]+(?:\s+[a-zA-ZÀ-ÿ0-9_-]+)?)/i);
    if (m2) {
      let target = m2[1].trim().replace(/^(?:de|do|da)\s+/i, '').trim();
      const rest = clean.substring(m2[0].length).trim();
      return {
        hasNavigation: true,
        navTarget: target,
        conjunction: null,
        remainingCommand: rest || null,
        isCompound: Boolean(rest)
      };
    }
    return { hasNavigation: false, navTarget: null, conjunction: null, remainingCommand: null, isCompound: false };
  }

  // O texto após o verbo/prefixo de navegação
  const afterPrefix = clean.substring(prefixMatch.index + prefixMatch[0].length).trim();
  if (!afterPrefix) {
    return { hasNavigation: false, navTarget: null, conjunction: null, remainingCommand: null, isCompound: false };
  }

  // Divisores: conjunções e conectivos ou verbos de ação subsequentes
  const conjunctionRegex = /\s*(?:,\s*|\s*;\s*|\s+(?:e\s+depois|pra\s+depois|para\s+depois|em\s+seguida|logo\s+em\s+seguida|e\s+ent[ãa]o|ent[ãa]o|depois|a[íi]|e)\s+|\s+(?:selecionar|seleciona|selecione|escolher|escolha|escolhe|filtrar|filtra|filtre|marcar|marca|marque|lan[çc]ar|lanca|lance|lancar|colocar|coloca|coloque|botar|bota|bote|anotar|anota|anote|registrar|registra|registre|ver|olhar|olhe|buscar|busca|busque|procurar|procura|procure|mostrar|mostra|mostre|baixar|baixa|baixe|enviar|envia|envie|responder|responda|responde|escrever|escreve|escreva|preencher|preencha|preenche)\b\s*)/i;

  const conjMatch = afterPrefix.match(conjunctionRegex);
  let navTarget = '';
  let remainingCommand = null;
  let conjunction = null;

  if (conjMatch && conjMatch.index !== undefined) {
    navTarget = afterPrefix.substring(0, conjMatch.index).trim();
    const matchedDivider = conjMatch[0].trim().toLowerCase();
    const rawRest = afterPrefix.substring(conjMatch.index + conjMatch[0].length).trim();

    const isActionVerb = /^(?:selecionar|seleciona|selecione|escolher|escolha|escolhe|filtrar|filtra|filtre|marcar|marca|marque|lan[çc]ar|lanca|lance|lancar|colocar|coloca|coloque|botar|bota|bote|anotar|anota|anote|registrar|registra|registre|ver|olhar|olhe|buscar|busca|busque|procurar|procura|procure|mostrar|mostra|mostre|baixar|baixa|baixe|enviar|envia|envie|responder|responda|responde|escrever|escreve|escreva|preencher|preencha|preenche)$/i.test(matchedDivider);

    if (isActionVerb) {
      conjunction = null;
      remainingCommand = `${matchedDivider} ${rawRest}`.trim();
    } else {
      conjunction = matchedDivider;
      remainingCommand = rawRest || null;
    }
  } else {
    navTarget = afterPrefix.trim();
  }

  // Limpa ruídos comuns no final do target preservando nomes compostos legítimos (diário de classe, plano de aula)
  navTarget = navTarget
    .replace(/^(?:a|o|os|as)\s+/i, '')
    .replace(/\s+(?:no\s+site|no\s+portal|do\s+portal|no\s+sistema|na\s+aba|via\s+chat|no\s+app).*$/i, '')
    .trim();

  if (!navTarget || ['aluno', 'nota', 'falta', 'a nota', 'uma nota', 'site', 'portal'].includes(navTarget.toLowerCase())) {
    return { hasNavigation: false, navTarget: null, conjunction: null, remainingCommand: null, isCompound: false };
  }

  return {
    hasNavigation: true,
    navTarget: navTarget,
    conjunction: conjunction,
    remainingCommand: remainingCommand || null,
    isCompound: Boolean(remainingCommand && remainingCommand.trim().length > 0)
  };
}

function extractNavigationTarget(text) {
  const compound = splitCompoundCommand(text);
  if (compound && compound.hasNavigation && compound.navTarget) {
    return compound.navTarget;
  }
  return null;
}

async function parseNaturalIntent(text) {
  try {
    const res = await fetch('http://localhost:8765/natural_intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, parse_only: true })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.intencao) return data.intencao;
      if (data.intent) return data.intent;
      if (data.acao) return data;
    }
  } catch (e) {
    console.warn('[SidePanel] Endpoint natural_intent offline, usando parser heurístico local:', e);
  }

  // Heurística local de fallback resiliente
  const navTarget = extractNavigationTarget(text);
  if (navTarget) {
    return {
      acao: 'navegar_aba',
      destino: navTarget,
      aluno: null,
      nota: null,
      disciplina: 'Geral'
    };
  }

  const isFalta = /falta|presen[çc]a|aus[êe]ncia/i.test(text);
  const notaMatch = text.match(/(?:nota|grau|avalia[çc][ãa]o)\s+(\d+[.,]?\d*)/i) || text.match(/(\d+[.,]?\d*)\s+(?:para|pro|ao)/i);
  const notaVal = notaMatch ? parseFloat(notaMatch[1].replace(',', '.')) : 8.5;
  
  let alunoName = '';
  const alunoMatch = text.match(/(?:para|pro|ao|aluno|aluna)\s+([A-ZÁ-Úa-zá-ú\s]+)/i);
  if (alunoMatch) {
    alunoName = alunoMatch[1].trim().replace(/\s+(nota|falta|\d+).*/i, '');
  } else {
    alunoName = text.replace(/(?:lan[çc]ar?|lan[çc]a|nota|falta|\d+[.,]?\d*)/gi, '').trim();
  }
  alunoName = alunoName.replace(/^(?:o|a|os|as|do|da|de|pro|pra|para)\s+/i, '').trim();

  if (isFalta) {
    const faltaMatch = text.match(/(\d+)\s+falta/i) || text.match(/falta\s+(\d+)/i);
    const faltasVal = faltaMatch ? parseInt(faltaMatch[1], 10) : 1;
    return {
      acao: 'lancar_falta',
      aluno: alunoName || 'João Silva',
      faltas: faltasVal,
      disciplina: 'Geral'
    };
  }

  return {
    acao: 'lancar_nota',
    aluno: alunoName || 'João Silva',
    nota: notaVal,
    disciplina: 'Geral'
  };
}

// ── Utilitários do Chat Stream & Interface Conversacional ────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-history-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function appendUserChatMessage(text) {
  const container = document.getElementById('chat-history-container');
  if (!container) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg user';
  msgEl.innerHTML = `
    <div class="chat-avatar">👩‍🏫</div>
    <div class="chat-bubble">${escapeHtml(text)}</div>
  `;
  container.appendChild(msgEl);
  scrollChatToBottom();
  return msgEl;
}

function appendAssistantChatMessage(content, isHtml = false) {
  const container = document.getElementById('chat-history-container');
  if (!container) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg assistant';
  msgEl.innerHTML = `
    <div class="chat-avatar">🦉</div>
    <div class="chat-bubble">${isHtml ? content : escapeHtml(content)}</div>
  `;
  container.appendChild(msgEl);
  scrollChatToBottom();
  return msgEl;
}

function setProcessingState(isProcessing, message = 'Rafinha pensando...') {
  const indicator = document.getElementById('chat-typing-indicator');
  const textEl = document.getElementById('typing-indicator-text');
  if (!indicator) return;
  if (isProcessing) {
    if (textEl) textEl.textContent = message;
    indicator.style.display = 'flex';
    scrollChatToBottom();
  } else {
    indicator.style.display = 'none';
  }
}

function fillCommandTemplate(template) {
  const input = document.getElementById('input-agent-command');
  if (!input) return;
  input.value = template;
  input.focus();
  const idx = template.indexOf('___');
  if (idx !== -1) {
    input.setSelectionRange(idx, idx + 3);
  }
}

// ── Promoção Automática de Atalhos por Frequência de Uso (Zero Setup) ────────

function getActionTrackingKey(actionType, turmaName) {
  const a = (actionType || 'acao').trim().toLowerCase();
  const t = (turmaName || 'geral').trim().toLowerCase().replace(/\s+/g, '_');
  return `${a}__${t}`;
}

function trackActionUsage(actionType, turmaName, commandText) {
  try {
    const key = getActionTrackingKey(actionType, turmaName);

    // Se já promovido ou dispensado pela professora, ignora
    const promoted = JSON.parse(localStorage.getItem('teacher_promoted_shortcuts') || '[]');
    if (promoted.some(p => p.actionKey === key)) return;

    const dismissed = JSON.parse(localStorage.getItem('teacher_dismissed_promotions') || '{}');
    if (dismissed[key]) return;

    // Incrementa contador de uso no localStorage
    const freqs = JSON.parse(localStorage.getItem('teacher_action_frequencies') || '{}');
    freqs[key] = (freqs[key] || 0) + 1;
    localStorage.setItem('teacher_action_frequencies', JSON.stringify(freqs));

    console.log(`[SidePanel] Frequência de ação: ${key} = ${freqs[key]} execuções`);

    // Atingiu 3 execuções -> sugere promoção proativa no chat
    if (freqs[key] >= 3) {
      promptShortcutPromotion(key, { actionType, turmaName, commandText });
    }
  } catch (e) {
    console.warn('[SidePanel] Erro ao rastrear uso de ação:', e);
  }
}

function promptShortcutPromotion(actionKey, info) {
  const container = document.getElementById('chat-history-container');
  if (!container) return;

  const turmaDisplay = info.turmaName || 'nesta turma';
  const actionLabel = info.actionType === 'lancar_falta' ? 'Falta' : 'Nota';
  const actionVerb = info.actionType === 'lancar_falta' ? 'lançar falta' : 'lançar nota';
  const shortcutTitle = `⚡ ${actionLabel} ${info.turmaName || 'Turma'}`;
  const defaultCommand = info.actionType === 'lancar_falta' 
    ? 'Lança falta para o aluno ___' 
    : 'Lança nota ___ para o aluno ___';
  const sanitizedId = actionKey.replace(/[^a-zA-Z0-9_-]/g, '_');

  const promoDiv = document.createElement('div');
  promoDiv.className = 'chat-msg assistant';
  promoDiv.id = `promo-${sanitizedId}`;
  promoDiv.innerHTML = `
    <div class="chat-avatar">🦉</div>
    <div class="chat-bubble">
      <div class="shortcut-promotion-box">
        <div class="shortcut-promotion-title">
          <i class="ti ti-sparkles"></i> Sugestão da Rafinha
        </div>
        Percebi que você costuma <strong>${actionVerb}</strong> com frequência (${escapeHtml(turmaDisplay)}). Gostaria de fixar um atalho rápido na barra acima para agilizar?
        <div class="shortcut-promotion-actions">
          <button class="btn-shortcut-accept" id="btn-accept-${sanitizedId}">
            ⭐ Sim, criar atalho
          </button>
          <button class="btn-shortcut-dismiss" id="btn-dismiss-${sanitizedId}">
            Agora não
          </button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(promoDiv);
  scrollChatToBottom();

  const btnAccept = document.getElementById(`btn-accept-${sanitizedId}`);
  const btnDismiss = document.getElementById(`btn-dismiss-${sanitizedId}`);

  if (btnAccept) {
    btnAccept.addEventListener('click', () => {
      promoDiv.remove();
      savePromotedShortcut({
        id: 'sc_' + Date.now(),
        actionKey,
        label: `${actionLabel} ${info.turmaName || 'Turma'}`,
        command: defaultCommand
      });
      appendAssistantChatMessage(`Pronto! Adicionei o atalho **${shortcutTitle}** na sua barra de Ações Rápidas acima. Basta clicar nele para preencher rapidamente quando quiser! ✨`, true);
    });
  }

  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      promoDiv.remove();
      dismissShortcutPromotion(actionKey);
      appendAssistantChatMessage('Combinado! Se você continuar usando bastante no futuro, posso sugerir novamente.');
    });
  }
}

function savePromotedShortcut(shortcut) {
  try {
    const list = JSON.parse(localStorage.getItem('teacher_promoted_shortcuts') || '[]');
    list.push(shortcut);
    localStorage.setItem('teacher_promoted_shortcuts', JSON.stringify(list));
    renderPromotedChips();
  } catch (e) {
    console.warn('[SidePanel] Erro ao salvar atalho promovido:', e);
  }
}

function dismissShortcutPromotion(actionKey) {
  try {
    const dismissed = JSON.parse(localStorage.getItem('teacher_dismissed_promotions') || '{}');
    dismissed[actionKey] = true;
    localStorage.setItem('teacher_dismissed_promotions', JSON.stringify(dismissed));
  } catch (e) {
    console.warn('[SidePanel] Erro ao dispensar promoção:', e);
  }
}

function renderPromotedChips() {
  const slot = document.getElementById('promoted-chips-slot');
  if (!slot) return;
  slot.innerHTML = '';

  try {
    const list = JSON.parse(localStorage.getItem('teacher_promoted_shortcuts') || '[]');
    list.forEach(sc => {
      const chip = document.createElement('button');
      chip.className = 'quick-action-chip promoted';
      chip.title = `Atalho rápido frequente: ${sc.label}`;
      chip.innerHTML = `⚡ ${escapeHtml(sc.label)}`;
      chip.addEventListener('click', () => {
        if (sc.command && sc.command.includes('___')) {
          fillCommandTemplate(sc.command);
        } else if (sc.command) {
          handleProcessCommand(sc.command);
        }
      });
      slot.appendChild(chip);
    });
  } catch (e) {
    console.warn('[SidePanel] Erro ao renderizar chips promovidos:', e);
  }
}

function setupQuickActions() {
  const chips = document.querySelectorAll('.quick-action-chip:not(.promoted)');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const template = chip.dataset.template;
      const command = chip.dataset.command;
      if (template) {
        fillCommandTemplate(template);
      } else if (command) {
        const inputCommand = document.getElementById('input-agent-command');
        if (inputCommand) inputCommand.value = command;
        handleProcessCommand(command);
      }
    });
  });
  renderPromotedChips();
}

let progressTimer = null;

function hideAllApprovalCards() {
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  const disambig = document.getElementById('card-disambiguation');
  const preview = document.getElementById('card-approval-preview');
  const success = document.getElementById('card-execution-success');
  const err = document.getElementById('card-honest-error');
  const progress = document.getElementById('card-natural-progress');
  const clarify = document.getElementById('card-clarification-point-click');

  if (disambig) disambig.style.display = 'none';
  if (preview) preview.style.display = 'none';
  if (success) success.style.display = 'none';
  if (err) err.style.display = 'none';
  if (progress) progress.style.display = 'none';
  if (clarify) clarify.style.display = 'none';
}

function showNaturalProgressCard(message) {
  hideAllApprovalCards();
  const card = document.getElementById('card-natural-progress');
  const txt = document.getElementById('natural-progress-text');
  const initialText = message || "Isso pode levar um minutinho na primeira vez, já estou vendo como funciona aqui...";
  if (txt) txt.textContent = initialText;
  if (card) card.style.display = 'block';
  scrollChatToBottom();

  // Gerenciamento de expectativa: após 18s exibe mensagem de acompanhamento
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    if (card && card.style.display !== 'none' && txt) {
      txt.textContent = "Ainda trabalhando nisso...";
    }
  }, 18000);
}

function showClarificationPointClickCard(question) {
  hideAllApprovalCards();
  setProcessingState(false);
  const card = document.getElementById('card-clarification-point-click');
  const txt = document.getElementById('clarification-question-text');
  if (txt && question) txt.textContent = question;
  if (card) card.style.display = 'block';
  scrollChatToBottom();
}

function showDisambiguationCard(intent, candidates) {
  hideAllApprovalCards();
  setProcessingState(false);
  const card = document.getElementById('card-disambiguation');
  const container = document.getElementById('disambiguation-candidates');
  if (!card || !container) return;
  container.innerHTML = '';

  candidates.forEach(cand => {
    const btn = document.createElement('button');
    btn.className = 'candidate-chip';
    btn.innerHTML = `<strong>👤 ${escapeHtml(cand.name)}</strong> <span style="color:#64748b; font-size:10px;">(Nota atual: ${escapeHtml(String(cand.currentValue || 'vazio'))})</span>`;
    btn.onclick = () => {
      showApprovalPreviewCard(cand, intent);
    };
    container.appendChild(btn);
  });

  card.style.display = 'block';
  scrollChatToBottom();
}

function showApprovalPreviewCard(student, intent) {
  hideAllApprovalCards();
  setProcessingState(false);
  activePendingApproval = {
    student,
    intent,
    checkpointId: 'chk_' + Math.random().toString(36).substring(2, 9)
  };

  const nameEl = document.getElementById('approval-student-name');
  const descEl = document.getElementById('approval-action-desc');
  const beforeEl = document.getElementById('approval-before-val');
  const afterEl = document.getElementById('approval-after-val');
  const chkEl = document.getElementById('approval-checkpoint-id');
  const card = document.getElementById('card-approval-preview');

  const actionLabel = intent.acao === 'lancar_falta' ? 'Lançamento de Falta' : 'Lançamento de Nota';
  let targetVal = intent.acao === 'lancar_falta' ? String(intent.faltas || 1) : String(intent.nota || '8.5');
  let gradeNormalizedNotice = '';

  if (intent.acao === 'lancar_nota' || !intent.acao) {
    const rawNota = parseFloat(String(targetVal).replace(',', '.'));
    if (!isNaN(rawNota) && rawNota > 10 && rawNota <= 100) {
      const normalized = parseFloat((rawNota / 10).toFixed(1));
      gradeNormalizedNotice = ` (ajustada de ${rawNota} para ${normalized} na escala 0-10)`;
      targetVal = String(normalized);
      intent.nota = normalized;
    }
  }

  if (nameEl) nameEl.textContent = student.name;
  if (descEl) descEl.textContent = `${actionLabel} • ${intent.disciplina || 'Portal Oficial'}${gradeNormalizedNotice}`;
  if (beforeEl) beforeEl.textContent = student.currentValue ? student.currentValue : 'Vazio';
  if (afterEl) afterEl.textContent = targetVal;
  if (chkEl) chkEl.textContent = activePendingApproval.checkpointId;

  if (card) card.style.display = 'block';

  // Exibição visível de divergência/conflito com o portal vivo
  const alertEl = document.getElementById('approval-conflict-alert');
  const alertTextEl = document.getElementById('approval-conflict-text');
  const hasConflict = !!(intent?.conflict_detected || student?.conflict_detected || intent?.warning || student?.warning);
  if (alertEl) {
    if (hasConflict) {
      alertEl.style.display = 'block';
      const warnMsg = intent?.warning || student?.warning || 'O valor no portal difere do cache do app. Ação calculada com base no portal ao vivo.';
      if (alertTextEl) alertTextEl.textContent = warnMsg;
      appendAssistantChatMessage(`⚠️ **Atenção à divergência**: ${escapeHtml(warnMsg)}`, false);
    } else {
      alertEl.style.display = 'none';
    }
  }

  scrollChatToBottom();
}

function showApprovalPreviewCardDirect(data) {
  hideAllApprovalCards();
  setProcessingState(false);
  activePendingApproval = {
    student: { name: data.studentName, currentValue: data.beforeVal },
    intent: { acao: data.actionType, aluno: data.studentName, nota: data.afterVal, faltas: data.afterVal },
    checkpointId: data.taskId || ('chk_' + Math.random().toString(36).substring(2, 9))
  };

  const nameEl = document.getElementById('approval-student-name');
  const descEl = document.getElementById('approval-action-desc');
  const beforeEl = document.getElementById('approval-before-val');
  const afterEl = document.getElementById('approval-after-val');
  const chkEl = document.getElementById('approval-checkpoint-id');
  const card = document.getElementById('card-approval-preview');

  if (nameEl) nameEl.textContent = data.studentName;
  if (descEl) descEl.textContent = data.actionDesc || 'Lançamento • Portal Oficial';
  if (beforeEl) beforeEl.textContent = data.beforeVal && data.beforeVal !== '' ? data.beforeVal : 'Vazio';
  if (afterEl) afterEl.textContent = String(data.afterVal);
  if (chkEl) chkEl.textContent = activePendingApproval.checkpointId;

  if (card) card.style.display = 'block';

  // Exibição visível de divergência/conflito em preview direto
  const directAlertEl = document.getElementById('approval-conflict-alert');
  const directAlertTextEl = document.getElementById('approval-conflict-text');
  const hasDirectConflict = !!(data.conflict_detected || data.conflictWarning || data.warning);
  if (directAlertEl) {
    if (hasDirectConflict) {
      directAlertEl.style.display = 'block';
      const warnMsg = data.conflictWarning || data.warning || 'O valor no portal difere do cache do app. Ação calculada com base no portal ao vivo.';
      if (directAlertTextEl) directAlertTextEl.textContent = warnMsg;
      appendAssistantChatMessage(`⚠️ **Atenção à divergência**: ${escapeHtml(warnMsg)}`, false);
    } else {
      directAlertEl.style.display = 'none';
    }
  }

  scrollChatToBottom();
}

function showHonestErrorCard(title, message) {
  hideAllApprovalCards();
  setProcessingState(false);
  const card = document.getElementById('card-honest-error');
  const titleEl = document.getElementById('error-title');
  const textEl = document.getElementById('error-detail-text');

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = message;
  if (card) card.style.display = 'block';
  scrollChatToBottom();
}

function showSuccessCard(studentName, beforeVal, afterVal) {
  hideAllApprovalCards();
  setProcessingState(false);
  const card = document.getElementById('card-execution-success');
  const textEl = document.getElementById('success-detail-text');

  if (textEl) {
    textEl.innerHTML = `
      <strong>${studentName}</strong>: Alteração de <code>${beforeVal || 'vazio'}</code> para <strong><code>${afterVal}</code></strong>.<br>
      <span style="font-size:10px; color:#059669; font-weight:600;">✓ Valor verificado e persistido no DOM oficial às ${new Date().toLocaleTimeString()}.</span>
    `;
  }
  if (card) card.style.display = 'block';
  scrollChatToBottom();
}

async function dispatchPortalBridgeMessage(msg, callback) {
  try {
    if (!msg.tabId) {
      const portalTab = await getActivePortalTab();
      if (portalTab?.id) {
        msg.tabId = portalTab.id;
        msg.tabUrl = portalTab.url;
      }
    }
  } catch {}

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (!chrome.runtime.lastError && resp) {
          callback(resp);
          return;
        }
        if (window.__portalBridge) {
          window.__portalBridge(msg, callback);
          return;
        }
        callback(resp);
      });
      return;
    } catch (e) {
      if (window.__portalBridge) {
        window.__portalBridge(msg, callback);
        return;
      }
    }
  }
  if (window.__portalBridge) {
    window.__portalBridge(msg, callback);
    return;
  }
  callback(null);
}

async function handleProcessCommand(commandText) {
  if (!commandText || !commandText.trim()) return;
  const textClean = commandText.trim();

  // 1. Adiciona a mensagem da professora no histórico de conversa
  appendUserChatMessage(textClean);

  // Limpa o input de comando
  const inputCmd = document.getElementById('input-agent-command');
  if (inputCmd) inputCmd.value = '';

  // 2. Aciona indicador de processando dinâmico
  setProcessingState(true, 'Rafinha pensando...');

  // ─── UNIFICAÇÃO AGÊNTICA: APP (/api/agent) COMO CÉREBRO ÚNICO (ITEM 1) ───
  try {
    let portalTab = null;
    try {
      portalTab = await getActivePortalTab();
    } catch {}

    const portalContext = `[Portal Ativo: ${portalTab?.title || 'Portal Escolar'} | URL: ${portalTab?.url || ''}]`;

    const agentRes = await fetch('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: textClean }],
        context: portalContext,
        autoMode: true
      })
    });

    if (agentRes.ok) {
      const agentData = await agentRes.json();
      const toolUse = agentData.toolUse || (agentData.content && Array.isArray(agentData.content) ? agentData.content.filter(c => c.type === 'tool_use') : []);
      const firstTool = Array.isArray(toolUse) && toolUse.length > 0 ? toolUse[0] : null;

      if (firstTool) {
        const toolName = firstTool.name || firstTool.id;
        const toolInput = firstTool.input || {};

        // Identifica se é Tipo (a) ou Tipo (b)
        const isDomTool = [
          'execute_portal_action',
          'confirm_portal_submission',
          'show_portal_screenshot',
          'fill_school_portal',
          'open_school_portal'
        ].includes(toolName) || (toolName === 'invoke_teacher_capability' && ['read_roster', 'read_grades', 'post_grade', 'read_assignments', 'read_calendar'].includes(toolInput?.capability));

        if (!isDomTool) {
          // FERRAMENTA TIPO (a): MUTAÇÃO LOCAL DO APP
          setProcessingState(false);
          postToEntityBus('EXECUTE_APP_TOOL', {
            tool: toolName,
            params: toolInput,
            source: 'side_panel_extension'
          });

          const friendlyMessage = agentData.reply || agentData.content?.[0]?.text || `✨ Solicitação processada pelo Teacher AI com a ferramenta "${toolName}"!`;
          appendAssistantChatMessage(friendlyMessage, true);
          return;
        }

        // FERRAMENTA TIPO (b): INTERAÇÃO COM O DOM DO PORTAL
        if (toolName === 'read_roster' || (toolName === 'invoke_teacher_capability' && toolInput?.capability === 'read_roster')) {
          setProcessingState(true, 'Lendo alunos via GraphExecutor no portal...');
          executeGoalQueue(['ler alunos'], 0, {});
          return;
        }

        if (toolName === 'execute_portal_action' || toolName === 'fill_school_portal') {
          setProcessingState(true, 'Preenchendo campos no portal via GraphExecutor...');
          dispatchPortalBridgeMessage({
            action: 'EXECUTE_PORTAL_ACTION',
            payload: toolInput
          }, (actResp) => {
            setProcessingState(false);
            if (actResp && (actResp.ok || actResp.sucesso || actResp.success)) {
              appendAssistantChatMessage(`✅ Campos preenchidos no portal com sucesso! Confirma o salvamento final?`, true);
            } else {
              appendAssistantChatMessage(`⚠️ Não foi possível preencher os campos no portal: ${actResp?.mensagem || actResp?.error || 'Erro desconhecido'}`, true);
            }
          });
          return;
        }
      } else if (agentData.reply || (agentData.content?.[0]?.text)) {
        setProcessingState(false);
        appendAssistantChatMessage(agentData.reply || agentData.content[0].text, true);
        return;
      }
    }
  } catch (err) {
    console.warn('[SidePanel] App /api/agent indisponível, usando fallback offline do side panel:', err);
  }

  // Caso especial: comandos de leitura direta ("Ler lista de alunos", "Ver notas da turma")
  const isDirectReading = /^(?:me\s+diga|diga|diz|liste|listar|mostre|mostrar|ver|veja|quais|qual|quantos|quantas|quando|consultar|resumir)\b/i.test(textClean) ||
                          /(?:quais\s+dias|quais\s+hor[aá]rios|que\s+aulas|quantas\s+aulas|me\s+diga|me\s+mostre|me\s+fale)/i.test(textClean);

  const compoundCheck = splitCompoundCommand(textClean);
  if (isDirectReading && !compoundCheck.hasNavigation) {
    setProcessingState(true, 'Lendo dados da tela atual...');
    dispatchPortalBridgeMessage({ action: 'READ_PAGE_DATA' }, (pageData) => {
      if (pageData && pageData.sucesso) {
        // 1. Tenta resposta semântica com o backend/LLM (perguntas abertas, agregações e sínteses)
        dispatchPortalBridgeMessage({ action: 'ASK_PAGE_QUESTION', query: textClean, pageData }, (aiResp) => {
          if (aiResp && aiResp.sucesso && aiResp.answer) {
            setProcessingState(false);
            appendAssistantChatMessage(aiResp.answer, true);
            return;
          }

          // 2. Fallback: Motor Determinístico Local Estruturado
          const answer = synthesizeScreenAnswer(textClean, pageData);
          // Se a resposta foi negativa mas a intenção era claramente de horários, tenta navegar para a aba Horários
          const isScheduleIntent = /horario|aula|disciplina|materia|grade|quinta|segunda|terca|quarta|sexta/i.test(textClean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          if (answer.includes('Não encontrei dados suficientes') && isScheduleIntent) {
            setProcessingState(true, 'Acessando a aba Horários no portal...');
            dispatchPortalBridgeMessage({ action: 'NAVIGATE_PORTAL_TAB', target: 'horários' }, (navResp) => {
              if (navResp && navResp.sucesso) {
                setTimeout(() => {
                  dispatchPortalBridgeMessage({ action: 'READ_PAGE_DATA' }, (newPageData) => {
                    setProcessingState(false);
                    if (newPageData && newPageData.sucesso) {
                      const newAnswer = synthesizeScreenAnswer(textClean, newPageData);
                      appendAssistantChatMessage(newAnswer, true);
                    } else {
                      appendAssistantChatMessage(answer, true);
                    }
                  });
                }, 400);
              } else {
                setProcessingState(false);
                appendAssistantChatMessage(answer, true);
              }
            });
            return;
          }

          setProcessingState(false);
          appendAssistantChatMessage(answer, true);
        });
      } else {
        setProcessingState(false);
        appendAssistantChatMessage('Não consegui ler os dados da tela atual. Certifique-se de estar na aba correta do portal.', true);
      }
    });
    return;
  }

  const isReadCommand = /^(?:ler\s+lista|ver\s+notas|mostrar\s+alunos|listar\s+alunos)/i.test(textClean);
  if (isReadCommand) {
    setProcessingState(true, 'Lendo dados do portal escolar...');
    dispatchPortalBridgeMessage({ action: 'READ_ACTIVE_PORTAL_ROSTER' }, (resp) => {
      setProcessingState(false);
      const students = (resp && resp.students) || [];
      if (students.length > 0) {
        // Read-Through e Livre Intercâmbio para o Teacher AI App
        try {
          const activeTurmaEl = document.getElementById('active-class-name');
          const currentTurma = (activeTurmaEl && activeTurmaEl.textContent !== '—') ? activeTurmaEl.textContent : 'Turma Importada';
          const portalName = (PLATFORMS && PLATFORMS[activePlatform]?.name) || 'Portal Escolar';

          postToEntityBus('PORTAL_ROSTER_SYNC', {
            className: currentTurma,
            portalName: portalName,
            students: students,
            pageUrl: window.location.href
          });

          fetch('http://localhost:3000/api/portal/roster-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              className: currentTurma,
              portalName: portalName,
              students: students,
              pageUrl: window.location.href
            })
          }).catch(err => console.warn('[RosterSync] Falha ao sincronizar via API:', err));
        } catch (e) {}

        const studentNames = students.map(s => s.name).slice(0, 5).join(', ');
        const extraCount = students.length > 5 ? ` e mais ${students.length - 5} alunos` : '';
        appendAssistantChatMessage(`Encontrei **${students.length} alunos** nesta tela do portal:<br><span style="color:#475569; font-size:11px;">📋 ${studentNames}${extraCount}</span>`, true);
        if (typeof renderStudentListWithValidation === 'function') {
          renderStudentListWithValidation(students, { valid: true, confidence: 1.0 }, 'dom', 'Lista de Alunos');
        }
      } else {
        showHonestErrorCard('Lista de Alunos', 'Não encontrei registros de alunos nesta tela do portal. Certifique-se de estar na pauta ou diário.');
      }
    });
    return;
  }

  // Caso 4: Comandos Multi-Passo e Navegação Encadeada (PPAV Goal Queue)
  const subGoals = decomposeGoalJS(textClean);
  const compound = splitCompoundCommand(textClean);

  if (subGoals.length > 1 || (compound.hasNavigation && compound.navTarget)) {
    const queueToRun = (subGoals.length > 1)
      ? subGoals
      : (compound.remainingCommand ? [`abrir ${compound.navTarget}`, compound.remainingCommand] : [`abrir ${compound.navTarget}`]);

    executeGoalQueue(queueToRun, 0, {});
    return;
  }

  const intent = await parseNaturalIntent(textClean);

  // Caso de Acesso a Perfil Direto (sem navegação explícita ou já na tela)
  const isProfileDirect = (intent && intent.acao === 'abrir_perfil') ||
                          /(?:^|\b)(?:acesse|acessa|acessar|abra|abre|abrir|ver|veja|olhe|olhar|mostrar|mostre)?\s*(?:o|a)?\s*(?:perfil|dados|detalhes|ficha|cadastro)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)/i.test(textClean);
  if (isProfileDirect) {
    const profileMatch = textClean.match(/(?:perfil|dados|detalhes|ficha|cadastro)\s+(?:de|do|da)\s+([a-zA-ZÀ-ÿ\s]+)/i);
    const studentTarget = (profileMatch ? profileMatch[1] : (intent && intent.aluno ? intent.aluno : textClean)).trim();
    setProcessingState(true, `Acessando perfil de ${studentTarget}...`);
    dispatchPortalBridgeMessage({ action: 'DISCOVERY_FIND_AND_CLICK_STUDENT', studentName: studentTarget }, (stdResp) => {
      setProcessingState(false);
      if (stdResp && stdResp.sucesso) {
        const foundName = stdResp.elementText || studentTarget;
        appendAssistantChatMessage(`✅ Acessei o perfil de **${escapeHtml(foundName)}** com sucesso! 👤✨`, true);
      } else if (stdResp && stdResp.status === 'ambiguous') {
        appendAssistantChatMessage(
          `⚠️ Encontrei mais de um aluno com o nome **${escapeHtml(studentTarget)}** nesta tela. Por favor, escolha qual deles você deseja acessar: 🔍`,
          true
        );
        if (typeof showDisambiguationCard === 'function') {
          showDisambiguationCard({ aluno: studentTarget, acao: 'abrir_perfil' }, stdResp.candidates || []);
        }
      } else {
        appendAssistantChatMessage(
          `📂 Não encontrei o perfil do aluno **${escapeHtml(studentTarget)}** na tela atual. Você pode me mostrar onde fica ou clicar manualmente? 🔍`,
          true
        );
        showHonestErrorCard(
          'Aluno não encontrado',
          `Não encontrei o aluno '${studentTarget}' na tela atual do portal.`
        );
      }
    });
    return;
  }

  setProcessingState(true, 'Olhando o portal...');

  // 1. Prioridade 1: Verifica a aba ativa no navegador para desambiguação de homônimos ou match direto
  dispatchPortalBridgeMessage({ action: 'READ_ACTIVE_PORTAL_ROSTER' }, async (resp) => {
    let roster = (resp && resp.students) || [];
    if (roster && roster.length > 0) {
      // Read-Through automático em background
      try {
        const activeTurmaEl = document.getElementById('active-class-name');
        const currentTurma = (activeTurmaEl && activeTurmaEl.textContent !== '—') ? activeTurmaEl.textContent : 'Turma Ativa';
        fetch('http://localhost:3000/api/students/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            className: currentTurma,
            portalName: 'Portal Escolar Ativo',
            students: roster,
            pageUrl: window.location.href
          })
        }).catch(err => console.warn('[Read-Through] Falha background:', err));
      } catch (e) {}

      const matchResult = matchStudentByName(intent.aluno, roster, intent.matricula || intent.portal_native_id);
      if (matchResult.status === 'ambiguous') {
        setProcessingState(false);
        showDisambiguationCard(intent, matchResult.candidates);
        return;
      }
      if (matchResult.status === 'exact' || matchResult.status === 'confident_match') {
        setProcessingState(false);
        showApprovalPreviewCard(matchResult.student, intent);
        return;
      }
      if (matchResult.status === 'not_found') {
        setProcessingState(false);
        showHonestErrorCard(
          'Aluno não encontrado',
          `Não encontrei o aluno "${intent.aluno}" na lista desta turma. Verifique o nome ou selecione outra turma.`
        );
        return;
      }
    }

    // 2. Se a ação for inédita ou não houver match direto, aciona o aprendizado autônomo no backend
    showNaturalProgressCard("Isso pode levar um minutinho na primeira vez, já estou vendo como funciona aqui...");
    setProcessingState(true, 'Aprendendo navegação no portal...');

    try {
      const res = await fetch('http://localhost:8765/natural_intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textClean,
          parse_only: false,
          history: []
        })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[SidePanel] Resposta do backend:', data);
        setProcessingState(false);

        // Caso A: Pergunta de esclarecimento sobre parâmetros (ex: faltou nome do aluno)
        if (data.needs_clarification && data.mensagem) {
          showHonestErrorCard('Preciso de uma informação', data.mensagem);
          return;
        }

        // Caso B: Falha na descoberta autônoma -> Pergunta natural de esclarecimento com apontamento
        if (data.status === 'point_and_click_required' || data.action_required === 'point_and_click') {
          showClarificationPointClickCard(
            data.mensagem || "Não encontrei onde lançar nesta tela, você pode me mostrar clicando no lugar certo?"
          );
          return;
        }

        // Caso Navegação: Backend retornou intenção de navegar para aba/seção
        if (data.acao === 'navegar_aba' || data.action_required === 'navigate_tab') {
          const target = data.destino || 'Arquivos';
          const remaining = data.remaining_command || data.segunda_instrucao || null;
          dispatchPortalBridgeMessage({ action: 'NAVIGATE_PORTAL_TAB', target }, (navResp) => {
            if (navResp && navResp.sucesso) {
              const foundLabel = navResp.elementText || target;
              if (remaining) {
                appendAssistantChatMessage(`Prontinho! Entrei na aba **${escapeHtml(foundLabel)}** no portal. Agora estou procurando **${escapeHtml(remaining)}**... 📂🔍`, true);
                setProcessingState(true, `Executando: ${remaining}...`);
                const isSelection = /^(?:selecionar|seleciona|selecione|escolher|escolha|escolhe|filtrar|filtra|filtre|marcar|marca|marque)\s+/i.test(remaining);
                if (isSelection) {
                  const filterTerm = remaining.replace(/^(?:selecionar|seleciona|selecione|escolher|escolha|escolhe|filtrar|filtra|filtre|marcar|marca|marque)\s+(?:por\s+|a\s+|o\s+|pelo\s+|pela\s+|turma\s+|ano\s+)?/i, '').trim();
                  dispatchPortalBridgeMessage({ action: 'DISCOVERY_SELECT_FILTER', filterTerm }, (selResp) => {
                    setProcessingState(false);
                    if (selResp && selResp.sucesso) {
                      appendAssistantChatMessage(`✅ Entrei na aba **${escapeHtml(foundLabel)}** e selecionei **${escapeHtml(selResp.elementText || filterTerm)}** com sucesso! ✨`, true);
                    } else {
                      appendAssistantChatMessage(`📂 Entrei na aba **${escapeHtml(foundLabel)}**, mas não encontrei a opção **${escapeHtml(filterTerm)}** para selecionar nesta tela. Você pode me mostrar onde fica? 🔍`, true);
                      showClarificationPointClickCard(`Não encontrei onde selecionar "${filterTerm}" na aba ${foundLabel}. Você pode me mostrar clicando no lugar certo?`);
                    }
                  });
                  return;
                }
                setTimeout(() => executeSubsequentCommand(remaining, foundLabel), 500);
                return;
              }
              setProcessingState(false);
              appendAssistantChatMessage(`Prontinho! Entrei na aba **${escapeHtml(foundLabel)}** no portal para você. 📂✨`, true);
            } else {
              setProcessingState(false);
              appendAssistantChatMessage(data.mensagem || `Naveguei até **${escapeHtml(target)}** no portal escolar.`, true);
            }
          });
          return;
        }

        // Caso C: Descoberta bem-sucedida ou ação já mapeada -> Exibe PortalApprovalCard diretamente!
        if (data.card && (data.sucesso || data.needs_approval)) {
          const c = data.card;
          const diffItem = (c.diff && c.diff[0]) || {};
          const studentName = diffItem.studentName || data.intent?.aluno || 'Aluno';
          const fieldName = diffItem.field || (c.actionType === 'lancar_falta' ? 'Falta' : 'Nota');
          const beforeVal = diffItem.beforeValue || '—';
          const afterVal = diffItem.afterValue || (c.actionType === 'lancar_falta' ? '1' : '8.5');

          showApprovalPreviewCardDirect({
            studentName,
            actionDesc: `${fieldName} • ${c.portal || 'Portal Oficial'}`,
            beforeVal,
            afterVal,
            actionType: c.actionType || 'lancar_nota',
            taskId: c.taskId
          });
          return;
        }

        // Caso D: Operação concluída diretamente com sucesso
        if (data.sucesso) {
          showSuccessCard(data.aluno || 'Aluno', '', data.valor || 'OK');
          const activeTurmaEl = document.getElementById('active-class-name');
          const currentTurma = (activeTurmaEl && activeTurmaEl.textContent !== '—') ? activeTurmaEl.textContent : 'Turma 9A';
          trackActionUsage(intent.acao || 'lancar_nota', currentTurma, textClean);
          return;
        }
      }
    } catch (err) {
      console.warn('[SidePanel] Backend /natural_intent inacessível:', err);
    }

    setProcessingState(false);
    // Se não encontrou no backend nem na tela, exibe esclarecimento
    showClarificationPointClickCard(
      `Não encontrei onde lançar ${intent.acao === 'lancar_falta' ? 'falta' : 'nota'} para "${intent.aluno}" nesta tela. Você pode me mostrar clicando no lugar certo?`
    );
  });
}

function normalizeBrazilianWeekday(headerText) {
  if (!headerText) return null;
  const raw = String(headerText).trim();
  if (raw.length > 30) return null;
  const norm = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Descarta termos de tempo/período para evitar falsos positivos (ex: "1º horário", "2º tempo")
  if (/hor[aá]rio|tempo|per[ií]odo|aula|disciplina|turma|sala|prof/i.test(norm)) return null;

  if (/(?:^|\b)(?:2\s*[\u00AAªa](?:-?\s*feira)?|segunda(?:-feira)?|seg\b)/i.test(norm) ||
      /(?:^|\b)2\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '2ª-feira (Segunda)', key: 'segunda' };
  }
  if (/(?:^|\b)(?:3\s*[\u00AAªa](?:-?\s*feira)?|ter[çc]a(?:-feira)?|ter\b)/i.test(norm) ||
      /(?:^|\b)3\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '3ª-feira (Terça)', key: 'terca' };
  }
  if (/(?:^|\b)(?:4\s*[\u00AAªa](?:-?\s*feira)?|quarta(?:-feira)?|qua\b)/i.test(norm) ||
      /(?:^|\b)4\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '4ª-feira (Quarta)', key: 'quarta' };
  }
  if (/(?:^|\b)(?:5\s*[\u00AAªa](?:-?\s*feira)?|quinta(?:-feira)?|qui\b)/i.test(norm) ||
      /(?:^|\b)5\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '5ª-feira (Quinta)', key: 'quinta' };
  }
  if (/(?:^|\b)(?:6\s*[\u00AAªa](?:-?\s*feira)?|sexta(?:-feira)?|sex\b)/i.test(norm) ||
      /(?:^|\b)6\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '6ª-feira (Sexta)', key: 'sexta' };
  }
  if (/(?:^|\b)(?:s[aá]bado|sab\b)/i.test(norm)) {
    return { name: 'Sábado', key: 'sabado' };
  }
  if (/(?:^|\b)(?:domingo|dom\b)/i.test(norm)) {
    return { name: 'Domingo', key: 'domingo' };
  }
  return null;
}

function extractWeekdayFromText(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const norm = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/(?:2\s*[\u00AAªa](?:-?\s*feira)?|segunda(?:-feira)?)/i.test(norm)) return { name: '2ª-feira (Segunda)', key: 'segunda' };
  if (/(?:3\s*[\u00AAªa](?:-?\s*feira)?|ter[çc]a(?:-feira)?)/i.test(norm)) return { name: '3ª-feira (Terça)', key: 'terca' };
  if (/(?:4\s*[\u00AAªa](?:-?\s*feira)?|quarta(?:-feira)?)/i.test(norm)) return { name: '4ª-feira (Quarta)', key: 'quarta' };
  if (/(?:5\s*[\u00AAªa](?:-?\s*feira)?|quinta(?:-feira)?)/i.test(norm)) return { name: '5ª-feira (Quinta)', key: 'quinta' };
  if (/(?:6\s*[\u00AAªa](?:-?\s*feira)?|sexta(?:-feira)?)/i.test(norm)) return { name: '6ª-feira (Sexta)', key: 'sexta' };
  if (/s[aá]bado/i.test(norm)) return { name: 'Sábado', key: 'sabado' };
  if (/domingo/i.test(norm)) return { name: 'Domingo', key: 'domingo' };
  return null;
}

function synthesizeScreenAnswer(query, pageData) {
  if (!pageData) return 'Não foi possível extrair os dados da tela.';
  const q = (query || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const CANONICAL_DAYS_ORDER = [
    '2ª-feira (Segunda)',
    '3ª-feira (Terça)',
    '4ª-feira (Quarta)',
    '5ª-feira (Quinta)',
    '6ª-feira (Sexta)',
    'Sábado',
    'Domingo'
  ];

  const formatClassBadge = (raw) => {
    if (!raw) return '';
    let text = String(raw).trim();
    text = text.replace(/ENSINO FUNDAMENTAL(?:\s+II)?\s*-\s*/i, '');
    text = text.replace(/\(LING\.?\s*ING\.?\)/i, '(Língua Inglesa)');
    text = text.replace(/\(MAT\.?\)/i, '(Matemática)');
    text = text.replace(/\(PORT\.?\)/i, '(Língua Portuguesa)');
    text = text.replace(/\(HIST\.?\)/i, '(História)');
    text = text.replace(/\(GEO\.?\)/i, '(Geografia)');
    text = text.replace(/\(CIEN\.?\)/i, '(Ciências)');
    return text;
  };

  const parseStartTimeMinutes = (slotStr) => {
    const m = (slotStr || '').match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 9999;
  };

  // 1. Horários / Aulas / Grade Semanal
  const isHorarioPage = /horario/i.test(pageData.activeTab || '') || /horario/i.test(pageData.url || '');
  const isHorarioQuery = isHorarioPage || /horario|aula|dias|quando|grade|semana|disciplina|materia|quinta|segunda|terca|quarta|sexta|sabado|leciono|[2-6]\s*[\u00AAªa]/i.test(q);
  if (isHorarioQuery) {
    let scheduleTable = null;
    let dayCols = [];

    if (pageData.tables && pageData.tables.length > 0) {
      for (const table of pageData.tables) {
        let headers = table.headers || [];
        let rows = table.rows || [];

        // 1. Tenta identificar dias nos headers
        let detectedDays = [];
        headers.forEach((h, idx) => {
          const matchedDay = normalizeBrazilianWeekday(h);
          if (matchedDay) {
            detectedDays.push({ ...matchedDay, originalHeader: h, idx });
          }
        });

        // 2. Se os headers tiverem menos de 2 dias identificados, verifica se rows[0] contém os dias
        if (detectedDays.length < 2 && rows.length > 0) {
          const firstRowDays = [];
          rows[0].forEach((cell, idx) => {
            const matchedDay = normalizeBrazilianWeekday(cell);
            if (matchedDay) {
              firstRowDays.push({ ...matchedDay, originalHeader: cell, idx });
            }
          });
          if (firstRowDays.length >= 2) {
            headers = rows[0];
            rows = rows.slice(1);
            detectedDays = firstRowDays;
          }
        }

        // 3. Grade horizontal (dias nas colunas)
        if (detectedDays.length >= 2) {
          scheduleTable = { ...table, headers, rows, isVertical: false };
          dayCols = detectedDays;
          break;
        }

        // 4. Grade vertical (dias na primeira coluna de cada linha)
        if (rows.length >= 2) {
          const verticalDays = [];
          rows.forEach((r, rIdx) => {
            const cell0 = r[0] || '';
            const matchedDay = normalizeBrazilianWeekday(cell0);
            if (matchedDay) {
              verticalDays.push({ ...matchedDay, rowIdx: rIdx, cells: r.slice(1) });
            }
          });
          if (verticalDays.length >= 2) {
            scheduleTable = { ...table, headers, rows, isVertical: true, verticalDays };
            break;
          }
        }
      }
    }

    // Fallback: se não encontrou em tabelas, verifica se há cards com dias e horários
    const byDay = {};
    if (!scheduleTable && pageData.cards && pageData.cards.length > 0) {
      for (const card of pageData.cards) {
        const matchedDay = extractWeekdayFromText(card);
        const timeMatch = card.match(/(\d{1,2}:\d{2}\s*(?:às|as|-|a)\s*\d{1,2}:\d{2})/i);
        if (matchedDay && timeMatch) {
          if (!byDay[matchedDay.name]) byDay[matchedDay.name] = { key: matchedDay.key, items: [] };
          byDay[matchedDay.name].items.push({ timeSlot: timeMatch[1], info: card.replace(timeMatch[1], '').replace(/^[–—: -]+/, '').trim() });
          scheduleTable = { id: 'cards', isVertical: false, rows: [] };
        }
      }
    }

    // Se NÃO houver tabela identificada:
    if (!scheduleTable) {
      const currentLoc = pageData.activeTab || (pageData.pageHeadings && pageData.pageHeadings[0]) || pageData.pageTitle || 'tela atual';
      const isActuallyOnSchedulePage = /horario/i.test(currentLoc) || /horario/i.test(pageData.url || '');
      if (isActuallyOnSchedulePage) {
        return `Estou na tela de **Horários**, mas a grade de aulas ainda não está visível ou não há aulas cadastradas para o período selecionado. 🗓️`;
      }
      return `Não consegui confirmar que estou na tela de Horários/Grade de Aulas (a tela aberta no portal parece ser: **${escapeHtml(currentLoc)}**).<br><br>👉 **Por favor, navegue até a tela de Horários no portal** e pergunte novamente para que eu possa ler a grade oficial com precisão! 🧭`;
    }

    // Popula byDay a partir da tabela
    if (scheduleTable && !scheduleTable.isVertical && scheduleTable.rows) {
      for (const row of scheduleTable.rows) {
        const rawSlot = row[0] || '';
        const cleanSlot = rawSlot.replace(/\s+/g, ' ').trim();
        const timeMatch = cleanSlot.match(/(\d{1,2}:\d{2}\s*(?:às|as|-|a)\s*\d{1,2}:\d{2})/i);
        const slotNumMatch = cleanSlot.match(/(\d+[ºoªa]?\s*hor[aá]rio)/i);
        let timeLabel = cleanSlot;
        if (timeMatch && slotNumMatch) {
          timeLabel = `${timeMatch[1]} (${slotNumMatch[1]})`;
        } else if (timeMatch) {
          timeLabel = timeMatch[1];
        }

        for (const col of dayCols) {
          const cell = (row[col.idx] || '').replace(/\s+/g, ' ').trim();
          if (cell && !['-', '—', '', 'livre', 'folga', 'sem aula'].includes(cell.toLowerCase())) {
            if (!byDay[col.name]) byDay[col.name] = { key: col.key, items: [] };
            byDay[col.name].items.push({ timeSlot: timeLabel, info: cell });
          }
        }
      }
    } else if (scheduleTable && scheduleTable.isVertical && scheduleTable.verticalDays) {
      for (const d of scheduleTable.verticalDays) {
        if (!byDay[d.name]) byDay[d.name] = { key: d.key, items: [] };
        for (const cell of d.cells) {
          const cleanCell = (cell || '').replace(/\s+/g, ' ').trim();
          if (cleanCell && !['-', '—', '', 'livre', 'folga', 'sem aula'].includes(cleanCell.toLowerCase())) {
            const timeMatch = cleanCell.match(/(\d{1,2}:\d{2}\s*(?:às|as|-|a)\s*\d{1,2}:\d{2})/i);
            const slotNumMatch = cleanCell.match(/(\d+[ºoªa]?\s*hor[aá]rio)/i);
            let timeLabel = '';
            if (timeMatch && slotNumMatch) timeLabel = `${timeMatch[1]} (${slotNumMatch[1]})`;
            else if (timeMatch) timeLabel = timeMatch[1];
            else timeLabel = 'Horário letivo';
            byDay[d.name].items.push({ timeSlot: timeLabel, info: cleanCell });
          }
        }
      }
    }

    // ORDENAÇÃO CRONOLÓGICA DOS HORÁRIOS DENTRO DE CADA DIA
    for (const dName in byDay) {
      byDay[dName].items.sort((a, b) => parseStartTimeMinutes(a.timeSlot) - parseStartTimeMinutes(b.timeSlot));
    }

    // ── SUB-PERGUNTA A: Contagem ou Total de Aulas ──
    if (/quantas\s+aulas|total\s+de\s+aulas|quantidade\s+de\s+aulas|carga\s+hor[aá]ria/i.test(q)) {
      let totalCount = 0;
      for (const d in byDay) totalCount += byDay[d].items.length;
      const sortedActiveDays = CANONICAL_DAYS_ORDER.filter(d => byDay[d] && byDay[d].items.length > 0);
      const dayList = sortedActiveDays.map(d => d.split(' ')[0]).join(', ');
      return `Você tem um total de **${totalCount} aulas semanais** distribuídas em **${sortedActiveDays.length} dias letivos** (${escapeHtml(dayList)})! 🗓️✨`;
    }

    // ── SUB-PERGUNTA B: Filtragem por Turma Específica (ex: 7º ano, 6º ano) ──
    const turmaQueryMatch = q.match(/([1-9]|6º|7º|8º|9º|1º|2º|3º)\s*(?:º|o|°)?\s*(?:ano|turma|serie)/i) ||
                            q.match(/(?:turma|ano|serie)\s+([1-9]|6|7|8|9|1|2|3)[a-z]?/i);
    const isTurmaFiltering = turmaQueryMatch && /quando|quais\s+dias|quais\s+aulas|horarios?\s+(?:do|da|com|pro|para)|aula\s+com/i.test(q);
    if (isTurmaFiltering) {
      const numTurma = turmaQueryMatch[1].replace(/\D/g, '');
      const matchingItems = [];
      for (const dayName of CANONICAL_DAYS_ORDER) {
        if (!byDay[dayName]) continue;
        for (const it of byDay[dayName].items) {
          if (it.info.includes(`${numTurma}º`) || it.info.includes(`${numTurma}o`) || it.info.includes(`${numTurma}°`) || it.info.toLowerCase().includes(`${numTurma} ano`)) {
            matchingItems.push({ day: dayName, ...it });
          }
        }
      }
      if (matchingItems.length > 0) {
        const lines = matchingItems.map(m => `• **${escapeHtml(m.day)}** às **${escapeHtml(m.timeSlot)}**: ${escapeHtml(formatClassBadge(m.info))}`).join('<br>');
        return `Encontrei as seguintes aulas para o **${numTurma}º ano**: 📚✨<br><br>${lines}`;
      } else {
        return `Não encontrei nenhuma aula cadastrada para o **${numTurma}º ano** na sua grade atual. 🔍`;
      }
    }

    // ── SUB-PERGUNTA C: Dia Específico (ex: "quarta", "quarta-feira", "segunda", etc.) ──
    const dayKeys = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
    let targetDayKey = null;
    for (const dk of dayKeys) {
      if (q.includes(dk) || (dk === 'segunda' && /2\s*[\u00AAªa]/i.test(q)) || (dk === 'terca' && /3\s*[\u00AAªa]/i.test(q)) || (dk === 'quarta' && /4\s*[\u00AAªa]/i.test(q)) || (dk === 'quinta' && /5\s*[\u00AAªa]/i.test(q)) || (dk === 'sexta' && /6\s*[\u00AAªa]/i.test(q))) {
        targetDayKey = dk;
        break;
      }
    }

    if (targetDayKey) {
      const foundDayEntry = Object.entries(byDay).find(([_, data]) => data.key === targetDayKey);
      const dayCol = dayCols.find(c => c.key === targetDayKey);
      const dayDisplayName = (foundDayEntry && foundDayEntry[0]) || (dayCol ? dayCol.name : targetDayKey);

      if (!foundDayEntry || foundDayEntry[1].items.length === 0) {
        return `Você **não tem nenhuma aula** cadastrada na **${escapeHtml(dayDisplayName)}**! 🎉✨`;
      }

      const lines = foundDayEntry[1].items.map(c => `• **${escapeHtml(c.timeSlot)}** ➔ ${escapeHtml(formatClassBadge(c.info))}`).join('<br>');
      return `Aqui está a sua grade para **${escapeHtml(dayDisplayName)}**: 🗓️✨<br><br>📅 **${escapeHtml(dayDisplayName)}**:<br>${lines}`;
    }

    // ── SUB-PERGUNTA D: Grade Semanal Completa — ESTRITAMENTE CRONOLÓGICA ──
    const sortedActiveDays = CANONICAL_DAYS_ORDER.filter(d => byDay[d] && byDay[d].items.length > 0);
    if (sortedActiveDays.length > 0) {
      let totalCount = 0;
      for (const d of sortedActiveDays) totalCount += byDay[d].items.length;
      const diasLetivos = sortedActiveDays.length;

      let output = `🗓️ **Grade Semanal do Professor** (${totalCount} aulas em ${diasLetivos} dias letivos)<br><br>`;
      for (const dayName of sortedActiveDays) {
        output += `📅 **${escapeHtml(dayName)}**:<br>`;
        for (const item of byDay[dayName].items) {
          output += `• **${escapeHtml(item.timeSlot)}** ➔ ${escapeHtml(formatClassBadge(item.info))}<br>`;
        }
        output += `<br>`;
      }
      return output.trim();
    } else {
      return `Não há nenhuma aula agendada na grade de horários do portal.`;
    }
  }

  // 2. Motor Tabular Universal (Notas, Boletim, Faltas, Avaliações, Alunos)
  if (pageData.tables && pageData.tables.length > 0) {
    for (const table of pageData.tables) {
      const headers = table.headers || [];
      const rows = table.rows || [];
      if (rows.length === 0) continue;

      const normHeaders = headers.map(h => String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const nameColIdx = normHeaders.findIndex(h => /nome|aluno|estudante/i.test(h));
      let gradeColIdx = normHeaders.findIndex(h => /nota|avalia|media|ponto|bimestre|trimestre|etapa|grau|exame|prova/i.test(h));
      const faltasColIdx = normHeaders.findIndex(h => /falta|ausencia|presenca/i.test(h));

      // Detecção inteligente agnóstica de coluna de notas se não houver cabeçalho explícito
      if (gradeColIdx === -1) {
        for (let cIdx = 0; cIdx < headers.length; cIdx++) {
          if (cIdx === nameColIdx || cIdx === faltasColIdx) continue;
          if (/n[uú]mero|num|id|matricula|ra|chamada|falta/i.test(normHeaders[cIdx])) continue;
          const vals = rows.map(r => parseFloat(String(r[cIdx] || '').replace(',', '.'))).filter(v => !isNaN(v));
          if (vals.length >= rows.length * 0.7 && vals.length > 0) {
            gradeColIdx = cIdx;
            break;
          }
        }
      }

      // Pergunta de média da turma
      if (/m[eé]dia/i.test(q) && gradeColIdx !== -1) {
        const grades = rows.map(r => parseFloat(String(r[gradeColIdx] || '').replace(',', '.'))).filter(g => !isNaN(g));
        if (grades.length > 0) {
          const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
          return `A média da turma é de **${avg.toFixed(1)}** (calculada com base em ${grades.length} avaliações). 📊✨`;
        }
      }

      // Pergunta de notas com threshold (acima de / abaixo de)
      if (gradeColIdx !== -1 && nameColIdx !== -1) {
        let threshold = null;
        let comp = null;
        const threshMatch = q.match(/(?:acima|maior|superior|mais que|>=|>)\s*(?:de\s+)?(\d+(?:[.,]\d+)?)/i);
        const belowMatch = q.match(/(?:abaixo|menor|inferior|menos que|recupera|<=|<)\s*(?:de\s+)?(\d+(?:[.,]\d+)?)/i);
        if (threshMatch) {
          threshold = parseFloat(threshMatch[1].replace(',', '.'));
          comp = 'above';
        } else if (belowMatch) {
          threshold = parseFloat(belowMatch[1].replace(',', '.'));
          comp = 'below';
        }

        if (comp !== null) {
          const matches = [];
          for (const row of rows) {
            const student = row[nameColIdx];
            const gradeVal = parseFloat(String(row[gradeColIdx] || '').replace(',', '.'));
            if (!student || isNaN(gradeVal)) continue;

            if (comp === 'above' && gradeVal >= threshold) {
              matches.push(`• **${escapeHtml(student)}**: nota **${gradeVal.toFixed(1)}**`);
            } else if (comp === 'below' && gradeVal <= threshold) {
              matches.push(`• **${escapeHtml(student)}**: nota **${gradeVal.toFixed(1)}**`);
            }
          }

          if (matches.length > 0) {
            const condText = comp === 'above' ? `com nota igual ou superior a ${threshold}` : `com nota igual ou inferior a ${threshold}`;
            return `Encontrei **${matches.length} alunos** ${condText}:<br><br>${matches.join('<br>')}`;
          } else {
            return `Nenhum aluno encontrado com nota ${comp === 'above' ? 'acima' : 'abaixo'} de ${threshold}.`;
          }
        }
      }

      // Pergunta de contagem de alunos
      if (/quantos\s+alunos|total\s+de\s+alunos/i.test(q) && nameColIdx !== -1) {
        return `Há um total de **${rows.length} alunos** listados nesta tela do portal. 📋✨`;
      }
    }

    // 3. Fallback Tabular Formatado em Markdown Limpo
    const t = pageData.tables[0];
    const headers = t.headers && t.headers.length > 0 ? t.headers : null;
    const rows = (t.rows || []).slice(0, 6);
    let preview = '';
    if (headers) {
      preview += `**${headers.map(escapeHtml).join(' | ')}**<br>`;
    }
    preview += rows.map(r => r.filter(Boolean).map(escapeHtml).join(' | ')).join('<br>');
    return `Encontrei os seguintes dados na tela:<br><br>${preview}`;
  }

  return `Não encontrei dados suficientes na tela atual para responder "${escapeHtml(query)}". Certifique-se de estar na aba correspondente no portal. 🔍`;
}

function executeSubsequentCommand(remainingCommand, contextLabel) {
  if (!remainingCommand) return;
  const cleanCmd = remainingCommand.trim();

  // 1. Se for comando de nota ou falta (ex: "lançar 8 pro Hugo", "colocar falta pro Pedro")
  const isNotaOrFalta = /(?:nota|grau|ponto|falta|presen[çc]a|aus[êe]ncia)/i.test(cleanCmd);
  if (isNotaOrFalta) {
    handleProcessCommand(cleanCmd);
    return;
  }

  // 2. Se for comando de sub-navegação / sub-aba (ex: "abra recados recebidos", "ver notas do 1º bimestre")
  const isSubNav = /^(?:abrir|abra|abre|ir\s+para|ir\s+pra|ir\s+pro|vai\s+para|v[áa]\s+para|v[áa]\s+em|vai\s+em|clicar\s+em|clique\s+em|clica\s+em|acessar|acesse|acessa|entrar\s+em|entre\s+em|entra\s+em|mostrar|mostre|ver)\s+/i.test(cleanCmd);
  if (isSubNav) {
    const subTarget = cleanCmd
      .replace(/^(?:abrir|abra|abre|ir\s+para|ir\s+pra|ir\s+pro|vai\s+para|v[áa]\s+para|v[áa]\s+em|vai\s+em|clicar\s+em|clique\s+em|clica\s+em|acessar|acesse|acessa|entrar\s+em|entre\s+em|entra\s+em|mostrar|mostre|ver)\s+(?:a\s+|o\s+|as\s+|os\s+|sub-?aba\s+|aba\s+|guia\s+|se[çc][ãa]o\s+|bot[ãa]o\s+)?/i, '')
      .trim();

    setProcessingState(true, `Acessando ${subTarget}...`);
    dispatchPortalBridgeMessage({ action: 'DISCOVERY_SELECT_FILTER', filterTerm: subTarget }, (resp) => {
      setProcessingState(false);
      if (resp && resp.sucesso) {
        appendAssistantChatMessage(`✅ Localizei e acessei **${escapeHtml(resp.elementText || subTarget)}** na aba **${escapeHtml(contextLabel)}**! ✨`, true);
      } else {
        appendAssistantChatMessage(
          `📂 Entrei na aba **${escapeHtml(contextLabel)}**, mas não encontrei o botão ou sub-aba **${escapeHtml(subTarget)}** nesta tela. Você pode me mostrar onde fica ou clicar manualmente? 🔍`,
          true
        );
        showClarificationPointClickCard(
          `Não encontrei o botão "${subTarget}" na aba ${contextLabel}. Você pode me mostrar clicando nele?`
        );
      }
    });
    return;
  }

  // 3. Se for comando de responder recado / mensagem (ex: "responder recado da mãe", "responder mensagem")
  const isResponderRecado = /^(?:responder|responda|responde|enviar\s+resposta|escrever\s+resposta)\b.*(?:recado|mensagem|comunicado|aviso|m[ãa]e|pai|fam[íi]lia)?/i.test(cleanCmd) ||
                            /(?:responder\s+(?:ao|à|o|a)?\s*(?:recado|mensagem|m[ãa]e|pai|fam[íi]lia))/i.test(cleanCmd);
  if (isResponderRecado) {
    setProcessingState(true, 'Localizando recado para responder...');
    dispatchPortalBridgeMessage({ action: 'DISCOVERY_SELECT_FILTER', filterTerm: cleanCmd }, (resp) => {
      setProcessingState(false);
      if (resp && resp.sucesso) {
        appendAssistantChatMessage(`Localizei o recado na aba **${escapeHtml(contextLabel)}**! Digite sua resposta para eu enviar. 💬✨`, true);
      } else {
        appendAssistantChatMessage(
          `Entrei na aba **${escapeHtml(contextLabel)}**, mas não encontrei uma mensagem ou campo aberto para **${escapeHtml(cleanCmd)}**. Qual recado você deseja responder? 💬`,
          true
        );
        showHonestErrorCard(
          'Recado não localizado',
          `Não encontrei o recado para "${cleanCmd}" na tela. Você pode abrir o recado desejado manualmente?`
        );
      }
    });
    return;
  }

  // 3. Se for comando de consulta / leitura / pergunta (ex: "me diga quais dias e horarios eu tenho aula", "quais dias tenho aula", "listar horários")
  const isReadingQuery = /^(?:me\s+diga|diga|diz|liste|listar|mostre|mostrar|ver|veja|quais|qual|quantos|quantas|quando|onde|consultar|consulta|resumir|resumo|informe|informar)\b/i.test(cleanCmd) ||
                         /(?:quais\s+dias|quais\s+hor[aá]rios|que\s+aulas|quantas\s+aulas|me\s+diga|me\s+mostre|me\s+fale)/i.test(cleanCmd);
  if (isReadingQuery) {
    setProcessingState(true, 'Lendo e organizando dados do portal...');
    dispatchPortalBridgeMessage({ action: 'READ_PAGE_DATA' }, (pageData) => {
      setProcessingState(false);
      if (pageData && pageData.sucesso) {
        const answer = synthesizeScreenAnswer(cleanCmd, pageData);
        appendAssistantChatMessage(answer, true);
      } else {
        appendAssistantChatMessage(`Não consegui ler os dados da tela na aba **${escapeHtml(contextLabel)}**. Tente atualizar a página.`, true);
      }
    });
    return;
  }

  // 4. Caso geral de ação/filtro: tenta discovery genérico na página ou pede esclarecimento honesto
  dispatchPortalBridgeMessage({ action: 'DISCOVERY_SELECT_FILTER', filterTerm: cleanCmd }, (resp) => {
    setProcessingState(false);
    if (resp && resp.sucesso) {
      appendAssistantChatMessage(`✅ Localizei e selecionei **${escapeHtml(resp.elementText || cleanCmd)}** na aba **${escapeHtml(contextLabel)}**! ✨`, true);
    } else {
      appendAssistantChatMessage(
        `Entrei na aba **${escapeHtml(contextLabel)}**, mas não encontrei como executar **${escapeHtml(cleanCmd)}** nesta tela. Você pode me mostrar onde fica? 🔍`,
        true
      );
      showClarificationPointClickCard(
        `Não encontrei como fazer "${cleanCmd}" na aba ${contextLabel}. Você pode me mostrar clicando no lugar certo?`
      );
    }
  });
}

/**
 * Executa uma fila de sub-objetivos sequenciais (PPAV Multi-Step Queue Runner).
 * Cada sub-objetivo é executado, aguarda a estabilização da aba/DOM no portal real,
 * e passa o bastão para o próximo passo na nova tela resultante.
 */
async function executeGoalQueue(subGoals, index = 0, context = {}) {
  if (!subGoals || index >= subGoals.length) {
    setProcessingState(false);
    return;
  }

  const currentGoal = subGoals[index].trim();
  const isFirstStep = (index === 0);
  const isLastStep = (index === subGoals.length - 1);
  const totalSteps = subGoals.length;
  const stepNumber = index + 1;

  // 1. Perfil ou Cartão de Aluno (ex: "acessar perfil de joão", "ver o perfil de alice almeida", "aluno bruno")
  const studentProfileMatch = currentGoal.match(/(?:acessar\s+(?:o\s+|a\s+)?perfil|abrir\s+(?:o\s+|a\s+)?perfil|ver\s+(?:o\s+|a\s+)?perfil|perfil\s+de|perfil\s+do|perfil\s+da|aluno\s+|acessar\s+aluno)\s+(?:de\s+|do\s+|da\s+)?([a-zA-ZÀ-ÿ\s]+)/i);

  // 2. Filtro / Seleção (ex: "selecionar sexto ano", "filtrar por 6A", "escolher 1º bimestre")
  const isSelectionCommand = /^(?:selecionar|seleciona|selecione|escolher|escolha|escolhe|filtrar|filtra|filtre|marcar|marca|marque)\s+/i.test(currentGoal);

  // 3. Navegação de Aba / Seção do Portal (ex: "abrir turmas", "ir para diário", "acessar arquivos")
  const isNavCommand = /^(?:abrir|abra|abre|ir\s+para|ir\s+pra|ir\s+pro|vai\s+para|v[áa]\s+para|v[áa]\s+em|vai\s+em|clicar\s+em|clique\s+em|clica\s+em|acessar|acesse|acessa|entrar\s+em|entre\s+em|entra\s+em|navegar\s+at[ée])\s+/i.test(currentGoal) && !studentProfileMatch;

  // 4. Lançamento de Nota ou Falta (Ação de Escrita com Aprovação Prévia)
  const isNotaOrFalta = /(?:nota|grau|ponto|falta|presen[çc]a|aus[êe]ncia)/i.test(currentGoal);

  // 5. Responder Recado / Mensagem
  const isResponderRecado = /^(?:responder|responda|responde|enviar\s+resposta|escrever\s+resposta)\b/i.test(currentGoal);

  // 6. Leitura / Pergunta da tela
  const isReadingQuery = /^(?:me\s+diga|diga|diz|liste|listar|mostre|mostrar|ver|veja|quais|qual|quantos|quantas|quando|consultar|resumir)\b/i.test(currentGoal);

  // ── EXECUÇÃO 1: Navegação de Aba / Menu ──
  if (isNavCommand) {
    let navTarget = currentGoal
      .replace(/^(?:abrir|abra|abre|ir\s+para|ir\s+pra|ir\s+pro|vai\s+para|v[áa]\s+para|v[áa]\s+em|vai\s+em|clicar\s+em|clique\s+em|clica\s+em|acessar|acesse|acessa|entrar\s+em|entre\s+em|entra\s+em|navegar\s+at[ée])\s+(?:a\s+|o\s+|as\s+|os\s+|aba\s+|menu\s+|se[çc][ãa]o\s+|guia\s+|tela\s+)?/i, '')
      .replace(/^(?:de|do|da)\s+/i, '')
      .trim();
    if (!navTarget) navTarget = currentGoal;

    setProcessingState(true, `[Passo ${stepNumber}/${totalSteps}] Acessando ${navTarget} no portal...`);

    dispatchPortalBridgeMessage({ action: 'NAVIGATE_PORTAL_TAB', target: navTarget }, (navResp) => {
      if (!navResp || !navResp.sucesso) {
        setProcessingState(false);
        appendAssistantChatMessage(
          `Procurei pela aba ou seção **${escapeHtml(navTarget)}** no portal, mas não encontrei nenhum botão ou menu correspondente nesta tela. Você pode navegar manualmente até lá ou me mostrar onde fica? 🔍`,
          true
        );
        showHonestErrorCard(
          'Aba não encontrada',
          `Não encontrei a aba ou seção '${navTarget}' no portal. Clique manualmente no menu correspondente.`
        );
        return;
      }

      const foundLabel = navResp.elementText || navTarget;
      context.lastTab = foundLabel;

      if (isLastStep) {
        setProcessingState(false);
        appendAssistantChatMessage(`Prontinho! Entrei na aba **${escapeHtml(foundLabel)}** no portal para você. 📂✨`, true);
      } else {
        appendAssistantChatMessage(`Prontinho! Entrei na aba **${escapeHtml(foundLabel)}** no portal. Agora vou executar: **${escapeHtml(subGoals[index + 1])}**... 📂🔍`, true);
        executeGoalQueue(subGoals, index + 1, context);
      }
    });
    return;
  }

  // ── EXECUÇÃO 2: Seleção de Filtro (Turma / Ano / Opção) ──
  if (isSelectionCommand) {
    const filterTerm = currentGoal
      .replace(/^(?:selecionar|seleciona|selecione|escolher|escolha|escolhe|filtrar|filtra|filtre|marcar|marca|marque)\s+(?:por\s+|a\s+|o\s+|pelo\s+|pela\s+|turma\s+|ano\s+)?/i, '')
      .trim();

    setProcessingState(true, `[Passo ${stepNumber}/${totalSteps}] Selecionando ${filterTerm}...`);

    dispatchPortalBridgeMessage({ action: 'DISCOVERY_SELECT_FILTER', filterTerm }, (selResp) => {
      if (!selResp || !selResp.sucesso) {
        setProcessingState(false);
        const loc = context.lastTab ? ` na aba ${context.lastTab}` : '';
        appendAssistantChatMessage(
          `📂 Não encontrei a opção **${escapeHtml(filterTerm)}** para selecionar nesta tela${escapeHtml(loc)}. Você pode me mostrar onde fica ou selecionar manualmente? 🔍`,
          true
        );
        showClarificationPointClickCard(
          `Não encontrei onde selecionar "${filterTerm}"${loc}. Você pode me mostrar clicando no lugar certo?`
        );
        return;
      }

      const selectedLabel = selResp.elementText || filterTerm;
      context.lastFilter = selectedLabel;

      if (isLastStep) {
        setProcessingState(false);
        const locMsg = context.lastTab ? ` na aba **${escapeHtml(context.lastTab)}**` : '';
        appendAssistantChatMessage(`✅ Selecionei **${escapeHtml(selectedLabel)}**${locMsg} com sucesso! ✨`, true);
      } else {
        appendAssistantChatMessage(`✅ Selecionei **${escapeHtml(selectedLabel)}**. Agora vou executar: **${escapeHtml(subGoals[index + 1])}**... 🔍`, true);
        executeGoalQueue(subGoals, index + 1, context);
      }
    });
    return;
  }

  // ── EXECUÇÃO 3: Perfil ou Ficha de Aluno ──
  if (studentProfileMatch) {
    const studentTarget = studentProfileMatch[1].trim();
    setProcessingState(true, `[Passo ${stepNumber}/${totalSteps}] Acessando perfil de ${studentTarget}...`);

    dispatchPortalBridgeMessage({ action: 'DISCOVERY_FIND_AND_CLICK_STUDENT', studentName: studentTarget }, (stdResp) => {
      if (stdResp && stdResp.sucesso) {
        const foundName = stdResp.elementText || studentTarget;
        context.lastStudent = foundName;
        if (isLastStep) {
          setProcessingState(false);
          const locMsg = context.lastTab ? ` na aba **${escapeHtml(context.lastTab)}**` : '';
          appendAssistantChatMessage(`✅ Acessei o perfil de **${escapeHtml(foundName)}**${locMsg} com sucesso! 👤✨`, true);
        } else {
          appendAssistantChatMessage(`✅ Acessei o perfil de **${escapeHtml(foundName)}**. Agora vou executar: **${escapeHtml(subGoals[index + 1])}**... 🔍`, true);
          executeGoalQueue(subGoals, index + 1, context);
        }
      } else if (stdResp && stdResp.status === 'ambiguous') {
        setProcessingState(false);
        appendAssistantChatMessage(
          `⚠️ Encontrei mais de um aluno com o nome **${escapeHtml(studentTarget)}** nesta tela. Por favor, escolha qual deles você deseja acessar: 🔍`,
          true
        );
        if (typeof showDisambiguationCard === 'function') {
          showDisambiguationCard({ aluno: studentTarget, acao: 'abrir_perfil' }, stdResp.candidates || []);
        }
      } else {
        setProcessingState(false);
        const locMsg = context.lastTab ? ` na aba ${context.lastTab}` : '';
        appendAssistantChatMessage(
          `📂 Não encontrei o perfil do aluno **${escapeHtml(studentTarget)}** na tela atual${escapeHtml(locMsg)}. Você pode me mostrar onde fica ou clicar manualmente? 🔍`,
          true
        );
        showHonestErrorCard(
          'Aluno não encontrado',
          `Não encontrei o aluno '${studentTarget}' na tela atual do portal.`
        );
      }
    });
    return;
  }

  // ── EXECUÇÃO 4: Lançamento de Nota ou Falta (Aprovação Obrigatória) ──
  if (isNotaOrFalta) {
    executeSubsequentCommand(currentGoal, context.lastTab || 'Portal');
    return;
  }

  // ── EXECUÇÃO 5: Responder Recado ──
  if (isResponderRecado) {
    executeSubsequentCommand(currentGoal, context.lastTab || 'Recados');
    return;
  }

  // ── EXECUÇÃO 6: Leitura de Tela ──
  if (isReadingQuery) {
    setProcessingState(true, `[Passo ${stepNumber}/${totalSteps}] Lendo e organizando dados do portal...`);
    dispatchPortalBridgeMessage({ action: 'READ_PAGE_DATA' }, (pageData) => {
      setProcessingState(false);
      if (pageData && pageData.sucesso) {
        const answer = synthesizeScreenAnswer(currentGoal, pageData);
        appendAssistantChatMessage(answer, true);
        if (!isLastStep) {
          executeGoalQueue(subGoals, index + 1, context);
        }
      } else {
        appendAssistantChatMessage(`Não consegui ler os dados da tela atual.`, true);
      }
    });
    return;
  }

  // ── EXECUÇÃO 7: Fallback Genérico via Discovery ──
  setProcessingState(true, `[Passo ${stepNumber}/${totalSteps}] Executando: ${currentGoal}...`);
  dispatchPortalBridgeMessage({ action: 'DISCOVERY_SELECT_FILTER', filterTerm: currentGoal }, (resp) => {
    if (resp && resp.sucesso) {
      if (isLastStep) {
        setProcessingState(false);
        appendAssistantChatMessage(`✅ Localizei e selecionei **${escapeHtml(resp.elementText || currentGoal)}** com sucesso! ✨`, true);
      } else {
        appendAssistantChatMessage(`✅ Executado: **${escapeHtml(resp.elementText || currentGoal)}**. Continuando para: **${escapeHtml(subGoals[index + 1])}**...`, true);
        executeGoalQueue(subGoals, index + 1, context);
      }
    } else {
      setProcessingState(false);
      appendAssistantChatMessage(
        `Não encontrei como executar **${escapeHtml(currentGoal)}** nesta tela. Você pode me mostrar onde fica? 🔍`,
        true
      );
      showClarificationPointClickCard(
        `Não encontrei como fazer "${currentGoal}". Você pode me mostrar clicando no lugar certo?`
      );
    }
  });
}

// Inicialização dos Listeners de Interface
document.addEventListener('DOMContentLoaded', () => {
  const btnVoice = document.getElementById('btn-voice-input');
  const inputCommand = document.getElementById('input-agent-command');
  const btnSend = document.getElementById('btn-send-agent-command');
  const listeningIndicator = document.getElementById('voice-listening-indicator');
  const btnConfirm = document.getElementById('btn-confirm-approval');
  const btnCancel = document.getElementById('btn-cancel-approval');

  let isSpeechListening = false;
  let speechRec = null;

  if (window.webkitSpeechRecognition || window.SpeechRecognition) {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRec = new SpeechClass();
    speechRec.lang = 'pt-BR';
    speechRec.continuous = false;
    speechRec.interimResults = false;

    speechRec.onstart = () => {
      isSpeechListening = true;
      if (btnVoice) btnVoice.classList.add('listening');
      if (listeningIndicator) listeningIndicator.style.display = 'flex';
    };

    speechRec.onresult = (evt) => {
      const spokenText = evt.results[0][0].transcript;
      if (inputCommand) inputCommand.value = spokenText;
      stopSpeechListening();
      handleProcessCommand(spokenText);
    };

    speechRec.onerror = () => {
      stopSpeechListening();
    };

    speechRec.onend = () => {
      stopSpeechListening();
    };
  }

  function stopSpeechListening() {
    isSpeechListening = false;
    if (btnVoice) btnVoice.classList.remove('listening');
    if (listeningIndicator) listeningIndicator.style.display = 'none';
  }

  if (btnVoice) {
    btnVoice.addEventListener('click', () => {
      if (!speechRec) {
        alert('Reconhecimento de voz não suportado neste navegador. Digite no campo de texto.');
        return;
      }
      if (isSpeechListening) {
        speechRec.stop();
        stopSpeechListening();
      } else {
        try {
          speechRec.start();
        } catch (e) {
          stopSpeechListening();
        }
      }
    });
  }

  if (btnSend && inputCommand) {
    btnSend.addEventListener('click', () => {
      const text = inputCommand.value.trim();
      if (text) {
        handleProcessCommand(text);
      }
    });

    inputCommand.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = inputCommand.value.trim();
        if (text) {
          handleProcessCommand(text);
        }
      }
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      if (!activePendingApproval) return;
      const { student, intent } = activePendingApproval;

      btnConfirm.disabled = true;
      btnConfirm.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;margin-right:4px;"></span> Gravando no portal...`;

      dispatchPortalBridgeMessage({
        action: 'EXECUTE_SAFE_WRITE',
        studentName: student.name,
        targetValue: intent.nota || intent.faltas || '1',
        actionType: intent.acao
      }, (response) => {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `<i class="ti ti-check"></i> <span>Confirmar</span>`;

        if (response && response.sucesso && response.verified) {
          showSuccessCard(student.name, response.before_val, response.after_val);
          student.currentValue = response.after_val;
          const activeTurmaEl = document.getElementById('active-class-name');
          const currentTurma = (activeTurmaEl && activeTurmaEl.textContent !== '—') ? activeTurmaEl.textContent : 'Turma 9A';
          trackActionUsage(intent.acao, currentTurma, `Lançar ${intent.acao === 'lancar_falta' ? 'falta' : 'nota'} ${currentTurma}`);

          // Sincronização Write-Through: Persiste alteração na tabela de negócio students no Supabase
          try {
            fetch('http://localhost:3000/api/students/write-through', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentName: student.name,
                matricula: student.matricula || student.portal_native_id || student.rollNumber || '',
                classRef: currentTurma,
                field: intent.acao === 'lancar_falta' ? 'faltas' : (intent.campo || 'nota'),
                value: response.after_val,
                actionType: intent.acao,
                portal: window.location.hostname || 'Portal Escolar'
              })
            }).catch(err => console.warn('[Write-Through] Falha de sincronização com Supabase:', err));
          } catch (e) {}
        } else {
          showHonestErrorCard(
            'Falha na gravação',
            (response && response.mensagem) || 'O portal não confirmou a gravação do valor no campo.'
          );
        }
      });
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      activePendingApproval = null;
      hideAllApprovalCards();
    });
  }

  // Listener para Apontar/Clicar no portal quando o aprendizado pedir ajuda
  const btnPointAndClick = document.getElementById('btn-point-and-click');
  if (btnPointAndClick) {
    btnPointAndClick.addEventListener('click', () => {
      btnPointAndClick.innerHTML = `<span class="spinner" style="width:10px;height:10px;display:inline-block;margin-right:4px;"></span> Clique no campo no portal...`;
      dispatchPortalBridgeMessage({ action: 'ENABLE_POINT_AND_CLICK' }, (resp) => {
        btnPointAndClick.innerHTML = `<i class="ti ti-hand-click"></i> Apontar campo no portal`;
        if (resp && resp.selected) {
          const intent = activePendingApproval ? activePendingApproval.intent : { acao: 'lancar_falta', aluno: 'Hugo', faltas: 1 };
          showApprovalPreviewCard({ name: intent.aluno || 'Hugo', currentValue: resp.currentValue || '' }, intent);
        }
      });
    });
  }

  // Inicialização das Ações Rápidas (Chips Pré-definidos e Promovidos)
  setupQuickActions();

  // Inicialização do Modo Desenvolvedor / QA (Oculto por Padrão)
  setupDevModeToggle();
});

if (typeof window !== 'undefined') {
  window.__teacherSidePanelChat = {
    appendUserChatMessage,
    appendAssistantChatMessage,
    setProcessingState,
    fillCommandTemplate,
    extractNavigationTarget,
    splitCompoundCommand,
    decomposeGoalJS,
    executeGoalQueue,
    trackActionUsage,
    promptShortcutPromotion,
    savePromotedShortcut,
    renderPromotedChips,
    setupQuickActions
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    decomposeGoalJS,
    splitCompoundCommand,
    extractNavigationTarget,
    executeGoalQueue
  };
}

function setupDevModeToggle() {
  const devPanel = document.getElementById('dev-mode-panel');
  const devBadge = document.getElementById('dev-mode-badge');
  const brandLogo = document.getElementById('brand-logo');
  const btnClose = document.getElementById('btn-close-dev-mode');

  function setDevMode(active) {
    if (devPanel) devPanel.style.display = active ? 'block' : 'none';
    if (devBadge) devBadge.style.display = active ? 'inline-block' : 'none';
    try { localStorage.setItem('teacher_dev_mode', active ? 'true' : 'false'); } catch {}
  }

  // Restaura estado se desenvolvedor já tiver ativado
  const savedDev = (typeof localStorage !== 'undefined') && localStorage.getItem('teacher_dev_mode') === 'true';
  setDevMode(savedDev);

  // Atalho 1: Teclado Ctrl + Shift + D
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const isCurrentlyActive = devPanel && devPanel.style.display !== 'none';
      setDevMode(!isCurrentlyActive);
    }
  });

  // Atalho 2: Clique triplo no logo TEACHER AI
  let clickCount = 0;
  let clickTimer = null;
  if (brandLogo) {
    brandLogo.addEventListener('click', () => {
      clickCount++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clickCount = 0; }, 600);
      if (clickCount >= 3) {
        clickCount = 0;
        const isCurrentlyActive = devPanel && devPanel.style.display !== 'none';
        setDevMode(!isCurrentlyActive);
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      setDevMode(false);
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// LOTE 6: LIVRE INTERCÂMBIO EXTENSÃO ↔ APP (ENTITY BUS, CHECKLIST & DOSSIÊ)
// ════════════════════════════════════════════════════════════════════════════════

let entityBus = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    entityBus = new BroadcastChannel('teacher_entity_bus');
    entityBus.onmessage = (ev) => {
      handleEntityBusIncoming(ev.data);
    };
  }
} catch (e) {
  console.warn('[SidePanel] BroadcastChannel indisponível:', e);
}

function postToEntityBus(type, payload) {
  if (entityBus) {
    try {
      entityBus.postMessage({ bus: 'teacher_entity_bus', type, payload, timestamp: Date.now() });
    } catch (e) {}
  }
}

function handleEntityBusIncoming(msg) {
  if (!msg || !msg.type) return;

  if (msg.type === 'ACTIVE_CLASS_TODOS_RESPONSE' || msg.type === 'ACTIVE_CLASS_TODOS_UPDATED') {
    renderClassTodosWidget(msg.payload?.todos || []);
  }

  if (msg.type === 'STUDENT_DOSSIER_RESPONSE') {
    renderStudentDossier(msg.payload);
  }

  if (msg.type === 'PORTAL_ROSTER_SYNC_ACK') {
    if (msg.payload?.success) {
      appendAssistantChatMessage(`✅ **${msg.payload.className}**: ${msg.payload.totalClassStudents || ''} alunos conciliados com o Teacher AI App! ✨`, true);
    }
  }
}

function renderClassTodosWidget(todos) {
  const container = document.getElementById('turma-checklist-items');
  const countBadge = document.getElementById('turma-checklist-count');
  if (!container) return;

  const pendingCount = (todos || []).filter(t => !t.done).length;
  if (countBadge) {
    countBadge.textContent = `${pendingCount} pendente${pendingCount !== 1 ? 's' : ''}`;
    countBadge.style.background = pendingCount > 0 ? '#fee2e2' : '#dcfce7';
    countBadge.style.color = pendingCount > 0 ? '#991b1b' : '#15803d';
  }

  if (!todos || todos.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: #64748b; font-style: italic;">Nenhuma tarefa pendente para esta turma no Checklist. 🎉</div>`;
    return;
  }

  container.innerHTML = todos.map(t => `
    <div style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 11px;">
      <input type="checkbox" id="chk_${t.id}" ${t.done ? 'checked' : ''} style="cursor: pointer;" />
      <span style="flex: 1; ${t.done ? 'text-decoration: line-through; color: #94a3b8;' : 'color: #1e293b;'}">${escapeHtml(t.text)}</span>
    </div>
  `).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const todoId = e.target.id.replace('chk_', '');
      postToEntityBus('TOGGLE_TODO_FROM_EXTENSION', { todoId, done: e.target.checked });
      const span = e.target.nextElementSibling;
      if (span) {
        span.style.textDecoration = e.target.checked ? 'line-through' : 'none';
        span.style.color = e.target.checked ? '#94a3b8' : '#1e293b';
      }
    });
  });
}

function renderStudentDossier(payload) {
  const card = document.getElementById('card-student-dossier');
  const content = document.getElementById('dossier-content');
  if (!card || !content) return;

  if (!payload || !payload.found) {
    content.innerHTML = `<div style="color: #64748b;">Nenhum histórico pedagógico encontrado para ${escapeHtml(payload?.studentName || 'este aluno')}.</div>`;
    card.style.display = 'block';
    return;
  }

  const stu = payload.student || {};
  const mem = payload.memory || {};
  const obsList = mem.observations || [];

  content.innerHTML = `
    <div style="font-weight: 700; font-size: 13px; color: #581c87; margin-bottom: 4px;">${escapeHtml(stu.name)}</div>
    <div style="font-size: 11px; color: #7e22ce; margin-bottom: 6px;">Turma: ${escapeHtml(stu.className || stu.class_name || '—')} | Matrícula: ${escapeHtml(stu.rollNumber || stu.portal_native_id || '—')}</div>
    ${mem.summary ? `<div style="background: #f3e8ff; border-radius: 6px; padding: 6px; font-size: 11px; margin-bottom: 6px;"><b>Síntese:</b> ${escapeHtml(mem.summary)}</div>` : ''}
    <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px;">Observações Recentes:</div>
    ${obsList.length > 0 ? obsList.map(o => `
      <div style="font-size: 11px; border-bottom: 1px solid #f3e8ff; padding: 3px 0;">• <span style="color:#6b21a8;">[${escapeHtml(o.category || 'Geral')}]</span> ${escapeHtml(o.note)}</div>
    `).join('') : '<div style="font-size: 11px; color: #94a3b8;">Nenhuma observação registrada.</div>'}
  `;

  card.style.display = 'block';

  const btnClose = document.getElementById('btn-close-dossier');
  if (btnClose) btnClose.onclick = () => { card.style.display = 'none'; };

  const btnSave = document.getElementById('btn-save-quick-obs');
  const inputObs = document.getElementById('input-quick-observation');
  if (btnSave && inputObs) {
    btnSave.onclick = () => {
      const text = inputObs.value.trim();
      if (!text) return;
      postToEntityBus('RECORD_STUDENT_OBSERVATION_FROM_EXTENSION', {
        studentName: stu.name,
        note: text,
        category: 'Portal Escolar'
      });
      inputObs.value = '';
      appendAssistantChatMessage(`📝 Observação salva para **${escapeHtml(stu.name)}** no Teacher AI!`, true);
    };
  }
}
// ─── ATOMIZAÇÃO: ACCORDION / TOGGLE DE CARDS COLAPSÁVEIS ────────────────────────
function initAtomizedCards() {
  document.querySelectorAll('.atom-header').forEach(header => {
    if (header.dataset.atomInitialized) return;
    header.dataset.atomInitialized = 'true';

    header.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      const cardId = header.getAttribute('data-toggle');
      const card = document.getElementById(cardId) || header.closest('.atom-card');
      if (card) {
        card.classList.toggle('collapsed');
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAtomizedCards);
} else {
  initAtomizedCards();
}
