// lib/compiler/stages/fingerprint.ts
// Geração de Fingerprints de página a partir de PageDigests e URLs do trace

import type { Fingerprint, RouteFingerprint } from '../../contracts/skillgraph/primitives'
import type { AnchorOrRef } from '../../contracts/skillgraph/anchors'
import type { PageDigest } from '../../recorder/traceSchema'

export function buildFingerprint(
  urlOrPath: string,
  host: string,
  digest?: PageDigest
): Fingerprint {
  let path = urlOrPath
  try {
    const u = new URL(urlOrPath, 'http://localhost')
    path = u.pathname
  } catch {}

  const route: RouteFingerprint = {
    host: host || undefined,
    path_pattern: path ? `${path.replace(/\/$/, '')}*` : '/*',
  }

  const landmarks: AnchorOrRef[] = []

  if (digest) {
    // 1. Usa landmarks explícitos se presentes
    for (const lm of digest.landmarks || []) {
      if (lm.trim()) {
        landmarks.push({
          description: `Marco estrutural: ${lm}`,
          candidates: [{ strategy: 'text', text: lm.trim(), match: 'contains' }],
        })
        if (landmarks.length >= 3) break
      }
    }

    // 2. Usa cabeçalhos (headings) se ainda faltar
    if (landmarks.length === 0) {
      for (const h of digest.headings || []) {
        if (h.trim()) {
          landmarks.push({
            description: `Título da página: ${h}`,
            candidates: [{ strategy: 'text', text: h.trim(), match: 'contains' }],
          })
          if (landmarks.length >= 2) break
        }
      }
    }
  }

  // Se nenhum marco foi extraído, cria um marco de garantia
  if (landmarks.length === 0) {
    landmarks.push({
      description: 'Estrutura principal da página',
      candidates: [
        { strategy: 'role_name', role: 'main', name: 'Principal', match: 'contains' },
        { strategy: 'css', selector: 'main, [role="main"], body' },
      ],
    })
  }

  const titlePattern = digest?.title ? `*${digest.title.trim().slice(0, 30)}*` : undefined

  return {
    route,
    landmarks,
    title_pattern: titlePattern,
  }
}
