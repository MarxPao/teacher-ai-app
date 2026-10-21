import { describe, it, expect } from 'vitest'
import { assembleGraph } from '@/lib/compiler/stages/assemble'
import { DesktopErrorCode } from '@/desktop/llm/llmGateway'

describe('Passo 0: Regressão do TSC e Contratos de Compilação', () => {
  it('assembleGraph não emite semantic: filter ou read_back: false em nós de filtro', () => {
    const mockTrace: any = { trace_id: 't1', steps: [] }
    const mockSegmented: any = {
      loginSteps: [],
      navigationSteps: [],
      filterStep: undefined,
      actionSteps: [
        {
          kind: 'select',
          descriptor: { selector: '#turma', aria_label: 'Turma' },
          value: '6A'
        }
      ],
      tableStep: undefined,
      submitStep: undefined
    }
    const mockDecisions: any = {
      task_id: 'read_roster',
      target: { school: 'Alpha', class_name: '6A', student_name: 'Ana' }
    }
    const mockParamContext: any = {
      placeholders: {}
    }

    const result = assembleGraph(mockTrace, mockSegmented, mockDecisions, mockParamContext)
    const writeNodes = Object.values(result.nodes).filter((n: any) => n.type === 'WRITE')
    expect(writeNodes.length).toBeGreaterThan(0)
    for (const node of writeNodes as any[]) {
      expect(node.semantic).not.toBe('filter')
      expect(['text', 'grade', 'attendance']).toContain(node.semantic)
      expect(node.read_back).toBe(true)
    }
  })

  it('DesktopErrorCode inclui o código E_LLM_ALL_FAILED', () => {
    const sampleCode: DesktopErrorCode = 'E_LLM_ALL_FAILED'
    expect(sampleCode).toBe('E_LLM_ALL_FAILED')
  })
})
