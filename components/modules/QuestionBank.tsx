'use client'
import { useState, useEffect, useMemo } from 'react'
import { ELT_TAXONOMY, getSubcategoriesForCategory } from '@/lib/englishTaxonomy'

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */
interface School  { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string; subject?: string; year?: string }

export type ActivityKind = 'lesson' | 'exercise' | 'exam' | 'question'

export const KIND_LABELS: Record<ActivityKind, { label: string; icon: string; color: string; bg: string }> = {
  lesson:   { label: 'Aula Criada',        icon: 'ti-chalkboard', color: '#8b5e3c', bg: 'rgba(139,94,60,0.12)' },
  exercise: { label: 'Lista de Exercícios', icon: 'ti-sparkles',   color: '#2a6080', bg: 'rgba(42,96,128,0.12)' },
  exam:     { label: 'Prova & Gabarito',   icon: 'ti-file-text',  color: '#c87a1e', bg: 'rgba(200,122,30,0.12)' },
  question: { label: 'Questão Isolada',   icon: 'ti-help-circle',color: '#3d7a4e', bg: 'rgba(61,122,78,0.12)' },
}

interface Question {
  id:          string
  statement:   string           // Enunciado
  type:        QuestionType
  activityKind?: ActivityKind   // Tipo de atividade (aula, exercício, prova, questão)
  options?:    string[]          // Alternativas A-D (MC)
  answer?:     string            // Gabarito
  explanation?: string          // Comentário/resolução
  subject:     string            // Disciplina
  topic:       string            // Assunto/tópico
  eltCategory?: string           // Categoria ELT (Grammar, Vocabulary, etc.)
  eltSubcategory?: string        // Subcategoria ELT (Tenses, Phrasal Verbs, etc.)
  bnccCode?:   string            // Código BNCC / ENEM (ex: EF09LI01, EM13LGG101)
  level:       string            // Nível (A1, B2, Básico…)
  year:        string            // Ano letivo
  schoolId:    string            // Escola
  classRef:    string            // Turma (opcional)
  tags:        string[]
  createdAt:   number
  source:      'manual' | 'ai'
}

type QuestionType = 'mc' | 'essay' | 'tf' | 'fill'

const TYPE_LABELS: Record<QuestionType, string> = {
  mc:    'Múltipla Escolha',
  essay: 'Dissertativa',
  tf:    'V ou F',
  fill:  'Preencher Lacuna',
}
const LEVELS = ['A1','A2','B1','B2','C1','C2','Básico','Intermediário','Avançado']
const YEARS  = ['2023','2024','2025','2026']
const OPTION_LETTERS = ['A','B','C','D']

const S: Record<string, React.CSSProperties> = {
  page:  { padding: '36px 42px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },
  card:  { background: '#fffcf8', border: '1px solid rgba(139,115,85,0.14)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 8px rgba(44,26,14,0.06)' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },
  input: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.18)', background: '#fffcf8', color: '#2c1a0e', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: 6 },
}

function getActiveApi() {
  try { const a = JSON.parse(localStorage.getItem('teacher_apis') || '[]'); return a.find((x: { active: boolean; provider: string }) => x.active && x.provider !== 'manual') || null } catch { return null }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════════════════════════ */
export default function QuestionBank() {
  const [schools,   setSchools]   = useState<School[]>([])
  const [classes,   setClasses]   = useState<ClassRecord[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQ, setSelectedQ] = useState<Question | null>(null)
  const [modal,     setModal]     = useState<'add' | 'ai' | null>(null)
  const [isGen,     setIsGen]     = useState(false)

  /* Filtros */
  const [fKind,    setFKind]    = useState<'all' | ActivityKind>('all')
  const [fSchool,  setFSchool]  = useState('all')
  const [fYear,    setFYear]    = useState('all')
  const [fSubject, setFSubject] = useState('all')
  const [fType,    setFType]    = useState('all')
  const [fLevel,   setFLevel]   = useState('all')
  const [fText,    setFText]    = useState('')

  /* Form novo */
  const [fKind2,        setFKind2]        = useState<ActivityKind>('exercise')
  const [fStatement,    setFStatement]    = useState('')
  const [fType2,        setFType2]        = useState<QuestionType>('mc')
  const [fOptions,      setFOptions]      = useState<string[]>(['', '', '', ''])
  const [fAnswer,       setFAnswer]       = useState('')
  const [fExplanation,  setFExplanation]  = useState('')
  const [fSubject2,     setFSubject2]     = useState('Inglês')
  const [fTopic,        setFTopic]        = useState('')
  const [fEltCat,       setFEltCat]       = useState('grammar')
  const [fEltSubcat,    setFEltSubcat]    = useState('tenses')
  const [fBnccCode,     setFBnccCode]     = useState('')
  const [fLevel2,       setFLevel2]       = useState('B1')
  const [fYear2,        setFYear2]        = useState('2025')
  const [fSchool2,      setFSchool2]      = useState('')
  const [fClass2,       setFClass2]       = useState('')
  const [fTags,         setFTags]         = useState('')

  /* Form geração IA */
  const [aiKind,       setAiKind]       = useState<ActivityKind>('exercise')
  const [aiTopic,      setAiTopic]      = useState('')
  const [aiSubject,    setAiSubject]    = useState('Inglês')
  const [aiEltCat,     setAiEltCat]     = useState('grammar')
  const [aiEltSubcat,  setAiEltSubcat]  = useState('tenses')
  const [aiLevel,      setAiLevel]      = useState('B1')
  const [aiYear,    setAiYear]    = useState('2025')
  const [aiCount,   setAiCount]   = useState(5)
  const [aiType,    setAiType]    = useState<QuestionType>('mc')
  const [aiSchool,  setAiSchool]  = useState('')

  /* ─── Carregar dados ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => {
      const sc = localStorage.getItem('teacher_schools')
      const cl = localStorage.getItem('teacher_classes')
      const qb = localStorage.getItem('teacher_question_bank')
      if (sc) setSchools(JSON.parse(sc))
      if (cl) setClasses(JSON.parse(cl))
      if (qb) setQuestions(JSON.parse(qb))
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])

  function saveQs(upd: Question[]) {
    setQuestions(upd)
    localStorage.setItem('teacher_question_bank', JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
  }

  /* ─── Filtros ─────────────────────────────────────────────────────────────── */
  const subjects = useMemo(() => [...new Set(questions.map(q => q.subject))], [questions])
  const filtered = useMemo(() => {
    return questions.filter(q => {
      const qKind = q.activityKind || 'question'
      if (fKind    !== 'all' && qKind !== fKind)        return false
      if (fSchool  !== 'all' && q.schoolId !== fSchool)  return false
      if (fYear    !== 'all' && q.year     !== fYear)    return false
      if (fSubject !== 'all' && q.subject  !== fSubject) return false
      if (fType    !== 'all' && q.type     !== fType)    return false
      if (fLevel   !== 'all' && q.level    !== fLevel)   return false
      if (fText && !q.statement.toLowerCase().includes(fText.toLowerCase()) && !q.topic.toLowerCase().includes(fText.toLowerCase())) return false
      return true
    }).sort((a, b) => b.createdAt - a.createdAt)
  }, [questions, fKind, fSchool, fYear, fSubject, fType, fLevel, fText])

  /* ─── Adicionar manualmente ──────────────────────────────────────────────── */
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

  /* ─── Gerar com IA ───────────────────────────────────────────────────────── */
  async function generateWithAI() {
    const api = getActiveApi()
    if (!api) { alert('Configure uma API ativa em APIs & Modelos.'); return }
    setIsGen(true)
    try {
      const prompt = `Gere ${aiCount} itens de ${KIND_LABELS[aiKind].label} (${aiType === 'mc' ? 'múltipla escolha' : aiType === 'essay' ? 'dissertativa' : aiType === 'tf' ? 'verdadeiro ou falso' : 'preencher lacuna'}) sobre "${aiTopic}" para a disciplina ${aiSubject}, nível ${aiLevel}, ano letivo ${aiYear}.

Responda SOMENTE com JSON válido no formato:
[
  {
    "statement": "Enunciado ou Tópico da atividade aqui",
    "options": ["A) opção", "B) opção", "C) opção", "D) opção"],
    "answer": "A",
    "explanation": "Porque..."
  }
]
Para questões dissertativas ou V/F, omita "options". Para V/F, o "answer" deve ser "Verdadeiro" ou "Falso".`

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          context: '', provider: api.provider, userKey: api.key, model: api.model,
        }),
      })
      const data = await res.json()
      const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('IA não retornou JSON válido')
      const parsed: Array<{ statement: string; options?: string[]; answer?: string; explanation?: string }> = JSON.parse(jsonMatch[0])

      const newQs: Question[] = parsed.map((item, i) => ({
        id: `q_ai_${Date.now()}_${i}`, statement: item.statement, type: aiType,
        activityKind: aiKind,
        options: item.options, answer: item.answer, explanation: item.explanation,
        subject: aiSubject, topic: aiTopic, level: aiLevel, year: aiYear,
        schoolId: aiSchool || '', classRef: '', tags: [aiTopic.toLowerCase()],
        createdAt: Date.now(), source: 'ai',
      }))
      saveQs([...newQs, ...questions])
      setModal(null)
    } catch (e) {
      alert(`Erro ao gerar: ${e instanceof Error ? e.message : 'desconhecido'}`)
    } finally { setIsGen(false) }
  }

  function deleteQ(id: string) {
    if (!confirm('Excluir esta questão?')) return
    saveQs(questions.filter(q => q.id !== id))
    if (selectedQ?.id === id) setSelectedQ(null)
  }

  const typeColor: Record<QuestionType, string> = { mc: '#268bd2', essay: '#d33682', tf: '#859900', fill: '#b58900' }
  const schoolOf = (id: string) => schools.find(s => s.id === id)

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(139,115,85,0.12)' }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
            Banco de Atividades
          </h1>
          <p style={{ color: '#a08060', fontSize: 14, marginTop: 4 }}>
            {questions.length} atividades salvas · acervo central de aulas, listas, provas e gabaritos
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setModal('ai')} style={{ ...S.btn, background: '#d4944a', color: '#fffcf8' }}>
            <i className="ti ti-sparkles" /> Gerar Atividade com IA
          </button>
          <button onClick={() => setModal('add')} style={{ ...S.btn, background: '#8b5e3c', color: '#fffcf8' }}>
            <i className="ti ti-plus" /> Adicionar Atividade
          </button>
        </div>
      </div>

      {/* Sub-abas de Categoria de Atividade (Aulas, Exercícios, Provas, Questões) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'all',      label: '🎒 Todas as Atividades', count: questions.length },
          { key: 'lesson',   label: '📚 Aulas Criadas',       count: questions.filter(q => q.activityKind === 'lesson').length },
          { key: 'exercise', label: '📝 Exercícios Salvos',  count: questions.filter(q => (q.activityKind || 'exercise') === 'exercise').length },
          { key: 'exam',     label: '📄 Provas & Gabaritos', count: questions.filter(q => q.activityKind === 'exam').length },
          { key: 'question', label: '❓ Questões Isoladas',   count: questions.filter(q => q.activityKind === 'question').length },
        ].map(tab => {
          const isActive = fKind === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setFKind(tab.key as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 12, border: 'none',
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
                padding: '2px 8px', borderRadius: 10, fontSize: 11
              }}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

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
          ['fSchool',  fSchool,  setFSchool,  'Escola',     [['all','Todas escolas'], ...schools.map(s => [s.id, s.name])]],
          ['fYear',    fYear,    setFYear,    'Ano',        [['all','Todos anos'], ...YEARS.map(y => [y, y])]],
          ['fSubject', fSubject, setFSubject, 'Disciplina', [['all','Todas'], ...subjects.map(s => [s, s])]],
          ['fType',    fType,    setFType,    'Formato',    [['all','Todos formatos'], ...Object.entries(TYPE_LABELS)]],
          ['fLevel',   fLevel,   setFLevel,   'Nível',      [['all','Todos níveis'], ...LEVELS.map(l => [l, l])]],
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
                              🇬🇧 {ELT_TAXONOMY.find(c=>c.id===q.eltCategory)?.name.split(' ')[0] || q.eltCategory} {q.eltSubcategory ? `· ${q.eltSubcategory}` : ''}
                            </span>
                          )}
                          {q.bnccCode && <span style={{ ...S.badge, background: '#e0f2fe', color: '#0369a1' }}>🇧🇷 BNCC: {q.bnccCode}</span>}
                          {sc && <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{sc.name}</span>}
                          <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{q.year}</span>
                          <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{q.subject}</span>
                          <span style={{ ...S.badge, background: '#f5efe6', color: '#7a5c42' }}>{q.level}</span>
                          {q.source === 'ai' && <span style={{ ...S.badge, background: 'rgba(212,148,74,0.18)', color: '#8b5e3c' }}>✨ IA</span>}
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
                <button onClick={() => setSelectedQ(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
              </div>
              <p style={{ fontSize: 14, color: '#073642', lineHeight: 1.6, marginBottom: 16 }}>{selectedQ.statement}</p>

              {selectedQ.options?.map((opt, i) => (
                <div key={i} style={{
                  padding: '8px 14px', borderRadius: 10, marginBottom: 6,
                  background: selectedQ.answer === OPTION_LETTERS[i] ? '#d0f0c0' : '#f5f0e8',
                  border: `1px solid ${selectedQ.answer === OPTION_LETTERS[i] ? '#2d7a00' : 'transparent'}`,
                  color: '#073642', fontSize: 13,
                }}>
                  <b>{OPTION_LETTERS[i]})</b> {opt}
                </div>
              ))}

              {selectedQ.answer && selectedQ.type !== 'mc' && (
                <div style={{ background: '#d0f0c0', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#2d7a00', fontWeight: 700, marginBottom: 4 }}>GABARITO</div>
                  <div style={{ fontSize: 13, color: '#073642' }}>{selectedQ.answer}</div>
                </div>
              )}

              {selectedQ.explanation && (
                <div style={{ background: '#eee8d5', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#586e75', fontWeight: 700, marginBottom: 4 }}>COMENTÁRIO</div>
                  <div style={{ fontSize: 13, color: '#073642' }}>{selectedQ.explanation}</div>
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedQ.tags.map(t => <span key={t} style={{ ...S.badge, background: '#eee8d5', color: '#586e75' }}>{t}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal: Adicionar Manualmente ──────────────────────────────────── */}
      {modal === 'add' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, overflowY: 'auto' }}>
          <div style={{ ...S.card, width: 580, maxWidth: '95vw', marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, color: '#2c1a0e', margin: '0 0 20px' }}>Nova Atividade Pedagógica</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Tipo de Atividade *</label>
                <select style={S.input} value={fKind2} onChange={e => setFKind2(e.target.value as ActivityKind)}>
                  <option value="exercise">📝 Lista de Exercícios / Treino</option>
                  <option value="lesson">📚 Aula Criada (Plano de Aula / Exposição)</option>
                  <option value="exam">📄 Prova & Gabarito Oficial</option>
                  <option value="question">❓ Questão Isolada</option>
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
              <button onClick={() => { resetForm(); setModal(null) }} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={addManual} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
                <i className="ti ti-check" /> Salvar Questão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Gerar com IA ─────────────────────────────────────────── */}
      {modal === 'ai' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 480, maxWidth: '95vw' }}>
            <h2 style={{ fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, color: '#2c1a0e', margin: '0 0 6px' }}>✨ Gerar Atividades com IA</h2>
            <p style={{ color: '#a08060', fontSize: 13, marginBottom: 20 }}>A IA gera o material pedagógico e armazena automaticamente no seu banco.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Tipo de Atividade a Criar</label>
                <select style={S.input} value={aiKind} onChange={e => setAiKind(e.target.value as ActivityKind)}>
                  <option value="exercise">📝 Lista de Exercícios / Treino</option>
                  <option value="lesson">📚 Aula Criada (Plano de Aula / Exposição)</option>
                  <option value="exam">📄 Prova & Gabarito Oficial</option>
                  <option value="question">❓ Questões Isoladas</option>
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
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
