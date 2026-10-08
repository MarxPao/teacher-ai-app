---
id: "TASK-TEST-CRIT-FAIL"
objetivo: "Tarefa com criterio de aceite que falha intencionalmente"
criterio_de_aceite: "python -c \"import sys; sys.stderr.write('Erro de teste intencional'); sys.exit(42)\""
files_allowed:
  - "teacher-extension/modulo_permitido_teste.js"
files_forbidden:
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
depende_de: []
modelo_sugerido: "barato"
orcamento:
  max_tokens: 10000
  max_tentativas: 2
  max_minutos: 5
estado: "em_revisão"
responsavel: "executor-teste"
---

# Tarefa de Teste: Critério de Aceite que Falha
Esta tarefa serve para testar a rejeição do gate quando o comando de critério de aceite retorna exit code diferente de zero.
