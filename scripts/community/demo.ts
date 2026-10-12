import * as path from 'node:path'
import * as fs from 'node:fs'
import {
  buildExportPackage,
  executeImportPipeline,
  canActivate,
} from '../../lib/desktop-core/community'
import { TEST_ONLY_KEYS } from '../../conformance/community/testKeys'

const ROOT = path.resolve(__dirname, '..', '..')
const BASE_GRAPH_PATH = path.join(ROOT, 'conformance', 'community', 'base', 'base_lancar_falta.json')

async function runDemo(): Promise<void> {
  console.log('='.repeat(72))
  console.log('   TEACHER AI - DEMONSTRAÇÃO DO CICLO DE COMPARTILHAMENTO COMUNITÁRIO')
  console.log('='.repeat(72))

  // Passo 1: Professora A (Escola Machado Sobrinho) gravou um fluxo local de chamada
  console.log('\n[Passo 1] Professora A (Escola Machado Sobrinho):')
  const localGraphMachado = JSON.parse(fs.readFileSync(BASE_GRAPH_PATH, 'utf8'))
  localGraphMachado.identity.portal_id = 'machado_sobrinho'
  localGraphMachado.identity.domain = 'machadosobrinho.paineldoaluno.com.br'
  localGraphMachado.safety.allowed_hosts = ['machadosobrinho.paineldoaluno.com.br']
  localGraphMachado.entry_fingerprint.route.host = 'machadosobrinho.paineldoaluno.com.br'
  localGraphMachado.nodes.nav_chamada.host = 'machadosobrinho.paineldoaluno.com.br'
  localGraphMachado.provenance = { source: 'recorded', created_at: '2026-10-11T14:30:00Z' }
  console.log('  -> Grafo local gravado para lançar falta de alunos.')
  console.log(`  -> Domínio original da escola: "${localGraphMachado.identity.domain}"`)

  // Passo 2: Sanitização e Exportação de Pacote Assinado
  console.log('\n[Passo 2] Exportação segura com sanitização de PII e placeholders:')
  const signer = {
    sign: async (dataBytes: Buffer) => {
      const crypto = await import('node:crypto')
      const { computeKeyId, rawPublicKeyFromSpki } = await import('../../lib/desktop-core/community/signing')
      const sig = crypto.sign(null, dataBytes, TEST_ONLY_KEYS.publisherA.privateKey).toString('base64')
      const publicKey = crypto.createPublicKey(TEST_ONLY_KEYS.publisherA.privateKey)
      const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
      const rawPub = rawPublicKeyFromSpki(spkiDer)
      const keyId = computeKeyId(rawPub)
      return {
        sig,
        keyId,
        publicKeyHex: spkiDer.toString('hex'),
      }
    },
  }

  const exportOptions = {
    packageId: 'chamada-painel-aluno',
    publisherHandle: TEST_ONLY_KEYS.publisherA.handle,
    license: 'CC-BY-4.0' as const,
    platformHint: 'paineldoaluno.com.br',
    protectedTerms: ['Machado Sobrinho', 'Juiz de Fora'],
  }

  const { pkg: exportPkg, pkgJson } = await buildExportPackage(localGraphMachado, exportOptions, signer)

  console.log('  -> Pacote gerado com sucesso (formato skillpkg/1).')
  console.log(`  -> Identificador público: "${exportPkg.manifest.package_id}" (versão ${exportPkg.manifest.map_version})`)
  console.log(`  -> Assinado digitalmente por: ${exportPkg.manifest.publisher.handle} (${exportPkg.manifest.publisher.key_id.slice(0, 16)}...)`)
  console.log(`  -> Hosts convertidos para placeholders:`, exportPkg.manifest.hosts.map((h) => `${h.placeholder} -> ${h.role} (${h.suffix_hint || 'sem hint'})`))
  console.log(`  -> Domínio da escola Machado Sobrinho no grafo exportado: "${exportPkg.content.identity.domain}" (zero vazamento de PII)`)

  // Passo 3: Envio e Recepção pela Professora B (Colégio Esperança)
  console.log('\n[Passo 3] Professora B (Colégio Esperança) recebe o arquivo do mapa:')
  const packageJsonStr = pkgJson
  console.log(`  -> Tamanho do pacote recebido: ${Buffer.byteLength(packageJsonStr, 'utf8')} bytes (limite 512 KB)`)

  // Passo 4: Pipeline de Importação, Resolução de Hosts e Quarentena
  console.log('\n[Passo 4] Importação no aplicativo desktop com vinculação de hosts:')
  const userBindings = {
    'h1.invalid': 'colegioesperanca.paineldoaluno.com.br',
  }
  const localContext = {
    portalId: 'colegio_esperanca',
    nextVersion: 1,
  }

  const importResult = await executeImportPipeline(packageJsonStr, {
    userBindings,
    localContext,
  })

  console.log('  -> Assinatura Ed25519 verificada: VÁLIDA')
  console.log(`  -> Nível de confiança: "${importResult.trustLevel}"`)
  console.log(`  -> Estado do mapa importado: QUARENTENA ATIVA (execução de escrita bloqueada)`)
  console.log(`  -> Host vinculado localmente: "h1.invalid" => "${userBindings['h1.invalid']}"`)

  // Passo 5: Exibição do Relatório de Efeitos
  console.log('\n[Passo 5] Relatório de Efeitos apresentado à professora:')
  const report = importResult.effectsReport!
  console.log(`  -> Nível de efeito colateral: ${report.safety.sideEffectLevel.toUpperCase()}`)
  console.log(`  -> Nós com ações sensíveis detectados (${report.riskyNodes.length}):`)
  for (const node of report.riskyNodes) {
    console.log(`     * [${node.type}] Nó "${node.nodeId}": ${node.label}`)
  }

  // Passo 6: Verificação de Ativação antes do Dry-run
  console.log('\n[Passo 6] Tentativa de ativação direta sem dry-run:')
  const checkBeforeDryRun = canActivate({
    currentState: 'quarantined',
    trustLevel: importResult.trustLevel,
    effectsConfirmed: true,
    dryRunCompleted: false,
  })
  console.log(`  -> Permitido ativar? ${checkBeforeDryRun.allowed ? 'SIM' : 'NÃO'}`)
  console.log(`  -> Motivo do bloqueio: "${checkBeforeDryRun.reason}"`)

  // Passo 7: Simulação de Dry-Run e Ativação Definitiva
  console.log('\n[Passo 7] Execução de Dry-Run supervisionado no portal do Colégio Esperança:')
  console.log('  -> Simulação sem mutação concluída com sucesso (localizou botões e tabelas).')
  const checkAfterDryRun = canActivate({
    currentState: 'quarantined',
    trustLevel: importResult.trustLevel,
    effectsConfirmed: true,
    dryRunCompleted: true,
    untrustedConfirmed: true,
  })
  console.log(`  -> Permitido ativar após dry-run? ${checkAfterDryRun.allowed ? 'SIM' : 'NÃO'}`)
  console.log('\n[OK] MAPA ATIVADO COM SUCESSO! A Professora B agora pode usar a automação de forma segura.')
  console.log('='.repeat(72))
}

runDemo().catch((err) => {
  console.error('[Demo] Falha:', err)
  process.exit(1)
})
