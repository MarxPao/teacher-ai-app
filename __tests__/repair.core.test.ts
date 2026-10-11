// __tests__/repair.core.test.ts
// Testes de fronteira do núcleo puro de reparo e resiliência (sem DOM, sem rede, sem LLM)

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  normalizeText,
  extractTokens,
  computeTextSimilarity,
  extractSignals,
  computeElementScore,
  SemanticMatcher,
  PROPOSAL_THRESHOLD,
  PROPOSAL_MARGIN,
  createDriftSnapshot,
  validateSnapshotNoPii,
  generateRepairProposal,
  buildAnchorCandidatesFromDescriptor,
  applyPatch,
  diffGraphs,
  createInitialHealthMetrics,
  recordExecutionSuccess,
  recordExecutionFailure,
  recordSoftHeal,
  recordManualRepair,
  computeGraphHealthStatus,
  REPAIR_ERROR_CODES,
  type RepairPatch,
} from '../lib/repair'
import { PiiRegistry } from '../lib/recorder/registry'
import type { ElementDescriptor } from '../lib/recorder/traceSchema'
import { SkillGraphV2Schema, type SkillGraphV2 } from '../lib/contracts/skillgraph/graph'

function loadSyntheticGraph(version = 1): SkillGraphV2 {
  const p = path.join(__dirname, '../graphs/synthetic/lancar_nota.json')
  const g = JSON.parse(fs.readFileSync(p, 'utf8'))
  g.identity.version = version
  return SkillGraphV2Schema.parse(g)
}

describe('Núcleo Puro de Reparo e Semântica (Fase 5)', () => {
  // 1. Normalização e Tokenização
  it('1. normaliza textos removendo acentos, pontuação e stopwords', () => {
    const raw = 'Salvar as Presenças do Aluno!'
    const norm = normalizeText(raw)
    expect(norm).toBe('salvar as presencas do aluno')

    const tokens = extractTokens(raw)
    expect(tokens).toContain('salvar')
    expect(tokens).toContain('presencas')
    expect(tokens).toContain('aluno')
    expect(tokens).not.toContain('as')
    expect(tokens).not.toContain('do')
  })

  // 2. Similaridade Jaccard e Textual com Sinônimos
  it('2. calcula similaridade de texto determinística entre sinônimos', () => {
    const sim1 = computeTextSimilarity('Salvar Lançamento', 'Gravar Lançamento')
    expect(sim1).toBeGreaterThanOrEqual(0.60)

    const simExact = computeTextSimilarity('Confirmar', 'Confirmar')
    expect(simExact).toBe(1.0)

    const simDiferente = computeTextSimilarity('Cancelar Operação', 'Salvar Dados')
    expect(simDiferente).toBeLessThan(0.40)
  })

  // 3. Extratores de Sinais
  it('3. extrai sinais de correspondência estrutural e semântica', () => {
    const expected: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar',
      classes: ['btn', 'btn-primary'],
    }
    const observed: Partial<ElementDescriptor> = {
      tag: 'a',
      role: 'button',
      text: 'Gravar',
      classes: ['btn', 'btn-primary'],
    }

    const signals = extractSignals(expected, observed)
    expect(signals.roleMatch).toBe(1.0)
    expect(signals.tagMatch).toBe(0.7) // tag adaptada
    expect(signals.classMatch).toBe(1.0)
    expect(signals.textMatch).toBeGreaterThan(0.5)
  })

  // 4. Pontuação Ponderada
  it('4. calcula pontuação ponderada respeitando os pesos do design', () => {
    const expected: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar',
    }
    const observed: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar',
    }
    const scoring = computeElementScore(expected, observed)
    expect(scoring.totalScore).toBe(1.0)
    expect(scoring.penalties).toBe(0)
  })

  // 5. Penalidade para Elementos Ocultos (Honeypot)
  it('5. aplica penalidade severa para elementos ocultos e classes invisíveis', () => {
    const expected: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar Alterações',
    }
    const visibleObserved: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar Alterações',
      classes: ['btn-save'],
    }
    const hiddenObserved: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar Alterações',
      classes: ['btn-save', 'hidden', 'invisible'],
    }

    const scoreVisible = computeElementScore(expected, visibleObserved).totalScore
    const scoreHidden = computeElementScore(expected, hiddenObserved).totalScore

    expect(scoreVisible).toBeGreaterThan(0.90)
    expect(scoreHidden).toBeLessThan(scoreVisible - 0.40)
  })

  // 6. Detecção de Ambiguidade
  it('6. detecta ambiguidade quando dois botões têm scores muito próximos (margem < 0.10)', () => {
    const expected: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar Alterações',
    }
    const pool: ElementDescriptor[] = [
      {
        tag: 'button',
        role: 'button',
        text: 'Salvar Alterações',
        classes: ['btn-save'],
        candidates: [],
      },
      {
        tag: 'button',
        role: 'button',
        text: 'Salvar Alterações Rascunho',
        classes: ['btn-save'],
        candidates: [],
      },
    ]

    const match = SemanticMatcher.match(expected, pool, {
      marginThreshold: PROPOSAL_MARGIN,
    })
    expect(match.hasMatch).toBe(true)
    expect(match.topCandidates.length).toBeGreaterThanOrEqual(2)
  })

  // 7. Matcher Seleciona Melhor Candidato Válido
  it('7. seleciona candidato único acima do limiar sem ambiguidade', () => {
    const expected: Partial<ElementDescriptor> = {
      tag: 'button',
      role: 'button',
      text: 'Salvar Notas',
    }
    const pool: ElementDescriptor[] = [
      {
        tag: 'button',
        role: 'button',
        text: 'Gravar Notas',
        classes: ['btn-save'],
        candidates: [],
      },
      {
        tag: 'button',
        role: 'button',
        text: 'Voltar ao Menu',
        classes: ['btn-back'],
        candidates: [],
      },
    ]

    const match = SemanticMatcher.match(expected, pool)
    expect(match.hasMatch).toBe(true)
    expect(match.bestCandidate).toBeDefined()
    expect(match.bestCandidate?.descriptor.text).toBe('Gravar Notas')
    expect(match.bestCandidate?.score).toBeGreaterThanOrEqual(PROPOSAL_THRESHOLD)
  })

  // 8. Construção de Candidatos de Âncora
  it('8. constrói lista de candidatos de âncora a partir do descritor reparado', () => {
    const desc: ElementDescriptor = {
      tag: 'button',
      role: 'button',
      text: 'Confirmar Lançamento',
      aria_label: 'Confirmar lançamento de faltas',
      id: 'btn-confirmar',
      classes: ['btn-primary'],
      candidates: [],
    }

    const anchorCandidates = buildAnchorCandidatesFromDescriptor(desc)
    expect(anchorCandidates.length).toBeGreaterThanOrEqual(3)
    expect(anchorCandidates.some(c => c.strategy === 'role_name')).toBe(true)
    expect(anchorCandidates.some(c => c.strategy === 'aria_label')).toBe(true)
    expect(anchorCandidates.some(c => c.strategy === 'css')).toBe(true)
  })

  // 9. Snapshot Higienizado com PiiRegistry (Zero Vazamento)
  it('9. cria DriftSnapshot higienizado sem vazar CPF ou dados de alunos', () => {
    const registry = new PiiRegistry()
    registry.register('Carlos Alberto Souza', 'student_name_1')
    registry.register('123.456.789-00', 'cpf_1')

    const expected: Partial<ElementDescriptor> = {
      tag: 'button',
      text: 'Salvar Carlos Alberto Souza',
    }
    const observed: ElementDescriptor[] = [
      {
        tag: 'button',
        text: 'Gravar nota de Carlos Alberto Souza (123.456.789-00)',
        classes: [],
        candidates: [],
      },
    ]

    const snapshot = createDriftSnapshot({
      graphId: 'g1',
      graphVersion: 1,
      nodeId: 'n1',
      url: 'https://escola.edu.br/diario',
      expectedDescriptor: expected,
      observedPool: observed,
      registry,
    })

    expect(snapshot.piiScrubbed).toBe(true)
    const jsonStr = JSON.stringify(snapshot)
    expect(jsonStr).not.toContain('Carlos Alberto Souza')
    expect(jsonStr).not.toContain('123.456.789-00')
    expect(validateSnapshotNoPii(snapshot)).toBe(true)
  })

  // 10. Geração de Proposta a partir de Snapshot
  it('10. gera proposta de reparo válida com metadados para aprovação humana', () => {
    const snapshot = createDriftSnapshot({
      graphId: 'synthetic_portal',
      graphVersion: 1,
      nodeId: 'salvar_diario',
      url: 'https://escola.edu.br',
      expectedDescriptor: { tag: 'button', role: 'button', text: 'Salvar' },
      observedPool: [
        {
          tag: 'button',
          role: 'button',
          text: 'Gravar',
          id: 'btn-gravar',
          classes: ['btn-action'],
          candidates: [],
        },
      ],
    })

    const proposal = generateRepairProposal(snapshot)
    expect(proposal.status).toBe('pending')
    expect(proposal.baseVersion).toBe(1)
    expect(proposal.targetVersion).toBe(2)
    expect(proposal.topCandidates.length).toBe(1)
    expect(proposal.topCandidates[0].proposedAnchorCandidates.length).toBeGreaterThan(0)
  })

  // 11. Aplicação Imutável de Patch
  it('11. aplica patch de forma puramente imutável incrementando a versão do grafo', () => {
    const originalGraph = loadSyntheticGraph(1)
    const patch: RepairPatch = {
      proposalId: 'prop-123',
      graphId: 'synthetic_portal',
      baseVersion: 1,
      targetVersion: 2,
      modifiedNodes: {
        salvar_diario: {
          candidates: [
            { strategy: 'role_name', role: 'button', name: 'Gravar' },
            { strategy: 'css', selector: '#btn-gravar' },
          ],
        },
      },
    }

    const patchedGraph = applyPatch(originalGraph, patch)

    // Prova de imutabilidade: original NÃO foi alterado
    expect(originalGraph.identity.version).toBe(1)
    expect(originalGraph.provenance.has_self_healed).toBe(false)

    // Novo grafo tem versão incrementada e procedência atualizada
    expect(patchedGraph.identity.version).toBe(2)
    expect(patchedGraph.provenance.parent_version).toBe(1)
    expect(patchedGraph.provenance.has_self_healed).toBe(true)
  })

  // 12. Bloqueio de Patch Ilegal em Propriedades Restritas
  it('12. bloqueia tentativas de alterar propriedades restritas com E_REPAIR_FORBIDDEN_PATCH', () => {
    const originalGraph = loadSyntheticGraph(1)
    const illegalPatch: any = {
      proposalId: 'prop-hack',
      graphId: 'synthetic_portal',
      baseVersion: 1,
      targetVersion: 2,
      modifiedNodes: {
        salvar_diario: {
          allowed_hosts: ['malicious-site.com'],
        },
      },
    }

    expect(() => applyPatch(originalGraph, illegalPatch)).toThrow(
      REPAIR_ERROR_CODES.E_REPAIR_FORBIDDEN_PATCH
    )
  })

  // 13. Rejeição de Versão Base Obsoleta (Race Condition)
  it('13. rejeita patch com versão base defasada com E_REPAIR_STALE', () => {
    const currentGraph = loadSyntheticGraph(3)
    const stalePatch: RepairPatch = {
      proposalId: 'prop-stale',
      graphId: 'synthetic_portal',
      baseVersion: 1, // defasado
      targetVersion: 2,
      modifiedNodes: {
        salvar_diario: { candidates: [] },
      },
    }

    expect(() => applyPatch(currentGraph, stalePatch)).toThrow(
      REPAIR_ERROR_CODES.E_REPAIR_STALE
    )
  })

  // 14. Diff Estrutural entre Versões
  it('14. computa diff estrutural auditável entre duas versões de grafo', () => {
    const v1 = loadSyntheticGraph(1)
    const patch: RepairPatch = {
      proposalId: 'prop-123',
      graphId: 'synthetic_portal',
      baseVersion: 1,
      targetVersion: 2,
      modifiedNodes: {
        salvar_diario: {
          candidates: [{ strategy: 'role_name', role: 'button', name: 'Gravar' }],
        },
      },
    }
    const v2 = applyPatch(v1, patch)
    const diff = diffGraphs(v1, v2)

    expect(diff.oldVersion).toBe(1)
    expect(diff.newVersion).toBe(2)
    expect(diff.modifiedNodes.length).toBe(1)
    expect(diff.modifiedNodes[0].nodeId).toBe('salvar_diario')
    expect(diff.metadataChanges.hasSelfHealed).toBe(true)
    expect(diff.metadataChanges.parentVersion).toBe(1)
  })

  // 15. Reducer de Métricas de Saúde
  it('15. reduz métricas de saúde e deriva status healthy / degraded / broken', () => {
    let metrics = createInitialHealthMetrics('g_test')
    expect(metrics.status).toBe('healthy')

    // Sucessos mantêm saudável
    metrics = recordExecutionSuccess(metrics)
    metrics = recordExecutionSuccess(metrics)
    expect(metrics.status).toBe('healthy')

    // Soft heal degrada para aviso
    metrics = recordSoftHeal(metrics)
    expect(metrics.status).toBe('degraded')

    // Falhas acumuladas quebram a saúde
    metrics = recordExecutionFailure(metrics)
    metrics = recordExecutionFailure(metrics)
    metrics = recordExecutionFailure(metrics)
    expect(metrics.status).toBe('broken')

    // Reparo manual registrado
    metrics = recordManualRepair(metrics)
    expect(metrics.manualRepairsCount).toBe(1)
  })
})
