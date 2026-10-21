import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Passo 3: Linguagem Ética e Anti-Rotulação Pedagógica', () => {
  const INSIGHTS_FILES = [
    'components/modules/Insights.tsx',
    'lib/predictiveAnalytics.ts',
    'lib/insightsPrivacyService.ts',
    'lib/pedagogicalInsights.ts',
    'components/modules/SmartInsightsPanel.tsx',
    'lib/insights/insightEngineV1.ts'
  ]

  const PROHIBITED_TERMS = [
    { term: 'déficit', regex: /\bd[eé]ficit\b/i },
    { term: 'laudo', regex: /\blaudo\b/i },
    { term: 'dislexia', regex: /\bdislexia\b/i },
    { term: 'TDAH', regex: /\btdah\b/i },
    { term: 'superdotado', regex: /\bsuperdotad[oa]s?\b/i }
  ]

  // Exceções permitidas: estritamente em contexto documental de PEI/PDI
  const isPeiPdiContext = (line: string): boolean => {
    const l = line.toLowerCase()
    return l.includes('pei') || l.includes('pdi') || l.includes('plano de desenvolvimento individual')
  }

  it('Varre módulos de insights e prompts e falha se houver termos clínicos ou rotuladores', () => {
    const violations: Array<{ file: string; line: number; term: string; snippet: string }> = []

    for (const relPath of INSIGHTS_FILES) {
      const fullPath = path.resolve(process.cwd(), relPath)
      if (!fs.existsSync(fullPath)) continue

      const content = fs.readFileSync(fullPath, 'utf8')
      const lines = content.split(/\r?\n/)

      lines.forEach((lineText, idx) => {
        // Ignora contexto explícito de PEI/PDI
        if (isPeiPdiContext(lineText)) return

        for (const { term, regex } of PROHIBITED_TERMS) {
          if (regex.test(lineText)) {
            violations.push({
              file: relPath,
              line: idx + 1,
              term,
              snippet: lineText.trim()
            })
          }
        }
      })
    }

    if (violations.length > 0) {
      const details = violations.map(v => `${v.file}:${v.line} [${v.term}] -> "${v.snippet}"`).join('\n')
      expect.fail(`Termos clínicos ou rotuladores encontrados nos módulos de insights:\n${details}`)
    }

    expect(violations.length).toBe(0)
  })

  it('Verifica que predictiveAnalytics descreve desempenho em avaliações e não déficit do aluno', async () => {
    const { calculateStudentCompositeRisk } = await import('@/lib/predictiveAnalytics')
    const mockMemory: any = {
      studentId: 'st_1',
      studentName: 'Ana Clara',
      examHistory: [
        { examId: 'e1', examTitle: 'Avaliação 1', score: 3.0, maxScore: 10, date: '2026-03-01' },
        { examId: 'e2', examTitle: 'Avaliação 2', score: 4.0, maxScore: 10, date: '2026-03-15' }
      ],
      attendance: { presenceRate: 70, consecutiveAbsences: 0 },
      qualitativeObservations: []
    }
    const analysis = calculateStudentCompositeRisk(mockMemory)
    const academicComponent = analysis.componentContributions.find(c => c.key === 'academic')
    expect(academicComponent).toBeDefined()
    expect(academicComponent?.label).not.toContain('Déficit')
    expect(academicComponent?.label).toBe('Desempenho em Avaliações (A)')
  })
})
