'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  BrowserAutomationTask,
  DiffItem,
  ApprovalMode,
  updateBrowserTask,
  subscribeToBrowserTask
} from '@/lib/browserAutomationClient'
import { maskStudentName } from '@/lib/portalSanitizer'

interface AutomationDiffModalProps {
  task: BrowserAutomationTask
  diff?: DiffItem[]
  approvalMode?: ApprovalMode
  onClose: () => void
  onCompleted?: (resultTask: BrowserAutomationTask) => void
}

export default function AutomationDiffModal({
  task,
  diff: initialDiff,
  approvalMode = 'batch',
  onClose,
  onCompleted
}: AutomationDiffModalProps) {
  const [currentTask, setCurrentTask] = useState<BrowserAutomationTask>(task)
  const [items, setItems] = useState<DiffItem[]>(() => {
    const d = initialDiff || (task.payload?.diff as DiffItem[]) || []
    return d.map(item => ({ ...item, approved: item.approved !== false }))
  })
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  // Inscrição Realtime / Polling resiliente do status da tarefa
  useEffect(() => {
    const unsubscribe = subscribeToBrowserTask(task.id, (updated) => {
      setCurrentTask(updated)
      if (updated.status === 'done' || updated.status === 'error') {
        if (onCompleted) onCompleted(updated)
      }
    })
    return () => unsubscribe()
  }, [task.id, onCompleted])

  const isVisualInferred = currentTask.payload?.confidence_flag === 'visual_inferido'

  // Contagem de aprovados
  const approvedCount = useMemo(() => items.filter(i => i.approved).length, [items])
  const allSelected = items.length > 0 && approvedCount === items.length

  const handleToggleSelectAll = () => {
    const nextVal = !allSelected
    setItems(prev => prev.map(i => ({ ...i, approved: nextVal })))
  }

  const handleToggleItem = (index: number) => {
    setItems(prev => {
      const next = [...prev]
      next[index] = { ...next[index], approved: !next[index].approved }
      return next
    })
  }

  // Aprovar execução
  const handleApprove = async () => {
    setIsUpdating(true)
    const approvedDiff = items.filter(i => i.approved)
    
    await updateBrowserTask(currentTask.id, {
      status: 'approved',
      payload: {
        ...currentTask.payload,
        diff: items,
        approved_items_count: approvedDiff.length,
        approved_at: new Date().toISOString()
      }
    })
    setIsUpdating(false)
  }

  // Rejeitar execução
  const handleReject = async () => {
    setIsUpdating(true)
    await updateBrowserTask(currentTask.id, {
      status: 'aborted',
      payload: {
        ...currentTask.payload,
        rejection_reason: rejectionReason.trim() || 'Cancelado pelo professor.',
        aborted_at: new Date().toISOString()
      }
    })
    setIsUpdating(false)
    onClose()
  }

  const renderStatusBanner = () => {
    if (currentTask.status === 'approved') {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-5" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <div className="w-4 h-4 rounded-full border-2 border-amber-600 border-t-transparent animate-spin" />
          <span className="text-sm font-semibold text-amber-900">
            Aprovado! Aguardando o Sidecar Desktop iniciar a execução no Chrome...
          </span>
        </div>
      )
    }
    if (currentTask.status === 'running') {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-5" style={{ background: '#dbeafe', border: '1px solid #bfdbfe' }}>
          <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <span className="text-sm font-semibold text-blue-900">
            Executando automação no navegador via CDP... Por favor, não feche o Chrome.
          </span>
        </div>
      )
    }
    if (currentTask.status === 'done') {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-5" style={{ background: '#dcfce7', border: '1px solid #bbf7d0' }}>
          <i className="ti ti-circle-check text-xl text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-900">
            Lançamento concluído com sucesso! Evidência visual e log de auditoria gerados.
          </span>
        </div>
      )
    }
    if (currentTask.status === 'error') {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-5" style={{ background: '#fee2e2', border: '1px solid #fecaca' }}>
          <i className="ti ti-alert-triangle text-xl text-red-600" />
          <span className="text-sm font-semibold text-red-900">
            {currentTask.payload?.error_message || 'Ocorreu um erro durante a execução no portal.'}
          </span>
        </div>
      )
    }
    return null
  }

  const isExecutionLocked = ['approved', 'running', 'done'].includes(currentTask.status)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28, 14, 6, 0.65)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl animate-fade-in"
        style={{
          background: '#ffffff',
          border: '1.5px solid #ede8dc',
          fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)"
        }}
      >
        {/* Cabeçalho */}
        <div
          className="p-6 text-white flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #2a160a 0%, #1c0e06 100%)' }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #8b5e3c 0%, #c4834a 100%)',
                border: '1px solid rgba(255,255,255,0.2)'
              }}
            >
              <i className="ti ti-brand-chrome text-2xl text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  style={{
                    fontFamily: "var(--font-display, 'Fraunces', serif)",
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#fdf8f2'
                  }}
                >
                  Revisão de Alterações no Portal
                </h3>
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-mono font-medium"
                  style={{ background: 'rgba(196,131,74,0.25)', color: '#f0c89e' }}
                >
                  {currentTask.portal.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Turma: <span className="font-semibold text-white">{currentTask.class_ref || 'Geral'}</span> • Ação:{' '}
                <span className="font-semibold text-white">{currentTask.action_type}</span> • Modo:{' '}
                <span className="font-semibold text-white">{approvalMode === 'batch' ? 'Lote' : 'Item a Item'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-amber-200 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <i className="ti ti-x text-lg" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto flex-1" style={{ background: '#faf6f0' }}>
          {renderStatusBanner()}

          {/* Alerta de Inferência Visual */}
          {isVisualInferred && (
            <div
              className="p-3.5 rounded-2xl mb-4 flex items-center gap-3 text-xs"
              style={{ background: '#fffbeb', border: '1px solid #fef3c7', color: '#92400e' }}
            >
              <i className="ti ti-alert-triangle text-lg text-amber-600 flex-shrink-0" />
              <span>
                <strong>Atenção:</strong> Os campos desta página foram identificados por inferência visual de IA. Por
                favor, confira os nomes e notas antes de autorizar a gravação oficial.
              </span>
            </div>
          )}

          {/* Tabela de Diff */}
          <div
            className="rounded-2xl overflow-hidden border shadow-sm"
            style={{ background: '#ffffff', borderColor: '#ede8dc' }}
          >
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr style={{ background: '#f5efe6', borderBottom: '1.5px solid #ede8dc' }}>
                  {approvalMode === 'batch' ? (
                    <th className="p-3.5 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={isExecutionLocked}
                        onChange={handleToggleSelectAll}
                        className="rounded accent-[#8b5e3c] w-4 h-4 cursor-pointer"
                      />
                    </th>
                  ) : (
                    <th className="p-3.5 w-24 text-center font-semibold text-stone-700">Decisão</th>
                  )}
                  <th className="p-3.5 font-semibold text-stone-700">Aluno</th>
                  <th className="p-3.5 font-semibold text-stone-700">Campo</th>
                  <th className="p-3.5 font-semibold text-stone-700">Valor Atual no Portal</th>
                  <th className="p-3.5 font-semibold text-stone-700">Novo Valor (Teacher AI)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-stone-400">
                      Nenhuma alteração pendente detectada no portal.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const isDiffChanged = item.beforeValue !== item.afterValue
                    const isNumeric =
                      !isNaN(Number(item.beforeValue)) && !isNaN(Number(item.afterValue))
                    const isGradeHigher = isNumeric && Number(item.afterValue) > Number(item.beforeValue)
                    const isGradeLower = isNumeric && Number(item.afterValue) < Number(item.beforeValue)

                    return (
                      <tr
                        key={idx}
                        className="transition-colors hover:bg-stone-50/80"
                        style={{ background: item.approved ? '#ffffff' : '#fdfaf7' }}
                      >
                        {/* Seletor / Ação */}
                        <td className="p-3.5 text-center">
                          {approvalMode === 'batch' ? (
                            <input
                              type="checkbox"
                              checked={item.approved}
                              disabled={isExecutionLocked}
                              onChange={() => handleToggleItem(idx)}
                              className="rounded accent-[#8b5e3c] w-4 h-4 cursor-pointer"
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={isExecutionLocked}
                              onClick={() => handleToggleItem(idx)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                              style={{
                                background: item.approved ? '#dcfce7' : '#fee2e2',
                                color: item.approved ? '#166534' : '#991b1b',
                                border: `1px solid ${item.approved ? '#bbf7d0' : '#fecaca'}`
                              }}
                            >
                              {item.approved ? '✓ Aprovado' : '✕ Rejeitado'}
                            </button>
                          )}
                        </td>

                        {/* Nome do Aluno */}
                        <td className="p-3.5 font-medium text-stone-900">
                          {isVisualInferred ? maskStudentName(item.studentName) : item.studentName}
                        </td>

                        {/* Campo */}
                        <td className="p-3.5 text-stone-600 font-mono text-xs">{item.field}</td>

                        {/* Valor Atual */}
                        <td className="p-3.5 text-stone-500 font-mono">
                          {item.beforeValue !== undefined && item.beforeValue !== '' ? (
                            <span>{item.beforeValue}</span>
                          ) : (
                            <span className="italic text-stone-300">Vazio</span>
                          )}
                        </td>

                        {/* Novo Valor */}
                        <td className="p-3.5">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold font-mono text-xs"
                            style={{
                              background: isGradeHigher
                                ? '#dcfce7'
                                : isGradeLower
                                ? '#fee2e2'
                                : isDiffChanged
                                ? '#fef3c7'
                                : '#f5f5f4',
                              color: isGradeHigher
                                ? '#15803d'
                                : isGradeLower
                                ? '#b91c1c'
                                : isDiffChanged
                                ? '#b45309'
                                : '#57534e'
                            }}
                          >
                            {isGradeHigher && <i className="ti ti-arrow-up text-xs" />}
                            {isGradeLower && <i className="ti ti-arrow-down text-xs" />}
                            {item.afterValue}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Campo Opcional de Rejeição */}
          {showRejectInput && (
            <div className="mt-4 p-4 rounded-2xl bg-white border border-stone-200 animate-fade-in">
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Motivo do cancelamento (opcional):
              </label>
              <input
                type="text"
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Ex: Turma incorreta selecionada ou notas incompletas..."
                className="w-full text-xs p-2.5 rounded-xl border border-stone-300 focus:outline-none focus:border-[#8b5e3c]"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectInput(false)}
                  className="px-3 py-1 text-xs text-stone-600 hover:text-stone-900"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isUpdating}
                  className="px-3 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div
          className="p-5 bg-white border-t flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: '#ede8dc' }}
        >
          <div className="text-xs text-stone-500">
            {approvedCount} de {items.length} alterações selecionadas para envio.
          </div>

          <div className="flex items-center gap-3">
            {!isExecutionLocked && !showRejectInput && (
              <button
                type="button"
                onClick={() => setShowRejectInput(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
              >
                Cancelar Tarefa
              </button>
            )}

            {currentTask.status === 'done' ? (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
              >
                Concluir e Fechar
              </button>
            ) : (
              <button
                type="button"
                disabled={approvedCount === 0 || isUpdating || isExecutionLocked}
                onClick={handleApprove}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-50 transition-all flex items-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #8b5e3c 0%, #c4834a 100%)',
                  boxShadow: '0 4px 14px rgba(139, 94, 60, 0.3)'
                }}
              >
                {isUpdating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <i className="ti ti-check text-sm" />
                    <span>Aprovar e Lançar ({approvedCount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
