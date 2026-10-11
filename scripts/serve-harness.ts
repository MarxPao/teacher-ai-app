// scripts/serve-harness.ts
// Servidor estático nativo (node:http) para execução do harness de testes locais

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = 8898
const HOST = '127.0.0.1'
const ROOT = path.resolve(__dirname, '..')
const HARNESS_DIR = path.join(ROOT, 'tools', 'runner-harness')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

function resolveFilePath(reqUrl: string): string | null {
  const cleanPath = decodeURIComponent(reqUrl.split('?')[0])

  if (cleanPath === '/' || cleanPath === '/index.html') {
    return path.join(HARNESS_DIR, 'index.html')
  }

  if (cleanPath.startsWith('/fixtures/')) {
    const fixtureFile = cleanPath.slice('/fixtures/'.length)
    return path.join(HARNESS_DIR, 'fixtures', fixtureFile)
  }

  if (cleanPath.startsWith('/dist/')) {
    const distFile = cleanPath.slice('/dist/'.length)
    return path.join(HARNESS_DIR, 'dist', distFile)
  }

  if (cleanPath.startsWith('/graphs/synthetic/')) {
    const graphFile = cleanPath.slice('/graphs/synthetic/'.length)
    return path.join(ROOT, 'graphs', 'synthetic', graphFile)
  }

  // Fallback para arquivos dentro de tools/runner-harness
  const harnessCandidate = path.join(HARNESS_DIR, cleanPath.replace(/^\//, ''))
  if (harnessCandidate.startsWith(HARNESS_DIR) && fs.existsSync(harnessCandidate)) {
    return harnessCandidate
  }

  return null
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' })
    res.end('Method Not Allowed')
    return
  }

  const filePath = resolveFilePath(req.url || '/')

  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }

  try {
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    })

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
  } catch (err: any) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Internal Server Error: ${err.message}`)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[Harness] Servidor do SkillGraph Harness rodando em http://${HOST}:${PORT}`)
  console.log(`[Harness] Pressione Ctrl+C para encerrar.`)
})
