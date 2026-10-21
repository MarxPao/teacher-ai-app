'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, RADIUS, SHADOW, FONT } from '@/styles/tokens'
import {
  getAllPeiRecords,
  saveStudentPei,
  archiveStudentPei,
  syncPeiToSupabase,
  hydratePeisFromSupabase,
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
  const [isSyncingCloud, setIsSyncingCloud] = useState(false)

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
    return Object.values(peiRecords).filter(
      p =>
        p.studentName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (p.diagnosis || '').toLowerCase().includes(searchFilter.toLowerCase())
    )
  }, [peiRecords, searchFilter])

  // Estatísticas Rápidas
  const totalPeis = peiList.length
  const totalGoals = peiList.reduce((acc, p) => acc + (p.goals?.length || 0), 0)
  const achievedGoals = peiList.reduce(
    (acc, p) => acc + (p.goals?.filter(g => g.status === 'achieved')?.length || 0),
    0
  )

  const handleCreateNew = () => {
    if (!newStudentName.trim()) return
    const sId = newStudentId.trim() || `student_${Date.now()}`
    const defaultPei = createDefaultPei(sId, newStudentName.trim())
    saveStudentPei(defaultPei)
    setEditingStudentId(sId)
    setIsCreatingNew(false)
    setNewStudentName('')
    setNewStudentId('')
    loadData()
  }

  const handleCloudSync = async () => {
    setIsSyncingCloud(true)
    try {
      const res = await syncPeiToSupabase()
      if (res.ok) {
        toast.success('PEIs sincronizados com o Supabase Cloud com sucesso!')
      } else {
        await hydratePeisFromSupabase()
        loadData()
        toast.info('Dados locais salvos (verifique configuração do Supabase caso deseje backup em nuvem).')
      }
    } finally {
      setIsSyncingCloud(false)
    }
  }

  const handleArchive = async (studentId: string, studentName: string) => {
    const confirmed = await showConfirm(
      `Deseja arquivar a versão atual do PEI de ${studentName}? Ele ficará disponível no histórico.`
    )
    if (confirmed) {
      archiveStudentPei(studentId)
      toast.success(`PEI de ${studentName} arquivado com sucesso.`)
      loadData()
    }
  }

  const activePei = editingStudentId ? peiRecords[editingStudentId] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT.sans }}>
      {/* ─── CARDS DE ESTATÍSTICAS & AÇÕES EDITORIAIS ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 14
        }}
      >
        <div
          style={{
            background: '#fff',
            padding: 18,
            borderRadius: RADIUS.lg,
            border: '1px solid #ede8dc',
            boxShadow: SHADOW.flat
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#8b5e3c',
              letterSpacing: 0.6
            }}
          >
            PEIs Ativos
          </div>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: 26,
              fontWeight: 800,
              color: '#2c1a0e',
              marginTop: 4
            }}
          >
            {totalPeis}
          </div>
          <div style={{ fontSize: 11.5, color: COLOR.paperMid, marginTop: 2 }}>
            Estudantes com Plano Educacional Individualizado
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            padding: 18,
            borderRadius: RADIUS.lg,
            border: '1px solid #ede8dc',
            boxShadow: SHADOW.flat
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#8b5e3c',
              letterSpacing: 0.6
            }}
          >
            Metas SMART Acompanhadas
          </div>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: 26,
              fontWeight: 800,
              color: '#166534',
              marginTop: 4
            }}
          >
            {totalGoals}
          </div>
          <div style={{ fontSize: 11.5, color: COLOR.paperMid, marginTop: 2 }}>
            {achievedGoals} metas alcançadas com êxito
          </div>
        </div>

        <div
          style={{
            background: '#fdf8f2',
            padding: 18,
            borderRadius: RADIUS.lg,
            border: '1px solid #dcd7cb',
            boxShadow: SHADOW.flat,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <button
            type="button"
            onClick={() => setIsCreatingNew(true)}
            style={{
              padding: '10px 18px',
              background: '#2c1a0e',
              color: '#fdf8f2',
              border: '1px solid #8b5e3c',
              borderRadius: RADIUS.md,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            + Novo PEI (Plano Individualizado)
          </button>

          <button
            type="button"
            onClick={handleCloudSync}
            disabled={isSyncingCloud}
            style={{
              padding: '7px 14px',
              background: '#fff',
              color: '#8b5e3c',
              border: '1px solid #dcd7cb',
              borderRadius: RADIUS.md,
              fontWeight: 700,
              fontSize: 11.5,
              cursor: isSyncingCloud ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            ☁️ {isSyncingCloud ? 'Sincronizando Supabase...' : 'Sincronizar PEIs no Supabase'}
          </button>
        </div>
      </div>

      {/* ─── MODAL DE CRIAÇÃO RÁPIDA ─── */}
      {isCreatingNew && (
        <div
          style={{
            background: '#fdf8f2',
            border: '1.5px solid #8b5e3c',
            borderRadius: RADIUS.lg,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          <div style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 15, color: '#2c1a0e' }}>
            Criar Novo Plano Educacional Individualizado (PEI)
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={newStudentName}
              onChange={e => setNewStudentName(e.target.value)}
              placeholder="Nome completo do(a) aluno(a)..."
              autoFocus
              style={{
                flex: 1,
                minWidth: 240,
                padding: '9px 12px',
                borderRadius: RADIUS.md,
                border: '1px solid #dcd7cb',
                background: '#fff',
                color: '#2c1a0e',
                fontSize: 13
              }}
            />
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={!newStudentName.trim()}
              style={{
                padding: '9px 20px',
                background: newStudentName.trim() ? '#2c1a0e' : '#e2d9c8',
                color: newStudentName.trim() ? '#fdf8f2' : '#9c8b7a',
                border: '1px solid #8b5e3c',
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
              style={{
                padding: '9px 16px',
                background: '#fff',
                border: '1px solid #dcd7cb',
                borderRadius: RADIUS.md,
                fontSize: 13,
                color: '#2c1a0e',
                cursor: 'pointer'
              }}
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
          placeholder="Buscar PEI por nome do(a) aluno(a) ou diagnóstico..."
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: RADIUS.md,
            border: '1px solid #dcd7cb',
            background: '#fff',
            color: '#2c1a0e',
            fontSize: 13
          }}
        />
      </div>

      {/* ─── LISTA DE PEIS ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 16
        }}
      >
        {peiList.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: 40,
              textAlign: 'center',
              background: '#fff',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.lg,
              color: COLOR.paperMid
            }}
          >
            Nenhum PEI encontrado. Clique em "+ Novo PEI" para iniciar.
          </div>
        ) : (
          peiList.map(pei => {
            const activeAcc = pei.accommodations?.filter(a => a.isActive).length || 0
            const avgProgress = pei.goals?.length
              ? Math.round(
                  pei.goals.reduce((acc, g) => acc + (g.progressPct || 0), 0) / pei.goals.length
                )
              : 0

            return (
              <div
                key={pei.studentId}
                style={{
                  background: '#fff',
                  borderRadius: RADIUS.lg,
                  border: '1px solid #dcd7cb',
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  boxShadow: SHADOW.flat
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          color: '#8b5e3c',
                          letterSpacing: 0.7
                        }}
                      >
                        PEI &bull; ACOMPANHAMENTO INDIVIDUALIZADO
                      </div>
                      <div
                        style={{
                          fontFamily: FONT.serif,
                          fontSize: 18,
                          fontWeight: 700,
                          color: COLOR.paperInk,
                          marginTop: 2
                        }}
                      >
                        {pei.studentName}
                      </div>
                    </div>
                    {pei.laudoInfo?.cid10 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: '#f5efe6',
                          color: '#2c1a0e',
                          padding: '3px 9px',
                          borderRadius: 6,
                          border: '1px solid #dcd7cb'
                        }}
                      >
                        {pei.laudoInfo.cid10}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: COLOR.paperWarm, marginTop: 8 }}>
                    <strong>Condição / Diagnóstico:</strong> {pei.diagnosis || 'Em avaliação'}
                  </div>

                  {/* Barra de Progresso das Metas */}
                  <div
                    style={{
                      marginTop: 12,
                      background: '#fdf8f2',
                      padding: 12,
                      borderRadius: RADIUS.md,
                      border: '1px solid #ede8dc'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11.5,
                        fontWeight: 700,
                        marginBottom: 4
                      }}
                    >
                      <span>Progresso Médio das Metas:</span>
                      <span style={{ color: '#166534' }}>{avgProgress}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: '#e2d9c8',
                        borderRadius: 3,
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          width: `${avgProgress}%`,
                          height: '100%',
                          background: '#166534',
                          borderRadius: 3
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 6 }}>
                      {pei.goals?.length || 0} metas SMART &bull; {activeAcc} acomodações ativas
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    borderTop: '1px solid #ede8dc',
                    paddingTop: 12,
                    flexWrap: 'wrap'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditingStudentId(pei.studentId)}
                    style={{
                      flex: 1,
                      minWidth: 120,
                      padding: '8px 14px',
                      background: '#2c1a0e',
                      color: '#fdf8f2',
                      border: '1px solid #8b5e3c',
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
                    ✏️ Abrir e Editar PEI
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      exportDocumentToWord({
                        type: 'pei',
                        title: 'Plano Educacional Individualizado (PEI)',
                        schoolName: 'Colégio Machado Sobrinho',
                        studentName: pei.studentName,
                        data: pei
                      })
                    }
                    style={{
                      padding: '8px 10px',
                      background: '#fff',
                      border: '1px solid #dcd7cb',
                      color: '#2c1a0e',
                      borderRadius: RADIUS.md,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Exportar Word (.doc)"
                  >
                    📝 .DOC
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      exportDocumentToPdf({
                        type: 'pei',
                        title: 'Plano Educacional Individualizado (PEI)',
                        schoolName: 'Colégio Machado Sobrinho',
                        studentName: pei.studentName,
                        data: pei
                      })
                    }
                    style={{
                      padding: '8px 10px',
                      background: '#fff',
                      border: '1px solid #dcd7cb',
                      color: '#2c1a0e',
                      borderRadius: RADIUS.md,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Imprimir / Salvar PDF"
                  >
                    🖨️ PDF
                  </button>

                  <button
                    type="button"
                    onClick={() => handleArchive(pei.studentId, pei.studentName)}
                    style={{
                      padding: '8px 10px',
                      background: '#fdf8f2',
                      border: '1px solid #e6c9a8',
                      color: '#92400e',
                      borderRadius: RADIUS.md,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                    title="Arquivar versão atual"
                  >
                    📦
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
