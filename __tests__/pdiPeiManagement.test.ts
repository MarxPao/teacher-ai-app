import { describe, it, expect, beforeEach } from 'vitest'
import { PDI_SCHEMA } from '../lib/editableDocumentTypes'
import {
  createCarinaReferencePdi,
  getAllPdiRecords,
  saveStudentPdi,
  advancePdiToNextSemester,
  recordPdiCompetencyEvaluation,
  buildBnccSkillsMatrixForGrade,
  normalizePdiSkillStatus
} from '../lib/pdiManagement'
import { generateDocumentHtml } from '../lib/documentExportService'
import { buildStandalonePdiAssessmentDocumentHtml } from '../lib/exportUtils'

describe('PDI / PEI Canonical Structure, Semester Progression & Assessment Integration', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('exposes the 7 canonical sections in PDI_SCHEMA matching the official document', () => {
    const boxIds = PDI_SCHEMA.boxes.map(b => b.id)
    expect(boxIds).toContain('identificacao')
    expect(boxIds).toContain('objetivo_geral')
    expect(boxIds).toContain('plano_intervencao')
    expect(boxIds).toContain('matriz_habilidades')
    expect(boxIds).toContain('observacoes_evolucao')
    expect(boxIds).toContain('acompanhamento_revisao')
    expect(boxIds).toContain('assinaturas')
  })

  it('seeds the complete canonical PDI of Carina Miranda de Oliveira with 26 BNCC 6º ano skills', () => {
    const carina = createCarinaReferencePdi()
    expect(carina.studentName).toBe('Carina Miranda de Oliveira')
    expect(carina.identification?.gradeCycle).toBe('6º ano do Ensino Fundamental')
    expect(carina.identification?.shift).toBe('Matutino')
    expect(carina.identification?.regentTeacher).toBe('Rafaela Franco Toldo')
    expect(carina.identification?.pedagogicalTeam).toBe('Marianna Panisset')
    expect(carina.identification?.validityPeriod).toBe('1º semestre / 2026')
    expect(carina.identification?.nextReviewDate).toBe('Dezembro / 2026')
    expect(carina.interventionPlan).toHaveLength(7)
    expect(carina.skillsMatrix).toHaveLength(26)

    const ef01 = carina.skillsMatrix.find(s => s.skillCode === 'EF06LI01')
    const ef02 = carina.skillsMatrix.find(s => s.skillCode === 'EF06LI02')
    const ef06 = carina.skillsMatrix.find(s => s.skillCode === 'EF06LI06')
    const ef20 = carina.skillsMatrix.find(s => s.skillCode === 'EF06LI20')

    expect(ef01?.status).toBe('Sim')
    expect(ef02?.status).toBe('Em desenvolvimento')
    expect(ef06?.status).toBe('Não')
    expect(ef06?.workDoneOrAdaptedSkill).toBe('Habilidade será trabalhada no segundo semestre')
    expect(ef20?.status).toBe('Não')
    expect(ef20?.workDoneOrAdaptedSkill).toBe('Habilidade será trabalhada no 7º ano')
    expect(carina.generalObservations?.evolucaoGeral).toContain(
      'A aluna não necessita de adaptações de materiais ou de avaliações'
    )
  })

  it('advances PDI to the next semester, archiving the 1st semester snapshot and tracking competency completion', () => {
    const carina = createCarinaReferencePdi('student_carina_test')
    saveStudentPdi(carina)

    const nextSem = advancePdiToNextSemester(
      'student_carina_test',
      '2º semestre / 2026',
      'Julho / 2027'
    )
    expect(nextSem).not.toBeNull()
    expect(nextSem?.identification?.validityPeriod).toBe('2º semestre / 2026')
    expect(nextSem?.semesterHistory).toHaveLength(1)
    expect(nextSem?.semesterHistory?.[0].period).toBe('1º semestre / 2026')
    expect(nextSem?.semesterHistory?.[0].summaryStats.total).toBe(26)

    // EF06LI06 estava "Não" ("Habilidade será trabalhada no segundo semestre") -> entra "Em desenvolvimento" com registro anterior "Não"
    const ef06After = nextSem?.skillsMatrix.find(s => s.skillCode === 'EF06LI06')
    expect(ef06After?.previousSemesterStatus).toBe('Não')
    expect(ef06After?.status).toBe('Em desenvolvimento')
  })

  it('records competency evaluation from an Exam/Worksheet directly into the student PDI', () => {
    const carina = createCarinaReferencePdi('student_carina_eval')
    saveStudentPdi(carina)

    const updated = recordPdiCompetencyEvaluation(
      'student_carina_eval',
      'PROVA BIMESTRAL — SIMPLE PRESENT',
      [
        {
          skillCode: 'EF06LI02',
          status: 'Sim',
          note: 'Concluiu com autonomia a coleta de informações na prova escrita.'
        },
        {
          skillCode: 'EF06LI19',
          status: 'Sim',
          note: 'Dominou o uso do verbo to be e rotinas diárias.'
        }
      ],
      'exam_123'
    )

    expect(updated).not.toBeNull()
    const ef02 = updated?.skillsMatrix.find(s => s.skillCode === 'EF06LI02')
    const ef19 = updated?.skillsMatrix.find(s => s.skillCode === 'EF06LI19')
    expect(normalizePdiSkillStatus(ef02?.status)).toBe('Sim')
    expect(normalizePdiSkillStatus(ef19?.status)).toBe('Sim')
    expect(ef02?.evaluatedInActivities?.[0]?.activityTitle).toBe('PROVA BIMESTRAL — SIMPLE PRESENT')
  })

  it('generates the official 7-section PDI export HTML and the separate Documento 4 assessment sheet', () => {
    const carina = createCarinaReferencePdi()
    const pdiHtml = generateDocumentHtml({
      type: 'pdi',
      title: 'PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI)',
      schoolName: 'Colégio Machado Sobrinho',
      studentName: carina.studentName,
      data: carina
    })

    expect(pdiHtml).toContain('PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI)')
    expect(pdiHtml).toContain('1. Identificação')
    expect(pdiHtml).toContain('2. Objetivo geral do PDI')
    expect(pdiHtml).toContain('3. Estratégias pedagógicas e recursos de apoio')
    expect(pdiHtml).toContain('4. Habilidades esperadas — BNCC')
    expect(pdiHtml).toContain('5. Observações gerais e evolução do aluno')
    expect(pdiHtml).toContain('6. Acompanhamento e revisão')
    expect(pdiHtml).toContain('7. Assinaturas')
    expect(pdiHtml).toContain('EF06LI01')
    expect(pdiHtml).toContain('EF06LI26')

    const standaloneAssessmentHtml = buildStandalonePdiAssessmentDocumentHtml({
      studentName: carina.studentName,
      gradeCycle: '6º ano do Ensino Fundamental',
      shift: 'Matutino',
      validityPeriod: '1º semestre / 2026',
      regentTeacher: 'Rafaela Franco Toldo',
      pedagogicalTeam: 'Marianna Panisset',
      activityTitle: 'PROVA — WARHAMMER 40K & FALSE FRIENDS',
      activityType: 'exam',
      strategies: carina.interventionPlan,
      skillsMatrix: carina.skillsMatrix,
      questions: [
        {
          id: 'q1',
          bnccSkill: 'EF06LI08',
          pedagogicalObjective: 'Reconhecer cognatos e falsos cognatos em contexto'
        }
      ]
    })

    expect(standaloneAssessmentHtml).toContain('IDENTIFICAÇÃO DO PDI/PEI VINCULADO À AVALIAÇÃO / PROVA')
    expect(standaloneAssessmentHtml).toContain('Carina Miranda de Oliveira')
    expect(standaloneAssessmentHtml).toContain('PROVA — WARHAMMER 40K & FALSE FRIENDS')
    expect(standaloneAssessmentHtml).toContain('EF06LI08')
  })

  it('builds BNCC skill matrices for other grades (7º, 8º, 9º ano)', () => {
    const grade7 = buildBnccSkillsMatrixForGrade('7º ano do Ensino Fundamental')
    const grade9 = buildBnccSkillsMatrixForGrade('9º ano do Ensino Fundamental')
    expect(grade7.length).toBeGreaterThan(0)
    expect(grade9.length).toBeGreaterThan(0)
    expect(grade9.some(s => s.skillCode.startsWith('EF09LI'))).toBe(true)
  })
})
