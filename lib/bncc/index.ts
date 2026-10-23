/**
 * lib/bncc/index.ts — Índice de Todas as Matrizes Curriculares BNCC por Disciplina
 * Fonte: PDF oficial do MEC — BNCC_EI_EF_110518_versaofinal_site e BNCC Ensino Médio
 */

export { LP_BNCC_SKILLS } from './portuguese_bncc'
export { MA_BNCC_SKILLS } from './math_bncc'
export { CI_BNCC_SKILLS } from './science_bncc'
export { HI_BNCC_SKILLS } from './history_bncc'
export { GE_BNCC_SKILLS } from './geography_bncc'
export { AR_BNCC_SKILLS } from './art_bncc'
export { PE_BNCC_SKILLS } from './pe_bncc'
export { ER_BNCC_SKILLS } from './religion_bncc'
export {
  EM_LP_BNCC_SKILLS,
  EM_MA_BNCC_SKILLS,
  EM_CNT_BNCC_SKILLS,
  EM_CHS_BNCC_SKILLS,
  classifyScienceSkill
} from './em_bncc'

// Re-exporta catálogo de Língua Inglesa (já existe em lib/bnccData.ts)
export { DEFAULT_BNCC_SKILLS as LI_BNCC_SKILLS } from '../bnccData'
