---
id: task-pilot-3-class
objetivo: Adicionar funcao pura calculateGradeDispersion em lib/classUtils.ts
criterio_de_aceite: npx vitest run __tests__/classUtilsDispersion.test.ts
files_allowed:
  - lib/classUtils.ts
files_forbidden:
  - scripts/gate.py
  - tasks/**
  - STATE.md
  - audit/eval/**
  - EVAL_HASHES.txt
depende_de: []
modelo_sugerido: barato
orcamento:
  max_tokens: 15000
  max_tentativas: 2
  max_minutos: 5
estado: aprovada
responsavel: orquestrador
task_hash_locked: 90bc6f7900cbce73841c704fede08de090558fedeb0652549396a379ee714721
---
# Tarefa Piloto 3: Utilitarios de Turma - Dispersao Estatistica de Notas
