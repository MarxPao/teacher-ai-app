---
id: TASK-005
titulo: Padronização de Esclarecimento Natural Point-and-Click em response_translator
criterio_de_aceite: python -m pytest -o pythonpath=sidecar sidecar/tests/test_live_learning_flow.py sidecar/tests/test_generic_item_discovery.py -q
files_allowed:
  - sidecar/response_translator.py
  - handoff/handoff-TASK-005.md
files_forbidden:
  - sidecar/agentic_execution_loop.py
  - scripts/gate.py
orcamento:
  max_minutos: 10
task_hash_locked: 3d27eefe03b200ff2e1707d4d5519aa5747582b4abd5c286b5a2fa24fb27e239
---

# TASK-005 — Padronização de Esclarecimento Point-and-Click (response_translator)

## Contexto
Na falha #22 da auditoria P0 (test_live_learning_flow.py), a função `translate_task_response`
em `sidecar/response_translator.py` concatenava indevidamente o nome individual do aluno
(`para {item_alvo}`) na mensagem pedagógica de solicitação de Point-and-Click (Camada 3):
`"Não encontrei onde lançar falta para Hugo nesta tela, você pode me mostrar clicando no lugar certo?"`.

O requisito de arquitetura da Camada 3 e o teste de integração canônico exigem a mensagem
invariante de tela e sem acoplamento de PII:
`"Não encontrei onde lançar falta nesta tela, você pode me mostrar clicando no lugar certo?"`.

## Escopo
1. Em `sidecar/response_translator.py` (bloco `status in ("discovery_failed", "orchestration_failed")`),
   remover o sufixo `item_str` / `para {item_alvo}` da mensagem de solicitação de point-and-click.
2. Garantir que a mensagem pedagógica resultante seja:
   `f"Não encontrei onde {verbo} {alvo} nesta tela, você pode me mostrar clicando no lugar certo?"`.
3. Preservar o status `"point_and_click_required"` e `action_required: "point_and_click"`.
4. Criar `handoff/handoff-TASK-005.md` documentando a alteração.
