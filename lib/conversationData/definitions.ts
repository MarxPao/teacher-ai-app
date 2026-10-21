/**
 * lib/conversationData/definitions.ts
 *
 * Constantes nomeadas de definições pedagógicas de eventos conversacionais.
 * Cada definição traz explicitamente o marcador [DEFINIÇÃO A VALIDAR (dono)].
 */

export const DEFINITION_PERGUNTA =
  'Enunciado interrogativo emitido em sala de aula ou reunião que solicita esclarecimento, síntese, checagem ou reflexão, identificado por entonação/ponto de interrogação ou pronomes interrogativos (o que, quem, qual, como, onde, por que, quando, quanto). [DEFINIÇÃO A VALIDAR (dono)]'

export const DEFINITION_PERGUNTA_ABERTA =
  'Pergunta aberta: Enunciado que demanda elaboração conceitual, justificativa, síntese ou explicação causal, não podendo ser respondida satisfatoriamente com apenas "sim", "não" ou uma única palavra. [DEFINIÇÃO A VALIDAR (dono)]'

export const DEFINITION_PERGUNTA_FECHADA =
  'Pergunta fechada: Enunciado convergente ou de checagem factual que admite resposta binária (sim/não) ou escolha restrita direta sem necessidade de argumentação causal. [DEFINIÇÃO A VALIDAR (dono)]'

export const DEFINITION_INTERVENCAO =
  'Turno de fala emitido por qualquer participante que adiciona conteúdo, comentário, questionamento ou resposta à discussão em andamento. [DEFINIÇÃO A VALIDAR (dono)]'

export const DEFINITION_WAIT_TIME =
  'Métrica de espera pós-pergunta (Wait-Time I de Mary Budd Rowe): intervalo temporal mensurado entre o encerramento da pergunta formulada pelo docente e o início da manifestação subsequente. Reporta o total de perguntas, quantidade com espera mensurada, média e mediana globais sobre todas as perguntas, e separadamente a contagem de pausas reflexivas deliberadas (espera >= 3.0s). [DEFINIÇÃO A VALIDAR (dono)]'

export const DEFINITION_MONOLOGO =
  'Trecho ininterrupto de fala contínua de um mesmo participante sem alternância de turno com duração igual ou superior a 30 segundos (30.000 ms). [DEFINIÇÃO A VALIDAR (dono)]'

export const DEFINITION_DUVIDA_SEM_RESPOSTA =
  'Pergunta formulada por aluno que não foi sucedida por turno explicativo, validação ou resposta pedagógica por parte do professor ou grupo nos turnos imediatamente subsequentes. [DEFINIÇÃO A VALIDAR (dono)]'
