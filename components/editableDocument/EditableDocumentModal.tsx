'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { COLOR, RADIUS, SHADOW } from '@/styles/tokens'
import { useModalA11y } from '@/hooks/useModalA11y'
import { toast } from '@/components/Toast'
import {
  DocumentType,
  DocumentSchema,
  BoxSchema,
  getSchemaForType
} from '@/lib/editableDocumentTypes'
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

  // Estado do documento unificado
  const [docData, setDocData] = useState<Record<string, any>>(() => initialData || {})
  const [collapsedBoxes, setCollapsedBoxes] = useState<Record<string, boolean>>({})

  // Carrega e hidrata dados iniciais
  useEffect(() => {
    if (isOpen) {
      const base = initialData ? { ...initialData } : {}

      // Auto-preenchimento de identificação
      if (linkedStudentName && !base.studentName) base.studentName = linkedStudentName
      if (linkedStudentId && !base.studentId) base.studentId = linkedStudentId
      if (linkedClassId && !base.classId) base.classId = linkedClassId
      if (linkedSchoolName && !base.schoolName) base.schoolName = linkedSchoolName

      // Preenchimento de subcampos de cabeçalho
      if (!base.schoolInfo) {
        base.schoolInfo = {
          schoolName: linkedSchoolName,
          city: 'Juiz de Fora - MG',
          directors: 'Coordenação Pedagógica / Direção',
          creationDate: new Date().toISOString().split('T')[0]
        }
      }
      if (!base.studentInfo && linkedStudentName) {
        base.studentInfo = {
          studentName: linkedStudentName,
          birthDate: '',
          gradeCycle: 'Ensino Fundamental II',
          fatherName: '',
          motherName: ''
        }
      }

      setDocData(base)
    }
  }, [isOpen, initialData, linkedStudentId, linkedStudentName, linkedClassId, linkedSchoolName])

  // Verificação de preenchimento por box
  const boxStatus = useMemo(() => {
    const status: Record<string, { isFilled: boolean; label: string }> = {}

    schema.boxes.forEach(box => {
      let isFilled = false

      switch (box.boxType) {
        case 'header_fields': {
          const fields = box.config?.fields || []
          const filledCount = fields.filter((f: any) => {
            const val = docData[f.key] ?? docData[box.id]?.[f.key]
            return val !== undefined && val !== ''
          }).length
          isFilled = filledCount >= Math.min(2, fields.length)
          break
        }
        case 'checklist_conditional': {
          isFilled = docData.hasClinicalDiagnosis !== undefined || docData.isConditionActive !== undefined || docData.clinicalReport !== undefined
          break
        }
        case 'rich_narrative': {
          const subs = box.config?.subsections || []
          const container = docData[box.id] || docData
          const filledSubs = subs.filter((s: any) => Boolean(container[s.key]?.trim()))
          isFilled = filledSubs.length > 0
          break
        }
        case 'skills_matrix_table': {
          const list = docData.skillsMatrix || docData.flexibilizacaoCurricular || docData.targetSkills || docData[box.id] || []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'goal_tracker': {
          const list = docData.goals || docData[box.id] || []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'strategy_list': {
          const list = docData.accommodations || docData.interventionPlan || docData.teamRoles || docData[box.id] || []
          isFilled = Array.isArray(list) && list.length > 0
          break
        }
        case 'signature_block': {
          const list = docData.signatures || docData[box.id] || []
          isFilled = Array.isArray(list) && list.some((s: any) => s.signed || Boolean(s.name?.trim()))
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
        label: isFilled ? 'Preenchido' : 'Pendente'
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

  const handleUpdateBoxData = (boxId: string, boxType: string, fieldOrValue: any, possibleValue?: any) => {
    setDocData(prev => {
      const next = { ...prev }

      if (boxType === 'header_fields') {
        const fieldKey = fieldOrValue
        const val = possibleValue
        next[fieldKey] = val
        if (!next[boxId]) next[boxId] = {}
        next[boxId][fieldKey] = val
      } else if (boxType === 'checklist_conditional') {
        const fieldKey = fieldOrValue
        const val = possibleValue
        next[fieldKey] = val
        if (!next.clinicalReport) next.clinicalReport = { hasClinicalDiagnosis: false }
        next.clinicalReport[fieldKey] = val
      } else if (boxType === 'rich_narrative') {
        const subKey = fieldOrValue
        const val = possibleValue
        if (!next[boxId]) next[boxId] = {}
        next[boxId][subKey] = val
        // Mapeamento direto de desenvolvimento para PDI
        if (boxId === 'avaliacao_inicial') {
          if (!next.developmentAssessment) next.developmentAssessment = {}
          next.developmentAssessment[subKey] = val
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

  const handleSave = () => {
    onSave(docData)
    toast.success(`${schema.title} salvo com sucesso!`)
    onClose()
  }

  const handleExportWord = () => {
    exportDocumentToWord({
      type: documentType,
      title: schema.title,
      schoolName: docData.schoolName || docData.schoolInfo?.schoolName || linkedSchoolName,
      studentName: docData.studentName || docData.studentInfo?.studentName || linkedStudentName,
      data: docData
    })
    toast.success('Documento Word (.doc) exportado com sucesso!')
  }

  const handleExportPdf = () => {
    exportDocumentToPdf({
      type: documentType,
      title: schema.title,
      schoolName: docData.schoolName || docData.schoolInfo?.schoolName || linkedSchoolName,
      studentName: docData.studentName || docData.studentInfo?.studentName || linkedStudentName,
      data: docData
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 20, 10, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: '#fdf8f2',
          width: '100%',
          maxWidth: 960,
          maxHeight: '92vh',
          borderRadius: RADIUS.xl,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #ede8dc'
        }}
      >
        {/* ─── HEADER DO MODAL ─── */}
        <div
          style={{
            padding: '18px 24px',
            background:
              documentType === 'pdi'
                ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                : documentType === 'pei'
                ? 'linear-gradient(135deg, #6d28d9, #4c1d95)'
                : 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.9 }}>
                  {documentType.toUpperCase()} &bull; DOCUMENTO OFICIAL
                </span>
                {(linkedStudentName || docData.studentName) && (
                  <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                    <i className="ti ti-user" /> {linkedStudentName || docData.studentName}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{schema.title}</h2>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                fontSize: 26,
                cursor: 'pointer',
                opacity: 0.85
              }}
              title="Fechar"
            >
              &times;
            </button>
          </div>

          {/* Barra de Progresso de Preenchimento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: RADIUS.md }}>
            <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
              Progresso do Documento: {filledCount} de {totalBoxes} seções ({progressPct}%)
            </span>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: '#a6e22e',
                  borderRadius: 3,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        </div>

        {/* ─── CORPO: LISTA ORDENADA DE BOXES ─── */}
        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {schema.boxes.map((box, bIdx) => {
            const isCollapsed = Boolean(collapsedBoxes[box.id])
            const status = boxStatus[box.id] || { isFilled: false, label: 'Pendente' }

            return (
              <div
                key={box.id}
                style={{
                  background: '#fff',
                  border: `1px solid ${status.isFilled ? '#e2ded5' : '#fed7aa'}`,
                  borderRadius: RADIUS.lg,
                  overflow: 'hidden',
                  boxShadow: SHADOW.flat,
                  transition: 'all 0.2s'
                }}
              >
                {/* Cabeçalho do Box */}
                <div
                  onClick={() => toggleCollapse(box.id)}
                  style={{
                    padding: '12px 18px',
                    background: isCollapsed ? '#faf7f2' : '#fcfbf8',
                    borderBottom: isCollapsed ? 'none' : '1px solid #ede8dc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        background: status.isFilled ? '#dcfce7' : '#fef3c7',
                        color: status.isFilled ? '#166534' : '#b45309',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 800
                      }}
                    >
                      {status.isFilled ? '✓' : bIdx + 1}
                    </div>

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.paperInk }}>
                        {box.title}
                      </div>
                      {box.description && (
                        <div style={{ fontSize: 11, color: COLOR.paperMid }}>
                          {box.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: status.isFilled ? '#dcfce7' : '#fff7ed',
                        color: status.isFilled ? '#166534' : '#c2410c'
                      }}
                    >
                      {status.label}
                    </span>

                    <i
                      className={`ti ti-chevron-${isCollapsed ? 'down' : 'up'}`}
                      style={{ color: '#94a3b8', fontSize: 16 }}
                    />
                  </div>
                </div>

                {/* Conteúdo do Box (quando expandido) */}
                {!isCollapsed && (
                  <div style={{ padding: 18 }}>
                    {box.boxType === 'header_fields' && (
                      <HeaderFieldsBox
                        schema={box}
                        data={docData[box.id] || docData}
                        onChange={(fKey, val) => handleUpdateBoxData(box.id, box.boxType, fKey, val)}
                      />
                    )}

                    {box.boxType === 'checklist_conditional' && (
                      <ChecklistConditionalBox
                        schema={box}
                        data={docData.clinicalReport || docData}
                        onChange={(fKey, val) => handleUpdateBoxData(box.id, box.boxType, fKey, val)}
                      />
                    )}

                    {box.boxType === 'rich_narrative' && (
                      <RichNarrativeBox
                        schema={box}
                        data={docData.developmentAssessment || docData[box.id] || docData}
                        onChange={(sKey, val) => handleUpdateBoxData(box.id, box.boxType, sKey, val)}
                        studentId={linkedStudentId || docData.studentId}
                        studentName={linkedStudentName || docData.studentName}
                      />
                    )}

                    {box.boxType === 'skills_matrix_table' && (
                      <SkillsMatrixTableBox
                        schema={box}
                        data={docData.skillsMatrix || docData.flexibilizacaoCurricular || docData.targetSkills || docData[box.id] || []}
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
                        data={docData.accommodations || docData.interventionPlan || docData.teamRoles || docData[box.id] || []}
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
          })}
        </div>

        {/* ─── FOOTER: AÇÕES DE SALVAR & EXPORTAÇÃO ─── */}
        <div
          style={{
            padding: '16px 24px',
            background: '#f5efe6',
            borderTop: '1px solid #ede8dc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleExportWord}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: RADIUS.md,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <i className="ti ti-file-text" /> Exportar DOCX
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: RADIUS.md,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <i className="ti ti-printer" /> Imprimir / PDF
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                background: '#fff',
                border: '1px solid #cbd5e1',
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
              style={{
                padding: '10px 24px',
                background: '#166534',
                color: '#fff',
                border: 'none',
                borderRadius: RADIUS.md,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className="ti ti-device-floppy" /> Salvar Documento
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
