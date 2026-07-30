-- TEACHER??? — Supabase Database Setup
-- Execute este script no SQL Editor do seu projeto Supabase
-- Acesse: https://supabase.com/dashboard/project/parxakvjvuvsmvbvrshk/sql

-- ─── Tabela Principal de Sincronização ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_sync (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para queries por data de atualização
CREATE INDEX IF NOT EXISTS idx_teacher_sync_updated_at ON teacher_sync (updated_at DESC);

-- ─── Row Level Security (RLS) ─────────────────────────────────────────────────
-- Habilita RLS para segurança
ALTER TABLE teacher_sync ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem ler e escrever seus próprios dados
-- Por enquanto, permite acesso via anon key (para uso pessoal local)
CREATE POLICY "Allow anon full access" ON teacher_sync
  FOR ALL USING (true) WITH CHECK (true);

-- ─── Trigger para atualizar updated_at automaticamente ────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON teacher_sync;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON teacher_sync
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Verificação ─────────────────────────────────────────────────────────────
SELECT 'Tabela teacher_sync criada com sucesso!' AS status;
