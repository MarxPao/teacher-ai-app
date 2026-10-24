import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateExamApplicationPackage,
  generateRecoveryExamAndReviewWorksheet,
  shuffleQuestionOptions,
  adaptQuestionForNeePei
} from '@/lib/examVariationsAndRecovery'
import {
  parseQuickPostClassNote,
  dispatchQuickPostClassLog,
  getSavedQuickPostClassLogs,
  getNextClassReminders,
  resolveNextClassReminder
} from '@/lib/quickPostClassLog'
import {
  generateClassCouncilReportAndBatchOpinions,
  buildClassCouncilExportHtml,
  buildIndividualStudentOpinion
} from '@/lib/classCouncilEngine'
import {
  applyCascadeRescheduleToUnits,
  type SchedulableDidacticUnit
} from '@/lib/didacticCascadeScheduler'
import {
  generateExpressClassroomActivity,
  getExpressWarmupModalityOptions
} from '@/lib/expressWarmupGenerator'
import { getAllPdiRecords, getPdiRecordByStudentId } from '@/lib/pdiManagement'
import type { EditableQuestionItem } from '@/components/EditableQuestionBoxes'

describe('6 Novas Funcionalidades do Teacher AI (R1 a R6)', () => {
  const sampleQuestions: EditableQuestionItem[] = [
    {
      id: 'q1',
      number: 1,
      type: 'multiple_choice',
      stem: 'Qual alternativa apresenta o uso correto do Simple Present para rotinas?',
      options: [
        'A) She works at the hospital every Monday.',
        'B) She working at the hospital.',
        'C) She work at hospital yesterday.',
        'D) She is work at hospital.'
      ],
      answerKey: 'A',
      explanation: 'Usa-se a 3ª pessoa do singular com -s para rotinas.',
      score: 1.0,
      bnccSkill: 'EF06LI19'
    },
    {
      id: 'q2',
      number: 2,
      type: 'multiple_choice',
      stem: 'Identifique a saudação formal adequada para iniciar uma mensagem escolar.',
      options: [
        'A) Dear Teacher, good morning.',
        'B) Hey what is up bro.',
        'C) Bye bye see you.',
        'D) No greeting needed.'
      ],
      answerKey: 'A',
      explanation: 'Saudação formal com título de cortesia.',
      score: 1.0,
      bnccSkill: 'EF06LI01'
    }
  ]

  const storageMap = new Map<string, string>()
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, val: string) => storageMap.set(key, String(val)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    get length() { return storageMap.size },
    key: (i: number) => Array.from(storageMap.keys())[i] || null
  }

  if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    })
  }
  if (typeof (globalThis as any).window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      writable: true,
      configurable: true
    })
  }

  beforeEach(() => {
    storageMap.clear()
    if (typeof localStorage !== 'undefined') {
      try { localStorage.clear() } catch {}
    }
  })

  // ─── R1: Recuperação Paralela & 2ª Chamada + Worksheet de Revisão ───────────
  describe('R1: Gerador de Recuperação Paralela / 2ª Chamada + Worksheet de Revisão', () => {
    it('gera prova de recuperação equivalente com as mesmas habilidades BNCC e gabarito separado', () => {
      const pkg = generateRecoveryExamAndReviewWorksheet({
        questions: sampleQuestions,
        baseTitle: 'Avaliação Bimestral de Inglês',
        topic: 'Simple Present & Greetings',
        grade: '6º Ano',
        recoveryType: 'recuperacao'
      })

      expect(pkg.recoveryExam).toBeDefined()
      expect(pkg.recoveryExam.title).toContain('RECUPERAÇÃO PARALELA')
      expect(pkg.recoveryExam.questions.length).toBe(2)
      expect(pkg.recoveryExam.answerKeyStandaloneHtml).toContain('Gabarito')
      expect(pkg.bnccSkillsCovered).toContain('EF06LI19')
      expect(pkg.bnccSkillsCovered).toContain('EF06LI01')
    })

    it('gera worksheet de revisão pré-recuperação dirigida com dicas de estudo e gabarito comentado', () => {
      const pkg = generateRecoveryExamAndReviewWorksheet({
        questions: sampleQuestions,
        baseTitle: 'Avaliação Bimestral de Inglês',
        topic: 'Simple Present',
        grade: '6º Ano',
        recoveryType: 'recuperacao'
      })

      expect(pkg.reviewWorksheet).toBeDefined()
      expect(pkg.reviewWorksheet.title).toContain('REVISÃO DIRIGIDA')
      expect(pkg.reviewWorksheet.questions.length).toBe(2)
      expect(pkg.reviewWorksheet.htmlContent).toContain('Dica de Resolução')
      expect(pkg.reviewWorksheet.answerKeyStandaloneHtml).toContain('Gabarito')
    })
  })

  // ─── R2: Pacote Versão A + Versão B (Anti-Cola) + Versão Adaptada PEI ───────
  describe('R2: Pacote Instantâneo Versão A + B (Anti-Cola) + Adaptada (NEE/PEI)', () => {
    it('gera Versão A, Versão B com alternativas embaralhadas e gabarito B recalculado', () => {
      const pkg = generateExamApplicationPackage({
        questions: sampleQuestions,
        baseTitle: 'Prova de Língua Inglesa'
      })

      expect(pkg.versionA.versionLabel).toBe('Versão A (Padrão)')
      expect(pkg.versionB.versionLabel).toBe('Versão B (Anti-Cola Embaralhada)')

      // Versão B possui as mesmas questões com nova ordem de opções e gabarito válido
      expect(pkg.versionB.questions.length).toBe(sampleQuestions.length)
      const q1B = pkg.versionB.questions[0]
      expect(['A', 'B', 'C', 'D']).toContain(q1B.answerKey)
      expect(q1B.options.length).toBe(4)
    })

    it('gera Versão Adaptada para NEE/PEI com 3 alternativas (A, B, C) preservando o gabarito correto e destacando comandos em negrito', () => {
      const pkg = generateExamApplicationPackage({
        questions: sampleQuestions,
        baseTitle: 'Prova de Língua Inglesa',
        studentPdiName: 'Carina Miranda de Oliveira'
      })

      const adaptedQ = pkg.versionAdapted.questions[0]
      expect(adaptedQ.options.length).toBe(3) // Reduzido de 4 para 3 alternativas
      expect(['A', 'B', 'C']).toContain(adaptedQ.answerKey)
      expect(pkg.versionAdapted.summaryNote).toContain('Redução para 3 alternativas')
      expect(pkg.versionAdapted.instructions).toContain('Carina Miranda de Oliveira')
    })
  })

  // ─── R3: Diário de Bordo de 30 Segundos Pós-Aula (LGPD 100% Local) ──────────
  describe('R3: Diário de Bordo de 30 Segundos Pós-Aula', () => {
    beforeEach(() => {
      // Seed Carina's PDI directly into localStorage so parseQuickPostClassNote can match her name
      const pdiRecord = {
        studentId: 'student_carina_miranda_6ano',
        studentName: 'Carina Miranda de Oliveira',
        identification: { gradeCycle: '6º Ano' },
        generalObservations: { evolucaoGeral: '' }
      }
      localStorage.setItem('teacher_pdi_records_v1', JSON.stringify({ student_carina_miranda_6ano: pdiRecord }))
    })

    it('analisa nota pós-aula localmente sem enviar PII, detectando turma, página e aluno com PDI', () => {
      const note =
        '6º ano parou na página 34 da Unit 2, faltam os exercícios 4 e 5 para a próxima aula; a Carina participou muito bem do jogo em dupla.'
      const preview = parseQuickPostClassNote(note, '6º Ano')

      expect(preview.lgpdProcessingMode).toBe('LOCAL_DETERMINISTIC_ZERO_EGRESS')
      expect(preview.detectedClassLabel).toContain('6º')
      expect(preview.detectedPageOrStopPoint).toContain('34')
      expect(preview.detectedUnitReference).toBe('Unit 2')
      expect(preview.matchedPdiStudents.some(s => s.studentName.includes('Carina'))).toBe(true)
      expect(preview.nextClassReminderText).toContain('exercícios 4 e 5')
    })

    it('distribui a nota atualizando a Seção 5 do PDI da aluna Carina e criando o lembrete da próxima aula', () => {
      const note =
        '6º A parou na página 34 da Unit 2, faltam os exercícios 4 e 5; a Carina Miranda participou ativamente com apoio visual.'
      const saved = dispatchQuickPostClassLog(note, '6º Ano')

      expect(saved.id).toBeDefined()
      expect(saved.matchedPdiStudents.length).toBeGreaterThan(0)

      // Verifica se a Seção 5 do PDI foi atualizada com a nova linha datada
      const carina = getPdiRecordByStudentId('student_carina_miranda_6ano')
      expect(carina).not.toBeNull()
      expect(carina?.generalObservations?.evolucaoGeral).toContain('Diário Pós-Aula')

      // Verifica se o lembrete para a próxima aula foi salvo
      const reminders = getNextClassReminders('6º')
      expect(reminders.length).toBeGreaterThan(0)

      // Teste de resolução do lembrete
      const afterResolve = resolveNextClassReminder(reminders[0].id)
      expect(afterResolve.some(r => r.id === reminders[0].id)).toBe(false)
    })
  })

  // ─── R4: Central de Conselho de Classe & Pareceres Bimestrais em Lote ────────
  describe('R4: Central de Conselho de Classe & Pareceres em Lote', () => {
    it('gera relatório executivo da turma e pareceres individuais em lote respeitando PDI e métricas', () => {
      const report = generateClassCouncilReportAndBatchOpinions({
        schoolName: 'Colégio Machado Sobrinho',
        teacherName: 'Rafaela Franco Toldo',
        subjectName: 'Língua Inglesa',
        classLabel: '6º Ano',
        periodLabel: '1º Trimestre'
      })

      expect(report.lgpdMode).toBe('LOCAL_ZERO_EGRESS')
      expect(report.metrics.totalStudents).toBeGreaterThan(0)
      expect(report.studentOpinions.length).toBe(report.metrics.totalStudents)

      // Aluna Carina com PDI deve receber status específico e menção às estratégias do PDI
      const carinaOpinion = report.studentOpinions.find(o => o.studentName.includes('Carina'))
      expect(carinaOpinion).toBeDefined()
      expect(carinaOpinion?.statusBadge).toBe('Acompanhamento PDI/PEI')
      expect(carinaOpinion?.fullOpinionText).toContain('PDI')
    })

    it('gera HTML formatado para exportação no Formato da Escola com indicadores e pareceres', () => {
      const report = generateClassCouncilReportAndBatchOpinions({ classLabel: '6º Ano' })
      const html = buildClassCouncilExportHtml(report)

      expect(html).toContain('SÍNTESE EXECUTIVA DA TURMA')
      expect(html).toContain('BALANÇO DE HABILIDADES BNCC')
      expect(html).toContain('PARECERES DESCRITIVOS INDIVIDUAIS')
    })
  })

  // ─── R5: Reagendamento em Cascata na Sequência Didática ──────────────────────
  describe('R5: Reagendamento em Cascata na Sequência Didática', () => {
    const sampleUnits: SchedulableDidacticUnit[] = [
      {
        id: 'u1',
        quarter: '1º Trimestre',
        title: 'Unit 1: Greetings',
        topics: ['EF06LI01'],
        bnccCodes: ['EF06LI01'],
        plannedWeekStart: 1,
        plannedWeekEnd: 4,
        actualWeekStart: 1,
        actualWeekEnd: 4,
        status: 'completed',
        description: 'Concluído',
        lessonsCount: 8
      },
      {
        id: 'u2',
        quarter: '1º Trimestre',
        title: 'Unit 2: Daily Routine',
        topics: ['EF06LI19'],
        bnccCodes: ['EF06LI19'],
        plannedWeekStart: 5,
        plannedWeekEnd: 15,
        actualWeekStart: 5,
        actualWeekEnd: 15,
        status: 'on-track',
        description: 'Em andamento',
        lessonsCount: 8
      },
      {
        id: 'u3',
        quarter: '1º Trimestre',
        title: 'Unit 3: Review',
        topics: ['EF06LI08'],
        bnccCodes: ['EF06LI08'],
        plannedWeekStart: 13,
        plannedWeekEnd: 15,
        actualWeekStart: 13,
        actualWeekEnd: 15,
        status: 'upcoming',
        description: 'Próxima',
        lessonsCount: 4
      }
    ]

    it('reagenda unidades subsequentes adicionando semanas e gerando alerta de compressão BNCC quando ultrapassa limite do trimestre', () => {
      const res = applyCascadeRescheduleToUnits(sampleUnits, {
        startFromUnitId: 'u2',
        weeksDelta: 2,
        reason: 'Feriado / Recesso Escolar',
        customNote: 'Semana de Carnaval e Recesso'
      })

      expect(res.shiftedUnitIds).toContain('u2')
      expect(res.shiftedUnitIds).toContain('u3')
      expect(res.shiftedUnitIds).not.toContain('u1') // Unidade anterior concluída não é deslocada

      const u2Updated = res.updatedUnits.find(u => u.id === 'u2')!
      expect(u2Updated.plannedWeekEnd).toBe(17) // 15 + 2 = 17

      // Como o limite do 1º Trimestre é semana 15, deve disparar alerta de compressão BNCC
      expect(res.bnccCompressionWarnings.length).toBeGreaterThan(0)
      expect(res.bnccCompressionWarnings[0].overflowWeeks).toBe(2)
      expect(res.summaryMessage).toContain('alerta de compressão BNCC')
    })
  })

  // ─── R6: Gerador Express de Warm-ups & Dinâmicas de Movimento/Jogos ──────────
  describe('R6: Gerador Express de Warm-ups & Dinâmicas de Movimento/Jogos (5–15 min)', () => {
    it('disponibiliza 5 modalidades pedagógicas distintas', () => {
      const options = getExpressWarmupModalityOptions()
      expect(options.length).toBe(5)
      expect(options.map(o => o.id)).toEqual([
        'music_movement',
        'lexical_bingo',
        'pair_roleplay',
        'flashcards_memory',
        'board_quiz'
      ])
    })

    it('gera dinâmica com protocolo cooperativo PDI/PEI (sem eliminação individual) e itens imprimíveis', () => {
      const activity = generateExpressClassroomActivity({
        modality: 'music_movement',
        durationMinutes: 10,
        topic: 'Action Verbs & Routine',
        grade: '6º Ano'
      })

      expect(activity.durationMinutes).toBe(10)
      expect(activity.cooperativePdiProtocol).toContain('Protocolo Cooperativo')
      expect(activity.cooperativePdiProtocol).toContain('SEM eliminação individual')
      expect(activity.studentPrintableItems.length).toBeGreaterThan(0)
      expect(activity.printableHtml).toContain('ROTEIRO RÁPIDO DO PROFESSOR')
    })

    it('gera quiz cooperativo com 3 alternativas (A, B, C) e dicas visuais/gestuais', () => {
      const quiz = generateExpressClassroomActivity({
        modality: 'board_quiz',
        durationMinutes: 10,
        topic: 'School Objects',
        grade: '6º Ano'
      })

      expect(quiz.boardQuizQuestions).toBeDefined()
      expect(quiz.boardQuizQuestions!.length).toBeGreaterThan(0)
      quiz.boardQuizQuestions!.forEach(q => {
        expect(q.options.length).toBe(3) // 3 alternativas para total acessibilidade PDI
        expect(['A', 'B', 'C']).toContain(q.correctAnswer)
        expect(q.gestureOrVisualCue).toBeDefined()
      })
    })
  })
})
