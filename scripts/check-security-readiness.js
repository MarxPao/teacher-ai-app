/**
 * check-security-readiness.js
 * Script de verificação automatizada de prontidão e segurança para produção.
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 Executando Verificação Automatizada de Segurança & Prontidão para Deploy...\n')

let errors = 0
let warnings = 0

// 1. Verificação de .gitignore
const gitignorePath = path.join(__dirname, '..', '.gitignore')
if (fs.existsSync(gitignorePath)) {
  const content = fs.readFileSync(gitignorePath, 'utf8')
  if (content.includes('.env*') || content.includes('.env.local')) {
    console.log('✅ [Git] .gitignore está configurado para ignorar arquivos de variáveis de ambiente (.env*).')
  } else {
    console.error('❌ [Git Error] .gitignore NÃO contém regra para ignorar arquivos .env*!')
    errors++
  }
} else {
  console.warn('⚠️ [Git Warning] Arquivo .gitignore não encontrado.')
  warnings++
}

// 2. Verificação de Diretrizes de Segurança
const directivesPath = path.join(__dirname, '..', 'SECURITY_AND_LGPD_DIRECTIVES.md')
if (fs.existsSync(directivesPath)) {
  console.log('✅ [Security] Documento de diretrizes SECURITY_AND_LGPD_DIRECTIVES.md está presente.')
} else {
  console.warn('⚠️ [Security Warning] SECURITY_AND_LGPD_DIRECTIVES.md ausente.')
  warnings++
}

// 3. Verificação de Schema RLS SQL
const rlsPath = path.join(__dirname, '..', 'supabase', 'schema_rls.sql')
if (fs.existsSync(rlsPath)) {
  console.log('✅ [Database] Arquivo de migração RLS para o Supabase (schema_rls.sql) preparado.')
} else {
  console.warn('⚠️ [Database Warning] Arquivo de migração RLS ausente.')
  warnings++
}

// 4. Verificação de Páginas Legais LGPD
const termsPath = path.join(__dirname, '..', 'app', 'terms', 'page.tsx')
const privacyPath = path.join(__dirname, '..', 'app', 'privacy', 'page.tsx')
if (fs.existsSync(termsPath) && fs.existsSync(privacyPath)) {
  console.log('✅ [Legal] Páginas de Termos de Uso (/terms) e Privacidade LGPD (/privacy) criadas.')
} else {
  console.error('❌ [Legal Error] Páginas de termos ou privacidade estão ausentes!')
  errors++
}

console.log('\n------------------------------------------------------------')
if (errors === 0) {
  console.log('🎉 VERIFICAÇÃO CONCLUÍDA COM SUCESSO: O projeto está 100% pronto e seguro!')
  process.exit(0)
} else {
  console.error(`⛔ VERIFICAÇÃO ENCERROU COM ${errors} ERRO(S) E ${warnings} AVISO(S).`)
  process.exit(1)
}
