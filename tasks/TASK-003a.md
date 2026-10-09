---
id: "TASK-003a"
objetivo: "Endurecer SafeWriter contra novas formas de ocultacao (Escopo 1) e honeypots estruturais (Escopo 2)"
criterio_de_aceite: "node audit/test_safewriter_hardening_a.js"
files_allowed:
  - "teacher-extension/safeWriter.js"
  - "handoff/handoff-TASK-003a.md"
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
task_hash_locked: "cc9903e082bc63bb031c1324f6f87d1c930e21e127f9ce88381710c08cbb1bb5"
---

# Tarefa: TASK-003a — Endurecimento do SafeWriter (Ocultação e Honeypots Estruturais)

## 1. Objetivo
Endurecer o módulo canônico client-side `teacher-extension/safeWriter.js` para cobrir lacunas de visibilidade e detecção de honeypots sem quebrar a compatibilidade com os casos aprovados na TASK-002:
1. Novas formas de ocultação (transform scale(0), clip-path nulo, font-size: 0, pointer-events: none, oclusão por elementFromPoint, ancestral oculto, position + translate offscreen).
2. Honeypots estruturais (tabindex="-1" oculto, autocomplete="off" fora de linhas de aluno, inputs duplicados com mesmo name na mesma linha).

## 2. Requisitos de Implementação

### 2.1. Novas Formas de Ocultação (`isElementVisible`)
- Rejeitar elementos com `transform` contendo `scale(0)`, `scaleX(0)` ou `scaleY(0)`.
- Rejeitar elementos com `clip-path` com área nula (`inset(100%)`, `circle(0)`, `polygon()` vazio/nulo). O controle `inset(0%)` deve ser aceito.
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

## 3. Critério de Aceite
A suíte travada no commit base deve ser executada com 100% de sucesso (17/17 casos aprovados):
```bash
node audit/test_safewriter_hardening_a.js
```
A suíte original da TASK-002 deve continuar com 100% de sucesso (20/20 casos aprovados):
```bash
node audit/test_safewriter.js
```
