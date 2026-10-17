// background.js — Service Worker TeacherAI v3.1
// WebSocket Bridge + Monitor de Status de Portais Escolares (Toolbar Icon) + Automação na Mesma Aba

let PortalNormalizer = typeof globalThis !== 'undefined' ? globalThis.PortalNormalizer : null;
try {
  if (!PortalNormalizer && typeof importScripts === 'function') {
    importScripts('portal_normalizer.js');
    PortalNormalizer = globalThis.PortalNormalizer;
  }
} catch (e) {}
if (!PortalNormalizer && typeof require === 'function') {
  try { PortalNormalizer = require('./portal_normalizer.js'); } catch (e) {}
}

let PortalDOMReader = typeof globalThis !== 'undefined' ? globalThis.PortalDOMReader : null;
try {
  if (!PortalDOMReader && typeof importScripts === 'function') {
    importScripts('portal_dom_reader.js');
    PortalDOMReader = globalThis.PortalDOMReader;
  }
} catch (e) {}
if (!PortalDOMReader && typeof require === 'function') {
  try { PortalDOMReader = require('./portal_dom_reader.js'); } catch (e) {}
}

let composeReply = typeof globalThis !== 'undefined' ? globalThis.composeReply : null;
try {
  if (!composeReply && typeof importScripts === 'function') {
    importScripts('composeReply.js');
    composeReply = globalThis.composeReply;
  }
} catch (e) {}
if (!composeReply && typeof require === 'function') {
  try {
    const mod = require('./composeReply.js');
    composeReply = mod.composeReply;
  } catch (e) {}
}

// ─── CARREGAMENTO DO SKILLGRAPH V2 RUNNER & ORQUESTRADOR ─────────────────────
try {
  if (typeof importScripts === 'function') {
    importScripts('dist/runner.bundle.js');
    importScripts('orchestrator_v2.js');
  }
} catch (e) {
  console.warn('[TeacherAI] Erro ao carregar SkillGraph v2 runner no Service Worker:', e);
}

const WS_URL_PRIMARY = 'ws://127.0.0.1:8766';
const WS_URL_FALLBACK = 'ws://127.0.0.1:8765/status_stream';
const HTTP_STATUS_FALLBACK = 'http://127.0.0.1:8765/portal_status';
const NATIVE_HOST_NAME = 'com.teacherai.desktop';
const STARTUP_TIMEOUT_MS = 5000;

// Lista de portais fixos esvaziada por padrão para conformidade O1 (generalista).
// A detecção é dinâmica baseada no host da aba contra allowed_hosts de grafos ativos.
const KNOWN_PORTALS = [];

let ws = null;
let isSidecarOnline = false;
let isAppConnected = false;
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

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel?.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((err) => console.warn('[TeacherAI Extension] Erro ao configurar openPanelOnActionClick onInstalled:', err));
    }
  });
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

let sidecarAuthToken = null;

async function getOrCreateSidecarAuthToken() {
  if (sidecarAuthToken) return sidecarAuthToken;

  // 1. Tenta carregar do chrome.storage.local
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(['sidecar_auth_token']);
      if (stored && stored.sidecar_auth_token) {
        sidecarAuthToken = stored.sidecar_auth_token;
        return sidecarAuthToken;
      }
    }
  } catch (e) {}

  // 2. Tenta obter via canal seguro do Host Nativo local (passo de pareamento)
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendNativeMessage) {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendNativeMessage(
          NATIVE_HOST_NAME,
          { action: 'get_auth_token' },
          (res) => {
            if (chrome.runtime.lastError || !res || !res.success) {
              resolve(null);
            } else {
              resolve(res);
            }
          }
        );
      });
      if (response && response.token) {
        sidecarAuthToken = response.token;
        await chrome.storage.local.set({ sidecar_auth_token: sidecarAuthToken });
        console.log('[TeacherAI Extension] 🔑 Token de autenticação pareado via canal seguro local.');
        return sidecarAuthToken;
      }
    } catch (err) {
      console.warn('[TeacherAI Extension] Canal de pareamento nativo indisponível:', err);
    }
  }

  return sidecarAuthToken;
}

// ─── GERENCIAMENTO DE WEBSOCKET LOCAL ──────────────────────────────────────────

async function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    const token = await getOrCreateSidecarAuthToken();
    const targetUrl = token ? `${WS_URL_PRIMARY}?token=${encodeURIComponent(token)}` : WS_URL_PRIMARY;
    ws = new WebSocket(targetUrl);

    ws.onopen = () => {
      console.log('[TeacherAI Extension] 🔌 Conectado ao Sidecar via WebSocket (:8766)');
      if (token) {
        try {
          ws.send(JSON.stringify({ type: 'AUTH', token }));
        } catch (e) {}
      }
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
      isSidecarOnline = false;
      updateToolbarBadge('offline');
      if (typeof wsReconnectAttempts === 'undefined') {
        globalThis.wsReconnectAttempts = 0;
      }
      if (globalThis.wsReconnectAttempts < 1) {
        globalThis.wsReconnectAttempts++;
        setTimeout(checkHttpFallbackAndReconnect, 3000);
      } else {
        console.log('[TeacherAI Extension] Modo nativo v2 ativo. Canal prioritário: Chrome Native Messaging (com.teacherai.desktop).');
      }
    };

    ws.onerror = () => {
      isSidecarOnline = false;
      updateToolbarBadge('offline');
    };
  } catch {
    isSidecarOnline = false;
    updateToolbarBadge('offline');
  }
}

async function checkHttpFallbackAndReconnect() {
  try {
    const token = await getOrCreateSidecarAuthToken();
    const headers = token ? { 'X-Sidecar-Token': token } : {};
    const res = await fetch(HTTP_STATUS_FALLBACK, {
      headers,
      signal: AbortSignal.timeout(3000)
    });
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
  try {
    const parsed = new URL(url);
    if (parsed.hostname && !parsed.protocol.startsWith('chrome')) {
      return {
        id: parsed.hostname.replace(/[^a-zA-Z0-9_]/g, '_'),
        name: parsed.hostname,
        domains: [parsed.hostname],
      };
    }
  } catch {}
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
    const msg = (err && err.message) || String(err);
    if (!msg.includes('Cannot access contents') && !msg.includes('Extension manifest must request permission')) {
      console.warn('[TeacherAI Extension] Falha ao executar script de auth:', err);
    }
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
        console.log('[SafeWriter] 💡 Guardião Pedagógico: valor de nota normalizado com sucesso.');
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
    if (!execResult) {
      execResult = {
        sucesso: false,
        status: 'content_script_unavailable',
        mensagem: 'Não foi possível comunicar com o script de conteúdo da página.'
      };
    }

    const isSuccess = Boolean(execResult.sucesso || execResult.success || (execResult.filledCount > 0));
    const normalizedResult = {
      sucesso: isSuccess,
      status: execResult.status || (isSuccess ? 'draft_completed_pending_submit' : 'execution_failed'),
      diff: execResult.diff || {
        aluno,
        campo: acao,
        depois: String(nota ?? faltas ?? '')
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

async function internalNavigatePortalTab(targetTabId, targetKeyword, allowedHosts = [], priorSelectTargets = []) {
  const keyword = (targetKeyword || '').trim().toLowerCase()
    .replace(/\s+\b(?:e\s+depois|depois|em\s+seguida|a[ií])\b.*$/i, '')
    .replace(/\s+e$/i, '')
    .trim();

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'MAIN',
      args: [keyword, Array.isArray(allowedHosts) ? allowedHosts : [], Array.isArray(priorSelectTargets) ? priorSelectTargets : []],
      func: async (kw, allowedHostList, priorTargets) => {
        const stripGoalPrefix = (rawStr) => {
          const rn = String(rawStr || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return rn
            .replace(/^(?:por\s+favor\s+)?(?:selecione|selecionar|escolha|escolher|filtre\s+por|filtrar\s+por|filtrar|ir\s+para|ir\s+em|va\s+para|abrir|abra|clicar\s+no\s+botao|clique\s+no\s+botao|clicar\s+em|clique\s+em|clicar\s+no|clique\s+no|clicar\s+na|clique\s+na|clicar|clique|aperte|apertar|pressione|pressionar|acessar|acesse|ver|mostrar|mudar\s+para)\s+/i, '')
            .replace(/\s+(?:nos\s+filtros|no\s+filtro|na\s+aba|nas\s+abas|no\s+menu|na\s+lista|no\s+campo|no\s+botao|do\s+portal|da\s+pagina)$/i, '')
            .replace(/^(?:a\s+turma|o\s+ano|a\s+disciplina|o\s+mes|a\s+aba|o\s+botao|o\s+filtro\s+de|o\s+filtro)\s+/i, '')
            .trim() || rn;
        };
        const cleanKey = stripGoalPrefix(kw);
        const destructivePattern = /\b(excluir|deletar|apagar|remover|demitir|formatar|pagar|transferir|salvar|gravar|enviar|publicar|confirmar|fechar|fechamento|consolidar|finalizar|encerrar|concluir|cancelar|aprovar|reprovar|assinar|homologar|bloquear|desbloquear|resetar|sair|logout)\b/i;
        if (destructivePattern.test(cleanKey)) {
          return { sucesso: false, mensagem: `Ação bloqueada por segurança durante navegação autônoma: '${kw}'.` };
        }

        const ordinalMap = { primeiro: '1', primeira: '1', segundo: '2', segunda: '2', terceiro: '3', terceira: '3', quarto: '4', quarta: '4', quinto: '5', quinta: '5', sexto: '6', sexta: '6', setimo: '7', setima: '7', oitavo: '8', oitava: '8', nono: '9', nona: '9' };
        const buildOrdinalVariants = (baseKey) => {
          const sp = String(baseKey || '').replace(/[/\-_,.;:]+/g, ' ').replace(/\s+/g, ' ').trim();
          const noYr = sp.replace(/\b20\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
          const set = new Set([baseKey, sp]);
          if (noYr.length >= 3) set.add(noYr);
          const subjPairs = [['lingua inglesa', 'ingles'], ['lingua portuguesa', 'portugues'], ['educacao fisica', 'ed fisica'], ['ensino religioso', 'religiao']];
          for (const [f, s] of subjPairs) {
            if (sp.includes(f)) set.add(sp.replace(f, s));
            if (sp.includes(s)) set.add(sp.replace(s, f));
          }
          for (const [word, digit] of Object.entries(ordinalMap)) {
            if (new RegExp(`\\b${word}\\b`).test(sp)) {
              set.add(sp.replace(new RegExp(`\\b${word}\\b`, 'g'), digit));
              set.add(sp.replace(new RegExp(`\\b${word}\\b`, 'g'), `${digit}o`));
              set.add(sp.replace(new RegExp(`\\b${word}\\b`, 'g'), `${digit}a`));
            } else if (new RegExp(`\\b${digit}[º°oaª]?\\b`).test(sp)) {
              set.add(sp.replace(new RegExp(`\\b${digit}[º°oaª]?\\b`, 'g'), word));
              set.add(sp.replace(new RegExp(`\\b${digit}[º°oaª]?\\b`, 'g'), digit));
            }
          }
          return Array.from(set).filter(Boolean);
        };

        const effectiveAllowedHosts = (Array.isArray(allowedHostList) && allowedHostList.length > 0
          ? allowedHostList
          : [location.host, location.hostname]
        ).map(h => String(h || '').toLowerCase()).filter(Boolean);

        const isHrefAllowed = (el) => {
          const anchor = el.tagName === 'A' ? el : (el.closest ? el.closest('a') : null);
          const rawHref = (el.getAttribute && el.getAttribute('href')) || (anchor && anchor.getAttribute('href')) || '';
          if (!rawHref || rawHref.startsWith('#') || rawHref.toLowerCase().startsWith('javascript:')) return true;
          try {
            const parsed = new URL(rawHref, location.href);
            const h = (parsed.host || '').toLowerCase();
            const hn = (parsed.hostname || '').toLowerCase();
            return effectiveAllowedHosts.some(allowed => allowed === '*' || allowed === h || allowed === hn || hn.endsWith('.' + allowed));
          } catch {
            return false;
          }
        };

        const collectClickableCandidates = (root) => {
          const selector = 'a, button, input[type="button"], input[type="submit"], [onclick], [role="tab"], [role="menuitem"], [role="button"], [role="option"], .btn, .button, .tab, .tab-btn, .nav-link, li, span';
          const list = Array.from(root.querySelectorAll(selector));
          const all = Array.from(root.querySelectorAll('*'));
          for (const node of all) {
            let sr = null;
            try {
              sr = (globalThis.chrome?.dom?.openOrClosedShadowRoot?.(node)) || node.shadowRoot || node.__sgv2ShadowRoot;
            } catch {
              sr = node.shadowRoot || node.__sgv2ShadowRoot;
            }
            if (sr) list.push(...collectClickableCandidates(sr));
          }
          return list;
        };

        const isOptUsable = (opt, sel) => {
          if (!opt || opt.disabled || opt.hidden || sel.disabled || opt.style?.display === 'none' || opt.style?.visibility === 'hidden') return false;
          const p = opt.parentElement;
          if (p?.tagName === 'OPTGROUP' && (p.disabled || p.hidden || p.style?.display === 'none')) return false;
          try { const cs = window.getComputedStyle(opt); if (cs?.display === 'none' || cs?.visibility === 'hidden') return false; } catch {}
          return true;
        };
        const findBestSelectMatch = (searchKey) => {
          const variants = buildOrdinalVariants(searchKey).map(v => v.replace(/[º°ª]/g, ''));
          const selects = Array.from(document.querySelectorAll('select')).filter(s => {
            if (s.disabled || (s.offsetParent === null && s.offsetWidth === 0 && s.offsetHeight === 0)) return false;
            if (s.closest && s.closest('tbody tr')) return false;
            return true;
          });
          const matches = [];
          for (const sel of selects) {
            for (const opt of Array.from(sel.options || [])) {
              if (!isOptUsable(opt, sel)) continue;
              const rawText = (opt.text || opt.label || '').trim();
              const normOpt = rawText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[º°ª]/g, '').replace(/[/\-_,.;:]+/g, ' ').replace(/\s+/g, ' ').trim();
              if (!normOpt || /^selecione\b/i.test(normOpt)) continue;
              for (const v of variants) {
                let sc = 0;
                if (normOpt === v) sc = 100;
                else if (normOpt.startsWith(v) || normOpt.includes(v)) sc = 88;
                else if (normOpt.length >= 4 && v.includes(normOpt)) sc = 84;
                else {
                  const tks = v.split(/\s+/).filter(t => t.length >= 1 && !['de', 'da', 'do', 'ano'].includes(t));
                  if (tks.length > 0 && tks.every(t => new RegExp(`(?:^|\\b)${t}`).test(normOpt))) sc = 82;
                }
                if (sc >= 75) { matches.push({ sel, opt, sc }); break; }
              }
            }
          }
          matches.sort((a, b) => b.sc - a.sc);
          return matches[0] ? { sel: matches[0].sel, opt: matches[0].opt, candidates: matches.filter(m => m.sel === matches[0].sel).map(m => m.opt) } : null;
        };

        const PORTAL_SEMANTIC_CLUSTERS = [
          ['notas', 'avaliacoes', 'avaliacao', 'conceitos', 'boletim', 'medias', 'digitacao de notas', 'rendimento', 'notas e faltas'],
          ['frequencia', 'chamada', 'fazer chamada', 'faltas', 'presenca', 'assiduidade', 'registro de presenca', 'diario de frequencia', 'apontamento de faltas'],
          ['conteudo', 'conteudo ministrado', 'aula dada', 'plano de aula', 'registro de aula', 'materia lecionada', 'diario de classe'],
          ['alunos', 'discentes', 'estudantes', 'meus alunos', 'relacao nominal', 'enturmacao', 'lista de alunos', 'turmas', 'minhas turmas'],
          ['ocorrencias', 'observacoes', 'ficha individual', 'parecer descritivo', 'acompanhamento pedagogico', 'comportamento'],
        ];

        const expandSemanticSynonyms = (key) => {
          const synonyms = new Set(buildOrdinalVariants(key));
          for (const cluster of PORTAL_SEMANTIC_CLUSTERS) {
            if (cluster.some(term => key.includes(term) || term.includes(key))) {
              for (const term of cluster) synonyms.add(term);
            }
          }
          return Array.from(synonyms);
        };

        const findBestCandidate = (searchKey) => {
          const candidates = collectClickableCandidates(document);
          const expandedKeys = expandSemanticSynonyms(searchKey);
          const stopWords = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'em', 'na', 'no', 'as', 'os', 'a', 'o', 'e']);
          const searchTokens = searchKey.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t));

          let bestEl = null;
          let bestScore = -1;

          for (const el of candidates) {
            if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;

            const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const aria = (el.getAttribute('aria-label') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const title = (el.getAttribute('title') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const href = (el.getAttribute('href') || '').toLowerCase();
            const id = (el.id || '').toLowerCase();

            if (destructivePattern.test(text) || destructivePattern.test(aria) || destructivePattern.test(title) || !isHrefAllowed(el)) {
              continue;
            }

            let score = 0;
            if (text === searchKey) score = 100;
            else if (text.startsWith(searchKey)) score = 85;
            else if (text.includes(searchKey)) score = 70;
            else if (aria.includes(searchKey)) score = 55;
            else if (title.includes(searchKey)) score = 45;
            else if (id.includes(searchKey)) score = 35;
            else if (href.includes(searchKey)) score = 25;

            // Match semântico por cluster de sinônimos pedagógicos (ex.: "notas" -> "Digitação de Notas")
            // Exige texto com >= 4 caracteres e sinônimo CONTIDO no texto (nunca o inverso: "de" ⊂ "consolidacao de etapa")
            if (score === 0 && text.length >= 4 && text.length <= 60) {
              for (const syn of expandedKeys) {
                if (syn === searchKey || syn.length < 4) continue;
                if (text === syn) { score = Math.max(score, 75); break; }
                if (text.includes(syn)) { score = Math.max(score, 58); }
                else if (aria.includes(syn) || title.includes(syn)) { score = Math.max(score, 42); }
              }
            }

            // Match por sobreposição de tokens significativos
            if (score === 0 && searchTokens.length > 0 && text.length > 0 && text.length <= 60) {
              const matchedTokens = searchTokens.filter(tk => text.includes(tk) || aria.includes(tk));
              if (matchedTokens.length > 0) {
                score = Math.round((matchedTokens.length / searchTokens.length) * 50);
              }
            }

            if (score > 0) {
              if (el.getAttribute('role') === 'tab' || el.classList.contains('tab') || el.classList.contains('nav-link')) {
                score += 15;
              }
              if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
                score += 10;
              }
              // Anti-Loop (Browser-Use pattern): penaliza elementos já clicados para o mesmo objetivo nesta tela
              if (el.getAttribute('data-tai-explored') === searchKey) {
                score -= 45;
              }
            }

            if (score > bestScore && score >= 20) {
              bestScore = score;
              bestEl = el;
            }
          }
          return bestEl;
        };

        const applySelectAndWait = async (sel, opt, optList) => {
          const pool = Array.isArray(optList) && optList.length > 0 ? optList : [opt];
          let chosen = opt;
          for (const cOpt of pool.slice(0, 6)) {
            chosen = cOpt;
            try {
              const ns = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
              if (ns) ns.call(sel, cOpt.value); else sel.value = cOpt.value;
              Array.from(sel.options || []).forEach((o, i) => { o.selected = (i === cOpt.index); });
              if (typeof cOpt.index === 'number' && cOpt.index >= 0) sel.selectedIndex = cOpt.index;
              cOpt.selected = true;
            } catch { sel.value = cOpt.value; }
            let mutated = false;
            const obs = new MutationObserver(() => { mutated = true; });
            try { obs.observe(document.body, { childList: true, subtree: true }); } catch {}
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            try { const jq = window.jQuery || window.$; if (typeof jq === 'function') jq(sel).trigger('change'); } catch {}
            await new Promise(r => setTimeout(r, 400));
            if (mutated) await new Promise(r => setTimeout(r, 350));
            try { obs.disconnect(); } catch {}
            if (sel.selectedIndex === cOpt.index || sel.options?.[sel.selectedIndex] === cOpt) break;
          }
          return chosen;
        };
        const reconcilePriorSelects = async (targets) => {
          for (const rawT of (targets || [])) {
            const pk = stripGoalPrefix(rawT);
            const m = pk ? findBestSelectMatch(pk) : null;
            if (m?.sel && m?.opt) {
              const curTxt = (m.sel.options?.[m.sel.selectedIndex]?.text || '').trim();
              const wantTxt = (m.opt.text || m.opt.label || '').trim();
              if (curTxt !== wantTxt) await applySelectAndWait(m.sel, m.opt, m.candidates);
            }
          }
        };

        const hops = [];
        let selectMatch = null;
        let bestElement = null;
        for (let attempt = 0; attempt < 8; attempt++) {
          selectMatch = findBestSelectMatch(cleanKey);
          if (selectMatch && selectMatch.sel && selectMatch.opt) break;
          bestElement = findBestCandidate(cleanKey);
          if (bestElement) break;
          await new Promise(r => setTimeout(r, 250));
        }
        if (selectMatch && selectMatch.sel && selectMatch.opt) {
          const { sel, opt, candidates } = selectMatch;
          sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sel.style.outline = '2px solid #38bdf8';
          const chosenOpt = await applySelectAndWait(sel, opt, candidates);
          await reconcilePriorSelects([...(priorTargets || []), kw]);
          const optText = (chosenOpt.text || chosenOpt.label || kw).trim();
          const placeholderOpt = sel.options && sel.options[0] ? (sel.options[0].text || '').trim() : '';
          const selectAriaLabel = sel.getAttribute('aria-label') || '';
          const selectLabel = selectAriaLabel || sel.getAttribute('title') || placeholderOpt || sel.name || sel.id || 'Filtro';
          const hop = { kind: 'select', elementText: optText, selectValue: String(chosenOpt.value ?? ''), selectId: sel.id || '', selectName: sel.name || '', selectAriaLabel, selectLabel, tag: 'SELECT', target: kw };
          return { sucesso: true, kind: 'select', elementText: optText, tag: 'SELECT', target: kw, hops: [hop] };
        }

        // Se o item de submenu não está visível diretamente, tenta expandir um menu pai relacionado (Hop intermediário)
        if (!bestElement) {
          const parentMenuKeywords = ['diario', 'academico', 'ensino', 'avaliacao', 'turma', 'aluno', 'menu', 'secretaria'];
          const expandableMenus = collectClickableCandidates(document).filter(el => {
            if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
            const txt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (destructivePattern.test(txt)) return false;
            const isExpandable =
              el.getAttribute('aria-expanded') === 'false' ||
              el.getAttribute('aria-haspopup') === 'true' ||
              el.classList.contains('dropdown-toggle') ||
              el.classList.contains('has-submenu') ||
              parentMenuKeywords.some(pk => txt === pk || txt.startsWith(pk));
            return isExpandable;
          });

          for (const parentEl of expandableMenus.slice(0, 3)) {
            const parentTxt = (parentEl.innerText || parentEl.textContent || 'Menu').trim();
            try { parentEl.click(); } catch {}
            await new Promise(r => setTimeout(r, 220));
            const revealed = findBestCandidate(cleanKey);
            if (revealed) {
              hops.push({ elementText: parentTxt, tag: parentEl.tagName, target: parentTxt });
              bestElement = revealed;
              break;
            }
          }
        }

        if (!bestElement) {
          return { sucesso: false, mensagem: `Não encontrei nenhuma aba ou link correspondente a '${kw}'.` };
        }

        await reconcilePriorSelects(priorTargets || []);

        const origTransition = bestElement.style.transition;
        const origOutline = bestElement.style.outline;
        const origBoxShadow = bestElement.style.boxShadow;

        bestElement.style.transition = 'all 0.3s ease';
        bestElement.style.outline = '2px solid #38bdf8';
        bestElement.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.6)';

        bestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 120));

        try {
          bestElement.setAttribute('data-tai-explored', cleanKey);
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

        const finalHop = {
          elementText: (bestElement.innerText || bestElement.textContent || bestElement.value || kw).trim(),
          tag: bestElement.tagName,
          target: kw
        };
        hops.push(finalHop);

        return {
          sucesso: true,
          elementText: finalHop.elementText,
          tag: finalHop.tag,
          target: kw,
          hops
        };
      }
    });

    await waitForPageSettled(targetTabId, 3000);
    return (results && results[0] && results[0].result) || { sucesso: false, mensagem: 'Script de navegação falhou.' };
  } catch (err) {
    return { sucesso: false, mensagem: err.message };
  }
}
globalThis.internalNavigatePortalTab = internalNavigatePortalTab;



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
        if (typeof PortalDOMReader !== 'undefined' && PortalDOMReader.extractStudents) {
          const res = PortalDOMReader.extractStudents(document);
          if (res && res.length > 0) return res;
        }

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
  // Delega mensagens do SkillGraph v2 diretamente ao orquestrador v2
  if (typeof handleSkillGraphMessage === 'function' && handleSkillGraphMessage(message, sender, sendResponse)) {
    return true;
  }

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
        isSidecarOnline: Boolean(isAppConnected || isSidecarOnline),
        isAppConnected,
        tabState: currentTabState,
        startupMethod,
        bothStartupMethodsFailed,
        isLaunchingViaNative,
        isConnecting: Boolean(!isAppConnected && !isSidecarOnline && (startupTimer || isLaunchingViaNative))
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
        isSidecarOnline: Boolean(isAppConnected || isSidecarOnline),
        isAppConnected,
        tabState: currentTabState,
        startupMethod,
        bothStartupMethodsFailed,
        isLaunchingViaNative,
        isConnecting: Boolean(!isAppConnected && !isSidecarOnline && (startupTimer || isLaunchingViaNative))
      });
    })();
    return true;
  }

  // ─── CANAL NATIVE MESSAGING COM APP DESKTOP (FASE 6) ───────────────────────
  if (message.action === 'DESKTOP_GET_STATUS') {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { v: 1, id: 'req_' + Date.now(), method: 'app.status', params: {} },
        (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            isAppConnected = false;
            sendResponse({ success: false, error: chrome.runtime.lastError?.message || response?.error?.message });
          } else {
            isAppConnected = true;
            isSidecarOnline = true;
            sendResponse(response);
          }
        }
      );
    } catch (err) {
      isAppConnected = false;
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (message.action === 'DESKTOP_LIST_STUDENTS') {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { v: 1, id: 'req_' + Date.now(), method: 'students.list', params: message.payload || {} },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (message.action === 'DESKTOP_UPSERT_ROSTER') {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { v: 1, id: 'req_' + Date.now(), method: 'students.upsertRoster', params: message.payload || {} },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (message.action === 'DESKTOP_PARSE_NLU') {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { v: 1, id: 'req_' + Date.now(), method: 'nlu.parse', params: { text: message.text || '' } },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  // ─── RELAY DE FERRAMENTAS DO APP PARA A EXTENSÃO (ARQUITETURA UNIFICADA) ───
  if (message.action === 'RELAY_TOOL_EXECUTION') {
    (async () => {
      const payload = message.payload || {};
      const { tool, params, portalId } = payload;

      // ─── GUARDA RESTRITA SKILLGRAPH V2: PROIBIDO CAIR EM SELETOR FIXO ───
      const useV2 = await new Promise((r) => {
        chrome.storage.local.get(['USE_SKILLGRAPH_V2'], (res) => r(Boolean(res?.USE_SKILLGRAPH_V2)));
      });

      if (useV2) {
        const graphKey = params?.task_id || tool;
        const graph = params?.skillGraph || null;

        if (!graph) {
          sendResponse({
            success: false,
            mapNotFound: true,
            verified: false,
            error: 'Mapa para esta ação não encontrado. Deseja gravar uma demonstração?',
            friendlyMessage: 'Mapa para esta ação não encontrado. Deseja gravar uma demonstração?'
          });
          return;
        }

        if (typeof handleSkillGraphMessage === 'function') {
          handleSkillGraphMessage({
            action: 'SKILLGRAPH_RUN',
            payload: { graph, initialVariables: params?.variables || {} }
          }, sender, (v2Res) => {
            sendResponse({
              success: v2Res.success,
              verified: v2Res.success,
              error: v2Res.success ? undefined : v2Res.friendlyMessage,
              friendlyMessage: v2Res.friendlyMessage
            });
          });
          return;
        }
      }

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
          const graph = params?.skillGraph || params?.graph;
          if (!graph) {
            sendResponse({
              ok: false,
              code: "MAP_NOT_FOUND",
              message: "Mapa não encontrado para este portal. Grave ou importe um mapa no painel."
            });
            return;
          }
          chrome.tabs.sendMessage(targetTabId, {
            action: 'EXECUTE_SKILL_GRAPH',
            skillGraph: graph
          }, (graphResp) => {
            if (chrome.runtime.lastError || !graphResp?.ok) {
              sendResponse({
                ok: false,
                code: "MAP_NOT_FOUND",
                message: "Mapa não encontrado para este portal. Grave ou importe um mapa no painel."
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
              message: actionResp?.mensagem || actionResp?.message || 'Campos preenchidos no DOM do portal.'
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
      const navTargetRaw    = p.navTarget    || '';
      const subNavTargetRaw = p.subNavTarget || '';
      const trace = [];

      try {
        // 1. Navegação explícita de aba (sem heurísticas ou inferências por título)
        if (navTargetRaw) {
          console.log(`[EXECUTE_PORTAL_ACTION] Navegando para aba explícita '${navTargetRaw}'...`);
          const navRes = await internalNavigatePortalTab(targetTabId, navTargetRaw);
          if (navRes && navRes.sucesso) {
            trace.push(`Navegou para aba '${navRes.elementText || navTargetRaw}'`);
            await new Promise(r => setTimeout(r, 400));
          }
        }

        // 1b. Sub-navegação explícita
        if (subNavTargetRaw) {
          console.log(`[EXECUTE_PORTAL_ACTION] Sub-navegação explícita para '${subNavTargetRaw}'...`);
          await new Promise(r => setTimeout(r, 300));
          const subNavRes = await internalNavigatePortalTab(targetTabId, subNavTargetRaw);
          if (subNavRes && subNavRes.sucesso) {
            trace.push(`Sub-navegou para '${subNavRes.elementText || subNavTargetRaw}'`);
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
          mensagemFinal = domActionRes?.mensagem || 'Campos preenchidos no DOM do portal.';
        } else if (navTargetRaw && trace.length > 0) {
          const subLabel = subNavTargetRaw ? ` › ${subNavTargetRaw}` : '';
          mensagemFinal = `Aba "${navTargetRaw}${subLabel}" acessada: ${trace.join(' → ')}`;
        } else if (students.length > 0) {
          const classLabel = classRef ? `da turma ${classRef}` : '';
          const subjMsg = subjectFound ? ` (${subjectFound})` : '';
          mensagemFinal = `Aba Frequência ${classLabel}${subjMsg}: ${students.length} alunos listados na tela.`;
        } else if (turmaSelected) {
          mensagemFinal = `Filtros selecionados no portal: ${trace.join(' → ')}.`;
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


  if (message.action === 'PORTAL_OBSERVE' || message.action === 'PORTAL_SET_SELECT' || message.action === 'PORTAL_CLICK') {
    (async () => {
      const targetTabId = await resolveActivePortalTab(message.tabId);
      if (!targetTabId) {
        sendResponse({ ok: false, error: 'Nenhuma aba ativa do portal identificada.' });
        return;
      }
      chrome.tabs.sendMessage(targetTabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(resp);
        }
      });
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
            if (typeof PortalDOMReader !== 'undefined' && PortalDOMReader.readPortalPage) {
              try {
                const parsed = PortalDOMReader.readPortalPage(document);
                if (parsed && parsed.sucesso) return parsed;
              } catch (e) {}
            }

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

        if (typeof PortalDOMReader !== 'undefined' && PortalDOMReader.aggregateFrameResults) {
          try {
            const aggregated = PortalDOMReader.aggregateFrameResults(validResults);
            if (aggregated && aggregated.sucesso) {
              sendResponse(aggregated);
              return;
            }
          } catch (e) {}
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

// Inicialização: se em modo SkillGraph v2, prioriza Chrome Native Messaging (zero portas TCP)
chrome.storage.local.get(['USE_SKILLGRAPH_V2'], (res) => {
  const useV2 = res && res.USE_SKILLGRAPH_V2 !== false;
  if (!useV2) {
    updateToolbarBadge('connecting');
    connectWebSocket();
    startupTimer = setTimeout(() => {
      if (!isSidecarOnline) {
        console.log('[TeacherAI Extension] Timeout expirou sem conexão com sidecar.');
      }
    }, STARTUP_TIMEOUT_MS);
  } else {
    console.log('[TeacherAI Extension] SkillGraph v2 ativado. Canal principal: Chrome Native Messaging (zero portas TCP).');
    updateToolbarBadge('online');
  }
});

evaluateActiveTab();
setInterval(evaluateActiveTab, 5000);

