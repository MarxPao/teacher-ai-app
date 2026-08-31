import { describe, it, expect } from 'vitest'
import {
  createExamSheetLayout,
  evaluateOMRSheet,
  detectSheetFiducials,
  computeHomography,
  applyHomography,
  generatePrintableOmrSheetHtml,
  ImageBuffer,
  ExamSheetLayout
} from '../lib/omr'

// ─── Helper: Cria um ImageBuffer sintético para testes unitários ───────────────
function createSyntheticSheetImage(layout: ExamSheetLayout, markings: Record<number, string | { opt: string; style?: 'strong' | 'blue' | 'light_pencil' | 'off_center' | 'multiple' | 'scratched' }>): ImageBuffer {
  const width = layout.canonicalWidth
  const height = layout.canonicalHeight
  const data = new Uint8ClampedArray(width * height * 4)

  // Preenche fundo branco (255, 255, 255, 255)
  data.fill(255)

  // Função auxiliar para desenhar retângulo preto sólido
  const drawRect = (x0: number, y0: number, w: number, h: number, r = 0, g = 0, b = 0) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4
          data[idx] = r
          data[idx + 1] = g
          data[idx + 2] = b
          data[idx + 3] = 255
        }
      }
    }
  }

  // Função auxiliar para desenhar círculo
  const drawCircle = (cx: number, cy: number, radius: number, isFilled: boolean, r = 0, g = 0, b = 0) => {
    const minX = Math.max(0, Math.floor(cx - radius - 2))
    const maxX = Math.min(width - 1, Math.ceil(cx + radius + 2))
    const minY = Math.max(0, Math.floor(cy - radius - 2))
    const maxY = Math.min(height - 1, Math.ceil(cy + radius + 2))

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - cx, y - cy)
        const idx = (y * width + x) * 4
        if (isFilled && dist <= radius) {
          data[idx] = r
          data[idx + 1] = g
          data[idx + 2] = b
          data[idx + 3] = 255
        } else if (!isFilled && Math.abs(dist - radius) <= 1.5) {
          // Borda do círculo
          data[idx] = 44
          data[idx + 1] = 26
          data[idx + 2] = 14
          data[idx + 3] = 255
        }
      }
    }
  }

  // 1. Desenha os 4 Marcadores Fiduciais nos cantos
  const markerSize = layout.fiducials.markerSize
  const fids = [
    layout.fiducials.topLeft,
    layout.fiducials.topRight,
    layout.fiducials.bottomRight,
    layout.fiducials.bottomLeft
  ]
  fids.forEach(pt => {
    drawRect(Math.floor(pt.x - markerSize / 2), Math.floor(pt.y - markerSize / 2), markerSize, markerSize, 0, 0, 0)
  })

  // 2. Desenha todos os círculos de questão (bordas)
  layout.questions.forEach(q => {
    q.options.forEach(opt => {
      drawCircle(opt.center.x, opt.center.y, opt.radius, false)
    })
  })

  // 3. Aplica as marcações dos alunos
  Object.entries(markings).forEach(([qStr, val]) => {
    const qNum = parseInt(qStr)
    const qLayout = layout.questions.find(q => q.questionNumber === qNum)
    if (!qLayout) return

    if (typeof val === 'string') {
      const optLayout = qLayout.options.find(o => o.option === val.toUpperCase())
      if (optLayout) {
        drawCircle(optLayout.center.x, optLayout.center.y, optLayout.radius * 0.85, true, 20, 20, 20) // Caneta preta
      }
    } else {
      const { opt, style } = val
      const optLayout = qLayout.options.find(o => o.option === opt.toUpperCase())
      if (!optLayout) return

      if (style === 'strong' || !style) {
        drawCircle(optLayout.center.x, optLayout.center.y, optLayout.radius * 0.85, true, 20, 20, 20)
      } else if (style === 'blue') {
        drawCircle(optLayout.center.x, optLayout.center.y, optLayout.radius * 0.85, true, 20, 40, 140) // Caneta azul
      } else if (style === 'light_pencil') {
        drawCircle(optLayout.center.x, optLayout.center.y, optLayout.radius * 0.85, true, 160, 160, 165) // Lápis claro
      } else if (style === 'off_center') {
        drawCircle(optLayout.center.x + 4, optLayout.center.y - 2, optLayout.radius * 0.85, true, 20, 20, 20) // Fora do centro
      } else if (style === 'multiple') {
        // Marca B e D
        const optB = qLayout.options.find(o => o.option === 'B')
        const optD = qLayout.options.find(o => o.option === 'D')
        if (optB) drawCircle(optB.center.x, optB.center.y, optB.radius * 0.85, true, 20, 20, 20)
        if (optD) drawCircle(optD.center.x, optD.center.y, optD.radius * 0.85, true, 20, 20, 20)
      }
    }
  })

  return {
    width,
    height,
    data
  }
}

describe('OMR Deterministic Engine Suite (Cenário A)', () => {
  const layout = createExamSheetLayout({
    id: 'exam_bio_101',
    title: 'Avaliação de Biologia Celular',
    version: 'Form_A',
    totalQuestions: 10,
    optionsPerQuestion: 4,
    answerKey: {
      1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A',
      6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'B'
    }
  })

  it('1. Gera layout de folha com marcadores fiduciais e HTML imprimível', () => {
    expect(layout.canonicalWidth).toBe(1000)
    expect(layout.canonicalHeight).toBe(1414)
    expect(layout.questions.length).toBe(10)
    expect(layout.questions[0].options.length).toBe(4)

    const html = generatePrintableOmrSheetHtml(layout, 'ESCOLA MODELO MACHADO SOBRINHO')
    expect(html).toContain('fiducial fiducial-tl')
    expect(html).toContain('FOLHA OFICIAL DE RESPOSTAS (GABARITO OMR)')
    expect(html).toContain('Avaliação de Biologia Celular')
  })

  it('2. Detecta os 4 marcadores fiduciais com precisão milimétrica', () => {
    const img = createSyntheticSheetImage(layout, { 1: 'A' })
    const fids = detectSheetFiducials(img)

    expect(fids.isValid).toBe(true)
    expect(Math.abs(fids.topLeft.x - 50)).toBeLessThan(5)
    expect(Math.abs(fids.topLeft.y - 50)).toBeLessThan(5)
    expect(Math.abs(fids.topRight.x - 950)).toBeLessThan(5)
    expect(Math.abs(fids.topRight.y - 50)).toBeLessThan(5)
  })

  it('3. Resolve a matriz de homografia 3x3 para correção de perspectiva', () => {
    const src: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
      { x: 50, y: 50 },
      { x: 950, y: 50 },
      { x: 950, y: 1364 },
      { x: 50, y: 1364 }
    ]
    const dst = src // Identidade
    const H = computeHomography(src, dst)
    const transformed = applyHomography({ x: 500, y: 700 }, H)

    expect(Math.abs(transformed.x - 500)).toBeLessThan(0.01)
    expect(Math.abs(transformed.y - 700)).toBeLessThan(0.01)
  })

  it('4. Avalia com 100% de precisão as 10 questões preenchidas (Caneta Preta, Azul e Deslocada)', () => {
    const img = createSyntheticSheetImage(layout, {
      1: { opt: 'A', style: 'strong' },        // Caneta preta perfeita
      2: { opt: 'B', style: 'blue' },          // Caneta azul escura
      3: { opt: 'C', style: 'off_center' },    // Marcação levemente fora do centro
      4: { opt: 'D', style: 'strong' },
      5: { opt: 'A', style: 'blue' },
      6: { opt: 'B', style: 'strong' },
      7: { opt: 'C', style: 'strong' },
      8: { opt: 'D', style: 'blue' },
      9: { opt: 'A', style: 'strong' },
      10: { opt: 'B', style: 'strong' }
    })

    const result = evaluateOMRSheet(img, layout)

    expect(result.fiducialsDetected).toBe(true)
    expect(result.totalQuestions).toBe(10)
    expect(result.correctCount).toBe(10)
    expect(result.score).toBe(10.0)
    expect(result.overallConfidence).toBe('high')
    expect(result.isDeterministicSuccess).toBe(true)
    expect(result.fallbackCount).toBe(0)

    // Verifica que todas foram classificadas como single_mark com alta confiança
    result.questions.forEach(q => {
      expect(q.confidence).toBe('high')
      expect(q.classification).toBe('single_mark')
      expect(q.isCorrect).toBe(true)
    })
  })

  it('5. Identifica e anula corretamente questões com Dupla Marcação', () => {
    const img = createSyntheticSheetImage(layout, {
      1: { opt: 'A', style: 'strong' },
      2: { opt: 'B', style: 'multiple' }, // Marca B e D
      3: { opt: 'C', style: 'strong' }
    })

    const result = evaluateOMRSheet(img, layout)
    const q2 = result.questions[1]

    expect(q2.classification).toBe('multiple_marks')
    expect(q2.detectedAnswer).toBeNull() // Anulado
    expect(q2.isAmbiguous).toBe(true)
    expect(q2.needsAiFallback).toBe(true)
  })

  it('6. Identifica corretamente questões deixadas em Branco', () => {
    const img = createSyntheticSheetImage(layout, {
      1: { opt: 'A', style: 'strong' },
      // Questão 2 deixada em branco
      3: { opt: 'C', style: 'strong' }
    })

    const result = evaluateOMRSheet(img, layout)
    const q2 = result.questions[1]

    expect(q2.classification).toBe('blank')
    expect(q2.detectedAnswer).toBeNull()
    expect(q2.confidence).toBe('high')
    expect(q2.isCorrect).toBe(false)
  })

  it('7. Sinaliza marcação fraca de lápis para Fallback/Revisão (Medium Confidence)', () => {
    const img = createSyntheticSheetImage(layout, {
      1: { opt: 'A', style: 'light_pencil' } // Lápis claro
    })

    const result = evaluateOMRSheet(img, layout)
    const q1 = result.questions[0]

    expect(q1.detectedAnswer).toBe('A')
    expect(q1.confidence).toBe('medium')
    expect(q1.classification).toBe('light_pencil')
    expect(q1.needsAiFallback).toBe(true)
  })
})
