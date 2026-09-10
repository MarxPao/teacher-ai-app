import { describe, it, expect, vi } from 'vitest'
import { executeSkillGraph, DomProvider } from '../lib/skills/graphExecutor'
import { SkillGraph } from '../lib/skills/skillGraphSchema'

describe('GraphExecutor — Interação Real e Verificação Sistêmica (Anti-Recorrência)', () => {
  it('WRITE: deve marcar SUCCESS e verified: true quando o valor é lido de volta com sucesso', async () => {
    let internalValue = ''
    const mockInput = {
      get value() { return internalValue },
      set value(v) { internalValue = v },
      focus: vi.fn(),
      dispatchEvent: vi.fn(),
    }

    const domProvider: DomProvider = {
      querySelector: (sel) => sel === '#nota' ? mockInput : null,
      querySelectorAll: () => [],
    }

    const graph: SkillGraph = {
      id: 'test_write_success',
      name: 'Teste de Escrita Real',
      portal_id: 'portal_teste',
      task_id: 'task_write',
      version: 1,
      entry_node: 'cp_1',
      nodes: {
        cp_1: {
          id: 'cp_1',
          type: 'CHECKPOINT',
          params: { description: 'Autorizar nota' },
          on_success: 'write_1',
        },
        write_1: {
          id: 'write_1',
          type: 'WRITE',
          anchor: { strategy: 'css_selector', value: '#nota' },
          params: { action_value: '9.5' },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
      onCheckpoint: async () => true,
    })

    expect(result.success).toBe(true)
    const writeStep = result.trace.find(s => s.nodeId === 'write_1')
    expect(writeStep).toBeDefined()
    expect(writeStep?.status).toBe('SUCCESS')
    expect(writeStep?.verified).toBe(true)
    expect(writeStep?.verification_method).toBe('read_back_input_value')
    expect(internalValue).toBe('9.5')
  })

  it('WRITE: deve marcar FAILED e verified: false quando o valor gravado não persiste (read-back mismatch)', async () => {
    // Simula um campo travado/bloqueado que rejeita a escrita
    const mockLockedInput = {
      get value() { return 'valor_antigo' },
      set value(_v) { /* ignora */ },
      focus: vi.fn(),
      dispatchEvent: vi.fn(),
    }

    const domProvider: DomProvider = {
      querySelector: (sel) => sel === '#bloqueado' ? mockLockedInput : null,
    }

    const graph: SkillGraph = {
      id: 'test_write_mismatch',
      name: 'Teste Escrita com Rejeição',
      portal_id: 'portal_teste',
      task_id: 'task_mismatch',
      version: 1,
      entry_node: 'cp_1',
      nodes: {
        cp_1: {
          id: 'cp_1',
          type: 'CHECKPOINT',
          params: { description: 'Autorizar escrita' },
          on_success: 'write_1',
        },
        write_1: {
          id: 'write_1',
          type: 'WRITE',
          anchor: { strategy: 'css_selector', value: '#bloqueado' },
          params: { action_value: 'novo_valor' },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
      onCheckpoint: async () => true,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('FAILED')
    const writeStep = result.trace.find(s => s.nodeId === 'write_1')
    expect(writeStep?.status).toBe('FAILED')
    expect(writeStep?.verified).toBe(false)
    expect(writeStep?.verification_method).toBe('read_back_input_value')
    expect(writeStep?.details?.error).toContain('Valor escrito não persistiu no elemento')
  })

  it('CLICK: deve marcar SUCCESS e verified: true ao detectar mutação observável (ex: desabilitação pós clique)', async () => {
    const mockButton = {
      textContent: 'Gravar',
      disabled: false,
      click() { this.disabled = true },
    }

    const domProvider: DomProvider = {
      querySelector: (sel) => sel === '#btn-salvar' ? mockButton : null,
      querySelectorAll: () => [mockButton],
    }

    const graph: SkillGraph = {
      id: 'test_click_mutation',
      name: 'Teste Clique Mutação',
      portal_id: 'portal_teste',
      task_id: 'task_click',
      version: 1,
      entry_node: 'cp_1',
      nodes: {
        cp_1: {
          id: 'cp_1',
          type: 'CHECKPOINT',
          params: { description: 'Confirmar clique' },
          on_success: 'click_1',
        },
        click_1: {
          id: 'click_1',
          type: 'CLICK',
          anchor: { strategy: 'css_selector', value: '#btn-salvar' },
          params: { is_submit_action: true },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
      onCheckpoint: async () => true,
    })

    expect(result.success).toBe(true)
    const clickStep = result.trace.find(s => s.nodeId === 'click_1')
    expect(clickStep?.status).toBe('SUCCESS')
    expect(clickStep?.verified).toBe(true)
    expect(clickStep?.verification_method).toBe('element_state_mutated')
  })

  it('CLICK: deve marcar FAILED e verified: false quando a ação de submit não produz mutação observável', async () => {
    // Botão estático que não faz nada nem altera URL
    const mockStaticButton = {
      textContent: 'Gravar Fake',
      disabled: false,
      className: 'btn',
      click() { /* sem efeito observável */ },
    }

    const domProvider: DomProvider = {
      querySelector: (sel) => sel === '#btn-fake' ? mockStaticButton : null,
      querySelectorAll: () => [mockStaticButton],
    }

    const graph: SkillGraph = {
      id: 'test_click_no_effect',
      name: 'Teste Clique Sem Efeito',
      portal_id: 'portal_teste',
      task_id: 'task_click_fail',
      version: 1,
      entry_node: 'cp_1',
      nodes: {
        cp_1: {
          id: 'cp_1',
          type: 'CHECKPOINT',
          params: { description: 'Confirmar submit' },
          on_success: 'click_1',
        },
        click_1: {
          id: 'click_1',
          type: 'CLICK',
          anchor: { strategy: 'css_selector', value: '#btn-fake' },
          params: { is_submit_action: true },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
      onCheckpoint: async () => true,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('FAILED')
    const clickStep = result.trace.find(s => s.nodeId === 'click_1')
    expect(clickStep?.status).toBe('FAILED')
    expect(clickStep?.verified).toBe(false)
    expect(clickStep?.verification_method).toBe('submit_no_observable_change')
  })

  it('NAVIGATE: deve marcar FAILED e verified: false quando a URL destino não confere (ex: redirecionamento para login)', async () => {
    let currentUrl = 'https://portal.exemplo.com/login'
    const domProvider: DomProvider = {
      navigate: async (_target) => {
        // Simula redirecionamento pelo servidor para login devido a sessão expirada
        currentUrl = 'https://portal.exemplo.com/login'
      },
      getCurrentUrl: () => currentUrl,
    }

    const graph: SkillGraph = {
      id: 'test_navigate_redirect',
      name: 'Teste Navegação com Redirecionamento',
      portal_id: 'portal_teste',
      task_id: 'task_nav_redirect',
      version: 1,
      entry_node: 'nav_1',
      nodes: {
        nav_1: {
          id: 'nav_1',
          type: 'NAVIGATE',
          anchor: { strategy: 'css_selector', value: 'https://portal.exemplo.com/painel_seguro' },
          params: {},
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('FAILED')
    const navStep = result.trace.find(s => s.nodeId === 'nav_1')
    expect(navStep?.status).toBe('FAILED')
    expect(navStep?.verified).toBe(false)
    expect(navStep?.verification_method).toBe('url_changed_or_matched')
    expect(navStep?.details?.expectedUrl).toBe('https://portal.exemplo.com/painel_seguro')
    expect(navStep?.details?.actualUrl).toBe('https://portal.exemplo.com/login')
  })

  it('NAVIGATE: deve marcar SUCCESS e verified: true quando a URL pós-navegação corresponde ao esperado', async () => {
    let currentUrl = 'https://portal.exemplo.com/login'
    const domProvider: DomProvider = {
      navigate: async (target) => {
        currentUrl = target
      },
      getCurrentUrl: () => currentUrl,
    }

    const graph: SkillGraph = {
      id: 'test_navigate_ok',
      name: 'Teste Navegação OK',
      portal_id: 'portal_teste',
      task_id: 'task_nav_ok',
      version: 1,
      entry_node: 'nav_1',
      nodes: {
        nav_1: {
          id: 'nav_1',
          type: 'NAVIGATE',
          anchor: { strategy: 'css_selector', value: 'https://portal.exemplo.com/dashboard' },
          params: {},
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
    })

    expect(result.success).toBe(true)
    const navStep = result.trace.find(s => s.nodeId === 'nav_1')
    expect(navStep?.status).toBe('SUCCESS')
    expect(navStep?.verified).toBe(true)
    expect(navStep?.verification_method).toBe('url_changed_or_matched')
  })

  // ── ITEM 1: FALLBACK NUNCA MARCA SUCCESS ─────────────────────────────────

  it('FALLBACK: tipo de nó não implementado/desconhecido deve marcar FAILED e verified: false', async () => {
    const graph: any = {
      id: 'test_unknown_fallback',
      name: 'Teste Fallback Desconhecido',
      portal_id: 'portal_teste',
      task_id: 'task_unknown',
      version: 1,
      entry_node: 'custom_node',
      nodes: {
        custom_node: {
          id: 'custom_node',
          type: 'FUTURE_EXPERIMENTAL_ACTION',
          anchor: { strategy: 'css_selector', value: '#custom' },
          params: {},
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const validatorModule = await import('../lib/skills/graphValidator')
    const spy = vi.spyOn(validatorModule, 'validateSkillGraph').mockReturnValue({
      valid: true,
      safe: true,
      errors: [],
      warnings: [],
    })

    try {
      const result = await executeSkillGraph(graph, { bindings: {} })

      expect(result.success).toBe(false)
      expect(result.status).toBe('FAILED')
      const step = result.trace.find(s => s.nodeId === 'custom_node')
      expect(step).toBeDefined()
      expect(step?.status).toBe('FAILED')
      expect(step?.verified).toBe(false)
      expect(step?.verification_method).toBe('unverified_fallback_contract')
      expect(step?.details?.error).toContain('não possui rotina de verificação observável implementada')
    } finally {
      spy.mockRestore()
    }
  })

  // ── ITEM 2: LOCATE COM RESOLVEDCOUNT 0 ───────────────────────────────────

  it('LOCATE (single): deve marcar FAILED e verified: false quando resolvedCount for 0', async () => {
    const domProvider: DomProvider = {
      querySelectorAll: () => [],
    }

    const graph: SkillGraph = {
      id: 'test_locate_single_zero',
      name: 'Teste Locate Single Zero',
      portal_id: 'portal_teste',
      task_id: 'task_locate_zero',
      version: 1,
      entry_node: 'loc_single',
      nodes: {
        loc_single: {
          id: 'loc_single',
          type: 'LOCATE',
          anchor: { strategy: 'css_selector', value: 'table.inexistente tr' },
          params: {}, // multiplicity não definido -> single por default
          on_success: 'cp_subsequente',
        },
        cp_subsequente: {
          id: 'cp_subsequente',
          type: 'CHECKPOINT',
          params: { description: 'Nunca deve ser atingido' },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const onCheckpointMock = vi.fn().mockResolvedValue(true)
    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
      onCheckpoint: onCheckpointMock,
    })

    // 1. Deve falhar imediatamente sem avançar para o checkpoint
    expect(result.success).toBe(false)
    expect(result.status).toBe('FAILED')
    expect(onCheckpointMock).not.toHaveBeenCalled()

    const step = result.trace.find(s => s.nodeId === 'loc_single')
    expect(step).toBeDefined()
    expect(step?.status).toBe('FAILED')
    expect(step?.verified).toBe(false)
    expect(step?.verification_method).toBe('element_resolution')
    expect(step?.details?.resolvedCount).toBe(0)
    expect(step?.details?.error).toContain('Nenhum elemento localizado para o seletor')
  })

  it('LOCATE (single): deve marcar SUCCESS quando allow_empty: true for explicitado mesmo com 0 elementos', async () => {
    const domProvider: DomProvider = {
      querySelectorAll: () => [],
    }

    const graph: SkillGraph = {
      id: 'test_locate_single_allow_empty',
      name: 'Teste Locate Single Allow Empty',
      portal_id: 'portal_teste',
      task_id: 'task_locate_allow_empty',
      version: 1,
      entry_node: 'loc_empty_ok',
      nodes: {
        loc_empty_ok: {
          id: 'loc_empty_ok',
          type: 'LOCATE',
          anchor: { strategy: 'css_selector', value: '.opcional' },
          params: { allow_empty: true },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('COMPLETED')
    const step = result.trace.find(s => s.nodeId === 'loc_empty_ok')
    expect(step?.status).toBe('SUCCESS')
    expect(step?.verified).toBe(true)
    expect(step?.details?.resolvedCount).toBe(0)
  })

  it('LOCATE (multiplicity: "all"): deve marcar SUCCESS por padrão com 0 elementos (turma vazia legítima)', async () => {
    const domProvider: DomProvider = {
      querySelectorAll: () => [],
    }

    const graph: SkillGraph = {
      id: 'test_locate_all_empty_default',
      name: 'Teste Locate All Empty Default',
      portal_id: 'portal_teste',
      task_id: 'task_locate_all_empty',
      version: 1,
      entry_node: 'loc_all',
      nodes: {
        loc_all: {
          id: 'loc_all',
          type: 'LOCATE',
          anchor: { strategy: 'css_selector', value: 'table tbody tr' },
          params: { multiplicity: 'all' },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('COMPLETED')
    const step = result.trace.find(s => s.nodeId === 'loc_all')
    expect(step?.status).toBe('SUCCESS')
    expect(step?.verified).toBe(true)
    expect(step?.details?.resolvedCount).toBe(0)
    expect(step?.details?.multiplicity).toBe('all')
  })

  it('LOCATE (multiplicity: "all"): deve marcar FAILED quando allow_empty: false for explicitado e houver 0 elementos', async () => {
    const domProvider: DomProvider = {
      querySelectorAll: () => [],
    }

    const graph: SkillGraph = {
      id: 'test_locate_all_strict',
      name: 'Teste Locate All Strict Require Items',
      portal_id: 'portal_teste',
      task_id: 'task_locate_all_strict',
      version: 1,
      entry_node: 'loc_all_strict',
      nodes: {
        loc_all_strict: {
          id: 'loc_all_strict',
          type: 'LOCATE',
          anchor: { strategy: 'css_selector', value: 'table tbody tr' },
          params: { multiplicity: 'all', allow_empty: false },
          on_success: undefined,
        },
      },
      metadata: { success_rate: 100, total_executions: 0, created_at: '', updated_at: '', has_self_healed: false, author: 'test' },
    }

    const result = await executeSkillGraph(graph, {
      bindings: {},
      domProvider,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('FAILED')
    const step = result.trace.find(s => s.nodeId === 'loc_all_strict')
    expect(step?.status).toBe('FAILED')
    expect(step?.verified).toBe(false)
    expect(step?.details?.resolvedCount).toBe(0)
    expect(step?.details?.error).toContain('Nenhum elemento localizado para o seletor')
  })
})
