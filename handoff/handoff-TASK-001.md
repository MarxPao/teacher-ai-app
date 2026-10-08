# Handoff da Tarefa: TASK-001 — Unificação do Resolvedor de Polaridade de Frequência

## 1. Resumo da Entrega
- **Módulo Canônico Consolidado**: `teacher-extension/attendancePolarity.js` (baseado no hotfix `c377471` com exportação UMD e função `resolveAttendancePolarity`).
- **Suíte de Testes Avaliada**: `audit/polarity_test_cases.json` (11 casos canônicos pré-existentes na base).
- **Resultado do Critério de Aceite**: 11/11 casos aprovados (100%), retorno exit code 0.

---

## 2. Tabela Comparativa dos 11 Casos Avaliados

| ID | Descrição | Entrada (Header / Label / Intent) | Esperado (CanResolve / Polarity / Checked) | Resultado `attendancePolarity.js` | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| `CASE_01` | Positivo simples | `Presença` / - / `PRESENCA` | `true` / `POSITIVE` / `true` | `true` / `POSITIVE` / `true` | **PASS** |
| `CASE_02` | Positivo com falta | `Presença` / - / `FALTA` | `true` / `POSITIVE` / `false` | `true` / `POSITIVE` / `false` | **PASS** |
| `CASE_03` | Negativo simples | `Falta (Marcar se Ausente)` / - / `PRESENCA` | `true` / `NEGATIVE` / `false` | `true` / `NEGATIVE` / `false` | **PASS** |
| `CASE_04` | Negativo com falta | `Falta (Marcar se Ausente)` / - / `FALTA` | `true` / `NEGATIVE` / `true` | `true` / `NEGATIVE` / `true` | **PASS** |
| `CASE_05` | Sinônimo em rótulo | `Diário de Frequência` / `Marcar Ausente` / `FALTA` | `true` / `NEGATIVE` / `true` | `true` / `NEGATIVE` / `true` | **PASS** |
| `CASE_06` | Sinônimo presença | `Comparecimento Escolar` / - / `PRESENCA` | `true` / `POSITIVE` / `true` | `true` / `POSITIVE` / `true` | **PASS** |
| `CASE_07` | Inglês presença | `Attendance` / - / `PRESENCA` | `true` / `POSITIVE` / `true` | `true` / `POSITIVE` / `true` | **PASS** |
| `CASE_08` | Inglês ausência | `Absence Records` / - / `PRESENCA` | `true` / `NEGATIVE` / `false` | `true` / `NEGATIVE` / `false` | **PASS** |
| `CASE_09` | Ambiguidade P/F | `P/F` / - / `PRESENCA` | `false` / `AMBIGUOUS` / `null` | `false` / `AMBIGUOUS` / `null` | **PASS** |
| `CASE_10` | Cabeçalho genérico | `Status` / - / `FALTA` | `false` / `AMBIGUOUS` / `null` | `false` / `AMBIGUOUS` / `null` | **PASS** |
| `CASE_11` | Conflito de sinais | `Presença` / `Marcar Falta` / `PRESENCA` | `false` / `CONFLICT` / `null` | `false` / `CONFLICT` / `null` | **PASS** |

---

## 3. Onde Divergiam e Justificativa de Resolução

1. **Tratamento de Conflitos e Ambiguidade**:
   - A versão legada/sintética tentava adivinhar uma prioridade arbitrária entre o rótulo e o cabeçalho quando ambos existiam com sinais opostos.
   - O resolvedor canônico agora adota rigorosamente a política **fail-closed**: se o cabeçalho indicar presença (`POSITIVE`) e o controle indicar ausência (`NEGATIVE`), a operação é imediatamente recusada com `CONFLICT` e `canResolve: false`.
2. **Isolamento de Duplicatas**:
   - O arquivo `teacher-extension/attendance_polarity.js` e o sidecar duplicado não são mantidos na extensão autônoma. O único ponto canônico de verdade passa a ser `teacher-extension/attendancePolarity.js`.
3. **Mapeamento de DOM Real**:
   - O módulo preserva o suporte a tabelas com `colspan`, cabeçalhos agrupados (`visualHeaderMap`) e resolução bidirecional por `label[for]` e `aria-label`.
