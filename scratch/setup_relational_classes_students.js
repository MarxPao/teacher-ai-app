/**
 * scratch/setup_relational_classes_students.js — Configuração de Tabelas Relacionais 'classes' e 'students' no Supabase Postgres
 */

const { Client } = require('pg')

const DB_HOST = 'db.parxakvjvuvsmvbvrshk.supabase.co'
const DB_PORT = 5432
const DB_USER = 'postgres'
const DB_PASS = 'CGC1QWQkSy4M1t9h'
const DB_NAME = 'postgres'

async function setupRelationalTables() {
  console.log('====================================================================')
  console.log('🛠️ CONFIGURANDO E INTEGRANDO TABELAS RELACIONAIS "classes" E "students"')
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

    // 1. Tabela public.classes
    console.log('  🔹 Garantindo tabela public.classes...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        school_id TEXT,
        grade TEXT,
        year TEXT,
        tenant_id TEXT DEFAULT 'default_school',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    // 2. Tabela public.students com colunas class_id e class_name
    console.log('  🔹 Garantindo tabela public.students com relacional class_id e class_name...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.students (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        class_id TEXT,
        class_name TEXT,
        school_id TEXT,
        grades JSONB DEFAULT '{}'::jsonb,
        metrics JSONB DEFAULT '{}'::jsonb,
        tenant_id TEXT DEFAULT 'default_school',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    // Garantir colunas class_id e class_name caso a tabela já existisse sem elas
    await client.query(`
      ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_id TEXT;
      ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_name TEXT;
      ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id TEXT;
      ALTER TABLE public.students ADD COLUMN IF NOT EXISTS grades JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE public.students ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb;
    `)

    // 3. Habilita RLS em ambas
    await client.query(`ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;`)
    await client.query(`ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;`)

    // 4. Políticas RLS
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'classes' AND policyname = 'Allow anon full access on classes'
        ) THEN
          CREATE POLICY "Allow anon full access on classes" ON public.classes FOR ALL USING (true) WITH CHECK (true);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'Allow anon full access on students'
        ) THEN
          CREATE POLICY "Allow anon full access on students" ON public.students FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `)

    console.log('  ✅ Políticas RLS "Allow anon full access" ativadas!')

    // 5. Verificação de contagem
    const classesRes = await client.query(`SELECT COUNT(*) FROM public.classes`)
    const studentsRes = await client.query(`SELECT COUNT(*) FROM public.students`)
    console.log(`  ✅ Tabela "classes": ${classesRes.rows[0].count} registros`)
    console.log(`  ✅ Tabela "students": ${studentsRes.rows[0].count} registros com vínculo relacional`)

    console.log('\n====================================================================')
    console.log('🎉 TABELAS "classes" E "students" CONFIGURADAS COM SUCESSO!')
    console.log('====================================================================')

  } catch (err) {
    console.error('❌ Erro durante a configuração:', err.message)
  } finally {
    await client.end().catch(() => {})
  }
}

setupRelationalTables()
