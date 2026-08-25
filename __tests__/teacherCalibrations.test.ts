import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getTeacherCalibrations,
  saveTeacherCalibrations,
  saveModuleCalibration,
  DEFAULT_CALIBRATIONS
} from '../lib/teacherCalibrations'

describe('Centralized Teacher Calibrations & Module Preferences Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna os valores padrão de calibração quando nada foi salvo', () => {
    const cal = getTeacherCalibrations()
    expect(cal.exam.defaultLevel).toBe('A2')
    expect(cal.exam.defaultQuestionCount).toBe('10')
    expect(cal.grading.defaultRubricPreset).toBe('cambridge_4d')
    expect(cal.gradebook.passingScore).toBe(6.0)
    expect(cal.gradebook.defaultPortalSync).toBe('machado')
    expect(cal.attendance.defaultPortalMirror).toBe('machado')
    expect(cal.planner.defaultMethodology).toBe('TBL')
    expect(cal.agent.preferredProvider).toBe('auto')
  })

  it('permite atualizar e persistir calibrações de múltiplos módulos simultaneamente', () => {
    saveTeacherCalibrations({
      exam: {
        defaultLevel: 'B2',
        defaultQuestionCount: '15',
        defaultStemLanguage: 'en',
        defaultTotalScore: 100
      },
      gradebook: {
        passingScore: 7.0,
        calculationMethod: 'weighted',
        defaultPortalSync: 'plural'
      },
      attendance: {
        defaultTimeSlot: '08:20 - 09:10 (2ª Aula)',
        consecutiveAbsenceAlertThreshold: 3
      }
    })

    const updated = getTeacherCalibrations()
    expect(updated.exam.defaultLevel).toBe('B2')
    expect(updated.exam.defaultQuestionCount).toBe('15')
    expect(updated.exam.defaultStemLanguage).toBe('en')
    expect(updated.exam.defaultTotalScore).toBe(100)
    expect(updated.gradebook.passingScore).toBe(7.0)
    expect(updated.gradebook.calculationMethod).toBe('weighted')
    expect(updated.gradebook.defaultPortalSync).toBe('plural')
    expect(updated.attendance.defaultTimeSlot).toContain('2ª Aula')
    expect(updated.attendance.consecutiveAbsenceAlertThreshold).toBe(3)
  })

  it('saveModuleCalibration atualiza estritamente o módulo especificado sem sobrescrever os demais', () => {
    // Configura previamente o módulo de exam
    saveModuleCalibration('exam', { defaultLevel: 'C1', defaultQuestionCount: '20' })
    
    // Atualiza apenas o módulo de grading
    saveModuleCalibration('grading', { gradingRigor: 5, autoGenerateStudentFeedback: false })

    const result = getTeacherCalibrations()
    expect(result.exam.defaultLevel).toBe('C1')
    expect(result.exam.defaultQuestionCount).toBe('20')
    expect(result.grading.gradingRigor).toBe(5)
    expect(result.grading.autoGenerateStudentFeedback).toBe(false)
  })
})
