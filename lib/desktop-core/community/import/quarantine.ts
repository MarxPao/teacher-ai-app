import type { TrustLevel } from './trust'

export type QuarantineState = 'quarantined' | 'activated' | 'revoked'

export interface ActivationCheckOptions {
  currentState: QuarantineState
  trustLevel: TrustLevel
  effectsConfirmed: boolean
  dryRunCompleted: boolean
  untrustedConfirmed?: boolean
}

export interface ActivationResult {
  allowed: boolean
  reason?: string
}

export function canActivate(options: ActivationCheckOptions): ActivationResult {
  if (options.currentState === 'revoked') {
    return {
      allowed: false,
      reason: 'Este mapa teve sua chave ou assinatura revogada no registro comunitário e não pode ser ativado.',
    }
  }

  if (!options.effectsConfirmed) {
    return {
      allowed: false,
      reason: 'O relatório de efeitos do mapa deve ser revisado e aceito pela professora.',
    }
  }

  if (!options.dryRunCompleted) {
    return {
      allowed: false,
      reason: 'Uma simulação prévia sem escrita (Dry-run) deve ser executada com sucesso no portal antes da ativação.',
    }
  }

  if (options.trustLevel === 'assinado_desconhecido' && !options.untrustedConfirmed) {
    return {
      allowed: false,
      reason: 'Mapas de autores desconhecidos exigem autorização explícita de risco antes da ativação.',
    }
  }

  return { allowed: true }
}
