import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

const ROOT = path.resolve(__dirname, '..')
const INDEX_PATH = path.join(ROOT, 'index.json')
const PACKAGES_DIR = path.join(ROOT, 'packages')

function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

async function verifyRegistry(): Promise<void> {
  console.log('=== Verificação Automatizada do Registro Comunitário ===')

  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error('Arquivo index.json não encontrado na raiz do repositório.')
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'))
  console.log(`Versão do Índice: ${index.registry_version}`)
  console.log(`Última Atualização: ${index.updated_at}`)
  console.log(`Total de Pacotes Cadastrados: ${index.packages.length}`)

  // Validação dos pacotes físicos
  if (fs.existsSync(PACKAGES_DIR)) {
    const files = fs.readdirSync(PACKAGES_DIR).filter((f) => f.endsWith('.skillpkg.json'))
    for (const f of files) {
      const fullPath = path.join(PACKAGES_DIR, f)
      const rawText = fs.readFileSync(fullPath, 'utf8')
      const sha256 = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex')

      const entry = index.packages.find((p: any) => p.path === `packages/${f}` || p.path === f)
      if (!entry) {
        throw new Error(`Pacote ${f} presente na pasta packages/ mas ausente no index.json!`)
      }

      if (entry.sha256 !== sha256) {
        throw new Error(`Hash divergente para ${f}! Índice: ${entry.sha256}, Real: ${sha256}`)
      }

      const pkg = JSON.parse(rawText)
      if (pkg.pkg_format !== 'skillpkg/1') {
        throw new Error(`Formato de pacote inválido em ${f}: ${pkg.pkg_format}`)
      }
      if (!pkg.signature || pkg.signature.alg !== 'ed25519') {
        throw new Error(`Assinatura Ed25519 ausente em ${f}!`)
      }
    }
  }

  console.log('[OK] Validação de conformidade do registro concluída com sucesso!')
}

verifyRegistry().catch((err) => {
  console.error('[ERRO]', err.message)
  process.exit(1)
})
