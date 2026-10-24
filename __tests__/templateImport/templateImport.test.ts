// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseDocx } from '../../lib/templateImport/docxParser'
import { segmentDocument } from '../../lib/templateImport/segmenter'
import { renderExamHtml } from '../../lib/templateImport/render'
import { machadoDocx, vfAbertasDocx } from './fixtures'

describe('Machado Sobrinho (grade + múltipla escolha)', async () => {
  const ir = await parseDocx(await machadoDocx())
  const res = segmentDocument(ir, 'prova-machado.docx')
  const { template: t, content: c } = res
  it('cabeçalho em grade célula a célula', () => {
    expect(t.header?.kind).toBe('grid')
    expect(t.header?.bordered).toBe(true)
    const slots = t.header!.rows.map(r => r.flatMap(x => x.fields.map(f => f.slot)))
    expect(slots).toEqual([['school_name', 'school_subtitle'], ['subject', 'teacher', 'date'], ['class', 'term'], ['student_name', 'score']])
    expect(t.header!.rows[2][1].colSpan).toBe(2)
    const nota = t.header!.rows[3][1].fields[0]
    expect(nota).toMatchObject({ label: 'NOTA:', blank: true, suffix: '/ 10,0' })
    expect(t.schoolName).toBe('MACHADO SOBRINHO')
  })
  it('instruções em caixa, título e padrão de questão', () => {
    expect(t.instructions).toMatchObject({ boxed: true, items: ['Read all questions carefully before answering.', 'Use a blue or black pen.', 'Good luck!'] })
    expect(c.title).toBe('PROVA MODELO — MACHADO SOBRINHO')
    expect(t.question.headingTemplate).toBe('QUESTÃO {nn}')
    expect(t.question.headingBoxed).toBe(true)
    expect(t.question.optionLabel).toBe('A)')
    expect(t.body.fontFamily).toBe('Arial')
  })
  it('questões editáveis', () => {
    expect(c.groups).toHaveLength(2)
    expect(c.groups[0].items[0].kind).toBe('multiple_choice')
    expect(c.groups[0].items[0].options).toHaveLength(4)
    expect(c.groups[1].items[0].stem).toMatch(/false friend/)
    expect(res.confidence).toBeGreaterThan(0.9)
  })
  it('renderiza prova nova no mesmo layout', () => {
    const html = renderExamHtml(t, { title: 'AVALIAÇÃO 2', passages: [], groups: [{ items: [{ kind: 'multiple_choice', stem: 'Pick one', options: [{ letter: 'A', text: 'x' }, { letter: 'B', text: 'y' }] }] }] },
      { subject: 'Inglês', teacher: 'Caetano', date: '30/10/2026', class: '9º B', term: '2º Trimestre' })
    expect(html).toContain('DISCIPLINA:')
    expect(html).toContain('Caetano')
    expect(html).toContain('QUESTÃO 01')
    expect(html).toContain('colspan="2"')
    expect(html).not.toContain('Professor(a)</span>') // valor de exemplo não vaza
  })
})

describe('V/F + abertas (numeração automática, linhas com borda)', async () => {
  const ir = await parseDocx(await vfAbertasDocx())
  const { template: t, content: c, warnings } = segmentDocument(ir, 'teste-9ano.docx')
  it('cabeçalho em linhas', () => {
    expect(t.header?.kind).toBe('lines')
    const f = t.header!.rows.flat().flatMap(x => x.fields)
    expect(f.map(x => x.slot)).toEqual(['school_name', 'student_name', 'class', 'date'])
    expect(t.language).toBe('en')
  })
  it('V/F e abertas', () => {
    expect(c.passages[0]).toMatch(/technological shift/)
    expect(c.groups).toHaveLength(2)
    expect(c.groups[0].instruction).toMatch(/True or False/)
    expect(c.groups[0].items.map(i => i.kind)).toEqual(Array(5).fill('true_false'))
    expect(c.groups[0].items[3].stem).toMatch(/^The text says/)
    expect(c.groups[1]).toMatchObject({ number: 2, title: 'Answer these questions about the text', points: '2,0' })
    expect(c.groups[1].items.map(i => i.lines)).toEqual([2, 2, 2, 2])
    expect(t.question.headingTemplate).toBe('Question {n} - {title} ({points} marks)')
    expect(t.question.openLinesPerItem).toBe(2)
    expect(t.question.tfMarker).toBe('( )')
    expect(warnings.filter(w => w.code === 'NO_QUESTIONS')).toHaveLength(0)
  })
  it('renderiza com o padrão do modelo', () => {
    const html = renderExamHtml(t, { passages: [], groups: [{ number: 3, title: 'Write about AI', points: '1,5', items: [{ kind: 'open_ended', stem: 'Why?' }] }] })
    expect(html).toContain('Question 3 - Write about AI (1,5 marks)')
    expect((html.match(/class="line"/g) || []).length).toBe(2)
  })
})

import { visionPageToIR, VisionPageSchema } from '../../lib/templateImport/vision'
describe('imagem via visão → mesmo segmentador', () => {
  it('print do segundo modelo', () => {
    const page = VisionPageSchema.parse({ fontClass: 'sans', blocks: [
      { kind: 'paragraph', text: 'Now decide if the sentences are True or False – Write (T) or (F)', bold: true },
      ...['According to the text, AI is changing the job market.', 'Only repetitive office jobs are at risk.'].map((t, i) => ({ kind: 'paragraph', listLabel: `${i + 1}.`, text: `( ) ${t}` })),
      { kind: 'paragraph', text: 'Question 2 - Answer these questions about the text (2,0 marks)', bold: true },
      { kind: 'paragraph', listLabel: '1.', text: 'Why are many young people worried?' }, { kind: 'blank_lines', count: 2 },
      { kind: 'paragraph', listLabel: '2.', text: 'Two examples of jobs at risk?' }, { kind: 'blank_lines', count: 2 },
    ] })
    const { content: c, template: t } = segmentDocument(visionPageToIR([page], 'image'), 'print.png')
    expect(c.groups.map(g => g.items.map(i => i.kind))).toEqual([['true_false', 'true_false'], ['open_ended', 'open_ended']])
    expect(t.body.fontFamily).toBe('Arial')
    expect(t.question.headingTemplate).toBe('Question {n} - {title} ({points} marks)')
  })
})

import { buildDocx, p as P, r as R } from './fixtures'
describe('fidelidade de formatação', async () => {
  const T = 'Times New Roman'
  const body =
    P(R('Nome: ____________  Turma: _____  Data: ___')) +
    P(R('QUESTÃO 01', { b: true, sz: 12, font: T }), { sp: 'w:before="240" w:after="80"' }) +
    P(R('Leia e marque a correta:', { font: T, sz: 11 }), { sp: 'w:after="60" w:line="360" w:lineRule="auto"', jc: 'both' }) +
    P(R('a)', { b: true, font: T }) + R(' primeira', { i: true, font: T }), { ind: 'w:left="567" w:hanging="283"' }) +
    P(R('b)', { b: true, font: T }) + R(' segunda', { i: true, font: T }), { ind: 'w:left="567" w:hanging="283"' }) +
    P(R('QUESTÃO 02', { b: true, sz: 12, font: T }), { sp: 'w:before="240" w:after="80"' }) +
    P(R('Escolha:', { font: T })) +
    P(R('a) um\tb) dois\tc) três', { font: T }))
  const ir = await parseDocx(await buildDocx(body))
  const { template: t, content: c } = segmentDocument(ir, 'x.docx')
  it('captura fonte, negrito, espaçamento e recuo por papel', () => {
    expect(t.roles.questionHeading).toMatchObject({ bold: true, sizePt: 12, fontFamily: T, spaceBeforePt: 12, spaceAfterPt: 4 })
    expect(t.roles.stem).toMatchObject({ bold: false, fontFamily: T, spaceAfterPt: 3, lineMultiple: 1.5, align: 'justify' })
    expect(t.roles.optionLabel).toMatchObject({ bold: true })
    expect(t.roles.optionText).toMatchObject({ italic: true, indentMm: 10, firstLineMm: -5 })
    expect(t.question.optionLabel).toBe('a)')
  })
  it('alternativas na mesma linha', () => {
    expect(t.question.optionsInline).toBe(true)
    expect(c.groups[1].items[0].options?.map(o => o.text)).toEqual(['um', 'dois', 'três'])
  })
  it('renderiza com os estilos do modelo', () => {
    const html = renderExamHtml(t, { passages: [], groups: [{ number: 1, instruction: 'Nova pergunta', items: [{ kind: 'multiple_choice', stem: '', options: [{ letter: 'A', text: 'x' }, { letter: 'B', text: 'y' }] }] }] })
    expect(html).toMatch(/font-weight:700[^"]*font-size:12pt[^"]*margin-top:12pt/)
    expect(html).toContain('>a)</span>')
    expect(html).toMatch(/font-style:italic/)
    expect(html).toMatch(/line-height:1\.7/)
  })
})

import { compileQuestionsToHtml } from '../../lib/examSchema'
import { renderWithSchoolTemplate } from '../../lib/templateImport/exportBridge'
describe('exportação usa o modelo da escola', async () => {
  const { template: t } = segmentDocument(await parseDocx(await machadoDocx()), 'm.docx')
  it('questões geradas saem no padrão importado', () => {
    const gen = compileQuestionsToHtml([{ id: 'q1', stem: 'Choose the correct form', type: 'multiple_choice', options: [{ letter: 'A', text: 'has gone' }, { letter: 'B', text: 'have went' }] } as any])
    const out = renderWithSchoolTemplate(t, gen, { subject: 'Inglês', teacher: 'Caetano' })!
    expect(out).not.toBeNull()
    expect(out.headerHtml).toContain('PROFESSOR(A):')
    expect(out.headerHtml).toContain('Caetano')
    expect(out.bodyHtml).toContain('QUESTÃO 01')
    expect(out.bodyHtml).toContain('Choose the correct form')
    expect(out.bodyHtml).toContain('has gone')
    expect(out.bodyHtml).not.toContain('#8b5e3c')
  })
})
