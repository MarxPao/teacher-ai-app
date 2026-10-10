# Checklist de Segurança do Supabase (Fase 0)

Este documento orienta o proprietário do projeto sobre as ações de segurança no painel do Supabase.
**Nenhuma alteração no Supabase foi executada de forma automatizada.**

---

## 1. Verificação de Dados Reais no Supabase

Antes de qualquer alteração nas políticas RLS, verifique se o banco de dados remoto armazena dados reais de alunos, turmas ou notas.

### Consulta para contagem de registros (executar no SQL Editor do Supabase)

```sql
SELECT 
  table_name,
  (xpath('/row/cnt/text()', xml_count))[1]::text::int as approximate_row_count
FROM (
  SELECT 
    table_name,
    table_schema,
    query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '') as xml_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
) t
ORDER BY approximate_row_count DESC;
```

---

## 2. Árvore de Decisão: Quando aplicar o Lockdown RLS

- **Cenário A: O banco NÃO possui dados reais (apenas testes / zero registros)**
  - **Ação recomendada:** Aplicar imediatamente a migração de lockdown no SQL Editor do Supabase:
    - Executar o conteúdo de: `supabase/migrations/20261010120000_fase0_lockdown_rls.sql`
  - **Benefício:** Elimina a vulnerabilidade de exposição pública via API REST com `anonKey`.
  - **Reversão:** Caso necessite desfazer temporariamente durante testes locais, execute:
    - `supabase/migrations/20261010120000_fase0_lockdown_rls_ROLLBACK.sql`

- **Cenário B: O banco POSSUI dados reais de alunos ou professores**
  - **Ação recomendada:** **NÃO aplicar a migração de lockdown de imediato.**
  - **Motivo:** O código cliente atual consome a API do Supabase sem autenticação de usuário na maioria dos fluxos (veja seção 4 abaixo). Bloquear o papel `anon` fará com que o app pare de carregar dados existentes para quem não estiver logado via Supabase Auth.
  - **Passo intermediário necessário:** 
    1. Exportar backup seguro dos dados reais.
    2. Garantir que as leituras no frontend sejam migradas para autenticação via Supabase Auth ou rotas de API server-side antes de revogar `anon`.

---

## 3. Rotação Obrigatória da `service_role` Key

Um token JWT associado a `service_role` foi identificado commitado no histórico do repositório em testes legados (`__tests__/portalSkillsFullFlow.test.ts` e `sidecar/e2e_listener_pipeline_test.py`).

Como o papel `service_role` ignora totalmente as políticas RLS (bypass completo do banco de dados), essa chave deve ser rotacionada:

1. Acesse o painel do Supabase: `https://supabase.com/dashboard/project/<PROJECT_ID>/settings/api`.
2. Role até a seção **Project API keys**.
3. Em **JWT Secret** / **API Keys**, solicite a geração de um novo JWT Secret (**Roll JWT Secret**).
   - *Nota: Rotacionar o JWT Secret invalidará a `anon` key e a `service_role` key antigas simultaneamente.*
4. Atualize o arquivo `.env.local` na máquina de desenvolvimento com as novas chaves.

---

## 4. Mapeamento de Dependências de Leitura Anônima no Código Atual

Ao aplicar o lockdown (`TO authenticated`), as seguintes chamadas no código cliente usando `anonKey` passarão a receber `HTTP 401 Unauthorized` ou `HTTP 403 Forbidden` a menos que o usuário esteja logado via Supabase Auth:

| Arquivo | Tabela | Operação | Impacto se não autenticado |
| :--- | :--- | :--- | :--- |
| `lib/supabaseClient.ts` (L71) | `teacher_sync` | GET / POST | Falha no sync principal se o cliente não tiver sessão ativa |
| `lib/supabaseClient.ts` (L227) | `schools` | GET / POST | Falha na listagem de escolas sem sessão ativa |
| `lib/supabaseClient.ts` (L475) | `classes` | GET / POST | Falha na listagem de turmas |
| `lib/supabaseClient.ts` (L557) | `students` | GET / POST | Falha no carregamento e salvamento de alunos |
| `lib/supabaseClient.ts` (L1011-1017) | `exams`, `questions`, `lessons`, etc. | GET / POST | Falha nas buscas das tabelas pedagógicas auxiliares |
| `lib/vectorSearch.ts` | Chamadas RPC / tabelas | SELECT | Busca vetorial via cliente anônimo falhará |

> **Recomendação de Arquitetura Futura:** Na migração para o app desktop local-first, todas essas operações serão substituídas pelo SQLite local cifrado, tornando o acesso direto do browser ao Supabase desnecessário.
