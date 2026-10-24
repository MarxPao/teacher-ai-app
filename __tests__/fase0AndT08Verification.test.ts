// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { Pseudonymizer, cleanStudentRosterName } from '../lib/desktop-core/llm/pseudonymizer'
import { observeAgentPage } from '../lib/runner-dom/agentObserver'
import {
  ReasoningLoopExecutor,
  isHostAllowed,
  observationFromSnapshot,
  verifyObjectiveCompletion,
  type Observation,
} from '../lib/agent/reasoningLoop'
import { createLlmPlanner, createLlmVerifier, formatObservation } from '../lib/agent/llmPlanner'
import { DomDriver } from '../lib/runner-dom/driver'
import { portalExecLog } from '../lib/portalExecLog'

function makeHost() {
  return {
    now: () => Date.now(),
    sleep: async () => {},
    randomId: () => 'run-test-' + Math.random().toString(36).slice(2, 8),
    confirm: async () => true,
    audit: async () => {},
    notify: () => {},
    log: () => {},
  } as any
}

describe('Fase 0 & Fase 1 — Fechamento de T08, Gaps 4/6 e Pseudonimização Aluno↔Linha', () => {
  beforeEach(() => {
    portalExecLog.clear()
    document.body.innerHTML = ''
  })

  describe('T08 & Gap 6 — Combobox assíncrono, input readonly e verificação objetiva', () => {
    it('marca input aria-autocomplete="list" como autocomplete e formata aviso de busca não confirmada', () => {
      document.body.innerHTML = `
        <main>
          <label for="cb">Destinatários</label>
          <div role="combobox">
            <input id="cb" aria-autocomplete="list" placeholder="Digite para buscar destinatários" value="Responsáveis — 6º Ano A" />
          </div>
          <input id="dt" aria-label="Data de envio" readonly value="" />
          <button type="button">Publicar</button>
        </main>
      `
      // Em JSDOM, getBoundingClientRect retorna zeros por padrão; mockamos para visibilidade
      for (const el of Array.from(document.querySelectorAll('*'))) {
        ;(el as HTMLElement).getBoundingClientRect = () =>
          ({ width: 120, height: 32, top: 10, left: 10, right: 130, bottom: 42, x: 10, y: 10, toJSON: () => {} }) as any
      }

      const snap = observeAgentPage(document)
      const obs = observationFromSnapshot({ ...snap, url: 'http://127.0.0.1/comunicados/novo' })
      const cbEl = obs.elements.find(e => e.tag === 'input' && e.label.includes('Destinatários'))
      expect(cbEl).toBeDefined()
      expect(cbEl?.autocomplete).toBe(true)

      const formatted = formatObservation({
        task: 'Publique um comunicado',
        observation: obs,
        history: [],
      })
      expect(formatted).toContain('[busca não confirmada — clique na opção da lista]')
      expect(formatted).toContain('[somente leitura]')
    })

    it('rejeita conclusões falsas (T08) quando há busca não confirmada no combobox ou diálogo de confirmação aberto', () => {
      const obsUncommitted: Observation = {
        url: 'http://127.0.0.1/comunicados/novo',
        stateHash: 'h1',
        elements: [
          {
            idx: 0,
            tag: 'input',
            label: 'Destinatários',
            value: 'Responsáveis — 6º Ano A',
            autocomplete: true,
            destructive: false,
          },
        ],
        text: 'Comunicado publicado.',
      }
      const v1 = verifyObjectiveCompletion(obsUncommitted)
      expect(v1.achieved).toBe(false)
      expect(v1.reason).toContain('sem opção selecionada na lista')

      const obsDialogOpen: Observation = {
        url: 'http://127.0.0.1/comunicados/novo',
        stateHash: 'h2',
        dialogOpen: true,
        elements: [
          {
            idx: 0,
            tag: 'button',
            label: 'Publicar agora',
            region: 'dialog',
            destructive: true,
          },
        ],
      }
      const v2 = verifyObjectiveCompletion(obsDialogOpen)
      expect(v2.achieved).toBe(false)
      expect(v2.reason).toContain('diálogo de confirmação aberto')
    })

    it('interrompe lote após type em combobox, bloqueia clique em Publicar com busca pendente e registra PortalExecLog (Gap 6)', async () => {
      let currentVal = ''
      let optionPicked = false
      let published = false

      const driver: any = {
        getFrameContext: async () => ({ url: 'http://escola.paineldoaluno.com.br/comunicados/novo', host: 'escola.paineldoaluno.com.br', isTopFrame: true }),
        observePage: async () => ({
          url: 'http://escola.paineldoaluno.com.br/comunicados/novo',
          title: 'Novo Comunicado',
          dialogOpen: false,
          omitted: 0,
          text: published ? 'Comunicado publicado.' : 'Novo comunicado',
          elements: [
            {
              idx: 0,
              stamp: 's-0',
              tag: 'input',
              label: 'Destinatários',
              value: currentVal,
              autocomplete: true,
              region: 'main',
            },
            ...(currentVal && !optionPicked
              ? [
                  {
                    idx: 1,
                    stamp: 's-1',
                    tag: 'div',
                    role: 'option',
                    label: 'Responsáveis — 6º Ano A',
                    region: 'main',
                  },
                ]
              : []),
            {
              idx: currentVal && !optionPicked ? 2 : 1,
              stamp: 's-pub',
              tag: 'button',
              label: 'Publicar',
              region: 'main',
            },
          ],
        }),
        readValue: async () => ({ value: currentVal }),
        write: async ({ value }: any) => {
          currentVal = value
          return { success: true, verified: true, afterValue: value }
        },
        click: async (target: any) => {
          const desc = target.anchor.description
          if (desc === 'Responsáveis — 6º Ano A') {
            optionPicked = true
            currentVal = ''
          } else if (desc === 'Publicar') {
            published = true
          }
        },
      }

      let stepCall = 0
      const planner = async (input: any) => {
        stepCall++
        if (stepCall === 1) {
          // Simula o erro clássico do LLM em T08: tenta digitar no combobox e clicar em Publicar no mesmo lote
          return [
            { action: 'type', idx: 0, value: '6º Ano A', reason: 'buscar turma' },
            { action: 'click', idx: 1, reason: 'tentar publicar direto no mesmo lote' },
          ] as any
        }
        if (stepCall === 2) {
          // O lote anterior foi interrompido após o type; agora a opção [role="option"] está visível em idx 1!
          expect(input.observation.elements.some((e: any) => e.role === 'option' && e.label === 'Responsáveis — 6º Ano A')).toBe(true)
          return [
            { action: 'click', idx: 1, reason: 'selecionar opção da lista' },
          ] as any
        }
        if (stepCall === 3) {
          return [{ action: 'click', idx: 1, reason: 'publicar comunicado' }] as any
        }
        return { action: 'complete', reason: 'Comunicado publicado com sucesso' } as any
      }

      const loop = new ReasoningLoopExecutor(driver, makeHost(), planner, {
        allowedHosts: ['*.paineldoaluno.com.br'],
        settleMs: 1,
        policy: false,
      })

      const res = await loop.run('Publique o comunicado para Responsáveis — 6º Ano A')
      expect(res.success).toBe(true)
      expect(optionPicked).toBe(true)
      expect(published).toBe(true)
      expect(res.execLogId).toBeDefined()

      const logs = portalExecLog.getAll()
      expect(logs.length).toBe(1)
      expect(logs[0].execId).toBe(res.execLogId)
      expect(logs[0].status).toBe('success')
      expect(logs[0].replay.some(a => a.kind === 'finish' && a.ok)).toBe(true)
    })
  })

  describe('Gap 4 — Subdomínios e curingas em allowedHosts', () => {
    it('aceita correspondência exata, subdomínios (*.dominio / .dominio) e bloqueia hosts externos', () => {
      const allowed = ['127.0.0.1', '*.paineldoaluno.com.br', '.seduc.sp.gov.br']
      expect(isHostAllowed('127.0.0.1', allowed)).toBe(true)
      expect(isHostAllowed('machadosobrinho.paineldoaluno.com.br', allowed)).toBe(true)
      expect(isHostAllowed('paineldoaluno.com.br', allowed)).toBe(true)
      expect(isHostAllowed('diario.seduc.sp.gov.br', allowed)).toBe(true)
      expect(isHostAllowed('atacante.evil.com', allowed)).toBe(false)
      expect(isHostAllowed('qualquer.host.org', ['*'])).toBe(true)
    })
  })

  describe('Fase 0 — Pseudonimização e casamento aluno↔linha no paineldoaluno', () => {
    it('tokeniza nomes iniciados por letras acentuadas e casa variações com/sem acento e caixa alta no mesmo token ALUNO_N', () => {
      const known = [
        { name: '04 - Andréia Gonçalves', identifier: '2026104' },
        { name: 'Ícaro Érico Cauã', identifier: '2026105' },
      ]
      const promptText = [
        'Tarefa: Lance falta para Andreia Goncalves e Icaro Erico Caua.',
        'Elementos da tabela:',
        '[10] input(radio) "F" (04 - ANDRÉIA GONÇALVES | Matr: 2026104)',
        '[11] input(radio) "F" (05 - ÍCARO ÉRICO CAUÃ | Matr: 2026105)',
      ].join('\n')

      const session = Pseudonymizer.pseudonymize(promptText, known)

      // Zero vazamento de nomes reais ou matrículas no texto enviado ao LLM
      expect(session.sanitizedText).not.toMatch(/Andreia|ANDRÉIA|Goncalves|GONÇALVES|Ícaro|ÍCARO|Cauã|CAUÃ|2026104|2026105/i)
      // Tanto o comando sem acento quanto a linha em caixa alta com acento receberam o MESMO token!
      expect(session.sanitizedText).toContain('Lance falta para ALUNO_1 e ALUNO_2.')
      expect(session.sanitizedText).toContain('(04 - ALUNO_1 | Matr: MATRICULA_ALUNO_1)')
      expect(session.sanitizedText).toContain('(05 - ALUNO_2 | Matr: MATRICULA_ALUNO_2)')

      // Reversão determinística em memória
      const llmJson = '{"action":"click","idx":10,"reason":"Marcar falta para ALUNO_1 (MATRICULA_ALUNO_1)"}'
      const restored = Pseudonymizer.depseudonymize(llmJson, session.tokenToOriginal)
      expect(restored).toContain('Andréia Gonçalves (2026104)')
    })

    it('realiza o casamento aluno↔linha localmente antes da tokenização e detecta homônimos', () => {
      const rows = [
        { rowIndex: 0, text: '01 - ANA CLARA SILVA', secondaryText: 'Matr: 1001' },
        { rowIndex: 1, text: '04 - BRUNO TEIXEIRA (Matr: 1004)', secondaryText: 'Matr: 1004' },
        { rowIndex: 2, text: '08 - JOÃO PEDRO SANTOS', secondaryText: 'Matr: 1008' },
        { rowIndex: 3, text: '09 - JOAO PEDRO SANTOS', secondaryText: 'Matr: 1009' },
      ]

      const matchBruno = Pseudonymizer.matchStudentToRowLocally('Bruno Teixeira', rows)
      expect(matchBruno.ambiguous).toBe(false)
      expect(matchBruno.matchedRowIndex).toBe(1)
      expect(matchBruno.canonicalRowText).toBe('BRUNO TEIXEIRA')

      const matchHomonym = Pseudonymizer.matchStudentToRowLocally('João Pedro Santos', rows)
      expect(matchHomonym.ambiguous).toBe(true)
      expect(matchHomonym.candidates).toEqual([2, 3])

      const matchDisambiguated = Pseudonymizer.matchStudentToRowLocally('João Pedro Santos', rows, '1009')
      expect(matchDisambiguated.ambiguous).toBe(false)
      expect(matchDisambiguated.matchedRowIndex).toBe(3)
    })

    it('DomDriver.locateRow encontra a linha certa mesmo quando a célula tem prefixo de chamada ("04 - Bruno Teixeira")', async () => {
      document.body.innerHTML = `
        <table id="diario">
          <thead>
            <tr><th>Aluno</th><th>Presença</th></tr>
          </thead>
          <tbody>
            <tr><td>01 - ANA LIMA</td><td><input type="checkbox" checked /></td></tr>
            <tr><td>04 - BRUNO TEIXEIRA (Matr: 204)</td><td><input type="checkbox" checked /></td></tr>
          </tbody>
        </table>
      `
      const driver = new DomDriver(document, ['localhost', ''])
      const res = await driver.locateRow({
        table: {
          candidates: [{ strategy: 'css', selector: '#diario' }],
          description: 'Tabela de chamada',
          expect_count: 'one',
        },
        key: {
          column_labels: ['Aluno'],
          equals: 'Bruno Teixeira',
          match: 'normalized',
        },
      })
      expect(res.ambiguous).toBe(false)
      expect(res.matchedIndex).toBe(1)
      expect(res.rowHandleId).toBeDefined()
    })

    it('createLlmPlanner e createLlmVerifier aplicam pseudonimização transparente quando ativada', async () => {
      const seenPrompts: string[] = []
      const fakeComplete = async (_sys: string, user: string) => {
        seenPrompts.push(user)
        if (user.includes('Afirmação do agente:')) {
          return '{"achieved":true,"reason":"Falta confirmada para ALUNO_1"}'
        }
        return '{"action":"click","idx":0,"reason":"Marcar falta na linha de ALUNO_1"}'
      }

      const knownStudents = [{ name: 'Bruno Teixeira', identifier: '9988' }]
      const planner = createLlmPlanner(fakeComplete, { pseudonymize: true, knownStudents })
      const verifier = createLlmVerifier(fakeComplete, { pseudonymize: true, knownStudents })

      const obs: Observation = {
        url: 'https://machadosobrinho.paineldoaluno.com.br/frequencia',
        stateHash: 'h',
        elements: [
          {
            idx: 0,
            tag: 'input',
            type: 'radio',
            label: 'F',
            context: '04 - BRUNO TEIXEIRA',
            destructive: false,
          },
        ],
      }

      const plan = (await planner({
        task: 'Lance falta para Bruno Teixeira',
        observation: obs,
        history: [],
      })) as any

      expect(seenPrompts[0]).not.toMatch(/Bruno Teixeira/i)
      expect(seenPrompts[0]).toContain('ALUNO_1')
      expect(plan.reason).toContain('Bruno Teixeira')

      const verdict = await verifier({
        task: 'Lance falta para Bruno Teixeira',
        observation: obs,
        history: [],
        claim: 'Falta lançada para Bruno Teixeira',
      })
      expect(seenPrompts[1]).not.toMatch(/Bruno Teixeira/i)
      expect(verdict.achieved).toBe(true)
      expect(verdict.reason).toContain('Bruno Teixeira')
    })
  })
})
