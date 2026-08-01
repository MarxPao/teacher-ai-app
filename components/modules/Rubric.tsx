'use client'

import { useState, useEffect, useMemo } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'

interface StudentRecord { id: string; name: string; classId: string; schoolId: string; grades?: Record<string, string> }

const CAMBRIDGE_WRITING_CRITERIA = [
  { key: 'Content',                  icon: 'ti-file-text',     sub: 'Foco na proposta e cumprimento dos pontos exigidos (0-5)' },
  { key: 'Communicative Achievement',icon: 'ti-message-2',     sub: 'Adequação do tom, registro (formal/informal) e clareza (0-5)' },
  { key: 'Organisation',             icon: 'ti-layout-list',   sub: 'Coesão, coerência, parágrafos e conectivos (0-5)' },
  { key: 'Language',                 icon: 'ti-book-2',        sub: 'Amplitude e precisão de vocabulário e gramática (0-5)' },
]

const CAMBRIDGE_SPEAKING_CRITERIA = [
  { key: 'Grammatical Range',        icon: 'ti-grammar',      sub: 'Variedade e precisão de estruturas gramaticais (0-5)' },
  { key: 'Lexical Resource',         icon: 'ti-abc',          sub: 'Amplitude e adequação do repertório de vocabulário (0-5)' },
  { key: 'Discourse Management',     icon: 'ti-wave-sine',    sub: 'Fluência, extensão das respostas e relevância (0-5)' },
  { key: 'Pronunciation',            icon: 'ti-volume',       sub: 'Intonação, acentuação e clareza de sons individuais (0-5)' },
  { key: 'Interactive Communication',icon: 'ti-users',        sub: 'Capacidade de iniciar, manter e concluir discussões (0-5)' },
]

const BANDS = ['Band 5 (Excelente)', 'Band 4 (Bom)', 'Band 3 (Regular)', 'Band 2 (Suficiente)', 'Band 1 (Insuficiente)']

const S = {
  label: { fontSize: 13, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 6 } as React.CSSProperties,
  select: { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const, cursor: 'pointer' },
  input:  { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}

export default function Rubric() {
  const [preset, setPreset]     = useState<'writing' | 'speaking'>('writing')
  const [taskDesc, setTaskDesc] = useState('')
  const [level, setLevel]       = useState('B2')
  const [customPrompt, setCustomPrompt] = useState('')
  const [result, setResult]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [apis, setApis]         = useState<ApiConfig[]>([])
  const [selectedApi, setSelectedApi] = useState<string>('manual')
  const [manualPrompt, setManualPrompt] = useState('')

  // Avaliador de Aluno (Interactive Grader)
  const [students, setStudents]                 = useState<StudentRecord[]>([])
  const [evalStudentId, setEvalStudentId]       = useState<string>('')
  const [evalScores, setEvalScores]             = useState<Record<string, number>>({})
  const [evalTitle, setEvalTitle]               = useState('Cambridge Assessment')
  const [launched, setLaunched]                 = useState(false)

  const activeCriteria = useMemo(() => {
    return preset === 'writing' ? CAMBRIDGE_WRITING_CRITERIA : CAMBRIDGE_SPEAKING_CRITERIA
  }, [preset])

  useEffect(() => {
    const a = localStorage.getItem('teacher_apis')
    if (a) { const p: ApiConfig[] = JSON.parse(a); const act = p.filter(x=>x.active); setApis(act); if(act.length>0) setSelectedApi(act[0].id) }
    
    const st = localStorage.getItem('teacher_students')
    if (st) {
      const parsed = JSON.parse(st)
      setStudents(parsed)
      if (parsed.length > 0) setEvalStudentId(parsed[0].id)
    }
  }, [])

  // Inicializa scores da calculadora
  useEffect(() => {
    const initial: Record<string, number> = {}
    activeCriteria.forEach(c => { initial[c.key] = 4 }) // Band 4 default
    setEvalScores(initial)
    setLaunched(false)
  }, [activeCriteria])

  const totalPossible = activeCriteria.length * 5
  const rawSum        = Object.values(evalScores).reduce((a, b) => a + b, 0)
  const finalGrade    = Number(((rawSum / totalPossible) * 10).toFixed(1))

  function setScore(key: string, val: number) {
    setEvalScores(prev => ({ ...prev, [key]: val }))
    setLaunched(false)
  }

  function launchGradeToStudent() {
    if (!evalStudentId) return
    const idx = students.findIndex(s => s.id === evalStudentId)
    if (idx === -1) return

    const upd = [...students]
    const colName = `${evalTitle} (${preset === 'writing' ? 'Writing' : 'Speaking'})`
    upd[idx].grades = { ...(upd[idx].grades || {}), [colName]: String(finalGrade) }

    setStudents(upd)
    localStorage.setItem('teacher_students', JSON.stringify(upd))

    // Atualiza gbConfig
    const gbConfig = JSON.parse(localStorage.getItem('teacher_gbConfig') || '{"cols":[]}')
    if (!gbConfig.cols.includes(colName)) {
      gbConfig.cols.push(colName)
      localStorage.setItem('teacher_gbConfig', JSON.stringify(gbConfig))
    }

    window.dispatchEvent(new Event('storage'))
    setLaunched(true)
  }

  async function generate() {
    const api = apis.find(a => a.id === selectedApi)
    if (!api) { alert('Nenhuma API configurada.'); return }
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
Style the table with professional Cambridge Assessment styling (border-collapse:collapse, dark teal header #073642, alternating light row backgrounds, padded cells).`

    if (api.provider === 'manual') { setManualPrompt(prompt); setResult('<p style="text-align:center;color:#93a1a1;font-style:italic;padding:40px">Cole aqui a rubrica gerada...</p>'); setLoading(false); return }
    if (!api.key) { alert('Configure a API Key.'); setLoading(false); return }
    try {
      let out = ''
      if (api.provider==='anthropic') { const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':api.key,'anthropic-version':'2023-06-01','anthropic-dangerously-allow-browser':'true'},body:JSON.stringify({model:api.model||'claude-3-5-sonnet-20240620',max_tokens:2500,messages:[{role:'user',content:prompt}]})}); const d=await r.json(); out=d.content?.map((c:{text:string})=>c.text).join('\n')||'' }
      else if (api.provider==='openai') { const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${api.key}`},body:JSON.stringify({model:api.model||'gpt-4o',messages:[{role:'user',content:prompt}]})}); const d=await r.json(); out=d.choices?.[0]?.message?.content||'' }
      else if (api.provider==='gemini') { const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${api.model||'gemini-1.5-pro'}:generateContent?key=${api.key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})}); const d=await r.json(); out=d.candidates?.[0]?.content?.parts?.[0]?.text||'' }
      setResult(out.replace(/^```html\n?/,'').replace(/```$/,'').trim())
    } catch(e:any) { setResult(`<p style="color:#dc322f">Erro: ${e.message}</p>`) }
    setLoading(false)
  }

  const evalStu = students.find(s => s.id === evalStudentId)

  async function handleSaveRubricToDatabase() {
    if (!result) { alert('Gere uma matriz de rubrica primeiro.'); return }
    const { saveRubricToSupabase } = await import('@/lib/supabaseClient')
    await saveRubricToSupabase({
      title: `Matriz de Rubrica Cambridge — ${preset.toUpperCase()} (${level})`,
      type: 'rubric',
      grade: level,
      criteria: activeCriteria,
      content: result
    })
    alert('✅ Rubrica salva com sucesso no Banco de Dados!')
  }

  return (
    <div style={{ padding: '32px 44px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>
            Rubricas Pedagógicas (Cambridge Assessment)
          </h1>
          <p style={{ color: '#586e75', fontSize: 14, marginTop: 4, margin: 0 }}>
            Matrizes analíticas de avaliação Cambridge B1-C2 com descritores de desempenho.
          </p>
        </div>
        {result && (
          <button
            onClick={handleSaveRubricToDatabase}
            style={{
              padding: '9px 16px', borderRadius: 12, border: '1px solid #8b5e3c',
              background: '#8b5e3c', color: '#fff', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(139,94,60,0.2)'
            }}
          >
            <i className="ti ti-database" /> Salvar no Banco de Dados
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 32, flex: 1, minHeight: 0 }}>
        {/* LEFT PANEL */}
        <div style={{ overflowY: 'auto', paddingRight: 8, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Preset Selector */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
              Modalidade de Avaliação ELT
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setPreset('writing')} style={{
                padding: '12px', borderRadius: 12, border: preset === 'writing' ? '2px solid #073642' : '1px solid #e4ddd0',
                background: preset === 'writing' ? '#f0ede4' : '#fff', cursor: 'pointer', textAlign: 'left'
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#073642' }}><i className="ti ti-notebook" style={{ marginRight: 6 }} /> Writing</div>
                <div style={{ fontSize: 11, color: '#93a1a1', marginTop: 2 }}>4 Critérios Cambridge</div>
              </button>

              <button onClick={() => setPreset('speaking')} style={{
                padding: '12px', borderRadius: 12, border: preset === 'speaking' ? '2px solid #073642' : '1px solid #e4ddd0',
                background: preset === 'speaking' ? '#f0ede4' : '#fff', cursor: 'pointer', textAlign: 'left'
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#073642' }}><i className="ti ti-microphone" style={{ marginRight: 6 }} /> Speaking</div>
                <div style={{ fontSize: 11, color: '#93a1a1', marginTop: 2 }}>5 Critérios Cambridge</div>
              </button>
            </div>

            {/* Box de Prompt Personalizado */}
            <div>
              <label style={S.label}>💬 Prompt Personalizado / Diretrizes da IA</label>
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
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                Avaliador do Aluno
              </p>
              <div style={{ background: '#f5f0e8', borderRadius: 12, padding: '4px 12px', textAlign: 'right' }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: finalGrade >= 7 ? '#2d7a00' : '#854d00' }}>{finalGrade}</span>
                <span style={{ fontSize: 10, color: '#93a1a1' }}> / 10</span>
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
              {activeCriteria.map(c => (
                <div key={c.key} style={{ background: '#fdf9f3', borderRadius: 12, padding: '10px 12px', border: '1px solid #ede8dc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 6 }}>
                    <span><i className={`ti ${c.icon}`} style={{ marginRight: 6, color: '#268bd2' }} />{c.key}</span>
                    <span style={{ color: '#268bd2' }}>Band {evalScores[c.key] || 4} / 5</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(b => (
                      <button key={b} onClick={() => setScore(c.key, b)} style={{
                        flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700,
                        background: (evalScores[c.key] || 4) === b ? '#073642' : '#eee8d5',
                        color: (evalScores[c.key] || 4) === b ? '#fff' : '#586e75', cursor: 'pointer',
                      }}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={launchGradeToStudent} disabled={launched || !evalStudentId}
              style={{ ...S.btn, width: '100%', justifyContent: 'center', background: launched ? '#859900' : '#268bd2', color: '#fff' }}>
              <i className={`ti ${launched ? 'ti-check' : 'ti-report-analytics'}`} />
              {launched ? 'Nota Lançada no Gradebook!' : 'Lançar Nota no Gradebook'}
            </button>
          </div>

          {/* Detalhes para a IA */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc' }}>
            <label style={S.label}>IA para Geração</label>
            <select value={selectedApi} onChange={e => setSelectedApi(e.target.value)} style={S.select}>
              {apis.length === 0 ? <option value="manual">Manual Copy (Free Mode)</option> : apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <button onClick={generate} disabled={loading} style={{ padding: '14px', borderRadius: 14, background: loading ? '#93a1a1' : '#073642', color: '#fff', fontSize: 15, fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 16px rgba(7,54,66,0.2)', fontFamily: 'inherit' }}>
            <i className={loading ? 'ti ti-loader' : 'ti ti-table'} style={{ fontSize: 18 }} />
            {loading ? 'Gerando Matriz Cambridge...' : 'Gerar Matriz Completa de Rubrica'}
          </button>
        </div>

        {/* RIGHT PANEL: Canvas do Documento */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
          {manualPrompt && (
            <div style={{ background: '#fdf6e3', border: '1px solid rgba(181,137,0,0.3)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#b58900' }}>Copie e cole em qualquer IA</span>
                <button onClick={() => navigator.clipboard.writeText(manualPrompt)} style={{ padding: '6px 14px', background: '#b58900', color: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Copiar</button>
              </div>
              <div style={{ fontSize: 11, color: '#586e75', maxHeight: 80, overflow: 'auto', fontFamily: 'monospace', background: '#fff', borderRadius: 8, padding: 10 }}>{manualPrompt}</div>
            </div>
          )}
          <div style={{ flex: 1, borderRadius: 20, overflow: 'hidden', border: '1px solid #ede8dc', boxShadow: '0 4px 24px rgba(0,43,54,0.04)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            {!result && !loading && !manualPrompt ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#93a1a1', gap: 16 }}>
                <i className="ti ti-table" style={{ fontSize: 56, opacity: 0.3 }} />
                <p style={{ fontSize: 16 }}>Sua Matriz de Rubrica Cambridge aparecerá aqui</p>
              </div>
            ) : loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', border: '5px solid #eee8d5', borderTopColor: '#073642', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <DocumentCanvas content={result} onContentChange={setResult} headerData={{ school: '', teacher: '', title: `Cambridge Assessment Rubric — ${preset.toUpperCase()} (${level})` }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
