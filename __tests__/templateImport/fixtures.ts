import JSZip from 'jszip'

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'

export const r = (t: string, o: { b?: boolean; i?: boolean; sz?: number; font?: string } = {}) =>
  `<w:r><w:rPr>${o.font ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}"/>` : ''}${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.sz ? `<w:sz w:val="${o.sz * 2}"/>` : ''}</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`
export const p = (runs: string, o: { jc?: string; num?: [number, number]; border?: 'bottom' | 'box'; style?: string; sp?: string; ind?: string } = {}) => {
  const bdr = o.border === 'bottom' ? '<w:pBdr><w:bottom w:val="single" w:sz="4"/></w:pBdr>'
    : o.border === 'box' ? '<w:pBdr><w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/><w:right w:val="single"/></w:pBdr>' : ''
  return `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.num ? `<w:numPr><w:ilvl w:val="${o.num[1]}"/><w:numId w:val="${o.num[0]}"/></w:numPr>` : ''}${bdr}${o.sp ? `<w:spacing ${o.sp}/>` : ''}${o.ind ? `<w:ind ${o.ind}/>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${runs}</w:p>`
}
export const tc = (content: string, o: { span?: number; vMerge?: 'restart' | 'continue' } = {}) =>
  `<w:tc><w:tcPr>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.vMerge ? `<w:vMerge${o.vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : ''}</w:tcPr>${content}</w:tc>`
export const tbl = (rows: string[], grid: number[], bordered = true) =>
  `<w:tbl><w:tblPr>${bordered ? '<w:tblBorders><w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/><w:right w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders>' : ''}</w:tblPr><w:tblGrid>${grid.map(g => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${rows.map(x => `<w:tr>${x}</w:tr>`).join('')}</w:tbl>`

export async function buildDocx(bodyXml: string, extra: { numbering?: string; font?: string; sz?: number } = {}): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850"/></w:sectPr></w:body></w:document>`)
  zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${extra.font || 'Calibri'}" w:hAnsi="${extra.font || 'Calibri'}"/><w:sz w:val="${(extra.sz || 11) * 2}"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"/></w:styles>`)
  if (extra.numbering) zip.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${NS}>${extra.numbering}</w:numbering>`)
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')
  return zip.generateAsync({ type: 'arraybuffer' })
}

export const decimalNumbering = (numId: number) =>
  `<w:abstractNum w:abstractNumId="${numId}"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl></w:abstractNum><w:num w:numId="${numId}"><w:abstractNumId w:val="${numId}"/></w:num>`

/** Prova estilo Machado Sobrinho (primeiro print) */
export async function machadoDocx() {
  const B = (t: string) => r(t, { b: true })
  const header = tbl([
    tc(p(B('MACHADO SOBRINHO'), { jc: 'center' }) + p(r('COLÉGIO MACHADO SOBRINHO — EDUCAÇÃO BÁSICA', { sz: 9 }), { jc: 'center' }), { span: 3 }),
    tc(p(B('DISCIPLINA: ') + r('Língua Inglesa'))) + tc(p(B('PROFESSOR(A): ') + r('Professor(a)'))) + tc(p(B('DATA: ') + r('24/10/2026'))),
    tc(p(B('TURMA / SÉRIE: ') + r('9º Ano A'))) + tc(p(B('ETAPA / TRIMESTRE: ') + r('1º Trimestre / Bimestre')), { span: 2 }),
    tc(p(B('ALUNO(A): ') + r('__________________________________________')), { span: 2 }) + tc(p(B('NOTA: ') + r('______ / 10,0'), { jc: 'center' })),
  ], [4000, 4500, 2900])
  const instr = tbl([tc(p(B('INSTRUÇÕES GERAIS:')) + p(r('1. Read all questions carefully before answering.')) + p(r('2. Use a blue or black pen.')) + p(r('3. Good luck!')))], [11400])
  const q = (n: string, stem: string, opts: string[]) =>
    p(B(`QUESTÃO ${n}`), { border: 'box' }) + p(r(stem)) + opts.map((o, i) => p(B(`${'ABCD'[i]})`) + r(` ${o}`))).join('')
  const body = header + instr +
    p(r('PROVA MODELO — MACHADO SOBRINHO', { b: true, sz: 12 }), { jc: 'center' }) +
    q('01', 'Read the excerpt below and select the alternative that correctly uses the Present Perfect in an academic context:', [
      'Scientists have discovered new sustainable materials this decade.', 'Scientists discovered new sustainable materials since 2020.',
      'Scientists has discover new materials yesterday.', 'Scientists are discover new materials every year.']) +
    q('02', 'In the sentence "The captain intends to travel next month", the false friend pretend in English means:', [
      'Planejar com antecedência.', 'Fingir ou simular uma situação.', 'Pretender ou ter a intenção real.', 'Prever um acontecimento futuro.'])
  return buildDocx(body, { font: 'Arial' })
}

/** Prova com V/F e abertas (segundo print), numeração automática do Word e linhas com borda */
export async function vfAbertasDocx() {
  const line = p('', { border: 'bottom' })
  const body =
    p(r('Escola Estadual Exemplo', { b: true }), { jc: 'center' }) +
    p(r('Name: ______________________________   Class: ________   Date: ___/___/___')) +
    p(r('However, this technological shift also brings new possibilities. While AI can handle repetitive tasks, it cannot easily replicate human creativity, emotional intelligence, or complex problem-solving. New roles are emerging too, such as AI trainers, prompt engineers, and AI-assisted healthcare specialists.')) +
    p(r('Now decide if the sentences are True or False – Write (T) or (F)', { b: true })) +
    p(r('( ) According to the text, AI is changing the job market in a similar way to previous technological changes.'), { num: [1, 0] }) +
    p(r('( ) Only repetitive office jobs like data entry are at risk of being affected by AI.'), { num: [1, 0] }) +
    p(r('( ) A report suggested that a significant number of jobs in the U.S. and Europe could be partially done by AI.'), { num: [1, 0] }) +
    p(r('( )The text says that AI will only eliminate jobs and will not create any new opportunities.'), { num: [1, 0] }) +
    p(r('( ) The text suggests that the best approach for young people is to compete directly with AI.'), { num: [1, 0] }) +
    p(r('Question 2 - Answer these questions about the text (2,0 marks)', { b: true })) +
    p(r('According to the beginning of the text, why are many young people worried about their future careers?'), { num: [2, 0] }) + line + line +
    p(r('What are two examples of jobs or tasks that are mentioned as being at risk from AI?'), { num: [2, 0] }) + line + line +
    p(r('What are two human skills that AI cannot easily replicate, according to the text?'), { num: [2, 0] }) + line + line +
    p(r('What are some of the new job roles that are appearing because of AI?'), { num: [2, 0] }) + line + line
  return buildDocx(body, { numbering: decimalNumbering(1) + decimalNumbering(2) })
}
