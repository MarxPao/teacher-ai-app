-- ==============================================================================
-- portal_agency_schema.sql — Trilha de Auditoria & Consentimento de Agência (LGPD)
-- ==============================================================================

-- 1. Tabela de Consentimento Legal do Professor (1 vez por conta)
CREATE TABLE IF NOT EXISTS teacher_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type VARCHAR(50) NOT NULL DEFAULT 'portal_agency_general',
  terms_version VARCHAR(20) NOT NULL DEFAULT 'v1.0_2026-08',
  terms_hash VARCHAR(64) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  ip_address VARCHAR(45),
  user_agent TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE teacher_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam seus próprios logs de consentimento" ON teacher_consent_log;
CREATE POLICY "Professores gerenciam seus próprios logs de consentimento"
  ON teacher_consent_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_consent_log_user ON teacher_consent_log (user_id, accepted_at DESC);


-- 2. Tabela de Trilha de Auditoria de Ações em Portais Escolares
CREATE TABLE IF NOT EXISTS teacher_portal_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  platform_id VARCHAR(50) NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  class_ref VARCHAR(100) NOT NULL,
  student_count INT DEFAULT 0,
  summary TEXT NOT NULL,
  payload_encrypted TEXT NULL, -- Criptografado com Web Crypto AES-GCM localmente
  status VARCHAR(30) NOT NULL DEFAULT 'injected_visual', -- 'confirmed', 'injected_visual', 'cancelled', 'drafted'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  execution_mode VARCHAR(20) DEFAULT 'supervised'
);

ALTER TABLE teacher_portal_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores visualizam e gerenciam seus próprios logs de portal" ON teacher_portal_action_log;
CREATE POLICY "Professores visualizam e gerenciam seus próprios logs de portal"
  ON teacher_portal_action_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_portal_log_user_date ON teacher_portal_action_log (user_id, created_at DESC);
