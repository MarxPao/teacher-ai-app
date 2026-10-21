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

## 5. Dívidas Técnicas Isoladas da Integração / Pós-Gate A (RESOLVIDAS)

- [x] **Expurgo de fetches a `localhost:3000` em scripts da extensão:**
  - `teacher-extension/side_panel.js`: **0 ocorrências remanescentes** (todas as 15 substituídas por persistência em `chrome.storage.local` e resposta assistiva local-first).
  - `teacher-extension/content.js`: **0 ocorrências remanescentes** (todas as 4 removidas/desacopladas).
- [x] **Ponte legada de `content.js` com a página do app Next:** Desacoplada e removida (comunicação exclusiva via Chrome Native Messaging com o Desktop).
- [x] **Módulos legados marcados como `@deprecated`:**
  - `lib/supabaseClient.ts`: marcado como `@deprecated`, sem chamadas ativas pelo engine.
  - `lib/agentTools.ts`: marcado como `@deprecated`.
  - `lib/exportUtils.ts`: marcado como `@deprecated`.
  - `lib/teacherCalibrations.ts`: marcado como `@deprecated`.
  - `scripts/package_distribution.py`: marcado como `[DEPRECATED]`.
  - `sidecar/native_host/teacherai_native_host.bat`: marcado como `[DEPRECATED]`.
- [ ] **Instalador sem Terminal (.exe / NSIS):**
  - O app desktop v2 compila e opera via `dist-desktop/` com registro HKCU em `scripts/native-host-register.ts`. A geração de instalador executável autônomo sem terminal depende de homologação de empacotador (`electron-builder`) e assinatura de código Authenticode para evitar falsos positivos de antivírus/SmartScreen.

---

## 6. Próximas Etapas (Pós-Gate A e SSO Handoff) e Itens Fora de Escopo

- [ ] **Etapa 2 — Gravação Assistida de Fluxos Complexos com Sub-grafos:** Gravação encadeada de navegação em múltiplos passos com compilação determinística e nós de checkpoint.
- [ ] **Etapa 3 — Expansão de Arquétipos Complexos:** Suporte avançado para paginação virtualizada infinita e grades tabulares multidimensionais.
- [ ] **Etapa 4 — Auditoria Formal de Conformidade Multi-Portal:** Testes automatizados contra matriz ampliada de portais escolares.
- [ ] **Exploração autônoma por LLM (Auto-Recorder):** Descoberta exploratória delegada a modelos em nuvem (fora do runner determinístico local-first).
- [ ] **Ancoragem visual multimodal:** Detecção por visão computacional/VLM para páginas sem âncoras semânticas ou DOM estável.
- [ ] **Benchmark bipartido automatizado:** Suíte contínua comparando tempo de compilação humana vs. precisão determinística em produção.
- [ ] **Aposentadoria definitiva de `side_panel.js` legado:** Migração integral dos painéis restantes para o stack `side_panel_v2.js`.
- [ ] **Expurgo final de eventuais chamadas residuais a `localhost:3000`** em scripts utilitários ou protótipos fora da extensão.
- [ ] **Substituição de blocos `catch` console-only em scripts legados da extensão por `reportError`:**
  - `teacher-extension/orchestrator_v2.js`: migrado integralmente para `reportError(err, context)` com notificação `SKILLGRAPH_ERROR_NOTICE` no painel lateral.
  - Arquivos legados pendentes (fora do limite de 80 linhas por arquivo):
    - `teacher-extension/background.js`: linhas 57, 134, 152, 469, 492, 650, 998, 1277.
    - `teacher-extension/content.js`: linhas 949, 1007, 1291, 1344, 1370.
    - `teacher-extension/side_panel.js`: linhas 148, 696, 809, 1084, 1455, 2248, 2266, 2289, 2500, 2608.

---

## 7. Unificação Arquitetural dos Motores DOM (Lacuna #1 do Motor)

- **Diagnóstico:** Historicamente coexistiram dois motores de exploração e execução de DOM no projeto:
  1. O motor exploratório em `teacher-extension/background.js` (linhas 930–1288), injetando closures ad-hoc com heurísticas de busca de `<select>`, variantes ordinais e detecção de nós interativos via `chrome.scripting.executeScript`;
  2. O motor canônico determinístico em `lib/runner-dom/` (`writer.ts`, `selectors.ts`, `domActionPlanner.ts`), governado pelos contratos estritos do SkillGraph v2.
- **Risco de Divergência:** A exploração conseguia navegar em certas cascatas de selects, mas a execução do grafo pelo runner sofria atrito em tempo real por sutilezas de opções ocultas (`isOptUsable`), falta de espera de silêncio de mutações assíncronas no DOM (`waitForDomSettled`) e correlação com selects pais.
- **Arquitetura Alvo (Unificada):**
  - **Única Fonte da Verdade:** O content script e o runner passam a consumir exclusivamente o motor unificado `lib/runner-dom/` (`writer.ts`, `selectors.ts`, `domActionPlanner.ts`).
  - **Eliminação de Duplicação:** As rotinas ad-hoc de `background.js` são progressivamente substituídas por chamadas estruturadas via `ContentAdapter` / `DomDriver`.
  - **Garantia de Paridade:** Toda e qualquer lógica de interação DOM (filtragem de opções visíveis/habilitadas, ordenação topológica de selects dependentes e estabilização via MutationObserver) reside em módulos TypeScript compartilhados, com paridade 1:1 comprovada por suíte de testes.

---

## 8. Pendências e Decisões de Privacidade de Insights (Passo 1 — Bloco 0)

- [ ] **Preservação de Dados de LocalStorage sem Quebra de Chaves:** As chaves de armazenamento local (`teacher_students`, `teacher_insights_ai_report`, etc.) foram preservadas para manter a retrocompatibilidade sem destruição de dados da usuária. A migração completa para repositório SQLite cifrado no desktop fica agendada para ciclo subsequente.
- [ ] **Sincronização de Relatórios de Conselho de Classe (`classCouncilEngine`):** `syncCouncilReportsToSupabase` foi blindado com expurgo de PII (`studentName: '[ESTUDANTE_PROTEGIDO]'`, `studentId: '[ID_PROTEGIDO]'`). Persistência individual integral permanece exclusivamente local em conformidade com o Trilho 1 LGPD.

---

## 9. Geradores de Insights Pendentes de Migração para Contrato InsightV1 (Passo 4 — Bloco 0)

Conforme a arquitetura do Passo 4, o contrato unificado `InsightV1` (`lib/insights/insightEngineV1.ts`) e o gate amostral (`N_MIN_STUDENT_TRAJECTORY = 3`, `N_MIN_CLASS_AGGREGATE = 5`, `N_MIN_ITEM_DISCRIMINATION_ZDP = 8`) foram implementados e integrados ao `SmartInsightsPanel.tsx`. Os geradores legados abaixo permanecem agendados para migração em lotes nos ciclos subsequentes:

- [ ] **`lib/pedagogicalInsights.ts`:** Migrar regras determinísticas de desvio de nota e engajamento para a estrutura de `signals`, `facts`, `hypotheses` e separação estrita de incerteza do `InsightV1`.
- [ ] **`lib/predictiveAnalytics.ts`:** Migrar cálculos de projeção e fatores de risco para emitir `signals` com tamanho de janela $N$ e rotulagem neutra livre de afirmativas causais absolutas.
- [ ] **`lib/executivePedagogicalSummary.ts`:** Migrar sumários executivos agregados da turma para validar contra o validador `validateInsightContract`.
- [ ] **`lib/classCouncilEngine.ts`:** Unificar os pareceres de conselho de classe bimestrais com os tipos `InsightV1` e campos obrigatórios de ressalva amostral (`caveats`).
- [ ] **`sidecar/pedagogical_anomaly_guardian.py`:** Padronizar as regras de alerta estatístico do guardião Python para refletir os limiares amostrais mínimos e os campos de confiança ordinal (`baixa`, `media`, `alta`).


