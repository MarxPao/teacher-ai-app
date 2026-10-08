# STATE.md — Estado Canônico e Registro de Decisões

Este documento consolida a governança, integridade de branches, histórico de SHAs, decisões de arquitetura e pendências do usuário para o desenvolvimento do Teacher AI.

---

## 1. Topologia de Branches e SHAs Canônicos

| Repositório / Worktree Local | Branch / Estado | Commit SHA | Descrição e Papel Canônico |
| :--- | :--- | :--- | :--- |
| `C:/Users/rafae/Documents/antigravity/blissful-noether` | `main` | `3b41c07` | **Tronco Canônico de Produto**. Contém o merge de `d1ccd60`, a correção RFC-010 (`2598a1e`) e telas de turmas e escolas. |
| `C:/Users/rafae/Documents/antigravity/worktree-eval-m0` | `eval/m0-reliable-evaluation` | `0e61ecc` | **Tronco Canônico da Régua M0**. Contém `EVAL_HASHES.txt`, 72 portais (`audit/eval/specs/dev`), `generator.py`, `run.py`, fixtures `unit/html` e o hotfix `c377471` (`teacher-extension/attendancePolarity.js`). |
| `C:/Users/rafae/Documents/antigravity/hopeful-bell` | `feat-turmas-perfil-aluno` | `d1ccd60` | Workspace ativo do agente (já integrado na `main` de `blissful-noether` via commit `845d9aa`). |
| `C:/Users/rafae/Documents/antigravity/worktree-259c42d` | detached HEAD | `259c42d` | Marco intermediário do harness M0 com casca SPA única. |
| `C:/Users/rafae/Documents/antigravity/worktree-before-hotfix` | detached HEAD | `74f066f` | Estado imediatamente anterior ao hotfix de polaridade de frequência. |

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
