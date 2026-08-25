'use client'

import React from 'react'
import { COLOR, FONT, TEXT, SPACE, RADIUS, BORDER } from '@/styles/tokens'

interface Dimension {
  label: string
  value: number
  max?: number
}

interface StudentRadarChartProps {
  studentName: string
  dimensions: Dimension[]
}

const SVG_SIZE = 240
const CENTER = SVG_SIZE / 2
const RADIUS_MAX = 90
const LEVELS = 5

function polarToXY(angle: number, r: number): { x: number; y: number } {
  // 0 = top, clockwise
  const rad = (angle - 90) * (Math.PI / 180)
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) }
}

function buildPolygonPoints(values: number[], maxValues: number[]): string {
  const n = values.length
  return values
    .map((v, i) => {
      const angle = (360 / n) * i
      const ratio = Math.min(1, Math.max(0, v / (maxValues[i] || 10)))
      const { x, y } = polarToXY(angle, ratio * RADIUS_MAX)
      return `${x},${y}`
    })
    .join(' ')
}

function buildMaxPolygonPoints(n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const { x, y } = polarToXY((360 / n) * i, RADIUS_MAX)
    return `${x},${y}`
  }).join(' ')
}

export default function StudentRadarChart({ studentName, dimensions }: StudentRadarChartProps) {
  const n = dimensions.length || 5
  const maxValues = dimensions.map((d) => d.max ?? 10)
  const values = dimensions.map((d) => d.value)
  const studentPoints = buildPolygonPoints(values, maxValues)
  const maxPoints = buildMaxPolygonPoints(n)

  return (
    <div style={{ fontFamily: FONT.sans, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        style={{ overflow: 'visible' }}
        aria-label={`Radar chart para ${studentName}`}
      >
        {/* Grid levels */}
        {Array.from({ length: LEVELS }, (_, lvl) => {
          const r = ((lvl + 1) / LEVELS) * RADIUS_MAX
          const pts = buildMaxPolygonPoints(n)
            .split(' ')
            .map((pt) => {
              const [px, py] = pt.split(',').map(Number)
              const ratio = r / RADIUS_MAX
              const nx = CENTER + (px - CENTER) * ratio
              const ny = CENTER + (py - CENTER) * ratio
              return `${nx},${ny}`
            })
            .join(' ')
          return (
            <polygon key={lvl} points={pts}
              fill="none" stroke={BORDER.soft} strokeWidth={1} />
          )
        })}

        {/* Axis lines */}
        {dimensions.map((_, i) => {
          const { x, y } = polarToXY((360 / n) * i, RADIUS_MAX)
          return (
            <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y}
              stroke={BORDER.soft} strokeWidth={1} />
          )
        })}

        {/* Max area (gray) */}
        <polygon points={maxPoints}
          fill="rgba(160,128,96,0.08)" stroke={BORDER.medium} strokeWidth={1} />

        {/* Student area */}
        <polygon points={studentPoints}
          fill={`rgba(139,94,60,0.22)`} stroke={COLOR.accent} strokeWidth={2} />

        {/* Student value dots */}
        {values.map((v, i) => {
          const ratio = Math.min(1, Math.max(0, v / (maxValues[i] || 10)))
          const { x, y } = polarToXY((360 / n) * i, ratio * RADIUS_MAX)
          return (
            <circle key={i} cx={x} cy={y} r={4}
              fill={COLOR.accent} stroke={COLOR.paperWhite} strokeWidth={2} />
          )
        })}

        {/* Axis labels */}
        {dimensions.map((dim, i) => {
          const angle = (360 / n) * i
          const { x, y } = polarToXY(angle, RADIUS_MAX + 22)
          const isLeft = x < CENTER - 5
          const isRight = x > CENTER + 5
          const anchor = isLeft ? 'end' : isRight ? 'start' : 'middle'
          return (
            <text key={i} x={x} y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={TEXT.xs}
              fontFamily={FONT.sans}
              fontWeight={600}
              fill={COLOR.paperSepia}
            >
              {dim.label}
            </text>
          )
        })}

        {/* Level value labels on first axis */}
        {Array.from({ length: LEVELS }, (_, lvl) => {
          const val = ((lvl + 1) / LEVELS) * (maxValues[0] || 10)
          const r = ((lvl + 1) / LEVELS) * RADIUS_MAX
          const { x, y } = polarToXY(0, r)
          return (
            <text key={lvl} x={x + 4} y={y}
              fontSize={8} fontFamily={FONT.sans}
              fill={COLOR.paperMid} textAnchor="start" dominantBaseline="middle">
              {Math.round(val)}
            </text>
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{
        marginTop: SPACE[4], display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(n, 3)}, 1fr)`,
        gap: `${SPACE[2]}px ${SPACE[4]}px`,
        width: '100%', maxWidth: SVG_SIZE + 40,
      }}>
        {dimensions.map((dim, i) => {
          const ratio = dim.value / (dim.max ?? 10)
          const pct = Math.round(ratio * 100)
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: TEXT.xs, color: COLOR.paperSepia, fontWeight: 600 }}>
                  {dim.label}
                </span>
                <span style={{ fontSize: TEXT.xs, fontWeight: 800, color: COLOR.accent }}>
                  {dim.value}/{dim.max ?? 10}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: RADIUS.full, background: BORDER.soft, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: RADIUS.full,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${COLOR.accentGold} 0%, ${COLOR.accent} 100%)`,
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
