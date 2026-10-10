# Relatório Executivo da Fase 1B: Ajustes Finais do Contrato (SkillGraph v2)

## 1. Resumo Executivo (TL;DR)
A Fase 1B sanou integralmente as quatro lacunas arquiteturais identificadas na auditoria externa (L1, L2, L3, L4). Foram introduzidos `TextSpec` e transforms de data para âncoras dinâmicas, mantendo seletores CSS rigidamente estáticos contra injection; `RowScope` recebeu suporte a `secondary_key` e desambiguação determinística de homônimos; o contrato de auditoria (`AuditEntrySchema`) e as 7 obrigações de runtime do runner foram formalizados; e a decisão de consumo pela extensão via bundle único esbuild foi travada na documentação. Todos os 11 testes de contrato foram aprovados sem regressão e a compilação do TypeScript concluiu com zero erros.

---

## 2. Respostas Técnicas da T1B.0 (Conferências Prévias)

1. **(a) Os candidatos textuais de âncoras aceitavam parâmetros na Fase 1?**  
   **NÃO.** Eram tipados como `z.string().min(1)` puro em `lib/contracts/skillgraph/anchors.ts`.  
   *Ajuste realizado:* Introduzido `TextSpecSchema = z.union([z.string().min(1), ValueRefSchema])` para candidatos textuais.

2. **(b) O `RowScope.key` tinha capacidade de chave secundária na Fase 1?**  
   **NÃO.** Possuía apenas `column_labels: string[]`, `equals: ValueRef` e `match`.  
   *Ajuste realizado:* Adicionado `secondary_key?: RowScopeKey`, `on_multiple: 'fail' | 'use_secondary'` e `on_none: 'fail' | 'skip'`.

3. **(c) A validação semântica da Fase 1 verificava caminhos pontilhados como `aluno.portal_id`?**  
   **PARCIAL.** O schema Zod aceitava a sintaxe pontilhada via regex em `VarValueRefSchema`, porém a checagem em `validateGraph` fazia `params[ref.param]`, falhando quando o parâmetro declarado era apenas a raiz (`"aluno"`).  
   *Ajuste realizado:* O validador agora decompõe o identificador pela raiz (`target.split('.')[0]`), validando a declaração base e inspecionando literais contra PII.

4. **(d) O tipo `'date'` constava em `ParamDefinitionSchema` na Fase 1?**  
   **NÃO.** O enum continha apenas `'string' | 'number' | 'boolean' | 'student_ref' | 'grade' | 'attendance_mark' | 'list' | 'object'`.  
   *Ajuste realizado:* Adicionado o tipo `'date'` ao enum em `graph.ts`.

---

## 3. Tabela de Tarefas e Commits da Fase 1B

| Tarefa | Descrição | Status | Commit Hash |
| :--- | :--- | :---: | :--- |
| **T1B.0** | Pré-voo, checagem de estado e conferências de contrato | `CONCLUÍDO` | *(somente leitura)* |
| **T1B.1** | Schema L1 (`TextSpec`, transforms) e L2 (`secondary_key`, homônimos) | `CONCLUÍDO` | `90e1995` |
| **T1B.2** | Validador semântico atualizado (`E_CSS_PARAM`, `W_HOMONYM_RISK`, PII) | `CONCLUÍDO` | `fcaa6d5` |
| **T1B.3** | Contrato de auditoria estruturada (`AuditEntrySchema` e barrel export) | `CONCLUÍDO` | `2f85fd9` |
| **T1B.4** | Exemplos (`diario_grade.json`, inválidos), teste e JSON Schema | `CONCLUÍDO` | `73f52b7` |
| **T1B.5** | Atualização da documentação (`SKILLGRAPH_V2.md`, obrigações e L4) | `CONCLUÍDO` | `9222147` |
| **T1B.6** | Reteste de expressividade, verificação e relatório final | `CONCLUÍDO` | *(commit deste relatório)* |

---

## 4. Resultado do Reteste de Expressividade (6 Casos Críticos)

### (a) Diário em grade (alunos × datas)
- **Status:** `EXPRESSÁVEL`
- **Demonstração:** Implementado formalmente em `contracts/examples/diario_grade.json`. O nó `WRITE` localiza a coluna da data parametrizada aplicando transformação declarativa no cabeçalho:
  ```json
  "anchor": {
    "candidates": [
      {
        "strategy": "column_header",
        "column_label": { "param": "data", "transform": "format_ddmm" },
        "match": "normalized"
      }
    ],
    "scope": {
      "within": {
        "table": { "candidates": [{ "strategy": "css", "selector": "#tabela-alunos" }], "description": "Tabela de Grade" },
        "key": {
          "column_labels": ["Matrícula", "Código"],
          "equals": { "param": "aluno.portal_id" },
          "secondary_key": { "column_labels": ["Nome do Aluno"], "equals": { "param": "aluno.name" } },
          "on_multiple": "use_secondary"
        }
      }
    }
  }
  ```

### (b) Dois alunos homônimos na mesma turma
- **Status:** `EXPRESSÁVEL`
- **Demonstração:** Utiliza a desambiguação hierárquica de `RowScope`:
  ```json
  "key": {
    "column_labels": ["Nome", "Aluno"],
    "equals": { "param": "aluno.name" },
    "on_multiple": "use_secondary",
    "secondary_key": {
      "column_labels": ["Matrícula", "RA", "Código"],
      "equals": { "param": "aluno.portal_id" },
      "match": "exact"
    }
  }
  ```
  Se houver colisão de nomes civis, o runner desempata pela matrícula. Se a ambiguidade persistir ou caso `on_multiple: "fail"`, o runner falha com segurança sem mutar aluno indevido. O validador emite `W_HOMONYM_RISK` caso um mapa use apenas nome sem chave secundária.

### (c) "Clicar na turma 8A" onde a turma vem de parâmetro
- **Status:** `EXPRESSÁVEL`
- **Demonstração:** Candidatos utilizam `TextSpec` apontando para `{ param: "turma" }`:
  ```json
  "anchor": {
    "candidates": [
      { "strategy": "role_name", "role": "button", "name": { "param": "turma" }, "match": "normalized" },
      { "strategy": "text", "text": { "param": "turma" }, "match": "contains" }
    ],
    "description": "Botão de navegação da turma informada por parâmetro"
  }
  ```
  O runner resolve o valor dinamicamente em runtime, mantendo o princípio P1 sem interpolações arbitrárias de strings.

### (d) Escrita com reversão após falha de read-back
- **Status:** `EXPRESSÁVEL`
- **Demonstração:** 
  1. *Obrigação Contratual de Runtime (L3.1 e L3.2):* O runner armazena obrigatoriamente `before_value` antes da mutação. Se o `read_back` pós-escrita divergir do valor pretendido, reverte o valor no DOM e aborta a rotina (`$abort`), gerando entrada em `AuditEntry` com `status: 'failed'` e `error_code: 'READ_BACK_MISMATCH'`.
  2. *Fluxo Declarativo no Grafo:* O nó `WRITE` aponta `on_fail` para nó de contingência ou `HANDOFF_HUMAN` pedagógico.

### (e) Tabela com linha de total no rodapé que não deve ser lida como aluno
- **Status:** `EXPRESSÁVEL`
- **Demonstração:** 
  1. A chave de linha exige correspondência estrita com matrícula não vazia (`column_labels: ["Matrícula"]`, `equals: { param: "aluno.portal_id" }`). Linhas de rodapé ("Total", "Média Geral") possuem valor vazio ou incompatível nessa coluna.
  2. No mapeamento canônico de leitura em lote (`READ` com `source.kind: "table_rows"`), o runner descarta linhas que não preencham as colunas de chave primária obrigatórias declaradas em `canonical_mapping.columns`.

### (f) Campo de nota com máscara e valor fora da escala
- **Status:** `EXPRESSÁVEL`
- **Demonstração:** O contrato declara os limites em `canonical_mapping.grade_scale`:
  ```json
  "canonical_mapping": {
    "grade_scale": { "type": "numeric", "min": 0, "max": 10, "decimal_separator": "," }
  }
  ```
  Valores fora da escala (ex.: nota `12.5`) são bloqueados pelo runner antes de qualquer evento no DOM. A máscara de entrada utiliza o transform declarativo `parse_decimal_pt_br` para garantir correspondência exata no `read_back`.

---

## 5. Desvios da Especificação e Ajustes de Design

- **Recursão Lazy no Zod:** Para compatibilidade com os módulos ESM/Node ao carregar `primitives.ts` e `anchors.ts`, os schemas recursivos e dependentes (`RowScopeKeySchema`, `RowScopeSchema`, `CandidateSchema`, `AnchorSchema`) foram encapsulados com `z.lazy(() => ...)`, evitando `ReferenceError` de carregamento circular durante a compilação e geração do JSON Schema.
- **Isolamento de Segurança em CSS:** O seletor CSS foi explicitamente travado como `z.string().min(1)`, sem aceitar `TextSpec` ou `ValueRef`. Isso protege a extensão e o navegador contra ataques de *CSS/Selector Injection*.

---

## 6. Observações Fora do Escopo e Dívidas Arquiteturais

1. **Implementação do Bundle da Extensão (Fase 2):** A compilação dos contratos TypeScript em bundle único via `esbuild` para consumo pela extensão MV3 está formalizada no contrato e deve ser configurada na Fase 2.
2. **Ambiente Sintético:** O servidor sintético de testes locais não possui atualmente um arquétipo de diário de classe matricial (grade de datas); a validação atual de `diario_grade.json` foi realizada sobre o contrato formal e validador estático. Recomenda-se adicionar essa página ao servidor sintético na fase de homologação do runner.

---

## 7. Contagem Exata de Comandos Executados na Fase 1B

| Categoria | Limite Permitido | Total Executado | Detalhes |
| :--- | :---: | :---: | :--- |
| **Vitest** (`__tests__/skillGraphV2.contract.test.ts`) | Máx. 2 | **1** | 11 testes aprovados (100% de sucesso) |
| **TypeScript Compiler** (`npx tsc --noEmit`) | Máx. 2 por tarefa (T1B.2, T1B.3, T1B.6) | **3 total** | T1B.2: 1x (0 erros) \| T1B.3: 1x (0 erros) \| T1B.6: 1x (0 erros) |
| **Gerador de Schema** (`gen-skillgraph-schema.ts`) | Máx. 2 | **2** | 1ª tent: erro de inicialização ESM \| 2ª tent: gerado com sucesso |
| **Comandos Git / Leitura** | N/A | **14** | `git status`, `git diff`, `git log`, `git add/commit` atômicos |

---

## 8. Checklist de Congelamento (Apenas o Dono pode assinar)

- [ ] L1: Âncoras parametrizáveis especificadas com `TextSpec` e transforms de data
- [ ] L1: Seletores CSS estritamente travados sem parametrização (proteção contra injeção)
- [ ] L2: `RowScope` atualizado com `secondary_key`, `on_multiple` e `on_none`
- [ ] L2: Desambiguação de homônimos formalizada e warning `W_HOMONYM_RISK` implementado
- [ ] L3: Contrato de auditoria formalizado em `lib/contracts/audit.ts` (`AuditEntrySchema`)
- [ ] L3: As 7 obrigações de runtime do runner documentadas em `SKILLGRAPH_V2.md`
- [ ] L4: Decisão de consumo pela extensão via bundle único esbuild documentada
- [ ] Schema JSON sincronizado sem drift (`contracts/skillgraph-v2.schema.json`)
- [ ] Suíte de contrato passando com 11 testes aprovados (`vitest`)
- [ ] TypeScript compilando com 0 erros (`npx tsc --noEmit`)
- [ ] Árvore limpa e commits atômicos por tarefa na branch `fase-1-contrato`
