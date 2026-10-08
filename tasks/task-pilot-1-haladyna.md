---
id: task-pilot-1-haladyna
objetivo: Adicionar funcao pura detectRedundantNegatives em lib/haladynaLinter.ts
criterio_de_aceite: npx vitest run __tests__/haladynaRedundantNegative.test.ts
files_allowed:
  - lib/haladynaLinter.ts
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
task_hash_locked: cc5d9a91e2886b542106a3bd4d6d00e89a73df56052cbdc3fa4ca7d0ede6a00d
---
# Tarefa Piloto 1: Linter Haladyna - Deteccao de Negativas Redundantes
