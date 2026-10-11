// lib/repair/snapshot.ts
// Captura e higienização estrita de snapshots de drift sem PII

import type { DriftSnapshot } from './types'
import type { ElementDescriptor } from '../recorder/traceSchema'
import { PiiRegistry } from '../recorder/registry'
import { redactDescriptor } from '../recorder/redact'

export interface CreateSnapshotOptions {
  graphId: string
  graphVersion: number
  nodeId: string
  anchorId?: string
  url: string
  expectedDescriptor: Partial<ElementDescriptor>
  observedPool: ElementDescriptor[]
  registry?: PiiRegistry
}

export function createDriftSnapshot(options: CreateSnapshotOptions): DriftSnapshot {
  const reg = options.registry || new PiiRegistry()

  // 1. Redação do descritor esperado
  const redactedExpected = redactDescriptor(
    options.expectedDescriptor as ElementDescriptor,
    reg
  )

  // 2. Redação de cada elemento no pool observado
  const redactedPool = options.observedPool.map(el => redactDescriptor(el, reg))

  // 3. Montagem do snapshot auditável
  const snapshot: DriftSnapshot = {
    graphId: options.graphId,
    graphVersion: options.graphVersion,
    nodeId: options.nodeId,
    anchorId: options.anchorId,
    timestamp: new Date().toISOString(),
    url: options.url,
    expectedDescriptor: redactedExpected,
    observedPool: redactedPool,
    piiScrubbed: true,
  }

  return snapshot
}

export function validateSnapshotNoPii(snapshot: DriftSnapshot): boolean {
  if (!snapshot.piiScrubbed) return false

  const serialized = JSON.stringify(snapshot)
  // Checagem básica por padrões evidentes de CPF (11 dígitos ou formatado)
  const cpfRegex = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/
  if (cpfRegex.test(serialized)) {
    return false
  }

  return true
}
