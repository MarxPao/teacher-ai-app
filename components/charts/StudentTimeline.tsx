'use client'

import React, { useState } from 'react'
import { COLOR, FONT, TEXT, SPACE, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

// ─── Types ───────────────────────────────────────────────────────────────────

type EventType = 'grade' | 'feedback' | 'message' | 'attendance'

interface TimelineEvent {
  date: string
  type: EventType
  label: string
  value?: string | number
}

interface StudentTimelineProps {
  events: TimelineEvent[]
}

// ─── Config ──────────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<EventType, { color: string; bg: string; icon: string; label: string }> = {
  grade:      { color: COLOR.success,  bg: COLOR.successBg,  icon: 'ti-chart-bar', label: 'Nota' },
  feedback:   { color: COLOR.accent,   bg: COLOR.accentGlow, icon: 'ti-message-circle', label: 'Feedback' },
  message:    { color: COLOR.info,     bg: COLOR.infoBg,     icon: 'ti-mail',  label: 'Mensagem' },
  attendance: { color: COLOR.warning,  bg: COLOR.warningBg,  icon: 'ti-calendar-check', label: 'Frequência' },
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return dateStr
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StudentTimeline({ events }: StudentTimelineProps) {
  const [tooltip, setTooltip] = useState<{
    visible: boolean; x: number; y: number; event: TimelineEvent | null
  }>({ visible: false, x: 0, y: 0, event: null })

  // Sort by date ascending
  const sorted = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const DOT_SIZE = 36
  const COL_W = 88
  const LINE_H = 3

  if (sorted.length === 0) {
    return (
      <div style={{ padding: SPACE[6], textAlign: 'center', color: COLOR.paperMid,
        fontSize: TEXT.base, fontFamily: FONT.sans }}>
        Nenhum evento registrado.
      </div>
    )
  }

  return (
    <div style={{ fontFamily: FONT.sans, position: 'relative' }}>
      {/* Tooltip */}
      {tooltip.visible && tooltip.event && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          transform: 'translate(-50%, -100%)', background: COLOR.paperInk,
          color: COLOR.paperCream, borderRadius: RADIUS.md,
          padding: `${SPACE[2]}px ${SPACE[3]}px`, fontSize: TEXT.xs,
          fontFamily: FONT.sans, boxShadow: SHADOW.md, pointerEvents: 'none',
          zIndex: 9999, whiteSpace: 'nowrap', lineHeight: 1.6, maxWidth: 220,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2, whiteSpace: 'normal', maxWidth: 200 }}>
            {tooltip.event.label}
          </div>
          {tooltip.event.value !== undefined && (
            <div style={{ color: COLOR.paperLight, marginBottom: 2 }}>
              {String(tooltip.event.value)}
            </div>
          )}
          <div style={{ fontSize: 10, color: COLOR.paperMid }}>
            {formatDate(tooltip.event.date)}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: SPACE[4], marginBottom: SPACE[4], flexWrap: 'wrap' }}>
        {(Object.entries(EVENT_CONFIG) as [EventType, typeof EVENT_CONFIG[EventType]][]).map(([type, cfg]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ${cfg.icon}`} style={{ color: cfg.color, fontSize: 14 }} />
            <span style={{ fontSize: TEXT.xs, color: COLOR.paperWarm, fontWeight: 600 }}>
              {cfg.label}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable track */}
      <div style={{ overflowX: 'auto', paddingBottom: SPACE[4] }}>
        <div style={{ minWidth: sorted.length * COL_W + 32, position: 'relative' }}>
          {/* Horizontal line */}
          <div style={{
            position: 'absolute',
            top: DOT_SIZE / 2 + 16,
            left: COL_W / 2,
            right: COL_W / 2,
            height: LINE_H,
            background: `linear-gradient(90deg, ${BORDER.soft} 0%, ${BORDER.medium} 50%, ${BORDER.soft} 100%)`,
            borderRadius: RADIUS.full,
          }} />

          {/* Events */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, paddingTop: 16 }}>
            {sorted.map((evt, idx) => {
              const cfg = EVENT_CONFIG[evt.type]
              return (
                <div key={idx}
                  style={{ width: COL_W, flexShrink: 0, display: 'flex',
                    flexDirection: 'column', alignItems: 'center', gap: SPACE[2] }}>
                  {/* Dot */}
                  <div
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltip({ visible: true, x: rect.left + rect.width / 2, y: rect.top - 8, event: evt })
                    }}
                    onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                    style={{
                      width: DOT_SIZE, height: DOT_SIZE, borderRadius: RADIUS.full,
                      background: cfg.bg, border: `2px solid ${cfg.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, cursor: 'default', transition: TRANSITION.fast,
                      boxShadow: SHADOW.sm, zIndex: 1, position: 'relative',
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.15)'
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = SHADOW.md
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = ''
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = SHADOW.sm
                    }}
                  >
                    <i className={`ti ${cfg.icon}`} style={{ color: cfg.color, fontSize: 15 }} />
                  </div>

                  {/* Value badge */}
                  {evt.value !== undefined && (
                    <div style={{
                      background: cfg.bg, border: `1px solid ${cfg.color}`,
                      borderRadius: RADIUS.sm, padding: `1px ${SPACE[2]}px`,
                      fontSize: TEXT.xs, fontWeight: 700, color: cfg.color,
                      maxWidth: COL_W - 8, textAlign: 'center',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={String(evt.value)}>
                      {String(evt.value)}
                    </div>
                  )}

                  {/* Date */}
                  <div style={{ fontSize: 9, color: COLOR.paperMid, textAlign: 'center',
                    lineHeight: 1.2, maxWidth: COL_W - 8 }}>
                    {formatDate(evt.date)}
                  </div>

                  {/* Label */}
                  <div style={{ fontSize: 9, color: COLOR.paperWarm, textAlign: 'center',
                    lineHeight: 1.2, maxWidth: COL_W - 8,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  }} title={evt.label}>
                    {evt.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
