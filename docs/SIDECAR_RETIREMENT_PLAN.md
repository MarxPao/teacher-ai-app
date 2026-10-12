# Plano de Aposentadoria do Sidecar Python (SIDECAR_RETIREMENT_PLAN.md)

Este documento registra a trajetória de substituição do backend legado Python pelo motor determinístico **SkillGraph v2** (TypeScript puro / MV3) e a blindagem Local-First na **Fase 6**.

---

## 1. Estado Final na Fase 6

1. **Núcleo SkillGraph v2 e Desktop Local-First:**
   - O aplicativo desktop Electron (`desktop/`) é o único dono dos dados e gerencia o SQLite cifrado local (`node:sqlite` + envelope AES-256-GCM com DEK protegida por DPAPI via `safeStorage`).
   - A extensão Chrome MV3 comunica-se exclusivamente via **Chrome Native Messaging** conectado a um named pipe autenticado por nonce (`\\.\pipe\teacher-ai-native-<nonce>`).
   - Zero portas TCP abertas: nenhum servidor HTTP (8000, 8765) ou WebSocket escutando na máquina.
   - A permissão `"debugger"` foi removida do `manifest.json`. Não há mais dependência de Chrome DevTools Protocol (CDP) ou `--remote-debugging-port=9222`.

2. **Sidecar Python (Legado V1):**
   - Todos os scripts em lote (`abrir-chrome-cdp.bat`, `iniciar-sidecar.bat`, `conectar-navegador.bat`, `gravar-habilidade.bat`) foram marcados como **[DEPRECATED]**, instruindo a usuária a rodar o app desktop (`npm run desktop:dev`).
   - Os arquivos em `sidecar/` permanecem apenas como histórico/referência para inspeção ou testes de regressão passados, sem qualquer participação na execução em produção ou na extensão MV3.

---

## 2. Cronograma de Aposentadoria e Desativação

| Marco | Fase | Ações Previstas | Status |
| :--- | :---: | :--- | :---: |
| **Fase 2** | Runner v2 | Criação do motor determinístico sem LLM em TypeScript puro | ✅ Concluído |
| **Fase 3** | Gravador/Compilador | Pipeline de gravação no DOM e compilação determinística sem LLM | ✅ Concluído |
| **Fase 4** | Generalização | Cobertura de 20 arquétipos, HOLDOUT travado e suíte MV3 | ✅ Concluído |
| **Fase 5** | Auto-Reparo | Reparo semântico local e auto-cura de âncoras | ✅ Concluído |
| **Fase 6** | Desativação Total | Remoção do CDP/debugger, substituição de portas TCP por Native Messaging, SQLite local cifrado, scripts deprecados | ✅ Concluído |
