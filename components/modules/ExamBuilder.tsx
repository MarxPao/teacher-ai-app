'use client'

import { useState, useEffect } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'
import { generateListeningAudio } from '@/lib/audioGenerator'
import AudioPlayerCard from '@/components/AudioPlayerCard'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { PEDAGOGICAL_METHODOLOGIES, buildMethodologyInstructions } from '@/lib/pedagogicalMethodologies'

const CEFR = ['A1','A2','B1','B2','C1','C2']
const SECTIONS = [
  { key: 'Grammar',                 icon: 'ti-book-2',     sub: 'Tenses, Syntax, Conditionals, Reported Speech' },
  { key: 'Vocabulary',              icon: 'ti-abc',        sub: 'Phrasal Verbs, Idioms, Collocations, False Friends' },
  { key: 'Reading Comprehension',    icon: 'ti-align-left', sub: 'Main Idea, Scanning, Inference, Context' },
  { key: 'Listening Comprehension', icon: 'ti-headphones', sub: 'Main Point, Specific Details, Dictation' },
  { key: 'Use of English',           icon: 'ti-pencil',     sub: 'Cloze, Word Formation, Key Word Transformation' },
  { key: 'Writing',                  icon: 'ti-notebook',   sub: 'Essays, Summarization, Emails & Letters' },
  { key: 'Speaking',                 icon: 'ti-microphone', sub: 'Interview, Picture Description, Role-play' },
]
const APPROACHES = ['Cambridge','BNCC','Bloom','CLIL','CLT','Task-Based']
const GRADES = ['6º Fund.','7º Fund.','8º Fund.','9º Fund.','1º Médio','2º Médio','3º Médio']
const S = {
  label: { fontSize: 13, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 6 } as React.CSSProperties,
  select: { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const, cursor: 'pointer' },
  input:  { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit' },
}

export default function ExamBuilder() {
  const [topic, setTopic]       = useState('')
  const [cefr, setCefr]         = useState('B2')
  const [grade, setGrade]       = useState('9º Fund.')
  const [customPrompt, setCustomPrompt] = useState('')
  const [sections, setSections] = useState<string[]>(['Reading Comprehension','Use of English','Writing'])
  const [approach, setApproach] = useState<string[]>(['Cambridge'])
  const [result, setResult]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [apis, setApis]         = useState<ApiConfig[]>([])
  const [selectedApi, setSelectedApi] = useState<string>('manual')
  const [manualPrompt, setManualPrompt] = useState('')

  // Áudio Listening
  const [audioUrl, setAudioUrl]       = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [accent, setAccent]           = useState<'US' | 'UK'>('US')

  // Salvos
  const [showSaved, setShowSaved]     = useState(false)
  const [savedCount, setSavedCount]   = useState(0)

  const updateSavedCount = () => {
    try {
      const items = JSON.parse(localStorage.getItem('teacher_saved_exams') || '[]')
      setSavedCount(items.length)
    } catch { setSavedCount(0) }
  }

  useEffect(() => {
    updateSavedCount()
    window.addEventListener('storage', updateSavedCount)
    return () => window.removeEventListener('storage', updateSavedCount)
  }, [])

  useEffect(() => {
    const a = localStorage.getItem('teacher_apis')
    if (a) { const p: ApiConfig[] = JSON.parse(a); const act = p.filter(x=>x.active); setApis(act); if(act.length>0) setSelectedApi(act[0].id) }
  }, [])

  const toggleSection = (s: string) => setSections(p => p.includes(s) ? p.filter(x=>x!==s) : [...p,s])
  const toggleApproach = (s: string) => setApproach(p => p.includes(s) ? p.filter(x=>x!==s) : [...p,s])

  async function generate() {
    if (!sections.length) { alert('Selecione pelo menos uma seção.'); return }
    const api = apis.find(a => a.id === selectedApi)
    if (!api) { alert('Nenhuma API configurada.'); return }
    setLoading(true); setResult(''); setManualPrompt('')
    const methInstructions = buildMethodologyInstructions(approach)
    const prompt = `You are a professional Cambridge/IELTS examiner and pedagogical specialist. Create a complete English Exam.
Level: ${cefr}. Grade: ${grade}. Topic: ${topic || 'General Knowledge'}.
Sections: ${sections.join(', ')}. Pedagogical approach: ${approach.join(', ')}.
${customPrompt ? `\nINSTRUÇÕES ADICIONAIS / PROMPT DO PROFESSOR:\n"${customPrompt}"\n` : ''}
${methInstructions}
IMPORTANT: Output as clean HTML only (h1,h2,h3,p,ul,li,strong,em,table,tr,td,th). No markdown. Include Teacher Answer Key at end.`

    if (api.provider === 'manual') { setManualPrompt(prompt); setResult('<p style="text-align:center;color:#93a1a1;font-style:italic;padding:40px">Cole aqui o exame gerado...</p>'); setLoading(false); return }
    if (!api.key) { alert('Configure a API Key.'); setLoading(false); return }
    try {
      let out = ''
      if (api.provider === 'anthropic') { const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':api.key,'anthropic-version':'2023-06-01','anthropic-dangerously-allow-browser':'true'},body:JSON.stringify({model:api.model||'claude-3-5-sonnet-20240620',max_tokens:3000,messages:[{role:'user',content:prompt}]})}); const d=await r.json(); if(d.error) throw new Error(d.error.message); out=d.content?.map((c:{text:string})=>c.text).join('\n')||'' }
      else if (api.provider === 'openai') { const r = await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${api.key}`},body:JSON.stringify({model:api.model||'gpt-4o',messages:[{role:'user',content:prompt}]})}); const d=await r.json(); if(d.error) throw new Error(d.error.message); out=d.choices?.[0]?.message?.content||'' }
      else if (api.provider === 'gemini') { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${api.model||'gemini-1.5-pro'}:generateContent?key=${api.key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})}); const d=await r.json(); if(d.error) throw new Error(d.error.message); out=d.candidates?.[0]?.content?.parts?.[0]?.text||'' }
      setResult(out.replace(/^```html\n?/,'').replace(/```$/,'').trim())
    } catch(e:any) { setResult(`<p style="color:#dc322f">Erro: ${e.message}</p>`) }
    setLoading(false)
  }

  async function handleGenerateAudio() {
    if (!result) { alert('Gere a prova primeiro para extrair o texto de listening.'); return }
    setAudioLoading(true)
    try {
      // Tenta encontrar o texto da seção de listening
      const cleanText = result.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 800)
      const res = await generateListeningAudio({ text: cleanText, accent })
      setAudioUrl(res.audioUrl)
    } catch (e: any) {
      alert(`Falha ao gerar áudio: ${e.message}`)
    } finally {
      setAudioLoading(false)
    }
  }

  function handleSaveExam() {
    if (!result) { alert('Gere ou cole uma prova primeiro.'); return }
    const saved = saveItemToStorage('teacher_saved_exams', {
      title: topic ? `Prova — ${topic}` : `Exam (${cefr})`,
      subtitle: `${cefr} · ${grade} · ${sections.slice(0, 2).join(', ')}`,
      content: result,
    })
    if (saved) {
      updateSavedCount()
      alert('✅ Prova salva em "Provas Salvas"!')
    }
  }

  return (
    <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1500, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>Exam Builder</h1>
          <p style={{ color: '#586e75', fontSize: 15, marginTop: 6 }}>Monte e visualize provas completas estruturadas por seções.</p>
        </div>

        <button
          onClick={() => setShowSaved(true)}
          style={{
            padding: '10px 18px', borderRadius: 12, border: '1px solid #073642',
            background: '#fdf9f3', color: '#073642', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <i className="ti ti-bookmark" style={{ color: '#b58900', fontSize: 16 }} />
          📁 Provas Salvas ({savedCount})
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 400px) 1fr', gap: 32, flex: 1, minHeight: 0 }}>
        {/* LEFT */}
        <div style={{ overflowY: 'auto', paddingRight: 8, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Seções da prova */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>Seções da Prova</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {SECTIONS.map(({ key, icon, sub }) => {
                const on = sections.includes(key)
                return (
                  <button key={key} onClick={() => toggleSection(key)} style={{ textAlign:'left', padding: '10px 12px', borderRadius: 12, border: on ? '1.5px solid #073642' : '1.5px solid #e4ddd0', background: on ? '#f0ede4' : '#fdf9f3', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                      <i className={`ti ${icon}`} style={{ fontSize:16, color: on?'#073642':'#93a1a1' }} />
                      <span style={{ fontSize:13, fontWeight:600, color: on?'#073642':'#586e75' }}>{key}</span>
                    </div>
                    <span style={{ fontSize:11, color:'#93a1a1' }}>{sub}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detalhes */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={S.label}>Tópico Central</label>
              <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Ex: Unit 5, Past Perfect, Environment..." style={S.input} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={S.label}>Nível CEFR</label>
                <select value={cefr} onChange={e=>setCefr(e.target.value)} style={S.select}>{CEFR.map(c=><option key={c}>{c}</option>)}</select>
              </div>
              <div>
                <label style={S.label}>Ano / Série</label>
                <select value={grade} onChange={e=>setGrade(e.target.value)} style={S.select}>{GRADES.map(g=><option key={g}>{g}</option>)}</select>
              </div>
            </div>

            {/* Box de Prompt Personalizado */}
            <div>
              <label style={S.label}>💬 Prompt Personalizado / Diretrizes da IA</label>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Insira instruções específicas para a IA ex: incluir 2 questões focadas no capítulo 3, usar contexto de esportes, etc..."
                rows={3}
                style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Abordagem & Metodologias Ativas */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>Metodologias Ativas & Abordagens</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {PEDAGOGICAL_METHODOLOGIES.map(m => {
                const on = approach.includes(m.name) || approach.includes(m.id)
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleApproach(m.name)}
                    title={m.description}
                    style={{
                      padding: '5px 12px', borderRadius: 100,
                      border: on ? `1.5px solid ${m.badgeColor}` : '1.5px solid #ddd6c9',
                      background: on ? m.badgeColor : 'transparent',
                      color: on ? '#fff' : '#586e75',
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      transition: 'all 0.15s', fontFamily: 'inherit'
                    }}
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* IA */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc' }}>
            <label style={S.label}>IA para Geração</label>
            <select value={selectedApi} onChange={e=>setSelectedApi(e.target.value)} style={S.select}>
              {apis.length===0 ? <option value="manual">Manual Copy (Free Mode)</option> : apis.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <button onClick={generate} disabled={loading} style={{ padding:'14px', borderRadius:14, background:loading?'#93a1a1':'#073642', color:'#fff', fontSize:15, fontWeight:700, border:'none', cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, boxShadow:'0 4px 16px rgba(7,54,66,0.2)', fontFamily:'inherit' }}>
            <i className={loading?'ti ti-loader':'ti ti-file-certificate'} style={{ fontSize:18 }} />
            {loading ? 'Construindo Prova...' : 'Gerar Exame Completo'}
          </button>
        </div>

        {/* RIGHT */}
        <div style={{ display:'flex', flexDirection:'column', gap:12, flex:1, minHeight:0 }}>
          {/* Botão de Áudio e Player */}
          {result && (
            <div style={{ background: '#fff', padding: '12px 18px', borderRadius: 16, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-headphones" style={{ fontSize: 22, color: '#268bd2' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>Trilha Sonora para Listening</span>
                <select value={accent} onChange={e => setAccent(e.target.value as 'US' | 'UK')} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12, outline: 'none' }}>
                  <option value="US">🇺🇸 Sotaque Americano (US)</option>
                  <option value="UK">🇬🇧 Sotaque Britânico (UK)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveExam} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #859900', background: 'rgba(133,153,0,0.1)', color: '#859900', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-device-floppy" /> 💾 Salvar Prova
                </button>
                <button onClick={handleGenerateAudio} disabled={audioLoading} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#268bd2', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {audioLoading ? <><i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> Gerando Áudio MP3...</> : <><i className="ti ti-volume" /> 🔊 Gerar Áudio MP3</>}
                </button>
              </div>
            </div>
          )}

          {audioUrl && (
            <AudioPlayerCard audioUrl={audioUrl} title={`Listening Track — ${topic || 'Exam'}`} accent={accent} onDelete={() => setAudioUrl(null)} />
          )}

          {manualPrompt && (
            <div style={{ background:'#fdf6e3', border:'1px solid rgba(181,137,0,0.3)', borderRadius:14, padding:'14px 18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#b58900' }}>Copie e cole em qualquer IA</span>
                <button onClick={()=>navigator.clipboard.writeText(manualPrompt)} style={{ padding:'6px 14px', background:'#b58900', color:'#fff', borderRadius:20, fontSize:12, fontWeight:600, border:'none', cursor:'pointer' }}>Copiar</button>
              </div>
              <div style={{ fontSize:11, color:'#586e75', maxHeight:80, overflow:'auto', fontFamily:'monospace', background:'#fff', borderRadius:8, padding:10 }}>{manualPrompt}</div>
            </div>
          )}
          <div style={{ flex:1, borderRadius:20, overflow:'hidden', border:'1px solid #ede8dc', boxShadow:'0 4px 24px rgba(0,43,54,0.04)', background:'#fff', display:'flex', flexDirection:'column' }}>
            {!result && !loading && !manualPrompt ? (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#93a1a1', gap:16 }}>
                <i className="ti ti-file-certificate" style={{ fontSize:56, opacity:0.3 }} />
                <p style={{ fontSize:16 }}>Seu exame editável aparecerá aqui</p>
              </div>
            ) : loading ? (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ width:56, height:56, borderRadius:'50%', border:'5px solid #eee8d5', borderTopColor:'#073642', animation:'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <DocumentCanvas content={result} onContentChange={setResult} headerData={{ school:'', teacher:'', title:`Exam — ${topic}` }} />
            )}
          </div>
        </div>
      </div>

      {/* Drawer de Provas Salvas */}
      <SavedItemsDrawer
        isOpen={showSaved}
        onClose={() => setShowSaved(false)}
        title="Minhas Provas Salvas"
        storageKey="teacher_saved_exams"
        onSelect={(item: SavedItem) => setResult(item.content)}
      />
    </div>
  )
}
