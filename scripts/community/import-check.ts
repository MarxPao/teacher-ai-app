import * as fs from 'node:fs'
import * as path from 'node:path'
import { executeImportPipeline, formatFingerprint } from '../../lib/desktop-core/community'

const ROOT = path.resolve(__dirname, '..', '..')

async function runImportCheck(): Promise<void> {
  const targetArg = process.argv[2]
  let pkgPath = targetArg

  if (!pkgPath) {
    pkgPath = path.join(ROOT, 'conformance', 'community', 'out', 'dev', 'dev_01_legit_read_roster.skillpkg.json')
    console.log(`[import-check] Nenhum arquivo especificado. Inspecionando pacote de exemplo:\n              ${pkgPath}\n`)
  } else {
    pkgPath = path.resolve(process.cwd(), pkgPath)
  }

  if (!fs.existsSync(pkgPath)) {
    console.error(`[import-check] Arquivo não encontrado: ${pkgPath}`)
    process.exit(1)
  }

  const rawBytes = fs.readFileSync(pkgPath)
  console.log('='.repeat(70))
  console.log('   INSPEÇÃO SEGURA DE PACOTE COMUNITÁRIO (.skillpkg.json)')
  console.log('='.repeat(70))
  console.log(`Arquivo: ${path.basename(pkgPath)} (${rawBytes.length} bytes)\n`)

  try {
    // Executa pipeline de inspeção sem vincular hosts locais (inspeção prévia)
    const result = await executeImportPipeline(rawBytes)

    const { manifest, signature } = result.package
    console.log('[1] METADADOS DO PACOTE')
    console.log(`    ID do Pacote:     ${manifest.package_id}`)
    console.log(`    Versão do Mapa:   ${manifest.map_version}`)
    console.log(`    Spec Version:     ${manifest.spec_version}`)
    console.log(`    Licença:          ${manifest.license}`)
    console.log(`    Plataforma:       ${manifest.platform_hint || '(não especificada)'}`)
    console.log(`    Criado em:        ${manifest.created_at}`)

    console.log('\n[2] AUTORIA E ASSINATURA DIGITAL (Ed25519)')
    console.log(`    Autor Declarado:  ${manifest.publisher.handle}`)
    console.log(`    Chave ID:         ${formatFingerprint(manifest.publisher.key_id)}`)
    console.log(`    Status da Assin.: VÁLIDA E ÍNTEGRA`)
    console.log(`    Nível de Conf.:   ${result.trustLevel.toUpperCase()}`)

    console.log('\n[3] MARCADORES DE HOST EXIGIDOS')
    for (const h of manifest.hosts) {
      console.log(`    * Marcador: ${h.placeholder}`)
      console.log(`      Papel:    ${h.role}`)
      if (h.suffix_hint) console.log(`      Sufixo:   *.${h.suffix_hint}`)
    }

    console.log('\n[4] ANÁLISE DE SEGURANÇA E EFEITOS (Grafo)')
    const nodesCount = Object.keys(result.package.content.nodes || {}).length
    console.log(`    Total de Nós:     ${nodesCount}`)
    console.log(`    Nível de Efeito:  ${result.package.content.safety.side_effect_level?.toUpperCase() || 'READ'}`)
    console.log(`    Checkpoint Obrig: ${result.package.content.safety.writes_require_checkpoint ? 'SIM' : 'NÃO'}`)
    console.log(`    Quarentena:       OBRIGATÓRIA ATÉ APROVAÇÃO HUMANA E DRY-RUN`)

    console.log('\n[RESULTADO] Pacote íntegro e seguro para revisão da professora!')
    console.log('='.repeat(70))
  } catch (err: any) {
    console.error('\n[RESULTADO] PACOTE REJEITADO PELA INSPEÇÃO!')
    console.error(`Código de Erro: [${err.code || 'ERRO_DESCONHECIDO'}]`)
    console.error(`Mensagem:       ${err.message}`)
    console.log('='.repeat(70))
    process.exit(1)
  }
}

runImportCheck().catch((err) => {
  console.error('[import-check] Erro fatal:', err)
  process.exit(1)
})
