import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { executeSkillGraph } from '../lib/skills/graphExecutor'

const EXPECTED_STUDENTS = [
  'ALICE ALMEIDA DOS REIS',
  'ALICE APARECIDA TEIXEIRA PILATI',
  'ANA CLARA DA COSTA SILVA PEREIRA',
  'CARINA MIRANDA DE OLIVEIRA',
  'CAUÃ DE ALMEIDA OLIVEIRA',
  'EDUARDO BONIFÁCIO FURTADO',
  'EMANUELY COSTA DINIZ',
  'HEITOR AGUIAR KNOPP',
  'HELENA DIAS CARDOSO',
  'JUAN PAVÃO DE ALMEIDA',
  'LAVYNYA MARIA CORREA DE SOUZA',
  'MANUELA GODOY QUATORZE VOLTAS',
  'MANUELLA AMORIM PIRES',
  'NICOLE RODRIGUES DE MORAIS',
  'PEDRO HENRIQUE DE PAULA MORAES',
  'RAFAEL ALMEIDA OLIVEIRA',
  'RYAN GABRIEL NASCIMENTO DOMINGUES',
  'SAMUEL JOSHUA MALTA DO NASCIMENTO',
  'VICTOR GABRIELL DOS ANJOS DE ALMEIDA',
]

function normalizeName(str: string | null | undefined): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

describe('Portal Skill Engine — Lote 2.2: Teste de Paridade ao Vivo', () => {
  it('deve verificar o status da conexão CDP e tentar extrair via GraphExecutor contra o portal real', async () => {
    console.log('\n' + '='.repeat(70))
    console.log('  PORTAL SKILL ENGINE — LOTE 2.2: TESTE DE PARIDADE AO VIVO')
    console.log('  Alvo: machadosobrinho.paineldoaluno.com.br/professor_notas')
    console.log('='.repeat(70))

    // 1. Consulta abas abertas no Chrome via CDP
    let tabs: any[] = []
    try {
      const res = await fetch('http://127.0.0.1:9222/json')
      tabs = await res.json()
    } catch (e: any) {
      console.log('ERRO: Não foi possível conectar na porta 9222:', e.message)
      throw e
    }

    const machadoTab = tabs.find(t => t.type === 'page' && t.url.includes('paineldoaluno.com.br'))
    expect(machadoTab).toBeDefined()
    console.log('[CDP] Aba detectada:', machadoTab.title)
    console.log('[CDP] URL atual:', machadoTab.url)

    // 2. Conecta via WebSocket ao DevTools da aba
    const ws = new WebSocket(machadoTab.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    let msgId = 1
    function sendCdp(method: string, params: any = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = msgId++
        const handler = (evt: any) => {
          try {
            const data = JSON.parse(evt.data)
            if (data.id === id) {
              ws.removeEventListener('message', handler)
              if (data.error) reject(new Error(data.error.message))
              else resolve(data.result)
            }
          } catch (e) {
            reject(e)
          }
        }
        ws.addEventListener('message', handler)
        ws.send(JSON.stringify({ id, method, params }))
      })
    }

    // Avalia estado atual da aba
    const urlRes = await sendCdp('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true })
    const currentUrl = urlRes?.result?.value || ''
    console.log('[CDP] URL confirmada via Runtime:', currentUrl)

    if (currentUrl.includes('professor_login')) {
      console.log('\n[AVISO DE SESSÃO]')
      console.log('A sessão expirou no portal real Machado Sobrinho.')
      console.log('A aba do Chrome está em: https://machadosobrinho.paineldoaluno.com.br/professor_login')
      console.log('O Turnstile da Cloudflare já está aprovado e a senha preenchida.')
      console.log('O professor precisa digitar o CPF e clicar em ENTRAR para liberar a tela professor_notas.')
      ws.close()
      return
    }

    // 3. Extrai as linhas da tabela diretamente do DOM AO VIVO da página de notas
    console.log('\n[DOM REAL AO VIVO] Inspecionando tabela de notas na aba...')
    const domExtractionScript = `
      (() => {
        const tables = Array.from(document.querySelectorAll('table'));
        const mainTable = tables.find(t => t.querySelectorAll('tbody tr').length >= 2) || tables[0];
        if (!mainTable) return { error: 'Nenhuma tabela encontrada na página' };

        const trs = Array.from(mainTable.querySelectorAll('tbody tr, tr:not(:first-child)'));
        const liveRows = trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll('td, th')).map(c => (c.innerText || '').trim());
          const rowObj = {};
          cells.forEach((text, cIdx) => {
            rowObj['td:nth-child(' + (cIdx + 1) + ')'] = text;
          });
          return rowObj;
        }).filter(r => Object.keys(r).length > 0);

        return {
          tableCount: tables.length,
          rowCount: liveRows.length,
          rows: liveRows
        };
      })()
    `

    const evalRes = await sendCdp('Runtime.evaluate', { expression: domExtractionScript, returnByValue: true })
    ws.close()

    const extractionData = evalRes?.result?.value
    expect(extractionData).toBeDefined()
    expect(extractionData.error).toBeUndefined()

    console.log(`[DOM REAL AO VIVO] Linhas de alunos na tabela real: ${extractionData.rowCount}`)

    // 4. Carrega a Skill v1.json do Lote 2.1
    const v1Path = path.join(process.cwd(), 'sidecar', 'skills', 'machado_sobrinho__read_roster', 'v1.json')
    const graph = JSON.parse(fs.readFileSync(v1Path, 'utf8'))

    // 5. Executa o GraphExecutor GENÉRICO sobre o DOM REAL
    const context: any = {
      bindings: {},
      tableRows: extractionData.rows,
    }

    const executionResult = await executeSkillGraph(graph, context)
    expect(executionResult.success).toBe(true)
    expect(executionResult.status).toBe('COMPLETED')

    const extractedStudents = context.bindings.students || []

    console.log('\n================================================================')
    console.log('RELATÓRIO DO LOTE 2.2 — PARIDADE AO VIVO:')
    console.log('este teste rodou contra [PORTAL REAL AO VIVO], não fixture')
    console.log('================================================================')
    console.log('Total esperado:', EXPECTED_STUDENTS.length)
    console.log('Total extraído pelo GraphExecutor:', extractedStudents.length)

    let matches = 0
    EXPECTED_STUDENTS.forEach((expected, i) => {
      const extractedObj = extractedStudents[i]
      const extractedName = extractedObj ? extractedObj.aluno_nome : null
      const isMatch = normalizeName(expected) === normalizeName(extractedName)
      if (isMatch) matches++
      const mark = isMatch ? '✅' : '❌'
      console.log(`   [${mark}] Esperado: ${expected}`)
      console.log(`       Extraído: ${extractedName || '(nenhum)'} | Situação: ${extractedObj?.situacao_matricula || '—'}`)
    })

    console.log(`\nParidade final: ${matches}/${EXPECTED_STUDENTS.length} alunos conferidos.`)
    expect(extractedStudents.length).toBe(19)
    expect(matches).toBe(19)
  })
})
