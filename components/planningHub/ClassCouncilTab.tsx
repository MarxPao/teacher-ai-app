'use client'

import React, { useState, useMemo } from 'react'
import {
  generateClassCouncilReportAndBatchOpinions,
  saveClassCouncilReport,
  buildClassCouncilExportHtml,
  type ClassCouncilExecutiveReport,
  type StudentDescriptiveOpinionItem
} from '@/lib/classCouncilEngine'
import {
  getDocumentFormats,
  getDefaultFormatForSchool,
  type SchoolDocumentFormat
} from '@/lib/documentFormatTemplates'
import { exportToPdf, exportToWord } from '@/lib/exportUtils'
import { toast } from '@/components/Toast'
import { RADIUS, SHADOW } from '@/styles/tokens'

export default function ClassCouncilTab() {
  const [schoolName, setSchoolName] = useState<string>('Colégio Machado Sobrinho')
  const [teacherName, setTeacherName] = useState<string>('Rafaela Franco Toldo')
  const [subjectName, setSubjectName] = useState<string>('Língua Inglesa')
  const [classLabel, setClassLabel] = useState<string>('6º Ano')
  const [periodLabel, setPeriodLabel] = useState<string>('1º Trimestre / Bimestre')

  const [availableFormats] = useState<SchoolDocumentFormat[]>(() => getDocumentFormats())
  const [formatId, setFormatId] = useState<string>(() =>
    getDefaultFormatForSchool('Colégio Machado Sobrinho', 'general_document').id
  )

  const [report, setReport] = useState<ClassCouncilExecutiveReport>(() =>
    generateClassCouncilReportAndBatchOpinions({
      schoolName: 'Colégio Machado Sobrinho',
      teacherName: 'Rafaela Franco Toldo',
      subjectName: 'Língua Inglesa',
      classLabel: '6º Ano',
      periodLabel: '1º Trimestre / Bimestre'
    })
  )

  const [newStudentName, setNewStudentName] = useState<string>('')
  const [newStudentGrade, setNewStudentGrade] = useState<string>('7.5')

  const handleRegenerateBatch = () => {
    const next = generateClassCouncilReportAndBatchOpinions({
      schoolName,
      teacherName,
      subjectName,
      classLabel,
      periodLabel
    })
    setReport(next)
    toast.success(`Relatório Executivo e ${next.studentOpinions.length} Pareceres Descritivos gerados em lote!`)
  }

  const handleUpdateOpinionField = (
    studentId: string,
    patch: Partial<StudentDescriptiveOpinionItem>
  ) => {
    setReport(prev => {
      const updatedOpinions = prev.studentOpinions.map(op =>
        op.studentId === studentId ? { ...op, ...patch, updatedAt: new Date().toISOString() } : op
      )
      const total = updatedOpinions.length || 1
      const classAverageGrade = Number(
        (updatedOpinions.reduce((acc, s) => acc + s.averageGrade, 0) / total).toFixed(1)
      )
      const averageAttendancePercent = Math.round(
        updatedOpinions.reduce((acc, s) => acc + s.attendancePercent, 0) / total
      )
      const recoveryAlertCount = updatedOpinions.filter(s => s.averageGrade < 6.0).length
      const attendanceAlertCount = updatedOpinions.filter(s => s.attendancePercent < 75).length
      const next: ClassCouncilExecutiveReport = {
        ...prev,
        studentOpinions: updatedOpinions,
        metrics: {
          ...prev.metrics,
          totalStudents: updatedOpinions.length,
          classAverageGrade,
          averageAttendancePercent,
          recoveryAlertCount,
          attendanceAlertCount
        }
      }
      saveClassCouncilReport(next)
      return next
    })
  }

  const handleAddStudentToBatch = () => {
    if (!newStudentName.trim()) {
      toast.info('Informe o nome do(a) estudante para adicionar ao lote do Conselho de Classe.')
      return
    }
    const gradeVal = Math.max(0, Math.min(10, Number(newStudentGrade) || 7.0))
    const newOp: StudentDescriptiveOpinionItem = {
      studentId: `st_custom_${Date.now()}`,
      studentName: newStudentName.trim(),
      classLabel,
      averageGrade: gradeVal,
      attendancePercent: 95,
      hasActivePdiOrPei: false,
      statusBadge: gradeVal < 6.0 ? 'Recuperação Paralela' : 'Pleno Desenvolvimento',
      strengthsSummary: `Participação regular nas aulas de ${subjectName}.`,
      bnccProgressSummary: `Em consolidação das habilidades BNCC do ${periodLabel}.`,
      recommendationsNextPeriod:
        gradeVal < 6.0
          ? 'Encaminhar para Recuperação Paralela e estudo dirigido.'
          : 'Manter rotina de estudos e participação oral.',
      fullOpinionText: `${newStudentName.trim()} (${classLabel} — ${periodLabel}): Apresenta média ${gradeVal.toFixed(
        1
      )} em ${subjectName}. Consolidou os objetivos essenciais do período, recomendando-se continuidade da prática regular de leitura e vocabulário.`,
      updatedAt: new Date().toISOString()
    }
    setReport(prev => {
      const nextOpinions = [...prev.studentOpinions, newOp]
      const next: ClassCouncilExecutiveReport = {
        ...prev,
        studentOpinions: nextOpinions,
        metrics: {
          ...prev.metrics,
          totalStudents: nextOpinions.length
        }
      }
      saveClassCouncilReport(next)
      return next
    })
    setNewStudentName('')
    toast.success('Estudante adicionado ao lote de Pareceres do Conselho!')
  }

  const exportHtml = useMemo(() => buildClassCouncilExportHtml(report), [report])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, color: '#2c1a0e' }}>
      {/* Cabeçalho Editorial da Central de Conselho de Classe */}
      <div
        style={{
          background: '#ffffff',
          border: '1.5px solid #ede8dc',
          borderRadius: RADIUS.xl,
          padding: 22,
          boxShadow: SHADOW.sm,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.7 }}>
              CONSELHO DE CLASSE &bull; PARECERES DESCRITIVOS EM LOTE &bull; 100% LOCAL (TRILHO 1 LGPD)
            </div>
            <h2
              style={{
                margin: '4px 0 0 0',
                fontSize: 22,
                fontWeight: 800,
                fontFamily: 'Fraunces, Georgia, serif',
                color: '#2c1a0e'
              }}
            >
              📋 Central de Conselho de Classe & Pareceres Bimestrais
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#5c3a21' }}>
              Cruza automaticamente o <strong>Diário de Turma</strong>, as <strong>Habilidades BNCC da Sequência Didática</strong> e os{' '}
              <strong>PDIs/PEIs ativos</strong> (ex.: Carina Miranda de Oliveira) para gerar o Relatório Executivo da Turma e todos os Pareceres Individuais prontos para ata e boletim.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={formatId}
              onChange={e => setFormatId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: RADIUS.md,
                border: '1.5px solid #8b5e3c',
                background: '#fdf8f2',
                color: '#2c1a0e',
                fontSize: 12,
                fontWeight: 700
              }}
              title="Formato de Arquivo Oficial da Escola"
            >
              {availableFormats.map(fmt => (
                <option key={fmt.id} value={fmt.id}>
                  📐 {fmt.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() =>
                exportToPdf({
                  schoolName,
                  teacherName,
                  className: classLabel,
                  subjectName,
                  subtitle: periodLabel,
                  title: `ATA E PARECERES DO CONSELHO DE CLASSE — ${classLabel.toUpperCase()}`,
                  instructions: `Relatório Executivo da Turma e Pareceres Descritivos Individuais (${periodLabel}).`,
                  content: exportHtml,
                  showStudentNameBox: false,
                  formatId
                })
              }
              style={{
                padding: '9px 14px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: '#8b5e3c',
                color: '#ffffff',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              📄 Exportar Ata + Pareceres (PDF)
            </button>

            <button
              type="button"
              onClick={() =>
                exportToWord({
                  schoolName,
                  teacherName,
                  className: classLabel,
                  subjectName,
                  subtitle: periodLabel,
                  title: `ATA E PARECERES DO CONSELHO DE CLASSE — ${classLabel.toUpperCase()}`,
                  instructions: `Relatório Executivo da Turma e Pareceres Descritivos Individuais (${periodLabel}).`,
                  content: exportHtml,
                  showStudentNameBox: false,
                  formatId
                })
              }
              style={{
                padding: '9px 14px',
                borderRadius: RADIUS.md,
                border: '1.5px solid #8b5e3c',
                background: '#fffcf8',
                color: '#2c1a0e',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              📝 Exportar Word (.doc)
            </button>

            <button
              type="button"
              onClick={() => {
                saveClassCouncilReport(report)
                toast.success('Pareceres do Conselho de Classe salvos e sincronizados com o Supabase!')
              }}
              style={{
                padding: '9px 14px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: '#2c1a0e',
                color: '#fdf8f2',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              ☁️ Salvar no Supabase
            </button>
          </div>
        </div>

        {/* Filtros de Cabeçalho (Escola, Professor, Turma, Bimestre/Trimestre) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 10,
            background: '#fdf8f2',
            padding: 14,
            borderRadius: RADIUS.md,
            border: '1px solid #ede8dc'
          }}
        >
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              Instituição Escolar
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={e => setSchoolName(e.target.value)}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                fontSize: 12.5,
                color: '#2c1a0e',
                background: '#fff'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              Professor(a) Regente
            </label>
            <input
              type="text"
              value={teacherName}
              onChange={e => setTeacherName(e.target.value)}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                fontSize: 12.5,
                color: '#2c1a0e',
                background: '#fff'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              Turma / Série
            </label>
            <select
              value={classLabel}
              onChange={e => setClassLabel(e.target.value)}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                fontSize: 12.5,
                fontWeight: 700,
                color: '#2c1a0e',
                background: '#fff'
              }}
            >
              <option value="6º Ano">6º Ano Fundamental</option>
              <option value="7º Ano">7º Ano Fundamental</option>
              <option value="8º Ano">8º Ano Fundamental</option>
              <option value="9º Ano">9º Ano Fundamental</option>
              <option value="1ª Série EM">1ª Série Ensino Médio</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              Etapa / Período Letivo
            </label>
            <select
              value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                fontSize: 12.5,
                fontWeight: 700,
                color: '#2c1a0e',
                background: '#fff'
              }}
            >
              <option value="1º Trimestre / Bimestre">1º Trimestre / Bimestre</option>
              <option value="2º Trimestre / Bimestre">2º Trimestre / Bimestre</option>
              <option value="3º Trimestre / Bimestre">3º Trimestre / Bimestre</option>
              <option value="4º Bimestre / Fechamento Anual">4º Bimestre / Fechamento Anual</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={handleRegenerateBatch}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1.5px solid #8b5e3c',
                background: '#f5efe6',
                color: '#2c1a0e',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              🔄 Atualizar Cruzamento (PDI + BNCC)
            </button>
          </div>
        </div>
      </div>

      {/* Cards de Indicadores Executivos da Turma */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: 'Estudantes no Lote', value: `${report.metrics.totalStudents} alunos`, sub: classLabel },
          { label: 'Média Global da Turma', value: `${report.metrics.classAverageGrade.toFixed(1)} / 10,0`, sub: subjectName },
          { label: 'Assiduidade Média', value: `${report.metrics.averageAttendancePercent}%`, sub: 'Frequência no período' },
          { label: 'Inclusão PDI / PEI', value: `${report.metrics.pdiPeiCount} ativo(s)`, sub: 'Com parecer adaptado' },
          { label: 'Recuperação Paralela', value: `${report.metrics.recoveryAlertCount} aluno(s)`, sub: 'Média < 6,0' }
        ].map((card, idx) => (
          <div
            key={idx}
            style={{
              background: '#ffffff',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.lg,
              padding: '14px 16px',
              boxShadow: SHADOW.sm
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              {card.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#2c1a0e', marginTop: 4 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 11.5, color: '#7a5c42', marginTop: 2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Síntese Coletiva da Turma & Balanço BNCC */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #ede8dc',
          borderRadius: RADIUS.lg,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
          1. Relatório Executivo da Turma para Ata do Conselho de Classe
        </div>
        <textarea
          value={report.collectivePedagogicalSynthesis}
          onChange={e =>
            setReport(prev => {
              const next = { ...prev, collectivePedagogicalSynthesis: e.target.value }
              saveClassCouncilReport(next)
              return next
            })
          }
          rows={3}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: RADIUS.md,
            border: '1px solid #dcd7cb',
            background: '#fdf8f2',
            color: '#2c1a0e',
            fontSize: 13.5,
            lineHeight: 1.5,
            fontFamily: 'inherit'
          }}
        />
      </div>

      {/* Lista Editável de Pareceres Descritivos Individuais em Lote */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #ede8dc',
          borderRadius: RADIUS.lg,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              2. Pareceres Descritivos Individuais em Lote ({report.studentOpinions.length} estudantes)
            </div>
            <div style={{ fontSize: 12.5, color: '#5c3a21', marginTop: 2 }}>
              Edite livremente o parecer de qualquer aluno antes de exportar ou salvar no Supabase.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Novo aluno(a)..."
              value={newStudentName}
              onChange={e => setNewStudentName(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                fontSize: 12,
                color: '#2c1a0e'
              }}
            />
            <input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={newStudentGrade}
              onChange={e => setNewStudentGrade(e.target.value)}
              style={{
                width: 68,
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #dcd7cb',
                fontSize: 12,
                color: '#2c1a0e'
              }}
              title="Média do aluno"
            />
            <button
              type="button"
              onClick={handleAddStudentToBatch}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #8b5e3c',
                background: '#fdf8f2',
                color: '#2c1a0e',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              + Incluir Aluno
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {report.studentOpinions.map((op, index) => (
            <div
              key={op.studentId}
              style={{
                background: op.hasActivePdiOrPei ? '#fdf8f2' : '#ffffff',
                border: op.hasActivePdiOrPei ? '1.5px solid #8b5e3c' : '1px solid #dcd7cb',
                borderRadius: RADIUS.md,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      background: '#2c1a0e',
                      color: '#fdf8f2',
                      fontSize: 11.5,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6
                    }}
                  >
                    #{index + 1}
                  </span>
                  <strong style={{ fontSize: 15, color: '#2c1a0e' }}>{op.studentName}</strong>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 800,
                      background:
                        op.statusBadge === 'Acompanhamento PDI/PEI'
                          ? '#f5efe6'
                          : op.statusBadge === 'Recuperação Paralela' || op.statusBadge === 'Alerta de Frequência'
                          ? '#fef2f2'
                          : '#f0fdf4',
                      color:
                        op.statusBadge === 'Acompanhamento PDI/PEI'
                          ? '#8b5e3c'
                          : op.statusBadge === 'Recuperação Paralela' || op.statusBadge === 'Alerta de Frequência'
                          ? '#991b1b'
                          : '#166534'
                    }}
                  >
                    {op.statusBadge}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#5c3a21' }}>
                    Média:{' '}
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={op.averageGrade}
                      onChange={e =>
                        handleUpdateOpinionField(op.studentId, {
                          averageGrade: Math.max(0, Math.min(10, Number(e.target.value) || 0))
                        })
                      }
                      style={{
                        width: 60,
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid #dcd7cb',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#2c1a0e'
                      }}
                    />
                  </label>

                  <label style={{ fontSize: 12, fontWeight: 700, color: '#5c3a21' }}>
                    Frequência (%):{' '}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={op.attendancePercent}
                      onChange={e =>
                        handleUpdateOpinionField(op.studentId, {
                          attendancePercent: Math.max(0, Math.min(100, Number(e.target.value) || 0))
                        })
                      }
                      style={{
                        width: 60,
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid #dcd7cb',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#2c1a0e'
                      }}
                    />
                  </label>
                </div>
              </div>

              <textarea
                value={op.fullOpinionText}
                onChange={e => handleUpdateOpinionField(op.studentId, { fullOpinionText: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #dcd7cb',
                  background: '#ffffff',
                  color: '#2c1a0e',
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontFamily: 'inherit'
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
