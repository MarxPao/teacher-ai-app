#!/usr/bin/env bash
# ci-audit-deps.sh — C5: Gate de vulnerabilidades de dependências
#
# Executa npm audit e falha o CI se houver vulnerabilidades de severidade
# HIGH ou CRITICAL nas dependências de produção.
#
# Uso: bash scripts/ci-audit-deps.sh
# No CI (GitHub Actions): adicionar como step antes do build.
set -euo pipefail

echo "=== C5: Auditoria de dependências (npm audit) ==="
echo ""

# Verifica apenas deps de produção (--omit=dev) com nível HIGH+
# --json para parse estruturado
AUDIT_OUTPUT=$(npm audit --omit=dev --audit-level=high --json 2>&1 || true)

# Extrai contagem de vulnerabilidades HIGH e CRITICAL
HIGH_COUNT=$(echo "$AUDIT_OUTPUT" | grep -o '"high":[0-9]*' | grep -o '[0-9]*' || echo "0")
CRITICAL_COUNT=$(echo "$AUDIT_OUTPUT" | grep -o '"critical":[0-9]*' | grep -o '[0-9]*' || echo "0")

# Fallback: se a saída não for JSON, tenta parsear texto
if [ -z "$HIGH_COUNT" ]; then HIGH_COUNT="0"; fi
if [ -z "$CRITICAL_COUNT" ]; then CRITICAL_COUNT="0"; fi

echo "Vulnerabilidades HIGH: $HIGH_COUNT"
echo "Vulnerabilidades CRITICAL: $CRITICAL_COUNT"
echo ""

if [ "$HIGH_COUNT" -gt "0" ] || [ "$CRITICAL_COUNT" -gt "0" ]; then
  echo "❌ FALHA: Dependências de produção com vulnerabilidades HIGH/CRITICAL."
  echo ""
  echo "Detalhes:"
  # Mostra apenas as vulnerabilidades (não o JSON completo)
  npm audit --omit=dev --audit-level=high 2>&1 | head -60 || true
  echo ""
  echo "Ações:"
  echo "  1. Execute 'npm audit fix' para correções automáticas"
  echo "  2. Adicione 'overrides' no package.json para sub-deps sem fix disponível"
  echo "  3. Se não houver fix, documente em SECURITY.md com justificativa"
  exit 1
fi

echo "✅ OK: Nenhuma vulnerabilidade HIGH/CRITICAL em dependências de produção."
exit 0
