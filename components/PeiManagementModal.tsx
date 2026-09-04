'use client'

import React, { useState, useEffect, useRef } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { useModalA11y } from '@/hooks/useModalA11y'
import {
  getStudentPei,
  saveStudentPei,
  PeiProfile,
  createDefaultPei
} from '@/lib/peiManagement'

interface PeiManagementModalProps {
  isOpen: boolean
  studentId: string
  studentName: string
  onClose: () => void
}

export default function PeiManagementModal({
  isOpen,
  studentId,
  studentName,
  onClose
}: PeiManagementModalProps) {
  const [pei, setPei] = useState<PeiProfile>(() => createDefaultPei(studentId, studentName))
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalTarget, setNewGoalTarget] = useState('')
  const [newGoalDeadline, setNewGoalDeadline] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)
  useModalA11y({
    isOpen,
    onClose,
    modalRef
  })

  useEffect(() => {
    if (isOpen && studentId) {
      const existing = getStudentPei(studentId)
      setPei(existing || createDefaultPei(studentId, studentName))
    }
  }, [isOpen, studentId, studentName])

  if (!isOpen) return null

  const handleUpdateDiagnosis = (diagnosis: string) => {
    const updated: PeiProfile = { ...pei, diagnosis, updatedAt: Date.now() }
    setPei(updated)
    saveStudentPei(updated)
  }

  const handleToggleAccommodation = (accId: string) => {
    const updated: PeiProfile = {
      ...pei,
      accommodations: pei.accommodations.map(a =>
        a.id === accId ? { ...a, isActive: !a.isActive } : a
      ),
      updatedAt: Date.now()
    }
    setPei(updated)
    saveStudentPei(updated)
  }

  const handleAddGoal = () => {
    if (!newGoalTitle.trim()) return
    const newGoal = {
      id: 'g_' + Date.now(),
      title: newGoalTitle.trim(),
      target: newGoalTarget.trim() || 'Alcance de 75% de acertos adaptados',
      deadline: newGoalDeadline.trim() || 'Fim do Bimestre',
      status: 'active' as const
    }
    const updated: PeiProfile = {
      ...pei,
      goals: [...pei.goals, newGoal],
      updatedAt: Date.now()
    }
    setPei(updated)
    saveStudentPei(updated)
    setNewGoalTitle('')
    setNewGoalTarget('')
    setNewGoalDeadline('')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(44, 26, 14, 0.60)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div ref={modalRef} style={{
        background: '#fdf8f2',
        width: '100%', maxWidth: 720, maxHeight: '88vh',
        borderRadius: RADIUS.xl,
        boxShadow: '0 10px 40px rgba(44,26,14,0.20)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #ede8dc',
      }}>
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #6d28d9, #4c3a8e)',
          color: '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.85, fontWeight: 800 }}>
              Plano Educacional Individualizado (PEI / IEP)
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{studentName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperInk, display: 'block', marginBottom: 6 }}>
              Laudo / Diagnóstico Psicopedagógico:
            </label>
            <input
              value={pei.diagnosis}
              onChange={e => handleUpdateDiagnosis(e.target.value)}
              placeholder="Ex: TDAH, TEA nível 1 de suporte, Dislexia..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #cdccc2', outline: 'none', fontSize: 13 }}
            />
          </div>

          <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.paperInk, marginBottom: 12 }}>
              Adaptações Curriculares & Assistivas Ativas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pei.accommodations.map(acc => (
                <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={acc.isActive}
                    onChange={() => handleToggleAccommodation(acc.id)}
                  />
                  <span style={{ textDecoration: acc.isActive ? 'none' : 'line-through', color: acc.isActive ? COLOR.paperInk : COLOR.paperMid }}>
                    {acc.description}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.paperInk, marginBottom: 12 }}>
              Metas SMART Prioritárias
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pei.goals.map(g => (
                <div key={g.id} style={{ background: '#fdf8f2', padding: 12, borderRadius: RADIUS.md, border: '1px solid #ede8dc' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: COLOR.paperInk }}>{g.title}</div>
                  <div style={{ fontSize: 12, color: COLOR.paperWarm, margin: '4px 0 6px' }}>Meta: {g.target}</div>
                  <div style={{ fontSize: 11, color: COLOR.paperMid }}>Prazo: {g.deadline} &bull; Status: Ativa</div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input
                  value={newGoalTitle}
                  onChange={e => setNewGoalTitle(e.target.value)}
                  placeholder="Título da meta SMART"
                  style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 6, border: '1px solid #cdccc2', fontSize: 12 }}
                />
                <input
                  value={newGoalTarget}
                  onChange={e => setNewGoalTarget(e.target.value)}
                  placeholder="Critério mensurável"
                  style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 6, border: '1px solid #cdccc2', fontSize: 12 }}
                />
                <button
                  onClick={handleAddGoal}
                  style={{ padding: '8px 16px', background: '#6d28d9', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 24px', background: '#f5efe6', borderTop: '1px solid #ede8dc', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 24px', background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 700, cursor: 'pointer' }}>
            Salvar e Fechar
          </button>
        </div>
      </div>
    </div>
  )
}