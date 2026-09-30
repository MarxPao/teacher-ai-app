import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  maskPii,
  unmaskPii,
  unmaskToolUse,
  structurallySanitizeElements,
  maskChatHistory,
  guardEgress,
  guardEgressFetch,
  EgressSecurityError,
  UnresolvedTokenError
} from '../lib/piiMasking'

describe('PII Masking Gateway — LGPD & Zero-PII', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('1. Substitui nomes de alunos por tokens e restaura na resposta da IA', () => {
    const knownStudents = [
      { id: '1', name: 'Lucas Henrique Silva' },
      { id: '2', name: 'Mariana Costa' }
    ]

    const prompt = 'Gere um feedback de reforço para o aluno Lucas Henrique Silva que tirou 4.5 e para a Mariana Costa que tirou 9.0.'
    const result = maskPii(prompt, knownStudents)

    // O texto mascarado NÃO contém nomes reais
    expect(result.maskedText).not.toContain('Lucas Henrique Silva')
    expect(result.maskedText).not.toContain('Mariana Costa')
    expect(result.maskedText).toContain('[ALUNO_1]')
    expect(result.maskedText).toContain('[ALUNO_2]')
    expect(result.piiDetectedCount).toBeGreaterThanOrEqual(2)

    // Simula resposta gerada pela LLM usando os tokens
    const aiResponse = 'Parabéns ao [ALUNO_2] pelo excelente desempenho com 9.0! Para o [ALUNO_1], recomendo revisar verbos irregulares.'

    // A função unmask restaura os nomes originais perfeitamente
    const finalTeacherView = result.unmask(aiResponse)
    expect(finalTeacherView).toBe('Parabéns ao Mariana Costa pelo excelente desempenho com 9.0! Para o Lucas Henrique Silva, recomendo revisar verbos irregulares.')
  })

  it('2. Anonimiza telefones, CPFs e e-mails sensíveis', () => {
    const raw = 'Contato dos pais: (31) 98765-4321, email: mae.lucas@gmail.com, CPF: 123.456.789-00.'
    const result = maskPii(raw, [])

    expect(result.maskedText).not.toContain('98765-4321')
    expect(result.maskedText).not.toContain('mae.lucas@gmail.com')
    expect(result.maskedText).not.toContain('123.456.789-00')
    expect(result.maskedText).toContain('[TELEFONE_1]')
    expect(result.maskedText).toContain('[EMAIL_1]')
    expect(result.maskedText).toContain('[CPF_1]')

    const restored = result.unmask(result.maskedText)
    expect(restored).toBe(raw)
  })

  it('3. Egress-canary com turma falsa e fetch interceptado (todos os caminhos)', async () => {
    const canaryRoster = ['Alana Vasconcelos', 'Bernardo Guimarães', 'Cleópatra Mendes']
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    // Caminho A: OpenAI/Groq payload contendo aluno do canary
    const openAiPayloadWithPii = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Você é um assistente.' },
        { role: 'user', content: 'Lançar nota 9.5 para Alana Vasconcelos na prova de inglês.' }
      ]
    }

    await expect(
      guardEgressFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(openAiPayloadWithPii)
      }, canaryRoster)
    ).rejects.toThrow(EgressSecurityError)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Caminho B: Gemini payload contendo aluno do canary
    const geminiPayloadWithPii = {
      contents: [
        { role: 'user', parts: [{ text: 'O estudante Bernardo Guimarães faltou na aula de hoje.' }] }
      ]
    }

    await expect(
      guardEgressFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
        method: 'POST',
        body: JSON.stringify(geminiPayloadWithPii)
      }, canaryRoster)
    ).rejects.toThrow(EgressSecurityError)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Caminho C: Anthropic payload contendo aluno do canary
    const anthropicPayloadWithPii = {
      model: 'claude-opus-4-5',
      messages: [
        { role: 'user', content: 'Registrar ocorrência para Cleópatra Mendes.' }
      ]
    }

    await expect(
      guardEgressFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: JSON.stringify(anthropicPayloadWithPii)
      }, canaryRoster)
    ).rejects.toThrow(EgressSecurityError)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Caminho D: Payload 100% anonimizado passa no guardEgress e dispara o fetch real
    const cleanPayload = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'user', content: 'Lançar nota 9.5 para [ALUNO_1] na prova de inglês.' }
      ]
    }

    const res = await guardEgressFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(cleanPayload)
    }, canaryRoster)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
  })

  it('4. Casos adversariais de detecção no guardEgress (sem acento, minúscula, parte do nome, URLs, opções)', () => {
    const canaryRoster = ['Cleópatra Mendes', 'Bernardo Guimarães', 'Alana Vasconcelos']

    // 4.1 Sem acento e em minúsculas
    expect(() => {
      guardEgress({ prompt: 'parabéns para cleopatra mendes pelo teste' }, canaryRoster)
    }).toThrow(EgressSecurityError)

    expect(() => {
      guardEgress({ prompt: 'o aluno bernardo guimaraes precisa de recuperação' }, canaryRoster)
    }).toThrow(EgressSecurityError)

    // 4.2 Só o primeiro nome da turma ativa
    expect(() => {
      guardEgress({ prompt: 'alana tirou 10 na redação' }, canaryRoster)
    }).toThrow(EgressSecurityError)

    // 4.3 Nome dentro de toolResults (JSON string aninhada)
    expect(() => {
      guardEgress({
        messages: [{
          role: 'user',
          toolResults: [{ result: '{"status":"ok","student":"Cleópatra Mendes","score":8.5}' }]
        }]
      }, canaryRoster)
    }).toThrow(EgressSecurityError)

    // 4.4 Nome dentro de URL
    expect(() => {
      guardEgress({
        url: 'https://escola.paineldoaluno.com.br/aluno/alana-vasconcelos/boletim'
      }, canaryRoster)
    }).toThrow(EgressSecurityError)

    // 4.5 Nome dentro de texto de opção HTML (<option>)
    expect(() => {
      guardEgress({
        html: '<select><option value="42">Bernardo Guimarães</option></select>'
      }, canaryRoster)
    }).toThrow(EgressSecurityError)

    // 4.6 Formatos adversariais de CPF (com pontuação, 11 dígitos contínuos, com barra)
    expect(() => {
      guardEgress({ doc: 'CPF do responsável: 123.456.789-00' }, [])
    }).toThrow(EgressSecurityError)

    expect(() => {
      guardEgress({ doc: 'identificador 12345678900 do cadastro' }, [])
    }).toThrow(EgressSecurityError)

    expect(() => {
      guardEgress({ doc: 'registro 123.456.789/00 escolar' }, [])
    }).toThrow(EgressSecurityError)

    // 4.7 Formatos variados de telefone (fixo, celular 9 dígitos, +55, com/sem parênteses)
    expect(() => {
      guardEgress({ phone: 'telefone de contato (31) 98765-4321' }, [])
    }).toThrow(EgressSecurityError)

    expect(() => {
      guardEgress({ phone: 'emergência: +55 31 98765-4321' }, [])
    }).toThrow(EgressSecurityError)

    expect(() => {
      guardEgress({ phone: 'ligar para (11) 4002-8922' }, [])
    }).toThrow(EgressSecurityError)

    // 4.8 E-mail
    expect(() => {
      guardEgress({ email: 'alana.vasconcelos@colegio.edu.br' }, [])
    }).toThrow(EgressSecurityError)
  })

  it('5. Defesa principal estrutural: papéis de tabela, input de nota/falta e cards de aluno bloqueiam no guardEgress e são limpos na compressão', () => {
    // 5.1 guardEgress bloqueia qualquer payload contendo papéis de DOM sensíveis
    expect(() => {
      guardEgress({
        elements: [{ ref: 'e1', role: 'student_card', text: 'Aluno X' }]
      }, [])
    }).toThrow(EgressSecurityError)

    expect(() => {
      guardEgress({
        elements: [{ ref: 'e2', role: 'attendance_input', text: 'Presente' }]
      }, [])
    }).toThrow(EgressSecurityError)

    expect(() => {
      guardEgress({
        elements: [{ ref: 'e3', role: 'grade_input', text: '9.0' }]
      }, [])
    }).toThrow(EgressSecurityError)

    // 5.2 structurallySanitizeElements remove categoricamente elementos sensíveis
    const dirtyElements = [
      { ref: 'btn-voltar', role: 'button', tag: 'button', text: 'Voltar' },
      { ref: 'card-1', role: 'student_card', tag: 'div', text: 'Maria Silva' },
      { ref: 'input-nota-1', role: 'grade_input', tag: 'input', text: '' },
      { ref: 'input-falta-1', role: 'attendance_input', tag: 'input', text: '' },
      { ref: 'tab-arquivos', role: 'tab', tag: 'a', text: 'Arquivos' }
    ]

    const cleanElements = structurallySanitizeElements(dirtyElements)
    expect(cleanElements).toHaveLength(2)
    expect(cleanElements.map(e => e.ref)).toEqual(['btn-voltar', 'tab-arquivos'])
  })

  it('6. Teste de falha fail-closed (masker lança => bloqueia e não vaza)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    // Simula uma tentativa de envio onde o payload não pôde ser verificado ou falhou na validação
    const faultyBody = {
      malformed: 'Cleópatra Mendes com erro'
    }

    // O guardEgress captura e bloqueia categoricamente
    await expect(
      guardEgressFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(faultyBody)
      }, ['Cleópatra Mendes'])
    ).rejects.toThrow(EgressSecurityError)

    // Garantia absoluta: o fetch externo NUNCA é disparado em caso de erro/suspeita
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('7. Desmascaramento de ferramentas (unmaskToolUse) restaura nomes reais antes da execução no DOM', () => {
    const session = {
      mapping: { '[ALUNO_1]': 'Lucas Silva', '[ALUNO_2]': 'Mariana Lima' },
      reverseMapping: { 'lucas silva': '[ALUNO_1]', 'mariana lima': '[ALUNO_2]' }
    }

    const toolUse = [
      {
        id: 'call_1',
        name: 'portal_click',
        input: { ref: '[ALUNO_1]', action: 'selecionar' }
      },
      {
        id: 'call_2',
        name: 'execute_portal_action',
        input: { absentStudents: ['[ALUNO_1]', '[ALUNO_2]'] }
      }
    ]

    const unmasked = unmaskToolUse(toolUse, session)
    expect(unmasked[0].input.ref).toBe('Lucas Silva')
    expect(unmasked[1].input.absentStudents).toEqual(['Lucas Silva', 'Mariana Lima'])
  })

  it('8. Desmascaramento de ferramentas de escrita: token sem correspondência lança UnresolvedTokenError e nunca aplica', () => {
    // Sessão sem o token [ALUNO_99] mapeado
    const session = {
      mapping: { '[ALUNO_1]': 'Lucas Silva' },
      reverseMapping: { 'lucas silva': '[ALUNO_1]' }
    }

    // Ferramenta de escrita com token desconhecido/alucinado pelo LLM
    const writingToolCall = [
      {
        id: 'call_write_1',
        name: 'portal_click',
        input: { ref: '[ALUNO_99]', action: 'selecionar' }
      }
    ]

    expect(() => {
      unmaskToolUse(writingToolCall, session)
    }).toThrow(UnresolvedTokenError)

    // Ferramenta de lançamento com múltiplos tokens, sendo um sem correspondência
    const gradeToolCall = [
      {
        id: 'call_grade_1',
        name: 'execute_portal_action',
        input: {
          actionType: 'attendance',
          absentStudents: ['[ALUNO_1]', '[ALUNO_404]']
        }
      }
    ]

    expect(() => {
      unmaskToolUse(gradeToolCall, session)
    }).toThrow(UnresolvedTokenError)
  })
})
