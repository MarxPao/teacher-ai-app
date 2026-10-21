import { describe, it, expect } from 'vitest'
import { ReasoningLoopExecutor, buildObservation, type AgentAction } from '../lib/agent/reasoningLoop'
import { parseAction, createLlmPlanner, parseVerdict, createLlmVerifier } from '../lib/agent/llmPlanner'
import type { Driver, Host } from '../lib/runner/types'

const desc = (o: any) => ({ tag: 'button', classes: [], candidates: [], ...o })

function makeDriver(pages: any[][], opts: { verified?: boolean } = {}) {
  let page = 0
  const calls: string[] = []
  const driver: Partial<Driver> = {
    getFrameContext: async () => ({ url: `https://escola.test/p${page}`, host: 'escola.test', frameId: 0 }),
    describeElements: async () => pages[page] as any,
    describeClickTarget: async () => ({ tagName: 'button', isSubmitOrMutating: false }),
    click: async () => { calls.push('click'); page = Math.min(page + 1, pages.length - 1); return { success: true } },
    readValue: async () => ({ value: 'antes' }),
    write: async o => { calls.push(`write:${o.value}`); if (opts.verified === false && o.value === 'antes') return { success: true, beforeValue: '', afterValue: 'antes', verified: true }; return { success: true, beforeValue: '', afterValue: opts.verified === false ? 'x' : o.value, verified: opts.verified !== false } },
    navigate: async () => { calls.push('navigate') },
  }
  return { driver: driver as Driver, calls }
}

function makeHost(approve = true) {
  const asked: string[] = []
  const audits: string[] = []
  const host: Partial<Host> = {
    audit: async e => { audits.push(`${e.action}:${e.verified_by}`) },
    confirm: async p => { asked.push(p.label); return approve },
    sleep: async () => {},
    now: () => 0,
    randomId: () => 'id',
  }
  return { host: host as Host, asked, audits }
}

const script = (...a: AgentAction[]) => { let i = 0; return async () => a[Math.min(i++, a.length - 1)] }

describe('ReasoningLoopExecutor', () => {
  it('clica e completa', async () => {
    const { driver, calls } = makeDriver([[desc({ text: 'Notas', role: 'button' })], [desc({ text: 'Turma A' })]])
    const { host } = makeHost()
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'click', idx: 0, reason: 'abrir' }, { action: 'complete', reason: 'ok' })).run('abrir notas')
    expect(r.success).toBe(true)
    expect(calls).toEqual(['click'])
  })

  it('exige confirmação para escrita e respeita rejeição', async () => {
    const { driver, calls } = makeDriver([[desc({ tag: 'input', placeholder: 'Nota' })]])
    const { host, asked } = makeHost(false)
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'type', idx: 0, value: '8', reason: 'x' })).run('lançar nota')
    expect(r.stoppedFor).toBe('rejected')
    expect(asked.length).toBe(1)
    expect(calls).toEqual([])
  })

  it('escrita não verificada reverte e audita', async () => {
    const { driver, calls } = makeDriver([[desc({ tag: 'input', placeholder: 'Nota' })]], { verified: false })
    const { host, audits } = makeHost()
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'type', idx: 0, value: '8', reason: 'x' }), { maxSteps: 1 }).run('t')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/não verificada/)
    expect(calls).toEqual(['write:8', 'write:antes'])
    expect(audits).toEqual(['write:none', 'revert:read_back'])
  })

  it('sem auditoria não escreve', async () => {
    const { driver, calls } = makeDriver([[desc({ tag: 'input', placeholder: 'Nota' })]])
    const { host } = makeHost()
    host.audit = async () => { throw new Error('offline') }
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'type', idx: 0, value: '8', reason: 'x' }), { maxSteps: 1 }).run('t')
    expect(r.success).toBe(false)
    expect(calls).toEqual([])
  })

  it('escrita verificada audita antes e depois', async () => {
    const { driver } = makeDriver([[desc({ tag: 'input', placeholder: 'Nota' })]])
    const { host, audits } = makeHost()
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'type', idx: 0, value: '8', reason: 'x' }, { action: 'complete', reason: 'ok' })).run('t')
    expect(r.success).toBe(true)
    expect(audits).toEqual(['write:none', 'write:read_back'])
  })

  it('pede confirmação em clique destrutivo', async () => {
    const { driver, calls } = makeDriver([[desc({ text: 'Salvar notas' })]])
    const { host, asked } = makeHost(false)
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'click', idx: 0, reason: 'x' })).run('Salve as notas')
    expect(r.stoppedFor).toBe('rejected')
    expect(asked.length).toBe(1)
    expect(calls).toEqual([])
  })

  it('detecta loop de estado', async () => {
    const { driver } = makeDriver([[desc({ text: 'A' })]])
    const { host } = makeHost()
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'wait', reason: 'x' }), { maxSteps: 10 }).run('t')
    expect(r.stoppedFor).toBe('loop_detected')
  })

  it('bloqueia host fora da lista', async () => {
    const { driver } = makeDriver([[desc({ text: 'A' })]])
    const { host } = makeHost()
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'complete', reason: 'x' }), { allowedHosts: ['outro.test'] }).run('t')
    expect(r.stoppedFor).toBe('host_blocked')
  })

  it('mascara PII nos rótulos', () => {
    const o = buildObservation('u', [desc({ text: 'João 123.456.789-09' })] as any)
    expect(o.elements[0].label).toContain('[CPF_PROTEGIDO]')
  })
})

describe('verificação final', () => {
  it('conclusão aceita só se o verificador confirmar', async () => {
    const { driver } = makeDriver([[desc({ text: 'A' })]])
    const { host } = makeHost()
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'complete', reason: 'feito' }), { verify: async () => ({ achieved: true, reason: 'ok' }) }).run('t')
    expect(r.success).toBe(true)
  })

  it('verificador recusa duas vezes e falha', async () => {
    const { driver } = makeDriver([[desc({ text: 'A' })]])
    const { host } = makeHost()
    let calls = 0
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'complete', reason: 'feito' }), { verify: async () => { calls++; return { achieved: false, reason: 'nada mudou' } } }).run('t')
    expect(r.success).toBe(false)
    expect(r.stoppedFor).toBe('verification_failed')
    expect(calls).toBe(2)
  })

  it('erro do verificador não conta como sucesso', async () => {
    const { driver } = makeDriver([[desc({ text: 'A' })]])
    const { host } = makeHost()
    const r = await new ReasoningLoopExecutor(driver, host, script({ action: 'complete', reason: 'feito' }), { verify: async () => { throw new Error('offline') } }).run('t')
    expect(r.success).toBe(false)
    expect(r.stoppedFor).toBe('verification_failed')
  })

  it('parseVerdict valida a saída', async () => {
    expect(parseVerdict('{"achieved":true,"reason":"r"}')).toEqual({ achieved: true, reason: 'r' })
    expect(() => parseVerdict('{"reason":"x"}')).toThrow()
    const v = createLlmVerifier(async (_s, u) => (u.includes('Afirmação do agente: pronto') ? '{"achieved":false,"reason":"sem prova"}' : '{"achieved":true,"reason":""}'))
    const out = await v({ task: 't', observation: buildObservation('u', []), history: [], claim: 'pronto' })
    expect(out.achieved).toBe(false)
  })
})

describe('llmPlanner', () => {
  it('valida e rejeita saída ruim', () => {
    expect(parseAction('{"action":"click","idx":1,"reason":"r"}', 3)).toEqual({ action: 'click', idx: 1, reason: 'r' })
    expect(() => parseAction('{"action":"click","idx":9}', 3)).toThrow()
    expect(() => parseAction('blabla', 3)).toThrow()
    expect(() => parseAction('{"action":"navigate","url":"javascript:alert(1)"}', 3)).toThrow()
  })
  it('chama o modelo com a observação', async () => {
    let seen = ''
    const p = createLlmPlanner(async (_s, u) => { seen = u; return '{"action":"complete","reason":"ok"}' })
    const a = await p({ task: 'T', observation: buildObservation('https://x', [desc({ text: 'Botão' })] as any), history: [] })
    expect(a.action).toBe('complete')
    expect(seen).toContain('[0] button "Botão"')
  })
})
