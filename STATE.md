# STATE.md — Estado Canônico e Registro de Decisões

Este documento consolida a governança, integridade de branches, histórico de SHAs, decisões de arquitetura e pendências do usuário para o desenvolvimento do Teacher AI.

---

## 1. Topologia de Branches e SHAs Canônicos

| Repositório / Worktree Local | Branch / Estado | Commit SHA | Descrição e Papel Canônico |
| :--- | :--- | :--- | :--- |
| `C:/Users/rafae/Documents/antigravity/hopeful-bell` | `main` | `13e77e2` | **Tronco Principal Unificado**. Contém o engine de provas v2 auditado (`4cd4007` via merge `5380dc0`), a etapa 0 de refatoração (`3f15e8a` via merge `6dfcdf5`), SafeWriter endurecido (TASK-002, 003a, 003b) e correções de portais (TASK-004 e TASK-005). |
| `C:/Users/rafae/Documents/antigravity/hopeful-bell-fix-engine` | `fix/engine-provas` | `4cd4007` | **Engine de Provas v2 (Integrado)**. 11 arquivos de teste, 58 testes aprovados, psicometria bayesiana, adaptação por turma e OMR. |

### Plano de Consolidação (Pendente de Aprovação)
1. Tronco único em `blissful-noether` (`main` em `3b41c07`).
2. Trazer a suíte M0 (`audit/eval/`, `EVAL_HASHES.txt`) e o hotfix `c377471` (`teacher-extension/attendancePolarity.js`) para a `main`.
3. Desmontar worktrees temporárias (`worktree-259c42d`, `worktree-before-hotfix`) após validação de integridade.
4. Sincronizar o repositório de trabalho com a `main` unificada.

---

## 2. Decisões Aprovadas

1. **Extensão Autônoma MV3**: Migração para extensão de Chrome pura para o professor (sem dependência de terminal, sem sidecar Python obrigatório, sem logs técnicos).
2. **SafeWriter**: O modelo de linguagem (LLM) apenas propõe; camadas determinísticas decidem. Gravação requer dupla validação de identidade (aluno↔coluna), verificação de visibilidade, filtragem de honeypots e confirmação em cartão antes de gravar.
3. **Resolução de Polaridade Estrita**: Detecção estrita de presença vs falta com recusa automática (*fail-closed*) em casos de dúvida ou ambiguidade. Módulo unificado oficial é `teacher-extension/attendancePolarity.js` (hotfix `c377471`).
4. **LGPD e Dois Trilhos de Privacidade**: Dados pessoais de alunos (nomes, notas, faltas, CPFs) nunca vão para APIs de nuvem. Processamento estritamente local no navegador. Ações estruturais de navegação podem utilizar LLM sem PII.
5. **Régua M0 Intocável**: Proibição estrita de alterar `audit/eval/` e `EVAL_HASHES.txt` sem aprovação expressa do usuário.

---

## 3. O Que NÃO Está Aprovado

1. **ADR-percepcao na versão original**: Rejeitada. Adoção preliminar de `buildDomTree` como substituto de leitura foi descartada por consumir tokens excessivos e carecer de associação relacional (célula↔cabeçalho).
2. **Ordem de Migração B1–B6 original**: Rejeitada. A ordem foi reestruturada para priorizar segurança, percepção com recusa e SafeWriter antes de automações e planos de aula.
3. **Uso de `chrome.debugger` / Puppeteer CDP**: Rejeitado para o fluxo padrão do professor. Evita o banner invasivo do Chromium e a fricção de permissão de alta criticidade na Chrome Web Store.
4. **Holdout Interno no Repositório**: Revogado. Não há conjunto held-out isolado dentro do repositório; testes held-out serão conduzidos exclusivamente pelo usuário em portais reais de produção.
5. **Escrita sem Validação Prévia de Identidade**: Proibida qualquer escrita sem amarração do nome do aluno e cabeçalho da coluna na linha ativa.

---

## 4. Pendências do Usuário

1. **Rotação de Chaves de API e Segredos**: Usuário deve executar rotação periódica de credenciais de LLM e chaves de provedores fora do repositório.
2. **Teste do Hotfix no App Real**: Usuário deve testar o módulo de polaridade de frequência (`attendancePolarity.js`) em portais de produção selecionados.
3. **Aprovação da Consolidação de Branches**: Aprovação formal para executar a fusão de `main` e `worktree-eval-m0`.
4. **Etapa 0 Concluída**: Portão determinístico (`scripts/gate.py`), worktree manager (`scripts/worktree.py`) e encadeamento criptográfico auditados e integrados na `main`.

---

## 5. Histórico de Execução de Tarefas do Piloto

| ID | Objetivo | Branch / Commit | Status no Gate | Hash de Auditoria |
| :--- | :--- | :--- | :---: | :--- |
| `TASK-001` | Unificação e teste do resolvedor de polaridade de frequência (`attendancePolarity.js`) contra os 11 casos canônicos | `task/TASK-001` (`75dde0e` -> merged) | **APROVADA** (11/11 PASS) | `7ba2501daba9...` (Index=11) |
| `TASK-001B` | Correções de rigor de polaridade (intenções fail-closed, normalização e 33 casos de teste) | `task/TASK-001B` (`466ccef` -> merged) | **APROVADA** (33/33 PASS) | `86dc62a4b881...` (Index=12) |
| `TASK-001C` | Reforço de negações (PT/EN), remoção de attendee (ajuste CASE_34), robustez de tipos, sinais extras (aria-label/title) e 52 casos | `task/TASK-001C` (`b0c3143` -> merged `b46632d`) | **APROVADA** (52/52 PASS) | `308732121b21...` (Index=15) |
| `TASK-001D` | Tratamento genérico de superseded_by, duplas negações fail-closed, sinais extras e palavras compostas (65 casos) | `task/TASK-001D` (`29da251` -> merged) | **APROVADA** (64 PASS, 1 SUPERSEDED) | `f9ff33b1834b...` (Index=16) |
| `DÍVIDA-001` | Fechamento de ressalvas (C1 a C7): fuzz Mulberry32 (500 iter, N=237), CASE_66 (66 casos), placar separado, docs ORCH_AUDIT_DIR e política de negações | `main` (`c0dd893` .. `7412d10`) | **SANEADA & VERIFICADA** | N/A (direto na main pós-merge) |
| `TASK-002` | SafeWriter: validação de visibilidade, detecção de honeypots e amarração relacional aluno↔linha no DOM | `task/TASK-002` (`398dce9` -> merged) | **APROVADA** (20/20 PASS) | `232c09c5a46f...` (Index=18) |
| `TASK-003a` | Endurecimento do SafeWriter: novas formas de ocultação (scale, clip-path, font-size, pointer-events, overlay, ancestrais, translate) e honeypots estruturais (17 casos) | `task/TASK-003a` (`5461dd5` -> merged) | **APROVADA** (17/17 PASS) | `49d042837da9...` (Index=20) |
| `TASK-003b` | Endurecimento do SafeWriter: amarração estrita por tokens, detecção de homônimos na tabela e nomes parciais (25 casos) | `task/TASK-003b` (`2fc06b8` -> merged) | **APROVADA** (25/25 PASS) | `59cc4eac573a...` (Index=21) |
| `TASK-004` | Correção de js_inspect (SyntaxError V8) em browser_use_agent e degradação segura fail-closed para regras regex em caso de PermissionError de PII em intent_parser | `task/TASK-004` (`b94e487` -> merged) | **APROVADA** (23/23 PASS) | `0744505f343a...` (Index=23) |
| `TASK-005` | Padronização de esclarecimento natural Point-and-Click em response_translator.py (invariância em ações de turma) | `task/TASK-005` (`cf66eb2` -> merged) | **APROVADA** (11/11 PASS) | `ff4d19f48e29...` (Index=24) |



