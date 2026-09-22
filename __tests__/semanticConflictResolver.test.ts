import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  evaluateLogicRelation,
  resolveSemanticCandidate,
  extractSemanticCandidatesFromDialogue
} from '../lib/semanticConflictResolver'
import { getCuratedTeacherProfile } from '../lib/curatedMemory'
import { getLongTermMemories } from '../lib/longTermMemory'

describe('Memory Engine — Fase 3: Motor de Resolução de Conflitos e Superseding', () => {
  let localStorageStore: Record<string, string> = {}

  beforeEach(() => {
    localStorageStore = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, val: string) => { localStorageStore[key] = String(val) },
      removeItem: (key: string) => { delete localStorageStore[key] },
      clear: () => { localStorageStore = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    })
  })

  describe('1. Classificação de Relações Lógicas (evaluateLogicRelation)', () => {
    it('detecta REDUNDANT para frases idênticas ou com alta sobreposição textual', () => {
      const rel1 = evaluateLogicRelation(
        'Sempre arredondar notas para cima',
        'Sempre arredondar notas para cima'
      )
      expect(rel1).toBe('REDUNDANT')

      const rel2 = evaluateLogicRelation(
        'Descontar meio ponto por erro gramatical grave',
        'Descontar 0,5 ponto por erro gramatical grave'
      )
      expect(['REDUNDANT', 'SUPERSEDE', 'CONTRADICTION']).toContain(rel2)
    })

    it('detecta SUPERSEDE quando gatilhos de revogação explícita são usados', () => {
      const existing = 'Avaliar redações com rigor alto de pontuação'
      const newFact = 'Mudei de ideia, agora prefiro avaliar redações com rigor brando'

      const rel = evaluateLogicRelation(existing, newFact)
      expect(rel).toBe('SUPERSEDE')
    })

    it('detecta CONTRADICTION quando afirmações opostas surgem sem gatilho de revogação', () => {
      const existing = 'Notas de avaliação devem ser sempre em número inteiro'
      const newFact = 'Notas de avaliação devem usar casas decimais'

      const rel = evaluateLogicRelation(existing, newFact)
      expect(rel).toBe('CONTRADICTION')
    })

    it('classifica como ADD quando se trata de tópicos diferentes ou complementares', () => {
      const existing = 'Dar tolerância de 5 minutos no início da aula'
      const newFact = 'Utilizar metodologia CLT para exercícios de conversação'

      const rel = evaluateLogicRelation(existing, newFact)
      expect(rel).toBe('ADD')
    })
  })

  describe('2. Pipeline de Resolução (resolveSemanticCandidate)', () => {
    it('caso ADD: cadastra fato novo com status ativo e versão inicial', () => {
      const res = resolveSemanticCandidate({
        category: 'teaching_style',
        factText: 'A professora gosta de iniciar com warm-up de 5 minutos',
        importanceScore: 0.9,
        scope: 'private'
      })

      expect(res.action).toBe('ADD')
      expect(res.newNodeId).toBeDefined()

      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts.length).toBe(1)
      expect(profile.learnedFacts[0].fact).toBe('A professora gosta de iniciar com warm-up de 5 minutos')
      expect(profile.learnedFacts[0].status).toBe('ativo')
      expect(profile.learnedFacts[0].accessCount).toBe(1)
    })

    it('caso REDUNDANT: reforça confiança e acessos do nó existente sem criar duplicata', () => {
      resolveSemanticCandidate({
        category: 'teaching_style',
        factText: 'A professora gosta de iniciar com warm-up de 5 minutos',
        confidence: 0.8
      })

      const res = resolveSemanticCandidate({
        category: 'teaching_style',
        factText: 'A professora gosta de iniciar com warm-up de 5 minutos'
      })

      expect(res.action).toBe('REDUNDANT')
      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts.length).toBe(1)
      expect(profile.learnedFacts[0].confidence).toBeGreaterThan(0.8)
      expect(profile.learnedFacts[0].accessCount).toBe(2)
    })

    it('caso SUPERSEDE: inativa fato antigo com supersededBy e cria nova versão com previousVersionId', () => {
      // 1. Regra antiga
      const res1 = resolveSemanticCandidate({
        category: 'grading_rigor',
        factText: 'Avaliar redações com rigor alto de pontuação',
        confidence: 0.85
      })

      const oldId = res1.newNodeId!

      // 2. Revogação explícita
      const res2 = resolveSemanticCandidate({
        category: 'grading_rigor',
        factText: 'A partir de agora quero avaliar redações com rigor brando',
        confidence: 0.9
      })

      expect(res2.action).toBe('SUPERSEDE')
      expect(res2.targetNodeId).toBe(oldId)
      expect(res2.newNodeId).toBeDefined()

      const facts = getLongTermMemories()
      const oldFact = facts.find(f => f.id === oldId)
      const newFact = facts.find(f => f.id === res2.newNodeId)

      expect(oldFact?.status).toBe('superseded')
      expect(oldFact?.supersededBy).toBe(res2.newNodeId)

      expect(newFact?.status).toBe('ativo')
      expect(newFact?.previousVersionId).toBe(oldId)
      expect(newFact?.fact).toContain('avaliar redações com rigor brando')
    })

    it('caso CONTRADICTION: marca ambos como conflitantes e gera clarificationPrompt para mediação humana', () => {
      // 1. Regra original
      const res1 = resolveSemanticCandidate({
        category: 'grading_rigor',
        factText: 'Notas de avaliação devem ser em número inteiro',
        confidence: 0.8
      })

      // 2. Afirmação oposta sem aviso de revogação
      const res2 = resolveSemanticCandidate({
        category: 'grading_rigor',
        factText: 'Notas de avaliação devem usar casas decimais',
        confidence: 0.8
      })

      expect(res2.action).toBe('CONTRADICTION')
      expect(res2.clarificationPrompt).toBeDefined()
      expect(res2.clarificationPrompt).toContain('divergência nas regras cadastradas')
      expect(res2.clarificationPrompt).toContain('Notas de avaliação devem ser em número inteiro')
      expect(res2.clarificationPrompt).toContain('Notas de avaliação devem usar casas decimais')

      const facts = getLongTermMemories()
      expect(facts.filter(f => f.status === 'conflitante').length).toBe(2)
    })
  })

  describe('3. Extração Automática de Diálogos (extractSemanticCandidatesFromDialogue)', () => {
    it('extrai candidatos de rigor de avaliação', () => {
      const candidates = extractSemanticCandidatesFromDialogue(
        'Rafinha, anote que prefiro descontar meio ponto por erro gramatical'
      )
      expect(candidates.length).toBe(1)
      expect(candidates[0].category).toBe('grading_rigor')
      expect(candidates[0].factText).toContain('descontar meio ponto por erro gramatical')
    })

    it('extrai candidatos institucionais de política escolar', () => {
      const candidates = extractSemanticCandidatesFromDialogue(
        'Lembre-se que a diretoria da escola exige frequência acima de 75%'
      )
      expect(candidates.length).toBe(1)
      expect(candidates[0].category).toBe('school_policy')
      expect(candidates[0].scope).toBe('institutional')
    })

    it('retorna array vazio para mensagens genéricas sem padrões pedagógicos', () => {
      const candidates = extractSemanticCandidatesFromDialogue('Olá Rafinha, tudo bem com você?')
      expect(candidates).toEqual([])
    })
  })
})
