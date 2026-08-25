'use client'

import { useState, useEffect, useCallback } from 'react'
import { AssessmentPreset, BloomDistribution, QuestionWeights, DifficultyDistribution, getDefaultPreset, getStoredPresets, savePreset } from "@/lib/assessmentPresets"
import { ApiConfig } from '@/components/modules/ApiManager'
import VoiceButton from '@/components/VoiceButton'
import DocumentCanvas from '@/components/DocumentCanvas'
import { runFactCheck, FactCheckResult } from '@/lib/factCheck'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { PEDAGOGICAL_METHODOLOGIES, buildMethodologyInstructions } from '@/lib/pedagogicalMethodologies'
import PresetSelector from '@/components/PresetSelector'
import { exportToPdf, exportToWord, OFFICIAL_SCHOOL_TEMPLATES } from '@/lib/exportUtils'
import SourceKnowledgeHub, { SourceItem, KnowledgeMode, compileSourcesPrompt } from '@/components/SourceKnowledgeHub'
import { getTeacherCalibrations } from '@/lib/teacherCalibrations'
import {
  getSubjectProfile,
  getLevelIds,
  getLevelGatingRule,
  getDistractorBlock,
  getAllSubjectProfiles,
  type SubjectProfile,
} from '@/lib/subjectProfile'
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'

// Types

interface HeaderState {
  school: string
  teacher: string
  classGroup: string
  title: string
}

// Constants 

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const QTYPES = [
  { label: 'Múltipla escolha', sub: '4 alternativas, A-D', icon: 'ti-circle-dot' },
  { label: 'Dissertativa', sub: 'Resposta aberta', icon: 'ti-writing' },
  { label: 'Verdadeiro / Falso', sub: 'Afirmações V ou F', icon: 'ti-toggle-left' },
  { label: 'Lacuna (gap fill)', sub: 'Complete a frase', icon: 'ti-dots' },
  { label: 'Correlação', sub: 'Ligue as colunas', icon: 'ti-arrows-shuffle' },
  { label: 'Interpretação de texto', sub: 'Baseada em texto', icon: 'ti-align-left' },
  { label: 'Ordenação', sub: 'Ordene itens/eventos', icon: 'ti-sort-ascending' },
  { label: 'Produção textual', sub: 'Redação / escrita', icon: 'ti-notebook' },
]
const GRADES = [
  '1º Fund.', '2º Fund.', '3º Fund.', '4º Fund.', '5º Fund.',
  '6º Fund.', '7º Fund.', '8º Fund.', '9º Fund.',
  '1º Médio', '2º Médio', '3º Médio',
]
const NEE_PROFILES = [
  { id: 'dyslexia', label: 'Dislexia', icon: 'ti-text-size', color: '#268bd2' },
  { id: 'adhd', label: 'TDAH', icon: 'ti-bolt', color: '#b58900' },
  { id: 'asd', label: 'TEA', icon: 'ti-puzzle', color: '#2aa198' },
  { id: 'low_vis', label: 'Baixa Visão', icon: 'ti-eye-off', color: '#6c71c4' },
  { id: 'gifted', label: 'Superdotação', icon: 'ti-star', color: '#cb4b16' },
]

// Style helpers 

const SL: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 6 }
const SS: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const }
const SI: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 14, fontFamily: 'inherit' }
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 12 }

// Helpers 

function loadApis(): ApiConfig[] {
  try {
    const { getAvailableApisForSelect } = require('@/lib/autoApiSelector')
    return getAvailableApisForSelect()
  } catch { return [] }
}

function loadConfig(): { school: string; teacher: string } {
  try { return JSON.parse(localStorage.getItem('teacher_cfg') || '{}') } catch { return { school: '', teacher: '' } }
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
  stemLanguage?: 'pt' | 'en'
  optionLanguage?: 'en' | 'pt'
  customPrompt?: string
  libraryContext?: string
  header: HeaderState
  bloomRemember?: number
  bloomApply?: number
  bloomAnalyze?: number
  bloomEvaluate?: number
  diffEasy?: number
  diffMedium?: number
  diffHard?: number
  diffChallenge?: number
  subjectProfile?: SubjectProfile
}) {
  const profile = opts.subjectProfile ?? getSubjectProfile()
  const levelFrameworkName = profile.levelFramework.name
  const levelGatingRule = getLevelGatingRule(profile, opts.cefr) || ''
  const distractorBlock = getDistractorBlock(profile)

  const neeInstructions: Record<string, string> = {
    dyslexia: 'Adapte para alunos com dislexia: frases curtas (máx 15 palavras), evite negativas duplas, sem itálico no enunciado.',
    adhd: 'Adapte para TDAH: instruções numeradas, uma ação por instrução, destaque em negrito as palavras-chave.',
    asd: 'Adapte para TEA: linguagem literal e objetiva, sem metáforas ou expressões idiomáticas, contexto explícito em cada questão.',
    low_vis: 'Adapte para baixa visão: evite referências visuais ("observe a figura"), use descrições textuais completas.',
    gifted: 'Adapte para superdotação: adicione questões de extensão, conexões interdisciplinares e desafios de pensamento crítico.',
  }

  const methodologyInstructions = buildMethodologyInstructions(opts.methodology)

  const librarySection = opts.libraryContext
    ? `\n${opts.libraryContext}\nREGRA FUNDAMENTAL: Use o material acima como BASE TEMÁTICA E CONTEXTO PEDAGÓGICO (vocabulário, gramática e tópicos). NUNCA reproduza questões prontas do texto. Crie EXERCÍCIOS TOTALMENTE INÉDITOS E NOVOS inspirados nesse conteúdo.\n`
    : ''

  const stemInstruction = opts.stemLanguage === 'pt' || profile.examLanguage === 'pt-BR'
    ? 'IDIOMA DOS ENUNCIADOS: Escreva as instruções, orientações e enunciados de TODAS as questões estritamente em PORTUGUÊS.'
    : 'IDIOMA DOS ENUNCIADOS: Write all instructions and question stems strictly in ENGLISH.'

  const optionInstruction = opts.optionLanguage === 'pt' || profile.examLanguage === 'pt-BR'
    ? 'IDIOMA DAS ALTERNATIVAS: As opções e respostas devem ser formuladas em PORTUGUÊS.'
    : 'IDIOMA DAS ALTERNATIVAS: As opções (A, B, C, D) e respostas devem ser estritamente em INGLÊS.'

  const bRemember = opts.bloomRemember ?? 25
  const bApply = opts.bloomApply ?? 30
  const bAnalyze = opts.bloomAnalyze ?? 25
  const bEvaluate = opts.bloomEvaluate ?? 20

  const dEasy = opts.diffEasy ?? 20
  const dMedium = opts.diffMedium ?? 50
  const dHard = opts.diffHard ?? 25
  const dChallenge = opts.diffChallenge ?? 5

  const defaultBnccExample = profile.id === 'portuguese' ? 'EF09LP01, EF09LP29' : 'EF09LI14, EF09LI15'

  return `Você é um professor especialista em ${profile.name}, Psicometria Educacional e Design Instrucional. Sua tarefa é gerar uma LISTA DE EXERCÍCIOS COMPLETA formatada em HTML, com rigor psicométrico e pedagógico.
${librarySection}
ESPECIFICAÇÕES DO EXERCÍCIO:
- Matéria: ${profile.name}
- Escola: ${opts.header.school || 'Escola'}
- Professor(a): ${opts.header.teacher || 'Professor(a)'}
- Turma: ${opts.header.classGroup || opts.grade}
- Série/Nível: ${opts.grade}
- ${levelFrameworkName}: ${opts.cefr}
- Habilidade foco: ${opts.skill}
- Tipos de questão: ${opts.types.join(', ')}
- Metodologias: ${opts.methodology.join(', ')}
- Quantidade Obrigatória: EXATAMENTE ${opts.qtCount} QUESTÕES COMPLETAS (Questão 1 a Questão ${opts.qtCount})
- Tema/Tópico: ${opts.topic || 'tema relevante para o nível'}
- ${stemInstruction}
- ${optionInstruction}
${opts.customPrompt ? `\nDIRETRIZES DO PROFESSOR:\n"${opts.customPrompt}"\n` : ''}
${opts.neeProfile ? `\nADAPTAÇÃO ESPECIAL: ${neeInstructions[opts.neeProfile] || ''}` : ''}
${methodologyInstructions}

${levelGatingRule ? `${levelGatingRule}\n` : ''}
=== 1. DISTRIBUIÇÃO COGNITIVA OBRIGATÓRIA (BLOOM REVISADO) ===
- LEMBRAR/COMPREENDER (${bRemember}%): Recall, identificação factual e reconhecimento lexical direto.
- APLICAR (${bApply}%): Uso de regras em novos contextos, conjugação e estruturação oracional inédita.
- ANALISAR (${bAnalyze}%): Inferência, identificação de tom/propósito e distinção de fatos vs opiniões.
- AVALIAR / CRIAR (${bEvaluate}%): Julgamento crítico fundamentado e reestruturação criativa.
Rotule cada questão com comentário HTML: <!-- bloom:remember|apply|analyze|evaluate|create -->

=== 2. CALIBRAÇÃO DE DIFICULDADE DOS ITENS ===
- FÁCIL (${dEasy}%): Resposta contextual direta ($p > 0.70$).
- MÉDIO (${dMedium}%): Raciocínio de 2 etapas ($p \\approx 0.45 - 0.70$).
- DIFÍCIL (${dHard}%): Estruturas subordinadas e complexidade gramatical ($p < 0.45$).
- ⭐ DESAFIO (${dChallenge}%): Questão analítica de alta discriminação; adicione o selo ⭐ DESAFIO no enunciado.

${distractorBlock ? `${distractorBlock}\n` : `=== 3. DESIGN DIAGNÓSTICO DE DISTRATORES & ANTI-CUEING ===
- CADA distrator nas questões de múltipla escolha deve representar um erro diagnóstico concreto.
`}
- ANTI-CUEING: Proibido repetir palavras exclusivas do enunciado na alternativa correta.
- HOMOGENEIDADE: Alternativas com tamanho balanceado (±25% caracteres) e paralelismo sintático.
- SEM DUPLAS NEGATIVAS: Se usar negação no enunciado, use **NÃO**, **EXCETO**, **INCORRETA**.
- INDEPENDÊNCIA: Questões 100% autônomas.

ESTRUTURA OBRIGATÓRIA DO EXERCÍCIO:
1. QUANTIDADE RIGOROSA: Exatamente ${opts.qtCount} questões completas numeradas de 1 a ${opts.qtCount}.
2. Cada questão deve ter enunciado rico e contextualizado. Questões de múltipla escolha: exatamente 4 alternativas (A, B, C, D).
3. Ao final, inclua um <h2>Gabarito Comentado</h2> cobrindo todas as ${opts.qtCount} questões com as respostas e diagnósticos pedagógicos de erro para cada distrator.
4. Inclua as habilidades BNCC ao final no formato: <p><strong>Habilidades BNCC:</strong> ${defaultBnccExample}</p>

REGRAS ABSOLUTAS DE SAÍDA:
1. Retorne APENAS HTML limpo. PROIBIDO usar markdown, blocos \`\`\`, asteriscos ou qualquer outra sintaxe que não seja HTML.
2. Use apenas estas tags: h2, h3, p, ul, ol, li, strong, em, table, thead, tbody, tr, td, th, hr, br, blockquote, span, div.
3. NÃO inclua <!DOCTYPE>, <html>, <head>, <body> apenas o conteúdo interno.
4. Comece diretamente com <h2> do título do exercício.
5. O HTML gerado será renderizado diretamente em um editor deve estar 100% pronto e completo com TODAS as ${opts.qtCount} questões.

Gere agora todas as ${opts.qtCount} questões completas:`
}

// Component 

export default function QuickGenerate() {
  const cal = getTeacherCalibrations().exam
  const profile = getSubjectProfile()
  const availableLevels = getLevelIds(profile)

  // Form
  const [types, setTypes] = useState<string[]>(() => {
    if (cal.defaultQuestionType === 'multiple_choice') return ['Múltipla escolha']
    if (cal.defaultQuestionType === 'open') return ['Dissertativa']
    return ['Múltipla escolha', 'Dissertativa']
  })
  const [cefr, setCefr] = useState(() => availableLevels.includes(cal.defaultLevel) ? cal.defaultLevel : availableLevels[0] || 'B1')
  const [grade, setGrade] = useState('9º Fund.')
  const [skill, setSkill] = useState(profile.id === 'portuguese' ? 'Leitura e Interpretação' : 'Reading')
  const [stemLanguage, setStemLanguage] = useState<'pt' | 'en'>(() => cal.defaultStemLanguage || 'pt')
  const [optionLanguage, setOptionLanguage] = useState<'en' | 'pt'>(() => profile.examLanguage === 'pt-BR' ? 'pt' : (cal.defaultOptionLanguage || 'en'))
  const [methodology, setMethodology] = useState<string[]>(() => cal.defaultApproach || ['Cambridge'])
  const [topic, setTopic] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [qtCount, setQtCount] = useState(() => cal.defaultQuestionCount || '10')
  const [neeProfile, setNeeProfile] = useState('')
  const [showNeePanel, setShowNeePanel] = useState(false)
  const [selectedSchoolTemplate, setSelectedSchoolTemplate] = useState<string>('')
  const [registeredSchools, setRegisteredSchools] = useState<Array<{ id: string; name: string }>>([])

  const [bloomRemember, setBloomRemember] = useState(25)
  const [bloomApply, setBloomApply] = useState(30)
  const [bloomAnalyze, setBloomAnalyze] = useState(25)
  const [bloomEvaluate, setBloomEvaluate] = useState(20)
  const [diffEasy, setDiffEasy] = useState(20)
  const [diffMedium, setDiffMedium] = useState(50)
  const [diffHard, setDiffHard] = useState(25)
  const [diffChallenge, setDiffChallenge] = useState(5)

  // Header
  const [header, setHeader] = useState<HeaderState>({ school: '', teacher: '', classGroup: '', title: '' })

  // NotebookLM Multi-Source Knowledge Hub
  const [sources, setSources] = useState<SourceItem[]>([])
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>('hybrid')

  // Generation
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null)
  const [bnccTags, setBnccTags] = useState<string[]>([])

  // API
  const [apis, setApis] = useState<ApiConfig[]>([])
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
    const a = loadApis()
    setHeader(h => ({ ...h, school: cfg.school || '', teacher: cfg.teacher || '' }))
    setApis(a)
    if (a.length > 0) setSelectedApiId(a[0].id)

    // Carrega estritamente as escolas cadastradas pelo professor em Organização
    try {
      const sStr = localStorage.getItem('teacher_schools')
      if (sStr) {
        const parsed = JSON.parse(sStr)
        if (Array.isArray(parsed)) {
          setRegisteredSchools(parsed)
          if (parsed.length > 0 && !cfg.school) {
            setHeader(h => ({ ...h, school: parsed[0].name }))
            setSelectedSchoolTemplate(parsed[0].id)
          }
        }
      }
    } catch {}
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

  const selectedApi = apis.find(a => a.id === selectedApiId) || apis[0]
  const hasApi = !!selectedApi && selectedApi.provider !== 'manual'

  const toggleType = (t: string) => setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const toggleMethod = (m: string) => setMethodology(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const extractBncc = useCallback((text: string) => {
    const matches = text.match(/EF\d{2}[A-Z]{2}\d{2}/g) || []
    setBnccTags([...new Set(matches)])
  }, [])

  async function handleGenerate() {
    if (!selectedApi) { setError('Nenhuma API ativa. Vá em "APIs & Modelos".'); return }
    if (selectedApi.provider === 'manual') { setError('Configure uma API com chave válida em "APIs & Modelos" para gerar automaticamente.'); return }
    setLoading(true); setError(''); setResult(''); setFactCheck(null); setBnccTags([])

    const effectiveTitle = topic || `Exercício ${cefr} ${grade}`
    setHeader(h => ({ ...h, title: h.title || effectiveTitle }))

    try {
      let libContext = ''
      const compiled = compileSourcesPrompt(sources, knowledgeMode)
      if (compiled.activeCount > 0) {
        libContext = compiled.promptContext
      } else {
        // Fallback RAG se não houver fontes manuais selecionadas
        const { searchLibraryContext, buildRagPromptContext } = await import('@/lib/ragEngine')
        const chunks = searchLibraryContext(topic || skill || 'English', { limit: 3 })
        if (chunks.length > 0) {
          libContext = buildRagPromptContext(chunks)
        }
      }

      const prompt = buildPrompt({
        types, cefr, grade, skill, methodology, topic, qtCount, neeProfile, customPrompt,
        stemLanguage, optionLanguage,
        header: { ...header, title: header.title || effectiveTitle },
        libraryContext: libContext,
        bloomRemember, bloomApply, bloomAnalyze, bloomEvaluate,
        diffEasy, diffMedium, diffHard, diffChallenge
      })

      const raw = await callApi(selectedApi, prompt)
      const html = cleanHtml(raw)
      setResult(html)
      extractBncc(html)

      // Auto-save no Banco de Atividades (Zero-Leakage)
      try {
        const qbRaw = localStorage.getItem('teacher_question_bank') || '[]'
        const qbList = JSON.parse(qbRaw)
        const newQuickItem = {
          id: `quick_auto_${Date.now()}`,
          statement: html.slice(0, 300) + '...',
          type: types[0] === 'mc' ? 'mc' : 'fill',
          activityKind: 'exercise',
          subject: 'Inglês',
          topic: topic || skill || 'Exercício Rápido',
          level: cefr,
          year: new Date().getFullYear().toString(),
          schoolId: header.school || '',
          classRef: grade || '',
          tags: ['Gerador Rápido', `CEFR ${cefr}`, methodology],
          createdAt: Date.now(),
          source: 'ai',
          fullContent: html
        }
        localStorage.setItem('teacher_question_bank', JSON.stringify([newQuickItem, ...qbList]))
        window.dispatchEvent(new Event('storage'))
      } catch {}

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
      title: header.title || (topic ? `Exercício ${topic}` : `Atividade (${skill})`),
      subtitle: `${cefr} · ${grade} · ${types.slice(0, 2).join(', ')}`,
      content: result,
    })
    if (saved) { updateSavedCount(); alert(' Exercício salvo!') }
  }

  async function handleSaveToActivitiesBank() {
    if (!result) { alert('Gere um exercício primeiro.'); return }
    const { saveActivityToSupabase } = await import('@/lib/supabaseClient')
    const title = header.title || (topic ? `Exercício ${topic}` : `Atividade (${skill})`)
    await saveActivityToSupabase({
      title,
      type: 'exercise',
      grade,
      cefr,
      content: result
    })
    alert(' Exercício salvo com sucesso no Banco de Dados!')
  }

  const fcColor = factCheck
    ? factCheck.level === 'ok' ? '#859900'
    : factCheck.level === 'warn' ? '#b58900'
    : '#dc322f'
    : '#93a1a1'

  const currentPresetConfig = {
    types, cefr, grade, skill, methodology, topic, customPrompt, qtCount, neeProfile, selectedApiId
  }

  const handleLoadPreset = (config: Record<string, any>) => {
    if (config.types) setTypes(config.types)
    if (config.cefr) setCefr(config.cefr)
    if (config.grade) setGrade(config.grade)
    if (config.skill) setSkill(config.skill)
    if (config.methodology) setMethodology(config.methodology)
    if (config.topic) setTopic(config.topic)
    if (config.customPrompt) setCustomPrompt(config.customPrompt)
    if (config.qtCount) setQtCount(config.qtCount)
    if (config.neeProfile) setNeeProfile(config.neeProfile)
    if (config.selectedApiId) setSelectedApiId(config.selectedApiId)
  }

  return (
    <div style={{ padding: '32px 44px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div>
          <h1 style={{ textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, color: '#2c1a0e', margin: '0 auto' }}>
            Exercício Rápido
          </h1>
        </div>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 10 }}>
          {result && (
            <button onClick={handleSaveToActivitiesBank} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #8b5e3c', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(139,94,60,0.2)' }}>
              <i className="ti ti-database" /> Salvar no Banco de Dados
            </button>
          )}
          <button onClick={() => setShowSaved(true)} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #8b5e3c', background: '#fdf9f3', color: '#073642', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-bookmark" style={{ color: '#b58900' }} /> Exercícios Salvos ({savedCount})
          </button>
        </div>
      </div>

      {/* Seletor de Presets Salvos */}
      <PresetSelector
        module="quick"
        currentConfig={currentPresetConfig}
        onLoadPreset={handleLoadPreset}
      />

      {/* Error banner */}
      {error && (
        <div style={{ background: 'rgba(220,50,47,0.08)', border: '1px solid rgba(220,50,47,0.2)', borderRadius: 10, padding: '10px 16px', color: '#dc322f', fontSize: 13, marginBottom: 14, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}

      {/* Main Form Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 460px) 1fr', gap: 32, flex: 1, minHeight: 0 }}>

        {/* LEFT PANEL */}
        <div style={{ overflowY: 'auto', paddingRight: 8, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Generate Button (Top) */}
          <button
            id="quick-generate-btn"
            onClick={handleGenerate}
            disabled={loading}
            style={{
              padding: '14px 24px',
              background: loading ? '#93a1a1' : 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
              color: '#fff',
              border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: !loading ? '0 4px 16px rgba(139,94,60,0.35)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <i className={`ti ${loading ? 'ti-loader-2' : 'ti-sparkles'}`} style={{ fontSize: 18, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Gerando exercício...' : ' Gerar Exercício Completo'}
          </button>

          {/* API Selector */}
          {apis.length > 0 && (
            <div style={CARD}>
              <label style={SL}> Modelo de IA</label>
              <select value={selectedApiId} onChange={e => setSelectedApiId(e.target.value)} style={SS}>
                {apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {!hasApi && (
                <div style={{ fontSize: 12, color: '#b58900', background: 'rgba(181,137,0,0.08)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-alert-triangle" /> Configure uma API key em APIs & Modelos para gerar automaticamente.
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

          {/* HUB MULTI-FONTES DE CONHECIMENTO (NOTEBOOKLM STYLE) */}
          <SourceKnowledgeHub
            sources={sources}
            onChangeSources={setSources}
            knowledgeMode={knowledgeMode}
            onChangeKnowledgeMode={setKnowledgeMode}
            title="Fontes de Conhecimento do Exercício (Estilo NotebookLM)"
            description="Selecione múltiplos livros, capítulos, páginas, arquivos avulsos (PDFs/DOCXs), anotações ou pesquise na Web para alimentar a criação dos exercícios."
          />

          {/* Idioma dos Enunciados e das Alternativas */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ ...SL, marginBottom: 2 }}>
              <i className="ti ti-language" style={{ marginRight: 6, color: '#cb4b16' }} />
              Configuração de Idioma das Questões & Opções
            </label>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...SL, fontSize: 11.5 }}>Enunciados / Instruções</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setStemLanguage('pt')}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: stemLanguage === 'pt' ? '1.5px solid #cb4b16' : '1px solid #e8e0d0',
                      background: stemLanguage === 'pt' ? '#fdf8f2' : '#fff',
                      color: stemLanguage === 'pt' ? '#cb4b16' : '#586e75', cursor: 'pointer'
                    }}
                  >
                    Português
                  </button>
                  <button
                    type="button"
                    onClick={() => setStemLanguage('en')}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: stemLanguage === 'en' ? '1.5px solid #268bd2' : '1px solid #e8e0d0',
                      background: stemLanguage === 'en' ? '#f0f8ff' : '#fff',
                      color: stemLanguage === 'en' ? '#268bd2' : '#586e75', cursor: 'pointer'
                    }}
                  >
                    Inglês
                  </button>
                </div>
              </div>

              <div>
                <label style={{ ...SL, fontSize: 11.5 }}>Alternativas (A, B, C, D)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setOptionLanguage('en')}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: optionLanguage === 'en' ? '1.5px solid #268bd2' : '1px solid #e8e0d0',
                      background: optionLanguage === 'en' ? '#f0f8ff' : '#fff',
                      color: optionLanguage === 'en' ? '#268bd2' : '#586e75', cursor: 'pointer'
                    }}
                  >
                    Inglês
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionLanguage('pt')}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: optionLanguage === 'pt' ? '1.5px solid #cb4b16' : '1px solid #e8e0d0',
                      background: optionLanguage === 'pt' ? '#fdf8f2' : '#fff',
                      color: optionLanguage === 'pt' ? '#cb4b16' : '#586e75', cursor: 'pointer'
                    }}
                  >
                    Português
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Cabeçalho Oficial da Escola */}
          <div style={CARD}>
            <label style={{ ...SL, marginBottom: 2 }}>
              <i className="ti ti-id-badge" style={{ marginRight: 6, color: '#268bd2' }} />
              Cabeçalho Oficial da Escola
            </label>

            {/* Escolas Cadastradas pelo Professor em Organização */}
            <div>
              <label style={{ ...SL, fontSize: 11.5 }}>Vincular Escola Cadastrada (Organização):</label>
              {registeredSchools.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {registeredSchools.map(sch => {
                    const isSelected = selectedSchoolTemplate === sch.id || header.school === sch.name
                    return (
                      <button
                        key={sch.id}
                        type="button"
                        onClick={() => {
                          setSelectedSchoolTemplate(sch.id)
                          setHeader(h => ({
                            ...h,
                            school: sch.name,
                            title: h.title || `Atividade de Fixação Língua Inglesa`
                          }))
                        }}
                        style={{
                          padding: '7px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, textAlign: 'left',
                          border: isSelected ? '1.5px solid #8b5e3c' : '1px solid #e8e0d0',
                          background: isSelected ? '#fdf8f2' : '#faf8f5',
                          color: isSelected ? '#8b5e3c' : '#2c1a0e', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s'
                        }}
                      >
                        {sch.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: '#8b5e3c', background: '#fdf8f2', border: '1px dashed #e8d8c8', padding: '8px 12px', borderRadius: 8 }}>
                  Nenhuma escola cadastrada ainda. Digite o nome abaixo ou cadastre em <strong>Organização &gt; Escolas</strong> para vincular automaticamente.
                </div>
              )}
            </div>

            <div>
              <label style={{ ...SL, fontSize: 12 }}>Nome Oficial da Escola</label>
              <input value={header.school} onChange={e => setHeader(h => ({ ...h, school: e.target.value }))}
                placeholder="Ex: Colégio Machado Sobrinho" style={SI} />
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
                placeholder="Ex: Exercício Present Perfect" style={SI} />
            </div>
          </div>

          {/* Tópico & Prompt */}
          <div style={CARD}>
            <div>
              <label style={SL}> Tema / Tópico Principal</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="Ex: Simple Past, Present Perfect, Meio Ambiente"
                  style={SI} />
                <VoiceButton onResult={t => setTopic(prev => prev ? prev + ' ' + t : t)} />
              </div>
            </div>
            <div>
              <label style={SL}> Diretrizes Adicionais</label>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Ex: incluir pelo menos 2 questões baseadas no Capítulo 3, usar contexto de esportes"
                rows={3}
                style={{ ...SI, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Grade + CEFR */}
          <div style={{ ...CARD, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={SL}> Série</label>
              <select value={grade} onChange={e => setGrade(e.target.value)} style={SS}>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={SL}> CEFR</label>
              <select value={cefr} onChange={e => setCefr(e.target.value)} style={SS}>
                {CEFR.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Skill */}
          <div style={CARD}>
            <label style={SL}> Habilidade Foco</label>
            <select value={skill} onChange={e => setSkill(e.target.value)} style={SS}>
              {['Reading', 'Writing', 'Listening', 'Speaking', 'Grammar', 'Vocabulary', 'Use of English'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Quantity */}
          <div style={CARD}>
            <label style={SL}> Quantidade de questões: <strong>{qtCount}</strong></label>
            <input type="range" min="3" max="30" value={qtCount} onChange={e => setQtCount(e.target.value)}
              style={{ width: '100%', accentColor: '#073642' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#93a1a1' }}>
              <span>3</span><span>30</span>
            </div>
            {types.length > 0 && Number(qtCount) < types.length * 2 && (
              <div style={{ background: '#fdf6e2', border: '1px solid #b58900', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#856404', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 15, color: '#b58900', flexShrink: 0 }} />
                <span><strong>Aviso Psicométrico:</strong> {types.length} tipos para {qtCount} questões ({(Number(qtCount)/types.length).toFixed(1)} q/tipo). Recomendamos pelo menos 2 a 3 itens por tipo para consistência diagnóstica.</span>
              </div>
            )}
          </div>

          {/* Question Types */}
          <div style={CARD}>
            <label style={SL}> Tipos de questão</label>
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

          {/* Methodologies */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...SL, marginBottom: 0 }}> Metodologias Ativas</label>
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

          {/* NEE */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...SL, marginBottom: 0 }}> Adaptação NEE</label>
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

          {/* BLOCO: Cognição & Dificuldade Psicométrica */}
          <details style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
            <summary style={{ padding: '10px 14px', background: '#f5f0fb', cursor: 'pointer', fontWeight: 700, color: '#5e2a84', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span>🧠</span>
              <span>Cognição & Dificuldade (Bloom)</span>
            </summary>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#586e75', marginBottom: 4, fontWeight: 600 }}>Taxonomia de Bloom:</div>
                {([
                  ['Lembrar / Compreender', bloomRemember, setBloomRemember, '#2aa198'],
                  ['Aplicar', bloomApply, setBloomApply, '#268bd2'],
                  ['Analisar', bloomAnalyze, setBloomAnalyze, '#6c71c4'],
                  ['Avaliar / Criar', bloomEvaluate, setBloomEvaluate, '#d33682']
                ] as [string, number, (v: number) => void, string][]).map(([label, val, setter, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <label style={{ fontSize: 11, width: 130, color: '#586e75' }}>{label}</label>
                    <input type="range" min={0} max={100} value={val} onChange={e => setter(Number(e.target.value))} style={{ flex: 1, accentColor: color }} />
                    <span style={{ fontSize: 11, width: 30, textAlign: 'right', fontWeight: 700, color }}>{val}%</span>
                  </div>
                ))}
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid #ede8dc', margin: '2px 0' }} />
              <div>
                <div style={{ fontSize: 11, color: '#586e75', marginBottom: 4, fontWeight: 600 }}>Dificuldade dos Itens:</div>
                {([
                  ['Fácil (p > 0.70)', diffEasy, setDiffEasy, '#2aa198'],
                  ['Médio (p ≈ 0.50)', diffMedium, setDiffMedium, '#b58900'],
                  ['Difícil (p < 0.45)', diffHard, setDiffHard, '#dc322f'],
                  ['⭐ Desafio', diffChallenge, setDiffChallenge, '#cb4b16']
                ] as [string, number, (v: number) => void, string][]).map(([label, val, setter, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <label style={{ fontSize: 11, width: 130, color: '#586e75' }}>{label}</label>
                    <input type="range" min={0} max={100} value={val} onChange={e => setter(Number(e.target.value))} style={{ flex: 1, accentColor: color }} />
                    <span style={{ fontSize: 11, width: 30, textAlign: 'right', fontWeight: 700, color }}>{val}%</span>
                  </div>
                ))}
              </div>
            </div>
          </details>

        </div>

        {/* RIGHT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

          {/* Quality badge */}
          {(checking || factCheck) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderRadius: 12, border: `1px solid ${fcColor}33`, flexShrink: 0 }}>
              {checking
                ? <><i className="ti ti-loader-2" style={{ color: '#93a1a1', animation: 'spin 1s linear infinite' }} /> <span style={{ fontSize: 13, color: '#93a1a1' }}>Verificando qualidade pedagógica</span></>
                : factCheck && (
                  <>
                    <i className={`ti ${factCheck.level === 'ok' ? 'ti-shield-check' : factCheck.level === 'warn' ? 'ti-alert-triangle' : 'ti-shield-x'}`} style={{ color: fcColor, fontSize: 20 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: fcColor }}>
                        {factCheck.level === 'ok' ? ` Conteúdo validado Qualidade ${factCheck.score}/100` :
                          factCheck.level === 'warn' ? ` Revisar Qualidade ${factCheck.score}/100` :
                            ` Problemas encontrados Qualidade ${factCheck.score}/100`}
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

          {/* Export Toolbar */}
          {result && (
            <div style={{
              background: '#fdf8f2', padding: '10px 16px', borderRadius: 14,
              border: '1.5px solid #ede8dc', display: 'flex', flexWrap: 'wrap',
              justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => exportToPdf({
                    schoolName: header.school || 'ESCOLA DE IDIOMAS & ENSINO',
                    teacherName: header.teacher || 'Professor(a)',
                    className: grade || '8º Ano',
                    title: header.title || (topic ? `ATIVIDADE ${topic.toUpperCase()}` : 'ATIVIDADE DE FIXAÇÃO'),
                    content: result
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: 'none',
                    background: '#8b5e3c', color: '#fff', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  Exportar PDF Oficial
                </button>

                <button
                  onClick={() => exportToWord({
                    schoolName: header.school || 'ESCOLA DE IDIOMAS & ENSINO',
                    teacherName: header.teacher || 'Professor(a)',
                    className: grade || '8º Ano',
                    title: header.title || (topic ? `ATIVIDADE ${topic.toUpperCase()}` : 'ATIVIDADE DE FIXAÇÃO'),
                    content: result
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: '1px solid #c0a080',
                    background: '#fffcf8', color: '#8b5e3c', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  Exportar Word (.docx)
                </button>
              </div>

              <div style={{ fontSize: 12, color: '#8b5e3c', fontWeight: 600 }}>
                Pronto para impressão
              </div>
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
                school: header.school || 'Nome da Escola',
                teacher: header.teacher || 'Professor(a)',
                title: header.title || topic || 'Exercício Gerado',
              }}
              onHeaderChange={patch => setHeader(h => ({
                ...h,
                ...(patch.headerSchool !== undefined ? { school: patch.headerSchool } : {}),
                ...(patch.headerTeacher !== undefined ? { teacher: patch.headerTeacher } : {}),
                ...(patch.headerTitle !== undefined ? { title: patch.headerTitle } : {}),
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