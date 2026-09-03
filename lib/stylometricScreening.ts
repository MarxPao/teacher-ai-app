/**
 * lib/stylometricScreening.ts — Triagem Estilométrica Formativa Não-Punitiva
 * 
 * FUNDAMENTAÇÃO PEDAGÓGICA E ÉTICA (Liang et al., Stanford 2023 / Weber-Wulff et al., 2023):
 * 1. Detectores de IA comerciais têm viés sistemático contra aprendizes de L2/ELT (falsos positivos de até 61.3%),
 *    pois vocabulário mais formal e menor variação sintática mimetizam baixa perplexidade.
 * 2. REGRA DE OURO DA PLATAFORMA: Este módulo NUNCA altera notas, NUNCA desconta pontos e NUNCA acusa o aluno de plágio.
 * 3. OBJETIVO EXCLUSIVO: Identificar discrepâncias de complexidade em relação ao nível declarado ou histórico
 *    do aluno na Memória Viva (studentMemory.ts) e sugerir ao professor uma arguição oral formativa.
 */

import { StudentMemory } from './studentMemory'

export interface StylometricAdvisory {
  hasAnomaly: boolean
  confidence: 'low' | 'moderate' | 'high'
  advisoryType: 'none' | 'lexical_complexity_jump' | 'syntactic_uniformity' | 'level_disconnect'
  observedMetrics: {
    avgSentenceLength: number
    sentenceLengthStdDev: number // Burstiness (variação de comprimento)
    advancedLinkersCount: number
    targetLevel: string
    detectedLexicalLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  }
  teacherAdvisoryNotice?: string
  scoreImpact: 0 // Garantia formal: impacto zero na pontuação
}

// Conectivos formais avançados (níveis B2/C1/C2)
const ADVANCED_LINKERS_EN = [
  'furthermore', 'moreover', 'nevertheless', 'notwithstanding', 'consequently',
  'in light of', 'on the contrary', 'subsequently', 'with regard to', 'it is worth noting that',
  'a compelling argument', 'substantiate', 'ubiquitous', 'paradigm', 'inadvertently'
]

const ADVANCED_LINKERS_PT = [
  'outrossim', 'conquanto', 'não obstante', 'por conseguinte', 'em consonância com',
  'haja vista', 'sob a ótica de', 'mister se faz', 'imperioso ressaltar', 'precípuo'
]

/**
 * Analisa a redação do aluno de forma não-punitiva e gera um sinalizador pedagógico
 */
export function screenEssayStylometrics(opts: {
  essayText: string
  targetLevel?: string // 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | '6ano' | '9ano' | 'em'
  studentMemory?: StudentMemory | null
  language?: 'en' | 'pt-BR'
}): StylometricAdvisory {
  const text = (opts.essayText || '').trim()
  if (!text || text.length < 50) {
    return {
      hasAnomaly: false,
      confidence: 'low',
      advisoryType: 'none',
      observedMetrics: {
        avgSentenceLength: 0,
        sentenceLengthStdDev: 0,
        advancedLinkersCount: 0,
        targetLevel: opts.targetLevel || 'B1',
        detectedLexicalLevel: 'A1'
      },
      scoreImpact: 0
    }
  }

  // 1. Divide em frases
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0)
  const sentenceLengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length)
  const totalWords = sentenceLengths.reduce((a, b) => a + b, 0)
  const avgSentenceLength = Number((totalWords / Math.max(1, sentences.length)).toFixed(1))

  // 2. Cálculo de Burstiness (Desvio padrão do comprimento de orações)
  const variance = sentenceLengths.reduce((acc, len) => acc + Math.pow(len - avgSentenceLength, 2), 0) / Math.max(1, sentences.length)
  const sentenceLengthStdDev = Number(Math.sqrt(variance).toFixed(1))

  // 3. Contagem de conectivos e estruturas de alta complexidade
  const lower = text.toLowerCase()
  const linkersList = opts.language === 'pt-BR' ? ADVANCED_LINKERS_PT : ADVANCED_LINKERS_EN
  let advancedLinkersCount = 0
  linkersList.forEach(linker => {
    if (lower.includes(linker)) advancedLinkersCount++
  })

  // 4. Estimativa aproximada de complexidade lexical
  let detectedLexicalLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' = 'A2'
  if (advancedLinkersCount >= 5 || avgSentenceLength >= 26) detectedLexicalLevel = 'C2'
  else if (advancedLinkersCount >= 3 || avgSentenceLength >= 22) detectedLexicalLevel = 'C1'
  else if (advancedLinkersCount >= 2 || avgSentenceLength >= 18) detectedLexicalLevel = 'B2'
  else if (advancedLinkersCount >= 1 || avgSentenceLength >= 14) detectedLexicalLevel = 'B1'
  else if (avgSentenceLength >= 10) detectedLexicalLevel = 'A2'
  else detectedLexicalLevel = 'A1'

  const target = (opts.targetLevel || 'B1').toUpperCase()
  let hasAnomaly = false
  let confidence: StylometricAdvisory['confidence'] = 'low'
  let advisoryType: StylometricAdvisory['advisoryType'] = 'none'
  let teacherAdvisoryNotice: string | undefined = undefined

  // 5. Verificação de Discrepância com o Histórico do Aluno (studentMemory) ou com o Nível Alvo
  // REGRA FORMATIVA: Compara a produção contra a trajetória longitudinal do PRÓPRIO aluno,
  // nunca contra um classificador genérico ou detector opaco de terceiros.
  const isBeginnerTarget = target.includes('A1') || target.includes('A2') || target.includes('6ANO') || target.includes('7ANO')
  const isAdvancedDetected = detectedLexicalLevel === 'C1' || detectedLexicalLevel === 'C2'

  // Análise contra o histórico do próprio aluno em studentMemory
  let historyIndicatesBeginner = false
  if (opts.studentMemory) {
    const mem = opts.studentMemory
    const allExams = [...(mem.examHistory || []), ...(mem.coldExams || [])]
    if (allExams.length > 0) {
      const avgScore = allExams.reduce((acc, e) => acc + e.score, 0) / allExams.length
      // Se as avaliações históricas do aluno apontam rendimento básico ou se as observações citam A1/A2
      const obsText = (mem.observations || []).map(o => (o.note || '').toLowerCase()).join(' ')
      if (obsText.includes('a1') || obsText.includes('a2') || obsText.includes('iniciante') || obsText.includes('básico') || (avgScore < 7.0 && isBeginnerTarget)) {
        historyIndicatesBeginner = true
      }
    }
  }

  if (isAdvancedDetected && (isBeginnerTarget || historyIndicatesBeginner)) {
    hasAnomaly = true
    confidence = 'moderate'
    advisoryType = 'level_disconnect'
    teacherAdvisoryNotice = `ℹ️ Sinalizador Pedagógico: A complexidade léxica e os conectivos formais identificados nesta produção (${detectedLexicalLevel}) apresentam salto atípico em relação ao histórico pedagógico e nível de proficiência (${target}). Sugestão: realizar uma breve arguição oral formativa com o aluno sobre os pontos defendidos no texto.`
  } else if (sentences.length >= 5 && sentenceLengthStdDev <= 2.0 && avgSentenceLength >= 16) {
    // Baixíssima variação de comprimento em frases longas (sintaxe excessivamente uniforme)
    hasAnomaly = true
    confidence = 'low'
    advisoryType = 'syntactic_uniformity'
    teacherAdvisoryNotice = `ℹ️ Sinalizador Pedagógico: Estrutura oracional com padrão métrico altamente uniforme. Sugestão: realizar uma breve arguição oral formativa com o aluno para explorar a intencionalidade estilística da sua escrita.`
  }

  return {
    hasAnomaly,
    confidence,
    advisoryType,
    observedMetrics: {
      avgSentenceLength,
      sentenceLengthStdDev,
      advancedLinkersCount,
      targetLevel: opts.targetLevel || 'B1',
      detectedLexicalLevel
    },
    teacherAdvisoryNotice,
    scoreImpact: 0
  }
}
