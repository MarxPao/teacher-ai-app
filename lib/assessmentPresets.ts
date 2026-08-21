'use client'

export interface BloomDistribution {
  remember: number
  understand: number
  apply: number
  analyze: number
  evaluate: number
  create: number
}

export interface QuestionWeights {
  mcSimple: number
  mcIntermediate: number
  mcComplex: number
  gapFill: number
  trueFalse: number
  shortEssay: number
  fullEssay: number
}

export interface DifficultyDistribution {
  easy: number
  medium: number
  hard: number
  challenge: number
}

export interface AssessmentPreset {
  id: string
  name: string
  bloomDistribution: BloomDistribution
  questionWeights: QuestionWeights
  difficultyDistribution: DifficultyDistribution
  totalScore: number
  examDurationMinutes: number
  kioskMode: boolean
  feedbackMode: 'practice' | 'exam'
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export const DEFAULT_ASSESSMENT_PRESET: AssessmentPreset = {
  id: 'default_cambridge',
  name: 'Padrão Cambridge',
  bloomDistribution: { remember: 25, understand: 0, apply: 30, analyze: 25, evaluate: 15, create: 5 },
  questionWeights: { mcSimple: 1.0, mcIntermediate: 1.5, mcComplex: 2.0, gapFill: 0.5, trueFalse: 0.5, shortEssay: 3.0, fullEssay: 5.0 },
  difficultyDistribution: { easy: 20, medium: 50, hard: 25, challenge: 5 },
  totalScore: 10,
  examDurationMinutes: 50,
  kioskMode: false,
  feedbackMode: 'exam',
  isDefault: true,
  createdAt: 0,
  updatedAt: 0
}

const STORAGE_KEY = 'teacher_assessment_presets'

export function getStoredPresets(): AssessmentPreset[] {
  if (typeof window === 'undefined') return [DEFAULT_ASSESSMENT_PRESET]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : [DEFAULT_ASSESSMENT_PRESET]
  } catch { return [DEFAULT_ASSESSMENT_PRESET] }
}

export function savePreset(preset: AssessmentPreset): void {
  if (typeof window === 'undefined') return
  const presets = getStoredPresets()
  const idx = presets.findIndex(p => p.id === preset.id)
  const updated = { ...preset, updatedAt: Date.now() }
  if (idx >= 0) presets[idx] = updated
  else presets.push({ ...updated, createdAt: Date.now() })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export function deletePreset(id: string): void {
  if (typeof window === 'undefined') return
  const presets = getStoredPresets().filter(p => p.id !== id && p.id !== 'default_cambridge')
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export function getDefaultPreset(): AssessmentPreset {
  const presets = getStoredPresets()
  return presets.find(p => p.isDefault) ?? DEFAULT_ASSESSMENT_PRESET
}

export function setDefaultPreset(id: string): void {
  if (typeof window === 'undefined') return
  const presets = getStoredPresets().map(p => ({ ...p, isDefault: p.id === id }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}
