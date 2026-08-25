'use client'

import React, { useState } from 'react'
import { FONT, RADIUS } from '@/styles/tokens'
import { executeUnifiedAiCall } from '@/lib/autoApiSelector'

interface SubstituteModeProps {
  open: boolean
  onClose: () => void
  defaultClass?: string
  defaultSubject?: string
}

interface SubstitutePackage {
  summary: string
  substituteBriefing: string
  substituteActivities: Array<{ title: string; duration: string; instructions: string }>
  contingencyPlan: string
}

/**
 * Modo Professor Substituto (#49).
 * Gera em 30 segundos um pacote completo de emergência com plano, atividades e instruções.
 */
export default function SubstituteMode({
  open,
  onClose,
  defaultClass = '9º Ano B',
  defaultSubject = 'Língua Inglesa',
}: SubstituteModeProps) {
  const [className, setClassName] = useState(defaultClass)
  const [subject, setSubject] = useState(defaultSubject)
  const [topic, setTopic] = useState('Revisão e Prática Interativa')
  const [isGenerating, setIsGenerating] = useState(false)
  const [packageData, setPackageData] = useState<SubstitutePackage | null>(null)

  if (!open) return null

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const prompt = `Você é um coordenador pedagógico experiente.
Gere um PACOTE EMERGENCIAL DE AULA PARA PROFESSOR SUBSTITUTO.

DADOS:
- Turma: ${className}
- Disciplina: ${subject}
- Tópico/Foco: ${topic}
- Duração da Aula: 50 minutos

INSTRUÇÕES:
Retorne APENAS um JSON válido no seguinte formato:
{
  "summary": "Resumo objetivo da aula em 2 linhas",
  "substituteBriefing": "Orientações essenciais de manejo de turma e rotina",
  "substituteActivities": [
    { "title": "Atividade 1 (Aquecimento)", "duration": "10 min", "instructions": "Passo a passo claro" },
    { "title": "Atividade 2 (Prática Central)", "duration": "25 min", "instructions": "Passo a passo claro" },
    { "title": "Atividade 3 (Fechamento/Desafio)", "duration": "15 min", "instructions": "Passo a passo claro" }
  ],
  "contingencyPlan": "O que fazer se a turma terminar antes do tempo ou faltar equipamento"
}`

      const { getAvailableApisForSelect } = await import('@/lib/autoApiSelector')
      const apis = getAvailableApisForSelect()
      const api = apis[0] || { id: 'auto', name: 'Auto', provider: 'gemini' as const, key: '', model: '', active: true }
      const response = await executeUnifiedAiCall(api, prompt)

      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as SubstitutePackage
        setPackageData(parsed)
      } else {
        setPackageData({
          summary: `Aula prática de ${subject} para a turma ${className}.`,
          substituteBriefing: `Mantenha a turma engajada através de exercícios em duplas. O diário de chamada deve ser preenchido normalmente.`,
          substituteActivities: [
            { title: 'Aquecimento Rápido', duration: '10 min', instructions: 'Perguntas interativas no quadro.' },
            { title: 'Prática de Fixação', duration: '25 min', instructions: 'Leitura e resolução de 5 exercícios.' },
            { title: 'Dinâmica de Saída', duration: '15 min', instructions: 'Quiz relâmpago de encerramento.' },
          ],
          contingencyPlan: 'Em caso de término antecipado, solicite que os alunos elaborem 3 frases aplicando o conteúdo.',
        })
      }
    } catch (e: any) {
      alert(`Erro ao gerar pacote de substituto: ${e?.message || 'Falha na IA'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,17,10,0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 9992,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          background: '#fffcf8',
          borderRadius: RADIUS.xl,
          padding: '28px 32px',
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(28,17,10,0.25)',
          border: '1px solid rgba(139,115,85,0.2)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🆘</span>
            <div>
              <h3 style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
                Modo Professor Substituto
              </h3>
              <span style={{ fontSize: 12.5, color: '#7a5c42' }}>
                Gere um plano de aula autoexplicativo em 30 segundos
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#7a5c42', cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        {/* Inputs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1.5fr',
            gap: 12,
            marginBottom: 20,
            background: '#faf7f2',
            padding: 16,
            borderRadius: RADIUS.md,
            border: '1px solid rgba(139,115,85,0.12)',
          }}
        >
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>
              Turma:
            </label>
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d5c8bb', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>
              Disciplina:
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d5c8bb', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>
              Tema / Conteúdo:
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d5c8bb', fontSize: 13 }}
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 10,
            background: isGenerating ? '#93a1a1' : 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 800,
            cursor: isGenerating ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(139,94,60,0.25)',
            marginBottom: 20,
          }}
        >
          {isGenerating ? '⚡ Gerando Pacote de Emergência...' : '✨ Gerar Pacote do Substituto (50 min)'}
        </button>

        {/* Resultado */}
        {packageData && (
          <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, background: '#fdfbf7', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 10 }}>
              <strong style={{ color: '#8b5e3c', fontSize: 12, textTransform: 'uppercase' }}>📌 Resumo Geral:</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#2c1a0e' }}>{packageData.summary}</p>
            </div>

            <div style={{ padding: 14, background: '#f4f9f5', border: '1px solid rgba(61,122,78,0.2)', borderRadius: 10 }}>
              <strong style={{ color: '#3d7a4e', fontSize: 12, textTransform: 'uppercase' }}>📋 Instruções para o Colega:</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#1e4828' }}>{packageData.substituteBriefing}</p>
            </div>

            <div>
              <strong style={{ color: '#7a5c42', fontSize: 12, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                ⏱️ Roteiro de Atividades (50 min):
              </strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {packageData.substituteActivities.map((act, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px',
                      background: '#fff',
                      border: '1px solid rgba(139,115,85,0.14)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        padding: '3px 8px',
                        background: 'rgba(139,94,60,0.1)',
                        color: '#8b5e3c',
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {act.duration}
                    </span>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#2c1a0e' }}>{act.title}</strong>
                      <p style={{ margin: '3px 0 0', fontSize: 13, color: '#5c3d20', lineHeight: 1.4 }}>
                        {act.instructions}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: 12, background: '#fbf4f4', border: '1px solid rgba(168,50,50,0.18)', borderRadius: 8 }}>
              <strong style={{ color: '#a83232', fontSize: 11.5, textTransform: 'uppercase' }}>🛡️ Plano de Contingência:</strong>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#5a2222' }}>{packageData.contingencyPlan}</p>
            </div>

            <button
              onClick={handlePrint}
              style={{
                marginTop: 6,
                padding: '10px',
                borderRadius: 8,
                border: '1px solid #8b5e3c',
                background: '#fff',
                color: '#8b5e3c',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <i className="ti ti-printer" /> Imprimir ou Salvar em PDF
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
