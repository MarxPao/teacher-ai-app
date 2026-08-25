import React, { useState } from 'react'
import { ModuleKey } from '@/app/page'
import TeacherLogo from '@/components/TeacherLogo'

interface AskRafinhaBarProps {
  onNavigate: (module: ModuleKey) => void
  onTriggerCommand?: (prompt: string) => void
}

/**
 * Barra global de linguagem natural "Ask Rafinha" persistente (#12).
 * Interpreta intenções do professor e executa/navega automaticamente.
 */
export default function AskRafinhaBar({ onNavigate, onTriggerCommand }: AskRafinhaBarProps) {
  const [query, setQuery] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsProcessing(true)
    const lower = query.toLowerCase()

    setTimeout(() => {
      // Roteamento inteligente por intenção
      if (lower.includes('prova') || lower.includes('exercício') || lower.includes('questõ') || lower.includes('worksheet')) {
        onNavigate('test_and_worksheets')
      } else if (lower.includes('corrig') || lower.includes('omni') || lower.includes('redação') || lower.includes('ocr')) {
        onNavigate('omnigrader')
      } else if (lower.includes('nota') || lower.includes('caderneta') || lower.includes('gradebook')) {
        onNavigate('gradebook')
      } else if (lower.includes('pais') || lower.includes('comunic') || lower.includes('whatsapp') || lower.includes('recado')) {
        onNavigate('communications')
      } else if (lower.includes('plano') || lower.includes('aula') || lower.includes('planejamento')) {
        onNavigate('lessonstudio')
      } else if (lower.includes('aluno') || lower.includes('estudante')) {
        onNavigate('students')
      } else if (lower.includes('turma')) {
        onNavigate('classes')
      } else if (lower.includes('insight') || lower.includes('desempenho') || lower.includes('alerta')) {
        onNavigate('insights')
      } else if (lower.includes('quiz') || lower.includes('jogo')) {
        onNavigate('livequiz')
      } else if (lower.includes('flashcard')) {
        onNavigate('flashcardmode')
      } else {
        // Dispara Rafinha Chat
        onTriggerCommand?.(query)
      }

      setIsProcessing(false)
      setQuery('')
    }, 200)
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(253,248,242,0.85)',
        border: '1px solid rgba(139,115,85,0.22)',
        borderRadius: 24,
        padding: '3px 12px 3px 10px',
        boxShadow: '0 2px 8px rgba(44,26,14,0.04)',
        width: 320,
        maxWidth: '100%',
        transition: 'all 0.2s ease',
      }}
    >
      <TeacherLogo size={18} color="#8b5e3c" style={{ marginRight: 6 }} />
      <input
        type="text"
        placeholder="Peça à Rafinha... (ex: gerar prova B1)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={isProcessing}
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 12.5,
          color: '#2c1a0e',
          flex: 1,
          fontFamily: 'inherit',
        }}
      />
      <button
        type="submit"
        disabled={!query.trim() || isProcessing}
        style={{
          background: 'none',
          border: 'none',
          color: query.trim() ? '#8b5e3c' : 'rgba(139,115,85,0.4)',
          cursor: query.trim() ? 'pointer' : 'default',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <i className="ti ti-arrow-right" style={{ fontSize: 14 }} />
      </button>
    </form>
  )
}
