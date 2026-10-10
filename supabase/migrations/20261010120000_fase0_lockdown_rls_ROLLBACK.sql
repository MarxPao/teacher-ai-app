-- ==============================================================================
-- ROLLBACK: FASE 0 LOCKDOWN RLS (RESTAURAÇÃO DAS POLÍTICAS ORIGINAIS)
-- ==============================================================================
-- Finalidade:
-- Reverter a migração `20261010120000_fase0_lockdown_rls.sql`, recriando as políticas
-- permissivas de acesso anônimo exatamente como constavam em `supabase_setup.sql`.
-- 
-- ATENÇÃO: Executar este script re-expõe os dados de alunos ao papel `anon`.
-- ==============================================================================

-- 1. TEACHER_SYNC
DROP POLICY IF EXISTS "Allow authenticated access on teacher_sync" ON teacher_sync;
DROP POLICY IF EXISTS "Allow anon full access on teacher_sync" ON teacher_sync;
CREATE POLICY "Allow anon full access on teacher_sync" ON teacher_sync FOR ALL USING (true) WITH CHECK (true);

-- 2. SCHOOLS
DROP POLICY IF EXISTS "Allow authenticated access on schools" ON schools;
DROP POLICY IF EXISTS "Allow anon full access on schools" ON schools;
CREATE POLICY "Allow anon full access on schools" ON schools FOR ALL USING (true) WITH CHECK (true);

-- 3. CLASSES
DROP POLICY IF EXISTS "Allow authenticated access on classes" ON classes;
DROP POLICY IF EXISTS "Allow anon full access on classes" ON classes;
CREATE POLICY "Allow anon full access on classes" ON classes FOR ALL USING (true) WITH CHECK (true);

-- 4. STUDENTS
DROP POLICY IF EXISTS "Allow authenticated access on students" ON students;
DROP POLICY IF EXISTS "Allow anon full access on students" ON students;
CREATE POLICY "Allow anon full access on students" ON students FOR ALL USING (true) WITH CHECK (true);

-- 5. PRIVATE_STUDENTS
DROP POLICY IF EXISTS "Allow authenticated access on private_students" ON private_students;
DROP POLICY IF EXISTS "Allow anon full access on private_students" ON private_students;
CREATE POLICY "Allow anon full access on private_students" ON private_students FOR ALL USING (true) WITH CHECK (true);

-- 6. EXAMS
DROP POLICY IF EXISTS "Allow authenticated access on exams" ON exams;
DROP POLICY IF EXISTS "Allow anon full access on exams" ON exams;
CREATE POLICY "Allow anon full access on exams" ON exams FOR ALL USING (true) WITH CHECK (true);

-- 7. LESSONS
DROP POLICY IF EXISTS "Allow authenticated access on lessons" ON lessons;
DROP POLICY IF EXISTS "Allow anon full access on lessons" ON lessons;
CREATE POLICY "Allow anon full access on lessons" ON lessons FOR ALL USING (true) WITH CHECK (true);

-- 8. MINDMAPS
DROP POLICY IF EXISTS "Allow authenticated access on mindmaps" ON mindmaps;
DROP POLICY IF EXISTS "Allow anon full access on mindmaps" ON mindmaps;
CREATE POLICY "Allow anon full access on mindmaps" ON mindmaps FOR ALL USING (true) WITH CHECK (true);

-- 9. QUESTIONS
DROP POLICY IF EXISTS "Allow authenticated access on questions" ON questions;
DROP POLICY IF EXISTS "Allow anon full access on questions" ON questions;
CREATE POLICY "Allow anon full access on questions" ON questions FOR ALL USING (true) WITH CHECK (true);

-- 10. DOCUMENTS
DROP POLICY IF EXISTS "Allow authenticated access on documents" ON documents;
DROP POLICY IF EXISTS "Allow anon full access on documents" ON documents;
CREATE POLICY "Allow anon full access on documents" ON documents FOR ALL USING (true) WITH CHECK (true);

-- 11. MEETING_DIARIES
DROP POLICY IF EXISTS "Allow authenticated access on meeting_diaries" ON meeting_diaries;
DROP POLICY IF EXISTS "Allow anon full access on meeting_diaries" ON meeting_diaries;
CREATE POLICY "Allow anon full access on meeting_diaries" ON meeting_diaries FOR ALL USING (true) WITH CHECK (true);

-- 12. RUBRICS_AND_ANSWER_KEYS
DROP POLICY IF EXISTS "Allow authenticated access on rubrics" ON rubrics_and_answer_keys;
DROP POLICY IF EXISTS "Allow anon full access on rubrics" ON rubrics_and_answer_keys;
CREATE POLICY "Allow anon full access on rubrics" ON rubrics_and_answer_keys FOR ALL USING (true) WITH CHECK (true);

-- 13. PEDAGOGICAL_INSIGHTS
DROP POLICY IF EXISTS "Allow authenticated access on pedagogical_insights" ON pedagogical_insights;
DROP POLICY IF EXISTS "Allow anon full access on pedagogical_insights" ON pedagogical_insights;
CREATE POLICY "Allow anon full access on pedagogical_insights" ON pedagogical_insights FOR ALL USING (true) WITH CHECK (true);

-- 14. SCHOOL_PORTALS
DROP POLICY IF EXISTS "Allow authenticated access on school_portals" ON school_portals;
DROP POLICY IF EXISTS "Allow anon full access on school_portals" ON school_portals;
CREATE POLICY "Allow anon full access on school_portals" ON school_portals FOR ALL USING (true) WITH CHECK (true);

-- 15. PORTAL_ACTIONS
DROP POLICY IF EXISTS "Allow authenticated access on portal_actions" ON portal_actions;
DROP POLICY IF EXISTS "Allow anon full access on portal_actions" ON portal_actions;
CREATE POLICY "Allow anon full access on portal_actions" ON portal_actions FOR ALL USING (true) WITH CHECK (true);

-- 16. PORTAL_EXECUTION_LOGS
DROP POLICY IF EXISTS "Allow authenticated access on portal_execution_logs" ON portal_execution_logs;
DROP POLICY IF EXISTS "Allow anon full access on portal_execution_logs" ON portal_execution_logs;
CREATE POLICY "Allow anon full access on portal_execution_logs" ON portal_execution_logs FOR ALL USING (true) WITH CHECK (true);

-- 17. PORTAL_SCRAPED_DATA
DROP POLICY IF EXISTS "Allow authenticated access on portal_scraped_data" ON portal_scraped_data;
DROP POLICY IF EXISTS "Allow anon full access on portal_scraped_data" ON portal_scraped_data;
CREATE POLICY "Allow anon full access on portal_scraped_data" ON portal_scraped_data FOR ALL USING (true) WITH CHECK (true);

-- 18. RAFINHA_LEARNED_FACTS
DROP POLICY IF EXISTS "Allow authenticated access on rafinha_learned_facts" ON rafinha_learned_facts;
DROP POLICY IF EXISTS "Allow anon full access on rafinha_learned_facts" ON rafinha_learned_facts;
CREATE POLICY "Allow anon full access on rafinha_learned_facts" ON rafinha_learned_facts FOR ALL USING (true) WITH CHECK (true);

-- 19. CUSTOM_PEDAGOGICAL_INDICATORS
DROP POLICY IF EXISTS "Allow authenticated access on custom_pedagogical_indicators" ON custom_pedagogical_indicators;
DROP POLICY IF EXISTS "Allow anon full access on custom_pedagogical_indicators" ON custom_pedagogical_indicators;
CREATE POLICY "Allow anon full access on custom_pedagogical_indicators" ON custom_pedagogical_indicators FOR ALL USING (true) WITH CHECK (true);
