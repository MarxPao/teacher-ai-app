'use client'

import React from 'react'
import { COLOR, RADIUS, SPACE } from '@/styles/tokens'

// ─── SkeletonText ────────────────────────────────────────────────────────────

interface SkeletonTextProps {
  /** Number of text lines to render. Default: 3 */
  lines?: number
  /** Width for each line, e.g. ['80%', '60%', '45%']. Cycles if fewer than lines. */
  widths?: string[]
}

/** Renders N shimmer text lines with configurable widths. */
export function SkeletonText({ lines = 3, widths = ['80%', '60%', '45%'] }: SkeletonTextProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  )
}

// ─── SkeletonCard ────────────────────────────────────────────────────────────

/**
 * Card skeleton: avatar circle + 3 text lines.
 */
export function SkeletonCard() {
  return (
    <div
      className="skeleton-card"
      style={{
        display: 'flex',
        gap: SPACE[4],
        alignItems: 'flex-start',
        background: COLOR.surface1,
        border: `1px solid ${COLOR.paperCream ?? '#f5efe6'}`,
        borderRadius: RADIUS.lg,
        padding: SPACE[6],
      }}
    >
      {/* Avatar circle */}
      <div
        className="skeleton skeleton-circle"
        style={{ width: 44, height: 44, flexShrink: 0 }}
      />

      {/* Lines */}
      <div style={{ flex: 1 }}>
        <SkeletonText lines={3} widths={['70%', '50%', '35%']} />
      </div>
    </div>
  )
}

// ─── SkeletonList ────────────────────────────────────────────────────────────

/**
 * List skeleton: 5 rows with varying widths.
 */
export function SkeletonList() {
  const widths = ['90%', '75%', '60%', '80%', '50%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {widths.map((w, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: w, height: 16 }}
        />
      ))}
    </div>
  )
}

// ─── SkeletonTable ───────────────────────────────────────────────────────────

const COL_WIDTHS = ['30%', '20%', '25%', '25%']

function SkeletonTableRow({ isHeader = false }: { isHeader?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: SPACE[3],
        padding: `${SPACE[3]}px ${SPACE[4]}px`,
        background: isHeader ? COLOR.surface2 : 'transparent',
        borderRadius: isHeader ? RADIUS.sm : 0,
        borderBottom: isHeader ? 'none' : `1px solid rgba(139,115,85,0.08)`,
        alignItems: 'center',
      }}
    >
      {COL_WIDTHS.map((w, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{
            flex: `0 0 ${w}`,
            width: w,
            height: isHeader ? 14 : 12,
            opacity: isHeader ? 0.9 : 0.6,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Table skeleton: 1 header row + 4 data rows.
 */
export function SkeletonTable() {
  return (
    <div
      style={{
        border: `1px solid rgba(139,115,85,0.12)`,
        borderRadius: RADIUS.md,
        overflow: 'hidden',
        background: COLOR.surface1,
      }}
    >
      <SkeletonTableRow isHeader />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonTableRow key={i} />
      ))}
    </div>
  )
}

// ─── Default export convenience ──────────────────────────────────────────────

/** Re-export all variants as named exports + default namespace. */
const SkeletonLoader = { SkeletonCard, SkeletonList, SkeletonTable, SkeletonText }
export default SkeletonLoader
