'use client'

import { useState, useEffect, useRef } from 'react'
import ModuleShell from '@/components/ModuleShell'

export interface RepositoryItem {
  id: number
  title: string
  content: string
  date: string
  type: 'Student\'s Book' | 'Workbook' | 'Reference Book' | 'CLIL Book' | 'Syllabus' | 'Text'
  category?: string
  textbook?: string
}

// ─── Preset 1: Student's Book ────────────────────────────────────────────────
const G4_STUDENT_BOOK: Omit<RepositoryItem, 'id' | 'date'> = {
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
B: Actually, I’ve been living in London since 2022, but I’ve traveled to six different countries this year alone.
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

// ─── Preset 2: Workbook ──────────────────────────────────────────────────────
const G4_WORKBOOK: Omit<RepositoryItem, 'id' | 'date'> = {
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

// ─── Preset 3: Reference Book ────────────────────────────────────────────────
const G4_REFERENCE_BOOK: Omit<RepositoryItem, 'id' | 'date'> = {
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

// ─── Preset 4: CLIL Book ─────────────────────────────────────────────────────
const G4_CLIL_BOOK: Omit<RepositoryItem, 'id' | 'date'> = {
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

export default function Repository() {
  const [items, setItems]               = useState<RepositoryItem[]>([])
  const [adding, setAdding]             = useState(false)
  const [newTitle, setNewTitle]         = useState('')
  const [newContent, setNewContent]     = useState('')
  const [newType, setNewType]           = useState<RepositoryItem['type']>('Student\'s Book')
  const [viewItem, setViewItem]         = useState<RepositoryItem | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const fileInputRef                    = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const s = localStorage.getItem('teacher_repo')
    let currentItems: RepositoryItem[] = s ? JSON.parse(s) : []
    
    // Auto-carrega todos os 4 componentes do Globalizers 4 se o repositório estiver vazio ou sem eles
    const hasGlobalizers = currentItems.some(i => i.title.includes('Globalizers 4'))
    if (!hasGlobalizers) {
      const presetItems: RepositoryItem[] = ALL_G4_PRESETS.map((p, idx) => ({
        id: Date.now() + idx,
        ...p,
        date: new Date().toLocaleDateString('pt-BR'),
      }))
      currentItems = [...presetItems, ...currentItems]
      localStorage.setItem('teacher_repo', JSON.stringify(currentItems))
    }
    
    setItems(currentItems)
    setViewItem(currentItems[0] || null)
  }, [])

  async function save(newItems: RepositoryItem[]) {
    setItems(newItems)
    localStorage.setItem('teacher_repo', JSON.stringify(newItems))
    try {
      const { indexAllLibraryItems } = await import('@/lib/ragEngine')
      indexAllLibraryItems()
    } catch { /* ignora */ }
  }

  function addItem() {
    if (!newTitle.trim() || !newContent.trim()) return
    const item: RepositoryItem = {
      id: Date.now(),
      title: newTitle.trim(),
      content: newContent.trim(),
      type: newType,
      category: 'Macmillan / Custom',
      date: new Date().toLocaleDateString('pt-BR'),
    }
    save([item, ...items])
    setNewTitle(''); setNewContent(''); setAdding(false); setViewItem(item)
  }

  // Upload de arquivo nativo (TXT, MD, CSV, PDF Text com PDF.js)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      let text = ''
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const { extractTextFromPdf } = await import('@/lib/pdfExtractor')
        text = await extractTextFromPdf(file)
      } else {
        text = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve((ev.target?.result as string) || '')
          reader.readAsText(file)
        })
      }

      if (!text) {
        alert('Não foi possível extrair conteúdo do arquivo selecionado.')
        return
      }

      const item: RepositoryItem = {
        id: Date.now(),
        title: file.name.replace(/\.[^/.]+$/, ""),
        content: text,
        type: newType,
        category: file.name.endsWith('.pdf') ? 'Livro / PDF Extraído' : 'Arquivo Carregado',
        date: new Date().toLocaleDateString('pt-BR'),
      }
      save([item, ...items])
      setViewItem(item)
      alert(`✅ Livro/PDF "${file.name}" importado e lido com sucesso pela IA!`)
    } catch (err: unknown) {
      alert(`Erro ao ler arquivo: ${err instanceof Error ? err.message : 'Falha na leitura'}`)
    }
  }

  function reimportAllG4Presets() {
    const presetItems: RepositoryItem[] = ALL_G4_PRESETS.map((p, idx) => ({
      id: Date.now() + idx,
      ...p,
      date: new Date().toLocaleDateString('pt-BR'),
    }))

    const filtered = items.filter(i => !i.title.includes('Globalizers 4'))
    const updated = [...presetItems, ...filtered]
    save(updated)
    setViewItem(presetItems[0])
    alert('✅ Todos os 4 componentes do Globalizers 4 (Student\'s, Workbook, Reference e CLIL) foram restaurados com sucesso!')
  }

  function deleteItem(id: number) {
    if (confirm('Deletar este item do repositório?')) {
      const upd = items.filter(i => i.id !== id)
      save(upd)
      if (viewItem?.id === id) setViewItem(upd[0] || null)
    }
  }

  const filteredItems = items.filter(i => {
    if (activeFilter === 'all') return true
    return i.type === activeFilter
  })

  return (
    <ModuleShell 
      title="Biblioteca Digital & Livros (RAG Engine)"
      subtitle="Sua biblioteca de livros didáticos (Student's, Workbook, Reference, CLIL). A IA consulta estes materiais para gerar aulas e provas."
      isFullHeight
      maxWidth="100%"
      actions={
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.md,.json,.csv,.pdf" style={{ display: 'none' }} />

          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #073642', background: '#eee8d5', color: '#073642', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-upload" /> 📄 Upload PDF / Arquivo
          </button>

          <button 
            onClick={reimportAllG4Presets}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#859900', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-book" /> 📚 Restaurar os 4 Livros Globalizers 4
          </button>

          <button 
            onClick={() => setAdding(true)}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#073642', color: '#fdf6e3', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-plus" /> Adicionar Livro Manual
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 32, flex: 1, minHeight: 0, height: '100%' }}>
        {/* Lista Lateral com Filtro por Tipo de Livro */}
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(88,110,117,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,43,54,0.03)' }}>
          <div style={{ padding: '20px', borderBottom: '1px dashed rgba(88,110,117,0.1)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#93a1a1', marginBottom: 10 }}>
              Filtro de Componentes
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['all', 'Student\'s Book', 'Workbook', 'Reference Book', 'CLIL Book'].map(f => (
                <button key={f} onClick={() => setActiveFilter(f)} style={{
                  padding: '5px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: activeFilter === f ? '#073642' : '#fdf6e3',
                  color: activeFilter === f ? '#fff' : '#586e75',
                }}>
                  {f === 'all' ? 'Todos os Livros' : f.replace(' Book', '')}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {filteredItems.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#93a1a1', fontSize: 13 }}>
                Nenhum livro ou documento nesta categoria.
              </div>
            ) : filteredItems.map(item => (
              <div 
                key={item.id} 
                onClick={() => { setViewItem(item); setAdding(false); }}
                style={{ 
                  padding: '14px 16px', borderRadius: 14, cursor: 'pointer', marginBottom: 8,
                  background: viewItem?.id === item.id ? '#fdf6e3' : 'transparent',
                  border: viewItem?.id === item.id ? '1px solid rgba(181,137,0,0.3)' : '1px solid transparent',
                  boxShadow: viewItem?.id === item.id ? '0 4px 12px rgba(181,137,0,0.05)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: viewItem?.id === item.id ? '#073642' : '#586e75', marginBottom: 6 }}>
                  {item.type === 'Student\'s Book' && '📘 '}
                  {item.type === 'Workbook' && '📙 '}
                  {item.type === 'Reference Book' && '📗 '}
                  {item.type === 'CLIL Book' && '🟨 '}
                  {item.title}
                </div>
                <div style={{ fontSize: 11, color: '#93a1a1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><i className="ti ti-calendar" /> {item.date}</span>
                  <span style={{ background: '#eee8d5', padding: '2px 8px', borderRadius: 6, color: '#073642', fontWeight: 600 }}>{item.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Área de Visualização / Adição */}
        <div className="animate-fade-up" style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(88,110,117,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,43,54,0.03)' }}>
          {adding ? (
            <div style={{ padding: 40, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h2 style={{ fontSize: 24, color: '#073642', fontWeight: 700, marginBottom: 24, fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>Adicionar Componente do Livro</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#93a1a1', marginBottom: 8 }}>Título do Livro / Componente</label>
                  <input 
                    placeholder="Ex: Globalizers 4 — Workbook Unit 3"
                    value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    style={{ width: '100%', border: '1px solid rgba(88,110,117,0.15)', borderRadius: 12, padding: '14px 16px', fontSize: 15, fontWeight: 600, background: '#fdf6e3', color: '#073642', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#93a1a1', marginBottom: 8 }}>Tipo de Componente</label>
                  <select value={newType} onChange={e => setNewType(e.target.value as any)} style={{ width: '100%', border: '1px solid rgba(88,110,117,0.15)', borderRadius: 12, padding: '14px 16px', fontSize: 14, fontWeight: 600, background: '#fdf6e3', color: '#073642', outline: 'none' }}>
                    <option value="Student's Book">Student's Book</option>
                    <option value="Workbook">Workbook</option>
                    <option value="Reference Book">Reference Book</option>
                    <option value="CLIL Book">CLIL Book</option>
                  </select>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#93a1a1', marginBottom: 8 }}>Conteúdo / Texto do Livro</label>
                <textarea 
                  placeholder="Cole aqui os textos, transcrições, gramática ou exercícios do livro..."
                  value={newContent} onChange={e => setNewContent(e.target.value)}
                  style={{ width: '100%', flex: 1, border: '1px solid rgba(88,110,117,0.15)', borderRadius: 12, padding: '20px', fontSize: 14, background: '#fdf6e3', color: '#073642', outline: 'none', resize: 'none', fontFamily: 'Outfit, sans-serif', lineHeight: 1.6 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <button onClick={addItem} style={{ padding: '16px 32px', borderRadius: 12, border: 'none', background: '#073642', color: '#fdf6e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>Salvar no Repositório</button>
                <button onClick={() => setAdding(false)} style={{ padding: '16px 32px', borderRadius: 12, border: '1px solid rgba(88,110,117,0.2)', background: 'transparent', color: '#586e75', fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>Cancelar</button>
              </div>
            </div>
          ) : viewItem ? (
            <div className="animate-fade-up" style={{ padding: 40, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ background: '#073642', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>{viewItem.type}</span>
                    <span style={{ fontSize: 12, color: '#93a1a1' }}>Adicionado em {viewItem.date}</span>
                  </div>
                  <h2 style={{ fontSize: 22, color: '#073642', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>{viewItem.title}</h2>
                </div>

                <button onClick={() => deleteItem(viewItem.id)} style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: 'rgba(220,50,47,0.08)', color: '#dc322f', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-trash" /> Excluir Componente
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', background: '#fdf6e3', padding: 28, borderRadius: 20, border: '1px solid rgba(88,110,117,0.1)', fontSize: 13.5, lineHeight: 1.8, color: '#073642', fontFamily: 'monospace', whiteSpace: 'pre-wrap', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.02)' }}>
                {viewItem.content}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#93a1a1', gap: 16 }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: '#fdf6e3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-book text-4xl text-sol-base1 opacity-50" />
              </div>
              <p style={{ fontSize: 16, fontWeight: 500, color: '#586e75' }}>Selecione um componente para visualizar o texto lido pela IA.</p>
            </div>
          )}
        </div>
      </div>
    </ModuleShell>
  )
}
