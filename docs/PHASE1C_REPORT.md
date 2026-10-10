# Relatório Executivo da Fase 1C: Fechamento das Lacunas Finais (G1 e G2)

## 1. Resumo Executivo (TL;DR)
A Fase 1C resolveu de forma definitiva as duas últimas lacunas do contrato SkillGraph v2 antes do congelamento. Para **G1**, foram adicionados o tipo `RowSkip` e os campos `skip_rows` (máx. 10) e `skip_empty_rows` (padrão `true`) aos nós `READ` (tabela) e `LOOP` (`table_rows`), além do warning semântico `W_FOOTER_ROW_RISK` para laços mutadores desprovidos de filtro de rodapé. Para **G2**, foi formalizada a **obrigação 8 do runner** em `SKILLGRAPH_V2.md`, determinando validação estrita de valores de nota contra `canonical_mapping.grade_scale` antes de mutações no DOM, com registro de `E_VALUE_OUT_OF_SCALE` na trilha de auditoria e desvio para `on_fail`. Todos os 12 testes foram aprovados (`12 passed, 0 failed`) e o TypeScript compilou com zero erros.

---

## 2. Respostas Técnicas da T1C.0 (Conferências Prévias)

1. **`READ` de tabela ou `LOOP table_rows` já tinham algum filtro de linhas?**  
   **NÃO.** Em `lib/contracts/skillgraph/nodes.ts` (linhas 54-63 e 96-109 da Fase 1B), `ReadNodeSchema` possuía apenas `paginate`, e `LoopOverSchema` para `table_rows` aceitava apenas `{ kind: 'table_rows', table: AnchorOrRefSchema }`. Nenhum dos dois continha campos para descarte de linhas.

2. **Como o `PHASE1B_REPORT.md` justificou os casos (e) e (f)?**  
   - **Caso (e) (linhas 107-112):** Argumentou que a chave de linha exigia matrícula não vazia e que o mapeamento canônico descartaria linhas nulas, mas admitiu ausência de filtro declarativo explícito no grafo para ignorar rodapés ("Total", "Média Geral") em leituras e loops.
   - **Caso (f) (linhas 113-122):** Citou os limites declarados em `canonical_mapping.grade_scale`, mas a checagem pré-escrita e a emissão do código `E_VALUE_OUT_OF_SCALE` em runtime não estavam formalizadas como obrigação do runner na especificação.

3. **Explicação do diff de `anchors.ts` (90e1995 → 73f52b7) e confirmação de L1/L2:**  
   O diff envolveu `RowScopeKeySchema` em `z.lazy(() => ...)` para adiar a resolução de `ValueRefSchema` no momento de carregamento, eliminando um `ReferenceError` de dependência circular ESM/Node entre `primitives.ts` e `anchors.ts`.  
   Confirma-se com linhas exatas de `lib/contracts/skillgraph/anchors.ts` que todas as capacidades de L1 e L2 permanecem preservadas:
   - `TextSpec` em candidatos textuais: linhas 48-55 (tipos) e linhas 125, 130, 135, 140, 145, 150, 160 (schemas).
   - Seletor CSS rigidamente estático: linha 54 e linha 156 (`selector: z.string().min(1)`).
   - `match`: linhas 19, 27, 45, 87, 97, 118, 126, 131, 136, 141, 146, 151, 161.
   - `secondary_key`: linhas 28 e 98.
   - `on_multiple`: linhas 29 e 99.
   - `on_none`: linhas 30 e 100.

---

## 3. Tabela de Tarefas e Commits da Fase 1C

| Tarefa | Descrição | Status | Commit Hash |
| :--- | :--- | :---: | :--- |
| **T1C.0** | Pré-voo, checagem de estado e respostas às 3 conferências | `CONCLUÍDO` | *(somente leitura)* |
| **T1C.1** | Schema e validador para linhas não-dados (`RowSkip`, `skip_rows`, `W_FOOTER_ROW_RISK` — G1) | `CONCLUÍDO` | `c4c9ddb` |
| **T1C.2** | Exemplos (`read_roster.json`, `lancar_nota.json`), teste de warning e JSON Schema regerado | `CONCLUÍDO` | `2d3631a` |
| **T1C.3** | Atualização de `SKILLGRAPH_V2.md` (G1, Obrigação 8, códigos) e relatório final | `CONCLUÍDO` | *(commit deste relatório)* |

---

## 4. Resultados dos Comandos de Verificação

- **JSON Schema:** `scripts/gen-skillgraph-schema.ts` executado com sucesso (1 de 2 permitidas). Artefato `contracts/skillgraph-v2.schema.json` sincronizado sem drift.
- **TypeScript Compiler:** `npx tsc --noEmit` executado ao fim da T1C.2 (1 de 2 permitidas) retornando **0 erros**.
- **Vitest:** `__tests__/skillGraphV2.contract.test.ts` executado (2 de 2 permitidas). Resumo: **12 passed, 0 failed**.
  - Validação bem-sucedida dos 4 exemplos oficiais (`read_roster.json`, `lancar_falta.json`, `lancar_nota.json`, `diario_grade.json`).
  - Validação estrita dos 6 casos inválidos de teste de segurança.
  - Teste de drift do JSON Schema 100% idêntico.
  - Teste de warning semântico `W_FOOTER_ROW_RISK` aprovado com 0 erros.

---

## 5. Checklist de Congelamento (Apenas o Dono pode assinar)

- [ ] L1: Âncoras parametrizáveis especificadas com `TextSpec` e transforms de data
- [ ] L1: Seletores CSS estritamente travados sem parametrização (proteção contra injeção)
- [ ] L2: `RowScope` atualizado com `secondary_key`, `on_multiple` e `on_none`
- [ ] L2: Desambiguação de homônimos formalizada e warning `W_HOMONYM_RISK` implementado
- [ ] L3: Contrato de auditoria formalizado em `lib/contracts/audit.ts` (`AuditEntrySchema`)
- [ ] L3/G2: As 8 obrigações de runtime do runner documentadas em `SKILLGRAPH_V2.md`
- [ ] L4: Decisão de consumo pela extensão via bundle único esbuild documentada
- [ ] G1: Tipo `RowSkip`, campos `skip_rows` e `skip_empty_rows` em `READ table` e `LOOP table_rows`
- [ ] G1: Warning semântico `W_FOOTER_ROW_RISK` implementado e coberto por teste
- [ ] G2: Validação de escala pré-escrita e código runtime `E_VALUE_OUT_OF_SCALE` formalizados
- [ ] Schema JSON sincronizado sem drift (`contracts/skillgraph-v2.schema.json`)
- [ ] Suíte de contrato passando com 12 testes aprovados (`vitest`)
- [ ] TypeScript compilando com 0 erros (`npx tsc --noEmit`)
- [ ] Árvore limpa e commits atômicos por tarefa na branch `fase-1-contrato`
