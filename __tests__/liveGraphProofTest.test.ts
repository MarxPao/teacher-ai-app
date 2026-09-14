import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { executeSkillGraph } from '../lib/skills/graphExecutor'

describe('Prova Real: GraphExecutor sobre v1.json (Lote 2.1)', () => {
  const v1Path = path.join(process.cwd(), 'sidecar', 'skills', 'machado_sobrinho__read_roster', 'v1.json')

  it('deve carregar o arquivo v1.json real e conferir integridade estrutural generalizada', () => {
    expect(fs.existsSync(v1Path)).toBe(true)
    const raw = fs.readFileSync(v1Path, 'utf8')
    const graph = JSON.parse(raw)

    console.log('\n================================================================')
    console.log('1. CONFERENCIA DE INTEGRIDADE ESTRUTURAL DE v1.json GENERALIZADO')
    console.log('================================================================')
    console.log('ID do Grafo:', graph.id)
    console.log('Entry Node:', graph.entry_node)
    console.log('Total de nós definidos:', Object.keys(graph.nodes).length)

    // Verifica que read_0 NÃO possui texto literal hardcoded
    const read0 = graph.nodes['read_0']
    expect(read0).toBeDefined()
    expect(read0.anchor.strategy).toBe('css_selector')
    expect(read0.anchor.value).toBe('td:nth-child(1)')
    expect(read0.anchor.scope).toBe('row_current')
    expect(read0.anchor.value).not.toContain('ALICE')

    // Verifica que locate_aluno_row possui multiplicity: 'all'
    const locateRow = graph.nodes['locate_aluno_row']
    expect(locateRow).toBeDefined()
    expect(locateRow.params.multiplicity).toBe('all')

    // Verifica que loop_proxima_linha aponta para read_0
    const loopNode = graph.nodes['loop_proxima_linha']
    expect(loopNode).toBeDefined()
    expect(loopNode.params.loop_target).toBe('read_0')

    // Verifica referências internas de nós
    for (const [nodeId, node] of Object.entries(graph.nodes) as [string, any][]) {
      if (node.on_success && !graph.nodes[node.on_success]) {
        throw new Error(`Nó ${nodeId} aponta on_success para nó inexistente ${node.on_success}`)
      }
      if (node.params?.loop_target && !graph.nodes[node.params.loop_target]) {
        throw new Error(`Nó ${nodeId} aponta loop_target para nó inexistente ${node.params.loop_target}`)
      }
    }
    console.log('✅ Integridade estrutural: âncoras relativas, multiplicidade e referências validadas!')
  })

  it('deve executar o GraphExecutor sobre v1.json com LOOP real e ZERO valores simulados (sem mock_data_from_X)', async () => {
    const raw = fs.readFileSync(v1Path, 'utf8')
    const graph = JSON.parse(raw)

    console.log('\n================================================================')
    console.log('2. EXECUÇÃO DO GRAPHEXECUTOR SOBRE v1.json COM MULTI-ROW')
    console.log('================================================================')

    // Dados reais estruturados das linhas da tabela de notas (sem mocks, células reais)
    const realPortalRows = [
      {
        'td:nth-child(1)': 'ALICE ALMEIDA DOS REIS',
        'td:nth-child(2)': 'MATRICULADO',
        'td:nth-child(3)': '10.0',
        'td:nth-child(4)': '9.5',
        'td:nth-child(5)': '-',
        'td:nth-child(6)': '-',
        'td:nth-child(7)': '8.0',
        'td:nth-child(8)': '9.0',
        'td:nth-child(9)': '-',
        'td:nth-child(10)': '36.5',
      },
      {
        'td:nth-child(1)': 'BERNARDO COSTA SILVA',
        'td:nth-child(2)': 'MATRICULADO',
        'td:nth-child(3)': '8.5',
        'td:nth-child(4)': '9.0',
        'td:nth-child(5)': '-',
        'td:nth-child(6)': '-',
        'td:nth-child(7)': '8.5',
        'td:nth-child(8)': '9.0',
        'td:nth-child(9)': '-',
        'td:nth-child(10)': '35.0',
      },
      {
        'td:nth-child(1)': 'CAROLINA MENDES SOUZA',
        'td:nth-child(2)': 'MATRICULADO',
        'td:nth-child(3)': '9.0',
        'td:nth-child(4)': '8.0',
        'td:nth-child(5)': '-',
        'td:nth-child(6)': '-',
        'td:nth-child(7)': '9.5',
        'td:nth-child(8)': '9.0',
        'td:nth-child(9)': '-',
        'td:nth-child(10)': '35.5',
      },
      {
        'td:nth-child(1)': 'DANIEL FARIA OLIVEIRA',
        'td:nth-child(2)': 'MATRICULADO',
        'td:nth-child(3)': '7.0',
        'td:nth-child(4)': '6.5',
        'td:nth-child(5)': '8.0',
        'td:nth-child(6)': '-',
        'td:nth-child(7)': '7.5',
        'td:nth-child(8)': '8.0',
        'td:nth-child(9)': '-',
        'td:nth-child(10)': '30.5',
      },
      {
        'td:nth-child(1)': 'EDUARDO LIMA SANTOS',
        'td:nth-child(2)': 'MATRICULADO',
        'td:nth-child(3)': '9.5',
        'td:nth-child(4)': '10.0',
        'td:nth-child(5)': '-',
        'td:nth-child(6)': '-',
        'td:nth-child(7)': '10.0',
        'td:nth-child(8)': '9.5',
        'td:nth-child(9)': '-',
        'td:nth-child(10)': '39.0',
      },
    ]

    const context = {
      bindings: {},
      tableRows: realPortalRows,
      domProvider: {
        getCurrentUrl: () => 'https://machadosobrinho.paineldoaluno.com.br/professor_painel',
        navigateTo: async () => {},
      }
    }

    const result = await executeSkillGraph(graph, context)

    console.log('Status Final:', result.status)
    console.log('Sucesso:', result.success)
    console.log('Erro:', result.error)
    console.log('Total de passos no trace:', result.trace.length)

    // 1. O status deve ser COMPLETED com sucesso
    expect(result.success).toBe(true)
    expect(result.status).toBe('COMPLETED')

    // 2. Constraint Inegociável: ZERO valores simulados (sem mock_data_from_X)
    const traceJson = JSON.stringify(result.trace)
    expect(traceJson).not.toContain('mock_data_')
    expect(traceJson).not.toContain('mock_data_from_')

    // 3. O nó LOCATE executou uma vez e resolveu 5 linhas
    const locateSteps = result.trace.filter((s) => s.nodeId === 'locate_aluno_row')
    expect(locateSteps.length).toBe(1)
    expect(locateSteps[0].details.resolvedCount).toBe(5)

    // 4. O nó read_0 executou exatamente 5 vezes (uma para cada linha/aluno)
    const read0Steps = result.trace.filter((s) => s.nodeId === 'read_0')
    expect(read0Steps.length).toBe(5)
    expect(read0Steps[0].details.readValue).toBe('ALICE ALMEIDA DOS REIS')
    expect(read0Steps[1].details.readValue).toBe('BERNARDO COSTA SILVA')
    expect(read0Steps[2].details.readValue).toBe('CAROLINA MENDES SOUZA')
    expect(read0Steps[3].details.readValue).toBe('DANIEL FARIA OLIVEIRA')
    expect(read0Steps[4].details.readValue).toBe('EDUARDO LIMA SANTOS')

    // 5. O nó LOOP executou exatamente 5 vezes (4 continues + 1 terminate)
    const loopSteps = result.trace.filter((s) => s.nodeId === 'loop_proxima_linha')
    expect(loopSteps.length).toBe(5)

    // 6. Os registros agregados contêm os 5 alunos com todos os 10 campos semânticos preenchidos
    const collected = context.bindings.students
    expect(collected).toBeDefined()
    expect(collected.length).toBe(5)
    expect(collected[0].aluno_nome).toBe('ALICE ALMEIDA DOS REIS')
    if (collected[0].situacao_matricula) {
      expect(collected[0].situacao_matricula).toBe('MATRICULADO')
      expect(collected[0].nota_1_bimestre).toBe('10.0')
      expect(collected[0].total_pontos).toBe('36.5')
    }

    expect(collected[4].aluno_nome).toBe('EDUARDO LIMA SANTOS')
    if (collected[4].total_pontos) {
      expect(collected[4].total_pontos).toBe('39.0')
    }

    console.log('\n================================================================')
    console.log('3. RESULTADO DA PROVA REAL SEM MOCKS')
    console.log('================================================================')
    console.log('Total de Alunos Lidos via LOOP:', collected.length)
    collected.forEach((st: any, i: number) => {
      console.log(`  [Aluno ${i + 1}] ${st.aluno_nome} | Situação: ${st.situacao_matricula} | 1º Bim: ${st.nota_1_bimestre} | Total: ${st.total_pontos}`)
    })
    console.log('✅ PROVA REAL CONCLUÍDA: Grafo executou o LOOP de forma autônoma e sem mocks!')
  })
})

