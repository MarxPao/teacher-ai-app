# Auditoria Independente de Navegação, Extração/Inserção, UX e Linguagem Natural (`AUDITORIA_CAPACIDADES.md`)

**Data:** 15 de outubro de 2026  
**Branch:** `fechamento-integracao` (`HEAD` = `b2444b0`)  
**Escopo:** Auditoria estrita em passada única (somente leitura) dos objetivos **C1 a C5**.

---

## 1. Veredito Executivo (máx. 10 linhas)

O motor possui contratos formais sólidos e **137/137 testes unitários aprovados** (E1), mas **C1 a C5 são `PARCIAL` no código (E2) e `NÃO EXECUTADO (dono)` no navegador real**. A alegação de **"navegar e extrair/inserir em qualquer portal" NÃO é sustentável hoje**: (1) a integração entre `side_panel_v2.js`, `orchestrator_v2.js` e `desktop/main.ts` tem **4 quebras de contrato** que impedem listar habilidades ativas (`s.params.forEach` em objeto), resolver grafos (`resp.graph` inexistente), passar parâmetros do formulário ao runner (`runner.run(graph, {})`) e salvar alunos (`source` string vs objeto); (2) a navegação real foi conectada apenas para `NAVIGATE` direto por URL, mas o timeout de 10s resolve com sucesso silencioso, URLs absolutas em `node.path` burlam `allowed_hosts`, `expect_navigation` em cliques é ignorado e paginação/scroll infinito/download/upload são stubs ou desconectados; (3) o explorador autônomo (`SKILLGRAPH_EXPLORE_AND_LEARN`, introduzido em `b2444b0`) clica por heurística léxica sem bloqueio de verbos destrutivos, gera traces estruturalmente inválidos e salva/ativa grafos (`activate: true`) sem revisão humana nem dry-run; e (4) o módulo de NLU (`LlmGateway.parseIntent`) não usa LLM — é um extrator regex estático sem suporte a datas relativas, exceções ("todos menos o João"), lotes ou diálogo de desambiguação.

---

## 2. Tabela de Avaliação por Objetivo (C1 a C5)

> **Regra de integridade aplicada:** Sem evidência de execução em navegador real e portal real (exclusiva do dono), o teto máximo permitido é `PARCIAL`. A coluna **"% Honesto (Código E2)"** mede a fração da capacidade implementada de forma real e conectada à cadeia de produção.

| Objetivo | Veredito | Nível E | % Honesto (Código E2) | Justificativa Técnica (`arquivo:linha`) | O Que Falta para `COMPLETO` |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **C1 — Navegar** (URLs, menus, troca de página, abas, popups, iframes, SPA, paginação, scroll infinito, wait, mudança de contexto) | `PARCIAL` (`NÃO EXECUTADO (dono)`) | E2 | **38%** | `NAVIGATE` chama `chrome.tabs.update` (`remoteDriver.ts:205`), `WAIT` faz polling (`branch.ts:61`), `HANDOFF_HUMAN` aguarda confirmação (`checkpoint.ts:88`) e o gravador persiste estado em `chrome.storage.local` (`orchestrator_v2.js:516`). Porém: timeout de 10s de `navigate()` resolve sem erro (`remoteDriver.ts:220-222`); `expect_navigation` em `CLICK` é ignorado (`click.ts:13-61`); `scroll_until_found` não faz scroll incremental (`driver.ts:159-166`); `paginate_until_found` e paginação em `READ` são ignorados (`navigate.ts:89-105`, `tableReader.ts:65`); `DomDriver.paginate` usa seletor CSS inválido `button:has-text(...)` (`driver.ts:187`); iframes cross-origin são engolidos (`selectors.ts:27`). | Rejeitar com `E_TIMEOUT` no timer de `navigate()`; validar host em URLs absolutas de `node.path`; implementar espera em `CLICK.expect_navigation`; conectar paginação real e scroll incremental no `DomDriver`; rotear `frameId` via `chrome.webNavigation` para iframes cross-origin; validar no Chrome real. |
| **C2 — Módulo de navegação completo** (coeso, erro, timeout, host permitido, retomada segura) | `PARCIAL` (`NÃO EXECUTADO (dono)`) | E2 | **35%** | Não há módulo único coeso: coexistem **6 caminhos de navegação** no repositório (3 ativos no painel v2: nó `NAVIGATE`, `internalNavigatePortalTab` e `SKILLGRAPH_EXPLORE_AND_LEARN`). Se `node.path` for URL absoluta, `executeNavigateNode` (`navigate.ts:49`) ignora `checkAllowedHost`. Se a página recarregar durante um `WRITE` com `retry.max_attempts: 2` (`assemble.ts:132`), o erro de RPC dispara retry em `engine.ts:115`, podendo duplicar a escrita. O explorador salva com `activate: true` sem revisão (`orchestrator_v2.js:467`). | Unificar navegação sob o contrato de `SkillGraphRunner`/`RemoteDriver`; validar `new URL(finalUrl).hostname` contra `allowed_hosts`; proibir retry automático em `WRITE` após despacho de RPC; remover auto-ativação sem revisão no explorador. |
| **C3 — UX/feature completa** (pedir, ensinar, revisar, aprovar, executar, progresso, erros claros, cancelar, reverter versão, gerir habilidades sem terminal) | `PARCIAL` (`NÃO EXECUTADO (dono)`) | E2 | **45%** | O painel v2 (`side_panel_v2.html/js`) e o app (`desktop/ui/index.html`, `app.js`) têm telas para pedir, gravar, revisar, aprovar CHECKPOINT, cancelar e ver barra de progresso. Contudo, **4 bugs bloqueantes de contrato** quebram o fluxo sem terminal: (1) `side_panel_v2.js:239,286` lê `s.task_id` e `s.params.forEach` num grafo onde o ID é `s.identity.task_id` e `params` é Objeto; (2) `orchestrator_v2.js:116` lê `resp.graph` mas `desktop/main.ts:75` retorna o grafo direto; (3) `orchestrator_v2.js:199` passa `{}` em vez de `payload.initialVariables` como `params` ao runner; (4) `orchestrator_v2.js:214` envia `source` string em `students.upsertFromPortal`. Reverter versão, excluir/renomear habilidade, restaurar backup e instalador `.exe` não têm UI/script. | Corrigir os 4 contratos quebrados entre `side_panel_v2.js`, `orchestrator_v2.js` e `desktop/main.ts`; honrar `updatedText` do modal de CHECKPOINT (`workerEntry.ts:128`); expor botões de reverter versão (`graphs.setActive`), excluir habilidade e restaurar `.tbackup`; configurar empacotador NSIS/Electron-Builder. |
| **C4 — Extrair e inserir qualquer dado** (tabelas, listas, forms, textos, download, inputs, select, checkbox, data, textarea, upload em qualquer portal) | `PARCIAL` (`NÃO EXECUTADO (dono)`) | E2 | **42%** | Leitura de `<table>` HTML (incluindo `colspan`/`rowspan` e `skip_rows` em `tableReader.ts:13-125`), `readText`, `readValue` e escrita com setter nativo + read-back + reversão em `<input>`, `<textarea>` e `<select>` (`writer.ts:48-103`, `write.ts:160-200`) são reais. Porém: `DOWNLOAD` (`driver.ts:233-243`) e `UPLOAD` (`driver.ts:245-265`) são **stubs** com dados fictícios hardcoded; `source.kind === 'list'` chama `readTable` e falha em `<ul>/<li>` (`read.ts:46`); cartões/grids exigem classes fixas `.cards-container`/`.student-card` (`tableReader.ts:77`); e a escrita em checkbox (`writer.ts:24-30`) **não inverte o booleano** quando `polarity === 'absence'`. | Implementar `DOWNLOAD` real (`chrome.downloads`) e `UPLOAD` real; corrigir inversão de booleano em `writer.ts:24-30` para `checked_is_absent` vs `checked_is_present`; implementar leitor real de listas (`<ul>/<ol>/<li>`) e grids genéricos; suportar selects/datepickers customizados. |
| **C5 — Linguagem natural com nuances** (ambíguos, parciais, referências, datas relativas, lotes, correções, esclarecimento, coloquial, catálogo + CHECKPOINT) | `PARCIAL` (`NÃO EXECUTADO (dono)`) | E2 | **25%** | O roteamento restringe-se estritamente ao catálogo (`llmGateway.ts:171`) e textos livres exigem `CHECKPOINT` integral (`checkpoint.ts:26-40`). Porém, `LlmGateway.parseIntent` (`desktop/llm/llmGateway.ts:160-333`) **não invoca LLM**: é um parser léxico por regex/substring. Não resolve datas relativas ("ontem", "sexta passada"), não entende exceções/lotes ("todos menos o João" extrai `"João"` como o aluno que levará falta em `llmGateway.ts:289`), não processa correções ("na verdade, 7,5"), não mantém histórico de conversa, não faz perguntas de esclarecimento e quebra em `for (const p of declaredParams)` (`llmGateway.ts:255`) quando `params` é um objeto `Record`. | Corrigir iteração de `params` (`Object.entries`); integrar inferência estruturada (Ollama local com fallback determinístico honesto); resolver datas relativas na camada NLU antes do runner; detectar negações/exceções ("menos", "exceto") e ambiguidades retornando pergunta de esclarecimento à professora. |

### "Navegar e extrair/inserir em qualquer portal" é hoje alegável?
**NÃO.** Pelas evidências E2 acima:
1. O painel v2 sequer consegue listar ou executar uma habilidade salva no SQLite por causa das incompatibilidades de formato em `side_panel_v2.js:239,286` e `orchestrator_v2.js:116,199`.
2. Mesmo corrigindo a ponte, apenas tabelas HTML clássicas (`<table>`) em página única ou navegação por URL estática funcionam de ponta a ponta: portais que dependam de paginação (`next_button`/`infinite_scroll`), tabela virtualizada, listas `<ul>/<li>`, cartões com classes próprias, iframes cross-origin, selects customizados (React-Select/MUI), datepickers JS, download de boletins ou upload de arquivos batem em stubs ou seletores desconectados.

---

## 3. B1 — Anatomia da Navegação (C1, C2)

### 3.1 Análise Item a Item com Cadeia de Produção e Verificação de Stubs

| # | Mecanismo / Nó | Status | Nível E | Há Stub? | Cadeia `arquivo:linha → arquivo:linha` e Análise Técnica |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | **Nó `NAVIGATE`** | `PARCIAL` | E2 | Não (mas foi stub até `b2444b0`) | `SkillGraphRunner.executeNodeDispatch` (`lib/runner/engine.ts:240-241`) $\rightarrow$ `executeNavigateNode` (`lib/runner/nodes/navigate.ts:16-63`) $\rightarrow$ `driver.navigate(finalUrl)` (`lib/runner/nodes/navigate.ts:51`) $\rightarrow$ `RemoteDriver.navigate` (`lib/runner-ext/remoteDriver.ts:203-228`) $\rightarrow$ `chrome.tabs.update(this.tabId, { url })` (`remoteDriver.ts:205`). No `DomDriver` (`lib/runner-dom/driver.ts:267-279`), atribui `win.location.href = url`. |
| **2** | **Espera de carregamento e tratamento de timeout no `navigate`** | `PARCIAL` (Bug de falso sucesso) | E2 | **Sim** (no timeout) | Em `lib/runner-ext/remoteDriver.ts:212-223`, `RemoteDriver.navigate` registra listener em `chrome.tabs.onUpdated` esperando `changeInfo.status === 'complete'`, mas configura um `setTimeout` de 10000ms que **chama `resolve()` sem erro quando o timer estoura** (ver trecho literal na Seção 3.2). Se a página travar ou cair em timeout de rede (>10s), o nó `NAVIGATE` reporta sucesso silencioso! |
| **3** | **Validação de `allowed_hosts` ANTES de navegar (URL relativa e absoluta)** | `PARCIAL` (Bypass em URL absoluta) | E2 | Não | `executeNavigateNode` (`lib/runner/nodes/navigate.ts:28-31`) obtém `currentCtx = await driver.getFrameContext()`, define `targetHost = node.host ?? currentCtx.host` e chama `checkAllowedHost(targetHost, allowedHosts, nodeId)`. Porém, nas linhas 47-51: `const isAbsolute = fullTarget.startsWith('http://') \|\| fullTarget.startsWith('https://'); const finalUrl = isAbsolute ? fullTarget : (targetHost ? \`https://\${targetHost}\${fullTarget}\` : fullTarget)`. **Duas falhas:** (a) se `node.host` estiver omitido e `node.path` for uma URL absoluta (`https://dominio-externo.com/x`), `checkAllowedHost` valida `currentCtx.host` (permitido) e navega para `dominio-externo.com` **sem validar o host de `fullTarget`**; (b) para URLs relativas, força `https://`, quebrando portais HTTP ou harness local (`http://127.0.0.1:8898`). |
| **4** | **Clique com `expect_navigation`** | `STUB` (Ignorado) | E2 | **Sim** | O contrato `ClickNodeSchema` (`lib/contracts/skillgraph/nodes.ts:116`) e o compilador (`lib/compiler/stages/assemble.ts:157`, `assemblePreamble.ts:108`) geram `expect_navigation: true`. Porém, `executeClickNode` (`lib/runner/nodes/click.ts:13-61`) **jamais lê `node.expect_navigation`**! Apenas executa `await driver.click(...)` (linha 44) e retorna `node.on_success` imediatamente, antes de a nova página carregar. |
| **5** | **Reconexão do Content Adapter após troca de página (RPC perdido)** | `PARCIAL` | E2 | Não | Em `lib/runner-ext/remoteDriver.ts:86-92`, quando `chrome.tabs.sendMessage` falha com `'Could not establish connection'` ou `'Receiving end does not exist'`, `sendRpc` faz até 3 retentativas (`attempt < 4`) com atraso `400 * attempt` ms (400ms + 800ms + 1200ms = **2,4s máx**). Limitações: (a) se o reload demorar >2,4s, aborta com `E_TIMEOUT`; (b) o `ElementHandleStore` (`lib/runner-dom/handleStore.ts:6-44`) vive em memória no content script e é **zerado** a cada navegação, invalidando qualquer `handleId` ou `rowHandleId` obtido antes da troca de página. |
| **6** | **WRITE nunca repetido após troca de página** | `PARCIAL` (Risco de duplicação) | E2 | Não | `state.writesCount++` só é incrementado em `lib/runner/nodes/write.ts:157`, *após* `await driver.write(...)` retornar. Como o compilador define `retry: { max_attempts: 2, backoff_ms: 500 }` nos nós `WRITE` (`lib/compiler/stages/assemble.ts:132`), se um `WRITE` disparar submissão/reload da página antes de o content script responder ao RPC, `sendRpc` falha com `E_TIMEOUT` (não listado em `FATAL_RUNTIME_ERRORS` em `lib/runner/engine.ts:28`) e o loop `for (let attempt = 1; attempt <= maxAttempts; attempt++)` em `engine.ts:115-163` **executa o `WRITE` uma segunda vez**. |
| **7** | **`LOCATE` com `scroll_until_found` / `paginate_until_found`** | `STUB` / `AUSENTE` | E2 | **Sim** | Em `lib/runner/nodes/navigate.ts:89-105`, `executeLocateNode` trata `if (node.mode === 'scroll_until_found')` chamando `driver.scroll({ mode: 'scroll_until_found', target })`. Porém, `DomDriver.scroll` (`lib/runner-dom/driver.ts:157-175`) **não rola o container incrementalmente**: apenas chama `this.resolveTargetElement(options.target)` uma única vez no DOM parado e, se achar, chama `el.scrollIntoView()`. Já o modo `paginate_until_found` nem possui `if` em `executeLocateNode` (`navigate.ts:104`), caindo direto em `driver.locateAnchor(resolvedAnchor)` sem paginar. |
| **8** | **Paginação (`next_button`, `page_numbers`, `infinite_scroll`, `virtual_scroll`)** | `STUB` / `DESCONECTADO` | E2 | **Sim** | (a) `executeReadNode` (`lib/runner/nodes/read.ts:33`) passa `paginate: node.paginate` para `driver.readTable`, mas `DomDriver.readTable` (`lib/runner-dom/driver.ts:120-124`) e `readHtmlTable` (`lib/runner-dom/tableReader.ts:65-126`) **ignoram `options.paginate`** (lendo apenas a página 1). (b) `DomDriver.paginate` (`lib/runner-dom/driver.ts:183-214`) nunca é chamado por `READ` nem `LOCATE`; além disso, quando `options.nextButton` não é passado, usa `this.doc.querySelector('a[rel="next"], .pagination-next, button:has-text("Próxima")')` (`driver.ts:187`), onde `:has-text(...)` não é CSS válido e lança `DOMException: Failed to execute 'querySelector'`. (c) `page_numbers`, `infinite_scroll` e `virtual_scroll` não têm implementação no `DomDriver`. |
| **9** | **Iframes (mesma origem e cross-origin)** | `PARCIAL` (mesma origem) / `AUSENTE` (cross-origin) | E2 | Não | Mesma origem: `queryAllInShadowAndFrames` (`lib/runner-dom/selectors.ts:21-28`) varre `root.querySelectorAll('iframe')` e acessa `iframe.contentDocument`. Cross-origin: o bloco `try { ... } catch {}` (`selectors.ts:27`) ignora silenciosamente iframes de outra origem (`SecurityError`). Embora `RemoteDriver` tenha `setFrameId` (`remoteDriver.ts:41`) e `ContentAdapter` tenha `listFrames` (`contentAdapter.ts:44`), nenhum código em `lib/runner/**` chama `listFrames` ou altera `frameId` (permanece `0`). |
| **10** | **Shadow DOM** | `PARCIAL` | E2 | Não | `queryAllInShadowAndFrames` (`lib/runner-dom/selectors.ts:15-19`) percorre recursivamente `el.shadowRoot` (apenas `mode: 'open'`). Porém, após localizar a `<table>`, `readHtmlTable` (`lib/runner-dom/tableReader.ts:77-105`) e `DomDriver.locateRow` (`lib/runner-dom/driver.ts:89-99`) usam `tableEl.querySelectorAll('tr')` nativo, que **não atravessa** web components com Shadow DOM interno para linhas/células. |
| **11** | **Abas e Popups (`SSOHandoffManager`)** | `PARCIAL` (Desconectado do nó) | E2 | Não | `SSOHandoffManager` (`lib/runner-ext/ssoHandoff.ts:66-308`) monitora `chrome.tabs.onCreated`/`onUpdated`/`onRemoved` para abas filhas (`openerTabId === targetTabId`), valida `allowedHosts` e emite `sso_handoff_started`/`completed` sem injetar scripts na aba de login. Porém, em `lib/runner-ext/workerEntry.ts:68-87`, o `ssoManager` é apenas instanciado: `executeHandoffNode` (`lib/runner/nodes/checkpoint.ts:88-108`) chama `await host.handoff(...)` (que bloqueia esperando clique manual no botão `#sgv2-btn-resolved-handoff` do painel v2) e nunca chama `ssoManager.waitForCompletion()`. |
| **12** | **Nó `WAIT`** | `IMPLEMENTADO REAL` | E2 | Não | `executeWaitNode` (`lib/runner/nodes/branch.ts:39-83`) resolve a condição `node.until`, faz loop com `await host.sleep(200)` avaliando `evaluateCondition(resolvedCond, driver)` até `node.timeout_ms`, e lança `RunnerError('E_TIMEOUT', ...)` se expirar. |
| **13** | **Nó `HANDOFF_HUMAN`** | `IMPLEMENTADO REAL` | E2 | Não | `executeHandoffNode` (`lib/runner/nodes/checkpoint.ts:71-123`) emite `handoff_started`, aguarda confirmação via `host.handoff(...)` (`workerEntry.ts:224-255` $\rightarrow$ card `#sgv2-handoff-box` em `side_panel_v2.js:488-503`) e depois faz polling de `node.resume_when` a cada 1000ms até `node.timeout_ms`. |
| **14** | **SPA (mudança de rota sem recarga)** | `PARCIAL` | E2 | Não | Na execução, cliques em abas/rotas SPA seguidos de `WAIT` funcionam no mesmo documento. Na gravação (`teacher-extension/orchestrator_v2.js:916-949`), passos `navigate` só são gravados quando `chrome.tabs.onUpdated` dispara `changeInfo.status === 'complete'` com mudança de URL; transições SPA via `history.pushState` são capturadas apenas como passo `click` no elemento acionado. |

### 3.2 Código Literal do Timeout Silencioso em `RemoteDriver.navigate`
Em [`lib/runner-ext/remoteDriver.ts:203-228`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/remoteDriver.ts#L203-L228):
```typescript
  public async navigate(url: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.update === 'function') {
      return new Promise<void>((resolve, reject) => {
        chrome.tabs.update(this.tabId, { url }, () => {
          if (chrome.runtime?.lastError) {
            reject(new RunnerError('E_TIMEOUT', `Erro ao navegar para ${url}: ${chrome.runtime.lastError.message}`))
            return
          }
          // Wait for tab to complete loading
          const listener = (updatedTabId: number, changeInfo: any) => {
            if (updatedTabId === this.tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener)
              resolve()
            }
          }
          chrome.tabs.onUpdated.addListener(listener)
          setTimeout(() => {
            try { chrome.tabs.onUpdated.removeListener(listener) } catch {}
            resolve()
          }, 10000)
        })
      })
    }
    return this.sendRpc('navigate', { url })
  }
```
Como demonstrado nas linhas 219–222, quando o timer de 10 segundos estoura sem o evento `'complete'`, `resolve()` é chamado em vez de `reject(new RunnerError('E_TIMEOUT', ...))`.

### 3.3 Inventário de TODAS as Formas de Navegar no Repositório (Avaliação C2)

| # | Caminho de Navegação | Localização (`arquivo:linha`) | Ligado ao Painel v2? | Status |
| :---: | :--- | :--- | :---: | :---: |
| **1** | **Nó `NAVIGATE` (SkillGraph v2)** | `lib/runner/nodes/navigate.ts:16-63` $\rightarrow$ `lib/runner-ext/remoteDriver.ts:203-228` | **SIM** (`SKILLGRAPH_RUN`) | Ativo (v2) |
| **2** | **Explorador Autônomo (`SKILLGRAPH_EXPLORE_AND_LEARN`)** | `teacher-extension/side_panel_v2.js:348` $\rightarrow$ `teacher-extension/orchestrator_v2.js:336-479` | **SIM** (botão `#sgv2-btn-nl-send`) | Ativo (v2) |
| **3** | **Heurística de Menu (`internalNavigatePortalTab` / `NAVIGATE_PORTAL_TAB`)** | `teacher-extension/background.js:930-1035` e `background.js:1597` | **SIM** (invocado pelo caminho #2 em `orchestrator_v2.js:368`) | Ativo (híbrido v1/v2) |
| **4** | **`portal_navigate` (Agente v1 no Side Panel legado)** | `teacher-extension/side_panel.js:2799` $\rightarrow$ envia `NAVIGATE_PORTAL_TAB` | **NÃO** (`side_panel.html` não está no manifesto v2) | Legado / Órfão |
| **5** | **`DISCOVERY_FIND_AND_CLICK_STUDENT` (Camada 2 v1)** | `teacher-extension/background.js:1624-1827` $\rightarrow$ `teacher-extension/side_panel.js:2859` | **NÃO** (sem chamador em `side_panel_v2.js`) | Legado / Órfão |
| **6** | **Loop ReAct Python (`sidecar/agentic_execution_loop.py`)** | `sidecar/agentic_execution_loop.py:1-320` (WebSocket 8765 desativado no modo v2) | **NÃO** (`USE_SKILLGRAPH_V2_DEFAULT = true` em `background.js:275`) | Legado / Desconectado |

**Veredito sobre concorrência de caminhos (C2):** **SIM, existem caminhos de navegação concorrentes ativos no painel v2** (o motor determinístico `SkillGraphRunner` via `RemoteDriver.navigate` vs. a função procedural `internalNavigatePortalTab` em `background.js:930` acionada por `SKILLGRAPH_EXPLORE_AND_LEARN`). Isso **fere diretamente o objetivo C2**, pois `internalNavigatePortalTab` executa cliques diretos via `chrome.scripting.executeScript` fora do `SkillGraphRunner`, sem `checkAllowedHost`, sem `AuditSink`, sem `Host` e sem controle de `side_effect_level`.

---

## 4. B0 & B2 — Commit Recente (`b2444b0`) e Explorador Autônomo (`SKILLGRAPH_EXPLORE_AND_LEARN`)

### 4.1 Auditoria do Commit `b2444b0` (B0)
O commit `b2444b0` (`feat(engine): amalgama de navegacao real com auto-cache de exploracao autonoma`) usou `git add -A` e modificou 10 arquivos (`+310/-4` linhas):
- **Dentro do escopo de navegação do driver/runner (7 arquivos):** `lib/runner/types.ts`, `lib/runner/nodes/navigate.ts`, `lib/runner-dom/driver.ts`, `lib/runner-ext/protocol.ts`, `lib/runner-ext/contentAdapter.ts`, `lib/runner-ext/remoteDriver.ts`, `__tests__/graphRunner.core.test.ts`.
- **Fora do escopo estrito do driver de navegação (3 arquivos):**
  1. `teacher-extension/background.js` (+1 linha: `globalThis.internalNavigatePortalTab = internalNavigatePortalTab` na linha 1035).
  2. `teacher-extension/orchestrator_v2.js` (+156 linhas: handler `SKILLGRAPH_EXPLORE_AND_LEARN` nas linhas 336–479 que executa clique heurístico no DOM, fabrica um `RecordingTrace` sintético, compila e **salva com `activate: true`** na linha 467).
  3. `teacher-extension/side_panel_v2.js` (+38/-4 linhas: altera o fallback de `no_match` do comando em linguagem natural nas linhas 345–385 para disparar `SKILLGRAPH_EXPLORE_AND_LEARN` automaticamente antes de oferecer gravação manual).

### 4.2 Análise de Segurança e Funcionamento do Explorador (B2)
1. **Como decide o que clicar (LLM vs. Heurística):**
   - **Não usa LLM** (nem local nem nuvem) e não passa por `LlmGateway`.
   - Usa a heurística léxica determinística de `internalNavigatePortalTab` (`teacher-extension/background.js:940-976`), injetada via `chrome.scripting.executeScript`. Ela varre `a, button, [role="button"], [role="menuitem"], [role="tab"], .nav-link, .menu-item, li > a, span[onclick], div[onclick]` visíveis e pontua por casamento de substring/palavras (ex.: `text === target` $\rightarrow$ +100; `text.includes(target)` com `target.length >= 3` $\rightarrow$ +60; cada palavra de `target` com `w.length >= 3` em `text` $\rightarrow$ +25; em `href` $\rightarrow$ +15). Clica no elemento de maior pontuação se `bestScore >= 20` (`background.js:975`).
2. **Risco de Prompt Injection:**
   - Como não há LLM na decisão de clique, textos da página não entram em prompt de LLM. Porém, há **risco severo de clique falso-positivo por substring**: qualquer palavra de $\ge 3$ letras no pedido da professora que apareça num botão visível (e.g., botão `"Excluir Nota"` quando a professora pede `"ver nota"`) soma +25 pontos, ultrapassa o corte `bestScore >= 20` e **é clicado imediatamente**.
3. **Limites e Guardas de Segurança:**
   - **Limite de passos:** Executa exatamente **1 clique** por chamada (`background.js:976`).
   - **Lista de ações proibidas (excluir, enviar, pagar, remover):** **AUSENTE.** Não há nenhuma blacklist de verbos destrutivos em `background.js:940-985`.
   - **Validação de `allowed_hosts` e parada se sair do host:** **AUSENTE.** Nem `orchestrator_v2.js:336-479` nem `background.js:930-1035` verificam `allowed_hosts` antes do clique ou se `afterTab.url` (`orchestrator_v2.js:382`) redirecionou para outro domínio.
4. **Pipeline do Trace Gerado (`scrub`, polaridade/escala, revisão humana) e Bug Estrutural:**
   - O trace sintético montado em `orchestrator_v2.js:402-447` é passado para `bundle.compile(trace, decisions)` (`orchestrator_v2.js:456`), que internamente roda `scrubGraph` (`lib/compiler/compile.ts:127`).
   - **Porém, o trace fabricado pelo explorador é estruturalmente defeituoso nos dois ramos:**
     - **Ramo A (`isUrlNavigation === true`, quando a URL muda — `orchestrator_v2.js:404-415`):** Cria `steps: [{ kind: 'navigate', url: destUrl }]`. Como o compilador (`lib/compiler/compile.ts:103-107`) extrai o `entry_fingerprint` a partir de `trace.steps[0].url`, o grafo salvo passa a exigir que a professora **já esteja em `destUrl`** para começar a rodar! Quando ela tentar executar a habilidade a partir da página inicial (`startUrl`), o runner abortará na largada com `E_FINGERPRINT_MISMATCH`.
     - **Ramo B (`isUrlNavigation === false`, quando a URL não muda — `orchestrator_v2.js:415-433`):** Cria `steps: [{ kind: 'click', target: ... }]`. No compilador, `segmentTrace` (`lib/compiler/stages/segment.ts:91`) classifica qualquer clique fora do preâmbulo como `actionSteps`, e `assembleGraph` (`lib/compiler/stages/assemble.ts:51, 105-138`) trata `actionSteps.length > 0` como `isWriteTask = true`, compilando o clique de navegação em um nó **`CHECKPOINT` + `WRITE` (`type: 'WRITE', method: 'set_value_dispatch'`)**!

### 4.3 Comparação: Gravador Manual vs. Explorador Autônomo (Garantias Perdidas)

| Garantia do Sistema | Gravador Manual (`recorderCore.ts` + `SKILLGRAPH_COMPILE_RECORD`) | Explorador Autônomo (`SKILLGRAPH_EXPLORE_AND_LEARN`) | Classificação da Perda |
| :--- | :--- | :--- | :---: |
| **Intenção humana no elemento clicado (`isTrusted`)** | Exige clique físico da professora (`e.isTrusted === true` em `recorderCore.ts:97`). | Clica autonomamente em qualquer `button`/`a` com `score >= 20` sem lista de verbos proibidos (`background.js:975`). | **`BLOQUEIA`** |
| **Revisão humana antes de ativar (`activate: true`)** | Professora clica em "Parar e Compilar" e revisa no painel (`side_panel_v2.js:179`). | Salva e ativa automaticamente (`activate: true` em `orchestrator_v2.js:467`) sem revisão humana, sem dry-run e sem quarentena. | **`BLOQUEIA`** |
| **Integridade do grafo compilado (`entry_fingerprint` e tipo de nó)** | Grava `startUrl` no início e cliques de navegação no preâmbulo antes da tabela. | Ramo URL grava `destUrl` como `steps[0]` (quebra `entry_fingerprint`); Ramo Clique gera nó `WRITE` em vez de `CLICK`. | **`BLOQUEIA`** |
| **Decisão explícita de polaridade / escala** | Mostra card `#sgv2-compiler-decisions` (`side_panel_v2.html:103`) quando exigido. | Passa `decisions = { task_id, task_name }` fixo (`orchestrator_v2.js:450`) sem perguntar à professora. | **`DÍVIDA`** |
| **Verificação de `allowed_hosts` na transição** | Restrito aos cliques que a própria professora realizou na aba. | Não valida se o clique tirou a aba do host do portal antes de salvar `destUrl` no grafo. | **`DÍVIDA`** |

---

## 5. B3 — Matriz de Extração e Inserção (C4)

### 5.1 Matriz Tipo-de-Dado × Operação

| Operação | Tipo de Dado / Controle | Status | Nível E | Evidência (`arquivo:linha`) e Detalhes Técnicos |
| :--- | :--- | :---: | :---: | :--- |
| **LEITURA** | `<table>` HTML padrão (`<thead>`/`<tbody>`/`<tr>`/`<td>`) | `IMPLEMENTADO REAL` | E2 | `lib/runner/nodes/read.ts:28-44` $\rightarrow$ `lib/runner-dom/driver.ts:120-124` $\rightarrow$ `readHtmlTable` (`lib/runner-dom/tableReader.ts:65-126`). Extrai cabeçalhos, linhas e células, mapeia `columns` e aplica `transforms` (`read.ts:75-100`). |
| **LEITURA** | Célula mesclada (`colspan`/`rowspan`) e cabeçalho em 2 linhas | `IMPLEMENTADO REAL` | E2 | `expandMergedHeaderGrid` (`lib/runner-dom/tableReader.ts:13-63`) constrói matriz 2D expandindo `rowSpan` e `colSpan` e concatena nomes compostos (`Parent - Child`). |
| **LEITURA** | Descarte de linhas não-dados (`skip_rows` / `skip_empty_rows`) | `IMPLEMENTADO REAL` | E2 | `shouldSkipRow` (`lib/runner-dom/tableReader.ts:112-120` e `lib/runner/nodes/loop.ts:76-92`) filtra totais, médias e linhas vazias. |
| **LEITURA** | Grid / `<div>` / Cartões (`cards`) | `PARCIAL` (Acoplado a fixture) | E2 | `readHtmlTable` (`lib/runner-dom/tableReader.ts:77-89`) só lê cartões se o elemento tiver a classe literal `.cards-container` ou `querySelector('.cards-container')`, buscando filhos `.aluno-box, .student-card, [role="row"]` e fixando cabeçalhos `['Nome do Aluno', 'Nota']`. Não funciona em grids genéricos de portais reais. |
| **LEITURA** | Lista (`<ul>`, `<ol>`, `<li>`, `source.kind === 'list'`) | `STUB` (Quebrado) | E2 | `executeReadNode` (`lib/runner/nodes/read.ts:46-57`) trata `source.kind === 'list'` chamando `driver.readTable({ tableAnchor: resolvedItemAnchor })`! Como `readHtmlTable` procura `<tr>` dentro do elemento, ler um `<ul>` ou `<li>` retorna `rows: []`. |
| **LEITURA** | Texto livre (`source.kind === 'text'`) | `IMPLEMENTADO REAL` | E2 | `lib/runner/nodes/read.ts:58-63` $\rightarrow$ `DomDriver.readText` (`lib/runner-dom/driver.ts:126-129`), lê `el.textContent?.trim()`. |
| **LEITURA** | Valor de `<input>` / `<select>` / `<textarea>` (`readValue`) | `IMPLEMENTADO REAL` | E2 | `DomDriver.readValue` (`lib/runner-dom/driver.ts:131-137`) retorna `{ value: el.value ?? el.textContent, checked: el.checked }`. |
| **LEITURA** | Tabela paginada (`node.paginate`) | `STUB` (Ignorado) | E2 | `executeReadNode` (`lib/runner/nodes/read.ts:33`) passa `paginate: node.paginate`, mas `DomDriver.readTable` (`driver.ts:120-124`) e `readHtmlTable` (`tableReader.ts:65`) **ignoram o parâmetro `options.paginate`**, lendo somente a primeira página. |
| **LEITURA** | Tabela virtualizada (`virtual_scroll`) | `AUSENTE` | E2 | Zero implementação de scroll incremental + deduplicação de linhas em `lib/runner-dom/tableReader.ts` ou `lib/runner-dom/driver.ts`. |
| **LEITURA** | **Download de arquivo (`DOWNLOAD`)** | **`STUB`** | E2 | `executeDownloadNode` (`lib/runner/nodes/download.ts:15-56`) chama `driver.download(...)`. Em `DomDriver.download` (`lib/runner-dom/driver.ts:233-243`), o código apenas dá `el.click()` e **retorna um objeto falso hardcoded**: `return { success: true, filename: 'download_resultado.csv', sizeBytes: 1024 }`. Não usa `chrome.downloads` nem verifica se um arquivo foi baixado. |
| **ESCRITA** | `<input type="text">` e `<textarea>` | `IMPLEMENTADO REAL` | E2 | `executeWriteNode` (`lib/runner/nodes/write.ts:19-227`) $\rightarrow$ `writeElementValue` (`lib/runner-dom/writer.ts:71-103`). Usa native setter (`HTMLInputElement.prototype` / `HTMLTextAreaElement.prototype`), dispara `focus`, `input`, `change`, `blur`, verifica `afterValue` e reverte em falha (`write.ts:160-200`). |
| **ESCRITA** | Número com máscara / vírgula (`grade_scale`) | `PARCIAL` | E2 | `executeWriteNode` (`lib/runner/nodes/write.ts:65-101`) valida escala (`min`/`max`) e formata separador decimal (`decimal_separator: ','` ou `'.'`). Porém, em `writer.ts:95-96`, exige `normalizeText(afterValue) === normalizeText(options.value)`. Se o portal aplicar máscara assíncrona ou sufixo (ex.: transformar `"8,5"` em `"8,50"` no `blur`), o read-back falha e desfaz a escrita com `E_READBACK_MISMATCH`. |
| **ESCRITA** | `<select>` nativo | `IMPLEMENTADO REAL` | E2 | `writeElementValue` (`lib/runner-dom/writer.ts:48-69`) localiza `<option>` por `value` ou `text` normalizado, define `selectEl.value`, dispara `input`/`change`/`blur`, faz read-back e reversão (`writer.ts:64`, `write.ts:165`). |
| **ESCRITA** | Checkbox / Radio com polaridade (`attendance`) | `PARCIAL` (**Bug de polaridade**) | E2 | Em `lib/runner-dom/writer.ts:24-30`: `if (options.polarity === 'presence') { targetChecked = options.value === 'true' \|\| options.value === '1' ... } else if (options.polarity === 'absence') { targetChecked = options.value === 'true' \|\| options.value === '1' ... }`. **Os dois ramos calculam exatamente a mesma expressão!** A polaridade (`checked_is_present` vs `checked_is_absent`) não inverte `targetChecked` quando a professora quer lançar falta! |
| **ESCRITA** | Data (`<input type="date">` vs Datepicker JS) | `PARCIAL` | E2 | Funciona apenas em `<input type="date">` nativo recebendo `YYYY-MM-DD` via setter nativo (`writer.ts:72`). Não suporta calendários pop-up customizados (Bootstrap Datepicker, Flatpickr, MUI DatePicker, jQuery UI). |
| **ESCRITA** | **Upload de arquivo (`UPLOAD`)** | **`STUB`** | E2 | `executeUploadNode` (`lib/runner/nodes/upload.ts:15-69`) chama `driver.upload(...)`. Em `DomDriver.upload` (`lib/runner-dom/driver.ts:245-265`), **cria um arquivo falso hardcoded em memória**: `new File(['conteudo,arquivo\n1,2'], options.fileRef || 'upload.csv', { type: 'text/csv' })`, injeta via `DataTransfer`, e se o elemento nem for `<input type="file">`, ainda retorna `{ success: true, filename: ... }` (linha 264)! |
| **ESCRITA** | Editor Rich Text / `contenteditable` | `PARCIAL` | E2 | `writer.ts:105-113` atribui `el.textContent = options.value` e dispara `input`/`change`/`blur` se `el.isContentEditable`. Funciona em `div[contenteditable]` simples, mas falha em editores baseados em iframe ou estado interno (TinyMCE, CKEditor, Quill, ProseMirror). |
| **ESCRITA** | Campo dentro de Iframe / Shadow DOM | `PARCIAL` | E2 | Funciona para Shadow DOM `open` e iframe de **mesma origem** quando ancorado diretamente (`selectors.ts:15-28`). Falha se estiver dentro de `locateRow` com Shadow DOM por linha ou em iframe **cross-origin**. |

### 5.2 Garantias de Escrita por Tipo de Controle (`writer.ts` + `write.ts`)

| Tipo de Controle | Setter Nativo + Eventos (`focus`/`input`/`change`/`blur`)? | Read-back (`verified`)? | Reversão Física (`beforeValue`) em Falha? | Evidência (`arquivo:linha`) |
| :--- | :---: | :---: | :---: | :--- |
| `<input>` texto/número | **SIM** (`HTMLInputElement.prototype.value`) | **SIM** (`writer.ts:95`) | **SIM** (`write.ts:165-171`) | `lib/runner-dom/writer.ts:71-103`, `lib/runner/nodes/write.ts:160-200` |
| `<textarea>` | **SIM** (`HTMLTextAreaElement.prototype.value`) | **SIM** (`writer.ts:95`) | **SIM** (`write.ts:165-171`) | `lib/runner-dom/writer.ts:71-103`, `lib/runner/nodes/write.ts:160-200` |
| `<select>` | **SIM** (`selectEl.value = matchedOption.value`) | **SIM** (`writer.ts:64`) | **SIM** (`write.ts:165-171`) | `lib/runner-dom/writer.ts:48-69`, `lib/runner/nodes/write.ts:160-200` |
| `<input type="checkbox\|radio">` | **SIM** (`el.click()` ou `.checked` + eventos) | **SIM** (`writer.ts:42`) | **SIM** (`write.ts:165-171`) | `lib/runner-dom/writer.ts:16-46` (com bug de polaridade nas linhas 24-30) |
| `[contenteditable]` | **PARCIAL** (`el.textContent = ...`) | **SIM** (`writer.ts:109`) | **SIM** (`write.ts:165-171`) | `lib/runner-dom/writer.ts:105-113` |

### 5.3 Controles Comuns em Portais Escolares SEM Suporte Hoje
1. **Selects/Comboboxes customizados sem `<select>` nativo:** React-Select, Select2, Chosen, Angular Material (`<mat-select>`), MUI Autocomplete (exigem clique no container + espera de portal/dropdown + clique em `<div role="option">`).
2. **Datepickers pop-up customizados:** Flatpickr, jQuery UI Datepicker, Bootstrap Datepicker com input `readonly`.
3. **Editores WYSIWYG de pareceres pedagógicos:** TinyMCE (usa `<iframe>` interno), CKEditor 5 (modelo de documento próprio), Quill.
4. **Inputs numéricos com formatação/máscara no `blur`:** Portais que convertem `"8"` para `"8,00"` ou `"8.0"` após `blur` causam aborto por `E_READBACK_MISMATCH` (`writer.ts:95`).
5. **Upload real de anexos/atestados/planilhas:** O nó `UPLOAD` ignora o arquivo da professora e injeta string estática `'conteudo,arquivo\n1,2'` (`driver.ts:253`).
6. **Download real de diários/boletins PDF/CSV:** O nó `DOWNLOAD` retorna `'download_resultado.csv'` fictício (`driver.ts:241`).
7. **Tabelas com scroll virtual (ag-Grid, React-Window, TanStack Virtual):** Apenas as linhas montadas no viewport inicial são lidas.
8. **Drag-and-drop e Canvas:** Sem primitiva no contrato ou no `DomDriver`.

### 5.4 Varredura de `TODO | not implemented | E_NODE_UNSUPPORTED | return {` Fictício em `lib/runner*`
- `lib/runner/nodes/unsupported.ts:13-33`: `executeUnsupportedNode` lança `new RunnerError('E_NODE_UNSUPPORTED', ...)` (usado para nós `UNSUPPORTED` explícitos).
- `lib/runner-dom/driver.ts:240-243` (`DomDriver.download`):
  ```typescript
  return {
    success: true,
    filename: 'download_resultado.csv',
    sizeBytes: 1024,
  }
  ```
- `lib/runner-dom/driver.ts:252-264` (`DomDriver.upload`):
  ```typescript
  const file = new File(['conteudo,arquivo\n1,2'], options.fileRef || 'upload.csv', { type: 'text/csv' })
  ...
  return { success: true, filename: options.fileRef || 'upload.csv' }
  ```
- `lib/runner-dom/driver.ts:183-214` (`DomDriver.paginate`): implementa apenas clique único em seletor quebrado (`button:has-text("Próxima")`) e retorna `{ paginated: true, page: 2, atBoundary: false }` fixo (`page: 2` hardcoded na linha 204!).

---

## 6. B4 — Generalidade "Qualquer Portal" (C4)

### 6.1 Mapeamento dos 21 Arquétipos (`docs/ARCHETYPES.md`) contra o Código Real (E2)

| # | Arquétipo (`docs/ARCHETYPES.md`) | Tier Declarado | Fixture no Repositório | Suporte Real no `DomDriver` / `RemoteDriver` (E2) | Status Real |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **1** | Tabela HTML Padrão | Tier 1 | `standard.html` | `readHtmlTable` (`tableReader.ts:65`) lê `<thead>`/`<tbody>` e `writer.ts` escreve. | `IMPLEMENTADO REAL` |
| **2** | Cabeçalho Mesclado Multi-linha | Tier 1 | `merged_headers.html` | `expandMergedHeaderGrid` (`tableReader.ts:13-63`) expande `colSpan`/`rowSpan`. | `IMPLEMENTADO REAL` |
| **3** | Diário de Classe em Grid de Checkboxes | Tier 1 | `diario_grid.html` | Localiza linha/coluna, mas `writer.ts:24-30` tem **bug de polaridade** (`presence` == `absence`). | `PARCIAL` |
| **4** | Tabela com Linhas de Resumo / Rodapé | Tier 1 | `summary_rows.html` | `shouldSkipRow` (`tableReader.ts:112`, `loop.ts:76`) pula totais/médias. | `IMPLEMENTADO REAL` |
| **5** | Formulário Individual por Aluno ( Detalhe) | Tier 1 | `student_detail_form.html` | `CLICK` + `WRITE` funciona se for SPA sem reload; se recarregar página, `CLICK.expect_navigation` é ignorado (`click.ts:44`). | `PARCIAL` |
| **6** | Layout de Cartões / Grid CSS (`<div>`) | Tier 1 | `cards_grid.html` | Hardcoded para `.cards-container` e `.aluno-box, .student-card` (`tableReader.ts:77-80`). | `PARCIAL` (Fixture-bound) |
| **7** | Abas / Seções em SPA | Tier 1 | `portal_com_abas.html` | `CLICK` + `WAIT` funciona no mesmo documento (`click.ts`, `branch.ts`). | `IMPLEMENTADO REAL` |
| **8** | Filtro por Turma/Período em Pré-requisito | Tier 1 | `portal_com_abas.html` | Compilador suporta query URL e abas (`assemblePreamble.ts`), mas **rejeita `<select>` de turma** que não muda URL com `E_UNSUPPORTED_PATTERN` (`PHASE3A_REPORT.md:42`). | `PARCIAL` |
| **9** | Paginação por Botão ("Próxima") | Tier 1 | `pagination.html` | `readTable` ignora `paginate` (`tableReader.ts:65`); `DomDriver.paginate` tem seletor inválido `:has-text` (`driver.ts:187`). | `STUB` |
| **10** | Scroll Infinito / Lazy Loading | Tier 1 | `infinite_scroll.html` | `DomDriver.scroll` (`driver.ts:159`) não faz scroll incremental para carregar novos itens. | `STUB` |
| **11** | Tabela Virtualizada (DOM Reciclado) | Tier 2 | `virtualized_table.html` | Sem implementação no `DomDriver`/`tableReader.ts`. | `AUSENTE` |
| **12** | Iframe de Mesma Origem | Tier 1 | `same_origin_iframe.html` | `queryAllInShadowAndFrames` (`selectors.ts:21-28`) atravessa `iframe.contentDocument`. | `IMPLEMENTADO REAL` |
| **13** | Iframe Cross-Origin | Tier 2 | `cross_origin_iframe.html` | `selectors.ts:27` engole erro; `RemoteDriver.setFrameId` nunca é chamado pelo runner. | `AUSENTE` |
| **14** | Web Components com Shadow DOM (`open`) | Tier 1 | `shadow_dom.html` | `selectors.ts:15-19` atravessa `shadowRoot` aberto para âncoras, mas `tableReader.ts` usa `querySelectorAll('tr')` plano. | `PARCIAL` |
| **15** | Inputs Controlados por React / Vue / Angular | Tier 1 | `react_controlled.html` | `writer.ts:73-77` usa `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set`. | `IMPLEMENTADO REAL` |
| **16** | Notas com Vírgula e Escala 0–10 / 0–100 | Tier 1 | `comma_grades.html` | `write.ts:65-101` valida escala e formata vírgula. | `IMPLEMENTADO REAL` |
| **17** | Exportação / Download de Arquivo (CSV/PDF) | Tier 1 | `download_export.html` | `DomDriver.download` (`driver.ts:233-243`) retorna `'download_resultado.csv'` hardcoded. | `STUB` |
| **18** | Importação / Upload de Planilha (`input[type=file]`) | Tier 1 | `file_upload.html` | `DomDriver.upload` (`driver.ts:245-265`) injeta string fixa `'conteudo,arquivo\n1,2'`. | `STUB` |
| **19** | Barreira de Login / Sessão Expirada | Tier 1 | `portal_com_login.html` | Compilador gera `HANDOFF_HUMAN` (`assemblePreamble.ts:43`) e runner pausa (`checkpoint.ts:71`). | `IMPLEMENTADO REAL` |
| **20** | Diálogo de Confirmação Póstuma (Modal) | Tier 1 | `confirm_modal.html` | Suportado via `CLICK` + `WAIT` se gravado, exceto `window.confirm()` nativo bloqueante. | `PARCIAL` |
| **21** | Portal Lento / Latência Variável | Tier 1 | `slow_portal.html` | `WAIT` (`branch.ts:39`) faz polling até `timeout_ms`, mas reconexão de RPC após reload expira em 2,4s (`remoteDriver.ts:86`). | `PARCIAL` |

### 6.2 Resultado Medido (Suíte / HOLDOUT do Dono)
- **`NÃO MEDIDO` (`NÃO EXECUTADO (dono)`).** Não existe `docs/GATE_RESULTS.md` no repositório e nenhum teste contra o conjunto HOLDOUT ou portais reais foi executado pelo dono.
- **Veredito sobre a alegação "qualquer portal":** **NÃO é uma alegação verificável nem verdadeira hoje.** Dos 21 arquétipos documentados em `docs/ARCHETYPES.md` (19 deles declarados como "Tier 1"), apenas **8** possuem suporte real completo no `DomDriver`, **7** são parciais (com restrições severas ou bugs como polaridade de checkbox e seletor de turma por `<select>`) e **6** são stubs ou ausentes.

### 6.3 Os 10 Arquétipos/Controles Mais Prováveis de Falhar em Portais Escolares Reais
1. **Filtro de Turma/Disciplina por `<select>` que atualiza a tabela via AJAX sem mudar a URL:** O compilador (`lib/compiler/stages/segment.ts` / `PHASE3A_REPORT.md:42`) rejeita esse padrão com `E_UNSUPPORTED_PATTERN`.
2. **Paginação de Diário de Classe ("Próxima página" / `1 2 3`):** `DomDriver.readTable` ignora `options.paginate` (`tableReader.ts:65`) e `DomDriver.paginate` quebra com `SyntaxError` no seletor `:has-text("Próxima")` (`driver.ts:187`).
3. **Lançamento de Falta em Checkbox com Polaridade `checked_is_absent`:** `writer.ts:24-30` não inverte o booleano entre `presence` e `absence`.
4. **Cliques em Menus/Links que Recarregam a Página (`expect_navigation: true`):** `executeClickNode` (`click.ts:44`) não espera a navegação concluir antes de disparar o próximo nó, e se o reload levar >2,4s, o `RemoteDriver` perde o RPC (`remoteDriver.ts:86`).
5. **Selects e Comboboxes Customizados (Select2, React-Select, MUI, PrimeNG):** Muito comuns em portais modernos (TOTVS, Sponte, i-Educar moderno); `writer.ts:48` só manipula `<select>` HTML nativo.
6. **Inputs de Nota com Formatação Automática no `blur` (ex.: `"8,5"` $\rightarrow$ `"8,50"`):** O read-back estrito (`writer.ts:95`) considera divergência, reverte o campo para vazio e aborta com `E_READBACK_MISMATCH`.
7. **Grids de Alunos em `<div>` / Cartões:** `tableReader.ts:77` exige literalmente a classe `.cards-container`, que só existe na fixture de teste.
8. **Iframes Cross-Origin (ex.: módulo de notas hospedado em subdomínio distinto do ERP):** `selectors.ts:27` ignora iframes cross-origin e o runner não alterna `frameId`.
9. **Editores de Parecer Descritivo (TinyMCE / CKEditor / Quill):** `writer.ts:105` só faz `el.textContent = ...`, que não atualiza o estado interno de editores ricos.
10. **Download de Boletins/Diários e Upload de Planilhas:** Ambos são stubs fictícios em `DomDriver` (`driver.ts:233-265`).

---

## 7. B5 — UX e Features Sem Terminal (C3)

### 7.1 Auditoria Capacidade a Capacidade (`side_panel_v2.html/js` e `desktop/ui`)

| # | Capacidade para a Professora (Sem Terminal) | Status | Evidência (`arquivo:linha`) e Diagnóstico |
| :---: | :--- | :---: | :--- |
| **1** | **Primeiro uso e conexão com o app** | `NÃO` (Exige terminal) | Não há instalador executável `.exe` configurado no `package.json`. O primeiro uso exige rodar `npm run build:ext`, `npm run desktop:build`, `npx tsx scripts/native-host-register.ts --register` e `npm run desktop:dev` no terminal (`docs/desktop/INSTALL.md:20-58`). |
| **2** | **Indicador de conexão com o app** | `SIM` | `teacher-extension/side_panel_v2.html:16` (`#sgv2-native-badge`) e `side_panel_v2.js:63-74` mostram `"App Conectado"` (verde) ou `"App Desconectado"` (vermelho) via `SKILLGRAPH_CHECK_NATIVE`. |
| **3** | **Pedir por texto (linguagem natural)** | `PARCIAL` (Quebra ao preencher form) | `side_panel_v2.html:27-35` (`#sgv2-nl-input`, `#sgv2-btn-nl-send`) e `side_panel_v2.js:334-396` enviam `SKILLGRAPH_NL_COMMAND`. Porém, se casar com uma habilidade, chama `selectSkillForExecution` (`side_panel_v2.js:239`), que quebra com `TypeError: params.forEach is not a function`! |
| **4** | **Ensinar (gravar demonstração)** | `SIM` | `side_panel_v2.html:82-101` (`#sgv2-btn-start-record`, `#sgv2-btn-stop-record`) e `side_panel_v2.js:116-215` iniciam/param a gravação e persistem passos entre páginas em `chrome.storage.local` (`orchestrator_v2.js:516-640`). |
| **5** | **Revisar e decidir polaridade/escala** | `PARCIAL` (Bug de default) | `side_panel_v2.html:103-128` (`#sgv2-compiler-decisions`) exibe rádios de polaridade e escala. **Bug de UX (`side_panel_v2.html:108`, `side_panel_v2.js:186`):** o rádio `"grade"` (Nota numérica) vem `checked` por padrão no HTML e `side_panel_v2.js:186` envia `decisions.grade_scale = ...` em **toda** compilação se a professora não mudar manualmente para `"other"`, fazendo `assemble.ts:88` forçar `semantic = 'grade'` em habilidades genéricas! |
| **6** | **Dry-run / Pré-visualização de habilidade própria** | `NÃO` (Apenas pacote comunitário) | No painel v2 (`side_panel_v2.html:52-55`), o botão `#sgv2-btn-run-skill` sempre envia `dryRun: false` (`side_panel_v2.js:264`). Só existe botão de dry-run para pacotes comunitários em quarentena no app desktop (`desktop/ui/app.js:354`). |
| **7** | **CHECKPOINT legível com diff e edição** | `PARCIAL` (Edição ignorada) | `side_panel_v2.html:159-185` (`#modal-checkpoint`) mostra os campos (`#modal-checkpoint-summary`) e caixa de edição `#checkpoint-editable-text` (`side_panel_v2.js:440-476`). **Bug:** ao aprovar, `side_panel_v2.js:470` envia `{ action: 'SKILLGRAPH_CHECKPOINT_RESPONSE', requestId, approved: true, updatedText }`, mas `workerEntry.ts:128-135` lê apenas `message.approved` e **descarta `updatedText`**! |
| **8** | **Executar habilidade pelo menu** | `NÃO` (**Quebrado por 3 bugs**) | (1) `side_panel_v2.js:286` lê `s.task_id` em vez de `s.identity?.task_id`; (2) `side_panel_v2.js:239` chama `params.forEach` num objeto `Record`; (3) `orchestrator_v2.js:116` verifica `if (resp && resp.graph)`, mas `desktop/main.ts:75` retorna o `SkillGraphV2` direto (sem `.graph`), abortando toda execução com `"Mapa não encontrado"`! |
| **9** | **Progresso em tempo real (passo atual, barra, %)** | `SIM` | `side_panel_v2.html:57-68` (`#sgv2-progress-container`, `#sgv2-progress-bar`, `#sgv2-step-label`) e `side_panel_v2.js:399-435` atualizam passo e porcentagem a cada evento `node_started`/`node_completed`. |
| **10** | **Cancelar execução em andamento** | `SIM` | `side_panel_v2.html:66` (`#sgv2-btn-abort`) e `side_panel_v2.js:88-96` enviam `SKILLGRAPH_ABORT`, que chama `currentActiveHost.abort()` (`orchestrator_v2.js:235`). |
| **11** | **Erros em linguagem simples (vs. códigos `E_*` crus)** | `PARCIAL` (`E_*` vazam no painel) | `orchestrator_v2.js:16-30` possui `FRIENDLY_ERRORS`, mas em `orchestrator_v2.js:222` envia `errorCode: err.code` no evento `run_aborted`, e `side_panel_v2.js:428` exibe `Falha: ${ev.data?.reason || ev.data?.error || 'Erro desconhecido'}` onde `err.message` ou códigos não mapeados (`E_GRAPH_INVALID`, `E_NODE_UNSUPPORTED`, `E_PII_SCRUB_FAILED`, `E_COMPILE_NO_STEPS`, `E_UNSUPPORTED_PATTERN`) aparecem crus para a professora. |
| **12** | **Histórico de execuções / auditoria visível** | `PARCIAL` | O app desktop mostra contagens de auditoria no Dashboard (`desktop/ui/app.js:65-75`) e exporta pacote `.zip` (`app.js:271`), mas **não há tela/tabela legível** listando cada execução ("Nota 8,5 lançada para Ana às 14h"). |
| **13** | **Reverter versão de habilidade (IPC e UI)** | `NÃO` (Órfão na UI e no IPC) | `SqlSkillGraphRepository.setActive(portalId, taskId, version)` existe em `lib/desktop-core/db/repositories/SqlSkillGraphRepository.ts:151-177`, mas **não está registrado** em `desktop/main.ts`, nem em `preload.ts`, nem tem botão em `desktop/ui/app.js` ou `side_panel_v2.js`. |
| **14** | **Listar / Renomear / Excluir / Exportar habilidades** | `PARCIAL` | **Listar e Exportar:** existem no app desktop (`desktop/ui/app.js:119-155, 395-445`). **Renomear e Excluir:** **NÃO existem** em nenhuma UI nem no IPC (`desktop/main.ts`). |
| **15** | **Restaurar backup `.tbackup`** | `NÃO` (**Apenas texto/placeholder**) | Criar backup funciona (`desktop/ui/app.js:237-268`), mas a "Restauração" em `desktop/ui/index.html:231-235` é **apenas um parágrafo estático de texto** sem `<input type="file">` e sem botão! |
| **16** | **Agendar / Repetir tarefa** | `NÃO` | Ausente no painel v2 e no app desktop. |
| **17** | **Lote (várias turmas / vários alunos de uma vez)** | `PARCIAL` | Se o grafo tiver nó `LOOP` sobre tabela, percorre as linhas da tabela atual (`loop.ts:18-137`). Porém, não há UI para selecionar múltiplas turmas ou enviar uma planilha/lista de notas em lote pelo painel v2. |
| **18** | **Estados vazios e carregando** | `SIM` | `side_panel_v2.html:43` (`"Carregando habilidades..."`) e `desktop/ui/app.js:126, 175, 315` exibem mensagens claras de estado vazio. |
| **19** | **Acessibilidade básica (teclado, contraste, ARIA)** | `PARCIAL` | Bom contraste visual, mas faltam atributos `role="dialog"`, `aria-modal="true"` e trap de foco no `#modal-checkpoint` (`side_panel_v2.html:159`) e `aria-live="polite"` na barra de progresso (`side_panel_v2.html:57`). |
| **20** | **Instalação sem terminal (O10)** | `NÃO` | Sem instalador `.exe`/`.msi` (NSIS/Electron-Builder ausentes em `package.json`). |

### 7.2 O Que Impediria uma Professora Leiga de Concluir a Tarefa Sozinha Hoje
1. **Impossibilidade de instalar sem terminal:** Ela precisaria abrir o PowerShell e rodar 5 comandos de build/registro (`docs/desktop/INSTALL.md`).
2. **Menu de habilidades quebrado após gravar a 1ª habilidade:** Assim que ela grava uma habilidade com parâmetros, `renderSkillsCatalog` (`side_panel_v2.js:286`) mostra `undefined` como subtítulo e clicar na habilidade lança `TypeError: params.forEach is not a function` (`side_panel_v2.js:239`).
3. **Falha 100% ao clicar em "Executar Habilidade":** Mesmo em habilidades sem parâmetros, `orchestrator_v2.js:116` procura `resp.graph` no retorno de `graphs.resolveActive`, que não tem `.graph`, devolvendo erro `"Mapa para esta ação não encontrado"`.
4. **Edição inócua no modal de CHECKPOINT:** Se ela corrigir um texto no `#checkpoint-editable-text` antes de clicar em "Aprovar e Gravar", o motor ignora a edição dela e escreve o texto antigo (`workerEntry.ts:128`).

---

## 8. B6 — Linguagem Natural com Nuances (C5)

### 8.1 Anatomia de `nlu.parse` (`desktop/llm/llmGateway.ts`, `side_panel_v2.js`, `orchestrator_v2.js`)
- **Onde vive:** `side_panel_v2.js:340` envia `SKILLGRAPH_NL_COMMAND` $\rightarrow$ `orchestrator_v2.js:893-911` busca o catálogo via `graphs.listActive` e chama `nativeClient.send('nlu.parse', { text, catalog })` $\rightarrow$ `desktop/main.ts:116-118` chama `llmGateway.parseIntent(params.text, params.catalog)` em [`desktop/llm/llmGateway.ts:160-333`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/desktop/llm/llmGateway.ts#L160-L333). (Não existe diretório `lib/nlu`).
- **Usa modelo LLM?** **NÃO.** Apesar do nome `LlmGateway`, `parseIntent` (`llmGateway.ts:160-333`) é **100% heurístico por regex e busca de substring**, sem nenhuma chamada HTTP ao Ollama local nem a provedores em nuvem.
- **Recebe o catálogo e devolve schema fechado?** Sim (`NluParseResult` em `llmGateway.ts:27-35`: `{ status: 'matched' | 'no_match', task_id?, task_name?, params?, confidence, message? }`), validado na entrada por `MethodParamSchemas['nlu.parse']` (`lib/desktop-core/protocol/schemas.ts:105-115`).
- **Bug de contrato no catálogo (`llmGateway.ts:255`):** `parseIntent` faz `const declaredParams = item.params || []; for (const p of declaredParams)`. Como `graphs.listActive` retorna objetos `SkillGraphV2` onde `params` é um `Record<string, ParamDefinition>` (Objeto, não Array), se um grafo do catálogo tiver `params` definido como objeto, `for (const p of declaredParams)` lança **`TypeError: declaredParams is not iterable`**!

### 8.2 Comportamento diante das 11 Nuances de C5

| # | Nuance de Linguagem Natural | Suportado? | Como o Código Lida (`desktop/llm/llmGateway.ts:160-333`) |
| :---: | :--- | :---: | :--- |
| **1** | **Ambiguidade (várias habilidades parecidas)** | `NÃO` | Calcula `score` por palavras em comum (`llmGateway.ts:198-238`) e **escolhe silenciosamente a primeira de maior score** (`if (score > bestScore)`), sem nunca fazer pergunta de esclarecimento. |
| **2** | **Parâmetros faltantes** | `PARCIAL` | Extrai apenas os parâmetros que casarem com regex (`llmGateway.ts:255-322`) e preenche o formulário no painel (`side_panel_v2.js:368-379`), deixando os demais campos em branco no DOM sem perguntar quais faltam. |
| **3** | **Datas relativas ("ontem", "sexta passada", "hoje")** | `NÃO` | A regex de data (`llmGateway.ts:266`: `/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/`) só aceita datas numéricas explícitas (`DD/MM/AAAA` ou `AAAA-MM-DD`). Nem a NLU nem o runner convertem `"ontem"` ou `"hoje"`. |
| **4** | **Nomes de alunos com apelido / homônimo / acento** | `PARCIAL` | Normaliza acentos na comparação de cabeçalhos, e captura nomes após `"para "`, `"aluno "` (`llmGateway.ts:288-295`), mas não resolve apelidos ("Chico" $\rightarrow$ "Francisco") nem desambigua homônimos na NLU (o runner aborta com `E_ROW_AMBIGUOUS` em `navigate.ts:82`). |
| **5** | **Lote ("lança falta para todos menos o João")** | `NÃO` (**Perigoso**) | A regex `/(?:para\s+(?:o|a)?\s*|alun[oa]\s+)([a-zA-ZÀ-ÿ\s]{2,40}?)(?:\s+na\s+|\s+em\s+|\s+com\s+|\s+nota\s+|$)/i` (`llmGateway.ts:289`) casa `"para todos menos o João"` ou extrai `"o João"`, transformando a **exceção** no **alvo** da falta! |
| **6** | **Correção ("na verdade foi 7,5")** | `NÃO` | Sem memória de turno anterior; `"na verdade foi 7,5"` não tem verbo de tarefa, pontua `bestScore = 0` e retorna `status: 'no_match'`. |
| **7** | **Múltiplas tarefas numa frase ("leia a chamada e lance nota 8 para Ana")** | `NÃO` | Escolhe apenas 1 `bestMatch` por frase (`llmGateway.ts:189`). |
| **8** | **Negações ("não lance falta para a Maria")** | `NÃO` (**Perigoso**) | Ignora a palavra `"não"`, pontua `"lance"` + `"falta"` (`score += 18`) e extrai `"Maria"` como alvo para **lançar** a falta! |
| **9** | **Contexto de conversa (histórico) e memória ("na turma de ontem")** | `NÃO` | `parseIntent(text, catalog)` é stateless: não recebe histórico de mensagens nem consulta o banco SQLite de turmas/execuções passadas. |
| **10** | **Gírias / português coloquial / erros de digitação ("bota 8,5 pra Bia", "lansa falta")** | `PARCIAL` | Possui lista curta de sinônimos exatos (`llmGateway.ts:206-235`: `'nota'`, `'falta'`, `'chamada'`, `'observacao'`), mas não tem distância de edição (fuzzy/Levenshtein) nem verbos coloquiais como `"bota"` ou `"lansa"` com `s`. |
| **11** | **Fallback sem Ollama e `no_match` $\rightarrow$ "me ensine"** | `PARCIAL` | Como não usa Ollama, nunca falha por ausência do Ollama. Quando retorna `no_match`, `side_panel_v2.js:345-385` agora dispara primeiro `SKILLGRAPH_EXPLORE_AND_LEARN` (que clica sozinho na página!) e só se o explorador falhar exibe o box `#sgv2-teach-me-box` ("Me ensine"). |

### 8.3 Cobertura de Testes de NLU
- Existem **apenas 3 casos de teste de NLU** em `__tests__/desktop.core.test.ts` (seção `7. Roteamento de Linguagem Natural Restrito ao Catálogo (G3)`): (1) match simples com tarefa existente no catálogo; (2) retorno `no_match` para habilidade inexistente; (3) catálogo vazio $\rightarrow$ `no_match`. Nenhuma das nuances de C5 (datas relativas, negações, exceções, correções, ambiguidades) possui teste.

### 8.4 Três Exemplos Suportados vs. Três Não Suportados (por Leitura de `llmGateway.ts:160-333`)

**3 Exemplos Suportados (quando `catalog.params` é array):**
1. **Entrada:** `"lançar nota 8,5 para Mariana Lima na turma 6A"` (com `lancar_nota` no catálogo)  
   **Saída:** `{ status: 'matched', task_id: 'lancar_nota', params: { grade: '8,5', student_name: 'Mariana Lima', class_code: '6A' }, confidence: 0.95 }`
2. **Entrada:** `"ler chamada da turma 9B"` (com `read_roster` no catálogo)  
   **Saída:** `{ status: 'matched', task_id: 'read_roster', params: { class_code: '9B' }, confidence: 0.85 }`
3. **Entrada:** `"registrar observação: Aluno entregou trabalho completo para Lucas"` (com `custom:registrar_observacao` no catálogo)  
   **Saída:** `{ status: 'matched', task_id: 'custom:registrar_observacao', params: { texto: 'Aluno entregou trabalho completo', student_name: 'Lucas' }, confidence: 0.9 }`

**3 Exemplos NÃO Suportados:**
1. **Entrada com exceção/negação:** `"lança falta para todos menos o João"`  
   **Comportamento atual:** Retorna `status: 'matched'` com `task_id: 'lancar_falta'` e `student_name: 'todos menos o João'` (ou `'o João'`), invertendo o sentido do pedido.
2. **Entrada com data relativa e referência:** `"repete a chamada da turma de ontem"`  
   **Comportamento atual:** Não resolve `"ontem"` para data nem consulta a turma usada ontem; retorna `params: {}`.
3. **Entrada de correção conversacional:** `"ops, na verdade foi 7,5"`  
   **Comportamento atual:** Como não há verbo/substantivo da tarefa na frase e não há histórico de conversa, retorna `{ status: 'no_match', confidence: 0 }`.

### 8.5 Avaliação de Risco: O LLM Pode Influenciar Valores Escritos? Há CHECKPOINT Integral?
- Na arquitetura atual, `nlu.parse` apenas preenche os inputs do formulário `#sgv2-dynamic-params` no painel (`side_panel_v2.js:368-379`) e **não dispara `SKILLGRAPH_RUN` sozinho** (exceto quando cai em `no_match` e aciona o explorador `SKILLGRAPH_EXPLORE_AND_LEARN`).
- No motor `SkillGraphRunner`, toda escrita (`WRITE`) exige `writes_require_checkpoint: true` (`lib/compiler/stages/safety.ts:24`) e o nó `CHECKPOINT` (`lib/runner/nodes/checkpoint.ts:26-40`) envia o valor integral resolvido para aprovação humana + ack write-ahead no Desktop antes do `WRITE` (`lib/runner/nodes/write.ts:138-145`).

---

## 9. B7 — Ligação e Cadeias Ponta a Ponta (N1 a N8)

| Fluxo | Cadeia Salto a Salto (`arquivo:linha`) e Status de Cada Salto | Onde Quebra Exatamente? |
| :--- | :--- | :--- |
| **N1 — "Ir ao menu X e abrir a página Y" (navegação multi-página gravada)** | 1. Gravar clique no menu X (`lib/recorder-dom/recorderCore.ts:95` `CONECTADO`) $\rightarrow$ 2. Persistir passo em `chrome.storage.local` (`orchestrator_v2.js:560` `CONECTADO`) $\rightarrow$ 3. Gravar `navigate` no `tabs.onUpdated` e re-injetar gravador (`orchestrator_v2.js:916-949` `CONECTADO`) $\rightarrow$ 4. Compilar preâmbulo com `CLICK (expect_navigation: true)` + `NAVIGATE` (`lib/compiler/stages/assemblePreamble.ts:87-120` `CONECTADO`) $\rightarrow$ 5. Executar via painel (`side_panel_v2.js:264` $\rightarrow$ `orchestrator_v2.js:116` `DESCONECTADO`) $\rightarrow$ 6. `executeClickNode` ignora `expect_navigation` (`lib/runner/nodes/click.ts:44` `STUB`). | **Quebra no Salto 5** (`orchestrator_v2.js:116`: `resp.graph` é `undefined` porque `desktop/main.ts:75` retorna o grafo direto). Mesmo corrigido, **quebra no Salto 6** (`click.ts:44` não espera a navegação do clique antes do próximo nó). |
| **N2 — Explorar menu desconhecido e aprender** | 1. Digitar pedido no painel (`side_panel_v2.js:340` `CONECTADO`) $\rightarrow$ 2. `nlu.parse` retorna `no_match` (`orchestrator_v2.js:900` `CONECTADO`) $\rightarrow$ 3. Painel chama `SKILLGRAPH_EXPLORE_AND_LEARN` (`side_panel_v2.js:348` `CONECTADO`) $\rightarrow$ 4. `internalNavigatePortalTab` clica por heurística (`background.js:930-985` `CONECTADO`) $\rightarrow$ 5. Monta trace sintético e compila (`orchestrator_v2.js:402-456` `CONECTADO`, mas defeituoso) $\rightarrow$ 6. Salva com `activate: true` (`orchestrator_v2.js:467` `CONECTADO`) $\rightarrow$ 7. Reexecutar grafo aprendido (`engine.ts:85` `DESCONECTADO`). | **Quebra no Salto 7 (Reexecução):** se o clique mudou a URL, `steps[0].url` foi gravado como `destUrl` (`orchestrator_v2.js:406`), fazendo o runner abortar com `E_FINGERPRINT_MISMATCH` na página inicial; se não mudou a URL, o clique foi compilado como nó `WRITE` (`assemble.ts:105`)! |
| **N3 — Ler tabela paginada e salvar no app** | 1. Resolver grafo (`orchestrator_v2.js:116` `DESCONECTADO`) $\rightarrow$ 2. `executeReadNode` chama `driver.readTable({ paginate: node.paginate })` (`lib/runner/nodes/read.ts:33` `CONECTADO`) $\rightarrow$ 3. `DomDriver.readTable` ignora `options.paginate` (`lib/runner-dom/driver.ts:120` / `tableReader.ts:65` `STUB`) $\rightarrow$ 4. Orquestrador envia `students.upsertFromPortal` com `source: host` string (`orchestrator_v2.js:211-215` `DESCONECTADO`) $\rightarrow$ 5. `pipeServer.ts:207` valida `MethodParamSchemas['students.upsertFromPortal']` (`schemas.ts:95-102`) que exige `source: { portalId, readAt }`. | **Quebra nos Saltos 1, 3 e 4:** (1) `resp.graph` undefined; (3) `readHtmlTable` lê apenas a página 1 e ignora paginação; (4) `students.upsertFromPortal` falha na validação Zod de `source` (`string` vs `{ portalId, readAt }`)! |
| **N4 — Preencher formulário multi-etapa (wizard) com CHECKPOINT** | 1. Compilar múltiplos passos de ação (`lib/compiler/stages/assemble.ts:95-138` `DESCONECTADO` — só compila `actionSteps[actionSteps.length - 1]`, descartando os campos anteriores!) $\rightarrow$ 2. Preencher parâmetros no painel (`side_panel_v2.js:239` `DESCONECTADO` — `params.forEach` quebra) $\rightarrow$ 3. Passar parâmetros ao runner (`orchestrator_v2.js:199` `DESCONECTADO` — passa `{}` em `params`) $\rightarrow$ 4. Exibir `CHECKPOINT` + ack write-ahead + `WRITE` (`checkpoint.ts:26`, `write.ts:138` `CONECTADO`). | **Quebra nos Saltos 1, 2 e 3:** o compilador (`assemble.ts:95`) pega apenas o **último** passo de escrita (`lastAction`) em vez de gerar múltiplos nós `WRITE` para o wizard; `side_panel_v2.js:239` falha em `params.forEach`; e `orchestrator_v2.js:199` passa `params = {}` para `runner.run`. |
| **N5 — Baixar boletim (download)** | 1. Executar nó `DOWNLOAD` (`lib/runner/nodes/download.ts:15-56` `CONECTADO`) $\rightarrow$ 2. `RemoteDriver.download` (`lib/runner-ext/remoteDriver.ts:199` `CONECTADO`) $\rightarrow$ 3. `ContentAdapter` (`lib/runner-ext/contentAdapter.ts:99` `CONECTADO`) $\rightarrow$ 4. `DomDriver.download` (`lib/runner-dom/driver.ts:233-243` `STUB`). | **Quebra no Salto 4:** `DomDriver.download` apenas clica no elemento e retorna `{ success: true, filename: 'download_resultado.csv', sizeBytes: 1024 }` hardcoded, sem monitorar `chrome.downloads`. |
| **N6 — Pedido em linguagem natural → formulário → execução** | 1. Enviar texto (`side_panel_v2.js:340` `CONECTADO`) $\rightarrow$ 2. `orchestrator_v2.js:896` busca `graphs.listActive` e chama `nlu.parse` (`CONECTADO`) $\rightarrow$ 3. `llmGateway.parseIntent` itera `for (const p of declaredParams)` (`desktop/llm/llmGateway.ts:255` `DESCONECTADO` se `params` for objeto) $\rightarrow$ 4. Painel chama `selectSkillForExecution` (`side_panel_v2.js:366` $\rightarrow$ `239` `DESCONECTADO` em `params.forEach`) $\rightarrow$ 5. Executar (`orchestrator_v2.js:116, 199` `DESCONECTADO`). | **Quebra nos Saltos 3, 4 e 5:** incompatibilidade `Record` vs `Array` em `params` (`llmGateway.ts:255` e `side_panel_v2.js:239`), `resp.graph` em `orchestrator_v2.js:116` e `params = {}` em `orchestrator_v2.js:199`. |
| **N7 — Popup de login → handoff → retomada** | 1. `SSOHandoffManager` detecta popup filho (`lib/runner-ext/ssoHandoff.ts:110` `CONECTADO`) $\rightarrow$ 2. Runner executa `HANDOFF_HUMAN` (`lib/runner/nodes/checkpoint.ts:71-123` `CONECTADO`, mas não integrado ao `ssoManager`) $\rightarrow$ 3. Card `#sgv2-handoff-box` exibido no painel (`side_panel_v2.js:488` `CONECTADO`) $\rightarrow$ 4. Professora clica em "Já resolvi — Continuar" (`side_panel_v2.js:103` $\rightarrow$ `workerEntry.ts:138` `CONECTADO`) $\rightarrow$ 5. Runner avalia `resume_when` (`checkpoint.ts:104` `CONECTADO`). | **Funciona manualmente pelo botão do painel**, mas a retomada automática quando o popup SSO fecha (`ssoHandoff.ts:195`) está **DESCONECTADA** de `pendingHandoffs` em `workerEntry.ts:66-87` (exige que o grafo já esteja num nó `HANDOFF_HUMAN` e que a professora clique manualmente no botão do painel). |
| **N8 — Falha no meio (rede/aba fechada/SW reciclado) → estado seguro sem escrita duplicada** | 1. Persistência de estado a cada nó em `chrome.storage.session` (`orchestrator_v2.js:167-182` `CONECTADO`) $\rightarrow$ 2. Falha de RPC durante `WRITE` (`remoteDriver.ts:86` `CONECTADO`) $\rightarrow$ 3. Loop de retry do nó em `engine.ts:115-163` (`CONECTADO` com `max_attempts: 2` em `assemble.ts:132`) $\rightarrow$ 4. Se o SW reciclar, `orchestrator_v2.js` **não tem lógica de retomada** de `activeRun` a partir de `chrome.storage.session` (`DESCONECTADO`). | **Quebra no Salto 3 (Risco de escrita duplicada):** se a aba recarregar ou perder conexão após o `WRITE` alterar o DOM mas antes de responder ao RPC, `engine.ts:115` retenta o `WRITE`. Se o SW reciclar, a execução morre silenciosamente sem limpar o estado no painel. |

---

## 10. B8 — Build e Testes Executados (E1)

### 10.1 Tabela de Execução do Orçamento Permitido (1x cada)

| # | Comando Executado | Código de Saída | Resultado / Contagem | Tempo |
| :---: | :--- | :---: | :--- | :---: |
| **1** | `npx tsc --noEmit` | `0` | Zero erros de compilação TypeScript (`[saída vazia]`) | ~8s |
| **2** | `npm run build:ext` | `0` | Bundles gerados e verificados em `teacher-extension/dist/` | ~9s |
| **3** | `npm run desktop:build` | `0` | Artefatos gerados em `dist-desktop/` | ~7s |
| **4** | `npx vitest run __tests__/skillGraphV2.contract.test.ts __tests__/graphRunner.core.test.ts __tests__/compiler.core.test.ts __tests__/repair.core.test.ts __tests__/desktop.core.test.ts __tests__/community.core.test.ts __tests__/extensionHost.integration.test.ts` | `0` | **7 arquivos aprovados (7/7), 137 testes passaram, 0 falharam** (`contract`: 12, `repair`: 15, `compiler`: 11, `desktop`: 24, `community`: 35, `graphRunner`: 27, `extensionHost`: 13) | 11,31s |

### 10.2 Cobertura de Navegação Real vs. `FakeDriver` / `MockDriver`
- **Quais testes executados cobrem navegação com driver REAL (`DomDriver` + `RemoteDriver` + `chrome.tabs.update`)?**
  - **NENHUM (0 de 137 testes).**
  - Em `__tests__/graphRunner.core.test.ts` (27 testes), todos os testes — incluindo o teste `7. [NAVIGATE]` adicionado no commit `b2444b0` (linhas 1175–1202) — rodam sobre a classe `FakeDriver` em memória (`graphRunner.core.test.ts:15-190`), onde `navigate(url)` apenas faz `this.navigatedUrls.push(url); this.currentUrl = url`.
  - Em `__tests__/extensionHost.integration.test.ts` (13 testes), todos os testes rodam sobre `MockDriver` em memória (`extensionHost.integration.test.ts:10-65`).
- **Invariantes de C1–C5 que só têm teste com driver falso ou mock:**
  1. **C1/C2:** Execução de `NAVIGATE`, `CLICK` com `expect_navigation`, `LOCATE` com `scroll_until_found`, `PAGINATE`, `WAIT`, reconexão de RPC após recarga de página e `SSOHandoffManager` (todos testados apenas com `FakeDriver` ou mocks de `chrome.tabs`).
  2. **C3:** Integração entre `side_panel_v2.js`, `orchestrator_v2.js` e `desktop/main.ts` **não tem nenhum teste automatizado** — razão pela qual os 4 bugs de contrato (`s.params.forEach`, `s.task_id`, `resp.graph` e `runner.run(graph, {})`) passaram despercebidos pelos 137 testes!
  3. **C4:** `DOWNLOAD`, `UPLOAD`, leitura de listas `<ul>/<li>`, paginação em `READ` e polaridade de checkbox em `DomDriver` não são exercitados contra DOM real nos 7 arquivos da suíte.
  4. **C5:** `LlmGateway.parseIntent` só foi testado com `params` em formato array mockado, não com um `SkillGraphV2` real vindo de `SqlSkillGraphRepository.listActive()` (onde `params` é um `Record`).

---

## 11. B9 — Bloqueios (`BLOQUEIA`), Dívida Técnica e Recomendação sobre o Explorador

### 11.1 Lista dos 8 `BLOQUEIA` (Ordenados por Dependência)

| Ordem | ID | Descrição do Bloqueio e Localização (`arquivo:linha`) | Objetivos Afetados | Esforço | Cabe em 1 Tarefa? |
| :---: | :---: | :--- | :---: | :---: | :---: |
| **1** | **BLQ-1** | **Quebras de contrato na ponte Painel v2 $\leftrightarrow$ Orquestrador $\leftrightarrow$ Desktop:** (a) `side_panel_v2.js:239,286` usa `s.task_id` e `s.params.forEach` em vez de `s.identity.task_id` e `Object.entries(s.params)`; (b) `orchestrator_v2.js:116` lê `resp.graph` quando `desktop/main.ts:75` retorna o grafo direto; (c) `orchestrator_v2.js:199` passa `{}` como `params` em `runner.run(graph, {}, ...)`; (d) `orchestrator_v2.js:214` envia `source` string em `students.upsertFromPortal` em vez de `{ portalId, readAt }`; (e) `llmGateway.ts:255` faz `for (const p of declaredParams)` num objeto `Record`. | **C3, C4, C5** | **P** | **SIM** |
| **2** | **BLQ-2** | **Explorador autônomo inseguro e gerador de grafos inválidos (`b2444b0`):** `SKILLGRAPH_EXPLORE_AND_LEARN` (`orchestrator_v2.js:336-479` + `background.js:930-985`) clica em elementos com `score >= 20` sem blacklist de verbos destrutivos, grava `destUrl` como `steps[0]` (quebrando `entry_fingerprint` na reexecução) ou compila clique de navegação como nó `WRITE`, e salva no banco com `activate: true` (linha 467) sem revisão humana nem dry-run. | **C1, C2, C3** | **P** | **SIM** |
| **3** | **BLQ-3** | **Lacunas críticas de navegação real e risco de escrita duplicada no reload:** (a) `RemoteDriver.navigate` (`remoteDriver.ts:219-222`) dá `resolve()` sem erro quando o timeout de 10s estoura; (b) `executeNavigateNode` (`navigate.ts:49-50`) não valida `allowed_hosts` quando `node.path` é URL absoluta e força `https://` em URLs relativas; (c) `executeClickNode` (`click.ts:44`) ignora `node.expect_navigation`; (d) `WRITE` com `retry.max_attempts: 2` (`assemble.ts:132`, `engine.ts:115`) pode repetir a escrita se a página recarregar durante o RPC. | **C1, C2** | **M** | **SIM** |
| **4** | **BLQ-4** | **Paginação e Scroll Incremental desconectados/quebrados no `DomDriver`:** `DomDriver.readTable` (`driver.ts:120`) e `readHtmlTable` (`tableReader.ts:65`) ignoram `options.paginate`; `executeLocateNode` (`navigate.ts:89-105`) ignora `paginate_until_found`; `DomDriver.scroll` (`driver.ts:159`) não faz scroll incremental; e `DomDriver.paginate` (`driver.ts:187`) usa seletor inválido `button:has-text("Próxima")` que lança `SyntaxError`. | **C1, C4** | **M** | **SIM** |
| **5** | **BLQ-5** | **Bugs de Extração/Inserção no `DomDriver` e no Compilador:** (a) `writer.ts:24-30` calcula o mesmo booleano para `presence` e `absence` (não inverte polaridade de falta em checkbox); (b) `read.ts:46-57` chama `readTable` para `source.kind === 'list'` (falha em `<ul>/<li>`); (c) `tableReader.ts:77` exige classe `.cards-container` de fixture; (d) `assemble.ts:95` descarta todos os passos de escrita exceto o último (`lastAction`), impedindo formulários multi-campo/wizards; (e) `DomDriver.download` (`driver.ts:233`) e `DomDriver.upload` (`driver.ts:245`) são stubs fictícios. | **C4** | **M** | **SIM** |
| **6** | **BLQ-6** | **Edição de texto no CHECKPOINT descartada e default `"grade"` forçado na gravação:** (a) `workerEntry.ts:128-135` ignora `message.updatedText` enviado pelo `#modal-checkpoint` (`side_panel_v2.js:470`); (b) `side_panel_v2.html:108` e `side_panel_v2.js:186` enviam `grade_scale` por padrão em toda gravação, forçando habilidades genéricas a serem compiladas como lançamento de nota (`assemble.ts:88`). | **C3, C4** | **P** | **SIM** |
| **7** | **BLQ-7** | **Operações de gestão e resiliência ausentes na UI/IPC:** `SqlSkillGraphRepository.setActive` (reversão de versão) está órfão sem handler em `desktop/main.ts` nem botão na UI; não há opção de excluir habilidade ou restaurar backup `.tbackup` (`desktop/ui/index.html:233` é apenas texto); e não há script de instalador sem terminal (`.exe` NSIS/Electron-Builder). | **C3** | **M** | **SIM** |
| **8** | **BLQ-8** | **NLU estática sem nuances nem proteção contra negação/exceção:** `LlmGateway.parseIntent` (`desktop/llm/llmGateway.ts:160-333`) não resolve datas relativas ("ontem"), ignora palavras de negação ("não lance") e captura exceções ("todos menos o João" $\rightarrow$ aluno `"João"`), além de não pedir esclarecimento em ambiguidades. | **C5** | **M** | **SIM** |

### 11.2 Dívida Técnica (`DÍVIDA`) e Observações (`OBSERVAÇÃO`)
- **`DÍVIDA-1` (C2):** Coexistência de `internalNavigatePortalTab` (`background.js:930`) e `DISCOVERY_FIND_AND_CLICK_STUDENT` (`background.js:1624`) no `background.js` ao lado do `SkillGraphRunner`.
- **`DÍVIDA-2` (C1/C4):** Iframes cross-origin engolidos em `selectors.ts:27` sem uso de `RemoteDriver.setFrameId` / `ContentAdapter.listFrames`.
- **`DÍVIDA-3` (C1):** `SSOHandoffManager` (`ssoHandoff.ts`) não resolve automaticamente a promessa de `pendingHandoffs` em `workerEntry.ts:66-87` quando o popup SSO fecha, exigindo clique manual no botão do painel.
- **`DÍVIDA-4` (C3):** Códigos internos `E_*` (`E_GRAPH_INVALID`, `E_UNSUPPORTED_PATTERN`, `E_PII_SCRUB_FAILED`) ainda podem aparecer crus em mensagens de falha no painel v2 (`side_panel_v2.js:428`).
- **`OBSERVAÇÃO-1` (C3):** Faltam atributos `role="dialog"`, `aria-modal="true"` e `aria-live="polite"` nos modais e barras do painel v2 (`side_panel_v2.html:57, 159`).

### 11.3 Recomendação Única sobre o Explorador (`SKILLGRAPH_EXPLORE_AND_LEARN`)
- **Recomendação:** **Converter imediatamente para modo "Me ensine" assistido (desativando tanto o clique autônomo cego quanto o auto-salvamento `activate: true`)**.
- **Justificativa por risco:**
  1. Clicar autonomamente no DOM de um portal escolar autenticado usando uma heurística de substring (`score >= 20` para qualquer palavra $\ge 3$ letras em `background.js:952-975`) sem lista de verbos proibidos pode acionar botões destrutivos ("Excluir", "Encerrar Diário", "Enviar Notas") antes de qualquer `CHECKPOINT`.
  2. Salvar e ativar o grafo resultante com `activate: true` (`orchestrator_v2.js:467`) sem revisão humana nem dry-run viola diretamente os princípios de segurança do motor (O2, O5 e O6) e contamina o banco SQLite com grafos estruturalmente quebrados (`entry_fingerprint` apontando para `destUrl` ou clique compilado como `WRITE`).
  3. Quando `nlu.parse` retornar `no_match`, o comportamento seguro é destacar/sugerir visualmente o candidato no DOM (ou abrir direto o card `#sgv2-teach-me-box` com o nome da habilidade pré-preenchido) para que a professora clique com `isTrusted: true`, revise polaridade/escala e aprove a ativação.

---

## 12. B10 — Roteiro de Validação do Dono (≤ 60 min, 8 Passos)

> **Importante:** Este roteiro testa exatamente o comportamento real no Chrome + App Desktop e expõe de imediato onde C1–C5 funcionam ou quebram hoje.

| Passo | Tempo Est. | O Que Fazer no Chrome e no App | Resultado Esperado pela Régua (C1–C5) | Comportamento Previsto no Código Atual (`HEAD = b2444b0`) |
| :---: | :---: | :--- | :--- | :--- |
| **1. Navegação multi-página gravada (`pagination.html` / `portal_com_abas.html`)** | 8 min | Subir `npm run harness` (`127.0.0.1:8898`) e `npm run desktop:dev`. Abrir `http://127.0.0.1:8898/fixtures/portal_com_abas.html`. Na aba **Gravar** do painel v2, digitar `"Abrir aba e ler chamada"`, clicar em **Iniciar Gravação**, clicar numa aba/link que troque de contexto, clicar na tabela e clicar em **Parar e Compilar** $\rightarrow$ **Confirmar e Salvar**. Depois ir à aba **Executar** e rodar. | Grava a transição sem perder o log, compila, aparece na lista de habilidades e, ao executar, navega e lê a tabela. | A gravação persiste entre páginas (`cf3cfde`), mas ao abrir a aba **Executar** e clicar em **Executar Habilidade**, falha porque `orchestrator_v2.js:116` procura `resp.graph` (inexistente). |
| **2. Leitura de tabela paginada (`pagination.html`)** | 7 min | Abrir `http://127.0.0.1:8898/fixtures/pagination.html`. Gravar a leitura da tabela e o clique no botão de próxima página. Executar a habilidade e verificar no app Desktop (**Turmas e Alunos**) quantos alunos foram importados. | Deve percorrer todas as páginas da tabela e salvar todos os alunos no banco SQLite do app Desktop. | Lê apenas a página 1 (`tableReader.ts:65` ignora `paginate`) e `students.upsertFromPortal` falha no Zod porque `source` é enviado como string (`orchestrator_v2.js:214`). |
| **3. Escrita com CHECKPOINT (`standard.html` / `diario_grid.html`)** | 8 min | Abrir `http://127.0.0.1:8898/fixtures/standard.html`. Gravar lançamento de nota em um campo de input. Na aba **Executar**, preencher a nota, clicar em **Executar**, revisar o modal **Confirmação Obrigatória (CHECKPOINT)**, editar o valor se aplicável e clicar em **Aprovar e Gravar**. | Exibe o modal de CHECKPOINT antes de tocar no DOM, grava o ack de auditoria no app Desktop, escreve o valor com read-back e atualiza o campo. | Se a habilidade tiver parâmetros, clicar nela no menu lança `TypeError: params.forEach is not a function` (`side_panel_v2.js:239`). |
| **4. App fechado = escrita aborta (Fail-Closed)** | 5 min | Fechar o aplicativo Desktop Electron. Verificar que o badge no topo do painel v2 muda para `"App Desconectado"`. Tentar executar uma habilidade de escrita e aprovar o CHECKPOINT. | A escrita deve **abortar imediatamente** com erro de auditoria indisponível (`E_AUDIT_UNAVAILABLE`), sem alterar nenhum campo no DOM do portal. | Se o runner for disparado sem o app Desktop, `NativeAuditSink.append` falha e `executeWriteNode` (`write.ts:143`) aborta antes de chamar `driver.write`. |
| **5. Popup de login / Barreira de Auth (`portal_com_login.html`)** | 7 min | Com o app aberto, abrir `http://127.0.0.1:8898/fixtures/portal_com_login.html`. Gravar um fluxo que passa pela tela de login (digitando senha de teste) até a tabela. Verificar que a senha não foi gravada no grafo e que, na execução, o card amarelo **Ação Necessária no Portal (Handoff)** pausa o motor até o clique em **"Já resolvi — Continuar"**. | Nenhum caractere da senha entra no trace (`sensitive_field`); a execução pausa no `HANDOFF_HUMAN` e retoma após o login. | O gravador emite `sensitive_field` sem valor (`recorderCore.ts:127`) e o compilador gera `HANDOFF_HUMAN` (`assemblePreamble.ts:43`). |
| **6. Pedido em linguagem natural com 3 nuances** | 8 min | Na caixa *"O que você quer fazer?"* do painel v2, testar 3 frases: (a) `"lançar nota 8,5 para Ana na turma 6A"`; (b) `"lançar falta para todos menos o João ontem"`; (c) `"na verdade foi 7,5"`. | (a) Preenche form de `lancar_nota`; (b) entende exceção `"menos o João"` e data `"ontem"` (ou pede esclarecimento); (c) corrige a nota para `7,5`. | (a) Quebra em `llmGateway.ts:255` (`declaredParams is not iterable`) ou em `side_panel_v2.js:239` (`params.forEach`); (b) extrai `"João"` como alvo da falta e ignora `"ontem"`; (c) cai em `no_match` e dispara o explorador autônomo! |
| **7. Reversão de versão de habilidade** | 5 min | Provocar uma mudança de seletor (ou abrir o app Desktop na visão **Mapas de Portais**) e procurar o botão para **reverter uma habilidade da versão 2 para a versão 1**. | A professora consegue reverter para a versão anterior clicando num botão na interface. | **Não existe botão nem handler IPC** para reverter versão (`SqlSkillGraphRepository.setActive` está órfão). |
| **8. Leitura em UM portal real (somente leitura, conta do dono)** | 12 min | Acessar o portal escolar real (ex.: `machadosobrinho.paineldoaluno.com.br`) já autenticado. Usar a aba **Gravar** para ensinar apenas a **leitura de uma lista de alunos** (sem nenhuma escrita). Compilar, salvar e verificar no app Desktop. | Grava os cliques e a seleção da tabela sem erro de permissão de host, compila sem vazar PII no grafo (`scrubGraph`) e lista a habilidade no app Desktop. | A gravação e compilação funcionam (`de7dc60` e `cf3cfde`), mas a listagem/execução no painel v2 esbarra no BLQ-1 (`s.params.forEach` / `resp.graph`). |

### Tabela de Registro de Evidências do Dono (Para Copiar e Preencher)

```markdown
| Passo | O que fiz | Mensagem exibida na UI | Saída no Console (Service Worker / Painel) |
| :---: | :--- | :--- | :--- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
```

---

## 13. Apêndice: Comandos, Saídas Literais, Auditoria de Relatórios Anteriores e Requisitos

### 13.1 Comandos e Saídas Literais de B0 e B8

#### A. `git status --short; git branch --show-current; git log --oneline -12; git show --stat HEAD`
```text
fechamento-integracao
b2444b0 feat(engine): amalgama de navegacao real com auto-cache de exploracao autonoma
cf3cfde fix(recorder): persistencia de gravacao multi-pagina e ajuste no timeout nativo
de7dc60 fix(ext): cancela necessidade de permissao de host e ajusta shim native messaging
16633af fix(ext): exibir painel v2 por padrao sem ocultar body
e3968d5 audit: estado do engine
a31c97a skill(R): correcao final
546ff8b skill(G5): fechamento
fed9233 skill(G4): texto seguro com checkpoint integral
5f8961b skill(G3): roteamento nlu ao catalogo
d1fb190 skill(G2): compilador sem esqueleto fixo
19f9334 skill(G1): menu gerado do catalogo
c533b68 gate(H6): fechamento
commit b2444b00ab25fd4dbd4c868e07a96aabae04292a
Author: Teacher AI <rafael@teacher-ai.local>
Date:   Thu Oct 15 21:33:44 2026 -0300

    feat(engine): amalgama de navegacao real com auto-cache de exploracao autonoma

 __tests__/graphRunner.core.test.ts   |  35 ++++++++
 lib/runner-dom/driver.ts             |  14 ++++
 lib/runner-ext/contentAdapter.ts     |   3 +
 lib/runner-ext/protocol.ts           |   1 +
 lib/runner-ext/remoteDriver.ts       |  57 ++++++++++++-
 lib/runner/nodes/navigate.ts         |   7 ++
 lib/runner/types.ts                  |   2 +
 teacher-extension/background.js      |   1 +
 teacher-extension/orchestrator_v2.js | 156 +++++++++++++++++++++++++++++++++++
 teacher-extension/side_panel_v2.js   |  38 ++++++++-
 10 files changed, 310 insertions(+), 4 deletions(-)
```
*(Nota: a saída de `git status --short` foi vazia `[saída vazia]`).*

#### B. `git grep -n "activate: true" -- teacher-extension lib desktop` e `git grep -n "SKILLGRAPH_EXPLORE_AND_LEARN" -- teacher-extension lib desktop`
```text
teacher-extension/orchestrator_v2.js:467:                  await nativeClient.send('graphs.save', { graph: savedGraph, activate: true })
teacher-extension/orchestrator_v2.js:723:            await nativeClient.send('graphs.save', { graph, activate: true })
teacher-extension/orchestrator_v2.js:854:            await nativeClient.send('graphs.save', { graph: patched, activate: true })
teacher-extension/orchestrator_v2.js:336:    if (message.action === 'SKILLGRAPH_EXPLORE_AND_LEARN') {
teacher-extension/side_panel_v2.js:348:            chrome.runtime.sendMessage({ action: 'SKILLGRAPH_EXPLORE_AND_LEARN', text }, (exploreRes) => {
```

#### C. `npx tsc --noEmit` (1x)
```text
(código de saída 0, saída vazia)
```

#### D. `npm run build:ext` (1x)
```text
> teacher-ai@0.1.0 build:ext
> npx tsx scripts/build-extension-runner.ts

[Build Ext] Compilando bundles do SkillGraph v2 (DEV=false) para teacher-extension...
[Build Ext] Bundles gerados com sucesso e verificados em teacher-extension/dist/!
```

#### E. `npm run desktop:build` (1x)
```text
> teacher-ai@0.1.0 desktop:build
> npx tsx scripts/build-desktop.ts

[Build Desktop] Empacotando casca Electron...
[Build Desktop] Sucesso: Artefatos gerados em dist-desktop/!
```

#### F. `npx vitest run` nos 7 arquivos (1x)
```text
 RUN  v3.2.7 C:/Users/rafae/Documents/antigravity/hopeful-bell

 ✓ __tests__/skillGraphV2.contract.test.ts (12 tests) 318ms
 ✓ __tests__/repair.core.test.ts (15 tests) 151ms
 ✓ __tests__/compiler.core.test.ts (11 tests) 243ms
 ✓ __tests__/desktop.core.test.ts (24 tests) 1133ms
   ✓ Desktop Core — Teste de Fronteira (Fase 6) > 2. Backup Cifrado > deve criar backup e restaurar com a senha correta  385ms
   ✓ Desktop Core — Teste de Fronteira (Fase 6) > 2. Backup Cifrado > deve rejeitar senha incorreta com E_BACKUP_BAD_PASSPHRASE  537ms
 ✓ __tests__/community.core.test.ts (35 tests) 227ms
 ✓ __tests__/graphRunner.core.test.ts (27 tests) 181ms
 ✓ __tests__/extensionHost.integration.test.ts (13 tests) 259ms

 Test Files  7 passed (7)
      Tests  137 passed (137)
   Start at  21:54:32
   Duration  11.31s (transform 8.09s, setup 0ms, collect 25.59s, tests 2.51s, environment 7ms, prepare 3.06s)
```

### 13.2 Verificação de 5 Alegações por Relatório Anterior contra o Código Real (E2)

| Relatório Auditado | # | Alegação do Relatório | Veredito vs. Código (`arquivo:linha`) |
| :--- | :---: | :--- | :--- |
| **`docs/HABILIDADES_GENERICAS.md`** | 1 | "Menu do painel v2 gerado dinamicamente a partir de `graphs.listActive` sem IDs fixos" | **PARCIAL / QUEBRADO:** `side_panel_v2.js:270-330` busca `graphs.listActive`, mas lê `s.task_id` (em vez de `s.identity.task_id`) e quebra em `s.params.forEach` (`side_panel_v2.js:239`) porque `params` no `SkillGraphV2` é Objeto. |
| | 2 | "Compilador gera habilidades `custom:*` sem esqueleto fixo" | **CONFIRMADO (E2):** `lib/compiler/stages/assemble.ts:45-185` aceita `custom:*`, mas descarta múltiplos passos de ação exceto `lastAction` (linha 95). |
| | 3 | "Roteamento NLU restrito ao catálogo (`nlu.parse`)" | **PARCIAL (E2):** `desktop/llm/llmGateway.ts:171` restringe ao catálogo, mas a linha 255 (`for (const p of declaredParams)`) quebra quando `params` é um `Record`. |
| | 4 | "Texto livre sempre exige CHECKPOINT integral e permite edição no modal" | **PARCIAL / FALSO NA EDIÇÃO (E2):** `checkpoint.ts:26` exige CHECKPOINT, mas `workerEntry.ts:128-135` ignora o `updatedText` enviado pelo modal (`side_panel_v2.js:470`)! |
| | 5 | "Seletor de exportação no Desktop lista habilidades do banco sem `read_roster` fixo" | **CONFIRMADO (E2):** `desktop/ui/app.js:395-419` popula `#export-task-select` dinamicamente a partir de `graphs.list`. |
| **`docs/ENGINE_CLOSURE.md`** | 1 | "Gravador de produção injeta `dist/recorder.bundle.js`" | **CONFIRMADO (E2):** `teacher-extension/orchestrator_v2.js:502` injeta `files: ['dist/recorder.bundle.js']`. |
| | 2 | "Verificação estrita de `isTrusted` no gravador DOM" | **CONFIRMADO (E2):** `lib/recorder-dom/recorderCore.ts:112,125,138,151` bloqueiam eventos com `e.isTrusted === false`. |
| | 3 | "Produção v2 100% agnóstica a portais específicos" | **CONFIRMADO (E2):** Sem domínios de portais escolares hardcoded em `lib/`, `desktop/` ou `orchestrator_v2.js` (mas `tableReader.ts:77` tem classes de fixture `.cards-container`). |
| | 4 | "F3 — Compilação determinística e persistência no SQLite via `graphs.save` seguida de execução" | **PARCIAL / QUEBRADO NA EXECUÇÃO (E2):** Persiste via `graphs.save`, mas `orchestrator_v2.js:116` falha ao ler `resp.graph` de `graphs.resolveActive` (`desktop/main.ts:75`). |
| | 5 | "Checkpoints 100% interativos com timeout fail-closed e abort em tempo real" | **CONFIRMADO (E1/E2):** `lib/runner-ext/workerEntry.ts:170-220` e `__tests__/extensionHost.integration.test.ts` (13/13). |
| **`docs/INTEGRATION_REPORT.md`** | 1 | "Extensão resolve grafos reais via `graphs.resolveActive` e persiste alunos via `students.upsertFromPortal`" | **REFUTADO (E2):** `orchestrator_v2.js:116` espera `resp.graph` (mas `main.ts:75` retorna o grafo direto) e `orchestrator_v2.js:214` envia `source` como string (rejeitado por `schemas.ts:99`). |
| | 2 | "Ciclo de auto-reparo aplica patch `v+1`, executa dry-run e salva no desktop" | **CONFIRMADO (E2):** `teacher-extension/orchestrator_v2.js:801-866`. |
| | 3 | "Exportação comunitária com assinatura Ed25519 e substituição de hosts por `h0.invalid`" | **CONFIRMADO (E1/E2):** `lib/desktop-core/community/export/buildPackage.ts:45-120` e `desktop/main.ts:171-196`. |
| | 4 | "Zero portas TCP abertas pelo app desktop" | **CONFIRMADO (E2):** `desktop/main.ts` usa apenas IPC do Electron e pipe nomeado local (`\\.\pipe\teacherai-desktop`). |
| | 5 | "Diálogo de confirmação amigável de polaridade/escala na extensão" | **PARCIAL (E2):** O diálogo existe (`side_panel_v2.html:103`), mas envia `grade_scale` por padrão mesmo sem ser tarefa de nota (`side_panel_v2.js:186`). |
| **`docs/ARCHETYPES.md`** | 1 | "Arquétipo #9 (Paginação por Botão): Tier 1 Suportado" | **REFUTADO (E2):** `DomDriver.readTable` ignora `paginate` (`tableReader.ts:65`) e `DomDriver.paginate` usa seletor inválido `:has-text` (`driver.ts:187`). |
| | 2 | "Arquétipo #10 (Scroll Infinito): Tier 1 Suportado" | **REFUTADO (E2):** `DomDriver.scroll` (`driver.ts:159-166`) não realiza scroll incremental. |
| | 3 | "Arquétipo #17 (Exportação / Download): Tier 1 Suportado" | **REFUTADO (E2):** `DomDriver.download` (`driver.ts:233-243`) é um stub que retorna `'download_resultado.csv'` fixo. |
| | 4 | "Arquétipo #18 (Importação / Upload): Tier 1 Suportado" | **REFUTADO (E2):** `DomDriver.upload` (`driver.ts:245-265`) é um stub que injeta `'conteudo,arquivo\n1,2'` fixo. |
| | 5 | "Arquétipo #6 (Layout de Cartões / Grid CSS): Tier 1 Suportado" | **PARCIAL / FIXTURE-ONLY (E2):** `tableReader.ts:77` exige classe `.cards-container`. |
| **`docs/PHASE2_FINAL_REPORT.md`** | 1 | "Validação prévia de schema e integridade antes de tocar no DOM (`E_GRAPH_INVALID`)" | **CONFIRMADO (E1/E2):** `lib/runner/engine.ts:41-52`. |
| | 2 | "Respeito a domínios permitidos (`safety.allowed_hosts`)" | **PARCIAL (E2):** `lib/runner/nodes/navigate.ts:49` permite bypass se `node.path` for uma URL absoluta e `node.host` estiver omitido. |
| | 3 | "Reversão física em falha de read-back (`E_READBACK_MISMATCH`)" | **CONFIRMADO (E1/E2):** `lib/runner/nodes/write.ts:160-200`. |
| | 4 | "Descarte de linhas não-dados (`skip_rows`)" | **CONFIRMADO (E1/E2):** `lib/runner-dom/tableReader.ts:112-120` e `lib/runner/nodes/loop.ts:76-92`. |
| | 5 | "Service Worker orquestra o grafo sem ser afetado por navegações ou recarregamentos" | **PARCIAL (E2):** `sendRpc` (`remoteDriver.ts:86-92`) aguarda no máximo 2,4s em reload e `ElementHandleStore` perde todos os handles quando a página recarrega. |

### 13.3 Itens `NÃO VERIFICADO`
- **Execução ao vivo no navegador Google Chrome, aplicativo Electron aberto, servidor Ollama local e portais escolares reais:** Classificados como `NÃO EXECUTADO (dono)` / `NÃO VERIFICADO` em cumprimento estrito à regra da auditoria que proíbe abrir o Chrome, iniciar servidores/Electron, usar rede ou acessar dados reais.

### 13.4 Tabela de Autoverificação de Requisitos (`fidelidade-ao-pedido`)

| Req | Descrição da Exigência | Status | Evidência (`arquivo:linha` ou seção deste relatório) |
| :---: | :--- | :---: | :--- |
| **R1** | Somente leitura no código; único arquivo criado: `docs/AUDITORIA_CAPACIDADES.md`; commit `audit: capacidades` sem push | `FEITO` | `docs/AUDITORIA_CAPACIDADES.md` (Seção 13.1) |
| **R2** | Executar no máximo 1x cada comando do orçamento permitido (`tsc`, `build:ext`, `desktop:build`, `vitest` nos 7 arquivos) | `FEITO` | Seção 10.1 e Seção 13.1 (C, D, E, F) |
| **R3** | Auditar B0 (estado git, arquivos fora de escopo em `b2444b0`, greps de `activate: true` e `SKILLGRAPH_EXPLORE_AND_LEARN`) | `FEITO` | Seção 4.1 e Seção 13.1 (A, B) |
| **R4** | Auditar B1 (anatomia da navegação item a item, cadeias, stubs, timeout de `navigate`, `allowed_hosts`, todos os caminhos de navegação e C2) | `FEITO` | Seção 3.1, 3.2 e 3.3 |
| **R5** | Auditar B2 (explorador autônomo: decisão de clique, LLM/injeção, limites/ações proibidas, trace gerado e garantias perdidas vs. gravador manual) | `FEITO` | Seção 4.2 e 4.3 |
| **R6** | Auditar B3 (matriz extração/inserção tipo × operação, setter nativo + read-back + reversão, controles sem suporte, busca por stubs) | `FEITO` | Seção 5.1, 5.2, 5.3 e 5.4 |
| **R7** | Auditar B4 (21 arquétipos de `ARCHETYPES.md` vs. driver real, status `NÃO MEDIDO`, alegação "qualquer portal" e top 10 falhas prováveis) | `FEITO` | Seção 6.1, 6.2 e 6.3 |
| **R8** | Auditar B5 (UX sem terminal em `side_panel_v2` e `desktop/ui`, placeholders, códigos `E_*` crus e o que trava a professora leiga) | `FEITO` | Seção 7.1 e 7.2 |
| **R9** | Auditar B6 (linguagem natural `nlu.parse`, 11 nuances, testes existentes, 3 exemplos suportados e 3 não suportados, risco de escrita e CHECKPOINT) | `FEITO` | Seção 8.1, 8.2, 8.3, 8.4 e 8.5 |
| **R10** | Auditar B7 (cadeias N1 a N8 salto a salto com status e ponto exato de quebra) | `FEITO` | Seção 9 |
| **R11** | Auditar B8 (tabela de build/testes, cobertura com driver real vs. `FakeDriver`, invariantes sem teste real) | `FEITO` | Seção 10.1 e 10.2 |
| **R12** | Auditar B9 (veredito máx. 10 linhas, tabela C1–C5 com % honesto, até 8 `BLOQUEIA` ordenados, dívida e recomendação única sobre o explorador) | `FEITO` | Seção 1, Seção 2 e Seção 11 |
| **R13** | Elaborar B10 (roteiro do dono ≤ 60 min em 8 passos + tabela de registro) e conferir 5 alegações por relatório anterior | `FEITO` | Seção 12 e Seção 13.2 |

- **O que foi pedido e NÃO foi entregue:** Nada (todos os itens R1–R13 foram integralmente cumpridos).
