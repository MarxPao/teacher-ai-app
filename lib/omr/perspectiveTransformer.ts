/**
 * perspectiveTransformer.ts — Transformação e Retificação de Perspectiva 3x3
 * 
 * Implementa o solver de homografia projetiva planar em puro TypeScript
 * e a retificação com amostragem bilinear para o espaço canônico A4.
 */

import { Point2D } from './types'

export type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
]

/**
 * Resolve a matriz de Homografia 3x3 que mapeia srcPoints -> dstPoints
 * usando Eliminação de Gauss-Jordan com pivotamento parcial (8 equações lineares).
 */
export function computeHomography(
  src: [Point2D, Point2D, Point2D, Point2D],
  dst: [Point2D, Point2D, Point2D, Point2D]
): Matrix3x3 {
  const A: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x
    const sy = src[i].y
    const dx = dst[i].x
    const dy = dst[i].y

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy])
    b.push(dx)

    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy])
    b.push(dy)
  }

  // Resolução por Eliminação Gaussiana com Pivotamento Parcial
  const n = 8
  for (let i = 0; i < n; i++) {
    // Busca pivô máximo
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k
      }
    }

    // Troca linhas
    const tempA = A[i]
    A[i] = A[maxRow]
    A[maxRow] = tempA

    const tempB = b[i]
    b[i] = b[maxRow]
    b[maxRow] = tempB

    // Normaliza linha do pivô
    const pivot = A[i][i]
    if (Math.abs(pivot) < 1e-10) {
      throw new Error('Matriz singular: os 4 pontos fiduciais não formam um quadrilátero convexo válido.')
    }

    for (let j = i; j < n; j++) {
      A[i][j] /= pivot
    }
    b[i] /= pivot

    // Elimina outras linhas
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i]
        for (let j = i; j < n; j++) {
          A[k][j] -= factor * A[i][j]
        }
        b[k] -= factor * b[i]
      }
    }
  }

  return [
    [b[0], b[1], b[2]],
    [b[3], b[4], b[5]],
    [b[6], b[7], 1.0]
  ]
}

/**
 * Calcula a inversa de uma matriz 3x3
 */
export function invertMatrix3x3(m: Matrix3x3): Matrix3x3 {
  const [
    [a, b, c],
    [d, e, f],
    [g, h, k]
  ] = m

  const A = e * k - f * h
  const B = -(d * k - f * g)
  const C = d * h - e * g
  const D = -(b * k - c * h)
  const E = a * k - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const K = a * e - b * d

  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-10) {
    throw new Error('Matriz não invertível na transformação de perspectiva.')
  }

  const invDet = 1.0 / det
  return [
    [A * invDet, D * invDet, G * invDet],
    [B * invDet, E * invDet, H * invDet],
    [C * invDet, F * invDet, K * invDet]
  ]
}

/**
 * Transforma um ponto através da matriz de homografia
 */
export function applyHomography(point: Point2D, h: Matrix3x3): Point2D {
  const x = point.x
  const y = point.y
  const w = h[2][0] * x + h[2][1] * y + h[2][2]
  if (Math.abs(w) < 1e-10) return { x: 0, y: 0 }
  return {
    x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
    y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w
  }
}

/**
 * Retifica a imagem de entrada (Warp Perspective) para o buffer canônico de destino (ex: 1000 x 1414)
 * usando amostragem bilinear de pixels para máxima nitidez de marcações finas.
 */
export function warpPerspectiveCanvas(
  srcData: ImageData,
  srcCorners: [Point2D, Point2D, Point2D, Point2D],
  dstWidth: number,
  dstHeight: number
): ImageData {
  const dstCorners: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: dstWidth, y: 0 },
    { x: dstWidth, y: dstHeight },
    { x: 0, y: dstHeight }
  ]

  // Mapeia canônico -> foto original para amostragem reversa
  const H = computeHomography(dstCorners, srcCorners)

  const srcW = srcData.width
  const srcH = srcData.height
  const srcPixels = srcData.data

  const dstPixels = new Uint8ClampedArray(dstWidth * dstHeight * 4)

  for (let dy = 0; dy < dstHeight; dy++) {
    for (let dx = 0; dx < dstWidth; dx++) {
      const srcPt = applyHomography({ x: dx, y: dy }, H)
      const sx = srcPt.x
      const sy = srcPt.y

      const dstIdx = (dy * dstWidth + dx) * 4

      if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
        // Amostragem Bilinear
        const x0 = Math.floor(sx)
        const x1 = x0 + 1
        const y0 = Math.floor(sy)
        const y1 = y0 + 1

        const fx = sx - x0
        const fy = sy - y0
        const f00 = (1 - fx) * (1 - fy)
        const f10 = fx * (1 - fy)
        const f01 = (1 - fx) * fy
        const f11 = fx * fy

        const i00 = (y0 * srcW + x0) * 4
        const i10 = (y0 * srcW + x1) * 4
        const i01 = (y1 * srcW + x0) * 4
        const i11 = (y1 * srcW + x1) * 4

        dstPixels[dstIdx]     = f00 * srcPixels[i00]     + f10 * srcPixels[i10]     + f01 * srcPixels[i01]     + f11 * srcPixels[i11]
        dstPixels[dstIdx + 1] = f00 * srcPixels[i00 + 1] + f10 * srcPixels[i10 + 1] + f01 * srcPixels[i01 + 1] + f11 * srcPixels[i11 + 1]
        dstPixels[dstIdx + 2] = f00 * srcPixels[i00 + 2] + f10 * srcPixels[i10 + 2] + f01 * srcPixels[i01 + 2] + f11 * srcPixels[i11 + 2]
        dstPixels[dstIdx + 3] = 255
      } else {
        // Fora dos limites: preenche com branco
        dstPixels[dstIdx]     = 255
        dstPixels[dstIdx + 1] = 255
        dstPixels[dstIdx + 2] = 255
        dstPixels[dstIdx + 3] = 255
      }
    }
  }

  // Cria objeto ImageData seguro para ambiente browser / node
  if (typeof ImageData !== 'undefined') {
    return new ImageData(dstPixels, dstWidth, dstHeight)
  }
  return {
    width: dstWidth,
    height: dstHeight,
    data: dstPixels,
    colorSpace: 'srgb'
  } as ImageData
}
