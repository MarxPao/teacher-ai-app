-- ============================================================================
-- Teacher AI App — 01_auth_profiles_and_rls.sql
-- Estruturação Completa de Autenticação, Perfis de Professores e Segurança RLS
-- ============================================================================

-- 1. Criação da Tabela de Perfis Docentes (public.profiles)
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

-- Habilita RLS na tabela profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para profiles
DROP POLICY IF EXISTS "Professores podem visualizar seu próprio perfil" ON public.profiles;
CREATE POLICY "Professores podem visualizar seu próprio perfil" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Professores podem atualizar seu próprio perfil" ON public.profiles;
CREATE POLICY "Professores podem atualizar seu próprio perfil" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Inserção de perfil para o próprio usuário" ON public.profiles;
CREATE POLICY "Inserção de perfil para o próprio usuário" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- 2. Trigger PostgreSQL para criar perfil automaticamente no SignUp
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
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disparo do Trigger após inserção em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Isolamento RLS para Tabelas de Conteúdo Pedagógico

-- Classes / Turmas
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
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam apenas suas próprias turmas" ON public.classes;
CREATE POLICY "Professores gerenciam apenas suas próprias turmas" ON public.classes
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- Alunos / Students
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  roll_number TEXT,
  level TEXT,
  tags TEXT[],
  created_at BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam apenas seus próprios alunos" ON public.students;
CREATE POLICY "Professores gerenciam apenas seus próprios alunos" ON public.students
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- Avaliações / Exams
CREATE TABLE IF NOT EXISTS public.exams (
  id TEXT PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT DEFAULT 'english',
  grade TEXT,
  total_points NUMERIC,
  questions JSONB,
  created_at BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam apenas suas próprias provas" ON public.exams;
CREATE POLICY "Professores gerenciam apenas suas próprias provas" ON public.exams
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- Planos de Aula / Lessons
CREATE TABLE IF NOT EXISTS public.lessons (
  id TEXT PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT DEFAULT 'english',
  content JSONB,
  created_at BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam apenas seus próprios planos" ON public.lessons;
CREATE POLICY "Professores gerenciam apenas seus próprios planos" ON public.lessons
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- Sincronização e Auditoria (teacher_sync)
CREATE TABLE IF NOT EXISTS public.teacher_sync (
  id TEXT PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.teacher_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sincronização isolada por professor" ON public.teacher_sync;
CREATE POLICY "Sincronização isolada por professor" ON public.teacher_sync
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- Índices para alta performance de consulta
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_students_teacher_id ON public.students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_teacher_id ON public.exams(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher_id ON public.lessons(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_sync_teacher_id ON public.teacher_sync(teacher_id);
