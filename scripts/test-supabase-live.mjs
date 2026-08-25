/**
 * test-supabase-live.mjs — Teste de integração contra o Supabase real
 * Verifica se as tabelas browser_automation_tasks e browser_automation_audit_logs
 * existem no banco remoto e se a política de imutabilidade bloqueia UPDATE/DELETE.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM'

async function runLiveAudit() {
  console.log('📡 Testando conexão com Supabase:', SUPABASE_URL)

  // 1. Testa existência da tabela browser_automation_tasks
  console.log('\n[1/3] Verificando existência de browser_automation_tasks...')
  const tasksRes = await fetch(`${SUPABASE_URL}/rest/v1/browser_automation_tasks?select=count`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  })

  console.log(`HTTP Status: ${tasksRes.status} ${tasksRes.statusText}`)
  const tasksData = await tasksRes.json().catch(() => ({}))
  console.log('Resposta:', tasksData)

  // 2. Testa existência da tabela browser_automation_audit_logs
  console.log('\n[2/3] Verificando existência de browser_automation_audit_logs...')
  const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/browser_automation_audit_logs?select=count`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  })

  console.log(`HTTP Status: ${auditRes.status} ${auditRes.statusText}`)
  const auditData = await auditRes.json().catch(() => ({}))
  console.log('Resposta:', auditData)

  // 3. Testa tentativa de UPDATE direto em browser_automation_audit_logs (Imutabilidade)
  console.log('\n[3/3] Testando tentativa de UPDATE em browser_automation_audit_logs (Bloqueio de Imutabilidade)...')
  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/browser_automation_audit_logs?id=eq.00000000-0000-0000-0000-000000000000`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ model_used: 'hacked' })
  })

  console.log(`HTTP Status: ${updateRes.status} ${updateRes.statusText}`)
  const updateData = await updateRes.json().catch(() => ({}))
  console.log('Resposta:', updateData)
}

runLiveAudit()
