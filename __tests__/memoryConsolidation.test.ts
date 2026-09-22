import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getAgeInDays,
  runNightlyConsolidation
} from '../lib/memoryConsolidation'
import { getCuratedTeacherProfile, saveCuratedTeacherProfile } from '../lib/curatedMemory'
import { LearnedFact } from '../lib/longTermMemory'
import { GET, POST } from '../app/api/agent/memory/consolidate/route'
import { NextRequest } from 'next/server'

describe('Memory Engine — Fase 4: Consolidação Noturna (Dream Phase) & Decaimento', () => {
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

  describe('1. Cálculo de Idade Temporal (getAgeInDays)', () => {
    it('calcula a diferença correta em dias', () => {
      const now = new Date('2026-09-22T12:00:00Z')
      const tenDaysAgo = '2026-09-12T12:00:00Z'
      const age = getAgeInDays(tenDaysAgo, now)
      expect(Math.round(age)).toBe(10)
    })
  })

  describe('2. Decaimento Temporal & Proteção de Núcleo Duro', () => {
    it('aplica decaimento de confiança em fatos inativos com baixo acesso', () => {
      const now = new Date('2026-09-22T12:00:00Z')
      const initialFacts: LearnedFact[] = [
        {
          id: 'fact_low_access',
          category: 'teacher_preference',
          fact: 'A professora prefere caneta azul para rubricar',
          confidence: 0.70,
          source: 'dialogue',
          status: 'ativo',
          scope: 'private',
          accessCount: 1,
          createdAt: '2026-09-01T12:00:00Z', // 21 dias atrás
          updatedAt: '2026-09-01T12:00:00Z'
        }
      ]

      saveCuratedTeacherProfile({ learnedFacts: initialFacts })

      const report = runNightlyConsolidation({ decayDaysThreshold: 14, dryRun: false }, now)
      expect(report.decayedCount).toBe(1)
      expect(report.activeFactsRemaining).toBe(1)

      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts[0].confidence).toBe(0.56) // 0.70 * 0.8
    })

    it('purga fatos cuja confiança residual cai abaixo do piso (pruneConfidenceFloor)', () => {
      const now = new Date('2026-09-22T12:00:00Z')
      const initialFacts: LearnedFact[] = [
        {
          id: 'fact_decay_to_death',
          category: 'teacher_preference',
          fact: 'Comentário passageiro sobre a janela da sala',
          confidence: 0.40,
          source: 'dialogue',
          status: 'ativo',
          scope: 'private',
          accessCount: 1,
          createdAt: '2026-08-20T12:00:00Z', // 33 dias atrás
          updatedAt: '2026-08-20T12:00:00Z'
        }
      ]

      saveCuratedTeacherProfile({ learnedFacts: initialFacts })

      const report = runNightlyConsolidation({ pruneConfidenceFloor: 0.35, dryRun: false }, now)
      expect(report.prunedCount).toBe(1)
      expect(report.activeFactsRemaining).toBe(0)

      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts.length).toBe(0)
    })

    it('imuniza fatos institucionais e de alta importância contra esquecimento', () => {
      const now = new Date('2026-09-22T12:00:00Z')
      const initialFacts: LearnedFact[] = [
        {
          id: 'fact_institutional',
          category: 'school_policy',
          fact: 'Regra do colégio: frequência mínima de 75%',
          confidence: 0.80,
          source: 'dialogue',
          status: 'ativo',
          scope: 'institutional', // Núcleo duro institucional
          accessCount: 0,
          createdAt: '2026-07-01T12:00:00Z', // Quase 3 meses
          updatedAt: '2026-07-01T12:00:00Z'
        },
        {
          id: 'fact_high_conf',
          category: 'grading_rigor',
          fact: 'Rigor pedagógico: tolerância zero com plágio',
          confidence: 0.95, // Núcleo duro alta confiança
          source: 'user_action',
          status: 'ativo',
          scope: 'private',
          accessCount: 0,
          createdAt: '2026-07-01T12:00:00Z',
          updatedAt: '2026-07-01T12:00:00Z'
        }
      ]

      saveCuratedTeacherProfile({ learnedFacts: initialFacts })

      const report = runNightlyConsolidation({ decayDaysThreshold: 14, dryRun: false }, now)
      expect(report.decayedCount).toBe(0)
      expect(report.prunedCount).toBe(0)
      expect(report.activeFactsRemaining).toBe(2)

      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts[0].confidence).toBe(0.80)
      expect(profile.learnedFacts[1].confidence).toBe(0.95)
    })
  })

  describe('3. Purga de Regras Superseded Antigas', () => {
    it('remove regras substituídas há mais de 30 dias e mantém as recentes', () => {
      const now = new Date('2026-09-22T12:00:00Z')
      const initialFacts: LearnedFact[] = [
        {
          id: 'fact_old_superseded',
          category: 'grading_rigor',
          fact: 'Regra antiga de 40 dias atrás',
          confidence: 0.8,
          source: 'dialogue',
          status: 'superseded',
          createdAt: '2026-08-10T12:00:00Z', // 43 dias
          updatedAt: '2026-08-10T12:00:00Z'
        },
        {
          id: 'fact_recent_superseded',
          category: 'grading_rigor',
          fact: 'Regra antiga substituída ontem',
          confidence: 0.8,
          source: 'dialogue',
          status: 'superseded',
          createdAt: '2026-09-21T12:00:00Z', // 1 dia
          updatedAt: '2026-09-21T12:00:00Z'
        }
      ]

      saveCuratedTeacherProfile({ learnedFacts: initialFacts })

      const report = runNightlyConsolidation({ maxSupersededAgeDays: 30, dryRun: false }, now)
      expect(report.supersededArchivedCount).toBe(1)

      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts.length).toBe(1)
      expect(profile.learnedFacts[0].id).toBe('fact_recent_superseded')
    })
  })

  describe('4. Fusão Semântica (Macro-Diretrizes)', () => {
    it('funde múltiplos fragmentos de estilo de comunicação em 1 macro-regra consolidada', () => {
      const now = new Date('2026-09-22T12:00:00Z')
      const initialFacts: LearnedFact[] = [
        {
          id: 'f1',
          category: 'communication_rule',
          fact: 'A professora prefere respostas curtas e diretas',
          confidence: 0.85,
          source: 'auto_reflection',
          status: 'ativo',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        },
        {
          id: 'f2',
          category: 'communication_rule',
          fact: 'A professora prefere feedbacks estruturados em tópicos',
          confidence: 0.85,
          source: 'auto_reflection',
          status: 'ativo',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        },
        {
          id: 'f3',
          category: 'communication_rule',
          fact: 'A professora prefere explicações concisas com exemplos práticos',
          confidence: 0.85,
          source: 'auto_reflection',
          status: 'ativo',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
      ]

      saveCuratedTeacherProfile({ learnedFacts: initialFacts })

      const report = runNightlyConsolidation({ dryRun: false }, now)
      expect(report.mergedCount).toBe(1)
      expect(report.activeFactsRemaining).toBe(1)

      const profile = getCuratedTeacherProfile()
      expect(profile.learnedFacts[0].fact).toContain('Diretriz Consolidada de Comunicação')
      expect(profile.learnedFacts[0].source).toBe('dream_consolidation')
    })
  })

  describe('5. Rota de API /api/agent/memory/consolidate', () => {
    it('GET: executa simulação dryRun via query param sem alterar estado', async () => {
      const initialFacts: LearnedFact[] = [
        {
          id: 'fact_sim',
          category: 'teacher_preference',
          fact: 'Fato de teste',
          confidence: 0.6,
          source: 'test',
          status: 'ativo',
          createdAt: '2026-09-01T12:00:00Z',
          updatedAt: '2026-09-01T12:00:00Z'
        }
      ]
      saveCuratedTeacherProfile({ learnedFacts: initialFacts })

      const req = new NextRequest('http://localhost:3000/api/agent/memory/consolidate?dryRun=true')
      const res = await GET(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.report.dryRun).toBe(true)
      expect(body.report.summary).toBeDefined()
    })

    it('POST: executa consolidação efetiva e retorna relatório', async () => {
      const initialFacts: LearnedFact[] = [
        {
          id: 'fact_post',
          category: 'teacher_preference',
          fact: 'Fato para consolidação',
          confidence: 0.85,
          source: 'test',
          status: 'ativo',
          createdAt: '2026-09-22T12:00:00Z',
          updatedAt: '2026-09-22T12:00:00Z'
        }
      ]
      saveCuratedTeacherProfile({ learnedFacts: initialFacts })

      const req = new NextRequest('http://localhost:3000/api/agent/memory/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false })
      })

      const res = await POST(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.report.dryRun).toBe(false)
      expect(body.report.activeFactsRemaining).toBe(1)
    })
  })
})
