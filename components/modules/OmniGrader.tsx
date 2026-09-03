import {
  createExamSheetLayout,
  evaluateOMRSheet,
  OMRSheetResult,
  OMRQuestionResult,
  ImageBuffer
} from '@/lib/omr'
'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import { useState, useEffect } from 'react'
import { captureImageFile, extractContentFromImage } from '@/lib/ocrCapture'
import { exportToPdf } from '@/lib/exportUtils'
import { recordStudentGrade, addObservation, getStudentMemory } from '@/lib/studentMemory'
import { getSubjectProfile, SubjectProfile } from '@/lib/subjectProfile'
import { getAnchorExemplarsPrompt } from '@/lib/rubrics/anchorExemplars'
import { screenEssayStylometrics, StylometricAdvisory } from '@/lib/stylometricScreening'
import ModelCapabilityBanner from '@/components/ModelCapabilityBanner'
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'

interface StudentRecord {
  id: string
  name: string
  classId: string
  schoolId: string
  grades?: Record<string, number | string>
}
interface ClassRecord {
  id: string
  name: string
}

interface QuestionGradeResult {
  num: number
  studentAnswer: string
  correctAnswer: string
  isCorrect: boolean
  points: number
}

interface CambridgeCriterionFeedback {
  score: number // 0 to 5
  justification: string
  strengths: string[]
  improvements: string[]
}

interface CambridgeEssayEvaluation {
  overallScore: number // 0 to 10
  content: CambridgeCriterionFeedback
  communicativeAchievement: CambridgeCriterionFeedback
  organisation: CambridgeCriterionFeedback
  language: CambridgeCriterionFeedback
  overallSummary: string
  studentActionPlan: string
  detectedErrors: Array<{
    excerpt: string
    correction: string
    explanation: string
    type: 'grammar' | 'spelling' | 'vocabulary' | 'l1_interference'
  }>
  phantomErrorsFiltered?: number
  stylometricAdvisory?: StylometricAdvisory
}


interface BatchSubmission {
  id: string
  studentId: string
  studentName: string
  content: string
  status: 'pending' | 'grading' | 'done'
  grade?: number
  feedback?: string
}

const S: Record<string, React.CSSProperties> = {
  page: { padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2', maxWidth: 1400, margin: '0 auto' },
  card: { background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, padding: '24px', boxShadow: '0 2px 8px rgba(44,26,14,0.06)' },
  tabBtn: { padding: '10px 20px', borderRadius: RADIUS.md, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' },
  input: { width: '100%', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: TEXT.body, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 6 },
  btnPrimary: { background: 'linear-gradient(135deg, #8b5e3c 0%, #6f4728 100%)', color: '#fff', padding: '10px 20px', borderRadius: RADIUS.md, border: 'none', fontWeight: 700, fontSize: TEXT.body, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(139,94,60,0.25)' },
  btnSecondary: { background: '#fffcf8', border: '1px solid #d5c0b0', color: '#4a382a', padding: '10px 18px', borderRadius: RADIUS.md, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
}

const CEFR_WORD_LIMITS: Record<string, { min: number; max: number; task: string }> = {
  'A1': { min: 50, max: 80, task: 'Simple Message' },
  'A2': { min: 100, max: 120, task: 'Message/Email' },
  'B1': { min: 100, max: 150, task: 'Article/Story/Letter' },
  'B2': { min: 140, max: 190, task: 'Task 1 (220-260 Task 2)' },
  'C1': { min: 220, max: 260, task: 'Task 1 (280-320 Task 2)' },
  'C2': { min: 280, max: 320, task: 'Advanced Composition' },
}

interface OmniGraderProps {
  initialTab?: 'photo' | 'essay' | 'batch'
}

export default function OmniGrader({ initialTab = 'photo' }: OmniGraderProps) {
  const [activeTab, setActiveTab] = useState<'photo' | 'essay' | 'batch'>(initialTab)
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])

  // State: Aba 1 (Foto / OCR & OMR)
  const [selectedStudentPhoto, setSelectedStudentPhoto] = useState('')
  const [examTitlePhoto, setExamTitlePhoto] = useState('Prova Bimestral de Inglês')
  const [answerKeyPhoto, setAnswerKeyPhoto] = useState('1:A, 2:B, 3:C, 4:D, 5:A, 6:C, 7:B, 8:D, 9:A, 10:B')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [gradingScenario, setGradingScenario] = useState<'scenario_a_omr' | 'scenario_b_external'>('scenario_a_omr')
  const [isGradingPhoto, setIsGradingPhoto] = useState(false)
  const [omrResult, setOmrResult] = useState<OMRSheetResult | null>(null)
  const [inspectingQuestionIndex, setInspectingQuestionIndex] = useState<number | null>(null)
  const [photoGradeResult, setPhotoGradeResult] = useState<{
    score: number
    totalQuestions: number
    correctCount: number
    questions: QuestionGradeResult[]
    rawText: string
  } | null>(null)
  const [launchedPhoto, setLaunchedPhoto] = useState(false)

  // State: Aba 2 (Redação Cambridge)
  const [selectedStudentEssay, setSelectedStudentEssay] = useState('')
  const [targetLevel, setTargetLevel] = useState<'A2' | 'B1' | 'B2' | 'C1'>('B1')
  const [textGenre, setTextGenre] = useState<string>('Email / Letter')
  const [essayPrompt, setEssayPrompt] = useState<string>('Write an email to your English friend telling him about your new school routine, favorite subject and inviting him to visit you next month. (100-140 words)')
  const [essayInputMode, setEssayInputMode] = useState<'text' | 'photo'>('text')
  const [essayImageUri, setEssayImageUri] = useState<string | null>(null)
  const [isOcrExtracting, setIsOcrExtracting] = useState(false)
  const [ocrWarning, setOcrWarning] = useState<string | null>(null)
  const [studentEssayText, setStudentEssayText] = useState<string>('')
  const [isEvaluatingEssay, setIsEvaluatingEssay] = useState(false)
  const [essayEvaluation, setEssayEvaluation] = useState<CambridgeEssayEvaluation | null>(null)
  const [launchedEssay, setLaunchedEssay] = useState(false)

  // State: Aba 3 (Batch Grader)
  const [batchSubmissions, setBatchSubmissions] = useState<BatchSubmission[]>([])
  const [isGradingBatch, setIsGradingBatch] = useState(false)

  useEffect(() => {
    try {
      const st = localStorage.getItem('teacher_students')
      const cl = localStorage.getItem('teacher_classes')
      if (st) {
        const parsed = JSON.parse(st)
        setStudents(parsed)
        if (parsed.length > 0) {
          setSelectedStudentPhoto(parsed[0].id)
          setSelectedStudentEssay(parsed[0].id)
        }
      }
      if (cl) setClasses(JSON.parse(cl))
    } catch {}
  }, [])

  // ─── ABA 1: Foto / OCR ──────────────────────────────────────────────────
  async function handleCapturePhoto() {
    try {
      const base64 = await captureImageFile()
      setImageUri(base64)
      setPhotoGradeResult(null)
      setLaunchedPhoto(false)
    } catch (e) {
      toast.success(`Falha ao selecionar imagem: ${String(e)}`)
    }
  }

  // Helper para converter imagem base64 em ImageBuffer no navegador
  async function loadImageBufferFromBase64(base64: string): Promise<ImageBuffer> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return reject(new Error('Canvas 2D indisponível.'))
        ctx.drawImage(img, 0, 0)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolve({
          width: imgData.width,
          height: imgData.height,
          data: imgData.data
        })
      }
      img.onerror = () => reject(new Error('Falha ao carregar a imagem da folha de respostas.'))
      img.src = base64
    })
  }

  async function handleGradePhoto() {
    if (!imageUri) { toast.error('Selecione ou tire a foto da prova primeiro.'); return }

    // Parsing do gabarito oficial informado
    const keyPairs = answerKeyPhoto.split(',').map(s => s.trim().split(':')).filter(arr => arr.length === 2)
    const parsedKey: Record<number, string> = {}
    keyPairs.forEach(([qNum, ans]) => {
      parsedKey[parseInt(qNum)] = ans.trim().toUpperCase()
    })
    const totalQ = Object.keys(parsedKey).length || 10

    setIsGradingPhoto(true)

    try {
      if (gradingScenario === 'scenario_a_omr') {
        // ─── CENÁRIO A: OMR DETERMINÍSTICO DE ALTA PRECISÃO (< 100ms) ───────────
        const imgBuffer = await loadImageBufferFromBase64(imageUri)
        const layout = createExamSheetLayout({
          id: 'exam_omr_sheet',
          title: examTitlePhoto,
          version: 'Form_A',
          totalQuestions: totalQ,
          optionsPerQuestion: 4,
          answerKey: parsedKey
        })

        const omrEval = evaluateOMRSheet(imgBuffer, layout)
        setOmrResult(omrEval)

        const mappedQuestions: QuestionGradeResult[] = omrEval.questions.map(q => ({
          num: q.questionNumber,
          studentAnswer: q.detectedAnswer || '?',
          correctAnswer: q.correctAnswer || 'A',
          isCorrect: Boolean(q.isCorrect),
          points: q.pointsAwarded || 0
        }))

        setPhotoGradeResult({
          score: omrEval.score || 0,
          totalQuestions: totalQ,
          correctCount: omrEval.correctCount || 0,
          questions: mappedQuestions,
          rawText: `OMR Determinístico Concluído em ${omrEval.processingTimeMs}ms. Confiança Geral: ${omrEval.overallConfidence.toUpperCase()}.`
        })

        if (omrEval.fallbackCount > 0) {
          toast.info(`${omrEval.fallbackCount} questão(ões) com marcação ambígua ou rasura identificada(s). Confira os cards destacados.`)
        } else {
          toast.success(`Leitura OMR 100% determinística concluída em ${omrEval.processingTimeMs}ms!`)
        }
      } else {
        // ─── CENÁRIO B: PROVA EXTERNA (LEITURA POR VISÃO IA GENERATIVA) ──────────
        const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
        const activeApi = apis.find((a: any) => a.active && a.key) || { id: 'auto', provider: 'gemini', key: 'auto' }

        const ocr = await extractContentFromImage(imageUri, activeApi)
        const results: QuestionGradeResult[] = []
        let correct = 0

        for (let i = 1; i <= totalQ; i++) {
          const expected = parsedKey[i] || 'A'
          const match = ocr.rawText.match(new RegExp(`${i}\\s*[:\\-\\)]\\s*([A-Da-d])`))
          const found = match ? match[1].toUpperCase() : (i <= (ocr.questions?.length || 0) ? ocr.questions?.[i-1]?.answer?.toUpperCase() || '' : '')
          const isOk = found === expected
          if (isOk) correct++
          results.push({ num: i, studentAnswer: found || '?', correctAnswer: expected, isCorrect: isOk, points: isOk ? 1 : 0 })
        }

        const finalScore = Number(((correct / totalQ) * 10).toFixed(1))
        setOmrResult(null)
        setPhotoGradeResult({
          score: finalScore,
          totalQuestions: totalQ,
          correctCount: correct,
          questions: results,
          rawText: ocr.rawText
        })
        toast.info('Prova externa lida via IA. Por favor, confira as alternativas antes de salvar.')
      }
    } catch (err: any) {
      toast.error(`Falha no processamento: ${err.message || 'Verifique a foto'}`)
    } finally {
      setIsGradingPhoto(false)
    }
  }

  // Permite ao professor corrigir uma resposta com 1 clique no painel de inspeção
  function handleManualOverrideQuestion(qNum: number, newOption: string | null) {
    if (!photoGradeResult) return
    const updatedQs = [...photoGradeResult.questions]
    const idx = updatedQs.findIndex(q => q.num === qNum)
    if (idx === -1) return

    const q = updatedQs[idx]
    const isOk = newOption ? newOption.toUpperCase() === q.correctAnswer.toUpperCase() : false
    updatedQs[idx] = {
      ...q,
      studentAnswer: newOption ? newOption.toUpperCase() : '?',
      isCorrect: isOk,
      points: isOk ? 1 : 0
    }

    const newCorrect = updatedQs.filter(q => q.isCorrect).length
    const newScore = Number(((newCorrect / photoGradeResult.totalQuestions) * 10).toFixed(1))

    setPhotoGradeResult({
      ...photoGradeResult,
      score: newScore,
      correctCount: newCorrect,
      questions: updatedQs
    })

    if (omrResult) {
      const updatedOmrQs = [...omrResult.questions]
      const oIdx = updatedOmrQs.findIndex(q => q.questionNumber === qNum)
      if (oIdx > -1) {
        updatedOmrQs[oIdx] = {
          ...updatedOmrQs[oIdx],
          detectedAnswer: newOption,
          confidence: 'high',
          isAmbiguous: false,
          needsAiFallback: false,
          visualEvidence: `Ajustado manualmente pelo professor para alternativa ${newOption || 'Anulado'}.`
        }
        setOmrResult({
          ...omrResult,
          score: newScore,
          correctCount: newCorrect,
          questions: updatedOmrQs
        })
      }
    }

    toast.success(`Questão ${qNum} atualizada para ${newOption || 'Anulada'}!`)
  }

  function handleSavePhotoToGradebook() {
    if (!photoGradeResult || !selectedStudentPhoto) return
    const updated = [...students]
    const idx = updated.findIndex(s => s.id === selectedStudentPhoto)
    if (idx > -1) {
      const g = updated[idx].grades || {}
      const examKey = `ocr_${Date.now().toString().slice(-4)}`
      g[examKey] = photoGradeResult.score
      updated[idx].grades = g
      localStorage.setItem('teacher_students', JSON.stringify(updated))
      setStudents(updated)
      setLaunchedPhoto(true)
      
      // Gravação automática na memória viva do aluno
      recordStudentGrade(
        updated[idx].id,
        updated[idx].name,
        `Prova OCR (${photoGradeResult.totalQuestions} questões)`,
        photoGradeResult.score,
        10,
        '',
        'Avaliação Escrita (OCR)'
      )

      window.dispatchEvent(new Event('storage'))
      toast.success(`Nota ${photoGradeResult.score}/10 lançada com sucesso para ${updated[idx].name}!`)
    }
  }

  // ─── ABA 2: Redação Cambridge ───────────────────────────────────────────
  async function handleCaptureEssayPhoto() {
    try {
      const base64 = await captureImageFile()
      setEssayImageUri(base64)
      setOcrWarning(null)
    } catch (e) {
      toast.success(`Falha ao selecionar imagem: ${String(e)}`)
    }
  }

  async function handleExtractEssayOcr() {
    if (!essayImageUri) {
      toast.success('Selecione ou tire a foto da redação manuscrita primeiro.')
      return
    }

    const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
    const activeApi = apis.find((a: any) => a.active && a.key) || { id: 'auto', provider: 'gemini', key: 'auto' }

    setIsOcrExtracting(true)
    setOcrWarning(null)
    try {
      const ocr = await extractContentFromImage(essayImageUri, activeApi)
      const text = ocr.rawText?.trim()
      if (!text || text.length < 15) {
        setOcrWarning('⚠️ A caligrafia na foto não pôde ser reconhecida com nitidez suficiente. Por favor, envie uma foto com melhor iluminação e enquadramento reto, ou digite o texto manualmente.')
      } else {
        // Validação de confiança de legibilidade pós-OCR
        const { computeOcrConfidence } = await import('@/lib/ocrCapture')
        const conf = computeOcrConfidence(text)
        setStudentEssayText(text)
        if (conf.lowConfidence && conf.warning) {
          setOcrWarning(conf.warning + ' Você pode editar o texto manualmente antes de avaliar.')
        } else {
          setOcrWarning(null)
        }
      }
    } catch (err: any) {
      setOcrWarning('⚠️ Falha ao processar o texto manuscrito da imagem. Por favor, verifique a nitidez da foto ou insira o texto manualmente.')
    } finally {
      setIsOcrExtracting(false)
    }
  }
  async function handleEvaluateCambridgeEssay() {
    if (!studentEssayText.trim()) {
      toast.success('Cole ou digite a redação do aluno para iniciar a avaliação.')
      return
    }

    setIsEvaluatingEssay(true)
    setEssayEvaluation(null)
    setLaunchedEssay(false)

    try {
      const studentObj = students.find(s => s.id === selectedStudentEssay)
      const studentName = studentObj ? studentObj.name : 'Aluno'
      const profile = getSubjectProfile()
      const isPortuguese = profile.id === 'portuguese'

      // PASSO 1: Macro-Discurso (Content + Communicative Achievement / Tema & Argumentação) com isolamento psicométrico
      const promptPass1 = isPortuguese
        ? `Você é um Avaliador Especialista em Redação e Produção Textual em Língua Portuguesa (Matriz ENEM adaptada para EF/EM).
AVALIAÇÃO — PASSO 1: MACRO-DISCURSO, ESTRUTURA E ARGUMENTAÇÃO
Avalie a seguinte produção textual do aluno ${studentName}:

GÊNERO TEXTUAL: ${textGenre}
PROPOSTA / TEMA:
"${essayPrompt}"

REDAÇÃO DO ALUNO:
"""
${studentEssayText}
"""

REGRA DE ISOLAMENTO PSICOMÉTRICO OBRIGATÓRIA:
Avalie ESTRITAMENTE o cumprimento da proposta temática, adequação ao gênero, repertório e coerência argumentativa.
IGNORE pequenos erros ortográficos ou gramaticais locais (que serão avaliados na etapa seguinte).
Avalie em escala de 0.0 a 5.0:
1. Content / Tema & Gênero (0.0 a 5.0): Cumprimento integral da proposta, compreensão temática e estrutura composicional do gênero.
2. Communicative Achievement / Argumentação & Conclusão (0.0 a 5.0): Clareza na defesa de ponto de vista, encadeamento de ideias e consistência da conclusão.

${getAnchorExemplarsPrompt('portuguese', 'macro')}

Retorne ESTRITAMENTE um objeto JSON no seguinte formato (sem markdown, sem blocos fora do JSON):
{
  "content": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa detalhada do cumprimento da proposta",
    "strengths": ["ponto forte 1", "ponto forte 2"],
    "improvements": ["sugestão de melhoria"]
  },
  "communicativeAchievement": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa da adequação ao leitor e progressão temática",
    "strengths": ["ponto forte"],
    "improvements": ["sugestão"]
  },
  "macroSummary": "Parecer formativo sobre o conteúdo e mensagem da redação"
}`
        : `Você é um Examinador Oficial de Redação Cambridge Assessment English (A2 Key / B1 Preliminary / B2 First / C1 Advanced).
AVALIAÇÃO — PASSO 1: MACRO-DISCURSO (CONTENT & COMMUNICATIVE ACHIEVEMENT)
Avalie a seguinte redação do aluno ${studentName}:

NÍVEL CEFR ALVO: ${targetLevel}
GÊNERO TEXTUAL: ${textGenre}
PROPOSTA / TEMA:
"${essayPrompt}"

REDAÇÃO DO ALUNO:
"""
${studentEssayText}
"""

REGRA DE ISOLAMENTO PSICOMÉTRICO OBRIGATÓRIA:
Avalie ESTRITAMENTE o cumprimento da tarefa e a eficácia comunicativa ao leitor-alvo.
IGNORE completamente pequenos erros gramaticais ou de pontuação local (que serão avaliados em outra etapa separada), a menos que impeçam totalmente a inteligibilidade da mensagem.
Avalie em escala de 0.0 a 5.0:
1. Content (0.0 a 5.0): Cumprimento integral da proposta, relevância das ideias, desenvolvimento e completude dos pontos pedidos.
2. Communicative Achievement (0.0 a 5.0): Adequação ao gênero textual, registro formal/informal correto, tom e engajamento do leitor.

${getAnchorExemplarsPrompt('english', 'macro')}

Retorne ESTRITAMENTE um objeto JSON no seguinte formato (sem markdown, sem blocos fora do JSON):
{
  "content": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa detalhada do cumprimento da proposta",
    "strengths": ["ponto forte 1", "ponto forte 2"],
    "improvements": ["sugestão de melhoria"]
  },
  "communicativeAchievement": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa da adequação ao leitor e convenções do gênero",
    "strengths": ["ponto forte"],
    "improvements": ["sugestão"]
  },
  "macroSummary": "Parecer formativo sobre o conteúdo e mensagem da redação"
}`

      // PASSO 2: Micro-Linguístico (Organisation + Language / Coesão e Norma-Padrão) com isolamento psicométrico
      const promptPass2 = isPortuguese
        ? `Você é um Avaliador Especialista em Linguística e Gramática da Língua Portuguesa (Norma-Padrão e Coesão).
AVALIAÇÃO — PASSO 2: MICRO-LINGUÍSTICO (COESÃO E NORMA-PADRÃO)
Avalie a seguinte redação em Língua Portuguesa:

GÊNERO TEXTUAL: ${textGenre}

REDAÇÃO DO ALUNO:
"""
${studentEssayText}
"""

REGRA DE ISOLAMENTO PSICOMÉTRICO OBRIGATÓRIA:
Avalie ESTRITAMENTE a organização textual, mecanismos coesivos, regras de ortografia, concordância, regência, crase e pontuação.
NÃO julgue se o aluno concordou ou discordou do tema de fundo — foque puramente na competência linguística e estrutural.
Avalie em escala de 0.0 a 5.0:
3. Organisation / Coesão Textual (0.0 a 5.0): Estruturação de parágrafos, conectivos inter e intraparágrafos, progressão referencial.
4. Language / Norma-Padrão (0.0 a 5.0): Correção ortográfica, concordância verbal/nominal, regência, emprego de crase e precisão lexical.

${getAnchorExemplarsPrompt('portuguese', 'micro')}

Retorne ESTRITAMENTE um objeto JSON no seguinte formato (sem markdown, sem blocos fora do JSON):
{
  "organisation": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa da estrutura, parágrafos e conectivos",
    "strengths": ["ponto forte"],
    "improvements": ["sugestão"]
  },
  "language": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa do domínio da norma-padrão e precisão gramatical",
    "strengths": ["ponto forte"],
    "improvements": ["sugestão"]
  },
  "studentActionPlan": "Passo prático prioritário para o aluno aprimorar a escrita",
  "detectedErrors": [
    {
      "excerpt": "trecho exato com desvio no texto",
      "correction": "correção recomendada",
      "explanation": "justificativa gramatical pedagógica",
      "type": "grammar"
    }
  ]
}`
        : `Você é um Examinador Oficial de Redação Cambridge Assessment English (A2 Key / B1 Preliminary / B2 First / C1 Advanced).
AVALIAÇÃO — PASSO 2: MICRO-LINGUÍSTICO (ORGANISATION & LANGUAGE)
Avalie a seguinte redação em inglês:

NÍVEL CEFR ALVO: ${targetLevel}
GÊNERO TEXTUAL: ${textGenre}

REDAÇÃO DO ALUNO:
"""
${studentEssayText}
"""

REGRA DE ISOLAMENTO PSICOMÉTRICO OBRIGATÓRIA:
Avalie ESTRITAMENTE a organização textual, coesão, amplitude lexical e precisão gramatical da escrita em inglês.
NÃO julgue se o aluno concordou ou discordou do tema de fundo ou se a ideia é original — foque puramente na competência linguística e estrutural do texto.
Avalie em escala de 0.0 a 5.0:
3. Organisation (0.0 a 5.0): Estruturação de parágrafos, encadeamento lógico de ideias, variedade e precisão no uso de conectivos (linkers).
4. Language (0.0 a 5.0): Amplitude de vocabulário específico do nível ${targetLevel}, controle e variedade de estruturas gramaticais, precisão sintática e erros de interferência L1 (português).

${getAnchorExemplarsPrompt('english', 'micro')}

Retorne ESTRITAMENTE um objeto JSON no seguinte formato (sem markdown, sem blocos fora do JSON):
{
  "organisation": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa da estrutura, parágrafos e conectivos",
    "strengths": ["ponto forte"],
    "improvements": ["sugestão"]
  },
  "language": {
    "score": number (0.0 a 5.0),
    "justification": "justificativa da amplitude lexical e precisão gramatical",
    "strengths": ["ponto forte"],
    "improvements": ["sugestão"]
  },
  "studentActionPlan": "Passo prático prioritário para o aluno aprimorar a escrita",
  "detectedErrors": [
    {
      "excerpt": "trecho exato com erro no texto",
      "correction": "correção recomendada",
      "explanation": "explicação pedagógica com foco em L1/gramática",
      "type": "grammar"
    }
  ]
}`

      // Execução em 2 passadas independentes via API
      const [res1, res2] = await Promise.all([
        fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: promptPass1 }], temperatureMode: 'deterministic' })
        }),
        fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: promptPass2 }], temperatureMode: 'deterministic' })
        })
      ])

      const [data1, data2] = await Promise.all([res1.json(), res2.json()])
      const raw1 = data1?.reply || data1?.content || ''
      const raw2 = data2?.reply || data2?.content || ''

      const match1 = raw1.match(/\{[\s\S]*\}/)
      const match2 = raw2.match(/\{[\s\S]*\}/)

      if (!match1 || !match2) {
        throw new Error('Falha ao processar as respostas JSON da avaliação em dupla passada.')
      }

      const pass1 = JSON.parse(match1[0])
      const pass2 = JSON.parse(match2[0])

      const contentScore = Math.min(5, Math.max(0, Number(pass1.content?.score || 0)))
      const commAchScore = Math.min(5, Math.max(0, Number(pass1.communicativeAchievement?.score || 0)))
      const orgScore = Math.min(5, Math.max(0, Number(pass2.organisation?.score || 0)))
      const langScore = Math.min(5, Math.max(0, Number(pass2.language?.score || 0)))

      const overallScore = Number(((contentScore + commAchScore + orgScore + langScore) / 2).toFixed(1))

      // ── Validação Determinística de Citações em detectedErrors ────────────────
      // Cada 'excerpt' deve ser substring literal da redação original.
      // Erros "inventados" pela IA (hallucination) são filtrados antes de exibição.
      const rawErrors: Array<{
        excerpt: string
        correction: string
        explanation: string
        type: 'grammar' | 'spelling' | 'vocabulary' | 'l1_interference'
      }> = (Array.isArray(pass2.detectedErrors) ? pass2.detectedErrors : []).map((e: any) => ({
        excerpt: String(e.excerpt || ''),
        correction: String(e.correction || ''),
        explanation: String(e.explanation || ''),
        type: (['grammar', 'spelling', 'vocabulary', 'l1_interference'].includes(e.type)
          ? e.type
          : 'grammar') as 'grammar' | 'spelling' | 'vocabulary' | 'l1_interference'
      }))

      const essayLower = studentEssayText.toLowerCase()
      const validErrors = rawErrors.filter(e => {
        if (!e.excerpt || e.excerpt.length < 3) return false
        // Tolerância: ignora capitalização e espaços extras
        return essayLower.includes(e.excerpt.toLowerCase().trim())
      })
      const phantomErrors = rawErrors.filter(e => !validErrors.includes(e))
      if (phantomErrors.length > 0) {
        console.warn(`[OmniGrader] ${phantomErrors.length} erro(s) hallucinated detectado(s) e removido(s):`, phantomErrors.map(e => e.excerpt))
      }


      // ── Triagem Estilométrica Formativa (Não-Punitiva / Impacto Zero na Nota) ──
      const mem = selectedStudentEssay ? getStudentMemory(selectedStudentEssay) : null
      const stylometricAdvisory = screenEssayStylometrics({
        essayText: studentEssayText,
        targetLevel,
        studentMemory: mem,
        language: isPortuguese ? 'pt-BR' : 'en'
      })

      const combinedEvaluation = {
        overallScore,
        content: pass1.content || { score: contentScore, justification: '', strengths: [], improvements: [] },
        communicativeAchievement: pass1.communicativeAchievement || { score: commAchScore, justification: '', strengths: [], improvements: [] },
        organisation: pass2.organisation || { score: orgScore, justification: '', strengths: [], improvements: [] },
        language: pass2.language || { score: langScore, justification: '', strengths: [], improvements: [] },
        overallSummary: pass1.macroSummary || 'Redação avaliada com rigor psicométrico em dupla passada independente.',
        studentActionPlan: pass2.studentActionPlan || 'Praticar o uso variado de linkers e vocabulário avançado.',
        detectedErrors: validErrors,
        phantomErrorsFiltered: phantomErrors.length, // Quantidade de erros hallucinated removidos
        stylometricAdvisory
      }

      setEssayEvaluation(combinedEvaluation)

    } catch (err: any) {
      toast.success(`Erro na avaliação da redação: ${err.message || 'Tente novamente'}`)
    } finally {
      setIsEvaluatingEssay(false)
    }
  }

  function handleSaveEssayToGradebook() {
    if (!essayEvaluation || !selectedStudentEssay) return
    const updated = [...students]
    const idx = updated.findIndex(s => s.id === selectedStudentEssay)
    if (idx > -1) {
      const g = updated[idx].grades || {}
      const examKey = `essay_${Date.now().toString().slice(-4)}`
      g[examKey] = essayEvaluation.overallScore
      updated[idx].grades = g
      localStorage.setItem('teacher_students', JSON.stringify(updated))
      setStudents(updated)
      setLaunchedEssay(true)

      // Gravação automática na memória viva do aluno
      recordStudentGrade(
        updated[idx].id,
        updated[idx].name,
        `Redação (${textGenre || 'Cambridge Assessment'})`,
        essayEvaluation.overallScore,
        10,
        '',
        'Redação'
      )
      if (essayEvaluation.overallSummary) {
        addObservation(
          updated[idx].id,
          updated[idx].name,
          `Feedback Redação: ${essayEvaluation.overallSummary.slice(0, 160)}`,
          'Redação',
          undefined,
          'teacher'
        )
      }

      window.dispatchEvent(new Event('storage'))
      toast.success(`Nota ${essayEvaluation.overallScore}/10 lançada com sucesso no Gradebook de ${updated[idx].name}!`)
    }
  }

  function handleExportEssayPdf() {
    if (!essayEvaluation) return
    const st = students.find(s => s.id === selectedStudentEssay)
    const name = st ? st.name : 'Aluno'

    const reportContent = `
# Relatório Oficial de Avaliação de Redação (Cambridge Assessment)

**Aluno(a):** ${name}
**Nível Avaliado:** CEFR ${targetLevel} &bull; **Gênero Textual:** ${textGenre}
**Nota Final Oficial:** ${essayEvaluation.overallScore.toFixed(1)} / 10,0

---

## 📝 Texto Submetido pelo Aluno
${studentEssayText}

---

## 🎯 Desempenho por Critério Cambridge

### 1. Content (Conteúdo) — Nota: ${essayEvaluation.content.score.toFixed(1)} / 5.0
${essayEvaluation.content.justification}
*Pontos Fortes:* ${essayEvaluation.content.strengths.join(', ')}
*Oportunidades de Melhoria:* ${essayEvaluation.content.improvements.join(', ')}

### 2. Communicative Achievement (Adequação ao Leitor) — Nota: ${essayEvaluation.communicativeAchievement.score.toFixed(1)} / 5.0
${essayEvaluation.communicativeAchievement.justification}
*Pontos Fortes:* ${essayEvaluation.communicativeAchievement.strengths.join(', ')}
*Oportunidades de Melhoria:* ${essayEvaluation.communicativeAchievement.improvements.join(', ')}

### 3. Organisation (Estrutura e Coesão) — Nota: ${essayEvaluation.organisation.score.toFixed(1)} / 5.0
${essayEvaluation.organisation.justification}
*Pontos Fortes:* ${essayEvaluation.organisation.strengths.join(', ')}
*Oportunidades de Melhoria:* ${essayEvaluation.organisation.improvements.join(', ')}

### 4. Language (Vocabulário e Gramática) — Nota: ${essayEvaluation.language.score.toFixed(1)} / 5.0
${essayEvaluation.language.justification}
*Pontos Fortes:* ${essayEvaluation.language.strengths.join(', ')}
*Oportunidades de Melhoria:* ${essayEvaluation.language.improvements.join(', ')}

---

## 🔍 Erros Detectados e Orientações Contrastivas (L1 / Gramática)
${essayEvaluation.detectedErrors.map(e => `- **Trecho:** "${e.excerpt}" ➔ **Sugestão:** "${e.correction}" (${e.explanation})`).join('\n')}

---

## 💡 Plano de Ação para a Próxima Semana
${essayEvaluation.studentActionPlan}
`
    exportToPdf({
      title: `AVALIAÇÃO DE REDAÇÃO CAMBRIDGE — ${name.toUpperCase()}`,
      content: reportContent
    })
  }

  return (
    <div style={S.page}>
      {/* Model Capability Warning */}
      <ModelCapabilityBanner taskLabel="Correção de Redação (OmniGrader)" />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
              CAMBRIDGE STANDARDS
            </span>
            <span style={{ fontSize: 13, color: '#7a6552' }}>Central de Correção Inteligente</span>
          </div>
          <h1 style={{ margin: '4px 0 0 0', fontSize: 26, fontFamily: 'Fraunces, Georgia, serif', color: '#2c1a0e' }}>
            OmniCorretor Pedagógico
          </h1>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: 6, background: '#fffcf8', padding: 4, borderRadius: RADIUS.lg, border: '1px solid #d5c0b0' }}>
          <button
            onClick={() => setActiveTab('essay')}
            style={{ ...S.tabBtn, background: activeTab === 'essay' ? '#8b5e3c' : 'transparent', color: activeTab === 'essay' ? '#fff' : '#7a5c42' }}
          >
            <i className="ti ti-pencil"></i> Redação Cambridge (4D)
          </button>
          <button
            onClick={() => setActiveTab('photo')}
            style={{ ...S.tabBtn, background: activeTab === 'photo' ? '#8b5e3c' : 'transparent', color: activeTab === 'photo' ? '#fff' : '#7a5c42' }}
          >
            <i className="ti ti-camera"></i> Gabarito por Foto / OCR
          </button>
        </div>
      </div>

      {/* ─── CONTEÚDO DA ABA 2: REDAÇÃO CAMBRIDGE ───────────────────────── */}
      {activeTab === 'essay' && (
        <div className="responsive-two-col" style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 440px) 1fr', gap: 24 }}>
          {/* Painel Esquerdo: Entrada de Texto */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-settings" style={{ color: '#8b5e3c' }}></i>
              Parâmetros da Redação
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Aluno</label>
                <select
                  value={selectedStudentEssay}
                  onChange={e => setSelectedStudentEssay(e.target.value)}
                  style={S.input}
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={S.label}>Nível CEFR</label>
                  <select
                    value={targetLevel}
                    onChange={(e: any) => setTargetLevel(e.target.value)}
                    style={S.input}
                  >
                    <option value="A2">A2 Key</option>
                    <option value="B1">B1 Preliminary</option>
                    <option value="B2">B2 First</option>
                    <option value="C1">C1 Advanced</option>
                  </select>
                </div>

                <div>
                  <label style={S.label}>Gênero Textual</label>
                  <select
                    value={textGenre}
                    onChange={e => setTextGenre(e.target.value)}
                    style={S.input}
                  >
                    <option value="Email / Letter">Email / Letter</option>
                    <option value="Story / Narrative">Story / Narrative</option>
                    <option value="Opinion Essay">Opinion Essay</option>
                    <option value="Article">Article</option>
                    <option value="Review">Review</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={S.label}>Proposta da Atividade (Prompt)</label>
                <textarea
                  value={essayPrompt}
                  onChange={e => setEssayPrompt(e.target.value)}
                  rows={3}
                  style={{ ...S.input, resize: 'vertical' }}
                />
              </div>

              {/* Seletor de Modo de Entrada: Texto ou Foto Manuscrita */}
              <div>
                <label style={S.label}>Formato de Entrada da Redação</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => setEssayInputMode('text')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: RADIUS.md,
                      border: essayInputMode === 'text' ? '2px solid #8b5e3c' : '1px solid #d5c0b0',
                      background: essayInputMode === 'text' ? '#f5eee6' : '#fff',
                      color: essayInputMode === 'text' ? '#8b5e3c' : '#7a5c42',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <i className="ti ti-pencil"></i> Digitar / Colar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEssayInputMode('photo')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: RADIUS.md,
                      border: essayInputMode === 'photo' ? '2px solid #8b5e3c' : '1px solid #d5c0b0',
                      background: essayInputMode === 'photo' ? '#f5eee6' : '#fff',
                      color: essayInputMode === 'photo' ? '#8b5e3c' : '#7a5c42',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <i className="ti ti-camera"></i> Foto Manuscrita (OCR)
                  </button>
                </div>
              </div>

              {/* Se for Foto Manuscrita: Upload & OCR */}
              {essayInputMode === 'photo' && (
                <div style={{ background: '#fdf6ee', border: '1px dashed #d5bda5', borderRadius: RADIUS.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleCaptureEssayPhoto}
                      style={{ ...S.btnSecondary, background: '#fff', fontSize: TEXT.bodyCompact }}
                    >
                      <i className="ti ti-upload"></i> {essayImageUri ? 'Trocar Foto da Redação' : 'Tirar ou Enviar Foto'}
                    </button>
                    {essayImageUri && (
                      <button
                        type="button"
                        onClick={handleExtractEssayOcr}
                        disabled={isOcrExtracting}
                        style={{ ...S.btnPrimary, padding: '8px 14px', fontSize: TEXT.bodyCompact }}
                      >
                        <i className={isOcrExtracting ? 'ti ti-loader ti-spin' : 'ti ti-scan'}></i>
                        {isOcrExtracting ? 'Lendo Manuscrito...' : 'Extrair Texto da Foto'}
                      </button>
                    )}
                  </div>

                  {essayImageUri && (
                    <div style={{ position: 'relative', maxWidth: '100%', maxHeight: 180, overflow: 'hidden', borderRadius: RADIUS.md, border: '1px solid #d5c0b0' }}>
                      <img src={essayImageUri} alt="Foto da Redação" style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                    </div>
                  )}

                  {ocrWarning && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: RADIUS.md, padding: '10px 12px', fontSize: 12, color: '#991b1b', lineHeight: 1.4 }}>
                      {ocrWarning}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={S.label}>
                  {essayInputMode === 'photo' ? 'Texto Extraído da Foto (Revise se necessário)' : 'Texto da Redação do Aluno'}
                </label>
                <textarea
                  value={studentEssayText}
                  onChange={e => setStudentEssayText(e.target.value)}
                  placeholder={essayInputMode === 'photo' ? 'O texto extraído da foto aparecerá aqui para você conferir ou editar...' : 'Cole ou digite a redação em inglês do aluno aqui...'}
                  rows={8}
                  style={{ ...S.input, resize: 'vertical', fontFamily: 'monospace' }}
                />
              </div>

              <button
                onClick={handleEvaluateCambridgeEssay}
                disabled={isEvaluatingEssay || !studentEssayText.trim()}
                style={{ ...S.btnPrimary, justifyContent: 'center', marginTop: 8, opacity: !studentEssayText.trim() ? 0.6 : 1 }}
              >
                <i className={isEvaluatingEssay ? 'ti ti-loader ti-spin' : 'ti ti-bolt'}></i>
                {isEvaluatingEssay ? 'Avaliando com Rubrica Cambridge...' : 'Avaliar Redação com IA'}
              </button>
            </div>
          </div>

          {/* Painel Direito: Devolutiva Cambridge */}
          <div style={S.card}>
            {!essayEvaluation && !isEvaluatingEssay && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a08060' }}>
                <i className="ti ti-file-certificate" style={{ fontSize: 48, opacity: 0.4, marginBottom: 12 }}></i>
                <h3 style={{ margin: '0 0 6px 0', color: '#4a382a' }}>Nenhuma redação avaliada ainda</h3>
                <p style={{ margin: 0, fontSize: 13 }}>
                  Cole o texto do aluno ao lado e clique em "Avaliar Redação com IA" para gerar o parecer completo.
                </p>
              </div>
            )}

            {isEvaluatingEssay && (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: '#8b5e3c' }}>
                <i className="ti ti-loader ti-spin" style={{ fontSize: 40, marginBottom: 12 }}></i>
                <h3 style={{ margin: 0 }}>Processando Rubrica Oficial Cambridge...</h3>
                <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#7a6552' }}>
                  Analisando Content, Communicative Achievement, Organisation e Language.
                </p>
              </div>
            )}

            {essayEvaluation && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Header do Resultado */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #d5c0b0', paddingBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 12, color: '#7a6552', fontWeight: 600 }}>Nota Final Normalizada</span>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#2d9d5d', fontFamily: 'Fraunces, Georgia, serif' }}>
                      {essayEvaluation.overallScore.toFixed(1)} <span style={{ fontSize: 16, color: '#a08060' }}>/ 10,0</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleExportEssayPdf} style={S.btnSecondary}>
                      <i className="ti ti-printer"></i> Baixar PDF
                    </button>
                    <button
                      onClick={handleSaveEssayToGradebook}
                      disabled={launchedEssay}
                      style={{ ...S.btnPrimary, background: launchedEssay ? '#2d9d5d' : '#8b5e3c' }}
                    >
                      <i className={launchedEssay ? 'ti ti-check' : 'ti ti-database-export'}></i>
                      {launchedEssay ? 'Lançado no Gradebook!' : 'Lançar Nota'}
                    </button>
                  </div>
                </div>

                {/* Grid dos 4 Critérios Cambridge */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {/* 1. Content */}
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: RADIUS.lg, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>1. Content</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.content.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.content.justification}</p>
                  </div>

                  {/* 2. Communicative Achievement */}
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: RADIUS.lg, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>2. Comm. Achievement</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.communicativeAchievement.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.communicativeAchievement.justification}</p>
                  </div>

                  {/* 3. Organisation */}
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: RADIUS.lg, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>3. Organisation</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.organisation.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.organisation.justification}</p>
                  </div>

                  {/* 4. Language */}
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: RADIUS.lg, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>4. Language</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.language.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.language.justification}</p>
                  </div>
                </div>

                {/* Erros e Interferência L1 */}
                {essayEvaluation.detectedErrors.length > 0 && (
                  <div style={{ background: '#fff', border: '1px solid #e8decb', borderRadius: RADIUS.lg, padding: 14 }}>
                    <strong style={{ fontSize: 13, color: '#2c1a0e', display: 'block', marginBottom: 8 }}>
                      🔍 Análise Contrastiva & Erros Detectados:
                    </strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {essayEvaluation.detectedErrors.map((err, idx) => (
                        <div key={idx} style={{ fontSize: 12, color: '#4a382a', background: '#fdf8f2', padding: '6px 10px', borderRadius: 6 }}>
                          <span style={{ textDecoration: 'line-through', color: '#dc322f' }}>"{err.excerpt}"</span>
                          {' ➔ '}
                          <span style={{ color: '#2d9d5d', fontWeight: 700 }}>"{err.correction}"</span>
                          <span style={{ color: '#7a6552', marginLeft: 8 }}>({err.explanation})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sinalizador Pedagógico de Triagem Estilométrica (Não-Punitivo / Nota Blindada) */}
                {essayEvaluation.stylometricAdvisory?.hasAnomaly && essayEvaluation.stylometricAdvisory.teacherAdvisoryNotice && (
                  <div style={{
                    background: '#fefce8',
                    border: '1px solid #fde047',
                    borderRadius: RADIUS.lg,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12
                  }}>
                    <i className="ti ti-bulb" style={{ fontSize: 20, color: '#854d0e', marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#854d0e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Triagem Estilométrica Formativa (Aviso ao Professor)
                      </div>
                      <p style={{ margin: '4px 0 6px 0', fontSize: 12.5, color: '#713f12', lineHeight: 1.45 }}>
                        {essayEvaluation.stylometricAdvisory.teacherAdvisoryNotice}
                      </p>
                      <span style={{ fontSize: 11, color: '#a16207' }}>
                        * Nota oficial blindada. Este sinalizador serve exclusivamente como apoio à mediação e arguição dialógica do professor.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── CONTEÚDO DA ABA 1: FOTO / OCR & OMR ──────────────────────── */}
      {activeTab === 'photo' && (
        <div className="responsive-two-col" style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 440px) 1fr', gap: 24 }}>
          {/* Coluna Esquerda: Configuração e Captura */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: 16, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-scan" style={{ color: '#8b5e3c' }} /> Gabarito & Folha de Respostas
            </h3>

            {/* SELETOR DE CENÁRIO (A vs B) */}
            <div style={{ marginBottom: 16, padding: '10px 12px', background: '#faf6f0', borderRadius: RADIUS.md, border: '1px solid #e8decb' }}>
              <label style={{ ...S.label, marginBottom: 8, fontSize: TEXT.caption }}>
                Tipo de Folha / Mecanismo de Reconhecimento:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setGradingScenario('scenario_a_omr')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: RADIUS.md,
                    fontSize: TEXT.caption,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    border: gradingScenario === 'scenario_a_omr' ? '2px solid #2d9d5d' : '1px solid #d5c0b0',
                    background: gradingScenario === 'scenario_a_omr' ? '#eef9f2' : '#fff',
                    color: gradingScenario === 'scenario_a_omr' ? '#2d9d5d' : '#7a6552'
                  }}
                >
                  <span>🟢 Folha Oficial</span>
                  <span style={{ fontSize: 9.5, fontWeight: 500, opacity: 0.85 }}>OMR Alta Precisão</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGradingScenario('scenario_b_external')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: RADIUS.md,
                    fontSize: TEXT.caption,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    border: gradingScenario === 'scenario_b_external' ? '2px solid #b58900' : '1px solid #d5c0b0',
                    background: gradingScenario === 'scenario_b_external' ? '#fffdf0' : '#fff',
                    color: gradingScenario === 'scenario_b_external' ? '#b58900' : '#7a6552'
                  }}
                >
                  <span>⚠️ Prova Externa</span>
                  <span style={{ fontSize: 9.5, fontWeight: 500, opacity: 0.85 }}>Leitura Visão IA</span>
                </button>
              </div>

              <div style={{ marginTop: 8, fontSize: 11, color: '#7a6552', lineHeight: 1.35 }}>
                {gradingScenario === 'scenario_a_omr' ? (
                  <span><strong>Cenário A:</strong> Cartão gerado pelo Teacher AI com marcadores nos 4 cantos. Processamento determinístico em <strong>&lt; 50ms</strong>.</span>
                ) : (
                  <span><strong>Cenário B:</strong> Prova feita fora do app. Utiliza IA generativa com revisão visual recomendada.</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Aluno Avaliado</label>
                <select value={selectedStudentPhoto} onChange={e => setSelectedStudentPhoto(e.target.value)} style={S.input}>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={S.label}>Título da Avaliação</label>
                <input value={examTitlePhoto} onChange={e => setExamTitlePhoto(e.target.value)} style={S.input} />
              </div>

              <div>
                <label style={S.label}>Gabarito Oficial (1:A, 2:B, 3:C...)</label>
                <input value={answerKeyPhoto} onChange={e => setAnswerKeyPhoto(e.target.value)} style={S.input} />
              </div>

              <div>
                <label style={S.label}>Foto da Folha de Respostas</label>
                <button onClick={handleCapturePhoto} style={{ ...S.btnSecondary, width: '100%', justifyContent: 'center' }}>
                  <i className="ti ti-camera"></i> {imageUri ? 'Alterar Foto da Folha' : 'Tirar Foto / Carregar Imagem'}
                </button>
              </div>

              {imageUri && (
                <div style={{ textAlign: 'center', background: '#faf6f0', padding: 8, borderRadius: RADIUS.md, border: '1px solid #e8decb' }}>
                  <img src={imageUri} alt="Imagem da prova do aluno" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 6, objectFit: 'contain' }} />
                </div>
              )}

              <button
                onClick={handleGradePhoto}
                disabled={isGradingPhoto || !imageUri}
                style={{
                  ...S.btnPrimary,
                  justifyContent: 'center',
                  marginTop: 6,
                  background: isGradingPhoto ? '#a08060' : (gradingScenario === 'scenario_a_omr' ? '#2d9d5d' : '#8b5e3c')
                }}
              >
                <i className={isGradingPhoto ? 'ti ti-loader ti-spin' : 'ti ti-scan'}></i>
                {isGradingPhoto
                  ? (gradingScenario === 'scenario_a_omr' ? 'Processando OMR Instantâneo...' : 'Processando com IA...')
                  : (gradingScenario === 'scenario_a_omr' ? '⚡ Corrigir com OMR Instantâneo' : '🔍 Corrigir Prova Externa (IA)')
                }
              </button>
            </div>
          </div>

          {/* Coluna Direita: Resultados & Inspeção */}
          <div style={S.card}>
            {!photoGradeResult ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a08060' }}>
                <i className="ti ti-scan" style={{ fontSize: 52, opacity: 0.35, marginBottom: 12 }}></i>
                <h3 style={{ margin: '0 0 6px 0', color: '#4a382a' }}>Aguardando Folha de Respostas</h3>
                <p style={{ margin: 0, fontSize: 13 }}>
                  Carregue a foto da folha de respostas ao lado e clique em corrigir para visualizar o espelho de notas.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header de Desempenho e Lançamento */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #d5c0b0', paddingBottom: 14 }}>
                  <div>
                    <span style={{ fontSize: 12, color: '#7a6552', fontWeight: 600 }}>Nota Final Calculada</span>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#2d9d5d', fontFamily: 'Fraunces, Georgia, serif' }}>
                      {photoGradeResult.score.toFixed(1)} <span style={{ fontSize: 16, color: '#a08060' }}>/ 10,0</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#7a6552', marginTop: 2 }}>
                      Acertos: <strong>{photoGradeResult.correctCount}</strong> de {photoGradeResult.totalQuestions} questões ({((photoGradeResult.correctCount / photoGradeResult.totalQuestions) * 100).toFixed(0)}%)
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={handleSavePhotoToGradebook}
                      disabled={launchedPhoto}
                      style={{ ...S.btnPrimary, background: launchedPhoto ? '#2d9d5d' : '#8b5e3c' }}
                    >
                      <i className={launchedPhoto ? 'ti ti-check' : 'ti ti-database-export'}></i>
                      {launchedPhoto ? 'Lançado no Gradebook!' : 'Lançar Nota'}
                    </button>
                  </div>
                </div>

                {/* Badge Informativo do Mecanismo Utilizado */}
                {omrResult ? (
                  <div style={{ padding: '8px 12px', borderRadius: RADIUS.md, background: '#eef9f2', border: '1px solid #c0ebd0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2d9d5d', fontWeight: 700 }}>
                      <i className="ti ti-circle-check" /> OMR Determinístico: {omrResult.processingTimeMs}ms &bull; Inclinação: {omrResult.skewAngleDegrees}°
                    </div>
                    <span style={{ color: '#555', fontSize: 11 }}>
                      {omrResult.fallbackCount === 0 ? '✅ 100% Alta Confiança' : `⚠️ ${omrResult.fallbackCount} questão(ões) em revisão`}
                    </span>
                  </div>
                ) : (
                  <div style={{ padding: '8px 12px', borderRadius: RADIUS.md, background: '#fffdf0', border: '1px solid #ffe58f', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b58900' }}>
                    <i className="ti ti-alert-triangle" /> Prova Externa (Visão IA). Clique em qualquer questão abaixo para inspecionar ou ajustar.
                  </div>
                )}

                {/* Grid das Questões com Badges de Confiança */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                  {photoGradeResult.questions.map(q => {
                    const omrQ = omrResult?.questions.find(item => item.questionNumber === q.num)
                    const isSelected = inspectingQuestionIndex === q.num
                    const isAmbiguous = omrQ?.isAmbiguous || omrQ?.classification === 'multiple_marks'
                    const isBlank = omrQ?.classification === 'blank' || q.studentAnswer === '?'

                    let cardBg = q.isCorrect ? '#eef9f8' : '#fdf2f2'
                    let cardBorder = q.isCorrect ? '#2aa198' : '#dc322f'

                    if (isAmbiguous) {
                      cardBg = '#fffdf0'
                      cardBorder = '#b58900'
                    } else if (isBlank) {
                      cardBg = '#f5f5f5'
                      cardBorder = '#d0d0d0'
                    }

                    return (
                      <div
                        key={q.num}
                        onClick={() => setInspectingQuestionIndex(isSelected ? null : q.num)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: RADIUS.md,
                          background: cardBg,
                          border: `1.5px solid ${cardBorder}`,
                          cursor: 'pointer',
                          boxShadow: isSelected ? '0 0 0 2px #8b5e3c' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#2c1a0e' }}>Q{String(q.num).padStart(2, '0')}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: q.isCorrect ? '#2d9d5d' : '#dc322f' }}>
                            {q.isCorrect ? '1.0 pt' : '0.0 pt'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 15, fontWeight: 900, color: q.isCorrect ? '#2aa198' : (isAmbiguous ? '#b58900' : '#dc322f') }}>
                            {q.studentAnswer || '—'}
                          </span>
                          <span style={{ fontSize: 11, color: '#7a6552' }}>
                            (Gabarito: <strong>{q.correctAnswer}</strong>)
                          </span>
                        </div>

                        {omrQ && (
                          <div style={{ marginTop: 4, fontSize: 9.5, color: '#7a6552', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Fill: {((omrQ.optionsDetail.find(o => o.option === q.studentAnswer)?.fillRatio || 0) * 100).toFixed(0)}%</span>
                            <span style={{ fontWeight: 600, color: omrQ.confidence === 'high' ? '#2d9d5d' : '#b58900' }}>
                              {omrQ.confidence === 'high' ? 'Alta' : 'Revisão'}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* PAINEL DE INSPEÇÃO & OVERRIDE DE 1 CLIQUE */}
                {inspectingQuestionIndex !== null && (
                  <div style={{ marginTop: 10, padding: 14, background: '#faf6f0', borderRadius: RADIUS.md, border: '1.5px solid #8b5e3c' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>
                        🔍 Inspeção da Questão {inspectingQuestionIndex}
                      </strong>
                      <span style={{ fontSize: 12, color: '#7a6552' }}>
                        Gabarito Oficial: <strong>{photoGradeResult.questions.find(q => q.num === inspectingQuestionIndex)?.correctAnswer}</strong>
                      </span>
                    </div>

                    <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#555' }}>
                      Clique na alternativa correta abaixo para atualizar a nota instantaneamente caso tenha havido rasura ou ajuste do professor:
                    </p>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['A', 'B', 'C', 'D', 'E'].map(opt => {
                        const currentAns = photoGradeResult.questions.find(q => q.num === inspectingQuestionIndex)?.studentAnswer
                        const isCurrent = currentAns === opt
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleManualOverrideQuestion(inspectingQuestionIndex, opt)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: RADIUS.md,
                              fontSize: 13,
                              fontWeight: 800,
                              cursor: 'pointer',
                              border: isCurrent ? '2px solid #2d9d5d' : '1px solid #d5c0b0',
                              background: isCurrent ? '#2d9d5d' : '#fff',
                              color: isCurrent ? '#fff' : '#2c1a0e'
                            }}
                          >
                            Opção {opt}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => handleManualOverrideQuestion(inspectingQuestionIndex, null)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: RADIUS.md,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: '1px solid #dc322f',
                          background: '#fff',
                          color: '#dc322f'
                        }}
                      >
                        ✕ Anular / Branco
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}