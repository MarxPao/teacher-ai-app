'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast } from '@/components/Toast'
import {
  getBnccCatalog,
  getBnccForGrade,
  useBnccSkills,
  BnccSkill,
  getCurriculumCoverageReport,
  saveClassPostponedSkills,
  getClassPostponedSkills
} from '@/lib/bnccStore'
import {
  dissectBnccSkill,
  BLOOM_LEVELS,
  BloomLevel,
  DissectedSkill
} from '@/lib/bnccDissector'

// Configurações visuais por disciplina
interface SubjectMeta {
  id: string
  name: string
  color: string
  bg: string
  icon: string
  count: number
}

const SUBJECT_METAS: SubjectMeta[] = [
  { id: 'all',   name: 'Todas as Matérias',  color: '#8b5e3c', bg: '#f5efe6', icon: 'ti-books',              count: 1237 },
  { id: 'EF_LP', name: 'Língua Portuguesa',   color: '#2563eb', bg: '#eff6ff', icon: 'ti-book-2',            count: 308 },
  { id: 'EF_MA', name: 'Matemática',          color: '#059669', bg: '#ecfdf5', icon: 'ti-calculator',        count: 246 },
  { id: 'EF_HI', name: 'História',            color: '#d97706', bg: '#fffbeb', icon: 'ti-hourglass-empty',    count: 151 },
  { id: 'EF_GE', name: 'Geografia',           color: '#0891b2', bg: '#ecfeff', icon: 'ti-world',             count: 123 },
  { id: 'EF_CI', name: 'Ciências',            color: '#16a34a', bg: '#f0fdf4', icon: 'ti-microscope',        count: 111 },
  { id: 'EF_LI', name: 'Língua Inglesa',      color: '#7c3aed', bg: '#f5f3ff', icon: 'ti-language',          count: 106 },
  { id: 'EF_EF', name: 'Educação Física',     color: '#ea580c', bg: '#fff7ed', icon: 'ti-run',               count: 68 },
  { id: 'EF_ER', name: 'Ensino Religioso',    color: '#9333ea', bg: '#faf5ff', icon: 'ti-heart-handshake',   count: 63 },
  { id: 'EF_AR', name: 'Arte',                color: '#db2777', bg: '#fdf2f8', icon: 'ti-palette',           count: 61 },
]

const GRADE_YEARS = [
  'all',
  '1º Fund.', '2º Fund.', '3º Fund.', '4º Fund.', '5º Fund.',
  '6º Fund.', '7º Fund.', '8º Fund.', '9º Fund.',
  '1º ao 5º Fund.', '6º ao 9º Fund.', '1º e 2º Fund.', '6º e 7º Fund.', '8º e 9º Fund.',
  '1º Médio', '2º Médio', '3º Médio'
]

// Temas transversais contemporâneos da BNCC
const TRANSVERSAL_THEMES = [
  {
    id: 'environment',
    title: 'Meio Ambiente & Sustentabilidade',
    icon: 'ti-leaf',
    description: 'Consumo consciente, mudanças climáticas, biodiversidade e preservação dos recursos naturais.',
    keywords: ['ambiente', 'clima', 'sustentabilidade', 'biodiversidade', 'recursos', 'ecologia', 'poluição']
  },
  {
    id: 'citizenship',
    title: 'Cidadania, Direitos & Diversidade',
    icon: 'ti-scale',
    description: 'Democracia, direitos humanos, respeito à diversidade cultural e participação social.',
    keywords: ['cidadania', 'direitos', 'democracia', 'diversidade', 'cultural', 'social', 'ética']
  },
  {
    id: 'technology',
    title: 'Ciência, Tecnologia & Cultura Digital',
    icon: 'ti-cpu',
    description: 'Letramento digital crítico, algoritmos, mídias sociais e investigação científica.',
    keywords: ['digital', 'tecnologia', 'mídia', 'investigação', 'científica', 'algoritmo', 'informação']
  },
  {
    id: 'health',
    title: 'Saúde, Corpo & Bem-Estar',
    icon: 'ti-heart-pulse',
    description: 'Autocuidado, saúde física e mental, nutrição e práticas corporais saudáveis.',
    keywords: ['saúde', 'corpo', 'nutrição', 'alimentação', 'movimento', 'bem-estar', 'higiene']
  },
  {
    id: 'economy',
    title: 'Educação Financeira & Trabalho',
    icon: 'ti-coin',
    description: 'Planejamento financeiro, economia solidária e relações do mundo do trabalho.',
    keywords: ['financeira', 'trabalho', 'economia', 'consumo', 'orçamento', 'dinheiro', 'produção']
  }
]

export default function BnccModule() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'radar' | 'bloom' | 'interdisciplinary'>('explorer')
  const [selectedSubject, setSelectedSubject] = useState<string>('all')
  const [selectedGrade, setSelectedGrade] = useState<string>('all')
  const [selectedBloom, setSelectedBloom] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'tree'>('cards')

  // Modal de Dissecação da Habilidade
  const [dissectingSkill, setDissectingSkill] = useState<BnccSkill | null>(null)

  // Estado da aba Radar de Cobertura
  const [radarClassId, setRadarClassId] = useState<string>('')
  const [classesList, setClassesList] = useState<Array<{ id: string; name: string; gradeYear?: string }>>(() => {
    if (typeof localStorage === 'undefined') return []
    try {
      const raw = localStorage.getItem('teacher_classes')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  // Carrega todas as 1.237 habilidades via fonte única
  const allSkills = useMemo(() => getBnccCatalog('all'), [])

  // Filtro multidimensional reativo
  const filteredSkills = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return allSkills.filter(s => {
      // Filtro por matéria
      if (selectedSubject !== 'all') {
        const isMatch = s.subject === selectedSubject ||
          (selectedSubject === 'EF_LI' && (!s.subject || s.subject === 'EF_LI'))
        if (!isMatch) return false
      }

      // Filtro por ano/série
      if (selectedGrade !== 'all') {
        const cleanFilter = selectedGrade.toLowerCase().replace(/ano|série/g, '').trim()
        const cleanSkillGrade = s.gradeYear.toLowerCase().replace(/ano|série/g, '').trim()
        if (!cleanSkillGrade.includes(cleanFilter) && !cleanFilter.includes(cleanSkillGrade)) {
          return false
        }
      }

      // Filtro por nível Bloom (se especificado)
      if (selectedBloom !== 'all') {
        const dissected = dissectBnccSkill(s.code, s.description)
        if (dissected.bloomLevel !== selectedBloom) return false
      }

      // Filtro por termo de busca (código, descrição, unidade, eixo)
      if (q) {
        const inCode = s.code.toLowerCase().includes(q)
        const inDesc = s.description.toLowerCase().includes(q)
        const inUnit = s.unit ? s.unit.toLowerCase().includes(q) : false
        const inAxis = s.axis ? s.axis.toLowerCase().includes(q) : false
        if (!inCode && !inDesc && !inUnit && !inAxis) return false
      }

      return true
    })
  }, [allSkills, selectedSubject, selectedGrade, selectedBloom, searchQuery])

  // Ação: Criar plano de aula preenchido no LessonStudio
  const handleCreateLessonPlan = (skill: BnccSkill) => {
    const prefill = {
      topic: `${skill.code} — ${skill.description.slice(0, 60)}...`,
      gradeYear: skill.gradeYear,
      selectedSkills: [{
        code: skill.code,
        desc: skill.description,
        status: 'planned' as const
      }]
    }
    try {
      localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify(prefill))
      window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
      toast.success(`Habilidade ${skill.code} vinculada ao Planejador de Aulas!`)
    } catch {
      toast.error('Não foi possível transferir para o planejamento.')
    }
  }

  // Ação: Gerar questão ou abrir banco
  const handleGenerateQuestion = (skill: BnccSkill) => {
    try {
      localStorage.setItem('teacher_qbank_bncc_filter', skill.code)
      window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'qbank' }))
      toast.success(`Abrindo Banco de Questões com filtro em ${skill.code}!`)
    } catch {
      toast.error('Erro ao abrir Banco de Questões.')
    }
  }

  // Ação: Adicionar ao backlog da turma ativa
  const handleAddToBacklog = (skill: BnccSkill) => {
    const targetClass = classesList.find(c => c.id === radarClassId) || classesList[0]
    if (!targetClass) {
      toast.warning('Nenhuma turma cadastrada. Crie uma turma primeiro na aba Turmas.')
      return
    }

    const currentBacklog = getClassPostponedSkills(targetClass.id)
    if (currentBacklog.includes(skill.code)) {
      toast.info(`A habilidade ${skill.code} já está no backlog de ${targetClass.name}.`)
      return
    }

    saveClassPostponedSkills(targetClass.id, [...currentBacklog, skill.code])
    toast.success(`Habilidade ${skill.code} adicionada ao backlog da turma ${targetClass.name}!`)
  }

  // Estatísticas da seleção atual
  const stats = useMemo(() => {
    const total = filteredSkills.length
    const byBloom: Record<BloomLevel, number> = {
      Lembrar: 0, Compreender: 0, Aplicar: 0, Analisar: 0, Avaliar: 0, Criar: 0
    }
    filteredSkills.slice(0, 200).forEach(s => {
      const d = dissectBnccSkill(s.code, s.description)
      byBloom[d.bloomLevel] = (byBloom[d.bloomLevel] || 0) + 1
    })
    return { total, byBloom }
  }, [filteredSkills])

  // Relatório do Radar de Cobertura para a turma selecionada
  const radarReport = useMemo(() => {
    const targetClass = classesList.find(c => c.id === radarClassId) || classesList[0]
    if (!targetClass) return null

    let plans: any[] = []
    try {
      const raw = localStorage.getItem('teacher_lesson_plans_bank')
      if (raw) plans = JSON.parse(raw)
    } catch {}

    const grade = targetClass.gradeYear || '8º Fund.'
    return {
      className: targetClass.name,
      report: getCurriculumCoverageReport(grade, plans, targetClass.id)
    }
  }, [classesList, radarClassId])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', color: COLOR.paperInk }}>
      {/* ─── HEADER PRINCIPAL ──────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #2c1a0e 0%, #4a2c17 100%)',
        borderRadius: RADIUS.lg,
        padding: '28px 32px',
        color: '#fff',
        marginBottom: 24,
        boxShadow: SHADOW.md,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              background: 'rgba(255,255,255,0.15)',
              padding: '4px 10px',
              borderRadius: RADIUS.full,
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.8
            }}>
              Base Nacional Comum Curricular Oficial
            </span>
            <span style={{ fontSize: 13, color: '#f3e8dc' }}>
              • MEC Homologada (1.237 Habilidades)
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
            Central Curricular BNCC
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#e5d5c5', maxWidth: 700 }}>
            Buscador instantâneo, visualizador da norma, dissecação por Taxonomia de Bloom e rastreamento de cobertura por turma.
          </p>
        </div>

        {/* Quick Badges */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 16px', borderRadius: RADIUS.md, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>1.237</div>
            <div style={{ fontSize: 11, color: '#e5d5c5' }}>Habilidades</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 16px', borderRadius: RADIUS.md, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>9</div>
            <div style={{ fontSize: 11, color: '#e5d5c5' }}>Disciplinas</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 16px', borderRadius: RADIUS.md, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{filteredSkills.length}</div>
            <div style={{ fontSize: 11, color: '#e5d5c5' }}>Na Busca</div>
          </div>
        </div>
      </div>

      {/* ─── ABAS DO MÓDULO ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid rgba(139,94,60,0.15)',
        marginBottom: 24,
        overflowX: 'auto'
      }}>
        {[
          { id: 'explorer',         label: '🔍 Buscador & Visualizador da Norma', badge: filteredSkills.length },
          { id: 'radar',            label: '📊 Radar de Cobertura por Turma',      badge: radarReport ? `${radarReport.report.coveragePercentage}%` : undefined },
          { id: 'bloom',            label: '🧠 Dissecador Pedagógico (Bloom)',     badge: 'Taxonomia' },
          { id: 'interdisciplinary',label: '🌱 Conector Interdisciplinar',         badge: 'Temas Transversais' }
        ].map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 18px',
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '3px solid #8b5e3c' : '3px solid transparent',
                color: isActive ? '#8b5e3c' : COLOR.paperMid,
                fontWeight: isActive ? 700 : 500,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: RADIUS.full,
                  background: isActive ? '#8b5e3c' : 'rgba(139,94,60,0.1)',
                  color: isActive ? '#fff' : COLOR.paperInk,
                  fontWeight: 700
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ─── ABA 1: BUSCADOR & VISUALIZADOR DA NORMA ───────────────────────── */}
      {activeTab === 'explorer' && (
        <div>
          {/* Barra de Filtros Multidimensional */}
          <div style={{
            background: '#fff',
            borderRadius: RADIUS.md,
            padding: 20,
            border: '1px solid rgba(139,94,60,0.15)',
            marginBottom: 20,
            boxShadow: SHADOW.flat,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            {/* Linha 1: Input de Busca com destaque */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Pesquisar por código (ex: EF06MA01), conceito (ex: frações, past continuous, ditadura) ou verbo..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    borderRadius: RADIUS.md,
                    border: '1px solid rgba(139,94,60,0.3)',
                    background: '#fffcf8',
                    color: COLOR.paperInk,
                    outline: 'none'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'transparent',
                      color: COLOR.paperMid,
                      cursor: 'pointer',
                      fontSize: 16
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Botões de Modo de Visualização */}
              <div style={{ display: 'flex', gap: 4, background: '#f5efe6', padding: 4, borderRadius: RADIUS.md }}>
                {[
                  { mode: 'cards', label: '🗂 Cards' },
                  { mode: 'table', label: '📑 Tabela' },
                  { mode: 'tree',  label: '🌳 Árvore' }
                ].map(v => (
                  <button
                    key={v.mode}
                    onClick={() => setViewMode(v.mode as any)}
                    style={{
                      padding: '8px 14px',
                      border: 'none',
                      borderRadius: RADIUS.sm,
                      background: viewMode === v.mode ? '#8b5e3c' : 'transparent',
                      color: viewMode === v.mode ? '#fff' : '#6b4d36',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Linha 2: Chips de Disciplinas com Contagem */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {SUBJECT_METAS.map(subj => {
                const isSelected = selectedSubject === subj.id
                return (
                  <button
                    key={subj.id}
                    onClick={() => setSelectedSubject(subj.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: RADIUS.full,
                      border: isSelected ? `2px solid ${subj.color}` : '1px solid rgba(139,94,60,0.2)',
                      background: isSelected ? subj.bg : '#fff',
                      color: isSelected ? subj.color : COLOR.paperInk,
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span>{subj.name}</span>
                    <span style={{
                      fontSize: 10,
                      background: isSelected ? subj.color : 'rgba(139,94,60,0.1)',
                      color: isSelected ? '#fff' : COLOR.paperMid,
                      padding: '1px 6px',
                      borderRadius: 10,
                      fontWeight: 700
                    }}>
                      {subj.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Linha 3: Filtros de Série e Bloom */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid }}>SÉRIE:</span>
                <select
                  value={selectedGrade}
                  onChange={e => setSelectedGrade(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.sm,
                    border: '1px solid rgba(139,94,60,0.3)',
                    background: '#fffcf8',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  <option value="all">Todas as Séries</option>
                  {GRADE_YEARS.filter(g => g !== 'all').map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid }}>NÍVEL BLOOM:</span>
                <select
                  value={selectedBloom}
                  onChange={e => setSelectedBloom(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.sm,
                    border: '1px solid rgba(139,94,60,0.3)',
                    background: '#fffcf8',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  <option value="all">Todos os Níveis Cognitivos</option>
                  {Object.keys(BLOOM_LEVELS).map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

              {(selectedSubject !== 'all' || selectedGrade !== 'all' || selectedBloom !== 'all' || searchQuery) && (
                <button
                  onClick={() => {
                    setSelectedSubject('all')
                    setSelectedGrade('all')
                    setSelectedBloom('all')
                    setSearchQuery('')
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.sm,
                    border: 'none',
                    background: 'rgba(220,38,38,0.1)',
                    color: '#dc2626',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Limpar Todos os Filtros
                </button>
              )}
            </div>
          </div>

          {/* ─── RENDERIZAÇÃO POR MODO DE VISUALIZAÇÃO ──────────────────────── */}

          {/* MODO 1: CARDS DETALHADOS */}
          {viewMode === 'cards' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: 16
            }}>
              {filteredSkills.slice(0, 150).map(skill => {
                const dissected = dissectBnccSkill(skill.code, skill.description)
                const subjMeta = SUBJECT_METAS.find(s => s.id === skill.subject) || SUBJECT_METAS[0]

                return (
                  <div
                    key={skill.id}
                    style={{
                      background: '#fff',
                      borderRadius: RADIUS.md,
                      padding: 18,
                      border: '1px solid rgba(139,94,60,0.15)',
                      boxShadow: SHADOW.flat,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                  >
                    <div>
                      {/* Topo do Card: Código + Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: subjMeta.color,
                          background: subjMeta.bg,
                          padding: '4px 10px',
                          borderRadius: RADIUS.sm,
                          letterSpacing: 0.5
                        }}>
                          {skill.code}
                        </span>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: RADIUS.full,
                            background: '#f5efe6',
                            color: '#8b5e3c'
                          }}>
                            {skill.gradeYear}
                          </span>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: RADIUS.full,
                            background: dissected.bloomInfo.bg,
                            color: dissected.bloomInfo.color
                          }}>
                            {dissected.bloomLevel}
                          </span>
                        </div>
                      </div>

                      {/* Eixo Temático */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperMid, textTransform: 'uppercase', marginBottom: 6 }}>
                        {skill.axis || 'Área Geral'} {skill.unit ? `• ${skill.unit}` : ''}
                      </div>

                      {/* Descrição Integral */}
                      <p style={{
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: COLOR.paperInk,
                        margin: 0
                      }}>
                        {skill.description}
                      </p>
                    </div>

                    {/* Ações Rápidas do Card */}
                    <div style={{
                      display: 'flex',
                      gap: 8,
                      borderTop: '1px solid rgba(139,94,60,0.1)',
                      paddingTop: 12,
                      flexWrap: 'wrap'
                    }}>
                      <button
                        onClick={() => handleCreateLessonPlan(skill)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: RADIUS.sm,
                          border: 'none',
                          background: '#8b5e3c',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        📝 Criar Plano
                      </button>

                      <button
                        onClick={() => handleGenerateQuestion(skill)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: RADIUS.sm,
                          border: '1px solid rgba(139,94,60,0.25)',
                          background: '#fffcf8',
                          color: '#7a5c42',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ❓ Questões
                      </button>

                      <button
                        onClick={() => setDissectingSkill(skill)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: RADIUS.sm,
                          border: '1px solid rgba(139,94,60,0.25)',
                          background: '#fffcf8',
                          color: '#7a5c42',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        🧠 Dissecar
                      </button>

                      <button
                        onClick={() => handleAddToBacklog(skill)}
                        title="Adicionar à Caixa de Recuperação da Turma"
                        style={{
                          padding: '6px 10px',
                          borderRadius: RADIUS.sm,
                          border: 'none',
                          background: 'rgba(217,119,6,0.1)',
                          color: '#d97706',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        📥 Backlog
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* MODO 2: TABELA COMPACTA */}
          {viewMode === 'table' && (
            <div style={{
              background: '#fff',
              borderRadius: RADIUS.md,
              border: '1px solid rgba(139,94,60,0.15)',
              overflowX: 'auto',
              boxShadow: SHADOW.flat
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5efe6', borderBottom: '2px solid rgba(139,94,60,0.2)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700, width: 120 }}>Código</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, width: 140 }}>Série</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, width: 160 }}>Matéria</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, width: 130 }}>Nível Bloom</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Descrição Integral</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, width: 180, textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSkills.slice(0, 200).map((s, idx) => {
                    const dissected = dissectBnccSkill(s.code, s.description)
                    return (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: '1px solid rgba(139,94,60,0.08)',
                          background: idx % 2 === 0 ? '#fff' : '#fffcf8'
                        }}
                      >
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#8b5e3c' }}>{s.code}</td>
                        <td style={{ padding: '10px 16px' }}>{s.gradeYear}</td>
                        <td style={{ padding: '10px 16px' }}>{s.subject || 'Língua Inglesa'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: RADIUS.full,
                            fontSize: 11,
                            fontWeight: 700,
                            background: dissected.bloomInfo.bg,
                            color: dissected.bloomInfo.color
                          }}>
                            {dissected.bloomLevel}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', lineHeight: 1.4 }}>{s.description}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              onClick={() => handleCreateLessonPlan(s)}
                              title="Criar Plano"
                              style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 11, cursor: 'pointer' }}
                            >
                              📝
                            </button>
                            <button
                              onClick={() => setDissectingSkill(s)}
                              title="Dissecar Habilidade"
                              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #8b5e3c', background: '#fff', color: '#8b5e3c', fontSize: 11, cursor: 'pointer' }}
                            >
                              🧠
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* MODO 3: ÁRVORE HIERÁRQUICA */}
          {viewMode === 'tree' && (
            <div style={{
              background: '#fff',
              borderRadius: RADIUS.md,
              padding: 24,
              border: '1px solid rgba(139,94,60,0.15)',
              boxShadow: SHADOW.flat
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
                Árvore Hierárquica da BNCC (Por Componente e Série)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {SUBJECT_METAS.filter(s => s.id !== 'all').map(subj => {
                  const subjSkills = allSkills.filter(s => s.subject === subj.id)
                  return (
                    <details key={subj.id} style={{ border: '1px solid rgba(139,94,60,0.15)', borderRadius: RADIUS.sm, padding: 12 }}>
                      <summary style={{ fontWeight: 700, cursor: 'pointer', color: subj.color, fontSize: 14 }}>
                        {subj.name} ({subjSkills.length} habilidades)
                      </summary>
                      <div style={{ padding: '12px 0 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {GRADE_YEARS.filter(g => g !== 'all').map(grade => {
                          const gradeSkills = subjSkills.filter(s => s.gradeYear.includes(grade.replace(/ano|série/gi, '').trim()))
                          if (gradeSkills.length === 0) return null
                          return (
                            <details key={grade} style={{ borderLeft: '2px solid rgba(139,94,60,0.2)', paddingLeft: 12 }}>
                              <summary style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                                {grade} ({gradeSkills.length})
                              </summary>
                              <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {gradeSkills.map(s => (
                                  <div key={s.id} style={{ fontSize: 12, padding: 6, background: '#fdfbf7', borderRadius: 4 }}>
                                    <strong style={{ color: '#8b5e3c' }}>{s.code}:</strong> {s.description}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )
                        })}
                      </div>
                    </details>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ABA 2: RADAR DE COBERTURA POR TURMA ────────────────────────────── */}
      {activeTab === 'radar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Seletor de Turma */}
          <div style={{
            background: '#fff',
            borderRadius: RADIUS.md,
            padding: 20,
            border: '1px solid rgba(139,94,60,0.15)',
            boxShadow: SHADOW.flat,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 14
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Termômetro de Cobertura Curricular Anual
              </h2>
              <p style={{ fontSize: 13, color: COLOR.paperMid, margin: '4px 0 0' }}>
                Cruza planos de aula executados com a matriz de habilidades da série da turma.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid }}>TURMA:</span>
              <select
                value={radarClassId || classesList[0]?.id || ''}
                onChange={e => setRadarClassId(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: RADIUS.sm,
                  border: '1px solid rgba(139,94,60,0.3)',
                  background: '#fffcf8',
                  fontSize: 13,
                  fontWeight: 600,
                  minWidth: 200
                }}
              >
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.gradeYear || '8º Fund.'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards do Termômetro */}
          {radarReport && (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                marginBottom: 20
              }}>
                <div style={{ background: '#fff', borderRadius: RADIUS.md, padding: 18, border: '1px solid rgba(139,94,60,0.15)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid, textTransform: 'uppercase' }}>Cobertura Total</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#059669', margin: '4px 0' }}>
                    {radarReport.report.coveragePercentage}%
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.paperMid }}>{radarReport.report.coveredCount} de {radarReport.report.totalSkills} habilidades</div>
                </div>

                <div style={{ background: '#fff', borderRadius: RADIUS.md, padding: 18, border: '1px solid rgba(139,94,60,0.15)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid, textTransform: 'uppercase' }}>Planejadas</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#2563eb', margin: '4px 0' }}>
                    {radarReport.report.plannedCount}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.paperMid }}>Em planos futuros</div>
                </div>

                <div style={{ background: '#fff', borderRadius: RADIUS.md, padding: 18, border: '1px solid rgba(139,94,60,0.15)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid, textTransform: 'uppercase' }}>Caixa de Recuperação</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#d97706', margin: '4px 0' }}>
                    {radarReport.report.postponedCount}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.paperMid }}>Habilidades adiadas</div>
                </div>

                <div style={{ background: '#fff', borderRadius: RADIUS.md, padding: 18, border: '1px solid rgba(139,94,60,0.15)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperMid, textTransform: 'uppercase' }}>Ainda Não Abordadas</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#dc2626', margin: '4px 0' }}>
                    {radarReport.report.uncoveredCount}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.paperMid }}>Atenção no cronograma</div>
                </div>
              </div>

              {/* Lista Detalhada de Habilidades por Eixo */}
              <div style={{
                background: '#fff',
                borderRadius: RADIUS.md,
                padding: 24,
                border: '1px solid rgba(139,94,60,0.15)',
                boxShadow: SHADOW.flat
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
                  Detalhamento de Habilidades da Turma {radarReport.className}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {radarReport.report.skillsDetail.map(sk => {
                    const statusColors: Record<string, { bg: string; color: string; label: string }> = {
                      covered:   { bg: '#ecfdf5', color: '#059669', label: '✅ Coberta' },
                      planned:   { bg: '#eff6ff', color: '#2563eb', label: '📅 Planejada' },
                      postponed: { bg: '#fffbeb', color: '#d97706', label: '⚠️ Em Atraso (Backlog)' },
                      uncovered: { bg: '#fef2f2', color: '#dc2626', label: '⭕ Não Abordada' }
                    }
                    const st = statusColors[sk.status] || statusColors.uncovered

                    return (
                      <div
                        key={sk.code}
                        style={{
                          padding: 14,
                          borderRadius: RADIUS.sm,
                          border: '1px solid rgba(139,94,60,0.1)',
                          background: '#fffcf8',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 16
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                            <strong style={{ color: '#8b5e3c' }}>{sk.code}</strong>
                            <span style={{ fontSize: 11, color: COLOR.paperMid }}>• {sk.axis}</span>
                          </div>
                          <div style={{ fontSize: 13, color: COLOR.paperInk }}>{sk.description}</div>
                        </div>

                        <span style={{
                          padding: '4px 10px',
                          borderRadius: RADIUS.full,
                          fontSize: 11,
                          fontWeight: 700,
                          background: st.bg,
                          color: st.color,
                          whiteSpace: 'nowrap'
                        }}>
                          {st.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ABA 3: DISSECADOR DE BLOOM & ANÁLISE ESTRUTURAL ────────────────── */}
      {activeTab === 'bloom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Guia da Taxonomia de Bloom na BNCC */}
          <div style={{
            background: '#fff',
            borderRadius: RADIUS.md,
            padding: 24,
            border: '1px solid rgba(139,94,60,0.15)',
            boxShadow: SHADOW.flat
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              Distribuição Cognitiva das Habilidades (Taxonomia de Bloom)
            </h2>
            <p style={{ fontSize: 13, color: COLOR.paperMid, margin: '0 0 20px' }}>
              A BNCC estrutura suas habilidades a partir de processos cognitivos crescentes. Veja a distribuição na seleção atual:
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 14
            }}>
              {(Object.keys(BLOOM_LEVELS) as BloomLevel[]).map(lvl => {
                const info = BLOOM_LEVELS[lvl]
                const count = stats.byBloom[lvl] || 0
                return (
                  <div
                    key={lvl}
                    style={{
                      background: info.bg,
                      borderRadius: RADIUS.md,
                      padding: 16,
                      border: `1px solid ${info.color}30`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: info.color }}>{lvl}</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: info.color }}>{count}</span>
                    </div>
                    <p style={{ fontSize: 11, color: COLOR.paperInk, margin: '8px 0 0', lineHeight: 1.4 }}>
                      {info.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Seletor de Habilidade para Dissecação Detalhada */}
          <div style={{
            background: '#fff',
            borderRadius: RADIUS.md,
            padding: 24,
            border: '1px solid rgba(139,94,60,0.15)',
            boxShadow: SHADOW.flat
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
              Dissecar Qualquer Habilidade em 3 Elementos
            </h3>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Digite o código da habilidade (ex: EF06MA01, EF09LI05, EF08LP01)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: RADIUS.sm,
                  border: '1px solid rgba(139,94,60,0.3)',
                  fontSize: 13
                }}
              />
            </div>

            {filteredSkills.slice(0, 5).map(skill => {
              const dissected = dissectBnccSkill(skill.code, skill.description)
              return (
                <div
                  key={skill.id}
                  style={{
                    padding: 18,
                    borderRadius: RADIUS.md,
                    border: '1px solid rgba(139,94,60,0.15)',
                    background: '#fffcf8',
                    marginBottom: 14
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <strong style={{ fontSize: 16, color: '#8b5e3c' }}>{skill.code}</strong>
                      <span style={{ fontSize: 12, color: COLOR.paperMid }}>({skill.gradeYear})</span>
                    </div>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: RADIUS.full,
                      fontSize: 11,
                      fontWeight: 700,
                      background: dissected.bloomInfo.bg,
                      color: dissected.bloomInfo.color
                    }}>
                      Nível Bloom: {dissected.bloomLevel}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div style={{ background: '#fff', padding: 12, borderRadius: RADIUS.sm, border: '1px solid rgba(139,94,60,0.1)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: dissected.bloomInfo.color, textTransform: 'uppercase' }}>
                        🎯 1. Verbo de Ação (Processo Cognitivo)
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                        {dissected.actionVerbs.join(', ')}
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: 12, borderRadius: RADIUS.sm, border: '1px solid rgba(139,94,60,0.1)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                        📚 2. Objeto de Conhecimento
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>
                        {dissected.knowledgeObject}
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: 12, borderRadius: RADIUS.sm, border: '1px solid rgba(139,94,60,0.1)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>
                        🌍 3. Modificador / Contexto
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>
                        {dissected.contextModifier}
                      </div>
                    </div>
                  </div>

                  {/* Sugestão de Sala de Aula */}
                  <div style={{
                    background: '#f5efe6',
                    padding: '10px 14px',
                    borderRadius: RADIUS.sm,
                    fontSize: 12,
                    color: '#6b4d36',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span>💡 <strong>Sugestão Prática:</strong> {dissected.classroomSuggestion}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── ABA 4: CONECTOR INTERDISCIPLINAR ───────────────────────────────── */}
      {activeTab === 'interdisciplinary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            background: '#fff',
            borderRadius: RADIUS.md,
            padding: 24,
            border: '1px solid rgba(139,94,60,0.15)',
            boxShadow: SHADOW.flat
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              Projetos & Temas Contemporâneos Transversais
            </h2>
            <p style={{ fontSize: 13, color: COLOR.paperMid, margin: 0 }}>
              Conecte habilidades de matérias diferentes em projetos integradores alinhados aos temas transversais da BNCC.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {TRANSVERSAL_THEMES.map(theme => {
              // Encontra habilidades de matérias diferentes que tocam no tema
              const matchingSkills = allSkills.filter(s => {
                const desc = s.description.toLowerCase()
                return theme.keywords.some(k => desc.includes(k))
              }).slice(0, 4)

              return (
                <div
                  key={theme.id}
                  style={{
                    background: '#fff',
                    borderRadius: RADIUS.md,
                    padding: 20,
                    border: '1px solid rgba(139,94,60,0.15)',
                    boxShadow: SHADOW.flat,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#8b5e3c' }}>
                      {theme.title}
                    </h3>
                    <p style={{ fontSize: 12, color: COLOR.paperMid, margin: '0 0 14px' }}>
                      {theme.description}
                    </p>

                    <div style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperMid, textTransform: 'uppercase', marginBottom: 8 }}>
                      Habilidades Conectadas ({matchingSkills.length}):
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {matchingSkills.map(sk => (
                        <div key={sk.id} style={{ fontSize: 12, padding: 8, background: '#fffcf8', borderRadius: RADIUS.sm, border: '1px solid rgba(139,94,60,0.1)' }}>
                          <strong style={{ color: '#8b5e3c' }}>{sk.code} ({sk.subject || 'Língua Inglesa'}):</strong> {sk.description.slice(0, 100)}...
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      toast.success(`Projeto "${theme.title}" selecionado para integração!`)
                    }}
                    style={{
                      marginTop: 16,
                      padding: '8px 14px',
                      borderRadius: RADIUS.sm,
                      border: 'none',
                      background: '#8b5e3c',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🌱 Criar Projeto Integrador
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── MODAL DE DISSECAÇÃO DA HABILIDADE ──────────────────────────────── */}
      {dissectingSkill && (() => {
        const dissected = dissectBnccSkill(dissectingSkill.code, dissectingSkill.description)
        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20
          }}>
            <div style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              maxWidth: 600,
              width: '100%',
              padding: 28,
              boxShadow: SHADOW.lg,
              position: 'relative'
            }}>
              <button
                onClick={() => setDissectingSkill(null)}
                style={{
                  position: 'absolute',
                  right: 18,
                  top: 18,
                  border: 'none',
                  background: 'transparent',
                  fontSize: 18,
                  cursor: 'pointer',
                  color: COLOR.paperMid
                }}
              >
                ✕
              </button>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#8b5e3c' }}>
                  {dissectingSkill.code}
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: RADIUS.full,
                  fontSize: 11,
                  fontWeight: 700,
                  background: dissected.bloomInfo.bg,
                  color: dissected.bloomInfo.color
                }}>
                  {dissected.bloomLevel}
                </span>
                <span style={{ fontSize: 12, color: COLOR.paperMid }}>
                  {dissectingSkill.gradeYear}
                </span>
              </div>

              <p style={{ fontSize: 14, lineHeight: 1.5, color: COLOR.paperInk, marginBottom: 20 }}>
                {dissectingSkill.description}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div style={{ background: dissected.bloomInfo.bg, padding: 12, borderRadius: RADIUS.sm }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: dissected.bloomInfo.color }}>
                    🎯 VERBO DE AÇÃO (TAXONOMIA DE BLOOM)
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                    {dissected.actionVerbs.join(', ')} — {dissected.bloomInfo.description}
                  </div>
                </div>

                <div style={{ background: '#ecfdf5', padding: 12, borderRadius: RADIUS.sm }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>
                    📚 OBJETO DE CONHECIMENTO
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {dissected.knowledgeObject}
                  </div>
                </div>

                <div style={{ background: '#fffbeb', padding: 12, borderRadius: RADIUS.sm }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>
                    🌍 MODIFICADOR / CONTEXTO DE APLICAÇÃO
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {dissected.contextModifier}
                  </div>
                </div>

                <div style={{ background: '#f5efe6', padding: 12, borderRadius: RADIUS.sm }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c' }}>
                    💡 SUGESTÃO DIDÁTICA PARA SALA DE AULA
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4, color: '#6b4d36' }}>
                    {dissected.classroomSuggestion}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    handleCreateLessonPlan(dissectingSkill)
                    setDissectingSkill(null)
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: RADIUS.sm,
                    border: 'none',
                    background: '#8b5e3c',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📝 Criar Plano com esta Habilidade
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
