// __tests__/compiler.core.test.ts
// Suíte de testes determinísticos do compilador puro de SkillGraph v2

import '../lib/contracts/skillgraph/primitives'
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../lib/compiler/compile'
import { scrubGraph } from '../lib/compiler/scrub'
import { PiiRegistry } from '../lib/recorder/registry'
import { CompilerError } from '../lib/compiler/report'
import { validateGraph } from '../lib/contracts/skillgraph/validate'
import type { CompilerDecisions } from '../lib/compiler/decisions'
import type { Trace } from '../lib/recorder/traceSchema'

function loadGoldenTrace(filename: string): Trace {
  const filePath = path.join(process.cwd(), 'traces', 'golden', filename)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

const FIXED_CLOCK = () => '2026-10-11T12:00:00.000Z'

function expectErrorCode(fn: () => void, code: string) {
  try {
    fn()
    expect.unreachable('Deveria ter lançado CompilerError')
  } catch (err: any) {
    expect(err).toBeInstanceOf(CompilerError)
    expect(err.code).toBe(code)
  }
}

describe('Compiler Core v2 — Determinístico e Anti-PII', () => {
  it('1. Compila read_roster.trace.json gerando grafo read-only válido', () => {
    const trace = loadGoldenTrace('read_roster.trace.json')
    const decisions: CompilerDecisions = {
      task_id: 'read_roster',
      portal_id: 'portal_escola',
      task_name: 'Ler Lista de Alunos',
      allowed_hosts: ['portal.escola.com'],
      class_filter: { mode: 'query', query_param: 'turma', param_name: 'turma' },
    }

    const { graph, report } = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(report.valid).toBe(true)
    expect(graph.identity.task_id).toBe('read_roster')
    expect(graph.safety.side_effect_level).toBe('read')
    expect(graph.nodes.n1.type).toBe('NAVIGATE')
    expect(graph.nodes.n2.type).toBe('READ')
    expect(graph.pagination).toBeDefined()
    expect(validateGraph(graph).valid).toBe(true)
  })

  it('2. Compila lancar_falta.trace.json com CHECKPOINT antes do WRITE e cabeçalho parametrizado', () => {
    const trace = loadGoldenTrace('lancar_falta.trace.json')
    const decisions: CompilerDecisions = {
      task_id: 'lancar_falta',
      portal_id: 'portal_escola',
      task_name: 'Lançar Falta',
      allowed_hosts: ['portal.escola.com'],
      attendance_polarity: 'checked_is_present',
      class_filter: { mode: 'query', query_param: 'turma', param_name: 'turma' },
    }

    const { graph } = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(graph.safety.side_effect_level).toBe('write')
    expect(graph.nodes.n2.type).toBe('CHECKPOINT')
    expect(graph.nodes.n3.type).toBe('WRITE')
    const writeNode = graph.nodes.n3 as any
    expect(writeNode.read_back).toBe(true)
    expect(writeNode.method).toBe('set_checked')
    expect(writeNode.semantic).toBe('attendance')
    expect(graph.nodes.n4.type).toBe('CLICK')
    expect(validateGraph(graph).valid).toBe(true)
  })

  it('3. Compila lancar_nota.trace.json com CHECKPOINT e WRITE de nota', () => {
    const trace = loadGoldenTrace('lancar_nota.trace.json')
    const decisions: CompilerDecisions = {
      task_id: 'lancar_nota',
      portal_id: 'portal_escola',
      task_name: 'Lançar Nota',
      allowed_hosts: ['portal.escola.com'],
      grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
      class_filter: { mode: 'query', query_param: 'turma', param_name: 'turma' },
    }

    const { graph } = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(graph.safety.side_effect_level).toBe('write')
    expect(graph.nodes.n2.type).toBe('CHECKPOINT')
    expect(graph.nodes.n3.type).toBe('WRITE')
    const writeNode = graph.nodes.n3 as any
    expect(writeNode.read_back).toBe(true)
    expect(writeNode.semantic).toBe('grade')
    expect(validateGraph(graph).valid).toBe(true)
  })

  it('4. Compila login.trace.json substituindo credenciais por HANDOFF_HUMAN (Anti-Keylogger)', () => {
    const trace = loadGoldenTrace('login.trace.json')
    const decisions: CompilerDecisions = {
      task_id: 'read_roster',
      portal_id: 'portal_escola',
      task_name: 'Acesso Pós-Login',
      allowed_hosts: ['portal.escola.com'],
    }

    const { graph } = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(graph.nodes.n1.type).toBe('HANDOFF_HUMAN')
    const handoff = graph.nodes.n1 as any
    expect(handoff.reason).toBe('login')
    expect(handoff.timeout_ms).toBe(180000)
    expect(graph.nodes.n2.type).toBe('NAVIGATE')
    expect(validateGraph(graph).valid).toBe(true)
  })

  it('5. Determinismo estrito: mesma entrada = mesmo JSON byte a byte', () => {
    const trace = loadGoldenTrace('read_roster.trace.json')
    const decisions: CompilerDecisions = {
      task_id: 'read_roster',
      portal_id: 'portal_escola',
      task_name: 'Ler Lista de Alunos',
      allowed_hosts: ['portal.escola.com'],
    }

    const res1 = compile(trace, decisions, { clock: FIXED_CLOCK })
    const res2 = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(JSON.stringify(res1.graph)).toBe(JSON.stringify(res2.graph))
  })

  it('6. Scrub Anti-PII: canário registrado no PiiRegistry e bloqueado se vazar', () => {
    const trace = loadGoldenTrace('lancar_falta.trace.json')
    const decisions: CompilerDecisions = {
      task_id: 'lancar_falta',
      portal_id: 'portal_escola',
      task_name: 'Lançar Falta',
      allowed_hosts: ['portal.escola.com'],
      attendance_polarity: 'checked_is_present',
    }

    const registry = new PiiRegistry()
    registry.register('Zeca Canário', 'student_name')

    const { graph } = compile(trace, decisions, { clock: FIXED_CLOCK, piiRegistry: registry })
    expect(graph.provenance.pii_scrubbed).toBe(true)

    const leakingGraph = JSON.parse(JSON.stringify(graph))
    leakingGraph.nodes.n1.label = 'Navegar para Zeca Canário'
    expectErrorCode(() => scrubGraph(leakingGraph, registry), 'E_PII_SCRUB_FAILED')
  })

  it('7. Bloqueio de Contrato (G0): select que não altera URL emite E_UNSUPPORTED_PATTERN', () => {
    const trace: Trace = {
      trace_version: '1.0',
      task_id: 'read_roster',
      started_at: 1775865600000,
      initial_url: 'http://portal.escola.com/alunos',
      steps: [
        {
          id: 's1',
          at: 1775865600100,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/alunos',
          kind: 'select',
          value: '8A',
          descriptor: { tag: 'select', classes: [] },
        },
        {
          id: 's2',
          at: 1775865601000,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/alunos',
          kind: 'mark_table',
          descriptor: { tag: 'table', classes: [], rowContext: { headers: ['Nome'], column_index: 0, cells: ['Ana'] } },
        },
      ],
    }
    const decisions: CompilerDecisions = {
      task_id: 'read_roster',
      portal_id: 'portal_escola',
      task_name: 'Leitura',
      allowed_hosts: ['portal.escola.com'],
    }

    expectErrorCode(() => compile(trace, decisions), 'E_UNSUPPORTED_PATTERN')
  })

  it('8. Limites: trace com mais de 500 passos rejeita com E_TRACE_TOO_LARGE', () => {
    const hugeSteps: any[] = []
    for (let i = 0; i < 505; i++) {
      hugeSteps.push({
        id: `s${i}`,
        at: 1000 + i,
        frame_path: '/',
        host: 'portal.escola.com',
        path: '/alunos',
        kind: 'navigate',
        url: 'http://portal.escola.com/alunos',
      })
    }
    const hugeTrace = { trace_version: '1.0' as const, task_id: 'read_roster', started_at: 1000, initial_url: 'http://portal.escola.com/alunos', steps: hugeSteps }
    const decisions: CompilerDecisions = { task_id: 'read_roster', portal_id: 'portal_escola', task_name: 'Leitura', allowed_hosts: ['portal.escola.com'] }
    expectErrorCode(() => compile(hugeTrace, decisions), 'E_TRACE_TOO_LARGE')
  })

  it('9. Decisão obrigatória: lancar_falta sem attendance_polarity devolve needs_decisions (não ativo, zero PII) e lança E_DECISION_REQUIRED se ignorado', () => {
    const trace = loadGoldenTrace('lancar_falta.trace.json')
    const decisions: CompilerDecisions = {
      task_id: 'lancar_falta',
      portal_id: 'portal_escola',
      task_name: 'Lançar Falta',
      allowed_hosts: ['portal.escola.com'],
    }

    const res = compile(trace, decisions)
    expect(res.status).toBe('needs_decisions')
    if (res.status === 'needs_decisions') {
      expect(res.decisions.map((d) => d.key)).toEqual(['attendance_polarity'])
      expect(res.partialGraph.active).toBe(false)
      expect(res.partialGraph.status).toBe('pending_decisions')
      expect(res.partialGraph.provenance.pii_scrubbed).toBe(true)
    }
    expectErrorCode(() => (res as any).graph, 'E_DECISION_REQUIRED')
  })

  it('10. Detecta padrão em lote e emite W_BATCH_PATTERN_IGNORED', () => {
    const trace = loadGoldenTrace('lancar_falta.trace.json')
    trace.steps.splice(2, 0, {
      id: 's2_extra',
      at: 1775865601500,
      frame_path: '/',
      host: 'portal.escola.com',
      path: '/frequencia',
      kind: 'check',
      checked: true,
      descriptor: (trace.steps[1] as any).descriptor,
    })

    const decisions: CompilerDecisions = {
      task_id: 'lancar_falta',
      portal_id: 'portal_escola',
      task_name: 'Lançar Falta',
      allowed_hosts: ['portal.escola.com'],
      attendance_polarity: 'checked_is_present',
    }

    const { report } = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(report.warnings.some((w) => w.code === 'W_BATCH_PATTERN_IGNORED')).toBe(true)
  })

  it('11. (G5.3) Compilar fluxo sem controle de frequência/nota não exige polaridade', () => {
    const trace: Trace = {
      trace_version: '1.0',
      task_id: 'custom:registrar-aula',
      started_at: 1775865600000,
      initial_url: 'http://portal.escola.com/diario',
      steps: [
        {
          id: 's1',
          at: 1775865600100,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/diario',
          kind: 'navigate',
          url: 'http://portal.escola.com/diario',
        },
        {
          id: 's2',
          at: 1775865600200,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/diario',
          kind: 'input',
          value: 'Conteúdo sobre frações',
          descriptor: { tag: 'textarea', id: 'conteudo_aula', aria_label: 'Conteúdo da Aula', classes: [] },
        },
        {
          id: 's3',
          at: 1775865600300,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/diario',
          kind: 'click',
          descriptor: { tag: 'button', text: 'Gravar Aula', role: 'button', classes: [] },
        },
      ],
    }

    const decisions: CompilerDecisions = {
      task_id: 'custom:registrar-aula',
      portal_id: 'portal_escola',
      task_name: 'Registrar Aula',
      allowed_hosts: ['portal.escola.com'],
    }

    const { graph, report } = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(report.valid).toBe(true)
    expect(graph.identity.task_id).toBe('custom:registrar-aula')
    expect(graph.params['texto']).toBeDefined()
    expect(graph.params['texto'].type).toBe('string')
    expect(graph.nodes.n2.type).toBe('CHECKPOINT')
    expect(graph.nodes.n3.type).toBe('WRITE')
    const writeNode = graph.nodes.n3 as any
    expect(writeNode.semantic).toBe('text')
    expect(writeNode.value).toEqual({ param: 'texto' })
  })

  it('12. Compila trace de navegação pura (cliques de menu sem escrita) como side_effect_level: read com nós NAVIGATE + CLICK', () => {
    const trace: Trace = {
      trace_version: '1.0',
      task_id: 'custom:nav-boletim',
      started_at: 1775865600000,
      initial_url: 'http://portal.escola.com/painel',
      page_digest: {
        host: 'portal.escola.com',
        path: '/painel',
        title: 'Boletim',
        headings: [],
        table_headers: [],
        form_labels: [],
        counts: { tables: 0, rows: 0 },
        landmarks: [],
      },
      steps: [
        {
          id: 's1',
          at: 1775865600100,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/painel',
          kind: 'click',
          descriptor: {
            tag: 'a',
            text: 'Frequência Escolar',
            classes: [],
            candidates: [{ strategy: 'text', text: 'Frequência Escolar', match: 'normalized' }],
          },
        },
      ],
    }

    const decisions: CompilerDecisions = {
      task_id: 'custom:nav-boletim',
      portal_id: 'portal_escola',
      task_name: 'Acessar Frequência Escolar',
      task_description: 'Navega para a aba Frequência Escolar',
      allowed_hosts: ['portal.escola.com'],
    }

    const res = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(res.status).toBe('compiled')
    const { graph, report } = res as any
    expect(report.valid).toBe(true)
    expect(graph.safety.side_effect_level).toBe('read')
    expect(graph.nodes.n1.type).toBe('NAVIGATE')
    expect(graph.nodes.n2.type).toBe('CLICK')
    expect((graph.nodes.n2 as any).expect_navigation).toBe(true)
    expect(validateGraph(graph).valid).toBe(true)
  })

  it('13. Compila formulário multi-campos distintos gerando múltiplos nós WRITE após o CHECKPOINT', () => {
    const trace: Trace = {
      trace_version: '1.0',
      task_id: 'custom:plano-completo',
      started_at: 1775865600000,
      initial_url: 'http://portal.escola.com/plano',
      steps: [
        {
          id: 's1',
          at: 1775865600100,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/plano',
          kind: 'navigate',
          url: 'http://portal.escola.com/plano',
        },
        {
          id: 's2',
          at: 1775865600200,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/plano',
          kind: 'input',
          value: 'Frações Equivalentes',
          descriptor: { tag: 'input', id: 'titulo_aula', aria_label: 'Título da Aula', classes: [] },
        },
        {
          id: 's3',
          at: 1775865600300,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/plano',
          kind: 'input',
          value: 'Exercícios práticos do capítulo 4',
          descriptor: { tag: 'textarea', id: 'conteudo_aula', aria_label: 'Conteúdo da Aula', classes: [] },
        },
        {
          id: 's4',
          at: 1775865600400,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/plano',
          kind: 'click',
          is_submit_action: true,
          descriptor: { tag: 'button', text: 'Salvar Plano', role: 'button', classes: [] },
        },
      ],
    }

    const decisions: CompilerDecisions = {
      task_id: 'custom:plano-completo',
      portal_id: 'portal_escola',
      task_name: 'Registrar Plano Completo',
      allowed_hosts: ['portal.escola.com'],
    }

    const { graph, report } = compile(trace, decisions, { clock: FIXED_CLOCK })
    expect(report.valid).toBe(true)
    expect(report.warnings.some((w) => w.code === 'W_BATCH_PATTERN_IGNORED')).toBe(false)
    const writeNodes = Object.values(graph.nodes).filter((n) => n.type === 'WRITE')
    expect(writeNodes).toHaveLength(2)
    expect(validateGraph(graph).valid).toBe(true)
  })

  it('14. Retoma rascunho pending_decisions de frequência e de nota quando a professora responde as decisões', () => {
    const attTrace = loadGoldenTrace('lancar_falta.trace.json')
    const pendingAtt = compile(attTrace, {
      task_id: 'lancar_falta',
      portal_id: 'portal_escola',
      task_name: 'Lançar Falta',
      allowed_hosts: ['portal.escola.com'],
    })
    expect(pendingAtt.status).toBe('needs_decisions')
    if (pendingAtt.status === 'needs_decisions') {
      const completedAtt = compile(pendingAtt.partialGraph.sanitized_trace, {
        ...(pendingAtt.partialGraph.decisions_snapshot as CompilerDecisions),
        attendance_polarity: 'checked_is_absent',
      }, { clock: FIXED_CLOCK })
      expect(completedAtt.status).toBe('compiled')
      expect(validateGraph(completedAtt.graph).valid).toBe(true)
    }

    const gradeTrace = loadGoldenTrace('lancar_nota.trace.json')
    const pendingGrade = compile(gradeTrace, {
      task_id: 'lancar_nota',
      portal_id: 'portal_escola',
      task_name: 'Lançar Nota',
      allowed_hosts: ['portal.escola.com'],
    })
    expect(pendingGrade.status).toBe('needs_decisions')
    if (pendingGrade.status === 'needs_decisions') {
      expect(pendingGrade.decisions.map((d) => d.key)).toEqual(['grade_scale'])
      const completedGrade = compile(pendingGrade.partialGraph.sanitized_trace, {
        ...(pendingGrade.partialGraph.decisions_snapshot as CompilerDecisions),
        grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
      }, { clock: FIXED_CLOCK })
      expect(completedGrade.status).toBe('compiled')
      expect(validateGraph(completedGrade.graph).valid).toBe(true)
    }
  })

  it('15. Compila trace com seleção de filtro (<select>) e clique sem divergência de side_effect_level', () => {
    const selectTrace: Trace = {
      trace_version: '1.0',
      task_id: 'custom:nav-7-ano',
      started_at: 1775865600000,
      initial_url: 'http://portal.escola.com/frequencia',
      steps: [
        {
          id: 's1',
          at: 1775865600100,
          frame_path: '/',
          host: 'portal.escola.com',
          path: '/frequencia',
          kind: 'select',
          value: '7A',
          text: '7º Ano A',
          descriptor: {
            tag: 'select',
            id: 'filtro_turma',
            aria_label: 'Selecione uma turma',
            classes: [],
            candidates: [{ strategy: 'css', selector: '#filtro_turma' }],
          },
        },
      ],
    }
    const res = compile(selectTrace, {
      task_id: 'custom:nav-7-ano',
      portal_id: 'portal_escola',
      task_name: 'Filtrar 7º Ano A',
      allowed_hosts: ['portal.escola.com'],
    }, { clock: FIXED_CLOCK })
    expect(res.status).toBe('compiled')
    expect(validateGraph(res.graph).valid).toBe(true)
    expect(res.graph.safety.side_effect_level).toBe('write')
  })
})
