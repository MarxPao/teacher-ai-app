/**
 * lib/pdiManagement.ts — Gerenciamento e Persistência de Planos de Desenvolvimento Individual (PDI)
 *
 * Armazena PDIs em localStorage com suporte a histórico/arquivo de versões por estudante.
 */

import { SkillsMatrixRow, DocumentStrategyItem, SignatureItem } from './editableDocumentTypes'

export interface PdiRecord {
  id: string
  studentId: string
  studentName: string
  classId?: string
  schoolName?: string
  academicYear?: string
  status: 'active' | 'archived' | 'draft'

  // Box 1: Dados da Escola
  schoolInfo?: {
    schoolName?: string
    city?: string
    directors?: string
    creationDate?: string
  }

  // Box 2: Identificação do Aluno
  studentInfo?: {
    studentName?: string
    birthDate?: string
    gradeCycle?: string
    fatherName?: string
    motherName?: string
  }

  // Box 3: Relatório Circunstanciado (Condicional)
  clinicalReport?: {
    hasClinicalDiagnosis: boolean
    cid10?: string
    professionalName?: string
    reportDate?: string
    specializedServices?: string
    medication?: string
  }

  // Box 4: Avaliação Inicial (Funções de Desenvolvimento)
  developmentAssessment?: {
    percepcao?: string
    atencao?: string
    memoria?: string
    linguagem?: string
    raciocinio?: string
    emocional?: string
  }

  // Box 5: Proposta Curricular
  curricularProposal?: {
    proposta?: string
  }

  // Box 6: Matriz de Habilidades BNCC Adaptadas
  skillsMatrix: SkillsMatrixRow[]

  // Box 7: Plano de Intervenção
  interventionPlan: DocumentStrategyItem[]

  // Box 8: Assinaturas
  signatures: SignatureItem[]

  createdAt: string
  updatedAt: string
}

const PDI_STORAGE_KEY = 'teacher_pdi_records_v1'
const PDI_ARCHIVE_STORAGE_KEY = 'teacher_pdi_archive_v1'

let _memoryPdi: Record<string, PdiRecord> = {}
let _memoryPdiArchive: Record<string, PdiRecord[]> = {}

export function getAllPdiRecords(): Record<string, PdiRecord> {
  if (typeof window === 'undefined') return _memoryPdi
  try {
    const raw = localStorage.getItem(PDI_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getStudentPdi(studentId: string): PdiRecord | null {
  const all = getAllPdiRecords()
  return all[studentId] || null
}

export function saveStudentPdi(pdi: PdiRecord): void {
  const all = getAllPdiRecords()
  const updated = {
    ...pdi,
    updatedAt: new Date().toISOString()
  }
  all[pdi.studentId] = updated
  _memoryPdi = all

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PDI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pdi_changed', { detail: updated }))
    } catch (e) {
      console.error('[pdiManagement] Erro ao salvar PDI:', e)
    }
  }
}

export function getStudentPdiArchive(studentId: string): PdiRecord[] {
  if (typeof window === 'undefined') return _memoryPdiArchive[studentId] || []
  try {
    const raw = localStorage.getItem(PDI_ARCHIVE_STORAGE_KEY)
    const archive = raw ? JSON.parse(raw) : {}
    return archive[studentId] || []
  } catch {
    return []
  }
}

export function archiveStudentPdi(studentId: string): boolean {
  const current = getStudentPdi(studentId)
  if (!current) return false

  const archivedRecord: PdiRecord = {
    ...current,
    status: 'archived',
    updatedAt: new Date().toISOString()
  }

  // Adiciona ao arquivo
  const archive = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem(PDI_ARCHIVE_STORAGE_KEY) || '{}')
    : _memoryPdiArchive

  if (!archive[studentId]) archive[studentId] = []
  archive[studentId].unshift(archivedRecord)
  _memoryPdiArchive = archive

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PDI_ARCHIVE_STORAGE_KEY, JSON.stringify(archive))
      // Remove do registro ativo
      const all = getAllPdiRecords()
      delete all[studentId]
      localStorage.setItem(PDI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pdi_changed', { detail: { studentId, archived: true } }))
      return true
    } catch {
      return false
    }
  }
  return true
}

export function deleteStudentPdi(studentId: string): boolean {
  const all = getAllPdiRecords()
  delete all[studentId]
  _memoryPdi = all
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PDI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pdi_changed', { detail: { studentId, deleted: true } }))
      return true
    } catch {
      return false
    }
  }
  return true
}

export function createDefaultPdi(
  studentId: string,
  studentName: string,
  classId?: string,
  schoolName: string = 'Colégio Machado Sobrinho'
): PdiRecord {
  const now = new Date().toISOString().split('T')[0]
  return {
    id: `pdi_${studentId}_${Date.now()}`,
    studentId,
    studentName,
    classId,
    schoolName,
    academicYear: String(new Date().getFullYear()),
    status: 'active',
    schoolInfo: {
      schoolName,
      city: 'Juiz de Fora - MG',
      directors: 'Coordenação Pedagógica / Direção',
      creationDate: now
    },
    studentInfo: {
      studentName,
      birthDate: '',
      gradeCycle: 'Ensino Fundamental II',
      fatherName: '',
      motherName: ''
    },
    clinicalReport: {
      hasClinicalDiagnosis: false,
      cid10: '',
      professionalName: '',
      reportDate: '',
      specializedServices: '',
      medication: ''
    },
    developmentAssessment: {
      percepcao: 'Em observação pedagógica inicial.',
      atencao: 'Necessita de mediação para sustentação de foco prolongado.',
      memoria: 'Boa retenção com recursos visuais e repetição espaçada.',
      linguagem: 'Compreensão satisfatória; expressão oral participativa.',
      raciocinio: 'Evolução consistente na resolução de problemas concretos.',
      emocional: 'Excelente relação interpessoal com a turma.'
    },
    curricularProposal: {
      proposta: 'Adequação de ritmo, mediação em atividades extensas e valorização de potencialidades autorais.'
    },
    skillsMatrix: [
      {
        id: 'sk_1',
        subject: 'Língua Inglesa',
        skillCode: 'EF08LI01',
        skillDescription: 'Fazer uso dos recursos linguísticos para expressar ideias e experiências.',
        workDoneOrAdaptedSkill: 'Exercícios contextualizados em duplas e suporte de vocabulário ilustrado.',
        status: 'HED'
      },
      {
        id: 'sk_2',
        subject: 'Língua Portuguesa',
        skillCode: 'EF08LP04',
        skillDescription: 'Identificar a tese e os argumentos em textos de opinião.',
        workDoneOrAdaptedSkill: 'Leitura compartilhada com marcação colorida de conectivos.',
        status: 'HV'
      }
    ],
    interventionPlan: [
      { id: 'int_1', description: 'Instruções verbais curtas divididas em etapas', isActive: true },
      { id: 'int_2', description: 'Uso de recursos visuais e esquemas gráficos', isActive: true },
      { id: 'int_3', description: 'Tempo adicional (+50%) em avaliações e tarefas', isActive: true },
      { id: 'int_4', description: 'Avaliações com número reduzido de distratores', isActive: true }
    ],
    signatures: [
      { role: 'Direção Pedagógica', name: '', signed: false },
      { role: 'Professores Regentes', name: '', signed: false },
      { role: 'Coordenação Pedagógica', name: '', signed: false },
      { role: 'Orientação Educacional / AEE', name: '', signed: false }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
