---
id: "TASK-003"
objetivo: "Endurecer o modulo cliente deterministico SafeWriter (teacher-extension/safeWriter.js) contra novas formas de ocultacao, honeypots estruturais e amarracao estrita por tokens"
criterio_de_aceite: "node audit/test_safewriter_hardening.js"
files_allowed:
  - "teacher-extension/safeWriter.js"
  - "handoff/handoff-TASK-003.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de:
  - "TASK-002"
modelo_sugerido: "barato"
orcamento:
  max_tokens: 30000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-safewriter"
task_hash_locked: "9cc9ffb2c14ffd6c291d545123c9b32cada47f00421e6f9547d7644fadf7168a"
---

# Tarefa: TASK-003 — Endurecimento do SafeWriter (Lacunas Pós-TASK-002)

## 1. Objetivo
Endurecer o módulo canônico client-side `teacher-extension/safeWriter.js` para cobrir lacunas de robustez sem quebrar a compatibilidade com os casos aprovados na TASK-002:
1. Novas formas de ocultação (transform scale(0), clip-path nulo, font-size: 0, pointer-events: none, oclusão por elementFromPoint, ancestral oculto, position + translate offscreen).
2. Honeypots estruturais (tabindex="-1" oculto, autocomplete="off" fora de linhas de aluno, inputs duplicados com mesmo name na mesma linha).
3. Amarração aluno x linha por TOKENS inteiros (sem substring parcial), detecção honesta de homônimos na mesma tabela/grid, rejeição de nomes parciais unívocos insuficientes, e suporte completo a acentuação e tabelas aninhadas.

## 2. Requisitos de Implementação

### 2.1. Novas Formas de Ocultação (`isElementVisible`)
- Rejeitar elementos com `transform` contendo `scale(0)`, `scaleX(0)` ou `scaleY(0)`.
- Rejeitar elementos com `clip-path` com área nula (`inset(100%)`, `circle(0)`, `polygon()` vazio/nulo).
- Rejeitar elementos de controle de texto com `font-size: 0` ou `font-size: 0px`.
- Rejeitar elementos com `pointer-events: none`.
- Rejeitar elementos cobertos/oclusos usando verificação de ponto (`elementFromPoint` no centro geométrico do elemento).
- Rejeitar elementos cujo ancestral na árvore DOM possua `display: none`, `visibility: hidden/collapse` ou `opacity: 0`.
- Rejeitar elementos deslocados para fora do viewport por combinação de `position` e `transform` (ex: `translate(-9999px)`).
- Retornar `{ canWrite: false, reason: 'ELEMENT_NOT_VISIBLE' }` para todos os casos acima.

### 2.2. Honeypots Estruturais (`isHoneypot`)
- Detectar armadilhas com `tabindex="-1"` em campos ocultos ou estilizados para engano.
- Detectar armadilhas com `autocomplete="off"` posicionadas fora de containers de linha de aluno (`tr`, `[role="row"]`).
- Detectar inputs duplicados com o mesmo `name` na mesma linha de aluno (`tr`).
- Documentar no código que nomes heurísticos são secundários e sinais estruturais são primários.
- Retornar `{ canWrite: false, reason: 'HONEYPOT_DETECTED' }`.

### 2.3. Amarração Relacional Aluno x Linha por Tokens (`validateStudentRowTarget`)
- Casamento de tokens estrito: `expectedStudentName` deve coincidir por palavras completas (`\b`), impedindo que "Ana" case com "Mariana" ou "Joana".
- Homônimos: se mais de uma linha na mesma tabela possuir o mesmo nome normalizado, rejeitar com `{ canWrite: false, reason: 'AMBIGUOUS_HOMONYM' }`.
- Nome parcial (apenas um token, ex: "Pedro"): rejeitar com `{ canWrite: false, reason: 'AMBIGUOUS_PARTIAL_NAME' }`.
- Tratamento robusto de acentuação (NFKD), maiúsculas/minúsculas, preposições, hífens e apóstrofos.
- Tabelas aninhadas: localizar estritamente o container `tr` ou `[role="row"]` mais próximo (`closest`).

## 3. Critério de Aceite
A suíte travada no commit base deve ser executada com 100% de sucesso (25/25 casos aprovados):
```bash
node audit/test_safewriter_hardening.js
```
A suíte original da TASK-002 deve continuar com 100% de sucesso (20/20 casos aprovados):
```bash
node audit/test_safewriter.js
```
