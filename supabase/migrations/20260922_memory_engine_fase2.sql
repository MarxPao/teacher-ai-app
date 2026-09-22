-- ==============================================================================
-- Migration: 20260922_memory_engine_fase2.sql
-- Descrição: Tabelas do Memory Engine (pgvector + HNSW + Busca Híbrida e Dossiês)
-- ==============================================================================

-- 1. Extensões essenciais
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Memória Semântica da Professora (agent_semantic_memories)
CREATE TABLE IF NOT EXISTS agent_semantic_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id VARCHAR(64) NOT NULL,
    school_id VARCHAR(64),
    scope VARCHAR(16) NOT NULL DEFAULT 'private' CHECK (scope IN ('private', 'institutional')),
    category VARCHAR(32) NOT NULL CHECK (category IN (
        'grading_rigor', 'teaching_style', 'communication_rule', 
        'school_policy', 'subject_matter', 'personal_convention'
    )),
    fact_text TEXT NOT NULL,
    embedding VECTOR(1536), -- text-embedding-3-small (ou 512 com MRL)
    importance_score NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (importance_score BETWEEN 0.00 AND 1.00),
    decay_rate NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    status VARCHAR(16) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'superseded', 'conflitante')),
    previous_version_id UUID REFERENCES agent_semantic_memories(id) ON DELETE SET NULL,
    superseded_by UUID REFERENCES agent_semantic_memories(id) ON DELETE SET NULL,
    conflict_details TEXT,
    provenance_source VARCHAR(32) NOT NULL DEFAULT 'dialogue' CHECK (provenance_source IN ('dialogue', 'explicit_tool', 'manual_edit', 'dream_phase')),
    provenance_session_id VARCHAR(64),
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semantic_teacher_status ON agent_semantic_memories(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_semantic_embedding_hnsw ON agent_semantic_memories USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_semantic_fts ON agent_semantic_memories USING gin (to_tsvector('portuguese', fact_text));

-- 3. Tabela de Episódios Datados (agent_episodes)
CREATE TABLE IF NOT EXISTS agent_episodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary TEXT NOT NULL,
    full_turn_data JSONB,
    embedding VECTOR(1536),
    importance_score NUMERIC(3,2) NOT NULL DEFAULT 0.40,
    decay_rate NUMERIC(4,3) NOT NULL DEFAULT 0.050,
    involved_students TEXT[],
    involved_portal_action VARCHAR(64),
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_teacher_time ON agent_episodes(teacher_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_embedding_hnsw ON agent_episodes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_episodes_fts ON agent_episodes USING gin (to_tsvector('portuguese', summary));

-- 4. Tabela de Tarefas e Compromissos Temporais (agent_tasks)
CREATE TABLE IF NOT EXISTS agent_tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_teacher_due ON agent_tasks(teacher_id, status, due_date ASC);

-- 5. Tabela de Dossiê Longitudinal do Aluno (student_dossiers)
CREATE TABLE IF NOT EXISTS student_dossiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id VARCHAR(64) NOT NULL,
    student_name_clean VARCHAR(128) NOT NULL,
    student_name_display VARCHAR(128) NOT NULL,
    classroom_id VARCHAR(64),
    pedagogical_profile JSONB NOT NULL DEFAULT '{
        "reading_level": null,
        "math_readiness": null,
        "strengths": [],
        "persistent_difficulties": [],
        "accommodations": [],
        "learning_trajectory": []
    }'::jsonb,
    last_grade_average NUMERIC(4,2),
    attendance_rate NUMERIC(5,2),
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_teacher_student UNIQUE(teacher_id, student_name_clean)
);

CREATE INDEX IF NOT EXISTS idx_dossier_name_trgm ON student_dossiers USING gin (student_name_clean gin_trgm_ops);

-- 6. Função RPC de Busca Semântica Vetorial para o Hybrid Retriever
CREATE OR REPLACE FUNCTION match_semantic_memories (
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.70,
    match_count INT DEFAULT 5,
    filter_teacher_id VARCHAR DEFAULT '',
    filter_status VARCHAR DEFAULT 'ativo'
)
RETURNS TABLE (
    id UUID,
    fact_text TEXT,
    category VARCHAR,
    importance_score NUMERIC,
    similarity FLOAT,
    access_count INT,
    last_accessed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        asm.id,
        asm.fact_text,
        asm.category,
        asm.importance_score,
        1 - (asm.embedding <=> query_embedding) AS similarity,
        asm.access_count,
        asm.last_accessed_at
    FROM agent_semantic_memories asm
    WHERE (filter_teacher_id = '' OR asm.teacher_id = filter_teacher_id)
      AND (asm.status = filter_status)
      AND 1 - (asm.embedding <=> query_embedding) >= match_threshold
    ORDER BY asm.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;
