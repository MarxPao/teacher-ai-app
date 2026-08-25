'use client'

import { useState, useEffect, useCallback } from 'react'
import { SUBJECT_THEMES } from '@/styles/tokens'

export type ThemeMode = 'default' | 'high-contrast' | 'colorblind'
export type FontScale = 85 | 100 | 115 | 130

export interface AppTheme {
  mode: ThemeMode
  discipline: string
  fontScale: FontScale
  focusMode: boolean
  accent: string
  accentBg: string
}

const DEFAULT_THEME: AppTheme = {
  mode: 'default',
  discipline: 'default',
  fontScale: 100,
  focusMode: false,
  accent: '#8b5e3c',
  accentBg: 'rgba(139,94,60,0.10)',
}

const STORAGE_KEY = 'teacher_app_theme'

function load(): AppTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_THEME
    return { ...DEFAULT_THEME, ...JSON.parse(raw) }
  } catch { return DEFAULT_THEME }
}

function save(theme: AppTheme) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)) } catch {}
}

function applyTheme(theme: AppTheme) {
  const root = document.documentElement
  const subj = SUBJECT_THEMES[theme.discipline] || SUBJECT_THEMES.default

  // Accent colors
  root.style.setProperty('--accent', subj.accent)
  root.style.setProperty('--accent-bg', subj.accentBg)
  root.style.setProperty('--accent-gold', subj.accent)

  // Font scale
  root.style.setProperty('--font-scale', String(theme.fontScale / 100))
  root.style.fontSize = `${theme.fontScale}%`

  // Theme mode
  root.setAttribute('data-theme', theme.mode)

  // Focus mode
  root.setAttribute('data-focus', theme.focusMode ? 'true' : 'false')
}

// Singleton event system for cross-component theme updates
const THEME_EVENT = 'teacher-theme-change'

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>(DEFAULT_THEME)

  useEffect(() => {
    const t = load()
    setThemeState(t)
    applyTheme(t)

    const handler = (e: Event) => {
      const custom = e as CustomEvent<AppTheme>
      setThemeState(custom.detail)
    }
    window.addEventListener(THEME_EVENT, handler)
    return () => window.removeEventListener(THEME_EVENT, handler)
  }, [])

  const setTheme = useCallback((updates: Partial<AppTheme>) => {
    setThemeState(prev => {
      const subj = SUBJECT_THEMES[updates.discipline ?? prev.discipline] || SUBJECT_THEMES.default
      const next: AppTheme = {
        ...prev,
        ...updates,
        accent: subj.accent,
        accentBg: subj.accentBg,
      }
      save(next)
      applyTheme(next)
      window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }))
      return next
    })
  }, [])

  const setDiscipline = useCallback((d: string) => setTheme({ discipline: d }), [setTheme])
  const setMode = useCallback((m: ThemeMode) => setTheme({ mode: m }), [setTheme])
  const setFontScale = useCallback((s: FontScale) => setTheme({ fontScale: s }), [setTheme])
  const toggleFocusMode = useCallback(() => setTheme({ focusMode: !theme.focusMode }), [setTheme, theme.focusMode])
  const reset = useCallback(() => setTheme(DEFAULT_THEME), [setTheme])

  return { theme, setDiscipline, setMode, setFontScale, toggleFocusMode, reset, setTheme }
}
