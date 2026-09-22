'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast } from '@/components/Toast'
import { normalizeDateToKey } from '@/lib/calendarPlanBridge'

export interface LessonPlanDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  plan: any | null
  onEditInStudio?: (plan: any) => void
}

export default function LessonPlanDocumentModal({
  isOpen,
  onClose,
  plan,
  onEditInStudio
}: LessonPlanDocumentModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen || !plan) return null

  const topic = plan.topic || plan.title || 'Plano de Aula'
  const className = plan.className || plan.classRef || 'Turma Geral'
  const dateFormatted = (() => {
    if (!plan.date) return 'Data não definida'
    const key = normalizeDateToKey(plan.date)
    if (!key) return String(plan.date)
    const [y, m, d] = key.split('-')
    return `${d}/${m}/${y}`
  })()
  const duration = plan.targetDurationMinutes || plan.durationMinutes || 50
  const room = plan.roomSpace || 'Sala de Aula'
  const methodology = plan.methodology || 'TBLT / Comunicativa'
  const coverageArea = plan.subjectCoverageArea || plan.subject || 'Língua Inglesa'
  const shortDesc = plan.shortDescription || plan.description || ''
  const materials: string[] = Array.isArray(plan.materials) ? plan.materials : []
  const skills: any[] = Array.isArray(plan.selectedSkills) ? plan.selectedSkills : []
  const stages: any[] = Array.isArray(plan.stages) ? plan.stages : []
  const speechBalance = plan.speechBalance || { teacherPercent: 30, studentPercent: 60, silencePercent: 10 }

  const handleEdit = () => {
    if (onEditInStudio) {
      onEditInStudio(plan)
      onClose()
      return
    }
    // Fallback padrão de navegação para o LessonStudio
    localStorage.setItem(
      'teacher_lesson_studio_prefill',
      JSON.stringify({
        planId: plan.id,
        className,
        topic,
        date: plan.date
      })
    )
    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lesson-studio' }))
    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
    onClose()
  }

  const handleCopyMarkdown = () => {
    let md = `# Plano de Aula: ${topic}\n`
    md += `**Turma:** ${className} | **Data:** ${dateFormatted} | **Duração:** ${duration} min | **Local:** ${room}\n\n`
    if (shortDesc) md += `### Resumo da Aula\n${shortDesc}\n\n`
    if (plan.generalObjective) md += `### Objetivo Geral\n${plan.generalObjective}\n\n`
    if (plan.specificObjectives) md += `### Objetivos Específicos\n${plan.specificObjectives}\n\n`
    if (skills.length > 0) {
      md += `### Habilidades BNCC\n`
      skills.forEach(s => {
        md += `- **${s.code || s}**: ${s.desc || ''}\n`
      })
      md += `\n`
    }
    if (materials.length > 0) {
      md += `### Materiais Necessários\n`
      materials.forEach(m => {
        md += `- ${m}\n`
      })
      md += `\n`
    }
    if (stages.length > 0) {
      md += `### Roteiro por Etapas\n`
      stages.forEach((st, i) => {
        md += `${i + 1}. **${st.name || `Etapa ${i + 1}`}** (${st.durationMin || 10} min)\n`
        md += `   - **Ação do Professor:** ${st.teacherAction || '-'}\n`
        md += `   - **Ação dos Alunos:** ${st.studentAction || '-'}\n`
      })
      md += `\n`
    }
    if (plan.homework) md += `### Tarefa de Casa\n${plan.homework}\n\n`
    if (plan.assessmentEvidence) md += `### Evidências de Avaliação\n${plan.assessmentEvidence}\n\n`

    navigator.clipboard.writeText(md).then(() => {
      setCopied(true)
      toast.success('Documento copiado com sucesso em formato texto!')
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(44, 26, 14, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fffcf8',
          border: '1.5px solid #d5c0b0',
          borderRadius: 22,
          maxWidth: 880,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(44, 26, 14, 0.25)',
          overflow: 'hidden',
          animation: 'fadeInScale 0.2s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header do Box */}
        <div
          style={{
            padding: '18px 24px',
            background: '#faf6f0',
            borderBottom: '1px solid #ede8dc',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span
                style={{
                  background: '#8b5e3c',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 10.5,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                📚 Documento do Planejamento de Aula
              </span>
              <span style={{ fontSize: 12, color: '#8b5e3c', fontWeight: 700 }}>
                {className}
              </span>
              <span style={{ color: '#d5c0b0' }}>•</span>
              <span style={{ fontSize: 12, color: '#665c54', fontWeight: 600 }}>
                📅 {dateFormatted}
              </span>
              <span style={{ color: '#d5c0b0' }}>•</span>
              <span style={{ fontSize: 12, color: '#665c54', fontWeight: 600 }}>
                ⏱️ {duration} min
              </span>
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: '#2c1a0e',
                fontFamily: FONT.serif
              }}
            >
              {topic}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f0e6dc',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#5c4838',
              fontSize: 16,
              fontWeight: 700,
              transition: 'all 0.15s'
            }}
            title="Fechar Box"
          >
            ✕
          </button>
        </div>

        {/* Toolbar de Ações Rápidas */}
        <div
          style={{
            padding: '10px 24px',
            background: '#fff',
            borderBottom: '1px solid #ede8dc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7a6552' }}>
            <i className="ti ti-map-pin" style={{ color: '#8b5e3c' }} />
            <span>Local: <strong>{room}</strong></span>
            <span style={{ margin: '0 4px', color: '#d5c0b0' }}>|</span>
            <span>Área: <strong>{coverageArea}</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleCopyMarkdown}
              style={{
                background: '#faf6f0',
                border: '1px solid #d5c8bb',
                borderRadius: RADIUS.md,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: '#5c4838',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <i className={copied ? 'ti ti-check' : 'ti ti-copy'} style={{ color: copied ? '#16a34a' : '#8b5e3c' }} />
              {copied ? 'Copiado!' : 'Copiar Texto'}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#faf6f0',
                border: '1px solid #d5c8bb',
                borderRadius: RADIUS.md,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: '#5c4838',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <i className="ti ti-printer" style={{ color: '#8b5e3c' }} />
              Imprimir
            </button>

            <button
              type="button"
              onClick={handleEdit}
              style={{
                background: '#8b5e3c',
                border: 'none',
                borderRadius: RADIUS.md,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(139, 94, 60, 0.25)'
              }}
            >
              <i className="ti ti-edit" />
              Editar no LessonStudio ➔
            </button>
          </div>
        </div>

        {/* Corpo do Documento (Scrollável) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {/* Banner caso o plano tenha sido sintetizado a partir de tarefa de calendário */}
          {plan.isSynthesizedFromTask && (
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: RADIUS.md,
                padding: '10px 16px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>💡</span>
                <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.4 }}>
                  Esta aula está agendada no seu calendário. O roteiro detalhado foi pré-estruturado com parâmetros pedagógicos recomendados e está pronto para personalização.
                </span>
              </div>
              <button
                type="button"
                onClick={handleEdit}
                style={{
                  background: '#b58900',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Abrir Estúdio
              </button>
            </div>
          )}

          {/* Folha do Documento */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.lg,
              padding: '24px 28px',
              boxShadow: '0 2px 10px rgba(44, 26, 14, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 22
            }}
          >
            {/* 1. Contexto & Descrição */}
            {shortDesc && (
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  📝 Resumo / Descrição Curta
                </h4>
                <p style={{ margin: 0, fontSize: 13.5, color: '#332b24', lineHeight: 1.5, background: '#fdfaf6', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #f5efe6' }}>
                  {shortDesc}
                </p>
              </div>
            )}

            {/* 2. Objetivos de Aprendizagem */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🎯 Objetivos de Aprendizagem
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div style={{ background: '#fdfaf6', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #f5efe6' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#7a6552', display: 'block', marginBottom: 4 }}>
                    Objetivo Geral:
                  </span>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#332b24', lineHeight: 1.4 }}>
                    {plan.generalObjective || `Compreensão, retenção e aplicação prática de ${topic}.`}
                  </p>
                </div>
                {plan.specificObjectives && (
                  <div style={{ background: '#fdfaf6', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #f5efe6' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#7a6552', display: 'block', marginBottom: 4 }}>
                      Objetivos Específicos:
                    </span>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#332b24', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                      {plan.specificObjectives}
                    </p>
                  </div>
                )}
                {plan.socioemotionalObjectives && (
                  <div style={{ background: '#fdfaf6', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #f5efe6' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#7a6552', display: 'block', marginBottom: 4 }}>
                      Competências Socioemocionais:
                    </span>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#332b24', lineHeight: 1.4 }}>
                      {plan.socioemotionalObjectives}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Habilidades da BNCC */}
            {skills.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  🏛️ Habilidades da BNCC Vinculadas
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {skills.map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: RADIUS.md,
                        padding: '8px 12px'
                      }}
                    >
                      <span
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 800
                        }}
                      >
                        {s.code || s}
                      </span>
                      <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>
                        {s.desc || 'Habilidade curricular associada ao plano de aula.'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Materiais Necessários & Equilíbrio de Fala */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Materiais */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  📦 Materiais Necessários
                </h4>
                {materials.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {materials.map((mat, i) => (
                      <span
                        key={i}
                        style={{
                          background: '#faf6f0',
                          border: '1px solid #d5c8bb',
                          borderRadius: RADIUS.md,
                          padding: '4px 10px',
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: '#5c4838'
                        }}
                      >
                        📌 {mat}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: '#a08060', fontStyle: 'italic' }}>
                    Nenhum material registrado.
                  </span>
                )}
              </div>

              {/* Equilíbrio de Fala (Talk Time Ratio) */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  🎙️ Equilíbrio de Fala (Talk Time Ratio)
                </h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ color: '#2563eb' }}>Prof: {speechBalance.teacherPercent || 30}%</span>
                  <span style={{ color: '#16a34a' }}>Alunos: {speechBalance.studentPercent || 60}%</span>
                  <span style={{ color: '#d97706' }}>Silêncio: {speechBalance.silencePercent || 10}%</span>
                </div>
                <div style={{ height: 12, borderRadius: RADIUS.full, overflow: 'hidden', display: 'flex', background: '#e2e8f0' }}>
                  <div style={{ width: `${speechBalance.teacherPercent || 30}%`, background: '#3b82f6' }} title={`Professor: ${speechBalance.teacherPercent}%`} />
                  <div style={{ width: `${speechBalance.studentPercent || 60}%`, background: '#22c55e' }} title={`Alunos: ${speechBalance.studentPercent}%`} />
                  <div style={{ width: `${speechBalance.silencePercent || 10}%`, background: '#f59e0b' }} title={`Silêncio / Autônomo: ${speechBalance.silencePercent}%`} />
                </div>
              </div>
            </div>

            {/* 5. Roteiro Passo a Passo por Etapas */}
            {stages.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ⏱️ Roteiro da Aula por Etapas ({stages.length} etapas • {duration} min)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {stages.map((stage, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#faf6f0',
                        border: '1px solid #ede8dc',
                        borderRadius: RADIUS.md,
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e' }}>
                          {idx + 1}. {stage.name || `Etapa ${idx + 1}`}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#ede8dc', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#5c4838' }}>
                            ⏱️ {stage.durationMin || 10} min
                          </span>
                          {stage.interactionType && (
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>
                              {stage.interactionType === 'pair' ? 'Duplas' : stage.interactionType === 'group' ? 'Grupos' : stage.interactionType === 'individual' ? 'Individual' : 'Grande Grupo'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, marginTop: 4 }}>
                        <div style={{ fontSize: 12, color: '#44382e', lineHeight: 1.4 }}>
                          <strong style={{ color: '#8b5e3c' }}>Ação do Professor:</strong> {stage.teacherAction || 'Conduz a atividade e orienta os alunos.'}
                        </div>
                        <div style={{ fontSize: 12, color: '#44382e', lineHeight: 1.4 }}>
                          <strong style={{ color: '#16a34a' }}>Ação dos Alunos:</strong> {stage.studentAction || 'Participam ativamente e praticam as estruturas.'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Avaliação & Tarefa de Casa */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {plan.assessmentEvidence && (
                <div style={{ background: '#fdfaf6', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #f5efe6' }}>
                  <h5 style={{ margin: '0 0 4px 0', fontSize: 11.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                    📊 Avaliação Formativa
                  </h5>
                  <p style={{ margin: 0, fontSize: 12, color: '#44382e', lineHeight: 1.4 }}>
                    {plan.assessmentEvidence}
                  </p>
                </div>
              )}
              {plan.homework && (
                <div style={{ background: '#fdfaf6', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #f5efe6' }}>
                  <h5 style={{ margin: '0 0 4px 0', fontSize: 11.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                    🏠 Tarefa de Casa (Homework)
                  </h5>
                  <p style={{ margin: 0, fontSize: 12, color: '#44382e', lineHeight: 1.4 }}>
                    {plan.homework}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer do Box */}
        <div
          style={{
            padding: '12px 24px',
            background: '#faf6f0',
            borderTop: '1px solid #ede8dc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 16px',
              borderRadius: RADIUS.md,
              border: '1px solid #d5c8bb',
              background: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              color: '#5c4838',
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleEdit}
            style={{
              padding: '7px 18px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: '#8b5e3c',
              fontSize: 12.5,
              fontWeight: 700,
              color: '#fff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti ti-edit" />
            Editar este Plano no LessonStudio ➔
          </button>
        </div>
      </div>
    </div>
  )
}
