'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { exportToPdf, exportToWord, generateSvgQRCode, OFFICIAL_SCHOOL_TEMPLATES } from '@/lib/exportUtils'
import StudentExamPlayer, { OnlineQuestion } from '@/components/modules/StudentExamPlayer'
import { 
  MediaLibraryItem, 
  uploadMediaFileToSupabase, 
  saveMediaItemToSupabase, 
  fetchMediaLibraryFromSupabase, 
  deleteMediaItemFromSupabase,
  syncToSupabase 
} from '@/lib/supabaseClient'
import { BnccSkill, getStoredBnccSkills, saveStoredBnccSkills } from '@/lib/bnccData'

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

export interface SchoolHeaderModel {
 id: string
 name: string
 officialName: string
 motto?: string
 subject?: string
 teacherName?: string
 instructions: string
 gradeMax?: string
 logoUrl?: string
 headerImageUrl?: string
 isImageHeader?: boolean
}

export interface SavedExerciseItem {
 id: string
 title: string
 topic?: string
 cefr?: string
 grade?: string
 date: string
 content: string
 type: 'exam' | 'quick' | 'qbank' | 'workbook'
 school?: string
}

export interface LooseFileItem {
 id: string
 title: string
 fileName: string
 fileType: 'pdf' | 'docx' | 'image' | 'audio' | 'sheet' | 'slide' | 'text' | 'other'
 fileSize: number // em bytes
 category: string // 'Atividade Complementar' | 'Artigo / Texto' | 'Lista de Vocabulário' | 'Handout / Ficha' | 'Slide / Apresentação' | 'Áudio de Aula' | 'Infográfico / Imagem' | 'Gabarito' | 'Outro'
 tags: string[]
 school?: string
 className?: string
 extractedText: string
 fileDataUrl?: string
 date: string
 createdAt: string
}

const INITIAL_LOOSE_FILES: LooseFileItem[] = [
 {
  id: 'loose_1',
  title: 'Lista de Phrasal Verbs Essenciais (com Exemplos e Contexto)',
  fileName: 'phrasal_verbs_handout_b1_b2.pdf',
  fileType: 'pdf',
  fileSize: 145000,
  category: 'Lista de Vocabulário',
  tags: ['#vocabulary', '#phrasalverbs', '#b1', '#b2'],
  school: 'Machado Sobrinho',
  className: '9º Ano B',
  extractedText: `GUIA COMPLETO: PHRASAL VERBS ESSENCIAIS PARA O ENSINO FUNDAMENTAL II & MÉDIO

1. LOOK FOR: Procurar por algo ou alguém.
Exemplo: I have been looking for my keys all morning.

2. GIVE UP: Desistir ou parar um hábito.
Exemplo: Never give up on your goals, even when grammar feels challenging!

3. BRING UP: Mencionar um assunto ou educar/criar.
Exemplo: She brought up an interesting point during our discussion.

4. CARRY OUT: Realizar ou executar uma pesquisa/tarefa.
Exemplo: Students must carry out the laboratory experiment safely.

5. RUN INTO: Encontrar alguém por acaso.
Exemplo: Guess who I ran into at the bookstore yesterday?`,
  date: new Date().toLocaleDateString('pt-BR'),
  createdAt: '2026-08-10T10:00:00Z',
 },
 {
  id: 'loose_2',
  title: 'Artigo: The Future of Renewable Energy in Smart Cities',
  fileName: 'future_renewable_energy_article.docx',
  fileType: 'docx',
  fileSize: 82000,
  category: 'Artigo / Texto',
  tags: ['#reading', '#clil', '#environment', '#smartcities'],
  school: 'Rede Santa Catarina',
  className: '8º Ano A',
  extractedText: `THE FUTURE OF RENEWABLE ENERGY IN SMART CITIES

As urban populations continue to expand, modern metropolises are transitioning from fossil fuel dependency to interconnected smart grids powered by solar, wind, and geothermal energy.

In cities like Copenhagen and Tokyo, automated sensors monitor energy consumption block by block, routing surplus electricity to electric vehicle charging stations and residential buildings in real time.

Discussion Questions:
1. What are the main advantages of decentralized smart grids?
2. How can schools contribute to energy conservation campaigns?`,
  date: new Date().toLocaleDateString('pt-BR'),
  createdAt: '2026-08-12T14:20:00Z',
 },
 {
  id: 'loose_3',
  title: 'Infográfico: Conectivos e Discurso Argumentativo (Writing Essay)',
  fileName: 'essay_linking_words_infographic.png',
  fileType: 'image',
  fileSize: 310000,
  category: 'Handout / Ficha',
  tags: ['#writing', '#connectors', '#essay', '#redacao'],
  school: 'Colégio Anglo',
  className: '3º Médio A',
  extractedText: `LINKING WORDS FOR ESSAY WRITING & ACADEMIC PAPERS

• ADDITION: Furthermore, Moreover, In addition to, Not only... but also
• CONTRAST: However, On the other hand, Nevertheless, In spite of
• CAUSE & EFFECT: Consequently, Therefore, As a result, Due to
• CONCLUSION: In summary, Ultimately, To conclude, Taking everything into account`,
  date: new Date().toLocaleDateString('pt-BR'),
  createdAt: '2026-08-14T09:15:00Z',
 }
]

// Presets Globalizers 4 
const G4_STUDENT_BOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
 title: ' Globalizers 4 Student\'s Book (Units 1-8 Main Texts & Dialogues)',
 type: 'Student\'s Book',
 category: 'Macmillan Education',
 textbook: 'Globalizers 4',
 content: `====================================================================
MACMILLAN EDUCATION GLOBALIZERS 4: STUDENT'S BOOK
====================================================================
[UNIT 1 LIVING ACROSS BORDERS]
Reading Text: "The rise of the digital nomad generation has redefined what it means to belong to a nation. Sophia, a 26-year-old software designer from São Paulo, works for a tech company in London while living in Lisbon. 'I have been traveling for three years,' she explains. 'Technology allows us to maintain cultural identity while embracing global citizenship.'"

Dialogue Model (Listening Task 1.2):
A: Have you been living in England for long?
B: Actually, I've been living in London since 2022, but I've traveled to six different countries this year alone.
A: How do you handle language barriers?
B: I usually use English as a lingua franca, but learning basic local phrases always helps.

[UNIT 2 DIGITAL INNOVATION & AUTOMATION]
Reading Text: "Artificial intelligence is no longer science fiction; it is reshaping how classrooms operate. By 2030, machine learning tools will be assisting educators by providing personalized feedback to students in real-time."

Dialogue Model:
Teacher: By next month, we will have completed the robotics project.
Student: Will we be presenting our findings at the science fair?
Teacher: Yes, as soon as the panel reviews your submissions.

[UNIT 3 CITIES OF TOMORROW]
Reading Text: "Urban planners in Copenhagen are designing zero-emission neighborhoods. If cities prioritize green architecture, carbon footprints will drop by 40%."

[UNIT 4 PERSUASION & CONSUMER CHOICE]
Reading Text: "Neuromarketing analyzes brain activity to understand consumer behavior. Advertisers reported that 80% of purchasing decisions are subconscious."

[UNIT 5 THE SCIENCE OF SLEEP]
Reading Text: "Cognitive performance declines steeply without adequate rest. Experts speculate that chronic sleep deprivation may affect long-term memory consolidation."

[UNIT 6 STREET ART VS VANDALISM]
Reading Text: "Is urban graffiti a legitimate form of artistic expression or public property damage? Museums worldwide are now exhibiting works that originated on city walls."

[UNIT 7 RESTORATIVE JUSTICE]
Reading Text: "Restorative justice focuses on rehabilitation through reconciliation with victims and the community at large."

[UNIT 8 MARS COLONIZATION]
Reading Text: "Seldom have humans faced a frontier as challenging as interplanetary expansion. Space agencies are testing closed-loop ecological life support systems."`
}

const G4_WORKBOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
 title: ' Globalizers 4 Workbook (Practice Exercises & Answer Key)',
 type: 'Workbook',
 category: 'Macmillan Education',
 textbook: 'Globalizers 4',
 content: `====================================================================
MACMILLAN EDUCATION GLOBALIZERS 4: WORKBOOK
====================================================================
[EXERCISE BANK UNIT 1 & 2]
1. Complete with Present Perfect Simple or Continuous:
 a) She (study) __________ English for five years. [Answer: has been studying]
 b) They (visit) __________ four countries this month. [Answer: have visited]
 c) I (know) __________ Mark since primary school. [Answer: have known]

2. Complete with Future Continuous or Future Perfect:
 a) By 8 PM tonight, I (finish) __________ my homework. [Answer: will have finished]
 b) This time tomorrow, we (fly) __________ to New York. [Answer: will be flying]

[EXERCISE BANK UNIT 3 & 4 (CONDITIONALS & REPORTED SPEECH)]
3. Rewrite using Conditionals:
 a) If people (recycle) __________ more, cities would be cleaner. [Answer: recycled]
 b) If I had known about the conference, I (attend) __________. [Answer: would have attended]

4. Transform into Reported Speech:
 a) "I am working on the project," said Lucas. -> Lucas said that he (be) __________ working on the project. [Answer: was]
 b) "Don't touch the equipment!" warned the engineer. -> The engineer warned us (not / touch) __________ the equipment. [Answer: not to touch]

[EXERCISE BANK UNIT 5-8 (MODALS, PASSIVE & INVERSION)]
5. Rewrite using Inversion:
 a) I have seldom seen such a brilliant presentation.
 -> Seldom __________ such a brilliant presentation. [Answer: have I seen]
 b) We not only won the trophy, but we also set a record.
 -> Not only __________ the trophy, but we also set a record. [Answer: did we win]`
}

const G4_REFERENCE_BOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
 title: ' Globalizers 4 Reference Book (Grammar Rules & Vocabulary Lists)',
 type: 'Reference Book',
 category: 'Macmillan Education',
 textbook: 'Globalizers 4',
 content: `====================================================================
MACMILLAN EDUCATION GLOBALIZERS 4: REFERENCE BOOK
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
 Phrasal Verbs: give up, look after, carry out, bring about, call off, turn down, set up, break through.
 Collocations: make a decision, do research, take into account, pay attention, draw a conclusion.
 False Friends: actually (de fato/na verdade), currently (atualmente), pretend (fingir), intend (pretender), push (empurrar), pull (puxar).`
}

const G4_CLIL_BOOK: Omit<RepositoryItem, 'id' | 'date' | 'wordCount' | 'chunkCount'> = {
 title: ' Globalizers 4 CLIL Book (Cross-Curricular Science, History & Art)',
 type: 'CLIL Book',
 category: 'Macmillan Education',
 textbook: 'Globalizers 4',
 content: `====================================================================
MACMILLAN EDUCATION GLOBALIZERS 4: CLIL BOOK (INTEGRATED LEARNING)
====================================================================
[CLIL LESSON 1: ENVIRONMENTAL SCIENCE RENEWABLE ENERGY & KINETIC TILES]
Subject: Environmental Science & Physics
Text: "Kinetic footpaths convert human footsteps into electrical energy. When pedestrians step on piezoelectric tiles installed in busy subway stations, kinetic energy is harvested to power LED lighting. This technology illustrates how urban spaces can become self-sustaining micro-grids."
Key Terms: Piezoelectric, kinetic energy, self-sustaining, micro-grid, harvest.

[CLIL LESSON 2: HISTORY & ANTHROPOLOGY THE SILK ROAD AND EARLY GLOBALIZATION]
Subject: History & World Geography
Text: "Centuries before modern telecommunications, the Silk Road established trade routes connecting East Asia with the Mediterranean. Beyond silk and spices, these routes facilitated the exchange of scientific knowledge, paper manufacturing techniques, and philosophical traditions."
Key Terms: Trade routes, exchange, cultural diffusion, infrastructure.

[CLIL LESSON 3: COMPUTER SCIENCE & ALGORITHMIC BIAS]
Subject: Computer Science & Ethics
Text: "Machine learning algorithms trained on historical data may inadvertently replicate human biases. Computer scientists are developing ethical auditing tools to evaluate neutrality in automated hiring systems."
Key Terms: Algorithmic bias, machine learning, ethical auditing, neutrality.

[CLIL LESSON 4: ART & DESIGN THE GEOMETRY OF ISLAMIC ARCHITECTURE]
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
 if (type === "Student's Book") return ''
 if (type === 'Workbook') return ''
 if (type === 'Reference Book') return ''
 if (type === 'CLIL Book') return ''
 if (type === 'Syllabus') return ''
 return ''
}

function typeColor(type: string) {
 if (type === "Student's Book") return '#1a73e8'
 if (type === 'Workbook') return '#e67e22'
 if (type === 'Reference Book') return '#27ae60'
 if (type === 'CLIL Book') return '#8b5cf6'
 if (type === 'Syllabus') return '#c0392b'
 return '#586e75'
}

// RAG Search 
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
  // 6 PARTIÇÕES PRINCIPAIS 
  const [activePartition, setActivePartition] = useState<'headers' | 'exercises' | 'bibliography' | 'files' | 'images' | 'competencies'>('headers')

  // 6. Matriz Central de Competências & Habilidades (BNCC/ELT)
  const [competencies, setCompetencies] = useState<BnccSkill[]>([])
  const [compGradeFilter, setCompGradeFilter] = useState<string>('all')
  const [compAxisFilter, setCompAxisFilter] = useState<string>('all')
  const [compSearch, setCompSearch] = useState<string>('')
  const [isAddCompModalOpen, setIsAddCompModalOpen] = useState(false)
  const [editingComp, setEditingComp] = useState<BnccSkill | null>(null)
  const [compCode, setCompCode] = useState('')
  const [compGradeYear, setCompGradeYear] = useState('9º Fund.')
  const [compAxis, setCompAxis] = useState<BnccSkill['axis']>('Conhecimentos Linguísticos')
  const [compDescription, setCompDescription] = useState('')
  const [compUnit, setCompUnit] = useState('')

  // 5. Banco de Imagens & Mídias
  const [mediaItems, setMediaItems] = useState<MediaLibraryItem[]>([])
  const [mediaCategoryFilter, setMediaCategoryFilter] = useState<string>('all')
  const [mediaSearch, setMediaSearch] = useState<string>('')
  const [mediaSchoolFilter, setMediaSchoolFilter] = useState<string>('all')
  const [selectedMediaModal, setSelectedMediaModal] = useState<MediaLibraryItem | null>(null)
  const [editingMediaModal, setEditingMediaModal] = useState<MediaLibraryItem | null>(null)
  const [isAddMediaModalOpen, setIsAddMediaModalOpen] = useState(false)
  const [newMediaTitle, setNewMediaTitle] = useState('')
  const [newMediaCategory, setNewMediaCategory] = useState('Ilustrações Didáticas')
  const [newMediaSchool, setNewMediaSchool] = useState('')
  const [newMediaTags, setNewMediaTags] = useState('')
  const [newMediaDescription, setNewMediaDescription] = useState('')
  const [newMediaUrl, setNewMediaUrl] = useState('')
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null)

  // Bibliografia (Livros / Textos)
  const [items, setItems] = useState<RepositoryItem[]>([])
  const [viewItem, setViewItem] = useState<RepositoryItem | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [mode, setMode] = useState<'view' | 'add' | 'edit' | 'rag'>('view')

  // 4. Arquivos Avulsos (Subfuncionalidade Arquivos)
  const [looseFiles, setLooseFiles] = useState<LooseFileItem[]>([])
  const [selectedLooseFile, setSelectedLooseFile] = useState<LooseFileItem | null>(null)
  const [looseFileFilter, setLooseFileFilter] = useState<string>('all')
  const [looseFileSearch, setLooseFileSearch] = useState<string>('')
  const [looseFileSchoolFilter, setLooseFileSchoolFilter] = useState<string>('all')
  const [isAddLooseModalOpen, setIsAddLooseModalOpen] = useState(false)
  const [newLooseTitle, setNewLooseTitle] = useState('')
  const [newLooseCategory, setNewLooseCategory] = useState('Atividade Complementar')
  const [newLooseSchool, setNewLooseSchool] = useState('')
  const [newLooseTags, setNewLooseTags] = useState('')
  const [newLooseContent, setNewLooseContent] = useState('')
  const looseFileInputRef = useRef<HTMLInputElement | null>(null)

  // Cabeçalhos de Escolas
  const [headerTemplates, setHeaderTemplates] = useState<SchoolHeaderModel[]>([])
  const [selectedHeaderId, setSelectedHeaderId] = useState<string>('')
  const [registeredSchools, setRegisteredSchools] = useState<{ id: string; name: string }[]>([])
  const [selectedSchoolForUpload, setSelectedSchoolForUpload] = useState<string>('')

  // Edição direta em cima do cabeçalho importado
  const [isEditingHeader, setIsEditingHeader] = useState(false)
  const [editHeaderName, setEditHeaderName] = useState('')
  const [editHeaderOfficialName, setEditHeaderOfficialName] = useState('')
  const [editHeaderSubject, setEditHeaderSubject] = useState('')
  const [editHeaderInstructions, setEditHeaderInstructions] = useState('')
  const [newSchoolName, setNewSchoolName] = useState('')
  const [newOfficialName, setNewOfficialName] = useState('')
  const [newInstructions, setNewInstructions] = useState('')
  const [newSubject, setNewSubject] = useState('Língua Inglesa')
  const [newLogoUrl, setNewLogoUrl] = useState('')
  const [newHeaderImageUrl, setNewHeaderImageUrl] = useState('')
  const [headerDate, setHeaderDate] = useState(new Date().toLocaleDateString('pt-BR'))
  const [headerClassGroup, setHeaderClassGroup] = useState('9º Ano A')
  const [headerTeacher, setHeaderTeacher] = useState('Professor(a)')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  function showToast(msg = 'Item salvo') {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 2200)
  }

  // Exercícios & Provas Salvas
  const [savedExercises, setSavedExercises] = useState<SavedExerciseItem[]>([])
  const [exerciseFilter, setExerciseFilter] = useState<string>('all')
  const [exerciseSearch, setExerciseSearch] = useState<string>('')
  const [viewExercise, setViewExercise] = useState<SavedExerciseItem | null>(null)
  const [showOnlinePlayer, setShowOnlinePlayer] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)

  // Add / Edit form (Bibliografia)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editType, setEditType] = useState<RepositoryItem['type']>("Student's Book")
  const [editCategory, setEditCategory] = useState('Macmillan Education')
  const [editTextbook, setEditTextbook] = useState('')

  // RAG test
  const [ragQuery, setRagQuery] = useState('')
  const [ragResults, setRagResults] = useState<string[]>([])
  const [ragScope, setRagScope] = useState<'all' | 'doc'>('all')

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
  const headerFileInputRef = useRef<HTMLInputElement | null>(null)
  const ocrImageInputRef = useRef<HTMLInputElement | null>(null)

 // Load All Partitions Data 
 const loadAllData = useCallback(() => {
 // 1. Bibliografia
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
 if (!viewItem && current.length > 0) setViewItem(current[0])

 // 2. Cabeçalhos das Escolas e Cadastro de Escolas
 const customSchoolsStr = localStorage.getItem('teacher_schools')
 const customSchools: { id: string; name: string }[] = customSchoolsStr ? JSON.parse(customSchoolsStr) : []
 setRegisteredSchools(customSchools)
 if (customSchools.length > 0 && !selectedSchoolForUpload) {
 setSelectedSchoolForUpload(customSchools[0].name)
 }

 const customHeadersStr = localStorage.getItem('teacher_custom_headers') || localStorage.getItem('teacher_school_headers')
 const savedCustomHeaders: SchoolHeaderModel[] = customHeadersStr ? JSON.parse(customHeadersStr) : []

 setHeaderTemplates(savedCustomHeaders)
 if (savedCustomHeaders.length > 0 && (!selectedHeaderId || !savedCustomHeaders.some(h => h.id === selectedHeaderId))) {
 setSelectedHeaderId(savedCustomHeaders[0].id)
 }

 // 3. Exercícios & Provas Salvas
 const examsStr = localStorage.getItem('teacher_saved_exams') || '[]'
 const quicksStr = localStorage.getItem('teacher_saved_quicks') || '[]'
 const qbankStr = localStorage.getItem('teacher_question_bank') || '[]'

 const exams = JSON.parse(examsStr)
 const quicks = JSON.parse(quicksStr)
 const qbanks = JSON.parse(qbankStr)

 const compiledExercises: SavedExerciseItem[] = []

 // Provas completas
 exams.forEach((ex: any, idx: number) => {
 compiledExercises.push({
 id: `exam-${ex.id || idx}`,
 title: ex.title || `Avaliação Bimestral ${ex.topic || 'Inglês'}`,
 topic: ex.topic,
 cefr: ex.cefr || 'B1',
 grade: ex.grade || '9º Ano',
 date: ex.date || new Date().toLocaleDateString('pt-BR'),
 content: ex.content || '',
 type: 'exam',
 school: ex.school
 })
 })

 // Exercícios rápidos
 quicks.forEach((qk: any, idx: number) => {
 compiledExercises.push({
 id: `quick-${qk.id || idx}`,
 title: qk.title || `Exercício de Fixação ${qk.topic || 'Inglês'}`,
 topic: qk.topic,
 cefr: qk.cefr || 'B1',
 grade: qk.grade || 'Geral',
 date: qk.date || new Date().toLocaleDateString('pt-BR'),
 content: qk.content || '',
 type: 'quick',
 school: qk.school
 })
 })

 // Presets do Workbook como exercícios de referência
 compiledExercises.push({
 id: 'wb-g4',
 title: 'Globalizers 4 Banco de Exercícios & Gabarito Comentado (Units 1-8)',
 topic: 'Conditionals, Reported Speech & Inversion',
 cefr: 'B2',
 grade: 'Ensino Médio / Avançado',
 date: new Date().toLocaleDateString('pt-BR'),
 content: G4_WORKBOOK.content,
 type: 'workbook',
 school: 'Macmillan Education'
 })

    // 4. Arquivos Avulsos
    const looseStr = localStorage.getItem('teacher_loose_files_v1')
    let parsedLoose: LooseFileItem[] = looseStr ? JSON.parse(looseStr) : []
    if (!parsedLoose || parsedLoose.length === 0) {
      parsedLoose = INITIAL_LOOSE_FILES
      localStorage.setItem('teacher_loose_files_v1', JSON.stringify(INITIAL_LOOSE_FILES))
    }
    setLooseFiles(parsedLoose)
    if (!selectedLooseFile && parsedLoose.length > 0) {
      setSelectedLooseFile(parsedLoose[0])
    }

    setSavedExercises(compiledExercises)
    if (!viewExercise && compiledExercises.length > 0) setViewExercise(compiledExercises[0])

    // 6. Matriz Central de Competências & Habilidades (BNCC/ELT)
    setCompetencies(getStoredBnccSkills())

    // Mescla com documentos reais do Supabase (assíncrono, não bloqueia UI)
    import('@/lib/supabaseClient').then(({ fetchDocumentsFromSupabase }) => {
      fetchDocumentsFromSupabase().then(supabaseDocs => {
        if (!supabaseDocs || supabaseDocs.length === 0) return
        
        // Livros & Bibliografia
        setItems(prev => {
          const presetIds = new Set(prev.filter(i => i.title.includes('Globalizers 4')).map(i => String(i.id)))
          const localCustomIds = new Set(prev.filter(i => !presetIds.has(String(i.id))).map(i => String(i.id)))
          const newFromSupabase = supabaseDocs.filter(d => d.type !== 'Arquivo Avulso' && !presetIds.has(d.id) && !localCustomIds.has(d.id))
          const mapped: RepositoryItem[] = newFromSupabase.map(d => ({
            id: Number(d.id) || parseInt(d.id) || Date.now(),
            title: d.title,
            content: d.content,
            type: (d.type as RepositoryItem['type']) || "Student's Book",
            category: d.category || 'Supabase',
            textbook: d.textbook || undefined,
            date: d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
            wordCount: d.word_count || countWords(d.content),
            chunkCount: d.chunk_count || countChunks(d.content),
          }))
          return [...prev, ...mapped]
        })

        // Arquivos Avulsos do Supabase
        const supabaseLoose = supabaseDocs.filter(d => d.type === 'Arquivo Avulso')
        if (supabaseLoose.length > 0) {
          setLooseFiles(prev => {
            const localIds = new Set(prev.map(f => f.id))
            const toAdd = supabaseLoose.filter(d => !localIds.has(d.id)).map(d => ({
              id: d.id,
              title: d.title,
              fileName: d.title,
              fileType: (d.textbook as LooseFileItem['fileType']) || 'pdf',
              fileSize: (d.content?.length || 0) * 2,
              category: d.category || 'Atividade Complementar',
              tags: ['#nuvem', '#supabase'],
              extractedText: d.content || '',
              fileDataUrl: d.file_url || undefined,
              date: d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
              createdAt: d.created_at || new Date().toISOString(),
            }))
            return [...prev, ...toAdd]
          })
        }
      }).catch(() => {})
    }).catch(() => {})

    // 5. Banco de Imagens & Mídias
    try {
      const localMedia = localStorage.getItem('teacher_media_library')
      if (localMedia) {
        const parsedMedia: MediaLibraryItem[] = JSON.parse(localMedia)
        if (parsedMedia && parsedMedia.length > 0) {
          setMediaItems(parsedMedia)
        }
      }
    } catch {}

    fetchMediaLibraryFromSupabase().then(media => {
      if (media && media.length > 0) {
        setMediaItems(media)
      }
    }).catch(() => {})
 }, [viewItem, viewExercise, selectedLooseFile])

 useEffect(() => {
 loadAllData()
 }, [loadAllData])

 // Persist & Re-Index RAG & Supabase Sync 
 const save = useCallback((updated: RepositoryItem[], newItem?: RepositoryItem) => {
 setItems(updated)
 const jsonStr = JSON.stringify(updated)
 localStorage.setItem(LS_KEY, jsonStr)
 localStorage.setItem('teacher_repository', jsonStr)
 localStorage.setItem('teacher_repo_materials', jsonStr)
 localStorage.removeItem(LS_RAG_KEY)

 try {
 import('@/lib/ragEngine').then(({ indexAllLibraryItems }) => indexAllLibraryItems())
 } catch { /* ignora */ }

 // Sincroniza na tabela key-value
 try {
 import('@/lib/supabaseClient').then(({ syncToSupabase }) => {
 syncToSupabase({
 teacher_repo: updated,
 teacher_repository: updated,
 teacher_repo_materials: updated
 })
 })
 } catch { /* ignora */ }

 // Upsert direto na tabela relacional documents (apenas itens não-preset)
 if (newItem && !newItem.title.includes('Globalizers 4')) {
 import('@/lib/supabaseClient').then(({ upsertDocumentToSupabase }) => {
 upsertDocumentToSupabase({
 id: String(newItem.id),
 title: newItem.title,
 type: newItem.type,
 category: newItem.category || null,
 textbook: newItem.textbook || null,
 content: newItem.content,
 file_url: null,
 word_count: newItem.wordCount || null,
 chunk_count: newItem.chunkCount || null,
 }).catch(() => {})
 }).catch(() => {})
 }
 }, [])

  // Persistência e Sincronização de Arquivos Avulsos
  const saveLooseFiles = useCallback((updated: LooseFileItem[], newItem?: LooseFileItem) => {
    setLooseFiles(updated)
    localStorage.setItem('teacher_loose_files_v1', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))

    try {
      import('@/lib/supabaseClient').then(({ saveLooseFileToSupabase, syncToSupabase }) => {
        if (newItem) {
          saveLooseFileToSupabase(newItem)
        }
        syncToSupabase({
          teacher_loose_files: updated
        })
      }).catch(() => {})
    } catch {}
  }, [])

  const handleUploadLooseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (looseFileInputRef.current) looseFileInputRef.current.value = ''

    const fileNameLower = file.name.toLowerCase()
    let fileType: LooseFileItem['fileType'] = 'other'
    if (fileNameLower.endsWith('.pdf')) fileType = 'pdf'
    else if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) fileType = 'docx'
    else if (fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || fileNameLower.endsWith('.webp')) fileType = 'image'
    else if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.csv')) fileType = 'sheet'
    else if (fileNameLower.endsWith('.pptx') || fileNameLower.endsWith('.ppt')) fileType = 'slide'
    else if (fileNameLower.endsWith('.mp3') || fileNameLower.endsWith('.wav') || fileNameLower.endsWith('.m4a')) fileType = 'audio'
    else if (fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.md')) fileType = 'text'

    setUploadingStatus(` Extraindo e indexando arquivo avulso "${file.name}"...`)

    try {
      let text = ''
      let dataUrl = ''

      const reader = new FileReader()
      const dataUrlPromise = new Promise<string>((resolve) => {
        reader.onload = (ev) => resolve((ev.target?.result as string) || '')
        reader.onerror = () => resolve('')
        reader.readAsDataURL(file)
      })

      if (fileType === 'pdf') {
        const { extractTextFromPdf } = await import('@/lib/pdfExtractor')
        text = await extractTextFromPdf(file, (curr, tot) => {
          setUploadingStatus(` Processando PDF avulso: pág ${curr}/${tot}...`)
        })
      } else if (fileType === 'docx') {
        const { extractDocxWithImages } = await import('@/lib/pdfExtractor')
        const docxRes = await extractDocxWithImages(file)
        text = docxRes.text || ''
      } else if (fileType === 'image') {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/ocr', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          text = data.text || ''
        }
      } else if (fileType === 'text') {
        text = await file.text()
      } else {
        text = `Arquivo Avulso: ${file.name}\nTamanho: ${(file.size / 1024).toFixed(1)} KB\nFormato: ${file.type || fileType}`
      }

      dataUrl = await dataUrlPromise

      const newFileItem: LooseFileItem = {
        id: `file_${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        fileType,
        fileSize: file.size,
        category: fileType === 'pdf' ? 'Atividade Complementar' : fileType === 'image' ? 'Infográfico / Imagem' : fileType === 'audio' ? 'Áudio de Aula' : fileType === 'slide' ? 'Slide / Apresentação' : 'Documento Avulso',
        tags: [`#${fileType}`, '#avulso'],
        school: registeredSchools[0]?.name || 'Geral',
        extractedText: text || file.name,
        fileDataUrl: dataUrl || undefined,
        date: new Date().toLocaleDateString('pt-BR'),
        createdAt: new Date().toISOString()
      }

      const updated = [newFileItem, ...looseFiles]
      saveLooseFiles(updated, newFileItem)
      setSelectedLooseFile(newFileItem)
      setUploadingStatus('')
      showToast('Arquivo avulso adicionado e indexado no Supabase!')
    } catch (err: unknown) {
      setUploadingStatus('')
      alert(`Erro ao processar arquivo: ${err instanceof Error ? err.message : 'Falha na leitura.'}`)
    }
  }

  const handleDeleteLooseFile = (id: string) => {
    if (!confirm('Deseja realmente excluir este arquivo avulso da biblioteca?')) return
    const updated = looseFiles.filter(f => f.id !== id)
    saveLooseFiles(updated)
    if (selectedLooseFile?.id === id) {
      setSelectedLooseFile(updated[0] || null)
    }
    try {
      import('@/lib/supabaseClient').then(({ deleteLooseFileFromSupabase }) => {
        deleteLooseFileFromSupabase(id)
      })
    } catch {}
    showToast('Arquivo removido')
  }

  // Add New School Header
  function handleAddSchoolHeader() {
    if (!newSchoolName.trim()) {
      alert('Preencha o nome da escola para cadastrar o cabeçalho.')
      return
    }
    const newHeader: SchoolHeaderModel = {
      id: `school-${Date.now()}`,
      name: newSchoolName.trim(),
      officialName: newOfficialName.trim() || newSchoolName.trim().toUpperCase(),
      motto: 'Ensino de Excelência & Formação Integral',
      subject: newSubject.trim() || 'Língua Inglesa',
      instructions: newInstructions.trim() || '1. Responda todas as questões com atenção.\n2. Utilize caneta azul ou preta.\n3. Boa avaliação!',
      gradeMax: '10,0',
      logoUrl: newLogoUrl.trim() || undefined,
      headerImageUrl: newHeaderImageUrl.trim() || undefined,
      isImageHeader: Boolean(newHeaderImageUrl.trim())
    }

    const updated = [...headerTemplates, newHeader]
    setHeaderTemplates(updated)
    setSelectedHeaderId(newHeader.id)

    try {
      const existingCustom = JSON.parse(localStorage.getItem('teacher_custom_headers') || '[]')
      const customUpdated = [...existingCustom.filter((h: any) => h.id !== newHeader.id), newHeader]
      localStorage.setItem('teacher_custom_headers', JSON.stringify(customUpdated))

      const cur = JSON.parse(localStorage.getItem('teacher_schools') || '[]')
      if (!cur.some((s: any) => s.name.toLowerCase() === newHeader.name.toLowerCase())) {
        cur.push({ id: newHeader.id, name: newHeader.name })
        localStorage.setItem('teacher_schools', JSON.stringify(cur))
      }

      import('@/lib/supabaseClient').then(({ syncToSupabase }) => {
        syncToSupabase({
          teacher_custom_headers: customUpdated,
          teacher_schools: cur
        })
      })
    } catch {}

    setNewSchoolName('')
    setNewOfficialName('')
    setNewInstructions('')
    setNewLogoUrl('')
    setNewHeaderImageUrl('')
    showToast('item salvo')
  }

  const handleSaveAndApplyHeader = handleAddSchoolHeader

  function deleteSchoolHeader(id: string) {
    if (!confirm('Deseja realmente excluir este modelo de cabeçalho?')) return
    const updated = headerTemplates.filter(h => h.id !== id)
    setHeaderTemplates(updated)

    try {
      const existingCustom = JSON.parse(localStorage.getItem('teacher_custom_headers') || '[]')
      const customUpdated = existingCustom.filter((h: any) => h.id !== id)
      localStorage.setItem('teacher_custom_headers', JSON.stringify(customUpdated))

      import('@/lib/supabaseClient').then(({ syncToSupabase }) => {
        syncToSupabase({
          teacher_custom_headers: customUpdated
        })
      })
    } catch {}

    if (updated.length > 0) {
      setSelectedHeaderId(updated[0].id)
    } else {
      setSelectedHeaderId('')
    }
    setIsEditingHeader(false)
    showToast('Cabeçalho excluído com sucesso!')
  }

  function startEditingHeader() {
    if (!currentSelectedHeader) return
    setEditHeaderName(currentSelectedHeader.name || '')
    setEditHeaderOfficialName(currentSelectedHeader.officialName || '')
    setEditHeaderSubject(currentSelectedHeader.subject || 'Língua Inglesa')
    setEditHeaderInstructions(currentSelectedHeader.instructions || '')
    setIsEditingHeader(true)
  }

  function saveHeaderEdits() {
    if (!currentSelectedHeader) return
    const updated: SchoolHeaderModel = {
      ...currentSelectedHeader,
      name: editHeaderName.trim() || currentSelectedHeader.name,
      officialName: editHeaderOfficialName.trim() || currentSelectedHeader.officialName,
      subject: editHeaderSubject.trim() || currentSelectedHeader.subject,
      instructions: editHeaderInstructions.trim() || currentSelectedHeader.instructions
    }

    const updatedList = headerTemplates.map(h => h.id === updated.id ? updated : h)
    setHeaderTemplates(updatedList)

    try {
      const existingCustom = JSON.parse(localStorage.getItem('teacher_custom_headers') || '[]')
      const customUpdated = existingCustom.map((h: any) => h.id === updated.id ? updated : h)
      localStorage.setItem('teacher_custom_headers', JSON.stringify(customUpdated))

      import('@/lib/supabaseClient').then(({ syncToSupabase }) => {
        syncToSupabase({ teacher_custom_headers: customUpdated })
      })
    } catch {}

    setIsEditingHeader(false)
    showToast('Alterações do cabeçalho salvas!')
  }

  function linkHeaderToSchool(headerId: string, schoolName: string) {
    if (!schoolName) return
    const updatedList = headerTemplates.map(h => {
      if (h.id === headerId) {
        return {
          ...h,
          name: schoolName,
          officialName: schoolName.toUpperCase()
        }
      }
      return h
    })
    setHeaderTemplates(updatedList)

    try {
      localStorage.setItem('teacher_custom_headers', JSON.stringify(updatedList))
      import('@/lib/supabaseClient').then(({ syncToSupabase }) => {
        syncToSupabase({ teacher_custom_headers: updatedList })
      })
    } catch {}

    showToast(`Cabeçalho vinculado à escola "${schoolName}"!`)
  }

  // Import / Process Header File (PNG, JPEG, DOCX, PDF)
  async function processHeaderFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (headerFileInputRef.current) headerFileInputRef.current.value = ''

    setUploadingStatus(`Processando cabeçalho de "${file.name}"...`)

    try {
      let text = ''
      let extractedLogo = ''
      let extractedHeaderImg = ''
      const fileNameLower = file.name.toLowerCase()

      if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) {
        const { extractDocxWithImages } = await import('@/lib/pdfExtractor')
        const res = await extractDocxWithImages(file)
        text = res.text || ''
        if (res.images && res.images.length > 0) {
          extractedHeaderImg = res.images[0].dataUrl
          extractedLogo = res.images[0].dataUrl
        }
      } else if (fileNameLower.endsWith('.pdf')) {
        const { extractTextFromPdf } = await import('@/lib/pdfExtractor')
        text = await extractTextFromPdf(file)
      } else if (file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(fileNameLower)) {
        extractedHeaderImg = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve((ev.target?.result as string) || '')
          reader.readAsDataURL(file)
        })
      } else {
        text = await file.text()
      }

      if ((!text || text.trim().length === 0) && !extractedHeaderImg) {
        setUploadingStatus('')
        alert('O arquivo selecionado não contém imagem nem texto de cabeçalho válido.')
        return
      }

      const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/cabeçalho/i, '').trim()
      const lines = text ? text.split('\n').map(l => l.trim()).filter(Boolean) : []
      const instructionsLines = lines.filter(l => /^(1\.|2\.|3\.|instrução|instrucoes|instruções|atenção|atencao)/i.test(l))

      const schoolToUse = selectedSchoolForUpload.trim() || cleanFileName || (lines[0] || 'Cabeçalho Personalizado')

      const newHeader: SchoolHeaderModel = {
        id: `school-${Date.now()}`,
        name: schoolToUse,
        officialName: schoolToUse.toUpperCase(),
        motto: 'Ensino de Excelência & Formação Integral',
        subject: 'Língua Inglesa',
        instructions: instructionsLines.length > 0
          ? instructionsLines.join('\n')
          : '1. Responda todas as questões com atenção.\n2. Utilize caneta azul ou preta.\n3. Boa avaliação!',
        gradeMax: '10,0',
        logoUrl: extractedLogo || undefined,
        headerImageUrl: extractedHeaderImg || undefined,
        isImageHeader: Boolean(extractedHeaderImg)
      }

      const updated = [...headerTemplates, newHeader]
      setHeaderTemplates(updated)
      setSelectedHeaderId(newHeader.id)

      try {
        const existingCustom = JSON.parse(localStorage.getItem('teacher_custom_headers') || '[]')
        const customUpdated = [...existingCustom.filter((h: any) => h.id !== newHeader.id), newHeader]
        localStorage.setItem('teacher_custom_headers', JSON.stringify(customUpdated))

        const cur = JSON.parse(localStorage.getItem('teacher_schools') || '[]')
        if (!cur.some((s: any) => s.name.toLowerCase() === newHeader.name.toLowerCase())) {
          cur.push({ id: newHeader.id, name: newHeader.name })
          localStorage.setItem('teacher_schools', JSON.stringify(cur))
        }

        import('@/lib/supabaseClient').then(({ syncToSupabase }) => {
          syncToSupabase({
            teacher_custom_headers: customUpdated,
            teacher_schools: cur
          })
        })
      } catch {}

      setUploadingStatus('')
      showToast(`Cabeçalho "${newHeader.name}" injetado com sucesso!`)
    } catch (err: unknown) {
      setUploadingStatus('')
      alert(`Erro ao processar o cabeçalho: ${err instanceof Error ? err.message : 'Falha ao ler arquivo.'}`)
    }
  }

  // Save Edits (Bibliografia)
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
    showToast('item salvo')
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
    setEditTitle('')
    setEditContent('')
    setEditType("Student's Book")
    setEditCategory('Macmillan Education')
    setEditTextbook('')
  }

  // Add Item (Bibliografia) 
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
    save(updated, item)
    setViewItem(item)
    setMode('view')
    clearForm()
    showToast('item salvo')
  }

  // Delete 
  function deleteItem(id: number) {
    if (!confirm('Deseja remover este documento da Biblioteca?')) return
    const upd = items.filter(i => i.id !== id)
    save(upd)
    setViewItem(upd[0] || null)
    setMode('view')
    try {
      import('@/lib/supabaseClient').then(({ deleteDocumentFromSupabase }) => {
        deleteDocumentFromSupabase(String(id))
      })
    } catch {}
  }

  function deleteExercise(id: string) {
    if (!confirm('Deseja excluir este exercício do repositório?')) return
    const upd = savedExercises.filter(e => e.id !== id)
    setSavedExercises(upd)
    if (id.startsWith('exam-')) {
      const realId = id.replace('exam-', '')
      const savedExams = JSON.parse(localStorage.getItem('teacher_saved_exams') || '[]').filter((x: any, idx: number) => String(x.id || idx) !== realId)
      localStorage.setItem('teacher_saved_exams', JSON.stringify(savedExams))
    } else if (id.startsWith('quick-')) {
      const realId = id.replace('quick-', '')
      const savedQuicks = JSON.parse(localStorage.getItem('teacher_saved_quicks') || '[]').filter((x: any, idx: number) => String(x.id || idx) !== realId)
      localStorage.setItem('teacher_saved_quicks', JSON.stringify(savedQuicks))
    }
    setViewExercise(upd[0] || null)

    try {
      import('@/lib/supabaseClient').then(({ syncToSupabase }) => {
        syncToSupabase()
      })
    } catch {}
  }

  // File Upload (PDF, DOCX, TXT, MD, CSV, JSON) 
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    setUploadingStatus(` Preparando para compilar "${file.name}"...`)

    try {
      let text = ''
      const fileNameLower = file.name.toLowerCase()

      if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) {
        setUploadingStatus(` Lendo arquivo Word "${file.name}"...`)
        const { extractTextFromDocx } = await import('@/lib/pdfExtractor')
        text = await extractTextFromDocx(file)
      } else if (file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
        const { extractTextFromPdf } = await import('@/lib/pdfExtractor')
        text = await extractTextFromPdf(file, (current, total) => {
          setUploadingStatus(` Lendo e compilando livro: Página ${current} de ${total} (${Math.round((current / total) * 100)}%)...`)
        })
      } else {
        setUploadingStatus(` Lendo arquivo de texto "${file.name}"...`)
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
      save(updated, item)
      setViewItem(item)
      setMode('view')
      setUploadingStatus('')
      showToast('item salvo')
    } catch (err: unknown) {
      setUploadingStatus('')
      alert(` Falha na importação: ${err instanceof Error ? err.message : 'Não foi possível extrair o texto do arquivo.'}`)
    }
  }

  // Image Upload with OCR via Gemini Vision 
  async function handleImageOcr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (ocrImageInputRef.current) ocrImageInputRef.current.value = ''

    setUploadingStatus(` 🔍 Executando OCR na imagem "${file.name}" via Gemini Vision...`)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `Erro HTTP ${res.status}`)
      }

      const data = await res.json()
      if (!data.text || data.text.trim().length < 5) {
        throw new Error('Nenhum texto foi detectado na imagem.')
      }

      const extractedText = data.text.trim()
      const wCount = countWords(extractedText)
      const cCount = countChunks(extractedText)

      const item: RepositoryItem = {
        id: Date.now(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        content: extractedText,
        type: "Student's Book",
        category: 'OCR Imagem (Print/JPEG/PNG)',
        date: new Date().toLocaleDateString('pt-BR'),
        wordCount: wCount,
        chunkCount: cCount,
      }

      const updated = [item, ...items]
      save(updated, item)
      setViewItem(item)
      setMode('view')
      setUploadingStatus('')
      showToast('🔍 OCR concluído e imagem salva na biblioteca!')
    } catch (err: unknown) {
      setUploadingStatus('')
      alert(` Falha no OCR da Imagem: ${err instanceof Error ? err.message : 'Erro ao ler texto da imagem.'}`)
    }
  }

 // Helper para extrair questões para o Player Online 
 const parseQuestionsFromContent = (text: string): OnlineQuestion[] => {
 if (!text) return []
 const lines = text.split('\n')
 const qList: OnlineQuestion[] = []
 let currentStem = ''
 let currentOpts: string[] = []

 lines.forEach((line) => {
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
 currentOpts.push(trimmed)
 } else if (currentStem && !/Gabarito|Answer Key/i.test(trimmed)) {
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
 return qList
 }

 // Formatação de Texto da Bibliografia 
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
 } else if (/^[\-\*]\s/.test(trimmed)) {
 elements.push(
 <div key={i} style={{ fontSize: 13, color: '#444', padding: '2px 0 2px 16px', display: 'flex', gap: 6 }}>
 <span style={{ color: '#8b5e3c', flexShrink: 0 }}></span>
 {trimmed.replace(/^[\-\*]\s/, '')}
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

  // Filtros da Bibliografia 
  const filteredBibliography = items.filter(i => {
    const matchType = activeFilter === 'all' || i.type === activeFilter
    const matchSearch = !searchText || i.title.toLowerCase().includes(searchText.toLowerCase()) || i.content.toLowerCase().includes(searchText.toLowerCase())
    return matchType && matchSearch
  })

  // Filtros de Exercícios 
  const filteredExercises = savedExercises.filter(e => {
    const matchType = exerciseFilter === 'all' || e.type === exerciseFilter
    const matchSearch = !exerciseSearch || e.title.toLowerCase().includes(exerciseSearch.toLowerCase()) || e.content.toLowerCase().includes(exerciseSearch.toLowerCase())
    return matchType && matchSearch
  })

  // Filtros de Arquivos Avulsos (Subfuncionalidade Arquivos)
  const filteredLooseFiles = looseFiles.filter(f => {
    const matchCategory = looseFileFilter === 'all' || f.category === looseFileFilter || (looseFileFilter === 'image' && f.fileType === 'image') || (looseFileFilter === 'audio' && f.fileType === 'audio')
    const matchSchool = looseFileSchoolFilter === 'all' || (f.school && f.school.toLowerCase().includes(looseFileSchoolFilter.toLowerCase()))
    const searchLower = looseFileSearch.toLowerCase()
    const matchSearch = !looseFileSearch || 
      f.title.toLowerCase().includes(searchLower) || 
      f.fileName.toLowerCase().includes(searchLower) || 
      f.extractedText.toLowerCase().includes(searchLower) ||
      (f.tags && f.tags.some(t => t.toLowerCase().includes(searchLower)))
    return matchCategory && matchSchool && matchSearch
  })

  const defaultFallbackHeader: SchoolHeaderModel = {
    id: 'default-school',
    name: 'Colégio Machado Sobrinho',
    officialName: 'COLÉGIO MACHADO SOBRINHO SISTEMA DE ENSINO INTEGRADO',
    motto: 'Ensino de Excelência & Formação Integral',
    subject: 'Língua Inglesa',
    instructions: '1. Responda todas as questões com clareza e atenção.\n2. Utilize caneta azul ou preta.\n3. Boa avaliação!',
    gradeMax: '10,0'
  }

  const currentSelectedHeader = headerTemplates.find(h => h.id === selectedHeaderId) || headerTemplates[0] || defaultFallbackHeader

  // Filtro de Mídias / Imagens
  const filteredMediaItems = mediaItems.filter(item => {
    const matchCat = mediaCategoryFilter === 'all' || item.category === mediaCategoryFilter
    const matchSchool = mediaSchoolFilter === 'all' || item.schoolName === mediaSchoolFilter || (!item.schoolName && mediaSchoolFilter === 'Geral')
    const matchSearch = !mediaSearch.trim() || 
      item.title.toLowerCase().includes(mediaSearch.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(mediaSearch.toLowerCase())) ||
      (item.tags && item.tags.some(t => t.toLowerCase().includes(mediaSearch.toLowerCase())))
    return matchCat && matchSchool && matchSearch
  })

  // Filtro de Competências / Habilidades BNCC (6ª Partição)
  const filteredCompetencies = competencies.filter(c => {
    const matchGrade = compGradeFilter === 'all' || c.gradeYear.toLowerCase().includes(compGradeFilter.toLowerCase())
    const matchAxis = compAxisFilter === 'all' || c.axis === compAxisFilter
    const searchLower = compSearch.toLowerCase().trim()
    const matchSearch = !searchLower ||
      c.code.toLowerCase().includes(searchLower) ||
      c.description.toLowerCase().includes(searchLower) ||
      (c.unit && c.unit.toLowerCase().includes(searchLower)) ||
      c.axis.toLowerCase().includes(searchLower)
    return matchGrade && matchAxis && matchSearch
  })

  // Handlers para Competências
  const handleSaveCompetency = () => {
    if (!compCode.trim() || !compDescription.trim()) {
      alert('Código e descrição da competência são obrigatórios.')
      return
    }
    let updated: BnccSkill[] = []
    if (editingComp) {
      updated = competencies.map(c => c.id === editingComp.id ? {
        ...c,
        code: compCode.trim().toUpperCase(),
        gradeYear: compGradeYear,
        axis: compAxis,
        description: compDescription.trim(),
        unit: compUnit.trim() || undefined,
        isCustom: true
      } : c)
    } else {
      const newComp: BnccSkill = {
        id: compCode.trim().toUpperCase(),
        code: compCode.trim().toUpperCase(),
        gradeYear: compGradeYear,
        axis: compAxis,
        description: compDescription.trim(),
        unit: compUnit.trim() || undefined,
        isCustom: true
      }
      updated = [newComp, ...competencies]
    }
    setCompetencies(updated)
    saveStoredBnccSkills(updated)
    setIsAddCompModalOpen(false)
    setEditingComp(null)
    setCompCode('')
    setCompDescription('')
    setCompUnit('')
    showToast('Competência salva no Repositório!')
  }

  const handleDeleteCompetency = (id: string) => {
    if (!confirm('Deseja realmente remover esta competência do repositório?')) return
    const updated = competencies.filter(c => c.id !== id)
    setCompetencies(updated)
    saveStoredBnccSkills(updated)
    showToast('Competência removida do Repositório!')
  }

  const btnPrimary: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 10, border: 'none',
    background: '#8b5e3c', color: '#fff',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
  }
  const btnSecondary: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 10,
    border: '1px solid rgba(139,115,85,0.35)',
    background: '#fffcf8', color: '#586e75', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(139,115,85,0.25)',
    fontSize: 13, outline: 'none', background: '#fffcf8', color: '#2c1a0e', boxSizing: 'border-box'
  }

  return (
    <ModuleShell
      title="📚 Biblioteca & Repositório Pedagógico"
      subtitle="Organização centralizada em 5 partições: Cabeçalhos Oficiais, Exercícios & Provas, Livros Didáticos RAG, Arquivos Avulsos e Banco de Imagens & Mídias."
      isFullHeight
      maxWidth="100%"
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {uploadingStatus && (
            <div style={{ background: '#fdf3e7', border: '1px solid #8b5e3c', color: '#8b5e3c', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-loader text-spin" /> {uploadingStatus}
            </div>
          )}

          {activePartition === 'headers' && (
            <input
              type="file"
              ref={headerFileInputRef}
              onChange={processHeaderFile}
              accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp,.docx,.doc,.pdf"
              style={{ display: 'none' }}
            />
          )}

          {activePartition === 'exercises' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'exam' }))} style={btnPrimary}>
                <i className="ti ti-file-text" /> Criar Nova Prova
              </button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'quick' }))} style={btnSecondary}>
                <i className="ti ti-sparkles" /> Criar Exercício Rápido
              </button>
            </div>
          )}

          {activePartition === 'bibliography' && (
            <>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.md,.json,.csv,.pdf,.docx,.doc" style={{ display: 'none' }} />
              <button onClick={() => fileInputRef.current?.click()} style={btnSecondary}>
                <i className="ti ti-upload" /> Importar Livro / Arquivo
              </button>
              <button onClick={() => { clearForm(); setMode('add') }} style={btnPrimary}>
                <i className="ti ti-plus" /> Adicionar Livro Manual
              </button>
            </>
          )}

          {activePartition === 'files' && (
            <>
              <input
                type="file"
                ref={looseFileInputRef}
                onChange={handleUploadLooseFile}
                accept=".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx,.pptx,.mp3,.wav"
                style={{ display: 'none' }}
              />
              <button onClick={() => looseFileInputRef.current?.click()} style={btnSecondary}>
                <i className="ti ti-upload" /> Importar Arquivo Avulso
              </button>
              <button onClick={() => { setNewLooseTitle(''); setNewLooseContent(''); setIsAddLooseModalOpen(true) }} style={btnPrimary}>
                <i className="ti ti-plus" /> Novo Arquivo Manual
              </button>
            </>
          )}

          {activePartition === 'images' && (
            <>
              <input
                type="file"
                ref={mediaFileInputRef}
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length === 0) return
                  setIsUploadingMedia(true)
                  try {
                    for (const file of files) {
                      const uploadRes = await uploadMediaFileToSupabase(file, 'library')
                      if (uploadRes.ok) {
                        const newItem: MediaLibraryItem = {
                          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                          title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
                          fileName: file.name,
                          fileType: file.type || 'image/png',
                          fileSize: file.size,
                          fileUrl: uploadRes.url,
                          category: 'Ilustrações Didáticas',
                          tags: ['#imagem', '#upload'],
                          schoolName: 'Geral',
                          description: '',
                          createdAt: new Date().toISOString()
                        }
                        await saveMediaItemToSupabase(newItem)
                        setMediaItems(prev => [newItem, ...prev.filter(x => x.id !== newItem.id)])
                      }
                    }
                    showToast(`${files.length} imagem(ns) adicionada(s) à biblioteca!`)
                  } catch (err: any) {
                    alert('Erro ao enviar imagem: ' + err.message)
                  } finally {
                    setIsUploadingMedia(false)
                    if (mediaFileInputRef.current) mediaFileInputRef.current.value = ''
                  }
                }}
                accept="image/*"
                multiple
                style={{ display: 'none' }}
              />
              <button 
                onClick={() => mediaFileInputRef.current?.click()} 
                disabled={isUploadingMedia}
                style={btnSecondary}
              >
                <i className={isUploadingMedia ? "ti ti-loader rotate" : "ti ti-upload"} /> 
                {isUploadingMedia ? 'Enviando...' : 'Upload de Imagens'}
              </button>
              <button onClick={() => { 
                setNewMediaTitle('')
                setNewMediaUrl('')
                setNewMediaTags('')
                setNewMediaDescription('')
                setIsAddMediaModalOpen(true) 
              }} style={btnPrimary}>
                <i className="ti ti-plus" /> Nova Mídia / URL
              </button>
            </>
          )}

          {activePartition === 'competencies' && (
            <button onClick={() => { 
              setEditingComp(null)
              setCompCode('')
              setCompDescription('')
              setCompUnit('')
              setCompGradeYear('9º Fund.')
              setCompAxis('Conhecimentos Linguísticos')
              setIsAddCompModalOpen(true) 
            }} style={btnPrimary}>
              <i className="ti ti-plus" /> Nova Competência / Habilidade
            </button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>

        {/* BARRA DE SELEÇÃO DAS 6 PARTIÇÕES */}
        <div style={{
          display: 'flex', gap: 8, background: '#fffcf8', padding: '6px',
          borderRadius: 14, border: '1.5px solid rgba(139,115,85,0.18)', width: 'fit-content',
          boxShadow: '0 2px 10px rgba(44,26,14,0.04)', flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setActivePartition('headers')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: activePartition === 'headers' ? '#8b5e3c' : 'transparent',
              color: activePartition === 'headers' ? '#fff' : '#665c54',
              fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s'
            }}
          >
            <i className="ti ti-id-badge" /> 1. Cabeçalho ({headerTemplates.length})
          </button>

          <button
            onClick={() => setActivePartition('exercises')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: activePartition === 'exercises' ? '#8b5e3c' : 'transparent',
              color: activePartition === 'exercises' ? '#fff' : '#665c54',
              fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s'
            }}
          >
            <i className="ti ti-file-certificate" /> 2. Exercícios & Provas ({savedExercises.length})
          </button>

          <button
            onClick={() => setActivePartition('bibliography')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: activePartition === 'bibliography' ? '#8b5e3c' : 'transparent',
              color: activePartition === 'bibliography' ? '#fff' : '#665c54',
              fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s'
            }}
          >
            <i className="ti ti-books" /> 3. Livros Didáticos ({items.length})
          </button>

          <button
            onClick={() => setActivePartition('files')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: activePartition === 'files' ? '#8b5e3c' : 'transparent',
              color: activePartition === 'files' ? '#fff' : '#665c54',
              fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s'
            }}
          >
            <i className="ti ti-folders" /> 4. Arquivos Avulsos ({looseFiles.length})
          </button>

          <button
            onClick={() => setActivePartition('images')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: activePartition === 'images' ? '#8b5e3c' : 'transparent',
              color: activePartition === 'images' ? '#fff' : '#665c54',
              fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s'
            }}
          >
            <i className="ti ti-photo" /> 5. Imagens & Mídias ({mediaItems.length})
          </button>

          <button
            onClick={() => setActivePartition('competencies')}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: activePartition === 'competencies' ? '#8b5e3c' : 'transparent',
              color: activePartition === 'competencies' ? '#fff' : '#665c54',
              fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s'
            }}
          >
            <i className="ti ti-target" /> 6. Competências BNCC ({competencies.length})
          </button>
        </div>

        {/* 
            PARTIÇÃO 1: CABEÇALHO (SIDEBAR UNIFICADA PARA ESCOLAS & UPLOAD)
        */}
        {activePartition === 'headers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
 <input
 type="file"
 ref={headerFileInputRef}
 onChange={processHeaderFile}
 accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp,.docx,.doc,.pdf"
 style={{ display: 'none' }}
 />

 <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 24, flex: 1, minHeight: 0 }}>
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.15)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
 <div>
 <div style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
 <i className="ti ti-building-community" style={{ color: '#8b5e3c', fontSize: 20 }} />
 <span>Gerenciar Cabeçalhos</span>
 </div>
 <p style={{ fontSize: 11.5, color: '#8b5e3c', margin: 0, lineHeight: 1.4 }}>
 Vincule cabeçalhos das escolas para aplicá-los em provas e exercícios.
 </p>
 </div>

 <div style={{ borderBottom: '1px solid #ede8dc' }} />

 <div style={{ background: '#fffcf8', border: '1.5px solid #8b5e3c', borderRadius: 12, padding: 14 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
 <label style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
 Escola Cadastrada:
 </label>
 <button
 onClick={() => window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'organization' }))}
 style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
 title="Gerenciar escolas na funcionalidade Escolas"
 >
 + Escolas
 </button>
 </div>

 {registeredSchools.length > 0 ? (
 <select
 value={selectedSchoolForUpload || (currentSelectedHeader?.name || registeredSchools[0]?.name || '')}
 onChange={e => {
 const schoolName = e.target.value
 setSelectedSchoolForUpload(schoolName)
 const found = headerTemplates.find(h => h.name.toLowerCase() === schoolName.toLowerCase())
 if (found) {
 setSelectedHeaderId(found.id)
 setIsEditingHeader(false)
 } else if (currentSelectedHeader) {
 linkHeaderToSchool(currentSelectedHeader.id, schoolName)
 }
 }}
 style={{
 width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(139,115,85,0.3)',
 fontSize: 13, fontWeight: 700, color: '#2c1a0e', background: '#fff', outline: 'none', cursor: 'pointer'
 }}
 >
 {registeredSchools.map(sch => (
 <option key={sch.id} value={sch.name}>{sch.name}</option>
 ))}
 </select>
 ) : (
 <div style={{ fontSize: 11.5, color: '#dc322f', fontWeight: 600 }}>
 Nenhuma escola cadastrada em Escolas.
 <button
 onClick={() => window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'organization' }))}
 style={{ display: 'block', marginTop: 4, background: 'none', border: 'none', color: '#8b5e3c', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }}
 >
 Cadastrar em Escolas
 </button>
 </div>
 )}
 </div>

 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
 <button
 onClick={() => headerFileInputRef.current?.click()}
 style={{
 ...btnPrimary,
 width: '100%',
 justifyContent: 'center',
 padding: '11px 14px',
 fontSize: 13,
 borderRadius: 10
 }}
 >
 <i className="ti ti-upload" /> Enviar Arquivo de Cabeçalho
 </button>
 <div style={{ fontSize: 10.5, color: '#8b5e3c', textAlign: 'center' }}>
 Formatos aceitos: PNG, JPEG, DOCX, PDF
 </div>
 </div>

 {currentSelectedHeader && (
 <div style={{ background: '#faf8f5', borderRadius: 12, border: '1px solid #ede8dc', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
 <div style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
 Ações do Cabeçalho
 </div>

 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
 {isEditingHeader ? (
 <button onClick={saveHeaderEdits} style={{ ...btnPrimary, flex: 1, padding: '8px 10px', fontSize: 12 }}>
 <i className="ti ti-check" /> Salvar Edições
 </button>
 ) : (
 <button onClick={startEditingHeader} style={{ ...btnSecondary, flex: 1, padding: '8px 10px', fontSize: 12 }}>
 <i className="ti ti-pencil" /> Editar Texto
 </button>
 )}

 <button
 onClick={() => {
 navigator.clipboard.writeText(`${currentSelectedHeader.officialName}\nDisciplina: ${currentSelectedHeader.subject}\nInstruções:\n${currentSelectedHeader.instructions}`)
 }}
 style={{ ...btnSecondary, padding: '8px 10px', fontSize: 12 }}
 title="Copiar texto do cabeçalho"
 >
 <i className="ti ti-copy" />
 </button>

 <button
 onClick={() => deleteSchoolHeader(currentSelectedHeader.id)}
 style={{ ...btnSecondary, borderColor: '#dc322f', color: '#dc322f', padding: '8px 10px', fontSize: 12 }}
 title="Excluir cabeçalho"
 >
 <i className="ti ti-trash" />
 </button>
 </div>

 {currentSelectedHeader.headerImageUrl && (
 <button
 onClick={() => {
 const updated = headerTemplates.map(h => h.id === currentSelectedHeader.id ? { ...h, headerImageUrl: undefined, isImageHeader: false } : h)
 setHeaderTemplates(updated)
 localStorage.setItem('teacher_custom_headers', JSON.stringify(updated))
 }}
 style={{ background: 'none', border: '1px solid #dc322f', color: '#dc322f', padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontWeight: 600, width: '100%', textAlign: 'center' }}
 >
 Remover Imagem Personalizada
 </button>
 )}
 </div>
 )}

 <div style={{ borderBottom: '1px solid #ede8dc', margin: '2px 0' }} />

 <div style={{ fontSize: 11.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
 Cabeçalhos Cadastrados ({headerTemplates.length})
 </div>

 {headerTemplates.length === 0 ? (
 <div style={{ fontSize: 12, color: '#8b5e3c', fontStyle: 'italic', padding: '6px 0' }}>
 Nenhum arquivo enviado ainda. Selecione a escola acima e clique em "Enviar Arquivo de Cabeçalho".
 </div>
 ) : (
 headerTemplates.map(tpl => (
 <div
 key={tpl.id}
 onClick={() => {
 setSelectedHeaderId(tpl.id);
 setSelectedSchoolForUpload(tpl.name);
 setIsEditingHeader(false);
 }}
 style={{
 padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
 background: selectedHeaderId === tpl.id ? '#fdf8f2' : '#faf8f5',
 border: selectedHeaderId === tpl.id ? '1.5px solid #8b5e3c' : '1px solid #ede8dc',
 transition: 'all 0.15s'
 }}
 >
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
 <i className="ti ti-building-community" style={{ color: '#8b5e3c', fontSize: 18 }} />
 <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>{tpl.name}</span>
 </div>
 <div style={{ fontSize: 11, color: '#586e75' }}>
 {tpl.officialName}
 </div>
 </div>
 ))
 )}
 </div>

 {currentSelectedHeader ? (
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.15)', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', boxShadow: '0 4px 20px rgba(44,26,14,0.06)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ede8dc', paddingBottom: 14 }}>
 <div>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, color: '#2c1a0e', margin: 0 }}>
 {currentSelectedHeader.name}
 </h2>
 <p style={{ fontSize: 12, color: '#8b5e3c', margin: '4px 0 0', fontWeight: 600 }}>
 {currentSelectedHeader.motto || 'Modelo Oficial Formatado para Folhas de Avaliação'}
 </p>
 </div>

 <div style={{ background: '#fdf8f2', border: '1px solid #8b5e3c', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'flex', alignItems: 'center', gap: 6 }}>
 <i className="ti ti-check" /> Vinculado a {currentSelectedHeader.name}
 </div>
 </div>

 <div style={{
 background: '#fffcf8', border: '2px solid #2c1a0e', borderRadius: 6,
 padding: '24px 28px', color: '#1a110a', fontFamily: "'Fraunces', Georgia, serif"
 }}>
 {currentSelectedHeader.headerImageUrl ? (
 <div style={{ textAlign: 'center', borderBottom: '2px solid #2c1a0e', paddingBottom: 16, marginBottom: 16 }}>
 <img
 src={currentSelectedHeader.headerImageUrl}
 alt={currentSelectedHeader.name}
 style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 4 }}
 />
 </div>
 ) : (
 <>
 <div style={{ textAlign: 'center', borderBottom: '2px solid #2c1a0e', paddingBottom: 12, marginBottom: 16 }}>
 {currentSelectedHeader.logoUrl && (
 <img src={currentSelectedHeader.logoUrl} alt="Logo Oficial" style={{ maxHeight: 70, maxWidth: 200, marginBottom: 8, objectFit: 'contain' }} />
 )}
 {isEditingHeader ? (
 <input
 value={editHeaderOfficialName}
 onChange={e => setEditHeaderOfficialName(e.target.value)}
 style={{ ...inputStyle, textAlign: 'center', fontWeight: 800, fontSize: 15 }}
 />
 ) : (
 <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
 {currentSelectedHeader.officialName}
 </div>
 )}
 </div>

 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 16 }}>
 <tbody>
 <tr>
 <td style={{ border: '1px solid #2c1a0e', padding: '6px 10px', width: '50%' }}>
 <strong>Disciplina:</strong>{' '}
 {isEditingHeader ? (
 <input
 value={editHeaderSubject}
 onChange={e => setEditHeaderSubject(e.target.value)}
 style={{ ...inputStyle, padding: '2px 6px', fontSize: 12, display: 'inline-block', width: '70%' }}
 />
 ) : (
 currentSelectedHeader.subject
 )}
 </td>
 <td style={{ border: '1px solid #2c1a0e', padding: '6px 10px', width: '25%' }}>
 <strong>Turma:</strong> ________
 </td>
 <td style={{ border: '1px solid #2c1a0e', padding: '6px 10px', width: '25%' }}>
 <strong>Data:</strong> ____/____/2026
 </td>
 </tr>
 <tr>
 <td style={{ border: '1px solid #2c1a0e', padding: '6px 10px' }}>
 <strong>Professor(a):</strong> ________________________
 </td>
 <td colSpan={2} style={{ border: '1px solid #2c1a0e', padding: '6px 10px' }}>
 <strong>Aluno(a):</strong> ____________________________________
 </td>
 </tr>
 <tr>
 <td style={{ border: '1px solid #2c1a0e', padding: '6px 10px' }}>
 <strong>Tipo de Avaliação:</strong> Prova Trimestral
 </td>
 <td style={{ border: '1px solid #2c1a0e', padding: '6px 10px' }}>
 <strong>Valor Total:</strong> {currentSelectedHeader.gradeMax || '10,0'} pts
 </td>
 <td style={{ border: '2px solid #8b5e3c', padding: '6px 10px', background: '#fdf8f2', textAlign: 'center' }}>
 <strong>Nota Obtida:</strong> ________
 </td>
 </tr>
 </tbody>
 </table>

 <div style={{ background: '#f5f0e8', padding: '10px 14px', borderRadius: 6, fontSize: 11.5, borderLeft: '4px solid #8b5e3c' }}>
 <strong style={{ display: 'block', marginBottom: 4 }}>Instruções Gerais de Preenchimento:</strong>
 {isEditingHeader ? (
 <textarea
 value={editHeaderInstructions}
 onChange={e => setEditHeaderInstructions(e.target.value)}
 rows={4}
 style={{ ...inputStyle, fontFamily: 'inherit', fontSize: 11.5 }}
 />
 ) : (
 <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: 11.5, color: '#333' }}>
 {currentSelectedHeader.instructions}
 </pre>
 )}
 </div>
 </>
 )}
 </div>
 </div>
 ) : (
 <div style={{ background: '#fffcf8', borderRadius: 16, border: '2px dashed #8b5e3c', padding: '60px 40px', textAlign: 'center', margin: 'auto 0' }}>
 <i className="ti ti-building-community" style={{ fontSize: 48, color: '#8b5e3c', marginBottom: 12, display: 'block' }} />
 <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, color: '#2c1a0e', margin: '0 0 8px' }}>
 Selecione ou envie um cabeçalho na barra lateral
 </h3>
 <p style={{ fontSize: 13, color: '#8b5e3c', maxWidth: 420, margin: '0 auto' }}>
 Escolha uma escola no menu lateral e envie o arquivo correspondente para visualizá-lo e vinculá-lo.
 </p>
 </div>
 )}
 </div>
 </div>
 )}


 {/* 
 PARTIÇÃO 2: EXERCÍCIOS & PROVAS SALVAS
 */}
 {activePartition === 'exercises' && (
 <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, flex: 1, minHeight: 0 }}>
 {/* Lista de Exercícios */}
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
 <div style={{ padding: '14px 16px', borderBottom: '1px solid #ede8dc' }}>
 <input
 placeholder="Buscar prova ou exercício..."
 value={exerciseSearch}
 onChange={e => setExerciseSearch(e.target.value)}
 style={{ ...inputStyle, marginBottom: 10 }}
 />
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
 {['all', 'exam', 'quick', 'workbook'].map(f => (
 <button
 key={f}
 onClick={() => setExerciseFilter(f)}
 style={{
 padding: '4px 9px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
 background: exerciseFilter === f ? '#8b5e3c' : '#f5efe6',
 color: exerciseFilter === f ? '#fff' : '#665c54',
 }}
 >
 {f === 'all' ? 'Todos' : f === 'exam' ? 'Provas' : f === 'quick' ? 'Exercícios' : 'Workbook'}
 </button>
 ))}
 </div>
 </div>

 <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
 {filteredExercises.length === 0 ? (
 <div style={{ padding: '30px 16px', textAlign: 'center', color: '#8b5e3c', fontSize: 12.5 }}>
 Nenhum exercício encontrado. Gere uma prova no <strong>ExamBuilder</strong> para salvar aqui automaticamente.
 </div>
 ) : filteredExercises.map(ex => (
 <div
 key={ex.id}
 onClick={() => setViewExercise(ex)}
 style={{
 padding: '12px 14px', borderRadius: 12, cursor: 'pointer', marginBottom: 6,
 background: viewExercise?.id === ex.id ? '#fdf8f2' : '#faf8f5',
 border: viewExercise?.id === ex.id ? '1.5px solid #8b5e3c' : '1px solid #ede8dc',
 transition: 'all 0.15s'
 }}
 >
 <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
 {ex.type === 'exam' ? ' ' : ex.type === 'quick' ? ' ' : ' '}
 {ex.title}
 </div>
 <div style={{ display: 'flex', gap: 6, fontSize: 10.5, color: '#586e75' }}>
 <span style={{ background: '#ede8dc', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{ex.cefr || 'B1'}</span>
 <span style={{ background: '#ede8dc', padding: '2px 6px', borderRadius: 4 }}>{ex.grade || '9º Ano'}</span>
 <span style={{ marginLeft: 'auto' }}>{ex.date}</span>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Visualizador & Ações do Exercício */}
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.15)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
 {viewExercise ? (
 <>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ede8dc', paddingBottom: 14 }}>
 <div>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, color: '#2c1a0e', margin: 0 }}>
 {viewExercise.title}
 </h2>
 <div style={{ fontSize: 12, color: '#8b5e3c', marginTop: 4 }}>
 Tópico: <strong>{viewExercise.topic || 'Inglês Geral'}</strong> · Nível CEFR: <strong>{viewExercise.cefr}</strong> · {viewExercise.date}
 </div>
 </div>

 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
 <button
 onClick={() => exportToPdf({
 schoolName: currentSelectedHeader?.officialName || viewExercise.school || 'COLÉGIO & ESCOLA DE ENSINO',
 teacherName: currentSelectedHeader?.teacherName || headerTeacher || 'Professor(a)',
 className: viewExercise.grade || headerClassGroup || '9º Ano',
 title: viewExercise.title,
 content: viewExercise.content,
 headerImageUrl: currentSelectedHeader?.headerImageUrl,
 instructions: currentSelectedHeader?.instructions
 })}
 style={btnPrimary}
 >
 Exportar PDF Oficial
 </button>

 <button
 onClick={() => exportToWord({
 schoolName: currentSelectedHeader?.officialName || viewExercise.school || 'COLÉGIO & ESCOLA DE ENSINO',
 teacherName: currentSelectedHeader?.teacherName || headerTeacher || 'Professor(a)',
 className: viewExercise.grade || headerClassGroup || '9º Ano',
 title: viewExercise.title,
 content: viewExercise.content,
 headerImageUrl: currentSelectedHeader?.headerImageUrl,
 instructions: currentSelectedHeader?.instructions
 })}
 style={btnSecondary}
 >
 Word (.docx)
 </button>

 <button
 onClick={() => setShowOnlinePlayer(true)}
 style={{ ...btnSecondary, borderColor: '#2aa198', color: '#2aa198' }}
 >
 Responder Online
 </button>

 <button
 onClick={() => setShowQrModal(true)}
 style={{ ...btnSecondary, borderColor: '#8b5e3c', color: '#8b5e3c' }}
 >
 QR Code Aluno
 </button>

 <button
 onClick={() => deleteExercise(viewExercise.id)}
 style={{ ...btnSecondary, borderColor: '#dc322f', color: '#dc322f' }}
 >
 Excluir
 </button>
 </div>
 </div>

 {/* Conteúdo Renderizado da Prova/Exercício */}
 <div
 style={{
 background: '#fffcf8', border: '1px solid #ede8dc', borderRadius: 12,
 padding: '24px 28px', color: '#2c1a0e', lineHeight: 1.7, fontSize: 13.5
 }}
 dangerouslySetInnerHTML={{ __html: viewExercise.content }}
 />
 </>
 ) : (
 <div style={{ padding: 40, textAlign: 'center', color: '#8b5e3c' }}>
 Selecione um exercício ou prova ao lado para visualizar e exportar.
 </div>
 )}
 </div>
 </div>
 )}


 {/* 
 PARTIÇÃO 3: BIBLIOGRAFIA (LIVROS DIDÁTICOS & RAG)
 */}
 {activePartition === 'bibliography' && (
 <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, flex: 1, minHeight: 0 }}>
 {/* Lista de Livros e Artigos Bibliográficos */}
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
 <div style={{ padding: '14px 16px', borderBottom: '1px solid #ede8dc' }}>
 <input
 placeholder="Buscar na bibliografia..."
 value={searchText}
 onChange={e => setSearchText(e.target.value)}
 style={{ ...inputStyle, marginBottom: 10 }}
 />
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
 {['all', "Student's Book", 'Workbook', 'Reference Book', 'CLIL Book'].map(f => (
 <button
 key={f}
 onClick={() => setActiveFilter(f)}
 style={{
 padding: '4px 9px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
 background: activeFilter === f ? '#8b5e3c' : '#f5efe6',
 color: activeFilter === f ? '#fff' : '#665c54',
 }}
 >
 {f === 'all' ? 'Todos' : f.replace(' Book', '')}
 </button>
 ))}
 </div>
 </div>

 <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
 {filteredBibliography.map(item => (
 <div
 key={item.id}
 onClick={() => { setViewItem(item); setMode('view') }}
 style={{
 padding: '12px 14px', borderRadius: 12, cursor: 'pointer', marginBottom: 6,
 background: viewItem?.id === item.id ? '#fdf8f2' : '#faf8f5',
 border: viewItem?.id === item.id ? '1.5px solid #8b5e3c' : '1px solid #ede8dc',
 transition: 'all 0.15s'
 }}
 >
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
 <span style={{ fontSize: 18 }}>{typeIcon(item.type)}</span>
 <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>{item.title}</span>
 </div>
 <div style={{ display: 'flex', gap: 6, fontSize: 11, color: '#586e75' }}>
 <span>{item.wordCount?.toLocaleString() || 0} palavras</span> ·
 <span>{item.category || 'Material RAG'}</span>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Leitor Profissional do Livro / Artigo */}
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.15)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
 {mode === 'add' || mode === 'edit' ? (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 <h3 style={{ margin: 0, color: '#8b5e3c' }}>{mode === 'add' ? 'Adicionar Novo Livro/Material' : 'Editar Material'}</h3>
 <input placeholder="Título do Livro/Capítulo..." value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
 <textarea placeholder="Cole aqui o texto completo do livro ou capítulo..." value={editContent} onChange={e => setEditContent(e.target.value)} rows={16} style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} />
 <div style={{ display: 'flex', gap: 10 }}>
 <button onClick={mode === 'add' ? addItem : saveEdit} style={btnPrimary}>Salvar na Bibliografia</button>
 <button onClick={() => setMode('view')} style={btnSecondary}>Cancelar</button>
 </div>
 </div>
 ) : viewItem ? (
 <>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ede8dc', paddingBottom: 14 }}>
 <div>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, color: '#2c1a0e', margin: 0 }}>{viewItem.title}</h2>
 <div style={{ fontSize: 12, color: '#8b5e3c', marginTop: 4 }}>
 {viewItem.wordCount?.toLocaleString()} palavras · Indexado no Motor RAG
 </div>
 </div>
 <div style={{ display: 'flex', gap: 8 }}>
 <button onClick={() => startEdit(viewItem)} style={btnSecondary}>
 <i className="ti ti-edit" /> Editar
 </button>
 <button onClick={() => deleteItem(viewItem.id)} style={{ ...btnSecondary, color: '#dc322f' }}>
 <i className="ti ti-trash" /> Excluir
 </button>
 </div>
 </div>

 {/* Leitor de Texto */}
 <div style={{
 background: readerTheme === 'sepia' ? '#fdf8f2' : readerTheme === 'paper' ? '#ffffff' : '#1e1e1e',
 color: readerTheme === 'dark' ? '#fdf8f2' : '#2c1a0e',
 padding: '24px 28px', borderRadius: 12, border: '1px solid #ede8dc',
 fontFamily: readerFontFamily, fontSize: readerFontSize, lineHeight: 1.8
 }}>
 {formatContent(viewItem.content)}
 </div>
 </>
 ) : (
 <div style={{ padding: 40, textAlign: 'center', color: '#8b5e3c' }}>
 Selecione um livro ou material didático ao lado.
 </div>
 )}
 </div>
 </div>
 )}

 {/* 
 PARTIÇÃO 4: ARQUIVOS AVULSOS (DOCUMENTOS, PDFS, DOCX, SLIDES, IMAGENS, ÁUDIOS)
 */}
 {activePartition === 'files' && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
 {/* Barra de Filtros e Busca */}
 <div style={{ background: '#fff', padding: '14px 20px', borderRadius: 16, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
 {[
 { key: 'all', label: `Todos (${looseFiles.length})` },
 { key: 'Atividade Complementar', label: 'Atividades' },
 { key: 'Artigo / Texto', label: 'Artigos / Leituras' },
 { key: 'Lista de Vocabulário', label: 'Vocabulário' },
 { key: 'Handout / Ficha', label: 'Handouts & Fichas' },
 { key: 'Slide / Apresentação', label: 'Slides' },
 { key: 'image', label: 'Infográficos & Imagens' },
 { key: 'audio', label: 'Áudios de Aula' },
 ].map(tab => (
 <button
 key={tab.key}
 onClick={() => setLooseFileFilter(tab.key)}
 style={{
 padding: '7px 14px', borderRadius: 9, border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
 background: looseFileFilter === tab.key ? '#8b5e3c' : '#f5efe6',
 color: looseFileFilter === tab.key ? '#fff' : '#665c54',
 transition: 'all 0.15s'
 }}
 >
 {tab.label}
 </button>
 ))}
 </div>

 <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
 <input
 type="text"
 placeholder="🔍 Buscar por nome, conteúdo ou tag..."
 value={looseFileSearch}
 onChange={e => setLooseFileSearch(e.target.value)}
 style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none', minWidth: 260 }}
 />
 </div>
 </div>

 {/* Split View: Lista de Arquivos (Esquerda) e Preview / Ações (Direita) */}
 <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20, flex: 1, minHeight: 0 }}>
 {/* Coluna Esquerda: Cartões de Arquivos */}
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.15)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
 {filteredLooseFiles.length === 0 ? (
 <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8b5e3c' }}>
 <i className="ti ti-folder-off" style={{ fontSize: 36, opacity: 0.5, display: 'block', marginBottom: 10 }} />
 <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Nenhum arquivo avulso encontrado.</p>
 <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.8 }}>Clique em "Importar Arquivo Avulso" para adicionar PDFs, DOCXs, apresentações ou listas.</p>
 </div>
 ) : (
 filteredLooseFiles.map(file => {
 const isSelected = selectedLooseFile?.id === file.id
 const isPdf = file.fileType === 'pdf'
 const isDocx = file.fileType === 'docx'
 const isImg = file.fileType === 'image'
 const isAudio = file.fileType === 'audio'
 const isSlide = file.fileType === 'slide'

 const iconColor = isPdf ? '#dc2626' : isDocx ? '#2563eb' : isImg ? '#059669' : isAudio ? '#7c3aed' : isSlide ? '#ea580c' : '#8b5e3c'
 const iconName = isPdf ? 'ti ti-file-type-pdf' : isDocx ? 'ti ti-file-type-docx' : isImg ? 'ti ti-photo' : isAudio ? 'ti ti-volume' : isSlide ? 'ti ti-presentation' : 'ti ti-file-text'

 return (
 <div
 key={file.id}
 onClick={() => setSelectedLooseFile(file)}
 style={{
 padding: 14, borderRadius: 14, cursor: 'pointer',
 background: isSelected ? '#fdf8f2' : '#faf8f5',
 border: isSelected ? '2px solid #8b5e3c' : '1px solid #ede8dc',
 boxShadow: isSelected ? '0 4px 14px rgba(139,94,60,0.12)' : 'none',
 display: 'flex', flexDirection: 'column', gap: 8,
 transition: 'all 0.15s'
 }}
 >
 <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
 <div style={{ width: 36, height: 36, borderRadius: 10, background: `${iconColor}15`, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
 <i className={iconName} />
 </div>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c1a0e', lineHeight: 1.3, wordBreak: 'break-word' }}>
 {file.title}
 </div>
 <div style={{ fontSize: 11, color: '#8b5e3c', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
 <span style={{ fontWeight: 600 }}>{file.category}</span>
 {file.school && <span>· {file.school}</span>}
 </div>
 </div>
 </div>

 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#586e75', borderTop: '1px dashed #ede8dc', paddingTop: 6 }}>
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
 {file.tags && file.tags.slice(0, 3).map(tag => (
 <span key={tag} style={{ background: '#eee8d5', color: '#073642', padding: '1px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>
 {tag}
 </span>
 ))}
 </div>
 <span style={{ fontSize: 10.5, fontWeight: 600 }}>
 {file.fileSize ? `${(file.fileSize / 1024).toFixed(0)} KB` : 'Texto'} · {file.date}
 </span>
 </div>
 </div>
 )
 })
 )}
 </div>

 {/* Coluna Direita: Detalhes, Ações e Preview do Arquivo Selecionado */}
 <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(139,115,85,0.15)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
 {selectedLooseFile ? (
 <>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #ede8dc', paddingBottom: 16, gap: 16, flexWrap: 'wrap' }}>
 <div style={{ flex: 1, minWidth: 280 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
 <span style={{ background: '#8b5e3c', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
 {selectedLooseFile.fileType.toUpperCase()}
 </span>
 <span style={{ fontSize: 12, fontWeight: 600, color: '#586e75' }}>
 {selectedLooseFile.category} {selectedLooseFile.school ? `· ${selectedLooseFile.school}` : ''}
 </span>
 </div>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, color: '#2c1a0e', margin: 0 }}>
 {selectedLooseFile.title}
 </h2>
 <div style={{ fontSize: 12, color: '#8b5e3c', marginTop: 4 }}>
 Nome do Arquivo: <strong>{selectedLooseFile.fileName}</strong> · Adicionado em {selectedLooseFile.date} · Sincronizado no Supabase Cloud
 </div>
 </div>

 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
 {selectedLooseFile.fileDataUrl && (
 <a
 href={selectedLooseFile.fileDataUrl}
 download={selectedLooseFile.fileName}
 style={{ ...btnSecondary, textDecoration: 'none', color: '#8b5e3c' }}
 >
 <i className="ti ti-download" /> Baixar Arquivo
 </a>
 )}

 <button
 onClick={() => {
 localStorage.setItem('teacher_exam_seed_text', selectedLooseFile.extractedText)
 window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'exam' }))
 }}
 style={{ ...btnPrimary, background: '#16a34a' }}
 title="Criar Prova ou Lista de Exercícios usando este material"
 >
 <i className="ti ti-sparkles" /> Gerar Prova com Este Arquivo
 </button>

 <button
 onClick={() => {
 navigator.clipboard.writeText(selectedLooseFile.extractedText)
 showToast('Texto copiado para a área de transferência!')
 }}
 style={btnSecondary}
 >
 <i className="ti ti-copy" /> Copiar Texto
 </button>

 <button
 onClick={() => handleDeleteLooseFile(selectedLooseFile.id)}
 style={{ ...btnSecondary, color: '#dc322f' }}
 >
 <i className="ti ti-trash" /> Excluir
 </button>
 </div>
 </div>

 {/* Preview Especial por Tipo de Arquivo */}
 {selectedLooseFile.fileType === 'image' && selectedLooseFile.fileDataUrl && (
 <div style={{ background: '#f5efe6', padding: 14, borderRadius: 12, textAlign: 'center', border: '1px solid #ede8dc' }}>
 <img src={selectedLooseFile.fileDataUrl} alt={selectedLooseFile.title} style={{ maxWidth: '100%', maxHeight: 340, borderRadius: 8, objectFit: 'contain' }} />
 </div>
 )}

 {selectedLooseFile.fileType === 'audio' && selectedLooseFile.fileDataUrl && (
 <div style={{ background: '#f5efe6', padding: 16, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
 <i className="ti ti-volume" style={{ fontSize: 28, color: '#7c3aed' }} />
 <audio controls src={selectedLooseFile.fileDataUrl} style={{ width: '100%' }} />
 </div>
 )}

 {/* Conteúdo Extraído / Leitor de Texto */}
 <div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
 <h4 style={{ fontSize: 13, fontWeight: 800, color: '#8b5e3c', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
 📄 Conteúdo Indexado (Pronto para o Motor RAG & IA da Rafinha)
 </h4>
 <span style={{ fontSize: 11.5, color: '#586e75', fontWeight: 600 }}>
 {selectedLooseFile.extractedText ? `${selectedLooseFile.extractedText.trim().split(/\s+/).length} palavras` : 'Sem texto extraído'}
 </span>
 </div>

 <div style={{
 background: '#fdf8f2', color: '#2c1a0e', padding: 22, borderRadius: 12, border: '1px solid #ede8dc',
 fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 420, overflowY: 'auto'
 }}>
 {selectedLooseFile.extractedText || 'Nenhum texto pôde ser extraído deste arquivo.'}
 </div>
 </div>
 </>
 ) : (
 <div style={{ padding: 60, textAlign: 'center', color: '#8b5e3c' }}>
 <i className="ti ti-folders" style={{ fontSize: 48, opacity: 0.4, display: 'block', marginBottom: 12 }} />
 <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>Selecione um arquivo avulso ao lado para visualizar e gerar atividades.</p>
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {/* ================================================================= */}
 {/* PARTIÇÃO 5: BANCO DE IMAGENS & MÍDIAS DIDÁTICAS                  */}
 {/* ================================================================= */}
 {activePartition === 'images' && (
   <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
     {/* BARRA DE PESQUISA, FILTROS E AÇÕES */}
     <div style={{
       display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
       background: '#fffcf8', padding: '12px 16px', borderRadius: 14,
       border: '1.5px solid rgba(139,115,85,0.18)', boxShadow: '0 2px 8px rgba(44,26,14,0.03)'
     }}>
       {/* Campo de Busca */}
       <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
         <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b7355', fontSize: 16 }} />
         <input
           type="text"
           placeholder="Pesquisar por título, tag (#mapa) ou descrição..."
           value={mediaSearch}
           onChange={e => setMediaSearch(e.target.value)}
           style={{
             width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10,
             border: '1.5px solid rgba(139,115,85,0.22)', background: '#fff',
             fontSize: 13, color: '#2c1a0e', outline: 'none'
           }}
         />
       </div>

       {/* Filtro por Escola */}
       <select
         value={mediaSchoolFilter}
         onChange={e => setMediaSchoolFilter(e.target.value)}
         style={{
           padding: '9px 14px', borderRadius: 10, border: '1.5px solid rgba(139,115,85,0.22)',
           background: '#fff', fontSize: 13, color: '#2c1a0e', fontWeight: 600, outline: 'none'
         }}
       >
         <option value="all">🏫 Todas as Escolas</option>
         {registeredSchools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
       </select>

       {/* Contador */}
       <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8b7355', display: 'flex', alignItems: 'center', gap: 6 }}>
         <i className="ti ti-photo" />
         <span>{filteredMediaItems.length} imagem(ns)</span>
       </div>
     </div>

     {/* Categorias / Tags Rápidas */}
     <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
       {[
         { key: 'all', label: 'Todas as Categorias', icon: 'ti-apps' },
         { key: 'Ilustrações Didáticas', label: '🎨 Ilustrações', icon: 'ti-brush' },
         { key: 'Mapas & Gráficos', label: '🗺️ Mapas & Gráficos', icon: 'ti-map' },
         { key: 'Logos & Selos', label: '🏫 Logos Escolares', icon: 'ti-id' },
         { key: 'Questões & Exercícios', label: '📝 Imagens p/ Questões', icon: 'ti-help' },
         { key: 'Diagramas Científicos', label: '🔬 Diagramas & Ciência', icon: 'ti-atom' },
         { key: 'Geral', label: '📁 Geral', icon: 'ti-folder' }
       ].map(cat => (
         <button
           key={cat.key}
           onClick={() => setMediaCategoryFilter(cat.key)}
           style={{
             padding: '6px 14px', borderRadius: 20, border: 'none',
             fontSize: 12, fontWeight: 700, cursor: 'pointer',
             background: mediaCategoryFilter === cat.key ? '#8b5e3c' : '#f5efe6',
             color: mediaCategoryFilter === cat.key ? '#fff' : '#665c54',
             display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
             transition: 'all 0.15s'
           }}
         >
           <i className={`ti ${cat.icon}`} />
           {cat.label}
         </button>
       ))}
     </div>

     {/* GRADE DE IMAGENS OU ESTADO VAZIO */}
     {filteredMediaItems.length === 0 ? (
       <div style={{
         flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
         background: '#fffcf8', borderRadius: 16, border: '2px dashed rgba(139,115,85,0.25)', padding: 40, textAlign: 'center'
       }}>
         <div style={{ fontSize: 48, marginBottom: 12 }}>🖼️</div>
         <h3 style={{ margin: '0 0 6px', color: '#2c1a0e', fontSize: 17, fontWeight: 800 }}>
           Nenhuma imagem cadastrada
         </h3>
         <p style={{ margin: '0 0 20px', color: '#665c54', fontSize: 13, maxWidth: 460 }}>
           Faça upload de figuras didáticas, ilustrações, gráficos ou logotipos para salvar na nuvem e reutilizar facilmente em provas, aulas e documentos.
         </p>
         <div style={{ display: 'flex', gap: 10 }}>
           <button 
             onClick={() => mediaFileInputRef.current?.click()} 
             style={{ ...btnPrimary, padding: '10px 24px', fontSize: 14 }}
           >
             <i className="ti ti-upload" /> Fazer Upload de Imagens
           </button>
           <button 
             onClick={() => {
               setNewMediaTitle('')
               setNewMediaUrl('')
               setNewMediaTags('')
               setNewMediaDescription('')
               setIsAddMediaModalOpen(true)
             }} 
             style={{ ...btnSecondary, padding: '10px 20px', fontSize: 14 }}
           >
             <i className="ti ti-link" /> Adicionar via Link URL
           </button>
         </div>
       </div>
     ) : (
       <div style={{
         display: 'grid',
         gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
         gap: 16,
         overflowY: 'auto',
         paddingRight: 4,
         paddingBottom: 20
       }}>
         {filteredMediaItems.map(item => (
           <div
             key={item.id}
             style={{
               background: '#fffcf8',
               borderRadius: 14,
               border: '1.5px solid rgba(139,115,85,0.18)',
               boxShadow: '0 3px 12px rgba(44,26,14,0.05)',
               display: 'flex',
               flexDirection: 'column',
               overflow: 'hidden',
               transition: 'transform 0.15s, box-shadow 0.15s'
             }}
           >
             {/* Imagem Container com Preview */}
             <div 
               onClick={() => setSelectedMediaModal(item)}
               style={{
                 position: 'relative',
                 height: 160,
                 background: '#f7f2ea',
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 overflow: 'hidden'
               }}
             >
               <img
                 src={item.fileUrl}
                 alt={item.title}
                 style={{
                   width: '100%',
                   height: '100%',
                   objectFit: 'contain',
                   padding: 6,
                   transition: 'transform 0.2s'
                 }}
               />
               {/* Badge de Categoria */}
               <span style={{
                 position: 'absolute', top: 8, left: 8,
                 background: 'rgba(44,26,14,0.82)', backdropFilter: 'blur(4px)',
                 color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6
               }}>
                 {item.category || 'Geral'}
               </span>
             </div>

             {/* Conteúdo do Card */}
             <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                 <div style={{ fontWeight: 800, fontSize: 13.5, color: '#2c1a0e', lineHeight: 1.3, wordBreak: 'break-word' }}>
                   {item.title}
                 </div>
               </div>

               {item.description && (
                 <p style={{ fontSize: 11.5, color: '#665c54', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                   {item.description}
                 </p>
               )}

               {/* Tags */}
               {item.tags && item.tags.length > 0 && (
                 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                   {item.tags.slice(0, 3).map((t, idx) => (
                     <span key={idx} style={{ fontSize: 10, background: '#f5efe6', color: '#8b5e3c', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                       {t}
                     </span>
                   ))}
                 </div>
               )}

               {/* Metadados adicionais */}
               <div style={{ fontSize: 11, color: '#8b7355', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(139,115,85,0.12)' }}>
                 <span>{item.schoolName || 'Geral'}</span>
                 {item.fileSize ? <span>{(item.fileSize / 1024).toFixed(0)} KB</span> : null}
               </div>

               {/* Barra de Ações Rápidas */}
               <div style={{ display: 'flex', gap: 6, marginTop: 6, paddingTop: 4 }}>
                 <button
                   onClick={() => {
                     const markdownTag = `![${item.title}](${item.fileUrl})`
                     navigator.clipboard.writeText(markdownTag)
                     showToast('Tag Markdown copiada para a área de transferência!')
                   }}
                   title="Copiar Tag Markdown / Link"
                   style={{
                     flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(139,115,85,0.25)',
                     background: '#fdfbf7', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700,
                     cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                   }}
                 >
                   <i className="ti ti-copy" /> Copiar Tag
                 </button>

                 <button
                   onClick={() => setSelectedMediaModal(item)}
                   title="Visualizar Detalhes"
                   style={{
                     padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(139,115,85,0.25)',
                     background: '#fdfbf7', color: '#665c54', fontSize: 12, cursor: 'pointer'
                   }}
                 >
                   <i className="ti ti-eye" />
                 </button>

                 <button
                   onClick={() => {
                     setEditingMediaModal(item)
                     setNewMediaTitle(item.title)
                     setNewMediaCategory(item.category || 'Ilustrações Didáticas')
                     setNewMediaSchool(item.schoolName || '')
                     setNewMediaTags(item.tags ? item.tags.join(', ') : '')
                     setNewMediaDescription(item.description || '')
                   }}
                   title="Editar Informações"
                   style={{
                     padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(139,115,85,0.25)',
                     background: '#fdfbf7', color: '#665c54', fontSize: 12, cursor: 'pointer'
                   }}
                 >
                   <i className="ti ti-edit" />
                 </button>

                 <button
                   onClick={async () => {
                     if (confirm(`Deseja excluir permanentemente a imagem "${item.title}"?`)) {
                       await deleteMediaItemFromSupabase(item.id, item.fileUrl)
                       setMediaItems(prev => prev.filter(x => x.id !== item.id))
                       showToast('Imagem removida!')
                     }
                   }}
                   title="Excluir Imagem"
                   style={{
                     padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(220,53,69,0.2)',
                     background: '#fff5f5', color: '#dc3545', fontSize: 12, cursor: 'pointer'
                   }}
                 >
                   <i className="ti ti-trash" />
                 </button>
               </div>
             </div>
           </div>
         ))}
       </div>
     )}
   </div>
 )}

</div>

{/* ================================================================= */}
{/* MODAIS DO BANCO DE IMAGENS & MÍDIAS                               */}
{/* ================================================================= */}

{/* 1. Modal Visualizar Imagem em Detalhe */}
{selectedMediaModal && (
 <div style={{
   position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
 }}>
   <div style={{
     background: '#fffcf8', borderRadius: 20, border: '2px solid #8b5e3c', padding: 24,
     maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto',
     boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 16
   }}>
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
         <span style={{ fontSize: 24 }}>🖼️</span>
         <div>
           <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
             {selectedMediaModal.title}
           </h3>
           <span style={{ fontSize: 12, color: '#8b7355' }}>
             {selectedMediaModal.category} • {selectedMediaModal.schoolName || 'Geral'}
           </span>
         </div>
       </div>
       <button 
         onClick={() => setSelectedMediaModal(null)} 
         style={{ background: '#f5efe6', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}
       >
         ×
       </button>
     </div>

     {/* Imagem Ampliada */}
     <div style={{
       background: '#f7f2ea', borderRadius: 12, border: '1px solid rgba(139,115,85,0.2)',
       padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: 380, overflow: 'hidden'
     }}>
       <img
         src={selectedMediaModal.fileUrl}
         alt={selectedMediaModal.title}
         style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 8 }}
       />
     </div>

     {/* Metadados e Descrição */}
     {selectedMediaModal.description && (
       <p style={{ fontSize: 13, color: '#586e75', margin: 0, background: '#fcf8f2', padding: 12, borderRadius: 10, border: '1px solid rgba(139,115,85,0.15)' }}>
         {selectedMediaModal.description}
       </p>
     )}

     {/* Ações e Tags de Cópia */}
     <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
       <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>Copiar para Documentos:</label>
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
         <button
           onClick={() => {
             navigator.clipboard.writeText(`![${selectedMediaModal.title}](${selectedMediaModal.fileUrl})`)
             showToast('Tag Markdown copiada!')
           }}
           style={{ ...btnSecondary, justifyContent: 'center', fontSize: 12 }}
         >
           <i className="ti ti-markdown" /> Copiar Markdown
         </button>
         <button
           onClick={() => {
             navigator.clipboard.writeText(`<img src="${selectedMediaModal.fileUrl}" alt="${selectedMediaModal.title}" style="max-width:100%; height:auto;" />`)
             showToast('Tag HTML copiada!')
           }}
           style={{ ...btnSecondary, justifyContent: 'center', fontSize: 12 }}
         >
           <i className="ti ti-code" /> Copiar HTML
         </button>
       </div>
     </div>

     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
       <a
         href={selectedMediaModal.fileUrl}
         target="_blank"
         rel="noreferrer"
         download={selectedMediaModal.fileName || 'imagem.png'}
         style={{ ...btnSecondary, textDecoration: 'none' }}
       >
         <i className="ti ti-download" /> Abrir / Baixar Arquivo
       </a>
       <button onClick={() => setSelectedMediaModal(null)} style={btnPrimary}>
         Fechar
       </button>
     </div>
   </div>
 </div>
)}

{/* 2. Modal Adicionar Nova Imagem / URL */}
{isAddMediaModalOpen && (
 <div style={{
   position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
 }}>
   <div style={{
     background: '#fffcf8', borderRadius: 20, border: '2px solid #8b5e3c', padding: 26,
     maxWidth: 580, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
     display: 'flex', flexDirection: 'column', gap: 16
   }}>
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
         <span style={{ fontSize: 24 }}>🖼️</span>
         <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
           Adicionar Imagem à Biblioteca
         </h3>
       </div>
       <button 
         onClick={() => setIsAddMediaModalOpen(false)} 
         style={{ background: '#f5efe6', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}
       >
         ×
       </button>
     </div>

     <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
       <div>
         <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Título da Imagem / Figura *</label>
         <input 
           value={newMediaTitle} 
           onChange={e => setNewMediaTitle(e.target.value)} 
           placeholder="Ex: Mapa da América do Sul, Diagrama da Célula Animal..." 
           style={inputStyle} 
         />
       </div>

       <div>
         <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>URL da Imagem (Link Direto)</label>
         <input 
           value={newMediaUrl} 
           onChange={e => setNewMediaUrl(e.target.value)} 
           placeholder="https://exemplo.com/imagem.png ou deixe em branco para fazer upload" 
           style={inputStyle} 
         />
       </div>

       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
         <div>
           <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Categoria Pedagógica</label>
           <select value={newMediaCategory} onChange={e => setNewMediaCategory(e.target.value)} style={inputStyle}>
             <option value="Ilustrações Didáticas">🎨 Ilustrações Didáticas</option>
             <option value="Mapas & Gráficos">🗺️ Mapas & Gráficos</option>
             <option value="Logos & Selos">🏫 Logos & Selos</option>
             <option value="Questões & Exercícios">📝 Questões & Exercícios</option>
             <option value="Diagramas Científicos">🔬 Diagramas Científicos</option>
             <option value="Geral">📁 Geral</option>
           </select>
         </div>

         <div>
           <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Escola Associada</label>
           <select value={newMediaSchool} onChange={e => setNewMediaSchool(e.target.value)} style={inputStyle}>
             <option value="">Geral / Todas</option>
             {registeredSchools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
           </select>
         </div>
       </div>

       <div>
         <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Tags (separadas por vírgula)</label>
         <input 
           value={newMediaTags} 
           onChange={e => setNewMediaTags(e.target.value)} 
           placeholder="#geografia, #9ano, #avaliacao, #mapa" 
           style={inputStyle} 
         />
       </div>

       <div>
         <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Descrição / Legenda Pedagógica</label>
         <textarea 
           value={newMediaDescription} 
           onChange={e => setNewMediaDescription(e.target.value)} 
           placeholder="Informações para orientar a atividade ou questão..." 
           rows={3} 
           style={{ ...inputStyle, fontFamily: 'inherit' }} 
         />
       </div>
     </div>

     <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
       <button onClick={() => setIsAddMediaModalOpen(false)} style={btnSecondary}>Cancelar</button>
       <button
         onClick={async () => {
           if (!newMediaTitle.trim()) {
             alert('Informe o título da imagem.')
             return
           }
           if (!newMediaUrl.trim()) {
             alert('Informe a URL da imagem ou utilize o botão "Upload de Imagens" para arquivos locais.')
             return
           }

           const tagList = newMediaTags.split(',').map(t => t.trim()).filter(Boolean)
           const item: MediaLibraryItem = {
             id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
             title: newMediaTitle.trim(),
             fileUrl: newMediaUrl.trim(),
             fileType: 'image/url',
             category: newMediaCategory,
             tags: tagList.length > 0 ? tagList : ['#imagem'],
             schoolName: newMediaSchool || 'Geral',
             description: newMediaDescription.trim(),
             createdAt: new Date().toISOString()
           }

           await saveMediaItemToSupabase(item)
           setMediaItems(prev => [item, ...prev.filter(x => x.id !== item.id)])
           setIsAddMediaModalOpen(false)
           showToast('Imagem adicionada com sucesso!')
         }}
         style={btnPrimary}
       >
         Salvar Imagem
       </button>
     </div>
   </div>
 </div>
)}

{/* 3. Modal Editar Informações da Imagem */}
{editingMediaModal && (
 <div style={{
   position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
 }}>
   <div style={{
     background: '#fffcf8', borderRadius: 20, border: '2px solid #8b5e3c', padding: 26,
     maxWidth: 580, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
     display: 'flex', flexDirection: 'column', gap: 16
   }}>
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
         <span style={{ fontSize: 24 }}>✏️</span>
         <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
           Editar Dados da Imagem
         </h3>
       </div>
       <button 
         onClick={() => setEditingMediaModal(null)} 
         style={{ background: '#f5efe6', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}
       >
         ×
       </button>
     </div>

     <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
       <div>
         <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Título da Imagem *</label>
         <input 
           value={newMediaTitle} 
           onChange={e => setNewMediaTitle(e.target.value)} 
           style={inputStyle} 
         />
       </div>

       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
         <div>
           <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Categoria</label>
           <select value={newMediaCategory} onChange={e => setNewMediaCategory(e.target.value)} style={inputStyle}>
             <option value="Ilustrações Didáticas">🎨 Ilustrações Didáticas</option>
             <option value="Mapas & Gráficos">🗺️ Mapas & Gráficos</option>
             <option value="Logos & Selos">🏫 Logos & Selos</option>
             <option value="Questões & Exercícios">📝 Questões & Exercícios</option>
             <option value="Diagramas Científicos">🔬 Diagramas Científicos</option>
             <option value="Geral">📁 Geral</option>
           </select>
         </div>

         <div>
           <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Escola</label>
           <select value={newMediaSchool} onChange={e => setNewMediaSchool(e.target.value)} style={inputStyle}>
             <option value="Geral">Geral / Todas</option>
             {registeredSchools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
           </select>
         </div>
       </div>

       <div>
         <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Tags</label>
         <input 
           value={newMediaTags} 
           onChange={e => setNewMediaTags(e.target.value)} 
           style={inputStyle} 
         />
       </div>

       <div>
         <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Descrição / Legenda</label>
         <textarea 
           value={newMediaDescription} 
           onChange={e => setNewMediaDescription(e.target.value)} 
           rows={3} 
           style={{ ...inputStyle, fontFamily: 'inherit' }} 
         />
       </div>
     </div>

     <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
       <button onClick={() => setEditingMediaModal(null)} style={btnSecondary}>Cancelar</button>
       <button
         onClick={async () => {
           if (!newMediaTitle.trim()) {
             alert('Informe o título.')
             return
           }
           const tagList = newMediaTags.split(',').map(t => t.trim()).filter(Boolean)
           const updated: MediaLibraryItem = {
             ...editingMediaModal,
             title: newMediaTitle.trim(),
             category: newMediaCategory,
             schoolName: newMediaSchool || 'Geral',
             tags: tagList,
             description: newMediaDescription.trim()
           }
           await saveMediaItemToSupabase(updated)
           setMediaItems(prev => prev.map(x => x.id === updated.id ? updated : x))
           setEditingMediaModal(null)
           showToast('Alterações salvas com sucesso!')
         }}
         style={btnPrimary}
       >
         Salvar Alterações
       </button>
     </div>
   </div>
 </div>
)}

 {/* Modal Novo Arquivo Avulso Manual */}
 {isAddLooseModalOpen && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
 <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 620, maxWidth: '95vw', border: '1px solid #ede8dc', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 16 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <span style={{ fontSize: 22 }}>📁</span>
 <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#073642' }}>Cadastrar Arquivo Avulso</h3>
 </div>
 <button onClick={() => setIsAddLooseModalOpen(false)} style={{ background: '#f5f0e8', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>×</button>
 </div>

 <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
 <div>
 <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Título do Arquivo / Material</label>
 <input value={newLooseTitle} onChange={e => setNewLooseTitle(e.target.value)} placeholder="Ex: Lista de Phrasal Verbs, Artigo sobre IA..." style={inputStyle} />
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
 <div>
 <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Categoria</label>
 <select value={newLooseCategory} onChange={e => setNewLooseCategory(e.target.value)} style={inputStyle}>
 <option value="Atividade Complementar">Atividade Complementar</option>
 <option value="Artigo / Texto">Artigo / Texto</option>
 <option value="Lista de Vocabulário">Lista de Vocabulário</option>
 <option value="Handout / Ficha">Handout / Ficha</option>
 <option value="Slide / Apresentação">Slide / Apresentação</option>
 <option value="Áudio de Aula">Áudio de Aula</option>
 <option value="Infográfico / Imagem">Infográfico / Imagem</option>
 <option value="Outro">Outro</option>
 </select>
 </div>

 <div>
 <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Escola Associada (opcional)</label>
 <select value={newLooseSchool} onChange={e => setNewLooseSchool(e.target.value)} style={inputStyle}>
 <option value="">Geral / Todas</option>
 {registeredSchools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
 </select>
 </div>
 </div>

 <div>
 <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Tags (separadas por vírgula)</label>
 <input value={newLooseTags} onChange={e => setNewLooseTags(e.target.value)} placeholder="#grammar, #9ano, #reading" style={inputStyle} />
 </div>

 <div>
 <label style={{ fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }}>Texto / Conteúdo do Arquivo</label>
 <textarea value={newLooseContent} onChange={e => setNewLooseContent(e.target.value)} placeholder="Cole aqui o texto do exercício, artigo, vocabulário..." rows={6} style={{ ...inputStyle, fontFamily: 'monospace' }} />
 </div>
 </div>

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
 <button onClick={() => setIsAddLooseModalOpen(false)} style={btnSecondary}>Cancelar</button>
 <button
 onClick={() => {
 if (!newLooseTitle.trim()) {
 alert('Informe o título do arquivo.')
 return
 }
 const tagList = newLooseTags.split(',').map(t => t.trim()).filter(Boolean)
 const item: LooseFileItem = {
 id: `file_${Date.now()}`,
 title: newLooseTitle.trim(),
 fileName: `${newLooseTitle.trim().toLowerCase().replace(/\s+/g, '_')}.txt`,
 fileType: 'text',
 fileSize: newLooseContent.length,
 category: newLooseCategory,
 tags: tagList.length > 0 ? tagList : ['#manual', '#texto'],
 school: newLooseSchool || 'Geral',
 extractedText: newLooseContent,
 date: new Date().toLocaleDateString('pt-BR'),
 createdAt: new Date().toISOString()
 }
 const updated = [item, ...looseFiles]
 saveLooseFiles(updated, item)
 setSelectedLooseFile(item)
 setIsAddLooseModalOpen(false)
 showToast('Arquivo avulso salvo!')
 }}
 style={btnPrimary}
 >
 Salvar Arquivo Avulso
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Modal de Player Online */}
 {showOnlinePlayer && viewExercise && (
 <StudentExamPlayer
 title={viewExercise.title}
 schoolName={viewExercise.school || 'ESCOLA DE ENSINO'}
 questions={parseQuestionsFromContent(viewExercise.content)}
 onClose={() => setShowOnlinePlayer(false)}
 />
 )}


 {/* Modal de QR Code para Alunos */}
 {showQrModal && viewExercise && (
 <div style={{
 position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
 display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
 }}>
 <div style={{
 background: '#fffcf8', borderRadius: 20, border: '2px solid #8b5e3c', padding: 28,
 maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
 }}>
 <h3 style={{ margin: '0 0 10px', fontFamily: "'Fraunces', Georgia, serif", color: '#2c1a0e' }}>
 QR Code da Prova Online
 </h3>
 <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 20px' }}>
 Peça para os alunos apontarem a câmera do celular para responder digitalmente.
 </p>

 <div
 style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}
 dangerouslySetInnerHTML={{ __html: generateSvgQRCode(`https://teacher-ai.app/exam/${viewExercise.id}`) }}
 />

 <button onClick={() => setShowQrModal(false)} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>
 Fechar
 </button>
 </div>
 </div>
 )}

 {/* Toast de Confirmação Flutuante (Auto-Dismiss) */}
 {toastMessage && (
 <div style={{
 position: 'fixed', bottom: 28, right: 28, zIndex: 999999,
 background: 'linear-gradient(135deg, #2c1a0e, #3d2510)',
 color: '#fdf8f2', border: '1.5px solid #e2a355',
 padding: '12px 22px', borderRadius: 14,
 fontSize: 13.5, fontWeight: 700,
 boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
 display: 'flex', alignItems: 'center', gap: 10,
 pointerEvents: 'none'
 }}>
 <span style={{ fontSize: 16, color: '#e2a355' }}>✓</span>
 <span>{toastMessage}</span>
 </div>
 )}
 </ModuleShell>
 )
}