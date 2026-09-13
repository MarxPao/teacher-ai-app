'use client'

/**
 * PortalApprovalCard.tsx — Card Interativo de Aprovação Human-in-the-Loop (Etapa 5)
 * 
 * Exibe no chat da Rafinha a evidência do formulário pré-preenchido no portal escolar:
 * 1. Screenshot real capturado via CDP antes da submissão irreversível.
 * 2. Tabela de Diff estruturada (Aluno, Campo, Valor Anterior -> Novo Valor).
 * 3. Botões "Confirmar e Salvar" e "Cancelar e Ajustar" que atualizam o Supabase
 *    e sincronizam com o runner Desktop / sidecar.
 */

import React, { useState } from 'react'
import { updateBrowserTask, DiffItem } from '../lib/browserAutomationClient'

export interface PortalApprovalCardProps {
  taskId: string
  portal: string
  actionType: string
  classRef?: string
  summary?: string
  diff?: DiffItem[]
  screenshotUrl?: string
  conflictDetected?: boolean
  conflictWarning?: string
  onApproved?: () => void
  onRejected?: () => void
  isVoiceActive?: boolean
}

export const PortalApprovalCard: React.FC<PortalApprovalCardProps> = ({
  taskId,
  portal,
  actionType,
  classRef,
  summary,
  diff = [],
  screenshotUrl,
  conflictDetected,
  conflictWarning,
  onApproved,
  onRejected
}) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [actionDone, setActionDone] = useState<'approved' | 'rejected' | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)

  const formattedAction = actionType
    ? actionType.replace('write_', '').replace(/_/g, ' ').toUpperCase()
    : 'LANÇAMENTO'

  const handleApprove = async () => {
    if (isProcessing || actionDone) return
    setIsProcessing(true)
    try {
      if (taskId && !taskId.startsWith('task_mock')) {
        await updateBrowserTask(taskId, { status: 'approved' })
      }
      // Sincronização Write-Through: Atualiza a tabela de negócio students no Supabase
      if (diff && diff.length > 0) {
        try {
          await fetch('/api/students/write-through', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId,
              portal,
              actionType,
              classRef,
              diff
            })
          })
        } catch (syncErr) {
          console.warn('[ApprovalCard] Falha na sincronização write-through:', syncErr)
        }
      }
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('teacher_active_portal_task')
        window.dispatchEvent(new Event('teacher:portal_task_completed'))
      }
      setActionDone('approved')
      if (onApproved) onApproved()
    } catch (e) {
      console.error('[ApprovalCard] Erro ao aprovar tarefa:', e)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    if (isProcessing || actionDone) return
    setIsProcessing(true)
    try {
      if (taskId && !taskId.startsWith('task_mock')) {
        await updateBrowserTask(taskId, { status: 'aborted' })
      }
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('teacher_active_portal_task')
        window.dispatchEvent(new Event('teacher:portal_task_completed'))
      }
      setActionDone('rejected')
      if (onRejected) onRejected()
    } catch (e) {
      console.error('[ApprovalCard] Erro ao rejeitar tarefa:', e)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div
      data-testid="portal-approval-card"
      style={{
        margin: '12px 0',
        padding: '16px',
        background: '#ffffff',
        borderRadius: '16px',
        border: '1.5px solid #e2d9cc',
        boxShadow: '0 4px 16px rgba(44, 26, 14, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: "'Outfit', sans-serif",
        color: '#2c1a0e',
        animation: 'fadeIn 0.25s ease-out'
      }}
    >
      {/* Header do Card */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span
              style={{
                background: actionDone === 'approved' ? '#dcfce7' : actionDone === 'rejected' ? '#fee2e2' : '#fef3c7',
                color: actionDone === 'approved' ? '#15803d' : actionDone === 'rejected' ? '#b91c1c' : '#b45309',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              {actionDone === 'approved' ? '✓ Aprovado e Salvo' : actionDone === 'rejected' ? '✕ Cancelado' : '⏳ Aguardando Sua Aprovação'}
            </span>
            {classRef && (
              <span style={{ fontSize: '12px', color: '#8c6b4f', fontWeight: 600 }}>
                · {classRef}
              </span>
            )}
          </div>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1c0e06' }}>
            {formattedAction} — {portal.replace('https://', '').replace('http://', '')}
          </h4>
        </div>
        <span style={{ fontSize: '20px' }}>🛡️</span>
      </div>

      {/* Resumo do Preenchimento */}
      {summary && (
        <div
          style={{
            fontSize: '13px',
            lineHeight: 1.45,
            color: '#5c4028',
            background: '#faf6f0',
            padding: '8px 12px',
            borderRadius: '8px',
            borderLeft: '3px solid #d4a373'
          }}
        >
          {summary}
        </div>
      )}

      {/* Alerta Visível de Divergência/Conflito contra o Portal Vivo */}
      {(conflictDetected || conflictWarning) && (
        <div
          data-testid="conflict-warning-box"
          style={{
            padding: '10px 12px',
            background: '#fffbeb',
            borderRadius: '10px',
            border: '1.5px solid #f59e0b',
            color: '#92400e',
            fontSize: '12px',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>⚠️</span>
          <div>
            <strong style={{ color: '#b45309', display: 'block', marginBottom: '2px' }}>
              Divergência detectada com o portal escolar:
            </strong>
            {conflictWarning || 'O valor atual no portal escolar difere do histórico em cache do aplicativo. A operação foi calculada com base na página viva do portal.'}
          </div>
        </div>
      )}

      {/* Tabela de Diff (Mudanças Propostas) */}
      {diff.length > 0 && (
        <div style={{ border: '1px solid #ede5da', borderRadius: '10px', overflow: 'hidden' }}>
          <div
            style={{
              padding: '6px 10px',
              background: '#f4ede4',
              fontSize: '11px',
              fontWeight: 700,
              color: '#7a5a3e',
              textTransform: 'uppercase'
            }}
          >
            📋 Resumo das Alterações ({diff.length} itens)
          </div>
          <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#faf6f0', borderBottom: '1px solid #ede5da', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', color: '#8c6b4f' }}>Aluno</th>
                  <th style={{ padding: '6px 10px', color: '#8c6b4f' }}>Campo</th>
                  <th style={{ padding: '6px 10px', color: '#8c6b4f', textAlign: 'right' }}>Novo Valor</th>
                </tr>
              </thead>
              <tbody>
                {diff.slice(0, 10).map((d, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f2ece4' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{d.studentName}</td>
                    <td style={{ padding: '6px 10px', color: '#7a5a3e' }}>{d.field}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>
                      {String(d.afterValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diff.length > 10 && (
              <div style={{ padding: '4px 10px', fontSize: '11px', color: '#8c6b4f', background: '#faf6f0', textAlign: 'center' }}>
                + {diff.length - 10} outros alunos
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screenshot Preview (Captura do formulário preenchido) */}
      {screenshotUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#7a5a3e', textTransform: 'uppercase' }}>
            📸 Pré-visualização do Formulário no Navegador
          </span>
          <div
            onClick={() => setIsZoomed(true)}
            style={{
              position: 'relative',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1.5px solid #dfd5c7',
              cursor: 'zoom-in',
              background: '#000'
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl}
              alt="Screenshot do formulário preenchido"
              style={{
                width: '100%',
                maxHeight: '160px',
                objectFit: 'cover',
                display: 'block',
                transition: 'transform 0.2s'
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '6px',
                right: '6px',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600
              }}
            >
              🔍 Clique para ampliar
            </div>
          </div>
        </div>
      )}

      {/* Modal de Zoom da Imagem */}
      {isZoomed && screenshotUrl && (
        <div
          onClick={() => setIsZoomed(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            cursor: 'zoom-out'
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt="Visualização ampliada do portal"
            style={{
              maxWidth: '92vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            }}
          />
        </div>
      )}

      {/* Botões de Decisão (Aprovar vs Cancelar) */}
      {!actionDone ? (
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            data-testid="approve-button"
            onClick={handleApprove}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '10px 14px',
              background: '#15803d',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isProcessing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)',
              transition: 'background 0.15s, transform 0.1s'
            }}
          >
            <span>✓ Confirmar e Salvar</span>
          </button>

          <button
            type="button"
            data-testid="reject-button"
            onClick={handleReject}
            disabled={isProcessing}
            style={{
              padding: '10px 14px',
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isProcessing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background 0.15s'
            }}
          >
            <span>✕ Cancelar e Ajustar</span>
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: '8px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '8px',
            background: actionDone === 'approved' ? '#f0fdf4' : '#fef2f2',
            color: actionDone === 'approved' ? '#166534' : '#991b1b'
          }}
        >
          {actionDone === 'approved'
            ? '🚀 Submissão confirmada! O robô acionou a gravação definitiva no portal.'
            : '🛑 Operação abortada! Nenhuma alteração foi persistida no portal.'}
        </div>
      )}
    </div>
  )
}
