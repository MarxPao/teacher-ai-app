/**
 * lib/lmsGoogleClassroom.ts — Integração Oficial via API do Google Classroom (OAuth 2).
 */

export interface GoogleClassroomCourse {
  id: string
  name: string
  section?: string
  room?: string
  courseState: 'ACTIVE' | 'ARCHIVED'
}

export interface GoogleClassroomAssignment {
  id: string
  courseId: string
  title: string
  description: string
  maxPoints: number
  dueDate?: {
    year: number
    month: number
    day: number
  }
}

export interface GoogleClassroomConfig {
  clientId: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

const GCLASS_CONFIG_KEY = 'teacher_gclass_config_v1'
let _memoryGclassConfig: GoogleClassroomConfig | null = null

export function getGclassConfig(): GoogleClassroomConfig | null {
  if (typeof window === 'undefined') return _memoryGclassConfig
  try {
    const raw = localStorage.getItem(GCLASS_CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveGclassConfig(cfg: GoogleClassroomConfig): void {
  if (typeof window === 'undefined') {
    _memoryGclassConfig = cfg
    return
  }
  localStorage.setItem(GCLASS_CONFIG_KEY, JSON.stringify(cfg))
}

export async function fetchGclassCourses(token: string): Promise<GoogleClassroomCourse[]> {
  try {
    const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.courses || []
  } catch {
    return []
  }
}

export async function publishAssignmentToGclass(
  token: string,
  courseId: string,
  assignment: Omit<GoogleClassroomAssignment, 'id' | 'courseId'>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('https://classroom.googleapis.com/v1/courses/' + courseId + '/coursework', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: assignment.title,
        description: assignment.description,
        maxPoints: assignment.maxPoints,
        dueDate: assignment.dueDate,
        workType: 'ASSIGNMENT',
        state: 'PUBLISHED',
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message || 'Erro postando no Google' }
    }
    const data = await res.json()
    return { success: true, id: data.id }
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha de rede Google Classroom' }
  }
}
