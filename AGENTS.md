# 🎓 Regras Operacionais do Workspace Teacher AI (AGENTS.md)

Este documento governa as diretrizes de execução, qualidade técnica e eficiência operacional do Google Antigravity dentro do repositório `teacher-ai-app`.

---

## 🚀 1. Política de Modelos por Tipo de Subagente

A seleção do modelo (`Model`) em `invoke_subagent` deve obedecer estritamente à matriz de responsabilidades abaixo:

| Categoria de Tarefa | Tipo do Subagente | Modelo Obrigatório | Justificativa Técnica & Salvaguarda |
| :--- | :--- | :---: | :--- |
| **Pesquisa & Leitura** | `research` | `flash` | Leitura de documentação, varredura de diretórios, `grep_search` e busca web são tarefas de extração semântica direta. O modelo Flash possui cotas (RPM/TPM) até 20x maiores e latência inferior a 1s. |
| **Auditoria Exploratória** | `research` | `flash` | Varredura de rotas, inventários de arquivos e busca de referências. |
| **Decisão Arquitetural** | `self` / `research` | `inherit` (Pro) | Escolha de trade-offs de banco de dados, design de novos subsistemas, conformidade com LGPD e refatoração de múltiplos módulos. Exige raciocínio profundo de Tier 1. |
| **Geração / Revisão Crítica** | `self` | `inherit` (Pro) | Implementação de código complexo de pipelines, resolução de bugs sutis de concorrência ou testes de estresse. |

### 🛡️ Critério de Fallback e Escalação Automática
Se um subagente executado sob `flash` apresentar:
1. Resposta inconclusiva ou ambígua (*"não encontrei mas pode estar em outro lugar"*);
2. Alucinação factual sobre símbolos do código;
3. Inconsistência identificada na análise do resultado;
**Ação Obrigatória:** O agente orquestrador deve imediatamente re-invocar o subagente ou executar a etapa diretamente com `Model: 'inherit'` (Pro), garantindo que a economia nunca aceite um resultado de menor qualidade.

---

## 🔇 2. Higienização de Saída de Terminal (Regra Zero-Noise)

Comandos executados via `run_command` poluem o contexto da conversa permanentemente. Todo comando no terminal deve seguir o padrão:

1. **Comandos de Sucesso**:
   - Usar filtros ou pipes para silenciar saídas redundantes (ex: `npm run build --silent`, `npx vitest run --reporter=basic`).
   - Se o comando passar sem falhas, relatar apenas `[OK] Testes/Build concluídos com sucesso (N testes aprovados)`.
2. **Comandos com Falha**:
   - Filtrar saídas para capturar estritamente o erro e o trecho de código falho:
     ```powershell
     & comando 2>&1 | Select-String -Pattern "FAIL|error|Error|fatal|Exception" -Context 1, 2
     ```
3. **Exceção de Segurança (Depuração Ativa)**:
   - Se o erro for misterioso, relacionado a timing ou crash de processo nativo, a saída completa DEVE ser mantida na chamada ativa enquanto a causa raiz estiver sendo investigada.

---

## 🗃️ 3. Gestão e Poda de Artefatos

1. Arquivos de rascunho, logs de teste e dados transitórios devem ser salvos estritamente em `<appDataDir>\brain\<id>\scratch\`.
2. Apenas documentos de referência duradouros (como `implementation_plan.md` e `walkthrough.md`) devem residir na raiz do diretório de artefatos.

---

## ⏱️ 4. Ciclo de Vida da Sessão e Handoff Limpo

Para evitar que sessões acumulem mais de 100.000 tokens de histórico degradando latência e consumindo cota:
1. **Gatilhos de Encerramento de Sessão**:
   - Conclusão de uma fase ou marco do roadmap (ex: Fase 5.1 concluída).
   - Sessão ultrapassou 30 turnos de usuário ou gerou histórico denso de depuração.
2. **Protocolo de Handoff Limpo**:
   - O agente gera um resumo executivo de encerramento (`walkthrough.md` ou bloco Markdown) contendo:
     - Tarefas finalizadas com commits de referência;
     - Decisões de design travadas;
     - Próximos passos imediatos.
   - Uma nova conversa é iniciada pelo usuário referenciando o resumo, iniciando com zero tokens de histórico residual.
