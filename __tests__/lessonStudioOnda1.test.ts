import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getSubjectProfile, getSubjectProfileById } from '../lib/subjectProfile'
import '../lib/subjects/portuguese'

describe('LessonStudio Onda 1 Enhancements Suite', () => {
  const lessonStudioPath = path.resolve(__dirname, '../components/modules/LessonStudio.tsx')
  const lessonStudioCode = fs.readFileSync(lessonStudioPath, 'utf8')

  it('1. Elimina hardcoded "Língua Inglesa" na coordenação pedagógica da IA', () => {
    // Não deve conter a string fixa "Você é um coordenador pedagógico sênior de Ensino de Língua Inglesa."
    expect(lessonStudioCode).not.toContain('Você é um coordenador pedagógico sênior de Ensino de Língua Inglesa.')
    // Deve usar interpolação com activeProfile.name
    expect(lessonStudioCode).toContain('Você é um coordenador pedagógico sênior de Ensino de ${activeProfile.name}.')
  })

  it('2. Elimina hardcoded "Aula de Inglês" nas tarefas de calendário', () => {
    // Não deve conter título fixo "Aula de Inglês"
    expect(lessonStudioCode).not.toContain("title: `Aula de Inglês:")
    // Deve usar interpolação dinâmica com o perfil ativo
    expect(lessonStudioCode).toContain("title: `Aula de ${activeProfile.nameShort || activeProfile.name}:")
  })

  it('3. Integração com SubjectProfile: suporta alternância de perfis pedagógicos', () => {
    const english = getSubjectProfile('english')
    const portuguese = getSubjectProfile('portuguese')

    expect(english.name).toBe('Língua Inglesa')
    expect(portuguese.name).toBe('Língua Portuguesa')
    expect(portuguese.nameShort).toBe('LP')
  })

  it('4. Incorpora Evidências de Avaliação UbD (Understanding by Design)', () => {
    // Deve incluir diretiva e parsing de assessmentEvidence
    expect(lessonStudioCode).toContain('assessmentEvidence')
    expect(lessonStudioCode).toContain('Evidências de Avaliação Formativa (UbD — Understanding by Design)')
    expect(lessonStudioCode).toContain('Wiggins & McTighe')
  })

  it('5. Validação de Carga Horária e Alerta Visual de Estouro de Tempo', () => {
    // Deve conter validação entre totalTiming e targetDurationMinutes
    expect(lessonStudioCode).toContain('targetDurationMinutes')
    expect(lessonStudioCode).toContain('Estouro de Carga Horária')
    expect(lessonStudioCode).toContain('totalTiming > targetDurationMinutes')
  })

  it('6. Migração para o componente Button do Design System', () => {
    // Deve importar e utilizar o componente Button
    expect(lessonStudioCode).toContain("import Button from '@/components/Button'")
    expect(lessonStudioCode).toContain('<Button')
  })
})
