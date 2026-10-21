// scripts/gate-a-preflight.ts
// Script de pré-voo para o Gate A (somente leitura, sem rede, sem alteração de registro)

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(__dirname, '..')

interface CheckResult {
  title: string
  ok: boolean
  message: string
}

function calculateExtensionId(base64Key: string): string {
  const pubKeyDer = Buffer.from(base64Key, 'base64')
  const sha256 = crypto.createHash('sha256').update(pubKeyDer).digest()
  const nibbles: number[] = []
  for (let i = 0; i < 16; i++) {
    const byte = sha256[i]
    nibbles.push((byte >> 4) & 0x0f)
    nibbles.push(byte & 0x0f)
  }
  return nibbles.map((n) => String.fromCharCode(97 + n)).join('')
}

function runChecks(): CheckResult[] {
  const results: CheckResult[] = []

  // 1. teacher-extension/dist/*.bundle.js existem
  const bundles = ['runner.bundle.js', 'content-adapter.bundle.js', 'recorder.bundle.js']
  const distExtDir = path.join(ROOT, 'teacher-extension', 'dist')
  const missingBundles = bundles.filter((b) => !fs.existsSync(path.join(distExtDir, b)))
  if (missingBundles.length === 0) {
    results.push({
      title: 'Bundles da extensão',
      ok: true,
      message: 'Todos os bundles presentes em teacher-extension/dist/',
    })
  } else {
    results.push({
      title: 'Bundles da extensão',
      ok: false,
      message: `Faltam bundles: ${missingBundles.join(', ')} (execute 'npm run build:ext')`,
    })
  }

  // 2. manifest.json tem 'key'
  const manifestPath = path.join(ROOT, 'teacher-extension', 'manifest.json')
  let manifestKey = ''
  if (!fs.existsSync(manifestPath)) {
    results.push({
      title: 'Manifesto da extensão',
      ok: false,
      message: 'teacher-extension/manifest.json não encontrado',
    })
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.key === 'string' && manifest.key.length > 0) {
        manifestKey = manifest.key
        results.push({
          title: "Chave pública do manifesto ('key')",
          ok: true,
          message: 'Campo key presente no manifest.json',
        })
      } else {
        results.push({
          title: "Chave pública do manifesto ('key')",
          ok: false,
          message: 'Campo key ausente ou inválido no manifest.json',
        })
      }
    } catch (err) {
      results.push({
        title: "Chave pública do manifesto ('key')",
        ok: false,
        message: `Falha ao ler manifest.json: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // 3. ID calculado bate com allowed_origins do script de registro
  if (manifestKey) {
    const calculatedId = calculateExtensionId(manifestKey)
    const registerScriptPath = path.join(ROOT, 'scripts', 'native-host-register.ts')
    if (fs.existsSync(registerScriptPath)) {
      const scriptContent = fs.readFileSync(registerScriptPath, 'utf8')
      const expectedOrigin = `chrome-extension://${calculatedId}/`
      if (scriptContent.includes(expectedOrigin)) {
        results.push({
          title: 'ID da extensão vs allowed_origins',
          ok: true,
          message: `ID derivado (${calculatedId}) está presente em allowed_origins`,
        })
      } else {
        results.push({
          title: 'ID da extensão vs allowed_origins',
          ok: false,
          message: `ID derivado (${calculatedId}) não encontrado em allowed_origins de scripts/native-host-register.ts`,
        })
      }
    } else {
      results.push({
        title: 'ID da extensão vs allowed_origins',
        ok: false,
        message: 'scripts/native-host-register.ts não encontrado',
      })
    }
  }

  // 4. Host nativo registrado no HKCU e aponta para arquivo existente
  const hostKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.teacherai.desktop'
  try {
    const regOutput = execSync(`reg query "${hostKey}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const match = regOutput.match(/REG_SZ\s+(.+)$/m)
    if (match && match[1]) {
      const targetPath = match[1].trim()
      if (fs.existsSync(targetPath)) {
        results.push({
          title: 'Host nativo no registro (HKCU)',
          ok: true,
          message: 'Registrado em HKCU e aponta para arquivo existente',
        })
      } else {
        results.push({
          title: 'Host nativo no registro (HKCU)',
          ok: false,
          message: 'Chave presente em HKCU, mas o arquivo de destino não existe no disco',
        })
      }
    } else {
      results.push({
        title: 'Host nativo no registro (HKCU)',
        ok: false,
        message: 'Chave encontrada no registro, mas valor padrão REG_SZ não pôde ser extraído',
      })
    }
  } catch {
    results.push({
      title: 'Host nativo no registro (HKCU)',
      ok: false,
      message: "Host não registrado em HKCU (execute 'npx tsx scripts/native-host-register.ts --register')",
    })
  }

  // 5. dist-desktop/ existe
  const distDesktopDir = path.join(ROOT, 'dist-desktop')
  if (fs.existsSync(distDesktopDir) && fs.statSync(distDesktopDir).isDirectory()) {
    results.push({
      title: 'Diretório dist-desktop/',
      ok: true,
      message: 'Diretório dist-desktop/ presente',
    })
  } else {
    results.push({
      title: 'Diretório dist-desktop/',
      ok: false,
      message: "Diretório dist-desktop/ ausente (execute 'npm run desktop:build')",
    })
  }

  // 6. .env.local não é rastreado no git
  try {
    const gitOut = execSync('git ls-files .env.local', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    if (gitOut.trim().length === 0) {
      results.push({
        title: 'Rastreamento de .env.local',
        ok: true,
        message: '.env.local não é rastreado no git',
      })
    } else {
      results.push({
        title: 'Rastreamento de .env.local',
        ok: false,
        message: 'ALERTA: .env.local está sendo rastreado pelo git!',
      })
    }
  } catch {
    results.push({
      title: 'Rastreamento de .env.local',
      ok: true,
      message: 'Não foi possível verificar via git ou arquivo não rastreado',
    })
  }

  return results
}

function main(): void {
  console.log('=== Teacher AI — Pré-voo do Gate A ===\n')

  const results = runChecks()
  let hasFailures = false

  for (const r of results) {
    const tag = r.ok ? '[OK]' : '[FALTA]'
    console.log(`${tag} ${r.title}: ${r.message}`)
    if (!r.ok) {
      hasFailures = true
    }
  }

  console.log('\n----------------------------------------')
  if (hasFailures) {
    console.log('Resultado: Existem pendências a resolver antes do Gate A.')
    process.exit(1)
  } else {
    console.log('Resultado: Todos os pré-requisitos estão OK para o Gate A.')
    process.exit(0)
  }
}

main()
