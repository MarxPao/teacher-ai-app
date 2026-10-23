'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  generateExpressClassroomActivity,
  getExpressWarmupModalityOptions,
  type ExpressWarmupModality,
  type ExpressWarmupActivity
} from '@/lib/expressWarmupGenerator'
import { exportToPdf, exportToWord } from '@/lib/exportUtils'
import { getDefaultFormatForSchool } from '@/lib/documentFormatTemplates'
import { RADIUS, SHADOW } from '@/styles/tokens'

interface ExpressWarmupModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTopic?: string
  defaultGrade?: string
  defaultBnccCodes?: string[]
}

export default function ExpressWarmupModal({
  isOpen,
  onClose,
  defaultTopic = 'Greetings, Routine & Vocabulary in Context',
  defaultGrade = '6º Ano',
  defaultBnccCodes = ['EF06LI01', 'EF06LI08', 'EF06LI16']
}: ExpressWarmupModalProps) {
  const [modality, setModality] = useState<ExpressWarmupModality>('music_movement')
  const [durationMinutes, setDurationMinutes] = useState<5 | 10 | 15>(10)
  const [topic, setTopic] = useState<string>(defaultTopic)
  const [grade, setGrade] = useState<string>(defaultGrade)
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(10 * 60)
  const [timerRunning, setTimerRunning] = useState<boolean>(false)

  useEffect(() => {
    if (defaultTopic) setTopic(defaultTopic)
  }, [defaultTopic])

  useEffect(() => {
    setTimerSecondsLeft(durationMinutes * 60)
    setTimerRunning(false)
  }, [durationMinutes, modality])

  useEffect(() => {
    if (!timerRunning) return
    const id = setInterval(() => {
      setTimerSecondsLeft(prev => {
        if (prev <= 1) {
          setTimerRunning(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [timerRunning])

  const activity: ExpressWarmupActivity = useMemo(
    () =>
      generateExpressClassroomActivity({
        modality,
        durationMinutes,
        topic,
        grade,
        bnccCodes: defaultBnccCodes
      }),
    [modality, durationMinutes, topic, grade, defaultBnccCodes]
  )

  if (!isOpen) return null

  const modalityOptions = getExpressWarmupModalityOptions()
  const formatMinutes = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const defaultFormatId = getDefaultFormatForSchool('Colégio Machado Sobrinho', 'worksheet').id

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        backgroundColor: 'rgba(44, 26, 14, 0.58)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#fdf8f2',
          border: '1.5px solid #8b5e3c',
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.lg,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: '#2c1a0e'
        }}
      >
        {/* Cabeçalho Editorial */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.7 }}>
              ENGAJAMENTO RÁPIDO EM SALA &bull; PROTOCOLO COOPERATIVO PDI/PEI (SEM ELIMINAÇÃO)
            </div>
            <h2
              style={{
                margin: '4px 0 0 0',
                fontSize: 21,
                fontWeight: 800,
                fontFamily: 'Fraunces, Georgia, serif',
                color: '#2c1a0e'
              }}
            >
              🎮 Gerador Express de Warm-ups & Dinâmicas de Movimento/Jogos (5–15 min)
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: RADIUS.sm,
              border: '1px solid #d5c8bb',
              background: '#ffffff',
              color: '#2c1a0e',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✕ Fechar
          </button>
        </div>

        {/* Seletores de Modalidade, Tópico e Duração */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 8 }}>
          {modalityOptions.map(opt => {
            const active = modality === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setModality(opt.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: RADIUS.md,
                  border: active ? '2px solid #2c1a0e' : '1px solid #dcd7cb',
                  background: active ? '#2c1a0e' : '#ffffff',
                  color: active ? '#fdf8f2' : '#2c1a0e',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800 }}>{opt.label}</span>
                <span style={{ fontSize: 10.5, opacity: active ? 0.9 : 0.75, lineHeight: 1.3 }}>
                  {opt.shortDesc}
                </span>
              </button>
            )
          })}
        </div>

        {/* Configuração do Tópico + Cronômetro de Sala */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            background: '#ffffff',
            padding: 14,
            borderRadius: RADIUS.md,
            border: '1px solid #dcd7cb'
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              Tópico / Vocabulário da Aula
            </label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                fontSize: 13,
                color: '#2c1a0e'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', display: 'block' }}>
              Tempo
            </label>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {([5, 10, 15] as const).map(min => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setDurationMinutes(min)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: durationMinutes === min ? '1.5px solid #2c1a0e' : '1px solid #dcd7cb',
                    background: durationMinutes === min ? '#8b5e3c' : '#fdf8f2',
                    color: durationMinutes === min ? '#ffffff' : '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>

          {/* Cronômetro de Lousa */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#fdf8f2',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #8b5e3c'
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color: '#2c1a0e' }}>
              ⏱️ {formatMinutes(timerSecondsLeft)}
            </span>
            <button
              type="button"
              onClick={() => setTimerRunning(prev => !prev)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: 'none',
                background: timerRunning ? '#991b1b' : '#2c1a0e',
                color: '#fdf8f2',
                fontSize: 11.5,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              {timerRunning ? '⏸️ Pausar' : '▶️ Iniciar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false)
                setTimerSecondsLeft(durationMinutes * 60)
              }}
              style={{
                padding: '5px 8px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                background: '#ffffff',
                color: '#2c1a0e',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ↺
            </button>
          </div>
        </div>

        {/* Protocolo Cooperativo PDI/PEI */}
        <div
          style={{
            background: '#f5efe6',
            borderLeft: '4px solid #8b5e3c',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 12.5,
            color: '#2c1a0e',
            lineHeight: 1.45
          }}
        >
          {activity.cooperativePdiProtocol}
        </div>

        {/* Roteiro Passo a Passo + Cartões Imprimíveis */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #dcd7cb',
              borderRadius: RADIUS.md,
              padding: 14
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 8 }}>
              1. Roteiro Rápido do Professor ({activity.durationMinutes} min)
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: '#2c1a0e' }}>
              {activity.stepByStepTeacherGuide.map((step, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #dcd7cb',
              borderRadius: RADIUS.md,
              padding: 14,
              maxHeight: 280,
              overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 8 }}>
              2. Cartões / Cartelas / Rodadas da Dinâmica ({activity.studentPrintableItems.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activity.studentPrintableItems.map((card, i) => (
                <div
                  key={i}
                  style={{
                    background: '#fdf8f2',
                    border: '1px dashed #8b5e3c',
                    borderRadius: 6,
                    padding: 10
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e', marginBottom: 4 }}>
                    {card.cardTitle}
                  </div>
                  {card.contentLines.map((ln, j) => (
                    <div key={j} style={{ fontSize: 11.5, color: '#5c3a21', lineHeight: 1.4 }}>
                      &bull; {ln}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rodapé de Exportação (PDF / Word .doc) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #dcd7cb', paddingTop: 12 }}>
          <button
            type="button"
            onClick={() =>
              exportToPdf({
                schoolName: 'Colégio Machado Sobrinho',
                teacherName: 'Rafaela Franco Toldo',
                className: grade,
                subjectName: 'Língua Inglesa',
                title: activity.title.toUpperCase(),
                instructions: `Dinâmica Rápida de Sala (${activity.durationMinutes} min) — ${activity.modalityLabel}.`,
                content: activity.printableHtml,
                showStudentNameBox: false,
                formatId: defaultFormatId
              })
            }
            style={{
              padding: '9px 16px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: '#8b5e3c',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            📄 Imprimir Cartelas / Roteiro (PDF)
          </button>

          <button
            type="button"
            onClick={() =>
              exportToWord({
                schoolName: 'Colégio Machado Sobrinho',
                teacherName: 'Rafaela Franco Toldo',
                className: grade,
                subjectName: 'Língua Inglesa',
                title: activity.title.toUpperCase(),
                instructions: `Dinâmica Rápida de Sala (${activity.durationMinutes} min) — ${activity.modalityLabel}.`,
                content: activity.printableHtml,
                showStudentNameBox: false,
                formatId: defaultFormatId
              })
            }
            style={{
              padding: '9px 16px',
              borderRadius: RADIUS.md,
              border: '1.5px solid #8b5e3c',
              background: '#ffffff',
              color: '#2c1a0e',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            📝 Baixar em Word (.doc)
          </button>
        </div>
      </div>
    </div>
  )
}
