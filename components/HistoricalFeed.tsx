'use client'

import React from 'react'
import { FONT, RADIUS } from '@/styles/tokens'

export interface HistoricalItem {
  id: string
  date: string
  time?: string
  module: string
  title: string
  description?: string
  studentName?: string
  grade?: number
  type: 'exam' | 'essay' | 'comm' | 'lesson' | 'feedback'
}

interface HistoricalFeedProps {
  items: HistoricalItem[]
  title?: string
  onItemClick?: (item: HistoricalItem) => void
}

const TYPE_CONFIG = {
  exam: { icon: 'ti-file-certificate', color: '#2a6080', label: 'Prova / Exercício' },
  essay: { icon: 'ti-camera', color: '#8b5e3c', label: 'Correção Omni' },
  comm: { icon: 'ti-brand-whatsapp', color: '#25D366', label: 'Mensagem aos Pais' },
  lesson: { icon: 'ti-chalkboard', color: '#6a2a7a', label: 'Plano de Aula' },
  feedback: { icon: 'ti-bulb', color: '#c87a1e', label: 'Feedback Individual' },
}

/**
 * Feed Cronológico de Gerações e Histórico Pedagógico (#13).
 */
export default function HistoricalFeed({
  items,
  title = 'Dossiê & Linha do Tempo Pedagógica',
  onItemClick,
}: HistoricalFeedProps) {
  if (!items || items.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#7a5c42', fontSize: 13 }}>
        Nenhuma atividade recente registrada neste perfil.
      </div>
    )
  }

  return (
    <div
      style={{
        background: '#fffcf8',
        border: '1px solid rgba(139,115,85,0.14)',
        borderRadius: RADIUS.lg,
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <i className="ti ti-history" style={{ fontSize: 18, color: '#8b5e3c' }} />
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2c1a0e', fontFamily: FONT.display }}>
          {title}
        </h4>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
        {/* Linha vertical central */}
        <div
          style={{
            position: 'absolute',
            left: 17,
            top: 10,
            bottom: 10,
            width: 2,
            background: 'rgba(139,115,85,0.15)',
            zIndex: 0,
          }}
        />

        {items.map((item) => {
          const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.exam
          return (
            <div
              key={item.id}
              onClick={() => onItemClick?.(item)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                position: 'relative',
                zIndex: 1,
                cursor: onItemClick ? 'pointer' : 'default',
              }}
            >
              {/* Ponto na timeline */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#fff',
                  border: `2px solid ${cfg.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: cfg.color,
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                }}
              >
                <i className={`ti ${cfg.icon}`} style={{ fontSize: 16 }} />
              </div>

              {/* Card de Informação */}
              <div
                style={{
                  flex: 1,
                  background: '#fcfaf7',
                  border: '1px solid rgba(139,115,85,0.12)',
                  borderRadius: RADIUS.md,
                  padding: '10px 14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase' }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#a08060' }}>
                    {item.date} {item.time ? `&bull; ${item.time}` : ''}
                  </span>
                </div>

                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c1a0e', marginBottom: 2 }}>
                  {item.title}
                </div>

                {item.description && (
                  <p style={{ margin: 0, fontSize: 12.5, color: '#5c3d20', lineHeight: 1.4 }}>
                    {item.description}
                  </p>
                )}

                {item.grade !== undefined && (
                  <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: 'rgba(61,122,78,0.1)', color: '#3d7a4e', fontWeight: 800, fontSize: 12 }}>
                    Nota: {item.grade.toFixed(1)}/10
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
