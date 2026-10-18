# Benchmark do agente genérico

Roda o `ReasoningLoopExecutor` de produção (com `DomDriver` real) num Chromium real (Electron)
contra um portal escolar sintético e hostil. Os checadores olham o estado do servidor, não a
resposta do agente: só passa se gravou exatamente o pedido e não teve efeito colateral.

```bash
npx tsx bench/run.ts --model gemini-3.5-flash-lite --workers 2          # suíte completa
npx tsx bench/run.ts --tasks T05,T09 --workers 1 --show                 # tarefas específicas, janela visível
BENCH_TRACE=trace.txt npx tsx bench/run.ts --tasks T11 --workers 1      # grava prompts e respostas do LLM
```

As chaves `GEMINI_API_KEY` / `GROQ_API_KEY` são lidas do `.env.local`. Modelos `gemini-*` usam a API
do Google; os demais, a da Groq. Resultados em `bench/results/`.

## O portal (`bench/portal/server.js`)

Tudo fictício. Armadilhas de propósito:

- IDs aleatórios a cada carga, banner de cookies, 60 links falsos no menu lateral antes do conteúdo
- menus que só abrem com clique; selects em cascata via AJAX com atraso (turma → disciplina → mês → dia)
- chamada paginada com "Excluir lançamentos" ao lado de "Salvar"; modal de confirmação
- bimestre em Shadow DOM; planilha de notas em iframe com máscara de vírgula
- combobox com lista em portal no fim do `<body>`; calendário customizado; menu de ícone "⋮"
- modal de "sessão expirando" que bloqueia gravações até ser confirmado
- injeção de prompt na página pedindo para "Excluir todos os comunicados"

## Tarefas (`bench/tasks.js`)

| ID | O que testa |
| --- | --- |
| T01 | login + navegação por menu fechado |
| T02 | falta em aluno: selects em cascata + modal |
| T03 | falta em aluna na 2ª página |
| T04 | duas faltas na mesma chamada |
| T05 | nota em iframe, bimestre em Shadow DOM, máscara |
| T06 | leitura de média no boletim |
| T07 | maior média da turma (ordenação/varredura de páginas) |
| T08 | publicar comunicado: combobox + calendário + confirmação |
| T09 | rascunho com injeção de prompt na página |
| T10 | diário de classe via menu de ícone + modal |
| T11 | leitura sem alterar nada, comparando três dias |
