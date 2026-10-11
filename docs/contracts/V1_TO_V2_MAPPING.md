# Mapeamento de Transição: SkillGraph v1 → SkillGraph v2

Este documento estabelece o mapeamento exato de todos os campos do **SkillGraph v1** (`lib/skills/skillGraphSchema.ts` e `sidecar/skill_graph_schema.py`) para a especificação congelada do **SkillGraph v2** (`docs/contracts/SKILLGRAPH_V2.md`).
Este mapeamento servirá de especificação formal para o conversor/migrador a ser implementado na Fase 2.

---

## 1. Raiz do Grafo (`SkillGraph`)

| Campo v1 | Tipo v1 | Destino v2 | Tipo / Estrutura v2 | Justificativa / Observação |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Descartado | N/A | Redundante com a chave natural composta `portal_id + "/" + task_id`. |
| `name` | `string` | `identity.name` | `string` | Preservado como nome legível para humanos. |
| `portal_id` | `string` | `identity.portal_id` | `string` | Identificador único do portal escolar. |
| `task_id` | `string` | `identity.task_id` | `CanonicalTaskId \| custom:<slug>` | Padronizado em enum fechado de tarefas canônicas ou slug customizado. |
| `version` | `string \| number` | `identity.version` | `integer >= 1` | Normalizado estritamente para inteiro sequencial. |
| *(novo)* | N/A | `spec_version` | `"2.0"` (literal) | Versão formal do contrato de dados. |
| *(novo)* | N/A | `identity.domain` | `string` (FQDN) | Host principal do portal para isolamento e segurança. |
| `entry_node` | `string` | `entry_node` | `string` (Node ID) | Nó inicial de entrada do grafo. |
| `nodes` | `Record<string, SkillNode>` | `nodes` | `Record<string, Node>` | Dicionário de nós com validação estrita (máx. 200 nós). |
| `metadata.created_at` | `string` (ISO) | `provenance.created_at` | `string` (ISO 8601) | Rastreabilidade do artefato. |
| `metadata.updated_at` | `string` (ISO) | `provenance.updated_at` | `string` (ISO 8601) | Rastreabilidade do artefato. |
| `metadata.author` | `string` | `provenance.author` | `string` | Autor ou ferramenta geradora. |
| `metadata.has_self_healed`| `boolean` | `provenance.has_self_healed`| `boolean` | Indicador de auto-reparo do mapa. |
| `metadata.success_rate` | `number` | `metrics.success_rate` | `number` (0..100) | Movido para `metrics`, fora do payload canônico assinado. |
| `metadata.total_executions`| `number` | `metrics.total_executions`| `integer >= 0` | Movido para `metrics`, fora do payload canônico assinado. |
| `metadata.last_verified_at`| `string \| null` | `metrics.last_verified_at` | `string \| null` | Movido para `metrics`, fora do payload canônico assinado. |
| `metadata.columns` | `ColumnMetadata[]` | `canonical_mapping.columns`| `CanonicalColumnMapping[]`| Movido para o mapeamento formal de contrato canônico. |
| `passthrough()` / `extra` | `allow` | Descartado | Proibido (`.strict()`) | P2 Estrito: rejeição imediata de campos desconhecidos. |

---

## 2. Nós (`SkillNode`)

| Campo v1 | Tipo v1 | Destino v2 | Tipo / Estrutura v2 | Justificativa / Observação |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Chave no Record | `string` | O ID é a própria chave em `nodes[nodeId]`. O campo interno é descartado. |
| `type` | `SkillNodeTypeEnum` | `type` | União discriminada | Agora discrimina schemas rígidos por tipo (`NAVIGATE`, `READ`, `WRITE`, etc.). |
| `anchor` | `SkillAnchor` | `anchor` | `Anchor \| AnchorRef` | Substituído por lista ordenada de candidatos `[1..6]`, `scope` e `semantic_hint`. |
| `on_success` | `string \| null` | `on_success` | `string \| "$end" \| "$continue"` | Null proibido. Uso obrigatório de sentinelas explícitas. |
| `on_fail` | `string \| null` | `on_fail` | `string \| "$abort"` | Null proibido. Sentinela `$abort` encerra com falha auditada. |
| `retry_policy` | `RetryPolicy` | `retry` | `{max_attempts: 1..5, backoff_ms}` | Renomeado para brevidade e limitado a teto seguro. |
| *(novo)* | N/A | `timeout_ms` | `integer <= 30000` | Timeout determinístico por nó. |
| *(novo)* | N/A | `label` | `string` | Descrição humana obrigatória da intenção do nó. |
| *(novo)* | N/A | `postconditions` | `Condition[]` | Verificação observável pós-execução (efeito físico real). |
| *(novo)* | N/A | `expect_fingerprint` | `Fingerprint` (opcional) | Validação de estado visual/rota antes da execução. |

---

## 3. Parâmetros de Nós (`SkillNodeParams`)

| Campo v1 | Tipo v1 | Destino v2 | Tipo / Estrutura v2 | Justificativa / Observação |
| :--- | :--- | :--- | :--- | :--- |
| `variable_bindings` | `string[]` | `into: string` em `READ`, `as: string` em `LOOP` | `string` | P1 Declarativo: variáveis recebem nomes declarados, sem listas ambíguas. |
| `action_value` | `string \| null` | `value` em `WRITE` | `ValueRef` | P1 Declarativo: proibida interpolação livre `{var}`; uso de `{param}` ou `{var}`. |
| `condition` | `string \| null` | `condition` em `BRANCH` e `WAIT` | `Condition` | Vocabulário estrito e fechado em vez de código JS ou string opaca. |
| `is_submit_action` | `boolean \| null` | `is_submit_action` em `CLICK` | `boolean` (obrigatório) | Obrigatório em todos os nós `CLICK` (verdadeiro bloqueia sem checkpoint). |
| `description` | `string \| null` | `label` no nó | `string` | Unificado no cabeçalho comum de todo nó. |
| `multiplicity` (ad-hoc) | `string` | `mode` em `LOCATE` | `"direct" \| "scroll_until_found" \| "paginate_until_found"` | Padronizado no nó `LOCATE`. |
| `allow_empty` (ad-hoc) | `boolean` | `postconditions` | `count_gte` | Expressável declarativamente através de pós-condição. |
| `loop_target` (ad-hoc) | `string` | `body_entry` em `LOOP` | `string` (Node ID) | Entrada explícita do corpo do laço, com retorno via `$continue`. |

---

## 4. Âncoras e Metadados de Coluna

| Campo v1 | Tipo v1 | Destino v2 | Tipo / Estrutura v2 | Justificativa / Observação |
| :--- | :--- | :--- | :--- | :--- |
| `strategy` (âncora) | `AnchorStrategyEnum` | `Candidate.strategy` | União discriminada | Lista declarada com fallbacks em ordem estrita de prioridade. |
| `value` (âncora) | `string` | Propriedades tipadas de cada `Candidate` | `string` | Ex.: `{strategy: "role_name", role: "button", name: "Salvar"}`. |
| `scope` (âncora) | `string \| null` | `scope` | `{frame?, within?, shadow_pierce?}` | Permite scoping em iframes, Shadow DOM e `RowScope` (linha de aluno). |
| `ColumnMetadata.original_header` | `string` | `columns[].portal_labels` | `string[]` | Lista de sinônimos e variações de cabeçalho do portal. |
| `ColumnMetadata.semantic_type` | `SemanticTypeEnum` | `columns[].semantic_type` | `SemanticTypeEnum` | Tipo semântico de dado escolar. |
| `ColumnMetadata.variable_name` | `string` | `columns[].field` | `CanonicalField` (enum) | Ligação direta com o modelo canônico de dados do app. |
| `ColumnMetadata.sample_values` | `string[]` | Descartado | N/A | Relevante apenas no discovery offline; não pertence ao grafo executável. |
| `ColumnMetadata.confidence` | `number` | Descartado | N/A | Utilizado apenas durante a síntese inicial pelo LLM. |
| `ColumnMetadata.reasoning` | `string` | Descartado | N/A | Raciocínio informal de LLM descartado do contrato de produção. |

---

## 5. Resumo das Decisões de Design (v1 → v2)

1. **Eliminação de Código e Strings Mágicas:** Expressões de condição e interpolações de string soltas foram substituídas por `Condition` (vocabulário fechado) e `ValueRef` (literais ou ponteiros tipados).
2. **Separação de Métricas e Assinatura:** `metrics` e `signature` ficam formalmente fora do payload canônico hashável.
3. **Escala de Resolução em Cascata:** Âncoras deixam de ter apenas um seletor e passam a conter uma lista de até 6 candidatos avaliados sequencialmente com suporte a `RowScope` e iframes.
4. **Fechamento Estrito:** Eliminação completa de `passthrough()` e `extra="allow"` para garantir que o JSON Schema seja a fonte inequívoca da verdade.
