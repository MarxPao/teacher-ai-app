'use client'

import { useState, useEffect, useRef } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import { ApiConfig } from '@/components/modules/ApiManager'
import SavedItemsDrawer, { saveItemToStorage, SavedItem } from '@/components/SavedItemsDrawer'
import { exportToPdf, exportToWord } from '@/lib/exportUtils'


interface MethodologyBox {
  id: string
  name: string
  tktModule: string
  icon: string
  badgeColor: string
  shortDesc: string
  stagesSnippet: string
  promptInstruction: string
}

const TKT_METHODOLOGY_BOXES: MethodologyBox[] = [
  {
    id: 'ppp',
    name: 'PPP (Presentation, Practice, Production)',
    tktModule: 'TKT M1 & M2',
    icon: 'ti-slideshow',
    badgeColor: '#268bd2',
    shortDesc: 'Abordagem clássica e estruturada para introdução e consolidação de gramática e vocabulário.',
    stagesSnippet: 'Lead-in ➔ Presentation (Context + Form) ➔ Controlled Practice ➔ Freer Production ➔ Feedback',
    promptInstruction: 'Estruture o roteiro de aula rigorosamente no modelo PPP: (1) Lead-in/Warm-up, (2) Presentation of Meaning, Form & Pronunciation (MFP), (3) Controlled Practice Activity, (4) Freer Production Activity, (5) Feedback & Delayed Error Correction.',
  },
  {
    id: 'tblt',
    name: 'TBLT (Task-Based Language Teaching)',
    tktModule: 'TKT M1 & M2',
    icon: 'ti-list-check',
    badgeColor: '#b58900',
    shortDesc: 'Aprendizagem orientada por tarefas reais, onde o foco linguístico surge da necessidade prática.',
    stagesSnippet: 'Pre-Task (Warm-up & Model) ➔ Task Cycle (Planning & Report) ➔ Language Focus & Analysis',
    promptInstruction: 'Estruture o roteiro de aula no ciclo TBLT: (1) Pre-Task (introdução ao tópico e ativação de vocabulário), (2) Task Cycle (alunos realizam a tarefa em duplas, preparam relatório e apresentam), (3) Language Focus (análise da linguagem usada e prática de aperfeiçoamento).',
  },
  {
    id: 'ttt',
    name: 'TTT (Test-Teach-Test)',
    tktModule: 'TKT M1 & M2',
    icon: 'ti-report-analytics',
    badgeColor: '#cb4b16',
    shortDesc: 'Diagnóstico inicial do conhecimento dos alunos para ensinar apenas o que necessita de intervenção.',
    stagesSnippet: 'Test 1 (Diagnostic Task) ➔ Teach (Targeted Input & Clarification) ➔ Test 2 (Consolidation Task)',
    promptInstruction: 'Estruture o roteiro no modelo Test-Teach-Test: (1) Test 1 - Tarefa diagnóstica sem explicação prévia, (2) Teach - Esclarecimento focado nas lacunas identificadas, (3) Test 2 - Nova tarefa para verificar a consolidação.',
  },
  {
    id: 'guided_discovery',
    name: 'Guided Discovery (Descoberta Guiada)',
    tktModule: 'TKT M1 & M3',
    icon: 'ti-bulb',
    badgeColor: '#2aa198',
    shortDesc: 'Alunos analisam exemplos autênticos e descobrem as regras gramaticais/léxicas autonomamente.',
    stagesSnippet: 'Exposure to Text ➔ Guided Questions (Noticing) ➔ Rule Elicitation ➔ Concept Check ➔ Practice',
    promptInstruction: 'Utilize Descoberta Guiada: forneça texto/exemplos contextuais, faça perguntas direcionadas de observação (Noticing Tasks), elicie a regra gramatical/léxica dos próprios alunos e aplique CCQs.',
  },
  {
    id: 'flipped',
    name: 'Sala de Aula Invertida (Flipped Classroom)',
    tktModule: 'TKT M2 & Metodologias Ativas',
    icon: 'ti-replace',
    badgeColor: '#6c71c4',
    shortDesc: 'Estudo autônomo prévio e uso do tempo presencial para tarefas colaborativas de alta cognição.',
    stagesSnippet: 'Pre-Class Prep Task ➔ In-Class Warm-up Q&A ➔ Collaborative Challenge ➔ Synthesis & Peer Assessment',
    promptInstruction: 'Divida o plano em: (1) Pre-Class Preparation (leitura/vídeo prévio), (2) In-Class Warm-up & Q&A, (3) In-Class Collaborative Challenge (trabalho em grupo de aplicação profunda), (4) Peer Feedback & Wrap-up.',
  },
  {
    id: 'lexical',
    name: 'Abordagem Léxica (Lexical Approach / Lewis)',
    tktModule: 'TKT M1',
    icon: 'ti-abc',
    badgeColor: '#d33682',
    shortDesc: 'Foco no ensino de blocos de linguagem (chunks, collocations e expressões prontas da vida real).',
    stagesSnippet: 'Chunk Identification ➔ Collocation Matching ➔ Personalised Drilling ➔ Fluency Task',
    promptInstruction: 'Aplique a Abordagem Léxica: destaque collocations, lexical chunks e expressões fixas. Crie tarefas de identificação de chunks em textos e exercícios de produção combinatória.',
  },
  {
    id: 'clil',
    name: 'CLIL (Content & Language Integrated Learning)',
    tktModule: 'TKT CLIL Specialist',
    icon: 'ti-world-latitude',
    badgeColor: '#859900',
    shortDesc: 'Ensino integrado de conteúdos acadêmicos (Ciências, História, Geografia) em língua inglesa.',
    stagesSnippet: 'Content Input (Text/Video) ➔ Scaffolding & Dual Aims ➔ Task & Processing ➔ Subject Synthesis',
    promptInstruction: 'Estruture como aula CLIL: integre um tema acadêmico (ex: Ciências, Geografia, História, Sustentabilidade) com objetivos duplos (Content Aim + Language Support Aim). Inclua suporte de andaimes (Scaffolding).',
  },
  {
    id: 'gamification',
    name: 'Gamificação (Gamified Learning)',
    tktModule: 'Metodologias Ativas & TKT M3',
    icon: 'ti-trophy',
    badgeColor: '#073642',
    shortDesc: 'Uso de mecânicas de jogos (pontuação, missões, níveis de desafio e conquistas em equipe).',
    stagesSnippet: 'Mission Briefing ➔ Level 1 (Easy Quest) ➔ Level 2 (Boss Challenge) ➔ XP Tally & Badges',
    promptInstruction: 'Incorpore Gamificação no roteiro: atribua pontos de XP por etapa, divida as fases em "Quests" (Fácil, Médio, Boss Level) e adicione um sistema de feedback imediato e insígnias.',
  },
]

const PROMPT_PRESETS = [
  {
    id: 'cinema',
    name: '🎬 Cinema & Storytelling Imersivo',
    prompt: 'Seja uma consultora de roteiro cinematográfico! Traga ganchos narrativos de mistério, suspense ou ficção, transformando a aula em uma cena inesquecível de filme.',
  },
  {
    id: 'rpg',
    name: '🎮 RPG & Gamificação Fora da Caixa',
    prompt: 'Aja como uma Game Designer Pedagógica! Crie dinâmicas de RPG de mesa, avatares, inventários de palavras e missões onde o erro é apenas uma perda de HP temporária.',
  },
  {
    id: 'philosophy',
    name: '🧠 Dilemas Éticos & Debate Profundo',
    prompt: 'Seja uma provocadora de pensamento crítico! Proponha dilemas morais abstratos do século XXI que forcem os alunos a pensar alto e debater posições complexas em inglês.',
  },
  {
    id: 'arts',
    name: '🎨 Artes, Metáforas & Sensorialidade',
    prompt: 'Utilize estímulos multisensoriais, metáforas poéticas, música, artes plásticas e imagens marcantes para introduzir conceitos gramaticais de forma orgânica.',
  },
  {
    id: 'sci_fi',
    name: '🧪 Viagem no Tempo & STEAM',
    prompt: 'Imagine uma aula com elementos de ficção científica, viagens temporais, tecnologias futuristas e experimentos interativos para engajar a turma.',
  },
]

const CEFR_LEVELS = ['A1 (Beg)', 'A2 (Elem)', 'B1 (Inter)', 'B2 (Upper)', 'C1 (Adv)', 'C2 (Master)']
const GRADES = ['5º Fund.', '6º Fund.', '7º Fund.', '8º Fund.', '9º Fund.', '1º Médio', '2º Médio', '3º Médio', 'Inglês Adultos / Idiomas']
const DURATIONS = ['45 minutos', '50 minutos (Padrao)', '60 minutos', '90 minutos (Dupla)', '120 minutos']
const MAIN_SKILLS = [
  'Grammar & Structural Accuracy',
  'Vocabulary & Lexical Chunks',
  'Speaking & Conversational Fluency',
  'Listening & Phonological Awareness',
  'Reading & Critical Inference',
  'Writing & Text Composition',
  'Functional Language & Situational English',
]

interface CreativeMessage {
  id: string
  sender: 'user' | 'rafinha'
  text: string
  suggestedTopic?: string
  timestamp: string
}

export default function LessonStudio() {
  // Mode State: 'brainstorm' (Co-Criação & Chat) | 'studio' (Formulário, Boxes & Canvas)
  const [mode, setMode]                   = useState<'brainstorm' | 'studio'>('brainstorm')

  // Form State
  const [topic, setTopic]                 = useState('')
  const [grade, setGrade]                 = useState('9º Fund.')
  const [cefr, setCefr]                   = useState('B1 (Inter)')
  const [duration, setDuration]           = useState('50 minutos (Padrao)')
  const [skill, setSkill]                 = useState('Speaking & Conversational Fluency')
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>(['ppp', 'flipped'])

  // Creative Persona & Calibration State
  const [selectedPresetId, setSelectedPresetId] = useState('cinema')
  const [customPersonaPrompt, setCustomPersonaPrompt] = useState(PROMPT_PRESETS[0].prompt)
  const [showCalibration, setShowCalibration] = useState(false)

  // Creative Chat State
  const [creativeMessages, setCreativeMessages] = useState<CreativeMessage[]>([
    {
      id: '1',
      sender: 'rafinha',
      text: 'Oi! Sou a Rafinha 🎨 Bem-vindo ao nosso espaço de co-criação! Aqui a gente pode viajar, trocar ideias loucas, criar ganchos de cinema ou metáforas abstratas antes de fechar a aula. O que você quer inventar hoje com seus alunos?',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }
  ])
  const [inputMessage, setInputMessage]   = useState('')
  const [chatLoading, setChatLoading]     = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // API & Document State
  const [apis, setApis]                   = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState<string>('')
  const [loading, setLoading]             = useState(false)
  const [resultHtml, setResultHtml]       = useState('')

  // Saved Items State
  const [showSaved, setShowSaved]         = useState(false)
  const [savedCount, setSavedCount]       = useState(0)

  const updateSavedCount = () => {
    try {
      const items = JSON.parse(localStorage.getItem('teacher_saved_lessons') || '[]')
      setSavedCount(items.length)
    } catch { setSavedCount(0) }
  }

  useEffect(() => {
    updateSavedCount()
    window.addEventListener('storage', updateSavedCount)
    try {
      const { getAvailableApisForSelect } = require('@/lib/autoApiSelector')
      const allApis = getAvailableApisForSelect()
      setApis(allApis)
      if (allApis.length > 0) setSelectedApiId(allApis[0].id)
    } catch {}

    // F8: Lê prefill enviado pela Rafinha (tool create_full_lesson)
    try {
      const prefillRaw = localStorage.getItem('teacher_lessonstudio_prefill')
      if (prefillRaw) {
        const prefill = JSON.parse(prefillRaw)
        if (prefill.generatedAt && Date.now() - prefill.generatedAt < 10000) {
          if (prefill.topic)    setTopic(prefill.topic)
          if (prefill.grade)    setGrade(prefill.grade)
          if (prefill.cefr)     setCefr(prefill.cefr)
          if (prefill.duration) setDuration(prefill.duration)
          localStorage.removeItem('teacher_lessonstudio_prefill')
        }
      }
    } catch { /* ignore */ }

    return () => window.removeEventListener('storage', updateSavedCount)
  }, [])


  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [creativeMessages])

  const toggleBox = (id: string) => {
    setSelectedBoxIds(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]
    )
  }

  const handleSelectPreset = (presetId: string) => {
    const found = PROMPT_PRESETS.find(p => p.id === presetId)
    if (found) {
      setSelectedPresetId(presetId)
      setCustomPersonaPrompt(found.prompt)
    }
  }

  // Enviar mensagem no Chat Criativo de Brainstorming
  async function handleSendCreativeMessage() {
    if (!inputMessage.trim() || chatLoading) return
    const userText = inputMessage.trim()
    setInputMessage('')

    const userMsg: CreativeMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }
    setCreativeMessages(prev => [...prev, userMsg])
    setChatLoading(true)

    const systemPrompt = `Você é a Rafinha em MODO CO-CRIADORA E BRAINSTORMER CRIATIVA DE AULAS DE INGLÊS.
Seu objetivo é trocar ideias de forma abstrata, aberta, viajada, inspiradora e entusiasmada com o professor de inglês!
NÃO responda de forma rígida ou formal. Traga metáforas visuais, ganchos narrativos, dinâmicas de sala fora da caixa, jogos mentais e provocação pedagógica.

DIRETRIZ DE CALIBRAGEM PERSONALIZADA DEFINIDA PELO PROFESSOR:
"${customPersonaPrompt}"

SE O PROFESSOR SEGESTIONAR UM TÓPICO OU TEMA (ex: Past Perfect, viagens, comida, IA), abra a mente e proponha 3 ideias super criativas e diferentonas para a aula!
No final da resposta, se um tópico for claro, inclua uma linha isolada no formato:
"[SUGGESTED_TOPIC: Nome do Tópico Sugerido]"`

    try {
      const api = apis.find(a => a.id === selectedApiId)
      let replyText = ''

      if (api && (api.provider === 'openai' || api.provider === 'deepseek')) {
        const baseUrl = api.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
        const r = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` },
          body: JSON.stringify({
            model: api.model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...creativeMessages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
              { role: 'user', content: userText }
            ]
          })
        })
        const d = await r.json()
        replyText = d.choices?.[0]?.message?.content || ''
      } else {
        const r = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt },
              ...creativeMessages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
              { role: 'user', content: userText }
            ],
            context: 'lessonstudio',
            provider: api?.provider || 'manual',
            userKey: api?.key || '',
            model: api?.model || ''
          })
        })
        const d = await r.json()
        replyText = d.response || d.text || 'Que ideia fantástica! Vamos pensar em como transformar isso em uma experiência inesquecível para os alunos.'
      }

      // Extrai tópico sugerido se houver
      let extractedTopic = ''
      const topicMatch = replyText.match(/\[SUGGESTED_TOPIC:\s*([^\]]+)\]/)
      if (topicMatch) {
        extractedTopic = topicMatch[1].trim()
        replyText = replyText.replace(/\[SUGGESTED_TOPIC:\s*([^\]]+)\]/, '').trim()
      }

      const rafinhaMsg: CreativeMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'rafinha',
        text: replyText,
        suggestedTopic: extractedTopic || userText.slice(0, 40),
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }
      setCreativeMessages(prev => [...prev, rafinhaMsg])
    } catch {
      setCreativeMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'rafinha',
        text: 'Nossa, amei essa direção! O que acha de a gente conectar isso com um desafio em duplas onde os alunos criam a resolução em formato de story?',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // Transforma uma ideia do chat no Roteiro Timed TKT Completo
  function handleUseIdeaForLesson(suggestedTopic: string) {
    setTopic(suggestedTopic)
    setMode('studio')
    handleGenerateLessonWithTopic(suggestedTopic)
  }

  async function handleGenerateLessonWithTopic(overrideTopic?: string) {
    const finalTopic = overrideTopic || topic
    if (!selectedBoxIds.length) {
      alert('Selecione pelo menos uma metodologia em Box para a aula.')
      return
    }
    setLoading(true)
    setResultHtml('')

    const chosenBoxes = TKT_METHODOLOGY_BOXES.filter(b => selectedBoxIds.includes(b.id))
    const boxNames = chosenBoxes.map(b => b.name).join(', ')
    const boxInstructions = chosenBoxes.map(b => `- **${b.name}**: ${b.promptInstruction}`).join('\n')

    const prompt = `Você é um Master Trainer especialista em metodologia de ensino de inglês credenciado pela Cambridge English (TKT Modules 1, 2 e 3 / CELTA) com sensibilidade altamente criativa.
Crie um PLANO DE AULA COMPLETO, ROTEIRO DE AULA PASSO A PASSO EM TABELA E GUIA PEDAGÓGICO DE REGÊNCIA com as especificações abaixo.

CALIBRAGEM CRIATIVA / PERSONALIDADE:
"${customPersonaPrompt}"

ESPECIFICAÇÕES DA AULA:
- Tópico da Aula: ${finalTopic || 'Past Simple vs Present Perfect in Authentic Contexts'}
- Público/Série: ${grade}
- Nível CEFR: ${cefr}
- Duração Total: ${duration}
- Habilidade Foco: ${skill}
- Metodologias Escolhidas: ${boxNames}

INSTRUÇÕES DAS METODOLOGIAS SELECIONADAS:
${boxInstructions}

ESTRUTURA OBRIGATÓRIA DA RESPOSTA (GERE EM HTML LIMPO PARA EXIBIÇÃO EM CANVAS):

<h1>📚 PLANO DE AULA & ROTEIRO CRIATIVO (CAMBRIDGE TKT STANDARD)</h1>
<p><strong>Tópico:</strong> ${finalTopic || 'General Topic'} | <strong>Nível:</strong> ${cefr} | <strong>Duração:</strong> ${duration} | <strong>Público:</strong> ${grade}</p>

<h2>1. METADADOS & OBJETIVOS DO PLANO DE AULA (TKT Module 2)</h2>
<ul>
  <li><strong>Main Aim (Objetivo Principal):</strong> Defina claramente o que os alunos serão capazes de fazer até o final da aula.</li>
  <li><strong>Subsidiary Aims (Objetivos Secundários):</strong> Estruturas gramaticais, vocabulário e sub-habilidades de suporte.</li>
  <li><strong>Personal Teacher Aim (Objetivo do Professor):</strong> Prática de regência TKT (ex: Reduzir TTT, aprimorar ICQs/CCQs, gerenciar tempo).</li>
  <li><strong>Target Language & Vocabulary:</strong> Lista de estruturas-chave e chunks.</li>
  <li><strong>Assumed Knowledge (Conhecimentos Prévios):</strong> O que os alunos já dominam antes da aula.</li>
</ul>

<h3>⚠️ Anticipated Problems & Solutions (TKT Problem Analysis)</h3>
<table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; margin-bottom:20px;">
  <tr style="background:#073642; color:#fff;">
    <th>Área (Linguagem / Gestão / Técnica)</th>
    <th>Problema Antecipado</th>
    <th>Solução Pedagógica Planejada (TKT Strategy)</th>
  </tr>
  <tr>
    <td>Linguagem / Pronúncia</td>
    <td>Ex: Dificuldade na pronúncia do som /θ/ ou confusão entre L1 e L2.</td>
    <td>Modelagem de boca, drill coral/individual e par mínimo.</td>
  </tr>
  <tr>
    <td>Gestão de Sala / Ritmo</td>
    <td>Ex: Alunos mais rápidos terminam a prática controlada antes.</td>
    <td>Fornecer Fast-Finisher Activity (desafio de extensão no verso).</td>
  </tr>
</table>

<h2>2. ROTEIRO DE AULA PASSO A PASSO COM MARCAÇÃO DE TEMPO (TKT Stage Table)</h2>
<table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; margin-bottom:24px;">
  <thead>
    <tr style="background:#073642; color:#fff;">
      <th style="width:15%">Etapa & Objetivo</th>
      <th style="width:10%">Tempo</th>
      <th style="width:12%">Interação</th>
      <th style="width:25%">Ação do Professor (Teacher Procedure)</th>
      <th style="width:23%">Ação dos Alunos (Student Procedure)</th>
      <th style="width:15%">Técnicas TKT (CCQs / ICQs)</th>
    </tr>
  </thead>
  <tbody>
    <!-- Inclua de 4 a 6 etapas detalhadas correspondentes às metodologias escolhidas -->
  </tbody>
</table>

<h2>3. GUIA DE REGÊNCIA & TÉCNICAS DE SALA DE AULA (TKT Module 3)</h2>
<ul>
  <li><strong>Condução da Sensibilização (Lead-in / Hook Criativo):</strong> Gancho instigante para a aula.</li>
  <li><strong>Checagem de Instrução (ICQs):</strong> Perguntas para verificar o entendimento das regras da atividade.</li>
  <li><strong>Checagem de Conceito (CCQs):</strong> Perguntas para testar a compreensão do significado gramatical/léxico.</li>
  <li><strong>Plano de Lousa (Board Plan Setup):</strong> Organização visual da lousa.</li>
  <li><strong>Estratégia de Correção de Erros:</strong> Feedback imediato vs Delayed Error Correction.</li>
  <li><strong>Atividade de Extensão / Homework:</strong> Tarefa para casa.</li>
</ul>

Gere o HTML completo agora:`

    try {
      const api = apis.find(a => a.id === selectedApiId) || apis[0] || null
      const { executeUnifiedAiCall } = await import('@/lib/autoApiSelector')
      const text = await executeUnifiedAiCall(api, prompt)

      const cleanHtml = text.replace(/^```html\n?/, '').replace(/```$/, '').trim()
      setResultHtml(cleanHtml)
    } catch (e: any) {
      alert(`Erro ao gerar aula: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  function handleSaveLesson() {
    if (!resultHtml) { alert('Gere uma aula primeiro.'); return }
    const saved = saveItemToStorage('teacher_saved_lessons', {
      title: topic ? `Aula — ${topic}` : `Plano de Aula (${cefr})`,
      subtitle: `${cefr} · ${grade} · ${duration}`,
      content: resultHtml,
    })
    if (saved) {
      updateSavedCount()
      alert('✅ Aula salva com sucesso em "Aulas Salvas"!')
    }
  }

  function handleOpenInEditor() {
    if (!resultHtml) return
    localStorage.setItem('teacher_editor_prefill', JSON.stringify({
      title: topic ? `Plano de Aula — ${topic}` : `Plano de Aula Cambridge TKT`,
      content: resultHtml,
      school: '',
    }))
    window.dispatchEvent(new Event('teacher:editor_prefill'))
    alert('✅ Aula enviada para o Editor Word! Navegando...')
  }

  return (
    <div style={{ padding: '32px 40px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1650, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      {/* Top Header & Tab Mode Switcher */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 600, color: '#073642', fontStyle: 'italic', margin: 0 }}>
              Criar Aula & Co-Criação
            </h1>
            <span style={{ background: '#073642', color: '#b58900', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Cambridge TKT & Studio Criativo
            </span>
          </div>
          <p style={{ color: '#586e75', fontSize: 13, marginTop: 4, margin: 0 }}>
            Troque ideias abstratas com a Rafinha, calibre personas e gere roteiros pedagógicos em tabelas timed.
          </p>
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: '#eee8d5', padding: 4, borderRadius: 14, display: 'flex', gap: 4 }}>
            <button
              onClick={() => setMode('brainstorm')}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none',
                background: mode === 'brainstorm' ? '#073642' : 'transparent',
                color: mode === 'brainstorm' ? '#fff' : '#586e75',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}
            >
              <i className="ti ti-palette" /> 🎨 Co-Criação & Brainstorm
            </button>
            <button
              onClick={() => setMode('studio')}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none',
                background: mode === 'studio' ? '#073642' : 'transparent',
                color: mode === 'studio' ? '#fff' : '#586e75',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}
            >
              <i className="ti ti-layout-grid" /> 📋 Boxes & Canvas TKT
            </button>
          </div>

          <button
            onClick={() => setShowSaved(true)}
            style={{
              padding: '9px 16px', borderRadius: 12, border: '1px solid #073642',
              background: '#fdf9f3', color: '#073642', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className="ti ti-bookmark" style={{ color: '#b58900' }} /> 📁 Salvos ({savedCount})
          </button>
        </div>
      </div>

      {/* PROMPT CALIBRATION PANEL (EXPANDABLE) */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ede8dc', marginBottom: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,43,54,0.03)' }}>
        <div
          onClick={() => setShowCalibration(!showCalibration)}
          style={{
            padding: '12px 18px', background: '#fdf9f3', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: showCalibration ? '1px solid #ede8dc' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-adjustments" style={{ color: '#b58900', fontSize: 18 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>
              ⚙️ Calibragem Criativa do Prompt & Persona da Rafinha
            </span>
            <span style={{ fontSize: 11, color: '#93a1a1' }}>
              (Ajuste o tom abstrato, metáforas e estilo de co-criação)
            </span>
          </div>
          <i className={`ti ${showCalibration ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: '#93a1a1' }} />
        </div>

        {showCalibration && (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Presets de Estilo Criativo:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PROMPT_PRESETS.map(p => {
                  const active = selectedPresetId === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPreset(p.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 20,
                        border: active ? '1.5px solid #073642' : '1px solid #e8e0d0',
                        background: active ? '#073642' : '#f5f0e8',
                        color: active ? '#fff' : '#586e75',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>
                Diretriz de Calibragem (Edite como quiser):
              </label>
              <textarea
                rows={2}
                value={customPersonaPrompt}
                onChange={e => setCustomPersonaPrompt(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  border: '1px solid #e8e0d0', background: '#fdf6e3',
                  fontSize: 12.5, outline: 'none', color: '#073642',
                  fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* MODE 1: BRAINSTORMING & CO-CREATION CHAT STUDIO */}
      {mode === 'brainstorm' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 24, minHeight: 0 }}>
          {/* Quick Parameters for Brainstorm */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 20, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#073642', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-adjustments-horizontal" style={{ color: '#268bd2' }} /> Parâmetros da Aula
            </h3>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>📌 Tópico da Aula</label>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Ex: Travel Stories, Viagem no Tempo..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, outline: 'none', color: '#073642', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>🏫 Série</label>
                <select value={grade} onChange={e => setGrade(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 12, color: '#073642' }}>
                  {GRADES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>📊 CEFR</label>
                <select value={cefr} onChange={e => setCefr(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 12, color: '#073642' }}>
                  {CEFR_LEVELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>🎯 Habilidade</label>
              <select value={skill} onChange={e => setSkill(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 12, color: '#073642' }}>
                {MAIN_SKILLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ marginTop: 10, padding: 12, background: '#fdf6e3', borderRadius: 12, border: '1px solid rgba(181,137,0,0.2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#b58900', display: 'block', marginBottom: 4 }}>
                💡 Dica de Co-Criação:
              </span>
              <p style={{ fontSize: 11.5, color: '#586e75', margin: 0, lineHeight: 1.4 }}>
                Pergunte à Rafinha: <em>"Como posso explicar Present Perfect usando uma metáfora visual de mochila de viagem?"</em> ou <em>"Me dê 3 ganchos de cinema para abrir essa aula."</em>
              </p>
            </div>

            <button
              onClick={() => { setMode('studio'); handleGenerateLessonWithTopic() }}
              style={{
                marginTop: 'auto', padding: '12px', borderRadius: 12,
                background: '#073642', color: '#fff', fontSize: 13, fontWeight: 700,
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
              }}
            >
              <i className="ti ti-arrow-right" /> Ir para Roteiro & Canvas TKT
            </button>
          </div>

          {/* CREATIVE CHAT WINDOW */}
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,43,54,0.04)' }}>
            {/* Chat Messages */}
            <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {creativeMessages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: msg.sender === 'user' ? '#073642' : '#b58900' }}>
                      {msg.sender === 'user' ? 'Você' : 'Rafinha 🎨 (Co-Criadora)'}
                    </span>
                    <span style={{ fontSize: 10, color: '#93a1a1' }}>{msg.timestamp}</span>
                  </div>

                  <div
                    style={{
                      maxWidth: '85%', padding: '12px 16px', borderRadius: 16,
                      background: msg.sender === 'user' ? '#073642' : '#fdf6e3',
                      color: msg.sender === 'user' ? '#fff' : '#073642',
                      border: msg.sender === 'user' ? 'none' : '1px solid #ede8dc',
                      fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                      boxShadow: '0 2px 8px rgba(0,43,54,0.03)',
                    }}
                  >
                    {msg.text}

                    {msg.sender === 'rafinha' && msg.suggestedTopic && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #d3cbbd', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleUseIdeaForLesson(msg.suggestedTopic!)}
                          style={{
                            padding: '6px 12px', borderRadius: 10, border: 'none',
                            background: '#268bd2', color: '#fff', fontSize: 11.5,
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                          }}
                        >
                          <i className="ti ti-sparkles" /> ✨ Usar esta Ideia no Roteiro TKT
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#93a1a1', fontSize: 12 }}>
                  <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> Rafinha viajando na ideia...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div style={{ padding: 14, background: '#eee8d5', borderTop: '1px solid #e4ddd0', display: 'flex', gap: 10 }}>
              <input
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendCreativeMessage()}
                placeholder="Ex: Rafinha, me dê um gancho de suspense para a aula de Present Perfect..."
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #d3cbbd',
                  background: '#fff', fontSize: 13.5, outline: 'none', color: '#073642',
                }}
              />
              <button
                onClick={handleSendCreativeMessage}
                disabled={chatLoading}
                style={{
                  padding: '0 20px', borderRadius: 12, border: 'none',
                  background: '#073642', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: chatLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <i className="ti ti-send" /> Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: FORM BOXES & TIMED TABLE CANVAS STUDIO */}
      {mode === 'studio' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 480px) 1fr', gap: 28, flex: 1, minHeight: 0 }}>
          {/* LEFT COLUMN: PARAMETERS & METHODOLOGY BOX CARDS */}
          <div style={{ overflowY: 'auto', paddingRight: 6, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Main Inputs */}
            <div style={{ background: '#fff', borderRadius: 18, padding: 20, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#073642', display: 'block', marginBottom: 6 }}>
                  📌 Tópico ou Conteúdo Central da Aula
                </label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Ex: Present Perfect vs Past Simple through Storytelling..."
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 10,
                    border: '1px solid #e8e0d0', background: '#f5f0e8',
                    fontSize: 14, outline: 'none', color: '#073642', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>🏫 Ano / Série</label>
                  <select value={grade} onChange={e => setGrade(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642' }}>
                    {GRADES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>📊 Nível CEFR</label>
                  <select value={cefr} onChange={e => setCefr(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642' }}>
                    {CEFR_LEVELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>⏱️ Duração da Aula</label>
                  <select value={duration} onChange={e => setDuration(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642' }}>
                    {DURATIONS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>🎯 Habilidade Principal</label>
                  <select value={skill} onChange={e => setSkill(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642' }}>
                    {MAIN_SKILLS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* METHODOLOGY SELECTION IN BOXES */}
            <div style={{ background: '#fff', borderRadius: 18, padding: 20, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#073642', display: 'block' }}>
                    🧪 Seleção de Metodologias em Box
                  </span>
                  <span style={{ fontSize: 11, color: '#93a1a1' }}>
                    Escolha uma ou mais metodologias para estruturar as etapas da aula
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#b58900', background: '#fdf6e3', padding: '3px 8px', borderRadius: 8 }}>
                  {selectedBoxIds.length} selecionada(s)
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {TKT_METHODOLOGY_BOXES.map(box => {
                  const selected = selectedBoxIds.includes(box.id)
                  return (
                    <div
                      key={box.id}
                      onClick={() => toggleBox(box.id)}
                      style={{
                        padding: '12px 14px', borderRadius: 14,
                        border: selected ? `2px solid ${box.badgeColor}` : '1px solid #ede8dc',
                        background: selected ? '#fdf9f3' : '#faf8f5',
                        cursor: 'pointer', transition: 'all 0.15s',
                        display: 'flex', flexDirection: 'column', gap: 6,
                        boxShadow: selected ? '0 4px 12px rgba(7,54,66,0.06)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: 6,
                            background: selected ? box.badgeColor : '#e4ddd0',
                            color: selected ? '#fff' : '#586e75',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                          }}>
                            <i className={`ti ${box.icon}`} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>
                            {box.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: box.badgeColor, background: '#fff', border: `1px solid ${box.badgeColor}`, padding: '2px 6px', borderRadius: 6 }}>
                            {box.tktModule}
                          </span>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {}}
                            style={{ accentColor: box.badgeColor, cursor: 'pointer' }}
                          />
                        </div>
                      </div>

                      <p style={{ fontSize: 11, color: '#586e75', margin: 0, lineHeight: 1.4 }}>
                        {box.shortDesc}
                      </p>

                      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#93a1a1', background: '#fff', padding: '4px 8px', borderRadius: 6, border: '1px solid #eee8d5' }}>
                        ⚡ {box.stagesSnippet}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AI Selector & Generate Button */}
            <div style={{ background: '#fff', borderRadius: 18, padding: 18, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#586e75', display: 'block', marginBottom: 4 }}>🧠 IA para Construção</label>
                <select
                  value={selectedApiId}
                  onChange={e => setSelectedApiId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642' }}
                >
                  {apis.length === 0 ? <option value="auto">Modo AUTO (DeepSeek / Groq)</option> : apis.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <button
                onClick={() => handleGenerateLessonWithTopic()}
                disabled={loading}
                style={{
                  padding: '14px', borderRadius: 14,
                  background: loading ? '#93a1a1' : '#073642',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  boxShadow: '0 4px 16px rgba(7,54,66,0.2)', fontFamily: 'inherit',
                }}
              >
                <i className={loading ? 'ti ti-loader' : 'ti ti-sparkles'} style={{ fontSize: 18, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                {loading ? 'Construindo Roteiro TKT...' : '✨ Gerar Aula Completa TKT'}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: DOCUMENT CANVAS DISPLAY */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            {/* Header Action Bar when Result is ready */}
            {resultHtml && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fff', padding: '10px 16px', borderRadius: 14, border: '1px solid #ede8dc', flexWrap: 'wrap' }}>
                <button
                  onClick={() => exportToPdf({
                    title: `PLANO DE AULA TKT — ${topic.toUpperCase() || 'LÍNGUA INGLESA'}`,
                    className: cefr || 'B1-B2',
                    content: resultHtml,
                    showStudentNameBox: false
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: 'none',
                    background: '#8b5e3c', color: '#fff', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  📄 Exportar PDF Oficial
                </button>
                <button
                  onClick={() => exportToWord({
                    title: `PLANO DE AULA TKT — ${topic.toUpperCase() || 'LÍNGUA INGLESA'}`,
                    className: cefr || 'B1-B2',
                    content: resultHtml,
                    showStudentNameBox: false
                  })}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: '1px solid #c0a080',
                    background: '#fffcf8', color: '#8b5e3c', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  📝 Exportar Word (.docx)
                </button>

                <button
                  onClick={handleSaveLesson}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: '1px solid #859900',
                    background: 'rgba(133,153,0,0.1)', color: '#859900', fontSize: 12.5,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  💾 Salvar Aula
                </button>
              </div>
            )}


            <div style={{ flex: 1, borderRadius: 20, overflow: 'hidden', border: '1px solid #ede8dc', boxShadow: '0 4px 24px rgba(0,43,54,0.04)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
              {!resultHtml && !loading ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#93a1a1', gap: 16, padding: 40, textAlign: 'center' }}>
                  <i className="ti ti-school" style={{ fontSize: 64, opacity: 0.3, color: '#073642' }} />
                  <div>
                    <h3 style={{ fontSize: 18, color: '#073642', margin: 0, fontWeight: 700 }}>
                      Seu Plano & Roteiro de Aula Cambridge TKT
                    </h3>
                    <p style={{ fontSize: 14, color: '#586e75', marginTop: 6, maxWidth: 460 }}>
                      Preencha o tópico, selecione as metodologias em box e clique em "Gerar Aula Completa". A tabela de roteiro timed e o guia de regência aparecerão aqui.
                    </p>
                  </div>
                </div>
              ) : loading ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', border: '5px solid #eee8d5', borderTopColor: '#073642', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 14, color: '#586e75', fontWeight: 600 }}>
                    Formatando tabela de roteiro timed & técnicas TKT...
                  </span>
                </div>
              ) : (
                <DocumentCanvas
                  content={resultHtml}
                  onContentChange={setResultHtml}
                  headerData={{ school: '', teacher: '', title: `Lesson Plan — ${topic}` }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drawer de Aulas Salvas */}
      <SavedItemsDrawer
        isOpen={showSaved}
        onClose={() => setShowSaved(false)}
        title="Aulas Salvas (Cambridge TKT)"
        storageKey="teacher_saved_lessons"
        onSelect={(item: SavedItem) => { setResultHtml(item.content); setMode('studio') }}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
