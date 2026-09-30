/**
 * @vitest-environment jsdom
 *
 * tests/select.spec.ts
 *
 * Suíte de testes unitários para a seleção estrita de campos do portal em jsdom.
 * Executada contra a fixture tests/fixtures/portal-form.html.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  resolveConceptToId,
  getValidFormSelects,
  findFormSelect,
  findOptionByMatch,
  applySelectOption,
  resolveAndSelectField,
  extractSignificantTokens,
  normalizeString,
  executeSlots,
  parseCommandToSlots,
  type SlotCommand
} from '../lib/portalSelect'

describe('Seleção de Campos do Portal (tests/select.spec.ts)', () => {
  beforeEach(() => {
    const fixturePath = path.resolve(__dirname, 'fixtures/portal-form.html')
    const html = fs.readFileSync(fixturePath, 'utf-8')
    document.body.innerHTML = html
  })

  it('1. Exclui de qualquer resolução de campo os <select> fora de <form> (ex.: #periodos)', () => {
    // #periodos existe fisicamente no documento, mas está fora de <form>
    const domPeriodos = document.querySelector('#periodos')
    expect(domPeriodos).not.toBeNull()
    expect(domPeriodos?.closest('form')).toBeNull()

    // getValidFormSelects deve ignorar #periodos e trazer apenas os selects internos do form
    const validSelects = getValidFormSelects(document)
    const validIds = validSelects.map(s => s.id)

    expect(validIds).not.toContain('periodos')
    expect(validIds).toEqual(['turma', 'divisao', 'disciplina', 'dia', 'ordem', 'ativos'])

    // findFormSelect deve rejeitar expressamente seletores fora de <form>
    const resolvedPeriodos = findFormSelect(document, '#periodos')
    expect(resolvedPeriodos).toBeNull()

    // Resolução de alto nível também deve rejeitar qualquer campo fora do form
    const res = resolveAndSelectField(document, 'periodos', '2026')
    expect(res.success).toBe(false)
  })

  it('2. Identifica opção por {selectId, index, text}; aplica e verifica por selectedIndex, nunca só por .value (values duplicados em #disciplina)', () => {
    const selectDisciplina = findFormSelect(document, '#disciplina')
    expect(selectDisciplina).not.toBeNull()

    // Prova da premissa: #disciplina contém values duplicados intencionais
    const opt6Ano = selectDisciplina!.options[3]
    const opt7Ano = selectDisciplina!.options[4]

    expect(opt6Ano.value).toBe('disc_ing')
    expect(opt7Ano.value).toBe('disc_ing')
    expect(opt6Ano.value).toBe(opt7Ano.value) // values IDÊNTICOS!

    // Se tentássemos aplicar por .value = 'disc_ing', o navegador selecionaria o índice 3 (6º Ano),
    // tornando impossível selecionar o 7º Ano por value.
    // Nossa implementação identifica a opção especificamente por { selectId, index, text }
    const match7Ano = findOptionByMatch(selectDisciplina!, 'Língua Inglesa 7º Ano Avançado')
    expect(match7Ano).not.toBeNull()
    expect(match7Ano).toEqual({
      selectId: 'disciplina',
      index: 4,
      text: 'Língua Inglesa - 7º Ano Avançado'
    })

    // Aplicação estrita por selectedIndex
    const applyResult = applySelectOption(selectDisciplina!, match7Ano!)
    expect(applyResult.success).toBe(true)
    expect(applyResult.selectedIndex).toBe(4)
    expect(applyResult.targetIndex).toBe(4)

    // Verificação de leitura de volta no DOM real do jsdom
    expect(selectDisciplina!.selectedIndex).toBe(4)
    expect(selectDisciplina!.options[selectDisciplina!.selectedIndex].text).toContain('7º Ano Avançado')

    // Aplica também para a outra disciplina de mesmo value para confirmar independência total
    const match6Ano = findOptionByMatch(selectDisciplina!, 'Língua Inglesa 6º Ano Regular')
    expect(match6Ano).toEqual({
      selectId: 'disciplina',
      index: 3,
      text: 'Língua Inglesa - 6º Ano Regular'
    })
    const apply6Result = applySelectOption(selectDisciplina!, match6Ano!)
    expect(apply6Result.success).toBe(true)
    expect(selectDisciplina!.selectedIndex).toBe(3)
  })

  it('3. Mapeia conceito → id por tabela fixa (turma→#turma, mês/bimestre/divisão→#divisao, disciplina→#disciplina, dia→#dia, ordem→#ordem, ativos→#ativos). Remove "geral": sem match retorna UnknownConcept', () => {
    // 3.1 Mapeamentos canônicos da tabela fixa
    expect(resolveConceptToId('turma')).toBe('#turma')
    expect(resolveConceptToId('mes')).toBe('#divisao')
    expect(resolveConceptToId('mês')).toBe('#divisao')
    expect(resolveConceptToId('bimestre')).toBe('#divisao')
    expect(resolveConceptToId('divisao')).toBe('#divisao')
    expect(resolveConceptToId('divisão')).toBe('#divisao')
    expect(resolveConceptToId('disciplina')).toBe('#disciplina')
    expect(resolveConceptToId('dia')).toBe('#dia')
    expect(resolveConceptToId('ordem')).toBe('#ordem')
    expect(resolveConceptToId('ativos')).toBe('#ativos')

    // 3.2 O conceito "geral" foi expressamente removido e retorna UnknownConcept
    expect(resolveConceptToId('geral')).toBe('UnknownConcept')
    expect(resolveConceptToId('GERAL')).toBe('UnknownConcept')

    // 3.3 Conceitos sem match retornam UnknownConcept
    expect(resolveConceptToId('ano_inexistente')).toBe('UnknownConcept')
    expect(resolveConceptToId('')).toBe('UnknownConcept')

    // 3.4 Comportamento na resolução integrada
    const unknownRes = resolveAndSelectField(document, 'geral', 'qualquer')
    expect(unknownRes.success).toBe(false)
    expect(unknownRes.error).toBe('UnknownConcept')

    // 3.5 Conceito válido resolve e seleciona
    const validRes = resolveAndSelectField(document, 'bimestre', '2º Bimestre')
    expect(validRes.success).toBe(true)
    expect(validRes.selectId).toBe('divisao')
    expect(validRes.appliedOption?.index).toBe(2)
  })

  it('4. Remove variantes de token único e o ramo "já está com X". Sucesso somente se selectedIndex lido de volta == índice pedido', () => {
    const selectTurma = findFormSelect(document, '#turma')!
    expect(selectTurma).not.toBeNull()

    // Garante estado inicial conhecido
    selectTurma.selectedIndex = 0

    // Seleciona Opção 1 (6º Ano A)
    const opt1 = { selectId: 'turma', index: 1, text: '6º Ano A - Fundamental II' }
    const res1 = applySelectOption(selectTurma, opt1)
    expect(res1.success).toBe(true)
    expect(res1.selectedIndex).toBe(1)
    expect(selectTurma.selectedIndex).toBe(1)

    // Ausência do ramo "já está com X": mesmo se chamado novamente para a mesma opção,
    // o fluxo não pula nem assume sucesso cego; ele define e valida a leitura de volta no DOM
    const resRepetido = applySelectOption(selectTurma, opt1)
    expect(resRepetido.success).toBe(true)
    expect(resRepetido.selectedIndex).toBe(1)

    // Se o índice pedido for inválido/fora dos limites, falha com erro estrito
    const resInvalido = applySelectOption(selectTurma, { selectId: 'turma', index: 99, text: 'Inexistente' })
    expect(resInvalido.success).toBe(false)
    expect(resInvalido.error).toBe('IndexOutOfBounds')

    // Prova de sucesso estrito: se selectedIndex for alterado ou forçado a não bater, não reporta sucesso falso
    const optMockMismatch = { selectId: 'turma', index: 2, text: '6º Ano B' }
    // Simulamos um elemento com getter travado ou falha de atribuição
    const selectComFalha = document.createElement('select')
    document.querySelector('form')!.appendChild(selectComFalha)
    selectComFalha.id = 'select_falho'
    selectComFalha.innerHTML = '<option value="1">Op 1</option><option value="2">Op 2</option>'
    // Força selectedIndex a ficar fixo em 0
    Object.defineProperty(selectComFalha, 'selectedIndex', {
      get: () => 0,
      set: () => { /* no-op simula falha no browser/DOM */ },
      configurable: true
    })

    const resMismatch = applySelectOption(selectComFalha, { selectId: 'select_falho', index: 1, text: 'Op 2' })
    expect(resMismatch.success).toBe(false)
    expect(resMismatch.error).toBe('SelectedIndexMismatch')
  })

  it('5. Casamento: normaliza acento/caixa e exige todos os tokens significativos', () => {
    const selectTurma = findFormSelect(document, '#turma')!
    expect(selectTurma).not.toBeNull()

    // 5.1 Normalização de acentos e caixa alta/baixa
    // "6º Ano A - Fundamental II" deve casar com queries em maiúsculas, sem acento, com "6o" ou "6"
    const matchCaseInsensitive = findOptionByMatch(selectTurma, '6O ANO A FUNDAMENTAL')
    expect(matchCaseInsensitive).not.toBeNull()
    expect(matchCaseInsensitive?.index).toBe(1)

    const matchComAcento = findOptionByMatch(selectTurma, '6º ano a fundamental')
    expect(matchComAcento).not.toBeNull()
    expect(matchComAcento?.index).toBe(1)

    // 5.2 Exigência de TODOS os tokens significativos
    // Se a query tiver um token significativo divergente, NÃO casa (evita falsos positivos de token único)
    const matchDivergente = findOptionByMatch(selectTurma, '6º Ano C Fundamental')
    expect(matchDivergente).toBeNull() // Não existe turma C!

    const matchTurmaErrada = findOptionByMatch(selectTurma, '8º Ano A')
    expect(matchTurmaErrada).toBeNull() // Não existe 8º Ano!

    // 5.3 Extração de tokens significativos descarta stopwords mas exige os termos-chave
    const tokens = extractSignificantTokens('Língua Portuguesa para o 6º Ano de Gramática')
    expect(tokens).toContain('lingua')
    expect(tokens).toContain('portuguesa')
    expect(tokens).toContain('6')
    expect(tokens).toContain('gramatica')
    expect(tokens).not.toContain('para')
    expect(tokens).not.toContain('o')
    expect(tokens).not.toContain('de')
  })

  it('6. Comando de 3 slots → 3 resultados, cada um com selectedIndex relido', () => {
    const rawCommand = 'setimo ano, ingles, ordem alfabetica'

    // 6.1 Extração/decomposição do comando em 3 slots conceituais
    const extractedSlots = parseCommandToSlots(rawCommand)
    expect(extractedSlots).toEqual([
      { concept: 'turma', query: 'setimo ano' },
      { concept: 'disciplina', query: 'ingles' },
      { concept: 'ordem', query: 'ordem alfabetica' }
    ])

    // 6.2 Prepara estado inicial nos selects para garantir verificação contra valor prévio
    const selectTurma = findFormSelect(document, '#turma')!
    const selectDisciplina = findFormSelect(document, '#disciplina')!
    const selectOrdem = findFormSelect(document, '#ordem')!

    expect(selectTurma).not.toBeNull()
    expect(selectDisciplina).not.toBeNull()
    expect(selectOrdem).not.toBeNull()

    selectTurma.selectedIndex = 0
    selectDisciplina.selectedIndex = 0
    selectOrdem.selectedIndex = 1 // Inicializa com 'matricula' (índice 1) para provar mudança

    // 6.3 Executa a sequência de 3 slots
    const results = executeSlots(document, extractedSlots)

    // 6.4 Valida que produziu exatamente 3 resultados
    expect(results).toHaveLength(3)

    // Slot 1: Turma -> "7º Ano A - Fundamental II" (índice 3 na fixture)
    expect(results[0].concept).toBe('turma')
    expect(results[0].selectId).toBe('turma')
    expect(results[0].success).toBe(true)
    expect(results[0].verified).toBe(true)
    expect(results[0].targetIndex).toBe(3)
    expect(results[0].selectedIndex).toBe(3)
    expect(selectTurma.selectedIndex).toBe(3) // Relido diretamente no elemento do DOM

    // Slot 2: Disciplina -> "Língua Inglesa - 6º Ano Regular" (índice 3 na fixture)
    expect(results[1].concept).toBe('disciplina')
    expect(results[1].selectId).toBe('disciplina')
    expect(results[1].success).toBe(true)
    expect(results[1].verified).toBe(true)
    expect(results[1].targetIndex).toBe(3)
    expect(results[1].selectedIndex).toBe(3)
    expect(selectDisciplina.selectedIndex).toBe(3) // Relido diretamente no elemento do DOM

    // Slot 3: Ordem -> "Ordem Alfabética" (índice 0 na fixture)
    expect(results[2].concept).toBe('ordem')
    expect(results[2].selectId).toBe('ordem')
    expect(results[2].success).toBe(true)
    expect(results[2].verified).toBe(true)
    expect(results[2].targetIndex).toBe(0)
    expect(results[2].selectedIndex).toBe(0)
    expect(selectOrdem.selectedIndex).toBe(0) // Relido diretamente no elemento do DOM
  })
})

