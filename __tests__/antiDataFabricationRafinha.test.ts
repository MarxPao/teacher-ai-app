/**
 * antiDataFabricationRafinha.test.ts — Prova de Eliminação de Fabricação Silenciosa de Dados
 *
 * ESPECIFICAÇÃO DO USUÁRIO:
 * - Item 0: Varredura sistemática e eliminação de fabricação de dados sintéticos.
 * - Item 1: get_exam_summary e grade_exam retornam hasData: false sem inventar alunos/respostas.
 * - Item 2: Gate reutilizável checkDataSufficiency.
 * - Item 3: Reteste real do cenário exato do bug (pergunta sobre simulado da turma 9A sem dados).
 * - Item 4: Confirmar que o caso com dados reais continua funcionando normalmente.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkDataSufficiency } from '@/lib/dataSufficiencyGate'
import {
  initConnectorEngine,
  resolveAndInvokeCapability,
  _resetEngineForTests
} from '@/lib/connectorEngine'
import { executeTool } from '@/components/RafinhaChat'

describe('Eliminação de Fabricação Silenciosa de Dados na Rafinha', () => {
  let localStore: Record<string, string> = {}

  beforeEach(async () => {
    localStore = {}
    globalThis.localStorage = {
      getItem: (k: string) => localStore[k] || null,
      setItem: (k: string, v: string) => { localStore[k] = String(v) },
      removeItem: (k: string) => { delete localStore[k] },
      clear: () => { localStore = {} },
      key: (i: number) => Object.keys(localStore)[i] || null,
      length: Object.keys(localStore).length
    } as Storage

    _resetEngineForTests()
    await initConnectorEngine()
  })

  // ─── ITEM 2: GATE DE DADO SUFICIENTE ──────────────────────────────────────────
  describe('Item 2 — Gate Reutilizável de Dado Suficiente (checkDataSufficiency)', () => {
    it('retorna isSufficient: false e hasData: false quando array é nulo, indefinido ou vazio', () => {
      const nullCheck = checkDataSufficiency(null, { entityName: 'avaliações' })
      expect(nullCheck.isSufficient).toBe(false)
      expect(nullCheck.hasData).toBe(false)
      expect(nullCheck.count).toBe(0)
      expect(nullCheck.message).toContain('Não há dados suficientes')
      expect(nullCheck.data).toBeNull()

      const emptyCheck = checkDataSufficiency([], { entityName: 'folhas de resposta', contextLabel: 'Simulado 9A' })
      expect(emptyCheck.isSufficient).toBe(false)
      expect(emptyCheck.hasData).toBe(false)
      expect(emptyCheck.count).toBe(0)
      expect(emptyCheck.message).toContain('Não há dados suficientes')
      expect(emptyCheck.message).toContain('Simulado 9A')
      expect(emptyCheck.data).toBeNull()
    })

    it('retorna isSufficient: false e hasData: true quando amostra é menor que minRequired', () => {
      const partialCheck = checkDataSufficiency([1, 2], { minRequired: 5, entityName: 'respostas' })
      expect(partialCheck.isSufficient).toBe(false)
      expect(partialCheck.hasData).toBe(true)
      expect(partialCheck.count).toBe(2)
      expect(partialCheck.minRequired).toBe(5)
      expect(partialCheck.message).toContain('volume insuficiente')
    })

    it('retorna isSufficient: true e hasData: true quando atinge ou supera minRequired', () => {
      const validCheck = checkDataSufficiency([1, 2, 3, 4, 5], { minRequired: 3, entityName: 'alunos' })
      expect(validCheck.isSufficient).toBe(true)
      expect(validCheck.hasData).toBe(true)
      expect(validCheck.count).toBe(5)
      expect(validCheck.message).toContain('5 alunos válidos')
    })
  })

  // ─── ITEM 1: CONECTORES NÃO INVENTAM DADOS ────────────────────────────────────
  describe('Item 1 — Conectores Recusam Fabricação de Alunos e Folhas', () => {
    it('get_exam_summary sem dados e sem flag simulation retorna hasData: false sem inventar alunos fictícios', async () => {
      const res = await resolveAndInvokeCapability({
        capability: 'get_exam_summary',
        invocation_params: {
          examTitle: 'Simulado de Língua Portuguesa',
          topic: 'Língua Portuguesa',
          classRef: '9A'
        }
      })

      expect(res.status).toBe('resolved')
      expect(res.result?.success).toBe(true)
      expect(res.result?.hasData).toBe(false)
      expect(res.result?.data).toBeNull()
      expect(res.result?.message).toContain('Não há dados suficientes')
      // PROVA: Não inventou 30 alunos nem student_1
      expect(JSON.stringify(res.result)).not.toContain('student_1')
      expect(JSON.stringify(res.result)).not.toContain('student_30')
    })

    it('grade_exam sem folhas e sem flag simulation retorna erro com hasData: false sem criar gabaritos 100% perfeitos', async () => {
      const res = await resolveAndInvokeCapability({
        capability: 'grade_exam',
        invocation_params: {
          examId: 'simulado_9a',
          examTitle: 'Simulado 9A',
          topic: 'Língua Portuguesa'
        }
      })

      expect(res.status).toBe('resolved')
      expect(res.result?.success).toBe(false)
      expect(res.result?.hasData).toBe(false)
      expect(res.result?.data).toBeNull()
      expect(res.result?.error).toContain('Não há dados suficientes')
      // PROVA: Não criou batch de 30 alunos
      expect(JSON.stringify(res.result)).not.toContain('student_1')
    })
  })

  // ─── ITEM 3: RETESTE REAL DO CENÁRIO EXATO DO BUG ─────────────────────────────
  describe('Item 3 — Reteste Real do Cenário Exato do Bug (Turma 9A Sem Dados)', () => {
    it('Processa a pergunta exata da professora sobre a turma 9A e retorna recusa honesta sem alucinação', async () => {
      // 1. Mensagem enviada pela professora
      const userPrompt = 'Como foi o simulado de Língua Portuguesa da turma 9A? O Pedro foi bem?'

      // 2. Modelo despacha tool call para get_exam_summary
      const toolCall = {
        name: 'invoke_teacher_capability',
        input: {
          capability: 'get_exam_summary',
          params: {
            examTitle: 'Simulado de Língua Portuguesa',
            topic: 'Língua Portuguesa',
            classRef: '9A'
          }
        }
      }

      // 3. Execução da ferramenta através do despachador do RafinhaChat
      const rafinhaResponse = await executeTool(toolCall.name, toolCall.input)

      // 4. EVIDÊNCIA LITERAL DA RESPOSTA FINAL EM TEXTO DA RAFINHA
      console.log('\n================ ITEM 3: CENÁRIO REAL SEM DADOS ================')
      console.log('Pergunta do Usuário:', userPrompt)
      console.log('Tool Call Disparada:', JSON.stringify(toolCall, null, 2))
      console.log('Resposta Final da Rafinha:\n', rafinhaResponse)
      console.log('=================================================================\n')

      // 5. Asserções de integridade e honestidade factual
      expect(rafinhaResponse).toContain('Não encontrei simulados ou avaliações registradas para a turma 9A')
      expect(rafinhaResponse).toContain('Quer que eu ajude a criar uma prova no Gerador de Avaliações?')

      // PROVAS NEGATIVAS OBRIGATÓRIAS (Zero dados inventados):
      expect(rafinhaResponse).not.toContain('Pedro tirou')
      expect(rafinhaResponse).not.toContain('student_')
      expect(rafinhaResponse).not.toContain('8.5')
      expect(rafinhaResponse).not.toContain('85%')
      expect(rafinhaResponse).not.toContain('média da turma foi')
    })
  })

  // ─── ITEM 4: CONFIRMAÇÃO DO CASO COM DADOS REAIS ──────────────────────────────
  describe('Item 4 — Confirmação com Dados Reais Cadastrados', () => {
    it('Quando há dados reais no histórico da turma 9A, a Rafinha gera o sumário executivo pedagógico normalmente', async () => {
      // 1. Cadastra uma avaliação real concluída no histórico local do professor
      const realExamData = [
        {
          id: 'exam_lp_9a_real',
          classRef: '9A',
          topic: 'Língua Portuguesa',
          title: 'Simulado de Língua Portuguesa',
          date: '2026-09-20',
          results: [
            {
              studentId: 'std_pedro',
              studentName: 'Pedro Silva',
              totalScore: 8.0,
              maxScore: 10,
              questionResults: [
                { correct: true },
                { correct: true },
                { correct: true },
                { correct: false }
              ]
            },
            {
              studentId: 'std_beatriz',
              studentName: 'Beatriz Costa',
              totalScore: 9.0,
              maxScore: 10,
              questionResults: [
                { correct: true },
                { correct: true },
                { correct: true },
                { correct: true }
              ]
            },
            {
              studentId: 'std_carlos',
              studentName: 'Carlos Eduardo',
              totalScore: 6.0,
              maxScore: 10,
              questionResults: [
                { correct: true },
                { correct: false },
                { correct: false },
                { correct: true }
              ]
            }
          ]
        }
      ]
      localStorage.setItem('teacher_exam_history', JSON.stringify(realExamData))

      // 2. Mesma pergunta/tool call da professora
      const toolCall = {
        name: 'invoke_teacher_capability',
        input: {
          capability: 'get_exam_summary',
          params: {
            examTitle: 'Simulado de Língua Portuguesa',
            topic: 'Língua Portuguesa',
            classRef: '9A'
          }
        }
      }

      // 3. Execução da ferramenta no RafinhaChat
      const rafinhaResponse = await executeTool(toolCall.name, toolCall.input)

      // 4. EVIDÊNCIA LITERAL DA RESPOSTA FINAL EM TEXTO DA RAFINHA COM DADOS REAIS
      console.log('\n================ ITEM 4: CENÁRIO COM DADOS REAIS ===============')
      console.log('Tool Call Disparada:', JSON.stringify(toolCall, null, 2))
      console.log('Resposta Final da Rafinha:\n', rafinhaResponse)
      console.log('=================================================================\n')

      // 5. Asserções do sumário executivo pedagógico real
      expect(rafinhaResponse).toContain('Sumário Executivo Pedagógico')
      expect(rafinhaResponse).toContain('Alunos Participantes')
      expect(rafinhaResponse).toContain('Taxa de Domínio Global')
      expect(rafinhaResponse).toContain('Síntese da Turma')
      expect(rafinhaResponse).not.toContain('Não encontrei simulados')
    })
  })
})
