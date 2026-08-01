/**
 * scratch/setup_rubrics_table.js — Criação da Tabela 'rubrics_and_answer_keys' no Supabase Postgres
 */

const { Client } = require('pg')

const DB_HOST = 'db.parxakvjvuvsmvbvrshk.supabase.co'
const DB_PORT = 5432
const DB_USER = 'postgres'
const DB_PASS = 'CGC1QWQkSy4M1t9h'
const DB_NAME = 'postgres'

async function setupRubricsTable() {
  console.log('====================================================================')
  console.log('🛠️ CRIANDO TABELA "rubrics_and_answer_keys" NO SUPABASE POSTGRES')
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

    // 1. DDL SQL da tabela rubrics_and_answer_keys
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS public.rubrics_and_answer_keys (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT DEFAULT 'rubric',
        grade TEXT,
        criteria JSONB DEFAULT '[]'::jsonb,
        content TEXT NOT NULL,
        tenant_id TEXT DEFAULT 'default_school',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
    await client.query(createTableQuery)
    console.log('  ✅ Tabela "rubrics_and_answer_keys" criada ou já existente!')

    // 2. Habilita RLS
    await client.query(`ALTER TABLE public.rubrics_and_answer_keys ENABLE ROW LEVEL SECURITY;`)

    // 3. Política de Acesso Total Anon (Allow anon full access on rubrics_and_answer_keys)
    const policyQuery = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'rubrics_and_answer_keys' AND policyname = 'Allow anon full access on rubrics_and_answer_keys'
        ) THEN
          CREATE POLICY "Allow anon full access on rubrics_and_answer_keys" ON public.rubrics_and_answer_keys
          FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `
    await client.query(policyQuery)
    console.log('  ✅ Política RLS "Allow anon full access on rubrics_and_answer_keys" criada com sucesso!')

    // 4. Verificação final
    const countRes = await client.query(`SELECT COUNT(*) FROM public.rubrics_and_answer_keys`)
    console.log(`  ✅ Tabela "rubrics_and_answer_keys" pronta com ${countRes.rows[0].count} registros!`)

  } catch (err) {
    console.error('❌ Erro na criação da tabela rubrics_and_answer_keys:', err.message)
  } finally {
    await client.end().catch(() => {})
  }
}

setupRubricsTable()
