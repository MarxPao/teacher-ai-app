/**
 * scratch/setup_activities_table.js — Criação da Tabela 'activities' e RLS no Supabase Postgres
 */

const { Client } = require('pg')

const DB_HOST = 'db.parxakvjvuvsmvbvrshk.supabase.co'
const DB_PORT = 5432
const DB_USER = 'postgres'
const DB_PASS = 'CGC1QWQkSy4M1t9h'
const DB_NAME = 'postgres'

async function setupActivitiesTable() {
  console.log('====================================================================')
  console.log('🛠️ CRIANDO TABELA "activities" NO SUPABASE POSTGRES')
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
    console.log('  ✅ Conectado com sucesso ao Supabase Postgres!')

    // 1. DDL SQL da tabela activities
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS public.activities (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT DEFAULT 'exercise',
        grade TEXT,
        cefr TEXT,
        content TEXT NOT NULL,
        tenant_id TEXT DEFAULT 'default_school',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
    await client.query(createTableQuery)
    console.log('  ✅ Tabela "activities" criada ou já existente!')

    // 2. Habilita RLS
    await client.query(`ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;`)

    // 3. Política de Acesso Total Anon (Allow anon full access on activities)
    const policyQuery = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'Allow anon full access on activities'
        ) THEN
          CREATE POLICY "Allow anon full access on activities" ON public.activities
          FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `
    await client.query(policyQuery)
    console.log('  ✅ Política RLS "Allow anon full access on activities" criada com sucesso!')

    // 4. Verificação final
    const countRes = await client.query(`SELECT COUNT(*) FROM public.activities`)
    console.log(`  ✅ Tabela "activities" pronta com ${countRes.rows[0].count} registros!`)

  } catch (err) {
    console.error('❌ Erro na criação da tabela activities:', err.message)
  } finally {
    await client.end().catch(() => {})
  }
}

setupActivitiesTable()
