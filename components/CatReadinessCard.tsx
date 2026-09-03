'use client'

import React, { useState, useEffect } from 'react'
import { COLOR, RADIUS, TEXT, FONT } from '@/styles/tokens'
import { evaluateCatReadiness, CatReadinessStatus, CAT_MIN_CALIBRATED_QUESTIONS_THRESHOLD } from '@/lib/catReadinessTrigger'

export default function CatReadinessCard({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<CatReadinessStatus>(() => evaluateCatReadiness())

  useEffect(() => {
    const handleUpdate = () => {
      setStatus(evaluateCatReadiness())
    }
    window.addEventListener('storage', handleUpdate)
    window.addEventListener('teacher:questions_updated', handleUpdate)
    window.addEventListener('teacher:cat_readiness_ready', handleUpdate)
    return () => {
      window.removeEventListener('storage', handleUpdate)
      window.removeEventListener('teacher:questions_updated', handleUpdate)
      window.removeEventListener('teacher:cat_readiness_ready', handleUpdate)
    }
  }, [])

  const isReady = status.isReady
  const badgeColor = isReady ? '#166534' : status.calibratedN10Count > 0 ? '#854d0e' : '#786555'
  const badgeBg = isReady ? '#dcfce7' : status.calibratedN10Count > 0 ? '#fef9c3' : '#f5efe6'

  if (compact) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: RADIUS.md,
        background: badgeBg,
        border: `1px solid ${isReady ? '#86efac' : '#e7dcd1'}`,
        fontSize: 12,
        fontWeight: 600,
        color: badgeColor
      }}>
        <i className={isReady ? 'ti ti-sparkles' : 'ti ti-chart-dots'} />
        <span>CAT: {status.calibratedN10Count}/{status.threshold} ({status.progressPercentage}%)</span>
      </div>
    )
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: RADIUS.lg,
      border: `1px solid ${isReady ? '#86efac' : '#d5c8bb'}`,
      padding: 20,
      marginTop: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#2c1a0e' }}>
              🎯 Prontidão Psicométrica para Testes Adaptativos (CAT / E.2)
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: RADIUS.sm,
              background: badgeBg,
              color: badgeColor
            }}>
              {status.statusLabel}
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#786555', margin: '4px 0 0', maxWidth: 720 }}>
            {status.readinessNotice}
          </p>
        </div>
      </div>

      {/* Barra de Progresso Rumo ao Limiar */}
      <div style={{ margin: '14px 0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#5c4838', marginBottom: 6 }}>
          <span>Progresso de Calibração Empírica (N ≥ 10 respostas)</span>
          <span>{status.calibratedN10Count} / {status.threshold} itens ({status.progressPercentage}%)</span>
        </div>
        <div style={{
          width: '100%',
          height: 8,
          background: '#f0ede4',
          borderRadius: RADIUS.full,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${status.progressPercentage}%`,
            height: '100%',
            background: isReady ? '#22c55e' : '#854d0e',
            borderRadius: RADIUS.full,
            transition: 'width 0.4s ease'
          }} />
        </div>
      </div>

      {/* Grid de Métricas do Banco */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <div style={{ background: '#faf6f0', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #e7dcd1' }}>
          <div style={{ fontSize: 11, color: '#786555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total de Questões</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', marginTop: 2 }}>{status.totalQuestions}</div>
        </div>
        <div style={{ background: '#faf6f0', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #e7dcd1' }}>
          <div style={{ fontSize: 11, color: '#786555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Com Respostas (N &gt; 0)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', marginTop: 2 }}>{status.totalWithAnyResponses}</div>
        </div>
        <div style={{ background: '#faf6f0', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #e7dcd1' }}>
          <div style={{ fontSize: 11, color: '#786555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Calibradas (N ≥ 10)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: isReady ? '#166534' : '#854d0e', marginTop: 2 }}>{status.calibratedN10Count}</div>
        </div>
        <div style={{ background: '#faf6f0', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #e7dcd1' }}>
          <div style={{ fontSize: 11, color: '#786555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meta para Ativação</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', marginTop: 2 }}>{CAT_MIN_CALIBRATED_QUESTIONS_THRESHOLD} itens</div>
        </div>
      </div>
    </div>
  )
}
