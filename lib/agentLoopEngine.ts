/**
 * agentLoopEngine.ts — Motor de Execução Agêntica em Circuito Fechado (Observe-Decide-Act)
 * 
 * Implementa o runtime generalista da Rafinha com:
 * 1. Loop iterativo de observação e decisão (ReAct especializado para Educação)
 * 2. Avaliação de política de confirmação Human-in-the-Loop (HITL) para escritas
 * 3. Diagnóstico honesto de falhas estruturado (elimina "Erro desconhecido")
 * 4. Compressão ativa de observações no scratchpad (economia de tokens)
 * 5. Escalonamento dinâmico de modelos (Gemini 3.6 Flash vs Gemini 3.5 Flash Lite)
 * 6. Snapshots de desfazer (Undo) de 60 segundos para mutações locais
 */

export interface DiagnosticAgentFailure {
  failureCode: 'ELEMENT_NOT_LOCATED' | 'SESSION_TIMEOUT' | 'INSUFFICIENT_DATA' | 'AMBIGUOUS_ROUTING' | 'API_RATE_LIMIT' | 'VALIDATION_ERROR' | 'UNKNOWN_FAILURE'
  toolInvoked: string
  parametersSupplied: Record<string, unknown>
  targetSelectorOrAction?: string
  rootCauseAnalysis: string
  remedialOptions: string[]
  technicalDetail?: string
}

export interface AgentStepObservation {
  stepIndex: number
  toolName: string
  toolInput: Record<string, unknown>
  success: boolean
  data?: unknown
  error?: DiagnosticAgentFailure
  executionTimeMs: number
}

export interface StagedMutation {
  id: string
  module: string
  action: string
  payload: unknown
  reason: string
  previewSummary: string
  status: 'pending' | 'approved' | 'rejected'
  timestamp: number
}

export interface AgentScratchpad {
  originalGoal: string
  stepsTaken: AgentStepObservation[]
  pendingStagedMutations: StagedMutation[]
  iterationCount: number
}

export interface UndoSnapshot {
  id: string
  timestamp: number
  storageKey: string
  previousState: string
  description: string
}

// ─── 1. POLÍTICA DE CONFIRMAÇÃO HUMAN-IN-THE-LOOP (HITL) ──────────────────────

export interface ConfirmationPolicyResult {
  requiresPriorApproval: boolean
  reason: string
  previewSummary: string
  category: 'read_nav' | 'direct_write' | 'staged_write' | 'bulk_write' | 'portal_mutation'
}

const READ_NAV_TOOLS = new Set([
  'navigate_to_module',
  'open_school_portal',
  'query_library',
  'search_web',
  'read_page_content',
  'read_active_portal_roster',
  'inspect_portal_page',
  'read_page_data',
  'show_portal_screenshot',
  'speak_response',
  'diagnose_class_performance'
])

const DIRECT_USER_WRITES = new Set([
  'add_todo',
  'create_calendar_task',
  'create_mindmap',
  'add_qbank_question'
])

export function evaluateConfirmationPolicy(
  toolName: string,
  input: Record<string, unknown>,
  sessionContext: {
    previouslyRoutedModules?: Set<string>
    confidence?: number
    isExplicitUserCommand?: boolean
  } = {}
): ConfirmationPolicyResult {
  // A. Leitura e Navegação: Ação direta imediata (sem atrito)
  if (READ_NAV_TOOLS.has(toolName)) {
    return {
      requiresPriorApproval: false,
      reason: 'Ação de leitura ou navegação estritamente reversível sem efeitos colaterais.',
      previewSummary: `Navegando/consultando ${toolName}`,
      category: 'read_nav'
    }
  }

  // Fast-path de navegação dentro do portal via execute_portal_action
  if (toolName === 'execute_portal_action' && (input.actionType === 'custom' || input.navTarget) && !input.title && !input.absentStudents) {
    return {
      requiresPriorApproval: false,
      reason: 'Navegação interna de tela no portal escolar.',
      previewSummary: `Acessando aba ${input.navTarget || 'solicitada'} no portal`,
      category: 'read_nav'
    }
  }

  // B. Operações de Portal Oficiais: Supervised Mode (revisão prévia essencial)
  if (toolName === 'confirm_portal_submission' || (toolName === 'execute_portal_action' && (input.absentStudents || input.studentGrades))) {
    const detail = input.absentStudents
      ? `${(input.absentStudents as string[]).length} faltas no portal`
      : 'gravação de dados no portal oficial'
    return {
      requiresPriorApproval: true,
      reason: 'Mutações no portal escolar oficial requerem confirmação prévia com revisão dos campos.',
      previewSummary: `Lançamento supervisionado: ${detail}`,
      category: 'portal_mutation'
    }
  }

  // C. Escrita em Lote / Multi-Student: Staged Review Obrigatório
  const isMultiStudent = Array.isArray(input.data) && input.data.length > 1
  const isBulkRoster = toolName === 'sync_portal_data_to_app' && (input.dataType === 'students' || input.dataType === 'grades')
  if (isMultiStudent || isBulkRoster) {
    const count = Array.isArray(input.data) ? input.data.length : 'múltiplos'
    return {
      requiresPriorApproval: true,
      reason: `Alteração em lote afetando ${count} registros de alunos. Requer validação prévia.`,
      previewSummary: `Importação em lote de ${count} registros para o app`,
      category: 'bulk_write'
    }
  }

  // D. Primeiro roteamento para módulo na sessão ou inferência com baixa confiança
  const targetModule = (input.destination as string) || (input.dataType as string) || toolName
  const previouslyRouted = sessionContext.previouslyRoutedModules || new Set()
  const isFirstRoute = !previouslyRouted.has(targetModule)
  const isLowConfidence = (sessionContext.confidence ?? 1.0) < 0.85

  if (toolName === 'sync_portal_data_to_app' && (isFirstRoute || isLowConfidence)) {
    return {
      requiresPriorApproval: true,
      reason: isFirstRoute
        ? `Primeira sincronização de dados para o módulo '${targetModule}' na sessão atual.`
        : 'Confiança da inferência de destino abaixo do limiar padrão.',
      previewSummary: `Sincronizar dados do portal para ${targetModule}`,
      category: 'staged_write'
    }
  }

  // E. Escrita direta solicitada expressamente pelo usuário (1 item)
  if (DIRECT_USER_WRITES.has(toolName) && sessionContext.isExplicitUserCommand !== false) {
    return {
      requiresPriorApproval: false,
      reason: 'Comando direto e explícito do professor para cadastro pontual (com snapshot de desfazer).',
      previewSummary: `Criando ${input.title || input.text || 'item'}`,
      category: 'direct_write'
    }
  }

  // Padrão de segurança: mutações inferidas requerem aprovação
  return {
    requiresPriorApproval: true,
    reason: 'Gravação inferida de dados requer validação prévia do professor.',
    previewSummary: `Salvar dados em ${targetModule}`,
    category: 'staged_write'
  }
}

// ─── 2. DIAGNÓSTICO HONESTO DE FALHAS ─────────────────────────────────────────

export function buildHonestDiagnostic(
  toolName: string,
  input: Record<string, unknown>,
  rawError: unknown
): DiagnosticAgentFailure {
  const errMsg = rawError instanceof Error ? rawError.message : String(rawError || '')
  const errLower = errMsg.toLowerCase()

  // 1. Elemento do portal não encontrado
  if (errLower.includes('not found') || errLower.includes('não encontrado') || errLower.includes('selector') || errLower.includes('no_matching_field')) {
    const target = input.navTarget || input.classRef || input.title || 'elemento'
    return {
      failureCode: 'ELEMENT_NOT_LOCATED',
      toolInvoked: toolName,
      parametersSupplied: input,
      targetSelectorOrAction: String(target),
      rootCauseAnalysis: `O portal não exibiu o campo ou botão correspondente a '${target}'. Isso ocorre comumente se a tela estiver aguardando outro filtro (ex: data ou turma) ou se a estrutura da página mudou.`,
      remedialOptions: [
        'Acessar a página manualmente no navegador e tentar novamente',
        'Verificar se os filtros de data e turma estão selecionados na tela',
        'Pedir para a Rafinha recarregar a página do portal'
      ],
      technicalDetail: errMsg
    }
  }

  // 2. Timeout ou desconexão do portal / extensão
  if (errLower.includes('timeout') || errLower.includes('disconnected') || errLower.includes('desconectado') || errLower.includes('tempo esgotado')) {
    return {
      failureCode: 'SESSION_TIMEOUT',
      toolInvoked: toolName,
      parametersSupplied: input,
      rootCauseAnalysis: 'A conexão com a aba do portal expirou ou a extensão Chrome não respondeu no tempo limite de 9 segundos.',
      remedialOptions: [
        'Verificar se a aba do portal escolar permanece aberta no Chrome',
        'Atualizar a página do portal (F5) para revalidar a sessão',
        'Reenviar o comando para a Rafinha tentar uma nova conexão'
      ],
      technicalDetail: errMsg
    }
  }

  // 3. Dados insuficientes para completar a ação
  if (errLower.includes('insufficient') || errLower.includes('faltando') || errLower.includes('required') || errLower.includes('vazio')) {
    return {
      failureCode: 'INSUFFICIENT_DATA',
      toolInvoked: toolName,
      parametersSupplied: input,
      rootCauseAnalysis: 'A ferramenta precisa de informações adicionais que não foram encontradas na conversa nem na tela.',
      remedialOptions: [
        'Informar a turma ou data da aula explicitamente no chat',
        'Abrir a tela correspondente no portal para que a Rafinha leia os dados'
      ],
      technicalDetail: errMsg
    }
  }

  // 4. Rate limit ou cota da API
  if (errLower.includes('429') || errLower.includes('quota') || errLower.includes('rate limit')) {
    return {
      failureCode: 'API_RATE_LIMIT',
      toolInvoked: toolName,
      parametersSupplied: input,
      rootCauseAnalysis: 'O limite temporário de requisições por minuto da IA foi atingido.',
      remedialOptions: [
        'Aguardar aproximadamente 20 segundos para renovação da janela de cota',
        'Configurar uma chave alternativa de contingência em APIs & Modelos'
      ],
      technicalDetail: errMsg
    }
  }

  // 5. Falha genérica encapsulada com transparência
  return {
    failureCode: 'UNKNOWN_FAILURE',
    toolInvoked: toolName,
    parametersSupplied: input,
    rootCauseAnalysis: `A execução da ferramenta '${toolName}' encontrou uma resposta não padronizada: ${errMsg.slice(0, 150)}`,
    remedialOptions: [
      'Tentar o comando novamente com termos mais específicos',
      'Executar o passo manualmente no portal e solicitar à Rafinha apenas a próxima etapa'
    ],
    technicalDetail: errMsg
  }
}

// ─── 3. COMPRESSÃO ATIVA DE OBSERVAÇÕES (ECONOMIA DE TOKENS) ─────────────────

export function summarizeObservationData(data: unknown): unknown {
  if (!data) return { status: 'empty' }

  // Array de alunos ou dados em lote: não reenviar 12 KB de JSON bruto no loop
  if (Array.isArray(data)) {
    const total = data.length
    if (total <= 3) return data

    const sample = data.slice(0, 3).map((item: any) => {
      if (typeof item === 'object' && item !== null) {
        return {
          name: item.name || item.nome || item.title || item.id,
          classRef: item.classRef || item.turma || undefined,
          status: item.status || undefined
        }
      }
      return String(item).slice(0, 50)
    })

    return {
      total_count: total,
      sample_records: sample,
      has_more: true,
      note: `Total de ${total} registros capturados. Amostra compactada para preservação de tokens.`
    }
  }

  // Objeto de roster ou resposta de portal
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.students)) {
      return {
        portal_students_count: obj.students.length,
        sample_names: obj.students.slice(0, 4).map((s: any) => s.name || s.nome),
        classRef: obj.classRef || undefined,
        note: 'Roster completo retido na memória local'
      }
    }

    // Se for string longa dentro de campo
    const sanitized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.length > 250) {
        sanitized[k] = `${v.slice(0, 240)}... [truncado: ${v.length} chars]`
      } else {
        sanitized[k] = v
      }
    }
    return sanitized
  }

  if (typeof data === 'string' && data.length > 300) {
    return `${data.slice(0, 290)}... [${data.length} chars]`
  }

  return data
}

// ─── 4. ESCALONAMENTO DE MODELOS POR TIER DE COMPLEXIDADE ─────────────────────

export function determineModelTierForStep(
  scratchpad: AgentScratchpad,
  currentTaskIsComplex: boolean = false
): 'gemini-3.6-flash' | 'gemini-3.5-flash-lite' {
  // Passo inicial (planejamento da meta ou decomposição de comandos compostos): Tier 2
  if (scratchpad.iterationCount <= 1 || currentTaskIsComplex) {
    return 'gemini-3.6-flash'
  }

  // Se o passo anterior falhou, o modelo superior deve analisar e replanejar: Tier 2
  const lastStep = scratchpad.stepsTaken[scratchpad.stepsTaken.length - 1]
  if (lastStep && !lastStep.success) {
    return 'gemini-3.6-flash'
  }

  // Passos intermediários de continuação (checagem de ação direta ou síntese final): Tier 1
  return 'gemini-3.5-flash-lite'
}

// ─── 5. SISTEMA DE DESFAZER (UNDO) DE 60 SEGUNDOS ────────────────────────────

export function createUndoSnapshot(
  storageKey: string,
  description: string
): string {
  if (typeof window === 'undefined') return ''

  try {
    const currentState = localStorage.getItem(storageKey) || '[]'
    const snapshotId = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const snapshot: UndoSnapshot = {
      id: snapshotId,
      timestamp: Date.now(),
      storageKey,
      previousState: currentState,
      description
    }

    sessionStorage.setItem('teacher_undo_snapshot', JSON.stringify(snapshot))
    return snapshotId
  } catch {
    return ''
  }
}

export function applyUndoSnapshot(snapshotId?: string): { success: boolean; message: string } {
  if (typeof window === 'undefined') return { success: false, message: 'Ambiente sem window' }

  try {
    const raw = sessionStorage.getItem('teacher_undo_snapshot')
    if (!raw) return { success: false, message: 'Nenhum snapshot de reversão ativo ou expirado.' }

    const snapshot: UndoSnapshot = JSON.parse(raw)
    if (snapshotId && snapshot.id !== snapshotId) {
      return { success: false, message: 'O snapshot solicitado expirou ou foi substituído por uma ação mais recente.' }
    }

    // Valida expiração de 60 segundos
    if (Date.now() - snapshot.timestamp > 60000) {
      sessionStorage.removeItem('teacher_undo_snapshot')
      return { success: false, message: 'A janela de reversão de 60 segundos expirou.' }
    }

    localStorage.setItem(snapshot.storageKey, snapshot.previousState)
    sessionStorage.removeItem('teacher_undo_snapshot')
    window.dispatchEvent(new Event('storage'))

    return {
      success: true,
      message: `Ação revertida com sucesso: ${snapshot.description}. Estado anterior restaurado!`
    }
  } catch (err: any) {
    return { success: false, message: `Falha ao reverter: ${err.message}` }
  }
}
