import { describe, it, expect } from 'vitest'
import {
  LESSON_FRAMEWORKS,
  getLessonFrameworkConfig,
  buildDynamicFrameworkPrompt
} from '../lib/lessonFrameworks'
import { SUBJECT_SPECIALIZED_FRAMEWORKS } from '../lib/subjectLessonFrameworks'
import { calculateTalkTimeRatio } from '../lib/pedagogicalEnhancements'
import { getSubjectProfileById } from '../lib/subjectProfile'
import { ALL_CANONICAL_SUBJECT_IDS } from '../lib/subjects'

describe('Pacote 4 — Frameworks Especializados por Matéria & De-biasing Universal', () => {
  it('carrega os 24 frameworks especializados no catálogo global LESSON_FRAMEWORKS', () => {
    expect(SUBJECT_SPECIALIZED_FRAMEWORKS.length).toBe(24)
    
    // Todos os 24 frameworks existem e podem ser recuperados por getLessonFrameworkConfig
    for (const fw of SUBJECT_SPECIALIZED_FRAMEWORKS) {
      const retrieved = getLessonFrameworkConfig(fw.id)
      expect(retrieved.id).toBe(fw.id)
      expect(retrieved.name).toBe(fw.name)
      expect(retrieved.defaultStages.length).toBeGreaterThan(0)
    }
  })

  it('todos os 24 frameworks especializados somam ESTRITAMENTE 50 minutos de duração', () => {
    for (const fw of SUBJECT_SPECIALIZED_FRAMEWORKS) {
      const totalMinutes = fw.defaultStages.reduce((sum, s) => sum + s.durationMin, 0)
      expect(totalMinutes, `Framework ${fw.id} deve somar exatamente 50 minutos`).toBe(50)
    }
  })

  it('cada uma das 8 disciplinas não-inglês possui 3 frameworks recomendados válidos', () => {
    const nonEnglishSubjects = ALL_CANONICAL_SUBJECT_IDS.filter(s => s !== 'english')
    
    for (const subjectId of nonEnglishSubjects) {
      const profile = getSubjectProfileById(subjectId)!
      expect(profile.recommendedFrameworkIds?.length).toBe(3)

      for (const fwId of profile.recommendedFrameworkIds!) {
        const fw = getLessonFrameworkConfig(fwId)
        expect(fw.id).toBe(fwId)
        expect(fw.promptDirective).toBeTruthy()
      }
    }
  })

  it('descontamina frameworks universais (5E, UbD, PBL): zero termos ELT (MFP, CEFR, Cambridge) em matérias não-inglês', () => {
    // 1. Gera prompt de 5E Inquiry para Matemática
    const mathPrompt = buildDynamicFrameworkPrompt({
      activeProfileName: 'Matemática',
      className: '8º Ano A',
      gradeYear: '8º Ano',
      topic: 'Equações de 2º Grau Incompletas',
      methodologyId: '5e_inquiry',
      targetDurationMinutes: 50,
      bnccPromptString: 'EF08MA09',
      promptDirective: 'Foco na resolução algébrica.',
      systemPrompt: 'Você é um assistente pedagógico.',
      subjectId: 'math',
      cefrLevel: 'B1' // Deve ser ignorado para matemática!
    })

    // Deve conter Tríade CPA de Matemática
    expect(mathPrompt).toContain('TRÍADE DE APRESENTAÇÃO OBRIGATÓRIA')
    expect(mathPrompt.toLowerCase()).toContain('concreto-pictórico-abstrato')
    expect(mathPrompt).toContain('EQUILÍBRIO DE TEMPO DOCENTE/DISCENTE — IET_AET')

    // NÃO deve conter resíduos ELT
    expect(mathPrompt).not.toContain('(MFP)')
    expect(mathPrompt).not.toContain('Significado, Forma e Pronúncia')
    expect(mathPrompt).not.toContain('GATING CEFR')
    expect(mathPrompt).not.toContain('ESPECIALIZAÇÃO ELT BRASIL')

    // 2. Já para inglês, deve conter termos comunicativos
    const englishPrompt = buildDynamicFrameworkPrompt({
      activeProfileName: 'Língua Inglesa',
      className: 'Turma A2',
      gradeYear: '7º Ano',
      topic: 'Present Perfect for Life Experiences',
      methodologyId: 'ppp',
      targetDurationMinutes: 50,
      bnccPromptString: 'EF07LI01',
      promptDirective: 'Foco na fluência.',
      systemPrompt: 'Você é um assistente pedagógico.',
      subjectId: 'english',
      cefrLevel: 'A2'
    })

    expect(englishPrompt).toContain('GATING CEFR')
    expect(englishPrompt).toContain('Presentation (MFP)')
  })

  it('suporta métricas de IET vs AET e TTT vs STT no calculateTalkTimeRatio', () => {
    const dummyStages = [
      { name: '1. Problematização', durationMin: 10, teacherAction: 'Apresenta problema', studentAction: 'Formulam hipóteses' },
      { name: '2. Investigação', durationMin: 20, teacherAction: 'Supervisiona bancadas', studentAction: 'Manipulam e resolvem em duplas' },
      { name: '3. Sistematização', durationMin: 12, teacherAction: 'Formaliza o modelo', studentAction: 'Explicam com suas palavras' },
      { name: '4. Registro', durationMin: 8, teacherAction: 'Orienta diário', studentAction: 'Escrevem no diário de bordo' }
    ]

    // Para Física / Ciências (IET vs AET)
    const sciAnalysis = calculateTalkTimeRatio(dummyStages, 'physics')
    expect(sciAnalysis.primaryMetric).toBe('IET_AET')
    expect(sciAnalysis.teacherRoleLabel).toContain('Instrução Expositiva')
    expect(sciAnalysis.studentRoleLabel).toContain('Atividade Efetiva')
    expect(sciAnalysis.statusLabel).toContain('AET')

    // Para Inglês (TTT vs STT)
    const engAnalysis = calculateTalkTimeRatio(dummyStages, 'english')
    expect(engAnalysis.primaryMetric).toBe('TTT_STT')
    expect(engAnalysis.teacherRoleLabel).toContain('Teacher Talking Time')
    expect(engAnalysis.studentRoleLabel).toContain('Student Talking Time')
    expect(engAnalysis.statusLabel).toContain('STT')
  })
})
