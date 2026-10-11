# Inventário de Seletores Fixos Remanescentes (Legado v1)

Este documento cumpre a **Tarefa T2.12** da Fase 2, catalogando todos os seletores CSS, XPath e heurísticas fixas encontradas na base de código legada (`teacher-extension/` e `sidecar/`).

---

## 1. Contexto e Motivação

Historicamente, o sistema dependia de heurísticas DOM locais no `content.js` e grafos v1 com `css_selector` direto. Qualquer pequena alteração de layout por parte da mantenedora do portal educacional (ex.: mudança de classes CSS no Machado Sobrinho ou i-Educar) causava quebras silenciosas ou mutações incorretas.

Com o **SkillGraph v2** (contrato congelado em `skillgraph-v2.0-frozen` e runner implementado na Fase 2):
- Toda localização é declarativa através de âncoras multi-estratégia (`label_text`, `role_name`, `column_header`, etc.) e escopos de linha resilientes (`ResolvedRowScope`).
- Quando a flag `USE_SKILLGRAPH_V2` estiver ativa, **é estritamente proibido cair em seletores fixos**. A ausência de grafo resulta em recusa honesta (*"mapa não encontrado"*).

---

## 2. Inventário de Seletores e Classificação

| Arquivo e Linha | Seletor Fixo Identificado | Uso / Função Legada | Classificação |
| :--- | :--- | :--- | :---: |
| `teacher-extension/content.js:287` | `tr, div.student-row, div.grade-item, div.row, li` | Localização genérica de linhas de alunos para lançamento de notas | **(a) Coberto por grafo v2** (`over.kind: "table_rows"` com `scope.within`) |
| `teacher-extension/content.js:296` | `input[name*="nota"], input[id*="nota"], input[name*="grade"]` | Campo de digitação de nota escolar | **(a) Coberto por grafo v2** (nó `WRITE` com âncora `column_header: "Nota"` ou `label_text`) |
| `teacher-extension/content.js:313` | `tr, div.student-row, div.row, li` | Linhas de frequência / chamada | **(a) Coberto por grafo v2** (nó `LOOP` em `graphs/synthetic/lancar_falta.json`) |
| `teacher-extension/content.js:319` | `input[type="checkbox"]` | Checkbox de presença/falta sem verificação semântica de coluna | **(a) Coberto por grafo v2** (`AttendancePolarity` + âncora de coluna no v2) |
| `teacher-extension/content.js:358` | Seletores ad-hoc de botões de navegação | Varredura de abas e menus por classe | **(b) Precisa de grafo na Fase 3** (navegação entre módulos do portal) |
| `teacher-extension/content.js:444` | `#btnSalvar, button[type="submit"], .btn-gravar` | Disparo de submissão de formulário | **(a) Coberto por grafo v2** (nó `CLICK` com `is_submit_action: true`) |
| `teacher-extension/content.js:695` | `[data-teacher-ref="${ref}"], #${CSS.escape(ref)}` | Localização pós-gravação v1 por atributo customizado | **(c) Código morto a deletar** (substituído pelo `ElementHandleStore` do runner v2) |
| `sidecar/skills/machado_sobrinho__lancar_falta/v1.json` | `css_selector: "table tbody tr"` | Localização de grid no portal Machado Sobrinho | **(a) Coberto por grafo v2** (`graphs/synthetic/lancar_falta.json`) |
| `sidecar/skills/machado_sobrinho__lancar_falta/v1.json` | `css_selector: "button.btn-gravar"` | Botão de salvar chamada | **(a) Coberto por grafo v2** (nó `CLICK` âncora de texto "Gravar") |
| `sidecar/skills/generic__nav_recados/v1.json` | `css_selector: "a[href*='recados']"` | Acesso ao mural de recados da turma | **(b) Precisa de grafo na Fase 3** (compilação LLM via demonstração) |
| `sidecar/skills/generic__nav_historico_escolar/v1.json` | `css_selector: "div.tab-historico"` | Aba de histórico acadêmico | **(b) Precisa de grafo na Fase 3** (compilação LLM via demonstração) |

---

## 3. Classificação Resumida

1. **(a) Coberto por Grafo v2 (6 itens / 55%)**:
   - Os fluxos canônicos de leitura de lista de chamada (`read_roster`), lançamento de faltas com polaridade (`lancar_falta`) e lançamento de notas com read-back (`lancar_nota`) já possuem grafos sintéticos v2 completos executando pelo novo engine sem seletores fixos.
2. **(b) Precisa de Grafo a Compilar na Fase 3 (4 itens / 36%)**:
   - Telas secundárias (recados, histórico escolar, justificativas de atestados médicos). Na Fase 3, a professora demonstrará o clique nessas abas e o compilador LLM gerará o JSON SkillGraph v2 correspondente.
3. **(c) Código Morto a Deletar (1 item / 9%)**:
   - Heurísticas de injeção de atributo `data-teacher-ref` no DOM da página escolar. O `DomDriver` agora mantém handles locais em memória fraca (`WeakMap`), mantendo o DOM intocado e sem poluição.
