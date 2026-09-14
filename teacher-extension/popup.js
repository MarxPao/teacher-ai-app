// popup.js — Lógica de Exibição de Status do Assistente Teacher AI

document.addEventListener('DOMContentLoaded', () => {
  const indicator = document.getElementById('statusIndicator');
  const icon = document.getElementById('statusIcon');
  const title = document.getElementById('statusTitle');
  const desc = document.getElementById('statusDesc');

  const detailPortal = document.getElementById('detailPortal');
  const detailPage = document.getElementById('detailPage');
  const detailAuth = document.getElementById('detailAuth');

  const btnOpenChat = document.getElementById('btnOpenChat');
  const btnReconnect = document.getElementById('btnReconnect');

  let isBothFailed = false;

  function renderState(data) {
    indicator.className = 'status-indicator';
    isBothFailed = Boolean(data && data.bothStartupMethodsFailed);

    if (!data || !data.isSidecarOnline) {
      if (data && (data.isConnecting || data.isLaunchingViaNative)) {
        // 🔵 Estado Visual: Conectando... (Transição Caminho A -> Caminho B)
        indicator.classList.add('connecting');
        icon.textContent = '⏳';
        title.textContent = 'Conectando ao assistente...';
        title.style.color = '#3b82f6';
        desc.textContent = data.isLaunchingViaNative
          ? 'Iniciando o Teacher AI em segundo plano para você. Só alguns segundos...'
          : 'Verificando e conectando com o assistente Teacher AI...';
        btnReconnect.textContent = '🔄 Conectando...';
        detailAuth.textContent = 'Conectando...';
        detailAuth.style.color = '#3b82f6';
      } else if (isBothFailed) {
        // 🧡 Caminho C: Contingência Humana e Acolhedora (Zero Jargão Técnico)
        indicator.classList.add('needs_login');
        icon.textContent = '🦉';
        title.textContent = 'Preciso de uma ajuda';
        title.style.color = '#f59e0b';
        desc.innerHTML = 'Não consegui iniciar o assistente automaticamente.<br><br>Você pode <strong>clicar duas vezes no ícone Teacher AI</strong> na sua Área de Trabalho para iniciá-lo?';
        btnReconnect.textContent = '🔄 Tentar Iniciar Novamente';
        detailAuth.textContent = 'Aguardando Início';
        detailAuth.style.color = '#94a3b8';
        const tab = (data && data.tabState) || {};
        if (tab.isMappedPortal) {
          indicator.classList.remove('offline');
          indicator.classList.add('needs_login');
          icon.textContent = '🌐';
          title.textContent = `Portal ${tab.portalName || ''} Detectado`;
          title.style.color = '#0284c7';
          desc.textContent = 'Portal identificado! Conectando com o assistente Teacher AI no computador...';
          detailPortal.textContent = tab.portalName || 'Portal Escolar';
          detailPage.textContent = tab.friendlyPageName || tab.title || 'Página do Portal';
          detailAuth.textContent = tab.isAuthenticated ? 'Sessão Ativa ✓' : 'Aguardando Assistente';
          detailAuth.style.color = tab.isAuthenticated ? '#10b981' : '#f59e0b';
        } else {
          indicator.classList.add('offline');
          icon.textContent = '✕';
          title.textContent = 'Desconectada';
          title.style.color = '#ef4444';
          desc.textContent = 'Não estou conectada ainda. Verifique se o aplicativo Teacher AI está aberto no computador.';
          detailPortal.textContent = '—';
          detailPage.textContent = '—';
          detailAuth.textContent = 'Desconectada';
          detailAuth.style.color = '#ef4444';
        }
        btnReconnect.textContent = '🔄 Atualizar Conexão';
      }
      return;
    }

    btnReconnect.textContent = '🔄 Atualizar Conexão';
    const tab = data.tabState || {};

    if (tab.pageKind === 'context_selection') {
      // 🔵 Estado Intermediário: Já logou, selecionando filial/ano letivo/turma
      indicator.classList.add('connecting');
      icon.textContent = '🧭';
      title.textContent = 'Seleção de Contexto';
      title.style.color = '#3b82f6';
      desc.textContent = 'Você já fez login! Selecione a Unidade / Ano Letivo e clique em "Avançar" no portal para abrir suas turmas e o diário.';

      detailPortal.textContent = tab.portalName || 'Rede Santa Catarina';
      detailPage.textContent = 'Seleção de Contexto';
      detailAuth.textContent = 'Avançar no Portal ⏳';
      detailAuth.style.color = '#3b82f6';

    } else if (tab.isMappedPortal && tab.isAuthenticated) {
      // 🟢 Estado 1: Conectado e Pronto
      indicator.classList.add('ready');
      icon.textContent = '✓';
      title.textContent = 'Conectado e Pronto!';
      title.style.color = '#10b981';
      desc.textContent = 'Tudo certo! Sessão autenticada. Pronto para operar no portal.';

      detailPortal.textContent = tab.portalName || 'Portal Escolar';
      detailPage.textContent = tab.friendlyPageName || tab.title || 'Painel do Professor';
      detailAuth.textContent = 'Autenticada ✓';
      detailAuth.style.color = '#10b981';

    } else if (tab.isMappedPortal && !tab.isAuthenticated) {
      // 🟡 Estado 2: Portal Reconhecido mas precisa de Login
      indicator.classList.add('needs_login');
      icon.textContent = '!';
      title.textContent = 'Login Necessário';
      title.style.color = '#f59e0b';
      desc.textContent = 'Identifiquei o portal escolar. Digite seu usuário e senha na página para que eu possa continuar.';

      detailPortal.textContent = tab.portalName || 'Portal Escolar';
      detailPage.textContent = tab.friendlyPageName || 'Tela de Login';
      detailAuth.textContent = 'Requer Login ⚠️';
      detailAuth.style.color = '#f59e0b';

    } else {
      // 🟡 Estado 3: Portal Não Reconhecido (Página Externa)
      indicator.classList.add('unrecognized_portal');
      icon.textContent = '?';
      title.textContent = 'Portal Não Reconhecido';
      title.style.color = '#f59e0b';
      desc.textContent = 'Navegador conectado, mas esta aba não é um portal escolar reconhecido pelo assistente.';

      detailPortal.textContent = 'Página Externa';
      detailPage.textContent = tab.friendlyPageName || tab.title || tab.url || 'Aba Ativa';
      detailAuth.textContent = '—';
      detailAuth.style.color = '#94a3b8';
    }
  }

  function fetchState() {
    title.textContent = 'Verificando...';
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        const activeTabId = activeTab ? activeTab.id : null;
        chrome.runtime.sendMessage({ action: 'GET_POPUP_STATE', activeTabId }, (response) => {
          if (chrome.runtime.lastError || !response) {
            renderState({ isSidecarOnline: false });
          } else {
            renderState(response);
          }
        });
      });
    } catch {
      chrome.runtime.sendMessage({ action: 'GET_POPUP_STATE' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          renderState({ isSidecarOnline: false });
        } else {
          renderState(response);
        }
      });
    }
  }

  btnOpenChat.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (err) {
      console.warn('Erro ao abrir Side Panel:', err);
    }
    window.close();
  });

  btnReconnect.addEventListener('click', () => {
    const action = isBothFailed ? 'RETRY_STARTUP' : 'RECONNECT_SIDECAR';
    title.textContent = isBothFailed ? 'Iniciando...' : 'Reconectando...';
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        const activeTabId = activeTab ? activeTab.id : null;
        chrome.runtime.sendMessage({ action, activeTabId }, () => {
          fetchState();
        });
      });
    } catch {
      chrome.runtime.sendMessage({ action }, () => {
        fetchState();
      });
    }
  });

  fetchState();
});
