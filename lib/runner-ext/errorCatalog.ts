// lib/runner-ext/errorCatalog.ts
// Catálogo unificado de códigos E_* (compiler, runner, runner-ext, repair e quarentena/exploração)
// com ponto único reportError(code, context) e guarda única de ativação assertCanActivateGraph.

import { COMPILER_ERROR_CODES } from '../compiler/report'
import { RUNTIME_ERROR_CODES } from '../runner/types'
import { REPAIR_ERROR_CODES } from '../repair/types'

export const EXTRA_EXTENSION_ERROR_CODES = [
  'E_NM_FAILED',
  'E_EXPLORATION_CANNOT_ACTIVATE',
  'E_GRAPH_QUARANTINED',
  'E_DRIFT_WRITE_PROTECTED',
] as const

export const ALL_ENGINE_ERROR_CODES = [
  ...COMPILER_ERROR_CODES,
  ...RUNTIME_ERROR_CODES,
  ...Object.values(REPAIR_ERROR_CODES),
  ...EXTRA_EXTENSION_ERROR_CODES,
] as const

export type EngineErrorCode = (typeof ALL_ENGINE_ERROR_CODES)[number]

export const TEACHER_ERROR_MESSAGES: Record<EngineErrorCode, string> = {
  // Compiler (lib/compiler)
  E_TRACE_INVALID:
    'A demonstração gravada ficou incompleta. Tente gravar novamente clicando nos campos do portal com calma. ✨',
  E_TRACE_TOO_LARGE:
    'A demonstração ficou longa demais. Grave uma tarefa mais curta por vez (como abrir a turma ou lançar uma nota).',
  E_DECISION_REQUIRED:
    'Preciso que você confirme uma detalhe pedagógico rápido no painel lateral antes de concluir esta habilidade.',
  E_NO_TABLE_MARKED:
    'Não identifiquei a tabela de alunos durante a demonstração. Clique sobre uma linha da lista de alunos ao gravar.',
  E_NO_WRITE_STEP:
    'Não identifiquei nenhum preenchimento de nota, presença ou texto durante a gravação. Realize o preenchimento ao ensinar.',
  E_ANCHOR_UNSTABLE:
    'Um botão ou campo desta página não possui identificação estável. Tente clicar diretamente no rótulo visível do campo.',
  E_UNSUPPORTED_PATTERN:
    'Este formato de filtro da página ainda requer seleção manual antes de rodar a habilidade.',
  E_COMPILED_GRAPH_INVALID:
    'O mapa gerado para esta rotina apresentou uma inconsistência e foi bloqueado por segurança. Tente gravar novamente.',
  E_PII_SCRUB_FAILED:
    'Detectei dados pessoais sensíveis no identificador da rotina. Use um nome genérico (ex.: "Lançar Frequência") para proteger seus alunos.',

  // Runner (lib/runner)
  E_GRAPH_INVALID:
    'Esta habilidade está com a estrutura desatualizada ou inválida. Regrave ou selecione outra versão.',
  E_ANCHOR_NOT_FOUND:
    'Não encontrei o botão ou campo esperado nesta página. Verifique se a turma ou aba correta do portal está aberta. ✨',
  E_ANCHOR_AMBIGUOUS:
    'Encontrei mais de um botão ou campo parecido na tela e parei por segurança para não clicar no lugar errado.',
  E_ROW_NOT_FOUND:
    'Não encontrei este(a) aluno(a) na lista aberta do portal. Confira se estamos na turma certa.',
  E_ROW_AMBIGUOUS:
    'Há mais de um(a) aluno(a) com nome semelhante nesta turma. Confirme a matrícula para evitar lançamento trocado.',
  E_POSTCONDITION_FAILED:
    'O portal não confirmou a conclusão da etapa esperada. Verifique se a página carregou completamente.',
  E_FINGERPRINT_MISMATCH:
    'A página aberta no navegador parece diferente da tela esperada para esta habilidade. Abra a página inicial do portal escolar.',
  E_HOST_NOT_ALLOWED:
    'Por segurança, o assistente só atua dentro do endereço oficial do seu portal escolar.',
  E_VALUE_OUT_OF_SCALE:
    'O valor informado está fora da escala permitida pelo diário (por exemplo, nota acima do máximo). Confira o valor.',
  E_READBACK_MISMATCH:
    'O portal não manteve o valor preenchido no campo e a alteração foi revertida por segurança. Confira o campo na tela.',
  E_CHECKPOINT_REJECTED:
    'Ação cancelada conforme sua escolha na janela de revisão.',
  E_MAX_WRITES:
    'O limite de segurança de preenchimentos por execução foi atingido. Revise os lançamentos realizados antes de continuar.',
  E_MAX_ITERATIONS:
    'A navegação passou pelo número máximo de etapas seguidas e parou por segurança.',
  E_TIMEOUT:
    'O portal escolar demorou para responder. Verifique sua conexão ou se a página terminou de carregar.',
  E_NODE_UNSUPPORTED:
    'Esta etapa específica ainda não é suportada automaticamente neste portal.',
  E_HANDOFF_TIMEOUT:
    'O tempo de espera pelo login ou verificação de segurança no portal expirou. Clique em Executar quando tiver concluído o acesso.',
  E_DOWNLOAD_FAILED:
    'O portal não iniciou o download do arquivo esperado. Verifique se o documento está disponível na página.',
  E_UPLOAD_FAILED:
    'Não foi possível anexar o arquivo no campo do portal. Verifique o formato do documento e tente novamente.',
  E_UPLOAD_TOO_LARGE:
    'O arquivo selecionado ultrapassa o tamanho máximo de segurança (5 MB). Escolha um arquivo mais leve.',
  E_PERMISSION_DENIED:
    'Permissão necessária não concedida no navegador para realizar esta ação.',
  E_INTERRUPTED:
    'A execução foi interrompida com segurança.',
  E_AUDIT_UNAVAILABLE:
    'Por segurança, alterações reais no portal exigem que o aplicativo Teacher AI esteja aberto para registrar a auditoria.',
  E_CLICK_UNDECLARED_SUBMIT:
    'O assistente bloqueou um clique em botão de envio final que não havia passado pela revisão prévia.',
  E_WRITE_NOT_APPROVED:
    'A tentativa de escrita no portal foi bloqueada porque este campo não constava no plano de ação aprovado.',

  // Repair (lib/repair)
  E_REPAIR_NO_CANDIDATE:
    'O visual do portal mudou e não encontrei automaticamente o novo botão. Que tal gravar uma rápida demonstração?',
  E_REPAIR_AMBIGUOUS:
    'Encontrei mais de uma opção parecida após a mudança visual do portal. Grave uma demonstração para confirmar o botão exato.',
  E_REPAIR_FORBIDDEN_PATCH:
    'A atualização automática foi bloqueada porque tentaria alterar regras de segurança da habilidade.',
  E_REPAIR_VERIFY_FAILED:
    'A sugestão de atualização do portal não passou na verificação de segurança e a versão anterior foi mantida.',
  E_REPAIR_PII_LEAK:
    'A atualização da habilidade foi bloqueada para proteger dados pessoais dos alunos (LGPD).',
  E_REPAIR_STALE:
    'Esta proposta de atualização refere-se a uma versão antiga da habilidade que já foi modificada.',

  // Runner-Ext & Quarentena / Exploração
  E_NM_FAILED:
    'Não consegui comunicar com o aplicativo Teacher AI no computador. Verifique se o aplicativo está aberto.',
  E_EXPLORATION_CANNOT_ACTIVATE:
    'Habilidades descobertas por exploração ficam em revisão e só podem ser ativadas após simulação (Dry-Run) e sua confirmação.',
  E_GRAPH_QUARANTINED:
    'Esta habilidade está em quarentena de segurança. Realize uma simulação (Dry-Run) e confirme antes de ativá-la.',
  E_DRIFT_WRITE_PROTECTED:
    'Um campo de lançamento mudou de lugar no portal escolar. Por segurança dos dados dos alunos, a atualização exige sua confirmação prévia.',
}

export interface ErrorNoticePayload {
  code: string
  friendlyMessage: string
  operation?: string
  technicalMessage?: string
  timestamp: number
}

export interface ReportErrorContext {
  operation?: string
  technicalError?: unknown
  notifySidePanel?: (notice: ErrorNoticePayload) => void
}

export function extractErrorCode(errOrCode: unknown): string {
  if (typeof errOrCode === 'string') {
    const trimmed = errOrCode.trim()
    if (/^E_[A-Z0-9_]+$/.test(trimmed)) return trimmed
    const match = trimmed.match(/\b(E_[A-Z0-9_]+)\b/)
    if (match) return match[1]
  }
  if (errOrCode && typeof errOrCode === 'object') {
    const codeProp = (errOrCode as { code?: unknown }).code
    if (typeof codeProp === 'string' && /^E_[A-Z0-9_]+$/.test(codeProp)) {
      return codeProp
    }
    const msgProp = (errOrCode as { message?: unknown }).message
    if (typeof msgProp === 'string') {
      const match = msgProp.match(/\b(E_[A-Z0-9_]+)\b/)
      if (match) return match[1]
    }
  }
  return 'E_INTERRUPTED'
}

export function getTeacherFriendlyErrorMessage(errOrCode: unknown): string {
  const code = extractErrorCode(errOrCode) as EngineErrorCode
  if (code in TEACHER_ERROR_MESSAGES) {
    return TEACHER_ERROR_MESSAGES[code]
  }
  return TEACHER_ERROR_MESSAGES.E_INTERRUPTED
}

export function reportError(
  codeOrErr: unknown,
  context?: ReportErrorContext
): ErrorNoticePayload {
  const code = extractErrorCode(codeOrErr)
  const friendlyMessage = getTeacherFriendlyErrorMessage(code)
  const rawErr = context?.technicalError ?? codeOrErr
  const technicalMessage =
    rawErr instanceof Error
      ? rawErr.message
      : typeof rawErr === 'string'
      ? rawErr
      : JSON.stringify(rawErr ?? '')

  console.warn(
    `[SkillGraph ReportError] [${code}] (${context?.operation || 'engine'}):`,
    technicalMessage
  )

  const notice: ErrorNoticePayload = {
    code,
    friendlyMessage,
    operation: context?.operation,
    technicalMessage,
    timestamp: Date.now(),
  }

  if (typeof context?.notifySidePanel === 'function') {
    try {
      context.notifySidePanel(notice)
    } catch {}
  } else if (typeof globalThis !== 'undefined') {
    const sendMsg = (globalThis as { chrome?: { runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> } } }).chrome?.runtime?.sendMessage
    if (typeof sendMsg === 'function') {
      try {
        const p = sendMsg({
          type: 'SKILLGRAPH_ERROR_NOTICE',
          action: 'SKILLGRAPH_ERROR_NOTICE',
          notice,
        })
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }
  }

  return notice
}

export type ExplorerMode = 'assisted' | 'autonomous_read' | 'autonomous_full'
export type GraphActivationOrigin =
  | 'exploration'
  | 'standalone_draft'
  | 'community_quarantine'
  | 'teacher_approved'

export interface ActivationGuardInput {
  origin?: GraphActivationOrigin
  graphOrigin?: GraphActivationOrigin
  explorerMode?: ExplorerMode
  teacherConfirmed?: boolean
  dryRunPassed?: boolean
  taskId?: string
  graphStatus?: string
}

/**
 * Trava ÚNICA de ativação (Prompt 5 + Prompt 10):
 * Independente do prisma do explorador (assisted, autonomous_read ou autonomous_full),
 * nenhum caminho de exploração ou rascunho pendente pode ativar um grafo sem origin === "teacher_approved".
 * A proveniência do grafo (graphOrigin) é lida estritamente do registro gravado no disco na criação.
 */
export function assertCanActivateGraph(input: ActivationGuardInput): void {
  if (input.graphStatus === 'pending_decisions') {
    const err = new Error(
      'E_DECISION_REQUIRED: Rascunho com decisões pendentes não pode ser ativado.'
    ) as Error & { code: string }
    err.code = 'E_DECISION_REQUIRED'
    throw err
  }

  const effectiveOrigin = input.graphOrigin ?? input.origin

  if (input.teacherConfirmed !== true || input.origin !== 'teacher_approved') {
    const err = new Error(
      `E_EXPLORATION_CANNOT_ACTIVATE: Ativação recusada para origem "${effectiveOrigin}" (modo explorador: ${input.explorerMode || 'n/a'}). Somente aprovação explícita da professora ("teacher_approved") pode ativar um grafo.`
    ) as Error & { code: string }
    err.code = 'E_EXPLORATION_CANNOT_ACTIVATE'
    throw err
  }

  const isExploration =
    effectiveOrigin === 'exploration' ||
    (typeof input.taskId === 'string' &&
      (input.taskId.startsWith('custom:nav-') || input.taskId.startsWith('explored:')))

  if (isExploration && input.dryRunPassed !== true) {
    const err = new Error(
      'E_EXPLORATION_CANNOT_ACTIVATE: Habilidade originada de exploração exige simulação (Dry-Run) aprovada antes da ativação pela professora.'
    ) as Error & { code: string }
    err.code = 'E_EXPLORATION_CANNOT_ACTIVATE'
    throw err
  }
}
