---
name: teacher-ai-discovery
description: >-
  Guide the implementation, debugging, and execution of Teacher AI 3-Layer Discovery System (Camada 1 SkillGraph cache, Camada 2 Multi-step DOM exploration with progressive scroll and homonym disambiguation, and Camada 3 Point-and-Click overlay).
---

# Teacher AI — Discovery Engine Runbook (Camadas 1, 2 e 3)

Este skill descreve como operar, depurar e estender o motor de descoberta de portais educacionais da Teacher AI.

## 1. Visão Geral da Arquitetura em 3 Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                      Comando do Usuário                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────▼─────────────┐
                │ Camada 1: Cache SkillGraph │  (Instantâneo, 0 LLM)
                └──────────────┬─────────────┘
                               │ Falha / Não Mapeado
                ┌──────────────▼─────────────┐
                │ Camada 2: Descoberta DOM   │  (Multi-step, scroll,
                │     Autônoma ao Vivo       │   matching bidirecional,
                └──────────────┬─────────────┘   desambiguação honesta)
                               │ Ambiguidade crítica / DOM dinâmico
                ┌──────────────▼─────────────┐
                │ Camada 3: Overlay Aponte   │  (Humano no circuito,
                │          e Clique          │   gravação guiada)
                └────────────────────────────┘
```

## 2. Camada 1: Cache Determinístico e SkillGraph

- **Localização dos Mapas:** `sidecar/portal_structure_maps/<portal_id>.json`.
- **Classe de Armazenamento:** `sidecar/portal_map_store.py` (`PortalMapStore`).
- **Comportamento:**
  - Se a rota da página e seletores já foram mapeados com confiança `high`, executa o clique/preenchimento diretamente.
  - Se um elemento falhar 3 vezes consecutivas (`incrementa_falhas`), o mapa é invalidado e aciona a Camada 2 automaticamente.

## 3. Camada 2: Descoberta Autônoma no DOM (`background.js`)

A Camada 2 opera dentro do contexto da extensão Google Chrome através de duas mensagens principais enviadas pelo `side_panel.js`:

### A. Sub-Navegação e Filtros: `DISCOVERY_SELECT_FILTER`
- **Arquivo:** `teacher-extension/background.js` (função tratadora do action `DISCOVERY_SELECT_FILTER`).
- **Objetivo:** Encontrar e clicar em botões horizontais, sub-abas e filtros (ex: `"Recados recebidos"`).
- **Mecanismo:** Matching bidirecional de substring normalizada (remove acentos, caixa baixa):
  - Exato: pontuação 100
  - Inicia com: pontuação 85
  - Contém ou é contido: pontuação 70-75

### B. Cards de Alunos e Listas: `DISCOVERY_FIND_AND_CLICK_STUDENT`
- **Arquivo:** `teacher-extension/background.js` (função tratadora do action `DISCOVERY_FIND_AND_CLICK_STUDENT`).
- **Objetivo:** Localizar o card do aluno pedido pelo professor em grids ou tabelas.
- **Passos Executados no DOM:**
  1. **Detecção de Container de Rolagem:** Localiza o container com `overflow-y: scroll|auto`.
  2. **Scroll Incremental Progressivo:** Rola o container verticalmente em blocos para acionar renderização virtual/lazy-load caso o aluno não esteja visível no topo.
  3. **Seleção da Folha Clicável:** Em vez de clicar no texto do card (que pode não disparar o evento), busca botões ou links filhos (`.btn-perfil`, `button`, `a`).
  4. **Desambiguação Honesta:** Se mais de um card contiver o nome (ex: homônimos como "Alice Almeida" e "Alice Santos" para o termo "Alice"), **não adivinha**:
     - Retorna `status: 'ambiguous'` com os metadados dos candidatos (`id`, `name`, `photoUrl`, `details`).
     - O `side_panel.js` renderiza um card de escolha com as fotos e turmas para a professora clicar.
  5. **Clique Direto:** Se houver exatamente 1 correspondência (ex: "Alice Almeida"), aciona `.click()` no botão filho e retorna `status: 'success'`.

## 4. Camada 3: Overlay Aponte-e-Clique (`content.js`)

- **Arquivo:** `teacher-extension/content.js`.
- **Quando Usar:** Quando o DOM for inteiramente opaco (canvas, iframes bloqueados, layouts desconhecidos).
- **Comportamento:** Injeta uma camada visual semi-transparente sobre o portal com bordas de destaque (`visual_highlight`). Permite à professora clicar no local exato enquanto o agente captura o evento e grava o seletor correspondente no `PortalMapStore`.
