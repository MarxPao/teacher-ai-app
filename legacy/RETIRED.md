# legacy/ — Componentes Aposentados

## sidecar/ — Python Sidecar (aposentado em 2026-10)

**Status**: APOSENTADO — código mantido apenas para referência histórica.

### Motivo da aposentadoria (Gap 2 — HANDOFF)
O sidecar Python usava `SUPABASE_SERVICE_ROLE_KEY` para acesso ao banco, o que:
- Bypassa Row-Level Security (RLS), concedendo acesso irrestrito a dados de alunos
- Viola o princípio de menor privilégio (LGPD Art. 46)
- Representa superfície de ataque em caso de comprometimento do processo

### O que foi feito
1. `sidecar/supabase_memory_client.py` — removido `SUPABASE_SERVICE_ROLE_KEY`, agora usa apenas `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. `scripts/ci-check-service-key.sh` — guarda de CI para detectar regressões
3. Funcionalidade migrada para `desktop/mcp/server.ts` (Gap 9) — MCP server stdio read-only

### Não mova arquivos de sidecar/ para cá sem aprovação explícita do responsável de segurança.