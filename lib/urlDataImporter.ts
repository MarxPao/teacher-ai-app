/**
 * lib/urlDataImporter.ts — Importação e Normalização Real de Planilhas via URL
 *
 * Converte links do Google Sheets para o endpoint de exportação CSV oficial,
 * realiza parse real com PapaParse e mapeia as colunas para o schema
 * ScrapedStudent compatível com o reconciliador em 4 vias (rosterReconciler.ts).
 */

import Papa from 'papaparse'
import type { ScrapedStudent } from './rosterReconciler'

export interface UrlConversionResult {
  isGoogleSheets: boolean
  exportUrl: string
  sheetId?: string
  gid?: string
  originalUrl: string
}

export interface ParsedCsvRosterResult {
  students: ScrapedStudent[]
  headers: string[]
  totalRows: number
  detectedColumns: {
    nameCol?: string
    rollCol?: string
    classCol?: string
    gradeCol?: string
    emailCol?: string
  }
}

/**
 * Normaliza strings para comparação flexível de cabeçalhos de coluna
 */
function normalizeHeaderName(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Converte uma URL de visualização/edição do Google Sheets para a URL canônica de exportação CSV
 */
export function convertGoogleSheetsUrlToCsvExport(rawUrl: string): UrlConversionResult {
  const trimmed = rawUrl.trim()

  // 1. Verifica se é uma planilha publicada na web (/d/e/{pubId}/...)
  const publishedMatch = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)\/(?:pub|pubhtml)/i)
  if (publishedMatch) {
    const sheetId = publishedMatch[1]
    const gidMatch = trimmed.match(/[?&#]gid=([0-9]+)/i)
    const gid = gidMatch ? gidMatch[1] : '0'
    const exportUrl = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?output=csv&gid=${gid}`
    return {
      isGoogleSheets: true,
      exportUrl,
      sheetId,
      gid,
      originalUrl: trimmed
    }
  }

  // 2. Verifica se é uma planilha do Google Sheets padrão (/d/{id}/...)
  const standardMatch = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i)
  if (standardMatch) {
    const sheetId = standardMatch[1]
    if (sheetId !== 'e') {
      const gidMatch = trimmed.match(/[?&#]gid=([0-9]+)/i)
      const gid = gidMatch ? gidMatch[1] : '0'
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
      return {
        isGoogleSheets: true,
        exportUrl,
        sheetId,
        gid,
        originalUrl: trimmed
      }
    }
  }

  // Não é Google Sheets — retorna a URL original
  return {
    isGoogleSheets: false,
    exportUrl: trimmed,
    originalUrl: trimmed
  }
}

/**
 * Valida se a URL fornecida tem formato plausível de Google Sheets ou arquivo CSV
 */
export function isSupportedDataUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  const trimmed = rawUrl.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false

  if (/docs\.google\.com\/spreadsheets/i.test(trimmed)) {
    return true
  }

  const pathname = trimmed.split('?')[0].toLowerCase()
  if (pathname.endsWith('.csv')) {
    return true
  }

  if (trimmed.includes('format=csv') || trimmed.includes('output=csv')) {
    return true
  }

  return false
}

/**
 * Detecta as colunas de um arquivo CSV através de análise heurística de sinônimos
 */
export function detectStudentColumnMapping(headers: string[]): ParsedCsvRosterResult['detectedColumns'] {
  let nameCol: string | undefined
  let rollCol: string | undefined
  let classCol: string | undefined
  let gradeCol: string | undefined
  let emailCol: string | undefined

  for (const h of headers) {
    const norm = normalizeHeaderName(h)

    // Coluna de Nome (prioridade máxima)
    if (!nameCol) {
      if (
        norm === 'nome' ||
        norm === 'nomedoaluno' ||
        norm === 'nomecompleto' ||
        norm === 'aluno' ||
        norm === 'estudante' ||
        norm === 'student' ||
        norm === 'fullname' ||
        norm === 'name'
      ) {
        nameCol = h
        continue
      } else if (norm.includes('nome') || norm.includes('student') || norm.includes('aluno')) {
        nameCol = h
        continue
      }
    }

    // Coluna de Matrícula / Chamada / ID
    if (!rollCol) {
      if (
        norm === 'numero' ||
        norm === 'num' ||
        norm === 'chamada' ||
        norm === 'matricula' ||
        norm === 'id' ||
        norm === 'codigo' ||
        norm === 'roll' ||
        norm === 'rollnumber' ||
        norm.includes('chamada') ||
        norm.includes('matricula') ||
        norm.includes('numero') ||
        norm.includes('roll')
      ) {
        rollCol = h
        continue
      }
    }

    // Coluna de Turma / Série
    if (!classCol) {
      if (
        norm === 'turma' ||
        norm === 'classe' ||
        norm === 'ano' ||
        norm === 'serie' ||
        norm === 'class' ||
        norm === 'grade' ||
        norm === 'turmadoaluno'
      ) {
        classCol = h
        continue
      }
    }

    // Coluna de Nota / Desempenho
    if (!gradeCol) {
      if (
        norm === 'nota' ||
        norm === 'media' ||
        norm === 'score' ||
        norm === 'pontos' ||
        norm === 'points' ||
        norm === 'av1' ||
        norm === 'avaliacao' ||
        norm === 'notafinal'
      ) {
        gradeCol = h
        continue
      }
    }

    // Coluna de Email
    if (!emailCol) {
      if (norm === 'email' || norm === 'mail' || norm === 'correio' || norm === 'contato') {
        emailCol = h
        continue
      }
    }
  }

  // Fallback para nome: se nenhuma coluna foi identificada como nome, seleciona a primeira coluna de texto
  if (!nameCol && headers.length > 0) {
    nameCol = headers[0]
  }

  return { nameCol, rollCol, classCol, gradeCol, emailCol }
}

/**
 * Detecta se a planilha é um relatório escolar agrupado por aluno
 * (formato comum em LMS/plataformas como SAS, Geekie, Plurall, etc.),
 * onde cada aluno possui um bloco com seu nome seguido por disciplinas e totais.
 */
export function isGroupedSchoolReport(rawRows: string[][]): boolean {
  if (!rawRows || rawRows.length < 3) return false

  let hasDisciplinasHeader = false
  let hasTotalRow = false
  let singleNameRowsCount = 0

  for (let i = 0; i < Math.min(40, rawRows.length); i++) {
    const row = rawRows[i]
    if (!row || row.length === 0) continue
    const col0 = (row[0] || '').trim().toLowerCase()
    if (col0.startsWith('disciplina')) hasDisciplinasHeader = true
    if (col0.startsWith('total')) hasTotalRow = true
    if (col0 && col0.length > 3 && !/^(disciplina|total|subtotal|desempenho|media|nota|relatorio)/i.test(col0)) {
      const restEmpty = row.slice(1).every(c => !c || !c.trim() || c.trim() === 'X')
      if (restEmpty) singleNameRowsCount++
    }
  }

  return (hasDisciplinasHeader || hasTotalRow) && singleNameRowsCount >= 2
}

/**
 * Realiza parse de relatórios escolares agrupados por blocos de alunos
 */
export function parseGroupedSchoolReport(
  rawRows: string[][],
  defaultClassRef?: string
): ParsedCsvRosterResult {
  const students: ScrapedStudent[] = []
  let currentStudent: ScrapedStudent | null = null

  const knownSubjects = new Set([
    'lingua inglesa', 'ingles', 'lingua portuguesa', 'portugues', 'matematica',
    'ciencias', 'historia', 'geografia', 'fisica', 'quimica', 'biologia',
    'filosofia', 'sociologia', 'arte', 'artes', 'educacao fisica', 'redacao', 'literatura'
  ])

  function normalizeSubject(str: string): string {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
  }

  // Detecta se há uma disciplina predominante para usar como defaultClassRef se não especificado
  let detectedSubject: string | undefined
  for (const row of rawRows.slice(0, 30)) {
    const col0 = normalizeSubject(row[0] || '')
    if (knownSubjects.has(col0)) {
      detectedSubject = (row[0] || '').trim()
      break
    }
  }

  const resolvedClassRef = defaultClassRef || detectedSubject || 'Geral'

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const col0 = (row[0] || '').trim()
    if (!col0) continue

    const col0Norm = normalizeSubject(col0)

    // Se for linha de cabeçalho de disciplinas
    if (col0Norm.startsWith('disciplina')) {
      continue
    }

    // Se for linha de 'Total'
    if (col0Norm.startsWith('total')) {
      if (currentStudent && currentStudent.grade === undefined) {
        for (let c = 1; c < row.length; c++) {
          const val = (row[c] || '').trim()
          if (val.endsWith('%')) {
            const num = parseFloat(val.replace('%', '').replace(',', '.'))
            if (!isNaN(num)) {
              currentStudent.grade = num
              break
            }
          }
        }
      }
      continue
    }

    // Se for matéria/disciplina conhecida
    if (knownSubjects.has(col0Norm)) {
      if (currentStudent && currentStudent.grade === undefined) {
        for (let c = 1; c < row.length; c++) {
          const val = (row[c] || '').trim()
          if (val.endsWith('%')) {
            const num = parseFloat(val.replace('%', '').replace(',', '.'))
            if (!isNaN(num)) {
              currentStudent.grade = num
              break
            }
          }
        }
      }
      continue
    }

    // Verifica se a próxima linha tem 'DISCIPLINAS' ou se a primeira coluna é um nome de pessoa
    const nextRow = rawRows[i + 1]
    const nextCol0Norm = nextRow ? normalizeSubject(nextRow[0] || '') : ''
    const isFollowedByDisciplinas = nextCol0Norm.startsWith('disciplina')

    const cleanName = col0.replace(/help_outline/g, '').trim()
    if (isFollowedByDisciplinas || cleanName.split(/\s+/).length >= 2) {
      currentStudent = {
        name: cleanName,
        portal_native_id: `sheet_${students.length + 1}`,
        rollNumber: String(students.length + 1),
        classRef: resolvedClassRef,
        grade: undefined,
        status: 'active',
        source_origin: 'csv_url'
      }

      // Se a própria linha já tiver porcentagem (ex: BEATRIZ NETTO FERRAZ)
      for (let c = 1; c < row.length; c++) {
        const val = (row[c] || '').trim()
        if (val.endsWith('%')) {
          const num = parseFloat(val.replace('%', '').replace(',', '.'))
          if (!isNaN(num)) {
            currentStudent.grade = num
            break
          }
        }
      }

      students.push(currentStudent)
    }
  }

  return {
    students,
    headers: ['Nome', 'Turma/Disciplina', 'Desempenho'],
    totalRows: rawRows.length,
    detectedColumns: {
      nameCol: 'Nome',
      classCol: 'Turma/Disciplina',
      gradeCol: 'Desempenho'
    }
  }
}

/**
 * Faz parse real do CSV com PapaParse e converte as linhas em ScrapedStudent[]
 */
export function parseCsvToStudents(
  csvContent: string,
  defaultClassRef?: string
): ParsedCsvRosterResult {
  if (!csvContent || csvContent.trim().length === 0) {
    return {
      students: [],
      headers: [],
      totalRows: 0,
      detectedColumns: {}
    }
  }

  // Parse raw sem assumir header para verificar se é relatório agrupado
  const rawParsed = Papa.parse<string[]>(csvContent.trim(), {
    header: false,
    skipEmptyLines: true
  })

  if (isGroupedSchoolReport(rawParsed.data)) {
    return parseGroupedSchoolReport(rawParsed.data, defaultClassRef)
  }

  const parsed = Papa.parse<Record<string, any>>(csvContent.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  })

  const rawHeaders = parsed.meta.fields || []
  const headers = rawHeaders.filter(h => h && h.trim().length > 0)
  const mapping = detectStudentColumnMapping(headers)
  const students: ScrapedStudent[] = []

  parsed.data.forEach((row, idx) => {
    // Extrai o nome do aluno
    const rawName = mapping.nameCol ? row[mapping.nameCol] : undefined
    const cleanName = rawName ? String(rawName).trim() : ''

    // Pula linhas sem nome ou que repetem o cabeçalho
    if (!cleanName || cleanName.toLowerCase() === 'nome' || cleanName.toLowerCase() === 'name') {
      return
    }

    // Extrai matrícula / chamada
    const rawRoll = mapping.rollCol ? row[mapping.rollCol] : undefined
    const rollNumber = rawRoll !== undefined && rawRoll !== null && String(rawRoll).trim() !== ''
      ? String(rawRoll).trim()
      : undefined

    // Extrai turma
    const rawClass = mapping.classCol ? row[mapping.classCol] : undefined
    const classRef = rawClass !== undefined && rawClass !== null && String(rawClass).trim() !== ''
      ? String(rawClass).trim()
      : (defaultClassRef || 'Geral')

    // Extrai nota se houver
    let gradeVal: number | undefined
    if (mapping.gradeCol && row[mapping.gradeCol] !== undefined) {
      const parsedNum = parseFloat(String(row[mapping.gradeCol]).replace(',', '.'))
      if (!isNaN(parsedNum)) {
        gradeVal = parsedNum
      }
    }

    // Extrai email se houver
    const emailVal = mapping.emailCol && row[mapping.emailCol]
      ? String(row[mapping.emailCol]).trim()
      : undefined

    const studentRecord: ScrapedStudent = {
      name: cleanName,
      portal_native_id: rollNumber || `csv_${idx + 1}`,
      rollNumber,
      classRef,
      grade: gradeVal,
      email: emailVal,
      status: 'active',
      source_origin: 'csv_url'
    }

    students.push(studentRecord)
  })

  return {
    students,
    headers,
    totalRows: parsed.data.length,
    detectedColumns: mapping
  }
}
