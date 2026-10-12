// scripts/build-extension-runner.ts
// Script de build para empacotar o SkillGraph v2 Runner para consumo na extensão Chrome MV3

import { build } from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'teacher-extension', 'dist')

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

const isDev = process.argv.includes('--dev') || process.env.BUILD_DEV === 'true'

async function runBuild(): Promise<void> {
  console.log(`[Build Ext] Compilando bundles do SkillGraph v2 (DEV=${isDev}) para teacher-extension...`)

  const expectedOutputs = [
    path.join(DIST_DIR, 'runner.bundle.js'),
    path.join(DIST_DIR, 'content-adapter.bundle.js'),
  ]

  // 1. Runner para o Service Worker (background.js)
  await build({
    entryPoints: [path.join(ROOT, 'lib', 'runner-ext', 'workerEntry.ts')],
    bundle: true,
    outfile: expectedOutputs[0],
    format: 'iife',
    globalName: 'SkillGraphBundle',
    platform: 'browser',
    target: 'chrome110',
    sourcemap: true,
    define: {
      '__DEV__': isDev ? 'true' : 'false',
    },
  })

  // 2. Content Adapter para o Content Script (content.js / frames)
  await build({
    entryPoints: [path.join(ROOT, 'lib', 'runner-ext', 'contentEntry.ts')],
    bundle: true,
    outfile: expectedOutputs[1],
    format: 'iife',
    platform: 'browser',
    target: 'chrome110',
    sourcemap: true,
    define: {
      '__DEV__': isDev ? 'true' : 'false',
    },
  })

  // Verificação de integridade: todos os bundles devem existir e ter tamanho > 0
  for (const out of expectedOutputs) {
    if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
      throw new Error(`Bundle obrigatório ausente ou vazio: ${out}`)
    }
  }

  console.log('[Build Ext] Bundles gerados com sucesso e verificados em teacher-extension/dist/!')
}

runBuild().catch((err) => {
  console.error('[Build Ext] Falha no build da extensão:', err)
  process.exit(1)
})
