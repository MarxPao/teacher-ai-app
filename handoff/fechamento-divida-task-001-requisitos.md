# Requisitos: Fechamento da Dívida TASK-001 (Rodada de Correção)

Data: 2026-10-09

## Pedido Original
PROMPT — FECHAMENTO DA DÍVIDA TASK-001 (rodada de correção)
Contexto: Worktree C:/Users/rafae/Documents/antigravity/hopeful-bell. A resolução da dívida herdada da TASK-001 foi revisada e aprovada com ressalvas. Esta rodada fecha as ressalvas. Não inicie a TASK-002.

Regras gerais:
- Cole a saída crua de cada comando. Resumo não substitui evidência.
- Use somente os status `[VERIFICADO]`, `[NÃO VERIFICADO]` ou `[FALHOU]`. Se o comando não rodou ou não terminou, não é verificado.
- Não simule resultados nem marque como feito o que foi apenas disparado.
- Um commit por item (C1 a C6). Se algum item revelar problema novo, pare e reporte em vez de corrigir fora do escopo.

## Requisitos Numerados

- **C1 — Saída do `pytest sidecar/tests`**:
  1. Rodar `python -m pytest sidecar/tests -q`, aguardar terminar e colar a saída completa (ou últimas 40 linhas, indicando onde está o resto).
  2. Informar: total passou, falhou, pulou, erros de coleta.
  3. Se houver falhas, rodar os mesmos testes em um worktree limpo do commit anterior à dívida e comparar. Falha só no estado atual é `[FALHOU]`: parar e reportar.
  4. Não declarar "zero regressões" sem essa saída.
  Commit C1.
- **C2 — Paridade Python↔JS**:
  1. Rodar `git ls-files | Select-String -Pattern "polarity"` e colar saída sobre implementações existentes.
  2. Responder com evidência: existe uma versão Python que deveria existir (spec, handoff, TASK-001)? Citar arquivo e linha ou declarar que não há.
  3. Se não existe e não deveria existir: renomear/documentar harness para não sugerir paridade e marcar como `[NÃO APLICÁVEL]`.
  4. Se deveria existir: não implementar, marcar `[NÃO VERIFICADO]`.
  Commit C2.
- **C3 — Placar honesto**:
  1. Em `audit/test_polarity_parity.py`, alterar placar final separando categorias: `65 aprovados, 0 falhos, 1 superado (de 66)`.
  2. Remover "100% de conformidade".
  3. Rodar `python audit/test_polarity_parity.py` e colar bloco final do placar.
  4. Explicar em 1 linha por que CASE_32 está superado e qual substitui (CASE_34), citando campo JSON.
  Commit C3.
- **C4 — Diretório canônico do log de auditoria**:
  1. Colar saída crua de ambos os comandos `python scripts/gate.py --verify-log` com seus respectivos `ORCH_AUDIT_DIR`.
  2. Mostrar padrão usado por `scripts/gate.py` quando variável não está definida (arquivo e linha).
  3. Mostrar valor atual no ambiente: `echo $env:ORCH_AUDIT_DIR`.
  4. Declarar qual é o diretório canônico e por quê; se houver divergência, reportar achado e não apagar nem mesclar.
  5. Informar contagem de registros em cada um e se a cadeia está íntegra.
  Commit C4.
- **C5 — Escopo do fuzz declarado**:
  1. Adicionar cabeçalho de comentário em `audit/fuzz_polarity.js` detalhando o que ele garante e o que NÃO garante.
  2. Acrescentar um invariante semântico barato e determinístico (ex: entradas sem termo de presença/ausência -> `canResolve=false`).
  3. Rodar com mesma seed (`0x12345678`) e colar saída.
  Commit C5.
- **C6 — Decisão de política marcada como pendente**:
  Em `docs/POLITICA_POLARIDADE_NEGACOES.md`:
  1. Adicionar no topo: `Status: DECISÃO TOMADA, PENDENTE DE CONFIRMAÇÃO DO DONO DO PRODUTO`.
  2. Listar explicitamente as 3 decisões que mudam comportamento real:
     - negação simples de presença ("Não compareceu") inverte para ausência;
     - negação de ausência ("Sem falta", "Não faltou") recusa;
     - dupla negação recusa.
  3. Para cada uma, escrever em uma linha o risco se estiver errada.
  4. Não alterar código de comportamento.
  Commit C6.

- **Restrição**: Parada obrigatória ao terminar. Não iniciar a TASK-002.
