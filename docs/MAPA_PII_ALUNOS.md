# 🗺️ Mapa Único e Reconciliado de Fluxos de PII Discente (Tarefa Z0)

Este documento mapeia, com base em evidência literal do repositório, todos os pontos do código que transmitem ou manipulavam dados de alunos (PII) em direção à rede ou Supabase Cloud.

---

## 1. Funções de `lib/supabaseClient.ts` que Tocam Dados de Alunos

Abaixo estão todas as funções em `lib/supabaseClient.ts` que manipulam tabelas de estudantes (`students`, `private_students`, `metrics`), com seus respectivos chamadores mapeados por `arquivo:linha`:

| Função em `lib/supabaseClient.ts` | Linha | Tabela / Escopo | Chamadores Reais no Codebase (`arquivo:linha`) |
| :--- | :---: | :--- | :--- |
| **`syncToSupabase`** | L48 | Sincronização agregada (`teacher_sync`, `schools`, `classes`, etc.) | • [`app/page.tsx:280`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/page.tsx#L280)<br>• [`components/modules/ApiManager.tsx:214`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/ApiManager.tsx#L214)<br>• [`components/modules/AttendanceList.tsx:475`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/AttendanceList.tsx#L475)<br>• [`components/modules/Eventos.tsx:214`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Eventos.tsx#L214)<br>• [`components/modules/Organization.tsx:131`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Organization.tsx#L131)<br>• [`components/modules/PrivateTutoring.tsx:337, 348, 355`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/PrivateTutoring.tsx#L337)<br>• [`components/modules/Repository.tsx:813, 850, 986, 1014, 1057, 1082, 1167, 1276`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Repository.tsx#L813)<br>• [`components/modules/Students.tsx:322`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Students.tsx#L322)<br>• [`components/modules/WeeklyAgenda.tsx:156, 169, 180`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/WeeklyAgenda.tsx#L156) |
| **`loadFromSupabase`** | L243 | Leitura do `teacher_sync` para `localStorage` | • [`app/page.tsx:254`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/page.tsx#L254)<br>• [`components/modules/ApiManager.tsx:222`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/ApiManager.tsx#L222)<br>• [`components/modules/WeeklyAgenda.tsx:128`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/WeeklyAgenda.tsx#L128) |
| **`fetchPrivateStudentsFromSupabase`** | L500 | `private_students` (Alunos particulares) | • [`components/modules/PrivateTutoring.tsx:262`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/PrivateTutoring.tsx#L262) |
| **`upsertPrivateStudentToSupabase`** | L552 | `private_students` (Nome, responsável, telefone, e-mail, mensalidade) | • [`components/modules/PrivateTutoring.tsx:340`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/PrivateTutoring.tsx#L340) |
| **`deletePrivateStudentFromSupabase`** | L614 | `private_students` | • [`components/modules/PrivateTutoring.tsx:647`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/PrivateTutoring.tsx#L647) |
| **`fetchStudentsFromSupabase`** | L2045 | `students` (Turma regular: nome, matrícula, notas, métricas) | • [`components/modules/Students.tsx:292, 323`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Students.tsx#L292) |
| **`saveStudentToSupabase`** | L2103 | `students` (Alias de inserção) | • Nenhum chamador ativo (declarado para compatibilidade de testes) |
| **`upsertStudentToSupabase`** | L2110 | `students` (Nome, matrícula, notas, métricas, nee_flag) | • [`components/modules/Students.tsx:545, 589`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Students.tsx#L545) |
| **`deleteStudentFromSupabase`** | L2188 | `students` | • [`components/modules/Students.tsx:564`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Students.tsx#L564) |
| **`saveStudentMetricsToSupabase`** | L2210 | `students.metrics` (Métricas psicométricas e acadêmicas) | • [`components/modules/Students.tsx:604`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/Students.tsx#L604) |

---

## 2. Rotas de API HTTP Next.js

| Rota | Arquivo de Definição | Status Atual de Segurança | Chamadores no Codebase |
| :--- | :--- | :--- | :--- |
| **`POST /api/students/write-through`** | [`app/api/students/write-through/route.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/students/write-through/route.ts) | **Vulnerável**: Envia nome, notas e matrícula para `${supabaseUrl}/rest/v1/students` e registra em `portal_execution_logs`. | • [`components/PortalApprovalCard.tsx:62`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/PortalApprovalCard.tsx#L62) ao professor aprovar tarefas de lançamento no portal. |
| **`POST /api/students/import`** | [`app/api/students/import/route.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/students/import/route.ts) | **Vulnerável**: Cria turmas e insere lista nominal de alunos em `${supabaseUrl}/rest/v1/students`. | • *Nenhum chamador em código de produção*; coberto apenas em [`__tests__/studentsPortalImport.test.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/__tests__/studentsPortalImport.test.ts). |
| **`POST /api/portal/roster-sync`** | [`app/api/portal/roster-sync/route.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/portal/roster-sync/route.ts) | **Vulnerável**: Reconcilia e grava alunos em `${supabaseUrl}/rest/v1/students`. | • *Nenhum chamador em código de produção* (rota legada de sync). |
| **`GET, POST, DELETE /api/students`** | [`app/api/students/route.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/students/route.ts) | **Bloqueada (Fail-Closed)**: Retorna HTTP 403 `E_STUDENT_PII_CLOUD_DISABLED`. | • Testada e validada em [`__tests__/studentsPiiCloudBlock.test.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/__tests__/studentsPiiCloudBlock.test.ts). |

---

## 3. URLs e Chaves Supabase Fixas / Embutidas

A varredura exaustiva por strings JWT (`eyJ...`) e URLs do projeto revelou:

1. **URL Fixa Hardcoded (`https://parxakvjvuvsmvbvrshk.supabase.co`)**:
   - Encontrada como fallback em:
     - [`app/api/students/write-through/route.ts:71`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/students/write-through/route.ts#L71)
     - [`app/api/classes/route.ts:27`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/classes/route.ts#L27)
     - [`app/api/portals/status/route.ts:78`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/portals/status/route.ts#L78)
     - [`app/api/skills/route.ts:91, 243, 405`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/skills/route.ts#L91)
     - [`app/api/skills/execute/route.ts:30`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/skills/execute/route.ts#L30)
     - [`app/api/skills/log-execution/route.ts:38, 101`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/skills/log-execution/route.ts#L38)
     - [`app/api/skills/recipes/execute/route.ts:34`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/skills/recipes/execute/route.ts#L34)
     - [`app/api/skills/record/route.ts:365`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/skills/record/route.ts#L365)
     - [`lib/browserAutomationClient.ts:68`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/browserAutomationClient.ts#L68)
     - [`lib/databaseConsent.ts:65`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/databaseConsent.ts#L65)
     - [`lib/supabaseAuth.ts:66`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/supabaseAuth.ts#L66)
     - [`lib/skills/recipeEngine.ts:286, 328`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/skills/recipeEngine.ts#L286)

2. **Chave JWT Pública (Anon Key) Hardcoded**:
   - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM`
   - Encontrada em:
     - [`lib/browserAutomationClient.ts:69`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/browserAutomationClient.ts#L69)
     - [`lib/supabaseAuth.ts:67`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/supabaseAuth.ts#L67)
   > **Ação recomendada para a dona:** Essa chave anon pública está embutida no histórico do código e deve ser **rotacionada no painel do Supabase**, garantindo que nenhuma credencial estática permaneça válida.

---

## 4. Tabela de Log Realmente Utilizada

- A tabela utilizada pelas rotas de execução e write-through é **`portal_execution_logs`** ([`app/api/students/write-through/route.ts:269`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/app/api/students/write-through/route.ts#L269) e [`lib/supabaseClient.ts:1398`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/supabaseClient.ts#L1398)).
- A tabela `audit_logs` **não** é uma tabela de nuvem: ela pertence exclusivamente ao cofre SQLite local cifrado do Desktop Core ([`lib/desktop-core/db/repositories/SqlAuditRepository.ts`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/desktop-core/db/repositories/SqlAuditRepository.ts)).
- Há ainda a tabela `browser_automation_audit_logs` utilizada pontualmente por [`lib/browserAutomationClient.ts:397, 459`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/browserAutomationClient.ts#L397).

---

## 5. Motivo da Divergência nos Relatórios F3 Anteriores

A divergência entre relatórios anteriores decorreu de dois fatores objetivos:
1. **Escopo Restrito de Busca na Extensão:** A auditoria inicial buscou chamadas a `students/write-through` estritamente dentro da pasta `teacher-extension/` e dos scripts Python do `sidecar/`. Nesses caminhos, realmente **não há nenhuma chamada** direta. A chamada existia no componente React [`components/PortalApprovalCard.tsx:62`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/PortalApprovalCard.tsx#L62), que é a interface do usuário do Next.js responsável por renderizar a aprovação da tarefa enviada pela extensão.
2. **Rotas Legadas Não Utilizadas (`students/import` e `portal/roster-sync`):** Ambas as rotas foram criadas durante a Fase de Protótipo e mantidas no diretório `app/api/`, mas **nenhum componente da aplicação as consome em tempo de execução**. A ausência de chamadores para essas duas rotas levou inicialmente à generalização incorreta de que todo o subsistema de import/write-through estava inativo.
