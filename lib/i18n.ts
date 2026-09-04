/**
 * lib/i18n.ts - Motor de Internacionalizacao (Enterprise Global)
 */

export type SupportedLanguage = 'pt' | 'en' | 'es'
export type SupportedLang = SupportedLanguage

const STORAGE_KEY = 'teacher_lang'

export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  pt: {
  "app.title": "TEACHER AI",
  "app.subtitle": "Copiloto Pedagogico de Alta Performance",
  "nav.dashboard": "Painel Principal",
  "nav.exam": "Gerador de Provas",
  "nav.lessonstudio": "Estudio de Aulas",
  "nav.quick": "Geracao Rapida",
  "nav.gradebook": "Caderneta de Notas",
  "nav.portalmirror": "Portal Conectado",
  "nav.api": "Modelos de IA",
  "nav.students": "Gestao de Alunos",
  "nav.classes": "Turmas e Disciplinas",
  "nav.qbank": "Banco de Questoes",
  "nav.classroom": "Modo Sala de Aula",
  "nav.autoreport": "Pareceres e Relatorios",
  "lang.pt": "Portugues",
  "lang.en": "English",
  "lang.es": "Espanol",
  "search.placeholder": "Digite um comando ou atalho...",
  "token.title": "Consumo de Tokens por Modelo de IA",
  "token.reset": "Zerar",
  "token.no_usage": "Nenhum consumo registrado.",
  "common.confirm": "Confirmar",
  "common.cancel": "Cancelar",
  "common.save": "Salvar",
  "common.edit": "Editar",
  "common.delete": "Excluir",
  "common.loading": "Carregando...",
  "common.success": "Sucesso",
  "common.error": "Erro",
  "dashboard": "Painel Principal",
  "students": "Gestao de Alunos",
  "gradebook": "Caderneta de Notas",
  "save": "Salvar",
  "cancel": "Cancelar"
},
  en: {
  "app.title": "TEACHER AI",
  "app.subtitle": "High-Performance Pedagogical Copilot",
  "nav.dashboard": "Dashboard",
  "nav.exam": "Exam Generator",
  "nav.lessonstudio": "Lesson Studio",
  "nav.quick": "Quick Generator",
  "nav.gradebook": "Gradebook",
  "nav.portalmirror": "Connected Portal",
  "nav.api": "AI Models",
  "nav.students": "Students Management",
  "nav.classes": "Classes & Subjects",
  "nav.qbank": "Question Bank",
  "nav.classroom": "Classroom Mode",
  "nav.autoreport": "Reports & Feedback",
  "lang.pt": "Portuguese",
  "lang.en": "English",
  "lang.es": "Spanish",
  "search.placeholder": "Type a command or shortcut...",
  "token.title": "Token Consumption by AI Model",
  "token.reset": "Reset",
  "token.no_usage": "No usage recorded yet.",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.loading": "Loading...",
  "common.success": "Success",
  "common.error": "Error",
  "dashboard": "Dashboard",
  "students": "Students Management",
  "gradebook": "Gradebook",
  "save": "Save",
  "cancel": "Cancel"
},
  es: {
  "app.title": "TEACHER AI",
  "app.subtitle": "Copiloto Pedagogico de Alto Rendimiento",
  "nav.dashboard": "Panel Principal",
  "nav.exam": "Generador de Examenes",
  "nav.lessonstudio": "Estudio de Clases",
  "nav.quick": "Generacion Rapida",
  "nav.gradebook": "Libro de Calificaciones",
  "nav.portalmirror": "Portal Conectado",
  "nav.api": "Modelos de IA",
  "nav.students": "Gestion de Estudiantes",
  "nav.classes": "Clases y Asignaturas",
  "nav.qbank": "Banco de Preguntas",
  "nav.classroom": "Modo Aula",
  "nav.autoreport": "Informes y Evaluaciones",
  "lang.pt": "Portugues",
  "lang.en": "Ingles",
  "lang.es": "Espanol",
  "search.placeholder": "Escriba un comando o atajo...",
  "token.title": "Consumo de Tokens por Modelo de IA",
  "token.reset": "Restablecer",
  "token.no_usage": "Sin consumo registrado.",
  "common.confirm": "Confirmar",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.edit": "Editar",
  "common.delete": "Eliminar",
  "common.loading": "Cargando...",
  "common.success": "Exito",
  "common.error": "Error",
  "dashboard": "Panel Principal",
  "students": "Gestion de Estudiantes",
  "gradebook": "Libro de Calificaciones",
  "save": "Guardar",
  "cancel": "Cancelar"
}
}

export const DICTIONARY = TRANSLATIONS

export function langCodeToLang(code: string): SupportedLanguage {
  const norm = code.toLowerCase().slice(0, 2)
  if (norm === 'en') return 'en'
  if (norm === 'es') return 'es'
  return 'pt'
}

export function getCurrentLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'pt'
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage
    if (saved && ['pt', 'en', 'es'].includes(saved)) return saved
  } catch {}
  return 'pt'
}

export function setLanguage(lang: SupportedLanguage): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang)
    window.dispatchEvent(new Event('languagechange'))
  }
}

export function t(key: string, langOrFallback?: SupportedLanguage | string): string {
  let lang: SupportedLanguage = getCurrentLanguage()
  let fallback: string = key

  if (langOrFallback === 'pt' || langOrFallback === 'en' || langOrFallback === 'es') {
    lang = langOrFallback
  } else if (typeof langOrFallback === 'string') {
    fallback = langOrFallback
  }

  const dict = TRANSLATIONS[lang] || TRANSLATIONS.pt
  return dict[key] || fallback || key
}
