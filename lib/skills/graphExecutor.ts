/**
 * graphExecutor.ts — Motor de Execução Real de Skill Graphs
 *
 * Responsável por percorrer o grafo de nós semânticos, resolver âncoras/variáveis,
 * pausar e solicitar aprovação em nós de CHECKPOINT, e impor a trava dupla de runtime.
 *
 * CONTRATO SISTÊMICO ANTI-RECORRÊNCIA (FAZER VS. PARECER):
 * Nenhum nó de ação (NAVIGATE, CLICK, WRITE, WAIT) pode marcar status: 'SUCCESS' sem
 * confirmar um efeito observável real no navegador/DOM (verified: true, verification_method: string).
 * Se a verificação de efeito falhar, o nó obrigatoriamente marca status: 'FAILED' e verified: false.
 * Todo novo tipo de nó de ação implementado no futuro deve vir acompanhado de sua respectiva
 * rotina de verificação observável ou ser explicitamente marcado como não verificado.
 */

import { SkillGraph, SkillNode, SkillNodeType } from './skillGraphSchema'
import { isRiskNode, validateSkillGraph } from './graphValidator'

export class SecurityAssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecurityAssertionError'
  }
}

export interface DomProvider {
  querySelectorAll?: (selector: string) => any[]
  querySelector?: (selector: string) => any
  navigate?: (url: string) => Promise<boolean | void> | boolean | void
  getCurrentUrl?: () => string
}

export interface ExecutionContext {
  /** Variáveis concretas da execução (ex: { aluno: 'João Silva', nota: 8.5, data: '2026-09-06' }) */
  bindings: Record<string, any>
  /** Callback assíncrono chamado quando um nó de CHECKPOINT for alcançado */
  onCheckpoint?: (checkpointInfo: CheckpointPreview) => Promise<boolean>
  /** Provedor de elementos DOM da página ou tabela */
  domProvider?: DomProvider
  /** Linhas de tabela estruturadas passadas diretamente (array de linhas com células/colunas) */
  tableRows?: Array<Record<string, string> | any>
  /** Controle de Pausa / Retomada (Play / Pause Lote 3) */
  pauseControl?: {
    isPaused: () => boolean
    waitForResume: () => Promise<void>
    onPauseStateChange?: (isPaused: boolean, currentRecordsCount: number) => void
    stepDelayMs?: number
  }
}

export interface CheckpointPreview {
  nodeId: string
  title: string
  description: string
  actionSummary: string
  resolvedBindings: Record<string, any>
  nextRiskNodeId: string | null
}

export interface ExecutionTraceStep {
  nodeId: string
  nodeType: SkillNodeType
  status: 'SUCCESS' | 'FAILED' | 'CHECKPOINT_PAUSED' | 'ABORTED'
  details?: any
  timestamp: string
  /** Indica se o efeito observável real foi confirmado na página */
  verified?: boolean
  /** Heurística ou método exato de confirmação observável */
  verification_method?: string
}

export interface ExecutionResult {
  success: boolean
  status: 'COMPLETED' | 'ABORTED_BY_USER' | 'FAILED' | 'SECURITY_VIOLATION'
  finalNodeId: string | null
  trace: ExecutionTraceStep[]
  lastCheckpointPreview: CheckpointPreview | null
  error?: string
}

/**
 * Substitui placeholders {variavel} no texto pelos valores reais de bindings
 */
export function interpolateBindings(template: string, bindings: Record<string, any>): string {
  if (!template) return ''
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return bindings[key] !== undefined ? String(bindings[key]) : match
  })
}

/**
 * Extrai texto concreto de uma célula de tabela, seja objeto JS ou elemento DOM
 */
function extractCellText(rowElement: any, anchorValue: string, colIndex1Based?: number): string | null {
  if (!rowElement) return null

  // Se for um Record/Objeto simples (ex: { 'td:nth-child(1)': 'Alice', 'aluno_nome': 'Alice' } ou array)
  if (typeof rowElement === 'object' && typeof rowElement.querySelector !== 'function') {
    if (anchorValue in rowElement) return String(rowElement[anchorValue])
    if (colIndex1Based !== undefined) {
      if (Array.isArray(rowElement)) {
        return rowElement[colIndex1Based - 1] !== undefined ? String(rowElement[colIndex1Based - 1]) : null
      }
      if (colIndex1Based in rowElement) return String(rowElement[colIndex1Based])
      if (`col_${colIndex1Based - 1}` in rowElement) return String(rowElement[`col_${colIndex1Based - 1}`])
      const keys = Object.keys(rowElement)
      if (keys[colIndex1Based - 1] !== undefined) return String(rowElement[keys[colIndex1Based - 1]])
    }
    return null
  }

  // Se for elemento DOM com querySelector
  if (typeof rowElement.querySelector === 'function') {
    try {
      const cell = rowElement.querySelector(anchorValue)
      if (cell) {
        return (cell.textContent || cell.innerText || cell.value || '').trim()
      }
    } catch {
      // Ignora erro de seletor inválido
    }
  }

  // Se tiver propriedade .cells ou .children (ex: HTMLTableRowElement)
  const cells = rowElement.cells || rowElement.children
  if (cells && colIndex1Based !== undefined && colIndex1Based <= cells.length) {
    const c = cells[colIndex1Based - 1]
    return (c.textContent || c.innerText || c.value || '').trim()
  }

  return null
}

/**
 * Retorna a URL atual do documento a partir do domProvider ou do ambiente window global
 */
function getCurrentPageUrl(context: ExecutionContext): string {
  if (context.domProvider?.getCurrentUrl) {
    try {
      return context.domProvider.getCurrentUrl() || ''
    } catch {
      return ''
    }
  }
  if (typeof window !== 'undefined' && window.location) {
    return window.location.href || ''
  }
  return ''
}

/**
 * Localiza um elemento alvo usando estratégias ordenadas: seletor CSS e busca semântica por texto
 */
function findTargetElement(anchorValue: string, context: ExecutionContext, anchorDescription?: string): any {
  if (!anchorValue && !anchorDescription) return null
  const selector = (anchorValue || '').trim()

  // 1. Tenta por domProvider.querySelector ou document.querySelector
  if (selector) {
    if (context.domProvider?.querySelector) {
      try {
        const el = context.domProvider.querySelector(selector)
        if (el) return el
      } catch {}
    }
    if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      try {
        const el = document.querySelector(selector)
        if (el) return el
      } catch {}
    }
  }

  // 2. Busca semântica por texto em botões, links, inputs e itens acionáveis
  const searchTexts = [selector, anchorDescription].filter(Boolean).map(t => t!.trim().toLowerCase())
  let candidates: any[] = []

  if (context.domProvider?.querySelectorAll) {
    try {
      candidates = Array.from(context.domProvider.querySelectorAll('button, a, input, [role="button"], span, div, li'))
    } catch {}
  } else if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    try {
      candidates = Array.from(document.querySelectorAll('button, a, input, [role="button"], span, div, li'))
    } catch {}
  }

  if (candidates.length > 0) {
    const matched = candidates.find(c => {
      const txt = (c.textContent || c.innerText || c.value || c.placeholder || '').trim().toLowerCase()
      return searchTexts.some(st => txt === st || (txt.length <= 60 && txt.includes(st)))
    })
    if (matched) return matched
  }

  return null
}

/**
 * Aplica valor em elementos de formulário disparando setter nativo do protótipo
 * para garantir compatibilidade com frameworks reativos (React, Vue, Angular, Svelte)
 */
function setElementValueNative(el: any, valToWrite: string): void {
  if (!el) return

  let setterFound = false
  try {
    const proto = Object.getPrototypeOf(el)
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
                       (typeof HTMLInputElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')) ||
                       (typeof HTMLTextAreaElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')) ||
                       (typeof HTMLSelectElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value'))
    if (descriptor?.set) {
      descriptor.set.call(el, valToWrite)
      setterFound = true
    }
  } catch {}

  if (!setterFound) {
    el.value = valToWrite
    if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
      el.innerText = valToWrite
      el.textContent = valToWrite
    }
  }

  try {
    el.focus?.()
  } catch {}

  try {
    if (typeof Event !== 'undefined') {
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    } else if (typeof el.dispatchEvent === 'function') {
      el.dispatchEvent({ type: 'input', bubbles: true })
      el.dispatchEvent({ type: 'change', bubbles: true })
    }
  } catch {}
}

/**
 * Executa um Skill Graph em ambiente controlado (Lote 1 & Lote 2.1)
 */
export async function executeSkillGraph(
  graph: SkillGraph,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // 1. Validação estática antes da execução
  const validation = validateSkillGraph(graph)
  if (!validation.safe || !validation.valid) {
    return {
      success: false,
      status: 'SECURITY_VIOLATION',
      finalNodeId: null,
      trace: [],
      lastCheckpointPreview: null,
      error: `Grafo inseguro recusado pelo validador: ${validation.errors.join(' | ')}`,
    }
  }

  const trace: ExecutionTraceStep[] = []
  let currentNodeId: string | null = graph.entry_node
  let lastApprovedCheckpointId: string | null = null
  let lastCheckpointPreview: CheckpointPreview | null = null
  const executionLimit = 500 // Proteção contra loops infinitos
  let stepCount = 0

  // Estado interno para iteração de coleções (tabelas, listas de alunos)
  interface LoopState {
    rows: any[]
    currentIndex: number
    collectedRecords: Record<string, any>[]
    currentRowBindings: Record<string, any>
    active: boolean
  }

  const loopState: LoopState = {
    rows: [],
    currentIndex: 0,
    collectedRecords: [],
    currentRowBindings: {},
    active: false,
  }

  while (currentNodeId && stepCount++ < executionLimit) {
    // ── SUPORTE A PLAY / PAUSE (LOTE 3) ──────────────────────────────────────
    if (context.pauseControl?.isPaused()) {
      const currentCount = loopState.collectedRecords.length
      if (context.pauseControl.onPauseStateChange) {
        context.pauseControl.onPauseStateChange(true, currentCount)
      }
      await context.pauseControl.waitForResume()
      if (context.pauseControl.onPauseStateChange) {
        context.pauseControl.onPauseStateChange(false, currentCount)
      }
    }

    if (context.pauseControl?.stepDelayMs && context.pauseControl.stepDelayMs > 0) {
      await new Promise(r => setTimeout(r, context.pauseControl!.stepDelayMs))
    }

    const node: SkillNode = graph.nodes[currentNodeId]
    if (!node) {
      trace.push({
        nodeId: currentNodeId,
        nodeType: 'WAIT',
        status: 'FAILED',
        details: 'Nó não encontrado no grafo',
        timestamp: new Date().toISOString(),
      })
      return {
        success: false,
        status: 'FAILED',
        finalNodeId: currentNodeId,
        trace,
        lastCheckpointPreview,
        error: `Nó '${currentNodeId}' não encontrado.`,
      }
    }

    // ── TRAVA DUPLA DE SEGURANÇA EM RUNTIME ──────────────────────────────────
    // Se o nó for de risco (WRITE ou CLICK de submit), EXIGE que o último checkpoint
    // aprovado esteja ativo e não tenha sido invalidado.
    if (isRiskNode(node)) {
      if (!lastApprovedCheckpointId) {
        throw new SecurityAssertionError(
          `TRAVA DE RUNTIME DISPARADA: Tentativa de executar nó de risco "${node.id}" (${node.type}) ` +
          `sem que um nó de CHECKPOINT correspondente tenha sido aprovado pelo professor.`
        )
      }
    }

    // ── EXECUÇÃO POR TIPO DE NÓ ──────────────────────────────────────────────
    switch (node.type) {
      case 'CHECKPOINT': {
        const actionDesc = interpolateBindings(node.params?.description || 'Confirmação necessária', context.bindings)
        const nextId = node.on_success

        lastCheckpointPreview = {
          nodeId: node.id,
          title: 'Aprovação de Ação no Portal',
          description: actionDesc,
          actionSummary: `Prestes a executar ação com dados: ${JSON.stringify(context.bindings)}`,
          resolvedBindings: { ...context.bindings },
          nextRiskNodeId: nextId,
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'CHECKPOINT_PAUSED',
          details: lastCheckpointPreview,
          timestamp: new Date().toISOString(),
        })

        // Consulta aprovação humana (simulada via callback ou default true se aprovado)
        let isApproved = true
        if (context.onCheckpoint) {
          isApproved = await context.onCheckpoint(lastCheckpointPreview)
        }

        if (!isApproved) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'ABORTED',
            details: 'Ação rejeitada pelo professor no checkpoint',
            timestamp: new Date().toISOString(),
          })
          return {
            success: false,
            status: 'ABORTED_BY_USER',
            finalNodeId: node.id,
            trace,
            lastCheckpointPreview,
            error: 'Execução cancelada pelo usuário no ponto de conferência.',
          }
        }

        // Checkpoint aprovado! Registra autorização para o nó de risco imediatamente subsequente
        lastApprovedCheckpointId = node.id
        currentNodeId = node.on_success
        break
      }

      case 'WRITE': {
        const valToWrite = interpolateBindings(node.params?.action_value || '', context.bindings)
        const el = findTargetElement(node.anchor?.value || '', context, node.anchor?.description)

        if (!el) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'element_resolution',
            details: {
              error: `Campo de formulário não localizado no DOM: "${node.anchor?.value || node.anchor?.description || ''}"`,
              anchor: node.anchor,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        // Aplica o valor disparando o setter nativo de protótipo (compatível com React/Vue)
        setElementValueNative(el, valToWrite)

        // Verificação Sistêmica: Lê de volta o valor persistido no elemento
        const readBackValue = String(el.value !== undefined ? el.value : (el.innerText || el.textContent || '')).trim()
        const expectedValue = valToWrite.trim()
        const writeVerified = (readBackValue === expectedValue) || (expectedValue !== '' && readBackValue.includes(expectedValue))

        if (!writeVerified) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'read_back_input_value',
            details: {
              error: `Valor escrito não persistiu no elemento. Esperado: "${expectedValue}", Lido: "${readBackValue}"`,
              expected: expectedValue,
              actual: readBackValue,
              field: node.anchor?.value,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: 'read_back_input_value',
          details: {
            field: node.anchor?.value,
            writtenValue: valToWrite,
            persistedValue: readBackValue,
          },
          timestamp: new Date().toISOString(),
        })

        // Avança para o próximo nó mantendo a autorização para a cadeia de submissão do checkpoint
        currentNodeId = node.on_success
        break
      }

      case 'CLICK': {
        const el = findTargetElement(node.anchor?.value || '', context, node.anchor?.description)

        if (!el) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'element_resolution',
            details: {
              error: `Elemento para clique não localizado no DOM: "${node.anchor?.value || node.anchor?.description || ''}"`,
              anchor: node.anchor,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        // Captura estado pré-clique para verificação de mutação
        const preUrl = getCurrentPageUrl(context)
        const preInDoc = (typeof document !== 'undefined' && document.contains) ? document.contains(el) : true
        const preDisabled = Boolean(el.disabled || (el.getAttribute && el.getAttribute('disabled') !== null))
        const preClass = String(el.className || '')

        // Disparo de eventos reais de mouse
        try {
          el.scrollIntoView?.({ behavior: 'auto', block: 'center' })
          el.focus?.()
          if (typeof MouseEvent !== 'undefined') {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
          }
          el.click?.()
        } catch (clickErr: any) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'dom_click_dispatch',
            details: { error: `Erro ao disparar evento de clique: ${clickErr?.message || clickErr}` },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        // Pequena pausa assíncrona para o DOM processar microtasks
        await new Promise(r => setTimeout(r, 60))

        // Verificação Sistêmica de Efeito Real Observável
        const postUrl = getCurrentPageUrl(context)
        const postInDoc = (typeof document !== 'undefined' && document.contains) ? document.contains(el) : true
        const postDisabled = Boolean(el.disabled || (el.getAttribute && el.getAttribute('disabled') !== null))
        const postClass = String(el.className || '')

        let clickVerified = false
        let verificationMethod = 'observable_mutation'
        let changeDetails: any = {}

        if (postUrl && preUrl && postUrl !== preUrl) {
          clickVerified = true
          verificationMethod = 'url_navigation'
          changeDetails = { from: preUrl, to: postUrl }
        } else if (preInDoc && !postInDoc) {
          clickVerified = true
          verificationMethod = 'element_removed_from_dom'
          changeDetails = { elementRemoved: true }
        } else if (node.params?.expected_target) {
          const expectedEl = findTargetElement(node.params.expected_target, context)
          if (expectedEl) {
            clickVerified = true
            verificationMethod = 'expected_target_appeared'
            changeDetails = { target: node.params.expected_target }
          }
        } else if (preDisabled !== postDisabled || preClass !== postClass) {
          clickVerified = true
          verificationMethod = 'element_state_mutated'
          changeDetails = { disabled: postDisabled, class: postClass }
        } else if (node.params?.is_submit_action) {
          // Ação crítica de submissão exige comprovação estrita
          clickVerified = false
          verificationMethod = 'submit_no_observable_change'
        } else {
          // Heurística explícita: Se não foi configurado expected_target e o elemento continuou idêntico
          clickVerified = false
          verificationMethod = 'no_observable_dom_mutation'
        }

        if (!clickVerified) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: verificationMethod,
            details: {
              error: `Ação de clique realizada, mas nenhum efeito observável foi confirmado no DOM ou URL (heurística: ${verificationMethod}).`,
              clickedElement: node.anchor?.value,
              isSubmit: Boolean(node.params?.is_submit_action),
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: verificationMethod,
          details: {
            clickedElement: node.anchor?.value,
            isSubmit: Boolean(node.params?.is_submit_action),
            mutation: changeDetails,
          },
          timestamp: new Date().toISOString(),
        })

        // Consome a autorização de risco do checkpoint
        lastApprovedCheckpointId = null
        currentNodeId = node.on_success
        break
      }

      case 'LOCATE': {
        const isMulti = node.params?.multiplicity === 'all'
        const selector = node.anchor?.value || ''
        let locatedElements: any[] = []

        if (context.tableRows && context.tableRows.length > 0) {
          locatedElements = [...context.tableRows]
        } else if (context.domProvider?.querySelectorAll) {
          locatedElements = context.domProvider.querySelectorAll(selector)
        } else if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
          try {
            locatedElements = Array.from(document.querySelectorAll(selector))
          } catch {
            locatedElements = []
          }
        }

        const resolvedCount = isMulti ? locatedElements.length : (locatedElements.length > 0 ? 1 : 0)
        // Regra de allow_empty:
        // Se multiplicity for 'all', padrão é permitir vazio (allow_empty: true) a menos que explicitado false.
        // Se multiplicity for 'single', padrão é NÃO permitir vazio (allow_empty: false) a menos que explicitado true.
        const allowEmpty = typeof node.params?.allow_empty === 'boolean'
          ? Boolean(node.params.allow_empty)
          : isMulti

        if (resolvedCount === 0 && !allowEmpty) {
          const errText = `Nenhum elemento localizado para o seletor "${selector}" (multiplicity: ${isMulti ? 'all' : 'single'}, resolvedCount: 0).`
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'element_resolution',
            details: {
              error: errText,
              multiplicity: isMulti ? 'all' : 'single',
              resolvedCount: 0,
              selector,
              allowEmpty,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        if (isMulti) {
          loopState.rows = locatedElements
          loopState.currentIndex = 0
          loopState.collectedRecords = []
          loopState.currentRowBindings = {}
          loopState.active = locatedElements.length > 0
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: 'element_resolution',
          details: {
            multiplicity: isMulti ? 'all' : 'single',
            resolvedCount,
            selector,
            allowEmpty,
          },
          timestamp: new Date().toISOString(),
        })
        currentNodeId = node.on_success
        break
      }

      case 'READ': {
        let readVal: string | null = null
        const anchor = node.anchor
        const isRowScope = anchor?.scope === 'row_current'

        // Extrai o índice 1-based se for nth-child
        let colIndex1Based: number | undefined
        if (anchor?.value) {
          const nthMatch = anchor.value.match(/nth-child\((\d+)\)/)
          if (nthMatch) {
            colIndex1Based = parseInt(nthMatch[1], 10)
          }
        }

        if (isRowScope && loopState.active && loopState.rows.length > 0) {
          const currentRow = loopState.rows[loopState.currentIndex]
          readVal = extractCellText(currentRow, anchor?.value || '', colIndex1Based)
        } else {
          // Leitura global de documento ou elemento fora do loop
          if (context.domProvider?.querySelector && anchor?.value) {
            const el = context.domProvider.querySelector(anchor.value)
            readVal = el ? (el.textContent || el.innerText || el.value || '').trim() : null
          } else if (typeof document !== 'undefined' && anchor?.value) {
            try {
              const el = document.querySelector(anchor.value)
              readVal = el ? ((el as any).textContent || (el as any).innerText || (el as any).value || '').trim() : null
            } catch {
              readVal = null
            }
          }
        }

        // Se não conseguiu ler nenhum valor concreto, NUNCA inventa strings simuladas!
        if (readVal === null || readVal === undefined) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            details: {
              error: `Não foi possível ler elemento para âncora "${anchor?.value}" (scope: ${anchor?.scope || 'global'}).`,
              anchor,
              rowIndex: loopState.active ? loopState.currentIndex : undefined,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        // Atualiza bindings e dados da linha corrente
        const bindingsList = node.params?.variable_bindings || []
        for (const varName of bindingsList) {
          context.bindings[varName] = readVal
          if (loopState.active) {
            loopState.currentRowBindings[varName] = readVal
          }
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          details: {
            readValue: readVal,
            variableBindings: bindingsList,
            rowIndex: loopState.active ? loopState.currentIndex : undefined,
          },
          timestamp: new Date().toISOString(),
        })
        currentNodeId = node.on_success
        break
      }

      case 'LOOP': {
        if (!loopState.active || loopState.rows.length === 0) {
          // Loop sem coleção ativa: avança diretamente para on_success
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            details: { message: 'Loop finalizado ou coleção vazia' },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_success
          break
        }

        // Acumula o registro da linha que acabou de ser lida
        if (Object.keys(loopState.currentRowBindings).length > 0) {
          loopState.collectedRecords.push({ ...loopState.currentRowBindings })
          loopState.currentRowBindings = {}
        }

        // Avança o cursor para a próxima linha
        loopState.currentIndex++

        if (loopState.currentIndex < loopState.rows.length) {
          // Ainda há linhas a processar: salta para o loop_target
          let targetNodeId = node.params?.loop_target
          // Suporte resiliente: se loop_target apontar para o nó LOCATE anterior, salta para o on_success dele (primeiro READ)
          if (targetNodeId && graph.nodes[targetNodeId]?.type === 'LOCATE') {
            targetNodeId = graph.nodes[targetNodeId]?.on_success || targetNodeId
          }

          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            details: {
              loopAction: 'CONTINUE_LOOP',
              nextIndex: loopState.currentIndex,
              totalRows: loopState.rows.length,
              targetNodeId,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = targetNodeId || node.on_success
        } else {
          // Todas as linhas foram processadas!
          loopState.active = false
          context.bindings._collected_records = [...loopState.collectedRecords]
          context.bindings.records = [...loopState.collectedRecords]
          // Alias de compatibilidade retroativa para skills que esperam students
          context.bindings.students = [...loopState.collectedRecords]

          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            details: {
              loopAction: 'TERMINATE_LOOP',
              totalProcessed: loopState.rows.length,
              recordsCollectedCount: loopState.collectedRecords.length,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_success
        }
        break
      }

      case 'BRANCH': {
        const cond = node.params?.condition || 'true'
        const isTrue = Boolean(context.bindings[cond] || cond === 'true')
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          details: { conditionEvaluated: cond, result: isTrue },
          timestamp: new Date().toISOString(),
        })
        currentNodeId = isTrue ? node.on_success : node.on_fail
        break
      }

      case 'NAVIGATE': {
        const targetUrl = interpolateBindings(node.anchor?.value || node.params?.url || '', context.bindings)
        const preUrl = getCurrentPageUrl(context)

        if (!targetUrl) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            verified: true,
            verification_method: 'in_place_no_url',
            details: { message: 'Nó NAVIGATE sem URL especificada; permanência confirmada na página atual.', currentUrl: preUrl },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_success
          break
        }

        // 1. Executa a navegação real
        if (context.domProvider?.navigate) {
          try {
            await context.domProvider.navigate(targetUrl)
          } catch (e: any) {
            trace.push({
              nodeId: node.id,
              nodeType: node.type,
              status: 'FAILED',
              verified: false,
              verification_method: 'dom_provider_navigate',
              details: { error: e?.message || String(e), targetUrl },
              timestamp: new Date().toISOString(),
            })
            currentNodeId = node.on_fail || null
            break
          }
        } else if (typeof window !== 'undefined' && window.location) {
          try {
            const curNormalized = (window.location.pathname || '') + (window.location.search || '')
            const targetPath = targetUrl.startsWith('http') ? new URL(targetUrl).pathname : targetUrl
            if (curNormalized !== targetPath && !window.location.href.includes(targetUrl.replace(/\/$/, ''))) {
              window.location.href = targetUrl
              await new Promise(r => setTimeout(r, 200))
            }
          } catch (e: any) {
            console.warn('[GraphExecutor] Erro ao navegar:', e)
          }
        }

        // 2. Verificação Sistêmica: confirma se a URL pós-navegação corresponde ao destino
        const postUrl = getCurrentPageUrl(context)
        const targetNormalized = targetUrl.replace(/\/$/, '').toLowerCase()
        const actualNormalized = postUrl.replace(/\/$/, '').toLowerCase()

        const isMatch = Boolean(actualNormalized && targetNormalized) && (
          actualNormalized === targetNormalized ||
          actualNormalized.includes(targetNormalized) ||
          actualNormalized.endsWith(targetNormalized) ||
          (targetNormalized.startsWith('http') && actualNormalized === targetNormalized)
        )

        if (!isMatch) {
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
            verified: false,
            verification_method: 'url_changed_or_matched',
            details: {
              error: `Navegação não confirmada: URL esperada "${targetUrl}" não corresponde à URL observada "${postUrl}".`,
              expectedUrl: targetUrl,
              actualUrl: postUrl,
              fromUrl: preUrl,
            },
            timestamp: new Date().toISOString(),
          })
          currentNodeId = node.on_fail || null
          break
        }

        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'SUCCESS',
          verified: true,
          verification_method: 'url_changed_or_matched',
          details: { targetUrl, actualUrl: postUrl },
          timestamp: new Date().toISOString(),
        })
        currentNodeId = node.on_success
        break
      }

      case 'WAIT': {
        const delayMs = Number(node.params?.duration_ms) || 500
        const waitSelector = node.anchor?.value || node.params?.wait_until

        if (waitSelector) {
          // Espera assíncrona real por condição/presença no DOM
          const timeoutMs = Number(node.params?.timeout_ms) || 5000
          const start = Date.now()
          let elFound = false
          while (Date.now() - start < timeoutMs) {
            const el = findTargetElement(waitSelector, context)
            if (el) {
              elFound = true
              break
            }
            await new Promise(r => setTimeout(r, 50))
          }

          if (!elFound) {
            trace.push({
              nodeId: node.id,
              nodeType: node.type,
              status: 'FAILED',
              verified: false,
              verification_method: 'dom_condition_wait',
              details: {
                error: `Elemento "${waitSelector}" não surgiu no DOM após ${timeoutMs}ms.`,
                waitSelector,
                timeoutMs,
              },
              timestamp: new Date().toISOString(),
            })
            currentNodeId = node.on_fail || null
            break
          }

          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            verified: true,
            verification_method: 'dom_condition_wait',
            details: { waitSelector, elapsedMs: Date.now() - start },
            timestamp: new Date().toISOString(),
          })
        } else {
          // Temporizador assíncrono real (await delay)
          await new Promise(r => setTimeout(r, delayMs))
          trace.push({
            nodeId: node.id,
            nodeType: node.type,
            status: 'SUCCESS',
            verified: true,
            verification_method: 'timer_elapsed',
            details: { waitMs: delayMs },
            timestamp: new Date().toISOString(),
          })
        }
        currentNodeId = node.on_success
        break
      }

      default: {
        // CONTRATO ANTI-RECORRÊNCIA: Nenhum nó de ação novo pode marcar sucesso sem verificação
        const errText = `Tipo de nó "${node.type}" não possui rotina de verificação observável implementada (fallback restritivo).`
        trace.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'FAILED',
          verified: false,
          verification_method: 'unverified_fallback_contract',
          details: {
            error: errText,
            nodeType: node.type,
            anchor: node.anchor?.value,
          },
          timestamp: new Date().toISOString(),
        })
        currentNodeId = node.on_fail || null
        break
      }
    }

    // Se alcançou um estado terminal
    if (currentNodeId === 'ABORT') {
      return {
        success: false,
        status: 'ABORTED_BY_USER',
        finalNodeId: 'ABORT',
        trace,
        lastCheckpointPreview,
      }
    }
  }

  const lastStep = trace[trace.length - 1]
  if (lastStep && lastStep.status === 'FAILED') {
    return {
      success: false,
      status: 'FAILED',
      finalNodeId: lastStep.nodeId,
      trace,
      lastCheckpointPreview,
      error: lastStep.details?.error || `Execução falhou no nó "${lastStep.nodeId}" (${lastStep.nodeType}).`,
    }
  }

  return {
    success: true,
    status: 'COMPLETED',
    finalNodeId: currentNodeId,
    trace,
    lastCheckpointPreview,
  }
}