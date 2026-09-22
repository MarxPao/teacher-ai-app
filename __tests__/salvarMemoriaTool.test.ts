import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AGENT_TOOLS, TOOL_DISPLAY_NAMES } from '../lib/agentTools'
import { executeTool } from '../components/RafinhaChat'
import { getCuratedTeacherProfile } from '../lib/curatedMemory'
import { getLongTermMemories, buildLongTermMemoryContext } from '../lib/longTermMemory'

describe('Memory Engine — Fase 3: Tool Nativa salvar_memoria & Filtro de Superseding', () => {
  let localStorageStore: Record<string, string> = {}

  beforeEach(() => {
    localStorageStore = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, val: string) => { localStorageStore[key] = String(val) },
      removeItem: (key: string) => { delete localStorageStore[key] },
      clear: () => { localStorageStore = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  })

  describe('1. Catálogo e Metadados da Tool', () => {
    it('AGENT_TOOLS contém salvar_memoria com schema completo e obrigatórios', () => {
      const tool = AGENT_TOOLS.find(t => t.name === 'salvar_memoria')
      expect(tool).toBeDefined()
      expect(tool?.description).toContain('memória de longo prazo')
      expect(tool?.input_schema.required).toContain('categoria')
      expect(tool?.input_schema.required).toContain('conteudo')
      expect(tool?.input_schema.properties.categoria).toBeDefined()
      expect(tool?.input_schema.properties.conteudo).toBeDefined()
      expect(tool?.input_schema.properties.importancia).toBeDefined()
      expect(tool?.input_schema.properties.escopo).toBeDefined()
    })

    it('TOOL_DISPLAY_NAMES contém salvar_memoria com rótulo amigável e ícone', () => {
      const display = TOOL_DISPLAY_NAMES.salvar_memoria
      expect(display).toBeDefined()
      expect(display.label).toBe('Gravando Memória')
      expect(display.icon).toBe('ti-brain')
    })
  })

  describe('2. Execução via executeTool', () => {
    it('executa salvar_memoria para nova preferência e persiste no perfil', async () => {
      const res = await executeTool('salvar_memoria', {
        categoria: 'communication_rule',
        conteudo: 'Sempre iniciar comunicados com saudação cordial e nome do responsável',
        importancia: 0.95
      })

      expect(res).toContain('Novo fato cadastrado com sucesso')
      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts.length).toBe(1)
      expect(profile.learnedFacts[0].fact).toContain('Sempre iniciar comunicados')
      expect(profile.learnedFacts[0].status).toBe('ativo')
    })

    it('retorna mediação humana clara se houver contradição de diretrizes', async () => {
      // 1. Cadastra regra original
      await executeTool('salvar_memoria', {
        categoria: 'grading_rigor',
        conteudo: 'Notas de avaliação devem ser em número inteiro'
      })

      // 2. Tenta cadastrar regra contraditória sem revogação
      const res = await executeTool('salvar_memoria', {
        categoria: 'grading_rigor',
        conteudo: 'Notas de avaliação devem usar casas decimais'
      })

      expect(res).toContain('Professora, notei uma divergência nas regras cadastradas')
      expect(res).toContain('Como gostaria de padronizar')
    })

    it('executa superseding quando a professora expressa revogação', async () => {
      // 1. Regra inicial
      await executeTool('salvar_memoria', {
        categoria: 'grading_rigor',
        conteudo: 'Avaliar redações com rigor alto de pontuação'
      })

      // 2. Revogação
      const res = await executeTool('salvar_memoria', {
        categoria: 'grading_rigor',
        conteudo: 'Mudei de ideia, agora prefiro avaliar redações com rigor brando'
      })

      expect(res).toContain('foi desativada e substituída por')
      const facts = getLongTermMemories()
      const superseded = facts.find(f => f.status === 'superseded')
      const active = facts.find(f => f.status === 'ativo')

      expect(superseded).toBeDefined()
      expect(superseded?.fact).toContain('rigor alto')
      expect(active).toBeDefined()
      expect(active?.fact).toContain('rigor brando')
    })
  })

  describe('3. Injeção de Contexto (buildLongTermMemoryContext)', () => {
    it('ignora regras superseded para nunca poluir prompts com diretrizes antigas', () => {
      const now = new Date().toISOString()
      const initialFacts = [
        {
          id: 'fact_old',
          category: 'grading_rigor' as const,
          fact: 'Regra antiga revogada: dar nota zero para atrasos',
          confidence: 0.9,
          source: 'user',
          status: 'superseded' as const,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'fact_active',
          category: 'grading_rigor' as const,
          fact: 'Regra ativa: aceitar tarefas com desconto de 1 ponto por dia',
          confidence: 0.9,
          source: 'user',
          status: 'ativo' as const,
          createdAt: now,
          updatedAt: now
        }
      ]

      localStorageStore['teacher_rafinha_memory'] = JSON.stringify(initialFacts)

      const ctx = buildLongTermMemoryContext('atrasos')
      expect(ctx).toContain('Regra ativa: aceitar tarefas com desconto')
      expect(ctx).not.toContain('Regra antiga revogada')
    })
  })
})
