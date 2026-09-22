/**
 * classroomMemoryBridge.ts — Ponte Formal entre Classroom Analytics e Memory Engine
 *
 * REGRAS DE ARQUITETURA INVIOLÁVEIS:
 * 1. Proibido o uso de lib/studentMemory.ts (regex ingênuo e gravação direta em localStorage).
 * 2. Toda escrita originada de áudio de aula passa exclusivamente por lib/semanticConflictResolver.ts.
 * 3. Human-in-the-Loop Obrigatório: nenhuma inferência de gravação altera o dossiê do aluno
 *    sem aprovação prévia e deliberada do professor (if (!userApproved) return).
 * 4. Metadados canônicos: sourceType = 'inferred', sourceRef = 'class_session:...',
 *    tau_1/2 = 45 dias para student_fact e class_insight.
 */

import { resolveSemanticCandidate, SemanticCandidate } from '@/lib/semanticConflictResolver'
import {
  LearnedFact,
  TaskBindingModule,
  getTeacherMemoryFacts,
  sanitizeTaskBinding
} from '@/lib/longTermMemory'

export interface ClassroomHighlightMemoryCandidate {
  sessionId: string
  highlightId: string
  pedagogicalInsight: string
  title?: string
  schoolId: string
  targetStudentId?: string
  targetStudentName?: string
  confidence?: number
  operationalContext?: 'assessment' | 'planning' | 'general'
}

export interface BridgeExecutionResult {
  ok: boolean
  actionTaken: 'ADD' | 'SUPERSEDE' | 'REDUNDANT' | 'CONTRADICTION' | 'SKIPPED_UNAPPROVED'
  factId?: string
  message: string
}

/**
 * Converte um highlight pedagógico aprovado pelo professor em memória semântica do Memory Engine
 */
export async function bridgeClassroomHighlightToMemory(
  candidateInput: ClassroomHighlightMemoryCandidate,
  teacherId: string,
  userApproved: boolean
): Promise<BridgeExecutionResult> {
  // 1. Guardião Human-in-the-Loop
  if (!userApproved) {
    return {
      ok: false,
      actionTaken: 'SKIPPED_UNAPPROVED',
      message: 'Operação ignorada: aprovação explícita do professor é obrigatória para inferências acústicas.'
    }
  }

  if (!candidateInput.pedagogicalInsight || !candidateInput.sessionId) {
    return {
      ok: false,
      actionTaken: 'SKIPPED_UNAPPROVED',
      message: 'Dados insuficientes no candidato de highlight.'
    }
  }

  // 2. Mapeamento Contextual de taskBinding (Ponto 3 da revisão arquitetural)
  let taskBinding: TaskBindingModule = 'general'
  if (candidateInput.operationalContext === 'assessment') {
    taskBinding = 'omnigrader'
  } else if (candidateInput.operationalContext === 'planning' || !candidateInput.targetStudentId) {
    taskBinding = 'lesson_planner'
  }

  // 3. Estruturação do Candidato Canônico do Memory Engine
  const category = candidateInput.targetStudentId ? 'student_fact' : 'class_insight'
  const confidence = Math.min(1.0, Math.max(0.1, candidateInput.confidence || 0.85))

  const semanticCandidate: SemanticCandidate = {
    category,
    factText: candidateInput.pedagogicalInsight.trim(),
    confidence,
    importanceScore: confidence,
    source: `class_session:${candidateInput.sessionId}`,
    sourceType: 'inferred',
    sourceRef: `class_session:${candidateInput.sessionId}#highlight:${candidateInput.highlightId}`,
    taskBinding: sanitizeTaskBinding(taskBinding),
    schoolId: candidateInput.schoolId || undefined,
    studentId: candidateInput.targetStudentId || undefined,
    studentName: candidateInput.targetStudentName || undefined,
    scope: 'private'
  }

  // 4. Resolução contra memórias prévias do professor (4 quadrantes)
  const resolution = resolveSemanticCandidate(semanticCandidate)

  return {
    ok: true,
    actionTaken: resolution.action,
    factId: resolution.newNodeId || resolution.targetNodeId,
    message: `Insight de aula consolidado via Memory Engine (${resolution.action}).`
  }
}
