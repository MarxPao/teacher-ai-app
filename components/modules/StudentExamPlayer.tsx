'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useRef } from 'react'

import {
  CatSessionState,
  startCatSession,
  recordCatAnswer,
  selectNextCatQuestion,
  interpretCatResult,
  getQuestionRung
} from '@/lib/catEngine'
import {
  QuestionScaffolding,
  StudentHintStatus,
  buildQuestionScaffolding,
  requestNextHint
} from '@/lib/scaffoldingEngine'
import {
  getGamificationProfile,
  recordQuestionResult,
  AVAILABLE_BADGES,
  StudentGamificationProfile,
  StudentBadge
} from '@/lib/studentGamification'

export interface OnlineQuestion {
  id: string
  stem: string
  type: 'multiple_choice' | 'text' | 'true_false'
  options?: string[]
  answer?: string
  explanation?: string
  distractorExplanations?: Record<string, string>
  bloomLevel?: string
  difficultyLevel?: string
  pValue?: number
  dataset?: {
    weight?: string
  }
}

export interface OnlineExamProps {
  title: string
  schoolName?: string
  className?: string
  mode?: 'exam' | 'exercise' | 'practice' | 'adaptive'
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

export function getDiagnosticFeedbackForOption(
  q: { answer?: string; explanation?: string; distractorExplanations?: Record<string, string>; stem?: string },
  selectedOption: string
): { isCorrect: boolean; feedbackText: string; ruleHint?: string } {
  if (!q.answer) {
    return { isCorrect: true, feedbackText: 'Resposta registrada com sucesso.' }
  }

  const cleanSel = selectedOption.trim().toLowerCase()
  const cleanAns = q.answer.trim().toLowerCase()
  const isCorrect = cleanSel === cleanAns || cleanSel.startsWith(cleanAns) || cleanAns.startsWith(cleanSel)

  if (isCorrect) {
    return {
      isCorrect: true,
      feedbackText: q.explanation || 'Excelente! Você aplicou o conceito corretamente.',
      ruleHint: 'Domínio conceitual consolidado neste item.'
    }
  }

  // 1. Explicação explícita do distrator se cadastrada
  if (q.distractorExplanations && q.distractorExplanations[selectedOption]) {
    return {
      isCorrect: false,
      feedbackText: q.distractorExplanations[selectedOption],
      ruleHint: `Gabarito esperado: ${q.answer}`
    }
  }

  // 2. Explicação geral da questão se cadastrada
  if (q.explanation) {
    return {
      isCorrect: false,
      feedbackText: `A alternativa "${selectedOption}" está incorreta. ${q.explanation}`,
      ruleHint: `Gabarito correto: ${q.answer}`
    }
  }

  // 3. Diagnóstico heurístico padrão de distratores
  let diagnostic = `A alternativa "${selectedOption}" não atende à regra exigida pelo enunciado.`
  const optLow = selectedOption.toLowerCase()
  
  if (optLow.includes("don't") || optLow.includes('doesnt') || optLow.includes("doesn't")) {
    diagnostic = `Atenção à concordância de 3ª pessoa do singular (He/She/It) com o verbo auxiliar correto.`
  } else if (optLow.includes('went') || optLow.includes('gone') || optLow.includes('goed')) {
    diagnostic = `Atenção à distinção entre Past Simple (ação pontual concluída) e Particípio Passado (Present Perfect).`
  } else if (optLow.includes('more') || optLow.includes('er')) {
    diagnostic = `Atenção à regra de comparativos para adjetivos curtos (-er) vs. longos (more + adj).`
  }

  return {
    isCorrect: false,
    feedbackText: diagnostic,
    ruleHint: `Gabarito esperado: ${q.answer}`
  }
}

export default function StudentExamPlayer({
  title,
  schoolName = 'ESCOLA / INSTITUTO DE ENSINO',
  className = 'Turma 8º Ano',
  mode = 'exam',
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
  
  const [examMode, setExamMode] = useState<'exam' | 'practice' | 'adaptive'>(
    mode === 'adaptive' ? 'adaptive' : mode === 'exercise' || mode === 'practice' ? 'practice' : 'exam'
  )

  // ─── Estados para CAT (Computerized Adaptive Testing) ─────────────
  const [catSession, setCatSession] = useState<CatSessionState | null>(null)
  const [currentCatQuestion, setCurrentCatQuestion] = useState<OnlineQuestion | null>(null)
  const [catFinalReport, setCatFinalReport] = useState<{
    score0to10: number
    levelLabel: string
    cefrEquivalent: string
    diagnosticDescription: string
  } | null>(null)

  // ─── Estados para Scaffolding de Dicas em 3 Camadas ───────────────
  const [hintsMap, setHintsMap] = useState<Record<string, StudentHintStatus>>({})

  // ─── Estados para Gamificação (Streaks, Badges e XP — Item 16) ────
  const [gamification, setGamification] = useState<StudentGamificationProfile | null>(null)
  const [newBadgeNotification, setNewBadgeNotification] = useState<StudentBadge | null>(null)

  useEffect(() => {
    if (studentName.trim()) {
      setGamification(getGamificationProfile(studentName.trim().toLowerCase()))
    }
  }, [studentName])

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

  // ─── Manipulador de Dica Progressiva (Scaffolding em 3 Camadas) ───
  const handleRequestHint = (question: OnlineQuestion) => {
    const current = hintsMap[question.id] || {
      questionId: question.id,
      currentTier: 0,
      scoreMultiplier: 1.0,
      eliminatedOptions: [],
    }
    if (current.currentTier >= 3) {
      toast.info('Você já utilizou todas as 3 camadas de ajuda para esta questão.')
      return
    }
    const scaffolding = buildQuestionScaffolding(question)
    const updated = requestNextHint(current, scaffolding)
    setHintsMap(prev => ({ ...prev, [question.id]: updated }))
  }

  // ─── Inicializador do Modo CAT (Adaptativo) ───────────────────────
  const handleStartCat = () => {
    if (!studentName.trim()) {
      toast.info('Por favor, informe seu nome para iniciar o teste adaptativo.')
      return
    }
    const session = startCatSession(studentName.trim().toLowerCase(), studentName.trim(), title)
    const firstQ = selectNextCatQuestion(session, questions)
    if (!firstQ) {
      toast.error('Nenhuma questão disponível no banco para teste adaptativo.')
      return
    }
    setCatSession(session)
    setCurrentCatQuestion(firstQ)
  }

  // ─── Submissão de Resposta no Modo CAT ─────────────────────────────
  const handleCatAnswerSubmit = () => {
    if (!catSession || !currentCatQuestion) return
    const sel = answers[currentCatQuestion.id]
    if (!sel) {
      toast.info('Selecione uma resposta antes de avançar.')
      return
    }

    let isCorrect = false
    if (currentCatQuestion.type === 'multiple_choice' && currentCatQuestion.answer) {
      isCorrect = sel.trim().toLowerCase() === currentCatQuestion.answer.trim().toLowerCase()
    } else if (currentCatQuestion.type === 'text' && currentCatQuestion.answer) {
      isCorrect = scoreGapFill(sel, currentCatQuestion.answer) >= 0.5
    }

    const updatedSession = recordCatAnswer(catSession, currentCatQuestion, isCorrect)
    setCatSession(updatedSession)

    const hintTier = hintsMap[currentCatQuestion.id]?.currentTier || 0
    const gamResult = recordQuestionResult(
      studentName.trim().toLowerCase(),
      isCorrect,
      currentCatQuestion.difficultyLevel || 'B1',
      hintTier
    )
    setGamification(gamResult.profile)
    if (gamResult.newBadges.length > 0) {
      setNewBadgeNotification(gamResult.newBadges[0])
      toast.success(`🎉 Conquista: ${gamResult.newBadges[0].title}!`)
    }

    if (updatedSession.isTerminated) {
      const report = interpretCatResult(updatedSession.currentTheta)
      setCatFinalReport(report)
      setScore(report.score0to10)
      setSubmitted(true)
      if (onComplete) onComplete(studentName, report.score0to10, 10)
    } else {
      const nextQ = selectNextCatQuestion(updatedSession, questions)
      if (!nextQ) {
        const report = interpretCatResult(updatedSession.currentTheta)
        setCatFinalReport(report)
        setScore(report.score0to10)
        setSubmitted(true)
        if (onComplete) onComplete(studentName, report.score0to10, 10)
      } else {
        setCurrentCatQuestion(nextQ)
      }
    }
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

    try {
      let finalProfile: StudentGamificationProfile | null = null
      let latestBadges: StudentBadge[] = []
      questions.forEach((q) => {
        let isCorrect = false
        if (q.type === 'multiple_choice' && q.answer) {
          isCorrect = answers[q.id]?.trim().toLowerCase() === q.answer.trim().toLowerCase()
        } else if (q.type === 'text' && q.answer) {
          isCorrect = scoreGapFill(answers[q.id] || '', q.answer) === 1
        }
        const hintTier = hintsMap[q.id]?.currentTier || 0
        const res = recordQuestionResult(
          studentName.trim().toLowerCase(),
          isCorrect,
          q.difficultyLevel || 'B1',
          hintTier
        )
        finalProfile = res.profile
        if (res.newBadges.length > 0) latestBadges.push(...res.newBadges)
      })
      if (finalProfile) setGamification(finalProfile)
      if (latestBadges.length > 0) {
        setNewBadgeNotification(latestBadges[0])
        toast.success(`🎉 Conquista: ${latestBadges[0].title}!`)
      }
    } catch {}

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
              <button type="button" onClick={() => setExamMode('exam')} style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: examMode === 'exam' ? '1.5px solid #1d4ed8' : '1px solid #d1d5db', background: examMode === 'exam' ? '#2563eb' : '#f9fafb', color: examMode === 'exam' ? '#fff' : '#374151', fontWeight: 700 }}>📝 Prova Oficial</button>
              <button type="button" onClick={() => setExamMode('practice')} style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: examMode === 'practice' ? '1.5px solid #15803d' : '1px solid #d1d5db', background: examMode === 'practice' ? '#16a34a' : '#f9fafb', color: examMode === 'practice' ? '#fff' : '#374151', fontWeight: 700 }}>🎯 Treino & Dicas</button>
              <button type="button" onClick={() => setExamMode('adaptive')} style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: examMode === 'adaptive' ? '1.5px solid #7c3aed' : '1px solid #d1d5db', background: examMode === 'adaptive' ? '#8b5cf6' : '#f9fafb', color: examMode === 'adaptive' ? '#fff' : '#374151', fontWeight: 700 }}>⚡ Adaptativo (CAT)</button>
            </div>
            <button
              onClick={onClose}
              style={{ padding: '6px 12px', background: '#f5f0e8', border: '1px solid #ede8dc', borderRadius: RADIUS.md, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Banner Informativo de Modo Pedagógico */}
        <div style={{
          background: examMode === 'adaptive' ? '#faf5ff' : examMode === 'practice' ? '#f0fdf4' : '#f8fafc',
          border: `1px solid ${examMode === 'adaptive' ? '#e9d5ff' : examMode === 'practice' ? '#bbf7d0' : '#e2e8f0'}`,
          borderRadius: RADIUS.md,
          padding: '10px 16px',
          marginBottom: 20,
          fontSize: 13,
          color: examMode === 'adaptive' ? '#6b21a8' : examMode === 'practice' ? '#166534' : '#475569',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          {examMode === 'adaptive' ? (
            <>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span><b>Teste Adaptativo Computadorizado (CAT):</b> As questões se adaptam ao seu desempenho em tempo real. Cada acerto eleva a dificuldade e cada erro recalibra a escada para estimar sua proficiência com máxima precisão.</span>
            </>
          ) : examMode === 'practice' ? (
            <>
              <span style={{ fontSize: 16 }}>🎯</span>
              <span><b>Modo Treino com Scaffolding (Andaime Cognitivo):</b> Peça até 3 camadas de dicas progressivas (Conceito → Eliminação de Distrator → Roteiro) para destravar o raciocínio sem entregar a resposta.</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 16 }}>🛡️</span>
              <span><b>Modo Prova Oficial:</b> Suas respostas ficam gravadas e o gabarito completo com nota final será liberado somente após o envio.</span>
            </>
          )}
        </div>

        {/* Barra de Gamificação do Aluno (Item 16) */}
        {studentName.trim() && (
          <div style={{
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            border: '1.5px solid #fde68a',
            borderRadius: RADIUS.md,
            padding: '10px 16px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: '#f59e0b', color: '#fff', borderRadius: RADIUS.full,
                padding: '4px 10px', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4
              }}>
                <span>🔥</span>
                <span>{gamification?.currentStreak || 0} seguidas</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                ⚡ {gamification?.xp || 0} XP • Nível {gamification?.level || 1}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#78350f' }}>Conquistas:</span>
              <span style={{ fontSize: 14 }}>
                {gamification && gamification.unlockedBadges.length > 0 ? (
                  gamification.unlockedBadges.map(bId => {
                    const badge = AVAILABLE_BADGES.find(b => b.id === bId)
                    return badge ? (
                      <span key={bId} title={`${badge.title}: ${badge.description}`} style={{ marginLeft: 3 }}>
                        {badge.icon}
                      </span>
                    ) : null
                  })
                ) : (
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>Nenhuma ainda</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Banner de Nova Conquista Desbloqueada */}
        {newBadgeNotification && (
          <div style={{
            background: '#ecfdf5',
            border: '2px solid #10b981',
            borderRadius: RADIUS.lg,
            padding: '12px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'bounce 0.5s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>{newBadgeNotification.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46' }}>
                  🎉 Nova Conquista Desbloqueada: {newBadgeNotification.title}!
                </div>
                <div style={{ fontSize: 12, color: '#047857' }}>
                  {newBadgeNotification.description}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewBadgeNotification(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#065f46' }}
            >
              ✕
            </button>
          </div>
        )}

        {!submitted ? (
          examMode === 'adaptive' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!catSession ? (
                <div style={{ background: '#fdf8f2', padding: 24, borderRadius: RADIUS.xl, border: '1px solid #ede8dc', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', margin: '0 0 8px' }}>Iniciar Bateria Adaptativa</h3>
                  <p style={{ fontSize: 13, color: '#7a5c42', maxWidth: 460, margin: '0 auto 16px' }}>
                    O teste adaptativo ajusta a dificuldade das questões a cada resposta para mapear sua proficiência exata com o menor número de itens possível.
                  </p>
                  <div style={{ maxWidth: 360, margin: '0 auto 16px', textAlign: 'left' }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e', display: 'block', marginBottom: 4 }}>Nome do Aluno:</label>
                    <input
                      value={studentName}
                      onChange={e => setStudentName(e.target.value)}
                      placeholder="Ex: Lucas Mendes"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: RADIUS.md, border: '1.5px solid #8b5cf6', fontSize: 14, outline: 'none' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleStartCat}
                    style={{ padding: '10px 24px', borderRadius: RADIUS.md, background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}
                  >
                    Iniciar Teste Adaptativo
                  </button>
                </div>
              ) : currentCatQuestion ? (
                <div style={{ background: '#fff', padding: 24, borderRadius: RADIUS.xl, border: '2px solid #e9d5ff', boxShadow: '0 4px 20px rgba(139,92,246,0.1)' }}>
                  {/* Status Bar do CAT */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f3e8ff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: '#7c3aed', color: '#fff', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                        Item {catSession.history.length + 1} de ~{Math.min(12, questions.length)}
                      </span>
                      <span style={{ fontSize: 12, color: '#6b21a8', fontWeight: 700 }}>
                        Degrau Atual: {catSession.currentRung}/4 ({catSession.currentRung === 1 ? 'Fácil' : catSession.currentRung === 2 ? 'Médio-Baixo' : catSession.currentRung === 3 ? 'Médio-Alto' : 'Desafio'})
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                      Margem de Erro (SE): ±{catSession.standardError.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    {(() => {
                      const count = (currentCatQuestion as any).responseHistory?.length || 0
                      const isEmpirical = count >= 10
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 10px',
                            borderRadius: RADIUS.full,
                            fontSize: 11,
                            fontWeight: 700,
                            background: isEmpirical ? '#ecfdf5' : '#fffbeb',
                            color: isEmpirical ? '#047857' : '#b45309',
                            border: `1px solid ${isEmpirical ? '#a7f3d0' : '#fde68a'}`
                          }}
                          title={isEmpirical
                            ? `Item com calibração empírica estável baseada em ${count} respostas reais de alunos.`
                            : 'Item operando sob estimativa curricular inicial (Seed baseada em BNCC/CEFR). Passará ao status empírico após acumular N >= 10 respostas de alunos reais.'}
                        >
                          <i className={`ti ${isEmpirical ? 'ti-chart-dots' : 'ti-plant'}`} style={{ fontSize: 12 }} />
                          {isEmpirical ? `[Calibrado Empiricamente (N=${count})]` : '[Estimativa Curricular Inicial (Seed)]'}
                        </span>
                      )
                    })()}
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: '#2c1a0e', marginBottom: 16, lineHeight: 1.5 }}>
                    {currentCatQuestion.stem}
                  </div>

                  {currentCatQuestion.options && currentCatQuestion.options.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {currentCatQuestion.options.map((opt, oIdx) => {
                        const isSelected = answers[currentCatQuestion.id] === opt
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => handleSelectOption(currentCatQuestion.id, opt)}
                            style={{
                              textAlign: 'left', padding: '12px 16px', borderRadius: RADIUS.md,
                              border: `2px solid ${isSelected ? '#7c3aed' : '#ede8dc'}`,
                              background: isSelected ? '#faf5ff' : '#fff',
                              color: isSelected ? '#6b21a8' : '#2c1a0e',
                              fontSize: TEXT.body, fontWeight: isSelected ? 700 : 500,
                              cursor: 'pointer', transition: 'all 0.15s'
                            }}
                          >
                            {String.fromCharCode(65 + oIdx)}) {opt}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <input
                      value={answers[currentCatQuestion.id] || ''}
                      onChange={e => handleSelectOption(currentCatQuestion.id, e.target.value)}
                      placeholder="Sua resposta..."
                      style={{ width: '100%', padding: '12px 16px', borderRadius: RADIUS.md, border: '1px solid #ede8dc', fontSize: 14 }}
                    />
                  )}

                  <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleCatAnswerSubmit}
                      style={{ padding: '12px 28px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}
                    >
                      Confirmar Resposta e Próximo Item →
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
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
                  const diag = getDiagnosticFeedbackForOption(q, answers[q.id])
                  if (diag.isCorrect) {
                    practiceFeedback = (
                      <div style={{ marginTop: 10, padding: 12, background: '#dcfce7', color: '#166534', borderRadius: 8, fontSize: 13, border: '1px solid #86efac' }}>
                        <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span>✅</span> Resposta Correta!
                        </div>
                        <div>{diag.feedbackText}</div>
                      </div>
                    )
                  } else {
                    practiceFeedback = (
                      <div style={{ marginTop: 10, padding: 12, background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13, border: '1px solid #fca5a5' }}>
                        <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span>❌</span> Alternativa Incorreta — Análise Conceitual:
                        </div>
                        <div style={{ marginBottom: 6, lineHeight: 1.4 }}>{diag.feedbackText}</div>
                        {diag.ruleHint && (
                          <div style={{ fontSize: 12, color: '#7f1d1d', fontWeight: 600, background: '#fee2e2', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                            💡 {diag.ruleHint}
                          </div>
                        )}
                      </div>
                    )
                  }
                } else if (q.type === 'text') {
                  const gapScore = scoreGapFill(answers[q.id], q.answer)
                  if (gapScore === 1) {
                    practiceFeedback = <div style={{ marginTop: 10, padding: 10, background: '#dcfce7', color: '#166534', borderRadius: 8, fontSize: 13, border: '1px solid #86efac' }}>✅ Resposta Correta! {q.explanation || ''}</div>
                  } else if (gapScore === 0.5) {
                    practiceFeedback = <div style={{ marginTop: 10, padding: 10, background: '#fef9c3', color: '#854d0e', borderRadius: 8, fontSize: 13, border: '1px solid #fde047' }}>⚠️ Quase correto! (Pequeno deslize ortográfico). Resposta esperada: <b>{q.answer}</b></div>
                  } else {
                    practiceFeedback = <div style={{ marginTop: 10, padding: 10, background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13, border: '1px solid #fca5a5' }}>❌ Incorreto. {q.explanation ? q.explanation : `Gabarito esperado: "${q.answer}"`}</div>
                  }
                }
              }


              return (
                <div key={q.id || idx} style={{ background: '#fff', padding: 20, borderRadius: RADIUS.xl, border: '1.5px solid #ede8dc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                      Questão {idx + 1}
                    </span>
                    {(() => {
                      const count = (q as any).responseHistory?.length || 0
                      const isEmpirical = count >= 10
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '2px 8px',
                            borderRadius: RADIUS.full,
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: isEmpirical ? '#ecfdf5' : '#fffbeb',
                            color: isEmpirical ? '#047857' : '#b45309',
                            border: `1px solid ${isEmpirical ? '#a7f3d0' : '#fde68a'}`
                          }}
                          title={isEmpirical
                            ? `Item com calibração empírica estável baseada em ${count} respostas reais.`
                            : 'Item com estimativa curricular inicial (Seed). Atingirá status empírico após N >= 10 respostas reais.'}
                        >
                          <i className={`ti ${isEmpirical ? 'ti-chart-dots' : 'ti-plant'}`} style={{ fontSize: 11 }} />
                          {isEmpirical ? `[Calibrado Empiricamente (N=${count})]` : '[Estimativa Curricular Inicial (Seed)]'}
                        </span>
                      )
                    })()}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', marginBottom: 12, lineHeight: 1.5 }}>
                    {q.stem}
                  </div>

                  {q.options && q.options.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Botão de Scaffolding (Dicas em 3 Camadas) em modo treino/exercício */}
                      {examMode === 'practice' && (
                        <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#7a5c42', fontWeight: 600 }}>
                            {hintsMap[q.id]?.currentTier
                              ? `💡 Camada ${hintsMap[q.id].currentTier}/3 ativa (Peso: ${Math.round(hintsMap[q.id].scoreMultiplier * 100)}%)`
                              : '💡 Precisa de apoio cognitivo?'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRequestHint(q)}
                            disabled={(hintsMap[q.id]?.currentTier || 0) >= 3}
                            style={{
                              padding: '4px 10px',
                              borderRadius: RADIUS.md,
                              border: '1px solid #d97706',
                              background: (hintsMap[q.id]?.currentTier || 0) >= 3 ? '#f5f0e8' : '#fef3c7',
                              color: '#92400e',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: (hintsMap[q.id]?.currentTier || 0) >= 3 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {(hintsMap[q.id]?.currentTier || 0) === 0 ? '✨ Pedir Dica 1 (Conceito)' : (hintsMap[q.id]?.currentTier || 0) === 1 ? '✨ Dica 2 (Eliminar Distrator)' : '✨ Dica 3 (Resolução)'}
                          </button>
                        </div>
                      )}

                      {/* Exibição da Dica Ativa */}
                      {hintsMap[q.id]?.currentTier && (() => {
                        const scaff = buildQuestionScaffolding(q)
                        const tier = hintsMap[q.id].currentTier
                        return (
                          <div style={{ padding: '10px 14px', borderRadius: RADIUS.md, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, color: '#92400e', marginBottom: 8 }}>
                            {tier >= 1 && (
                              <div style={{ marginBottom: tier > 1 ? 6 : 0 }}>
                                <b>🧠 {scaff.tier1_concept.title}:</b> {scaff.tier1_concept.content}
                              </div>
                            )}
                            {tier >= 2 && (
                              <div style={{ marginBottom: tier > 2 ? 6 : 0, color: '#b45309' }}>
                                <b>🚫 Distrator Eliminado:</b> {scaff.tier2_elimination.rationale}
                              </div>
                            )}
                            {tier >= 3 && (
                              <div style={{ color: '#78350f' }}>
                                <b>🧭 Roteiro Guiado:</b>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                  {scaff.tier3_walkthrough.steps.map((st, sIdx) => <li key={sIdx}>{st}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {shuffled.map((opt, oIdx) => {
                        const isSelected = answers[q.id] === opt
                        const isEliminated = hintsMap[q.id]?.eliminatedOptions?.includes(opt)
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={isEliminated}
                            onClick={() => handleSelectOption(q.id, opt)}
                            style={{
                              textAlign: 'left', padding: '10px 14px', borderRadius: RADIUS.md,
                              border: `1.5px solid ${isEliminated ? '#d1d5db' : isSelected ? '#8b5e3c' : '#ede8dc'}`,
                              background: isEliminated ? '#f3f4f6' : isSelected ? '#fdf8f2' : '#faf8f5',
                              color: isEliminated ? '#9ca3af' : isSelected ? '#8b5e3c' : '#2c1a0e',
                              textDecoration: isEliminated ? 'line-through' : 'none',
                              fontSize: TEXT.body, fontWeight: isSelected ? 700 : 500,
                              cursor: isEliminated ? 'not-allowed' : 'pointer', transition: 'all 0.15s'
                            }}
                          >
                            {String.fromCharCode(65 + oIdx)}) {opt} {isEliminated && '❌ (Distrator Descartado)'}
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
          )
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

            {catFinalReport && (
              <div style={{
                marginTop: 20, padding: 20, borderRadius: RADIUS.xl,
                background: '#faf5ff', border: '2px solid #d8b4fe', textAlign: 'left', maxWidth: 500, margin: '20px auto 0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>⚡</span>
                  <strong style={{ fontSize: 16, color: '#6b21a8' }}>Resultado Diagnóstico Adaptativo (CAT)</strong>
                </div>
                <div style={{ display: 'flex', gap: 12, margin: '10px 0' }}>
                  <div style={{ background: '#fff', padding: '8px 14px', borderRadius: 8, border: '1px solid #e9d5ff' }}>
                    <span style={{ fontSize: 11, color: '#7c3aed', display: 'block' }}>Nível Estimado:</span>
                    <strong style={{ fontSize: 14, color: '#2c1a0e' }}>{catFinalReport.levelLabel}</strong>
                  </div>
                  <div style={{ background: '#fff', padding: '8px 14px', borderRadius: 8, border: '1px solid #e9d5ff' }}>
                    <span style={{ fontSize: 11, color: '#7c3aed', display: 'block' }}>Equivalência:</span>
                    <strong style={{ fontSize: 14, color: '#2c1a0e' }}>{catFinalReport.cefrEquivalent}</strong>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: '#581c87', margin: 0, lineHeight: 1.5 }}>
                  {catFinalReport.diagnosticDescription}
                </p>
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