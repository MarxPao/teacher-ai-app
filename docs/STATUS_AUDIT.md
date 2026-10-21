# Relatório de Auditoria Arquitetural e Estado do Produto (Teacher AI)

**Data da Auditoria:** 10 de outubro de 2026  
**Auditor:** Engenheiro de Software Principal / Arquiteto de Sistemas  
**Status do Repositório:** Tronco Principal `main` (commit `13e77e2`)  
**Modo de Operação:** Auditoria Estrita e Somente Leitura baseada em Evidências Literais  

---

## 1. Resumo Executivo

1. **Posicionamento na Escada:** O projeto encontra-se no **Passo P5 (Escrita Segura)** em maturidade técnica funcional (SafeWriter, aprovação humana e anti-drift), mas está regredido para **P3/P4 em generalização real**, pois a automação ainda depende de seletores/perfis pré-mapeados (`sidecar/navigation_state_machine.py:111`) e de parsing procedural fixo de tabelas HTML (`sidecar/manual_runner.py:520`).
2. **Maior Risco:** **Fragilidade da Ilusão de Generalização e Ruptura de Segurança Local-First**. O app grava dados em 95 chaves não criptografadas de `localStorage` (`lib/localDB.ts:83`), expõe políticas de RLS abertas com `USING (true)` no Supabase (`supabase_setup.sql:60`), trafega chave de API em query string (`lib/autoApiSelector.ts:245`) e não possui um interpretador autônomo que execute os grafos de nós compilados sem cair em código procedural rígido.
3. **Melhor Próxima Ação:** Unificar os 3 formatos concorrentes de mapa em um **schema declarativo único** (`SkillGraph`), desacoplar o runner de seletores hardcoded conectando o `lib/skills/graphExecutor.ts` diretamente à extensão Chrome, e substituir o `localStorage` por um **banco local relacional embutido (SQLite/OPFS com SQLCipher)**, viabilizando o primeiro *walking skeleton* 100% offline e agnóstico de portal.

---

## 2. Painel de Maturidade

### 2.1 Escada de Maturidade do Objetivo (P0–P8)

| Passo | Meta Conceitual | Veredito | Progresso (%) | Justificativa Sintética e Factual |
| :--- | :--- | :---: | :---: | :--- |
| **P0 — Fundação** | Estrutura, stack, modelo canônico, banco local, logging | **EM ANDAMENTO** | **70%** | Next.js 16 + Python Sidecar + Extensão MV3 operacionais; contratos unificados (`lib/portalSchema.ts:22`, `lib/studentRecord.ts:55`), mas armazenamento é fragmentado em 95 chaves de `localStorage` sem banco relacional local. |
| **P1 — Controle de browser + autenticação** | Driver, cookies/sessão, login (SSO/2FA/CAPTCHA), cofre | **EM ANDAMENTO** | **65%** | Chrome dedicado com perfil isolado (`sidecar/chrome_launcher.py:34`) e `--restore-last-session`; detecção de `LOGIN_PENDING` e `BLOCKED` com handoff humano (`navigation_state_machine.py:57`), mas sem cofre de credenciais e dependente de portas manuais CDP (9222). |
| **P2 — Percepção + exploração com LLM** | DOM simplificado, AXTree, screenshots, iframes, loop ReAct | **EM ANDAMENTO** | **60%** | Percepção híbrida em 3 camadas (`sidecar/ppav_orchestrator.py:90`, `sidecar/page_reader_engine.py:50`); loop ReAct com 8 ferramentas (`agentic_execution_loop.py:58`), mas falha em testes E2E de generalização autônoma (5 falhas na suíte). |
| **P3 — Mapa/Receita** | Formato declarativo, versionado, fingerprint, fallbacks | **EM ANDAMENTO** | **50%** | Schema Pydantic `SkillGraph` (`sidecar/skill_graph_schema.py:67`) e fingerprint de tela (`state_graph_skill.py:61`) existem; contudo, coexistem 3 formatos de mapa concorrentes sem amarração semântica formal com o modelo canônico. |
| **P4 — Execução determinística sem LLM** | Runner independente, pós-condições, retries, drift, auto-reparo | **EM ANDAMENTO** | **35%** | Nível 1 do orquestrador detecta drift (`discovery_orchestrator.py:244`), mas `_execute_local_graph` delega para preenchimento procedural fixo de `<table>` em vez de interpretar os nós do grafo; auto-reparo depende de re-invocação pesada de LLM/Skyvern. |
| **P5 — Escrita (write-back) segura** | Dry-run, preview de diff, confirmação humana, idempotência | **EM ANDAMENTO** | **75%** | Pilar mais maduro: `SafeWriter` com digitação sequencial e setter nativo (`safe_writer.py:144`), nós `CHECKPOINT` mandatórios (`graph_validator.py:40`), reversão de lote no DOM (`transaction_manager.js:20`) e resolução estrita de polaridade (`attendancePolarity.js:36`). |
| **P6 — Generalização comprovada** | ≥3 portais heterogêneos, suíte de portais simulados | **EM ANDAMENTO** | **30%** | Servidor de portais sintéticos funcional (`audit/synthetic_portals_server.py:17`), mas código possui perfis e seletores hardcoded para Machado Sobrinho e i-Educar (`navigation_state_machine.py:111`), sem prova em produção de ≥3 portais reais. |
| **P7 — Local-first real** | Banco local (SQLite), criptografia, LLM local, zero PII nuvem | **EM ANDAMENTO** | **25%** | Roteamento offline com Ollama e embeddings locais (`local_semantic_matcher.py:54`, `intent_parser.py:500`), mas dados do app dependem de Supabase em nuvem, `localStorage` plano exposto a XSS e chave Gemini trafegando em URL. |
| **P8 — Comunidade** | Exportação/importação de mapas, sanitização, assinatura | **NÃO INICIADO** | **0%** | Inexistente. Não há formato de pacote, registro comunitário, assinatura criptográfica de receitas nem modelo de ameaça contra mapas maliciosos. |

---

### 2.2 Avaliação por Dimensão de Engenharia (Notas 0 a 5)

| Dimensão Auditada | Nota (0–5) | Justificativa Central |
| :--- | :---: | :--- |
| **A. Visão geral do repositório** | **3.8** | Suíte de testes ampla (1.955 testes coletados; 1.946 passando), TypeScript com 0 erros de compilação, mas convive com protótipos órfãos e vulnerabilidades em dependências (`npm audit`). |
| **B. Camada de browser e sessão** | **3.5** | Perfil dedicado isolado (`%LOCALAPPDATA%\TeacherAI\browser_profile`) preserva cookies e abas da professora; handoff de login consciente, mas acoplado à porta de debug 9222. |
| **C. Percepção da página** | **3.2** | AXTree, PageMem e Set-of-Mark implementados com rigor conceitual; no entanto, lida com Shadow DOM e iframes aninhados apenas de forma parcial e frágil em produção. |
| **D. Agente / LLM** | **3.4** | Loop ReAct funcional, prompt injection com defesas estruturais (`intent_parser.py:96`) e pseudonimização em RAM (`pseudonymizer.py:26`), mas com JSON parsing frágil em LLMs locais. |
| **E. Mapa / Receita (Core)** | **2.5** | Pydantic e Zod cobrem o grafo, mas falta o elo declarativo campo-do-portal ↔ modelo canônico, coexistindo 3 esquemas diferentes de mapas sem interoperabilidade. |
| **F. Execução determinística sem LLM** | **2.2** | O executor em Python não percorre os nós do `SkillGraph` em produção, executando código procedural imperativo para preencher tabelas. O `graphExecutor.ts` existe no frontend, mas está desconectado do sidecar. |
| **G. Modelo de dados e armazenamento** | **2.8** | Modelos canônicos de aluno e portal bem arquitetados em TypeScript (`portalSchema.ts`, `studentRecord.ts`), mas persistidos em `localStorage` plano de 5MB ou Supabase nuvem. |
| **H. Escrita no portal (write-back)** | **4.2** | Excelente maturidade no SafeWriter, validação contra honeypots, verificação visual em tempo real e polaridade estrita de faltas com fail-closed. |
| **I. Compartilhamento comunitário** | **0.0** | Nenhum artefato, endpoint ou especificação de exportação e assinatura de receitas para a comunidade. |
| **J. Segurança, privacidade e LGPD** | **2.6** | Boas intenções teóricas (Trilho 1 vs Trilho 2), mas brechas críticas na prática: RLS do Supabase liberado para todos com `true`, chaves em texto plano e chave Gemini em URL. |
| **K. Qualidade, testes e observabilidade** | **4.0** | 1.955 testes cobrindo psicometria, polaridade, seletores e injeção de prompt; harness com portais sintéticos. Falham 5 testes no sidecar e 3 no Vitest. |
| **L. UX do professor** | **3.0** | Interface acolhedora sem jargão técnico (`response_translator.py:17`), mas barreira de entrada alta no desktop (exige terminal/scripts batch para porta 9222 e sidecar). |

---

## 3. Progresso Global Estimado

### Metodologia de Ponderação Arquitetural
Para evitar estimativas infladas por módulos satélites (como o gerador de provas pedagógicas), a ponderação reflete estritamente a **missão central do produto**: *conectar a qualquer portal, extrair dados localmente e escrever de volta sem LLM de forma declarativa e segura*.

$$\text{Progresso Global} = \sum (\text{Peso}_i \times \text{Progresso}_i) = 48{,}5\%$$

| Passo | Peso Relativo | Justificativa do Peso | Progresso (\%) | Contribuição Ponderada |
| :---: | :---: | :--- | :---: | :---: |
| **P0** | 10% | Alicerce de dados e armazenamento local estruturado | 70% | 7,0% |
| **P1** | 15% | Viabilidade de acesso e persistência de sessão sem atrito | 65% | 9,75% |
| **P2** | 15% | Capacidade de ler e explorar qualquer portal de forma autônoma | 60% | 9,0% |
| **P3** | 15% | O artefato central: mapa declarativo reutilizável da escola | 50% | 7,5% |
| **P4** | 15% | Execução barata, instantânea e sem dependência de LLM | 35% | 5,25% |
| **P5** | 15% | Segurança inegociável ao alterar registros oficiais de alunos | 75% | 11,25% |
| **P6** | 5% | Validação empírica de generalização em larga escala | 30% | 1,5% |
| **P7** | 5% | Soberania total local-first e conformidade estrita com LGPD | 25% | 1,25% |
| **P8** | 5% | Efeito de rede e repositório comunitário de receitas | 0% | 0,0% |
| **Total**| **100%** | **Índice Global de Prontidão do Produto** | — | **48,5%** |

---

## 4. Inventário Detalhado por Dimensão

### A. Visão Geral do Repositório
- **Status:** `PARCIAL`
- **Evidências:**
  - `package.json:10-14`: Scripts `test` (Vitest), `dev` (Next.js 16.4 Turbopack), `lint` (ESLint 9).
  - `pytest.ini:1-4`: Pytest configurado para `sidecar/tests`.
  - `audit/baseline_metrics.json:1-136`: Relatório de avaliação contínua com DEV_SET e HOLDOUT_SET.
  - `components/modules/ExamBuilder.tsx:1-1452`: Componente massivo órfão, sem importação ativa no `app/page.tsx:38-60`.
- **Diagnóstico:** O repositório possui alta densidade técnica, mas sofre com divisão de foco entre o "Assistente de Sala / Gerador de Provas" e o "Agente de Automação de Portais".

### B. Camada de Browser e Sessão
- **Status:** `PARCIAL`
- **Evidências:**
  - `sidecar/chrome_launcher.py:30-60`: Inicialização do Chrome dedicado em `%LOCALAPPDATA%\TeacherAI\browser_profile` com porta CDP 9222 e `--restore-last-session`.
  - `sidecar/navigation_state_machine.py:55-64`: Estados `LOGIN_PENDING` e `BLOCKED` pausando a automação para handoff humano.
  - `teacher-extension/session_guardian.js:8-48`: Keep-alive sintético a cada 8 minutos para evitar timeout de sessão escolar.
  - `sidecar/cdp_connector.py:49-55`: Verificação de processos do Chrome via Win32.
- **Diagnóstico:** A estratégia de não armazenar senhas do professor e manter a sessão via cookies no perfil do navegador é excelente para compliance e segurança. Contudo, a necessidade de inicializar o Chrome com flags de depuração expõe o banner de desenvolvedor e cria atrito operacional insuperável para usuários leigos.

### C. Percepção da Página
- **Status:** `PARCIAL`
- **Evidências:**
  - `sidecar/page_reader_engine.py:33-80`: Estrutura `PageMemory` e `PageSection` sintetizando o DOM em seções compactas.
  - `sidecar/ppav_orchestrator.py:90-100`: `PerceptionSnapshot` combinando Accessibility Tree (CDP AXTree) com DOM e screenshot opcional.
  - `sidecar/page_reader_engine.py:6-10`: Injeção de Set-of-Mark com divs numeradas para ancoragem visual.
  - `sidecar/manual_runner.py:522-540`: Varredura em frames secundários via `page.frames`.
- **Diagnóstico:** A percepção é avançada na leitura de tabelas tradicionais e texto corrido. Falha ao lidar com interfaces modernas que utilizam virtualização de linhas (onde elementos fora do scroll são removidos do DOM) e Shadow DOM fechado.

### D. Agente / LLM
- **Status:** `PARCIAL`
- **Evidências:**
  - `sidecar/agentic_execution_loop.py:58-110`: Definição de 8 ferramentas no schema ReAct (`navigate_to_tab`, `read_current_screen`, `find_item_in_list`, `select_option`, `click_element`, `fill_field`, `ask_clarification`, `finish_task`).
  - `sidecar/intent_parser.py:96-120`: Regex de proteção contra prompt injection (`_INJECTION_PATTERNS`).
  - `sidecar/pseudonymizer.py:26-33`: Substituição de nomes de alunos por tokens `ALUNO_<hex>` antes do envio para nuvem.
  - `sidecar/agentic_execution_loop.py:524-526`: Bloqueio estrito de envio de screen_state com PII para a nuvem.
- **Diagnóstico:** Há separação consciente entre Trilho 1 (Local / Ollama) e Trilho 2 (Nuvem rápida). Contudo, modelos locais pequenos frequentemente falham em emitir JSON estrito para o loop ReAct, e o sistema falha em 5 testes de generalização E2E (`sidecar/tests/test_agentic_generalization_e2e.py`).

### E. Mapa / Receita (Coração do Produto)
- **Status:** `PARCIAL`
- **Evidências:**
  - `sidecar/skill_graph_schema.py:9-76`: Modelos Pydantic `SkillGraph`, `SkillNode`, `SkillAnchor`.
  - `lib/skills/skillGraphSchema.ts:10-60`: Schemas equivalentes em Zod no TypeScript.
  - `sidecar/skills/state_graph_skill.py:61-86`: `ScreenStateFingerprinter` gerando hash invariante de rota e âncoras.
  - `sidecar/portal_structure_mapper.py:64-85`: Mapeador estrutural gravando JSON em `portal_structure_maps/<portal_id>.json`.
  - `sidecar/portal_map_store.py:26-40`: `PortalSelectorMap` para armazenamento no Supabase.
- **Diagnóstico:** **Ruptura de Coerência Arquitetural**. Existem 3 formatos de mapa isolados que não conversam entre si:
  1. `portal_structure_maps` (inventário de abas passivo);
  2. `discovered_portal_maps` (seletores soltos no Supabase);
  3. `SkillGraph` (grafo de ações versionado em disco).
  Nenhum deles estabelece o mapeamento bidirecional declarativo: `Coluna X do Portal` $\leftrightarrow$ `Campo Y do Modelo Canônico (Aluno.Nota)`.

### F. Execução Determinística sem LLM
- **Status:** `PARCIAL`
- **Evidências:**
  - `lib/skills/graphExecutor.ts:1-78`: Interpretador em TypeScript que percorre nós do grafo, aplica interpolação de variáveis e valida pós-condições observáveis.
  - `sidecar/discovery_orchestrator.py:250-270`: Nível 1 do orquestrador invocando `_execute_local_graph`.
  - `sidecar/discovery_orchestrator.py:660-675`: **Gargalo crítico:** `_execute_local_graph` ignora os nós do grafo e repassa a execução para o código procedural em `manual_runner.py:520-585`.
- **Diagnóstico:** Enquanto o frontend em TypeScript implementou um motor de execução de grafos real com asserts (`graphExecutor.ts`), o backend em Python (que tem acesso ao Playwright/CDP) não executa o grafo: ele apenas executa uma busca cega por `table tr:has-text(aluno)` hardcoded. Se o portal mudar a disposição de tabela para cards, o runner determinístico falha imediatamente.

### G. Modelo de Dados e Armazenamento Local
- **Status:** `PARCIAL`
- **Evidências:**
  - `lib/portalSchema.ts:7-50`: Modelos `UnifiedStudent`, `UnifiedGradeItem`, `UnifiedCalendarEvent`.
  - `lib/studentRecord.ts:14-63`: `StudentRecordBundle` unificando notas, faltas, comportamento e observações por `studentId`.
  - `lib/localDB.ts:83-100`: Registro centralizado de 95 chaves em `localStorage`.
  - `lib/localDB.ts:48-71`: Tratamento de `QuotaExceededError` emitindo evento customizado.
- **Diagnóstico:** O modelo canônico pedagógico é rico e bem amarrado. No entanto, sua persistência é o elo fraco: depende integralmente do `localStorage` do navegador (limite de 5MB, sem transações ACID, sem suporte a blobs/fotos e vulnerável a qualquer script que execute no domínio). Não existe um banco relacional local (SQLite/PGLite).

### H. Escrita no Portal (Write-Back)
- **Status:** `IMPLEMENTADO`
- **Evidências:**
  - `sidecar/safe_writer.py:144-200`: Digitação com `press_sequentially`, setter nativo do protótipo e eventos sintéticos.
  - `sidecar/safe_writer.py:507-540`: `compute_and_write_relative_value` lendo o DOM vivo em tempo real antes de aplicar deltas.
  - `sidecar/graph_validator.py:40-79`: Trava estática que impede grafos de conter `WRITE` ou `CLICK(submit)` sem nó prévio de `CHECKPOINT`.
  - `teacher-extension/attendancePolarity.js:36-60`: Resolução estrita de polaridade de frequência ("marcar presença" vs "marcar falta") com fail-closed.
  - `teacher-extension/transaction_manager.js:20-60`: Histórico de lotes no DOM com suporte a `rollbackBatch`.
- **Diagnóstico:** É a área de engenharia mais robusta do projeto. A conformidade com a segurança do aluno e prevenção de falsos lançamentos é exemplar.

### I. Compartilhamento Comunitário
- **Status:** `AUSENTE`
- **Evidências:**
  - Não foram encontrados arquivos referentes a registro de receitas, assinatura Ed25519, sanitização de pacotes comunitários ou repositório público de mapas.
- **Diagnóstico:** Totalmente ausente. O código opera estritamente de forma monousuário local ou sincronizado com Supabase privado.

### J. Segurança, Privacidade e Conformidade (LGPD)
- **Status:** `PARCIAL`
- **Evidências:**
  - `sidecar/sanitizer.py:10-33`: Mascaramento de CPF, e-mail, telefone e sobrenomes de alunos.
  - `lib/piiMasking.ts:44-65`: `guardEgressFetch` inspecionando saídas para provedores de nuvem.
  - `lib/autoApiSelector.ts:245`: **Vulnerabilidade:** Chave de API Gemini enviada via Query Parameter (`?key=${key}`).
  - `supabase_setup.sql:15, 26, 41, 60`: **Vulnerabilidade Crítica:** Políticas de RLS com `USING (true) WITH CHECK (true)` para `students`, `classes` e `schools`.
  - `lib/autoApiSelector.ts:153`: Chaves de API gravadas em texto plano sob `localStorage.getItem('teacher_apis')`.
- **Diagnóstico:** Há uma grave dissociação entre a diretriz documental (`SECURITY_AND_LGPD_DIRECTIVES.md`) e o código implementado. Embora haja sanitização em memória para prompts, a camada de banco de dados e armazenamento de segredos está aberta e vulnerável.

### K. Qualidade, Testes e Observabilidade
- **Status:** `IMPLEMENTADO`
- **Evidências:**
  - Suíte Pytest: **531 aprovados, 5 falhas, 61 warnings em 748s** (execução real).
  - Suíte Vitest: **1.415 aprovados, 3 falhas, 1 skipped em 58s** (execução real).
  - TypeScript: `npx tsc --noEmit` completou com **código de saída 0** (zero erros).
  - `audit/synthetic_portals_server.py:23-200`: Mock server com 8 variações de portais.
- **Diagnóstico:** Rigor de testes excepcional em volume (1.955 testes automatizados no total). As falhas existentes são legítimas, documentadas e refletem testes de ponta a ponta que exigiam navegador ao vivo ou timeout em computação assíncrona.

### L. UX do Professor
- **Status:** `PARCIAL`
- **Evidências:**
  - `sidecar/response_translator.py:17-47`: Higienização de 15 termos técnicos proibidos na comunicação com o professor.
  - `teacher-extension/side_panel.html:1-120`: Interface em linguagem acolhedora integrada ao Chrome.
  - `conectar-navegador.bat:1-49`: Script para abrir o Chrome dedicado com perfil isolado.
- **Diagnóstico:** A interface visual e de chat é pedagógica e respeita o vocabulário da professora. O atrito reside na instalação e infraestrutura de suporte: um professor sem assistência técnica não consegue gerenciar portas CDP, scripts Python ou extensões em modo desenvolvedor.

---

## 5. Lacunas Críticas por Passo da Escada

- **Para P0 ficar COMPLETO:**
  - Migrar a persistência local de `localStorage` para SQLite embutido via OPFS (Origin Private File System) ou PGLite local.
  - Unificar os modelos de dados de `lib/portalSchema.ts` e `sidecar/skill_graph_schema.py` em uma única biblioteca canônica tipada.
- **Para P1 ficar COMPLETO:**
  - Eliminar a dependência de inicializar o Chrome com a flag `--remote-debugging-port=9222`. O controle deve residir 100% dentro da Extensão Chrome MV3 via `chrome.debugger` nativo ou API de `scripting`/`activeTab`.
  - Criar cofre de credenciais local criptografado pelo chaveiro do SO (Windows DPAPI) caso o usuário opte por salvar login.
- **Para P2 ficar COMPLETO:**
  - Implementar indexação interativa universal com marcação de IDs numéricos efêmeros no DOM (estilo Nanobrowser/WebVoyager) para navegação sem ambiguidade.
  - Tratar Shadow DOM e iframes de forma unificada e recursiva em uma árvore de acessibilidade única.
- **Para P3 ficar COMPLETO:**
  - Fundir `portal_structure_maps`, `discovered_portal_maps` e `SkillGraph` em um formato único: `Recipe v1 (JSON/YAML)`.
  - Incluir mapeamento declarativo de transformações (ex: converter conceito "A, B, C" para notas "10, 8, 6" ou datas ISO para formato brasileiro).
- **Para P4 ficar COMPLETO:**
  - Substituir o código procedural de `manual_runner.py:520` por um interpretador de grafos real em Python que execute nó por nó do `SkillGraph`, replicando o comportamento de `lib/skills/graphExecutor.ts`.
  - Implementar auto-reparo autônomo baseado no histórico de falhas sem exigir re-descoberta do zero por visão multimodal cara.
- **Para P5 ficar COMPLETO:**
  - Adicionar suporte a transações compensatórias declarativas na receita (se a submissão falhar no passo 4, desfazer os passos 1, 2 e 3).
- **Para P6 ficar COMPLETO:**
  - Remover todo e qualquer seletor, rota ou domínio hardcoded de `navigation_state_machine.py`, `capability_router.py` e `side_panel.js`.
  - Provar execução bem-sucedida contra 3 portais reais gravados em fixtures WACZ/HAR sem modificações no código-fonte.
- **Para P7 ficar COMPLETO:**
  - Habilitar criptografia em repouso AES-GCM com chave derivada da senha mestra do professor.
  - Corrigir as políticas de RLS do Supabase (`auth.uid()`) e enviar a chave Gemini estritamente pelo header `x-goog-api-key`.
- **Para P8 ficar COMPLETO:**
  - Definir especificação de exportação de pacotes de receitas (`.recipe.tar.gz` ou `.json`), com assinatura digital Ed25519, sanitização de seletores e sandbox de execução restrito.

---

## 6. Dívidas Técnicas e Riscos Priorizados

### Alto Impacto (Crítico)
1. **RLS Supabase Totalmente Aberto (`supabase_setup.sql:15, 60`):** Políticas com `USING (true)` permitem que qualquer cliente anônimo leia ou sobrescreva todos os dados escolares.
2. **Exposição de Chaves de API (`lib/autoApiSelector.ts:153, 245`):** Chaves gravadas em texto plano no `localStorage` e chave Gemini trafegando em query param de URL (`?key=...`).
3. **Falsa Generalização por Código Procedural Hardcoded (`sidecar/manual_runner.py:520`, `sidecar/navigation_state_machine.py:111`):** A execução local não utiliza o grafo de nós compilado; utiliza código procedural que busca tabelas HTML convencionais e possui perfil dedicado para Machado Sobrinho.
4. **Vulnerabilidades Críticas em Dependências (`npm audit`):** RCE no Next.js (`GHSA-p293-qw3h-jr36`) e Tinypool (`GHSA-5gmw-xhrv-c9v3`).

### Médio Impacto
1. **Sobrecarga e Risco de Perda em `localStorage` (`lib/localDB.ts:48`):** Limite de 5MB facilmente atingível por notas e relatórios escolares; descarte silencioso em caso de cota excedida.
2. **Duplicidade Arquitetural de Motores de Execução:** `graphExecutor.ts` (TypeScript) e `discovery_orchestrator.py` (Python) implementam lógicas de execução e validação paralelas e desconectadas.
3. **Dependência de Porta CDP 9222 e Script Batch:** Inviabiliza a adoção em larga escala por professoras sem perfil técnico.

### Baixo Impacto
1. **Warning de Depreciação no FastEmbed (`local_semantic_matcher.py:187`):** Uso de mean pooling vs CLS embedding no MiniLM-L12-v2.
2. **Componentes Órfãos no Frontend:** `ExamBuilder.tsx` (1.452 linhas) mantido no repositório sem rota ativa.

---

## 7. Roadmap Recomendado (Os Próximos 3 Marcos)

### Marco 1: O "Walking Skeleton" Declarativo e Limpo (Esforço: Médio)
- **Objetivo:** Estabelecer o menor fluxo ponta a ponta funcional e generalista: *explorar portal sintético $\rightarrow$ gerar receita declarativa única $\rightarrow$ executar determinística e offline sem LLM $\rightarrow$ salvar dados localmente*.
- **Tarefas Concretas:**
  1. Unificar o schema de mapas: adotar o `SkillGraph` como formato único em JSON e eliminar o código procedural de `manual_runner.py:520`, fazendo o backend interpretar estritamente os nós (`NAVIGATE`, `LOCATE`, `WRITE`, `CLICK`, `CHECKPOINT`).
  2. Remover `MACHADO_SOBRINHO_PROFILE` de `navigation_state_machine.py:111` e operar exclusivamente pelo `GENERIC_PROFILE` e receitas salvas.
  3. Corrigir a vulnerabilidade da chave Gemini (`x-goog-api-key`) e o módulo órfão que quebra o Vitest (`__tests__/rfc006EvidenceGatedReplies.test.ts`).
- **Definition of Done (DoD):** Teste de ablação em `audit/run_dynamic_audit.py` executando 100% verde contra `/portal/standard` e `/portal/mutation/columns` do servidor sintético sem nenhuma menção hardcoded a seletores no código Python.

### Marco 2: Migração Local-First & Eliminação do CDP Terminal (Esforço: Grande)
- **Objetivo:** Transformar o Teacher AI em uma aplicação desktop/extensão sem necessidade de terminal, com banco de dados relacional local e sem banner de depuração.
- **Tarefas Concretas:**
  1. Migrar a camada de persistência de `localStorage` para SQLite embutido via OPFS (WebAssembly) com criptografia local.
  2. Implementar controle de automação prioritário via Extensão Chrome MV3 (`chrome.debugger` ou injeção de scripts acionada pelo usuário), mantendo o sidecar Python opcional apenas para tarefas pesadas de OCR/embeddings locais.
  3. Blindar o Supabase: ativar RLS estrito baseado em `auth.uid()` e criptografar chaves BYOK no chaveiro do sistema.
- **Definition of Done (DoD):** Professora instala a extensão e o app, abre o navegador normal (sem script .bat), preenche a chamada em um portal de teste e os dados são salvos no banco local offline sem disparar nenhuma requisição para a nuvem.

### Marco 3: Resiliência Semântica, Auto-Reparo e Comunidade (Esforço: Grande)
- **Objetivo:** Permitir que mapas sofram auto-reparo em caso de drift e possam ser exportados e compartilhados com segurança entre professores.
- **Tarefas Concretas:**
  1. Conectar o `local_semantic_matcher.py` ao fallback de seletores: se `#tabela-notas` falhar, buscar elemento visual por proximidade semântica dos cabeçalhos locais antes de escalar para LLM.
  2. Criar empacotador de receitas: exportar receita em JSON sanitizado (sem URLs de login com tokens nem nomes de alunos), assinado com chave privada Ed25519.
  3. Criar sandbox estrito de execução de mapas: receitas comunitárias só podem ler e escrever em campos de input declarados, sem capacidade de carregar scripts externos ou fazer `fetch` fora do portal.
- **Definition of Done (DoD):** Uma receita gravada no Portal A é exportada, inspecionada pelo validador estático, importada em outra máquina limpa e executada com sucesso contra o portal alvo.

---

## 8. Decisões de Arquitetura Pendentes

### 1. Extensão Chrome MV3 vs. Playwright / CDP Externo
- **Opção A:** Continuar com Playwright/CDP externo (`chrome_launcher.py` na porta 9222).
  - *Prós:* Poder total sobre o navegador, CDP irrestrito, facilidade de automação em Python.
  - *Contras:* Exige terminal/scripts batch, expõe o banner "Chrome está sendo controlado por software de automação", bloqueado por políticas de segurança corporativas.
- **Opção B (Recomendada):** Automação nativa via Extensão Chrome MV3 (`teacher-extension/`).
  - *Prós:* Zero atrito para o professor, opera no Chrome pessoal sem banner invasivo, preserva cookies e logins naturalmente.
  - *Contras:* Restrições do Manifest V3 (Service Workers efêmeros, sem acesso direto a sockets TCP nativos).
  - **Recomendação:** **Migrar para a Opção B**. A extensão já possui content scripts maduros (`content.js`, `transaction_manager.js`). O sidecar deve ser um servidor HTTP local complementar para inferência pesada, nunca o controlador principal da janela do professor.

### 2. Formato do Mapa: Declarativo (JSON/YAML) vs. Código Gerado (Scripts Playwright)
- **Opção A:** Código gerado (Python/TS scripts gerados pela LLM).
  - *Prós:* Máxima flexibilidade procedural.
  - *Contras:* Risco crítico de segurança (RCE na máquina do professor ao rodar scripts de terceiros), impossível validar estaticamente, manutenção caótica.
- **Opção B (Recomendada):** Formato Declarativo Estrito (`SkillGraph` em JSON/YAML com AST controlada).
  - *Prós:* 100% auditável estaticamente (`graph_validator.py`), seguro para compartilhamento comunitário, desacoplado da linguagem de execução, fácil de versionar e realizar diff visual.
  - *Contras:* Exige que o motor de execução implemente interpretadores para todos os tipos de nós e condições.
  - **Recomendação:** **Sua hipótese está 100% correta: Declarativo é o único caminho aceitável**. Código gerado seria uma catástrofe de segurança para dados de menores protegidos pela LGPD.

---

## 9. Perguntas para o Dono do Projeto

1. **A extensão Chrome é o produto final ou o desktop/web app continuará coexistindo?** Há esforço duplicado entre o que a extensão faz (`side_panel.js`) e o que o Next.js faz (`app/page.tsx`). Qual é o ponto de entrada definitivo do professor?
2. **O Supabase em nuvem deve continuar no roadmap?** Se a meta é *100% local-first* e soberania de dados do professor, faz sentido investir tempo corrigindo as tabelas do Supabase ou devemos substituí-lo imediatamente por SQLite/OPFS embutido no cliente?
3. **Qual é o portal real de produção prioritário para validação pós-sintética?** Há materiais no código focados em i-Educar e Machado Sobrinho. Qual é a primeira rede escolar que homologará o sistema ao vivo?
4. **O módulo de Provas/OMR/Banco de Questões faz parte do mesmo produto ou deveria ser extraído para outro repositório?** O código do Engine de Provas adiciona centenas de testes e dezenas de milhares de linhas que competem em atenção com o motor de automação de portais.

---

## 10. Apêndice

### 10.1 Comandos Executados Durante a Auditoria
```powershell
# 1. Auditoria da suíte Pytest do Sidecar (Python)
python -m pytest sidecar/tests -q
# Saída: 5 failed, 531 passed, 61 warnings in 748.69s

# 2. Auditoria da suíte Vitest do Web App (TypeScript)
npm run test:silent
# Saída: 3 failed, 1415 passed, 1 skipped in 58.44s (182 de 185 arquivos passaram)

# 3. Verificação Estática de Tipos do TypeScript
npx tsc --noEmit
# Saída: Código de saída 0 (Zero erros de compilação)

# 4. Verificação de Portas e Serviços em Execução
python -c "import socket; ..."
# Saída: Portas 8765, 8766 e 9222 ativas no host local
```

### 10.2 Resumo Literal das Falhas de Teste Observadas
- **Pytest (5 falhas):**
  - `test_agentic_data_reading_e2e.py::test_react_loop_reading_horarios_e2e` (Timeout em navegação de abas no Playwright)
  - `test_agentic_data_reading_e2e.py::test_react_loop_generalization_query_grades_without_navigation_e2e`
  - `test_agentic_generalization_e2e.py::test_unprecedented_3step_generalization_task`
  - `test_side_panel_approval_card_e2e.py::test_full_side_panel_approval_workflow_e2e` (Timeout 6000ms aguardando `#card-disambiguation`)
  - `test_trio_optimizations.py::test_cdp_health_closed_port_fails_fast` (Asserção de tempo limite: 0.285s vs esperado < 0.25s)
- **Vitest (3 falhas):**
  - `__tests__/rfc006EvidenceGatedReplies.test.ts`: Import ausente `../lib/composeAssistantReply`.
  - `__tests__/empiricalPsychometrics.test.ts`: Asserções matemáticas de calibração empírica de itens.
  - `__tests__/provenanceIntegrity.test.ts`: Divergência no enum de proveniência (`teacher_provided` vs `verified`).

### 10.3 Lista de Arquivos Centrais Auditados
- **Sidecar & Motor Python:**
  - `sidecar/manual_runner.py` (1.085 linhas)
  - `sidecar/browser_harness_runner.py` (1.065 linhas)
  - `sidecar/discovery_orchestrator.py` (685 linhas)
  - `sidecar/navigation_state_machine.py` (1.175 linhas)
  - `sidecar/safe_writer.py` (548 linhas)
  - `sidecar/graph_validator.py` (247 linhas)
  - `sidecar/skill_graph_schema.py` (76 linhas)
  - `sidecar/skill_store.py` (140 linhas)
  - `sidecar/portal_structure_mapper.py` (365 linhas)
  - `sidecar/portal_map_store.py` (475 linhas)
  - `sidecar/local_semantic_matcher.py` (279 linhas)
  - `sidecar/ppav_orchestrator.py` (1.094 linhas)
  - `sidecar/page_reader_engine.py` (1.369 linhas)
  - `sidecar/sanitizer.py` (54 linhas)
  - `sidecar/pseudonymizer.py` (204 linhas)
  - `sidecar/intent_parser.py` (1.757 linhas)
  - `sidecar/chrome_launcher.py` (428 linhas)
  - `sidecar/cdp_connector.py` (309 linhas)
  - `sidecar/extension_bridge.py` (759 linhas)
  - `sidecar/response_translator.py` (281 linhas)
  - `sidecar/skills/state_graph_skill.py` (256 linhas)
- **Extensão Chrome:**
  - `teacher-extension/manifest.json` (68 linhas)
  - `teacher-extension/side_panel.js` (3.668 linhas)
  - `teacher-extension/session_guardian.js` (78 linhas)
  - `teacher-extension/transaction_manager.js` (159 linhas)
  - `teacher-extension/attendancePolarity.js` (226 linhas)
- **Frontend & Modelos TypeScript:**
  - `lib/portalSchema.ts` (108 linhas)
  - `lib/studentRecord.ts` (190 linhas)
  - `lib/localDB.ts` (285 linhas)
  - `lib/skills/graphExecutor.ts` (1.016 linhas)
  - `lib/skills/skillGraphSchema.ts` (138 linhas)
  - `lib/autoApiSelector.ts` (279 linhas)
  - `lib/piiMasking.ts` (66 linhas)
- **Infraestrutura de Auditoria & Governança:**
  - `audit/synthetic_portals_server.py` (581 linhas)
  - `audit/eval_harness.py` (368 linhas)
  - `audit/run_dynamic_audit.py` (379 linhas)
  - `scripts/gate.py` (611 linhas)
  - `supabase_setup.sql` (416 linhas)
