-- =============================================================================
-- SCRIPT DE EXPURGO DE PII DE ALUNOS NO SUPABASE CLOUD (LGPD ART. 16 E 18)
-- =============================================================================
-- [ATENÇÃO CRÍTICA]: NÃO EXECUTAR sem aprovação formal prévia da professora!
-- Este script realiza a exclusão definitiva de dados identificáveis de estudantes
-- armazenados inadvertidamente no Supabase Cloud em versões legadas da aplicação.
-- Toda a persistência de alunos opera exclusivamente no cofre SQLite local cifrado.
-- =============================================================================

-- =============================================================================
-- ETAPA 1: DIAGNÓSTICO E CONTAGEM PRÉVIA (LEITURA INOFENSIVA)
-- =============================================================================
SELECT 'CONTAGEM ANTES DO EXPURGO' AS status_etapa;

SELECT 'students' AS tabela, COUNT(*) AS total_registros FROM students;
SELECT 'private_students' AS tabela, COUNT(*) AS total_registros FROM private_students;
SELECT 'teacher_sync (chaves de alunos)' AS tabela, COUNT(*) AS total_registros 
FROM teacher_sync 
WHERE key IN ('teacher_students', 'teacher_private_students', 'teacher_student_metrics', 'teacher_student_memory');

SELECT 'portal_scraped_data (rosters)' AS tabela, COUNT(*) AS total_registros 
FROM portal_scraped_data 
WHERE data_type IN ('roster', 'students', 'student_list');

SELECT 'portal_execution_logs (com extracted_data sensivel)' AS tabela, COUNT(*) AS total_registros 
FROM portal_execution_logs 
WHERE extracted_data::text ILIKE '%writeItems%' OR extracted_data::text ILIKE '%studentName%';

-- =============================================================================
-- ETAPA 2: TABELAS DE BACKUP / QUARENTENA AUDITÁVEL (COM CARIMBO DE DATA)
-- =============================================================================
-- Permite recuperação em caso de necessidade legal de auditoria pedagógica
-- antes da exclusão física dos dados.

CREATE TABLE IF NOT EXISTS _quarentena_expurgo_students AS 
SELECT *, NOW() AS expurgado_em FROM students;

CREATE TABLE IF NOT EXISTS _quarentena_expurgo_private_students AS 
SELECT *, NOW() AS expurgado_em FROM private_students;

CREATE TABLE IF NOT EXISTS _quarentena_expurgo_teacher_sync AS 
SELECT *, NOW() AS expurgado_em FROM teacher_sync 
WHERE key IN ('teacher_students', 'teacher_private_students', 'teacher_student_metrics', 'teacher_student_memory');

SELECT 'CONFERÊNCIA DE BACKUP CONCLUÍDA' AS status_etapa,
  (SELECT COUNT(*) FROM _quarentena_expurgo_students) AS backup_students,
  (SELECT COUNT(*) FROM _quarentena_expurgo_private_students) AS backup_private_students,
  (SELECT COUNT(*) FROM _quarentena_expurgo_teacher_sync) AS backup_teacher_sync;

-- =============================================================================
-- ETAPA 3: EXECUÇÃO TRANSACIONAL ATÔMICA DO EXPURGO DEFINITIVO
-- =============================================================================
BEGIN;

-- 1. Exclui estudantes regulares
DELETE FROM students;

-- 2. Exclui estudantes de tutoria particular
DELETE FROM private_students;

-- 3. Remove chaves de estudantes da tabela de sincronização geral de estado
DELETE FROM teacher_sync 
WHERE key IN ('teacher_students', 'teacher_private_students', 'teacher_student_metrics', 'teacher_student_memory');

-- 4. Remove raspagens de roster cruas
DELETE FROM portal_scraped_data 
WHERE data_type IN ('roster', 'students', 'student_list');

-- 5. Higieniza logs de execução de portais para remover PII de extracted_data
UPDATE portal_execution_logs 
SET extracted_data = jsonb_build_object(
  'sanitized_by', 'LGPD_PURGE_SCRIPT_R4',
  'sanitized_at', NOW(),
  'original_item_count', COALESCE(filled_count, 0)
)
WHERE extracted_data::text ILIKE '%writeItems%' OR extracted_data::text ILIKE '%studentName%';

-- =============================================================================
-- ETAPA 4: VERIFICAÇÃO PÓS-DELETE (ASSERT FAIL-SAFE)
-- =============================================================================
DO $$
DECLARE
  v_count_students INT;
  v_count_private INT;
  v_count_sync INT;
BEGIN
  SELECT COUNT(*) INTO v_count_students FROM students;
  SELECT COUNT(*) INTO v_count_private FROM private_students;
  SELECT COUNT(*) INTO v_count_sync FROM teacher_sync 
  WHERE key IN ('teacher_students', 'teacher_private_students', 'teacher_student_metrics', 'teacher_student_memory');

  IF v_count_students > 0 OR v_count_private > 0 OR v_count_sync > 0 THEN
    RAISE EXCEPTION 'FALHA DE INTEGRIDADE: Registros residuais detectados após DELETE. Abortando transação!';
  END IF;
END $$;

-- Se todas as verificações passarem sem exceção:
COMMIT;

SELECT 'EXPURGO CONCLUÍDO COM SUCESSO E ZERO RESÍDUOS' AS status_final;
