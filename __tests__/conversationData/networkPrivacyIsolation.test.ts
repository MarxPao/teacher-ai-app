import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { GET, POST, DELETE } from '../../app/api/students/route'
import { NextRequest } from 'next/server'

describe('Item 2.1: Isolamento de Rede, Salvaguardas LGPD e Trilho 1 de PII', () => {
  it('2.1.a: Rota app/api/students/route.ts NÃO é empacotada no bundle Desktop (scripts/build-desktop.ts)', () => {
    const buildDesktopScript = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'build-desktop.ts'), 'utf8')

    // Confirma que os únicos entrypoints são main.ts, preload.ts, shim.ts e desktop/ui
    expect(buildDesktopScript).toContain("entryPoints: [path.join(ROOT, 'desktop', 'main.ts')]")
    expect(buildDesktopScript).toContain("entryPoints: [path.join(ROOT, 'desktop', 'preload.ts')]")
    expect(buildDesktopScript).toContain("entryPoints: [path.join(ROOT, 'desktop', 'native-host', 'shim.ts')]")

    // Confirma ausência total de empacotamento da pasta app/ ou Next.js API routes
    expect(buildDesktopScript).not.toContain("app/api")
    expect(buildDesktopScript).not.toContain("app/api/students")
  })

  it('2.1.b: app/api/students/route.ts está desligada fail-closed por padrão sem variáveis de ambiente', async () => {
    // GET
    const getRes = await GET()
    expect(getRes.status).toBe(403)
    const getJson = await getRes.json()
    expect(getJson.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')

    // POST
    const dummyReq = new NextRequest('http://localhost:3000/api/students', {
      method: 'POST',
      body: JSON.stringify({ name: 'Aluno Canário', nee_flag: true })
    })
    const postRes = await POST(dummyReq)
    expect(postRes.status).toBe(403)
    const postJson = await postRes.json()
    expect(postJson.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')

    // DELETE
    const delReq = new NextRequest('http://localhost:3000/api/students?id=123', {
      method: 'DELETE'
    })
    const delRes = await DELETE(delReq)
    expect(delRes.status).toBe(403)
    const delJson = await delRes.json()
    expect(delJson.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
  })

  it('2.1.c: lib/conversationData tem isolamento total: zero referências a Supabase e zero vazamento para a API', () => {
    const convDir = path.join(__dirname, '..', '..', 'lib', 'conversationData')
    const files = fs.readdirSync(convDir).filter(f => f.endsWith('.ts'))

    for (const file of files) {
      const content = fs.readFileSync(path.join(convDir, file), 'utf8')
      expect(content.toLowerCase()).not.toContain('@supabase/supabase-js')
      expect(content.toLowerCase()).not.toContain('createserverclient')
      expect(content.toLowerCase()).not.toContain('createsupabase')
    }

    // Confirma que app/api/students/route.ts não importa nada de conversationData
    const routeContent = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'api', 'students', 'route.ts'), 'utf8')
    expect(routeContent).not.toContain('conversationData')
    expect(routeContent).not.toContain('schema')
    expect(routeContent).not.toContain('desktopIpc')
  })
})
