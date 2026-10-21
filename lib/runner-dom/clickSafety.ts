// lib/runner-dom/clickSafety.ts
// Classifica se um clique pode enviar/gravar/excluir dados no portal.
// Usado pelo DomDriver para bloquear cliques de envio não declarados no grafo.

const MUTATING_TEXT_RE =
  /\b(salvar|gravar|enviar|submeter|confirmar|concluir|finalizar|publicar|lan[cç]ar|registrar|excluir|apagar|remover|deletar|fechar\s+(?:di[aá]rio|etapa|bimestre)|save|submit|send|confirm|publish|delete|remove)\b/i

// Botões de consulta (filtro/busca/paginação) enviam formulário mas não gravam nada.
const QUERY_TEXT_RE =
  /\b(pesquisar|buscar|procurar|filtrar|consultar|exibir|listar|carregar|visualizar|ver|pr[oó]xim[oa]|anterior|avan[cç]ar|voltar|search|filter|find|next|previous|go)\b/i

export interface ClickTargetDescription {
  tagName: string
  type?: string
  isSubmitOrMutating: boolean
  formAction?: string
  text?: string
}

function attr(el: Element, name: string): string {
  return typeof (el as any).getAttribute === 'function' ? el.getAttribute(name) || '' : ''
}

function visibleText(el: Element): string {
  const h = el as HTMLElement
  const raw =
    (h.innerText || h.textContent || '') +
    ' ' +
    attr(el, 'value') +
    ' ' +
    attr(el, 'aria-label') +
    ' ' +
    attr(el, 'title')
  return raw.replace(/\s+/g, ' ').trim()
}

export function describeClickElement(el: Element): ClickTargetDescription {
  const tagName = String(el.tagName || '').toLowerCase()
  const typeAttr = attr(el, 'type').toLowerCase()
  const text = visibleText(el).slice(0, 120)
  const form = (el as HTMLButtonElement).form ?? (typeof el.closest === 'function' ? el.closest('form') : null)
  const formAction = form?.getAttribute('action') || undefined

  const isMutatingText = MUTATING_TEXT_RE.test(text)
  const isQueryText = QUERY_TEXT_RE.test(text) && !isMutatingText

  // Botões nativos de envio (input submit/image, <button> em form sem type)
  const isNativeSubmit =
    (tagName === 'input' && (typeAttr === 'submit' || typeAttr === 'image')) ||
    (tagName === 'button' && (typeAttr === 'submit' || (!typeAttr && !!form)))

  // Handlers inline que disparam submit/postback
  const inline = attr(el, 'onclick') + ' ' + attr(el, 'href')
  const isInlineSubmit = /\.submit\s*\(|__doPostBack|javascript:\s*(salvar|gravar)/i.test(inline)

  const isSubmitOrMutating = isMutatingText || ((isNativeSubmit || isInlineSubmit) && !isQueryText)

  return { tagName, type: typeAttr || undefined, isSubmitOrMutating, formAction, text }
}
