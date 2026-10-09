# Handoff: TASK-003b — Endurecimento do SafeWriter (Tokens, Homônimos e Desambiguação)

Data: 2026-10-09
Executor: executor-safewriter
Status: Concluído e verificado

## 1. Resumo Executivo
Subtarefa que conclui os objetivos de endurecimento do `SafeWriter` (`teacher-extension/safeWriter.js`), implementando o Escopo 3 (amarração por tokens, desambiguação e homônimos) sobre a base consolidada da TASK-003a:
- Suíte de endurecimento completa (`audit/test_safewriter_hardening.js`): 25/25 casos aprovados (0 falhas).
- Suíte de regressão TASK-002 (`audit/test_safewriter.js`): 20/20 casos aprovados (0 falhas).

## 2. Detalhes de Implementação (`teacher-extension/safeWriter.js`)
1. **Casamento Estrito por Sequência de Tokens (`containsTokenSequence`)**:
   - Tokenização após normalização `NFKD` e remoção de pontuação/caracteres especiais;
   - Subsequência exata de tokens impede falsos positivos por substring ("Ana" não casa com "Mariana" nem "Joana" -> `STUDENT_MISMATCH`).
2. **Detecção de Homônimos Tabulares (`AMBIGUOUS_HOMONYM`)**:
   - Varredura de linhas irmãs no contêiner tabular (`table`, `tbody`, `[role="grid"]`).
   - Se mais de uma linha contiver a mesma sequência de tokens do aluno, a operação é rejeitada como ambígua.
3. **Nomes Parciais de Token Único (`AMBIGUOUS_PARTIAL_NAME`)**:
   - Rejeição de entradas de token único (ex: "Lucas") contra registros com nome composto ("Lucas Silva").
4. **Resolução de Contêiner mais Próximo**:
   - Preservação da prioridade de subida ao `tr` mais próximo (`closest`) em tabelas aninhadas.

## 3. Próximo Passo
- O Escopo 4 (testes em DOM real no navegador com Playwright) permanece delegado como débito técnico mapeado para a subtarefa `TASK-003c` (ou runner de browser em ambiente com display/CDP).
