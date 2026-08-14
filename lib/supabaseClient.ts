/**
 * supabaseClient.ts — Conexão com Supabase para Cloud Sync em tempo real
 * Utiliza preferencialmente a service_role key ou anonKey para acesso garantido.
 */

export interface SupabaseConfig {
  url: string
  anonKey: string
  serviceKey?: string
}

function getSupabaseConfig(): SupabaseConfig | null {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey }
  }

  try {
    if (typeof window === 'undefined') return null
    const s = localStorage.getItem('teacher_supabase_config')
    if (!s) return null
    const parsed = JSON.parse(s)
    // Sanitizar localStorage removendo a serviceKey se estiver presente no cliente
    if (parsed.serviceKey) {
      delete parsed.serviceKey
      localStorage.setItem('teacher_supabase_config', JSON.stringify(parsed))
    }
    return parsed
  } catch { return null }
}

function getActiveKey(cfg: SupabaseConfig): string {
  // No navegador, NUNCA usar serviceKey por motivos de segurança (RLS bypass)
  if (typeof window !== 'undefined') {
    return cfg.anonKey || ''
  }
  return cfg.serviceKey || cfg.anonKey || ''
}

/**
 * Sincroniza todos os dados do app com o Supabase.
 * Usa a tabela `teacher_sync` com colunas: `key` TEXT, `value` JSONB, `updated_at` TIMESTAMPTZ.
 */
export async function syncToSupabase(payload?: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: false, error: 'Supabase não configurado.' }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: false, error: 'Chave do Supabase ausente.' }

  let syncPayload = payload || {}
  if (Object.keys(syncPayload).length === 0) {
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('teacher_') && key !== 'teacher_supabase_config' && !key.endsWith('_lastModified')) {
          try {
            const val = localStorage.getItem(key)
            if (val) syncPayload[key] = JSON.parse(val)
          } catch { /* ignore */ }
        }
      }
    }
  }

  try {
    const rows = Object.entries(syncPayload).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }))

    if (rows.length > 0) {
      const res = await fetch(`${cfg.url}/rest/v1/teacher_sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { ok: false, error: err.message || `HTTP ${res.status}` }
      }
    }

    const upsertRelational = async (tableName: string, data: any[]) => {
      if (!data || data.length === 0) return;
      try {
        await fetch(`${cfg.url}/rest/v1/${tableName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(data),
        })
      } catch { /* erro silencioso */ }
    }

    const promises: Promise<void>[] = [];

    if (Array.isArray(syncPayload['teacher_schools'])) {
      promises.push(upsertRelational('schools', syncPayload['teacher_schools'].map((s: any) => ({
        id: String(s.id), name: String(s.name)
      }))))
    }
    if (Array.isArray(syncPayload['teacher_classes'])) {
      promises.push(upsertRelational('classes', syncPayload['teacher_classes'].map((c: any) => ({
        id: String(c.id), name: String(c.name), school_id: c.schoolId ? String(c.schoolId) : null, grade: c.grade || null, year: c.year || null
      }))))
    }
    if (Array.isArray(syncPayload['teacher_students'])) {
      promises.push(upsertRelational('students', syncPayload['teacher_students'].map((s: any) => ({
        id: String(s.id),
        name: String(s.name),
        email: s.email || null,
        class_id: s.classId ? String(s.classId) : (s.class ? String(s.class) : null),
        class_name: s.className || s.class || null,
        school_id: s.schoolId ? String(s.schoolId) : null,
        grades: s.grades || {},
        metrics: s.metrics || {}
      }))))
    }
    if (Array.isArray(syncPayload['teacher_saved_exams'])) {
      promises.push(upsertRelational('exams', syncPayload['teacher_saved_exams'].map((e: any) => ({
        id: String(e.id), title: String(e.title || ''), topic: e.topic || null, cefr: e.cefr || null, grade: e.grade || null, content: String(e.content || JSON.stringify(e)), sections: e.sections || []
      }))))
    }
    if (Array.isArray(syncPayload['teacher_saved_lessons'])) {
      promises.push(upsertRelational('lessons', syncPayload['teacher_saved_lessons'].map((l: any) => ({
        id: String(l.id), title: String(l.title || ''), topic: l.topic || null, level: l.level || null, content: String(l.content || JSON.stringify(l))
      }))))
    }
    if (Array.isArray(syncPayload['teacher_mindmaps_v2'])) {
      promises.push(upsertRelational('mindmaps', syncPayload['teacher_mindmaps_v2'].map((m: any) => ({
        id: String(m.id), title: String(m.title || ''), nodes: m.nodes || []
      }))))
    }
    if (Array.isArray(syncPayload['teacher_question_bank'])) {
      promises.push(upsertRelational('questions', syncPayload['teacher_question_bank'].map((q: any) => ({
        id: String(q.id), stem: String(q.stem || ''), options: q.options || [], answer: q.answer || '', type: q.type || '', cefr: q.cefr || null, tags: q.tags || []
      }))))
    }
    if (Array.isArray(syncPayload['teacher_meeting_diaries'])) {
      promises.push(upsertRelational('meeting_diaries', syncPayload['teacher_meeting_diaries'].map((d: any) => ({
        id: String(d.id), title: String(d.title || ''), date: d.date || null, type: d.type || null, transcript: String(d.transcript || ''), summary: String(d.summary || '')
      }))))
    }
    if (Array.isArray(syncPayload['teacher_repository'])) {
      promises.push(upsertRelational('documents', syncPayload['teacher_repository'].map((doc: any) => ({
        id: String(doc.id), title: String(doc.title || ''), type: String(doc.type || 'Text'), category: doc.category || null, textbook: doc.textbook || null, content: String(doc.content || ''), file_url: doc.fileUrl || null
      }))))
    }
    if (Array.isArray(syncPayload['teacher_private_students'])) {
      promises.push(upsertRelational('private_students', syncPayload['teacher_private_students'].map((s: any) => ({
        id: String(s.id),
        name: String(s.name),
        subject: String(s.subject),
        guardian_name: s.guardianName || null,
        phone: s.phone || null,
        email: s.email || null,
        monthly_fee: s.monthlyFee || 0,
        due_day: s.dueDay || 10,
        payment_method: s.paymentMethod || 'PIX',
        last_payment_date: s.lastPaymentDate || null,
        modality: s.modality || 'Online',
        schedule_info: s.scheduleInfo || '',
        payment_status: s.paymentStatus || 'em_dia',
        mastery_percentage: s.masteryPercentage || 75,
        goals: s.goals || null,
        ai_diagnostic: s.aiDiagnostic || null,
        roadmap: s.roadmap || [],
        lessons_history: s.lessonsHistory || [],
        grades_history: s.gradesHistory || []
      }))))
    }

    await Promise.all(promises);

    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Carrega dados do Supabase e restaura para localStorage.
 */
export async function loadFromSupabase(): Promise<{ ok: boolean; count?: number; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: false, error: 'Supabase não configurado.' }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: false, error: 'Chave do Supabase ausente.' }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/teacher_sync?select=key,value`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` },
    })

    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }

    const rows: Array<{ key: string; value: unknown }> = await res.json()
    let count = 0
    for (const row of rows) {
      if (row.key && row.value !== undefined) {
        localStorage.setItem(row.key, typeof row.value === 'string' ? row.value : JSON.stringify(row.value))
        count++
      }
    }
    window.dispatchEvent(new Event('storage'))
    return { ok: true, count }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Envia e salva uma prova/exercício diretamente no Banco de Atividades no Supabase.
 */
export async function saveActivityToSupabase(activity: {
  title: string
  type: 'exam' | 'exercise' | 'quiz'
  grade?: string
  cefr?: string
  content: string
}): Promise<{ ok: boolean; error?: string }> {
  const id = 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
  const payload = {
    id,
    title: activity.title,
    type: activity.type,
    grade: activity.grade || 'Geral',
    cefr: activity.cefr || 'B1',
    content: activity.content,
    tenant_id: 'default_school',
    created_at: new Date().toISOString()
  }

  // 1. Salva no localStorage local
  try {
    const list = JSON.parse(localStorage.getItem('teacher_activities') || '[]')
    list.unshift(payload)
    localStorage.setItem('teacher_activities', JSON.stringify(list))
    window.dispatchEvent(new Event('storage'))
  } catch {}

  // 2. Envia diretamente para a tabela activities no Supabase
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      console.warn('[Supabase Activities] Alert:', res.status)
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: true }
  }
}

/**
 * Envia e salva uma Rubrica Pedagógica ou Gabarito Comentado no Supabase.
 */
export async function saveRubricToSupabase(rubric: {
  title: string
  type: 'rubric' | 'answer_key'
  grade?: string
  criteria?: any[]
  content: string
}): Promise<{ ok: boolean; error?: string }> {
  const id = 'rub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
  const payload = {
    id,
    title: rubric.title,
    type: rubric.type,
    grade: rubric.grade || 'Geral',
    criteria: rubric.criteria || [],
    content: rubric.content,
    tenant_id: 'default_school',
    created_at: new Date().toISOString()
  }

  // 1. Salva no localStorage local
  try {
    const list = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]')
    list.unshift(payload)
    localStorage.setItem('teacher_rubrics', JSON.stringify(list))
    window.dispatchEvent(new Event('storage'))
  } catch {}

  // 2. Envia diretamente para a tabela rubrics_and_answer_keys no Supabase
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/rubrics_and_answer_keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      console.warn('[Supabase Rubrics] Alert:', res.status)
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: true }
  }
}

export interface SupabaseCloudActivity {
  id: string
  title: string
  type: string
  grade?: string
  cefr?: string
  content: string
  created_at?: string
  sourceTable: 'activities' | 'rubrics_and_answer_keys'
}

/**
 * Busca todas as atividades e rubricas gravadas no Supabase Cloud.
 */
export async function fetchSupabaseActivitiesAndRubrics(): Promise<SupabaseCloudActivity[]> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const headers = { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    const [actRes, rubRes] = await Promise.all([
      fetch(`${cfg.url}/rest/v1/activities?select=*&order=created_at.desc`, { headers }),
      fetch(`${cfg.url}/rest/v1/rubrics_and_answer_keys?select=*&order=created_at.desc`, { headers })
    ])

    const activities: any[] = actRes.ok ? await actRes.json() : []
    const rubrics: any[] = rubRes.ok ? await rubRes.json() : []

    const items: SupabaseCloudActivity[] = [
      ...activities.map(a => ({ ...a, sourceTable: 'activities' as const })),
      ...rubrics.map(r => ({ ...r, sourceTable: 'rubrics_and_answer_keys' as const }))
    ]

    return items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  } catch (e: unknown) {
    return []
  }
}

/**
 * Exclui um item gravado no Supabase Cloud.
 */
export async function deleteSupabaseActivity(id: string, sourceTable: 'activities' | 'rubrics_and_answer_keys'): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return false
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return false

  try {
    const res = await fetch(`${cfg.url}/rest/v1/${sourceTable}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Verifica se a conexão com Supabase está funcionando.
 */
export async function testSupabaseConnection(url: string, key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    })
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Busca todos os alunos particulares cadastrados no Supabase Cloud.
 */
export async function fetchPrivateStudentsFromSupabase(): Promise<any[]> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_students?select=*&order=created_at.desc`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    if (!res.ok) return []
    const rows = await res.json()
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      guardianName: r.guardian_name || undefined,
      phone: r.phone || undefined,
      email: r.email || undefined,
      monthlyFee: Number(r.monthly_fee || 0),
      dueDay: Number(r.due_day || 10),
      paymentMethod: r.payment_method || 'PIX',
      lastPaymentDate: r.last_payment_date || undefined,
      modality: r.modality || 'Online',
      scheduleInfo: r.schedule_info || '',
      paymentStatus: r.payment_status || 'em_dia',
      masteryPercentage: Number(r.mastery_percentage || 75),
      goals: r.goals || undefined,
      aiDiagnostic: r.ai_diagnostic || undefined,
      roadmap: Array.isArray(r.roadmap) ? r.roadmap : [],
      lessonsHistory: Array.isArray(r.lessons_history) ? r.lessons_history : [],
      gradesHistory: Array.isArray(r.grades_history) ? r.grades_history : []
    }))
  } catch (e: unknown) {
    return []
  }
}

/**
 * Salva/Atualiza um aluno particular diretamente no Supabase Cloud.
 */
export async function upsertPrivateStudentToSupabase(student: any): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  const rowPayload = {
    id: String(student.id),
    name: String(student.name),
    subject: String(student.subject),
    guardian_name: student.guardianName || null,
    phone: student.phone || null,
    email: student.email || null,
    monthly_fee: student.monthlyFee || 0,
    due_day: student.dueDay || 10,
    payment_method: student.paymentMethod || 'PIX',
    last_payment_date: student.lastPaymentDate || null,
    modality: student.modality || 'Online',
    schedule_info: student.scheduleInfo || '',
    payment_status: student.paymentStatus || 'em_dia',
    mastery_percentage: student.masteryPercentage || 75,
    goals: student.goals || null,
    ai_diagnostic: student.aiDiagnostic || null,
    roadmap: student.roadmap || [],
    lessons_history: student.lessonsHistory || [],
    grades_history: student.gradesHistory || [],
    updated_at: new Date().toISOString()
  }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rowPayload)
    })
    return { ok: res.ok }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Exclui um aluno particular no Supabase Cloud.
 */
export async function deletePrivateStudentFromSupabase(studentId: string): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return false
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return false

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_students?id=eq.${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    return res.ok
  } catch {
    return false
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// BIBLIOTECA DE CONTEÚDO — Documentos (Repository)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupabaseDocument {
  id: string
  title: string
  type: string
  category: string | null
  textbook: string | null
  content: string
  file_url: string | null
  word_count: number | null
  chunk_count: number | null
  created_at?: string
}

/**
 * Busca todos os documentos da biblioteca no Supabase (exclui presets fixos).
 */
export async function fetchDocumentsFromSupabase(): Promise<SupabaseDocument[]> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/documents?select=*&order=created_at.desc&limit=200`,
      {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      }
    )
    if (!res.ok) return []
    const data: SupabaseDocument[] = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * Insere ou atualiza um documento da biblioteca no Supabase.
 */
export async function upsertDocumentToSupabase(
  doc: SupabaseDocument
): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: false, error: 'Supabase não configurado.' }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: false, error: 'Chave ausente.' }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        category: doc.category,
        textbook: doc.textbook,
        content: doc.content,
        file_url: doc.file_url,
        word_count: doc.word_count,
        chunk_count: doc.chunk_count,
      }),
    })
    return { ok: res.ok }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Remove um documento da biblioteca no Supabase.
 */
export async function deleteDocumentFromSupabase(docId: string): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return false
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return false

  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/documents?id=eq.${encodeURIComponent(docId)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
        }
      }
    )
    return res.ok
  } catch {
    return false
  }
}
