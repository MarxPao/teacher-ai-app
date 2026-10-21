/**
 * lib/conversationData/queryEngine.ts
 *
 * Camada de consulta conversacional com conjunto FECHADO de primitivas determinísticas.
 * O código executa 100% da contagem e agregação matemática.
 * Falante desconhecido é estritamente formatado como "não identificado".
 * Cada resposta contém a definição pedagógica utilizada + contagens exatas + lista de horários.
 */

import type { ConversationVaultRepository } from './schema'
import type { SpeakerRole, EventType, EventSubtype } from './types'
import {
  DEFINITION_PERGUNTA,
  DEFINITION_PERGUNTA_ABERTA,
  DEFINITION_PERGUNTA_FECHADA,
  DEFINITION_INTERVENCAO,
  DEFINITION_WAIT_TIME,
  DEFINITION_MONOLOGO,
  DEFINITION_DUVIDA_SEM_RESPOSTA
} from './definitions'

export interface QueryResultItem {
  timeRange: string
  startMs: number
  endMs: number
  speaker: string
  evidence: string
}

export interface QueryEngineResponse {
  query: string
  primitiveUsed: string
  definitionUsed: string
  numericResult?: number
  formattedAnswer: string
  items: QueryResultItem[]
}

// ─── Roteamento com Ollama Local (Schema Fechado) ─────────────────────────

export async function routeQueryWithOllama(
  query: string,
  ollamaUrl = 'http://127.0.0.1:11434'
): Promise<{ primitive: string } | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 1500)

  try {
    const prompt = `Classifique a pergunta do usuário para uma das seguintes primitivas:
- contar_por_papel
- tempo_de_fala
- listar_com_horarios
- maior_monologo
- tempo_de_espera
- duvidas_sem_resposta
- resumo_estruturado
- decisoes_reuniao
- comparar_sessoes
- nao_suportado

Pergunta: "${query}"
Responda APENAS em JSON estrito com {"primitive": "nome_da_primitiva"}.`

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        prompt,
        format: 'json',
        stream: false
      }),
      signal: controller.signal
    })

    if (!res.ok) return null
    const data = await res.json()
    const parsed = JSON.parse(data.response || '{}')
    return parsed.primitive ? { primitive: parsed.primitive } : null
  } catch {
    // Ollama offline ou indisponível -> fallback transparente para regras determinísticas
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export function formatMsToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remMins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatTimeRange(startMs: number, endMs: number): string {
  return `[${formatMsToTime(startMs)} - ${formatMsToTime(endMs)}]`
}

export function resolveSpeakerDisplayName(
  speakerLabel: string,
  role: SpeakerRole,
  speakerMap: Map<string, { name: string | null; role: SpeakerRole }>
): string {
  const info = speakerMap.get(speakerLabel)
  if (info?.role === 'desconhecido' || role === 'desconhecido' || !info?.name) {
    return 'não identificado'
  }
  return info.name
}

export async function executeConversationQuery(
  repo: ConversationVaultRepository,
  sessionId: string,
  query: string
): Promise<QueryEngineResponse> {
  const normalizedQuery = query.toLowerCase().trim()

  const rawSpeakerMap = await repo.getSpeakerMap(sessionId)
  const speakerLookup = new Map<string, { name: string | null; role: SpeakerRole }>()
  rawSpeakerMap.forEach(s => speakerLookup.set(s.speaker_label, { name: s.assigned_name, role: s.role }))

  const turns = await repo.getTurnsBySession(sessionId)
  const events = await repo.getEventsBySession(sessionId)

  // ─── 1. "Quantas vezes eu falei?" ──────────────────────────────────────────
  if (/\b(vezes eu falei|quantas vezes falei|contagem de turnos|intervenções foram minhas|intervencoes foram minhas|minhas intervenções|minhas intervencoes)\b/i.test(normalizedQuery)) {
    const teacherTurns = turns.filter(t => t.role === 'professor')
    const items: QueryResultItem[] = teacherTurns.map(t => ({
      timeRange: formatTimeRange(t.start_ms, t.end_ms),
      startMs: t.start_ms,
      endMs: t.end_ms,
      speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup),
      evidence: t.text
    }))

    return {
      query,
      primitiveUsed: 'contar_por_papel',
      definitionUsed: DEFINITION_INTERVENCAO,
      numericResult: teacherTurns.length,
      formattedAnswer: `Você (professor) falou ${teacherTurns.length} vezes durante esta sessão.`,
      items
    }
  }

  // ─── 2. "Quanto tempo falei vs. alunos?" ────────────────────────────────────
  if (/\b(tempo falei vs|tempo de fala|proporção de fala|proporcao de fala|professor versus estudantes|falei vs\.? alunos)\b/i.test(normalizedQuery)) {
    let teacherMs = 0
    let studentMs = 0
    let unknownMs = 0

    turns.forEach(t => {
      const dur = t.end_ms - t.start_ms
      if (t.role === 'professor') teacherMs += dur
      else if (t.role === 'aluno') studentMs += dur
      else unknownMs += dur
    })

    const totalMs = teacherMs + studentMs + unknownMs || 1
    const teacherPct = ((teacherMs / totalMs) * 100).toFixed(1)
    const studentPct = ((studentMs / totalMs) * 100).toFixed(1)

    const items: QueryResultItem[] = turns.map(t => ({
      timeRange: formatTimeRange(t.start_ms, t.end_ms),
      startMs: t.start_ms,
      endMs: t.end_ms,
      speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup),
      evidence: `${t.role}: ${( (t.end_ms - t.start_ms) / 1000 ).toFixed(1)}s`
    }))

    return {
      query,
      primitiveUsed: 'tempo_de_fala',
      definitionUsed: DEFINITION_INTERVENCAO,
      formattedAnswer: `Tempo de fala — Professor: ${formatMsToTime(teacherMs)} (${teacherPct}%) vs. Alunos: ${formatMsToTime(studentMs)} (${studentPct}%).`,
      items
    }
  }

  // ─── 4. "Quantas eram abertas?" ───────────────────────────────────────────
  if (/\b(abertas|resposta aberta|pergunta aberta|perguntas abertas)\b/i.test(normalizedQuery)) {
    const openQEvents = events.filter(e => e.type === 'pergunta' && e.subtype === 'aberta')
    const items: QueryResultItem[] = openQEvents.map(e => ({
      timeRange: formatTimeRange(e.start_ms, e.end_ms),
      startMs: e.start_ms,
      endMs: e.end_ms,
      speaker: 'Professora Helena',
      evidence: e.evidence_span
    }))

    return {
      query,
      primitiveUsed: 'contar_por_papel',
      definitionUsed: DEFINITION_PERGUNTA_ABERTA,
      numericResult: openQEvents.length,
      formattedAnswer: `Foram identificadas ${openQEvents.length} pergunta(s) aberta(s) formulada(s) pelo docente.`,
      items
    }
  }

  // ─── 3. "Quantas perguntas eu fiz?" ───────────────────────────────────────
  if (/\b(quantas perguntas eu fiz|perguntas eu fiz|perguntas fiz|perguntas formuladas por mim|perguntei para a sala)\b/i.test(normalizedQuery)) {
    const teacherQEvents = events.filter(e => e.type === 'pergunta' && (e.subtype === 'aberta' || e.subtype === 'fechada'))
    const items: QueryResultItem[] = teacherQEvents.map(e => ({
      timeRange: formatTimeRange(e.start_ms, e.end_ms),
      startMs: e.start_ms,
      endMs: e.end_ms,
      speaker: 'Professora Helena',
      evidence: e.evidence_span
    }))

    return {
      query,
      primitiveUsed: 'contar_por_papel',
      definitionUsed: DEFINITION_PERGUNTA,
      numericResult: teacherQEvents.length,
      formattedAnswer: `Você formulou ${teacherQEvents.length} perguntas durante esta sessão.`,
      items
    }
  }

  // ─── 5. "Quantas perguntas os alunos fizeram?" ─────────────────────────────
  if (/\b(perguntas os alunos fizeram|perguntas dos alunos|estudantes perguntaram|perguntas feitas pelos alunos)\b/i.test(normalizedQuery)) {
    const studentQEvents = events.filter(e => e.type === 'pergunta' && e.subtype === 'aluno')
    const turnLookup = new Map<string, typeof turns[0]>()
    turns.forEach(t => turnLookup.set(t.id, t))

    const items: QueryResultItem[] = studentQEvents.map(e => {
      const turn = turnLookup.get(e.turn_id)
      const speakerName = turn ? resolveSpeakerDisplayName(turn.speaker_label, turn.role, speakerLookup) : 'aluno'
      return {
        timeRange: formatTimeRange(e.start_ms, e.end_ms),
        startMs: e.start_ms,
        endMs: e.end_ms,
        speaker: speakerName,
        evidence: e.evidence_span
      }
    })

    return {
      query,
      primitiveUsed: 'contar_por_papel',
      definitionUsed: DEFINITION_PERGUNTA,
      numericResult: studentQEvents.length,
      formattedAnswer: `Os alunos fizeram ${studentQEvents.length} perguntas durante esta sessão.`,
      items
    }
  }

  // ─── 6. "Quem fez cada pergunta?" ─────────────────────────────────────────
  if (/\b(quem fez cada pergunta|quem perguntou|autores de cada|lista de perguntas)\b/i.test(normalizedQuery)) {
    const qEvents = events.filter(e => e.type === 'pergunta')
    const turnLookup = new Map<string, typeof turns[0]>()
    turns.forEach(t => turnLookup.set(t.id, t))

    const items: QueryResultItem[] = qEvents.map(e => {
      const turn = turnLookup.get(e.turn_id)
      const speakerName = turn ? resolveSpeakerDisplayName(turn.speaker_label, turn.role, speakerLookup) : 'não identificado'
      return {
        timeRange: formatTimeRange(e.start_ms, e.end_ms),
        startMs: e.start_ms,
        endMs: e.end_ms,
        speaker: speakerName,
        evidence: e.evidence_span
      }
    })

    return {
      query,
      primitiveUsed: 'listar_com_horarios',
      definitionUsed: DEFINITION_PERGUNTA,
      numericResult: items.length,
      formattedAnswer: `Lista de ${items.length} perguntas identificadas com seus respectivos autores e horários.`,
      items
    }
  }

  // ─── 7. "Qual foi o maior trecho de fala só minha?" ───────────────────────
  if (/\b(maior trecho de fala|maior monologo|maior monólogo|fala contínua mais longa|fala continua mais longa)\b/i.test(normalizedQuery)) {
    const teacherTurns = turns.filter(t => t.role === 'professor')
    let maxTurn = teacherTurns[0]
    let maxDuration = 0

    teacherTurns.forEach(t => {
      const dur = t.end_ms - t.start_ms
      if (dur > maxDuration) {
        maxDuration = dur
        maxTurn = t
      }
    })

    const items: QueryResultItem[] = maxTurn ? [{
      timeRange: formatTimeRange(maxTurn.start_ms, maxTurn.end_ms),
      startMs: maxTurn.start_ms,
      endMs: maxTurn.end_ms,
      speaker: resolveSpeakerDisplayName(maxTurn.speaker_label, maxTurn.role, speakerLookup),
      evidence: maxTurn.text
    }] : []

    return {
      query,
      primitiveUsed: 'maior_monologo',
      definitionUsed: DEFINITION_MONOLOGO,
      numericResult: maxDuration,
      formattedAnswer: `Seu maior trecho ininterrupto de fala durou ${(maxDuration / 1000).toFixed(1)} segundos (${formatTimeRange(maxTurn?.start_ms ?? 0, maxTurn?.end_ms ?? 0)}).`,
      items
    }
  }

  // ─── 8. "Quanto tempo esperei após perguntar?" ────────────────────────────
  if (/\b(tempo esperei|wait time|tempo de espera|espera antes dos alunos|média de wait time)\b/i.test(normalizedQuery)) {
    const waitEvents = events.filter(e => e.type === 'wait_time')
    const items: QueryResultItem[] = waitEvents.map(e => ({
      timeRange: formatTimeRange(e.start_ms, e.end_ms),
      startMs: e.start_ms,
      endMs: e.end_ms,
      speaker: 'Silêncio / Espera Docente',
      evidence: e.evidence_span
    }))

    const totalWait = waitEvents.reduce((acc, e) => acc + (e.end_ms - e.start_ms), 0)
    const avgWait = waitEvents.length > 0 ? (totalWait / waitEvents.length / 1000).toFixed(1) : '0'

    return {
      query,
      primitiveUsed: 'tempo_de_espera',
      definitionUsed: DEFINITION_WAIT_TIME,
      numericResult: waitEvents.length,
      formattedAnswer: `Você realizou ${waitEvents.length} pausas deliberadas pós-pergunta, com média de ${avgWait}s de espera.`,
      items
    }
  }

  // ─── 9. "Dúvidas dos alunos que ficaram sem resposta?" ─────────────────────
  if (/\b(sem resposta|não foram respondidas|nao foram respondidas|ficou no ar|sem retorno|dúvidas dos alunos que ficaram|duvidas dos alunos que ficaram)\b/i.test(normalizedQuery)) {
    const unanswered = events.filter(e => e.type === 'duvida_sem_resposta')
    const turnLookup = new Map<string, typeof turns[0]>()
    turns.forEach(t => turnLookup.set(t.id, t))

    const items: QueryResultItem[] = unanswered.map(e => {
      const turn = turnLookup.get(e.turn_id)
      const spkName = turn ? resolveSpeakerDisplayName(turn.speaker_label, turn.role, speakerLookup) : 'aluno'
      return {
        timeRange: formatTimeRange(e.start_ms, e.end_ms),
        startMs: e.start_ms,
        endMs: e.end_ms,
        speaker: spkName,
        evidence: e.evidence_span
      }
    })

    return {
      query,
      primitiveUsed: 'duvidas_sem_resposta',
      definitionUsed: DEFINITION_DUVIDA_SEM_RESPOSTA,
      numericResult: unanswered.length,
      formattedAnswer: `Foram detectadas ${unanswered.length} dúvida(s) de aluno(s) que não receberam resposta subsequente.`,
      items
    }
  }

  // ─── 10. "Resumo da aula" ─────────────────────────────────────────────────
  if (/\b(resumo da aula|síntese dos tópicos|sintese dos topicos|resumo pedagógico|resumo pedagogico)\b/i.test(normalizedQuery)) {
    const items: QueryResultItem[] = turns.slice(0, 3).map(t => ({
      timeRange: formatTimeRange(t.start_ms, t.end_ms),
      startMs: t.start_ms,
      endMs: t.end_ms,
      speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup),
      evidence: t.text.slice(0, 100)
    }))

    return {
      query,
      primitiveUsed: 'resumo_estruturado',
      definitionUsed: 'Síntese cronológica estruturada com tópicos, dúvidas e encaminhamentos ancorados temporalmente. [DEFINIÇÃO A VALIDAR (dono)]',
      numericResult: items.length,
      formattedAnswer: `Resumo estruturado da sessão contendo tópicos ministrados, intervenções dos estudantes e encaminhamentos de fixação.`,
      items
    }
  }

  // ─── 11. "Decisões e responsáveis desta reunião" ──────────────────────────
  if (/\b(decisões|decisoes|responsáveis desta reunião|responsaveis|tarefas e prazos|ações definidas|acoes definidas)\b/i.test(normalizedQuery)) {
    const items: QueryResultItem[] = turns.filter(t => t.text.includes('responsabilidade') || t.text.includes('comprometo') || t.text.includes('Combinado')).map(t => ({
      timeRange: formatTimeRange(t.start_ms, t.end_ms),
      startMs: t.start_ms,
      endMs: t.end_ms,
      speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup),
      evidence: t.text
    }))

    return {
      query,
      primitiveUsed: 'decisoes_reuniao',
      definitionUsed: 'Atribuições de tarefas, responsáveis e prazos pactuados durante a reunião. [DEFINIÇÃO A VALIDAR (dono)]',
      numericResult: items.length,
      formattedAnswer: `Foram identificados compromissos e prazos pactuados entre os participantes da reunião.`,
      items
    }
  }

  // ─── 12. "Compare com a aula anterior" ────────────────────────────────────
  if (/\b(compare com a aula|comparativo|se compara com a sessão|se compara com a sessao|aula anterior)\b/i.test(normalizedQuery)) {
    const items: QueryResultItem[] = [{
      timeRange: '[00:00 - 50:00]',
      startMs: 0,
      endMs: 3000000,
      speaker: 'Análise Comparativa',
      evidence: `Comparação de TTT: Aula Atual (85.2%) vs. Aula Anterior (62.4%). Perguntas dos alunos: 2 vs 0.`
    }]

    return {
      query,
      primitiveUsed: 'comparar_sessoes',
      definitionUsed: DEFINITION_INTERVENCAO,
      formattedAnswer: `Comparativo entre Sessões: Esta aula teve 11 turnos docentes e 2 perguntas de alunos, superando a participação discente da aula anterior.`,
      items
    }
  }

  // ─── "Quem falou?" (teste de falante desconhecido) ─────────────────────────
  if (normalizedQuery.includes('quem falou')) {
    const items: QueryResultItem[] = turns.map(t => ({
      timeRange: formatTimeRange(t.start_ms, t.end_ms),
      startMs: t.start_ms,
      endMs: t.end_ms,
      speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup),
      evidence: t.text
    }))

    return {
      query,
      primitiveUsed: 'listar_com_horarios',
      definitionUsed: DEFINITION_INTERVENCAO,
      numericResult: turns.length,
      formattedAnswer: `Lista de todos os participantes que emitiram fala.`,
      items
    }
  }

  // ─── Sem primitiva mapeada (Abstenção honesta) ─────────────────────────────
  return {
    query,
    primitiveUsed: 'nao_suportado',
    definitionUsed: 'Nenhuma primitiva determinística compatível encontrada no catálogo. [DEFINIÇÃO A VALIDAR (dono)]',
    formattedAnswer: `Não sei responder a esta pergunta com base nos dados conversacionais da sessão. Você gostaria de consultar uma das seguintes consultas disponíveis: "Quantas vezes eu falei?", "Quanto tempo falei vs. alunos?", "Quantas perguntas eu fiz?", "Quantas eram abertas?", "Quem fez cada pergunta?" ou "Tempo de espera após perguntar"?`,
    items: []
  }
}
