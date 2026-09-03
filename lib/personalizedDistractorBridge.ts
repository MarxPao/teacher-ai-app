/**
 * lib/personalizedDistractorBridge.ts — Conexão entre Memória Viva (studentMemory) e Geração de Distratores
 */

import { getStudentMemory, StudentMemory } from './studentMemory'
import { getSubjectProfile, SubjectProfile } from './subjectProfile'

export interface StudentDeficitItem {
  category: string
  description: string
  exampleSnippet?: string
}

export interface StudentDeficitProfile {
  studentId: string
  studentName: string
  subject: string
  vulnerabilities: StudentDeficitItem[]
  recommendedFocus: string[]
}

export function extractStudentDeficitProfile(studentId: string): StudentDeficitProfile | null {
  const memory = getStudentMemory(studentId)
  if (!memory) return null


  const profile = getSubjectProfile()
  const patterns = profile.distractorPatterns || []


  const vulnerabilities: StudentDeficitItem[] = []
  const focusSet = new Set<string>()


  memory.observations.forEach(obs => {
    const text = obs.note.toLowerCase()
    patterns.forEach(pat => {
      if (text.includes(pat.pattern.toLowerCase()) || text.includes(pat.id.toLowerCase()) || text.includes('dificuldade') || text.includes('bloqueio')) {
        vulnerabilities.push({
          category: obs.category || pat.pattern,
          description: pat.pedagogicNote,
          exampleSnippet: obs.note,
        })
        focusSet.add(pat.pattern)
      }
    })
  })


  memory.examHistory.filter(ex => ex.score < 6.0).forEach(ex => {
    focusSet.add(ex.topic)
    vulnerabilities.push({
      category: ex.topic,
      description: 'Rendimento abaixo da média no exame de ' + ex.topic + ' (Nota ' + ex.score + '/10).',
    })
  })


  if (vulnerabilities.length === 0 && patterns.length > 0) {
    vulnerabilities.push({
      category: patterns[0].pattern,
      description: patterns[0].pedagogicNote,
    })
    focusSet.add(patterns[0].pattern)
  }


  return {
    studentId: memory.studentId,
    studentName: memory.studentName,
    subject: profile.name,
    vulnerabilities: vulnerabilities.slice(0, 3),
    recommendedFocus: Array.from(focusSet).slice(0, 3),
  }
}

export function composePersonalizedDistractorPrompt(deficit: StudentDeficitProfile): string {
  const vulnList = deficit.vulnerabilities
    .map((v, i) => '  ' + (i + 1) + '. [' + v.category + '] ' + v.description + (v.exampleSnippet ? ' (Histórico: "' + v.exampleSnippet + '")' : ''))
    .join('\n')


  return (
    '\n[DIRETIVA DE DISTRATORES INDIVIDUALIZADOS PARA O ALUNO: ' + deficit.studentName.toUpperCase() + ']\n' +
    'O aluno possui histórico documentado das seguintes fragilidades pedagógicas:\n' +
    vulnList + '\n\n' +
    'INSTRUÇAO OBRIGATÓRIA DE GERAÇÃO:\n' +
    'Nas alternativas incorretas (distratores) das questões de múltipla escolha:\n' +
    '- Pelo menos DUAS alternativas DEVEM reproduzir os vícios e equívocos listados acima.\n' +
    '- No gabarito comentado, forneça para cada distrator a chave "distractorExplanations" explicitando qual erro conceitual do aluno aquela alternativa explora.\n'
  )
}
