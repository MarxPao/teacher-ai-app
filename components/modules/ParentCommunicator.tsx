'use client'

import { useState, useEffect } from 'react'

interface StudentItem {
  id: string
  name: string
  parentName: string
  parentPhone: string
  className: string
  performance: 'Excelente' | 'Bom' | 'Atenção Necessária'
  lastGrade: number
}

const SAMPLE_STUDENTS: StudentItem[] = [
  { id: '1', name: 'Ana Júlia Santos', parentName: 'Dra. Carla Santos', parentPhone: '31998877665', className: '9º Ano B', performance: 'Excelente', lastGrade: 9.5 },
  { id: '2', name: 'Pedro Henrrique', parentName: 'Sr. Roberto Henrrique', parentPhone: '31987654321', className: '9º Ano B', performance: 'Atenção Necessária', lastGrade: 6.0 },
  { id: '3', name: 'Lucas Oliveira', parentName: 'Sra. Márcia Oliveira', parentPhone: '31976543210', className: '9º Ano B', performance: 'Bom', lastGrade: 8.2 },
  { id: '4', name: 'Mariana Lima', parentName: 'Sr. Fernando Lima', parentPhone: '31965432109', className: '9º Ano B', performance: 'Excelente', lastGrade: 9.0 },
]

export default function ParentCommunicator() {
  const [students, setStudents] = useState<StudentItem[]>(SAMPLE_STUDENTS)
  const [selectedStudentId, setSelectedStudentId] = useState<string>('2')
  const [period, setPeriod] = useState('2º Trimestre 2026')
  const [tone, setTone] = useState<'acolhedor' | 'formal' | 'direto'>('acolhedor')

  const [generatedReport, setGeneratedReport] = useState('')
  const [generating, setGenerating] = useState(false)

  const selectedStudent = students.find(s => s.id === selectedStudentId) || students[0]

  useEffect(() => {
    handleGenerateReport()
  }, [selectedStudentId, period, tone])

  const handleGenerateReport = async () => {
    setGenerating(true)
    try {
      const prompt = `Atue como a Rafinha, assistente pedagógica de inglês.
Gere um boletim de acompanhamento individual em tom ${tone} direcionado aos pais do aluno(a) "${selectedStudent.name}".
Responsável: ${selectedStudent.parentName}
Turma: ${selectedStudent.className}
Período: ${period}
Desempenho Atual em Inglês: ${selectedStudent.performance} (Nota recente: ${selectedStudent.lastGrade}/10)

O texto deve conter:
1. Saudação carinhosa aos pais.
2. Destaques das conquistas em inglês (vocab, speaking, grammar).
3. Pontos de atenção ou recomendações pedagógicas suaves para praticar em casa.
4. Mensagem final de encorajamento e disponibilidade da professora.

Formate de modo ideal para envio direto via WhatsApp!`

      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      setGeneratedReport(d.response || d.text || '')
    } catch {
      setGeneratedReport(`Olá ${selectedStudent.parentName}! Segue o boletim de acompanhamento de ${selectedStudent.name} em Inglês (${period}). Desempenho geral: ${selectedStudent.performance}. Nota: ${selectedStudent.lastGrade}. Parabéns pelo empenho!`)
    } finally {
      setGenerating(false)
    }
  }

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(generatedReport)
    window.open(`https://api.whatsapp.com/send?phone=55${selectedStudent.parentPhone}&text=${text}`, '_blank')
  }

  return (
    <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>
            Comunicação com Pais & WhatsApp 📲
          </h1>
          <span style={{ background: '#25D366', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase' }}>
            Boletim Individual com 1 Clique
          </span>
        </div>
        <p style={{ color: '#586e75', fontSize: 14, marginTop: 4 }}>
          Gere relatórios pedagógicos afetuosos e individuais de progresso para envio direto aos responsáveis via WhatsApp Web ou PDF.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, flex: 1, minHeight: 0 }}>
        {/* Painel de Seleção do Aluno */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 22, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 6 }}>Selecione o Aluno</label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13.5, color: '#073642', outline: 'none' }}
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
              ))}
            </select>
          </div>

          <div style={{ background: '#f5f0e8', padding: 14, borderRadius: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><strong>Responsável:</strong> {selectedStudent.parentName}</div>
            <div><strong>WhatsApp:</strong> +55 {selectedStudent.parentPhone}</div>
            <div><strong>Nota Recente em Inglês:</strong> <strong style={{ color: selectedStudent.lastGrade >= 8 ? '#859900' : '#cb4b16' }}>{selectedStudent.lastGrade}/10</strong></div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 6 }}>Tom do Relatório</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {(['acolhedor', 'formal', 'direto'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  style={{
                    padding: '8px', borderRadius: 8, border: tone === t ? '2px solid #073642' : '1px solid #e8e0d0',
                    background: tone === t ? '#eee8d5' : '#fff', color: '#073642', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pré-visualização do Relatório e Envio */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>
                💬 Pré-visualização da Mensagem para os Pais
              </span>
              {generating && <span style={{ fontSize: 12, color: '#b58900' }}><i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> Gerando com IA...</span>}
            </div>

            <textarea
              value={generatedReport}
              onChange={e => setGeneratedReport(e.target.value)}
              rows={16}
              style={{ width: '100%', padding: '16px', borderRadius: 14, border: '1px solid #e8e0d0', background: '#fdf6e3', fontSize: 14, color: '#073642', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
            <button
              onClick={() => window.print()}
              style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #e8e0d0', background: '#fff', fontSize: 13, fontWeight: 700, color: '#073642', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <i className="ti ti-printer" /> Imprimir / PDF
            </button>

            <button
              onClick={handleSendWhatsApp}
              style={{
                padding: '12px 24px', borderRadius: 10, border: 'none',
                background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 14px rgba(37,211,102,0.3)'
              }}
            >
              <i className="ti ti-brand-whatsapp" /> Enviar Direto no WhatsApp dos Pais
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
