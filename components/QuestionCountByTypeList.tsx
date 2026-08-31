'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'

import React from 'react'

export interface QuestionTypeCountMap {
  multipleChoice: number
  discursive: number
  trueFalse: number
  gapFill: number
  matching: number
  readingText: number
  textProduction: number
}

export const DEFAULT_QUESTION_COUNTS: QuestionTypeCountMap = {
  multipleChoice: 4,
  discursive: 2,
  trueFalse: 2,
  gapFill: 2,
  matching: 0,
  readingText: 0,
  textProduction: 0
}

interface QuestionCountByTypeListProps {
  counts: QuestionTypeCountMap
  onChange: (newCounts: QuestionTypeCountMap) => void
}

const QUESTION_TYPE_SPECS = [
  { key: 'multipleChoice', label: 'Múltipla Escolha', sub: '4 alternativas (A-D)', icon: '⭕', color: '#268bd2' },
  { key: 'discursive', label: 'Dissertativa / Aberta', sub: 'Resposta dissertativa', icon: '✍️', color: '#b58900' },
  { key: 'trueFalse', label: 'Verdadeiro ou Falso', sub: 'Afirmações V ou F', icon: '🔘', color: '#2aa198' },
  { key: 'gapFill', label: 'Complete as Lacunas', sub: 'Fill-in-the-blanks', icon: '🔤', color: '#6c71c4' },
  { key: 'matching', label: 'Associação de Colunas', sub: 'Ligue as colunas', icon: '🔀', color: '#cb4b16' },
  { key: 'readingText', label: 'Interpretação de Texto', sub: 'Compreensão contextual', icon: '📖', color: '#859900' },
  { key: 'textProduction', label: 'Produção Textual', sub: 'Redação / escrita livre', icon: '📝', color: '#d33682' },
] as const

export function computeTotalQuestions(counts: QuestionTypeCountMap): number {
  return Object.values(counts).reduce((sum, n) => sum + (n || 0), 0)
}

export function buildQuestionDistributionPrompt(counts: QuestionTypeCountMap): string {
  const total = computeTotalQuestions(counts)
  if (total === 0) return 'QUANTIDADE TOTAL: Crie 10 questões equilibradas variando os formatos.'

  const parts: string[] = []
  if (counts.multipleChoice > 0) parts.push(`${counts.multipleChoice} de Múltipla Escolha (com 4 opções: A, B, C, D)`)
  if (counts.discursive > 0) parts.push(`${counts.discursive} Dissertativa(s) / Resposta Aberta`)
  if (counts.trueFalse > 0) parts.push(`${counts.trueFalse} de Verdadeiro ou Falso (V/F)`)
  if (counts.gapFill > 0) parts.push(`${counts.gapFill} de Complete as Lacunas (Gap Fill)`)
  if (counts.matching > 0) parts.push(`${counts.matching} de Associação / Correlação de Colunas`)
  if (counts.readingText > 0) parts.push(`${counts.readingText} de Leitura & Interpretação de Texto`)
  if (counts.textProduction > 0) parts.push(`${counts.textProduction} de Produção Textual / Redação Guiada`)

  return `\nDISTRIBUIÇÃO EXATA OBRIGATÓRIA DE QUESTÕES (Total: ${total} itens):\nCrie exatamente as seguintes quantidades por tipo, numeradas sequencialmente de 1 a ${total}:\n- ` + parts.join('\n- ') + '\n'
}

export default function QuestionCountByTypeList({ counts, onChange }: QuestionCountByTypeListProps) {
  const total = computeTotalQuestions(counts)

  const handleUpdate = (key: keyof QuestionTypeCountMap, delta: number) => {
    const current = counts[key] || 0
    const nextVal = Math.max(0, Math.min(30, current + delta))
    onChange({ ...counts, [key]: nextVal })
  }

  const handleSetExact = (key: keyof QuestionTypeCountMap, val: string) => {
    const parsed = parseInt(val)
    const nextVal = isNaN(parsed) ? 0 : Math.max(0, Math.min(30, parsed))
    onChange({ ...counts, [key]: nextVal })
  }

  const handleQuickPreset = (presetTotal: number) => {
    if (presetTotal === 5) {
      onChange({ multipleChoice: 3, discursive: 1, trueFalse: 1, gapFill: 0, matching: 0, readingText: 0, textProduction: 0 })
    } else if (presetTotal === 10) {
      onChange({ multipleChoice: 4, discursive: 2, trueFalse: 2, gapFill: 2, matching: 0, readingText: 0, textProduction: 0 })
    } else if (presetTotal === 15) {
      onChange({ multipleChoice: 6, discursive: 3, trueFalse: 3, gapFill: 2, matching: 1, readingText: 0, textProduction: 0 })
    } else if (presetTotal === 20) {
      onChange({ multipleChoice: 8, discursive: 4, trueFalse: 4, gapFill: 2, matching: 1, readingText: 1, textProduction: 0 })
    }
  }

  return (
    <div style={{ background: '#fdf8f2', padding: 14, borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.2)' }}>
      {/* Header com Total e Atalhos */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            🔢 Numerador de Questões por Tipo:
          </label>
          <span style={{ fontSize: TEXT.caption, color: '#8b5e3c' }}>
            Defina a quantidade exata de cada formato de exercício
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: '#8b5e3c', padding: '3px 10px', borderRadius: RADIUS.md }}>
            Total: {total} {total === 1 ? 'questão' : 'questões'}
          </span>
        </div>
      </div>

      {/* Atalhos Rápidos de Quantidade */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42' }}>Presets rápidos:</span>
        {[5, 10, 15, 20].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => handleQuickPreset(n)}
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              border: total === n ? '1px solid #8b5e3c' : '1px solid #d5c8bb',
              background: total === n ? '#8b5e3c' : '#fff',
              color: total === n ? '#fff' : '#2c1a0e',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {n} itens
          </button>
        ))}
      </div>

      {/* Grid de Contadores por Tipo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        {QUESTION_TYPE_SPECS.map(spec => {
          const count = counts[spec.key as keyof QuestionTypeCountMap] || 0
          const isActive = count > 0

          return (
            <div
              key={spec.key}
              style={{
                background: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                border: isActive ? `1px solid ${spec.color}60` : '1px solid #e8e0d0',
                borderRadius: RADIUS.md,
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.03)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 15 }}>{spec.icon}</span>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {spec.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#665c54' }}>
                    {spec.sub}
                  </div>
                </div>
              </div>

              {/* Stepper +/- */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => handleUpdate(spec.key as keyof QuestionTypeCountMap, -1)}
                  disabled={count === 0}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: '1px solid #d5c8bb',
                    background: count === 0 ? '#f5efe6' : '#fff',
                    color: count === 0 ? '#b0a090' : '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: count === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  -
                </button>

                <input
                  type="number"
                  min="0"
                  max="30"
                  value={count}
                  onChange={e => handleSetExact(spec.key as keyof QuestionTypeCountMap, e.target.value)}
                  style={{
                    width: 32,
                    padding: '2px',
                    borderRadius: 6,
                    border: '1px solid #d5c8bb',
                    background: isActive ? '#fff' : '#faf6f0',
                    fontSize: 12,
                    fontWeight: 800,
                    textAlign: 'center',
                    color: isActive ? spec.color : '#665c54',
                    outline: 'none'
                  }}
                />

                <button
                  type="button"
                  onClick={() => handleUpdate(spec.key as keyof QuestionTypeCountMap, 1)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: '1px solid #d5c8bb',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
