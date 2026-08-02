-- ==============================================================================
-- TEACHER AI — SCHEMA RELACIONAL E POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================
-- Execute este script no SQL Editor do Supabase para criar as tabelas com RLS
-- e isolamento estrito de dados por auth.uid().
-- ==============================================================================

-- 1. Habilitar UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Escolas (schools)
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia suas próprias escolas"
  ON public.schools
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Tabela de Turmas (classes)
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  grade TEXT,
  year TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia suas próprias turmas"
  ON public.classes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Tabela de Alunos (students)
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  grades JSONB DEFAULT '{}'::jsonb,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia seus próprios alunos"
  ON public.students
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Tabela de Provas (exams)
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  title TEXT NOT NULL,
  topic TEXT,
  cefr TEXT,
  grade TEXT,
  content TEXT,
  sections JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia suas próprias provas"
  ON public.exams
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. Tabela de Aulas (lessons)
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  title TEXT NOT NULL,
  topic TEXT,
  level TEXT,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia suas próprias aulas"
  ON public.lessons
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
