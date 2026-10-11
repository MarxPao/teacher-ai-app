# Inventário e Governança de Formatos de Mapa Legados

**Status:** CONGELADO (Fase 1)  
**Diretriz:** Marcar como depreciado sem mover nem quebrar chamadores existentes. A substituição efetiva dos consumidores ocorre na Fase 2.

---

## 1. Inventário Detalhado dos Formatos Legados

| Formato Legado | Arquivo que Define | Quem Importa em Produção (`git grep`) | O que Absorver no SkillGraph v2 | Fase de Remoção | Seguro Mover para `legacy/` Agora? |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **`portal_structure_maps`** | `sidecar/portal_structure_mapper.py` | `sidecar/agentic_execution_loop.py`, `sidecar/ppav_orchestrator.py`, testes do sidecar | Hierarquia de abas e detecção passiva de tabelas/campos | Fase 4 (Migração Sidecar) | **NÃO** (possui chamadores ativos) |
| **`discovered_portal_maps`** | `sidecar/portal_map_store.py`, `lib/portalActionsEngine.ts`, `lib/portalConnectionService.ts` | `sidecar/manual_runner.py`, `sidecar/discovery_orchestrator.py`, `components/modules/Settings.tsx`, `components/modules/Students.tsx`, `lib/portalBridge.ts`, múltiplos testes | Versionamento por subdomínio white-label e fallbacks de âncoras | Fase 2 (Conversor & Runner) | **NÃO** (possui chamadores ativos) |
| **`PortalProfile` estático** | `sidecar/navigation_state_machine.py` | `sidecar/intent_parser.py`, `sidecar/manual_runner.py`, `sidecar/intent_tree_runner.py`, testes de máquina de estados | Lista de estados canônicos (`DIARIO`, `NOTAS`) e âncoras de rota | Fase 2 (Conversor & Runner) | **NÃO** (possui chamadores ativos) |
| **`PortalStateGraph`** | `sidecar/skills/state_graph_skill.py` | `sidecar/discovery_orchestrator.py`, `sidecar/learning_engine.py`, testes de grafo de estados | Conceito de State Fingerprinting e transições mínimas de navegação | Fase 3 (Compilador Offline) | **NÃO** (possui chamadores ativos) |
| **`SkillGraph v1`** | `lib/skills/skillGraphSchema.ts`, `sidecar/skill_graph_schema.py` | `lib/skills/graphExecutor.ts`, `lib/skills/graphValidator.ts`, `sidecar/skill_recorder.py`, `sidecar/skill_store.py`, rotas de API `/api/skills/*` | Topologia de nós (`NAVIGATE`, `READ`, `WRITE`, `CLICK`, `CHECKPOINT`) | Fase 2 (Conversor & Runner) | **NÃO** (possui chamadores ativos) |

---

## 2. Perfis e Grafos Hardcoded Temporários

Conforme diretriz da Fase 1:
- `MACHADO_SOBRINHO_PROFILE` (em `sidecar/navigation_state_machine.py`)
- `CANONICAL_READ_ROSTER_GRAPH` (em `teacher-extension/content.js`)

Ambos **permanecem inalterados** na árvore de código até a Fase 2, quando serão convertidos para instâncias declarativas de `SkillGraph v2` e consumidos pelo novo runner determinístico.
