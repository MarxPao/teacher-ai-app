'use client'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect } from 'react'
import { FONT, RADIUS } from '@/styles/tokens'

const SCRATCHPAD_KEY = 'teacher_scratchpad_notes'

/**
 * Bloco de Notas Rápidas Persistente (#26).
 * Botão flutuante que abre um drawer de notas disponível em qualquer módulo.
 */
export default function Scratchpad() {
  const [isOpen, setIsOpen] = useState(false)
  const [note, setNote] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCRATCHPAD_KEY)
      if (saved) setNote(saved)
    } catch {}
  }, [])

  const handleChange = (val: string) => {
    setNote(val)
    try {
      localStorage.setItem(SCRATCHPAD_KEY, val)
      setLastSaved(new Date())
    } catch {}
  }

  const handleClear = async () => {
    if ((await showConfirm({ message: 'Deseja limpar as anotações do bloco rápido?' }))) {
      setNote('')
      localStorage.removeItem(SCRATCHPAD_KEY)
    }
  }

  useEffect(() => {
    const handleOpen = () => setIsOpen(true)
    const handleToggle = () => setIsOpen((v) => !v)
    window.addEventListener('teacher:open_scratchpad', handleOpen)
    window.addEventListener('teacher:toggle_scratchpad', handleToggle)
    return () => {
      window.removeEventListener('teacher:open_scratchpad', handleOpen)
      window.removeEventListener('teacher:toggle_scratchpad', handleToggle)
    }
  }, [])

  return (
    <>

      {/* Drawer do Scratchpad */}
      {isOpen && (
        <div
          className="animate-slide-up"
          style={{
            position: 'fixed',
            bottom: 140,
            right: 24,
            width: 360,
            maxWidth: 'calc(100vw - 48px)',
            height: 420,
            background: '#fffcf8',
            border: '1px solid rgba(139,115,85,0.22)',
            borderRadius: RADIUS.lg,
            boxShadow: '0 12px 36px rgba(44,26,14,0.18)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9991,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(139,115,85,0.12)',
              background: '#fcf8f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>📓</span>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: '#2c1a0e' }}>
                Bloco de Notas Rápido
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {lastSaved && (
                <span style={{ fontSize: 10.5, color: '#3d7a4e' }}>✓ Salvo</span>
              )}
              <button
                onClick={handleClear}
                title="Limpar notas"
                style={{ background: 'none', border: 'none', color: '#a83232', cursor: 'pointer', fontSize: 12 }}
              >
                <i className="ti ti-eraser" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: '#7a5c42', cursor: 'pointer', fontSize: 16 }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Text Area */}
          <textarea
            value={note}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Digite anotações rápidas, ideias para a próxima aula, lembretes de alunos..."
            style={{
              flex: 1,
              width: '100%',
              padding: 16,
              border: 'none',
              outline: 'none',
              background: '#fffdfa',
              fontSize: 14,
              lineHeight: 1.6,
              fontFamily: FONT.serif,
              color: '#2c1a0e',
              resize: 'none',
            }}
          />

          {/* Footer Info */}
          <div
            style={{
              padding: '6px 14px',
              borderTop: '1px solid rgba(139,115,85,0.08)',
              background: '#fdfbf8',
              fontSize: 11,
              color: '#a08060',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{note.length} caracteres</span>
            <span>Salva automaticamente</span>
          </div>
        </div>
      )}
    </>
  )
}
