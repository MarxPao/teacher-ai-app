import * as fs from 'node:fs'
import * as path from 'node:path'
import * as net from 'node:net'

interface ScanOptions {
  targetPath: string
  namesFile?: string
  checkPorts: boolean
}

const DEFAULT_CANARIES = ['Zeca', 'Canário', 'Canario', 'Mariana Canário', 'Bento Canário']

const PII_PATTERNS = [
  // CPF formatado: 000.000.000-00
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  // Telefone celular BR: (11) 99999-9999 ou 11999999999
  /\b(?:\(?\d{2}\)?\s?)?9\d{4}[-.\s]?\d{4}\b/g,
]

function parseArgs(): ScanOptions {
  const args = process.argv.slice(2)
  let targetPath = '.'
  let namesFile: string | undefined
  let checkPorts = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ports') {
      checkPorts = true
    } else if (args[i] === '--names' && i + 1 < args.length) {
      namesFile = args[++i]
    } else if (!args[i].startsWith('--')) {
      targetPath = args[i]
    }
  }

  return { targetPath, namesFile, checkPorts }
}

async function checkOpenPorts(): Promise<number[]> {
  const portsToProbe = [8765, 8766, 3000, 8000, 9222]
  const openPorts: number[] = []

  for (const port of portsToProbe) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(200)
      socket.on('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.on('error', () => {
        socket.destroy()
        resolve(false)
      })
      socket.connect(port, '127.0.0.1')
    })

    if (isOpen) {
      openPorts.push(port)
    }
  }

  return openPorts
}

function loadTargetNames(namesFile?: string): string[] {
  const names = [...DEFAULT_CANARIES]
  if (namesFile && fs.existsSync(namesFile)) {
    try {
      const content = fs.readFileSync(namesFile, 'utf8')
      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 2)
      names.push(...lines)
    } catch {}
  }
  return Array.from(new Set(names))
}

function walkDir(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'dist-desktop'].includes(entry.name)) {
        continue
      }
      walkDir(fullPath, fileList)
    } else if (entry.isFile()) {
      fileList.push(fullPath)
    }
  }
  return fileList
}

async function runScan() {
  const options = parseArgs()
  console.log(`[Privacy Scan] Iniciando varredura em: ${options.targetPath}`)

  if (options.checkPorts) {
    console.log('[Privacy Scan] Verificando portas TCP locais...')
    const open = await checkOpenPorts()
    if (open.length > 0) {
      console.log(`[ALERTA] Portas TCP abertas detectadas: ${open.join(', ')}`)
    } else {
      console.log('[OK] Zero portas TCP em escuta nos processos auditados.')
    }
  }

  const searchNames = loadTargetNames(options.namesFile)
  const files = walkDir(options.targetPath)

  let violationsCount = 0
  let scannedFiles = 0

  for (const file of files) {
    scannedFiles++
    let fileViolations = 0

    try {
      const buffer = fs.readFileSync(file)
      const content = buffer.toString('utf8')

      // Busca por nomes canário e nomes informados
      for (const name of searchNames) {
        if (content.includes(name)) {
          // Conta ocorrências sem nunca imprimir o trecho
          const matches = content.split(name).length - 1
          fileViolations += matches
        }
      }

      // Busca por padrões de CPF e Telefone (apenas em arquivos de dados)
      if (file.endsWith('.db') || file.endsWith('.json') || file.endsWith('.csv') || file.endsWith('.log')) {
        for (const pattern of PII_PATTERNS) {
          const pMatches = content.match(pattern)
          if (pMatches) {
            fileViolations += pMatches.length
          }
        }
      }

      if (fileViolations > 0) {
        violationsCount += fileViolations
        // REGRA DE OURO: Imprime apenas caminho e contagem, NUNCA o trecho!
        console.log(`[VIOLAÇÃO] ${file}: ${fileViolations} ocorrência(s) detectada(s)`)
      }
    } catch {
      // Ignora arquivos bloqueados pelo SO
    }
  }

  console.log(`\n========================================`)
  console.log(`Arquivos varridos: ${scannedFiles}`)
  console.log(`Total de violações: ${violationsCount}`)
  console.log(`Status de Privacidade: ${violationsCount === 0 ? 'CONFORME (ZERO VAZAMENTOS)' : 'NÃO CONFORME'}`)
  console.log(`========================================\n`)

  if (violationsCount > 0) {
    process.exit(1)
  }
}

runScan().catch((err) => {
  console.error('[Privacy Scan] Falha inesperada:', err)
  process.exit(1)
})
