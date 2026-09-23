'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, RADIUS, SHADOW } from '@/styles/tokens'
import {
  getAllPeiRecords,
  saveStudentPei,
  archiveStudentPei,
  PeiRecord,
  createDefaultPei
} from '@/lib/peiManagement'
import EditableDocumentModal from '@/components/editableDocument/EditableDocumentModal'
import { PEI_SCHEMA } from '@/lib/editableDocumentTypes'
import { exportDocumentToWord, exportDocumentToPdf } from '@/lib/documentExportService'
import { toast, showConfirm } from '@/components/Toast'

export default function PeiTab() {
  const [peiRecords, setPeiRecords] = useState<Record<string, PeiRecord>>({})
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentId, setNewStudentId] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  const loadData = () => {
    setPeiRecords(getAllPeiRecords())
  }

  useEffect(() => {
    loadData()
    const handlePeiChanged = () => loadData()
    window.addEventListener('teacher:pei_changed', handlePeiChanged)
    return () => window.removeEventListener('teacher:pei_changed', handlePeiChanged)
  }, [])

  const peiList = useMemo(() => {
    return Object.values(peiRecords).filter(p =>
      p.studentName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.diagnosis.toLowerCase().includes(searchFilter.toLowerCase())
    )
  }, [peiRecords, searchFilter])

  // Estatísticas Rápidas
  const totalPeis = peiList.length
  const totalGoals = peiList.reduce((acc, p) => acc + (p.goals?.length || 0), 0)
  const achievedGoals = peiList.reduce((acc, p) => acc + (p.goals?.filter(g => g.status === 'achieved')?.length || 0), 0)

  const handleCreateNew = () => {
    if (!newStudentName.trim()) return
    const sId = newStudentId.trim() || `student_${Date.now()}`
    const defaultPei = createDefaultPei(sId, newStudentName.trim())
    saveStudentPei(defaultPei)
    setEditingStudentId(sId)
    setIsCreatingNew(false)
    setNewStudentName('')
    setNewStudentId('')
  }

  const handleArchive = async (studentId: string, studentName: string) => {
    const confirmed = await showConfirm(`Deseja arquivar a versão atual do PEI de ${studentName}? Ele ficará disponível no histórico.`)
    if (confirmed) {
      archiveStudentPei(studentId)
      toast.success(`PEI de ${studentName} arquivado com sucesso.`)
      loadData()
    }
  }

  const activePei = editingStudentId ? peiRecords[editingStudentId] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── CARDS DE ESTATÍSTICAS & AÇÕES ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm }}>PEIs Ativos</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#6d28d9', marginTop: 4 }}>{totalPeis}</div>
          <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 2 }}>Estudantes com plano individualizado</div>
        </div>

        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm }}>Metas SMART Acompanhadas</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0369a1', marginTop: 4 }}>{totalGoals}</div>
          <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 2 }}>{achievedGoals} metas alcançadas com êxito</div>
        </div>

        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setIsCreatingNew(true)}
            style={{
              padding: '10px 18px',
              background: 'linear-gradient(135deg, #6d28d9, #4c1d95)',
              color: '#fff',
              border: 'none',
              borderRadius: RADIUS.md,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(109, 40, 217, 0.3)'
            }}
          >
            <i className="ti ti-plus" /> + Novo PEI
          </button>
        </div>
      </div>

      {/* ─── MODAL DE CRIAÇÃO RÁPIDA ─── */}
      {isCreatingNew && (
        <div style={{ background: '#faf7f2', border: '1px solid #c4b5fd', borderRadius: RADIUS.lg, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#4c1d95' }}>Criar Novo Plano Educacional Individualizado (PEI)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={newStudentName}
              onChange={e => setNewStudentName(e.target.value)}
              placeholder="Nome completo do aluno..."
              autoFocus
              style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={!newStudentName.trim()}
              style={{
                padding: '8px 20px',
                background: newStudentName.trim() ? '#6d28d9' : '#cbd5e1',
                color: '#fff',
                border: 'none',
                borderRadius: RADIUS.md,
                fontWeight: 700,
                fontSize: 13,
                cursor: newStudentName.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              Criar e Abrir Editor
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingNew(false)}
              style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── FILTRO DE BUSCA ─── */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          placeholder="Buscar PEI por nome do aluno ou diagnóstico..."
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: RADIUS.md,
            border: '1px solid #dcd7cb',
            background: '#fff',
            fontSize: 13
          }}
        />
      </div>

      {/* ─── LISTA DE PEIS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {peiList.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', background: '#fff', border: '1px solid #ede8dc', borderRadius: RADIUS.lg, color: COLOR.paperMid }}>
            Nenhum PEI encontrado. Clique em "+ Novo PEI" para iniciar.
          </div>
        ) : (
          peiList.map(pei => {
            const activeAcc = pei.accommodations?.filter(a => a.isActive).length || 0
            const avgProgress = pei.goals?.length
              ? Math.round(pei.goals.reduce((acc, g) => acc + (g.progressPct || 0), 0) / pei.goals.length)
              : 0

            return (
              <div
                key={pei.studentId}
                style={{
                  background: '#fff',
                  borderRadius: RADIUS.lg,
                  border: '1px solid #ede8dc',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  boxShadow: SHADOW.flat,
                  transition: 'all 0.2s'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#6d28d9', letterSpacing: 0.5 }}>
                        PEI &bull; ESTUDANTE LAUDADO
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: COLOR.paperInk, marginTop: 2 }}>
                        {pei.studentName}
                      </div>
                    </div>
                    {pei.laudoInfo?.cid10 && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#f5f3ff', color: '#6d28d9', padding: '2px 8px', borderRadius: 6, border: '1px solid #ddd6fe' }}>
                        {pei.laudoInfo.cid10}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: COLOR.paperWarm, marginTop: 8 }}>
                    <strong>Condição:</strong> {pei.diagnosis || 'Em avaliação'}
                  </div>

                  {/* Barra de Progresso das Metas */}
                  <div style={{ marginTop: 12, background: '#faf7f2', padding: 10, borderRadius: RADIUS.md, border: '1px solid #ede8dc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      <span>Progresso Médio das Metas:</span>
                      <span style={{ color: '#166534' }}>{avgProgress}%</span>
                    </div>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${avgProgress}%`, height: '100%', background: '#166534', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 6 }}>
                      {pei.goals?.length || 0} metas SMART &bull; {activeAcc} acomodações ativas
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setEditingStudentId(pei.studentId)}
                    style={{
                      flex: 1,
                      minWidth: 100,
                      padding: '8px 12px',
                      background: '#6d28d9',
                      color: '#fff',
                      border: 'none',
                      borderRadius: RADIUS.md,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <i className="ti ti-edit" /> Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => exportDocumentToWord({ type: 'pei', title: 'Plano Educacional Individualizado (PEI)', schoolName: 'Colégio Machado Sobrinho', studentName: pei.studentName, data: pei })}
                    style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Exportar DOCX"
                  >
                    <i className="ti ti-file-text" />
                  </button>

                  <button
                    type="button"
                    onClick={() => exportDocumentToPdf({ type: 'pei', title: 'Plano Educacional Individualizado (PEI)', schoolName: 'Colégio Machado Sobrinho', studentName: pei.studentName, data: pei })}
                    style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Imprimir / PDF"
                  >
                    <i className="ti ti-printer" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleArchive(pei.studentId, pei.studentName)}
                    style={{ padding: '8px 10px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Arquivar versão atual"
                  >
                    <i className="ti ti-archive" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ─── MODAL DE EDIÇÃO UNIFICADO ─── */}
      {editingStudentId && activePei && (
        <EditableDocumentModal
          isOpen={true}
          documentType="pei"
          schema={PEI_SCHEMA}
          initialData={activePei}
          linkedStudentId={activePei.studentId}
          linkedStudentName={activePei.studentName}
          onSave={data => {
            saveStudentPei({ ...activePei, ...data })
            setEditingStudentId(null)
            loadData()
          }}
          onClose={() => setEditingStudentId(null)}
        />
      )}
    </div>
  )
}
