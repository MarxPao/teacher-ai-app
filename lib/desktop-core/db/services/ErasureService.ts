import * as crypto from 'node:crypto'
import type { SqlDriver } from '../SqlDriver'
import { DesktopCoreError } from '../../errors'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'

export interface ErasureReport {
  studentIdHash: string
  recordsPurged: number
  auditEntriesAnonymized: number
  erasedAt: string
}

export class ErasureService {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock
  ) {}

  async eraseStudent(studentId: string): Promise<ErasureReport> {
    const student = await this.driver.queryOne<{ id: string }>(
      'SELECT id FROM students WHERE id = ?',
      [studentId]
    )

    if (!student) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        `Aluno com identificador ${studentId} não encontrado.`
      )
    }

    const studentIdHash = crypto.createHash('sha256').update(studentId).digest('hex')
    const now = this.clock.toISOString()
    let purgedCount = 0
    let anonymizedCount = 0

    await this.driver.transaction(async (tx) => {
      // 1. Contabiliza registros antes de purgar
      const obsCount = (await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM observations WHERE student_id = ?', [studentId]))?.cnt || 0
      const attCount = (await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM attendance_records WHERE student_id = ?', [studentId]))?.cnt || 0
      const evalCount = (await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM evaluations WHERE student_id = ?', [studentId]))?.cnt || 0

      purgedCount = 1 + obsCount + attCount + evalCount

      // 2. Exclusão em cascata
      await tx.execute('DELETE FROM observations WHERE student_id = ?', [studentId])
      await tx.execute('DELETE FROM attendance_records WHERE student_id = ?', [studentId])
      await tx.execute('DELETE FROM evaluations WHERE student_id = ?', [studentId])
      await tx.execute('DELETE FROM students WHERE id = ?', [studentId])

      // 3. Anonimização estrita das trilhas de auditoria
      const auditRows = await tx.query<{ id: number }>(
        'SELECT id FROM audit_log WHERE target_ref LIKE ?',
        [`%${studentId}%`]
      )
      anonymizedCount = auditRows.length

      if (anonymizedCount > 0) {
        await tx.execute(
          `UPDATE audit_log SET
            target_ref = '[ALUNO_EXPURGADO]',
            before_value_encrypted = NULL,
            after_value_encrypted = NULL
           WHERE target_ref LIKE ?`,
          [`%${studentId}%`]
        )
      }

      // 4. Registro no erasure_log (zero PII)
      await tx.execute(
        `INSERT INTO erasure_log (
          id, student_id_hash, records_purged, audit_entries_anonymized, erased_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), studentIdHash, purgedCount, anonymizedCount, now]
      )

      // 5. Verificação mandatória pós-expurgo (Garantia de Não-Vazamento)
      const residualStudents = await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM students WHERE id = ?', [studentId])
      const residualEvals = await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM evaluations WHERE student_id = ?', [studentId])
      const residualAtt = await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM attendance_records WHERE student_id = ?', [studentId])
      const residualObs = await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM observations WHERE student_id = ?', [studentId])
      const residualAudit = await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM audit_log WHERE target_ref LIKE ?', [`%${studentId}%`])

      const totalResiduals =
        (residualStudents?.cnt || 0) +
        (residualEvals?.cnt || 0) +
        (residualAtt?.cnt || 0) +
        (residualObs?.cnt || 0) +
        (residualAudit?.cnt || 0)

      if (totalResiduals > 0) {
        throw new DesktopCoreError(
          'E_ERASE_VERIFY_FAILED',
          `Falha na verificação de expurgo LGPD: ${totalResiduals} registros residuais encontrados após deleção.`
        )
      }
    })

    return {
      studentIdHash,
      recordsPurged: purgedCount,
      auditEntriesAnonymized: anonymizedCount,
      erasedAt: now,
    }
  }
}
