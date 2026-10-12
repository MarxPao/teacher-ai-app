# Relatório da Rodada Única de Correção (CORRECAO_GATE_A.md)

**Data de Execução:** 12 de Outubro de 2026  
**Branch:** `fechamento-integracao`  
**Escopo:** Rodada única de correção pós-Gate A (Tarefas R0 a R6)  
**Status do Gate A:** `PENDENTE (dono)`

---

## 1. Commits da Rodada de Correção

| Tarefa | Commit | Mensagem do Commit | Descrição da Mudança |
| :--- | :---: | :--- | :--- |
| **R1** | `7f2558a` | `corrige(R1): background.js remove fallbacks e responde MAP_NOT_FOUND` | Removido `skillGraph: null` e o fallback `READ_ACTIVE_PORTAL_ROSTER`; responde `MAP_NOT_FOUND`. |
| **R2** | `9a956d5` | `corrige(R2): content.js remove grafo canonico e exige skillGraph` | Removido `CANONICAL_READ_ROSTER_GRAPH`; exige `message.skillGraph` e responde `MAP_NOT_FOUND`. |
| **R3** | `70ca5ff` | `corrige(R3): side_panel.js orienta uso da aba v2` | Substituída chamada de `READ_ACTIVE_PORTAL_ROSTER` por aviso orientando uso da aba v2. |
| **R4** | `3dc2935` | `corrige(R4): manifesto aponta para side_panel_v2.html` | Criado `side_panel_v2.html` mínimo e apontado `default_path`; expurgados recursos web acessíveis. |
| **R5** | `39ecd2e` | `corrige(R5): dist/ da extensao fora do controle de versao` | Removidos artefatos compilados de `teacher-extension/dist` do git cache e adicionado ao `.gitignore`. |
| **R6** | *(HEAD)* | `corrige(R6): verificacao e relatorio` | Verificações de aceitação, compilação de bundles, tipagem estática e documentação. |

---

## 2. Saídas Literais das 4 Buscas de Aceitação

### Busca 1 — Remoção total de fallbacks e grafos canônicos
```powershell
git grep -n -E "CANONICAL_READ_ROSTER_GRAPH|skillGraph: null|READ_ACTIVE_PORTAL_ROSTER" -- teacher-extension
```
**Saída Literal do Terminal:**
*(Vazio — nenhum resultado retornado, código de saída 1)*

---

### Busca 2 — Portais legados em teacher-extension, lib e desktop
```powershell
git grep -n -i -E "machado|sobrinho|paineldoaluno|i-educar" -- teacher-extension lib desktop
```
**Saída Literal do Terminal:**
```text
desktop/ui/app.js:314:          <input type="text" id="bind-h1-host" placeholder="ex: machadosobrinho.paineldoaluno.com.br" value="paineldoaluno.com.br">
lib/agentTools.ts:179:    description: 'Preenche autonomamente ações operacionais em portais escolares (Machado Sobrinho, Plurall, Rede Santa Catarina, Cambridge One, etc.) para diários de classe, frequências/chamadas e notas de boletim. Preenche todos os campos no DOM e deixa o formulário pronto para confirmação final. Suporta orquestração multi-página contínua (ex: chamada + diário encadeados) via parâmetro steps.',
lib/agentTools.ts:183:        platform:       { type: 'string', description: 'ID do portal, ex: machado, santacatarina, plural, cambridge, ou nome da escola' },
lib/agentTools.ts:247:    description: 'Preenche campos em portal escolar (Machado, Plural, Santa Catarina, Cambridge One, Teams).',
lib/agentTools.ts:251:        platform:    { type: 'string', enum: ['machado', 'santacatarina', 'plural', 'cambridge', 'teams'] },
lib/agentTools.ts:539:    description: 'Aplica o cabeçalho oficial de uma escola (Machado Sobrinho, Santa Catarina) ao documento no Editor.',
lib/agentTools.ts:719:Descobre automaticamente qual conector ativo oferece a capacidade. Se o professor mencionar uma plataforma específica (ex: "no Machado", "no Trello"), informe 'connector_hint'.
lib/agentTools.ts:739:          description: 'Nome, domínio ou identificador da plataforma citada pelo professor (ex: "machado", "trello", "plurall", "assessment"). Se não citado, deixe vazio para descoberta automática.'
lib/browserCapabilityRouter.ts:56:  const knownMappedPortals = ['machado', 'santacatarina', 'plural', 'cambridge', 'teams', 'canva', 'trello']
lib/connectorEngine.ts:386: * 1. Se o professor mencionou uma plataforma específica (ex: "no Machado Sobrinho"),
lib/didacticSequenceService.ts:24:  school?: string                   // Ex: "Machado Sobrinho"
lib/didacticSequenceService.ts:53:    school: 'Machado Sobrinho',
lib/editableDocumentTypes.ts:132:          { key: 'schoolName', label: 'Nome da Escola', type: 'text', placeholder: 'Ex: Colégio Machado Sobrinho' },
lib/exportUtils.ts:18:  schoolTemplate?: 'machado' | 'santacatarina' | 'plurall' | 'cambridge' | 'standard'
lib/exportUtils.ts:69:    id: 'machado',
lib/exportUtils.ts:70:    name: 'Colégio Machado Sobrinho',
lib/exportUtils.ts:71:    officialName: 'COLÉGIO MACHADO SOBRINHO — JUIZ DE FORA',
lib/hybridRetriever.ts:321:      if (normQuery.includes('machado') && nodeSchool !== 'machado') {
lib/pdiManagement.ts:179:  schoolName: string = 'Colégio Machado Sobrinho'
lib/portalActionsEngine.ts:265: * Ex: machadosobrinho.paineldoaluno.com.br -> paineldoaluno.com.br
lib/portalActionsEngine.ts:266: *     colegioxyz.paineldoaluno.com.br -> paineldoaluno.com.br
lib/portalActionsEngine.ts:556:    id: 'machado',
lib/portalActionsEngine.ts:557:    name: 'Machado Sobrinho',
lib/portalActionsEngine.ts:558:    shortName: 'Machado',
lib/portalActionsEngine.ts:559:    url: 'https://machadosobrinho.paineldoaluno.com.br/professor_painel',
lib/portalActionsEngine.ts:560:    matchUrl: 'paineldoaluno.com.br',
lib/portalActionsEngine.ts:570:        id: 'machado_read_roster',
lib/portalActionsEngine.ts:573:        description: 'Lê a lista oficial de chamada de alunos e matrículas direto do portal do Machado Sobrinho via Descoberta Autônoma.',
lib/portalActionsEngine.ts:575:        spokenConfirmation: 'Lista de alunos do Machado Sobrinho importada e pronta para conferência!',
lib/portalActionsEngine.ts:579:        id: 'machado_diary',
lib/portalActionsEngine.ts:584:        spokenConfirmation: 'Diário de classe preenchido no Machado Sobrinho com sucesso!',
lib/portalActionsEngine.ts:621:        id: 'machado_attendance',
lib/portalActionsEngine.ts:626:        spokenConfirmation: 'Chamada registrada no painel Machado Sobrinho!',
lib/portalActionsEngine.ts:647:        id: 'machado_grades',
lib/portalActionsEngine.ts:652:        spokenConfirmation: 'Notas lançadas na planilha do Machado Sobrinho!',
lib/portalBridge.ts:50:  { id: 'machado', platform: 'machado', name: 'Machado Sobrinho', color: '#b58900', url: 'https://machadosobrinho.paineldoaluno.com.br/professor_painel', category: 'Diário & Notas', desc: 'Painel oficial de professores' },
lib/projectManagement.ts:161:    schoolName: 'Colégio Machado Sobrinho',
lib/projectManagement.ts:273:  schoolName: string = 'Colégio Machado Sobrinho'
lib/rosterReconciler.ts:481:  portalName: string = 'machado',
lib/teacherCalibrations.ts:41:  defaultPortalSync: 'machado' | 'santacatarina' | 'plural' | 'google_classroom'
lib/teacherCalibrations.ts:48:  defaultPortalMirror: 'machado' | 'santacatarina' | 'plural' | 'google_classroom'
lib/teacherCalibrations.ts:124:    defaultPortalSync: 'machado'
lib/teacherCalibrations.ts:130:    defaultPortalMirror: 'machado'
teacher-extension/README.md:9:| 🏫 Machado Sobrinho | machadosobrinho.paineldoaluno.com.br | ✅ Ativo |
teacher-extension/background.js:57:  { id: 'ieducar', name: 'i-Educar', domains: ['ieducar.com.br', 'comunidade.ieducar'] },
teacher-extension/background.js:58:  { id: 'machado_sobrinho', name: 'Machado Sobrinho', domains: ['machadosobrinho', 'paineldoaluno.com.br', 'paineldoprofessor'] },
teacher-extension/content.js:55:  machado: {
teacher-extension/content.js:56:    match: () => CURRENT_URL.includes('paineldoaluno.com.br'),
teacher-extension/content.js:57:    name: 'Machado Sobrinho',
teacher-extension/content.js:1003:    const portalName = payload.portalName || 'Machado Sobrinho';
teacher-extension/content.js:2678:  // ESTRATÉGIA 2: Grade de Cartões / Divs (padrão Machado Sobrinho: .grid-meus-alunos, .card-aluno, etc.)
teacher-extension/content.js:2855:          portalId: payload.portalId || 'machado_sobrinho',
teacher-extension/side_panel.html:680:        <span id="status-portal-name">Machado Sobrinho</span>
teacher-extension/side_panel.html:1083:        <button class="platform-btn active" data-platform="machado">Machado Sobrinho</button>
teacher-extension/side_panel.js:82:  machado:       { name: 'Machado Sobrinho', domains: ['paineldoaluno.com.br', 'machadosobrinho', 'paineldoprofessor'] },
teacher-extension/side_panel.js:86:  ieducar:       { name: 'i-Educar', domains: ['ieducar.com.br', 'comunidade.ieducar'] },
teacher-extension/side_panel.js:92:let activePlatform = 'machado'
teacher-extension/side_panel.js:361:                      allTabs.find(t => t.url && (t.url.includes('paineldoaluno') || t.url.includes('redesantacatarina') || t.url.includes('plural') || t.url.includes('localhost') || t.url.includes('127.0.0.1')));
teacher-extension/side_panel.js:579:            portal_id: skillGraph?.portal_id || 'machado_sobrinho',
teacher-extension/side_panel.js:1011:      portalName: PLATFORMS[activePlatform]?.name || 'Machado Sobrinho',
teacher-extension/side_panel.js:1244:          portalId: activePlatform === 'machado' ? 'machado_sobrinho' : activePlatform,
teacher-extension/side_panel.js:1501:        portalId: activePlatform === 'machado' ? 'machado_sobrinho' : activePlatform,
teacher-extension/side_panel.js:1545:  const currentPortalId = (activePlatform === 'machado' || !activePlatform) ? 'machado_sobrinho' : activePlatform;
```
**Classificação das Ocorrências Restantes:**
- `desktop/ui/app.js:314`: Campo de placeholder `placeholder="ex: machadosobrinho.paineldoaluno.com.br"` para instrução de re-vinculação de host pelo professor $\rightarrow$ `DÍVIDA / EXEMPLO`.
- `lib/**`: Módulos da Fase 0 (NLU, router, planejador didático, templates de documentos pedagógicos) não consumidos pelo motor determinístico SkillGraph v2 (`lib/runner/**`, `lib/compiler/**`, `lib/desktop-core/**`) $\rightarrow$ `DÍVIDA`.
- `teacher-extension/`: Arquivos da interface legada v1 (`side_panel.html`, `side_panel.js`, `content.js`) inativos no fluxo padrão agora governado por `side_panel_v2.html` e `orchestrator_v2.js` $\rightarrow$ `DÍVIDA`.
- *Nenhuma ocorrência restante atua como fallback silencioso de execução ou viola o objetivo O1.*

---

### Busca 3 — Plataforma ativa legada
```powershell
git grep -n "activePlatform = 'machado'" -- teacher-extension
```
**Saída Literal do Terminal:**
```text
teacher-extension/side_panel.js:92:let activePlatform = 'machado'
```
**Classificação:** `DÍVIDA`. Linha residual em `side_panel.js` (interface legada v1). Inativa no runtime padrão v2 (`side_panel_v2.js` resolve grafos via `graphs.resolveActive` sem nenhuma chave de plataforma fixa).

---

### Busca 4 — Rastreamento de dist/ da extensão no git
```powershell
git ls-files teacher-extension/dist
```
**Saída Literal do Terminal:**
*(Vazio — nenhum arquivo sob `teacher-extension/dist` rastreado no índice do git)*

Regra do `.gitignore` confirmada:
```text
.gitignore:65:teacher-extension/dist/	teacher-extension/dist/runner.bundle.js
```

---

## 3. Mudanças no Manifesto (`manifest.json`)

```diff
--- a/teacher-extension/manifest.json
+++ b/teacher-extension/manifest.json
@@ -18,3 +18,3 @@
   "side_panel": {
-    "default_path": "side_panel.html"
+    "default_path": "side_panel_v2.html"
   },
@@ -70,5 +70,5 @@
   "web_accessible_resources": [
     {
-      "resources": ["side_panel.html", "side_panel.js", "portal_normalizer.js", "portal_dom_reader.js"],
+      "resources": ["portal_normalizer.js", "portal_dom_reader.js"],
       "matches": ["http://localhost/*", "http://127.0.0.1/*"]
     }
```
*Zero novas permissões adicionadas. Nenhuma alteração fora de `side_panel` e `web_accessible_resources`.*

---

## 4. Itens Enviados ao `docs/BACKLOG.md`

1. **Fetches residuais para `localhost:3000` em scripts legados:** 15 ocorrências em `teacher-extension/side_panel.js` e 4 ocorrências em `teacher-extension/content.js`.
2. **Ponte de `content.js` com o app Next:** Desacoplamento da bridge direta de mensageria com o frontend web local.
3. **Expurgo de `lib/supabaseClient.ts`:** Módulo legado de cliente Supabase web na raiz de `lib/`, não utilizado pelo motor desktop nem pela extensão v2.

---

## 5. Resultados do Dono

```
================================================================================
Resultados do dono: PENDENTE
================================================================================
```
*(Resultados do Gate A, suíte HOLDOUT e testes interativos no navegador real dependem estritamente da homologação física do dono).*
