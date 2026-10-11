# Registro de Pré-Voo e Correções da Fase 3 (T3.0b)

Data: 11/10/2026  
Branch: `fase-3-gravador`  
Status: **Pré-voo Auditado e Registrado**

---

## 1. Auditoria do Merge da Fase 2 (C1)

- **Remoto & Branches (`git remote -v`, `git branch -vv`)**:
  - `origin` configurado para `https://github.com/MarxPao/teacher-ai-app.git`.
  - A branch local `main` não possui upstream rastreado configurado e **nenhum push remoto foi realizado**.
- **Reflog e Ponto de Partida (`git reflog show main -8`)**:
  - `main@{0}`: commit `e364fe4` (merge fast-forward de `fase-2-engine`).
  - `main@{1}`: commit `7b46311` (commit exato de `main` antes do merge, correspondente ao fechamento da Fase 1).
- **Tag e Ancestralidade**:
  - Tag `skillgraph-v2.0-frozen` confirmada na árvore.
  - `git merge-base --is-ancestor skillgraph-v2.0-frozen main` retornou código de saída `0` (verdadeiro).
  - Todos os 16 commits da `fase-2-engine` foram integrados localmente em `main`.
- **Integridade dos Relatórios**:
  - SHA256 de `docs/PHASE2_FINAL_REPORT.md` e `docs/PHASE2_REPORT.md`:  
    `CAEF0A3708C082550E4C831D16B42C021675347D4D72C9F812D9E938497EE62D` (arquivos idênticos mantidos).
- **Conclusão C1**:
  *O merge de `fase-2-engine` em `main` foi realizado estritamente no ambiente local (sem push), partindo do commit `7b46311`.*

---

## 2. Repositório de Grafos da Extensão (C2)

- **Busca por Repositórios (`git grep`)**:
  - `ChromeStorageSkillGraphRepository`: **Não encontrado** (código de saída 1).
  - `MemorySkillGraphRepository`: **Não encontrado** (código de saída 1).
- **Diagnóstico da Lacuna**:
  - A interface abstrata existe em [`lib/repositories/SkillGraphRepository.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/repositories/SkillGraphRepository.ts) (`get`, `listVersions`, `save`, `setActive`), mas as implementações concretas não foram escritas na Fase 2.
  - Atualmente, o runner consome grafos sintéticos embutidos (`SkillGraphBundle.SkillGraphV2.syntheticGraphs`) ou colados no textarea do harness, e persiste estados transitórios em `chrome.storage.session`.
- **Proposta de Tarefa T3.8b**:
  - Criar `lib/repositories/ChromeStorageSkillGraphRepository.ts` e `MemorySkillGraphRepository.ts` implementando a interface `SkillGraphRepository` sobre `chrome.storage.local` e memória, com versionamento incremental imutável (`v1`, `v2`, etc.) indexado por `portal_id` e `task_id`.

---

## 3. Permissões, Frames e Ferramentas (C3)

- **Permissões no `teacher-extension/manifest.json`**:
  - `permissions`: `["activeTab", "storage", "tabs", "sidePanel", "scripting", "debugger", "nativeMessaging", "alarms"]`.
  - `host_permissions`: `["<all_urls>"]`.
  - `optional_permissions` / `optional_host_permissions`: Não declaradas.
  - `content_scripts`: Todos os frames (`all_frames: true`, `match_about_blank: true`) recebem `dist/content-adapter.bundle.js` e `content.js`.
- **Análise de `webNavigation`**:
  - `webNavigation` **não** está declarada e não é usada no código atual (`git grep -n "webNavigation"` = vazio).
  - O [`RemoteDriver`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/remoteDriver.ts) envia RPC para frames via `chrome.tabs.sendMessage(tabId, msg, { frameId })` (permitido pela permissão `tabs`). A listagem de frames é feita pelo [`ContentAdapter`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/runner-ext/contentAdapter.ts) varrendo elementos `<iframe>` no DOM vivo.
  - *Anotação para T3.8:* Na Fase 3, para capturar navegações completas no Service Worker com `transitionType`, a permissão `webNavigation` precisará ser solicitada com justificativa.
- **Herança Legada**:
  - Permissões `debugger` e `nativeMessaging` anotadas como legado do caminho CDP/Sidecar antigo, mantidas intactas para limpeza planejada na Fase 6.
- **Caminhos Canônicos**:
  - Painel do runner no harness: [`tools/runner-harness/index.html`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/tools/runner-harness/index.html) e `harness.ts`.
  - Painel do runner na extensão: [`teacher-extension/side_panel.html`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/teacher-extension/side_panel.html) e `side_panel_v2.js`.
  - Visualizador de eventos: [`tools/runner-harness/traceView.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/tools/runner-harness/traceView.ts) (`TraceView`).
  - Script de build da extensão: `"build:ext"` (`npx tsx scripts/build-extension-runner.ts` no `package.json`).

---

## 4. Pendências para Decisão do Dono (GATE 0)

1. **Aprovação da Tarefa T3.8b**: Implementação de `ChromeStorageSkillGraphRepository` e `MemorySkillGraphRepository`.
2. **Decisão sobre o BLOQUEIO DE CONTRATO (Filtro de Turma em Grafo Read-Only)**:
   - Opção 1: Filtro via `NAVIGATE.query` parametrizada (sem alterar contrato).
   - Opção 2: Filtro por clique em abas/botões (`CLICK` não-submit, já suportado).
   - Opção 3: Adição do nó puro `FILTER` ou autorização de `WRITE` controlado.
