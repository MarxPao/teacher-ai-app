// popup.js — Script for the TEACHER??? popup UI

const PLATFORMS_MAP = {
  'plural.net':                          { name: 'Plural (SOMOS Educação)',       emoji: '📗' },
  'cambridgeone.org':                    { name: 'Cambridge One',                  emoji: '🇬🇧' },
  'machadosobrinho.paineldoaluno.com.br':{ name: 'Painel Machado Sobrinho',        emoji: '🏫' },
  'redesantacatarina.org.br':            { name: 'Portal Santa Catarina',          emoji: '🔴' },
  'teams.microsoft.com':                 { name: 'Microsoft Teams',                emoji: '💼' },
};

// Get the current active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab) return;

  const url = tab.url || '';
  let matchedPlatform = null;

  for (const [domain, info] of Object.entries(PLATFORMS_MAP)) {
    if (url.includes(domain)) {
      matchedPlatform = info;
      break;
    }
  }

  const banner   = document.getElementById('platformBanner');
  const nameEl   = document.getElementById('platformName');
  const statusDot = document.getElementById('statusDot');

  if (matchedPlatform) {
    banner.classList.remove('inactive');
    nameEl.textContent = `${matchedPlatform.emoji} ${matchedPlatform.name} detectado`;
    statusDot.classList.add('active');
    addLog('ok', `Portal detectado: ${matchedPlatform.name}`);
  } else {
    addLog('', 'Nenhum portal escolar na aba atual.');
  }
});

// ——— Buttons ———
document.getElementById('btnOpenApp').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000' });
  window.close();
});

document.getElementById('btnScanPage').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'SCAN_FIELDS' }, (response) => {
      if (chrome.runtime.lastError) {
        addLog('err', 'Erro: extensão não injetada nesta aba.');
        return;
      }
      if (response && response.fields) {
        addLog('ok', `Campos encontrados: ${response.fields.join(', ')}`);
      } else {
        addLog('', 'Nenhum campo mapeável encontrado.');
      }
    });
  });
});

document.getElementById('btnLastTask').addEventListener('click', () => {
  chrome.storage.local.get('lastTask', (data) => {
    if (!data.lastTask) {
      addLog('err', 'Nenhuma tarefa em cache. Use o app primeiro.');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'FILL_DEADLINE',
        task: data.lastTask
      }, (response) => {
        if (chrome.runtime.lastError) {
          addLog('err', 'Erro: recarregue a aba do portal escolar.');
        } else {
          addLog('ok', `Preenchido: "${data.lastTask.title}"`);
        }
      });
    });
  });
});

// ——— Log helper ———
function addLog(type, message) {
  const logArea = document.getElementById('logArea');
  const entry   = document.createElement('div');
  const now     = new Date();
  const ts      = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="ts">${ts}</span>${message}`;

  // Prepend new entries
  logArea.insertBefore(entry, logArea.firstChild);

  // Trim old entries (max 15)
  while (logArea.children.length > 15) {
    logArea.removeChild(logArea.lastChild);
  }
}

// Load persistent log from storage
chrome.storage.local.get('agentLog', (data) => {
  const logs = data.agentLog || [];
  const logArea = document.getElementById('logArea');
  logArea.innerHTML = ''; // Clear placeholder
  logs.slice(0, 15).forEach(entry => {
    const div = document.createElement('div');
    div.className = `log-entry ${entry.type}`;
    div.innerHTML = `<span class="ts">${entry.ts}</span>${entry.msg}`;
    logArea.appendChild(div);
  });
  if (logs.length === 0) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = '<span class="ts">--:--</span>Aguardando primeira ação do agente...';
    logArea.appendChild(div);
  }
});
