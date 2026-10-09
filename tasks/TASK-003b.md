---
id: "TASK-003b"
objetivo: "Endurecer SafeWriter com amarracao aluno-linha estrita por tokens, deteccao de homonimos e nomes parciais (Escopo 3)"
criterio_de_aceite: "node audit/test_safewriter_hardening.js"
files_allowed:
  - "teacher-extension/safeWriter.js"
  - "handoff/handoff-TASK-003b.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de:
  - "TASK-003a"
modelo_sugerido: "barato"
orcamento:
  max_tokens: 30000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-safewriter"
task_hash_locked: "eb69df5bbe70407a1cbb619a9c47bf7a171a8d7f9a15d06c40ce7c9ac5be6adc"
---

# Tarefa: TASK-003b — Endurecimento do SafeWriter (Tokens, Homônimos e Desambiguação)

## 1. Objetivo
Completar o endurecimento do módulo canônico client-side `teacher-extension/safeWriter.js` implementando o Escopo 3 (amarração relacional aluno x linha baseada em tokens completos), garantindo:
1. Comparação estrita de tokens inteiros (palavras com fronteira de palavra), impedindo que "Ana" case com "Mariana" ou "Joana" (`STUDENT_MISMATCH`).
2. Detecção determinística de múltiplos alunos homônimos na mesma tabela/grid (`AMBIGUOUS_HOMONYM`).
3. Rejeição de nomes parciais de token único insuficientemente específicos (`AMBIGUOUS_PARTIAL_NAME`).
4. Tratamento canônico de acentos (`NFKD`), maiúsculas/minúsculas, preposições, hífens e apóstrofos.
5. Manutenção de compatibilidade com todos os 20 casos de teste originais e os 17 casos de ocultação e honeypots da TASK-003a.

## 2. Requisitos de Implementação

### 2.1. Casamento Relacional por Subsequência de Tokens (`validateStudentRowTargetDetail`)
- Tokenizar `expectedStudentName` e o texto do container `row` após normalização `NFKD`.
- Exigir que a sequência ordenada de tokens do nome do aluno esteja contida integralmente na sequência de tokens da linha.
- Retornar `{ valid: false, reason: 'STUDENT_MISMATCH' }` se os tokens não casarem (ex: "Ana" contra "Mariana Lima").

### 2.2. Detecção de Homônimos na Tabela
- A partir da linha do aluno, localizar o contêiner tabular (`table`, `tbody`, `[role="grid"]`).
- Varrer todas as linhas irmãs no contêiner. Se mais de uma linha contiver a mesma sequência de tokens do aluno, recusar com `{ valid: false, reason: 'AMBIGUOUS_HOMONYM' }`.

### 2.3. Desambiguação de Nome Parcial de Token Único
- Se a entrada `expectedStudentName` contiver apenas um token de palavra (ex: "Lucas") e o registro da linha contiver múltiplos tokens ("Lucas Silva"), recusar com `{ valid: false, reason: 'AMBIGUOUS_PARTIAL_NAME' }`.

## 3. Critério de Aceite
A suíte completa de endurecimento travada no commit base deve ser executada com 100% de sucesso (25/25 casos aprovados):
```bash
node audit/test_safewriter_hardening.js
```
A suíte original da TASK-002 deve continuar com 100% de sucesso (20/20 casos aprovados):
```bash
node audit/test_safewriter.js
```
