# Arquitetura e Implementação do Handoff de SSO / Popups (Etapa 1)

Este documento resume a implementação do mecanismo de handoff seguro para abas e popups de autenticação (SSO, Google, gov.br, 2FA e CAPTCHA) no Teacher AI (SkillGraph v2).

---

## 1. O Que Foi Feito

1. **Acompanhamento Seguro de Popups e Abas:**
   - Detecção de janelas/abas abertas pela aba principal do runner via `chrome.tabs.onCreated` (filtrando por `openerTabId === targetTabId`).
   - Monitoramento do domínio de navegação sem leitura de conteúdo ou injeção de scripts na janela de autenticação.
2. **Validação Estrita de Host (`allowed_hosts`):**
   - Ao detectar navegação para o host de login, o domínio de destino é validado contra a lista `allowed_hosts` declarada no grafo.
   - Caso o host esteja fora da lista autorizada, a automação aborta imediatamente com erro `E_HOST_NOT_ALLOWED`.
3. **Isolamento de Privacidade e Blindagem de Dados:**
   - Durante todo o handoff, a extensão não injeta scripts, não lê o DOM, não tira screenshots e não grava traces da aba de autenticação.
   - O log de auditoria e os eventos emitem estritamente `auth_handoff_started` e `auth_handoff_completed` apenas com os domínios de origem e destino (`from: originHost, to: authHost`), sem URLs completas, parâmetros de query ou tokens.
4. **Retomada e Fail-Closed:**
   - Ao retornar ao portal escolar de origem, o runner valida o fingerprint esperado (`expectFingerprint`). Se houver divergência, aborta com erro sem adivinhar (`E_FINGERPRINT_MISMATCH`).
   - Se o popup for fechado pelo usuário ou o tempo limite expirar sem resolução, o motor aborta com `E_HANDOFF_TIMEOUT`, garantindo zero escrita.
   - O estado do handoff é mantido em `chrome.storage.session`. Se o Service Worker for reciclado no meio do processo, o estado é invalidado com `E_INTERRUPTED`, sem retomada automática desgovernada.
5. **Interface Acolhedora no Painel Lateral (`side_panel_v2`):**
   - Card `#sgv2-handoff-box` estilizado em texto puro (sem scripts inline e sem `innerHTML`).
   - Mensagem clara: *"O portal pediu uma verificação de segurança (login, CAPTCHA ou código). Resolva diretamente na página; a automação espera."*
   - Contagem regressiva de segundos, botão **"Já resolvi ✨"** (que solicita a reavaliação de condições sem pular validações de segurança) e botão **"Cancelar execução"**.

---

## 2. Mapeamento de Arquivos e Linhas

| Componente | Arquivo e Linhas | Descrição Técnica |
| :--- | :--- | :--- |
| **Gerenciador de SSO** | [`lib/runner-ext/ssoHandoff.ts:1-260`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/ssoHandoff.ts#L1-L260) | Classe `SSOHandoffManager`, sanitização de domínios, validação de `allowed_hosts` e fail-closed. |
| **Integração no Host** | [`lib/runner-ext/workerEntry.ts:24, 68-87, 300, 327`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/workerEntry.ts#L24) | Opções `allowedHosts`, instanciação do gerenciador e método `getSSOAuditLog()`. |
| **Orquestrador MV3** | [`teacher-extension/orchestrator_v2.js:140-144`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/orchestrator_v2.js#L140-L144) | Injeção de `targetTabId`, `originHost`, `allowedHosts` e `driver` no host da extensão. |
| **Card HTML** | [`teacher-extension/side_panel_v2.html:61-70`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.html#L61-L70) | Elemento `#sgv2-handoff-box` com mensagem, contagem e botões de ação. |
| **Lógica do Painel** | [`teacher-extension/side_panel_v2.js:31-38, 329-370`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.js#L31-L38) | Temporizador, escuta dos eventos de handoff e despacho de respostas sem `innerHTML`. |
| **Suíte de Testes** | [`__tests__/extensionHost.integration.test.ts:387-458`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/__tests__/extensionHost.integration.test.ts#L387-L458) | 3 testes automatizados cobrindo host não permitido, isolamento da aba e timeout sem escrita. |

---

## 3. Permissões Novas no Manifesto

- **Nenhuma permissão nova foi adicionada.**
- O mecanismo opera exclusivamente com as permissões já declaradas em `teacher-extension/manifest.json`:
  - `"tabs"`: para rastreamento de criação/fechamento de popups (`onCreated`, `onRemoved`).
  - `"storage"`: para isolamento de estado volátil em `chrome.storage.session`.
- A permissão opcional `webNavigation` foi dispensada, eliminando qualquer risco de atrito ou alertas adicionais de segurança no navegador do professor.

---

## 4. Resultados do Dono: PENDENTE

Conforme o princípio de rigor e evidência (nenhuma validação circular ou fabricada em testes simulados):

- **Login real com Google (`accounts.google.com`):** `PENDENTE (dono)`
- **Login real com gov.br (`sso.acesso.gov.br`):** `PENDENTE (dono)`
- **Intervenção humana em CAPTCHA ou desafio 2FA ao vivo:** `PENDENTE (dono)`
- **Validação em ambiente real de produção escolar:** `PENDENTE (dono)`
