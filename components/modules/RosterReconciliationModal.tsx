'use client'

import React, { useState, useMemo } from 'react'
import { toast } from '@/components/Toast'
import {
  RosterReconciliationResult,
  ReconciliationItem,
  applyReconciliationDecisions,
  LocalStudentRecord
} from '@/lib/rosterReconciler'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

interface RosterReconciliationModalProps {
  isOpen: boolean
  portalName: string
  classRef?: string
  result: RosterReconciliationResult
  onClose: () => void
  onSuccess: (updatedCount: number) => void
}

export default function RosterReconciliationModal({
  isOpen,
  portalName,
  classRef,
  result: initialResult,
  onClose,
  onSuccess
}: RosterReconciliationModalProps) {
  const [items, setItems] = useState<ReconciliationItem[]>(initialResult.items)
  const [isApplying, setIsApplying] = useState(false)

  // Estatísticas Dinâmicas
  const stats = useMemo(() => {
    return {
      totalPortal: initialResult.totalPortalCount,
      autoMerged: items.filter(i => i.status === 'auto_merged' && i.resolvedAction === 'merge').length,
      ambiguous: items.filter(i => i.status === 'ambiguous_match' && !i.resolvedAction).length,
      newImported: items.filter(i => i.resolvedAction === 'create_new').length,
      unmatchedLocal: items.filter(i => i.status === 'unmatched_local').length
    }
  }, [items, initialResult.totalPortalCount])

  // Resolve item ambíguo
  const handleResolveAmbiguous = (itemId: string, decision: 'merge' | 'create_new') => {
    setItems(prev => prev.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          resolvedAction: decision,
          reason: decision === 'merge'
            ? `Mesclagem manual confirmada com "${i.matchedLocalStudent?.name || i.candidateLocalStudents?.[0]?.name}".`
            : 'Confirmado como novo aluno separado pelo professor.'
        }
      }
      return i
    }))
  }

  // Aplica decisões e persiste
  const handleConfirmSync = () => {
    // Se ainda houver ambíguos sem decisão
    const pendingAmbiguous = items.filter(i => i.status === 'ambiguous_match' && !i.resolvedAction)
    if (pendingAmbiguous.length > 0) {
      toast.warning(`Por favor, decida o que fazer com os ${pendingAmbiguous.length} aluno(s) com nome parecido antes de prosseguir.`)
      return
    }

    setIsApplying(true)
    try {
      let currentStudents: LocalStudentRecord[] = []
      const raw = localStorage.getItem('teacher_students')
      if (raw) currentStudents = JSON.parse(raw)

      const { updatedStudents, logSummary } = applyReconciliationDecisions(items, currentStudents, portalName)

      localStorage.setItem('teacher_students', JSON.stringify(updatedStudents))
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:data_changed'))

      toast.success(`🎉 Sincronização concluída: ${logSummary.total} alunos cadastrados (${logSummary.merged} mesclados, ${logSummary.created} novos)!`)
      onSuccess(logSummary.total)
      onClose()
    } catch (err: any) {
      toast.error(`Erro ao aplicar conciliação: ${err.message}`)
    } finally {
      setIsApplying(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(44,26,14,0.6)',
      backdropFilter: 'blur(5px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      fontFamily: FONT.sans,
    }}>
      <div style={{
        background: COLOR.surface1,
        border: `1px solid ${BORDER.medium}`,
        borderRadius: RADIUS.xl,
        padding: '24px 28px',
        maxWidth: 860,
        width: '100%',
        boxShadow: SHADOW.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Header do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER.soft}`, paddingBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-school" style={{ fontSize: 24, color: COLOR.accent }} />
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLOR.paperInk }}>
                Reconciliação de Alunos & Turmas ({portalName === 'machado' ? 'Machado Sobrinho' : portalName})
              </h3>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: TEXT.caption, color: COLOR.paperWarm }}>
              O Portal Escolar é a fonte primária de verdade. Dados oficiais foram lidos e reconciliados com suas anotações locais.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, color: COLOR.paperMid, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* 5 Contadores Estratégicos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ padding: '10px 12px', borderRadius: RADIUS.md, background: COLOR.surface2, border: `1px solid ${BORDER.soft}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLOR.paperInk }}>{stats.totalPortal}</div>
            <div style={{ fontSize: 11, color: COLOR.paperWarm, fontWeight: 600 }}>Total no Portal</div>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: RADIUS.md, background: 'rgba(34,197,94,0.1)', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{stats.autoMerged}</div>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>Mesclados Auto</div>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: RADIUS.md, background: stats.ambiguous > 0 ? '#fffbeb' : COLOR.surface2, border: stats.ambiguous > 0 ? '1px solid #fde68a' : `1px solid ${BORDER.soft}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: stats.ambiguous > 0 ? '#b45309' : COLOR.paperMid }}>{stats.ambiguous}</div>
            <div style={{ fontSize: 11, color: stats.ambiguous > 0 ? '#92400e' : COLOR.paperWarm, fontWeight: 600 }}>Para Confirmar</div>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: RADIUS.md, background: 'rgba(139,94,60,0.1)', border: `1px solid ${BORDER.medium}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLOR.accent }}>{stats.newImported}</div>
            <div style={{ fontSize: 11, color: COLOR.paperWarm, fontWeight: 600 }}>Novos Importados</div>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: RADIUS.md, background: COLOR.surface2, border: `1px solid ${BORDER.soft}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLOR.paperMid }}>{stats.unmatchedLocal}</div>
            <div style={{ fontSize: 11, color: COLOR.paperWarm, fontWeight: 600 }}>Locais Preservados</div>
          </div>
        </div>

        {/* Alerta se houver itens ambíguos */}
        {stats.ambiguous > 0 && (
          <div style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: RADIUS.md,
            padding: '10px 14px',
            fontSize: 12,
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 18, flexShrink: 0 }} />
            <div>
              <strong>Atenção Necessária:</strong> Existem {stats.ambiguous} aluno(s) com grafia parecida. Escolha abaixo se deseja vincular ao aluno já existente ou cadastrar como um aluno novo.
            </div>
          </div>
        )}

        {/* Lista de Alunos e Reconciliações */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
          {items.map((item) => {
            const isAmbiguous = item.status === 'ambiguous_match' && !item.resolvedAction
            const isMerged = item.resolvedAction === 'merge'
            const isNew = item.resolvedAction === 'create_new'
            const isLocalOnly = item.status === 'unmatched_local'

            return (
              <div
                key={item.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: RADIUS.md,
                  border: isAmbiguous ? '2px solid #f59e0b' : `1px solid ${BORDER.medium}`,
                  background: isAmbiguous ? '#fffbeb' : COLOR.surface1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                  {/* Nome e Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.paperInk }}>
                      {item.portalStudent?.name || item.matchedLocalStudent?.name}
                    </span>

                    {item.portalStudent?.portal_native_id && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: 'rgba(0,121,191,0.1)', color: '#0079bf' }}>
                        Matrícula: #{item.portalStudent.portal_native_id}
                      </span>
                    )}

                    {isMerged && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: '#dcfce7', color: '#15803d' }}>
                        🔗 Vinculado a: {item.matchedLocalStudent?.name || item.candidateLocalStudents?.[0]?.name}
                      </span>
                    )}

                    {isNew && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: 'rgba(139,94,60,0.12)', color: COLOR.accent }}>
                        ✨ Novo do Portal
                      </span>
                    )}

                    {isLocalOnly && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: COLOR.surface2, color: COLOR.paperWarm }}>
                        📌 Manual / Não Vinculado
                      </span>
                    )}

                    {item.portalStudent?.classRef && (
                      <span style={{ fontSize: 10.5, color: COLOR.paperWarm }}>
                        Turma: {item.portalStudent.classRef}
                      </span>
                    )}
                  </div>

                  {/* Motivo / Explicação */}
                  <div style={{ fontSize: 11.5, color: isAmbiguous ? '#92400e' : COLOR.paperWarm }}>
                    {item.reason}
                  </div>
                </div>

                {/* Ações para Conflito / Ambiguidade */}
                {isAmbiguous && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleResolveAmbiguous(item.id, 'merge')}
                      style={{
                        padding: '6px 10px',
                        borderRadius: RADIUS.sm,
                        border: 'none',
                        background: '#16a34a',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Sim, Mesclar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveAmbiguous(item.id, 'create_new')}
                      style={{
                        padding: '6px 10px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${BORDER.medium}`,
                        background: '#fff',
                        color: COLOR.paperInk,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Criar Novo
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer com Botão de Confirmação */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BORDER.soft}`, paddingTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}`, background: COLOR.surface2, color: COLOR.paperWarm, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmSync}
            disabled={isApplying}
            style={{
              padding: '9px 24px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLOR.accent,
              color: '#fff',
              fontSize: TEXT.bodyCompact,
              fontWeight: 800,
              cursor: isApplying ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: SHADOW.md,
            }}
          >
            {isApplying ? (
              <>
                <i className="ti ti-loader-2 ti-spin" />
                <span>Atualizando Base...</span>
              </>
            ) : (
              <>
                <i className="ti ti-check" />
                <span>Confirmar e Sincronizar Alunos</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
