# Guia de Orquestração de Agentes — Teacher AI

Este documento estabelece o modelo operacional para governança, controle de custo e garantia de qualidade do Teacher AI com agentes autônomos supervisionados.

---

## 1. Papéis e Roteamento de Modelos

| Papel | Modelo | Atribuição Estrita |
| :--- | :---: | :--- |
| **Planejador** | Forte (Pro) | Decompõe marcos em tarefas atômicas (`tasks/<id>.md`) com `files_allowed` disjuntos e critério de aceite pré-definido. **Não escreve código.** |
| **Executor** | Barato (Flash) / Forte (Pro)* | Implementa uma tarefa em worktree isolada (`scripts/worktree.py`). Segue TDD (teste vermelho antes do código), commit único e redige `handoff/handoff-<id>.md`. (*Forte apenas para arquitetura/risco). |
| **Revisor Independente** | Forte (Pro) | Sessão isolada sem histórico do executor. Audita o diff, confere robustez dos testes, caça regressões, segredos e violações de escopo. |
| **Orquestrador** | Forte (Pro) | Mantém `STATE.md`, coordena paralelismo (máx. 3 tarefas), invoca o `scripts/gate.py` e escala pendências para o usuário. |

---

## 2. Regras Inegociáveis (S1 a S8)

- **S1. Escopo Estrito**: Leitura e escrita permitidas estritamente nos caminhos listados em `files_allowed`. Qualquer outro caminho é violação imediata.
- **S2. Zonas Proibidas**: Proibido alterar `.env*`, segredos, a régua de avaliação (`audit/eval/`, `EVAL_HASHES.txt`), `scripts/gate.py` ou testes de aceite da própria tarefa. Proibido embutir chaves de API ou PII.
- **S3. Quem Produz Não Aprova**: A aprovação é exclusiva do `scripts/gate.py` e do Revisor Independente. Agentes nunca alteram o estado da tarefa para "aprovada".
- **S4. Comunicação Estruturada**: Interação exclusivamente através do repositório (`STATE.md`, `tasks/`, `handoff/`). Sem murais ou canais paralelos.
- **S5. Dados e Ações Irreversíveis**: Proibido usar dados reais de alunos. Ações destrutivas requerem autorização expressa do usuário.
- **S6. Parada por Violação de Escopo**: Se um agente identificar necessidade de arquivo fora de `files_allowed`, deve parar imediatamente e registrar `handoff/blocked-<id>.md`.
- **S7. Parada de Emergência (`STOP`)**: Se o arquivo `STOP` existir na raiz, todos os agentes encerram imediatamente o trabalho atual e registram o estado.
- **S8. Sem Concluído sem Evidência**: Nenhuma tarefa é aceita sem saída bruta de terminal, contagem de testes, `git diff --stat` e código de saída literal.

---

## 3. Fluxo Operacional da Tarefa

```
[Planejador] -> Cria tasks/<id>.md com critério de aceite e files_allowed
     ↓
[Orquestrador] -> Cria worktree via `scripts/worktree.py create <id>`
     ↓
[Executor] -> Implementa (Teste Vermelho -> Código -> Teste Verde -> handoff/)
     ↓
[Revisor] -> Sessão independente audita diff e valida testes
     ↓
[Portão Determinístico] -> Executa `scripts/gate.py tasks/<id>.md`
                           - Verifica files_allowed e ausência de files_forbidden
                           - Varre segredos e PII
                           - Roda critério de aceite com timeout
                           - Grava log append-only em $ORCH_AUDIT_DIR
                           - Atualiza estado da tarefa para 'aprovada'
     ↓
[Orquestrador] -> Realiza merge na branch canônica e limpa a worktree
```
