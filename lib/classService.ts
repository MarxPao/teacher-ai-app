/**
 * lib/classService.ts — Serviço Unificado de Gestão e Cobertura de Turmas (Fase 6)
 *
 * Garante que 100% das turmas cadastradas (regulares e alunos particulares)
 * estejam sempre disponíveis e sincronizadas em tempo real em todos os seletores
 * do fluxo de Planejamento (LessonStudio, Planner e DidacticSequence).
 */

export interface ClassRecord {
  id: string
  name: string
  schoolId: string
  description?: string
  subject?: string
  year?: string
  gradeYear?: string
  isPrivate?: boolean
}

export interface PrivateStudent {
  id: string
  name: string
  schoolId?: string
  subject?: string
  gradeYear?: string
  notes?: string
}

export const DEFAULT_CLASSES: ClassRecord[] = [
  { id: 'cls_9b', name: '9º Ano B', schoolId: 'sch_default', subject: 'Língua Inglesa', gradeYear: '9º Fund.' },
  { id: 'cls_8a', name: '8º Ano A', schoolId: 'sch_default', subject: 'Língua Inglesa', gradeYear: '8º Fund.' },
  { id: 'cls_em1', name: '1º Ano EM', schoolId: 'sch_default', subject: 'Língua Inglesa', gradeYear: '1º EM' },
  { id: 'cls_7c', name: '7º Ano C', schoolId: 'sch_default', subject: 'Língua Inglesa', gradeYear: '7º Fund.' }
]

/**
 * Retorna todas as turmas unificadas do professor:
 * 1. Turmas regulares de `teacher_classes`
 * 2. Alunos particulares de `teacher_private_students` (formatados como turmas individuais)
 * 3. Fallback inteligente caso o armazenamento esteja vazio
 */
export function getUnifiedClasses(): ClassRecord[] {
  if (typeof window === 'undefined') return DEFAULT_CLASSES

  let regularClasses: ClassRecord[] = []
  try {
    const raw = localStorage.getItem('teacher_classes')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        regularClasses = parsed
      }
    }
  } catch {}

  let privateClasses: ClassRecord[] = []
  try {
    const rawPriv = localStorage.getItem('teacher_private_students')
    if (rawPriv) {
      const parsedPriv = JSON.parse(rawPriv)
      if (Array.isArray(parsedPriv)) {
        privateClasses = parsedPriv.map((p: PrivateStudent) => ({
          id: p.id.startsWith('priv_') ? p.id : `priv_${p.id}`,
          name: p.name.startsWith('🎓 Particular:') ? p.name : `🎓 Particular: ${p.name}`,
          schoolId: p.schoolId || 'priv_school',
          subject: p.subject || 'Língua Inglesa',
          gradeYear: p.gradeYear || 'Particular',
          description: p.notes || 'Aula particular individual',
          isPrivate: true
        }))
      }
    }
  } catch {}

  // Combina e remove duplicatas por ID
  const map = new Map<string, ClassRecord>()
  regularClasses.forEach(c => {
    if (c && c.id) map.set(c.id, c)
  })
  privateClasses.forEach(c => {
    if (c && c.id) map.set(c.id, c)
  })

  if (map.size === 0) {
    return DEFAULT_CLASSES
  }

  return Array.from(map.values())
}

/**
 * Salva ou cria uma nova turma em `teacher_classes` e notifica todos os módulos
 */
export function saveOrUpdateClass(cls: ClassRecord): ClassRecord[] {
  if (typeof window === 'undefined') return [cls]

  const current = getUnifiedClasses().filter(c => !c.isPrivate)
  const existingIdx = current.findIndex(c => c.id === cls.id)
  let updated: ClassRecord[]

  if (existingIdx >= 0) {
    updated = current.map((c, i) => i === existingIdx ? { ...c, ...cls } : c)
  } else {
    updated = [...current, cls]
  }

  try {
    localStorage.setItem('teacher_classes', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:classes_updated', { detail: updated }))
  } catch {}

  return getUnifiedClasses()
}

/**
 * Inscreve um componente para receber atualizações de turmas em tempo real
 */
export function subscribeToClassUpdates(callback: (classes: ClassRecord[]) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = () => {
    callback(getUnifiedClasses())
  }

  window.addEventListener('storage', handler)
  window.addEventListener('teacher:classes_updated', handler)

  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('teacher:classes_updated', handler)
  }
}
