'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useRef } from 'react'

export interface OnlineQuestion {
  id: string
  stem: string
  type: 'multiple_choice' | 'text' | 'true_false'
  options?: string[]
  answer?: string
  bloomLevel?: string
  difficultyLevel?: string
  dataset?: {
    weight?: string
  }
}

export interface OnlineExamProps {
  title: string
  schoolName?: string
  className?: string
  questions: OnlineQuestion[]
  onClose: () => void
  onComplete?: (studentName: string, score: number, total: number) => void
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}
function mulberry32(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
function seededShuffle<T>(arr: T[], seedStr: string): { shuffled: T[]; indexMap: number[] } {
  const rng = mulberry32(hashCode(seedStr))
  const result = [...arr]
  const indexMap = arr.map((_, i) => i)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
    [indexMap[i], indexMap[j]] = [indexMap[j], indexMap[i]]
  }
  return { shuffled: result, indexMap }
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    dp[i] = []
    for (let j = 0; j <= b.length; j++) {
      dp[i][j] = i === 0 ? j : j === 0 ? i : 0
    }
  }
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[a.length][b.length]
}

const CONTRACTIONS: Record<string, string> = {
  "didn't": 'did not', "don't": 'do not', "doesn't": 'does not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not',
  "weren't": 'were not', "won't": 'will not', "can't": 'cannot',
  "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not'
}

function scoreGapFill(student: string, correct: string): 0 | 0.5 | 1 {
  const s = (CONTRACTIONS[student.trim().toLowerCase()] || student.trim().toLowerCase())
  const c = (CONTRACTIONS[correct.trim().toLowerCase()] || correct.trim().toLowerCase())
  if (s === c) return 1
  if (levenshtein(s, c) <= 1) return 0.5
  return 0
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
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [examDurationMin, setExamDurationMin] = useState(50)
  
  const [kioskMode, setKioskMode] = useState(false)
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  
  const [examMode, setExamMode] = useState<'exam' | 'practice'>('exam')
  
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const examContainer = document.querySelector('[data-duration-minutes]') as HTMLElement
    if (examContainer && examContainer.dataset.durationMinutes) {
      const mins = parseInt(examContainer.dataset.durationMinutes, 10)
      if (!isNaN(mins)) {
        setExamDurationMin(mins)
        setTimeLeft(mins * 60)
      }
    } else {
      setTimeLeft(examDurationMin * 60)
    }
    
    const kioskEl = document.querySelector('[data-kiosk]') as HTMLElement
    if (kioskEl && kioskEl.dataset.kiosk === 'true') {
      setKioskMode(true)
    }
  }, [examDurationMin])
  
  useEffect(() => {
    if (kioskMode) {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          setTabSwitchCount(prev => {
            const next = prev + 1
            toast.success(`Atenção: troca de aba detectada! Ocorrências: ${next}`)
            return next
          })
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [kioskMode])

  useEffect(() => {
    if (timeLeft === null || submitted) return
    if (timeLeft <= 0) {
      if (formRef.current) {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      return
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev !== null ? prev - 1 : null)
    }, 1000)
    return () => clearInterval(timer)
  }, [timeLeft, submitted])

  const handleSelectOption = (qId: string, opt: string) => {
    setAnswers(prev => ({ ...prev, [qId]: opt }))
  }

  const handleSubmit = (e: React.FormEvent | Event) => {
    if (e.preventDefault) e.preventDefault()
    if (!studentName.trim()) {
      toast.success('Por favor, informe seu nome antes de enviar a prova.')
      return
    }

    const weights = questions.map(q => parseFloat((q as any).dataset?.weight || '1.0'))
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    
    let correctCount = 0
    let weightedCorrect = 0

    questions.forEach((q, i) => {
      let qScore = 0
      if (q.type === 'multiple_choice' && q.answer) {
        if (answers[q.id]?.trim().toLowerCase() === q.answer.trim().toLowerCase()) {
          qScore = 1
        }
      } else if (q.type === 'text' && q.answer) {
        qScore = scoreGapFill(answers[q.id] || '', q.answer)
      }
      
      if (qScore === 1) correctCount++
      weightedCorrect += qScore * weights[i]
    })
    
    const examContainer = document.querySelector('[data-total-score]') as HTMLElement
    const totalScoreConfig = parseFloat(examContainer?.dataset?.totalScore || '10')
    const finalScore = totalWeight > 0 ? (weightedCorrect / totalWeight) * totalScoreConfig : (correctCount / (questions.length || 1)) * 10
    
    const roundedScore = Number(finalScore.toFixed(1))
    setScore(roundedScore)
    setSubmitted(true)

    // Save exam in teacher history for Smart Insights
    const historyKey = 'teacher_exam_history'
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]')
    
    const examClassRef = document.body.dataset.examClassRef || examContainer?.dataset?.examClassRef || ''
    const examTopic = document.body.dataset.examTopic || examContainer?.dataset?.examTopic || ''
    const examCefr = document.body.dataset.examCefr || examContainer?.dataset?.examCefr || ''
    
    const examEntry = {
      examId: `exam_${Date.now()}`,
      examTitle: title || 'Prova',
      examDate: new Date().toISOString().split('T')[0],
      classRef: examClassRef,
      topic: examTopic,
      cefrLevel: examCefr,
      questionCount: questions.length,
      results: [{
        studentId: Date.now().toString(),
        studentName: studentName || 'Aluno',
        totalScore: roundedScore,
        maxScore: totalWeight || questions.length,
        questionResults: questions.map((q, i) => {
          let isCorrect = false
          if (q.type === 'multiple_choice' && q.answer) {
            isCorrect = answers[q.id]?.trim().toLowerCase() === q.answer.trim().toLowerCase()
          } else if (q.type === 'text' && q.answer) {
             isCorrect = scoreGapFill(answers[q.id] || '', q.answer) === 1
          }
          return {
            questionId: q.id || `q${i}`,
            correct: isCorrect,
            weight: weights[i] || 1,
            bloomLevel: q.bloomLevel,
            difficultyLevel: q.difficultyLevel
          }
        }),
        tabSwitchCount: tabSwitchCount || 0
      }]
    }
    
    const existingIdx = history.findIndex((e: any) => e.examId === examEntry.examId)
    if (existingIdx >= 0) {
      history[existingIdx].results.push(examEntry.results[0])
    } else {
      history.push(examEntry)
    }
    localStorage.setItem(historyKey, JSON.stringify(history.slice(-50)))

    try {
      const existingStudents = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      const studentIdx = existingStudents.findIndex((s: any) => s.name.toLowerCase() === studentName.toLowerCase())
      
      if (studentIdx !== -1) {
        existingStudents[studentIdx].grades = existingStudents[studentIdx].grades || {}
        existingStudents[studentIdx].grades[title] = String(roundedScore)
      } else {
        existingStudents.push({
          id: Date.now().toString(),
          name: studentName,
          class: className,
          email: `${studentName.toLowerCase().replace(/\s+/g, '')}@escola.com`,
          grades: { [title]: String(roundedScore) },
          metrics: { participation: 90, homework: 85 }
        })
      }
      localStorage.setItem('teacher_students', JSON.stringify(existingStudents))
      window.dispatchEvent(new Event('storage'))
    } catch (err) {}

    if (onComplete) {
      onComplete(studentName, roundedScore, questions.length)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(7,54,66,0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20
    }}>
      <div 
        onContextMenu={kioskMode ? e => e.preventDefault() : undefined}
        onCopy={kioskMode ? e => e.preventDefault() : undefined}
        onCut={kioskMode ? e => e.preventDefault() : undefined}
        onPaste={kioskMode ? e => e.preventDefault() : undefined}
        style={{
        background: '#fff', borderRadius: 24, width: '100%', maxWidth: 780,
        maxHeight: '90vh', overflowY: 'auto', padding: 32,
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '2px solid #ede8dc'
      }}>
        {timeLeft !== null && !submitted && (
          <div style={{
            position: 'sticky', top: -32, left: -32, right: -32, margin: '-32px -32px 24px -32px',
            background: timeLeft <= 60 ? '#fee2e2' : timeLeft <= 300 ? '#fef3c7' : '#f0fdf4',
            padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '2px solid #ede8dc', zIndex: 10,
            animation: timeLeft <= 60 ? 'pulse 1s infinite' : 'none'
          }}>
            <span style={{ fontWeight: 800, color: timeLeft <= 60 ? '#dc2626' : timeLeft <= 300 ? '#d97706' : '#166534' }}>
              Tempo Restante: {formatTime(timeLeft)}
            </span>
          </div>
        )}

        <div style={{ borderBottom: '2px solid #ede8dc', paddingBottom: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#b58900', textTransform: 'uppercase', letterSpacing: 1 }}>
              PROVA ONLINE PARA ALUNOS
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#2c1a0e', margin: '4px 0 0 0' }}>{title}</h2>
            <div style={{ fontSize: 13, color: '#7a5c42', marginTop: 2 }}>{schoolName} {className}</div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="flex gap-2 text-sm" style={{ display: 'flex', gap: '8px', fontSize: '0.875rem' }}>
              <button type="button" onClick={() => setExamMode('exam')} style={{ padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #ccc', background: examMode === 'exam' ? '#2563eb' : '#f3f4f6', color: examMode === 'exam' ? '#fff' : '#000' }}>📝 Prova</button>
              <button type="button" onClick={() => setExamMode('practice')} style={{ padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #ccc', background: examMode === 'practice' ? '#16a34a' : '#f3f4f6', color: examMode === 'practice' ? '#fff' : '#000' }}>🎯 Prática</button>
            </div>
            <button
              onClick={onClose}
              style={{ padding: '6px 12px', background: '#f5f0e8', border: '1px solid #ede8dc', borderRadius: RADIUS.md, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Fechar
            </button>
          </div>
        </div>

        {!submitted ? (
          <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ background: '#fdf8f2', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', display: 'block', marginBottom: 6 }}>
                Digite seu Nome Completo:
              </label>
              <input
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder="Ex: Maria Clara Silva"
                required
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: RADIUS.md,
                  border: '1.5px solid #cb4b16', fontSize: 14, outline: 'none',
                  background: '#fff', color: '#2c1a0e', fontWeight: 600
                }}
              />
            </div>

            {questions.map((q, idx) => {
              const isEssay = /Write|Essay|Rediga|Escreva|Writing Task/i.test(q.stem)
              const { shuffled } = seededShuffle(q.options || [], studentName + String(idx))

              let practiceFeedback = null
              if (examMode === 'practice' && answers[q.id] !== undefined && q.answer) {
                if (q.type === 'multiple_choice') {
                   const isCorrect = answers[q.id]?.trim().toLowerCase() === q.answer.trim().toLowerCase()
                   if (isCorrect) practiceFeedback = <div style={{marginTop: 8, padding: 8, background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: 13}}>✅ Correto!</div>
                   else practiceFeedback = <div style={{marginTop: 8, padding: 8, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13}}>❌ Incorreto. A resposta correta era: {q.answer}</div>
                } else if (q.type === 'text') {
                   const gapScore = scoreGapFill(answers[q.id], q.answer)
                   if (gapScore === 1) practiceFeedback = <div style={{marginTop: 8, padding: 8, background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: 13}}>✅ Correto!</div>
                   else if (gapScore === 0.5) practiceFeedback = <div style={{marginTop: 8, padding: 8, background: '#fef9c3', color: '#854d0e', borderRadius: 6, fontSize: 13}}>⚠️ Quase! (Erro de digitação). Esperado: {q.answer}</div>
                }
              }

              return (
                <div key={q.id || idx} style={{ background: '#fff', padding: 20, borderRadius: RADIUS.xl, border: '1.5px solid #ede8dc' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', marginBottom: 12, lineHeight: 1.5 }}>
                    <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, marginRight: 8, fontSize: 12 }}>
                      Questão {idx + 1}
                    </span>
                    {q.stem}
                  </div>

                  {q.options && q.options.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {shuffled.map((opt, oIdx) => {
                        const isSelected = answers[q.id] === opt
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => handleSelectOption(q.id, opt)}
                            style={{
                              textAlign: 'left', padding: '10px 14px', borderRadius: RADIUS.md,
                              border: `1.5px solid ${isSelected ? '#8b5e3c' : '#ede8dc'}`,
                              background: isSelected ? '#fdf8f2' : '#faf8f5',
                              color: isSelected ? '#8b5e3c' : '#2c1a0e',
                              fontSize: TEXT.body, fontWeight: isSelected ? 700 : 500,
                              cursor: 'pointer', transition: 'all 0.15s'
                            }}
                          >
                            {String.fromCharCode(65 + oIdx)}) {opt}
                          </button>
                        )
                      })}
                      {practiceFeedback}
                    </div>
                  ) : (
                    <>
                      {isEssay && (
                        <details style={{ marginBottom: 16, border: '1px solid #bfdbfe', borderRadius: RADIUS.lg, overflow: 'hidden' }}>
                          <summary style={{ cursor: 'pointer', padding: 12, background: '#eff6ff', fontWeight: 600, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>📋</span><span>Ver Rubrica de Avaliação Cambridge</span>
                          </summary>
                          <div style={{ padding: 16, fontSize: 14 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                              <thead style={{ background: '#eff6ff' }}>
                                <tr>
                                  <th style={{ border: '1px solid #e5e7eb', padding: 8, textAlign: 'left' }}>Critério</th>
                                  <th style={{ border: '1px solid #e5e7eb', padding: 8 }}>Escala</th>
                                  <th style={{ border: '1px solid #e5e7eb', padding: 8, textAlign: 'left' }}>O que avalia</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  ['Content', 'Cumprimento da proposta, relevância das ideias'],
                                  ['Communicative Achievement', 'Registro, tom, engajamento do leitor'],
                                  ['Organisation', 'Parágrafos, conectivos, sequência lógica'],
                                  ['Language', 'Vocabulário, gramática, complexidade sintática']
                                ].map(([criterion, desc]) => (
                                  <tr key={criterion} style={{ border: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: 8, fontWeight: 500 }}>{criterion}</td>
                                    <td style={{ padding: 8, textAlign: 'center' }}>0 - 5</td>
                                    <td style={{ padding: 8, color: '#4b5563' }}>{desc}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p style={{ marginTop: 8, color: '#6b7280', fontSize: 12 }}>Nota final = (Content + Comm. Achievement + Organisation + Language) / 2</p>
                          </div>
                        </details>
                      )}
                      <textarea
                        rows={3}
                        value={answers[q.id] || ''}
                        onChange={e => handleSelectOption(q.id, e.target.value)}
                        placeholder="Sua resposta..."
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: RADIUS.md,
                          border: '1px solid #ede8dc', fontSize: TEXT.body, outline: 'none',
                          fontFamily: 'inherit'
                        }}
                      />
                      {practiceFeedback}
                    </>
                  )}
                </div>
              )
            })}

            <button
              type="submit"
              style={{
                padding: '14px', background: '#2d9d5d', color: '#fff',
                border: 'none', borderRadius: RADIUS.lg, fontSize: 15, fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 4px 14px rgba(45,157,93,0.3)'
              }}
            >
              Finalizar e Enviar Respostas
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}></div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#2c1a0e' }}>
              Prova Enviada com Sucesso!
            </h3>
            <p style={{ fontSize: 14, color: '#7a5c42', margin: '8px 0 20px 0' }}>
              Obrigado, <strong>{studentName}</strong>. Suas respostas foram computadas e enviadas diretamente para o diário do professor.
            </p>
            {kioskMode && tabSwitchCount > 0 && (
              <p style={{ fontSize: 14, color: '#dc2626', fontWeight: 600, margin: '8px 0' }}>
                Tentativas de saída detectadas: {tabSwitchCount}
              </p>
            )}
            {score !== null && (
              <div style={{
                background: '#f0fff4', border: '2px solid #2d9d5d',
                borderRadius: RADIUS.xl, padding: 20, display: 'inline-block', minWidth: 200
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#2d9d5d', textTransform: 'uppercase' }}>Sua Nota:</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#2d9d5d' }}>{score} / 10</div>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <button
                onClick={onClose}
                style={{ padding: '10px 24px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 800, cursor: 'pointer' }}
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