-- ==============================================================================
-- TEACHER AI — CLASSROOM ANALYTICS ENGINE FOUNDATION SCHEMA
-- ==============================================================================
-- Schema completo para captura, consentimento, sessões de gravação, chunks,
-- transcrição diarizada, highlights e métricas pedagógicas de sala de aula.
-- Isolamento estrito de Row Level Security (RLS) por professor autenticado.
-- ==============================================================================

-- 1. Tabela de Consentimento de Gravação Escolar (LGPD de Menores)
CREATE TABLE IF NOT EXISTS public.class_recording_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_level VARCHAR(30) NOT NULL CHECK (consent_level IN ('school_board_institutional', 'parental_explicit', 'classroom_blanket')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,
  document_ref TEXT, -- Referência, hash ou URL do termo assinado
  consented_by_name TEXT NOT NULL,
  consented_by_role TEXT NOT NULL CHECK (consented_by_role IN ('diretoria', 'coordenacao', 'responsavel_legal', 'conselho_escolar')),
  student_opt_outs TEXT[] NOT NULL DEFAULT '{}', -- IDs de alunos cujos responsáveis não consentiram
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.class_recording_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores gerenciam consentimentos de suas turmas" ON public.class_recording_consents;
CREATE POLICY "Professores gerenciam consentimentos de suas turmas"
  ON public.class_recording_consents FOR ALL
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS idx_rec_consent_lookup 
  ON public.class_recording_consents(school_id, class_id, status, valid_until);

REVOKE ALL ON public.class_recording_consents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_recording_consents TO authenticated;


-- 2. Tabela de Sessões de Aula Gravadas
CREATE TABLE IF NOT EXISTS public.class_recording_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT,
  consent_id UUID NOT NULL REFERENCES public.class_recording_consents(id),
  status VARCHAR(30) NOT NULL DEFAULT 'uploading' 
    CHECK (status IN ('uploading', 'queued', 'transcribing', 'diarizing', 'extracting_highlights', 'computing_analytics', 'ready', 'failed')),
  status_detail TEXT NOT NULL DEFAULT 'Aguardando envio dos dados...',
  progress_pct INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  total_duration_seconds INT NOT NULL DEFAULT 0,
  total_chunks INT NOT NULL DEFAULT 0,
  uploaded_chunks INT NOT NULL DEFAULT 0,
  audio_storage_path TEXT,
  audio_sha256 TEXT,
  audio_retained_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  audio_purged_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.class_recording_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores acessam apenas suas sessões de gravação" ON public.class_recording_sessions;
CREATE POLICY "Professores acessam apenas suas sessões de gravação"
  ON public.class_recording_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS idx_class_rec_teacher_date 
  ON public.class_recording_sessions(teacher_id, created_at DESC);

REVOKE ALL ON public.class_recording_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_recording_sessions TO authenticated;


-- 3. Tabela de Chunks de Áudio Incrementais
CREATE TABLE IF NOT EXISTS public.class_recording_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.class_recording_sessions(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  start_ms INT NOT NULL,
  end_ms INT NOT NULL,
  storage_path TEXT,
  transcript_raw TEXT,
  transcript_cleaned TEXT,
  provider_used TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'transcribing', 'transcribed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_session_chunk UNIQUE (session_id, chunk_index)
);

ALTER TABLE public.class_recording_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso a chunks via sessão do professor" ON public.class_recording_chunks;
CREATE POLICY "Acesso a chunks via sessão do professor"
  ON public.class_recording_chunks FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_recording_sessions s
    WHERE s.id = class_recording_chunks.session_id AND s.teacher_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_recording_chunks_session 
  ON public.class_recording_chunks(session_id, chunk_index ASC);

REVOKE ALL ON public.class_recording_chunks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_recording_chunks TO authenticated;


-- 4. Tabela de Transcrição Segmentada e Diarizada
CREATE TABLE IF NOT EXISTS public.class_recording_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.class_recording_sessions(id) ON DELETE CASCADE,
  segment_index INT NOT NULL,
  speaker_label VARCHAR(30) NOT NULL CHECK (
    speaker_label ~ '^aluno_[0-9]+$' 
    OR speaker_label IN ('professor', 'coro_alunos', 'unidentified')
  ),
  nominal_student_id TEXT, -- Preenchido apenas quando houver vinculação humana voluntária
  start_ms INT NOT NULL,
  end_ms INT NOT NULL,
  duration_ms INT NOT NULL,
  text TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.class_recording_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso a segmentos via sessão do professor" ON public.class_recording_segments;
CREATE POLICY "Acesso a segmentos via sessão do professor"
  ON public.class_recording_segments FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_recording_sessions s
    WHERE s.id = class_recording_segments.session_id AND s.teacher_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_segments_session_timeline 
  ON public.class_recording_segments(session_id, start_ms ASC);

REVOKE ALL ON public.class_recording_segments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_recording_segments TO authenticated;


-- 5. Tabela de Highlights Pedagógicos Extraídos
CREATE TABLE IF NOT EXISTS public.class_recording_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.class_recording_sessions(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL CHECK (type IN (
    'momento_duvida', 'alta_participacao', 'explicacao_chave', 
    'dispersao_ruido', 'conceito_dificil', 'engajamento_pico', 'wait_time_anomalo'
  )),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  start_ms INT NOT NULL,
  end_ms INT NOT NULL,
  trigger_heuristic TEXT NOT NULL,
  heuristic_score NUMERIC(4,3) NOT NULL,
  pedagogical_insight TEXT NOT NULL,
  suggested_action TEXT,
  target_student_id TEXT,
  target_student_name TEXT,
  memory_candidate_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.class_recording_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso a highlights via sessão do professor" ON public.class_recording_highlights;
CREATE POLICY "Acesso a highlights via sessão do professor"
  ON public.class_recording_highlights FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_recording_sessions s
    WHERE s.id = class_recording_highlights.session_id AND s.teacher_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_highlights_session 
  ON public.class_recording_highlights(session_id, start_ms ASC);

REVOKE ALL ON public.class_recording_highlights FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_recording_highlights TO authenticated;


-- 6. Tabela de Métricas Analíticas de Sala de Aula
CREATE TABLE IF NOT EXISTS public.class_recording_analytics (
  session_id UUID PRIMARY KEY REFERENCES public.class_recording_sessions(id) ON DELETE CASCADE,
  teacher_talk_time_ms INT NOT NULL DEFAULT 0,
  student_talk_time_ms INT NOT NULL DEFAULT 0,
  silence_time_ms INT NOT NULL DEFAULT 0,
  teacher_talk_ratio NUMERIC(5,2) NOT NULL DEFAULT 0.00, -- TTT %
  student_talk_ratio NUMERIC(5,2) NOT NULL DEFAULT 0.00, -- STT %
  questions_asked_count INT NOT NULL DEFAULT 0,
  avg_wait_time_ms INT NOT NULL DEFAULT 0,
  min_wait_time_ms INT NOT NULL DEFAULT 0,
  max_wait_time_ms INT NOT NULL DEFAULT 0,
  unique_student_voices_count INT NOT NULL DEFAULT 0,
  turn_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  climate_index NUMERIC(3,2) NOT NULL DEFAULT 0.50, -- 0.00 a 1.00 (LLM Inferred)
  climate_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  engagement_score NUMERIC(3,2) NOT NULL DEFAULT 0.50, -- 0.00 a 1.00 (LLM Inferred)
  engagement_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.class_recording_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso a analytics via sessão do professor" ON public.class_recording_analytics;
CREATE POLICY "Acesso a analytics via sessão do professor"
  ON public.class_recording_analytics FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_recording_sessions s
    WHERE s.id = class_recording_analytics.session_id AND s.teacher_id = auth.uid()
  ));

REVOKE ALL ON public.class_recording_analytics FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_recording_analytics TO authenticated;
