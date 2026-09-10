import { describe, it, expect, vi } from 'vitest'
import { SkillGraph } from '../lib/skills/skillGraphSchema'
import { validateSkillGraph } from '../lib/skills/graphValidator'
import { executeSkillGraph, SecurityAssertionError, DomProvider } from '../lib/skills/graphExecutor'

describe('Portal Skill Engine — Fundação do Grafo (Lote 1 & 1.1)', () => {
  // ── FIXTURES DE TESTE ORIGINAIS (LOTE 1) ───────────────────────────────────

  // 1. Grafo malicioso / inseguro: Tenta escrever sem nenhum CHECKPOINT
  const maliciousDirectWriteGraph: SkillGraph = {
    id: 'skill_insegura_direta',
    name: 'Escrita Direta sem Confirmação',
    portal_id: 'machado_sobrinho',
    task_id: 'lancar_falta_furtiva',
    version: 1,
    entry_node: 'nav_diario',
    nodes: {
      nav_diario: {
        id: 'nav_diario',
        type: 'NAVIGATE',
        params: {},
        on_success: 'write_falta',
      },
      write_falta: {
        id: 'write_falta',
        type: 'WRITE',
        anchor: { strategy: 'css_selector', value: '#input-falta' },
        params: { action_value: 'F' },
        on_success: 'click_salvar',
      },
      click_salvar: {
        id: 'click_salvar',
        type: 'CLICK',
        anchor: { strategy: 'text_match', value: 'Salvar' },
        params: { is_submit_action: true },
        on_success: undefined,
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // 2. Grafo com bypass por Branch: um caminho passa pelo checkpoint, mas o outro desvia
  const bypassBranchGraph: SkillGraph = {
    id: 'skill_bypass_branch',
    name: 'Bypass de Checkpoint via Bifurcação',
    portal_id: 'machado_sobrinho',
    task_id: 'lancar_nota_bypass',
    version: 1,
    entry_node: 'check_role',
    nodes: {
      check_role: {
        id: 'check_role',
        type: 'BRANCH',
        params: { condition: 'is_admin' },
        on_success: 'write_nota_direto', // BYPASS! Não passa por checkpoint!
        on_fail: 'ask_approval',
      },
      ask_approval: {
        id: 'ask_approval',
        type: 'CHECKPOINT',
        params: { description: 'Lançar nota para {aluno}' },
        on_success: 'write_nota_direto',
      },
      write_nota_direto: {
        id: 'write_nota_direto',
        type: 'WRITE',
        anchor: { strategy: 'aria_label', value: 'Nota Bimestre' },
        params: { action_value: '{nota}' },
        on_success: undefined,
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // 3. Grafo com nós apontando para destinos inexistentes
  const brokenLinksGraph: SkillGraph = {
    id: 'skill_broken_links',
    name: 'Grafo com Nós Inexistentes',
    portal_id: 'machado_sobrinho',
    task_id: 'broken_task',
    version: 1,
    entry_node: 'start_node',
    nodes: {
      start_node: {
        id: 'start_node',
        type: 'NAVIGATE',
        params: {},
        on_success: 'non_existent_node_xyz',
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // 4. Grafo seguro e válido de Escrita com CHECKPOINT mandatório
  const safeWriteGraph: SkillGraph = {
    id: 'skill_lancar_falta_segura',
    name: 'Lançar Falta com Confirmação Humana',
    portal_id: 'machado_sobrinho',
    task_id: 'lancar_falta',
    version: 1,
    entry_node: 'nav_diario',
    nodes: {
      nav_diario: {
        id: 'nav_diario',
        type: 'NAVIGATE',
        params: {},
        on_success: 'locate_aluno',
      },
      locate_aluno: {
        id: 'locate_aluno',
        type: 'LOCATE',
        anchor: { strategy: 'text_match', value: '{aluno}' },
        params: {},
        on_success: 'cp_confirmar_falta',
      },
      cp_confirmar_falta: {
        id: 'cp_confirmar_falta',
        type: 'CHECKPOINT',
        params: {
          description: 'Confirmar lançamento de falta para {aluno} no dia {data}',
        },
        on_success: 'write_falta_aluno',
      },
      write_falta_aluno: {
        id: 'write_falta_aluno',
        type: 'WRITE',
        anchor: { strategy: 'css_selector', value: 'input[name="presenca"]' },
        params: { action_value: 'F' },
        on_success: 'click_salvar_chamada',
      },
      click_salvar_chamada: {
        id: 'click_salvar_chamada',
        type: 'CLICK',
        anchor: { strategy: 'aria_label', value: 'Salvar Diário' },
        params: { is_submit_action: true },
        on_success: undefined,
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // ── FIXTURES DE TESTE (LOTE 1.1: CASOS DE BORDA E TOPOLOGIA) ───────────────

  // 5. Caso Positivo sem CHECKPOINT: Grafo puramente de leitura (sem WRITE nem CLICK submit)
  const readOnlyRosterGraph: SkillGraph = {
    id: 'skill_leitura_roster',
    name: 'Leitura de Lista de Alunos',
    portal_id: 'machado_sobrinho',
    task_id: 'read_roster',
    version: 1,
    entry_node: 'nav_turma',
    nodes: {
      nav_turma: {
        id: 'nav_turma',
        type: 'NAVIGATE',
        params: {},
        on_success: 'click_tab_alunos',
      },
      click_tab_alunos: {
        id: 'click_tab_alunos',
        type: 'CLICK',
        anchor: { strategy: 'text_match', value: 'Alunos' },
        params: { is_submit_action: false }, // Clique de navegação benigno
        on_success: 'locate_tabela',
      },
      locate_tabela: {
        id: 'locate_tabela',
        type: 'LOCATE',
        anchor: { strategy: 'css_selector', value: 'table#alunos' },
        params: {},
        on_success: 'read_linha',
      },
      read_linha: {
        id: 'read_linha',
        type: 'READ',
        anchor: { strategy: 'css_selector', value: 'tr.aluno-row' },
        params: {},
        on_success: 'loop_proxima_pagina',
      },
      loop_proxima_pagina: {
        id: 'loop_proxima_pagina',
        type: 'LOOP',
        params: { loop_target: 'nav_turma' },
        on_success: undefined,
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // 6. Nó CLICK sem o campo 'is_submit_action' explicitamente definido
  const unclassifiedClickGraph: SkillGraph = {
    id: 'skill_unclassified_click',
    name: 'Click sem Classificação Explícita',
    portal_id: 'machado_sobrinho',
    task_id: 'unclassified_task',
    version: 1,
    entry_node: 'click_ambiguo',
    nodes: {
      click_ambiguo: {
        id: 'click_ambiguo',
        type: 'CLICK',
        anchor: { strategy: 'text_match', value: 'Botão Desconhecido' },
        params: {}, // ausência proposital de is_submit_action
        on_success: undefined,
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // 7. Topologia Diamante / LOOP com BRANCH interno SEGURO (Ramo B passa por CHECKPOINT)
  const safeDiamondLoopGraph: SkillGraph = {
    id: 'skill_safe_diamond_loop',
    name: 'Lançar Falta com Loop e Branch Seguro',
    portal_id: 'machado_sobrinho',
    task_id: 'loop_falta_seguro',
    version: 1,
    entry_node: 'loop_alunos',
    nodes: {
      loop_alunos: {
        id: 'loop_alunos',
        type: 'LOOP',
        params: {},
        on_success: 'branch_tem_falta',
        on_fail: undefined,
      },
      branch_tem_falta: {
        id: 'branch_tem_falta',
        type: 'BRANCH',
        params: { condition: 'ja_tem_falta' },
        on_success: 'loop_alunos', // Ramo A: já tem falta, volta pro loop sem escrever
        on_fail: 'cp_confirmar_falta_loop', // Ramo B: não tem falta, passa por CHECKPOINT
      },
      cp_confirmar_falta_loop: {
        id: 'cp_confirmar_falta_loop',
        type: 'CHECKPOINT',
        params: { description: 'Lançar falta para {aluno}' },
        on_success: 'write_falta_loop',
      },
      write_falta_loop: {
        id: 'write_falta_loop',
        type: 'WRITE',
        anchor: { strategy: 'css_selector', value: 'input.falta' },
        params: { action_value: 'F' },
        on_success: 'click_submit_loop',
      },
      click_submit_loop: {
        id: 'click_submit_loop',
        type: 'CLICK',
        anchor: { strategy: 'text_match', value: 'Gravar' },
        params: { is_submit_action: true },
        on_success: 'loop_alunos',
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // 8. Topologia Diamante / LOOP com BRANCH interno INSEGURO (Ramo B pula CHECKPOINT)
  const unsafeDiamondLoopGraph: SkillGraph = {
    id: 'skill_unsafe_diamond_loop',
    name: 'Bypass de Checkpoint dentro de Loop Diamante',
    portal_id: 'machado_sobrinho',
    task_id: 'loop_falta_inseguro',
    version: 1,
    entry_node: 'loop_alunos',
    nodes: {
      loop_alunos: {
        id: 'loop_alunos',
        type: 'LOOP',
        params: {},
        on_success: 'branch_tem_falta',
        on_fail: undefined,
      },
      branch_tem_falta: {
        id: 'branch_tem_falta',
        type: 'BRANCH',
        params: { condition: 'ja_tem_falta' },
        on_success: 'loop_alunos', // Ramo A: pula
        on_fail: 'write_falta_direto', // Ramo B: PULA O CHECKPOINT DIRETO PARA O WRITE!
      },
      cp_confirmar_falta_loop: {
        id: 'cp_confirmar_falta_loop',
        type: 'CHECKPOINT',
        params: { description: 'Lançar falta para {aluno}' },
        on_success: 'write_falta_direto',
      },
      write_falta_direto: {
        id: 'write_falta_direto',
        type: 'WRITE',
        anchor: { strategy: 'css_selector', value: 'input.falta' },
        params: { action_value: 'F' },
        on_success: 'click_submit_loop',
      },
      click_submit_loop: {
        id: 'click_submit_loop',
        type: 'CLICK',
        anchor: { strategy: 'text_match', value: 'Gravar' },
        params: { is_submit_action: true },
        on_success: 'loop_alunos',
      },
    },
    metadata: {
      success_rate: 100,
      total_executions: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_self_healed: false,
      author: 'test_suite',
    },
  }

  // ── TESTES ESTÁTICOS DE SEGURANÇA ──────────────────────────────────────────

  it('deve REJEITAR estaticamente grafo com WRITE/CLICK(submit) sem nó CHECKPOINT', () => {
    const result = validateSkillGraph(maliciousDirectWriteGraph)
    expect(result.valid).toBe(false)
    expect(result.safe).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('VIOLAÇÃO DE SEGURANÇA: O grafo contém ações de escrita/submissão')
    expect(result.errors[0]).toContain("mas NENHUM nó do tipo 'CHECKPOINT' foi declarado")
  })

  it('deve REJEITAR estaticamente grafo com bifurcação (BRANCH) que contorna o CHECKPOINT', () => {
    const result = validateSkillGraph(bypassBranchGraph)
    expect(result.valid).toBe(false)
    expect(result.safe).toBe(false)
    expect(result.errors.some((err) => err.includes('pode ser alcançado sem passar por um CHECKPOINT prévio'))).toBe(true)
    expect(result.errors.some((err) => err.includes('check_role -> write_nota_direto'))).toBe(true)
  })

  it('deve REJEITAR estaticamente grafo com referências a nós inexistentes', () => {
    const result = validateSkillGraph(brokenLinksGraph)
    expect(result.valid).toBe(false)
    expect(result.errors.some((err) => err.includes('on_success aponta para nó inexistente "non_existent_node_xyz"'))).toBe(true)
  })

  it('deve APROVAR grafo seguro que possui nó CHECKPOINT antes de qualquer WRITE/CLICK', () => {
    const result = validateSkillGraph(safeWriteGraph)
    expect(result.valid).toBe(true)
    expect(result.safe).toBe(true)
    expect(result.errors).toEqual([])
  })

  // ── NOVOS TESTES (LOTE 1.1: LACUNAS DE VERIFICAÇÃO) ────────────────────────

  it('deve APROVAR grafo somente leitura (sem WRITE/CLICK submit) mesmo sem nó CHECKPOINT', () => {
    const result = validateSkillGraph(readOnlyRosterGraph)
    expect(result.valid).toBe(true)
    expect(result.safe).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('deve REJEITAR grafo com nó CLICK sem declaração explícita de is_submit_action (postura fail-safe)', () => {
    const result = validateSkillGraph(unclassifiedClickGraph)
    expect(result.valid).toBe(false)
    expect(result.safe).toBe(false)
    expect(
      result.errors.some((err) =>
        err.includes("deve declarar explicitamente o campo 'is_submit_action'")
      )
    ).toBe(true)
  })

  it('deve APROVAR grafo com topologia diamante/LOOP quando o ramo de escrita passa por CHECKPOINT', () => {
    const result = validateSkillGraph(safeDiamondLoopGraph)
    expect(result.valid).toBe(true)
    expect(result.safe).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('deve REJEITAR grafo com topologia diamante/LOOP quando o ramo de escrita contorna o CHECKPOINT', () => {
    const result = validateSkillGraph(unsafeDiamondLoopGraph)
    expect(result.valid).toBe(false)
    expect(result.safe).toBe(false)
    expect(result.errors.some((err) => err.includes('pode ser alcançado sem passar por um CHECKPOINT prévio'))).toBe(true)
    expect(
      result.errors.some((err) =>
        err.includes('loop_alunos -> branch_tem_falta -> write_falta_direto')
      )
    ).toBe(true)
  })

  // ── TESTES DE RUNTIME DO EXECUTOR ──────────────────────────────────────────

  it('deve PAUSAR em CHECKPOINT, gerar preview legível e avançar após aprovação explícita', async () => {
    const onCheckpointMock = vi.fn().mockResolvedValue(true)

    const mockInput = { value: '', focus: vi.fn(), dispatchEvent: vi.fn() }
    const mockButton = { textContent: 'Salvar Diário', disabled: false, click: () => { mockButton.disabled = true } }
    const domProvider: DomProvider = {
      querySelector: (sel: string) => {
        if (sel === 'input[name="presenca"]') return mockInput
        if (sel === 'Salvar Diário') return mockButton
        return null
      },
      querySelectorAll: () => [mockButton],
    }

    const result = await executeSkillGraph(safeWriteGraph, {
      bindings: {
        aluno: 'Rafael Machado',
        data: '06/09/2026',
      },
      onCheckpoint: onCheckpointMock,
      domProvider,
    })

    expect(onCheckpointMock).toHaveBeenCalledTimes(1)
    const previewArg = onCheckpointMock.mock.calls[0][0]

    expect(previewArg.description).toBe('Confirmar lançamento de falta para Rafael Machado no dia 06/09/2026')
    expect(previewArg.resolvedBindings.aluno).toBe('Rafael Machado')
    expect(previewArg.resolvedBindings.data).toBe('06/09/2026')
    expect(previewArg.nextRiskNodeId).toBe('write_falta_aluno')

    expect(result.success).toBe(true)
    expect(result.status).toBe('COMPLETED')

    const checkpointStep = result.trace.find((s) => s.nodeType === 'CHECKPOINT')
    expect(checkpointStep).toBeDefined()
    expect(checkpointStep?.status).toBe('CHECKPOINT_PAUSED')

    const writeStep = result.trace.find((s) => s.nodeType === 'WRITE')
    expect(writeStep).toBeDefined()
    expect(writeStep?.status).toBe('SUCCESS')
    expect(writeStep?.details.writtenValue).toBe('F')
  })

  it('deve ABORTAR imediatamente a execução quando o professor rejeitar no CHECKPOINT', async () => {
    const domProvider: DomProvider = {
      querySelectorAll: () => [{}],
    }
    const onCheckpointMock = vi.fn().mockResolvedValue(false)

    const result = await executeSkillGraph(safeWriteGraph, {
      bindings: {
        aluno: 'Mariana Costa',
        data: '06/09/2026',
      },
      onCheckpoint: onCheckpointMock,
      domProvider,
    })

    expect(onCheckpointMock).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.status).toBe('ABORTED_BY_USER')
    expect(result.error).toContain('Execução cancelada pelo usuário no ponto de conferência.')

    const writeStep = result.trace.find((s) => s.nodeType === 'WRITE')
    expect(writeStep).toBeUndefined()
  })

  it('deve recusar execução com SECURITY_VIOLATION se o grafo for inseguro', async () => {
    const result = await executeSkillGraph(maliciousDirectWriteGraph, {
      bindings: {},
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('SECURITY_VIOLATION')
    expect(result.error).toContain('Grafo inseguro recusado pelo validador')
    expect(result.trace).toEqual([])
  })

  it('deve disparar SecurityAssertionError em runtime se um nó de risco for atingido sem aprovação de checkpoint', async () => {
    const validatorModule = await import('../lib/skills/graphValidator')
    const spy = vi.spyOn(validatorModule, 'validateSkillGraph').mockReturnValue({
      valid: true,
      safe: true,
      errors: [],
      warnings: [],
    })

    await expect(
      executeSkillGraph(maliciousDirectWriteGraph, {
        bindings: {},
      })
    ).rejects.toThrow(SecurityAssertionError)

    spy.mockRestore()
  })
})
