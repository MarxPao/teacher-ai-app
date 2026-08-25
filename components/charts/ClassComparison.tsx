'use client'

import React from 'react'
import { COLOR, FONT, RADIUS } from '@/styles/tokens'

export interface ClassAverageItem {
  id: string
  name: string
  average: number
  studentCount?: number
  color?: string
}

interface ClassComparisonProps {
  assessmentTitle: string
  classes: ClassAverageItem[]
  maxGrade?: number
}

/**
 * Gráfico comparativo de médias entre turmas (#23).
 */
export default function ClassComparison({
  assessmentTitle,
  classes,
  maxGrade = 10,
}: ClassComparisonProps) {
  if (!classes || classes.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#7a5c42', fontSize: 13 }}>
        Nenhuma turma cadastrada para comparação.
      </div>
    )
  }

  const overallAvg = classes.reduce((acc, c) => acc + c.average, 0) / classes.length
  const topClass = [...classes].sort((a, b) => b.average - a.average)[0]

  return (
    <div
      style={{
        background: '#fffcf8',
        border: '1px solid rgba(139,115,85,0.16)',
        borderRadius: RADIUS.lg,
        padding: '24px',
        boxShadow: '0 2px 10px rgba(44,26,14,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3
            style={{
              fontFamily: FONT.display,
              fontSize: 18,
              fontWeight: 700,
              color: '#2c1a0e',
              margin: '0 0 4px',
            }}
          >
            Comparativo de Turmas
          </h3>
          <span style={{ fontSize: 12.5, color: '#7a5c42' }}>
            Avaliação: <strong>{assessmentTitle}</strong> &bull; Média Geral: <strong>{overallAvg.toFixed(1)}/{maxGrade}</strong>
          </span>
        </div>
        {topClass && (
          <div
            style={{
              padding: '6px 12px',
              background: 'rgba(61,122,78,0.10)',
              border: '1px solid rgba(61,122,78,0.25)',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              color: '#3d7a4e',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🏆 Maior Média: {topClass.name} ({topClass.average.toFixed(1)})
          </div>
        )}
      </div>

      {/* Grid de Barras Verticais */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          height: 180,
          paddingBottom: 28,
          borderBottom: '2px solid rgba(139,115,85,0.15)',
          gap: 16,
          position: 'relative',
        }}
      >
        {/* Linha da Média Geral */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 28 + (overallAvg / maxGrade) * 140,
            borderTop: '1.5px dashed rgba(196,131,74,0.6)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              right: 0,
              top: -16,
              fontSize: 10.5,
              fontWeight: 700,
              color: '#c4834a',
              background: '#fffcf8',
              padding: '1px 6px',
              borderRadius: 4,
            }}
          >
            Média Geral ({overallAvg.toFixed(1)})
          </span>
        </div>

        {classes.map((cls) => {
          const heightPct = Math.min(100, Math.max(8, (cls.average / maxGrade) * 100))
          const isTop = topClass && cls.id === topClass.id
          const barColor = cls.color || (isTop ? '#8b5e3c' : cls.average >= 7 ? '#2a6080' : cls.average >= 5 ? '#c87a1e' : '#a83232')

          return (
            <div
              key={cls.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                maxWidth: 64,
                height: '100%',
                justifyContent: 'flex-end',
                position: 'relative',
              }}
            >
              {/* Badge de Nota */}
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: barColor,
                  marginBottom: 6,
                }}
              >
                {cls.average.toFixed(1)}
              </span>

              {/* Barra */}
              <div
                style={{
                  width: '100%',
                  height: `${(cls.average / maxGrade) * 140}px`,
                  background: `linear-gradient(180deg, ${barColor}, ${barColor}cc)`,
                  borderRadius: '6px 6px 0 0',
                  boxShadow: isTop ? '0 4px 12px rgba(139,94,60,0.3)' : 'none',
                  transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                }}
              />

              {/* Nome da Turma */}
              <span
                style={{
                  position: 'absolute',
                  bottom: -22,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#5c3d20',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 70,
                  textAlign: 'center',
                }}
                title={cls.name}
              >
                {cls.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
