/**
 * authMigration.ts — Migração de dados locais legados para o usuário autenticado
 *
 * Ao fazer login/cadastro pela primeira vez, associa as turmas, alunos e histórico
 * locais ao teacher_id (auth.uid()) do professor sem perder nenhuma informação.
 */

import { AuthUser } from '@/lib/supabaseAuth'

export function migrateLocalDataForTeacher(user: AuthUser): { migrated: boolean; count: number } {
  if (typeof localStorage === 'undefined' || !user?.id) return { migrated: false, count: 0 }

  try {
    const migrationFlagKey = `teacher_migrated_for_${user.id}`
    if (localStorage.getItem(migrationFlagKey)) {
      return { migrated: false, count: 0 }
    }

    let itemsMigrated = 0

    // 1. Atualizar teacher_classes com teacher_id
    const rawClasses = localStorage.getItem('teacher_classes')
    if (rawClasses) {
      try {
        const classes = JSON.parse(rawClasses)
        if (Array.isArray(classes)) {
          const updatedClasses = classes.map(c => ({
            ...c,
            teacherId: c.teacherId || user.id,
            subject: c.subject || 'english'
          }))
          localStorage.setItem('teacher_classes', JSON.stringify(updatedClasses))
          itemsMigrated += updatedClasses.length
        }
      } catch {}
    }

    // 2. Atualizar teacher_cfg com o nome do professor logado se ainda vazio
    const rawCfg = localStorage.getItem('teacher_cfg')
    const cfg = rawCfg ? JSON.parse(rawCfg) : {}
    if (!cfg.teacher && user.name) {
      cfg.teacher = user.name
      localStorage.setItem('teacher_cfg', JSON.stringify(cfg))
    }

    // 3. Atualizar teacher_settings com teacher_id
    const rawSettings = localStorage.getItem('teacher_settings')
    const settings = rawSettings ? JSON.parse(rawSettings) : {}
    settings.teacherId = user.id
    settings.teacherEmail = user.email
    if (!settings.defaultSubject) {
      settings.defaultSubject = 'english'
    }
    localStorage.setItem('teacher_settings', JSON.stringify(settings))

    // Marcar migração como realizada para este ID de professor
    localStorage.setItem(migrationFlagKey, new Date().toISOString())
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('teacher:data_changed'))
    }

    return { migrated: true, count: itemsMigrated }
  } catch {
    return { migrated: false, count: 0 }
  }
}
