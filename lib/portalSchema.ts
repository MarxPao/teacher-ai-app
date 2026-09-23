/**
 * lib/portalSchema.ts
 * Contrato canônico único para o subsistema de portais escolares do Teacher AI.
 * Padroniza a representação de domínios, entidades e payloads entre extensão e web app.
 */

export type PortalDomain =
  | 'schedule'     // Horários, grade semanal, aulas
  | 'attendance'   // Chamada, faltas, presenças
  | 'grades'       // Notas, avaliações, boletim
  | 'diary'        // Diário de classe, conteúdo ministrado
  | 'messages'     // Recados, comunicados
  | 'roster';      // Lista de alunos, matrículas

export type PortalOperation =
  | 'navigate'     // Mudar de aba ou tela
  | 'read'         // Extrair dados da tela atual
  | 'stage_write'  // Preparar alteração com aprovação HITL
  | 'commit_write' // Executar mutação no DOM ou no App
  | 'rollback';    // Desfazer mutação recente

export interface UnifiedStudent {
  name: string;
  normalizedName: string;
  rollNumber?: string;
  classRef?: string;
  portalNativeId?: string;
}

export interface UnifiedGradeItem {
  studentName: string;
  normalizedName: string;
  score: number;
  maxScore?: number;
  assessmentName?: string;
  term?: string;
}

export interface UnifiedCalendarEvent {
  id?: string;
  title: string;
  normalizedTitle: string;
  date: string;          // YYYY-MM-DD
  startTime?: string;    // HH:mm
  endTime?: string;      // HH:mm
  classRef?: string;
  subject?: string;
  description?: string;
}

/**
 * Payload Único de Instrução / Ação de Portais
 */
export interface PortalActionPayload {
  domain: PortalDomain;
  operation: PortalOperation;
  target: 'portal' | 'app';
  navTarget?: string;
  subNavTarget?: string;
  classRef?: string;
  subject?: string;
  data?: {
    students?: UnifiedStudent[];
    grades?: UnifiedGradeItem[];
    events?: UnifiedCalendarEvent[];
    rawText?: string;
  };
  options?: {
    mode?: 'autonomous' | 'supervised';
    requiresApproval?: boolean;
    confidence?: number;
  };
}

/**
 * Resposta Canônica de Execução do Portal
 */
export interface PortalExecutionResult {
  ok: boolean;
  domain: PortalDomain;
  operation: PortalOperation;
  status:
    | 'success'
    | 'draft_completed_pending_submit'
    | 'no_matching_field'
    | 'element_not_found'
    | 'auth_timeout'
    | 'validation_error'
    | 'cancelled';
  message: string;
  data?: {
    tables?: Array<{ id?: string; headers: string[]; rows: string[][] }>;
    events?: UnifiedCalendarEvent[];
    students?: UnifiedStudent[];
    grades?: UnifiedGradeItem[];
  };
  verification?: {
    method: 'dom_readback' | 'transaction_snapshot' | 'storage_event';
    verified: boolean;
  };
  trace?: string[];
  errorDetail?: {
    code?: string;
    message?: string;
    selectorAttempted?: string;
  };
}
