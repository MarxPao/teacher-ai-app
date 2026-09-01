/**
 * lib/psychometricsEngine.ts — Motor de Psicometria Clássica e Calibração de Itens
 * 
 * Implementa Teoria Clássica dos Testes (TCT) para recalibração contínua de questões:
 * 1. Índice de Facilidade (p-value): p = acertos / N
 * 2. Índice de Discriminação de Kelley (D): D = p(superior) - p(inferior)
 * 3. Detecção de Discriminação Negativa (gabarito invertido / distrator ambíguo)
 * 4. Calibração empírica e alerta de divergência entre dificuldade nominal e real (N >= 10)
 */

export interface StudentItemResponse {
  studentId: string
  correct: boolean
  totalExamScore?: number // Pontuação total do aluno na prova (para divisão de terços)
  timestamp?: number
}

export interface EmpiricalPsychometrics {
  totalResponses: number
  correctCount: number
  pValue: number // Índice de facilidade: 0.00 a 1.00
  discriminationIndex: number | null // D de Kelley: -1.00 a +1.00 (null se N < 6)
  empiricalDifficulty: 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard'
  isDivergentFromNominal: boolean
  divergenceSeverity: 'none' | 'warning' | 'critical'
  divergenceMessage?: string
  discriminationWarning?: string
  lastCalibratedAt: number
}

export const MIN_RESPONSES_FOR_CALIBRATION = 6
export const MIN_RESPONSES_FOR_RELIABLE_DIVERGENCE = 10

/**
 * Converte rótulo nominal para escala padronizada
 */
export function normalizeNominalDifficulty(nominal?: string): 'easy' | 'medium' | 'hard' {
  if (!nominal) return 'medium'
  const norm = nominal.toLowerCase().trim()
  if (norm.includes('fácil') || norm.includes('facil') || norm.includes('easy') || norm.includes('básico') || norm.includes('basico') || norm === 'remember') {
    return 'easy'
  }
  if (norm.includes('difícil') || norm.includes('dificil') || norm.includes('hard') || norm.includes('avançado') || norm.includes('challenge') || norm === 'evaluate') {
    return 'hard'
  }
  return 'medium'
}

/**
 * Classifica a dificuldade empírica a partir do p-value
 */
export function classifyEmpiricalDifficulty(pValue: number): 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard' {
  if (pValue >= 0.85) return 'very_easy'
  if (pValue >= 0.65) return 'easy'
  if (pValue >= 0.40) return 'medium'
  if (pValue >= 0.20) return 'hard'
  return 'very_hard'
}

/**
 * Calcula o Índice de Discriminação de Kelley (D)
 * D = p(terço superior) - p(terço inferior)
 */
export function calculateKelleyDiscrimination(
  responses: StudentItemResponse[]
): number | null {
  if (responses.length < MIN_RESPONSES_FOR_CALIBRATION) return null

  // Filtra itens com pontuação de prova informada
  const withScores = responses.filter(r => typeof r.totalExamScore === 'number')
  
  // Se não temos scores individuais de prova, não é possível computar discriminação de terço
  if (withScores.length < MIN_RESPONSES_FOR_CALIBRATION) return null

  // Ordena alunos do maior para o menor escore na avaliação
  const sorted = [...withScores].sort((a, b) => (b.totalExamScore || 0) - (a.totalExamScore || 0))
  
  // Tamanho do grupo extremo (~27% a 33% dos alunos, mínimo 2)
  const groupSize = Math.max(2, Math.floor(sorted.length * 0.30))
  
  const upperGroup = sorted.slice(0, groupSize)
  const lowerGroup = sorted.slice(sorted.length - groupSize)

  const upperCorrect = upperGroup.filter(r => r.correct).length
  const lowerCorrect = lowerGroup.filter(r => r.correct).length

  const pUpper = upperCorrect / upperGroup.length
  const pLower = lowerCorrect / lowerGroup.length

  const D = Number((pUpper - pLower).toFixed(3))
  return D
}

/**
 * Avalia psicometricamente o conjunto acumulado de respostas de uma questão
 */
export function evaluateItemPsychometrics(
  responses: StudentItemResponse[],
  nominalDifficulty?: string
): EmpiricalPsychometrics {
  const total = responses.length
  if (total === 0) {
    return {
      totalResponses: 0,
      correctCount: 0,
      pValue: 0.5,
      discriminationIndex: null,
      empiricalDifficulty: 'medium',
      isDivergentFromNominal: false,
      divergenceSeverity: 'none',
      lastCalibratedAt: Date.now()
    }
  }

  const correctCount = responses.filter(r => r.correct).length
  const pValue = Number((correctCount / total).toFixed(3))
  const empiricalDifficulty = classifyEmpiricalDifficulty(pValue)
  const discriminationIndex = calculateKelleyDiscrimination(responses)

  const normNominal = normalizeNominalDifficulty(nominalDifficulty)

  let isDivergent = false
  let severity: 'none' | 'warning' | 'critical' = 'none'
  let divergenceMessage: string | undefined = undefined
  let discriminationWarning: string | undefined = undefined

  // Avaliação de Discriminação
  if (discriminationIndex !== null) {
    if (discriminationIndex < 0.0) {
      discriminationWarning = `⚠️ Discriminação Negativa (D = ${discriminationIndex}): Alunos com notas menores acertaram mais do que os alunos com notas maiores. Possível ambiguidade ou gabarito invertido.`
    } else if (discriminationIndex < 0.15) {
      discriminationWarning = `ℹ️ Baixa Discriminação (D = ${discriminationIndex}): Item pouco eficaz para distinguir níveis de domínio.`
    }
  }

  // Avaliação de Divergência (apenas com amostra representativa N >= 10)
  if (total >= MIN_RESPONSES_FOR_RELIABLE_DIVERGENCE) {
    const errorPct = Math.round((1 - pValue) * 100)
    const successPct = Math.round(pValue * 100)

    if (normNominal === 'easy' && (empiricalDifficulty === 'hard' || empiricalDifficulty === 'very_hard')) {
      isDivergent = true
      severity = 'critical'
      divergenceMessage = `⚠️ Marcada como Fácil, mas ${errorPct}% dos alunos erraram historicamente (p = ${pValue}, N = ${total}). Revisar complexidade antes de reusar.`
    } else if (normNominal === 'easy' && pValue < 0.50) {
      isDivergent = true
      severity = 'warning'
      divergenceMessage = `⚠️ Dificuldade observada superior ao esperado: ${errorPct}% de erro (p = ${pValue}, N = ${total}).`
    } else if (normNominal === 'hard' && (empiricalDifficulty === 'easy' || empiricalDifficulty === 'very_easy')) {
      isDivergent = true
      severity = 'warning'
      divergenceMessage = `💡 Marcada como Difícil, mas ${successPct}% dos alunos acertaram com facilidade (p = ${pValue}, N = ${total}).`
    }
  }

  return {
    totalResponses: total,
    correctCount,
    pValue,
    discriminationIndex,
    empiricalDifficulty,
    isDivergentFromNominal: isDivergent,
    divergenceSeverity: severity,
    divergenceMessage,
    discriminationWarning,
    lastCalibratedAt: Date.now()
  }
}
