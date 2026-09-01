import {
  evaluateItemPsychometrics,
  StudentItemResponse
} from '../lib/psychometricsEngine'
import {
  saveTeacherStyleProfile,
  buildTeacherStyleSystemPrompt
} from '../lib/teacherStyleProfile'

// Mock simples de localStorage
const store: Record<string, string> = {}
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true
})

console.log('================================================================================')
console.log('EVIDÊNCIA 1 — INJEÇÃO DO TEACHER STYLE PROFILE NOS MÓDULOS RESTANTES')
console.log('================================================================================')

// 1.1 Configura o estilo do professor
saveTeacherStyleProfile({
  teacherName: 'Professora Mariana Castro',
  defaultSubject: 'english',
  preferredTone: 'direto_tecnico',
  feedbackLength: 'conciso',
  gradingRigor: 4,
  customInstructions: 'Enfatizar precisão de linkers e regras gramaticais da BNCC.',
  fewShotExamples: [
    {
      id: 'ex_1',
      studentWorkExcerpt: 'If I was rich, I will buy a car.',
      correctionFeedback: 'Na 2ª condicional hipotética, usamos "were" e "would" (ex: "If I were rich, I would buy a car").',
      scoreGiven: 6.5,
      category: 'Conditionals',
      approvedAt: '2026-09-01'
    }
  ]
})

const generatedSystemPrompt = buildTeacherStyleSystemPrompt()
console.log('--- DIRETIVA GERADA E INJETADA EM LESSONSTUDIO, PARENTCOMMS E AUTOREPORT ---')
console.log(generatedSystemPrompt)

console.log('================================================================================')
console.log('EVIDÊNCIA 2 — CALIBRAÇÃO EMPÍRICA DE DIFICULDADE (p-value, D de Kelley e Alertas)')
console.log('================================================================================')

// Caso A: Questão Nominalmente Fácil aplicada a turma de 12 alunos com 10 erros (Divergência Crítica)
const questionAResponses: StudentItemResponse[] = [
  { studentId: 'aluno_01', correct: false, totalExamScore: 6.0 },
  { studentId: 'aluno_02', correct: false, totalExamScore: 5.5 },
  { studentId: 'aluno_03', correct: false, totalExamScore: 5.0 },
  { studentId: 'aluno_04', correct: false, totalExamScore: 4.5 },
  { studentId: 'aluno_05', correct: false, totalExamScore: 4.0 },
  { studentId: 'aluno_06', correct: false, totalExamScore: 3.5 },
  { studentId: 'aluno_07', correct: false, totalExamScore: 3.0 },
  { studentId: 'aluno_08', correct: false, totalExamScore: 2.5 },
  { studentId: 'aluno_09', correct: false, totalExamScore: 2.0 },
  { studentId: 'aluno_10', correct: false, totalExamScore: 1.5 },
  { studentId: 'aluno_11', correct: true,  totalExamScore: 9.0 },
  { studentId: 'aluno_12', correct: true,  totalExamScore: 8.5 }
]

const resultA = evaluateItemPsychometrics(questionAResponses, 'Fácil')
console.log('--- CASO A: QUESTÃO NOMINAL FÁCIL COM 83% DE ERRO REAL (N = 12) ---')
console.log(JSON.stringify(resultA, null, 2))

// Caso B: Questão com Discriminação Negativa (Alunos com nota baixa acertam, alunos top erram)
const questionBResponses: StudentItemResponse[] = [
  { studentId: 'top_01', correct: false, totalExamScore: 10.0 },
  { studentId: 'top_02', correct: false, totalExamScore: 9.5 },
  { studentId: 'top_03', correct: false, totalExamScore: 9.0 },
  { studentId: 'mid_04', correct: false, totalExamScore: 7.0 },
  { studentId: 'mid_05', correct: false, totalExamScore: 6.5 },
  { studentId: 'mid_06', correct: false, totalExamScore: 6.0 },
  { studentId: 'low_07', correct: true,  totalExamScore: 4.0 },
  { studentId: 'low_08', correct: true,  totalExamScore: 3.5 },
  { studentId: 'low_09', correct: true,  totalExamScore: 3.0 },
  { studentId: 'low_10', correct: true,  totalExamScore: 2.0 }
]

const resultB = evaluateItemPsychometrics(questionBResponses, 'Médio')
console.log('\n--- CASO B: QUESTÃO COM DISCRIMINAÇÃO NEGATIVA (GABARITO INVERTIDO / PEGADINHA) ---')
console.log(JSON.stringify(resultB, null, 2))
