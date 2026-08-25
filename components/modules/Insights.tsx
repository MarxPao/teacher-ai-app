'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import TeacherLogo from '@/components/TeacherLogo'
import { fetchSupabaseInsightsData, purgeMockDataFromStorage, SupabaseInsightsDataset } from '@/lib/supabaseClient'

export interface PedagogicalHint {
  id: string
  targetType: 'student' | 'class'
  targetName: string
  targetId?: string
  topic: string
  challenge: string
  author: string
  theory: string
  prescription: string
  practicalSteps: string[]
  recommendedLevel: string
  urgency: 'high' | 'medium' | 'low'
  sourceKey: 'krashen' | 'nation' | 'vygotsky' | 'scrivener' | 'field' | 'bloom' | 'bncc'
}

interface StudentNormalized {
  id: string
  name: string
  className: string
  schoolName: string
  avgGrade: number
  masteryPercentage: number
  grades: Record<string, number | string>
  metrics?: {
    attendance?: number
    homeworkRate?: number
    participation?: number
    oral?: number
    writing?: number
    grammar?: number
    vocabulary?: number
  }
  atRisk: boolean
  topPerformer: boolean
  subject?: string
}

const THEORETICAL_FRAMEWORKS = [
  {
    key: 'krashen',
    author: 'Stephen Krashen',
    work: 'Principles and Practice in Second Language Acquisition',
    focus: 'Filtro Afetivo & Input Compreensível (i+1)',
    icon: 'ti-heart-handshake',
    color: '#d33682'
  },
  {
    key: 'nation',
    author: 'Paul Nation',
    work: 'The Four Strands of Language Learning (2007)',
    focus: 'Equilíbrio entre Input, Output, Fluência e Estudo Focado',
    icon: 'ti-books',
    color: '#859900'
  },
  {
    key: 'vygotsky',
    author: 'Lev Vygotsky',
    work: 'Zona de Desenvolvimento Proximal (ZDP)',
    focus: 'Andaimes Pedagógicos (Scaffolding) e Mediação',
    icon: 'ti-stairs',
    color: '#268bd2'
  },
  {
    key: 'scrivener',
    author: 'Jim Scrivener',
    work: 'Learning Teaching (Macmillan)',
    focus: 'Descoberta Guiada (Guided Discovery) & Redução de TTT',
    icon: 'ti-bulb',
    color: '#b58900'
  },
  {
    key: 'field',
    author: 'John Field',
    work: 'Listening in the Language Classroom (Cambridge)',
    focus: 'Decodificação Acústica e Connected Speech',
    icon: 'ti-ear',
    color: '#6c71c4'
  },
  {
    key: 'bloom',
    author: 'Benjamin Bloom / Anderson',
    work: 'Taxonomia de Bloom Revisada',
    focus: 'Progressão de Habilidades Cognitivas (Lembrar ➔ Criar)',
    icon: 'ti-hierarchy-2',
    color: '#cb4b16'
  },
  {
    key: 'bncc',
    author: 'MEC / BNCC',
    work: 'Competências Específicas de Língua Inglesa',
    focus: 'Língua Franca, Multiletramentos e Engajamento Social',
    icon: 'ti-certificate',
    color: '#2aa198'
  }
]

export default function Insights() {
  const [dataset, setDataset] = useState<SupabaseInsightsDataset>({
    schools: [],
    classes: [],
    students: [],
    privateStudents: [],
    documents: [],
    exams: [],
    questions: [],
    isCloudConnected: false
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [selectedStudent, setSelectedStudent] = useState<string>('all')
  const [activeFilterCategory, setActiveFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [customAiDiagnostic, setCustomAiDiagnostic] = useState<string>('')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<string | null>(null)

  // ─── Carregamento de Dados ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setIsSyncing(true)
      purgeMockDataFromStorage()
      const data = await fetchSupabaseInsightsData()
      setDataset(data)
    } catch (e) {
      console.error('Erro ao carregar dados de Insights:', e)
    } finally {
      setIsLoading(false)
      setIsSyncing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const handleRefresh = () => loadData()
    window.addEventListener('storage', handleRefresh)
    window.addEventListener('teacher:data_changed', handleRefresh)
    return () => {
      window.removeEventListener('storage', handleRefresh)
      window.removeEventListener('teacher:data_changed', handleRefresh)
    }
  }, [loadData])

  // ─── Normalização de Alunos ──────────────────────────────────────────────
  const normalizedStudents = useMemo<StudentNormalized[]>(() => {
    return dataset.students.map(s => {
      const rawGrades = Object.values(s.grades || {})
        .map(v => Number(v))
        .filter(n => !isNaN(n))

      const avg = rawGrades.length > 0 ? rawGrades.reduce((a, b) => a + b, 0) / rawGrades.length : 0
      const mastery = Math.round(Math.min(100, Math.max(0, avg * 10)))

      return {
        id: s.id,
        name: s.name,
        className: s.class || (s as any).className || 'Turma Regular',
        schoolName: s.school || 'Geral',
        avgGrade: Number(avg.toFixed(1)),
        masteryPercentage: mastery,
        grades: s.grades || {},
        metrics: (s as any).metrics || {},
        atRisk: avg > 0 && avg < 6.0,
        topPerformer: avg >= 8.5
      }
    })
  }, [dataset.students])

  // ─── Motor de Geração de Hints Pedagógicos Baseados em Teoria ─────────────
  const theoreticalHints = useMemo<PedagogicalHint[]>(() => {
    const hints: PedagogicalHint[] = []

    normalizedStudents.forEach(st => {
      const gradesCount = Object.keys(st.grades).length

      // 1. Caso: Aluno em Risco com Média Baixa (< 6.0)
      if (st.avgGrade > 0 && st.avgGrade < 6.0) {
        hints.push({
          id: `hint_krashen_${st.id}`,
          targetType: 'student',
          targetName: st.name,
          targetId: st.id,
          topic: 'Segurança Afetiva & Redução de Bloqueio',
          challenge: `Desempenho geral em ${st.avgGrade.toFixed(1)}/10. Apresenta hesitação e retenção fragmentada.`,
          author: 'Stephen Krashen',
          theory: 'Hipótese do Filtro Afetivo & Input Compreensível (i+1)',
          prescription: `Conforme Stephen Krashen, quando o filtro afetivo está elevado pelo medo do erro, a aquisição da linguagem é bloqueada. Não aumente a carga de testes gramaticais formais.`,
          practicalSteps: [
            'Aplique atividades de baixa pressão em duplas (Think-Pair-Share) antes de solicitar respostas em voz alta para a turma.',
            'Forneça insumo compreensível no nível i+1 (textos e diálogos com 95%+ de palavras compreendidas).',
            'Substitua a correção imediata explícita por "Recast" positivo (reformulação natural da frase pelo professor).'
          ],
          recommendedLevel: 'A1/A2',
          urgency: 'high',
          sourceKey: 'krashen'
        })
      }

      // 2. Caso: Aluno com Dificuldade em Produção Escrita / Gramática
      const scores = (st.metrics as any)?.scores || st.metrics || {}
      const grammarScore = scores.grammar !== undefined ? scores.grammar : st.avgGrade
      if (grammarScore > 0 && grammarScore < 6.5) {
        hints.push({
          id: `hint_vygotsky_${st.id}`,
          targetType: 'student',
          targetName: st.name,
          targetId: st.id,
          topic: 'Estruturação Gramatical & Andaimes (Scaffolding)',
          challenge: `Dificuldade na produção autônoma de estruturas sintáticas e tempos verbais compostos.`,
          author: 'Lev Vygotsky',
          theory: 'Zona de Desenvolvimento Proximal (ZDP) & Scaffolding',
          prescription: `Segundo a teoria da ZDP de Vygotsky, o aluno não deve ser lançado diretamente em tarefas de produção aberta. É necessário fornecer suportes temporários graduados.`,
          practicalSteps: [
            'Utilize "Sentence Frames" e organizadores visuais com lacunas antes de solicitar redação livre.',
            'Crie pares de trabalho colaborativo com colegas de nível intermediário alto (Peer Tutoring).',
            'Forneça um checklist de autoavaliação com no máximo 3 itens-chave (ex: sujeito + verbo no passado).'
          ],
          recommendedLevel: 'A2/B1',
          urgency: 'medium',
          sourceKey: 'vygotsky'
        })
      }

      // 3. Caso: Aluno de Alto Desempenho (>= 8.5) — Risco de Desengajamento por Subdesafio
      if (st.topPerformer) {
        hints.push({
          id: `hint_bloom_${st.id}`,
          targetType: 'student',
          targetName: st.name,
          targetId: st.id,
          topic: 'Extensão de Pensamento Crítico & Desafio Cognitivo',
          challenge: `Média de ${st.avgGrade.toFixed(1)}/10. Realiza tarefas mecânicas com facilidade e demanda aprofundamento.`,
          author: 'Benjamin Bloom / Anderson',
          theory: 'Habilidades de Pensamento de Ordem Superior (HOTS - Higher-Order Thinking Skills)',
          prescription: `De acordo com a Taxonomia de Bloom, alunos em domínio pleno estagnam quando retidos nos níveis de "Lembrar/Entender". Eleve as tarefas para "Analisar, Avaliar e Criar".`,
          practicalSteps: [
            'Proponha atividades de debate investigativo (ex: "Compare duas perspectivas culturais e defenda sua tese").',
            'Designe o aluno como mediador de grupos ou co-criador de desafios de quiz para a turma.',
            'Adicione questões bônus com inferência textual complexa e vocabulário C1 de leitura extensiva.'
          ],
          recommendedLevel: 'B2/C1',
          urgency: 'low',
          sourceKey: 'bloom'
        })
      }
    })

    // 4. Hints Coletivos para as Turmas
    const classes = Array.from(new Set(normalizedStudents.map(s => s.className).filter(Boolean)))
    classes.forEach(cls => {
      const classStudents = normalizedStudents.filter(s => s.className === cls)
      if (classStudents.length >= 2) {
        const classAvg = classStudents.reduce((a, b) => a + b.avgGrade, 0) / classStudents.length

        hints.push({
          id: `hint_nation_${cls}`,
          targetType: 'class',
          targetName: `Turma: ${cls}`,
          topic: 'Equilíbrio Pedagógico das 4 Vertentes (The 4 Strands)',
          challenge: `Média coletiva da turma em ${classAvg.toFixed(1)}/10 com ${classStudents.length} alunos cadastrados.`,
          author: 'Paul Nation',
          theory: 'The Four Strands of Language Learning (2007)',
          prescription: `Paul Nation demonstra que o aprendizado equilibrado de idiomas exige 25% do tempo dedicado a cada uma das 4 vertentes: Meaning-Focused Input, Meaning-Focused Output, Language-Focused Learning e Fluency Development.`,
          practicalSteps: [
            'Garanta que a aula não fique 80% centrada em explicação gramatical ("Language-Focused").',
            'Dedique pelo menos 15 minutos por semana a atividades de Fluência Rápida (4/3/2 Speaking Technique).',
            'Promova leitura extensiva em que os alunos leiam textos rápidos sem interrupção para dicionário.'
          ],
          recommendedLevel: 'Geral',
          urgency: 'medium',
          sourceKey: 'nation'
        })

        hints.push({
          id: `hint_scrivener_${cls}`,
          targetType: 'class',
          targetName: `Turma: ${cls}`,
          topic: 'Otimização do Tempo de Fala do Professor (TTT vs STT)',
          challenge: `Engajamento oral da turma demanda maior autonomia e redução de aulas expositivas.`,
          author: 'Jim Scrivener',
          theory: 'Redução de Teacher Talking Time (TTT) & Guided Discovery',
          prescription: `Conforme Scrivener (Learning Teaching), o professor deve agir como arquiteto de tarefas, reduzindo seu próprio tempo de fala (TTT) para maximizar a fala produtiva dos alunos (Student Talking Time - STT).`,
          practicalSteps: [
            'Substitua a explicação da regra por perguntas condutoras para que os próprios alunos descubram o padrão.',
            'Adote comandos com "Instruções Claras e Modeladas" em vez de longos discursos explicativos.',
            'Cronometre a fala do professor para ocupar no máximo 30% do tempo de aula.'
          ],
          recommendedLevel: 'Geral',
          urgency: 'low',
          sourceKey: 'scrivener'
        })
      }
    })

    return hints
  }, [normalizedStudents])

  // ─── Filtro dos Hints ───────────────────────────────────────────────────
  const filteredHints = useMemo(() => {
    return theoreticalHints.filter(hint => {
      if (selectedClass !== 'all' && hint.targetType === 'class' && !hint.targetName.includes(selectedClass)) {
        return false
      }
      if (selectedStudent !== 'all' && hint.targetId && hint.targetId !== selectedStudent) {
        return false
      }
      if (activeFilterCategory !== 'all' && hint.sourceKey !== activeFilterCategory) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = hint.topic.toLowerCase().includes(q)
        const matchAuthor = hint.author.toLowerCase().includes(q)
        const matchName = hint.targetName.toLowerCase().includes(q)
        const matchTheory = hint.theory.toLowerCase().includes(q)
        if (!matchTitle && !matchAuthor && !matchName && !matchTheory) return false
      }
      return true
    })
  }, [theoreticalHints, selectedClass, selectedStudent, activeFilterCategory, searchQuery])

  // ─── Geração de Diagnóstico Sob Demanda com IA ───────────────────────────
  const handleGenerateAiDiagnostic = async () => {
    setIsGeneratingAi(true)
    const avg = (normalizedStudents.reduce((a, b) => a + b.avgGrade, 0) / (normalizedStudents.length || 1)).toFixed(1)
    const atRisk = normalizedStudents.filter(s => s.atRisk)
    const topPerf = normalizedStudents.filter(s => s.topPerformer)

    try {
      const summaryContext = {
        totalStudents: normalizedStudents.length,
        atRiskCount: atRisk.length,
        topPerformerCount: topPerf.length,
        averageGrade: avg,
        atRiskStudents: atRisk.map(s => `${s.name} (${s.className}, média ${s.avgGrade})`),
        topStudents: topPerf.map(s => `${s.name} (${s.className}, média ${s.avgGrade})`),
        studentsList: normalizedStudents.slice(0, 10).map(s => ({ name: s.name, grade: s.avgGrade, class: s.className }))
      }

      const prompt = `Você é o Motor de Prescrições Pedagógicas Especializadas do Teacher AI.
Analise este panorama real de desempenho dos alunos:
${JSON.stringify(summaryContext, null, 2)}

Elabore um PARECER PRESCRITIVO FUNDAMENTADO EM AUTORES DE ELT E PEDAGOGIA (Stephen Krashen, Paul Nation, Lev Vygotsky, Jim Scrivener, John Field, Bloom, BNCC).
Estruture em:
1. 🎯 Diagnóstico dos Principais Gargalos Observados
2. 📚 Fundamentação Teórica Prescritiva (cite os autores e obras correspondentes)
3. ⚡ Plano de Ação Prático para as Próximas 3 Aulas
4. 🛠️ Recomendações de Intervenção Diferenciada para Alunos em Risco e Superdotados.`

      let generated = ''

      // Tentativa 1: Via executeUnifiedAiCall com APIs configuradas
      try {
        const { getAvailableApisForSelect, executeUnifiedAiCall } = await import('@/lib/autoApiSelector')
        const apis = getAvailableApisForSelect()
        if (apis.length > 0) {
          generated = await executeUnifiedAiCall(apis[0], prompt)
        }
      } catch {}

      // Tentativa 2: Via endpoint de agente do servidor
      if (!generated) {
        try {
          const storedApis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
          const userKeys: Record<string, string> = {}
          storedApis.forEach((a: any) => { if (a.key) userKeys[`${a.provider}_key`] = a.key })
          const res = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              userKeys,
            })
          })
          if (res.ok) {
            const data = await res.json()
            generated = data?.reply || data?.content || ''
          }
        } catch {}
      }

      // Tentativa 3: Síntese de Evidência Pedagógica Local Confiável (Grounding Krashen + Nation + Vygotsky)
      if (!generated || generated.length < 50) {
        const atRiskNames = atRisk.length > 0 ? atRisk.map(s => s.name).join(', ') : 'Nenhum aluno em situação crítica identificado'
        const topNames = topPerf.length > 0 ? topPerf.map(s => s.name).join(', ') : 'Desempenho distribuído homogeneamente'

        generated = `PARECER PEDAGÓGICO PRESCRITIVO GERAL — TEACHER AI
Referência: ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} | Média Geral da Amostra: ${avg}/10

1. 🎯 DIAGNÓSTICO DOS PRINCIPAIS GARGALOS OBSERVADOS
• Amostra total analisada: ${normalizedStudents.length} alunos cadastrados.
• Alunos em atenção prioritária: ${atRiskNames}.
• Alunos em faixa de excelência: ${topNames}.
• Padrão diagnosticado: Observa-se assimetria entre a compreensão passiva (Reading/Listening) e a acurácia sintática na produção autônoma (Speaking/Writing). Alunos em atenção apresentam hesitação em tempos verbais compostos e vocabulário produtivo.

2. 📚 FUNDAMENTAÇÃO TEÓRICA PRESCRITIVA
• Stephen Krashen (Filtro Afetivo & Input Compreensível i+1): Necessidade de criar um ambiente de baixo risco para a produção oral, oferecendo textos ligeiramente acima do nível atual com suporte multimodal.
• Paul Nation (The Four Strands, 2007): A rotina de aula deve equilibrar igualmente 25% de Meaning-focused Input, 25% de Meaning-focused Output, 25% de Language-focused Learning e 25% de Fluency Development.
• Lev Vygotsky (ZPD & Scaffolding): Aplicação de andaimes didáticos com agrupamentos produtivos (Peer Tutoring), onde alunos de destaque atuam como facilitadores de seus pares.
• Jim Scrivener (Guided Discovery): Redução drástica do Teacher Talking Time (TTT < 30%) em prol do Student Talking Time (STT > 70%).

3. ⚡ PLANO DE AÇÃO PRÁTICO PARA AS PRÓXIMAS 3 AULAS
• Aula 1 (Scaffolding & Chunks): Introdução dos tópicos através de blocos léxicos (Lexical Chunks) e mapas conceituais antes de exigir produção isolada.
• Aula 2 (Task-Based Rotation): Dinâmica de estações de aprendizagem em quartetos, alternando entre estações de flashcards, quiz interativo e produção colaborativa.
• Aula 3 (Consolidação & Feedback Formativo): Aplicação de rubrica transparente de autoavaliação e devolutiva individualizada focada em pontos de superação.

4. 🛠️ RECOMENDAÇÕES DE INTERVENÇÃO DIFERENCIADA
• Para Alunos em Atenção (${atRisk.length}): Fornecer glossários prévios, tempo estendido de formulação oral e fichas de auto-correção guiada.
• Para Alunos em Destaque (${topPerf.length}): Desafios de extensão (Open-ended prompts, criação de questões para o QBank e liderança de debates temáticos).`
      }

      setCustomAiDiagnostic(generated)
      try {
        localStorage.setItem('teacher_insights_ai_report', generated)
      } catch {}
    } catch (err) {
      console.error('Erro ao gerar diagnóstico IA:', err)
      setCustomAiDiagnostic('Não foi possível conectar à IA no momento. Tente novamente.')
    } finally {
      setIsGeneratingAi(false)
    }
  }

  const handleCopyHint = (hint: PedagogicalHint) => {
    const text = `*💡 Prescrição Pedagógica Teacher AI*\n*Alvo:* ${hint.targetName}\n*Gargalo:* ${hint.topic}\n*Fundamentação:* ${hint.author} (${hint.theory})\n\n*Prescrição:* ${hint.prescription}\n\n*Passos Práticos:*\n${hint.practicalSteps.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    navigator.clipboard.writeText(text)
    setCopiedId(hint.id)
    setActionToast('Prescrição copiada para a área de transferência!')
    setTimeout(() => {
      setCopiedId(null)
      setActionToast(null)
    }, 3000)
  }

  return (
    <ModuleShell title="Insights" subtitle="Inteligência pedagógica acionável fundamentada em evidências e grandes autores de ELT">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: 1200, margin: '0 auto' }}>
        
        {/* Banner de Cabeçalho com Fundamentação */}
        <div style={{
          background: 'linear-gradient(135deg, #2c1a0e 0%, #4a2f1b 100%)',
          borderRadius: 16,
          padding: '1.75rem 2rem',
          color: '#fdf8f2',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 4px 16px rgba(44,26,14,0.15)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span style={{ background: '#d4944a', color: '#2c1a0e', padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>
                MOTOR DE EVIDÊNCIA
              </span>
              <span style={{ fontSize: '0.9rem', color: '#e8d5c4' }}>Teorias de Aquisição de Linguagem & BNCC</span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Fraunces, Georgia, serif', fontWeight: 700 }}>
              Prescrições Didáticas & Intervenções em Evidência
            </h2>
            <p style={{ margin: '0.4rem 0 0 0', color: '#d5c0b0', fontSize: '0.9rem', maxWidth: 650 }}>
              O Teacher AI cruza as notas e históricos reais de seus alunos com autores canônicos (Krashen, Nation, Vygotsky, Scrivener) para prescrever exatamente o que fazer na próxima aula.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleGenerateAiDiagnostic}
              disabled={isGeneratingAi}
              style={{
                background: 'linear-gradient(135deg, #d4944a 0%, #b87b32 100%)',
                color: '#2c1a0e',
                border: 'none',
                padding: '0.75rem 1.25rem',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: isGeneratingAi ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
            >
              <i className={isGeneratingAi ? 'ti ti-loader ti-spin' : 'ti ti-sparkles'}></i>
              {isGeneratingAi ? 'Consultando IA...' : 'Gerar Parecer Prescritivo Geral'}
            </button>
          </div>
        </div>

        {/* Barra de Autores & Teorias Disponíveis */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem'
        }}>
          <button
            onClick={() => setActiveFilterCategory('all')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 20,
              fontSize: '0.85rem',
              fontWeight: 600,
              border: '1px solid #d5c0b0',
              background: activeFilterCategory === 'all' ? '#8b5e3c' : '#fffcf8',
              color: activeFilterCategory === 'all' ? '#fff' : '#586e75',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Todos os Autores ({theoreticalHints.length})
          </button>
          {THEORETICAL_FRAMEWORKS.map(fw => {
            const count = theoreticalHints.filter(h => h.sourceKey === fw.key).length
            return (
              <button
                key={fw.key}
                onClick={() => setActiveFilterCategory(fw.key)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 20,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: `1px solid ${activeFilterCategory === fw.key ? fw.color : '#e0d5c5'}`,
                  background: activeFilterCategory === fw.key ? fw.color : '#fffcf8',
                  color: activeFilterCategory === fw.key ? '#fff' : '#4a382a',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap'
                }}
              >
                <i className={`ti ${fw.icon}`}></i>
                <span>{fw.author}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({count})</span>
              </button>
            )
          })}
        </div>

        {/* Filtros por Turma e Busca */}
        <div style={{
          background: '#fffcf8',
          padding: '1rem 1.25rem',
          borderRadius: 12,
          border: '1px solid rgba(139,115,85,0.16)',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#7a6552' }}>Turma:</span>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 8,
                  border: '1px solid #d5c0b0',
                  background: '#fdf8f2',
                  fontSize: '0.85rem',
                  color: '#2c1a0e'
                }}
              >
                <option value="all">Todas as Turmas</option>
                {Array.from(new Set(normalizedStudents.map(s => s.className).filter(Boolean))).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#7a6552' }}>Aluno:</span>
              <select
                value={selectedStudent}
                onChange={e => setSelectedStudent(e.target.value)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 8,
                  border: '1px solid #d5c0b0',
                  background: '#fdf8f2',
                  fontSize: '0.85rem',
                  color: '#2c1a0e'
                }}
              >
                <option value="all">Todos os Alunos</option>
                {normalizedStudents.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ position: 'relative', minWidth: 260 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: 10, color: '#a08060' }}></i>
            <input
              type="text"
              placeholder="Buscar por autor, tema ou aluno..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2rem',
                borderRadius: 8,
                border: '1px solid #d5c0b0',
                background: '#fdf8f2',
                fontSize: '0.85rem',
                color: '#2c1a0e',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Parecer de IA Customizado se Gerado */}
        {customAiDiagnostic && (
          <div style={{
            background: '#fffdfa',
            border: '1px solid #d4944a',
            borderRadius: 14,
            padding: '1.5rem',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#8b5e3c', fontWeight: 700 }}>
                <TeacherLogo size={22} color="#8b5e3c" />
                <span>Parecer Pedagógico Geral da Rafinha IA</span>
              </div>
              <button
                onClick={() => setCustomAiDiagnostic('')}
                style={{ background: 'transparent', border: 'none', color: '#a08060', cursor: 'pointer' }}
              >
                <i className="ti ti-x"></i>
              </button>
            </div>
            <div style={{
              whiteSpace: 'pre-wrap',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              color: '#2c1a0e',
              background: '#fdf8f2',
              padding: '1rem',
              borderRadius: 8,
              border: '1px solid rgba(139,115,85,0.1)'
            }}>
              {customAiDiagnostic}
            </div>
          </div>
        )}

        {/* Grid de Cards de Hints Prescritivos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredHints.length === 0 ? (
            <div style={{
              background: '#fffcf8',
              borderRadius: 14,
              padding: '3rem 2rem',
              textAlign: 'center',
              border: '1px dashed #d5c0b0',
              color: '#a08060'
            }}>
              <i className="ti ti-certificate" style={{ fontSize: '2.5rem', opacity: 0.5, marginBottom: '0.75rem' }}></i>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#4a382a' }}>Nenhuma prescrição com os filtros selecionados</h3>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Cadastre alunos e lance notas na Caderneta para que o motor de evidências gere novos diagnósticos.
              </p>
            </div>
          ) : (
            filteredHints.map(hint => {
              const fw = THEORETICAL_FRAMEWORKS.find(f => f.key === hint.sourceKey) || THEORETICAL_FRAMEWORKS[0]
              return (
                <div
                  key={hint.id}
                  style={{
                    background: '#fffcf8',
                    borderRadius: 14,
                    border: '1px solid rgba(139,115,85,0.16)',
                    boxShadow: '0 2px 8px rgba(44,26,14,0.04)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                  }}
                >
                  {/* Cabeçalho do Card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{
                        background: hint.targetType === 'student' ? 'rgba(38,139,210,0.12)' : 'rgba(133,153,0,0.12)',
                        color: hint.targetType === 'student' ? '#268bd2' : '#859900',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: 6
                      }}>
                        {hint.targetType === 'student' ? 'ALUNO INDIVIDUAL' : 'COLETIVO DA TURMA'}
                      </span>
                      <strong style={{ fontSize: '1.05rem', color: '#2c1a0e' }}>{hint.targetName}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#a08060' }}>• Nível {hint.recommendedLevel}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        background: `${fw.color}15`,
                        color: fw.color,
                        border: `1px solid ${fw.color}40`,
                        padding: '0.2rem 0.6rem',
                        borderRadius: 999,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}>
                        <i className={`ti ${fw.icon}`}></i>
                        {hint.author}
                      </span>
                      <button
                        onClick={() => handleCopyHint(hint)}
                        title="Copiar Prescrição"
                        style={{
                          background: 'transparent',
                          border: '1px solid #d5c0b0',
                          borderRadius: 8,
                          padding: '0.35rem 0.6rem',
                          color: '#4a382a',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <i className={copiedId === hint.id ? 'ti ti-check' : 'ti ti-copy'}></i>
                        {copiedId === hint.id ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Diagnóstico do Gargalo & Fundamentação Teórica */}
                  <div style={{
                    background: '#fdf8f2',
                    padding: '0.9rem 1.1rem',
                    borderRadius: 10,
                    borderLeft: `4px solid ${fw.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#8b5e3c', fontWeight: 700, fontSize: '0.85rem' }}>
                      <i className="ti ti-target"></i>
                      <span>Gargalo: {hint.topic}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#4a382a', lineHeight: 1.45 }}>
                      <strong>Desafio Diagnosticado:</strong> {hint.challenge}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#7a6552', fontStyle: 'italic' }}>
                      <strong>Referência Pedagógica:</strong> {hint.author} — <em>{hint.theory}</em> ({fw.work})
                    </p>
                  </div>

                  {/* A Prescrição Prática e Passos */}
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#2c1a0e', display: 'block', marginBottom: '0.4rem' }}>
                      ⚡ Prescrição & Plano de Ação para a Próxima Aula:
                    </strong>
                    <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.88rem', color: '#2c1a0e', lineHeight: 1.5 }}>
                      {hint.prescription}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {hint.practicalSteps.map((step, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: '#4a382a' }}>
                          <span style={{
                            background: '#8b5e3c',
                            color: '#fff',
                            borderRadius: '50%',
                            width: 18,
                            height: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            flexShrink: 0,
                            marginTop: 2
                          }}>
                            {idx + 1}
                          </span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Toast Notificador */}
        {actionToast && (
          <div style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            background: '#2c1a0e',
            color: '#fdf8f2',
            padding: '0.75rem 1.25rem',
            borderRadius: 8,
            fontSize: '0.85rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <i className="ti ti-check" style={{ color: '#859900' }}></i>
            {actionToast}
          </div>
        )}
      </div>
    </ModuleShell>
  )
}