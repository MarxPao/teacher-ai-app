/**
 * fiducialDetector.ts — Detector de Marcadores Fiduciais nos 4 Cantos da Folha
 * 
 * Implementa análise de componentes conexos (Blob Analysis) para localizar
 * os 4 quadrados pretos nos cantos (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
 * com sub-pixel accuracy, tolerância a rotação e alta robustez contra ruído de linha.
 */

import { Point2D, SheetFiducials, FiducialCorner } from './types'

export interface ImageBuffer {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Converte ImageData RGB em Grayscale com luminância ponderada
 */
export function toGrayscale(img: ImageBuffer): Uint8Array {
  const { width, height, data } = img
  const gray = new Uint8Array(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
  }
  return gray
}

/**
 * Constrói a Imagem Integral para média local em O(1)
 */
export function buildIntegralImage(gray: Uint8Array, width: number, height: number): Float64Array {
  const integral = new Float64Array(width * height)
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      rowSum += gray[idx]
      integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * width + x] : 0)
    }
  }
  return integral
}

/**
 * Binarização rápida: limiar dinâmico adaptado a luz
 */
export function binarizeImage(gray: Uint8Array, width: number, height: number): Uint8Array {
  // Calcula média global de tons de cinza
  let sum = 0
  for (let i = 0; i < gray.length; i += 8) sum += gray[i]
  const avg = sum / (gray.length / 8)
  const threshold = Math.max(70, Math.min(160, avg * 0.65))

  const binary = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] < threshold ? 1 : 0
  }
  return binary
}

interface QuadrantBox {
  x0: number
  y0: number
  x1: number
  y1: number
  cornerTarget: Point2D
  position: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
}

/**
 * Localiza o marcador fiducial usando Connected Component Analysis em um quadrante
 */
function findFiducialBlobInQuadrant(
  binary: Uint8Array,
  gray: Uint8Array,
  width: number,
  height: number,
  quadrant: QuadrantBox
): FiducialCorner | null {
  const { x0, y0, x1, y1, cornerTarget, position } = quadrant
  const qw = x1 - x0
  const qh = y1 - y0

  const visited = new Uint8Array(qw * qh)
  const minPixels = Math.max(50, Math.floor((width * height) * 0.0003)) // Mínimo ~0.03%
  const maxPixels = Math.floor((width * height) * 0.05)                // Máximo ~5%

  let bestBlob: FiducialCorner | null = null
  let minCornerDistance = Infinity

  // Fila para BFS
  const queueX = new Int32Array(qw * qh)
  const queueY = new Int32Array(qw * qh)

  for (let ly = 0; ly < qh; ly += 2) {
    const gy = y0 + ly
    for (let lx = 0; lx < qw; lx += 2) {
      const gx = x0 + lx
      const gIdx = gy * width + gx
      const lIdx = ly * qw + lx

      if (binary[gIdx] === 1 && visited[lIdx] === 0) {
        // Inicia BFS no componente conexo
        let head = 0
        let tail = 0
        queueX[tail] = gx
        queueY[tail] = gy
        tail++
        visited[lIdx] = 1

        let sumX = 0
        let sumY = 0
        let count = 0
        let minX = gx
        let maxX = gx
        let minY = gy
        let maxY = gy

        while (head < tail) {
          const cx = queueX[head]
          const cy = queueY[head]
          head++

          sumX += cx
          sumY += cy
          count++

          if (cx < minX) minX = cx
          if (cx > maxX) maxX = cx
          if (cy < minY) minY = cy
          if (cy > maxY) maxY = cy

          // 4 vizinhos
          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1]
          ]

          for (const [nx, ny] of neighbors) {
            if (nx >= x0 && nx < x1 && ny >= y0 && ny < y1) {
              const nLocalIdx = (ny - y0) * qw + (nx - x0)
              if (visited[nLocalIdx] === 0) {
                visited[nLocalIdx] = 1
                const nGlobalIdx = ny * width + nx
                if (binary[nGlobalIdx] === 1) {
                  queueX[tail] = nx
                  queueY[tail] = ny
                  tail++
                }
              }
            }
          }
        }

        // Valida se o blob atende aos critérios geométricos de um marcador quadrado
        if (count >= minPixels && count <= maxPixels) {
          const bw = maxX - minX + 1
          const bh = maxY - minY + 1
          const boxArea = bw * bh
          const solidity = count / boxArea
          const aspectRatio = Math.min(bw, bh) / Math.max(bw, bh)

          // Marcador quadrado sólido: aspect ratio > 0.65 e solidez > 0.70
          if (aspectRatio >= 0.65 && solidity >= 0.65) {
            const centerX = sumX / count
            const centerY = sumY / count
            const dist = Math.hypot(centerX - cornerTarget.x, centerY - cornerTarget.y)

            if (dist < minCornerDistance) {
              minCornerDistance = dist
              bestBlob = {
                position,
                center: { x: Number(centerX.toFixed(2)), y: Number(centerY.toFixed(2)) },
                width: bw,
                height: bh,
                confidence: Number((solidity * 0.5 + aspectRatio * 0.5).toFixed(2))
              }
            }
          }
        }
      }
    }
  }

  return bestBlob
}

/**
 * Detecta os 4 marcadores fiduciais da folha de respostas
 */
export function detectSheetFiducials(img: ImageBuffer): SheetFiducials {
  const { width, height } = img
  const gray = toGrayscale(img)
  const binary = binarizeImage(gray, width, height)

  const quadrants: QuadrantBox[] = [
    {
      x0: 0,
      y0: 0,
      x1: Math.floor(width * 0.45),
      y1: Math.floor(height * 0.45),
      cornerTarget: { x: 0, y: 0 },
      position: 'top-left'
    },
    {
      x0: Math.floor(width * 0.55),
      y0: 0,
      x1: width,
      y1: Math.floor(height * 0.45),
      cornerTarget: { x: width, y: 0 },
      position: 'top-right'
    },
    {
      x0: Math.floor(width * 0.55),
      y0: Math.floor(height * 0.55),
      x1: width,
      y1: height,
      cornerTarget: { x: width, y: height },
      position: 'bottom-right'
    },
    {
      x0: 0,
      y0: Math.floor(height * 0.55),
      x1: Math.floor(width * 0.45),
      y1: height,
      cornerTarget: { x: 0, y: height },
      position: 'bottom-left'
    }
  ]

  const tl = findFiducialBlobInQuadrant(binary, gray, width, height, quadrants[0])
  const tr = findFiducialBlobInQuadrant(binary, gray, width, height, quadrants[1])
  const br = findFiducialBlobInQuadrant(binary, gray, width, height, quadrants[2])
  const bl = findFiducialBlobInQuadrant(binary, gray, width, height, quadrants[3])

  if (!tl || !tr || !br || !bl) {
    return {
      topLeft: tl ? tl.center : { x: width * 0.05, y: height * 0.05 },
      topRight: tr ? tr.center : { x: width * 0.95, y: height * 0.05 },
      bottomRight: br ? br.center : { x: width * 0.95, y: height * 0.95 },
      bottomLeft: bl ? bl.center : { x: width * 0.05, y: height * 0.95 },
      isValid: false,
      skewAngleDegrees: 0,
      aspectRatio: width / height
    }
  }

  // Ângulo de rotação
  const deltaX = tr.center.x - tl.center.x
  const deltaY = tr.center.y - tl.center.y
  const angleRad = Math.atan2(deltaY, deltaX)
  const skewAngleDegrees = (angleRad * 180) / Math.PI

  const topWidth = Math.hypot(tr.center.x - tl.center.x, tr.center.y - tl.center.y)
  const leftHeight = Math.hypot(bl.center.x - tl.center.x, bl.center.y - tl.center.y)
  const aspectRatio = leftHeight > 0 ? topWidth / leftHeight : 1.0

  return {
    topLeft: tl.center,
    topRight: tr.center,
    bottomRight: br.center,
    bottomLeft: bl.center,
    isValid: true,
    skewAngleDegrees: Number(skewAngleDegrees.toFixed(2)),
    aspectRatio: Number(aspectRatio.toFixed(3))
  }
}
