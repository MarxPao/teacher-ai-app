-- ==============================================================================
-- Migration: 20260923_memory_engine_fase5_and_hardening.sql
-- Descrição: Fase 5 & Fase 5.1 Hardening do Memory Engine da Rafinha
--             - Criação do tipo enum task_binding_module
--             - Sanitização e tipagem de task_binding em agent_semantic_memories
--             - Suporte formal à categoria 'procedural'
--             - Colunas source_type e source_ref
--             - Tabela agent_procedural_candidates com ledger de ocorrências (janela 60d)
-- ==============================================================================

-- 1. Criação do Tipo Enum Canônico de Módulos Vinculados
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_binding_module') THEN
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
    END IF;
END$$;

-- 2. Atualização dos Checks de Categoria em agent_semantic_memories (Adiciona 'procedural')
DO $$
BEGIN
    ALTER TABLE public.agent_semantic_memories 
        DROP CONSTRAINT IF EXISTS agent_semantic_memories_category_check;

    ALTER TABLE public.agent_semantic_memories
        ADD CONSTRAINT agent_semantic_memories_category_check CHECK (category IN (
            'grading_rigor', 'teaching_style', 'communication_rule', 
            'school_policy', 'subject_matter', 'personal_convention',
            'procedural', 'teacher_preference', 'class_insight', 
            'pedagogical_rule', 'student_fact', 'school_context'
        ));
EXCEPTION
    WHEN undefined_table THEN
        NULL;
END$$;

-- 3. Adição e Normalização de Colunas em agent_semantic_memories
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_semantic_memories') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_semantic_memories' AND column_name = 'task_binding') THEN
            ALTER TABLE public.agent_semantic_memories ADD COLUMN task_binding VARCHAR(64);
        END IF;

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

        BEGIN
            ALTER TABLE public.agent_semantic_memories
                ALTER COLUMN task_binding TYPE task_binding_module
                USING (task_binding::task_binding_module);
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_semantic_memories' AND column_name = 'source_type') THEN
            ALTER TABLE public.agent_semantic_memories ADD COLUMN source_type VARCHAR(32) NOT NULL DEFAULT 'dialogue';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_semantic_memories' AND column_name = 'source_ref') THEN
            ALTER TABLE public.agent_semantic_memories ADD COLUMN source_ref TEXT;
        END IF;
    END IF;
END$$;

-- 4. Tabela de Candidatos a Memória Procedural (agent_procedural_candidates)
CREATE TABLE IF NOT EXISTS public.agent_procedural_candidates (
    id VARCHAR(64) PRIMARY KEY,
    user_id UUID,
    action_pattern_signature VARCHAR(128) NOT NULL,
    task_binding task_binding_module NOT NULL,
    occurrence_timestamps TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
    candidate_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proc_candidates_sig 
    ON public.agent_procedural_candidates(action_pattern_signature);

CREATE INDEX IF NOT EXISTS idx_proc_candidates_task 
    ON public.agent_procedural_candidates(task_binding);
