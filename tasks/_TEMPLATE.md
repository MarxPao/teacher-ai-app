---
id: "TASK-000"
objetivo: "Descrição clara e verificável do objetivo da tarefa"
criterio_de_aceite: "python -m pytest sidecar/tests/test_exemplo.py -q"
files_allowed:
  - "teacher-extension/modulo_exemplo.js"
  - "__tests__/modulo_exemplo.test.ts"
files_forbidden:
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de: []
modelo_sugerido: "barato" # barato | forte
orcamento:
  max_tokens: 25000
  max_tentativas: 2
  max_minutos: 15
estado: "a_fazer" # a_fazer | em_andamento | em_revisão | aprovada | bloqueada
responsavel: "executor"
---

# Tarefa: TASK-000 — [Título da Tarefa]

## 1. Objetivo
Descreva o que deve ser alcançado em uma única sessão e em um único commit.

## 2. Pacote de Contexto Mínimo
- Arquivos de entrada: listar caminhos necessários para leitura.
- Interfaces e contratos esperados.

## 3. Critério de Aceite (Comando Único)
O portão (`scripts/gate.py`) executará estritamente este comando para validar a tarefa:
```bash
python -m pytest sidecar/tests/test_exemplo.py -q
```

## 4. Restrições de Escopo (S1/S2)
- Só é permitida a alteração dos caminhos listados em `files_allowed`.
- Proibida a modificação de `files_forbidden` ou qualquer arquivo protegido da régua.
