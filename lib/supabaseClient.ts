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
    if (Array.isArray(syncPayload['teacher_loose_files'])) {
      promises.push(upsertRelational('documents', syncPayload['teacher_loose_files'].map((file: any) => ({
        id: String(file.id),
        title: String(file.title || file.fileName || 'Arquivo Avulso'),
        type: 'Arquivo Avulso',
        category: file.category || 'Geral',
        textbook: file.fileType || null,
        content: String(file.extractedText || file.title || ''),
        file_url: file.fileDataUrl || null
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
    if (Array.isArray(syncPayload['teacher_media_library'])) {
      promises.push(upsertRelational('media_library', syncPayload['teacher_media_library'].map((m: any) => ({
        id: String(m.id),
        title: String(m.title || 'Imagem'),
        file_name: m.fileName || null,
        file_type: m.fileType || null,
        file_size: m.fileSize || 0,
        file_url: String(m.fileUrl || ''),
        category: m.category || 'Geral',
        tags: Array.isArray(m.tags) ? m.tags : [],
        school_id: m.schoolId || null,
        school_name: m.schoolName || null,
        description: m.description || null,
        created_at: m.createdAt || new Date().toISOString()
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

export interface SupabasePrivateBook {
  id: string
  title: string
  author?: string
  subject: string
  level?: string
  studentId?: string
  studentName?: string
  pdfUrl?: string
  unitsCount?: number
  notes?: string
  createdAt?: string
}

export interface SupabasePrivateDidacticUnit {
  id: string
  studentId?: string
  studentName?: string
  unitNumber: number
  unitTitle: string
  topic: string
  grammarFocus: string
  vocabularyFocus?: string
  estimatedHours?: number
  status: 'current' | 'completed' | 'upcoming'
  createdAt?: string
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
      type: r.type || 'individual',
      groupMembersCount: r.group_members_count ? Number(r.group_members_count) : undefined,
      subject: r.subject,
      guardianName: r.guardian_name || undefined,
      phone: r.phone || undefined,
      email: r.email || undefined,
      billingType: r.billing_type || 'mensal',
      monthlyFee: Number(r.monthly_fee || 0),
      feePerLesson: r.fee_per_lesson ? Number(r.fee_per_lesson) : undefined,
      lessonsPerWeek: r.lessons_per_week ? Number(r.lessons_per_week) : undefined,
      weeklyFee: r.weekly_fee ? Number(r.weekly_fee) : undefined,
      dueDay: Number(r.due_day || 10),
      paymentMethod: r.payment_method || 'PIX',
      lastPaymentDate: r.last_payment_date || undefined,
      modality: r.modality || 'Online',
      scheduleInfo: r.schedule_info || '',
      daysOfWeek: Array.isArray(r.days_of_week) ? r.days_of_week : [],
      timeStart: r.time_start || undefined,
      timeEnd: r.time_end || undefined,
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
    type: student.type || 'individual',
    group_members_count: student.groupMembersCount || null,
    subject: String(student.subject),
    guardian_name: student.guardianName || null,
    phone: student.phone || null,
    email: student.email || null,
    billing_type: student.billingType || 'mensal',
    monthly_fee: student.monthlyFee || 0,
    fee_per_lesson: student.feePerLesson || null,
    lessons_per_week: student.lessonsPerWeek || null,
    weekly_fee: student.weeklyFee || null,
    due_day: student.dueDay || 10,
    payment_method: student.paymentMethod || 'PIX',
    last_payment_date: student.lastPaymentDate || null,
    modality: student.modality || 'Online',
    schedule_info: student.scheduleInfo || '',
    days_of_week: student.daysOfWeek || [],
    time_start: student.timeStart || null,
    time_end: student.timeEnd || null,
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

/**
 * Busca livros da tutoria particular no Supabase.
 */
export async function fetchPrivateBooksFromSupabase(): Promise<SupabasePrivateBook[]> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_books?select=*&order=created_at.desc`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    if (!res.ok) return []
    const rows = await res.json()
    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      author: r.author || undefined,
      subject: r.subject || 'Inglês',
      level: r.level || undefined,
      studentId: r.student_id || undefined,
      studentName: r.student_name || undefined,
      pdfUrl: r.pdf_url || undefined,
      unitsCount: r.units_count ? Number(r.units_count) : undefined,
      notes: r.notes || undefined,
      createdAt: r.created_at
    }))
  } catch {
    return []
  }
}

/**
 * Salva livro de aula particular no Supabase.
 */
export async function upsertPrivateBookToSupabase(book: SupabasePrivateBook): Promise<{ ok: boolean }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  const row = {
    id: book.id,
    title: book.title,
    author: book.author || null,
    subject: book.subject,
    level: book.level || null,
    student_id: book.studentId || null,
    student_name: book.studentName || null,
    pdf_url: book.pdfUrl || null,
    units_count: book.unitsCount || null,
    notes: book.notes || null,
    updated_at: new Date().toISOString()
  }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

/**
 * Exclui livro da tutoria no Supabase.
 */
export async function deletePrivateBookFromSupabase(bookId: string): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return false
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return false

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_books?id=eq.${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Busca unidades da sequência didática de tutoria particular no Supabase.
 */
export async function fetchPrivateDidacticUnitsFromSupabase(): Promise<SupabasePrivateDidacticUnit[]> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_didactic_units?select=*&order=unit_number.asc`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    if (!res.ok) return []
    const rows = await res.json()
    return rows.map((r: any) => ({
      id: r.id,
      studentId: r.student_id || undefined,
      studentName: r.student_name || undefined,
      unitNumber: Number(r.unit_number || 1),
      unitTitle: r.unit_title,
      topic: r.topic,
      grammarFocus: r.grammar_focus,
      vocabularyFocus: r.vocabulary_focus || undefined,
      estimatedHours: r.estimated_hours ? Number(r.estimated_hours) : undefined,
      status: r.status || 'upcoming',
      createdAt: r.created_at
    }))
  } catch {
    return []
  }
}

/**
 * Salva unidade didática de tutoria particular no Supabase.
 */
export async function upsertPrivateDidacticUnitToSupabase(unit: SupabasePrivateDidacticUnit): Promise<{ ok: boolean }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  const row = {
    id: unit.id,
    student_id: unit.studentId || null,
    student_name: unit.studentName || null,
    unit_number: unit.unitNumber,
    unit_title: unit.unitTitle,
    topic: unit.topic,
    grammar_focus: unit.grammarFocus,
    vocabulary_focus: unit.vocabularyFocus || null,
    estimated_hours: unit.estimatedHours || null,
    status: unit.status,
    updated_at: new Date().toISOString()
  }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_didactic_units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

/**
 * Exclui unidade didática de tutoria no Supabase.
 */
export async function deletePrivateDidacticUnitFromSupabase(unitId: string): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return false
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return false

  try {
    const res = await fetch(`${cfg.url}/rest/v1/private_didactic_units?id=eq.${encodeURIComponent(unitId)}`, {
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

// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVOS AVULSOS (Biblioteca - Subfuncionalidade Arquivos)
// ─────────────────────────────────────────────────────────────────────────────

export interface LooseFileItem {
  id: string
  title: string
  fileName: string
  fileType: string // 'pdf' | 'docx' | 'image' | 'audio' | 'sheet' | 'slide' | 'text' | 'other'
  fileSize: number // em bytes
  category: string // 'Atividade' | 'Artigo' | 'Lista de Vocabulário' | 'Handout' | 'Slide' | 'Áudio' | 'Prova Anterior' | 'Outro'
  tags: string[]
  school?: string
  className?: string
  extractedText: string
  fileDataUrl?: string
  date: string
  createdAt: string
}

export async function saveLooseFileToSupabase(file: LooseFileItem): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

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
        id: file.id,
        title: file.title || file.fileName,
        type: 'Arquivo Avulso',
        category: file.category,
        textbook: file.fileType,
        content: file.extractedText || file.title || file.fileName,
        file_url: file.fileDataUrl || null,
        word_count: file.extractedText ? file.extractedText.trim().split(/\s+/).length : 0,
        chunk_count: file.extractedText ? Math.ceil(file.extractedText.length / 500) : 0,
      }),
    })
    return { ok: res.ok }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

export async function deleteLooseFileFromSupabase(fileId: string): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return false
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return false

  try {
    const res = await fetch(`${cfg.url}/rest/v1/documents?id=eq.${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
      }
    })
    return res.ok
  } catch {
    return false
  }
}

export interface SupabaseInsightsDataset {
  schools: Array<{ id: string; name: string }>
  classes: Array<{ id: string; name: string; schoolId?: string; grade?: string; year?: string }>
  students: Array<{
    id: string
    name: string
    class?: string
    school?: string
    grades?: Record<string, any>
    metrics?: { attendance?: number; homeworkRate?: number; participation?: number }
  }>
  privateStudents: Array<{
    id: string
    name: string
    subject: string
    monthlyFee?: number
    paymentStatus?: string
    masteryPercentage?: number
    aiDiagnostic?: string
    roadmap?: any[]
    lessonsHistory?: any[]
    gradesHistory?: any[]
  }>
  documents: Array<{ id: string | number; title: string; type?: string; category?: string; textbook?: string; content?: string }>
  exams: Array<{ id: string; title: string; topic?: string; cefr?: string; grade?: string; content?: string }>
  questions: Array<{ id: string; topic?: string; stem?: string; cefr?: string; grade?: string; title?: string }>
  isCloudConnected: boolean
}

/**
 * Busca e cruza todos os dados relacionais do Supabase Cloud para o módulo Insights.
 */
export async function fetchSupabaseInsightsData(): Promise<SupabaseInsightsDataset> {
  const cfg = getSupabaseConfig()
  const apiKey = cfg?.url ? getActiveKey(cfg) : null
  let isCloudConnected = false

  let schools: any[] = []
  let classes: any[] = []
  let students: any[] = []
  let privateStudents: any[] = []
  let documents: any[] = []
  let exams: any[] = []
  let questions: any[] = []

  if (cfg?.url && apiKey) {
    try {
      const headers = { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
      const [schRes, clsRes, stuRes, privRes, docRes, exaRes, queRes] = await Promise.all([
        fetch(`${cfg.url}/rest/v1/schools?select=*`, { headers }).catch(() => null),
        fetch(`${cfg.url}/rest/v1/classes?select=*`, { headers }).catch(() => null),
        fetch(`${cfg.url}/rest/v1/students?select=*`, { headers }).catch(() => null),
        fetch(`${cfg.url}/rest/v1/private_students?select=*`, { headers }).catch(() => null),
        fetch(`${cfg.url}/rest/v1/documents?select=*`, { headers }).catch(() => null),
        fetch(`${cfg.url}/rest/v1/exams?select=*`, { headers }).catch(() => null),
        fetch(`${cfg.url}/rest/v1/questions?select=*`, { headers }).catch(() => null),
      ])

      if (schRes?.ok) { schools = await schRes.json(); isCloudConnected = true }
      if (clsRes?.ok) { classes = await clsRes.json(); isCloudConnected = true }
      if (stuRes?.ok) { students = await stuRes.json(); isCloudConnected = true }
      if (privRes?.ok) {
        const privRaw = await privRes.json()
        privateStudents = (privRaw || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          subject: r.subject,
          monthlyFee: Number(r.monthly_fee || 0),
          paymentStatus: r.payment_status || 'em_dia',
          masteryPercentage: Number(r.mastery_percentage || 75),
          aiDiagnostic: r.ai_diagnostic || undefined,
          roadmap: Array.isArray(r.roadmap) ? r.roadmap : [],
          lessonsHistory: Array.isArray(r.lessons_history) ? r.lessons_history : [],
          gradesHistory: Array.isArray(r.grades_history) ? r.grades_history : []
        }))
        isCloudConnected = true
      }
      if (docRes?.ok) { documents = await docRes.json(); isCloudConnected = true }
      if (exaRes?.ok) { exams = await exaRes.json(); isCloudConnected = true }
      if (queRes?.ok) { questions = await queRes.json(); isCloudConnected = true }
    } catch {
      isCloudConnected = false
    }
  }

  // Fallback / Mescla com dados locais do localStorage
  try {
    if (typeof window !== 'undefined') {
      if (schools.length === 0) {
        const s = localStorage.getItem('teacher_schools')
        if (s) schools = JSON.parse(s)
      }
      if (classes.length === 0) {
        const c = localStorage.getItem('teacher_classes')
        if (c) classes = JSON.parse(c)
      }
      if (students.length === 0) {
        const st = localStorage.getItem('teacher_students')
        if (st) students = JSON.parse(st)
      }
      if (privateStudents.length === 0) {
        const ps = localStorage.getItem('teacher_private_students')
        if (ps) {
          const parsed = JSON.parse(ps)
          privateStudents = (parsed || []).map((s: any) => ({
            ...s,
            roadmap: Array.isArray(s.roadmap) ? s.roadmap : [],
            lessonsHistory: Array.isArray(s.lessonsHistory) ? s.lessonsHistory : [],
            gradesHistory: Array.isArray(s.gradesHistory) ? s.gradesHistory : []
          }))
        }
      }
      if (documents.length === 0) {
        const d = localStorage.getItem('teacher_repository') || localStorage.getItem('teacher_repo')
        if (d) documents = JSON.parse(d)
      }
      if (exams.length === 0) {
        const e = localStorage.getItem('teacher_saved_exams')
        if (e) exams = JSON.parse(e)
      }
      if (questions.length === 0) {
        const qb = localStorage.getItem('teacher_question_bank')
        const sq = localStorage.getItem('teacher_saved_quicks')
        const allLocalQ: any[] = [
          ...(qb ? JSON.parse(qb) : []),
          ...(sq ? JSON.parse(sq) : [])
        ]
        if (allLocalQ.length > 0) questions = allLocalQ
      }
    }
  } catch {}

  const MOCK_NAMES = ['Alice Smith', 'Bob Jones', 'Bob Johnson', 'Charlie Brown', 'Diana Prince']
  const MOCK_IDS = ['s1', 's2', 's3', 's4', 'c1', 'c2']

  const sanitizedStudents = (Array.isArray(students) ? students : [])
    .filter((s: any) => !MOCK_NAMES.includes(s.name) && !MOCK_IDS.includes(s.id))

  const sanitizedClasses = (Array.isArray(classes) ? classes : [])
    .filter((c: any) => !MOCK_IDS.includes(c.id) && c.name !== 'English 101' && c.name !== 'Advanced Conversation')

  return {
    schools: Array.isArray(schools) ? schools : [],
    classes: sanitizedClasses,
    students: sanitizedStudents,
    privateStudents: Array.isArray(privateStudents) ? privateStudents : [],
    documents: Array.isArray(documents) ? documents : [],
    exams: Array.isArray(exams) ? exams : [],
    questions: Array.isArray(questions) ? questions : [],
    isCloudConnected
  }
}

/**
 * Remove qualquer resquício de dados de mock/teste do localStorage do navegador.
 */
export function purgeMockDataFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const MOCK_NAMES = ['Alice Smith', 'Bob Jones', 'Bob Johnson', 'Charlie Brown', 'Diana Prince']
    const MOCK_IDS = ['s1', 's2', 's3', 's4', 'c1', 'c2']

    const rawSt = localStorage.getItem('teacher_students')
    if (rawSt) {
      const parsed = JSON.parse(rawSt)
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((s: any) => !MOCK_NAMES.includes(s.name) && !MOCK_IDS.includes(s.id))
        localStorage.setItem('teacher_students', JSON.stringify(clean))
      }
    }
    const rawCl = localStorage.getItem('teacher_classes')
    if (rawCl) {
      const parsed = JSON.parse(rawCl)
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((c: any) => !MOCK_IDS.includes(c.id) && c.name !== 'English 101' && c.name !== 'Advanced Conversation')
        localStorage.setItem('teacher_classes', JSON.stringify(clean))
      }
    }
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
  } catch {}
}

/**
 * Salva um snapshot de Insights diretamente na tabela pedagogical_insights do Supabase.
 */
export async function savePedagogicalInsightToSupabase(insight: {
  schoolId?: string
  classId?: string
  overallMastery: number
  totalStudents: number
  atRiskCount: number
  topCount: number
  criticalTopics: any[]
  aiReport?: string
}): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  const payload = {
    id: 'ins_' + Date.now(),
    school_id: insight.schoolId || null,
    class_id: insight.classId || null,
    overall_mastery: insight.overallMastery,
    total_students: insight.totalStudents,
    at_risk_count: insight.atRiskCount,
    top_count: insight.topCount,
    critical_topics: insight.criticalTopics || [],
    ai_report: insight.aiReport || null,
    updated_at: new Date().toISOString()
  }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/pedagogical_insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    })
    return { ok: res.ok }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Inicializa dados de demonstração reais nas tabelas do Supabase Cloud.
 */
export async function seedSupabaseDemoData(): Promise<{ ok: boolean; message?: string; error?: string }> {
  const demoSchools = [{ id: 'sch_demo_1', name: 'Colégio Alpha' }]
  const demoClasses = [
    { id: 'cls_demo_1', name: '9º Ano A', school_id: 'sch_demo_1', grade: '9º Ano', year: '2026' },
    { id: 'cls_demo_2', name: '1º Ano EM', school_id: 'sch_demo_1', grade: '1º EM', year: '2026' }
  ]
  const demoStudents = [
    {
      id: 'stu_demo_1',
      name: 'Lucas Silva',
      class: '9º Ano A',
      className: '9º Ano A',
      class_name: '9º Ano A',
      school: 'Colégio Alpha',
      school_name: 'Colégio Alpha',
      school_id: 'sch_demo_1',
      grades: { 'Conditionals & Unreal Past': 5.0, 'Present Perfect': 8.5, 'Reading Comprehension': 7.0 },
      metrics: { attendance: 95, homeworkRate: 90, participation: 85 }
    },
    {
      id: 'stu_demo_2',
      name: 'Beatriz Santos',
      class: '9º Ano A',
      className: '9º Ano A',
      class_name: '9º Ano A',
      school: 'Colégio Alpha',
      school_name: 'Colégio Alpha',
      school_id: 'sch_demo_1',
      grades: { 'Conditionals & Unreal Past': 4.5, 'Present Perfect': 5.5, 'Reading Comprehension': 6.0 },
      metrics: { attendance: 80, homeworkRate: 65, participation: 70 }
    },
    {
      id: 'stu_demo_3',
      name: 'Gabriel Souza',
      class: '9º Ano A',
      className: '9º Ano A',
      class_name: '9º Ano A',
      school: 'Colégio Alpha',
      school_name: 'Colégio Alpha',
      school_id: 'sch_demo_1',
      grades: { 'Conditionals & Unreal Past': 9.0, 'Present Perfect': 9.5, 'Reading Comprehension': 9.0 },
      metrics: { attendance: 100, homeworkRate: 100, participation: 95 }
    },
    {
      id: 'stu_demo_4',
      name: 'Mariana Costa',
      class: '1º Ano EM',
      className: '1º Ano EM',
      class_name: '1º Ano EM',
      school: 'Colégio Alpha',
      school_name: 'Colégio Alpha',
      school_id: 'sch_demo_1',
      grades: { 'Inversion & Negative Adverbials': 6.0, 'Academic Essay Writing': 8.0, 'Phrasal Verbs': 8.5 },
      metrics: { attendance: 90, homeworkRate: 85, participation: 80 }
    },
    {
      id: 'stu_demo_5',
      name: 'Pedro Henrique',
      class: '1º Ano EM',
      className: '1º Ano EM',
      class_name: '1º Ano EM',
      school: 'Colégio Alpha',
      school_name: 'Colégio Alpha',
      school_id: 'sch_demo_1',
      grades: { 'Inversion & Negative Adverbials': 4.0, 'Academic Essay Writing': 5.0, 'Phrasal Verbs': 5.5 },
      metrics: { attendance: 75, homeworkRate: 60, participation: 65 }
    }
  ]
  const demoExams = [
    {
      id: 'exam_demo_1',
      title: 'Avaliação Diagnóstica: Conditionals & Unreal Past',
      topic: 'Conditionals & Unreal Past',
      cefr: 'B2',
      grade: '9º Ano',
      content: 'Avaliação estruturada sobre Second, Third and Mixed Conditionals.',
      sections: [{ title: 'Grammar & Structure', questions: [] }]
    },
    {
      id: 'exam_demo_2',
      title: 'Simulado de Inglês Avançado: Inversion & Negative Adverbials',
      topic: 'Inversion & Negative Adverbials',
      cefr: 'C1',
      grade: '1º EM',
      content: 'Simulado focado em inversão oracional com advérbios negativos.',
      sections: [{ title: 'Inversion Structures', questions: [] }]
    }
  ]
  const demoDocuments = [
    {
      id: 'doc_demo_1',
      title: 'Globalizers 4 - Reference Book & Grammar Guide',
      type: 'Livro Didático',
      category: 'Gramática & Vocabulário',
      textbook: 'Globalizers 4',
      content: 'Unidade 3: Conditionals (Second, Third, Mixed). Unidade 4: Inversion and Advanced Structures.'
    }
  ]

  // Grava localmente
  if (typeof window !== 'undefined') {
    localStorage.setItem('teacher_schools', JSON.stringify(demoSchools))
    localStorage.setItem('teacher_classes', JSON.stringify(demoClasses))
    localStorage.setItem('teacher_students', JSON.stringify(demoStudents))
    localStorage.setItem('teacher_saved_exams', JSON.stringify(demoExams))
    localStorage.setItem('teacher_repository', JSON.stringify(demoDocuments))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
  }

  // Sincroniza imediatamente com o Supabase Cloud
  await syncToSupabase({
    teacher_schools: demoSchools,
    teacher_classes: demoClasses,
    teacher_students: demoStudents,
    teacher_saved_exams: demoExams,
    teacher_repository: demoDocuments
  })

  return { ok: true, message: 'Dados cadastrados com sucesso nas tabelas do Supabase!' }
}

/**
 * Salva um log de execução agêntica de portal no Supabase
 */
export async function savePortalExecutionLogToSupabase(log: {
  portalId: string
  portalName?: string
  actionType: string
  title: string
  date?: string
  classRef?: string
  mode?: string
  status?: string
  filledCount?: number
  extractedData?: any
  errorMessage?: string
}): Promise<{ ok: boolean }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/portal_execution_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        portal_id: log.portalId,
        portal_name: log.portalName || log.portalId,
        action_type: log.actionType,
        title: log.title,
        date: log.date || new Date().toISOString().split('T')[0],
        class_ref: log.classRef || '',
        mode: log.mode || 'supervised',
        status: log.status || 'success',
        filled_count: log.filledCount || 0,
        extracted_data: log.extractedData || {},
        error_message: log.errorMessage || null,
        created_at: new Date().toISOString()
      })
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

/**
 * Salva dados extraídos (scraping sem alucinação) no Supabase
 */
export async function saveScrapedDataToSupabase(data: {
  portalId: string
  pageUrl?: string
  dataType: string
  classRef?: string
  rawJson: any
  itemCount?: number
}): Promise<{ ok: boolean }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/portal_scraped_data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        portal_id: data.portalId,
        page_url: data.pageUrl || '',
        data_type: data.dataType,
        class_ref: data.classRef || '',
        raw_json: data.rawJson || {},
        item_count: data.itemCount || 0,
        scraped_at: new Date().toISOString()
      })
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

/**
 * Salva fato ou receita aprendida pela Rafinha na tabela de memória de longo prazo
 */
export async function saveLearnedFactToSupabase(factItem: {
  id: string
  category: string
  fact: string
  confidence?: number
  source?: string
  contextMetadata?: any
}): Promise<{ ok: boolean }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/rafinha_learned_facts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: factItem.id,
        category: factItem.category,
        fact: factItem.fact,
        confidence: factItem.confidence || 1.0,
        source: factItem.source || 'rafinha',
        context_metadata: factItem.contextMetadata || {},
        updated_at: new Date().toISOString()
      })
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

// ==============================================================================
// BANCO DE IMAGENS E MÍDIAS (MEDIA LIBRARY & SUPABASE STORAGE)
// ==============================================================================

export interface MediaLibraryItem {
  id: string
  title: string
  fileName?: string
  fileType?: string
  fileSize?: number
  fileUrl: string
  category?: 'Ilustrações Didáticas' | 'Mapas & Gráficos' | 'Logos & Selos' | 'Questões & Exercícios' | 'Diagramas Científicos' | 'Geral' | string
  tags?: string[]
  schoolId?: string
  schoolName?: string
  description?: string
  createdAt?: string
}

/**
 * Converte um arquivo File do navegador para Base64 Data URL (fallback resiliente).
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Faz upload de imagem para o Supabase Storage (bucket 'media').
 * Se a nuvem falhar ou não estiver configurada, faz fallback transparente para DataURL local.
 */
export async function uploadMediaFileToSupabase(file: File, folder: string = 'library'): Promise<{ ok: boolean; url: string; isCloud: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  const apiKey = cfg ? getActiveKey(cfg) : ''

  // Fallback imediato se não houver Supabase configurado
  if (!cfg?.url || !apiKey) {
    try {
      const dataUrl = await fileToDataUrl(file)
      return { ok: true, url: dataUrl, isCloud: false }
    } catch (e: any) {
      return { ok: false, url: '', isCloud: false, error: e.message || 'Erro ao processar arquivo local' }
    }
  }

  try {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${folder}/${Date.now()}_${cleanName}`

    // 1. Tenta upload no bucket 'media'
    const uploadRes = await fetch(`${cfg.url}/storage/v1/object/media/${filePath}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: file
    })

    if (uploadRes.ok) {
      const publicUrl = `${cfg.url}/storage/v1/object/public/media/${filePath}`
      return { ok: true, url: publicUrl, isCloud: true }
    }

    // Se o bucket não existir ou der erro de permissão no storage, usa fallback DataURL
    const dataUrl = await fileToDataUrl(file)
    return { ok: true, url: dataUrl, isCloud: false }
  } catch (err: any) {
    // Fallback gracioso para offline
    try {
      const dataUrl = await fileToDataUrl(file)
      return { ok: true, url: dataUrl, isCloud: false }
    } catch {
      return { ok: false, url: '', isCloud: false, error: err.message || 'Falha no upload' }
    }
  }
}

/**
 * Salva metadados de uma imagem no Supabase e no localStorage local
 */
export async function saveMediaItemToSupabase(item: MediaLibraryItem): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof window !== 'undefined') {
      const currentList: MediaLibraryItem[] = JSON.parse(localStorage.getItem('teacher_media_library') || '[]')
      const index = currentList.findIndex(x => x.id === item.id)
      if (index >= 0) {
        currentList[index] = item
      } else {
        currentList.unshift(item)
      }
      localStorage.setItem('teacher_media_library', JSON.stringify(currentList))
      window.dispatchEvent(new Event('storage'))
    }

    const cfg = getSupabaseConfig()
    const apiKey = cfg ? getActiveKey(cfg) : ''
    if (cfg?.url && apiKey) {
      await fetch(`${cfg.url}/rest/v1/media_library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          id: String(item.id),
          user_id: 'default_teacher',
          title: String(item.title || 'Imagem'),
          file_name: item.fileName || null,
          file_type: item.fileType || null,
          file_size: item.fileSize || 0,
          file_url: String(item.fileUrl || ''),
          category: item.category || 'Geral',
          tags: Array.isArray(item.tags) ? item.tags : [],
          school_id: item.schoolId || null,
          school_name: item.schoolName || null,
          description: item.description || null,
          created_at: item.createdAt || new Date().toISOString()
        })
      }).catch(() => null)
    }

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

/**
 * Busca todas as imagens da biblioteca (Supabase + localStorage merge)
 */
export async function fetchMediaLibraryFromSupabase(): Promise<MediaLibraryItem[]> {
  let items: MediaLibraryItem[] = []
  if (typeof window !== 'undefined') {
    try {
      items = JSON.parse(localStorage.getItem('teacher_media_library') || '[]')
    } catch { items = [] }
  }

  const cfg = getSupabaseConfig()
  const apiKey = cfg ? getActiveKey(cfg) : ''
  if (!cfg?.url || !apiKey) return items

  try {
    const res = await fetch(`${cfg.url}/rest/v1/media_library?select=*&order=created_at.desc&limit=500`, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`
      }
    })
    if (res.ok) {
      const cloudData = await res.json()
      if (Array.isArray(cloudData) && cloudData.length > 0) {
        const mappedCloud: MediaLibraryItem[] = cloudData.map(c => ({
          id: String(c.id),
          title: c.title,
          fileName: c.file_name,
          fileType: c.file_type,
          fileSize: c.file_size,
          fileUrl: c.file_url,
          category: c.category,
          tags: Array.isArray(c.tags) ? c.tags : [],
          schoolId: c.school_id,
          schoolName: c.school_name,
          description: c.description,
          createdAt: c.created_at
        }))

        // Merge: manter itens que estão na nuvem e itens locais ainda não sincronizados
        const mergedMap = new Map<string, MediaLibraryItem>()
        items.forEach(it => mergedMap.set(it.id, it))
        mappedCloud.forEach(it => mergedMap.set(it.id, it))
        const merged = Array.from(mergedMap.values()).sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )
        if (typeof window !== 'undefined') {
          localStorage.setItem('teacher_media_library', JSON.stringify(merged))
        }
        return merged
      }
    }
  } catch {
    // Retorna dados locais em caso de falha de conexão
  }
  return items
}

/**
 * Remove uma imagem da biblioteca e do Supabase
 */
export async function deleteMediaItemFromSupabase(id: string, fileUrl?: string): Promise<{ ok: boolean }> {
  try {
    if (typeof window !== 'undefined') {
      const currentList: MediaLibraryItem[] = JSON.parse(localStorage.getItem('teacher_media_library') || '[]')
      const filtered = currentList.filter(x => x.id !== id)
      localStorage.setItem('teacher_media_library', JSON.stringify(filtered))
      window.dispatchEvent(new Event('storage'))
    }

    const cfg = getSupabaseConfig()
    const apiKey = cfg ? getActiveKey(cfg) : ''
    if (cfg?.url && apiKey) {
      // 1. Delete do registro relacional
      await fetch(`${cfg.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`
        }
      }).catch(() => null)

      // 2. Se for arquivo no storage, tenta remover
      if (fileUrl && fileUrl.includes('/storage/v1/object/public/media/')) {
        const storagePath = fileUrl.split('/storage/v1/object/public/media/')[1]
        if (storagePath) {
          await fetch(`${cfg.url}/storage/v1/object/media/${storagePath}`, {
            method: 'DELETE',
            headers: {
              'apikey': apiKey,
              'Authorization': `Bearer ${apiKey}`
            }
          }).catch(() => null)
        }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMENTAS & CONTEÚDOS PROGRAMÁTICOS (Syllabuses)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupabaseSyllabusRow {
  id: string
  title: string
  school: string
  class_name: string
  term: string
  book_title: string
  book_units_chapters: string
  grammar_topics: string[]
  vocabulary_themes: string[]
  skills_and_objectives: string[]
  study_tips: string
  status: 'planejado' | 'em_andamento' | 'lecionado' | 'avaliado'
  evaluation_date?: string
  created_at?: string
  updated_at?: string
}

export async function fetchSyllabusesFromSupabase(): Promise<any[]> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const res = await fetch(`${cfg.url}/rest/v1/syllabuses?select=*&order=created_at.desc`, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((row: any) => ({
      id: row.id,
      title: row.title || '',
      school: row.school || '',
      className: row.class_name || row.className || '',
      term: row.term || '',
      bookTitle: row.book_title || row.bookTitle || '',
      bookUnitsChapters: row.book_units_chapters || row.bookUnitsChapters || '',
      grammarTopics: Array.isArray(row.grammar_topics) ? row.grammar_topics : (Array.isArray(row.grammarTopics) ? row.grammarTopics : []),
      vocabularyThemes: Array.isArray(row.vocabulary_themes) ? row.vocabulary_themes : (Array.isArray(row.vocabularyThemes) ? row.vocabularyThemes : []),
      skillsAndObjectives: Array.isArray(row.skills_and_objectives) ? row.skills_and_objectives : (Array.isArray(row.skillsAndObjectives) ? row.skillsAndObjectives : []),
      studyTips: row.study_tips || row.studyTips || '',
      status: row.status || 'planejado',
      evaluationDate: row.evaluation_date || row.evaluationDate || '',
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString()
    }))
  } catch {
    return []
  }
}

export async function saveSyllabusToSupabase(entry: any): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  try {
    const payload = {
      id: entry.id,
      title: entry.title,
      school: entry.school || '',
      class_name: entry.className || entry.class_name || '',
      term: entry.term || '',
      book_title: entry.bookTitle || entry.book_title || '',
      book_units_chapters: entry.bookUnitsChapters || entry.book_units_chapters || '',
      grammar_topics: entry.grammarTopics || entry.grammar_topics || [],
      vocabulary_themes: entry.vocabularyThemes || entry.vocabulary_themes || [],
      skills_and_objectives: entry.skillsAndObjectives || entry.skills_and_objectives || [],
      study_tips: entry.studyTips || entry.study_tips || '',
      status: entry.status || 'planejado',
      evaluation_date: entry.evaluationDate || entry.evaluation_date || null,
      updated_at: new Date().toISOString()
    }

    const res = await fetch(`${cfg.url}/rest/v1/syllabuses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    })
    return { ok: res.ok }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

export async function deleteSyllabusFromSupabase(id: string): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return true
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return true

  try {
    const res = await fetch(`${cfg.url}/rest/v1/syllabuses?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchSchoolsFromSupabase(): Promise<Array<{ id: string; name: string }>> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const res = await fetch(`${cfg.url}/rest/v1/schools?select=id,name&order=name.asc`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function fetchClassesFromSupabase(): Promise<Array<{ id: string; name: string; school_id?: string }>> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    const res = await fetch(`${cfg.url}/rest/v1/classes?select=id,name,school_id&order=name.asc`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEQUÊNCIA DIDÁTICA (Didactic Sequences)
// ─────────────────────────────────────────────────────────────────────────────

export interface DidacticSequenceStage {
  id: string
  stageNumber: number
  title: string
  bookRef: string
  plannedDate?: string
  actualDate?: string
  topics: string[]
  grammarFocus: string
  vocabularyFocus: string
  skillsAndObjectives?: string[]
  status: 'completed' | 'current' | 'upcoming'
  masteryPercentage: number
  aiAssessment?: string
  suggestedAction?: string
  notes?: string
}

export interface DidacticSequenceModel {
  id: string
  title: string
  school: string
  className: string
  subject: string
  year: string
  term: string
  bookRef: string
  currentStageIndex: number
  stages: DidacticSequenceStage[]
  aiDiagnostic?: string
  createdAt: string
  updatedAt: string
}

export async function fetchDidacticSequencesFromSupabase(school?: string, className?: string): Promise<DidacticSequenceModel[]> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return []
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return []

  try {
    let queryUrl = `${cfg.url}/rest/v1/didactic_sequences?select=*&order=updated_at.desc`
    if (school && school !== 'all') queryUrl += `&school=eq.${encodeURIComponent(school)}`
    if (className && className !== 'all') queryUrl += `&class_name=eq.${encodeURIComponent(className)}`

    const res = await fetch(queryUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((row: any) => ({
      id: row.id,
      title: row.title || '',
      school: row.school || '',
      className: row.class_name || row.className || '',
      subject: row.subject || 'Inglês',
      year: row.year || '2026',
      term: row.term || '2º Trimestre',
      bookRef: row.book_ref || row.bookRef || '',
      currentStageIndex: row.current_stage_index !== undefined ? row.current_stage_index : (row.currentStageIndex || 0),
      stages: Array.isArray(row.stages) ? row.stages : [],
      aiDiagnostic: row.ai_diagnostic || row.aiDiagnostic || '',
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString()
    }))
  } catch {
    return []
  }
}

export async function saveDidacticSequenceToSupabase(seq: DidacticSequenceModel): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: true }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: true }

  try {
    const payload = {
      id: seq.id,
      title: seq.title,
      school: seq.school || '',
      class_name: seq.className || '',
      subject: seq.subject || 'Inglês',
      year: seq.year || '2026',
      term: seq.term || '2º Trimestre',
      book_ref: seq.bookRef || '',
      current_stage_index: seq.currentStageIndex || 0,
      stages: seq.stages || [],
      ai_diagnostic: seq.aiDiagnostic || '',
      updated_at: new Date().toISOString()
    }

    const res = await fetch(`${cfg.url}/rest/v1/didactic_sequences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    })
    return { ok: res.ok }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

export async function deleteDidacticSequenceFromSupabase(id: string): Promise<boolean> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return true
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return true

  try {
    const res = await fetch(`${cfg.url}/rest/v1/didactic_sequences?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    })
    return res.ok
  } catch {
    return false
  }
}

