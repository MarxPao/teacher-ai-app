/**
 * lib/piiMasking.ts — Camada de Anonimização Automática Pré-LLM (Zero-PII Gateway)
 *
 * Alinhado à Decisão U6: Re-exporta e tipa o motor único UMD (teacher-extension/piiMasker.js)
 * Diretivas de Segurança & LGPD:
 * 1. Anonimiza nomes de alunos, números de matrícula/CPF, telefones e e-mails
 *    antes de despachar prompts para LLMs externas (Groq, Gemini, OpenAI).
 * 2. Defesa principal estrutural: elementos de tabela, input de nota/falta e cards
 *    de aluno são sensíveis por papel e nunca entram no prompt em nuvem.
 * 3. Função única guardEgress(body) garante que nenhuma requisição a provedores em nuvem
 *    transite com dados pessoais.
 * 4. 100% em conformidade com a LGPD (Art. 13 - Anonimização) e FERPA/COPPA.
 */

import {
  maskPii,
  unmaskPii,
  unmaskToolUse,
  structurallySanitizeElements,
  maskChatHistory,
  guardEgress,
  EgressSecurityError,
  UnresolvedTokenError,
  type PiiMaskResult,
  type MaskingSession
} from '../teacher-extension/piiMasker'

export {
  maskPii,
  unmaskPii,
  unmaskToolUse,
  structurallySanitizeElements,
  maskChatHistory,
  guardEgress,
  EgressSecurityError,
  UnresolvedTokenError
}
export type { PiiMaskResult, MaskingSession }

/**
 * Ponto ÚNICO de saída para despachar requisições a provedores de IA em nuvem.
 * Toda chamada HTTP obrigatoriamente é inspecionada por guardEgress antes de trafegar.
 */
export async function guardEgressFetch(
  url: string,
  init: RequestInit,
  activeRoster?: Array<{ id?: string; name: string } | string>
): Promise<Response> {
  const rawBody = init.body
  if (typeof rawBody === 'string') {
    try {
      const parsedBody = JSON.parse(rawBody)
      guardEgress(parsedBody, activeRoster)
    } catch (parseErr) {
      if (parseErr instanceof EgressSecurityError) {
        throw parseErr
      }
      guardEgress(rawBody, activeRoster)
    }
  } else if (rawBody) {
    guardEgress(rawBody, activeRoster)
  }

  return await fetch(url, init)
}
