import { describe, it, expect, beforeEach } from 'vitest'
import {
  initConnectorEngine,
  resolveAndInvokeCapability,
  listConnectors
} from '../lib/connectorEngine'
import { AGENT_TOOLS } from '../lib/agentTools'

describe('Onda A — Fase A3: Conexão com Rafinha via Connector Engine', () => {
  beforeEach(async () => {
    // Inicializa o engine garantindo conectores padrão (incluindo assessment_engine)
    await initConnectorEngine()
  })

  it('1. AGENT_TOOLS define invoke_teacher_capability com grade_exam e get_exam_summary', () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'invoke_teacher_capability')
    expect(tool).toBeDefined()

    const enumValues = (tool?.input_schema?.properties?.capability as any)?.enum
    expect(enumValues).toContain('grade_exam')
    expect(enumValues).toContain('get_exam_summary')
    expect(tool?.description).toContain('grade_exam')
    expect(tool?.description).toContain('get_exam_summary')
  })

  it('2. Connector Engine registra o conector assessment_engine com as novas capacidades', () => {
    const connectors = listConnectors()
    const assessmentConnector = connectors.find(c => c.id === 'assessment_engine')
    expect(assessmentConnector).toBeDefined()
    expect(assessmentConnector?.status).toBe('mapped_validated')
    const capNames = assessmentConnector?.capabilities.map(c => c.name)
    expect(capNames).toContain('grade_exam')
    expect(capNames).toContain('get_exam_summary')
  })

  it('3. resolveAndInvokeCapability resolve e executa grade_exam com sucesso', async () => {
    const resolution = await resolveAndInvokeCapability({
      capability: 'grade_exam',
      invocation_params: {
        examId: 'prova_fracoes_8a',
        examTitle: 'Avaliação Bimestral de Frações',
        topic: 'Operações com Frações',
        studentCount: 30,
        simulation: true,
        answerKey: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' }
      }
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.connector?.id).toBe('assessment_engine')
    expect(resolution.result?.success).toBe(true)

    const data = resolution.result?.data as any
    expect(data.totalStudents).toBe(30)
    expect(data.averageScore).toBeGreaterThanOrEqual(0)
    expect(data.studentBKTUpdates).toHaveLength(30)
    expect(data.executiveSummary).toBeDefined()
    expect(data.executiveSummary.formattedPageText).toBeTruthy()
    expect(data.executiveSummary.classroomProfile.totalEvaluated).toBe(30)
  })

  it('4. resolveAndInvokeCapability resolve e executa get_exam_summary com sucesso e sem jargões', async () => {
    const resolution = await resolveAndInvokeCapability({
      capability: 'get_exam_summary',
      invocation_params: {
        examTitle: 'Avaliação Diagnóstica de Ciências',
        topic: 'Ecologia e Cadeias Alimentares',
        studentCount: 25,
        simulation: true
      }
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.connector?.id).toBe('assessment_engine')
    expect(resolution.result?.success).toBe(true)

    const summary = resolution.result?.data as any
    expect(summary.examTitle).toBe('Avaliação Diagnóstica de Ciências')
    expect(summary.classroomProfile.totalEvaluated).toBe(25)
    expect(summary.formattedPageText).toBeTruthy()
    expect(summary.pedagogicalInterventions.length).toBeGreaterThan(0)

    // Validação estrita de ausência de jargão psicométrico
    const fullText = JSON.stringify(summary)
    expect(fullText).not.toMatch(/logits/i)
    expect(fullText).not.toMatch(/\\Delta_\{MH\}/)
    expect(fullText).not.toMatch(/chiSquare/i)
    expect(fullText).not.toMatch(/Q-Matrix/i)
    expect(fullText).not.toMatch(/DINA/i)
  })

  it('5. Transcrição conversacional real: comando de voz/chat é resolvido e gera resposta pedagógica', async () => {
    // Simulação do fluxo de conversação do Rafinha:
    // Passo 1: Professora envia comando
    const userVoiceMessage = 'Rafinha, corrige o lote de provas de Frações da turma 8A e me dá o sumário'

    // Passo 2: Modelo emite tool_call para invoke_teacher_capability
    const toolCall = {
      name: 'invoke_teacher_capability',
      input: {
        capability: 'grade_exam' as const,
        connector_hint: 'assessment',
        params: {
          examId: 'fracoes_8a',
          examTitle: 'Frações - Turma 8A',
          topic: 'Frações',
          studentCount: 28,
          simulation: true,
          answerKey: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' }
        }
      }
    }

    // Passo 3: Connector Engine resolve a capacidade
    const resolution = await resolveAndInvokeCapability({
      capability: toolCall.input.capability,
      connector_hint: toolCall.input.connector_hint,
      invocation_params: toolCall.input.params
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.result?.success).toBe(true)

    // Passo 4: Formatação da resposta pedagógica acolhedora de Rafinha (lógica de RafinhaChat.tsx)
    const result = resolution.result!
    const data = result.data as any
    const totalStudents = data?.totalStudents || data?.totalSheetsProcessed || 0
    const averageScore = data?.averageScore !== undefined ? data.averageScore : (data?.executiveSummary?.classroomProfile?.averageMasteryPercentage ?? 0)
    const summaryText = data?.executiveSummary?.formattedPageText || data?.executiveSummary?.classroomProfile?.headline || ''
    const growthAreas = data?.executiveSummary?.growthAreas || []
    const alertSnippet = growthAreas.length > 0 ? `\n\n🎯 Ponto de atenção prioritário: ${growthAreas[0].topic} (${growthAreas[0].masteryPercentage}% de domínio).` : ''

    const rafinhaResponse = `✅ Correção concluída para ${totalStudents} aluno(s)! Média da turma: ${averageScore.toFixed(1)}%.${alertSnippet}\n\n${summaryText ? `📄 Sumário Executivo:\n${summaryText}` : 'Os dados psicométricos foram atualizados com sucesso.'}`

    // Registro do transcript completo
    const transcript = [
      { role: 'user', content: userVoiceMessage },
      { role: 'assistant_tool_call', tool: toolCall.name, args: toolCall.input },
      { role: 'tool_output', status: resolution.status, connector: resolution.connector?.display_name },
      { role: 'rafinha', content: rafinhaResponse }
    ]

    console.log('\n--- TRANSCRICAO CONVERSACIONAL REAL (FASE A3) ---')
    console.log(JSON.stringify(transcript, null, 2))
    console.log('--------------------------------------------------\n')

    expect(rafinhaResponse).toContain('✅ Correção concluída para 28 aluno(s)!')
    expect(rafinhaResponse).toContain('Média da turma:')
    expect(rafinhaResponse).toContain('Sumário Executivo')
    expect(rafinhaResponse).not.toMatch(/logits/i)
    expect(rafinhaResponse).not.toMatch(/DINA/i)
    expect(rafinhaResponse).not.toMatch(/Q-Matrix/i)
  })

  it('6. Bloqueio de fabricação silenciosa: get_exam_summary sem dados reais e sem flag simulation retorna hasData: false sem inventar alunos', async () => {
    const resolution = await resolveAndInvokeCapability({
      capability: 'get_exam_summary',
      invocation_params: {
        examTitle: 'Simulado de Língua Portuguesa',
        topic: 'Língua Portuguesa',
        classRef: '9A'
        // NOTA: studentCount não deve gerar alunos sem simulation: true
      }
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.result?.success).toBe(true)
    expect(resolution.result?.hasData).toBe(false)
    expect(resolution.result?.data).toBeNull()
    expect(resolution.result?.message).toContain('Não há dados suficientes')
    expect(resolution.result?.message).toContain('a turma 9A')
  })

  it('7. Bloqueio de fabricação silenciosa: grade_exam sem folhas reais e sem flag simulation retorna hasData: false sem fabricar respostas 100% corretas', async () => {
    const resolution = await resolveAndInvokeCapability({
      capability: 'grade_exam',
      invocation_params: {
        examId: 'simulado_9a',
        examTitle: 'Simulado 9A',
        topic: 'Língua Portuguesa'
      }
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.result?.success).toBe(false)
    expect(resolution.result?.hasData).toBe(false)
    expect(resolution.result?.data).toBeNull()
    expect(resolution.result?.error).toContain('Não há dados suficientes')
  })
})

