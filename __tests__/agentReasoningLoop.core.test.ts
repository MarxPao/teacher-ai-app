import { describe, it, expect, vi, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { ReasoningLoopExecutor, buildObservation, observationFromSnapshot, type AgentAction, type PlannerInput } from '../lib/agent/reasoningLoop'
import { parseAction, createLlmPlanner, parseVerdict, createLlmVerifier, formatObservation, type LlmImage } from '../lib/agent/llmPlanner'
import type { Driver, Host } from '../lib/runner/types'
import { observeAgentPage, AGENT_VISUAL_ATTR, type AgentPageSnapshot, type AgentVisual } from '../lib/runner-dom/agentObserver'
import { captureVisualInPage } from '../lib/runner-dom/visualCapture'
import { DomDriver } from '../lib/runner-dom/driver'
import { mergeFrameSnapshots } from '../lib/agent/frames'
import { LlmGateway, VISION_CONSENT_KEY, openAiContent } from '../desktop/llm/llmGateway'

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

// ── Gap 2: visão (canvas, SVG, PDF incorporado) ───────────────────────────────

// jsdom não faz layout: cada elemento declara seu tamanho em data-w/data-h
function visualDom(html: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url: 'https://escola.test/painel' })
  const win = dom.window as any
  win.Element.prototype.getBoundingClientRect = function () {
    const w = Number(this.getAttribute?.('data-w') ?? 120)
    const h = Number(this.getAttribute?.('data-h') ?? 30)
    return { left: 10, top: 20, x: 10, y: 20, width: w, height: h, right: 10 + w, bottom: 20 + h }
  }
  return dom.window.document
}

const PAGE = `
  <main>
    <h2>Desempenho da turma</h2>
    <canvas id="c" data-w="600" data-h="300" width="600" height="300"></canvas>
    <figure><figcaption>Frequência mensal</figcaption>
      <svg data-w="400" data-h="200"><text>Jan</text><text>Fev</text><text>85%</text><desc>Barras</desc></svg>
    </figure>
    <button><svg data-w="300" data-h="300"><path/></svg>Salvar</button>
    <svg data-w="24" data-h="24"><path/></svg>
    <embed type="application/pdf" src="/boletim/2026.pdf?token=segredo" data-w="700" data-h="500" title="Boletim">
  </main>`

describe('gap 2: observação de regiões visuais', () => {
  it('lista canvas, SVG grande e PDF incorporado; ignora ícones', () => {
    const doc = visualDom(PAGE)
    const snap = observeAgentPage(doc)
    const kinds = (snap.visuals ?? []).map(v => v.kind).sort()
    expect(kinds).toEqual(['canvas', 'pdf', 'svg'])
    const pdf = snap.visuals!.find(v => v.kind === 'pdf')!
    expect(pdf.label).toBe('Boletim')
    // Query string (tokens de sessão) nunca vai para o prompt
    expect(pdf.src).toBe('https://escola.test/boletim/2026.pdf')
    const svg = snap.visuals!.find(v => v.kind === 'svg')!
    expect(svg.label).toBe('Frequência mensal')
    expect(svg.text).toContain('85%')
    const canvas = snap.visuals!.find(v => v.kind === 'canvas')!
    expect(canvas.label).toBe('Desempenho da turma')
    // Maior primeiro, refs sequenciais e carimbo no DOM
    expect(snap.visuals!.map(v => v.ref)).toEqual(['V0', 'V1', 'V2'])
    expect(snap.visuals![0].kind).toBe('pdf')
    expect(doc.querySelectorAll(`[${AGENT_VISUAL_ATTR}]`).length).toBe(3)
  })

  it('reobservar troca os carimbos (um V# antigo não aponta para outro gráfico)', () => {
    const doc = visualDom(PAGE)
    const a = observeAgentPage(doc)
    const b = observeAgentPage(doc)
    expect(doc.querySelectorAll(`[${AGENT_VISUAL_ATTR}]`).length).toBe(3)
    expect(() => captureVisualInPage(doc, { stamp: a.visuals![0].stamp })).toThrow(/não encontrada/)
    expect(captureVisualInPage(doc, { stamp: b.visuals![0].stamp }).kind).toBe('pdf')
  })

  it('canvas legível vira PNG; canvas com imagem de outra origem pede screenshot', async () => {
    const doc = visualDom(PAGE)
    const canvas = doc.getElementById('c') as any
    canvas.width = 300
    canvas.height = 150
    canvas.toDataURL = () => 'data:image/png;base64,QUJD'
    const snap = observeAgentPage(doc)
    const v = snap.visuals!.find(x => x.kind === 'canvas')!
    const part = captureVisualInPage(doc, { stamp: v.stamp })
    expect(part.dataUrl).toBe('data:image/png;base64,QUJD')
    expect(part.rect).toMatchObject({ x: 10, y: 20, width: 600, height: 300 })

    const driver = new DomDriver(doc, ['escola.test'])
    const cap = await driver.captureVisual({ stamp: v.stamp })
    expect(cap).toMatchObject({ mimeType: 'image/png', data: 'QUJD', source: 'canvas' })

    canvas.toDataURL = () => {
      throw Object.assign(new Error('Tainted canvases may not be exported'), { name: 'SecurityError' })
    }
    expect(captureVisualInPage(doc, { stamp: v.stamp }).tainted).toBe(true)
    await expect(driver.captureVisual({ stamp: v.stamp })).rejects.toThrow(/screenshot/)
  })

  it('junta regiões visuais de iframes de outra origem com o frameId', () => {
    const vis = (kind: AgentVisual['kind']): AgentVisual => ({ ref: 'V0', stamp: 's-' + kind, kind, label: '', width: 300, height: 200, region: 'main' })
    const base: AgentPageSnapshot = { url: 'https://escola.test', title: '', elements: [], text: '', dialogOpen: false, omitted: 0 }
    const merged = mergeFrameSnapshots({ ...base, visuals: [vis('canvas')] }, [
      { frameId: 3, url: 'https://relatorios.test', host: 'relatorios.test', snapshot: { ...base, visuals: [vis('pdf')] } },
    ])
    expect(merged.visuals!.map(v => [v.ref, v.kind, v.frameId])).toEqual([
      ['V0', 'canvas', undefined],
      ['V1', 'pdf', 3],
    ])
  })
})

// Portal falso com gráficos; o rótulo do botão muda depois do clique (tela nova)
function visionDriver(opts: { fail?: boolean; visuals?: number } = {}) {
  let page = 0
  const captures: string[] = []
  const visuals = Array.from({ length: opts.visuals ?? 1 }, (_, i) => ({
    ref: `V${i}`,
    kind: 'canvas' as const,
    label: `Gráfico ${i}`,
    width: 600 - i * 100,
    height: 300,
    region: 'main' as const,
  }))
  const driver: Partial<Driver> = {
    getFrameContext: async () => ({ url: 'https://escola.test/painel', host: 'escola.test', frameId: 0 }),
    observePage: async () => ({
      url: 'https://escola.test/painel',
      title: 'Painel',
      elements: [{ idx: 0, stamp: 'b0', tag: 'button', label: page === 0 ? 'Filtrar' : 'Filtrado', region: 'main' }],
      text: 'Painel',
      dialogOpen: false,
      omitted: 0,
      // O carimbo muda a cada observação, como no observador real
      visuals: visuals.map(v => ({ ...v, stamp: `n${Math.random()}-${v.ref}` })),
    }),
    describeClickTarget: async () => ({ tagName: 'button', isSubmitOrMutating: false }),
    click: async () => {
      page++
      return { success: true }
    },
    captureVisual: async t => {
      captures.push(t.stamp)
      if (opts.fail) throw new Error('debugger indisponível')
      return { mimeType: 'image/png', data: 'UE5H', source: 'canvas' }
    },
  }
  return { driver: driver as Driver, captures }
}

describe('gap 2: imagens no loop do agente', () => {
  it('anexa a imagem do gráfico ao planner e não recaptura a mesma tela', async () => {
    const { driver, captures } = visionDriver()
    const { host } = makeHost()
    const seen: PlannerInput[] = []
    const plan = [
      { action: 'wait', ms: 1, reason: 'carregando' },
      { action: 'click', idx: 0, reason: 'filtrar' },
      { action: 'complete', reason: 'média 7,5' },
    ] as AgentAction[]
    let i = 0
    const r = await new ReasoningLoopExecutor(driver, host, async input => {
      seen.push(input)
      return plan[i++]
    }).run('qual a média no gráfico?')
    expect(r.success).toBe(true)
    expect(seen[0].images).toEqual([{ ref: 'V0', kind: 'canvas', label: 'Gráfico 0', mimeType: 'image/png', data: 'UE5H' }])
    expect(seen[0].observation.visuals?.[0].label).toBe('Gráfico 0')
    // Passo 2: mesma tela (wait não muda nada) => cache; passo 3: tela nova => captura nova
    expect(seen[1].images?.length).toBe(1)
    expect(seen[2].images?.length).toBe(1)
    expect(captures.length).toBe(2)
  })

  it('falha de captura não derruba a tarefa', async () => {
    const { driver } = visionDriver({ fail: true })
    const { host } = makeHost()
    let got: PlannerInput | undefined
    const r = await new ReasoningLoopExecutor(driver, host, async input => {
      got = input
      return { action: 'complete', reason: 'ok' }
    }).run('t')
    expect(r.success).toBe(true)
    expect(got!.images).toBeUndefined()
    expect(got!.observation.visuals?.length).toBe(1)
  })

  it('respeita vision:false e o limite de imagens por passo', async () => {
    const seen: PlannerInput[] = []
    const planner = async (input: PlannerInput) => {
      seen.push(input)
      return { action: 'complete', reason: 'ok' } as AgentAction
    }
    const off = visionDriver({ visuals: 3 })
    await new ReasoningLoopExecutor(off.driver, makeHost().host, planner, { vision: false }).run('t')
    expect(off.captures.length).toBe(0)
    expect(seen[0].images).toBeUndefined()

    const lim = visionDriver({ visuals: 3 })
    await new ReasoningLoopExecutor(lim.driver, makeHost().host, planner, { vision: { maxImagesPerStep: 2 } }).run('t')
    expect(seen[1].images!.map(x => x.ref)).toEqual(['V0', 'V1'])
  })

  it('o verificador também recebe as imagens', async () => {
    const { driver } = visionDriver()
    let verifyImages: unknown
    const r = await new ReasoningLoopExecutor(driver, makeHost().host, async () => ({ action: 'complete', reason: 'ok' }), {
      verify: async input => {
        verifyImages = input.images
        return { achieved: true, reason: 'visto' }
      },
    }).run('t')
    expect(r.success).toBe(true)
    expect((verifyImages as any[]).length).toBe(1)
  })
})

describe('gap 2: planner com imagens', () => {
  const snap: AgentPageSnapshot = {
    url: 'https://escola.test',
    title: 'Painel',
    elements: [],
    text: '',
    dialogOpen: false,
    omitted: 0,
    visuals: [
      { ref: 'V0', stamp: 's0', kind: 'canvas', label: 'Notas', width: 600, height: 300, region: 'main' },
      { ref: 'V1', stamp: 's1', kind: 'pdf', label: 'Boletim', width: 700, height: 500, region: 'main', src: 'https://escola.test/b.pdf' },
      { ref: 'V2', stamp: 's2', kind: 'svg', label: '', width: 400, height: 200, region: 'main', text: 'aluno@escola.com | 85%' },
    ],
  }

  it('descreve as regiões e diz quais têm imagem', () => {
    const obs = observationFromSnapshot(snap)
    const txt = formatObservation({
      task: 't',
      observation: obs,
      history: [],
      images: [{ ref: 'V0', kind: 'canvas', label: 'Notas', mimeType: 'image/png', data: 'x' }],
    })
    expect(txt).toContain('REGIÕES VISUAIS')
    expect(txt).toContain('[V0] gráfico (canvas) "Notas" 600x300 — imagem anexada')
    expect(txt).toContain('[V1] PDF incorporado "Boletim" 700x500 — sem imagem')
    expect(txt).toContain('arquivo: https://escola.test/b.pdf')
    // Texto do SVG passa pela mesma proteção de PII do resto da página
    expect(txt).toContain('[EMAIL_PROTEGIDO] | 85%')
    expect(txt).not.toContain('aluno@escola.com')
  })

  it('manda as imagens como terceiro argumento só quando existem', async () => {
    const calls: Array<LlmImage[] | undefined> = []
    const argc: number[] = []
    const p = createLlmPlanner(async (...args: any[]) => {
      argc.push(args.length)
      calls.push(args[2])
      return '{"action":"complete","reason":"ok"}'
    })
    const obs = observationFromSnapshot(snap)
    await p({ task: 't', observation: obs, history: [], images: [{ ref: 'V0', kind: 'canvas', label: 'Notas', mimeType: 'image/png', data: 'QUJD' }] })
    await p({ task: 't', observation: obs, history: [] })
    expect(calls[0]).toEqual([{ ref: 'V0', mimeType: 'image/png', data: 'QUJD' }])
    expect(argc).toEqual([3, 2])
  })
})

describe('gap 2: gateway só envia imagens com consentimento de visão', () => {
  const vault = { hasApiKey: (p: string) => p === 'google', getApiKey: (p: string) => (p === 'google' ? 'k' : null) }
  const images = [{ ref: 'V0', mimeType: 'image/png' as const, data: 'QUJD' }]
  const geminiOk = () =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"action":"complete"}' }] } }] }) })
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  it('com consentimento: inline_data vai para o Gemini', async () => {
    const fetchMock = geminiOk()
    global.fetch = fetchMock as any
    const consentRepo = { getConsent: vi.fn(async (k: string) => k === VISION_CONSENT_KEY) }
    const gw = new LlmGateway({ consentRepo: consentRepo as any, vault: vault as any })
    const res = await gw.complete({ prompt: 'p', provider: 'google', images })
    expect(res.imagesSent).toBe(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.contents[0].parts).toContainEqual({ inline_data: { mime_type: 'image/png', data: 'QUJD' } })
  })

  it('sem consentimento: a imagem fica na máquina e o modelo é avisado', async () => {
    const fetchMock = geminiOk()
    global.fetch = fetchMock as any
    const consentRepo = { getConsent: vi.fn(async () => false) }
    const gw = new LlmGateway({ consentRepo: consentRepo as any, vault: vault as any })
    const res = await gw.complete({ prompt: 'p', provider: 'google', images })
    expect(res.imagesSent).toBe(0)
    const raw = fetchMock.mock.calls[0][1].body as string
    expect(raw).not.toContain('QUJD')
    expect(raw).toContain('NÃO foram enviadas')
  })

  it('OpenAI/Groq recebem image_url em data URL', () => {
    expect(openAiContent('p', images)).toEqual([
      { type: 'text', text: 'p' },
      { type: 'text', text: '[V0]' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
    ])
  })
})
