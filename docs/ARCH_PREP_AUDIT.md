# Auditoria Pré-Arquitetura: Unificação Declarativa, Local-First e Native Messaging

**Data:** 10 de outubro de 2026  
**Auditor:** Engenheiro de Software Principal / Arquiteto de Sistemas  
**Status do Repositório:** `main` (commit `13e77e2`)  
**Arquivo de Referência Anterior:** `docs/STATUS_AUDIT.md`  

---

## 1. Resumo Executivo da Auditoria

1. **Estado Atual vs. Alvo:** O repositório possui alta maturidade em salvaguardas pontuais de escrita (`SafeWriter`, polaridade de faltas e validação visual), mas sua automação é procedural e dependente de seletores hardcoded (`MACHADO_SOBRINHO_PROFILE` em `sidecar/navigation_state_machine.py:111`), enquanto o interpretador real de grafos (`lib/skills/graphExecutor.ts`) é um módulo órfão em produção.
2. **Fragmentação de Esquemas:** Coexistem 5 formatos distintos de representação de tela/ações (`SkillGraph`, `portal_structure_maps`, `discovered_portal_maps`, `PortalStateGraph` e perfis estáticos em Python), impedindo a portabilidade e a execução generalista.
3. **Vulnerabilidade e PII Crítica:** O Supabase possui Row Level Security (RLS) permissivo com `USING (true) WITH CHECK (true)` para tabelas de alunos e notas (`supabase_setup.sql:60, 88`), 95 chaves em texto puro persistem no `localStorage` (`lib/localDB.ts:83`) e chaves de API vivem em texto não criptografado (`lib/autoApiSelector.ts:153`).
4. **Viabilidade do Alvo:** A migração para um app Desktop local-first com SQLite criptografado (SQLCipher) e uma Extensão Chrome MV3 como executora determinística via Chrome Native Messaging é plenamente realizável, exigindo unificar o mapa no `SkillGraph`, mover o interpretador de nós para a extensão e transferir a guarda de dados e credenciais para o cofre do SO (DPAPI).

---

## 2. AUDITORIA 1 — Inventário dos Formatos de Mapa

### 2.1 Identificação dos Formatos Existentes

O repositório apresenta 5 formatos de abstração de telas e ações:

| Formato | Quem Produz | Quem Consome | Onde é Persistido |
| :--- | :--- | :--- | :--- |
| **`SkillGraph` (JSON v1/v2)** | `sidecar/pathway_compiler_skill.py:75`, `sidecar/skill_recorder.py:309`, `sidecar/discovery_orchestrator.py:645` | `sidecar/skill_store.py:69` (`load_skill`), `lib/skills/graphExecutor.ts:121` (órfão em testes) | `sidecar/skills/{portal_id}__{task_id}/v{version}.json` e `localStorage['teacher_skill_graphs']` |
| **`portal_structure_maps`** | `sidecar/portal_structure_mapper.py:44` (`PortalStructureMapper.save_map`) | `sidecar/agentic_execution_loop.py` (contexto LLM), `sidecar/ppav_orchestrator.py` | `sidecar/portal_structure_maps/{portal_id}.json` |
| **`discovered_portal_maps`** | `sidecar/portal_map_store.py:145`, `lib/portalActionsEngine.ts:45`, `portalDiscoveryEngine.ts` | `sidecar/portal_map_store.py:96`, `lib/portalConnectionService.ts:60` | Supabase (`discovered_portal_maps`), `localStorage['teacher_discovered_portal_maps']` |
| **`PortalProfile` (Estático)** | Hardcoded no código fonte Python | `sidecar/navigation_state_machine.py:161` (`_find_profile`) | Em memória no arquivo `sidecar/navigation_state_machine.py:111, 147` |
| **`PortalStateGraph` (FSM)** | `sidecar/skills/state_graph_skill.py:137`, `ScreenStateFingerprinter` | `sidecar/hierarchical_planner_skill.py` (Dijkstra) | Em memória (objeto transient exportável via `to_dict()`) |

---

### 2.2 Tabela de Campos por Formato

#### A. `SkillGraph` (`sidecar/skill_graph_schema.py:67`, `lib/skills/skillGraphSchema.ts:111`)
- `id` (`str`, obrigatório): Identificador único da habilidade (ex: `skill_lancar_falta_mtqfm72i`).
- `name` (`str`, obrigatório): Nome amigável legível (ex: `"Lançar Falta"`).
- `portal_id` (`str`, obrigatório): Identificador do portal escolar (ex: `"machado_sobrinho"`).
- `task_id` (`str`, obrigatório): Ação semântica padronizada (`lancar_falta`, `lancar_nota`, `read_roster`).
- `version` (`int | str`, obrigatório): Versão incremental da receita.
- `entry_node` (`str`, obrigatório): ID do primeiro nó a ser executado no grafo.
- `nodes` (`Dict[str, SkillNode]`, obrigatório): Dicionário de nós indexados por ID.
  - `node.id` (`str`): ID do nó.
  - `node.type` (`SkillNodeType`): `NAVIGATE`, `LOCATE`, `READ`, `BRANCH`, `LOOP`, `WRITE`, `CLICK`, `CHECKPOINT`, `WAIT`.
  - `node.anchor` (`SkillAnchor`, opcional): Estratégia de localização (`aria_label`, `text_match`, `css_selector`, `semantic_role`, `vision_fallback`), `value`, `scope` e `description`.
  - `node.params` (`SkillNodeParams`, opcional): `variable_bindings`, `action_value`, `condition`, `is_submit_action` (booleano mandatória para nós `CLICK`).
  - `node.on_success` (`str | null`): Próximo nó em caso de êxito.
  - `node.on_fail` (`str | null`): Nó de desvio em caso de falha.
  - `node.retry_policy` (`RetryPolicy`): `max_attempts` (padrão 2), `backoff_ms` (padrão 500).
- `metadata` (`SkillGraphMetadata`): `success_rate`, `total_executions`, `created_at`, `updated_at`, `has_self_healed`, `author`, `columns` (metadados semânticos de colunas).

#### B. `portal_structure_maps` (`sidecar/portal_structure_mapper.py:182-192`)
- `_portal_id` (`str`, obrigatório): Identificador do portal.
- `_saved_at` (`str`, obrigatório): Timestamp ISO da gravação.
- `tabs` (dicionário de abas inspecionadas):
  - `tab_name` (`str`): Nome do menu/aba.
  - `tipo_conteudo` (`List[str]`): Tipos dominantes (`tabela`, `formulario`, `cards`, `texto`).
  - `titulos` (`List[str]`): Headings visíveis (h1-h4).
  - `tabelas` (`List[dict]`): `id`, `cabecalhos` (`th`), `total_linhas`, `amostra_primeira_linha`.
  - `campos_formulario` (`List[dict]`): `id`, `name`, `tipo`, `placeholder`, `opcoes` (em selects).
  - `cards` (`List[dict]`): `texto_resumo`.
  - `botoes_navegacao_seguros` (`List[dict]`): `id`, `texto` (exclui regex de ações perigosas).

#### C. `discovered_portal_maps` (`supabase/migrations/20260831_discovered_portal_maps.sql:8-54`, `sidecar/portal_map_store.py:26`)
- `id` (`uuid`, obrigatório): Chave primária.
- `portal_domain` (`text`, obrigatório): Domínio único (ex: `paineldoaluno.com.br`).
- `portal_display_name` (`text`, opcional): Nome do portal.
- `discovered_selectors` (`jsonb`, obrigatório): Seletores isolados (`roster_table`, `name_column`, `id_column`, `status_column`, `nee_selector`).
- `pagination_strategy` (`jsonb`, opcional): Estratégia (`type`: `next_button` | `page_numbers` | `infinite_scroll`, `nextSelector`, `maxPages`, `delayBetweenPagesMs`).
- `discovery_confidence` (`text`, obrigatório): `high` | `medium` | `low`.
- `discovered_by_teacher_id` (`uuid`, opcional): ID do professor no Auth.
- `validation_failures` (`int`, obrigatório): Contador de falhas (trigger de subdomínio white-label).
- `superseded_by` (`uuid`, opcional): Ponteiro para o mapa substituto (auto-cura).

#### D. `PortalProfile` (`sidecar/navigation_state_machine.py:90-108`)
- `domain_keywords` (`List[str]`): Termos de matching na URL.
- `login_url_fragments` (`List[str]`): Rotas indicativas de login pendente.
- `login_dom_selectors` (`List[str]`): Seletores de inputs de autenticação.
- `dashboard_url_fragments` / `dashboard_text_keywords` (`List[str]`): Marcadores da home.
- `target_table_selectors` / `target_table_text_keywords` (`List[str]`): Seletores de tabela.
- `nav_steps` (`List[dict]`): Sequência estática de passos procedurais (`action`, `url`, `selector`, `text_match`).

#### E. `PortalStateGraph` (`sidecar/skills/state_graph_skill.py:88-146`)
- `portal_id` (`str`): ID do portal.
- `nodes` (`Dict[str, dict]`): Estados de tela com `state_id`, `name`, `url_pattern`, `metadata`.
- `transitions` (`List[StateTransition]`): `from_state`, `to_state`, `action_type`, `target_selector`, `action_payload`, `preconditions`, `cost`, `description`.

---

### 2.3 Matriz de Capacidades dos Formatos Existentes

| Capacidade Arquitetural | `SkillGraph` | `portal_structure_maps` | `discovered_portal_maps` | `PortalProfile` | `PortalStateGraph` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Fingerprint de Tela/Estado** | ❌ Não possui | ⚠️ Apenas por aba | ❌ Apenas domínio | ⚠️ Regex de URL | ✅ Hash de contexto e rota |
| **Seletores com Fallback** | ⚠️ Em nós separados | ❌ Apenas DOM dump | ❌ Seletor único | ⚠️ Lista procedural | ❌ Seletor único por aresta |
| **Parâmetros / Variáveis** | ✅ `variable_bindings` | ❌ Ausente | ❌ Ausente | ❌ Ausente | ⚠️ Em `action_payload` |
| **Loops (Linha a Linha)** | ✅ Nó `LOOP` nativo | ❌ Ausente | ❌ Ausente | ❌ Ausente | ❌ Ausente |
| **Condicionais e Desvios** | ✅ `BRANCH` + `on_fail` | ❌ Ausente | ❌ Ausente | ❌ Ausente | ✅ Grafo de arestas |
| **Pós-condições (Asserts)** | ⚠️ Em `READ` verificado | ❌ Ausente | ❌ Ausente | ❌ Ausente | ⚠️ Em `preconditions` |
| **Checkpoint Humano Mandatório**| ✅ Nó `CHECKPOINT` | ❌ Ausente | ❌ Ausente | ❌ Ausente | ❌ Ausente |
| **Mapeamento ao Modelo Canônico**| ⚠️ Schema de colunas | ❌ Ausente | ⚠️ Índices de colunas | ❌ Ausente | ❌ Ausente |
| **Proveniência e Auditoria** | ✅ `author`, `created_at` | ⚠️ Apenas timestamp | ✅ `discovered_by_teacher_id` | ❌ Código estático | ❌ Ausente |

---

### 2.4 Recomendação de Unificação no `SkillGraph` Único

O `SkillGraph` deve se tornar o **schema canônico único**. Para isso, deve incorporar e descartar:

1. **O que absorver:**
   - De `PortalStateGraph`: Incorporar no cabeçalho do `SkillGraph` o `state_fingerprint` (`route_canonical`, `required_landmarks` e `context_scope`), permitindo validação imediata de onde o executor está antes de dar o primeiro passo (`sidecar/skills/state_graph_skill.py:61`).
   - De `discovered_portal_maps`: Absorver o bloco `pagination_strategy` (`type`, `next_selector`, `max_pages`) e a estratégia de degradação por falhas sucessivas (`validation_failures` e chave composta `domain/subdomain`).
   - De `portal_structure_maps`: Absorver o dicionário de campos disponíveis da tela para auto-recuperação sem LLM (se o seletor principal sumir, verificar se o campo equivalente está na lista estrutural da tela).
   - De `lib/skills/skillGraphSchema.ts`: Adotar as definições de tipagem semântica de colunas (`SemanticType`: `identifier`, `name`, `numeric_grade`, `status`).

2. **O que descartar:**
   - Descartar totalmente o `MACHADO_SOBRINHO_PROFILE` e os `PortalProfile` em código Python estático (`sidecar/navigation_state_machine.py:111`).
   - Descartar o formato plano `discovered_selectors` do Supabase (`supabase/migrations/20260831_discovered_portal_maps.sql:26`), que assume sempre tabelas convencionais e quebra em cartões ou layouts flexbox.
   - Descartar arquivos isolados `portal_structure_maps/<id>.json` que apenas duplicam informações em formatos não executáveis.

---

## 3. AUDITORIA 2 — Caminho de Execução Real (Produção)

### 3.1 Trace Ponta a Ponta dos 3 Casos de Uso Centrais

#### Caso (a): "Fazer Chamada" (Escrever Frequência)
1. **Entrada do Professor:** No painel lateral (`teacher-extension/side_panel.html`), o usuário clica em um chip ou fala "Lançar falta para o Hugo".
2. **Parsing da Intenção:**
   - `teacher-extension/side_panel.js:1923`: Executa requisição `POST http://localhost:8765/natural_intent` enviando `{ text, parse_only: true }`.
   - `sidecar/manual_runner.py:899`: Recebe o payload e invoca `intent_parser.py:parse_intent`.
   - `sidecar/intent_parser.py:1370`: Pseudonimiza a entrada em RAM (`pseudonymize`), processa a intenção estruturada e depseudonimiza (`depseudonymize`) retornando `{ acao: "lancar_falta", aluno: "Hugo", faltas: 1 }`.
3. **Exibição do Card de Confirmação:**
   - `teacher-extension/side_panel.js:2350`: Renderiza o card de aprovação (`showApprovalPreviewCard`) exibindo o nome do aluno, a turma e o valor a ser alterado.
4. **Confirmação e Handoff:**
   - `teacher-extension/side_panel.js:3371`: O professor clica no botão "Confirmar". A função invoca `dispatchPortalBridgeMessage({ action: 'EXECUTE_SAFE_WRITE', studentName: student.name, targetValue: intent.faltas, actionType: 'lancar_falta' })`.
   - `teacher-extension/side_panel.js:2483`: Encaminha a mensagem via `chrome.runtime.sendMessage` para o Service Worker da extensão.
5. **Execução no DOM:**
   - `teacher-extension/background.js:1510`: O Service Worker intercepta `message.action === 'EXECUTE_SAFE_WRITE'`.
   - `teacher-extension/background.js:1541`: Executa injeção direta de script na aba ativa via `chrome.scripting.executeScript`.
   - `teacher-extension/background.js:1545`: O script injetado faz busca procedural imperativa: `const rows = Array.from(document.querySelectorAll('table tr'))`, localiza a linha pelo nome do aluno, procura a caixa de marcação (`checkbox`) e aciona a alteração com polaridade estrita (`teacher-extension/attendancePolarity.js:36`).
6. **Fechamento e Sincronização:**
   - `teacher-extension/side_panel.js:3380`: Exibe o card de sucesso. Em seguida (linha 3389), despacha um `fetch('http://localhost:3000/api/students/write-through')` para atualizar os dados no Supabase.
   - *Nota de Bypass:* O `SkillGraph` foi **completamente ignorado** neste fluxo.

---

#### Caso (b): "Extrair Notas e Alunos" (Read Roster)
1. **Disparo:** O professor solicita a extração de alunos da turma no side panel ou via comando de leitura.
2. **Extensão para Background:**
   - `teacher-extension/side_panel.js:2790`: Intercepta a ferramenta `read_roster`.
   - `teacher-extension/background.js:1246`: Intercepta o evento `read_roster`.
3. **Tentativa Falsa de SkillGraph:**
   - `teacher-extension/background.js:1247-1249`: Envia mensagem para a aba ativa:
     ```javascript
     chrome.tabs.sendMessage(targetTabId, {
       action: 'EXECUTE_SKILL_GRAPH',
       skillGraph: null // <--- GRAFO NULO ENVIADO
     });
     ```
4. **Content Script e Grafo Hardcoded:**
   - `teacher-extension/content.js:1102`: Recebe a mensagem e faz fallback para um grafo estático pré-embutido:
     `const graphToRun = message.skillGraph || CANONICAL_READ_ROSTER_GRAPH;`
   - `teacher-extension/content.js:1725`: `CANONICAL_READ_ROSTER_GRAPH` possui URL e seletores fixos apontando para `https://machadosobrinho.paineldoaluno.com.br/professor_notas`.
5. **Fallback Procedural:**
   - `teacher-extension/background.js:1253`: Se a execução do grafo falhar ou não retornar dados, executa fallback: `chrome.tabs.sendMessage(targetTabId, { action: 'READ_ACTIVE_PORTAL_ROSTER' })`.
   - `teacher-extension/content.js`: Realiza varredura direta via `document.querySelectorAll('table tbody tr')`, extraindo os nomes nas primeiras colunas sem interpretar o grafo.
6. **Retorno:**
   - Os dados são devolvidos ao side panel e sincronizados na rota `POST /api/students/import` (`teacher-extension/side_panel.js:1032`).

---

#### Caso (c): "Mapear um Portal Novo"
1. **Identificação da Falta de Mapa:**
   - No Sidecar: `sidecar/manual_runner.py:325` verifica se existe `SkillGraph` gravado para o par `(portal_id, acao)`. Se não encontrar, aciona `DiscoveryOrchestrator.execute(...)`.
2. **Escada de Descoberta:**
   - `sidecar/discovery_orchestrator.py:230`: `DiscoveryOrchestrator.execute` verifica se o mapa está em drift (`is_drifted`).
   - Se o mapa não existe, escala para o Nível 2 (LLM ReAct / Browser-Use) via `sidecar/browser_use_agent.py` ou `sidecar/agentic_execution_loop.py:58`.
3. **Exploração Multimodal / ReAct:**
   - O agente explora a tela através de 8 ferramentas (`navigate_to_tab`, `click_element`, `fill_field`, `extract_table_data`, `request_human_help`, etc.).
   - A cada ação, o `sidecar/skill_recorder.py:139` registra a tupla de interação `(URL, Elemento, Ação, Valor)`.
4. **Compilação e Trava de Segurança:**
   - `sidecar/discovery_orchestrator.py:645`: Compila a sequência gravada em uma instância Pydantic de `SkillGraph`.
   - `sidecar/discovery_orchestrator.py:656`: Executa a trava estática mandatória `assert_graph_safe(graph)` (`sidecar/graph_validator.py:40`). Se não houver nó `CHECKPOINT` antes de submissões de escrita, a gravação é bloqueada.
5. **Persistência em Disco:**
   - `sidecar/skill_store.py:36`: Grava a habilidade compilada no arquivo `sidecar/skills/{portal_id}__{task_id}/v1.json`.

---

### 3.2 Inventário de Módulos: Caminho de Produção vs. Módulos Órfãos

| Módulo | Status | Evidência (`arquivo:linha`) | Diagnóstico |
| :--- | :---: | :--- | :--- |
| `lib/skills/graphExecutor.ts` | **ÓRFÃO** | `lib/skills/graphExecutor.ts:1` | Interpretador de grafos completo em TypeScript (1.016 linhas). Chamado **apenas** por arquivos de teste em `__tests__/`. Não é invocado pelo frontend, extensão ou sidecar em tempo de execução. |
| `sidecar/skills/state_graph_skill.py` | **ÓRFÃO** | `sidecar/skills/state_graph_skill.py:137` | Modela o portal como FSM e calcula caminhos Dijkstra. Nunca é chamado no fluxo de produção de `manual_runner.py` ou `browser_harness_runner.py`. |
| `sidecar/portal_map_federation.py` | **ÓRFÃO** | `sidecar/portal_map_federation.py:4` | Módulo de federação P2P de mapas. Não possui integração ativa na aplicação. |
| `components/modules/ExamBuilder.tsx`| **ÓRFÃO** | `components/modules/ExamBuilder.tsx:1` | Componente de 1.452 linhas mantido no repositório sem rota ativa no Next.js. |
| `teacher-extension/background.js` | **PRODUÇÃO** | `teacher-extension/background.js:1510` | Choke point real de escrita (`EXECUTE_SAFE_WRITE`) e injeção no DOM. |
| `teacher-extension/side_panel.js` | **PRODUÇÃO** | `teacher-extension/side_panel.js:3371` | Interface do usuário e despacho de mensagens para a extensão e APIs. |
| `sidecar/manual_runner.py` | **PRODUÇÃO** | `sidecar/manual_runner.py:516` | Servidor HTTP local (porta 8765) que despacha intenções e automações de CLI. |
| `sidecar/safe_writer.py` | **PRODUÇÃO** | `sidecar/safe_writer.py:144` | Motor de digitação sequencial nativa com validação visual e anti-drift. |
| `sidecar/graph_validator.py` | **PRODUÇÃO** | `sidecar/graph_validator.py:40` | Trava de segurança que impede persistência de grafos sem checkpoints. |

---

### 3.3 Ponto Exato de Corte do Bypass do `SkillGraph`

O `SkillGraph` é gerado e validado, mas na hora de executar, o código **salta por cima do grafo**:

1. **No Sidecar Python:**
   - Em `sidecar/discovery_orchestrator.py:258`, quando um `SkillGraph` existente é carregado com sucesso, ele chama:
     ```python
     local_res = await self._execute_local_graph(existing_graph, parametros, depth=depth)
     ```
   - No entanto, a implementação de `_execute_local_graph` (`sidecar/discovery_orchestrator.py:660-675`) **não percorre os nós do grafo**. Ela repassa o controle para `self.runner.process_task`, que cai em `browser_harness_runner.py:514` e executa seletores genéricos fixos:
     ```python
     # browser_harness_runner.py:514
     row_locator = ctx.locator(f"table tr:has-text('{aluno}')")
     ```
2. **Na Extensão Chrome:**
   - Em `teacher-extension/background.js:1249`, a mensagem de execução envia `skillGraph: null`, fazendo com que o `content.js` caia no fallback hardcoded de Machado Sobrinho (`content.js:1725`) ou em varredura crua de tags `<table>`.

**Ponto de Corte Arquitetural:**
Para ativar a execução real do grafo, o executor de nós em TypeScript (`lib/skills/graphExecutor.ts:350-430`) deve ser movido para dentro da extensão Chrome (`teacher-extension/graph_runner.js`). O Service Worker deve injetar o grafo JSON no content script, e o content script deve interpretar os nós sequencialmente (`NAVIGATE` $\rightarrow$ `LOCATE` $\rightarrow$ `READ`/`WRITE` $\rightarrow$ `CHECKPOINT` $\rightarrow$ `CLICK`).

---

### 3.4 Matriz de Migração: Sidecar Python vs. Extensão vs. App Desktop

| Capacidade | Onde roda hoje | Para onde deve migrar | Justificativa Técnica |
| :--- | :---: | :---: | :--- |
| **Interpretação do `SkillGraph`** | Procedural no Sidecar / Ignorado | **Extensão Chrome (JS/TS)** | Roda direto no contexto do DOM da aba autenticada, com latência zero e sem bridge CDP. |
| **Digitação Segura (`SafeWriter`)** | Python (`safe_writer.py`) | **Extensão Chrome (Content Script)** | Dispara eventos de teclado nativos e prototype setters sem precisar de Playwright. |
| **Banco de Dados Local** | `localStorage` (5MB) / Supabase | **App Desktop (SQLite / SQLCipher)** | Persistência ilimitada, integridade relacional, ACID e criptografia em repouso. |
| **Cofre de Credenciais** | Inexistente / Plaintext | **App Desktop (Windows DPAPI)** | Chaves e senhas criptografadas pela chave do perfil de usuário do SO. |
| **Inferência NLU (Intenções)** | Python (`intent_parser.py`) | **Desktop (Ollama / Local SLM)** | Mantém o processamento semântico 100% offline via CPU/GPU local. |
| **Compilação de Mapas (Visão)** | Python (`discovery_orchestrator.py`) | **Desktop (Sidecar Local sob demanda)**| Acionada apenas quando um portal novo precisar ser mapeado do zero. |

---

### 3.5 Canal de Comunicação Extensão $\leftrightarrow$ Desktop: Estado Atual vs. Native Messaging

#### Estado Atual (Fragmentado e Inseguro):
- **HTTP REST:** Extensão faz `fetch('http://localhost:8765/natural_intent')` (`side_panel.js:1923`). Exige servidor HTTP aberto escutando na máquina, validação manual de token no header `X-Sidecar-Token` e configurações complexas de CORS.
- **WebSocket:** Extensão conecta em `ws://localhost:8765` ou `ws://localhost:8766` (`extension_bridge.py:100`). Propenso a desconexões e interferências de firewalls locais.
- **Porta CDP 9222:** Sidecar conecta via WebSocket na porta de debug do Chrome (`cdp_connector.py:40`). Exige abrir o navegador via script `.bat` com flags de automação, exibindo o banner "Chrome está sendo controlado por software de automação".

#### Arquitetura Alvo via Chrome Native Messaging:
1. **Manifesto do Host (`com.teacherai.desktop.json`):**
   Registrado na chave do Windows Registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.teacherai.desktop`.
   Aponta para o executável do Desktop App (`teacher-ai-desktop.exe` ou `python -m desktop_host`).
2. **Protocolo:**
   Comunicação puramente via `stdin` e `stdout` padronizados pelo Chrome. Cada mensagem é precedida por um prefixo inteiro de 4 bytes (little-endian) contendo o comprimento exato do JSON em UTF-8.
3. **Na Extensão:**
   ```javascript
   const port = chrome.runtime.connectNative('com.teacherai.desktop');
   port.onMessage.addListener((msg) => { ... });
   port.postMessage({ action: 'GET_SKILL_GRAPH', portalId: 'portal_a', taskId: 'lancar_falta' });
   ```
4. **Vantagens de Segurança:**
   - **Zero Portas Abertas:** Nenhuma porta TCP (8765, 8766, 9222) aberta no `localhost`.
   - **Proteção Total contra Abas Web:** Abas externas no navegador não têm como se comunicar com Native Messaging Hosts; apenas a extensão com o ID autorizado no manifesto pode abrir o canal.
   - **Ciclo de Vida Automático:** O Chrome inicia o processo host quando a extensão precisa e encerra quando o canal é fechado.

---

## 4. AUDITORIA 3 — Dados e PII

### 4.1 Mapa Completo de Fluxo de PII

| Tipo de Dado | Destinos Identificados | Evidência (`arquivo:linha`) | Risco de Exposição |
| :--- | :--- | :--- | :---: |
| **Nome do Aluno** | `localStorage['teacher_students']`<br>Supabase (`students`, `portal_scraped_data`)<br>Logs do Sidecar (`print`)<br>Payload de Chamada LLM Nuvem | `lib/localDB.ts:85`<br>`supabase_setup.sql:46, 295`<br>`sidecar/browser_harness_runner.py:534`<br>`lib/autoApiSelector.ts:229` | **CRÍTICO** (Não pseudonimizado em chamadas gerais da UI) |
| **Frequência (Presença/Falta)** | `localStorage['teacher_students']`<br>Supabase (`portal_scraped_data`)<br>Extensão (`sessionStorage`) | `lib/localDB.ts:85`<br>`supabase_setup.sql:293`<br>`teacher-extension/side_panel.js:2511` | **ALTO** |
| **Notas e Pareceres** | `localStorage['teacher_students']`<br>`localStorage['teacher_saved_exams']`<br>Supabase (`students.grades`, `exams`) | `lib/localDB.ts:85, 110`<br>`supabase_setup.sql:52, 97` | **CRÍTICO** |
| **Dados Pessoais Privados (Responsáveis, Telefone, Mensalidade)** | `localStorage['teacher_private_students']`<br>Supabase (`private_students`) | `lib/localDB.ts:88`<br>`supabase_setup.sql:65-82` | **CRÍTICO** (Dados financeiros e contatos de responsáveis expostos) |
| **Chaves de API (OpenAI, Gemini, Claude, Groq)** | `localStorage['teacher_apis']`<br>Header HTTP / Client-side fetch | `lib/autoApiSelector.ts:153`<br>`lib/autoApiSelector.ts:207, 249` | **CRÍTICO** (Exposição a qualquer script XSS no navegador) |
| **Credenciais de Portal (Login/Senha/CPF)** | Perfil persistente do Chrome<br>Memória RAM do Launcher | `sidecar/chrome_launcher.py:40`<br>`sidecar/navigation_state_machine.py:115` | **MÉDIO** (Falta cofre local com cifra do SO) |

---

### 4.2 Auditoria de Segurança do Supabase: Políticas de RLS

No arquivo `supabase_setup.sql`, todas as políticas de Row Level Security (RLS) das tabelas principais contêm a instrução:

```sql
-- supabase_setup.sql:15, 60, 88, 286, 302
CREATE POLICY "Allow anon full access on students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access on private_students" ON private_students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access on portal_scraped_data" ON portal_scraped_data FOR ALL USING (true) WITH CHECK (true);
```

#### Efeito Real:
Qualquer usuário, atacante ou bot com acesso à URL do projeto Supabase e à chave pública anônima (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, exposta em `.env.local` e no bundle JS do cliente) pode:
1. Executar `SELECT * FROM students` e obter nome completo, email, notas e métricas de todos os alunos cadastrados.
2. Executar `SELECT * FROM private_students` e obter telefone, nome dos pais, valor de mensalidade e situação de pagamento.
3. Executar `DELETE FROM students` ou injetar dados arbitrários.

#### Classificação:
- Se o Supabase estiver configurado em um ambiente público de produção ou homologação: **INCIDENTE ATIVO CRÍTICO (Violação Direta da LGPD para Dados de Menores de Idade)**.
- Se o Supabase estiver rodando estritamente em mock local / sem credenciais conectadas: **RISCO LATENTE CRÍTICO**.

---

### 4.3 Inventário de Segredos Expostos

| Arquivo Auditado | Tipo de Segredo Encontrado | Modo de Exposição |
| :--- | :--- | :--- |
| `.env.local` | Chave de Serviço Supabase (`SUPABASE_SERVICE_ROLE_KEY`) | Chave mestra de bypass total de RLS salva no arquivo local |
| `.env.local` | Token de Acesso de Gestão Supabase (`SUPABASE_ACCESS_TOKEN`) | Token com permissão administrativa sobre o projeto |
| `.env.local` | Chaves de Provedores de IA (`GEMINI_API_KEY`, `GROQ_API_KEY`) | Chaves de faturamento de APIs em nuvem |
| `.env.local` | Chaves Públicas Prefixadas (`NEXT_PUBLIC_GEMINI_KEY`, `NEXT_PUBLIC_GROQ_KEY`)| Chaves privadas indevidamente prefixadas com `NEXT_PUBLIC_`, expostas no bundle compilado do navegador |
| `lib/autoApiSelector.ts:153` | Chaves BYOK do Professor (OpenAI, Anthropic, DeepSeek, Gemini) | Armazenadas em texto puro sem cifra na chave `teacher_apis` do `localStorage` |

---

### 4.4 Pseudonimização: Aplicação vs. Pontos de Contorno

1. **Onde é Aplicada com Rigor:**
   - Em `sidecar/intent_parser.py:1370`: O motor invoca `pseudonymize(user_text, known_students)` (`sidecar/pseudonymizer.py:71`), gerando tokens efêmeros `ALUNO_<hex>` em memória RAM antes de enviar o comando da professora para classificação semântica no Groq/Gemini. O token map vive em memória e restaura o nome após a resposta.
2. **Onde é Contornada (Vazamento para Nuvem):**
   - **Chamadas de Agente no Frontend (`lib/autoApiSelector.ts:182`):** A função `executeUnifiedAiCall` recebe prompts livres da interface para elaboração de pareceres pedagógicos e geração de diagnósticos e os encaminha diretamente para Anthropic, OpenAI, DeepSeek ou Gemini sem acionar o pseudonimizador.
   - **Engines de Percepção de Página (`sidecar/ppav_orchestrator.py:90`, `sidecar/page_reader_engine.py:50`):** Ao lerem a tabela de alunos para inferência multimodal, capturam o DOM e snapshots brutos da tela. O arquivo `page_reader_engine.py` não contém chamadas para `pseudonymize()`, expondo nomes de alunos em prompts de visão multimodal se acionado em nuvem.

---

### 4.5 Proposta de Esquema Relacional SQLite Local Criptografado (SQLCipher)

Substituição integral das 95 chaves de `localStorage` e tabelas do Supabase por um arquivo SQLite local `teacher_data.db` cifrado com AES-256:

```sql
-- Chave derivada via PBKDF2 da senha mestra / cofre local
-- PRAGMA key = 'chave_derivada_dpapi';

CREATE TABLE schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT,
  year TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  portal_student_id TEXT, -- Matrícula no portal da escola
  full_name TEXT NOT NULL,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_evaluations (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  term TEXT NOT NULL, -- '1_bimestre', '2_bimestre'
  subject TEXT NOT NULL,
  grade_value REAL,
  absences_count INTEGER DEFAULT 0,
  pedagogical_notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE private_students (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  guardian_name TEXT,
  phone TEXT,
  email TEXT,
  monthly_fee REAL DEFAULT 0,
  due_day INTEGER DEFAULT 10,
  payment_status TEXT DEFAULT 'em_dia',
  diagnostic_notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE skill_graphs (
  id TEXT PRIMARY KEY,
  portal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  graph_json TEXT NOT NULL, -- Payload JSON serializado do SkillGraph
  success_rate REAL DEFAULT 100.0,
  last_verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(portal_id, task_id, version)
);

CREATE TABLE execution_audit_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  portal_domain TEXT NOT NULL,
  action_type TEXT NOT NULL,
  student_ref TEXT,
  before_value TEXT,
  after_value TEXT,
  verified_by TEXT NOT NULL, -- 'read_back_input_value', 'dom_inspection'
  status TEXT NOT NULL,      -- 'SUCCESS', 'REVERTED', 'FAILED'
  error_message TEXT,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE portal_credentials_vault (
  portal_domain TEXT PRIMARY KEY,
  username_enc BLOB,         -- Criptografado com DPAPI / SQLCipher
  password_enc BLOB,
  cookies_session_json BLOB,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. AUDITORIA 4 — Triagem de Falhas e Limitações

### 5.1 Triagem Detalhada das 8 Falhas de Teste

| Teste Auditado | Arquivo e Linha | Causa-Raiz Factual | Classificação |
| :--- | :--- | :--- | :---: |
| `test_cdp_health_closed_port_fails_fast` | `sidecar/tests/test_trio_optimizations.py:41` | Asserção de tempo limite de probe TCP: demorou 0.285s contra o teto rígido de 0.250s devido a concorrência de I/O no Windows. | **(i) Teste frágil** (Timing jitter) |
| `test_full_side_panel_approval_workflow_e2e` | `sidecar/tests/test_side_panel_approval_card_e2e.py:98` | Timeout de 6000ms aguardando `#card-disambiguation`. O side panel tenta chamar `POST http://localhost:8765/natural_intent` que não estava ativo/mockado no harness. | **(i) Teste frágil** (Acoplamento de ambiente) |
| `test_react_loop_reading_horarios_e2e` | `sidecar/tests/test_agentic_data_reading_e2e.py:83` | O loop ReAct divergiu na contagem de turnos esperada (`turns_count == 2`) ao tentar ler a tabela de horários. | **(iii) Limitação de modelo/LLM** |
| `test_react_loop_generalization_query_grades_without_navigation_e2e` | `sidecar/tests/test_agentic_data_reading_e2e.py:105` | Falha do agente em sintetizar dados tabulares sem executar um passo de navegação desnecessário. | **(iii) Limitação de modelo/LLM** |
| `test_unprecedented_3step_generalization_task` | `sidecar/tests/test_agentic_generalization_e2e.py:47` | O planejador ReAct falhou na cadeia sequencial de 3 passos inéditos (`Arquivos` $\rightarrow$ `Filtro de Turma` $\rightarrow$ `Configurações`). | **(iii) Limitação de modelo / (iv) Problema de design** |
| `F1 Static Audit & Evidence Gated Replies` | `__tests__/rfc006EvidenceGatedReplies.test.ts:4` | O arquivo importa `../lib/composeAssistantReply`, porém o módulo `composeAssistantReply.ts` não existe no caminho (`Test-Path = False`). | **(ii) Bug real** (Módulo ausente / Import quebrado) |
| `Motor de Psicometria Clássica (Divergência)` | `__tests__/empiricalPsychometrics.test.ts:112` | Falha lógica: `psych.isDivergentFromNominal` retornou `false` quando deveria ser `true` para itens fáceis com 80% de erro. | **(ii) Bug real** (Lógica de cálculo) |
| `Proveniência HTML Round-Trip` | `__tests__/provenanceIntegrity.test.ts:126` | Divergência de enum no deserializador: retornou `'teacher_provided'` quando o teste esperava `'verified'`. | **(ii) Bug real** (Contrato de dados) |

---

### 5.2 Avaliação do Passo P2 (Exploração com LLM) como Entrada de Pipeline

**Diagnóstico: O P2 NÃO ESTÁ SÓLIDO como gerador autônomo de mapas do zero.**

#### Problemas de Fundo Identificados:
1. **Falta de Indexação Estável de Elementos (Set-of-Marks):** O ReAct em `sidecar/agentic_execution_loop.py` opera tentando adivinhar seletores CSS ou nomes textuais a partir de um dump cru de acessibilidade. Sem badges numéricos efêmeros injetados no DOM (como no Nanobrowser), o LLM frequentemente erra o elemento em interfaces com múltiplos botões e cards similares.
2. **Latência Incompatível e Esgotamento de Turnos:** Cada turno de raciocínio multimodal em nuvem adiciona de 3 a 8 segundos. Em tarefas de 3 a 5 passos, a latência total ultrapassa 20 segundos, provocando timeouts frequentes de página e de WebSocket.
3. **Fragilidade com SLMs Locais:** Pequenos modelos locais (7B-8B parâmetros) alucinam a sintaxe JSON exigida pelo schema de ferramentas do ReAct, gerando quebras de parsing frequentes.

#### Conclusão Arquitetural:
A exploração não deve ser 100% autônoma às cegas. O pipeline de mapeamento ideal deve ser **semi-supervisionado / orientado por demonstração do professor**:
- O professor executa o fluxo uma vez na tela do portal real com a extensão gravando o trace de eventos reais (`sidecar/skill_recorder.py`).
- O LLM atua estritamente na etapa posterior de **compilação offline** (analisando o trace gravado para deduzir âncoras resilientes com fallbacks semânticos e identificar campos variáveis), gerando um `SkillGraph` determinístico e seguro de primeira.

---

### 5.3 Taxa de Sucesso nos Portais Sintéticos (`eval_harness.py`)

A suíte contínua `audit/eval_harness.py` avalia o agente contra 5 cenários DEV e 5 cenários HOLDOUT no servidor local (porta 8899).

- **Taxa de Sucesso em Cenários Padronizados (DEV):** **100% (5/5)**
  - Tabela Padrão (`/portal/standard`): Sucesso total na localização e preenchimento de notas e faltas.
  - Inversão de Colunas (`/portal/mutation/columns`): Resolvido pela correspondência de cabeçalhos semânticos.
  - Sinônimos Regionais (`/portal/mutation/synonyms`): Resolvido pelo mapeamento de vocabulário educacional.
  - Interface em Inglês (`/portal/mutation/english`): Resolvido sem degradação.
  - Células Mescladas (`/portal/mutation/merged_cells`): Resolvido pela normalização de rowspan/colspan.
- **Taxa de Sucesso em Cenários Complexos (HOLDOUT):** **40% (2/5)**
  - Sucesso: Cabeçalhos em 2 Linhas (`two_row_headers`) e Detecção de Inputs Ocultos/Honeypots (`hidden_duplicate_inputs`).
  - Falha Crítica: Tabela Virtualizada (`virtualized`): Falha ao rolar elementos para o DOM.
  - Falha Crítica: Iframe Cross-Origin (`cross_origin_iframe`): Falha de acesso ao documento por restrições de mesma origem do navegador.
  - Falha Crítica: Formulário Estrito com Validação Não-Tabular (`strict_form`): Falha ao preencher campos de texto dependentes e acionar a submissão correta.

---

## 6. EXTRA — Cobertura de Arquétipos de Portais Escolares

Análise da cobertura do servidor de testes `audit/synthetic_portals_server.py`:

| Arquétipo de Portal Escolar | Status no Servidor Sintético | Rota Sintética | Lacunas Observadas |
| :--- | :---: | :--- | :--- |
| **Tabelas Clássicas & Legadas** | ✅ **COBERTO** | `/portal/standard`, `/portal/mutation/columns`, `/portal/mutation/merged_cells` | Excelente cobertura de tabelas com células mescladas e cabeçalhos em duas linhas. |
| **Iframes Legados** | ✅ **COBERTO** | `/portal/scenario/iframe`, `/portal/scenario/cross_origin_iframe` | Cobre frames de mesma origem e cross-origin. |
| **SPAs & Web Components** | ✅ **COBERTO** | `/portal/scenario/shadow_dom`, `/portal/scenario/delayed_spa` | Cobre renderização tardia e encapsulamento Shadow Root. |
| **Layouts Baseados em Div/Cards** | ✅ **COBERTO** | `/portal/mutation/divs` | Cobre grids responsivos sem tags `<table>`. |
| **Paginação por Botão** | ✅ **COBERTO** | `/portal/scenario/pagination` | Cobre transição de páginas via botão "Próxima". |
| **Tabelas Virtualizadas (Windowing)** | ✅ **COBERTO** | `/portal/mutation/virtualized` | Cobre desmontagem de nós fora da viewport. |
| **Modais e Overlays Bloqueadores** | ✅ **COBERTO** | `/portal/scenario/modal_overlay` | Cobre banners de aviso com backdrop. |
| **Formulários Estritos & Textareas** | ✅ **COBERTO** | `/portal/scenario/strict_form` | Cobre formulários com validação de justificativa. |
| **Somente Leitura / Texto Livre** | ✅ **COBERTO** | `/portal/scenario/unstructured_text` | Cobre atas e textos não-estruturados. |
| **Semântica Invertida de Faltas** | ✅ **COBERTO** | `/portal/scenario/attendance_polarity_inverted` | Cobre marcação onde caixa marcada = ausente. |
| **SSO / Redirecionamento Externo** | ❌ **AUSENTE** | NÃO ENCONTRADO | Não há simulação de autenticação com provedores externos (ex.: Gov.br, Google Workspace, Azure AD) ou troca de tokens SAML/OIDC. |
| **Wizard / Fluxo Multi-Etapa** | ❌ **AUSENTE** | NÃO ENCONTRADO | Não há formulários divididos em etapas sequenciais (Passo 1: Turma $\rightarrow$ Passo 2: Alunos $\rightarrow$ Passo 3: Avaliações $\rightarrow$ Passo 4: Resumo). |
| **Upload / Download de Arquivos** | ❌ **AUSENTE** | NÃO ENCONTRADO | Não há cenários de download de boletins em PDF ou upload de planilhas de notas `.xlsx`/`.csv`. |
| **Desafios Interativos (CAPTCHA/2FA)**| ❌ **AUSENTE** | NÃO ENCONTRADO | Não há portais simulados disparando desafios visuais para testar o handoff humano. |
| **Scroll Infinito com Carregamento Assíncrono** | ❌ **AUSENTE** | NÃO ENCONTRADO | O servidor possui tabela virtualizada, mas não possui scroll infinito com requisições XHR reais disparadas por `IntersectionObserver`. |

---

## 7. Lista Priorizada de Achados de Auditoria

### 🔴 Crítico (Bloqueadores de Segurança e Arquitetura)
1. **Políticas RLS do Supabase Irrestritas (`supabase_setup.sql:15, 60, 88, 302`):** Tabelas `students`, `private_students` e dados extraídos de portais estão com `USING (true) WITH CHECK (true)`, permitindo leitura e exclusão pública anônima de dados de menores e responsáveis escolares.
2. **Exposição de Chaves BYOK em Plaintext (`lib/autoApiSelector.ts:153`):** Chaves de API de múltiplos provedores de IA estão gravadas sem criptografia no `localStorage`, acessíveis a qualquer script no navegador.
3. **Chaves Privadas no Bundle Público (`.env.local`):** Chaves Gemini e Groq prefixadas com `NEXT_PUBLIC_`, gerando vazamento no código JavaScript do cliente.
4. **Bypass Real do SkillGraph em Produção (`discovery_orchestrator.py:660`, `background.js:1249`):** O `SkillGraph` é salvo e validado, mas o runner ignora os nós e executa código procedural com seletores estáticos. O interpretador real (`graphExecutor.ts`) é um módulo órfão.

### 🟡 Alto (Débitos Técnicos e Fragilidades de Execução)
1. **Seletores e Perfis Hardcoded (`navigation_state_machine.py:111`, `content.js:1725`):** Presença de perfis fixos para Machado Sobrinho viola o caráter generalista do produto.
2. **Sobrecarga de Persistência no `localStorage` (`lib/localDB.ts:83`):** 95 chaves concorrem pelo teto de 5MB do navegador, sob risco iminente de `QuotaExceededError` ao salvar históricos e notas.
3. **P2 com Falhas de Exploração Autônoma:** O loop ReAct às cegas falha em 3 dos 5 testes E2E devido à falta de crachás numéricos transitórios (Set-of-Marks) e alta latência por turno.
4. **Import Quebrado quebrando o Vitest (`__tests__/rfc006EvidenceGatedReplies.test.ts:4`):** O arquivo importa `composeAssistantReply.ts` inexistente, provocando falha na suíte.

### 🟢 Médio (Melhorias de Resiliência e Cobertura)
1. **Acoplamento à Porta CDP 9222 e Scripts Batch:** A necessidade de iniciar o Chrome por terminal bloqueia a usabilidade para professores leigos.
2. **Ausência de Arquétipos de SSO e Wizards:** O servidor de testes sintéticos não cobre fluxos multi-etapa nem autenticações institucionais.
3. **Flakiness de Testes de Timing no Windows (`test_trio_optimizations.py:41`):** Asserção de tempo limite estrito (0.25s) falhando em máquinas sob carga.

---

## 8. Perguntas em Aberto para o Dono do Produto

1. **Estratégia de Transição para o Supabase:** O Supabase em nuvem é um requisito indispensável para sincronização entre dispositivos móveis da professora, ou o produto pode ser 100% local-first (desktop único com SQLite e sem dados escolares em nuvem)?
2. **Stack do Aplicativo Desktop:** O invólucro do app desktop deve ser baseado em **Tauri (Rust + Webview)** pela leveza e segurança de memória, ou em **Electron (Node.js)** pelo reaproveitamento imediato de código TypeScript do Next.js?
3. **Fluxo de Criação de Mapas (Geração de Receitas):** Para novos portais escolares, prefere-se:
   - *Opção A:* A professora demonstra o fluxo uma vez na tela (Record & Assist), e a IA gera o `SkillGraph` a partir do trace gravado (abordagem determinística e de baixo custo).
   - *Opção B:* O agente de visão explora o portal sozinho às cegas (maior risco de cliques indesejados, timeouts e alto consumo de tokens).
4. **Tratamento das Chaves de IA Existentes:** Podemos revogar imediatamente as chaves expostas no `.env.local` e migrar o armazenamento de BYOK exclusivamente para o cofre do sistema operacional (Windows Credential Manager / DPAPI)?
