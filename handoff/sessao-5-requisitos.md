# SESSÃO 5 — Requisitos e Critérios de Aceite

Documento gerado conforme diretrizes da skill `fidelidade-ao-pedido`.

## Pedido Original
```
SESSÃO 5 — ADAPTAÇÃO POR TURMA E OMR ATÉ O ITEM
(Decisões do usuário: k mínimo = 5; cortes configuráveis com padrão 60% e 75%; apenas
 agregados por habilidade saem do navegador; adaptação opt-in com pré-visualização.)

T1 Função pura buildAdaptationInput(...): grupos com menos de k alunos são suprimidos; o
   objeto retornado não contém nomes nem ids de alunos (teste que varre o JSON e procura os
   ids de entrada). Teste: turma de 3 alunos é suprimida; a agregação confere.
T2 Ligar ao blueprint de TestAndWorksheets (opt-in). A pré-visualização explica por que
   cada habilidade ganhou mais itens. Mutação: remover a chamada e ver um teste falhar (via
   a função pura que monta a entrada do prompt).
T3 OMR até o item: a prova guarda os ids dos itens junto com o layout OMR; o OmniGrader
   grava as respostas por item via psychometricsEngine no QuestionBank. Teste da ponte pura;
   itens com menos de 10 respostas continuam rotulados "estimativa a priori".
```

---

## Matriz de Rastreabilidade de Requisitos

| Req ID | Descrição do Requisito / Critério de Aceite | Escopo |
| :--- | :--- | :--- |
| **R5.1a** | Decisão do usuário: $k$ mínimo padrão = 5 | T1 |
| **R5.1b** | Decisão do usuário: cortes configuráveis com padrão 60% (remediação/defasagem) e 75% (domínio/sólido) | T1 |
| **R5.1c** | Decisão do usuário: apenas agregados por habilidade saem do navegador (Zero PII) | T1 |
| **R5.1d** | Função pura `buildAdaptationInput(...)` suprime grupos com menos de $k$ alunos | T1 |
| **R5.1e** | Objeto retornado por `buildAdaptationInput(...)` não contém nomes nem IDs de alunos (teste que varre o JSON serializado) | T1 |
| **R5.1f** | Teste unitário comprovando que turma de 3 alunos é suprimida ($k=5$) e agregação de turmas válidas confere | T1 |
| **R5.2a** | Ligação ao blueprint de `TestAndWorksheets` com comportamento estritamente opt-in | T2 |
| **R5.2b** | Interface de pré-visualização na UI explicando por que cada habilidade ganhou mais itens (taxa de domínio/defasagem) | T2 |
| **R5.2c** | Teste de mutação: remover a chamada adaptativa e verificar teste falhando (via função pura `buildAdaptivePromptEntry`) | T2 |
| **R5.3a** | OMR até o item: a prova guarda os `itemIds` ordenados junto com o layout OMR em `teacher_omr_active_layout` | T3 |
| **R5.3b** | O `OmniGrader` grava as respostas por item via `psychometricsEngine` no `QuestionBank` | T3 |
| **R5.3c** | Teste unitário da ponte pura (`syncOmrLayoutWithItemIds` e `recordOmrItemResponsesToQuestionBank`) | T3 |
| **R5.3d** | Itens com menos de 10 respostas ($N < 10$) continuam estritamente rotulados como "estimativa a priori" | T3 |
| **R5.3e** | Itens que atingem $N \ge 10$ respostas são promovidos para calibração empírica real (`empirical_calibrated`) | T3 |
