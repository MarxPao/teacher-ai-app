/**
 * lib/bnccStore.ts — Fonte Única Reativa do Catálogo Curricular BNCC
 *
 * Centraliza o acesso, cache em memória, filtragem por série/disciplina
 * e reatividade (storage listener + pub/sub) para todos os consumidores.
 */

import { useSyncExternalStore, useMemo } from 'react'
import {
  BnccSkill,
  DEFAULT_BNCC_SKILLS,
  getStoredBnccSkills,
  saveStoredBnccSkills,
  getCurriculumCoverageReport,
  CurriculumCoverageReport,
  getClassPostponedSkills,
  saveClassPostponedSkills
} from './bnccData'
import { normalizeGradeYear, inferBnccSkillsForTopic } from './bnccInference'
import {
  LP_BNCC_SKILLS,
  MA_BNCC_SKILLS,
  CI_BNCC_SKILLS,
  HI_BNCC_SKILLS,
  GE_BNCC_SKILLS,
  AR_BNCC_SKILLS,
  PE_BNCC_SKILLS,
  ER_BNCC_SKILLS
} from './bncc/index'

// Catálogo universal: todas as disciplinas do Ensino Fundamental
// Fonte: PDF oficial do MEC — BNCC_EI_EF_110518_versaofinal_site
const ALL_SUBJECTS_CATALOG: BnccSkill[] = [
  ...DEFAULT_BNCC_SKILLS,       // Inglês (88 EF + 18 EM = 106)
  ...LP_BNCC_SKILLS,            // Língua Portuguesa (308)
  ...MA_BNCC_SKILLS,            // Matemática (246)
  ...CI_BNCC_SKILLS,            // Ciências (111)
  ...HI_BNCC_SKILLS,            // História (151)
  ...GE_BNCC_SKILLS,            // Geografia (123)
  ...AR_BNCC_SKILLS,            // Arte (61)
  ...PE_BNCC_SKILLS,            // Educação Física (68)
  ...ER_BNCC_SKILLS,            // Ensino Religioso (63)
]

// Índice de lookup por código (para buscas O(1))
const CATALOG_INDEX = new Map<string, BnccSkill>(
  ALL_SUBJECTS_CATALOG.map(s => [s.code, s])
)

// Re-exporta tipos e funções essenciais para ponto único de import
export type { BnccSkill, CurriculumCoverageReport }
export {
  normalizeGradeYear,
  getCurriculumCoverageReport,
  getClassPostponedSkills,
  saveClassPostponedSkills,
  inferBnccSkillsForTopic
}

// ─── Cache em Memória e Pub/Sub ──────────────────────────────────────────────

let memoryCache: BnccSkill[] | null = null
let cacheVersion = 0
const subscribers = new Set<() => void>()

function notifySubscribers(): void {
  cacheVersion++
  subscribers.forEach(callback => {
    try {
      callback()
    } catch (err) {
      console.error('[bnccStore] Erro ao notificar assinante:', err)
    }
  })
}

// Escuta alterações de outras abas ou janelas
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'teacher_bncc_skills' || !event.key) {
      invalidateBnccCache()
    }
  })
}

/**
 * Invalida o cache em memória e notifica componentes reativos
 */
export function invalidateBnccCache(): void {
  memoryCache = null
  notifySubscribers()
}

/**
 * Assina mudanças no catálogo da BNCC (para useSyncExternalStore ou custom listeners)
 */
export function subscribeBncc(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

/**
 * Retorna a versão atual do cache (snapshot para useSyncExternalStore)
 */
export function getBnccStoreVersion(): number {
  return cacheVersion
}

// ─── Métodos Imperativos Centrais ────────────────────────────────────────────

/**
 * Retorna o catálogo completo de habilidades com cache em memória.
 *
 * subject:
 *   undefined | 'EF_LI' | 'english' → Inglês (DEFAULT_BNCC_SKILLS + customizações localStorage)
 *   'EF_LP' | 'portuguese'          → Língua Portuguesa
 *   'EF_MA' | 'math'                → Matemática
 *   'EF_CI' | 'science'             → Ciências
 *   'EF_HI' | 'history'             → História
 *   'EF_GE' | 'geography'           → Geografia
 *   'EF_AR' | 'art'                 → Arte
 *   'EF_EF' | 'pe'                  → Educação Física
 *   'EF_ER' | 'religion'            → Ensino Religioso
 *   'all'                           → Todas as disciplinas (1237+ habilidades)
 */
export function getBnccCatalog(subject?: string): BnccSkill[] {
  // Base: inglês (com customizações do professor armazenadas em localStorage)
  if (!memoryCache) {
    memoryCache = getStoredBnccSkills()
  }

  // Filtros por disciplina específica
  const subjectMap: Record<string, BnccSkill[]> = {
    'EF_LP': LP_BNCC_SKILLS, 'portuguese': LP_BNCC_SKILLS,
    'EF_MA': MA_BNCC_SKILLS, 'math': MA_BNCC_SKILLS,
    'EF_CI': CI_BNCC_SKILLS, 'science': CI_BNCC_SKILLS,
    'EF_HI': HI_BNCC_SKILLS, 'history': HI_BNCC_SKILLS,
    'EF_GE': GE_BNCC_SKILLS, 'geography': GE_BNCC_SKILLS,
    'EF_AR': AR_BNCC_SKILLS, 'art': AR_BNCC_SKILLS,
    'EF_EF': PE_BNCC_SKILLS, 'pe': PE_BNCC_SKILLS,
    'EF_ER': ER_BNCC_SKILLS, 'religion': ER_BNCC_SKILLS,
  }

  if (subject && subject !== 'all' && subject !== 'EF_LI' && subject !== 'english') {
    return subjectMap[subject] ?? []
  }

  if (subject === 'all') {
    // Catálogo universal completo — merge das customizações do professor com o catálogo oficial
    const customCodes = new Set(memoryCache.map(s => s.code))
    const officialOnly = ALL_SUBJECTS_CATALOG.filter(s => !customCodes.has(s.code))
    return [...memoryCache, ...officialOnly]
  }

  // Padrão: Inglês (com customizações do localStorage)
  return memoryCache
}

/**
 * Filtra competências por ano escolar / série e opcionalmente por disciplina.
 */
export function getBnccForGrade(gradeYear?: string, subject?: string): BnccSkill[] {
  const catalog = getBnccCatalog(subject)
  if (!gradeYear || gradeYear === 'all') return catalog

  const cleanGrade = gradeYear.toLowerCase().replace(/ano|série/g, '').trim()
  return catalog.filter(s => {
    const sGrade = s.gradeYear.toLowerCase()
    return sGrade.includes(cleanGrade) || gradeYear.toLowerCase().includes(sGrade)
  })
}

/**
 * Salva a lista personalizada de competências na matriz central,
 * atualiza o cache em memória e notifica todos os componentes reativos.
 */
export function saveBnccCatalog(skills: BnccSkill[]): void {
  saveStoredBnccSkills(skills)
  memoryCache = [...skills]
  notifySubscribers()
}

// ─── Hook React Reativo ──────────────────────────────────────────────────────

export interface UseBnccSkillsOptions {
  gradeYear?: string
  subject?: string
}

export interface UseBnccSkillsResult {
  allSkills: BnccSkill[]
  gradeSkills: BnccSkill[]
  saveCatalog: (skills: BnccSkill[]) => void
  refreshCatalog: () => void
}

/**
 * Hook React que consome a matriz BNCC de forma reativa.
 * Quando saveBnccCatalog() é chamado em qualquer lugar, este hook dispara re-render.
 */
export function useBnccSkills(options?: UseBnccSkillsOptions): UseBnccSkillsResult {
  const version = useSyncExternalStore(
    subscribeBncc,
    getBnccStoreVersion,
    getBnccStoreVersion
  )

  // Recalcula com base na versão
  const allSkills = useMemo(() => {
    // Referencia version para que useMemo reavalie na invalidação
    void version
    return getBnccCatalog(options?.subject)
  }, [version, options?.subject])

  const gradeSkills = useMemo(() => {
    if (!options?.gradeYear || options?.gradeYear === 'all') return allSkills
    const cleanGrade = options.gradeYear.toLowerCase().replace(/ano|série/g, '').trim()
    return allSkills.filter(s => {
      const sGrade = s.gradeYear.toLowerCase()
      return sGrade.includes(cleanGrade) || options.gradeYear!.toLowerCase().includes(sGrade)
    })
  }, [allSkills, options?.gradeYear])

  return {
    allSkills,
    gradeSkills,
    saveCatalog: saveBnccCatalog,
    refreshCatalog: invalidateBnccCache
  }
}
