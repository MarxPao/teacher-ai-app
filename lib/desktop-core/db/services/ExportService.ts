import type { SqlStudentRepository } from '../repositories/SqlStudentRepository'

export interface ExportResult {
  json: string
  csv: string
}

export class ExportService {
  constructor(private studentRepo: SqlStudentRepository) {}

  async exportStudent(studentId: string): Promise<ExportResult> {
    const rawData = await this.studentRepo.exportStudentData(studentId)
    const json = JSON.stringify(rawData, null, 2)

    // Gera CSV simples com notas e frequência do aluno
    const lines: string[] = []
    lines.push('Tipo,Identificador,Data,Campo,Valor')

    const s = rawData.student
    if (s) {
      lines.push(`Aluno,${s.id},${s.created_at || ''},Nome,"${s.name}"`)
      if (s.email) lines.push(`Aluno,${s.id},,Email,"${s.email}"`)
      if (s.portal_id) lines.push(`Aluno,${s.id},,Matricula,"${s.portal_id}"`)
    }

    if (Array.isArray(rawData.evaluations)) {
      for (const ev of rawData.evaluations) {
        lines.push(`Avaliacao,${ev.id},${ev.date || ''},${ev.subject} (${ev.term}),${ev.score}/${ev.maxScore}`)
      }
    }

    if (Array.isArray(rawData.attendance)) {
      for (const at of rawData.attendance) {
        lines.push(`Frequencia,,${at.date},Status,${at.status}`)
      }
    }

    if (Array.isArray(rawData.observations)) {
      for (const ob of rawData.observations) {
        lines.push(`Observacao,,${ob.date},Texto,"${ob.text.replace(/"/g, '""')}"`)
      }
    }

    return {
      json,
      csv: lines.join('\n'),
    }
  }
}
