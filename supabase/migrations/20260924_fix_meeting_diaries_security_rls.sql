-- ==============================================================================
-- MIGRATION DE SEGURANÇA: FECHAMENTO DE RLS E RECONCILIAÇÃO EM meeting_diaries
-- Contexto de Execução: Service Role / Superuser (Idempotente e Resiliente)
-- ==============================================================================

-- 1. Garantir existência da coluna canônica teacher_id
ALTER TABLE public.meeting_diaries 
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Se a instalação possuir exatamente 1 único professor registrado na base,
--    atribuir com segurança os registros legados órfãos a este único usuário.
DO $$
DECLARE
  v_user_count INT;
  v_single_user_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_user_count FROM auth.users;
  
  -- Heurística determinística segura: se só existe 1 conta cadastrada,
  -- todos os registros legados pertencem necessariamente a ela.
  IF v_user_count = 1 THEN
    SELECT id INTO v_single_user_id FROM auth.users LIMIT 1;
    
    UPDATE public.meeting_diaries 
      SET teacher_id = v_single_user_id 
      WHERE teacher_id IS NULL;
      
    RAISE NOTICE 'Reconciliação Automática: % registros atribuídos ao único professor cadastrado (%).', 
      (SELECT COUNT(*) FROM public.meeting_diaries WHERE teacher_id = v_single_user_id), v_single_user_id;
  ELSE
    RAISE NOTICE 'Ambiente Multi-usuário (% usuários): registros órfãos mantidos com teacher_id NULL para quarentena/claim.', v_user_count;
  END IF;
END $$;

-- 3. Revogar totalmente políticas legadas públicas e anônimas
DROP POLICY IF EXISTS "Allow anon full access on meeting_diaries" ON public.meeting_diaries;
DROP POLICY IF EXISTS "Professores gerenciam exclusivamente seus próprios diários de reunião" ON public.meeting_diaries;
DROP POLICY IF EXISTS "meeting_diaries_teacher_isolation" ON public.meeting_diaries;
DROP POLICY IF EXISTS "meeting_diaries_admin_quarantine" ON public.meeting_diaries;
DROP POLICY IF EXISTS "meeting_diaries_self_healing_claim" ON public.meeting_diaries;

-- 4. Habilitar RLS estrita
ALTER TABLE public.meeting_diaries ENABLE ROW LEVEL SECURITY;

-- 4.1. POLÍTICA PRINCIPAL: Professores gerenciam seus próprios registros
CREATE POLICY "meeting_diaries_teacher_isolation"
  ON public.meeting_diaries FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- 4.2. POLÍTICA DE QUARENTENA: Administradores auditam e visualizam registros órfãos
CREATE POLICY "meeting_diaries_admin_quarantine"
  ON public.meeting_diaries FOR SELECT
  TO authenticated
  USING (
    teacher_id IS NULL 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 4.3. POLÍTICA DE GESTÃO ADMIN: Administradores podem retificar ou atribuir órfãos
CREATE POLICY "meeting_diaries_admin_triage"
  ON public.meeting_diaries FOR UPDATE
  TO authenticated
  USING (
    teacher_id IS NULL 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 5. Revogação explícita de privilégios para role anônima (Proteção LGPD)
REVOKE ALL ON public.meeting_diaries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_diaries TO authenticated;

-- 6. Índice de alta performance para o predicado de RLS
CREATE INDEX IF NOT EXISTS idx_meeting_diaries_teacher_id 
  ON public.meeting_diaries(teacher_id);
