# Inventário de PII e Dados de Estudantes no Supabase Cloud

> **Status da Auditoria:** Concluída em 21/10/2026  
> **Diretriz Regulatória:** LGPD (Lei 13.709/2018) & Arquitetura de Dois Trilhos (GEMINI.md)  
> **Regra de Ouro (Trilho 1):** Nomes completos, CPFs, matrículas, notas individuais, observações comportamentais, fotos e contatos familiares NUNCA devem residir em bancos ou APIs em nuvem (Supabase Cloud). O armazenamento é de responsabilidade estrita do cofre SQLite local cifrado no dispositivo docente.

---

## 1. Mapeamento de Pontos de Contato com a Nuvem (Fim a Fim)

| Arquivo : Linha | O que Envia / Lê | Contém PII? | Status Atual | Ação Necessária |
| :--- | :--- | :---: | :---: | :--- |
| `app/api/students/route.ts:21-43` | GET/POST/DELETE `/rest/v1/students` | **SIM** (Nome, notas, matrícula, NEE) | **BLOQUEADO** (403 fail-closed `E_STUDENT_PII_CLOUD_DISABLED`) | Nenhuma (bloqueio ativo e coberto por testes unitários). |
| `app/api/students/import/route.ts:13-30` | POST `/rest/v1/students` e criação de turma | **SIM** (Roster completo do portal escolar) | **BLOQUEADO** (403 fail-closed `E_STUDENT_PII_CLOUD_DISABLED`) | Nenhuma (bloqueio ativo no commit `ef249b7`). |
| `app/api/portal/roster-sync/route.ts:14-30` | POST reconciliação de roster de portal | **SIM** (Matrículas e nomes raspados) | **BLOQUEADO** (403 fail-closed `E_STUDENT_PII_CLOUD_DISABLED`) | Nenhuma (bloqueio ativo no commit `ef249b7`). |
| `app/api/students/write-through/route.ts:21-31` | POST `/rest/v1/students` e `portal_execution_logs` | **SIM** (Diff de notas e nomes de alunos) | **BLOQUEADO** (403 fail-closed `E_STUDENT_PII_CLOUD_DISABLED`) | Migrar cliente UI (`PortalApprovalCard.tsx`) para o cofre local Desktop (Tarefa 3). |
| `lib/supabaseClient.ts:54-87` | `syncToSupabase` enviando linhas para `teacher_sync` | **SIM** (Serializações JSON de alunos) | **BLOQUEADO** (Expurgo forçado de `teacher_students`, `teacher_private_students`, etc.) | Remover blocos de código morto `if (false as boolean)` (Tarefa 4a). |
| `lib/supabaseClient.ts:137-148` | `syncToSupabase` -> `upsertRelational('students', ...)` | **SIM** (Campos relacionais de alunos) | **BLOQUEADO** (Desativado no commit `81c5ae4`) | Limpeza definitiva do bloco morto (Tarefa 4a). |
| `lib/supabaseClient.ts:191-212` | `syncToSupabase` -> `upsertRelational('private_students', ...)` | **SIM** (Alunos particulares, responsáveis, telefones) | **BLOQUEADO** (Desativado no commit `81c5ae4`) | Limpeza definitiva do bloco morto (Tarefa 4a). |
| `lib/supabaseClient.ts:258-268` | `loadFromSupabase` lendo de `teacher_sync` | **SIM** (Restauração de alunos remotos) | **BLOQUEADO** (Ignora chaves de alunos ao restaurar localStorage) | Nenhuma. |
| `lib/supabaseClient.ts:500-547` | `fetchPrivateStudentsFromSupabase` lendo `/rest/v1/private_students` | **SIM** (Lista de alunos particulares) | **BLOQUEADO** (Retorna `[]` imediatamente sem fetch) | Remover código inalcançável residual (Tarefa 4a). |
| `lib/supabaseClient.ts:552-603` | `upsertPrivateStudentToSupabase` enviando `/rest/v1/private_students` | **SIM** (Dados cadastrais e financeiros de tutorados) | **BLOQUEADO** (Retorna erro LGPD fail-closed sem fetch) | Remover código inalcançável residual (Tarefa 4a). |
| `lib/supabaseClient.ts:614-629` | `deletePrivateStudentFromSupabase` enviando DELETE | **SIM** (Exclusão remota) | **BLOQUEADO** (Retorna `true` local sem fetch) | Remover código inalcançável residual (Tarefa 4a). |
| `lib/supabaseClient.ts:1052-1070` | `fetchSupabaseInsightsData` consultando `students` e `private_students` | **SIM** (Busca alunos para o painel de insights) | **ABERTO** (Ainda emite fetch para `/rest/v1/students` e `/rest/v1/private_students`) | **AÇÃO CRÍTICA:** Remover as duas chamadas da `Promise.all` e alimentar insights exclusivamente com dados locais. |
| `lib/supabaseClient.ts:1220-1249` | `savePedagogicalInsightToSupabase` -> `/rest/v1/pedagogical_insights` | **NÃO** (Apenas agregações de turma: média geral, contagem de risco e tópicos) | **SEGURO** (Não se aplica) | Manter apenas métricas agregadas anônimas. |
| `lib/supabaseClient.ts:1385-1425` | `savePortalExecutionLogToSupabase` -> `/rest/v1/portal_execution_logs` | **POTENCIAL** (Se `extracted_data` contiver `writeItems` com nomes) | **PARCIAL** (Pode receber diff com nomes se chamado) | Garantir higienização estrita de `extracted_data` (zero PII) antes do envio. |
| `lib/supabaseClient.ts:1430-1460` | `saveScrapedDataToSupabase` -> `/rest/v1/portal_scraped_data` | **SIM** (Se `dataType === 'roster'` armazena alunos do portal) | **ABERTO** (Função não bloqueada no cliente) | Bloquear fail-closed quando `dataType` for 'roster' ou 'students'. |
| `lib/supabaseClient.ts:2041-2095` | `fetchStudentsFromSupabase` lendo `/rest/v1/students` | **SIM** (Consulta lista de alunos na nuvem) | **BLOQUEADO** (Retorna `[]` fail-closed sem fetch) | Remover código inalcançável residual (Tarefa 4a). |
| `lib/supabaseClient.ts:2099-2182` | `upsertStudentToSupabase` e `saveStudentToSupabase` | **SIM** (Envio de cadastro, notas e métricas) | **BLOQUEADO** (Retorna erro LGPD fail-closed sem fetch) | Nenhuma. |
| `lib/supabaseClient.ts:2184-2199` | `deleteStudentFromSupabase` | **SIM** (ID de aluno para exclusão na nuvem) | **BLOQUEADO** (Retorna `true` local sem fetch) | Nenhuma. |
| `lib/supabaseClient.ts:2201-2228` | `saveStudentMetricsToSupabase` enviando PATCH | **SIM** (Score psicométrico individual) | **BLOQUEADO** (Retorna `false` local sem fetch) | Nenhuma. |
| `components/PortalApprovalCard.tsx:62-72` | `handleApprove` chamando `/api/students/write-through` | **SIM** (Envia diff com nomes e notas) | **INCOERENTE** (Chama endpoint que agora retorna 403) | **AÇÃO DA TAREFA 3:** Desviar para IPC do cofre local (`NodeSqliteDriver`) e zero fetch. |
| `components/modules/ApiManager.tsx:209` | `syncNow` sincronizando `KEYS` com Supabase | **SIM** (Lista continha `'teacher_students'`) | **BLOQUEADO** (Chave removida e expurgo forçado no cliente) | Nenhuma (concluído na Rodada R3). |
| `sidecar/browser_harness_runner.py:930-945` | `automation-screenshots` e `browser_automation_audit_logs` | **SIM** (Screenshots de portais escolares e diffs) | **LOCAL-FIRST** (`supabase_client=None` nos fluxos do desktop) | Assegurar que `supabase_client` permaneça desativado no runner local. |

---

## 2. Resumo Quantitativo do Inventário

- **Total de pontos auditados:** 22 locais de envio/leitura.
- **Pontos com PII identificada:** 19 locais.
- **Pontos já bloqueados/desativados (Trilho 1):** 16 locais.
- **Pontos que necessitam de intervenção imediata nesta rodada (R4):**
  1. `lib/supabaseClient.ts:1055-1056` em `fetchSupabaseInsightsData` (remover fetch de `students` e `private_students`).
  2. `components/PortalApprovalCard.tsx` (desviar fluxo de gravação para o cofre SQLite local).
  3. `lib/supabaseClient.ts:1430` em `saveScrapedDataToSupabase` (bloqueio fail-closed de rosters).
  4. Código inalcançável residual e blocos mortos em `lib/supabaseClient.ts`.
