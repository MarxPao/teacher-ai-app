'use client'

import React from 'react'
import { COLOR, FONT, TEXT, SPACE, RADIUS, SHADOW, BORDER, S } from '@/styles/tokens'

interface EmptyStateProps {
  /** Tabler icon class, e.g. 'ti-inbox' */
  icon?: string
  /** Emoji displayed instead of SVG/icon when provided */
  emoji?: string
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

/**
 * Estado vazio reutilizável (#5).
 * Exibe uma ilustração SVG inline (folha de papel com linhas), título e
 * descrição centralizados, além de um botão de ação opcional.
 */
export default function EmptyState({ icon, emoji, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `60px ${SPACE[6]}px`,
        textAlign: 'center',
        gap: SPACE[4],
      }}
    >
      {/* Illustration */}
      <div style={{ marginBottom: SPACE[2] }}>
        {emoji ? (
          <span style={{ fontSize: 56, lineHeight: 1 }}>{emoji}</span>
        ) : icon ? (
          <i
            className={`ti ${icon}`}
            style={{ fontSize: 52, color: COLOR.accentLight, opacity: 0.7 }}
          />
        ) : (
          /* Inline SVG: folha de papel com linhas */
          <svg
            width="72"
            height="88"
            viewBox="0 0 72 88"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Paper body */}
            <rect
              x="6"
              y="4"
              width="60"
              height="80"
              rx="6"
              fill={COLOR.accentGlow}
              stroke={COLOR.accentLight}
              strokeWidth="1.5"
              opacity="0.6"
            />
            {/* Folded corner */}
            <path
              d="M46 4 L66 24 L46 24 Z"
              fill={COLOR.surface3 ?? '#ede4d6'}
              stroke={COLOR.accentLight}
              strokeWidth="1.5"
              opacity="0.8"
            />
            {/* Lines */}
            {[36, 48, 58, 68].map((y, i) => (
              <rect
                key={i}
                x="16"
                y={y}
                width={i === 3 ? 24 : 40}
                height="4"
                rx="2"
                fill={COLOR.accentLight}
                opacity={0.3 + i * 0.05}
              />
            ))}
            {/* Pen decoration */}
            <line
              x1="16"
              y1="28"
              x2="42"
              y2="28"
              stroke={COLOR.accentLight}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.4"
            />
          </svg>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: FONT.display,
          fontSize: TEXT['2xl'],
          fontWeight: 600,
          color: COLOR.paperInk,
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        style={{
          fontFamily: FONT.sans,
          fontSize: TEXT.base,
          color: COLOR.paperWarm,
          maxWidth: 380,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {description}
      </p>

      {/* Optional Action Button */}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            ...S.btnPrimary,
            marginTop: SPACE[2],
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
