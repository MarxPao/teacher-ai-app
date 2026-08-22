'use client'

import { useState, useEffect } from 'react'
import { captureImageFile, extractContentFromImage } from '@/lib/ocrCapture'
import { exportToPdf } from '@/lib/exportUtils'
import { recordStudentGrade, addObservation } from '@/lib/studentMemory'

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
  card: { background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: '24px', boxShadow: '0 2px 8px rgba(44,26,14,0.06)' },
  tabBtn: { padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' },
  input: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13.5, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#7a6552', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 6 },
  btnPrimary: { background: 'linear-gradient(135deg, #8b5e3c 0%, #6f4728 100%)', color: '#fff', padding: '10px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(139,94,60,0.25)' },
  btnSecondary: { background: '#fffcf8', border: '1px solid #d5c0b0', color: '#4a382a', padding: '10px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
}

const CEFR_WORD_LIMITS: Record<string, { min: number; max: number; task: string }> = {
  'A1': { min: 50, max: 80, task: 'Simple Message' },
  'A2': { min: 100, max: 120, task: 'Message/Email' },
  'B1': { min: 100, max: 150, task: 'Article/Story/Letter' },
  'B2': { min: 140, max: 190, task: 'Task 1 (220-260 Task 2)' },
  'C1': { min: 220, max: 260, task: 'Task 1 (280-320 Task 2)' },
  'C2': { min: 280, max: 320, task: 'Advanced Composition' },
}

export default function OmniGrader() {
  const [activeTab, setActiveTab] = useState<'photo' | 'essay' | 'batch'>('essay')
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])

  // State: Aba 1 (Foto / OCR)
  const [selectedStudentPhoto, setSelectedStudentPhoto] = useState('')
  const [examTitlePhoto, setExamTitlePhoto] = useState('Prova Bimestral de Inglês')
  const [answerKeyPhoto, setAnswerKeyPhoto] = useState('1:A, 2:B, 3:C, 4:D, 5:A, 6:C, 7:B, 8:D, 9:A, 10:B')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [isGradingPhoto, setIsGradingPhoto] = useState(false)
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
      alert(`Falha ao selecionar imagem: ${String(e)}`)
    }
  }

  async function handleGradePhoto() {
    if (!imageUri) { alert('Selecione ou tire a foto da prova primeiro.'); return }
    const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
    const activeApi = apis.find((a: any) => a.active && a.key) || { id: 'auto', provider: 'gemini', key: 'auto' }

    setIsGradingPhoto(true)
    try {
      const ocr = await extractContentFromImage(imageUri, activeApi)
      const keyPairs = answerKeyPhoto.split(',').map(s => s.trim().split(':')).filter(arr => arr.length === 2)
      const parsedKey: Record<number, string> = {}
      keyPairs.forEach(([qNum, ans]) => {
        parsedKey[parseInt(qNum)] = ans.trim().toUpperCase()
      })

      const totalQ = Object.keys(parsedKey).length || 10
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
      setPhotoGradeResult({
        score: finalScore,
        totalQuestions: totalQ,
        correctCount: correct,
        questions: results,
        rawText: ocr.rawText
      })
    } catch (err: any) {
      alert(`Erro no processamento OCR: ${err.message || 'Verifique sua chave de IA'}`)
    } finally {
      setIsGradingPhoto(false)
    }
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
      alert(`Nota ${photoGradeResult.score}/10 lançada com sucesso para ${updated[idx].name}!`)
    }
  }

  // ─── ABA 2: Redação Cambridge ───────────────────────────────────────────
  async function handleCaptureEssayPhoto() {
    try {
      const base64 = await captureImageFile()
      setEssayImageUri(base64)
      setOcrWarning(null)
    } catch (e) {
      alert(`Falha ao selecionar imagem: ${String(e)}`)
    }
  }

  async function handleExtractEssayOcr() {
    if (!essayImageUri) {
      alert('Selecione ou tire a foto da redação manuscrita primeiro.')
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
        setStudentEssayText(text)
        setOcrWarning(null)
      }
    } catch (err: any) {
      setOcrWarning('⚠️ Falha ao processar o texto manuscrito da imagem. Por favor, verifique a nitidez da foto ou insira o texto manualmente.')
    } finally {
      setIsOcrExtracting(false)
    }
  }
  async function handleEvaluateCambridgeEssay() {
    if (!studentEssayText.trim()) {
      alert('Cole ou digite a redação do aluno para iniciar a avaliação.')
      return
    }

    setIsEvaluatingEssay(true)
    setEssayEvaluation(null)
    setLaunchedEssay(false)

    try {
      const studentObj = students.find(s => s.id === selectedStudentEssay)
      const studentName = studentObj ? studentObj.name : 'Aluno'

      // PASSO 1: Macro-Discurso (Content + Communicative Achievement) com isolamento psicométrico
      const promptPass1 = `Você é um Examinador Oficial de Redação Cambridge Assessment English (A2 Key / B1 Preliminary / B2 First / C1 Advanced).
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

      // PASSO 2: Micro-Linguístico (Organisation + Language) com isolamento psicométrico
      const promptPass2 = `Você é um Examinador Oficial de Redação Cambridge Assessment English (A2 Key / B1 Preliminary / B2 First / C1 Advanced).
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
          body: JSON.stringify({ messages: [{ role: 'user', content: promptPass1 }] })
        }),
        fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: promptPass2 }] })
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

      const combinedEvaluation = {
        overallScore,
        content: pass1.content || { score: contentScore, justification: '', strengths: [], improvements: [] },
        communicativeAchievement: pass1.communicativeAchievement || { score: commAchScore, justification: '', strengths: [], improvements: [] },
        organisation: pass2.organisation || { score: orgScore, justification: '', strengths: [], improvements: [] },
        language: pass2.language || { score: langScore, justification: '', strengths: [], improvements: [] },
        overallSummary: pass1.macroSummary || 'Redação avaliada com rigor psicométrico em dupla passada independente.',
        studentActionPlan: pass2.studentActionPlan || 'Praticar o uso variado de linkers e vocabulário avançado.',
        detectedErrors: Array.isArray(pass2.detectedErrors) ? pass2.detectedErrors : []
      }

      setEssayEvaluation(combinedEvaluation)
    } catch (err: any) {
      alert(`Erro na avaliação da redação: ${err.message || 'Tente novamente'}`)
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
      alert(`Nota ${essayEvaluation.overallScore}/10 lançada com sucesso no Gradebook de ${updated[idx].name}!`)
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
        <div style={{ display: 'flex', gap: 6, background: '#fffcf8', padding: 4, borderRadius: 12, border: '1px solid #d5c0b0' }}>
          <button
            onClick={() => setActiveTab('essay')}
            style={{ ...S.tabBtn, background: activeTab === 'essay' ? '#8b5e3c' : 'transparent', color: activeTab === 'essay' ? '#fff' : '#586e75' }}
          >
            <i className="ti ti-pencil"></i> Redação Cambridge (4D)
          </button>
          <button
            onClick={() => setActiveTab('photo')}
            style={{ ...S.tabBtn, background: activeTab === 'photo' ? '#8b5e3c' : 'transparent', color: activeTab === 'photo' ? '#fff' : '#586e75' }}
          >
            <i className="ti ti-camera"></i> Gabarito por Foto / OCR
          </button>
        </div>
      </div>

      {/* ─── CONTEÚDO DA ABA 2: REDAÇÃO CAMBRIDGE ───────────────────────── */}
      {activeTab === 'essay' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 450px) 1fr', gap: 24 }}>
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
                      borderRadius: 8,
                      border: essayInputMode === 'text' ? '2px solid #8b5e3c' : '1px solid #d5c0b0',
                      background: essayInputMode === 'text' ? '#f5eee6' : '#fff',
                      color: essayInputMode === 'text' ? '#8b5e3c' : '#586e75',
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
                      borderRadius: 8,
                      border: essayInputMode === 'photo' ? '2px solid #8b5e3c' : '1px solid #d5c0b0',
                      background: essayInputMode === 'photo' ? '#f5eee6' : '#fff',
                      color: essayInputMode === 'photo' ? '#8b5e3c' : '#586e75',
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
                <div style={{ background: '#fdf6ee', border: '1px dashed #d5bda5', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleCaptureEssayPhoto}
                      style={{ ...S.btnSecondary, background: '#fff', fontSize: 12.5 }}
                    >
                      <i className="ti ti-upload"></i> {essayImageUri ? 'Trocar Foto da Redação' : 'Tirar ou Enviar Foto'}
                    </button>
                    {essayImageUri && (
                      <button
                        type="button"
                        onClick={handleExtractEssayOcr}
                        disabled={isOcrExtracting}
                        style={{ ...S.btnPrimary, padding: '8px 14px', fontSize: 12.5 }}
                      >
                        <i className={isOcrExtracting ? 'ti ti-loader ti-spin' : 'ti ti-scan'}></i>
                        {isOcrExtracting ? 'Lendo Manuscrito...' : 'Extrair Texto da Foto'}
                      </button>
                    )}
                  </div>

                  {essayImageUri && (
                    <div style={{ position: 'relative', maxWidth: '100%', maxHeight: 180, overflow: 'hidden', borderRadius: 8, border: '1px solid #d5c0b0' }}>
                      <img src={essayImageUri} alt="Foto da Redação" style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                    </div>
                  )}

                  {ocrWarning && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#991b1b', lineHeight: 1.4 }}>
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
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: 12, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>1. Content</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.content.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.content.justification}</p>
                  </div>

                  {/* 2. Communicative Achievement */}
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: 12, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>2. Comm. Achievement</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.communicativeAchievement.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.communicativeAchievement.justification}</p>
                  </div>

                  {/* 3. Organisation */}
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: 12, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>3. Organisation</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.organisation.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.organisation.justification}</p>
                  </div>

                  {/* 4. Language */}
                  <div style={{ background: '#fdf8f2', padding: 14, borderRadius: 12, border: '1px solid #e8decb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#2c1a0e' }}>4. Language</strong>
                      <span style={{ fontWeight: 800, color: '#8b5e3c' }}>{essayEvaluation.language.score.toFixed(1)} / 5.0</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a382a', lineHeight: 1.4 }}>{essayEvaluation.language.justification}</p>
                  </div>
                </div>

                {/* Erros e Interferência L1 */}
                {essayEvaluation.detectedErrors.length > 0 && (
                  <div style={{ background: '#fff', border: '1px solid #e8decb', borderRadius: 12, padding: 14 }}>
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── CONTEÚDO DA ABA 1: FOTO / OCR ──────────────────────────────── */}
      {activeTab === 'photo' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 24 }}>
          <div style={S.card}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#2c1a0e' }}>Gabarito & Foto</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Aluno</label>
                <select value={selectedStudentPhoto} onChange={e => setSelectedStudentPhoto(e.target.value)} style={S.input}>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Gabarito Correto</label>
                <input value={answerKeyPhoto} onChange={e => setAnswerKeyPhoto(e.target.value)} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Foto da Folha de Respostas</label>
                <button onClick={handleCapturePhoto} style={{ ...S.btnSecondary, width: '100%', justifyContent: 'center' }}>
                  <i className="ti ti-camera"></i> {imageUri ? 'Alterar Imagem' : 'Capturar / Carregar Imagem'}
                </button>
              </div>
              {imageUri && (
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <img src={imageUri} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: '1px solid #ccc' }} />
                </div>
              )}
              <button onClick={handleGradePhoto} disabled={isGradingPhoto} style={{ ...S.btnPrimary, justifyContent: 'center', marginTop: 8 }}>
                <i className={isGradingPhoto ? 'ti ti-loader ti-spin' : 'ti ti-scan'}></i>
                {isGradingPhoto ? 'Processando OCR...' : 'Corrigir Gabarito por Foto'}
              </button>
            </div>
          </div>

          <div style={S.card}>
            {!photoGradeResult ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a08060' }}>
                <i className="ti ti-camera" style={{ fontSize: 48, opacity: 0.4, marginBottom: 12 }}></i>
                <p>Faça upload da folha de respostas para ver a correção questão a questão.</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 12, color: '#7a6552' }}>Nota Calculada</span>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#2d9d5d' }}>{photoGradeResult.score.toFixed(1)} / 10</div>
                  </div>
                  <button onClick={handleSavePhotoToGradebook} disabled={launchedPhoto} style={S.btnPrimary}>
                    <i className={launchedPhoto ? 'ti ti-check' : 'ti ti-database-export'}></i>
                    {launchedPhoto ? 'Lançado!' : 'Lançar Nota'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                  {photoGradeResult.questions.map(q => (
                    <div key={q.num} style={{ padding: '8px 10px', borderRadius: 8, background: q.isCorrect ? '#eef9f8' : '#fdf2f2', border: `1px solid ${q.isCorrect ? '#2aa198' : '#dc322f'}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>Q{q.num}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: q.isCorrect ? '#2aa198' : '#dc322f' }}>
                        {q.studentAnswer} {q.isCorrect ? '✓' : `(Gabarito: ${q.correctAnswer})`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}