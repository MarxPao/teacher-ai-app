/**
 * subjectProfile.ts — Interface genérica de "Perfil de Matéria"
 *
 * Substitui o conhecimento de domínio hardcoded de inglês (CEFR, ELT taxonomy,
 * Cambridge rubric, L1 errors) por um perfil plugável por disciplina.
 *
 * Como usar:
 *   import { getSubjectProfile } from '@/lib/subjectProfile'
 *   const profile = getSubjectProfile()  // lê da turma ativa ou settings
 *
 * Estratégia: ADDITIVE — inglês continua funcionando como default. Novos perfis
 * são adicionados ao lado sem remover nada que já funciona.
 */

// ─── Interfaces de Tipagem ────────────────────────────────────────────────────

export interface TaxonomySubcategory {
  id: string
  name: string
  bnccCodes?: string[]  // ex: ['EF07LP15', 'EF08LP20']
}

export interface TaxonomyDomain {
  id: string    // ex: 'grammar', 'algebra', 'leitura'
  name: string  // ex: 'Gramática', 'Álgebra', 'Leitura'
  icon?: string // ícone tabler (ex: 'ti-book-2')
  subcategories: TaxonomySubcategory[]
}

export interface LevelDescriptor {
  id: string          // ex: 'A1', '6ano', 'basico'
  label: string       // ex: 'A1 — Iniciante', '6º Ano (EF)'
  gatingRules?: string  // regras de complexidade para o prompt da prova
  wordLimits?: { min: number; max: number }  // para textos de leitura/redação
}

export interface LevelFramework {
  name: string              // ex: 'CEFR', 'Ano Escolar BNCC', 'Nível Customizado'
  levels: LevelDescriptor[]
}

export interface DistractorPattern {
  id: string
  pattern: string      // nome do erro diagnóstico
  examples: string[]   // 2-4 exemplos concretos
  pedagogicNote: string  // instrução para o gerador de distratores
  contrastsWith?: string[] // IDs de outros padrões com os quais é frequentemente confundido (Interleaving)
}


export interface EssayRubricCriterion {
  id: string
  name: string
  maxScore: number
  descriptors: Record<string, string>  // nível → descrição (ex: '5': 'Domínio pleno...')
}

export interface SubjectProfile {
  id: string          // 'english' | 'portuguese' | 'math' | ...
  name: string        // 'Língua Inglesa', 'Língua Portuguesa', 'Matemática'
  nameShort: string   // 'Inglês', 'LP', 'Mat.'
  examLanguage: 'pt-BR' | 'en'  // idioma padrão dos enunciados da prova

  taxonomy: TaxonomyDomain[]
  levelFramework: LevelFramework

  /** Padrões de erro diagnóstico para construção de distratores pedagógicos */
  distractorPatterns: DistractorPattern[]

  /** Rubrica para avaliação de produção textual/dissertativa (opcional) */
  essayRubric?: EssayRubricCriterion[]

  /**
   * Parágrafo curto (≤ 3 linhas) que descreve a especialidade da matéria
   * para injeção no system prompt da Rafinha.
   */
  agentSystemPromptSnippet: string

  /** Habilidades BNCC específicas desta matéria */
  bnccSkillIds?: string[]  // ex: ['EF06LP01', 'EF07LP15']
}

// ─── Registro Central de Perfis ───────────────────────────────────────────────

const _profileRegistry: Map<string, SubjectProfile> = new Map()

export function registerSubjectProfile(profile: SubjectProfile): void {
  _profileRegistry.set(profile.id, profile)
}

export function getSubjectProfileById(id: string): SubjectProfile | null {
  return _profileRegistry.get(id) || null
}

export function getAllSubjectProfiles(): SubjectProfile[] {
  return Array.from(_profileRegistry.values())
}

/**
 * Retorna o perfil ativo do professor, em ordem de prioridade:
 * 1. Turma/aluno selecionado no contexto (teacher_active_class_subject)
 * 2. Matéria padrão em Settings (teacher_settings.defaultSubject)
 * 3. Fallback: inglês (comportamento original preservado)
 */
export function getSubjectProfile(overrideId?: string): SubjectProfile {
  // Prioridade 1: override explícito (ex: seletor de matéria no módulo)
  if (overrideId) {
    const found = _profileRegistry.get(overrideId)
    if (found) return found
  }

  if (typeof window !== 'undefined') {
    // Prioridade 2: contexto da turma ativa
    try {
      const activeClass = localStorage.getItem('teacher_active_class_subject')
      if (activeClass) {
        const found = _profileRegistry.get(activeClass)
        if (found) return found
      }
    } catch {}

    // Prioridade 3: settings globais
    try {
      const settings = JSON.parse(localStorage.getItem('teacher_settings') || '{}')
      const defaultSubject = settings.defaultSubject
      if (defaultSubject) {
        const found = _profileRegistry.get(defaultSubject)
        if (found) return found
      }
    } catch {}
  }

  // Fallback: inglês (garante compatibilidade total com o comportamento atual)
  const english = _profileRegistry.get('english')
  if (english) return english

  // Safety net: perfil mínimo se o registro estiver vazio
  return {
    id: 'english',
    name: 'Língua Inglesa',
    nameShort: 'Inglês',
    examLanguage: 'en',
    taxonomy: [],
    levelFramework: { name: 'CEFR', levels: [] },
    distractorPatterns: [],
    agentSystemPromptSnippet: 'especialista em ensino de Língua Inglesa (ELT/Cambridge/BNCC)',
    bnccSkillIds: []
  }
}

/**
 * Retorna as seções de taxonomia em formato compatível com o ExamBuilder:
 * [{ key: 'Grammar', icon: 'ti-book-2', sub: 'Tenses, Syntax...' }]
 */
export function getExamSections(profile: SubjectProfile) {
  return profile.taxonomy.map(domain => ({
    key: domain.id,
    label: domain.name,
    icon: domain.icon || 'ti-list',
    sub: domain.subcategories.map(s => s.name).join(', ')
  }))
}

/**
 * Retorna os níveis de dificuldade/framework em formato compatível com o ExamBuilder:
 * ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
 */
export function getLevelIds(profile: SubjectProfile): string[] {
  return profile.levelFramework.levels.map(l => l.id)
}

/**
 * Retorna o bloco de gating rules para o nível selecionado
 */
export function getLevelGatingRule(profile: SubjectProfile, levelId: string): string {
  const level = profile.levelFramework.levels.find(l => l.id === levelId)
  if (!level?.gatingRules) return ''
  return `=== REGRAS DE NÍVEL — ${level.label} (${profile.levelFramework.name}) ===\n${level.gatingRules}`
}

/**
 * Retorna o bloco de distratores diagnósticos formatado para o prompt da prova
 */
export function getDistractorBlock(profile: SubjectProfile): string {
  if (!profile.distractorPatterns.length) return ''
  const lines = profile.distractorPatterns
    .slice(0, 8)  // limite para não inflar o prompt
    .map((d, i) => `${i + 1}. ${d.pattern}: ${d.examples.slice(0, 2).join(' / ')}`)
    .join('\n')
  return `=== DESIGN DIAGNÓSTICO DE DISTRATORES — ${profile.nameShort.toUpperCase()} ===\nCada alternativa incorreta DEVE representar um erro diagnóstico real e documentado:\n${lines}`
}
