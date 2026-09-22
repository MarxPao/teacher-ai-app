/**
 * lib/peiManagement.ts — Motor de Plano Educacional Individualizado (PEI / IEP)
 *
 * Atende alunos NEE (Necessidades Educacionais Especiais) e Laudados
 * estruturando metas SMART, linha de base, adaptações, flexibilização curricular e arquivo histórico.
 */

import { SkillsMatrixRow } from './editableDocumentTypes'

export interface SupportProfessional {
  name: string
  role: string // Ex: 'Psicopedagoga' | 'Fonoaudióloga' | 'AT (Acompanhante)' | 'Tutor'
  contact?: string
}

export interface PeiSmartGoal {
  id: string
  title: string
  category?: 'cognitive' | 'behavioral' | 'linguistic' | 'academic'
  baseline?: string // Linha de base (como o aluno está hoje)
  target: string // Meta especificada e mensurável
  deadline: string // Data limite prevista
  status: 'pending' | 'in_progress' | 'achieved' | 'review' | 'active'
  progressPct?: number // 0 a 100
}

export interface PeiAccommodation {
  id: string
  type: 'exam_time' | 'font_size' | 'reduced_distractors' | 'scribe' | 'assistive_tech' | 'pedagogical_break' | string
  description: string
  isActive: boolean
}

export interface PeiRecord {
  id?: string
  studentId: string
  studentName: string
  diagnosis: string // Ex: 'TEA (Grau 1)', 'TDAH/I', 'Dislexia', 'Altas Habilidades', 'Baixa Visão'
  laudoInfo?: {
    cid10?: string
    issuedBy?: string
    issuedDate?: string
  }
  professionals?: SupportProfessional[]
  goals: PeiSmartGoal[]
  accommodations: PeiAccommodation[]
  flexibilizacaoCurricular?: SkillsMatrixRow[]
  planoAee?: {
    aeeFrequency?: string
    aeeSchedule?: string
    aeeObjectives?: string
  }
  lastReviewedAt?: string
  nextReviewDue?: string
  generalObservations?: string
  status?: 'active' | 'archived' | 'draft'
  updatedAt?: number | string
  createdAt?: string
}

export type PeiProfile = PeiRecord

const PEI_STORAGE_KEY = 'teacher_pei_records_v1'
const PEI_ARCHIVE_STORAGE_KEY = 'teacher_pei_archive_v1'

let _memoryPei: Record<string, PeiRecord> = {}
let _memoryPeiArchive: Record<string, PeiRecord[]> = {}

export function getAllPeiRecords(): Record<string, PeiRecord> {
  if (typeof window === 'undefined') return _memoryPei
  try {
    const raw = localStorage.getItem(PEI_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getStudentPei(studentId: string): PeiRecord | null {
  const all = getAllPeiRecords()
  return all[studentId] || null
}

export function saveStudentPei(pei: PeiRecord): void {
  const all = getAllPeiRecords()
  const updated = {
    ...pei,
    id: pei.id || `pei_${pei.studentId}_${Date.now()}`,
    status: pei.status || 'active',
    updatedAt: Date.now()
  }
  all[pei.studentId] = updated
  _memoryPei = all
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PEI_STORAGE_KEY, JSON.stringify(all))
    window.dispatchEvent(new CustomEvent('teacher:pei_changed', { detail: updated }))
  } catch (e) {
    console.error('[peiManagement] Erro ao salvar PEI:', e)
  }
}

export function getStudentPeiArchive(studentId: string): PeiRecord[] {
  if (typeof window === 'undefined') return _memoryPeiArchive[studentId] || []
  try {
    const raw = localStorage.getItem(PEI_ARCHIVE_STORAGE_KEY)
    const archive = raw ? JSON.parse(raw) : {}
    return archive[studentId] || []
  } catch {
    return []
  }
}

export function archiveStudentPei(studentId: string): boolean {
  const current = getStudentPei(studentId)
  if (!current) return false

  const archivedRecord: PeiRecord = {
    ...current,
    status: 'archived',
    updatedAt: Date.now()
  }

  const archive = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem(PEI_ARCHIVE_STORAGE_KEY) || '{}')
    : _memoryPeiArchive

  if (!archive[studentId]) archive[studentId] = []
  archive[studentId].unshift(archivedRecord)
  _memoryPeiArchive = archive

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PEI_ARCHIVE_STORAGE_KEY, JSON.stringify(archive))
      const all = getAllPeiRecords()
      delete all[studentId]
      localStorage.setItem(PEI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pei_changed', { detail: { studentId, archived: true } }))
      return true
    } catch {
      return false
    }
  }
  return true
}

export function deleteStudentPei(studentId: string): boolean {
  const all = getAllPeiRecords()
  delete all[studentId]
  _memoryPei = all
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PEI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pei_changed', { detail: { studentId, deleted: true } }))
      return true
    } catch {
      return false
    }
  }
  return true
}

export function createDefaultPei(studentId: string, studentName: string): PeiRecord {
  const now = new Date().toISOString().split('T')[0]
  const nextRev = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]

  return {
    id: `pei_${studentId}_${Date.now()}`,
    studentId,
    studentName,
    diagnosis: 'NEE não especificada / Em avaliação',
    status: 'active',
    laudoInfo: {
      cid10: '',
      issuedBy: '',
      issuedDate: now,
    },
    professionals: [
      { name: '', role: 'Psicopedagoga' }
    ],
    goals: [
      {
        id: 'goal_' + Date.now() + '_1',
        title: 'Autonomia na leitura de enunciados',
        category: 'cognitive',
        baseline: 'Requer leitura mediada em 80% das atividades',
        target: 'Compreender instruções de até 3 linhas com 50% de autonomia',
        deadline: nextRev,
        status: 'in_progress',
        progressPct: 25
      }
    ],
    accommodations: [
      { id: 'acc_time', type: 'exam_time', description: '+50% de tempo adicional em atividades e avaliações', isActive: true },
      { id: 'acc_dist', type: 'reduced_distractors', description: 'Adaptação para 3 alternativas em vez de 4 ou 5', isActive: true },
      { id: 'acc_font', type: 'font_size', description: 'Fonte ampliada (16pt+) e espaçamento 1.5', isActive: true }
    ],
    flexibilizacaoCurricular: [
      {
        id: 'flx_1',
        subject: 'Língua Inglesa',
        skillCode: 'EF08LI01',
        skillDescription: 'Fazer uso dos recursos linguísticos para expressar ideias.',
        workDoneOrAdaptedSkill: 'Produção oral guiada com apoio de flashcards de vocabulário básico.',
        status: 'HED',
        criterion: 'Compreensão de 3 chunks essenciais em vez do diálogo complexo'
      }
    ],
    planoAee: {
      aeeFrequency: '2x por semana (50 min)',
      aeeSchedule: 'Terças e Quintas (Contraturno)',
      aeeObjectives: 'Reforço de mediação leitora e organização de rotina de estudos.'
    },
    lastReviewedAt: now,
    nextReviewDue: nextRev,
    generalObservations: 'Adaptação curricular e foco em compreensão lexical com reforço visual.',
    createdAt: new Date().toISOString(),
    updatedAt: Date.now()
  }
}
