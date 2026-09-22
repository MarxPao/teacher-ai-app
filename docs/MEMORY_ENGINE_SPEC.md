# Especificação Técnica de Engenharia: Memory Engine (Rafinha / Teacher AI)
**Versão:** 1.0.0  
**Autor:** Equipe de Arquitetura de Sistemas de Agentes (Google Antigravity / Teacher AI)  
**Status:** Aprovado para Implementação  
**Referências Teóricas:** MemGPT/Letta, Generative Agents (Park et al., Stanford), Mem0, MemoryBank, A-MEM (Active Memory Augmentation).

---

## 1. Visão Geral da Arquitetura

O **Memory Engine** da Rafinha é o subsistema responsável por coletar, estruturar, indexar, consolidar e recuperar conhecimento sobre:
1. **A Professora:** Estilo pedagógico, convenções de avaliação, regras de comunicação e tarefas.
2. **Os Alunos:** Perfis longitudinais, acomodações, evolução pedagógica e histórico comportamental.
3. **A Instituição:** Regras escolares, calendário letivo, diretrizes de conselho de classe.
4. **Os Procedimentos:** Como agir sobre o portal escolar, como preencher notas e como lidar com exceções.

### 1.1 Topologia de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       CAMADA DE ENTRADA                                         │
│   Web App (React/Next.js)      Extensão Chrome (Side Panel)      Sidecar (FastAPI/Playwright)   │
└────────────────┬───────────────────────────────┬───────────────────────────────┬────────────────┘
                 │                               │                               │
                 ▼                               ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ROTEADOR DE MEMÓRIA                                          │
│   • Intent Classifier (Heurística + NLU)   • Fast-Path Filter (ignora mensagens triviais)       │
└────────────────┬───────────────────────────────────────────────────────────────┬────────────────┘
                 │                                                               │
        [Fluxo de Leitura]                                              [Fluxo de Escrita]
                 │                                                               │
                 ▼                                                               ▼
┌────────────────────────────────┐                             ┌─────────────────────────────────┐
│      HYBRID RETRIEVER          │                             │     EXTRAÇÃO EM DUAS ETAPAS     │
│  • Dense Search (pgvector)     │                             │  1. LLM Extractor (Candidatos)  │
│  • Sparse Search (BM25 / FTS)  │                             │  2. Resolutor de Conflitos      │
│  • Ranker Composto Multicritério│                            │     (Add, Update, Supersede)    │
└────────────────┬───────────────┘                             └─────────────────┬───────────────┘
                 │                                                               │
                 ▼                                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ORQUESTRADOR DE CONTEXTO                                      │
│   • Dynamic Context Budgets      • Grounding & Source Citations      • Deduplicação de Tokens   │
└────────────────┬───────────────────────────────────────────────────────────────┬────────────────┘
                 │                                                               │
                 ▼                                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CAMADA DE PERSISTÊNCIA HÍBRIDA                                  │
│   • Nuvem (Cloud Master): Supabase PostgreSQL 16 + pgvector + pg_trgm                           │
│   • Local/Offline (Client Cache): IndexedDB (Dexie.js no Browser) + SQLite/FTS5 no Sidecar      │
│   • Job Assíncrono ("Dream Phase"): Consolidação Noturna, Poda e Abstrações de Nível Superior    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Taxonomia de Memória

A memória é dividida em **6 camadas operacionais ortogonais**, com regras estritas de ciclo de vida:

| Tipo | Finalidade | Onde é Armazenado | Mecanismo de Escrita | Mecanismo de Decaimento | Mecanismo de Recuperação |
|---|---|---|---|---|---|
| **1. Working Memory** | Turnos imediatos da conversa ativa para coerência local. | Memória RAM do processo (React State / LocalStorage de sessão). | Escrita síncrona a cada turno de usuário e resposta do agente. | Janela deslizante (*Sliding Window* de 20 turnos). Mensagens antigas são descartadas ou comprimidas. | Acesso direto O(1) sem busca semântica; injetada integralmente. |
| **2. Episódica** | Registro temporal de eventos datados ("O que aconteceu e quando"). | Tabela `agent_episodes` no Supabase + Cache IndexedDB. | Assíncrono pós-conversa (ou por tool call em ações críticas). | Decaimento exponencial temporal contínuo ($\lambda = 0.05/\text{dia}$); nunca apagada, mas perde relevância. | Busca híbrida (BM25 + Cosine) filtrada por janela temporal. |
| **3. Semântica** | Fatos, regras e preferências atemporais destiladas da professora. | Tabela `agent_semantic_memories` (Supabase + LocalStorage sincronizado). | Pipeline em 2 etapas (Extração + Resolução de Conflitos) ou tool `salvar_memoria`. | Não decai por tempo. Só decai ou muda de status se for **substituída** (`superseded`) ou refutada. | Injeção estática das regras prioritárias + Busca densa sob demanda. |
| **4. Procedural** | Conhecimento operacional ("Como executar X no portal Y"). | Tabela `portal_skills` (JSON SkillGraph no Supabase/Sidecar). | Aprendizado por demonstração ou self-healing de seletores DOM. | Decai se falhar repetidamente no DOM (marcação de `drift`), acionando redescoberta. | Match exato por domínio escolar + Intenção semântica da ação. |
| **5. Tarefa / Compromisso** | Compromissos com prazos, pendências e lembretes da professora. | Tabela `agent_tasks` (Supabase + Webhooks de Notificação). | Extração estruturada de entidades de data/tempo durante a conversa. | Binário: ativo até o prazo ou até ser marcado como `concluído` / `cancelado`. | Injeção prioritária proativa quando `due_date <= now + 24h`. |
| **6. Dossiê do Aluno** | Histórico longitudinal, pontos fortes/fracos, notas e histórico familiar. | Tabela `student_dossiers` + `student_learning_traits` (Supabase). | Feedbacks do OmniGrader, importação de planilhas e recados trocados. | Permanente com versionamento cumulativo (aprendizado contínuo). | Indexado pelo ID único do aluno / Nome normalizado (NFD). Injetado quando o aluno entra em foco. |

---

## 3. Modelo de Dados (Schema Relacional & Vetorial)

Utiliza-se PostgreSQL 16 com as extensões `vector` (pgvector), `pg_trgm` (busca difusa trigram) e `uuid-ossp`.

### 3.1 Tabela `agent_semantic_memories` (Memória Semântica e Preferências)
Armazena crenças, preferências de estilo e regras atemporais.

```sql
CREATE TABLE agent_semantic_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id VARCHAR(64) NOT NULL,
    school_id VARCHAR(64), -- NULL se for preferência pessoal; preenchido se for regra institucional
    scope VARCHAR(16) NOT NULL CHECK (scope IN ('private', 'institutional')),
    category VARCHAR(32) NOT NULL CHECK (category IN (
        'grading_rigor', 'teaching_style', 'communication_rule', 
        'school_policy', 'subject_matter', 'personal_convention'
    )),
    fact_text TEXT NOT NULL,
    embedding VECTOR(1536), -- Modelo text-embedding-3-small (ou 512 com MRL)
    importance_score NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (importance_score BETWEEN 0.00 AND 1.00),
    decay_rate NUMERIC(4,3) NOT NULL DEFAULT 0.000, -- 0.000 para semântica pura (sem decaimento)
    status VARCHAR(16) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'superseded', 'conflitante')),
    previous_version_id UUID REFERENCES agent_semantic_memories(id) ON DELETE SET NULL,
    superseded_by UUID REFERENCES agent_semantic_memories(id) ON DELETE SET NULL,
    conflict_details TEXT, -- Descrição da contradição caso status = 'conflitante'
    provenance_source VARCHAR(32) NOT NULL CHECK (provenance_source IN ('dialogue', 'explicit_tool', 'manual_edit', 'dream_phase')),
    provenance_session_id VARCHAR(64),
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para alta performance e escalabilidade
CREATE INDEX idx_semantic_teacher_status ON agent_semantic_memories(teacher_id, status);
CREATE INDEX idx_semantic_embedding_hnsw ON agent_semantic_memories USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_semantic_fts ON agent_semantic_memories USING gin (to_tsvector('portuguese', fact_text));
```

### 3.2 Tabela `agent_episodes` (Memória Episódica Datada)
Armazena registros de diálogos passados e interações com o portal.

```sql
CREATE TABLE agent_episodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary TEXT NOT NULL,
    full_turn_data JSONB, -- Payload compacto do diálogo
    embedding VECTOR(1536),
    importance_score NUMERIC(3,2) NOT NULL DEFAULT 0.40,
    decay_rate NUMERIC(4,3) NOT NULL DEFAULT 0.050, -- Decaimento diário
    involved_students TEXT[], -- Array de nomes/IDs de alunos citados
    involved_portal_action VARCHAR(64),
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_episodes_teacher_time ON agent_episodes(teacher_id, event_timestamp DESC);
CREATE INDEX idx_episodes_embedding_hnsw ON agent_episodes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_episodes_fts ON agent_episodes USING gin (to_tsvector('portuguese', summary));
```

### 3.3 Tabela `agent_tasks` (Tarefas e Compromissos Temporais)

```sql
CREATE TABLE agent_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    priority VARCHAR(16) NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
    status VARCHAR(16) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_progresso', 'concluida', 'cancelada')),
    related_student_name VARCHAR(128),
    related_portal VARCHAR(64),
    source_dialogue_snippet TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_teacher_due ON agent_tasks(teacher_id, status, due_date ASC);
```

### 3.4 Tabela `student_dossiers` (Dossiê Longitudinal do Aluno)

```sql
CREATE TABLE student_dossiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id VARCHAR(64) NOT NULL,
    student_name_clean VARCHAR(128) NOT NULL, -- Normalizado sem acento, lowercase
    student_name_display VARCHAR(128) NOT NULL,
    classroom_id VARCHAR(64),
    pedagogical_profile JSONB NOT NULL DEFAULT '{
        "reading_level": null,
        "math_readiness": null,
        "strengths": [],
        "persistent_difficulties": [],
        "accommodations": []
    }'::jsonb,
    last_grade_average NUMERIC(4,2),
    attendance_rate NUMERIC(5,2),
    embedding VECTOR(1536), -- Resumo do perfil para matching semântico
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_teacher_student UNIQUE(teacher_id, student_name_clean)
);

CREATE INDEX idx_dossier_name_trgm ON student_dossiers USING gin (student_name_clean gin_trgm_ops);
```

---

## 4. Pipeline de Escrita de Memória (Extração em Duas Etapas)

Para evitar alucinações, acúmulo de lixo e contradições silenciosas, a persistência de memórias segue um processo rigoroso em 2 etapas:

```
[Conversa / Tool Call]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│  ETAPA 1: EXTRAÇÃO ESTRUTURADA (LLM Extractor)         │
│  Entrada: Turno do usuário + Resposta do assistente    │
│  Saída: Array de candidatos em JSON Schema estrito     │
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│  ETAPA 2: RESOLUÇÃO CONTRA A BASE EXISTENTE            │
│  1. Busca similaridade semântica contra memórias ativas│
│  2. Classificação: ADD | UPDATE | SUPERSEDE | NOOP     │
│  3. Detecção de contradição: marcação 'conflitante'    │
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│  PERSISTÊNCIA & AUDITORIA                              │
│  Gravação atômica no Supabase + Atualização no Cache   │
└────────────────────────────────────────────────────────┘
```

### 4.1 Etapa 1 — Extração Estruturada (LLM Extractor)
Executada via endpoint leve assíncrono pós-turno:

```json
{
  "candidates": [
    {
      "category": "grading_rigor",
      "fact_text": "A professora prefere descontar 0.5 ponto por erro de coesão em redações do 9º ano",
      "importance_score": 0.85,
      "scope": "private",
      "confidence": 0.92
    },
    {
      "category": "task_commitment",
      "fact_text": "Lançar as notas da recuperação do 2º bimestre até sexta-feira às 18h",
      "due_date": "2026-09-25T18:00:00-03:00",
      "priority": "alta"
    }
  ]
}
```

### 4.2 Etapa 2 — Pseudocódigo de Resolução de Conflitos e Superseding

```python
def resolve_semantic_candidate(candidate, teacher_id, db_client):
    # 1. Gerar embedding do candidato
    candidate_embedding = get_embedding(candidate["fact_text"])
    
    # 2. Buscar memórias ativas similares (Threshold de Similaridade = 0.82)
    similar_memories = db_client.rpc(
        "match_semantic_memories",
        {
            "query_embedding": candidate_embedding,
            "match_threshold": 0.82,
            "match_count": 3,
            "filter_teacher_id": teacher_id,
            "filter_status": "ativo"
        }
    ).execute().data

    if not similar_memories:
        # Fato inédito: Inserir como novo
        return db_client.table("agent_semantic_memories").insert({
            "teacher_id": teacher_id,
            "category": candidate["category"],
            "fact_text": candidate["fact_text"],
            "embedding": candidate_embedding,
            "importance_score": candidate["importance_score"],
            "status": "ativo",
            "provenance_source": "dialogue"
        }).execute()

    top_match = similar_memories[0]
    
    # 3. Avaliar compatibilidade lógica entre o fato existente e o candidato
    resolution = evaluate_logic_relation(existing=top_match["fact_text"], new=candidate["fact_text"])
    
    if resolution == "PARAPHRASE" or resolution == "REDUNDANT":
        # Fato idêntico: Atualiza access_count e reforça importância (+0.05)
        new_importance = min(1.0, float(top_match["importance_score"]) + 0.05)
        return db_client.table("agent_semantic_memories").update({
            "importance_score": new_importance,
            "access_count": top_match["access_count"] + 1,
            "last_accessed_at": "NOW()"
        }).eq("id", top_match["id"]).execute()

    elif resolution == "SUPERSEDE":
        # Nova preferência revoga explicitamente a anterior
        new_record = db_client.table("agent_semantic_memories").insert({
            "teacher_id": teacher_id,
            "category": candidate["category"],
            "fact_text": candidate["fact_text"],
            "embedding": candidate_embedding,
            "importance_score": candidate["importance_score"],
            "status": "ativo",
            "previous_version_id": top_match["id"],
            "provenance_source": "dialogue"
        }).execute().data[0]

        return db_client.table("agent_semantic_memories").update({
            "status": "superseded",
            "superseded_by": new_record["id"]
        }).eq("id", top_match["id"]).execute()

    elif resolution == "CONTRADICTION":
        # Contradição ambígua: Marca ambas como conflitantes para mediação humana
        return db_client.table("agent_semantic_memories").update({
            "status": "conflitante",
            "conflict_details": f"Conflita com nova afirmação: {candidate['fact_text']}"
        }).eq("id", top_match["id"]).execute()
```

### 4.3 Escrita em Tempo Real via Tool Call (`salvar_memoria`)
Quando a professora dá uma instrução explícita (*"Rafinha, anote que na Escola Santo Agostinho a média mínima é 7.0"*), o modelo aciona imediatamente a tool:

```json
{
  "tool_name": "salvar_memoria",
  "parameters": {
    "categoria": "school_policy",
    "conteudo": "Escola Santo Agostinho exige média mínima de aprovação igual a 7.0",
    "importancia": 0.95,
    "escopo": "institutional",
    "escola_id": "santo_agostinho"
  }
}
```

---

## 5. Pipeline de Recuperação (Hybrid Retrieval & Scoring)

### 5.1 Roteador Rápido de Consultas (Fast-Path Router)
Para garantir latência `< 150ms` e economia de tokens, o retrieval vetorial só é disparado se a mensagem demandar conhecimento externo:

```
                  ┌───────────────────────────────┐
                  │      MENSAGEM DO USUÁRIO      │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │ É saudação/trivial/chitchat?│──SIM──► [Fast-Path: Responde direto sem RAG]
                    └─────────────┬─────────────┘
                                  │ NÃO
                                  ▼
                   ┌─────────────────────────────┐
                   │  Cita nome de aluno ou aula? │──SIM──► [Busca Específica: Dossiê Aluno]
                   └─────────────┬───────────────┘
                                  │ NÃO
                                  ▼
               ┌─────────────────────────────────────┐
               │ Pergunta conceitual/avaliação/portal │──SIM──► [Busca Híbrida Completa (Top-K)]
               └─────────────────────────────────────┘
```

### 5.2 Fórmula de Ranqueamento Composto

O score de relevância $S_{\text{final}}$ de cada nó de memória é dado por:

$$S_{\text{final}} = w_{\text{sim}} \cdot S_{\text{sim}} + w_{\text{rec}} \cdot S_{\text{rec}} + w_{\text{imp}} \cdot S_{\text{imp}} + w_{\text{freq}} \cdot S_{\text{freq}}$$

Onde:
1. **$S_{\text{sim}} \in [0, 1]$:** Similaridade por Cosseno entre o embedding da consulta e o da memória.
2. **$S_{\text{rec}} = e^{-\lambda \Delta t}$:** Decaimento exponencial da recência, onde $\Delta t$ é o tempo decorrido em horas e $\lambda$ é a taxa de decaimento:
   - Para Memória Semântica: $\lambda = 0.000 \implies S_{\text{rec}} = 1.0$ (não decai).
   - Para Memória Episódica: $\lambda = 0.002$ (~5% de decaimento por dia).
3. **$S_{\text{imp}} \in [0, 1]$:** O `importance_score` gravado no banco.
4. **$S_{\text{freq}} = \frac{\ln(1 + \text{access\_count})}{\ln(1 + \text{access\_count}_{\max})}$:** Normalização logarítmica da frequência de acesso.

#### Pesos Padrão Calibrados:
- $w_{\text{sim}} = 0.50$ (Relevância semântica)
- $w_{\text{rec}} = 0.20$ (Recência temporal)
- $w_{\text{imp}} = 0.20$ (Importância declarada)
- $w_{\text{freq}} = 0.10$ (Frequência de utilização)
- $\sum w = 1.00$

---

## 6. Ciclo de Consolidação Noturna ("Dream Phase")

Inspirado nos modelos de consolidação de sono humano e no arquitetura *Generative Agents*, o sistema executa um cron job noturno diário (às 03:00 da manhã) para cada professora ativa:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CICLO "DREAM PHASE"                             │
│                                                                        │
│   1. Varredura Episódica ──► 2. Agrupamento ──► 3. Geração de          │
│      dos turnos das últimas     de Padrões         Reflexões de Alto   │
│      24 horas                   (Clustering)       Nível               │
│                                                                        │
│   6. Atualização do      ◄── 5. Poda e Purgas ◄── 4. Resolução de      │
│      'MEMORY.md' Global         de Temporários       Conflitos Pendentes│
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Exemplo Prático de Elevação Semântica (Clustering)
- **Observações Episódicas Individuais (Últimos 5 dias):**
  - *Dia 1:* "Lucas teve dificuldade para ler a questão 4 de ciências."
  - *Dia 3:* "Lucas pediu para ler a prova em voz alta."
  - *Dia 5:* "Lucas demorou o dobro do tempo nas questões puramente textuais."
- **Reflexão Destilada (Nível Superior):**
  - *Fato Semântico no Dossiê do Lucas:* `"Lucas apresenta indícios recorrentes de sobrecarga na leitura autônoma de enunciados densos. Sugerir à professora avaliações com apoio visual e tempo ampliado."` (Importância: 0.90).

---

## 7. Orçamento Estrito de Contexto (Token Budget)

| Seção do Prompt | Budget Padrão (Tokens) | Teto Máximo (Tokens) | Regra de Poda / Compressão |
|---|:---:|:---:|---|
| **System Prompt & Persona da Rafinha** | 800 | 800 | Estático; imutável. |
| **Memória Semântica Curada da Professora** | 600 | 800 | Fatos com $S_{\text{imp}} \ge 0.85$ prioritários; sumarização em tópicos. |
| **Dossiê do Aluno em Foco (se houver)** | 600 | 1.000 | Perfil estruturado, últimas notas e acomodações ativas. |
| **Tarefas e Compromissos Imediatos** | 300 | 500 | Apenas tarefas ativas com prazo em $\le 48\text{h}$. |
| **Memória Dinâmica RAG (Top-K Relevantes)** | 1.200 | 2.000 | Top-5 nós de maior score composto. |
| **Working Memory (Histórico Recente de Chat)** | 2.500 | 4.000 | Janela deslizante. Se exceder, resumo progressivo dos turnos 1 a 10. |
| **Scratchpad / Tool Calling Feedback** | 500 | 1.000 | Resultados das chamadas de ferramentas no turno corrente. |
| **Margem para Geração do Modelo (Output)** | 1.500 | 2.000 | Espaço livre reservado para a resposta da LLM. |
| **TOTAL TÍPICO** | **8.000** | **12.100** | Encaixa perfeitamente em janelas de 16k/32k/128k. |

---

## 8. Camada de Confiança, Grounding e Mediação de Conflitos

### 8.1 Citação Explícita de Proveniência
A assistente sempre indica a origem ao responder baseada em fatos consolidados:
> *"Com base no seu perfil de **rigor moderado** e no que você combinou no recado com a mãe do Pedro em **14/09**, sugiro conceder o trabalho substitutivo valendo até 8,0 pontos."*

### 8.2 Protocolo de Mediação Ativa (Human-in-the-Loop)
Quando o sistema detecta um nó com status `conflitante`, ele nunca assume uma postura arbitrária:
> *"Professora, notei uma divergência nas regras de avaliação:*
> - *Em 10 de Agosto: **Arredondar notas finais para o inteiro mais próximo**.*
> - *Hoje você mencionou: **Manter notas com uma casa decimal**.*
> 
> *Como prefere padronizar a partir de agora?*
> 1. [ ] Manter com 1 casa decimal (Atualizar perfil permanente)
> 2. [ ] Arredondar para o inteiro mais próximo
> 3. [ ] Aplicar 1 casa decimal apenas para esta avaliação"*

---

## 9. Painel de Transparência e Controle (Governança LGPD)

Interface visual dedicada em **Configurações > Cérebro & Memória**:
- **Visualização Filtrada:** Lista de crenças, regras pedagógicas e dossiês de alunos.
- **Edição em Linha:** Correção de fatos mal interpretados pela IA.
- **Exclusão Pontual:** Remoção imediata com purga de vetores.
- **Direito ao Esquecimento:** Purga integral de dados de alunos específicos com um clique (`DELETE /api/agent/memory/purge-student`).
- **Exportação Portável:** Download de `MEMORY.md` e `dossiers.json`.

---

## 10. Testes Automatizados de Regressão de Memória

```typescript
describe('Memory Engine — Regressão Semântica e Anti-Contradição', () => {
  it('deve recuperar a regra superseded mais recente e ignorar a regra legada', async () => {
    await injectMemoryNode({
      id: 'mem-v1',
      fact: 'Professora prefere provas com no máximo 5 questões discursivas',
      status: 'superseded',
      superseded_by: 'mem-v2'
    });
    await injectMemoryNode({
      id: 'mem-v2',
      fact: 'Professora prefere provas com 10 questões objetivas de múltipla escolha',
      status: 'ativo'
    });

    const context = await retrieveMemoryContext({
      query: 'Monte a estrutura da próxima avaliação trimestral',
      teacherId: 'prof_marx'
    });

    expect(context.facts).toContain('10 questões objetivas de múltipla escolha');
    expect(context.facts).not.toContain('5 questões discursivas');
  });
});
```

---

## 11. Roteiro de Implementação Faseado

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ FASE 1: Fundação & Tarefas Proativas                                             │
│ • Schema Supabase (agent_tasks, agent_semantic_memories)                         │
│ • Rota /api/agent/tasks e Card de Lembretes Proativos na Extensão                │
│ • Critério de Pronto: Lembretes funcionam e não somem com F5 ou novo browser.   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ FASE 2: RAG Híbrido & Dossiê Longitudinal                                        │
│ • Ativação da extensão pgvector e rotinas RPC de busca híbrida (BM25 + Cosseno)   │
│ • Dossiê do Aluno conectado às correções reais do OmniGrader                     │
│ • Critério de Pronto: Busca semântica recupera perfil do aluno em < 120ms.       │
├──────────────────────────────────────────────────────────────────────────────────┤
│ FASE 3: Pipeline de Extração em 2 Etapas & Resolução de Conflitos               │
│ • LLM Extractor assíncrono pós-turno + Detector de Superseding                  │
│ • Tool nativa `salvar_memoria` integrada no prompt da Rafinha                   │
│ • Critério de Pronto: Novas preferências atualizam o banco sem duplicatas.       │
├──────────────────────────────────────────────────────────────────────────────────┤
│ FASE 4: Consolidação Noturna ("Dream Phase") & Reflexão                         │
│ • Cron job diário de clustering e abstração pedagógica                           │
│ • Geração automatizada de alertas de aprendizagem preventiva                     │
│ • Critério de Pronto: Padrões de 3 dias viram fatos estáveis automaticamente.    │
├──────────────────────────────────────────────────────────────────────────────────┤
│ FASE 5: Painel LGPD & Governança Visual                                          │
│ • Tela "Minha Memória" nas Configurações com CRUD completo e exportação MD       │
│ • Purga por aluno com um clique                                                  │
│ • Critério de Pronto: Auditoria e conformidade total com LGPD.                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Tabela de Trade-Offs de Engenharia

| Decisão Arquitetural | Alternativa Avaliada | Escolha Recomendada | Justificativa Técnica |
|---|---|---|---|
| **Modelo de Embeddings** | Embeddings locais no Sidecar (FastEmbed) vs. OpenAI `text-embedding-3-small`. | **Híbrido:** OpenAI na nuvem (Supabase) + FastEmbed como fallback local. | `text-embedding-3-small` tem custo insignificante (\$0.02 / 1M tokens), alta precisão em português e suporta redução MRL (512d) economizando 66% de RAM no índice HNSW. |
| **Processamento da Extração** | Síncrono no turno vs. Assíncrono pós-resposta (*Fire-and-forget*). | **Assíncrono pós-resposta** (exceto tool calls explícitas). | O tempo de resposta ao usuário final (TTFT) é prioridade. A assistente responde imediatamente e a extração estruturada roda em background. |
| **Formato de Índice Vetorial** | IVFFlat vs. HNSW no pgvector. | **HNSW** (`vector_cosine_ops`). | HNSW não degrada qualidade à medida que novas memórias são inseridas sem re-treinar o índice, apresentando recall superior (>98%) com latência `< 15ms`. |
| **Armazenamento de Histórico** | Log completo em JSON vs. Sumarização progressiva. | **Sumarização progressiva em 20 turnos**. | Evita o crescimento descontrolado do banco e mantém o custo de injeção de prompt fixo e previsível. |
