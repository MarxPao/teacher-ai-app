import * as crypto from 'node:crypto'
import type { SqlDriver } from '../SqlDriver'
import type { PrivateStudentRepository, PrivateStudent, Guardian } from '../../../repositories/PrivateStudentRepository'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'
import { encryptEnvelope, decryptEnvelope } from '../../crypto/envelope'

export class SqlPrivateStudentRepository implements PrivateStudentRepository {
  constructor(
    private driver: SqlDriver,
    private dataKey: Buffer,
    private clock: Clock = defaultClock
  ) {}

  async listPrivateStudents(): Promise<PrivateStudent[]> {
    const rows = await this.driver.query<{
      id: string
      name_encrypted: string
      subject: string
      monthly_fee_encrypted?: string
      guardians_encrypted?: string
      phone_encrypted?: string
      email_encrypted?: string
      notes_encrypted?: string
      status: 'active' | 'inactive'
    }>('SELECT * FROM private_students ORDER BY created_at ASC')

    return rows.map((r) => this.mapRow(r))
  }

  async getPrivateStudent(id: string): Promise<PrivateStudent | null> {
    const r = await this.driver.queryOne<{
      id: string
      name_encrypted: string
      subject: string
      monthly_fee_encrypted?: string
      guardians_encrypted?: string
      phone_encrypted?: string
      email_encrypted?: string
      notes_encrypted?: string
      status: 'active' | 'inactive'
    }>('SELECT * FROM private_students WHERE id = ?', [id])

    return r ? this.mapRow(r) : null
  }

  async savePrivateStudent(
    student: Omit<PrivateStudent, 'id'> | PrivateStudent
  ): Promise<PrivateStudent> {
    const id = 'id' in student && student.id ? student.id : crypto.randomUUID()
    const now = this.clock.toISOString()

    const nameEncrypted = encryptEnvelope(student.name, this.dataKey)
    const feeEncrypted =
      student.monthlyFee !== undefined
        ? encryptEnvelope(String(student.monthlyFee), this.dataKey)
        : null
    const guardiansEncrypted = student.guardians
      ? encryptEnvelope(JSON.stringify(student.guardians), this.dataKey)
      : null
    const phoneEncrypted = student.phone ? encryptEnvelope(student.phone, this.dataKey) : null
    const emailEncrypted = student.email ? encryptEnvelope(student.email, this.dataKey) : null
    const notesEncrypted = student.notes ? encryptEnvelope(student.notes, this.dataKey) : null

    const existing = await this.getPrivateStudent(id)
    if (existing) {
      await this.driver.execute(
        `UPDATE private_students SET
          name_encrypted = ?,
          subject = ?,
          monthly_fee_encrypted = ?,
          guardians_encrypted = ?,
          phone_encrypted = ?,
          email_encrypted = ?,
          notes_encrypted = ?,
          status = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          nameEncrypted,
          student.subject,
          feeEncrypted,
          guardiansEncrypted,
          phoneEncrypted,
          emailEncrypted,
          notesEncrypted,
          student.status,
          now,
          id,
        ]
      )
    } else {
      await this.driver.execute(
        `INSERT INTO private_students (
          id, name_encrypted, subject, monthly_fee_encrypted, guardians_encrypted,
          phone_encrypted, email_encrypted, notes_encrypted, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          nameEncrypted,
          student.subject,
          feeEncrypted,
          guardiansEncrypted,
          phoneEncrypted,
          emailEncrypted,
          notesEncrypted,
          student.status,
          now,
          now,
        ]
      )
    }

    return {
      id,
      name: student.name,
      subject: student.subject,
      monthlyFee: student.monthlyFee,
      guardians: student.guardians,
      phone: student.phone,
      email: student.email,
      notes: student.notes,
      status: student.status,
    }
  }

  async deletePrivateStudent(id: string): Promise<boolean> {
    const existing = await this.getPrivateStudent(id)
    if (!existing) return false

    await this.driver.execute('DELETE FROM private_students WHERE id = ?', [id])
    return true
  }

  private mapRow(r: {
    id: string
    name_encrypted: string
    subject: string
    monthly_fee_encrypted?: string
    guardians_encrypted?: string
    phone_encrypted?: string
    email_encrypted?: string
    notes_encrypted?: string
    status: 'active' | 'inactive'
  }): PrivateStudent {
    const feeStr = r.monthly_fee_encrypted
      ? decryptEnvelope(r.monthly_fee_encrypted, this.dataKey)
      : undefined
    const guardiansStr = r.guardians_encrypted
      ? decryptEnvelope(r.guardians_encrypted, this.dataKey)
      : undefined

    let guardians: Guardian[] | undefined
    if (guardiansStr) {
      try {
        guardians = JSON.parse(guardiansStr) as Guardian[]
      } catch {}
    }

    return {
      id: r.id,
      name: decryptEnvelope(r.name_encrypted, this.dataKey),
      subject: r.subject,
      monthlyFee: feeStr ? Number(feeStr) : undefined,
      guardians,
      phone: r.phone_encrypted ? decryptEnvelope(r.phone_encrypted, this.dataKey) : undefined,
      email: r.email_encrypted ? decryptEnvelope(r.email_encrypted, this.dataKey) : undefined,
      notes: r.notes_encrypted ? decryptEnvelope(r.notes_encrypted, this.dataKey) : undefined,
      status: r.status,
    }
  }
}
