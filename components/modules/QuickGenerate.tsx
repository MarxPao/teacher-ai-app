'use client'

import { useState, useEffect, useCallback } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import VoiceButton from '@/components/VoiceButton'
import { ApiConfig } from '@/components/modules/ApiManager'
import { runFactCheck, FactCheckResult } from '@/lib/factCheck'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { PEDAGOGICAL_METHODOLOGIES, buildMethodologyInstructions } from '@/lib/pedagogicalMethodologies'

const CEFR = ['A1','A2','B1','B2','C1','C2']
const QTYPES = [
  { label: 'Múltipla escolha',     sub: '4 alternativas, A-D',   icon: 'ti-circle-dot' },
  { label: 'Dissertativa',         sub: 'Resposta aberta',        icon: 'ti-writing' },
  { label: 'Verdadeiro / Falso',   sub: 'Afirmações V ou F',      icon: 'ti-toggle-left' },
  { label: 'Lacuna (gap fill)',     sub: 'Complete a frase',       icon: 'ti-dots' },
  { label: 'Correlação',           sub: 'Ligue as colunas',       icon: 'ti-arrows-shuffle' },
  { label: 'Interpretação de texto', sub: 'Baseada em texto',     icon: 'ti-align-left' },
  { label: 'Ordenação',            sub: 'Ordene itens/eventos',   icon: 'ti-sort-ascending' },
  { label: 'Produção textual',     sub: 'Redação / escrita',      icon: 'ti-notebook' },
]
const METHODOLOGIES = ['Cambridge',"Bloom's",'Contextualizada','CLT','CLIL','Sociointeracionista','BNCC','Task-Based']
const GRADES = ['1º Fund.','2º Fund.','3º Fund.','4º Fund.','5º Fund.','6º Fund.','7º Fund.','8º Fund.','9º Fund.','1º Médio','2º Médio','3º Médio']
const NEE_PROFILES = [
  { id: 'dyslexia', label: 'Dislexia',      icon: 'ti-text-size',    color: '#268bd2' },
  { id: 'adhd',     label: 'TDAH',          icon: 'ti-bolt',         color: '#b58900' },
  { id: 'asd',      label: 'TEA',           icon: 'ti-puzzle',       color: '#2aa198' },
  { id: 'low_vis',  label: 'Baixa Visão',   icon: 'ti-eye-off',      color: '#6c71c4' },
  { id: 'gifted',   label: 'Superdotação',  icon: 'ti-star',         color: '#cb4b16' },
]

const SL = { fontSize: 13, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 6 } as React.CSSProperties
const SS = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const }
const SI = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit' }

function loadApis(): ApiConfig[] {
  try { const s = localStorage.getItem('teacher_apis'); return s ? JSON.parse(s).filter((a: ApiConfig) => a.active) : [] } catch { return [] }
}
function loadConfig() {
  try { return JSON.parse(localStorage.getItem('teacher_cfg') || '{}') } catch { return {} }
}

async function callApi(api: ApiConfig, prompt: string): Promise<string> {
  if (api.provider === 'manual') return '__manual__'
  if (!api.key) throw new Error(`API Key não configurada para ${api.name}.`)
  if (api.provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': api.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
      body: JSON.stringify({ model: api.model || 'claude-3-5-sonnet-20241022', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return d.content?.map((c: { text: string }) => c.text).join('\n') || ''
  }
  if (api.provider === 'openai' || api.provider === 'deepseek') {
    const baseUrl = api.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` },
      body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return d.choices?.[0]?.message?.content || ''
  }
  if (api.provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${api.model || 'gemini-1.5-pro'}:generateContent?key=${api.key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }
  throw new Error('Provedor desconhecido.')
}

function buildPrompt(opts: {
  types: string[], cefr: string, grade: string, skill: string, methodology: string[],
  topic: string, qtCount: string, neeProfile: string, customPrompt?: string
}) {
  const neeInstructions: Record<string, string> = {
    dyslexia: 'Adapte para alunos com dislexia: frases curtas (máx 15 palavras), evite negativas duplas, sem itálico no enunciado.',
    adhd: 'Adapte para TDAH: instruções numeradas, uma ação por instrução, destaque em negrito as palavras-chave.',
    asd: 'Adapte para TEA: linguagem literal e objetiva, sem metáforas ou expressões idiomáticas, contexto explícito em cada questão.',
    low_vis: 'Adapte para baixa visão: evite referências visuais ("observe a figura"), use descrições textuais completas.',
    gifted: 'Adapte para superdotação: adicione questões de extensão, conexões interdisciplinares e desafios de pensamento crítico.',
  }

  const methodologyInstructions = buildMethodologyInstructions(opts.methodology)

  return `Você é um professor especialista em pedagogia e metodologia de ensino de inglês (ELT / Metodologias Ativas). Gere uma lista de atividades/questões com as especificações abaixo.

ESPECIFICAÇÕES:
- Série/Nível: ${opts.grade}
- Nível CEFR / Dificuldade: ${opts.cefr}
- Habilidade foco: ${opts.skill}
- Tipos de questão: ${opts.types.join(', ')}
- Metodologias Selecionadas: ${opts.methodology.join(', ')}
- Quantidade: ${opts.qtCount} questões
- Tema/Tópico: ${opts.topic || 'Escolha um tema relevante para o nível'}
${opts.customPrompt ? `\nINSTRUÇÕES ADICIONAIS DO PROFESSOR (PROMPT):\n"${opts.customPrompt}"\n` : ''}
${opts.neeProfile ? `\nADAPTAÇÃO ESPECIAL: ${neeInstructions[opts.neeProfile] || ''}` : ''}
${methodologyInstructions}

REGRAS OBRIGATÓRIAS DE CONSTRUÇÃO:
1. Siga RÍGOROSAMENTE as especificações pedagógicas e fases das metodologias ativas selecionadas.
2. Cada questão de múltipla escolha deve ter exatamente 4 alternativas (A, B, C, D) com apenas UMA correta.
3. Inclua um GABARITO COMENTADO completo no final, fora da prova, claramente separado.
4. Inclua as habilidades BNCC relevantes ao final, no formato: "**Habilidades BNCC:** EF__XX__, EF__XX__".
5. Numere as questões claramente com enunciados contextuais ricos.
6. Use HTML semântico limpo para formatação (h3 para seções, p para enunciados, ol/ul para alternativas).

Gere o conteúdo completo agora:`
}

export default function QuickGenerate() {
  const [types, setTypes]         = useState<string[]>(['Múltipla escolha'])
  const [cefr, setCefr]           = useState('B1')
  const [grade, setGrade]         = useState('9º Fund.')
  const [skill, setSkill]         = useState('Reading')
  const [methodology, setMethodology] = useState<string[]>(['Cambridge'])
  const [topic, setTopic]         = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [qtCount, setQtCount]     = useState('10')
  const [neeProfile, setNeeProfile] = useState('')
  const [result, setResult]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [checking, setChecking]   = useState(false)
  const [config, setConfig]       = useState({ school: '', teacher: '' })
  const [apis, setApis]           = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState<string>('')
  const [manualPrompt, setManualPrompt] = useState('')
  const [error, setError]         = useState('')
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null)
  const [bnccTags, setBnccTags]   = useState<string[]>([])
  const [showNeePanel, setShowNeePanel] = useState(false)

  // Salvos
  const [showSaved, setShowSaved]   = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  const updateSavedCount = () => {
    try {
      const items = JSON.parse(localStorage.getItem('teacher_saved_quicks') || '[]')
      setSavedCount(items.length)
    } catch { setSavedCount(0) }
  }

  useEffect(() => {
    updateSavedCount()
    window.addEventListener('storage', updateSavedCount)
    return () => window.removeEventListener('storage', updateSavedCount)
  }, [])

  useEffect(() => {
    setConfig(loadConfig())
    const a = loadApis(); setApis(a)
    const firstActive = a.find(x => x.active)
    if (firstActive) setSelectedApiId(firstActive.id)
  }, [])

  const selectedApi = apis.find(a => a.id === selectedApiId) || apis[0]
  const isManual = selectedApi?.provider === 'manual'

  const toggleType = (t: string) => setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const toggleMethod = (m: string) => setMethodology(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  // Extract BNCC tags from result text
  const extractBncc = useCallback((text: string) => {
    const matches = text.match(/EF\d{2}[A-Z]{2}\d{2}/g) || []
    setBnccTags([...new Set(matches)])
  }, [])

  async function handleGenerate() {
    if (!selectedApi) { setError('Nenhuma API ativa. Vá em "APIs & Modelos".'); return }
    setLoading(true); setError(''); setResult(''); setFactCheck(null); setBnccTags([])
    try {
      const prompt = buildPrompt({ types, cefr, grade, skill, methodology, topic, qtCount, neeProfile, customPrompt })
      if (isManual) {
        setManualPrompt(prompt); setLoading(false); return
      }
      const text = await callApi(selectedApi, prompt)
      setResult(text)
      extractBncc(text)
      // Auto fact-check after generation
      setChecking(true)
      const fc = await runFactCheck(text, grade, types.join(', '), selectedApi)
      setFactCheck(fc)
      setChecking(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido.')
    } finally {
      setLoading(false)
    }
  }

  const fcColor = factCheck
    ? factCheck.level === 'ok' ? '#859900'
    : factCheck.level === 'warn' ? '#b58900'
    : '#dc322f'
    : '#93a1a1'

  function handleSaveQuick() {
    if (!result) { alert('Gere ou cole um conteúdo primeiro.'); return }
    const saved = saveItemToStorage('teacher_saved_quicks', {
      title: topic ? `Exercício — ${topic}` : `Atividade (${skill})`,
      subtitle: `${cefr} · ${grade} · ${types.join(', ')}`,
      content: result,
    })
    if (saved) {
      updateSavedCount()
      alert('✅ Exercício salvo em "Exercícios Salvos"!')
    }
  }

  return (
    <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1500, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>
            Gerador Rápido (Express)
          </h1>
          <p style={{ color: '#586e75', fontSize: 14, marginTop: 4 }}>
            Crie listas de exercícios em segundos com checagem pedagógica e salvamento.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {result && (
            <button onClick={handleSaveQuick} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #859900', background: 'rgba(133,153,0,0.1)', color: '#859900', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-device-floppy" /> 💾 Salvar Exercício
            </button>
          )}
          <button onClick={() => setShowSaved(true)} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #073642', background: '#fdf9f3', color: '#073642', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-bookmark" style={{ color: '#b58900' }} /> 📁 Salvos ({savedCount})
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <div style={{ background: 'rgba(220,50,47,0.08)', border: '1px solid rgba(220,50,47,0.2)', borderRadius: 10, padding: '10px 16px', color: '#dc322f', fontSize: 13, marginBottom: 14, flexShrink: 0 }}><i className="ti ti-alert-triangle" /> {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 24, flex: 1, minHeight: 0 }}>
        {/* LEFT PANEL */}
        <div style={{ overflowY: 'auto', paddingRight: 6, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* API Selector */}
          {apis.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
              <label style={SL}>🤖 Modelo de IA</label>
              <select value={selectedApiId} onChange={e => setSelectedApiId(e.target.value)} style={SS}>
                {apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {/* Topic & Custom Prompt Box */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={SL}>📌 Tema / Tópico Principal</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="Ex: Simple Past, Present Perfect, Meio Ambiente..."
                  style={SI} />
                <VoiceButton onResult={t => setTopic(prev => prev ? prev + ' ' + t : t)} />
              </div>
            </div>

            <div>
              <label style={SL}>💬 Prompt Personalizado / Diretrizes da IA</label>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Insira orientações ou prompts específicos para esta geração ex: focar em falso cognatos, usar tirinhas..."
                rows={3}
                style={{ ...SI, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Grade + Level */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={SL}>📚 Série</label>
              <select value={grade} onChange={e => setGrade(e.target.value)} style={SS}>{GRADES.map(g => <option key={g}>{g}</option>)}</select>
            </div>
            <div>
              <label style={SL}>📊 CEFR</label>
              <select value={cefr} onChange={e => setCefr(e.target.value)} style={SS}>{CEFR.map(c => <option key={c}>{c}</option>)}</select>
            </div>
          </div>

          {/* Quantity */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
            <label style={SL}>🔢 Quantidade de questões: <strong>{qtCount}</strong></label>
            <input type="range" min="3" max="30" value={qtCount} onChange={e => setQtCount(e.target.value)}
              style={{ width: '100%', accentColor: '#073642' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#93a1a1', marginTop: 4 }}>
              <span>3</span><span>30</span>
            </div>
          </div>

          {/* Question Types */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
            <label style={SL}>📝 Tipos de questão</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {QTYPES.map(qt => {
                const sel = types.includes(qt.label)
                return (
                  <button key={qt.label} onClick={() => toggleType(qt.label)} style={{
                    padding: '8px 10px', borderRadius: 10, border: sel ? '2px solid #073642' : '1px solid #e8e0d0',
                    background: sel ? '#073642' : '#f5f0e8', color: sel ? '#fff' : '#586e75',
                    cursor: 'pointer', fontSize: 11, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <i className={`ti ${qt.icon}`} /> {qt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Methodologies */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={SL}>🧪 Metodologias Ativas & Abordagens</label>
              <span style={{ fontSize: 11, color: '#93a1a1' }}>{methodology.length} selecionada(s)</span>
            </div>

            {(['Metodologias Ativas', 'Abordagens ELT', 'Marcos & Taxonomias'] as const).map(cat => {
              const items = PEDAGOGICAL_METHODOLOGIES.filter(m => m.category === cat)
              return (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#93a1a1', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 6 }}>
                    {cat}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {items.map(m => {
                      const sel = methodology.includes(m.name) || methodology.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleMethod(m.name)}
                          title={m.description}
                          style={{
                            padding: '4px 10px', borderRadius: 14,
                            border: sel ? `1.5px solid ${m.badgeColor}` : '1px solid #e8e0d0',
                            background: sel ? m.badgeColor : '#f5f0e8',
                            color: sel ? '#fff' : '#586e75',
                            cursor: 'pointer', fontSize: 11, fontWeight: 600,
                            transition: 'all 0.15s',
                          }}
                        >
                          {m.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* NEE Panel */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showNeePanel ? 12 : 0 }}>
              <label style={{ ...SL, marginBottom: 0 }}>♿ Adaptação NEE</label>
              <button onClick={() => setShowNeePanel(!showNeePanel)} style={{
                padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: showNeePanel ? '#073642' : '#f5f0e8', color: showNeePanel ? '#fff' : '#586e75'
              }}>{showNeePanel ? 'Ocultar' : 'Ativar'}</button>
            </div>
            {showNeePanel && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                <button onClick={() => setNeeProfile('')} style={{
                  padding: '5px 12px', borderRadius: 20, border: !neeProfile ? '2px solid #073642' : '1px solid #e8e0d0',
                  background: !neeProfile ? '#073642' : '#f5f0e8', color: !neeProfile ? '#fff' : '#586e75',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600
                }}>Padrão</button>
                {NEE_PROFILES.map(p => (
                  <button key={p.id} onClick={() => setNeeProfile(p.id)} style={{
                    padding: '5px 12px', borderRadius: 20, border: neeProfile === p.id ? `2px solid ${p.color}` : '1px solid #e8e0d0',
                    background: neeProfile === p.id ? p.color : '#f5f0e8', color: neeProfile === p.id ? '#fff' : '#586e75',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5
                  }}><i className={`ti ${p.icon}`} /> {p.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              padding: '14px 24px', background: loading ? '#93a1a1' : 'linear-gradient(135deg, #073642, #0a4a5e)',
              color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 10, boxShadow: '0 4px 16px rgba(7,54,66,0.25)'
            }}
          >
            <i className={`ti ${loading ? 'ti-loader-2' : 'ti-sparkles'}`} style={{ fontSize: 18, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Gerando...' : 'Gerar Atividade'}
          </button>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

          {/* Fact Check Badge */}
          {(checking || factCheck) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              background: '#fff', borderRadius: 12, border: `1px solid ${fcColor}33`, flexShrink: 0
            }}>
              {checking
                ? <><i className="ti ti-loader-2" style={{ color: '#93a1a1', animation: 'spin 1s linear infinite' }} /> <span style={{ fontSize: 13, color: '#93a1a1' }}>Verificando qualidade do conteúdo...</span></>
                : factCheck && (
                  <>
                    <i className={`ti ${factCheck.level === 'ok' ? 'ti-shield-check' : factCheck.level === 'warn' ? 'ti-alert-triangle' : 'ti-shield-x'}`} style={{ color: fcColor, fontSize: 20 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: fcColor }}>
                        {factCheck.level === 'ok' ? `✅ Conteúdo validado — Qualidade ${factCheck.score}/100` :
                         factCheck.level === 'warn' ? `⚠️ Revisar — Qualidade ${factCheck.score}/100` :
                         `🚨 Problemas encontrados — Qualidade ${factCheck.score}/100`}
                      </span>
                      {factCheck.issues.length > 0 && (
                        <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', fontSize: 12, color: '#586e75' }}>
                          {factCheck.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                        </ul>
                      )}
                    </div>
                  </>
                )}
            </div>
          )}

          {/* BNCC Tags */}
          {bnccTags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#586e75' }}>BNCC:</span>
              {bnccTags.map(tag => (
                <span key={tag} title="Habilidade BNCC identificada" style={{
                  padding: '3px 10px', borderRadius: 20, background: 'rgba(133,153,0,0.12)',
                  border: '1px solid rgba(133,153,0,0.3)', color: '#859900', fontSize: 11, fontWeight: 700
                }}>{tag}</span>
              ))}
            </div>
          )}

          {/* Manual prompt area */}
          {isManual && manualPrompt && (
            <div style={{ background: '#fdf6e3', border: '1px solid #b58900', borderRadius: 14, padding: 16, flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#b58900' }}>📋 Prompt gerado — Copie e cole no ChatGPT/Claude</span>
                <button onClick={() => navigator.clipboard.writeText(manualPrompt)} style={{ padding: '4px 12px', background: '#b58900', color: '#fff', border: 'none', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  <i className="ti ti-copy" /> Copiar
                </button>
              </div>
              <textarea value={manualPrompt} readOnly style={{ width: '100%', height: 120, resize: 'none', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: '#073642', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              <div style={{ marginTop: 10 }}>
                <label style={{ ...SL, marginBottom: 4 }}>Cole a resposta aqui:</label>
                <textarea
                  value={result}
                  onChange={e => { setResult(e.target.value); extractBncc(e.target.value) }}
                  style={{ ...SI, height: 80, resize: 'vertical' }}
                  placeholder="Cole aqui o conteúdo gerado pelo ChatGPT..."
                />
              </div>
            </div>
          )}

          {/* Document Canvas */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <DocumentCanvas
              content={result}
              onContentChange={setResult}
              headerData={{ school: config.school || 'Nome da Escola', teacher: config.teacher || 'Professor(a)', title: topic || 'Atividade Gerada' }}
            />
          </div>
        </div>
      </div>

      {/* Drawer de Salvos */}
      <SavedItemsDrawer
        isOpen={showSaved}
        onClose={() => setShowSaved(false)}
        title="Exercícios Salvos"
        storageKey="teacher_saved_quicks"
        onSelect={(item: SavedItem) => setResult(item.content)}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
