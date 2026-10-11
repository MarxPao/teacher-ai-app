# Plano de Aposentadoria do Sidecar Python (SIDECAR_RETIREMENT_PLAN.md)

Este documento registra a trajetória de substituição do backend legado Python pelo motor determinístico **SkillGraph v2** (TypeScript puro / MV3).

---

## 1. Estado Atual na Fase 4

1. **Núcleo SkillGraph v2 (TypeScript Puro):**
   - Os módulos `lib/runner`, `lib/compiler`, `lib/recorder`, `lib/runner-dom` e `lib/runner-ext` operam de forma 100% autônoma, sem nenhuma dependência de bibliotecas Python, Playwright server-side ou do backend na porta 8000.
   - Todo o ciclo de vida (Gravar → Revisar → Compilar → Rodar) funciona localmente no navegador via `DomRecorder`, `DomDriver` e `RemoteDriver`.
2. **Sidecar Python (Legado V1):**
   - Os arquivos em `sidecar/` (`skill_recorder.py`, `pathway_compiler_skill.py`, `agentic_execution_loop.py`) e os artefatos V1 em `teacher-extension/` (`content.js`, `side_panel.js` legado) são estritamente **read-only** ou mantidos para retrocompatibilidade quando `USE_SKILLGRAPH_V2 = false`.
   - Nenhuma nova funcionalidade ou teste da Fase 4 consome o sidecar Python.

---

## 2. Cronograma de Aposentadoria e Desativação

| Marco | Fase | Ações Previstas | Status |
| :--- | :---: | :--- | :---: |
| **Fase 2** | Runner v2 | Criação do motor determinístico sem LLM em TypeScript puro | ✅ Concluído |
| **Fase 3** | Gravador/Compilador | Pipeline de gravação no DOM e compilação determinística sem LLM | ✅ Concluído |
| **Fase 4** | Generalização | Cobertura de 20 arquétipos, HOLDOUT travado e suíte MV3 | ✅ Concluído |
| **Fase 5** | Auto-Reparo | Reparo semântico local e auto-cura de âncoras | ⏳ Próxima |
| **Fase 6** | Desativação Total | Remoção definitiva de `sidecar/`, scripts legados de `content.js`/`side_panel.js`, adoção de Native Messaging e SQLite local | 📅 Planejado |
