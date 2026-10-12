# Backlog de Evoluções e Dívidas Técnicas

Este documento centraliza as funcionalidades, arquétipos e melhorias postergadas para fases futuras, conforme as regras anti-espiral do Teacher AI.

---

## 1. Concluído na Fase 6 (Local-First e Blindagem)

- [x] **App Desktop Electron (`desktop/`):** Processo isolado (`contextIsolation: true`, `sandbox: true`), único dono dos dados, sem portas TCP abertas.
- [x] **Banco de Dados SQLite Cifrado (`lib/desktop-core/db/`):** Envelope AES-256-GCM em colunas sensíveis via `node:sqlite`, DEK protegida pelo cofre do SO (DPAPI no Windows via `safeStorage`), backups cifrados por senha com scrypt + AES-GCM (`.tbackup`).
- [x] **Chrome Native Messaging e Named Pipes (`desktop/nm/` e `desktop/native-host/`):** Canal seguro extensão↔desktop via named pipes autenticados por nonce de uso único, sem listeners de rede.
- [x] **Auditoria Write-Ahead Cifrada Obrigatória:** Ack obrigatório do desktop antes de qualquer nó `WRITE`, bloqueando com `E_AUDIT_UNAVAILABLE` se o canal estiver indisponível.
- [x] **Gateway de LLM com Pseudonimização Estrita (`desktop/llm/` e `lib/desktop-core/llm/`):** Ollama local padrão; provedores em nuvem (Groq, OpenAI, Gemini, Anthropic) exigem consentimento prévio formal (`consents`) e reversão de pseudônimos estritamente na máquina da usuária.
- [x] **Conformidade LGPD Técnica:** Exportação integral de dados (`data.exportStudent`), expurgo definitivo em cascata (`data.eraseStudent`), e purga configurável de auditoria (`audit.purge`).
- [x] **Aposentadoria do Sidecar Python:** Permissão `"debugger"` removida da extensão MV3, scripts `.bat` legados desativados, eliminação definitiva da dependência de CDP e portas 8000/8765/9222.
- [x] **Varredura de Privacidade (`scripts/privacy-scan.ts`):** Validação estrita de repouso em disco e ausência de portas TCP.

---

## 2. Concluído na Fase 5 (Resiliência e Reparo)

- [x] **Reparo Automático Offline e Matcher Semântico Local (Degrau 3):**
  - Implementado 100% determinístico e sem LLM sob `lib/repair/` e `lib/repair/semantic/`.
  - Soft heal em runtime estritamente restrito a nós de leitura (`READ`, `LOCATE`, `WAIT`), fora de chaves de aluno.
  - Bloqueio total de escritas com `SAFE_ABORT` + snapshot higienizado para aprovação humana.
  - Suíte de conformidade de resiliência com 12 cenários DEV e 12 cenários HOLDOUT travados via SHA-256 (`conformance/repair/holdout.lock`).
  - Persistência de métricas de saúde sem PII (`graph_health:<portal_id>:<task_id>`) em `chrome.storage.local`.

---

## 3. Backlog Futuro / Pós-Fase 6

- **Suporte Multiplataforma para Desktop (macOS e Linux):**
  - *Contexto:* A Fase 6 focou em Windows-first (DPAPI via `safeStorage`, Named Pipes no formato `\\.\pipe\...`).
  - *Evolução:* Implementar adaptadores para macOS (Keychain + Unix Domain Sockets) e Linux (Secret Service / libsecret + Unix Domain Sockets).
  - *Prioridade:* Média.

- **Migração de Chaves de UI Restantes de `localStorage`:**
  - *Contexto:* Chaves sensíveis (alunos, turmas, notas, segredos) foram 100% migradas e expurgadas para o SQLite cifrado. Chaves visuais puramente locais de UI (tema claro/escuro, filtros de paginação) permaneceram no `localStorage`.
  - *Evolução:* Mover configurações de interface para a tabela `settings` no SQLite para unificação total.
  - *Prioridade:* Baixa.

- **Instalador NSIS Assinado Digitalmente (`electron-builder`):**
  - *Contexto:* A compilação é realizada via `scripts/build-desktop.ts` gerando bundles em `dist-desktop/`. A criação de instaladores executáveis autônomos (.exe assinado) requer certificado de assinatura de código EV/OV no Windows para evitar alertas de SmartScreen.
  - *Evolução:* Pipeline de CI/CD para build de instalador assinado.
  - *Prioridade:* Média.

- **Gravação em Lote (`LOOP` com `param_list`):**
  - *Contexto:* Na gravação de ações repetidas em tabela, o compilador hoje grava 1 aluno e o professor utiliza a ferramenta de replicação.
  - *Evolução:* Sintetizar automaticamente o nó `LOOP` iterando sobre a lista de alunos (com checkpoint `per_batch`) a partir da detecção de ≥2 mutações estruturalmente equivalentes no trace.
  - *Prioridade:* Média.

- **Nó `FILTER` Nativo (Contrato 2.1):**
  - *Contexto:* Controles de filtro (`<select>` ou input de busca) que filtram linhas na tela sem alterar a rota ou parâmetros de URL (`NAVIGATE.query`).
  - *Status Atual:* Classificado como **Tier 2** (assistido), emitindo instrução de conferência ou handoff antes do início da rotina.
  - *Evolução:* Criação formal do nó `FILTER` com restrições estritas de segurança (fora de linhas de dados e sem mutação arbitrária).
  - *Prioridade:* Média.
