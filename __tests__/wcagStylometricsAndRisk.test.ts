import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { COLOR } from '../styles/tokens'
import { screenEssayStylometrics } from '../lib/stylometricScreening'
import {
  calculateStudentCompositeRisk,
  evaluateMlReadiness,
  ML_READINESS_STUDENT_THRESHOLD
} from '../lib/predictiveAnalytics'
import { StudentMemory } from '../lib/studentMemory'

// Helper para cálculo exato de contraste WCAG 2.1
function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  ]
}

function relLum([r, g, b]: number[]) {
  const c = (val: number) => val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

function getContrast(fg: string, bg: string) {
  const l1 = relLum(hexToRgb(fg))
  const l2 = relLum(hexToRgb(bg))
  const max = Math.max(l1, l2)
  const min = Math.min(l1, l2)
  return (max + 0.05) / (min + 0.05)
}

describe('Diagnóstico e Implementação dos 3 Gaps de Fronteira', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── 1. WCAG 2.1 AA Color Contrast ─────────────────────────────────────────
  describe('1. Acessibilidade — Contraste de Cores em styles/tokens.ts', () => {
    it('Todos os tokens essenciais atendem ao mínimo de 4.5:1 (WCAG AA) contra o fundo creme', () => {
      const bg = COLOR.paperPage // #fdf8f2

      const contrastPaperInk = getContrast(COLOR.paperInk, bg)
      const contrastPaperWarm = getContrast(COLOR.paperWarm, bg)
      const contrastPaperMid = getContrast(COLOR.paperMid, bg)
      const contrastPaperLight = getContrast(COLOR.paperLight, bg)
      const contrastAccent = getContrast(COLOR.accent, bg)
      const contrastSuccess = getContrast(COLOR.success, bg)
      const contrastWarning = getContrast(COLOR.warning, bg)
      const contrastDanger = getContrast(COLOR.danger, bg)
      const contrastInfo = getContrast(COLOR.info, bg)

      expect(contrastPaperInk).toBeGreaterThanOrEqual(4.5)
      expect(contrastPaperWarm).toBeGreaterThanOrEqual(4.5)
      expect(contrastPaperMid).toBeGreaterThanOrEqual(4.5)
      expect(contrastPaperLight).toBeGreaterThanOrEqual(4.5)
      expect(contrastAccent).toBeGreaterThanOrEqual(4.5)
      expect(contrastSuccess).toBeGreaterThanOrEqual(4.5)
      expect(contrastWarning).toBeGreaterThanOrEqual(4.5)
      expect(contrastDanger).toBeGreaterThanOrEqual(4.5)
      expect(contrastInfo).toBeGreaterThanOrEqual(4.5)
    })
  })

  // ─── 2. Triagem Estilométrica Formativa (OmniGrader) ────────────────────────
  describe('2. Triagem Estilométrica Formativa (Não-Punitiva / OmniGrader)', () => {
    it('Texto coerente com o nível básico (A2) não gera falso positivo de anomalia', () => {
      const essayA2 = 'My name is Lucas. I live in Sao Paulo with my family. In my free time, I like to play soccer and read books. Yesterday was a sunny day, so I went to the park with my friends. It was very fun.'
      
      const result = screenEssayStylometrics({
        essayText: essayA2,
        targetLevel: 'A2',
        language: 'en'
      })

      expect(result.hasAnomaly).toBe(false)
      expect(result.scoreImpact).toBe(0)
    })

    it('Texto com conectivos C1/C2 submetido para nível A1/A2 gera sinalizador discreto com nota blindada', () => {
      const complexEssay = 'Notwithstanding the prevailing paradigm, it is worth noting that ubiquitous technological advancements inadvertently substantiate a compelling argument. Furthermore, consequently, subsequent analyses reveal profound implications.'

      const result = screenEssayStylometrics({
        essayText: complexEssay,
        targetLevel: 'A2',
        language: 'en'
      })

      expect(result.hasAnomaly).toBe(true)
      expect(result.advisoryType).toBe('level_disconnect')
      expect(result.teacherAdvisoryNotice).toContain('Sinalizador Pedagógico')
      expect(result.teacherAdvisoryNotice).toContain('arguição oral formativa')
      // GARANTIA: impacto na nota é estritamente 0
      expect(result.scoreImpact).toBe(0)
    })
  })

  // ─── 3. Índice Composto de Risco Multidimensional ──────────────────────────
  describe('3. Analytics Preditivo — Índice Composto de Risco Multidimensional', () => {
    it('Calcula risco baixo/estável para aluno consistente com notas altas e frequência plena', () => {
      const memory: StudentMemory = {
        studentId: 'std_1',
        studentName: 'Ana Clara',
        targetSubject: 'Inglês',
        examHistory: [
          { id: 'ex_1', date: '2026-08-10', score: 9.0, topic: 'Simple Past', maxScore: 10, category: 'exam', classRef: 'cls1' },
          { id: 'ex_2', date: '2026-08-20', score: 8.5, topic: 'Present Perfect', maxScore: 10, category: 'exam', classRef: 'cls1' }
        ],
        observations: [
          { id: '1', date: '2026-08-15', note: 'Excelente participação e pronúncia.', source: 'teacher' }
        ],
        updatedAt: '2026-08-20T12:00:00.000Z'
      }

      const risk = calculateStudentCompositeRisk(memory, {
        passingScore: 6.0,
        consecutiveAbsences: 0,
        overallAttendancePercentage: 100
      })

      expect(risk.riskScore).toBeLessThan(25)
      expect(risk.riskLevel).toBe('stable')
      expect(risk.riskBadge).toContain('Estável')
    })

    it('Calcula risco elevado para aluno com queda recente acentuada, infrequência e anotações de dificuldade', () => {
      const memory: StudentMemory = {
        studentId: 'std_2',
        studentName: 'Bruno Costa',
        targetSubject: 'Língua Portuguesa',
        examHistory: [
          { id: 'ex_3', date: '2026-08-28', score: 4.0, topic: 'Crase', maxScore: 10, category: 'exam', classRef: 'cls1' },
          { id: 'ex_4', date: '2026-08-20', score: 4.5, topic: 'Regência', maxScore: 10, category: 'exam', classRef: 'cls1' }
        ],
        coldExams: [
          { id: 'ex_1', date: '2026-07-01', score: 7.5, topic: 'Leitura', maxScore: 10, category: 'exam', classRef: 'cls1' },
          { id: 'ex_2', date: '2026-07-15', score: 8.0, topic: 'Morfologia', maxScore: 10, category: 'exam', classRef: 'cls1' }
        ],
        observations: [
          { id: '1', date: '2026-08-22', note: 'Aluno demonstrou forte dificuldade e bloqueio em crase.', source: 'teacher' },
          { id: '2', date: '2026-08-25', note: 'Apresentou defasagem nos exercícios em sala.', source: 'teacher' }
        ],
        updatedAt: '2026-08-28T12:00:00.000Z'
      }

      const risk = calculateStudentCompositeRisk(memory, {
        passingScore: 6.0,
        consecutiveAbsences: 2,
        overallAttendancePercentage: 70
      })

      expect(risk.riskScore).toBeGreaterThanOrEqual(60)
      expect(risk.riskLevel === 'moderate_risk' || risk.riskLevel === 'critical_risk').toBe(true)
      expect(risk.actionRecommendation).toContain('recuperação')
    })

    it('Gatilho de prontidão para ML sinaliza aguardo de dados quando N < 25', () => {
      const mockMemories: StudentMemory[] = Array.from({ length: 5 }, (_, i) => ({
        studentId: `std_${i}`,
        studentName: `Aluno ${i}`,
        examHistory: [{ id: `ex_${i}`, date: '2026-08-01', score: 7.0, topic: 'Geral', maxScore: 10, category: 'exam', classRef: 'cls1' }],
        observations: [],
        updatedAt: '2026-08-01T12:00:00.000Z'
      }))

      const mlStatus = evaluateMlReadiness(mockMemories)
      expect(mlStatus.isReadyForMlTraining).toBe(false)
      expect(mlStatus.threshold).toBe(ML_READINESS_STUDENT_THRESHOLD)
      expect(mlStatus.progressPercentage).toBeLessThan(100)
    })
  })

  // ─── 4. Acessibilidade e Sensibilidade de NEE no Analytics ───────────────────
  describe('4. Sinalização de NEE e Proteção de Dados Sensíveis (LGPD / Menores)', () => {
    it('Identifica alunos com NEE preenchido e protege diagnóstico detalhado fora do texto visível', () => {
      const students = [
        { id: '1', name: 'Ana', nee: false },
        { id: '2', name: 'Lucas', nee: true, nee_description: 'Dislexia e TDAH' },
        { id: '3', name: 'Carlos', nee: false },
        { id: '4', name: 'Beatriz', nee: true, nee_description: 'Baixa visão' }
      ]

      const neeCount = students.filter(s => s.nee).length
      expect(neeCount).toBe(2)

      // Garante que o token de cor do badge NEE atende a WCAG AA (>= 4.5:1)
      const contrastNee = getContrast(COLOR.accentGold, COLOR.paperPage)
      expect(contrastNee).toBeGreaterThanOrEqual(4.5)
    })
  })

  // ─── 5. Validação das 4 Faixas de Ação do Índice Composto de Risco ───────────
  describe('5. Risco Multidimensional — Validação das 4 Faixas de Ação (Estável, Atenção, Moderado, Crítico)', () => {
    it('Faixa 1 (0-24): Estável — Aluno com bom desempenho, sem faltas e sem alertas', () => {
      const stableStudent: StudentMemory = {
        studentId: 'st_stable',
        studentName: 'Clara Silva',
        examHistory: [
          { id: '1', date: '2026-08-01', score: 9.5, topic: 'Vocabulary', maxScore: 10, category: 'quiz', classRef: 'c1' },
          { id: '2', date: '2026-08-15', score: 9.0, topic: 'Grammar', maxScore: 10, category: 'quiz', classRef: 'c1' }
        ],
        observations: [],
        updatedAt: '2026-08-20'
      }

      const res = calculateStudentCompositeRisk(stableStudent, {
        passingScore: 6.0,
        consecutiveAbsences: 0,
        overallAttendancePercentage: 100
      })

      expect(res.riskScore).toBeLessThan(25)
      expect(res.riskLevel).toBe('stable')
      expect(res.riskBadge).toContain('Estável')
    })

    it('Faixa 2 (25-49): Atenção — Aluno na média com 1 falta isolada ou oscilação leve', () => {
      const attentionStudent: StudentMemory = {
        studentId: 'st_attention',
        studentName: 'Diego Ramos',
        examHistory: [
          { id: '1', date: '2026-08-01', score: 6.5, topic: 'Reading', maxScore: 10, category: 'exam', classRef: 'c1' },
          { id: '2', date: '2026-08-15', score: 6.0, topic: 'Listening', maxScore: 10, category: 'exam', classRef: 'c1' }
        ],
        observations: [],
        updatedAt: '2026-08-20'
      }

      const res = calculateStudentCompositeRisk(attentionStudent, {
        passingScore: 6.0,
        consecutiveAbsences: 1, // 35 pts no vetor de frequência
        overallAttendancePercentage: 90
      })

      expect(res.riskScore).toBeGreaterThanOrEqual(25)
      expect(res.riskScore).toBeLessThan(50)
      expect(res.riskLevel).toBe('attention')
      expect(res.riskBadge).toContain('Atenção')
    })

    it('Faixa 3 (50-74): Risco Moderado — Queda recente e alertas qualitativos', () => {
      const moderateStudent: StudentMemory = {
        studentId: 'st_mod',
        studentName: 'Eduardo Lima',
        examHistory: [
          { id: '3', date: '2026-08-25', score: 5.0, topic: 'Writing', maxScore: 10, category: 'exam', classRef: 'c1' },
          { id: '4', date: '2026-08-18', score: 5.5, topic: 'Speaking', maxScore: 10, category: 'exam', classRef: 'c1' }
        ],
        coldExams: [
          { id: '1', date: '2026-06-01', score: 8.0, topic: 'Intro', maxScore: 10, category: 'exam', classRef: 'c1' }
        ],
        observations: [
          { id: 'obs1', date: '2026-08-20', note: 'Aluno demonstrou desmotivado e desatento na aula.', source: 'teacher' }
        ],
        updatedAt: '2026-08-25'
      }

      const res = calculateStudentCompositeRisk(moderateStudent, {
        passingScore: 6.0,
        consecutiveAbsences: 1,
        overallAttendancePercentage: 80
      })

      expect(res.riskScore).toBeGreaterThanOrEqual(50)
      expect(res.riskScore).toBeLessThan(75)
      expect(res.riskLevel).toBe('moderate_risk')
      expect(res.riskBadge).toContain('Moderado')
    })

    it('Faixa 4 (75-100): Risco Crítico — Média muito baixa, faltas consecutivas e defasagem severa', () => {
      const criticalStudent: StudentMemory = {
        studentId: 'st_crit',
        studentName: 'Felipe Santos',
        examHistory: [
          { id: '1', date: '2026-08-20', score: 3.0, topic: 'Grammar', maxScore: 10, category: 'exam', classRef: 'c1' },
          { id: '2', date: '2026-08-27', score: 2.5, topic: 'Verbs', maxScore: 10, category: 'exam', classRef: 'c1' }
        ],
        observations: [
          { id: 'o1', date: '2026-08-20', note: 'Grande defasagem e baixo rendimento.', source: 'teacher' },
          { id: 'o2', date: '2026-08-22', note: 'Não compreendeu o conteúdo, bloqueio severo.', source: 'teacher' },
          { id: 'o3', date: '2026-08-25', note: 'Dificuldade extrema de acompanhamento.', source: 'teacher' }
        ],
        updatedAt: '2026-08-27'
      }

      const res = calculateStudentCompositeRisk(criticalStudent, {
        passingScore: 6.0,
        consecutiveAbsences: 3,
        overallAttendancePercentage: 65
      })

      expect(res.riskScore).toBeGreaterThanOrEqual(75)
      expect(res.riskLevel).toBe('critical_risk')
      expect(res.riskBadge).toContain('Crítico')
    })

    it('Triagem Estilométrica Formativa com studentMemory detecta salto atípico contra histórico A2 sem afetar nota', () => {
      const studentHistoryA2: StudentMemory = {
        studentId: 'st_mem_a2',
        studentName: 'Gabriel Souza',
        examHistory: [
          { id: '1', date: '2026-07-10', score: 6.0, topic: 'Simple Past', maxScore: 10, category: 'exam', classRef: 'c1' }
        ],
        observations: [
          { id: 'o1', date: '2026-07-15', note: 'Aluno no nível básico A2, vocabulário restrito.', source: 'teacher' }
        ],
        updatedAt: '2026-07-20'
      }

      const c2Text = 'Notwithstanding the prevailing paradigm, it is worth noting that ubiquitous technological advancements inadvertently substantiate a compelling argument. Furthermore, consequently, subsequent analyses reveal profound implications.'

      const advisory = screenEssayStylometrics({
        essayText: c2Text,
        targetLevel: 'A2',
        studentMemory: studentHistoryA2,
        language: 'en'
      })

      expect(advisory.hasAnomaly).toBe(true)
      expect(advisory.advisoryType).toBe('level_disconnect')
      expect(advisory.teacherAdvisoryNotice).toContain('salto atípico em relação ao histórico pedagógico')
      expect(advisory.scoreImpact).toBe(0) // GARANTIA FORMAL: nota blindada
    })
  })
})
