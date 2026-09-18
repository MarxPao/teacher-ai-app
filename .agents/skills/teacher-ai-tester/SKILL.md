---
name: teacher-ai-tester
description: >-
  Execute and audit the Teacher AI test suite, run Playwright browser tests, verify intent parsing and extension message flows, enforce evidence rules, and prevent circular validations.
---

# Teacher AI — Test & Verification Runbook

This skill provides step-by-step instructions and command patterns for verifying, auditing, and executing tests across the Teacher AI repository.

## 1. Suíte de Testes Principal (Pytest vs Unittest)

### Invariante Crítica
- **Nunca utilize `python -m unittest discover` para medir a cobertura total da suíte.** O runner padrão do `unittest` descobre apenas 46 testes distribuídos em 5 arquivos com classes `unittest.TestCase`.
- **Use sempre `pytest`:** O repositório contém 40 arquivos de teste com 294 testes coletados (funções `def test_*`, testes assíncronos e fixtures).

### Comandos de Execução
- **Executar a suíte completa silenciosa:**
  ```powershell
  python -m pytest sidecar/tests -q
  ```
- **Executar testes específicos de NLU / Intent Parser:**
  ```powershell
  python -m pytest sidecar/tests/test_intent_and_translation.py -v
  python -m pytest sidecar/tests/test_semantic_nlu_resilience.py -v
  ```
- **Executar testes de Segurança, PII e Injeção de Prompt:**
  ```powershell
  python -m pytest sidecar/tests/test_pii_router.py -v
  python -m pytest sidecar/tests/test_prompt_injection_and_security.py -v
  ```
- **Executar testes de Navegação e State Machine:**
  ```powershell
  python -m pytest sidecar/tests/test_navigation_state_machine.py -v
  python -m pytest sidecar/tests/test_compound_navigation_e2e.py -v
  ```

## 2. Testes de Integração com Playwright (Google Chrome Real)

Para validar a Camada 2 no DOM real (como scroll exploratório, homônimos e botões dinâmicos):
- **Canal Chrome:** Os scripts de teste Playwright utilizam `channel="chrome"` para rodar no navegador Chrome instalado no Windows do usuário, dispensando downloads pesados de binários headless.
- **Execução do Teste de Cards / Alunos (Playwright):**
  ```powershell
  python scratch/test_alice_dom_playwright.py
  ```
- **Execução da Auditoria de Desambiguação vs Clique Direto:**
  ```powershell
  python scratch/test_alice_disambiguation_comparison.py
  ```

## 3. Testes Rápidos em Node.js (Extensão e Side Panel)

- **Simulação da Decomposição de Comandos Compostos:**
  ```powershell
  node scratch/test_alice_flow_simulation.js
  ```
- **Simulação do Fluxo de Sub-Navegação de Recados:**
  ```powershell
  node scratch/test_full_recados_flow.js
  ```

## 4. Regra de Evidência e Prevenção de Validação Circular

1. Ao criar scripts em `scratch/`:
   - Se o script carregar um mock estático com `page.set_content(html_content)`, **identifique isso explicitamente no log e no relatório**.
   - Nunca reporte "Validado contra o Machado Sobrinho" se o teste rodou contra um mock em memória.
2. Ao relatar resultados:
   - Cole o output literal do terminal (código de retorno, stdout completo, stderr).
   - Indique o arquivo, linhas alteradas e commit associado.
