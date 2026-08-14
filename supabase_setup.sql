-- ==============================================================================
-- TEACHER AI — ESQUEMA COMPLETO DE BANCO DE DADOS & POLÍTICAS NO SUPABASE
-- Execute este script no SQL Editor do seu projeto Supabase (https://supabase.com)
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

-- ─── 4. TABELA DE ALUNOS REGULARES (Com Notas e Métricas) ─────────────────────
CREATE TABLE IF NOT EXISTS students (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  class_id    TEXT,
  class_name  TEXT,
  school_id   TEXT,
  school_name TEXT,
  grades      JSONB NOT NULL DEFAULT '{}',
  metrics     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_name  ON students(name);
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on students" ON students;
CREATE POLICY "Allow anon full access on students" ON students FOR ALL USING (true) WITH CHECK (true);

-- ─── 5. TABELA DE ALUNOS PARTICULARES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private_students (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  subject            TEXT NOT NULL,
  guardian_name      TEXT,
  phone              TEXT,
  email              TEXT,
  monthly_fee        NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_day            INT NOT NULL DEFAULT 10,
  payment_method     TEXT DEFAULT 'PIX',
  last_payment_date  TEXT,
  modality           TEXT NOT NULL DEFAULT 'Online',
  schedule_info      TEXT,
  payment_status     TEXT NOT NULL DEFAULT 'em_dia',
  mastery_percentage INT DEFAULT 75,
  goals              TEXT,
  ai_diagnostic      TEXT,
  roadmap            JSONB DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_private_students_status ON private_students(payment_status);
ALTER TABLE private_students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on private_students" ON private_students;
CREATE POLICY "Allow anon full access on private_students" ON private_students FOR ALL USING (true) WITH CHECK (true);

-- ─── 6. TABELA DE PROVAS E EXAMES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  topic      TEXT,
  cefr       TEXT,
  grade      TEXT,
  content    TEXT,
  sections   JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exams_topic ON exams(topic);
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on exams" ON exams;
CREATE POLICY "Allow anon full access on exams" ON exams FOR ALL USING (true) WITH CHECK (true);

-- ─── 7. TABELA DE PLANOS DE AULA ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  topic      TEXT,
  objectives TEXT,
  cefr       TEXT,
  class_name TEXT,
  school     TEXT,
  duration   TEXT,
  content    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on lessons" ON lessons;
CREATE POLICY "Allow anon full access on lessons" ON lessons FOR ALL USING (true) WITH CHECK (true);

-- ─── 8. TABELA DE MAPAS MENTAIS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mindmaps (
  id         TEXT PRIMARY KEY,
  topic      TEXT NOT NULL,
  markdown   TEXT NOT NULL,
  level      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE mindmaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on mindmaps" ON mindmaps;
CREATE POLICY "Allow anon full access on mindmaps" ON mindmaps FOR ALL USING (true) WITH CHECK (true);

-- ─── 9. BANCO DE QUESTÕES (QBANK) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id         TEXT PRIMARY KEY,
  topic      TEXT,
  stem       TEXT NOT NULL,
  options    JSONB DEFAULT '[]',
  answer     TEXT,
  cefr       TEXT,
  grade      TEXT,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on questions" ON questions;
CREATE POLICY "Allow anon full access on questions" ON questions FOR ALL USING (true) WITH CHECK (true);

-- ─── 10. TABELA DE DOCUMENTOS E LIVROS (ACERVO RAG) ───────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  category   TEXT,
  textbook   TEXT,
  file_url   TEXT,
  content    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on documents" ON documents;
CREATE POLICY "Allow anon full access on documents" ON documents FOR ALL USING (true) WITH CHECK (true);

-- ─── 11. TABELA DE DIÁRIOS DE REUNIÃO / ENCONTROS ─────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_diaries (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  date       TEXT NOT NULL,
  category   TEXT NOT NULL,
  summary    TEXT,
  transcript TEXT,
  notes      TEXT,
  action_items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE meeting_diaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on meeting_diaries" ON meeting_diaries;
CREATE POLICY "Allow anon full access on meeting_diaries" ON meeting_diaries FOR ALL USING (true) WITH CHECK (true);

-- ─── 12. TABELA DE RUBRICAS & GABARITOS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS rubrics_and_answer_keys (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL,
  grade      TEXT,
  criteria   JSONB DEFAULT '[]',
  content    TEXT NOT NULL,
  tenant_id  TEXT DEFAULT 'default_school',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rubrics_and_answer_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on rubrics" ON rubrics_and_answer_keys;
CREATE POLICY "Allow anon full access on rubrics" ON rubrics_and_answer_keys FOR ALL USING (true) WITH CHECK (true);

-- ─── 13. TABELA DE RELATÓRIOS E INSIGHTS PEDAGÓGICOS ─────────────────────────
CREATE TABLE IF NOT EXISTS pedagogical_insights (
  id               TEXT PRIMARY KEY,
  school_id        TEXT,
  class_id         TEXT,
  overall_mastery  NUMERIC(5,2),
  total_students   INT,
  at_risk_count    INT,
  top_count        INT,
  critical_topics  JSONB DEFAULT '[]',
  ai_report        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pedagogical_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on pedagogical_insights" ON pedagogical_insights;
CREATE POLICY "Allow anon full access on pedagogical_insights" ON pedagogical_insights FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- ─── 14. TABELAS DE PORTAIS ESCOLARES & AUTOMAÇÃO AGÊNTICA (NOVO) ─────────────
-- ==============================================================================

-- A. Perfis de Portais Escolares (Plurall, Machado Sobrinho, Sta Catarina + Custom)
CREATE TABLE IF NOT EXISTS school_portals (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT,
  url         TEXT NOT NULL,
  match_url   TEXT,
  icon        TEXT DEFAULT 'ti-world',
  color       TEXT DEFAULT '#8b5e3c',
  bg          TEXT DEFAULT '#faf6f0',
  border      TEXT DEFAULT '#d5c8bb',
  category    TEXT DEFAULT 'Diário & Notas',
  description TEXT,
  is_custom   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE school_portals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on school_portals" ON school_portals;
CREATE POLICY "Allow anon full access on school_portals" ON school_portals FOR ALL USING (true) WITH CHECK (true);

-- B. Ações e Rotinas Agênticas Cadastradas no Portal
CREATE TABLE IF NOT EXISTS portal_actions (
  id                  TEXT PRIMARY KEY,
  portal_id           TEXT NOT NULL REFERENCES school_portals(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'diary', -- 'diary' | 'attendance' | 'grades' | 'assignment' | 'communication' | 'custom'
  description         TEXT,
  fields              JSONB NOT NULL DEFAULT '[]', -- Array de seletores e palavras-chave
  submit_selector     TEXT,
  execution_mode      TEXT NOT NULL DEFAULT 'supervised', -- 'supervised' | 'autonomous'
  spoken_confirmation TEXT,
  is_custom           BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_actions_portal ON portal_actions(portal_id);
ALTER TABLE portal_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_actions" ON portal_actions;
CREATE POLICY "Allow anon full access on portal_actions" ON portal_actions FOR ALL USING (true) WITH CHECK (true);

-- C. Histórico de Execuções e Auditoria de Preenchimento
CREATE TABLE IF NOT EXISTS portal_execution_logs (
  id             TEXT PRIMARY KEY DEFAULT ('log_' || floor(extract(epoch from now())) || '_' || substring(md5(random()::text) from 1 for 6)),
  portal_id      TEXT NOT NULL,
  portal_name    TEXT,
  action_type    TEXT NOT NULL,
  title          TEXT NOT NULL,
  date           TEXT,
  class_ref      TEXT,
  mode           TEXT DEFAULT 'supervised',
  status         TEXT DEFAULT 'success', -- 'success' | 'error' | 'pending'
  filled_count   INT DEFAULT 0,
  extracted_data JSONB DEFAULT '{}',
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_logs_created ON portal_execution_logs(created_at DESC);
ALTER TABLE portal_execution_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_execution_logs" ON portal_execution_logs;
CREATE POLICY "Allow anon full access on portal_execution_logs" ON portal_execution_logs FOR ALL USING (true) WITH CHECK (true);

-- D. Dados Extraídos de Portais (Ground Truth Sem Alucinação)
CREATE TABLE IF NOT EXISTS portal_scraped_data (
  id          TEXT PRIMARY KEY DEFAULT ('scrap_' || floor(extract(epoch from now())) || '_' || substring(md5(random()::text) from 1 for 6)),
  portal_id   TEXT NOT NULL,
  page_url    TEXT,
  data_type   TEXT NOT NULL, -- 'grades_table' | 'attendance_list' | 'student_roster' | 'diary_history'
  class_ref   TEXT,
  raw_json    JSONB NOT NULL DEFAULT '{}', -- Dados 100% determinísticos extraídos do DOM
  item_count  INT DEFAULT 0,
  scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scraped_data_portal ON portal_scraped_data(portal_id);
ALTER TABLE portal_scraped_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_scraped_data" ON portal_scraped_data;
CREATE POLICY "Allow anon full access on portal_scraped_data" ON portal_scraped_data FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- ─── 15. MEMÓRIA DE LONGO PRAZO DA RAFINHA & REGRAS APRENDIDAS (NOVO) ───────────
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rafinha_learned_facts (
  id               TEXT PRIMARY KEY,
  category         TEXT NOT NULL, -- 'teacher_preference' | 'class_insight' | 'pedagogical_rule' | 'student_fact' | 'school_context' | 'portal_navigation_recipe'
  fact             TEXT NOT NULL,
  confidence       NUMERIC(3,2) DEFAULT 1.0,
  source           TEXT DEFAULT 'rafinha',
  context_metadata JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rafinha_memory_category ON rafinha_learned_facts(category);
ALTER TABLE rafinha_learned_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on rafinha_learned_facts" ON rafinha_learned_facts;
CREATE POLICY "Allow anon full access on rafinha_learned_facts" ON rafinha_learned_facts FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- ─── 16. INDICADORES PERSONALIZADOS & METAS DOCENTES (NOVO) ────────────────────
-- ==============================================================================
CREATE TABLE IF NOT EXISTS custom_pedagogical_indicators (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL DEFAULT 'academic',
  data_source  TEXT NOT NULL DEFAULT 'topic_filter',
  topic_filter TEXT,
  target_value NUMERIC(10,2) DEFAULT 75,
  unit         TEXT DEFAULT '%',
  color        TEXT DEFAULT '#8b5e3c',
  icon         TEXT DEFAULT 'ti-target',
  enabled      BOOLEAN DEFAULT true,
  is_custom    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE custom_pedagogical_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on custom_pedagogical_indicators" ON custom_pedagogical_indicators;
CREATE POLICY "Allow anon full access on custom_pedagogical_indicators" ON custom_pedagogical_indicators FOR ALL USING (true) WITH CHECK (true);

-- ─── FUNÇÃO E TRIGGERS DE UPDATED_AT AUTOMÁTICO ───────────────────────────
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

DROP TRIGGER IF EXISTS trg_set_updated_at_private_students ON private_students;
CREATE TRIGGER trg_set_updated_at_private_students BEFORE UPDATE ON private_students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_exams ON exams;
CREATE TRIGGER trg_set_updated_at_exams BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_lessons ON lessons;
CREATE TRIGGER trg_set_updated_at_lessons BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_mindmaps ON mindmaps;
CREATE TRIGGER trg_set_updated_at_mindmaps BEFORE UPDATE ON mindmaps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_questions ON questions;
CREATE TRIGGER trg_set_updated_at_questions BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_documents ON documents;
CREATE TRIGGER trg_set_updated_at_documents BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_meeting_diaries ON meeting_diaries;
CREATE TRIGGER trg_set_updated_at_meeting_diaries BEFORE UPDATE ON meeting_diaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_pedagogical_insights ON pedagogical_insights;
CREATE TRIGGER trg_set_updated_at_pedagogical_insights BEFORE UPDATE ON pedagogical_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_school_portals ON school_portals;
CREATE TRIGGER trg_set_updated_at_school_portals BEFORE UPDATE ON school_portals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_portal_actions ON portal_actions;
CREATE TRIGGER trg_set_updated_at_portal_actions BEFORE UPDATE ON portal_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_rafinha_learned_facts ON rafinha_learned_facts;
CREATE TRIGGER trg_set_updated_at_rafinha_learned_facts BEFORE UPDATE ON rafinha_learned_facts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_custom_pedagogical_indicators ON custom_pedagogical_indicators;
CREATE TRIGGER trg_set_updated_at_custom_pedagogical_indicators BEFORE UPDATE ON custom_pedagogical_indicators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── POVOAMENTO INICIAL DOS PORTAIS PADRÃO ───────────────────────────────────
INSERT INTO school_portals (id, name, short_name, url, match_url, icon, color, category, description, is_custom)
VALUES 
  ('machado', 'Machado Sobrinho', 'Machado', 'https://machadosobrinho.paineldoaluno.com.br/professor_painel', 'paineldoaluno.com.br', 'ti-chalkboard', '#b58900', 'Diário & Notas', 'Painel oficial de professores para lançamento de diários, frequências e notas bimestrais.', false),
  ('santacatarina', 'Rede Santa Catarina', 'Sta. Catarina', 'https://portaleducacao.redesantacatarina.org.br/auth/login', 'redesantacatarina.org.br', 'ti-shield-check', '#dc322f', 'Portal Acadêmico', 'Portal acadêmico oficial para planos de aula, pautas escolares e notas.', false),
  ('plural', 'Plurall (SOMOS Educação)', 'Plurall', 'https://www.plural.net/', 'plural.net', 'ti-notebook', '#cb4b16', 'LMS & Atividades', 'Portal de tarefas online, avaliações digitais e acompanhamento pedagógico SOMOS.', false),
  ('cambridge', 'Cambridge One', 'Cambridge', 'https://www.cambridgeone.org/', 'cambridgeone.org', 'ti-book-2', '#268bd2', 'ELT & Avaliações', 'Portal oficial Cambridge para atribuição de materiais digitais e diários de notas.', false)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  description = EXCLUDED.description;

-- ─── VERIFICAÇÃO FINAL ────────────────────────────────────────────────────────
SELECT 'Todas as 16 tabelas e módulos da Rafinha e Portais foram instalados com sucesso no Supabase!' AS status;
