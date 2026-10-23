/**
 * subjects/index.ts — Ponto central de exportação e auto-registro de todas as matérias
 *
 * Registra os perfis:
 *   - English (Língua Inglesa - ELT)
 *   - Portuguese (Língua Portuguesa - LP)
 *   - Math (Matemática)
 *   - History (História)
 *   - Geography (Geografia)
 *   - Physics (Física)
 *   - Chemistry (Química)
 *   - Biology (Biologia)
 *   - Science (Ciências EF II)
 */

import englishProfile from './english'
import portugueseProfile from './portuguese'
import mathProfile from './math'
import historyProfile from './history'
import geographyProfile from './geography'
import physicsProfile from './physics'
import chemistryProfile from './chemistry'
import biologyProfile from './biology'
import scienceProfile from './science'

export {
  englishProfile,
  portugueseProfile,
  mathProfile,
  historyProfile,
  geographyProfile,
  physicsProfile,
  chemistryProfile,
  biologyProfile,
  scienceProfile
}

export const ALL_CANONICAL_SUBJECT_IDS = [
  'english',
  'portuguese',
  'math',
  'history',
  'geography',
  'physics',
  'chemistry',
  'biology',
  'science'
] as const
