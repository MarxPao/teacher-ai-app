---
id: "TASK-TEST-TIMEOUT"
objetivo: "Tarefa com criterio de aceite que excede o tempo limite (timeout)"
criterio_de_aceite: "python -c \"import time; time.sleep(10)\""
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
  max_minutos: 0.05
estado: "em_revisão"
responsavel: "executor-teste"
---

# Tarefa de Teste: Critério de Aceite com Timeout
Esta tarefa serve para testar a rejeição do gate quando o comando de critério de aceite excede o orçamento de tempo configurado.
