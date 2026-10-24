/**
 * lib/templateImport/exportBridge.ts
 * Usa o modelo v2 da escola dentro da exportação existente (exportToPdf / exportToWord).
 */
import { legacyParseContentToQuestions } from '@/lib/examSchema'
import { examFromLegacyItems } from './adapters'
import type { HeaderValues } from './render'
import { renderTemplateBody, renderTemplateHeader, templateCss } from './render'
import type { SchoolTemplate } from './template'

/** Devolve cabeçalho e corpo no layout da escola, ou null se não reconhecer questões no conteúdo */
export function renderWithSchoolTemplate(tpl: SchoolTemplate, contentHtml: string, values: HeaderValues): { headerHtml: string; bodyHtml: string } | null {
  const items = legacyParseContentToQuestions(contentHtml)
  if (!items.length) return null
  const exam = examFromLegacyItems(items)
  return {
    headerHtml: `<style>${templateCss(tpl, '.tpl-doc')}</style><div class="tpl-doc">${renderTemplateHeader(tpl, values)}</div>`,
    bodyHtml: `<div class="tpl-doc">${renderTemplateBody(tpl, exam, values)}</div>`,
  }
}
