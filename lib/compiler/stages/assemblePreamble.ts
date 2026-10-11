// lib/compiler/stages/assemblePreamble.ts
// Montagem dos nós prévios: Autenticação (HANDOFF), Navegação (NAVIGATE) e Abas (CLICK)

import type { Node } from '../../contracts/skillgraph/nodes'
import type { Trace } from '../../recorder/traceSchema'
import type { CompilerDecisions } from '../decisions'
import type { SegmentedTrace } from './segment'
import type { ParameterContext } from './parametrize'
import { buildAnchorFromDescriptor } from './anchors'

export interface PlannedNode {
  id: string
  build: (successId: string) => Node
}

export function buildPreambleNodes(
  trace: Trace,
  segmented: SegmentedTrace,
  decisions: CompilerDecisions,
  paramContext: ParameterContext,
  allocId: () => string
): PlannedNode[] {
  const planned: PlannedNode[] = []

  // 1. Bloco de Login / Handoff
  if (segmented.loginSteps.length > 0) {
    const loginStep = segmented.loginSteps[0]
    const loginAnchor = buildAnchorFromDescriptor(
      loginStep.descriptor,
      'Formulário ou campo protegido de autenticação',
      undefined,
      decisions,
      paramContext
    )
    planned.push({
      id: allocId(),
      build: (next) => ({
        type: 'HANDOFF_HUMAN',
        label: 'Aguardar Autenticação do Usuário no Portal',
        reason: 'login',
        message: 'Por favor, realize seu login no portal escolar para que a automação prossiga.',
        resume_when: { op: 'not_exists', anchor: loginAnchor },
        timeout_ms: 180000,
        retry: { max_attempts: 1, backoff_ms: 0 },
        postconditions: [],
        on_success: next,
        on_fail: '$abort',
      }),
    })
  }

  // 2. Navegação Inicial
  const initialUrl = segmented.initialNav && 'url' in segmented.initialNav
    ? (segmented.initialNav as any).url
    : trace.initial_url

  let path = '/'
  let host = trace.steps[0]?.host || 'localhost'
  try {
    const u = new URL(initialUrl, 'http://localhost')
    path = u.pathname
    if (u.host) host = u.host
  } catch {}

  const navQuery = segmented.filterStep?.mode === 'query' && segmented.filterStep.queryParam
    ? { [segmented.filterStep.queryParam]: paramContext.getFilterValueRef() }
    : undefined

  planned.push({
    id: allocId(),
    build: (next) => ({
      type: 'NAVIGATE',
      label: `Navegar para ${path}`,
      path,
      host,
      query: navQuery,
      retry: { max_attempts: 2, backoff_ms: 500 },
      timeout_ms: 10000,
      postconditions: [],
      on_success: next,
      on_fail: '$abort',
    }),
  })

  // 3. Filtro por Abas se houver
  if (segmented.filterStep?.mode === 'tab_click' && 'descriptor' in segmented.filterStep.step) {
    const tabAnchor = buildAnchorFromDescriptor(
      (segmented.filterStep.step as any).descriptor,
      'Aba de seleção da turma',
      undefined,
      decisions,
      paramContext
    )
    tabAnchor.candidates = tabAnchor.candidates.map((c) => {
      if (c.strategy === 'text' || c.strategy === 'role_name') {
        return { ...c, name: paramContext.getFilterTextSpec(), text: paramContext.getFilterTextSpec() } as any
      }
      return c
    })

    planned.push({
      id: allocId(),
      build: (next) => ({
        type: 'CLICK',
        label: 'Selecionar Aba da Turma',
        anchor: tabAnchor,
        is_submit_action: false,
        expect_navigation: false,
        retry: { max_attempts: 2, backoff_ms: 500 },
        timeout_ms: 5000,
        postconditions: [],
        on_success: next,
        on_fail: '$abort',
      }),
    })
  }

  return planned
}
