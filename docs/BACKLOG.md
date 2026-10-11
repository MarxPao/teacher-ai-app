# Backlog de Evoluções e Dívidas Técnicas

Este documento centraliza as funcionalidades, arquétipos e melhorias postergadas para fases futuras, conforme as regras anti-espiral do Teacher AI.

---

## 1. Concluído na Fase 5 (Resiliência e Reparo)

- [x] **Reparo Automático Offline e Matcher Semântico Local (Degrau 3):**
  - Implementado 100% determinístico e sem LLM sob `lib/repair/` e `lib/repair/semantic/`.
  - Soft heal em runtime estritamente restrito a nós de leitura (`READ`, `LOCATE`, `WAIT`), fora de chaves de aluno.
  - Bloqueio total de escritas com `SAFE_ABORT` + snapshot higienizado para aprovação humana.
  - Suíte de conformidade de resiliência com 12 cenários DEV e 12 cenários HOLDOUT travados via SHA-256 (`conformance/repair/holdout.lock`).
  - Persistência de métricas de saúde sem PII (`graph_health:<portal_id>:<task_id>`) em `chrome.storage.local`.

---

## 2. Fase 6 / Backlog Futuro

- **Gravação em Lote (`LOOP` com `param_list`):**
  - *Contexto:* Na gravação de ações repetidas em tabela, o compilador hoje grava 1 aluno e o professor utiliza a ferramenta de replicação.
  - *Evolução:* Sintetizar automaticamente o nó `LOOP` iterando sobre a lista de alunos (com checkpoint `per_batch`) a partir da detecção de ≥2 mutações estruturalmente equivalentes no trace.
  - *Status:* Adiado no Gate 0 da Fase 4.

- **Nó `FILTER` Nativo (Contrato 2.1):**
  - *Contexto:* Controles de filtro (`<select>` ou input de busca) que filtram linhas na tela sem alterar a rota ou parâmetros de URL (`NAVIGATE.query`).
  - *Status Atual:* Classificado como **Tier 2** (assistido), emitindo instrução de conferência ou handoff antes do início da rotina.
  - *Evolução:* Criação formal do nó `FILTER` com restrições estritas de segurança (fora de linhas de dados e sem mutação arbitrária).

- **LLM para Auxílio no Reparo (Sugestões de Desambiguação Complexa):**
  - *Contexto:* Quando o matcher semântico local detectar ambiguidade (`E_REPAIR_AMBIGUOUS`) ou ausência de candidatos (`E_REPAIR_NO_CANDIDATE`).
  - *Status:* Postergado no Gate 0 da Fase 5 para manter o engine 100% local, auditável e determinístico.

- **Perfis Estendidos de Elementos no Repositório:**
  - *Contexto:* Guardar histórico multidimensional de variações passadas de seletores de cada elemento.
  - *Status:* Postergado no Gate 0 da Fase 5, preservando o contrato congelado SkillGraph v2.0 sem dependências externas.
