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
  ALL_SUBJECTS_CATALOG,
  normalizeGradeYear,
  getCurriculumCoverageReport,
  getClassPostponedSkills,
  saveClassPostponedSkills,
  inferBnccSkillsForTopic
}

// ─── Cache em Memória e Pub/Sub ──────────────────────────────────────────────

let memoryCache: BnccSkill[] | null = null
// Visão derivada (Língua Inglesa) — mantém a mesma referência até o cache base mudar
let englishCache: BnccSkill[] | null = null
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
  englishCache = null
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

/** Normaliza o identificador/rótulo de disciplina para a chave canônica do catálogo */
export function normalizeBnccSubjectKey(subject?: string): string {
  if (!subject) return 'english'
  const s = subject.toLowerCase().trim()
  if (s === 'all' || s.includes('todas')) return 'all'
  if (s.includes('ingl') || s === 'ef_li' || s === 'english' || s === 'li' || s.includes('inglesa')) return 'english'
  if (s.includes('portug') || s === 'ef_lp' || s === 'portuguese' || s === 'lp') return 'portuguese'
  if (s.includes('mat') || s === 'ef_ma' || s === 'math' || s === 'ma') return 'math'
  if (s.includes('ciên') || s.includes('cien') || s === 'ef_ci' || s === 'science' || s === 'ci') return 'science'
  if (s.includes('hist') || s === 'ef_hi' || s === 'history' || s === 'hi') return 'history'
  if (s.includes('geog') || s === 'ef_ge' || s === 'geography' || s === 'ge') return 'geography'
  if (s.includes('art') || s === 'ef_ar' || s === 'art' || s === 'ar') return 'art'
  if (s.includes('físic') || s.includes('fisic') || s === 'ef_ef' || s === 'pe' || s === 'ef') return 'pe'
  if (s.includes('relig') || s === 'ef_er' || s === 'religion' || s === 'er') return 'religion'
  return s
}

/** Verifica determinísticamente se uma habilidade BNCC pertence ao ano escolar/série solicitado */
export function matchesBnccGrade(skill: BnccSkill, gradeQuery: string): boolean {
  if (!gradeQuery || gradeQuery === 'all') return true
  const q = gradeQuery.toLowerCase().trim()
  const sGrade = (skill.gradeYear || '').toLowerCase()
  const code = (skill.code || '').toUpperCase()

  // 1. Ensino Médio
  const isMedioQuery = q.includes('médio') || q.includes('medio') || q === 'em' || q.includes('ensino medio')
  if (isMedioQuery) {
    if (q.includes('1')) {
      return sGrade.includes('1º médio') || sGrade.includes('1o médio') || code.startsWith('EM13LGG1')
    }
    if (q.includes('2')) {
      return sGrade.includes('2º médio') || sGrade.includes('2o médio') || code.startsWith('EM13LGG3') || code.startsWith('EM13LGG4')
    }
    if (q.includes('3')) {
      return sGrade.includes('3º médio') || sGrade.includes('3o médio') || code.startsWith('EM13LGG6') || code.startsWith('EM13LGG7')
    }
    // Qualquer ano do EM
    return sGrade.includes('médio') || sGrade.includes('medio') || code.startsWith('EM')
  }

  // 2. 6º Ano (Fundamental II)
  if (q.includes('6')) {
    return sGrade.includes('6') || code.startsWith('EF06') || code.startsWith('EF67') || code.startsWith('EF69')
  }

  // 3. 7º Ano (Fundamental II)
  if (q.includes('7')) {
    return sGrade.includes('7') || code.startsWith('EF07') || code.startsWith('EF67') || code.startsWith('EF69')
  }

  // 4. 8º Ano (Fundamental II)
  if (q.includes('8')) {
    return sGrade.includes('8') || code.startsWith('EF08') || code.startsWith('EF89') || code.startsWith('EF69')
  }

  // 5. 9º Ano (Fundamental II)
  if (q.includes('9')) {
    return sGrade.includes('9') || code.startsWith('EF09') || code.startsWith('EF89') || code.startsWith('EF69')
  }

  // 6. Anos Iniciais (1º ao 5º Ano)
  if (q.includes('iniciais') || q.includes('1º ao 5º') || q.includes('1 ao 5') || q === '1') {
    return (
      sGrade.includes('1º ao 5º') ||
      sGrade.includes('1º fund') ||
      sGrade.includes('2º fund') ||
      sGrade.includes('3º fund') ||
      sGrade.includes('4º fund') ||
      sGrade.includes('5º fund') ||
      code.startsWith('EF15') ||
      code.startsWith('EF12') ||
      code.startsWith('EF35') ||
      code.startsWith('EF01') ||
      code.startsWith('EF02') ||
      code.startsWith('EF03') ||
      code.startsWith('EF04') ||
      code.startsWith('EF05')
    )
  }

  // Fallback padrão
  const cleanGrade = q.replace(/ano|série/g, '').trim()
  return sGrade.includes(cleanGrade) || q.includes(sGrade)
}

/**
 * Retorna o catálogo completo de habilidades com cache em memória.
 *
 * subject:
 *   undefined | 'EF_LI' | 'english' | 'Língua Inglesa' → Inglês (todas as 106 habilidades garantidas)
 *   'EF_LP' | 'portuguese' | 'Língua Portuguesa'        → Língua Portuguesa (308 habilidades)
 *   'EF_MA' | 'math' | 'Matemática'                     → Matemática (246 habilidades)
 *   'EF_CI' | 'science' | 'Ciências'                    → Ciências (111 habilidades)
 *   'EF_HI' | 'history' | 'História'                    → História (151 habilidades)
 *   'EF_GE' | 'geography' | 'Geografia'                 → Geografia (123 habilidades)
 *   'EF_AR' | 'art' | 'Arte'                            → Arte (61 habilidades)
 *   'EF_EF' | 'pe' | 'Educação Física'                  → Educação Física (68 habilidades)
 *   'EF_ER' | 'religion' | 'Ensino Religioso'           → Ensino Religioso (63 habilidades)
 *   'all'                                               → Todas as disciplinas (1237+ habilidades)
 */
export function getBnccCatalog(subject?: string): BnccSkill[] {
  const normKey = normalizeBnccSubjectKey(subject)

  // Filtros por disciplina específica oficial
  const subjectMap: Record<string, BnccSkill[]> = {
    'portuguese': LP_BNCC_SKILLS,
    'math': MA_BNCC_SKILLS,
    'science': CI_BNCC_SKILLS,
    'history': HI_BNCC_SKILLS,
    'geography': GE_BNCC_SKILLS,
    'art': AR_BNCC_SKILLS,
    'pe': PE_BNCC_SKILLS,
    'religion': ER_BNCC_SKILLS,
  }

  if (subjectMap[normKey]) {
    return subjectMap[normKey]
  }

  // Base: inglês (com customizações do professor armazenadas em localStorage)
  if (!memoryCache) {
    memoryCache = getStoredBnccSkills()
  }

  if (normKey === 'all') {
    // Catálogo universal completo — merge das customizações do professor com o catálogo oficial
    const customCodes = new Set(memoryCache.map(s => s.code))
    const officialOnly = ALL_SUBJECTS_CATALOG.filter(s => !customCodes.has(s.code))
    return [...memoryCache, ...officialOnly]
  }

  // Padrão: Língua Inglesa (Garante que todas as 106 habilidades do DEFAULT_BNCC_SKILLS
  // estejam presentes mesmo se o cache em memória ou localStorage tiver dados parciais)
  if (!englishCache) {
    const englishOnly = memoryCache.filter(
      s => !s.subject || s.subject === 'EF_LI' || s.subject === 'EM_LGG' || s.code.includes('LI') || s.code.startsWith('EM')
    )
    const existingCodes = new Set(englishOnly.map(s => s.code))
    const missingDefault = DEFAULT_BNCC_SKILLS.filter(s => !existingCodes.has(s.code))
    englishCache = missingDefault.length > 0 ? [...englishOnly, ...missingDefault] : englishOnly
  }
  return englishCache
}

/**
 * Filtra competências por ano escolar / série e opcionalmente por disciplina.
 */
export function getBnccForGrade(gradeYear?: string, subject?: string): BnccSkill[] {
  const catalog = getBnccCatalog(subject)
  if (!gradeYear || gradeYear === 'all') return catalog
  return catalog.filter(s => matchesBnccGrade(s, gradeYear))
}

/**
 * Salva a lista personalizada de competências na matriz central,
 * atualiza o cache em memória e notifica todos os componentes reativos.
 */
export function saveBnccCatalog(skills: BnccSkill[]): void {
  saveStoredBnccSkills(skills)
  memoryCache = [...skills]
  englishCache = null
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
    return allSkills.filter(s => matchesBnccGrade(s, options.gradeYear!))
  }, [allSkills, options?.gradeYear])

  return {
    allSkills,
    gradeSkills,
    saveCatalog: saveBnccCatalog,
    refreshCatalog: invalidateBnccCache
  }
}
