import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { executeImportPipeline } from '../../lib/desktop-core/community/import/pipeline'

const ROOT = path.resolve(__dirname, '..', '..')
const CONF_DIR = path.join(ROOT, 'conformance', 'community')
const OUT_DIR = path.join(CONF_DIR, 'out')
const LOCK_FILE = path.join(CONF_DIR, 'holdout.lock')

function verifyHoldoutLock(): void {
  if (!fs.existsSync(LOCK_FILE)) {
    throw new Error(`[Lock Error] Arquivo holdout.lock não encontrado em ${LOCK_FILE}`)
  }

  const lockContent: Record<string, string> = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'))
  for (const [relPath, expectedSha] of Object.entries(lockContent)) {
    let fullPath = path.join(CONF_DIR, relPath)
    if (relPath === 'scripts/conformance-build.ts') {
      fullPath = path.join(ROOT, 'scripts', 'community', 'conformance-build.ts')
    }
    if (!fs.existsSync(fullPath)) {
      throw new Error(`[Lock Error] Arquivo rastreado ausente: ${relPath}`)
    }
    const fileBytes = fs.readFileSync(fullPath)
    const actualSha = crypto.createHash('sha256').update(fileBytes).digest('hex')
    if (actualSha !== expectedSha) {
      throw new Error(
        `[Lock Tampering Detected] SHA-256 inválido para ${relPath}!\nEsperado: ${expectedSha}\nObtido:   ${actualSha}`
      )
    }
  }
}

async function runConformance(): Promise<void> {
  const args = process.argv.slice(2)
  const includeHoldout = args.includes('--include-holdout')

  console.log('='.repeat(70))
  console.log('   SUÍTE DE CONFORMIDADE COMUNITÁRIA - TEACHER AI (FASE 7)')
  console.log('='.repeat(70))

  // 1. Verificação do Lock
  process.stdout.write('[1/3] Verificando integridade de holdout.lock... ')
  try {
    verifyHoldoutLock()
    console.log('OK (100% íntegro, nenhuma adulteração)')
  } catch (err: any) {
    console.error('FALHA!')
    console.error(err.message)
    process.exit(1)
  }

  // 2. Execução do conjunto DEV
  console.log('\n[2/3] Executando conjunto DEV (12 casos)...')
  const devDir = path.join(CONF_DIR, 'dev')
  const devRecipes = fs.readdirSync(devDir).filter((f) => f.endsWith('.recipe.json')).sort()

  let devPassed = 0
  let devFailed = 0

  for (const recipeFile of devRecipes) {
    const recipe = JSON.parse(fs.readFileSync(path.join(devDir, recipeFile), 'utf8'))
    const pkgPath = path.join(OUT_DIR, 'dev', `${recipe.id}.skillpkg.json`)

    if (!fs.existsSync(pkgPath)) {
      console.error(`  [FAIL] ${recipe.id}: Pacote compilado não encontrado em ${pkgPath}`)
      devFailed++
      continue
    }

    const pkgStr = fs.readFileSync(pkgPath, 'utf8')
    const options: any = {
      userBindings: {
        'h1.invalid': 'escola.paineldoaluno.com.br',
        'h2.invalid': 'login.microsoftonline.com',
      },
      localContext: {
        portalId: 'portal_local_teste',
        nextVersion: 1,
      },
    }

    if (recipe.prior_state?.seen_version) {
      options.seenVersionsStore = {
        getMaxSeenVersion: async () => recipe.prior_state.seen_version,
        recordSeenVersion: async () => {},
      }
    }

    try {
      const res = await executeImportPipeline(pkgStr, options)
      if (recipe.expected === 'accept') {
        console.log(`  [PASS] ${recipe.id} (Aceito com sucesso em quarentena)`)
        devPassed++
      } else {
        console.error(`  [FAIL] ${recipe.id}: Deveria ter sido rejeitado com ${recipe.expected_code}, mas foi aceito!`)
        devFailed++
      }
    } catch (err: any) {
      if (recipe.expected === 'reject' && err.code === recipe.expected_code) {
        console.log(`  [PASS] ${recipe.id} (Rejeitado honestamente com ${err.code})`)
        devPassed++
      } else if (recipe.expected === 'reject') {
        console.error(
          `  [FAIL] ${recipe.id}: Rejeitado com código errado!\n         Esperado: ${recipe.expected_code}\n         Obtido:   ${err.code}`
        )
        devFailed++
      } else {
        console.error(`  [FAIL] ${recipe.id}: Deveria ter sido aceito, mas falhou com ${err.code || err.message}`)
        devFailed++
      }
    }
  }

  console.log(`\nResultado DEV: ${devPassed} aprovados, ${devFailed} falhas.`)

  // 3. Execução do HOLDOUT (apenas se --include-holdout foi passado pelo auditor)
  if (includeHoldout) {
    console.log('\n[3/3] Executando conjunto HOLDOUT (20 casos - MODO AUDITOR)...')
    const holdoutDir = path.join(CONF_DIR, 'holdout')
    const holdoutRecipes = fs.readdirSync(holdoutDir).filter((f) => f.endsWith('.recipe.json')).sort()

    let holdoutPassed = 0
    let holdoutFailed = 0

    for (const recipeFile of holdoutRecipes) {
      const recipe = JSON.parse(fs.readFileSync(path.join(holdoutDir, recipeFile), 'utf8'))
      const pkgPath = path.join(OUT_DIR, 'holdout', `${recipe.id}.skillpkg.json`)

      if (!fs.existsSync(pkgPath)) {
        console.error(`  [FAIL] ${recipe.id}: Pacote compilado não encontrado em ${pkgPath}`)
        holdoutFailed++
        continue
      }

      const pkgStr = fs.readFileSync(pkgPath, 'utf8')
      const options: any = {
        userBindings: {
          'h1.invalid': 'escola.paineldoaluno.com.br',
          'h2.invalid': 'login.microsoftonline.com',
        },
        localContext: {
          portalId: 'portal_local_teste',
          nextVersion: 1,
        },
      }

      if (recipe.prior_state?.seen_version) {
        options.seenVersionsStore = {
          getMaxSeenVersion: async () => recipe.prior_state.seen_version,
          recordSeenVersion: async () => {},
        }
      }

      try {
        const res = await executeImportPipeline(pkgStr, options)
        if (recipe.expected === 'accept') {
          console.log(`  [PASS] ${recipe.id} (Aceito com sucesso em quarentena)`)
          holdoutPassed++
        } else {
          console.error(`  [FAIL] ${recipe.id}: Deveria ter sido rejeitado com ${recipe.expected_code}, mas foi aceito!`)
          holdoutFailed++
        }
      } catch (err: any) {
        if (recipe.expected === 'reject' && err.code === recipe.expected_code) {
          console.log(`  [PASS] ${recipe.id} (Rejeitado honestamente com ${err.code})`)
          holdoutPassed++
        } else if (recipe.expected === 'reject') {
          console.error(
            `  [FAIL] ${recipe.id}: Rejeitado com código errado!\n         Esperado: ${recipe.expected_code}\n         Obtido:   ${err.code}`
          )
          holdoutFailed++
        } else {
          console.error(`  [FAIL] ${recipe.id}: Deveria ter sido aceito, mas falhou com ${err.code || err.message}`)
          holdoutFailed++
        }
      }
    }

    console.log(`\nResultado HOLDOUT: ${holdoutPassed} aprovados, ${holdoutFailed} falhas.`)
    if (holdoutFailed > 0) process.exit(1)
  } else {
    console.log('\n[3/3] HOLDOUT não executado pelo agente (reservado para auditoria no GATE A).')
  }

  if (devFailed > 0) {
    process.exit(1)
  }
}

runConformance().catch((err) => {
  console.error('[Conformance Run] Erro fatal:', err)
  process.exit(1)
})
