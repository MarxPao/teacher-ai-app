# RAFINHA — ESPECIFICAÇÃO DEFINITIVA DE ARQUITETURA, SKILLS E HARNESS
### Documento de handoff para nova conversa/sessão. Estado real verificado, não idealizado.

---

## COMO USAR ESTE DOCUMENTO

Cole isto no início de qualquer nova sessão (Claude ou Antigravity) antes de pedir
qualquer trabalho relacionado à Rafinha. Tudo aqui foi verificado com evidência de código
real nesta data — não é aspiração de arquitetura, é o estado confirmado. Onde algo é
proposta futura (não implementada), está marcado explicitamente como tal.

---

## 1. IDENTIDADE E MODELO MENTAL

A Rafinha é o agente conversacional central do Teacher AI App — não é um chatbot genérico
nem um executor cego de comandos. Ela opera em dois modos que precisam coexistir sem
conflito: **diálogo** (tirar dúvida, refletir, planejar em voz alta) e **execução**
(disparar ação real no sistema via function calling). O equilíbrio entre os dois é
regulado por 3 exceções específicas no system prompt (Seção 3).

---

## 2. CATÁLOGO DE FERRAMENTAS (Function Calling)

`lib/agentTools.ts` declara **34 ferramentas canônicas** no array `AGENT_TOOLS`. Amostra
representativa já testada com efeito colateral real confirmado no estado do app (não só
resposta em texto):

| Ferramenta | Status | Efeito real confirmado |
|---|---|---|
| `add_todo` | ✅ | Grava em `teacher_dashboard_todos`, snapshot de undo, evento `storage` |
| `create_calendar_task` | ✅ | Insere em `teacher_calendar_tasks` com prioridade/data/turma |
| `add_student_grade` | ✅ | Desambigua aluno via Levenshtein, atualiza `teacher_students`, dispara `diagnoseClassPerformance()` |
| `record_student_observation` | ✅ | Persiste via `addObservation()` na memória viva do aluno |
| `create_full_lesson` | ✅ | Persiste payload estruturado, navega para LessonStudio |
| `execute_portal_action` | ✅ | Suporta ações atômicas e multi-página; grava tarefa assíncrona com status `pending_approval` — nunca executa sem essa etapa |
| `record_private_tutoring_session` | ✅ | Cadastra sessão de aula particular com valor/data |
| `create_class` / `create_student` | ✅ | Persistem em `teacher_classes`/`teacher_students` |
| `evaluate_student_audio` | 🟡 (por design) | Se áudio real fornecido, grava avaliação; se não, **bloqueia e recusa alucinar**, redireciona ao módulo correto — este é o comportamento CORRETO, não um bug |

As demais ~25 ferramentas do catálogo ainda não foram testadas individualmente com
verificação de efeito colateral real — tratar como "não confirmado" até auditoria
adicional, não como "funcionando por suposição".

---

## 3. SYSTEM PROMPT — REGRAS DE EXECUÇÃO VS. DIÁLOGO

Localização: `app/api/agent/route.ts`. Contém a diretiva geral de ação ("EXECUTAR ações
reais... não apenas conversar", "invoque a ferramenta IMEDIATAMENTE"), balanceada por 3
exceções explícitas:

1. **Dúvida/consulta teórica**: pergunta pedagógica, opinião, ou consulta de dado já
   existente no contexto → responder em texto, sem acionar ferramenta desnecessária.
2. **Protocolo de provas**: se faltar dado essencial (série, formato, quantidade), é
   proibido chamar a ferramenta antes de perguntar — exige checklist prévio em texto.
3. **Diretiva de honestidade**: se o módulo depender de hardware não conectado ou não
   houver ferramenta de mutação real disponível, é proibido inventar resultado — deve
   admitir a limitação com transparência.

---

## 4. PERSONALIZAÇÃO (Teacher Style Profile)

`buildTeacherStyleSystemPrompt()` (`lib/teacherStyleProfile.ts`) está **100% conectado**
em: `RafinhaChat.tsx`, `ExamBuilder.tsx`, `QuickGenerate.tsx`, `LessonStudio.tsx`,
`DidacticSequence.tsx`, `ParentCommunicator.tsx`, `AutoReport.tsx`. Termo correto a usar
sempre: **"personalização baseada em preferências observadas"** — nunca "machine
learning" ou "a IA aprendeu sozinha".

---

## 5. ATIVAÇÃO POR VOZ ("Hello Rafinha") — ARQUITETURA REAL, NÃO IDEALIZADA

**Confirmado**: é Web Speech API do navegador (STT contínuo, `continuous: true`,
`interimResults: true`) + matching fonético/fuzzy local via Levenshtein
(`lib/wakeWordEngine.ts`), com filtro de falso positivo contra palavras parecidas em
português (rainha, farinha, galinha).

**NÃO é** modelo de keyword spotting on-device (Porcupine/OpenWakeWord/ONNX). O áudio é
processado nos servidores de voz do Google enquanto a escuta contínua está ativa.

**Consentimento**: implementado e funcional. `ContinuousListeningConsentModal.tsx` +
`lib/wakeWordConsent.ts` (flag `teacher_continuous_listening_consent_v1`). Interceptação
confirmada antes de ligar o microfone. Faixa de aviso permanente visível durante o modo
ativo ("🎙️ ESCUTA CONTÍNUA ATIVA (Google STT)").

**Proposta futura, NÃO implementada**: `docs/NATIVE_WAKE_WORD_ARCHITECTURE.md` descreve
um sidecar nativo (Rust/Tauri v2 + Porcupine/OpenWakeWord) para escuta em segundo plano
sem depender do navegador em primeiro plano. Isso é decisão de investimento de app nativo,
não item do roadmap web atual.

---

## 6. INTERFACE DE CHAT — ESTADO REAL

| Recurso | Status |
|---|---|
| Streaming de resposta (SSE) | ❌ Existe rota (`app/api/stream/route.ts`) mas o agente principal usa `POST /api/agent` síncrono (`await res.json()`), sem streaming real na interface |
| Markdown | 🟡 Só negrito (`**texto**`) e quebra de linha — sem tabela, header, código destacado |
| Histórico de conversa | 🟡 Volátil — vive em `useState` React, perdido ao recarregar a página. O que persiste de verdade são os EFEITOS COLATERAIS das ferramentas (memória do aluno, fatos aprendidos, notas, tarefas) — não o texto da conversa em si |

---

## 7. O QUE AINDA PRECISA DE AUDITORIA (não assumir como resolvido)

1. As ~25 ferramentas do catálogo não testadas individualmente na última auditoria.
2. Precisão de extração de parâmetro em comando ambíguo (dois alunos com nome parecido) —
   nunca formalmente testado no fluxo de function calling (só no `studentMatcher.ts`
   isolado).
3. Tratamento de falha de ferramenta (chamada com parâmetro inválido, API indisponível) —
   nunca testado se a Rafinha comunica erro real ou finge sucesso.
4. Seleção correta entre ferramentas parecidas em comando ambíguo (ex: `add_todo` vs.
   `create_calendar_task`) — nunca testado sistematicamente.

---

## 8. INSTRUÇÃO PARA QUEM CONTINUA ESTE TRABALHO

Antes de declarar qualquer ferramenta ou fluxo como "funcionando", exigir: comando real
disparado, estado do app verificado antes/depois (não só resposta em texto da IA), e
resultado colado como evidência — nunca aceitar resumo agregado. Isso já se provou
necessário dezenas de vezes ao longo deste projeto. Consultar também
`PLAYBOOK_SKILLS_COLABORACAO_AGENTES.md` para o método geral de trabalho, e
`RESUMO_MESTRE_FINAL.md` para o estado do restante do app além da Rafinha.
