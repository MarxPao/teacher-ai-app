'use client'
import { toast, showConfirm } from '@/components/Toast'
import AiProgressStepper from '@/components/AiProgressStepper'

import { useState, useEffect } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'
import { generateListeningAudio } from '@/lib/audioGenerator'
import AudioPlayerCard from '@/components/AudioPlayerCard'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { PEDAGOGICAL_METHODOLOGIES, buildMethodologyInstructions } from '@/lib/pedagogicalMethodologies'
import PresetSelector from '@/components/PresetSelector'
import { exportToPdf, exportToWord, generateSvgQRCode, OFFICIAL_SCHOOL_TEMPLATES } from '@/lib/exportUtils'
import StudentExamPlayer, { OnlineQuestion } from '@/components/modules/StudentExamPlayer'
import SourceKnowledgeHub, { SourceItem, KnowledgeMode, compileSourcesPrompt } from '@/components/SourceKnowledgeHub'
import SmartInsightsPanel from '@/components/modules/SmartInsightsPanel'
import { AssessmentPreset, getStoredPresets, savePreset } from '@/lib/assessmentPresets'
import { getTeacherCalibrations, saveModuleCalibration } from '@/lib/teacherCalibrations'
import { addQuestionsBatch } from '@/lib/questionBankService'
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
import { buildTeacherStyleSystemPrompt } from '@/lib/teacherStyleProfile'
import { createBalancedBlueprint, generateBlueprintPromptSection } from '@/lib/testBlueprintEngine'
import { generateIsomorphicFormB } from '@/lib/examFormTransformer'
// Auto-registra os perfis disponíveis ao carregar o módulo
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'

// Types

interface HeaderState {
  school: string
  teacher: string
  classGroup: string
  title: string
}

// Constants (backward-compat — mantidos para uso interno enquanto perfil não está selecionado)

const GRADES = [
  '6º Fund.', '7º Fund.', '8º Fund.', '9º Fund.',
  '1º Médio', '2º Médio', '3º Médio',
]

// Style helpers 

const SL: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 6 }
const SS: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit', appearance: 'none' as const, cursor: 'pointer' }
const SI: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit' }
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 12px rgba(44,26,14,0.06)', border: '1px solid #ede8dc' }

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
  questionCount: string
  questionDistributionText?: string
  sections: string[]
  approach: string[]
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
  totalScore?: number
  examDurationMinutes?: number
  kioskMode?: boolean
  formVariant?: 'A' | 'B'
  bankContextSnippet?: string
  /** SubjectProfile ativo — se não fornecido, usa inglês (comportamento original) */
  subjectProfile?: SubjectProfile
}): string {
  const methInstructions = buildMethodologyInstructions(opts.approach)
  const profile = opts.subjectProfile ?? getSubjectProfile()

  const librarySection = opts.libraryContext
    ? `\n${opts.libraryContext}\nREGRA FUNDAMENTAL: O conteúdo da base de conhecimento acima deve ser usado estritamente como BASE DE CONTEÚDO, VOCABULÁRIO e CONCEITOS. NUNCA copie ou reproduza questões já prontas do material. Crie QUESTÕES 100% INÉDITAS, NOVAS E ORIGINAIS elaboradas a partir do assunto e nível gramatical presentes no material.\n`
    : ''

  const stemInstruction = opts.stemLanguage === 'pt'
    ? 'IDIOMA DOS ENUNCIADOS: Escreva as instruções, orientações e enunciados de TODAS as questões estritamente em PORTUGUÊS (ex: "1. Leia o texto e responda às perguntas:", "2. Assinale a alternativa correta:").'
    : (profile.examLanguage === 'pt-BR'
        ? 'IDIOMA DOS ENUNCIADOS: Escreva todos os enunciados, instruções e orientações em PORTUGUÊS.'
        : 'IDIOMA DOS ENUNCIADOS: Write all instructions and question stems strictly in ENGLISH (e.g. "1. Read the text and answer the questions:", "2. Choose the correct option:").')

  const optionInstruction = opts.optionLanguage === 'pt'
    ? 'IDIOMA DAS ALTERNATIVAS: As opções (A, B, C, D) e alternativas devem ser formuladas em PORTUGUÊS.'
    : (profile.examLanguage === 'pt-BR'
        ? 'IDIOMA DAS ALTERNATIVAS: As alternativas (A, B, C, D) devem ser formuladas em PORTUGUÊS.'
        : 'IDIOMA DAS ALTERNATIVAS: As opções (A, B, C, D) e respostas devem ser estritamente em INGLÊS.')

  // Nível/framework dinâmico (CEFR para inglês, Ano Escolar para LP, etc.)
  const levelGatingRule = getLevelGatingRule(profile, opts.cefr) || ''

  // Bloco de distratores diagnósticos dinâmico (L1 errors para inglês, erros LP para português, etc.)
  const distractorBlock = getDistractorBlock(profile)

  const bRemember = opts.bloomRemember ?? 25
  const bApply = opts.bloomApply ?? 30
  const bAnalyze = opts.bloomAnalyze ?? 25
  const bEvaluate = opts.bloomEvaluate ?? 20

  const dEasy = opts.diffEasy ?? 20
  const dMedium = opts.diffMedium ?? 50
  const dHard = opts.diffHard ?? 25
  const dChallenge = opts.diffChallenge ?? 5

  const examLangLabel = profile.examLanguage === 'pt-BR' ? 'português' : 'inglês'
  const levelFrameworkName = profile.levelFramework.name  // ex: 'CEFR', 'Ano Escolar BNCC'

  const blueprint = createBalancedBlueprint({
    title: opts.topic || 'Avaliação',
    subject: profile.name,
    totalQuestions: Number(opts.questionCount) || 10,
    topics: opts.topic ? opts.topic.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean) : [opts.topic || 'Conteúdo Central'],
    bloomDistribution: { remember: bRemember, apply: bApply, analyze: bAnalyze, evaluate: bEvaluate },
    difficultyDistribution: { easy: dEasy, medium: dMedium, hard: dHard, challenge: dChallenge }
  })
  const blueprintSection = generateBlueprintPromptSection(blueprint)

  return `Você é um examinador sênior especialista em Psicometria Educacional e elaboração científica de itens de avaliação (Item Writing) para ${profile.name}. Crie uma PROVA COMPLETA de altíssimo rigor psicométrico e pedagógico, formatada em HTML limpo, pronta para impressão.
${librarySection}
ESPECIFICAÇÕES DA PROVA:
- Matéria: ${profile.name}
- Escola: ${opts.header.school || 'Escola'}
- Professor(a): ${opts.header.teacher || 'Professor(a)'}
- Turma: ${opts.header.classGroup || opts.grade}
- Série/Nível: ${opts.grade}
- ${levelFrameworkName}: ${opts.cefr}
- Quantidade Obrigatória de Questões: EXATAMENTE ${opts.questionCount} QUESTÕES COMPLETAS
- Tópico Central: ${opts.topic || 'Conteúdo da matéria'}
- Seções: ${opts.sections.join(', ')}
- Abordagem Pedagógica: ${opts.approach.join(', ')}
- ${stemInstruction}
- ${optionInstruction}
${opts.questionDistributionText ? `\n${opts.questionDistributionText}\n` : ''}
${opts.customPrompt ? `\nDIRETRIZES DO PROFESSOR:\n"${opts.customPrompt}"\n` : ''}
${methInstructions}
${buildTeacherStyleSystemPrompt()}
${blueprintSection}

${levelGatingRule ? `${levelGatingRule}\n` : ''}
=== 1. DISTRIBUIÇÃO COGNITIVA OBRIGATÓRIA (TAXONOMIA DE BLOOM REVISADA) ===
Distribua as ${opts.questionCount} questões rigorosamente nestes percentuais cognitivos:
- LEMBRAR/COMPREENDER (${bRemember}% das questões): Reconhecimento direto, recall de conteúdo, fatos explícitos do texto. Operação mental: identificar/lembrar.
- APLICAR (${bApply}% das questões): Uso de regras em contexto novo, transferência para situações cotidianas. Operação mental: aplicar/executar.
- ANALISAR (${bAnalyze}% das questões): Inferência, tom e intenção do autor, distinção entre fato e opinião, análise estrutural. Operação mental: inferir/diferenciar.
- AVALIAR / CRIAR (${bEvaluate}% das questões): Julgamento crítico fundamentado, síntese de ideias, produção orientada. Operação mental: avaliar/construir.
Rotule cada questão no HTML com: data-bloom="remember|apply|analyze|evaluate|create" e comentário <!-- bloom:nivel -->.

=== 2. CALIBRAÇÃO DE DIFICULDADE (ÍNDICE DE DISCRIMINAÇÃO PSICOMÉTRICA) ===
Distribua a dificuldade pretendida das questões:
- FÁCIL (${dEasy}%): Resposta com apoio contextual claro, vocabulário de alta frequência ($p > 0.70$).
- MÉDIO (${dMedium}%): Requer aplicação de regra combinada ou inferência moderada ($p \\approx 0.45 - 0.70$).
- DIFÍCIL (${dHard}%): Múltiplos passos cognitivos, estruturas complexas ($p < 0.45$).
- ⭐ DESAFIO (${dChallenge}%): Questão analítica de alta discriminação; adicione o selo ⭐ DESAFIO no enunciado.
Rotule cada questão no HTML com: data-difficulty="easy|medium|hard|challenge" e data-weight="1.0|1.5|2.0".

${distractorBlock ? `${distractorBlock}\n` : `=== 3. DESIGN DIAGNÓSTICO DE DISTRATORES ===
Nas questões de Múltipla Escolha, NENHUMA alternativa incorreta (distrator) pode ser aleatória ou absurda. Cada distrator DEVE representar um erro diagnóstico específico e documentável em ${profile.name}.
`}
=== 4. DIRETRIZES CIENTÍFICAS ANTI-CUEING & PARALELISMO (ITEM WRITING GUIDELINES) ===
- ANTI-CUEING: É PROIBIDO repetir no corpo da alternativa correta palavras-chave exclusivas do enunciado que sirvam de "dica gratuita".
- HOMOGENEIDADE DE TAMANHO: As 4 alternativas (A, B, C, D) DEVEM ter extensão semelhante (variação máxima de ±25% no número de caracteres).
- PARALELISMO GRAMATICAL: Todas as alternativas de uma questão DEVEM ter a mesma estrutura sintática.
- EQUILÍBRIO DE GABARITO: Distribua a resposta correta de maneira uniforme entre as letras A, B, C e D ao longo da prova.
- SEM DUPLAS NEGATIVAS: Se usar negação, destaque em caixa alta e negrito: **NÃO**, **EXCETO**, **INCORRETA**.
- INDEPENDÊNCIA: Cada questão DEVE ser autônoma.

${opts.bankContextSnippet ? `=== QUESTÕES JÁ EXISTENTES NO BANCO (NÃO DUPLICAR) ===\n${opts.bankContextSnippet}\n` : ''}
${opts.formVariant === 'B' ? '=== FORMA B (VERSÃO EMBARALHADA) ===\nEsta é a FORMA B da avaliação. Mantenha os mesmos enunciados da Forma A, mas reordene as alternativas A, B, C, D e as questões. Adicione "FORMA B" em destaque no cabeçalho.' : ''}

ESTRUTURA OBRIGATÓRIA DA PROVA:
1. QUANTIDADE RIGOROSA: Exatamente ${opts.questionCount} questões completas numeradas sequencialmente de 1 a ${opts.questionCount}.
2. Container principal: <div class="exam-document" data-total-score="${opts.totalScore ?? 10}" data-duration-minutes="${opts.examDurationMinutes ?? 50}" data-kiosk="${opts.kioskMode ?? false}" data-form-variant="${opts.formVariant ?? 'A'}">
3. Para cada seção (${opts.sections.join(', ')}):
   - Título da seção em <h2>
   - Instruções claras em <p><em>Instruções: ...</em></p>
   - Cada questão em container próprio: <div class="question-item" data-question-num="X" data-bloom="..." data-difficulty="..." data-weight="...">
4. Questões de Leitura/Reading: texto delimitado em <blockquote>
5. Gabarito Comentado Completo: <h2>Gabarito & Critérios de Correção</h2> com a resposta correta de CADA questão E o diagnóstico pedagógico de por que cada distrator representa uma armadilha/erro comum.

REGRAS ABSOLUTAS DE SAÍDA:
1. Retorne APENAS HTML limpo (sem markdown, sem blocos \`\`\`, sem doctype).
2. Tags permitidas: h1, h2, h3, h4, p, ul, ol, li, strong, em, table, thead, tbody, tr, td, th, hr, br, blockquote, span, div.

Gere agora todas as ${opts.questionCount} questões completas com rigor psicométrico:`
}

// Component

export default function ExamBuilder() {
  const cal = getTeacherCalibrations().exam

  // Form
  const [topic, setTopic] = useState('')
  const [cefr, setCefr] = useState(() => cal.defaultLevel || 'B1')
  const [grade, setGrade] = useState('9º Fund.')
  const [questionCount, setQuestionCount] = useState(() => cal.defaultQuestionCount || '10')
  const [questionCounts, setQuestionCounts] = useState<QuestionTypeCountMap>(DEFAULT_QUESTION_COUNTS)
  const [activeViewTab, setActiveViewTab] = useState<'boxes' | 'canvas'>('boxes')

  const [showSmartInsights, setShowSmartInsights] = useState(false)
  const [additionalPromptContext, setAdditionalPromptContext] = useState('')

  const [bloomRemember, setBloomRemember] = useState(25)
  const [bloomApply, setBloomApply] = useState(30)
  const [bloomAnalyze, setBloomAnalyze] = useState(25)
  const [bloomEvaluate, setBloomEvaluate] = useState(20)
  const [diffEasy, setDiffEasy] = useState(20)
  const [diffMedium, setDiffMedium] = useState(50)
  const [diffHard, setDiffHard] = useState(25)
  const [diffChallenge, setDiffChallenge] = useState(5)
  const [totalScore, setTotalScore] = useState(() => cal.defaultTotalScore || 10)
  const [examDuration, setExamDuration] = useState(() => cal.defaultDurationMinutes || 50)
  const [kioskMode, setKioskMode] = useState(() => cal.kioskModeDefault || false)
  const [generateFormB, setGenerateFormB] = useState(false)
  const [savedPresets, setSavedPresets] = useState<AssessmentPreset[]>([])
  const [activePresetName, setActivePresetName] = useState('Padrão Cambridge')
  const [calibrationSavedToast, setCalibrationSavedToast] = useState(false)

  useEffect(() => {
    setSavedPresets(getStoredPresets())
  }, [])

  const applyPreset = (preset: AssessmentPreset) => {
    setBloomRemember(preset.bloomDistribution.remember)
    setBloomApply(preset.bloomDistribution.apply)
    setBloomAnalyze(preset.bloomDistribution.analyze)
    setBloomEvaluate(preset.bloomDistribution.evaluate + (preset.bloomDistribution.create || 0))
    setDiffEasy(preset.difficultyDistribution.easy)
    setDiffMedium(preset.difficultyDistribution.medium)
    setDiffHard(preset.difficultyDistribution.hard)
    setDiffChallenge(preset.difficultyDistribution.challenge)
    setTotalScore(preset.totalScore)
    setExamDuration(preset.examDurationMinutes)
    setKioskMode(preset.kioskMode)
    setActivePresetName(preset.name)
  }

  const saveCurrentAsPreset = () => {
    const name = prompt('Nome do preset de avaliação:')
    if (!name) return
    const newPreset: AssessmentPreset = {
      id: `preset_${Date.now()}`,
      name,
      bloomDistribution: { remember: bloomRemember, understand: 0, apply: bloomApply, analyze: bloomAnalyze, evaluate: bloomEvaluate, create: 0 },
      questionWeights: { mcSimple: 1.0, mcIntermediate: 1.5, mcComplex: 2.0, gapFill: 0.5, trueFalse: 0.5, shortEssay: 3.0, fullEssay: 5.0 },
      difficultyDistribution: { easy: diffEasy, medium: diffMedium, hard: diffHard, challenge: diffChallenge },
      totalScore,
      examDurationMinutes: examDuration,
      kioskMode,
      feedbackMode: 'exam',
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    savePreset(newPreset)
    setSavedPresets(getStoredPresets())
    setActivePresetName(name)
  }

  const saveCurrentAsDefaultCalibration = () => {
    saveModuleCalibration('exam', {
      defaultLevel: cefr,
      defaultQuestionCount: questionCount,
      defaultStemLanguage: stemLanguage,
      defaultOptionLanguage: optionLanguage,
      defaultTotalScore: totalScore,
      defaultDurationMinutes: examDuration,
      kioskModeDefault: kioskMode,
      defaultSections: sections
    })
    setCalibrationSavedToast(true)
    setTimeout(() => setCalibrationSavedToast(false), 2500)
  }

  const [sections, setSections] = useState<string[]>(() => cal.defaultSections || ['Grammar', 'Vocabulary', 'Reading Comprehension'])
  const [customPrompt, setCustomPrompt] = useState('')
  const [stemLanguage, setStemLanguage] = useState<'pt' | 'en'>(() => cal.defaultStemLanguage || 'pt')
  const [optionLanguage, setOptionLanguage] = useState<'en' | 'pt'>(() => cal.defaultOptionLanguage || 'en')
  const [approach, setApproach] = useState<string[]>(() => cal.defaultApproach || ['Cambridge'])

  // Matéria ativa — alimenta perfil dinâmico de taxonomia, níveis e distratores
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
  // Constantes derivadas do perfil — substituem CEFR e SECTIONS hardcoded
  const SECTIONS = getExamSections(activeProfile)
  const CEFR = getLevelIds(activeProfile).length > 0 ? getLevelIds(activeProfile) : ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const availableSubjects = getAllSubjectProfiles()



  // Escolas cadastradas & Modelos
  const [registeredSchools, setRegisteredSchools] = useState<Array<{ id: string; name: string }>>([])
  const [selectedSchoolTemplate, setSelectedSchoolTemplate] = useState<string>('')

  // Header
  const [header, setHeader] = useState<HeaderState>({ school: '', teacher: '', classGroup: '', title: '' })

  // NotebookLM Multi-Source Knowledge Hub
  const [sources, setSources] = useState<SourceItem[]>([])
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>('hybrid')

  // Generation
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // API
  const [apis, setApis] = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState<string>('')

  // Audio
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [accent, setAccent] = useState<'US' | 'UK'>('US')

  // Saved
  const [showSaved, setShowSaved] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  // Header toggle & Online Exam
  const [hideHeader, setHideHeader] = useState(false)
  const [showOnlineModal, setShowOnlineModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [exportNeeProfile, setExportNeeProfile] = useState<'standard' | 'dyslexia' | 'adhd' | 'asd' | 'low_vis'>('standard')
  const [showNeeExportMenu, setShowNeeExportMenu] = useState(false)

  // Helper para extrair questões do texto gerado para o Player Online
  const parseQuestionsFromMarkdown = (text: string): OnlineQuestion[] => {
    if (!text) return []
    const lines = text.split('\n')
    const qList: OnlineQuestion[] = []
    let currentStem = ''
    let currentOpts: string[] = []

    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (/^(\d+[\.\)]|Questão\s+\d+|Question\s+\d+)/i.test(trimmed)) {
        if (currentStem) {
          qList.push({
            id: String(qList.length + 1),
            stem: currentStem,
            type: currentOpts.length > 0 ? 'multiple_choice' : 'text',
            options: currentOpts.length > 0 ? currentOpts : undefined
          })
        }
        currentStem = trimmed.replace(/^(\d+[\.\)]|Questão\s+\d+|Question\s+\d+)/i, '').trim()
        currentOpts = []
      } else if (/^[a-eA-E][\.\)]\s+/.test(trimmed)) {
        currentOpts.push(trimmed.replace(/^[a-eA-E][\.\)]\s+/, '').trim())
      } else if (currentStem && trimmed && !trimmed.startsWith('#')) {
        currentStem += ' ' + trimmed
      }
    })

    if (currentStem) {
      qList.push({
        id: String(qList.length + 1),
        stem: currentStem,
        type: currentOpts.length > 0 ? 'multiple_choice' : 'text',
        options: currentOpts.length > 0 ? currentOpts : undefined
      })
    }

    // Fallback se não encontrar delimitadores claros
    if (qList.length === 0 && text.trim()) {
      qList.push({
        id: '1',
        stem: 'Responda às questões propostas no exame abaixo:\n' + text.slice(0, 200),
        type: 'text'
      })
    }

    return qList
  }

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

    // F7: Lê prefill gerado pela Rafinha (tool generate_exam_content)
    const applyPrefillData = (prefill: any) => {
      if (!prefill) return
      if (prefill.topic) setTopic(prefill.topic)
      if (prefill.level) setCefr(prefill.level)
      if (prefill.classRef) setGrade(prefill.classRef)
      if (prefill.questionCount) setQuestionCount(String(prefill.questionCount))
      if (prefill.type) {
        const typeMap: Record<string, string[]> = {
          'múltipla escolha': ['Use of English'],
          'dissertativa': ['Writing'],
          'mista': ['Reading Comprehension', 'Use of English', 'Writing'],
        }
        const mapped = typeMap[prefill.type]
        if (mapped) setSections(mapped)
      }
      localStorage.removeItem('teacher_exam_prefill')
      
      if (prefill.autoGenerate !== false) {
        setTimeout(() => {
          const genBtn = document.getElementById('exam-generate-btn')
          if (genBtn) genBtn.click()
        }, 500)
      }
    }

    const handlePrefillEvent = (e?: any) => {
      try {
        const raw = localStorage.getItem('teacher_exam_prefill')
        if (raw) {
          applyPrefillData(JSON.parse(raw))
        } else if (e?.detail) {
          applyPrefillData(e.detail)
        }
      } catch { /* ignore */ }
    }

    window.addEventListener('teacher:exam_prefill', handlePrefillEvent)
    handlePrefillEvent()

    return () => {
      window.removeEventListener('teacher:exam_prefill', handlePrefillEvent)
    }
  }, [])

  const selectedApi = apis.find(a => a.id === selectedApiId) || apis.find(a => a.id === 'auto') || apis[0] || { id: 'auto', name: '⚡ Seleção Inteligente Automática', provider: 'auto', key: '', model: '', active: true }
  const hasApi = true

  const toggleSection = (s: string) => setSections(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])
  const toggleApproach = (s: string) => setApproach(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  async function generate() {
    if (!sections.length) { toast.success('Selecione pelo menos uma seção.'); return }
    if (!hasApi) { setError('Configure uma API com chave válida em "APIs & Modelos" para gerar automaticamente.'); return }

    setLoading(true); setResult(''); setError('')

    const effectiveTitle = header.title || (topic ? `Prova ${topic}` : `Exam ${cefr} ${grade}`)
    setHeader(h => ({ ...h, title: h.title || effectiveTitle }))

    try {
      let libContext = ''
      const compiled = compileSourcesPrompt(sources, knowledgeMode)
      if (compiled.activeCount > 0) {
        libContext = compiled.promptContext
      } else {
        // Fallback RAG automático se não houver fontes manuais selecionadas no Hub
        const { searchLibraryContext, buildRagPromptContext } = await import('@/lib/ragEngine')
        const chunks = searchLibraryContext(topic || sections.join(' ') || 'English', { limit: 3 })
        if (chunks.length > 0) {
          libContext = buildRagPromptContext(chunks)
        }
      }

      const totalCalculatedQuestions = computeTotalQuestions(questionCounts) || Number(questionCount) || 10
      const distributionPrompt = buildQuestionDistributionPrompt(questionCounts)

      const prompt = buildExamPrompt({
        topic, cefr, grade,
        questionCount: String(totalCalculatedQuestions),
        questionDistributionText: distributionPrompt,
        sections, approach,
        customPrompt: additionalPromptContext ? `${customPrompt}\n\n${additionalPromptContext}` : customPrompt,
        stemLanguage, optionLanguage,
        header: { ...header, title: header.title || effectiveTitle },
        libraryContext: libContext,
        bloomRemember, bloomApply, bloomAnalyze, bloomEvaluate,
        diffEasy, diffMedium, diffHard, diffChallenge,
        totalScore, examDurationMinutes: examDuration, kioskMode,
        formVariant: 'A',
        subjectProfile: activeProfile,
      })

      const raw = await callApi(selectedApi!, prompt)
      const html = cleanHtml(raw)
      setResult(html)

      // Auto-save no Banco de Atividades Unificado (Zero-Leakage)
      try {
        const newExamItem = {
          id: `exam_auto_${Date.now()}`,
          statement: html.slice(0, 300) + '...',
          type: 'mc' as const,
          activityKind: 'exam' as const,
          subject: activeProfile.nameShort,
          topic: topic || 'Prova Completa',
          level: cefr,
          year: new Date().getFullYear().toString(),
          schoolId: header.school || '',
          classRef: grade || '',
          tags: ['Prova Completa', `${activeProfile.levelFramework.name} ${cefr}`, approach.join(', ')],
          createdAt: Date.now(),
          source: 'ai' as const,
          fullContent: html
        }
        addQuestionsBatch([newExamItem as any])
      } catch {}
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAskRafinhaForQuestion(
    questionIndex: number,
    currentQuestion: EditableQuestionItem,
    userInstruction: string
  ): Promise<string | void> {
    if (!selectedApi) return
    const prompt = `Você é a assistente pedagógica Rafinha IA. Reformule e aprimore a seguinte questão de avaliação conforme a instrução do professor:
INSTRUÇÃO DO PROFESSOR: "${userInstruction}"
QUESTÃO ATUAL:
Tipo: ${currentQuestion.typeLabel}
Enunciado: ${currentQuestion.stem}
${currentQuestion.options ? `Alternativas:\n${currentQuestion.options.map(o => `${o.letter}) ${o.text}`).join('\n')}` : ''}
Gabarito atual: ${currentQuestion.answerKey || 'Não definido'}

Retorne a questão reformulada no formato padrão (Enunciado, Alternativas se aplicável, e Gabarito/Resolução):`

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
    if (!result) { toast.success('Gere a prova primeiro para extrair o texto de listening.'); return }
    setAudioLoading(true)
    try {
      const cleanText = result.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 800)
      const res = await generateListeningAudio({ text: cleanText, accent })
      setAudioUrl(res.audioUrl)
    } catch (e: unknown) {
      toast.success(`Falha ao gerar áudio: ${e instanceof Error ? e.message : 'Erro'}`)
    } finally {
      setAudioLoading(false)
    }
  }

  function handleSave() {
    if (!result) { toast.success('Gere ou cole uma prova primeiro.'); return }
    const saved = saveItemToStorage('teacher_saved_exams', {
      title: header.title || (topic ? `Prova ${topic}` : `Exam (${cefr})`),
      subtitle: `${cefr} · ${grade} · ${sections.slice(0, 2).join(', ')}`,
      content: result,
    })
    if (saved) { updateSavedCount(); toast.success(' Prova salva!') }
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
    if (!result) { toast.success('Gere ou cole uma prova primeiro.'); return }
    const { saveActivityToSupabase } = await import('@/lib/supabaseClient')
    const title = header.title || (topic ? `Prova ${topic}` : `Prova (${cefr})`)
    await saveActivityToSupabase({
      title,
      type: 'exam',
      grade,
      cefr,
      content: result
    })
    toast.success(' Prova salva com sucesso no Banco de Dados!')
  }

  return (
    <div style={{ padding: '32px 44px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flexShrink: 0  }}>
        <div>
          <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, color: '#2c1a0e', margin: '0 auto'  }}>
            Gerar Prova
          </h1>
        </div>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 10 }}>
          <button
            onClick={() => setShowSmartInsights(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100"
          >
            🧠 Smart Insights
          </button>
          {result && (
            <>
              <button onClick={handleSaveToActivitiesBank} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #8b5e3c', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(139,94,60,0.2)' }}>
                <i className="ti ti-database" /> Salvar no Banco de Dados
              </button>
            </>
          )}
          <button onClick={() => setShowSaved(true)} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid #8b5e3c', background: '#fdf9f3', color: '#2c1a0e', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-bookmark" style={{ color: '#b58900' }} /> Provas Salvas ({savedCount})
          </button>
        </div>
      </div>

      {/* Seletor de Presets Salvos (Modelos do Professor) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <PresetSelector
          module="exam"
          currentConfig={currentExamConfig}
          onLoadPreset={handleLoadExamPreset}
        />
        <button
          onClick={saveCurrentAsDefaultCalibration}
          title="Salva nível, formato, pontuação e duração selecionados como padrão para todas as futuras provas"
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #d5c8bb',
            background: '#faf6f0',
            color: '#854d0e',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <i className="ti ti-device-floppy" />
          Fixar como meu Padrão
        </button>
      </div>

      {calibrationSavedToast && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px 14px', color: '#166534', fontSize: 12.5, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-check" /> Suas escolhas foram salvas como padrão permanente do ExamBuilder!
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(220,50,47,0.08)', border: '1px solid rgba(220,50,47,0.2)', borderRadius: 10, padding: '10px 16px', color: '#dc322f', fontSize: 13, marginBottom: 14, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 460px) 1fr', gap: 32, flex: 1, minHeight: 0 }}>

        {/* LEFT */}
        <div style={{ overflowY: 'auto', paddingRight: 8, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Botão Principal de Geração Imediata */}
          <button
            id="exam-generate-btn"
            onClick={generate}
            disabled={loading}
            style={{
              padding: '14px 20px', borderRadius: 14,
              background: loading ? '#a08060' : 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
              color: '#fff',
              fontSize: 15, fontWeight: 800, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: !loading ? '0 4px 18px rgba(139,94,60,0.35)' : 'none',
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}
          >
            <i className={loading ? 'ti ti-loader' : 'ti ti-file-certificate'} style={{ fontSize: 20, animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            {loading ? 'Construindo Prova Completa...' : ' Gerar Prova Completa'}
          </button>

          {/* API */}
          {apis.length > 0 && (
            <div style={CARD}>
              <label style={SL}> Modelo de IA</label>
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
                  <div style={{ fontSize: 12, color: '#7a5c42', marginTop: 2 }}>Vá em <strong>APIs & Modelos</strong> para configurar uma chave de IA.</div>
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
            title="Fontes de Conhecimento para a Prova (Estilo NotebookLM)"
            description="Selecione múltiplos livros, capítulos, páginas, arquivos avulsos (PDFs/DOCXs), anotações ou pesquise na Web para alimentar a geração da prova."
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
                      color: stemLanguage === 'pt' ? '#cb4b16' : '#7a5c42', cursor: 'pointer'
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
                      color: stemLanguage === 'en' ? '#268bd2' : '#7a5c42', cursor: 'pointer'
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
                      color: optionLanguage === 'en' ? '#268bd2' : '#7a5c42', cursor: 'pointer'
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
                      color: optionLanguage === 'pt' ? '#cb4b16' : '#7a5c42', cursor: 'pointer'
                    }}
                  >
                    Português
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Cabeçalho Oficial da Escola */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...SL, marginBottom: 0 }}>
                <i className="ti ti-id-badge" style={{ marginRight: 6, color: '#268bd2' }} />
                Cabeçalho Oficial da Escola
              </label>
            </div>

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
                            title: h.title || `Avaliação Trimestral Língua Inglesa`
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
              <label style={{ ...SL, fontSize: 12 }}>Título da Avaliação</label>
              <input value={header.title} onChange={e => setHeader(h => ({ ...h, title: e.target.value }))}
                placeholder="Ex: Prova Bimestral Língua Inglesa" style={SI} />
            </div>
          </div>

          {/* Seções */}
          <div style={CARD}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14, marginTop: 0 }}>Seções da Prova</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {SECTIONS.map(({ key, icon, sub }) => {
                const on = sections.includes(key)
                return (
                  <button key={key} onClick={() => toggleSection(key)} style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 12,
                    border: on ? '1.5px solid #2c1a0e' : '1.5px solid #e4ddd0',
                    background: on ? '#f0ede4' : '#fdf9f3',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 16, color: on ? '#2c1a0e' : '#a08060' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: on ? '#2c1a0e' : '#7a5c42' }}>{key}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#a08060' }}>{sub}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Numerador de Questões Detalhado por Tipo */}
          <QuestionCountByTypeList
            counts={questionCounts}
            onChange={counts => {
              setQuestionCounts(counts)
              setQuestionCount(String(computeTotalQuestions(counts)))
            }}
          />

          {/* Detalhes & Configurações da Turma */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={SL}>Tópico Central / Unidade de Conteúdo</label>
              <input value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Ex: Unit 5, Past Perfect, Meio Ambiente & Sustentabilidade" style={SI} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={SL}>Nível ({activeProfile.levelFramework.name})</label>
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
              <label style={SL}> Diretrizes Personalizadas do Professor</label>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Ex: incluir 2 questões focadas no capítulo 3, usar contexto de tecnologia..."
                rows={2}
                style={{ ...SI, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>

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

          {/* BLOCO: Pontuação, Duração & Presets */}
          <details style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
            <summary style={{ padding: '12px 16px', background: '#fdf8f2', cursor: 'pointer', fontWeight: 700, color: '#8b5e3c', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <i className="ti ti-scale" style={{ fontSize: 16 }} />
              <span>Pontuação, Kiosk & Presets ({activePresetName})</span>
            </summary>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...SL, fontSize: 11 }}>Nota Total (Pontos)</label>
                  <input type="number" min={1} max={100} value={totalScore} onChange={e => setTotalScore(Number(e.target.value))} style={SI} />
                </div>
                <div>
                  <label style={{ ...SL, fontSize: 11 }}>Duração (Minutos)</label>
                  <input type="number" min={5} max={240} value={examDuration} onChange={e => setExamDuration(Number(e.target.value))} style={SI} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#7a5c42' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={kioskMode} onChange={e => setKioskMode(e.target.checked)} style={{ accentColor: '#268bd2' }} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-lock" style={{ fontSize: 14 }} /> Modo Kiosk Online (detecta troca de abas e bloqueia cópia)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={generateFormB} onChange={e => setGenerateFormB(e.target.checked)} style={{ accentColor: '#8b5e3c' }} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-copy" style={{ fontSize: 14 }} /> Gerar Forma B (questões e alternativas embaralhadas)</span>
                </label>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #ede8dc', margin: '4px 0' }} />
              <div>
                <label style={{ ...SL, fontSize: 11.5, marginBottom: 6 }}>Presets Psicométricos Salvos:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {savedPresets.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        border: activePresetName === p.name ? '1.5px solid #268bd2' : '1px solid #e0d8cc',
                        background: activePresetName === p.name ? '#f0f8ff' : '#faf8f5',
                        color: activePresetName === p.name ? '#268bd2' : '#7a5c42', cursor: 'pointer'
                      }}
                    >
                      {p.isDefault ? '★ ' : ''}{p.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={saveCurrentAsPreset}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px dashed #8b5e3c', background: '#fff', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  + Salvar Configuração Atual como Preset Padrão
                </button>
              </div>
            </div>
          </details>

        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>

          {/* Audio toolbar */}
          {result && (
            <div style={{ background: '#fff', padding: '12px 18px', borderRadius: 16, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-headphones" style={{ fontSize: 20, color: '#268bd2' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Listening Track</span>
                <select value={accent} onChange={e => setAccent(e.target.value as 'US' | 'UK')} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12, outline: 'none' }}>
                  <option value="US"> US</option>
                  <option value="UK"> UK</option>
                </select>
              </div>
              <button onClick={handleGenerateAudio} disabled={audioLoading} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {audioLoading ? <><i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> Gerando</> : <><i className="ti ti-volume" /> Gerar Áudio MP3</>}
              </button>
            </div>
          )}

          {audioUrl && (
            <AudioPlayerCard audioUrl={audioUrl} title={`Listening Track ${topic || 'Exam'}`} accent={accent} onDelete={() => setAudioUrl(null)} />
          )}

          {/* Export Toolbar & Online Exam QR Code */}
          {result && (
            <div style={{
              background: '#fdf8f2', padding: '12px 18px', borderRadius: 16,
              border: '1.5px solid #ede8dc', display: 'flex', flexWrap: 'wrap',
              justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 10, border: '1px solid #d5c0b0', padding: '2px 8px' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#7a6552', marginRight: 6 }}>Perfil PDF:</span>
                  <select
                    value={exportNeeProfile}
                    onChange={(e: any) => setExportNeeProfile(e.target.value)}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: '#2c1a0e', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="standard">📄 Padrão Acadêmico</option>
                    <option value="dyslexia">📖 Dislexia (Lexend 1.85x)</option>
                    <option value="adhd">⚡ TDAH (Blocos de Foco)</option>
                    <option value="asd">🧩 TEA (Rotina & Ícones)</option>
                    <option value="low_vis">👁️ Baixa Visão (17pt)</option>
                  </select>
                </div>

                <button
                  onClick={() => exportToPdf({
                    schoolName: header.school || 'ESCOLA DE IDIOMAS & ENSINO',
                    teacherName: header.teacher || 'Professor(a)',
                    className: grade || '8º Ano',
                    title: header.title || (topic ? `PROVA DE INGLÊS ${topic.toUpperCase()}` : 'AVALIAÇÃO DE INGLÊS'),
                    content: result,
                    neeProfile: exportNeeProfile
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: 'none',
                    background: '#8b5e3c', color: '#fff', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 2px 6px rgba(139,94,60,0.25)'
                  }}
                >
                  <i className="ti ti-printer"></i>
                  Exportar PDF {exportNeeProfile !== 'standard' ? 'Adaptado' : 'Oficial'}
                </button>

                <button
                  onClick={() => exportToWord({
                    schoolName: header.school || 'ESCOLA DE IDIOMAS & ENSINO',
                    teacherName: header.teacher || 'Professor(a)',
                    className: grade || '8º Ano',
                    title: header.title || (topic ? `PROVA DE INGLÊS ${topic.toUpperCase()}` : 'AVALIAÇÃO DE INGLÊS'),
                    content: result
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: '1px solid #c0a080',
                    background: '#fffcf8', color: '#8b5e3c', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <i className="ti ti-file-text"></i>
                  Exportar Word (.docx)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!result) return
                    const parsedQs = parseContentToQuestions(result)
                    if (parsedQs.length === 0) {
                      toast.warning('Nenhuma questão estruturada encontrada para transformar em Forma B.')
                      return
                    }
                    const { formBQuestions, letterDistribution } = generateIsomorphicFormB(parsedQs, `${topic || 'prova'}_form_b_${Date.now()}`)
                    const htmlB = compileQuestionsToHtml(formBQuestions, header.title ? `${header.title} (FORMA B)` : 'AVALIAÇÃO (FORMA B)')
                    setResult(htmlB)
                    setHeader(prev => ({ ...prev, title: prev.title.includes('FORMA B') ? prev.title : `${prev.title} (FORMA B)` }))
                    toast.success(`✨ Forma B gerada com equivalência psicométrica exata! Gabarito balanceado (A: ${letterDistribution.A || 0}, B: ${letterDistribution.B || 0}, C: ${letterDistribution.C || 0}, D: ${letterDistribution.D || 0})`)
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: '1px solid #7c3aed',
                    background: '#f5f3ff', color: '#6d28d9', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                  title="Gera a versão B com rotação de alternativas e balanceamento de gabarito sem alterar a dificuldade"
                >
                  <i className="ti ti-arrows-shuffle"></i>
                  Gerar Forma B (Isomórfica)
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowQrModal(true)}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: '1.5px solid #268bd2',
                    background: '#e8f4fd', color: '#268bd2', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  QR Code para Alunos
                </button>

                <button
                  onClick={() => setShowOnlineModal(true)}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: 'none',
                    background: '#2d9d5d', color: '#fff', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 3px 10px rgba(45,157,93,0.3)'
                  }}
                >
                  Testar Prova Online
                </button>
              </div>
            </div>
          )}

          {/* CEFR Inspector & L1 Distractor Quality Badge */}
          {result && (
            <div style={{
              background: '#eef9f8', border: '1px solid #2aa198', borderRadius: 12,
              padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, color: '#16605a', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-certificate" style={{ fontSize: 16, color: '#2aa198' }}></i>
                <strong>CEFR & L1 Inspector:</strong>
                <span>Alinhamento Cambridge {cefr} Ativo &bull; Calibração L1 (Erros de Interferência PT-BR) Aplicada</span>
              </div>
              <span style={{ background: '#2aa198', color: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
                CAMBRIDGE QUALITY
              </span>
            </div>
          )}

          {/* Alternador de Visualização: Boxes Editáveis vs Canvas de Impressão */}
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
                Modo de Visualização & Edição:
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
                  <i className="ti ti-layout-cards" style={{ fontSize: 14 }} />
                  <span>Boxes Editáveis & Reordenação</span>
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
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-file-text" style={{ fontSize: 14 }} />
                  <span>Folha Formatada / Canvas</span>
                </button>
              </div>
            </div>
          )}

          {/* Document Canvas / Editable Boxes Container */}
          <div style={{ flex: 1, borderRadius: 20, overflowY: 'auto', border: '1px solid #ede8dc', boxShadow: '0 4px 24px rgba(44,26,14,0.04)', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {!result && !loading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a08060', gap: 16, padding: 32 }}>
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
              <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AiProgressStepper
                  isGenerating={loading}
                  title="Construindo Prova Estruturada com IA"
                  subtitle={`Disciplina: ${activeProfile.name} • Tópico: ${topic || 'Conteúdo Programático'}`}
                  steps={[
                    `Consultando matriz de referência ${activeProfile.name} e habilidades BNCC...`,
                    `Elaborando enunciados psicométricos, distratores e textos-base...`,
                    'Calibrando gabarito oficial, critérios de correção e folha formatada...',
                  ]}
                />
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
                  title: header.title || (topic ? `Prova ${topic}` : 'Prova de Inglês'),
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

      {/* Saved Drawer */}
      <SavedItemsDrawer
        isOpen={showSaved}
        onClose={() => setShowSaved(false)}
        title="Minhas Provas Salvas"
        storageKey="teacher_saved_exams"
        onSelect={(item: SavedItem) => setResult(item.content)}
      />

      {/* Modal 1: Player de Prova Online */}
      {showOnlineModal && result && (
        <StudentExamPlayer
          title={header.title || (topic ? `Prova de Inglês ${topic}` : 'Avaliação de Inglês')}
          schoolName={header.school || 'ESCOLA DE IDIOMAS & ENSINO'}
          className={grade || '8º Ano'}
          questions={parseQuestionsFromMarkdown(result)}
          onClose={() => setShowOnlineModal(false)}
          onComplete={(name, score) => {
            toast.success(` Prova enviada com sucesso por ${name}! Nota ${score}/10 gravada automaticamente no Diário de Classe (Gradebook).`)
          }}
        />
      )}

      {/* Modal 2: QR Code para os Alunos escanearem com o Celular */}
      {showQrModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(7,54,66,0.8)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
        }}>
          <div style={{
            background: '#fff', padding: 28, borderRadius: 24, textAlign: 'center',
            maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.3)', border: '2px solid #ede8dc'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', margin: '0 0 6px 0' }}>
              QR Code para Acesso dos Alunos
            </h3>
            <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 16px 0' }}>
              Projete este QR Code no telão da sala ou imprima na folha de apoio para os alunos responderem pelo celular.
            </p>

            <div
              style={{ padding: 16, background: '#fff', borderRadius: 16, border: '2px solid #8b5e3c', display: 'inline-block' }}
              dangerouslySetInnerHTML={{ __html: generateSvgQRCode('http://localhost:3000', 220) }}
            />

            <div style={{ marginTop: 16, fontSize: 12, color: '#8b5e3c', fontWeight: 700 }}>
              Link Curto: <u>http://localhost:3000</u>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              style={{
                marginTop: 20, padding: '10px 24px', background: '#2c1a0e', color: '#fff',
                border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 13
              }}
            >
              Fechar QR Code
            </button>
          </div>
        </div>
      )}

      {/* Smart Insights Panel */}
      {showSmartInsights && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l shadow-2xl z-50 flex flex-col">
          <SmartInsightsPanel
            classRef={header.classGroup || grade}
            topic={topic}
            cefrLevel={cefr}
            onInsightsAccepted={(params) => {
              setBloomRemember(params.bloomRemember)
              setBloomApply(params.bloomApply)
              setBloomAnalyze(params.bloomAnalyze)
              setBloomEvaluate(params.bloomEvaluate)
              setDiffEasy(params.diffEasy)
              setDiffMedium(params.diffMedium)
              setDiffHard(params.diffHard)
              setDiffChallenge(params.diffChallenge)
              setAdditionalPromptContext(params.additionalPromptContext)
              setShowSmartInsights(false)
            }}
            onDismiss={() => setShowSmartInsights(false)}
          />
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}