-- ==============================================================================
-- TEACHER AI — BANCO DE IMAGENS E MÍDIAS (MEDIA LIBRARY & STORAGE)
-- ==============================================================================
-- Execute este script no SQL Editor do Supabase para habilitar o armazenamento
-- em nuvem de imagens, ilustrações, diagramas e logotipos escolares.
-- ==============================================================================

-- 1. Habilitar extensão de UUID se ainda não estiver ativa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Mídias e Imagens (media_library)
CREATE TABLE IF NOT EXISTS public.media_library (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default_teacher',
  title TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER DEFAULT 0,
  file_url TEXT NOT NULL,
  category TEXT DEFAULT 'Geral',
  tags JSONB DEFAULT '[]'::jsonb,
  school_id TEXT,
  school_name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Habilitar RLS com políticas abertas para uso local/anônimo e autenticado
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública/anônima de mídias"
  ON public.media_library
  FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserção e atualização de mídias"
  ON public.media_library
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Criação do Bucket de Storage 'media' (caso o storage esteja habilitado)
-- Executado no schema storage do Supabase
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. Políticas de acesso para o Bucket de Storage 'media'
CREATE POLICY "Acesso público aos arquivos do bucket media"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media');

CREATE POLICY "Upload permitido no bucket media"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'media');

CREATE POLICY "Exclusão permitida no bucket media"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'media');
