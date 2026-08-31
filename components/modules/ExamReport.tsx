'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import React, { useState, useMemo } from 'react'

export interface QuestionResult {
  questionId: string
  correct: boolean
  weight: number
  bloomLevel?: string
  difficultyLevel?: string
}

export interface ExamResult {
  studentId: string
  studentName: string
  totalScore: number
  maxScore: number
  questionResults: QuestionResult[]
  submittedAt: number
  tabSwitchCount?: number
}

export interface ExamReportProps {
  examTitle: string
  results: ExamResult[]
  questionCount: number
  onClose?: () => void
}

export default function ExamReport({ examTitle, results, questionCount, onClose }: ExamReportProps) {
  const [view, setView] = useState<'overview' | 'heatmap' | 'questions'>('overview')

  const questionStats = useMemo(() => {
    return Array.from({ length: questionCount }, (_, qi) => {
      const responses = results.map(r => r.questionResults[qi]).filter(Boolean)
      const correct = responses.filter(r => r.correct).length
      const total = responses.length
      const p = total > 0 ? correct / total : 0
      return { qi, correct, total, p, label: `Q${qi + 1}` }
    })
  }, [results, questionCount])

  const avgScore = results.length > 0
    ? results.reduce((acc, r) => acc + (r.maxScore > 0 ? r.totalScore / r.maxScore * 10 : 0), 0) / results.length
    : 0
  const passCount = results.filter(r => r.maxScore > 0 && (r.totalScore / r.maxScore) * 10 >= 6).length
  const hardestQ = questionStats.length > 0 ? questionStats.slice().sort((a, b) => a.p - b.p)[0] : null

  const handleExportCSV = () => {
    const header = ['Aluno', 'Nota', ...Array.from({ length: questionCount }, (_, i) => `Q${i + 1}`)]
    const rows = results.map(r => [
      r.studentName,
      r.maxScore > 0 ? (r.totalScore / r.maxScore * 10).toFixed(1) : '0',
      ...Array.from({ length: questionCount }, (_, i) => r.questionResults[i]?.correct ? '1' : '0')
    ])
    const csv = [header, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${examTitle.replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = () => window.print()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:static print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col print:shadow-none print:max-h-none">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">📊 Relatorio da Turma</h2>
            <p className="text-sm text-gray-500 mt-0.5">{examTitle} · {results.length} aluno{results.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              ⬇️ CSV
            </button>
            <button onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
              ⬇️ PDF
            </button>
            {onClose && (
              <button onClick={onClose}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b print:hidden">
          {[
            { key: 'overview', label: 'Visão Geral', icon: 'ti-chart-line' },
            { key: 'heatmap', label: 'Heatmap', icon: 'ti-flame' },
            { key: 'questions', label: 'Por Questão', icon: 'ti-help-circle' }
          ].map(({ key, label, icon }) => (
            <button key={key} onClick={() => setView(key as typeof view)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                view === key
                  ? 'border-[#8b5e3c] text-[#8b5e3c]'
                  : 'border-transparent text-[#7a5c42] hover:text-[#2c1a0e]'
              }`}>
              <i className={`ti ${icon}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-auto flex-1 p-5">
          {view === 'overview' && (
            <div className="space-y-6">
              {/* Stats cards */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  ['Media da Turma', avgScore.toFixed(1), 'text-blue-600'],
                  ['Aprovados (>=6)', `${passCount}/${results.length}`, passCount === results.length ? 'text-green-600' : 'text-orange-500'],
                  ['Q mais errada', hardestQ?.label ?? '-', 'text-red-500'],
                ].map(([label, value, color]) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className={`text-3xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-gray-500 mt-1">{label}</div>
                  </div>
                ))}
              </div>
              {/* Histograma */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Distribuicao de Notas</h3>
                <div className="flex items-end gap-1.5 h-36 bg-gray-50 rounded-xl p-3">
                  {[0,1,2,3,4,5,6,7,8,9,10].map(grade => {
                    const count = results.filter(r =>
                      r.maxScore > 0 && Math.floor((r.totalScore / r.maxScore) * 10) === grade
                    ).length
                    const height = results.length > 0 ? (count / results.length) * 100 : 0
                    return (
                      <div key={grade} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-400">{count > 0 ? count : ''}</span>
                        <div
                          className={`w-full rounded-t transition-all ${
                            grade >= 6 ? 'bg-green-400' : grade >= 4 ? 'bg-yellow-400' : 'bg-red-400'
                          }`}
                          style={{ height: `${Math.max(0, height)}%`, minHeight: count > 0 ? '4px' : '0' }}
                        />
                        <span className="text-xs text-gray-500">{grade}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {view === 'heatmap' && (
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border border-gray-200 font-medium sticky left-0 bg-gray-50">Aluno</th>
                    {Array.from({ length: questionCount }, (_, i) => (
                      <th key={i} className="p-2 border border-gray-200 font-medium min-w-[36px]">Q{i+1}</th>
                    ))}
                    <th className="p-2 border border-gray-200 font-medium">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.studentId} className="hover:bg-gray-50">
                      <td className="p-2 border border-gray-200 whitespace-nowrap font-medium sticky left-0 bg-white">
                        {r.studentName}
                        {r.tabSwitchCount ? <span className="ml-1 text-orange-400" title={`${r.tabSwitchCount} trocas de aba`}>⚠️</span> : null}
                      </td>
                      {Array.from({ length: questionCount }, (_, qi) => {
                        const qr = r.questionResults[qi]
                        return (
                          <td key={qi} className={`p-2 border border-gray-200 text-center font-bold ${
                            !qr ? 'text-gray-300' :
                            qr.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {!qr ? '-' : qr.correct ? '✓' : '✗'}
                          </td>
                        )
                      })}
                      <td className="p-2 border border-gray-200 text-center font-bold text-blue-700">
                        {r.maxScore > 0 ? ((r.totalScore / r.maxScore) * 10).toFixed(1) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === 'questions' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">Ordenado da questao mais dificil para mais facil.</p>
              {questionStats.slice().sort((a, b) => a.p - b.p).map(q => (
                <div key={q.qi} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="font-bold text-gray-700 w-10 text-center">{q.label}</span>
                  <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        q.p >= 0.7 ? 'bg-yellow-400' : q.p >= 0.3 ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${(q.p * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <span className="text-sm w-16 text-right font-medium">{(q.p * 100).toFixed(0)}%</span>
                  <span className="text-xs text-gray-400 w-24">
                    {q.correct}/{q.total} acertos
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    q.p >= 0.7 ? 'bg-yellow-50 text-yellow-600' :
                    q.p >= 0.3 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {q.p >= 0.7 ? '🟡 Muito facil' : q.p >= 0.3 ? '🟢 Ideal' : '🔴 Muito dificil'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
