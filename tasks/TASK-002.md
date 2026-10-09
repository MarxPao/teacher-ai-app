---
id: "TASK-002"
objetivo: "Implementar o módulo cliente determinístico SafeWriter (teacher-extension/safeWriter.js) para validação estrita de visibilidade, detecção de honeypots e amarração relacional aluno↔linha antes de qualquer escrita no DOM"
criterio_de_aceite: "node audit/test_safewriter.js"
files_allowed:
  - "teacher-extension/safeWriter.js"
  - "handoff/handoff-TASK-002.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de:
  - "TASK-001D"
modelo_sugerido: "barato"
orcamento:
  max_tokens: 30000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-safewriter"
task_hash_locked: "abac0d8d94209251c7c8ffe6b89921a8b3e980c4ac6029719743facaa3f562b3"
---

# Tarefa: TASK-002 — SafeWriter (Guardião Determinístico de Escrita no DOM)

## 1. Objetivo
Implementar o módulo canônico client-side `teacher-extension/safeWriter.js` em formato UMD/CommonJS.
O módulo atua como guardião determinístico pré-escrita, assegurando que nenhuma ação ou alteração de valor seja disparada contra elementos inválidos, invisíveis, armadilhas honeypot ou desvinculados da linha do aluno correspondente no portal escolar.

## 2. Requisitos de Implementação

### 2.1. Verificação de Visibilidade Estrita (`isElementVisible`)
- Rejeitar elementos com `display === 'none'`.
- Rejeitar elementos com `visibility === 'hidden'` ou `'collapse'`.
- Rejeitar elementos com `opacity === 0` ou `'0'`.
- Rejeitar elementos com dimensões colapsadas (`offsetWidth <= 0` e `offsetHeight <= 0`, ou rect com largura/altura <= 0).
- Rejeitar elementos com `clip: rect(0, 0, 0, 0)` ou `clip-path` colapsado.
- Caso não visível, retornar `{ canWrite: false, reason: 'ELEMENT_NOT_VISIBLE' }`.

### 2.2. Detecção e Neutralização de Honeypots (`isHoneypot`)
- Bloquear elementos com `aria-hidden="true"`.
- Bloquear elementos posicionados fora da viewport navegável (ex.: `left < -1000` ou `top < -1000`).
- Bloquear elementos com identificadores ou nomes contendo padrões de armadilha antibot (ex.: `trap`, `honey`, `bot_check`, `fake_input`).
- Caso honeypot detectado, retornar `{ canWrite: false, reason: 'HONEYPOT_DETECTED' }`.

### 2.3. Amarração Relacional Aluno $\times$ Linha (`validateStudentRowTarget`)
- Localizar o container da linha correspondente (`tr`, `[role="row"]`, etc.).
- Normalizar e verificar se o nome do aluno esperado (`expectedStudentName`) está contido no texto da linha.
- Se a linha pertencer a outro aluno ou não contiver o nome esperado, retornar `{ canWrite: false, reason: 'STUDENT_MISMATCH' }`.

### 2.4. Validação de Contrato e Estados de Controle (Fail-Closed)
- Rejeitar elementos nulos ou indefinidos (`{ canWrite: false, reason: 'INVALID_ELEMENT' }`).
- Rejeitar controles desabilitados (`disabled === true`) com `{ canWrite: false, reason: 'ELEMENT_DISABLED' }`.
- Rejeitar controles somente leitura (`readOnly === true`) com `{ canWrite: false, reason: 'ELEMENT_READONLY' }`.
- Rejeitar nomes de aluno vazios ou não-string com `{ canWrite: false, reason: 'INVALID_STUDENT_NAME' }`.

## 3. Critério de Aceite
A suíte travada no commit base deve ser executada com 100% de sucesso (20/20 casos aprovados):
```bash
node audit/test_safewriter.js
```
