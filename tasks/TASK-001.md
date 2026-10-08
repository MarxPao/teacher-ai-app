---
id: "TASK-001"
objetivo: "Consolidar o resolvedor de polaridade de frequência no modulo oficial attendancePolarity.js, avaliar os 11 casos contra o hotfix, relatar divergencias e isolar duplicatas"
criterio_de_aceite: "python audit/test_polarity_parity.py"
files_allowed:
  - "teacher-extension/attendancePolarity.js"
  - "handoff/handoff-TASK-001.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de: []
modelo_sugerido: "barato"
orcamento:
  max_tokens: 25000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-polaridade"
---

# Tarefa: TASK-001 — Unificação e Avaliação do Resolvedor de Polaridade de Frequência

## 1. Objetivo
1. Trazer o módulo canônico do hotfix `c377471` para `teacher-extension/attendancePolarity.js`.
2. Avaliar os 11 casos de teste canônicos (`audit/polarity_test_cases.json`) contra a lógica de resolução.
3. Garantir que conflitos entre cabeçalho e rótulo (ex: Cabeçalho 'Presença' vs Rótulo 'Marcar Falta') e cabeçalhos ambíguos ('P/F', 'Status') resultem em recusa segura (*fail-closed* / `can_resolve: false`).
4. Passar no executor de paridade pré-existente e imutável `audit/test_polarity_parity.py` com 11/11 casos aprovados.
5. Registrar em `handoff/handoff-TASK-001.md` a tabela comparativa de onde divergiam e a justificativa da consolidação em um resolvedor único.

## 2. Critério de Aceite
O comando do critério de aceite executado pelo portão (`scripts/gate.py`) deve retornar código 0:
```bash
python audit/test_polarity_parity.py
```

## 3. Restrições de Escopo (S1/S2)
- Modificações estritamente restritas a `files_allowed` (`teacher-extension/attendancePolarity.js` e `handoff/handoff-TASK-001.md`).
- O teste de aceite em `audit/` é imutável e pertence ao commit base.
- Nenhuma alteração permitida em `audit/**`, `EVAL_HASHES.txt`, `scripts/gate.py` ou `.env*`.
