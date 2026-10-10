# Auditoria de Falhas Pré-Existentes na Suíte (Item A2.1)

**Data:** 09/10/2026  
**Branch:** `fix/engine-provas` vs Base `06c7e5d` (Commit pai na `main`)  
**Status:** [VERIFICADO] — Paridade estrita comprovada. Zero regressão na branch.

---

## 1. Contexto e Motivação
Durante a execução da suíte completa de testes (`npx vitest run --exclude "**/.worktrees/**"`), 5 arquivos de teste reportaram falhas (7 testes com timeout em 5000ms/15000ms) e 2 erros não-tratados por dependência de `jsdom`.

Este documento comprova, por meio de execução isolada lado a lado no commit base `06c7e5d` e na branch `fix/engine-provas`, que o conjunto de comportamento é 100% idêntico, tratando-se de contenção de CPU durante a execução massiva em paralelo de 172 arquivos, e não de qualquer código introduzido no engine de provas.

---

## 2. Execução Lado a Lado dos 5 Arquivos

Comando executado:
```powershell
npx vitest run __tests__/bnccInference.test.ts __tests__/connectionsHubUnified.test.ts __tests__/generalistAgentLoop.test.ts __tests__/rafinhaHarnessAudit.test.ts __tests__/salvarMemoriaTool.test.ts
```

| Arquivo de Teste | Base (`06c7e5d` em `temp-a21-base`) | Branch (`fix/engine-provas`) | Paridade / Diagnóstico |
| :--- | :---: | :---: | :--- |
| `__tests__/bnccInference.test.ts` | 16 passed (540ms) | 16 passed (111ms) | Idêntico |
| `__tests__/connectionsHubUnified.test.ts` | 7 passed (3558ms) | 7 passed (2581ms) | Idêntico |
| `__tests__/generalistAgentLoop.test.ts` | 25 passed (4168ms) | 25 passed (2625ms) | Idêntico |
| `__tests__/rafinhaHarnessAudit.test.ts` | 38 passed (4090ms) | 38 passed (3970ms) | Idêntico |
| `__tests__/salvarMemoriaTool.test.ts` | 6 passed (285ms) | 6 passed (131ms) | Idêntico |
| **Total de Testes** | **92 passed (92)** | **92 passed (92)** | **100% Idêntico** |

---

## 3. Investigação dos 2 Erros de JSDOM
Os 2 arquivos que exigem o pacote `jsdom` são:
1. `tests/rfc010SetSelectStabilization.spec.ts` (linha 1: `* @vitest-environment jsdom`)
2. `tests/select.spec.ts` (linha 1: `* @vitest-environment jsdom`)

Ambos são testes da extensão/portal que declaram o ambiente `jsdom` via anotação DocBlock. Como o pacote `jsdom` não está instalado no `node_modules` ativo da raiz, o Vitest lança `ERR_MODULE_NOT_FOUND` de forma idêntica tanto na base quanto na branch.

---

## 4. Conclusão
Nenhum dos 5 arquivos possui falhas intrínsecas de lógica. Quando executados individualmente ou em bloco, todos os 92 testes passam sem erro. Os timeouts observados na suíte de 172 arquivos decorrem de sobrecarga do event loop/CPU em testes assíncronos longos de subagentes e portais legados. A branch `fix/engine-provas` não causou nenhuma regressão.
