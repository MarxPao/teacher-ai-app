# Guia da Suíte de Conformidade e Proteção do HOLDOUT

Este documento define a governança, estrutura e protocolo de execução da **Suíte de Conformidade por Arquétipos** do Teacher AI.

---

## 1. Dois Conjuntos de Avaliação: DEV vs. HOLDOUT

A generalização do pipeline (gravar → compilar → rodar sem LLM) é avaliada através de dois conjuntos rigorosamente separados:

1. **Conjunto DEV:**
   - Cenários de desenvolvimento e regressão (fixtures em `tools/runner-harness/fixtures/` e `tools/runner-harness/fixtures/archetypes/`).
   - Podem ser executados e iterados pelo desenvolvedor e pelo agente durante a evolução de capacidades.
2. **Conjunto HOLDOUT (Reservado):**
   - Composto por **10 cenários críticos** que cobrem as maiores variações estruturais da web educacional:
     1. `two_row_headers`: Cabeçalhos de tabela multinível (`colspan`/`rowspan`).
     2. `hidden_duplicate_inputs`: Presença de honeypots e campos mobile ocultos.
     3. `virtualized`: Tabela virtualizada com janelamento de DOM sob scroll.
     4. `cross_origin_iframe`: Iframe hospedado em origem cruzada autorizada (`localhost` dentro de `127.0.0.1`).
     5. `strict_form`: Formulário reativo com validação estrita de eventos (`input`, `change`, `blur`).
     6. `wizard`: Formulário assistente multi-etapas.
     7. `infinite_scroll`: Lista dinâmica com carga incremental por viewport.
     8. `download_upload`: Disparo de download de planilha e upload de anexo.
     9. `challenge_handoff`: Desafio interativo que exige pausa e intervenção humana (`HANDOFF_HUMAN`).
     10. `sso_redirect`: Login externo com redirecionamento de domínio e retorno seguro.

---

## 2. Proteção Criptográfica do HOLDOUT (`conformance/holdout.lock`)

Para assegurar medição honesta e impedir sobreajuste (*overfitting*) do runner aos testes:
- Todas as fixtures e grafos do HOLDOUT foram escritos à mão, derivados puramente da especificação e da nota de design.
- O arquivo `conformance/holdout.lock` armazena os hashes SHA-256 de cada um dos 22 arquivos integrantes do conjunto.
- **Regra Rígida Inviolável:** O agente de IA está terminantemente proibido de executar o conjunto HOLDOUT. Qualquer alteração nos arquivos travados invalida o lockfile e é sinalizada em vermelho na UI.
- A execução do HOLDOUT é prerrogativa **exclusiva do proprietário/auditor humano** durante os gates de validação.

---

## 3. Servidor de Teste com Duas Origens Locais

O harness Node nativo (`scripts/serve-harness.ts`) escuta em `0.0.0.0:8898`:
```powershell
npm run harness
```
Isso permite que a extensão acerte tanto `http://127.0.0.1:8898` quanto `http://localhost:8898`. Como o navegador trata ambos os hostnames como origens web distintas, testes de iframe cross-origin e redirecionamento SSO operam em condições reais de isolamento de cookies e storage, sem depender de conexão de internet ou proxies externos.

---

## 4. Execução da Suíte na Extensão

1. **Abertura do Painel:**
   - Com a extensão carregada no Chrome (`teacher-extension`), abra o painel lateral e selecione a aba **Suíte**.
2. **Executar DEV:**
   - Clique em **Rodar DEV** para validar as rotinas de regressão. O painel abre as fixtures em background, executa os grafos via `RemoteDriver` e apresenta badges verdes/vermelhos com tempo de execução e contadores auditados (`LLM: 0`, `Rede do Runner: 0`).
3. **Executar HOLDOUT (Apenas o Dono):**
   - Clique em **Rodar HOLDOUT**. O runner valida o hash em `holdout.lock`, executa os 10 cenários e exibe o placar (Meta: $\ge 8/10$).
   - O botão **Baixar resultado (JSON)** exporta o laudo com logs detalhados para auditoria.
