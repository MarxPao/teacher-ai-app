# Checklist Manual Pré-Deploy & Governança de Produção

> **ATENÇÃO:** Este checklist deve ser executado **manualmente pelo DBA ou Engenheiro Responsável** no console do Supabase (SQL Editor) antes de rodar as migrations de segurança e produção em ambiente real. **NUNCA aplique as migrations às cegas via pipeline de CI/CD.**

---

## 🔒 1. Verificação Prévia de `meeting_diaries`

### A. Diagnóstico de Registros Órfãos
Execute no SQL Editor da produção:

```sql
-- 1. Contagem total de diários legados sem vínculo
SELECT count(*) AS total_orfaos
FROM public.meeting_diaries
WHERE teacher_id IS NULL;

-- 2. Identificação das contas existentes no Supabase Auth
SELECT id, email, created_at
FROM auth.users
ORDER BY created_at ASC;

-- 3. Amostra de metadados dos registros órfãos
SELECT id, student_name, class_name, date, created_at
FROM public.meeting_diaries
WHERE teacher_id IS NULL
ORDER BY created_at DESC
LIMIT 10;
```

### B. Matriz de Decisão (Go / No-Go)
* **Cenário 1 — Base Monousuário (Apenas a conta da professora Rafaela em `auth.users`):**
  * **Ação:** É seguro rodar a migration [`20260924_fix_meeting_diaries_security_rls.sql`](file:///c:/Users/lucas/Documents/antigravity/blissful-pasteur/teacher-ai-app/supabase/migrations/20260924_fix_meeting_diaries_security_rls.sql). O bloco determinístico `DO $$` atribuirá todos os registros automaticamente ao único `auth.uid()`.
* **Cenário 2 — Base Multi-usuário (Mais de 1 conta em `auth.users`):**
  * **Ação:** **NÃO aplique a migration diretamente.** Execute primeiro a atribuição manual explícita para evitar que registros legítimos caiam na quarentena:
    ```sql
    UPDATE public.meeting_diaries
    SET teacher_id = '<UUID_DA_PROFESSORA_RAFAELA>'
    WHERE teacher_id IS NULL;
    ```
  * Após a atribuição, valide que `count(*) WHERE teacher_id IS NULL` resultou em `0` e então aplique o script DDL.

---

## 🛡️ 2. Protocolo de Triagem da Quarentena Administrativa

Se algum registro permanecer com `teacher_id IS NULL`, ele cairá na política de quarentena:
* **Quem pode visualizar:** Apenas usuários com `profiles.role = 'admin'` e conexões com `service_role`.
* **Como auditar registros em quarentena:**
  ```sql
  SELECT m.id, m.student_name, m.class_name, m.created_at
  FROM public.meeting_diaries m
  WHERE m.teacher_id IS NULL;
  ```
* **Como reatribuir ou purgar:**
  ```sql
  -- Reatribuição manual por e-mail:
  UPDATE public.meeting_diaries
  SET teacher_id = (SELECT id FROM auth.users WHERE email = 'professora@escola.com.br')
  WHERE id = '<ID_DO_REGISTRO>';

  -- Expurgo definitivo se for dado inválido de teste legado:
  DELETE FROM public.meeting_diaries
  WHERE teacher_id IS NULL AND created_at < NOW() - INTERVAL '90 days';
  ```

---

## 🎧 3. Purga Automática do Áudio Bruto (LGPD / Zero-Retention)

### A. Bucket de Gravações
1. Certifique-se de que o bucket `class-recordings` está criado no Supabase Storage:
   - Configuração: **Private** (não público).
   - RLS habilitada para garantir acesso apenas via URL assinada pelo backend.

### B. Ativação do Job de Purga Diária
A purga automática física (Storage + DB) é acionada por três vias complementares:
1. **Vercel Cron (Nativo):**
   - Configurado via [`vercel.json`](file:///c:/Users/lucas/Documents/antigravity/blissful-pasteur/teacher-ai-app/vercel.json) apontando para `/api/classroom/purge` diariamente às `03:00 UTC`.
   - Adicione a variável de ambiente `CRON_SECRET` no painel da Vercel.
2. **Dream Phase do Memory Engine:**
   - O endpoint `/api/agent/memory/consolidate` executa a purga física de áudios expirados de forma transparente durante a rotina noturna de consolidação.
3. **Trigger Manual de Emergência / Auditoria:**
   - Faça uma chamada `POST` autenticada para `https://<seu-dominio>/api/classroom/purge` com `{"dryRun": false}` ou `{"dryRun": true}` para auditoria prévia.

### C. Consulta SQL de Verificação de Conformidade
Execute periodicamente para garantir que nenhum áudio de menor permaneceu retido após 7 dias:
```sql
SELECT count(*) AS audios_retidos_ilegalmente
FROM public.class_recording_sessions
WHERE audio_retained_until < NOW()
  AND audio_purged_at IS NULL
  AND audio_storage_path IS NOT NULL;
```
> O resultado esperado desta consulta deve ser **estritamente `0`**.
