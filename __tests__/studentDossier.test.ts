import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getOrCreateStudentDossier,
  getStudentDossier,
  ingestOmniGraderEvaluation,
  addStudentAccommodation,
  purgeStudentDossier,
  buildStudentDossierContext,
  cleanStudentName
} from '../lib/studentDossier'

describe('studentDossier — Dossiê Longitudinal do Aluno (Fase 2)', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val },
      removeItem: (key: string) => { delete mockStorage[key] },
      clear: () => { mockStorage = {} },
      length: 0,
      key: () => null
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deve normalizar o nome de aluno sem acentos e em lowercase', () => {
    expect(cleanStudentName('Álice Sôuza!')).toBe('alice souza')
    expect(cleanStudentName('  João Pedro  ')).toBe('joao pedro')
  })

  it('deve criar dossiê e ingerir avaliação do OmniGrader atualizando média e histórico', () => {
    const dossier = ingestOmniGraderEvaluation({
      studentName: 'Alice Souza',
      score: 8.5,
      feedback: 'Ótima estruturação dissertativa com argumentação consistente.',
      topic: 'Redação Tema ENEM',
      strengths: ['Coesão Textual', 'Riqueza de Vocabulário'],
      difficulties: ['Pontuação em Oração Coordenada']
    })

    expect(dossier.studentNameClean).toBe('alice souza')
    expect(dossier.lastGradeAverage).toBe(8.5)
    expect(dossier.pedagogicalProfile.strengths).toContain('Coesão Textual')
    expect(dossier.pedagogicalProfile.persistentDifficulties).toContain('Pontuação em Oração Coordenada')
    expect(dossier.pedagogicalProfile.learningTrajectory).toHaveLength(1)

    // Segunda avaliação para o mesmo aluno atualizando média ponderada
    const secondDossier = ingestOmniGraderEvaluation({
      studentName: 'Alice Souza',
      score: 9.5,
      feedback: 'Evolução notável na pontuação.',
      topic: 'Redação Narrativa',
      strengths: ['Clareza Argumentativa']
    })

    expect(secondDossier.lastGradeAverage).toBe(9) // (8.5 + 9.5) / 2 = 9.0
    expect(secondDossier.pedagogicalProfile.learningTrajectory).toHaveLength(2)
    expect(secondDossier.pedagogicalProfile.strengths).toContain('Clareza Argumentativa')
  })

  it('deve adicionar acomodações pedagógicas sem duplicidade', () => {
    addStudentAccommodation('Hugo Santos', 'Tempo Estendido (+20 min)')
    const updated = addStudentAccommodation('Hugo Santos', 'Tempo Estendido (+20 min)')

    expect(updated.pedagogicalProfile.accommodations).toHaveLength(1)
    expect(updated.pedagogicalProfile.accommodations[0]).toBe('Tempo Estendido (+20 min)')
  })

  it('deve gerar snippet resumido de contexto para o prompt da Rafinha', () => {
    ingestOmniGraderEvaluation({
      studentName: 'Beatriz Lima',
      score: 7.0,
      strengths: ['Criatividade'],
      difficulties: ['Concordância Nominal']
    })
    addStudentAccommodation('Beatriz Lima', 'Apoio visual em enunciados')

    const context = buildStudentDossierContext('Beatriz Lima')
    expect(context).toContain('[Dossiê Longitudinal: Beatriz Lima]')
    expect(context).toContain('Média Recente: 7/10')
    expect(context).toContain('Criatividade')
    expect(context).toContain('Concordância Nominal')
    expect(context).toContain('Apoio visual em enunciados')
  })

  it('deve realizar purga de dossiê do aluno em conformidade com LGPD', () => {
    ingestOmniGraderEvaluation({ studentName: 'Aluno Temporário', score: 5.0 })
    expect(getStudentDossier('Aluno Temporário')).not.toBeNull()

    const purged = purgeStudentDossier('Aluno Temporário')
    expect(purged).toBe(true)
    expect(getStudentDossier('Aluno Temporário')).toBeNull()
  })
})
