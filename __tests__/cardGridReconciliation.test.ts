import { describe, it, expect } from 'vitest'
import {
  reconcileRosterBatch,
  applyReconciliationDecisions,
  LocalStudentRecord
} from '../lib/rosterReconciler'

describe('Card Grid Import & Reconciliation Flow — Machado Sobrinho (Meus Alunos)', () => {
  it('reconciles students extracted from profile cards via 4 pathways and persists correctly', () => {
    // 1. Alunos locais existentes no app ("Minha Turma e Alunos")
    const existingLocalStudents: LocalStudentRecord[] = [
      {
        id: 'student_1',
        name: 'Ana Júlia Ferreira',
        classId: 'class_9a',
        className: '9º Ano A',
        schoolId: 'school_1',
        portal_native_id: '408',
        rollNumber: '01'
      },
      {
        id: 'student_2',
        name: 'Carlos Eduardo Souza',
        classId: 'class_9a',
        className: '9º Ano A',
        schoolId: 'school_1',
        rollNumber: '03'
      },
      {
        id: 'student_3',
        name: 'Lucas P. Silva',
        classId: 'class_9a',
        className: '9º Ano A',
        schoolId: 'school_1',
        rollNumber: '04'
      }
    ]

    // 2. Alunos extraídos dos cartões de perfil pelo PageReaderEngine (EXTRACT_CARD_GRID_JS)
    const scrapedFromCards = [
      // Via 1: Auto-merge por portal_native_id / matrícula exata
      {
        name: 'Ana Júlia Ferreira',
        rollNumber: '408',
        portal_native_id: '408',
        status: 'active' as const,
        avatar: 'https://machadosobrinho.paineldoaluno.com.br/foto/408.jpg',
        nee_flag: true
      },
      // Via 2: Ambíguo por similaridade fonética/lematizada ("Lucas Silva" vs "Lucas P. Silva")
      {
        name: 'Lucas Silva',
        rollNumber: '512',
        portal_native_id: '512',
        status: 'active' as const,
        avatar: '',
        nee_flag: false
      },
      // Via 3: Novo aluno (não existe no local)
      {
        name: 'Mariana Duarte Ramos',
        rollNumber: '620',
        portal_native_id: '620',
        status: 'active' as const,
        avatar: 'https://machadosobrinho.paineldoaluno.com.br/foto/620.jpg',
        nee_flag: false
      }
    ]

    // 3. Reconciliação
    const result = reconcileRosterBatch(scrapedFromCards, existingLocalStudents, {
      portalName: 'Machado Sobrinho — Meus Alunos',
      targetClassRef: '9º Ano A'
    })

    expect(result.totalPortalCount).toBe(3)
    expect(result.autoMergedCount).toBe(1)      // Ana Júlia Ferreira
    expect(result.ambiguousCount).toBe(1)       // Lucas Silva ~ Lucas P. Silva
    expect(result.newImportedCount).toBe(1)     // Mariana Duarte Ramos
    expect(result.unmatchedLocalCount).toBe(1)  // Carlos Eduardo Souza (preservado)

    // 4. Decisão do professor no modal: resolve o ambíguo mesclando
    const resolvedItems = result.items.map(item => {
      if (item.status === 'ambiguous_match') {
        return {
          ...item,
          resolvedAction: 'merge' as const,
          reason: 'Professor confirmou que Lucas Silva é Lucas P. Silva.'
        }
      }
      return item
    })

    // 5. Aplicação das decisões de conciliação
    const { updatedStudents, logSummary } = applyReconciliationDecisions(
      resolvedItems,
      existingLocalStudents,
      'Machado Sobrinho — Meus Alunos'
    )

    expect(logSummary.merged).toBe(2)     // Ana Júlia + Lucas
    expect(logSummary.created).toBe(1)    // Mariana
    expect(logSummary.preserved).toBe(1)  // Carlos Eduardo
    expect(logSummary.total).toBe(4)      // 4 alunos no total

    // Verifica integridade dos campos preservados e enriquecidos
    const ana = updatedStudents.find(s => s.name === 'Ana Júlia Ferreira')
    expect(ana).toBeDefined()
    expect(ana?.portal_native_id).toBe('408')
    expect(ana?.sync_status).toBe('synced')

    const mariana = updatedStudents.find(s => s.name === 'Mariana Duarte Ramos')
    expect(mariana).toBeDefined()
    expect(mariana?.portal_native_id).toBe('620')
    expect(mariana?.source_type).toBe('portal_scrape')

    const carlos = updatedStudents.find(s => s.name === 'Carlos Eduardo Souza')
    expect(carlos).toBeDefined() // Preservado intacto
  })
})
