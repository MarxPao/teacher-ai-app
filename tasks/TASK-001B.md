---
id: "TASK-001B"
objetivo: "Corrigir rigor do resolvedor de polaridade em teacher-extension/attendancePolarity.js: intencoes fail-closed, fonte unica de intencoes, normalizacao de espacos/pontuacao e aprovacao dos 33 casos de teste"
criterio_de_aceite: "python audit/test_polarity_parity.py"
files_allowed:
  - "teacher-extension/attendancePolarity.js"
  - "handoff/handoff-TASK-001B.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de:
  - "TASK-001"
modelo_sugerido: "barato"
orcamento:
  max_tokens: 25000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-polaridade-b"
---

# Tarefa: TASK-001B — Correções de Rigor e Extensão da Suíte de Polaridade de Frequência

## 1. Objetivo
1. Reforçar `teacher-extension/attendancePolarity.js` com tratamento estrito e *fail-closed* para intenções do professor:
   - Aceitar exclusivamente o conjunto fechado de intenções de falta (`'FALTA'`, `'AUSENCIA'`) e de presença (`'PRESENCA'`, `'PRESENTE'`).
   - Normalizar a intenção recebida (remoção de acentos, trim, maiúsculas).
   - Recusar qualquer outro tipo ou valor (`null`, `undefined`, `''`, `123`, `'XYZ'`) retornando `{ canResolve: false, polarity: 'INVALID_INTENT', shouldBeChecked: null, reason: '...' }`.
2. Exportar no módulo a lista de intenções válidas (`VALID_INTENTS`) e a função `parseTeacherIntent`, servindo como fonte única de verdade consumida pelo harness de teste.
3. Normalizar cabeçalhos e rótulos tratando pontuação final/adjacente (ex: `'Presença:'`, `'FALTA?'`), espaços extras e acentuação sem alterar o comportamento dos 11 casos canônicos.
4. Passar com 100% de sucesso nos 33 casos da suíte travada no commit base (`audit/polarity_test_cases.json`).
5. Gerar relatório de handoff detalhado em `handoff/handoff-TASK-001B.md`.

## 2. Critério de Aceite
O portão (`scripts/gate.py`) executará o comando imutável do commit base:
```bash
python audit/test_polarity_parity.py
```
O teste deve validar a existência do contrato de intenções exportadas, a execução dos 33 casos de teste e retornar exit code 0.

## 3. Restrições de Escopo (S1/S2)
- Modificações estritamente restritas a `files_allowed` (`teacher-extension/attendancePolarity.js` e `handoff/handoff-TASK-001B.md`).
- A suíte de 33 casos e o script de teste de aceite em `audit/` pertencem ao commit base e são imutáveis nesta tarefa.
- Proibida alteração de `audit/**`, `scripts/gate.py`, `STATE.md`, `.env*` ou `EVAL_HASHES.txt`.
