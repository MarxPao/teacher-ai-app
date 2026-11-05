#!/usr/bin/env bash
# ci-check-service-key.sh — Gap 2 regression guard
# Garante que SUPABASE_SERVICE_ROLE_KEY nunca re-entre no codebase.
# Executar no CI antes do build.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Gap 2: Verificando ausência de SERVICE_ROLE_KEY no código ==="

# Busca em todos os arquivos rastreados pelo git, excluindo legacy/
MATCHES=$(git -C "$REPO_ROOT" grep -l "SUPABASE_SERVICE_ROLE_KEY" \
  -- ':!legacy/**' ':!*.md' ':!*.txt' 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "❌ FALHA: SUPABASE_SERVICE_ROLE_KEY encontrado nos arquivos:"
  echo "$MATCHES"
  echo ""
  echo "A chave service_role concede acesso irrestrito ao banco (bypassa RLS)."
  echo "Remova todas as ocorrências e use apenas NEXT_PUBLIC_SUPABASE_ANON_KEY."
  exit 1
fi

echo "✅ OK: Nenhuma referência a SUPABASE_SERVICE_ROLE_KEY encontrada fora de legacy/."
exit 0