# Nota de Design da Fase 5: Resiliência, Detecção de Drift e Auto-Reparo Seguro (REPAIR_DESIGN.md)

**Versão:** 1.0 (Fase 5 - Fechamento do Engine)  
**Status:** Proposta de Arquitetura → Submetida ao GATE 0  

---

## 1. Taxonomia de Drift e Ações Determinísticas

Quando a interface de um portal escolar se altera após uma atualização, o SkillGraph v2 classifica a divergência em 4 categorias de *drift*, aplicando uma resposta estrita e previsível:

| Categoria de Drift | Condição de Detecção | Ação do Motor de Execução | Emissão de Evento | Impacto de Persistência |
| :--- | :--- | :--- | :---: | :--- |
| **`none`** | Candidato primário (índice 0) casou com exatamente 1 elemento. | Execução normal prossegue em milissegundos. | `drift` (`type: none`) | Nenhuma alteração. |
| **`soft`** | Candidato primário falhou, mas um candidato de fallback (índice > 0) casou. | Execução prossegue com o fallback. Alimenta métricas de saúde. | `drift` (`type: soft`, `candidateIndex`) | Sugestão de reordenação gerada para aprovação humana posterior. |
| **`hard`** | Todos os candidatos declarados falharam na resolução. | Se nó for de leitura (`READ`/`LOCATE`/`WAIT`), aciona Degrau 3. Se falhar ou for nó arriscado: **aborta imediatamente com zero escritas**. | `repair_requested` | Gera `DriftSnapshot` em sessão e proposta de reparo estruturado. |
| **`structural`** | `entry_fingerprint` ou `expect_fingerprint` divergiu (rota ou marcos ausentes). | **Aborta imediatamente.** Proibido tentar adivinhar a tela. | `run_failed` (`E_FINGERPRINT_MISMATCH`) | Não gera reparo automático de âncora; exige nova navegação. |
| **`semantic`** | O elemento foi encontrado, mas seu significado mudou (falha de readback ou pós-condição). | **Aborta imediatamente.** Aplica reversão se houve escrita prévia. | `run_failed` (`E_READBACK_MISMATCH` / `E_VALUE_OUT_OF_SCALE`) | Exige reconfirmação pedagógica humana na tela. |

### Eventos do Engine (Auditoria Zero-PII)
- `drift`: `{ type: 'drift', runId, nodeId, timestamp, data: { driftType: 'none' | 'soft' | 'hard', candidateIndex: number } }`
- `soft_heal`: `{ type: 'soft_heal', runId, nodeId, timestamp, data: { score: number, margin: number, candidateIndex: number } }`
- `repair_requested`: `{ type: 'repair_requested', runId, nodeId, timestamp, data: { reason: string, candidateIndex?: number, candidatesAttempted: number } }`

---

## 2. Escada de Âncoras Revisada e Limites de Segurança

A resolução de alvos no DOM obedece a uma escada hierárquica em 3 degraus:

```text
[Degrau 1: Candidato Primário] (índice 0: seletor de alta especificidade/ARIA)
              │
              ▼ (se falhar)
[Degrau 2: Candidatos de Fallback] (índices 1 a 5: rótulo, texto, classe estável)
              │
              ▼ (se todos falharem)
[Degrau 3: Matcher Semântico Local] (apenas nós seguros de leitura com alta confiança)
```

### Regra Estrita de Bloqueio por Tipo de Nó
1. **Nós onde o Degrau 3 é PERMITIDO (em execução):**  
   - `READ` (leitura de dados), `LOCATE` (localização de referência) e `WAIT` (espera de estabilização).
   - **Restrição Adicional:** Apenas se o elemento estiver **fora da chave de `RowScope`** (a identificação do aluno nunca pode ser adivinhada semanticamente).
2. **Nós onde o Degrau 3 é TERMINANTEMENTE PROIBIDO em execução:**  
   - `WRITE`, `UPLOAD`, `CLICK` com `is_submit_action: true`, `CHECKPOINT`, `allowed_hosts`, chaves de identificação de aluno e marcos de `Fingerprint`.
   - **Justificativa de Segurança:** Um falso positivo em nós de mutação causa persistência de dados errôneos no diário de classe. Se a âncora de um nó de escrita falhar, o motor aborta com zero escritas e gera uma proposta para aprovação humana.

---

## 3. Matcher Semântico Local e Determinístico (`lib/repair/semantic/`)

O matcher opera 100% desconectado, em TypeScript puro, sem LLM e sem embeddings pesados.

### 3.1. Sinais e Vetores de Similaridade
O cálculo de compatibilidade entre o descritor esperado da âncora e cada elemento candidato na página combina:
1. **Role / Tag Semântica (Peso: 0.20):** Compatibilidade de função (ex.: `button` com `button`, `input[type=text]` com `input`).
2. **Nome Acessível / ARIA Label (Peso: 0.25):** Igualdade exata ou normalizada de rótulos de acessibilidade.
3. **Texto Visível / Label Text (Peso: 0.30):** Similaridade léxica (Jaccard sobre n-gramas e tokens de palavras).
4. **Dicionário de Sinônimos Escolares (Peso: 0.15):** Mapeamento pt-BR/EN importado de `lib/compiler/synonyms.ts` (ex.: "Gravar" ↔ "Salvar", "Faltas" ↔ "Ausências", "Notas" ↔ "Avaliações").
5. **Proximidade e Estrutura (Peso: 0.10):** Posição hierárquica relativa a contêineres e formulários.

### 3.2. Limiares e Margens (`thresholds.ts`)
- **Proposta para Revisão Humana:**  
  $\text{Score} \ge 0.60$ e $\text{Margem sobre o 2º colocado} \ge 0.10$. Retorna até Top 3 alternativas.
- **Soft Heal em Execução (Degrau 3 em Nós de Leitura):**  
  $\text{Score} \ge 0.85$ e $\text{Margem sobre o 2º colocado} \ge 0.20$. Se houver dúvida ou dois elementos próximos, **recusa o match imediatamente**.
- **Regra de Ambiguidade:** Se $\text{Score}_1 - \text{Score}_2 < \text{Margem}$, o resultado é classificado como `E_REPAIR_AMBIGUOUS` (recusa segura).
- **Orçamento de Execução:** Avalia no máximo 500 elementos candidatos em $\le 300$ ms. Desempate estritamente determinístico pela ordem do documento no DOM.

---

## 4. `DriftSnapshot` e Blindagem de PII

Quando uma falha `hard` ocorre, o driver captura um instantâneo do DOM estrutural:

```typescript
export const DriftSnapshotSchema = z.object({
  snapshotId: z.string(),
  runId: z.string(),
  nodeId: z.string(),
  portalId: z.string(),
  taskId: z.string(),
  graphVersion: z.number().int(),
  capturedAt: z.number(),
  host: z.string(),
  path: z.string(),
  elements: z.array(ElementDescriptorSchema).max(500),
}).strict()
```

### Regras Estritas de Higiene LGPD:
- O snapshot contém **apenas**: tags, roles, classes estruturais, textos de botões, cabeçalhos de coluna e labels de formulário.
- **Nunca são gravados:** conteúdos de células de corpo de tabela (`tbody td`), valores digitados em inputs de notas ou nomes de alunos.
- `scrubSnapshot`: Passa todos os textos capturados pelo `PiiRegistry` da execução. Se qualquer padrão de aluno vazar, o snapshot é descartado com `E_REPAIR_PII_LEAK`.
- Vive exclusivamente em `chrome.storage.session` (teto de 2 MB; descartado ao fechar a janela).

---

## 5. Propostas de Reparo e Patches Imutáveis (`Patch`)

O reparo gera um objeto `Patch` cirúrgico contendo a substituição ou inserção de candidatos de âncora:

### Lista de Permissão Estrita de Ponteiros JSON:
- `/nodes/<nodeId>/anchor/candidates`
- `/nodes/<nodeId>/source/anchor/candidates`
- `/nodes/<nodeId>/target/candidates`
- `/nodes/<nodeId>/input/candidates`
- `/nodes/<nodeId>/trigger/candidates`
- `/nodes/<nodeId>/pagination/button/candidates`
- `/nodes/<nodeId>/over/table/candidates`
- `/anchor_library/<name>/candidates`
- `/canonical_mapping/<field>/portal_labels`

> [!CAUTION]
> **Proibição Absoluta:** O patch NUNCA pode alterar `safety`, `allowed_hosts`, nós de `CHECKPOINT`, a polaridade de faltas/presenças (`canonical_mapping.attendance`), a escala de notas (`grade_scale`) nem remover `forbidden_landmarks`. Violação emite `E_REPAIR_FORBIDDEN_PATCH`.

### Invariantes de Versionamento:
- O novo candidato gerado por `anchorCandidates.ts` é inserido no **índice 0**; os candidatos antigos são mantidos como fallbacks (máximo de 6 candidatos; o excedente mais antigo é descartado).
- O grafo resultante é validado por `validateGraph`.
- Nova versão: $\text{versão} = \max(\text{versões}) + 1$, `provenance.parent_version = versao_anterior`, `provenance.has_self_healed = true`. A versão anterior permanece intacta e pode ser reativada via `setActive`.
- Se a versão ativa tiver mudado entre o momento do snapshot e a aplicação do patch, a operação é rejeitada com `E_REPAIR_STALE`.

---

## 6. Fluxo de Homologação Humana e Interface (`RepairView`)

1. **Apresentação do Diagnóstico:**  
   Exibe o motivo da falha, o nó afetado e o elemento original versus o elemento novo sugerido.
2. **Destaque Visual ("Mostrar na Página"):**  
   Desenha um outline pulsante no elemento detectado dentro de um Shadow Root isolado do driver (`highlight`), sem poluir o DOM do portal.
3. **Dupla Confirmação e Reconfirmação Semântica:**  
   Se o nó for de escrita (`WRITE`, `UPLOAD` ou submit):
   - Exige clique em checkbox explícito: *"Entendo que este botão realiza alterações definitivas no portal."*
   - Reconfirmação de polaridade e escala: *"Confirmo que esta coluna continua representando [FALTA / NOTA]"* (**sempre desmarcada por padrão**).
4. **Verificação Obrigatória (Dry-Run):**  
   Antes de permitir salvar a nova versão, o runner executa o grafo remendado em dry-run na página viva. Se o dry-run falhar, o botão Salvar permanece bloqueado (`E_REPAIR_VERIFY_FAILED`).
5. **Reversão de Versão:**  
   O painel lista todas as versões imutáveis do mapa e permite reativar uma versão anterior a qualquer momento.

---

## 7. Saúde por Grafo (`GraphHealthStore`)

Métricas agregadas salvas em `chrome.storage.local` (apenas códigos, ids e contadores numéricos, zero mensagens livres ou dados pessoais):
- `runsCount`: total de execuções.
- `successCount`: execuções com sucesso.
- `softDriftCount`: contagem de execuções salvas por candidatos de fallback por nó.
- `consecutiveFailures`: falhas seguidas sem sucesso.
- `lastVerifiedAt` e `lastRepairedAt`.

### Status Derivado:
- 🟢 **Saudável (`saudavel`):** Taxa de sucesso $\ge 90\%$ e falhas consecutivas $< 2$.
- 🟡 **Degradado (`degradado`):** Falhas consecutivas $= 1$ ou recorrência de soft drift em fallbacks secundários. Exibe no painel: *"Mapa degradado: verifique se o portal mudou"*.
- 🔴 **Quebrado (`quebrado`):** Falhas consecutivas $\ge 2$ ou erro hard recente. Bloqueia execução direta até nova verificação/reparo.

---

## 8. Mutações DEV e HOLDOUT Travado (`conformance/repair/`)

O harness injeta mutações no DOM client-side via query param `?mut=<id>` em `tools/runner-harness/mutator.ts`:

### Classes de Resultado:
- `CORRECT_REPAIR`: O matcher propôs o elemento verdadeiro demarcado por `data-truth-target="true"`.
- `SAFE_ABORT`: O matcher detectou ambiguidade ou risco e abortou sem tocar no portal.
- `WRONG_TARGET`: O matcher escolheu um elemento incorreto (falha).
- `SILENT_WRONG_WRITE`: Escrita aplicada no elemento errado (**falha crítica inaceitável**).

### Metas Rígidas:
- `WRONG_TARGET + SILENT_WRONG_WRITE = 0` (tolerância zero a mutações erradas).
- Iscas (armadilhas): **100% `SAFE_ABORT`**.
- Casos curáveis do HOLDOUT: $\ge 70\%$ `CORRECT_REPAIR`.

### Lista das 12 Mutações DEV:
1. `dev_btn_rename_simple`: Botão "Salvar" renomeado para "Gravar".
2. `dev_btn_role_change`: Botão `button` substituído por `a[role=button]`.
3. `dev_col_header_synonym`: Cabeçalho "Faltas" renomeado para "Ausências".
4. `dev_col_order_swap`: Inversão da ordem física das colunas "Matrícula" e "Nome".
5. `dev_container_nesting`: Tabela envelopada por nova `div.table-responsive`.
6. `dev_class_hash_scramble`: Classes CSS substituídas por hashes dinâmicos gerados pelo Webpack/Tailwind.
7. `dev_input_id_scramble`: IDs estáticos de inputs substituídos por UUIDs aleatórios.
8. `dev_col_header_english`: Cabeçalhos traduzidos ("Student Name", "Grade").
9. `dev_add_extra_col`: Nova coluna "Turma" inserida no meio da tabela.
10. `dev_input_type_change`: Input `type="text"` alterado para `input[type="number"]`.
11. `dev_row_tag_change`: Linhas de tabela renderizadas com `div[role=row]`.
12. `dev_sub_button_icon`: Botão com texto substituído por ícone e `aria-label`.

### Lista das 12 Mutações HOLDOUT (Travadas com SHA-256):
- **Curáveis (8 cenários):**
  1. `holdout_save_btn_synonym`: Botão "Salvar" renomeado para "Confirmar Lançamento".
  2. `holdout_col_presenca_synonym`: Coluna "Presença" renomeada para "Frequência Escolar".
  3. `holdout_nota_input_placeholder`: Campo de nota perde ID/classe e mantém apenas placeholder "Ex: 8.5".
  4. `holdout_wizard_step_btn`: Botão "Avançar Etapa" renomeado para "Próximo Passo".
  5. `holdout_download_btn_text`: Botão "Baixar Boletim CSV" alterado para "Exportar Planilha".
  6. `holdout_two_row_header_drift`: Tabela ganha segunda linha de cabeçalho com agrupamento "1º Bimestre".
  7. `holdout_infinite_scroll_container`: Container de rolagem ganha nova classe e estilo flex.
  8. `holdout_pagination_btn_aria`: Botão "Próxima" perde texto e mantém apenas `aria-label="Ir para próxima página"`.
- **Iscas / Armadilhas de Segurança (4 cenários — Esperado 100% `SAFE_ABORT`):**
  9. `holdout_bait_twin_buttons`: Presença de dois botões irmãos idênticos ("Salvar Alterações" e "Salvar como Rascunho").
  10. `holdout_bait_polarity_swap`: Colunas "Presenças" e "Faltas" invertem de posição na tabela (armadilha de polaridade).
  11. `holdout_bait_target_deleted`: O botão ou input original foi completamente removido do DOM da página.
  12. `holdout_bait_hidden_honeypot`: Criação de um campo fantasma idêntico oculto (`display:none` / `opacity:0`) antes do campo real.

---

## 9. Novos Códigos de Erro do Runtime

- `E_REPAIR_NO_CANDIDATE`: Nenhum elemento atingiu a pontuação mínima de corte ($\ge 0.60$).
- `E_REPAIR_AMBIGUOUS`: Dois ou mais elementos atingiram pontuações próximas (margem $< 0.10$).
- `E_REPAIR_FORBIDDEN_PATCH`: Proposta tentou alterar propriedades restritas (`safety`, polaridade, escala).
- `E_REPAIR_VERIFY_FAILED`: O dry-run de verificação pós-patch falhou.
- `E_REPAIR_PII_LEAK`: O snapshot capturou dados de alunos não mascarados.
- `E_REPAIR_STALE`: A versão base do grafo foi alterada antes da aplicação da proposta.

---

## 10. Bloqueio de Contrato

- **Resultado:** **Vazio**. O contrato congelado `SkillGraph v2.0` (`docs/contracts/SKILLGRAPH_V2.md`) suporta perfeitamente versionamento imutável (`version`, `parent_version`, `has_self_healed`) e patch de candidatos de âncora sem nenhuma alteração no schema.

---

## 11. Estrutura de Arquivos da Fase 5

```text
lib/repair/
  ├── types.ts                  # Tipos do módulo de reparo e snapshot
  ├── driftClassify.ts          # Classificador none / soft / hard / structural / semantic
  ├── snapshot.ts               # Schema DriftSnapshot e scrub com PiiRegistry
  ├── propose.ts                # Gerador de propostas a partir do snapshot e descritores
  ├── patch.ts                  # Validador de permissão, applyPatch imutável e versionador
  ├── graphDiff.ts              # Utilitário de diff estrutural entre versões de grafo
  ├── health.ts                 # Reducer de métricas de saúde e status derivado
  └── semantic/
      ├── tokens.ts             # Normalização e tokenização de strings
      ├── similarity.ts         # Métricas de distância e similaridade léxica/Jaccard
      ├── signals.ts            # Extratores de sinais (role, tag, texto, atributos)
      ├── score.ts              # Função ponderada de pontuação
      ├── thresholds.ts         # Limiares e margens de corte estritos
      └── matcher.ts            # Implementação determinística de SemanticMatcher

lib/runner-dom/
  ├── elementDescriptor.ts      # Primitiva describeElements (sem PII)
  └── highlightOverlay.ts       # Overlay fechado para visualização do patch

tools/runner-harness/
  ├── mutator.ts                # Injetor client-side de mutações ?mut=<id>
  └── repairView.ts             # Interface de aprovação, dry-run e reversão

conformance/repair/
  ├── dev/*.json                # 12 cenários DEV
  ├── holdout/*.json            # 12 cenários HOLDOUT
  └── holdout.lock              # Hashes SHA-256 travados
```

---

## 12. Perguntas ao Proprietário para o GATE 0

1. **Limiares e Margens:** Aceita os limiares propostos de corte ($\ge 0.60$ para proposta com margem $\ge 0.10$; $\ge 0.85$ com margem $\ge 0.20$ para soft heal em leitura)?
2. **Soft Heal em Execução para Nós de Leitura:** Aprova a resolução automática em runtime exclusivamente para nós `READ`/`LOCATE` (sem tocar em escrita, sinalizado no trace e sem persistência em disco)?
3. **LLM no Reparo:** Confirmamos que a camada de LLM para auxílio no reparo permanece no **BACKLOG** para manter o engine 100% local, auditável e determinístico nesta fase?
4. **Perfil do Elemento Original:** Aprova manter no **BACKLOG** o armazenamento de perfis estendidos auxiliares, baseando o reparo estritamente no descritor de âncora do grafo v2.0?
5. **Histórico do Portal Real:** O portal escolar de produção do seu colégio já passou por alterações visuais ou de sistema no passado? Ocorreram mudanças de texto em botões, novas colunas no diário, ou troca de ordem de campos?
