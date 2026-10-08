# handoff/etapa-0-requisitos.md — Mapeamento Formal de Requisitos (Etapa 0 - Reforço e Validação)

Este documento aplica a regra `fidelidade-ao-pedido` à Etapa 0, decompondo o pedido de reforço e validação em exigências numeradas (R1 a R12), restrições estritas e status de atendimento com evidências literais.

---

## 1. Decomposição de Requisitos (R1 a R12)

- **R1 (Unificação na Branch Canônica)**: Mover `STATE.md`, `tasks/`, `handoff/`, `scripts/` e `docs/ORQUESTRACAO.md` para a branch canônica de produto (`main`), eliminar duplicatas de `STATE.md` e confirmar que `scratch/` está no `.gitignore`.
- **R2 (gate.py — Zonas Protegidas)**: Proteger contra modificação: `gate.py`, `tasks/*`, `STATE.md` e o próprio `ORCH_AUDIT_DIR`.
- **R2b (gate.py — Leitura do Commit BASE)**: Ler a especificação da tarefa (`tasks/<task>.md`) a partir do commit BASE (`git show base:tasks/...`) e nunca do worktree da tarefa.
- **R2c (gate.py — Hash Travado da Tarefa)**: Exigir hash da tarefa registrado antes da execução (pre-locked task hash via frontmatter ou `--task-hash`).
- **R2d (gate.py — Diff Completo base...HEAD)**: Comparar branch da tarefa com a base (`git diff base...HEAD`), capturando arquivos commitados, renomeados (`R`) e apagados (`D`), além de mudanças pendentes no worktree.
- **R2e (gate.py — Aplicação Estrita de files_allowed)**: Aplicar `files_allowed` com rigor: qualquer arquivo fora de `files_allowed` reprova a tarefa.
- **R3a (Registro de Auditoria Encadeado)**: Encadear criptograficamente cada registro (cada linha contém o hash SHA-256 da anterior).
- **R3b (Verificador de Integridade --verify-log)**: Incluir verificador `gate.py --verify-log` que valida a cadeia do início ao fim e detecta adulterações.
- **R3c (Isolamento de ORCH_AUDIT_DIR e Operador)**: Declarar como mover o diretório de auditoria para fora do alcance do agente e explicitar que o gate é executado exclusivamente pelo supervisor humano (princípio S3).
- **R4 (Bateria Completa de Testes em Worktrees Limpos)**: Executar todos os 9 cenários do gate a partir do SHA final em worktrees isolados e apresentar as saídas brutas literais:
  - T1: Violação de `files_allowed` (arquivo não protegido), já COMMITADA.
  - T2: Arquivo renomeado e apagado.
  - T3: Critério de aceite que falha; critério com timeout.
  - T4: Teste de aceite enfraquecido no mesmo diff.
  - T5: Segredo falso plantado (JWT/chave) e PII falsa (CPF/email).
  - T6: Diff acima do limite permitido (mostrando o limite).
  - T7: `ORCH_AUDIT_DIR` ausente / inexistente em disco.
  - T8: Arquivo `STOP` presente (aborto imediato).
  - T9: Duas tarefas com `files_allowed` sobrepostos (`--check-overlap`).
- **R5 (Governança de Custos de Tokens)**: Não aceitar `--tokens` autodeclarado do agente; documentar a origem real do consumo e gravar `cost_tokens: "NÃO VERIFICADO"` no log.
- **R6 (Apresentação de Código e Git Log)**: Exibir o código-fonte integral de `scripts/gate.py` e o `git log` dos commits.
- **R7 (Restrições)**: Nenhum código de produto; não selecionar tarefas do piloto; parar e aguardar aprovação.

---

## 2. Tabela de Fidelidade ao Pedido

| Req | Status | Evidência (Comando + Saída Bruta / Arquivo:Linha) |
| :--- | :---: | :--- |
| **R1** | **FEITO** | Branch canônica `main` unificada e sincronizada em `hopeful-bell` e `blissful-noether`. Único `STATE.md` na raiz (`STATE.md:1-51`). `scratch/test.txt` confirmado ignorado por `git check-ignore scratch/test.txt`. |
| **R2** | **FEITO** | [`scripts/gate.py:35-46`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L35-L46) e linhas 456-477. Protege `scripts/gate.py`, `tasks/**`, `STATE.md`, `audit/eval/**`, `EVAL_HASHES.txt`, `.env*` e o caminho de `ORCH_AUDIT_DIR`. |
| **R2b** | **FEITO** | [`scripts/gate.py:199-206`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L199-L206) (`read_task_from_git_base` via `git show {base}:{git_path}`). |
| **R2c** | **FEITO** | [`scripts/gate.py:427-439`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L427-L439). Exige e confere hash da tarefa antes de executar; reprova se ausente ou divergente. |
| **R2d** | **FEITO** | [`scripts/gate.py:117-190`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L117-L190). Executa `git diff --name-status {base}...HEAD`, detectando adições, modificações, renomeações (`R`) e exclusões (`D`). |
| **R2e** | **FEITO** | [`scripts/gate.py:480-485`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L480-L485). Aplica estritamente `files_allowed`: qualquer arquivo modificado fora da lista resulta em reprovação imediata. |
| **R3a** | **FEITO** | [`scripts/gate.py:211-245`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L211-L245) (`append_chained_audit_record`). Cada entrada grava `index`, `prev_hash` e seu próprio `hash` SHA-256 canônico. |
| **R3b** | **FEITO** | [`scripts/gate.py:247-289`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L247-L289) (`verify_audit_log`). Validado com log íntegro (exit code 0) e detectando alteração maliciosa na linha 0 (exit code 1). |
| **R3c** | **FEITO** | Documentado: `$env:ORCH_AUDIT_DIR` configurado em pasta de sistema fora do repositório (`C:\Users\rafae\.gemini\orch_audit_secure`). Princípio S3: executado pelo supervisor humano. |
| **R4** | **FEITO** | 11 cenários executados via `scripts/test_gate_all_scenarios.py` em worktrees limpos com saída bruta colada no relatório final. |
| **R5** | **FEITO** | [`scripts/gate.py:575-585`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/gate.py#L575-L585). CLI não aceita `--tokens` e payload grava permanentemente `cost_tokens: "NÃO VERIFICADO"`. |
| **R6** | **FEITO** | Código fonte integral de `scripts/gate.py` (608 linhas) e histórico `git log -n 5` colados no relatório. |
| **R7** | **FEITO** | Zero código de produto alterado. Nenhuma tarefa do piloto selecionada. Parada obrigatória para aprovação. |
