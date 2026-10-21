'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { COLOR, RADIUS, SHADOW, FONT } from '@/styles/tokens'
import { useModalA11y } from '@/hooks/useModalA11y'
import { toast } from '@/components/Toast'
import {
  DocumentType,
  DocumentSchema,
  BoxSchema,
  getSchemaForType
} from '@/lib/editableDocumentTypes'
import {
  CANONICAL_PDI_OBJECTIVE_TEXT,
  CANONICAL_PDI_REVIEW_TEXT,
  CANONICAL_PDI_STRATEGIES,
  CANONICAL_CARINA_6ANO_SKILLS,
  normalizePdiSkillStatus,
  syncPdiToSupabase
} from '@/lib/pdiManagement'
import { syncPeiToSupabase } from '@/lib/peiManagement'
import HeaderFieldsBox from './boxes/HeaderFieldsBox'
import ChecklistConditionalBox from './boxes/ChecklistConditionalBox'
import RichNarrativeBox from './boxes/RichNarrativeBox'
import SkillsMatrixTableBox from './boxes/SkillsMatrixTableBox'
import GoalTrackerBox from './boxes/GoalTrackerBox'
import StrategyListBox from './boxes/StrategyListBox'
import SignatureBlockBox from './boxes/SignatureBlockBox'
import MilestoneTrackerBox from './boxes/MilestoneTrackerBox'
import RubricBuilderBox from './boxes/RubricBuilderBox'
import ProgressLogBox from './boxes/ProgressLogBox'
import { exportDocumentToWord, exportDocumentToPdf } from '@/lib/documentExportService'

export interface EditableDocumentModalProps {
  isOpen: boolean
  documentType: DocumentType
  schema?: DocumentSchema
  initialData?: any
  linkedStudentId?: string
  linkedStudentName?: string
  linkedClassId?: string
  linkedSchoolName?: string
  onSave: (data: any) => void
  onClose: () => void
}

export default function EditableDocumentModal({
  isOpen,
  documentType,
  schema: customSchema,
  initialData,
  linkedStudentId,
  linkedStudentName,
  linkedClassId,
  linkedSchoolName = 'Colégio Machado Sobrinho',
  onSave,
  onClose
}: EditableDocumentModalProps) {
  const schema = customSchema || getSchemaForType(documentType)
  const modalRef = useRef<HTMLDivElement>(null)

  useModalA11y({
    isOpen,
    onClose,
    modalRef
  })

  const [docData, setDocData] = useState<Record<string, any>>(() => initialData || {})
  const [collapsedBoxes, setCollapsedBoxes] = useState<Record<string, boolean>>({
    relatorio_circunstanciado: true // Anexo clínico opcional inicia recolhido
  })
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor')
  const [isSyncingCloud, setIsSyncingCloud] = useState(false)

  // Hidrata dados iniciais garantindo compatibilidade com o modelo oficial de 7 seções
  useEffect(() => {
    if (isOpen) {
      const base = initialData ? JSON.parse(JSON.stringify(initialData)) : {}

      const studentName =
        linkedStudentName ||
        base.studentName ||
        base.identification?.studentName ||
        base.studentInfo?.studentName ||
        ''
      const gradeCycle =
        base.identification?.gradeCycle ||
        base.studentInfo?.gradeCycle ||
        '6º ano do Ensino Fundamental'
      const shift = base.identification?.shift || base.studentInfo?.shift || 'Matutino'
      const creationDate =
        base.identification?.creationDate ||
        base.schoolInfo?.creationDate ||
        new Date().toLocaleDateString('pt-BR')
      const curricularComponent =
        base.identification?.curricularComponent ||
        base.studentInfo?.curricularComponent ||
        `Língua Inglesa — ${gradeCycle}`
      const regentTeacher =
        base.identification?.regentTeacher ||
        base.studentInfo?.regentTeacher ||
        'Rafaela Franco Toldo'
      const pedagogicalTeam =
        base.identification?.pedagogicalTeam ||
        base.studentInfo?.pedagogicalTeam ||
        'Marianna Panisset'
      const validityPeriod =
        base.identification?.validityPeriod ||
        base.studentInfo?.validityPeriod ||
        '1º semestre / 2026'
      const nextReviewDate =
        base.identification?.nextReviewDate ||
        base.studentInfo?.nextReviewDate ||
        'Dezembro / 2026'
      const schoolName =
        base.identification?.schoolName ||
        base.schoolInfo?.schoolName ||
        base.schoolName ||
        linkedSchoolName

      base.studentName = studentName
      if (linkedStudentId && !base.studentId) base.studentId = linkedStudentId
      if (linkedClassId && !base.classId) base.classId = linkedClassId
      base.schoolName = schoolName

      if (documentType === 'pdi') {
        base.identification = {
          studentName,
          gradeCycle,
          shift,
          birthDate: base.identification?.birthDate ?? base.studentInfo?.birthDate ?? '',
          creationDate,
          curricularComponent,
          regentTeacher,
          pedagogicalTeam,
          guardians: base.identification?.guardians ?? base.studentInfo?.guardians ?? '',
          validityPeriod,
          nextReviewDate,
          schoolName
        }

        if (!base.generalObjective || !base.generalObjective.objetivoGeral) {
          base.generalObjective = {
            objetivoGeral:
              base.curricularProposal?.proposta || CANONICAL_PDI_OBJECTIVE_TEXT
          }
        }
        base.objetivo_geral = base.generalObjective

        if (!Array.isArray(base.interventionPlan) || base.interventionPlan.length === 0) {
          base.interventionPlan = CANONICAL_PDI_STRATEGIES.map(s => ({ ...s }))
        }

        if (!Array.isArray(base.skillsMatrix) || base.skillsMatrix.length === 0) {
          base.skillsMatrix = CANONICAL_CARINA_6ANO_SKILLS.map(s => ({ ...s }))
        }

        if (!base.generalObservations || !base.generalObservations.evolucaoGeral) {
          const fallbackEvolution = base.developmentAssessment
            ? Object.values(base.developmentAssessment).filter(Boolean).join('\n\n')
            : ''
          base.generalObservations = {
            evolucaoGeral: fallbackEvolution
          }
        }
        base.observacoes_evolucao = base.generalObservations

        if (!base.followUpReview || !base.followUpReview.revisaoPeriodica) {
          base.followUpReview = {
            revisaoPeriodica: CANONICAL_PDI_REVIEW_TEXT,
            parecerProximoSemestre: base.followUpReview?.parecerProximoSemestre || ''
          }
        }
        base.acompanhamento_revisao = base.followUpReview

        if (!Array.isArray(base.signatures) || base.signatures.length === 0) {
          base.signatures = [
            { role: 'Professor(a) regente', name: regentTeacher, signed: false },
            { role: 'Coordenação pedagógica', name: pedagogicalTeam, signed: false },
            { role: 'Responsável pelo(a) aluno(a)', name: '', signed: false },
            { role: 'Data', name: creationDate, signed: false }
          ]
        }
      }

      setDocData(base)
    }
  }, [isOpen, initialData, linkedStudentId, linkedStudentName, linkedClassId, linkedSchoolName, documentType])

  // Resolve dados específicos de cada box sem colisão entre seções
  const getBoxContainerData = (box: BoxSchema): any => {
    if (box.id === 'identificacao') {
      return docData.identification || docData.studentInfo || docData
    }
    if (box.id === 'dados_escola') {
      return docData.schoolInfo || docData
    }
    if (box.id === 'identificacao_aluno') {
      return docData.studentInfo || docData
    }
    if (box.id === 'objetivo_geral') {
      return docData.generalObjective || docData.objetivo_geral || {}
    }
    if (box.id === 'observacoes_evolucao') {
      return docData.generalObservations || docData.observacoes_evolucao || {}
    }
    if (box.id === 'acompanhamento_revisao') {
      return docData.followUpReview || docData.acompanhamento_revisao || {}
    }
    if (box.id === 'avaliacao_inicial') {
      return docData.developmentAssessment || docData.avaliacao_inicial || {}
    }
    if (box.id === 'proposta_curricular') {
      return docData.curricularProposal || docData.proposta_curricular || {}
    }
    return docData[box.id] || docData
  }

  // Verificação de preenchimento por box
  const boxStatus = useMemo(() => {
    const status: Record<string, { isFilled: boolean; label: string }> = {}

    schema.boxes.forEach(box => {
      let isFilled = false

      switch (box.boxType) {
        case 'header_fields': {
          const fields = box.config?.fields || []
          const container = getBoxContainerData(box)
          const filledCount = fields.filter((f: any) => {
            const val = container?.[f.key] ?? docData[f.key]
            return val !== undefined && String(val).trim() !== ''
          }).length
          isFilled = filledCount >= Math.min(2, fields.length)
          break
        }
        case 'checklist_conditional': {
          isFilled = Boolean(
            docData.clinicalReport?.hasClinicalDiagnosis ||
              docData.clinicalReport?.cid10 ||
              docData.hasClinicalDiagnosis
          )
          break
        }
        case 'rich_narrative': {
          const subs = box.config?.subsections || []
          const container = getBoxContainerData(box)
          const filledSubs = subs.filter((s: any) => Boolean(container?.[s.key]?.trim()))
          isFilled = filledSubs.length > 0
          break
        }
        case 'skills_matrix_table': {
          const list =
            docData.skillsMatrix ||
            docData.flexibilizacaoCurricular ||
            docData.targetSkills ||
            docData[box.id] ||
            []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'goal_tracker': {
          const list = docData.goals || docData[box.id] || []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'strategy_list': {
          const list =
            docData.accommodations ||
            docData.interventionPlan ||
            docData.teamRoles ||
            docData[box.id] ||
            []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'signature_block': {
          const list = docData.signatures || docData[box.id] || []
          isFilled =
            Array.isArray(list) && list.some((s: any) => s.signed || Boolean(s.name?.trim()))
          break
        }
        case 'milestone_tracker': {
          const list = docData.milestones || docData[box.id] || []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'rubric_builder': {
          const list = docData.rubric || docData[box.id] || []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'progress_log': {
          const list = docData.progressLogs || docData[box.id] || []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
      }

      status[box.id] = {
        isFilled,
        label: isFilled ? 'Preenchido' : box.required ? 'Obrigatório' : 'Opcional'
      }
    })

    return status
  }, [schema.boxes, docData])

  const totalBoxes = schema.boxes.length
  const filledCount = Object.values(boxStatus).filter(s => s.isFilled).length
  const progressPct = totalBoxes > 0 ? Math.round((filledCount / totalBoxes) * 100) : 0

  if (!isOpen) return null

  const toggleCollapse = (boxId: string) => {
    setCollapsedBoxes(prev => ({ ...prev, [boxId]: !prev[boxId] }))
  }

  const handleExpandCollapseAll = (collapseAll: boolean) => {
    const next: Record<string, boolean> = {}
    schema.boxes.forEach(b => {
      next[b.id] = collapseAll
    })
    setCollapsedBoxes(next)
  }

  const handleUpdateBoxData = (
    boxId: string,
    boxType: string,
    fieldOrValue: any,
    possibleValue?: any
  ) => {
    setDocData(prev => {
      const next = { ...prev }

      if (boxType === 'header_fields') {
        const fieldKey = fieldOrValue
        const val = possibleValue
        next[fieldKey] = val
        if (!next[boxId]) next[boxId] = {}
        next[boxId] = { ...next[boxId], [fieldKey]: val }

        if (boxId === 'identificacao') {
          next.identification = { ...(next.identification || {}), [fieldKey]: val }
          next.studentInfo = { ...(next.studentInfo || {}), [fieldKey]: val }
          if (fieldKey === 'studentName') next.studentName = val
          if (fieldKey === 'schoolName') next.schoolName = val
        }
      } else if (boxType === 'checklist_conditional') {
        const fieldKey = fieldOrValue
        const val = possibleValue
        next[fieldKey] = val
        next.clinicalReport = {
          ...(next.clinicalReport || { hasClinicalDiagnosis: false }),
          [fieldKey]: val
        }
      } else if (boxType === 'rich_narrative') {
        const subKey = fieldOrValue
        const val = possibleValue
        next[boxId] = { ...(next[boxId] || {}), [subKey]: val }

        if (boxId === 'objetivo_geral') {
          next.generalObjective = { ...(next.generalObjective || {}), [subKey]: val }
        } else if (boxId === 'observacoes_evolucao') {
          next.generalObservations = { ...(next.generalObservations || {}), [subKey]: val }
        } else if (boxId === 'acompanhamento_revisao') {
          next.followUpReview = { ...(next.followUpReview || {}), [subKey]: val }
        } else if (boxId === 'avaliacao_inicial') {
          next.developmentAssessment = { ...(next.developmentAssessment || {}), [subKey]: val }
        } else if (boxId === 'proposta_curricular') {
          next.curricularProposal = { ...(next.curricularProposal || {}), [subKey]: val }
        }
      } else if (boxType === 'skills_matrix_table') {
        next.skillsMatrix = fieldOrValue
        next.flexibilizacaoCurricular = fieldOrValue
        next.targetSkills = fieldOrValue
        next[boxId] = fieldOrValue
      } else if (boxType === 'goal_tracker') {
        next.goals = fieldOrValue
        next[boxId] = fieldOrValue
      } else if (boxType === 'strategy_list') {
        if (documentType === 'pei') next.accommodations = fieldOrValue
        else if (documentType === 'pdi') next.interventionPlan = fieldOrValue
        else if (documentType === 'projeto') next.teamRoles = fieldOrValue
        next[boxId] = fieldOrValue
      } else if (boxType === 'signature_block') {
        next.signatures = fieldOrValue
        next[boxId] = fieldOrValue
      } else if (boxType === 'milestone_tracker') {
        next.milestones = fieldOrValue
        next[boxId] = fieldOrValue
      } else if (boxType === 'rubric_builder') {
        next.rubric = fieldOrValue
        next[boxId] = fieldOrValue
      } else if (boxType === 'progress_log') {
        next.progressLogs = fieldOrValue
        next[boxId] = fieldOrValue
      }

      return next
    })
  }

  // Virada de Semestre dentro do próprio modal para avaliar evolução longitudinal
  const handleAdvanceSemesterInModal = () => {
    const currentPeriod =
      docData.identification?.validityPeriod ||
      docData.studentInfo?.validityPeriod ||
      '1º semestre / 2026'
    const nextPeriod = currentPeriod.includes('1º semestre')
      ? currentPeriod.replace('1º semestre', '2º semestre')
      : '1º semestre / 2027'
    const nextReview = nextPeriod.includes('2º semestre') ? 'Dezembro / 2026' : 'Julho / 2027'

    const rows = Array.isArray(docData.skillsMatrix) ? docData.skillsMatrix : []
    const normalizedRows = rows.map((r: any) => ({
      ...r,
      normalized: normalizePdiSkillStatus(r.status)
    }))

    const snapshot = {
      id: `sem_${Date.now()}`,
      period: currentPeriod,
      archivedAt: new Date().toISOString(),
      summaryStats: {
        total: normalizedRows.length,
        mastered: normalizedRows.filter((r: any) => r.normalized === 'Sim').length,
        developing: normalizedRows.filter((r: any) => r.normalized === 'Em desenvolvimento').length,
        notMastered: normalizedRows.filter((r: any) => r.normalized === 'Não').length
      },
      skillsSnapshot: normalizedRows.map((r: any) => ({
        skillCode: r.skillCode,
        status: r.normalized,
        observations: r.workDoneOrAdaptedSkill || ''
      })),
      generalEvolutionSnapshot: docData.generalObservations?.evolucaoGeral || '',
      reviewNotesSnapshot: docData.followUpReview?.revisaoPeriodica || ''
    }

    const updatedSkills = rows.map((row: any) => {
      const prevStatus = normalizePdiSkillStatus(row.status)
      const wasScheduledFor2ndSem = (row.workDoneOrAdaptedSkill || '')
        .toLowerCase()
        .includes('segundo semestre')
      return {
        ...row,
        previousSemesterStatus: prevStatus,
        previousSemesterPeriod: currentPeriod,
        status: wasScheduledFor2ndSem && prevStatus === 'Não' ? 'Em desenvolvimento' : prevStatus,
        workDoneOrAdaptedSkill: wasScheduledFor2ndSem
          ? `Em foco neste semestre (Era "${prevStatus}" no ${currentPeriod})`
          : row.workDoneOrAdaptedSkill
      }
    })

    setDocData(prev => ({
      ...prev,
      identification: {
        ...(prev.identification || {}),
        validityPeriod: nextPeriod,
        nextReviewDate: nextReview
      },
      studentInfo: {
        ...(prev.studentInfo || {}),
        validityPeriod: nextPeriod,
        nextReviewDate: nextReview
      },
      skillsMatrix: updatedSkills,
      semesterHistory: [snapshot, ...(prev.semesterHistory || [])],
      followUpReview: {
        revisaoPeriodica: prev.followUpReview?.revisaoPeriodica || CANONICAL_PDI_REVIEW_TEXT,
        parecerProximoSemestre: `Acompanhamento de ${nextPeriod} (Transição de ${currentPeriod}): Avalie na Seção 4 se as habilidades anteriormente "Em desenvolvimento" (${snapshot.summaryStats.developing}) ou "Não" (${snapshot.summaryStats.notMastered}) já foram superadas ("Sim").`
      }
    }))

    toast.success(
      `Ciclo virado para ${nextPeriod}! O histórico de ${currentPeriod} foi salvo e as habilidades estão prontas para avaliação do novo semestre.`
    )
  }

  const handleSave = async () => {
    setIsSyncingCloud(true)
    try {
      onSave(docData)
      if (documentType === 'pdi') {
        await syncPdiToSupabase()
      } else if (documentType === 'pei') {
        await syncPeiToSupabase()
      }
      toast.success(`${schema.title} salvo localmente e sincronizado com o Supabase!`)
      onClose()
    } finally {
      setIsSyncingCloud(false)
    }
  }

  const handleExportWord = () => {
    exportDocumentToWord({
      type: documentType,
      title: schema.title,
      schoolName:
        docData.identification?.schoolName ||
        docData.schoolName ||
        docData.schoolInfo?.schoolName ||
        linkedSchoolName,
      studentName:
        docData.identification?.studentName ||
        docData.studentName ||
        docData.studentInfo?.studentName ||
        linkedStudentName,
      data: docData
    })
    toast.success('Documento Word (.doc) exportado com sucesso!')
  }

  const handleExportPdf = () => {
    exportDocumentToPdf({
      type: documentType,
      title: schema.title,
      schoolName:
        docData.identification?.schoolName ||
        docData.schoolName ||
        docData.schoolInfo?.schoolName ||
        linkedSchoolName,
      studentName:
        docData.identification?.studentName ||
        docData.studentName ||
        docData.studentInfo?.studentName ||
        linkedStudentName,
      data: docData
    })
  }

  const ident = docData.identification || docData.studentInfo || {}
  const activeStudentDisplay =
    ident.studentName || linkedStudentName || docData.studentName || 'Estudante'
  const activePeriodDisplay = ident.validityPeriod || '1º semestre / 2026'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28, 18, 10, 0.72)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
        fontFamily: FONT.sans
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: '#fdf8f2',
          width: '100%',
          maxWidth: 1080,
          height: '92vh',
          maxHeight: '92vh',
          borderRadius: RADIUS.xl,
          boxShadow: '0 24px 64px rgba(28, 18, 10, 0.38)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #dcd7cb'
        }}
      >
        {/* ─── HEADER EDITORIAL DO MODAL (flexShrink: 0) ─── */}
        <div
          style={{
            flexShrink: 0,
            padding: '18px 24px',
            background: '#2c1a0e',
            color: '#fdf8f2',
            borderBottom: '2px solid #8b5e3c',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 1.1,
                    color: '#e6c9a8',
                    background: 'rgba(139, 94, 60, 0.35)',
                    padding: '3px 9px',
                    borderRadius: 6,
                    border: '1px solid rgba(230, 201, 168, 0.3)'
                  }}
                >
                  {documentType.toUpperCase()} &bull; DOCUMENTO PEDAGÓGICO OFICIAL
                </span>
                <span
                  style={{
                    background: 'rgba(253, 248, 242, 0.12)',
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#fdf8f2'
                  }}
                >
                  👤 {activeStudentDisplay}
                </span>
                {documentType === 'pdi' && (
                  <span
                    style={{
                      background: 'rgba(139, 94, 60, 0.45)',
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fde68a'
                    }}
                  >
                    📅 Vigência: {activePeriodDisplay}
                  </span>
                )}
              </div>

              <h2
                style={{
                  fontFamily: FONT.serif,
                  fontSize: 21,
                  fontWeight: 700,
                  margin: 0,
                  color: '#fdf8f2',
                  letterSpacing: -0.3
                }}
              >
                {schema.title}
              </h2>
              {ident.curricularComponent && (
                <div style={{ fontSize: 12.5, color: '#d6c7b2', marginTop: 2 }}>
                  Componente curricular: <strong>{ident.curricularComponent}</strong>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 8,
                color: '#fdf8f2',
                width: 34,
                height: 34,
                fontSize: 20,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
              title="Fechar editor"
            >
              &times;
            </button>
          </div>

          {/* Barra de Progresso + Controles de Visualização e Transição Semestral */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              background: 'rgba(0,0,0,0.25)',
              padding: '8px 14px',
              borderRadius: RADIUS.md,
              border: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e6c9a8', whiteSpace: 'nowrap' }}>
                Preenchimento: {filledCount}/{totalBoxes} seções ({progressPct}%)
              </span>
              <div
                style={{
                  flex: 1,
                  maxWidth: 180,
                  height: 6,
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 4,
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: '#d97706',
                    borderRadius: 4,
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Alternador Editor vs Folha A4 Oficial */}
              <div
                style={{
                  display: 'inline-flex',
                  background: 'rgba(255,255,255,0.1)',
                  padding: 2,
                  borderRadius: 8
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('editor')}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 6,
                    border: 'none',
                    background: viewMode === 'editor' ? '#fdf8f2' : 'transparent',
                    color: viewMode === 'editor' ? '#2c1a0e' : '#fdf8f2',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ✏️ Editor por Seções
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 6,
                    border: 'none',
                    background: viewMode === 'preview' ? '#fdf8f2' : 'transparent',
                    color: viewMode === 'preview' ? '#2c1a0e' : '#fdf8f2',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📄 Visualizar Documento Oficial
                </button>
              </div>

              {viewMode === 'editor' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleExpandCollapseAll(false)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'transparent',
                      color: '#fdf8f2',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Expandir Tudo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExpandCollapseAll(true)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'transparent',
                      color: '#fdf8f2',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Recolher Tudo
                  </button>
                </>
              )}

              {documentType === 'pdi' && (
                <button
                  type="button"
                  onClick={handleAdvanceSemesterInModal}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid #fde68a',
                    background: '#8b5e3c',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Arquiva o semestre atual e abre o próximo semestre para avaliar se o aluno concluiu as competências em desenvolvimento"
                >
                  🔄 Virar para Próximo Semestre
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── CORPO PRINCIPAL (flex: 1, minHeight: 0, overflowY: 'auto') ─── */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: 24,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            background: '#fdf8f2'
          }}
        >
          {/* Banner de Histórico de Semestres Anteriores (quando houver) */}
          {documentType === 'pdi' &&
            Array.isArray(docData.semesterHistory) &&
            docData.semesterHistory.length > 0 && (
              <div
                style={{
                  flexShrink: 0,
                  padding: '14px 18px',
                  background: '#f5efe6',
                  border: '1px solid #dcd7cb',
                  borderLeft: '4px solid #8b5e3c',
                  borderRadius: RADIUS.md,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>
                  📊 Acompanhamento Longitudinal Entre Semestres ({docData.semesterHistory.length}{' '}
                  ciclo(s) anterior(es) arquivado(s))
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {docData.semesterHistory.map((snap: any) => (
                    <div
                      key={snap.id}
                      style={{
                        padding: '6px 12px',
                        background: '#fff',
                        border: '1px solid #e2d9c8',
                        borderRadius: 6,
                        fontSize: 11.5,
                        color: '#2c1a0e'
                      }}
                    >
                      <strong>{snap.period}:</strong> {snap.summaryStats?.mastered || 0} Superadas (Sim) &bull;{' '}
                      {snap.summaryStats?.developing || 0} Em desenvolvimento &bull;{' '}
                      {snap.summaryStats?.notMastered || 0} Não trabalhadas/superadas
                    </div>
                  ))}
                </div>
              </div>
            )}

          {viewMode === 'preview' ? (
            /* ─── VISUALIZAÇÃO FIEL DO DOCUMENTO OFICIAL (ESTILO FOLHA A4) ─── */
            <div
              style={{
                flexShrink: 0,
                background: '#ffffff',
                border: '1px solid #dcd7cb',
                borderRadius: RADIUS.lg,
                padding: '36px 44px',
                boxShadow: '0 8px 24px rgba(44, 26, 14, 0.08)',
                color: '#2c1a0e',
                maxWidth: 880,
                margin: '0 auto',
                width: '100%'
              }}
            >
              <div style={{ textAlign: 'center', borderBottom: '2px solid #2c1a0e', paddingBottom: 14, marginBottom: 20 }}>
                <h1 style={{ fontFamily: FONT.serif, fontSize: 19, fontWeight: 800, margin: 0, color: '#2c1a0e' }}>
                  PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI)
                </h1>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#5a3e28', marginTop: 4 }}>
                  Componente curricular: {ident.curricularComponent || `Língua Inglesa — ${ident.gradeCycle || '6º ano do Ensino Fundamental'}`}
                </div>
              </div>

              {/* 1. Identificação */}
              <h3 style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 800, borderBottom: '1px solid #dcd7cb', paddingBottom: 4, marginTop: 18 }}>
                1. Identificação
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 18 }}>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700, width: '22%' }}>Aluno(a):</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', width: '28%' }}>{ident.studentName || activeStudentDisplay}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700, width: '22%' }}>Ano/turma:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', width: '28%' }}>{ident.gradeCycle || '6º ano do Ensino Fundamental'}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Turno:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.shift || 'Matutino'}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Data de nascimento:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.birthDate || ''}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Data de elaboração:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.creationDate || '10/07/2026'}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Professor(a) regente:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.regentTeacher || 'Rafaela Franco Toldo'}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Equipe pedagógica envolvida:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.pedagogicalTeam || 'Marianna Panisset'}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Responsável(is) pelo(a) aluno(a):</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.guardians || ''}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Período de vigência:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.validityPeriod || '1º semestre / 2026'}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px', background: '#f8fafc', fontWeight: 700 }}>Próxima revisão:</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '7px 10px' }}>{ident.nextReviewDate || 'Dezembro / 2026'}</td>
                  </tr>
                </tbody>
              </table>

              {/* 2. Objetivo geral do PDI */}
              <h3 style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 800, borderBottom: '1px solid #dcd7cb', paddingBottom: 4, marginTop: 18 }}>
                2. Objetivo geral do PDI
              </h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                {docData.generalObjective?.objetivoGeral || CANONICAL_PDI_OBJECTIVE_TEXT}
              </p>

              {/* 3. Estratégias pedagógicas e recursos de apoio */}
              <h3 style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 800, borderBottom: '1px solid #dcd7cb', paddingBottom: 4, marginTop: 18 }}>
                3. Estratégias pedagógicas e recursos de apoio
              </h3>
              <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, marginBottom: 18 }}>
                {(docData.interventionPlan || [])
                  .filter((s: any) => s.isActive !== false)
                  .map((s: any) => (
                    <li key={s.id} style={{ marginBottom: 4 }}>
                      {s.description}
                    </li>
                  ))}
              </ul>

              {/* 4. Habilidades esperadas — BNCC */}
              <h3 style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 800, borderBottom: '1px solid #dcd7cb', paddingBottom: 4, marginTop: 18 }}>
                4. Habilidades esperadas — BNCC ({ident.curricularComponent || 'Língua Inglesa'})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
                <thead>
                  <tr style={{ background: '#f5efe6' }}>
                    <th style={{ border: '1px solid #cbd5e1', padding: '7px 9px', textAlign: 'left', width: 90 }}>Código</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '7px 9px', textAlign: 'left' }}>Habilidade (BNCC – Língua Inglesa)</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '7px 9px', textAlign: 'left', width: 135 }}>Superada?</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '7px 9px', textAlign: 'left', width: 200 }}>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {(docData.skillsMatrix || []).map((sk: any) => {
                    const st = normalizePdiSkillStatus(sk.status)
                    return (
                      <tr key={sk.id}>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 9px', fontWeight: 700 }}>{sk.skillCode}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 9px' }}>{sk.skillDescription}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 9px', fontWeight: 700 }}>{st}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 9px' }}>{sk.workDoneOrAdaptedSkill || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* 5. Observações gerais e evolução do aluno */}
              <h3 style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 800, borderBottom: '1px solid #dcd7cb', paddingBottom: 4, marginTop: 18 }}>
                5. Observações gerais e evolução do aluno
              </h3>
              <div style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-line', marginBottom: 18 }}>
                {docData.generalObservations?.evolucaoGeral || ''}
              </div>

              {/* 6. Acompanhamento e revisão */}
              <h3 style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 800, borderBottom: '1px solid #dcd7cb', paddingBottom: 4, marginTop: 18 }}>
                6. Acompanhamento e revisão
              </h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                {docData.followUpReview?.revisaoPeriodica || CANONICAL_PDI_REVIEW_TEXT}
              </p>
              {docData.followUpReview?.parecerProximoSemestre && (
                <p style={{ fontSize: 12.5, lineHeight: 1.55, background: '#fdf8f2', padding: 10, border: '1px solid #ede8dc', borderRadius: 6 }}>
                  <strong>Avaliação de Transição Semestral:</strong> {docData.followUpReview.parecerProximoSemestre}
                </p>
              )}

              {/* 7. Assinaturas */}
              <h3 style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 800, borderBottom: '1px solid #dcd7cb', paddingBottom: 4, marginTop: 18 }}>
                7. Assinaturas
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 10 }}>
                <tbody>
                  <tr>
                    {(docData.signatures || []).slice(0, 2).map((sig: any, idx: number) => (
                      <td key={idx} style={{ border: '1px solid #cbd5e1', padding: '18px 14px', width: '50%', verticalAlign: 'bottom' }}>
                        <div style={{ fontWeight: 700, marginBottom: 16 }}>{sig.role}:</div>
                        <div style={{ borderBottom: '1px solid #2c1a0e', marginBottom: 4, minHeight: 20 }}>{sig.name}</div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    {(docData.signatures || []).slice(2, 4).map((sig: any, idx: number) => (
                      <td key={idx} style={{ border: '1px solid #cbd5e1', padding: '18px 14px', width: '50%', verticalAlign: 'bottom' }}>
                        <div style={{ fontWeight: 700, marginBottom: 16 }}>{sig.role}:</div>
                        <div style={{ borderBottom: '1px solid #2c1a0e', marginBottom: 4, minHeight: 20 }}>{sig.name}</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            /* ─── MODO EDITOR ESTRUTURADO (SEM ESMAGAMENTO FLEXBOX) ─── */
            schema.boxes.map((box, bIdx) => {
              const isCollapsed = Boolean(collapsedBoxes[box.id])
              const status = boxStatus[box.id] || { isFilled: false, label: 'Pendente' }
              const boxData = getBoxContainerData(box)

              return (
                <div
                  key={box.id}
                  style={{
                    flexShrink: 0, // IMPEDE O ESMAGAMENTO / SOBREPOSIÇÃO DOS CARDS NO FLEX COLUMN
                    background: '#ffffff',
                    border: `1px solid ${status.isFilled ? '#dcd7cb' : '#e6c9a8'}`,
                    borderRadius: RADIUS.lg,
                    boxShadow: SHADOW.flat,
                    transition: 'border-color 0.2s'
                  }}
                >
                  {/* Cabeçalho do Box */}
                  <div
                    onClick={() => toggleCollapse(box.id)}
                    style={{
                      padding: '14px 20px',
                      background: isCollapsed ? '#faf6f0' : '#f5efe6',
                      borderBottom: isCollapsed ? 'none' : '1px solid #e2d9c8',
                      borderRadius: isCollapsed ? RADIUS.lg : `${RADIUS.lg}px ${RADIUS.lg}px 0 0`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          background: status.isFilled ? '#2c1a0e' : '#fdf8f2',
                          color: status.isFilled ? '#fdf8f2' : '#8b5e3c',
                          border: '1.5px solid #8b5e3c',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                          flexShrink: 0
                        }}
                      >
                        {status.isFilled ? '✓' : bIdx + 1}
                      </div>

                      <div>
                        <div
                          style={{
                            fontFamily: FONT.serif,
                            fontSize: 15,
                            fontWeight: 700,
                            color: COLOR.paperInk
                          }}
                        >
                          {box.title}
                        </div>
                        {box.description && (
                          <div style={{ fontSize: 12, color: COLOR.paperMid, marginTop: 2 }}>
                            {box.description}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 12,
                          background: status.isFilled ? '#ecfdf5' : '#fef3c7',
                          color: status.isFilled ? '#166534' : '#92400e',
                          border: `1px solid ${status.isFilled ? '#bbf7d0' : '#fde68a'}`
                        }}
                      >
                        {status.label}
                      </span>

                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: '#7a5c42',
                          padding: '2px 6px'
                        }}
                      >
                        {isCollapsed ? '▼ Abrir' : '▲ Recolher'}
                      </span>
                    </div>
                  </div>

                  {/* Conteúdo do Box (quando expandido) */}
                  {!isCollapsed && (
                    <div style={{ padding: 20 }}>
                      {box.boxType === 'header_fields' && (
                        <HeaderFieldsBox
                          schema={box}
                          data={boxData}
                          onChange={(fKey, val) =>
                            handleUpdateBoxData(box.id, box.boxType, fKey, val)
                          }
                        />
                      )}

                      {box.boxType === 'checklist_conditional' && (
                        <ChecklistConditionalBox
                          schema={box}
                          data={docData.clinicalReport || docData}
                          onChange={(fKey, val) =>
                            handleUpdateBoxData(box.id, box.boxType, fKey, val)
                          }
                        />
                      )}

                      {box.boxType === 'rich_narrative' && (
                        <RichNarrativeBox
                          schema={box}
                          data={boxData}
                          onChange={(sKey, val) =>
                            handleUpdateBoxData(box.id, box.boxType, sKey, val)
                          }
                          studentId={linkedStudentId || docData.studentId}
                          studentName={activeStudentDisplay}
                        />
                      )}

                      {box.boxType === 'skills_matrix_table' && (
                        <SkillsMatrixTableBox
                          schema={box}
                          data={
                            docData.skillsMatrix ||
                            docData.flexibilizacaoCurricular ||
                            docData.targetSkills ||
                            docData[box.id] ||
                            []
                          }
                          onChange={rows => handleUpdateBoxData(box.id, box.boxType, rows)}
                        />
                      )}

                      {box.boxType === 'goal_tracker' && (
                        <GoalTrackerBox
                          schema={box}
                          data={docData.goals || docData[box.id] || []}
                          onChange={goals => handleUpdateBoxData(box.id, box.boxType, goals)}
                        />
                      )}

                      {box.boxType === 'strategy_list' && (
                        <StrategyListBox
                          schema={box}
                          data={
                            docData.accommodations ||
                            docData.interventionPlan ||
                            docData.teamRoles ||
                            docData[box.id] ||
                            []
                          }
                          onChange={items => handleUpdateBoxData(box.id, box.boxType, items)}
                        />
                      )}

                      {box.boxType === 'signature_block' && (
                        <SignatureBlockBox
                          schema={box}
                          data={docData.signatures || docData[box.id] || []}
                          onChange={sigs => handleUpdateBoxData(box.id, box.boxType, sigs)}
                        />
                      )}

                      {box.boxType === 'milestone_tracker' && (
                        <MilestoneTrackerBox
                          schema={box}
                          data={docData.milestones || docData[box.id] || []}
                          onChange={m => handleUpdateBoxData(box.id, box.boxType, m)}
                        />
                      )}

                      {box.boxType === 'rubric_builder' && (
                        <RubricBuilderBox
                          schema={box}
                          data={docData.rubric || docData[box.id] || []}
                          onChange={r => handleUpdateBoxData(box.id, box.boxType, r)}
                        />
                      )}

                      {box.boxType === 'progress_log' && (
                        <ProgressLogBox
                          schema={box}
                          data={docData.progressLogs || docData[box.id] || []}
                          onChange={l => handleUpdateBoxData(box.id, box.boxType, l)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ─── FOOTER EDITORIAL: EXPORTAÇÃO & SALVAMENTO SUPABASE (flexShrink: 0) ─── */}
        <div
          style={{
            flexShrink: 0,
            padding: '14px 24px',
            background: '#f5efe6',
            borderTop: '1px solid #dcd7cb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleExportWord}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                background: '#fff',
                color: '#2c1a0e',
                border: '1px solid #8b5e3c',
                borderRadius: RADIUS.md,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📝 Exportar Word (.doc)
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                background: '#fff',
                color: '#2c1a0e',
                border: '1px solid #8b5e3c',
                borderRadius: RADIUS.md,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                background: '#fff',
                border: '1px solid #dcd7cb',
                borderRadius: RADIUS.md,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                color: COLOR.paperInk
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSyncingCloud}
              style={{
                padding: '9px 22px',
                background: '#2c1a0e',
                color: '#fdf8f2',
                border: '1px solid #8b5e3c',
                borderRadius: RADIUS.md,
                fontWeight: 700,
                fontSize: 13,
                cursor: isSyncingCloud ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(44, 26, 14, 0.2)'
              }}
            >
              ☁️ {isSyncingCloud ? 'Salvando no Supabase...' : 'Salvar Documento (Local + Supabase)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
