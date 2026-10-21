/**
 * lib/disciplineGate.ts — Trava de Disciplina Curricular e Limiares Pedagógicos
 * 
 * Regra Pedagógica:
 * Conteúdos e prescrições de Língua Inglesa (Krashen, Nation, Scrivener, tempos verbais compostos,
 * Lexical Chunks) só são ativados quando a disciplina da turma constar na lista de permissão.
 * Disciplinas ausentes, desconhecidas ou de outras áreas (ex: Matemática, História) recebem
 * exclusivamente dados estatísticos com aviso orientativo.
 */

/**
 * Lista de permissão canônica para disciplinas de Língua Inglesa.
 */
export const ELT_ALLOWED_SUBJECTS = [
  'ingles',
  'lingua inglesa',
  'english',
  'lingua estrangeira moderna - ingles',
  'lingua estrangeira'
] as const

/**
 * Limiar unificado de atenção pedagógica.
 * Escolha do valor mais conservador: 6.5 (alerta precocemente para intervenção antes da nota 5.9).
 */
export const PEDAGOGICAL_RISK_THRESHOLD = 6.5 // VALOR DE POLÍTICA, A VALIDAR (pedagogo)

/**
 * Limiar unificado para destaque / extensão pedagógica.
 */
export const PEDAGOGICAL_EXCELLENCE_THRESHOLD = 9.0 // VALOR DE POLÍTICA, A VALIDAR (pedagogo)

/**
 * Verifica se a disciplina informada pertence à área de Língua Inglesa.
 * Comparação estrita em minúsculas e sem acentuação diacrítica.
 */
export function isEltSubject(subject?: string | null): boolean {
  if (!subject) return false
  const normalized = subject
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (!normalized) return false

  return ELT_ALLOWED_SUBJECTS.some(
    allowed => normalized === allowed || normalized.includes('ingles') || normalized.includes('english')
  )
}

/**
 * Filtra cards e prescrições pedagógicas com base na disciplina avaliada.
 */
export function filterHintsByDiscipline<T>(
  hints: T[],
  subject?: string | null
): { activeHints: T[]; notice: string | null } {
  if (!isEltSubject(subject)) {
    return {
      activeHints: [],
      notice: 'orientações específicas ainda não disponíveis para esta disciplina'
    }
  }

  return {
    activeHints: hints,
    notice: null
  }
}
