'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, RADIUS, SHADOW, FONT } from '@/styles/tokens'
import {
  getAllPdiRecords,
  saveStudentPdi,
  archiveStudentPdi,
  advancePdiToNextSemester,
  syncPdiToSupabase,
  hydratePdisFromSupabase,
  normalizePdiSkillStatus,
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
  const [newStudentGrade, setNewStudentGrade] = useState('6º ano do Ensino Fundamental')
  const [newStudentId, setNewStudentId] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [isSyncingCloud, setIsSyncingCloud] = useState(false)

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
    return Object.values(pdiRecords).filter(
      p =>
        p.studentName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (p.identification?.gradeCycle || p.studentInfo?.gradeCycle || '')
          .toLowerCase()
          .includes(searchFilter.toLowerCase())
    )
  }, [pdiRecords, searchFilter])

  // Estatísticas globais
  const totalPdis = pdiList.length
  const totalSkills = pdiList.reduce((acc, p) => acc + (p.skillsMatrix?.length || 0), 0)
  const masteredSkills = pdiList.reduce(
    (acc, p) =>
      acc +
      (p.skillsMatrix?.filter(s => normalizePdiSkillStatus(s.status) === 'Sim')?.length || 0),
    0
  )
  const developingSkills = pdiList.reduce(
    (acc, p) =>
      acc +
      (p.skillsMatrix?.filter(s => normalizePdiSkillStatus(s.status) === 'Em desenvolvimento')
        ?.length || 0),
    0
  )

  const handleCreateNew = () => {
    if (!newStudentName.trim()) return
    const sId = newStudentId.trim() || `student_${Date.now()}`
    const defaultPdi = createDefaultPdi(
      sId,
      newStudentName.trim(),
      undefined,
      'Colégio Machado Sobrinho',
      newStudentGrade
    )
    saveStudentPdi(defaultPdi)
    setEditingStudentId(sId)
    setIsCreatingNew(false)
    setNewStudentName('')
    setNewStudentId('')
    loadData()
  }

  const handleAdvanceSemester = async (pdi: PdiRecord) => {
    const currentPeriod =
      pdi.identification?.validityPeriod || pdi.studentInfo?.validityPeriod || '1º semestre / 2026'
    const nextPeriod = currentPeriod.includes('1º semestre')
      ? currentPeriod.replace('1º semestre', '2º semestre')
      : '1º semestre / 2027'
    const nextReview = nextPeriod.includes('2º semestre') ? 'Dezembro / 2026' : 'Julho / 2027'

    const confirmed = await showConfirm(
      `Iniciar o ciclo "${nextPeriod}" para ${pdi.studentName}? O PDI atual (${currentPeriod}) será salvo no histórico semestral e as habilidades em desenvolvimento ou previstas para o próximo semestre ficarão prontas para avaliação.`
    )
    if (confirmed) {
      const updated = advancePdiToNextSemester(pdi.studentId, nextPeriod, nextReview)
      if (updated) {
        toast.success(`Ciclo de ${pdi.studentName} avançado para ${nextPeriod}!`)
        loadData()
        setEditingStudentId(pdi.studentId)
      }
    }
  }

  const handleCloudSync = async () => {
    setIsSyncingCloud(true)
    try {
      const syncRes = await syncPdiToSupabase()
      if (syncRes.ok) {
        toast.success('PDIs sincronizados com o Supabase Cloud com sucesso!')
      } else {
        await hydratePdisFromSupabase()
        loadData()
        toast.info('Dados locais salvos (verifique configuração do Supabase caso deseje backup em nuvem).')
      }
    } finally {
      setIsSyncingCloud(false)
    }
  }

  const handleArchive = async (studentId: string, studentName: string) => {
    const confirmed = await showConfirm(
      `Deseja arquivar o PDI de ${studentName}? A versão atual será salva no histórico.`
    )
    if (confirmed) {
      archiveStudentPdi(studentId)
      toast.success(`PDI de ${studentName} arquivado com sucesso.`)
      loadData()
    }
  }

  const activePdi = editingStudentId ? pdiRecords[editingStudentId] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT.sans }}>
      {/* ─── CARDS DE ESTATÍSTICAS EDITORIAIS ─── */}
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
            PDIs Ativos
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
            {totalPdis}
          </div>
          <div style={{ fontSize: 11.5, color: COLOR.paperMid, marginTop: 2 }}>
            Planos de Desenvolvimento Individual (BNCC)
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
            Habilidades BNCC Monitoradas
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
            {masteredSkills} <span style={{ fontSize: 14, color: '#7a5c42', fontWeight: 600 }}>/ {totalSkills}</span>
          </div>
          <div style={{ fontSize: 11.5, color: COLOR.paperMid, marginTop: 2 }}>
            {masteredSkills} superadas (Sim) &bull; {developingSkills} em desenvolvimento
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
            + Novo PDI (Modelo Oficial BNCC)
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
            ☁️ {isSyncingCloud ? 'Sincronizando Supabase...' : 'Sincronizar PDIs no Supabase'}
          </button>
        </div>
      </div>

      {/* ─── FORMULÁRIO DE CRIAÇÃO RÁPIDA ─── */}
      {isCreatingNew && (
        <div
          style={{
            background: '#fdf8f2',
            border: '1.5px solid #8b5e3c',
            borderRadius: RADIUS.lg,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 15, color: '#2c1a0e' }}>
            Criar Novo Plano de Desenvolvimento Individual (PDI)
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
            <select
              value={newStudentGrade}
              onChange={e => setNewStudentGrade(e.target.value)}
              style={{
                padding: '9px 12px',
                borderRadius: RADIUS.md,
                border: '1px solid #dcd7cb',
                background: '#fff',
                color: '#2c1a0e',
                fontSize: 13
              }}
            >
              <option value="6º ano do Ensino Fundamental">6º ano do Ensino Fundamental</option>
              <option value="7º ano do Ensino Fundamental">7º ano do Ensino Fundamental</option>
              <option value="8º ano do Ensino Fundamental">8º ano do Ensino Fundamental</option>
              <option value="9º ano do Ensino Fundamental">9º ano do Ensino Fundamental</option>
              <option value="Ensino Médio">Ensino Médio</option>
            </select>
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
          placeholder="Buscar PDI por nome do(a) estudante ou série/ano..."
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

      {/* ─── LISTA DE PDIS ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 16
        }}
      >
        {pdiList.length === 0 ? (
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
            Nenhum PDI encontrado. Clique em "+ Novo PDI" para iniciar o documento.
          </div>
        ) : (
          pdiList.map(pdi => {
            const simCount =
              pdi.skillsMatrix?.filter(s => normalizePdiSkillStatus(s.status) === 'Sim').length || 0
            const devCount =
              pdi.skillsMatrix?.filter(
                s => normalizePdiSkillStatus(s.status) === 'Em desenvolvimento'
              ).length || 0
            const naoCount =
              pdi.skillsMatrix?.filter(s => normalizePdiSkillStatus(s.status) === 'Não').length || 0
            const totalSk = pdi.skillsMatrix?.length || 0
            const ident = pdi.identification || pdi.studentInfo || {}
            const periodLabel = ident.validityPeriod || '1º semestre / 2026'
            const nextRevLabel = ident.nextReviewDate || 'Dezembro / 2026'
            const gradeLabel = ident.gradeCycle || '6º ano do Ensino Fundamental'
            const semHistoryCount = pdi.semesterHistory?.length || 0

            return (
              <div
                key={pdi.studentId}
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
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 8
                    }}
                  >
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
                        PDI &bull; LÍNGUA INGLESA (BNCC)
                      </div>
                      <div
                        style={{
                          fontFamily: FONT.serif,
                          fontSize: 18,
                          fontWeight: 700,
                          color: '#2c1a0e',
                          marginTop: 2
                        }}
                      >
                        {pdi.studentName}
                      </div>
                    </div>
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
                      {gradeLabel}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      fontSize: 12,
                      color: '#5a3e28',
                      marginTop: 8
                    }}
                  >
                    <span>
                      <strong>Turno:</strong> {ident.shift || 'Matutino'}
                    </span>
                    <span>
                      <strong>Vigência:</strong> {periodLabel}
                    </span>
                    <span>
                      <strong>Revisão:</strong> {nextRevLabel}
                    </span>
                  </div>

                  {ident.regentTeacher && (
                    <div style={{ fontSize: 11.5, color: COLOR.paperMid, marginTop: 4 }}>
                      <strong>Prof(a). Regente:</strong> {ident.regentTeacher}
                      {ident.pedagogicalTeam ? ` • Equipe: ${ident.pedagogicalTeam}` : ''}
                    </div>
                  )}

                  {/* Matriz de Habilidades BNCC Resumo */}
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
                        color: '#2c1a0e',
                        marginBottom: 6
                      }}
                    >
                      <span>Habilidades BNCC Monitoradas:</span>
                      <span>{totalSk} habilidades</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: '#f0fdf4',
                          color: '#166534',
                          border: '1px solid #bbf7d0',
                          padding: '2px 8px',
                          borderRadius: 6
                        }}
                      >
                        ✓ Sim: {simCount}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: '#fffbeb',
                          color: '#92400e',
                          border: '1px solid #fde68a',
                          padding: '2px 8px',
                          borderRadius: 6
                        }}
                      >
                        ⏳ Em desenv.: {devCount}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: '#fef2f2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          padding: '2px 8px',
                          borderRadius: 6
                        }}
                      >
                        ○ Não / 2º Sem.: {naoCount}
                      </span>
                      {semHistoryCount > 0 && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: '#f5efe6',
                            color: '#8b5e3c',
                            border: '1px solid #dcd7cb',
                            padding: '2px 8px',
                            borderRadius: 6
                          }}
                        >
                          📊 {semHistoryCount} Semestre(s) anterior(es)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações do Card */}
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
                    onClick={() => setEditingStudentId(pdi.studentId)}
                    style={{
                      flex: 1,
                      minWidth: 130,
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
                    ✏️ Abrir e Editar PDI
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAdvanceSemester(pdi)}
                    style={{
                      padding: '8px 12px',
                      background: '#f5efe6',
                      color: '#8b5e3c',
                      border: '1px solid #dcd7cb',
                      borderRadius: RADIUS.md,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Virar para o próximo semestre para avaliar se o aluno concluiu as competências pendentes"
                  >
                    🔄 Virar Semestre
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      exportDocumentToWord({
                        type: 'pdi',
                        title: 'PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI)',
                        schoolName:
                          ident.schoolName || pdi.schoolName || 'Colégio Machado Sobrinho',
                        studentName: pdi.studentName,
                        data: pdi
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
                        type: 'pdi',
                        title: 'PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI)',
                        schoolName:
                          ident.schoolName || pdi.schoolName || 'Colégio Machado Sobrinho',
                        studentName: pdi.studentName,
                        data: pdi
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
                    onClick={() => handleArchive(pdi.studentId, pdi.studentName)}
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
