---
id: task-pilot-2-school
objetivo: Adicionar funcoes puras formatInepCode e isValidInepCode em lib/schoolUtils.ts com testes unitarios em __tests__/schoolUtilsInep.test.ts
criterio_de_aceite: npx vitest run __tests__/schoolUtilsInep.test.ts
files_allowed:
  - lib/schoolUtils.ts
  - __tests__/schoolUtilsInep.test.ts
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
task_hash_locked: ad4285afb737fe0937c155db5fa431550577331c498ff149c182e37ccd4723a8
---
# Tarefa Piloto 2: Utilitarios de Escola - Validacao e Formatacao de INEP
