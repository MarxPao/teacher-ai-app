/**
 * lib/portalNormalizer.ts
 * Módulo puro e centralizado de normalização para o ecossistema Teacher AI.
 * Elimina duplicações de lógica de strings, acentuação, nomes de alunos, notas e datas.
 */

export interface WeekdayMatch {
  name: string;
  key: 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';
}

export const COMMON_CURRICULUM_SUBJECTS = [
  'lingua inglesa', 'ingles', 'lingua portuguesa', 'portugues',
  'matematica', 'historia', 'geografia', 'ciencias', 'fisica',
  'quimica', 'biologia', 'artes', 'educacao fisica', 'filosofia', 'sociologia',
  'redacao', 'literatura', 'espanhol'
] as const;

export const ORDINAL_WORDS_MAP: Record<string, string> = {
  primeiro: '1',
  segundo: '2',
  terceiro: '3',
  quarto: '4',
  quinto: '5',
  sexto: '6',
  setimo: '7',
  oitavo: '8',
  nono: '9'
};

/**
 * Normaliza qualquer valor para string minúscula, sem acentos (NFD) e sem espaços excedentes.
 */
export function cleanNormalizeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Normaliza títulos de aulas, tarefas, módulos e abas de portais.
 */
export function normalizeTitle(title: unknown): string {
  return cleanNormalizeString(title);
}

/**
 * Normaliza o nome do aluno colapsando múltiplos espaços consecutivos.
 */
export function normalizeStudentName(name: unknown): string {
  return cleanNormalizeString(name).replace(/\s+/g, ' ');
}

/**
 * Verifica se um texto bruto da tela do portal contém o nome do estudante (com suporte a primeiro + último nome).
 */
export function matchStudentName(portalText: string, studentName: string): boolean {
  const normPortal = cleanNormalizeString(portalText);
  const normStudent = normalizeStudentName(studentName);

  if (!normStudent || !normPortal) return false;
  if (normPortal.includes(normStudent)) return true;

  const parts = normStudent.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    if (firstName.length >= 2 && lastName.length >= 2) {
      if (normPortal.includes(firstName) && normPortal.includes(lastName)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Guardião Pedagógico de Validação e Normalização de Notas.
 * Converte decimais (vírgula ou ponto), normaliza escala 0-100 para 0-10 e rejeita valores fora da faixa.
 */
export function normalizeGrade(grade: unknown): number | null {
  if (grade === null || grade === undefined || grade === '') return null;
  const rawNota = parseFloat(String(grade).replace(',', '.').trim());
  if (isNaN(rawNota)) return null;

  if (rawNota > 10 && rawNota <= 100) {
    return parseFloat((rawNota / 10).toFixed(1));
  }
  if (rawNota >= 0 && rawNota <= 10) {
    return parseFloat(rawNota.toFixed(1));
  }
  return null;
}

/**
 * Normaliza cabeçalhos de grade horária escolar brasileira para o dia da semana correspondente.
 * Descarta automaticamente falsos positivos com termos de tempo/período (ex: "1º horário", "2º tempo").
 */
export function normalizeBrazilianWeekday(headerText: unknown): WeekdayMatch | null {
  if (!headerText) return null;
  const raw = String(headerText).trim();
  if (raw.length > 35) return null;
  const norm = cleanNormalizeString(raw);

  // Descarta termos de tempo para evitar confusão com "1º horário" ou "2º período"
  if (/hor[aá]rio|tempo|per[ií]odo|aula|disciplina|turma|sala|prof/i.test(norm)) {
    return null;
  }

  if (/(?:^|\b)(?:2\s*[\u00AAªa](?:-?\s*feira)?|segunda(?:-feira)?|seg\b)/i.test(norm) ||
      /(?:^|\b)2\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '2ª-feira (Segunda)', key: 'segunda' };
  }
  if (/(?:^|\b)(?:3\s*[\u00AAªa](?:-?\s*feira)?|ter[çc]a(?:-feira)?|ter\b)/i.test(norm) ||
      /(?:^|\b)3\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '3ª-feira (Terça)', key: 'terca' };
  }
  if (/(?:^|\b)(?:4\s*[\u00AAªa](?:-?\s*feira)?|quarta(?:-feira)?|qua\b)/i.test(norm) ||
      /(?:^|\b)4\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '4ª-feira (Quarta)', key: 'quarta' };
  }
  if (/(?:^|\b)(?:5\s*[\u00AAªa](?:-?\s*feira)?|quinta(?:-feira)?|qui\b)/i.test(norm) ||
      /(?:^|\b)5\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '5ª-feira (Quinta)', key: 'quinta' };
  }
  if (/(?:^|\b)(?:6\s*[\u00AAªa](?:-?\s*feira)?|sexta(?:-feira)?|sex\b)/i.test(norm) ||
      /(?:^|\b)6\s*[\u00AAªa](?:-?\s*feira)?/i.test(raw)) {
    return { name: '6ª-feira (Sexta)', key: 'sexta' };
  }
  if (/(?:^|\b)(?:s[aá]bado|sab\b)/i.test(norm)) {
    return { name: 'Sábado', key: 'sabado' };
  }
  if (/(?:^|\b)(?:domingo|dom\b)/i.test(norm)) {
    return { name: 'Domingo', key: 'domingo' };
  }

  return null;
}

/**
 * Extrai dia da semana presente em um comando ou texto livre.
 */
export function extractWeekdayFromText(text: unknown): WeekdayMatch | null {
  if (!text) return null;
  const norm = cleanNormalizeString(text);

  if (/(?:2\s*[\u00AAªa](?:-?\s*feira)?|segunda(?:-feira)?)/i.test(norm)) return { name: '2ª-feira (Segunda)', key: 'segunda' };
  if (/(?:3\s*[\u00AAªa](?:-?\s*feira)?|ter[çc]a(?:-feira)?)/i.test(norm)) return { name: '3ª-feira (Terça)', key: 'terca' };
  if (/(?:4\s*[\u00AAªa](?:-?\s*feira)?|quarta(?:-feira)?)/i.test(norm)) return { name: '4ª-feira (Quarta)', key: 'quarta' };
  if (/(?:5\s*[\u00AAªa](?:-?\s*feira)?|quinta(?:-feira)?)/i.test(norm)) return { name: '5ª-feira (Quinta)', key: 'quinta' };
  if (/(?:6\s*[\u00AAªa](?:-?\s*feira)?|sexta(?:-feira)?)/i.test(norm)) return { name: '6ª-feira (Sexta)', key: 'sexta' };
  if (/s[aá]bado/i.test(norm)) return { name: 'Sábado', key: 'sabado' };
  if (/domingo/i.test(norm)) return { name: 'Domingo', key: 'domingo' };
  return null;
}

/**
 * Identifica uma disciplina curricular comum presente no texto ou título.
 */
export function identifyCurriculumSubject(text: unknown): string | null {
  const norm = cleanNormalizeString(text);
  if (!norm) return null;

  for (const subj of COMMON_CURRICULUM_SUBJECTS) {
    if (norm.includes(subj)) {
      return subj;
    }
  }
  return null;
}

/**
 * Gera variantes ordinais (ex: '6', '6º', 'sexto') para seleção de filtros em portais.
 */
export function generateOrdinalSearchVariants(term: unknown): string[] {
  const normTerm = cleanNormalizeString(term);
  if (!normTerm) return [];

  const searchVariants = [normTerm];
  for (const [word, num] of Object.entries(ORDINAL_WORDS_MAP)) {
    if (normTerm.includes(word)) {
      searchVariants.push(normTerm.replace(word, num));
      searchVariants.push(normTerm.replace(word, `${num}o`));
      searchVariants.push(normTerm.replace(word, `${num}º`));
      searchVariants.push(num);
      searchVariants.push(`${num}o`);
      searchVariants.push(`${num}º`);
    } else if (normTerm.includes(num)) {
      searchVariants.push(normTerm.replace(num, word));
      searchVariants.push(word);
    }
  }

  return Array.from(new Set(searchVariants.filter(Boolean)));
}
