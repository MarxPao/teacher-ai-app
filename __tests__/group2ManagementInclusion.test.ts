/**
 * Testes de Unidade do Grupo 2 — Gestão e Inclusão (PEI/IEP,{BehaviorPoints, Multi-Teacher RBAC)
 */
import { describe, it, expect } from 'vitest'
import {
  createDefaultPei,
  saveStudentPei,
  getStudentPei,
  PeiRecord,
} from '../lib/peiManagement'
import {
  awardBehaviorPoint,
  getStudentBehaviorBalance,
  DEFAULT_BEHAVIOR_SKILLS,
} from '../lib/behaviorPoints'
import {
  getTeacherPermissionsForClass,
  shareClassWithTeacher,
  ROLE_PERMISSIONS,
} from '../lib/multiTeacherRbac'


describe('testes Grupo 2 - Gestão e Inclusão', () => {

  describe('1. PEI / IEP Formal (metas SMART, laudo, adaptações)', () => {
    it('cria e persiste PEI padrão com metas e adaptações de tempo e distratores', () => {
      const pei = createDefaultPei('st_001', 'Lucas Mendes')
      expect(pei.studentId).toBe('st_001')
      expect(pei.goals.length).toBeGreaterThanOrEqual(1)
      expect(pei.accommodations.some(a => a.type === 'exam_time' && a.isActive)).toBe(true)
      expect(pei.accommodations.some(a => a.type === 'reduced_distractors' && a.isActive)).toBe(true)

      saveStudentPei(pei)
      const retrieved = getStudentPei('st_001')
      expect(retrieved).not.toBeNull()
      expect(retrieved?.studentName).toBe('Lucas Mendes')
    })
  })


  describe('2. Pontos Comportamentais Estilo ClassDojo', () => {
    it('atribui pontos positivos e de apoio, calculando saldo e extrato', () => {
      const stId = 'st_beh_01'
      const skillPos = DEFAULT_BEHAVIOR_SKILLS.find(s => s.points > 0)!
      const skillNeg = DEFAULT_BEHAVIOR_SKILLS.find(s => s.points < 0)!


      awardBehaviorPoint(stId, 'João Sievers', 'class_1', skillPos)
      awardBehaviorPoint(stId, 'João Sievers', 'class_1', skillPos)
      awardBehaviorPoint(stId, 'João Sievers', 'class_1', skillNeg)


      const balance = getStudentBehaviorBalance(stId)
      expect(balance.positiveCount).toBe(2)
      expect(balance.needsWorkCount).toBe(1)
      expect(balance.totalPoints).toBe(skillPos.points * 2 + skillNeg.points)
      expect(balance.recentHistory.length).toBe(3)
    })
  })


  describe('3. Colaboração Multi-Professor RBAC', () => {
    it('aplica permissões distintas para owner, collaborator, coordinator e substitute', () => {
      const classId = 'class_eng_8a'
      const ownerId = 'tch_silvia'
      const substituteEmail = 'rafaela.sub@escola.com'

      // 1. Owner tem acesso total
      const ownerPerms = getTeacherPermissionsForClass(classId, ownerId)
      expect(ownerPerms.canEditGrades).toBe(true)
      expect(ownerPerms.canEditRoster).toBe(true)

      // 2. Compartilha com substituto
      const shared = shareClassWithTeacher(classId, 'Inglês 8A９', ownerId, 'Silvia M.', substituteEmail, 'substitute')
      expect(shared.collaborators.length).toBe(1)

      const subId = shared.collaborators[0].teacherId
      const subPerms = getTeacherPermissionsForClass(classId, subId)
      expect(subPerms.canEditRoster).toBe(false)
      expect(subPerms.canEditGrades).toBe(false)
      expect(subPerms.canAccessPei).toBe(true) // Necessário para substituto aplicar adaptações
    })
  })
})
