'use client'

import React, { useEffect, useState } from 'react'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

export interface AiProgressStepperProps {
  isGenerating: boolean
  title?: string
  subtitle?: string
  steps?: string[]
  currentStepIndex?: number
  subject?: string
  topic?: string
  onCancel?: () => void
}

const DEFAULT_STEPS = [
  'Consultando matriz de referência e diretrizes pedagógicas...',
  'Estruturando enunciados, distratores e itens psicométricos...',
  'Calibrando gabarito oficial, critérios e formatação final...',
]

export default function AiProgressStepper({
  isGenerating,
  title = 'Inteligência Pedagógica em Execução',
  subtitle,
  steps = DEFAULT_STEPS,
  currentStepIndex: externalStepIndex,
  subject,
  topic,
  onCancel,
}: AiProgressStepperProps) {
  const [internalStepIndex, setInternalStepIndex] = useState(0)
  const [progressPercent, setProgressPercent] = useState(15)

  // Auto-avanço suave de etapas enquanto isGenerating for true
  useEffect(() => {
    if (!isGenerating) {
      setInternalStepIndex(0)
      setProgressPercent(15)
      return
    }

    const interval = setInterval(() => {
      setInternalStepIndex(prev => {
        const next = prev < steps.length - 1 ? prev + 1 : prev
        return next
      })
      setProgressPercent(prev => {
        if (prev >= 92) return 92 // segura em 92% até a resposta real chegar
        return prev + Math.floor(Math.random() * 18 + 8)
      })
    }, 2400)

    return () => clearInterval(interval)
  }, [isGenerating, steps.length])

  const activeStep = externalStepIndex !== undefined ? externalStepIndex : internalStepIndex

  if (!isGenerating) return null

  return (
    <div
      style={{
        width: '100%',
        background: COLOR.surface1,
        border: `1px solid ${BORDER.medium}`,
        borderRadius: RADIUS.lg,
        padding: '24px 28px',
        boxShadow: SHADOW.md,
        boxSizing: 'border-box',
        fontFamily: FONT.sans,
        animation: 'tai-fade-in 0.3s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Barra de brilho superior */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${COLOR.accent} 0%, #c4834a 50%, ${COLOR.accent} 100%)`,
          backgroundSize: '200% 100%',
          animation: 'tai-shimmer-bar 2s linear infinite',
        }}
      />

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: RADIUS.md,
              background: `linear-gradient(135deg, ${COLOR.accent} 0%, #6f4728 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(139,94,60,0.3)',
            }}
          >
            <i className="ti ti-sparkles" style={{ fontSize: 20, animation: 'tai-pulse-glow 1.5s ease-in-out infinite' }} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: TEXT.subtitle, fontWeight: 700, color: COLOR.paperInk, fontFamily: FONT.display }}>
              {title}
            </h4>
            <p style={{ margin: '3px 0 0', fontSize: TEXT.caption, color: COLOR.paperWarm }}>
              {subtitle || (topic ? `Processando: ${topic}` : 'Construindo material estruturado com IA')}
            </p>
          </div>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '6px 12px',
              borderRadius: RADIUS.sm,
              border: `1px solid ${BORDER.medium}`,
              background: 'transparent',
              color: COLOR.paperWarm,
              fontSize: TEXT.caption,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Barra de Progresso Animada */}
      <div
        style={{
          width: '100%',
          height: 6,
          background: COLOR.surface2,
          borderRadius: RADIUS.full,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: `linear-gradient(90deg, ${COLOR.accent} 0%, #c4834a 100%)`,
            borderRadius: RADIUS.full,
            transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>

      {/* Stepper de Etapas Pedagógicas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {steps.map((step, idx) => {
          const isDone = idx < activeStep
          const isCurrent = idx === activeStep
          const isPending = idx > activeStep

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: isPending ? 0.45 : 1,
                transition: TRANSITION.normal,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  flexShrink: 0,
                  background: isDone
                    ? COLOR.successBg
                    : isCurrent
                    ? 'rgba(139,94,60,0.15)'
                    : COLOR.surface2,
                  border: `1.5px solid ${
                    isDone
                      ? COLOR.success
                      : isCurrent
                      ? COLOR.accent
                      : BORDER.medium
                  }`,
                  color: isDone
                    ? COLOR.success
                    : isCurrent
                    ? COLOR.accent
                    : COLOR.paperMid,
                  fontWeight: 800,
                }}
              >
                {isDone ? (
                  <i className="ti ti-check" style={{ fontSize: 13, strokeWidth: 2.5 }} />
                ) : isCurrent ? (
                  <i className="ti ti-loader-2" style={{ fontSize: 13, animation: 'tai-spin 1s linear infinite' }} />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                style={{
                  fontSize: TEXT.bodyCompact,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? COLOR.paperInk : isDone ? COLOR.paperWarm : COLOR.paperMid,
                }}
              >
                {step}
              </span>
            </div>
          )
        })}
      </div>

      {/* Skeleton Shimmer Preview Box */}
      <div
        style={{
          background: COLOR.paperPage,
          borderRadius: RADIUS.md,
          padding: 16,
          border: `1px dashed ${BORDER.medium}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: '40%', height: 12, background: COLOR.surface3, borderRadius: 4, animation: 'tai-pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: '20%', height: 12, background: COLOR.surface2, borderRadius: 4 }} />
        </div>
        <div style={{ width: '85%', height: 10, background: COLOR.surface2, borderRadius: 4, animation: 'tai-pulse 1.5s ease-in-out infinite 0.2s' }} />
        <div style={{ width: '70%', height: 10, background: COLOR.surface2, borderRadius: 4, animation: 'tai-pulse 1.5s ease-in-out infinite 0.4s' }} />
      </div>

      <style>{`
        @keyframes tai-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tai-shimmer-bar { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
        @keyframes tai-pulse-glow { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.85; } }
        @keyframes tai-spin { to { transform: rotate(360deg); } }
        @keyframes tai-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )
}
