# TEACHER AI — MANUAL MESTRE DE SISTEMA, CAPACIDADES AGÊNTICAS & ENGINE PEDAGÓGICO
> **Documento de Transferência Cognitiva e Referência Operacional para Agentes Autônomos e Modelos de Linguagem (LLMs)**  
> **Versão**: 2.0 (Pós-Auditoria Agêntica & Resolução de Gaps Críticos)  
> **Repositório**: `blissful-noether` / `MarxPao/teacher-ai-app`  
> **Stack**: Next.js 16 (App Router, Turbopack, React 19, TypeScript), Tailwind CSS, Supabase, Web Crypto API, Gemini API, Chrome Extension (CDP).

---

## 1. Visão Geral do Sistema & Filosofia Arquitetural

O **Teacher AI** é um sistema operacional pedagógico desenhado para professores do ensino básico (Fundamental II e Médio) e de aulas particulares. Ele combina:
1. **Local-First / Offline-First**: O estado do professor reside em 95 chaves tipadas em `localStorage` gerenciadas por [`lib/localDB.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/localDB.ts). O app funciona 100% offline se necessário.
2. **BYOK (Bring Your Own Key)**: O professor pode fornecer suas próprias chaves de API (Google Gemini, OpenAI, Groq, ElevenLabs) e projeto Supabase. Há validação em tempo real com teste de ping real (`testApiConnection`).
3. **Nuvem Opcional / Supabase Dual**: Quando configurado, sincroniza dados de forma bidirecional e segura com o Supabase ([`lib/supabaseClient.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/supabaseClient.ts)).
4. **Agente Conversacional Proativo ("Rafinha")**: Uma assistente com tom animado, naturalidade brasileira, estilo Alexa/Jarvis, que não apenas responde a dúvidas, mas **executa mutações reais de estado no app e opera portais escolares externos**.

### As Três Diretivas Invioláveis do Sistema
Qualquer modelo ou agente operando nesta aplicação **DEVE** seguir estritamente:

1. **Diretiva de Segurança 0-Tester (Portais Escolares)**:
   - *Regra*: É terminantemente proibido qualquer disparo de submit/save definitivo automático no DOM de um portal escolar oficial (Machado Sobrinho, Plurall, Rede Santa Catarina, Cambridge One, etc.).
   - *Fluxo Obrigatório*: O agente navega $\to$ Preenche os campos no formulário em modo supervisionado (`supervised`) $\to$ Para imediatamente $\to$ Apresenta prévia para confirmação humana do professor $\to$ O professor clica no portal ou envia comando explícito de confirmação.
2. **Diretiva de Honestidade Agêntica & Bloqueio de Alucinação (Gap 1)**:
   - *Regra*: Se o professor solicitar uma tarefa para um módulo que não possui ferramenta de mutação exposta ou que dependa de hardware físico (áudio ao vivo via microfone, OCR ao vivo via câmera) e nenhum arquivo/gravação foi fornecido, o agente é **PROIBIDO de inventar laudos, notas orais ou resultados fictícios**, e **PROIBIDO de passar parâmetros falsos como `"N/A"` para forçar tools**.
   - *Ação*: O agente deve admitir a limitação técnica com gentileza e clareza, oferecendo navegar o professor até o módulo correspondente via `navigate_to_module`.
   - *Aulas Particulares*: Devem ser registradas via `record_private_tutoring_session` e NUNCA desviadas silenciosamente para o calendário de aulas regulares.
3. **Diretiva de Privacidade & LGPD**:
   - Dados de estudantes (nomes, notas, faltas) são sanitizados antes de envio para endpoints externos ([`lib/portalSanitizer.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/portalSanitizer.ts)).
   - A Trilha de Auditoria utiliza criptografia AES-GCM (ou chave derivada) antes de gravar detalhes sensíveis em log.

---

## 2. O Cérebro Agêntico & Capacidades de Execução

### 2.1 A Persona e Orquestração da Rafinha
- **Localização**: [`app/api/agent/route.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/app/api/agent/route.ts) e [`components/RafinhaChat.tsx`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/components/RafinhaChat.tsx).
- **Interface**: Chat flutuante expansível, orbe de voz reativo, integração com atalho global (`Ctrl+K` para Command Palette, `Alt+Shift+V` para WisprFlow, wake word nativa `"Ei, Rafinha"` via Web Audio API em [`lib/wakeWordEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/wakeWordEngine.ts)).
- **Formato Canônico**: As mensagens trafegam no formato `CanonicalMessage` ([`lib/agentTools.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/agentTools.ts)), convertidas dinamicamente para os provedores (Gemini `functionDeclarations`, OpenAI `tools`, Anthropic `tool_use`).

### 2.2 Catálogo de Ferramentas Agênticas (25 Tools Canônicas)
Definidas em [`lib/agentTools.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/agentTools.ts) e implementadas no `executeTool` de [`components/RafinhaChat.tsx`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/components/RafinhaChat.tsx):

| Tool Name | Propósito Principal | Parâmetros Chave | Efeito Colateral / Persistência |
| :--- | :--- | :--- | :--- |
| `navigate_to_module` | Troca a tela ativa no app | `module: ModuleKey` | Chama `onNavigate(module)` |
| `add_todo` | Insere item no checklist da home | `text: string` | Grava em `teacher_agenda_checklist` |
| `create_calendar_task` | Agenda eventos e tarefas regulares | `title, date, classRef, type, priority` | Grava em `teacher_calendar_tasks` |
| `create_lesson_plan` | Card no Lesson Planner | `title, subject, objectives, className, duration` | Grava em `teacher_lesson_plans` |
| `create_communication` | Redige avisos e circulares para pais | `title, content, type` | Grava em `teacher_communications` |
| `add_student_grade` | Lança nota no boletim | `studentName, column, grade` | Atualiza `teacher_students` e `teacher_gbConfig` |
| `execute_portal_action` | Preenche portais escolares (simples ou multi-etapas) | `platform, actionType, title, date, classRef, steps` | Dispara `fillPortal`, cria tarefa em `browser_tasks` |
| `confirm_portal_submission` | Aprova/aborta ação pendente no portal | `action: 'approve' \| 'abort', taskId?` | Finaliza tarefa no Supabase / sessionStorage |
| `show_portal_screenshot` | Exibe print do portal pré-preenchido | `taskId?` | Retorna URL de preview antes de salvar |
| `fill_school_portal` | Preenchimento direto legado | `platform, title, date, classRef` | Ponte com extensão Chrome |
| `open_school_portal` | Abre aba com URL do portal | `platform: string` | Dispara `window.open` |
| `generate_exam_content` | Pré-configura gerador de prova ELT | `topic, classRef, questionCount, level, type` | Grava em `teacher_exam_prefill` e navega |
| `speak_response` | Dispara síntese de voz local | `text: string` | Audio sintetizado via ElevenLabs/WebSpeech |
| `update_student_metric` | Atualiza radar pedagógico do aluno | `studentName, metricKey, score` | Grava em `teacher_student_metrics` |
| `record_student_observation`| Memória viva do aluno (forças/fraquezas) | `studentName, note, category, subcategory` | Grava em `teacher_student_memory` |
| `create_class` | Cadastra nova turma | `name, school, year, shift` | Grava em `teacher_classes` |
| `create_student` | Cadastra aluno vinculado à turma | `name, classRef, email` | Grava em `teacher_students` |
| `query_library` | Busca contextual nos livros didáticos RAG | `query, textbook?, type?` | Consulta [`lib/ragEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/ragEngine.ts) |
| `search_web` | Busca web em tempo real (notícias, BNCC) | `query: string` | Invoca [`lib/webSearch.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/webSearch.ts) |
| `add_qbank_question` | Salva questão inédita no QBank | `questionText, eltCategory, level, options, answer` | Grava em `teacher_qbank_questions` |
| `create_mindmap` | Cria mapa mental visual em nó | `topic, branches` | Grava em `teacher_mindmaps_v2` |
| `save_repo_material` | Salva recurso no repositório do professor | `title, type, category, url` | Grava em `teacher_repo_materials` |
| `generate_quick_questions` | 5 questões de aquecimento/Exit Ticket | `topic, level` | Grava em `teacher_quick_prefill` e navega |
| `generate_parent_communication` | Mensagem formatada para WhatsApp dos pais | `studentName, topic, tone` | Grava em `teacher_parent_comms_prefill` |
| `record_private_tutoring_session` | Agenda aula particular individual | `studentName, date, time, duration, fee, topic` | Grava em `teacher_private_students` |
| `evaluate_student_audio` | Avalia gravação oral com áudio real anexado | `studentName, audioUrl, exerciseRef, criteria` | Grava em `teacher_student_memory` |

### 2.3 Orquestração Multi-Página de Portais Escolares (Gap 3 — MultiStepPortalPlan)
- **O Problema Resolvido**: Anteriormente o harness agêntico só executava uma ação atômica por turno. Se o professor pedisse *"faz a chamada da 8B com falta do Lucas e preenche o diário com Simple Past"*, a execução colapsava no passo intermediário.
- **A Arquitetura Implementada** ([`lib/portalActionsEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/portalActionsEngine.ts)):
  ```typescript
  export interface PortalStepDef {
    stepIndex: number
    actionType: PortalActionType // 'attendance' | 'diary' | 'grades' | etc.
    title: string
    payload: PortalFillPayload
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    resultSummary?: string
  }

  export interface MultiStepPortalPlan {
    id: string
    platform: string
    classRef: string
    steps: PortalStepDef[]
    currentStepIndex: number
    status: 'idle' | 'executing' | 'awaiting_approval' | 'completed' | 'failed'
    createdAt: number
    unifiedSummary?: string
  }
  ```
- **Ciclo de Vida da Execução Encadeada**:
  1. *Decomposição*: O modelo recebe o comando composto e gera `steps: [...]` no `execute_portal_action`.
  2. *Sessão Contínua*: A máquina de estados `executeMultiStepPortalPlan` itera pelos passos sem quebrar o contexto de aba/sessão CDP.
  3. *Resumo Unificado*: Consolida as etapas em um prompt de voz/texto único:
     `"Chamada da 8B preparada (2 faltas: Carlos, Lucas) + Diário preparado ('Simple Past'). Confirmar ambos?"`
  4. *Supervisão Final*: Ao receber aprovação via `confirm_portal_submission`, todas as etapas são efetivadas.

### 2.4 Browser Automation Harness & Chrome Extension Bridge
- **Ponte Bidirecional** ([`lib/portalBridge.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/portalBridge.ts)):
  - Utiliza canais duplos: `window.postMessage` para comunicação in-page e `BroadcastChannel('teacher_portal_bridge')` para comunicação direta com a extensão Chrome injetada.
- **Descoberta Autônoma de Layout (Camada 2)** ([`sidecar/portal_discovery_agent.py`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/sidecar/portal_discovery_agent.py)):
  - Se um portal desconhecido for acessado ou se o HTML sofrer alteração, o agente de visão inspeciona o DOM, infere os seletores CSS (`roster_table`, `name_column`, `id_column`, paginação) e salva o mapa em `teacher_discovered_portal_maps` no Supabase.

---

## 3. O Motor Pedagógico & Psicometria Empírica

O Teacher AI possui um dos motores pedagógicos mais completos da categoria, alinhado à Teoria de Resposta ao Item (TRI), BNCC e Ciências da Aprendizagem.

### 3.1 CAT (Testes Adaptativos Computadorizados) & Calibração Empírica
- **O Princípio Científico**:
  - Modelos pedagógicos ingênuos usam dificuldade assumida (*seed heurístico* baseado em nível escolar ou CEFR).
  - O Teacher AI implementa **calibração empírica real**: parâmetros psicométricos $b$ (dificuldade) e $a$ (discriminação) só são considerados válidos quando a questão acumula $N \ge 10$ respostas de alunos reais ([`lib/psychometricsEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/psychometricsEngine.ts)).
- **Transparência de Badges na UI**:
  - Toda questão em [`QuestionBank.tsx`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/components/modules/QuestionBank.tsx) ou no Player de Provas exibe explicitamente:
    - `[Estimativa Curricular Inicial (Seed)]` se $N < 10$.
    - `[Calibrado Empiricamente (N=X)]` assim que $N \ge 10$.
- **Gatilho de Prontidão para CAT (Item 14)** ([`lib/catReadinessTrigger.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/catReadinessTrigger.ts)):
  - O motor bloqueia o modo adaptativo puro até que o banco atinja o limiar estatístico:
    $$\text{isReady} = (N_{\text{calibradas}} \ge 40) \land (\text{tópicos} \ge 3)$$
  - Quando atingido, ativa a escada adaptativa de 4 degraus com máxima informação de Fisher no ponto $\theta$.

### 3.2 Spaced Repetition (SuperMemo SM-2) com Modulação de Carga Cognitiva
- **Localização**: [`lib/spacingScheduler.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/spacingScheduler.ts) e [`lib/cognitiveLoadTracker.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/cognitiveLoadTracker.ts).
- **Algoritmo**:
  - Implementa SM-2 clássico com atualização do Fator de Facilidade ($EF$):
    $$EF' = EF + (0.1 - (5 - q) \times (0.08 + (5 - q) \times 0.02))$$
  - **Inovação**: Modulação por estresse e fadiga da turma via check-ins do módulo `Wellbeing`. Se a carga cognitiva da turma estiver alta ($> 7.5$), o intervalo de repetição é suavizado em 20% para evitar sobrecarga de memória de trabalho.

### 3.3 Prática Intercalada Contrastiva (Contrastive Interleaving)
- **Localização**: [`lib/contrastiveInterleaving.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/contrastiveInterleaving.ts).
- **Conceito**: Em vez de blocos isolados (*blocking*), o motor identifica pares conceituais de alta confusão mútua (ex: *Simple Past* vs *Present Perfect*, *In* vs *On*, *Countable* vs *Uncountable*).
- **Geração de Itens**: Obriga a formulação de questões emparelhadas que exigem discriminação semântica contrastiva ativa pelo aluno.

### 3.4 Motor OMR Determinístico de Correção de Provas
- **Localização**: [`lib/omrDeterministicEngine.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/omrDeterministicEngine.ts).
- **Funcionamento**: Processa imagens escaneadas de gabaritos em grade (A, B, C, D, E).
- **Auditoria de Confiabilidade**: Analisa contraste e preenchimento de bolhas. Se a confiança geométrica de leitura for inferior a 85%, marca o cartão como `needs_manual_review` sem emitir falsos positivos.

### 3.5 Abstração Multi-Matéria (Subject Profiles)
- **Localização**: [`lib/subjectProfile.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/subjectProfile.ts) e [`lib/subjects/`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/subjects/).
- **Arquitetura**: O app nasceu centrado em Língua Inglesa (ELT / CEFR), mas foi plenamente desacoplado para operar qualquer disciplina escolar:
  - `english.ts`: Taxonomias Cambridge, CEFR (A1 a C2), fonética e habilidades BNCC EF06LI a EF09LI.
  - `portuguese.ts`: Gêneros textuais, gramática normativa, interpretação e BNCC EF06LP a EF09LP.
  - Interfaces dinâmicas permitem plugar Matemática, História, Ciências sem alterar o core da aplicação.

---

## 4. Guia Exaustivo dos Módulos do Sistema

A aplicação possui 45 rotas/aliases mapeadas em [`app/page.tsx`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/app/page.tsx). Cada módulo foi classificado de acordo com sua natureza agêntica:

### 4.1 Módulos com Ferramentas Agênticas Próprias
1. **Dashboard** (`dashboard`): Hub inicial com widgets de tarefas, recados e métricas. Tool: `add_todo`.
2. **Test & Worksheets** (`test_and_worksheets`, `quick`, `exam`): Gerador de provas e listas de exercícios com taxonomia de Bloom. Tools: `generate_exam_content`, `generate_quick_questions`.
3. **Lesson Studio** (`lessonstudio`, `plan`, `didacticsequence`): Planejador de planos de aula e sequências didáticas em timeline. Tools: `create_lesson_plan`, `manage_didactic_sequence`.
4. **Rubric Studio** (`rubric`): Construtor de matrizes e rubricas de avaliação formativa. Tool: `create_rubric`.
5. **Gradebook** (`gradebook`): Boletim de notas com colunas configuráveis e cálculo ponderado. Tool: `add_student_grade`.
6. **Students** (`students`): Gestão de alunos, radar individual de competências e memória pedagógica. Tools: `create_student`, `update_student_metric`, `record_student_observation`.
7. **Classes** (`classes`): Gestão de turmas e enturmação de alunos. Tool: `create_class`.
8. **Planner & Calendar** (`calendar`, `weeklyagenda`): Calendário de provas e grade horária semanal. Tools: `create_calendar_task`, `add_weekly_agenda_item`.
9. **Communications** (`comms`, `parentcomms`, `communications`): Central de avisos para pais e bilhetes formais. Tools: `create_communication`, `generate_parent_communication`.
10. **Repository** (`repo`): Repositório de mídias, PDFs e biblioteca de conteúdos. Tools: `save_repo_material`, `query_library`.
11. **Question Bank** (`qbank`): Banco psicométrico de questões com calibração empírica. Tool: `add_qbank_question`.
12. **MindMap** (`mindmap`): Editor de mapas mentais gráficos interativos. Tool: `create_mindmap`.
13. **Editor Canvas** (`editor`): Editor rico de documentos e avaliações formatadas para impressão. Tool: `create_document`.
14. **Portfolio** (`portfolio`): Histórico evolutivo e evidências de aprendizagem por aluno. Tool: `add_portfolio_item`.
15. **Private Tutoring** (`privatetutoring`): Gestão de alunos particulares, mensalidades e agendamentos. Tool: `record_private_tutoring_session`.
16. **Audio Pronunciation** (`audiopronunciation`): Análise fonética de gravações de voz de alunos. Tool: `evaluate_student_audio` (com bloqueio estrito sem mídia).
17. **Portal Mirror** (`portalmirror`, `extensions`): Conector do navegador para espelhamento e automação de portais. Tools: `execute_portal_action`, `confirm_portal_submission`, `show_portal_screenshot`, `fill_school_portal`, `open_school_portal`.

### 4.2 Módulos "Correto Ficar Só Navegação" (Hardware ou Visual/Tátil)
18. **OmniGrader** (`omnigrader`): Correção de provas via OCR de câmera de smartphone/webcam em tempo real.
19. **BatchGrader** (`batchgrader`): Digitalização de lotes de provas e escaneamento contínuo OMR.
20. **MeetingClassRecorder** (`meetingclassrecorder`): Gravador e transcritor ao vivo de reuniões de pais e aulas com microfone físico aberto.
21. **ClassroomMode** (`classroommode`): Modo fullscreen para exibição na lousa interativa ou projetor da sala.
22. **LiveQuiz** (`livequiz`): Quiz síncrono com projeção de código PIN para resposta dos alunos via celular.
23. **FlashcardMode** (`flashcardmode`): Visualizador de flashcards com animação tátil 3D de flip card.
24. **VisualStudio** (`visualstudio`): Canvas criativo para diagramação manual e geração de ilustrações DALL-E.
25. **Settings** (`settings`): Preferências manuais do usuário (tema visual, foto de perfil, idioma da UI).
26. **ApiManager** (`api`): Gerenciador seguro de chaves confidenciais com máscara de senha e teste de conexão.
27. **Organization** (`organization`): Upload e ajuste fino de cabeçalhos institucionais com logotipo escolar.
28. **Eventos** (`eventos`): Linha do tempo gráfica de feiras pedagógicas e calendário institucional.
29. **Checklist History** (`checklist`): Consulta visual ao histórico de checklists pré-aula e auditoria.

### 4.3 Módulos Candidatos para Futuras Ferramentas Agênticas
30. **Wellbeing** (`wellbeing`): Atualmente apenas formulário visual. Poderia receber `record_wellbeing_checkin` para registrar cansaço ou humor docente via voz.
31. **ReflectivePractice** (`reflectivepractice`): Diário reflexivo. Poderia receber `add_reflective_journal_entry` para ditado de reflexões pedagógicas pós-aula.
32. **ClassLog** (`classlog`): Diário de bordo da aula. Poderia receber `record_class_log` para registrar ocorrências disciplinares em tempo real.
33. **AttendanceList** (`attendancelist`): Chamada interna do app. Poderia receber `record_local_attendance`.
34. **AutoReport** (`autoreport`): Compilação de boletins. Poderia receber `generate_student_report`.
35. **Maestro** (`maestro`): Assistente de dinâmica de sala. Poderia receber `trigger_maestro_action` para sortear grupos e acionar timers.

---

## 5. Arquitetura de Dados & Camada de Persistência

### 5.1 Centralização LocalDB (`lib/localDB.ts`)
Para evitar corrupção por acessos descentralizados ao `localStorage`, todos os schemas e funções de acesso utilizam helpers tipados:
- `safeGet<T>(key, fallback)`: Faz o parse com tratamento de erro silencioso e fallback previsível.
- `safeSet<T>(key, value)`: Serializa JSON e dispara eventos reativos (`storage` e `teacher:data_changed`).
- Constantes de chaves exportadas em `KEYS` (ex: `KEYS.STUDENTS`, `KEYS.PRIVATE_STUDENTS`, `KEYS.QBANK_QUESTIONS`).

### 5.2 Segurança, BYOK e Conformidade LGPD
1. **Auditoria de Portais Sanitizada** ([`lib/portalSanitizer.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/portalSanitizer.ts)):
   - O método `sanitizeOutboundPayload` remove CPF, e-mails pessoais e dados sensíveis antes de qualquer envio.
   - O log de ações em portais grava hashes irreversíveis e cifra detalhes em AES-GCM local antes de exportação.
2. **BYOK Portability & Isolation**:
   - Chaves de API nunca são expostas publicamente. Em produção, se o usuário não preencheu o formulário BYOK, a API responde com código explicativo solicitando a configuração.
   - O assistente conta com fallback automático entre modelos Gemini (`gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-3.1-flash-lite`) para contornar quotas de RPM/RPD do Free Tier.

---

## 6. Guia Prático de Manutenção para Agentes de Código

Ao assumir este repositório para manutenção ou expansão:

1. **Checagem de Integridade TypeScript**:
   - Comando: `npx tsc --noEmit`
   - O projeto possui 0 erros de compilação. Qualquer adição de tool ou interface **DEVE** satisfazer rigorosamente as tipagens.
2. **Suíte de Testes Automatizados (Vitest)**:
   - Comando: `npm test -- --run`
   - Deve reportar **100% de aprovação em todos os 41 arquivos de teste**. Nunca quebre os testes de compatibilidade LGPD, de sanitização ou do motor psicométrico CAT.
3. **Compilação de Produção**:
   - Comando: `npm run build`
   - Usa Turbopack. Assegure que as rotas dinâmicas e skeletons de carregamento em `app/page.tsx` continuem funcionando sem hidratação quebrada.
4. **Adição de Novas Ferramentas**:
   - Sempre adicione em 4 pontos essenciais:
     1. Schema canônico em [`lib/agentTools.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/agentTools.ts) (`AGENT_TOOLS`).
     2. Mapeamento visual em `TOOL_DISPLAY_NAMES` em [`lib/agentTools.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/lib/agentTools.ts).
     3. Diretivas e exemplos no System Prompt em [`app/api/agent/route.ts`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/app/api/agent/route.ts).
     4. Handler de execução com persistência real no `switch (toolName)` de [`components/RafinhaChat.tsx`](file:///c:/Users/rafae/Documents/antigravity/blissful-noether/components/RafinhaChat.tsx).

---
*Este documento é a especificação formal e viva da inteligência do Teacher AI. Preserve-o e atualize-o a cada nova iteração arquitetural.*
