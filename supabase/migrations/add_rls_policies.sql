-- ============================================================================
-- Teacher AI App — Políticas de Segurança de Nível de Linha (RLS)
-- Isolamento multi-professor rigoroso baseado em auth.uid()
-- ============================================================================

-- 1. Tabela de Turmas (classes)
ALTER TABLE IF EXISTS classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS classes ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS classes ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT 'english';

DROP POLICY IF EXISTS "Professores gerenciam apenas suas próprias turmas" ON classes;
CREATE POLICY "Professores gerenciam apenas suas próprias turmas" ON classes
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- 2. Tabela de Alunos (students)
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS students ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Professores gerenciam apenas seus próprios alunos" ON students;
CREATE POLICY "Professores gerenciam apenas seus próprios alunos" ON students
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- 3. Tabela de Avaliações / Provas (exams)
ALTER TABLE IF EXISTS exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exams ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS exams ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT 'english';

DROP POLICY IF EXISTS "Professores gerenciam apenas suas próprias provas" ON exams;
CREATE POLICY "Professores gerenciam apenas suas próprias provas" ON exams
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- 4. Tabela de Planos de Aula (lessons)
ALTER TABLE IF EXISTS lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lessons ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Professores gerenciam apenas seus próprios planos" ON lessons;
CREATE POLICY "Professores gerenciam apenas seus próprios planos" ON lessons
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- 5. Tabela de Banco de Questões (questions)
ALTER TABLE IF EXISTS questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS questions ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS questions ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT 'english';

DROP POLICY IF EXISTS "Professores gerenciam suas questões" ON questions;
CREATE POLICY "Professores gerenciam suas questões" ON questions
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- 6. Tabela de Mapas Mentais (mindmaps)
ALTER TABLE IF EXISTS mindmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS mindmaps ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Professores gerenciam seus mapas mentais" ON mindmaps;
CREATE POLICY "Professores gerenciam seus mapas mentais" ON mindmaps
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());

-- 7. Tabela de Sincronização Geral (teacher_sync)
ALTER TABLE IF EXISTS teacher_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS teacher_sync ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Sincronização isolada por professor" ON teacher_sync;
CREATE POLICY "Sincronização isolada por professor" ON teacher_sync
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR teacher_id IS NULL)
  WITH CHECK (teacher_id = auth.uid());
