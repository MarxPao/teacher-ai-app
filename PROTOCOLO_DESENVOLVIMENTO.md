# PROTOCOLO DE DESENVOLVIMENTO — TEACHER AI APP

> Leia este arquivo no início de toda sessão de trabalho neste repositório.
> Estas regras têm prioridade sobre a conveniência de responder rápido.

---

## POR QUE ESTE ARQUIVO EXISTE

Em rodadas anteriores de desenvolvimento, aconteceu repetidamente: uma funcionalidade foi reportada como "implementada e funcionando" quando na verdade era interface sem lógica real (`Math.random()` fingindo ser dado real), estava desconectada do restante do sistema (sliders de UI que não chegavam ao prompt da IA), ou uma mudança de escopo grande foi feita sem aprovação prévia quando isso era exigido. Este protocolo existe para tornar esse tipo de erro estruturalmente mais difícil de acontecer — não depende de "lembrar de ser cauteloso", depende de seguir um processo fixo.

---

## REGRA 1 — DEFINIÇÃO DE "PRONTO" (Definition of Done)

Uma tarefa **NUNCA** está concluída apenas porque o código foi escrito e parece correto. Uma tarefa só pode ser reportada como ✅ concluída quando as 3 condições abaixo forem satisfeitas, com evidência colada na resposta:

1. **Código alterado:** caminho do(s) arquivo(s) e o trecho relevante modificado.
2. **Execução real:** rode o fluxo de verdade (não infira que vai funcionar por leitura do código) e cole o resultado real observado — output de console, resposta real da IA, screenshot descrito, valor real retornado. "Deveria funcionar" não é evidência.
3. **Build/teste automatizado:** rode `npm run build` e/ou `npx vitest run` e cole o resultado (incluindo exit code). Se algo quebrar, reporte isso, não omita.

Se qualquer uma das 3 não puder ser satisfeita (ex: não há como testar sem um dado que só o usuário tem), classifique explicitamente como 🟡 parcial ou 🔴 pendente de teste — nunca como ✅.

---

## REGRA 2 — PROIBIÇÃO DE SIMULAÇÃO SILENCIOSA (Zero-Simulação)

Nunca substitua ausência de dado real, integração real, ou lógica real por:
- Valor aleatório (`Math.random()`)
- Valor hardcoded fingindo ser dinâmico
- Função com nome genérico tipo `mockX()`/`fakeX()`/`dummyX()` deixada em código de produção
- Parâmetro de UI (slider, toggle, campo) que não é de fato lido pela lógica que ele aparenta controlar

Se o dado real ainda não existe ou a integração ainda não foi feita, a interface deve comunicar isso claramente ("sem dados suficientes", "recurso em desenvolvimento") — nunca preencher com algo que pareça real sem ser.

Antes de finalizar qualquer tarefa, rode uma varredura por: `mock`, `fake`, `dummy`, `stub`, `temp`, `placeholder`, `Math.random()` no(s) arquivo(s) alterado(s) e confirme que nenhum resquício ficou esquecido em código de produção (fora de arquivos de teste).

---

## REGRA 3 — NENHUMA DECISÃO DE ESCOPO SEM APROVAÇÃO EXPLÍCITA

Se, durante a implementação, você (Antigravity) perceber que a especificação recebida é ambígua, insuficiente, ou que uma decisão de design/arquitetura precisa ser tomada (ex: quantas categorias uma navegação deveria ter, se um dado deve ser público ou privado, se uma integração deve ser síncrona ou assíncrona) — **PARE e apresente as opções para aprovação antes de implementar**. Nunca decida sozinho e reporte a decisão como se tivesse sido a instrução original. Se você decidir seguir em frente mesmo assim por julgar necessário, isso deve ser sinalizado em destaque na resposta, não mencionado de passagem.

---

## REGRA 4 — TAREFAS GRANDES SÃO DIVIDIDAS, NÃO EMPACOTADAS

Quando uma solicitação contém múltiplos itens (mais de ~5), não implemente todos em uma única passada sem reportar progresso intermediário. Estruture como: implementar item → testar item (Regra 1) → reportar → seguir para o próximo. Se perceber que a qualidade da verificação está caindo conforme avança pela lista (menos rigor nos itens finais), pare e sinalize isso explicitamente em vez de continuar e arredondar para cima no relatório final.

---

## REGRA 5 — RESPOSTA A PERGUNTA DE VERIFICAÇÃO NÃO PODE SER RESUMO GENÉRICO

Quando receber um prompt pedindo verificação pontual de algo específico (ex: "cole o código exato de X", "responda apenas Y"), a resposta deve conter exatamente o que foi pedido, no formato pedido. Reenviar um resumo geral do projeto, mesmo que tecnicamente relacionado, não é uma resposta válida a uma pergunta específica.

---

## REGRA 6 — CONTRADIÇÕES COM AUDITORIAS ANTERIORES SÃO SEMPRE SINALIZADAS

Se, ao investigar algo, você descobrir que uma afirmação feita em uma resposta anterior sua (ou de uma sessão anterior) estava incorreta ou desatualizada, isso deve ser dito explicitamente e em destaque — "isto contradiz o que reportei antes, e a versão correta é X" — nunca silenciosamente substituído ou reafirmado sem menção à divergência.

---

## CHECKLIST RÁPIDO ANTES DE QUALQUER RESPOSTA DE "CONCLUÍDO"

- [ ] Colei o código real alterado, não uma descrição dele?
- [ ] Rodei o fluxo de verdade e colei o resultado real, não uma previsão?
- [ ] Rodei build/teste e colei o resultado, incluindo se algo falhou?
- [ ] Procurei por mock/fake/random/stub esquecido no que alterei?
- [ ] Tomei alguma decisão de escopo sozinho que deveria ter sido aprovada antes?
- [ ] Se a tarefa tinha muitos itens, testei todos com o mesmo rigor, ou só os primeiros?
- [ ] Alguma informação que dei aqui contradiz algo que eu disse antes? Sinalizei isso?

Se a resposta a qualquer item acima for "não" ou "não tenho certeza", a tarefa não está pronta — reporte como parcial e explique o motivo.

---

## REGISTRO DE DECISÕES ARQUITETURAIS FECHADAS (DEFINITIVAS)

As seguintes decisões foram discutidas, deliberadas e formalmente aprovadas. **NÃO reabrir como dúvidas ou perguntas em aberto em sessões futuras:**

### 1. Escopo de Matéria — Matéria Principal por Conta (Aprovado)
- **Modelo:** A matéria padrão (`defaultSubject`) é definida por conta do professor e sincronizada com o `SubjectProfile` ativo (Língua Inglesa / Língua Portuguesa).
- **Status:** Decisão fechada e implementada em `Settings.tsx`, `ExamBuilder.tsx`, `QuickGenerate.tsx`, `OmniGrader.tsx`.

### 2. Infraestrutura de Banco de Dados — Supabase Compartilhado Transparente + BYOK (Aprovado)
- **Modelo:** A plataforma mantém o banco compartilhado com isolamento por usuário (Row Level Security via JWT) como infraestrutura padrão para conveniência do professor, com aviso explícito e consentimento prévio obrigatório no onboarding/primeiro cadastro de alunos (`SharedDatabaseConsentModal`), badge visual permanente (`DatabaseStatusBadge`), e liberdade total de configuração BYOK em Configurações.
- **Segurança:** A chave do banco compartilhado no frontend é estritamente uma `anon key` protegida por RLS.
- **Status:** Decisão fechada e implementada em `lib/databaseConsent.ts`, `components/DatabaseStatusBadge.tsx`, `components/SharedDatabaseConsentModal.tsx`, `components/modules/Students.tsx`, `components/modules/Settings.tsx`.

### 3. Automação de Portais Escolares (Browser Harness) — Pausa Antes do Submit (Aprovado)
- **Modelo:** O preenchimento dos campos do portal (`_apply_diff_to_dom`) é executado de forma autônoma pelo runner após a criação da tarefa. A pausa de segurança e a confirmação humana do professor ocorrem estritamente antes do clique no botão irreversível de submissão final (`_submit_portal_form`).
- **Status:** Decisão fechada e implementada no runner (`sidecar/browser_harness_runner.py`). Testes contra portais reais continuam bloqueados aguardando definição do portal piloto prioritário.

### 4. Intercalação Contrastante Forçada no Blueprint (Item D — Concluído Definitivamente)
- **Fundamentação:** Baseado na ciência da aprendizagem (Kornell & Bjork / Interleaving Effect) e nas evidências de que o estudo em bloco (*blocking*) gera ilusão de domínio temporário, enquanto a alternância sistemática de conceitos opostos/concorrentes força a discriminação ativa e consolidação de longo prazo.
- **Mecanismo:** A matriz de especificação (`lib/testBlueprintEngine.ts`) detecta pares de contraste pedagógico (ex: *Present Perfect* ↔ *Simple Past*, *First* ↔ *Second Conditional*, *Crase Obrigatória* ↔ *Crase Proibida*, *Mas* ↔ *Mais*, *Onde* ↔ *Aonde*, *Regência Assistir* ↔ *Chegar*) e impõe alternância estrita entre itens designados na prova, injetando tags de par contrastante no prompt de geração da IA.
- **Resiliência:** Quando os tópicos selecionados não possuem relação de contraste declarada, a matriz mantém a distribuição balanceada padrão sem alteração forçada.
- **Status:** ✅ Definitivamente concluído, documentado com justificativa pedagógica por par em `lib/subjects/english.ts`, `lib/subjects/portuguese.ts` e `lib/testBlueprintEngine.ts`, com 100% dos testes verdes (`__tests__/contrastiveInterleaving.test.ts`).

### 5. Testes Adaptativos Computadorizados (CAT / Item E — Decisões E.2 Aprovadas & Gatilho de Prontidão)
- **Pré-requisito Psicométrico Estatístico (E.1):** Algoritmos adaptativos de seleção dinâmica de itens exigem estabilidade empírica de dificuldade ($p$-value) e discriminação ($D$ de Kelley). Como o banco de dados inicial parte de $0$ respostas de alunos, **nenhum código de seleção adaptativa (CAT) deve ser implementado prematuramente** antes do acúmulo de dados reais.
- **Gatilho de Prontidão (E.1 implementado):** Monitor automático (`lib/catReadinessTrigger.ts` e `components/CatReadinessCard.tsx`) que acompanha o contador de questões com $N \ge 10$ respostas e dispara alerta automático de prontidão ao atingir o limiar de **40 questões calibradas** cobrindo pelo menos 3 tópicos.
- **Decisões de Design de E.2 (Aprovadas Conceitualmente para Implementação Futura):**
  1. **Escada Adaptativa de 4 Degraus por $p$-value:**
     - Nível 1 (Muito Fácil): $p > 0.85$
     - Nível 2 (Fácil): $0.65 \le p \le 0.85$
     - Nível 3 (Médio): $0.35 \le p < 0.65$
     - Nível 4 (Difícil): $p < 0.35$
  2. **Regra de Transição Dinâmica:**
     - Resposta correta $\rightarrow$ sobe 1 degrau (apresenta item do próximo nível).
     - Resposta incorreta $\rightarrow$ desce 1 degrau (apresenta item de reforço).
  3. **Critérios de Parada:**
     - Limite máximo fixo de 8 a 10 itens por sessão.
     - OU Convergência precoce por 3 acertos consecutivos no nível máximo (4) ou 3 erros consecutivos no nível mínimo (1).
### 6. Auditoria Agêntica Contínua & Rigor de 4 Pilares (Aprovado e Fechado)
- **Escopo do Catálogo:** A assistente Rafinha opera com 34 ferramentas canônicas (`lib/agentTools.ts`) integradas ao motor `executeTool` (`components/RafinhaChat.tsx`).
- **Padrão de Validação nos 4 Pilares (Definido em `__tests__/rafinhaHarnessAudit.test.ts` — 38/38 testes verdes):**
  1. **Efeito Colateral Real (Pilar 1):** Nenhuma ferramenta é considerada funcional por resposta textual da IA. A validação exige checagem antes/depois no `localStorage`, `sessionStorage` ou disparo de eventos específicos.
  2. **Desambiguação Prévia Obrigatória (Pilar 2):** Ferramentas que afetam alunos (`add_student_grade`, `record_student_observation`, `update_student_metric`) são terminantemente proibidas de efetuar mutação caso o nome seja ambíguo (homônimos ou prefixos curtos). Devem retornar lista de candidatos e preservar o storage intacto.
  3. **Integridade Factual de Erros (Pilar 3 — Zero Alucinação):** Em caso de recursos inexistentes, ausência de mídia de áudio física ou indisponibilidade de portais, o agente deve relatar o erro de forma explícita e factual. É proibido inventar avaliações fonéticas sem arquivo ou fingir sucesso de submissão.
  4. **Separação Estrita de Ferramentas Correlatas (Pilar 4):** É proibido misturar canais conceituais:
     - `add_todo` (checklist da home) $\neq$ `create_calendar_task` (agenda com prazos e turmas).
     - `create_lesson_plan` (card visual simples) $\neq$ `create_full_lesson` (plano Cambridge TKT completo).
     - `create_communication` (circular geral da escola) $\neq$ `generate_parent_communication` (mensagem individualizada para pais).
     - `execute_portal_action` (diário oficial com aprovação) $\neq$ `record_private_tutoring_session` (ledger de alunos particulares).
- **Status:** ✅ 100% auditado e coberto na suíte de testes automatizados.

