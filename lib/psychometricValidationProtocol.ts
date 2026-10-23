/**
 * psychometricValidationProtocol.ts — Protocolo de Validação Psicométrica (TCT) & Holdout Seal
 * 
 * Implementa Teoria Clássica dos Testes (TCT):
 * 1. Índice de Dificuldade do Item (p = acertos / N)
 * 2. Correlação Ponto-Bisserial de Discriminação (r_pb = ((X1 - X) / sigma) * sqrt(p / (1-p)))
 * 3. Eficiência e Funcionalidade de Distratores (taxa de atração por estratos inferior/superior)
 * 4. Fidedignidade do Teste via Alfa de Cronbach (alpha = (K / (K-1)) * (1 - sum(var_i) / var_total))
 * 5. Gerador e Verificador de Selo Criptográfico de Holdout (SHA-256)
 */

import { createHash } from 'crypto'
import { SubjectBankItem, CANONICAL_MULTI_SUBJECT_ITEMS } from './itemBankModel'

// ─── 1. TEORIA CLÁSSICA DOS TESTES (TCT / CTT) ────────────────────────────────

export interface ItemPsychometricReport {
  itemId: string
  difficultyP: number // p in [0, 1]
  difficultyClassification: 'muito_dificil' | 'dificil' | 'medio' | 'facil' | 'muito_facil'
  pointBiserialRpb: number // r_pb in [-1, 1]
  discriminationQuality: 'excelente' | 'boa' | 'regular' | 'deficiente'
  distractorEfficiencies: Record<string, {
    attractionRate: number
    functionalForLowerGroup: boolean
    quality: 'funcional' | 'ineficaz' | 'pegadinha_ambigua'
  }>
  isPsychometricallyApproved: boolean
}

/**
 * Calcula a dificuldade p do item (proporção de acertos)
 */
export function calculateItemDifficulty(correctCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0
  return Number((correctCount / totalCount).toFixed(4))
}

/**
 * Classifica a dificuldade p segundo os parâmetros do INEP / MEC
 */
export function classifyDifficulty(p: number): ItemPsychometricReport['difficultyClassification'] {
  if (p < 0.20) return 'muito_dificil'
  if (p < 0.40) return 'dificil'
  if (p <= 0.70) return 'medio'
  if (p <= 0.85) return 'facil'
  return 'muito_facil'
}

/**
 * Calcula a correlação ponto-bisserial de discriminação:
 * r_pb = ((X_1 - X_total) / s_total) * sqrt(p / (1 - p))
 */
export function calculatePointBiserialDiscrimination(
  studentTotalScores: number[],
  itemCorrectness: boolean[]
): number {
  const n = studentTotalScores.length
  if (n < 2 || itemCorrectness.length !== n) return 0

  const correctScores: number[] = []
  let sumTotal = 0

  for (let i = 0; i < n; i++) {
    sumTotal += studentTotalScores[i]
    if (itemCorrectness[i]) {
      correctScores.push(studentTotalScores[i])
    }
  }

  const p = correctScores.length / n
  if (p === 0 || p === 1) return 0 // Item sem variância não discrimina

  const meanTotal = sumTotal / n
  const meanCorrect = correctScores.reduce((acc, v) => acc + v, 0) / correctScores.length

  // Desvio padrão amostral total
  const varianceTotal = studentTotalScores.reduce((acc, v) => acc + Math.pow(v - meanTotal, 2), 0) / (n - 1)
  const sdTotal = Math.sqrt(varianceTotal)

  if (sdTotal === 0) return 0

  const rpb = ((meanCorrect - meanTotal) / sdTotal) * Math.sqrt(p / (1 - p))
  return Number(Math.max(-1, Math.min(1, rpb)).toFixed(4))
}

/**
 * Classifica a qualidade do índice de discriminação
 */
export function classifyDiscrimination(rpb: number): ItemPsychometricReport['discriminationQuality'] {
  if (rpb >= 0.40) return 'excelente'
  if (rpb >= 0.30) return 'boa'
  if (rpb >= 0.20) return 'regular'
  return 'deficiente'
}

/**
 * Calcula a fidedignidade / consistência interna de um teste via Alfa de Cronbach
 * alpha = (K / (K - 1)) * (1 - sum(s_i^2) / s_total^2)
 */
export function calculateCronbachAlpha(responseMatrix: number[][]): number {
  const nStudents = responseMatrix.length
  if (nStudents < 2) return 0
  const kItems = responseMatrix[0].length
  if (kItems < 2) return 0

  // Variância de cada item
  let sumItemVariances = 0
  for (let j = 0; j < kItems; j++) {
    const colValues = responseMatrix.map(row => row[j])
    const meanCol = colValues.reduce((a, b) => a + b, 0) / nStudents
    const varCol = colValues.reduce((a, b) => a + Math.pow(b - meanCol, 2), 0) / (nStudents - 1)
    sumItemVariances += varCol
  }

  // Escore total de cada aluno e variância total
  const studentTotals = responseMatrix.map(row => row.reduce((a, b) => a + b, 0))
  const meanTotal = studentTotals.reduce((a, b) => a + b, 0) / nStudents
  const varTotal = studentTotals.reduce((a, b) => a + Math.pow(b - meanTotal, 2), 0) / (nStudents - 1)

  if (varTotal === 0) return 0

  const alpha = (kItems / (kItems - 1)) * (1 - (sumItemVariances / varTotal))
  return Number(Math.max(0, Math.min(1, alpha)).toFixed(4))
}

/**
 * Avalia psicometricamente um item com base em amostra de respostas
 */
export function evaluateItemPsychometrics(
  item: SubjectBankItem,
  studentTotalScores: number[],
  studentSelectedOptions: string[]
): ItemPsychometricReport {
  const n = studentTotalScores.length
  const correctness = studentSelectedOptions.map(opt => opt === item.correctOption)
  const correctCount = correctness.filter(Boolean).length
  const p = calculateItemDifficulty(correctCount, n)
  const rpb = calculatePointBiserialDiscrimination(studentTotalScores, correctness)

  // Divide em tercil inferior (33%) e superior (33%)
  const indexed = studentTotalScores.map((score, i) => ({ score, opt: studentSelectedOptions[i] }))
  indexed.sort((a, b) => a.score - b.score)
  const tertileSize = Math.floor(n / 3)
  const lowerGroup = indexed.slice(0, tertileSize)
  const upperGroup = indexed.slice(n - tertileSize)

  const distractorEfficiencies: ItemPsychometricReport['distractorEfficiencies'] = {}

  item.options.forEach(opt => {
    if (!opt.isCorrect) {
      const totalPicks = studentSelectedOptions.filter(o => o === opt.letter).length
      const lowerPicks = lowerGroup.filter(s => s.opt === opt.letter).length
      const upperPicks = upperGroup.filter(s => s.opt === opt.letter).length

      const attractionRate = Number((totalPicks / n).toFixed(4))
      const lowerRate = tertileSize > 0 ? lowerPicks / tertileSize : 0
      const upperRate = tertileSize > 0 ? upperPicks / tertileSize : 0

      // Um distrator é funcional se atrai pelo menos 5% dos alunos com desempenho inferior
      // e menos alunos do estrato superior do que do inferior
      const functionalForLower = lowerRate >= 0.05 && lowerRate >= upperRate

      let quality: 'funcional' | 'ineficaz' | 'pegadinha_ambigua' = 'ineficaz'
      if (upperRate > lowerRate && upperRate >= 0.15) {
        quality = 'pegadinha_ambigua' // Atrai mais os melhores alunos do que os piores
      } else if (functionalForLower && attractionRate >= 0.05) {
        quality = 'funcional'
      }

      distractorEfficiencies[opt.letter] = {
        attractionRate,
        functionalForLowerGroup: functionalForLower,
        quality
      }
    }
  })

  // Critério de aprovação psicométrica: p entre 0.20 e 0.85 e r_pb >= 0.20
  const isPsychometricallyApproved = p >= 0.20 && p <= 0.85 && rpb >= 0.20

  return {
    itemId: item.id,
    difficultyP: p,
    difficultyClassification: classifyDifficulty(p),
    pointBiserialRpb: rpb,
    discriminationQuality: classifyDiscrimination(rpb),
    distractorEfficiencies,
    isPsychometricallyApproved
  }
}

// ─── 2. HOLDOUT DATASET & SEAL LOCK FILE ───────────────────────────────────────

export interface HoldoutDataset {
  version: string
  timestamp: string
  subjectCount: number
  totalItems: number
  items: Array<{
    id: string
    subject: string
    bnccSkillCode: string
    misconceptionCodes: string[]
    hash: string
  }>
}

export interface HoldoutSeal {
  algorithm: 'SHA-256'
  datasetHash: string
  itemHashes: Record<string, string>
  generatedAt: string
}

/**
 * Gera o dataset canônico de holdout a partir dos itens multi-matérias
 */
export function generateMultiSubjectHoldoutDataset(): HoldoutDataset {
  const items = CANONICAL_MULTI_SUBJECT_ITEMS.map(item => {
    const rawContent = `${item.id}|${item.subject}|${item.bnccSkillCode}|${item.stem}|${item.correctOption}|${JSON.stringify(item.options)}`
    const itemHash = createHash('sha256').update(rawContent, 'utf8').digest('hex')
    const misCodes = item.options.map(o => o.misconceptionCode).filter(Boolean) as string[]

    return {
      id: item.id,
      subject: item.subject,
      bnccSkillCode: item.bnccSkillCode,
      misconceptionCodes: misCodes,
      hash: itemHash
    }
  })

  const distinctSubjects = Array.from(new Set(items.map(i => i.subject))).length

  return {
    version: '2.0.0',
    timestamp: '2026-10-22T00:00:00.000Z',
    subjectCount: distinctSubjects,
    totalItems: items.length,
    items
  }
}

/**
 * Gera o selo criptográfico SHA-256 do dataset de holdout
 */
export function generateHoldoutSeal(dataset: HoldoutDataset): HoldoutSeal {
  const itemHashes: Record<string, string> = {}
  dataset.items.forEach(i => {
    itemHashes[i.id] = i.hash
  })

  const sortedKeys = Object.keys(itemHashes).sort()
  const compositeString = sortedKeys.map(k => `${k}:${itemHashes[k]}`).join(';')
  const datasetHash = createHash('sha256').update(compositeString, 'utf8').digest('hex')

  return {
    algorithm: 'SHA-256',
    datasetHash,
    itemHashes,
    generatedAt: dataset.timestamp
  }
}

/**
 * Valida se um dataset de holdout confere com o selo gravado no lock
 */
export function verifyHoldoutSeal(dataset: HoldoutDataset, lockSeal: HoldoutSeal): boolean {
  const freshlyGenerated = generateHoldoutSeal(dataset)
  return freshlyGenerated.datasetHash === lockSeal.datasetHash
}
