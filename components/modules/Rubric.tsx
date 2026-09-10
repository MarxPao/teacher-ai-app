'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import { useState, useEffect, useMemo } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'
import { safeGet, safeSet, KEYS } from '@/lib/localDB'
import Button from '@/components/Button'

interface StudentRecord { id: string; name: string; classId: string; schoolId: string; grades?: Record<string, string> }

const CAMBRIDGE_WRITING_CRITERIA = [
 { key: 'Content', icon: 'ti-file-text', sub: 'Foco na proposta e cumprimento dos pontos exigidos (0-5)' },
 { key: 'Communicative Achievement',icon: 'ti-message-2', sub: 'Adequação do tom, registro (formal/informal) e clareza (0-5)' },
 { key: 'Organisation', icon: 'ti-layout-list', sub: 'Coesão, coerência, parágrafos e conectivos (0-5)' },
 { key: 'Language', icon: 'ti-book-2', sub: 'Amplitude e precisão de vocabulário e gramática (0-5)' },
]

const CAMBRIDGE_SPEAKING_CRITERIA = [
 { key: 'Grammatical Range', icon: 'ti-grammar', sub: 'Variedade e precisão de estruturas gramaticais (0-5)' },
 { key: 'Lexical Resource', icon: 'ti-abc', sub: 'Amplitude e adequação do repertório de vocabulário (0-5)' },
 { key: 'Discourse Management', icon: 'ti-wave-sine', sub: 'Fluência, extensão das respostas e relevância (0-5)' },
 { key: 'Pronunciation', icon: 'ti-volume', sub: 'Intonação, acentuação e clareza de sons individuais (0-5)' },
 { key: 'Interactive Communication',icon: 'ti-users', sub: 'Capacidade de iniciar, manter e concluir discussões (0-5)' },
]

const BAND_DESCRIPTORS: Record<string, Record<number, string>> = {
  // Writing
  'Content': {
    5: 'Todas as tarefas cumpridas com relevância e riqueza de detalhes.',
    4: 'Tarefas cumpridas com clareza; pequenos desvios secundários.',
    3: 'Maioria das tarefas cumprida de forma satisfatória.',
    2: 'Cumprimento parcial; lacunas significativas de conteúdo.',
    1: 'Conteúdo quase totalmente não abordado ou irrelevante.'
  },
  'Communicative Achievement': {
    5: 'Domínio pleno do registro formal/informal e engajamento natural.',
    4: 'Registro adequado e consistente com boa clareza de tom.',
    3: 'Convenções comunicativas satisfatórias para o propósito.',
    2: 'Registro inconsistente; dificuldade em manter tom adequado.',
    1: 'Comunicação prejudicada; registro inadequado à proposta.'
  },
  'Organisation': {
    5: 'Texto coeso e fluido; parágrafos lógicos e conectivos variados.',
    4: 'Boa organização com parágrafos claros e conectivos adequados.',
    3: 'Organização satisfatória; conectivos simples e pontuação básica.',
    2: 'Parágrafos desconexos; uso limitado ou incorreto de conectivos.',
    1: 'Ausência de estrutura lógica e desorganização textual.'
  },
  'Language': {
    5: 'Amplo vocabulário e estruturas complexas com alta precisão.',
    4: 'Bom repertório lexical e gramatical; erros menores não impedem clareza.',
    3: 'Léxico e gramática suficientes para ideias básicas; erros pontuais.',
    2: 'Estruturas gramaticais muito restritas; erros frequentes.',
    1: 'Léxico e gramática rudimentares com severo prejuízo à compreensão.'
  },
  // Speaking
  'Grammatical Range': {
    5: 'Uso flexível e preciso de estruturas simples e complexas.',
    4: 'Boa variedade de estruturas gramaticais com controle adequado.',
    3: 'Controle satisfatório de estruturas simples; hesita em complexas.',
    2: 'Uso limitado a estruturas básicas com erros recorrentes.',
    1: 'Erros gramaticais severos que impedem a compreensão.'
  },
  'Lexical Resource': {
    5: 'Vocabulário variado, idiomático e preciso para nuances de ideias.',
    4: 'Repertório lexical amplo com poucas paráfrases inadequadas.',
    3: 'Vocabulário adequado para temas comuns; repetição frequente.',
    2: 'Léxico insuficiente para tópicos além do imediato.',
    1: 'Repertório muito restrito; pausas longas para buscar palavras.'
  },
  'Discourse Management': {
    5: 'Fluência contínua, respostas extensas e coesas com pouco esforço.',
    4: 'Respostas bem desenvolvidas com hesitações naturais mínimas.',
    3: 'Produz enunciados conexos, mas com hesitação perceptível.',
    2: 'Respostas curtas e fragmentadas; hesitações prolongadas.',
    1: 'Dificuldade em manter o turno de fala; respostas monossilábicas.'
  },
  'Pronunciation': {
    5: 'Intonação e acentuação naturais; pronúncia cristalina e fluida.',
    4: 'Facilmente inteligível; fonemas claros com sotaque não-intrusivo.',
    3: 'Geralmente inteligível; alguns sons individuais exigem esforço.',
    2: 'Frequentemente ininteligível; problemas de acentuação e ritmo.',
    1: 'Severamente incompreensível; sotaque e fonemas distorcidos.'
  },
  'Interactive Communication': {
    5: 'Inicia, sustenta e conclui interações com naturalidade e escuta ativa.',
    4: 'Interage ativamente com o interlocutor sem necessidade de suporte.',
    3: 'Mantém a interação, embora por vezes dependa do interlocutor.',
    2: 'Dificuldade em manter diálogo; requer incentivo constante.',
    1: 'Não consegue sustentar interação simples com o interlocutor.'
  }
}

const BANDS = ['Band 5 (Excelente)', 'Band 4 (Bom)', 'Band 3 (Regular)', 'Band 2 (Suficiente)', 'Band 1 (Insuficiente)']

const S = {
 label: { fontSize: 13, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 6 } as React.CSSProperties,
 select: { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: RADIUS.md, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const, cursor: 'pointer' },
 input: { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: RADIUS.md, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit' },
 btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}

export interface RubricPreviewProps {
  cefrLevel?: string
  compact?: boolean
}

export function RubricPreview({ cefrLevel, compact = false }: RubricPreviewProps) {
  const criteria = [
    { name: 'Content', desc: 'Cumprimento da proposta, relevancia e desenvolvimento das ideias' },
    { name: 'Communicative Achievement', desc: 'Registro, tom e engajamento do leitor-alvo' },
    { name: 'Organisation', desc: 'Estrutura de paragrafos, conectivos e sequencia logica' },
    { name: 'Language', desc: 'Amplitude, precisao e complexidade de vocabulario e gramatica' },
  ]
  
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 text-xs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
        {criteria.map(c => (
          <span key={c.name} className="px-2 py-1 bg-blue-50 text-blue-700 rounded" style={{ padding: '4px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 4 }}>
            {c.name} (0-5)
          </span>
        ))}
        <span className="px-2 py-1 bg-gray-50 text-gray-600 rounded" style={{ padding: '4px 8px', background: '#f9fafb', color: '#4b5563', borderRadius: 4 }}>Nota = soma/2</span>
      </div>
    )
  }
  
  return (
    <div className="text-sm" style={{ fontSize: 14 }}>
      {cefrLevel && <p className="text-xs text-gray-500 mb-2" style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Nivel CEFR: <strong>{cefrLevel}</strong></p>}
      <table className="w-full border-collapse border border-gray-200" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb' }}>
        <thead>
          <tr className="bg-blue-50" style={{ background: '#eff6ff' }}>
            <th className="border border-gray-200 p-2 text-left text-xs" style={{ border: '1px solid #e5e7eb', padding: 8, textAlign: 'left', fontSize: 12 }}>Criterio</th>
            <th className="border border-gray-200 p-2 text-center text-xs" style={{ border: '1px solid #e5e7eb', padding: 8, textAlign: 'center', fontSize: 12 }}>Escala</th>
            <th className="border border-gray-200 p-2 text-left text-xs" style={{ border: '1px solid #e5e7eb', padding: 8, textAlign: 'left', fontSize: 12 }}>O que avalia</th>
          </tr>
        </thead>
        <tbody>
          {criteria.map(c => (
            <tr key={c.name} className="border border-gray-200 hover:bg-gray-50" style={{ border: '1px solid #e5e7eb' }}>
              <td className="p-2 font-medium text-xs" style={{ padding: 8, fontWeight: 500, fontSize: 12 }}>{c.name}</td>
              <td className="p-2 text-center text-xs" style={{ padding: 8, textAlign: 'center', fontSize: 12 }}>0 – 5</td>
              <td className="p-2 text-xs text-gray-600" style={{ padding: 8, fontSize: 12, color: '#4b5563' }}>{c.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-400" style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>Nota final (0-10) = (Content + Comm. Achievement + Organisation + Language) ÷ 2</p>
    </div>
  )
}

export default function Rubric() {
 const [preset, setPreset] = useState<'writing' | 'speaking'>('writing')
 const [taskDesc, setTaskDesc] = useState('')
 const [level, setLevel] = useState('B2')
 const [customPrompt, setCustomPrompt] = useState('')
 const [result, setResult] = useState('')
 const [loading, setLoading] = useState(false)
 const [apis, setApis] = useState<ApiConfig[]>([])
 const [selectedApi, setSelectedApi] = useState<string>('manual')
 const [manualPrompt, setManualPrompt] = useState('')

 // Avaliador de Aluno (Interactive Grader)
 const [students, setStudents] = useState<StudentRecord[]>([])
 const [evalStudentId, setEvalStudentId] = useState<string>('')
 const [evalScores, setEvalScores] = useState<Record<string, number>>({})
 const [evalTitle, setEvalTitle] = useState('Cambridge Assessment')
 const [launched, setLaunched] = useState(false)

 const activeCriteria = useMemo(() => {
 return preset === 'writing' ? CAMBRIDGE_WRITING_CRITERIA : CAMBRIDGE_SPEAKING_CRITERIA
 }, [preset])

 useEffect(() => {
    const act = safeGet<ApiConfig[]>(KEYS.APIS, []).filter(x => x.active)
    setApis(act)
    if (act.length > 0) setSelectedApi(act[0].id)

    const parsed = safeGet<StudentRecord[]>(KEYS.STUDENTS, [])
    setStudents(parsed)
    if (parsed.length > 0) setEvalStudentId(parsed[0].id)
  }, [])

  // Inicializa scores da calculadora
  useEffect(() => {
    const initial: Record<string, number> = {}
    activeCriteria.forEach(c => { initial[c.key] = 4 }) // Band 4 default
    setEvalScores(initial)
    setLaunched(false)
  }, [activeCriteria])

  const totalPossible = activeCriteria.length * 5
  const rawSum = Object.values(evalScores).reduce((a, b) => a + b, 0)
  const finalGrade = (totalPossible > 0 && !Number.isNaN(rawSum))
    ? Number(((rawSum / totalPossible) * 10).toFixed(1))
    : 0
  const isGradeValid = activeCriteria.length > 0 && totalPossible > 0 && !Number.isNaN(finalGrade)

  function setScore(key: string, val: number) {
    setEvalScores(prev => ({ ...prev, [key]: val }))
    setLaunched(false)
  }

  function launchGradeToStudent() {
    if (!evalStudentId) {
      toast.warning('Selecione um aluno para lançar a nota.')
      return
    }
    if (!isGradeValid) {
      toast.error('Não é possível lançar a nota: nenhum critério válido configurado.')
      return
    }
    const idx = students.findIndex(s => s.id === evalStudentId)
    if (idx === -1) {
      toast.error('Aluno não encontrado no banco de dados.')
      return
    }

    const upd = [...students]
    const colName = `${evalTitle} (${preset === 'writing' ? 'Writing' : 'Speaking'})`
    upd[idx].grades = { ...(upd[idx].grades || {}), [colName]: String(finalGrade) }

    setStudents(upd)
    safeSet(KEYS.STUDENTS, upd)

    // Atualiza gbConfig
    const gbConfig = safeGet<{ cols: string[] }>(KEYS.GRADEBOOK_CONFIG, { cols: [] })
    if (!gbConfig.cols.includes(colName)) {
      gbConfig.cols.push(colName)
      safeSet(KEYS.GRADEBOOK_CONFIG, gbConfig)
    }

    window.dispatchEvent(new Event('storage'))
    setLaunched(true)
    toast.success(`Nota ${finalGrade} lançada com sucesso no boletim!`)
  }

  async function generate() {
    setLoading(true); setResult(''); setManualPrompt('')

    const criteriaList = activeCriteria.map(c => `${c.key}: ${c.sub}`).join('\n')
    const prompt = `Act as an official Cambridge Assessment English Examiner.
Create an official Assessment Rubric Matrix for ${preset.toUpperCase()} (${level} CEFR).
Task Context: ${taskDesc || 'Official Assessment Task'}.
${customPrompt ? `\nCUSTOM TEACHER PROMPT / GUIDELINES:\n"${customPrompt}"\n` : ''}
Official Criteria:
${criteriaList}

Bands: Band 5 (Substantial / Full Mastery), Band 4 (Good / High Competence), Band 3 (Satisfactory), Band 2 (Marginal), Band 1 (Inadequate).

Output ONLY as clean HTML table (table, tr, th, td, h1, p, span).
Style the table with professional Cambridge Assessment styling (border-collapse:collapse, dark teal header #2c1a0e, alternating light row backgrounds, padded cells).`

    if (selectedApi === 'manual') {
      setManualPrompt(prompt)
      setResult('<p style="text-align:center;color:#a08060;font-style:italic;padding:40px">Cole aqui a rubrica gerada...</p>')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }]
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || errData.message || 'Falha ao processar requisição com a IA.')
      }

      const data = await res.json()
      const out = data?.reply || data?.content || ''
      setResult(out.replace(/^```html\n?/i, '').replace(/^```\n?/, '').replace(/```$/i, '').trim())
    } catch(e: any) {
      setResult(`<p style="color:#dc322f">Erro: ${e.message}</p>`)
      toast.error(`Erro ao gerar rubrica: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const evalStu = students.find(s => s.id === evalStudentId)

  async function handleSaveRubricToDatabase() {
    if (!result) { toast.warning('Gere uma matriz de rubrica primeiro.'); return }
    const { saveRubricToSupabase } = await import('@/lib/supabaseClient')
    await saveRubricToSupabase({
      title: `Matriz de Rubrica Cambridge ${preset.toUpperCase()} (${level})`,
      type: 'rubric',
      grade: level,
      criteria: activeCriteria,
      content: result
    })
    toast.success('Rubrica salva com sucesso no Banco de Dados!')
  }

 return (
 <div style={{ padding: '32px 44px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

 {/* Header */}
 <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14  }}>
 <div>
 <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, color: '#2c1a0e', margin: '0 auto'  }}>
 Rubricas Pedagógicas (Cambridge Assessment)
 </h1>
 </div>
  {result && (
    <Button
      variant="primary"
      size="md"
      icon={<i className="ti ti-database" />}
      onClick={handleSaveRubricToDatabase}
    >
      Salvar no Banco de Dados
    </Button>
  )}
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 32, flex: 1, minHeight: 0 }}>
 {/* LEFT PANEL */}
 <div style={{ overflowY: 'auto', paddingRight: 8, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
 
 {/* Preset Selector */}
 <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(44,26,14,0.06)', border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 14 }}>
 <p style={{ fontSize: 13, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
 Modalidade de Avaliação ELT
 </p>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
 <button onClick={() => setPreset('writing')} style={{
 padding: '12px', borderRadius: RADIUS.lg, border: preset === 'writing' ? '2px solid #2c1a0e' : '1px solid #e4ddd0',
 background: preset === 'writing' ? '#f0ede4' : '#fff', cursor: 'pointer', textAlign: 'left'
 }}>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}><i className="ti ti-notebook" style={{ marginRight: 6 }} /> Writing</div>
 <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>4 Critérios Cambridge</div>
 </button>

 <button onClick={() => setPreset('speaking')} style={{
 padding: '12px', borderRadius: RADIUS.lg, border: preset === 'speaking' ? '2px solid #2c1a0e' : '1px solid #e4ddd0',
 background: preset === 'speaking' ? '#f0ede4' : '#fff', cursor: 'pointer', textAlign: 'left'
 }}>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}><i className="ti ti-microphone" style={{ marginRight: 6 }} /> Speaking</div>
 <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>5 Critérios Cambridge</div>
 </button>
 </div>

 {/* Box de Prompt Personalizado */}
 <div>
 <label style={S.label}> Prompt Personalizado / Diretrizes da IA</label>
 <textarea
 value={customPrompt}
 onChange={e => setCustomPrompt(e.target.value)}
 placeholder="Insira orientações ou critérios extras para a rubrica ex: dar peso maior para fluência do que para erros gramaticais menores..."
 rows={3}
 style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
 />
 </div>
 </div>

 {/* Calculadora Interativa de Notas (Live Grader) */}
 <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(44,26,14,0.06)', border: '1px solid #ede8dc' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
 <p style={{ fontSize: 13, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
 Avaliador do Aluno
 </p>
 <div style={{ background: '#f5f0e8', borderRadius: RADIUS.lg, padding: '4px 12px', textAlign: 'right' }}>
 <span style={{ fontSize: 18, fontWeight: 800, color: finalGrade >= 7 ? '#2d7a00' : '#854d00' }}>{finalGrade}</span>
 <span style={{ fontSize: 10, color: '#a08060' }}> / 10</span>
 </div>
 </div>

 <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
 <div>
 <label style={S.label}>Aluno Avaliado</label>
 <select value={evalStudentId} onChange={e => setEvalStudentId(e.target.value)} style={S.select}>
 {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 </div>

 <div>
 <label style={S.label}>Nome da Avaliação</label>
 <input value={evalTitle} onChange={e => setEvalTitle(e.target.value)} style={S.input} placeholder="Ex: Cambridge Mock Exam" />
 </div>
 </div>

 {/* Matriz de Escolha de Bands */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
  {activeCriteria.map(c => {
    const currentScore = evalScores[c.key] || 4
    const descriptor = BAND_DESCRIPTORS[c.key]?.[currentScore] || ''
    return (
      <div key={c.key} style={{ background: '#fdf9f3', borderRadius: RADIUS.lg, padding: '12px 14px', border: '1px solid #ede8dc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
          <span><i className={`ti ${c.icon}`} style={{ marginRight: 6, color: '#268bd2' }} />{c.key}</span>
          <span style={{ color: '#268bd2', fontWeight: 800 }}>Band {currentScore} / 5</span>
        </div>
        {/* Descritor de Desempenho Explicativo */}
        <p style={{ fontSize: 11, color: '#664d36', margin: '0 0 8px 0', lineHeight: 1.4, fontStyle: 'italic' }}>
          <strong>Band {currentScore}:</strong> {descriptor}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5].map(b => {
            const bDesc = BAND_DESCRIPTORS[c.key]?.[b] || ''
            return (
              <button
                key={b}
                type="button"
                onClick={() => setScore(c.key, b)}
                title={`Band ${b}: ${bDesc}`}
                aria-label={`${c.key} Band ${b}: ${bDesc}`}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  background: currentScore === b ? '#2c1a0e' : '#f0e8d8',
                  color: currentScore === b ? '#fff' : '#7a5c42',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {b}
              </button>
            )
          })}
        </div>
      </div>
    )
  })}
  </div>

  <Button
    variant={launched ? "secondary" : "primary"}
    size="md"
    fullWidth
    onClick={launchGradeToStudent}
    disabled={launched || !evalStudentId || !isGradeValid}
    icon={<i className={`ti ${launched ? 'ti-check' : 'ti-report-analytics'}`} />}
    aria-label="Lançar nota no boletim"
  >
    {launched ? 'Nota Lançada no Gradebook!' : 'Lançar Nota no Gradebook'}
  </Button>
 </div>

 {/* Detalhes para a IA */}
 <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(44,26,14,0.06)', border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div>
 <label style={S.label}>Descrição / Prompt da Tarefa</label>
 <textarea value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder="Ex: Write an informal email to a friend or give a 2-minute presentation..." rows={3} style={{ ...S.input, resize: 'none', lineHeight: 1.6 }} />
 </div>
 <div>
 <label style={S.label}>Nível CEFR</label>
 <select value={level} onChange={e => setLevel(e.target.value)} style={S.select}>
 {['A1','A2','B1','B2','C1','C2'].map(l => <option key={l}>{l}</option>)}
 </select>
 </div>
 </div>

 {/* IA Selector */}
 <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(44,26,14,0.06)', border: '1px solid #ede8dc' }}>
 <label style={S.label}>IA para Geração</label>
 <select value={selectedApi} onChange={e => setSelectedApi(e.target.value)} style={S.select}>
 {apis.length === 0 ? <option value="manual">Manual Copy (Free Mode)</option> : apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
 </select>
 </div>

 <Button
   variant="primary"
   size="lg"
   fullWidth
   loading={loading}
   disabled={loading}
   icon={<i className="ti ti-table" style={{ fontSize: 18 }} />}
   onClick={generate}
   aria-label="Gerar Matriz Completa de Rubrica"
 >
   {loading ? 'Gerando Matriz Cambridge...' : 'Gerar Matriz Completa de Rubrica'}
 </Button>
 </div>

 {/* RIGHT PANEL: Canvas do Documento */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
 {manualPrompt && (
 <div style={{ background: '#fdf8f2', border: '1px solid rgba(181,137,0,0.3)', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
 <span style={{ fontSize: 13, fontWeight: 600, color: '#b58900' }}>Copie e cole em qualquer IA</span>
 <button onClick={() => navigator.clipboard.writeText(manualPrompt)} style={{ padding: '6px 14px', background: '#b58900', color: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Copiar</button>
 </div>
 <div style={{ fontSize: 11, color: '#7a5c42', maxHeight: 80, overflow: 'auto', fontFamily: 'monospace', background: '#fff', borderRadius: RADIUS.md, padding: 10 }}>{manualPrompt}</div>
 </div>
 )}
 <div style={{ flex: 1, borderRadius: 20, overflow: 'hidden', border: '1px solid #ede8dc', boxShadow: '0 4px 24px rgba(44,26,14,0.04)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
 {!result && !loading && !manualPrompt ? (
 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a08060', gap: 16 }}>
 <i className="ti ti-table" style={{ fontSize: 56, opacity: 0.3 }} />
 <p style={{ fontSize: 16 }}>Sua Matriz de Rubrica Cambridge aparecerá aqui</p>
 </div>
 ) : loading ? (
 <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <div style={{ width: 56, height: 56, borderRadius: '50%', border: '5px solid #f0e8d8', borderTopColor: '#2c1a0e', animation: 'spin 0.8s linear infinite' }} />
 </div>
 ) : (
 <DocumentCanvas content={result} onContentChange={setResult} headerData={{ school: '', teacher: '', title: `Cambridge Assessment Rubric ${preset.toUpperCase()} (${level})` }} />
 )}
 </div>
 </div>
 </div>
 </div>
 )
}
