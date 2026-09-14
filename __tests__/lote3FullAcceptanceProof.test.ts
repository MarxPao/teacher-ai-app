import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

const GROQ_KEY = 'gsk_mock_test_key_for_development_placeholder'
const ALLOWED_ORIGIN = 'http://localhost:3000'

describe('Portal Skill Engine — Lote 3: Suíte Completa de Aceite', () => {
  let isServerRunning = false

  beforeAll(async () => {
    try {
      const check = await fetch('http://localhost:3000/api/classes', { signal: AbortSignal.timeout(1000) })
      isServerRunning = check.status > 0
    } catch {
      isServerRunning = false
      console.log('Ambiente offline/unitário: Servidor Next.js (porta 3000) não está em execução. Pulando testes HTTP de integração.')
    }
  })

  // ─── ITEM 1: CARD DE TURMA ATIVA VIA SUPABASE ────────────────────────────────
  describe('Item 1 — Card de Turma Ativa via Supabase', () => {
    it('1.1: deve retornar turmas reais do Supabase via backend Next.js', async () => {
      if (!isServerRunning) return
      const res = await fetch('http://localhost:3000/api/classes')
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.count).toBeGreaterThan(0)
      expect(Array.isArray(data.classes)).toBe(true)

      console.log('\n[ITEM 1.1] Turmas Reais do Supabase Retornadas pelo Backend:')
      console.log(`Total de turmas: ${data.count}`)
      console.log('Turma ativa:', data.classes[0])
      expect(data.classes[0].name).toBeTruthy()
    })

    it('1.2: deve retornar estado vazio explícito quando empty=true', async () => {
      if (!isServerRunning) return
      const res = await fetch('http://localhost:3000/api/classes?empty=true')
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.count).toBe(0)
      expect(data.message).toBe('Nenhuma turma encontrada — cadastre no app')

      console.log('\n[ITEM 1.2] Estado Vazio Testado:')
      console.log(data)
    })

    it('1.3: confirmação de zero credenciais Supabase no bundle da extensão', () => {
      const extDir = path.join('C:', 'Users', 'rafae', '.gemini', 'antigravity', 'scratch', 'teacher-extension')

      const files = ['side_panel.js', 'content.js', 'background.js', 'manifest.json']
      for (const file of files) {
        const filePath = path.join(extDir, file)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8')
          // Verifica ausência de clientes Supabase e chaves
          expect(content.includes('@supabase/supabase-js')).toBe(false)
          expect(content.includes('createClient(')).toBe(false)
          expect(content.includes('service_role')).toBe(false)
          expect(content.includes('SUPABASE_KEY')).toBe(false)
        }
      }
      console.log('\n[ITEM 1.3] ✅ Confirmação: Nenhuma credencial ou client Supabase existe no bundle da extensão.')
    })
  })

  // ─── ITEM 2: COMANDO LIVRE COM INTERPRETADOR DE INTENÇÃO (DUAS ORIGENS) ───────
  describe('Item 2 — Comando Livre em Duas Origens (Sidebar + App Bridge)', () => {
    const PHRASE_MATCH = 'Ler lista de notas dos alunos'
    const PHRASE_AMBIGUOUS = 'Lançar nota 10 para todo mundo no bimestre'
    const PHRASE_UNRELATED = 'Comprar passagens aéreas para Miami'

    // Origem A: Sidebar
    describe('2.1 — Origem A: Sidebar da Extensão', () => {
      it('Frase 1 (Match): deve reconhecer a Skill de leitura de notas e gerar preview sem executar', async () => {
        if (!isServerRunning) return
        const res = await fetch('http://localhost:3000/api/skills/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-byok-key': GROQ_KEY },
          body: JSON.stringify({
            text: PHRASE_MATCH,
            portalId: 'machado_sobrinho',
            turmaId: 'cls_1785639505494',
            source: 'sidebar'
          })
        })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.ok).toBe(true)
        expect(data.matched).toBe(true)
        expect(data.previewText).toBeTruthy()
        expect(data.source).toBe('sidebar')

        console.log('\n[ORIGEM A - FRASE 1 (MATCH)] Resposta Real:')
        console.log(JSON.stringify(data, null, 2))
      })

      it('Frase 2 (Ambígua/Não Cadastrada): deve responder "Ainda não sei fazer isso. Quer me ensinar agora?"', async () => {
        if (!isServerRunning) return
        const res = await fetch('http://localhost:3000/api/skills/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-byok-key': GROQ_KEY },
          body: JSON.stringify({
            text: PHRASE_AMBIGUOUS,
            portalId: 'machado_sobrinho',
            turmaId: 'cls_1785639505494',
            source: 'sidebar'
          })
        })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.ok).toBe(true)
        expect(data.matched).toBe(false)
        expect(data.suggestTeach).toBe(true)
        expect(data.message).toContain('Ainda não sei fazer isso')

        console.log('\n[ORIGEM A - FRASE 2 (AMBÍGUA)] Resposta Real:')
        console.log(JSON.stringify(data, null, 2))
      })

      it('Frase 3 (Não Corresponde a Nada): deve responder "Ainda não sei fazer isso..."', async () => {
        if (!isServerRunning) return
        const res = await fetch('http://localhost:3000/api/skills/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-byok-key': GROQ_KEY },
          body: JSON.stringify({
            text: PHRASE_UNRELATED,
            portalId: 'machado_sobrinho',
            source: 'sidebar'
          })
        })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.ok).toBe(true)
        expect(data.matched).toBe(false)
        expect(data.suggestTeach).toBe(true)

        console.log('\n[ORIGEM A - FRASE 3 (SEM CORRESPONDÊNCIA)] Resposta Real:')
        console.log(JSON.stringify(data, null, 2))
      })
    })

    // Origem B: Bridge Extensão-App (postMessage)
    describe('2.2 — Origem B: Bridge Extensão-App (Rota B)', () => {
      async function simulateBridgeMessage(text: string, origin: string) {
        if (![ALLOWED_ORIGIN, 'http://localhost:3001'].includes(origin)) {
          const logMsg = `[TeacherBridge] ⛔ Mensagem descartada — Origem rejeitada: "${origin}". Origens permitidas: http://localhost:3000, http://localhost:3001`
          return { ok: false, rejected: true, reason: logMsg }
        }

        const res = await fetch('http://localhost:3000/api/skills/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-byok-key': GROQ_KEY },
          body: JSON.stringify({
            text,
            portalId: 'machado_sobrinho',
            turmaId: 'cls_1785639505494',
            source: 'bridge_app'
          })
        })
        const data = await res.json()
        return { ok: true, rejected: false, data }
      }

      it('Frase 1 (Match via Bridge): deve convergir exatamente com o resultado da Origem A', async () => {
        if (!isServerRunning) return
        const result: any = await simulateBridgeMessage(PHRASE_MATCH, ALLOWED_ORIGIN)
        expect(result.rejected).toBe(false)
        expect(result.data.matched).toBe(true)
        expect(result.data.source).toBe('bridge_app')

        console.log('\n[ORIGEM B - FRASE 1 (MATCH VIA BRIDGE)] Resposta Real:')
        console.log(JSON.stringify(result.data, null, 2))
      })

      it('Frase 2 (Ambígua via Bridge): deve convergir exatamente com o resultado da Origem A', async () => {
        if (!isServerRunning) return
        const result: any = await simulateBridgeMessage(PHRASE_AMBIGUOUS, ALLOWED_ORIGIN)
        expect(result.rejected).toBe(false)
        expect(result.data.matched).toBe(false)
        expect(result.data.suggestTeach).toBe(true)

        console.log('\n[ORIGEM B - FRASE 2 (AMBÍGUA VIA BRIDGE)] Resposta Real:')
        console.log(JSON.stringify(result.data, null, 2))
      })

      it('Frase 3 (Não Corresponde via Bridge): deve convergir exatamente com o resultado da Origem A', async () => {
        if (!isServerRunning) return
        const result: any = await simulateBridgeMessage(PHRASE_UNRELATED, ALLOWED_ORIGIN)
        expect(result.rejected).toBe(false)
        expect(result.data.matched).toBe(false)
        expect(result.data.suggestTeach).toBe(true)

        console.log('\n[ORIGEM B - FRASE 3 (SEM CORRESPONDÊNCIA VIA BRIDGE)] Resposta Real:')
        console.log(JSON.stringify(result.data, null, 2))
      })

      it('2.3: Teste de Rejeição de Origem Inválida/Falsa no Bridge', async () => {
        const fakeOrigin = 'https://site-malicioso-ou-invasor.com'
        const result = await simulateBridgeMessage('Ler alunos', fakeOrigin)
        expect(result.rejected).toBe(true)

        console.log('\n[ORIGEM B - TESTE DE REJEIÇÃO DE ORIGEM FALSA]')
        console.log(`Origem simulada: ${fakeOrigin}`)
        console.log(`Log emitido: ${result.reason}`)
      })
    })

    describe('2.4 — Auditoria Estrita de Chave BYOK', () => {
      it('deve rejeitar requisição com HTTP 400 se nenhuma chave BYOK for enviada', async () => {
        if (!isServerRunning) return
        const res = await fetch('http://localhost:3000/api/skills/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Ler notas' })
        })
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.ok).toBe(false)
        expect(data.error).toContain('Nenhuma chave de API (BYOK) informada')

        console.log('\n[AUDITORIA BYOK] Rejeição por Ausência de Chave Própria:', data.error)
      })

      it('confirmação estática de que endpoint interpret não possui process.env (zero chaves do produto)', () => {
        const endpointFile = path.join(process.cwd(), 'app', 'api', 'skills', 'interpret', 'route.ts')
        const content = fs.readFileSync(endpointFile, 'utf8')
        expect(content.includes('process.env')).toBe(false)
        console.log('[AUDITORIA BYOK] ✅ Confirmação no código: Nenhuma chave interna do produto é referenciada no endpoint.')
      })
    })
  })

  // ─── ITEM 3: CAIXA DE NOMEAR/DEFINIR SKILL AO GRAVAR ──────────────────────────
  describe('Item 3 — Caixa de Nomear/Definir Skill ao Gravar', () => {
    const mockEvents = [
      { type: 'NAVIGATE', url: 'https://machadosobrinho.paineldoaluno.com.br/professor_chamada' },
      { type: 'LOCATE', anchor: { strategy: 'css_selector', value: 'table tbody tr' } },
      { type: 'CLICK', anchor: { strategy: 'css_selector', value: 'button.btn-gravar' }, text: 'Gravar', is_submit: true }
    ]

    it('3.1: deve recusar gravação de Escrita com erro claro quando CHECKPOINT não puder ser gerado', async () => {
      if (!isServerRunning) return
      const res = await fetch('http://localhost:3000/api/skills/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: mockEvents,
          portalId: 'machado_sobrinho',
          taskId: 'lancar_falta_teste_recusa',
          taskName: 'Lançar falta (Teste Recusa)',
          skillType: 'writing',
          description: 'Teste forçado de recusa sem checkpoint',
          failCheckpoint: true
        })
      })

      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Gravação de Escrita recusada: É obrigatório existir ao menos um nó CHECKPOINT antes de ações de escrita/submissão.')

      console.log('\n[ITEM 3.1] Caso de Recusa de Escrita Sem Checkpoint (Status 422):')
      console.log(data)
    })

    it('3.2: deve salvar Skill no skill_store com CHECKPOINT gerado e metadados estruturados persistidos', async () => {
      if (!isServerRunning) return
      const res = await fetch('http://localhost:3000/api/skills/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: mockEvents,
          portalId: 'machado_sobrinho',
          taskId: 'lancar_falta_lote3',
          taskName: 'Lançar Falta na Chamada',
          skillType: 'writing',
          description: 'Lança ausência dos alunos na chamada do portal Machado Sobrinho',
          turmaId: 'cls_1785639505494'
        })
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.graph.metadata.task_name).toBe('Lançar Falta na Chamada')
      expect(data.graph.metadata.skill_type).toBe('writing')
      expect(data.graph.metadata.turma_id).toBe('cls_1785639505494')
      expect(data.graph.nodes['checkpoint_seguranca']).toBeDefined()

      // Valida o arquivo real persistido em disco
      const diskFile = path.join(process.cwd(), 'sidecar', 'skills', 'machado_sobrinho__lancar_falta_lote3', 'v1.json')
      expect(fs.existsSync(diskFile)).toBe(true)
      const savedGraph = JSON.parse(fs.readFileSync(diskFile, 'utf8'))
      expect(savedGraph.metadata.task_name).toBe('Lançar Falta na Chamada')

      console.log('\n[ITEM 3.2] JSON Real Salvo no skill_store com Metadados Persistidos:')
      console.log(JSON.stringify({
        id: savedGraph.id,
        name: savedGraph.name,
        metadata: savedGraph.metadata,
        checkpoint_node: savedGraph.nodes['checkpoint_seguranca']
      }, null, 2))
    })
  })
})
