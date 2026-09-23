'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, RADIUS, SHADOW } from '@/styles/tokens'
import {
  getAllPdiRecords,
  saveStudentPdi,
  archiveStudentPdi,
  PdiRecord,
  createDefaultPdi
} from '@/lib/pdiManagement'
import EditableDocumentModal from '@/components/editableDocument/EditableDocumentModal'
import { PDI_SCHEMA } from '@/lib/editableDocumentTypes'
import { exportDocumentToWord, exportDocumentToPdf } from '@/lib/documentExportService'
import { toast, showConfirm } from '@/components/Toast'

export default function PdiTab() {
  const [pdiRecords, setPdiRecords] = useState<Record<string, PdiRecord>>({})
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentId, setNewStudentId] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  const loadData = () => {
    setPdiRecords(getAllPdiRecords())
  }

  useEffect(() => {
    loadData()
    const handlePdiChanged = () => loadData()
    window.addEventListener('teacher:pdi_changed', handlePdiChanged)
    return () => window.removeEventListener('teacher:pdi_changed', handlePdiChanged)
  }, [])

  const pdiList = useMemo(() => {
    return Object.values(pdiRecords).filter(p =>
      p.studentName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (p.studentInfo?.gradeCycle || '').toLowerCase().includes(searchFilter.toLowerCase())
    )
  }, [pdiRecords, searchFilter])

  // Estatísticas
  const totalPdis = pdiList.length
  const totalSkills = pdiList.reduce((acc, p) => acc + (p.skillsMatrix?.length || 0), 0)
  const validatedSkills = pdiList.reduce((acc, p) => acc + (p.skillsMatrix?.filter(s => s.status === 'HV')?.length || 0), 0)

  const handleCreateNew = () => {
    if (!newStudentName.trim()) return
    const sId = newStudentId.trim() || `student_${Date.now()}`
    const defaultPdi = createDefaultPdi(sId, newStudentName.trim())
    saveStudentPdi(defaultPdi)
    setEditingStudentId(sId)
    setIsCreatingNew(false)
    setNewStudentName('')
    setNewStudentId('')
  }

  const handleArchive = async (studentId: string, studentName: string) => {
    const confirmed = await showConfirm(`Deseja arquivar o PDI de ${studentName}? A versão atual será salva no histórico.`)
    if (confirmed) {
      archiveStudentPdi(studentId)
      toast.success(`PDI de ${studentName} arquivado com sucesso.`)
      loadData()
    }
  }

  const activePdi = editingStudentId ? pdiRecords[editingStudentId] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── CARDS DE ESTATÍSTICAS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm }}>PDIs Ativos</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{totalPdis}</div>
          <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 2 }}>Planos de Desenvolvimento Individual</div>
        </div>

        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm }}>Habilidades BNCC Monitoradas</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#166534', marginTop: 4 }}>{totalSkills}</div>
          <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 2 }}>{validatedSkills} habilidades validadas (HV)</div>
        </div>

        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setIsCreatingNew(true)}
            style={{
              padding: '10px 18px',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
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
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
            }}
          >
            <i className="ti ti-plus" /> + Novo PDI
          </button>
        </div>
      </div>

      {/* ─── MODAL DE CRIAÇÃO RÁPIDA ─── */}
      {isCreatingNew && (
        <div style={{ background: '#faf7f2', border: '1px solid #bae6fd', borderRadius: RADIUS.lg, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#0369a1' }}>Criar Novo Plano de Desenvolvimento Individual (PDI)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={newStudentName}
              onChange={e => setNewStudentName(e.target.value)}
              placeholder="Nome completo do estudante..."
              autoFocus
              style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={!newStudentName.trim()}
              style={{
                padding: '8px 20px',
                background: newStudentName.trim() ? '#0284c7' : '#cbd5e1',
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
          placeholder="Buscar PDI por nome do estudante ou ciclo..."
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

      {/* ─── LISTA DE PDIS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {pdiList.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', background: '#fff', border: '1px solid #ede8dc', borderRadius: RADIUS.lg, color: COLOR.paperMid }}>
            Nenhum PDI cadastrado. Clique em "+ Novo PDI" para iniciar o documento.
          </div>
        ) : (
          pdiList.map(pdi => {
            const hvCount = pdi.skillsMatrix?.filter(s => s.status === 'HV').length || 0
            const hedCount = pdi.skillsMatrix?.filter(s => s.status === 'HED').length || 0
            const totalSk = pdi.skillsMatrix?.length || 0

            return (
              <div
                key={pdi.studentId}
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
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#0284c7', letterSpacing: 0.5 }}>
                        PDI &bull; PLANO DE DESENVOLVIMENTO
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: COLOR.paperInk, marginTop: 2 }}>
                        {pdi.studentName}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#f0f9ff', color: '#0369a1', padding: '2px 8px', borderRadius: 6, border: '1px solid #bae6fd' }}>
                      {pdi.studentInfo?.gradeCycle || 'Fundamental II'}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: COLOR.paperWarm, marginTop: 8 }}>
                    <strong>Instituição:</strong> {pdi.schoolInfo?.schoolName || pdi.schoolName || 'Colégio Machado Sobrinho'}
                  </div>

                  {/* Matriz de Habilidades Resumo */}
                  <div style={{ marginTop: 12, background: '#faf7f2', padding: 10, borderRadius: RADIUS.md, border: '1px solid #ede8dc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      <span>Habilidades Adaptadas:</span>
                      <span>{totalSk} mapeadas</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 4 }}>
                        HV: {hvCount}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#fef9c3', color: '#854d0e', padding: '2px 6px', borderRadius: 4 }}>
                        HED: {hedCount}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4 }}>
                        Intervenções: {pdi.interventionPlan?.length || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setEditingStudentId(pdi.studentId)}
                    style={{
                      flex: 1,
                      minWidth: 100,
                      padding: '8px 12px',
                      background: '#0284c7',
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
                    onClick={() => exportDocumentToWord({ type: 'pdi', title: 'Plano de Desenvolvimento Individual (PDI)', schoolName: pdi.schoolInfo?.schoolName || 'Colégio Machado Sobrinho', studentName: pdi.studentName, data: pdi })}
                    style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Exportar DOCX"
                  >
                    <i className="ti ti-file-text" />
                  </button>

                  <button
                    type="button"
                    onClick={() => exportDocumentToPdf({ type: 'pdi', title: 'Plano de Desenvolvimento Individual (PDI)', schoolName: pdi.schoolInfo?.schoolName || 'Colégio Machado Sobrinho', studentName: pdi.studentName, data: pdi })}
                    style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Imprimir / PDF"
                  >
                    <i className="ti ti-printer" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleArchive(pdi.studentId, pdi.studentName)}
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
      {editingStudentId && activePdi && (
        <EditableDocumentModal
          isOpen={true}
          documentType="pdi"
          schema={PDI_SCHEMA}
          initialData={activePdi}
          linkedStudentId={activePdi.studentId}
          linkedStudentName={activePdi.studentName}
          onSave={data => {
            saveStudentPdi({ ...activePdi, ...data })
            setEditingStudentId(null)
            loadData()
          }}
          onClose={() => setEditingStudentId(null)}
        />
      )}
    </div>
  )
}
