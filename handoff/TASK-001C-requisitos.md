# Requisitos Mapeados — TASK-001C

Documento gerado em conformidade com a skill `fidelidade-ao-pedido`.

## Mapeamento de Requisitos

| ID | Descrição do Requisito | Restrições & Critérios |
| :--- | :--- | :--- |
| **R1** | Nova task TASK-001C seguindo fluxo estrito de governança | Spec + teste travado no commit base ANTES de criar worktree, execução em worktree isolada, gate determinístico, merge na `main`, atualização do `STATE.md`. |
| **R2** | Imutabilidade dos 33 casos existentes | Proibido editar os casos 1 a 33 em `audit/polarity_test_cases.json`. Apenas ADICIONAR a partir de `CASE_34`. |
| **R3** | Não iniciar TASK-002 | Encerrar esta rodada estritamente após a conclusão e merge da TASK-001C. Não avançar para TASK-002. |
| **R4** | Salvaguardas do Portão | Proibido usar `--no-verify`, desabilitar o gate ou aumentar limite de diff. |
| **R5** | Resolução estrita de Negações | Tratar negações explícitas (PT e EN). Casos obrigatórios: "Não faltou", "Sem falta", "Não compareceu", "Nao presente", "Not absent", "Not present", "No absence". Política fail-closed: se a negação não for inequívoca, retornar `canResolve=false, polarity='AMBIGUOUS'`. Documentar na spec. |
| **R6** | Investigação e Ajuste de 'Attendee' | Investigar causa de CASE_32 resolver como POSITIVE. Remover 'attendee' do léxico de presença. Ajustar CASE_32 em nova entrada (CASE_34) sem editar CASE_32 no JSON; registrar e justificar mudança de comportamento. |
| **R7** | Tratamento Robusto de Tipos de Entrada | Tratar `undefined`, `object`, `array`, `number` em intenção (`INVALID_INTENT`), cabeçalho e rótulo (`AMBIGUOUS`), retornando `canResolve=false` sem lançar exceção. |
| **R8** | Documentação de Políticas Implícitas na Spec | Documentar na spec: rótulo prevalece sobre cabeçalho ambíguo (CASE_23), termos genéricos ("Status") = sem sinal (AMBIGUOUS), conflito direto = recusa (CONFLICT). |
| **R9** | Suporte a `aria-label` / `title` como Sinais Extras | `resolveAttendancePolarity` aceita sinais extras (ex: atributos de acessibilidade), aplicando as mesmas regras de concordância e conflito. |
| **R10** | Formato de Entrega e Evidências | Relatório final com output literal RAW dos testes e do gate, diff categorizado (código, testes, handoff), risco residual e tokens como "NÃO VERIFICADO", parada sem iniciar TASK-002. |
