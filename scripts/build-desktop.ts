import { build } from 'esbuild'
import * as path from 'node:path'
import * as fs from 'node:fs'

const ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist-desktop')

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

async function runDesktopBuild(): Promise<void> {
  console.log('[Build Desktop] Empacotando casca Electron...')

  // 1. Main process
  await build({
    entryPoints: [path.join(ROOT, 'desktop', 'main.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'main.js'),
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    external: ['electron', 'node:sqlite'],
    sourcemap: true,
  })

  // 2. Preload script
  await build({
    entryPoints: [path.join(ROOT, 'desktop', 'preload.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'preload.js'),
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    external: ['electron'],
    sourcemap: true,
  })

  // 3. Shim nativo para Native Messaging
  await build({
    entryPoints: [path.join(ROOT, 'desktop', 'native-host', 'shim.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'shim.js'),
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: true,
  })

  // 4. Cria runner em lote shim.bat (prefere binário Electron empacotado com ELECTRON_RUN_AS_NODE=1)
  fs.writeFileSync(
    path.join(DIST_DIR, 'shim.bat'),
    '@echo off\r\nif exist "%~dp0..\\TeacherAI.exe" (\r\n  set ELECTRON_RUN_AS_NODE=1\r\n  "%~dp0..\\TeacherAI.exe" "%~dp0shim.js" %*\r\n) else (\r\n  node "%~dp0shim.js" %*\r\n)\r\n'
  )

  // 5. Copia UI estática
  const srcUi = path.join(ROOT, 'desktop', 'ui')
  const destUi = path.join(DIST_DIR, 'ui')
  if (!fs.existsSync(destUi)) {
    fs.mkdirSync(destUi, { recursive: true })
  }

  for (const file of fs.readdirSync(srcUi)) {
    fs.cpSync(path.join(srcUi, file), path.join(destUi, file), { recursive: true })
  }

  console.log('[Build Desktop] Sucesso: Artefatos gerados em dist-desktop/!')
}

runDesktopBuild().catch((err) => {
  console.error('[Build Desktop] Falha no build:', err)
  process.exit(1)
})
