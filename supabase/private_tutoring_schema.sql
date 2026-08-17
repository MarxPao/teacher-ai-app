-- ==============================================================================
-- SCHEMA & POLÍTICAS RLS DO SUPABASE: AULAS PARTICULARES (PRIVATE TUTORING)
-- ==============================================================================

-- 1. Tabela: private_students (Alunos Individuais e Turmas Particulares)
CREATE TABLE IF NOT EXISTS public.private_students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'individual', -- 'individual' ou 'turma'
  group_members_count INTEGER,
  subject TEXT NOT NULL,
  guardian_name TEXT,
  phone TEXT,
  email TEXT,
  billing_type TEXT DEFAULT 'mensal', -- 'mensal' ou 'por_aula'
  monthly_fee NUMERIC(10,2) DEFAULT 0,
  fee_per_lesson NUMERIC(10,2),
  due_day INTEGER DEFAULT 10,
  payment_method TEXT DEFAULT 'PIX',
  last_payment_date TEXT,
  modality TEXT DEFAULT 'Online',
  schedule_info TEXT,
  days_of_week JSONB DEFAULT '[]'::jsonb, -- [1, 3] para Segundas e Quartas
  time_start TEXT,
  time_end TEXT,
  payment_status TEXT DEFAULT 'em_dia', -- 'pago', 'em_dia', 'pendente', 'atrasado'
  mastery_percentage NUMERIC(5,2) DEFAULT 75,
  goals TEXT,
  ai_diagnostic TEXT,
  roadmap JSONB DEFAULT '[]'::jsonb,
  lessons_history JSONB DEFAULT '[]'::jsonb,
  grades_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela: private_books (Biblioteca de Livros & Materiais de Aula Particular)
CREATE TABLE IF NOT EXISTS public.private_books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  subject TEXT NOT NULL DEFAULT 'Inglês',
  level TEXT,
  student_id TEXT REFERENCES public.private_students(id) ON DELETE SET NULL,
  student_name TEXT,
  pdf_url TEXT,
  units_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela: private_didactic_units (Sequência Didática da Tutoria)
CREATE TABLE IF NOT EXISTS public.private_didactic_units (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES public.private_students(id) ON DELETE CASCADE,
  student_name TEXT,
  unit_number INTEGER NOT NULL DEFAULT 1,
  unit_title TEXT NOT NULL,
  topic TEXT NOT NULL,
  grammar_focus TEXT NOT NULL,
  vocabulary_focus TEXT,
  estimated_hours NUMERIC(4,1),
  status TEXT DEFAULT 'upcoming', -- 'current', 'completed', 'upcoming'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE public.private_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_didactic_units ENABLE ROW LEVEL SECURITY;

-- Políticas para private_students
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'private_students' AND policyname = 'Allow all operations on private_students') THEN
    CREATE POLICY "Allow all operations on private_students" ON public.private_students
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Políticas para private_books
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'private_books' AND policyname = 'Allow all operations on private_books') THEN
    CREATE POLICY "Allow all operations on private_books" ON public.private_books
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Políticas para private_didactic_units
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'private_didactic_units' AND policyname = 'Allow all operations on private_didactic_units') THEN
    CREATE POLICY "Allow all operations on private_didactic_units" ON public.private_didactic_units
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
