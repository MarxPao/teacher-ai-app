# RESUMO MESTRE FINAL — TEACHER AI APP (ESTADO COMPLETO DO SISTEMA)
> **Documento Consolidado da Arquitetura, Módulos, Motores Pedagógicos e Infraestrutura Além da Rafinha**  
> **Versão:** 2.0 (Consolidação Pós-Auditoria de Mercado, Gaps Críticos e Automação)  
> **Repositório:** `blissful-noether` / `MarxPao/teacher-ai-app`  
> **Stack:** Next.js 16 (App Router, Turbopack, React 19, TypeScript), Tailwind CSS, Supabase, Web Crypto API, Gemini API, Chrome CDP.

---

## 1. Visão Geral & Filosofia Arquitetural

O **Teacher AI** é um sistema operacional completo para professores do Ensino Fundamental II, Ensino Médio e de Aulas Particulares. Ele foi projetado sob os seguintes pilares invioláveis:

1. **Local-First & Offline-First:** Toda a operação primária do professor reside em 95 chaves tipadas em `localStorage` gerenciadas por [`lib/localDB.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/localDB.ts). O sistema opera de forma plena mesmo sem conexão à internet.
2. **Sincronização Dual com Supabase (Opcional):** Permite backup em nuvem seguro com Row Level Security (RLS) sem comprometer o fluxo offline ([`lib/supabaseClient.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/supabaseClient.ts)).
3. **BYOK (Bring Your Own Key) com Validação Real:** Suporte a chaves próprias de Google Gemini, OpenAI, Groq e ElevenLabs, com validação de formato e teste de ping real contra as APIs ([`lib/byokValidator.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/byokValidator.ts)).
4. **Portabilidade Integral de Dados:** Exportação completa (JSON estruturado e CSVs de alunos, notas e agenda), importação segura com migração de versão e sanitização, e limpeza com preservação de preferências ([`lib/dataPortability.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/dataPortability.ts)).

---

## 2. Motores Pedagógicos Científicos & Psicometria Empírica

Diferente de assistentes genéricos, o Teacher AI embasa todas as suas gerações em princípios consolidados das Ciências da Aprendizagem e da Teoria de Resposta ao Item (TRI):

### 2.1 CAT (Testes Adaptativos Computadorizados) & Calibração Empírica
- **O Problema:** IAs pedagógicas tradicionais assumem níveis de dificuldade arbitrários (*seed heurístico*).
- **A Solução do Teacher AI:** Calibração empírica real onde parâmetros psicométricos ($b$ = dificuldade, $a$ = discriminação) só são consolidados após $N \ge 10$ respostas de alunos reais ([`lib/psychometricsEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/psychometricsEngine.ts)).
- **Gatilho de Prontidão (Item 14):** O algoritmo adaptativo fica formalmente bloqueado até que o banco atinja o limiar psicométrico de **40 questões calibradas ($N \ge 10$) em pelo menos 3 tópicos** ([`lib/catReadinessTrigger.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/catReadinessTrigger.ts)).
- **Transparência na UI:** Toda questão exibe um badge visual honesto: `[Estimativa Curricular Inicial (Seed)]` ou `[Calibrado Empiricamente (N=X)]`.

### 2.2 Repetição Espaçada SM-2 com Modulação de Carga Cognitiva
- **Localização:** [`lib/spacingScheduler.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/spacingScheduler.ts) e [`lib/cognitiveLoadTracker.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/cognitiveLoadTracker.ts).
- **Mecanismo:** Implementa o algoritmo SuperMemo SM-2 modulado pelo índice de fadiga da turma apurado no módulo `Wellbeing`. Se a turma estiver sob alta sobrecarga ($> 7.5$), o intervalo de repetição é estendido em 20% para evitar exaustão cognitiva.

### 2.3 Prática Intercalada Contrastiva (Contrastive Interleaving)
- **Localização:** [`lib/contrastiveInterleaving.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/contrastiveInterleaving.ts) e [`lib/testBlueprintEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/testBlueprintEngine.ts).
- **Mecanismo:** Combate a ilusão de domínio provocada pelo estudo em blocos isolados. Identifica pares conceituais concorrentes (ex: *Simple Past* ↔ *Present Perfect*, *Crase Obrigatória* ↔ *Crase Proibida*) e impõe alternância estrita no blueprint da avaliação.

### 2.4 Correção OMR Determinística de Cartões-Resposta
- **Localização:** [`lib/omrDeterministicEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/omrDeterministicEngine.ts).
- **Mecanismo:** Analisa o contraste e alinhamento geométrico de gabaritos em grade. Se a confiança estatística da leitura for inferior a 85%, marca o cartão como `needs_manual_review` sem emitir notas falsas.

### 2.5 Abstração Multi-Matéria (Subject Profiles)
- **Localização:** [`lib/subjectProfile.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/subjectProfile.ts) e [`lib/subjects/`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/subjects/).
- **Matérias Ativas:**
  - **Língua Inglesa (`english.ts`):** Framework CEFR (A1 a C2), Cambridge TKT, pares contrastantes e habilidades BNCC EF06LI a EF09LI.
  - **Língua Portuguesa (`portuguese.ts`):** Gêneros textuais, gramática normativa, crase, concordância e BNCC EF06LP a EF09LP.

---

## 3. Automação de Portais Escolares (Browser Harness)

A automação de portais oficiais (Machado Sobrinho, Rede Santa Catarina, Plurall, Cambridge One, Microsoft Teams) segue rigorosos protocolos de segurança:

1. **Diretiva de Segurança 0-Tester (Pausa Antes do Submit):**
   - O preenchimento dos campos no DOM é autônomo via extensão Chrome (`fillPortal`).
   - A submissão definitiva é **terminantemente travada** até a aprovação humana explícita do professor (`confirm_portal_submission`).
2. **Orquestração Multi-Página Encadeada (Gap 3 — MultiStepPortalPlan):**
   - Suporta comandos compostos ("faz a chamada e preenche o diário") através de máquina de estados contínua ([`lib/portalActionsEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/portalActionsEngine.ts)).
3. **Conformidade LGPD & Trilha de Auditoria Sanitizada:**
   - Sanitização de dados pessoais sensíveis antes do tráfego externo ([`lib/portalSanitizer.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/portalSanitizer.ts)).
   - Trilha de auditoria criptografada em AES-GCM localmente.

---

## 4. Mapa Exaustivo dos 45 Módulos da Aplicação

| # | Módulo (`key`) | Categoria | Natureza Agêntica | Status |
|---|---|---|---|:---:|
| 1 | `dashboard` | Gestão | Agêntico (`add_todo`) | ✅ 100% |
| 2 | `test_and_worksheets` | Avaliação | Agêntico (`generate_exam_content`) | ✅ 100% |
| 3 | `quick` | Avaliação | Agêntico (`generate_quick_questions`) | ✅ 100% |
| 4 | `exam` | Avaliação | Agêntico (`generate_exam_content`) | ✅ 100% |
| 5 | `lessonstudio` | Planejamento | Agêntico (`create_full_lesson`) | ✅ 100% |
| 6 | `plan` | Planejamento | Agêntico (`create_lesson_plan`) | ✅ 100% |
| 7 | `rubric` | Avaliação | Agêntico (`create_rubric`) | ✅ 100% |
| 8 | `gradebook` | Avaliação | Agêntico (`add_student_grade`) | ✅ 100% |
| 9 | `omnigrader` | Avaliação | Hardware / Câmera OCR | ✅ 100% |
| 10 | `students` | Gestão | Agêntico (`create_student`, `update_student_metric`, `record_student_observation`) | ✅ 100% |
| 11 | `classes` | Gestão | Agêntico (`create_class`) | ✅ 100% |
| 12 | `organization` | Institucional | Agêntico (`apply_school_header`) | ✅ 100% |
| 13 | `checklist` | Gestão | Visualização de Checklists | ✅ 100% |
| 14 | `privatetutoring` | Financeiro/Aulas | Agêntico (`record_private_tutoring_session`) | ✅ 100% |
| 15 | `eventos` | Calendário | Visual / Linha do Tempo | ✅ 100% |
| 16 | `visualstudio` | Criação | Tátil / Canvas Visual | ✅ 100% |
| 17 | `insights` | Diagnóstico | Visual / Análise de Dados | ✅ 100% |
| 18 | `analytics` | Diagnóstico | Visual / Gráficos de Turma | ✅ 100% |
| 19 | `calendar` | Planejamento | Agêntico (`create_calendar_task`) | ✅ 100% |
| 20 | `comms` | Comunicação | Agêntico (`create_communication`) | ✅ 100% |
| 21 | `repo` | Conteúdo | Agêntico (`save_repo_material`, `query_library`) | ✅ 100% |
| 22 | `wellbeing` | Docência | Monitoramento Docente / Carga Cognitiva | ✅ 100% |
| 23 | `settings` | Configuração | Preferências / Portabilidade de Dados | ✅ 100% |
| 24 | `api` | Configuração | Gerenciador BYOK com Teste de Conexão | ✅ 100% |
| 25 | `qbank` | Avaliação | Agêntico (`add_qbank_question`) / CAT | ✅ 100% |
| 26 | `mindmap` | Planejamento | Agêntico (`create_mindmap`) | ✅ 100% |
| 27 | `editor` | Conteúdo | Agêntico (`create_document`, `apply_school_header`) | ✅ 100% |
| 28 | `communications` | Comunicação | Agêntico (`create_communication`) | ✅ 100% |
| 29 | `portfolio` | Avaliação | Agêntico (`add_portfolio_item`) | ✅ 100% |
| 30 | `extensions` | Automação | Agêntico (Portais Escolares) | ✅ 100% |
| 31 | `portalmirror` | Automação | Agêntico (`execute_portal_action`) | ✅ 100% |
| 32 | `maestro` | Sala de Aula | Dinâmicas de Sala / Grupos | ✅ 100% |
| 33 | `classlog` | Gestão | Diário de Bordo da Aula | ✅ 100% |
| 34 | `didacticsequence` | Planejamento | Agêntico (`manage_didactic_sequence`) | ✅ 100% |
| 35 | `livequiz` | Sala de Aula | Quiz Interativo com PIN ao Vivo | ✅ 100% |
| 36 | `parentcomms` | Comunicação | Agêntico (`generate_parent_communication`) | ✅ 100% |
| 37 | `classroommode` | Sala de Aula | Modo Fullscreen Projetor / Lousa | ✅ 100% |
| 38 | `attendancelist` | Gestão | Chamada Rápida Interna | ✅ 100% |
| 39 | `flashcardmode` | Aprendizagem | Flashcards com Flip 3D | ✅ 100% |
| 40 | `audiopronunciation` | Ensino | Agêntico (`evaluate_student_audio`) | ✅ 100% |
| 41 | `reflectivepractice` | Docência | Diário Reflexivo Docente | ✅ 100% |
| 42 | `meetingclassrecorder` | Gestão | Gravação ao Vivo de Reuniões de Pais | ✅ 100% |
| 43 | `weeklyagenda` | Planejamento | Agêntico (`add_weekly_agenda_item`) | ✅ 100% |
| 44 | `batchgrader` | Avaliação | Correção em Lote OMR | ✅ 100% |
| 45 | `progresstracker` | Diagnóstico | Acompanhamento Longitudinal | ✅ 100% |

---

## 5. Status da Suíte de Testes Automatizados

- **Total de Arquivos de Teste:** **42 arquivos** em `__tests__/`.
- **Total de Testes Unitários e de Integração:** **319 testes passando (100% de sucesso)**.
- **Tipagem TypeScript:** 0 erros com `npx tsc --noEmit`.
- **Build Turbopack:** Verificado com sucesso.

Este documento consolida o mapa completo de arquitetura do Teacher AI App e deve ser mantido como referência de engenharia de software para o projeto.
