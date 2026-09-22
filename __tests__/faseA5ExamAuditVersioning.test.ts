import { describe, it, expect, beforeEach } from 'vitest'
import {
  createExamAuditEntry,
  recordExamAuditEvent,
  appendExamAuditEntry,
  getExamAuditHistory,
  _clearExamAuditHistoryForTests,
  ExamAuditAction
} from '../lib/examAuditVersioning'

describe('Onda A — Fase A5: Versionamento e Histórico Auditável de Provas', () => {
  beforeEach(() => {
    _clearExamAuditHistoryForTests()
  })

  it('1. Registra criação de prova gerando entrada inicial v1 com timestamp e autoria', () => {
    const examId = 'prova_matematica_8a'
    const history = recordExamAuditEvent({
      examId,
      action: 'created',
      diffSummary: 'Prova criada via assistente com 10 questões de Frações',
      author: { name: 'Professora Ana', role: 'teacher' }
    })

    expect(history.examId).toBe(examId)
    expect(history.currentVersion).toBe(1)
    expect(history.entries).toHaveLength(1)

    const entry = history.entries[0]
    expect(entry.action).toBe('created')
    expect(entry.author.name).toBe('Professora Ana')
    expect(entry.author.role).toBe('teacher')
    expect(entry.diffSummary).toContain('Prova criada via assistente')
    expect(entry.timestamp).toBeGreaterThan(0)
    expect(entry.formattedTimestamp).toBeTruthy()
    expect(entry.versionId).toMatch(/^ver_\d+_[a-z0-9]+$/)
  })

  it('2. Registra edição de distrator gerando nova entrada de versão', () => {
    const examId = 'prova_ciencias_7b'
    recordExamAuditEvent({
      examId,
      action: 'created',
      diffSummary: 'Prova de Ecologia criada'
    })

    const historyAfterEdit = recordExamAuditEvent({
      examId,
      action: 'distractor_edited',
      questionNumber: 2,
      diffSummary: 'Alternativa C da Questão #2 alterada para ajustar distrator diagnóstico',
      details: {
        letter: 'C',
        oldText: 'Todos os animais são produtores',
        newText: 'Animais herbívoros produzem sua própria energia'
      }
    })

    expect(historyAfterEdit.currentVersion).toBe(2)
    expect(historyAfterEdit.entries).toHaveLength(2)

    const editEntry = historyAfterEdit.entries[1]
    expect(editEntry.action).toBe('distractor_edited')
    expect(editEntry.questionNumber).toBe(2)
    expect(editEntry.details?.letter).toBe('C')
    expect(editEntry.diffSummary).toContain('Alternativa C da Questão #2 alterada')
  })

  it('3. Registra remoção de questão por violação Haladyna com rastreabilidade da regra', () => {
    const examId = 'prova_historia_9c'
    recordExamAuditEvent({
      examId,
      action: 'created',
      diffSummary: 'Prova de História criada'
    })

    const history = recordExamAuditEvent({
      examId,
      action: 'haladyna_violation_removed',
      questionNumber: 4,
      diffSummary: 'Questão #4 excluída para sanar violação Haladyna: ALL_NONE_ABOVE',
      details: {
        rule: 'ALL_NONE_ABOVE',
        message: 'Alternativa com "Todas as anteriores" prejudica a validade discriminatória'
      }
    })

    expect(history.currentVersion).toBe(2)
    const haladynaEntry = history.entries[1]
    expect(haladynaEntry.action).toBe('haladyna_violation_removed')
    expect(haladynaEntry.questionNumber).toBe(4)
    expect(haladynaEntry.details?.rule).toBe('ALL_NONE_ABOVE')
    expect(haladynaEntry.diffSummary).toContain('violação Haladyna')
  })

  it('4. Registra override manual de gate Haladyna com detalhes das violações pendentes', () => {
    const examId = 'prova_quimica_1m'
    const history = recordExamAuditEvent({
      examId,
      action: 'haladyna_gate_overridden',
      diffSummary: 'Exportação liberada sob override manual do professor com 1 violação crítica pendente',
      author: { name: 'Prof. Carlos', role: 'teacher' },
      details: {
        criticalCount: 1,
        violations: [
          { questionNumber: 5, rule: 'ALL_NONE_ABOVE', message: 'Alternativa com "Nenhuma das anteriores"' }
        ]
      }
    })

    expect(history.currentVersion).toBe(1)
    const overrideEntry = history.entries[0]
    expect(overrideEntry.action).toBe('haladyna_gate_overridden')
    expect(overrideEntry.details?.criticalCount).toBe(1)
    expect(overrideEntry.diffSummary).toContain('override manual')
  })

  it('5. GARANTIA ESTRITA DE IMUTABILIDADE: entradas e histórico são congelados (append-only ledger)', () => {
    const examId = 'prova_imutavel'
    const history = recordExamAuditEvent({
      examId,
      action: 'created',
      diffSummary: 'Prova inicial criada'
    })

    const entry = history.entries[0]

    // 5.1 O objeto da entrada é imutável
    expect(Object.isFrozen(entry)).toBe(true)
    expect(Object.isFrozen(entry.author)).toBe(true)

    // Tentar modificar lança erro em modo estrito
    expect(() => {
      ;(entry as any).diffSummary = 'Texto alterado fraudulentamente'
    }).toThrow()

    // 5.2 O array de entradas é imutável
    expect(Object.isFrozen(history.entries)).toBe(true)
    expect(() => {
      ;(history.entries as any).push({} as any)
    }).toThrow()

    // 5.3 O histórico geral é congelado
    expect(Object.isFrozen(history)).toBe(true)
  })

  it('6. getExamAuditHistory recupera o histórico persistido preservando ordem cronológica e imutabilidade', () => {
    const examId = 'prova_cronologica'
    const t0 = 1700000000000

    recordExamAuditEvent({
      examId,
      action: 'created',
      diffSummary: 'Versão 1 criada',
      timestamp: t0
    })

    recordExamAuditEvent({
      examId,
      action: 'stem_edited',
      diffSummary: 'Enunciado da Questão #1 revisado',
      questionNumber: 1,
      timestamp: t0 + 60000
    })

    recordExamAuditEvent({
      examId,
      action: 'points_changed',
      diffSummary: 'Pontuação da Questão #1 alterada para 2.0 pts',
      questionNumber: 1,
      timestamp: t0 + 120000
    })

    const retrieved = getExamAuditHistory(examId)
    expect(retrieved.currentVersion).toBe(3)
    expect(retrieved.entries).toHaveLength(3)
    expect(retrieved.entries[0].action).toBe('created')
    expect(retrieved.entries[1].action).toBe('stem_edited')
    expect(retrieved.entries[2].action).toBe('points_changed')
    expect(retrieved.entries[1].timestamp).toBeGreaterThan(retrieved.entries[0].timestamp)
    expect(retrieved.entries[2].timestamp).toBeGreaterThan(retrieved.entries[1].timestamp)
    expect(Object.isFrozen(retrieved.entries)).toBe(true)
  })
})
