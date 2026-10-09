# Requisitos Mapeados — TASK-001D

Documento gerado em conformidade com a skill `fidelidade-ao-pedido`.

## Mapeamento de Requisitos

| ID | Descrição do Requisito | Restrições & Critérios |
| :--- | :--- | :--- |
| **R1** | Nova task TASK-001D com fluxo estrito | Spec + teste travado no commit base ANTES da worktree, execução em worktree, gate determinístico, merge na `main`, atualização de `STATE.md`. |
| **R2** | Preservação de casos existentes | Casos legados inalterados, exceto adição do campo `"superseded_by": "CASE_34"` no `CASE_32`. Apenas adicionar novos casos (53 a 65). |
| **R3** | Não iniciar TASK-002 | Encerrar esta rodada estritamente após a conclusão e merge da TASK-001D. |
| **R4** | Auditoria Parte 1 (somente leitura) | Entregar os 5 itens: (1) tabela esperado x obtido casos 35 a 52 e análise de inversão vs recusa; (2) git diff completo de `test_polarity_parity.py` em `aac76e5`; (3) explicação da diferença entre hash bruto e normalizado; (4) hashes de merge e STATE.md com `git log -n 6 --graph`; (5) saída bruta nova do teste no `main`. |
| **R5** | Tratamento genérico de `superseded_by` (Parte 2A) | Adicionar `"superseded_by": "CASE_34"` no `CASE_32` do JSON. No harness, remover exceção hardcoded e tratar campo genérico reportando como `SUPERSEDED`, não `PASS`. |
| **R6** | Decisão de negações e duplas negações (Parte 2B) | Documentar por que negações inequívocas ("não compareceu") invertem para `NEGATIVE`. Adicionar casos de negação dupla ("Não ausente", "Not not present", "Sem falta de presença") com recusa `AMBIGUOUS`. |
| **R7** | Casos extras de sinais de acessibilidade (Parte 2C) | Adicionar casos: aria-label e title conflitantes sem cabeçalho; valores vazios/nulos/não-string; extraSignals ausente vs objeto vazio `{}`. |
| **R8** | Palavras compostas e radicais (Parte 2D) | Confirmar por teste que 'ausente', 'faltou', 'presente' não vazam em palavras compostas ('representante', 'ausentismo', 'pre-sente', 'asfaltou') e que 'faltou' isolado resolve para ausência. |
| **R9** | Formato de entrega e evidências | Tabela esperado x obtido dos casos novos (53 a 65) e casos 35 a 52; diff categorizado com limites do gate; saídas brutas do teste, gate e `--verify-log`; riscos residuais reais listados. |
