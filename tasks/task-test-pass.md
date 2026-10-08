---
id: "TASK-TEST-PASS"
objetivo: "Tarefa de teste que DEVE passar no gate atendendo todos os critérios (S1-S8)"
criterio_de_aceite: "python -c \"print('Critério de Aceite: Aprovado com sucesso')\""
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
estado: "aprovada"
responsavel: "executor-teste"
---

# Tarefa de Teste: Sucesso Integral no Gate
Esta tarefa simula um agente disciplinado:
- Modifica apenas `teacher-extension/modulo_permitido_teste.js` (listado em `files_allowed`).
- Não inclui segredos nem PII.
- Executa critério de aceite com exit code 0.
- O gate deve validar tudo, registrar métricas no log append-only e alterar estado para `aprovada`.
