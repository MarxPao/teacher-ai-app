'use client'

import { useState, useEffect } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import VoiceButton from '@/components/VoiceButton'
import { ApiConfig } from '@/components/modules/ApiManager'
import { runFactCheck, FactCheckResult } from '@/lib/factCheck'

const TEMPLATES = [
  { label: 'Bilhete para Pais',      icon: 'ti-mail',         color: '#268bd2' },
  { label: 'Ata de Reunião',         icon: 'ti-clipboard',    color: '#2aa198' },
  { label: 'Comunicado de Evento',   icon: 'ti-calendar-event', color: '#b58900' },
  { label: 'Boletim Narrativo',      icon: 'ti-chart-bar',    color: '#859900' },
  { label: 'Carta de Recomendação',  icon: 'ti-award',        color: '#6c71c4' },
  { label: 'Advertência',            icon: 'ti-alert-circle', color: '#cb4b16' },
  { label: 'Relatório de Progresso', icon: 'ti-user-check',   color: '#2aa198' },
  { label: 'Comunicado Geral',       icon: 'ti-speakerphone', color: '#586e75' },
]
const TONES = ['Formal', 'Cordial', 'Urgente', 'Motivacional', 'Informativo']

const SL = { fontSize: 13, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 6 } as React.CSSProperties
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
      body: JSON.stringify({ model: api.model || 'claude-3-5-sonnet-20241022', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await r.json(); if (d.error) throw new Error(d.error.message)
    return d.content?.map((c: { text: string }) => c.text).join('\n') || ''
  }
  if (api.provider === 'openai' || api.provider === 'deepseek') {
    const baseUrl = api.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
    const r = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` }, body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: prompt }] }) })
    const d = await r.json(); if (d.error) throw new Error(d.error.message)
    return d.choices?.[0]?.message?.content || ''
  }
  if (api.provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${api.model || 'gemini-1.5-pro'}:generateContent?key=${api.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
    const d = await r.json(); if (d.error) throw new Error(d.error.message)
    return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }
  throw new Error('Provedor desconhecido.')
}

export default function Communications() {
  const [template, setTemplate] = useState('Bilhete para Pais')
  const [tone, setTone] = useState('Formal')
  const [studentName, setStudentName] = useState('')
  const [className, setClassName] = useState('')
  const [subject, setSubject] = useState('')
  const [context, setContext] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null)
  const [apis, setApis] = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState('')
  const [config, setConfig] = useState({ school: '', teacher: '' })

  useEffect(() => {
    const a = loadApis(); setApis(a)
    const first = a.find(x => x.active); if (first) setSelectedApiId(first.id)
    setConfig(loadConfig())
  }, [])

  const selectedApi = apis.find(a => a.id === selectedApiId) || apis[0]

  async function generate() {
    if (!selectedApi || selectedApi.provider === 'manual') { setError('Configure uma API de IA para gerar comunicados.'); return }
    setLoading(true); setError(''); setResult(''); setFactCheck(null)
    const prompt = `Você é um secretário escolar experiente. Redija um "${template}" com tom "${tone}".

DADOS:
- Escola: ${config.school || 'Nome da Escola'}
- Professor(a): ${config.teacher || 'Professor(a)'}
- Aluno(a): ${studentName || 'Não especificado'}
- Turma: ${className || 'Não especificada'}
- Disciplina: ${subject || 'Não especificada'}
- Contexto / Informações: ${context || 'Elabore conforme o tipo de comunicado'}

INSTRUÇÕES:
- Use HTML semântico (h2 para título, p para parágrafos)
- Tom: ${tone}
- Inclua local para data, assinatura e carimbo
- Seja claro, respeitoso e profissional
- Máximo 300 palavras para bilhetes, 600 para relatórios e atas

Gere o documento completo agora:`

    try {
      const text = await callApi(selectedApi, prompt)
      setResult(text)
      setFactCheck(null)
      // light fact check
      const fc = await runFactCheck(text, 'Comunicado escolar', template, selectedApi)
      setFactCheck(fc)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido.')
    } finally { setLoading(false) }
  }

  const fcColor = factCheck ? (factCheck.level === 'ok' ? '#859900' : factCheck.level === 'warn' ? '#b58900' : '#dc322f') : '#93a1a1'

  return (
    <div style={{ padding: '28px 36px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1400, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: '#073642', fontStyle: 'italic', margin: 0 }}>Comunicados</h1>
        <p style={{ color: '#586e75', fontSize: 13, marginTop: 4 }}>Gere comunicados e documentos escolares para famílias com IA.</p>
      </div>

      {error && <div style={{ background: 'rgba(220,50,47,0.08)', border: '1px solid rgba(220,50,47,0.2)', borderRadius: 10, padding: '10px 16px', color: '#dc322f', fontSize: 13, marginBottom: 14, flexShrink: 0 }}><i className="ti ti-alert-triangle" /> {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 24, flex: 1, minHeight: 0 }}>
        {/* LEFT */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 32 }}>

          {apis.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
              <label style={SL}>🤖 Modelo</label>
              <select value={selectedApiId} onChange={e => setSelectedApiId(e.target.value)} style={{ ...SI, cursor: 'pointer' }}>
                {apis.filter(a => a.provider !== 'manual').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
            <label style={SL}>📄 Tipo de Comunicado</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {TEMPLATES.map(t => {
                const sel = template === t.label
                return (
                  <button key={t.label} onClick={() => setTemplate(t.label)} style={{
                    padding: '8px 8px', borderRadius: 10, border: sel ? `2px solid ${t.color}` : '1px solid #e8e0d0',
                    background: sel ? t.color : '#f5f0e8', color: sel ? '#fff' : '#586e75',
                    cursor: 'pointer', fontSize: 10.5, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600
                  }}>
                    <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc' }}>
            <label style={SL}>🎨 Tom</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {TONES.map(t => (
                <button key={t} onClick={() => setTone(t)} style={{ padding: '5px 12px', borderRadius: 20, border: tone === t ? '2px solid #073642' : '1px solid #e8e0d0', background: tone === t ? '#073642' : '#f5f0e8', color: tone === t ? '#fff' : '#586e75', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={SL}>ℹ️ Informações</label>
            {[
              { label: 'Nome do Aluno(a)', val: studentName, set: setStudentName, ph: 'Ex: João da Silva' },
              { label: 'Turma / Série',    val: className,   set: setClassName,   ph: 'Ex: 9º Ano A' },
              { label: 'Disciplina',       val: subject,     set: setSubject,     ph: 'Ex: Matemática' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ ...SL, marginBottom: 4 }}>{f.label}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...SI, flex: 1 }} placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)} />
                  <VoiceButton onResult={t => f.set(prev => prev ? prev + ' ' + t : t)} />
                </div>
              </div>
            ))}
            <div>
              <label style={{ ...SL, marginBottom: 4 }}>Contexto adicional</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <textarea style={{ ...SI, height: 80, resize: 'vertical', flex: 1 }} placeholder="Descreva a situação, motivo, detalhes relevantes..." value={context} onChange={e => setContext(e.target.value)} />
                <VoiceButton onResult={t => setContext(prev => prev ? prev + ' ' + t : t)} />
              </div>
            </div>
          </div>

          <button onClick={generate} disabled={loading} style={{
            padding: '14px', background: loading ? '#93a1a1' : 'linear-gradient(135deg, #268bd2, #2aa198)',
            color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 4px 16px rgba(38,139,210,0.25)'
          }}>
            <i className={`ti ${loading ? 'ti-loader-2' : 'ti-mail-forward'}`} style={{ fontSize: 18, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Gerando...' : 'Gerar Comunicado'}
          </button>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          {factCheck && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderRadius: 12, border: `1px solid ${fcColor}33`, flexShrink: 0 }}>
              <i className={`ti ${factCheck.level === 'ok' ? 'ti-shield-check' : 'ti-alert-triangle'}`} style={{ color: fcColor, fontSize: 18 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: fcColor }}>
                {factCheck.level === 'ok' ? `✅ Documento validado — Qualidade ${factCheck.score}/100` : `⚠️ Revisar — ${factCheck.issues.join('; ')}`}
              </span>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <DocumentCanvas
              content={result}
              onContentChange={setResult}
              headerData={{ school: config.school || 'Nome da Escola', teacher: config.teacher || 'Professor(a)', title: template }}
            />
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
