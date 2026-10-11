# Nota de Design do Runner (SkillGraph v2)

Este documento define a arquitetura, interfaces, semântica operacional e layout do executor determinístico do **SkillGraph v2** (contrato congelado em `skillgraph-v2.0-frozen`).

---

## 1. Interface `Driver` (Primitivas DOM Serializáveis)

O `Driver` isola todas as operações de interação com o documento. Todas as primitivas recebem e retornam tipos **estritamente serializáveis em JSON**, viabilizando a execução desacoplada (via RPC entre Service Worker e Content Script). Elementos DOM são identificados por `handleId: string` efêmeros, mantidos em memória no contexto da página.

```typescript
export interface Driver {
  // 1. Localização e Escada de Âncoras
  locateAnchor(resolvedAnchor: ResolvedAnchor): Promise<{
    matchCount: number;
    matchedCandidateIndex: number;
    handleId?: string;
  }>;

  locateRow(scope: ResolvedRowScope): Promise<{
    rowHandleId?: string;
    matchedIndex: number;
    totalCandidates: number;
    ambiguous: boolean;
  }>;

  // 2. Leitura Estruturada
  readTable(options: ReadTableOptions): Promise<{
    headers: string[];
    rows: Array<Record<string, string>>;
    rawCells: string[][];
  }>;

  readText(target: ElementTarget): Promise<{ text: string }>;
  readValue(target: ElementTarget): Promise<{ value: string; checked?: boolean }>;

  // 3. Escrita e Mutação Segura
  write(options: WriteOptions): Promise<{
    success: boolean;
    beforeValue: string;
    afterValue: string;
    verified: boolean;
    error?: string;
  }>;

  click(target: ElementTarget, options?: { isSubmit?: boolean }): Promise<{ success: boolean }>;

  // 4. Condições e Navegação
  evaluateCondition(cond: ResolvedCondition): Promise<{ satisfied: boolean; actualValue?: any }>;
  scroll(options: ScrollOptions): Promise<{ found: boolean }>;
  paginate(options: PaginateOptions): Promise<{ advanced: boolean; isLastPage: boolean; currentPage?: number }>;

  // 5. Contexto e Segurança de Origem
  getFrameContext(): Promise<{ url: string; host: string; frameId: number }>;
  matchFingerprint(fp: Fingerprint): Promise<{ matched: boolean; details: Record<string, boolean> }>;
  listFrames(): Promise<Array<{ frameId: number; url: string; host: string }>>;
}
```

---

## 2. Interface `Host` (Injeção de Efeitos e Orquestração)

O engine não possui acesso direto a tempo, rede, armazenamento ou UI. Todo efeito colateral e decisão externa passam pela interface `Host`:

```typescript
export interface Host {
  confirm(checkpoint: CheckpointPayload): Promise<boolean>;
  handoff(options: HandoffPayload): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
  emit(event: RunEvent): void;
  beforeNode(nodeId: string, state: RunState): Promise<void>; // Suporte a Modo Passo a Passo
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): number;
  randomId(): string;
  semanticMatcher?: SemanticMatcher; // Degrau 3 opcional (Fase 5)
}
```

---

## 3. `RunState`, `RunEvent` e Tabela de Códigos de Erro de Runtime

### Estado Serializável (`RunState`)
```typescript
export interface RunState {
  runId: string;
  status: "idle" | "running" | "paused" | "completed" | "failed" | "aborted" | "interrupted";
  currentNodeId: string | null;
  variables: Record<string, any>;
  loopStack: Array<{ nodeId: string; index: number; total: number; item: any }>;
  writesCount: number;
  dryRun: boolean;
  startedAt: number;
  updatedAt: number;
}
```

### Eventos do Runner (`RunEvent`)
- `node_started`: Início da avaliação de um nó.
- `node_completed`: Nó concluído com sucesso.
- `node_failed`: Falha no nó (com erro e tentativa de retry).
- `node_skipped`: Nó ignorado (ex: branch não selecionado).
- `write_performed`: Escrita realizada com read-back verificado.
- `write_reverted`: Escrita revertida ao valor anterior por divergência.
- `checkpoint_requested` / `checkpoint_resolved`: Interação com professor.
- `handoff_started` / `handoff_resumed`: Intervenção humana.
- `repair_requested`: Escada de âncoras esgotada sem match.
- `run_completed` / `run_failed`: Conclusão ou encerramento abrupto.

### Códigos de Erro Padronizados

| Código | Categoria | Descrição |
| :--- | :--- | :--- |
| `E_GRAPH_INVALID` | Validação | Falha estática de schema (Zod ou `validateGraph`). |
| `E_ANCHOR_NOT_FOUND` | Percepção | Nenhum candidato da escada casou no frame/DOM. |
| `E_ANCHOR_AMBIGUOUS` | Percepção | Âncora retornou múltiplos nós sem `on_multiple` permissivo. |
| `E_ROW_NOT_FOUND` | Tabela | Linha com chave primária não foi encontrada na tabela. |
| `E_ROW_AMBIGUOUS` | Tabela | Múltiplas linhas casaram com a chave e `on_multiple: "fail"`. |
| `E_POSTCONDITION_FAILED` | Contrato | Pós-condição do nó avaliou como falsa. |
| `E_FINGERPRINT_MISMATCH` | Segurança | Fingerprint declarada divergiu da página real. |
| `E_HOST_NOT_ALLOWED` | Segurança | Host da aba/frame não consta em `allowed_hosts`. |
| `E_VALUE_OUT_OF_SCALE` | Validação | Nota fora da escala definida em `grade_scale` (Obrigação 8). |
| `E_READBACK_MISMATCH` | Integridade | Leitura pós-escrita divergiu do valor esperado. |
| `E_CHECKPOINT_REJECTED` | Auditoria | Professor rejeitou o checkpoint de confirmação. |
| `E_MAX_WRITES` | Limites | Limite `max_writes_per_run` atingido. |
| `E_MAX_ITERATIONS` | Limites | Limite `max_iterations` de loop atingido. |
| `E_TIMEOUT` | Limites | Timeout configurado do nó ou execução expirou. |
| `E_NODE_UNSUPPORTED` | Suporte | Tipo de nó não suportado nesta fase (`DOWNLOAD`, `UPLOAD`). |
| `E_HANDOFF_TIMEOUT` | Humano | Polling de retomada do handoff expirou sem resolução. |
| `E_INTERRUPTED` | Sistema | Service worker ou aba morreu durante a execução. |

---

## 4. Decisões de Semântica Operacional

1. **Forma do item de `LOOP` e resolução de `{var: "item.coluna"}`**:
   - *Definido no contrato (Seção 4)*: cada linha da tabela gera um objeto com colunas normalizadas (minúsculas, sem pontuação).
   - *Proposta de resolução*: Expressões `{var: "item.nota"}` acessam `state.variables.item["nota"]`. Se a chave exata não existir, realiza fallback case-insensitive e sem acentos contra as chaves do item.
2. **Estabilidade das linhas entre páginas**:
   - *Proposta*: O driver lê as linhas da página visível. O `LOOP` acumula os registros canônicos por chave primária (`matricula` ou `codigo`). Caso haja paginação, o índice de iteração global continua contínuo, independente do número da página atual.
3. **Efeito de `on_fail` após retries**:
   - *Definido no contrato (Seção 5)*: O engine esgota primeiro os `retries` configurados no nó (com rate limit). Se todos falharem, aciona a rota `on_fail` (`$abort`, `$continue`, ou `target_node_id`).
4. **Retry estritamente antes de qualquer escrita**:
   - *Proposta / Regra de Ouro*: Retries são permitidos apenas para nós de leitura, localização e navegação. Em um nó `WRITE`, se a escrita física for disparada e o read-back divergir, **é expressamente proibido efetuar retry**. O runner imediatamente reverte o elemento para `before_value`, emite `write_reverted`, gera `AuditEntry` com status `reverted` e aborta a execução (`E_READBACK_MISMATCH`).
5. **Checagem de `entry_fingerprint` e `expect_fingerprint`**:
   - *Definido no contrato (Seção 2 e 5)*: `entry_fingerprint` é validada pelo engine no primeiro nó do grafo. `expect_fingerprint` é validada localmente antes de executar o nó específico onde está declarada. Divergência resulta em `E_FINGERPRINT_MISMATCH`.
6. **`BRANCH` e `$continue`**:
   - *Definido no contrato (Seção 5)*: `BRANCH` avalia condições em ordem linear. A primeira verdadeira define o próximo nó. Se nenhuma for atendida, segue `default_target`. `$continue` dentro de um `LOOP` aborta o nó atual e salta para a próxima iteração.
7. **Interação entre `pagination` e `READ` / `LOCATE`**:
   - *Proposta*: Em nós `READ(table)` com bloco `pagination`, o driver executa a extração da página atual e aciona `Driver.paginate`. O processo se repete até `isLastPage: true` ou limite de páginas, concatenando as linhas antes de salvar na variável de destino.
8. **Semântica do `dryRun`**:
   - *Proposta*: No modo Dry-run, toda localização e leitura real acontecem normalmente (lê `before_value`). Nenhuma escrita ou clique de submit é executado no DOM. O engine emite eventos simulando "escreveria X → Y", valida se a nota está na escala e conclui sem alterar o portal.
9. **Posicionamento do `rate_limit`**:
   - *Definido no contrato (Seção 6)*: O atraso configurado com jitter randômico é injetado imediatamente antes da execução de nós de efeito colateral: `WRITE`, `CLICK` (com `is_submit_action: true`) e `NAVIGATE`.
10. **Registro de `$abort` na Auditoria**:
    - *Proposta*: Todo `$abort` grava uma entrada `AuditEntry` com `action: "ABORT"`, `status: "failed"`, `error_code`, `node_id` e o snapshot das variáveis locais.

---

## 5. Bloqueio de Contrato

- **Lista de Bloqueios:** **VAZIA (0 bloqueios)**. O contrato congelado `skillgraph-v2.0-frozen` suporta integralmente todas as primitivas, semânticas e tratamentos de exceção descritos nesta especificação.

---

## 6. Layout de Pastas e Inventário de Arquivos

```
lib/runner/                  # Núcleo puro (sem DOM, sem rede, sem chrome)
  types.ts                   # Tipos de execução, RunState, RunEvent
  valueRef.ts                # Resolução de literais, variáveis e caminhos
  transforms.ts             # Transformadores de string
  text.ts                   # Normalização e casamento textual
  conditions.ts             # Avaliador de predicados lógicos
  anchorResolve.ts          # Resolução de âncoras para literais
  limits.ts                 # Rate limiting determinístico e jitter
  engine.ts                 # Loop de execução do grafo
  nodes/
    read.ts                 # Execução de nós READ
    write.ts                # Execução de nós WRITE (com reversão)
    click.ts                # Execução de nós CLICK
    loop.ts                 # Execução de nós LOOP
    branch.ts               # Execução de nós BRANCH
    checkpoint.ts           # Interação com professor
    handoff.ts              # Pausa para operador humano
    navigate.ts             # Execução de nós NAVIGATE
    unsupported.ts          # Erro explícito para UPLOAD/DOWNLOAD

lib/runner-dom/              # Implementação de Driver sobre Document real
  types.ts
  driver.ts                 # Implementação de Driver
  selectors.ts              # Escada de âncoras no DOM
  tableReader.ts            # Leitor de tabelas, cabeçalhos de 2 linhas, spans
  writer.ts                 # Escrita segura com setter nativo e eventos
  conditions.ts             # Checagem de condições no DOM

lib/runner-ext/              # Ponte Extension/Service Worker
  remoteDriver.ts           # Driver RPC via chrome.tabs.sendMessage
  runnerService.ts          # Gerenciamento de ciclo de vida e estado
  sessionStore.ts           # Persistência em chrome.storage.session

tools/runner-harness/        # Harness e Painel de Testes Manual
  index.html
  harness.ts
  traceView.ts
  fixtures/                 # Páginas HTML sintéticas de teste

graphs/synthetic/            # Mapas sintéticos para auditoria e harness
  read_roster.json
  lancar_falta.json
  lancar_nota.json
```
