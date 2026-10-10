# Especificação Técnica do SkillGraph v2

**Versão da Especificação:** `2.0`  
**Status:** CONGELADO (Fase 1)  
**Contrato Formal:** `contracts/skillgraph-v2.schema.json` | `lib/contracts/skillgraph/`

O **SkillGraph v2** é o formato declarativo e neutro de linguagem para representação de rotinas de automação escolar do Teacher AI. Um SkillGraph é gravado a partir de demonstração do professor, compilado offline por LLM e executado deterministicamente no navegador sem chamadas a modelos generativos durante o tempo de execução.

---

## 1. Princípios Invioláveis (P1 a P9)

1. **P1 — Declarativo:** Não contém código executável, expressões regulares dinâmicas avaliadas ou templates de string. Valores dinâmicos utilizam exclusivamente `ValueRef` (`lit`, `param` ou `var`). Condições operam sob vocabulário fechado.
2. **P2 — Estrito:** Todos os schemas Zod impõem `.strict()`. Qualquer propriedade desconhecida causa erro imediato de validação, forçando governança estrita de versão.
3. **P3 — Sem PII no Mapa:** Dados reais de alunos ou professores nunca são embutidos no grafo. Devem ser fornecidos em runtime via `params` ou lidos para `var`. O validador rejeita grafos contendo CPF, e-mail ou telefone em literais.
4. **P4 — Escrita só atrás de CHECKPOINT:** Nenhum nó de efeito colateral (`WRITE`, `UPLOAD`, `CLICK` com `is_submit_action: true`) pode ser executado sem aprovação humana expressa (`CHECKPOINT`). Garantido por validação semântica estática e trava dupla em runtime.
5. **P5 — Escopo de Domínio:** `safety.allowed_hosts` é obrigatório e não-vazio. Toda navegação ou frame deve pertencer à lista de hosts autorizados.
6. **P6 — Neutro de Linguagem:** O schema canônico é o `skillgraph-v2.schema.json`. A extensão (JavaScript), o desktop (TypeScript) e o sidecar (Python) validam contra este mesmo artefato.
7. **P7 — Versionamento:** A chave raiz `spec_version` fixa `"2.0"`. Novas capacidades retrocompatíveis usam 2.x; quebras exigem 3.0. Cada mapa tem um número de versão inteiro imutável (`identity.version`).
8. **P8 — Separação de Conteúdo vs. Métricas:** Métricas operacionais (`metrics`) e assinaturas criptográficas (`signature`) residem fora do payload assinado canônico.
9. **P9 — DAG (Grafo Acíclico Dirigido):** O fluxo entre nós é um DAG. Repetições utilizam o nó `LOOP` (com corpo delimitado e retorno via `$continue`) e retentativas utilizam a política `retry` local de cada nó, nunca arestas de retorno.

---

## 2. Semântica dos Tipos de Nós

Todo nó possui cabeçalho comum: `label`, `retry {max_attempts, backoff_ms}`, `timeout_ms`, `postconditions: Condition[]`, `expect_fingerprint?`, além de `on_success` e `on_fail` (ou `on_true`/`on_false` para `BRANCH`).

| Tipo de Nó | Finalidade | Propriedades Principais | Efeito Físico / Verificação |
| :--- | :--- | :--- | :--- |
| `NAVIGATE` | Sub-navegação em SPA ou URL | `path`, `host?`, `query?` | Verificação de transição de rota no histórico ou URL. |
| `LOCATE` | Localização e pré-aquecimento | `anchor`, `mode` (`direct`, `scroll_until_found`, `paginate_until_found`) | Suporte a tabelas virtualizadas e paginação antes da interação. |
| `READ` | Extração de dados tabulares ou texto | `source {kind, anchor}`, `into`, `paginate?` | Armazena o valor bruto lido na variável especificada. |
| `WRITE` | Preenchimento de input, select ou checkbox | `anchor`, `value: ValueRef`, `method`, `semantic`, `read_back: true` | **Obrigatório `read_back: true`:** lê o elemento após a escrita para confirmar persistência. |
| `CLICK` | Disparo de clique com mouse | `anchor`, `is_submit_action: boolean`, `expect_navigation?` | Se `is_submit_action: true`, atua como nó de risco exigindo checkpoint prévio. |
| `WAIT` | Aguardo determinístico de estado | `until: Condition` ou `ms: number <= 10000` | Pausa a execução até que o predicado do DOM seja satisfeito. |
| `LOOP` | Iteração sobre coleções ou listas | `over {table_rows \| var_list \| param_list}`, `as`, `body_entry`, `max_iterations <= 1000` | Inicia o cursor e delega para `body_entry`. O corpo do laço encerra com `$continue`. |
| `BRANCH` | Desvio condicional | `condition: Condition`, `on_true`, `on_false` | Avalia condição fechada e bifurca o fluxo sem efeitos colaterais. |
| `CHECKPOINT` | Ponto de conferência humana (HITL) | `summary {label, value}[]`, `scope` (`once`, `per_iteration`, `per_batch`), `on_reject` | Pausa o runner, exibe resumo na UI e aguarda aprovação explícita do professor. |
| `DOWNLOAD` | Disparo de download de arquivo | `trigger`, `expect {mime_hint, filename_pattern}`, `into` | Aguarda o evento de download do navegador e vincula ao registro local. |
| `UPLOAD` | Carregamento de arquivo em formulário | `input`, `source: ValueRef` | Atua como nó de risco mutador. |
| `HANDOFF_HUMAN` | Transferência temporária de controle | `reason` (`login`, `captcha`, `2fa`, `sso`, `other`), `message`, `resume_when`, `timeout_ms` | Exibe overlay solicitando que o professor conclua o desafio interativo. |

---

## 3. Escada de Resolução de Âncoras (Cascade)

A localização de elementos no DOM opera em 3 níveis determinísticos:

```
[Nível 1: Candidatos Declarados (1 a 6)]
      │
      ▼ (se nenhum seletor casar)
[Nível 2: Matcher Semântico Local (semantic_hint)]
      │
      ▼ (se não houver correspondência de alta confiança)
[Nível 3: Falha Segura e Pedido de Auto-Reparo]
```

1. **Nível 1 — Candidatos Ordenados:** O runner avalia até 6 candidatos na ordem declarada:
   - `role_name`: papel de acessibilidade e nome acessível (`aria-label`, texto visível).
   - `label_text`: texto do elemento `<label>` associado via `for` ou aninhamento.
   - `aria_label`: atributo `aria-label` estrito.
   - `placeholder`: texto de orientação do campo.
   - `test_id`: atributos `data-testid`, `data-test`, etc.
   - `text`: texto interno exato ou normalizado.
   - `css`: seletor CSS determinístico.
   - `column_header`: cabeçalho de coluna associado em um `RowScope`.
   - `structural_relative`: relação parental ou de irmandade no DOM (`parent`, `next_sibling`, `prev_sibling`, `first_child`).

### 3.1. Âncoras Parametrizáveis (`TextSpec` — L1)
Candidatos textuais (`role_name`, `label_text`, `aria_label`, `placeholder`, `test_id`, `text`, `column_header`) utilizam o tipo unificado `TextSpec`:
- **Valores suportados:** string literal fixa ou `ValueRef` (`{ param: "x" }` ou `{ var: "y" }`).
- **Transformações determinísticas:** `ValueRef` suporta transformações opcionais declarativas (`Transform`), como `format_ddmm` e `format_ddmmyyyy` (ex: localizar coluna da aula a partir de um parâmetro de data `2026-10-10` transformado em `"10/10"`), além de `trim`, `normalize_name`, `strip_percent`, `parse_decimal_pt_br`.
- **Modos de correspondência:** `match?: 'exact' | 'normalized' | 'contains'` (padrão: `'normalized'`).
- **Proibição de interpolação:** Em conformidade com o princípio P1, não são permitidos templates ou concatenações dinâmicas de string.
- ⚠️ **PROIBIÇÃO DE PARAMETRIZAÇÃO EM SELETORES CSS (Segurança Crítica):**
  A estratégia `css` aceita **estritamente string literal estática** (`selector: string.min(1)`). É terminantemente proibido o uso de `TextSpec` ou `ValueRef` em seletores CSS. Essa restrição elimina qualquer superfície de ataque de *CSS/Selector Injection* no navegador do usuário. Tentativas são rejeitadas pelo schema Zod e pelo validador semântico com `E_CSS_PARAM`.

### 3.2. Chave de Linha Robusta e Homônimos (`RowScope` — L2)
Para operações tabulares (ex.: diários de classe, grades de notas e chamadas), a localização dentro de linhas utiliza `RowScope`:
- **Chave Primária (`key`):**
  - `column_labels: string[]`: lista de cabeçalhos possíveis para a coluna identificadora (ex.: `["Matrícula", "Código"]`).
  - `equals: ValueRef`: valor esperado (ex.: `{ param: "aluno.portal_id" }`).
  - `match?: 'exact' | 'normalized' | 'contains'`.
- **Chave Secundária de Desambiguação (`secondary_key`):**
  - Permite definir chave de desempate (ex.: chave primária por código/matrícula e chave secundária por `["Nome do Aluno", "Discente"]` com `{ param: "aluno.name" }`, ou vice-versa).
- **Semântica de Conflito (`on_multiple`):**
  - `'fail'` (padrão): se mais de uma linha corresponder à chave primária (ex.: dois alunos homônimos na mesma turma com mesmo nome civil), o runner falha imediatamente sem arriscar mutação no aluno errado.
  - `'use_secondary'`: o runner consulta a `secondary_key` para desambiguar a linha. Se o conflito persistir após a chave secundária, a execução falha.
- **Semântica de Ausência (`on_none`):**
  - `'fail'` (padrão): interrompe a execução se a linha do aluno não for encontrada na tabela.
  - `'skip'`: permite ignorar a linha se a operação for projetada para processamento parcial.
- **Aviso Semântico `W_HOMONYM_RISK`:** O validador emite aviso caso um mapa utilize apenas colunas de nome discente na chave primária sem configurar `secondary_key`.

2. **Nível 2 — Matcher Semântico Local:** Se todos os candidatos falharem, o runner consulta o `semantic_hint` (`role`, `semantic_type`) e tenta localizar elementos equivalentes dentro do mesmo container/escopo usando heurísticas locais estáticas (sem rede ou LLM).
3. **Nível 3 — Falha Segura:** Se o elemento não puder ser localizado com confiança, a execução segue para `on_fail` (ou `$abort`) e registra `needs_repair: true` para acionar auto-reparo offline.

---

## 4. Política de Versionamento e Assinatura

- **Identidade do Mapa:** Chave única `portal_id + "/" + task_id`.
- **Imutabilidade:** Toda alteração no mapa gera um incremento no inteiro `identity.version`. Mapas com a mesma versão são imutáveis e podem ser cacheados com hash SHA-256.
- **Conteúdo Assinado (Canonical JSON):** O hash ou assinatura criptográfica (`signature`) cobre o objeto JSON canônico serializado com todas as chaves exceto:
  - `metrics` (dados dinâmicos de taxa de sucesso e contagem de execuções);
  - `signature` (a própria assinatura do artefato).

---

## 5. Regras de Grafo: DAG e Delimitação de Loops

1. **Grafo Acíclico Dirigido (DAG):**
   - Não são permitidos loops diretos ou arestas de ciclo entre nós comuns.
   - Qualquer repetição deve ser estruturada via nó `LOOP`.
2. **Delimitação do Corpo do Loop (`E_LOOP_BODY_ESCAPE`):**
   - Um nó `LOOP` define `body_entry`, apontando para o primeiro nó da iteração.
   - O corpo do laço deve terminar exclusivamente na sentinela `$continue` (que incrementa o cursor da coleção e retorna para a próxima iteração) ou `$abort`.
   - É proibido um nó dentro do corpo do laço apontar diretamente para `$end` ou saltar para nós fora do corpo sem passar por `$continue`.
   - Quando a coleção é esgotada, o próprio nó `LOOP` avança para `on_success`.
3. **Checkpoints em Loops:**
   - Se o corpo do laço contiver escrita (`WRITE`), o `CHECKPOINT` pode estar posicionado:
     - **Antes do Loop (`scope: "per_batch"`):** O professor aprova o lote inteiro uma única vez no início.
     - **Dentro do Loop (`scope: "per_iteration"`):** O professor aprova aluno por aluno individualmente a cada iteração.
   - A validação semântica remove todos os nós `CHECKPOINT`; se qualquer `WRITE` puder ser atingido a partir de `entry_node`, o grafo é rejeitado com `E_WRITE_WITHOUT_CHECKPOINT`.
4. **Filtragem de Linhas que Não São Dados (`skip_rows` e `skip_empty_rows` — G1):**
   - Em tabelas escolares, linhas de rodapé (ex.: "Total", "Média", "Subtotal") ou linhas vazias não devem ser processadas como alunos.
   - `skip_rows?: RowSkip[]` (máx. 10): lista de regras declarativas para descartar linhas.
     - `RowSkip = { column_labels: string[], match?: 'exact' | 'normalized' | 'contains', values: string[] }`.
     - Valores são exclusivamente literais de string (sem `ValueRef`), e a linha é descartada se qualquer regra casar.
     - Suportado em `READ` (leitura tabular com `source.kind: "table"`) e `LOOP` (iteração sobre `table_rows`).
   - `skip_empty_rows: boolean` (padrão `true`): descarta automaticamente linhas cujas células de dados estejam vazias ou contenham apenas espaços.
   - **Aviso `W_FOOTER_ROW_RISK`:** O validador emite aviso caso um nó `LOOP` sobre `table_rows` alcance nós de risco (`WRITE`, `UPLOAD`, submit) sem definir `skip_rows`.

---

## 6. Tabela de Códigos do Validador Semântico (`validate.ts`)

| Código de Erro / Aviso | Severidade | Descrição / Regra Violada |
| :--- | :---: | :--- |
| `E_NO_ENTRY` | Erro | O `entry_node` declarado não existe no dicionário `nodes`. |
| `E_DANGLING_REF` | Erro | Aresta (`on_success`, `on_fail`, `on_true`, `on_false`, `body_entry`) aponta para ID inexistente. |
| `E_BAD_SENTINEL` | Erro | Uso de sentinela em contexto inválido (ex.: `$end` ou `$continue` em `on_fail`). |
| `E_CYCLE` | Erro | Ciclo detectado no grafo fora da estrutura de `LOOP`. |
| `E_WRITE_WITHOUT_CHECKPOINT`| Erro | Nó de risco (`WRITE`, `UPLOAD`, submit) alcançável sem aprovação humana prévia. |
| `E_READONLY_VIOLATION` | Erro | Grafo com `safety.side_effect_level: "read"` contém nós de mutação. |
| `E_UNDECLARED_PARAM` | Erro | Uso de `{param: "x"}` sem declaração prévia em `params`. |
| `E_UNDECLARED_VAR` | Erro | Uso de `{var: "x"}` antes de ser gerada por `READ`, `LOOP` ou `DOWNLOAD`. |
| `E_UNKNOWN_ANCHOR_REF` | Erro | Referência `{ref: "x"}` ausente em `anchor_library`. |
| `E_HOST_NOT_ALLOWED` | Erro | Host de `NAVIGATE` ou `FrameRef` não consta em `safety.allowed_hosts`. |
| `E_LOOP_UNBOUNDED` | Erro | Nó `LOOP` sem `max_iterations` ou com teto superior a 1000. |
| `E_LOOP_BODY_ESCAPE` | Erro | Corpo do loop atinge `$end` ou salta para fora sem passar por `$continue`. |
| `E_PII_LITERAL` | Erro | Literal estático ou candidato de seletor contém dados em formato de CPF, e-mail ou telefone. |
| `E_CSS_PARAM` | Erro | Candidato com estratégia CSS utiliza seletor parametrizado (prevenção contra injeção de seletores). |
| `E_LIMITS` | Erro | Grafo excede 200 nós ou tamanho serializado superior a 256 KB. |
| `W_UNREACHABLE_NODE` | Aviso | Nó presente no mapa mas inalcançável a partir de `entry_node`. |
| `W_HOMONYM_RISK` | Aviso | Âncora de linha (`RowScope.key`) filtra por coluna de nome discente sem definir `secondary_key` para desambiguação. |
| `W_FOOTER_ROW_RISK` | Aviso | `LOOP` sobre `table_rows` alcança nó arriscado sem `skip_rows` configurado (risco de interagir com linha de rodapé/total). |
| `E_VALUE_OUT_OF_SCALE` | Erro (Runtime) | Nota fora dos limites de `grade_scale` em `WRITE` com `semantic: "grade"` (emitido em `AuditEntry` pelo runner em runtime; não emitido pelo `validateGraph`). |

---

## 7. Obrigações do Runner em Tempo de Execução (Runtime Contract — L3)

O executor determinístico na extensão Chrome MV3 deve obedecer rigorosamente a 8 obrigações de runtime antes, durante e após a execução de qualquer nó:

1. **Leitura de `before_value` antes de mutação em WRITE:**
   Antes de qualquer disparo de evento ou digitação em um nó `WRITE`, o runner deve ler o valor existente no campo (`before_value`) e retê-lo no contexto da execução.
2. **Reversão ou abort se read-back pós-escrita divergente:**
   Após a escrita, o runner executa a leitura confirmatória (`read_back: true`). Se o valor verificado pós-escrita (`after_value`) divergir do valor pretendido, o runner deve tentar restaurar o `before_value` original ou abortar a execução imediatamente (`$abort`), evitando corrupção de dados escolares no portal.
3. **Checagem em runtime de `allowed_hosts` em toda navegação e ação:**
   A conformidade de domínio não é apenas estática em compilação. Em runtime, antes de qualquer navegação (`NAVIGATE`), troca de janela, inspeção em iframe (`FrameRef`) ou requisição de rede, o runner valida se o host de destino está expressamente presente em `safety.allowed_hosts`.
4. **Execução estrita do checkpoint humano (HITL):**
   Ao atingir um nó `CHECKPOINT`, o runner interrompe o fluxo e apresenta o resumo pedagógico para confirmação pelo professor. Se o usuário rejeitar (`on_reject`), a execução é imediatamente cancelada. É estritamente proibido auto-aprovar ou contornar um checkpoint por timeout ou script.
5. **Registro em trilha de auditoria estruturada (`AuditEntry`):**
   Toda ação mutadora ou de leitura relevante deve gerar um registro padronizado pelo contrato `AuditEntrySchema` (`run_id`, `graph`, `node_id`, `action`, `target_ref`, `before_value`, `after_value`, `verified_by`, `status`, `error_code`, `at`). Campos com PII sensível (`before_value`, `after_value`, `target_ref`) recebem guarda local e nunca são transmitidos externamente.
6. **Recusa de execução se mapa não passar no validador semântico:**
   Antes de disparar o `entry_node`, o runner executa a validação de schema e a análise semântica (`validateGraph`). Mapas que apresentem qualquer erro estrutural (`valid: false`) são sumariamente recusados, impedindo comportamentos anômalos no DOM.
7. **Sem chamadas a LLM em runtime — runner 100% determinístico:**
   O runner é um interpretador puro de autômato finito/DAG. Durante a execução, é expressamente vedada qualquer consulta a LLM (local ou em nuvem). Toda a busca de elementos, desambiguação e digitação é governada deterministicamente pelas regras declaradas no grafo e nos candidatos de âncora.
8. **Validação de escala antes de mutação de nota (`semantic: "grade"` — G2):**
   Antes de disparar qualquer escrita em nó `WRITE` com `semantic: "grade"`, o runner valida obrigatoriamente o valor contra a escala declarada em `canonical_mapping.grade_scale`:
   - **Escala numérica (`numeric`):** o valor normalizado deve respeitar `min <= valor <= max`.
   - **Escala conceitual (`concept`):** o valor deve constar na lista de valores permitidos (`values`).
   - **Escala descritiva (`descriptive`):** o valor deve ser uma string não vazia.
   Caso o valor esteja fora da escala: o runner **não escreve no DOM**, registra uma entrada em `AuditEntry` com `status: "failed"` e `error_code: "E_VALUE_OUT_OF_SCALE"`, e redireciona o fluxo para `on_fail` (ou `$abort`), impedindo a persistência de notas corrompidas no portal escolar.

---

## 8. Consumo do Contrato pela Extensão (Decisão de Arquitetura L4)

A extensão Chrome Manifest V3 consumirá os contratos TypeScript unificados (`lib/contracts/`) compilados em um bundle único via **esbuild** (a ser configurado na Fase 2), sem duplicar schemas ou interfaces em JavaScript:
- **Fonte Única da Verdade:** Toda definição de Zod schema, tipos TypeScript e rotinas de validação reside em `lib/contracts/`.
- **Zero Duplicação:** Não há manutenção manual paralela de schemas em `.js` dentro de `teacher-extension/`.
- **Integridade de Tipos:** O bundle compilado para a extensão compartilha exatamente os mesmos limites, tipos e regras que o app desktop.
