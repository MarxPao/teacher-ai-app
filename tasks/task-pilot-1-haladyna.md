---
id: task-pilot-1-haladyna
objetivo: Adicionar funcao pura detectRedundantNegatives em lib/haladynaLinter.ts com testes unitarios em __tests__/haladynaRedundantNegative.test.ts
criterio_de_aceite: npx vitest run __tests__/haladynaRedundantNegative.test.ts
files_allowed:
  - lib/haladynaLinter.ts
  - __tests__/haladynaRedundantNegative.test.ts
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
estado: a_fazer
responsavel: orquestrador
task_hash_locked: 64a52d822696823224627376d1af6d9e8670ffb158c3e05e123d251ed98f9c81
---
# Tarefa Piloto 1: Linter Haladyna - Deteccao de Negativas Redundantes
