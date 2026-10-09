# Requisitos: TASK-003 — Endurecimento do SafeWriter

Data: 2026-10-09

## Pedido Original
TASK-003 — Endurecimento do SafeWriter (lacunas pós-TASK-002)
A TASK-002 (SafeWriter) foi aprovada no gate e mergeada na main. Uma análise posterior identificou lacunas de robustez que NÃO foram cobertas pelos 20 casos de teste originais. Esta tarefa fecha essas lacunas sem alterar o comportamento já aprovado (os 20 casos existentes devem continuar passando).

## Requisitos Numerados

- **R1 (Processo & Governança)**:
  - Criar `tasks/TASK-003.md` com `task_hash_locked` e `files_allowed` explícitos.
  - Escrever o teste de aceite `audit/test_safewriter_hardening.js` ANTES da implementação e commitá-lo no commit base (`main`) junto com a spec.
  - Implementar em worktree isolada `.worktrees/task-TASK-003`.
  - Passar pelo `scripts/gate.py`. Não contornar o limite de 500 linhas de diff compactando código. Se o diff exceder 500 linhas, dividir em subtarefas.
  - Pós-merge: rodar testes na main (`node audit/test_safewriter.js`, `node audit/test_safewriter_hardening.js`, `node audit/fuzz_polarity.js`), atualizar `STATE.md`, rodar `gate.py --verify-log`.

- **R2 (Escopo 1 — Novas formas de ocultação)**:
  - Implementar em `teacher-extension/safeWriter.js`:
    1. `transform` com `scale(0)` (ou `scaleX(0)` / `scaleY(0)`).
    2. `clip-path` com área nula (`inset(100%)`, `circle(0)`, `polygon()` vazio/nulo).
    3. `font-size: 0` em controles dependentes de texto.
    4. `pointer-events: none`.
    5. Elemento coberto por outro (`elementFromPoint` no centro do elemento; se o elemento retornado não for o alvo nem descendente/ancestral, rejeitar).
    6. Ancestral oculto (propagação de `display: none`, `visibility: hidden/collapse`, `opacity: 0` pela cadeia de pais até a raiz).
    7. Elementos fora do viewport por `position` + `transform` (ex.: `translate(-9999px)`).
  - Cada forma deve possuir no teste de aceite pelo menos 1 caso positivo (rejeita) e 1 de controle (elemento legítimo parecido que não rejeita).

- **R3 (Escopo 2 — Honeypots estruturais)**:
  - Manter heurística de nomes (`trap`, `honey`, `bot_check`), mas incorporar defesas estruturais:
    - `tabindex="-1"` combinado com campo não visível / oculto;
    - `autocomplete="off"` em campo fora de linha de aluno;
    - inputs duplicados com o mesmo `name` na mesma linha.
  - Documentar no código que nomes são heurística secundária e que os sinais estruturais são a defesa principal.

- **R4 (Escopo 3 — Amarração aluno x linha por TOKENS)**:
  - Comparação de nomes estritamente por TOKENS inteiros (palavras com `\b`), NUNCA substring ("Ana" NÃO casa com "Mariana" nem "Joana").
  - Homônimos: se dois alunos na mesma tabela/grid normalizam para o mesmo nome, retornar ambiguidade e rejeitar (`canWrite: false, reason: 'AMBIGUOUS_HOMONYM'`).
  - Nome parcial (apenas primeiro nome) rejeitado a menos que seja explicitamente único e permitido.
  - Suporte completo a acentos (`NFKD`), caixa, múltiplos espaços, preposições ("da", "de", "dos"), hífens e apóstrofos.
  - Subida ao `tr/[role="row"]` MAIS PRÓXIMO em tabelas aninhadas.

- **R5 (Escopo 4 — Teste em DOM real via TASK-003b)**:
  - Deixar Escopo 4 para a tarefa separada `TASK-003b` (fixtures em `audit/browser/` com runner Playwright).
  - Se dependência de browser não puder rodar no ambiente local, registrar explicitamente como débito aberto no handoff.

- **R6 (Escopo 5 — Documentação de integridade)**:
  - Documentar em `docs/INTEGRIDADE_TASK_HASH.md` a diferença entre o hash bruto e o hash normalizado travado (`task_hash_locked`), explicando a normalização de CRLF/LF e linhas de metadados.
  - Verificar em `orch_gate_audit.jsonl` se reprovações também são registradas (confirmado: Index 17 registrou a reprovação por tamanho da TASK-002).

- **R7 (Critérios de Aceite)**:
  - `node audit/test_safewriter.js`: 20/20 PASS mantidos sem alteração.
  - `node audit/test_safewriter_hardening.js`: todos os novos casos PASS (mínimo 14 casos de ocultação [7 pares positivo/controle] + mínimo 8 casos de amarração aluno x linha).
  - `node audit/fuzz_polarity.js`: 500/500 PASS mantidos.
  - `gate.py`: APROVADA sem violações.
  - `gate.py --verify-log`: íntegro.
