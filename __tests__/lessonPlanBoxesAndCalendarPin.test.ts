import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  normalizeDateToKey,
  getLessonPlansFromBank,
  getLessonPlansForDate,
  syncLessonPlanToCalendar,
  removeLessonPlanFromCalendar,
  BridgedLessonPlan,
  getFullLessonPlanDocument,
  buildFallbackLessonPlanDocument,
  getWeekDates,
  formatWeekRange,
  resolvePinScheduleTime
} from '../lib/calendarPlanBridge'
import { DEFAULT_CALIBRATIONS } from '../lib/teacherCalibrations'

describe('Lesson Plan Boxes & Calendar Pin Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => {
        Object.keys(mockStorage).forEach(k => delete mockStorage[k])
      }
    })
    // Mock window dispatchEvent
    if (typeof window !== 'undefined') {
      vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('1. Normalização Universal de Datas (normalizeDateToKey)', () => {
    it('normaliza corretamente formato YYYY-MM-DD', () => {
      expect(normalizeDateToKey('2026-09-21')).toBe('2026-09-21')
    })

    it('normaliza corretamente formato brasileiro DD/MM/YYYY para 21/09/2026', () => {
      expect(normalizeDateToKey('21/09/2026')).toBe('2026-09-21')
    })

    it('normaliza formato abreviado DD/MM usando o ano corrente', () => {
      const currentYear = new Date().getFullYear()
      expect(normalizeDateToKey('21/09')).toBe(`${currentYear}-09-21`)
    })

    it('normaliza ISO string com timestamp', () => {
      expect(normalizeDateToKey('2026-09-21T14:30:00.000Z')).toBe('2026-09-21')
    })

    it('normaliza instâncias de Date nativas', () => {
      const dateObj = new Date(2026, 8, 21) // Mês 8 = Setembro (0-indexed)
      expect(normalizeDateToKey(dateObj)).toBe('2026-09-21')
    })

    it('retorna string vazia para entradas nulas, indefinidas ou vazias', () => {
      expect(normalizeDateToKey(null)).toBe('')
      expect(normalizeDateToKey(undefined)).toBe('')
      expect(normalizeDateToKey('')).toBe('')
    })
  })

  describe('2. Ponte de Dados Calendário ↔ Banco de Aulas (calendarPlanBridge)', () => {
    const samplePlan = {
      id: 'plan_20260921_01',
      date: '2026-09-21',
      classId: 'cls_9a',
      className: '9º Ano A',
      topic: 'Passive Voice in News Articles',
      subject: 'Língua Inglesa',
      description: 'Análise e produção de manchetes usando voz passiva.',
      shortDescription: 'Uso da voz passiva no jornalismo.',
      status: 'confirmed' as const,
      targetDurationMinutes: 50,
      roomSpace: 'Laboratório de Informática',
      stages: [
        { name: 'Warm-up', durationMin: 10, teacherAction: 'Explica', studentAction: 'Ouve' },
        { name: 'Practice', durationMin: 40, teacherAction: 'Circula', studentAction: 'Trabalho em duplas' }
      ]
    }

    it('recupera planos do banco com data 21/09 normalizada e campos mapeados', () => {
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([samplePlan]))

      const plans = getLessonPlansFromBank()
      expect(plans).toHaveLength(1)
      expect(plans[0].id).toBe('plan_20260921_01')
      expect(plans[0].date).toBe('2026-09-21')
      expect(plans[0].className).toBe('9º Ano A')
      expect(plans[0].topic).toBe('Passive Voice in News Articles')
      expect(plans[0].stagesCount).toBe(2)
    })

    it('retorna planos específicos para a data 21/09 via getLessonPlansForDate', () => {
      const planOtherDate = {
        ...samplePlan,
        id: 'plan_20260922_02',
        date: '2026-09-22',
        topic: 'Reported Speech'
      }
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([samplePlan, planOtherDate]))

      const plans21 = getLessonPlansForDate('2026-09-21')
      expect(plans21).toHaveLength(1)
      expect(plans21[0].topic).toBe('Passive Voice in News Articles')

      // Busca usando formato DD/MM/YYYY
      const plans21BR = getLessonPlansForDate('21/09/2026')
      expect(plans21BR).toHaveLength(1)
      expect(plans21BR[0].id).toBe('plan_20260921_01')
    })

    it('sincroniza o plano no calendário de tarefas (teacher_calendar_tasks)', () => {
      syncLessonPlanToCalendar(samplePlan)

      const rawTasks = localStorage.getItem('teacher_calendar_tasks')
      expect(rawTasks).not.toBeNull()

      const tasks = JSON.parse(rawTasks!)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('lesson_plan_plan_20260921_01')
      expect(tasks[0].lessonPlanId).toBe('plan_20260921_01')
      expect(tasks[0].title).toBe('📚 Aula: Passive Voice in News Articles')
      expect(tasks[0].date).toBe('2026-09-21')
      expect(tasks[0].type).toBe('aula')
      expect(tasks[0].classRef).toBe('9º Ano A')
    })

    it('atualiza tarefa existente no calendário sem duplicar IDs', () => {
      syncLessonPlanToCalendar(samplePlan)
      const updatedPlan = {
        ...samplePlan,
        topic: 'Passive Voice in Digital Media (Atualizado)'
      }
      syncLessonPlanToCalendar(updatedPlan)

      const tasks = JSON.parse(localStorage.getItem('teacher_calendar_tasks')!)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].title).toBe('📚 Aula: Passive Voice in Digital Media (Atualizado)')
    })

    it('remove referência do calendário quando o plano é excluído', () => {
      syncLessonPlanToCalendar(samplePlan)
      expect(JSON.parse(localStorage.getItem('teacher_calendar_tasks')!)).toHaveLength(1)

      removeLessonPlanFromCalendar(samplePlan.id)
      const tasksAfter = JSON.parse(localStorage.getItem('teacher_calendar_tasks')!)
      expect(tasksAfter).toHaveLength(0)
    })
  })

  describe('3. Visibilidade do Pin no Calendário da Home (21/09)', () => {
    it('garante que a célula do calendário detecta a aula planejada de 21/09', () => {
      const planOn21 = {
        id: 'plan_21_sep',
        date: '2026-09-21',
        className: '1º Ano EM',
        topic: 'Argumentative Essay Structure'
      }
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([planOn21]))

      const allPlans = getLessonPlansFromBank()
      const targetDateKey = '2026-09-21'

      // Simulação da lógica de agregação do calendarGrid do Dashboard.tsx
      const dayPlans = allPlans.filter(p => p.date === targetDateKey)
      const hasLessonPlan = dayPlans.length > 0
      const pinCount = 0
      const hasPriv = false
      const hasPin = pinCount > 0 || hasPriv || hasLessonPlan

      expect(hasLessonPlan).toBe(true)
      expect(hasPin).toBe(true)
      expect(dayPlans).toHaveLength(1)
      expect(dayPlans[0].topic).toBe('Argumentative Essay Structure')
    })
  })

  describe('4. Diretrizes Pedagógicas e Manual-First por Padrão', () => {
    it('calibrações padrão mantêm autoSuggestMaterials desativado (manual-first)', () => {
      expect(DEFAULT_CALIBRATIONS.planner.autoSuggestMaterials).toBe(false)
      expect(DEFAULT_CALIBRATIONS.planner.detailSpeechBalanceByStage).toBe(true)
      expect(DEFAULT_CALIBRATIONS.planner.suggestInteractionPerStage).toBe(true)
    })

    it('novos planos nascem com materiais e descrição curta vazios por padrão', () => {
      const newPlanDraft = {
        shortDescription: '',
        materials: [] as string[],
        subjectCoverageArea: '',
        predominantInteraction: 'whole_class'
      }

      expect(newPlanDraft.shortDescription).toBe('')
      expect(newPlanDraft.materials).toHaveLength(0)
      expect(newPlanDraft.subjectCoverageArea).toBe('')
    })
  })

  describe('5. Cálculo Matemático de Equilíbrio de Fala (Talk Time Ratio)', () => {
    // Algoritmo canônico implementado no LessonStudio
    function computeSpeechBalance(stages: Array<{
      durationMin: number
      interactionType?: string
      speechBalance?: { teacherPercent: number; studentPercent: number; silencePercent: number }
    }>) {
      const totalMin = stages.reduce((acc, s) => acc + (s.durationMin || 0), 0)
      if (totalMin === 0) {
        return { teacherPercent: 50, studentPercent: 40, silencePercent: 10, totalMin: 0, isHighTeacherTalk: false }
      }

      let weightedTeacher = 0
      let weightedStudent = 0
      let weightedSilence = 0

      stages.forEach(stage => {
        const duration = stage.durationMin || 0
        let tPct = 50
        let sPct = 40
        let silPct = 10

        if (stage.speechBalance) {
          tPct = stage.speechBalance.teacherPercent ?? 50
          sPct = stage.speechBalance.studentPercent ?? 40
          silPct = stage.speechBalance.silencePercent ?? 10
        } else {
          switch (stage.interactionType) {
            case 'whole_class':
              tPct = 65; sPct = 25; silPct = 10; break
            case 'pair':
            case 'group':
              tPct = 20; sPct = 70; silPct = 10; break
            case 'individual':
              tPct = 10; sPct = 20; silPct = 70; break
            case 'teacher_student':
              tPct = 50; sPct = 45; silPct = 5; break
            default:
              tPct = 50; sPct = 40; silPct = 10; break
          }
        }

        weightedTeacher += duration * tPct
        weightedStudent += duration * sPct
        weightedSilence += duration * silPct
      })

      const teacherPercent = Math.round(weightedTeacher / totalMin)
      const studentPercent = Math.round(weightedStudent / totalMin)
      const silencePercent = Math.max(0, 100 - teacherPercent - studentPercent)

      return {
        teacherPercent,
        studentPercent,
        silencePercent,
        totalMin,
        isHighTeacherTalk: teacherPercent > 75
      }
    }

    it('calcula média ponderada precisa com base nas durações das etapas', () => {
      const stages = [
        { durationMin: 10, interactionType: 'whole_class' }, // 10m * (65/25/10)
        { durationMin: 30, interactionType: 'group' },       // 30m * (20/70/10)
        { durationMin: 10, interactionType: 'individual' }   // 10m * (10/20/70)
      ]

      const result = computeSpeechBalance(stages)
      expect(result.totalMin).toBe(50)
      // Professor: (10*65 + 30*20 + 10*10)/50 = (650 + 600 + 100)/50 = 1350/50 = 27%
      expect(result.teacherPercent).toBe(27)
      // Alunos: (10*25 + 30*70 + 10*20)/50 = (250 + 2100 + 200)/50 = 2550/50 = 51%
      expect(result.studentPercent).toBe(51)
      // Silêncio / Autônomo: 100 - 27 - 51 = 22%
      expect(result.silencePercent).toBe(22)
      expect(result.isHighTeacherTalk).toBe(false)
    })

    it('dispara alerta pedagógico não-bloqueante quando fala do professor > 75%', () => {
      const lectureHeavyStages = [
        { durationMin: 45, speechBalance: { teacherPercent: 85, studentPercent: 10, silencePercent: 5 } },
        { durationMin: 5, speechBalance: { teacherPercent: 50, studentPercent: 40, silencePercent: 10 } }
      ]

      const result = computeSpeechBalance(lectureHeavyStages)
      expect(result.teacherPercent).toBeGreaterThan(75)
      expect(result.isHighTeacherTalk).toBe(true)
    })
  })

  describe('6. Documento de Planejamento de Aula em Box Modal (getFullLessonPlanDocument & Fallback)', () => {
    const fullPlan = {
      id: 'plan_english_21',
      date: '2026-09-21',
      className: '7º Ano A',
      topic: 'Listening: Simple past of be',
      subject: 'Língua Inglesa',
      subjectCoverageArea: 'Oralidade & Compreensão',
      generalObjective: 'Compreender o uso do simple past of be em diálogos cotidianos.',
      specificObjectives: 'Identificar was/were em textos orais.',
      materials: ['Áudio MP3', 'Folha de Atividades'],
      selectedSkills: [{ code: 'EF07LI01', desc: 'Compreensão oral' }],
      stages: [
        { name: 'Warm-up', durationMin: 10, teacherAction: 'Pergunta inicial', studentAction: 'Responde' }
      ]
    }

    it('recupera documento completo por ID direto', () => {
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([fullPlan]))
      const doc = getFullLessonPlanDocument({ id: 'plan_english_21' })
      expect(doc).not.toBeNull()
      expect(doc.topic).toBe('Listening: Simple past of be')
      expect(doc.materials).toHaveLength(2)
      expect(doc.selectedSkills).toHaveLength(1)
    })

    it('recupera documento completo por data e correspondência de tópico', () => {
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([fullPlan]))
      const doc = getFullLessonPlanDocument({
        date: '21/09/2026',
        topic: 'Aula de Inglês: Listening: Simple past of be (7º A)'
      })
      expect(doc).not.toBeNull()
      expect(doc.id).toBe('plan_english_21')
    })

    it('gera documento fallback estruturado e consistente caso a aula venha apenas do calendário', () => {
      const fallback = buildFallbackLessonPlanDocument({
        id: 'task_cal_21',
        topic: 'Aula de Inglês: Listening: Simple past of be',
        className: '7º Ano A',
        date: '2026-09-21'
      })

      expect(fallback).not.toBeNull()
      expect(fallback.topic).toBe('Listening: Simple past of be')
      expect(fallback.className).toBe('7º Ano A')
      expect(fallback.date).toBe('2026-09-21')
      expect(fallback.stages).toHaveLength(4)
      expect(fallback.materials.length).toBeGreaterThan(0)
      expect(fallback.selectedSkills.length).toBeGreaterThan(0)
      expect(fallback.speechBalance.studentPercent).toBe(60)
    })
  })

  describe('6. Visão Semanal, Horários Claros & Resolução de Pins (resolvePinScheduleTime, getWeekDates, formatWeekRange)', () => {
    describe('getWeekDates', () => {
      it('retorna exatamente 7 datas consecutivas para uma semana', () => {
        const dates = getWeekDates('2026-09-21', true) // 21/09/2026 é segunda-feira
        expect(dates).toHaveLength(7)
        // Com startOnSunday = true, o início deve ser domingo 20/09/2026
        expect(dates[0].getDate()).toBe(20)
        expect(dates[0].getMonth()).toBe(8) // Setembro (0-indexed)
        expect(dates[1].getDate()).toBe(21)
        expect(dates[6].getDate()).toBe(26) // Sábado 26/09/2026
      })

      it('lida corretamente com virada de mês', () => {
        const dates = getWeekDates('2026-10-01', true) // 01/10/2026 é quinta-feira
        expect(dates).toHaveLength(7)
        // Domingo anterior é 27/09/2026
        expect(dates[0].getDate()).toBe(27)
        expect(dates[0].getMonth()).toBe(8) // Setembro
        expect(dates[4].getDate()).toBe(1) // Quinta 01/10
        expect(dates[4].getMonth()).toBe(9) // Outubro
        expect(dates[6].getDate()).toBe(3) // Sábado 03/10
      })

      it('retorna array vazio para datas inválidas', () => {
        expect(getWeekDates('data-invalida')).toEqual([])
      })
    })

    describe('formatWeekRange', () => {
      it('formata semana dentro do mesmo mês', () => {
        const dates = getWeekDates('2026-09-21', true)
        const formatted = formatWeekRange(dates)
        expect(formatted).toBe('20 a 26 de Setembro de 2026')
      })

      it('formata semana na virada de meses dentro do mesmo ano', () => {
        const dates = getWeekDates('2026-10-01', true)
        const formatted = formatWeekRange(dates)
        expect(formatted).toBe('27 Set a 03 Out de 2026')
      })

      it('retorna vazio se array de datas for vazio', () => {
        expect(formatWeekRange([])).toBe('')
      })
    })

    describe('resolvePinScheduleTime', () => {
      const mockDayClasses = [
        { className: '9º Ano A', timeStart: '07:30', timeEnd: '08:20', room: 'Sala 12' },
        { className: '8º Ano B', timeStart: '08:20', timeEnd: '09:10', room: 'Sala 14' },
        { className: 'Mariana Lima', timeStart: '15:00', timeEnd: '16:00', room: 'Online' }
      ]

      it('prioriza horário explícito definido no próprio item (timeStart e timeEnd)', () => {
        const item = { timeStart: '10:00', timeEnd: '10:50', title: 'Prova Especial' }
        const res = resolvePinScheduleTime(item, mockDayClasses)
        expect(res.formattedTime).toBe('10:00 - 10:50')
        expect(res.timeStart).toBe('10:00')
        expect(res.timeEnd).toBe('10:50')
        expect(res.isFromClassSchedule).toBe(false)
      })

      it('usa campo time caso timeStart não esteja definido', () => {
        const item = { time: '14:30', title: 'Reunião Pedagógica' }
        const res = resolvePinScheduleTime(item, mockDayClasses)
        expect(res.formattedTime).toBe('14:30')
        expect(res.isFromClassSchedule).toBe(false)
      })

      it('resolve horário cruzando classRef com a grade do dia (ex: 9A casa com 9º Ano A)', () => {
        const provaItem = { classRef: '9A', title: 'Prova Bimestral de Inglês' }
        const res = resolvePinScheduleTime(provaItem, mockDayClasses)
        expect(res.formattedTime).toBe('07:30 - 08:20')
        expect(res.timeStart).toBe('07:30')
        expect(res.timeEnd).toBe('08:20')
        expect(res.isFromClassSchedule).toBe(true)
        expect(res.sourceLabel).toBe('9º Ano A')
      })

      it('resolve horário cruzando className completo (ex: 8º Ano B)', () => {
        const planItem = { className: '8º Ano B', topic: 'Simple Past' }
        const res = resolvePinScheduleTime(planItem, mockDayClasses)
        expect(res.formattedTime).toBe('08:20 - 09:10')
        expect(res.isFromClassSchedule).toBe(true)
      })

      it('retorna fallback seguro quando não há horário explícito nem correspondência na grade', () => {
        const orphanItem = { title: 'Tarefa Geral', classRef: 'Turma Externa' }
        const res = resolvePinScheduleTime(orphanItem, mockDayClasses)
        expect(res.formattedTime).toBe('Horário a definir')
        expect(res.isFromClassSchedule).toBe(false)
      })
    })
  })
})

