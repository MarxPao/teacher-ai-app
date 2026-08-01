/**
 * lib/i18n.ts — Motor de Internacionalização Multilingue para Nível Enterprise Global
 *
 * Suporta Português (BR), English (US) e Español (ES).
 */

export type SupportedLanguage = 'pt' | 'en' | 'es'

const STORAGE_KEY = 'teacher_lang'

const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  pt: {
    'app.title': 'TEACHER AI',
    'app.subtitle': 'Copiloto Pedagógico de Alta Performance',
    'nav.dashboard': 'Painel Principal',
    'nav.exam': 'Gerador de Provas',
    'nav.lessonstudio': 'Estúdio de Aulas',
    'nav.quick': 'Quick Generate',
    'nav.gradebook': 'Caderneta de Notas',
    'nav.portalmirror': 'Portal Conectado',
    'nav.api': 'Modelos de IA',
    'lang.pt': '🇧🇷 Português',
    'lang.en': '🇺🇸 English',
    'lang.es': '🇪🇸 Español',
    'search.placeholder': 'Digite um comando ou atalho...',
    'token.title': 'Consumo de Tokens por Modelo de IA',
    'token.reset': 'Zerar',
    'token.free': 'Grátis',
  },
  en: {
    'app.title': 'TEACHER AI',
    'app.subtitle': 'High-Performance Pedagogical Copilot',
    'nav.dashboard': 'Dashboard',
    'nav.exam': 'Exam Builder',
    'nav.lessonstudio': 'Lesson Studio',
    'nav.quick': 'Quick Generate',
    'nav.gradebook': 'Gradebook',
    'nav.portalmirror': 'Connected Portal',
    'nav.api': 'AI Models & Tokens',
    'lang.pt': '🇧🇷 Portuguese',
    'lang.en': '🇺🇸 English',
    'lang.es': '🇪🇸 Spanish',
    'search.placeholder': 'Search command or shortcut...',
    'token.title': 'AI Model Token Usage Monitor',
    'token.reset': 'Reset',
    'token.free': 'Free',
  },
  es: {
    'app.title': 'TEACHER AI',
    'app.subtitle': 'Copiloto Pedagógico de Alto Rendimiento',
    'nav.dashboard': 'Panel Principal',
    'nav.exam': 'Generador de Exámenes',
    'nav.lessonstudio': 'Estudio de Clases',
    'nav.quick': 'Generación Rápida',
    'nav.gradebook': 'Libro de Calificaciones',
    'nav.portalmirror': 'Portal Conectado',
    'nav.api': 'Modelos de IA',
    'lang.pt': '🇧🇷 Portugués',
    'lang.en': '🇺🇸 Inglés',
    'lang.es': '🇪🇸 Español',
    'search.placeholder': 'Buscar comando o acceso rápido...',
    'token.title': 'Monitor de Consumo de Tokens por Modelo de IA',
    'token.reset': 'Reiniciar',
    'token.free': 'Gratis',
  }
}

/**
 * Obtém o idioma atualmente selecionado
 */
export function getCurrentLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'pt'
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage
    if (saved && ['pt', 'en', 'es'].includes(saved)) return saved
  } catch {}
  return 'pt'
}

/**
 * Define o idioma atual do aplicativo
 */
export function setLanguage(lang: SupportedLanguage): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang)
    window.dispatchEvent(new Event('languagechange'))
  }
}

/**
 * Traduz uma chave para o idioma atual
 */
export function t(key: string, fallback?: string): string {
  const lang = getCurrentLanguage()
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.pt
  return dict[key] || fallback || key
}
