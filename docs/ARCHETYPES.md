# Matriz de Níveis de Suporte por Arquétipo Web (ARCHETYPES.md)

Este documento estabelece os níveis de suporte (**Tiers**) do motor **SkillGraph v2** para cada arquétipo de interface web educacional, acompanhados de suas evidências empíricas obtidas na Fase 4.

---

## 1. Definição Formal dos Níveis de Suporte (Tiers)

- **Tier 1 — Pleno / Autônomo:**  
  Gravação única sem necessidade de edição manual complexa. O motor compila, resolve âncoras sem LLM, executa dry-run e submissão real de forma puramente determinística.
- **Tier 2 — Assistido / Guiado:**  
  Exige confirmação ou apoio humano durante a gravação ou execução (ex.: conferência de polaridade de presença/falta na tela de revisão, preenchimento de CAPTCHA institucional via handoff, filtros que não alteram a URL).
- **Tier 3 — Restrito / Exportação:**  
  Restrito a operações de somente-leitura (`read_roster`) ou exportação de relatórios/planilhas, sem automação de escritas transacionais no portal.

---

## 2. Matriz Consolidada de Arquétipos × Tiers

| # | Arquétipo de Interface | Tier | Cenário de Evidência | Resultado Observado |
| :-: | :--- | :-: | :--- | :--- |
| **1** | Tabela Clássica (`<table>`, `<tr>`, `<td>`) | **Tier 1** | Fixture `standard.html` e HOLDOUT #1 | Resolução imediata de linhas e células por rótulo e cabeçalho. |
| **2** | Colunas Invertidas (Ordem Não-Padrão) | **Tier 1** | Fixture `columns_reversed.html` (DEV #2) | `locateRow` e `READ_TABLE` indexam dinamicamente por texto de cabeçalho. |
| **3** | Cabeçalho de 2 Linhas (`colspan`/`rowspan`) | **Tier 1** | Fixture `two_row_headers.html` (HOLDOUT #1) | Normalização desconsidera linhas de agrupamento superior e mapeia as folhas. |
| **4** | Células Mescladas / Linhas Agrupadas | **Tier 1** | Fixture `two_row_headers.html` | Extração de tabela e ancoragem estáveis. |
| **5** | Rodapé com Totais/Médias (`<tfoot>` / `Total`) | **Tier 1** | Fixture `footer_total.html` | Exclusão automática de linhas de total através de regex estrutural. |
| **6** | Grade / Divs simulando Tabela | **Tier 1** | Fixture `diario_grid.html` | Localização hierárquica por papéis ARIA e proximidade geométrica. |
| **7** | Shadow DOM | **Tier 2** | P1 SPA Moderno | Suportado se o shadow root for aberto (`mode: "open"`); isolamento fechado requer auxílio. |
| **8** | SPA com Render Tardio / Reativo | **Tier 1** | P1 SPA e `portal_com_abas.html` | Polling ativo com backoff exponencial aguarda a montagem dos elementos. |
| **9** | Paginação Simples por Botão ("Próxima") | **Tier 1** | Fixture `pagination.html` (DEV #3) | Nó `PAGINATE` avança páginas e detecta condição terminal de desabilitação. |
| **10** | Scroll Infinito (Lazy Loading de Linhas) | **Tier 1** | Fixture `infinite_scroll.html` (HOLDOUT #7) | Scroll progressivo no container até `end_condition` ou estabilização de altura. |
| **11** | Tabela Virtualizada (Janelamento DOM) | **Tier 1** | Fixture `virtualized.html` (HOLDOUT #3) | Ancoragem incremental por bloco visível sem perda de contexto de linha. |
| **12** | Iframe na Mesma Origem | **Tier 1** | P2 Portal Legado | Transposição transparente de frame context via `RemoteDriver`. |
| **13** | Iframe Cross-Origin (`localhost` vs `127.0.0.1`) | **Tier 1** | Fixture `cross_origin_iframe.html` (HOLDOUT #4) | Comunicação RPC assíncrona entre frames com permissão concedida. |
| **14** | Modal Bloqueante de Confirmação | **Tier 1** | Modal de Checkpoint em P1 e P2 | Pausa com isolamento total; cancelamento garante **zero mutações** no portal. |
| **15** | Formulário Estrito (Eventos `input`/`change`/`blur`) | **Tier 1** | Fixture `strict_form.html` (HOLDOUT #5) | Sequenciamento real de eventos do DOM e verificação de pós-condição sem erros. |
| **16** | Wizard Multi-Etapas (Fluxos Sequenciais) | **Tier 1** | Fixture `wizard.html` (HOLDOUT #6) | Validação de `fingerprint` por etapa; checkpoint posicionado antes do envio. |
| **17** | Download de Planilhas/Boletins | **Tier 1** | Fixture `download_upload.html` (HOLDOUT #8) | `chrome.downloads` observa conclusão, verifica host permitido e audita tamanho/MIME sem ler PII. |
| **18** | Upload de Arquivos / Comprovantes | **Tier 1** | Fixture `download_upload.html` (HOLDOUT #8) | Upload via `DataTransfer` em memória de sessão (teto 5 MB); bloqueado para hosts estranhos. |
| **19** | Desafio Humano (CAPTCHA / 2FA / Login) | **Tier 2** | Fixture `challenge_handoff.html` (HOLDOUT #9) | Emissão de badge `PAUSA`, pausa não-invasiva e espera do predicado `resume_when`. |
| **20** | Redirecionamento SSO (IdP Externo) | **Tier 1** | Fixture `sso_redirect.html` (HOLDOUT #10) | Validação rigorosa de cada domínio contra `allowed_hosts` e conferência de fingerprint no retorno. |
| **21** | Filtro sem alteração de URL (Dropdown interno) | **Tier 2** | Portal Real P3 | Emissão honesta de `E_UNSUPPORTED_PATTERN` para seleção prévia manual pela professora. |

---

## 3. Visualização do Tier no Painel da Professora

Para assegurar transparência e linguagem acolhedora sem jargões técnicos:

1. **Badge no Cabeçalho do Mapa:**
   - 🟢 **Tier 1:** *"Automação Completa — Executa de forma 100% autônoma."*
   - 🟡 **Tier 2:** *"Automação Assistida — Pode solicitar uma rápida confirmação sua na tela."*
   - 🔵 **Tier 3:** *"Somente Consulta — Lê as listas com segurança sem realizar alterações."*
2. **Revisão Pedagógica:**
   - Mapas classificados como Tier 2 destacam visualmente a etapa que necessita de intervenção (ex.: *"Por favor, selecione a turma antes de clicar em Executar"*).

---

## 4. Resiliência a Drift e Escada de Auto-Reparo (Fase 5)

Quando um portal atualiza sua interface (renomeação de botões, reorganização de colunas ou mutações de layout), o engine aplica a **Escada de Resolução de Âncoras**:

1. **Degrau 1 — Candidato Prioritário:** Seletor exato de maior especificidade (`role_name`, `label_text`, `test_id`).
2. **Degrau 2 — Candidatos de Fallback:** Alternativas declaradas no contrato do grafo (`aria_label`, `css`, `text`). Se localizado aqui, classifica como drift `soft`.
3. **Degrau 3 — Matcher Semântico Determinístico Local (Sem LLM):**
   - **Nós de Leitura (`READ`, `LOCATE`, `WAIT`):** Soft heal automático em runtime se $\text{score} \ge 0.85$ e $\text{margem} \ge 0.20$ (fora de chaves de aluno). Não persiste em disco; sinaliza `has_self_healed` no trace.
   - **Nós de Escrita (`WRITE`, `CLICK` de submissão, `UPLOAD`):** Soft heal **proibido**. O motor emite `repair_requested`, captura snapshot sem PII e entra em `SAFE_ABORT`.
   - **Aprovação Humana:** O professor ou auditor aprova com 1 clique no painel, gerando uma nova versão imutável (`version = max + 1`) com reversão instantânea via `setActive`.

