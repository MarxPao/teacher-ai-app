// lib/runner/transforms.ts
// Transformações determinísticas do SkillGraph v2

import type { Transform } from '../contracts/skillgraph/primitives'

const PT_PREPOSITIONS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

export function normalizeName(name: string): string {
  if (typeof name !== 'string') return ''
  const words = name.trim().split(/\s+/)
  return words
    .map((word, idx) => {
      const lower = word.toLowerCase()
      if (idx > 0 && PT_PREPOSITIONS.has(lower)) {
        return lower
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

export function parseDecimalPtBr(val: any): string {
  if (val === null || val === undefined) return ''
  const str = String(val).trim()
  return str.replace(',', '.')
}

export function stripPercent(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val).replace('%', '').trim()
}

export function toNumber(val: any): number | string {
  if (typeof val === 'number') return val
  if (val === null || val === undefined || val === '') return ''
  const cleaned = parseDecimalPtBr(val)
  const num = Number(cleaned)
  return isNaN(num) ? val : num
}

function parseDateComponents(val: any): { day: string; month: string; year: string } | null {
  if (!val) return null
  const str = String(val).trim()

  // Formato YYYY-MM-DD ou ISO
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    return {
      year: isoMatch[1],
      month: isoMatch[2].padStart(2, '0'),
      day: isoMatch[3].padStart(2, '0'),
    }
  }

  // Formato DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (brMatch) {
    return {
      day: brMatch[1].padStart(2, '0'),
      month: brMatch[2].padStart(2, '0'),
      year: brMatch[3],
    }
  }

  // Formato DD/MM
  const shortMatch = str.match(/^(\d{1,2})\/(\d{1,2})/)
  if (shortMatch) {
    return {
      day: shortMatch[1].padStart(2, '0'),
      month: shortMatch[2].padStart(2, '0'),
      year: String(new Date().getFullYear()),
    }
  }

  return null
}

export function toDateBr(val: any): string {
  const comp = parseDateComponents(val)
  if (!comp) return String(val ?? '')
  return `${comp.day}/${comp.month}/${comp.year}`
}

export function formatDdMm(val: any): string {
  const comp = parseDateComponents(val)
  if (!comp) return String(val ?? '')
  return `${comp.day}/${comp.month}`
}

export function formatDdMmYyyy(val: any): string {
  return toDateBr(val)
}

export function applyTransform(val: any, transform: Transform): any {
  if (val === null || val === undefined) return val

  switch (transform) {
    case 'trim':
      return typeof val === 'string' ? val.trim() : String(val).trim()
    case 'normalize_name':
      return normalizeName(String(val))
    case 'parse_decimal_pt_br':
      return parseDecimalPtBr(val)
    case 'strip_percent':
      return stripPercent(val)
    case 'to_number':
      return toNumber(val)
    case 'to_date_br':
      return toDateBr(val)
    case 'format_ddmm':
      return formatDdMm(val)
    case 'format_ddmmyyyy':
      return formatDdMmYyyy(val)
    default:
      return val
  }
}
