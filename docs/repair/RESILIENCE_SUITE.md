# Suíte de Resiliência e Auto-Reparo (Fase 5)

Este documento documenta o arcabouço de teste de resiliência, tolerância a drift e auto-reparo do Teacher AI.

---

## 1. Visão Geral e Princípios

O engine de execução baseia-se em determinismo estrito sem LLM. Quando a interface de um portal escolar sofre alterações (drift de layout, renomeação de rótulos, reorganização de colunas ou mutações de classes CSS), o motor precisa:
1. Detectar o drift na camada correta (`none`, `soft`, `hard`, `structural`, `semantic`).
2. Tentar soft heal em nós de leitura (`READ`, `LOCATE`, `WAIT`) se $\ge 0.85$ e margem $\ge 0.20$.
3. Em caso de nós de escrita (`TYPE`, `CLICK`, `SELECT`, `UPLOAD`, `SUBMIT`), interromper a execução segura (`SAFE_ABORT`), capturar snapshot higienizado (sem PII) e solicitar aprovação humana.
4. Jamais escrever em campo errado ou coluna invertida (**Tolerância Zero**: `WRONG_TARGET = 0`, `SILENT_WRONG_WRITE = 0`).
5. Iscas e armadilhas (ambiguidade, troca de polaridade, elemento removido, honeypot) devem produzir **100% `SAFE_ABORT`**.

---

## 2. Taxonomia de Mutações Suportadas

O injetor client-side (`tools/runner-harness/mutator.ts`) suporta os seguintes operadores de mutação estrutural:

| Tipo de Operador | Descrição | Drift Típico |
| :--- | :--- | :--- |
| `rename_text` | Altera o texto visível de um elemento (botão, link, label). | `semantic` |
| `swap_columns` | Inverte a posição física de duas colunas em uma tabela. | `structural` |
| `scramble_attributes` | Altera dinamicamente atributos como `class` ou `id` com prefixos aleatórios. | `soft` / `hard` |
| `wrap_container` | Envelopa um elemento alvo em contêineres adicionais (ex.: `div.responsive`). | `structural` |
| `change_tag` | Substitui a tag HTML (ex.: `button` -> `a[role="button"]`). | `soft` |
| `translate_header` | Traduz ou troca o rótulo de uma coluna. | `semantic` |
| `add_column` | Insere coluna intermediária deslocando índices numéricos. | `structural` |
| `remove_element` | Remove o elemento meta do DOM da página (armação para SAFE_ABORT). | `hard` / abort |
| `duplicate_hidden` | Duplica o elemento criando botões gêmeos ou honeypot invisível. | ambíguo / abort |
| `swap_column_semantics` | Troca de polaridade entre colunas de notas ou frequência. | polaridade / abort |

---

## 3. Conjunto DEV (12 Cenários)

Diretório: `conformance/repair/dev/`

1. `dev_btn_rename_simple`: Botão "Salvar" renomeado para "Gravar". Esperado: `CORRECT_REPAIR`.
2. `dev_btn_role_change`: Botão `button` substituído por `a[role="button"]`. Esperado: `CORRECT_REPAIR`.
3. `dev_col_header_synonym`: Cabeçalho "Faltas" renomeado para "Ausências". Esperado: `CORRECT_REPAIR`.
4. `dev_col_order_swap`: Inversão física das colunas "Matrícula" e "Nome". Esperado: `CORRECT_REPAIR`.
5. `dev_container_nesting`: Tabela envelopada por container responsivo `div.table-responsive`. Esperado: `CORRECT_REPAIR`.
6. `dev_class_hash_scramble`: Classes CSS substituídas por hashes de bundler (`tw-*`). Esperado: `CORRECT_REPAIR`.
7. `dev_input_id_scramble`: IDs estáticos de inputs substituídos por UUIDs aleatórios. Esperado: `CORRECT_REPAIR`.
8. `dev_col_header_english`: Cabeçalhos traduzidos para inglês ("Student Name"). Esperado: `CORRECT_REPAIR`.
9. `dev_add_extra_col`: Nova coluna "Turma" inserida antes da meta. Esperado: `CORRECT_REPAIR`.
10. `dev_input_type_change`: Input recebe classe e tipo especializado. Esperado: `CORRECT_REPAIR`.
11. `dev_row_tag_change`: Linhas de tabela envelopadas por container grid. Esperado: `CORRECT_REPAIR`.
12. `dev_sub_button_icon`: Botão recebe ícone decorativo com texto ("💾 Salvar Lançamento"). Esperado: `CORRECT_REPAIR`.

---

## 4. Conjunto HOLDOUT Travado (12 Cenários)

Diretório: `conformance/repair/holdout/`
Lockfile: `conformance/repair/holdout.lock` (13 arquivos com hash SHA-256 congelados).

> [!IMPORTANT]
> O conjunto HOLDOUT é travado e **nunca** é executado pelo agente durante o desenvolvimento. Sua execução é restrita aos gates formais com auditoria do proprietário.

### Cenários Curáveis (8 Cenários — Alvo $\ge 70\%$ `CORRECT_REPAIR`):
1. `holdout_save_btn_synonym`: Botão "Salvar" renomeado para "Confirmar Lançamento".
2. `holdout_col_presenca_synonym`: Coluna "Presença" renomeada para "Frequência Escolar".
3. `holdout_nota_input_placeholder`: Campo nota perde ID estático mantendo papel e atributo `name`.
4. `holdout_wizard_step_btn`: Botão "Avançar Etapa" renomeado para "Próximo Passo".
5. `holdout_download_btn_text`: Botão "Baixar Boletim CSV" alterado para "Exportar Planilha".
6. `holdout_two_row_header_drift`: Tabela ganha nova coluna bimestral alterando índices.
7. `holdout_infinite_scroll_container`: Container de rolagem ganha classe responsiva.
8. `holdout_pagination_btn_aria`: Botão "Próxima" atualizado com rótulo completo de paginação.

### Iscas / Armadilhas de Segurança (4 Cenários — Alvo 100% `SAFE_ABORT`):
9. `holdout_bait_twin_buttons`: Presença de dois botões gêmeos ("Salvar Alterações" e "Salvar como Rascunho"). O engine deve detectar ambiguidade e abortar sem chutar.
10. `holdout_bait_polarity_swap`: Colunas "Presenças" e "Faltas" invertem posição física mantendo cabeçalho oposto. Tolerância zero a troca de polaridade; deve abortar com `SAFE_ABORT`.
11. `holdout_bait_target_deleted`: Elemento meta completamente removido do DOM da página. Deve abortar com `SAFE_ABORT`.
12. `holdout_bait_hidden_honeypot`: Elemento fantasma invisível idêntico inserido antes do elemento alvo. O engine deve ignorar o invisível e abortar de forma segura.

---

## 5. Critérios de Avaliação e Limiares

- `CORRECT_REPAIR`: Proposta encontra com exatidão o elemento meta pretendido.
- `SAFE_ABORT`: Drift considerado irrecuperável ou ambíguo com interrupção controlada sem efeitos colaterais.
- `WRONG_TARGET`: Alvo incorreto selecionado (FALHA GRAVE - proibido).
- `SILENT_WRONG_WRITE`: Escrita em campo não intencional (FALHA CRÍTICA - proibido).
- **Critério de Aprovação:**
  - `WRONG_TARGET + SILENT_WRONG_WRITE = 0`
  - Iscas: `SAFE_ABORT = 4/4` (100%)
  - Curáveis: $\ge 6/8$ (75%) `CORRECT_REPAIR`
