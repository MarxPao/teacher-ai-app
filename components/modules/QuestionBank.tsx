'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useModalA11y } from '@/hooks/useModalA11y'
import { ELT_TAXONOMY, getSubcategoriesForCategory } from '@/lib/englishTaxonomy'
import { 
  getStoredQuestions, 
  saveStoredQuestions, 
  extractQuestionsFromBookText, 
  UnifiedQuestion 
} from '@/lib/questionBankService'
import { evaluateItemPsychometrics, EmpiricalPsychometrics } from '@/lib/psychometricsEngine'
import { analyzeBankCrossTurmas, QuestionBankAnalyticsSummary } from '@/lib/questionBankAnalytics'
import CatReadinessCard from '@/components/CatReadinessCard'


/* Tipos */
interface School { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string; subject?: string; year?: string }

export type ActivityKind = 'lesson' | 'exercise' | 'exam' | 'question'

export const KIND_LABELS: Record<ActivityKind, { label: string; icon: string; color: string; bg: string }> = {
 lesson: { label: 'Aula Criada', icon: 'ti-chalkboard', color: '#8b5e3c', bg: 'rgba(139,94,60,0.12)' },
 exercise: { label: 'Lista de Exercícios', icon: 'ti-sparkles', color: '#2a6080', bg: 'rgba(42,96,128,0.12)' },
 exam: { label: 'Prova & Gabarito', icon: 'ti-file-text', color: '#c87a1e', bg: 'rgba(200,122,30,0.12)' },
 question: { label: 'Questão Isolada', icon: 'ti-help-circle',color: '#3d7a4e', bg: 'rgba(61,122,78,0.12)' },
}

interface Question {
 id: string
 statement: string // Enunciado
 type: QuestionType
 activityKind?: ActivityKind // Tipo de atividade (aula, exercício, prova, questão)
 options?: string[] // Alternativas A-D (MC)
 answer?: string // Gabarito
 explanation?: string // Comentário/resolução
 subject: string // Disciplina
 topic: string // Assunto/tópico
 eltCategory?: string // Categoria ELT (Grammar, Vocabulary, etc.)
 eltSubcategory?: string // Subcategoria ELT (Tenses, Phrasal Verbs, etc.)
 bnccCode?: string // Código BNCC / ENEM (ex: EF09LI01, EM13LGG101)
 level: string // Nível (A1, B2, Básico)
 year: string // Ano letivo
 schoolId: string // Escola
 classRef: string // Turma (opcional)
 tags: string[]
 createdAt: number
 source: 'manual' | 'ai'
}

type QuestionType = 'mc' | 'essay' | 'tf' | 'fill'

const TYPE_LABELS: Record<QuestionType, string> = {
 mc: 'Múltipla Escolha',
 essay: 'Dissertativa',
 tf: 'V ou F',
 fill: 'Preencher Lacuna',
}
const LEVELS = ['A1','A2','B1','B2','C1','C2','Básico','Intermediário','Avançado']
const YEARS = ['2023','2024','2025','2026']
const OPTION_LETTERS = ['A','B','C','D']

const S: Record<string, React.CSSProperties> = {
 page: { padding: '36px 42px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },
 card: { background: '#fffcf8', border: '1px solid rgba(139,115,85,0.14)', borderRadius: RADIUS.xl, padding: '20px 24px', boxShadow: '0 2px 8px rgba(44,26,14,0.06)' },
 badge: { display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
 btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: RADIUS.md, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },
 input: { width: '100%', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.18)', background: '#fffcf8', color: '#2c1a0e', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
 label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: 6 },
}

function getActiveApi() {
 try { const a = JSON.parse(localStorage.getItem('teacher_apis') || '[]'); return a.find((x: { active: boolean; provider: string }) => x.active && x.provider !== 'manual') || null } catch { return null }
}

/* 
 COMPONENTE PRINCIPAL
 */
function calculateItemStats(item: { responseHistory?: Array<{ studentId: string; correct: boolean; totalExamScore?: number; timestamp: number }>, level?: string }): {
  p: number; D: number | null; classification: string; classColor: string; divergenceMessage?: string; discriminationWarning?: string
} {
  const history = item.responseHistory || []
  if (history.length < 3) return { p: -1, D: null, classification: 'Sem dados', classColor: 'text-gray-400' }
  
  const psychometrics = evaluateItemPsychometrics(history as any, item.level)
  const p = psychometrics.pValue
  const D = psychometrics.discriminationIndex
  
  let classification = ''
  let classColor = ''
  if (p < 0.25) { classification = `Muito Difícil (p=${p.toFixed(2)})`; classColor = 'text-red-600' }
  else if (p < 0.50) { classification = `Difícil (p=${p.toFixed(2)})`; classColor = 'text-orange-600' }
  else if (p > 0.85) { classification = `Muito Fácil (p=${p.toFixed(2)})`; classColor = 'text-yellow-600' }
  else if (p > 0.65) { classification = `Fácil (p=${p.toFixed(2)})`; classColor = 'text-blue-600' }
  else { classification = `Ideal (p=${p.toFixed(2)})`; classColor = 'text-green-600' }
  
  return {
    p,
    D,
    classification,
    classColor,
    divergenceMessage: psychometrics.divergenceMessage,
    discriminationWarning: psychometrics.discriminationWarning
  }
}


export default function QuestionBank() {
 const [schools, setSchools] = useState<School[]>([])
 const [classes, setClasses] = useState<ClassRecord[]>([])
 const [questions, setQuestions] = useState<Question[]>([])
 const [selectedQ, setSelectedQ] = useState<Question | null>(null)
 const [modal, setModal] = useState<'add' | 'ai' | null>(null)
 const [isGen, setIsGen] = useState(false)

 /* Estado do Assistente de Extração Inteligente de Livros */
 const [showExtractModal, setShowExtractModal] = useState(false)
 const [extractBooks, setExtractBooks] = useState<Array<{ id: any; title: string; content?: string; type?: string; category?: string }>>([])
 const [selectedExtractBookId, setSelectedExtractBookId] = useState<string>('')
 const [extractedList, setExtractedList] = useState<Array<UnifiedQuestion & { selected: boolean }>>([])
 const [showAnalyticsModal, setShowAnalyticsModal] = useState(false)

 /* Filtros */
 const [fKind, setFKind] = useState<'all' | ActivityKind>('all')
 const [fSchool, setFSchool] = useState('all')
 const [fClass, setFClass] = useState('all')
 const [fYear, setFYear] = useState('all')
 const [fSubject, setFSubject] = useState('all')
 const [fType, setFType] = useState('all')
 const [fLevel, setFLevel] = useState('all')
 const [fText, setFText] = useState('')

 /* Form novo */
 const [fKind2, setFKind2] = useState<ActivityKind>('exercise')
 const [fStatement, setFStatement] = useState('')
 const [fType2, setFType2] = useState<QuestionType>('mc')
 const [fOptions, setFOptions] = useState<string[]>(['', '', '', ''])
 const [fAnswer, setFAnswer] = useState('')
 const [fExplanation, setFExplanation] = useState('')
 const [fSubject2, setFSubject2] = useState('Inglês')
 const [fTopic, setFTopic] = useState('')
 const [fEltCat, setFEltCat] = useState('grammar')
 const [fEltSubcat, setFEltSubcat] = useState('tenses')
 const [fBnccCode, setFBnccCode] = useState('')
 const [fLevel2, setFLevel2] = useState('B1')
 const [fYear2, setFYear2] = useState('2025')
 const [fSchool2, setFSchool2] = useState('')
 const [fClass2, setFClass2] = useState('')
 const [fTags, setFTags] = useState('')

 /* Form geração IA */
 const [aiKind, setAiKind] = useState<ActivityKind>('exercise')
 const [aiTopic, setAiTopic] = useState('')
 const [aiSubject, setAiSubject] = useState('Inglês')
 const [aiEltCat, setAiEltCat] = useState('grammar')
 const [aiEltSubcat, setAiEltSubcat] = useState('tenses')
 const [aiLevel, setAiLevel] = useState('B1')
 const [aiYear, setAiYear] = useState('2025')
 const [aiCount, setAiCount] = useState(5)
 const [aiType, setAiType] = useState<QuestionType>('mc')
 const [aiSchool, setAiSchool] = useState('')

 /* Rubricas & Gabaritos State (Auto-Sync) */
 const [rubrics, setRubrics] = useState<any[]>([])
 const [previewRubric, setPreviewRubric] = useState<any | null>(null)

  /* Modal Accessibility Refs & Hooks (WCAG 2.1 AA) */
  const addModalRef = useRef<HTMLDivElement>(null)
  const aiModalRef = useRef<HTMLDivElement>(null)
  const extractModalRef = useRef<HTMLDivElement>(null)
  const previewRubricModalRef = useRef<HTMLDivElement>(null)

  useModalA11y({
    isOpen: modal === 'add',
    onClose: () => setModal(null),
    modalRef: addModalRef
  })

  useModalA11y({
    isOpen: modal === 'ai',
    onClose: () => setModal(null),
    modalRef: aiModalRef
  })

  useModalA11y({
    isOpen: showExtractModal,
    onClose: () => setShowExtractModal(false),
    modalRef: extractModalRef
  })

  useModalA11y({
    isOpen: !!previewRubric,
    onClose: () => setPreviewRubric(null),
    modalRef: previewRubricModalRef
  })

 const autoSyncRubrics = async () => {
 try {
 const local = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]')
 const { fetchSupabaseActivitiesAndRubrics } = await import('@/lib/supabaseClient')
 const cloud = await fetchSupabaseActivitiesAndRubrics()
 const cloudRubrics = cloud.filter(c => c.sourceTable === 'rubrics_and_answer_keys' || c.type === 'rubric' || c.type === 'answer_key')

 const map = new Map<string, any>()
 for (const item of [...local, ...cloudRubrics]) {
 if (item.id) map.set(item.id, item)
 }
 setRubrics(Array.from(map.values()))
 } catch {
 try {
 const local = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]')
 setRubrics(local)
 } catch {}
 }
 }

 useEffect(() => {
 autoSyncRubrics()
 window.addEventListener('storage', autoSyncRubrics)
 return () => window.removeEventListener('storage', autoSyncRubrics)
 }, [])

 const handleDeleteRubric = async (item: any) => {
 if (!(await showConfirm({ message: `Deseja excluir a rubrica/gabarito "${item.title}"?` }))) return
 try {
 const { deleteSupabaseActivity } = await import('@/lib/supabaseClient')
 await deleteSupabaseActivity(item.id, 'rubrics_and_answer_keys')
 } catch {}

 const updated = rubrics.filter(r => r.id !== item.id)
 setRubrics(updated)
 localStorage.setItem('teacher_rubrics', JSON.stringify(updated))
 window.dispatchEvent(new Event('storage'))
 }

 /* Carregar dados */
 useEffect(() => {
 const load = () => {
 const sc = localStorage.getItem('teacher_schools')
 const cl = localStorage.getItem('teacher_classes')
 if (sc) setSchools(JSON.parse(sc))
 if (cl) setClasses(JSON.parse(cl))
 const qList = getStoredQuestions()
 setQuestions(qList as any)
 }
 load()
 window.addEventListener('storage', load)
 return () => window.removeEventListener('storage', load)
 }, [])

 function saveQs(upd: Question[]) {
 setQuestions(upd)
 saveStoredQuestions(upd as any)
 }

 /* Filtros */
 const subjects = useMemo(() => [...new Set(questions.map(q => q.subject))], [questions])
 const filtered = useMemo(() => {
 return questions.filter(q => {
 const qKind = q.activityKind || 'question'
 if (fKind !== 'all' && qKind !== fKind) return false
 if (fSchool !== 'all' && q.schoolId !== fSchool) return false
 if (fClass !== 'all' && q.classRef !== fClass && !q.tags?.includes(fClass)) return false
 if (fYear !== 'all' && q.year !== fYear) return false
 if (fSubject !== 'all' && q.subject !== fSubject) return false
 if (fType !== 'all' && q.type !== fType) return false
 if (fLevel !== 'all' && q.level !== fLevel) return false
 if (fText && !q.statement.toLowerCase().includes(fText.toLowerCase()) && !q.topic.toLowerCase().includes(fText.toLowerCase())) return false
 return true
 }).sort((a, b) => b.createdAt - a.createdAt)
 }, [questions, fKind, fSchool, fClass, fYear, fSubject, fType, fLevel, fText])

 /* Adicionar manualmente */
 function addManual() {
 if (!fStatement.trim()) return
 const newQ: Question = {
 id: `q_${Date.now()}`, statement: fStatement, type: fType2,
 activityKind: fKind2,
 options: fType2 === 'mc' ? fOptions : undefined,
 answer: fAnswer, explanation: fExplanation,
 subject: fSubject2, topic: fTopic,
 eltCategory: fEltCat, eltSubcategory: fEltSubcat,
 bnccCode: fBnccCode.trim().toUpperCase(), level: fLevel2,
 year: fYear2, schoolId: fSchool2 || '', classRef: fClass2,
 tags: fTags.split(',').map(t => t.trim()).filter(Boolean),
 createdAt: Date.now(), source: 'manual',
 }
 saveQs([newQ, ...questions])
 resetForm()
 setModal(null)
 }

 function resetForm() {
 setFStatement(''); setFType2('mc'); setFKind2('exercise'); setFOptions(['', '', '', ''])
 setFAnswer(''); setFExplanation(''); setFSubject2('Inglês'); setFTopic('')
 setFLevel2('B1'); setFYear2('2025'); setFSchool2(''); setFClass2(''); setFTags('')
 }

async function callApiDirect(api: { provider: string; key?: string; model?: string }, prompt: string): Promise<string> {
 if (!api.key) throw new Error(`Chave de API não configurada para ${api.provider}.`)
 if (api.provider === 'anthropic') {
 const r = await fetch('https://api.anthropic.com/v1/messages', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'x-api-key': api.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
 body: JSON.stringify({ model: api.model || 'claude-3-5-sonnet-20241022', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] })
 })
 const d = await r.json()
 if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
 return d.content?.map((c: { text: string }) => c.text).join('\n') || ''
 }
 if (api.provider === 'openai' || api.provider === 'deepseek') {
 const baseUrl = api.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
 const r = await fetch(baseUrl, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` },
 body: JSON.stringify({ model: api.model || (api.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'), messages: [{ role: 'user', content: prompt }], max_tokens: 4096 })
 })
 const d = await r.json()
 if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
 return d.choices?.[0]?.message?.content || ''
 }
 if (api.provider === 'gemini') {
 const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${api.model || 'gemini-1.5-flash'}:generateContent?key=${api.key}`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
 })
 const d = await r.json()
 if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
 return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
 }
 throw new Error('Provedor não suportado para chamada direta.')
}

function parseJsonFromAI(text: string): Array<{ statement: string; options?: string[]; answer?: string; explanation?: string }> {
 if (!text || !text.trim()) {
 throw new Error('A IA não retornou nenhuma resposta.')
 }

 let cleaned = text.trim()
 .replace(/^```json\s*/gi, '')
 .replace(/^```\s*/gi, '')
 .replace(/\s*```$/gi, '')
 .trim()

 try {
 const parsed = JSON.parse(cleaned)
 return Array.isArray(parsed) ? parsed : [parsed]
 } catch {
 // Continue to substring extraction
 }

 const startIdx = cleaned.indexOf('[')
 const endIdx = cleaned.lastIndexOf(']')

 if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
 const candidate = cleaned.slice(startIdx, endIdx + 1)
 try {
 const parsed = JSON.parse(candidate)
 return Array.isArray(parsed) ? parsed : [parsed]
 } catch {
 try {
 const sanitized = candidate
 .replace(/,\s*([\]}])/g, '$1')
 .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
 const parsed = JSON.parse(sanitized)
 return Array.isArray(parsed) ? parsed : [parsed]
 } catch {
 throw new Error('A resposta da IA não pôde ser convertida em formato JSON.')
 }
 }
 }

 const objStart = cleaned.indexOf('{')
 const objEnd = cleaned.lastIndexOf('}')

 if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
 const candidate = cleaned.slice(objStart, objEnd + 1)
 try {
 const parsed = JSON.parse(candidate)
 return [parsed]
 } catch {
 throw new Error('A resposta da IA continha um objeto malformado.')
 }
 }

 throw new Error('IA não retornou um formato JSON válido. Tente novamente.')
}

 /* Gerar com IA */
 async function generateWithAI() {
 const api = getActiveApi()
 if (!api) { toast.success('Configure uma API ativa em APIs & Modelos.'); return }
 if (!aiTopic.trim()) { toast.success('Informe o tópico ou assunto.'); return }

 setIsGen(true)
 try {
 const prompt = `Você é um gerador automatizado de atividades e questões pedagógicas. Sua resposta DEVE ser EXCLUSIVAMENTE um JSON VÁLIDO sem markdown, sem cumprimentos e sem explicações fora do JSON.

Gere exatamente ${aiCount} itens de ${KIND_LABELS[aiKind].label} (${aiType === 'mc' ? 'múltipla escolha' : aiType === 'essay' ? 'dissertativa' : aiType === 'tf' ? 'verdadeiro ou falso' : 'preencher lacuna'}) sobre "${aiTopic}" para a disciplina ${aiSubject}, nível ${aiLevel}, ano letivo ${aiYear}.

FORMATO OBRIGATÓRIO (retorne SOMENTE este array JSON):
[
 {
 "statement": "Enunciado ou texto da atividade",
 "options": ["A) opção 1", "B) opção 2", "C) opção 3", "D) opção 4"],
 "answer": "A",
 "explanation": "Comentário pedagógico ou resolução"
 }
]

Para questões dissertativas ou V/F, omita "options". Para V/F, o "answer" deve ser "Verdadeiro" ou "Falso". Retorne APENAS o JSON puro.`

 let rawText = ''

 if (api.key && api.provider !== 'manual') {
 try {
 rawText = await callApiDirect(api, prompt)
 } catch (err) {
 console.warn('Chamada direta de API falhou, tentando /api/agent:', err)
 }
 }

 if (!rawText) {
 const res = await fetch('/api/agent', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 messages: [{ role: 'user', content: prompt }],
 context: '', provider: api.provider, userKey: api.key, model: api.model,
 }),
 })
 const data = await res.json()
 if (data.error) throw new Error(data.error)
 rawText = data.content?.find((c: { type: string; text?: string }) => c.type === 'text')?.text || ''
 if (!rawText && Array.isArray(data.content) && data.content[0]?.text) {
 rawText = data.content[0].text
 }
 }

 const parsed = parseJsonFromAI(rawText)

 const newQs: Question[] = parsed.map((item, i) => ({
 id: `q_ai_${Date.now()}_${i}`,
 statement: item.statement || `Questão ${i + 1} sobre ${aiTopic}`,
 type: aiType,
 activityKind: aiKind,
 options: item.options,
 answer: item.answer,
 explanation: item.explanation,
 subject: aiSubject,
 topic: aiTopic,
 level: aiLevel,
 year: aiYear,
 schoolId: aiSchool || '',
 classRef: '',
 tags: [aiTopic.toLowerCase()],
 createdAt: Date.now() + i,
 source: 'ai',
 }))

 saveQs([...newQs, ...questions])
 setModal(null)
 } catch (e) {
 toast.success(`Erro ao gerar: ${e instanceof Error ? e.message : 'desconhecido'}`)
 } finally { setIsGen(false) }
 }

 function openExtractModal() {
    try {
      const raw = localStorage.getItem('teacher_repo') || localStorage.getItem('teacher_repository') || '[]'
      const items = JSON.parse(raw)
      if (!items.length) {
        toast.success('Nenhum livro encontrado na Biblioteca. Acesse o módulo "Biblioteca Digital" e adicione seus livros/materiais em PDF.')
        return
      }
      setExtractBooks(items)
      setSelectedExtractBookId(String(items[0].id))
      const questionsExt = extractQuestionsFromBookText(items[0].title, items[0].content || '', items[0].category)
      setExtractedList(questionsExt.map(q => ({ ...q, selected: true })))
      setShowExtractModal(true)
    } catch {
      toast.success('Erro ao carregar livros da biblioteca.')
    }
  }

  function handleSelectBookForExtraction(bookId: string) {
    setSelectedExtractBookId(bookId)
    const book = extractBooks.find(b => String(b.id) === String(bookId))
    if (book) {
      const questionsExt = extractQuestionsFromBookText(book.title, book.content || '', book.category)
      setExtractedList(questionsExt.map(q => ({ ...q, selected: true })))
    } else {
      setExtractedList([])
    }
  }

  function handleSaveExtractedQuestions() {
    const toSave = extractedList.filter(q => q.selected).map(({ selected, ...q }) => q)
    if (toSave.length === 0) {
      toast.success('Selecione ao menos um exercício para importar.')
      return
    }
    const updated = [...(toSave as any), ...questions]
    saveQs(updated)
    setShowExtractModal(false)
    toast.success(`✨ ${toSave.length} exercício(s) extraído(s) da biblioteca e importado(s) com sucesso para o Banco!`)
  }

  async function deleteQ(id: string) {
    if (!(await showConfirm({ message: 'Excluir esta questão?' }))) return
    saveQs(questions.filter(q => q.id !== id))
    if (selectedQ?.id === id) setSelectedQ(null)
  }

  const typeColor: Record<QuestionType, string> = { mc: '#268bd2', essay: '#d33682', tf: '#859900', fill: '#b58900' }
  const schoolOf = (id: string) => schools.find(s => s.id === id)

  /* Render */
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(139,115,85,0.12)' }}>
        <div>
          <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', 'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 700, color: '#2c1a0e', margin: '0 auto'  }}>
            Banco de Atividades
          </h1>
          <p style={{ color: '#a08060', fontSize: 14, marginTop: 4, margin: 0 }}>
            Acervo central de aulas, provas, exercícios, rubricas e gabaritos integrados e auto-sincronizados.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowAnalyticsModal(true)} style={{ ...S.btn, background: '#2563eb', color: '#fffcf8' }}>
            <i className="ti ti-chart-bar" /> Analytics Cross-Turma
          </button>
          <button onClick={openExtractModal} style={{ ...S.btn, background: '#27ae60', color: '#fffcf8' }}>
            <i className="ti ti-book" /> Extrair Exercícios de Livro (RAG)
          </button>
          <button onClick={() => setModal('ai')} style={{ ...S.btn, background: '#d4944a', color: '#fffcf8' }}>
            <i className="ti ti-sparkles" /> Gerar com IA
          </button>
          <button onClick={() => setModal('add')} style={{ ...S.btn, background: '#8b5e3c', color: '#fffcf8' }}>
            <i className="ti ti-plus" /> Adicionar Atividade
          </button>
        </div>
      </div>

 {/* ABAS DE CATEGORIA DE ATIVIDADE (MESMA PALETA DE CORES PAPER & INK) */}
 <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
 {[
 { key: 'all', label: ' Todas as Atividades', count: questions.length + rubrics.length },
 { key: 'lesson', label: ' Aulas Criadas', count: questions.filter(q => q.activityKind === 'lesson').length },
 { key: 'exercise', label: ' Exercícios Salvos', count: questions.filter(q => (q.activityKind || 'exercise') === 'exercise').length },
 { key: 'exam', label: ' Provas Salvas', count: questions.filter(q => q.activityKind === 'exam').length },
 { key: 'question', label: ' Questões Isoladas', count: questions.filter(q => q.activityKind === 'question').length },
 { key: 'rubric_key', label: ' Rubricas & Gabaritos', count: rubrics.length },
 ].map(tab => {
 const isActive = fKind === (tab.key as any)
 return (
 <button
 key={tab.key}
 onClick={() => setFKind(tab.key as any)}
 style={{
 display: 'flex', alignItems: 'center', gap: 8,
 padding: '10px 18px', borderRadius: RADIUS.lg, border: 'none',
 background: isActive ? '#8b5e3c' : '#f5efe6',
 color: isActive ? '#fffcf8' : '#7a5c42',
 fontWeight: isActive ? 700 : 500,
 fontSize: 13, cursor: 'pointer',
 boxShadow: isActive ? '0 2px 8px rgba(139,94,60,0.25)' : 'none',
 transition: 'all 0.15s ease',
 }}
 >
 {tab.label}
 <span style={{
 background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(139,115,85,0.15)',
 padding: '2px 8px', borderRadius: RADIUS.md, fontSize: 11
 }}>
 {tab.count}
 </span>
 </button>
 )
 })}
 </div>

  {/* GATILHO DE PRONTIDÃO PSICOMÉTRICA (CAT / E.1 / E.2) */}
  <div style={{ marginBottom: 20 }}>
    <CatReadinessCard />
  </div>

 {/* EXIBIÇÃO DA ABA EXCLUSIVA DE RUBRICAS & GABARITOS */}
 {fKind === ('rubric_key' as any) ? (
 <div>
 {rubrics.length === 0 ? (
 <div style={{ ...S.card, padding: 40, textAlign: 'center' }}>
 <i className="ti ti-table" style={{ fontSize: 48, color: '#a08060', opacity: 0.5, marginBottom: 12 }} />
 <h3 style={{ margin: 0, color: '#2c1a0e', fontSize: 16 }}>Nenhuma Rubrica ou Gabarito Salvo</h3>
 <p style={{ color: '#a08060', fontSize: 13, marginTop: 4 }}>
 Gere uma Rubrica Pedagógica no módulo de Rubricas e clique em <strong>"Salvar Rubrica no Supabase"</strong> para armazená-la no seu acervo.
 </p>
 </div>
 ) : (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
 {rubrics.map(item => (
 <div key={item.id} style={{ ...S.card, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
 <div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
 <span style={{ padding: '4px 10px', borderRadius: RADIUS.lg, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: 'rgba(139,94,60,0.12)', color: '#8b5e3c' }}>
 {item.type === 'answer_key' ? ' Gabarito Comentado' : ' Rubrica Pedagógica'}
 </span>
 <span style={{ fontSize: 11, color: '#a08060' }}>
 {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Auto-Sync'}
 </span>
 </div>

 <h4 style={{ fontSize: 15, fontWeight: 700, color: '#2c1a0e', margin: '0 0 8px 0', lineHeight: 1.3 }}>
 {item.title}
 </h4>

 <div style={{ fontSize: 12, color: '#7a5c42', marginBottom: 14 }}>
 Nível / Ano: <strong>{item.grade || 'CEFR'}</strong>
 </div>
 </div>

 <div style={{ display: 'flex', gap: 8, borderTop: '1px solid rgba(139,115,85,0.12)', paddingTop: 12 }}>
 <button
 onClick={() => setPreviewRubric(item)}
 style={{ ...S.btn, flex: 1, background: '#8b5e3c', color: '#fff', justifyContent: 'center', fontSize: 12 }}
 >
 <i className="ti ti-eye" /> Visualizar
 </button>
 <button
 onClick={() => {
 navigator.clipboard.writeText(item.content)
 toast.success(' Rubrica copiada para a área de transferência!')
 }}
 style={{ ...S.btn, background: '#f5efe6', color: '#7a5c42', padding: '8px 12px' }}
 title="Copiar texto"
 >
 <i className="ti ti-copy" />
 </button>
 <button
 onClick={() => handleDeleteRubric(item)}
 style={{ ...S.btn, background: 'rgba(220,50,47,0.1)', color: '#dc322f', padding: '8px 12px' }}
 title="Excluir"
 >
 <i className="ti ti-trash" />
 </button>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* Modal de Pré-visualização da Rubrica / Gabarito */}
 {previewRubric && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
 <div ref={previewRubricModalRef} role="dialog" aria-modal="true" aria-label={`Pré-visualização da rubrica ${previewRubric.title}`} style={{ ...S.card, width: '100%', maxWidth: 840, maxHeight: '90vh', padding: 24, display: 'flex', flexDirection: 'column' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
 <div>
 <h3 style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', margin: 0 }}>{previewRubric.title}</h3>
 <div style={{ fontSize: 12, color: '#a08060', marginTop: 4 }}>
 Rubrica Pedagógica Sincronizada com Supabase
 </div>
 </div>
 <button onClick={() => setPreviewRubric(null)} style={{ background: '#f5efe6', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', fontSize: 18, color: '#2c1a0e' }}>×</button>
 </div>

 <div style={{ flex: 1, overflowY: 'auto', background: '#fff', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.lg, padding: 20, fontSize: 14, color: '#2c1a0e', lineHeight: 1.6 }}
 dangerouslySetInnerHTML={{ __html: previewRubric.content }}
 />

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
 <button onClick={() => setPreviewRubric(null)} style={{ ...S.btn, background: '#f5efe6', color: '#7a5c42' }}>
 Fechar
 </button>
 <button
 onClick={() => {
 navigator.clipboard.writeText(previewRubric.content)
 toast.success(' Conteúdo copiado!')
 }}
 style={{ ...S.btn, background: '#8b5e3c', color: '#fff' }}
 >
 <i className="ti ti-copy" /> Copiar Conteúdo
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 ) : (
 <>

 {/* Stats rápidos */}
 <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
 {Object.entries(TYPE_LABELS).map(([type, label]) => {
 const count = questions.filter(q => q.type === type).length
 return (
 <div key={type} style={{ ...S.card, flex: 1, minWidth: 120, padding: '14px 18px' }}>
 <div style={{ fontSize: 24, fontWeight: 800, color: typeColor[type as QuestionType] }}>{count}</div>
 <div style={{ fontSize: 12, color: '#a08060' }}>{label}</div>
 </div>
 )
 })}
 <div style={{ ...S.card, flex: 1, minWidth: 120, padding: '14px 18px' }}>
 <div style={{ fontSize: 24, fontWeight: 800, color: '#3d7a4e' }}>{questions.filter(q => q.source === 'ai').length}</div>
 <div style={{ fontSize: 12, color: '#a08060' }}>Geradas por IA</div>
 </div>
 </div>

 {/* Filtros */}
 <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
 <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
 <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a08060' }} />
 <input value={fText} onChange={e => setFText(e.target.value)} placeholder="Buscar no enunciado, aula ou tópico..."
 style={{ ...S.input, paddingLeft: 36 }} />
 </div>
 {([
 ['fSchool', fSchool, setFSchool, 'Escola', [['all','Todas escolas'], ...schools.map(s => [s.id, s.name])]],
 ['fClass', fClass, setFClass, 'Turma', [['all','Todas turmas'], ...classes.map(c => [c.id, c.name])]],
 ['fYear', fYear, setFYear, 'Ano', [['all','Todos anos'], ...YEARS.map(y => [y, y])]],
 ['fSubject', fSubject, setFSubject, 'Disciplina', [['all','Todas'], ...subjects.map(s => [s, s])]],
 ['fType', fType, setFType, 'Formato', [['all','Todos formatos'], ...Object.entries(TYPE_LABELS)]],
 ['fLevel', fLevel, setFLevel, 'Nível', [['all','Todos níveis'], ...LEVELS.map(l => [l, l])]],
 ] as [string, string, (v: string) => void, string, [string, string][]][]).map(([key, val, setter, placeholder, opts]) => (
 <select key={key} value={val} onChange={e => setter(e.target.value)}
 style={{ ...S.input, width: 'auto', minWidth: 130 }}>
 {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
 </select>
 ))}
 </div>

 {/* Layout principal */}
 <div style={{ display: 'flex', gap: 24 }}>
 {/* Lista */}
 <div style={{ flex: 1 }}>
 {filtered.length === 0 ? (
 <div style={{ ...S.card, textAlign: 'center', padding: '60px 40px' }}>
 <i className="ti ti-archive" style={{ fontSize: 48, color: '#c4a882', display: 'block', marginBottom: 12 }} />
 <p style={{ color: '#7a5c42', margin: 0 }}>Nenhuma atividade encontrada nesta categoria. Adicione ou gere com IA!</p>
 </div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
 {filtered.map(q => {
 const sc = schoolOf(q.schoolId)
 const isActive = selectedQ?.id === q.id
 const kindInfo = KIND_LABELS[q.activityKind || 'question']
 return (
 <div key={q.id} onClick={() => setSelectedQ(isActive ? null : q)} style={{
 ...S.card, cursor: 'pointer', padding: '14px 18px',
 borderColor: isActive ? '#8b5e3c' : 'rgba(139,115,85,0.14)',
 background: isActive ? '#f5efe6' : '#fffcf8',
 transition: 'all 0.15s',
 }}>
 <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
 <span style={{ ...S.badge, background: kindInfo.bg, color: kindInfo.color, fontWeight: 700 }}>
 <i className={`ti ${kindInfo.icon}`} style={{ marginRight: 4 }} />
 {kindInfo.label}
 </span>
 <span style={{ ...S.badge, background: typeColor[q.type] + '18', color: typeColor[q.type], fontSize: 10 }}>
 {TYPE_LABELS[q.type]}
 </span>
 </div>
 <div style={{ flex: 1, minWidth: 0 }}>
 <p style={{ margin: 0, fontSize: 14, color: '#2c1a0e', fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
 {q.statement}
 </p>
 <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
 {q.eltCategory && (
 <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42', fontWeight: 700 }}>
 {ELT_TAXONOMY.find(c=>c.id===q.eltCategory)?.name.split(' ')[0] || q.eltCategory} {q.eltSubcategory ? `· ${q.eltSubcategory}` : ''}
 </span>
 )}
 {q.bnccCode && <span style={{ ...S.badge, background: '#e0f2fe', color: '#0369a1' }}> BNCC: {q.bnccCode}</span>}
                    {(q as any).responseHistory && (q as any).responseHistory.length >= 3 && (() => {
                      const stats = calculateItemStats(q as any)
                      return (
                        <>
                          <span className={`text-xs px-2 py-0.5 rounded-full bg-gray-100 font-bold ${stats.classColor}`}
                            title={`Dificuldade Empírica: p=${stats.p.toFixed(2)}${stats.D !== null ? ` | Discriminação D=${stats.D.toFixed(2)}` : ''}`}>
                            {stats.p < 0.35 ? '🔴' : stats.p > 0.75 ? '🟡' : '🟢'} {stats.classification}
                            {stats.D !== null && ` · D=${stats.D > 0 ? '+' : ''}${stats.D.toFixed(2)}`}
                          </span>
                          {stats.divergenceMessage && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-medium"
                              title={stats.divergenceMessage}>
                              ⚠️ Divergência Calibrada
                            </span>
                          )}
                          {stats.discriminationWarning && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 font-medium"
                              title={stats.discriminationWarning}>
                              ⚠️ Revisar Gabarito/Item
                            </span>
                          )}
                        </>
                      )
                    })()}
                    {(q as any).bloomLevel && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-semibold">
                        {({ remember: '👁️', understand: '💡', apply: '🔧', analyze: '🔍', evaluate: '⚖️', create: '✨' } as Record<string, string>)[(q as any).bloomLevel] ?? ''} {(q as any).bloomLevel}
                      </span>
                    )}
                    {(q as any).difficultyLevel && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-semibold">
                        {({ easy: '🟢', medium: '🟡', hard: '🔴', challenge: '⭐' } as Record<string, string>)[(q as any).difficultyLevel] ?? ''} {(q as any).difficultyLevel}
                      </span>
                    )}


 {sc && <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{sc.name}</span>}
 <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{q.year}</span>
 <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{q.subject}</span>
 <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{q.level}</span>
 {q.source === 'ai' && <span style={{ ...S.badge, background: 'rgba(212,148,74,0.18)', color: '#8b5e3c' }}> IA</span>}
 </div>
 </div>
 <button onClick={e => { e.stopPropagation(); deleteQ(q.id) }}
 style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a83232', fontSize: 16, flexShrink: 0 }}>
 <i className="ti ti-trash" />
 </button>
 </div>
 </div>
 )
 })}
 </div>
 )}
 </div>

 {/* Detalhe da questão */}
 {selectedQ && (
 <div style={{ width: 380, flexShrink: 0 }}>
 <div style={{ ...S.card, position: 'sticky', top: 20 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
 <span style={{ ...S.badge, background: typeColor[selectedQ.type] + '20', color: typeColor[selectedQ.type] }}>
 {TYPE_LABELS[selectedQ.type]}
 </span>
 <button onClick={() => setSelectedQ(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#a08060' }}>×</button>
 </div>
 <p style={{ fontSize: 14, color: '#2c1a0e', lineHeight: 1.6, marginBottom: 16 }}>{selectedQ.statement}</p>

 {selectedQ.options?.map((opt, i) => (
 <div key={i} style={{
 padding: '8px 14px', borderRadius: RADIUS.md, marginBottom: 6,
 background: selectedQ.answer === OPTION_LETTERS[i] ? '#d0f0c0' : '#f5f0e8',
 border: `1px solid ${selectedQ.answer === OPTION_LETTERS[i] ? '#2d7a00' : 'transparent'}`,
 color: '#2c1a0e', fontSize: 13,
 }}>
 <b>{OPTION_LETTERS[i]})</b> {opt}
 </div>
 ))}

 {selectedQ.answer && selectedQ.type !== 'mc' && (
 <div style={{ background: '#d0f0c0', borderRadius: RADIUS.md, padding: '10px 14px', marginBottom: 12 }}>
 <div style={{ fontSize: 11, color: '#2d7a00', fontWeight: 700, marginBottom: 4 }}>GABARITO</div>
 <div style={{ fontSize: 13, color: '#2c1a0e' }}>{selectedQ.answer}</div>
 </div>
 )}

 {selectedQ.explanation && (
 <div style={{ background: '#f0e8d8', borderRadius: RADIUS.md, padding: '10px 14px', marginBottom: 12 }}>
 <div style={{ fontSize: 11, color: '#7a5c42', fontWeight: 700, marginBottom: 4 }}>COMENTÁRIO</div>
 <div style={{ fontSize: 13, color: '#2c1a0e' }}>{selectedQ.explanation}</div>
 </div>
 )}

 {((selectedQ as any).responseHistory && (selectedQ as any).responseHistory.length >= 3) && (() => {
   const stats = calculateItemStats(selectedQ as any)
   return (
     <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, padding: '12px', marginBottom: 12 }}>
       <div style={{ fontSize: 11, color: '#475569', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
         <span>📊</span> Calibração Psicométrica Real
       </div>
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, marginBottom: 6 }}>
         <div style={{ background: '#fff', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
           <span style={{ color: '#64748b', fontSize: 10, display: 'block' }}>Índice de Facilidade (p)</span>
           <b style={{ color: '#0f172a' }}>{stats.p.toFixed(2)} ({stats.classification})</b>
         </div>
         <div style={{ background: '#fff', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
           <span style={{ color: '#64748b', fontSize: 10, display: 'block' }}>Discriminação (D)</span>
           <b style={{ color: stats.D !== null && stats.D < 0 ? '#dc2626' : '#0f172a' }}>
             {stats.D !== null ? `${stats.D > 0 ? '+' : ''}${stats.D.toFixed(2)}` : 'N < 6'}
           </b>
         </div>
       </div>
       {stats.divergenceMessage && (
         <div style={{ fontSize: 11.5, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '6px 8px', borderRadius: 6, marginTop: 4, lineHeight: 1.4 }}>
           {stats.divergenceMessage}
         </div>
       )}
       {stats.discriminationWarning && (
         <div style={{ fontSize: 11.5, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', padding: '6px 8px', borderRadius: 6, marginTop: 4, lineHeight: 1.4 }}>
           {stats.discriminationWarning}
         </div>
       )}
     </div>
   )
 })()}

 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
 {selectedQ.tags.map(t => <span key={t} style={{ ...S.badge, background: '#f0e8d8', color: '#7a5c42' }}>{t}</span>)}
 </div>
 </div>
 </div>
 )}
 </div>
 </>
 )}

 {/* Modal: Adicionar Manualmente */}
 {modal === 'add' && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, overflowY: 'auto' }}>
 <div ref={addModalRef} role="dialog" aria-modal="true" aria-label="Nova Atividade Pedagógica" style={{ ...S.card, width: 580, maxWidth: '95vw', marginBottom: 40 }}>
 <h2 style={{ fontFamily: "'Fraunces', 'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 700, color: '#2c1a0e', margin: '0 0 20px' }}>Nova Atividade Pedagógica</h2>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div>
 <label style={S.label}>Tipo de Atividade *</label>
 <select style={S.input} value={fKind2} onChange={e => setFKind2(e.target.value as ActivityKind)}>
 <option value="exercise"> Lista de Exercícios / Treino</option>
 <option value="lesson"> Aula Criada (Plano de Aula / Exposição)</option>
 <option value="exam"> Prova & Gabarito Oficial</option>
 <option value="question"> Questão Isolada</option>
 </select>
 </div>
 <div>
 <label style={S.label}>Título / Enunciado *</label>
 <textarea value={fStatement} onChange={e => setFStatement(e.target.value)}
 placeholder="Digite o título da aula, enunciado do exercício ou instrução da prova..."
 style={{ ...S.input, resize: 'vertical', minHeight: 90 } as React.CSSProperties} />
 </div>
 <div style={{ display: 'flex', gap: 12 }}>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Formato de Resposta</label>
 <select style={S.input} value={fType2} onChange={e => setFType2(e.target.value as QuestionType)}>
 {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
 </select>
 </div>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Nível</label>
 <select style={S.input} value={fLevel2} onChange={e => setFLevel2(e.target.value)}>
 {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
 </select>
 </div>
 </div>
 {fType2 === 'mc' && (
 <div>
 <label style={S.label}>Alternativas</label>
 {fOptions.map((opt, i) => (
 <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
 <span style={{ fontWeight: 700, color: '#268bd2', minWidth: 20 }}>{OPTION_LETTERS[i]})</span>
 <input style={{ ...S.input }} value={opt} onChange={e => { const n = [...fOptions]; n[i] = e.target.value; setFOptions(n) }} placeholder={`Alternativa ${OPTION_LETTERS[i]}`} />
 </div>
 ))}
 </div>
 )}
 <div>
 <label style={S.label}>Gabarito</label>
 <input style={S.input} value={fAnswer} onChange={e => setFAnswer(e.target.value)} placeholder={fType2 === 'mc' ? 'A, B, C ou D' : 'Resposta esperada...'} />
 </div>
 <div>
 <label style={S.label}>Comentário / Explicação</label>
 <textarea value={fExplanation} onChange={e => setFExplanation(e.target.value)}
 placeholder="Explicação da resposta..." style={{ ...S.input, resize: 'vertical', minHeight: 60 } as React.CSSProperties} />
 </div>
 <div style={{ display: 'flex', gap: 12 }}>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Disciplina</label>
 <input style={S.input} value={fSubject2} onChange={e => setFSubject2(e.target.value)} placeholder="Ex: Inglês" />
 </div>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Tópico</label>
 <input style={S.input} value={fTopic} onChange={e => setFTopic(e.target.value)} placeholder="Ex: Present Perfect" />
 </div>
 </div>
 <div style={{ display: 'flex', gap: 12 }}>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Escola</label>
 <select style={S.input} value={fSchool2} onChange={e => setFSchool2(e.target.value)}>
 <option value="">Sem escola</option>
 {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 </div>
 <div style={{ width: 100 }}>
 <label style={S.label}>Ano Letivo</label>
 <select style={S.input} value={fYear2} onChange={e => setFYear2(e.target.value)}>
 {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
 </select>
 </div>
 </div>
 <div>
 <label style={S.label}>Tags (separadas por vírgula)</label>
 <input style={S.input} value={fTags} onChange={e => setFTags(e.target.value)} placeholder="presente, verbo, reading..." />
 </div>
 </div>
 <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
 <button onClick={() => { resetForm(); setModal(null) }} style={{ ...S.btn, background: '#f0e8d8', color: '#7a5c42' }}>Cancelar</button>
 <button onClick={addManual} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>
 <i className="ti ti-check" /> Salvar Questão
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Modal: Gerar com IA */}
 {modal === 'ai' && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <div ref={aiModalRef} role="dialog" aria-modal="true" aria-label="Gerar Atividades com IA" style={{ ...S.card, width: 480, maxWidth: '95vw' }}>
 <h2 style={{ fontFamily: "'Fraunces', 'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 700, color: '#2c1a0e', margin: '0 0 6px' }}> Gerar Atividades com IA</h2>
 <p style={{ color: '#a08060', fontSize: 13, marginBottom: 20 }}>A IA gera o material pedagógico e armazena automaticamente no seu banco.</p>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div>
 <label style={S.label}>Tipo de Atividade a Criar</label>
 <select style={S.input} value={aiKind} onChange={e => setAiKind(e.target.value as ActivityKind)}>
 <option value="exercise"> Lista de Exercícios / Treino</option>
 <option value="lesson"> Aula Criada (Plano de Aula / Exposição)</option>
 <option value="exam"> Prova & Gabarito Oficial</option>
 <option value="question"> Questões Isoladas</option>
 </select>
 </div>
 <div>
 <label style={S.label}>Tópico / Assunto *</label>
 <input style={S.input} value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="Ex: Present Perfect vs Past Simple, Phrasal Verbs..." />
 </div>
 <div style={{ display: 'flex', gap: 12 }}>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Disciplina</label>
 <input style={S.input} value={aiSubject} onChange={e => setAiSubject(e.target.value)} />
 </div>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Nível</label>
 <select style={S.input} value={aiLevel} onChange={e => setAiLevel(e.target.value)}>
 {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
 </select>
 </div>
 </div>
 <div style={{ display: 'flex', gap: 12 }}>
 <div style={{ flex: 1 }}>
 <label style={S.label}>Formato de Resposta</label>
 <select style={S.input} value={aiType} onChange={e => setAiType(e.target.value as QuestionType)}>
 {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
 </select>
 </div>
 <div style={{ width: 80 }}>
 <label style={S.label}>Qtd</label>
 <input type="number" style={S.input} min={1} max={20} value={aiCount} onChange={e => setAiCount(Number(e.target.value))} />
 </div>
 <div style={{ width: 100 }}>
 <label style={S.label}>Ano Letivo</label>
 <select style={S.input} value={aiYear} onChange={e => setAiYear(e.target.value)}>
 {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
 </select>
 </div>
 </div>
 <div>
 <label style={S.label}>Escola (opcional)</label>
 <select style={S.input} value={aiSchool} onChange={e => setAiSchool(e.target.value)}>
 <option value="">Sem escola específica</option>
 {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 </div>
 </div>
 <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
 <button onClick={() => setModal(null)} style={{ ...S.btn, background: '#f5efe6', color: '#7a5c42' }}>Cancelar</button>
 <button onClick={generateWithAI} disabled={isGen || !aiTopic.trim()} style={{ ...S.btn, background: '#d4944a', color: '#fffcf8', opacity: isGen || !aiTopic.trim() ? 0.6 : 1 }}>
 {isGen ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Criando...</> : <><i className="ti ti-sparkles" /> Gerar {aiCount} Itens</>}
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Modal: Assistente de Extração Inteligente de Livros / PDF */}
 {showExtractModal && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
 <div ref={extractModalRef} role="dialog" aria-modal="true" aria-label="Assistente de Extração de Exercícios da Biblioteca" style={{ ...S.card, width: 720, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid #ede8dc', paddingBottom: 10 }}>
 <div>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
 📖 Assistente de Extração de Exercícios (Biblioteca)
 </h2>
 <p style={{ color: '#a08060', fontSize: TEXT.bodyCompact, margin: '2px 0 0 0' }}>
 Localize exercícios de livros da sua biblioteca e selecione quais deseja adicionar ao banco.
 </p>
 </div>
 <button onClick={() => setShowExtractModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#a08060', cursor: 'pointer' }}>✕</button>
 </div>

 {/* Seletor de Livro */}
 <div style={{ marginBottom: 14 }}>
 <label style={S.label}>Selecione o Livro / Material Didático</label>
 <select
 style={S.input}
 value={selectedExtractBookId}
 onChange={e => handleSelectBookForExtraction(e.target.value)}
 >
 {extractBooks.map(b => (
 <option key={b.id} value={String(b.id)}>
 {b.title} ({b.type || "Student's Book"})
 </option>
 ))}
 </select>
 </div>

 {/* Lista de Exercícios Extraídos com Checkboxes */}
 <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e8decb', borderRadius: RADIUS.md, padding: 12, background: '#faf6f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
 {extractedList.length === 0 ? (
 <div style={{ padding: 24, textAlign: 'center', color: '#a08060', fontSize: 13 }}>
 <i className="ti ti-notes" style={{ fontSize: 28, display: 'block', marginBottom: 6, color: '#d4944a' }} />
 Nenhum exercício formatado foi detectado automaticamente neste material.
 </div>
 ) : (
 extractedList.map((item, idx) => (
 <div
 key={item.id || idx}
 style={{
 background: item.selected ? '#fff' : '#f5efe6',
 border: item.selected ? '1.5px solid #8b5e3c' : '1px solid #d5c0b0',
 borderRadius: RADIUS.md, padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start'
 }}
 >
 <input
 type="checkbox"
 checked={item.selected}
 onChange={e => {
 const updated = [...extractedList]
 updated[idx].selected = e.target.checked
 setExtractedList(updated)
 }}
 style={{ marginTop: 3, cursor: 'pointer' }}
 />
 <div style={{ flex: 1 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
 <span style={{ fontSize: 11, fontWeight: 700, background: '#e8f4fd', color: '#0284c7', padding: '1px 6px', borderRadius: 4 }}>
 {item.type === 'mc' ? 'Múltipla Escolha' : item.type === 'fill' ? 'Preenchimento de Lacunas' : 'Dissertativa'}
 </span>
 <span style={{ fontSize: 11, color: '#a08060' }}>Item #{idx + 1}</span>
 </div>
 <p style={{ margin: '0 0 6px 0', fontSize: TEXT.bodyCompact, color: '#2c1a0e', fontWeight: 600, lineHeight: 1.35 }}>
 {item.statement}
 </p>
 {item.options && item.options.length > 0 && (
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: TEXT.caption, color: '#7a5c42' }}>
 {item.options.map((opt, oIdx) => (
 <div key={oIdx} style={{ background: '#fdf8f2', padding: '2px 6px', borderRadius: 4 }}>
 {opt}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 ))
 )}
 </div>

 {/* Ações do Rodapé do Modal */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px solid #ede8dc' }}>
 <div style={{ display: 'flex', gap: 8 }}>
 <button
 type="button"
 onClick={() => setExtractedList(extractedList.map(q => ({ ...q, selected: true })))}
 style={{ ...S.btn, padding: '6px 12px', fontSize: TEXT.caption, background: '#ede8dc', color: '#2c1a0e' }}
 >
 Marcar Todos
 </button>
 <button
 type="button"
 onClick={() => setExtractedList(extractedList.map(q => ({ ...q, selected: false })))}
 style={{ ...S.btn, padding: '6px 12px', fontSize: TEXT.caption, background: '#ede8dc', color: '#2c1a0e' }}
 >
 Desmarcar Todos
 </button>
 </div>

 <div style={{ display: 'flex', gap: 10 }}>
 <button onClick={() => setShowExtractModal(false)} style={{ ...S.btn, background: '#f5efe6', color: '#7a5c42' }}>
 Cancelar
 </button>
 <button
 onClick={handleSaveExtractedQuestions}
 disabled={!extractedList.some(q => q.selected)}
 style={{ ...S.btn, background: '#27ae60', color: '#fff', opacity: extractedList.some(q => q.selected) ? 1 : 0.5 }}
 >
 <i className="ti ti-download" /> Importar ({extractedList.filter(q => q.selected).length}) para o Banco
 </button>
 </div>
 </div>

 </div>
 </div>
 )}

  {/* Modal de Analytics Cross-Turma do Banco de Questões (Item 15) */}
  {showAnalyticsModal && (() => {
    const summary = analyzeBankCrossTurmas(questions as any)
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fffcf8', borderRadius: RADIUS.xl, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', padding: 28, boxShadow: SHADOW.lg, border: '1px solid rgba(139,115,85,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(139,115,85,0.12)', paddingBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="ti ti-chart-bar" style={{ fontSize: 24, color: '#2563eb' }} />
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', margin: 0 }}>Analytics Psicométrico Cross-Turma</h2>
                <p style={{ fontSize: 12, color: '#a08060', margin: 0 }}>Análise empírica consolidada baseada em TCT (Teoria Clássica dos Testes)</p>
              </div>
            </div>
            <button onClick={() => setShowAnalyticsModal(false)} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7a5c42' }}>✕</button>
          </div>

          {/* Grid de KPIs do Banco */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#fdf8f2', padding: '12px 14px', borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Total / Calibradas</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', marginTop: 4 }}>{summary.totalQuestions} <span style={{ fontSize: 12, color: '#2563eb' }}>({summary.calibratedCount} cal.)</span></div>
            </div>
            <div style={{ background: '#fdf8f2', padding: '12px 14px', borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Taxa Acerto Mediana (p)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', marginTop: 4 }}>{(summary.medianPValue * 100).toFixed(0)}%</div>
            </div>
            <div style={{ background: '#fdf8f2', padding: '12px 14px', borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Discriminação Média (D)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: summary.averageDiscrimination >= 0.30 ? '#16a34a' : '#2c1a0e', marginTop: 4 }}>{summary.averageDiscrimination.toFixed(2)}</div>
            </div>
            <div style={{ background: '#fdf8f2', padding: '12px 14px', borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Score de Saúde</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: summary.qualityScore >= 70 ? '#16a34a' : '#d97706', marginTop: 4 }}>{summary.qualityScore}/100</div>
            </div>
          </div>

          {/* Lista de Alertas / Itens Críticos */}
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e', marginBottom: 10 }}>Itens com Anomalias Psicométricas ({summary.issues.length})</h3>
          {summary.issues.length === 0 ? (
            <div style={{ background: '#f0fdf4', padding: 16, borderRadius: RADIUS.md, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
              ✅ Excelente! Nenhuma questão apresentou discriminação negativa ou distratores mortos. O banco está saudável para avaliações somativas e CAT.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summary.issues.map((issue, idx) => (
                <div key={idx} style={{ background: issue.severity === 'high' ? '#fef2f2' : '#fffbeb', border: `1px solid ${issue.severity === 'high' ? '#fecaca' : '#fde68a'}`, borderRadius: RADIUS.md, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: issue.severity === 'high' ? '#dc2626' : '#b45309', textTransform: 'uppercase' }}>
                      {issue.issueType === 'negative_discrimination' ? '⚠️ Discriminação Negativa' : issue.issueType === 'dead_distractor' ? 'ℹ️ Distrator Ineficaz' : '⚠️ Dificuldade Extrema'}
                    </span>
                    <span style={{ fontSize: 11, color: '#7a5c42' }}>ID: {issue.questionId}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>{issue.statement}</div>
                  <div style={{ fontSize: 12, color: '#7a5c42', marginBottom: 4 }}>{issue.message}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563eb' }}>💡 Ação sugerida: {issue.suggestedAction}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowAnalyticsModal(false)} style={{ ...S.btn, background: '#8b5e3c', color: '#fff' }}>Fechar</button>
          </div>
        </div>
      </div>
    )
  })()}

 <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
 </div>
 )
}
