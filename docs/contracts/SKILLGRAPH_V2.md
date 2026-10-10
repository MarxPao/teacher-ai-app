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
| `E_LIMITS` | Erro | Grafo excede 200 nós ou tamanho serializado superior a 256 KB. |
| `W_UNREACHABLE_NODE` | Aviso | Nó presente no mapa mas inalcançável a partir de `entry_node`. |
