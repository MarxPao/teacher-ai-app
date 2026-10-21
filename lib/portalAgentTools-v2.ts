/**
 * lib/portalAgentTools-v2.ts
 * Gap 4 + Gap 5 + Gap 6 + T08
 *
 * Ferramentas do agente genérico de portal (LLM-driven).
 * Substitui/complementa as definições relevantes em agentTools.ts para o contexto de portal.
 *
 * Mudanças:
 *  Gap 4 — MAX_PORTAL_STEPS: 30 → 100; multi-host via allowed_hosts[]
 *  Gap 5 — nova ferramenta portal_extract (listas, cards)
 *  Gap 6 — nova ferramenta portal_go_back, portal_wait, portal_reload; iframe real click
 *  T08   — portal_finish valida campos antes de aceitar
 */

// ─── Gap 4: limite de steps ──────────────────────────────────────────────────

/** Limite anterior: 30. Novo: 100 (tarefas longas — multi-página, multi-portal). */
export const MAX_PORTAL_STEPS = 100

/**
 * Gap 4: multi-host.
 * Valida se o host atual está entre os hosts permitidos para esta execução.
 * Suporta domínios distintos (portais com SSO em subdomínio diferente, ex: login.spo.gov.br → siged.spo.gov.br).
 */
export function isHostAllowed(actualHost: string, allowedHosts: string[]): boolean {
  const norm = actualHost.toLowerCase().trim()
  return allowedHosts.some(h => {
    const hNorm = h.toLowerCase().trim()
    return norm === hNorm || norm.endsWith(`.${hNorm}`)
  })
}

// ─── Definição das ferramentas do agente de portal ──────────────────────────

export type PortalToolName =
  | 'portal_observe'
  | 'portal_click'
  | 'portal_write'
  | 'portal_select'
  | 'portal_navigate'
  | 'portal_scroll'
  | 'portal_go_back'
  | 'portal_wait'
  | 'portal_reload'
  | 'portal_extract'
  | 'portal_screenshot'
  | 'portal_finish'

/** Definição de ferramenta do agente de portal (compatível com ToolDefinition) */
export interface PortalToolDef {
  name: PortalToolName
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const PORTAL_AGENT_TOOLS: PortalToolDef[] = [
  // ── Observação ────────────────────────────────────────────────────────────
  {
    name: 'portal_observe',
    description: 'Observa o estado atual da página do portal: elementos visíveis, texto, frames. Deve ser a primeira ação de cada turno.',
    input_schema: {
      type: 'object',
      properties: {
        maxElements: { type: 'number', description: 'Máximo de elementos a retornar (padrão 80)' },
        focusFrame: { type: 'string', description: 'URL parcial ou nome do frame a focar (opcional)' },
      },
      required: [],
    },
  },

  // ── Clique ────────────────────────────────────────────────────────────────
  {
    name: 'portal_click',
    description: 'Clica em um elemento pelo texto visível, label ARIA ou seletor CSS. Use trusted:true para elementos que exigem clique real (isTrusted=true), como "Salvar notas" ou "Publicar agora".',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Texto visível, aria-label ou selector CSS do elemento' },
        frameUrl: { type: 'string', description: 'URL parcial do iframe onde o elemento está (opcional)' },
        trusted: { type: 'boolean', description: 'Usar clique real via CDP (isTrusted=true) — obrigatório para botões que rejeitam cliques sintéticos' },
        isDestructive: {
          type: 'boolean',
          description: 'Declara explicitamente que esta é uma ação destrutiva autorizada pelo professor (excluir, publicar para todos). Padrão false.',
        },
      },
      required: ['target'],
    },
  },

  // ── Escrita ───────────────────────────────────────────────────────────────
  {
    name: 'portal_write',
    description: 'Digita texto em um campo de entrada (input, textarea). Use trusted:true para campos que exigem eventos de teclado reais (isTrusted=true).',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Seletor CSS ou label do campo' },
        value: { type: 'string', description: 'Valor a digitar (sem PII de aluno — use variável {{nome}})' },
        trusted: { type: 'boolean', description: 'Eventos CDP reais (isTrusted=true)' },
        frameUrl: { type: 'string', description: 'URL parcial do iframe (opcional)' },
      },
      required: ['target', 'value'],
    },
  },

  // ── Select ────────────────────────────────────────────────────────────────
  {
    name: 'portal_select',
    description: 'Seleciona uma opção em um <select> ou combobox.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Seletor CSS ou label do select' },
        option: { type: 'string', description: 'Texto da opção a selecionar' },
        frameUrl: { type: 'string', description: 'URL parcial do iframe (opcional)' },
      },
      required: ['target', 'option'],
    },
  },

  // ── Navegação ─────────────────────────────────────────────────────────────
  {
    name: 'portal_navigate',
    description: 'Navega para uma URL dentro dos hosts permitidos desta tarefa.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL completa (deve estar dentro dos hosts permitidos)' },
      },
      required: ['url'],
    },
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  {
    name: 'portal_scroll',
    description: 'Rola a página para cima ou para baixo uma tela.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Direção do scroll' },
        frameUrl: { type: 'string', description: 'URL parcial do iframe (opcional)' },
      },
      required: ['direction'],
    },
  },

  // ── Gap 6: go_back ────────────────────────────────────────────────────────
  {
    name: 'portal_go_back',
    description: 'Volta para a página anterior do histórico do navegador (equivale ao botão Voltar).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ── Gap 6: wait ───────────────────────────────────────────────────────────
  {
    name: 'portal_wait',
    description: 'Aguarda N milissegundos antes de prosseguir (útil após AJAX, animação ou redirecionamento).',
    input_schema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Milissegundos a aguardar (mínimo 200, máximo 5000)' },
        reason: { type: 'string', description: 'Motivo do wait (para log)' },
      },
      required: ['ms'],
    },
  },

  // ── Gap 6: reload ─────────────────────────────────────────────────────────
  {
    name: 'portal_reload',
    description: 'Recarrega a página atual (F5). Use quando a sessão expirar ou a página travar.',
    input_schema: {
      type: 'object',
      properties: {
        hardReload: { type: 'boolean', description: 'Ignorar cache (Ctrl+Shift+R). Padrão false.' },
      },
      required: [],
    },
  },

  // ── Gap 5: extract ────────────────────────────────────────────────────────
  {
    name: 'portal_extract',
    description: 'Extrai dados estruturados da página atual: lista simples, lista de cards com campos ou valor único. Evita tabelas brutas.',
    input_schema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['list', 'cards', 'single_value'],
          description:
            'list — array de strings simples; cards — array de objetos com campos nomeados; single_value — um único valor (nota, nome, data)',
        },
        selector: {
          type: 'string',
          description: 'Seletor CSS da região a extrair (ex: "table.alunos tbody", "ul.resultados", "#nota-final")',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Para format=cards: nomes dos campos a extrair de cada item (ex: ["nome", "nota", "status"])',
        },
        frameUrl: { type: 'string', description: 'URL parcial do iframe (opcional)' },
        maxItems: { type: 'number', description: 'Máximo de itens a retornar (padrão 100)' },
      },
      required: ['format', 'selector'],
    },
  },

  // ── Gap 2: screenshot (via Driver.captureScreenshot) ──────────────────────
  {
    name: 'portal_screenshot',
    description: 'Captura screenshot local do viewport quando o DOM não contém informação suficiente (canvas, PDF embutido, conteúdo visual). Não envia a imagem para nenhum servidor externo.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo da captura (para log)' },
      },
      required: [],
    },
  },

  // ── T08 + Gap 6: finish com validação ────────────────────────────────────
  {
    name: 'portal_finish',
    description:
      'Conclui a tarefa atual. Antes de aceitar, verifica automaticamente que todos os campos obrigatórios estão preenchidos (T08). Se algum campo estiver vazio, retorna erro com lista dos campos pendentes.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Resumo do que foi realizado (sem PII — não inclua nomes de alunos ou valores sensíveis)',
        },
        status: {
          type: 'string',
          enum: ['success', 'partial', 'failed'],
          description: 'success — concluído com êxito; partial — concluído parcialmente; failed — falhou',
        },
        requiredFieldSelectors: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Seletores CSS dos campos obrigatórios a verificar antes de concluir (T08). Se qualquer campo estiver vazio, a conclusão é bloqueada.',
        },
      },
      required: ['summary', 'status'],
    },
  },
]

// ─── Handler de portal_finish com verificação T08 ────────────────────────────

/**
 * Executa portal_finish com verificação de campos obrigatórios.
 * Retorna { ok: true, summary } ou { ok: false, error, missingFields }.
 */
export async function handlePortalFinish(
  input: { summary: string; status: string; requiredFieldSelectors?: string[] },
  driver: { readValue: (opts: any) => Promise<{ value: string }> }
): Promise<
  | { ok: true; summary: string; status: string }
  | { ok: false; error: string; missingFields: string[] }
> {
  const selectors = input.requiredFieldSelectors ?? []

  if (selectors.length > 0) {
    const missing: string[] = []
    for (const sel of selectors) {
      try {
        const { value } = await driver.readValue({
          anchor: { candidates: [{ strategy: 'css', selector: sel }], description: sel },
        })
        const isEmpty = !value || value.trim() === '' || value === '0' || value === '--' || value === 'Selecione'
        if (isEmpty) missing.push(sel)
      } catch {
        missing.push(`${sel} (não encontrado)`)
      }
    }

    if (missing.length > 0) {
      return {
        ok: false,
        error: `portal_finish bloqueado (T08): campos obrigatórios ainda vazios — ${missing.join(', ')}`,
        missingFields: missing,
      }
    }
  }

  return { ok: true, summary: input.summary, status: input.status }
}
