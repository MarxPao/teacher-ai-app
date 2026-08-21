'use client'
import React, { useState } from 'react'

export interface ReflectionData {
  whatWorked: string
  whatToAdjust: string
  studentWithDifficulty: string   // nome do aluno ou vazio
  studentDifficultyNote: string   // o que o aluno teve dificuldade
  completedAt: string             // ISO date
}

interface ReflectionModalProps {
  planId: string
  planTopic: string
  className: string
  onSave: (data: ReflectionData) => void
  onDismiss: () => void
}

export default function ReflectionModal({ planId, planTopic, className, onSave, onDismiss }: ReflectionModalProps) {
  const [whatWorked, setWhatWorked] = useState('')
  const [whatToAdjust, setWhatToAdjust] = useState('')
  const [studentWithDifficulty, setStudentWithDifficulty] = useState('')
  const [studentDifficultyNote, setStudentDifficultyNote] = useState('')

  const handleSave = () => {
    const data: ReflectionData = {
      whatWorked,
      whatToAdjust,
      studentWithDifficulty,
      studentDifficultyNote,
      completedAt: new Date().toISOString()
    }

    // Salvar no banco de planos
    try {
      const stored = JSON.parse(localStorage.getItem('teacher_lesson_plans_bank') || '[]')
      const idx = stored.findIndex((p: any) => p.id === planId)
      if (idx >= 0) {
        stored[idx].postLessonNotes = `✅ ${new Date().toLocaleDateString('pt-BR')}\n\nO que funcionou: ${whatWorked}\n\nAjustar: ${whatToAdjust}`
        stored[idx].completedAt = data.completedAt
        if (studentWithDifficulty) {
          stored[idx].postLessonNotes += `\n\nAluno com dificuldade: ${studentWithDifficulty} — ${studentDifficultyNote}`
        }
        localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(stored))
      }
    } catch {}

    // Alimentar studentMemory se aluno mencionado
    if (studentWithDifficulty.trim()) {
      try {
        const memKey = 'teacher_student_memory'
        const memory = JSON.parse(localStorage.getItem(memKey) || '{}')
        const name = studentWithDifficulty.trim()
        if (!memory[name]) memory[name] = { observations: [] }
        if (!memory[name].observations) memory[name].observations = []
        memory[name].observations.push({
          date: new Date().toISOString().split('T')[0],
          note: `Dificuldade em "${planTopic}" (${className}): ${studentDifficultyNote}`,
          type: 'lesson_reflection'
        })
        localStorage.setItem(memKey, JSON.stringify(memory))
      } catch {}
    }

    // Salvar reflection summary para próxima aula da turma
    try {
      const summaryKey = `teacher_last_lesson_summary_${className.replace(/\s/g, '_')}`
      localStorage.setItem(summaryKey, JSON.stringify({
        topic: planTopic,
        date: new Date().toISOString().split('T')[0],
        summary: `Na última aula (${planTopic}): ${whatWorked}. ${whatToAdjust ? 'Ajustar: ' + whatToAdjust : ''}`.trim()
      }))
    } catch {}

    onSave(data)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="p-5 border-b bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <h3 className="font-bold text-gray-800">Aula concluída!</h3>
              <p className="text-sm text-gray-500">{planTopic} · {className}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">🌟 O que funcionou bem?</label>
            <textarea
              value={whatWorked}
              onChange={e => setWhatWorked(e.target.value)}
              placeholder="Ex: O warm-up com o vídeo engajou muito..."
              className="w-full border rounded-xl p-3 text-sm resize-none h-20 focus:ring-2 focus:ring-green-300 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">⚠️ O que ajustar na próxima?</label>
            <textarea
              value={whatToAdjust}
              onChange={e => setWhatToAdjust(e.target.value)}
              placeholder="Ex: O tempo para a produção foi curto..."
              className="w-full border rounded-xl p-3 text-sm resize-none h-20 focus:ring-2 focus:ring-amber-300 focus:border-transparent"
            />
          </div>

          <div className="border rounded-xl p-3 space-y-2 bg-blue-50">
            <label className="block text-sm font-medium text-blue-700">👤 Aluno com dificuldade específica? (opcional)</label>
            <input
              type="text"
              value={studentWithDifficulty}
              onChange={e => setStudentWithDifficulty(e.target.value)}
              placeholder="Nome do aluno"
              className="w-full border rounded-lg p-2 text-sm"
            />
            {studentWithDifficulty && (
              <textarea
                value={studentDifficultyNote}
                onChange={e => setStudentDifficultyNote(e.target.value)}
                placeholder="Qual foi a dificuldade observada?"
                className="w-full border rounded-lg p-2 text-sm resize-none h-16"
              />
            )}
            {studentWithDifficulty && (
              <p className="text-xs text-blue-600">💾 Será salvo automaticamente na memória do aluno</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200"
          >
            Pular
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
          >
            💾 Salvar reflexão
          </button>
        </div>
      </div>
    </div>
  )
}
