---
id: "TASK-001D"
objetivo: "Aprimoramento de polaridade de frequência (attendancePolarity.js): suporte genérico a superseded_by, decisão formal de negações e duplas negações fail-closed, sinais extras de acessibilidade (aria-label/title) e validação de 65 casos de teste"
criterio_de_aceite: "python audit/test_polarity_parity.py"
files_allowed:
  - "teacher-extension/attendancePolarity.js"
  - "handoff/handoff-TASK-001D.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de:
  - "TASK-001C"
modelo_sugerido: "barato"
orcamento:
  max_tokens: 30000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-polaridade-d"
---

# Tarefa: TASK-001D — Resolução de Pendências de Polaridade, Negações Duplas e Robustez Semântica

## 1. Objetivo
Refinar o módulo `teacher-extension/attendancePolarity.js` e seu harness de teste em conformidade com as deliberações da revisão externa:

### 1.1 Decisão Formal sobre Negações
- **Negações Inequívocas de Presença**: Expressões que afirmam categoricamente a não-presença do estudante ("Não compareceu", "Nao presente", "Not present", "Não veio", "Sem presença", "Não esteve") mantêm a inversão para polaridade de ausência (`NEGATIVE` / `absence`). A marcação do controle representa o registro da falta.
- **Duplas Negações e Expressões Ambíguas (Fail-Closed)**: Expressões como "Não ausente", "Not not present", "Sem falta de presença", bem como "Não faltou", "Sem falta", "Not absent", "No absence" não fornecem polaridade inequívoca em diários escolares e DEVEM ser sumariamente recusadas com `canResolve: false, polarity: 'AMBIGUOUS'`.

### 1.2 Tratamento Genérico de `superseded_by`
- Casos históricos cujo comportamento foi ajustado em novas entradas (ex: `CASE_32` superado por `CASE_34`) recebem o campo `"superseded_by": "CASE_34..."` no JSON.
- O harness em `audit/test_polarity_parity.py` processa esse campo de forma agnóstica e registra o caso como `SUPERSEDED`, não `PASS`.

### 1.3 Sinais Adicionais de Acessibilidade (`aria-label` / `title`)
- Conflito direto entre `aria-label` e `title` sem cabeçalho resulta em `CONFLICT`.
- Valores vazios, nulos ou tipos não-string dentro de `extraSignals` são ignorados defensivamente.
- O objeto vazio `{}` equivale à ausência de sinais extras.

### 1.4 Palavras Compostas e Limites de Palavra
- Garantir que limites de palavra (`\b`) impeçam vazamento de falsos positivos em palavras compostas ou derivadas ('representante', 'ausentismo', 'pre-sente', 'asfaltou').
- O verbo 'faltou' isolado resolve para polaridade de ausência (`NEGATIVE`).

## 2. Critério de Aceite
```bash
python audit/test_polarity_parity.py
```
O teste deve processar todos os 65 casos da suíte (64 casos aprovados e 1 caso registrado como `SUPERSEDED`), retornando exit code 0.

## 3. Restrições de Escopo (S1/S2)
- Modificações na worktree estritamente restritas a `teacher-extension/attendancePolarity.js` e `handoff/handoff-TASK-001D.md`.
- Proibida alteração de `scripts/gate.py`, `STATE.md`, `.env*` ou `EVAL_HASHES.txt`.
