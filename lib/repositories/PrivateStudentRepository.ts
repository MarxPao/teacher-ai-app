// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono

export interface Guardian {
  name: string
  relationship: string
  phone?: string
  email?: string
}

export interface PrivateStudent {
  id: string
  name: string
  subject: string
  monthlyFee?: number
  guardians?: Guardian[]
  phone?: string
  email?: string
  notes?: string
  status: 'active' | 'inactive'
}

/**
 * PrivateStudentRepository — Contrato para gestão de aulas particulares.
 * Isola dados financeiros e de responsáveis legais de alunos particulares.
 */
export interface PrivateStudentRepository {
  listPrivateStudents(): Promise<PrivateStudent[]>
  getPrivateStudent(id: string): Promise<PrivateStudent | null>
  savePrivateStudent(student: Omit<PrivateStudent, 'id'> | PrivateStudent): Promise<PrivateStudent>
  deletePrivateStudent(id: string): Promise<boolean>
}
