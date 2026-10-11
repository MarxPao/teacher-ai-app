# Nota de Design Arquitetural — Gravador e Compilador de Mapas (Fase 3)

**Documento:** `docs/recorder/RECORDER_DESIGN.md`  
**Data:** 11/10/2026  
**Status:** Proposta de Arquitetura para o **GATE 0**  
**Autores:** Engenheiro de Software Principal & Equipe Teacher AI  

---

## 1. Schema do Trace (`trace_version: "1.0"`)

O Trace é o registro em memória (`chrome.storage.session`) das ações físicas executadas pela professora durante uma demonstração. Ele reside **fora do contrato do grafo** e é validado estritamente via Zod (`.strict()`).

### 1.1 Tipos de Passos (`TraceStep`)
- `navigate`: Transição de URL com `url`, `transitionType`, `frame_path`.
- `click`: Clique em elemento interativo com `descriptor` e `settled` (delta de digest pós-clique).
- `input`: Preenchimento de texto. **Não é keylogger:** armazena estritamente o **valor final** disparado no evento `change`/`blur`.
- `select`: Seleção de opção em `<select>` com `value`, `text` da opção e `before_value`.
- `check`: Alternância de checkbox/radio com `checked` (antes e depois).
- `key`: Teclas de navegação funcional permitidas exclusivamente: `'Enter' | 'Tab' | 'Escape'`. Qualquer outra tecla é descartada.
- `mark_table`: Passo explícito do Modo Marcar indicando a tabela-alvo de alunos.
- `mark_next_page`: Passo do Modo Marcar indicando o botão/link de próxima página.
- `mark_element`: Passo do Modo Marcar selecionando uma célula/campo sem ativar ação da página.
- `settled`: Registro de estabilidade do DOM com delta do digest.
- `sensitive_field`: Passo especial disparado em campos sensíveis (`type=password`, etc.). **Nunca possui campo `value`**.
- `note`: Metadado livre para o compilador.

### 1.2 Descriptor do Elemento e Invariante de Ida e Volta
Cada passo com interação contém um `ElementDescriptor`:
- `tag`, `role`, `accessible_name`, `label_text`, `aria_label`, `placeholder`, `test_id`, `text`, `id`, `classes`.
- `rowContext`: Se o elemento estiver em uma linha de tabela: `headers: string[]`, `column_index: number`, `cells: string[]` (contendo os textos literais que entram no `PiiRegistry`).
- `candidates`: Lista de até 6 candidatos de âncora gerados pelo mesmo algoritmo de resolução de `lib/runner-dom`.
- **Invariante de Ida e Volta**: Todo candidato gerado é testado imediatamente contra o `document` vivo via `resolveAnchorElements`. O candidato só é anexado ao descriptor se retornar **exatamente 1 match**, correspondente à mesma referência do elemento alvo. Candidatos ambíguos ou que falham são descartados na origem.

### 1.3 Tetos de Segurança
- Máximo de **500 passos** por sessão de gravação.
- Tamanho total em JSON limitado a **2 MB**.
- Strings literais truncadas em **80 caracteres**.
- Máximo de **30 células** inspecionadas por linha de tabela.
- Violação de tetos interrompe a gravação com `E_TRACE_TOO_LARGE`.

---

## 2. Política Estrita de PII e Teste do Canário

O trace captura temporariamente os dados reais que a professora manipula na tela da escola. Esses dados **nunca podem vazar para o grafo compilado, nem para logs, nem para o LLM**.

1. **`PiiRegistry` em Memória**:
   - Composição: todos os valores digitados (`input.value`), seleções (`select.value`), textos de células observadas nas linhas (`rowContext.cells`) e atributos identificadores.
   - O registro vive exclusivamente no escopo da compilação e no `chrome.storage.session`. Nunca é gravado em `localStorage` ou `chrome.storage.local`.
2. **Redação e Placeholders**:
   - Toda string do trace passa por `redactTrace()`. Literais do registro são substituídos por tokens canônicos: `<PARAM:aluno>`, `<PARAM:turma>`, `<PARAM:nota>`, `<CELL:r1c2>`.
   - O `PageDigest` do documento (títulos, cabeçalhos, contagens) passa por redação antes de gerar o `Fingerprint`.
3. **Descarte e Exportação**:
   - Ao clicar em "Salvar Grafo", o trace bruto é **imediatamente purgado** da memória e do storage da sessão (salvo se o usuário marcar "manter para recompilar", que permanece estritamente em sessão).
   - Exportações externas permitidas geram exclusivamente o **Trace Anonimizado** (com placeholders).
4. **Teste do Canário**:
   - Todos os traces sintéticos e testes unitários utilizam dados canário com sobrenomes de aves inconfundíveis (ex.: *"Zeca Canário"*, *"Bia Pardal"*, *"Carlos Gaivota"*).
   - A etapa de `scrubGraph` varre todas as chaves, nós, âncoras e descrições do grafo compilado. Se qualquer canário ou valor do `PiiRegistry` aparecer no JSON: `E_PII_SCRUB_FAILED` e nada é salvo.

---

## 3. Síntese de Âncoras e Resolução Resiliente

A síntese transforma o `ElementDescriptor` em uma `Anchor` do contrato congelado (`candidates`, `scope`, `description`).

### 3.1 Ordem de Precedência dos Candidatos (Máximo 6)
1. `role_name`: Estratégia primária para elementos semânticos (`role: "button"`, `name: "Gravar"`).
2. `label_text`: Para inputs associados a `<label>`.
3. `aria_label`: Para botões de ícone com acessibilidade declarada.
4. `placeholder`: Para caixas de pesquisa e campos de texto.
5. `test_id`: Atributos `data-testid`, `data-test`.
6. `text`: Texto visível do elemento com normalização acentual.
7. `css`: Seletor CSS robusto gerado (regras estritas abaixo).
8. `column_header`: Quando o elemento reside em célula de tabela com cabeçalho identificado.
9. `structural_relative`: Relação pai/filho/irmão quando âncoras diretas forem ambíguas.

### 3.2 Regras Estritas para CSS Gerado
- **Rejeição de IDs e Classes Dinâmicas**: Rejeita seletores contendo hashes gerados por frameworks (ex.: `css-1x8a9`, `_ngcontent-`, `:r1:`, strings hexadecimais ou com mais de 4 dígitos aleatórios consecutivos).
- **Preferência Semântica**: Prioriza atributos estáveis: `name`, `type`, `data-action`, `[aria-expanded]`.
- **Profundidade**: Máximo de 3 níveis de aninhamento (ex.: `form.chamada table tr.selected`).
- **Pseudo-classes estruturais**: `nth-of-type` só é emitido como último candidato de fallback e deve conter obrigatoriamente a flag `fragile: true`.

### 3.3 Parametrização Segura (`TextSpec`)
- Se o texto do elemento coincidir com um parâmetro decidido (ex.: aba com o nome da turma `"8A"`), a âncora **NUNCA** usa interpolação de string.
- Ela é sintetizada estritamente como um objeto `TextSpec`: `{ param: "turma", match: "exact" }`.

---

## 4. Pipeline em 4 Estágios

O pipeline é uma função puramente determinística: `mesma entrada = mesmo JSON byte a byte`.

```
[Trace Bruto]
      ↓
 1. analyze(trace) → Detecta padrões (tabelas, repetições, submits, logins, variáveis)
      ↓
[Decisions Padrão] → Exibidas na UI de Revisão (ReviewView) para validação da professora
      ↓ (Confirmação obrigatória sem padrões silenciosos)
 2. Decisions Finais
      ↓
 3. compile(trace, decisions) → Executa estágios sequenciais puros
      ↓
 4. scrubGraph() → Varredura estrita anti-PII com o PiiRegistry
      ↓
[SkillGraph v2 Válido]
```

### 4.1 Estágios do Compilador
1. **Segmentar**: Divide a sequência de passos em blocos lógicos (Navegação Inicial → Seleção de Contexto → Iteração em Tabela → Submissão).
2. **Parametrizar**: Substitui literais por variáveis e referências a parâmetros.
3. **Sintetizar Âncoras**: Constrói as âncoras validadas com até 6 candidatos e escopos de linha.
4. **Gerar Fingerprints**: Deriva o `entry_fingerprint` e fingerprints de transição a partir dos digests anonimizados.
5. **Inferir Esperas**: Analisa os eventos `settled`; se um clique disparou carregamento assíncrono ou recarga, insere nó `WAIT` com condição baseada no delta.
6. **Mapeamento Canônico**: Associa as colunas observadas ao dicionário de `CanonicalField`.
7. **Aplicar Segurança**: Define `allowed_hosts`, `side_effect_level`, `max_writes_per_run`, e insere o nó `CHECKPOINT` antes do primeiro nó mutador.
8. **Montar e Validar**: Constrói a estrutura do `SkillGraphV2`, valida via `SkillGraphV2Schema.safeParse` e `validateGraph`.
9. **Scrub Anti-PII**: Executa a limpeza final conferindo cada string com o `PiiRegistry`.

### 4.2 Decisões Obrigatórias da Professora (Sem Padrão Silencioso)
O compilador recusa a compilação com `E_DECISION_REQUIRED` se a professora não tiver selecionado explicitamente:
1. **Polaridade de Frequência**: Seleção binária obrigatória: `Marcado = Faltou` OU `Marcado = Presente`. A dica do `attendancePolarity.js` aparece apenas como recomendação visual.
2. **Escala de Notas**: Confirmação da faixa de notas (ex.: 0 a 10 ou 0 a 100).
3. **Coluna-Chave da Linha**: Confirmação da coluna que identifica o aluno (matrícula preferencial, nome secundária).
4. **Hosts Permitidos**: Confirmação dos domínios autorizados para execução.
5. **Dado a Escrever**: Quando a gravação envolver múltiplos campos, escolha explícita de qual campo corresponde ao dado do grafo.

---

## 5. Esqueletos Canônicos por `task_id`

### 5.1 `read_roster` (Leitura de Alunos)
- **Nós**: `NAVIGATE` → `CLICK` (aba de turma com `TextSpec` ou `NAVIGATE.query`) → `READ` (tabela com `over.kind: "table_rows"` e `skip_rows`) → `$end`.
- **Segurança**: `side_effect_level: "read"`, zero checkpoints necessários.

### 5.2 `lancar_falta` (Frequência em Lote)
- **Nós**: `NAVIGATE` → `CHECKPOINT` (resumo prévio da turma e data) → `LOOP` (sobre linhas com `RowScope` por matrícula/nome) → `BRANCH` (avalia condição de falta) → `WRITE` / `CLICK` (marcar presença/falta) → `CLICK` (`is_submit_action: true`) → `$end`.
- **Segurança**: `side_effect_level: "write"`, `writes_require_checkpoint: true`.

### 5.3 `lancar_nota` (Avaliações com Read-Back)
- **Nós**: `NAVIGATE` → `CHECKPOINT` → `LOOP` → `WRITE` (input da nota com `read_back.expect_equals: ValueRef`) → `CLICK` (Gravar) → `$end`.
- **Segurança**: `side_effect_level: "write"`. Em caso de divergência no read-back pós-escrita, reversão e abort.

---

## 6. Detecção Inteligente de Parâmetros

1. **Chave de Linha do Aluno**:
   - Detecta colunas com "matrícula", "ra", "código", "registro" como chave primária (`ID_KEYWORD_REGEX`).
   - Se houver apenas coluna de "nome", usa o nome e emite o aviso canônico `W_HOMONYM_RISK`.
2. **Coluna de Data do Diário**:
   - Se o cabeçalho da coluna clicada/editada coincidir com a data em que a gravação ocorreu (ex.: "11/10" ou "11/10/2026"), o compilador **não grava a data literal nem calcula "hoje"**. Ele parametriza o cabeçalho da coluna como `{ param: "date", format: "format_ddmm" }`.
3. **Padrões em Lote (Repetições)**:
   - Se a professora marcar falta ou nota para mais de um aluno na gravação, o compilador detecta a repetição, emite o aviso `W_BATCH_PATTERN_IGNORED` e abstrai a ação para o corpo de um único `LOOP`.

---

## 7. Login, Handoff e Paginação

1. **Sequência de Login**:
   - O gravador detecta campos com `sensitiveRules` (`type=password`, etc.).
   - Ao detectar submissão de credenciais ou transição de tela de login, o compilador substitui todo o trecho de credenciais por um nó **`HANDOFF_HUMAN`**:
     * `reason: "login"`
     * `message: "Por favor, realize seu login no portal para que a automação continue."`
     * `resume_when: { op: "not_exists", anchor: <âncora_do_form_de_login> }`
     * `timeout_ms: 180000` (3 minutos).
2. **Paginação**:
   - Quando o botão de próxima página for gravado ou selecionado no modo marcar (`mark_next_page`), o compilador acopla a estrutura `pagination` dentro do nó `LOOP`:
     `pagination: { next_page_action: { type: "click", anchor: <âncora_próxima> }, max_pages: 10 }`.
3. **Dicionário Canônico de Sinônimos**:
   - Dicionário estático de termos em português e inglês mapeando rótulos para o enum `CanonicalField` (`student_name`, `student_id`, `attendance_status`, `grade_value`, `term_period`).

---

## 8. Camada de LLM Opcional e Restrita

A camada de LLM é um componente auxiliar de enriquecimento semântico. **O compilador funciona 100% sem LLM.**

1. **Schema Fechado (`CompilerSuggestion`)**:
   - O LLM pode sugerir exclusivamente:
     * Rótulos e descrições pedagógicas amigáveis em português (`label`, `description`).
     * Sugestão de mapeamento de campo canônico dentre o enum fixo.
     * Seleção do **índice preferido** dentre os candidatos de âncora **já gerados pelo DomDriver** (ex.: `preferredCandidateIndex: 0`).
   - **Proibições Absolutas**: O LLM **nunca** cria seletores CSS/XPath, nunca escreve textos de âncora, nunca adiciona nós, nunca define hosts e nunca altera valores.
2. **Defesa contra Prompt Injection**:
   - O prompt é alimentado estritamente com o **Trace Anonimizado** (zero PII).
   - Textos extraídos de páginas são encapsulados em blocos de dados XML delimitados com instrução estrita ao modelo de que são dados opacos e nunca diretivas executáveis.
   - Qualquer saída que viole o schema fechado do Zod é automaticamente rejeitada.
3. **Clientes de LLM**:
   - `ManualClient`: Exibe o prompt para a professora/auditor copiar e um campo para colar a resposta JSON.
   - `OllamaClient`: Conexão local em `http://localhost:11434` (sob permissão opcional explícita).

---

## 9. Replay de Verificação (Dry-Run Pós-Gravação)

Antes de salvar qualquer mapa gravado, a interface oferece o botão **"Verificar Replay"**.

- O replay executa o grafo recém-compilado em modo `dryRun: true` usando o próprio `SkillGraphRunner` da Fase 2 sobre a página atual.
- **Critério de Conformidade do Replay**:
  1. Todos os nós atingem status `completed` (verde).
  2. A linha de aluno selecionada na gravação é localizada com sucesso via `RowScope`.
  3. O valor que seria escrito coincide exatamente com o valor parametrizado.
  4. Nenhuma mutação real ocorre no DOM.

---

## 10. Tabela de Códigos de Erro do Compilador

| Código | Descrição |
| :--- | :--- |
| `E_TRACE_INVALID` | O trace fornecido viola o schema Zod `TraceSchema`. |
| `E_TRACE_TOO_LARGE` | O trace excedeu os limites de 500 passos ou 2 MB. |
| `E_DECISION_REQUIRED` | Decisões obrigatórias da professora (polaridade, escala, chave) não foram confirmadas. |
| `E_NO_TABLE_MARKED` | Grafo de lote requer marcação de tabela, mas nenhuma foi identificada. |
| `E_NO_WRITE_STEP` | Grafo classificado como escrita não contém nenhum passo de mutação. |
| `E_ANCHOR_UNSTABLE` | Nenhuma das âncoras candidatas do elemento alvo possui estabilidade suficiente. |
| `E_UNSUPPORTED_PATTERN` | O padrão de navegação ou iteração gravado não é representável no SkillGraph v2. |
| `E_COMPILED_GRAPH_INVALID` | O grafo gerado falhou na validação estática do `validateGraph` (bug do compilador). |
| `E_PII_SCRUB_FAILED` | A varredura de scrub encontrou vazamento de string do `PiiRegistry` no JSON gerado. |

---

## 11. BLOQUEIO DE CONTRATO (Filtros de Turma em Grafos Read-Only)

### 11.1 Análise da Pergunta Crítica
Conforme auditado em `lib/contracts/skillgraph/validate.ts`:
- Linha 199–201: `graph.safety.side_effect_level === 'read'` rejeita qualquer nó `WRITE`, `UPLOAD` ou `CLICK` com `is_submit_action: true` (`E_READONLY_VIOLATION`).
- Linha 296–301: todo nó `WRITE` exige `CHECKPOINT` mandatório (`E_WRITE_WITHOUT_CHECKPOINT`).
- **Problema**: Se a professora grava uma ação de leitura (`read_roster`) e seleciona uma turma através de um `<select>` ou input de busca, essa seleção é uma escrita (`WRITE`). O validador atual proíbe `WRITE` em grafos de leitura e exige um modal de confirmação humana (checkpoint), o que degrada a experiência de leitura automática.

### 11.2 Opções de Solução

#### Opção A (Recomendada): Filtro via `NAVIGATE.query` Parametrizada ou Abas Clicáveis
- **Mecanismo**:
  1. **Se a seleção de turma alterar a URL (ex.: `portal/alunos?turma=8A`)**: O compilador detecta dois passos consecutivos no trace (um `select`/`click` no filtro seguido de `navigate` com query alterada). Em vez de emitir um nó `WRITE`, o compilador emite um nó `NAVIGATE` direto para a URL da turma com o parâmetro `query` mapeado (`{ param: "turma" }`).
  2. **Se a seleção de turma for por abas/botões visíveis (ex.: abas "8A", "8B")**: O compilador emite um nó `CLICK` com `is_submit_action: false` e âncora parametrizada (`TextSpec` com `{ param: "turma" }`).
- **Prós**: Funciona **imediatamente com o contrato v2.0 congelado** (`skillgraph-v2.0-frozen`), sem alterar nenhum schema nem o validador. Mantém a garantia inegociável de que `WRITE` só existe atrás de `CHECKPOINT`.
- **Contras**: Cobre apenas portais que refletem filtros na URL ou que usam componentes clicáveis (abas/menus).

#### Opção B: Filtro em Dropdown sem Alteração de URL tratado como `side_effect_level: "write"`
- **Mecanismo**: Se o portal usa um `<select>` puro de turma que não altera a URL nem possui abas, o compilador classifica o grafo como `side_effect_level: "write"` e insere um nó `CHECKPOINT` prévio onde a professora autoriza a seleção da turma antes da leitura.
- **Prós**: Respeita 100% o contrato congelado sem alteração.
- **Contras**: A professora precisará aprovar um checkpoint mesmo para uma ação de leitura de alunos.

#### Opção C (Evolução para v2.1): Criação do Nó `FILTER_SELECT`
- **Mecanismo**: Introduzir na especificação v2.1 um nó declarativo `FILTER_SELECT` exclusivo para seleção de opções de filtro em formulários de consulta, isento de `CHECKPOINT` por não causar mutação de dados persistentes.
- **Prós**: Solução ideal para longo prazo.
- **Contras**: Exige alteração do contrato congelado, proibida na Fase 3.

### 11.3 Recomendação
**Adotar a Opção A como padrão principal do compilador** (filtro via `NAVIGATE.query` quando refletido na URL, e via `CLICK` com `TextSpec` em abas de turma). Para casos residuais da Opção B (dropdowns que não alteram URL), o compilador emite o grafo com `CHECKPOINT` explicativo ou marca para revisão humana.

---

## 12. Layout de Módulos e Arquivos da Fase 3

### 12.1 `lib/recorder/` (Núcleo do Trace & PII - Puro, sem DOM)
- `traceSchema.ts`: Schemas Zod de `TraceStep`, `ElementDescriptor`, `Trace`.
- `sensitiveRules.ts`: Predicado puro de detecção de campos protegidos (`password`, tokens, senhas).
- `registry.ts`: Implementação do `PiiRegistry`.
- `redact.ts`: Funções `redactTrace` e `redactString`.
- `limits.ts`: Constantes de teto (500 passos, 2 MB, 80 chars).

### 12.2 `lib/compiler/` (Compilador Puro - Sem DOM, sem LLM, sem rede)
- `analyze.ts`: Análise e inferência de decisões padrão a partir do trace.
- `decisions.ts`: Schema Zod das decisões confirmadas pela professora.
- `compile.ts`: Ponto de entrada do pipeline de compilação determinística.
- `stages/`:
  - `segment.ts`: Segmentação dos passos do trace.
  - `parametrize.ts`: Substituição de literais por parâmetros simbólicos.
  - `anchors.ts`: Montagem e pontuação das âncoras candidatas.
  - `fingerprint.ts`: Geração de fingerprints de página a partir de digests anonimizados.
  - `waits.ts`: Inferência de nós `WAIT` por settled delta.
  - `safety.ts`: Injeção de checkpoints, rate limits e allowed hosts.
  - `assemble.ts`: Montagem final da árvore de nós.
- `synonyms.ts`: Dicionário estático de sinônimos de campos canônicos.
- `scrub.ts`: Varredura final anti-PII sobre todas as strings do grafo.
- `report.ts`: Relatório detalhado de compilação (avisos e erros).

### 12.3 `lib/compiler/llm/` (Camada LLM Opcional)
- `suggestionSchema.ts`: Schema fechado de sugestões (`CompilerSuggestion`).
- `prompt.ts`: Gerador de prompts seguros com dados anonimizados.
- `apply.ts`: Aplicação segura de sugestões sobre as decisões da professora.
- `client.ts`: Interface `LlmClient`.
- `manualClient.ts`: Cliente de cópia e cola.
- `ollamaClient.ts`: Cliente HTTP local (`localhost:11434`).

### 12.4 `lib/recorder-dom/` (Gravador Injetado sobre Document)
- `elementDescriptor.ts`: Extração de atributos e invariante de ida e volta de âncoras.
- `anchorCandidates.ts`: Gerador de candidatos de âncora usando `lib/runner-dom`.
- `digest.ts`: Extração leve de `PageDigest`.
- `settle.ts`: Observador de estabilidade com `MutationObserver`.
- `overlay.ts`: Barra visual de gravação e modo marcar em Shadow DOM fechado.
- `pickMode.ts`: Captura em modo de marcação com `stopPropagation`.
- `recorderCore.ts`: Listeners em capture phase com agregação no blur/change.

### 12.5 `lib/repositories/` (Tarefa T3.8b - Armazenamento de Grafos)
- `ChromeStorageSkillGraphRepository.ts`: Implementação sobre `chrome.storage.local`.
- `MemorySkillGraphRepository.ts`: Implementação em memória para o harness e testes.

### 12.6 `tools/runner-harness/` e Traces Dourados
- `tools/runner-harness/reviewView.ts`: UI compartilhada de revisão do trace e decisões.
- `traces/golden/`: Traces manuais com canários:
  - `read_roster.trace.json`, `lancar_falta.trace.json`, `lancar_nota.trace.json`, `login.trace.json`.
- `__tests__/compiler.core.test.ts`: Suíte de testes determinísticos do compilador.
