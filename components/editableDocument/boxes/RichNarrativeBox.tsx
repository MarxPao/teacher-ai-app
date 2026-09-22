'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema } from '@/lib/editableDocumentTypes'
import { buildTeacherStyleSystemPrompt } from '@/lib/teacherStyleProfile'
import { getStudentMemory } from '@/lib/studentMemory'
import { toast } from '@/components/Toast'

interface SubsectionDef {
  key: string
  title: string
  placeholder?: string
}

interface Props {
  schema: BoxSchema
  data: Record<string, string>
  onChange: (fieldKey: string, value: string) => void
  studentId?: string
  studentName?: string
}

export default function RichNarrativeBox({ schema, data, onChange, studentId, studentName }: Props) {
  const subsections: SubsectionDef[] = schema.config?.subsections || []
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiDraftKeys, setAiDraftKeys] = useState<Record<string, boolean>>({})

  const handleGenerateAi = async () => {
    setIsGenerating(true)
    try {
      // 1. Puxa memória viva do aluno, se aplicável
      let memoryContext = ''
      if (studentId) {
        const mem = getStudentMemory(studentId)
        if (mem) {
          const obsTexts = mem.observations.slice(0, 8).map(o => `[${o.date}]: ${o.note}`).join('\n')
          memoryContext = `\nOBSERVAÇÕES HISTÓRICAS DO ALUNO (${studentName || mem.studentName}):\n${obsTexts || 'Sem observações prévias.'}`
          if (mem.summary) {
            memoryContext += `\nSÍNTESE PEDAGÓGICA PRÉVIA: ${mem.summary}`
          }
        }
      }

      const prompt = `Você é um assistente pedagógico especializado em Educação Inclusiva e Planejamento.
Elabore um rascunho cuidadoso, acolhedor e técnico para as seguintes seções do documento:
${subsections.map(s => `- ${s.title} (chave: ${s.key})`).join('\n')}

ESTUDANTE: ${studentName || 'Estudante em Acompanhamento'}
${memoryContext}

DIRETRIZ:
${schema.config?.aiAssistPrompt || 'Redija observações formativas e construtivas para cada subseção.'}

Responda ESTRITAMENTE em formato JSON com as chaves correspondentes:
{
  ${subsections.map(s => `"${s.key}": "Texto sugerido para ${s.title}..."`).join(',\n  ')}
}

${buildTeacherStyleSystemPrompt()}`

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })

      const d = await res.json()
      let rawText = typeof d?.reply === 'string' ? d.reply : (Array.isArray(d?.content) ? d.content.map((c: any) => c.text || '').join('\n') : d?.content || '')
      let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
      const sIdx = cleaned.indexOf('{')
      const eIdx = cleaned.lastIndexOf('}')

      if (sIdx !== -1 && eIdx !== -1) {
        const parsed = JSON.parse(cleaned.substring(sIdx, eIdx + 1))
        const newDrafts: Record<string, boolean> = {}

        subsections.forEach(s => {
          if (typeof parsed[s.key] === 'string' && parsed[s.key].trim()) {
            onChange(s.key, parsed[s.key].trim())
            newDrafts[s.key] = true
          }
        })
        setAiDraftKeys(prev => ({ ...prev, ...newDrafts }))
        toast.success('Rascunho gerado pela IA! Revise e ajuste o texto conforme necessário.')
      } else {
        toast.error('Não foi possível estruturar a resposta da IA. Tente novamente.')
      }
    } catch (e: any) {
      toast.error(`Erro ao gerar com IA: ${e.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const markReviewed = (key: string) => {
    if (aiDraftKeys[key]) {
      setAiDraftKeys(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Botão de Assistência de IA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, color: COLOR.paperMid }}>
          Preencha os campos abaixo ou solicite uma sugestão inicial da IA baseada nas observações do aluno.
        </span>
        <button
          type="button"
          onClick={handleGenerateAi}
          disabled={isGenerating}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: isGenerating ? '#e2e8f0' : 'linear-gradient(135deg, #6d28d9, #4c3a8e)',
            color: '#fff',
            border: 'none',
            borderRadius: RADIUS.md,
            fontSize: 12,
            fontWeight: 700,
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 6px rgba(109, 40, 217, 0.25)'
          }}
        >
          <i className={isGenerating ? 'ti ti-loader' : 'ti ti-sparkles'} />
          {isGenerating ? 'Gerando rascunho...' : 'Assistência de IA (Rascunho)'}
        </button>
      </div>

      {/* Subseções Narrativas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {subsections.map(sub => {
          const value = data[sub.key] || ''
          const isAiDraft = Boolean(aiDraftKeys[sub.key])

          return (
            <div
              key={sub.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 12,
                borderRadius: RADIUS.md,
                background: isAiDraft ? '#faf5ff' : '#fff',
                border: `1px solid ${isAiDraft ? '#c084fc' : '#ede8dc'}`,
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: isAiDraft ? '#6b21a8' : COLOR.paperInk }}>
                  {sub.title}
                </label>
                {isAiDraft && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: '#e9d5ff',
                      color: '#581c87',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <i className="ti ti-sparkles" /> Sugestão de IA (Pendente de Revisão)
                  </span>
                )}
              </div>

              <textarea
                value={value}
                onChange={e => {
                  onChange(sub.key, e.target.value)
                  markReviewed(sub.key)
                }}
                placeholder={sub.placeholder || `Descreva observações sobre ${sub.title}...`}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #dcd7cb',
                  background: '#fff',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: COLOR.paperInk,
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
