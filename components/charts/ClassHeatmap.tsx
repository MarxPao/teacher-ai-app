'use client'

import React, { useState } from 'react'
import { COLOR, FONT, TEXT, SPACE, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

interface Student { id: string; name: string }
interface Assessment { id: string; title: string }

interface ClassHeatmapProps {
  students: Student[]
  assessments: Assessment[]
  /** grades[studentId][assessmentId] = number (0–10) */
  grades: Record<string, Record<string, number>>
  onCellClick?: (studentId: string, assessmentId: string) => void
}

interface TooltipState {
  visible: boolean
  x: number; y: number
  studentName: string
  assessmentTitle: string
  grade: number | null
}

/** Interpola cor entre vermelho (<6), amarelo (6–7.9) e verde (>=8) */
function gradeToColor(grade: number | null): string {
  if (grade === null || grade === undefined) return 'rgba(160,128,96,0.12)'
  if (grade < 6) {
    const t = Math.max(0, grade / 6)
    const r = Math.round(168 + t * 30)
    const g = Math.round(50 + t * 40)
    const b = Math.round(50 + t * 10)
    return `rgba(${r},${g},${b},0.78)`
  }
  if (grade < 8) {
    const t = (grade - 6) / 2
    const r = Math.round(200 + t * 20)
    const g = Math.round(122 + t * 50)
    const b = Math.round(30 + t * 10)
    return `rgba(${r},${g},${b},0.80)`
  }
  const t = (grade - 8) / 2
  const r = Math.round(61 - t * 10)
  const g = Math.round(122 + t * 30)
  const b = Math.round(78 - t * 10)
  return `rgba(${r},${g},${b},0.82)`
}

function gradeToTextColor(grade: number | null): string {
  if (grade === null) return COLOR.paperMid
  if (grade < 6) return '#fff'
  if (grade < 8) return '#3a2a00'
  return '#fff'
}

export default function ClassHeatmap({ students, assessments, grades, onCellClick }: ClassHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, studentName: '', assessmentTitle: '', grade: null,
  })

  const CELL_W = 56, CELL_H = 40, NAME_COL_W = 160, HEADER_H = 72

  function handleMouseEnter(
    e: React.MouseEvent<HTMLDivElement>,
    student: Student, assessment: Assessment, grade: number | null,
  ) {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ visible: true, x: rect.left + rect.width / 2, y: rect.top - 10,
      studentName: student.name, assessmentTitle: assessment.title, grade })
  }
  function handleMouseLeave() { setTooltip((t) => ({ ...t, visible: false })) }

  const studentAverages: Record<string, number | null> = {}
  for (const student of students) {
    const vals = assessments.map((a) => grades[student.id]?.[a.id]).filter((v) => v != null) as number[]
    studentAverages[student.id] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }
  const assessmentAverages: Record<string, number | null> = {}
  for (const assessment of assessments) {
    const vals = students.map((s) => grades[s.id]?.[assessment.id]).filter((v) => v != null) as number[]
    assessmentAverages[assessment.id] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }

  const totalW = NAME_COL_W + (assessments.length + 1) * (CELL_W + 2) + 2

  const cellStyle = (grade: number | null, extra?: React.CSSProperties): React.CSSProperties => ({
    width: CELL_W, height: CELL_H, flexShrink: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: gradeToColor(grade), margin: '1px', borderRadius: RADIUS.sm,
    fontSize: TEXT.sm, fontWeight: 700, color: gradeToTextColor(grade),
    ...extra,
  })

  return (
    <div style={{ position: 'relative', fontFamily: FONT.sans }}>
      {tooltip.visible && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          transform: 'translate(-50%, -100%)', background: COLOR.paperInk,
          color: COLOR.paperCream, borderRadius: RADIUS.md,
          padding: `${SPACE[2]}px ${SPACE[3]}px`, fontSize: TEXT.xs,
          fontFamily: FONT.sans, boxShadow: SHADOW.md, pointerEvents: 'none',
          zIndex: 9999, whiteSpace: 'nowrap', lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{tooltip.studentName}</div>
          <div style={{ color: COLOR.paperLight, marginBottom: 2 }}>{tooltip.assessmentTitle}</div>
          <div style={{ fontWeight: 700, fontSize: TEXT.md }}>
            {tooltip.grade !== null ? tooltip.grade.toFixed(1) : '—'}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[4], marginBottom: SPACE[3], flexWrap: 'wrap' }}>
        {([
          { color: gradeToColor(3), label: '< 6 (Abaixo)' },
          { color: gradeToColor(7), label: '6–7.9 (Regular)' },
          { color: gradeToColor(9), label: '≥ 8 (Bom)' },
          { color: gradeToColor(null), label: 'Sem nota' },
        ] as const).map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: RADIUS.sm, background: color, border: `1px solid ${BORDER.soft}` }} />
            <span style={{ fontSize: TEXT.xs, color: COLOR.paperWarm }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: SPACE[2] }}>
        <div style={{ minWidth: totalW }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: NAME_COL_W, flexShrink: 0, height: HEADER_H }} />
            {assessments.map((a) => (
              <div key={a.id} style={{ width: CELL_W, flexShrink: 0, height: HEADER_H,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                padding: `0 2px ${SPACE[2]}px`, boxSizing: 'border-box' }}>
                <span style={{ fontSize: TEXT.xs, fontWeight: 700, color: COLOR.paperSepia,
                  writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
                  maxHeight: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={a.title}>{a.title}</span>
              </div>
            ))}
            <div style={{ width: CELL_W, flexShrink: 0, height: HEADER_H,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: `0 2px ${SPACE[2]}px` }}>
              <span style={{ fontSize: TEXT.xs, fontWeight: 700, color: COLOR.accent,
                writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>Média</span>
            </div>
          </div>

          {/* Rows */}
          {students.map((student, sIdx) => (
            <div key={student.id} style={{ display: 'flex', alignItems: 'center',
              background: sIdx % 2 === 0 ? 'transparent' : 'rgba(139,94,60,0.03)' }}>
              <div style={{ width: NAME_COL_W, flexShrink: 0, height: CELL_H,
                display: 'flex', alignItems: 'center', paddingRight: SPACE[3], boxSizing: 'border-box' }}>
                <span style={{ fontSize: TEXT.sm, color: COLOR.paperInk, fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={student.name}>{student.name}</span>
              </div>
              {assessments.map((assessment) => {
                const grade = grades[student.id]?.[assessment.id] ?? null
                return (
                  <div key={assessment.id} className="heatmap-cell"
                    onClick={() => onCellClick?.(student.id, assessment.id)}
                    onMouseEnter={(e) => handleMouseEnter(e, student, assessment, grade)}
                    onMouseLeave={handleMouseLeave}
                    style={{ ...cellStyle(grade), cursor: onCellClick ? 'pointer' : 'default', transition: TRANSITION.fast }}
                    onMouseOver={(e) => { if (onCellClick) { (e.currentTarget as HTMLDivElement).style.filter = 'brightness(1.12)'; (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.07)' }}}
                    onMouseOut={(e) => { (e.currentTarget as HTMLDivElement).style.filter = ''; (e.currentTarget as HTMLDivElement).style.transform = '' }}>
                    {grade !== null ? grade.toFixed(1) : '—'}
                  </div>
                )
              })}
              <div style={{ ...cellStyle(studentAverages[student.id], { border: `1px solid ${BORDER.medium}`, fontWeight: 800 }) }}>
                {studentAverages[student.id] !== null ? studentAverages[student.id]!.toFixed(1) : '—'}
              </div>
            </div>
          ))}

          {/* Footer averages */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 4,
            borderTop: `1px solid ${BORDER.medium}`, paddingTop: 4 }}>
            <div style={{ width: NAME_COL_W, flexShrink: 0, height: CELL_H,
              display: 'flex', alignItems: 'center', paddingRight: SPACE[3] }}>
              <span style={{ fontSize: TEXT.xs, fontWeight: 700, color: COLOR.paperWarm,
                textTransform: 'uppercase', letterSpacing: '0.6px' }}>Média turma</span>
            </div>
            {assessments.map((a) => (
              <div key={a.id} style={{ ...cellStyle(assessmentAverages[a.id], { border: `1px solid ${BORDER.soft}` }) }}>
                {assessmentAverages[a.id] !== null ? assessmentAverages[a.id]!.toFixed(1) : '—'}
              </div>
            ))}
            {(() => {
              const all = Object.values(grades).flatMap((row) => Object.values(row)).filter((v) => v != null) as number[]
              const overall = all.length > 0 ? all.reduce((s, v) => s + v, 0) / all.length : null
              return (
                <div style={{ ...cellStyle(overall, { border: `1.5px solid ${BORDER.strong}`, fontWeight: 800 }) }}>
                  {overall !== null ? overall.toFixed(1) : '—'}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
