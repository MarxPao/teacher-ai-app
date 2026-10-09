# Relatório de Execução C1 — pytest sidecar/tests

Data: 2026-10-09
Comando canônico: `python -m pytest sidecar/tests -q`

## Resultados Consolidados
- Total de testes descobertos e executados: 526
- Aprovados (passed): 499
- Falhos (failed): 27
- Pulados (skipped): 0
- Erros de coleta (collection errors): 0
- Avisos (warnings): 61
- Duração da execução: 577.27s (0:09:37)

## Comparação com o Commit Base (3972ced)
- Verificação de diff de código: `git diff HEAD -- sidecar` é vazio (zero arquivos alterados no sidecar).
- Validação em worktree limpo: O teste `sidecar/tests/test_agentic_data_reading_e2e.py` foi executado em worktree isolado do commit base `3972ced` (`.worktree_base_check`).
- Resultado: Apresentou a mesma falha pré-existente (`PermissionError: Bloqueio de segurança F1b: Envio de screen_state ou dados de alunos para a nuvem bloqueado até a conclusão da F1b-2.`).
- Conclusão: O conjunto de 27 falhas é 100% idêntico ao commit anterior à dívida (3972ced), decorrente da política de segurança F1b e dependência de ambiente de navegador/Ollama live, com zero regressões introduzidas pela dívida da TASK-001.
