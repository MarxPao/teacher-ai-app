-- ============================================================================
-- Migration: 20260822191500_browser_automation.sql
-- Browser Harness (CDP) — Fila de Tarefas, Logs de Auditoria Imutáveis e Storage
-- ============================================================================

-- 1. Tabela de Tarefas de Automação de Navegador (browser_automation_tasks)
CREATE TABLE IF NOT EXISTS public.browser_automation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
  portal TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'pending_approval', 'approved', 'running', 'done', 'error', 'aborted')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_mode TEXT NOT NULL DEFAULT 'batch' CHECK (approval_mode IN ('item', 'batch')),
  class_ref TEXT,
  student_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilita RLS em browser_automation_tasks
ALTER TABLE public.browser_automation_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores visualizam apenas suas tarefas de automação" ON public.browser_automation_tasks;
CREATE POLICY "Professores visualizam apenas suas tarefas de automação" ON public.browser_automation_tasks
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Professores criam tarefas de automação para si" ON public.browser_automation_tasks;
CREATE POLICY "Professores criam tarefas de automação para si" ON public.browser_automation_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Professores atualizam apenas suas próprias tarefas" ON public.browser_automation_tasks;
CREATE POLICY "Professores atualizam apenas suas próprias tarefas" ON public.browser_automation_tasks
  FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Professores removem apenas suas próprias tarefas" ON public.browser_automation_tasks;
CREATE POLICY "Professores removem apenas suas próprias tarefas" ON public.browser_automation_tasks
  FOR DELETE
  TO authenticated
  USING (teacher_id = auth.uid());

-- 2. Tabela de Auditoria Imutável (browser_automation_audit_logs)
CREATE TABLE IF NOT EXISTS public.browser_automation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.browser_automation_tasks(id) ON DELETE CASCADE,
  trace_id UUID NOT NULL,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  before_state JSONB,
  after_state JSONB,
  diff JSONB,
  screenshot_url TEXT,
  model_used TEXT,
  confidence_flag TEXT CHECK (confidence_flag IN ('seletor_mapeado', 'visual_inferido')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilita RLS em browser_automation_audit_logs
ALTER TABLE public.browser_automation_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de Imutabilidade Estrita: Apenas INSERT e SELECT são permitidos
DROP POLICY IF EXISTS "Professores visualizam seus próprios logs de auditoria" ON public.browser_automation_audit_logs;
CREATE POLICY "Professores visualizam seus próprios logs de auditoria" ON public.browser_automation_audit_logs
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Inserção de log de auditoria pelo professor autenticado" ON public.browser_automation_audit_logs;
CREATE POLICY "Inserção de log de auditoria pelo professor autenticado" ON public.browser_automation_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid());

-- NOTA DE SEGURANÇA: Não são criadas políticas de UPDATE ou DELETE para browser_automation_audit_logs.
-- Isso torna a tabela estritamente de append-only (imutável), garantindo validade jurídica e compliance.

-- 3. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_browser_tasks_teacher_status ON public.browser_automation_tasks(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_browser_tasks_trace_id ON public.browser_automation_tasks(trace_id);
CREATE INDEX IF NOT EXISTS idx_browser_audit_task_id ON public.browser_automation_audit_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_browser_audit_teacher_id ON public.browser_automation_audit_logs(teacher_id);

-- 4. Criação do Bucket de Storage Privado para Screenshots (automation-screenshots)
INSERT INTO storage.buckets (id, name, public)
VALUES ('automation-screenshots', 'automation-screenshots', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Políticas de Storage para automation-screenshots
DROP POLICY IF EXISTS "Professores visualizam apenas seus próprios screenshots" ON storage.objects;
CREATE POLICY "Professores visualizam apenas seus próprios screenshots" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'automation-screenshots' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Professores enviam screenshots para sua própria pasta" ON storage.objects;
CREATE POLICY "Professores enviam screenshots para sua própria pasta" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'automation-screenshots' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Habilitação de Realtime no Supabase para Escuta Ativa pelo Sidecar Desktop
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'browser_automation_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.browser_automation_tasks;
  END IF;
END $$;
