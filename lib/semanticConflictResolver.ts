/**
 * lib/semanticConflictResolver.ts — Motor de Resolução de Conflitos e Superseding (Memory Engine Fase 3)
 *
 * Implementa a Etapa 2 do Pipeline de Escrita:
 * 1. Compara candidatos contra fatos semânticos existentes.
 * 2. Classifica a relação lógica em: ADD | REDUNDANT | SUPERSEDE | CONTRADICTION.
 * 3. Mantém versionamento com ponteiros `previousVersionId` e `supersededBy`.
 * 4. Dispara mediação humana (Human-in-the-Loop) em contradições ambíguas.
 */

import {
  LearnedFact,
  getLongTermMemories
} from './longTermMemory'
import {
  getCuratedTeacherProfile,
  saveCuratedTeacherProfile
} from './curatedMemory'

export type ResolutionType = 'ADD' | 'REDUNDANT' | 'SUPERSEDE' | 'CONTRADICTION'

export interface SemanticCandidate {
  category: LearnedFact['category']
  factText: string
  importanceScore?: number
  confidence?: number
  scope?: 'private' | 'institutional'
  schoolId?: string
  source?: string
}

export interface ResolutionResult {
  action: ResolutionType
  targetNodeId?: string
  newNodeId?: string
  clarificationPrompt?: string
  details: string
}

// Termos indicativos de revogação explícita de preferências anteriores
const SUPERSEDING_TRIGGERS = [
  'mudei de ideia', 'mudei de opiniao', 'mudei de opinião',
  'agora quero', 'agora prefiro', 'ao inves de', 'ao invés de',
  'em vez de', 'nao mais', 'não mais', 'esqueça o anterior',
  'atualize a regra', 'a partir de agora', 'prefiro agora', 'mudei a regra'
]

/**
 * Avalia a relação lógica entre um fato semântico existente e uma nova afirmação
 */
export function evaluateLogicRelation(existingFact: string, newFact: string): ResolutionType {
  const normExisting = existingFact.toLowerCase().trim()
  const normNew = newFact.toLowerCase().trim()

  // 1. Identidade / Paráfrase direta
  if (normExisting === normNew) return 'REDUNDANT'

  const existingTokens = new Set(normExisting.replace(/[^a-z0-9áéíóúãõâêîôûç]/g, ' ').split(/\s+/).filter(t => t.length > 2))
  const newTokens = normNew.replace(/[^a-z0-9áéíóúãõâêîôûç]/g, ' ').split(/\s+/).filter(t => t.length > 2)

  let overlapCount = 0
  for (const token of newTokens) {
    if (existingTokens.has(token)) overlapCount++
  }

  const overlapRatio = overlapCount / Math.max(existingTokens.size, newTokens.length)

  // 2. Se a sobreposição for quase total (> 80%), é uma redundância
  if (overlapRatio > 0.80) return 'REDUNDANT'

  // 3. Avaliar se tratam do mesmo assunto/tópico (sobreposição moderada >= 30%)
  const isSameTopic = overlapRatio >= 0.30 ||
    (normExisting.includes('nota') && normNew.includes('nota')) ||
    (normExisting.includes('rigor') && normNew.includes('rigor')) ||
    (normExisting.includes('arredond') && normNew.includes('arredond')) ||
    (normExisting.includes('recreio') && normNew.includes('recreio')) ||
    (normExisting.includes('frequência') && normNew.includes('frequência'))

  if (!isSameTopic) {
    return 'ADD'
  }

  // 4. Verificar se há intenção expressa de revogação (Superseding)
  const hasRevocationTrigger = SUPERSEDING_TRIGGERS.some(trigger => normNew.includes(trigger))

  if (hasRevocationTrigger) {
    return 'SUPERSEDE'
  }

  // 5. Se tratam do mesmo tema com afirmações opostas sem revogação clara -> CONTRADICTION
  const opposingPairs = [
    ['inteiro', 'decimal'],
    ['inteiro', 'decimais'],
    ['alto', 'baixo'],
    ['alto', 'brando'],
    ['rigoroso', 'tolerante'],
    ['descontar', 'tolerar'],
    ['sempre', 'nunca'],
    ['obrigatório', 'opcional'],
    ['obrigatorio', 'opcional'],
    ['7.0', '6.0'],
    ['7,0', '6,0']
  ]

  const hasOpposingValues = opposingPairs.some(([valA, valB]) => {
    return (normExisting.includes(valA) && normNew.includes(valB)) ||
           (normExisting.includes(valB) && normNew.includes(valA))
  })

  if (hasOpposingValues) {
    return 'CONTRADICTION'
  }

  // Se for o mesmo tema com refinamento não contraditório, adiciona como complemento
  return 'ADD'
}

/**
 * Executa a resolução do candidato contra as memórias ativas
 */
export function resolveSemanticCandidate(candidate: SemanticCandidate): ResolutionResult {
  const profile = getCuratedTeacherProfile()
  const activeFacts = (profile.learnedFacts || []).filter(f => f.status !== 'superseded')

  // Buscar fatos da mesma categoria ou com overlap textual
  let bestMatch: LearnedFact | null = null
  let bestRelation: ResolutionType = 'ADD'

  for (const existing of activeFacts) {
    const relation = evaluateLogicRelation(existing.fact, candidate.factText)
    if (relation === 'REDUNDANT' || relation === 'SUPERSEDE' || relation === 'CONTRADICTION') {
      bestMatch = existing
      bestRelation = relation
      break
    }
  }

  const now = new Date().toISOString()

  // Caso 1: REDUNDANTE / PARÁFRASE
  if (bestRelation === 'REDUNDANT' && bestMatch) {
    const updatedFacts = profile.learnedFacts.map(f => {
      if (f.id === bestMatch!.id) {
        return {
          ...f,
          confidence: Math.min(1.0, (f.confidence || 0.8) + 0.05),
          accessCount: (f.accessCount || 0) + 1,
          lastAccessedAt: now,
          updatedAt: now
        }
      }
      return f
    })

    saveCuratedTeacherProfile({ learnedFacts: updatedFacts })
    return {
      action: 'REDUNDANT',
      targetNodeId: bestMatch.id,
      details: `Fato reforçado com sucesso (confiança aumentada): "${bestMatch.fact}"`
    }
  }

  // Caso 2: SUPERSEDE (Revogação de regra anterior)
  if (bestRelation === 'SUPERSEDE' && bestMatch) {
    const newId = `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const newFact: LearnedFact = {
      id: newId,
      category: candidate.category,
      fact: candidate.factText,
      confidence: candidate.confidence || candidate.importanceScore || 0.85,
      source: candidate.source || 'dialogue_supersede',
      status: 'ativo',
      previousVersionId: bestMatch.id,
      scope: candidate.scope || 'private',
      schoolId: candidate.schoolId,
      accessCount: 1,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now
    }

    const updatedFacts = profile.learnedFacts.map(f => {
      if (f.id === bestMatch!.id) {
        return {
          ...f,
          status: 'superseded' as const,
          supersededBy: newId,
          updatedAt: now
        }
      }
      return f
    })

    updatedFacts.unshift(newFact)
    saveCuratedTeacherProfile({ learnedFacts: updatedFacts })

    return {
      action: 'SUPERSEDE',
      targetNodeId: bestMatch.id,
      newNodeId: newId,
      details: `Regra anterior "${bestMatch.fact}" foi desativada e substituída por "${candidate.factText}".`
    }
  }

  // Caso 3: CONTRADIÇÃO (Ambiguidade requer mediação humana)
  if (bestRelation === 'CONTRADICTION' && bestMatch) {
    const newId = `fact_conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const conflictFact: LearnedFact = {
      id: newId,
      category: candidate.category,
      fact: candidate.factText,
      confidence: candidate.confidence || 0.6,
      source: candidate.source || 'dialogue_conflict',
      status: 'conflitante',
      conflictDetails: `Conflita diretamente com a regra anterior "${bestMatch.fact}"`,
      scope: candidate.scope || 'private',
      schoolId: candidate.schoolId,
      createdAt: now,
      updatedAt: now
    }

    const updatedFacts = profile.learnedFacts.map(f => {
      if (f.id === bestMatch!.id) {
        return {
          ...f,
          status: 'conflitante' as const,
          conflictDetails: `Conflita com a nova afirmação "${candidate.factText}"`,
          updatedAt: now
        }
      }
      return f
    })

    updatedFacts.unshift(conflictFact)
    saveCuratedTeacherProfile({ learnedFacts: updatedFacts })

    const clarificationPrompt = `Professora, notei uma divergência nas regras cadastradas:\n- Regra anterior: "${bestMatch.fact}"\n- Nova instrução: "${candidate.factText}"\nComo gostaria de padronizar essa diretriz a partir de agora?`

    return {
      action: 'CONTRADICTION',
      targetNodeId: bestMatch.id,
      newNodeId: newId,
      clarificationPrompt,
      details: `Conflito detectado entre "${bestMatch.fact}" e "${candidate.factText}". Marcado como conflitante para mediação.`
    }
  }

  // Caso 4: NOVO FATO (ADD)
  const newId = `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const newFact: LearnedFact = {
    id: newId,
    category: candidate.category,
    fact: candidate.factText,
    confidence: candidate.confidence || candidate.importanceScore || 0.8,
    source: candidate.source || 'dialogue',
    status: 'ativo',
    scope: candidate.scope || 'private',
    schoolId: candidate.schoolId,
    accessCount: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now
  }

  const updatedFacts = [newFact, ...(profile.learnedFacts || [])]
  saveCuratedTeacherProfile({ learnedFacts: updatedFacts })

  return {
    action: 'ADD',
    newNodeId: newId,
    details: `Novo fato cadastrado com sucesso: "${candidate.factText}".`
  }
}

/**
 * Extrai candidatos a fatos semânticos a partir de mensagens livres
 */
export function extractSemanticCandidatesFromDialogue(text: string): SemanticCandidate[] {
  if (!text || text.length < 10) return []

  const lower = text.toLowerCase()
  const candidates: SemanticCandidate[] = []

  // Padrão 1: Rigor e regras de avaliação
  if (/\b(descontar|tirar ponto|avaliar com rigor|nota máxima|arredondar|critério de nota|criterio de nota)\b/i.test(lower)) {
    candidates.push({
      category: 'grading_rigor',
      factText: text.replace(/^(rafinha,?|anote que|lembre-se que)\s*/i, '').trim(),
      confidence: 0.85,
      importanceScore: 0.85
    })
  }
  // Padrão 2: Regras escolares / institucionais
  else if (/\b(escola|colegio|colégio|diretoria|coordenação|coordenacao|politica escolar|política escolar)\b/i.test(lower)) {
    candidates.push({
      category: 'school_policy',
      factText: text.replace(/^(rafinha,?|anote que|lembre-se que)\s*/i, '').trim(),
      confidence: 0.90,
      importanceScore: 0.90,
      scope: 'institutional'
    })
  }
  // Padrão 3: Estilo de comunicação ou ensino
  else if (/\b(prefiro que você|gosto de|sempre responda|nunca use|fale de forma|meu estilo)\b/i.test(lower)) {
    candidates.push({
      category: 'communication_rule',
      factText: text.replace(/^(rafinha,?|anote que|lembre-se que)\s*/i, '').trim(),
      confidence: 0.80,
      importanceScore: 0.80
    })
  }

  return candidates
}
