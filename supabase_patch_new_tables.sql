-- ==============================================================================
-- TEACHER AI — PATCH DE NOVAS TABELAS (PORTAIS, RAFINHA & INSIGHTS)
-- Cole este script no SQL Editor: https://supabase.com/dashboard/project/parxakvjvuvsmvbvrshk/sql
-- ==============================================================================

-- ─── 1. TABELA DE ALUNOS PARTICULARES ─────────────────────────────────────────
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
ALTER TABLE private_students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on private_students" ON private_students;
CREATE POLICY "Allow anon full access on private_students" ON private_students FOR ALL USING (true) WITH CHECK (true);

-- ─── 2. TABELA DE INSIGHTS PEDAGÓGICOS ─────────────────────────────────────────
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

-- ─── 3. TABELA DE PORTAIS ESCOLARES ───────────────────────────────────────────
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

-- ─── 4. TABELA DE AÇÕES DOS PORTAIS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_actions (
  id                  TEXT PRIMARY KEY,
  portal_id           TEXT NOT NULL REFERENCES school_portals(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'diary',
  description         TEXT,
  fields              JSONB NOT NULL DEFAULT '[]',
  submit_selector     TEXT,
  execution_mode      TEXT NOT NULL DEFAULT 'supervised',
  spoken_confirmation TEXT,
  is_custom           BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE portal_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_actions" ON portal_actions;
CREATE POLICY "Allow anon full access on portal_actions" ON portal_actions FOR ALL USING (true) WITH CHECK (true);

-- ─── 5. TABELA DE HISTÓRICO DE EXECUÇÕES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_execution_logs (
  id             TEXT PRIMARY KEY DEFAULT ('log_' || floor(extract(epoch from now())) || '_' || substring(md5(random()::text) from 1 for 6)),
  portal_id      TEXT NOT NULL,
  portal_name    TEXT,
  action_type    TEXT NOT NULL,
  title          TEXT NOT NULL,
  date           TEXT,
  class_ref      TEXT,
  mode           TEXT DEFAULT 'supervised',
  status         TEXT DEFAULT 'success',
  filled_count   INT DEFAULT 0,
  extracted_data JSONB DEFAULT '{}',
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE portal_execution_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_execution_logs" ON portal_execution_logs;
CREATE POLICY "Allow anon full access on portal_execution_logs" ON portal_execution_logs FOR ALL USING (true) WITH CHECK (true);

-- ─── 6. TABELA DE DADOS EXTRAÍDOS (ZERO ALUCINAÇÃO) ───────────────────────────
CREATE TABLE IF NOT EXISTS portal_scraped_data (
  id          TEXT PRIMARY KEY DEFAULT ('scrap_' || floor(extract(epoch from now())) || '_' || substring(md5(random()::text) from 1 for 6)),
  portal_id   TEXT NOT NULL,
  page_url    TEXT,
  data_type   TEXT NOT NULL,
  class_ref   TEXT,
  raw_json    JSONB NOT NULL DEFAULT '{}',
  item_count  INT DEFAULT 0,
  scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE portal_scraped_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_scraped_data" ON portal_scraped_data;
CREATE POLICY "Allow anon full access on portal_scraped_data" ON portal_scraped_data FOR ALL USING (true) WITH CHECK (true);

-- ─── 7. TABELA DE MEMÓRIA DE LONGO PRAZO DA RAFINHA ───────────────────────────
CREATE TABLE IF NOT EXISTS rafinha_learned_facts (
  id               TEXT PRIMARY KEY,
  category         TEXT NOT NULL,
  fact             TEXT NOT NULL,
  confidence       NUMERIC(3,2) DEFAULT 1.0,
  source           TEXT DEFAULT 'rafinha',
  context_metadata JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rafinha_learned_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on rafinha_learned_facts" ON rafinha_learned_facts;
CREATE POLICY "Allow anon full access on rafinha_learned_facts" ON rafinha_learned_facts FOR ALL USING (true) WITH CHECK (true);

-- ─── 8. TABELA DE INDICADORES PERSONALIZADOS & METAS ──────────────────────────
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

-- ─── POVOAMENTO DOS PORTAIS PADRÃO ───────────────────────────────────────────
INSERT INTO school_portals (id, name, short_name, url, match_url, icon, color, category, description, is_custom)
VALUES 
  ('machado', 'Machado Sobrinho', 'Machado', 'https://machadosobrinho.paineldoaluno.com.br/professor_painel', 'paineldoaluno.com.br', 'ti-chalkboard', '#b58900', 'Diário & Notas', 'Painel oficial de professores para lançamento de diários, frequências e notas.', false),
  ('santacatarina', 'Rede Santa Catarina', 'Sta. Catarina', 'https://portaleducacao.redesantacatarina.org.br/auth/login', 'redesantacatarina.org.br', 'ti-shield-check', '#dc322f', 'Portal Acadêmico', 'Portal acadêmico oficial para planos de aula, pautas e notas.', false),
  ('plural', 'Plurall (SOMOS Educação)', 'Plurall', 'https://www.plural.net/', 'plural.net', 'ti-notebook', '#cb4b16', 'LMS & Atividades', 'Portal de tarefas online e acompanhamento pedagógico SOMOS.', false),
  ('cambridge', 'Cambridge One', 'Cambridge', 'https://www.cambridgeone.org/', 'cambridgeone.org', 'ti-book-2', '#268bd2', 'ELT & Avaliações', 'Portal oficial Cambridge para atribuição de materiais e notas.', false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url;

SELECT 'Novas tabelas criadas e portais cadastrados com sucesso no Supabase!' AS status;
