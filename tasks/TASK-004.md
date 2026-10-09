---
id: "TASK-004"
objetivo: "Correção de bugs de lógica no engine de portais: remoção de erro de sintaxe em js_inspect do BrowserUseAgent e fallback determinístico offline no IntentParser (Cluster C)"
criterio_de_aceite: "python -m pytest sidecar/tests/test_intent_and_translation.py sidecar/tests/test_sequential_selects_and_disabled_button.py -q"
files_allowed:
  - "sidecar/browser_use_agent.py"
  - "sidecar/intent_parser.py"
  - "handoff/handoff-TASK-004.md"
files_forbidden:
  - "audit/**"
  - "audit/eval/**"
  - "EVAL_HASHES.txt"
  - ".env*"
  - "scripts/gate.py"
  - "STATE.md"
depende_de:
  - "TASK-003b"
modelo_sugerido: "barato"
orcamento:
  max_tokens: 30000
  max_tentativas: 2
  max_minutos: 10
estado: "a_fazer"
responsavel: "executor-sidecar"
task_hash_locked: "8db4ef710bf6869fbf1d4b42fcb6dd118774e2e6df9fba054814c6e6cbd768e4"
---

# Tarefa: TASK-004 — Correção de Bugs de Lógica no Engine de Portais (Cluster C)

## 1. Objetivo
Corrigir os bugs de lógica identificados na triagem P0 do engine de portais no `sidecar/`:
1. `sidecar/browser_use_agent.py`: remover o erro de sintaxe JavaScript (`Unexpected token '}'` causado por 3 chaves extras em `js_inspect`), que impedia a avaliação do DOM pelo Playwright e forçava a falha "Nenhum frame acessível no DOM." em todos os testes de descoberta semântica e botões desabilitados.
2. `sidecar/intent_parser.py`: assegurar que o bloqueio F1b capture `PermissionError` em tentativas de chamadas cloud para comandos que contêm termos sensíveis sem aluno identificado ("marca falta", "lança nota 9.0"), caindo no fallback offline determinístico via regex (`_parse_with_regex_rules`), preservando a privacidade e gerando a pergunta de esclarecimento necessária sem adivinhar o aluno.

## 2. Requisitos de Implementação

### 2.1. Correção no BrowserUseAgent (`sidecar/browser_use_agent.py`)
- Remover as 3 chaves de fechamento redundantes em `js_inspect` (linhas 1044-1046) que encerravam a função antecipadamente e quebravam a execução no V8 do Chromium.
- Garantir que `_inspect_semantic_dom` execute `js_inspect` perfeitamente em qualquer frame da página sem lançar `SyntaxError`.

### 2.2. Correção no IntentParser (`sidecar/intent_parser.py`)
- Envolver as chamadas `_call_groq_llm` e `_call_gemini_llm` em blocos `try ... except PermissionError: res = None`, de modo que quando o bloqueio de segurança F1b for ativado, a função não aborte com exceção não tratada, mas sim degrade de forma segura (fail-closed) para o parser determinístico offline (`_parse_with_regex_rules`).

## 3. Critério de Aceite
Os testes de intenção e de botões desabilitados/filtros sequenciais devem passar 100%:
```bash
python -m pytest sidecar/tests/test_intent_and_translation.py sidecar/tests/test_sequential_selects_and_disabled_button.py -q
```
