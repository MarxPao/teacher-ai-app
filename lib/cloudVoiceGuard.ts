/**
 * lib/cloudVoiceGuard.ts
 *
 * Módulo de Segurança e Governança de Voz em Nuvem (Modo Teste)
 *
 * REQUISITOS VINCULANTES:
 * 1. Flag "cloudVoiceTest" DESLIGADA por padrão. Habilitada apenas via configuração local.
 * 2. Bloqueia qualquer envio de voz para nuvem se contiver nomes do roster ativo,
 *    ou se o roster ativo não for estritamente o canário.
 * 3. spokenText(display, roster) substitui nomes nominais por "o aluno"/"a aluna",
 *    garantindo que o sintetizador de voz NUNCA receba dados de menores.
 */

export class CloudVoiceSecurityError extends Error {
  public readonly code = 'CLOUD_VOICE_EGRESS_BLOCKED'
  public readonly violations: string[]

  constructor(message: string, violations: string[] = []) {
    super(message)
    this.name = 'CloudVoiceSecurityError'
    this.violations = violations
  }
}

/**
 * Roster canário homologado para testes de voz e avaliação.
 */
export const CANARY_STUDENT_NAMES = [
  'Bernardo Silva',
  'Carolina Souza',
  'Daniel Oliveira',
  'Eduardo Lima',
  'Gabriel Santos',
  'Helena Castro',
  'Juliana Costa',
  'Lucas Pereira',
  'Mariana Lima',
  'Pedro Santos',
] as const

const CANARY_NAMES_SET = new Set(
  CANARY_STUDENT_NAMES.flatMap(name => {
    const parts = name.toLowerCase().split(/\s+/)
    return [name.toLowerCase(), parts[0]]
  })
)

// Estado da flag em memória (DESLIGADA POR PADRÃO)
let _cloudVoiceTestEnabled = false

/**
 * Consulta se o modo de teste de voz em nuvem está ativado.
 */
export function isCloudVoiceTestEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('teacher_cloud_voice_test')
      return stored === 'true' && _cloudVoiceTestEnabled
    } catch {
      return _cloudVoiceTestEnabled
    }
  }
  return _cloudVoiceTestEnabled
}

/**
 * Alterna a flag de teste de voz em nuvem (somente por ação explícita local).
 */
export function setCloudVoiceTestEnabled(enabled: boolean): void {
  _cloudVoiceTestEnabled = Boolean(enabled)
  if (typeof window !== 'undefined') {
    try {
      if (enabled) {
        localStorage.setItem('teacher_cloud_voice_test', 'true')
      } else {
        localStorage.removeItem('teacher_cloud_voice_test')
      }
    } catch {}
  }
}

/**
 * Verifica se um roster é 100% canário (dados fictícios autorizados).
 */
export function isCanaryRoster(roster: Array<{ name: string } | string>): boolean {
  if (!roster || roster.length === 0) return true
  return roster.every(item => {
    const rawName = typeof item === 'string' ? item : item.name
    if (!rawName) return true
    const clean = rawName.trim().toLowerCase()
    return CANARY_NAMES_SET.has(clean) || CANARY_STUDENT_NAMES.some(c => c.toLowerCase() === clean)
  })
}

/**
 * Extrai a lista de nomes a serem protegidos a partir do roster ativo.
 */
function extractNamesList(roster?: Array<{ name: string } | string>): string[] {
  if (!roster || !Array.isArray(roster)) return []
  const set = new Set<string>()
  for (const item of roster) {
    const name = typeof item === 'string' ? item.trim() : (item.name || '').trim()
    if (name.length >= 3) {
      set.add(name)
      const first = name.split(/\s+/)[0]
      if (first.length >= 3) set.add(first)
    }
  }
  return Array.from(set).sort((a, b) => b.length - a.length)
}

/**
 * Deriva o texto a ser falado (spokenText) a partir do texto exibido em tela.
 * Substitui os nomes dos alunos por referências genéricas ("o aluno" / "a aluna").
 * A tela exibe o nome real/canário para a professora; o motor de voz NUNCA recebe o nome.
 */
export function spokenText(
  displayText: string,
  roster?: Array<{ name: string; gender?: 'm' | 'f' } | string>
): string {
  if (!displayText || typeof displayText !== 'string') return ''

  let text = displayText
  const names = extractNamesList(roster)

  for (const name of names) {
    // Detecta heurística de gênero pelo primeiro nome (terminações típicas a/e/o)
    const isFemale = /[aã]$/i.test(name.split(/\s+/)[0])
    const pronoun = isFemale ? 'a aluna' : 'o aluno'
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    text = text.replace(regex, pronoun)
  }

  // Normaliza artigos contrações residuais ("para o o aluno" -> "para o aluno")
  text = text.replace(/\b([a-z]+)\s+o\s+o\s+aluno\b/gi, '$1 o aluno')
  text = text.replace(/\b([a-z]+)\s+a\s+a\s+aluna\b/gi, '$1 a aluna')
  text = text.replace(/\bpro\s+o\s+aluno\b/gi, 'pro aluno')
  text = text.replace(/\bpra\s+a\s+aluna\b/gi, 'pra aluna')

  return text.trim()
}

/**
 * Guarda de Egress para Voz em Nuvem (STT/TTS).
 * Bloqueia se a flag de teste estiver desligada, se o roster for de alunos reais,
 * ou se qualquer nome do roster for detectado no texto de entrada/saída de voz.
 */
export function guardCloudVoiceEgress(
  text: string,
  activeRoster?: Array<{ name: string } | string>
): void {
  // 1. Verificação da flag obrigatória
  if (!isCloudVoiceTestEnabled()) {
    throw new CloudVoiceSecurityError(
      'Voz em nuvem bloqueada: O modo de teste de voz em nuvem está desligado por padrão no sistema.'
    )
  }

  // 2. Verificação de roster canário obrigatório
  if (activeRoster && activeRoster.length > 0) {
    if (!isCanaryRoster(activeRoster)) {
      throw new CloudVoiceSecurityError(
        'Voz em nuvem bloqueada: Detectado roster de alunos reais. Voz em nuvem é permitida estritamente com dados canário.',
        ['NON_CANARY_ROSTER_DETECTED']
      )
    }

    // 3. Verificação de vazamento nominal no texto
    const violations: string[] = []
    const names = extractNamesList(activeRoster)
    const lower = text.toLowerCase()

    for (const name of names) {
      const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'i')
      if (regex.test(lower)) {
        violations.push(name)
      }
    }

    if (violations.length > 0) {
      throw new CloudVoiceSecurityError(
        `Voz em nuvem bloqueada: Texto contém nomes de alunos (${violations.join(', ')}). Utilize spokenText() antes da síntese.`,
        violations
      )
    }
  }
}
