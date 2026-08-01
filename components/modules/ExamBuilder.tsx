'use client'

import { useState, useEffect } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'
import { generateListeningAudio } from '@/lib/audioGenerator'
import AudioPlayerCard from '@/components/AudioPlayerCard'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { PEDAGOGICAL_METHODOLOGIES, buildMethodologyInstructions } from '@/lib/pedagogicalMethodologies'
import PresetSelector from '@/components/PresetSelector'

// ─── Types ───────────────────────────────────────────────────────────────────

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

const SECTIONS = [
  { key: 'Grammar',                  icon: 'ti-book-2',      sub: 'Tenses, Syntax, Conditionals, Reported Speech' },
  { key: 'Vocabulary',               icon: 'ti-abc',         sub: 'Phrasal Verbs, Idioms, Collocations, False Friends' },
  { key: 'Reading Comprehension',    icon: 'ti-align-left',  sub: 'Main Idea, Scanning, Inference, Context' },
  { key: 'Listening Comprehension',  icon: 'ti-headphones',  sub: 'Main Point, Specific Details, Dictation' },
  { key: 'Use of English',           icon: 'ti-pencil',      sub: 'Cloze, Word Formation, Key Word Transformation' },
  { key: 'Writing',                  icon: 'ti-notebook',    sub: 'Essays, Summarization, Emails & Letters' },
  { key: 'Speaking',                 icon: 'ti-microphone',  sub: 'Interview, Picture Description, Role-play' },
]

const GRADES = [
  '6º Fund.', '7º Fund.', '8º Fund.', '9º Fund.',
  '1º Médio', '2º Médio', '3º Médio',
]

// ─── Style helpers ────────────────────────────────────────────────────────────

const SL: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 6 }
const SS: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const, cursor: 'pointer' }
const SI: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit' }
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 12px rgba(0,43,54,0.06)', border: '1px solid #ede8dc' }

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

function cleanHtml(raw: string): string {
  return raw
    .replace(/^```html\n?/i, '')
    .replace(/^```\n?/, '')
    .replace(/```$/, '')
    .trim()
}

async function callApi(api: ApiConfig, prompt: string): Promise<string> {
  const { executeUnifiedAiCall } = await import('@/lib/autoApiSelector')
  return executeUnifiedAiCall(api, prompt)
}

function buildExamPrompt(opts: {
  topic: string
  cefr: string
  grade: string
  sections: string[]
  approach: string[]
  customPrompt?: string
  libraryContext?: string
  header: HeaderState
}): string {
  const methInstructions = buildMethodologyInstructions(opts.approach)

  const librarySection = opts.libraryContext
    ? `\n=== CONTEXTO DA BIBLIOTECA — USE COMO FONTE PRINCIPAL ===\n${opts.libraryContext.slice(0, 4500)}\n=== FIM DO CONTEXTO ===\nIMPORTANTE: Construa os textos da prova, diálogos, e enunciados DIRETAMENTE com base no material acima. Cite personagens, situações e vocabulário presentes no conteúdo.\n`
    : ''

  return `Você é um examinador profissional Cambridge/IELTS e especialista pedagógico em ELT. Crie uma PROVA COMPLETA de inglês, formatada em HTML, pronta para impressão.
${librarySection}
ESPECIFICAÇÕES DA PROVA:
- Escola: ${opts.header.school || 'Escola'}
- Professor(a): ${opts.header.teacher || 'Professor(a)'}
- Turma: ${opts.header.classGroup || opts.grade}
- Série/Nível: ${opts.grade}
- Nível CEFR: ${opts.cefr}
- Tópico Central: ${opts.topic || 'General Knowledge'}
- Seções: ${opts.sections.join(', ')}
- Abordagem Pedagógica: ${opts.approach.join(', ')}
${opts.customPrompt ? `\nDIRETRIZES DO PROFESSOR:\n"${opts.customPrompt}"\n` : ''}
${methInstructions}

ESTRUTURA OBRIGATÓRIA DA PROVA:
1. Para cada seção selecionada (${opts.sections.join(', ')}), crie um bloco com:
   - Título da seção em <h2>
   - Instruções claras em <p><em>Instructions: ...</em></p>
   - Questões numeradas sequencialmente
   - Espaço para resposta (linha tracejada ou caixa de texto visual)
2. Questões de Múltipla Escolha: exatamente 4 alternativas (A, B, C, D)
3. Questões de Reading: inclua um texto de leitura em <blockquote> antes das questões
4. Questões de Listening: inclua um script de áudio marcado como [AUDIO SCRIPT]
5. Questões de Writing: inclua o enunciado completo com critérios de avaliação
6. Gabarito do Professor: seção separada com <h2>Teacher's Answer Key & Marking Scheme</h2>
7. Critérios de avaliação (rubrica básica) ao final

REGRAS ABSOLUTAS DE SAÍDA:
1. Retorne APENAS HTML limpo. PROIBIDO usar markdown, asteriscos, blocos \`\`\` ou qualquer sintaxe não-HTML.
2. Tags permitidas: h1, h2, h3, h4, p, ul, ol, li, strong, em, table, thead, tbody, tr, td, th, hr, br, blockquote, span, div.
3. NÃO inclua <!DOCTYPE>, <html>, <head>, <body> — apenas o conteúdo interno.
4. Comece com <h2>Section I — [Primeira Seção]</h2>
5. O HTML será renderizado diretamente em um editor profissional — deve estar 100% completo.
6. Use estilos inline apenas quando essencial (ex: tabelas de correlação).

Gere agora a prova completa:`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExamBuilder() {
  // Form
  const [topic, setTopic]       = useState('')
  const [cefr, setCefr]         = useState('B2')
  const [grade, setGrade]       = useState('9º Fund.')
  const [customPrompt, setCustomPrompt] = useState('')
  const [sections, setSections] = useState<string[]>(['Reading Comprehension', 'Use of English', 'Writing'])
  const [approach, setApproach] = useState<string[]>(['Cambridge'])

  // Header
  const [header, setHeader] = useState<HeaderState>({ school: '', teacher: '', classGroup: '', title: '' })

  // Library / RAG
  const [libraryItems, setLibraryItems]     = useState<RepositoryItem[]>([])
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null)
  const [showLibraryPreview, setShowLibraryPreview] = useState(false)

  // Generation
  const [result, setResult]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // API
  const [apis, setApis]           = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState<string>('')

  // Audio
  const [audioUrl, setAudioUrl]         = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [accent, setAccent]             = useState<'US' | 'UK'>('US')

  // Saved
  const [showSaved, setShowSaved]   = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  // Header toggle
  const [hideHeader, setHideHeader] = useState(false)

  const updateSavedCount = () => {
    try { setSavedCount(JSON.parse(localStorage.getItem('teacher_saved_exams') || '[]').length) } catch { setSavedCount(0) }
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

    // F7: Lê prefill gerado pela Rafinha (tool generate_exam_content)
    try {
      const raw = localStorage.getItem('teacher_exam_prefill')
      if (raw) {
        const prefill = JSON.parse(raw)
        // Só aplica se o prefill for recente (gerado nos últimos 10 segundos)
        if (prefill.generatedAt && Date.now() - prefill.generatedAt < 10000) {
          if (prefill.topic)         setTopic(prefill.topic)
          if (prefill.level)         setCefr(prefill.level)
          if (prefill.classRef)      setGrade(prefill.classRef)
          if (prefill.questionCount) { /* informativo — não temos campo separado */ }
          if (prefill.type) {
            // Mapeia tipo para seções do ExamBuilder
            const typeMap: Record<string, string[]> = {
              'múltipla escolha': ['Use of English'],
              'dissertativa':     ['Writing'],
              'mista':            ['Reading Comprehension', 'Use of English', 'Writing'],
            }
            const mapped = typeMap[prefill.type]
            if (mapped) setSections(mapped)
          }
          localStorage.removeItem('teacher_exam_prefill')
          
          if (prefill.autoGenerate !== false) {
            setTimeout(() => {
              const genBtn = document.getElementById('exam-generate-btn')
              if (genBtn) genBtn.click()
            }, 600)
          }
        }
      }
    } catch { /* ignore */ }
  }, [])


  const selectedApi     = apis.find(a => a.id === selectedApiId) || apis[0]
  const selectedLibItem = libraryItems.find(i => i.id === selectedLibraryId) || null
  const hasApi          = !!selectedApi && selectedApi.provider !== 'manual'

  const toggleSection = (s: string) => setSections(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])
  const toggleApproach = (s: string) => setApproach(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  async function generate() {
    if (!sections.length) { alert('Selecione pelo menos uma seção.'); return }
    if (!hasApi) { setError('Configure uma API com chave válida em "APIs & Modelos" para gerar automaticamente.'); return }

    setLoading(true); setResult(''); setError('')

    const effectiveTitle = header.title || (topic ? `Prova — ${topic}` : `Exam ${cefr} — ${grade}`)
    setHeader(h => ({ ...h, title: h.title || effectiveTitle }))

    try {
      let libContext = selectedLibItem?.content || ''
      if (!libContext) {
        const { searchLibraryContext, buildRagPromptContext } = await import('@/lib/ragEngine')
        const chunks = searchLibraryContext(topic || sections.join(' ') || 'English', { limit: 3 })
        if (chunks.length > 0) {
          libContext = buildRagPromptContext(chunks)
        }
      }

      const prompt = buildExamPrompt({
        topic, cefr, grade, sections, approach, customPrompt,
        header: { ...header, title: header.title || effectiveTitle },
        libraryContext: libContext,
      })
      const raw  = await callApi(selectedApi!, prompt)
      const html = cleanHtml(raw)
      setResult(html)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateAudio() {
    if (!result) { alert('Gere a prova primeiro para extrair o texto de listening.'); return }
    setAudioLoading(true)
    try {
      const cleanText = result.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 800)
      const res = await generateListeningAudio({ text: cleanText, accent })
      setAudioUrl(res.audioUrl)
    } catch (e: unknown) {
      alert(`Falha ao gerar áudio: ${e instanceof Error ? e.message : 'Erro'}`)
    } finally {
      setAudioLoading(false)
    }
  }

  function handleSave() {
    if (!result) { alert('Gere ou cole uma prova primeiro.'); return }
    const saved = saveItemToStorage('teacher_saved_exams', {
      title:    header.title || (topic ? `Prova — ${topic}` : `Exam (${cefr})`),
      subtitle: `${cefr} · ${grade} · ${sections.slice(0, 2).join(', ')}`,
      content:  result,
    })
    if (saved) { updateSavedCount(); alert('✅ Prova salva!') }
  }

  const currentExamConfig = {
    topic, cefr, grade, sections, approach, customPrompt, selectedApiId
  }

  const handleLoadExamPreset = (config: Record<string, any>) => {
    if (config.topic) setTopic(config.topic)
    if (config.cefr) setCefr(config.cefr)
    if (config.grade) setGrade(config.grade)
    if (config.sections) setSections(config.sections)
    if (config.approach) setApproach(config.approach)
    if (config.customPrompt) setCustomPrompt(config.customPrompt)
    if (config.selectedApiId) setSelectedApiId(config.selectedApiId)
  }

  async function handleSaveToActivitiesBank() {
    if (!result) { alert('Gere ou cole uma prova primeiro.'); return }
    const { saveActivityToSupabase } = await import('@/lib/supabaseClient')
    const title = header.title || (topic ? `Prova — ${topic}` : `Prova (${cefr})`)
    await saveActivityToSupabase({
      title,
      type: 'exam',
      grade,
      cefr,
      content: result
    })
    alert('✅ Prova salva com sucesso no Banco de Dados!')
  }

  return (
    <div style={{ padding: '32px 44px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>
            Gerar Prova
          </h1>
          <p style={{ color: '#586e75', fontSize: 14, marginTop: 4, margin: 0 }}>
            Provas completas estruturadas por seções, com fonte da Biblioteca e cabeçalho editável.
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
            <i className="ti ti-bookmark" style={{ color: '#b58900' }} /> Provas Salvas ({savedCount})
          </button>
        </div>
      </div>

      {/* ── Seletor de Presets Salvos (Modelos do Professor) ── */}
      <PresetSelector
        module="exam"
        currentConfig={currentExamConfig}
        onLoadPreset={handleLoadExamPreset}
      />

      {/* ── Error ── */}
      {error && (
        <div style={{ background: 'rgba(220,50,47,0.08)', border: '1px solid rgba(220,50,47,0.2)', borderRadius: 10, padding: '10px 16px', color: '#dc322f', fontSize: 13, marginBottom: 14, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 32, flex: 1, minHeight: 0 }}>

        {/* ══ LEFT ══ */}
        <div style={{ overflowY: 'auto', paddingRight: 8, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* API */}
          {apis.length > 0 && (
            <div style={CARD}>
              <label style={SL}>🤖 Modelo de IA</label>
              <select value={selectedApiId} onChange={e => setSelectedApiId(e.target.value)} style={SS}>
                {apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {!hasApi && (
                <div style={{ fontSize: 12, color: '#b58900', background: 'rgba(181,137,0,0.08)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-alert-triangle" /> Configure uma API key para gerar automaticamente.
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
                  <div style={{ fontSize: 12, color: '#586e75', marginTop: 2 }}>Vá em <strong>APIs & Modelos</strong> para configurar uma chave de IA.</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Biblioteca (RAG) ── */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                <i className="ti ti-check" /> A IA usará <strong>"{selectedLibItem.title.replace(/^[^\w]*/, '')}"</strong> como fonte da prova.
              </div>
            )}
            {selectedLibItem && showLibraryPreview && (
              <div style={{ background: '#f5f0e8', borderRadius: 10, padding: 10, maxHeight: 140, overflowY: 'auto', fontSize: 11, color: '#586e75', lineHeight: 1.6, fontFamily: 'monospace' }}>
                {selectedLibItem.content.slice(0, 600)}…
              </div>
            )}
            {libraryItems.length === 0 && (
              <div style={{ fontSize: 12, color: '#93a1a1' }}>Nenhum item na Biblioteca. Adicione livros em <strong>Biblioteca</strong> para usar como fonte.</div>
            )}
          </div>

          {/* ── Cabeçalho ── */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <label style={{ ...SL, fontSize: 12 }}>Título da Prova</label>
              <input value={header.title} onChange={e => setHeader(h => ({ ...h, title: e.target.value }))}
                placeholder="Ex: Prova Bimestral — Inglês" style={SI} />
            </div>
          </div>

          {/* ── Seções ── */}
          <div style={CARD}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14, marginTop: 0 }}>Seções da Prova</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {SECTIONS.map(({ key, icon, sub }) => {
                const on = sections.includes(key)
                return (
                  <button key={key} onClick={() => toggleSection(key)} style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 12,
                    border: on ? '1.5px solid #073642' : '1.5px solid #e4ddd0',
                    background: on ? '#f0ede4' : '#fdf9f3',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 16, color: on ? '#073642' : '#93a1a1' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: on ? '#073642' : '#586e75' }}>{key}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#93a1a1' }}>{sub}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Detalhes ── */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={SL}>Tópico Central</label>
              <input value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Ex: Unit 5, Past Perfect, Environment…" style={SI} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={SL}>Nível CEFR</label>
                <select value={cefr} onChange={e => setCefr(e.target.value)} style={SS}>
                  {CEFR.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={SL}>Ano / Série</label>
                <select value={grade} onChange={e => setGrade(e.target.value)} style={SS}>
                  {GRADES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={SL}>💬 Diretrizes do Professor</label>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Ex: incluir 2 questões focadas no capítulo 3, usar contexto de esportes…"
                rows={3}
                style={{ ...SI, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* ── Metodologias ── */}
          <div style={CARD}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14, marginTop: 0 }}>Metodologias & Abordagens</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PEDAGOGICAL_METHODOLOGIES.map(m => {
                const on = approach.includes(m.name) || approach.includes(m.id)
                return (
                  <button key={m.id} onClick={() => toggleApproach(m.name)} title={m.description} style={{
                    padding: '5px 12px', borderRadius: 100,
                    border: on ? `1.5px solid ${m.badgeColor}` : '1.5px solid #ddd6c9',
                    background: on ? m.badgeColor : 'transparent',
                    color: on ? '#fff' : '#586e75',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  }}>
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Generate Button ── */}
          <button
            id="exam-generate-btn"
            onClick={generate}
            disabled={loading || !hasApi}
            style={{
              padding: 14, borderRadius: 14,
              background: loading ? '#93a1a1' : !hasApi ? '#e8e0d0' : '#073642',
              color: !hasApi ? '#93a1a1' : '#fff',
              fontSize: 15, fontWeight: 700, border: 'none',
              cursor: loading || !hasApi ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: hasApi && !loading ? '0 4px 16px rgba(7,54,66,0.2)' : 'none',
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}
          >
            <i className={loading ? 'ti ti-loader' : 'ti ti-file-certificate'} style={{ fontSize: 18, animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            {loading ? 'Construindo Prova...' : !hasApi ? 'Configure uma API para gerar' : '✨ Gerar Prova Completa'}
          </button>
        </div>

        {/* ══ RIGHT ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>

          {/* Audio toolbar */}
          {result && (
            <div style={{ background: '#fff', padding: '12px 18px', borderRadius: 16, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-headphones" style={{ fontSize: 20, color: '#268bd2' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>Listening Track</span>
                <select value={accent} onChange={e => setAccent(e.target.value as 'US' | 'UK')} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12, outline: 'none' }}>
                  <option value="US">🇺🇸 US</option>
                  <option value="UK">🇬🇧 UK</option>
                </select>
              </div>
              <button onClick={handleGenerateAudio} disabled={audioLoading} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#268bd2', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {audioLoading ? <><i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</> : <><i className="ti ti-volume" /> Gerar Áudio MP3</>}
              </button>
            </div>
          )}

          {audioUrl && (
            <AudioPlayerCard audioUrl={audioUrl} title={`Listening Track — ${topic || 'Exam'}`} accent={accent} onDelete={() => setAudioUrl(null)} />
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
          <div style={{ flex: 1, borderRadius: 20, overflow: 'hidden', border: '1px solid #ede8dc', boxShadow: '0 4px 24px rgba(0,43,54,0.04)', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {!result && !loading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#93a1a1', gap: 16 }}>
                <i className="ti ti-file-certificate" style={{ fontSize: 56, opacity: 0.3 }} />
                <p style={{ fontSize: 16 }}>Sua prova aparecerá aqui, pronta para editar e exportar</p>
                {!hasApi && (
                  <p style={{ fontSize: 13, color: '#b58900', textAlign: 'center', maxWidth: 300 }}>
                    Configure uma API em <strong>APIs & Modelos</strong> para geração automática.
                    <br />Ou cole o conteúdo diretamente neste espaço após configurar.
                  </p>
                )}
              </div>
            ) : loading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', border: '5px solid #eee8d5', borderTopColor: '#073642', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ color: '#586e75', fontSize: 14 }}>Construindo sua prova{selectedLibItem ? ` com base em "${selectedLibItem.title.replace(/^[^\w]*/, '')}"` : ''}…</p>
              </div>
            ) : (
              <DocumentCanvas
                content={result}
                onContentChange={setResult}
                hideHeader={hideHeader}
                onToggleHeader={() => setHideHeader(h => !h)}
                headerData={{
                  school:  header.school  || 'Nome da Escola',
                  teacher: header.teacher || 'Professor(a)',
                  title:   header.title   || (topic ? `Prova — ${topic}` : 'Prova de Inglês'),
                }}
                onHeaderChange={patch => setHeader(h => ({
                  ...h,
                  ...(patch.headerSchool  !== undefined ? { school:  patch.headerSchool  } : {}),
                  ...(patch.headerTeacher !== undefined ? { teacher: patch.headerTeacher } : {}),
                  ...(patch.headerTitle   !== undefined ? { title:   patch.headerTitle   } : {}),
                }))}
              />
            )}
          </div>
        </div>
      </div>

      {/* Saved Drawer */}
      <SavedItemsDrawer
        isOpen={showSaved}
        onClose={() => setShowSaved(false)}
        title="Minhas Provas Salvas"
        storageKey="teacher_saved_exams"
        onSelect={(item: SavedItem) => setResult(item.content)}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
