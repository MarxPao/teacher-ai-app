// lib/agentSessionContext.ts
// Contexto de sessão do agente: "onde a professora está e o que está fazendo".
// Cada tela publica um resumo NÃO-PII do seu estado; o chat lê no momento do envio
// e injeta no prompt como <tela_atual>. Estado vive em memória (nunca persistido).

export type ScreenStateValue = string | number | boolean | null | undefined
export type ScreenState = Record<string, ScreenStateValue>

export interface ScreenPublication {
  /** Campos preenchidos/estado atual da tela (apenas dados pedagógicos, sem PII). */
  state?: ScreenState
  /** Informações que o agente precisa pedir à professora antes de agir. */
  missing?: string[]
  /** Ações que o agente pode executar nesta tela (nomes de ferramentas). */
  actions?: string[]
}

interface ModuleInfo {
  label: string
  purpose: string
  /** Telas que compartilham o mesmo estado publicado usam a mesma stateKey. */
  stateKey?: string
}

const ASSESSMENT = 'assessment'

export const MODULE_INFO: Record<string, ModuleInfo> = {
  dashboard: { label: 'Painel inicial', purpose: 'Visão geral do dia: tarefas, eventos e atalhos.' },
  exam: { label: 'Criar Prova', purpose: 'Montar uma prova (tema, série, tipos e quantidade de questões, nível).', stateKey: ASSESSMENT },
  quick: { label: 'Atividade rápida', purpose: 'Gerar uma lista de exercícios/atividade curta.', stateKey: ASSESSMENT },
  test_and_worksheets: { label: 'Provas e Atividades', purpose: 'Gerar provas e atividades.', stateKey: ASSESSMENT },
  lessonstudio: { label: 'Estúdio de Aula', purpose: 'Planejar e montar aulas completas.' },
  plan: { label: 'Plano de Aula', purpose: 'Planejar aulas.' },
  rubric: { label: 'Rubricas', purpose: 'Criar critérios de avaliação.' },
  gradebook: { label: 'Boletim de Notas', purpose: 'Consultar e lançar notas dos alunos.' },
  students: { label: 'Alunos', purpose: 'Cadastro e acompanhamento dos alunos.' },
  classes: { label: 'Turmas', purpose: 'Cadastro e organização das turmas.' },
  calendar: { label: 'Calendário', purpose: 'Eventos e tarefas por data.' },
  comms: { label: 'Comunicados', purpose: 'Escrever comunicados para famílias e turmas.' },
  skills: { label: 'Habilidades do Portal', purpose: 'Rotinas automáticas no portal escolar.' },
  omnigrader: { label: 'Correção', purpose: 'Corrigir provas e atividades.' },
  didacticsequence: { label: 'Sequência Didática', purpose: 'Montar sequências didáticas.' },
  qbank: { label: 'Banco de Questões', purpose: 'Consultar e reaproveitar questões.' },
}

const MAX_VALUE_LEN = 200
const MAX_LIST = 12

let activeModule: string | null = null
const published = new Map<string, ScreenPublication>()

export function setActiveModule(module: string): void {
  activeModule = module
}

export function getActiveModule(): string | null {
  return activeModule
}

function keyFor(module: string): string {
  return MODULE_INFO[module]?.stateKey ?? module
}

/** Publica (substitui) o estado de uma tela. `stateKey` = módulo ou grupo (ex.: 'assessment'). */
export function publishScreenState(stateKey: string, data: ScreenPublication): void {
  published.set(stateKey, data)
}

export function clearScreenState(stateKey: string): void {
  published.delete(stateKey)
}

export function resetScreenContext(): void {
  activeModule = null
  published.clear()
}

function clip(v: ScreenStateValue): string {
  return String(v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_VALUE_LEN)
}

/**
 * Bloco de texto para o prompt do agente. Retorna '' se não há módulo ativo.
 * O texto deve passar por maskPii antes de sair do navegador (feito no chat).
 */
export function buildScreenContextPrompt(): string {
  if (!activeModule) return ''
  const info = MODULE_INFO[activeModule]
  const pub = published.get(keyFor(activeModule))
  const lines = [
    `Tela aberta agora: ${info?.label ?? activeModule}`,
    `Finalidade da tela: ${info?.purpose ?? 'não descrita'}`,
  ]
  if (pub?.state) {
    const filled = Object.entries(pub.state)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .slice(0, 40)
      .map(([k, v]) => `${k}=${clip(v)}`)
    if (filled.length) lines.push(`Estado da tela: ${filled.join('; ')}`)
  }
  if (pub?.missing?.length) {
    lines.push(`Ainda falta a professora informar: ${pub.missing.slice(0, MAX_LIST).map(clip).join(', ')}`)
  }
  if (pub?.actions?.length) {
    lines.push(`Ações disponíveis nesta tela: ${pub.actions.slice(0, MAX_LIST).map(clip).join(', ')}`)
  }
  return `\n<tela_atual>\n${lines.join('\n')}\n</tela_atual>`
}
