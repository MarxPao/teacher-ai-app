/**
 * lib/testInformationEngine.ts — Curvas de Informação do Teste (TIF) & Erro Padrão Condicional SE(\theta)
 * Onda H — Fase H2
 * 
 * Base Teórica:
 * - Lord, F. M. (1980). "Applications of Item Response Theory to Practical Testing Problems." Lawrence Erlbaum.
 * - Birnbaum, A. (1968). "Some latent trait models and their use in inferring an examinee's ability."
 * - Hambleton, R. K., Swaminathan, H., & Rogers, H. J. (1991). "Fundamentals of Item Response Theory." SAGE.
 * 
 * Princípio Psicométrico:
 * Na Teoria Clássica dos Testes (TCT), o erro padrão de medida (SEM) é uma média global constante,
 * ignorando que o teste mede com precisões desiguais diferentes níveis de proficiência.
 * Na Teoria da Resposta ao Item (TRI):
 * 1. Função de Informação do Item (IIF): I_j(\theta) = [P_j'(\theta)]^2 / [P_j(\theta) * Q_j(\theta)].
 * 2. Função de Informação do Teste (TIF): I(\theta) = \sum_{j=1}^K I_j(\theta) (propriedade de aditividade).
 * 3. Erro Padrão Condicional de Medida: SE(\theta) = 1 / \sqrt{I(\theta)}.
 * 4. Banda de Precisão Eficaz: amplitude de proficiências onde SE(\theta) <= 0.35 (confiabilidade equivalente >= 0.88).
 * 5. Detecção de Zonas Cegas (Blind Spots): identifica se a avaliação é cega para alunos com dificuldades severas
 *    (\theta < -2.0) ou de alto rendimento (\theta > +2.0).
 */

import { irt3plProbability, type IrtItemParameters } from '@/lib/irtEquatingEngine'

export interface ThetaInformationPoint {
  theta: number
  testInformation: number        // I(\theta)
  standardError: number          // SE(\theta) = 1 / \sqrt{I(\theta)}
  reliabilityEquivalent: number  // r_{xx} \approx 1 - SE^2
}

export interface ItemInformationContribution {
  id: string
  peakTheta: number
  peakInformation: number
  informationAtMinus1: number
  informationAtZero: number
  informationAtPlus1: number
  relativeContributionPercent: number
}

export interface TestInformationAnalysis {
  curvePoints: ThetaInformationPoint[]
  peakTheta: number
  peakInformation: number
  minStandardError: number
  effectiveBandwidth: {
    minTheta: number
    maxTheta: number
    width: number
    isBroad: boolean
  }
  itemContributions: ItemInformationContribution[]
  targetAudienceSuitability: string
  blindSpotNotice?: string
  summaryDiagnosis: string
}

/**
 * Calcula a informação de um item individual sob o modelo 3PL no nível \theta:
 * I_j(\theta) = 1.7^2 * a_j^2 * [ (P_j(\theta) - c_j)^2 / ( (1 - c_j)^2 * P_j(\theta) * (1 - P_j(\theta)) ) ] * (1 - P_j(\theta))
 * Simplificado para 3PL:
 * I_j(\theta) = \frac{1.7^2 \cdot a_j^2 \cdot (1 - P_j(\theta)) \cdot (P_j(\theta) - c_j)^2}{(1 - c_j)^2 \cdot P_j(\theta)}
 */
export function calculateItemInformation(theta: number, item: IrtItemParameters): number {
  const c = item.c !== undefined ? item.c : 0.0
  const a = Math.max(0.1, item.a)
  const p = irt3plProbability(theta, item)
  const q = 1 - p

  if (p <= c || p >= 0.999 || q <= 0.001) {
    return 1e-4
  }

  const d = 1.7
  const numerator = Math.pow(d * a, 2) * q * Math.pow(p - c, 2)
  const denominator = Math.pow(1 - c, 2) * p

  if (denominator <= 1e-6) return 1e-4

  const info = numerator / denominator
  return Number(Math.max(1e-4, info).toFixed(4))
}

/**
 * Calcula a Informação Total do Teste e o Erro Padrão Condicional em um ponto \theta.
 */
export function calculateTestInformation(
  theta: number,
  items: IrtItemParameters[]
): {
  information: number
  standardError: number
} {
  const totalInfo = items.reduce((acc, it) => acc + calculateItemInformation(theta, it), 0)
  const safeInfo = Math.max(1e-4, totalInfo)
  const se = 1 / Math.sqrt(safeInfo)

  return {
    information: Number(safeInfo.toFixed(4)),
    standardError: Number(Math.min(5.0, se).toFixed(3))
  }
}

/**
 * Analisa a Curva de Informação do Teste (TIF) em todo o continuum \theta [-3.0, +3.0],
 * determinando picos de precisão, largura de banda eficaz e zonas cegas.
 */
export function analyzeTestInformationCurve(items: IrtItemParameters[]): TestInformationAnalysis {
  if (!items || items.length === 0) {
    return {
      curvePoints: [],
      peakTheta: 0,
      peakInformation: 0,
      minStandardError: 5.0,
      effectiveBandwidth: { minTheta: 0, maxTheta: 0, width: 0, isBroad: false },
      itemContributions: [],
      targetAudienceSuitability: 'Sem itens disponíveis para análise de informação.',
      summaryDiagnosis: 'Nenhum item TRI fornecido para cálculo da TIF.'
    }
  }

  // Gera curva com 25 pontos entre -3.0 e +3.0 (passo 0.25)
  const curvePoints: ThetaInformationPoint[] = []
  let peakTheta = 0
  let peakInfo = -1
  let minSE = 999

  for (let th = -3.0; th <= 3.001; th += 0.25) {
    const roundedTh = Number(th.toFixed(2))
    const { information, standardError } = calculateTestInformation(roundedTh, items)
    const relEquiv = Number(Math.max(0, Math.min(0.999, 1 - Math.pow(standardError, 2))).toFixed(3))

    curvePoints.push({
      theta: roundedTh,
      testInformation: information,
      standardError,
      reliabilityEquivalent: relEquiv
    })

    if (information > peakInfo) {
      peakInfo = information
      peakTheta = roundedTh
    }
    if (standardError < minSE) {
      minSE = standardError
    }
  }

  // Identifica a banda eficaz onde SE(\theta) <= 0.40 (confiabilidade equivalente >= 0.84)
  const effectivePoints = curvePoints.filter(pt => pt.standardError <= 0.40)
  let minEffTheta = 0
  let maxEffTheta = 0
  let bandwidth = 0

  if (effectivePoints.length > 0) {
    minEffTheta = effectivePoints[0].theta
    maxEffTheta = effectivePoints[effectivePoints.length - 1].theta
    bandwidth = Number((maxEffTheta - minEffTheta).toFixed(2))
  }

  const isBroad = bandwidth >= 2.0

  // Contribuição individual de cada item
  const itemContributions: ItemInformationContribution[] = items.map(it => {
    let peakItemTh = it.b
    let peakItemInfo = calculateItemInformation(it.b, it)

    // Busca rápida do pico do item
    for (let th = it.b - 0.5; th <= it.b + 0.5; th += 0.1) {
      const inf = calculateItemInformation(th, it)
      if (inf > peakItemInfo) {
        peakItemInfo = inf
        peakItemTh = Number(th.toFixed(2))
      }
    }

    const infoMinus1 = calculateItemInformation(-1.0, it)
    const infoZero = calculateItemInformation(0.0, it)
    const infoPlus1 = calculateItemInformation(1.0, it)

    return {
      id: it.id,
      peakTheta: peakItemTh,
      peakInformation: peakItemInfo,
      informationAtMinus1: infoMinus1,
      informationAtZero: infoZero,
      informationAtPlus1: infoPlus1,
      relativeContributionPercent: 0 // preenchido a seguir
    }
  })

  // Calcula % relativa de contribuição no pico do teste (O(M) com index direto)
  const totalInfoAtPeak = peakInfo || 1.0
  itemContributions.forEach((c, idx) => {
    const item = items[idx] || items.find(it => it.id === c.id)!
    const itemInfoAtTestPeak = calculateItemInformation(peakTheta, item)
    c.relativeContributionPercent = Number(((itemInfoAtTestPeak / totalInfoAtPeak) * 100).toFixed(1))
  })

  // Diagnóstico de adequação do público-alvo
  let targetAudienceSuitability = 'Avaliação balanceada para a média da turma.'
  if (peakTheta < -0.5) {
    targetAudienceSuitability = 'Avaliação calibrada para diagnóstico de recuperação e estudantes com dificuldades (pico em θ < 0).'
  } else if (peakTheta > 0.5) {
    targetAudienceSuitability = 'Avaliação calibrada para seleção e estudantes com alta proficiência (pico em θ > 0).'
  }

  // Zonas cegas (Blind spots)
  let blindSpotNotice: string | undefined = undefined
  const infoLow = calculateTestInformation(-2.0, items).information
  const infoHigh = calculateTestInformation(2.0, items).information

  if (infoLow < 1.0 && infoHigh < 1.0) {
    blindSpotNotice = '⚠️ Zona Cega Bidirecional: O teste possui pouca informação em proficiências extremas (θ < -2.0 e θ > +2.0). Recomenda-se adicionar itens muito fáceis e muito difíceis.'
  } else if (infoLow < 1.0) {
    blindSpotNotice = '⚠️ Zona Cega em Dificuldades: Erro de medida elevado para alunos de rendimento muito baixo (θ < -2.0). Falta precisão para identificar déficits específicos.'
  } else if (infoHigh < 1.0) {
    blindSpotNotice = '⚠️ Efeito Teto: Informação insuficiente para discriminar com segurança entre alunos de alta proficiência (θ > +2.0).'
  }

  const summaryDiagnosis = `Curva de Informação do Teste (TIF): Pico de Informação I(θ) = ${peakInfo.toFixed(2)} em θ = ${peakTheta > 0 ? '+' : ''}${peakTheta}. Menor SE(θ) = ${minSE.toFixed(2)}. Faixa de Precisão Eficaz: [${minEffTheta}, ${maxEffTheta}] (largura ${bandwidth}). ${targetAudienceSuitability}`

  return {
    curvePoints,
    peakTheta,
    peakInformation: Number(peakInfo.toFixed(3)),
    minStandardError: Number(minSE.toFixed(3)),
    effectiveBandwidth: {
      minTheta: minEffTheta,
      maxTheta: maxEffTheta,
      width: bandwidth,
      isBroad
    },
    itemContributions,
    targetAudienceSuitability,
    blindSpotNotice,
    summaryDiagnosis
  }
}
