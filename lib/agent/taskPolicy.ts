// lib/agent/taskPolicy.ts
// Política determinística derivada do pedido do usuário: o que a tarefa autoriza mudar.
// O executor aplica a política ANTES de cada clique, independentemente do que o LLM decidir,
// então uma injeção de prompt na página não consegue disparar uma ação que o usuário não pediu.

export type EffectClass = 'delete' | 'publish' | 'save' | 'logout'

export interface TaskPolicy {
  /** Efeitos que a tarefa autoriza explicitamente */
  allowed: Set<EffectClass>
  /** A tarefa pede para não alterar nada (consulta pura) */
  readOnly: boolean
  /** Motivo legível de cada efeito negado, para o histórico do agente */
  explain: Partial<Record<EffectClass, string>>
}

const strip = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Rótulos de controles que produzem cada efeito
const EFFECT_LABEL: Record<EffectClass, RegExp> = {
  delete: /\b(excluir|exclua|apagar|apague|deletar|delete|remover|remova|limpar|zerar|resetar|descartar|remove)\b/,
  publish: /\b(publicar|publique|publish|enviar|envie|send|disparar|notificar)\b/,
  save: /\b(salvar|salve|gravar|grave|confirmar|confirme|lancar|lance|registrar|registre|concluir|finalizar|aprovar|reprovar|assinar|homologar|submit|save)\b/,
  logout: /\b(sair|logout|desconectar)\b/,
}

// Verbos no pedido que autorizam cada efeito
const EFFECT_REQUEST: Record<EffectClass, RegExp> = {
  delete: /\b(exclu\w*|apag\w*|delet\w*|remov\w*|limp\w*|zer\w*)\b/,
  publish: /\b(publi\w*|envi\w*|dispar\w*|notifi\w*)\b/,
  save: /\b(salv\w*|grav\w*|confirm\w*|lanc\w*|registr\w*|conclu\w*|finaliz\w*|aprov\w*|assin\w*|cri\w*|cadastr\w*|preench\w*|atualiz\w*|edit\w*|alter\w*|marqu\w*|marc\w*|rascunho)\b/,
  logout: /\b(sair|deslog\w*|logout)\b/,
}

const NEGATION = /\b(nao|sem|nunca|jamais)\b/
const READ_ONLY = /\b((sem alterar|nao altere|nao alterar|sem modificar|nao modifique)\s+nada|somente leitura|apenas consult\w*|so consult\w*)\b/

// Um verbo autoriza o efeito se aparecer ao menos uma vez SEM negação logo antes
// ("não publique", "sem excluir nada", "nunca apague" não autorizam).
function requestedWithoutNegation(text: string, verb: RegExp): { asked: boolean; negated: boolean } {
  const re = new RegExp(verb.source, 'g')
  let asked = false
  let negated = false
  for (const m of text.matchAll(re)) {
    const before = text
      .slice(Math.max(0, (m.index ?? 0) - 30), m.index)
      .replace(/[()"'.,;:]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(-3)
      .join(' ')
    if (NEGATION.test(before)) negated = true
    else asked = true
  }
  return { asked, negated }
}

export function derivePolicy(task: string): TaskPolicy {
  const t = strip(task)
  const allowed = new Set<EffectClass>()
  const explain: TaskPolicy['explain'] = {}
  const readOnly = READ_ONLY.test(t)

  for (const effect of Object.keys(EFFECT_REQUEST) as EffectClass[]) {
    const { asked, negated } = requestedWithoutNegation(t, EFFECT_REQUEST[effect])
    if (asked && !readOnly) allowed.add(effect)
    else explain[effect] = negated || readOnly ? 'o pedido proíbe' : 'o pedido não pediu'
  }
  // Publicar implica confirmar a publicação
  if (allowed.has('publish')) allowed.add('save')
  return { allowed, readOnly, explain }
}

export function classifyEffect(label: string): EffectClass | null {
  const l = strip(label)
  // Ordem importa: "Excluir e salvar" é exclusão
  for (const effect of ['delete', 'publish', 'logout', 'save'] as EffectClass[]) {
    if (EFFECT_LABEL[effect].test(l)) return effect
  }
  return null
}

const EFFECT_NAME: Record<EffectClass, string> = {
  delete: 'excluir/apagar',
  publish: 'publicar/enviar',
  save: 'salvar/gravar/confirmar',
  logout: 'sair da sessão',
}

/** Retorna o motivo do bloqueio, ou null se o clique é permitido pela política. */
export function policyBlocks(policy: TaskPolicy, label: string): string | null {
  const effect = classifyEffect(label)
  if (!effect || policy.allowed.has(effect)) return null
  return `Bloqueado pela política da tarefa: "${label}" faria ${EFFECT_NAME[effect]}, e ${policy.explain[effect] ?? 'o pedido não pediu'} isso.`
}
