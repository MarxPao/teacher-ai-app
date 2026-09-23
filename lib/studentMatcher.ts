import Fuse from 'fuse.js'

export interface StudentMatchCandidate {
  id: string
  name: string
  class_name?: string
  className?: string
  school_name?: string
  schoolName?: string
  score?: number
  matricula?: string
  portal_native_id?: string
  rollNumber?: string
}

export type MatchResultStatus = 'exact' | 'confident_match' | 'ambiguous' | 'not_found'

export interface StudentMatchResult {
  status: MatchResultStatus
  student: StudentMatchCandidate | null
  candidates: StudentMatchCandidate[]
  confidence: number
  disambiguationPrompt?: string
}

/**
 * Remove acentos e normaliza para comparação sem ruído fonético
 */
export function normalizeStudentName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Resolve o aluno correto a partir de um nome digitado ou falado.
 * Implementa matching em 4 vias:
 * 1. Matrícula prioritária (portal_native_id)
 * 2. Nome exato (+ Turma se disponível)
 * 3. Substring / Token Overlap
 * 4. Primeiro Nome / Prefixo
 * NUNCA escolhe silenciosamente quando há ambiguidade.
 */
export function matchStudentByName(
  queryName: string,
  students: StudentMatchCandidate[],
  options?: {
    threshold?: number
    ambiguityDelta?: number
    matricula?: string
    class_ref?: string
  }
): StudentMatchResult {
  const qClean = normalizeStudentName(queryName)
  const cleanMat = String(options?.matricula || '').trim()

  if ((!qClean && !cleanMat) || !students || students.length === 0) {
    return {
      status: 'not_found',
      student: null,
      candidates: [],
      confidence: 0,
      disambiguationPrompt: 'Nenhum aluno encontrado na lista.'
    }
  }

  // 1. VIA 1: Match Direto por Matrícula / portal_native_id (Determinístico)
  if (cleanMat) {
    const matMatches = students.filter(s => {
      const sMat = String(s.matricula || s.portal_native_id || s.rollNumber || s.id || '').trim()
      return sMat && sMat === cleanMat
    })
    if (matMatches.length === 1) {
      return {
        status: 'exact',
        student: matMatches[0],
        candidates: matMatches,
        confidence: 1.0
      }
    }
  }

  // Match se queryName for a própria matrícula
  const directMatMatches = students.filter(s => {
    const sMat = String(s.matricula || s.portal_native_id || s.rollNumber || '').trim()
    return sMat && sMat.toLowerCase() === qClean
  })
  if (directMatMatches.length === 1) {
    return {
      status: 'exact',
      student: directMatMatches[0],
      candidates: directMatMatches,
      confidence: 1.0
    }
  }

  // 2. VIA 2: Verificação de correspondência exata por Nome
  const exactMatches = students.filter(s => normalizeStudentName(s.name) === qClean)
  if (exactMatches.length === 1) {
    return {
      status: 'exact',
      student: exactMatches[0],
      candidates: [exactMatches[0]],
      confidence: 1.0
    }
  }
  if (exactMatches.length > 1) {
    if (options?.class_ref) {
      const cleanCls = normalizeStudentName(options.class_ref)
      const classFiltered = exactMatches.filter(s => {
        const cls = normalizeStudentName(s.class_name || s.className || '')
        return cls.includes(cleanCls)
      })
      if (classFiltered.length === 1) {
        return {
          status: 'exact',
          student: classFiltered[0],
          candidates: classFiltered,
          confidence: 1.0
        }
      }
    }
    // Mesmo nome exato em turmas diferentes ou sem filtro! Exige desambiguação
    const candidates = exactMatches.map(s => ({ ...s, score: 0 }))
    const candidateLabels = candidates.map(s => `"${s.name}" (${s.class_name || s.className || 'Turma não especificada'})`).join(' ou ')
    return {
      status: 'ambiguous',
      student: null,
      candidates,
      confidence: 0.5,
      disambiguationPrompt: `Existem ${exactMatches.length} alunos com o mesmo nome: ${candidateLabels}. Por favor, informe a turma ou a escola para confirmar.`
    }
  }

  // 2. Busca Fuzzy com Fuse.js
  const preparedList = students.map(s => ({
    ...s,
    normalizedName: normalizeStudentName(s.name)
  }))

  const fuse = new Fuse(preparedList, {
    keys: ['normalizedName', 'name'],
    threshold: options?.threshold ?? 0.35, // Score de 0 (perfeito) a 1 (nenhuma correspondência)
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2
  })

  const results = fuse.search(qClean)

  if (results.length === 0) {
    return {
      status: 'not_found',
      student: null,
      candidates: [],
      confidence: 0,
      disambiguationPrompt: `Não encontrei nenhum aluno com nome similar a "${queryName}". Verifique a ortografia ou cadastre o aluno.`
    }
  }

  const best = results[0]
  const bestScore = best.score ?? 1.0 // 0 é melhor
  const ambiguityDelta = options?.ambiguityDelta ?? 0.18

  // Se houver mais de um resultado, avalia se há empate ou proximidade de score
  if (results.length > 1) {
    const second = results[1]
    const secondScore = second.score ?? 1.0
    const delta = secondScore - bestScore

    // Se o segundo colocado está muito próximo do primeiro (< ambiguityDelta), temos ambiguidade!
    if (delta < ambiguityDelta || (bestScore > 0.20 && secondScore < 0.40)) {
      const topCandidates = results.slice(0, 3).map(r => ({
        id: r.item.id,
        name: r.item.name,
        class_name: r.item.class_name || r.item.className,
        school_name: r.item.school_name || r.item.schoolName,
        score: r.score
      }))

      if (options?.class_ref) {
        const cleanCls = normalizeStudentName(options.class_ref)
        const classFiltered = topCandidates.filter(c => {
          const cls = normalizeStudentName(c.class_name || '')
          return cls.includes(cleanCls)
        })
        if (classFiltered.length === 1) {
          return {
            status: 'exact',
            student: classFiltered[0],
            candidates: classFiltered,
            confidence: 1.0
          }
        }
      }

      const candidateLabels = topCandidates
        .map(c => `"${c.name}"${c.class_name ? ` (${c.class_name})` : ''}`)
        .join(' ou ')

      return {
        status: 'ambiguous',
        student: null,
        candidates: topCandidates,
        confidence: Number((1 - bestScore).toFixed(2)),
        disambiguationPrompt: `Fiquei em dúvida entre alunos com nomes parecidos: ${candidateLabels}. Qual deles você gostaria de selecionar?`
      }
    }
  }

  // Se o score do melhor resultado for suficientemente confiável (< 0.35)
  if (bestScore <= 0.35) {
    const matchedStudent: StudentMatchCandidate = {
      id: best.item.id,
      name: best.item.name,
      class_name: best.item.class_name || best.item.className,
      school_name: best.item.school_name || best.item.schoolName,
      score: best.score
    }

    return {
      status: 'confident_match',
      student: matchedStudent,
      candidates: [matchedStudent],
      confidence: Number((1 - bestScore).toFixed(2))
    }
  }

  // Score muito fraco (> 0.35)
  return {
    status: 'not_found',
    student: null,
    candidates: results.slice(0, 2).map(r => ({ ...r.item, score: r.score })),
    confidence: Number((1 - bestScore).toFixed(2)),
    disambiguationPrompt: `Não tenho certeza sobre "${queryName}". Você se referia a "${best.item.name}"?`
  }
}
