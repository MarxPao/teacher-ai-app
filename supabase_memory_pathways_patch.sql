-- ==============================================================================
-- TEACHER AI — PATCH DE MEMÓRIA DE PATHWAYS & ENGINE DE AUTO-DESENVOLVIMENTO
-- Cole este script no SQL Editor do Supabase para habilitar a persistência
-- de trajetórias de navegação, passos atômicos, logs episódicos e anti-padrões.
-- ==============================================================================

-- ─── 1. TABELA DE PATHWAYS (CAMINHOS CONSOLIDADOS & CONFIANÇA) ───────────────
CREATE TABLE IF NOT EXISTS portal_pathways (
  id                     TEXT PRIMARY KEY,
  portal_id              TEXT NOT NULL,
  intent                 TEXT NOT NULL,
  title                  TEXT NOT NULL,
  start_url_pattern      TEXT,
  target_state_signature JSONB DEFAULT '{}'::jsonb,
  confidence_score       NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  total_runs             INT NOT NULL DEFAULT 0,
  successful_runs        INT NOT NULL DEFAULT 0,
  failed_runs            INT NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'compiled' CHECK (status IN ('experimental', 'compiled', 'deprecated')),
  metadata               JSONB DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_pathways_portal_intent ON portal_pathways(portal_id, intent);
CREATE INDEX IF NOT EXISTS idx_portal_pathways_confidence ON portal_pathways(confidence_score DESC);

ALTER TABLE portal_pathways ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_pathways" ON portal_pathways;
CREATE POLICY "Allow anon full access on portal_pathways" ON portal_pathways FOR ALL USING (true) WITH CHECK (true);


-- ─── 2. TABELA DE PASSOS ATÔMICOS DO CAMINHO ──────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_pathway_steps (
  id                 TEXT PRIMARY KEY,
  pathway_id         TEXT NOT NULL REFERENCES portal_pathways(id) ON DELETE CASCADE,
  step_order         INT NOT NULL,
  action_type        TEXT NOT NULL,
  primary_selector   TEXT,
  anchor_strategy    TEXT DEFAULT 'css_selector',
  anchor_value       TEXT,
  fallback_selectors JSONB DEFAULT '[]'::jsonb,
  action_payload     JSONB DEFAULT '{}'::jsonb,
  verification_rule  JSONB DEFAULT '{}'::jsonb,
  retry_policy       JSONB DEFAULT '{"max_attempts": 2, "backoff_ms": 500}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_pathway_steps_pathway_order ON portal_pathway_steps(pathway_id, step_order ASC);

ALTER TABLE portal_pathway_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_pathway_steps" ON portal_pathway_steps;
CREATE POLICY "Allow anon full access on portal_pathway_steps" ON portal_pathway_steps FOR ALL USING (true) WITH CHECK (true);


-- ─── 3. TABELA DE MEMÓRIA EPISÓDICA (HISTÓRICO DE ACERTOS E ERROS) ───────────
CREATE TABLE IF NOT EXISTS portal_episodes_log (
  id                TEXT PRIMARY KEY DEFAULT ('ep_' || floor(extract(epoch from now())) || '_' || substring(md5(random()::text) from 1 for 6)),
  portal_id         TEXT NOT NULL,
  intent            TEXT NOT NULL,
  pathway_id        TEXT REFERENCES portal_pathways(id) ON DELETE SET NULL,
  mode              TEXT NOT NULL DEFAULT 'compiled_fast_path',
  trajectory        JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome           TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (outcome IN ('SUCCESS', 'NO_EFFECT', 'ERROR', 'TIMEOUT')),
  error_reason      TEXT,
  execution_time_ms INT DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_episodes_portal ON portal_episodes_log(portal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_episodes_outcome ON portal_episodes_log(outcome);

ALTER TABLE portal_episodes_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_episodes_log" ON portal_episodes_log;
CREATE POLICY "Allow anon full access on portal_episodes_log" ON portal_episodes_log FOR ALL USING (true) WITH CHECK (true);


-- ─── 4. TABELA DE ANTI-PADRÕES (MEMÓRIA NEGATIVA DO QUE NÃO FAZER) ───────────
CREATE TABLE IF NOT EXISTS portal_anti_patterns (
  id                       TEXT PRIMARY KEY DEFAULT ('anti_' || floor(extract(epoch from now())) || '_' || substring(md5(random()::text) from 1 for 6)),
  portal_id                TEXT NOT NULL,
  intent                   TEXT,
  screen_signature         TEXT,
  avoid_action             JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason                   TEXT NOT NULL,
  recommended_alternative  TEXT,
  occurrence_count         INT NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_anti_patterns_portal ON portal_anti_patterns(portal_id);

ALTER TABLE portal_anti_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_anti_patterns" ON portal_anti_patterns;
CREATE POLICY "Allow anon full access on portal_anti_patterns" ON portal_anti_patterns FOR ALL USING (true) WITH CHECK (true);


-- ─── 5. POVOAMENTO INICIAL DE PATHWAY COMPILADO: MACHADO SOBRINHO ─────────────
INSERT INTO portal_pathways (
  id, portal_id, intent, title, start_url_pattern, target_state_signature,
  confidence_score, total_runs, successful_runs, failed_runs, status, metadata
) VALUES (
  'path_machado_view_schedule_v1',
  'machado',
  'view_schedule',
  'Acessar e Ler Grade Semanal de Horários (Machado Sobrinho)',
  'https://machadosobrinho.paineldoaluno.com.br/',
  '{"url_contains": "professor_horarios", "required_element": "table, [role=table]"}'::jsonb,
  0.98,
  1,
  1,
  0,
  'compiled',
  '{"author": "TeacherAI Learning Engine", "verified_live": true}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  confidence_score = EXCLUDED.confidence_score,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Passos do Pathway Compilado
INSERT INTO portal_pathway_steps (
  id, pathway_id, step_order, action_type, primary_selector,
  anchor_strategy, anchor_value, fallback_selectors, action_payload, verification_rule
) VALUES 
(
  'step_machado_sched_1',
  'path_machado_view_schedule_v1',
  1,
  'NAVIGATE',
  NULL,
  'url',
  'https://machadosobrinho.paineldoaluno.com.br/professor_horarios',
  '["a[href*=\"professor_horarios\"]", "text:Horários"]'::jsonb,
  '{"url": "https://machadosobrinho.paineldoaluno.com.br/professor_horarios"}'::jsonb,
  '{"url_contains": "professor_horarios"}'::jsonb
),
(
  'step_machado_sched_2',
  'path_machado_view_schedule_v1',
  2,
  'WAIT_SELECTOR',
  'table',
  'css_selector',
  'table, [role="table"], .table',
  '["tbody tr", "th, td"]'::jsonb,
  '{"timeout_ms": 3000}'::jsonb,
  '{"element_visible": true}'::jsonb
),
(
  'step_machado_sched_3',
  'path_machado_view_schedule_v1',
  3,
  'READ_DATA',
  'table',
  'semantic_role',
  'schedule_table',
  '["rows_extraction", "cards_fallback"]'::jsonb,
  '{"target": "schedule_grid"}'::jsonb,
  '{"min_rows": 1}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  primary_selector = EXCLUDED.primary_selector,
  anchor_value = EXCLUDED.anchor_value;

-- Anti-Padrão Inicial Conhecido: Ausência de tags <th> no portal Machado Sobrinho
INSERT INTO portal_anti_patterns (
  id, portal_id, intent, screen_signature, avoid_action, reason, recommended_alternative, occurrence_count
) VALUES (
  'anti_machado_sched_no_th',
  'machado',
  'view_schedule',
  'https://machadosobrinho.paineldoaluno.com.br/professor_horarios',
  '{"type": "QUERY_DOM", "target": "th"}'::jsonb,
  'O portal Machado Sobrinho renderiza os dias da semana na primeira linha <tr> como <td> em vez de <th>.',
  'Promover rows[0] para cabeçalho caso th esteja vazio e inspecionar texto das células.',
  3
) ON CONFLICT (id) DO UPDATE SET
  occurrence_count = portal_anti_patterns.occurrence_count + 1,
  updated_at = NOW();

SELECT 'Patch de memória de Pathways e Auto-Desenvolvimento executado com sucesso!' AS status;
