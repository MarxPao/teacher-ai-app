# Relatório Final — Fase 1 (Contrato Congelado)

Este relatório consolida a especificação formal e os contratos de dados estabelecidos na **Fase 1**.
O objetivo central foi unificar os 5 formatos concorrentes de mapa em um único padrão declarativo (**SkillGraph v2**), definir o modelo canônico de dados escolares e estabelecer as interfaces abstratas de repositório, **sem alterar o fluxo de produção nem migrar chamadores existentes**.

---

## 1. Resumo Executivo (Máximo 10 Linhas)

A Fase 1 concluiu com êxito a especificação do **SkillGraph v2** (`spec_version: "2.0"`), expressando automações de portais escolares de forma 100% declarativa e sem código embutido. Foram criados o modelo de dados canônico (`canonical.ts`), os 4 módulos do schema (`primitives`, `anchors`, `nodes`, `graph`), o validador semântico estrito (`validate.ts`), o JSON Schema padronizado (`contracts/skillgraph-v2.schema.json`) e as interfaces assíncronas de repositório (`StudentRepository`, `SkillGraphRepository`, etc.). Todos os 8 cenários do teste de expressividade foram classificados como **EXPRESSÁVEL**. A suíte de contrato passou com 100% de sucesso (8/8 testes) e a verificação estática do TypeScript compilou com zero erros (`tsc` limpo).

---

## 2. Tabela de Status das Tarefas (T1.0 a T1.9)

| Tarefa | Módulo / Artefato | Commit | Status | Verificação Executada |
| :--- | :--- | :---: | :---: | :--- |
| **T1.0** | Pré-voo e criação da branch isolada `fase-1-contrato` | N/A | ✅ Concluído | `main` atualizada com Fase 0; branch criada. |
| **T1.1** | Reconhecimento e mapeamento v1 $\rightarrow$ v2 | `7a15b92` | ✅ Concluído | Criação de `docs/contracts/V1_TO_V2_MAPPING.md`. |
| **T1.2** | Modelo canônico escolar (`canonical.ts`) | `7c5697a` | ✅ Concluído | Zod estrito, tipos inferidos, enum `CanonicalField` e mapa `PII_FIELDS`. |
| **T1.3a** | Primitivas, ValueRef e Condições (`primitives.ts`) | `4da8c39` | ✅ Concluído | Vocabulário fechado (profundidade $\le 3$), `ValueRef` sem interpolação. |
| **T1.3b** | Âncoras, candidatos e escopos (`anchors.ts`) | `b8c2fe5` | ✅ Concluído | 1 a 6 candidatos em ordem, `RowScope`, `FrameRef` e sem XPath. |
| **T1.3c** | Nós semânticos do fluxo (`nodes.ts`) | `2c9a5b7` | ✅ Concluído | 12 tipos de nó, sentinelas estritas (`$end`, `$continue`, `$abort`), `read_back: true`. |
| **T1.3d** | Grafo raiz SkillGraph v2 (`graph.ts`, `index.ts`) | `425f9a9` | ✅ Concluído | Documento raiz Zod `.strict()`, limite de 200 nós; `tsc` verificado (código 0). |
| **T1.4** | Validador semântico estrito (`validate.ts`) | `fe7017c` | ✅ Concluído | DAG sem ciclos, PII check, trava de checkpoint; `tsc` verificado (código 0). |
| **T1.5** | JSON Schema v2 e especificação humana | `3ae2603` | ✅ Concluído | Geração via script `tsx`, spec em `docs/contracts/SKILLGRAPH_V2.md`. |
| **T1.6** | Exemplos realistas e teste de contrato | `8920806` | ✅ Concluído | Vitest `skillGraphV2.contract.test.ts`: 8/8 testes aprovados (1ª tentativa). |
| **T1.7** | Interfaces de repositório e adaptador localDB | `8aa4d54` | ✅ Concluído | Interfaces assíncronas + `REPOSITORIES.md`; `tsc` verificado (código 0). |
| **T1.8** | Marcação de formatos legados | `5c04257` | ✅ Concluído | Comentários de deprecação em 7 arquivos + `LEGACY_FORMATS.md`. |
| **T1.9** | Teste de expressividade e relatório final | *Este commit* | ✅ Concluído | 8/8 cenários validados, `tsc` verificado (código 0), diff conferido. |

---

## 3. Resultado do Teste de Expressividade

Todos os 8 arquétipos e cenários críticos de automação escolar foram submetidos ao contrato do **SkillGraph v2**:

| Caso | Arquétipo / Desafio Técnico | Veredito | Sequência de Nós Resumida |
| :---: | :--- | :---: | :--- |
| **1** | `CANONICAL_READ_ROSTER_GRAPH` (generalizado) | **EXPRESSÁVEL** | `NAVIGATE` $\rightarrow$ `WAIT(visible)` $\rightarrow$ `LOCATE(mode: direct)` $\rightarrow$ `READ(kind: table, into: roster)` com `canonical_mapping` $\rightarrow$ `$end`. |
| **2** | `EXECUTE_SAFE_WRITE` (com polaridade) | **EXPRESSÁVEL** | `NAVIGATE` $\rightarrow$ `CHECKPOINT` $\rightarrow$ `WRITE(method: set_checked, read_back: true)` no `RowScope` da linha do aluno com polaridade `checked_is_absent` $\rightarrow$ `CLICK(is_submit: true)` $\rightarrow$ `$end`. |
| **3** | Tabela Virtualizada (Windowing) | **EXPRESSÁVEL** | `NAVIGATE` $\rightarrow$ `LOCATE(mode: scroll_until_found)` rolando incrementalmente o container virtual até o elemento existir no DOM $\rightarrow$ `WRITE/READ` $\rightarrow$ `$end`. |
| **4** | Iframe Cross-Origin | **EXPRESSÁVEL** | `NAVIGATE` $\rightarrow$ `allowed_hosts` contendo o host do iframe $\rightarrow$ âncoras com `scope.frame: { match: "url_pattern", value: "host_do_frame" }` resolvidas pelo runner $\rightarrow$ `READ` $\rightarrow$ `$end`. |
| **5** | Wizard de Várias Etapas | **EXPRESSÁVEL** | `CLICK(aba 1)` $\rightarrow$ `WRITE(turma)` $\rightarrow$ `CLICK(avançar)` $\rightarrow$ `WAIT(etapa 2)` $\rightarrow$ `CHECKPOINT(lote)` $\rightarrow$ `CLICK(gravar final, is_submit: true)` $\rightarrow$ `$end`. |
| **6** | Login com SSO, CAPTCHA ou 2FA | **EXPRESSÁVEL** | `NAVIGATE` $\rightarrow$ `BRANCH(detecta desafio)` $\rightarrow$ `HANDOFF_HUMAN(reason: sso/captcha, resume_when: painel_visivel, timeout: 180s)` $\rightarrow$ continua o fluxo do grafo. |
| **7** | Download de PDF (Boletim) | **EXPRESSÁVEL** | `NAVIGATE` $\rightarrow$ `DOWNLOAD(trigger: botao_pdf, expect: { mime_hint: "application/pdf" }, into: "caminho_boletim")` $\rightarrow$ `$end`. |
| **8** | Scroll Infinito | **EXPRESSÁVEL** | Raiz: `pagination: { type: "infinite_scroll", max_pages: 50, end_condition: texto_fim }` $\rightarrow$ `LOCATE(mode: scroll_until_found)` $\rightarrow$ `READ(paginate: true)` $\rightarrow$ `$end`. |

---

## 4. Desvios da Especificação

- **Nenhum desvio identificado:** Todas as diretrizes P1 a P9, limitações de profundidade de condição, vocabulário fechado, schemas `.strict()` e regras de ciclo foram implementadas sem concessões.
- **Recursividade Tipada:** Para acomodar tipos autorreferenciados no TypeScript sem violar a regra de tipos circulares (`TS2456`), os nós recursivos (`Anchor`, `AnchorOrRef`, `RowScope`, `Condition`) foram tipados com `interface` explícita e schemas Zod resolvidos via `z.lazy()`.

---

## 5. Decisões Pendentes

1. **Consumo do Contrato pela Extensão Chrome MV3 (JavaScript Puro):**
   - *Opção A (Recomendada):* Utilizar uma etapa de build leve (ex.: esbuild/rollup) que emita um bundle único `skillgraph-runner.bundle.js` contendo o validador e interpretador com tipos seguros.
   - *Opção B:* Carregar o JSON Schema gerado (`contracts/skillgraph-v2.schema.json`) diretamente na extensão utilizando um validador leve em runtime (ex.: `Ajv` compilado para standalone).
   - *Decisão:* A ser travada pelo proprietário do projeto antes da implementação do runner na Fase 2.

---

## 6. Observações Fora de Escopo

Durante o reconhecimento e implementação dos contratos da Fase 1, foram confirmados os seguintes pontos pertencentes a fases futuras:
- O interpretador procedural existente em `teacher-extension/content.js` e `sidecar/navigation_state_machine.py` ainda contém perfis hardcoded (Machado Sobrinho) que serão removidos apenas quando o novo runner assumir a execução.
- O adaptador `LocalStorageStudentRepository` emite `NotImplementedError` para portabilidade e exclusão LGPD, aguardando o banco SQLite local (Fase 6).

---

## 7. Registro de Comandos Executados e Resultados

- **Testes Vitest:**
  - `npx vitest run __tests__/skillGraphV2.contract.test.ts` (1ª e única execução): **8 testes aprovados, 0 falhas** (duração: 2.95s).
  - *Total de execuções de teste:* **1** (teto máximo permitido: 2).
- **TypeScript Compiler (`tsc`):**
  - T1.3: 2 execuções (1ª ajustou tipagem de recursão; 2ª passou com código 0).
  - T1.4: 2 execuções (1ª corrigiu import duplicado; 2ª passou com código 0).
  - T1.7: 1 execução (passou com código 0).
  - T1.9: 1 execução (passou com código 0).
  - *Total de execuções de `tsc`:* **6** (teto máximo permitido: 8).

---

## 8. Checklist de Congelamento (Aguardando Assinatura do Proprietário)

> **ATENÇÃO:** O contrato NÃO está declarado como congelado automaticamente. Esta checklist deve ser preenchida e assinada pelo dono do projeto antes de prosseguir para a Fase 2.

- [ ] Li `docs/contracts/SKILLGRAPH_V2.md` e os 3 exemplos em `contracts/examples/`.
- [ ] Todo tipo de nó é necessário, e nenhum está faltando para os 8 casos de expressividade.
- [ ] Os itens `PARCIAL` ou `NÃO` foram resolvidos ou aceitos conscientemente (todos foram `EXPRESSÁVEL`).
- [ ] O JSON Schema gerado está commitado e o teste de contrato passa na minha máquina.
- [ ] Decidi como a extensão consome o contrato (Opção A ou B da Seção 5).
- [ ] Fiz merge em `main` e criei a tag `skillgraph-v2.0-frozen`.
