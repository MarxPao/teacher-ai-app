'use client'

import { useState, useEffect, useMemo } from 'react'

export interface SequenceUnit {
  id: string
  unitNumber: number
  title: string
  bookRef: string
  topics: string[]
  grammarFocus: string
  vocabularyFocus: string
  status: 'completed' | 'current' | 'upcoming'
  masteryPercentage: number // 0 a 100% de domínio da turma
  aiAssessment: string
  suggestedAction: string
}

const INITIAL_UNITS: SequenceUnit[] = [
  {
    id: 'unit_1',
    unitNumber: 1,
    title: 'Unit 1 — Break the Ice: Personal & Social Life',
    bookRef: 'Evolve 3 Student’s Book (pág. 2 a 14)',
    topics: ['Greetings & Icebreakers', 'Describing Personalities', 'Free Time Activities'],
    grammarFocus: 'Simple Present vs. Present Continuous',
    vocabularyFocus: 'Adjectives of Personality & Hobbies',
    status: 'completed',
    masteryPercentage: 92,
    aiAssessment: 'Turma demonstrou excelente fluência inicial e alto engajamento em pares.',
    suggestedAction: 'Conteúdo consolidado com sucesso.',
  },
  {
    id: 'unit_2',
    unitNumber: 2,
    title: 'Unit 2 — Memories & Life Stories',
    bookRef: 'Evolve 3 Student’s Book (pág. 16 a 28)',
    topics: ['Childhood Memories', 'Biography & Historical Events'],
    grammarFocus: 'Simple Past (Regular & Irregular Verbs) & Used to',
    vocabularyFocus: 'Time Expressions & Life Milestones',
    status: 'completed',
    masteryPercentage: 84,
    aiAssessment: 'Bom domínio geral. Pequena hesitação apenas com verbos irregulares de baixa frequência.',
    suggestedAction: 'Reforçar listas de verbos em aquecimentos rápidos de 5 minutos.',
  },
  {
    id: 'unit_3',
    unitNumber: 3,
    title: 'Unit 3 — Life Experiences & Travel',
    bookRef: 'Evolve 3 Student’s Book (pág. 30 a 44)',
    topics: ['Travel Stories', 'Bucket Lists & Unforgettable Trips'],
    grammarFocus: 'Present Perfect with Ever / Never / Already / Yet',
    vocabularyFocus: 'Travel Vocabulary & Extreme Sports',
    status: 'completed',
    masteryPercentage: 78,
    aiAssessment: 'Compreensão sólida do conceito, porém confundiram o particípio de alguns verbos em escrita.',
    suggestedAction: 'Dica da Rafinha: Aplicar um quiz interativo rápido antes de exames.',
  },
  {
    id: 'unit_4',
    unitNumber: 4,
    title: 'Unit 4 — Narratives & Unfinished Actions',
    bookRef: 'Evolve 3 Student’s Book (pág. 46 a 58)',
    topics: ['Storytelling', 'Accidents & Interrupted Past Events'],
    grammarFocus: 'Present Perfect Continuous vs. Present Perfect Simple & Past Continuous',
    vocabularyFocus: 'Adverbs of Degree & Connectors',
    status: 'current',
    masteryPercentage: 62,
    aiAssessment: '⚠️ ALERTA DE CONTEÚDO: 38% da turma está com dificuldade na diferença entre Ação Contínua e Concluída.',
    suggestedAction: 'Recomendação da Rafinha: Inserir mais 1 aula de prática guiada antes de avançar para a Unit 5.',
  },
  {
    id: 'unit_5',
    unitNumber: 5,
    title: 'Unit 5 — Future Horizons & Environmental Tech',
    bookRef: 'Evolve 3 Student’s Book (pág. 60 a 74)',
    topics: ['Climate Change', 'Future Predictions & Inventions'],
    grammarFocus: 'Future Forms (Will, Going to, Present Continuous for Future)',
    vocabularyFocus: 'Environment & Sustainability',
    status: 'upcoming',
    masteryPercentage: 0,
    aiAssessment: 'Próxima unidade do currículo escolar.',
    suggestedAction: 'Preparar slides de aquecimento sobre tecnologias verdes.',
  },
  {
    id: 'unit_6',
    unitNumber: 6,
    title: 'Unit 6 — Hypothetical Worlds & Choices',
    bookRef: 'Evolve 3 Student’s Book (pág. 76 a 90)',
    topics: ['Dilemmas & Decisions', 'If I Were You... Advice'],
    grammarFocus: 'First & Second Conditionals',
    vocabularyFocus: 'Collocations with Make/Do & Dilemmas',
    status: 'upcoming',
    masteryPercentage: 0,
    aiAssessment: 'Unidade prevista para o final do 3º Trimestre.',
    suggestedAction: 'Planejado para o próximo ciclo.',
  },
]

export default function DidacticSequence() {
  const [units, setUnits] = useState<SequenceUnit[]>(INITIAL_UNITS)
  const [schools, setSchools] = useState<string[]>(['Machado Sobrinho', 'Rede Santa Catarina', 'Anglo', 'Colegio Oxford'])
  const [classes, setClasses] = useState<string[]>(['9º Ano B', '8º Ano A', '3º Médio A', '7º Ano C'])

  const [selectedSchool, setSelectedSchool] = useState('Machado Sobrinho')
  const [selectedClass, setSelectedClass] = useState('9º Ano B')
  const [selectedYear, setSelectedYear] = useState('2026')

  const [selectedUnit, setSelectedUnit] = useState<SequenceUnit | null>(null)
  const [analyzingAi, setAnalyzingAi] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)

  useEffect(() => {
    const rawUnits = localStorage.getItem('teacher_didactic_sequence_units')
    if (rawUnits) {
      try { setUnits(JSON.parse(rawUnits)) } catch { setUnits(INITIAL_UNITS) }
    } else {
      setUnits(INITIAL_UNITS)
      localStorage.setItem('teacher_didactic_sequence_units', JSON.stringify(INITIAL_UNITS))
    }
  }, [])

  const saveUnits = (updated: SequenceUnit[]) => {
    setUnits(updated)
    localStorage.setItem('teacher_didactic_sequence_units', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
  }

  // Progresso do Currículo Anual (%)
  const completedCount = units.filter(u => u.status === 'completed').length
  const currentUnit = units.find(u => u.status === 'current')
  const curriculumProgressPct = Math.round(((completedCount + (currentUnit ? 0.5 : 0)) / units.length) * 100)

  // Média de Domínio Geral da Turma (%)
  const averageMastery = Math.round(
    units.filter(u => u.status === 'completed' || u.status === 'current')
      .reduce((acc, u) => acc + u.masteryPercentage, 0) / (completedCount + (currentUnit ? 1 : 0) || 1)
  )

  const handleSetCurrentUnit = (id: string) => {
    const updated = units.map(u => {
      if (u.id === id) return { ...u, status: 'current' as const }
      if (u.unitNumber < units.find(x => x.id === id)!.unitNumber) return { ...u, status: 'completed' as const }
      return { ...u, status: 'upcoming' as const }
    })
    saveUnits(updated)
  }

  const handleRunRafinhaCrossing = async () => {
    setAnalyzingAi(true)
    setAiReport(null)
    try {
      const prompt = `Atue como a Rafinha, assistente de IA especialista em pedagogia ELT.
Faça uma análise de cruzamento de dados entre a Sequência Didática da turma ${selectedClass} (${selectedSchool}) e o Desempenho dos Alunos.
Posição Atual: ${currentUnit?.title || 'Unit 4'}
Médias de Domínio:
- Unit 1: 92%
- Unit 2: 84%
- Unit 3: 78%
- Unit 4 (Atual): 62% (Alerta de dificuldade em Present Perfect Continuous)

Gere um diagnóstico direto e 3 recomendações práticas para o professor decidir se deve avançar para a Unit 5 ou fazer 1 aula de reforço.`

      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      setAiReport(d.response || d.text || 'Análise concluída com sucesso.')
    } catch (e: any) {
      setAiReport(`Erro na análise: ${e.message}`)
    } finally {
      setAnalyzingAi(false)
    }
  }

  return (
    <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1650, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>
              Sequência Didática 🗺️
            </h1>
            <span style={{ background: '#073642', color: '#b58900', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase' }}>
              Timeline do Conteúdo & Cruzamento de Desempenho
            </span>
          </div>
          <p style={{ color: '#586e75', fontSize: 14, marginTop: 4 }}>
            Acompanhe visualmente onde a turma está no livro didático, o índice de domínio dos alunos e as recomendações da Rafinha.
          </p>
        </div>

        <button
          onClick={handleRunRafinhaCrossing}
          disabled={analyzingAi}
          style={{
            padding: '12px 22px', borderRadius: 12, border: 'none',
            background: '#073642', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: analyzingAi ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 14px rgba(7,54,66,0.18)',
          }}
        >
          {analyzingAi ? <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> : <i className="ti ti-brain" />}
          {analyzingAi ? 'Analisando Desempenho...' : '✨ Cruzar Dados com Rafinha IA'}
        </button>
      </div>

      {/* ─── FILTROS DE CONTEXTO (ESCOLA, TURMA, ANO) ───────────────────────────── */}
      <div style={{ background: '#fff', padding: '16px 22px', borderRadius: 16, border: '1px solid #ede8dc', marginBottom: 24, boxShadow: '0 2px 10px rgba(0,43,54,0.04)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 16, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>🏫 Escola</label>
          <select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642', outline: 'none' }}>
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>👥 Turma</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642', outline: 'none' }}>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>🗓️ Ano Letivo</label>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642', outline: 'none' }}>
            <option>2026</option>
            <option>2025</option>
          </select>
        </div>

        {/* Progresso Curricular & Desempenho */}
        <div style={{ background: '#f5f0e8', padding: '10px 16px', borderRadius: 12, display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 11, color: '#586e75', fontWeight: 600, display: 'block' }}>Progresso Curricular</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#073642' }}>{curriculumProgressPct}% Concluído</span>
          </div>
          <div style={{ width: 1, height: 28, background: '#e8e0d0' }} />
          <div>
            <span style={{ fontSize: 11, color: '#586e75', fontWeight: 600, display: 'block' }}>Domínio Médio da Turma</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: averageMastery > 75 ? '#859900' : '#cb4b16' }}>{averageMastery}% de Acerto</span>
          </div>
        </div>
      </div>

      {/* Relatório de Cruzamento Inteligente da Rafinha */}
      {aiReport && (
        <div style={{ background: '#073642', color: '#fdf6e3', padding: 22, borderRadius: 16, marginBottom: 24, boxShadow: '0 4px 16px rgba(0,43,54,0.15)', border: '1px solid #002b36' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="ti ti-sparkles" style={{ fontSize: 22, color: '#b58900' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, fontFamily: 'Georgia, serif' }}>
                Diagnóstico Agêntico da Rafinha — Turma {selectedClass}
              </h3>
            </div>
            <button onClick={() => setAiReport(null)} style={{ background: 'none', border: 'none', color: '#93a1a1', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#eee8d5', whiteSpace: 'pre-wrap' }}>
            {aiReport}
          </div>
        </div>
      )}

      {/* ─── TIMELINE VISUAL DA SEQUÊNCIA DIDÁTICA ─────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff', padding: 32, borderRadius: 20, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
          
          {/* Linha vertical central da timeline */}
          <div style={{ position: 'absolute', left: 40, top: 20, bottom: 40, width: 4, background: '#eee8d5', zIndex: 1 }} />

          {units.map((unit) => {
            const isCurrent = unit.status === 'current'
            const isCompleted = unit.status === 'completed'

            return (
              <div
                key={unit.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 24,
                  marginBottom: 32,
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                {/* Nó/Ícone da Timeline */}
                <div
                  onClick={() => handleSetCurrentUnit(unit.id)}
                  title="Clique para definir esta unidade como o conteúdo atual da matéria"
                  style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: isCurrent ? '#cb4b16' : isCompleted ? '#859900' : '#eee8d5',
                    color: isCurrent || isCompleted ? '#fff' : '#93a1a1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800, cursor: 'pointer',
                    boxShadow: isCurrent ? '0 0 0 6px rgba(203,75,22,0.2)' : 'none',
                    border: '3px solid #fff', transition: 'all 0.3s ease', flexShrink: 0
                  }}
                >
                  {isCurrent ? <i className="ti ti-pin" /> : isCompleted ? <i className="ti ti-check" /> : unit.unitNumber}
                </div>

                {/* Conteúdo do Card da Timeline */}
                <div
                  style={{
                    flex: 1, background: isCurrent ? '#fdf6e3' : '#fff',
                    border: `2px solid ${isCurrent ? '#cb4b16' : isCompleted ? '#e8e0d0' : '#ede8dc'}`,
                    borderRadius: 16, padding: 22,
                    boxShadow: isCurrent ? '0 6px 20px rgba(203,75,22,0.1)' : '0 2px 8px rgba(0,43,54,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        {isCurrent && (
                          <span style={{ background: '#cb4b16', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            📍 VOCÊ ESTÁ AQUI (Conteúdo Atual)
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ background: '#859900', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                            Concluído
                          </span>
                        )}
                        {!isCurrent && !isCompleted && (
                          <span style={{ background: '#eee8d5', color: '#586e75', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                            Próxima Unidade
                          </span>
                        )}

                        <span style={{ fontSize: 12, fontWeight: 600, color: '#586e75' }}>
                          📖 {unit.bookRef}
                        </span>
                      </div>

                      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>
                        {unit.title}
                      </h3>
                    </div>

                    {/* Indicador de Domínio da Turma */}
                    {(isCompleted || isCurrent) && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#586e75' }}>Domínio da Turma</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 100, height: 8, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${unit.masteryPercentage}%`, height: '100%', background: unit.masteryPercentage > 75 ? '#859900' : '#cb4b16', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: unit.masteryPercentage > 75 ? '#859900' : '#cb4b16' }}>
                            {unit.masteryPercentage}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tópicos e Foco Gramatical */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '12px 0', padding: 12, background: 'rgba(255,255,255,0.7)', borderRadius: 12, fontSize: 13 }}>
                    <div>
                      <strong style={{ color: '#073642' }}>📘 Gramática:</strong> {unit.grammarFocus}<br />
                      <strong style={{ color: '#073642' }}>💬 Vocabulário:</strong> {unit.vocabularyFocus}
                    </div>
                    <div>
                      <strong style={{ color: '#073642' }}>🎯 Tópicos Curriculares:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {unit.topics.map(t => (
                          <span key={t} style={{ fontSize: 11, background: '#f5f0e8', color: '#586e75', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Diagnóstico da IA e Ação Recomendada */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px dashed #e8e0d0', fontSize: 12.5 }}>
                    <span style={{ color: '#586e75' }}>
                      🧠 <strong>IA Status:</strong> {unit.aiAssessment}
                    </span>
                    <button
                      onClick={() => setSelectedUnit(unit)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#fff', fontSize: 12, fontWeight: 700, color: '#073642', cursor: 'pointer' }}
                    >
                      Detalhes da Unidade
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal Detalhes da Unidade */}
      {selectedUnit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 500, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 12px 40px rgba(0,43,54,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>
                {selectedUnit.title}
              </h3>
              <button onClick={() => setSelectedUnit(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
            </div>

            <div style={{ fontSize: 13, color: '#586e75', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><strong>Livro / Material:</strong> {selectedUnit.bookRef}</div>
              <div><strong>Foco Gramatical:</strong> {selectedUnit.grammarFocus}</div>
              <div><strong>Vocabulário:</strong> {selectedUnit.vocabularyFocus}</div>
              <div><strong>Índice de Domínio:</strong> {selectedUnit.masteryPercentage}%</div>
              <div style={{ background: '#f5f0e8', padding: 12, borderRadius: 10, color: '#073642' }}>
                <strong>Recomendação Pedagógica:</strong><br />{selectedUnit.suggestedAction}
              </div>
            </div>

            <button
              onClick={() => { handleSetCurrentUnit(selectedUnit.id); setSelectedUnit(null) }}
              style={{ padding: '12px', borderRadius: 10, border: 'none', background: '#cb4b16', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              📍 Definir Como Conteúdo Atual da Turma
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
