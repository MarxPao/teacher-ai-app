// lib/runner/reviewMirror.ts
// Espelho de revisão: transforma um dry-run no plano que a professora revisa antes de gravar.
//
// Fluxo:
//   1. runner.run(graph, params, { dryRun: true })  -> eventos write_performed com writeKey
//   2. buildReviewMirror(events)                     -> linhas antes/depois + avisos
//   3. renderReviewMirrorHtml(mirror)                -> página local para a professora revisar
//   4. approvedWritesFrom(mirror, idsAprovados)      -> passado em runner.run(..., { approvedWrites })
// Na execução real, write.ts recusa qualquer escrita fora do plano aprovado (E_WRITE_NOT_APPROVED).
// O espelho roda só no dispositivo da professora: nada aqui é enviado para a nuvem.

import type { RunEvent } from './types'

export interface MirrorRow {
  id: string
  writeKey: string
  label: string
  target: string
  semantic?: string
  before: string
  after: string
  changed: boolean
  warnings: string[]
}

export interface ReviewMirror {
  runId?: string
  createdAt: string
  rows: MirrorRow[]
  failures: Array<{ nodeId?: string; error: string }>
}

const MASK_EMPTY_RE = /^[\s_/().-]*$/

export function buildReviewMirror(events: RunEvent[], now: Date = new Date()): ReviewMirror {
  const rows: MirrorRow[] = []
  const failures: ReviewMirror['failures'] = []
  const seenKeys = new Map<string, MirrorRow>()

  for (const ev of events) {
    if (ev.type === 'node_failed' || ev.type === 'run_failed') {
      failures.push({ nodeId: ev.nodeId, error: String(ev.data?.error ?? ev.data?.message ?? 'falha') })
      continue
    }
    if (ev.type !== 'write_performed' || !ev.data?.dryRun || ev.data?.visualFilterMutation) continue
    const d = ev.data
    if (!d.writeKey) continue

    const before = String(d.beforeValue ?? '')
    const after = String(d.afterValue ?? '')
    const warnings: string[] = []
    const beforeFilled = before.trim() !== '' && !MASK_EMPTY_RE.test(before)
    if (beforeFilled && before.trim() !== after.trim()) warnings.push('Campo já preenchido no portal: será sobrescrito')
    if (after.trim() === '') warnings.push('Valor novo vazio')

    const existing = seenKeys.get(d.writeKey)
    if (existing) {
      existing.warnings.push('Mesmo campo gravado mais de uma vez nesta tarefa')
      continue
    }

    const row: MirrorRow = {
      id: `w${rows.length + 1}`,
      writeKey: d.writeKey,
      label: String(d.label ?? ev.nodeId ?? ''),
      target: String(d.target ?? ''),
      semantic: d.semantic,
      before,
      after,
      changed: before.trim() !== after.trim(),
      warnings,
    }
    seenKeys.set(d.writeKey, row)
    rows.push(row)
  }

  return { runId: events[0]?.runId, createdAt: now.toISOString(), rows, failures }
}

/** Lista de escritas aprovadas, a partir das linhas que a professora manteve marcadas. */
export function approvedWritesFrom(mirror: ReviewMirror, approvedRowIds: Iterable<string>): Array<{ key: string; value: string }> {
  const ids = new Set(approvedRowIds)
  return mirror.rows.filter(r => ids.has(r.id)).map(r => ({ key: r.writeKey, value: r.after }))
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Página HTML autocontida (sem scripts externos) para revisão. Devolve ids aprovados via postMessage. */
export function renderReviewMirrorHtml(mirror: ReviewMirror, title = 'Revisão antes de gravar no portal'): string {
  const changed = mirror.rows.filter(r => r.changed).length
  const withWarnings = mirror.rows.filter(r => r.warnings.length > 0).length
  const rowsHtml = mirror.rows
    .map(
      r => `<tr class="${r.warnings.length ? 'warn' : ''}${r.changed ? '' : ' same'}">
  <td><input type="checkbox" data-id="${esc(r.id)}" ${r.changed ? 'checked' : ''}></td>
  <td>${esc(r.target || r.label)}</td>
  <td>${esc(r.label)}</td>
  <td class="old">${esc(r.before || '—')}</td>
  <td class="new">${esc(r.after || '—')}</td>
  <td>${r.warnings.map(w => `<div>⚠ ${esc(w)}</div>`).join('')}</td>
</tr>`
    )
    .join('\n')
  const failuresHtml = mirror.failures.length
    ? `<section class="fail"><h2>Não foi possível preparar</h2><ul>${mirror.failures
        .map(f => `<li>${esc(f.error)}</li>`)
        .join('')}</ul></section>`
    : ''

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--warn:#fff6e0;--new:#0a7a3d;--old:#a33}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#f2f2f4;--muted:#a0a0a6;--line:#2c2c30;--warn:#3a2f12;--new:#5fd38d;--old:#ff8a80}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px;margin:0 0 4px}p.sum{color:var(--muted);margin:0 0 16px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:640px}
th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
tr.warn{background:var(--warn)}tr.same{opacity:.55}.old{color:var(--old);text-decoration:line-through}.new{color:var(--new);font-weight:600}
.bar{position:sticky;bottom:0;background:var(--bg);padding:12px 0;display:flex;gap:8px;border-top:1px solid var(--line)}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);cursor:pointer}
button.primary{background:var(--new);color:#fff;border-color:transparent}
.fail{margin-top:16px;color:var(--old)}
</style></head><body>
<h1>${esc(title)}</h1>
<p class="sum">${mirror.rows.length} campos · ${changed} mudanças · ${withWarnings} com aviso. Nada foi gravado ainda.</p>
<div class="wrap"><table>
<thead><tr><th>Aplicar</th><th>Onde</th><th>Campo</th><th>Hoje no portal</th><th>Vai ficar</th><th>Avisos</th></tr></thead>
<tbody>
${rowsHtml}
</tbody></table></div>
${failuresHtml}
<div class="bar"><button class="primary" id="approve">Aprovar e gravar selecionados</button><button id="cancel">Cancelar</button></div>
<script>
(function(){
  function send(msg){ try{ (window.opener||window.parent).postMessage(msg, '*') }catch(e){} }
  document.getElementById('approve').onclick=function(){
    var ids=[].slice.call(document.querySelectorAll('input[data-id]:checked')).map(function(i){return i.getAttribute('data-id')});
    send({type:'TEACHER_MIRROR_APPROVED', runId:${JSON.stringify(mirror.runId ?? null)}, approvedRowIds:ids});
  };
  document.getElementById('cancel').onclick=function(){ send({type:'TEACHER_MIRROR_CANCELLED', runId:${JSON.stringify(mirror.runId ?? null)}}) };
})();
</script>
</body></html>`
}
