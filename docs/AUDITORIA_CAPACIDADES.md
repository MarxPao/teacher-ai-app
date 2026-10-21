# AUDITORIA DE CAPACIDADES DO ENGINE (Independente, Somente Leitura)

> **Data:** 16/10/2026  
> **Branch:** `fechamento-integracao` (`HEAD` em `f26e204`)  
> **Escopo:** Auditoria independente de passe único e somente leitura sobre as capacidades C1–C6 do motor Teacher AI (`lib/runner`, `lib/runner-dom`, `lib/runner-ext`, `lib/compiler`, `lib/repair`, `lib/explorer`, `teacher-extension/*`, `desktop/*`).

---

## 1. Veredito (Máx. 10 Linhas)

O engine **NÃO está pronto** para sustentar a alegação de *"navegar e extrair/inserir qualquer dado em qualquer portal escolar com garantias de segurança preservadas"*. Nenhuma das capacidades C1–C6 atinge `COMPLETO`: C1–C5 atingem no máximo `PARCIAL` (limitadas por lacunas de implementação real no Chrome MV3 e pela ausência de execução com a extensão carregada em navegador e portal reais — `NÃO EXECUTADO (dono)`), e **C6 sofreu regressão ativa (`BLOQUEIA`)**. Em particular, a introdução recente do modo *"Zero-Desktop Standalone"* (`standaloneFallback: true` por padrão em `teacher-extension/orchestrator_v2.js:279` e `lib/runner-ext/workerEntry.ts:241-285`) quebrou a invariante pétrea de segurança: **com o app Desktop fechado e `dryRun: false`, a escrita física no DOM prossegue sem ack do cofre SQLite** e grava nomes de alunos, notas (`before_value`/`after_value`) e grafos em texto claro em `chrome.storage.local`. Adicionalmente, o nó `UPLOAD` (`lib/runner/nodes/upload.ts:17-93`) muta o DOM sem auditoria write-ahead e sem respeitar `dryRun`, o explorador em produção (`orchestrator_v2.js:516-729`) não usa `domDistiller.ts` (código morto no bundle), e o teste `run-e2e-chromium.ts` injeta `DomDriver` direto via Electron sem carregar a extensão nem passar por `SkillGraphRunner`/`RemoteDriver`/`NativeClient`.

---

## 2. Tabela C1–C6

| ID | Capacidade | Status | Nível E | Justificativa Técnica (`arquivo:linha`) | O que falta para `COMPLETO` |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **C1** | **Navegar** | `PARCIAL` | E2 (código) / E1 parcial (`DomDriver` isolado) / `NÃO EXECUTADO (dono)` | `NAVIGATE` (`lib/runner/nodes/navigate.ts:16-73` → `lib/runner-ext/remoteDriver.ts:503-546`) chama `chrome.tabs.update`. Porém: (1) timeout de `navigate` (`remoteDriver.ts:526-541`) e `waitForNavigation` (`remoteDriver.ts:548-572`) resolvem com sucesso sem erro se o timer expirar; (2) `DomDriver.waitForNavigation` (`lib/runner-dom/driver.ts:461-464`) é stub (`Promise.resolve()`); (3) `DomDriver.paginate` tem `\|\| true` (`driver.ts:386`) e não implementa `mode: 'page_number'`; (4) `readTable` paginado (`driver.ts:199-243`) roda num único RPC de content script e quebra se a paginação recarregar a página. | Corrigir timeouts silenciosos em `RemoteDriver.navigate`/`waitForNavigation`, remover `\|\| true` em `driver.ts:386`, implementar `page_number`, mover loop de paginação multi-página para o `SkillGraphRunner` (sobrevivendo a reload), propagar `frameId` em `readTable`/`scroll`/`paginate` e validar no Chrome com extensão carregada. |
| **C2** | **Módulo de navegação coeso** | `PARCIAL` | E2 | Coexistem **6 caminhos concorrentes de navegação** (`executeNavigateNode`, `internalNavigatePortalTab`, `NAVIGATE_PORTAL_TAB`, `portal_navigate`, `domDistiller.ts` órfão e `sidecar/agentic_execution_loop.py`). O painel v2 usa `SkillGraphRunner` para grafos salvos, mas usa `internalNavigatePortalTab` (`background.js:930-1140`) para exploração, com regras de host e erro distintas. | Unificar a navegação do explorador e do runner sob um único pipeline (`RemoteDriver` + `checkAllowedHost` + `SSOHandoffManager`) e remover/deprecar caminhos paralelos e código morto (`domDistiller.ts` não conectado ao `orchestrator_v2.js`). |
| **C3** | **UX completa sem terminal** | `PARCIAL` | E2 / `NÃO EXECUTADO (dono)` | `side_panel_v2.html/js` e `desktop/ui/index.html` + `app.js` cobrem pedido em texto, gravação, dry-run, checkpoint com diff, progresso, cancelamento e reversão/exclusão. Porém: (1) falta renomeação de habilidade após gravada; (2) falta visualização da trilha de auditoria (`audit_log` SQLite não tem IPC `audit.list` nem tabela na UI); (3) falta UI de lote com exclusões editáveis antes do disparo; (4) `SKILLGRAPH_ACTIVATE_GRAPH` no painel ativa grafo explorado em 1 clique sem exibir relatório de nós/efeitos. | Adicionar IPC `audit.list` + tabela de auditoria no Desktop/painel, permitir renomear habilidades na gestão local, exigir revisão de nós/dry-run antes de ativar grafo explorado e validar usabilidade com professora leiga sem terminal. |
| **C4** | **Extrair e inserir qualquer dado** | `PARCIAL` | E1 (`DomDriver` em fixture) / E2 | Suporta `<table>`, ARIA grids, AG-Grid pinned/virtual, inputs, `<select>`,Select2/MUI portaled, Flatpickr e checkbox com polaridade (`tableReader.ts`, `writer.ts`). Porém: (1) `UPLOAD` (`driver.ts:519-535`) cria `new File([options.source], ...)` usando a própria string do caminho como conteúdo do arquivo (não lê bytes reais do disco/usuário); (2) `DOWNLOAD` (`driver.ts:483-486`) retorna arquivo sintético (`download_resultado.csv`, 1024 B) se não detectar evento em 300ms; (3) `tableReader.ts:164-199` desalinha colunas quando `<td>` no `<tbody>` usa `colspan > 1` ou `rowspan > 1`; (4) não há suporte a editores ricos (TinyMCE/CKEditor/Quill em iframe), máscaras dinâmicas de cursor ou drag-and-drop. | Implementar upload de arquivo real selecionado pelo usuário, remover sucesso sintético de `DOWNLOAD` quando nenhum arquivo é baixado, tratar `colspan`/`rowspan` em `<tbody>` em `tableReader.ts`, e rotear `readTable`/`download`/`upload` para `frameId` descoberto no `RemoteDriver`. |
| **C5** | **Linguagem natural com nuances** | `PARCIAL` | E1 (unitário Vitest) / E2 | `LlmGateway.parseIntent` (`desktop/llm/llmGateway.ts:154-370`) normaliza datas relativas, conceito/nota com vírgula, gírias e exclusões simples (`exceto X`), e `orchestrator_v2.js:354-366` injeta `CHECKPOINT` dinâmico antes de `WRITE`. Porém: (1) `LlmGateway.parseIntent` é **single-shot sem histórico de conversa** (correções em turno seguinte como *"na verdade 7,5"* perdem `task_id` e aluno anterior); (2) quando há múltiplos candidatos próximos no catálogo, escolhe `scored[0]` (`llmGateway.ts:346`) em vez de perguntar qual habilidade usar; (3) no fallback offline (`orchestrator_v2.js:461-485`), `filters` (ex.: `exclude_students`) e `navigation_target` extraídos por `decomposeCompoundTeacherCommand` são descartados por `side_panel_v2.js:421-437`; (4) não há execução em loop de lote por turma filtrando `exclude_students` no `orchestrator_v2.js`. | Manter contexto do último turno para correções (`"na verdade 7,5"`), retornar `clarification_question` quando 2 habilidades empatarem no catálogo, conectar `filters.exclude_students` e múltiplas sub-tarefas do decompositor ao runner/checkpoint, e testar com Ollama real (`NÃO EXECUTADO (dono)`). |
| **C6** | **Garantias de segurança preservadas** | `PARCIAL` (**REGRESSÃO `BLOQUEIA`**) | E1 (teste #14 prova o comportamento inseguro) / E2 | Três violações diretas de C6 encontradas no código atual: (1) `standaloneFallback: true` por padrão (`orchestrator_v2.js:279`, `workerEntry.ts:241-285`) permite **escrita real (`dryRun: false`) com o app Desktop fechado**, salvando auditoria em `chrome.storage.local`; (2) `standalone_audit_log_v2` (`workerEntry.ts:259-279`) mascara apenas CPF em `target_ref`, gravando nomes de alunos e notas (`before_value`/`after_value`) sem cifra em `chrome.storage.local` (além de `side_panel.js:1028` que salva `cached_roster_${className}` em texto claro); (3) `executeUploadNode` (`lib/runner/nodes/upload.ts:17-93`) faz mutação de escrita (`state.writesCount++`) **sem chamar `host.audit()` e sem respeitar `state.dryRun`**. Além disso, `saveStandaloneGraph` (`orchestrator_v2.js:91-118`) não executa `validateGraph` nem quarentena. | Remover ou restringir `standaloneFallback` estritamente a `dryRun: true` (abortando com `E_AUDIT_UNAVAILABLE` toda escrita real sem ack do Desktop), nunca gravar `before_value`/`after_value`/nomes em `chrome.storage.local`, adicionar `dryRun` + `host.audit()` em `executeUploadNode`, e exigir `validateGraph` + revisão/dry-run antes de ativar qualquer grafo aprendido. |

---

### Estado do Repositório (B0)

1. **Branch atual:** `fechamento-integracao` (`HEAD` = `f26e204 docs(handoff): gerar documento completo de handoff para o proximo agente`).
2. **Saída literal de `git status --short` (24 arquivos modificados e 4 caminhos não rastreados na working tree antes desta auditoria):**
   ```text
    M AGENTS.md
    M __tests__/desktop.core.test.ts
    M __tests__/extensionHost.integration.test.ts
    M __tests__/graphRunner.core.test.ts
    M components/EditableQuestionBoxes.tsx
    M desktop/llm/llmGateway.ts
    M desktop/main.ts
    M lib/psychometricsEngine.ts
    M lib/runner-dom/driver.ts
    M lib/runner-dom/selectors.ts
    M lib/runner-dom/tableReader.ts
    M lib/runner-dom/writer.ts
    M lib/runner-ext/protocol.ts
    M lib/runner-ext/remoteDriver.ts
    M lib/runner-ext/workerEntry.ts
    M lib/runner/nodes/write.ts
    M package.json
    M scripts/build-desktop.ts
    M teacher-extension/background.js
    M teacher-extension/manifest.json
    M teacher-extension/orchestrator_v2.js
    M teacher-extension/side_panel.js
    M teacher-extension/side_panel_v2.html
    M teacher-extension/side_panel_v2.js
   ?? desktop/nativeHost/
   ?? lib/explorer/
   ?? scripts/run-e2e-chromium.ts
   ?? tools/runner-harness/fixtures/hostile-portal-e2e.html
   ```
3. **Arquivos fora de escopo sujos na working tree:** `AGENTS.md`, `components/EditableQuestionBoxes.tsx`, `lib/psychometricsEngine.ts` e `teacher-extension/side_panel.js`.
4. **Saída literal de `git log --oneline -15` e `git show --stat HEAD`:**
   ```text
   f26e204 docs(handoff): gerar documento completo de handoff para o proximo agente
   b0d0350 fix(engine,ux): fechar lacunas residuais de auditoria C1-C5 (download/upload reais, dry-run UI, select write, scheme e NLU coloquial)
   39f7e54 feat(engine,ux): fechamento completo BLQ-5d, BLQ-6b, BLQ-7, BLQ-8, DIVIDA-3, DIVIDA-4
   1748817 feat(engine): amalgamar algoritmos de browser agents (browser-use, nanobrowser, stagehand, skyvern, agent-e) e corrigir contratos v2
   2f75e0a audit: capacidades
   b2444b0 feat(engine): amalgama de navegacao real com auto-cache de exploracao autonoma
   cf3cfde fix(recorder): persistencia de gravacao multi-pagina e ajuste no timeout nativo
   de7dc60 fix(ext): cancela necessidade de permissao de host e ajusta shim native messaging
   16633af fix(ext): exibir painel v2 por padrao sem ocultar body
   e3968d5 audit: estado do engine
   a31c97a skill(R): correcao final
   546ff8b skill(G5): fechamento
   fed9233 skill(G4): texto seguro com checkpoint integral
   5f8961b skill(G3): extracao de tabelas
   d1fb190 skill(G2): navegacao multi-pagina

   commit f26e204b197fb7bb4a162780bf9cb8283430ab80
   docs/HANDOFF_PROXIMO_AGENTE.md | 100 +++++++++++++++++++++++++++++++++++++++++
   1 file changed, 100 insertions(+)
   ```
5. **Estado de commit dos 6 arquivos questionados em B0:**
   - `teacher-extension/orchestrator_v2.js`: **Modificado sem commit (`M`)** (+272 linhas adicionando `saveStandaloneGraph`, `resolveStandaloneGraph`, `fallbackLocalNlu`, `standaloneFallback: payload.standaloneFallback !== false` e `cdpClick`/`cdpWrite`).
   - `lib/runner-ext/workerEntry.ts`: **Modificado sem commit (`M`)** (adicionando `standaloneFallback` em `ExtensionHost.audit` gravando em `chrome.storage.local['standalone_audit_log_v2']`, e re-exportando `domDistiller` e `repairEngine`).
   - `lib/explorer/domDistiller.ts`: **Não rastreado / sem commit (`?? lib/explorer/`)**.
   - `lib/repair/repairEngine.ts`: **Commitado** (sem modificações locais pendentes; re-exportado na working tree por `lib/runner-ext/workerEntry.ts:382`).
   - `scripts/run-e2e-chromium.ts`: **Não rastreado / sem commit (`??`)**.
   - `tools/runner-harness/fixtures/hostile-portal-e2e.html`: **Não rastreado / sem commit (`??`)**.

---

## 3. Regressão de Segurança — C6 (B1)

### B1.1 `standaloneFallback`: padrão, condições de uso de `chrome.storage.local` e escrita real com app fechado
- **Saída literal de `git grep -n "standaloneFallback" -- lib teacher-extension desktop`:**
  ```text
  lib/runner-ext/workerEntry.ts:152:  standaloneFallback?: boolean
  lib/runner-ext/workerEntry.ts:242:    const allowStandalone = Boolean(this.options.standaloneFallback)
  teacher-extension/orchestrator_v2.js:279:        standaloneFallback: payload.standaloneFallback !== false,
  ```
- **Está ligado por padrão?** **SIM.** Em `teacher-extension/orchestrator_v2.js:279`, `standaloneFallback: payload.standaloneFallback !== false` avalia para `true` sempre que `payload.standaloneFallback` é `undefined` (que é o caso em todas as chamadas de `side_panel_v2.js:186, 467`).
- **Em que condições a auditoria vai para `chrome.storage.local`?** Sempre que `this.auditSink` é nulo ou `this.auditSink.audit(entry)` lança erro (app Desktop fechado/desconectado) e `allowStandalone` é `true` (`lib/runner-ext/workerEntry.ts:241-285`).
- **Com o app fechado e sem dry-run (`dryRun: false`), a escrita real prossegue?** **SIM (`BLOQUEIA`).** Como `ExtensionHost.audit(entry)` captura a exceção do `auditSink` e retorna normalmente após gravar em `chrome.storage.local`, o `await host.audit(...)` em `lib/runner/nodes/write.ts:126-146` não lança `E_AUDIT_UNAVAILABLE` e a linha `149` (`await driver.write(...)`) executa a mutação física no portal escolar sem ack do app Desktop.
- **Código literal da decisão (`lib/runner-ext/workerEntry.ts:241-285` e `teacher-extension/orchestrator_v2.js:276-282`):**
  ```ts
  // lib/runner-ext/workerEntry.ts:241-285
  public async audit(entry: AuditEntry): Promise<void> {
    const allowStandalone = Boolean(this.options.standaloneFallback)
    if (!this.auditSink) {
      if (!allowStandalone) {
        throw new Error('E_AUDIT_UNAVAILABLE: AuditSink não configurado para gravação write-ahead obrigatória.')
      }
    } else {
      try {
        await this.auditSink.audit(entry)
        return
      } catch (err: any) {
        if (!allowStandalone) {
          throw new Error(`E_AUDIT_UNAVAILABLE: Falha ao confirmar auditoria write-ahead no Desktop: ${err?.message || String(err)}`)
        }
      }
    }
    // Fallback Standalone Local-First (Zero-Desktop):
    // Redige possíveis CPFs em campos de referência antes de persistir localmente em storage.session/local
    const sanitizePii = (val?: string) =>
      typeof val === 'string' ? val.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_PROTEGIDO]') : val
    const safeEntry: AuditEntry = {
      ...entry,
      target_ref: sanitizePii(entry.target_ref) || entry.target_ref,
    }
    // ... grava em chrome.storage.session['skillgraph_audit_log'] e chrome.storage.local['standalone_audit_log_v2'] e retorna void!
  ```

### B1.2 O que é gravado em `standalone_audit_log_v2` e o que o teste afirma
- Em `lib/runner-ext/workerEntry.ts:259-279`, `safeEntry` espalha `...entry` (`AuditEntry` construído em `lib/runner/nodes/write.ts:126-138`), contendo: `run_id`, `graph`, `node_id`, `action: 'write'`, `status: 'success'`, `target_ref`, `before_value`, `after_value`, `verified_by` e `at`.
- **Só CPF é mascarado?** **SIM.** A função `sanitizePii` (`workerEntry.ts:257-258`) aplica apenas `/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g` e **somente sobre `entry.target_ref`**. Nomes de alunos em `target_ref` (ex.: `"Nota de Maria Eduarda"`), bem como notas, faltas ou pareceres pedagógicos em `before_value` e `after_value`, são gravados **em texto claro** em `chrome.storage.local['standalone_audit_log_v2']`.
- **O teste que cobre isso afirma o comportamento seguro ou o inseguro?** O teste `__tests__/extensionHost.integration.test.ts:460-492` (`it('14. [Standalone Zero-Desktop] executa WRITE com standaloneFallback=true persistindo auditoria sanitizada em chrome.storage.local quando Desktop está offline')`) **afirma explicitamente o comportamento inseguro**: configura `dryRun: false`, faz o `auditSink` rejeitar com `Native Messaging host disconnected`, exige `result.success === true`, `driver.writes.length === 1` e verifica que `chrome.storage.local` recebeu `before_value: '8.0'` e `after_value: '9.5'`.

### B1.3 `chrome.storage.local`: dados de aluno ou de grafo sem cifra
- **Saída literal de `git grep -n -E "chrome\.storage\.local" -- lib teacher-extension`:**
  - **Camada v2:**
    - `lib/runner-ext/workerEntry.ts:276-279`: `standalone_audit_log_v2` — grava entradas de auditoria de escrita (`target_ref`, `before_value`, `after_value`, `graph`, `at`) sem cifra.
    - `teacher-extension/orchestrator_v2.js:81, 108, 127, 149, 169`: `standalone_skillgraphs_v2` — grava objetos `SkillGraphV2` completos sem cifra em `chrome.storage.local`.
    - `teacher-extension/orchestrator_v2.js:301, 324, 1056, 1153`: `graph_health:${portalId}:${taskId}` — contadores de falha e status `needs_repair`.
    - `teacher-extension/orchestrator_v2.js:491`, `side_panel_v2.js:90`, `side_panel.js:3411`: flag `USE_SKILLGRAPH_V2`.
  - **Camada legada (`teacher-extension/side_panel.js` e `background.js`):**
    - `teacher-extension/side_panel.js:1028`: `chrome.storage.local.set({ [\`cached_roster_${className}\`]: currentLoadedStudents })` — **grava lista completa de alunos da turma em texto claro** (`BLOQUEIA` frente à regra "PII só no banco cifrado do app").
    - `teacher-extension/side_panel.js:18, 86, 129, 134`: `teacher_byok_key` — chave de API em `chrome.storage.local`.
    - `teacher-extension/side_panel.js:575, 587`: `skills_audit_history` — histórico de ações com detalhes da execução.
    - `teacher-extension/side_panel.js:883, 895, 1132, 1486`: `teacher_synced_profile`, `teacher_upcoming_tasks`, `portal_classes`, `custom_recorded_skills`.

### B1.4 `activate: true` e `SKILLGRAPH_EXPLORE_AND_LEARN` vs. Gravador Manual
- **Saída literal de `git grep -n -E "activate: ?true" -- teacher-extension lib desktop`:**
  ```text
  teacher-extension/orchestrator_v2.js:974:            await nativeClient.send('graphs.save', { graph, activate: true }).catch(() => {})
  teacher-extension/orchestrator_v2.js:1146:            await nativeClient.send('graphs.save', { graph: patched, activate: true }).catch(() => {})
  ```
- **Comportamento de `SKILLGRAPH_EXPLORE_AND_LEARN` (`teacher-extension/orchestrator_v2.js:647-674`):**
  - Restringe a compilação a grafos cujo `compileResult.graph.safety.side_effect_level === 'read'` (`orchestrator_v2.js:650`).
  - Persiste inicialmente como **inativo** (`await saveStandaloneGraph(savedGraph, false)` na linha `653` e `nativeClient.send('graphs.save', { graph: savedGraph, activate: false })` na linha `657`).
  - **Porém**, em `teacher-extension/side_panel_v2.js:391-404`, o painel renderiza imediatamente o link `"Ativar esta habilidade"` (`#sgv2-activate-learned`) que dispara `SKILLGRAPH_ACTIVATE_GRAPH` (`orchestrator_v2.js:1013-1046`). Esse handler ativa o grafo (`setStandaloneGraphActive(..., true)` e `graphs.setActive`) **em um único clique**, sem mostrar os nós/seletores gerados e sem exigir dry-run.
  - Além disso, no banco SQLite do Desktop (`lib/desktop-core/db/repositories/SqlSkillGraphRepository.ts:39-48` chamado por `desktop/main.ts:98`), se for a versão `1` daquela `(portal_id, task_id)`, `SqlSkillGraphRepository.save()` grava `is_active = 1` inicialmente e `desktop/main.ts:99-103` **só** chama `setActiveVersion` quando `p.activate` é `true` — ou seja, quando `activate: false` é enviado na versão 1, `desktop/main.ts:98-103` **não desativa** o `is_active = 1` default inserido pelo repositório!
- **Comparação de garantias: Explorador (`SKILLGRAPH_EXPLORE_AND_LEARN`) vs. Gravador Manual (`SKILLGRAPH_STOP_RECORD` → `SKILLGRAPH_COMPILE_RECORD`) vs. Importação Comunitária (`community.import`):**
  1. **Inspeção de passos antes de compilar:** O gravador manual retorna `trace.steps` e `analysis` para revisão no painel (`side_panel_v2.js:244-292`); o explorador compila e já salva no storage/banco (`orchestrator_v2.js:649-659`) antes de qualquer revisão humana.
  2. **Decisões de ambiguidade (polaridade/escala):** O gravador manual exige preenchimento se houver `ambiguities` (`side_panel_v2.js:250-292`); o explorador passa `decisions` fixo sem perguntas (`orchestrator_v2.js:641-648`).
  3. **Quarentena e Dry-Run obrigatório:** Pacotes comunitários entram em `quarantined_packages` (`E_GRAPH_QUARANTINED` se executados sem `dryRun`, `desktop/main.ts:269-277`) e exigem `community.markDryRunPassed` antes de `community.promote`; já o explorador salva direto na tabela de grafos (com bug de `is_active = 1` na v1 em `desktop/main.ts:98-103`) e permite ativação em 1 clique sem dry-run.

### B1.5 `saveStandaloneGraph` / `resolveStandaloneGraph`
- Em `teacher-extension/orchestrator_v2.js:91-142`:
  - `saveStandaloneGraph(graph, activate)` **NÃO chama `validateGraph(graph)` nem `SkillGraphV2Schema.parse(graph)`** antes de gravar em `chrome.storage.local['standalone_skillgraphs_v2']`.
  - `resolveStandaloneGraph(host, taskId)` **NÃO verifica estado de quarentena nem lança `E_GRAPH_QUARANTINED`**; apenas filtra `e.is_active === true` (`orchestrator_v2.js:129`).

---

## 4. Navegação — C1, C2 (B2)

### B2.1 Matriz de Primitivas de Navegação

| Item | Cadeia `arquivo:linha → arquivo:linha` desde a entrada | Status | Evidência / Observação Crítica |
| :--- | :--- | :---: | :--- |
| **Nó `NAVIGATE` até `chrome.tabs.update`** | `side_panel_v2.js:186` (`SKILLGRAPH_RUN`) → `orchestrator_v2.js:294` (`runner.run`) → `lib/runner/engine.ts:245` (`executeNavigateNode`) → `lib/runner/nodes/navigate.ts:61` (`driver.navigate(finalUrl)`) → `lib/runner-ext/remoteDriver.ts:507` (`chrome.tabs.update(this.tabId, { url })`) | `PARCIAL` | Chama `chrome.tabs.update` real, mas o timeout de espera de carregamento engole falhas (ver abaixo). |
| **Espera de carregamento em `NAVIGATE`** | `lib/runner-ext/remoteDriver.ts:505-542` (`onUpdated` + `navTimer`) | `PARCIAL` | **Timeout resolve sem erro:** se `navTimer` dispara após `this.timeoutMs`, chama `chrome.tabs.get` e, se `tab.status !== 'loading'`, chama `resolve()` sem erro (`remoteDriver.ts:532-534`). Em `DomDriver.navigate` (`lib/runner-dom/driver.ts:436-459`), `window.location.assign(url)` resolve em `setTimeout(..., 50)`. |
| **`allowed_hosts` checado ANTES de navegar (incl. URL relativa)** | `lib/runner/nodes/navigate.ts:28-31` (`checkAllowedHost(targetHost, allowedHosts)`) e `navigate.ts:50-57` (`new URL(fullTarget)` → `checkAllowedHost(parsedUrl.host, allowedHosts)`) → `navigate.ts:59-61` (`driver.navigate`) | `IMPLEMENTADO REAL` | Checa `targetHost` (que herda `currentCtx.host` em URLs relativas) na linha 31 e re-checa o host de URLs absolutas (`http://`/`https://`) na linha 53 **antes** de `driver.navigate(finalUrl)` na linha 61. |
| **Clique com `expect_navigation`** | `lib/runner/nodes/click.ts:50-54` (`driver.click` → `driver.waitForNavigation`) → `lib/runner-ext/remoteDriver.ts:548-572` / `lib/runner-dom/driver.ts:461-464` | `STUB` / `PARCIAL` | Em `DomDriver.waitForNavigation` (`driver.ts:461-464`) é **STUB** (`return Promise.resolve()`). Em `RemoteDriver.waitForNavigation` (`remoteDriver.ts:563-568`), o `setTimeout` de `Math.min(timeoutMs, 2500)` **chama `resolve()` incondicionalmente** se nenhuma navegação ocorrer! |
| **Reconexão do content adapter e retry de RPC (`WRITE` nunca repetido)** | `lib/runner-ext/remoteDriver.ts:58-69` (`NON_IDEMPOTENT_OPERATIONS = new Set(['write', 'click', 'paginate', 'upload', 'download'])`) → `remoteDriver.ts:79-145` (`sendRpc` → `ensureContentScriptInjected` em `115` → retry único em `122-141` só se `!NON_IDEMPOTENT_OPERATIONS.has(request.operation)`) | `IMPLEMENTADO REAL` | Reconecta injetando `dist/content.bundle.js` (`remoteDriver.ts:154-160`) quando `chrome.tabs.sendMessage` falha com `Receiving end does not exist` / `message port closed`, e bloqueia retry para `write`, `click`, `paginate`, `upload` e `download`. |
| **`scroll_until_found` / `paginate_until_found`** | `lib/runner/nodes/navigate.ts:99-137` (`executeLocateNode`) → `remoteDriver.ts:280-286` → `contentAdapter.ts:97-102` → `lib/runner-dom/driver.ts:255-428` (`scroll` / `paginate`) | `PARCIAL` | `scroll_until_found` (`driver.ts:276-360`) faz scroll incremental em container ou `window` e aguarda 50ms em grids virtuais (`driver.ts:327-332`). `paginate_until_found` (`navigate.ts:114-137`) chama `driver.paginate({ mode: 'next_button' })` até 20 páginas, mas falha se o clique no botão "Próxima" recarregar a página inteira (contexto perdido) ou se a paginação for por número de página. |
| **Paginação (botão, número, infinito, virtual)** | `lib/runner/nodes/read.ts:29-34` → `lib/runner-dom/driver.ts:199-243, 379-428` | `PARCIAL` | `next_button` (`driver.ts:395-425`) e scroll virtual em `.ag-body-viewport`/`.MuiDataGrid-virtualScroller` (`driver.ts:201-212`) funcionam no mesmo documento. Porém: (1) em `driver.ts:386`, `const advanced = container.scrollTop !== prevTop \|\| true` tem **`\|\| true` hardcoded** (sempre reporta `advanced: true` no modo `infinite_scroll`); (2) **`mode: 'page_number'` é `AUSENTE`** (existe no schema Zod `lib/contracts/skillgraph/nodes.ts:19`, mas `driver.ts:379-428` só trata `infinite_scroll`, `virtual_scroll` e `next_button`). |
| **Iframes (mesma origem e cross-origin) e Shadow DOM (aberto e fechado)** | `lib/runner-ext/remoteDriver.ts:173-253` (`getFrameIds` via `chrome.webNavigation.getAllFrames` + prefixo `f{frameId}::{handleId}`) → `lib/runner-dom/selectors.ts:74-149` (`getShadowRoot` via `chrome.dom.openOrClosedShadowRoot` / `el.shadowRoot` + `contentDocument` de iframes same-origin) | `PARCIAL` | `locateAnchor` e `locateRow` fazem fan-out para subframes (`webNavigation.getAllFrames`) e codificam `f{frameId}::`. `click`, `write`, `readText`, `readValue` e `getBoundingBox` extraem esse `frameId`. **Quebra:** `readTable`, `scroll`, `paginate`, `evaluateCondition`, `download` e `upload` (`remoteDriver.ts:280-286, 421-431, 467-497`) **não** extraem `frameId` da âncora; dependem do efeito colateral de `this.frameId` ter sido mutado antes! |
| **Abas / Popups (`SSOHandoffManager`)** | `lib/runner-ext/ssoHandoff.ts:44-169` (`SSOHandoffManager`), mas **NÃO instanciado** em `teacher-extension/orchestrator_v2.js` nem em `background.js`! | `DESCONECTADO` | `SSOHandoffManager` está implementado e exportado em `lib/runner-ext/workerEntry.ts:377`, mas `git grep SSOHandoffManager` mostra que **nenhum arquivo de produção (`orchestrator_v2.js` ou `background.js`) o instancia**. |
| **`WAIT`** | `lib/runner/engine.ts:251` → `lib/runner/nodes/branch.ts:39-83` (`executeWaitNode`) → `host.sleep` + `evaluateCondition` (`lib/runner/conditions.ts:62-145`) | `IMPLEMENTADO REAL` | Suporta espera fixa (`node.ms`) e polling de condição (`node.until` a cada 200ms até `timeout_ms`), lançando `E_TIMEOUT` real na linha 70 se expirar. |
| **`HANDOFF_HUMAN`** | `lib/runner/engine.ts:255` → `lib/runner/nodes/checkpoint.ts:78-130` (`executeHandoffNode`) → `workerEntry.ts:209-219` (`onHandoff`) → `orchestrator_v2.js:252-274` → `side_panel_v2.js:559-564` | `PARCIAL` | Pausa o grafo, exibe alerta no painel v2 e faz polling de `node.resume_when` a cada 1000ms até `timeout_ms` (`checkpoint.ts:108-119`), lançando `E_HANDOFF_TIMEOUT` se expirar. Porém não está integrado ao `SSOHandoffManager` para monitorar popups OAuth em abas filhas. |
| **SPA sem recarga** | `lib/runner/nodes/click.ts:50` + `lib/runner/nodes/branch.ts:54-72` (`WAIT` por `element_present`/`url_matches`) | `IMPLEMENTADO REAL` | Cliques em abas/rotas SPA sem reload mantêm o content script vivo e podem aguardar mutação DOM via `WAIT`. |

#### Código literal do timeout silencioso em `RemoteDriver.navigate` e `waitForNavigation` (`lib/runner-ext/remoteDriver.ts:526-571`)
```ts
// lib/runner-ext/remoteDriver.ts:526-541
        const navTimer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener)
          chrome.tabs.get(this.tabId, (tab) => {
            if (chrome.runtime?.lastError) {
              reject(new Error(`E_TAB_CLOSED: Aba ${this.tabId} fechada durante navegação.`))
              return
            }
            if (tab && tab.status !== 'loading') {
              resolve() // <-- Resolve sem erro se o status não for 'loading'
            } else {
              reject(new Error(`E_TIMEOUT: Timeout aguardando carregamento de ${url} na aba ${this.tabId}`))
            }
          })
        }, this.timeoutMs)

// lib/runner-ext/remoteDriver.ts:563-568 (waitForNavigation)
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true
            chrome.tabs.onUpdated.removeListener(listener)
            resolve() // <-- NUNCA rejeita em timeout!
          }
        }, Math.min(timeoutMs, 2500))
```

### B2.2 Todas as Formas de Navegar no Repositório e Caminhos Concorrentes
Existem **6 mecanismos distintos de navegação** coexistindo no repositório:
1. **Nó `NAVIGATE` do SkillGraph v2 (`lib/runner/nodes/navigate.ts:16-73` → `RemoteDriver.navigate` → `chrome.tabs.update`)**: Ligado ao painel v2 quando executa um grafo salvo (`SKILLGRAPH_RUN`).
2. **`internalNavigatePortalTab` (`teacher-extension/background.js:930-1140`)**: Injeta script ad-hoc via `chrome.scripting.executeScript` que procura links/botões por sinônimos (`SEMANTIC_CLUSTERS`) e clica neles. **Ligado ao painel v2** dentro de `SKILLGRAPH_EXPLORE_AND_LEARN` (`orchestrator_v2.js:567`).
3. **Mensagem `NAVIGATE_PORTAL_TAB` (`teacher-extension/background.js:1714-1725`)**: Wrapper de mensagem sobre `internalNavigatePortalTab`, usado como fallback em `orchestrator_v2.js:581` e pelo painel legado.
4. **Tool `portal_navigate` (`lib/agentTools.ts:157`, `teacher-extension/side_panel.js:2760, 2800`)**: Ligado apenas ao painel legado (`side_panel.js`).
5. **Destilador DOM `lib/explorer/domDistiller.ts` (`distillInteractiveDom` + `selectBestDistilledAction`)**: Exportado em `lib/runner-ext/workerEntry.ts:379-381`, mas **NÃO está conectado a nenhum fluxo de produção** (usado apenas pelo script de teste `scripts/run-e2e-chromium.ts`).
6. **Loop ReAct Python (`sidecar/agentic_execution_loop.py`)**: Legado Python via WebSocket/CDP, desconectado do painel v2.

**Conclusão C2:** Há caminhos concorrentes ativos no próprio painel v2 (`SKILLGRAPH_EXPLORE_AND_LEARN` navega via `internalNavigatePortalTab` do `background.js` sem usar `SkillGraphRunner`/`RemoteDriver`, enquanto `SKILLGRAPH_RUN` usa `SkillGraphRunner`).

---

## 5. Explorador e NLU Composta — C1, C5 (B3)

1. **Como o explorador decide o que clicar (`teacher-extension/orchestrator_v2.js:516-729` e `background.js:930-1140`):**
   - **Não usa LLM** e **não usa `domDistiller.ts`**.
   - Divide o comando em até 3 saltos por regex `/\s+(?:e\s+depois|depois|em\s+seguida|->|>|›)\s+/i` (`orchestrator_v2.js:555-558`).
   - Para cada salto, chama `internalNavigatePortalTab(tabId, hopTarget)` (`background.js:930-1140`), que injeta uma função no DOM via `chrome.scripting.executeScript` e pontua elementos `a, button, [role="tab"], [role="menuitem"], [role="button"], .tab, .nav-link, li, span` por casamento léxico e clusters de sinônimos (`SEMANTIC_CLUSTERS`: `'diario'`, `'notas'`, `'frequencia'`, `'ocorrencias'`, `'alunos'`, `'turmas'`, `'relatorios'`). Se o score for `< 80`, tenta clicar num menu pai (`diario`, `academico`, `ensino`, `pedagogico`, `menu`, ` secretaria`, `avaliacao`, `turma`) aguarda 450ms e repete a busca (`background.js:1049-1071`).
2. **Passa pelo `LlmGateway` e pela pseudonimização? Texto de página entra em prompt?**
   - Como o explorador é puramente heurístico local, **nenhum texto de página é enviado a LLM** durante `SKILLGRAPH_EXPLORE_AND_LEARN`.
3. **Limites e guardrails do explorador:**
   - **Limite de passos:** Máximo de **3 hops** (`rawHops.slice(0, 3)` em `orchestrator_v2.js:556-558`), mais até 1 sub-hop de expansão de menu pai por hop em `background.js:1049-1071`.
   - **Lista de ações proibidas:** Regex em `orchestrator_v2.js:543` (`/\b(excluir|deletar|apagar|remover|demitir|formatar|pagar|transferir|cancelar matricula)\b/i`) e em `background.js:942` (`/\b(excluir|deletar|apagar|remover|demitir|formatar|pagar|transferir|salvar|gravar|enviar|publicar|confirmar lancamento)\b/i`), além de ignorar `input[type="submit"]` (`background.js:960`) e links de `sair/logout` (`background.js:965`).
   - **Parada ao sair do host:** `orchestrator_v2.js:595-607` verifica `afterHost !== host` **APÓS** o clique já ter ocorrido (`await waitForTabSettled(tabId, 2000)`). Se o clique levou a outro host, ele interrompe o loop e retorna erro, mas **não impede a saída antes do clique** (por exemplo, checando o atributo `href` do `<a>` contra `host` antes de clicar em `background.js:930-1080`).
4. **O que `lib/explorer/domDistiller.ts` e `decomposeCompoundTeacherCommand` fazem de fato vs. o que é só nome:**
   - `distillInteractiveDom(root, maxElements)` (`domDistiller.ts:104-213`): Lê elementos interativos visíveis (incluindo Shadow DOM), filtra botões destrutivos/logout, gera um seletor CSS básico e retorna uma lista enxuta de candidatos. **Porém, em produção é código morto**: embora exportado em `workerEntry.ts:379-381`, **nunca é chamado** por `orchestrator_v2.js` nem por `background.js` (só é chamado em `scripts/run-e2e-chromium.ts`).
   - `selectBestDistilledAction(elements, goalKeyword, visitedSignatures)` (`domDistiller.ts:219-256`): Escolhe o candidato com maior sobreposição de tokens com `goalKeyword` evitando `visitedSignatures`. **Também nunca é chamado em produção.**
   - `decomposeCompoundTeacherCommand(rawCommand)` (`domDistiller.ts:269-372`): Decompositor baseado em regras/regex (sem LLM) que:
     - Separa comandos múltiplos por `;`, `e depois`, `em seguida`, `depois`, `aí` ou `, e <verbo>` (`domDistiller.ts:288-291`);
     - Extrai `exclude_students` via regex `/(?:todos\s+menos|exceto|menos\s+o|menos\s+a|salvo|tirando\s+o|tirando\s+a)\s+([a-zà-úA-ZÀ-Ú\s,e]+?)(?:$|[.;]|para|com|nota)/i` (`domDistiller.ts:300-313`);
     - Extrai `class_code` (`turma 9A`), `relative_date` (`ontem`, `anteontem`, `hoje`), `grade` (numérico ou conceito `MB/B/R/I`), `attendance` (`falta`/`presença`) e mapeia para `launch_grade`, `mark_attendance`, `read_roster`, `export_report` ou `navigate_and_learn`.
   - **O que é perdido na integração real (`orchestrator_v2.js:461-485` → `side_panel_v2.js:421-437`):**
     - `decomposeCompoundTeacherCommand` só é chamado em `fallbackLocalNlu` quando o app Desktop está offline (`orchestrator_v2.js:464`).
     - Pega apenas `steps[0]` para `task_id` (`orchestrator_v2.js:469`: `const primary = steps.find(s => s.intent !== 'navigate_and_learn') || steps[0]`), **descartando sub-tarefas subsequentes** se houver mais de uma tarefa de escrita/leitura na frase.
     - Embora retorne `filters: primary.filters` e `navigation_target: navStep?.navigation_target` (`orchestrator_v2.js:480-481`), o consumidor `side_panel_v2.js:421-437` lê **apenas** `res.result.task_id`, `res.result.slots`, `res.result.confidence` e `res.result.clarification_question` — **ignorando completamente `filters` (`exclude_students`) e `navigation_target`!**

---

## 6. Extração e Inserção — C4 (B4)

### B4.1 Matriz Tipo × Operação

| Operação / Controle | Status | `arquivo:linha` | Detalhes Técnicos (Setter Nativo, Eventos, Read-back, Reversão, Limitações) |
| :--- | :---: | :--- | :--- |
| **Leitura de `<table>` HTML** | `IMPLEMENTADO REAL` | `lib/runner/nodes/read.ts:24-38` → `lib/runner-dom/tableReader.ts:207-237` | Extrai `<thead>`/`<tbody>`, achata cabeçalho de 2 linhas com `colspan`/`rowspan` no `<thead>` (`tableReader.ts:34-103`) e descarta linhas de total/rodapé (`shouldSkipRow`). |
| **Leitura de Grid/Div (`[role="grid"]`, AG-Grid)** | `IMPLEMENTADO REAL` | `lib/runner-dom/tableReader.ts:105-205` | Suporta `[role="row"]`, `.ag-row`, `.MuiDataGrid-row` e une colunas fixadas (`.ag-pinned-left-cols-container` + `.ag-center-cols-container`) por `row-index`/`aria-rowindex`/`data-row-key` (`tableReader.ts:139-168`). |
| **Leitura de Lista (`<ul>`/`<ol>`/`[role="list"]`)** | `IMPLEMENTADO REAL` | `lib/runner/nodes/read.ts:46-58` → `lib/runner-dom/tableReader.ts:220-235` | Cai no fallback de `readHtmlTable` para `li, [role="listitem"]`, retornando objetos `{ item_1, item_2, ... }`. |
| **Leitura de Cartões (Cards de Alunos)** | `PARCIAL` | `lib/runner-dom/tableReader.ts:130-137` | Só lê cartões se usarem classes `.student-row, .portal-row, .grid-row, .data-row, .list-item` e filhos `.cell, [data-col]`. Cards genéricos (`div.card > h4 + p`) sem essas classes retornam vazio. |
| **Leitura de Texto Livre (`element_text`)** | `IMPLEMENTADO REAL` | `lib/runner/nodes/read.ts:38-41` → `lib/runner-dom/driver.ts:245-249` | Usa `getElementText(el)` (`selectors.ts:31-36`). |
| **Leitura de Valor de Input/Select (`element_value`)** | `IMPLEMENTADO REAL` | `lib/runner/nodes/read.ts:42-45` → `lib/runner-dom/driver.ts:251-263` | Lê `.checked` para checkbox/radio, `.value` para `<input>`/`<select>`/`<textarea>`, ou texto. |
| **Tabela Virtualizada (AG-Grid / MUI / React-Virtualized)** | `PARCIAL` | `lib/runner-dom/driver.ts:201-242` | Rola `.ag-body-viewport` / `.MuiDataGrid-virtualScroller` em incrementos de `300px` até `maxPages` (default 15), deduplicando linhas por `JSON.stringify(row)`. Limitação: se duas linhas legítimas tiverem células idênticas (homônimos sem matrícula visível), `seenRowKeys` descarta a segunda (`driver.ts:207, 231`). |
| **Tabela Paginada** | `PARCIAL` | `lib/runner-dom/driver.ts:199-243, 379-428` | Funciona se o botão "Próxima" atualizar a tabela via AJAX/DOM local. Quebra se causar navegação multi-página com reload (pois `readTable` corre dentro de um único RPC no `contentAdapter.ts`). |
| **Célula Mesclada (`colspan`/`rowspan`)** | `PARCIAL` | `lib/runner-dom/tableReader.ts:34-103` vs `164-199` | Suportado no `<thead>` (`buildFlattenHeaders`), mas **NÃO suportado em células `<td>` do `<tbody>`** (`tableReader.ts:181-190` indexa `cells[c]` diretamente em `headers[c]`, deslocando colunas seguintes quando uma célula de dados tem `colspan > 1` ou `rowspan > 1`). |
| **Cabeçalho em 2 Linhas** | `IMPLEMENTADO REAL` | `lib/runner-dom/tableReader.ts:34-103` | `buildFlattenHeaders` constrói matriz 2D expandindo `colspan`/`rowspan` no `<thead>` e concatena com `_` (`Nota_B1`). |
| **Download (`DOWNLOAD`)** | `PARCIAL` (com fallback sintético) | `lib/runner/nodes/download.ts:14-87` → `lib/runner-ext/remoteDriver.ts:467-493` → `lib/runner-dom/driver.ts:466-507` | Não lança `E_NODE_UNSUPPORTED`. Clica no gatilho e escuta `chrome.downloads.onCreated` por apenas `300ms` (`remoteDriver.ts:476`). Se o download demorar >300ms ou se `driver.ts:483-486` não achar `href`/`download`, **retorna sucesso falso com `filename: 'download_resultado.csv', sizeBytes: 1024`**! |
| **Escrita em Input Texto / Textarea** | `IMPLEMENTADO REAL` | `lib/runner/nodes/write.ts:30-230` → `lib/runner-dom/writer.ts:345-417` | Faz leitura prévia (`beforeValue`), auditoria write-ahead (`write.ts:126`), native setter (`HTMLInputElement`/`HTMLTextAreaElement.prototype.value`), `_valueTracker.setValue`, `InputEvent('beforeinput')`, `InputEvent('input')`, `change`, `blur`, read-back (`write.ts:160-165`) e reversão ao `beforeValue` se divergir (`write.ts:167-175`). |
| **Escrita de Número com Vírgula (`7,5`)** | `IMPLEMENTADO REAL` | `lib/runner/nodes/write.ts:19, 163` + `lib/runner-dom/writer.ts:352-360` | Converte `7,5` → `7.5` quando `el.type === 'number'` (`writer.ts:355-357`) e aceita equivalência `,`/`.` no read-back (`write.ts:163`). |
| **Escrita em `<select>` Nativo e Customizado (Select2 / React-Select / MUI)** | `IMPLEMENTADO REAL` | `lib/runner-dom/writer.ts:152-304` | Para `<select>` nativo, casa por `value` ou texto normalizado, usa native setter + eventos e verifica `selectedIndex` (`writer.ts:152-187`). Para customizados/portaled (`role="combobox"`, `.select2-selection`, `.MuiSelect-select`), abre o dropdown, filtra no campo de busca se existir e clica na `[role="option"]` no `document.body` (`writer.ts:190-303`). |
| **Checkbox / Radio com Polaridade (`presence_is_checked` vs `absence_is_checked`)** | `IMPLEMENTADO REAL` | `lib/runner/nodes/write.ts:104-121` + `lib/runner-dom/writer.ts:75-150` | Resolve polaridade a partir de `canonicalMapping.attendance_polarity` (lança `E_POLARITY_UNDECIDED` se ausente em `write.ts:106-112`), usa native `checked` setter ou `click()` e faz read-back booleano. |
| **Data / Datepicker (Flatpickr, jQuery UI, HTML5 Date)** | `IMPLEMENTADO REAL` | `lib/runner-dom/writer.ts:306-343` | Converte `DD/MM/YYYY` ↔ `YYYY-MM-DD` para `<input type="date">`, ou navega meses/anos em `.flatpickr-calendar` / `.ui-datepicker` clicando no `.flatpickr-day` correspondente. |
| **Contenteditable / WYSIWYG simples** | `PARCIAL` | `lib/runner-dom/writer.ts:368-378` | Suporta `[contenteditable="true"]` no mesmo DOM (`textContent = val` + `input`/`change`/`blur`), mas **não** suporta editores em iframe isolado (TinyMCE/CKEditor 4) sem âncora de frame dedicada. |
| **Upload (`UPLOAD`)** | `STUB` / `INSEGURO` (`BLOQUEIA`) | `lib/runner/nodes/upload.ts:14-93` → `lib/runner-dom/driver.ts:509-538` | (1) **Não checa `state.dryRun`** e **não chama `host.audit()`** antes de mutar o `<input type="file">`; (2) Em `driver.ts:519-535`, cria `new File([options.source], options.source, { type: 'text/csv' })` — o conteúdo do arquivo enviado ao portal é literalmente a string do nome/caminho! |
| **Campo em Iframe / Shadow DOM** | `PARCIAL` | `lib/runner-ext/remoteDriver.ts:199-277` + `lib/runner-dom/selectors.ts:74-149` | `WRITE` e `CLICK` funcionam em Shadow DOM (aberto/fechado via `chrome.dom.openOrClosedShadowRoot`) e em iframes quando precedidos por `locateAnchor` ou via candidato `role_name`/`css` roteado por `f{frameId}::`. |

### B4.2 Busca por `TODO|not implemented|E_NODE_UNSUPPORTED` e Controles Sem Suporte
- `git grep -n -E "TODO|not implemented|E_NODE_UNSUPPORTED" -- lib teacher-extension desktop`:
  - `lib/runner/nodes/unsupported.ts:13-19`: `executeUnsupportedNode` lança `E_NODE_UNSUPPORTED`, mas no `engine.ts:233-265` apenas o `default:` do `switch (node.type)` chama `executeUnsupportedNode` (todos os 11 tipos do schema têm case próprio).
- **Funções que retornam sucesso sem ação real (stubs/semi-stubs identificados):**
  1. `DomDriver.waitForNavigation` (`lib/runner-dom/driver.ts:461-464`): `return Promise.resolve()`.
  2. `RemoteDriver.waitForNavigation` (`lib/runner-ext/remoteDriver.ts:563-568`): `setTimeout` resolve sem erro quando nenhuma navegação ocorre.
  3. `DomDriver.paginate` (`lib/runner-dom/driver.ts:386`): `const advanced = container.scrollTop !== prevTop || true`.
  4. `DomDriver.download` (`lib/runner-dom/driver.ts:483-486`): retorna `{ success: true, filename: 'download_resultado.csv', sizeBytes: 1024 }` mesmo que o botão clicado não dispare download.
  5. `DomDriver.upload` (`lib/runner-dom/driver.ts:519-535`): injeta um `File` cujo corpo é o próprio nome do arquivo em texto.
- **Controles comuns em portais escolares brasileiros ainda sem suporte real:**
  - Tabelas com `rowspan`/`colspan` no corpo (`<tbody>`), comuns em boletins por bimestre/recuperação;
  - Paginação numérica sem botão "Próxima" (`1 | 2 | 3`, `mode: 'page_number'`);
  - Upload de arquivos reais do disco (planilhas `.xlsx`/`.csv`, atestados em `.pdf`);
  - Inputs com máscara de cursor que interceptam `keydown` caractere a caractere e rejeitam atribuição em bloco de `.value`;
  - Editores ricos em iframe (TinyMCE/CKEditor clássicos em campos de parecer descritivo).

---

## 7. Os Testes em Chromium Real (B5)

Leitura integral de `scripts/run-e2e-chromium.ts` (`1–335`) e `tools/runner-harness/fixtures/hostile-portal-e2e.html` (`1–263`):

1. **Carrega `teacher-extension/` como extensão (`--load-extension`) ou só importa módulos?**
   - **Só importa módulos.** Compila um bundle ad-hoc em memória com `esbuild.build` exportando `{ DomDriver, distillInteractiveDom, selectBestDistilledAction, decomposeCompoundTeacherCommand, createDriftSnapshot, generateRepairProposal }` (`scripts/run-e2e-chromium.ts:18-32`) e o injeta via `win.webContents.executeJavaScript(bundleCode)` numa janela `BrowserWindow` do Electron (`run-e2e-chromium.ts:68-82`). `--load-extension` **não é usado**.
2. **Fala com o app por Native Messaging?**
   - **NÃO.** Nenhum processo `com.teacherai.desktop`, `NativeClient`, `ExtensionHost` ou SQLite cifrado é instanciado.
3. **Usa o `RemoteDriver`/`ContentAdapter` reais ou chama funções direto?**
   - **Chama funções direto (`new window.E2E.DomDriver(document)` dentro da página).** `SkillGraphRunner`, `RemoteDriver` e `ContentAdapter` não participam de nenhum dos 8 cenários. No cenário 5 (`CDP isTrusted=true`), o próprio script de teste chama `win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', ...)` (`run-e2e-chromium.ts:187-205`), e não o `orchestrator_v2.js`. No cenário 6 (`Cross-Origin Iframe`), o próprio script de teste localiza o frame em `win.webContents.mainFrame.frames` e chama `crossFrame.executeJavaScript(...)` (`run-e2e-chromium.ts:242-254`), e não o `RemoteDriver` via `chrome.webNavigation.getAllFrames`.
4. **Quem escreveu fixture e teste? As fixtures estão travadas por lock?**
   - Escritos pelo **mesmo agente na mesma sessão** (arquivos não rastreados `?? scripts/run-e2e-chromium.ts` e `?? tools/runner-harness/fixtures/hostile-portal-e2e.html`).
   - **NÃO estão travadas por lock** (`tools/runner-harness/suiteLock.ts` não inclui `hostile-portal-e2e.html`).
5. **Quantos dos 8 cenários exercitam o caminho de produção (`side_panel_v2` → `orchestrator_v2` → `SkillGraphRunner` → `RemoteDriver` → `ContentAdapter` → `DomDriver` + `NativeClient`)?**
   - **`0 / 8` cenários** exercitam o caminho completo de produção da extensão.
6. **Saída literal da execução única de `npm run test:e2e:chromium`:**
   ```text
   > teacher-ai@0.1.0 test:e2e:chromium
   > npx tsx scripts/run-e2e-chromium.ts

   [E2E CHROMIUM REAL] 8/8 suítes aprovadas (1:Blink elementFromPoint, 2:Flatpickr <select>, 3:Select2 Portal, 4:AG-Grid Pinned+VirtualScroll, 5:CDP isTrusted=true, 6:Closed Shadow DOM + Cross-Origin Iframe, 7:NLU Multi-Turno + DOM Distiller + Backtracking, 8:Self-Healing AST)
   EXIT_E2E=0
   ```
7. **Classificação do valor do teste:**
   - **E1 (prova real executada)** apenas para: comportamento de APIs DOM do motor Blink/Chromium dentro do `DomDriver` isolado (`elementFromPoint` em `ensureElementNotOccluded`, Flatpickr `<select>`, Select2 portaled no `body`, leitura de AG-Grid pinned + scroll virtual) e funções puras (`decomposeCompoundTeacherCommand`, `distillInteractiveDom`, `generateRepairProposal`).
   - **NÃO é evidência E1** para: extensão Chrome MV3, `RemoteDriver`, `ContentAdapter`, `SkillGraphRunner`, `orchestrator_v2.js`, `chrome.debugger` da extensão, `chrome.webNavigation` ou Native Messaging.

---

## 8. UX — C3 (B6)

Avaliação em `teacher-extension/side_panel_v2.html`, `teacher-extension/side_panel_v2.js`, `desktop/ui/index.html` e `desktop/ui/app.js`:

| Requisito de UX | Status | `arquivo:linha` | Observação |
| :--- | :---: | :--- | :--- |
| **1. Primeiro uso e conexão** | `PARCIAL` | `desktop/main.ts:392-399`, `desktop/nativeHost/autoRegister.ts:18-76`, `side_panel_v2.js:76-127` | O app Desktop auto-registra o manifesto Native Messaging no HKCU do Windows ao iniciar (`autoRegister.ts:18-76`), mas a professora ainda precisa carregar a extensão e abrir o app Desktop antes. |
| **2. Indicador de conexão** | `SIM` | `side_panel_v2.html:21-24`, `side_panel_v2.js:76-127`, `desktop/ui/index.html:170`, `desktop/ui/app.js:35-65` | `#sgv2-conn-badge` mostra `"App Desktop Conectado"` vs `"App Desktop Desconectado (Modo Local)"` e a aba conectada em `#sgv2-tab-info`. |
| **3. Pedir por texto** | `SIM` | `side_panel_v2.html:28-36`, `side_panel_v2.js:369-456` | Campo `#sgv2-nlu-input` + botão `#sgv2-btn-nlu` com suporte a Enter. |
| **4. Gravar demonstração** | `SIM` | `side_panel_v2.html:88-96`, `side_panel_v2.js:211-248` | Botões `#sgv2-btn-record-start` e `#sgv2-btn-record-stop` com feedback de passos capturados. |
| **5. Decidir polaridade / escala** | `SIM` | `side_panel_v2.html:99-103`, `side_panel_v2.js:250-358` | Renderiza `<select>` dinâmico para cada ambiguidade (`attendance_polarity`, `grade_scale`) antes de permitir `#sgv2-btn-compile-save`. |
| **6. Dry-run** | `SIM` | `side_panel_v2.html:66-71`, `side_panel_v2.js:467`, `desktop/ui/app.js:354-375` | Checkbox `#sgv2-dry-run-toggle` no painel (`dryRun: Boolean(dryRunToggle?.checked)`) e botão `"Executar Dry-Run Supervisionado"` na quarentena do Desktop (`app.js:354`). |
| **7. CHECKPOINT legível com diff** | `SIM` | `side_panel_v2.html:107-121`, `side_panel_v2.js:526-557`, `orchestrator_v2.js:354-366` | Card `#sgv2-checkpoint-card` mostra itens `label: value` e botões `"Aprovar e Continuar"` / `"Cancelar"`. |
| **8. Executar** | `SIM` | `side_panel_v2.html:72`, `side_panel_v2.js:458-484` | Botão `#sgv2-btn-run-confirmed` e botões de ação rápida das habilidades ativas (`side_panel_v2.js:129-174`). |
| **9. Progresso em tempo real** | `SIM` | `side_panel_v2.html:77-83`, `side_panel_v2.js:491-524, 577-617` | Escuta `SKILLGRAPH_PROGRESS` e exibe passos amigáveis (`NODE_TYPE_LABELS` em `side_panel_v2.js:53-65`). |
| **10. Cancelar execução** | `SIM` | `side_panel_v2.html:79`, `side_panel_v2.js:203-209`, `orchestrator_v2.js:737-746` | Botão `#sgv2-btn-abort` envia `SKILLGRAPH_ABORT`, acionando `currentRunnerAbort.abort()`. |
| **11. Erros em linguagem simples (quais `E_*` aparecem crus?)** | `PARCIAL` | `orchestrator_v2.js:16-33`, `side_panel_v2.js:36-51` | Mapeia 14 códigos `E_*`. **Aparecem crus ou sem tradução dedicada:** `E_DOWNLOAD_FAILED`, `E_UPLOAD_FAILED`, `E_TIMEOUT`, `E_HANDOFF_TIMEOUT`, `E_SANDBOX_VIOLATION` e `E_REPAIR_INVALID` (caem na mensagem técnica `err.message` em `orchestrator_v2.js:38`). E no `desktop/ui/app.js:228, 372, 405`, erros aparecem em `alert()` nativo. |
| **12. Histórico de auditoria visível** | `NÃO` | `desktop/main.ts:135-140`, `desktop/ui/index.html:299-302` | Existe apenas `audit.append` no IPC (`desktop/main.ts:135`); **não existe `audit.list`** nem tela/tabela para consultar o histórico de escritas (`before_value`/`after_value`) gravadas no SQLite. O `#status-log` do Desktop (`index.html:301`) mostra apenas logs efêmeros da sessão aberta. |
| **13. Reverter versão (IPC e UI)** | `SIM` | `desktop/main.ts:106-119` (`graphs.list`, `graphs.setActive`), `desktop/ui/app.js:474-520`, `side_panel_v2.js:684-696` | Tabela `#local-skills-table` no Desktop tem botão `.btn-activate-version` (`"Ativar / Reverter"`) e o painel v2 tem botão `"Reverter"` em `#sgv2-skills-manage-list`. |
| **14. Listar / renomear / excluir / exportar habilidades** | `PARCIAL` | `desktop/ui/app.js:450-604`, `side_panel_v2.js:639-709` | **Listar, excluir e exportar funcionam** (`graphs.list`, `graphs.delete`, `community.export`). **Renomear: `NÃO`** (não há UI nem IPC para renomear o `name` de uma habilidade já salva). |
| **15. Lote (execução em lote)** | `NÃO` | `side_panel_v2.html`, `side_panel_v2.js` | Não há interface no painel v2 para revisar/editar uma lista de alunos em lote (ex.: desmarcar alunos específicos antes de aplicar nota/falta à turma). |
| **16. Estados vazios** | `SIM` | `side_panel_v2.html:52, 82, 145`, `desktop/ui/app.js:75, 250, 457` | Textos claros quando não há habilidades, discentes ou pacotes comunitários. |
| **17. Acessibilidade básica** | `PARCIAL` | `side_panel_v2.html:1-150`, `desktop/ui/index.html:1-320` | Bom contraste e fontes legíveis, mas modais (`#quarantine-modal` em `desktop/ui/index.html:305`) e cards de checkpoint não possuem `role="dialog"`, `aria-modal="true"`, `aria-live="polite"` no log de progresso nem trap de foco por teclado. |
| **18. Instalação sem terminal** | `PARCIAL` | `scripts/build-desktop.ts:1-95`, `desktop/nativeHost/autoRegister.ts:18-76` | O Native Host registra-se sozinho no registro do Windows quando o Desktop abre, mas não há instalador `.exe`/`.msi` (NSIS/Squirrel) configurado nem publicação na Chrome Web Store (exige carregar `teacher-extension/` em `chrome://extensions`). |

**O que impediria uma professora leiga de concluir sozinha hoje:**
1. Carregar a extensão descompactada no modo desenvolvedor do Chrome (`chrome://extensions`);
2. Ausência de histórico de auditoria consultável para conferir o que já foi lançado no portal;
3. Impossibilidade de renomear habilidades gravadas (que recebem IDs como `custom_skill` ou `nav_diario` se ela não batizar no momento exato da compilação);
4. Comandos em lote com exclusão (*"lançar presença para todos menos o João"*) não mostram a lista filtrada de alunos para conferência antes da execução.

---

## 9. Linguagem Natural — C5 (B7)

Leitura de `desktop/llm/llmGateway.ts` (`1–435`), `teacher-extension/orchestrator_v2.js` (`405–485`), `teacher-extension/side_panel_v2.js` (`369–456`) e `lib/explorer/domDistiller.ts` (`269–372`):

1. **Tratamento de nuances:**
   - **Ambiguidade de habilidade (pergunta ou escolhe?):** Em `desktop/llm/llmGateway.ts:323-358`, o parser pontua o catálogo por interseção de tokens e **escolhe silenciosamente `scored[0]`** (`const chosen = scored[0]?.skill || request.catalog[0]`, linha `346`). Só retorna `clarification_question` se `scored[0].score === 0` (nenhuma palavra casou, linha `325-331`). Se duas habilidades empatarem com score > 0, **não pergunta**.
   - **Parâmetro faltante:** Verifica `missingSlots = chosen.required_slots.filter(s => slots[s] === undefined || slots[s] === '')` (`llmGateway.ts:348-357`). Se faltar slot obrigatório, retorna `clarification_question: "Para executar \"...\", informe: ..."` e o painel exibe em `#sgv2-nlu-clarification` (`side_panel_v2.js:428-431`).
   - **Datas relativas (quem converte para `date`?):** `resolveRelativeDatePtBr(text)` em `desktop/llm/llmGateway.ts:159-185` (e em `lib/explorer/domDistiller.ts:258-267` no fallback offline) converte determinísticamente `hoje`, `ontem`, `anteontem`, `amanhã` e `DD/MM/YYYY` para `YYYY-MM-DD` no slot `slots.date` **em código TypeScript puro**, sem depender do LLM.
   - **Nomes com apelido / homônimo / acento:** Normaliza acentos (`NFD`) na busca de linha (`lib/runner-dom/selectors.ts:27`, `driver.ts:88-100`). Se houver homônimos na tabela (`matches.length > 1`), `locateRow` retorna `ambiguous: true` (`driver.ts:112-116`) e `executeLocateNode` lança `E_ROW_AMBIGUOUS` (`lib/runner/nodes/navigate.ts:91-93`). Não há resolução de apelidos (`"Chico"` → `"Francisco"`).
   - **Lote e exclusão (*"todos menos o João"*):** `LlmGateway.parseIntent` extrai `slots.exclude_students = "João"` e `slots.batch_mode = "all_except"` (`llmGateway.ts:227-232`). **Porém**, nenhum grafo do catálogo nem o `orchestrator_v2.js` consome `slots.exclude_students` ou `slots.batch_mode` durante `SKILLGRAPH_RUN` (o nó `LOOP` em `lib/runner/nodes/loop.ts` usa apenas `node.skip_rows` estático do grafo, não `params.exclude_students`!).
   - **Correção (*"na verdade 7,5"*):** `LlmGateway.parseIntent` (`llmGateway.ts:154`) recebe apenas `{ text, catalog }` da chamada atual — **não há histórico de conversa**. Se a professora digitar apenas *"na verdade 7,5"* no turno seguinte, o comando não tem verbo nem nome de aluno; `scored[0].score` será `0` (ou cairá na habilidade de nota sem o slot `student` do turno anterior).
   - **Várias tarefas numa frase:** No `LlmGateway.parseIntent` (`llmGateway.ts:154-370`), retorna um único `task_id` (`NluParseResponse` tem apenas um `task_id`). No fallback offline (`orchestrator_v2.js:464-469`), `decomposeCompoundTeacherCommand` separa os passos, mas `fallbackLocalNlu` pega apenas `primary = steps[0]` e descarta o resto.
   - **Negação (*"não lance falta para a Ana"*):** Não há detecção de negação da intenção principal em `llmGateway.ts:187-247`; a presença das palavras `"lance"` e `"falta"` e `"Ana"` fará o parser extrair `attendance: 'F', student: 'Ana'` como se fosse uma ordem afirmativa!
   - **Histórico de conversa:** **Ausente** no pipeline v2 (`SKILLGRAPH_NLU_PARSE` envia apenas `{ text: message.text }` em `orchestrator_v2.js:419`).
   - **Português coloquial e erros de digitação:** Suporta gírias mapeadas explicitamente em `llmGateway.ts:190-245` (`"bota"`, `"coloca"`, `"mete"`, `"veio"`, `"faltou"`, `"nota dez"`, `"tirou oito e meio"`), mas não possui distância de edição (Levenshtein) para erros de digitação nos verbos do catálogo.
   - **Ollama ausente:** `LlmGateway` faz fallback imediato e determinístico para o extrator regex/heurístico local (`llmGateway.ts:249-319`). Se o próprio app Desktop estiver fechado, `orchestrator_v2.js:422, 461-485` usa `fallbackLocalNlu`.
2. **Quantos casos de teste de NLU existem e que nuances cobrem?**
   - Existem **5 blocos de teste de NLU** em `__tests__/desktop.core.test.ts` (seção `3. Gateway LLM Local e Pseudonimização reversível` + itens de `G5` como `(4) NLU mapeia variações para o catálogo e pede clarificação quando ambíguo` e `(6) NLU compreende português coloquial, conceitos, notas por extenso e exclusões em lote`) e **1 cenário** em `scripts/run-e2e-chromium.ts:261-291` testando `decomposeCompoundTeacherCommand`. Cobrem: pseudonimização `ALUNO_1`, bloqueio de prompt sem pseudonimização, comando fora do catálogo (`score === 0`), nota com vírgula/conceito/extenso (`"oito e meio"`), data relativa (`"ontem"`) e extração do slot `exclude_students`.
3. **3 entradas que o código suporta vs. 3 entradas que NÃO suporta (por leitura de `llmGateway.ts` e `orchestrator_v2.js`):**
   - **Suporta:**
     1. `"Lançar nota 8,5 para a aluna Maria Silva ontem"` → extrai `grade: '8.5'`, `student: 'Maria Silva'`, `date: '<YYYY-MM-DD de ontem>'`.
     2. `"Coloca menção MB para João Pedro"` → extrai `grade: 'MB'`, `student: 'João Pedro'`.
     3. `"Dar falta para Lucas Mendes hoje"` → extrai `attendance: 'F'`, `student: 'Lucas Mendes'`, `date: '<YYYY-MM-DD de hoje>'`.
   - **NÃO suporta:**
     1. `"Não lance falta para o João hoje"` → ignora o `"Não"` e preenche o formulário para **lançar** falta para João.
     2. Turno 1: `"Lançar nota 8,0 para Ana"` → Turno 2: `"Na verdade 7,5"` → perde a referência à aluna `Ana` porque `SKILLGRAPH_NLU_PARSE` é stateless.
     3. `"Lançar presença para todos da turma 9A menos o João"` → embora `llmGateway.ts:227-232` coloque `exclude_students: 'João'` em `slots`, o `SkillGraphRunner` (`lib/runner/nodes/loop.ts`) **não filtra `params.exclude_students`**, então o loop não exclui o João na execução.
4. **O LLM pode influenciar valores escritos? Todo valor escrito passa por CHECKPOINT integral?**
   - **O LLM pode influenciar valores sugeridos nos slots**, pois em `desktop/llm/llmGateway.ts:276-288`, quando o Ollama responde, o código faz `slots[k] = val` para cada chave retornada por `parsed.slots` (desde que não sobreescreva `grade` numérico já extraído localmente na linha `281`).
   - **Todo valor escrito via `WRITE` passa por CHECKPOINT no painel v2:** `side_panel_v2.js:435-456` exibe os slots preenchidos no formulário de confirmação antes de rodar, e `orchestrator_v2.js:354-366` injeta um `CHECKPOINT` dinâmico antes de qualquer nó `WRITE` se o grafo não tiver um `CHECKPOINT` explícito (exceto o nó `UPLOAD`, que não é interceptado por `orchestrator_v2.js:355`!).

---

## 10. Cadeias de Ponta a Ponta (B8)

| ID | Cadeia | Saltos (`arquivo:linha → arquivo:linha`) | Status | Ponto Exato de Quebra |
| :--- | :--- | :--- | :---: | :--- |
| **N1** | **Navegação multi-página gravada** | `side_panel_v2.js:211` (`SKILLGRAPH_START_RECORD`) → `orchestrator_v2.js:754-809` (injeta `dist/recorder.bundle.js` e cria `skillgraph_recording` em `storage.session`) → `orchestrator_v2.js:1165-1202` (`chrome.tabs.onUpdated` grava step `kind: 'navigate'` e re-injeta `dist/recorder.bundle.js` após reload) → `side_panel_v2.js:228` (`SKILLGRAPH_STOP_RECORD`) → `orchestrator_v2.js:856-871` (une `accumulatedSteps`) → `lib/compiler/stages/segment.ts:52-75` + `assemble.ts:116-148` (gera nó `NAVIGATE`). | `PARCIAL` | Em `orchestrator_v2.js:856-873`, se `rec.steps` tiver apenas o step `navigate` adicionado pelo `onUpdated` (porque os cliques no `recorderCore.ts` ficaram na memória `window.__TEACHER_AI_RECORDER__` da página anterior antes do `beforeunload` e só enviaram `SKILLGRAPH_STEP_CAPTURED` se `extensionEntry.ts` conseguiu despachar antes do unload), ou se os últimos passos na última página ficaram apenas em `localTrace.steps` e não em `rec.steps`, `orchestrator_v2.js:856` usa **OU** `accumulatedSteps` **OU** `localTrace.steps` (não faz merge deduplicado se `SKILLGRAPH_STEP_CAPTURED` falhar num step final). |
| **N2** | **Explorar e aprender** | `side_panel_v2.js:375` (`SKILLGRAPH_NLU_PARSE` retorna `learned: false` / sem skill) → `side_panel_v2.js:380` (`SKILLGRAPH_EXPLORE_AND_LEARN`) → `orchestrator_v2.js:516-674` → `background.js:930` (`internalNavigatePortalTab`) → `orchestrator_v2.js:647` (`bundle.compile(trace, decisions)`) → `orchestrator_v2.js:653-658` (`saveStandaloneGraph(savedGraph, false)` + `nativeClient.send('graphs.save', { activate: false })`). | `PARCIAL` | (1) `domDistiller.ts` não é usado (`orchestrator_v2.js:567` usa `internalNavigatePortalTab`); (2) se o clique abrir link externo a outro domínio, a checagem de host (`orchestrator_v2.js:598`) só ocorre **depois** que a aba já navegou; (3) no Desktop (`desktop/main.ts:98-103`), salvar a v1 com `activate: false` deixa `is_active = 1` no SQLite porque `SqlSkillGraphRepository.save` marca v1 como ativa por padrão; (4) o botão `#sgv2-activate-learned` no painel (`side_panel_v2.js:391-404`) ativa em 1 clique sem dry-run. |
| **N3** | **Ler tabela paginada e salvar no app** | `side_panel_v2.js:186` (`SKILLGRAPH_RUN`) → `orchestrator_v2.js:294` (`runner.run`) → `lib/runner/nodes/read.ts:29-34` (`driver.readTable({ paginate })`) → `lib/runner-dom/driver.ts:199-243` (`state.variables[node.into] = rows`) → `orchestrator_v2.js:308` (`result`). | `DESCONECTADO` | **Quebra dupla:** (1) `readTable` paginado corre dentro de um único RPC no content script (`driver.ts:199-243`) e quebra se a paginação recarregar a página; (2) ao terminar `SKILLGRAPH_RUN` (`orchestrator_v2.js:294-345`), `result.state.variables` retorna no `sendResponse`, mas **não há chamada para `nativeClient.send('students.upsert', ...)`** em `orchestrator_v2.js` nem em `side_panel_v2.js`! Os alunos lidos pela habilidade `READ` **não são salvos no SQLite cifrado do app Desktop**. |
| **N4** | **Wizard com CHECKPOINT** | `side_panel_v2.js:458` (`SKILLGRAPH_RUN`) → `orchestrator_v2.js:354-366` (garante nó `CHECKPOINT`) → `lib/runner/nodes/checkpoint.ts:15-76` (`host.checkpoint`) → `workerEntry.ts:171-203` → `orchestrator_v2.js:230-250` (emite `SKILLGRAPH_CHECKPOINT_REQUEST` e aguarda `pendingCheckpointResolvers`) → `side_panel_v2.js:526-557` (usuário clica Aprovar → `SKILLGRAPH_CHECKPOINT_DECISION`) → `lib/runner/nodes/write.ts:30-230`. | `CONECTADO` (quebra em C6 se app fechado) | A cadeia UI → Runner → Checkpoint → Write está conectada de ponta a ponta. Porém, como `standaloneFallback: true` está ligado (`orchestrator_v2.js:279`), se o app Desktop estiver fechado, o `WRITE` subsequente grava no portal sem ack do cofre Desktop. |
| **N5** | **Baixar boletim (`DOWNLOAD`)** | `lib/runner/engine.ts:256` (`executeDownloadNode`) → `lib/runner/nodes/download.ts:40-45` (`driver.download`) → `lib/runner-ext/remoteDriver.ts:467-493` (`chrome.downloads.onCreated` com timeout de 300ms → fallback para `sendRpc('download')`) → `lib/runner-dom/driver.ts:466-507`. | `STUB` / `PARCIAL` | Se o download do navegador levar mais de `300ms` para disparar `chrome.downloads.onCreated` (`remoteDriver.ts:476`) e o botão for um `<button>` JS sem atributo `href`/`download`, `DomDriver.download` (`driver.ts:483-486`) **finge sucesso** retornando `{ success: true, filename: 'download_resultado.csv', sizeBytes: 1024 }`. |
| **N6** | **Linguagem natural → formulário → execução** | `side_panel_v2.js:369` (`#sgv2-btn-nlu`) → `orchestrator_v2.js:405` (`SKILLGRAPH_NLU_PARSE`) → `desktop/main.ts:181` (`nlu.parse`) → `desktop/llm/llmGateway.ts:154` (`parseIntent`) → `side_panel_v2.js:421-456` (`openParamsConfirmation` preenche inputs) → `side_panel_v2.js:458` (`#sgv2-btn-run-confirmed` → `SKILLGRAPH_RUN`). | `CONECTADO` (para tarefa simples) / `PARCIAL` (para lotes/exclusões) | Conectado para 1 tarefa do catálogo com slots escalares (`student`, `grade`, `attendance`, `date`). Quebra em lotes com exclusão (`exclude_students` não é aplicado no loop) e em comandos compostos com >1 escrita. |
| **N7** | **Popup de login → handoff → retomada** | `lib/runner/nodes/checkpoint.ts:78-130` (`executeHandoffNode`) → `orchestrator_v2.js:252-274` (`SKILLGRAPH_HANDOFF_STARTED`) → polling `evaluateCondition(node.resume_when)`. Porém `lib/runner-ext/ssoHandoff.ts` (`SSOHandoffManager`) **não é instanciado em lugar algum**. | `DESCONECTADO` | Se o portal abrir um popup OAuth/SSO em nova janela/aba (`chrome.tabs.onCreated` com `openerTabId`), o `orchestrator_v2.js` **não instancia `SSOHandoffManager`** (`ssoHandoff.ts:44-169`) para monitorar o fechamento do popup e retomar automaticamente. |
| **N8** | **Falha no meio (aba fechada, SW reciclado, app fechado) → estado seguro sem escrita duplicada** | `remoteDriver.ts:58-69, 98-144` (`NON_IDEMPOTENT_OPERATIONS` impede retry de `write`, e `chrome.tabs.get` detecta `E_TAB_CLOSED`), `workerEntry.ts:288-308` (`persistRunProgress` salva `active_runs` em `chrome.storage.session`). | `PARCIAL` (**Quebra em app fechado e SW reciclado**) | (1) **Aba fechada / RPC de escrita falho:** `NON_IDEMPOTENT_OPERATIONS` impede que `write` seja re-executado (seguro contra escrita duplicada); (2) **SW reciclado:** `workerEntry.ts:288-308` grava `active_runs[runId]` em `chrome.storage.session`, mas **nenhum código em `orchestrator_v2.js` lê `active_runs` no boot do Service Worker** para alertar a professora ou reconciliar a execução interrompida; (3) **App fechado:** devido a `standaloneFallback: true` (`orchestrator_v2.js:279`), **NÃO aborta** a escrita quando o app Desktop fecha no meio da execução! |

---

## 11. Testes e Builds Executados (B9)

### B9.1 Tabela do Orçamento Permitido (1x cada)

| # | Comando Executado | Resultado (Exit Code) | Nº Passou / Falhou | Tempo / Detalhe Literal |
| :---: | :--- | :---: | :---: | :--- |
| 1 | `npx tsc --noEmit` | `0` (OK) | Compilação limpa (0 erros TS) | Sem erros de tipo |
| 2 | `npm run build:ext` | `0` (OK) | 3 bundles gerados (`runner`, `content`, `recorder`) | `teacher-extension/dist/` verificado |
| 3 | `npm run desktop:build` | `0` (OK) | Bundles gerados em `dist-desktop/` | Empacotamento Electron concluído |
| 4 | `npx vitest run __tests__/skillGraphV2.contract.test.ts __tests__/graphRunner.core.test.ts __tests__/compiler.core.test.ts __tests__/repair.core.test.ts __tests__/desktop.core.test.ts __tests__/community.core.test.ts __tests__/extensionHost.integration.test.ts` | `0` (OK) | **150 passed / 0 failed** (7 arquivos) | `skillGraphV2.contract` (12), `repair.core` (15), `compiler.core` (13), `community.core` (35), `desktop.core` (27), `extensionHost.integration` (14), `graphRunner.core` (34) |
| 5 | `npm run test:e2e:chromium` | `0` (OK) | **8/8 cenários aprovados** | Executado via Electron Chromium + `DomDriver` injetado em `hostile-portal-e2e.html` |

### B9.2 Invariantes de C1–C6 que Só Têm Teste com Driver Falso (`FakeDriver` / Mocks) ou Fixture do Próprio Agente
1. **Todo o motor `SkillGraphRunner` (`__tests__/graphRunner.core.test.ts`):** Os 34 testes usam `HarnessDriver` (sobre JSDOM/HTML estático) ou mocks em memória. Nenhum teste executa `SkillGraphRunner` conectado ao `RemoteDriver` + `ContentAdapter` dentro de uma extensão Chrome real.
2. **Integração `ExtensionHost` / `RemoteDriver` / `SSOHandoffManager` (`__tests__/extensionHost.integration.test.ts`):** Os 14 testes usam um objeto `mockChrome` em memória (`chrome.tabs`, `chrome.storage`, `chrome.runtime` simulados em Node.js).
3. **Suíte `scripts/run-e2e-chromium.ts`:** Embora rode num processo Chromium real (Electron), **não carrega a extensão (`teacher-extension/`)**, não usa `SkillGraphRunner`, não usa `RemoteDriver`/`ContentAdapter`, não usa `NativeClient` e roda contra uma única página HTML (`hostile-portal-e2e.html`) criada pelo próprio agente sem lock SHA-256.
4. **Execução com Chrome real + extensão MV3 carregada + app Desktop via Native Messaging + Ollama real + portal escolar real:** `NÃO EXECUTADO (dono)`.

---

## 12. Bloqueios, Dívida e Recomendações (B10)

### 12.1 "Navegar e extrair/inserir em qualquer portal" é alegável hoje?
**NÃO.** Pelos seguintes motivos provados em código (E2) e execução (E1):
1. **Regressão de segurança ativa (C6):** `standaloneFallback: true` permite escrita real no portal com o app Desktop fechado e salva notas/nomes em `chrome.storage.local` sem cifra; e o nó `UPLOAD` ignora `dryRun` e `host.audit()`.
2. **Falsos positivos (stubs/fallbacks sintéticos):** `DomDriver.download` retorna sucesso com arquivo fictício (`download_resultado.csv`, 1024 B) quando nenhum download real ocorre; `DomDriver.upload` envia o nome do arquivo como se fosse o conteúdo do arquivo; `RemoteDriver.waitForNavigation` resolve sem erro no timeout; `DomDriver.paginate` tem `|| true` em `driver.ts:386`.
3. **Quebras estruturais em portais reais:** `readTable` paginado quebra se o clique em "Próxima" recarregar a página; `readTable` desalinha colunas quando há `colspan`/`rowspan` no `<tbody>`; `RemoteDriver` não propaga `frameId` da âncora em `readTable`, `scroll`, `paginate`, `download` e `upload`; `SSOHandoffManager` não está instanciado na extensão; e os dados lidos por `READ` nunca são persistidos via `students.upsert` no Desktop.

### 12.2 Lista Ordenada de `BLOQUEIA` (Até 8, com Esforço P/M/G)

| Prioridade | ID | Descrição do `BLOQUEIA` e Localização (`arquivo:linha`) | Objetivo Afetado | Esforço |
| :---: | :--- | :--- | :---: | :---: |
| **1** | **BLQ-1** | **`standaloneFallback: true` permite escrita real com o app Desktop fechado e grava PII/notas em `chrome.storage.local` sem cifra:** `teacher-extension/orchestrator_v2.js:279` e `lib/runner-ext/workerEntry.ts:241-285` suprimem `E_AUDIT_UNAVAILABLE` quando o Desktop está offline mesmo em `dryRun: false`, e gravam `before_value`, `after_value` e nomes em `standalone_audit_log_v2` (além de `side_panel.js:1028` gravar `cached_roster_${className}`). | **C6** | **P** |
| **2** | **BLQ-2** | **Nó `UPLOAD` muta o DOM sem auditoria write-ahead, sem respeitar `dryRun`, e com conteúdo de arquivo falso:** `lib/runner/nodes/upload.ts:17-93` incrementa `state.writesCount` sem chamar `host.audit()` e sem pular em `state.dryRun`, e `lib/runner-dom/driver.ts:519-535` cria `new File([options.source], ...)` onde o conteúdo do arquivo é literalmente a string do path. | **C4, C6** | **P** |
| **3** | **BLQ-3** | **Ativação sem revisão/dry-run e falta de `validateGraph` em grafos aprendidos/standalone:** `orchestrator_v2.js:91-142` salva grafos em `chrome.storage.local` sem `validateGraph`; `desktop/main.ts:98-103` deixa a v1 ativa no SQLite mesmo quando `activate: false` é passado; e `side_panel_v2.js:391-404` (`#sgv2-activate-learned`) ativa grafo explorado em 1 clique sem exibir nós/efeitos nem exigir dry-run. | **C6, C3** | **P** |
| **4** | **BLQ-4** | **Falsos sucessos silenciosos em `DOWNLOAD`, `waitForNavigation` e `paginate`:** `lib/runner-dom/driver.ts:483-486` retorna `download_resultado.csv` sintético quando nenhum download ocorre; `lib/runner-ext/remoteDriver.ts:532-534, 563-568` resolve `navigate`/`waitForNavigation` sem erro no timeout; `lib/runner-dom/driver.ts:386` tem `\|\| true` fixo em `paginate`. | **C1, C2, C4** | **P** |
| **5** | **BLQ-5** | **Leitura de tabela (`READ`) não persiste no Desktop e quebra em paginação multi-página ou `frameId` de iframe:** `orchestrator_v2.js:294-345` nunca envia os dados lidos por `READ` para `students.upsert` no Desktop; `driver.ts:199-243` perde o contexto se a paginação recarregar a página; e `remoteDriver.ts:280-286` não roteia `readTable`/`paginate`/`scroll` para o `frameId` descoberto na âncora. | **C1, C4** | **M** |
| **6** | **BLQ-6** | **`SSOHandoffManager` e recuperação de `active_runs` desconectados em produção:** `lib/runner-ext/ssoHandoff.ts:44-169` nunca é instanciado em `orchestrator_v2.js`/`background.js` (popups de login SSO não são rastreados), e `active_runs` gravado em `workerEntry.ts:288-308` nunca é lido pelo `orchestrator_v2.js` se o Service Worker for reciclado. | **C1, C2** | **M** |
| **7** | **BLQ-7** | **NLU ignora negação, perde exclusões em lote (`exclude_students`) na execução e não mantém contexto para correção:** `llmGateway.ts:187-247` trata frases negativas (*"não lance falta"*) como afirmativas; `exclude_students` não é filtrado pelo `SkillGraphRunner` (`loop.ts`) nem pelo `side_panel_v2.js:421-437`; e `SKILLGRAPH_NLU_PARSE` é stateless (quebra em *"na verdade 7,5"*). | **C5** | **M** |
| **8** | **BLQ-8** | **Falta visualização do histórico de auditoria e renomeação de habilidades na UI:** Não existe IPC `audit.list` em `desktop/main.ts` nem tabela de auditoria no Desktop/painel v2 para a professora auditar as escritas realizadas (`before_value` → `after_value`), nem opção de renomear habilidades salvas. | **C3** | **P** |

- **Cabem em UMA tarefa de correção?** Os itens **BLQ-1 a BLQ-4** (todos **P**, ~150 linhas combinadas) cabem juntos em **uma única tarefa curta e cirúrgica** de restauração de integridade e segurança. Os itens **BLQ-5 a BLQ-8** (**M**) exigem uma segunda entrega focada em integração de ponta a ponta.

### 12.3 Dívida Técnica (`DÍVIDA`) e `OBSERVAÇÃO`
- **`DÍVIDA-1` (`lib/explorer/domDistiller.ts` órfão no bundle):** `distillInteractiveDom` e `selectBestDistilledAction` foram incluídos no bundle de produção (`workerEntry.ts:379-381`), mas `SKILLGRAPH_EXPLORE_AND_LEARN` em `orchestrator_v2.js:567` continua chamando `internalNavigatePortalTab` do `background.js`. Além disso, `orchestrator_v2.js:598` só checa mudança de host *após* o clique.
- **`DÍVIDA-2` (`tableReader.ts:164-199`):** Falta expansão de `colspan`/`rowspan` nas células `<td>` do `<tbody>` e suporte a `mode: 'page_number'` em `driver.ts:379-428`.
- **`DÍVIDA-3` (Erros `E_*` sem tradução amigável):** `E_DOWNLOAD_FAILED`, `E_UPLOAD_FAILED`, `E_TIMEOUT`, `E_HANDOFF_TIMEOUT`, `E_SANDBOX_VIOLATION` e `E_REPAIR_INVALID` não estão em `FRIENDLY_ERRORS` (`orchestrator_v2.js:16-33` / `side_panel_v2.js:36-51`).
- **`DÍVIDA-4` (Higiene do repositório):** 24 arquivos modificados sem commit na working tree, incluindo arquivos fora de escopo (`AGENTS.md`, `components/EditableQuestionBoxes.tsx`, `lib/psychometricsEngine.ts`, `teacher-extension/side_panel.js`).
- **`OBSERVAÇÃO-1`:** Acessibilidade de modais (`role="dialog"`, `aria-live="polite"`) pode ser aprimorada em `side_panel_v2.html` e `desktop/ui/index.html`.

### 12.4 Três Recomendações Únicas Obrigatórias
1. **Sobre `standaloneFallback`:** **Restringir estritamente a `dryRun: true` (e leitura pura `READ`) e REMOVER qualquer fallback para escrita real (`dryRun: false`).** Quando o app Desktop estiver fechado, toda operação de escrita real (`WRITE` ou `UPLOAD` com `dryRun: false`) deve falhar imediatamente com `E_AUDIT_UNAVAILABLE` antes de tocar no DOM, e `standalone_audit_log_v2` nunca deve gravar `before_value`, `after_value` ou nomes de alunos em `chrome.storage.local`.
2. **Sobre o explorador (`SKILLGRAPH_EXPLORE_AND_LEARN`):** **Manter apenas como modo assistido sem auto-ativação.** O grafo gerado pela exploração deve permanecer inativo/quarentenado até que a professora visualize o resumo de nós/seletores e execute pelo menos um `dryRun: true` bem-sucedido (corrigindo também `desktop/main.ts:98-103` para respeitar `activate: false` na versão 1 e validando `href` contra `allowed_hosts` *antes* de clicar).
3. **Sobre o benchmark autoavaliado (`benchmark_browser_agents.md` e notas `9.48/10`):** **Descartar completamente como evidência de engenharia.** Notas atribuídas pelo próprio agente contra fixtures escritas na mesma sessão não provam funcionamento em portais reais e mascararam regressões críticas de C6 (`standaloneFallback`).

---

## 13. Roteiro do Dono (≤ 60 min, 8 Passos) (B11)

Pré-requisito único: com o build já gerado (`teacher-extension/dist/` e `dist-desktop/`), carregar `teacher-extension/` em `chrome://extensions` (Modo do desenvolvedor → Carregar sem compactação) e abrir o app Desktop.

| Passo | Ação do Dono (≤ 60 min no total) | Resultado Esperado |
| :---: | :--- | :--- |
| **1** | **Navegação multi-página gravada (`pagination.html`):** Abrir `tools/runner-harness/fixtures/pagination.html` (via servidor estático local), clicar em **"Gravar Demonstração"** no painel v2, clicar em "Próxima Página", clicar num elemento da página 2, parar gravação e salvar como `nav_paginada`. | O gravador captura o clique e a transição de página (`steps` > 1), solicita nome da habilidade e salva sem erro no painel. |
| **2** | **Leitura de tabela paginada:** Executar a habilidade de leitura de tabela sobre `pagination.html` (com `Simular (Dry-Run)` marcado ou desmarcado). | O log em tempo real mostra `"Lendo dados da tabela..."` e retorna as linhas agregadas das páginas sem travar a aba. |
| **3** | **Escrita com CHECKPOINT:** Abrir `tools/runner-harness/fixtures/grades-table.html`, pedir ou selecionar a habilidade de lançar nota para uma aluna (ex.: `Ana`, nota `8,5`) com `Simular (Dry-Run)` **desmarcado** e clicar em **"Executar no Portal"**. | Antes de alterar o input na página, o painel pausa e exibe o card amarelo **"Confirmação Necessária (CHECKPOINT)"** com os valores. Só escreve no input após clicar em **"Aprovar e Continuar"**. |
| **4** | **App fechado = escrita DEVE abortar sem alterar a página (Teste de Fogo C6):** Fechar o app Desktop, manter `Simular (Dry-Run)` **desmarcado** e tentar executar a mesma escrita do Passo 3 aprovando o Checkpoint. | **Esperado pela régua C6:** A execução deve abortar com erro de cofre Desktop desconectado (`E_AUDIT_UNAVAILABLE`) e **o valor no input da página NÃO pode mudar**. *(Nota da auditoria: no código atual com `standaloneFallback: true`, este passo **FALHARÁ** no teste de segurança, pois a página será alterada mesmo com o app fechado).* |
| **5** | **Popup de login → handoff → retomada:** Executar um grafo contendo `HANDOFF_HUMAN` (ou abrir tela de login/SSO do portal). | O painel exibe o alerta amarelo `"Ação necessária no portal: conclua o login/validação para o assistente continuar"` e retoma após o login ser concluído. |
| **6** | **Pedido em linguagem natural com 3 nuances:** Com o Desktop aberto, digitar no campo de texto: `"Coloca nota oito e meio para Maria Silva ontem em todas menos João"` e clicar em **"Interpretar Pedido"**. | O painel preenche o formulário de confirmação convertendo `"oito e meio"` → `8.5` e `"ontem"` → data ISO de ontem, pedindo confirmação antes de rodar. |
| **7** | **Reversão de versão:** Na seção **"Minhas Habilidades Gravadas"** (no Desktop ou em `"Gerenciar / Reverter Versão"` no painel v2), gravar uma v2 de uma habilidade e clicar em **"Ativar / Reverter"** na `v1`. | O status da `v1` volta para **Ativa** e a `v2` passa para **Inativa**. |
| **8** | **Leitura em UM portal real (somente leitura, conta do dono):** Abrir o portal escolar real autenticado, gravar uma leitura simples da lista de chamada (`READ`) e executá-la com **`Simular (Dry-Run)` marcado**. | Extrai as linhas visíveis sem modificar nenhum dado no portal escolar e sem enviar PII para a nuvem. |

### Tabela de Registro do Dono

| Passo | O que fiz | Mensagem exibida no Painel / App | Console (Erros / Avisos) |
| :---: | :--- | :--- | :--- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |

---

## 14. Apêndice (Comandos Executados, Falhas e `NÃO VERIFICADO`)

### 14.1 Comandos Executados Nesta Auditoria
1. **Inspeção Git e Grep (somente leitura):**
   - `git branch --show-current`
   - `git status --short`
   - `git log --oneline -15`
   - `git show --stat HEAD`
   - `git log --stat -5`
   - `git show --stat b0d0350; git show --stat b2444b0; git show --stat cf3cfde`
   - `git grep -n "standaloneFallback" -- lib teacher-extension desktop`
   - `git grep -n -E "chrome\.storage\.local" -- lib teacher-extension`
   - `git grep -n -E "activate: ?true" -- teacher-extension lib desktop`
   - `git grep -n -E "TODO|not implemented|E_NODE_UNSUPPORTED" -- lib teacher-extension desktop`
   - `git grep -n -E "internalNavigatePortalTab|NAVIGATE_PORTAL_TAB|portal_navigate|chrome\.tabs\.update" -- lib teacher-extension desktop sidecar`
2. **Orçamento de Builds e Testes (executados 1x cada):**
   - `npx tsc --noEmit` → `EXIT_TSC=0`
   - `npm run build:ext` → `EXIT_BUILD_EXT=0`
   - `npm run desktop:build` → `EXIT_BUILD_DESKTOP=0`
   - `npx vitest run __tests__/skillGraphV2.contract.test.ts __tests__/graphRunner.core.test.ts __tests__/compiler.core.test.ts __tests__/repair.core.test.ts __tests__/desktop.core.test.ts __tests__/community.core.test.ts __tests__/extensionHost.integration.test.ts --reporter=basic` → `EXIT_VITEST=0` (`150 passed`)
   - `npm run test:e2e:chromium` → `EXIT_E2E=0` (`8/8 suítes aprovadas`)

### 14.2 Itens `NÃO VERIFICADO` / `NÃO EXECUTADO (dono)` e Motivo
- **Execução da extensão empacotada (`teacher-extension/`) carregada no navegador Google Chrome do dono + comunicação IPC via pipe `com.teacherai.desktop` com o binário Electron em execução:** `NÃO EXECUTADO (dono)` — proibido pelas regras da auditoria abrir o app ou o Chrome do dono.
- **Inferência com modelo local Ollama (`llama3.2:3b` / `qwen2.5:3b`) em execução real:** `NÃO EXECUTADO (dono)` — proibido pelas regras da auditoria acionar rede ou LLM externo/local durante a auditoria; verificado por leitura estática de `desktop/llm/llmGateway.ts` (E2).
- **Execução contra portal escolar real de produção (ex.: `machadosobrinho.paineldoaluno.com.br`, TOTVS RM, SED-SP):** `NÃO EXECUTADO (dono)` — exige credenciais reais e observação supervisionada do dono (Passo 8 do Roteiro B11).
