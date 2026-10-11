import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const HOST_NAME = 'com.teacherai.desktop'
const EXTENSION_ID = 'phahliidgjidilhkcllbhfjmjcefdfci'
const REG_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`

function getManifestPath(): string {
  const root = path.resolve(__dirname, '..')
  return path.join(root, 'dist-desktop', `${HOST_NAME}.json`)
}

function getShimPath(): string {
  const root = path.resolve(__dirname, '..')
  return path.join(root, 'dist-desktop', 'shim.bat')
}

export function registerHost(): void {
  const manifestPath = getManifestPath()
  const shimPath = getShimPath()

  const manifest = {
    name: HOST_NAME,
    description: 'Teacher AI Desktop Native Messaging Host',
    path: shimPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  }

  const manifestDir = path.dirname(manifestPath)
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true })
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[Register Host] Manifesto gerado em: ${manifestPath}`)

  try {
    const cmd = `reg add "${REG_KEY}" /ve /t REG_SZ /d "${manifestPath}" /f`
    execSync(cmd, { stdio: 'inherit' })
    console.log(`[Register Host] Sucesso: Chave de registro criada em ${REG_KEY}`)
    console.log(`[Register Host] Extensão autorizada: chrome-extension://${EXTENSION_ID}/`)
  } catch (err: any) {
    console.error(`[Register Host] Falha ao registrar no Windows Registry: ${err.message}`)
    process.exit(1)
  }
}

export function unregisterHost(): void {
  const manifestPath = getManifestPath()

  try {
    const cmd = `reg delete "${REG_KEY}" /f`
    execSync(cmd, { stdio: 'inherit' })
    console.log(`[Unregister Host] Chave de registro removida de ${REG_KEY}`)
  } catch (err: any) {
    console.warn(`[Unregister Host] Chave de registro não encontrada ou já removida: ${err.message}`)
  }

  try {
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath)
      console.log(`[Unregister Host] Manifesto removido: ${manifestPath}`)
    }
  } catch {}

  console.log('[Unregister Host] Desregistro concluído com sucesso.')
}

const arg = process.argv[2]
if (arg === '--unregister') {
  unregisterHost()
} else if (arg === '--register' || !arg) {
  registerHost()
} else {
  console.log('Uso: npx tsx scripts/native-host-register.ts [--register | --unregister]')
}
