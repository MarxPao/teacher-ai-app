'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { COLOR, RADIUS, SHADOW } from '@/styles/tokens'
import { useModalA11y } from '@/hooks/useModalA11y'
import { getStudentPei, getStudentPeiArchive, PeiRecord } from '@/lib/peiManagement'
import { getStudentPdi, getStudentPdiArchive, PdiRecord } from '@/lib/pdiManagement'
import { exportDocumentToWord, exportDocumentToPdf } from '@/lib/documentExportService'

interface Props {
  isOpen: boolean
  studentId: string
  studentName: string
  onClose: () => void
  onOpenDocument: (type: 'pei' | 'pdi', doc: any) => void
}

export default function StudentDocumentArchiveModal({
  isOpen,
  studentId,
  studentName,
  onClose,
  onOpenDocument
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  useModalA11y({ isOpen, onClose, modalRef })

  const [activeTab, setActiveTab] = useState<'all' | 'pei' | 'pdi'>('all')

  // Carrega documentos ativos e arquivados
  const activePei = useMemo(() => getStudentPei(studentId), [studentId, isOpen])
  const archivedPeis = useMemo(() => getStudentPeiArchive(studentId), [studentId, isOpen])
  const activePdi = useMemo(() => getStudentPdi(studentId), [studentId, isOpen])
  const archivedPdis = useMemo(() => getStudentPdiArchive(studentId), [studentId, isOpen])

  if (!isOpen) return null

  // Lista unificada de documentos
  const allDocs = [
    ...(activePei ? [{ type: 'pei' as const, doc: activePei, isArchived: false }] : []),
    ...archivedPeis.map(p => ({ type: 'pei' as const, doc: p, isArchived: true })),
    ...(activePdi ? [{ type: 'pdi' as const, doc: activePdi, isArchived: false }] : []),
    ...archivedPdis.map(p => ({ type: 'pdi' as const, doc: p, isArchived: true }))
  ]

  const filteredDocs = allDocs.filter(d => activeTab === 'all' || d.type === activeTab)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 20, 10, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: 16
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: '#fdf8f2',
          width: '100%',
          maxWidth: 780,
          maxHeight: '85vh',
          borderRadius: RADIUS.xl,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #ede8dc'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #2c1a0e, #4a3320)',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#f59e0b' }}>
              ARQUIVO HISTÓRICO DE DOCUMENTOS INCLUSIVOS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{studentName}</div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
          >
            &times;
          </button>
        </div>

        {/* Abas de Filtro */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 24px', background: '#f5efe6', borderBottom: '1px solid #ede8dc' }}>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 14px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: activeTab === 'all' ? '#2c1a0e' : '#fff',
              color: activeTab === 'all' ? '#fff' : COLOR.paperInk,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Todos ({allDocs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pei')}
            style={{
              padding: '6px 14px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: activeTab === 'pei' ? '#6d28d9' : '#fff',
              color: activeTab === 'pei' ? '#fff' : COLOR.paperInk,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            PEIs ({allDocs.filter(d => d.type === 'pei').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pdi')}
            style={{
              padding: '6px 14px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: activeTab === 'pdi' ? '#0284c7' : '#fff',
              color: activeTab === 'pdi' ? '#fff' : COLOR.paperInk,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            PDIs ({allDocs.filter(d => d.type === 'pdi').length})
          </button>
        </div>

        {/* Lista de Documentos */}
        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredDocs.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLOR.paperMid, background: '#fff', borderRadius: RADIUS.md, border: '1px solid #ede8dc' }}>
              Nenhum documento encontrado para este estudante no filtro selecionado.
            </div>
          ) : (
            filteredDocs.map((item, idx) => {
              const isPei = item.type === 'pei'
              const doc = item.doc

              return (
                <div
                  key={`${item.type}_${idx}_${doc.id || doc.studentId}`}
                  style={{
                    background: '#fff',
                    border: `1px solid ${item.isArchived ? '#e2e8f0' : isPei ? '#c4b5fd' : '#bae6fd'}`,
                    borderRadius: RADIUS.lg,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: isPei ? '#f5f3ff' : '#f0f9ff',
                          color: isPei ? '#6d28d9' : '#0369a1',
                          border: `1px solid ${isPei ? '#ddd6fe' : '#bae6fd'}`
                        }}
                      >
                        {isPei ? 'PEI' : 'PDI'}
                      </span>

                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: item.isArchived ? '#f1f5f9' : '#dcfce7',
                          color: item.isArchived ? '#64748b' : '#166534'
                        }}
                      >
                        {item.isArchived ? 'Versão Arquivada' : 'Versão Ativa'}
                      </span>

                      <span style={{ fontSize: 11, color: COLOR.paperMid }}>
                        Atualizado em:{' '}
                        {doc.updatedAt
                          ? new Date(doc.updatedAt).toLocaleDateString('pt-BR')
                          : '-'}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.paperInk }}>
                      {isPei
                        ? `Diagnóstico: ${(doc as any).diagnosis || 'Em avaliação'} ${(doc as any).laudoInfo?.cid10 ? `(${(doc as any).laudoInfo.cid10})` : ''}`
                        : `PDI: ${(doc as any).studentInfo?.gradeCycle || 'Fundamental'} &bull; ${(doc as any).skillsMatrix?.length || 0} habilidades adaptadas`}
                    </div>

                    <div style={{ fontSize: 11, color: COLOR.paperWarm, marginTop: 4 }}>
                      {isPei
                        ? `${(doc as any).goals?.length || 0} metas SMART &bull; ${(doc as any).accommodations?.filter((a: any) => a.isActive)?.length || 0} acomodações ativas`
                        : `${(doc as any).interventionPlan?.length || 0} estratégias de intervenção ativas`}
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => onOpenDocument(item.type, doc)}
                      style={{
                        padding: '6px 12px',
                        background: isPei ? '#6d28d9' : '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: RADIUS.md,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <i className="ti ti-eye" /> Abrir no Editor
                    </button>

                    <button
                      type="button"
                      onClick={() => exportDocumentToWord({ type: item.type, title: isPei ? 'Plano Educacional Individualizado (PEI)' : 'Plano de Desenvolvimento Individual (PDI)', schoolName: 'Colégio Machado Sobrinho', studentName, data: doc })}
                      style={{ padding: '6px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                      title="Exportar DOCX"
                    >
                      <i className="ti ti-file-text" />
                    </button>

                    <button
                      type="button"
                      onClick={() => exportDocumentToPdf({ type: item.type, title: isPei ? 'Plano Educacional Individualizado (PEI)' : 'Plano de Desenvolvimento Individual (PDI)', schoolName: 'Colégio Machado Sobrinho', studentName, data: doc })}
                      style={{ padding: '6px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                      title="Imprimir / PDF"
                    >
                      <i className="ti ti-printer" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', background: '#f5efe6', borderTop: '1px solid #ede8dc', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 20px', background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
