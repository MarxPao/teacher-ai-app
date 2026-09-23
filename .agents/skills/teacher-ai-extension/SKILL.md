---
name: teacher-ai-extension
description: >-
  Develop, debug, reload, and verify the Chrome Extension (Manifest V3) for Teacher AI, including side panel UI, background service worker, and content scripts.
---

# Teacher AI — Chrome Extension Runbook

Este skill orienta a instalação, recarregamento, inspeção e manutenção da extensão do Chrome (`teacher-extension/`).

## 1. Estrutura dos Arquivos da Extensão

```text
teacher-extension/
├── manifest.json       # Manifest V3 (permissões: sidePanel, activeTab, scripting, storage)
├── side_panel.html     # Interface do painel lateral com histórico de chat e cards pedagógicos
├── side_panel.js       # Lógica do painel: decomposição de comandos compostos, WS com sidecar
├── background.js       # Service worker: ponte com tabs, CDP e execução das Camadas 1 e 2
├── content.js          # Content script: overlay aponte-e-clique, highlight visual e leitura de DOM
└── icons/              # Ícones oficiais do Teacher AI
```

## 2. Como Carregar ou Atualizar a Extensão no Chrome

1. Abra o Google Chrome e digite na barra de endereços:
   ```text
   chrome://extensions/
   ```
2. Ative o botão **"Modo do desenvolvedor"** no canto superior direito.
3. Se for a primeira instalação:
   - Clique em **"Carregar sem compactação"** (Load unpacked).
   - Selecione a pasta:
     ```text
     C:\Users\rafae\Documents\antigravity\blissful-noether\teacher-extension
     ```
4. Se a extensão já estiver carregada:
   - Localize o card **Teacher AI** e clique no ícone circular de **Recarregar** (ícone de seta giratória).
   - **Atenção:** Se alterou o `side_panel.html` ou `side_panel.js`, feche e abra o painel lateral para recarregar o DOM da interface.

## 3. Comunicação via WebSocket com o Sidecar

- **Porta Padrão:** `ws://localhost:8765`.
- **Fluxo de Mensagens:**
  - A extensão tenta conectar automaticamente ao iniciar (`connectWebSocket()`).
  - Quando a conexão é estabelecida, o badge no topo do painel muda para verde ("Pronto").
  - Mensagens de voz ou texto digitadas no side panel são enviadas via WebSocket ou HTTP (`/natural_intent`) para o backend em `sidecar/manual_runner.py`.

## 4. Decomposição de Comandos Compostos (`side_panel.js`)

A função `splitCompoundCommand(text)` decompõe ordens de múltiplos passos antes do envio:
- Conjunções suportadas: `" e "`, `" em "`, `" na seção "`, `" no menu "`.
- Exemplo 1: `"acesse o perfil de alice almeida em meus alunos"`
  - Passo 1: Navega para a aba `"meus alunos"`.
  - Passo 2: Executa `DISCOVERY_FIND_AND_CLICK_STUDENT` para `"alice almeida"`.
- Exemplo 2: `"abra recados e abra recados recebidos"`
  - Passo 1: Clica na aba principal `"recados"`.
  - Passo 2: Clica no botão de filtro `"recados recebidos"`.

## 5. Destaque Visual e Feedback ao Professor (`content.js`)

- Todo elemento clicado ou focado pela extensão recebe temporariamente a classe CSS de destaque (`border: 3px solid #22c55e; box-shadow: 0 0 10px rgba(34, 197, 94, 0.5)`).
- Isso garante que a professora veja exatamente onde a IA está operando, promovendo transparência e confiança.
