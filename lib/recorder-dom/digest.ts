// lib/recorder-dom/digest.ts
// Extração leve de PageDigest estrutural do documento para verificação de rotas

import type { PageDigest } from '../recorder/traceSchema'

export function extractPageDigest(doc: Document): PageDigest {
  const host = doc.location?.host || 'localhost'
  const path = doc.location?.pathname || '/'
  const title = doc.title ? doc.title.slice(0, 80) : undefined

  // Cabeçalhos h1, h2
  const headings = Array.from(doc.querySelectorAll('h1, h2'))
    .map((el) => el.textContent?.trim() || '')
    .filter((txt) => txt.length >= 2 && txt.length <= 80)
    .slice(0, 5)

  // Cabeçalhos de tabela
  const table_headers = Array.from(doc.querySelectorAll('th, [role="columnheader"]'))
    .map((el) => el.textContent?.trim() || '')
    .filter((txt) => txt.length >= 2 && txt.length <= 80)
    .slice(0, 15)

  // Rótulos de formulário
  const form_labels = Array.from(doc.querySelectorAll('label'))
    .map((el) => el.textContent?.trim() || '')
    .filter((txt) => txt.length >= 2 && txt.length <= 80)
    .slice(0, 10)

  // Contagens
  const counts: Record<string, number> = {
    tables: doc.querySelectorAll('table, [role="grid"], [role="table"]').length,
    rows: doc.querySelectorAll('tr, [role="row"]').length,
    inputs: doc.querySelectorAll('input, select, textarea').length,
    buttons: doc.querySelectorAll('button, [role="button"]').length,
  }

  // Marcos estruturais
  const landmarks = Array.from(doc.querySelectorAll('nav, header, main, footer, [role="navigation"], [role="main"]'))
    .map((el) => (el.getAttribute('aria-label') || el.tagName.toLowerCase()).slice(0, 40))
    .slice(0, 5)

  return {
    host,
    path,
    title,
    headings,
    table_headers,
    form_labels,
    counts,
    landmarks,
  }
}
