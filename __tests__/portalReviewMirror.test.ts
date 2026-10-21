// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { describeClickElement } from '../lib/runner-dom/clickSafety'
import { DomDriver } from '../lib/runner-dom/driver'
import { buildReviewMirror, approvedWritesFrom, renderReviewMirrorHtml } from '../lib/runner/reviewMirror'
import { executeWriteNode, writeKey } from '../lib/runner/nodes/write'

const el = (html: string) => { document.body.innerHTML = html; return document.body.querySelector('[data-t]')! }

describe('clickSafety', () => {
  it('marca Salvar e submit nativo', () => {
    expect(describeClickElement(el('<button data-t>Salvar notas</button>')).isSubmitOrMutating).toBe(true)
    expect(describeClickElement(el('<form><button data-t>OK</button></form>')).isSubmitOrMutating).toBe(true)
    expect(describeClickElement(el('<input data-t type="submit" value="Gravar">')).isSubmitOrMutating).toBe(true)
    expect(describeClickElement(el('<a data-t href="javascript:__doPostBack(1)">x</a>')).isSubmitOrMutating).toBe(true)
  })
  it('não marca consulta nem link comum', () => {
    expect(describeClickElement(el('<form><button data-t>Pesquisar</button></form>')).isSubmitOrMutating).toBe(false)
    expect(describeClickElement(el('<a data-t href="/turmas">Turma 7A</a>')).isSubmitOrMutating).toBe(false)
    expect(describeClickElement(el('<button data-t type="button">Abrir</button>')).isSubmitOrMutating).toBe(false)
  })
})

describe('DomDriver.click', () => {
  it('recusa envio não declarado e aceita declarado', async () => {
    document.body.innerHTML = '<button id="s">Salvar</button>'
    let clicked = 0; document.getElementById('s')!.addEventListener('click', () => clicked++)
    const d = new DomDriver(document, ['localhost'])
    const target = { anchor: { candidates: [{ strategy: 'css', selector: '#s' }], description: 'salvar' } } as any
    await expect(d.click(target)).rejects.toMatchObject({ code: 'E_CLICK_UNDECLARED_SUBMIT' })
    expect(clicked).toBe(0)
    expect((await d.describeClickTarget(target)).isSubmitOrMutating).toBe(true)
  })
})

function fakeDriver(afterValue: string) {
  const writes: string[] = []
  return { writes, driver: {
    readValue: async () => ({ value: '' }),
    write: async (o: any) => { writes.push(o.value); return { success: true, beforeValue: '', afterValue: afterValue || o.value, verified: true } },
    inspectWriteTarget: async () => ({ isInTable: true, hasDangerousSiblings: false, tagName: 'input' }),
  } as any }
}
const host = { emit: (e: any) => events.push(e), audit: async () => {}, now: () => 1 } as any
let events: any[] = []
const node = { type: 'WRITE', label: 'Nota', anchor: { candidates: [{ strategy: 'css', selector: '#n' }], description: 'nota Ana' }, value: { lit: '8' }, method: 'type_native', semantic: 'text', on_success: '$end', on_fail: '$abort' } as any

describe('espelho + barreira de aprovação', () => {
  it('dry-run vira espelho, e só o aprovado é gravado', async () => {
    events = []
    const { driver } = fakeDriver('')
    const st: any = { runId: 'r', variables: {}, writesCount: 0, dryRun: true }
    await executeWriteNode(node, 'n1', st, {}, driver, host, {})
    const mirror = buildReviewMirror(events)
    expect(mirror.rows).toHaveLength(1)
    expect(renderReviewMirrorHtml(mirror)).toContain('Vai ficar')
    const approved = approvedWritesFrom(mirror, [mirror.rows[0].id])

    const real = fakeDriver('')
    const st2: any = { runId: 'r2', variables: {}, writesCount: 0, dryRun: false, approvedWrites: new Map(approved.map(a => [a.key, a.value])) }
    const okRes = await executeWriteNode(node, 'n1', st2, {}, real.driver, host, {})
    expect(okRes).toBe('$end'); expect(real.writes).toEqual(['8'])

    const st3: any = { ...st2, writesCount: 0, approvedWrites: new Map() }
    const r3 = fakeDriver('')
    await expect(executeWriteNode(node, 'n1', st3, {}, r3.driver, host, {})).rejects.toMatchObject({ code: 'E_WRITE_NOT_APPROVED' })
    expect(r3.writes).toEqual([])
  })
  it('read-back divergente reverte', async () => {
    const r = fakeDriver('9')
    const st: any = { runId: 'r', variables: {}, writesCount: 0, dryRun: false }
    await expect(executeWriteNode(node, 'n1', st, {}, r.driver, host, {})).rejects.toMatchObject({ code: 'E_READBACK_MISMATCH' })
  })
})
