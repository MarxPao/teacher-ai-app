-- ==============================================================================
-- TEACHER AI — TABELA DE SEQUÊNCIAS DIDÁTICAS (DIDACTIC SEQUENCES)
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/parxakvjvuvsmvbvrshk/sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS didactic_sequences (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  school                TEXT DEFAULT '',
  class_name            TEXT DEFAULT '',
  subject               TEXT DEFAULT 'Inglês',
  year                  TEXT DEFAULT '2026',
  term                  TEXT DEFAULT '2º Trimestre',
  book_ref              TEXT DEFAULT '',
  current_stage_index   INT DEFAULT 0,
  stages                JSONB DEFAULT '[]',
  ai_diagnostic         TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas otimizadas
CREATE INDEX IF NOT EXISTS idx_didactic_seq_school ON didactic_sequences(school);
CREATE INDEX IF NOT EXISTS idx_didactic_seq_class ON didactic_sequences(class_name);
CREATE INDEX IF NOT EXISTS idx_didactic_seq_updated_at ON didactic_sequences(updated_at DESC);

-- Políticas de Acesso RLS
ALTER TABLE didactic_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on didactic_sequences" ON didactic_sequences;
CREATE POLICY "Allow anon full access on didactic_sequences" ON didactic_sequences FOR ALL USING (true) WITH CHECK (true);

SELECT 'Tabela didactic_sequences criada e configurada com sucesso no Supabase Cloud!' AS status;
