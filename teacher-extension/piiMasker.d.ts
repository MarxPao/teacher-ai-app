export interface PiiMaskResult {
  maskedText: string
  unmask: (aiResponse: string) => string
  mapping: Record<string, string>
  reverseMapping: Record<string, string>
  piiDetectedCount: number
}

export interface MaskingSession {
  mapping: Record<string, string>
  reverseMapping: Record<string, string>
  studentCounter?: number
  phoneCounter?: number
  cpfCounter?: number
  emailCounter?: number
}

export class EgressSecurityError extends Error {
  violations: string[]
  constructor(message?: string, violations?: string[])
}

export class UnresolvedTokenError extends Error {
  token: string
  toolName: string
  constructor(message?: string, token?: string, toolName?: string)
}

export declare function maskPii(
  text: string,
  knownStudents?: Array<{ id?: string; name: string } | string>,
  session?: MaskingSession
): PiiMaskResult

export declare function unmaskPii(
  text: string,
  sessionOrMapping: Record<string, string> | MaskingSession
): string

export declare function unmaskToolUse<T = any>(
  toolUse: T[],
  session: MaskingSession
): T[]

export declare function structurallySanitizeElements<T = any>(
  elements: T[]
): T[]

export declare function maskChatHistory<T = any>(
  messages: T[],
  knownStudents?: Array<{ id?: string; name: string } | string>,
  session?: MaskingSession
): {
  maskedMessages: T[]
  session: MaskingSession
}

export declare function guardEgress(
  body: any,
  activeRoster?: Array<{ id?: string; name: string } | string>
): void

declare const _default: {
  maskPii: typeof maskPii
  unmaskPii: typeof unmaskPii
  unmaskToolUse: typeof unmaskToolUse
  structurallySanitizeElements: typeof structurallySanitizeElements
  maskChatHistory: typeof maskChatHistory
  guardEgress: typeof guardEgress
  EgressSecurityError: typeof EgressSecurityError
  UnresolvedTokenError: typeof UnresolvedTokenError
}

export default _default
