# Handoff Técnico Completo — Teacher AI (SkillGraph v2)

> **Data:** 2026-10-16  
> **Branch ativa:** `fechamento-integracao`  
> **HEAD atual:** `b0d0350` (`fix(engine,ux): fechar lacunas residuais de auditoria C1-C5 (download/upload reais, dry-run UI, select write, scheme e NLU coloquial)`)  
> **Estado da árvore Git:** Limpa (`nothing to commit, working tree clean`)  
> **Estado das suítes e builds:** `npx tsc --noEmit` (0 erros), `npm run build:ext` (OK), `npm run desktop:build` (OK), `vitest` (7 suítes / **143 passed, 0 failed**).

---

## 1. Contexto Histórico da Sessão (O Que Foi Discutido e Resolvido)

Esta sessão partiu de quatro problemas relatados pelo usuário no uso real da extensão e evoluiu para uma auditoria completa de ponta a ponta (`C1`–`C5`) seguida da amálgama de algoritmos dos principais browser agents open-source e fechamento de todos os bloqueadores (`BLQ-1` a `BLQ-8`) e dívidas (`DÍVIDA-1` a `DÍVIDA-4`).

### 1.1. Problemas Iniciais Relatados pelo Usuário e Soluções Aplicadas
1. **Erro de permissão de host (`Cannot access contents of url "https://machadosobrinho.paineldoaluno.com.br/professor_painel"`):**
   - **Causa:** `teacher-extension/manifest.json` tinha apenas `localhost` em `host_permissions`, enquanto `background.js` tentava injetar `chrome.scripting.executeScript` automaticamente em todas as abas.
   - **Solução:** Adicionado `"https://*/*"`, `"http://*/*"` em `host_permissions` no [`teacher-extension/manifest.json`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/manifest.json) e envolvidas as chamadas de `chrome.scripting.executeScript` em `try/catch` silencioso para URLs restritas (`chrome://`, Chrome Web Store).
2. **Sumiço do log de gravação ao trocar de página (navegação multi-página):**
   - **Causa:** O `Recorder` vivia apenas na memória do content script da página atual; ao navegar para outra URL, o contexto do content script era destruído e o estado de gravação se perdia.
   - **Solução:** Persistência contínua do estado de gravação (`sgv2_active_recording`) em `chrome.storage.local` + listener `chrome.webNavigation.onCompleted` em [`teacher-extension/orchestrator_v2.js`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/orchestrator_v2.js) que re-injeta o `content_adapter_v2.bundle.js` na nova página, retoma a gravação (`resumeRecording`) e anexa automaticamente o passo `{ type: 'navigate', url }`.
3. **Por que o engine gravava mas não navegava autonomamente:**
   - **Causa raiz diagnosticada:**
     1. O nó `NAVIGATE` em [`lib/runner/nodes/navigate.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/navigate.ts) era um **stub** que apenas lia `driver.getCurrentUrl()` sem nunca chamar `driver.navigate(targetUrl)`.
     2. O contrato `Driver` não possuía `navigate(url)` nem `waitForNavigation(timeoutMs)`.
     3. Havia 4 quebras de contrato entre `side_panel_v2.js`, `orchestrator_v2.js` e `desktop/llm/llmGateway.ts` (`BLQ-1(a..d)`).
   - **Solução:** Implementação real de `driver.navigate(url)` e `driver.waitForNavigation(timeoutMs)` em `DomDriver` e `RemoteDriver` (`chrome.tabs.update` + listener `chrome.tabs.onUpdated`), validação de `allowed_hosts` antes da navegação, e alinhamento completo dos contratos de mensagem.
4. **Pesquisa e Amálgama de Browser Agents Open-Source:**
   - Foram analisados os padrões arquiteturais de **Browser-Use**, **Nanobrowser**, **Stagehand**, **Skyvern** e **Agent-E**, incorporando ao engine:
     - **Reconexão resiliente MV3 pós-navegação** (inspirado em *Nanobrowser*): [`lib/runner-ext/remoteDriver.ts:53-112`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/remoteDriver.ts#L53-L112) detecta queda do receptor (`Receiving end does not exist` / `message channel closed`), aguarda estabilização da aba, re-injeta `dist/content_adapter_v2.bundle.js` e repete o RPC apenas para operações idempotentes (nunca repete `write`, `click` ou `upload`).
     - **Scroll progressivo de containers internos + Paginação** (inspirado em *Browser-Use* e *Stagehand*): [`lib/runner-dom/driver.ts:141-178`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-dom/driver.ts#L141-L178) e [`lib/runner/nodes/locate.ts:53-91`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/locate.ts#L53-L91).
     - **Extração universal multi-layout e widgets ARIA customizados** (inspirado em *Skyvern* e *Agent-E*): suporte a `<table>`, `[role="grid"]`, listas `<ul>/<ol>`, grids de cartões `.card`/`[data-student]` com paginação e deduplicação ([`lib/runner-dom/driver.ts:182-279`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-dom/driver.ts#L182-L279)), além de escrita em `role="combobox"`, `role="checkbox"` e `contenteditable` ([`lib/runner-dom/driver.ts:302-338`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-dom/driver.ts#L302-L338)).

---

## 2. Histórico de Commits Relevantes na Branch `fechamento-integracao`

- `b2444b0` — `feat(engine): amalgama de navegacao real com auto-cache de exploracao autonoma`
- `2f75e0a` — `audit: capacidades` (criou [`docs/AUDITORIA_CAPACIDADES.md`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/docs/AUDITORIA_CAPACIDADES.md) listando `BLQ-1`..`BLQ-8` e `DÍVIDA-1`..`DÍVIDA-4`)
- `1748817` — `feat(engine): amalgamar algoritmos de browser agents (browser-use, nanobrowser, stagehand, skyvern, agent-e) e corrigir contratos v2`
- `39f7e54` — `feat(engine,ux): fechamento completo BLQ-5d, BLQ-6b, BLQ-7, BLQ-8, DIVIDA-3, DIVIDA-4`
- `b0d0350` — `fix(engine,ux): fechar lacunas residuais de auditoria C1-C5 (download/upload reais, dry-run UI, select write, scheme e NLU coloquial)`

---

## 3. Mapa Completo do Que Foi Corrigido (`BLQ-1` a `BLQ-8` e `DÍVIDA-1` a `DÍVIDA-4`)

| Código | Descrição | Arquivos Modificados (`arquivo:linha`) |
| :--- | :--- | :--- |
| **`BLQ-1(a)`** | Contrato `nlu.parse` (`availableGraphs` vs `activeGraphs`, `{ ok, intent, clarification_needed }`) | [`teacher-extension/side_panel_v2.js:353-383`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.js#L353-L383), [`desktop/llm/llmGateway.ts:34-43`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/desktop/llm/llmGateway.ts#L34-L43) |
| **`BLQ-1(b)`** | Contrato `SKILLGRAPH_COMPILE_RECORDING` (`message.trace` + `message.meta` vs `rawSteps`) | [`teacher-extension/orchestrator_v2.js:488-555`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/orchestrator_v2.js#L488-L555) |
| **`BLQ-1(c)`** | Contrato `SKILLGRAPH_EXECUTE` (busca grafo em `graphs.listActive` quando só recebe `graphId`) | [`teacher-extension/orchestrator_v2.js:569-585`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/orchestrator_v2.js#L569-L585) |
| **`BLQ-1(d)`** | Handler `SKILLGRAPH_CANCEL` para abortar execução em andamento | [`teacher-extension/orchestrator_v2.js:469-476`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/orchestrator_v2.js#L469-L476), [`lib/runner/graphRunner.ts:52-55`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/graphRunner.ts#L52-L55) |
| **`BLQ-2`** | Quarentena obrigatória no `SKILLGRAPH_EXPLORE_AND_LEARN` (sem `activate: true` automático; abre `#modal-post-recording` para revisão humana de escala/polaridade) | [`teacher-extension/orchestrator_v2.js:450-462`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/orchestrator_v2.js#L450-L462), [`teacher-extension/side_panel_v2.js:368-383`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.js#L368-L383) |
| **`BLQ-3(a)`** | Timeout de `RemoteDriver.navigate` rejeita com `RunnerFailure('E_TIMEOUT', ...)` | [`lib/runner-ext/remoteDriver.ts:235-268`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/remoteDriver.ts#L235-L268) |
| **`BLQ-3(b)`** | `executeNavigateNode` valida `allowed_hosts` antes de `driver.navigate` (inclusive URL absoluta) e preserva esquema `http://` ou `https://` | [`lib/runner/nodes/navigate.ts:44-86`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/navigate.ts#L44-L86) |
| **`BLQ-3(c)`** | `executeClickNode` respeita `node.expect_navigation` chamando `driver.waitForNavigation` | [`lib/runner/nodes/click.ts:44-50`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/click.ts#L44-L50) |
| **`BLQ-3(d)`** | Reconexão automática do content script em `RemoteDriver.sendRpc` + proteção contra dupla escrita em `E_TIMEOUT` | [`lib/runner-ext/remoteDriver.ts:53-112`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/remoteDriver.ts#L53-L112), [`lib/runner/nodes/write.ts:183-188`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/write.ts#L183-L188) |
| **`BLQ-4`** | `LOCATE` suporta `paginate_until_found` + scroll progressivo de containers internos | [`lib/runner/nodes/locate.ts:53-91`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/locate.ts#L53-L91), [`lib/runner-dom/driver.ts:141-178`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-dom/driver.ts#L141-L178) |
| **`BLQ-5(a)`** | `readTable` multi-página com deduplicação + suporte a `source.kind === 'list'` / grids / cartões | [`lib/runner-dom/driver.ts:182-279`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-dom/driver.ts#L182-L279), [`lib/runner/nodes/read.ts:48-58`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/read.ts#L48-L58) |
| **`BLQ-5(b)`** | Inversão booleana para `polarity: 'checked_is_absent'` em `WRITE` e no read-back | [`lib/runner/nodes/write.ts:122-145`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/write.ts#L122-L145) |
| **`BLQ-5(c)`** | Escrita em widgets ARIA (`role="combobox"`, `role="checkbox"`, `contenteditable`) + equivalência decimal `7,5` == `7.5` | [`lib/runner-dom/driver.ts:302-338`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-dom/driver.ts#L302-L338), [`lib/runner/nodes/write.ts:62-75`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/write.ts#L62-L75) |
| **`BLQ-5(d)`** | Compilação de formulários multi-campo (`write_value_1..N`) e suporte a `<select>` em tarefas de escrita | [`lib/compiler/stages/assemble.ts:48-50`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/compiler/stages/assemble.ts#L48-L50), [`lib/compiler/stages/assemble.ts:169-280`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/compiler/stages/assemble.ts#L169-L280), [`lib/compiler/stages/segment.ts:56-61`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/compiler/stages/segment.ts#L56-L61) |
| **`BLQ-6(a)`** | Propagação de `updatedText` editado pela professora no `#modal-checkpoint` para `state.params` | [`teacher-extension/side_panel_v2.js:230-241`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.js#L230-L241), [`lib/runner-ext/extensionHost.ts:138-159`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/extensionHost.ts#L138-L159), [`lib/runner/nodes/checkpoint.ts:52-75`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner/nodes/checkpoint.ts#L52-L75) |
| **`BLQ-6(b)`** | Implementação de `graphs.delete` e `graphs.setActive` no repositório SQLite e IPC do Desktop | [`desktop/storage/graphRepo.ts:137-159`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/desktop/storage/graphRepo.ts#L137-L159), [`desktop/ipc/ipcHandlers.ts:154-168`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/desktop/ipc/ipcHandlers.ts#L154-L168) |
| **`BLQ-7`** | UI para reverter versão de habilidade (`Reverter v{N-1}`), Dry-Run (`#sgv2-chk-dryrun`) e restaurar `.tbackup` | [`teacher-extension/side_panel_v2.html:88-91`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.html#L88-L91), [`teacher-extension/side_panel_v2.html:194-213`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.html#L194-L213), [`teacher-extension/side_panel_v2.js:510-585`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.js#L510-L585) |
| **`BLQ-8`** | NLU com datas relativas (`hoje`/`ontem`/`anteontem`), auto-correção (`"na verdade 7,5"`), negação (`"não lance"`), exceção em lote (`"todos menos o João"`) e verbos coloquiais | [`desktop/llm/llmGateway.ts:44-165`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/desktop/llm/llmGateway.ts#L44-L165) |
| **`DÍVIDA-2`** | Explorador autônomo pontua menus sem ações destrutivas e preserva `startUrl`/`startPath` no `entry_fingerprint` | [`teacher-extension/orchestrator_v2.js:343-455`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/orchestrator_v2.js#L343-L455) |
| **`DÍVIDA-3`** | `SSOHandoffManager` monitora abas filhas/popups de autenticação que retornam para `allowedHosts` | [`lib/runner-ext/ssoHandoff.ts:104-149`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/ssoHandoff.ts#L104-L149) |
| **`DÍVIDA-4`** | Tradução completa dos 25 códigos `E_*` para mensagens amigáveis em português (`FRIENDLY_ERRORS`) | [`teacher-extension/side_panel_v2.js:11-36`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel_v2.js#L11-L36) |

---

## 4. Fronteiras Conhecidas e Próximos Passos Imediatos para o Próximo Agente

Embora **100% dos bloqueadores de código e contrato (`BLQ-1` a `BLQ-8`) estejam resolvidos e cobertos por 143 testes automatizados (`E1`/`E2`)**, existem **5 fronteiras estruturais/operacionais** caso o usuário peça evolução adicional:

1. **Validação ao Vivo no Chrome Real (`NÃO EXECUTADO (dono)`):**
   - Recarregar a extensão em `chrome://extensions` (apontando para `teacher-extension/`), garantir que o host nativo Electron (`dist-desktop/main.cjs`) esteja registrado, e testar o fluxo completo (Gravar / Explorar -> Revisar Escala/Polaridade -> Executar com Dry-Run -> Executar com Checkpoint) no portal real (`machadosobrinho.paineldoaluno.com.br`).
2. **Roteamento de RPC por `frameId` para Iframes Cross-Origin (`C1`):**
   - Hoje `DomDriver` atravessa iframes *same-origin* e Shadow DOM aberto ([`lib/runner-dom/driver.ts:508-538`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-dom/driver.ts#L508-L538)), e `RemoteDriver.listFrames()` lista frames via `chrome.webNavigation.getAllFrames`. Se um portal escolar embutir o diário de classe dentro de um iframe *cross-origin*, será necessário passar `{ frameId }` em `chrome.tabs.sendMessage(tabId, message, { frameId })` no `RemoteDriver.sendRpc`.
3. **Widgets Proprietários Complexos (`C4`):**
   - Datepickers baseados em pop-ups de calendário que bloqueiam digitação no `<input>`, editores rich-text em iframe isolado (TinyMCE) e tabelas com virtualização destrutiva de linhas no DOM durante loops de escrita.
4. **Memória Conversacional Multi-Turno no NLU (`C5`):**
   - `LlmGateway.parseIntent` ([`desktop/llm/llmGateway.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/desktop/llm/llmGateway.ts)) é stateless por chamada. Se a professora disser `"Lance nota 8 para Maria na 6A"` e no turno seguinte disser `"E 7,5 para o João na mesma turma"`, pode-se adicionar um contexto de sessão (`lastTurma`, `lastData`, `lastSkillId`) no `LlmGateway` ou no `side_panel_v2.js`.
5. **Instalador Gráfico `.exe` Zero-Terminal (`C3` / O10):**
   - Configurar `electron-builder` / NSIS para empacotar `dist-desktop/` e registrar automaticamente a chave `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.teacherai.desktop` durante a instalação no Windows.

---

## 5. Comandos Canônicos de Verificação Rápida

Para validar qualquer mudança futura sem ruído no terminal:

```powershell
npx tsc --noEmit
npm run build:ext --silent
npm run desktop:build --silent
npx vitest run __tests__/skillGraphV2.contract.test.ts __tests__/graphRunner.core.test.ts __tests__/compiler.core.test.ts __tests__/repair.core.test.ts __tests__/desktop.core.test.ts __tests__/community.core.test.ts __tests__/extensionHost.integration.test.ts --reporter=basic
```
