'use client'

import { useState, useEffect, useCallback } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import VoiceButton from '@/components/VoiceButton'
import { ApiConfig } from '@/components/modules/ApiManager'
import { runFactCheck, FactCheckResult } from '@/lib/factCheck'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { PEDAGOGICAL_METHODOLOGIES, buildMethodologyInstructions } from '@/lib/pedagogicalMethodologies'
import PresetSelector from '@/components/PresetSelector'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RepositoryItem {
  id: number
  title: string
  content: string
  date: string
  type: string
  category?: string
  textbook?: string
}

interface HeaderState {
  school: string
  teacher: string
  classGroup: string
  title: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const QTYPES = [
  { label: 'Múltipla escolha',       sub: '4 alternativas, A-D',      icon: 'ti-circle-dot' },
  { label: 'Dissertativa',           sub: 'Resposta aberta',           icon: 'ti-writing' },
  { label: 'Verdadeiro / Falso',     sub: 'Afirmações V ou F',         icon: 'ti-toggle-left' },
  { label: 'Lacuna (gap fill)',       sub: 'Complete a frase',          icon: 'ti-dots' },
  { label: 'Correlação',             sub: 'Ligue as colunas',          icon: 'ti-arrows-shuffle' },
  { label: 'Interpretação de texto', sub: 'Baseada em texto',          icon: 'ti-align-left' },
  { label: 'Ordenação',              sub: 'Ordene itens/eventos',      icon: 'ti-sort-ascending' },
  { label: 'Produção textual',       sub: 'Redação / escrita',         icon: 'ti-notebook' },
]
const GRADES = [
  '1º Fund.', '2º Fund.', '3º Fund.', '4º Fund.', '5º Fund.',
  '6º Fund.', '7º Fund.', '8º Fund.', '9º Fund.',
  '1º Médio', '2º Médio', '3º Médio',
]
const NEE_PROFILES = [
  { id: 'dyslexia', label: 'Dislexia',     icon: 'ti-text-size',  color: '#268bd2' },
  { id: 'adhd',     label: 'TDAH',         icon: 'ti-bolt',       color: '#b58900' },
  { id: 'asd',      label: 'TEA',          icon: 'ti-puzzle',     color: '#2aa198' },
  { id: 'low_vis',  label: 'Baixa Visão',  icon: 'ti-eye-off',    color: '#6c71c4' },
  { id: 'gifted',   label: 'Superdotação', icon: 'ti-star',       color: '#cb4b16' },
]

// ─── Style helpers ───────────────────────────────────────────────────────────

const SL: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 6 }
const SS: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const }
const SI: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit' }
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 12 }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadApis(): ApiConfig[] {
  try {
    const { getAvailableApisForSelect } = require('@/lib/autoApiSelector')
    return getAvailableApisForSelect()
  } catch { return [] }
}

function loadConfig(): { school: string; teacher: string } {
  try { return JSON.parse(localStorage.getItem('teacher_cfg') || '{}') } catch { return { school: '', teacher: '' } }
}

function loadLibrary(): RepositoryItem[] {
  try { return JSON.parse(localStorage.getItem('teacher_library') || '[]') } catch { return [] }
}

async function callApi(api: ApiConfig, prompt: string): Promise<string> {
  const { executeUnifiedAiCall } = await import('@/lib/autoApiSelector')
  return executeUnifiedAiCall(api, prompt)
}

function cleanHtml(raw: string): string {
  return raw
    .replace(/^```html\n?/i, '')
    .replace(/^```\n?/, '')
    .replace(/```$/, '')
    .trim()
}

function buildPrompt(opts: {
  types: string[]
  cefr: string
  grade: string
  skill: string
  methodology: string[]
  topic: string
  qtCount: string
  neeProfile: string
  customPrompt?: string
  libraryContext?: string
  header: HeaderState
}) {
  const neeInstructions: Record<string, string> = {
    dyslexia: 'Adapte para alunos com dislexia: frases curtas (máx 15 palavras), evite negativas duplas, sem itálico no enunciado.',
    adhd:     'Adapte para TDAH: instruções numeradas, uma ação por instrução, destaque em negrito as palavras-chave.',
    asd:      'Adapte para TEA: linguagem literal e objetiva, sem metáforas ou expressões idiomáticas, contexto explícito em cada questão.',
    low_vis:  'Adapte para baixa visão: evite referências visuais ("observe a figura"), use descrições textuais completas.',
    gifted:   'Adapte para superdotação: adicione questões de extensão, conexões interdisciplinares e desafios de pensamento crítico.',
  }

  const methodologyInstructions = buildMethodologyInstructions(opts.methodology)

  const librarySection = opts.libraryContext
    ? `\n=== CONTEXTO DA BIBLIOTECA — USE COMO FONTE PRINCIPAL ===\n${opts.libraryContext.slice(0, 4000)}\n=== FIM DO CONTEXTO ===\nIMPORTANTE: Baseie as questões DIRETAMENTE nos textos, diálogos e exemplos acima. Cite trechos reais do material quando pertinente.\n`
    : ''

  return `Você é um professor especialista em ELT (English Language Teaching) e pedagogia. Sua tarefa é gerar um EXERCÍCIO COMPLETO formatado em HTML, pronto para uso em sala de aula.
${librarySection}
ESPECIFICAÇÕES DO EXERCÍCIO:
- Escola: ${opts.header.school || 'Escola'}
- Professor(a): ${opts.header.teacher || 'Professor(a)'}
- Turma: ${opts.header.classGroup || opts.grade}
- Série/Nível: ${opts.grade}
- Nível CEFR: ${opts.cefr}
- Habilidade foco: ${opts.skill}
- Tipos de questão: ${opts.types.join(', ')}
- Metodologias: ${opts.methodology.join(', ')}
- Quantidade: ${opts.qtCount} questões
- Tema/Tópico: ${opts.topic || 'tema relevante para o nível'}
${opts.customPrompt ? `\nDIRETRIZES DO PROFESSOR:\n"${opts.customPrompt}"\n` : ''}
${opts.neeProfile ? `\nADAPTAÇÃO ESPECIAL: ${neeInstructions[opts.neeProfile] || ''}` : ''}
${methodologyInstructions}

REGRAS ABSOLUTAS DE SAÍDA:
1. Retorne APENAS HTML limpo. PROIBIDO usar markdown, blocos \`\`\`, asteriscos ou qualquer outra sintaxe que não seja HTML.
2. Use apenas estas tags: h2, h3, p, ul, ol, li, strong, em, table, thead, tbody, tr, td, th, hr, br, blockquote, span.
3. NÃO inclua <!DOCTYPE>, <html>, <head>, <body> — apenas o conteúdo interno.
4. Comece diretamente com <h2> do título do exercício (sem o cabeçalho da escola, pois ele é gerado automaticamente).
5. Cada questão deve ter enunciado rico e contextualizado. Questões de múltipla escolha: exatamente 4 alternativas (A, B, C, D).
6. Ao final, inclua um <h2>Gabarito Comentado</h2> com as respostas e justificativas pedagógicas.
7. Inclua as habilidades BNCC ao final no formato: <p><strong>Habilidades BNCC:</strong> EF09LI14, EF09LI15</p>
8. O HTML gerado será renderizado diretamente em um editor — deve estar 100% pronto e completo.

Gere agora o exercício completo:`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function QuickGenerate() {
  // Form
  const [types, setTypes]       = useState<string[]>(['Múltipla escolha'])
  const [cefr, setCefr]         = useState('B1')
  const [grade, setGrade]       = useState('9º Fund.')
  const [skill, setSkill]       = useState('Reading')
  const [methodology, setMethodology] = useState<string[]>(['Cambridge'])
  const [topic, setTopic]       = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [qtCount, setQtCount]   = useState('10')
  const [neeProfile, setNeeProfile] = useState('')
  const [showNeePanel, setShowNeePanel] = useState(false)

  // Header
  const [header, setHeader] = useState<HeaderState>({ school: '', teacher: '', classGroup: '', title: '' })

  // Library / RAG
  const [libraryItems, setLibraryItems] = useState<RepositoryItem[]>([])
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null)
  const [showLibraryPreview, setShowLibraryPreview] = useState(false)

  // Generation
  const [result, setResult]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError]       = useState('')
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null)
  const [bnccTags, setBnccTags] = useState<string[]>([])

  // API
  const [apis, setApis]         = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState<string>('')

  // Saved
  const [showSaved, setShowSaved] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  // Header toggle
  const [hideHeader, setHideHeader] = useState(false)

  const updateSavedCount = () => {
    try { setSavedCount(JSON.parse(localStorage.getItem('teacher_saved_quicks') || '[]').length) } catch { setSavedCount(0) }
  }

  useEffect(() => {
    updateSavedCount()
    window.addEventListener('storage', updateSavedCount)
    return () => window.removeEventListener('storage', updateSavedCount)
  }, [])

  useEffect(() => {
    const cfg = loadConfig()
    const a   = loadApis()
    const lib = loadLibrary()
    setHeader(h => ({ ...h, school: cfg.school || '', teacher: cfg.teacher || '' }))
    setApis(a)
    if (a.length > 0) setSelectedApiId(a[0].id)
    setLibraryItems(lib)
  }, [])

  useEffect(() => {
    const handleQuickPrefill = () => {
      try {
        const raw = localStorage.getItem('teacher_quick_prefill')
        if (raw) {
          const prefill = JSON.parse(raw)
          if (prefill.topic) {
            setTopic(prefill.topic)
            setTimeout(() => {
              document.getElementById('quick-generate-btn')?.click()
            }, 600)
          }
          localStorage.removeItem('teacher_quick_prefill')
        }
      } catch { /* ignore */ }
    }

    handleQuickPrefill()
    window.addEventListener('teacher:quick_prefill', handleQuickPrefill)
    return () => window.removeEventListener('teacher:quick_prefill', handleQuickPrefill)
  }, [])

  const selectedApi     = apis.find(a => a.id === selectedApiId) || apis[0]
  const selectedLibItem = libraryItems.find(i => i.id === selectedLibraryId) || null
  const hasApi          = !!selectedApi && selectedApi.provider !== 'manual'

  const toggleType   = (t: string) => setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const toggleMethod = (m: string) => setMethodology(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const extractBncc = useCallback((text: string) => {
    const matches = text.match(/EF\d{2}[A-Z]{2}\d{2}/g) || []
    setBnccTags([...new Set(matches)])
  }, [])

  async function handleGenerate() {
    if (!selectedApi) { setError('Nenhuma API ativa. Vá em "APIs & Modelos".'); return }
    if (selectedApi.provider === 'manual') { setError('Configure uma API com chave válida em "APIs & Modelos" para gerar automaticamente.'); return }
    setLoading(true); setError(''); setResult(''); setFactCheck(null); setBnccTags([])

    const effectiveTitle = topic || `Exercício ${cefr} — ${grade}`
    setHeader(h => ({ ...h, title: h.title || effectiveTitle }))

    try {
      const prompt = buildPrompt({
        types, cefr, grade, skill, methodology, topic, qtCount, neeProfile, customPrompt,
        header: { ...header, title: header.title || effectiveTitle },
        libraryContext: selectedLibItem?.content,
      })
      const raw  = await callApi(selectedApi, prompt)
      const html = cleanHtml(raw)
      setResult(html)
      extractBncc(html)
      try {
        const fc = await runFactCheck(html, grade, types.join(', '), selectedApi)
        setFactCheck(fc)
      } catch { /* non-critical */ }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido.')
    } finally {
      setLoading(false)
    }
  }

  function handleSave() {
    if (!result) { alert('Gere um exercício primeiro.'); return }
    const saved = saveItemToStorage('teacher_saved_quicks', {
      title:    header.title || (topic ? `Exercício — ${topic}` : `Atividade (${skill})`),
      subtitle: `${cefr} · ${grade} · ${types.slice(0, 2).join(', ')}`,
      content:  result,
    })
    if (saved) { updateSavedCount(); alert('✅ Exercício salvo!') }
  }

  async function handleSaveToActivitiesBank() {
    if (!result) { alert('Gere um exercício primeiro.'); return }
    const { saveActivityToSupabase } = await import('@/lib/supabaseClient')
    const title = header.title || (topic ? `Exercício — ${topic}` : `Atividade (${skill})`)
    await saveActivityToSupabase({
      title,
      type: 'exercise',
      grade,
      cefr,
      content: result
    })
    alert('✅ Exercício salvo com sucesso no Banco de Dados!')
  }

  const fcColor = factCheck
    ? factCheck.level === 'ok'   ? '#859900'
    : factCheck.level === 'warn' ? '#b58900'
    : '#dc322f'
    : '#93a1a1'

  return (
    <div style={{ padding: '32px 44px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>
            Gerar Exercício
          </h1>
          <p style={{ color: '#586e75', fontSize: 14, marginTop: 4, margin: 0 }}>
            Exercícios pedagógicos prontos com fonte da Biblioteca e cabeçalho editável.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {result && (
            <>
              <button onClick={handleSaveToActivitiesBank} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #8b5e3c', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(139,94,60,0.2)' }}>
                <i className="ti ti-database" /> Salvar no Banco de Dados
              </button>
            </>
          )}
          <button onClick={() => setShowSaved(true)} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #073642', background: '#fdf9f3', color: '#073642', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-bookmark" style={{ color: '#b58900' }} /> Salvos ({savedCount})
          </button>
        </div>
      </div>

      {/* ── Seletor de Presets Salvos (Modelos do Professor) ── */}
      <PresetSelector
        module="quick"
        currentConfig={{
          topic, types, cefr, grade, skill, methodology, qtCount, neeProfile, customPrompt, selectedApiId
        }}
        onLoadPreset={(config: Record<string, any>) => {
          if (config.topic) setTopic(config.topic)
          if (config.types) setTypes(config.types)
          if (config.cefr) setCefr(config.cefr)
          if (config.grade) setGrade(config.grade)
          if (config.skill) setSkill(config.skill)
          if (config.methodology) setMethodology(config.methodology)
          if (config.qtCount) setQtCount(config.qtCount)
          if (config.neeProfile) setNeeProfile(config.neeProfile)
          if (config.customPrompt) setCustomPrompt(config.customPrompt)
          if (config.selectedApiId) setSelectedApiId(config.selectedApiId)
        }}
      />

      {/* ── Error ── */}
      {error && (
        <div style={{ background: 'rgba(220,50,47,0.08)', border: '1px solid rgba(220,50,47,0.2)', borderRadius: 10, padding: '10px 16px', color: '#dc322f', fontSize: 13, marginBottom: 14, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: 24, flex: 1, minHeight: 0 }}>

        {/* ══ LEFT PANEL ══ */}
        <div style={{ overflowY: 'auto', paddingRight: 6, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* API Selector */}
          {apis.length > 0 && (
            <div style={CARD}>
              <label style={SL}>🤖 Modelo de IA</label>
              <select value={selectedApiId} onChange={e => setSelectedApiId(e.target.value)} style={SS}>
                {apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {!hasApi && (
                <div style={{ fontSize: 12, color: '#b58900', background: 'rgba(181,137,0,0.08)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-alert-triangle" /> Modo manual — adicione uma API key para gerar automaticamente.
                </div>
              )}
            </div>
          )}
          {apis.length === 0 && (
            <div style={{ ...CARD, background: 'rgba(181,137,0,0.06)', border: '1px solid rgba(181,137,0,0.25)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <i className="ti ti-alert-circle" style={{ color: '#b58900', fontSize: 20 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#b58900' }}>Nenhuma API configurada</div>
                  <div style={{ fontSize: 12, color: '#586e75', marginTop: 2 }}>Vá em <strong>APIs & Modelos</strong> para configurar uma chave de IA e gerar exercícios automaticamente.</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Biblioteca (RAG) ── */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...SL, marginBottom: 0 }}>
                <i className="ti ti-books" style={{ marginRight: 6, color: '#2aa198' }} />
                Fonte da Biblioteca
              </label>
              {selectedLibItem && (
                <button onClick={() => setShowLibraryPreview(!showLibraryPreview)} style={{ fontSize: 11, color: '#2aa198', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {showLibraryPreview ? 'Ocultar' : 'Ver conteúdo'}
                </button>
              )}
            </div>
            <select
              value={selectedLibraryId ?? ''}
              onChange={e => setSelectedLibraryId(e.target.value ? Number(e.target.value) : null)}
              style={SS}
            >
              <option value="">— Sem fonte (tema livre) —</option>
              {libraryItems.map(i => (
                <option key={i.id} value={i.id}>{i.title.replace(/^[^\w]*/, '')}</option>
              ))}
            </select>
            {selectedLibItem && (
              <div style={{ fontSize: 12, color: '#2aa198', background: 'rgba(42,161,152,0.08)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-check" /> A IA usará <strong>"{selectedLibItem.title.replace(/^[^\w]*/, '')}"</strong> como fonte das questões.
              </div>
            )}
            {selectedLibItem && showLibraryPreview && (
              <div style={{ background: '#f5f0e8', borderRadius: 10, padding: 10, maxHeight: 140, overflowY: 'auto', fontSize: 11, color: '#586e75', lineHeight: 1.6, fontFamily: 'monospace' }}>
                {selectedLibItem.content.slice(0, 600)}…
              </div>
            )}
            {libraryItems.length === 0 && (
              <div style={{ fontSize: 12, color: '#93a1a1' }}>
                Nenhum item na Biblioteca. Adicione livros em <strong>Biblioteca</strong> para usar como fonte.
              </div>
            )}
          </div>

          {/* ── Cabeçalho do Documento ── */}
          <div style={CARD}>
            <label style={{ ...SL, marginBottom: 2 }}>
              <i className="ti ti-id-badge" style={{ marginRight: 6, color: '#268bd2' }} />
              Cabeçalho do Documento
            </label>
            <div>
              <label style={{ ...SL, fontSize: 12 }}>Nome da Escola</label>
              <input value={header.school} onChange={e => setHeader(h => ({ ...h, school: e.target.value }))}
                placeholder="Ex: Colégio São Paulo" style={SI} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...SL, fontSize: 12 }}>Professor(a)</label>
                <input value={header.teacher} onChange={e => setHeader(h => ({ ...h, teacher: e.target.value }))}
                  placeholder="Seu nome" style={SI} />
              </div>
              <div>
                <label style={{ ...SL, fontSize: 12 }}>Turma</label>
                <input value={header.classGroup} onChange={e => setHeader(h => ({ ...h, classGroup: e.target.value }))}
                  placeholder="Ex: 9A, 1°EM" style={SI} />
              </div>
            </div>
            <div>
              <label style={{ ...SL, fontSize: 12 }}>Título do Exercício</label>
              <input value={header.title} onChange={e => setHeader(h => ({ ...h, title: e.target.value }))}
                placeholder="Ex: Exercício — Present Perfect" style={SI} />
            </div>
          </div>

          {/* ── Tópico & Prompt ── */}
          <div style={CARD}>
            <div>
              <label style={SL}>📌 Tema / Tópico Principal</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="Ex: Simple Past, Present Perfect, Meio Ambiente…"
                  style={SI} />
                <VoiceButton onResult={t => setTopic(prev => prev ? prev + ' ' + t : t)} />
              </div>
            </div>
            <div>
              <label style={SL}>💬 Diretrizes Adicionais</label>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Ex: incluir pelo menos 2 questões baseadas no Capítulo 3, usar contexto de esportes…"
                rows={3}
                style={{ ...SI, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* ── Grade + CEFR ── */}
          <div style={{ ...CARD, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={SL}>📚 Série</label>
              <select value={grade} onChange={e => setGrade(e.target.value)} style={SS}>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={SL}>📊 CEFR</label>
              <select value={cefr} onChange={e => setCefr(e.target.value)} style={SS}>
                {CEFR.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* ── Skill ── */}
          <div style={CARD}>
            <label style={SL}>🎯 Habilidade Foco</label>
            <select value={skill} onChange={e => setSkill(e.target.value)} style={SS}>
              {['Reading', 'Writing', 'Listening', 'Speaking', 'Grammar', 'Vocabulary', 'Use of English'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* ── Quantity ── */}
          <div style={CARD}>
            <label style={SL}>🔢 Quantidade de questões: <strong>{qtCount}</strong></label>
            <input type="range" min="3" max="30" value={qtCount} onChange={e => setQtCount(e.target.value)}
              style={{ width: '100%', accentColor: '#073642' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#93a1a1' }}>
              <span>3</span><span>30</span>
            </div>
          </div>

          {/* ── Question Types ── */}
          <div style={CARD}>
            <label style={SL}>📝 Tipos de questão</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {QTYPES.map(qt => {
                const sel = types.includes(qt.label)
                return (
                  <button key={qt.label} onClick={() => toggleType(qt.label)} style={{
                    padding: '8px 10px', borderRadius: 10,
                    border: sel ? '2px solid #073642' : '1px solid #e8e0d0',
                    background: sel ? '#073642' : '#f5f0e8',
                    color: sel ? '#fff' : '#586e75',
                    cursor: 'pointer', fontSize: 11, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className={`ti ${qt.icon}`} /> {qt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Methodologies ── */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...SL, marginBottom: 0 }}>🧪 Metodologias Ativas</label>
              <span style={{ fontSize: 11, color: '#93a1a1' }}>{methodology.length} selecionada(s)</span>
            </div>
            {(['Metodologias Ativas', 'Abordagens ELT', 'Marcos & Taxonomias'] as const).map(cat => {
              const items = PEDAGOGICAL_METHODOLOGIES.filter(m => m.category === cat)
              return (
                <div key={cat}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#93a1a1', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 6 }}>{cat}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {items.map(m => {
                      const sel = methodology.includes(m.name) || methodology.includes(m.id)
                      return (
                        <button key={m.id} onClick={() => toggleMethod(m.name)} title={m.description} style={{
                          padding: '4px 10px', borderRadius: 14,
                          border: sel ? `1.5px solid ${m.badgeColor}` : '1px solid #e8e0d0',
                          background: sel ? m.badgeColor : '#f5f0e8',
                          color: sel ? '#fff' : '#586e75',
                          cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                        }}>
                          {m.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── NEE ── */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...SL, marginBottom: 0 }}>♿ Adaptação NEE</label>
              <button onClick={() => setShowNeePanel(!showNeePanel)} style={{
                padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: showNeePanel ? '#073642' : '#f5f0e8', color: showNeePanel ? '#fff' : '#586e75',
              }}>{showNeePanel ? 'Ocultar' : 'Ativar'}</button>
            </div>
            {showNeePanel && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                <button onClick={() => setNeeProfile('')} style={{
                  padding: '5px 12px', borderRadius: 20,
                  border: !neeProfile ? '2px solid #073642' : '1px solid #e8e0d0',
                  background: !neeProfile ? '#073642' : '#f5f0e8',
                  color: !neeProfile ? '#fff' : '#586e75',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}>Padrão</button>
                {NEE_PROFILES.map(p => (
                  <button key={p.id} onClick={() => setNeeProfile(p.id)} style={{
                    padding: '5px 12px', borderRadius: 20,
                    border: neeProfile === p.id ? `2px solid ${p.color}` : '1px solid #e8e0d0',
                    background: neeProfile === p.id ? p.color : '#f5f0e8',
                    color: neeProfile === p.id ? '#fff' : '#586e75',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                  }}><i className={`ti ${p.icon}`} /> {p.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* ── Generate Button ── */}
          <button
            id="quick-generate-btn"
            onClick={handleGenerate}
            disabled={loading || !hasApi}
            style={{
              padding: '14px 24px',
              background: loading ? '#93a1a1' : !hasApi ? '#e8e0d0' : 'linear-gradient(135deg, #073642, #0a4a5e)',
              color: !hasApi ? '#93a1a1' : '#fff',
              border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: loading || !hasApi ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: hasApi && !loading ? '0 4px 16px rgba(7,54,66,0.25)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <i className={`ti ${loading ? 'ti-loader-2' : 'ti-sparkles'}`} style={{ fontSize: 18, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Gerando exercício...' : !hasApi ? 'Configure uma API para gerar' : '✨ Gerar Exercício Completo'}
          </button>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

          {/* Quality badge */}
          {(checking || factCheck) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderRadius: 12, border: `1px solid ${fcColor}33`, flexShrink: 0 }}>
              {checking
                ? <><i className="ti ti-loader-2" style={{ color: '#93a1a1', animation: 'spin 1s linear infinite' }} /> <span style={{ fontSize: 13, color: '#93a1a1' }}>Verificando qualidade pedagógica…</span></>
                : factCheck && (
                  <>
                    <i className={`ti ${factCheck.level === 'ok' ? 'ti-shield-check' : factCheck.level === 'warn' ? 'ti-alert-triangle' : 'ti-shield-x'}`} style={{ color: fcColor, fontSize: 20 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: fcColor }}>
                        {factCheck.level === 'ok'   ? `✅ Conteúdo validado — Qualidade ${factCheck.score}/100` :
                         factCheck.level === 'warn'  ? `⚠️ Revisar — Qualidade ${factCheck.score}/100` :
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

          {/* BNCC tags */}
          {bnccTags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#586e75' }}>BNCC:</span>
              {bnccTags.map(tag => (
                <span key={tag} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(133,153,0,0.12)', border: '1px solid rgba(133,153,0,0.3)', color: '#859900', fontSize: 11, fontWeight: 700 }}>{tag}</span>
              ))}
            </div>
          )}

          {/* Library source badge */}
          {selectedLibItem && result && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'rgba(42,161,152,0.08)', border: '1px solid rgba(42,161,152,0.2)', borderRadius: 10, flexShrink: 0 }}>
              <i className="ti ti-books" style={{ color: '#2aa198', fontSize: 16 }} />
              <span style={{ fontSize: 12, color: '#2aa198', fontWeight: 600 }}>
                Gerado com base em: <strong>{selectedLibItem.title.replace(/^[^\w]*/, '')}</strong>
              </span>
            </div>
          )}

          {/* Document Canvas */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <DocumentCanvas
              content={result}
              onContentChange={setResult}
              hideHeader={hideHeader}
              onToggleHeader={() => setHideHeader(h => !h)}
              headerData={{
                school:  header.school  || 'Nome da Escola',
                teacher: header.teacher || 'Professor(a)',
                title:   header.title   || topic || 'Exercício Gerado',
              }}
              onHeaderChange={patch => setHeader(h => ({
                ...h,
                ...(patch.headerSchool  !== undefined ? { school:  patch.headerSchool  } : {}),
                ...(patch.headerTeacher !== undefined ? { teacher: patch.headerTeacher } : {}),
                ...(patch.headerTitle   !== undefined ? { title:   patch.headerTitle   } : {}),
              }))}
            />
          </div>
        </div>
      </div>

      {/* Saved Drawer */}
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
