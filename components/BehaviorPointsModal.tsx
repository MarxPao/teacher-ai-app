'use client'

import React, { useState, useEffect, useRef } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { useModalA11y } from '@/hooks/useModalA11y'
import {
  getStudentPointsBalance,
  awardBehaviorPoint,
  BEHAVIOR_PRESETS,
  BehaviorPointRecord,
  BehaviorPointBalance
} from '@/lib/behaviorPoints'

interface BehaviorPointsModalProps {
  isOpen: boolean
  studentId: string
  studentName: string
  classId?: string
  onClose: () => void
}

export default function BehaviorPointsModal({
  isOpen,
  studentId,
  studentName,
  classId = '',
  onClose
}: BehaviorPointsModalProps) {
  const [balance, setBalance] = useState<BehaviorPointBalance>(() => getStudentPointsBalance(studentId))
  const [customReason, setCustomReason] = useState('')
  const [customAmount, setCustomAmount] = useState('1')

  const modalRef = useRef<HTMLDivElement>(null)
  useModalA11y({
    isOpen,
    onClose,
    modalRef
  })

  const loadBalance = () => {
    if (studentId) {
      setBalance(getStudentPointsBalance(studentId))
    }
  }

  useEffect(() => {
    if (isOpen && studentId) {
      loadBalance()
    }
  }, [isOpen, studentId])

  if (!isOpen) return null

  const handleAwardPreset = (preset: typeof BEHAVIOR_PRESETS[0]) => {
    awardBehaviorPoint(studentId, studentName, classId, preset)
    loadBalance()
  }

  const handleAwardCustom = () => {
    if (!customReason.trim()) return
    const amt = parseInt(customAmount, 10) || 1
    awardBehaviorPoint(studentId, amt, amt >= 0 ? 'positive' : 'needs_work', customReason.trim(), amt >= 0 ? '⭐' : '⚠️')
    setCustomReason('')
    loadBalance()
  }

  const positivePresets = BEHAVIOR_PRESETS.filter(p => p.category === 'positive')
  const needsWorkPresets = BEHAVIOR_PRESETS.filter(p => p.category === 'needs_work')

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(44, 26, 14, 0.60)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div ref={modalRef} style={{
        background: '#fdf8f2',
        width: '100%', maxWidth: 640, maxHeight: '88vh',
        borderRadius: RADIUS.xl,
        boxShadow: '0 10px 40px rgba(44,26,14,0.20)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #ede8dc',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #10b981, #047857)',
          color: '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.85, fontWeight: 800 }}>
              Pontos Comportamentais (Estilo ClassDojo)
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{studentName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Placar de Pontos */}
          <div style={{
            background: '#fff', padding: '16px 20px', borderRadius: RADIUS.lg, border: '1px solid #ede8dc',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid, textTransform: 'uppercase' }}>Saldo Atual</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: balance.totalPoints >= 0 ? '#059669' : '#dc2626' }}>
                {balance.totalPoints > 0 ? `+${balance.totalPoints}` : balance.totalPoints} pts
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>Positivos</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>+{balance.positivePoints}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>Atenção</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>{balance.negativePoints}</div>
              </div>
            </div>
          </div>

          {/* Presets Positivos */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🌟</span> Reconhecimento & Méritos (+ Pontos)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
              {positivePresets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAwardPreset(p)}
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: RADIUS.md,
                    padding: '10px 8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <span style={{ fontSize: 20 }}>{p.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46' }}>{p.reason}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#059669' }}>+{p.amount}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Presets de Atenção */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#991b1b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span> Precisa de Atenção / Combinados
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
              {needsWorkPresets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAwardPreset(p)}
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: RADIUS.md,
                    padding: '10px 8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <span style={{ fontSize: 20 }}>{p.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#991b1b' }}>{p.reason}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#dc2626' }}>{p.amount}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Lançamento Customizado */}
          <div style={{ background: '#fff', padding: 14, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 8 }}>
              Lançamento Personalizado
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Motivo (ex: Organizou a sala, entregou projeto adiantado...)"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #cdccc2', fontSize: 12 }}
              />
              <select
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                style={{ width: 80, padding: '8px', borderRadius: 6, border: '1px solid #cdccc2', fontSize: 12, fontWeight: 700 }}
              >
                <option value="1">+1 pt</option>
                <option value="2">+2 pts</option>
                <option value="3">+3 pts</option>
                <option value="-1">-1 pt</option>
                <option value="-2">-2 pts</option>
              </select>
              <button
                onClick={handleAwardCustom}
                style={{ padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Lançar
              </button>
            </div>
          </div>

          {/* Histórico Recente */}
          {balance.records.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid, marginBottom: 6 }}>
                Histórico Recente
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                {balance.records.slice(-8).reverse().map(r => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#fff',
                      padding: '8px 12px',
                      borderRadius: RADIUS.sm,
                      border: '1px solid #ede8dc',
                      fontSize: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{r.icon || '⭐'}</span>
                      <span style={{ fontWeight: 600, color: COLOR.paperInk }}>{r.reason}</span>
                    </div>
                    <span style={{ fontWeight: 800, color: r.points >= 0 ? '#059669' : '#dc2626' }}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', background: '#f5efe6', borderTop: '1px solid #ede8dc', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 24px', background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 700, cursor: 'pointer' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}