'use client'

import React, { useState } from 'react'

export interface OnlineQuestion {
  id: string
  stem: string
  type: 'multiple_choice' | 'text' | 'true_false'
  options?: string[]
  answer?: string
}

export interface OnlineExamProps {
  title: string
  schoolName?: string
  className?: string
  questions: OnlineQuestion[]
  onClose: () => void
  onComplete?: (studentName: string, score: number, total: number) => void
}

export default function StudentExamPlayer({
  title,
  schoolName = 'ESCOLA / INSTITUTO DE ENSINO',
  className = 'Turma 8º Ano',
  questions,
  onClose,
  onComplete
}: OnlineExamProps) {
  const [studentName, setStudentName] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState<number | null>(null)

  const handleSelectOption = (qId: string, opt: string) => {
    setAnswers(prev => ({ ...prev, [qId]: opt }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentName.trim()) {
      alert('Por favor, informe seu nome antes de enviar a prova.')
      return
    }

    // Calcula nota automaticamente para questoes de multipla escolha
    let correctCount = 0
    questions.forEach(q => {
      if (q.type === 'multiple_choice' && q.answer) {
        if (answers[q.id]?.trim().toLowerCase() === q.answer.trim().toLowerCase()) {
          correctCount++
        }
      }
    })

    const finalScore = Number(((correctCount / (questions.length || 1)) * 10).toFixed(1))
    setScore(finalScore)
    setSubmitted(true)

    // Grava o resultado no Gradebook / Alunos local
    try {
      const existingStudents = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      const studentIdx = existingStudents.findIndex((s: any) => s.name.toLowerCase() === studentName.toLowerCase())
      
      if (studentIdx !== -1) {
        existingStudents[studentIdx].grades = existingStudents[studentIdx].grades || {}
        existingStudents[studentIdx].grades[title] = String(finalScore)
      } else {
        existingStudents.push({
          id: Date.now().toString(),
          name: studentName,
          class: className,
          email: `${studentName.toLowerCase().replace(/\s+/g, '')}@escola.com`,
          grades: { [title]: String(finalScore) },
          metrics: { participation: 90, homework: 85 }
        })
      }
      localStorage.setItem('teacher_students', JSON.stringify(existingStudents))
      window.dispatchEvent(new Event('storage'))
    } catch (e) {}

    if (onComplete) {
      onComplete(studentName, finalScore, questions.length)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(7,54,66,0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 24, width: '100%', maxWidth: 780,
        maxHeight: '90vh', overflowY: 'auto', padding: 32,
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '2px solid #ede8dc'
      }}>
        {/* Cabeçalho da Prova Online */}
        <div style={{ borderBottom: '2px solid #ede8dc', paddingBottom: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#b58900', textTransform: 'uppercase', letterSpacing: 1 }}>
              🌐 PROVA ONLINE PARA ALUNOS
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#2c1a0e', margin: '4px 0 0 0' }}>{title}</h2>
            <div style={{ fontSize: 13, color: '#586e75', marginTop: 2 }}>{schoolName} — {className}</div>
          </div>
          <button
            onClick={onClose}
            style={{ padding: '6px 12px', background: '#f5f0e8', border: '1px solid #ede8dc', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            ✕ Fechar
          </button>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Campo Nome do Aluno */}
            <div style={{ background: '#fdf8f2', padding: 16, borderRadius: 14, border: '1px solid #ede8dc' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', display: 'block', marginBottom: 6 }}>
                ✍️ Digite seu Nome Completo:
              </label>
              <input
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder="Ex: Maria Clara Silva"
                required
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid #cb4b16', fontSize: 14, outline: 'none',
                  background: '#fff', color: '#2c1a0e', fontWeight: 600
                }}
              />
            </div>

            {/* Lista de Questões */}
            {questions.map((q, idx) => (
              <div key={q.id || idx} style={{ background: '#fff', padding: 20, borderRadius: 16, border: '1.5px solid #ede8dc' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', marginBottom: 12, lineHeight: 1.5 }}>
                  <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, marginRight: 8, fontSize: 12 }}>
                    Questão {idx + 1}
                  </span>
                  {q.stem}
                </div>

                {q.options && q.options.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {q.options.map((opt, oIdx) => {
                      const isSelected = answers[q.id] === opt
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => handleSelectOption(q.id, opt)}
                          style={{
                            textAlign: 'left', padding: '10px 14px', borderRadius: 10,
                            border: `1.5px solid ${isSelected ? '#8b5e3c' : '#ede8dc'}`,
                            background: isSelected ? '#fdf8f2' : '#faf8f5',
                            color: isSelected ? '#8b5e3c' : '#2c1a0e',
                            fontSize: 13.5, fontWeight: isSelected ? 700 : 500,
                            cursor: 'pointer', transition: 'all 0.15s'
                          }}
                        >
                          {String.fromCharCode(65 + oIdx)}) {opt}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <textarea
                    rows={3}
                    value={answers[q.id] || ''}
                    onChange={e => handleSelectOption(q.id, e.target.value)}
                    placeholder="Sua resposta..."
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1px solid #ede8dc', fontSize: 13.5, outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              style={{
                padding: '14px', background: '#2d9d5d', color: '#fff',
                border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 4px 14px rgba(45,157,93,0.3)'
              }}
            >
              🚀 Finalizar e Enviar Respostas
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#2c1a0e' }}>
              Prova Enviada com Sucesso!
            </h3>
            <p style={{ fontSize: 14, color: '#586e75', margin: '8px 0 20px 0' }}>
              Obrigado, <strong>{studentName}</strong>. Suas respostas foram computadas e enviadas diretamente para o diário do professor.
            </p>
            {score !== null && (
              <div style={{
                background: '#f0fff4', border: '2px solid #2d9d5d',
                borderRadius: 16, padding: 20, display: 'inline-block', minWidth: 200
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#2d9d5d', textTransform: 'uppercase' }}>Sua Nota:</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#2d9d5d' }}>{score} / 10</div>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <button
                onClick={onClose}
                style={{ padding: '10px 24px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
