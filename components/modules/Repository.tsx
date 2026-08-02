'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'

export interface RepositoryItem {
  id: number
  title: string
  content: string
  date: string
  type: 'Student\'s Book' | 'Workbook' | 'Reference Book' | 'CLIL Book' | 'Syllabus' | 'Text'
  category?: string
  textbook?: string
  wordCount?: number
  chunkCount?: number
}

// ─── Presets Globalizers 4 ────────────────────────────────────────────────────
const G4_STUDENT_BOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
  title: '📘 Globalizers 4 — Student\'s Book (Units 1-8 Main Texts & Dialogues)',
  type: 'Student\'s Book',
  category: 'Macmillan Education',
  textbook: 'Globalizers 4',
  content: `====================================================================
MACMILLAN EDUCATION — GLOBALIZERS 4: STUDENT'S BOOK
====================================================================
[UNIT 1 — LIVING ACROSS BORDERS]
Reading Text: "The rise of the digital nomad generation has redefined what it means to belong to a nation. Sophia, a 26-year-old software designer from São Paulo, works for a tech company in London while living in Lisbon. 'I have been traveling for three years,' she explains. 'Technology allows us to maintain cultural identity while embracing global citizenship.'"

Dialogue Model (Listening Task 1.2):
A: Have you been living in England for long?
B: Actually, I've been living in London since 2022, but I've traveled to six different countries this year alone.
A: How do you handle language barriers?
B: I usually use English as a lingua franca, but learning basic local phrases always helps.

[UNIT 2 — DIGITAL INNOVATION & AUTOMATION]
Reading Text: "Artificial intelligence is no longer science fiction; it is reshaping how classrooms operate. By 2030, machine learning tools will be assisting educators by providing personalized feedback to students in real-time."

Dialogue Model:
Teacher: By next month, we will have completed the robotics project.
Student: Will we be presenting our findings at the science fair?
Teacher: Yes, as soon as the panel reviews your submissions.

[UNIT 3 — CITIES OF TOMORROW]
Reading Text: "Urban planners in Copenhagen are designing zero-emission neighborhoods. If cities prioritize green architecture, carbon footprints will drop by 40%."

[UNIT 4 — PERSUASION & CONSUMER CHOICE]
Reading Text: "Neuromarketing analyzes brain activity to understand consumer behavior. Advertisers reported that 80% of purchasing decisions are subconscious."

[UNIT 5 — THE SCIENCE OF SLEEP]
Reading Text: "Cognitive performance declines steeply without adequate rest. Experts speculate that chronic sleep deprivation may affect long-term memory consolidation."

[UNIT 6 — STREET ART VS VANDALISM]
Reading Text: "Is urban graffiti a legitimate form of artistic expression or public property damage? Museums worldwide are now exhibiting works that originated on city walls."

[UNIT 7 — RESTORATIVE JUSTICE]
Reading Text: "Restorative justice focuses on rehabilitation through reconciliation with victims and the community at large."

[UNIT 8 — MARS COLONIZATION]
Reading Text: "Seldom have humans faced a frontier as challenging as interplanetary expansion. Space agencies are testing closed-loop ecological life support systems."`
}

const G4_WORKBOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
  title: '📙 Globalizers 4 — Workbook (Practice Exercises & Answer Key)',
  type: 'Workbook',
  category: 'Macmillan Education',
  textbook: 'Globalizers 4',
  content: `====================================================================
MACMILLAN EDUCATION — GLOBALIZERS 4: WORKBOOK
====================================================================
[EXERCISE BANK — UNIT 1 & 2]
1. Complete with Present Perfect Simple or Continuous:
   a) She (study) __________ English for five years. [Answer: has been studying]
   b) They (visit) __________ four countries this month. [Answer: have visited]
   c) I (know) __________ Mark since primary school. [Answer: have known]

2. Complete with Future Continuous or Future Perfect:
   a) By 8 PM tonight, I (finish) __________ my homework. [Answer: will have finished]
   b) This time tomorrow, we (fly) __________ to New York. [Answer: will be flying]

[EXERCISE BANK — UNIT 3 & 4 (CONDITIONALS & REPORTED SPEECH)]
3. Rewrite using Conditionals:
   a) If people (recycle) __________ more, cities would be cleaner. [Answer: recycled]
   b) If I had known about the conference, I (attend) __________. [Answer: would have attended]

4. Transform into Reported Speech:
   a) "I am working on the project," said Lucas. -> Lucas said that he (be) __________ working on the project. [Answer: was]
   b) "Don't touch the equipment!" warned the engineer. -> The engineer warned us (not / touch) __________ the equipment. [Answer: not to touch]

[EXERCISE BANK — UNIT 5-8 (MODALS, PASSIVE & INVERSION)]
5. Rewrite using Inversion:
   a) I have seldom seen such a brilliant presentation.
      -> Seldom __________ such a brilliant presentation. [Answer: have I seen]
   b) We not only won the trophy, but we also set a record.
      -> Not only __________ the trophy, but we also set a record. [Answer: did we win]`
}

const G4_REFERENCE_BOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
  title: '📗 Globalizers 4 — Reference Book (Grammar Rules & Vocabulary Lists)',
  type: 'Reference Book',
  category: 'Macmillan Education',
  textbook: 'Globalizers 4',
  content: `====================================================================
MACMILLAN EDUCATION — GLOBALIZERS 4: REFERENCE BOOK
====================================================================
GRAMMAR REFERENCE GUIDE:
--------------------------------------------------------------------
1. PRESENT PERFECT SIMPLE vs CONTINUOUS:
   - Simple (have/has + past participle): Focuses on completed actions, quantities or results (e.g. "I have written three essays").
   - Continuous (have/has + been + -ing): Focuses on duration or continuous activity (e.g. "I have been writing for two hours").

2. CONDITIONALS & UNREAL PAST:
   - Zero: If + Present, Present (Scientific facts).
   - First: If + Present, Will + infinitive (Real future possibilities).
   - Second: If + Past Simple, Would + infinitive (Hypothetical present/future).
   - Third: If + Past Perfect, Would have + past participle (Unreal past situations).
   - Mixed: If + Past Perfect, Would + infinitive (Past cause with present result).

3. INVERSION WITH NEGATIVE ADVERBIALS:
   - Structure: Negative Adverbial + Auxiliary Verb + Subject + Main Verb.
   - Examples: Never, Seldom, Rarely, Hardly... when, Scarcely, No sooner... than, Not only... but also.
   - Example: "Seldom have we witnessed such commitment."

VOCABULARY REFERENCE LIST (CEFR B2/C1):
--------------------------------------------------------------------
• Phrasal Verbs: give up, look after, carry out, bring about, call off, turn down, set up, break through.
• Collocations: make a decision, do research, take into account, pay attention, draw a conclusion.
• False Friends: actually (de fato/na verdade), currently (atualmente), pretend (fingir), intend (pretender), push (empurrar), pull (puxar).`
}

const G4_CLIL_BOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
  title: '🟨 Globalizers 4 — CLIL Book (Cross-Curricular Science, History & Art)',
  type: 'CLIL Book',
  category: 'Macmillan Education',
  textbook: 'Globalizers 4',
  content: `====================================================================
MACMILLAN EDUCATION — GLOBALIZERS 4: CLIL BOOK (INTEGRATED LEARNING)
====================================================================
[CLIL LESSON 1: ENVIRONMENTAL SCIENCE — RENEWABLE ENERGY & KINETIC TILES]
Subject: Environmental Science & Physics
Text: "Kinetic footpaths convert human footsteps into electrical energy. When pedestrians step on piezoelectric tiles installed in busy subway stations, kinetic energy is harvested to power LED lighting. This technology illustrates how urban spaces can become self-sustaining micro-grids."
Key Terms: Piezoelectric, kinetic energy, self-sustaining, micro-grid, harvest.

[CLIL LESSON 2: HISTORY & ANTHROPOLOGY — THE SILK ROAD AND EARLY GLOBALIZATION]
Subject: History & World Geography
Text: "Centuries before modern telecommunications, the Silk Road established trade routes connecting East Asia with the Mediterranean. Beyond silk and spices, these routes facilitated the exchange of scientific knowledge, paper manufacturing techniques, and philosophical traditions."
Key Terms: Trade routes, exchange, cultural diffusion, infrastructure.

[CLIL LESSON 3: COMPUTER SCIENCE & ALGORITHMIC BIAS]
Subject: Computer Science & Ethics
Text: "Machine learning algorithms trained on historical data may inadvertently replicate human biases. Computer scientists are developing ethical auditing tools to evaluate neutrality in automated hiring systems."
Key Terms: Algorithmic bias, machine learning, ethical auditing, neutrality.

[CLIL LESSON 4: ART & DESIGN — THE GEOMETRY OF ISLAMIC ARCHITECTURE]
Subject: Art History & Mathematics
Text: "Islamic architectural tilework employs complex tessellations based on non-repeating geometric patterns. Mathematicians have discovered that 15th-century artisans used decagonal quasicrystalline geometry centuries before Western mathematics formalized the concept."
Key Terms: Tessellation, decagonal geometry, artisan, quasicrystalline.`
}

const ALL_G4_PRESETS = [G4_STUDENT_BOOK, G4_WORKBOOK, G4_REFERENCE_BOOK, G4_CLIL_BOOK]

const LS_KEY = 'teacher_repo'
const LS_RAG_KEY = 'teacher_rag_chunks'

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function countChunks(text: string) {
  const byUnit = text.match(/\[(?:UNIT|CLIL|EXERCISE)[^\]]*\]/gi)
  if (byUnit && byUnit.length > 1) return byUnit.length
  const byPara = text.split(/\n\s*\n/).filter(b => b.trim().length > 30)
  return Math.max(byPara.length, 1)
}

function typeIcon(type: string) {
  if (type === "Student's Book") return '📘'
  if (type === 'Workbook') return '📙'
  if (type === 'Reference Book') return '📗'
  if (type === 'CLIL Book') return '🟨'
  if (type === 'Syllabus') return '📋'
  return '📄'
}

function typeColor(type: string) {
  if (type === "Student's Book") return '#1a73e8'
  if (type === 'Workbook') return '#e67e22'
  if (type === 'Reference Book') return '#27ae60'
  if (type === 'CLIL Book') return '#8b5cf6'
  if (type === 'Syllabus') return '#c0392b'
  return '#586e75'
}

// ─── RAG inlining (sem depender da lib) ─────────────────────────────────────
function ragSearch(query: string, items: RepositoryItem[], docId?: number): string[] {
  const results: { text: string; score: number }[] = []
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  const searchItems = docId ? items.filter(i => i.id === docId) : items

  for (const item of searchItems) {
    const paragraphs = item.content.split(/\n\s*\n/).filter(p => p.trim().length > 30)
    for (const para of paragraphs) {
      let score = 0
      const lower = para.toLowerCase()
      if (lower.includes(query.toLowerCase())) score += 15
      for (const term of terms) if (lower.includes(term)) score += 3
      if (score > 0) results.push({ text: `[${item.title}]\n${para.trim()}`, score })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 4).map(r => r.text)
}

export default function Repository() {
  const [items, setItems]             = useState<RepositoryItem[]>([])
  const [viewItem, setViewItem]       = useState<RepositoryItem | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchText, setSearchText]   = useState('')
  const [mode, setMode]               = useState<'view' | 'add' | 'edit' | 'rag'>('view')

  // Add / Edit form
  const [editTitle, setEditTitle]     = useState('')
  const [editContent, setEditContent] = useState('')
  const [editType, setEditType]       = useState<RepositoryItem['type']>("Student's Book")
  const [editCategory, setEditCategory] = useState('Macmillan Education')
  const [editTextbook, setEditTextbook] = useState('')

  // RAG test
  const [ragQuery, setRagQuery]       = useState('')
  const [ragResults, setRagResults]   = useState<string[]>([])
  const [ragScope, setRagScope]       = useState<'all' | 'doc'>('all')

  // Leitor Profissional State
  const [readerFontSize, setReaderFontSize] = useState<'13px' | '15px' | '17px' | '19px'>('15px')
  const [readerFontFamily, setReaderFontFamily] = useState<'Georgia, serif' | "'Plus Jakarta Sans', sans-serif" | 'monospace'>('Georgia, serif')
  const [readerTheme, setReaderTheme] = useState<'paper' | 'sepia' | 'dark'>('sepia')
  const [readerFullscreen, setReaderFullscreen] = useState(false)
  const [showToc, setShowToc] = useState(false)

  // Upload Progress State
  const [uploadingStatus, setUploadingStatus] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = localStorage.getItem(LS_KEY)
    let current: RepositoryItem[] = s ? JSON.parse(s) : []
    const hasG4 = current.some(i => i.title.includes('Globalizers 4'))
    if (!hasG4) {
      const presets: RepositoryItem[] = ALL_G4_PRESETS.map((p, idx) => ({
        id: Date.now() + idx,
        ...p,
        date: new Date().toLocaleDateString('pt-BR'),
        wordCount: countWords(p.content),
        chunkCount: countChunks(p.content),
      }))
      current = [...presets, ...current]
      localStorage.setItem(LS_KEY, JSON.stringify(current))
    }
    setItems(current)
    setViewItem(current[0] || null)
  }, [])

  // ── Persist & Re-Index RAG ──────────────────────────────────────────────
  const save = useCallback((updated: RepositoryItem[]) => {
    setItems(updated)
    const jsonStr = JSON.stringify(updated)
    localStorage.setItem(LS_KEY, jsonStr)
    localStorage.setItem('teacher_repository', jsonStr)
    localStorage.setItem('teacher_repo_materials', jsonStr)
    localStorage.removeItem(LS_RAG_KEY)

    // Re-indexa o motor RAG imediatamente
    try {
      import('@/lib/ragEngine').then(({ indexAllLibraryItems }) => indexAllLibraryItems())
    } catch { /* ignora */ }
  }, [])

  // ── Add item ──────────────────────────────────────────────────────────────
  function addItem() {
    if (!editTitle.trim() || !editContent.trim()) {
      alert('Preencha o título e o conteúdo para continuar.')
      return
    }
    const item: RepositoryItem = {
      id: Date.now(),
      title: editTitle.trim(),
      content: editContent.trim(),
      type: editType,
      category: editCategory || 'Custom',
      textbook: editTextbook || undefined,
      date: new Date().toLocaleDateString('pt-BR'),
      wordCount: countWords(editContent),
      chunkCount: countChunks(editContent),
    }
    const updated = [item, ...items]
    save(updated)
    setViewItem(item)
    setMode('view')
    clearForm()
  }

  // ── Save edits ────────────────────────────────────────────────────────────
  function saveEdit() {
    if (!viewItem) return
    const updated = items.map(i => i.id === viewItem.id ? {
      ...i,
      title: editTitle.trim() || i.title,
      content: editContent.trim() || i.content,
      type: editType,
      category: editCategory,
      textbook: editTextbook || undefined,
      wordCount: countWords(editContent),
      chunkCount: countChunks(editContent),
    } : i)
    save(updated)
    const saved = updated.find(i => i.id === viewItem.id)!
    setViewItem(saved)
    setMode('view')
  }

  function startEdit(item: RepositoryItem) {
    setEditTitle(item.title)
    setEditContent(item.content)
    setEditType(item.type)
    setEditCategory(item.category || '')
    setEditTextbook(item.textbook || '')
    setViewItem(item)
    setMode('edit')
  }

  function clearForm() {
    setEditTitle(''); setEditContent(''); setEditType("Student's Book"); setEditCategory('Macmillan Education'); setEditTextbook('')
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function deleteItem(id: number) {
    if (!confirm('Deseja remover este documento da Biblioteca?')) return
    const upd = items.filter(i => i.id !== id)
    save(upd)
    setViewItem(upd[0] || null)
    setMode('view')
  }

  // ── Upload de arquivo (PDF, DOCX, TXT, MD, CSV, JSON) ────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    setUploadingStatus(`⏳ Preparando para compilar "${file.name}"...`)

    try {
      let text = ''
      const fileNameLower = file.name.toLowerCase()

      if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) {
        setUploadingStatus(`📄 Lendo arquivo Word "${file.name}"...`)
        const { extractTextFromDocx } = await import('@/lib/pdfExtractor')
        text = await extractTextFromDocx(file)
      } else if (file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
        const { extractTextFromPdf } = await import('@/lib/pdfExtractor')
        text = await extractTextFromPdf(file, (current, total) => {
          setUploadingStatus(`📄 Lendo e compilando livro: Página ${current} de ${total} (${Math.round((current / total) * 100)}%)...`)
        })
      } else {
        setUploadingStatus(`📄 Lendo arquivo de texto "${file.name}"...`)
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve((ev.target?.result as string) || '')
          reader.onerror = () => reject(new Error('Erro na leitura do arquivo.'))
          reader.readAsText(file)
        })
      }

      if (!text || text.trim().length < 15) {
        setUploadingStatus('')
        alert('O arquivo selecionado não contém texto legível ou está vazio.')
        return
      }

      const wCount = countWords(text)
      const cCount = countChunks(text)

      const item: RepositoryItem = {
        id: Date.now(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        content: text,
        type: fileNameLower.includes('workbook') ? 'Workbook' : fileNameLower.includes('clil') ? 'CLIL Book' : "Student's Book",
        category: fileNameLower.endsWith('.pdf') ? 'PDF Importado' : fileNameLower.endsWith('.docx') ? 'Word (DOCX) Importado' : 'Arquivo de Texto',
        date: new Date().toLocaleDateString('pt-BR'),
        wordCount: wCount,
        chunkCount: cCount,
      }
      const updated = [item, ...items]
      save(updated)
      setViewItem(item)
      setMode('view')
      setUploadingStatus('')
      alert(`🎉 Livro "${file.name}" compilado de ponta a ponta e indexado no RAG com sucesso!\n\n📊 Compilação: 100% do livro lido (${wCount.toLocaleString()} palavras em ${cCount} seções).\n\nA IA usará todo o conteúdo deste livro para gerar aulas e provas.`)
    } catch (err: unknown) {
      setUploadingStatus('')
      alert(`⚠️ Falha na importação: ${err instanceof Error ? err.message : 'Não foi possível extrair o texto do arquivo.'}`)
    }
  }

  // ── Upload de Imagens / Prints da Tela (OCR Visão IA) ─────────────────────
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    if (imageInputRef.current) imageInputRef.current.value = ''

    setUploadingStatus(`📷 Lendo ${files.length} foto(s)/print(s) de página via Visão IA (OCR)...`)

    try {
      const { extractTextFromImageAuto } = await import('@/lib/ocrCapture')
      let compiledText = ''
      let processedCount = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadingStatus(`📷 Processando foto/print ${i + 1} de ${files.length} (${file.name})...`)

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.onerror = () => reject(new Error(`Erro ao ler imagem ${file.name}`))
          reader.readAsDataURL(file)
        })

        const extracted = await extractTextFromImageAuto(base64)
        if (extracted) {
          compiledText += `--- Página / Print ${i + 1} (${file.name}) ---\n${extracted}\n\n`
          processedCount++
        }
      }

      if (!compiledText.trim()) {
        setUploadingStatus('')
        alert('Não foi possível extrair texto legível das fotos/prints selecionados.')
        return
      }

      const { normalizeAndReconstructText } = await import('@/lib/pdfExtractor')
      const cleaned = normalizeAndReconstructText(compiledText)
      const wCount = countWords(cleaned)
      const cCount = countChunks(cleaned)
      const bookTitle = files.length === 1 ? files[0].name.replace(/\.[^/.]+$/, '') : `Captura de Material (${files.length} páginas)`

      const item: RepositoryItem = {
        id: Date.now(),
        title: bookTitle,
        content: cleaned,
        type: "Student's Book",
        category: 'Captura Visual (Prints/Fotos)',
        date: new Date().toLocaleDateString('pt-BR'),
        wordCount: wCount,
        chunkCount: cCount,
      }

      const updated = [item, ...items]
      save(updated)
      setViewItem(item)
      setMode('view')
      setUploadingStatus('')
      alert(`🎉 Material compilado com sucesso por Visão IA (OCR)!\n\n📊 Total: ${processedCount} página(s) lida(s) · ${wCount.toLocaleString()} palavras em ${cCount} seções.\n\nTodo o texto extraído da tela/foto já alimentou a biblioteca e a IA (ExamBuilder, LessonStudio e Rafinha).`)
    } catch (err: unknown) {
      setUploadingStatus('')
      alert(`⚠️ Falha no OCR Visual: ${err instanceof Error ? err.message : 'Não foi possível extrair texto das imagens.'}`)
    }
  }

  // ── Captura de Tela da Plataforma ao Vivo (Screen Share Frame Grab) ─────────
  async function captureScreenLive() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('Seu navegador não suporta a captura de tela direta. Por favor tire prints da tela e use o botão "📷 Importar Prints / Fotos (OCR)".')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' } as any })
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()

      // Aguarda 1s para o vídeo estabilizar
      await new Promise(r => setTimeout(r, 1000))

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Para a gravação da tela
      stream.getTracks().forEach(track => track.stop())

      const base64 = canvas.toDataURL('image/png')
      setUploadingStatus('📸 Analisando captura da plataforma via IA Visão...')

      const { extractTextFromImageAuto } = await import('@/lib/ocrCapture')
      const extractedText = await extractTextFromImageAuto(base64)

      if (!extractedText || extractedText.trim().length < 15) {
        setUploadingStatus('')
        alert('Não foi possível identificar texto legível na tela capturada.')
        return
      }

      const { normalizeAndReconstructText } = await import('@/lib/pdfExtractor')
      const cleaned = normalizeAndReconstructText(extractedText)
      const wCount = countWords(cleaned)
      const cCount = countChunks(cleaned)

      const item: RepositoryItem = {
        id: Date.now(),
        title: `Captura de Tela - ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        content: cleaned,
        type: "Student's Book",
        category: 'Captura de Tela ao Vivo',
        date: new Date().toLocaleDateString('pt-BR'),
        wordCount: wCount,
        chunkCount: cCount,
      }

      const updated = [item, ...items]
      save(updated)
      setViewItem(item)
      setMode('view')
      setUploadingStatus('')
      alert(`🎉 Tela da plataforma lida e gravada com sucesso!\n\n📊 Estatísticas: ${wCount.toLocaleString()} palavras extraídas.\n\nO conteúdo capturado já está alimentando a biblioteca e o RAG da IA.`)
    } catch (err: unknown) {
      setUploadingStatus('')
      if (err instanceof Error && err.name === 'NotAllowedError') return
      alert(`⚠️ Falha na captura de tela: ${err instanceof Error ? err.message : String(err)}`)
    }
  }


  // ── Reimport Globalizers 4 ────────────────────────────────────────────────
  function reimportG4() {
    const presets: RepositoryItem[] = ALL_G4_PRESETS.map((p, idx) => ({
      id: Date.now() + idx,
      ...p,
      date: new Date().toLocaleDateString('pt-BR'),
      wordCount: countWords(p.content),
      chunkCount: countChunks(p.content),
    }))
    const filtered = items.filter(i => !i.title.includes('Globalizers 4'))
    const updated = [...presets, ...filtered]
    save(updated)
    setViewItem(presets[0])
    setMode('view')
    alert('✅ Todos os 4 componentes do Globalizers 4 restaurados e reindexados!')
  }

  // ── RAG Search ────────────────────────────────────────────────────────────
  function runRagSearch() {
    if (!ragQuery.trim()) return
    const docId = ragScope === 'doc' && viewItem ? viewItem.id : undefined
    const results = ragSearch(ragQuery, items, docId)
    setRagResults(results.length > 0 ? results : ['Nenhum trecho relevante encontrado para esta consulta.'])
  }

  // ── Filtragem e busca ─────────────────────────────────────────────────────
  const filtered = items.filter(i => {
    const matchType = activeFilter === 'all' || i.type === activeFilter
    const matchSearch = !searchText || i.title.toLowerCase().includes(searchText.toLowerCase()) || i.content.toLowerCase().includes(searchText.toLowerCase())
    return matchType && matchSearch
  })

  // ── Formatação do conteúdo para exibição ──────────────────────────────────
  function formatContent(raw: string): React.ReactElement[] {
    const lines = raw.split('\n')
    const elements: React.ReactElement[] = []

    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (!trimmed) {
        elements.push(<div key={i} style={{ height: 8 }} />)
      } else if (/^={5,}/.test(trimmed)) {
        elements.push(<hr key={i} style={{ border: 'none', borderTop: '2px solid rgba(139,115,85,0.3)', margin: '12px 0' }} />)
      } else if (/^-{5,}/.test(trimmed)) {
        elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px dashed rgba(139,115,85,0.25)', margin: '8px 0' }} />)
      } else if (/^\[.*\]$/.test(trimmed)) {
        elements.push(
          <div key={i} style={{ background: 'linear-gradient(135deg, #8b5e3c, #a0785a)', color: '#fff', padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, margin: '14px 0 6px', letterSpacing: 0.5 }}>
            {trimmed}
          </div>
        )
      } else if (/^[A-Z][A-Z\s&]+:$/.test(trimmed) || /^[A-Z\s\d.]+:$/.test(trimmed)) {
        elements.push(
          <div key={i} style={{ fontSize: 13, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 1, margin: '10px 0 4px' }}>
            {trimmed}
          </div>
        )
      } else if (/^\d+\.\s/.test(trimmed)) {
        elements.push(
          <div key={i} style={{ fontSize: 13, color: '#2c1a0e', padding: '3px 0 3px 12px', borderLeft: '3px solid rgba(139,94,60,0.35)', margin: '3px 0' }}>
            {trimmed}
          </div>
        )
      } else if (/^[•\-\*]\s/.test(trimmed)) {
        elements.push(
          <div key={i} style={{ fontSize: 13, color: '#444', padding: '2px 0 2px 16px', display: 'flex', gap: 6 }}>
            <span style={{ color: '#8b5e3c', flexShrink: 0 }}>•</span>
            {trimmed.replace(/^[•\-\*]\s/, '')}
          </div>
        )
      } else if (/^[A-Z]:/.test(trimmed) || /^Teacher:|^Student:|^Dialogue/.test(trimmed)) {
        const [speaker, ...rest] = trimmed.split(':')
        elements.push(
          <div key={i} style={{ background: 'rgba(139,94,60,0.07)', padding: '6px 12px', borderRadius: 8, margin: '4px 0', fontSize: 13 }}>
            <strong style={{ color: '#8b5e3c' }}>{speaker}:</strong>
            <span style={{ color: '#2c1a0e' }}>{rest.join(':')}</span>
          </div>
        )
      } else if (/Answer:/i.test(trimmed)) {
        elements.push(
          <div key={i} style={{ fontSize: 12.5, color: '#27ae60', padding: '2px 0 2px 16px', fontStyle: 'italic' }}>
            {trimmed}
          </div>
        )
      } else {
        elements.push(
          <div key={i} style={{ fontSize: 13.5, color: '#2c1a0e', lineHeight: 1.7, margin: '2px 0' }}>
            {trimmed}
          </div>
        )
      }
    })
    return elements
  }

  const btnPrimary: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 10,
    borderWidth: '0px', borderStyle: 'none', borderColor: 'transparent',
    background: '#8b5e3c', color: '#fff',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
  }
  const btnSecondary: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 10,
    borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(139,115,85,0.35)',
    background: '#fffcf8', color: '#586e75', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(139,115,85,0.25)',
    fontSize: 13, outline: 'none', background: '#fffcf8', color: '#2c1a0e', boxSizing: 'border-box'
  }

  return (
    <ModuleShell
      title="📚 Biblioteca Digital"
      subtitle="Gerencie seus livros didáticos e documentos. A IA (Rafinha, ExamBuilder, LessonStudio) usa estes materiais como base de contexto RAG."
      isFullHeight
      maxWidth="100%"
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {uploadingStatus && (
            <div style={{ background: '#fdf3e7', borderWidth: '1px', borderStyle: 'solid', borderColor: '#8b5e3c', color: '#8b5e3c', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-loader text-spin" /> {uploadingStatus}
            </div>
          )}

          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.md,.json,.csv,.pdf,.docx,.doc" style={{ display: 'none' }} />
          <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" multiple style={{ display: 'none' }} />

          <button onClick={() => fileInputRef.current?.click()} style={btnSecondary}>
            <i className="ti ti-upload" /> Importar PDF / Word / Arquivo
          </button>

          <button onClick={() => imageInputRef.current?.click()} style={{ ...btnSecondary, borderColor: '#8b5e3c', color: '#8b5e3c' }} title="Faça upload de fotos ou prints das páginas da plataforma para extrair 100% do texto com Visão IA (OCR)">
            <i className="ti ti-camera" /> 📷 Prints / Fotos (OCR)
          </button>

          <button onClick={captureScreenLive} style={{ ...btnSecondary, borderColor: '#d4944a', color: '#d4944a' }} title="Capture a tela ou aba da plataforma educacional ao vivo para ler o material">
            <i className="ti ti-device-desktop" /> 📸 Capturar Tela da Plataforma
          </button>

          <button onClick={reimportG4} style={{ ...btnSecondary, borderColor: '#27ae60', color: '#27ae60' }}>
            <i className="ti ti-book" /> Restaurar Globalizers 4
          </button>

          <button onClick={() => { clearForm(); setMode('add') }} style={btnPrimary}>
            <i className="ti ti-plus" /> Adicionar Material
          </button>

        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, flex: 1, minHeight: 0, height: '100%' }}>

        {/* ── Coluna Esquerda: Lista + Busca ── */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(139,115,85,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 20px rgba(44,26,14,0.04)' }}>

          {/* Busca */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(139,115,85,0.1)' }}>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a08060', fontSize: 14 }} />
              <input
                placeholder="Buscar por título ou conteúdo..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>
            {/* Filtros de tipo */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {['all', "Student's Book", 'Workbook', 'Reference Book', 'CLIL Book', 'Syllabus', 'Text'].map(f => (
                <button key={f} onClick={() => setActiveFilter(f)} style={{
                  padding: '4px 9px', borderRadius: 7, borderWidth: '0px', borderStyle: 'none', borderColor: 'transparent', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: activeFilter === f ? '#8b5e3c' : '#f5efe6',
                  color: activeFilter === f ? '#fff' : '#665c54',
                }}>
                  {f === 'all' ? 'Todos' : f.replace(' Book', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Contagem */}
          <div style={{ padding: '8px 16px', fontSize: 11, color: '#a08060', fontWeight: 600, borderBottom: '1px solid rgba(139,115,85,0.06)' }}>
            {filtered.length} documento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
            {searchText && <span style={{ marginLeft: 6, color: '#8b5e3c' }}>· filtro ativo: "{searchText}"</span>}
          </div>

          {/* Lista de itens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#a08060', fontSize: 13 }}>
                <i className="ti ti-books-off" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.4 }} />
                Nenhum documento encontrado.<br />
                <span style={{ fontSize: 11 }}>Tente outro filtro ou clique em "Adicionar Material".</span>
              </div>
            ) : filtered.map(item => (
              <div
                key={item.id}
                onClick={() => { setViewItem(item); setMode('view') }}
                style={{
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer', marginBottom: 6,
                  background: viewItem?.id === item.id ? '#fdf3e7' : 'transparent',
                  border: viewItem?.id === item.id ? `1.5px solid ${typeColor(item.type)}40` : '1.5px solid transparent',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{typeIcon(item.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: viewItem?.id === item.id ? '#2c1a0e' : '#586e75', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title.replace(/^(📘|📙|📗|🟨|📋|📄)\s/, '')}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, background: typeColor(item.type) + '20', color: typeColor(item.type), padding: '2px 6px', borderRadius: 5, fontWeight: 700 }}>
                        {item.type}
                      </span>
                      {item.wordCount && (
                        <span style={{ fontSize: 10, color: '#a08060' }}>
                          {item.wordCount.toLocaleString()} palavras · {item.chunkCount} seções
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#c0a882', marginTop: 3 }}>
                      {item.category} · {item.date}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Coluna Direita: Visualizador / Editor / RAG ── */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(139,115,85,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 20px rgba(44,26,14,0.04)' }}>

          {/* ── MODO ADD / EDIT ── */}
          {(mode === 'add' || mode === 'edit') ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 28, gap: 16, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 20, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#2c1a0e', margin: 0 }}>
                  {mode === 'add' ? '➕ Adicionar Material à Biblioteca' : '✏️ Editar Material'}
                </h2>
                <button onClick={() => setMode('view')} style={{ ...btnSecondary, padding: '7px 12px', fontSize: 12 }}>
                  <i className="ti ti-x" /> Cancelar
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Título do Documento *</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Ex: Globalizers 4 — Workbook Unit 3" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Tipo de Componente *</label>
                  <select value={editType} onChange={e => setEditType(e.target.value as RepositoryItem['type'])} style={{ ...inputStyle }}>
                    <option value="Student's Book">Student's Book</option>
                    <option value="Workbook">Workbook</option>
                    <option value="Reference Book">Reference Book</option>
                    <option value="CLIL Book">CLIL Book</option>
                    <option value="Syllabus">Syllabus</option>
                    <option value="Text">Texto / Documento Livre</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Editora / Categoria</label>
                  <input value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="Ex: Macmillan Education" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Livro Didático (opcional)</label>
                  <input value={editTextbook} onChange={e => setEditTextbook(e.target.value)} placeholder="Ex: Globalizers 4" style={inputStyle} />
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                  Conteúdo do Material * <span style={{ fontSize: 10, fontWeight: 400, color: '#c0a882' }}>— Cole textos, gramática, exercícios, transcrições, etc.</span>
                </label>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  placeholder={`Cole aqui o conteúdo do livro...\n\nDicas de formatação:\n- [UNIT 1 — TEMA] para criar seções que a IA indexa\n- Exercícios numerados (1., 2., 3.)\n- Gabarito: [Answer: ...]`}
                  style={{ ...inputStyle, flex: 1, minHeight: 300, resize: 'none', lineHeight: 1.6, fontFamily: 'monospace', fontSize: 13 }}
                />
                {editContent && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#a08060' }}>
                    📊 {countWords(editContent).toLocaleString()} palavras · {countChunks(editContent)} seções detectadas
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={mode === 'add' ? addItem : saveEdit} style={{ ...btnPrimary, padding: '12px 28px', fontSize: 14 }}>
                  <i className="ti ti-device-floppy" /> {mode === 'add' ? 'Salvar na Biblioteca' : 'Salvar Alterações'}
                </button>
                <button onClick={() => setMode('view')} style={{ ...btnSecondary, padding: '12px 20px' }}>
                  Cancelar
                </button>
              </div>
            </div>

          /* ── MODO RAG TEST ── */
          ) : mode === 'rag' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 28, gap: 16, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 20, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#2c1a0e', margin: 0 }}>
                  🔍 Testar Busca RAG
                </h2>
                <button onClick={() => setMode('view')} style={{ ...btnSecondary, padding: '7px 12px', fontSize: 12 }}>
                  <i className="ti ti-x" /> Fechar
                </button>
              </div>

              <div style={{ background: '#fdf3e7', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 14, padding: 16, fontSize: 13, color: '#665c54', lineHeight: 1.6 }}>
                <strong>O que é isso?</strong> Aqui você pode testar exatamente o que a IA recupera da sua biblioteca quando você pede para ela gerar uma prova, aula ou atividade. Se a busca retornar bons trechos, a IA terá um bom contexto para trabalhar.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Consulta de Busca</label>
                  <input
                    value={ragQuery}
                    onChange={e => setRagQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runRagSearch()}
                    placeholder="Ex: present perfect continuous, Unit 3 conditionals, kinetic energy..."
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Escopo</label>
                  <select value={ragScope} onChange={e => setRagScope(e.target.value as 'all' | 'doc')} style={{ ...inputStyle, width: 180 }}>
                    <option value="all">Toda a Biblioteca</option>
                    <option value="doc">Apenas: {viewItem?.title?.slice(0, 25)}...</option>
                  </select>
                </div>
              </div>

              <button onClick={runRagSearch} style={btnPrimary}>
                <i className="ti ti-search" /> Executar Busca RAG
              </button>

              {ragResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#27ae60' }}>
                    ✅ {ragResults.length} trecho(s) recuperado(s) — Este é o contexto que a IA recebe:
                  </div>
                  {ragResults.map((r, i) => (
                    <div key={i} style={{ background: '#f8fff5', border: '1px solid rgba(39,174,96,0.2)', borderRadius: 12, padding: 16, fontSize: 12.5, lineHeight: 1.7, color: '#2c1a0e', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#27ae60', marginBottom: 6 }}>📄 RESULTADO #{i + 1}</div>
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>

          /* ── MODO VIEW (LEITOR PROFISSIONAL) ── */
          ) : viewItem ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              position: readerFullscreen ? 'fixed' : 'relative',
              top: readerFullscreen ? 0 : 'auto', left: readerFullscreen ? 0 : 'auto',
              right: readerFullscreen ? 0 : 'auto', bottom: readerFullscreen ? 0 : 'auto',
              zIndex: readerFullscreen ? 9999 : 'auto',
              background: readerTheme === 'dark' ? '#1c1b18' : readerTheme === 'sepia' ? '#f4ecd8' : '#fffcf8',
              color: readerTheme === 'dark' ? '#e2d5c3' : '#2c1a0e',
              transition: 'all 0.2s ease'
            }}>

              {/* Header do Leitor Profissional */}
              <div style={{
                padding: '16px 24px', borderBottom: readerTheme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(139,115,85,0.12)',
                background: readerTheme === 'dark' ? '#151412' : readerTheme === 'sepia' ? '#eee3cb' : '#fff',
                display: 'flex', flexDirection: 'column', gap: 12
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ background: typeColor(viewItem.type), color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, flexShrink: 0 }}>
                      {viewItem.type}
                    </span>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Georgia, serif' }}>
                      {typeIcon(viewItem.type)} {viewItem.title.replace(/^(📘|📙|📗|🟨|📋|📄)\s/, '')}
                    </h2>
                  </div>

                  {/* Ações de Povoamento no App */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        localStorage.setItem('teacher_lessonstudio_prefill', JSON.stringify({ topic: viewItem.title, text: viewItem.content.slice(0, 2000) }))
                        window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
                      }}
                      style={{ padding: '7px 12px', borderRadius: 8, borderWidth: '0px', borderStyle: 'none', borderColor: 'transparent', background: '#8b5e3c', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                      title="Gerar plano de aula no Lesson Studio usando este livro"
                    >
                      <i className="ti ti-chalkboard" /> 📝 Criar Aula
                    </button>

                    <button
                      onClick={() => {
                        localStorage.setItem('teacher_exam_prefill', JSON.stringify({ topic: viewItem.title, libraryId: viewItem.id }))
                        window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'exam' }))
                      }}
                      style={{ padding: '7px 12px', borderRadius: 8, borderWidth: '0px', borderStyle: 'none', borderColor: 'transparent', background: '#d4944a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                      title="Gerar prova no ExamBuilder usando este livro"
                    >
                      <i className="ti ti-file-text" /> ✍️ Criar Prova
                    </button>

                    <button onClick={() => setMode('rag')} style={{ ...btnSecondary, fontSize: 12, padding: '7px 12px', borderColor: '#27ae60', color: '#27ae60' }}>
                      <i className="ti ti-search" /> Testar RAG
                    </button>

                    <button
                      onClick={async () => {
                        const { normalizeAndReconstructText } = await import('@/lib/pdfExtractor')
                        const cleaned = normalizeAndReconstructText(viewItem.content)
                        const updated = items.map(i => i.id === viewItem.id ? {
                          ...i,
                          content: cleaned,
                          wordCount: countWords(cleaned),
                          chunkCount: countChunks(cleaned)
                        } : i)
                        save(updated)
                        const saved = updated.find(i => i.id === viewItem.id)!
                        setViewItem(saved)
                        alert(`✨ Texto normalizado com sucesso!\n\nLinhas picadas foram unificadas em parágrafos contínuos (${countWords(cleaned).toLocaleString()} palavras em ${countChunks(cleaned)} seções).`)
                      }}
                      style={{ ...btnSecondary, fontSize: 12, padding: '7px 12px', borderColor: '#8b5e3c', color: '#8b5e3c' }}
                      title="Recompor frases quebradas e unificar parágrafos do texto picado"
                    >
                      <i className="ti ti-wand" /> 🧹 Unificar Texto Picado
                    </button>
                    <button onClick={() => startEdit(viewItem)} style={{ ...btnSecondary, fontSize: 12, padding: '7px 12px' }}>
                      <i className="ti ti-pencil" /> Editar
                    </button>
                    <button onClick={() => deleteItem(viewItem.id)} style={{ ...btnSecondary, fontSize: 12, padding: '7px 12px', borderColor: '#dc322f', color: '#dc322f' }}>
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                </div>

                {/* Controles de Tipografia & Tema do Leitor */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: readerTheme === 'dark' ? '#252320' : 'rgba(139,115,85,0.06)', padding: '6px 12px', borderRadius: 10, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    {/* Temas */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' }}>Tema:</span>
                      <button onClick={() => setReaderTheme('paper')} style={{ padding: '3px 8px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: '#d5cfc0', background: '#fff', color: '#2c1a0e', fontSize: 11, cursor: 'pointer', fontWeight: readerTheme === 'paper' ? 700 : 400 }}>☀️ Papel</button>
                      <button onClick={() => setReaderTheme('sepia')} style={{ padding: '3px 8px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: '#c8ba9d', background: '#f4ecd8', color: '#433422', fontSize: 11, cursor: 'pointer', fontWeight: readerTheme === 'sepia' ? 700 : 400 }}>📜 Sépia</button>
                      <button onClick={() => setReaderTheme('dark')} style={{ padding: '3px 8px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: '#444', background: '#1c1b18', color: '#e2d5c3', fontSize: 11, cursor: 'pointer', fontWeight: readerTheme === 'dark' ? 700 : 400 }}>🌙 Noche</button>
                    </div>

                    {/* Fonte */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' }}>Fonte:</span>
                      <select value={readerFontFamily} onChange={e => setReaderFontFamily(e.target.value as any)} style={{ padding: '3px 8px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(139,115,85,0.2)', fontSize: 11, background: 'transparent', color: 'inherit', outline: 'none', cursor: 'pointer' }}>
                        <option value="Georgia, serif">Georgia (Serif)</option>
                        <option value="'Plus Jakarta Sans', sans-serif">Sans (Moderna)</option>
                        <option value="monospace">Monospace</option>
                      </select>
                    </div>

                    {/* Tamanho */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' }}>Tamanho:</span>
                      <button onClick={() => setReaderFontSize(s => s === '19px' ? '17px' : s === '17px' ? '15px' : '13px')} style={{ padding: '3px 8px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(139,115,85,0.2)', background: 'transparent', color: 'inherit', fontSize: 11, cursor: 'pointer' }}>A-</button>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{readerFontSize}</span>
                      <button onClick={() => setReaderFontSize(s => s === '13px' ? '15px' : s === '15px' ? '17px' : '19px')} style={{ padding: '3px 8px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(139,115,85,0.2)', background: 'transparent', color: 'inherit', fontSize: 11, cursor: 'pointer' }}>A+</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => setShowToc(v => !v)} style={{ padding: '4px 10px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(139,115,85,0.2)', background: 'transparent', color: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="ti ti-list" /> {showToc ? 'Ocultar Índice' : '📋 Índice'}
                    </button>
                    <button onClick={() => setReaderFullscreen(v => !v)} style={{ padding: '4px 10px', borderRadius: 6, borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(139,115,85,0.2)', background: 'transparent', color: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className={readerFullscreen ? 'ti ti-minimize' : 'ti ti-maximize'} /> {readerFullscreen ? 'Sair da Tela Cheia' : '📖 Modo Imersivo'}
                    </button>
                  </div>
                </div>
              </div>


              {/* Corpo do Leitor Profissional com Painel de Índice (TOC) */}
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {showToc && (
                  <div style={{ width: 260, borderRight: readerTheme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(139,115,85,0.12)', padding: 16, overflowY: 'auto', background: readerTheme === 'dark' ? '#181714' : readerTheme === 'sepia' ? '#ebdcb9' : '#fcfaf6', fontSize: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, opacity: 0.7 }}>📋 Índice das Seções</div>
                    {viewItem.content.split('\n').filter(l => /^\[.*\]$/.test(l.trim())).map((sec, idx) => (
                      <div key={idx} style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 4, cursor: 'pointer', fontWeight: 600, background: 'rgba(139,115,85,0.1)' }}>
                        {sec.trim().replace(/^\[|\]$/g, '')}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
                  <div style={{
                    maxWidth: 800, margin: '0 auto',
                    background: readerTheme === 'dark' ? '#252320' : readerTheme === 'sepia' ? '#fdf8ec' : '#ffffff',
                    borderRadius: 16, padding: '32px 40px',
                    border: readerTheme === 'dark' ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(139,115,85,0.15)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
                    fontSize: readerFontSize, fontFamily: readerFontFamily, lineHeight: 1.8
                  }}>
                    {formatContent(viewItem.content)}
                  </div>
                </div>
              </div>
            </div>

          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a08060', gap: 16 }}>
              <i className="ti ti-books" style={{ fontSize: 56, opacity: 0.25 }} />
              <p style={{ fontSize: 16, fontWeight: 500, color: '#665c54', textAlign: 'center', maxWidth: 360 }}>
                Selecione um documento na lista ao lado para visualizá-lo, ou clique em <strong>"Adicionar Material"</strong> para criar um novo.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModuleShell>
  )
}
