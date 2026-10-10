# Handoff — TASK-005

## Contexto e Objetivo
Sanar a falha de lógica na função `translate_task_response` (`sidecar/response_translator.py`), onde o nome individual do aluno (`para {aluno}`) era concatenado na pergunta pedagógica de solicitação de Point-and-Click (Camada 3).

## Alterações Realizadas
1. `sidecar/response_translator.py`:
   - Diferenciada a composição de mensagem: ações de turma/grade escolar (`lancar_falta`, `lancar_nota`) referem-se à coluna ou pauta de frequência da tela como um todo e não acoplam nome de aluno individual (`item_str = ""`).
   - Ações direcionadas a itens/destinatários específicos (como `responder_recado`, `baixar_arquivo`) preservam o identificador do alvo (`item_str = f" para {item_alvo}"`).
   - Mensagem padronizada e coerente com os testes canônicos de live learning (`test_live_learning_flow.py`) e de descoberta genérica (`test_generic_item_discovery.py`).

## Verificação e Testes
- Suíte de aceite executada:
  `python -m pytest -o pythonpath=sidecar sidecar/tests/test_live_learning_flow.py sidecar/tests/test_generic_item_discovery.py -q`
- Resultado: 11 passed in 7.25s (100% verde).
