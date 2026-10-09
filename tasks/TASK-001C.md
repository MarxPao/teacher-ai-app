---
id: "TASK-001C"
objetivo: "Aprimoramento do resolvedor de polaridade de frequência (attendancePolarity.js): negações explícitas e fail-closed, remoção de attendee do léxico (ajuste CASE_32 em CASE_34), tipos arbitrários de entrada, suporte a sinais extras (aria-label/title) e aprovação de 52 casos de teste"
criterio_de_aceite: "python audit/test_polarity_parity.py"
files_allowed:
  - "teacher-extension/attendancePolarity.js"
  - "handoff/handoff-TASK-001C.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de:
  - "TASK-001B"
modelo_sugerido: "barato"
orcamento:
  max_tokens: 30000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-polaridade-c"
---

# Tarefa: TASK-001C — Reforço de Negações, Robustez de Tipos e Sinais Adicionais no Resolvedor de Polaridade

## 1. Objetivo
Aprimorar o módulo canônico `teacher-extension/attendancePolarity.js` implementando políticas rigorosas de interpretação semântica e salvaguardas *fail-closed*, atendendo aos seguintes itens de especificação:

### 1.1 Tratamento Estrito de Negações (PT e EN)
- **Negações Inequívocas de Presença**: Expressões que afirmam categoricamente a não-presença do aluno ("Não compareceu", "Nao presente", "Not present", "Não veio", "Sem presença", "Não esteve") possuem polaridade de ausência inequívoca (`NEGATIVE` / `absence`).
- **Negações de Ausência e Duplas Negações (Fail-Closed)**: Expressões como "Não faltou", "Sem falta", "Not absent", "No absence" não representam estados booleanos padronizados de controles escolares e geram ambiguidade semântica. A política mandatória é **recusa segura (*fail-closed*)**, retornando `{ canResolve: false, polarity: 'AMBIGUOUS', shouldBeChecked: null }`.

### 1.2 Investigação e Remoção de "Attendee" (Ajuste CASE_32 -> CASE_34)
- No CASE_32 original, o termo "Attendee" foi incluído no léxico de presença (`presenceRegex`). Porém, em portais escolares, "Attendee" é um substantivo que designa o participante/aluno (identidade do sujeito ou cabeçalho da lista de participantes), e NÃO um estado booleano de marcação de presença em checkbox.
- **Ação**: O termo "attendee" / "attendees" é removido do léxico de presença.
- **Transição Supervisionada**: O `CASE_32` é mantido inalterado em `audit/polarity_test_cases.json` para preservar a integridade do histórico; o novo comportamento corrigido e fail-closed é formalmente verificado na nova entrada `CASE_34`, que exige `{ canResolve: false, polarity: 'AMBIGUOUS' }`.

### 1.3 Robustez contra Tipos de Entrada Arbitrários
- Parâmetros recebidos em `resolveAttendancePolarity(columnHeader, controlLabel, teacherIntent, extraSignals)` podem ser de tipos não-string (`undefined`, `object`, `array`, `number`).
- O módulo deve tratar defensivamente esses tipos:
  - Intenção não-string ou desconhecida -> `{ canResolve: false, polarity: 'INVALID_INTENT', shouldBeChecked: null }`.
  - Cabeçalho ou rótulo não-string -> tratado como ausência de sinal (sem lançar erro de runtime como `[object Object]` ou falhas de normalização). Se nenhum sinal válido for encontrado -> `{ canResolve: false, polarity: 'AMBIGUOUS', shouldBeChecked: null }`.

### 1.4 Políticas Implícitas Documentadas
1. **Prevalência de Sinal Claro sobre Sinal Ambíguo (CASE_23)**: Se um dos elementos possuir sinal semântico ambíguo ou genérico (ex: cabeçalho "P/F", "Status", "Diário") e outro elemento possuir sinal inequívoco (ex: rótulo "Marcar Falta"), o sinal inequívoco prevalece.
2. **Termos Genéricos = Sem Sinal (AMBIGUOUS)**: Cabeçalhos ou rótulos contendo apenas termos como "Status", "Situação", "Diário", contadores agregados ("Total de Faltas") ou vazios produzem sinal `null`. Se nenhum sinal for detectado -> recusa segura `AMBIGUOUS`.
3. **Conflito Direto = Recusa Imediata (CONFLICT)**: Havendo sinais opostos (ex: presença no cabeçalho e ausência no rótulo, ou presença no rótulo e ausência no atributo de acessibilidade), a operação é sumariamente recusada com `CONFLICT`.

### 1.5 Suporte a Sinais Extras (`aria-label` / `title`)
- A função `resolveAttendancePolarity` passa a aceitar um quarto parâmetro opcional `extraSignals`.
- `extraSignals` pode ser uma string (ex: valor de `aria-label` ou `title`) ou um objeto contendo atributos `{ "aria-label": "...", "title": "..." }`.
- Os sinais extraídos são combinados com os sinais de cabeçalho e rótulo seguindo exatamente a mesma regra de desambiguação e conflito direto.

## 2. Critério de Aceite
O script de verificação do portão (`scripts/gate.py`) executará a partir do commit base:
```bash
python audit/test_polarity_parity.py
```
O teste deve aprovar os 52 casos (33 legados com transição do CASE_32 + 19 novos casos CASE_34 a CASE_52) retornando exit code 0.

## 3. Restrições de Escopo (S1/S2)
- Modificações na worktree estritamente restritas a `teacher-extension/attendancePolarity.js` e `handoff/handoff-TASK-001C.md`.
- A suíte de testes em `audit/` e este arquivo de especificação pertencem ao commit base e são imutáveis após o travamento da base.
- Proibida alteração de `scripts/gate.py`, `STATE.md`, `.env*` ou `EVAL_HASHES.txt`.
