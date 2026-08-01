/**
 * scratch/check_supabase_policies.js — Inspeção de Tabelas, RLS e Políticas de Acesso no Supabase
 */

const { Client } = require('C:\\Users\\rafae\\.gemini\\antigravity\\scratch\\teacher-ai\\node_modules\\pg')

const DB_HOST = 'db.parxakvjvuvsmvbvrshk.supabase.co'
const DB_PORT = 5432
const DB_USER = 'postgres'
const DB_PASS = 'CGC1QWQkSy4M1t9h'
const DB_NAME = 'postgres'

async function checkPolicies() {
  console.log('====================================================================')
  console.log('🔍 AUDITORIA DE TABELAS & POLÍTICAS RLS NO SUPABASE')
  console.log('====================================================================\n')

  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  try {
    await client.connect()

    // 1. Verifica estado de RLS de todas as tabelas public
    const rlsQuery = `
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `
    const rlsRes = await client.query(rlsQuery)
    console.log('📌 STATUS DE RLS (ROW LEVEL SECURITY) NAS TABELAS:')
    rlsRes.rows.forEach(r => {
      console.log(`  • Tabela "${r.tablename}": RLS ${r.rowsecurity ? 'ATIVO (Protegido)' : 'DESATIVADO (Acesso Livre)'}`)
    })

    console.log('\n📌 POLÍTICAS DE ACESSO (POLICIES) EXISTENTES:')
    const policyQuery = `
      SELECT tablename, policyname, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `
    const polRes = await client.query(policyQuery)
    if (polRes.rows.length === 0) {
      console.log('  ⚠️ Nenhuma política customizada cadastrada (tabelas sem RLS ou acesso padrão).')
    } else {
      polRes.rows.forEach(p => {
        console.log(`  • [${p.tablename}] Policy "${p.policyname}" -> Comando: ${p.cmd} | Roles: ${p.roles}`)
      })
    }

  } catch (err) {
    console.error('❌ Erro ao auditar políticas:', err.message)
  } finally {
    await client.end().catch(() => {})
  }
}

checkPolicies()
