/**
 * scripts/build-installer.ts
 *
 * Orquestra o pipeline completo de empacotamento do TeacherAI para distribuição:
 *
 *   Passo 1  next build         → .next/        (Next.js SSG/server)
 *   Passo 2  desktop:build      → dist-desktop/ (main, preload, shim via esbuild)
 *   Passo 3  Prepara dist-desktop/package.json  (electron-builder precisa de um
 *                                                package.json com "main" correto)
 *   Passo 4  Converte ícone PNG → ICO            (gera build-resources/icon.ico)
 *   Passo 5  electron-builder   → release/       (NSIS .exe)
 *
 * Uso:
 *   npm run installer:build
 *   SKIP_NEXT_BUILD=1 npm run installer:build   # pula o next build (já feito)
 */

import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist-desktop')
const BUILD_RESOURCES = path.join(ROOT, 'build-resources')
const RELEASE = path.join(ROOT, 'release')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

function run(cmd: string, label: string) {
  console.log(`\n[installer] ▶ ${label}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT })
}

// ---------------------------------------------------------------------------
// Passo 1 — Next.js build
// ---------------------------------------------------------------------------
if (!process.env.SKIP_NEXT_BUILD) {
  run('npm run build', 'next build')
} else {
  console.log('[installer] ⏭  SKIP_NEXT_BUILD=1 — pulando next build')
}

// ---------------------------------------------------------------------------
// Passo 2 — esbuild do processo desktop
// ---------------------------------------------------------------------------
run('npm run desktop:build', 'esbuild → dist-desktop/')

// ---------------------------------------------------------------------------
// Passo 3 — package.json mínimo dentro de dist-desktop/
//           electron-builder lê o "main" a partir deste arquivo
// ---------------------------------------------------------------------------
const miniPkg = {
  name: PKG.name,
  version: PKG.version,
  description: 'TeacherAI — aplicativo desktop para professores',
  author: PKG.author || 'TeacherAI',
  main: 'main.js',
}
fs.writeFileSync(
  path.join(DIST, 'package.json'),
  JSON.stringify(miniPkg, null, 2),
  'utf8'
)
console.log('[installer] ✔  dist-desktop/package.json criado')

// ---------------------------------------------------------------------------
// Passo 4 — Converter public/icon-512.png → build-resources/icon.ico
//
// electron-builder no Windows requer um .ico (multi-resolução idealmente).
// Usamos 'png-to-ico' se disponível, com fallback para ICO embutido.
// ---------------------------------------------------------------------------
if (!fs.existsSync(BUILD_RESOURCES)) {
  fs.mkdirSync(BUILD_RESOURCES, { recursive: true })
}

const icoPath = path.join(BUILD_RESOURCES, 'icon.ico')

async function generateIco() {
  const srcPng = path.join(ROOT, 'public', 'icon-512.png')
  if (!fs.existsSync(srcPng)) {
    console.warn('[installer] ⚠  public/icon-512.png não encontrado — usando ícone placeholder')
    writeMinimalIco(icoPath)
    return
  }

  try {
    // Tenta usar 'png-to-ico' se disponível
    const pngToIco = await import('png-to-ico').catch(() => null)
    if (pngToIco) {
      const icoBuffer = await (pngToIco as any).default([srcPng])
      fs.writeFileSync(icoPath, icoBuffer)
      console.log('[installer] ✔  build-resources/icon.ico gerado via png-to-ico')
      return
    }
  } catch {
    // fall through para placeholder
  }

  // Fallback: embute o PNG diretamente como ICO (formato ICO suporta PNG desde Vista)
  try {
    const pngBuf = fs.readFileSync(srcPng)
    const icoBuffer = pngToIcoBuffer(pngBuf, 512)
    fs.writeFileSync(icoPath, icoBuffer)
    console.log('[installer] ✔  build-resources/icon.ico gerado (PNG embutido em ICO)')
    return
  } catch {
    // fall through para placeholder
  }

  console.warn('[installer] ⚠  Falha na conversão — usando ícone placeholder ICO')
  writeMinimalIco(icoPath)
}

/**
 * Encapsula um PNG já renderizado dentro de um arquivo ICO.
 * O formato ICO aceita PNG embutido a partir do Windows Vista (ICOFORMAT_COMPRESSED).
 */
function pngToIcoBuffer(pngBuf: Buffer, size: number): Buffer {
  const HEADER_SIZE = 6
  const ENTRY_SIZE = 16
  const dataOffset = HEADER_SIZE + ENTRY_SIZE

  const header = Buffer.alloc(HEADER_SIZE)
  header.writeUInt16LE(0, 0)       // Reserved (must be 0)
  header.writeUInt16LE(1, 2)       // Type: 1 = ICO
  header.writeUInt16LE(1, 4)       // Count: 1 image

  const entry = Buffer.alloc(ENTRY_SIZE)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)  // Width (0 = 256+)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)  // Height (0 = 256+)
  entry.writeUInt8(0, 2)                        // Color count
  entry.writeUInt8(0, 3)                        // Reserved
  entry.writeUInt16LE(1, 4)                     // Planes
  entry.writeUInt16LE(32, 6)                    // Bit count
  entry.writeUInt32LE(pngBuf.length, 8)         // Size of image data
  entry.writeUInt32LE(dataOffset, 12)           // Offset of image data

  return Buffer.concat([header, entry, pngBuf])
}

/** ICO mínimo de 1×1 pixel branco como placeholder de último recurso */
function writeMinimalIco(outPath: string) {
  const ico = Buffer.from([
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, // ICO header: reserved, type=1, count=1
    0x01, 0x01, 0x00, 0x00,             // width=1, height=1, colorCount=0, reserved=0
    0x01, 0x00, 0x20, 0x00,             // planes=1, bitCount=32
    0x28, 0x00, 0x00, 0x00,             // sizeInBytes=40
    0x16, 0x00, 0x00, 0x00,             // imageOffset=22
    // BITMAPINFOHEADER
    0x28, 0x00, 0x00, 0x00,             // biSize=40
    0x01, 0x00, 0x00, 0x00,             // biWidth=1
    0x02, 0x00, 0x00, 0x00,             // biHeight=2
    0x01, 0x00, 0x20, 0x00,             // biPlanes=1, biBitCount=32
    0x00, 0x00, 0x00, 0x00,             // biCompression=0
    0x00, 0x00, 0x00, 0x00,             // biSizeImage=0
    0x00, 0x00, 0x00, 0x00,             // biXPels
    0x00, 0x00, 0x00, 0x00,             // biYPels
    0x00, 0x00, 0x00, 0x00,             // biClrUsed
    0x00, 0x00, 0x00, 0x00,             // biClrImportant
    0xFF, 0xFF, 0xFF, 0xFF,             // 1 pixel BGRA branco
    0x00, 0x00, 0x00, 0x00,             // AND mask
  ])
  fs.writeFileSync(outPath, ico)
}

// ---------------------------------------------------------------------------
// Passo 5 — electron-builder
// ---------------------------------------------------------------------------
generateIco().then(() => {
  if (!fs.existsSync(RELEASE)) fs.mkdirSync(RELEASE, { recursive: true })

  const isWin = process.platform === 'win32'
  const builderBin = path.join(ROOT, 'node_modules', '.bin', 'electron-builder')
  const builderCmd = isWin ? `"${builderBin}.cmd"` : builderBin

  run(
    `${builderCmd} --config electron-builder.yml --win`,
    'electron-builder → release/'
  )

  console.log('\n[installer] ✅  Instalador gerado em release/')
  try {
    const files = fs.readdirSync(RELEASE).filter(f => f.endsWith('.exe'))
    files.forEach(f => console.log(`           📦  ${f}`))
  } catch { /* ok */ }
}).catch(err => {
  console.error('[installer] ❌  Falha no pipeline:', err)
  process.exit(1)
})
