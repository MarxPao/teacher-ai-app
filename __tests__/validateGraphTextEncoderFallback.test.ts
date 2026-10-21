import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { validateGraph, type SkillGraphV2 } from '../lib/contracts/skillgraph'

describe('Validação de Grafo com Fallback TextEncoder (Buffer Indefinido)', () => {
  const examplePath = path.resolve(__dirname, '../contracts/examples/read_roster.json')
  const baseGraph: SkillGraphV2 = JSON.parse(fs.readFileSync(examplePath, 'utf-8'))

  // Grafo com campo inflado para ultrapassar 256KB
  const largeGraph: SkillGraphV2 = {
    ...baseGraph,
    identity: {
      ...baseGraph.identity,
      description: 'X'.repeat(270 * 1024) // ~270 KB
    }
  }

  it('com Buffer indefinido, validateGraph retorna o mesmo veredito e E_LIMITS para grafo pequeno e >256KB', () => {
    const originalBuffer = globalThis.Buffer

    try {
      // 1. Execução padrão com Buffer definido
      const reportSmallWithBuffer = validateGraph(baseGraph)
      const reportLargeWithBuffer = validateGraph(largeGraph)

      expect(reportSmallWithBuffer.valid).toBe(true)
      expect(reportLargeWithBuffer.valid).toBe(false)
      expect(reportLargeWithBuffer.errors.some(e => e.code === 'E_LIMITS' && e.message.includes('256 KB'))).toBe(true)

      // 2. Simula ambiente do browser onde Buffer não existe
      ;(globalThis as any).Buffer = undefined

      const reportSmallNoBuffer = validateGraph(baseGraph)
      const reportLargeNoBuffer = validateGraph(largeGraph)

      // Veredito idêntico para grafo pequeno
      expect(reportSmallNoBuffer.valid).toBe(reportSmallWithBuffer.valid)
      expect(reportSmallNoBuffer.errors).toEqual(reportSmallWithBuffer.errors)

      // Veredito idêntico e mesmo código E_LIMITS para grafo >256KB
      expect(reportLargeNoBuffer.valid).toBe(false)
      expect(reportLargeNoBuffer.errors.some(e => e.code === 'E_LIMITS' && e.message.includes('256 KB'))).toBe(true)
      expect(reportLargeNoBuffer.errors).toEqual(reportLargeWithBuffer.errors)
    } finally {
      // Restaura Buffer
      ;(globalThis as any).Buffer = originalBuffer
    }
  })
})
