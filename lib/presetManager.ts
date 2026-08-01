/**
 * lib/presetManager.ts — Sistema de Gerenciamento de Presets / Modelos de Configuração Salvos
 *
 * Permite que professores salvem e carreguem conjuntos de parâmetros personalizados
 * em módulos como Gerador de Provas (ExamBuilder), QuickGenerate e LessonStudio.
 */

export interface SavedPreset {
  id: string
  name: string
  module: 'exam' | 'quick' | 'lessonstudio'
  createdAt: string
  config: Record<string, any>
}

function getStorageKey(module: string): string {
  return `teacher_presets_${module}`
}

/**
 * Carrega todos os presets salvos de um módulo
 */
export function getPresets(module: 'exam' | 'quick' | 'lessonstudio'): SavedPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(getStorageKey(module))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Salva um novo preset de parâmetros para um módulo
 */
export function savePreset(
  module: 'exam' | 'quick' | 'lessonstudio',
  name: string,
  config: Record<string, any>
): SavedPreset {
  const presets = getPresets(module)

  const newPreset: SavedPreset = {
    id: 'preset_' + Date.now(),
    name: name.trim() || `Configuração ${new Date().toLocaleDateString('pt-BR')}`,
    module,
    createdAt: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    config
  }

  presets.unshift(newPreset)

  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey(module), JSON.stringify(presets))
    window.dispatchEvent(new Event('storage'))
  }

  return newPreset
}

/**
 * Remove um preset salvo
 */
export function deletePreset(module: 'exam' | 'quick' | 'lessonstudio', id: string): void {
  const presets = getPresets(module).filter(p => p.id !== id)
  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey(module), JSON.stringify(presets))
    window.dispatchEvent(new Event('storage'))
  }
}
