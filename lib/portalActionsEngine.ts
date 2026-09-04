/**
 * portalActionsEngine.ts — Motor de Ações e Portais Escolares Editáveis
 *
 * ============================================================================
 * DIRETIVA DE SEGURANÇA 0-TESTER (CONFIRMAÇÃO HUMANA OBRIGATÓRIA):
 * 1. É terminantemente proibido qualquer disparo de submit/save automático no DOM do portal.
 * 2. O único fluxo permitido é: IA identifica ação/campos -> Preenche VISUALMENTE no formulário
 *    -> PARA IMEDIATAMENTE -> Aguarda a professora conferir e clicar manualmente em Salvar no portal.
 * 3. Todos os perfis e ações operam estritamente no modo 'supervised'.
 * ============================================================================
 */

import { validateDiscoveredPortalMapNoPII } from '@/lib/portalSanitizer'

export interface FieldMappingDef {
  fieldId: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'select' | 'number' | 'checkbox_list'
  selectors: string[]
  semanticKeywords: string[]
  description: string
  required?: boolean
}

export type PortalActionType = 'diary' | 'attendance' | 'grades' | 'assignment' | 'communication' | 'read_roster' | 'custom'

export interface PaginationStrategyDef {
  type: 'next_button' | 'page_numbers' | 'infinite_scroll' | 'none'
  nextSelector?: string
  pageNumberSelector?: string
  maxPages?: number
  delayBetweenPagesMs?: number
}

export interface PortalActionDef {
  id: string
  title: string
  type: PortalActionType
  description: string
  fields: FieldMappingDef[]
  executionMode: 'supervised' | 'read_only'
  spokenConfirmation: string
  isCustom?: boolean
  paginationStrategy?: PaginationStrategyDef
}

export interface PortalProfileDef {
  id: string
  name: string
  shortName: string
  url: string
  matchUrl: string
  icon: string
  color: string
  bg: string
  border: string
  category: string
  description: string
  isCustom: boolean
  statusOverride?: 'pending_approval' | 'active' | 'deprecated'
  actions: PortalActionDef[]
}

// ============================================================================
// Engine Universal — Mapas Descobertos Automaticamente
// ============================================================================

/**
 * Representa um mapa de seletores CSS descoberto autonomamente pelo engine
 * de leitura de portal (Camada 2). Espelha a tabela discovered_portal_maps.
 *
 * discovery_confidence:
 *   'high'   — seletor por ID, validado com >= 5 alunos encontrados
 *   'medium' — seletor por classe, validado com >= 1 aluno
 *   'low'    — heurística fraca, precisa de revisão
 *
 * map_source (no payload da tarefa):
 *   'known_map'             — Camada 1 (mapa pré-configurado ou salvo)
 *   'discovered'            — Camada 2 descoberta inicial (portal novo)
 *   'fallback_rediscovered' — Camada 2 auto-cura (layout mudou)
 */
export interface DiscoveredPortalMap {
  id?: string
  portal_domain: string
  portal_display_name?: string
  discovered_selectors: {
    roster_table: string
    name_column: number
    id_column: number
    status_column?: number
    nee_selector?: string
    header_rows?: number
  }
  pagination_strategy?: {
    type: 'next_button' | 'page_numbers' | 'infinite_scroll' | 'none'
    nextSelector?: string
    maxPages?: number
    delayBetweenPagesMs?: number
  }
  discovery_confidence: 'high' | 'medium' | 'low'
  discovered_by_teacher_id?: string
  discovered_at?: string
  last_validated_at?: string
  validation_failures?: number
  superseded_by?: string
}

/**
 * Extrai o domínio raiz (registrável) tratando ccTLDs de 2 partes (.com.br, .edu.br, etc.)
 * Ex: machadosobrinho.paineldoaluno.com.br -> paineldoaluno.com.br
 *     colegioxyz.paineldoaluno.com.br -> paineldoaluno.com.br
 *     sub.escola.edu.br -> escola.edu.br
 */
export function extractRootDomain(domainOrUrl: string): string {
  const domain = extractDomain(domainOrUrl)
  if (!domain) return ''
  const COMMON_SLDS = new Set(['com', 'edu', 'org', 'net', 'gov', 'mil', 'tur', 'esp', 'coop', 'ind', 'inf'])
  const parts = domain.split('.')
  if (parts.length <= 2) return domain
  if (parts.length >= 3 && COMMON_SLDS.has(parts[parts.length - 2])) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

/**
 * Busca o mapa ativo mais recente para um domínio com fallback para domínio raiz (White-Label).
 * Retorna null se não encontrado ou se o supabase/storage não estiver disponível.
 */
export async function getDiscoveredPortalMap(
  domainOrUrl: string,
  supabase?: any
): Promise<DiscoveredPortalMap | null> {
  const cleanDomain = extractDomain(domainOrUrl)
  if (!cleanDomain) return null
  const rootDomain = extractRootDomain(cleanDomain)

  // 1. Tenta Supabase se disponível
  if (supabase) {
    try {
      // 1a. Busca exata por subdomínio
      const queryExact = supabase
        .from('discovered_portal_maps')
        .select('*')
        .eq('portal_domain', cleanDomain)
        .is('superseded_by', null)
        .limit(1)

      const exactRes = typeof queryExact.maybeSingle === 'function' 
        ? await queryExact.maybeSingle() 
        : (typeof queryExact.single === 'function' ? await queryExact.single() : await queryExact)
      const exactData = exactRes?.data

      if (exactData) return exactData as DiscoveredPortalMap

      // 1b. Fallback por domínio raiz (White-Label)
      if (rootDomain !== cleanDomain) {
        const queryRoot = supabase
          .from('discovered_portal_maps')
          .select('*')
          .eq('portal_domain', rootDomain)
          .is('superseded_by', null)
          .limit(1)

        const rootRes = typeof queryRoot.maybeSingle === 'function'
          ? await queryRoot.maybeSingle()
          : (typeof queryRoot.single === 'function' ? await queryRoot.single() : await queryRoot)
        const rootData = rootRes?.data

        if (rootData) return rootData as DiscoveredPortalMap
      }
    } catch {}
  }

  // 2. Fallback para localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('teacher_discovered_portal_maps')
      if (raw) {
        const list: DiscoveredPortalMap[] = JSON.parse(raw)
        // Busca exata
        const exact = list.find(m => m.portal_domain === cleanDomain && !m.superseded_by)
        if (exact) return exact
        // Busca por raiz
        if (rootDomain !== cleanDomain) {
          const rootMatch = list.find(m => m.portal_domain === rootDomain && !m.superseded_by)
          if (rootMatch) return rootMatch
        }
      }
    } catch {}
  }

  return null
}

/**
 * Busca todos os mapas ativos descobertos (para listar status de todos os portais).
 */
export async function getAllDiscoveredPortalMaps(
  supabase: any
): Promise<DiscoveredPortalMap[]> {
  // 1. Tenta carregar do Supabase se disponível
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('discovered_portal_maps')
        .select('*')
        .is('superseded_by', null)
        .order('last_validated_at', { ascending: false })

      if (!error && data && data.length > 0) {
        return data as DiscoveredPortalMap[]
      }
    } catch {}
  }

  // 2. Fallback para localStorage (modo offline / sandbox / demo)
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('teacher_discovered_portal_maps')
      if (raw) {
        const list: DiscoveredPortalMap[] = JSON.parse(raw)
        return list.filter(m => !m.superseded_by)
      }
    } catch {}
  }

  return []
}

// ============================================================================
// Suporte a Visão Computacional (Capability Routing Frontend)
// ============================================================================

export const VISION_CAPABLE_PROVIDERS = ['openai', 'anthropic', 'gemini', 'google'] as const

export const KNOWN_VISION_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'claude-3-5-sonnet',
  'claude-3-7-sonnet',
  'claude-3-opus',
  'claude-3-sonnet',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'qwen-vl'
]

/**
 * Verifica se o par provedor / modelo suporta visão computacional.
 */
export function modelSupportsVision(provider?: string, model?: string): boolean {
  if (!provider) return false
  const p = provider.toLowerCase().trim()
  const isProvOk = VISION_CAPABLE_PROVIDERS.some(vp => p.includes(vp))
  if (!isProvOk) return false
  if (!model) return true
  const m = model.toLowerCase().trim()
  return KNOWN_VISION_MODELS.some(known => m.includes(known) || known.includes(m))
}

/**
 * Retorna o status do modelo de visão BYOK atualmente ativo do professor.
 */
export function getTeacherVisionModelStatus(): {
  hasVisionSupport: boolean
  activeProvider: string
  activeModel: string
  reason?: string
} {
  if (typeof localStorage !== 'undefined') {
    try {
      const rawApis = localStorage.getItem('teacher_apis')
      if (rawApis) {
        const apis: any[] = JSON.parse(rawApis)
        // Procura primeiro modelos de visão ativos com chave configurada
        const visionApi = apis.find(a => a.apiKey && (a.id === 'openai' || a.id === 'gemini' || a.id === 'anthropic'))
        if (visionApi) {
          const isOk = modelSupportsVision(visionApi.id, visionApi.model)
          const provName = visionApi.name || (visionApi.id === 'openai' ? 'OpenAI' : visionApi.id === 'gemini' ? 'Google Gemini' : visionApi.id === 'anthropic' ? 'Anthropic' : visionApi.id)
          return {
            hasVisionSupport: isOk,
            activeProvider: provName,
            activeModel: visionApi.model || 'Padrão',
            reason: isOk ? undefined : `O modelo '${visionApi.model}' não possui suporte comprovado a visão computacional.`
          }
        }

        // Se há alguma outra API ativa (ex: Groq text-only)
        const anyActive = apis.find(a => a.apiKey)
        if (anyActive) {
          return {
            hasVisionSupport: false,
            activeProvider: anyActive.name || anyActive.id,
            activeModel: anyActive.model || 'text-only',
            reason: `O provedor '${anyActive.name || anyActive.id}' configurado opera apenas em modo texto (sem visão computacional para ler telas de portais).`
          }
        }
      }
    } catch {}
  }

  // Padrão do sistema caso nada configurado
  return {
    hasVisionSupport: true,
    activeProvider: 'OpenAI',
    activeModel: 'gpt-4o'
  }
}

/**
 * Persiste um mapa descoberto no Supabase.
 * Retorna o ID gerado ou null em caso de erro / sem supabase.
 * Nunca persiste sem selectors.roster_table definido.
 */
export async function saveDiscoveredPortalMap(
  map: Omit<DiscoveredPortalMap, 'id' | 'discovered_at' | 'last_validated_at' | 'validation_failures' | 'superseded_by'>,
  supabase: any
): Promise<string | null> {
  if (!supabase || !map.discovered_selectors?.roster_table) return null

  // Guard de PII estrito: impede salvamento de mapa com nomes próprios, CPFs ou e-mails
  const piiCheck = validateDiscoveredPortalMapNoPII(map)
  if (!piiCheck.valid) {
    console.error('[Security/LGPD] Tentativa de salvar mapa com violação de PII bloqueada:', piiCheck.violations)
    return null
  }

  try {
    const { data, error } = await supabase
      .from('discovered_portal_maps')
      .insert({
        ...map,
        last_validated_at: new Date().toISOString(),
        validation_failures: 0,
      })
      .select('id')
      .single()

    if (error || !data) return null
    return data.id as string
  } catch {
    return null
  }
}

/**
 * Persiste um mapa descoberto no localStorage (para modo offline / sandbox / UI local).
 */
export function saveLocalDiscoveredPortalMap(
  map: Omit<DiscoveredPortalMap, 'id' | 'discovered_at' | 'last_validated_at' | 'validation_failures' | 'superseded_by'>
): string | null {
  if (!map.discovered_selectors?.roster_table) return null

  // Guard de PII estrito
  const piiCheck = validateDiscoveredPortalMapNoPII(map)
  if (!piiCheck.valid) {
    console.error('[Security/LGPD] Tentativa de salvar mapa local com violação de PII bloqueada:', piiCheck.violations)
    return null
  }

  if (typeof localStorage === 'undefined') return null
  const newId = `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const record: DiscoveredPortalMap = {
    ...map,
    id: newId,
    discovered_at: new Date().toISOString(),
    last_validated_at: new Date().toISOString(),
    validation_failures: 0,
  }
  try {
    const raw = localStorage.getItem('teacher_discovered_portal_maps')
    const list: DiscoveredPortalMap[] = raw ? JSON.parse(raw) : []
    const filtered = list.filter(m => m.portal_domain !== map.portal_domain)
    filtered.unshift(record)
    localStorage.setItem('teacher_discovered_portal_maps', JSON.stringify(filtered))
    return newId
  } catch {
    return null
  }
}

/**
 * Extrai o domínio limpo a partir de uma URL ou host.
 */
export function extractDomain(urlOrDomain: string): string {
  if (!urlOrDomain) return ''
  let cleaned = urlOrDomain.trim().toLowerCase()
  cleaned = cleaned.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  cleaned = cleaned.split('/')[0].split('?')[0].split(':')[0]
  return cleaned
}

export const DEFAULT_PORTALS: PortalProfileDef[] = [
  {
    id: 'machado',
    name: 'Machado Sobrinho',
    shortName: 'Machado',
    url: 'https://machadosobrinho.paineldoaluno.com.br/professor_painel',
    matchUrl: 'paineldoaluno.com.br',
    icon: 'ti-chalkboard',
    color: '#b58900',
    bg: '#fef9c3',
    border: '#fef08a',
    category: 'Diário & Notas',
    description: 'Painel oficial de professores para lançamento de diários de classe, frequências e notas bimestrais.',
    isCustom: false,
    actions: [
      {
        id: 'machado_read_roster',
        title: 'Importar Roster de Alunos e Turmas',
        type: 'read_roster',
        description: 'Lê a lista oficial de chamada de alunos e matrículas direto do portal do Machado Sobrinho via Descoberta Autônoma.',
        executionMode: 'read_only',
        spokenConfirmation: 'Lista de alunos do Machado Sobrinho importada e pronta para conferência!',
        fields: []
      },
      {
        id: 'machado_diary',
        title: 'Lançar Diário de Classe',
        type: 'diary',
        description: 'Preenche o conteúdo programático, assunto da aula e metodologia no diário.',
        executionMode: 'supervised',
        spokenConfirmation: 'Diário de classe preenchido no Machado Sobrinho com sucesso!',
        fields: [
          {
            fieldId: 'title',
            label: 'Título / Assunto da Aula',
            type: 'text',
            selectors: ['input[name*="titulo"]', 'input[name*="assunto"]', 'input[id*="diario"]', 'input[placeholder*="Assunto"]'],
            semanticKeywords: ['título', 'assunto', 'conteúdo', 'tema'],
            description: 'Tema trabalhado em aula (ex: Present Perfect & Listening)'
          },
          {
            fieldId: 'date',
            label: 'Data da Aula',
            type: 'date',
            selectors: ['input[type="date"]', 'input[name*="data"]', 'input[id*="data"]'],
            semanticKeywords: ['data', 'dia', 'date'],
            description: 'Data em formato AAAA-MM-DD'
          },
          {
            fieldId: 'description',
            label: 'Conteúdo & Metodologia',
            type: 'textarea',
            selectors: ['textarea[name*="conteudo"]', 'textarea[name*="descricao"]', 'textarea[name*="pauta"]', 'div[contenteditable="true"]'],
            semanticKeywords: ['conteúdo', 'descrição', 'pauta', 'metodologia'],
            description: 'Resumo detalhado das atividades aplicadas'
          },
          {
            fieldId: 'classRef',
            label: 'Turma',
            type: 'select',
            selectors: ['select[name*="turma"]', 'select[id*="turma"]', 'input[name*="turma"]'],
            semanticKeywords: ['turma', 'classe', 'série'],
            description: 'Turma vinculada'
          }
        ]
      },
      {
        id: 'machado_attendance',
        title: 'Lançar Frequência & Chamada',
        type: 'attendance',
        description: 'Registra presenças e marca faltas na lista de alunos da turma.',
        executionMode: 'supervised',
        spokenConfirmation: 'Chamada registrada no painel Machado Sobrinho!',
        fields: [
          {
            fieldId: 'date',
            label: 'Data da Chamada',
            type: 'date',
            selectors: ['input[type="date"]', 'input[name*="data"]'],
            semanticKeywords: ['data', 'dia'],
            description: 'Data da aula'
          },
          {
            fieldId: 'absentStudents',
            label: 'Alunos Ausentes / Faltas',
            type: 'checkbox_list',
            selectors: ['input[type="checkbox"][name*="falta"]', 'input[type="checkbox"][name*="presenca"]', 'tr[data-student]'],
            semanticKeywords: ['falta', 'ausente', 'presença'],
            description: 'Lista de faltas identificadas'
          }
        ]
      },
      {
        id: 'machado_grades',
        title: 'Lançar Boletim de Notas',
        type: 'grades',
        description: 'Lança as notas de avaliações, simulados e tarefas para os alunos.',
        executionMode: 'supervised',
        spokenConfirmation: 'Notas lançadas na planilha do Machado Sobrinho!',
        fields: [
          {
            fieldId: 'evaluationName',
            label: 'Nome da Avaliação',
            type: 'text',
            selectors: ['select[name*="avaliacao"]', 'input[name*="etapa"]', 'input[name*="prova"]'],
            semanticKeywords: ['avaliação', 'etapa', 'prova', 'trabalho'],
            description: 'Identificação da avaliação no sistema'
          },
          {
            fieldId: 'gradesMap',
            label: 'Notas dos Alunos',
            type: 'number',
            selectors: ['input[name*="nota"]', 'input[type="number"]', 'input[data-nota]'],
            semanticKeywords: ['nota', 'grade', 'pontos'],
            description: 'Notas individuais de 0 a 10'
          }
        ]
      }
    ]
  },
  {
    id: 'santacatarina',
    name: 'Rede Santa Catarina',
    shortName: 'Sta. Catarina',
    url: 'https://portaleducacao.redesantacatarina.org.br/auth/login',
    matchUrl: 'redesantacatarina.org.br',
    icon: 'ti-shield-check',
    color: '#dc322f',
    bg: '#fee2e2',
    border: '#fca5a5',
    category: 'Portal Acadêmico',
    description: 'Portal acadêmico oficial para planos de aula, pautas escolares e notas da Rede Santa Catarina.',
    isCustom: false,
    actions: [
      {
        id: 'stacatarina_plan',
        title: 'Registrar Plano de Aula & Pauta',
        type: 'diary',
        description: 'Publica o planejamento pedagógico e pauta no portal.',
        executionMode: 'supervised',
        spokenConfirmation: 'Plano de aula publicado na Rede Santa Catarina!',
        fields: [
          {
            fieldId: 'title',
            label: 'Planejamento / Tema',
            type: 'text',
            selectors: ['input[placeholder*="planejamento"]', 'input[name*="titulo"]', 'input[name*="plano"]'],
            semanticKeywords: ['planejamento', 'título', 'plano', 'tema'],
            description: 'Título do planejamento'
          },
          {
            fieldId: 'date',
            label: 'Data de Execução',
            type: 'date',
            selectors: ['input[type="date"]', 'input[name*="data"]'],
            semanticKeywords: ['data', 'prazo'],
            description: 'Data prevista da aula'
          },
          {
            fieldId: 'description',
            label: 'Pauta & Habilidades BNCC',
            type: 'textarea',
            selectors: ['textarea', 'div[contenteditable="true"]', 'input[name*="pauta"]'],
            semanticKeywords: ['pauta', 'habilidades', 'objetivos', 'bncc'],
            description: 'Detalhamento da aula e códigos da BNCC'
          }
        ]
      },
      {
        id: 'stacatarina_grades',
        title: 'Lançar Notas & Avaliações',
        type: 'grades',
        description: 'Preenche notas do trimestre no boletim escolar.',
        executionMode: 'supervised',
        spokenConfirmation: 'Notas lançadas no Portal Santa Catarina!',
        fields: [
          {
            fieldId: 'gradesMap',
            label: 'Matriz de Notas',
            type: 'number',
            selectors: ['input[name*="nota"]', 'input[type="number"]'],
            semanticKeywords: ['nota', 'boletim', 'rendimento'],
            description: 'Notas de 0 a 10 por aluno'
          }
        ]
      }
    ]
  },
  {
    id: 'plural',
    name: 'Plurall (SOMOS Educação)',
    shortName: 'Plurall',
    url: 'https://www.plurall.net/',
    matchUrl: 'plural.net',
    icon: 'ti-notebook',
    color: '#cb4b16',
    bg: '#fff7ed',
    border: '#ffedd5',
    category: 'LMS & Atividades',
    description: 'Portal de tarefas online, avaliações digitais e acompanhamento pedagógico SOMOS.',
    isCustom: false,
    actions: [
      {
        id: 'plural_assignment',
        title: 'Criar Tarefa / Atividade Online',
        type: 'assignment',
        description: 'Cria uma tarefa ou atividade para a turma no Plurall.',
        executionMode: 'supervised',
        spokenConfirmation: 'Tarefa agendada e criada no Plurall!',
        fields: [
          {
            fieldId: 'title',
            label: 'Título da Atividade',
            type: 'text',
            selectors: ['input[placeholder*="título"]', 'input[name*="title"]', 'input[name*="nome"]'],
            semanticKeywords: ['título', 'nome da tarefa', 'atividade'],
            description: 'Nome da atividade (ex: Homework Unit 4)'
          },
          {
            fieldId: 'date',
            label: 'Data Limite de Entrega',
            type: 'date',
            selectors: ['input[type="date"]', 'input[name*="datalimite"]', 'input[name*="prazo"]'],
            semanticKeywords: ['prazo', 'data limite', 'entrega'],
            description: 'Prazo final de submissão'
          },
          {
            fieldId: 'description',
            label: 'Instruções da Tarefa',
            type: 'textarea',
            selectors: ['textarea[name*="descricao"]', 'div[contenteditable="true"]'],
            semanticKeywords: ['instruções', 'descrição', 'exercícios'],
            description: 'Orientações aos alunos'
          }
        ]
      }
    ]
  },
  {
    id: 'cambridge',
    name: 'Cambridge One',
    shortName: 'Cambridge',
    url: 'https://www.cambridgeone.org/',
    matchUrl: 'cambridgeone.org',
    icon: 'ti-book-2',
    color: '#268bd2',
    bg: '#f0f9ff',
    border: '#bae6fd',
    category: 'ELT & Avaliações',
    description: 'Portal oficial Cambridge para atribuição de materiais digitais e diários de notas ELT.',
    isCustom: false,
    actions: [
      {
        id: 'cambridge_assignment',
        title: 'Atribuir Practice / Assignment',
        type: 'assignment',
        description: 'Atribui unidades de exercícios digitais na turma.',
        executionMode: 'supervised',
        spokenConfirmation: 'Atividade atribuída no Cambridge One!',
        fields: [
          {
            fieldId: 'title',
            label: 'Nome da Lição / Unidade',
            type: 'text',
            selectors: ['input[name*="lesson"]', 'input[name*="title"]', 'input[placeholder*="lesson"]'],
            semanticKeywords: ['lesson', 'unit', 'practice'],
            description: 'Ex: Unit 3 Grammar & Vocab'
          },
          {
            fieldId: 'date',
            label: 'Prazo de Conclusão',
            type: 'date',
            selectors: ['input[type="date"]', 'input[name*="due"]'],
            semanticKeywords: ['due date', 'deadline'],
            description: 'Data de entrega'
          }
        ]
      }
    ]
  },
  {
    id: 'trello',
    name: 'Trello Workspace',
    shortName: 'Trello',
    url: 'https://trello.com/',
    matchUrl: 'trello.com',
    icon: 'ti-layout-kanban',
    color: '#0079bf',
    bg: '#e6f4fb',
    border: '#b8e1f7',
    category: 'Produtividade & Quadros',
    description: 'Conexão direta com quadros, listas, cartões e checklists do Trello para roteamento agêntico e gestão de tarefas.',
    isCustom: false,
    actions: [
      {
        id: 'trello_import_checklist',
        title: 'Importar Checklists & Cartões',
        type: 'custom',
        description: 'Lê listas e cartões do Trello para conversão inteligente em To-Dos, Planos e Eventos.',
        executionMode: 'supervised',
        spokenConfirmation: 'Cartões do Trello sincronizados com sucesso!',
        fields: [
          {
            fieldId: 'boardId',
            label: 'ID do Quadro',
            type: 'text',
            selectors: ['input[name="board"]'],
            semanticKeywords: ['quadro', 'board', 'kanban'],
            description: 'Identificador do quadro Trello'
          },
          {
            fieldId: 'listId',
            label: 'ID da Lista',
            type: 'text',
            selectors: ['input[name="list"]'],
            semanticKeywords: ['lista', 'coluna', 'list'],
            description: 'Identificador da lista/coluna'
          }
        ]
      }
    ]
  },
  {
    id: 'google_classroom',
    name: 'Google Classroom',
    shortName: 'GClassroom',
    url: 'https://classroom.google.com/',
    matchUrl: 'classroom.google.com',
    icon: 'ti-brand-google',
    color: '#0f9d58',
    bg: '#e8f5e9',
    border: '#c8e6c9',
    category: 'LMS & Google Workspace',
    description: 'Sincronização de turmas e publicação direta de atividades via Google Classroom API.',
    isCustom: false,
    statusOverride: 'pending_approval',
    actions: []
  }
]

const STORAGE_KEY = 'teacher_custom_portals_v2'

/**
 * Retorna todos os portais cadastrados (padrão + customizados)
 */
export function getPortalProfiles(): PortalProfileDef[] {
  if (typeof window === 'undefined') return DEFAULT_PORTALS
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Garante que todos os portais padrão (incluindo Trello Workspace) estejam sempre presentes
        const defaultsMap = new Map(DEFAULT_PORTALS.map(p => [p.id, p]))
        const customOnly = parsed.filter((p: any) => p.isCustom)
        
        parsed.forEach((p: any) => {
          if (!p.isCustom && defaultsMap.has(p.id)) {
            defaultsMap.set(p.id, { ...defaultsMap.get(p.id)!, ...p })
          }
        })
        
        return [...Array.from(defaultsMap.values()), ...customOnly]
      }
    }
  } catch (e) {
    console.error('Erro ao ler perfis de portais:', e)
  }
  return DEFAULT_PORTALS
}


/**
 * Salva a lista completa de perfis de portais
 */
export function savePortalProfiles(profiles: PortalProfileDef[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
    window.dispatchEvent(new CustomEvent('teacher:portals_changed'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
  } catch (e) {
    console.error('Erro ao salvar perfis de portais:', e)
  }
}

/**
 * Adiciona ou atualiza um perfil de portal
 */
export function upsertPortalProfile(profile: PortalProfileDef): void {
  const all = getPortalProfiles()
  const idx = all.findIndex(p => p.id === profile.id)
  if (idx >= 0) {
    all[idx] = profile
  } else {
    all.push(profile)
  }
  savePortalProfiles(all)
}

/**
 * Remove um portal customizado
 */
export function deletePortalProfile(id: string): void {
  const all = getPortalProfiles().filter(p => p.id !== id)
  savePortalProfiles(all)
}

/**
 * Adiciona ou atualiza uma ação dentro de um portal
 */
export function upsertPortalAction(portalId: string, action: PortalActionDef): void {
  const all = getPortalProfiles()
  const portal = all.find(p => p.id === portalId)
  if (!portal) return

  const actionIdx = portal.actions.findIndex(a => a.id === action.id)
  if (actionIdx >= 0) {
    portal.actions[actionIdx] = action
  } else {
    portal.actions.push(action)
  }
  savePortalProfiles(all)
}

/**
 * Remove uma ação de um portal
 */
export function deletePortalAction(portalId: string, actionId: string): void {
  const all = getPortalProfiles()
  const portal = all.find(p => p.id === portalId)
  if (!portal) return

  portal.actions = portal.actions.filter(a => a.id !== actionId)
  savePortalProfiles(all)
}

/**
 * Restaura os portais para o padrão de fábrica
 */
export function resetDefaultPortals(): void {
  savePortalProfiles(DEFAULT_PORTALS)
}
