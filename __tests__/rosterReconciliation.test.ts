import { describe, it, expect } from 'vitest'
import {
  reconcileRosterBatch,
  applyReconciliationDecisions,
  LocalStudentRecord,
  ScrapedStudent
} from '../lib/rosterReconciler'

describe('Roster Reconciliation Engine Suite (Portal Escolar como Fonte de Verdade)', () => {
  // Cenário de teste: 15 alunos locais existentes
  const localStudents: LocalStudentRecord[] = [
    { id: 'loc_1', name: 'Ana Clara Souza', className: '7º Ano A', portal_native_id: 'MAT_101', notes: 'NEE TDAH - Prova ampliada', level: 'B1', grades: { b1: 8.5 } },
    { id: 'loc_2', name: 'Bernardo Lima', className: '7º Ano A', portal_native_id: 'MAT_102', notes: 'Excelente participação oral', level: 'B2' },
    { id: 'loc_3', name: 'Carlos Eduardo Santos', className: '7º Ano A', notes: 'Sem matricula anterior', level: 'A2' },
    { id: 'loc_4', name: 'Daniela Ferreira', className: '7º Ano A', notes: 'Dificuldade em listening', level: 'A2' },
    { id: 'loc_5', name: 'Enzo Gabriel Ramos', className: '7º Ano A', notes: '', level: 'B1' },
    { id: 'loc_6', name: 'Felipe Augusto Rocha', className: '7º Ano A', notes: '', level: 'B1' },
    { id: 'loc_7', name: 'Gabriela Duarte', className: '7º Ano A', notes: '', level: 'B2' },
    { id: 'loc_8', name: 'Helena Ribeiro', className: '7º Ano A', notes: '', level: 'A1' },
    { id: 'loc_9', name: 'Igor Henrique Alves', className: '7º Ano A', notes: '', level: 'B1' },
    { id: 'loc_10', name: 'João Paulo Silva', className: '7º Ano A', notes: 'Aluno antigo', level: 'B1' }, // Teste ambíguo
    { id: 'loc_11', name: 'Larissa Martins', className: '7º Ano A', notes: '', level: 'B2' },
    { id: 'loc_12', name: 'Manuela Costa', className: '7º Ano A', notes: '', level: 'A2' },
    { id: 'loc_13', name: 'Nicolas Barbosa', className: '7º Ano A', notes: '', level: 'B1' },
    { id: 'loc_14', name: 'Olivia Mendes', className: '7º Ano A', notes: '', level: 'B1' },
    { id: 'loc_15', name: 'Pedro Henrique Antunes (Aluno Local Avulso)', className: '7º Ano A', notes: 'Cadastrado à mão ano passado', level: 'A1' }, // Não estará no portal
  ]

  // Simulação de 35 alunos raspados do portal (20 da Pág 1 + 15 da Pág 2)
  const scrapedFromPortal: Array<Record<string, any>> = [
    // Pág 1 (20 alunos)
    { name: 'Ana Clara Souza', matricula: 'MAT_101', rollNumber: '1', classRef: '7º Ano A' }, // Match por ID
    { name: 'Bernardo Lima', matricula: 'MAT_102', rollNumber: '2', classRef: '7º Ano A' }, // Match por ID
    { name: 'Carlos Eduardo Santos', matricula: 'MAT_103', rollNumber: '3', classRef: '7º Ano A' }, // Match por Nome+Turma
    { name: 'Daniela Ferreira', matricula: 'MAT_104', rollNumber: '4', classRef: '7º Ano A' }, // Match por Nome+Turma
    { name: 'Enzo Gabriel Ramos', matricula: 'MAT_105', rollNumber: '5', classRef: '7º Ano A' },
    { name: 'Felipe Augusto Rocha', matricula: 'MAT_106', rollNumber: '6', classRef: '7º Ano A' },
    { name: 'Gabriela Duarte', matricula: 'MAT_107', rollNumber: '7', classRef: '7º Ano A' },
    { name: 'Helena Ribeiro', matricula: 'MAT_108', rollNumber: '8', classRef: '7º Ano A' },
    { name: 'Igor Henrique Alves', matricula: 'MAT_109', rollNumber: '9', classRef: '7º Ano A' },
    { name: 'Joao P. Silva', matricula: 'MAT_110', rollNumber: '10', classRef: '7º Ano A' }, // Similar a "João Paulo Silva" -> Ambíguo
    { name: 'Larissa Martins', matricula: 'MAT_111', rollNumber: '11', classRef: '7º Ano A' },
    { name: 'Manuela Costa', matricula: 'MAT_112', rollNumber: '12', classRef: '7º Ano A' },
    { name: 'Nicolas Barbosa', matricula: 'MAT_113', rollNumber: '13', classRef: '7º Ano A' },
    { name: 'Olivia Mendes', matricula: 'MAT_114', rollNumber: '14', classRef: '7º Ano A' },
    // Novos do Portal (Pág 1)
    { name: 'Paula Nogueira', matricula: 'MAT_115', rollNumber: '15', classRef: '7º Ano A' },
    { name: 'Rafael Guimarães', matricula: 'MAT_116', rollNumber: '16', classRef: '7º Ano A' },
    { name: 'Sophia Castro', matricula: 'MAT_117', rollNumber: '17', classRef: '7º Ano A', nee_flag: true },
    { name: 'Thiago Farias', matricula: 'MAT_118', rollNumber: '18', classRef: '7º Ano A' },
    { name: 'Valentina Pires', matricula: 'MAT_119', rollNumber: '19', classRef: '7º Ano A' },
    { name: 'Yasmin Rezende', matricula: 'MAT_120', rollNumber: '20', classRef: '7º Ano A' },
    // Pág 2 (15 alunos novos)
    { name: 'Arthur Moreira', matricula: 'MAT_121', rollNumber: '21', classRef: '7º Ano A' },
    { name: 'Beatriz Vasconcelos', matricula: 'MAT_122', rollNumber: '22', classRef: '7º Ano A' },
    { name: 'Caio Junqueira', matricula: 'MAT_123', rollNumber: '23', classRef: '7º Ano A' },
    { name: 'Davi Lucca Pinto', matricula: 'MAT_124', rollNumber: '24', classRef: '7º Ano A' },
    { name: 'Eduarda Teles', matricula: 'MAT_125', rollNumber: '25', classRef: '7º Ano A' },
    { name: 'Fernando Borges', matricula: 'MAT_126', rollNumber: '26', classRef: '7º Ano A' },
    { name: 'Giovanna Prado', matricula: 'MAT_127', rollNumber: '27', classRef: '7º Ano A' },
    { name: 'Heitor Siqueira', matricula: 'MAT_128', rollNumber: '28', classRef: '7º Ano A' },
    { name: 'Isabela Fontes', matricula: 'MAT_129', rollNumber: '29', classRef: '7º Ano A' },
    { name: 'Joaquim Toledo', matricula: 'MAT_130', rollNumber: '30', classRef: '7º Ano A' },
    { name: 'Kauan Macedo', matricula: 'MAT_131', rollNumber: '31', classRef: '7º Ano A' },
    { name: 'Lorena Camargo', matricula: 'MAT_132', rollNumber: '32', classRef: '7º Ano A' },
    { name: 'Matheus Brandão', matricula: 'MAT_133', rollNumber: '33', classRef: '7º Ano A' },
    { name: 'Natália Peixoto', matricula: 'MAT_134', rollNumber: '34', classRef: '7º Ano A' },
    { name: 'Otávio Salgado', matricula: 'MAT_135', rollNumber: '35', classRef: '7º Ano A' }
  ]

  it('processa 35 alunos raspados com paginação sem perdas e calcula os 5 contadores', () => {
    const result = reconcileRosterBatch(scrapedFromPortal, localStudents, {
      portalName: 'machado',
      targetClassRef: '7º Ano A'
    })

    // 1. Total raspado deve ser 35
    expect(result.totalPortalCount).toBe(35)

    // 2. Alunos mesclados automaticamente (13 com match exato de nome ou matrícula)
    expect(result.autoMergedCount).toBe(13)

    // 3. Aluno ambíguo ("Joao P. Silva" vs "João Paulo Silva")
    expect(result.ambiguousCount).toBe(1)
    const ambigItem = result.items.find(i => i.status === 'ambiguous_match')
    expect(ambigItem).toBeDefined()
    expect(ambigItem?.portalStudent?.name).toBe('Joao P. Silva')

    // 4. Novos alunos a importar do portal (21 alunos novos)
    expect(result.newImportedCount).toBe(21)

    // 5. Aluno local não listado no portal (Pedro Henrique Antunes mantido)
    expect(result.unmatchedLocalCount).toBe(1)
    const unmatched = result.items.find(i => i.status === 'unmatched_local')
    expect(unmatched?.matchedLocalStudent?.name).toContain('Pedro Henrique Antunes')
  })

  it('NUNCA mescla automaticamente alunos com match ambíguo sem resolução humana', () => {
    const result = reconcileRosterBatch(
      [{ name: 'Gabriel S. Rocha', matricula: '999', classRef: '7º Ano A' }],
      [{ id: 'loc_gab', name: 'Gabriel Santos Rocha', className: '7º Ano A' }]
    )

    expect(result.autoMergedCount).toBe(0)
    expect(result.ambiguousCount).toBe(1)
    expect(result.items[0].status).toBe('ambiguous_match')
    expect(result.items[0].resolvedAction).toBeUndefined()
  })

  it('aplica mesclagem preservando 100% dos dados pedagógicos locais (NEE, Notas, Memória)', () => {
    const result = reconcileRosterBatch(scrapedFromPortal, localStudents, {
      portalName: 'machado',
      targetClassRef: '7º Ano A'
    })

    // Resolve o ambíguo manualmente
    const itemsWithResolution = result.items.map(i => {
      if (i.status === 'ambiguous_match') {
        return { ...i, resolvedAction: 'merge' as const }
      }
      return i
    })

    const { updatedStudents, logSummary } = applyReconciliationDecisions(
      itemsWithResolution,
      localStudents,
      'machado'
    )

    // Verifica integridade da aluna Ana Clara Souza (NEE preservado)
    const ana = updatedStudents.find(s => s.id === 'loc_1')
    expect(ana).toBeDefined()
    expect(ana?.portal_native_id).toBe('MAT_101')
    expect(ana?.source_type).toBe('portal_scrape')
    expect(ana?.sync_status).toBe('synced')
    expect(ana?.notes).toBe('NEE TDAH - Prova ampliada')
    expect(ana?.grades?.b1).toBe(8.5)

    // Verifica aluno local avulso (Pedro Henrique Antunes mantido intacto)
    const pedro = updatedStudents.find(s => s.id === 'loc_15')
    expect(pedro).toBeDefined()
    expect(pedro?.sync_status).toBe('local_only')

    // Total de alunos na base pós-sincronização: 15 locais + 21 novos = 36 alunos
    expect(updatedStudents.length).toBe(36)
    expect(logSummary.merged).toBe(14) // 13 auto + 1 manual resolvido
    expect(logSummary.created).toBe(21)
    expect(logSummary.preserved).toBe(1)
  })
})
