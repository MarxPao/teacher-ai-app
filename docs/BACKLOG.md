# Backlog de Evoluções e Dívidas Técnicas

Este documento centraliza as funcionalidades, arquétipos e melhorias postergadas para versões futuras, conforme as regras anti-espiral do Teacher AI.

---

## 1. Concluído na Fase 7 (Comunidade: Pacotes de Mapas, Assinatura e Registro)

- [x] **Formato Padronizado de Pacote (`skillpkg/1`):** Especificação rígida em JSON (.skillpkg.json) com manifesto, grafo sanitizado e assinatura digital Ed25519.
- [x] **Canonicalização Determinística JCS (RFC 8785):** Implementação pura em TypeScript (`canonical.ts`), garantindo hashing determinístico independente de plataforma.
- [x] **Sanitização de PII e Placeholders RFC 2606 (`h1.invalid`):** Pipeline de exportação expurga nomes de alunos e turmas, substituindo domínios reais por marcadores neutros.
- [x] **Quarentena e Dry-Run Pré-Ativação:** Tabela `community_packages` com fluxo `quarantined` $\rightarrow$ `dry_run_passed` $\rightarrow$ `activated`. Repositório `SqlSkillGraphRepository` bloqueia execução com `E_GRAPH_QUARANTINED`.
- [x] **Guarda de Runtime Anti-Submissão Oculta (`E_CLICK_UNDECLARED_SUBMIT`):** Inspeciona botões de ação e aborta cliques em botões de salvar/submeter não declarados no grafo importado.
- [x] **Proteções Anti-ReDoS e Parser JSON Estrito:** Expressões regulares validadas estaticamente com truncamento a 2.000 caracteres; parser seguro contra poluição de protótipo e recursão profunda.
- [x] **Cliente de Registro Estático com Privacidade Total:** Busca 100% em memória no cliente a partir de `index.json` assinado por chave mestra (`pinnedKey.ts`), sem telemetria de consulta.
- [x] **Proteção Contra Rollback de Versão:** Rastreamento em `community_seen_versions` bloqueando downgrades maliciosos (`E_PKG_ROLLBACK`).
- [x] **Template de Registro Comunitário (`registry-template/`):** Script de verificação automatizada (`verify-registry.ts`) e workflow de CI para GitHub Actions.

---

## 2. Concluído na Fase 6 (Local-First e Blindagem)

- [x] **App Desktop Electron (`desktop/`):** Processo isolado (`contextIsolation: true`, `sandbox: true`), único dono dos dados, sem portas TCP abertas.
- [x] **Banco de Dados SQLite Cifrado (`lib/desktop-core/db/`):** Envelope AES-256-GCM em colunas sensíveis via `node:sqlite`, DEK protegida pelo cofre do SO (DPAPI no Windows via `safeStorage`), backups cifrados por senha com scrypt + AES-GCM (`.tbackup`).
- [x] **Chrome Native Messaging e Named Pipes (`desktop/nm/` e `desktop/native-host/`):** Canal seguro extensão↔desktop via named pipes autenticados por nonce de uso único, sem listeners de rede.
- [x] **Auditoria Write-Ahead Cifrada Obrigatória:** Ack obrigatório do desktop antes de qualquer nó `WRITE`, bloqueando com `E_AUDIT_UNAVAILABLE` se o canal estiver indisponível.
- [x] **Gateway de LLM com Pseudonimização Estrita (`desktop/llm/` e `lib/desktop-core/llm/`):** Ollama local padrão; provedores em nuvem (Groq, OpenAI, Gemini, Anthropic) exigem consentimento prévio formal (`consents`) e reversão de pseudônimos estritamente na máquina da usuária.
- [x] **Conformidade LGPD Técnica:** Exportação integral de dados (`data.exportStudent`), expurgo definitivo em cascata (`data.eraseStudent`), e purga configurável de auditoria (`audit.purge`).
- [x] **Aposentadoria do Sidecar Python:** Permissão `"debugger"` removida da extensão MV3, scripts `.bat` legados desativados, eliminação definitiva da dependência de CDP e portas 8000/8765/9222.
- [x] **Varredura de Privacidade (`scripts/privacy-scan.ts`):** Validação estrita de repouso em disco e ausência de portas TCP.

---

## 3. Concluído na Fase 5 (Resiliência e Reparo)

- [x] **Reparo Automático Offline e Matcher Semântico Local (Degrau 3):**
  - Implementado 100% determinístico e sem LLM sob `lib/repair/` e `lib/repair/semantic/`.
  - Soft heal em runtime estritamente restrito a nós de leitura (`READ`, `LOCATE`, `WAIT`), fora de chaves de aluno.
  - Bloqueio total de escritas com `SAFE_ABORT` + snapshot higienizado para aprovação humana.
  - Suíte de conformidade de resiliência com 12 cenários DEV e 12 cenários HOLDOUT travados via SHA-256 (`conformance/repair/holdout.lock`).
  - Persistência de métricas de saúde sem PII (`graph_health:<portal_id>:<task_id>`) em `chrome.storage.local`.

---

## 4. Backlog Futuro / Pós-Fase 7

- **Suporte Multiplataforma para Desktop (macOS e Linux):**
  - *Contexto:* O desenvolvimento focou em Windows-first (DPAPI via `safeStorage`, Named Pipes no formato `\\.\pipe\...`).
  - *Evolução:* Implementar adaptadores para macOS (Keychain + Unix Domain Sockets) e Linux (Secret Service / libsecret + Unix Domain Sockets).
  - *Prioridade:* Média.

- **Reexportação de Mapas Importados com Linhagem:**
  - *Contexto:* Na Fase 7, mapas com `provenance.source === 'imported'` têm reexportação expressamente bloqueada (`E_EXPORT_NOT_ALLOWED`) para evitar cadeias de suprimentos confusas.
  - *Evolução:* Permitir reexportação de mapas bifurcados/re-gravados preservando um campo de linhagem de crédito (`forked_from: {key_id, package_id, version}`).
  - *Prioridade:* Baixa.

- **Sistema de Confiança Social e Feedback Descentralizado:**
  - *Contexto:* O registro estático atual não implementa avaliações, comentários ou métricas de uso para manter total silêncio de rede e zero telemetria.
  - *Evolução:* Protocolo descentralizado de reputação assinado por professoras verificadas via Git PR ou atestações públicas.
  - *Prioridade:* Baixa.

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

---

## 5. Dívidas Técnicas Isoladas da Integração / Pós-Gate A

- **Expurgo de fetches a `localhost:3000` em scripts legados da extensão:** Restam 15 ocorrências em `teacher-extension/side_panel.js` e 4 ocorrências em `teacher-extension/content.js`, inativas no fluxo do painel v2 (`side_panel_v2.html` / `orchestrator_v2.js`).
- **Ponte legada de `content.js` com a página do app Next:** Desacoplar listeners e bridge de comunicação direta entre `content.js` e o frontend web local em `localhost:3000`.
- **Expurgo definitivo de `lib/supabaseClient.ts`:** Módulo legado de cliente Supabase web na raiz de `lib/`, não utilizado pelo motor desktop nem pelo runner v2.

