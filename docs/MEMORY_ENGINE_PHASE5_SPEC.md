# Especificação Técnica de Engenharia: Memory Engine — Fase 5
**Sistema:** Rafinha / Teacher AI  
**Módulo:** Memory Engine (Recuperação Multicritério, Grounding, Working Memory, Memória Procedural e Testes de Retrieval)  
**Versão:** 5.0.0  
**Autor:** Equipe de Arquitetura de Sistemas de Agentes (Google Antigravity / Teacher AI)  
**Status:** Pronto para Implementação  
**Dependências Anteriores:** Fases 1 a 4 Concluídas (Commits `ec1a5df`, `a3bc964`, `f0ad33f`, `6f9726a`)

---

## 1. Visão Geral e Objetivos da Fase 5

Após a consolidação das Fases 1 a 4 (Fundação de Tarefas, RAG Híbrido Semântico, Resolução de Conflitos/Superseding e Consolidação Noturna "Dream Phase"), a **Fase 5** encerra o ciclo de maturação do Memory Engine, sanando cinco lacunas operacionais críticas:

1. **Ranking Explícito Multicritério:** Substituição de heurísticas puras de similaridade por um score composto calibrado $(\alpha, \beta, \gamma, \delta)$ com decaimento temporal em tempo de busca (*retrieval-time decay*).
2. **Camada de Grounding e Proveniência:** Anexação formal de metadados de origem (`source_type`, `source_ref`, `confidence`) aos nós recuperados, estabelecendo regras de checagem para evitar alucinações e citar fontes quando necessário.
3. **Working Memory Desacoplada:** Isolamento da memória de curto prazo (últimos $N$ turnos) em relação ao índice vetorial de longo prazo, com transição assíncrona por evicção para o extrator episódico.
4. **Memória Procedural Formal:** Reconhecimento de rotinas operacionais (*"como fazer"*) como categoria de primeira classe, sintetizadas na Dream Phase e priorizadas dinamicamente pelo tipo de tarefa.
5. **Suíte de Regressão de Retrieval (Golden Dataset):** Mecanismo determinístico de validação contínua (CI) com fixtures fixas para certificar precisão e prevenir vazamento de dados entre alunos.

---

## 2. Alterações Incrementais no Schema de Dados

As modificações no schema estendem as tabelas criadas na Fase 2 (`supabase/migrations/20260922_memory_engine_fase2.sql`) e os tipos TypeScript (`lib/longTermMemory.ts`), sem descartar ou quebrar os dados preexistentes.

### 2.1 Migration SQL Incremental (`supabase/migrations/20260923_memory_engine_fase5.sql`)

```sql
-- ==============================================================================
-- Migration: 20260923_memory_engine_fase5.sql
-- Fase 5: Métricas de Recuperação, Proveniência e Categoria Procedural
-- ==============================================================================

-- 1. Extensão do Enum de Categorias para incluir 'procedural'
ALTER TYPE memory_category ADD VALUE IF NOT EXISTS 'procedural';

-- 2. Adição de métricas de telemetria de recuperação e proveniência na tabela principal
ALTER TABLE public.agent_semantic_memories
  ADD COLUMN IF NOT EXISTS access_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) NOT NULL DEFAULT 'explicit_statement',
  ADD COLUMN IF NOT EXISTS source_ref VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS task_binding VARCHAR(64) DEFAULT NULL;

-- 3. Índices para Otimização de Reranking e Poda
CREATE INDEX IF NOT EXISTS idx_memories_access_metrics 
  ON public.agent_semantic_memories(user_id, access_count, last_accessed_at);

CREATE INDEX IF NOT EXISTS idx_memories_task_binding 
  ON public.agent_semantic_memories(task_binding) WHERE task_binding IS NOT NULL;

-- 4. Função RPC Atualizada para Retornar Metadados de Score e Proveniência
CREATE OR REPLACE FUNCTION match_semantic_memories_v2(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_user_id uuid,
  filter_scope varchar DEFAULT NULL,
  filter_task varchar DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category memory_category,
  content text,
  importance_score float,
  confidence float,
  status memory_status,
  scope memory_scope,
  access_count int,
  last_accessed_at timestamptz,
  created_at timestamptz,
  source_type varchar,
  source_ref varchar,
  task_binding varchar,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.category,
    m.content,
    m.importance_score,
    m.confidence,
    m.status,
    m.scope,
    m.access_count,
    m.last_accessed_at,
    m.created_at,
    m.source_type,
    m.source_ref,
    m.task_binding,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.agent_semantic_memories m
  WHERE m.user_id = filter_user_id
    AND m.status != 'superseded' -- Nunca recupera regras substituídas
    AND (filter_scope IS NULL OR m.scope = filter_scope::memory_scope)
    AND (1 - (m.embedding <=> query_embedding)) >= match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### 2.2 Extensão do Modelo TypeScript (`lib/longTermMemory.ts`)

```typescript
export type MemorySourceType = 
  | 'explicit_statement' // O professor declarou expressamente ("Eu prefiro...")
  | 'inferred'           // A IA inferiu a partir do diálogo ou correções
  | 'consolidated'       // Sintetizado pela Dream Phase (macro-regra)
  | 'student_record'     // Extraído de avaliações, pautas ou logs do portal

export interface LearnedFact {
  id: string
  category: 
    | 'teacher_preference' 
    | 'class_insight' 
    | 'pedagogical_rule' 
    | 'student_fact' 
    | 'school_context' 
    | 'grading_rigor' 
    | 'teaching_style' 
    | 'communication_rule' 
    | 'school_policy' 
    | 'subject_matter' 
    | 'personal_convention'
    | 'procedural' // <- NOVO: Fase 5
  fact: string
  confidence: number
  importanceScore?: number // 0.0 - 1.0
  source: string
  sourceType?: MemorySourceType // <- NOVO: Fase 5
  sourceRef?: string            // <- NOVO: Fase 5 (ex: ID da mensagem original)
  taskBinding?: string          // <- NOVO: Fase 5 (ex: 'omnigrader', 'exam_generator')
  status?: 'ativo' | 'superseded' | 'conflitante'
  previousVersionId?: string
  supersededBy?: string
  conflictDetails?: string
  scope?: 'private' | 'institutional'
  schoolId?: string
  accessCount?: number          // <- NOVO: Contador de injeções no prompt
  lastAccessedAt?: string       // <- NOVO: Timestamp ISO da última evocação
  createdAt: string
  updatedAt: string
}
```

---

## 3. Score Composto de Recuperação (Ranking Explícito)

### 3.1 Fórmula Matemática

Para cada nó de memória $d$ candidato recuperado para a consulta $q$ no instante temporal $t$, o score composto de ordenação final é computado por:

$$\text{Score}(d, q, t) = \alpha \cdot S_{\text{sem}}(d, q) + \beta \cdot R(d, t) + \gamma \cdot I(d) + \delta \cdot F(d) + \omega_{\text{task}}(d)$$

Onde:

1. **$S_{\text{sem}}(d, q) \in [0, 1]$ — Similaridade Semântica Híbrida:**
   Combinação linear da similaridade cosseno densa com a pontuação trigrama/BM25:
   $$S_{\text{sem}}(d, q) = 0.70 \cdot \text{CosineSim}(v_d, v_q) + 0.30 \cdot \text{SparseScore}(d, q)$$

2. **$R(d, t) \in (0, 1]$ — Recência Decaída (Retrieval-Time Decay):**
   Mede a frescura temporal da informação baseando-se no tempo decorrido $\Delta t = t - \max(\text{createdAt}, \text{lastAccessedAt})$ em dias:
   $$R(d, t) = \exp(-\lambda \cdot \Delta t) \quad \text{onde} \quad \lambda = \frac{\ln(2)}{\tau_{1/2}}$$
   *Parâmetro Default:* $\tau_{1/2} = 14 \text{ dias}$ para preferências gerais; $\tau_{1/2} = 3 \text{ dias}$ para compromissos/tarefas.

3. **$I(d) \in [0, 1]$ — Score de Importância Intrínseca:**
   Valor calibrado na ingestão:
   - $1.00$: Regras institucionais rígidas (`school_policy`), acomodações legais (ex: laudos de TDAH/TEA).
   - $0.85$: Critérios de avaliação (`grading_rigor`, `procedural`).
   - $0.70$: Hábitos e preferências de comunicação.
   - $0.50$: Comentários circunstanciais.

4. **$F(d) \in [0, 1]$ — Frequência Normalizada Amortecida:**
   Mede a utilidade empírica acumulada do fato, com compressão logarítmica para evitar que fatos antigos monopólizem o contexto:
   $$F(d) = \frac{\ln(1 + \text{access\_count})}{\ln(1 + N_{\max})} \quad (\text{com } N_{\max} = 50)$$

5. **$\omega_{\text{task}}(d) \in \{0, 0.15\}$ — Bônus de Alinhamento de Tarefa:**
   $+0.15$ se $d.\text{taskBinding} == \text{currentTaskType}$, permitindo que procedimentos operacionais saltem para o topo quando o módulo correspondente estiver ativo.

### 3.2 Pesos Padrão e Calibração

| Coeficiente | Valor Default | Justificativa Pedagógica |
| :--- | :---: | :--- |
| $\alpha$ (Semântica) | **0.40** | Garante relevância tópica direta com o diálogo imediato. |
| $\beta$ (Recência) | **0.25** | Prioriza orientações dadas recentemente na mesma semana. |
| $\gamma$ (Importância) | **0.20** | Protege diretrizes institucionais e critérios pedagógicos estritos. |
| $\delta$ (Frequência) | **0.15** | Valoriza preferências estáveis e rotinas frequentemente evocadas. |
| **Soma Normalizada** | **1.00** | Escala final previsível no intervalo $[0, 1]$. |

### 3.3 Diferença Crucial: Retrieval-Time Decay vs. Consolidation-Time Decay

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              COMPARAÇÃO DOS MOTORES DE DECAY                           │
├───────────────────────────────┬───────────────────────────────┬────────────────────────┤
│ Dimensão                      │ Retrieval-Time Decay (Fase 5) │ Consolidation-Time     │
│                               │                               │ (Dream Phase - Fase 4) │
├───────────────────────────────┼───────────────────────────────┼────────────────────────┤
│ Momento de Execução           │ Durante a busca (síncrono,    │ Noite / Cron / Manual  │
│                               │ sub-5ms em memória)           │ (assíncrono em lote)   │
│ Efeito no Banco de Dados      │ Zero mutação (somente leitura │ Modifica `confidence`, │
│                               │ e ranking em runtime)         │ purga linhas e funde   │
│ Propósito                     │ Reordenar nós no prompt atual │ Limpeza, compressão e  │
│                               │ priorizando eventos frescos   │ controle de tokens     │
│ Meia-vida $(\tau_{1/2})$      │ 7 a 14 dias                   │ 30 a 60 dias           │
└───────────────────────────────┴───────────────────────────────┴────────────────────────┘
```

### 3.4 Exemplo Numérico de Reranking

Considere a consulta da professora: *"Como devo avaliar a redação do 9º Ano?"* ($t = 22/09/2026$).

- **Candidato A (Regra Antiga Frequente):**
  - Conteúdo: *"Redações devem ter rigor moderado"* ($\Delta t = 45 \text{ dias}$, $\text{access\_count} = 30$, $I = 0.70$).
  - $S_{\text{sem}} = 0.82$, $R = e^{-(0.0495 \times 45)} = 0.107$, $I = 0.70$, $F = \ln(31)/\ln(51) = 3.43/3.93 = 0.873$.
  - $\text{Score}_A = (0.40 \times 0.82) + (0.25 \times 0.107) + (0.20 \times 0.70) + (0.15 \times 0.873) = 0.328 + 0.027 + 0.140 + 0.131 = \mathbf{0.626}$.

- **Candidato B (Instrução Recente da Reunião de Ontem):**
  - Conteúdo: *"Na redação do 9º Ano descontar 0.5 por desvio gramatical grave"* ($\Delta t = 1 \text{ dia}$, $\text{access\_count} = 1$, $I = 0.90$).
  - $S_{\text{sem}} = 0.88$, $R = e^{-(0.0495 \times 1)} = 0.952$, $I = 0.90$, $F = \ln(2)/\ln(51) = 0.693/3.93 = 0.176$.
  - $\text{Score}_B = (0.40 \times 0.88) + (0.25 \times 0.952) + (0.20 \times 0.90) + (0.15 \times 0.176) = 0.352 + 0.238 + 0.180 + 0.026 = \mathbf{0.796}$.

**Resultado do Reranking:** O Candidato B vence com folga ($0.796 > 0.626$), garantindo que a orientação mais recente e de maior importância pedagógica guie a resposta, mesmo tendo menor histórico de acessos que o Candidato A.

### 3.5 Pseudocódigo em `lib/hybridRetriever.ts`

```typescript
export interface RankedMemoryNode {
  fact: LearnedFact
  semanticSim: number
  recencyScore: number
  importanceScore: number
  frequencyScore: number
  taskBonus: number
  finalCompositeScore: number
}

export function rerankRetrievedNodes(
  candidates: Array<{ fact: LearnedFact; sim: number }>,
  currentTask: string | null = null,
  referenceDate: Date = new Date()
): RankedMemoryNode[] {
  const ALPHA = 0.40 // Similaridade
  const BETA = 0.25  // Recência
  const GAMMA = 0.20 // Importância
  const DELTA = 0.15 // Frequência
  const HALF_LIFE_DAYS = 14
  const LAMBDA = Math.LN2 / HALF_LIFE_DAYS
  const LOG_MAX_ACCESS = Math.log(51)

  const ranked = candidates.map(item => {
    const f = item.fact
    const lastDate = f.lastAccessedAt ? new Date(f.lastAccessedAt) : new Date(f.createdAt)
    const diffDays = Math.max(0, (referenceDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24))

    const recency = Math.exp(-LAMBDA * diffDays)
    const importance = f.importanceScore ?? (f.confidence || 0.80)
    const frequency = Math.min(1.0, Math.log(1 + (f.accessCount || 0)) / LOG_MAX_ACCESS)
    const taskBonus = (currentTask && f.taskBinding === currentTask) ? 0.15 : 0.0

    const finalScore = Number((
      (ALPHA * item.sim) +
      (BETA * recency) +
      (GAMMA * importance) +
      (DELTA * frequency) +
      taskBonus
    ).toFixed(4))

    return {
      fact: f,
      semanticSim: item.sim,
      recencyScore: recency,
      importanceScore: importance,
      frequencyScore: frequency,
      taskBonus,
      finalCompositeScore: finalScore
    }
  })

  // Ordenação decrescente pelo score composto
  return ranked.sort((a, b) => b.finalCompositeScore - a.finalCompositeScore)
}

/**
 * Incrementa telemetria de injeção atômica
 */
export function recordFactEvocations(factIds: string[]): void {
  if (typeof window === 'undefined' || factIds.length === 0) return
  try {
    const profile = getCuratedTeacherProfile()
    const now = new Date().toISOString()
    const updated = profile.learnedFacts.map(f => {
      if (factIds.includes(f.id)) {
        return {
          ...f,
          accessCount: (f.accessCount || 0) + 1,
          lastAccessedAt: now
        }
      }
      return f
    })
    saveCuratedTeacherProfile({ learnedFacts: updated })
  } catch {}
}
```

---

## 4. Camada de Grounding, Proveniência e Mediação Ativa

### 4.1 Formato de Injeção de Proveniência no Prompt da IA

Para que o modelo distinga fatos empíricos certificados de meras inferências probabilísticas, cada fato é envolvido em uma tag estruturada de metadados antes de ser injetado no prompt:

```xml
<grounded_knowledge>
  <memory_item id="fact_8912" type="procedural" source="explicit_statement" confidence="0.95" updated="2026-09-21">
    A professora exige que todas as avaliações bimestrais contenham gabarito detalhado com critérios de correção ao final.
  </memory_item>
  <memory_item id="dossier_alice_34" type="student_record" source="student_record" confidence="0.88" updated="2026-09-20">
    Alice Bitencourt Baesso: Dificuldade com o uso do Present Perfect vs Simple Past observada na prova oral.
  </memory_item>
  <memory_item id="fact_conflict_12" type="grading_rigor" source="inferred" confidence="0.55" status="conflitante" updated="2026-09-22">
    Regra de arredondamento de notas: Há divergência entre número inteiro e decimal nas diretrizes cadastradas.
  </memory_item>
</grounded_knowledge>
```

### 4.2 Regra de Decisão: Quando Assumir vs. Quando Perguntar (Mediação Ativa)

O fluxo de mediação opera em duas camadas coordenadas:

```
                  ┌──────────────────────────────────────────────┐
                  │        Fato Injetado no Contexto             │
                  └──────────────────────┬───────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
         [confidence < 0.60 OU                     [confidence >= 0.60 E
         status == 'conflitante']                  status == 'ativo']
                    │                                         │
                    ▼                                         ▼
   ┌───────────────────────────────────┐    ┌───────────────────────────────────┐
   │    FILTRO DE MEDIAÇÃO ATIVA       │    │    EXECUÇÃO DETERMINÍSTICA        │
   │ O Agente NÃO assume como verdade. │    │ O Agente aplica a diretriz com    │
   │ Dispara pergunta de alinhamento   │    │ segurança e precisão no material. │
   │ prévia à professora com opções.   │    └───────────────────────────────────┘
   └───────────────────────────────────┘
```

1. **Camada 1 (Pré-Prompt Verifier):**
   Se uma tarefa crítica (ex: gerar prova, lançar nota, emitir parecer formal) requisitar diretrizes que estejam marcadas com `status: 'conflitante'`, o orquestrador interrompe a geração e emite imediatamente o card de clarificação:
   > *"Professora, notei que há duas orientações conflitantes sobre o arredondamento de notas (inteiro vs decimal). Como deseja proceder para esta avaliação?"*

2. **Camada 2 (In-Prompt Guardrail):**
   Instrução rígida no System Prompt da Rafinha:
   > *"Sempre que um `<memory_item>` tiver `source='inferred'` com `confidence < 0.60`, trate-o como hipótese provisória. Use expressões condicionais ('Se você ainda preferir...', 'Costumamos fazer...') e nunca imponha a regra sem validação."*

### 4.3 Política de Citação de Fontes ao Usuário

| Categoria da Memória | Política de Citação na Resposta | Exemplo de Citação |
| :--- | :---: | :--- |
| **Dossiê do Aluno** | **Sempre citar fonte temporal** (essencial para transparência pedagógica e conformidade ética). | *"Com base na avaliação oral de Alice realizada em 14/09..."* |
| **Política Institucional** | **Citar órgão/origem** quando justificar notas ou prazos. | *"De acordo com a diretriz institucional da Escola Principal (mínimo de 75% de presença)..."* |
| **Procedimento Técnico** | **Citar apenas se questionada** pelo professor ("Por que você fez assim?"). | *"Segui o procedimento padrão registrado em suas preferências para provas bimestrais."* |
| **Preferência Pessoal** | **Incorporar silenciosamente** (sem citar metadata, para naturalidade na conversa). | Executa a resposta concisa em tópicos sem dizer *"porque você disse que gosta de tópicos"*. |

---

## 5. Working Memory Explícita e Desacoplada do RAG

### 5.1 Desacoplamento Arquitetural

A Working Memory (Memória de Trabalho) e o RAG Semântico atendem a propósitos cognitivos fundamentalmente distintos:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       PROMPT FINAL DA IA                                        │
├────────────────────────────────┬───────────────────────────────┬────────────────────────────────┤
│      SYSTEM PROMPT & SOUL      │        WORKING MEMORY         │         LONG-TERM RAG          │
│   • Persona da Rafinha         │   • Diálogo imediato          │   • RAG Híbrido Semântico      │
│   • Guardrails & Formatação    │   • Últimos N turnos (exatos) │   • Dossiê do Aluno            │
│   • Calibrações Curadas        │   • ZERO busca vetorial       │   • Memória Procedural         │
│   • Orçamento: ~1.200 tokens   │   • Orçamento: ~2.500 tokens  │   • Orçamento: ~1.500 tokens   │
└────────────────────────────────┴───────────────────────────────┴────────────────────────────────┘
```

- **Working Memory:** Gerenciada em `lib/chatMemory.ts`. Mantém o fio da meada imediato (*short-term context*). Não passa por embedding, busca ou corte semântico.
- **Long-Term Memory:** Gerenciada em `lib/hybridRetriever.ts`. Resgata sabedoria profunda acumulada ao longo de semanas e meses. O `hybridRetriever` **ignora os turnos ativos presentes na Working Memory** para evitar auto-eco (*self-echo hallucination*).

### 5.2 Regra de Transição: Da Working Memory para o Pipeline Episódico

```
  Turno t-11 (Sai da Janela Ativa de 10 Turnos)
                    │
                    ▼
  ┌────────────────────────────────────────────────────────┐
  │   ETAPA 1: Extrator Episódico Assíncrono               │
  │   Analisa se o turno continha:                         │
  │   • Compromissos de data -> `taskMemory`               │
  │   • Correção de preferências -> `semanticResolver`    │
  │   • Observações sobre alunos -> `studentDossier`       │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │   ETAPA 2: Consolidação no Cérebro Persistente        │
  │   Resolução de Conflitos e Indexação Vetorial          │
  └────────────────────────────────────────────────────────┘
```

Quando a conversa atinge $N > 10$ turnos (20 mensagens de ida e volta), os turnos mais antigos são ejetados da janela ativa. Antes do descarte:
1. O texto ejetado é resumido e anexado ao campo `session.summary` (mantendo continuidade tópica).
2. O turno ejetado passa pelo `extractSemanticCandidatesFromDialogue()`. Se contiver regras ou fatos novos, são enviados ao `resolveSemanticCandidate()` (Etapa 2 de escrita).

---

## 6. Memória Procedural como Categoria Formal

### 6.1 Definição e Ciclo de Vida da Memória Procedural

Enquanto a memória semântica armazena **fatos declarativos** (*"Alice tem dificuldade com tempos verbais"*) e a memória de perfil guarda **preferências de tom** (*"Prefiro respostas curtas"*), a **Memória Procedural** armazena **algoritmos e procedimentos práticos de execução** (*"Como confeccionar uma prova Cambridge TKT"*, *"Sequência correta para lançar chamada no portal"*).

### 6.2 Critério de Formação: Convergência de $N \ge 3$ Padrões Episódicos

Um nó procedural nasce de duas formas:
1. **Instrução Explícita de Fluxo:** *"Rafinha, quando for montar provas para o 9º Ano, faça sempre nesta ordem: 1. Warm-up, 2. Reading com 3 questões, 3. Grammar com lacunas, 4. Gabarito comentado."*
2. **Síntese Indutiva na Dream Phase:** Quando o consolidador noturno identifica $\ge 3$ repetições do mesmo fluxo de trabalho executado com sucesso e aprovado pela professora, consolida-os em uma macro-diretriz com rótulo explícito:

```typescript
// Trecho de enriquecimento em lib/memoryConsolidation.ts
if (proceduralActionMatches.length >= 3) {
  const proceduralNode: LearnedFact = {
    id: `proc_${Date.now()}`,
    category: 'procedural', // <- Categoria Formal
    fact: `Procedimento Padrão para Avaliação: ${unifiedWorkflowSteps.join(' -> ')}`,
    confidence: 0.95,
    importanceScore: 0.90,
    source: 'dream_consolidation',
    sourceType: 'consolidated',
    taskBinding: 'exam_generator',
    status: 'ativo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
```

### 6.3 Priorização Dinâmica por Contexto de Tarefa (`taskBinding`)

Ao invocar uma ferramenta ou módulo específico no app (ex: `OmniGrader`, `ExamGenerator`, `ClassroomMode`), o orquestrador passa `currentTask = 'omnigrader'` para o `hybridRetriever`. O motor aplica automaticamente:
- Boost de $+0.15$ no score final dos nós procedurais ligados à tarefa.
- Prioridade de injeção no topo do bloco de contexto sob a seção: `DIRETRIZES PROCEDURAIS ESPECÍFICAS PARA ESTA OPERAÇÃO`.

---

## 7. Suíte de Testes de Regressão de Retrieval (Golden Dataset)

Para garantir que o motor de recuperação nunca degrade a acurácia com o tempo, criamos um framework determinístico de avaliação contínua de retrieval, desacoplado dos testes unitários padrão.

### 7.1 Schema do Dataset de Teste (`RetrievalBenchmarkDataset`)

```typescript
export interface MockFactFixture extends LearnedFact {
  studentId?: string
  studentName?: string
  daysAgo: number
}

export interface RetrievalTestCase {
  id: string
  scenarioName: string
  query: string
  taskContext?: string
  targetStudentId?: string
  expectedIncludeIds: string[]    // OBRIGATÓRIOS: Devem estar presentes no Top-K
  forbiddenIncludeIds: string[]   // TERMINANTEMENTE PROIBIDOS: Vazamento ou regra superseded
  rationale: string
}
```

### 7.2 Conjunto Canônico de 20 Cenários de Regressão Crítica

| ID | Cenário | Consulta ($q$) | Contexto de Tarefa | `expectedIncludeIds` | `forbiddenIncludeIds` | Justificativa |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Isolamento de Aluno (Dossiê) | *"Qual o rendimento recente de Alice Baesso?"* | `student_profile` | `['dossier_alice_baesso']` | `['dossier_bernardo_silva', 'dossier_pedro_costa']` | **Prevenção estrita de vazamento entre alunos.** |
| **TC-02** | Isolamento de Aluno Homônimo | *"Feedback para Lucas Silva"* | `omnigrader` | `['dossier_lucas_silva_9a']` | `['dossier_lucas_mendes_8b']` | Desambiguação de homônimo com classe correta. |
| **TC-03** | Supressão de Regra Substituída | *"Critério de pontuação de redação"* | `grading` | `['fact_grading_active_v2']` | `['fact_grading_superseded_v1']` | **Regra superseded nunca pode ser recuperada.** |
| **TC-04** | Respeito à Revogação de Arredondamento | *"Como devo lançar a nota de 6.7?"* | `gradebook` | `['fact_round_decimal_new']` | `['fact_round_integer_old']` | Prevalece a regra revogada via superseding. |
| **TC-05** | Sinalização de Regra Conflitante | *"Qual a tolerância de horário de entrega?"* | `tasks` | `['fact_late_conflict_a', 'fact_late_conflict_b']` | `[]` | Fatos com conflito devem vir acompanhados de alerta. |
| **TC-06** | Efeito do Score Composto (Recência) | *"Anotações recentes sobre critérios da prova"* | `exam` | `['fact_exam_yesterday']` | `['fact_exam_six_months_ago']` | Fato recente vence fato de 6 meses atrás. |
| **TC-07** | Efeito do Score Composto (Frequência) | *"Qual estilo geral de comunicação adotar?"* | `chat` | `['fact_comm_frequent_30acc']` | `['fact_comm_rare_0acc']` | Hábito consolidado vence nota pontual isolada. |
| **TC-08** | Proteção de Núcleo Duro Institucional | *"Quantas faltas reprovam o aluno?"* | `attendance` | `['fact_inst_presence_75']` | `[]` | Fato institucional antigo nunca sofre decay até zero. |
| **TC-09** | Ativação Procedural em Elaboração de Prova | *"Gerar avaliação bimestral de inglês B1"* | `exam_generator` | `['proc_exam_cambridge_tkt']` | `[]` | Memória procedural ativada pelo bônus de tarefa. |
| **TC-10** | Ativação Procedural em Correção de Textos | *"Corrigir ensaio dissertativo"* | `omnigrader` | `['proc_essay_rubric_4levels']` | `[]` | Procedimento de rubrica ativado pelo OmniGrader. |
| **TC-11** | Chitchat Bypass (Fast-Path Router) | *"Bom dia Rafinha, tudo bem?"* | `chat` | `[]` | `['fact_grading_active_v2', 'dossier_alice_baesso']` | **Nenhum fato pesado deve ser recuperado em saudação.** |
| **TC-12** | Acomodação Específica de Aluno com TEA | *"Orientações para aplicar prova no Daniel"* | `exam` | `['dossier_daniel_tea_accomodation']` | `[]` | Acomodação legal prioritária garantida. |
| **TC-13** | Rigor Avaliativo com Alta Confiança | *"Qual a tolerância para vocabulário informal?"* | `grading` | `['fact_rigor_high_confidence']` | `['fact_rigor_low_confidence_drift']` | Alta confiança vence inferência fraca. |
| **TC-14** | Não Recuperação de Fato Expirado | *"Lembrar de comprar cartolina amarela"* | `tasks` | `[]` | `['fact_task_expired_45days']` | Fato purgado na Dream Phase não reaparece. |
| **TC-15** | Macro-Diretriz Fundida na Dream Phase | *"Como formatar minhas respostas aos pais?"* | `parent_comms` | `['fact_consolidated_parent_style']` | `['fact_frag_parent_1', 'fact_frag_parent_2']` | Macro-regra fundida substitui fragmentos. |
| **TC-16** | Recuperação Transversal por Unidade Temática | *"O que trabalhamos no Simple Past?"* | `lesson_planner` | `['fact_topic_simple_past_unit3']` | `['fact_topic_passive_voice']` | Semântica foca no tópico pedagógico correto. |
| **TC-17** | Orçamento Estrito de Tokens (Corte Limpo) | *"Resumo geral de todas as regras da turma 9A"* | `classes` | `['top_k_items_under_budget']` | `['overflow_items_beyond_budget']` | O retriever corta respeitando `tokenBudget = 1500`. |
| **TC-18** | Reconciliação Cross-School | *"Diretriz de recuperação na Escola Machado"* | `exam` | `['fact_school_machado_recovery']` | `['fact_school_outro_colegio']` | Filtro estrito de escopo por escola ativa. |
| **TC-19** | Tarefa Agendada Próxima | *"O que tenho para corrigir esta semana?"* | `tasks` | `['task_due_tomorrow_grading']` | `['task_completed_last_month']` | Apenas compromissos pendentes relevantes. |
| **TC-20** | Imunização contra Falsas Correspondências | *"Preparar lanche para a excursão"* | `events` | `['fact_event_excursion_lunch']` | `['fact_grading_rigor']` | Nenhuma colisão com regras de notas por mero lexema. |

### 7.3 Critérios de Aprovação no Pipeline de Integração Contínua (CI)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CRITÉRIOS DE ACEITE NO CI                                 │
├────────────────────────────────┬───────────────────────────────┬───────────────────────┤
│ Métrica de Qualidade           │ Limiar Obrigatório            │ Ação em Caso de Falha │
├────────────────────────────────┼───────────────────────────────┼───────────────────────┤
│ **Vazamento de Dados**         │ **100% de Precisão Negativa** │ **Build Quebra**      │
│ (`forbiddenIncludeIds`)        │ Zero tolerância (0 vazamentos)│ (Bloqueio de PR)      │
├────────────────────────────────┼───────────────────────────────┼───────────────────────┤
│ **Recuperação de Obrigatórios**│ **Recall $\ge 95\%$** nas     │ **Build Quebra**      │
│ (`expectedIncludeIds`)         │ consultas de benchmark        │ (Bloqueio de PR)      │
├────────────────────────────────┼───────────────────────────────┼───────────────────────┤
│ **Latência de Recuperação**    │ **$p95 \le 35\text{ms}$**     │ Alerta de Performance │
│ (Reranking de 50 candidatos)   │ no ambiente de execução       │                       │
└────────────────────────────────┴───────────────────────────────┴───────────────────────┘
```

- **Gatilho de Execução:** Disparado a cada Pull Request que modifique:
  - `lib/hybridRetriever.ts`
  - `lib/semanticConflictResolver.ts`
  - `lib/memoryConsolidation.ts`
  - Qualquer constante de ponderação $(\alpha, \beta, \gamma, \delta, \tau_{1/2})$.

---

## 8. Matriz de Trade-Offs de Custo, Latência e Recomendações

| Decisão Arquitetural | Impacto em Custo (Tokens/API) | Impacto em Latência | Solução & Valor Padrão Recomendado |
| :--- | :--- | :--- | :--- |
| **Grounding Estruturado com Tags XML** | Aumento de $\approx 8\%$ a $12\%$ no tamanho do prompt injetado. | Desprezível ($< 2\text{ms}$). | **Recomendado:** Manter tags enxutas (`<memory_item id="..." source="..." confidence="...">`) apenas nos Top-5 nós injetados. |
| **Reranking Multicritério em Runtime** | **Zero custo de API** (cálculo inteiramente determinístico em CPU local). | $+3\text{ms}$ a $+5\text{ms}$ para reordenar até 50 candidatos. | **Recomendado:** Computar a fórmula diretamente no Node/Browser runtime após o retorno do pgvector. |
| **Working Memory Desacoplada (10 Turnos)** | Mantém tamanho fixo e previsível ($\approx 2.000$ tokens). | Zero latência de embedding em turnos conversacionais. | **Recomendado:** Sliding window de 10 turnos com extração semântica em segundo plano no momento da evicção. |
| **Fusão Procedural na Dream Phase** | Economiza $\approx 35\%$ de tokens ao substituir múltiplos nós redundantes por 1 macro-regra. | Processamento noturno offline (zero impacto na professora durante o dia). | **Recomendado:** Rodar consolidação 1 vez a cada 24 horas ou sob demanda na aba `Cérebro & Memória`. |

---

## 9. Conclusão & Próximos Passos de Implementação

A **Fase 5** fecha o ciclo de engenharia do Memory Engine da Rafinha, transformando-o em um sistema de memória cognitiva de classe mundial:
- **Zero Amnésia:** Histórico longitudinal e preferências preservadas.
- **Zero Alucinação de Regras:** Fatos conflitantes geram perguntas ativas em vez de suposições erradas.
- **Eficiência de Tokens Extrema:** Working memory limpa, RAG focado com token budget estrito e decaimento contínuo.
- **Segurança Ética Inviolável:** Isolamento hermético de dados entre alunos validado por suíte de benchmark com zero tolerância a vazamento.
