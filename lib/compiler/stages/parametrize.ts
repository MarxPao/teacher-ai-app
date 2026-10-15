// lib/compiler/stages/parametrize.ts
// Parametrização simbólica de valores e declaração de parâmetros do SkillGraph v2

import type { ParamDefinition } from '../../contracts/skillgraph/graph'
import type { ValueRef, TextSpec } from '../../contracts/skillgraph/primitives'
import type { CompilerDecisions } from '../decisions'

export interface ParameterContext {
  params: Record<string, ParamDefinition>
  getFilterValueRef: () => ValueRef
  getFilterTextSpec: () => TextSpec
  getRowKeyRef: () => ValueRef
  getWriteValueRef: (taskId: string) => ValueRef
  isDateHeader: (header: string) => boolean
  getDateHeaderRef: () => ValueRef
}

const DATE_REGEX = /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/

export function createParameterContext(decisions: CompilerDecisions): ParameterContext {
  const params: Record<string, ParamDefinition> = {}

  // 1. Filtro de turma
  const hasFilter = decisions.class_filter && decisions.class_filter.mode !== 'none'
  const filterParamName = decisions.class_filter?.param_name || 'turma'

  if (hasFilter) {
    params[filterParamName] = {
      type: 'string',
      required: true,
      pii: false,
      description: 'Identificador ou nome da turma a ser acessada',
    }
  }

  // 2. Parâmetros específicos por tarefa
  if (decisions.task_id === 'lancar_falta' || decisions.attendance_polarity) {
    params['student_ref'] = {
      type: 'student_ref',
      required: true,
      pii: false,
      description: 'Identificador único do aluno (nome ou matrícula)',
    }
    params['attendance_status'] = {
      type: 'string',
      required: true,
      pii: false,
      description: 'Status de presença ou falta a ser lançado',
    }
    params['date'] = {
      type: 'date',
      required: false,
      pii: false,
      description: 'Data de referência para o lançamento de frequência',
    }
  } else if (decisions.task_id === 'lancar_nota' || decisions.grade_scale) {
    params['student_ref'] = {
      type: 'student_ref',
      required: true,
      pii: false,
      description: 'Identificador único do aluno (nome ou matrícula)',
    }
    params['grade_value'] = {
      type: 'number',
      required: true,
      pii: false,
      description: 'Valor numérico da nota a ser lançada',
    }
  } else if (decisions.task_id === 'read_roster') {
    // Apenas turma (já configurada acima)
  } else {
    // Habilidade genérica: texto livre (aula, mensagem, anotação)
    params['texto'] = {
      type: 'string',
      required: true,
      pii: false,
      description: 'Conteúdo textual a ser inserido no portal',
    }
  }

  return {
    params,
    getFilterValueRef: (): ValueRef => ({
      param: filterParamName,
    }),
    getFilterTextSpec: (): TextSpec => ({
      param: filterParamName,
    }),
    getRowKeyRef: (): ValueRef => ({
      param: 'student_ref',
    }),
    getWriteValueRef: (taskId: string): ValueRef => {
      if (taskId === 'lancar_falta' || decisions.attendance_polarity) {
        return { param: 'attendance_status' }
      }
      if (taskId === 'lancar_nota' || decisions.grade_scale) {
        return { param: 'grade_value' }
      }
      return { param: 'texto' }
    },
    isDateHeader: (header: string): boolean => {
      return DATE_REGEX.test(header)
    },
    getDateHeaderRef: (): ValueRef => ({
      param: 'date',
      transform: 'format_ddmm',
    }),
  }
}
