let _memoryShared: Record<string, ClassSharedSession> = {}
/**
 * lib/multiTeacherRbac.ts — Motor de Colaboraçóo Multi-Professor e RBAC
 */

export type TeacherRole = 'owner' | 'collaborator' | 'coordinator' | 'substitute'

export interface TeacherPermissions {
  canEditRoster: boolean
  canEditGrades: boolean
  canEditLessonPlans: boolean
  canAccessPei: boolean
  canShareClass: boolean
  canExportCoordinationReport: boolean
}

export const ROLE_PERMISSIONS: Record<TeacherRole, TeacherPermissions> = {
  owner: {
    canEditRoster: true,
    canEditGrades: true,
    canEditLessonPlans: true,
    canAccessPei: true,
    canShareClass: true,
    canExportCoordinationReport: true,
  },
  coordinator: {
    canEditRoster: true,
    canEditGrades: false,
    canEditLessonPlans: false,
    canAccessPei: true,
    canShareClass: true,
    canExportCoordinationReport: true,
  },
  collaborator: {
    canEditRoster: false,
    canEditGrades: true,
    canEditLessonPlans: true,
    canAccessPei: true,
    canShareClass: false,
    canExportCoordinationReport: false,
  },
  substitute: {
    canEditRoster: false,
    canEditGrades: false,
    canEditLessonPlans: false,
    canAccessPei: true, // Substituto precisa ver adaptações do aluno NEE
    canShareClass: false,
    canExportCoordinationReport: false,
  },
}

export interface ClassSharedSession {
  classId: string
  className: string
  ownerTeacherId: string
  ownerTeacherName: string
  collaborators: Array<{
    teacherId: string
    teacherEmail: string
    role: TeacherRole
    sharedAt: string
  }>
}

const SHARED_CLASSES_KEY = 'teacher_shared_classes_v1'

export function getAllSharedClasses(): Record<string, ClassSharedSession> {
  if (typeof window === 'undefined') return _memoryShared
  try {
    const raw = localStorage.getItem(SHARED_CLASSES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getTeacherPermissionsForClass(classId: string, currentTeacherId: string): TeacherPermissions {
  const shared = getAllSharedClasses()[classId]
  if (!shared) {
    // Se não há registro de compartilhamento, o usuário local é o owner
    return ROLE_PERMISSIONS.owner
  }
  if (shared.ownerTeacherId === currentTeacherId) {
    return ROLE_PERMISSIONS.owner
  }
  const member = shared.collaborators.find(c => c.teacherId === currentTeacherId)
  if (!member) {
    return ROLE_PERMISSIONS.substitute
  }
  return ROLE_PERMISSIONS[member.role]
}

export function shareClassWithTeacher(
  classId: string, className: string, ownerId: string, ownerName: string,
  collaboratorEmail: string,
  role: TeacherRole
): ClassSharedSession {
  const all = getAllSharedClasses()
  let shared = all[classId]

  if (!shared) {
    shared = {
      classId,
      className,
      ownerTeacherId: ownerId,
      ownerTeacherName: ownerName,
      collaborators: [],
    }
  }

  shared.collaborators = shared.collaborators.filter(c => c.teacherEmail !== collaboratorEmail)
  shared.collaborators.push({
    teacherId: 'tch_' + Math.random().toString(36).slice(2, 8),
    teacherEmail: collaboratorEmail,
    role,
    sharedAt: new Date().toISOString(),
  })


  all[classId] = shared
  _memoryShared = all
  if (typeof window !== 'undefined') {
    localStorage.setItem(SHARED_CLASSES_KEY, JSON.stringify(all))
  }
  return shared
}
