# Relatório de Auditoria Independente do Engine — Teacher AI (SkillGraph v2)

Data da Auditoria: 15 de Outubro de 2026  
Status do Repositório: Branch `fechamento-integracao` (HEAD: `a31c97a`)  
Modo: Somente Leitura (Zero Modificações no Código)

---

## 1. Veredito Executivo

- **Progresso Real Medido:** **45,8%** (0/12 `COMPLETO`, 11/12 `PARCIAL`, 1/12 `AUSENTE`).
- **Critério Rígido de Avaliação:** Pela regra fundamental de integridade, nenhum objetivo que dependa de interação física em navegador real ou aplicativo aberto pode ser declarado `COMPLETO` sem execução literal pelo dono do projeto; todo objetivo com código e testes comprovados, mas sem prova em navegador, é classificado no teto máximo de `PARCIAL` (peso 0,5).
- **Os 3 Maiores Riscos:**
  1. *Ausência de Validação Manual do Gate A:* O arquivo `docs/GATE_RESULTS.md` não existe no repositório. O dono do projeto ainda não executou o roteiro físico de 60 minutos contra o Chrome real e o app Electron.
  2. *Reversão de Versão Desconectada (O6):* Embora o repositório SQLite possua o método `setActive()`, não há rota IPC exposta em `desktop/main.ts` nem botão/interface no desktop ou na extensão para a professora selecionar e reverter para uma versão anterior do grafo.
  3. *Instalação Zero-Terminal Inexistente (O10):* O registro do Native Messaging ainda exige terminal PowerShell (`npx tsx scripts/native-host-register.ts --register`); não existe instalador empacotado (.msi ou Inno Setup).
- **Melhor Próxima Ação:** Executar o [Roteiro do Dono (Seção 10)](#10-roteiro-do-dono-60-min-8-passos) no portal sintético para validar fisicamente os 11 objetivos `PARCIAL` e registrar os dados em `docs/GATE_RESULTS.md`.

---

## 2. Matriz de Objetivos do Produto (O1–O12)

| Objetivo | Status | Nível de Evidência | Justificativa Técnica (`arquivo:linha`) | O que falta para `COMPLETO` |
| :--- | :---: | :---: | :--- | :--- |
| **O1 Generalista** (zero portais hardcoded) | `PARCIAL` | E2 | Zero referências a portais em `lib/runner`, `lib/compiler`, `lib/repair` e `desktop`. Manifesto aponta para `side_panel_v2.html`. | Execução ao vivo pelo dono em portal escolar real sem intervenção técnica. |
| **O2 Mapear uma vez** (gravação e compilação sem PII) | `PARCIAL` | E2 | Cadeia `dist/recorder.bundle.js` → `analyzeTrace` → `compile` (`lib/compiler/compile.ts:30`) conectada em `orchestrator_v2.js:483`. PII scrubbed em `scrub.ts`. | Validação de gravação física pelo dono no portal sintético. |
| **O3 Rodar sem LLM e sem rede no caminho** | `PARCIAL` | E1 / E2 | `lib/runner` possui zero chamadas a `fetch`, `XMLHttpRequest`, `WebSocket` ou LLMs. 136 testes de core passando offline. | Medição dos contadores de rede/LLM em zero durante execução no Chrome pelo dono. |
| **O4 Extrair alunos para banco local cifrado** | `PARCIAL` | E1 / E2 | Nó `READ` extrai alunos; `orchestrator_v2.js:207` despacha `students.upsertFromPortal`; `SqlStudentRepository.ts:80` cifra com AES-256-GCM. | Validação da extração de tabela real no Chrome pelo dono. |
| **O5 Escrever com segurança** (CHECKPOINT, ack antes do WRITE, read-back) | `PARCIAL` | E1 / E2 | `CHECKPOINT` mandatório (`assemble.ts:91`); write-ahead audit aborta com `E_AUDIT_UNAVAILABLE` antes do DOM (`write.ts:140`); read-back reverte (`write.ts:162`). | Teste manual com o aplicativo desktop fechado comprovando aborto no Chrome. |
| **O6 Resiliência** (drift não erra, reparo v+1, reversão) | `PARCIAL` | E2 | Drift aciona `generateRepairProposal`; aprovação gera v+1 imutável (`orchestrator_v2.js:594`). Porém, reversão de versão está desconectada na UI. | Implementar rota/botão de reversão de versão e testar mutação física no navegador. |
| **O7 Local-first** (zero TCP, cofre SO, Native Messaging) | `PARCIAL` | E1 / E2 | Zero portas TCP (`.listen(` restrito a Named Pipe `\\.\pipe\teacherai-desktop-nm`); chaves em DPAPI; NativeClient via shim. | Execução do registro de Native Messaging e conexão real no Chrome do dono. |
| **O8 Comunidade** (assinatura, quarentena, host binding) | `PARCIAL` | E1 / E2 | Pacotes assinados Ed25519; hosts vinculados pelo usuário; quarentena bloqueia execução com `E_GRAPH_QUARANTINED` (`SqlSkillGraphRepository.ts:94`). | Teste de importação de pacote e recusa de escrita antes da ativação. |
| **O9 Privacidade / LGPD** (sem PII em repouso, pseudonimização, Art. 18) | `PARCIAL` | E1 / E2 | SQLite armazena `enc:v1:`; `Pseudonymizer` protege LLM de nuvem; Dossiê e Expurgo operacionais (`app.js:73`). | Varredura em runtime de memória/heap com dados reais pelo dono. |
| **O10 Usabilidade** (instalação sem terminal) | `AUSENTE` | E2 | Não há instalador gráfico (.exe / .msi / Inno Setup). Instalação e registro exigem comandos Node/PowerShell no terminal. | Criar instalador único (.msi / Inno Setup) para registro do host e atalhos. |
| **O11 Habilidades genéricas** (catálogo dinâmico, `custom:*`, texto seguro) | `PARCIAL` | E1 / E2 | Menu gerado de `graphs.listActive`; suporte a `custom:*`; `nlu.parse` estrito ao catálogo; texto com varredura de PII (`llmGateway.ts:373`). | Teste do formulário dinâmico de parâmetros no painel do Chrome. |
| **O12 SSO / Popup / CAPTCHA** (handoff humano sem ler auth) | `PARCIAL` | E2 | `SSOHandoffManager.ts` monitora abas/popups sem injeção; card no painel (`side_panel_v2.html:76`); retomada pós-fingerprint. | Validação em popup real de login no Chrome pelo dono. |

---

## 3. Cadeia Ponta a Ponta (Análise de Fluxos F1–F7)

### F1: Gravar → Compilar → Revisar → Salvar no App
- **Salto 1 (Gravar):** `side_panel_v2.js:145` → `orchestrator_v2.js:367` injeta `dist/recorder.bundle.js` na aba ativa via `chrome.scripting.executeScript`. [CONECTADO]
- **Salto 2 (Compilar):** `side_panel_v2.js:182` envia trace para `orchestrator_v2.js:483`, que executa `bundle.compile(trace, decisions)`. [CONECTADO]
- **Salto 3 (Revisar):** Decisões pendentes (polaridade, escala) são solicitadas e revisadas na interface do painel v2. [CONECTADO]
- **Salto 4 (Salvar):** `orchestrator_v2.js:498` chama `nativeClient.send('graphs.save', { graph, activate: true })` → `desktop/main.ts:82` salva no SQLite cifrado. [CONECTADO]
- **Veredito do Fluxo:** `CONECTADO`. Funcionaria hoje no código (sujeito à pré-condição do host Native Messaging registrado).

### F2: Ler Turma (`read_roster`)
- **Salto 1 (Carregar Grafo):** `side_panel_v2.js:240` obtém habilidades ativas do app via `graphs.listActive`. [CONECTADO]
- **Salto 2 (Execução sem Rede/LLM):** `SkillGraphRunner` executa nó `READ` via `DomDriver` na aba do portal sem qualquer requisição externa. [CONECTADO]
- **Salto 3 (Sincronização):** `orchestrator_v2.js:207` detecta sucesso de `read_roster` e chama `nativeClient.send('students.upsertFromPortal', ...)`. [CONECTADO]
- **Salto 4 (Gravação Local):** `desktop/main.ts:63` grava no SQLite criptografado via `SqlStudentRepository`. [CONECTADO]
- **Veredito do Fluxo:** `CONECTADO`.

### F3: Lançar Falta
- **Salto 1 (Preenchimento e CHECKPOINT):** O runner alcança o nó `CHECKPOINT`; `side_panel_v2.js:520` exibe modal com diff visual de antes/depois e aviso de irreversibilidade. [CONECTADO]
- **Salto 2 (Aprovação Humana):** Professora clica em Confirmar; `resolveCheckpoint(requestId, true)` é despachado. [CONECTADO]
- **Salto 3 (Write-ahead Audit):** `lib/runner/nodes/write.ts:130` invoca `host.audit()` antes da escrita física; se o app estiver fechado ou offline, lança `E_AUDIT_UNAVAILABLE` e aborta imediatamente. [CONECTADO]
- **Salto 4 (Escrita e Read-back):** `driver.write` altera o checkbox; `write.ts:160` lê de volta o DOM; em caso de divergência, restaura o valor anterior e lança `E_READBACK_MISMATCH`. [CONECTADO]
- **Veredito do Fluxo:** `CONECTADO`.

### F4: Drift → Proposta → Aprovação → Dry-run → v+1 → Reverter
- **Salto 1 (Detecção de Drift):** `lib/runner/driftHook.ts` detecta mutação e aciona `generateRepairProposal`. [CONECTADO]
- **Salto 2 (Proposta na UI):** `side_panel_v2.js:456` exibe card de reparo pedagógico para a professora. [CONECTADO]
- **Salto 3 (Aprovação e Dry-run):** Professora aprova; `orchestrator_v2.js:594` aplica patch, valida e executa dry-run. [CONECTADO]
- **Salto 4 (Incremento v+1):** Grafo reparado é salvo como versão `max+1` imutável no SQLite. [CONECTADO]
- **Salto 5 (Reversão de Versão):** `SqlSkillGraphRepository.setActive` existe no banco, mas **NÃO HÁ ROTA IPC em `desktop/main.ts` nem botão na interface** para a professora alternar para uma versão anterior. [DESCONECTADO]
- **Veredito do Fluxo:** `PARCIAL`. Quebra exatamente no salto de reversão pelo usuário.

### F5: Exportar → Importar → Quarentena → Ativar
- **Salto 1 (Exportar):** `desktop/ui/app.js:396` → `desktop/main.ts:259` gera pacote `.teacherai.json` assinado com Ed25519 e sanitizado. [CONECTADO]
- **Salto 2 (Importar e Quarentena):** Importação valida assinatura e coloca em `quarantined`. `SqlSkillGraphRepository.ts:94` rejeita qualquer tentativa de execução normal com `E_GRAPH_QUARANTINED`. [CONECTADO]
- **Salto 3 (Ativar pós-revisão):** `desktop/ui/app.js:370` chama `community.activate` após confirmação humana, liberando o mapa. [CONECTADO]
- **Veredito do Fluxo:** `CONECTADO`.

### F6: Pedido em Linguagem Natural → `nlu.parse` → Formulário → Execução
- **Salto 1 (Entrada de Voz/Texto):** Professora digita no chat do painel v2; `side_panel_v2.js:307` envia `SKILLGRAPH_NLU_PARSE`. [CONECTADO]
- **Salto 2 (NLU Estrito ao Catálogo):** `desktop/main.ts:95` → `llmGateway.ts:233` valida estritamente contra o catálogo de habilidades existentes. [CONECTADO]
- **Salto 3 (Formulário Pré-preenchido):** `side_panel_v2.js:315` preenche os campos na tela para conferência do professor. [CONECTADO]
- **Salto 4 (Texto com Varredura de PII):** Geração de texto livre passa por regex anti-PII (`llmGateway.ts:373`) e exige `CHECKPOINT` integral antes de submeter. [CONECTADO]
- **Veredito do Fluxo:** `CONECTADO`.

### F7: SSO / Popup → Handoff → Retomada com Fingerprint
- **Salto 1 (Detecção de Popup/Auth):** `lib/runner-ext/ssoHandoff.ts` monitora abertura de abas sem injetar código nem ler o conteúdo da aba de login. [CONECTADO]
- **Salto 2 (Card de Handoff no Painel):** `side_panel_v2.html:76` exibe `sgv2-handoff-box` com contagem regressiva. [CONECTADO]
- **Salto 3 (Retomada pós-login):** Professora clica em "Já resolvi"; o runner verifica o fingerprint da página de retorno e retoma a execução com segurança. [CONECTADO]
- **Veredito do Fluxo:** `CONECTADO`.

---

## 4. Auditoria de Módulos e Rastreabilidade de Ligação (A1)

| Módulo | Ponto de Entrada / Cadeia de Chamada | Veredito |
| :--- | :--- | :---: |
| **Engine do Runner** | `manifest.json:20` (`side_panel_v2.html`) → `side_panel_v2.html:164` (`runner.bundle.js`) → `orchestrator_v2.js:161` (`new bundle.SkillGraphRunner`) | **ALCANÇÁVEL** |
| **DomDriver** | `manifest.json:11` → `content-adapter.bundle.js` (`lib/runner-dom/index.ts`) injetado em todos os frames | **ALCANÇÁVEL** |
| **RemoteDriver** | `side_panel_v2.html:164` → `runner.bundle.js` → `orchestrator_v2.js:137` (`new bundle.RemoteDriver`) | **ALCANÇÁVEL** |
| **Gravador de Produção** | `side_panel_v2.js:145` → `orchestrator_v2.js:367` → `chrome.scripting.executeScript({ files: ['dist/recorder.bundle.js'] })` (originado de `lib/recorder-dom/extensionEntry.ts`) | **ALCANÇÁVEL** |
| **Compilador e `scrubGraph`** | `side_panel_v2.js:182` → `orchestrator_v2.js:483` (`bundle.compile`) → `lib/compiler/compile.ts` + `scrub.ts` | **ALCANÇÁVEL** |
| **Serviço de Reparo** | `side_panel_v2.js:456` → `orchestrator_v2.js:546` (`SKILLGRAPH_APPROVE_REPAIR`) → `bundle.applyPatch` → `nativeClient.send('graphs.save')` | **ALCANÇÁVEL** |
| **Reversão de Versão** | `lib/desktop-core/db/repositories/SqlSkillGraphRepository.ts:241` (`setActive`) sem chamador em `desktop/main.ts` nem botões na UI | **ÓRFÃO** |
| **GraphHealthStore** | `orchestrator_v2.js:169` → `bundle.recordExecutionSuccess` → `chrome.storage.local` (`graph_health:*`) | **ALCANÇÁVEL** |
| **NativeClient na Extensão** | `side_panel_v2.js` → `orchestrator_v2.js:96` (`new bundle.NativeClient`) → `chrome.runtime.connectNative('com.teacherai.desktop')` | **ALCANÇÁVEL** |
| **Shim e Pipe Server** | Registro Windows HKCU → `dist-desktop/shim.bat` → `dist-desktop/shim.js` → `\\.\pipe\teacherai-desktop-nm` → `desktop/main.ts:318` (`NamedPipeServer`) | **ALCANÇÁVEL** |
| **Repositórios SQLite** | `desktop/main.ts:44-49` instanciando `SqlStudentRepository`, `SqlSkillGraphRepository`, `SqlCommunityRepository`, `SqlAuditRepository` | **ALCANÇÁVEL** |
| **Ack de Auditoria Write-Ahead** | `lib/runner/nodes/write.ts:130` → `host.audit()` → `NativeAuditSink` → `NativeClient` → `desktop/main.ts:90` (`auditRepo.append`) | **ALCANÇÁVEL** |
| **LlmGateway / Pseudonimizador** | `side_panel_v2.js:307` → `orchestrator_v2.js:324` → `nativeClient.send('nlu.parse')` → `desktop/main.ts:95` → `llmGateway.ts` | **ALCANÇÁVEL** |
| **Exportação de Mapas** | `desktop/ui/index.html:254` → `desktop/ui/app.js:396` → `client.send('community.export')` → `desktop/main.ts:259` → `PackageExporter.export` | **ALCANÇÁVEL** |
| **Importação / Quarentena** | `desktop/ui/app.js:340` → `desktop/main.ts:240` (`community.activate`) + `SqlSkillGraphRepository.ts:94` | **ALCANÇÁVEL** |
| **Cliente do Registro** | `desktop/ui/app.js` → `desktop/main.ts:180` lendo `conformance/community/out/index.json` local | **ALCANÇÁVEL** |
| **LGPD Erasure / Export** | `desktop/ui/index.html:73` → `desktop/ui/app.js:101,118` → `desktop/main.ts:126,132` → `ExportService` e `ErasureService` | **ALCANÇÁVEL** |
| **Handoff SSO** | `side_panel_v2.html:76` → `side_panel_v2.js:485` → `ssoHandoff.ts` monitorando abas | **ALCANÇÁVEL** |
| **Cliente Supabase** | `lib/supabaseClient.ts:4` — Zero importadores em `lib`, `desktop` e `teacher-extension` | **ÓRFÃO** |

---

## 5. Invariantes de Segurança (A4)

| Nº | Invariante | Status | Evidência | Arquivo e Linha | Teste Cobrindo |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | `WRITE` só atrás de `CHECKPOINT` | **VALE** | E2 | `lib/compiler/stages/assemble.ts:91-102` | `__tests__/compiler.core.test.ts:80-110` |
| **2** | Sem ack, `WRITE` aborta (`E_AUDIT_UNAVAILABLE`) | **VALE** | E1 / E2 | `lib/runner-ext/workerEntry.ts:224-257`, `lib/runner/nodes/write.ts:139-146` | `__tests__/graphRunner.core.test.ts:1083` |
| **3** | Read-back divergente reverte | **VALE** | E1 / E2 | `lib/runner/nodes/write.ts:162-195` | `__tests__/graphRunner.core.test.ts:410-440` |
| **4** | `allowed_hosts` checado em runtime por frame | **VALE** | E1 / E2 | `lib/runner/engine.ts:56,97`, `lib/runner-dom/driver.ts:45` | `__tests__/graphRunner.core.test.ts:470-490` |
| **5** | Núcleo sem rede / DOM no código | **VALE** | E1 / E2 | `lib/runner/` e `lib/compiler/` (zero `fetch`, `XHR`, `WS`, `document`) | Prova de Grep (saída vazia) |
| **6** | Polaridade/escala nunca em silêncio | **VALE** | E2 | `lib/compiler/compile.ts:70-85` (qualquer checkbox aciona `hasAttendanceControl`) | `__tests__/compiler.core.test.ts:220` |
| **7** | Matcher semântico restrito a âncoras | **VALE** | E2 | `lib/repair/semantic/matcher.ts`, `lib/runner/driftHook.ts:68` | `__tests__/repair.core.test.ts` |
| **8** | Sem `autoApprove` no bundle de produção | **VALE** | E1 | Grep em `teacher-extension/dist/` (zero ocorrências) | Grep literal no bundle |
| **9** | Chaves só no cofre (zero `?key=`) | **VALE** | E1 / E2 | `desktop/vault/vaultManager.ts` (DPAPI), zero `?key=` | Grep literal no repo |
| **10** | Pseudonimização antes de LLM de nuvem | **VALE** | E1 / E2 | `lib/desktop-core/privacy/pseudonymizer.ts`, `desktop/llm/llmGateway.ts:110` | `__tests__/desktop.core.test.ts:480-550` |
| **11** | Banco cifrado com DEK no cofre | **VALE** | E1 / E2 | `lib/desktop-core/crypto/envelope.ts`, `desktop/vault/vaultManager.ts` | `__tests__/desktop.core.test.ts:90-120` |
| **12** | Sem `listen(` TCP em produção | **VALE** | E1 / E2 | `desktop/nm/pipeServer.ts:55` (apenas Named Pipe local) | Grep literal no desktop |
| **13** | Comunidade: assinado e quarentena no app | **VALE** | E1 / E2 | `lib/desktop-core/community/import/pipeline.ts:50`, `SqlSkillGraphRepository.ts:94` | `__tests__/community.core.test.ts` |
| **14** | Electron endurecido | **VALE** | E2 | `desktop/main.ts:334-366` (`contextIsolation: true`, `sandbox: true`, etc.) | **SEM TESTE UNITÁRIO** (depende de runtime Electron) |
| **15** | Handoff não lê a aba de autenticação | **VALE** | E2 | `lib/runner-ext/ssoHandoff.ts:160-220` (zero injeção/captura) | **SEM TESTE UNITÁRIO** |
| **16** | Texto livre com varredura de PII | **VALE** | E2 | `desktop/llm/llmGateway.ts:373-410`, `lib/compiler/stages/assemble.ts:100` | `__tests__/compiler.core.test.ts` |
| **17** | `nlu.parse` estrito ao catálogo | **VALE** | E2 | `desktop/llm/llmGateway.ts:233-243` | `__tests__/desktop.core.test.ts` |

---

## 6. Testes, Builds e Travas (A5 & A6)

### Tabela de Execução Literal de Comandos de Build e Testes

| Comando | Resultado | Nº Passou / Falhou | Duração | Observação Literal do Terminal |
| :--- | :---: | :---: | :---: | :--- |
| `npx tsc --noEmit` | **Sucesso** (código 0) | 0 erros | 12s | Tipagem rigorosa sem nenhuma pendência no projeto. |
| `npm run build:ext` | **Sucesso** (código 0) | 3 bundles gerados | 9s | `runner.bundle.js`, `content-adapter.bundle.js`, `recorder.bundle.js` em `teacher-extension/dist/`. |
| `npm run desktop:build` | **Sucesso** (código 0) | Sucesso | 8s | Artefatos gerados em `dist-desktop/` (incluindo `shim.js` e `shim.bat`). |
| `npx vitest run __tests__/{...}.test.ts` | **Sucesso** (código 0) | **136 aprovados** / 0 falhas | 12.63s | 7 arquivos de teste de fronteira executados e 100% aprovados. |

### Detalhamento dos 7 Arquivos de Teste Executados
1. `__tests__/skillGraphV2.contract.test.ts`: 12 aprovados
2. `__tests__/repair.core.test.ts`: 15 aprovados
3. `__tests__/compiler.core.test.ts`: 11 aprovados
4. `__tests__/desktop.core.test.ts`: 24 aprovados
5. `__tests__/graphRunner.core.test.ts`: 26 aprovados
6. `__tests__/community.core.test.ts`: 35 aprovados
7. `__tests__/extensionHost.integration.test.ts`: 13 aprovados

### Auditoria de Travas de Conformidade (`*.lock`) (A6)
- `conformance/holdout.lock` (SHA-256 travado em `2de3c6a` para 12 HTML fixtures e 10 JSON graphs): **CONFERE**. O hash atual do arquivo `tools/runner-harness/fixtures/holdout/challenge_handoff.html` bate exatamente com `42992025b594d6518bc83d24f2331d1f1af4aeb097107f14cd360a310acf65ff`.
- `conformance/repair/holdout.lock` (travado em `8066f47`): **CONFERE**.
- `conformance/community/holdout.lock` (travado em `c8b3fe6`): **CONFERE**.
- **Resultado do HOLDOUT pelo Dono:** **NÃO MEDIDO**. Nenhum resultado foi preenchido pelo dono do projeto no repositório.

---

## 7. Alegações dos Relatórios vs. Código Real (A7)

| Relatório | Alegação Mensurável | Confere? | Evidência no Código |
| :--- | :--- | :---: | :--- |
| **PHASE1_REPORT** | Contrato congelado v2.0 com schemas Zod para nós e âncoras | **Sim** | `lib/contracts/skillgraph/` inalterado e travado. |
| **PHASE2_REPORT** | Motor de execução determinístico sem chamadas a LLM | **Sim** | `lib/runner/` possui zero referências a LLMs ou rede. |
| **PHASE4_REPORT** | 10 cenários holdout travados contra modificações oportunistas | **Sim** | `conformance/holdout.lock` com hashes íntegros. |
| **PHASE5_REPORT** | Reversão de versão disponível caso o reparo se mostre insatisfatório | **NÃO** | `SqlSkillGraphRepository.setActive` existe, mas não há rota IPC nem UI para reverter. |
| **PHASE6_REPORT** | Zero portas TCP abertas na aplicação desktop | **Sim** | `desktop/nm/pipeServer.ts:55` escuta estritamente em Named Pipe. |
| **PHASE7_REPORT** | Quarentena impede execução de mapas não ativados | **Sim** | `SqlSkillGraphRepository.ts:94` lança `E_GRAPH_QUARANTINED`. |
| **ENGINE_CLOSURE** | Gate A 100% concluído e pronto | **NÃO** | `docs/GATE_RESULTS.md` não existe; teste ao vivo pelo dono não foi medido. |
| **CORRECAO_GATE_A** | Card de handoff SSO funcional no painel v2 | **Sim** | `side_panel_v2.html:76` e `side_panel_v2.js:485` implementados. |
| **HABILIDADES_GENERICAS** | Seletor de exportação lista habilidades dinamicamente sem IDs fixos | **Sim** | `desktop/ui/app.js:396` consome `graphs.list` e removeu padrão `read_roster`. |
| **HABILIDADES_GENERICAS** | Removidos handlers procedurais de escrita de `background.js` e `content.js` | **Sim** | `EXECUTE_SAFE_WRITE` apagado; `table tr` no background retorna vazio. |

---

## 8. Legados e Hardcodes (Saídas Literais de A3)

### 1. Grep de Handlers Procedurais e Grafos Canônicos Legados
```text
$ git grep -n -E "CANONICAL_READ_ROSTER_GRAPH|skillGraph: null|READ_ACTIVE_PORTAL_ROSTER|EXECUTE_SAFE_WRITE|fillGradesMatrix|fillAttendanceMatrix" -- teacher-extension
teacher-extension/side_panel.js:3447:          action: 'EXECUTE_SAFE_WRITE',
```
*Análise:* Ocorre apenas no `side_panel.js` legado (arquivo morto não utilizado pelo manifesto).

### 2. Grep de `querySelectorAll('table` na Extensão
```text
$ git grep -n "querySelectorAll('table" -- teacher-extension
teacher-extension/background.js:434:          const tableRows = doc.querySelectorAll('table tr, .grid-row, .ui-grid, [data-aluno]');
teacher-extension/background.js:1080:        const rows = Array.from(document.querySelectorAll('table tr, tr, div.student-row, li'));
teacher-extension/background.js:1686:              const rowCandidates = Array.from(document.querySelectorAll('table tr, tbody tr')).filter(r => {
teacher-extension/background.js:1898:            const tables = Array.from(document.querySelectorAll('table')).filter(isVisible).map(t => {
teacher-extension/content.js:442:  const tables = Array.from(document.querySelectorAll('table')).map(table => {
teacher-extension/content.js:1611:  const tables = Array.from(document.querySelectorAll('table'));
teacher-extension/content.js:2563:  const tables = Array.from(document.querySelectorAll('table'));
teacher-extension/portal_dom_reader.js:208:      const tableEls = Array.from(docOrTables.querySelectorAll('table, [role="table"], [role="grid"]'));
teacher-extension/portal_dom_reader.js:429:    const tables = Array.from(doc.querySelectorAll('table, [role="table"]')).filter(isElementVisible);
teacher-extension/portal_dom_reader.js:649:    const tableEls = Array.from(doc.querySelectorAll ? doc.querySelectorAll('table') : []).filter(isElementVisible);
```
*Análise:* Todas as consultas de tabela restantes são exclusivamente de **leitura** (observadores de DOM, leitores de estrutura e discovery). A consulta de escrita procedural `document.querySelectorAll('table tr')` em `background.js` retornou **completamente vazia** (código 1).

### 3. Grep de Portas Locais Legadas
```text
$ git grep -n -E "localhost:(3000|3001|8765|8766|9222)" -- teacher-extension lib desktop
lib/teamsClient.ts:73:   - URI de Redirecionamento (Plataforma Web): "http://localhost:3000/api/auth/teams/callback" (ou domínio oficial da aplicação).
```
*Análise:* Nenhuma porta TCP ativa em uso. Ocorre unicamente como comentário explicativo em documentação do Teams.

### 4. Grep de Nomes de Portais Escolares Conhecidos
```text
$ git grep -n -i -E "machado|sobrinho|paineldoaluno|i-educar" -- teacher-extension lib/runner lib/runner-dom lib/runner-ext lib/recorder lib/recorder-dom lib/compiler lib/repair lib/desktop-core desktop
teacher-extension/README.md:9:| 🏫 Machado Sobrinho | machadosobrinho.paineldoaluno.com.br | ✅ Ativo |
teacher-extension/side_panel.html:680:        <span id="status-portal-name">Machado Sobrinho</span>
teacher-extension/side_panel.html:1083:        <button class="platform-btn active" data-platform="machado">Machado Sobrinho</button>
teacher-extension/side_panel.js:82:  machado:       { name: 'Machado Sobrinho', domains: ['paineldoaluno.com.br', 'machadosobrinho', 'paineldoprofessor'] },
teacher-extension/side_panel.js:86:  ieducar:       { name: 'i-Educar', domains: ['ieducar.com.br', 'comunidade.ieducar'] },
teacher-extension/side_panel.js:92:let activePlatform = 'machado'
teacher-extension/side_panel.js:361:                      allTabs.find(t => t.url && (t.url.includes('paineldoaluno') || t.url.includes('redesantacatarina') || t.url.includes('plural') || t.url.includes('localhost') || t.url.includes('127.0.0.1')));
teacher-extension/side_panel.js:1005:      portalName: PLATFORMS[activePlatform]?.name || 'Machado Sobrinho',
teacher-extension/side_panel.js:1473:        portalId: activePlatform === 'machado' ? 'machado_sobrinho' : activePlatform,
teacher-extension/side_panel.js:1513:  const currentPortalId = (activePlatform === 'machado' || !activePlatform) ? 'machado_sobrinho' : activePlatform;
```
*Análise:* Ocorre **apenas** no painel legado v1 (`side_panel.html`/`side_panel.js`). É **ZERO** em todo o motor core, compilador, runner, desktop e painel v2.

### 5. Configuração do Manifesto da Extensão
```text
teacher-extension/manifest.json:20:  "side_panel": {
teacher-extension/manifest.json:21:    "default_path": "side_panel_v2.html"
teacher-extension/manifest.json:26:  "permissions": [
```
*Resposta:* O manifesto abre oficialmente o arquivo **`side_panel_v2.html`**. O painel v1 está completamente inativo em produção.

### 6. Tokens e Segredos Detectados
- Arquivo `.env`: `.env.example` presente na raiz (sem segredos reais).
- Padrões `AIza`, `gsk_`, `sk-`: **ZERO** no código ativo do repositório.
- Padrão `eyJ`: Tokens JWT públicos anônimos do Supabase detectados em:
  - `lib/browserAutomationClient.ts:69` (chave anônima legada de fallback)
  - `lib/supabaseAuth.ts:67` (chave anônima legada de fallback)

---

## 9. Bloqueios e Dívidas Técnicas

### Lista de BLOQUEIA (Ordenada por Impacto)

1. **[BLOQUEIA 1] Execução Manual do Gate A Não Realizada pelo Dono**
   - *Impacto:* Impede formalizar O1, O2, O3, O4, O5, O7, O11 e O12 como `COMPLETO`.
   - *Esforço:* M (~60 min).
   - *Cabe em uma tarefa:* Sim (execução sequencial do roteiro pelo dono).
2. **[BLOQUEIA 2] Reversão de Versão Desconectada na UI e IPC**
   - *Impacto:* Quebra O6 (Resiliência ponta a ponta). Se uma nova versão compilada falhar em aula, o professor não tem botão para voltar à versão anterior.
   - *Esforço:* P (~2 horas).
   - *Cabe em uma tarefa:* Sim (expor método `graphs.setActive` no IPC e adicionar seletor de versão no card da habilidade).
3. **[BLOQUEIA 3] Ausência de Instalador Gráfico Zero-Terminal no Windows**
   - *Impacto:* Impede O10 (Usabilidade para professores leigos).
   - *Esforço:* M (~3-4 horas).
   - *Cabe em uma tarefa:* Sim (script Inno Setup gerando `TeacherAI_Setup.exe` que registra o HKCU).
4. **[BLOQUEIA 4] Ausência de Teste Unitário Automatizado para `SSOHandoffManager`**
   - *Impacto:* Fragiliza a garantia de regressão de O12 (Invariante 15).
   - *Esforço:* P (~1 hora).
   - *Cabe em uma tarefa:* Sim (teste com mock do Chrome Tab API).
5. **[BLOQUEIA 5] Presença de Chaves JWT Anônimas Residuais do Supabase**
   - *Impacto:* Ruído de conformidade em auditorias de segurança (O7, O9).
   - *Esforço:* P (~30 min).
   - *Cabe em uma tarefa:* Sim (expurgo dos arquivos legados `browserAutomationClient.ts` e `supabaseAuth.ts`).

### Dívida Técnica (Não Bloqueante)
- `teacher-extension/side_panel.js` legado (~3500 linhas) permanece no disco como código morto.
- `teacher-extension/suiteView.js` está referenciado em `side_panel_v2.html`, permitindo rodar a suíte holdout pela UI da extensão.
- `lib/supabaseClient.ts` permanece no repositório com zero importadores.

---

## 10. Roteiro do Dono (≤ 60 min, 8 Passos no Portal Sintético)

Este roteiro valida fisicamente no Chrome e no Electron os saltos críticos de A2 e prova as garantias do engine.

### Passo 1: Preparação do Ambiente Local (5 min)
1. Abra um terminal PowerShell na raiz e execute:
   ```powershell
   npx tsx scripts/native-host-register.ts --register
   npm run harness
   ```
2. Em outro terminal, inicie o app desktop:
   ```powershell
   npm run desktop:dev
   ```
3. No Google Chrome (`chrome://extensions/`), ative o Modo Desenvolvedor, carregue sem compactação a pasta `teacher-extension` e abra o painel lateral (**Side Panel v2**).
- *Evidência a anotar:* ID da extensão e se o status no topo exibe *"Desktop Conectado"*.

### Passo 2: Gravação e Salvamento de Fluxo (`read_roster`) (10 min)
1. No Chrome, abra a URL: `http://127.0.0.1:8898/fixtures/standard.html`.
2. No painel v2, clique na aba **"Gravar"** e em seguida em **"Iniciar Gravação"**.
3. Na página, clique na tabela de alunos e em seguida clique em **"Concluir Gravação"**.
4. No formulário de revisão de decisões, confirme o nome da tarefa como `read_roster` e clique em **"Salvar e Ativar Mapa"**.
- *Resultado esperado:* O painel exibe aviso verde de sucesso e a tarefa aparece listada na aba Runner.

### Passo 3: Leitura de Turma e Verificação no Banco Local (5 min)
1. Na aba **"Runner"**, selecione a habilidade gravada e clique em **"Executar Habilidade"**.
2. Abra a janela do aplicativo Desktop Electron e clique no botão **"Atualizar Lista"**.
- *Resultado esperado:* A tabela de discentes exibe os alunos extraídos da página com nomes íntegros e IDs locais.

### Passo 4: Lançamento de Falta com CHECKPOINT Humano (10 min)
1. No portal sintético, navegue para a página de chamada: `http://127.0.0.1:8898/fixtures/attendance.html`.
2. Grave o fluxo de marcar falta para um aluno ou execute a habilidade correspondente.
3. Observe o painel v2 quando a execução atingir a etapa de mutação.
- *Resultado esperado:* Surge o modal de **CHECKPOINT** com fundo amarelo, detalhando o aluno, a alteração proposta e a advertência de irreversibilidade. Ao clicar em **"Confirmar"**, o checkbox na página é marcado com destaque visual verde.

### Passo 5: Teste Negativo — Fechar App e Tentar Escrever (5 min)
1. Feche completamente a janela do aplicativo Desktop Electron (encerrando o processo).
2. No painel v2 do Chrome, clique novamente para executar a escrita de falta.
- *Resultado esperado:* A execução **aborta imediatamente** exibindo a mensagem: *"Abra o app Teacher AI para continuar. O assistente precisa do aplicativo desktop ativo."* **Nenhum campo da página é modificado**.

### Passo 6: Mutação de Layout e Reparo Guiado (10 min)
1. Abra a fixture com layout modificado: `http://127.0.0.1:8898/fixtures/drift_layout.html`.
2. Execute a automação gravada anteriormente.
- *Resultado esperado:* O motor detecta o drift e exibe o card de reparo: *"Detectamos uma mudança no portal. Deseja aprovar a atualização?"*. Ao clicar em **"Aprovar"**, o motor roda em dry-run, atualiza a versão para v2 e executa com sucesso.

### Passo 7: Importação de Pacote Comunitário em Quarentena (10 min)
1. No aplicativo Desktop, vá até a seção **"Mapas da Comunidade"**.
2. Clique em **"Compartilhar Meu Mapa"** para gerar um pacote exportado `.teacherai.json`.
3. Importe um pacote de teste. Tente executá-lo imediatamente no painel da extensão.
- *Resultado esperado:* A execução é recusada com erro de quarentena. O mapa só funciona após a professora abrir os Detalhes no desktop e clicar em **"Ativar Mapa no Meu Portal"**.

### Passo 8: Varreduras Finais de Privacidade e Portas (5 min)
1. No terminal PowerShell, execute:
   ```powershell
   npm run privacy:scan
   npm run privacy:scan -- --ports
   ```
- *Resultado esperado:* Ambas as varreduras retornam código 0, indicando zero vazamentos de PII e zero portas TCP escutando em produção.
2. Anote os resultados numéricos no arquivo `docs/GATE_RESULTS.md`.

---

## 11. Apêndice

### Comandos Executados Durante a Auditoria
```powershell
git status --short
git branch -a
git log --oneline -20
git tag
git branch --merged
git ls-files docs/
npm run build:ext
npm run desktop:build
npx tsc --noEmit
npx vitest run __tests__/skillGraphV2.contract.test.ts __tests__/graphRunner.core.test.ts __tests__/compiler.core.test.ts __tests__/repair.core.test.ts __tests__/desktop.core.test.ts __tests__/community.core.test.ts __tests__/extensionHost.integration.test.ts
```

### Saídas de Falhas Registradas
- **Nenhuma falha de compilação ou teste:** Todos os comandos de compilação (`build:ext`, `desktop:build`, `tsc`) e todos os 136 testes de fronteira terminaram com **código 0 (sucesso absoluto)**.

### Itens Classificados como `NÃO VERIFICADO`
- **Comportamento em Navegador Real:** Classificado como `NÃO VERIFICADO (dono)` devido à estrita observância do princípio de não-fabricação de evidência. A comprovação final do Gate A depende da realização dos 8 passos descritos na Seção 10 pelo dono do projeto.
