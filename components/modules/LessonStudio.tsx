'use client'

import React, { useState, useEffect, useMemo } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'
import { exportToPdf, exportToWord, exportToExcel } from '@/lib/exportUtils'
import { getStoredBnccSkills, getBnccSkillsForGrade, getClassPostponedSkills, saveClassPostponedSkills, BnccSkill } from '@/lib/bnccData'
import { buildTeacherStylePromptDirective, updateTeacherProfileFromLessonPlan } from '@/lib/teacherProfile'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ClassRecord {
  id: string
  name: string
  schoolId: string
  subject?: string
  year?: string
  gradeYear?: string
}

interface SchoolRecord {
  id: string
  name: string
}

interface LessonStage {
  name: string
  durationMin: number
  teacherAction: string
  studentAction: string
  completed?: boolean
}

export interface LessonPlanDocument {
  id: string
  date: string
  classId: string
  className: string
  schoolName: string
  subject: string
  topic: string
  roomSpace: string // 'Sala de Aula' | 'Laboratório' | 'Pátio' | 'Biblioteca'
  selectedSkills: Array<{ code: string; desc: string; status: 'planned' | 'covered' | 'postponed' }>
  methodology: string
  referenceMaterial: {
    bookTitle: string
    unit: string
    pages: string
  }
  stages: LessonStage[]
  guidingQuestions: string[]
  homework: string
  postLessonNotes: string
  savedInBank?: boolean
  savedInCalendar?: boolean
  createdAt: number
}

const METHODOLOGY_PRESETS = [
  { id: 'tblt', name: 'TBLT (Task-Based)', badge: '#b58900', desc: 'Foco em tarefas práticas reais (Pre-Task, Task Cycle, Language Focus)' },
  { id: 'ppp', name: 'PPP (Presentation, Practice, Production)', badge: '#268bd2', desc: 'Estruturado para gramática e vocabulário MFP' },
  { id: 'guided_discovery', name: 'Guided Discovery (Descoberta Guiada)', badge: '#2aa198', desc: 'Indução de regras através de exemplos e Noticing' },
  { id: 'ttt', name: 'TTT (Test-Teach-Test)', badge: '#cb4b16', desc: 'Diagnóstico inicial para ensinar apenas as lacunas' },
  { id: 'flipped', name: 'Sala de Aula Invertida (Flipped)', badge: '#6c71c4', desc: 'Estudo prévio e atividades de alta cognição em sala' },
  { id: 'lexical', name: 'Abordagem Léxica (Lexical Approach)', badge: '#d33682', desc: 'Foco em chunks, collocations e expressões prontas' }
]

const DEFAULT_STAGES: LessonStage[] = [
  { name: 'Warm-up / Lead-in', durationMin: 5, teacherAction: 'Ativar vocabulário prévio com imagem/pergunta', studentAction: 'Compartilhar opiniões rápidas em duplas', completed: false },
  { name: 'Apresentação / Task Cycle', durationMin: 20, teacherAction: 'Introduzir o desafio e orientar a produção comunicativa', studentAction: 'Executar tarefa em pares/grupos usando a língua-alvo', completed: false },
  { name: 'Prática Guiada / Análise', durationMin: 15, teacherAction: 'Esclarecer dúvidas e destacar estruturas linguísticas chave', studentAction: 'Resolver exercícios de consolidação e correção mútua', completed: false },
  { name: 'Wrap-up & Feedback', durationMin: 10, teacherAction: 'Feedback coletivo de erros (Delayed Error Correction) e orientar Homework', studentAction: 'Registrar anotações e dúvidas no caderno', completed: false }
]

export default function LessonStudio() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'editor' | 'bank'>('editor')

  // Context Data
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [schools, setSchools] = useState<SchoolRecord[]>([])
  const [bankPlans, setBankPlans] = useState<LessonPlanDocument[]>([])
  const [availableQuestions, setAvailableQuestions] = useState<any[]>([])

  // Form & Document State
  const [selectedClassId, setSelectedClassId] = useState('')
  const [lessonDate, setLessonDate] = useState(new Date().toISOString().slice(0, 10))
  const [roomSpace, setRoomSpace] = useState('Sala de Aula')
  const [topic, setTopic] = useState('')
  const [selectedMethodology, setSelectedMethodology] = useState('tblt')
  const [bookTitle, setBookTitle] = useState('')
  const [unitChapter, setUnitChapter] = useState('')
  const [pages, setPages] = useState('')
  const [stages, setStages] = useState<LessonStage[]>(DEFAULT_STAGES)
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>([
    'Como os alunos utilizam a estrutura para expressar ideias reais?',
    'Qual vocabulário essencial foi consolidado durante a prática?'
  ])
  const [homework, setHomework] = useState('')
  const [postLessonNotes, setPostLessonNotes] = useState('')

  // BNCC Skills state
  const [selectedSkills, setSelectedSkills] = useState<Array<{ code: string; desc: string; status: 'planned' | 'covered' | 'postponed' }>>([])
  const [skillSearch, setSkillSearch] = useState('')

  // History & Navigation
  const [historyIndex, setHistoryIndex] = useState(0)

  // Modals & Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [showAttachActivityModal, setShowAttachActivityModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // ─── Carregamento Inicial ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const cl = localStorage.getItem('teacher_classes')
      const sc = localStorage.getItem('teacher_schools')
      const bk = localStorage.getItem('teacher_lesson_plans_bank')
      const qb = localStorage.getItem('teacher_question_bank')
      const privPrefill = localStorage.getItem('teacher_lesson_studio_student_prefill')

      let parsedCl: ClassRecord[] = []
      if (cl) parsedCl = JSON.parse(cl)

      if (privPrefill) {
        try {
          const priv = JSON.parse(privPrefill)
          const privClassRecord: ClassRecord = {
            id: `priv_${priv.studentId}`,
            name: `🎓 Particular: ${priv.studentName}`,
            schoolId: 'priv_school',
            subject: priv.subject || 'Língua Inglesa',
            gradeYear: '9º Fund.'
          }
          parsedCl = [privClassRecord, ...parsedCl]
          setSelectedClassId(privClassRecord.id)
          setTopic(`Aula Individual — ${priv.subject || 'Inglês'}`)
          localStorage.removeItem('teacher_lesson_studio_student_prefill')
        } catch {}
      } else if (parsedCl.length > 0) {
        setSelectedClassId(parsedCl[0].id)
      }

      setClasses(parsedCl)
      if (sc) setSchools(JSON.parse(sc))
      if (bk) setBankPlans(JSON.parse(bk))
      if (qb) setAvailableQuestions(JSON.parse(qb))
    } catch {}
  }, [])

  // Turma Atual e Matriz BNCC
  const currentClass = useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId])
  const currentSchool = useMemo(() => schools.find(s => s.id === currentClass?.schoolId), [schools, currentClass])
  const availableBnccSkills = useMemo(() => getBnccSkillsForGrade(currentClass?.gradeYear || '9º Fund.'), [currentClass])

  // Planos Anteriores da mesma turma
  const classHistoryPlans = useMemo(() => {
    return bankPlans
      .filter(p => p.classId === selectedClassId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [bankPlans, selectedClassId])

  // Habilidades Adiadas da Aula Anterior
  const pendingBacklog = useMemo(() => {
    if (!selectedClassId) return []
    return getClassPostponedSkills(selectedClassId)
  }, [selectedClassId])

  const showNotification = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  // Totalizador de Minutos da Aula
  const totalTiming = useMemo(() => stages.reduce((acc, s) => acc + (Number(s.durationMin) || 0), 0), [stages])

  // ─── Alternar Seleção de Habilidade BNCC ──────────────────────────────────
  const toggleSkill = (skill: BnccSkill) => {
    const exists = selectedSkills.find(s => s.code === skill.code)
    if (exists) {
      setSelectedSkills(selectedSkills.filter(s => s.code !== skill.code))
    } else {
      setSelectedSkills([...selectedSkills, { code: skill.code, desc: skill.description, status: 'planned' }])
    }
  }

  const setSkillStatus = (code: string, status: 'planned' | 'covered' | 'postponed') => {
    setSelectedSkills(selectedSkills.map(s => s.code === code ? { ...s, status } : s))
    if (status === 'postponed') {
      const currentPostponed = getClassPostponedSkills(selectedClassId)
      if (!currentPostponed.includes(code)) {
        saveClassPostponedSkills(selectedClassId, [...currentPostponed, code])
        showNotification(`Habilidade ${code} adiada. Será sugerida na próxima aula da turma.`)
      }
    }
  }

  const importPendingBacklogSkill = (code: string) => {
    const skillObj = availableBnccSkills.find(s => s.code === code)
    if (skillObj && !selectedSkills.some(s => s.code === code)) {
      setSelectedSkills([...selectedSkills, { code: skillObj.code, desc: skillObj.description, status: 'planned' }])
    }
    // Remove do backlog
    const updated = pendingBacklog.filter(c => c !== code)
    saveClassPostponedSkills(selectedClassId, updated)
    showNotification(`Habilidade ${code} incluída no plano de hoje!`)
  }

  // ─── Geração de Conteúdo e Roteiro com IA ─────────────────────────────────
  const handleGenerateWithAi = async () => {
    if (!topic.trim()) {
      alert('Digite o Tópico ou Conteúdo Central antes de gerar com IA.')
      return
    }

    setIsGenerating(true)
    try {
      const meth = METHODOLOGY_PRESETS.find(m => m.id === selectedMethodology)?.name || 'TBLT'
      const promptDirective = buildTeacherStylePromptDirective()

      const prompt = `Você é um coordenador pedagógico sênior de Ensino de Língua Inglesa.
Elabore um Plano de Aula estruturado em blocos para a seguinte configuração:

DADOS DA AULA:
- Turma: ${currentClass?.name || 'Turma'} (${currentClass?.gradeYear || 'Ensino Fundamental'})
- Tópico Central: "${topic}"
- Metodologia Ativa: ${meth}
- Material de Apoio: ${bookTitle || 'Livro Didático'} ${unitChapter ? `(${unitChapter})` : ''}
- Habilidades BNCC: ${selectedSkills.map(s => s.code).join(', ') || 'Geral'}

${promptDirective}

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "guidingQuestions": ["Pergunta 1", "Pergunta 2"],
  "stages": [
    {
      "name": "Warm-up",
      "durationMin": 5,
      "teacherAction": "Ação do professor",
      "studentAction": "Ação do aluno"
    },
    {
      "name": "Core Task / Presentation",
      "durationMin": 20,
      "teacherAction": "Ação do professor",
      "studentAction": "Ação do aluno"
    },
    {
      "name": "Guided Practice",
      "durationMin": 15,
      "teacherAction": "Ação do professor",
      "studentAction": "Ação do aluno"
    },
    {
      "name": "Wrap-up & Feedback",
      "durationMin": 10,
      "teacherAction": "Ação do professor",
      "studentAction": "Ação do aluno"
    }
  ],
  "homework": "Sugestão concisa de dever de casa comunicativo"
}`

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })

      const data = await res.json()
      const raw = data?.reply || data?.content || ''
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed.stages)) setStages(parsed.stages)
        if (Array.isArray(parsed.guidingQuestions)) setGuidingQuestions(parsed.guidingQuestions)
        if (parsed.homework) setHomework(parsed.homework)
        showNotification('Roteiro e Perguntas-Guia gerados com sucesso pela IA!')
      }
    } catch (err: any) {
      alert(`Erro na geração: ${err.message || 'Tente novamente'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Salvamento 1: Salvar no Calendário / Agenda ──────────────────────────
  const handleSaveToCalendar = () => {
    if (!currentClass) return
    const calendarTask = {
      id: `task_${Date.now()}`,
      title: `Aula de Inglês: ${topic || 'Planejamento'} (${currentClass.name})`,
      date: lessonDate,
      time: '08:00',
      classId: currentClass.id,
      className: currentClass.name,
      room: roomSpace,
      completed: false
    }

    try {
      const existing = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
      const updated = [calendarTask, ...existing]
      localStorage.setItem('teacher_calendar_tasks', JSON.stringify(updated))
      window.dispatchEvent(new Event('storage'))
      showNotification('📅 Aula agendada com sucesso no Calendário!')
    } catch {}
  }

  // ─── Salvamento 2: Salvar no Banco de Planejamento (Repositório) ──────────
  const handleSaveToBank = () => {
    if (!currentClass) return
    const newPlan: LessonPlanDocument = {
      id: `plan_${Date.now()}`,
      date: lessonDate,
      classId: currentClass.id,
      className: currentClass.name,
      schoolName: currentSchool?.name || 'Escola',
      subject: currentClass.subject || 'Inglês',
      topic: topic || 'Plano de Aula Sem Título',
      roomSpace,
      selectedSkills,
      methodology: selectedMethodology,
      referenceMaterial: { bookTitle, unit: unitChapter, pages },
      stages,
      guidingQuestions,
      homework,
      postLessonNotes,
      savedInBank: true,
      createdAt: Date.now()
    }

    const updated = [newPlan, ...bankPlans.filter(p => p.id !== newPlan.id)]
    setBankPlans(updated)
    try {
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updated))
      window.dispatchEvent(new Event('storage'))
      // Atualiza o perfil adaptativo do professor incrementalmente
      updateTeacherProfileFromLessonPlan({
        methodology: selectedMethodology,
        timingTotal: totalTiming,
        stagesCount: stages.length,
        hasHomework: Boolean(homework.trim())
      })
      showNotification('💾 Plano salvo com sucesso no Banco de Planejamento!')
    } catch {}
  }

  // ─── Exportações ─────────────────────────────────────────────────────────
  const generatePlanMarkdown = () => {
    return `
# PLANO DE AULA: ${topic.toUpperCase()}

**Escola:** ${currentSchool?.name || 'Escola'} &bull; **Turma:** ${currentClass?.name || 'Turma'} (${currentClass?.gradeYear || '9º Ano'})
**Data:** ${new Date(lessonDate).toLocaleDateString('pt-BR')} &bull; **Espaço Utilizado:** ${roomSpace}
**Metodologia:** ${METHODOLOGY_PRESETS.find(m => m.id === selectedMethodology)?.name || 'TBLT'}
**Material de Referência:** ${bookTitle || 'Livro Base'} ${unitChapter ? `(${unitChapter})` : ''} ${pages ? `[${pages}]` : ''}

---

## 🎯 Competências e Habilidades BNCC Trabalhadas
${selectedSkills.map(s => `- **[${s.code}]** ${s.desc} (${s.status === 'covered' ? 'Concluída' : s.status === 'postponed' ? 'Adiada' : 'Planejada'})`).join('\n') || '- Nenhuma habilidade específica vinculada.'}

---

## ❓ Perguntas-Guia da Aula
${guidingQuestions.map(q => `- *${q}*`).join('\n')}

---

## ⏱️ Roteiro da Aula e Cronograma (${totalTiming} min)
| Etapa | Duração | Ação do Professor | Ação do Aluno |
| :--- | :--- | :--- | :--- |
${stages.map(s => `| **${s.name}** | ${s.durationMin} min | ${s.teacherAction} | ${s.studentAction} |`).join('\n')}

---

## 📝 Dever de Casa / Homework
${homework || 'Sem tarefa de casa atribuída para esta aula.'}

---

## 💡 Observações & Log Reflexivo Pós-Aula
${postLessonNotes || 'Nenhuma observação registrada.'}
`
  }

  const handleExportPdf = () => {
    exportToPdf({
      schoolName: currentSchool?.name || 'ESCOLA DE ENSINO BÁSICO',
      teacherName: 'Professor(a)',
      className: currentClass?.name || 'Turma',
      date: new Date(lessonDate).toLocaleDateString('pt-BR'),
      title: `PLANO DE AULA — ${topic.toUpperCase() || 'LÍNGUA INGLESA'}`,
      content: generatePlanMarkdown()
    })
  }

  const handleExportWord = () => {
    exportToWord({
      schoolName: currentSchool?.name || 'ESCOLA DE ENSINO BÁSICO',
      teacherName: 'Professor(a)',
      className: currentClass?.name || 'Turma',
      date: new Date(lessonDate).toLocaleDateString('pt-BR'),
      title: `PLANO DE AULA — ${topic.toUpperCase() || 'LÍNGUA INGLESA'}`,
      content: generatePlanMarkdown()
    })
  }

  const handleExportExcel = () => {
    exportToExcel({
      filename: `Plano_Aula_${currentClass?.name || 'Turma'}_${lessonDate}`,
      headers: ['Etapa', 'Duração (min)', 'Ação do Professor', 'Ação do Aluno', 'Status'],
      rows: stages.map(s => [s.name, s.durationMin, s.teacherAction, s.studentAction, s.completed ? 'Concluído' : 'Pendente'])
    })
    showNotification('📊 Cronograma da aula exportado para Excel (.csv)!')
  }

  return (
    <div style={{ padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2', maxWidth: 1440, margin: '0 auto' }}>
      
      {/* ─── HEADER & TABS ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
              DIDACTIC SEQUENCE 2.0
            </span>
            <span style={{ fontSize: 13, color: '#7a6552' }}>Ecossistema de Planejamento Docente</span>
          </div>
          <h1 style={{ margin: '4px 0 0 0', fontSize: 26, fontFamily: 'Fraunces, Georgia, serif', color: '#2c1a0e' }}>
            Planejamento & Roteiro de Aula
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 6, background: '#fffcf8', padding: 4, borderRadius: 12, border: '1px solid #d5c0b0' }}>
          <button
            onClick={() => setActiveTab('editor')}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'editor' ? '#8b5e3c' : 'transparent', color: activeTab === 'editor' ? '#fff' : '#586e75', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-edit"></i> Documento de Planejamento
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'bank' ? '#8b5e3c' : 'transparent', color: activeTab === 'bank' ? '#fff' : '#586e75', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-archive"></i> Banco de Planejamento ({bankPlans.length})
          </button>
        </div>
      </div>

      {/* ─── ABA 1: DOCUMENTO DE PLANEJAMENTO EM BOXES ─────────────────────── */}
      {activeTab === 'editor' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
          
          {/* Coluna Principal: Os 8 Boxes Estruturados */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Box 1: Logística & Identificação */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  📦 Box 1: Identificação & Espaço da Aula
                </span>
                <span style={{ fontSize: 12, color: '#7a6552' }}>{currentSchool?.name || 'Escola'}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Turma</label>
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.gradeYear || '9º Fund.'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Data da Aula</label>
                  <input
                    type="date"
                    value={lessonDate}
                    onChange={e => setLessonDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Espaço / Local</label>
                  <select
                    value={roomSpace}
                    onChange={e => setRoomSpace(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    <option value="Sala de Aula Regular">🏫 Sala de Aula Regular</option>
                    <option value="Laboratório de Informática">💻 Lab. de Informática</option>
                    <option value="Biblioteca">📚 Biblioteca</option>
                    <option value="Pátio / Espaço Aberto">🌳 Pátio / Atividade Externa</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Box 2: Conteúdo & Tópico Central */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  📦 Box 2: Conteúdo & Tópico Central
                </span>
                <button
                  onClick={handleGenerateWithAi}
                  disabled={isGenerating}
                  style={{ background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className={isGenerating ? 'ti ti-loader ti-spin' : 'ti ti-sparkles'}></i>
                  {isGenerating ? 'Elaborando Roteiro...' : 'Gerar Roteiro com IA'}
                </button>
              </div>

              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Ex: Simple Past vs Past Continuous narrating a travel experience..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Box 3: Competências & Habilidades BNCC */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  📦 Box 3: Habilidades BNCC ({currentClass?.gradeYear || 'Geral'})
                </span>
                <span style={{ fontSize: 12, color: '#7a6552' }}>{selectedSkills.length} selecionada(s)</span>
              </div>

              {/* Alerta de Habilidade Adiada na Aula Anterior */}
              {pendingBacklog.length > 0 && (
                <div style={{ background: '#fff8eb', border: '1px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-pin" style={{ color: '#d97706', fontSize: 18 }}></i>
                    <span style={{ fontSize: 12.5, color: '#92400e', fontWeight: 600 }}>
                      <strong>Replanejamento:</strong> {pendingBacklog.length} habilidade(s) adiada(s) da aula anterior: <strong>{pendingBacklog.join(', ')}</strong>
                    </span>
                  </div>
                  <button
                    onClick={() => importPendingBacklogSkill(pendingBacklog[0])}
                    style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Incluir no Plano de Hoje
                  </button>
                </div>
              )}

              {/* Lista de Habilidades Selecionadas com Status */}
              {selectedSkills.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {selectedSkills.map(sk => (
                    <div key={sk.code} style={{ background: '#fdf8f2', border: '1px solid #e8decb', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <strong style={{ color: '#8b5e3c', fontSize: 12.5 }}>[{sk.code}]</strong>
                        <span style={{ fontSize: 12, color: '#4a382a', marginLeft: 6 }}>{sk.desc}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => setSkillStatus(sk.code, 'covered')}
                          style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: sk.status === 'covered' ? '#2d9d5d' : '#eee', color: sk.status === 'covered' ? '#fff' : '#555', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ✓ Coberta
                        </button>
                        <button
                          onClick={() => setSkillStatus(sk.code, 'postponed')}
                          style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: sk.status === 'postponed' ? '#d97706' : '#eee', color: sk.status === 'postponed' ? '#fff' : '#555', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ⏳ Adiar
                        </button>
                        <button
                          onClick={() => toggleSkill({ code: sk.code } as any)}
                          style={{ background: 'transparent', border: 'none', color: '#dc322f', cursor: 'pointer', fontSize: 13 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Seletor Rápido de Habilidades da BNCC */}
              <div>
                <input
                  placeholder="Pesquisar código ou descrição na BNCC..."
                  value={skillSearch}
                  onChange={e => setSkillSearch(e.target.value)}
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12.5, marginBottom: 8, outline: 'none' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                  {availableBnccSkills
                    .filter(s => s.code.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                    .map(s => {
                      const isSelected = selectedSkills.some(sel => sel.code === s.code)
                      return (
                        <div
                          key={s.code}
                          onClick={() => toggleSkill(s)}
                          style={{
                            padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                            border: isSelected ? '1px solid #8b5e3c' : '1px solid #e8decb',
                            background: isSelected ? '#f5efe6' : '#fff',
                            fontSize: 11.5, color: isSelected ? '#8b5e3c' : '#4a382a',
                            display: 'flex', alignItems: 'center', gap: 6
                          }}
                        >
                          <input type="checkbox" checked={isSelected} readOnly />
                          <span><strong>{s.code}</strong>: {s.description.slice(0, 50)}...</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>

            {/* Box 4: Metodologia & Ações Pedagógicas */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 20 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 12 }}>
                📦 Box 4: Metodologia Ativa Selecionada
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {METHODOLOGY_PRESETS.map(m => {
                  const isSel = selectedMethodology === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMethodology(m.id)}
                      style={{
                        padding: 12, borderRadius: 10, cursor: 'pointer',
                        border: isSel ? `2px solid ${m.badge}` : '1px solid #e8decb',
                        background: isSel ? '#fdf8f2' : '#fff',
                        transition: 'all 0.15s'
                      }}
                    >
                      <strong style={{ fontSize: 12.5, color: '#2c1a0e', display: 'block', marginBottom: 4 }}>{m.name}</strong>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#7a6552', lineHeight: 1.35 }}>{m.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Box 5: Material de Referência (Multi-Turma) */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 20 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 12 }}>
                📦 Box 5: Livro Didático & Material de Referência
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Livro / Apostila</label>
                  <input
                    value={bookTitle}
                    onChange={e => setBookTitle(e.target.value)}
                    placeholder="Ex: Eyes Open 3 (Cambridge)"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Unidade / Capítulo</label>
                  <input
                    value={unitChapter}
                    onChange={e => setUnitChapter(e.target.value)}
                    placeholder="Ex: Unit 4"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Páginas</label>
                  <input
                    value={pages}
                    onChange={e => setPages(e.target.value)}
                    placeholder="Ex: pp. 44-47"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                </div>
              </div>
            </div>

            {/* Box 6: Roteiro com Timing por Etapa */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  📦 Box 6: Roteiro da Aula & Timing ({totalTiming} min)
                </span>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800,
                  background: totalTiming === 50 ? '#dcfce7' : '#fef3c7',
                  color: totalTiming === 50 ? '#15803d' : '#b45309'
                }}>
                  {totalTiming} / 50 min
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stages.map((stage, idx) => (
                  <div key={idx} style={{ background: '#fdf8f2', border: '1px solid #e8decb', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: '180px 70px 1fr 1fr 30px', gap: 10, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={stage.completed || false}
                        onChange={e => {
                          const updated = [...stages]
                          updated[idx].completed = e.target.checked
                          setStages(updated)
                        }}
                      />
                      <input
                        value={stage.name}
                        onChange={e => {
                          const updated = [...stages]
                          updated[idx].name = e.target.value
                          setStages(updated)
                        }}
                        style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 12.5, color: '#2c1a0e', outline: 'none', width: '100%' }}
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        value={stage.durationMin}
                        onChange={e => {
                          const updated = [...stages]
                          updated[idx].durationMin = Number(e.target.value)
                          setStages(updated)
                        }}
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 12, textAlign: 'center' }}
                      />
                    </div>

                    <div>
                      <input
                        value={stage.teacherAction}
                        placeholder="Ação do Professor..."
                        onChange={e => {
                          const updated = [...stages]
                          updated[idx].teacherAction = e.target.value
                          setStages(updated)
                        }}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 12 }}
                      />
                    </div>

                    <div>
                      <input
                        value={stage.studentAction}
                        placeholder="Ação do Aluno..."
                        onChange={e => {
                          const updated = [...stages]
                          updated[idx].studentAction = e.target.value
                          setStages(updated)
                        }}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 12 }}
                      />
                    </div>

                    <button
                      onClick={() => setStages(stages.filter((_, i) => i !== idx))}
                      style={{ background: 'transparent', border: 'none', color: '#dc322f', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStages([...stages, { name: 'Nova Etapa', durationMin: 5, teacherAction: '', studentAction: '', completed: false }])}
                style={{ marginTop: 10, background: 'transparent', border: '1px dashed #8b5e3c', color: '#8b5e3c', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                + Adicionar Etapa ao Roteiro
              </button>
            </div>

            {/* Box 7: Tarefa de Casa & Anotações */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                    📦 Box 7: Tarefa de Casa (Homework)
                  </span>
                  <textarea
                    value={homework}
                    onChange={e => setHomework(e.target.value)}
                    placeholder="Ex: Workbook p. 28 exercícios 1 a 3..."
                    rows={3}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12.5, outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                    📦 Box 8: Anotações Pós-Aula (Log Reflexivo)
                  </span>
                  <textarea
                    value={postLessonNotes}
                    onChange={e => setPostLessonNotes(e.target.value)}
                    placeholder="Como a turma respondeu? Quais pontos precisam de revisão na próxima aula?"
                    rows={3}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12.5, outline: 'none', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* ─── RODAPÉ DE AÇÃO COM OS 2 BOTÕES DISTINTOS (BLOCO H) ───────── */}
            <div style={{
              background: '#fffcf8', border: '1px solid #d5c0b0', borderRadius: 16,
              padding: '16px 24px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: 12, boxShadow: '0 4px 14px rgba(44,26,14,0.06)'
            }}>
              {/* Botões de Exportação Universal */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleExportPdf} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-printer"></i> PDF
                </button>
                <button onClick={handleExportWord} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-file-text"></i> Word (.doc)
                </button>
                <button onClick={handleExportExcel} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-table"></i> Excel (.csv)
                </button>
                <button
                  onClick={() => setShowAttachActivityModal(true)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #268bd2', background: '#e8f4fd', color: '#268bd2', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="ti ti-link"></i> Anexar Atividade do Banco
                </button>
              </div>

              {/* OS 2 BOTÕES DE SALVAMENTO DISTINTOS */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleSaveToCalendar}
                  style={{
                    padding: '10px 18px', borderRadius: 10, border: '1.5px solid #8b5e3c',
                    background: '#fff', color: '#8b5e3c', fontSize: 13,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <i className="ti ti-calendar-plus"></i> Salvar no Calendário
                </button>

                <button
                  onClick={handleSaveToBank}
                  style={{
                    padding: '10px 20px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #8b5e3c 0%, #6f4728 100%)',
                    color: '#fff', fontSize: 13.5, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 3px 10px rgba(139,94,60,0.3)'
                  }}
                >
                  <i className="ti ti-database"></i> Salvar no Banco
                </button>
              </div>
            </div>

          </div>

          {/* ─── COLUNA LATERAL: PERGUNTAS-GUIA & RESUMO DA AULA ANTERIOR ──── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Box Lateral 1: Perguntas-Guia (Guiding Questions) */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                  ❓ Perguntas-Guia (Key Questions)
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: '#7a6552', margin: '0 0 10px 0', lineHeight: 1.35 }}>
                O que os alunos devem ser capazes de responder ou demonstrar ao final desta aula:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {guidingQuestions.map((q, idx) => (
                  <input
                    key={idx}
                    value={q}
                    onChange={e => {
                      const updated = [...guidingQuestions]
                      updated[idx] = e.target.value
                      setGuidingQuestions(updated)
                    }}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12, color: '#2c1a0e', outline: 'none' }}
                  />
                ))}
              </div>
            </div>

            {/* Box Lateral 2: Resumo da Aula Anterior com Navegação Histórica */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                  ⏮️ Histórico de Aulas ({currentClass?.name || 'Turma'})
                </span>
              </div>

              {classHistoryPlans.length === 0 ? (
                <p style={{ fontSize: 12, color: '#a08060', margin: 0 }}>
                  Nenhum plano anterior salvo no banco para esta turma.
                </p>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: '#7a6552' }}>
                      Aula {historyIndex + 1} de {classHistoryPlans.length}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        disabled={historyIndex >= classHistoryPlans.length - 1}
                        onClick={() => setHistoryIndex(historyIndex + 1)}
                        style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fff', cursor: 'pointer', fontSize: 11 }}
                      >
                        ◀ Mais Antiga
                      </button>
                      <button
                        disabled={historyIndex <= 0}
                        onClick={() => setHistoryIndex(historyIndex - 1)}
                        style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fff', cursor: 'pointer', fontSize: 11 }}
                      >
                        Mais Recente ▶
                      </button>
                    </div>
                  </div>

                  {classHistoryPlans[historyIndex] && (
                    <div style={{ background: '#fdf8f2', padding: 12, borderRadius: 10, border: '1px solid #e8decb' }}>
                      <strong style={{ fontSize: 12.5, color: '#2c1a0e', display: 'block' }}>
                        {classHistoryPlans[historyIndex].topic}
                      </strong>
                      <div style={{ fontSize: 11, color: '#8b5e3c', margin: '2px 0 6px 0' }}>
                        Data: {new Date(classHistoryPlans[historyIndex].date).toLocaleDateString('pt-BR')}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#4a382a', lineHeight: 1.35 }}>
                        <strong>Dever de Casa Dado:</strong> {classHistoryPlans[historyIndex].homework || 'Nenhum'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ─── ABA 2: BANCO DE PLANEJAMENTO (REPOSITÓRIO PERENE) ──────────────── */}
      {activeTab === 'bank' && (
        <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, color: '#2c1a0e', margin: '0 0 4px 0' }}>
                Acervo de Planos de Aula Salvos
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#7a6552' }}>
                Planos perenes recuperáveis e reutilizáveis ano a ano por turma e tópico curricular.
              </p>
            </div>
          </div>

          {bankPlans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a08060' }}>
              <i className="ti ti-archive" style={{ fontSize: 48, opacity: 0.4, marginBottom: 12 }}></i>
              <p>Nenhum plano salvo no banco ainda. Crie um plano na aba anterior e clique em "Salvar no Banco".</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {bankPlans.map(plan => (
                <div key={plan.id} style={{ background: '#fdf8f2', border: '1px solid #e8decb', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700 }}>
                        {plan.className}
                      </span>
                      <span style={{ fontSize: 11, color: '#7a6552' }}>
                        {new Date(plan.date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <strong style={{ fontSize: 14, color: '#2c1a0e', display: 'block', marginBottom: 6 }}>
                      {plan.topic}
                    </strong>
                    <div style={{ fontSize: 11.5, color: '#7a6552', marginBottom: 10 }}>
                      Espaço: {plan.roomSpace} &bull; {plan.stages?.length || 4} etapas
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 12, borderTop: '1px solid #e8decb', paddingTop: 10 }}>
                    <button
                      onClick={() => {
                        setTopic(plan.topic)
                        setSelectedClassId(plan.classId)
                        setStages(plan.stages || DEFAULT_STAGES)
                        setGuidingQuestions(plan.guidingQuestions || [])
                        setHomework(plan.homework || '')
                        setPostLessonNotes(plan.postLessonNotes || '')
                        setActiveTab('editor')
                        showNotification('Plano carregado no editor para reutilização!')
                      }}
                      style={{ flex: 1, padding: '6px 10px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Reutilizar / Editar
                    </button>
                    <button
                      onClick={() => {
                        const updated = bankPlans.filter(p => p.id !== plan.id)
                        setBankPlans(updated)
                        localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updated))
                      }}
                      style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: ANEXAR ATIVIDADE DO BANCO (BLOCO I) ────────────────────── */}
      {showAttachActivityModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fffcf8', border: '1px solid #ede8dc', borderRadius: 16, padding: 24, width: 520, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#2c1a0e' }}>
                🔗 Vincular Atividade do Banco de Questões
              </h3>
              <button onClick={() => setShowAttachActivityModal(false)} style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>

            {availableQuestions.length === 0 ? (
              <p style={{ fontSize: 13, color: '#7a6552' }}>Nenhuma atividade salva no Banco de Atividades ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {availableQuestions.slice(0, 15).map((q: any) => (
                  <div key={q.id} style={{ background: '#fdf8f2', border: '1px solid #e8decb', padding: 10, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 12.5, color: '#2c1a0e' }}>{q.topic || 'Exercício'}</strong>
                      <div style={{ fontSize: 11.5, color: '#7a6552' }}>{q.statement?.slice(0, 60)}...</div>
                    </div>
                    <button
                      onClick={() => {
                        setHomework(prev => `${prev ? prev + '\n' : ''}Atividade Vinculada: [${q.topic || 'Exercício'}] ${q.statement}`)
                        setShowAttachActivityModal(false)
                        showNotification('Atividade vinculada como Homework da aula!')
                      }}
                      style={{ background: '#268bd2', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      + Anexar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#2c1a0e', color: '#fdf8f2', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

    </div>
  )
}