/**
 * confirmationIntentParser.ts — Interpretador Resiliente de Intenções de Confirmação (STT & Texto)
 * 
 * Regra de Ouro (Zero-Accident / Zero-Punctuation Safety):
 * - Serviços de STT de voz reais frequentemente omitirão ou aplicarão pontuações incorretas.
 * - Qualquer frase que contenha "não" associada a "salvar/gravar/confirmar" (ex: "não pode salvar", "não, pode salvar")
 *   é INTRINSECAMENTE AMBÍGUA na fala sem pontuação e DEVE SEMPRE retornar 'ask_clarification'.
 * - NUNCA aprova por engano ('approve') e NUNCA aborta por engano ('abort') quando houver ambiguidade vocal.
 */

export type ConfirmationDecision = 'approve' | 'abort' | 'show_screenshot' | 'ask_clarification'

export interface ParsedConfirmation {
  decision: ConfirmationDecision
  confidence: 'high' | 'ambiguous'
  reason: string
  normalizedText: string
}

export function parseConfirmationIntent(rawText: string): ParsedConfirmation {
  const rawClean = rawText.trim()
  // Normaliza removendo acentos e convertendo para minúsculas
  const text = rawClean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  // Versão sem nenhuma pontuação para análise imune a vírgulas/pontos de STT
  const textNoPunct = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ').trim()

  // 1. Pedido de visualização do print / screenshot prévio
  if (/\b(mostr|mostra|mostre|print|screenshot|foto|imagem|ver antes|visualiz|deixa eu ver o print|manda o print)\b/.test(textNoPunct)) {
    return {
      decision: 'show_screenshot',
      confidence: 'high',
      reason: 'Professor solicitou prévia visual do formulário.',
      normalizedText: textNoPunct
    }
  }

  // 2. AMBIGUIDADE CRÍTICA DE FALA: "não pode salvar" vs "não, pode salvar"
  // Em transcrição de voz sem pontuação, "nao pode salvar" pode ser proibição OU aprovação após pausa.
  // Regra de Segurança Máxima: SEMPRE pedir esclarecimento, nunca assumir abort nem approve!
  if (/\bnao\b.*\b(pode salvar|pod salva|salvar|salva|gravar|grava|confirmar|confirma)\b/.test(textNoPunct)) {
    return {
      decision: 'ask_clarification',
      confidence: 'ambiguous',
      reason: "Ambiguidade crítica de voz: expressão contendo 'não' e ação de 'salvar' sem pontuação confiável de STT. Requer esclarecimento explícito.",
      normalizedText: textNoPunct
    }
  }

  // 3. Confirmação aparente fora de contexto: Ex: "sim, manda por email", "sim, crie a prova"
  if (/sim.*(manda por email|envia por whatsapp|crie a prova|gera exercicio|abre o modulo|fale mais|leia tudo)/.test(textNoPunct)) {
    return {
      decision: 'ask_clarification',
      confidence: 'ambiguous',
      reason: 'A confirmação refere-se a outra ação não relacionada à submissão do portal.',
      normalizedText: textNoPunct
    }
  }

  // 4. Cancelamentos e rejeições explícitas e inequívocas (sem termos de salvar)
  if (
    /\b(cancela|cancelar|aborta|abortar|rejeitar|esquece|deixa pra la|cancela tudo|parar|pare|abortar tarefa)\b/.test(textNoPunct) ||
    /^(nao|nao autorizo|nao quero)$/.test(textNoPunct)
  ) {
    return {
      decision: 'abort',
      confidence: 'high',
      reason: 'Comando inequívoco de cancelamento/rejeição detectado.',
      normalizedText: textNoPunct
    }
  }

  // 5. Confirmações afirmativas explícitas e inequívocas (incluindo variações fonéticas plausíveis de STT)
  const isExplicitApproval =
    /^(sim|simmm+|s|ss|confirma|confirmar|salvar|salva|gravar|autorizo|positivo|pode ir|ok)$/.test(textNoPunct) ||
    /^(sim\s+)?pode\s+(salvar|confirmar|gravar|enviar|fechar)$/.test(textNoPunct) ||
    /^(sim\s+)?pod\s+(salva|grava|confirma)$/.test(textNoPunct) || // Variação fonética comum em STT
    /^(ok\s+)?(pode salvar|pode confirmar|confirmo o lancamento|salvar agora)$/.test(textNoPunct) ||
    /^(pode salvar|pode confirmar|salva ai|salve ai|gravar agora)$/.test(textNoPunct)

  if (isExplicitApproval) {
    return {
      decision: 'approve',
      confidence: 'high',
      reason: 'Confirmação explícita de salvamento final reconhecida.',
      normalizedText: textNoPunct
    }
  }

  // 6. Default de Segurança Máxima (Zero-Accident / Fail-Safe)
  return {
    decision: 'ask_clarification',
    confidence: 'ambiguous',
    reason: 'Transcrição incerta, incompleta ou ambígua; exigindo confirmação explícita.',
    normalizedText: textNoPunct
  }
}
