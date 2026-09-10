'use client'

import React, { useState, useMemo } from 'react'
import { toast } from '@/components/Toast'
import {
  RosterReconciliationResult,
  ReconciliationItem,
  applyReconciliationDecisions,
  batchApproveValidItems,
  LocalStudentRecord
} from '@/lib/rosterReconciler'
import { logTeacherSyncRecord } from '@/lib/portalSanitizer'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

interface RosterReconciliationModalProps {
  isOpen: boolean
  portalName: string
  classRef?: string
  result: RosterReconciliationResult
  onClose: () => void
  onSuccess: (updatedCount: number) => void
  /** Origem do mapa usado na leitura: 'known_map' | 'discovered' | 'fallback_rediscovered' */
  mapSource?: 'known_map' | 'discovered' | 'fallback_rediscovered'
  /** Aviso contextual gerado pelo runner: 'new_portal' | 'layout_changed' */
  warnTeacher?: 'new_portal' | 'layout_changed'
  /** Força validação humana estrita para portal em fase de homologação (Parte C) */
  isUntestedMap?: boolean
  /** Status da conexão do portal */
  portalStatus?: string
}

export default function RosterReconciliationModal({
  isOpen,
  portalName,
  classRef,
  result: initialResult,
  onClose,
  onSuccess,
  mapSource,
  warnTeacher,
  isUntestedMap: isUntestedMapProp,
  portalStatus,
}: RosterReconciliationModalProps) {
  const [items, setItems] = useState<ReconciliationItem[]>(initialResult.items)
  const [isApplying, setIsApplying] = useState(false)
  const isPartial = Boolean(initialResult.completenessCheck?.isPartial)
  const [partialConfirmed, setPartialConfirmed] = useState(false)

  // Gate da Parte C: detecção de portal quebrado ou em homologação
  const isBrokenMap = Boolean(
    initialResult.isBrokenMap ||
    portalStatus === 'broken_needs_rediscovery'
  )

  const isUntestedMap = !isBrokenMap && Boolean(
    initialResult.isUntestedMap ||
    isUntestedMapProp ||
    (portalStatus && portalStatus !== 'mapped_validated') ||
    mapSource === 'discovered'
  )

  // Estatísticas Dinâmicas
  const stats = useMemo(() => {
    return {
      totalPortal: initialResult.totalPortalCount,
      autoMerged: items.filter(i => i.status === 'auto_merged' && i.resolvedAction === 'merge').length,
      ambiguous: items.filter(i => !i.resolvedAction && (i.status === 'ambiguous_match' || i.confidence < 0.8 || isUntestedMap)).length,
      newImported: items.filter(i => i.resolvedAction === 'create_new').length,
      unmatchedLocal: items.filter(i => i.status === 'unmatched_local').length
    }
  }, [items, initialResult.totalPortalCount, isUntestedMap])

  // Resolve item ambíguo ou suspeito
  const handleResolveDecision = (itemId: string, decision: 'merge' | 'create_new' | 'discard') => {
    setItems(prev => prev.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          resolvedAction: decision,
          reason: decision === 'merge'
            ? `Mesclagem manual confirmada com "${i.matchedLocalStudent?.name || i.candidateLocalStudents?.[0]?.name}".`
            : decision === 'create_new'
            ? 'Confirmado como novo aluno pelo professor.'
            : 'Descartado como ruído de interface pelo professor.'
        }
      }
      return i
    }))
  }

  // Aplica decisões e persiste
  const handleConfirmSync = () => {
    if (isBrokenMap) {
      toast.error('Leitura não realizada: portal precisa de redescoberta manual antes de qualquer sincronização.')
      return
    }

    // Se a leitura for parcial e a professora não confirmou explicitamente
    if (isPartial && !partialConfirmed) {
      toast.warning('Leitura parcial detectada. Marque a confirmação de que deseja importar mesmo assim antes de prosseguir.')
      return
    }

    // Se ainda houver itens pendentes de confirmação
    const pendingItems = isUntestedMap
      ? items.filter(i => !i.resolvedAction && i.status !== 'unmatched_local')
      : items.filter(i => !i.resolvedAction && (i.status === 'ambiguous_match' || i.confidence < 0.8))

    if (pendingItems.length > 0) {
      toast.warning(
        isUntestedMap
          ? `Portal em homologação: por favor, aprove ou descarte os ${pendingItems.length} aluno(s) pendentes antes de prosseguir.`
          : `Por favor, decida o que fazer com os ${pendingItems.length} aluno(s)/item(ns) pendentes antes de prosseguir.`
      )
      return
    }

    setIsApplying(true)
    try {
      let currentStudents: LocalStudentRecord[] = []
      const raw = localStorage.getItem('teacher_students')
      if (raw) currentStudents = JSON.parse(raw)

      const { updatedStudents, logSummary } = applyReconciliationDecisions(items, currentStudents, portalName)

      // Registra no histórico de auditoria LGPD (teacher_sync_log)
      logTeacherSyncRecord({
        portal: portalName.toLowerCase().replace(/\s+/g, '_'),
        portalName,
        classRef: classRef || 'all',
        actionType: 'read_roster',
        importedCount: logSummary.created,
        mergedCount: logSummary.merged,
        unmatchedLocalCount: logSummary.preserved,
        summaryDetails: logSummary
      })

      localStorage.setItem('teacher_students', JSON.stringify(updatedStudents))
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:data_changed'))

      toast.success(`🎉 Sincronização concluída: ${logSummary.total} alunos cadastrados (${logSummary.merged} mesclados, ${logSummary.created} novos)!`)

      // Lembrete pós-importação de boas práticas LGPD para planilhas públicas
      const isSheetImport = portalName.toLowerCase().includes('google') ||
                            portalName.toLowerCase().includes('planilha') ||
                            portalName.toLowerCase().includes('sheets') ||
                            portalName.toLowerCase().includes('csv')

      if (isSheetImport) {
        setTimeout(() => {
          toast.info('🔒 Importação concluída! Não esqueça de voltar o compartilhamento da planilha para privado, se quiser.', 7000)
        }, 1200)
      }

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

        {/* Banners Contextuais de Descoberta Automática */}
        {warnTeacher === 'layout_changed' && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 8,
            background: '#fffbeb', border: '1px solid #fde68a',
          }}>
            <i className="ti ti-refresh-alert" style={{ fontSize: 18, color: '#b45309', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>
                Layout do portal atualizado automaticamente
              </div>
              <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                O layout do portal parece ter mudado desde a última leitura.
                O sistema redescobriu o mapeamento automaticamente e usou o novo layout.
                <strong> Revise os dados abaixo com atenção extra antes de confirmar.</strong>
              </div>
            </div>
          </div>
        )}

        {warnTeacher === 'new_portal' && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 8,
            background: '#eff6ff', border: '1px solid #bfdbfe',
          }}>
            <i className="ti ti-map-search" style={{ fontSize: 18, color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 2 }}>
                Portal descoberto pela primeira vez 🔍
              </div>
              <div style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.5 }}>
                Este é um portal novo para o sistema. O mapeamento foi descoberto automaticamente
                e salvo para acelerar futuras leituras.
                <strong> Revise se os dados (nomes, matrículas) foram lidos corretamente antes de confirmar.</strong>
                {' '}Nas próximas vezes, a leitura usará o mapa salvo — sem precisar de inferência visual.
              </div>
            </div>
          </div>
        )}

        {/* Banner de Erro Crítico para broken_needs_rediscovery (Parte C - Item 2) */}
        {isBrokenMap && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '14px 16px', borderRadius: 8,
            background: '#fef2f2', border: '1px solid #f87171',
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 22, color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#991b1b', marginBottom: 3 }}>
                Leitura não realizada: portal precisa de redescoberta manual
              </div>
              <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>
                O layout deste portal mudou após falhas consecutivas e foi invalidado para proteger seus dados contra alucinações.
                Nenhuma alteração de alunos foi sincronizada ou gravada na base. Abra a turma no Chrome e execute a redescoberta de layout com IA.
              </div>
            </div>
          </div>
        )}

        {/* Banner de Homologação Obrigatória para mapped_untested (Parte C) */}
        {isUntestedMap && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 8,
            background: '#eff6ff', border: '1px solid #93c5fd',
          }}>
            <i className="ti ti-shield-check" style={{ fontSize: 20, color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 2 }}>
                Validação de Integridade: Layout em Homologação (mapped_untested)
              </div>
              <div style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.5 }}>
                Este portal foi mapeado recentemente e requer conferência humana item a item antes da primeira gravação.
                Nenhum aluno foi mesclado ou criado automaticamente.
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const res = batchApproveValidItems(items)
                    setItems(res.updatedItems)
                    if (res.approvedCount > 0 && res.skippedCount === 0) {
                      toast.success(`Todos os ${res.approvedCount} nomes válidos foram conferidos e pré-aprovados.`)
                    } else if (res.approvedCount > 0 && res.skippedCount > 0) {
                      toast.info(`✓ ${res.approvedCount} nomes válidos aprovados. ⚠️ ${res.skippedCount} aluno(s) com nome suspeito/incompleto ou confiança < 80% continuam pendentes de decisão individual.`, 6000)
                    } else if (res.skippedCount > 0) {
                      toast.warning(`Nenhum nome aprovado em lote. Todos os ${res.skippedCount} itens possuem pendências que requerem decisão individual.`, 5000)
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.sm,
                    border: 'none',
                    background: '#1d4ed8',
                    color: '#fff',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-checks" /> Conferir e aprovar todos os nomes válidos
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Banner de Bloqueio / Confirmação para Leitura Parcial */}
        {isPartial && (
          <div style={{
            background: '#fff7ed',
            border: '1px solid #fdba74',
            borderRadius: RADIUS.md,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#c2410c', flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412' }}>
                {initialResult.completenessCheck?.warningMessage || 'Leitura parcial detectada no portal escolar.'}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#7c2d12', marginTop: 2 }}>
              <input
                type="checkbox"
                checked={partialConfirmed}
                onChange={e => {
                  const checked = e.target.checked
                  setPartialConfirmed(checked)
                  if (checked) {
                    setItems(prev => prev.map(i => {
                      if (i.resolvedAction) return i
                      if (i.status === 'auto_merged') return { ...i, resolvedAction: 'merge' }
                      if (i.status === 'new_from_portal' && i.confidence >= 0.8) return { ...i, resolvedAction: 'create_new' }
                      return i
                    }))
                  } else {
                    setItems(prev => prev.map(i => {
                      if (i.status === 'unmatched_local') return i
                      return { ...i, resolvedAction: undefined }
                    }))
                  }
                }}
              />
              <span>Estou ciente de que a leitura foi parcial e confirmo a importação mesmo assim</span>
            </label>
          </div>
        )}

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

        {/* Alerta se houver itens ambíguos ou suspeitos */}
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
              <strong>Atenção Necessária:</strong> Existem {stats.ambiguous} item(ns) aguardando sua revisão manual (grafia parecida ou termos suspeitos). Escolha a ação adequada para cada um abaixo.
            </div>
          </div>
        )}

        {/* Lista de Alunos e Reconciliações */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
          {items.map((item) => {
            const isAmbiguous = item.status === 'ambiguous_match' && !item.resolvedAction
            const isLowConfidenceNew = item.status === 'new_from_portal' && item.confidence < 0.8 && !item.resolvedAction
            const isUntestedPending = isUntestedMap && !item.resolvedAction && item.status !== 'unmatched_local'
            const isNeedsReview = isAmbiguous || isLowConfidenceNew || isUntestedPending
            const isMerged = item.resolvedAction === 'merge'
            const isNew = item.resolvedAction === 'create_new'
            const isDiscarded = item.resolvedAction === 'discard'
            const isLocalOnly = item.status === 'unmatched_local'

            return (
              <div
                key={item.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: RADIUS.md,
                  border: isNeedsReview ? '2px solid #f59e0b' : isDiscarded ? '1px dashed #cbd5e1' : `1px solid ${BORDER.medium}`,
                  background: isNeedsReview ? '#fffbeb' : isDiscarded ? '#f8fafc' : COLOR.surface1,
                  opacity: isDiscarded ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                  {/* Nome e Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: isDiscarded ? COLOR.paperWarm : COLOR.paperInk, textDecoration: isDiscarded ? 'line-through' : 'none' }}>
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

                    {isLowConfidenceNew && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: '#fef3c7', color: '#b45309' }}>
                        ⚠️ Suspeito (Confiança {Math.round(item.confidence * 100)}%)
                      </span>
                    )}

                    {isDiscarded && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: '#fee2e2', color: '#991b1b' }}>
                        ✕ Descartado
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
                  <div style={{ fontSize: 11.5, color: isNeedsReview ? '#92400e' : COLOR.paperWarm }}>
                    {item.reason}
                  </div>
                </div>

                {/* Ações para Conflito / Ambiguidade */}
                {isAmbiguous && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleResolveDecision(item.id, 'merge')}
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
                      onClick={() => handleResolveDecision(item.id, 'create_new')}
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

                {/* Ações para Nome Suspeito / Ruído */}
                {isLowConfidenceNew && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleResolveDecision(item.id, 'create_new')}
                      style={{
                        padding: '6px 10px',
                        borderRadius: RADIUS.sm,
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Criar Aluno
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveDecision(item.id, 'discard')}
                      style={{
                        padding: '6px 10px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${BORDER.medium}`,
                        background: '#fff',
                        color: '#dc2626',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✕ Descartar Ruído
                    </button>
                  </div>
                )}

                {/* Ações para Aluno em Homologação (mapped_untested) */}
                {isUntestedMap && !item.resolvedAction && item.status === 'auto_merged' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleResolveDecision(item.id, 'merge')}
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
                      ✓ Confirmar Vínculo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveDecision(item.id, 'create_new')}
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

                {/* Ações para Novo Aluno Legítimo em Homologação (mapped_untested) */}
                {isUntestedMap && !item.resolvedAction && item.status === 'new_from_portal' && item.confidence >= 0.8 && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleResolveDecision(item.id, 'create_new')}
                      style={{
                        padding: '6px 10px',
                        borderRadius: RADIUS.sm,
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Confirmar Aluno
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveDecision(item.id, 'discard')}
                      style={{
                        padding: '6px 10px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${BORDER.medium}`,
                        background: '#fff',
                        color: '#dc2626',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✕ Descartar
                    </button>
                  </div>
                )}

                {/* Opção de Alterar Item Resolvido em Homologação */}
                {isUntestedMap && item.resolvedAction && item.status !== 'unmatched_local' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setItems(prev => prev.map(i => i.id === item.id ? { ...i, resolvedAction: undefined } : i))}
                      style={{
                        padding: '4px 8px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${BORDER.medium}`,
                        background: 'transparent',
                        color: COLOR.paperWarm,
                        fontSize: 10.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Alterar
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
            disabled={isApplying || isBrokenMap || (isPartial && !partialConfirmed) || (isUntestedMap && stats.ambiguous > 0)}
            style={{
              padding: '9px 24px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: isBrokenMap
                ? '#dc2626'
                : (isPartial && !partialConfirmed) || (isUntestedMap && stats.ambiguous > 0)
                ? '#94a3b8'
                : stats.ambiguous === 0 ? '#2d9d5d' : COLOR.accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: isBrokenMap || (isPartial && !partialConfirmed) || (isUntestedMap && stats.ambiguous > 0) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: SHADOW.sm,
            }}
          >
            {isApplying ? (
              <>
                <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 16 }} />
                <span>Salvando na base...</span>
              </>
            ) : isBrokenMap ? (
              <>
                <i className="ti ti-alert-triangle" style={{ fontSize: 16 }} />
                <span>Sincronização Bloqueada (Redescoberta Necessária)</span>
              </>
            ) : isUntestedMap ? (
              <>
                <i className="ti ti-shield-check" style={{ fontSize: 16 }} />
                <span>Aprovar e Homologar Portal ({items.filter(i => Boolean(i.resolvedAction)).length} de {stats.totalPortal})</span>
              </>
            ) : stats.ambiguous === 0 ? (
              <>
                <i className="ti ti-bolt" />
                <span>⚡ Aprovar Tudo e Importar ({stats.totalPortal} Alunos)</span>
              </>
            ) : (
              <>
                <i className="ti ti-check" style={{ fontSize: 16 }} />
                <span>Confirmar e Sincronizar Alunos</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
