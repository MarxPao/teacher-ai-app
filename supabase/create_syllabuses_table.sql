-- ==============================================================================
-- TEACHER AI — TABELA DE EMENTAS & CONTEÚDOS PROGRAMÁTICOS (SYLLABUSES)
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/parxakvjvuvsmvbvrshk/sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS syllabuses (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  school                TEXT DEFAULT '',
  class_name            TEXT DEFAULT '',
  term                  TEXT DEFAULT '',
  book_title            TEXT DEFAULT '',
  book_units_chapters   TEXT DEFAULT '',
  grammar_topics        JSONB DEFAULT '[]',
  vocabulary_themes     JSONB DEFAULT '[]',
  skills_and_objectives JSONB DEFAULT '[]',
  study_tips            TEXT DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'planejado',
  evaluation_date       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_syllabuses_school ON syllabuses(school);
CREATE INDEX IF NOT EXISTS idx_syllabuses_class ON syllabuses(class_name);
CREATE INDEX IF NOT EXISTS idx_syllabuses_status ON syllabuses(status);
CREATE INDEX IF NOT EXISTS idx_syllabuses_updated_at ON syllabuses(updated_at DESC);

-- Segurança e Políticas de Acesso RLS
ALTER TABLE syllabuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on syllabuses" ON syllabuses;
CREATE POLICY "Allow anon full access on syllabuses" ON syllabuses FOR ALL USING (true) WITH CHECK (true);

SELECT 'Tabela syllabuses criada e configurada com sucesso no Supabase Cloud!' AS status;
