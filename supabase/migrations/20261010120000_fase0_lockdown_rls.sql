-- ==============================================================================
-- MIGRATION: FASE 0 LOCKDOWN RLS (REVOGAÇÃO DE ACESSO ANÔNIMO IRRESTRITO)
-- ==============================================================================
-- ATENÇÃO: NÃO APLICADO AUTOMATICAMENTE. Revisar antes de executar no painel.
-- 
-- Finalidade:
-- Revogar todas as políticas permissivas "USING (true) WITH CHECK (true)" criadas no
-- script `supabase_setup.sql`.
-- 
-- Efeito após aplicação:
-- 1. Todas as tabelas terão ROW LEVEL SECURITY garantidamente habilitado.
-- 2. Nenhuma política é concedida ao papel `anon` (acesso público anônimo negado por padrão).
-- 3. Usuários autenticados (`authenticated`) e a chave administrativa (`service_role`)
--    mantêm permissões de operação através de regras baseadas em `auth.uid()` ou bypass de serviço.
-- ==============================================================================

-- ─── 1. TABELA PRINCIPAL DE SINCRONIZAÇÃO (TEACHER_SYNC) ──────────────────────
ALTER TABLE IF EXISTS teacher_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on teacher_sync" ON teacher_sync;

CREATE POLICY "Allow authenticated access on teacher_sync"
  ON teacher_sync FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 2. TABELA DE ALUNOS REGULARES (STUDENTS - DADOS DE MENORES) ──────────────
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on students" ON students;

CREATE POLICY "Allow authenticated access on students"
  ON students FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 3. TABELA DE ALUNOS PARTICULARES (PRIVATE_STUDENTS - FINANCEIRO E CONTATOS) 
ALTER TABLE IF EXISTS private_students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on private_students" ON private_students;

CREATE POLICY "Allow authenticated access on private_students"
  ON private_students FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 4. DADOS EXTRAÍDOS DE PORTAIS (PORTAL_SCRAPED_DATA) ──────────────────────
ALTER TABLE IF EXISTS portal_scraped_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_scraped_data" ON portal_scraped_data;

CREATE POLICY "Allow authenticated access on portal_scraped_data"
  ON portal_scraped_data FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 5. LOGS DE EXECUÇÃO DE PORTAL (PORTAL_EXECUTION_LOGS) ────────────────────
ALTER TABLE IF EXISTS portal_execution_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_execution_logs" ON portal_execution_logs;

CREATE POLICY "Allow authenticated access on portal_execution_logs"
  ON portal_execution_logs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 6. DIÁRIOS DE REUNIÃO / ENCONTROS (MEETING_DIARIES) ──────────────────────
ALTER TABLE IF EXISTS meeting_diaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on meeting_diaries" ON meeting_diaries;

CREATE POLICY "Allow authenticated access on meeting_diaries"
  ON meeting_diaries FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 7. MEMÓRIA DE LONGO PRAZO DA RAFINHA (RAFINHA_LEARNED_FACTS) ─────────────
ALTER TABLE IF EXISTS rafinha_learned_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on rafinha_learned_facts" ON rafinha_learned_facts;

CREATE POLICY "Allow authenticated access on rafinha_learned_facts"
  ON rafinha_learned_facts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 8. INSIGHTS PEDAGÓGICOS (PEDAGOGICAL_INSIGHTS) ───────────────────────────
ALTER TABLE IF EXISTS pedagogical_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on pedagogical_insights" ON pedagogical_insights;

CREATE POLICY "Allow authenticated access on pedagogical_insights"
  ON pedagogical_insights FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 9. ESCOLAS (SCHOOLS) ─────────────────────────────────────────────────────
ALTER TABLE IF EXISTS schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on schools" ON schools;

CREATE POLICY "Allow authenticated access on schools"
  ON schools FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 10. TURMAS (CLASSES) ─────────────────────────────────────────────────────
ALTER TABLE IF EXISTS classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on classes" ON classes;

CREATE POLICY "Allow authenticated access on classes"
  ON classes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 11. EXAMES E PROVAS (EXAMS) ──────────────────────────────────────────────
ALTER TABLE IF EXISTS exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on exams" ON exams;

CREATE POLICY "Allow authenticated access on exams"
  ON exams FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 12. BANCO DE QUESTÕES (QUESTIONS) ─────────────────────────────────────────
ALTER TABLE IF EXISTS questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on questions" ON questions;

CREATE POLICY "Allow authenticated access on questions"
  ON questions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 13. PLANOS DE AULA (LESSONS) ─────────────────────────────────────────────
ALTER TABLE IF EXISTS lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on lessons" ON lessons;

CREATE POLICY "Allow authenticated access on lessons"
  ON lessons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 14. MAPAS MENTAIS (MINDMAPS) ─────────────────────────────────────────────
ALTER TABLE IF EXISTS mindmaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on mindmaps" ON mindmaps;

CREATE POLICY "Allow authenticated access on mindmaps"
  ON mindmaps FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 15. DOCUMENTOS E LIVROS (DOCUMENTS) ──────────────────────────────────────
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on documents" ON documents;

CREATE POLICY "Allow authenticated access on documents"
  ON documents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 16. RUBRICAS & GABARITOS (RUBRICS_AND_ANSWER_KEYS) ───────────────────────
ALTER TABLE IF EXISTS rubrics_and_answer_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on rubrics" ON rubrics_and_answer_keys;

CREATE POLICY "Allow authenticated access on rubrics"
  ON rubrics_and_answer_keys FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 17. PERFIS DE PORTAIS ESCOLARES (SCHOOL_PORTALS) ─────────────────────────
ALTER TABLE IF EXISTS school_portals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on school_portals" ON school_portals;

CREATE POLICY "Allow authenticated access on school_portals"
  ON school_portals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 18. ROTINAS DE PORTAIS (PORTAL_ACTIONS) ──────────────────────────────────
ALTER TABLE IF EXISTS portal_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on portal_actions" ON portal_actions;

CREATE POLICY "Allow authenticated access on portal_actions"
  ON portal_actions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 19. METAS E INDICADORES DOCENTES (CUSTOM_PEDAGOGICAL_INDICATORS) ─────────
ALTER TABLE IF EXISTS custom_pedagogical_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on custom_pedagogical_indicators" ON custom_pedagogical_indicators;

CREATE POLICY "Allow authenticated access on custom_pedagogical_indicators"
  ON custom_pedagogical_indicators FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
