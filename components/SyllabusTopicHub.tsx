'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  LooseFileItem,
  saveLooseFileToSupabase,
  fetchSyllabusesFromSupabase,
  saveSyllabusToSupabase,
  deleteSyllabusFromSupabase,
  fetchSchoolsFromSupabase,
  fetchClassesFromSupabase
} from '@/lib/supabaseClient'

export interface SyllabusEntry {
  id: string
  title: string
  school: string
  className: string
  term: string // 1º Trimestre, 2º Bimestre, etc.
  bookTitle: string // Nome do livro ou apostila
  bookUnitsChapters: string // Capítulos, Unidades e Páginas expressas
  grammarTopics: string[] // Lista de tópicos gramaticais abordados
  vocabularyThemes: string[] // Campos lexicais / vocabulário chave
  skillsAndObjectives: string[] // Habilidades BNCC / CEFR / Objetivos pedagógicos
  studyTips: string // Roteiro de estudos / Orientações aos alunos
  status: 'planejado' | 'em_andamento' | 'lecionado' | 'avaliado'
  evaluationDate?: string // Data da prova ou avaliação
  createdAt: string
  updatedAt: string
}

export interface SyllabusApplyPayload {
  topic: string
  bookTitle: string
  bookUnitsChapters: string
  grammarTopics: string[]
  vocabularyThemes: string[]
  skillsAndObjectives: string[]
  studyTips: string
  customPromptInstruction: string
  school?: string
  className?: string
}

interface SyllabusTopicHubProps {
  onApplyToPrompt?: (payload: SyllabusApplyPayload) => void
  targetModule: 'aula' | 'prova' | 'exercicio'
}

const COMMON_GRAMMAR_SUGGESTIONS = [
  'Simple Present & Daily Routines',
  'Present Continuous & Actions Now',
  'Simple Past (Regular & Irregular Verbs)',
  'Past Continuous & Interrupted Actions',
  'Present Perfect (Experiences & Unfinished Time)',
  'Present Perfect Continuous',
  'Past Perfect & Past Narratives',
  'Future: Will, Going to & Present Continuous',
  'First Conditional (Real Conditions)',
  'Second Conditional (Hypothetical Situations)',
  'Third Conditional & Regrets',
  'Modal Verbs (Can, Could, Must, Should, May, Might)',
  'Passive Voice (Present & Past)',
  'Relative Clauses (Defining & Non-Defining)',
  'Reported Speech (Statements & Questions)',
  'Comparatives & Superlatives',
  'Quantifiers (Much, Many, Few, Little, A lot of)',
  'Phrasal Verbs with Get, Turn, Look, Take',
  'Gerunds vs. Infinitives',
  'Question Tags & CCQs'
]

export default function SyllabusTopicHub({ onApplyToPrompt, targetModule }: SyllabusTopicHubProps) {
  const [syllabuses, setSyllabuses] = useState<SyllabusEntry[]>([])
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'editor' | 'document' | 'timeline'>('list')
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<string | null>(null)
  const [isLoadingCloud, setIsLoadingCloud] = useState(false)

  // Filtros da Listagem
  const [filterSchool, setFilterSchool] = useState('all')
  const [filterClass, setFilterClass] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Estado do Formulário de Edição
  const [formId, setFormId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formSchool, setFormSchool] = useState('')
  const [formClassName, setFormClassName] = useState('')
  const [formTerm, setFormTerm] = useState('2º Trimestre')
  const [formBookTitle, setFormBookTitle] = useState('')
  const [formBookUnitsChapters, setFormBookUnitsChapters] = useState('')
  const [formGrammarTopics, setFormGrammarTopics] = useState<string[]>([])
  const [newGrammarInput, setNewGrammarInput] = useState('')
  const [formVocabularyThemes, setFormVocabularyThemes] = useState<string[]>([])
  const [newVocabInput, setNewVocabInput] = useState('')
  const [formSkills, setFormSkills] = useState<string[]>([])
  const [newSkillInput, setNewSkillInput] = useState('')
  const [formStudyTips, setFormStudyTips] = useState('')
  const [formStatus, setFormStatus] = useState<SyllabusEntry['status']>('planejado')
  const [formEvaluationDate, setFormEvaluationDate] = useState('')

  // Escolas e Turmas Reais (Carregadas do Supabase & LocalStorage)
  const [availableSchools, setAvailableSchools] = useState<string[]>([])
  const [availableClasses, setAvailableClasses] = useState<string[]>([])

  // Carrega dados REAIS do Supabase Cloud e LocalStorage
  useEffect(() => {
    async function loadRealData() {
      setIsLoadingCloud(true)
      let initialList: SyllabusEntry[] = []

      // 1. Tenta carregar do LocalStorage primeiro para resposta instantânea
      try {
        const saved = localStorage.getItem('teacher_syllabuses_v1')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) {
            initialList = parsed
            setSyllabuses(parsed)
            if (parsed.length > 0) setSelectedSyllabusId(parsed[0].id)
          }
        }
      } catch {}

      // 2. Busca do Supabase Cloud (Tabela syllabuses)
      try {
        const cloudSyllabuses = await fetchSyllabusesFromSupabase()
        if (Array.isArray(cloudSyllabuses) && cloudSyllabuses.length > 0) {
          // Faz merge por ID dando prioridade aos dados atualizados
          const combinedMap = new Map<string, SyllabusEntry>()
          cloudSyllabuses.forEach(s => combinedMap.set(s.id, s))
          initialList.forEach(s => {
            if (!combinedMap.has(s.id)) combinedMap.set(s.id, s)
          })
          const merged = Array.from(combinedMap.values())
          setSyllabuses(merged)
          localStorage.setItem('teacher_syllabuses_v1', JSON.stringify(merged))
          if (merged.length > 0) setSelectedSyllabusId(merged[0].id)
        }
      } catch {}

      // 3. Busca Escolas Reais do Supabase e LocalStorage
      try {
        const cloudSchools = await fetchSchoolsFromSupabase()
        let schoolNames: string[] = cloudSchools.map((s: any) => s.name).filter(Boolean)
        const localSchools = localStorage.getItem('teacher_schools')
        if (localSchools) {
          const parsed = JSON.parse(localSchools)
          if (Array.isArray(parsed)) {
            const lNames = parsed.map((s: any) => typeof s === 'string' ? s : s.name).filter(Boolean)
            schoolNames = Array.from(new Set([...schoolNames, ...lNames]))
          }
        }
        setAvailableSchools(schoolNames)
      } catch {}

      // 4. Busca Turmas Reais do Supabase e LocalStorage
      try {
        const cloudClasses = await fetchClassesFromSupabase()
        let classNames: string[] = cloudClasses.map((c: any) => c.name).filter(Boolean)
        const localClasses = localStorage.getItem('teacher_classes')
        if (localClasses) {
          const parsed = JSON.parse(localClasses)
          if (Array.isArray(parsed)) {
            const cNames = parsed.map((c: any) => typeof c === 'string' ? c : c.name).filter(Boolean)
            classNames = Array.from(new Set([...classNames, ...cNames]))
          }
        }
        setAvailableClasses(classNames)
      } catch {}

      setIsLoadingCloud(false)
    }

    loadRealData()
  }, [])

  // Sincroniza tópicos ativos com o sistema global para alimentar Insights e Desempenho
  useEffect(() => {
    if (syllabuses.length > 0) {
      const allGrammar = Array.from(new Set(syllabuses.flatMap(s => s.grammarTopics)))
      try {
        localStorage.setItem('teacher_active_topics', JSON.stringify(allGrammar))
      } catch {}
    }
  }, [syllabuses])

  const persistSyllabuses = async (newList: SyllabusEntry[]) => {
    setSyllabuses(newList)
    try {
      localStorage.setItem('teacher_syllabuses_v1', JSON.stringify(newList))
    } catch {}
  }

  const currentSelectedSyllabus = useMemo(() => {
    return syllabuses.find(s => s.id === selectedSyllabusId) || syllabuses[0] || null
  }, [syllabuses, selectedSyllabusId])

  const filteredSyllabuses = useMemo(() => {
    return syllabuses.filter(s => {
      if (filterSchool !== 'all' && s.school !== filterSchool) return false
      if (filterClass !== 'all' && s.className !== filterClass) return false
      if (filterStatus !== 'all' && s.status !== filterStatus) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const matchTitle = s.title.toLowerCase().includes(q)
        const matchBook = s.bookTitle.toLowerCase().includes(q)
        const matchUnits = s.bookUnitsChapters.toLowerCase().includes(q)
        const matchGrammar = s.grammarTopics.some(g => g.toLowerCase().includes(q))
        return matchTitle || matchBook || matchUnits || matchGrammar
      }
      return true
    })
  }, [syllabuses, filterSchool, filterClass, filterStatus, searchTerm])

  const handleOpenCreateNew = () => {
    setFormId(null)
    setFormTitle('')
    setFormSchool(availableSchools[0] || '')
    setFormClassName(availableClasses[0] || '')
    setFormTerm('2º Trimestre')
    setFormBookTitle('')
    setFormBookUnitsChapters('')
    setFormGrammarTopics([])
    setFormVocabularyThemes([])
    setFormSkills([])
    setFormStudyTips('')
    setFormStatus('planejado')
    setFormEvaluationDate(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0])
    setActiveSubTab('editor')
  }

  const handleOpenEdit = (item: SyllabusEntry) => {
    setFormId(item.id)
    setFormTitle(item.title)
    setFormSchool(item.school)
    setFormClassName(item.className)
    setFormTerm(item.term)
    setFormBookTitle(item.bookTitle)
    setFormBookUnitsChapters(item.bookUnitsChapters)
    setFormGrammarTopics([...item.grammarTopics])
    setFormVocabularyThemes([...item.vocabularyThemes])
    setFormSkills([...item.skillsAndObjectives])
    setFormStudyTips(item.studyTips)
    setFormStatus(item.status)
    setFormEvaluationDate(item.evaluationDate || '')
    setActiveSubTab('editor')
  }

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) {
      showToast('⚠️ Por favor, informe um título para a ementa.')
      return
    }

    const now = new Date().toISOString()
    let savedItem: SyllabusEntry

    if (formId) {
      savedItem = {
        id: formId,
        title: formTitle.trim(),
        school: formSchool.trim(),
        className: formClassName.trim(),
        term: formTerm.trim(),
        bookTitle: formBookTitle.trim(),
        bookUnitsChapters: formBookUnitsChapters.trim(),
        grammarTopics: formGrammarTopics,
        vocabularyThemes: formVocabularyThemes,
        skillsAndObjectives: formSkills,
        studyTips: formStudyTips.trim(),
        status: formStatus,
        evaluationDate: formEvaluationDate,
        createdAt: syllabuses.find(s => s.id === formId)?.createdAt || now,
        updatedAt: now
      }

      const updated = syllabuses.map(s => s.id === formId ? savedItem : s)
      await persistSyllabuses(updated)
      setSelectedSyllabusId(formId)
      showToast('✅ Ementa atualizada no Supabase e no sistema!')
    } else {
      savedItem = {
        id: `syl_${Date.now()}`,
        title: formTitle.trim(),
        school: formSchool.trim(),
        className: formClassName.trim(),
        term: formTerm.trim(),
        bookTitle: formBookTitle.trim(),
        bookUnitsChapters: formBookUnitsChapters.trim(),
        grammarTopics: formGrammarTopics,
        vocabularyThemes: formVocabularyThemes,
        skillsAndObjectives: formSkills,
        studyTips: formStudyTips.trim(),
        status: formStatus,
        evaluationDate: formEvaluationDate,
        createdAt: now,
        updatedAt: now
      }

      const newList = [savedItem, ...syllabuses]
      await persistSyllabuses(newList)
      setSelectedSyllabusId(savedItem.id)
      showToast('🎉 Ementa gravada com sucesso no Supabase!')
    }

    // Persiste no Supabase Cloud
    await saveSyllabusToSupabase(savedItem)

    // Se escola ou turma forem novas, adiciona à lista local
    if (formSchool.trim() && !availableSchools.includes(formSchool.trim())) {
      setAvailableSchools(prev => [...prev, formSchool.trim()])
    }
    if (formClassName.trim() && !availableClasses.includes(formClassName.trim())) {
      setAvailableClasses(prev => [...prev, formClassName.trim()])
    }

    setActiveSubTab('document')
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta ementa?')) {
      const remaining = syllabuses.filter(s => s.id !== id)
      await persistSyllabuses(remaining)
      if (selectedSyllabusId === id) {
        setSelectedSyllabusId(remaining[0]?.id || null)
      }
      await deleteSyllabusFromSupabase(id)
      showToast('🗑️ Ementa excluída do Supabase.')
    }
  }

  const handleAddGrammarTag = (tag: string) => {
    const clean = tag.trim()
    if (clean && !formGrammarTopics.includes(clean)) {
      setFormGrammarTopics([...formGrammarTopics, clean])
      setNewGrammarInput('')
    }
  }

  const handleRemoveGrammarTag = (idx: number) => {
    setFormGrammarTopics(formGrammarTopics.filter((_, i) => i !== idx))
  }

  const handleAddVocabTag = (tag: string) => {
    const clean = tag.trim()
    if (clean && !formVocabularyThemes.includes(clean)) {
      setFormVocabularyThemes([...formVocabularyThemes, clean])
      setNewVocabInput('')
    }
  }

  const handleRemoveVocabTag = (idx: number) => {
    setFormVocabularyThemes(formVocabularyThemes.filter((_, i) => i !== idx))
  }

  const handleAddSkillTag = (tag: string) => {
    const clean = tag.trim()
    if (clean && !formSkills.includes(clean)) {
      setFormSkills([...formSkills, clean])
      setNewSkillInput('')
    }
  }

  const handleRemoveSkillTag = (idx: number) => {
    setFormSkills(formSkills.filter((_, i) => i !== idx))
  }

  // ALIMENTAR O PROMPT DA CRIAÇÃO ATUAL COM VALORES REAIS
  const handleApplyToCreation = (item: SyllabusEntry) => {
    const promptInstruction = `DIRETRIZES DA EMENTA PROGRAMÁTICA:
- Livro / Material Base: ${item.bookTitle || 'Material Didático da Turma'}
- Capítulos e Unidades Expressas: ${item.bookUnitsChapters || 'Conforme cronograma'}
- Tópicos Gramaticais Obrigatórios: ${item.grammarTopics.join('; ') || 'Tópicos essenciais'}
- Vocabulário e Temáticas em Foco: ${item.vocabularyThemes.join('; ') || 'Vocabulário da unidade'}
- Objetivos de Aprendizagem / BNCC: ${item.skillsAndObjectives.join('; ') || 'Desenvolvimento de competências'}
- Requisitos: Aborde rigorosamente o escopo do livro e nível dos tópicos para a turma ${item.className || 'de Língua Inglesa'}.`

    const payload: SyllabusApplyPayload = {
      topic: item.grammarTopics.join(', ') || item.title,
      bookTitle: item.bookTitle,
      bookUnitsChapters: item.bookUnitsChapters,
      grammarTopics: item.grammarTopics,
      vocabularyThemes: item.vocabularyThemes,
      skillsAndObjectives: item.skillsAndObjectives,
      studyTips: item.studyTips,
      customPromptInstruction: promptInstruction,
      school: item.school,
      className: item.className
    }

    if (onApplyToPrompt) {
      onApplyToPrompt(payload)
      const targetName = targetModule === 'prova' ? 'Prova' : targetModule === 'exercicio' ? 'Exercício' : 'Plano de Aula'
      showToast(`✨ Tópicos e Capítulos aplicados no Gerador de ${targetName}!`)
    }
  }

  // Sincronizar com o Diário de Classe
  const handlePushToClassLog = (item: SyllabusEntry) => {
    try {
      const logsStr = localStorage.getItem('teacher_class_logs_v1') || localStorage.getItem('teacher_class_logs') || '[]'
      const logs = JSON.parse(logsStr)

      const newLog = {
        id: `log_syl_${Date.now()}`,
        school: item.school || '',
        className: item.className || '',
        date: item.evaluationDate || new Date().toISOString().split('T')[0],
        dayOfWeek: 'Conforme Cronograma',
        semester: '2º Semestre',
        quarter: item.term || '2º Trimestre',
        topic: `[Ementa] ${item.grammarTopics.join('; ')} (${item.bookUnitsChapters})`,
        focusSkill: 'Grammar & Vocabulary',
        resources: item.bookTitle ? `Livro ${item.bookTitle} - ${item.bookUnitsChapters}` : item.bookUnitsChapters,
        warmup: 'Revisão contextualizada dos tópicos da ementa.',
        presentation: `Apresentação dos conceitos gramaticais: ${item.grammarTopics.join(', ')}.`,
        practice: `Prática guiada com exercícios do livro (${item.bookUnitsChapters}).`,
        wrapup: 'Checagem de dúvidas e orientações para a avaliação.',
        whatWorked: 'Conteúdo programático alinhado com o cronograma da turma.',
        whatCanImprove: '',
        whatWasMissing: '',
        needsReviewNextClass: '',
        groupObservations: `Tópicos programáticos registrados via Ementa em ${new Date().toLocaleDateString('pt-BR')}.`,
        spaceUsed: 'Sala de Aula',
        studentNotes: '',
        createdAt: new Date().toISOString()
      }

      const updatedLogs = [newLog, ...logs]
      localStorage.setItem('teacher_class_logs_v1', JSON.stringify(updatedLogs))
      window.dispatchEvent(new CustomEvent('teacher_classlog_updated', { detail: newLog }))

      const updatedSyllabuses = syllabuses.map(s => {
        if (s.id === item.id) return { ...s, status: 'em_andamento' as const }
        return s
      })
      persistSyllabuses(updatedSyllabuses)

      showToast('📅 Matéria registrada no Diário de Classe & Linha do Tempo!')
    } catch {
      showToast('Erro ao sincronizar com o Diário de Classe.')
    }
  }

  // Salvar Documento Avulso na Biblioteca
  const handleSaveToRepository = async (item: SyllabusEntry) => {
    const documentMarkdown = buildDocumentMarkdown(item)
    const looseFile: LooseFileItem = {
      id: `loose_syl_${Date.now()}`,
      title: `[Ementa] ${item.title}`,
      fileName: `ementa_${(item.school || 'escola').toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.txt`,
      category: 'Atividade',
      extractedText: documentMarkdown,
      fileType: 'text',
      fileSize: typeof Blob !== 'undefined' ? new Blob([documentMarkdown]).size : documentMarkdown.length,
      tags: ['Ementa', 'Tópicos Gramaticais', ...(item.school ? [item.school] : []), ...(item.className ? [item.className] : []), ...item.grammarTopics.slice(0, 3)],
      school: item.school,
      className: item.className,
      date: new Date().toLocaleDateString('pt-BR'),
      createdAt: new Date().toISOString()
    }

    try {
      const existingStr = localStorage.getItem('teacher_loose_files_v1') || '[]'
      const existing = JSON.parse(existingStr)
      const updated = [looseFile, ...existing]
      localStorage.setItem('teacher_loose_files_v1', JSON.stringify(updated))
      await saveLooseFileToSupabase(looseFile)
      showToast('📚 Documento avulso salvo na Biblioteca de Arquivos!')
    } catch {
      showToast('Documento salvo localmente na Biblioteca.')
    }
  }

  // Copiar para WhatsApp / Classroom
  const handleCopyForWhatsApp = (item: SyllabusEntry) => {
    const text = `📋 *${item.title.toUpperCase()}*
${item.school ? `🏫 *Escola:* ${item.school}` : ''}${item.className ? ` | *Turma:* ${item.className}` : ''}
${item.term ? `📅 *Período:* ${item.term}` : ''} ${item.evaluationDate ? `| *Data Prevista:* ${formatDateBR(item.evaluationDate)}` : ''}
━━━━━━━━━━━━━━━━━━━━━

${item.bookTitle || item.bookUnitsChapters ? `📖 *LIVRO & CAPÍTULOS EM FOCO:*
${item.bookTitle ? `• *Material:* ${item.bookTitle}\n` : ''}${item.bookUnitsChapters ? `• *Capítulos/Páginas:* ${item.bookUnitsChapters}\n` : ''}` : ''}
${item.grammarTopics.length > 0 ? `🧩 *TÓPICOS GRAMATICAIS:*
${item.grammarTopics.map(g => `• ${g}`).join('\n')}
` : ''}${item.vocabularyThemes.length > 0 ? `🔤 *VOCABULÁRIO & TEMÁTICAS:*
${item.vocabularyThemes.map(v => `• ${v}`).join('\n')}
` : ''}${item.skillsAndObjectives.length > 0 ? `🎯 *HABILIDADES & OBJETIVOS:*
${item.skillsAndObjectives.map(s => `• ${s}`).join('\n')}
` : ''}${item.studyTips ? `💡 *ORIENTAÇÕES DE ESTUDO:*\n${item.studyTips}\n` : ''}━━━━━━━━━━━━━━━━━━━━━
_Documento oficial de acompanhamento pedagógico._`

    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 Ementa formatada copiada para a área de transferência!')
    }).catch(() => {
      showToast('Erro ao copiar texto.')
    })
  }

  function formatDateBR(dateStr?: string) {
    if (!dateStr) return ''
    try {
      const [y, m, d] = dateStr.split('-')
      if (y && m && d) return `${d}/${m}/${y}`
      return dateStr
    } catch {
      return dateStr
    }
  }

  function buildDocumentMarkdown(item: SyllabusEntry): string {
    return `# ${item.title}
${item.school ? `**Escola:** ${item.school} | ` : ''}${item.className ? `**Turma:** ${item.className} | ` : ''}**Período:** ${item.term || 'Trimestre'}
${item.evaluationDate ? `**Data Prevista:** ${formatDateBR(item.evaluationDate)}\n` : ''}

---

## 1. Material Didático e Capítulos Expressos
* **Livro / Apostila:** ${item.bookTitle || 'Material Adotado'}
* **Capítulos e Unidades:** ${item.bookUnitsChapters || 'Conforme cronograma de aulas'}

## 2. Tópicos Gramaticais e Estruturas
${item.grammarTopics.length > 0 ? item.grammarTopics.map(g => `* ${g}`).join('\n') : '* Tópicos em desenvolvimento'}

## 3. Vocabulário e Campos Semânticos
${item.vocabularyThemes.length > 0 ? item.vocabularyThemes.map(v => `* ${v}`).join('\n') : '* Vocabulário contextualizado das unidades'}

## 4. Habilidades e Objetivos de Aprendizagem
${item.skillsAndObjectives.length > 0 ? item.skillsAndObjectives.map(s => `* ${s}`).join('\n') : '* Desenvolvimento de competências linguísticas'}

${item.studyTips ? `## 5. Roteiro e Dicas de Estudo\n${item.studyTips}\n` : ''}
`
  }

  const actionButtonLabel =
    targetModule === 'prova'
      ? '⚡ Alimentar Prompt da Prova'
      : targetModule === 'exercicio'
      ? '⚡ Alimentar Prompt de Exercícios'
      : '⚡ Alimentar Roteiro de Aula'

  return (
    <div style={{ padding: '8px 0', fontFamily: 'system-ui, sans-serif', color: '#073642' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 9999,
          background: '#073642',
          color: '#fdf6e3',
          padding: '14px 22px',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 14,
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Banner Informativo da Sub-Aba */}
      <div style={{
        background: 'linear-gradient(135deg, #fdf6e3 0%, #f7efe1 100%)',
        border: '1px solid #eee8d5',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#8b5e3c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 20
          }}>
            <i className="ti ti-notes" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: '0 0 2px 0', fontSize: 16, fontWeight: 800, color: '#073642' }}>
                Ementa & Conteúdo Programático
              </h3>
              <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-database" style={{ fontSize: 12 }} /> Supabase Cloud Sync
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#657b83' }}>
              Cadastre os <strong>tópicos gramaticais</strong> e <strong>capítulos do livro</strong>. Exporte o <strong>documento avulso</strong> e alimente o gerador em 1 clique.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreateNew}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#8b5e3c',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 2px 8px rgba(139, 94, 60, 0.25)'
          }}
        >
          <i className="ti ti-plus" /> Cadastrar Nova Ementa
        </button>
      </div>

      {/* Navegação Interna da Sub-Aba */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #eee8d5', marginBottom: 20 }}>
        {[
          { key: 'list', label: `📋 Todas as Ementas (${syllabuses.length})`, icon: 'ti-list' },
          { key: 'document', label: '📄 Documento Avulso (Ver & Enviar)', icon: 'ti-file-text' },
          { key: 'timeline', label: '⏱️ Linha do Tempo & Diário', icon: 'ti-timeline' },
          { key: 'editor', label: formId ? '✏️ Editar Ementa' : '✍️ Cadastrar Ementa', icon: 'ti-edit' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key as any)}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubTab === tab.key ? '3px solid #8b5e3c' : '3px solid transparent',
              color: activeSubTab === tab.key ? '#8b5e3c' : '#657b83',
              fontSize: 13.5,
              fontWeight: activeSubTab === tab.key ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
          >
            <i className={`ti ${tab.icon}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ABA: LISTA DE EMENTAS */}
      {activeSubTab === 'list' && (
        <div>
          {/* Barra de Filtros */}
          {syllabuses.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #eee8d5', borderRadius: 12, padding: 14, marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="🔍 Buscar por tópico, livro, unidade ou título..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid #d0c8b8', fontSize: 13 }}
              />
              {availableSchools.length > 0 && (
                <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d0c8b8', background: '#fff', fontSize: 12.5 }}>
                  <option value="all">Todas as Escolas</option>
                  {availableSchools.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {availableClasses.length > 0 && (
                <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d0c8b8', background: '#fff', fontSize: 12.5 }}>
                  <option value="all">Todas as Turmas</option>
                  {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d0c8b8', background: '#fff', fontSize: 12.5 }}>
                <option value="all">Todos os Status</option>
                <option value="planejado">📌 Planejado</option>
                <option value="em_andamento">⏳ Em Andamento</option>
                <option value="lecionado">✅ Lecionado</option>
                <option value="avaliado">📊 Avaliado</option>
              </select>
            </div>
          )}

          {/* Estado Vazio Real */}
          {syllabuses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 14, border: '2px dashed #d0c8b8' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fdf6e3', color: '#8b5e3c', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: 28 }}>
                <i className="ti ti-notebook" />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: 18, fontWeight: 700, color: '#073642' }}>
                Nenhuma ementa cadastrada ainda
              </h3>
              <p style={{ margin: '0 auto 20px auto', fontSize: 13.5, color: '#657b83', maxWidth: 500 }}>
                Cadastre os tópicos gramaticais e os capítulos do livro que você está trabalhando com suas turmas para gerar documentos avulsos e guiar a IA na criação de provas e exercícios.
              </p>
              <button
                onClick={handleOpenCreateNew}
                style={{
                  padding: '10px 22px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#8b5e3c',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(139,94,60,0.25)'
                }}
              >
                <i className="ti ti-plus" /> Cadastrar Primeira Ementa
              </button>
            </div>
          ) : filteredSyllabuses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 12, border: '1px solid #eee8d5' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#657b83' }}>Nenhuma ementa corresponde aos filtros selecionados.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {filteredSyllabuses.map(item => (
                <div key={item.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee8d5', padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {item.school && <span style={{ background: '#fdf6e3', color: '#8b5e3c', padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{item.school}</span>}
                        {item.className && <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{item.className}</span>}
                        {item.term && <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{item.term}</span>}
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: item.status === 'lecionado' ? '#dcfce7' : item.status === 'em_andamento' ? '#fef3c7' : item.status === 'avaliado' ? '#e0e7ff' : '#f1f5f9', color: item.status === 'lecionado' ? '#15803d' : item.status === 'em_andamento' ? '#b45309' : item.status === 'avaliado' ? '#4338ca' : '#64748b' }}>
                        {item.status === 'lecionado' ? '✅ Lecionado' : item.status === 'em_andamento' ? '⏳ Em Andamento' : item.status === 'avaliado' ? '📊 Avaliado' : '📌 Planejado'}
                      </span>
                    </div>

                    <h4 style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 700, color: '#073642' }}>{item.title}</h4>

                    {(item.bookTitle || item.bookUnitsChapters) && (
                      <div style={{ background: '#fbf8ef', padding: '8px 10px', borderRadius: 8, marginBottom: 10, fontSize: 12, color: '#586e75' }}>
                        📖 <strong>{item.bookTitle || 'Livro Base'}</strong> {item.bookUnitsChapters ? `• ${item.bookUnitsChapters}` : ''}
                      </div>
                    )}

                    {item.grammarTopics.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                        {item.grammarTopics.map((g, idx) => (
                          <span key={idx} style={{ background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #eee8d5', paddingTop: 12, marginTop: 8 }}>
                    <button
                      onClick={() => handleApplyToCreation(item)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}
                    >
                      <i className="ti ti-sparkles" /> {actionButtonLabel}
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setSelectedSyllabusId(item.id); setActiveSubTab('document') }} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d0c8b8', background: '#fff', color: '#073642', fontSize: 11.5, cursor: 'pointer' }}>
                          <i className="ti ti-eye" /> Ver Documento
                        </button>
                        <button onClick={() => handleCopyForWhatsApp(item)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #25d366', background: '#f0fdf4', color: '#16a34a', fontSize: 11.5, cursor: 'pointer' }} title="Copiar para WhatsApp/Classroom">
                          <i className="ti ti-brand-whatsapp" />
                        </button>
                        <button onClick={() => handlePushToClassLog(item)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d0c8b8', background: '#fff', color: '#268bd2', fontSize: 11.5, cursor: 'pointer' }} title="Lançar no Diário">
                          <i className="ti ti-timeline" />
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => handleOpenEdit(item)} style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid #d0c8b8', background: '#fff', color: '#586e75', fontSize: 11.5, cursor: 'pointer' }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: 11.5, cursor: 'pointer' }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA: DOCUMENTO AVULSO */}
      {activeSubTab === 'document' && (
        currentSelectedSyllabus ? (
          <div>
            <div style={{ background: '#fff', border: '1px solid #eee8d5', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#073642' }}>Ementa em Exibição:</label>
                <select value={selectedSyllabusId || ''} onChange={e => setSelectedSyllabusId(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d0c8b8', background: '#fff', fontSize: 12.5 }}>
                  {syllabuses.map(s => <option key={s.id} value={s.id}>{s.school ? `${s.school} - ` : ''}{s.className ? `${s.className}: ` : ''}{s.title}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => handleApplyToCreation(currentSelectedSyllabus)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-sparkles" /> {actionButtonLabel}
                </button>
                <button onClick={() => handleCopyForWhatsApp(currentSelectedSyllabus)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #25d366', background: '#25d366', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-brand-whatsapp" /> WhatsApp
                </button>
                <button onClick={() => window.print()} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #8b5e3c', background: '#fff', color: '#8b5e3c', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-printer" /> Imprimir / PDF
                </button>
                <button onClick={() => handleSaveToRepository(currentSelectedSyllabus)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d0c8b8', background: '#fff', color: '#073642', fontSize: 12.5, cursor: 'pointer' }}>
                  <i className="ti ti-bookmark" /> Biblioteca
                </button>
              </div>
            </div>

            {/* Folha A4 */}
            <div style={{ background: '#fff', maxWidth: 840, margin: '0 auto', padding: '40px 48px', borderRadius: 12, boxShadow: '0 3px 16px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', color: '#1e293b' }}>
              <div style={{ borderBottom: '2px solid #073642', paddingBottom: 12, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', color: '#073642' }}>{currentSelectedSyllabus.school || 'INSTITUIÇÃO DE ENSINO'}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Departamento de Língua Inglesa &bull; Coordenação Pedagógica</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#073642' }}>Turma: {currentSelectedSyllabus.className || 'Geral'}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>{currentSelectedSyllabus.term || 'Período Letivo'} {currentSelectedSyllabus.evaluationDate ? `• Avaliação: ${formatDateBR(currentSelectedSyllabus.evaluationDate)}` : ''}</div>
                </div>
              </div>

              <div style={{ textAlign: 'center', margin: '16px 0 22px 0' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#073642', margin: '0 0 4px 0' }}>{currentSelectedSyllabus.title}</h2>
                <div style={{ fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>Guia Oficial de Conteúdos &bull; Tópicos Gramaticais &bull; Roteiro de Estudos</div>
              </div>

              {(currentSelectedSyllabus.bookTitle || currentSelectedSyllabus.bookUnitsChapters) && (
                <div style={{ marginBottom: 20, background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: '#8b5e3c' }}>📖 1. Material Didático & Capítulos Expressos</h4>
                  {currentSelectedSyllabus.bookTitle && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Livro Base:</strong> {currentSelectedSyllabus.bookTitle}</div>}
                  {currentSelectedSyllabus.bookUnitsChapters && <div style={{ fontSize: 13 }}><strong>Unidades e Páginas:</strong> {currentSelectedSyllabus.bookUnitsChapters}</div>}
                </div>
              )}

              {currentSelectedSyllabus.grammarTopics.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: '#073642', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>🧩 2. Tópicos Gramaticais & Estruturas</h4>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {currentSelectedSyllabus.grammarTopics.map((g, idx) => (
                      <li key={idx} style={{ fontSize: 13, marginBottom: 4, fontWeight: 600 }}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {currentSelectedSyllabus.vocabularyThemes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: '#073642', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>🔤 3. Vocabulário & Campos Lexicais</h4>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {currentSelectedSyllabus.vocabularyThemes.map((v, idx) => (
                      <li key={idx} style={{ fontSize: 13, marginBottom: 4 }}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}

              {currentSelectedSyllabus.skillsAndObjectives.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: '#073642', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>🎯 4. Habilidades Pedagógicas (BNCC / CEFR)</h4>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {currentSelectedSyllabus.skillsAndObjectives.map((s, idx) => (
                      <li key={idx} style={{ fontSize: 12.5, marginBottom: 4, color: '#475569' }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {currentSelectedSyllabus.studyTips && (
                <div style={{ marginTop: 20, background: '#fffbeb', padding: '14px 16px', borderRadius: 8, border: '1px solid #fef3c7' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 800, color: '#92400e' }}>💡 5. Roteiro & Dicas de Estudo</h4>
                  <div style={{ fontSize: 12.5, color: '#78350f', whiteSpace: 'pre-line' }}>{currentSelectedSyllabus.studyTips}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '50px 20px', background: '#fff', borderRadius: 12, border: '1px solid #eee8d5' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#657b83' }}>Cadastre uma ementa para visualizar o documento de tópicos.</p>
          </div>
        )
      )}

      {/* ABA: LINHA DO TEMPO */}
      {activeSubTab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {syllabuses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', background: '#fff', borderRadius: 12, border: '1px solid #eee8d5' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#657b83' }}>Nenhuma matéria registrada na linha do tempo ainda.</p>
            </div>
          ) : (
            syllabuses.map((item, index) => (
              <div key={item.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #eee8d5', padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: item.status === 'lecionado' ? '#22c55e' : item.status === 'em_andamento' ? '#f59e0b' : '#94a3b8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <div>
                      {(item.school || item.className) && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8b5e3c', marginRight: 6 }}>
                          {item.school} {item.className ? `• ${item.className}` : ''}
                        </span>
                      )}
                      <h4 style={{ margin: '2px 0 0 0', fontSize: 14.5, fontWeight: 700, color: '#073642' }}>{item.title}</h4>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handlePushToClassLog(item)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #8b5e3c', background: '#fdf6e3', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                        Sincronizar Diário
                      </button>
                      <button onClick={() => handleApplyToCreation(item)} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                        {actionButtonLabel}
                      </button>
                    </div>
                  </div>
                  {(item.bookTitle || item.bookUnitsChapters) && (
                    <div style={{ fontSize: 12, color: '#586e75', marginBottom: 6 }}>
                      📖 {item.bookTitle} {item.bookUnitsChapters ? `• ${item.bookUnitsChapters}` : ''}
                    </div>
                  )}
                  {item.grammarTopics.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {item.grammarTopics.map((g, idx) => (
                        <span key={idx} style={{ background: '#f1f5f9', color: '#334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>{g}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ABA: FORMULÁRIO */}
      {activeSubTab === 'editor' && (
        <form onSubmit={handleSaveForm} style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee8d5', padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #eee8d5', paddingBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#073642' }}>
              {formId ? '✏️ Editar Ementa & Tópicos' : '✍️ Cadastrar Nova Ementa de Conteúdo'}
            </h4>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setActiveSubTab('list')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d0c8b8', background: '#fff', color: '#657b83', fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                💾 Salvar no Supabase
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>Título da Ementa *</label>
              <input type="text" required placeholder="Ex: Ementa da Prova Bimestral - Units 4 & 5" value={formTitle} onChange={e => setFormTitle(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 13 }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>Escola / Instituição</label>
              <input
                list="schools-list"
                type="text"
                placeholder="Selecione ou digite o nome da escola..."
                value={formSchool}
                onChange={e => setFormSchool(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5, background: '#fff' }}
              />
              <datalist id="schools-list">
                {availableSchools.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>Turma</label>
              <input
                list="classes-list"
                type="text"
                placeholder="Selecione ou digite a turma (ex: 9º Ano B)..."
                value={formClassName}
                onChange={e => setFormClassName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5, background: '#fff' }}
              />
              <datalist id="classes-list">
                {availableClasses.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>Período / Bimestre / Trimestre</label>
              <input type="text" placeholder="Ex: 2º Trimestre" value={formTerm} onChange={e => setFormTerm(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5 }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>Data Prevista da Avaliação</label>
              <input type="date" value={formEvaluationDate} onChange={e => setFormEvaluationDate(e.target.value)} style={{ width: '100%', padding: '7px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5 }} />
            </div>
          </div>

          {/* Livro e Capítulos */}
          <div style={{ background: '#fdf6e3', padding: 14, borderRadius: 8, border: '1px solid #eee8d5', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>📖 Livro / Apostila Base</label>
                <input type="text" placeholder="Ex: English in Mind - Volume 3" value={formBookTitle} onChange={e => setFormBookTitle(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5, background: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>📑 Capítulos, Unidades e Páginas Expressas</label>
                <input type="text" placeholder="Ex: Units 4 e 5 (págs. 36-52) | Workbook págs. 22-30" value={formBookUnitsChapters} onChange={e => setFormBookUnitsChapters(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5, background: '#fff' }} />
              </div>
            </div>
          </div>

          {/* Tópicos Gramaticais */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#073642', marginBottom: 6 }}>🧩 Tópicos Gramaticais</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="text" placeholder="Ex: Present Perfect Continuous, First Conditional..." value={newGrammarInput} onChange={e => setNewGrammarInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddGrammarTag(newGrammarInput) } }} style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5 }} />
              <button type="button" onClick={() => handleAddGrammarTag(newGrammarInput)} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Adicionar</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {COMMON_GRAMMAR_SUGGESTIONS.slice(0, 8).map(sug => (
                <button key={sug} type="button" onClick={() => handleAddGrammarTag(sug)} style={{ background: '#fdf6e3', border: '1px dashed #d0c8b8', color: '#8b5e3c', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>+ {sug}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, minHeight: 30 }}>
              {formGrammarTopics.map((g, idx) => (
                <span key={idx} style={{ background: '#073642', color: '#fdf6e3', padding: '3px 8px', borderRadius: 4, fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {g} <i className="ti ti-x" onClick={() => handleRemoveGrammarTag(idx)} style={{ cursor: 'pointer' }} />
                </span>
              ))}
            </div>
          </div>

          {/* Vocabulário */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#073642', marginBottom: 6 }}>🔤 Vocabulário & Temáticas</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="text" placeholder="Ex: Technology, Environment, Travel..." value={newVocabInput} onChange={e => setNewVocabInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddVocabTag(newVocabInput) } }} style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5 }} />
              <button type="button" onClick={() => handleAddVocabTag(newVocabInput)} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #8b5e3c', background: '#fdf6e3', color: '#8b5e3c', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Adicionar</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {formVocabularyThemes.map((v, idx) => (
                <span key={idx} style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 4, fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {v} <i className="ti ti-x" onClick={() => handleRemoveVocabTag(idx)} style={{ cursor: 'pointer' }} />
                </span>
              ))}
            </div>
          </div>

          {/* Dicas de Estudo */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>💡 Roteiro & Dicas de Estudo aos Alunos</label>
            <textarea rows={2} placeholder="Ex: Praticar os exercícios do Workbook págs. 22-25 e revisar os verbos irregulares..." value={formStudyTips} onChange={e => setFormStudyTips(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5 }} />
          </div>

          {/* Status */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#073642', marginBottom: 4 }}>Status</label>
            <select value={formStatus} onChange={e => setFormStatus(e.target.value as any)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d0c8b8', fontSize: 12.5, background: '#fff' }}>
              <option value="planejado">📌 Planejado</option>
              <option value="em_andamento">⏳ Em Andamento</option>
              <option value="lecionado">✅ Lecionado</option>
              <option value="avaliado">📊 Avaliado</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #eee8d5', paddingTop: 14 }}>
            <button type="button" onClick={() => setActiveSubTab('list')} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #d0c8b8', background: '#fff', color: '#657b83', fontSize: 12.5, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>💾 Salvar Ementa no Supabase</button>
          </div>
        </form>
      )}

    </div>
  )
}
