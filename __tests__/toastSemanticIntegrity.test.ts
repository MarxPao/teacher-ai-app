import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Global Toast Semantic Integrity Audit', () => {
  const rootDir = path.resolve(__dirname, '..')

  it('1. Garante que nenhuma ocorrencia de toast.success para mensagens de erro/falha/alerta permaneceu no codigo', () => {
    const errorKeywords = [
      'erro', 'falha', 'selecione', 'configure', 'preencha', 'inválid', 'invalido',
      'invalida', 'nenhum', 'nenhuma', 'obrigatori', 'digite', 'insira',
      'não foi', 'impossível', 'não encontrado'
    ]

    const filesToScan: string[] = []

    function scan(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (['node_modules', '.git', '.next'].includes(entry.name)) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scan(full)
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          filesToScan.push(full)
        }
      }
    }

    scan(path.join(rootDir, 'components'))
    scan(path.join(rootDir, 'lib'))
    scan(path.join(rootDir, 'app'))

    const violations: string[] = []

    for (const file of filesToScan) {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        if (line.includes('toast.success(')) {
          const lower = line.toLowerCase()
          if (errorKeywords.some(kw => lower.includes(kw))) {
            violations.push(`${path.relative(rootDir, file)}:${idx + 1} -> ${line.trim()}`)
          }
        }
      })
    }

    expect(violations).toEqual([])
  })
})
