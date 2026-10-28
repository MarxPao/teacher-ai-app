/**
 * desktop/mcp/server.ts — Gap 9: MCP Server stdio (read-only)
 *
 * Expõe dados educacionais do Teacher AI como um servidor MCP via stdio.
 * Ferramentas disponíveis (SOMENTE LEITURA — sem escrita, sem PII bruto):
 *   - search_items      : busca itens de avaliação no banco local
 *   - class_mastery_summary : resumo de domínio por turma/habilidade
 *   - draft_assessment  : gera rascunho de avaliação parametrizada
 *
 * Protocolo: JSON-RPC 2.0 via stdin/stdout (conforme spec MCP 1.0)
 *
 * Inicialização: chamado pelo Electron main process via child_process.spawn()
 * ou diretamente como CLI: `node desktop/mcp/server.js`
 */

import * as readline from 'node:readline'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

// ── Tipos MCP ──

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

// ── Banco local (SQLite via arquivo JSON cache para modo offline) ──

const DB_PATH = path.join(os.homedir(), '.teacher-ai', 'mcp_cache.json')

interface McpCache {
  items: Array<{
    id: string
    statement: string
    skill: string
    difficulty: number
    tags: string[]
  }>
  classMastery: Array<{
    classId: string
    skillCode: string
    avgMastery: number
    studentCount: number
    updatedAt: string
  }>
}

function loadCache(): McpCache {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    }
  } catch {}
  return { items: [], classMastery: [] }
}

// ── Ferramentas MCP ──

const TOOLS: McpTool[] = [
  {
    name: 'search_items',
    description: 'Busca itens de avaliação no banco local por habilidade BNCC, dificuldade ou tags.',
    inputSchema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Código BNCC (ex: EF06LI01) — opcional' },
        minDifficulty: { type: 'number', minimum: 0, maximum: 1, description: 'Dificuldade mínima [0-1]' },
        maxDifficulty: { type: 'number', minimum: 0, maximum: 1, description: 'Dificuldade máxima [0-1]' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags para filtrar' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
    },
  },
  {
    name: 'class_mastery_summary',
    description: 'Retorna resumo agregado de domínio por turma e habilidade BNCC. Não retorna dados individuais de alunos.',
    inputSchema: {
      type: 'object',
      properties: {
        classId: { type: 'string', description: 'ID da turma — opcional (retorna todas se omitido)' },
        skillCode: { type: 'string', description: 'Código BNCC para filtrar — opcional' },
        minMastery: { type: 'number', minimum: 0, maximum: 1, description: 'Filtrar por domínio mínimo' },
      },
    },
  },
  {
    name: 'draft_assessment',
    description: 'Gera um rascunho de avaliação com itens selecionados por dificuldade-alvo e habilidades.',
    inputSchema: {
      type: 'object',
      required: ['skills', 'itemCount'],
      properties: {
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de códigos BNCC a cobrir',
        },
        itemCount: { type: 'integer', minimum: 1, maximum: 30, description: 'Número de itens' },
        targetDifficulty: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.5,
          description: 'Dificuldade-alvo média [0-1]',
        },
        title: { type: 'string', description: 'Título da avaliação' },
      },
    },
  },
]

// ── Implementação das ferramentas ──

function searchItems(params: Record<string, unknown>): unknown {
  const cache = loadCache()
  const { skill, minDifficulty = 0, maxDifficulty = 1, tags = [], limit = 10 } = params as any

  let results = cache.items.filter(item => {
    if (skill && !item.skill.includes(skill)) return false
    if (item.difficulty < minDifficulty || item.difficulty > maxDifficulty) return false
    if ((tags as string[]).length > 0 && !(tags as string[]).some((t: string) => item.tags.includes(t))) return false
    return true
  })

  return {
    items: results.slice(0, limit).map(i => ({
      id: i.id,
      statement: i.statement.slice(0, 200), // truncar para evitar PII acidental
      skill: i.skill,
      difficulty: i.difficulty,
      tags: i.tags,
    })),
    total: results.length,
    limit,
  }
}

function classMasterySummary(params: Record<string, unknown>): unknown {
  const cache = loadCache()
  const { classId, skillCode, minMastery = 0 } = params as any

  const results = cache.classMastery.filter(r => {
    if (classId && r.classId !== classId) return false
    if (skillCode && r.skillCode !== skillCode) return false
    if (r.avgMastery < (minMastery as number)) return false
    return true
  })

  return {
    summary: results,
    generatedAt: new Date().toISOString(),
    note: 'Dados agregados por turma — sem identificação individual de alunos (LGPD Art. 13 §1º)',
  }
}

function draftAssessment(params: Record<string, unknown>): unknown {
  const cache = loadCache()
  const { skills, itemCount, targetDifficulty = 0.5, title = 'Avaliação' } = params as any

  const selected: typeof cache.items = []
  const skillList: string[] = Array.isArray(skills) ? skills : []

  for (const skill of skillList) {
    const candidates = cache.items
      .filter(i => i.skill.includes(skill))
      .sort((a, b) => Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty))

    const needed = Math.ceil(itemCount / Math.max(skillList.length, 1))
    selected.push(...candidates.slice(0, needed))
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
    note: 'Rascunho gerado automaticamente — revisar antes de aplicar',
  }
}

// ── JSON-RPC dispatcher ──

function handleRequest(req: McpRequest): McpResponse {
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'teacher-ai-mcp', version: '1.0.0' },
      },
    }
  }

  if (req.method === 'tools/list') {
    return { jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } }
  }

  if (req.method === 'tools/call') {
    const { name, arguments: args = {} } = (req.params || {}) as any
    let content: unknown

    try {
      if (name === 'search_items') content = searchItems(args)
      else if (name === 'class_mastery_summary') content = classMasterySummary(args)
      else if (name === 'draft_assessment') content = draftAssessment(args)
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
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32603, message: err.message || 'Erro interno', data: err.code },
      }
    }
  }

  if (req.method === 'notifications/initialized') {
    // Notificação sem resposta
    return { jsonrpc: '2.0', id: null, result: null }
  }

  return {
    jsonrpc: '2.0',
    id: req.id,
    error: { code: -32601, message: `Método não suportado: ${req.method}` },
  }
}

// ── Loop principal stdio ──

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
      error: { code: -32700, message: 'JSON inválido' },
    }
    process.stdout.write(JSON.stringify(errResp) + '\n')
    return
  }

  const response = handleRequest(req)
  // Notificações (id: null com result: null) não precisam de resposta
  if (response.id !== null || response.error) {
    process.stdout.write(JSON.stringify(response) + '\n')
  }
})

rl.on('close', () => {
  process.exit(0)
})

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))