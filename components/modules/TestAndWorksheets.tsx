'use client'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useCallback } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'
import { generateListeningAudio } from '@/lib/audioGenerator'
import AudioPlayerCard from '@/components/AudioPlayerCard'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { PEDAGOGICAL_METHODOLOGIES, buildMethodologyInstructions } from '@/lib/pedagogicalMethodologies'
import PresetSelector from '@/components/PresetSelector'
import { exportToPdf, exportToWord, generateSvgQRCode } from '@/lib/exportUtils'
import StudentExamPlayer, { OnlineQuestion } from '@/components/modules/StudentExamPlayer'
import SourceKnowledgeHub, { SourceItem, KnowledgeMode, compileSourcesPrompt } from '@/components/SourceKnowledgeHub'
import SmartInsightsPanel from '@/components/modules/SmartInsightsPanel'
import { AssessmentPreset, getStoredPresets, savePreset } from '@/lib/assessmentPresets'
import { getTeacherCalibrations, saveModuleCalibration } from '@/lib/teacherCalibrations'
import { addQuestionsBatch } from '@/lib/questionBankService'
import { runFactCheck, FactCheckResult } from '@/lib/factCheck'
import VoiceButton from '@/components/VoiceButton'
import EditableQuestionBoxes, {
  EditableQuestionItem,
  parseContentToQuestions,
  compileQuestionsToHtml
} from '@/components/EditableQuestionBoxes'
import QuestionCountByTypeList, {
  QuestionTypeCountMap,
  DEFAULT_QUESTION_COUNTS,
  computeTotalQuestions,
  buildQuestionDistributionPrompt
} from '@/components/QuestionCountByTypeList'
import PedagogicalMethodologiesAccordion from '@/components/PedagogicalMethodologiesAccordion'
import {
  getSubjectProfile,
  getExamSections,
  getLevelIds,
  getLevelGatingRule,
  getDistractorBlock,
  getAllSubjectProfiles,
  type SubjectProfile,
} from '@/lib/subjectProfile'
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'

// Types
export type ContentMode = 'exam' | 'worksheet'

interface HeaderState {
  school: string
  teacher: string
  classGroup: string
  title: string
}

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

// Helpers de Estilo
const SL: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 6 }
const SS: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const, cursor: 'pointer' }
const SI: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit' }
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(44,26,14,0.05)', border: '1px solid #ede8dc' }

function loadApis(): ApiConfig[] {
  try {
    const { getAvailableApisForSelect } = require('@/lib/autoApiSelector')
    return getAvailableApisForSelect()
  } catch { return [] }
}

function loadConfig(): { school: string; teacher: string } {
  try { return JSON.parse(localStorage.getItem('teacher_cfg') || '{}') } catch { return { school: '', teacher: '' } }
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

interface TestAndWorksheetsProps {
  initialMode?: ContentMode
}

export default function TestAndWorksheets({ initialMode = 'exam' }: TestAndWorksheetsProps) {
  const cal = getTeacherCalibrations().exam

  // Modo Ativo: Prova Oficial (Exam) vs Lista de Exercícios (Worksheet)
  const [mode, setMode] = useState<ContentMode>(initialMode)

  // Perfil da Matéria
  const [subjectId, setSubjectId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const activeClass = localStorage.getItem('teacher_active_class_subject')
        if (activeClass) return activeClass
        const settings = JSON.parse(localStorage.getItem('teacher_settings') || '{}')
        if (settings.defaultSubject) return settings.defaultSubject
      } catch {}
    }
    return 'english'
  })
  const activeProfile = getSubjectProfile(subjectId)
  const SECTIONS = getExamSections(activeProfile)
  const CEFR = getLevelIds(activeProfile).length > 0 ? getLevelIds(activeProfile) : ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

  // Form State
  const [topic, setTopic] = useState('')
  const [cefr, setCefr] = useState(() => cal.defaultLevel || 'B1')
  const [grade, setGrade] = useState('9º Fund.')
  const [sections, setSections] = useState<string[]>(() => cal.defaultSections || ['Grammar', 'Vocabulary', 'Reading Comprehension'])
  const [skill, setSkill] = useState('Reading Comprehension')
  const [approach, setApproach] = useState<string[]>(() => cal.defaultApproach || ['Cambridge'])
  const [customPrompt, setCustomPrompt] = useState('')
  const [stemLanguage, setStemLanguage] = useState<'pt' | 'en'>(() => cal.defaultStemLanguage || 'pt')
  const [optionLanguage, setOptionLanguage] = useState<'en' | 'pt'>(() => cal.defaultOptionLanguage || 'en')

  // Numerador por Tipo de Exercício
  const [questionCounts, setQuestionCounts] = useState<QuestionTypeCountMap>(DEFAULT_QUESTION_COUNTS)

  // Adaptações & NEE (Worksheet)
  const [neeProfile, setNeeProfile] = useState('')
  const [showNeePanel, setShowNeePanel] = useState(false)

  // Prova Específico (Exam)
  const [totalScore, setTotalScore] = useState(() => cal.defaultTotalScore || 10)
  const [examDuration, setExamDuration] = useState(() => cal.defaultDurationMinutes || 50)
  const [kioskMode, setKioskMode] = useState(() => cal.kioskModeDefault || false)
  const [generateFormB, setGenerateFormB] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [accent, setAccent] = useState<'US' | 'UK'>('US')
  const [showOnlineModal, setShowOnlineModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)

  // Bloom & Dificuldade
  const [bloomRemember, setBloomRemember] = useState(25)
  const [bloomApply, setBloomApply] = useState(30)
  const [bloomAnalyze, setBloomAnalyze] = useState(25)
  const [bloomEvaluate, setBloomEvaluate] = useState(20)
  const [diffEasy, setDiffEasy] = useState(20)
  const [diffMedium, setDiffMedium] = useState(50)
  const [diffHard, setDiffHard] = useState(25)
  const [diffChallenge, setDiffChallenge] = useState(5)

  // Header State & Escolas
  const [header, setHeader] = useState<HeaderState>({ school: '', teacher: '', classGroup: '', title: '' })
  const [registeredSchools, setRegisteredSchools] = useState<Array<{ id: string; name: string }>>([])
  const [selectedSchoolTemplate, setSelectedSchoolTemplate] = useState<string>('')
  const [hideHeader, setHideHeader] = useState(false)

  // Multi-Source Hub
  const [sources, setSources] = useState<SourceItem[]>([])
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>('hybrid')

  // Visualização & Documento
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeViewTab, setActiveViewTab] = useState<'boxes' | 'canvas'>('boxes')
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null)
  const [checkingFact, setCheckingFact] = useState(false)

  // APIs
  const [apis, setApis] = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState<string>('')
  const [savedDrawerMode, setSavedDrawerMode] = useState<'exam' | 'worksheet' | null>(null)
  const [savedExamsCount, setSavedExamsCount] = useState(0)
  const [savedWorksheetsCount, setSavedWorksheetsCount] = useState(0)

  // Sincroniza contagens salvas
  const updateCounts = () => {
    try { setSavedExamsCount(JSON.parse(localStorage.getItem('teacher_saved_exams') || '[]').length) } catch { setSavedExamsCount(0) }
    try { setSavedWorksheetsCount(JSON.parse(localStorage.getItem('teacher_saved_quicks') || '[]').length) } catch { setSavedWorksheetsCount(0) }
  }

  useEffect(() => {
    updateCounts()
    window.addEventListener('storage', updateCounts)
    return () => window.removeEventListener('storage', updateCounts)
  }, [])

  // Inicialização de APIs e Config
  useEffect(() => {
    const cfg = loadConfig()
    const a = loadApis()
    setHeader(h => ({ ...h, school: cfg.school || '', teacher: cfg.teacher || '' }))
    setApis(a)
    if (a.length > 0) setSelectedApiId(a[0].id)

    try {
      const sStr = localStorage.getItem('teacher_schools')
      if (sStr) {
        const parsed = JSON.parse(sStr)
        if (Array.isArray(parsed) && parsed.length > 0 && !cfg.school) {
          setRegisteredSchools(parsed)
          setHeader(h => ({ ...h, school: parsed[0].name }))
          setSelectedSchoolTemplate(parsed[0].id)
        }
      }
    } catch {}

    // Escuta eventos de prefill (tanto de exame quanto de exercício rápido)
    const handlePrefill = (e: any) => {
      try {
        const examRaw = localStorage.getItem('teacher_exam_prefill')
        const quickRaw = localStorage.getItem('teacher_quick_prefill')

        if (examRaw) {
          const p = JSON.parse(examRaw)
          setMode('exam')
          if (p.topic) setTopic(p.topic)
          if (p.level) setCefr(p.level)
          if (p.classRef) setGrade(p.classRef)
          localStorage.removeItem('teacher_exam_prefill')
        } else if (quickRaw) {
          const p = JSON.parse(quickRaw)
          setMode('worksheet')
          if (p.topic) setTopic(p.topic)
          localStorage.removeItem('teacher_quick_prefill')
        } else if (e?.detail) {
          if (e.detail.mode === 'worksheet' || e.detail.type === 'exercise') setMode('worksheet')
          else setMode('exam')
          if (e.detail.topic) setTopic(e.detail.topic)
          if (e.detail.level) setCefr(e.detail.level)
        }
      } catch {}
    }

    window.addEventListener('teacher:exam_prefill', handlePrefill)
    window.addEventListener('teacher:quick_prefill', handlePrefill)
    handlePrefill(null)

    return () => {
      window.removeEventListener('teacher:exam_prefill', handlePrefill)
      window.removeEventListener('teacher:quick_prefill', handlePrefill)
    }
  }, [])

  const selectedApi = apis.find(a => a.id === selectedApiId) || apis[0] || { id: 'auto', name: '⚡ IA Automática', provider: 'auto', key: '', model: '', active: true }

  const toggleSection = (s: string) => setSections(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  // Helper para extrair questões do texto para o Player Online
  const parseQuestionsForPlayer = (text: string): OnlineQuestion[] => {
    const items = parseContentToQuestions(text)
    return items.map(it => ({
      id: String(it.number),
      stem: it.stem,
      type: it.options && it.options.length > 0 ? 'multiple_choice' : 'text',
      options: it.options ? it.options.map(o => `${o.letter}) ${o.text}`) : undefined
    }))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GERAÇÃO UNIFICADA (PROVA VS LISTA DE EXERCÍCIOS)
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleGenerateContent() {
    setLoading(true); setResult(''); setError(''); setFactCheck(null)

    const totalQuestions = computeTotalQuestions(questionCounts) || 10
    const distributionText = buildQuestionDistributionPrompt(questionCounts)
    const methInstructions = buildMethodologyInstructions(approach)
    const levelGatingRule = getLevelGatingRule(activeProfile, cefr) || ''
    const distractorBlock = getDistractorBlock(activeProfile)

    const effectiveTitle = header.title || (topic ? `${mode === 'exam' ? 'Prova' : 'Exercício'} ${topic}` : `${mode === 'exam' ? 'Avaliação' : 'Atividade'} (${cefr})`)
    setHeader(h => ({ ...h, title: effectiveTitle }))

    try {
      let libContext = ''
      const compiled = compileSourcesPrompt(sources, knowledgeMode)
      if (compiled.activeCount > 0) {
        libContext = compiled.promptContext
      } else {
        const { searchLibraryContext, buildRagPromptContext } = await import('@/lib/ragEngine')
        const chunks = searchLibraryContext(topic || sections.join(' ') || 'English', { limit: 3 })
        if (chunks.length > 0) libContext = buildRagPromptContext(chunks)
      }

      const librarySection = libContext
        ? `\n${libContext}\nREGRA FUNDAMENTAL: Use o material acima estritamente como BASE DE CONTEÚDO E VOCABULÁRIO. Crie QUESTÕES 100% INÉDITAS E NOVAS.\n`
        : ''

      const stemInstruction = stemLanguage === 'pt' || activeProfile.examLanguage === 'pt-BR'
        ? 'IDIOMA DOS ENUNCIADOS: Escreva todos os enunciados e instruções em PORTUGUÊS.'
        : 'IDIOMA DOS ENUNCIADOS: Write all instructions and question stems strictly in ENGLISH.'

      const optionInstruction = optionLanguage === 'pt' || activeProfile.examLanguage === 'pt-BR'
        ? 'IDIOMA DAS ALTERNATIVAS: As opções e respostas devem ser em PORTUGUÊS.'
        : 'IDIOMA DAS ALTERNATIVAS: As opções e respostas devem ser estritamente em INGLÊS.'

      let prompt = ''

      if (mode === 'exam') {
        // PROMPT DE PROVA OFICIAL
        prompt = `Você é um examinador sênior especialista em Psicometria e elaboração científica de itens de avaliação para ${activeProfile.name}. Crie uma PROVA COMPLETA de altíssimo rigor psicométrico em HTML limpo.
${librarySection}
ESPECIFICAÇÕES DA AVALIAÇÃO:
- Matéria: ${activeProfile.name}
- Escola: ${header.school || 'Escola'}
- Professor(a): ${header.teacher || 'Professor(a)'}
- Turma: ${header.classGroup || grade} (${grade})
- Nível: ${cefr}
- Quantidade Obrigatória: EXATAMENTE ${totalQuestions} QUESTÕES COMPLETAS (1 a ${totalQuestions})
- Tópico Central: ${topic || 'Conteúdo bimestral'}
- Seções do Exame: ${sections.join(', ')}
- ${stemInstruction}
- ${optionInstruction}
${distributionText}
${customPrompt ? `\nDIRETRIZES DO PROFESSOR:\n"${customPrompt}"\n` : ''}
${methInstructions}
${levelGatingRule}

=== DISTRIBUIÇÃO COGNITIVA & DIFICULDADE (BLOOM) ===
- LEMBRAR/COMPREENDER (${bloomRemember}%) | APLICAR (${bloomApply}%) | ANALISAR (${bloomAnalyze}%) | AVALIAR/CRIAR (${bloomEvaluate}%)
- Dificuldade: Fácil (${diffEasy}%), Médio (${diffMedium}%), Difícil (${diffHard}%), Desafio (${diffChallenge}%)
${distractorBlock}

ESTRUTURA OBRIGATÓRIA:
1. Container: <div class="exam-document" data-total-score="${totalScore}" data-duration-minutes="${examDuration}">
2. Para cada seção: <h2> com título da seção e <div class="question-item"> para cada questão numerada.
3. Ao final: <h2>Gabarito & Critérios de Correção</h2> com respostas e explicações de distratores.

Gere agora todas as ${totalQuestions} questões completas em HTML limpo:`
      } else {
        // PROMPT DE LISTA DE EXERCÍCIOS / WORKSHEET
        prompt = `Você é um professor especialista em ${activeProfile.name}, Design Instrucional e Aprendizagem Ativa. Crie uma LISTA DE EXERCÍCIOS / WORKSHEET rica e contextualizada em HTML limpo.
${librarySection}
ESPECIFICAÇÕES DO EXERCÍCIO:
- Matéria: ${activeProfile.name}
- Escola: ${header.school || 'Escola'}
- Professor(a): ${header.teacher || 'Professor(a)'}
- Turma: ${header.classGroup || grade} (${grade})
- Nível: ${cefr}
- Habilidade Foco: ${skill}
- Quantidade Obrigatória: EXATAMENTE ${totalQuestions} ITENS (1 a ${totalQuestions})
- Tema: ${topic || 'Exercício de fixação e prática'}
- ${stemInstruction}
- ${optionInstruction}
${distributionText}
${customPrompt ? `\nDIRETRIZES DO PROFESSOR:\n"${customPrompt}"\n` : ''}
${neeProfile ? `\nADAPTAÇÃO ESPECIAL (NEE): Adaptar para perfil ${neeProfile}.` : ''}
${methInstructions}

ESTRUTURA OBRIGATÓRIA:
1. Comece com <h2>${effectiveTitle}</h2>
2. Cada questão numerada de 1 a ${totalQuestions} com enunciado claro e contextualizado.
3. Ao final: <h2>Gabarito Comentado</h2> cobrindo todas as questões.

Gere agora todas as ${totalQuestions} questões completas em HTML limpo:`
      }

      const raw = await callApi(selectedApi, prompt)
      const html = cleanHtml(raw)
      setResult(html)

      // Auto-save no Repositório Unificado (Zero-Leakage)
      try {
        const itemType = mode === 'exam' ? 'exam' : 'exercise'
        const storageKey = mode === 'exam' ? 'teacher_saved_exams' : 'teacher_saved_quicks'
        saveItemToStorage(storageKey, {
          title: effectiveTitle,
          subtitle: `${cefr} · ${grade} · ${mode === 'exam' ? sections.slice(0, 2).join(', ') : skill}`,
          content: html,
        })
        updateCounts()

        // Sincroniza com o banco de itens da escola
        addQuestionsBatch([{
          id: `${mode}_auto_${Date.now()}`,
          statement: html.slice(0, 300) + '...',
          type: 'mc',
          activityKind: itemType,
          subject: activeProfile.nameShort || 'Inglês',
          topic: topic || 'Conteúdo',
          level: cefr,
          year: new Date().getFullYear().toString(),
          schoolId: header.school || '',
          classRef: grade || '',
          tags: [mode === 'exam' ? 'Prova Oficial' : 'Lista de Exercícios', `${activeProfile.levelFramework.name} ${cefr}`],
          createdAt: Date.now(),
          source: 'ai',
          fullContent: html
        } as any])
      } catch {}

      // Executa Fact-Check no modo Worksheet
      if (mode === 'worksheet') {
        try {
          setCheckingFact(true)
          const fc = await runFactCheck(html, grade, 'Exercício', selectedApi)
          setFactCheck(fc)
        } catch {} finally { setCheckingFact(false) }
      }

    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar conteúdo.')
    } finally {
      setLoading(false)
    }
  }

  // Assistente Rafinha para Ajustar Questão Individual
  async function handleAskRafinhaForQuestion(
    questionIndex: number,
    currentQuestion: EditableQuestionItem,
    userInstruction: string
  ): Promise<string | void> {
    if (!selectedApi) return
    const prompt = `Você é a assistente pedagógica Rafinha IA. Reformule a seguinte questão de ${mode === 'exam' ? 'prova' : 'exercício'} conforme a instrução do professor:
INSTRUÇÃO DO PROFESSOR: "${userInstruction}"
QUESTÃO ATUAL:
Tipo: ${currentQuestion.typeLabel}
Enunciado: ${currentQuestion.stem}
${currentQuestion.options ? `Alternativas:\n${currentQuestion.options.map(o => `${o.letter}) ${o.text}`).join('\n')}` : ''}
Gabarito atual: ${currentQuestion.answerKey || 'Não definido'}

Retorne a questão reformulada no formato estruturado:`

    const raw = await callApi(selectedApi, prompt)
    const newQuestions = parseContentToQuestions(raw)
    if (newQuestions.length > 0) {
      const parsed = parseContentToQuestions(result)
      parsed[questionIndex] = {
        ...parsed[questionIndex],
        stem: newQuestions[0].stem,
        options: newQuestions[0].options || parsed[questionIndex].options,
        answerKey: newQuestions[0].answerKey || parsed[questionIndex].answerKey
      }
      setResult(compileQuestionsToHtml(parsed))
    }
  }

  async function handleGenerateAudio() {
    if (!result) return
    setAudioLoading(true)
    try {
      const cleanText = result.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 800)
      const res = await generateListeningAudio({ text: cleanText, accent })
      setAudioUrl(res.audioUrl)
    } catch (e: any) {
      toast.success(`Falha ao gerar áudio: ${e?.message || 'Erro'}`)
    } finally {
      setAudioLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px 36px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

      {/* HEADER & SELETOR DE MODO (TEST VS WORKSHEET) */}
      <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <h1 style={{ textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
          Test and Worksheets
        </h1>

        {/* Chave Seletora de Modo */}
        <div style={{
          display: 'inline-flex',
          background: '#ede8dc',
          padding: '4px',
          borderRadius: 14,
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.06)',
          gap: 4
        }}>
          <button
            type="button"
            onClick={() => setMode('exam')}
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              border: 'none',
              background: mode === 'exam' ? '#8b5e3c' : 'transparent',
              color: mode === 'exam' ? '#fff' : '#7a5c42',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            📝 Prova & Avaliação Oficial (Exam)
          </button>

          <button
            type="button"
            onClick={() => setMode('worksheet')}
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              border: 'none',
              background: mode === 'worksheet' ? '#8b5e3c' : 'transparent',
              color: mode === 'worksheet' ? '#fff' : '#7a5c42',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            📑 Lista de Exercícios / Fixação (Worksheet)
          </button>
        </div>

        {/* Ações de Drawer & Histórico */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSavedDrawerMode('exam')}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 12, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer' }}
          >
            📁 Provas Salvas ({savedExamsCount})
          </button>
          <button
            onClick={() => setSavedDrawerMode('worksheet')}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 12, fontWeight: 700, color: '#268bd2', cursor: 'pointer' }}
          >
            📁 Exercícios Salvos ({savedWorksheetsCount})
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(220,50,47,0.08)', border: '1px solid rgba(220,50,47,0.2)', borderRadius: 10, padding: '10px 16px', color: '#dc322f', fontSize: 13, marginBottom: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* GRID PRINCIPAL */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 460px) 1fr', gap: 28, flex: 1, minHeight: 0 }}>

        {/* COLUNA ESQUERDA: CONFIGURAÇÕES E FORMULÁRIO */}
        <div style={{ overflowY: 'auto', paddingRight: 8, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Botão de Geração */}
          <button
            onClick={handleGenerateContent}
            disabled={loading}
            style={{
              padding: '14px 20px',
              borderRadius: 14,
              background: loading ? '#a08060' : 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 4px 16px rgba(139,94,60,0.3)'
            }}
          >
            {loading ? '⚡ Construindo com Rigor Pedagógico...' : `✨ Gerar ${mode === 'exam' ? 'Prova Oficial Completa' : 'Lista de Exercícios Completa'}`}
          </button>

          {/* Seletor de Modelo IA */}
          <div style={CARD}>
            <label style={SL}>🤖 Modelo de IA</label>
            <select value={selectedApiId} onChange={e => setSelectedApiId(e.target.value)} style={SS}>
              {apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Multi-Source Hub */}
          <SourceKnowledgeHub
            sources={sources}
            onChangeSources={setSources}
            knowledgeMode={knowledgeMode}
            onChangeKnowledgeMode={setKnowledgeMode}
            title="Fontes de Conhecimento (Estilo NotebookLM)"
            description="Selecione livros, PDFs, anotações ou pesquise na Web para embasar as questões."
          />

          {/* Numerador por Tipo de Exercício */}
          <QuestionCountByTypeList
            counts={questionCounts}
            onChange={setQuestionCounts}
          />

          {/* Dados Gerais da Turma & Tópico */}
          <div style={CARD}>
            <label style={SL}>📌 Tópico / Tema da Atividade:</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Ex: Simple Past, Meio Ambiente, Leitura Crítica..."
                style={SI}
              />
              <VoiceButton onResult={t => setTopic(p => p ? `${p} ${t}` : t)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={SL}>Nível ({activeProfile.levelFramework.name}):</label>
                <select value={cefr} onChange={e => setCefr(e.target.value)} style={SS}>
                  {CEFR.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={SL}>Ano / Série:</label>
                <select value={grade} onChange={e => setGrade(e.target.value)} style={SS}>
                  {GRADES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {mode === 'worksheet' && (
              <div style={{ marginTop: 10 }}>
                <label style={SL}>🎯 Habilidade Foco:</label>
                <select value={skill} onChange={e => setSkill(e.target.value)} style={SS}>
                  {['Reading Comprehension', 'Grammar in Context', 'Vocabulary & Collocations', 'Writing & Text Production', 'Listening & Pronunciation', 'Use of English'].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Seções da Prova (Apenas no Modo Exame) */}
          {mode === 'exam' && (
            <div style={CARD}>
              <label style={{ ...SL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Seções do Exame:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {SECTIONS.map(({ key, icon, sub }) => {
                  const on = sections.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSection(key)}
                      style={{
                        textAlign: 'left', padding: '8px 10px', borderRadius: 10,
                        border: on ? '1.5px solid #8b5e3c' : '1px solid #e4ddd0',
                        background: on ? '#fdf8f2' : '#fafafa',
                        color: on ? '#8b5e3c' : '#7a5c42',
                        cursor: 'pointer', fontSize: 12, fontWeight: 700
                      }}
                    >
                      <i className={`ti ${icon}`} style={{ marginRight: 6 }} /> {key}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Caixas Retráteis de Metodologias (Científicas & do Inglês), Abordagens, Marcos e Taxonomia */}
          <PedagogicalMethodologiesAccordion
            selectedIds={approach}
            onChange={setApproach}
            bloomRemember={bloomRemember}
            setBloomRemember={setBloomRemember}
            bloomApply={bloomApply}
            setBloomApply={setBloomApply}
            bloomAnalyze={bloomAnalyze}
            setBloomAnalyze={setBloomAnalyze}
            bloomEvaluate={bloomEvaluate}
            setBloomEvaluate={setBloomEvaluate}
          />

          {/* NEE Adaptações (Worksheet) */}
          {mode === 'worksheet' && (
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ ...SL, margin: 0 }}>Adaptação NEE (Inclusão)</label>
                <button
                  type="button"
                  onClick={() => setShowNeePanel(!showNeePanel)}
                  style={{ padding: '3px 10px', borderRadius: 12, border: 'none', background: showNeePanel ? '#8b5e3c' : '#f5efe6', color: showNeePanel ? '#fff' : '#665c54', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  {showNeePanel ? 'Ocultar' : 'Configurar'}
                </button>
              </div>
              {showNeePanel && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNeeProfile('')}
                    style={{ padding: '4px 10px', borderRadius: 8, border: !neeProfile ? '1.5px solid #8b5e3c' : '1px solid #d5c8bb', background: !neeProfile ? '#8b5e3c' : '#fff', color: !neeProfile ? '#fff' : '#2c1a0e', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Padrão
                  </button>
                  {NEE_PROFILES.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNeeProfile(p.id)}
                      style={{ padding: '4px 10px', borderRadius: 8, border: neeProfile === p.id ? `1.5px solid ${p.color}` : '1px solid #d5c8bb', background: neeProfile === p.id ? p.color : '#fff', color: neeProfile === p.id ? '#fff' : '#2c1a0e', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <i className={`ti ${p.icon}`} /> {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Configurações de Cabeçalho Oficial */}
          <div style={CARD}>
            <label style={SL}>🏫 Cabeçalho Oficial</label>
            <input
              value={header.school}
              onChange={e => setHeader(h => ({ ...h, school: e.target.value }))}
              placeholder="Nome da Escola"
              style={{ ...SI, marginBottom: 8 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input value={header.teacher} onChange={e => setHeader(h => ({ ...h, teacher: e.target.value }))} placeholder="Professor(a)" style={SI} />
              <input value={header.classGroup} onChange={e => setHeader(h => ({ ...h, classGroup: e.target.value }))} placeholder="Turma (ex: 9º B)" style={SI} />
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: DOCUMENTO & BOXES EDITÁVEIS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

          {/* Listening Track (se houver no modo exame) */}
          {mode === 'exam' && result && (
            <div style={{ background: '#fff', padding: '10px 16px', borderRadius: 14, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🎧</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Listening Track Audio</span>
                <select value={accent} onChange={e => setAccent(e.target.value as any)} style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }}>
                  <option value="US">🇺🇸 US</option>
                  <option value="UK">🇬🇧 UK</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleGenerateAudio}
                disabled={audioLoading}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                {audioLoading ? 'Gerando Áudio MP3...' : '🔊 Gerar Áudio'}
              </button>
            </div>
          )}

          {audioUrl && (
            <AudioPlayerCard audioUrl={audioUrl} title={`Listening Track - ${topic || 'Exam'}`} accent={accent} onDelete={() => setAudioUrl(null)} />
          )}

          {/* Toolbar de Exportação e Ações Rápidas */}
          {result && (
            <div style={{
              background: '#fdf8f2', padding: '10px 16px', borderRadius: 14,
              border: '1.5px solid #ede8dc', display: 'flex', flexWrap: 'wrap',
              justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => exportToPdf({
                    schoolName: header.school || 'ESCOLA DE ENSINO & IDIOMAS',
                    teacherName: header.teacher || 'Professor(a)',
                    className: grade || '9º Ano',
                    title: header.title || (topic ? `${mode === 'exam' ? 'PROVA' : 'ATIVIDADE'} ${topic.toUpperCase()}` : 'AVALIAÇÃO'),
                    content: result
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: 'none',
                    background: '#8b5e3c', color: '#fff', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <i className="ti ti-printer" /> Exportar PDF Oficial
                </button>

                <button
                  onClick={() => exportToWord({
                    schoolName: header.school || 'ESCOLA DE ENSINO & IDIOMAS',
                    teacherName: header.teacher || 'Professor(a)',
                    className: grade || '9º Ano',
                    title: header.title || (topic ? `${mode === 'exam' ? 'PROVA' : 'ATIVIDADE'} ${topic.toUpperCase()}` : 'AVALIAÇÃO'),
                    content: result
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: '1px solid #c0a080',
                    background: '#fffcf8', color: '#8b5e3c', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <i className="ti ti-file-text" /> Exportar Word (.docx)
                </button>
              </div>

              {mode === 'exam' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowOnlineModal(true)}
                    style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#2d9d5d', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    🚀 Testar Prova Online
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Alternador de Visualização: Boxes Editáveis vs Folha Formatada */}
          {result && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fff',
              padding: '8px 16px',
              borderRadius: 14,
              border: '1px solid #ede8dc',
              boxShadow: '0 2px 8px rgba(44,26,14,0.03)',
              flexShrink: 0
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e' }}>
                Visualização & Edição:
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setActiveViewTab('boxes')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 10,
                    border: activeViewTab === 'boxes' ? '1.5px solid #8b5e3c' : '1px solid #d5c8bb',
                    background: activeViewTab === 'boxes' ? '#8b5e3c' : '#fff',
                    color: activeViewTab === 'boxes' ? '#fff' : '#2c1a0e',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  📑 Boxes Editáveis & Reordenação
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab('canvas')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 10,
                    border: activeViewTab === 'canvas' ? '1.5px solid #8b5e3c' : '1px solid #d5c8bb',
                    background: activeViewTab === 'canvas' ? '#8b5e3c' : '#fff',
                    color: activeViewTab === 'canvas' ? '#fff' : '#2c1a0e',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  📄 Folha Formatada / Canvas Oficial
                </button>
              </div>
            </div>
          )}

          {/* Container do Documento */}
          <div style={{ flex: 1, overflowY: 'auto', borderRadius: 20, border: '1px solid #ede8dc', boxShadow: '0 4px 24px rgba(44,26,14,0.04)', background: '#fff', minHeight: 0 }}>
            {!result && !loading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a08060', gap: 16, padding: 32 }}>
                <span style={{ fontSize: 56, opacity: 0.3 }}>📝</span>
                <p style={{ fontSize: 16 }}>Sua avaliação ou lista de exercícios aparecerá aqui</p>
              </div>
            ) : loading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', border: '5px solid #f0e8d8', borderTopColor: '#8b5e3c', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ color: '#7a5c42', fontSize: 14 }}>Elaborando com psicometria e didática...</p>
              </div>
            ) : activeViewTab === 'boxes' ? (
              <div style={{ padding: 18 }}>
                <EditableQuestionBoxes
                  initialContent={result}
                  onContentChange={setResult}
                  onAskRafinhaForQuestion={handleAskRafinhaForQuestion}
                />
              </div>
            ) : (
              <DocumentCanvas
                content={result}
                onContentChange={setResult}
                hideHeader={hideHeader}
                onToggleHeader={() => setHideHeader(h => !h)}
                headerData={{
                  school: header.school || 'Nome da Escola',
                  teacher: header.teacher || 'Professor(a)',
                  title: header.title || (topic ? `${mode === 'exam' ? 'Prova' : 'Exercício'} ${topic}` : 'Documento'),
                }}
                onHeaderChange={patch => setHeader(h => ({
                  ...h,
                  ...(patch.headerSchool !== undefined ? { school: patch.headerSchool } : {}),
                  ...(patch.headerTeacher !== undefined ? { teacher: patch.headerTeacher } : {}),
                  ...(patch.headerTitle !== undefined ? { title: patch.headerTitle } : {}),
                }))}
              />
            )}
          </div>
        </div>
      </div>

      {/* Drawer de Itens Salvos */}
      {savedDrawerMode && (
        <SavedItemsDrawer
          isOpen={!!savedDrawerMode}
          onClose={() => setSavedDrawerMode(null)}
          title={savedDrawerMode === 'exam' ? 'Minhas Provas Salvas' : 'Meus Exercícios Salvos'}
          storageKey={savedDrawerMode === 'exam' ? 'teacher_saved_exams' : 'teacher_saved_quicks'}
          onSelect={(item: SavedItem) => {
            setResult(item.content)
            setMode(savedDrawerMode)
            setSavedDrawerMode(null)
          }}
        />
      )}

      {/* Modal: Player de Prova Online */}
      {showOnlineModal && result && (
        <StudentExamPlayer
          title={header.title || (topic ? `Prova ${topic}` : 'Avaliação Online')}
          schoolName={header.school || 'ESCOLA DE ENSINO & IDIOMAS'}
          className={grade || '9º Ano'}
          questions={parseQuestionsForPlayer(result)}
          onClose={() => setShowOnlineModal(false)}
          onComplete={(name, score) => {
            toast.success(`✓ Prova enviada por ${name}! Nota ${score}/10 gravada no Diário de Classe.`)
          }}
        />
      )}
    </div>
  )
}
