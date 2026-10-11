# Template de Relatório de Homologação de Portal (PORTAL_REPORT_TEMPLATE.md)

Utilize este modelo para documentar a validação de cada portal avaliado no ciclo completo da Fase 4.

---

## 1. Identificação Geral do Portal

- **Identificador de Teste:** `[P1 / P2 / P3]`
- **Tipo de Sistema Escolar:** `[Ex.: Diário Eletrônico Estadual / Gestão Escolar Privada / Sistema Acadêmico Universitário / Portal Sintético]`
  *(Nota de Segurança: Não informe URLs reais, domínios restritos nem dados institucionais sensíveis)*
- **Arquitetura Web Predominante:**
  - [ ] SPA Moderno (React, Vue, Angular, Next.js)
  - [ ] Sistema Tradicional / Legado (HTML server-side, recarregamento completo)
  - [ ] Arquitetura com Frames / Iframes
  - [ ] Tabela com janelamento virtual ou scroll infinito
- **A URL da barra de endereços muda ao trocar de turma/aula?** `[Sim / Não / Altera apenas query-param / Altera via hash / Não muda (estado puramente interno)]`

---

## 2. Matriz de Tarefas e Modos Testados

Marque os modos avaliados e informe o status do resultado:

| Tarefa Avaliada | Gravação | Compilação | Dry-Run | Rejeição de Checkpoint | Execução Real | Status Geral |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`read_roster`** (Ler Lista) | `[Sim/Não]` | `[Sim/Não]` | `[Passou/Falhou]` | `[N/A]` | `[Passou/Falhou]` | `[OK / FALHA]` |
| **`lancar_falta`** (Faltas) | `[Sim/Não]` | `[Sim/Não]` | `[Passou/Falhou]` | `[Zero Escrita: Sim/Não]` | `[Passou/Falhou]` | `[OK / FALHA]` |
| **`lancar_nota`** (Notas) | `[Sim/Não]` | `[Sim/Não]` | `[Passou/Falhou]` | `[Zero Escrita: Sim/Não]` | `[Passou/Falhou]` | `[OK / FALHA]` |

---

## 3. Avaliação de Segurança, Integridade e LGPD

- [ ] **Garantia de Não-Mutação em Checkpoint:** Ao clicar em *Cancelar* no modal de checkpoint, confirmou-se que nenhuma alteração foi gravada no portal.
- [ ] **Auditoria LGPD:** O arquivo de trace e o grafo JSON foram inspecionados com busca de texto e estão **100% livres de nomes reais de alunos, CPFs e dados pessoais**.
- [ ] **Desafios e Handoff:** Caso tenha ocorrido CAPTCHA, 2FA ou login expirado, o sistema pausou e aguardou intervenção humana sem falhar de forma destrutiva.

---

## 4. Ocorrência de Anomalias ou Falhas (se houver)

*(Se todas as etapas passaram sem intercorrências, deixe esta seção com "Nenhuma anomalia identificada")*

- **Nó / Etapa da Falha:** `[Ex.: n3 (WRITE), Localização de Âncora, Validação de Readback]`
- **Código de Erro:** `[Ex.: E_ANCHOR_NOT_FOUND, E_READBACK_MISMATCH, E_VALUE_OUT_OF_SCALE, etc.]`
- **Comportamento Observado no Portal:** `[Descreva brevemente o que ocorreu na página]`
- **Passos de Ajuda Humana Necessários:** `[Ex.: Foi necessário selecionar a coluna manualmente na tela de revisão]`

---

## 5. Veredito de Classificação de Suporte (Tier)

- **Classificação Obtida:** `[Tier 1 / Tier 2 / Tier 3]`
  - **Tier 1 (Pleno / Autônomo):** Gravou uma vez, compilou e executou sem intervenções adicionais.
  - **Tier 2 (Assistido / Guiado):** Exigiu assistência humana na revisão ou handoff para conclusão.
  - **Tier 3 (Restrito):** Somente leitura de roster ou exportação.
- **Justificativa Resumida:** `[Uma frase sintetizando o comportamento do portal]`
