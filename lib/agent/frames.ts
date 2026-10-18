// lib/agent/frames.ts
// Junta a observação do quadro principal com a de iframes de OUTRA origem, que o observador
// do quadro principal não consegue ler (mesma origem ele já percorre sozinho).
// Cada elemento do iframe leva o frameId, para o driver despachar a ação no quadro certo.

import type { AgentPageSnapshot, AgentElement } from '../runner-dom/agentObserver'

export interface FrameSnapshot {
  frameId: number
  url: string
  host: string
  snapshot: AgentPageSnapshot
}

export function mergeFrameSnapshots(top: AgentPageSnapshot, frames: FrameSnapshot[], maxElements = 160): AgentPageSnapshot {
  const elements: AgentElement[] = top.elements.map(e => ({ ...e }))
  const texts: string[] = [top.text]
  let omitted = top.omitted
  let dialogOpen = top.dialogOpen

  for (const f of frames) {
    if (f.frameId === 0) continue
    // Se o quadro principal tem um diálogo aberto, os iframes por trás dele não são alcançáveis
    if (top.dialogOpen) {
      omitted += f.snapshot.elements.length
      continue
    }
    if (f.snapshot.dialogOpen) dialogOpen = true
    for (const e of f.snapshot.elements) {
      if (elements.length >= maxElements) {
        omitted++
        continue
      }
      elements.push({ ...e, idx: elements.length, inFrame: true, frameId: f.frameId })
    }
    if (f.snapshot.text) texts.push(`[CONTEÚDO DO QUADRO ${f.host}]\n${f.snapshot.text}`)
  }
  // Reindexa o principal também (caso tenha vindo com buracos)
  elements.forEach((e, i) => (e.idx = i))
  return { ...top, elements, text: texts.join('\n'), omitted, dialogOpen }
}
