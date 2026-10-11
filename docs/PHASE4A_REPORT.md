# Relatório da Fase 4 - Parte A: Generalização por Arquétipos e Suíte de Conformidade

**Data:** 11/10/2026  
**Branch:** `fase-4-arquetipos`  
**Status:** Parte A Concluída com Sucesso → Aguardando Validação do GATE A

---

## 1. Resumo Executivo e Commits da Parte A

A Parte A estendeu o motor determinístico SkillGraph v2 para suportar arquétipos complexos da web educacional, travou o conjunto de conformidade HOLDOUT e incorporou a **Aba Suíte** diretamente no Side Panel da extensão Chrome MV3.

| Tarefa | Commit | Descrição da Entrega |
| :--- | :---: | :--- |
| **T4.0** | *(leitura)* | Pré-voo, checagem da tag `skillgraph-v2.0-frozen` e planejamento das tarefas. |
| **T4.1** | `7b256a3` | `docs/runner/ARCHETYPES_DESIGN.md`: Matriz de 20 arquétipos, definição de Tiers 1/2/3, desenho de DOWNLOAD/UPLOAD, SSO, wizard e handoff humano. Aprovado no GATE 0. |
| **T4.2** | `2de3c6a` | Servidor Node multi-host (`127.0.0.1` e `localhost`), 10 fixtures e 10 grafos HOLDOUT travados via SHA-256 em `conformance/holdout.lock` (22 arquivos), fixtures DEV e `docs/runner/CONFORMANCE.md`. |
| **T4.3** | *(dispensada)* | Nó `FILTER`: Adiado como Tier 2 conforme decisão do dono no Gate 0 (sem alteração do contrato v2.0). |
| **T4.4** | `4c35100` | Capacidades do engine: nós DOWNLOAD/UPLOAD, timeout e polling para `HANDOFF_HUMAN`, conferência de hosts permitidos e fingerprint em SSO/wizard, marcação `partialWrites: true` em abort, 8 testes novos em `graphRunner.core.test.ts` (20/20 passando). |
| **T4.5** | `3cb6e71` | Drivers e MV3: RPC para download e upload de sessão no `DomDriver` e `RemoteDriver`, badges `PAUSA`, modelo de permissões dinâmicas por portal (`permissions.ts`) e remoção de `<all_urls>` permanente de `host_permissions`. |
| **T4.6** | *(dispensada)* | Gravação em lote: Registrada no `docs/BACKLOG.md` para fases futuras conforme deliberação do Gate 0. |
| **T4.7** | *atual* | Interface da Aba "Suíte" no Side Panel (`suiteView.js`, `side_panel.html`), conferência SHA-256 em runtime do `holdout.lock`, contadores `LLM: 0` e `Rede do runner: 0`, e exportação de laudo JSON. |

---

## 2. Modelo de Permissões e Segurança MV3

1. **Host Permissions Restritas:**
   - `<all_urls>` permanente foi removido do `host_permissions` de produção.
   - Declarados apenas hosts de teste locais (`http://localhost:8898/*` e `http://127.0.0.1:8898/*`).
   - `optional_host_permissions: ["*://*/*"]`: Solicitação sob demanda orientada por clique do professor apenas para os domínios declarados no `allowed_hosts` do mapa.
2. **Permissão de Download:**
   - Declarada em `optional_permissions: ["downloads"]`. O runner nunca abre nem lê o conteúdo dos arquivos baixados; apenas inspeciona nome, tipo MIME e tamanho para auditoria e preserva integridade de dados locais.
3. **Ponte de Upload:**
   - Upload restrito a arquivos em memória de sessão fornecidos pelo professor (teto de 5 MB, validação de host permitida e proibição de leitura de disco não assistida).
4. **Desafios Humanos (`HANDOFF_HUMAN`):**
   - Nenhuma automação de CAPTCHA ou tentativa de bypass de 2FA. Emissão de badge visual `PAUSA` no ícone da extensão e espera pedagógica da resolução pelo professor.

---

## 3. Comandos Executados e Evidência de Qualidade

- **Testes Unitários do Runner (`__tests__/graphRunner.core.test.ts`):**  
  20 testes aprovados (8 novos para download, upload, SSO, wizard, timeout de handoff, pós-condição estrita e scroll infinito).
- **Compilação de Bundles (`npm run build:ext`):**  
  Sucesso com esbuild (gerados `dist/runner.bundle.js` e `dist/content-adapter.bundle.js`).
- **Verificação Estrita de Tipagem (`npx tsc --noEmit`):**  
  Código de saída 0, zero erros de tipo em todo o workspace.
- **Proteção Criptográfica do HOLDOUT:**  
  22 arquivos travados em `conformance/holdout.lock`. Zero execuções do HOLDOUT realizadas pelo agente (preservando fidelidade ao teste cego).

---

## 4. Desvios Aprovados em Relação ao Plano Original

1. **FILTER em Tier 2:** Mantido o comportamento determinístico que emite `E_UNSUPPORTED_PATTERN` para filtros que não alteram a URL, postergando o nó `FILTER` para a Fase 5/6 sem violar o congelamento do contrato `2.0`.
2. **Gravação em Lote no Backlog:** A interface de revisão da extensão permanece focada no fluxo unitário da Fase 3; a síntese de lotes foi documentada em `docs/BACKLOG.md`.

---

## 5. Checklist do GATE A (Instruções Manuais para o Dono ~40 min)

1. **Iniciar Servidor Local do Harness:**
   ```powershell
   npm run harness
   ```
   *Certifique-se de que o servidor está ouvindo em `http://127.0.0.1:8898` e `http://localhost:8898`.*
2. **Recarregar a Extensão no Chrome:**
   - Acesse `chrome://extensions/`.
   - Clique no botão de atualizar (ícone de recarregar) da extensão `TeacherAI - Assistente Agêntico`.
3. **Abrir o Side Panel e Ativar o v2:**
   - Abra qualquer aba e clique no ícone da extensão para exibir o Side Panel.
   - No card **SkillGraph v2**, marque o checkbox **Ativar v2**.
   - Alterne para a sub-aba **Suíte**.
4. **Executar Conjunto DEV:**
   - Clique em **Rodar DEV**.
   - Verifique que as abas de fixture abrem e fecham em background e a tabela é preenchida com badges verdes.
5. **Executar Conjunto HOLDOUT (Avaliação Cega):**
   - Clique em **Rodar HOLDOUT**.
   - Observe a verificação prévia de `conformance/holdout.lock` (deve exibir banner verde de integridade 22/22).
   - Acompanhe a execução dos 10 cenários.
   - **Critério de Aceite:** $\ge 8$ de 10 cenários aprovados.
6. **Validar Casos Críticos:**
   - *Download:* Arquivo salvo na pasta Downloads; log registra apenas metadados.
   - *Desafio Humano:* Extensão exibe badge `PAUSA` e aguarda a ação na tela sem tentar contornar o desafio.
   - *SSO:* Grafo aborta com `E_HOST_NOT_ALLOWED` se um host externo não constar em `allowed_hosts`.
7. **Baixar Laudo JSON:**
   - Clique no botão **Baixar JSON** e anote os cenários e tempos reportados.
8. **Finalização:**
   - Retorne ao chat com o resumo dos resultados e confirme com `"APROVADO GATE A"`.
