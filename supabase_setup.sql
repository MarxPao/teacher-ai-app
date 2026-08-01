-- ==============================================================================
-- TEACHER AI — ESQUEMA COMPLETO DE BANCO DE DADOS & POLÍTICAS NO SUPABASE
-- ==============================================================================

-- ─── 1. TABELA PRINCIPAL DE SINCRONIZAÇÃO NUVEM (Key-Value JSON Store) ────────
CREATE TABLE IF NOT EXISTS teacher_sync (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_sync_updated_at ON teacher_sync (updated_at DESC);
ALTER TABLE teacher_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on teacher_sync" ON teacher_sync;
CREATE POLICY "Allow anon full access on teacher_sync" ON teacher_sync FOR ALL USING (true) WITH CHECK (true);

-- ─── 2. TABELA DE ESCOLAS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on schools" ON schools;
CREATE POLICY "Allow anon full access on schools" ON schools FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. TABELA DE TURMAS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  school_id  TEXT REFERENCES schools(id) ON DELETE SET NULL,
  grade      TEXT,
  year       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on classes" ON classes;
CREATE POLICY "Allow anon full access on classes" ON classes FOR ALL USING (true) WITH CHECK (true);

-- ─── 4. TABELA DE ALUNOS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT,
  class_id   TEXT REFERENCES classes(id) ON DELETE SET NULL,
  grades     JSONB NOT NULL DEFAULT '{}',
  metrics    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_name  ON students(name);
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on students" ON students;
CREATE POLICY "Allow anon full access on students" ON students FOR ALL USING (true) WITH CHECK (true);

-- ─── 5. TABELA DE PROVAS E SIMULADOS (ExamBuilder) ────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  topic      TEXT,
  cefr       TEXT,
  grade      TEXT,
  content    TEXT NOT NULL,
  sections   JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exams_updated_at ON exams(updated_at DESC);
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on exams" ON exams;
CREATE POLICY "Allow anon full access on exams" ON exams FOR ALL USING (true) WITH CHECK (true);

-- ─── 6. TABELA DE PLANOS DE AULA (LessonStudio & Planner) ─────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  topic      TEXT,
  level      TEXT,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lessons_updated_at ON lessons(updated_at DESC);
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on lessons" ON lessons;
CREATE POLICY "Allow anon full access on lessons" ON lessons FOR ALL USING (true) WITH CHECK (true);

-- ─── 7. TABELA DE MAPAS MENTAIS (MindMap) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS mindmaps (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  nodes      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE mindmaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on mindmaps" ON mindmaps;
CREATE POLICY "Allow anon full access on mindmaps" ON mindmaps FOR ALL USING (true) WITH CHECK (true);

-- ─── 8. TABELA DE BANCO DE QUESTÕES (QuestionBank) ───────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id         TEXT PRIMARY KEY,
  stem       TEXT NOT NULL,
  options    JSONB DEFAULT '[]',
  answer     TEXT,
  type       TEXT,
  cefr       TEXT,
  tags       JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on questions" ON questions;
CREATE POLICY "Allow anon full access on questions" ON questions FOR ALL USING (true) WITH CHECK (true);

-- ─── 9. TABELA DE ATAS E GRAVAÇÕES DE REUNIÕES (MeetingClassRecorder) ───────
CREATE TABLE IF NOT EXISTS meeting_diaries (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT,
  type        TEXT,
  transcript  TEXT,
  summary     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE meeting_diaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on meeting_diaries" ON meeting_diaries;
CREATE POLICY "Allow anon full access on meeting_diaries" ON meeting_diaries FOR ALL USING (true) WITH CHECK (true);

-- ─── 10. FUNÇÃO E TRIGGERS DE UPDATED_AT AUTOMÁTICO ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_teacher_sync ON teacher_sync;
CREATE TRIGGER trg_set_updated_at_teacher_sync BEFORE UPDATE ON teacher_sync FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_schools ON schools;
CREATE TRIGGER trg_set_updated_at_schools BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_classes ON classes;
CREATE TRIGGER trg_set_updated_at_classes BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_students ON students;
CREATE TRIGGER trg_set_updated_at_students BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_exams ON exams;
CREATE TRIGGER trg_set_updated_at_exams BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_lessons ON lessons;
CREATE TRIGGER trg_set_updated_at_lessons BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_mindmaps ON mindmaps;
CREATE TRIGGER trg_set_updated_at_mindmaps BEFORE UPDATE ON mindmaps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_questions ON questions;
CREATE TRIGGER trg_set_updated_at_questions BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_meeting_diaries ON meeting_diaries;
CREATE TRIGGER trg_set_updated_at_meeting_diaries BEFORE UPDATE ON meeting_diaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
SELECT 'Schema do Teacher AI instalado com sucesso no Supabase!' AS status;
