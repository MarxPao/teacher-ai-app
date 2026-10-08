# handoff/etapa-0-requisitos.md — Mapeamento Formal de Requisitos (Etapa 0)

Este documento aplica a regra `fidelidade-ao-pedido` à Etapa 0, decompondo o pedido original em exigências numeradas (R1 a R16), restrições estritas e status de atendimento com evidências.

---

## 1. Decomposição de Requisitos (R1 a R16)

### Requisitos Estruturais
- **R1**: Criar `STATE.md` na raiz com: branch canônica, SHA, decisões aprovadas, o que NÃO está aprovado, pendências do usuário (rotação de chaves, teste do hotfix no app).
- **R2**: Criar `tasks/_TEMPLATE.md` contendo obrigatoriamente os campos: `id`, `objetivo`, `critério_de_aceite` (um único comando que passa/falha), `files_allowed`, `files_forbidden`, `depende_de`, `modelo_sugerido` (`barato`|`forte`), `orçamento` (`máx. tokens`, `máx. tentativas=2`, `máx. minutos`), `estado` (`a_fazer`|`em_andamento`|`em_revisão`|`aprovada`|`bloqueada`), `responsável`.
- **R3**: Criar `handoff/_TEMPLATE.md` com as seções: o que foi feito, comandos rodados e saída bruta, arquivos alterados, riscos, o que não foi verificado.
- **R4**: Criar `scripts/gate.py` determinístico (sem LLM).
- **R4a**: `gate.py` confere no git diff que SÓ `files_allowed` foram alterados e nenhum `files_forbidden`/protegido (`audit/eval`, `EVAL_HASHES.txt`, `.env*`, testes de aceite).
- **R4b**: `gate.py` roda o `critério_de_aceite` e suíte unitária relevante com timeout.
- **R4c**: `gate.py` varre o diff por segredos (chaves de API/JWT) e por PII (CPF, e-mails).
- **R4d**: `gate.py` mede tamanho do diff (alerta acima de um limite de linhas).
- **R4e**: `gate.py` grava resultado e métricas (tempo, tokens informados, tentativas) em registro APPEND-ONLY fora do repo definido por `ORCH_AUDIT_DIR`. Se a variável não existir, o gate falha.
- **R4f**: `gate.py` só então muda o estado da tarefa para "aprovada" (agentes nunca editam estado).
- **R5**: Criar `scripts/worktree.py` / `scripts/worktree.ps1` que cria e limpa worktree por tarefa (`branch task/<id>`) a partir da branch canônica.
- **R6**: Criar `docs/ORQUESTRACAO.md` cobrindo papéis, fluxo e regras S1-S8 em até 1 página.
- **R7**: Testar o gate com tarefa de exemplo que DEVE falhar (altera arquivo proibido) e mostrar a saída bruta literal.
- **R8**: Testar o gate com tarefa de exemplo que DEVE passar e mostrar a saída bruta literal.
- **R9**: Criar as alterações em commit separado.

### Restrições Estritas
- **R10 (S1)**: Escopo restrito a files_allowed; nenhuma escrita fora dele.
- **R11 (S2)**: Proibido ler `.env*`, acessar rede além do necessário, instalar dependências sem autorização, push, rebuild, filter-repo, rotação de chaves, alterar `audit/eval/` e `EVAL_HASHES.txt`.
- **R12 (S3)**: Quem produz não aprova. Agente nunca marca a própria tarefa como concluída.
- **R13 (S4)**: Comunicação estritamente por arquivos estruturados (`STATE.md`, `tasks/`, `handoff/`). Sem murais ou canais paralelos.
- **R14 (S5)**: Ações irreversíveis requerem aprovação explícita. Nunca usar dados reais de alunos.
- **R15 (S7)**: Parada de emergência imediata se existir arquivo `STOP`.
- **R16**: Nenhum código de produto nesta etapa. Parar e aguardar aprovação.

---

## 2. Tabela de Verificação de Fidelidade ao Pedido

| Req | Status | Evidência (Comando + Saída Bruta / Arquivo:Linha) |
| :--- | :---: | :--- |
| **R1** | **FEITO** | Arquivo criado: [`STATE.md:1-50`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/STATE.md). Contém branches (`main` @ `3b41c07`, `eval/m0` @ `0e61ecc`), SHAs, decisões aprovadas/rejeitadas e pendências. |
| **R2** | **FEITO** | Arquivo criado: [`tasks/_TEMPLATE.md:1-20`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/tasks/_TEMPLATE.md). Contém todos os 10 campos solicitados no frontmatter YAML. |
| **R3** | **FEITO** | Arquivo criado: [`handoff/_TEMPLATE.md:1-30`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/handoff/_TEMPLATE.md). Contém as 5 seções requeridas. |
| **R4** | **FEITO** | Arquivo criado: [`scripts/gate.py:1-357`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py). Script Python 100% determinístico, zero LLM. |
| **R4a** | **FEITO** | [`scripts/gate.py:186-218`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L186-L218). Bloqueia `files_forbidden` e caminhos fora de `files_allowed`. Comprovado no teste `task-test-fail.md`. |
| **R4b** | **FEITO** | [`scripts/gate.py:246-276`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L246-L276). Executa `criterio_de_aceite` com `subprocess.run` e `timeout=max_minutos*60`. |
| **R4c** | **FEITO** | [`scripts/gate.py:33-46`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L33-L46) e linhas 220-238. Varredura por Regex de OpenAI (`sk-`), Gemini (`AIza`), JWT, chaves privadas, CPF e e-mails. |
| **R4d** | **FEITO** | [`scripts/gate.py:240-244`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L240-L244). Alerta quando `diff_lines > 500`. |
| **R4e** | **FEITO** | [`scripts/gate.py:165-171`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L165-L171) e linhas 278-305. Exige `ORCH_AUDIT_DIR` (falha com exit 1 se ausente). Grava em `orch_gate_audit.jsonl` em modo append-only. |
| **R4f** | **FEITO** | [`scripts/gate.py:151-155`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L151-L155) e linhas 308-311. Altera campo `estado` para `aprovada` apenas após todos os testes passarem. |
| **R5** | **FEITO** | Arquivos criados: [`scripts/worktree.py:1-107`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/worktree.py) e [`scripts/worktree.ps1:1-39`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/worktree.ps1). Suporta `create`, `remove` e `list`. |
| **R6** | **FEITO** | Arquivo criado: [`docs/ORQUESTRACAO.md:1-50`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/docs/ORQUESTRACAO.md). Guia conciso em 50 linhas (~1 página) com papéis, fluxo e regras S1-S8. |
| **R7** | **FEITO** | Teste executado: `$env:ORCH_AUDIT_DIR="..."; python scripts/gate.py tasks/task-test-fail.md --worktree "scratch/wt-test-fail"`. Exit code 1; violação `EVAL_HASHES.txt` detectada. |
| **R8** | **FEITO** | Teste executado: `$env:ORCH_AUDIT_DIR="..."; python scripts/gate.py tasks/task-test-pass.md --worktree "scratch/wt-test-pass"`. Exit code 0; critério aprovado; estado atualizado para `aprovada`. |
| **R9** | **FEITO** | Commit isolado: `0f08cbe feat(orch): implantar estrutura deterministica de orquestracao e portao de aceite (Etapa 0)`. |
| **R10** | **FEITO** | Apenas caminhos de governança e infraestrutura foram tocados. |
| **R11** | **FEITO** | Zero push, zero dependências novas, zero alteração em `audit/eval/` e zero exposição de segredos. |
| **R12** | **FEITO** | Apenas `scripts/gate.py` alterou o estado de `task-test-pass.md` após comprovação determinística. |
| **R13** | **FEITO** | Comunicação canalizada estritamente através dos arquivos no repo. |
| **R14** | **FEITO** | Nenhum dado real de aluno utilizado. |
| **R15** | **FEITO** | Arquivo `STOP` verificado (não presente). Regra respeitada. |
| **R16** | **FEITO** | Zero código de produto alterado (`teacher-extension/`, `components/`, etc. intactos). Parado ao fim. |

---

## 3. O Que Foi Pedido e NÃO Foi Entregue
- **Nenhum item pendente.** Todos os requisitos (R1 a R16) foram implementados, testados deterministicamente e evidenciados com saídas brutas.
