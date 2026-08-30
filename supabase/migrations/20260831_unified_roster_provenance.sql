-- ============================================================================
-- Migration: 20260831_unified_roster_provenance.sql
-- Rastreabilidade de Origem (Portal Escolar como Fonte de Verdade) e Log de Sincronização
-- ============================================================================

-- 1. Rastreabilidade de Origem em Turmas (classes)
ALTER TABLE IF EXISTS public.classes 
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual_entry' 
    CHECK (source_type IN ('portal_scrape', 'trello_import', 'manual_entry', 'csv_import')),
  ADD COLUMN IF NOT EXISTS source_portal TEXT,
  ADD COLUMN IF NOT EXISTS portal_native_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 2. Rastreabilidade de Origem e Identidade do Aluno (students)
ALTER TABLE IF EXISTS public.students 
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual_entry' 
    CHECK (source_type IN ('portal_scrape', 'trello_import', 'manual_entry', 'csv_import')),
  ADD COLUMN IF NOT EXISTS source_portal TEXT,
  ADD COLUMN IF NOT EXISTS portal_native_id TEXT,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'local_only'
    CHECK (sync_status IN ('synced', 'local_only', 'conflict_pending')),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 3. Índices para Reconciliação Rápida e Idempotência
CREATE INDEX IF NOT EXISTS idx_students_portal_native ON public.students(teacher_id, source_portal, portal_native_id);
CREATE INDEX IF NOT EXISTS idx_students_class_source ON public.students(teacher_id, class_id, source_type);

-- 4. Tabela de Histórico de Sincronizações e Auditoria LGPD
CREATE TABLE IF NOT EXISTS public.teacher_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portal TEXT NOT NULL,
  class_ref TEXT,
  action_type TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  merged_count INTEGER NOT NULL DEFAULT 0,
  conflicts_count INTEGER NOT NULL DEFAULT 0,
  unmatched_local_count INTEGER NOT NULL DEFAULT 0,
  summary_details JSONB DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.teacher_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores visualizam apenas seus logs de sincronizacao" ON public.teacher_sync_log;
CREATE POLICY "Professores visualizam apenas seus logs de sincronizacao" 
  ON public.teacher_sync_log FOR SELECT TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Professores inserem seus proprios logs de sincronizacao" ON public.teacher_sync_log;
CREATE POLICY "Professores inserem seus proprios logs de sincronizacao" 
  ON public.teacher_sync_log FOR INSERT TO authenticated WITH CHECK (teacher_id = auth.uid());
