/**
 * apply-migrations-direct.mjs — Aplica as migrations SQL diretamente no Supabase
 * Utiliza a conexão PostgreSQL direta ou endpoint REST com service_role
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import pg from 'pg'

const { Client } = pg

// String de conexão direta Supabase Postgres (porta 5432 / 6543 pooler)
const DB_HOST = 'aws-0-sa-east-1.pooler.supabase.com'
const DB_USER = 'postgres.parxakvjvuvsmvbvrshk'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function tryRestSqlEndpoint(sql) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      },
      body: JSON.stringify({ query: sql })
    })
    return { ok: res.ok, status: res.status }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function applyMigrations() {
  console.log('🚀 Iniciando aplicação de migrations no Supabase...')

  const migration1Path = join(process.cwd(), 'supabase', 'migrations', '01_auth_profiles_and_rls.sql')
  const migration2Path = join(process.cwd(), 'supabase', 'migrations', '20260822191500_browser_automation.sql')

  const sql1 = readFileSync(migration1Path, 'utf8')
  const sql2 = readFileSync(migration2Path, 'utf8')
  const combinedSql = `${sql1}\n\n${sql2}`

  console.log(`📜 Migration 1: ${sql1.length} bytes`)
  console.log(`📜 Migration 2: ${sql2.length} bytes`)

  const restRes = await tryRestSqlEndpoint(combinedSql)
  console.log('Tentativa via REST RPC exec_sql:', restRes)

  // Testa se as tabelas já foram criadas
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/browser_automation_tasks?select=count`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  })
  console.log(`Status de verificação da tabela: HTTP ${checkRes.status} ${checkRes.statusText}`)
}

applyMigrations()
