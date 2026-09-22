# Adendo Técnico de Engenharia: Memory Engine — Fase 5.1 (Hardening)
**Sistema:** Rafinha / Teacher AI  
**Módulo:** Memory Engine — Hardening de Reranking, Parametrização Temporal, Restrições de Tarefa e Benchmarks de Precisão  
**Versão:** 5.1.0  
**Autor:** Equipe de Arquitetura de Sistemas de Agentes (Google Antigravity / Teacher AI)  
**Status:** Aprovado para Implementação  
**Documento Base:** [`docs/MEMORY_ENGINE_PHASE5_SPEC.md`](file:///c:/Users/lucas/Documents/antigravity/blissful-pasteur/teacher-ai-app/docs/MEMORY_ENGINE_PHASE5_SPEC.md)

---

## 1. Correção do Estouro de Teto do Score com Bônus de Tarefa

### 1.1 O Problema
Na fórmula original da Fase 5:
$$\text{Score}_{\text{raw}} = \alpha \cdot S_{\text{sem}} + \beta \cdot R(d,t) + \gamma \cdot I(d) + \delta \cdot F(d) + \omega_{\text{task}}(d)$$
Com os coeficientes base somando $1.00$ ($\alpha=0.40, \beta=0.25, \gamma=0.20, \delta=0.15$), quando um candidato obtém pontuação base alta (ex: $0.92$) e recebe o bônus aditivo de alinhamento de tarefa $\omega_{\text{task}} = 0.15$, a pontuação resultante atinge **$1.07$**, ultrapassando o intervalo canônico $[0, 1]$.

**Impactos no Sistema Atual:**
1. **Filtros de Limiar Absoluto:** Em `lib/hybridRetriever.ts:202` (`ranked.filter(n => n.finalScore >= threshold)`), onde `threshold = 0.25`, nós com bônus de tarefa passam a distorcer a escala de relevância relativa.
2. **Exibição na Interface:** Na UI do professor, métricas normalizadas de confiança/aderência (`Math.round(score * 100)%`) exibiriam valores absurdos como $107\%$ ou $115\%$.
3. **Impossibilidade de Reranking Cascata:** Impede que outros motores (ex: Cross-Encoders ou LLM rerankers) utilizem o score como probabilidade a priori.

### 1.2 Decisão de Design: Partição Dinâmica de Unidade com Clamping Defensivo
Adotamos a **Partição Dinâmica de Unidade** (*Dynamic Weight Partition*): o bônus de tarefa deixa de ser um termo externo descontrolado e passa a fazer parte da partição formal de pesos com soma $1.00$.

- **Cenário A: Tarefa Ativa com Bônus Aplicável ($\omega_{\text{task}} = 0.15$):**
  Os pesos base são reescalonados para reservar $0.15$ à tarefa:
  $$\alpha = 0.35, \quad \beta = 0.20, \quad \gamma = 0.15, \quad \delta = 0.15, \quad \omega_{\text{task}} = 0.15$$
  $$\sum = 0.35 + 0.20 + 0.15 + 0.15 + 0.15 = \mathbf{1.000}$$

- **Cenário B: Sem Tarefa Ativa ou Fato sem Vínculo de Tarefa ($\omega_{\text{task}} = 0.00$):**
  Os pesos operam na partição padrão:
  $$\alpha = 0.40, \quad \beta = 0.25, \quad \gamma = 0.20, \quad \delta = 0.15, \quad \omega_{\text{task}} = 0.00$$
  $$\sum = 0.40 + 0.25 + 0.20 + 0.15 = \mathbf{1.000}$$

- **Guarda Defensiva:** Aplicação obrigatória de corte no intervalo fechado:
  $$\text{Score}_{\text{final}} = \min(1.0, \max(0.0, \text{Score}))$$

### 1.3 Pseudocódigo Atualizado em `lib/hybridRetriever.ts`

```typescript
export function computeCompositeScore(
  sim: number,
  recency: number,
  importance: number,
  frequency: number,
  hasTaskMatch: boolean
): number {
  // Partição Dinâmica com garantia estrita de teto 1.00
  let alpha: number, beta: number, gamma: number, delta: number, omega: number

  if (hasTaskMatch) {
    alpha = 0.35 // Similaridade semântica
    beta  = 0.20 // Recência
    gamma = 0.15 // Importância intrínseca
    delta = 0.15 // Frequência amortecida
    omega = 0.15 // Bônus de tarefa
  } else {
    alpha = 0.40
    beta  = 0.25
    gamma = 0.20
    delta = 0.15
    omega = 0.00
  }

  const rawScore = (alpha * sim) + (beta * recency) + (gamma * importance) + (delta * frequency) + omega
  // Clamping defensivo
  return Number(Math.min(1.0, Math.max(0.0, rawScore)).toFixed(4))
}
```

---

## 2. Parametrização de $\tau_{1/2}$ por Categoria no Reranker

### 2.1 O Problema
Na Fase 5, a função `rerankRetrievedNodes` utilizava `Math.LN2 / 14` fixo para todos os nós. Essa simplificação tratava igualmente entidades com ciclos de vida ontologicamente discrepantes:
- Um compromisso de *"Comprar cartolina até amanhã"* decaía na mesma velocidade que um diagnóstico de TDAH de um aluno ou uma diretriz da BNCC.

### 2.2 Decisão de Design: Tabela de Meia-Vida Pedagógica por Classe de Decaimento

A taxa de decaimento $\lambda = \frac{\ln(2)}{\tau_{1/2}}$ é resolvida dinamicamente com base na categoria semântica do nó:

| Categoria / Tipo de Memória | $\tau_{1/2}$ (Dias) | Taxa $\lambda$ (dia$^{-1}$) | Justificativa Pedagógica do Domínio Escolar |
| :--- | :---: | :---: | :--- |
| **`task`** (Compromissos e Prazos) | **3** | $0.23105$ | Prazos perdem urgência após 3 a 5 dias da expiração. |
| **`student_fact`** / **Dossiê do Aluno** | **45** | $0.01540$ | **1 Bimestre Letivo:** Dificuldades observadas em provas orais ou escritas devem permanecer ativas durante o ciclo bimestral inteiro, sendo reavaliadas no fechamento de notas. |
| **`teacher_preference`** / **`teaching_style`** | **30** | $0.02310$ | Preferências individuais de ensino são estáveis, mas admitem calibrações mensais. |
| **`communication_rule`** | **30** | $0.02310$ | Diretrizes de tom e formato com famílias e turmas. |
| **`procedural`** (Rotinas Operacionais) | **90** | $0.00770$ | **1 Semestre Letivo:** Rotinas de estruturação de provas e rubricas duram o semestre letivo. |
| **`school_policy`** (Regras Institucionais) | **180** | $0.00385$ | **1 Ano Letivo:** Políticas da diretoria (frequência mínima, critérios de recuperação) só se alteram no ano letivo seguinte. |

### 2.3 Pseudocódigo Atualizado

```typescript
export const CATEGORY_HALF_LIVES_DAYS: Record<string, number> = {
  task: 3,
  student_fact: 45,
  teacher_preference: 30,
  teaching_style: 30,
  communication_rule: 30,
  grading_rigor: 45,
  procedural: 90,
  school_policy: 180,
  default: 21,
}

export function resolveCategoryLambda(category?: string): number {
  const halfLife = CATEGORY_HALF_LIVES_DAYS[category || ''] || CATEGORY_HALF_LIVES_DAYS.default
  return Math.LN2 / halfLife
}

export function calculateDynamicRecency(
  lastAccessedIso?: string,
  createdIso?: string,
  category?: string,
  referenceDate: Date = new Date()
): number {
  const dateStr = lastAccessedIso || createdIso
  if (!dateStr) return 0.5
  const timestamp = new Date(dateStr).getTime()
  if (isNaN(timestamp)) return 0.5

  const diffDays = Math.max(0, (referenceDate.getTime() - timestamp) / (1000 * 3600 * 24))
  const lambda = resolveCategoryLambda(category)
  return Math.exp(-lambda * diffDays)
}
```

---

## 3. Adição de Métrica de Precisão ao Golden Dataset (Precision@K)

### 3.1 O Problema
Um benchmark que avalia apenas $\text{Recall} \ge 95\%$ e ausência de itens proibidos (`forbiddenIncludeIds`) é vulnerável à saturação de contexto: o retriever poderia retornar $K=50$ nós indiscriminadamente, incluindo os esperados por pura exaustão, mas inundando o prompt com tokens irrelevantes.

### 3.2 Decisão de Design: Schema Estendido & Métrica Precision@K

Estendemos o schema de teste com `topK` esperado e `minPrecisionAtK`:

```typescript
export interface RetrievalTestCase {
  id: string
  scenarioName: string
  query: string
  taskContext?: string
  targetStudentId?: string
  topK: number                   // <- NOVO: Limite estrito de corte
  minPrecisionAtK: number        // <- NOVO: Limiar mínimo aceitável (ex: 0.60 a 0.80)
  expectedIncludeIds: string[]   // Obrigatórios
  forbiddenIncludeIds: string[]  // Vazamentos ou regras superseded (Zero Tolerância)
  rationale: string
}
```

### 3.3 Definição Formal da Métrica

Para um teste com conjunto retornado $R_K$ (onde $|R_K| = K$) e conjunto de itens relevantes esperados $E$:

$$\text{Precision}@K = \frac{|R_K \cap E|}{\min(K, |E|)}$$

- Se o caso espera 2 itens ($|E|=2$) e $K=3$, e o retriever devolve os 2 corretos mais 1 irrelevante:
  $$\text{Precision}@3 = \frac{2}{\min(3, 2)} = \frac{2}{2} = 1.00 \quad (\mathbf{100\%})$$
- Se o retriever devolver apenas 1 correto e 2 irrelevantes:
  $$\text{Precision}@3 = \frac{1}{2} = 0.50 \quad (\mathbf{50\%}) \implies \text{FALHA se } \text{minPrecision} = 0.70$$

### 3.4 Calibração nos Cenários Críticos (TC-05 e TC-06)

| ID | Cenário | $K$ | `expectedIncludeIds` | `forbiddenIncludeIds` | `minPrecisionAtK` | Condição de Falha de Precisão |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| **TC-05** | Regras Conflitantes de Horário | **2** | `['fact_late_conflict_a', 'fact_late_conflict_b']` | `[]` | **1.00** | Falha se o Top-2 contiver qualquer nó alheio aos dois fatos conflitantes. |
| **TC-06** | Efeito de Recência (Critérios da Prova) | **3** | `['fact_exam_yesterday', 'fact_exam_rubric_active']` | `['fact_exam_six_months_ago']` | **0.66** | Falha se o fato de 6 meses atrás aparecer no Top-3 ou se menos de 2 fatos úteis forem retornados. |

**Critério de Aceite no CI:**
- $\text{Recall} \ge 95\%$
- $\text{Precision}@K \ge 70\%$ na média global dos 20 casos canônicos
- $0\%$ em `forbiddenIncludeIds` (quebra de build instantânea)

---

## 4. Constraint Formal para `taskBinding`

### 4.1 O Problema
`taskBinding` como `VARCHAR(64)` despadronizado gera erros silenciosos causados por divergências tipográficas (`'omni_grader'`, `'omnigrader'`, `'grading'`).

### 4.2 Decisão de Design: Enum Fechado & Migration com Sanitização Segura

Definimos a lista exata dos módulos operacionais do ecossistema Teacher AI:

```typescript
export const VALID_TASK_BINDINGS = [
  'omnigrader',        // Correção de redações e tarefas escritas
  'exam_generator',     // Elaboração de provas e testes
  'lesson_planner',     // LessonStudio e planos de aula
  'gradebook',          // Fechamento de notas e boletins
  'attendance',         // Frequência e diário de classe
  'parent_comms',       // Mensagens para pais e responsáveis
  'didactic_sequence',  // Unidades e progressão curricular
  'qbank',              // Banco de questões
  'portfolio',          // Evidências de aprendizagem por aluno
  'mindmap',            // Mapas conceituais
  'general'             // Tarefas genéricas / transversais
] as const

export type TaskBindingModule = typeof VALID_TASK_BINDINGS[number]
```

### 4.3 Migration Segura de Dados (`supabase/migrations/20260923_task_binding_enum.sql`)

```sql
-- 1. Criação do Tipo Enum
CREATE TYPE task_binding_module AS ENUM (
  'omnigrader',
  'exam_generator',
  'lesson_planner',
  'gradebook',
  'attendance',
  'parent_comms',
  'didactic_sequence',
  'qbank',
  'portfolio',
  'mindmap',
  'general'
);

-- 2. Sanitização e Normalização Prévia dos Dados Legados
UPDATE public.agent_semantic_memories
SET task_binding = CASE
  WHEN task_binding ILIKE '%omni%' OR task_binding ILIKE '%grade%' THEN 'omnigrader'
  WHEN task_binding ILIKE '%exam%' OR task_binding ILIKE '%prova%' THEN 'exam_generator'
  WHEN task_binding ILIKE '%plan%' OR task_binding ILIKE '%aula%' THEN 'lesson_planner'
  WHEN task_binding ILIKE '%chamada%' OR task_binding ILIKE '%falta%' THEN 'attendance'
  WHEN task_binding ILIKE '%pai%' OR task_binding ILIKE '%parent%' THEN 'parent_comms'
  ELSE 'general'
END
WHERE task_binding IS NOT NULL AND task_binding NOT IN (
  'omnigrader', 'exam_generator', 'lesson_planner', 'gradebook',
  'attendance', 'parent_comms', 'didactic_sequence', 'qbank',
  'portfolio', 'mindmap', 'general'
);

-- 3. Aplicação Segura da Constraint com Casting Explícito
ALTER TABLE public.agent_semantic_memories
  ALTER COLUMN task_binding TYPE task_binding_module
  USING (task_binding::task_binding_module);
```

### 4.4 Validação Defensiva no Código da Aplicação

```typescript
export function sanitizeTaskBinding(raw?: string | null): TaskBindingModule | null {
  if (!raw) return null
  const normalized = raw.toLowerCase().trim()
  if (VALID_TASK_BINDINGS.includes(normalized as TaskBindingModule)) {
    return normalized as TaskBindingModule
  }
  console.warn(`[TaskBinding] Binding inválido ignorado: "${raw}". Mapeado para null.`)
  return null
}
```

---

## 5. Janela Temporal para Convergência de Memória Procedural

### 5.1 O Problema
A regra de *"sintetizar procedural se repetições $\ge 3$"* sem barreira temporal cria falsas convenções: três ações idênticas espalhadas em 8 meses representam coincidências esparsas, não uma rotina ativa e deliberada da professora.

### 5.2 Decisão de Design: Janela Deslizante de 60 Dias com Ledger de Ocorrências

- **Janela de Validade ($W_{\text{proc}}$):** **60 dias** (correspondente à duração de um bimestre escolar).
- **Regra de Poda de Ocorrências:**
  O sistema mantém para cada candidato a padrão procedural um vetor de ocorrências:
  $$\text{Occurrences} = [t_1, t_2, \dots, t_k]$$
  Durante a Dream Phase, antes de avaliar o limiar:
  $$\text{ValidOccurrences} = \{ t \in \text{Occurrences} \mid (\text{Now} - t) \le 60\text{ dias} \}$$
  - Se $|\text{ValidOccurrences}| \ge 3 \implies$ **Sintetiza nó `procedural`** na categoria formal.
  - Se $|\text{ValidOccurrences}| < 3 \implies$ **Mantém apenas as ocorrências válidas** no ledger e descarta as com idade $> 60\text{ dias}$.

### 5.3 Schema do Ledger de Convergência (`procedural_candidates_ledger`)

```sql
CREATE TABLE IF NOT EXISTS public.agent_procedural_candidates (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_pattern_signature VARCHAR(128) NOT NULL, -- ex: "exam_build__mcq_before_essay"
  task_binding task_binding_module NOT NULL,
  occurrence_timestamps TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
  candidate_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proc_candidates_user_sig 
  ON public.agent_procedural_candidates(user_id, action_pattern_signature);
```

### 5.4 Pseudocódigo da Síntese em `lib/memoryConsolidation.ts`

```typescript
export function evaluateProceduralConvergence(
  candidate: {
    signature: string
    taskBinding: TaskBindingModule
    summary: string
    timestamps: string[]
  },
  now: Date = new Date(),
  slidingWindowDays = 60
): { shouldSynthesize: boolean; validTimestamps: string[] } {
  const windowMs = slidingWindowDays * 24 * 3600 * 1000
  const nowMs = now.getTime()

  // Filtra ocorrências que caem dentro da janela deslizante
  const validTimestamps = candidate.timestamps.filter(iso => {
    const t = new Date(iso).getTime()
    return (nowMs - t) >= 0 && (nowMs - t) <= windowMs
  })

  return {
    shouldSynthesize: validTimestamps.length >= 3,
    validTimestamps
  }
}
```

---

## 6. Matriz de Resumo das Modificações (Fase 5.1)

| Ponto | Componente / Arquivo Afetado | Tipo de Mudança | Risco de Regressão | Estratégia de Mitigação |
| :--- | :--- | :---: | :---: | :--- |
| **1. Teto do Score** | `lib/hybridRetriever.ts` | **Lógica** | **Baixo** | Partição de unidade matemática soma $1.00$; clamping defensivo garante limite estrito. |
| **2. Parametrização $\tau_{1/2}$** | `lib/hybridRetriever.ts` | **Lógica** | **Baixo** | Dicionário de meia-vida com fallback defensivo para 21 dias se categoria desconhecida. |
| **3. Métrica Precision@K** | `__tests__/retrievalBenchmark.test.ts` | **Testes (CI)** | **Zero** | Não altera código em produção; adiciona asserção estrita nos testes de retrieval. |
| **4. Constraint `taskBinding`** | `supabase/migrations/` e `lib/agentTools.ts` | **Schema / Lógica** | **Médio** | Migration com sanitização de legado e casting explícito; validador com fallback `null`. |
| **5. Janela de 60d Procedural** | `lib/memoryConsolidation.ts` | **Lógica / Schema** | **Baixo** | Ledger isolado para candidatos em avaliação; compactado e truncado após consolidação. |

---

## 7. Status e Validação

Todas as alterações da **Fase 5.1** foram desenhadas para preservar integralmente a cobertura de testes no repositório, fortalecendo a robustez do motor sob condições de alta carga e evitando degradação de performance semântica ao longo dos semestres letivos.

---

## 8. Refinamentos Técnicos & Considerações Operacionais (Auditoria de Engenharia)

### 8.1 Incomparabilidade Transversal de Scores (Cross-Query Incomparability)
A Partição Dinâmica de Unidade altera a distribuição ponderada do score conforme `hasTaskMatch` varia:
- **Com Task Match Ativo:** $\text{Score} = 0.35 S_{\text{sem}} + 0.20 S_{\text{rec}} + 0.15 S_{\text{imp}} + 0.15 S_{\text{freq}} + 0.15(1.0)$
- **Sem Task Match Ativo:** $\text{Score} = 0.40 S_{\text{sem}} + 0.25 S_{\text{rec}} + 0.20 S_{\text{imp}} + 0.15 S_{\text{freq}} + 0.00(1.0)$

> [!WARNING]
> **Escopo Restrito a Ranqueamento Intra-Query:**
> O score resultante é matematicamente consistente e monótono para ordenar candidatos **dentro da mesma consulta**. No entanto, ele **NUNCA deve ser comparado transversalmente entre consultas distintas** (ex.: ordenar fatos globais em um dashboard analítico do tipo "fatos mais relevantes de todo o sistema"). Fatos idênticos avaliados em consultas com contextos de tarefas distintos produzirão magnitudes numéricas em escalas diferentes.

### 8.2 Ortogonalidade entre Categoria (`category`) e Vínculo de Tarefa (`taskBinding`)
A arquitetura do Memory Engine desacopla explicitamente a natureza do conhecimento da sua aplicação situacional:
1. **Eixo Temporal Intrínseco (`category`):** Governa exclusivamente a meia-vida do esquecimento ($\tau_{1/2}$) via `resolveCategoryLambda(category, scope)` no modelo de decaimento contínuo de Ebbinghaus.
2. **Eixo Situacional de Execução (`taskBinding`):** Governa o bônus de ativação imediata ($\omega_{\text{task}} = 0.15$) apenas quando a professora está operando no módulo correspondente.

Ambos os eixos operam de forma ortogonal: uma diretriz pode ter categoria `procedural` ($\tau_{1/2} = 90\text{ dias}$) e estar vinculada ao módulo `omnigrader`. Quando a professora estiver corrigindo redações, ela recebe tanto a preservação semestral quanto o impulso de tarefa simultaneamente.

### 8.3 Espaço Amostral Discreto de $\text{Precision}@K$
Para instâncias pequenas de avaliação no benchmark de retrieval, a métrica:
$$\text{Precision}@K = \frac{|R_K \cap E|}{\min(K, |E|)}$$
opera sobre um **espaço amostral estritamente discreto**, pois a cardinalidade da interseção $|R_K \cap E|$ é um número natural $m \in \{0, 1, \dots, \min(K, |E|)\}$.

- Para $\min(K, |E|) = 1 \implies \text{Precision}@K \in \{0.00, 1.00\}$
- Para $\min(K, |E|) = 2 \implies \text{Precision}@K \in \{0.00, 0.50, 1.00\}$
- Para $\min(K, |E|) = 3 \implies \text{Precision}@K \in \{0.00, 0.33, 0.67, 1.00\}$

Portanto, pisos nominais contínuos arbitrários (como $0.66$ para $\min=2$) na prática correspondem a exigir $2/2 = 1.00$ ($100\%$ de recall). O benchmark no CI adota asserção de piso individual $\ge 0.50$ para assegurar que cada cenário obrigatório atinja no mínimo match parcial aprovado.

### 8.4 Média Micro-Ponderada contra Mascaramento Estatístico
Para evitar que consultas com grande número de itens esperados e precisão perfeita mascarem falhas em consultas binárias mais críticas (ou vice-versa), o CI avalia duas métricas agregadas complementares:
1. **Macro-Média:** $\text{MacroPrecision} = \frac{1}{N} \sum_{i=1}^N \text{Precision}_i@K$ (peso uniforme por cenário).
2. **Micro-Média Ponderada:** $\text{MicroPrecision} = \frac{\sum_{i=1}^N |R_{K, i} \cap E_i|}{\sum_{i=1}^N \min(K_i, |E_i|)}$ (ponderada pelo volume real de oportunidades de recuperação).

Ambas devem atingir $\ge 70\%$, com tolerância zero ($0\%$) de violações em `forbiddenIncludeIds`.

