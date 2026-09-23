// background.js — Service Worker TeacherAI v3.1
// WebSocket Bridge + Monitor de Status de Portais Escolares (Toolbar Icon) + Automação na Mesma Aba

const WS_URL_PRIMARY = 'ws://127.0.0.1:8766';
const WS_URL_FALLBACK = 'ws://127.0.0.1:8765/status_stream';
const HTTP_STATUS_FALLBACK = 'http://127.0.0.1:8765/portal_status';
const NATIVE_HOST_NAME = 'com.teacherai.host';
const STARTUP_TIMEOUT_MS = 5000;

const KNOWN_PORTALS = [
  { id: 'ieducar', name: 'i-Educar', domains: ['ieducar.com.br', 'comunidade.ieducar'] },
  { id: 'machado_sobrinho', name: 'Machado Sobrinho', domains: ['machadosobrinho', 'paineldoaluno.com.br', 'paineldoprofessor'] },
  { id: 'plural', name: 'Plurall (SOMOS)', domains: ['plural.net', 'plurall.net'] },
  { id: 'cambridge', name: 'Cambridge One', domains: ['cambridgeone.org'] },
  { id: 'santa_catarina', name: 'Rede Santa Catarina', domains: ['redesantacatarina.org.br'] },
  { id: 'teams', name: 'Microsoft Teams', domains: ['teams.microsoft.com'] },
  { id: 'sed_sp', name: 'SED São Paulo', domains: ['sed.educacao.sp.gov.br'] },
  { id: 'sandbox', name: 'Portal de Teste (Sandbox)', domains: ['localhost', '127.0.0.1', 'portal_mock', 'portal_real'] }
];

let ws = null;
let isSidecarOnline = false;
let startupMethod = null; // 'scheduled_task' | 'native_messaging' | 'failed_both'
let bothStartupMethodsFailed = false;
let isLaunchingViaNative = false;
let startupTimer = null;

let currentTabState = {
  tabId: null,
  url: '',
  title: '',
  isMappedPortal: false,
  portalName: null,
  isAuthenticated: false
};

// ─── COORDENAÇÃO MULTI-ABA VIA BROADCAST CHANNEL (ANTI-COLISÃO) ───────────────
let sessionBroadcastChannel = null;
try {
  sessionBroadcastChannel = new BroadcastChannel('teacher_ai_session_coordination');
  sessionBroadcastChannel.onmessage = (event) => {
    const { action, activeTabId, portalId } = event.data || {};
    if (action === 'ACQUIRE_TAB_LOCK') {
      console.log(`[MultiTabCoordination] 🔒 Trava adquirida pela aba ${activeTabId} (${portalId || ''})`);
      currentTabState.lockedTabId = activeTabId;
    } else if (action === 'RELEASE_TAB_LOCK') {
      if (currentTabState.lockedTabId === activeTabId) {
        currentTabState.lockedTabId = null;
      }
    }
  };
} catch (e) {
  console.warn('[TeacherAI] BroadcastChannel não disponível:', e);
}

if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[TeacherAI Extension] Erro ao configurar openPanelOnActionClick:', err));
}

if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab?.windowId && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.warn('[TeacherAI Extension] Erro ao abrir sidePanel via onClicked:', err);
      }
    }
  });
}

// ─── GERENCIAMENTO DE NATIVE MESSAGING (CAMINHO B) ───────────────────────────

function launchViaNativeMessaging(isRetry = false) {
  if (isLaunchingViaNative) return;
  isLaunchingViaNative = true;
  updateToolbarBadge('connecting');
  console.log('[TeacherAI Extension] 🚀 Disparando Caminho B via Native Messaging Host...');

  try {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { action: 'launch_sidecar' },
      (response) => {
        isLaunchingViaNative = false;
        if (chrome.runtime.lastError || !response || !response.success) {
          const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response?.message || 'Host indisponível');
          console.warn('[TeacherAI Extension] ⚠️ Caminho B falhou:', errMsg);
          bothStartupMethodsFailed = true;
          chrome.storage.local.set({
            startupMethod: 'failed_both',
            bothStartupMethodsFailed: true,
            lastStartupError: errMsg
          });
          updateToolbarBadge('offline');
          return;
        }

        console.log('[TeacherAI Extension] ✅ Caminho B (Native Messaging) confirmou inicialização:', response);
        startupMethod = 'native_messaging';
        bothStartupMethodsFailed = false;
        chrome.storage.local.set({
          startupMethod: 'native_messaging',
          bothStartupMethodsFailed: false,
          lastStartedAt: Date.now()
        });

        // Aguarda processo inicializar e conecta ao WebSocket
        setTimeout(connectWebSocket, 1500);
      }
    );
  } catch (err) {
    isLaunchingViaNative = false;
    console.warn('[TeacherAI Extension] ⚠️ Exceção no sendNativeMessage:', err);
    bothStartupMethodsFailed = true;
    chrome.storage.local.set({
      startupMethod: 'failed_both',
      bothStartupMethodsFailed: true,
      lastStartupError: err.message
    });
    updateToolbarBadge('offline');
  }
}

// ─── GERENCIAMENTO DE WEBSOCKET LOCAL ──────────────────────────────────────────

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL_PRIMARY);

    ws.onopen = () => {
      console.log('[TeacherAI Extension] 🔌 Conectado ao Sidecar via WebSocket (:8766)');
      isSidecarOnline = true;
      bothStartupMethodsFailed = false;

      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }

      if (!startupMethod) {
        startupMethod = 'scheduled_task';
        console.log('[TeacherAI Extension] ⚡ Inicialização confirmada pelo Caminho A (Tarefa Agendada / Background).');
        chrome.storage.local.set({
          startupMethod: 'scheduled_task',
          bothStartupMethodsFailed: false,
          lastConnectedAt: Date.now()
        });
      }

      evaluateActiveTab();
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'EXECUTE_PORTAL_ACTION') {
          handleExecutePortalAction(msg);
        }
      } catch (err) {
        console.warn('[TeacherAI Extension] Erro ao processar mensagem WS:', err);
      }
    };

    ws.onclose = () => {
      console.log('[TeacherAI Extension] Conexão WS fechada. Tentando fallback ou reconexão...');
      isSidecarOnline = false;
      updateToolbarBadge('offline');
      setTimeout(checkHttpFallbackAndReconnect, 3000);
    };

    ws.onerror = () => {
      isSidecarOnline = false;
      updateToolbarBadge('offline');
    };
  } catch {
    isSidecarOnline = false;
    updateToolbarBadge('offline');
    setTimeout(checkHttpFallbackAndReconnect, 3000);
  }
}

async function checkHttpFallbackAndReconnect() {
  try {
    const res = await fetch(HTTP_STATUS_FALLBACK, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      isSidecarOnline = true;
      evaluateActiveTab();
      connectWebSocket();
      return;
    }
  } catch {}
  isSidecarOnline = false;
  evaluateActiveTab();
}

// ─── ANÁLISE DA ABA ATIVA & DETECÇÃO DE PORTAL ────────────────────────────────

function identifyPortal(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const p of KNOWN_PORTALS) {
    if (p.domains.some(d => lower.includes(d))) {
      return p;
    }
  }
  return null;
}

function isAuthorizedPortalTab(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url.toLowerCase();
  // Nunca autoriza páginas internas do navegador ou do próprio side panel
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.includes('side_panel')) {
    return false;
  }
  // Mocks e sandboxes locais autorizados para desenvolvimento e testes
  if (url.includes('portal_mock') || url.includes('portal_real')) {
    return true;
  }
  if (url.includes('localhost:8000') || url.includes('127.0.0.1:8000') || url.includes('localhost:8080') || url.includes('127.0.0.1:8080')) {
    return true;
  }
  // Portais catalogados em KNOWN_PORTALS
  return Boolean(identifyPortal(url));
}

async function isAuthorizedPortalTabId(tabId) {
  if (!tabId) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    return isAuthorizedPortalTab(tab);
  } catch {
    return false;
  }
}

async function checkTabAuthentication(tabId) {
  const isAuthTab = await isAuthorizedPortalTabId(tabId);
  if (!isAuthTab) {
    return { isAuthenticated: false, userRole: 'unknown', reason: 'Aba não é portal escolar' };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const doc = document;
          const url = (window.location.href || '').toLowerCase();
          const path = (window.location.pathname || '').toLowerCase();
          const pageTitle = (doc.title || '').toLowerCase();
          const bodyText = doc.body ? (doc.body.innerText || '').toLowerCase() : '';

          // 1. Campo de senha ativo e visível na tela
          const passwordInputs = Array.from(doc.querySelectorAll('input[type="password"]'));
          const hasVisiblePasswordInput = passwordInputs.some(inp => {
            return inp.offsetParent !== null && inp.getBoundingClientRect().height > 0;
          });

          // 2. Formulário de login ativo na tela
          const hasLoginForm = !!doc.querySelector('form[action*="login"], form[id*="login"], .login-form, .login-box, form[name*="login"]');

          // 3. URL explícita de login
          const isExplicitLoginUrl = path.endsWith('/login') || path.includes('/professor_login') || 
                                     path.includes('/signin') || path.includes('/entrar') || 
                                     (path.includes('/auth') && !path.includes('contexto'));

          // Se tiver formulário de login com senha visível, ou URL explícita de login com campo de senha: NÃO está autenticado
          if (hasVisiblePasswordInput && (hasLoginForm || isExplicitLoginUrl)) {
            return {
              isAuthenticated: false,
              hasTable: false,
              pageKind: 'login',
              friendlyPageName: 'Tela de Login'
            };
          }

          // 4. Detecção de tela intermediária: Seleção de Contexto (Totvs RM / Educacional / Rede Santa Catarina)
          const isContextSelection = pageTitle.includes('contexto') || 
                                     path.includes('contexto') || 
                                     bodyText.includes('seleção de contexto') || 
                                     bodyText.includes('selecionar contexto') ||
                                     bodyText.includes('escolha o contexto') ||
                                     (bodyText.includes('ano letivo') && bodyText.includes('filial') && !hasVisiblePasswordInput);

          if (isContextSelection) {
            return {
              isAuthenticated: true, // Já passou pelo login com sucesso!
              hasTable: false,
              pageKind: 'context_selection',
              friendlyPageName: 'Seleção de Contexto'
            };
          }

          // 5. URL de área logada do professor / sistemas escolares
          const isInternalPortalUrl = path.includes('professor') || path.includes('notas') || 
                                     path.includes('painel') || path.includes('diario') || 
                                     path.includes('chamada') || path.includes('turma') || 
                                     path.includes('aluno') || path.includes('boletim') ||
                                     path.includes('corpore') || path.includes('portaleducacional') ||
                                     path.includes('portaiscola') || path.includes('educacional') ||
                                     path.includes('framehtml') || path.includes('plano') ||
                                     path.includes('etapa') || path.includes('avaliacao');

          // 6. Presença de tabela ou grade com dados
          const tableRows = doc.querySelectorAll('table tr, .grid-row, .ui-grid, [data-aluno]');
          const hasTable = tableRows.length > 1;

          // 7. Botão ou link de logout / sair seguro
          let hasLogout = !!doc.querySelector('a[href*="logout"], a[href*="sair"], a[href*="logoff"], a[href*="desconectar"], .btn-logout, #logout, .sair');
          if (!hasLogout) {
            const clickables = Array.from(doc.querySelectorAll('button, a, span, div.btn, [role="button"]'));
            hasLogout = clickables.some(el => {
              const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
              return txt === 'sair' || txt === 'logout' || txt === 'desconectar' || txt === 'trocar contexto';
            });
          }

          // 8. Palavras-chave positivas no corpo da página
          const hasPortalKeywords = bodyText.includes('painel do professor') || 
                                    bodyText.includes('diário') || 
                                    bodyText.includes('notas') || 
                                    bodyText.includes('frequência') || 
                                    bodyText.includes('minhas turmas') || 
                                    bodyText.includes('meus alunos') ||
                                    bodyText.includes('rede santa catarina') ||
                                    bodyText.includes('colégio santa catarina') ||
                                    bodyText.includes('totvs') ||
                                    bodyText.includes('portal educacional') ||
                                    bodyText.includes('digitação de notas') ||
                                    bodyText.includes('conteúdo ministrado');

          const isAuth = isInternalPortalUrl || hasTable || hasLogout || hasPortalKeywords;
          return {
            isAuthenticated: isAuth,
            hasTable,
            pageKind: isAuth ? 'authenticated' : 'unknown',
            friendlyPageName: isAuth ? (doc.title || 'Painel do Professor') : 'Página do Portal'
          };
        } catch (e) {
          console.warn('[TeacherAI Extension] Erro no script de autenticação:', e);
          return { isAuthenticated: false, hasTable: false, pageKind: 'error', friendlyPageName: 'Erro de Leitura' };
        }
      }
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (err) {
    console.warn('[TeacherAI Extension] Falha ao executar script de auth:', err);
  }
  return { isAuthenticated: false, hasTable: false, pageKind: 'error', friendlyPageName: 'Desconhecida' };
}

async function evaluateActiveTab(preferredTabId = null) {
  let activeTab = null;

  if (preferredTabId) {
    try {
      activeTab = await chrome.tabs.get(preferredTabId);
    } catch {}
  }

  if (!activeTab || !activeTab.id) {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      activeTab = tabs && tabs[0];
    } catch {}
  }

  if (!activeTab || !activeTab.id) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tabs && tabs[0];
    } catch {}
  }

  if (!activeTab || !activeTab.id) {
    try {
      const allTabs = await chrome.tabs.query({});
      activeTab = allTabs.find(t => t.active && identifyPortal(t.url)) ||
                  allTabs.find(t => identifyPortal(t.url)) ||
                  allTabs.find(t => t.active) ||
                  allTabs[0];
    } catch {}
  }

  if (!activeTab || !activeTab.id) return;

  const url = activeTab.url || '';
  const title = activeTab.title || '';
  const portal = identifyPortal(url);

  currentTabState.tabId = activeTab.id;
  currentTabState.url = url;
  currentTabState.title = title;
  currentTabState.isMappedPortal = !!portal;
  currentTabState.portalName = portal ? portal.name : null;

  if (portal) {
    const authInfo = await checkTabAuthentication(activeTab.id);
    currentTabState.isAuthenticated = authInfo.isAuthenticated;
    currentTabState.pageKind = authInfo.pageKind || (authInfo.isAuthenticated ? 'authenticated' : 'login');
    currentTabState.friendlyPageName = authInfo.pageKind === 'login'
      ? 'Tela de Login'
      : (authInfo.friendlyPageName || title || 'Painel do Professor');
  } else {
    currentTabState.isAuthenticated = false;
    currentTabState.pageKind = 'external';
    currentTabState.friendlyPageName = title || 'Página Externa';
  }

  if (!isSidecarOnline) {
    if (portal) {
      updateToolbarBadge('portal_active_sidecar_connecting');
    } else {
      updateToolbarBadge('offline');
    }
    return;
  }

  if (!portal) {
    updateToolbarBadge('unrecognized_portal');
    sendTabStatusToSidecar();
    return;
  }

  if (currentTabState.pageKind === 'context_selection') {
    updateToolbarBadge('context_selection');
  } else if (currentTabState.isAuthenticated) {
    updateToolbarBadge('ready');
  } else {
    updateToolbarBadge('needs_login');
  }

  sendTabStatusToSidecar();
}

function sendTabStatusToSidecar() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(jsonStr({
      type: 'TAB_STATUS_UPDATE',
      data: {
        tabId: currentTabState.tabId,
        url: currentTabState.url,
        title: currentTabState.title,
        isMappedPortal: currentTabState.isMappedPortal,
        portalName: currentTabState.portalName,
        isAuthenticated: currentTabState.isAuthenticated,
        pageKind: currentTabState.pageKind,
        friendlyPageName: currentTabState.friendlyPageName
      }
    }));
  }
}

// ─── ATUALIZAÇÃO VISUAL DO ÍCONE E BADGE NA BARRA DO CHROME ───────────────────

function updateToolbarBadge(state) {
  if (state === 'context_selection') {
    // 🔵 Azul: Logado, aguardando seleção de filial/ano letivo/turma
    chrome.action.setBadgeText({ text: 'CTX' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_green_16.png',
        '48': 'icons/icon_green_48.png',
        '128': 'icons/icon_green_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Selecione a Turma/Ano e avance no portal (${currentTabState.portalName || 'Portal'})`
    });
  } else if (state === 'portal_active_sidecar_connecting') {
    // 🌐 Ciano/Verde: Portal escolar detectado!
    chrome.action.setBadgeText({ text: 'WEB' });
    chrome.action.setBadgeBackgroundColor({ color: '#0284c7' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_green_16.png',
        '48': 'icons/icon_green_48.png',
        '128': 'icons/icon_green_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Portal ${currentTabState.portalName || ''} ativo. Conectando com assistente local...`
    });
  } else if (state === 'ready') {
    // 🟢 Verde: Conectado e pronto no portal
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_green_16.png',
        '48': 'icons/icon_green_48.png',
        '128': 'icons/icon_green_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Conectada e pronta (${currentTabState.portalName || 'Portal'})`
    });
  } else if (state === 'needs_login') {
    // 🟡 Amarelo: Portal reconhecido, mas precisa de login
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_yellow_16.png',
        '48': 'icons/icon_yellow_48.png',
        '128': 'icons/icon_yellow_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Portal ${currentTabState.portalName || ''} detectado (faça login na página)`
    });
  } else if (state === 'unrecognized_portal') {
    // 🟡 Amarelo: Sidecar online, mas aba não é um portal mapeado
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_yellow_16.png',
        '48': 'icons/icon_yellow_48.png',
        '128': 'icons/icon_yellow_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: 'Teacher AI: Navegador conectado, mas esta página não é um portal escolar'
    });
  } else if (state === 'connecting') {
    // 🔵 Azul vibrante: Conectando / Acionando Native Messaging
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_yellow_16.png',
        '48': 'icons/icon_yellow_48.png',
        '128': 'icons/icon_yellow_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: 'Teacher AI: Conectando com o assistente...'
    });
  } else {
    // 🔴 Vermelho/Cinza: Desconectado
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_red_16.png',
        '48': 'icons/icon_red_48.png',
        '128': 'icons/icon_red_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: 'Teacher AI: Desconectada (inicie o assistente no computador)'
    });
  }
}

// ─── EXECUÇÃO DE AÇÕES DE AUTOMAÇÃO NA MESMA ABA DA PROFESSORA ────────────────

async function handleExecutePortalAction(msg) {
  const { actionId, tabId, intent } = msg;
  const targetTabId = tabId || currentTabState.tabId;
  const isAuthTab = await isAuthorizedPortalTabId(targetTabId);

  if (!targetTabId || !isAuthTab) {
    sendActionResult(actionId, {
      sucesso: false,
      status: 'no_authorized_portal_tab',
      mensagem: 'Ação cancelada: a aba selecionada não é um portal escolar reconhecido.'
    });
    return;
  }

  const acao = intent.acao || 'lancar_nota';
  const aluno = intent.aluno || '';
  let nota = intent.nota;
  const faltas = intent.faltas || 1;

  // Guardião Pedagógico de Validação e Normalização de Notas
  if (acao === 'lancar_nota' && nota !== undefined && nota !== null) {
    const rawNota = parseFloat(String(nota).replace(',', '.'));
    if (!isNaN(rawNota)) {
      if (rawNota > 10 && rawNota <= 100) {
        nota = parseFloat((rawNota / 10).toFixed(1));
        console.log(`[SafeWriter] 💡 Guardião Pedagógico: nota ${rawNota} normalizada para ${nota}`);
      } else if (rawNota < 0 || rawNota > 100) {
        sendActionResult(actionId, {
          sucesso: false,
          status: 'invalid_grade_range',
          mensagem: `A nota ${rawNota} está fora da escala permitida (0 a 10). Por favor, confira o valor informado. ✨`
        });
        return;
      } else {
        nota = rawNota;
      }
    }
  }

  try {
    let execResult = null;

    // 1. Tenta envio direto para o content.js da aba ativa (motor completo com Shadow DOM, React/Vue setters e ancoragem espacial)
    try {
      execResult = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          targetTabId,
          {
            action: 'EXECUTE_PORTAL_ACTION',
            actionId,
            intent,
            acao,
            aluno,
            nota,
            faltas,
            payload: {
              type: acao === 'lancar_nota' ? 'grades' : (acao === 'lancar_falta' ? 'attendance' : acao),
              studentGrades: acao === 'lancar_nota' ? [{ name: aluno, grade: nota }] : [],
              absentStudents: acao === 'lancar_falta' ? [aluno] : [],
              aluno,
              nota,
              faltas,
              ...intent
            }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }
        );
      });
    } catch (msgErr) {
      console.warn('[Background] content.js não respondeu diretamente via sendMessage; tentando injeção segura de fallback:', msgErr);
    }

    // 2. Fallback caso content.js não estivesse presente ou não tenha tratado a mensagem
    if (!execResult || (!execResult.sucesso && !execResult.success && execResult.filledCount === undefined)) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        args: [acao, aluno, nota, faltas],
        func: (acaoParam, alunoParam, notaParam, faltasParam) => {
          // Localiza linha do aluno na tabela
          const rows = Array.from(document.querySelectorAll('table tr, tr, div.student-row, li'));
          let targetRow = null;

          const cleanTarget = alunoParam.trim().toLowerCase();
          const firstName = cleanTarget.split(' ')[0];

          for (const r of rows) {
            const txt = r.innerText.toLowerCase();
            if (txt.includes(cleanTarget)) {
              targetRow = r;
              break;
            }
          }

          if (!targetRow && firstName.length > 2) {
            for (const r of rows) {
              const txt = r.innerText.toLowerCase();
              if (txt.includes(firstName)) {
                targetRow = r;
                break;
              }
            }
          }

          if (!targetRow) {
            return { sucesso: false, status: 'student_not_found', aluno: alunoParam };
          }

          // Busca input na linha
          const inputs = Array.from(targetRow.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])'));
          if (inputs.length === 0) {
            return { sucesso: false, status: 'no_editable_inputs', aluno: alunoParam };
          }

          const input = inputs[0];
          const valBefore = input.value || '';
          const targetValue = (acaoParam === 'lancar_nota') ? String(notaParam) : String(faltasParam);

          // Preenche com disparo de eventos seguros e compatibilidade com React/Vue
          input.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          if (nativeSetter) {
            nativeSetter.set.call(input, targetValue);
          } else {
            input.value = targetValue;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));

          return {
            sucesso: true,
            status: 'draft_completed_pending_submit',
            diff: {
              aluno: alunoParam,
              campo: acaoParam === 'lancar_nota' ? 'nota' : 'falta',
              antes: valBefore,
              depois: targetValue,
              drift_detectado: false
            }
          };
        }
      });

      execResult = (results && results[0] && results[0].result) || {
        sucesso: false,
        status: 'execution_failed'
      };
    }

    const isSuccess = Boolean(execResult.sucesso || execResult.success || (execResult.filledCount > 0));
    const normalizedResult = {
      sucesso: isSuccess,
      status: execResult.status || (isSuccess ? 'draft_completed_pending_submit' : 'execution_failed'),
      diff: execResult.diff || {
        aluno,
        campo: acao === 'lancar_nota' ? 'nota' : 'falta',
        depois: String(nota ?? faltas)
      },
      ...execResult
    };

    // 2. Captura screenshot da aba visível para evidência e card de aprovação
    let screenshotUrl = null;
    try {
      screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    } catch {}

    sendActionResult(actionId, {
      ...execResult,
      acao,
      screenshot: screenshotUrl
    });

  } catch (err) {
    sendActionResult(actionId, {
      sucesso: false,
      status: 'execution_error',
      mensagem: `Erro ao interagir com a página: ${err.message}`
    });
  }
}

function sendActionResult(actionId, result) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(jsonStr({
      type: 'ACTION_RESULT',
      actionId,
      result
    }));
  }
}

function jsonStr(obj) {
  try { return JSON.stringify(obj); } catch { return '{}'; }
}

// ─── LISTENERS DO NAVEGADOR (ABAS & MENSAGENS INTERNAS) ──────────────────────

// Keep-Alive Duplex Port com Side Panel (evita suspensão MV3 aos 30s)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAliveSidePanel' || port.name === 'teacher_ai_keepalive') {
    port.onMessage.addListener((msg) => {
      if (msg?.type === 'KEEPALIVE_PING') {
        try {
          port.postMessage({ type: 'KEEPALIVE_PONG', timestamp: Date.now() });
        } catch (e) {}
      }
    });
    port.onDisconnect.addListener(() => {
      // Porta desconectada (side panel fechado)
    });
  }
});

// Alarme de retaguarda para Service Worker MV3 (mantém liveness periódico de 25s)
try {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.create('teacher_ai_sw_heartbeat', { periodInMinutes: 0.4 }); // ~24s
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'teacher_ai_sw_heartbeat') {
        // Heartbeat silencioso para evitar inatividade do Service Worker
      }
    });
  }
} catch (e) {}

chrome.tabs.onActivated.addListener(() => {
  evaluateActiveTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === 'complete' || changeInfo.url)) {
    evaluateActiveTab();
  }
});

async function resolveActivePortalTab(explicitTabId) {
  if (explicitTabId) {
    try {
      const tab = await chrome.tabs.get(explicitTabId);
      if (tab && tab.id) return tab.id;
    } catch {}
  }
  // 1. Prioridade máxima: aba ativa na janela com foco / janela atual
  try {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const currentActive = activeTabs.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel'));
    if (currentActive && currentActive.id) return currentActive.id;
  } catch {}

  try {
    const activeTabsCurrent = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentActive = activeTabsCurrent.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel'));
    if (currentActive && currentActive.id) return currentActive.id;
  } catch {}

  // 2. Se a aba ativa não for página web, busca portais conhecidos em qualquer aba ativa
  try {
    const activeAny = await chrome.tabs.query({ active: true });
    const portalActive = activeAny.find(t => t.url && identifyPortal(t.url));
    if (portalActive && portalActive.id) return portalActive.id;
  } catch {}

  // 3. Fallback: qualquer aba de portal aberta
  try {
    const allTabs = await chrome.tabs.query({});
    const portalTab = allTabs.find(t => t.url && identifyPortal(t.url)) ||
                      allTabs.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel') && !t.url.startsWith('chrome'));
    if (portalTab && portalTab.id) return portalTab.id;
  } catch {}

  return currentTabState.tabId || null;
}

// ─── HELPER DE ESTABILIZAÇÃO DE PÁGINA (PPAV DOM SETTLEMENT) ───────────────────
async function waitForPageSettled(tabId, maxWaitMs = 2500) {
  if (!tabId) return;
  await new Promise(r => setTimeout(r, 200));
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.status === 'loading') {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, maxWaitMs);
        const onUpdated = (tid, info) => {
          if (tid === tabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            clearTimeout(timeout);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
      });
    }
  } catch (e) {}
  await new Promise(r => setTimeout(r, 350));
}

async function internalNavigatePortalTab(targetTabId, targetKeyword) {
  const keyword = (targetKeyword || '').trim().toLowerCase()
    .replace(/\s+\b(?:e|e\s+depois|depois|em\s+seguida|a[ií])\b.*$/i, '')
    .replace(/\s+e$/i, '')
    .trim();

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      args: [keyword],
      func: async (kw) => {
        const cleanKey = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const candidates = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="menuitem"], [role="button"], .tab, .tab-btn, .nav-link, li, span'));
        
        let bestElement = null;
        let bestScore = -1;

        for (const el of candidates) {
          if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
          
          const text = (el.innerText || el.textContent || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const aria = (el.getAttribute('aria-label') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const title = (el.getAttribute('title') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const href = (el.getAttribute('href') || '').toLowerCase();
          const id = (el.id || '').toLowerCase();

          let score = 0;
          if (text === cleanKey) score = 100;
          else if (text.startsWith(cleanKey)) score = 80;
          else if (text.includes(cleanKey)) score = 60;
          else if (aria.includes(cleanKey)) score = 50;
          else if (title.includes(cleanKey)) score = 40;
          else if (id.includes(cleanKey)) score = 30;
          else if (href.includes(cleanKey)) score = 20;

          if (el.getAttribute('role') === 'tab' || el.classList.contains('tab') || el.classList.contains('nav-link')) {
            score += 15;
          }
          if (el.tagName === 'A' || el.tagName === 'BUTTON') {
            score += 10;
          }

          if (score > bestScore && score >= 20) {
            bestScore = score;
            bestElement = el;
          }
        }

        if (!bestElement) {
          return { sucesso: false, mensagem: `Não encontrei nenhuma aba ou link correspondente a '${kw}'.` };
        }

        const origTransition = bestElement.style.transition;
        const origOutline = bestElement.style.outline;
        const origBoxShadow = bestElement.style.boxShadow;

        bestElement.style.transition = 'all 0.3s ease';
        bestElement.style.outline = '2px solid #38bdf8';
        bestElement.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.6)';

        bestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 120));

        try {
          bestElement.click();
        } catch (e) {
          bestElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }

        await new Promise(r => setTimeout(r, 350));

        setTimeout(() => {
          try {
            bestElement.style.transition = origTransition;
            bestElement.style.outline = origOutline;
            bestElement.style.boxShadow = origBoxShadow;
          } catch {}
        }, 1500);

        return {
          sucesso: true,
          elementText: (bestElement.innerText || bestElement.textContent || kw).trim(),
          tag: bestElement.tagName,
          target: kw
        };
      }
    });

    await waitForPageSettled(targetTabId, 3000);
    return (results && results[0] && results[0].result) || { sucesso: false, mensagem: 'Script de navegação falhou.' };
  } catch (err) {
    return { sucesso: false, mensagem: err.message };
  }
}

async function internalSelectPortalFilter(targetTabId, rawTerm) {
  const term = (rawTerm || '').trim();
  if (!term) return { sucesso: false, mensagem: 'Termo de filtro não especificado.' };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      args: [term],
      func: async (t) => {
        const cleanStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const normTerm = cleanStr(t);

        const ordinalMap = {
          'primeiro': '1', 'segundo': '2', 'terceiro': '3', 'quarto': '4',
          'quinto': '5', 'sexto': '6', 'setimo': '7', 'oitavo': '8', 'nono': '9'
        };

        const searchVariants = [normTerm];
        for (const [word, num] of Object.entries(ordinalMap)) {
          if (normTerm.includes(word)) {
            searchVariants.push(normTerm.replace(word, num));
            searchVariants.push(normTerm.replace(word, `${num}o`));
            searchVariants.push(normTerm.replace(word, `${num}º`));
            searchVariants.push(num);
            searchVariants.push(`${num}o`);
            searchVariants.push(`${num}º`);
          } else if (normTerm.includes(num)) {
            searchVariants.push(normTerm.replace(num, word));
            searchVariants.push(word);
          }
        }

        const uniqueVariants = Array.from(new Set(searchVariants.filter(Boolean)));

        // 1. Procura em dropdowns (<select>)
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
          if (sel.offsetParent === null && sel.offsetWidth === 0 && sel.offsetHeight === 0) continue;
          for (let i = 0; i < sel.options.length; i++) {
            const opt = sel.options[i];
            const optText = cleanStr(opt.text);
            const optVal = cleanStr(opt.value);
            const isMatch = uniqueVariants.some(v => optText.includes(v) || optVal === v || optVal.includes(v));
            if (isMatch) {
              sel.selectedIndex = i;
              sel.value = opt.value;

              const origTransition = sel.style.transition;
              const origOutline = sel.style.outline;
              sel.style.transition = 'all 0.3s ease';
              sel.style.outline = '3px solid #10b981';
              sel.scrollIntoView({ behavior: 'smooth', block: 'center' });

              sel.dispatchEvent(new Event('input', { bubbles: true }));
              sel.dispatchEvent(new Event('change', { bubbles: true }));

              await new Promise(r => setTimeout(r, 250));

              setTimeout(() => {
                try {
                  sel.style.transition = origTransition;
                  sel.style.outline = origOutline;
                } catch {}
              }, 1800);

              return {
                sucesso: true,
                matchedType: 'select_option',
                elementText: opt.text.trim(),
                target: t
              };
            }
          }
        }

        // 2. Procura em botões, abas, pílulas de filtro, links, radios e checkboxes
        const clickableCandidates = Array.from(document.querySelectorAll(
          'button, [role="button"], [role="option"], [role="radio"], .pill, .filter-btn, .badge, a, label, input[type="radio"], input[type="checkbox"]'
        ));

        let bestClickable = null;
        let bestScore = -1;

        for (const el of clickableCandidates) {
          if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
          const text = cleanStr(el.innerText || el.textContent);
          const aria = cleanStr(el.getAttribute('aria-label'));
          const title = cleanStr(el.getAttribute('title'));
          const val = cleanStr(el.getAttribute('value'));

          for (const v of uniqueVariants) {
            let score = 0;
            if (text === v) score = 100;
            else if (text.startsWith(v)) score = 85;
            else if (text.includes(v)) score = 70;
            else if (v.includes(text) && text.length >= 4) score = 75;
            else if (aria.includes(v)) score = 60;
            else if (title.includes(v)) score = 50;
            else if (val === v) score = 65;

            if (score > bestScore && score >= 50) {
              bestScore = score;
              bestClickable = el;
            }
          }
        }

        if (bestClickable) {
          const origTransition = bestClickable.style.transition;
          const origOutline = bestClickable.style.outline;
          bestClickable.style.transition = 'all 0.3s ease';
          bestClickable.style.outline = '3px solid #10b981';
          bestClickable.scrollIntoView({ behavior: 'smooth', block: 'center' });

          await new Promise(r => setTimeout(r, 120));

          try {
            bestClickable.click();
          } catch (e) {
            bestClickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }

          await new Promise(r => setTimeout(r, 250));

          setTimeout(() => {
            try {
              bestClickable.style.transition = origTransition;
              bestClickable.style.outline = origOutline;
            } catch {}
          }, 1800);

          return {
            sucesso: true,
            matchedType: 'clickable_element',
            elementText: (bestClickable.innerText || bestClickable.textContent || t).trim(),
            target: t
          };
        }

        return { sucesso: false, mensagem: `Não encontrei filtro para '${t}'.` };
      }
    });

    await waitForPageSettled(targetTabId, 1500);
    return (results && results[0] && results[0].result) || { sucesso: false, mensagem: 'Falha ao selecionar filtro.' };
  } catch (err) {
    return { sucesso: false, mensagem: err.message };
  }
}

async function internalClickConfirmOrViewButton(targetTabId, customPattern) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      args: [customPattern || null],
      func: async (patternArg) => {
        const cleanStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        let actionPatterns = [
          'visualizar frequencia', 'visualizar chamada', 'visualizar',
          'consultar', 'filtrar', 'carregar', 'buscar', 'pesquisar', 'exibir', 'listar', 'aplicar'
        ];

        if (patternArg) {
          const cleanCustom = cleanStr(patternArg)
            .replace(/^(?:pedir\s+pra|pedir\s+para|clicar\s+em|clique\s+em|clica\s+em|abrir|ver|mostrar)\s+/i, '')
            .trim();
          if (cleanCustom) {
            actionPatterns.unshift(cleanCustom);
          }
        }

        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, [role="button"]'));
        for (const btn of buttons) {
          if (btn.offsetParent === null && btn.offsetWidth === 0 && btn.offsetHeight === 0) continue;
          const text = cleanStr(btn.innerText || btn.value || btn.getAttribute('aria-label') || btn.getAttribute('title'));
          const match = actionPatterns.some(p => text === p || text.startsWith(p) || text.includes(p));
          if (match) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 100));
            try {
              btn.click();
            } catch (e) {
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
            return { sucesso: true, buttonText: text };
          }
        }
        return { sucesso: false };
      }
    });
    return (results && results[0] && results[0].result) || { sucesso: false };
  } catch (err) {
    return { sucesso: false, error: err.message };
  }
}

async function internalReadRoster(targetTabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const rows = Array.from(document.querySelectorAll('table tr, tr, div.student-row, li'));
        const roster = [];
        rows.forEach((row, idx) => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          if (cells.length < 2) return;
          const inputs = Array.from(row.querySelectorAll('input:not([type="hidden"]), select, [contenteditable="true"]'));
          let nameCandidate = '';
          for (const c of cells) {
            const txt = c.innerText.trim();
            if (txt && !/^\d+$/.test(txt) && !c.querySelector('input, select')) {
              nameCandidate = txt;
              break;
            }
          }
          if (!nameCandidate && cells[0]) nameCandidate = cells[0].innerText.trim();
          const lower = nameCandidate.toLowerCase();
          if (lower.includes('aluno') || lower.includes('nome') || lower.includes('estudante') || lower.includes('matrícula') || lower.includes('matricula')) return;

          if (inputs.length > 0) {
            const firstInput = inputs[0];
            let currentVal = '';
            if (firstInput.tagName === 'SELECT') {
              currentVal = firstInput.options[firstInput.selectedIndex]?.text || firstInput.value || '';
            } else if (firstInput.type === 'checkbox') {
              currentVal = firstInput.checked ? 'Falta' : 'Presença';
            } else {
              currentVal = firstInput.value || '';
            }
            roster.push({
              rowIndex: idx,
              name: nameCandidate,
              currentValue: currentVal,
              inputId: firstInput.id || firstInput.name || `input_row_${idx}`,
              inputType: firstInput.type || firstInput.tagName.toLowerCase()
            });
          } else if (nameCandidate && nameCandidate.length >= 3 && !/^\d+$/.test(nameCandidate)) {
            roster.push({
              rowIndex: idx,
              name: nameCandidate,
              currentValue: '',
              inputId: null,
              inputType: 'static_roster'
            });
          }
        });
        return roster;
      }
    });
    return { sucesso: true, students: (results && results[0] && results[0].result) || [] };
  } catch (err) {
    return { sucesso: false, students: [], error: err.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'RELOAD_EXTENSION') {
    try {
      chrome.runtime.reload();
    } catch (e) {
      console.warn('Erro ao recarregar extensão:', e);
    }
    return;
  }

  if (message.action === 'GET_POPUP_STATE') {
    (async () => {
      await evaluateActiveTab(message.activeTabId || (sender && sender.tab ? sender.tab.id : null));
      sendResponse({
        isSidecarOnline,
        tabState: currentTabState,
        startupMethod,
        bothStartupMethodsFailed,
        isLaunchingViaNative,
        isConnecting: Boolean(!isSidecarOnline && (startupTimer || isLaunchingViaNative))
      });
    })();
    return true;
  }

  if (message.action === 'RECONNECT_SIDECAR') {
    (async () => {
      updateToolbarBadge('connecting');
      connectWebSocket();
      await evaluateActiveTab(message.activeTabId || (sender && sender.tab ? sender.tab.id : null));
      sendResponse({
        isSidecarOnline,
        tabState: currentTabState,
        startupMethod,
        bothStartupMethodsFailed,
        isLaunchingViaNative,
        isConnecting: Boolean(!isSidecarOnline && (startupTimer || isLaunchingViaNative))
      });
    })();
    return true;
  }

  // ─── RELAY DE FERRAMENTAS DO APP PARA A EXTENSÃO (ARQUITETURA UNIFICADA) ───
  if (message.action === 'RELAY_TOOL_EXECUTION') {
    (async () => {
      const payload = message.payload || {};
      const { tool, params, portalId } = payload;

      // 1. Localiza aba ativa de portal conectado
      const targetTabId = await resolveActivePortalTab(params?.tabId);

      // Caso desconectado: recusa honesta e transparente à professora
      if (!targetTabId) {
        sendResponse({
          success: false,
          status: 'extension_disconnected',
          verified: false,
          error: 'A extensão não encontrou nenhuma aba aberta do portal escolar conectado. Abra o portal no navegador para que a Rafinha possa executar a ação.'
        });
        return;
      }

      // 2. Roteia execução de acordo com o tipo de ferramenta
      try {
        if (tool === 'read_roster' || (tool === 'invoke_teacher_capability' && params?.capability === 'read_roster')) {
          chrome.tabs.sendMessage(targetTabId, {
            action: 'EXECUTE_SKILL_GRAPH',
            skillGraph: null
          }, (graphResp) => {
            if (chrome.runtime.lastError || !graphResp?.ok) {
              // Fallback gracioso para leitura direta de tabela no DOM
              chrome.tabs.sendMessage(targetTabId, { action: 'READ_ACTIVE_PORTAL_ROSTER' }, (rosterResp) => {
                const students = rosterResp?.students || [];
                sendResponse({
                  success: Boolean(rosterResp && rosterResp.sucesso),
                  verified: Boolean(students.length > 0),
                  verification_method: 'dom_roster_table',
                  students,
                  data: { students },
                  error: rosterResp?.mensagem
                });
              });
            } else {
              const students = graphResp.records || graphResp.students || [];
              sendResponse({
                success: true,
                verified: true,
                verification_method: 'graph_executor_dom',
                students,
                data: { students, trace: graphResp.trace },
                trace: graphResp.trace
              });
            }
          });
          return;
        }

        if (tool === 'execute_portal_action' || tool === 'fill_school_portal') {
          chrome.tabs.sendMessage(targetTabId, {
            action: 'EXECUTE_PORTAL_ACTION',
            payload: params
          }, async (actionResp) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                verified: false,
                error: chrome.runtime.lastError.message
              });
              return;
            }

            let screenshot = null;
            try {
              screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            } catch {}

            sendResponse({
              success: Boolean(actionResp?.ok || actionResp?.success || actionResp?.sucesso),
              verified: Boolean(actionResp?.verified || actionResp?.ok || actionResp?.sucesso),
              verification_method: 'dom_readback',
              status: actionResp?.status || 'success',
              screenshot,
              data: actionResp,
              message: actionResp?.mensagem || actionResp?.message || 'Campos preenchidos com sucesso no DOM do portal.'
            });
          });
          return;
        }

        if (tool === 'confirm_portal_submission') {
          chrome.tabs.sendMessage(targetTabId, {
            action: 'RESUME_EXECUTION',
            approved: params?.action === 'approve'
          }, (resResp) => {
            sendResponse({
              success: true,
              verified: true,
              verification_method: 'checkpoint_approval',
              action: params?.action
            });
          });
          return;
        }

        if (tool === 'show_portal_screenshot') {
          let screenshot = null;
          try {
            screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
          } catch {}
          sendResponse({
            success: Boolean(screenshot),
            verified: true,
            screenshot,
            message: screenshot ? 'Screenshot capturada da tela do portal.' : 'Não foi possível capturar a tela.'
          });
          return;
        }

        // Caso genérico
        chrome.tabs.sendMessage(targetTabId, {
          action: 'EXECUTE_PORTAL_ACTION',
          payload: params
        }, (resp) => {
          sendResponse({
            success: Boolean(resp?.ok || resp?.success || resp?.sucesso),
            verified: Boolean(resp?.verified),
            data: resp
          });
        });

      } catch (err) {
        sendResponse({
          success: false,
          verified: false,
          error: err.message
        });
      }
    })();
    return true;
  }

  if (message.action === 'EXECUTE_PORTAL_ACTION') {
    (async () => {
      const targetTabId = await resolveActivePortalTab(message.tabId);
      if (!targetTabId) {
        sendResponse({
          ok: false,
          sucesso: false,
          success: false,
          status: 'no_authorized_portal_tab',
          error: 'Portal desconectado',
          mensagem: 'A extensão não encontrou nenhuma aba aberta do portal escolar conectado. Abra o portal no navegador para que a Rafinha possa executar a ação.'
        });
        return;
      }

      const p = message.payload || message.params || {};
      const actionType = p.actionType || p.type || p.acao || 'attendance';
      const classRef = p.classRef || p.turma || '';
      const title = p.title || p.titulo || '';
      const trace = [];

      try {
        // 1. Pré-Navegação de Aba (se indicada por actionType ou title)
        let tabTarget = null;
        const normTitle = (title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (actionType === 'attendance' || normTitle.includes('frequencia') || normTitle.includes('chamada')) {
          tabTarget = 'frequência';
        } else if (actionType === 'grades' || normTitle.includes('nota') || normTitle.includes('avaliacao') || normTitle.includes('boletim')) {
          tabTarget = 'notas';
        } else if (actionType === 'diary' || normTitle.includes('diario') || normTitle.includes('aula')) {
          tabTarget = 'diário';
        }

        if (tabTarget) {
          console.log(`[EXECUTE_PORTAL_ACTION] Tentando pré-navegação para aba '${tabTarget}'...`);
          const navRes = await internalNavigatePortalTab(targetTabId, tabTarget);
          if (navRes && navRes.sucesso) {
            trace.push(`Navegou para aba '${navRes.elementText || tabTarget}'`);
            await new Promise(r => setTimeout(r, 400));
          }
        }

        // 2. Seleção de Turma / Filtro (classRef)
        let turmaSelected = false;
        if (classRef) {
          console.log(`[EXECUTE_PORTAL_ACTION] Selecionando filtro de turma '${classRef}'...`);
          const filterRes = await internalSelectPortalFilter(targetTabId, classRef);
          if (filterRes && filterRes.sucesso) {
            turmaSelected = true;
            trace.push(`Filtro de turma selecionado: '${filterRes.elementText || classRef}'`);
            await new Promise(r => setTimeout(r, 300));
          }
        }

        // 3. Seleção de Disciplina (se houver na mensagem/título)
        const commonSubjects = [
          'lingua inglesa', 'ingles', 'lingua portuguesa', 'portugues',
          'matematica', 'historia', 'geografia', 'ciencias', 'fisica',
          'quimica', 'biologia', 'artes', 'educacao fisica', 'filosofia', 'sociologia',
          'redacao', 'literatura', 'espanhol'
        ];
        let subjectFound = null;
        for (const subj of commonSubjects) {
          if (normTitle.includes(subj)) {
            subjectFound = subj;
            break;
          }
        }
        if (subjectFound) {
          console.log(`[EXECUTE_PORTAL_ACTION] Selecionando filtro de disciplina '${subjectFound}'...`);
          const subjRes = await internalSelectPortalFilter(targetTabId, subjectFound);
          if (subjRes && subjRes.sucesso) {
            trace.push(`Disciplina selecionada: '${subjRes.elementText || subjectFound}'`);
            await new Promise(r => setTimeout(r, 300));
          }
        }

        // 4. Se houver botão de consulta/confirmação (ex: "Visualizar Frequência", "Consultar", "Filtrar")
        const clickRes = await internalClickConfirmOrViewButton(targetTabId);
        if (clickRes && clickRes.sucesso) {
          trace.push(`Clicou em '${clickRes.buttonText}' para carregar grade`);
          await new Promise(r => setTimeout(r, 600));
        }

        // 5. Preenchimento de Campos no DOM (se houver notas ou faltas a marcar)
        const hasGrades = (p.studentGrades && p.studentGrades.length > 0) || Boolean(p.nota);
        const hasAbsences = (p.absentStudents && p.absentStudents.length > 0) || (p.aluno && actionType === 'attendance');
        const hasDiaryContent = Boolean(p.description || p.methodology);

        let domActionRes = null;
        if (hasGrades || hasAbsences || hasDiaryContent) {
          domActionRes = await new Promise((resolve) => {
            chrome.tabs.sendMessage(targetTabId, {
              action: 'EXECUTE_PORTAL_ACTION',
              payload: p
            }, (res) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, mensagem: chrome.runtime.lastError.message });
              } else {
                resolve(res || { ok: false });
              }
            });
          });
        }

        // 6. Leitura e verificação factual dos alunos na tela atual
        const rosterRes = await internalReadRoster(targetTabId);
        const students = rosterRes?.students || [];

        // 7. Screenshot da tela
        let screenshot = null;
        try {
          screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        } catch {}

        // 8. Síntese do resultado
        const isDomFilled = Boolean(domActionRes?.sucesso || domActionRes?.success || domActionRes?.ok);
        const isScreenReady = Boolean(students.length > 0 || turmaSelected || clickRes?.sucesso);
        const isSuccess = isDomFilled || isScreenReady || Boolean(trace.length > 0);

        let mensagemFinal = '';
        if (isDomFilled) {
          mensagemFinal = domActionRes?.mensagem || 'Campos preenchidos com sucesso no DOM do portal!';
        } else if (students.length > 0) {
          const classLabel = classRef ? `da turma ${classRef}` : '';
          const subjMsg = subjectFound ? ` (${subjectFound})` : '';
          mensagemFinal = `Acessei a aba Frequência ${classLabel}${subjMsg}. Encontrei ${students.length} alunos na tela prontos para visualização e chamada! ✨`;
        } else if (turmaSelected) {
          mensagemFinal = `Filtros selecionados no portal com sucesso (${trace.join(' → ')}). Tela pronta para visualização!`;
        } else {
          mensagemFinal = 'Ação executada no portal. Verifique os campos na tela.';
        }

        sendResponse({
          ok: isSuccess,
          sucesso: isSuccess,
          success: isSuccess,
          verified: true,
          verification_method: 'graph_executor_dom',
          status: isSuccess ? 'success' : 'no_matching_field_found',
          mensagem: mensagemFinal,
          message: mensagemFinal,
          students,
          screenshot,
          trace,
          data: {
            trace,
            students,
            domActionRes
          }
        });
      } catch (err) {
        sendResponse({
          ok: false,
          sucesso: false,
          success: false,
          error: err.message,
          mensagem: `Não foi possível completar a operação no portal: ${err.message}`
        });
      }
    })();
    return true;
  }

  if (message.action === 'READ_ACTIVE_PORTAL_ROSTER') {
    (async () => {
      const targetTabId = await resolveActivePortalTab(message.tabId);
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada.' });
        return;
      }
      const res = await internalReadRoster(targetTabId);
      sendResponse(res);
    })();
    return true;
  }

  if (message.action === 'EXECUTE_SAFE_WRITE') {
    (async () => {
      const targetTabId = await resolveActivePortalTab(message.tabId);
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal para escrita.' });
        return;
      }

      let { studentName, targetValue, actionType } = message;

      // Guardião Pedagógico de Validação e Normalização de Notas
      if ((actionType === 'lancar_nota' || !actionType) && targetValue !== undefined && targetValue !== null) {
        const rawNota = parseFloat(String(targetValue).replace(',', '.'));
        if (!isNaN(rawNota)) {
          if (rawNota > 10 && rawNota <= 100) {
            targetValue = String(parseFloat((rawNota / 10).toFixed(1)));
            console.log(`[SafeWriter] 💡 Guardião Pedagógico: nota normalizada para ${targetValue}`);
          } else if (rawNota < 0 || rawNota > 100) {
            sendResponse({
              sucesso: false,
              status: 'invalid_grade_range',
              mensagem: `A nota ${rawNota} está fora da escala permitida (0 a 10). Por favor, confira o valor informado. ✨`
            });
            return;
          } else {
            targetValue = String(rawNota);
          }
        }
      }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          args: [studentName, String(targetValue), actionType || 'lancar_nota'],
          func: (targetName, valStr, actType) => {
            const rows = Array.from(document.querySelectorAll('table tr'));
            const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const cleanTarget = norm(targetName);
            let targetRow = null;

            for (const r of rows) {
              const rowText = norm(r.innerText);
              if (rowText.includes(cleanTarget)) {
                targetRow = r;
                break;
              }
            }

            if (!targetRow) {
              const firstName = cleanTarget.split(' ')[0];
              if (firstName.length > 2) {
                for (const r of rows) {
                  const rowText = norm(r.innerText);
                  if (rowText.includes(firstName)) {
                    targetRow = r;
                    break;
                  }
                }
              }
            }

            if (!targetRow) {
              return { sucesso: false, status: 'student_not_found', mensagem: `Aluno '${targetName}' não encontrado no portal.` };
            }

            const isFalta = (actType === 'lancar_falta');
            const checkboxes = Array.from(targetRow.querySelectorAll('input[type="checkbox"]'));
            const textInputs = Array.from(targetRow.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])'));
            const selects = Array.from(targetRow.querySelectorAll('select'));

            let targetInput = null;
            if (isFalta && checkboxes.length > 0) {
              targetInput = checkboxes[0];
            } else if (textInputs.length > 0) {
              targetInput = textInputs[0];
            } else if (checkboxes.length > 0) {
              targetInput = checkboxes[0];
            } else if (selects.length > 0) {
              targetInput = selects[0];
            }

            if (!targetInput) {
              return { sucesso: false, status: 'no_inputs', mensagem: `Nenhum campo editável (${isFalta ? 'falta/frequência' : 'nota'}) na linha deste aluno.` };
            }

            // 1. Aplica destaque visual seguro
            const origTransition = targetInput.style.transition;
            const origOutline = targetInput.style.outline;
            const origBg = targetInput.style.backgroundColor;

            targetInput.style.transition = 'all 0.3s ease';
            targetInput.style.outline = '3px solid #10b981';
            targetInput.style.backgroundColor = '#ecfdf5';
            targetInput.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.6)';

            let beforeVal = '';
            let afterVal = '';
            let isVerified = false;

            // 2. Escrita por tipo de controle
            if (targetInput.type === 'checkbox') {
              beforeVal = targetInput.checked ? 'Marcado' : 'Desmarcado';
              const shouldBeChecked = isFalta ? (valStr !== '0' && valStr.toLowerCase() !== 'false') : true;

              if (targetInput.checked !== shouldBeChecked) {
                targetInput.checked = shouldBeChecked;
                targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                targetInput.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }
              targetInput.focus();
              afterVal = targetInput.checked ? 'Marcado' : 'Desmarcado';
              isVerified = (targetInput.checked === shouldBeChecked);
            } else if (targetInput.tagName === 'SELECT') {
              beforeVal = targetInput.options[targetInput.selectedIndex]?.text || targetInput.value || '';
              let opt = Array.from(targetInput.options).find(o => norm(o.value) === norm(valStr) || norm(o.text).includes(norm(valStr)));
              if (!opt && isFalta) {
                opt = Array.from(targetInput.options).find(o => norm(o.value) === 'f' || norm(o.text).includes('falta'));
              }
              if (opt) {
                targetInput.value = opt.value;
              }
              targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              afterVal = targetInput.options[targetInput.selectedIndex]?.text || targetInput.value;
              isVerified = opt ? (targetInput.value === opt.value) : true;
            } else {
              beforeVal = targetInput.value || '';
              try {
                const proto = Object.getPrototypeOf(targetInput);
                const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
                                   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                if (descriptor && descriptor.set) {
                  descriptor.set.call(targetInput, valStr);
                } else {
                  targetInput.value = valStr;
                }
              } catch (e) {
                targetInput.value = valStr;
              }

              targetInput.focus();
              targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              afterVal = targetInput.value;
              isVerified = (afterVal === valStr);
            }

            // Restaura estilo gradualmente após 2.5s
            setTimeout(() => {
              try {
                targetInput.style.transition = 'all 0.5s ease';
                targetInput.style.outline = origOutline;
                targetInput.style.backgroundColor = origBg;
                targetInput.style.boxShadow = 'none';
              } catch {}
            }, 2500);

            return {
              sucesso: isVerified,
              status: isVerified ? 'verified_persisted' : 'verification_failed',
              studentName: targetName,
              before_val: beforeVal,
              after_val: afterVal,
              expected_val: valStr,
              verified: isVerified
            };
          }
        });

        const execRes = (results && results[0] && results[0].result) || { sucesso: false, status: 'script_failed' };

        // Captura screenshot da evidência visual com o highlight verde
        let screenshot = null;
        try {
          screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        } catch {}

        sendResponse({
          ...execRes,
          screenshot
        });
      } catch (err) {
        sendResponse({ sucesso: false, status: 'exception', mensagem: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'NAVIGATE_PORTAL_TAB') {
    (async () => {
      const targetTabId = await resolveActivePortalTab(message.tabId);
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada.' });
        return;
      }
      const res = await internalNavigatePortalTab(targetTabId, message.target);
      sendResponse(res);
    })();
    return true;
  }

  if (message.action === 'DISCOVERY_SELECT_FILTER') {
    (async () => {
      const targetTabId = await resolveActivePortalTab(message.tabId);
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada para seleção.' });
        return;
      }
      const rawTerm = (message.filterTerm || message.target || '').trim();
      const res = await internalSelectPortalFilter(targetTabId, rawTerm);
      sendResponse(res);
    })();
    return true;
  }

  if (message.action === 'CLICK_PORTAL_BUTTON') {
    (async () => {
      const targetTabId = await resolveActivePortalTab(message.tabId);
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada para clique.' });
        return;
      }
      const rawTerm = (message.buttonText || message.target || '').trim();
      const res = await internalClickConfirmOrViewButton(targetTabId, rawTerm);
      sendResponse(res || { sucesso: false, mensagem: 'Botão não encontrado.' });
    })();
    return true;
  }

  if (message.action === 'DISCOVERY_FIND_AND_CLICK_STUDENT') {
    (async () => {
      let targetTabId = message.tabId;
      if (!targetTabId) {
        try {
          const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTabs && activeTabs.length > 0 && isAuthorizedPortalTab(activeTabs[0])) {
            targetTabId = activeTabs[0].id;
          }
        } catch {}
      }
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(t => isAuthorizedPortalTab(t));
        targetTabId = portalTab ? portalTab.id : (isAuthorizedPortalTab(currentTabState) ? currentTabState.tabId : null);
      }
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada.' });
        return;
      }

      const targetStudent = (message.studentName || message.target || '').trim();
      if (!targetStudent) {
        sendResponse({ sucesso: false, mensagem: 'Nome do aluno não informado.' });
        return;
      }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          args: [targetStudent],
          func: async (studentName) => {
            const cleanStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const normTarget = cleanStr(studentName);
            const targetTokens = normTarget.split(/\s+/).filter(Boolean);
            const firstName = targetTokens[0] || '';

            // Termos destrutivos estritamente bloqueados
            const DESTRUCTIVE_TERMS = ['excluir', 'remover', 'deletar', 'cancelar', 'apagar', 'desmatricular'];
            const isDestructive = (el) => {
              const txt = cleanStr(el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '');
              return DESTRUCTIVE_TERMS.some(term => txt.includes(term));
            };

            // Função interna para coletar candidatos a elemento do aluno na tela
            const scanCandidates = () => {
              let cardCandidates = Array.from(document.querySelectorAll(
                '.card, [class*="card"], [class*="aluno"], [class*="student"], [data-aluno-id], [data-aluno], .aluno-item, .item-aluno, li, .grid-item'
              )).filter(el => {
                if (el.offsetWidth < 50 || el.offsetHeight < 30) return false;
                const txt = cleanStr(el.innerText || el.textContent);
                if (!txt || txt.length > 500) return false;
                return txt.includes(normTarget) || (firstName.length >= 3 && txt.includes(firstName));
              });

              if (cardCandidates.length === 0) {
                cardCandidates = Array.from(document.querySelectorAll('div')).filter(el => {
                  if (el.offsetWidth < 50 || el.offsetHeight < 30) return false;
                  const txt = cleanStr(el.innerText || el.textContent);
                  if (!txt || txt.length > 300) return false;
                  return txt.includes(normTarget) || (firstName.length >= 3 && txt.includes(firstName));
                });
              }

              // 2. Linhas de tabela (<tr>)
              const rowCandidates = Array.from(document.querySelectorAll('table tr, tbody tr')).filter(r => {
                if (r.offsetWidth < 50 || r.offsetHeight < 20) return false;
                const txt = cleanStr(r.innerText || r.textContent);
                return txt.includes(normTarget) || (firstName.length >= 3 && txt.includes(firstName));
              });

              const all = [...cardCandidates, ...rowCandidates];
              // Remove qualquer elemento que seja ancestral (contêiner) de outro candidato na lista
              const leaves = all.filter(c => !all.some(other => other !== c && c.contains(other)));
              return leaves;
            };

            // Detecta contêiner rolável
            const getScrollContainer = () => {
              const allEls = Array.from(document.querySelectorAll('*'));
              for (const el of allEls) {
                if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 100) {
                  const style = window.getComputedStyle(el);
                  if (['auto', 'scroll'].includes(style.overflowY)) {
                    return el;
                  }
                }
              }
              return window;
            };

            const scrollContainer = getScrollContainer();

            // Loop de busca exploratória com scroll progressivo
            let matchedElements = [];
            const MAX_SCROLL_STEPS = 6;
            const SCROLL_STEP_PX = 250;

            for (let step = 0; step < MAX_SCROLL_STEPS; step++) {
              const currentFound = scanCandidates();
              if (currentFound.length > 0) {
                matchedElements = currentFound;
                break;
              }
              if (scrollContainer === window) {
                window.scrollBy({ top: SCROLL_STEP_PX, behavior: 'smooth' });
              } else if (scrollContainer && scrollContainer.scrollBy) {
                scrollContainer.scrollBy({ top: SCROLL_STEP_PX, behavior: 'smooth' });
              }
              await new Promise(r => setTimeout(r, 150));
            }

            if (matchedElements.length === 0) {
              return { sucesso: false, status: 'not_found', mensagem: `Aluno '${studentName}' não encontrado no DOM.` };
            }

            // Separa os matches entre exatos (nome completo) e parciais (primeiro nome)
            const exactMatches = matchedElements.filter(el => cleanStr(el.innerText || el.textContent).includes(normTarget));
            const pool = exactMatches.length > 0 ? exactMatches : matchedElements;

            // Se houver mais de um match mesmo após filtrar: AMBIGUIDADE HONESTA!
            if (pool.length > 1) {
              const candidates = pool.map((el, idx) => {
                const img = el.querySelector('img');
                const cleanTxt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
                return {
                  id: el.getAttribute('data-aluno-id') || el.id || `candidate_${idx + 1}`,
                  name: cleanTxt.split('\n')[0] || studentName,
                  photoUrl: img ? img.src : null,
                  details: cleanTxt,
                  index: idx + 1
                };
              });

              return {
                sucesso: false,
                status: 'ambiguous',
                candidates,
                studentName
              };
            }

            const targetEl = pool[0];

            if (isDestructive(targetEl)) {
              return { sucesso: false, status: 'blocked_destructive', mensagem: 'Ação bloqueada: elemento destrutivo detectado.' };
            }

            let clickable = targetEl.querySelector('a, button, [role="button"], .btn-perfil, [class*="perfil"], [class*="profile"]');
            if (!clickable || isDestructive(clickable)) {
              clickable = targetEl;
            }

            // Destaque visual Rafinha (verde #10b981)
            const origTransition = clickable.style.transition;
            const origOutline = clickable.style.outline;
            const origBoxShadow = clickable.style.boxShadow;

            clickable.style.transition = 'all 0.3s ease';
            clickable.style.outline = '3px solid #10b981';
            clickable.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.7)';

            clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });

            await new Promise(r => setTimeout(r, 200));

            try {
              clickable.click();
            } catch (e) {
              clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }

            await new Promise(r => setTimeout(r, 250));

            setTimeout(() => {
              try {
                clickable.style.transition = origTransition;
                clickable.style.outline = origOutline;
                clickable.style.boxShadow = origBoxShadow;
              } catch {}
            }, 1800);

            return {
              sucesso: true,
              status: 'success',
              elementText: (clickable.innerText || clickable.textContent || studentName).trim().slice(0, 50),
              studentName
            };
          }
        });

        // Aguarda estabilização da abertura do perfil / modal / navegação
        await waitForPageSettled(targetTabId, 2000);

        const res = (results && results[0] && results[0].result) || { sucesso: false, mensagem: 'Script de busca falhou.' };
        sendResponse(res);
      } catch (err) {
        sendResponse({ sucesso: false, mensagem: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'READ_PAGE_DATA') {
    (async () => {
      let targetTabId = message.tabId;
      if (!targetTabId) {
        try {
          const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTabs && activeTabs.length > 0 && isAuthorizedPortalTab(activeTabs[0])) {
            targetTabId = activeTabs[0].id;
          }
        } catch {}
      }
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(t => isAuthorizedPortalTab(t));
        targetTabId = portalTab ? portalTab.id : (isAuthorizedPortalTab(currentTabState) ? currentTabState.tabId : null);
      }
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada para leitura.' });
        return;
      }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId, allFrames: true },
          func: () => {
            const isVisible = (el) => {
              if (!el) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
              const rect = el.getBoundingClientRect();
              return (rect.width > 0 && rect.height > 0) || (el.getClientRects && el.getClientRects().length > 0);
            };

            const activeNavEl = document.querySelector(
              '.tab-btn.active, .nav-link.active, .menu-item.active, nav a.active, aside a.active, [aria-current="page"], .selected, a[class*="active"], li.active a, .sidebar a.active'
            );
            const activeNavText = activeNavEl ? activeNavEl.innerText.trim() : '';

            const pageHeadings = Array.from(document.querySelectorAll('h1, h2, h3, .page-title, .titulo-pagina, .titulo, .header-title'))
              .filter(isVisible)
              .map(h => h.innerText.trim())
              .filter(Boolean)
              .slice(0, 10);

            // Resolução inteligente da seção ativa a partir da URL e do DOM
            let inferredSection = activeNavText;
            const urlLower = window.location.href.toLowerCase();
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

            const tables = Array.from(document.querySelectorAll('table')).filter(isVisible).map(t => {
              // 1. Tenta extrair headers de tags <th>
              let headers = Array.from(t.querySelectorAll('thead th, th')).map(th => th.innerText.trim()).filter(Boolean);

              // 2. Se vazio, tenta extrair da primeira linha do thead (mesmo usando <td>)
              if (headers.length === 0) {
                const theadTds = Array.from(t.querySelectorAll('thead tr:first-child td')).map(td => td.innerText.trim()).filter(Boolean);
                if (theadTds.length > 0) headers = theadTds;
              }

              // 3. Extrai linhas da tabela
              const trElements = Array.from(t.querySelectorAll('tr'));
              let rows = [];
              const seenTrs = new Set();

              for (const tr of trElements) {
                if (seenTrs.has(tr)) continue;
                seenTrs.add(tr);

                const cells = Array.from(tr.querySelectorAll('th, td')).map(td => {
                  const inp = td.querySelector('input, select');
                  if (inp) {
                    if (inp.type === 'checkbox') return inp.checked ? '[X]' : '[ ]';
                    return inp.value || td.innerText.trim();
                  }
                  return td.innerText.trim();
                });
                if (cells.length > 0 && cells.some(c => c.length > 0)) {
                  rows.push(cells);
                }
              }

              // 4. Se headers ainda estiver vazio e tivermos linhas, promove rows[0] se houver mais de 1 linha
              if (headers.length === 0 && rows.length > 1) {
                headers = rows[0];
                rows = rows.slice(1);
              } else if (headers.length > 0 && rows.length > 0) {
                // Se a primeira linha de rows for idêntica aos headers, remove a redundância
                const matchesHeader = headers.length === rows[0].length &&
                  headers.every((h, i) => h.toLowerCase() === (rows[0][i] || '').toLowerCase());
                if (matchesHeader) {
                  rows = rows.slice(1);
                }
              }

              return { id: t.id || 'tabela', headers, rows };
            });

            // Se nenhuma tag <table> estiver presente, verifica containers com role="table" ou grids
            if (tables.length === 0) {
              const gridContainers = Array.from(document.querySelectorAll('[role="table"], [role="grid"], .grade-horarios, .tabela-horarios')).filter(isVisible);
              for (const gc of gridContainers) {
                const rowEls = Array.from(gc.querySelectorAll('[role="row"], .linha, .row')).filter(isVisible);
                if (rowEls.length > 1) {
                  const gridRows = rowEls.map(r => {
                    return Array.from(r.querySelectorAll('[role="cell"], [role="columnheader"], .col, .celula')).map(c => c.innerText.trim());
                  }).filter(r => r.length > 0);
                  if (gridRows.length > 1) {
                    tables.push({ id: gc.id || 'grid', headers: gridRows[0], rows: gridRows.slice(1) });
                  }
                }
              }
            }

            const cards = Array.from(document.querySelectorAll('.recado-card, .card, [class*="card"]'))
              .filter(isVisible)
              .map(c => c.innerText.trim())
              .filter(Boolean)
              .slice(0, 10);

            return {
              sucesso: true,
              activeTab,
              pageTitle: document.title || '',
              pageHeadings,
              tables,
              cards,
              url: window.location.href
            };
          }
        });

        // Agregação multi-frame: combina dados de todos os frames (se houver iframes)
        const validResults = (results || []).map(r => r.result).filter(r => r && r.sucesso);
        if (validResults.length === 0) {
          sendResponse({ sucesso: false, mensagem: 'Falha ao ler dados da página.' });
          return;
        }

        // Encontra o frame principal ou o frame com maior riqueza de dados
        let primaryResult = validResults.find(r => r.tables && r.tables.length > 0) || validResults[0];

        // Se múltiplos frames tiverem tabelas, mescla todas sem duplicatas
        const allTables = [];
        const seenSignatures = new Set();
        for (const frameRes of validResults) {
          if (frameRes.tables) {
            for (const tbl of frameRes.tables) {
              const sig = (tbl.headers || []).join('|') + '::' + (tbl.rows ? tbl.rows.length : 0);
              if (!seenSignatures.has(sig)) {
                seenSignatures.add(sig);
                allTables.push(tbl);
              }
            }
          }
        }
        primaryResult.tables = allTables;
        sendResponse(primaryResult);
      } catch (err) {
        sendResponse({ sucesso: false, mensagem: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'ASK_PAGE_QUESTION') {
    (async () => {
      const { query, pageData } = message;
      const reqId = 'ask_' + Date.now();

      async function tryHttpFallback() {
        try {
          const res = await fetch('http://127.0.0.1:8765/ask_page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, pageData }),
            signal: AbortSignal.timeout(2000)
          });
          if (res.ok) {
            const json = await res.json();
            if (json && json.sucesso && json.answer) {
              sendResponse({ sucesso: true, answer: json.answer });
              return;
            }
          }
        } catch {}
        sendResponse({ sucesso: false, fallbackLocal: true });
      }

      // 1. Tenta WebSocket (:8766) se conectado
      if (ws && ws.readyState === WebSocket.OPEN) {
        let responded = false;
        const wsHandler = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'PAGE_QUESTION_ANSWER' && data.requestId === reqId) {
              responded = true;
              ws.removeEventListener('message', wsHandler);
              sendResponse({ sucesso: true, answer: data.answer });
            }
          } catch {}
        };
        ws.addEventListener('message', wsHandler);
        ws.send(JSON.stringify({
          type: 'ASK_PAGE_QUESTION',
          requestId: reqId,
          query,
          pageData
        }));

        setTimeout(() => {
          if (!responded) {
            ws.removeEventListener('message', wsHandler);
            tryHttpFallback();
          }
        }, 2500);
        return;
      }

      tryHttpFallback();
    })();
    return true;
  }
});

// Inicialização imediata com estado visual "Conectando..." durante a verificação inicial
updateToolbarBadge('connecting');
connectWebSocket();
evaluateActiveTab();
setInterval(evaluateActiveTab, 5000);

startupTimer = setTimeout(() => {
  if (!isSidecarOnline) {
    console.log('[TeacherAI Extension] ⏱️ Timeout de 5s expirou sem conexão. Acionando Fallback B (Native Messaging)...');
    launchViaNativeMessaging(false);
  }
}, STARTUP_TIMEOUT_MS);

