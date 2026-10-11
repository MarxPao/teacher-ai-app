# Nota de Design: Generalização por Arquétipos (SkillGraph v2)

Este documento estabelece o design técnico da **Fase 4 (Generalização por Arquétipo)**, definindo a matriz de 20 arquétipos de portais educacionais, os níveis de suporte (Tier 1/2/3), o modelo de permissões dinâmicas no Manifest V3, o desenho de runtime dos novos nós/capacidades e a suíte de conformidade na extensão.

---

## 1. Matriz dos 20 Arquétipos Educacionais

| ID | Nome do Arquétipo | Presença | Resolução pelo Runner (Seletor, Evento, Driver) | Tier |
| :--- | :--- | :--- | :--- | :---: |
| `arq_table_classic` | Tabela HTML clássica (`<table>`) | Sintético F2 / Holdout | `DomDriver`/`RemoteDriver` via `readTable` e `locateRow` em `thead`/`tbody`. | 1 |
| `arq_cols_reversed` | Colunas invertidas (alunos em cols) | Sintético F2 / Holdout | `readTable` com mapeamento transposto e busca de aluno por cabeçalho de coluna. | 1 |
| `arq_header_2lines` | Cabeçalho multinível (`colspan`/`rowspan`) | Sintético F2 / Real | `parseTableHeaders` achatando hierarquia em rótulos compostos (`Bimestre 1 - Falta`). | 1 |
| `arq_cells_merged` | Células mescladas em linhas | Sintético F2 / Real | `tableReader` propagando dados de células com `rowspan` para linhas filhas. | 1 |
| `arq_footer_total` | Linha de total/resumo ao rodapé | Sintético F2 / Holdout | `RowSkip` nos nós `READ` e `LOOP` descartando linhas com termos de agregação. | 1 |
| `arq_divs_grid` | Grade simulada por Divs (`display: grid`) | Sintético F2 / Real | Localização por `role="row"`/`role="gridcell"` ou seletores estruturais relativos. | 1 |
| `arq_shadow_dom` | Componentes em Shadow DOM | Sintético F2 / Real | Algoritmo recursivo de travessia penetrando `element.shadowRoot` nas âncoras. | 1 |
| `arq_spa_late_render` | SPA com render tardio / reatividade lenta | Sintético F2 / Real | Nó `WAIT` com condições explícitas (`visible`, `not_exists` do indicador de carga). | 1 |
| `arq_pagination_btn` | Paginação tradicional por botões | Sintético F2 / Holdout | Primitiva `paginate` com detecção de botão Próxima e detecção de última página. | 1 |
| `arq_infinite_scroll` | Scroll infinito por viewport | Holdout / Real | Primitiva `scroll` iterando até aumento de contagem ou estabilização do container. | 1 |
| `arq_table_virtual` | Tabela virtualizada (janelamento de DOM) | Sintético F2 / Real | Nó `LOCATE` com `mode: "scroll_until_found"` sincronizado ao buffer virtual. | 1 |
| `arq_iframe_same` | Iframe de mesma origem | Sintético F2 / Real | Acesso direto via `contentDocument` ou delegação por `frameId` no `RemoteDriver`. | 1 |
| `arq_iframe_cross` | Iframe de origem cruzada (cross-origin) | Holdout / Real | Injeção de content script via `scripting.executeScript` com RPC roteado por `frameId`. | 1 |
| `arq_modal_block` | Modal bloqueante / confirmação com foco | Sintético F2 / Real | Nó `WAIT` até renderização do modal + `CLICK` de confirmação ou descarte. | 1 |
| `arq_form_strict` | Formulário estrito com validação cliente | Holdout / Real | Disparo ordenado: `focus` -> `input` -> `change` -> `blur` + `WAIT` de classes de erro. | 1 |
| `arq_wizard_multi` | Assistente multi-etapas (Wizard) | Holdout / Real | Sequência encadeada de passos com espera de âncora do cabeçalho da próxima etapa. | 1 |
| `arq_download` | Exportação e download de arquivo | Holdout / Real | Nó `DOWNLOAD` monitorando evento de download do navegador sem vazar paths do SO. | 1 |
| `arq_upload` | Importação e upload de arquivo | Holdout / Real | Nó `UPLOAD` injetando `File` via `DataTransfer` em `input[type="file"]`. | 1 |
| `arq_challenge` | Desafio de segurança (Captcha/2FA) | Holdout / Real | Nó `HANDOFF_HUMAN` pausando execução com alerta sonoro/visual até resolução. | 2 |
| `arq_sso_redirect` | Autenticação SSO com redirect externo | Real | Nó `HANDOFF_HUMAN` monitorando retorno para domínio listado em `allowed_hosts`. | 2 |
| `arq_diario_grid` | Diário de classe em grade matricial | Sintético F2 / Real | `RowScope` por matrícula cruzado com coluna por data via `column_header`. | 1 |

---

## 2. Níveis de Suporte (Tiers)

- **Tier 1 (Totalmente Determinístico e Autônomo):** Execução 100% automatizada e sem intervenção humana. Todo fluxo grava, compila e roda deterministicamente sem LLM em tempo de execução.
- **Tier 2 (Assistido / HITL - Human-in-the-Loop):** Exige interação humana pontual e isolada (ex: resolução de CAPTCHA, autenticação SSO em domínio corporativo, ou seleção manual de filtros dinâmicos sem URL quando `FILTER` não estiver em contrato). O runner gerencia a transição de foco, exibe instruções acolhedoras na extensão e retoma com segurança.
- **Tier 3 (Não Suportado no SkillGraph v2):** Portais que violam as premissas de acessibilidade e segurança do DOM (ex: interfaces 100% renderizadas em Canvas/WebGL sem nós acessíveis, applets Flash/Java legados, ou portais que obfuscam e criptografam o DOM a cada frame impedindo âncoras estáveis).

---

## 3. Modelo de Permissões Dinâmicas no MV3

1. **Princípio do Menor Privilégio:** A extensão não declara `<all_urls>` estático no manifesto.
2. **`optional_host_permissions` e `downloads`:** As origens dos portais e a permissão de download são declaradas como opcionais.
3. **Solicitação sob Demanda:** Ao abrir a tela de revisão de um mapa gravado ou ao disparar a execução de um grafo, a extensão invoca `chrome.permissions.request({ origins: [targetOrigin], permissions: [...] })` em resposta estrita a um clique do professor.
4. **Tratamento de Recusa Limpa:** Se o usuário recusar a concessão de permissão, o `RemoteDriver` não entra em crash; ele aborta com código canônico `E_PERMISSION_DENIED` e exibe mensagem acolhedora no painel.

---

## 4. Desenho de Runtime dos Novos Nós e Capacidades

### 4.1. `DOWNLOAD`
- **Operação:** O nó `DOWNLOAD` localiza o elemento gatilho (`trigger`), inicia escuta na API `chrome.downloads.onCreated`/`onChanged` e dispara o clique.
- **Privacidade e LGPD:** O runner valida `filename_pattern` e `mime_hint`. **Nunca expõe caminhos absolutos do sistema operacional** (como `C:\Users\<nome>\Downloads`), retornando apenas metadados seguros (nome base do arquivo, tamanho em bytes e hash).
- **Timeout:** Máximo de 30s.

### 4.2. `UPLOAD`
- **Operação:** O nó `UPLOAD` localiza o `input[type="file"]`, cria uma instância de `File` a partir do valor resolvido (`ValueRef` com payload sintético ou referenciado) e o atribui usando `DataTransfer.items.add(file)`.
- **Eventos:** Dispara `input` e `change` sequencialmente para acionar listeners de frameworks modernos.
- **Segurança:** Como operação com efeito colateral (P4), requer verificação prévia de `CHECKPOINT`.

### 4.3. Scroll Infinito
- **Operação:** Em containers com scroll dinâmico, `scroll(options)` move o `scrollTop` iterativamente, aguarda estabilização do DOM via mutação ou timeout de 300ms e verifica o surgimento de novos elementos.
- **Trava de Saída:** Interrompe ao encontrar o elemento alvo, ao atingir `max_scrolls` (padrão 20) ou ao detectar que `scrollTop + clientHeight >= scrollHeight`.

### 4.4. Assistente Multi-Etapa (Wizard)
- **Operação:** Estruturado como sequência de nós determinísticos: preenchimento da etapa atual -> clique no botão de avanço -> nó `WAIT` com `expect_fingerprint` ou validação do título da etapa seguinte antes de prosseguir.

### 4.5. Desafio com Handoff (`HANDOFF_HUMAN`)
- **Operação:** Pausa o engine, emite evento `handoff_requested`, toca alerta discreto no painel e exibe banner amigável: *"Por favor, resolva a confirmação na tela e clique em Continuar"*.
- **Retomada:** Monitora o predicado declarativo `resume_when` ou aguarda clique no botão "Continuar" do painel. Timeout de segurança configurável (padrão 60s, máx 300s).

### 4.6. SSO com Redirecionamento
- **Operação:** Trata saltos temporários para provedores de identidade externos. O runner entra em modo de espera tolerante até que a URL do navegador retorne para um dos hosts autorizados em `safety.allowed_hosts`.

### 4.7. Formulário Estrito com Validação Cliente
- **Operação:** Em campos com validações reativas (Angular/React Formik), o driver emite o ciclo completo de eventos: `focus` -> digitação (`input`) -> `change` -> `blur`. Em seguida, avalia a ausência de nós com classes `.invalid-feedback` ou atributos `aria-invalid="true"`.

---

## 5. Desenho da Suíte de Conformidade na Extensão

1. **Duas Origens Locais (`127.0.0.1:8898` e `localhost:8898`):** O harness de teste sobe rotas em ambos os hosts, permitindo testar cenários reais de iframe cross-origin e restrições de mesma origem sem dependência de internet.
2. **Execução do Conjunto DEV:** A extensão lê o manifesto de cenários DEV e executa cada grafo contra a respectiva fixture, comparando o estado final e a contagem de escritas com o esperado.
3. **Aba "Suíte" no Painel:** Interface visual organizada em abas com tabela de cenários, badges de status (*Aguardando*, *Executando*, *Aprovado*, *Falhou*), tempo em milissegundos e log de eventos colapsável.
4. **Travamento de HOLDOUT (`conformance/holdout.lock`):**
   - O arquivo `conformance/holdout.lock` é montado puramente como lista estática de identificadores e hashes SHA-256 dos cenários travados (5 legados + 5 novos).
   - **Regra Rígida:** O agente NÃO executa os cenários do HOLDOUT. Sua execução é reservada exclusivamente para o dono/auditor no gate final.

---

## 6. Decisões do Dono / Bloqueio de Contrato

As seguintes decisões demandam instrução expressa no Gate 0:
1. **Nó `FILTER` (Contrato 2.1):** Autoriza subir a especificação para `2.1` e implementar o nó `FILTER` nativo, ou mantemos a decisão da Fase 3 (navegação via `NAVIGATE.query` + `CLICK`, mantendo dropdowns que não alteram URL classificados em Tier 2)?
2. **Gravação e Execução em Lote:** Na gravação de turmas completas, o compilador deve sintetizar o nó `LOOP` iterando sobre a lista de alunos (com checkpoint `per_batch`), ou a extensão grava 1 aluno e o professor aciona o preenchimento em lote na interface?
3. **Portal Real do Dono:** Qual é o domínio do portal escolar de homologação? O fluxo de teste envolve autenticação prévia? A URL do portal se altera ao trocar de turma/disciplina ou opera puramente via chamadas assíncronas em SPA?

---

## 7. Layout de Pastas e Lista de Arquivos

```
conformance/
  ├── holdout.lock                         # Lockfile com hashes dos 10 cenários travados
  └── dev_manifest.json                    # Manifesto dos cenários DEV da suíte
tools/runner-harness/fixtures/archetypes/
  ├── download.html                        # Fixture de disparo de download
  ├── upload.html                          # Fixture de input file com validação
  ├── infinite-scroll.html                 # Fixture de container com scroll incremental
  ├── wizard.html                          # Fixture de formulário multi-etapas
  ├── challenge-handoff.html               # Fixture de desafio interativo / captcha
  ├── sso-redirect.html                    # Fixture de fluxo de autenticação e retorno
  └── strict-form.html                     # Fixture de validação cliente rigorosa
graphs/archetypes/dev/                     # Grafos compilados de teste para cada fixture DEV
lib/runner/nodes/
  ├── download.ts                          # Executor do nó DOWNLOAD
  └── upload.ts                            # Executor do nó UPLOAD
lib/runner-ext/
  └── permissions.ts                       # Gerenciador de optional_host_permissions e downloads
teacher-extension/
  └── suite.js / suite.html                # Lógica e interface da aba "Suíte" no painel
```
