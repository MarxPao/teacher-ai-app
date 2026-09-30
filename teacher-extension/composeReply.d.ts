export type ReplyStatus = 'verified' | 'mismatch' | 'not_found' | 'ambiguous' | 'error' | 'partial'

export interface ReplyDetails {
  action?: string
  target?: string
  requested?: string
  read_back?: string
  message?: string
  error?: string
  completedSteps?: number
  totalSteps?: number
  maxTurns?: number
  candidates?: string[]
  navTarget?: string
  pendingAction?: string
  primaryAction?: string
}

export interface StepRecord {
  verified: boolean
  description?: string
  target?: string
}

export declare function composeReply(status: ReplyStatus, details?: ReplyDetails): string
export declare function composeMultiStepReply(steps: StepRecord[]): string

declare const _default: {
  composeReply: typeof composeReply
  composeMultiStepReply: typeof composeMultiStepReply
}

export default _default
