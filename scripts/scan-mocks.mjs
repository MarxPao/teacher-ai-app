#!/usr/bin/env node

/**
 * ============================================================================
 * SCANNER ANTI-SIMULAÇÃO (ZERO-SIMULATION AUDIT) — TEACHER AI APP
 * ============================================================================
 * 
 * Este script faz parte do PROTOCOLO DE DESENVOLVIMENTO (REGRA 2).
 * Ele varre todo o código-fonte de produção (components/, lib/, app/) procurando
 * padrões suspeitos de simulação, dados fabricados ou mocks esquecidos.
 * 
 * SEVERIDADE:
 * - [BLOQUEANTE]: Falha o build e o CI (process.exit(1)).
 *   Exemplos: Math.random() não justificado, variáveis/funções mock/fake/dummy/stub.
 * - [AVISO]: Não falha o build, mas gera alerta explícito no log de CI.
 *   Exemplos: Comentários TODO/FIXME/temporary, funções async sem await/fetch.
 * 
 * ----------------------------------------------------------------------------
 * COMO ADICIONAR UMA NOVA EXCEÇÃO LEGÍTIMA:
 * ----------------------------------------------------------------------------
 * 1. Exceções SÓ são permitidas para algoritmos legítimos e não-simulatórios
 *    (ex: sorteio interativo de alunos em sala, Fisher-Yates shuffle seed,
 *    cálculo estocástico documentado, partículas de canvas).
 * 2. Toda exceção DEVE ser adicionada na constante `LEGITIMATE_EXCEPTIONS` abaixo com:
 *    - `file`: Caminho relativo exato do arquivo (ex: 'components/modules/ClassroomMode.tsx')
 *    - `pattern`: RegExp ou string exata permitida
 *    - `reason`: [OBRIGATÓRIO] Justificativa pedagógica/técnica detalhada explicando
 *      por que o uso é legítimo e não constitui simulação de dados reais.
 * 3. PRs que adicionarem exceções sem uma justificativa clara DEVEM ser rejeitados.
 * ============================================================================
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

// ============================================================================
// LISTA DE EXCEÇÕES EXPLÍCITAS E DOCUMENTADAS
// ============================================================================
export const LEGITIMATE_EXCEPTIONS = [
  // 1. Identificadores de elementos únicos em armazenamento local / RAG / DOM
  {
    file: 'ALL',
    pattern: /(id\s*:\s*|'act_'|'rub_'|'file_'|'cls_'|'img_'|'post_'|'mem_'|'lib_q_'|gemini-|Date\.now\(\))[^;\n]*Math\.random/,
    reason: 'Geração de IDs únicos locais cliente (prefixo + timestamp + sufixo alfanumérico aleatório para evitar colisão no localStorage).'
  },
  // 2. Animação e Partículas Visuais / Formas de Onda de Áudio
  {
    file: 'components/VoiceOrb.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Ruído estocástico para animação fluida da orbe de áudio (efeito visual de respiração/onda sonora).'
  },
  {
    file: 'components/WisprFlowOverlay.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Ruído visual para renderização de forma de onda da transcrição de voz ao vivo.'
  },
  {
    file: 'components/modules/ClassroomTimer.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Posicionamento estocástico de partículas e confetes visuais na tela ao finalizar o cronômetro.'
  },
  // 3. Ferramentas Pedagógicas Interativas em Sala de Aula
  {
    file: 'components/modules/ClassroomMode.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Sorteio aleatório de aluno na Roda da Fortuna / Sorteador de sala de aula.'
  },
  {
    file: 'components/modules/FlashcardMode.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Sorteio de alunos para responder pergunta e embaralhamento de baralho de flashcards.'
  },
  {
    file: 'components/modules/FlashcardStudio.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Embaralhamento estocástico de baralhos de flashcards para estudo.'
  },
  {
    file: 'components/modules/StudentExamPlayer.tsx',
    pattern: /Math\.random\(\)|mulberry32|seededShuffle/,
    reason: 'Algoritmo determinístico de Fisher-Yates (seeded) para embaralhar alternativas anti-cola.'
  },
  // 4. Posicionamento de Post-its / Notas Visuais no Canvas
  {
    file: 'components/modules/LessonPlanner.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Deslocamento de coordenadas (x, y) e cor aleatória ao colar novos post-its para não sobrepor exatamente o bloco anterior.'
  },
  {
    file: 'components/RafinhaChat.tsx',
    pattern: /Math\.random\(\)/,
    reason: 'Deslocamento de coordenadas (x, y) de novos post-its gerados pela Rafinha no canvas.'
  },
  // 5. Algoritmos de Repetição Espaçada & Exportação
  {
    file: 'lib/spacingScheduler.ts',
    pattern: /Math\.random\(\)/,
    reason: 'Jitter estocástico para distribuição uniforme no calendário de repetição espaçada (evita clustering).'
  },
  {
    file: 'lib/exportUtils.ts',
    pattern: /Math\.random\(\)/,
    reason: 'Identificadores únicos de elementos exportados para SVG/Canvas.'
  },
  // 6. Funções de Sanitização / Purge de Dados Legados
  {
    file: 'lib/supabaseClient.ts',
    pattern: /purgeMockDataFromStorage|MOCK_NAMES|MOCK_IDS/,
    reason: 'Função de sanitização explícita cujo propósito é limpar e purgar resquícios de dados mock legados do localStorage.'
  }
]

// Diretórios monitorados em produção
const SCAN_DIRECTORIES = ['components', 'lib', 'app']

// Padrões de arquivos excluídos
const IGNORE_FILE_PATTERNS = [
  /__tests__/,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.d\.ts$/,
  /node_modules/,
  /\.next/,
  /dist/,
  /build/
]

// Regras de varredura
const RULES = [
  {
    id: 'MATH_RANDOM',
    severity: 'BLOQUEANTE',
    description: 'Uso de Math.random() fora da lista de exceções legítimas.',
    regex: /\bMath\.random\s*\(\s*\)/g,
    checkException: (file, line) => {
      return LEGITIMATE_EXCEPTIONS.some(exc => {
        const fileMatch = exc.file === 'ALL' || file.replace(/\\/g, '/').includes(exc.file.replace(/\\/g, '/'))
        const patternMatch = typeof exc.pattern === 'string' ? line.includes(exc.pattern) : exc.pattern.test(line)
        return fileMatch && patternMatch
      })
    }
  },
  {
    id: 'MOCK_IDENTIFIER',
    severity: 'BLOQUEANTE',
    description: 'Identificador (variável/função/classe) com nome mock/fake/dummy/stub em código de produção.',
    regex: /\b(const|let|var|function|class|type|interface)\s+([a-zA-Z0-9_]*(mock|fake|dummy|stub)[a-zA-Z0-9_]*)/gi,
    checkException: (file, line) => {
      // Permite palavras em atributos JSX de placeholder de inputs
      return /placeholder\s*=/i.test(line) || LEGITIMATE_EXCEPTIONS.some(exc => file.includes(exc.file))
    }
  },
  {
    id: 'PLACEHOLDER_VARIABLE',
    severity: 'BLOQUEANTE',
    description: 'Variável de dados nomeada como placeholder em vez de tipagem/dado real.',
    regex: /\b(const|let|var)\s+([a-zA-Z0-9_]*placeholder[a-zA-Z0-9_]*(Data|State|List|Array|Object|Value))\b/gi,
    checkException: () => false
  },
  {
    id: 'TEMPORARY_COMMENT',
    severity: 'AVISO',
    description: 'Comentário indicando código temporário, pendência ou mock provisório.',
    regex: /(\/\/|\/\*)\s*.*?\b(TODO|FIXME|mocked for now|temporary|provisório|mock provisório|hardcoded for now)\b/gi,
    checkException: () => false
  }
]

/**
 * Coleta recursiva de arquivos
 */
function collectFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/')

    if (IGNORE_FILE_PATTERNS.some(pat => pat.test(relPath))) {
      continue
    }

    if (entry.isDirectory()) {
      collectFiles(fullPath, fileList)
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      fileList.push(fullPath)
    }
  }

  return fileList
}

/**
 * Executa a varredura
 */
export function runScan() {
  console.log('\x1b[36m%s\x1b[0m', '══════════════════════════════════════════════════════════════════════')
  console.log('\x1b[1m\x1b[36m%s\x1b[0m', ' 🛡️  AUDITORIA ANTI-SIMULAÇÃO (ZERO-SIMULATION AUDIT) — CI CHECK')
  console.log('\x1b[36m%s\x1b[0m', '══════════════════════════════════════════════════════════════════════')
  console.log(` Diretórios: ${SCAN_DIRECTORIES.join(', ')}`)
  console.log(` Exceções documentadas ativas: ${LEGITIMATE_EXCEPTIONS.length}`)
  console.log('──────────────────────────────────────────────────────────────────────\n')

  let filesToScan = []
  for (const dir of SCAN_DIRECTORIES) {
    const absDir = path.join(ROOT_DIR, dir)
    collectFiles(absDir, filesToScan)
  }

  console.log(`🔍 Total de arquivos inspecionados: ${filesToScan.length}\n`)

  const findings = []

  // 2. Varredura linha a linha
  for (const file of filesToScan) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/')
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')

    // Heurística de funções async sem await/fetch/supabase/Promise (AVISO)
    const asyncPattern = /(?:export\s+)?(?:async\s+function\s+([a-zA-Z0-9_]+)|const\s+([a-zA-Z0-9_]+)\s*=\s*async)/g
    let match
    while ((match = asyncPattern.exec(content)) !== null) {
      const fnName = match[1] || match[2] || 'anônima'
      const startIdx = match.index
      const openParenIdx = content.indexOf('(', startIdx)
      if (openParenIdx === -1 || openParenIdx > startIdx + 80) continue

      // Encontra fechamento dos parâmetros ()
      let pDepth = 1
      let closeParenIdx = -1
      for (let i = openParenIdx + 1; i < content.length; i++) {
        if (content[i] === '(') pDepth++
        else if (content[i] === ')') {
          pDepth--
          if (pDepth === 0) {
            closeParenIdx = i
            break
          }
        }
      }
      if (closeParenIdx === -1) continue

      // Encontra a chave de abertura { do corpo da função (após => ou assinatura)
      let openBraceIdx = -1
      let angleDepth = 0
      let inType = false
      for (let i = closeParenIdx + 1; i < content.length && i < closeParenIdx + 300; i++) {
        if (content[i] === '<') angleDepth++
        else if (content[i] === '>') angleDepth = Math.max(0, angleDepth - 1)
        else if (content[i] === '{' && angleDepth === 0) {
          // Verifica se não é parte de um tipo { ... } antes de =>
          const lookahead = content.substring(i, i + 100)
          if (!lookahead.includes('=>') || match[0].includes('async function')) {
            openBraceIdx = i
            break
          }
        }
      }
      if (openBraceIdx === -1) continue

      // Extrai corpo respeitando aninhamento de chaves
      let depth = 1
      let closeBraceIdx = -1
      for (let i = openBraceIdx + 1; i < content.length; i++) {
        if (content[i] === '{') depth++
        else if (content[i] === '}') {
          depth--
          if (depth === 0) {
            closeBraceIdx = i
            break
          }
        }
      }

      if (closeBraceIdx !== -1) {
        const fnBody = content.substring(openBraceIdx + 1, closeBraceIdx)
        const hasAsyncOp = /\b(await|fetch|supabase|Promise|new\s+Promise|executeUnifiedAiCall|callApi|syncToSupabase|loadFromSupabase|signInWithPassword|signUp|resetPasswordForEmail|signOut|exportToPdf|exportToWord|render|download)\b/.test(fnBody)

        if (!hasAsyncOp && fnBody.trim().length > 20 && !fnBody.includes('// noop') && !fnBody.includes('Promise.resolve')) {
          const lineOffset = content.substring(0, startIdx).split('\n').length
          findings.push({
            ruleId: 'ASYNC_WITHOUT_AWAIT',
            severity: 'AVISO',
            description: `Função async '${fnName}' sem await/fetch/supabase no corpo (possível mock/stub síncrono).`,
            file: relPath,
            lineNum: lineOffset,
            lineContent: `async function ${fnName}() { ... }`
          })
        }
      }
    }

    lines.forEach((line, index) => {
      const lineNum = index + 1

      for (const rule of RULES) {
        rule.regex.lastIndex = 0
        if (rule.regex.test(line)) {
          if (rule.checkException && rule.checkException(relPath, line)) {
            // Ignorado por exceção legítima
            continue
          }

          findings.push({
            ruleId: rule.id,
            severity: rule.severity,
            description: rule.description,
            file: relPath,
            lineNum,
            lineContent: line.trim()
          })
        }
      }
    })
  }

  // Relatório formatado
  const blocking = findings.filter(f => f.severity === 'BLOQUEANTE')
  const warnings = findings.filter(f => f.severity === 'AVISO')

  if (findings.length === 0) {
    console.log('\x1b[32m%s\x1b[0m', '✅ [OK] NENHUM PADRÃO DE SIMULAÇÃO ENCONTRADO!')
    console.log('\x1b[32m%s\x1b[0m', '   O código de produção está 100% livre de Math.random() e mocks desautorizados.')
    console.log('──────────────────────────────────────────────────────────────────────\n')
    return { success: true, blockingCount: 0, warningCount: 0 }
  }

  if (blocking.length > 0) {
    console.log('\x1b[31m\x1b[1m%s\x1b[0m', `❌ [FALHA BLOQUEANTE] ${blocking.length} ocorrência(s) de simulação detectada(s):`)
    blocking.forEach((b, i) => {
      console.log(`\n  \x1b[31m[${i + 1}] ${b.ruleId} — ${b.description}\x1b[0m`)
      console.log(`      📁 Arquivo: \x1b[33m${b.file}:${b.lineNum}\x1b[0m`)
      console.log(`      📝 Trecho:  \x1b[90m${b.lineContent}\x1b[0m`)
    })
    console.log('\n──────────────────────────────────────────────────────────────────────')
  }

  if (warnings.length > 0) {
    console.log('\x1b[33m\x1b[1m%s\x1b[0m', `⚠️  [AVISOS NÃO-BLOQUEANTES] ${warnings.length} pendência(s) para revisão:`)
    warnings.forEach((w, i) => {
      console.log(`  [${i + 1}] ${w.ruleId}: \x1b[33m${w.file}:${w.lineNum}\x1b[0m → \x1b[90m${w.lineContent}\x1b[0m`)
    })
    console.log('──────────────────────────────────────────────────────────────────────')
  }

  console.log(`\n📊 Resumo: ${blocking.length} Bloqueantes | ${warnings.length} Avisos`)
  return { success: blocking.length === 0, blockingCount: blocking.length, warningCount: warnings.length }
}

// Execução direta via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runScan()
  if (!result.success) {
    process.exit(1)
  }
}
