/**
 * lib/dataPortability.ts — Portabilidade Integral e Backup de Dados do Professor
 *
 * Em conformidade com LGPD e princípios de soberania de dados do usuário (BYOK),
 * permite a exportação integral dos dados pedagógicos em JSON estruturado
 * e planilhas tabulares legíveis em CSV (com BOM UTF-8 para compatibilidade com Excel).
 */

import { safeGet, KEYS } from './localDB'

export interface TeacherExportMetadata {
  version: string
  exportedAt: string
  app: string
  counts: {
    students: number
    classes: number
    schools: number
    lessonPlans: number
    exams: number
    rubrics: number
    attendance: number
    memories: number
    grades: number
  }
}

export interface TeacherFullExport {
  meta: TeacherExportMetadata
  students: any[]
  classes: any[]
  schools: any[]
  lessonPlans: any[]
  savedExams: any[]
  rubrics: any[]
  attendanceRecords: any[]
  classLogs: any[]
  studentMemories: any[]
  studentMetrics: any[]
  gradebookConfig: any
  communications: any[]
  calendarTasks: any[]
}

/**
 * Coleta todos os registros pedagógicos do professor armazenados localmente.
 */
export function compileFullTeacherData(): TeacherFullExport {
  const students = safeGet<any[]>(KEYS.STUDENTS, [])
  const classes = safeGet<any[]>(KEYS.CLASSES, [])
  const schools = safeGet<any[]>(KEYS.SCHOOLS, [])
  const lessonPlans = [
    ...safeGet<any[]>(KEYS.LESSON_PLANS, []),
    ...safeGet<any[]>(KEYS.LESSON_PLANS_BANK, [])
  ]
  const savedExams = safeGet<any[]>(KEYS.SAVED_EXAMS, [])
  const rubrics = safeGet<any[]>(KEYS.RUBRICS, [])
  const attendanceRecords = safeGet<any[]>(KEYS.ATTENDANCE, [])
  const classLogs = safeGet<any[]>(KEYS.CLASS_LOGS, [])
  const studentMemories = safeGet<any[]>(KEYS.STUDENT_MEMORY, [])
  const studentMetrics = safeGet<any[]>(KEYS.STUDENT_METRICS, [])
  const gradebookConfig = safeGet<any>(KEYS.GRADEBOOK_CONFIG, {})
  const communications = safeGet<any[]>(KEYS.COMMUNICATIONS, [])
  const calendarTasks = safeGet<any[]>(KEYS.CALENDAR_TASKS, [])

  const meta: TeacherExportMetadata = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    app: 'Teacher AI Platform',
    counts: {
      students: students.length,
      classes: classes.length,
      schools: schools.length,
      lessonPlans: lessonPlans.length,
      exams: savedExams.length,
      rubrics: rubrics.length,
      attendance: attendanceRecords.length,
      memories: studentMemories.length,
      grades: Object.keys(gradebookConfig?.grades || {}).length
    }
  }

  return {
    meta,
    students,
    classes,
    schools,
    lessonPlans,
    savedExams,
    rubrics,
    attendanceRecords,
    classLogs,
    studentMemories,
    studentMetrics,
    gradebookConfig,
    communications,
    calendarTasks
  }
}

/**
 * Converte os dados essenciais de alunos e desempenho em CSV compatível com Excel (UTF-8 com BOM).
 */
export function generateStudentsAndGradesCsv(data?: TeacherFullExport): string {
  const exportData = data || compileFullTeacherData()
  const students = exportData.students || []
  const classesMap = new Map((exportData.classes || []).map((c: any) => [c.id || c.name, c.name || c.id]))
  const memoriesMap = new Map()

  // Agrupar observações / memórias por aluno
  for (const mem of (exportData.studentMemories || [])) {
    const sId = mem.studentId || mem.student_id || mem.id
    if (sId) {
      const existing = memoriesMap.get(sId) || []
      existing.push(mem.content || mem.note || mem.observation || '')
      memoriesMap.set(sId, existing)
    }
  }

  // Cabeçalho CSV formatado em português
  const headers = [
    'ID Aluno',
    'Nome Completo',
    'Turma',
    'Escola',
    'Necessidades Especiais / PEI',
    'Nível / Desempenho',
    'Frequência Estimada (%)',
    'Histórico / Memória Recente'
  ]

  const rows: string[][] = [headers]

  for (const st of students) {
    const studentId = st.id || ''
    const name = st.name || st.fullName || 'Sem nome'
    const className = classesMap.get(st.classId || st.class) || st.class || st.className || 'Não informada'
    const schoolName = st.schoolName || st.school || 'Não informada'
    const specialNeeds = st.specialNeeds || st.special_needs || st.pei || st.iep ? 'Sim (PEI)' : 'N/A'
    const levelOrScore = st.level || st.score || st.grade || st.overallScore || 'N/A'
    const attendance = st.attendanceRate !== undefined ? `${st.attendanceRate}%` : '100%'

    const studentMems = memoriesMap.get(studentId) || []
    const lastMemory = studentMems.length > 0 ? studentMems[studentMems.length - 1] : (st.notes || '')

    rows.push([
      `"${String(studentId).replace(/"/g, '""')}"`,
      `"${String(name).replace(/"/g, '""')}"`,
      `"${String(className).replace(/"/g, '""')}"`,
      `"${String(schoolName).replace(/"/g, '""')}"`,
      `"${String(specialNeeds).replace(/"/g, '""')}"`,
      `"${String(levelOrScore).replace(/"/g, '""')}"`,
      `"${String(attendance).replace(/"/g, '""')}"`,
      `"${String(lastMemory).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
    ])
  }

  // Se não houver alunos, gera cabeçalho com linha explicativa
  if (students.length === 0) {
    rows.push([
      '"Nenhum aluno cadastrado"',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""'
    ])
  }

  // UTF-8 BOM (\uFEFF) para forçar o Excel a abrir com acentuação correta
  const csvContent = '\uFEFF' + rows.map(r => r.join(';')).join('\r\n')
  return csvContent
}

/**
 * Dispara o download de um arquivo no navegador do professor.
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string): boolean {
  if (typeof window === 'undefined' || !window.document) {
    return false
  }

  try {
    const doc = window.document
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = doc.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    doc.body.appendChild(link)
    link.click()
    doc.body.removeChild(link)
    URL.revokeObjectURL(url)
    return true
  } catch (err) {
    console.error('[dataPortability] Falha ao disparar download:', err)
    return false
  }
}

/**
 * Executa a exportação JSON completa e inicia o download.
 */
export function exportTeacherDataAsJson(): { success: boolean; filename: string; data: TeacherFullExport } {
  const data = compileFullTeacherData()
  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `backup_teacher_ai_${dateStr}.json`
  const jsonString = JSON.stringify(data, null, 2)
  const success = triggerFileDownload(jsonString, filename, 'application/json;charset=utf-8;')
  return { success, filename, data }
}

/**
 * Executa a exportação CSV de alunos/desempenho e inicia o download.
 */
export function exportTeacherStudentsCsv(): { success: boolean; filename: string; csv: string } {
  const data = compileFullTeacherData()
  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `alunos_desempenho_${dateStr}.csv`
  const csvString = generateStudentsAndGradesCsv(data)
  const success = triggerFileDownload(csvString, filename, 'text/csv;charset=utf-8;')
  return { success, filename, csv: csvString }
}
