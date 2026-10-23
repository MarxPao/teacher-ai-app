/**
 * lib/peiPdiFolderStore.ts — Gestão de Pastas para PEIs e PDIs na Biblioteca / Repositório
 *
 * Permite organizar planos PEI e PDI por Turma, Trimestre, Ano Letivo ou Pastas Personalizadas,
 * dividindo competências e metas por período letivo.
 */

import { getAllPdiRecords, saveStudentPdi, type PdiRecord } from './pdiManagement'
import { getAllPeiRecords, saveStudentPei, type PeiRecord } from './peiManagement'
import { syncToSupabase } from './supabaseClient'

export interface PeiPdiFolder {
  id: string
  name: string
  description?: string
  type: 'class' | 'term' | 'year' | 'custom'
  classGroup?: string
  academicYear?: string
  term?: '1º Trimestre' | '2º Trimestre' | '3º Trimestre' | 'Anual' | string
  color: string
  icon: string
  isDefault?: boolean
  createdAt: string
}

export interface PeiPdiDocumentCard {
  id: string
  studentId: string
  studentName: string
  documentType: 'pdi' | 'pei'
  title: string
  classGroup: string
  schoolName: string
  term: '1º Trimestre' | '2º Trimestre' | '3º Trimestre' | '1º Semestre' | '2º Semestre' | 'Anual' | string
  folderId: string
  folderName: string
  diagnosis?: string
  totalSkills: number
  masteredSkills: number
  developingSkills: number
  updatedAt: string
  rawDoc: PdiRecord | PeiRecord
}

const FOLDERS_STORAGE_KEY = 'teacher_pei_pdi_folders_v1'
const FOLDER_DOC_MAP_KEY = 'teacher_pei_pdi_doc_map_v1'

export const DEFAULT_PEI_PDI_FOLDERS: PeiPdiFolder[] = [
  {
    id: 'folder_6ano',
    name: '6º Ano — Inclusão (PDI/PEI)',
    description: 'Pasta de acompanhamento pedagógico e planos de flexibilização do 6º Ano',
    type: 'class',
    classGroup: '6º Ano',
    academicYear: '2026',
    color: '#3b82f6',
    icon: 'ti ti-folder',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'folder_7ano',
    name: '7º Ano — Inclusão (PDI/PEI)',
    description: 'Pasta de planos pedagógicos e adaptações do 7º Ano',
    type: 'class',
    classGroup: '7º Ano',
    academicYear: '2026',
    color: '#8b5cf6',
    icon: 'ti ti-folder',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'folder_8ano',
    name: '8º Ano — Inclusão (PDI/PEI)',
    description: 'Pasta de planos pedagógicos e adaptações do 8º Ano',
    type: 'class',
    classGroup: '8º Ano',
    academicYear: '2026',
    color: '#ec4899',
    icon: 'ti ti-folder',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'folder_9ano',
    name: '9º Ano — Inclusão (PDI/PEI)',
    description: 'Pasta de planos pedagógicos e adaptações do 9º Ano',
    type: 'class',
    classGroup: '9º Ano',
    academicYear: '2026',
    color: '#f59e0b',
    icon: 'ti ti-folder',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'folder_1tri',
    name: '1º Trimestre / 2026',
    description: 'Planos e habilidades focados no 1º Trimestre letivo',
    type: 'term',
    term: '1º Trimestre',
    academicYear: '2026',
    color: '#10b981',
    icon: 'ti ti-calendar-event',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'folder_2tri',
    name: '2º Trimestre / 2026',
    description: 'Planos e habilidades focados no 2º Trimestre letivo',
    type: 'term',
    term: '2º Trimestre',
    academicYear: '2026',
    color: '#06b6d4',
    icon: 'ti ti-calendar-event',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'folder_3tri',
    name: '3º Trimestre / 2026',
    description: 'Planos e habilidades focados no 3º Trimestre letivo',
    type: 'term',
    term: '3º Trimestre',
    academicYear: '2026',
    color: '#6366f1',
    icon: 'ti ti-calendar-event',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z'
  }
]

let _memoryFolders: PeiPdiFolder[] | null = null
let _memoryDocMap: Record<string, string> | null = null

export function getPeiPdiFolders(): PeiPdiFolder[] {
  if (typeof window === 'undefined') {
    return _memoryFolders || DEFAULT_PEI_PDI_FOLDERS
  }
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(DEFAULT_PEI_PDI_FOLDERS))
      return DEFAULT_PEI_PDI_FOLDERS
    }
    const parsed: PeiPdiFolder[] = JSON.parse(raw)
    // Garante que as pastas padrão existam
    const existingIds = new Set(parsed.map(f => f.id))
    const missingDefaults = DEFAULT_PEI_PDI_FOLDERS.filter(f => !existingIds.has(f.id))
    if (missingDefaults.length > 0) {
      const merged = [...parsed, ...missingDefaults]
      localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(merged))
      return merged
    }
    return parsed
  } catch {
    return DEFAULT_PEI_PDI_FOLDERS
  }
}

export function savePeiPdiFolders(folders: PeiPdiFolder[]): void {
  if (typeof window === 'undefined') {
    _memoryFolders = folders
    return
  }
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders))
    window.dispatchEvent(new Event('teacher:pei_pdi_folders_changed'))
    syncToSupabase({ [FOLDERS_STORAGE_KEY]: folders }).catch(console.error)
  } catch (err) {
    console.error('[peiPdiFolderStore] Erro ao salvar pastas:', err)
  }
}

export function createPeiPdiFolder(folder: Omit<PeiPdiFolder, 'id' | 'createdAt'>): PeiPdiFolder {
  const current = getPeiPdiFolders()
  const newFolder: PeiPdiFolder = {
    ...folder,
    id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString()
  }
  const updated = [...current, newFolder]
  savePeiPdiFolders(updated)
  return newFolder
}

export function deletePeiPdiFolder(folderId: string): boolean {
  const current = getPeiPdiFolders()
  const target = current.find(f => f.id === folderId)
  if (target?.isDefault) return false
  const updated = current.filter(f => f.id !== folderId)
  savePeiPdiFolders(updated)
  return true
}

export function getDocumentFolderMapping(): Record<string, string> {
  if (typeof window === 'undefined') {
    return _memoryDocMap || {}
  }
  try {
    const raw = localStorage.getItem(FOLDER_DOC_MAP_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function assignDocumentToFolder(studentId: string, folderId: string): void {
  if (typeof window === 'undefined') {
    if (!_memoryDocMap) _memoryDocMap = {}
    _memoryDocMap[studentId] = folderId
    return
  }
  try {
    const map = getDocumentFolderMapping()
    map[studentId] = folderId
    localStorage.setItem(FOLDER_DOC_MAP_KEY, JSON.stringify(map))
    window.dispatchEvent(new Event('teacher:pei_pdi_folders_changed'))
    syncToSupabase({ [FOLDER_DOC_MAP_KEY]: map }).catch(console.error)
  } catch (err) {
    console.error('[peiPdiFolderStore] Erro ao atribuir pasta ao documento:', err)
  }
}

/**
 * Infere a pasta mais adequada para um documento caso não tenha atribuição explícita.
 */
export function inferFolderForDocument(
  classGroup: string = '',
  term: string = '',
  folders: PeiPdiFolder[]
): string {
  const normClass = classGroup.toLowerCase()
  const normTerm = term.toLowerCase()

  // 1. Tenta casar com o trimestre
  if (normTerm.includes('1º') || normTerm.includes('1o')) {
    const termFolder = folders.find(f => f.id === 'folder_1tri')
    if (termFolder) return termFolder.id
  }
  if (normTerm.includes('2º') || normTerm.includes('2o')) {
    const termFolder = folders.find(f => f.id === 'folder_2tri')
    if (termFolder) return termFolder.id
  }
  if (normTerm.includes('3º') || normTerm.includes('3o')) {
    const termFolder = folders.find(f => f.id === 'folder_3tri')
    if (termFolder) return termFolder.id
  }

  // 2. Tenta casar com a turma / série
  if (normClass.includes('6')) {
    const classFolder = folders.find(f => f.id === 'folder_6ano')
    if (classFolder) return classFolder.id
  }
  if (normClass.includes('7')) {
    const classFolder = folders.find(f => f.id === 'folder_7ano')
    if (classFolder) return classFolder.id
  }
  if (normClass.includes('8')) {
    const classFolder = folders.find(f => f.id === 'folder_8ano')
    if (classFolder) return classFolder.id
  }
  if (normClass.includes('9')) {
    const classFolder = folders.find(f => f.id === 'folder_9ano')
    if (classFolder) return classFolder.id
  }

  return folders[0]?.id || 'folder_6ano'
}

/**
 * Consolida todos os documentos PEI e PDI existentes em cards de apresentação unificados.
 */
export function getAllPeiPdiCards(): PeiPdiDocumentCard[] {
  const pdiRecords = getAllPdiRecords()
  const peiRecords = getAllPeiRecords()
  const folders = getPeiPdiFolders()
  const docMap = getDocumentFolderMapping()
  const cards: PeiPdiDocumentCard[] = []

  // Mapeia PDIs
  Object.values(pdiRecords).forEach(pdi => {
    const classGroup = pdi.identification?.gradeCycle || pdi.studentInfo?.gradeCycle || '6º ano'
    const term = pdi.academicTerm || (pdi.identification?.validityPeriod?.includes('2º') ? '2º Trimestre' : '1º Trimestre')
    const folderId = docMap[`pdi_${pdi.studentId}`] || pdi.folderId || inferFolderForDocument(classGroup, term, folders)
    const folder = folders.find(f => f.id === folderId)

    const matrix = pdi.skillsMatrix || []
    const mastered = matrix.filter(s => s.status === 'Sim' || s.status === 'concluida').length
    const developing = matrix.filter(s => s.status === 'Em desenvolvimento' || s.status === 'em_andamento').length

    cards.push({
      id: `pdi_${pdi.id || pdi.studentId}`,
      studentId: pdi.studentId,
      studentName: pdi.studentName,
      documentType: 'pdi',
      title: `PDI — ${pdi.studentName}`,
      classGroup,
      schoolName: pdi.schoolName || pdi.identification?.schoolName || 'Colégio Machado Sobrinho',
      term,
      folderId,
      folderName: folder?.name || 'Geral',
      diagnosis: pdi.clinicalReport?.cid10 ? `CID-10: ${pdi.clinicalReport.cid10}` : undefined,
      totalSkills: matrix.length,
      masteredSkills: mastered,
      developingSkills: developing,
      updatedAt: pdi.identification?.creationDate || '2026-08-01',
      rawDoc: pdi
    })
  })

  // Mapeia PEIs
  Object.values(peiRecords).forEach(pei => {
    const classGroup = 'Ensino Regular'
    const term = pei.academicTerm || '1º Trimestre'
    const folderId = docMap[`pei_${pei.studentId}`] || pei.folderId || inferFolderForDocument(classGroup, term, folders)
    const folder = folders.find(f => f.id === folderId)

    const goals = pei.goals || []
    const achieved = goals.filter(g => g.status === 'achieved').length
    const active = goals.filter(g => g.status === 'active' || g.status === 'in_progress').length

    cards.push({
      id: `pei_${pei.id || pei.studentId}`,
      studentId: pei.studentId,
      studentName: pei.studentName,
      documentType: 'pei',
      title: `PEI — ${pei.studentName}`,
      classGroup,
      schoolName: 'Colégio Machado Sobrinho',
      term,
      folderId,
      folderName: folder?.name || 'Geral',
      diagnosis: pei.diagnosis,
      totalSkills: goals.length,
      masteredSkills: achieved,
      developingSkills: active,
      updatedAt: pei.lastReviewedAt || '2026-08-01',
      rawDoc: pei
    })
  })

  return cards
}
