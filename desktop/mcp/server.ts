/**
 * desktop/mcp/server.ts -- Gap 9: MCP Server stdio (read-only)
 *
 * Expoe dados educacionais do Teacher AI como servidor MCP via stdio.
 * Ferramentas disponiveis (SOMENTE LEITURA -- sem escrita, sem PII bruto):
 *   - search_items          : busca itens de avaliacao no banco SQLite local
 *   - class_mastery_summary : resumo de dominio por turma/habilidade
 *   - draft_assessment      : gera rascunho de avaliacao parametrizada
 *
 * Protocolo: JSON-RPC 2.0 via stdin/stdout (spec MCP 1.0)
 * Storage: SQLite real via NodeSqliteDriver (Gap 9 corrigido -- antes usava JSON cache)
 *
 * Inicializacao: chamado pelo Electron main process via child_process.spawn()
 * ou diretamente como CLI: `node desktop/mcp/server.js <caminho-do-banco>`
 */

import * as readline from 'node:readline'
import * as path from 'node:path'
import * as os from 'node:os'
import { NodeSqliteDriver } from '../db/nodeSqliteDriver'

// -- Tipos MCP --

interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface McpResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// -- Banco SQLite real --
// O MCP server recebe o caminho do banco como argumento de linha de comando.
// Fallback: ~/.teacher-ai/teacher.db (mesmo padrao do Electron main process)

const DB_PATH = process.argv[2]
  ?? path.join(os.homedir(), '.teacher-ai', 'teacher.db')

let driver: NodeSqliteDriver | null = null

function getDriver(): NodeSqliteDriver {
  if (!driver) {
    driver = new NodeSqliteDriver(DB_PATH)
  }
  return driver
}


// -- Ferramentas MCP --

const TOOLS: McpTool[] = [
  {
    name: 'search_items',
    description: 'Busca itens de avaliacao no banco SQLite local por habilidade BNCC, dificuldade ou tags.',
    inputSchema: {
      type: 'object',
      properties: {
        skill:         { type: 'string',  description: 'Codigo BNCC (ex: EF06LI01) -- opcional' },
        minDifficulty: { type: 'number',  minimum: 0, maximum: 1, description: 'Dificuldade minima [0-1]' },
        maxDifficulty: { type: 'number',  minimum: 0, maximum: 1, description: 'Dificuldade maxima [0-1]' },
        tags:          { type: 'array',   items: { type: 'string' }, description: 'Tags para filtrar' },
        limit:         { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
    },
  },
  {
    name: 'class_mastery_summary',
    description: 'Retorna resumo agregado de dominio por turma e habilidade BNCC. Nao retorna dados individuais de alunos.',
    inputSchema: {
      type: 'object',
      properties: {
        classId:    { type: 'string', description: 'ID da turma -- opcional (retorna todas se omitido)' },
        skillCode:  { type: 'string', description: 'Codigo BNCC para filtrar -- opcional' },
        minMastery: { type: 'number', minimum: 0, maximum: 1, description: 'Filtrar por dominio minimo' },
      },
    },
  },
  {
    name: 'draft_assessment',
    description: 'Gera um rascunho de avaliacao com itens selecionados por dificuldade-alvo e habilidades.',
    inputSchema: {
      type: 'object',
      required: ['skills', 'itemCount'],
      properties: {
        skills:           { type: 'array',   items: { type: 'string' }, description: 'Lista de codigos BNCC a cobrir' },
        itemCount:        { type: 'integer', minimum: 1, maximum: 30, description: 'Numero de itens' },
        targetDifficulty: { type: 'number',  minimum: 0, maximum: 1, default: 0.5, description: 'Dificuldade-alvo media [0-1]' },
        title:            { type: 'string',  description: 'Titulo da avaliacao' },
      },
    },
  },
]

// -- Queries SQLite (tabelas criadas pelo MigrationRunner em main.ts) --

async function searchItems(params: Record<string, unknown>): Promise<unknown> {
  const db = getDriver()
  const { skill, minDifficulty = 0, maxDifficulty = 1, tags = [], limit = 10 } = params as {
    skill?: string; minDifficulty?: number; maxDifficulty?: number; tags?: string[]; limit?: number
  }

  // Construir WHERE dinamico
  const conditions: string[] = [
    'difficulty >= ?',
    'difficulty <= ?',
  ]
  const sqlParams: unknown[] = [minDifficulty, maxDifficulty]

  if (skill) {
    conditions.push('(skill_code = ? OR skill_code LIKE ?)')
    sqlParams.push(skill, `${skill}%`)
  }

  const sql = `
    SELECT id, statement, skill_code AS skill, difficulty, tags
    FROM assessment_items
    WHERE ${conditions.join(' AND ')}
    ORDER BY difficulty
    LIMIT ?
  `
  sqlParams.push(limit)

  interface ItemRow { id: string; statement: string; skill: string; difficulty: number; tags: string | null }
  const rows = await db.query<ItemRow>(sql, sqlParams)

  const tagList: string[] = Array.isArray(tags) ? tags : []
  const filtered = tagList.length === 0
    ? rows
    : rows.filter(r => {
        const itemTags: string[] = r.tags ? JSON.parse(r.tags) : []
        return tagList.some(t => itemTags.includes(t))
      })

  return {
    items: filtered.map(i => ({
      id: i.id,
      statement: i.statement.slice(0, 200), // truncar para evitar PII acidental
      skill: i.skill,
      difficulty: i.difficulty,
      tags: i.tags ? JSON.parse(i.tags) : [],
    })),
    total: filtered.length,
    limit,
  }
}

async function classMasterySummary(params: Record<string, unknown>): Promise<unknown> {
  const db = getDriver()
  const { classId, skillCode, minMastery = 0 } = params as {
    classId?: string; skillCode?: string; minMastery?: number
  }

  const conditions: string[] = ['avg_mastery >= ?']
  const sqlParams: unknown[] = [minMastery]

  if (classId) {
    conditions.push('class_id = ?')
    sqlParams.push(classId)
  }
  if (skillCode) {
    conditions.push('skill_code = ?')
    sqlParams.push(skillCode)
  }

  const sql = `
    SELECT class_id AS classId, skill_code AS skillCode,
           avg_mastery AS avgMastery, student_count AS studentCount,
           updated_at AS updatedAt
    FROM class_skill_mastery
    WHERE ${conditions.join(' AND ')}
    ORDER BY class_id, skill_code
    LIMIT 200
  `

  interface MasteryRow { classId: string; skillCode: string; avgMastery: number; studentCount: number; updatedAt: string }
  const rows = await db.query<MasteryRow>(sql, sqlParams)

  return {
    summary: rows,
    generatedAt: new Date().toISOString(),
    note: 'Dados agregados por turma -- sem identificacao individual de alunos (LGPD Art. 13 par.1)',
  }
}

async function draftAssessment(params: Record<string, unknown>): Promise<unknown> {
  const db = getDriver()
  const { skills, itemCount, targetDifficulty = 0.5, title = 'Avaliacao' } = params as {
    skills: string[]; itemCount: number; targetDifficulty?: number; title?: string
  }

  const skillList: string[] = Array.isArray(skills) ? skills : []
  const needed = Math.ceil(itemCount / Math.max(skillList.length, 1))

  interface ItemRow { id: string; statement: string; skill: string; difficulty: number; tags: string | null }
  const selected: ItemRow[] = []

  for (const skill of skillList) {
    const sql = `
      SELECT id, statement, skill_code AS skill, difficulty, tags
      FROM assessment_items
      WHERE skill_code = ? OR skill_code LIKE ?
      ORDER BY ABS(difficulty - ?) ASC
      LIMIT ?
    `
    const rows = await db.query<ItemRow>(sql, [skill, `${skill}%`, targetDifficulty, needed])
    selected.push(...rows)
  }

  // Dedup + limitar
  const unique = [...new Map(selected.map(i => [i.id, i])).values()].slice(0, itemCount)

  return {
    title,
    skills: skillList,
    targetDifficulty,
    items: unique.map((i, idx) => ({
      number: idx + 1,
      id: i.id,
      statement: i.statement.slice(0, 300),
      skill: i.skill,
      difficulty: i.difficulty,
    })),
    avgDifficulty: unique.length > 0
      ? unique.reduce((s, i) => s + i.difficulty, 0) / unique.length
      : null,
    generatedAt: new Date().toISOString(),
    note: 'Rascunho gerado automaticamente -- revisar antes de aplicar',
  }
}


// -- JSON-RPC async dispatcher --

async function handleRequest(req: McpRequest): Promise<McpResponse> {
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'teacher-ai-mcp', version: '1.1.0' },
      },
    }
  }

  if (req.method === 'tools/list') {
    return { jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } }
  }

  if (req.method === 'tools/call') {
    const { name, arguments: args = {} } = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
    try {
      let content: unknown
      if (name === 'search_items')               content = await searchItems(args ?? {})
      else if (name === 'class_mastery_summary') content = await classMasterySummary(args ?? {})
      else if (name === 'draft_assessment')       content = await draftAssessment(args ?? {})
      else {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Ferramenta desconhecida: ${name}` },
        }
      }
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { content: [{ type: 'text', text: JSON.stringify(content, null, 2) }] },
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      const code = (err as { code?: string }).code
      return { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: msg, data: code } }
    }
  }

  if (req.method === 'notifications/initialized') {
    return { jsonrpc: '2.0', id: null, result: null }
  }

  return {
    jsonrpc: '2.0',
    id: req.id,
    error: { code: -32601, message: `Metodo nao suportado: ${req.method}` },
  }
}

// -- Loop principal stdio --

const rl = readline.createInterface({ input: process.stdin, terminal: false })

rl.on('line', (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let req: McpRequest
  try {
    req = JSON.parse(trimmed)
  } catch {
    const errResp: McpResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'JSON invalido' },
    }
    process.stdout.write(JSON.stringify(errResp) + '\n')
    return
  }

  void handleRequest(req).then(response => {
    if (response.id !== null || response.error) {
      process.stdout.write(JSON.stringify(response) + '\n')
    }
  }).catch(err => {
    const errResp: McpResponse = {
      jsonrpc: '2.0',
      id: req.id ?? null,
      error: { code: -32603, message: err?.message ?? 'Erro inesperado' },
    }
    process.stdout.write(JSON.stringify(errResp) + '\n')
  })
})

rl.on('close', () => { driver?.close(); process.exit(0) })
process.on('SIGTERM', () => { driver?.close(); process.exit(0) })
process.on('SIGINT',  () => { driver?.close(); process.exit(0) })
