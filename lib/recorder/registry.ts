// lib/recorder/registry.ts
// Registro de PII em memória para contenção e verificação de vazamento de dados

export interface PiiEntry {
  original: string
  normalized: string
  placeholder: string
  role?: string
}

function normalizeTerm(term: string): string {
  return term
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export class PiiRegistry {
  private entries: Map<string, PiiEntry> = new Map()
  private placeholderCounters: Map<string, number> = new Map()

  public register(value: string, role: string = 'data'): string {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 2) return value

    const norm = normalizeTerm(trimmed)
    if (this.entries.has(norm)) {
      return this.entries.get(norm)!.placeholder
    }

    const currentCount = (this.placeholderCounters.get(role) || 0) + 1
    this.placeholderCounters.set(role, currentCount)

    const placeholder = `<PARAM:${role}_${currentCount}>`
    const entry: PiiEntry = {
      original: trimmed,
      normalized: norm,
      placeholder,
      role,
    }

    this.entries.set(norm, entry)
    return placeholder
  }

  public registerLiteral(value: string, placeholder: string): void {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 2) return

    const norm = normalizeTerm(trimmed)
    this.entries.set(norm, {
      original: trimmed,
      normalized: norm,
      placeholder,
    })
  }

  public has(text: string): boolean {
    if (!text || text.length < 2) return false
    const normText = normalizeTerm(text)

    for (const entry of this.entries.values()) {
      if (entry.normalized.length >= 3 && normText.includes(entry.normalized)) {
        return true
      }
    }
    return false
  }

  public findMatches(text: string): PiiEntry[] {
    if (!text) return []
    const normText = normalizeTerm(text)
    const matches: PiiEntry[] = []

    for (const entry of this.entries.values()) {
      if (entry.normalized.length >= 3 && normText.includes(entry.normalized)) {
        matches.push(entry)
      }
    }
    return matches
  }

  public getEntries(): PiiEntry[] {
    return Array.from(this.entries.values())
  }

  public get size(): number {
    return this.entries.size
  }

  public clear(): void {
    this.entries.clear()
    this.placeholderCounters.clear()
  }
}
