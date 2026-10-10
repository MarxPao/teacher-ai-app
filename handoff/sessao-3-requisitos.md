# SESSÃO 3 — Requisitos e Critérios de Aceite

Documento gerado conforme diretrizes da skill `fidelidade-ao-pedido`.

## Pedido Original
```
SESSÃO 3 — LLM DEVOLVE JSON VALIDADO (SEM SERVIDOR; BYOK NO NAVEGADOR)

T1 lib/examGeneration.ts, função pura com injeção de dependência
   generateExam({ callApi, buildPrompt, limits }):
 - O prompt pede JSON conforme o schema de lib/examSchema.ts (inclua o schema no prompt) e
   o código tolera cercas ```json.
 - Valide por questão. Questão inválida: reentativa isolada com o erro de validação no
   prompt (máx. 2 por questão e 6 por prova). Ainda inválida: fica BLOQUEADA com o motivo.
   Nunca salvar item parcial ou truncado.
 - Resposta que não é JSON: caminho legado (parseContentToQuestions), marcado
   legacyParsed=true e mostrado ao professor.
 - Retorno: { questions, blocked[], callsUsed, legacyParsed }.
 - Recursos nativos de saída estruturada de cada provedor só se confirmados na documentação.

T2 Ligação no TestAndWorksheets.tsx (substitui o parse direto). Mostrar progresso
   ("regenerando questão 7, tentativa 2 de 2") e o número de chamadas usadas na prova.
   No modo manual (colagem), validar e listar as questões inválidas, sem reentativa.

T3 Testes com callApi falso: JSON válido; uma questão inválida seguida de reentativa
   bem-sucedida; sempre inválida (bloqueada, callsUsed <= 3 para ela); teto de 6 respeitado;
   texto não JSON cai no legado com a flag; JSON com cercas.
   Mutações: desligar a validação, desligar a reentativa, subir o teto, salvar parcial.
   Mostre que o teste de integração falha se TestAndWorksheets deixar de chamar
   generateExam (git grep + teste).
```

---

## Matriz de Rastreabilidade de Requisitos

| Req ID | Descrição do Requisito / Critério de Aceite | Escopo |
| :--- | :--- | :--- |
| **R1.1** | Função pura com DI: `generateExam({ callApi, buildPrompt, limits, onProgress, legacyParser })` (BYOK browser, sem servidor) | T1 |
| **R1.2** | Prompt solicita JSON segundo `QuestionSchema` de `lib/examSchema.ts` (schema injetado no prompt) | T1 |
| **R1.3** | Parser tolera cercas markdown (````json ... ```` e ```` ... ````) e texto conversational envoltório | T1 |
| **R1.4** | Validação atômica questão por questão com `QuestionSchema.safeParse` | T1 |
| **R1.5** | Questão inválida dispara reentativa isolada contendo os erros de validação no prompt (máx. 2/questão, máx. 6/prova) | T1 |
| **R1.6** | Questão que persiste inválida após reentativas é marcada como BLOQUEADA (`blocked[]`) com motivo explícito | T1 |
| **R1.7** | Nunca salvar item parcial ou truncado (apenas itens 100% validados entram em `questions`) | T1 |
| **R1.8** | Resposta que não é JSON cai no caminho legado (`legacyParseContentToQuestions`), marcada com `legacyParsed=true` | T1 |
| **R1.9** | Contrato de retorno estrito: `{ questions, blocked[], callsUsed, legacyParsed }` | T1 |
| **R1.10** | Recursos nativos de saída estruturada apenas se confirmados (manter BYOK agnóstico a provedor) | T1 |
| **R2.1** | Ligação no `components/modules/TestAndWorksheets.tsx` substituindo o parse direto em `handleGenerateContent` | T2 |
| **R2.2** | Exibir indicador de progresso em tempo real ("regenerando questão 7, tentativa 2 de 2") | T2 |
| **R2.3** | Exibir o número de chamadas de API utilizadas (`callsUsed`) no resumo pós-geração | T2 |
| **R2.4** | Exibir aviso pedagógico quando o modo legado for acionado (`legacyParsed=true`) | T2 |
| **R2.5** | Modo manual (colagem): validar itens colados com `QuestionSchema.safeParse` e listar inválidos sem reentativa | T2 |
| **R3.1** | Teste unitário: JSON válido de primeira (`callsUsed: 1`, `blocked: []`, `legacyParsed: false`) | T3 |
| **R3.2** | Teste unitário: 1 questão inválida seguida de reentativa bem-sucedida (`callsUsed: 2`, `blocked: []`) | T3 |
| **R3.3** | Teste unitário: questão sempre inválida bloqueada (`callsUsed <= 3`, item em `blocked`, nunca em `questions`) | T3 |
| **R3.4** | Teste unitário: teto de 6 reentativas por prova estritamente respeitado | T3 |
| **R3.5** | Teste unitário: texto não-JSON cai no legado com flag `legacyParsed: true` | T3 |
| **R3.6** | Teste unitário: JSON envolto em cercas markdown ````json``` extraído e validado | T3 |
| **R3.7a**| Mutação: desligar validação faz teste falhar | T3 |
| **R3.7b**| Mutação: desligar reentativa faz teste falhar | T3 |
| **R3.7c**| Mutação: subir o teto de reentativa faz teste falhar | T3 |
| **R3.7d**| Mutação: salvar questão parcial faz teste falhar | T3 |
| **R3.8** | Teste de amarração estático/integração (`git grep` + asserção) provando que `TestAndWorksheets.tsx` referencia `generateExam` | T3 |
