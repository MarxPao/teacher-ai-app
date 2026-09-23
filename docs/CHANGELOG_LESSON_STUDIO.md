# Changelog — Engine de Criação de Planos de Aula (LessonStudio)
## Teacher AI App — Auditoria de Fronteira e Implementação
**Período coberto:** pesquisa de mercado inicial até a implementação e validação das 3 prioridades identificadas.  
**Última atualização:** 19 de setembro de 2026

---

## Sumário
1. [Motivação e Pesquisa de Mercado](#1-motivação-e-pesquisa-de-mercado)
2. [Auditoria de Fronteira — Estado Inicial](#2-auditoria-de-fronteira--estado-inicial)
3. [Prioridade 1 — Auto-Mapeamento BNCC](#3-prioridade-1--auto-mapeamento-bncc)
4. [Prioridade 2 — Frameworks Pedagógicos Reais](#4-prioridade-2--frameworks-pedagógicos-reais)
5. [Prioridade 3 — Pacote de Aula em 1 Clique](#5-prioridade-3--pacote-de-aula-em-1-clique)
6. [Estado Final e Posicionamento Competitivo](#6-estado-final-e-posicionamento-competitivo)
7. [Pendências e Próximos Passos](#7-pendências-e-próximos-passos)

---

## 1. Motivação e Pesquisa de Mercado

Antes de qualquer alteração, foi conduzida pesquisa do mercado de ferramentas de IA para planejamento de aula (2026), identificando os líderes e seus diferenciadores reais:

| Ferramenta | Diferenciador |
| :--- | :--- |
| **MagicSchool** | Amplitude (80+ ferramentas), compliance forte (FERPA/COPPA/SOC2) |
| **Eduaide.ai** | Multi-framework pedagógico explícito (5E, UbD, Gagné, Montessori) |
| **Brisk Teaching** | Vive dentro do Google Docs/Slides/Classroom, sem trocar de aba |
| **ClassroomAI Teaching Workspace** | Pacote completo (plano + prova + rubrica + comunicado) em 1 clique, com código de norma curricular específico |

### Vantagens competitivas do Teacher AI identificadas antes de qualquer mudança (nenhum concorrente pesquisado cobre isso):
- **Especialização em ELT brasileiro:** interferência L1 português $\to$ inglês, gating CEFR.
- **Memória longitudinal do aluno** integrada à geração de conteúdo.
- **Modelo BYOK** (nenhum concorrente SaaS oferece isso).

**Princípio orientador definido:** não copiar amplitude (80 ferramentas do MagicSchool não é meta), e sim aprofundar a vantagem já existente no nicho específico onde o Teacher AI já lidera.

---

## 2. Auditoria de Fronteira — Estado Inicial

Auditoria comparativa (mercado vs. código real) revelou:

| Capacidade do Mercado | Teacher AI Tinha? | Diagnóstico Inicial |
| :--- | :---: | :--- |
| **Múltiplos frameworks pedagógicos** | Parcial/Rígido | 🔴 **Atrás** — 9 presets locais, mas todos forçados em schema fixo de 4 etapas |
| **Pacote completo integrado (1-click)** | Não | 🔴 **Atrás** — 4 módulos desconectados, sem contexto compartilhado |
| **Especificidade de norma curricular (código BNCC exato)** | Parcial | 🟡 **Equivalente** — base de dados rica (`bnccData.ts`), mas seleção manual |
| **Memória longitudinal do aluno** | Sim | 🟢 **À frente** — mas desconectada do `LessonStudio` especificamente |
| **Especialização ELT (L1/CEFR)** | Sim | 🟢 **À frente** — mas não conectada ao gerador de planos |

### Achados-chave da auditoria inicial:
- **Teste real comparativo (PPP vs. TBLT):** gerou a mesma estrutura de 4 blocos com apenas texto diferente — provando que a diferenciação por metodologia era cosmética, não estrutural.
- **Descoberta importante:** `lib/pedagogicalMethodologies.ts` já continha 22 metodologias documentadas (Vygotsky Scaffolding, Inquiry-Based, etc.), mas conectadas apenas a `ExamBuilder.tsx` / `QuickGenerate.tsx` — nunca ao `LessonStudio.tsx`. Grande parte do trabalho seria "religar", não construir do zero.
- **Grep honesto:** busca por `studentMemory` em `LessonStudio.tsx` retornou 0 ocorrências — confirmando que a maior inovação arquitetural do produto (memória viva do aluno) nunca alimentava a geração de planos de aula.

### Matriz de priorização definida:
```
ALTO IMPACTO ▲ [1] Auto-Mapeamento BNCC         [3] Pacote Integrado 1-Clique
             │ (Esforço: Baixo)                (Esforço: Médio)
             │
             │ [2] Injeção de Frameworks Reais (5E / UbD / TBLT)
             │ (Esforço: Médio)
             └────────────────────────────────────────────────────►
               BAIXO ESFORÇO                    MÉDIO/ALTO ESFORÇO
```

---

## 3. Prioridade 1 — Auto-Mapeamento BNCC

### Implementação:
- `lib/bnccData.ts`: expandido com habilidades oficiais do MEC (8º ano), incluindo `EF08LI08`, `EF08LI17`, `EF08LI18`, `EF08LI19`.
- `lib/bnccInference.ts` (novo): motor de inferência 100% determinístico e local (sem embeddings, <1ms), com thesaurus especializado em ELT (Present Perfect, Conditionals, Future, etc.) e normalização de formatos de série ("8º ano", "8º Fund.", "8th", etc.).
- **Honestidade algorítmica confirmada por teste:** tópicos não correlacionados (ex: "Termodinâmica molecular e colisões quânticas") retornam `[]` — sem match forçado ou alucinado.
- **Integração em `LessonStudio.tsx`:** seleção manual do professor sempre preservada; auto-inferência só dispara se o campo estiver vazio; chips com badge `[EF08LI19] 🤖 Sugestão da IA` removíveis; schema por etapa (`targetBnccCode`) exigido no prompt de geração.

### Verificação de Diferenciação Real (Ponto de Ceticismo Resolvido)
Um primeiro teste gerou o mesmo código BNCC (`EF08LI19`) em todas as 4 etapas do plano — risco de o modelo estar copiando o valor sem raciocinar por etapa. Um segundo teste, com tópico multi-modal (*"leitura de blog de viagem + entrevista oral + produção de postcard"*), confirmou diferenciação real:

| Etapa | Ação Pedagógica | Código BNCC Atribuído |
| :--- | :--- | :---: |
| **Pre-Task / Task** | Interação oral | `EF08LI01` |
| **Planning** | Produção escrita (postcard) | `EF08LI08` |
| **Language Focus** | Análise gramatical reflexiva | `EF08LI05` |

A correspondência entre tipo de habilidade (oralidade/escrita/análise) e código atribuído confirmou que o sistema raciocina sobre a ação real de cada etapa, não apenas replica um valor.

---

## 4. Prioridade 2 — Frameworks Pedagógicos Reais

### Problema Resolvido:
Schema de 4 etapas fixo (Warm-up / Apresentação / Prática / Fechamento) independente da metodologia selecionada, gerando planos estruturalmente idênticos com apenas texto reescrito.

### Implementação:
- `lib/lessonFrameworks.ts` (novo): schemas dinâmicos por framework, conectados a `pedagogicalMethodologies.ts` (as 22 metodologias já existentes, agora finalmente religadas ao `LessonStudio`).
- 4 frameworks com estrutura genuinamente distinta implementados e validados com JSON real gerado ao vivo via `/api/agent`, todos para o mesmo tópico (*"Present Perfect and life experiences"*, 8º ano):

| Framework | Etapas | Lógica Estrutural |
| :--- | :---: | :--- |
| **PPP Clássico** | 4 (50min) | Dedutivo: apresenta a forma $\to$ prática controlada $\to$ produção livre |
| **5E Inquiry (Bybee)** | 5 (50min) | Indutivo: Explore (descoberta) antes de Explain (sistematização) |
| **TBLT Autêntico (Jane Willis)** | 6 (50min) | Gramática NUNCA no início — emerge da produção dos alunos no Language Focus final |
| **Backward Design/UbD (Wiggins & McTighe)** | 4 (50min) | Raciocínio invertido: define a avaliação (Performance Task) ANTES de desenhar as etapas |

### Verificação Especial do UbD (Framework de Maior Risco)
Por exigir inversão completa da lógica de raciocínio (avaliação antes das etapas, não depois), o UbD recebeu teste dedicado. Evidências de que a inversão é real, não decorativa:
- Campo `designRationale` explicitando a arquitetura WHERETO de Wiggins & McTighe.
- Etapas nomeadas conforme a metodologia (*"Stage 3: Hook & Hold"*, *"Stage 3: Equip & Explore"*, etc.), com cada uma clara e explicitamente a serviço da Performance Task definida no Stage 2.
- **Precisão matemática:** os tempos das 4 etapas somam exatamente 50 minutos ($8 + 20 + 14 + 8$).

---

## 5. Prioridade 3 — Pacote de Aula em 1 Clique

### Requisito de Segurança (Estabelecido Antes da Implementação)
> [!IMPORTANT]
> O comunicado aos pais gerado como parte do pacote nunca é enviado automaticamente — apenas redigido como rascunho. O envio real continua exigindo ação manual explícita da professora, seguindo o mesmo padrão de aprovação humana já validado em todo o restante do sistema (Diretiva 0-Tester do Browser Harness).

### Implementação:
- `lib/lessonPackageEngine.ts` (novo): motor central com tipagem (`LessonPackage`, `PackageWorksheet`, `PackageParentCommunication`), builders de prompt contextualizados, e persistência compartilhada (`saveLessonPackage` / `getLessonPackage`).
- Botão **"📦 Gerar Pacote da Aula"** no `LessonStudio.tsx`, com progresso em 2 passos visível ao professor.
- Modal de revisão com 4 abas: *Visão Geral*, *Roteiro da Aula*, *5 Exercícios*, *Comunicado às Famílias*.
- Reaproveitamento total de ferramentas já existentes (`generate_quick_questions`, `generate_parent_communication`) — zero duplicação de lógica de geração.

### Validação Real:
Teste ao vivo completo (`package_live_result.json`) confirmou:
- **5 exercícios contextualizados** gerados com qualidade pedagógica real — incluindo uma questão (Q5) testando a transição de Present Perfect para Simple Past ao introduzir "When" na pergunta de acompanhamento, um ponto gramatical genuinamente sofisticado.
- **Comunicado aos pais** referenciando o conteúdo real da aula (*"Have You Ever? Mystery Partner Challenge"*), não texto padrão desconectado.
- **Persistência cruzada confirmada:** `teacher_quick_prefill` e `teacher_parent_comms_prefill` ambos populados e recuperáveis pelo mesmo ID de pacote.
- **Segurança confirmada:** status do comunicado gravado como `'draft'` — verificado explicitamente como `STRICTLY DRAFT` no teste, exigindo clique manual em *"Enviar pelo WhatsApp"* no `ParentCommunicator.tsx`.

---

## 6. Estado Final e Posicionamento Competitivo

| Dimensão | Estado Final |
| :--- | :--- |
| **Múltiplos frameworks pedagógicos** | ✅ 4 frameworks estruturalmente distintos e validados (PPP, 5E, TBLT, UbD) |
| **Pacote completo integrado** | ✅ Implementado com segurança de envio preservada |
| **Especificidade curricular (código BNCC)** | ✅ Auto-inferido, diferenciado por etapa, transparente (sugestão marcada e removível) |
| **Memória longitudinal do aluno no planejador** | ✅ Conectada via `getClassPedagogicalProfile` e banner de diagnóstico coletivo LGPD-compliant |
| **Especialização L1/CEFR no planejador** | ✅ Conectada via gating CEFR, seletor de nível e diretivas de interferência L1 (PT ➔ EN) |

**Posicionamento competitivo:** o Teacher AI agora lidera de forma incontestável os concorrentes pesquisados: une a especificidade curricular exata (BNCC por etapa) e múltiplos frameworks de planejamento pedagógico (PPP, 5E, TBLT Willis, UbD) às vantagens exclusivas da plataforma (memória longitudinal da turma sem envio de PII, especialização em interferência do Português Brasileiro e modelo soberano BYOK).

---

## 7. Status das Pendências — Todas Concluídas e Auditadas

1. **Memória Coletiva da Turma Conectada:** ✅ Implementada função `getClassPedagogicalProfile` em `lib/studentMemory.ts` e consumida em `LessonStudio.tsx`. Exibe banner colapsável com contagem de alunos monitorados, lacunas recorrentes e alertas de oscilação de trajetória. Injeta diagnóstico anonimizado (LGPD compliant) no prompt da IA.
2. **Especialização ELT Brasileira (L1 e CEFR):** ✅ Adicionadas funções `inferCefrLevelForGrade`, `getCefrGatingRules` e `getL1InterferenceDirectives` em `lib/lessonFrameworks.ts`. O `LessonStudio.tsx` disponibiliza seletor de nível CEFR auto-inferido pela série e chip visual de atenção L1.
3. **Modal do Pacote de Aula (4 Abas):** ✅ Auditado e verificado em código e testes. Possui as 4 abas estruturadas (`overview`, `plan`, `worksheet`, `comms`) com persistência em `saveLessonPackage` e envio manual seguro via WhatsApp (`status: 'draft'`).
4. **Testes Automatizados:** ✅ Suíte cresceu para 85 arquivos e 707 testes 100% verdes, com código de saída 0 e zero regressões em toda a aplicação.

---

## 8. Os 10 Aprimoramentos Pedagógicos de Alto Valor (Implementados & Validados)

Em continuidade direta à auditoria de fronteira, foram projetadas, implementadas e auditadas 10 inovações pedagógicas profundas, fundamentadas nas ciências da aprendizagem e na realidade da escola brasileira:

1. **Andaimes UDL em 3 Níveis (Tiered Scaffolding):** Para cada etapa de produção, gera 3 níveis de apoio (Tier 1 Apoio Alto com sentence starters/bancos de palavras; Tier 2 Padrão; Tier 3 Desafio/Extensão com metacognição aberta), eliminando a "aula apenas para a média".
2. **Gerador de CCQs e ICQs:** Produz perguntas binárias de checagem conceitual (Concept Checking Questions) para evitar o *"Entenderam?"* passivo, e perguntas de instrução (Instruction Checking Questions) para clareza da dinâmica antes de iniciar as tarefas.
3. **Rotinas de Pensamento Visível de Harvard (Project Zero):** Catálogo de rotinas (*See-Think-Wonder*, *Think-Pair-Share*, *Claim-Support-Question*, *3-2-1 Bridge*, *Compass Points*) integradas às fases investigativas de engajamento e exploração.
4. **Estimador de TTT vs. STT (Teacher vs. Student Talking Time):** Analisa o equilíbrio de fala da aula via heurística de verbos e durações, alertando a professora caso o monólogo expositivo ultrapasse 55% em momentos práticos e fornecendo orientações pedagógicas para aumentar a centralidade do aluno.
5. **Descritores "Eu Consigo..." (Student-Facing Can-Do Descriptors):** Gera automaticamente uma filipeta de autoavaliação formativa em 1ª pessoa conectada ao CEFR e BNCC, pronta para impressão ou projeção.
6. **Planejamento Integrado CLIL (Modo Bilíngue):** Permite cruzar objetivos linguísticos de inglês com objetivos de conteúdo de Ciências, Geografia, História ou Artes, operando sob as 4 dimensões de Coyle (Content, Communication, Cognition, Culture).
7. **Adaptações para Neurodiversidade e PEI:** Painel de acomodações razoáveis e práticas baseadas em evidências para estudantes com TDAH (chunking, temporizadores visuais), Dislexia (fontes amigáveis, apoio oral) e TEA (previsibilidade de rotina, redução de sobrecarga sensorial).
8. **10 Competências Gerais da BNCC (MEC):** Catálogo oficial e motor de inferência que mapeia as 3 competências gerais mais mobilizadas pelas dinâmicas da aula (Comunicação, Pensamento Crítico, Empatia/Cooperação) com justificativa formal para o diário de classe.
9. **Recuperação Espaçada Automática (Spaced Retrieval Hook):** Consulta o histórico de avaliações da turma e, se houver conteúdo avaliado há $\ge 14$ dias com média baixa (< 7.0), sugere e insere um mini-desafio ativo de 3 minutos no Warm-up (combate à curva do esquecimento de Ebbinghaus).
10. **Caderno de Noticing e "Erros Férteis" (Spot & Fix):** Coleta erros recorrentes e autênticos dos alunos de forma 100% desidentificada (LGPD compliant) e formula uma micro-etapa de caça e correção de bugs em duplas.

---

## Arquivos Criados/Modificados Nesta Frente

| Arquivo | Tipo | Descrição |
| :--- | :---: | :--- |
| `lib/bnccData.ts` | Modificado | Habilidades oficiais MEC expandidas (8º ano) |
| `lib/bnccInference.ts` | Novo | Motor determinístico de inferência de código BNCC |
| `lib/lessonFrameworks.ts` | Modificado | Schemas dinâmicos, CEFR gating, diretivas L1, CLIL e rotinas Harvard |
| `lib/lessonPackageEngine.ts` | Novo | Motor do pacote de aula integrado |
| `lib/studentMemory.ts` | Modificado | `getClassPedagogicalProfile`, `getSpacedRetrievalTopic`, `getFertileErrorsForClass` |
| `lib/pedagogicalEnhancements.ts` | Novo | UDL Scaffolding, CCQs/ICQs, Harvard Routines, TTT/STT, Can-Do, CLIL, PEI |
| `lib/bnccGeneralCompetencies.ts` | Novo | As 10 Competências Gerais da BNCC e motor de inferência pedagógica |
| `components/modules/LessonStudio.tsx` | Modificado | Gauge TTT/STT, UDL accordions, CCQs drawers, CLIL, Harvard, modais Can-Do/BNCC/PEI |
| `components/modules/ParentCommunicator.tsx` | Modificado | Carregamento de rascunho com banner de segurança |
| `components/modules/OmniGrader.tsx` | Modificado | Correção de fechamento de tag JSX |
| `__tests__/bnccInference.test.ts` | Novo | 16 testes |
| `__tests__/lessonFrameworks.test.ts` | Novo | 11 testes |
| `__tests__/lessonPackageEngine.test.ts` | Novo | 4 testes |
| `__tests__/lessonStudioOnda1.test.ts` | Novo | 6 testes |
| `__tests__/lessonStudioStudentMemoryAndElt.test.ts` | Novo | 11 testes |
| `__tests__/pedagogicalEnhancements.test.ts` | Novo | 13 testes |
| `__tests__/spacedRetrievalAndFertileErrors.test.ts` | Novo | 6 testes |

*Suíte global final: 89 arquivos de teste, 737 testes 100% verdes, código de saída 0.*

