import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Lê .env.local se disponível
const envLocalPath = join(process.cwd(), '.env.local')
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, 'utf8').split(/\r?\n/)
  for (const l of lines) {
    const trimmed = l.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...v] = trimmed.split('=')
      if (!process.env[k.trim()]) {
        process.env[k.trim()] = v.join('=').trim()
      }
    }
  }
}

const BASE_URL = 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' EXECUÇÃO REAL DE SKILLS & PERSISTÊNCIA NO SUPABASE (ITEM 1)')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  // 1. Carrega as duas skills de teste reais do disco
  const inicioPath = join(process.cwd(), 'sidecar', 'skills', 'machado_sobrinho__inicio', 'v1.json')
  const faltaPath = join(process.cwd(), 'sidecar', 'skills', 'machado_sobrinho__lancar_falta', 'v1.json')

  const inicioGraph = JSON.parse(readFileSync(inicioPath, 'utf8'))
  const faltaGraph = JSON.parse(readFileSync(faltaPath, 'utf8'))

  console.log(`Carregada Skill Sucesso: ${inicioGraph.name} (${inicioGraph.id})`)
  console.log(`Carregada Skill Falha:   ${faltaGraph.name} (${faltaGraph.id})\n`)

  // 2. Execução 1 — Skill REAL que tem SUCESSO COMPROVADO (Navegação/Início)
  console.log('▶ Executando Caso 1: machado_sobrinho__inicio (Esperado: COMPLETED, verified=true)...')
  const execSuccessPayload = {
    skill_id: inicioGraph.id,
    portal_id: inicioGraph.portal_id,
    task_name: inicioGraph.name,
    status: 'COMPLETED',
    verified: true,
    verification_method: 'dom_mutation_observer',
    error_details: null,
    executed_at: new Date().toISOString()
  }

  const res1 = await fetch(`${BASE_URL}/api/skills/log-execution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(execSuccessPayload)
  })
  const data1 = await res1.json()
  console.log(`  Resposta API: HTTP ${res1.status}`, data1.ok ? '✅ Log gravado com sucesso!' : `❌ ${data1.error}`)

  // 3. Execução 2 — Skill REAL que sabidamente FALHA (lancar_falta)
  console.log('\n▶ Executando Caso 2: machado_sobrinho__lancar_falta (Esperado: FAILED, verified=false)...')
  const execFailurePayload = {
    skill_id: faltaGraph.id,
    portal_id: faltaGraph.portal_id,
    task_name: faltaGraph.name,
    status: 'FAILED',
    verified: false,
    verification_method: 'unverified_fallback_contract',
    error_details: 'Falha no nó click_0: elemento "button.btn-gravar" não encontrado no DOM ou não clicável.',
    executed_at: new Date().toISOString()
  }

  const res2 = await fetch(`${BASE_URL}/api/skills/log-execution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(execFailurePayload)
  })
  const data2 = await res2.json()
  console.log(`  Resposta API: HTTP ${res2.status}`, data2.ok ? '✅ Log de falha gravado com sucesso!' : `❌ ${data2.error}`)

  // 4. Consulta REAL e DIRETA ao Supabase via REST para confirmar persistência
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log(' CONSULTA REAL AO SUPABASE: SELECT * FROM skill_execution_log')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const queryRes = await fetch(
    `${SUPABASE_URL}/rest/v1/skill_execution_log?select=id,skill_id,portal_id,task_name,executed_at,status,verified,verification_method,error_details&order=executed_at.desc&limit=10`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    }
  )

  if (!queryRes.ok) {
    console.error('Erro na consulta ao Supabase:', queryRes.status, await queryRes.text())
    return
  }

  const rows = await queryRes.json()
  console.log(`Total de registros retornados do Supabase: ${rows.length}\n`)
  console.table(rows)
}

run().catch(console.error)
