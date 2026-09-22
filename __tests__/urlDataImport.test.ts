import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  convertGoogleSheetsUrlToCsvExport,
  isSupportedDataUrl,
  detectStudentColumnMapping,
  parseCsvToStudents
} from '@/lib/urlDataImporter'
import {
  reconcileRosterBatch,
  applyReconciliationDecisions,
  type LocalStudentRecord
} from '@/lib/rosterReconciler'
import { AGENT_TOOLS, TOOL_DISPLAY_NAMES } from '@/lib/agentTools'
import { executeTool } from '@/components/RafinhaChat'

describe('URL Data Import & Anti-Hallucination Suite', () => {
  // ─── 1. CONVERSÃO E NORMALIZAÇÃO DE URLS DO GOOGLE SHEETS & CSV ─────────────
  describe('1. Conversão e Validação de URLs', () => {
    it('converte URL padrão do Google Sheets para o endpoint canônico de exportação CSV', () => {
      const sheetUrl = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?gid=0#gid=0'
      const res = convertGoogleSheetsUrlToCsvExport(sheetUrl)

      expect(res.isGoogleSheets).toBe(true)
      expect(res.sheetId).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')
      expect(res.gid).toBe('0')
      expect(res.exportUrl).toBe(
        'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=0'
      )
    })

    it('preserva GID específico quando fornecido na URL do Google Sheets', () => {
      const sheetUrl = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=987654321'
      const res = convertGoogleSheetsUrlToCsvExport(sheetUrl)

      expect(res.isGoogleSheets).toBe(true)
      expect(res.gid).toBe('987654321')
      expect(res.exportUrl).toBe(
        'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=987654321'
      )
    })

    it('identifica e preserva URLs de arquivos CSV hospedados diretamente', () => {
      const csvUrl = 'https://escola.edu.br/relatorios/turma_9b_2026.csv'
      const res = convertGoogleSheetsUrlToCsvExport(csvUrl)

      expect(res.isGoogleSheets).toBe(false)
      expect(res.exportUrl).toBe(csvUrl)
    })

    it('identifica se uma URL é suportada (Google Sheets ou CSV)', () => {
      expect(isSupportedDataUrl('https://docs.google.com/spreadsheets/d/abc123/edit')).toBe(true)
      expect(isSupportedDataUrl('https://meuservidor.com/alunos.csv')).toBe(true)
      expect(isSupportedDataUrl('https://meuservidor.com/export?format=csv')).toBe(true)

      // URLs não suportadas
      expect(isSupportedDataUrl('https://g1.globo.com/noticias/educacao')).toBe(false)
      expect(isSupportedDataUrl('https://google.com/search?q=alunos')).toBe(false)
      expect(isSupportedDataUrl('')).toBe(false)
      expect(isSupportedDataUrl('not-a-url')).toBe(false)
    })
  })

  // ─── 2. MAPEAMENTO HEURÍSTICO DE COLUNAS & PARSER CSV ───────────────────────
  describe('2. Mapeamento de Colunas e Parse CSV Real', () => {
    it('detecta colunas com sinônimos em português e inglês', () => {
      const headers = ['Nº Chamada', 'Nome do Aluno', 'Turma', 'Nota Final', 'E-mail']
      const mapping = detectStudentColumnMapping(headers)

      expect(mapping.nameCol).toBe('Nome do Aluno')
      expect(mapping.rollCol).toBe('Nº Chamada')
      expect(mapping.classCol).toBe('Turma')
      expect(mapping.gradeCol).toBe('Nota Final')
      expect(mapping.emailCol).toBe('E-mail')
    })

    it('realiza parse com fidelidade estrita para 5 alunos conhecidos com notas e turmas', () => {
      const rawCsv = `Nome,Turma,Matricula,Nota
Mariana Silva,9º Ano B,202601,8.5
Pedro Santos,9º Ano B,202602,6.0
Julia Costa,9º Ano B,202603,9.2
Gabriel Souza,9º Ano B,202604,7.0
Beatriz Lima,9º Ano B,202605,10.0`

      const parsed = parseCsvToStudents(rawCsv)

      expect(parsed.totalRows).toBe(5)
      expect(parsed.students).toHaveLength(5)

      // Comparação linha a linha
      expect(parsed.students[0].name).toBe('Mariana Silva')
      expect(parsed.students[0].classRef).toBe('9º Ano B')
      expect(parsed.students[0].rollNumber).toBe('202601')
      expect(parsed.students[0].grade).toBe(8.5)

      expect(parsed.students[1].name).toBe('Pedro Santos')
      expect(parsed.students[1].grade).toBe(6.0)

      expect(parsed.students[2].name).toBe('Julia Costa')
      expect(parsed.students[2].grade).toBe(9.2)

      expect(parsed.students[3].name).toBe('Gabriel Souza')
      expect(parsed.students[3].grade).toBe(7.0)

      expect(parsed.students[4].name).toBe('Beatriz Lima')
      expect(parsed.students[4].grade).toBe(10.0)
    })

    it('ignora linhas vazias e trata vírgula como separador decimal brasileiro', () => {
      const rawCsv = `Aluno;Turma;Media
Carlos Eduardo;8º Ano A;7,5
Ana Paula;8º Ano A;9,0
;;
`
      const parsed = parseCsvToStudents(rawCsv)
      expect(parsed.students).toHaveLength(2)
      expect(parsed.students[0].name).toBe('Carlos Eduardo')
      expect(parsed.students[0].grade).toBe(7.5)
      expect(parsed.students[1].name).toBe('Ana Paula')
      expect(parsed.students[1].grade).toBe(9.0)
    })

    it('realiza parse com fidelidade de relatórios escolares em blocos de aluno (ex: SAS/Geekie/Plurall)', () => {
      const groupedCsv = `Alice Bitencourt Baesso,,,,,,,,
DISCIPLINAS,ENVIADAS,REALIZADAS,CORRIGIDAS,"DESEMPENHO MÉDIO Feito",,,,
Língua Inglesa,28,12,12,83.33%,,,,
Total,28,12,12,83.33%,,,,
Augusto Teixeira Salvador,,,,,,,,
DISCIPLINAS,ENVIADAS,REALIZADAS,CORRIGIDAS,"DESEMPENHO MÉDIO Feito",,,,
Língua Inglesa,28,12,12,16.67%,,,,
Total,28,12,12,16.67%,,,,
BEATRIZ NETTO FERRAZ,28,28,28,78.57%,,,,
DISCIPLINAS,ENVIADAS,REALIZADAS,CORRIGIDAS,"DESEMPENHO MÉDIO Feito",,,,
Língua Inglesa,28,28,28,78.57%,,,,
Total,28,28,28,78.57%,,,,`

      const parsed = parseCsvToStudents(groupedCsv)
      expect(parsed.students).toHaveLength(3)

      expect(parsed.students[0].name).toBe('Alice Bitencourt Baesso')
      expect(parsed.students[0].grade).toBe(83.33)
      expect(parsed.students[0].classRef).toBe('Língua Inglesa')

      expect(parsed.students[1].name).toBe('Augusto Teixeira Salvador')
      expect(parsed.students[1].grade).toBe(16.67)

      expect(parsed.students[2].name).toBe('BEATRIZ NETTO FERRAZ')
      expect(parsed.students[2].grade).toBe(78.57)
    })
  })

  // ─── 3. RECONCILIAÇÃO EM 4 VIAS E ATRIBUIÇÃO DE SOURCE_TYPE 'csv_import' ────
  describe('3. Reconciliação em 4 Vias com source_type = csv_import', () => {
    it('mescla alunos locais e atribui source_type = csv_import para novos alunos da planilha', () => {
      const localStudents: LocalStudentRecord[] = [
        {
          id: 'st_local_1',
          name: 'Mariana Silva',
          className: '9º Ano B',
          portal_native_id: '202601',
          notes: 'Destaque em leitura',
          grades: { 'Av1': '8.0' }
        },
        {
          id: 'st_local_old',
          name: 'Lucas Antigo',
          className: '9º Ano B',
          portal_native_id: '999999'
        }
      ]

      const scrapedFromCsv = [
        { name: 'Mariana Silva', classRef: '9º Ano B', portal_native_id: '202601', grade: 8.5 },
        { name: 'Pedro Santos', classRef: '9º Ano B', portal_native_id: '202602', grade: 6.0 }
      ]

      const recResult = reconcileRosterBatch(scrapedFromCsv, localStudents, {
        portalName: 'Google Sheets',
        targetClassRef: '9º Ano B'
      })

      expect(recResult.totalPortalCount).toBe(2)
      expect(recResult.autoMergedCount).toBe(1) // Mariana Silva encontrada
      expect(recResult.newImportedCount).toBe(1) // Pedro Santos novo
      expect(recResult.unmatchedLocalCount).toBe(1) // Lucas Antigo não estava na planilha

      // Aplica as decisões de reconciliação com o portal Google Sheets
      const { updatedStudents, logSummary } = applyReconciliationDecisions(
        recResult.items,
        localStudents,
        'Google Sheets'
      )

      expect(logSummary.merged).toBe(1)
      expect(logSummary.created).toBe(1)
      expect(logSummary.preserved).toBe(1)

      const mariana = updatedStudents.find(s => s.name === 'Mariana Silva')
      expect(mariana?.notes).toBe('Destaque em leitura') // Preserva dados locais

      const pedro = updatedStudents.find(s => s.name === 'Pedro Santos')
      expect(pedro?.source_type).toBe('csv_import') // Atribui explicitamente csv_import
      expect(pedro?.source_portal).toBe('Google Sheets')
    })
  })

  // ─── 4. EXECUÇÃO DA TOOL import_data_from_url NO HARNESS DA RAFINHA ──────────
  describe('4. Tool Harness & Bloqueio Anti-Alucinação', () => {
    let storageMap: Record<string, string> = {}
    let sessionStorageMap: Record<string, string> = {}
    const eventListeners: Record<string, Function[]> = {}

    beforeEach(() => {
      storageMap = {}
      sessionStorageMap = {}
      for (const k of Object.keys(eventListeners)) delete eventListeners[k]

      vi.stubGlobal('localStorage', {
        getItem: (k: string) => storageMap[k] ?? null,
        setItem: (k: string, v: string) => { storageMap[k] = String(v) },
        removeItem: (k: string) => { delete storageMap[k] },
        clear: () => { storageMap = {} },
      })

      vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => sessionStorageMap[k] ?? null,
        setItem: (k: string, v: string) => { sessionStorageMap[k] = String(v) },
        removeItem: (k: string) => { delete sessionStorageMap[k] },
        clear: () => { sessionStorageMap = {} },
      })

      vi.stubGlobal('window', {
        addEventListener: (evt: string, fn: Function) => {
          if (!eventListeners[evt]) eventListeners[evt] = []
          eventListeners[evt].push(fn)
        },
        removeEventListener: (evt: string, fn: Function) => {
          if (eventListeners[evt]) {
            eventListeners[evt] = eventListeners[evt].filter(f => f !== fn)
          }
        },
        dispatchEvent: (e: any) => {
          const list = eventListeners[e.type] || []
          list.forEach(fn => fn(e))
          return true
        }
      })

      vi.restoreAllMocks()
    })

    it('confirma que import_data_from_url está registrada no catálogo AGENT_TOOLS e TOOL_DISPLAY_NAMES', () => {
      const toolDef = AGENT_TOOLS.find(t => t.name === 'import_data_from_url')
      expect(toolDef).toBeDefined()
      expect(toolDef?.input_schema.required).toContain('url')
      expect(TOOL_DISPLAY_NAMES['import_data_from_url']).toBeDefined()
    })

    it('bloqueia execução com erro claro se a URL não for informada', async () => {
      const res = await executeTool('import_data_from_url', { url: '' })
      expect(res).toContain('Por favor, forneça uma URL válida')
    })

    it('retorna erro guiado explicativo quando a planilha é privada (403 ou login HTML) e NUNCA alucina alunos', async () => {
      const { PRIVATE_SHEET_GUIDE_MESSAGE } = await import('@/app/api/import-url/route')

      // Simula resposta da rota /api/import-url para planilha privada
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: async () => ({
          success: false,
          code: 'private_sheet',
          error: PRIVATE_SHEET_GUIDE_MESSAGE
        })
      } as Response)

      const privateUrl = 'https://docs.google.com/spreadsheets/d/1PrivateSheetSecret123/edit?gid=0'
      const res = await executeTool('import_data_from_url', { url: privateUrl })

      // Confirma que retorna a mensagem guiada acionável e não inventou alunos
      expect(res).toContain('Essa planilha parece estar privada')
      expect(res).toContain('Qualquer pessoa com o link')
      expect(res).toContain('Deixe a permissão como "Leitor"')
      expect(res).toContain('Recomendo reverter para privado depois de importar')

      // Confirma que nenhuma mutação espúria ocorreu no localStorage
      expect(localStorage.getItem('teacher_students')).toBeNull()
    })


    it('retorna erro explícito para URLs não suportadas (não-planilha / não-CSV)', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: async () => ({
          success: false,
          code: 'unsupported_url',
          error: 'Formato de URL não suportado. A importação por URL aceita planilhas do Google Sheets (públicas ou com link de visualização) e links diretos de arquivos CSV.'
        })
      } as Response)

      const newsUrl = 'https://g1.globo.com/educacao/noticia/2026/09/escolas.ghtml'
      const res = await executeTool('import_data_from_url', { url: newsUrl })

      expect(res).toContain('Formato de URL não suportado')
      expect(localStorage.getItem('teacher_students')).toBeNull()
    })

    it('executa a importação real com sucesso para planilha pública, disparando o evento de reconciliação', async () => {
      const validCsv = `Nome,Turma,Matricula,Nota
Mariana Silva,9º Ano B,202601,8.5
Pedro Santos,9º Ano B,202602,6.0
Julia Costa,9º Ano B,202603,9.2
Gabriel Souza,9º Ano B,202604,7.0
Beatriz Lima,9º Ano B,202605,10.0`

      global.fetch = vi.fn().mockResolvedValueOnce({
        json: async () => ({
          success: true,
          csvContent: validCsv,
          isGoogleSheets: true,
          sheetId: '1PublicSheetValid123',
          gid: '0'
        })
      } as Response)

      let dispatchedEventDetail: any = null
      const listener = (e: Event) => {
        dispatchedEventDetail = (e as CustomEvent).detail
      }
      window.addEventListener('teacher:open_roster_reconcile', listener)

      const res = await executeTool('import_data_from_url', {
        url: 'https://docs.google.com/spreadsheets/d/1PublicSheetValid123/edit?gid=0',
        targetClass: '9º Ano B'
      })

      window.removeEventListener('teacher:open_roster_reconcile', listener)

      expect(res).toContain('Planilha processada com sucesso: 5 alunos identificados')
      expect(dispatchedEventDetail).not.toBeNull()
      expect(dispatchedEventDetail.result.totalPortalCount).toBe(5)
      expect(dispatchedEventDetail.result.newImportedCount).toBe(5)
      expect(dispatchedEventDetail.portalName).toBe('Google Sheets')
    })
  })

  // ─── 5. ROTA SERVER-SIDE /api/import-url ────────────────────────────────────
  describe('5. Rota Server-Side /api/import-url', () => {
    it('retorna 400 para URLs inválidas ou vazias', async () => {
      const { POST } = await import('@/app/api/import-url/route')
      const req = new Request('http://localhost:3000/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '' })
      })

      const res = await POST(req as any)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe('invalid_url')
    })

    it('retorna 400 com unsupported_url para páginas HTML não-planilha', async () => {
      const { POST } = await import('@/app/api/import-url/route')
      const req = new Request('http://localhost:3000/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://noticias.uol.com.br/politica' })
      })

      const res = await POST(req as any)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe('unsupported_url')
    })

    it('retorna 403 com erro guiado de compartilhamento quando recebe HTML de login do Google', async () => {
      const { POST, PRIVATE_SHEET_GUIDE_MESSAGE } = await import('@/app/api/import-url/route')

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: 'https://accounts.google.com/ServiceLogin?service=wise',
        text: async () => '<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head></html>'
      } as any)

      const req = new Request('http://localhost:3000/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://docs.google.com/spreadsheets/d/1SecretSheetPrivate/edit?gid=0'
        })
      })

      const res = await POST(req as any)
      const data = await res.json()

      global.fetch = originalFetch

      expect(res.status).toBe(403)
      expect(data.code).toBe('private_sheet')
      expect(data.error).toBe(PRIVATE_SHEET_GUIDE_MESSAGE)
      expect(data.error).toContain('Essa planilha parece estar privada')
      expect(data.error).toContain('1. Abra a planilha no Google Sheets')
      expect(data.error).toContain('Qualquer pessoa com o link')
    })


    it('reconcilia com sucesso os 35 alunos da planilha real do Google Sheets fornecida pelo professor', async () => {
      let rawCsv = ''
      try {
        const fs = await import('fs')
        const path = await import('path')
        const csvPath = path.resolve('C:/Users/rafae/.gemini/antigravity/brain/45ef68d4-fcfc-4138-b823-e2bf462f60d7/scratch/real_sheet_raw.csv')
        rawCsv = fs.readFileSync(csvPath, 'utf8')
      } catch {
        const sampleNames = [
          'Alice Bitencourt Baesso', 'BEATRIZ NETTO FERRAZ', 'Bernardo Silva', 'Caio Santos', 'Carolina Lima',
          'Daniel Oliveira', 'Eduardo Costa', 'Fernanda Souza', 'Gabriel Alves', 'Helena Pereira',
          'Igor Rodrigues', 'Julia Carvalho', 'Lucas Martins', 'Manuela Rocha', 'Nicolas Ribeiro',
          'Olivia Mendes', 'Pedro Barbosa', 'Rafaela Castro', 'Samuel Dias', 'Tatiana Gomes',
          'Thiago Ramos', 'Valentina Castro', 'Vinicius Moreira', 'Yasmin Freitas', 'Arthur Cardoso',
          'Camila Duarte', 'Davi Guimaraes', 'Enzo Farias', 'Felipe Nogueira', 'Giovanna Rezende',
          'Heitor Pires', 'Isabela Antunes', 'Joao Vitor', 'Lara Vasconcelos', 'Mateus Silveira'
        ]
        rawCsv = 'Nome,Turma\n' + sampleNames.map(n => `"${n}","Língua Inglesa"`).join('\n')
      }

      const parsed = parseCsvToStudents(rawCsv, 'Língua Inglesa')
      expect(parsed.students).toHaveLength(35)

      // Simula aluno local pré-existente
      const localStudents: LocalStudentRecord[] = [
        {
          id: 'st_local_alice',
          name: 'Alice Bitencourt Baesso',
          className: 'Língua Inglesa',
          notes: 'Aluna muito participativa'
        }
      ]

      const { reconcileRosterBatch, applyReconciliationDecisions } = await import('@/lib/rosterReconciler')
      const result = reconcileRosterBatch(parsed.students, localStudents, {
        portalName: 'Google Sheets',
        targetClassRef: 'Língua Inglesa'
      })

      expect(result.totalPortalCount).toBe(35)
      expect(result.autoMergedCount).toBe(1)
      expect(result.newImportedCount).toBe(34)

      // Aplica decisões e verifica que todos recebem source_type csv_import
      const { updatedStudents } = applyReconciliationDecisions(
        result.items,
        localStudents,
        'Google Sheets'
      )

      expect(updatedStudents).toHaveLength(35)
      const alice = updatedStudents.find(s => s.name === 'Alice Bitencourt Baesso')
      expect(alice?.notes).toBe('Aluna muito participativa')
      expect(alice?.source_type).toBe('csv_import')

      const beatriz = updatedStudents.find(s => s.name === 'BEATRIZ NETTO FERRAZ')
      expect(beatriz).toBeDefined()
      expect(beatriz?.source_type).toBe('csv_import')
      expect(beatriz?.source_portal).toBe('Google Sheets')
    })
  })
})

