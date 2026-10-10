# Bugs e Limitações Conhecidas (Fase 0 - Registro sem Correção)

Este documento registra as falhas de teste e limitações arquiteturais identificadas na auditoria prévia (`docs/ARCH_PREP_AUDIT.md`).
**Conforme as regras da Fase 0 (Higiene Mínima), nenhum destes itens foi alterado no código agora**, preservando a integridade das regras de negócio até as fases correspondentes de re-arquitetura.

---

## 1. Falhas da Suíte Vitest (Frontend / TypeScript)

### 1.1 `empiricalPsychometrics.test.ts:112` — Divergência Psicométrica Nominal
- **Descrição do Erro:** A asserção `expect(psych.isDivergentFromNominal).toBe(true)` falha porque o motor retornou `false` para itens pedagógicos considerados fáceis que apresentaram taxa empírica de 80% de erro em lote de alunos.
- **Arquivo Afetado:** `__tests__/empiricalPsychometrics.test.ts:112` e `lib/psychometricsEngine.ts`.
- **Causa-Raiz Provável:** `(ii) Bug real`. Lógica de limiar invertida ou condição de sensibilidade estatística mal calibrada na função de desvio psicométrico.
- **Impacto no Produto:** Falso-negativo na sinalização analítica para o professor sobre questões de prova potencialmente defeituosas ou mal formuladas.
- **Por que NÃO corrigir agora:** Mexe no núcleo matemático dos algoritmos psicométricos pedagógicos (`IRT`/`BKT`). Esse módulo está completamente fora do escopo da Fase 0 (segurança/higiene) e sua recalibração exige alinhamento de requisitos pedagógicos.

---

### 1.2 `provenanceIntegrity.test.ts:126` — Contrato de Enum de Proveniência HTML
- **Descrição do Erro:** A asserção de round-trip de proveniência falhou ao esperar `'verified'`, mas o deserializador retornou o valor `'teacher_provided'`.
- **Arquivo Afetado:** `__tests__/provenanceIntegrity.test.ts:126` e `lib/reportGroundingValidator.ts`.
- **Causa-Raiz Provável:** `(ii) Bug real`. Mismatch no contrato de tipos ou serialização incompleta dos metadados de auditoria em relatórios pedagógicos exportados.
- **Impacto no Produto:** Relatórios e exportações de notas/observações perdem a marcação auditável de evidência estrita.
- **Por que NÃO corrigir agora:** A camada de integridade e evidência será integralmente reformulada com o novo runner determinístico e a arquitetura do SafeWriter nas fases subsequentes.

---

## 2. Falhas da Suíte do Sidecar (Python / Pytest)

### 2.1 `test_trio_optimizations.py:41` — Timing Jitter no Probe TCP
- **Descrição do Erro:** `test_cdp_health_closed_port_fails_fast` demorou 0.285s contra o teto rígido de asserção de 0.250s.
- **Arquivo Afetado:** `sidecar/tests/test_trio_optimizations.py:41`.
- **Causa-Raiz Provável:** `(i) Teste frágil`. Jitter de latência de socket TCP no ambiente Windows durante a checagem de portas fechadas sob carga concorrente de I/O.
- **Impacto no Produto:** Nenhum impacto em tempo de execução real.
- **Por que NÃO corrigir agora:** Ajustes cosméticos em limites de timeout de teste não agregam valor de segurança e violam o princípio de diffs cirúrgicos na Fase 0.

---

### 2.2 `test_side_panel_approval_card_e2e.py:98` — Acoplamento do Painel de Aprovação E2E
- **Descrição do Erro:** Timeout de 6000ms aguardando a renderização do elemento `#card-disambiguation` no DOM simulado do Chrome.
- **Arquivo Afetado:** `sidecar/tests/test_side_panel_approval_card_e2e.py:98`.
- **Causa-Raiz Provável:** `(i) Teste frágil`. O painel tenta efetuar chamada para `POST http://localhost:8765/natural_intent` que não estava ativa ou mockada no harness isolado do Playwright.
- **Impacto no Produto:** Em produção o card renderiza quando o sidecar está em execução na porta WebSocket/HTTP; falha apenas no teste de unidade isolado.
- **Por que NÃO corrigir agora:** O canal de comunicação entre a extensão e o backend será migrado de HTTP/WebSocket aberto para **Native Messaging**, tornando esse teste obsoleto em sua arquitetura atual.

---

### 2.3 `test_agentic_data_reading_e2e.py:83` — Divergência de Turnos ReAct em Horários
- **Descrição do Erro:** O agente ReAct excedeu a contagem esperada de turnos (`turns_count == 2`) ao tentar ler dados estruturados na tabela de horários escolares.
- **Arquivo Afetado:** `sidecar/tests/test_agentic_data_reading_e2e.py:83`.
- **Causa-Raiz Provável:** `(iii) Limitação de modelo/LLM`. Comportamento não-determinístico do LLM em nuvem, que adiciona turnos intermediários de raciocínio ou confirmação.
- **Impacto no Produto:** Latência excessiva, consumo de tokens desnecessário e risco de estourar o limite de turnos em conexões lentas.
- **Por que NÃO corrigir agora:** A arquitetura-alvo substitui o loop ReAct livre em produção pela execução determinística em milissegundos via grafo compilado (`SkillGraph`).

---

### 2.4 `test_agentic_data_reading_e2e.py:105` — Navegação Redundante em Leitura de Notas
- **Descrição do Erro:** O agente falhou em sintetizar os dados tabulares da tela sem antes disparar um comando indevido de sub-navegação.
- **Arquivo Afetado:** `sidecar/tests/test_agentic_data_reading_e2e.py:105`.
- **Causa-Raiz Provável:** `(iii) Limitação de modelo/LLM`. Falta de capacidade do LLM em correlacionar o DOM atual com a resposta suficiente antes de tentar explorar abas adicionais.
- **Impacto no Produto:** Cliques erráticos em portais reais que podem desorientar a navegação do professor.
- **Por que NÃO corrigir agora:** O papel de leitura de notas em produção será fixado por rotas mapeadas no `SkillGraph`, sem raciocínio generativo em tempo de execução.

---

### 2.5 `test_agentic_generalization_e2e.py:47` — Falha em Tarefa Sequencial de 3 Passos Inéditos
- **Descrição do Erro:** O agente falhou ao tentar executar a cadeia: `Arquivos` $\rightarrow$ `Filtro de Turma` $\rightarrow$ `Configurações`.
- **Arquivo Afetado:** `sidecar/tests/test_agentic_generalization_e2e.py:47`.
- **Causa-Raiz Provável:** `(iii) Limitação de modelo / (iv) Problema de design`. Falta de memória operacional estável entre transições de estado do DOM sem um grafo de âncoras.
- **Impacto no Produto:** Impossibilidade de o agente "adivinhar" fluxos complexos em portais desconhecidos de forma 100% autônoma às cegas.
- **Por que NÃO corrigir agora:** Requer a mudança conceitual para o modelo de gravação supervisionada (Professor demonstra uma vez $\rightarrow$ Grafo é gerado offline).

---

## 3. Limitações Estruturais do P2 (Exploração Autônoma com LLM)

### O que FUNCIONA
- **Portais convencionais (5/5 DEV em `eval_harness.py`):** Sucesso absoluto em tabelas HTML padrão, inversão de colunas, sinônimos regionais no vocabulário escolar, portais em inglês e células com `rowspan`/`colspan`.
- **Heurísticas básicas de proteção:** Detecção satisfatória de inputs duplicados (honeypots) e interpretação de cabeçalhos divididos em duas linhas.

### O que FALHA e por que o P2 não pode ser a base do mapeamento do zero
1. **Ausência de Indexação Visual Estável (Set-of-Marks):** O agente tenta identificar nós do DOM por seletores brutos ou texto puro. Sem sobreposição de marcadores numéricos únicos (como faz o Nanobrowser), cliques em botões com textos repetidos ("Ver", "Editar") frequentemente erram o alvo.
2. **Latência Incompatível com Navegação Interativa:** Cada chamada LLM multimodal adiciona 3 a 8 segundos. Um fluxo de 4 passos consome de 15 a 30 segundos, gerando desconexões e frustração para o usuário.
3. **Incompatibilidade com SLMs Locais (7B-8B):** Modelos compactos executados localmente (ex.: Llama 3 8B, Qwen 2.5 7B) falham sistematicamente na sintaxe JSON de tool calling requerida pelo loop ReAct.
4. **Cegueira Técnica em Componentes Modernos (40% de sucesso em HOLDOUT):** Falha grave em tabelas virtualizadas (`windowing`), iframes de origens cruzadas (`cross-origin`) e formulários com dependências complexas de validação.

### Diretriz Arquitetural Fixada
O mapeamento de novos portais migrará do modelo "agente explorador autônomo cego" para **"demonstração gravada + compilação assistida por LLM"** (Human-in-the-Loop na gravação via Chrome Extension).
