let _memoryPei: Record<string, PeiRecord> = {}
/**
 * lib/peiManagement.ts — Motor de Plano Educacional Individualizado (PEI / IEP)
 * 
 * Atende alunos NEE (Necessidades Educacionais Especiais) e Laudados
 * estruturando metas SMART, linha de base, adaptações e cronograma periódico.
 */

export interface SupportProfessional {
  name: string
  role: string // Ex: 'Psicopedagoga' | 'Fonoaudíologa' | 'AT (Companhante)' | 'Tutor'
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
  type: 'exam_time' | 'font_size' | 'reduced_distractors' | 'scribe' | 'assistive_tech' | 'pedagogical_break;'
  description: string
  isActive: boolean
}

export interface PeiRecord {
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
  lastReviewedAt?: string
  nextReviewDue?: string
  generalObservations?: string
  updatedAt?: number
}

export type PeiProfile = PeiRecord

const PEI_STORAGE_KEY = 'teacher_pei_records_v1'

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
  all[pei.studentId] = pei
  _memoryPei = all
  if (typeof window === 'undefined') return
  all[pei.studentId] = pei
  localStorage.setItem(PEI_STORAGE_KEY, JSON.stringify(all))
  window.dispatchEvent(new CustomEvent('teacher:pei_changed', { detail: pei }))
}

export function createDefaultPei(studentId: string, studentName: string): PeiRecord {
  const now = new Date().toISOString().split('T')[0]
  const nextRev = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]

  return {
    studentId,
    studentName,
    diagnosis: 'NEE nm especificada / Em avaliação',
    laudoInfo: {
      cid10: '',
      issuedBy: '',
      issuedDate: now,
    },
    professionals: [
      { name: '', role: 'Psicopedagoga' }
    ],
    goals: [
      { id: 'goal_' + Date.now() + '_1', title: 'Autonomia na leitura de enunciados', category: 'cognitive', baseline: 'Requer leitura mediada em 80% das atividades', target: 'Compreender instruções de até 3 linhas com 50% de autonomia', deadline: nextRev, status: 'in_progress', progressPct: 25 }
    ],
    accommodations: [
      { id: 'acc_time', type: 'exam_time', description: '+50% de tempo adicional em atividades e avaliações', isActive: true },
      { id: 'acc_dist', type: 'reduced_distractors', description: 'Adaptaçóo para 3 alternativas em vez de 4 ou 5', isActive: true }
    ],
    lastReviewedAt: now,
    nextReviewDue: nextRev,
    generalObservations: 'Adaptação curricular e foco em compreensão lexical com reforço visual.'
  }
}
