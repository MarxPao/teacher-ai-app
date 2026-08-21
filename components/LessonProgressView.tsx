'use client'
import React, { useState, useEffect } from 'react'

interface LessonStage {
  name: string
  durationMin: number
  teacherAction: string
  studentAction: string
  completed?: boolean
}

interface LessonProgressViewProps {
  planId: string
  topic: string
  className: string
  stages: LessonStage[]
  onStagesUpdate: (stages: LessonStage[]) => void
  onFinish: () => void
  onClose: () => void
}

export default function LessonProgressView({
  planId, topic, className, stages, onStagesUpdate, onFinish, onClose
}: LessonProgressViewProps) {
  const [activeStageIdx, setActiveStageIdx] = useState<number>(() => {
    // Resume from sessionStorage
    try {
      const saved = JSON.parse(sessionStorage.getItem(`lesson_progress_${planId}`) || '{}')
      return saved.activeStageIdx ?? stages.findIndex(s => !s.completed)
    } catch { return 0 }
  })
  const [stagesState, setStagesState] = useState<LessonStage[]>(stages)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [timerRunning, setTimerRunning] = useState(false)

  // Persist to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(`lesson_progress_${planId}`, JSON.stringify({ activeStageIdx, stagesState }))
    } catch {}
  }, [activeStageIdx, stagesState, planId])

  // Timer
  useEffect(() => {
    if (!timerRunning || timeLeft === null) return
    if (timeLeft <= 0) { setTimerRunning(false); return }
    const interval = setInterval(() => setTimeLeft(t => (t ?? 1) - 1), 1000)
    return () => clearInterval(interval)
  }, [timerRunning, timeLeft])

  const startTimer = (stage: LessonStage) => {
    setTimeLeft(stage.durationMin * 60)
    setTimerRunning(true)
  }

  const toggleStage = (idx: number) => {
    const updated = stagesState.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s)
    setStagesState(updated)
    onStagesUpdate(updated)
    if (!updated[idx].completed === false && idx < stagesState.length - 1) {
      setActiveStageIdx(idx + 1)
    }
  }

  const completedCount = stagesState.filter(s => s.completed).length
  const progressPct = stagesState.length > 0 ? (completedCount / stagesState.length) * 100 : 0
  const allDone = completedCount === stagesState.length

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const activeStage = stagesState[activeStageIdx]

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
        <div>
          <p className="text-xs text-gray-400">{className}</p>
          <h2 className="font-bold text-sm truncate max-w-[200px]">{topic}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{completedCount}/{stagesState.length} etapas</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-800">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Active stage focus */}
      {activeStage && (
        <div className="bg-indigo-900 border-b border-indigo-700 px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-indigo-300 font-medium">ETAPA ATUAL</span>
            <span className="text-xs bg-indigo-700 px-2 py-0.5 rounded-full">{activeStage.durationMin} min</span>
          </div>
          <h3 className="font-bold text-lg mb-3">{activeStage.name}</h3>
          <p className="text-sm text-indigo-200 mb-1"><span className="font-medium">Professor:</span> {activeStage.teacherAction}</p>
          <p className="text-sm text-indigo-300"><span className="font-medium">Alunos:</span> {activeStage.studentAction}</p>

          {/* Timer */}
          <div className="mt-4 flex items-center gap-3">
            {timeLeft !== null ? (
              <>
                <span className={`text-3xl font-mono font-bold ${
                  timeLeft <= 60 ? 'text-red-400 animate-pulse' :
                  timeLeft <= 300 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {formatTime(timeLeft)}
                </span>
                <button
                  onClick={() => setTimerRunning(r => !r)}
                  className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-sm"
                >
                  {timerRunning ? '⏸ Pausar' : '▶ Continuar'}
                </button>
                <button
                  onClick={() => { setTimeLeft(null); setTimerRunning(false) }}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                >
                  ✕
                </button>
              </>
            ) : (
              <button
                onClick={() => startTimer(activeStage)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-sm font-medium"
              >
                ⏱ Iniciar timer ({activeStage.durationMin} min)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stage list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {stagesState.map((stage, idx) => (
          <button
            key={idx}
            onClick={() => { setActiveStageIdx(idx); setTimeLeft(null); setTimerRunning(false) }}
            className={`w-full text-left rounded-xl p-3 border transition-all ${
              idx === activeStageIdx
                ? 'border-indigo-500 bg-indigo-900/50'
                : stage.completed
                  ? 'border-green-800 bg-green-900/20 opacity-60'
                  : 'border-gray-700 bg-gray-800/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={e => { e.stopPropagation(); toggleStage(idx) }}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  stage.completed
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-gray-500'
                }`}
              >
                {stage.completed && '✓'}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${ stage.completed ? 'line-through text-gray-500' : '' }`}>
                  {stage.name}
                </p>
                <p className="text-xs text-gray-400">{stage.durationMin} min</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 bg-gray-900 border-t border-gray-700">
        {allDone ? (
          <button
            onClick={onFinish}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-base"
          >
            ✅ Aula concluída — Registrar reflexão
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveStageIdx(i => Math.max(0, i - 1))}
              disabled={activeStageIdx === 0}
              className="px-4 py-2 bg-gray-700 rounded-xl text-sm disabled:opacity-30"
            >
              ← Anterior
            </button>
            <button
              onClick={() => {
                toggleStage(activeStageIdx)
              }}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-medium"
            >
              ✓ Concluir etapa e avançar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
