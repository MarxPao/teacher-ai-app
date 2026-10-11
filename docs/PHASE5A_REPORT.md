# Relatório da Fase 5A (Resiliência, Reparo e GATE A)

**Data:** 11 de outubro de 2026  
**Branch:** `fase-5-resiliencia`  
**Estado:** Concluído até o GATE A (Pronto para Auditoria do Dono)

---

## 1. Resumo Executivo (TL;DR)

1. **Núcleo de Reparo e Semântica Determinística:** Implementado 100% puro e sem LLM sob `lib/repair/` e `lib/repair/semantic/`.
2. **Ganchos do Engine:** Invocação do Degrau 3 restrita a nós de leitura (`READ`, `LOCATE`, `WAIT`), emissão de eventos `drift`, suporte a `soft_heal` em runtime e `repair_requested` para nós de escrita com `SAFE_ABORT`.
3. **Primitivas do DomDriver:** `describeElements`, `highlight` e `clearHighlight` implementadas em `lib/runner-dom/`.
4. **Harness de Resiliência:** Aba 'Resiliência' integrada em `tools/runner-harness/repairView.ts`, com injeção de mutações, inspeção de snapshot (sem PII), visualização de propostas, dry-run e aprovação imutável.
5. **Testes de Fronteira:** 15/15 testes passando em `__tests__/repair.core.test.ts`.
6. **HOLDOUT Travado:** 12 cenários em `conformance/repair/holdout/` congelados com SHA-256 em `conformance/repair/holdout.lock` (zero execuções pelo agente).

---

## 2. Destaques de Implementação

### 2.1. Taxonomia de Drift e Matcher Semântico
- **Camadas:** `none`, `soft`, `hard`, `structural`, `semantic`.
- **Limiares Aprovados no GATE 0:**
  - Proposta: Score $\ge 0.60$ com Margem $\ge 0.10$ (Top 3 candidatos).
  - Soft Heal em Leitura: Score $\ge 0.85$ com Margem $\ge 0.20$.
- **Semântica:** Tokenização léxica, distância Levenshtein, Jaccard de tokens e dicionário determinístico de sinônimos de ações escolares (salvar/gravar/confirmar, presença/frequência, falta/ausência, nota/conceito).

### 2.2. Segurança e LGPD
- **Zero Vazamento de PII:** `createDriftSnapshot` higieniza strings com `PiiRegistry`.
- **Bloqueio de Nós de Escrita:** Nós `WRITE`, `CLICK` (com `is_submit_action`) e `UPLOAD` **nunca** realizam soft-heal autônomo. Emitem `repair_requested` e entram em `SAFE_ABORT`.
- **Imutabilidade Estrita:** `applyPatch` nunca altera grafos in-place; gera nova versão (`version = base + 1`), registra `parent_version` e `has_self_healed: true`.

---

## 3. Evidência de Testes e Compilação

### 3.1. Tipagem TypeScript (`tsc --noEmit`)
- Código de saída: `0` (Zero erros em todo o workspace).

### 3.2. Teste de Fronteira (`__tests__/repair.core.test.ts`)
```text
 ✓ __tests__/repair.core.test.ts (15 tests) 221ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

1. Normalização léxica e remoção de acentos/stopwords: `PASS`
2. Similaridade Jaccard e textual com sinônimos: `PASS`
3. Extratores de sinais estruturais e semânticos: `PASS`
4. Pontuação ponderada de elementos: `PASS`
5. Penalidade severa para elementos ocultos/honeypot: `PASS`
6. Detecção honesta de ambiguidade ($\text{margem} < 0.10$): `PASS`
7. Seleção de melhor candidato único: `PASS`
8. Construção de candidatos de âncora canônicos: `PASS`
9. Snapshot higienizado com PiiRegistry (zero vazamento): `PASS`
10. Geração de proposta a partir de snapshot: `PASS`
11. Aplicação imutável de patch com bump de versão: `PASS`
12. Bloqueio de patch ilegal (`E_REPAIR_FORBIDDEN_PATCH`): `PASS`
13. Rejeição de versão base defasada (`E_REPAIR_STALE`): `PASS`
14. Diff estrutural auditável entre versões: `PASS`
15. Reducer de métricas de saúde (`healthy`, `degraded`, `broken`): `PASS`

---

## 4. Estado do Conjunto HOLDOUT

- **Diretório:** `conformance/repair/holdout/`
- **Lockfile:** `conformance/repair/holdout.lock` (13 arquivos rastreados com SHA-256).
- **Execuções pelo Agente:** **ZERO** (em estrito cumprimento da regra anti-espiral do projeto).
- **Composição:** 8 cenários curáveis e 4 iscas obrigatórias (`holdout_bait_twin_buttons`, `holdout_bait_polarity_swap`, `holdout_bait_target_deleted`, `holdout_bait_hidden_honeypot`).

---

## 5. Roteiro de Auditoria do GATE A (Para o Dono)

O proprietário pode auditar o funcionamento do sistema no navegador ou via harness:

1. **Iniciar o Harness:**
   ```powershell
   npm run harness:build
   npm run harness
   ```
   Acesse: `http://localhost:8898`
2. **Auditar a Aba Resiliência:**
   - Clique na aba **"Resiliência (Auto-Reparo)"** no cabeçalho.
   - Selecione um cenário DEV (ex: `dev_btn_rename_simple`).
   - Clique em **"Injetar Mutação"** (observar mutação no iframe).
   - Clique em **"Capturar Snapshot & Gerar Proposta"** (verificar pontuação e snapshot sem PII).
   - Clique em **"Highlight Alvo"** (verificar destaque visual verde sobre o botão).
   - Clique em **"Dry-Run do Patch"** (verificar validação em memória).
   - Clique em **"Aprovar Patch"** (verificar persistência de nova versão imutável).
   - Clique em **"Reverter Versão"** (verificar restauração segura).
3. **Auditar o Conjunto HOLDOUT (Execução Exclusiva do Dono):**
   - O dono pode selecionar os cenários de `holdout_*` no harness e validar que as 4 iscas resultam em `SAFE_ABORT` e que os curáveis alcançam $\ge 70\%$ de aprovação.
