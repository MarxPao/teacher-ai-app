/**
 * execute-supabase-migration.mjs
 * Aplica schema com ADD COLUMN IF NOT EXISTS e recarga do cache PostgREST
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'parxakvjvuvsmvbvrshk'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'

const comprehensiveSql = `
-- 1. TABELA DE PERFIS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  default_subject TEXT DEFAULT 'english',
  role TEXT DEFAULT 'teacher',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_subject TEXT DEFAULT 'english';
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores visualizam seu perfil" ON public.profiles;
CREATE POLICY "Professores visualizam seu perfil" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Professores atualizam seu perfil" ON public.profiles;
CREATE POLICY "Professores atualizam seu perfil" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Inserção de perfil próprio" ON public.profiles;
CREATE POLICY "Inserção de perfil próprio" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Trigger de criação de perfil no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, default_subject)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Professor(a)'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'teacher'),
    COALESCE(NEW.raw_user_meta_data->>'default_subject', 'english')
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. TABELAS PEDAGÓGICAS (Garante coluna teacher_id)
CREATE TABLE IF NOT EXISTS public.classes (
  id TEXT PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT,
  subject TEXT DEFAULT 'english',
  year TEXT,
  created_at BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam turmas" ON public.classes;
CREATE POLICY "Professores gerenciam turmas" ON public.classes FOR ALL TO authenticated USING (teacher_id = auth.uid() OR teacher_id IS NULL) WITH CHECK (teacher_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id TEXT,
  name TEXT NOT NULL,
  roll_number TEXT,
  level TEXT,
  tags TEXT[],
  created_at BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam alunos" ON public.students;
CREATE POLICY "Professores gerenciam alunos" ON public.students FOR ALL TO authenticated USING (teacher_id = auth.uid() OR teacher_id IS NULL) WITH CHECK (teacher_id = auth.uid());

-- 3. FILA DE TAREFAS DO BROWSER HARNESS
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
ALTER TABLE public.browser_automation_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam suas tasks" ON public.browser_automation_tasks;
CREATE POLICY "Professores gerenciam suas tasks" ON public.browser_automation_tasks FOR ALL TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- 4. LOGS DE AUDITORIA IMUTÁVEIS
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
ALTER TABLE public.browser_automation_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores visualizam logs" ON public.browser_automation_audit_logs;
CREATE POLICY "Professores visualizam logs" ON public.browser_automation_audit_logs FOR SELECT TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Professores inserem logs" ON public.browser_automation_audit_logs;
CREATE POLICY "Professores inserem logs" ON public.browser_automation_audit_logs FOR INSERT TO authenticated WITH CHECK (teacher_id = auth.uid());

-- 5. BUCKET DE SCREENSHOTS COMPROBATÓRIAS
INSERT INTO storage.buckets (id, name, public) VALUES ('automation-screenshots', 'automation-screenshots', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Acesso restrito ao professor nas screenshots" ON storage.objects;
CREATE POLICY "Acesso restrito ao professor nas screenshots" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'automation-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'automation-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 6. REPLICAÇÃO REALTIME
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'browser_automation_tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.browser_automation_tasks;
  END IF;
END $$;

-- 7. RECARREGA CACHE DO SCHEMA POSTGREST
NOTIFY pgrst, 'reload schema';
`

async function run() {
  console.log('🚀 Executando SQL completo com o Management API Token...')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: comprehensiveSql })
  })

  console.log(`Status de Execução: HTTP ${res.status} ${res.statusText}`)
  const text = await res.text()
  console.log('Resultado SQL:', text)

  // Aguarda 1s para o PostgREST recarregar o schema cache
  await new Promise(r => setTimeout(r, 1500))

  // Verificações finais
  console.log('\n🔍 Verificando tabelas via REST API:')

  const check1 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=count`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  })
  console.log(`1. public.profiles: HTTP ${check1.status} ${check1.statusText}`)

  const check2 = await fetch(`${SUPABASE_URL}/rest/v1/browser_automation_tasks?select=count`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  })
  console.log(`2. public.browser_automation_tasks: HTTP ${check2.status} ${check2.statusText}`)

  const check3 = await fetch(`${SUPABASE_URL}/rest/v1/browser_automation_audit_logs?select=count`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  })
  console.log(`3. public.browser_automation_audit_logs: HTTP ${check3.status} ${check3.statusText}`)

  const check4 = await fetch(`${SUPABASE_URL}/rest/v1/classes?select=count`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  })
  console.log(`4. public.classes: HTTP ${check4.status} ${check4.statusText}`)
}

run()
