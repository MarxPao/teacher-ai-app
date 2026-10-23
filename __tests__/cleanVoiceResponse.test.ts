import { describe, it, expect } from 'vitest'
import {
  cleanVoiceResponse,
  isWhisperNoise,
  cleanAssistantPrefix,
  isPureStopCommand
} from '../lib/cleanVoiceResponse'

describe('cleanVoiceResponse (Padrão EVA)', () => {
  it('remove blocos <think> completos e incompletos', () => {
    const raw1 = '<think>O usuário está pedindo ajuda com notas.</think>Olá, professor! Como posso ajudar?'
    expect(cleanVoiceResponse(raw1)).toBe('Olá, professor! Como posso ajudar?')

    const raw2 = '<think>Pensando na melhor resposta...Aqui está a informação.'
    expect(cleanVoiceResponse(raw2)).toBe('')
  })

  it('remove monólogos reflexivos e checklists de pensamento', () => {
    const raw = 'O usuário está perguntando sobre faltas. 1. Verificar ferramentas: consultar faltas. Posso consultar as faltas para você.'
    expect(cleanVoiceResponse(raw)).toBe('Posso consultar as faltas para você.')
  })

  it('remove formatação markdown pesada para fala TTS suave', () => {
    const raw = '### Olá! Aqui está **Pedro** com nota `9.5` e [link](http://test).'
    expect(cleanVoiceResponse(raw)).toBe('Olá! Aqui está Pedro com nota 9.5 e link.')
  })

  it('extrai resposta limpa se houver prefixo de assistente', () => {
    const raw = 'Reflexão interna...\nRafinha: Claro, já estou preparando a sua prova!'
    expect(cleanVoiceResponse(raw)).toBe('Claro, já estou preparando a sua prova!')
  })
})

describe('isWhisperNoise & Filtros de Voz', () => {
  it('detecta ruídos curtos, silêncio e interjeições', () => {
    expect(isWhisperNoise('')).toBe(true)
    expect(isWhisperNoise('   ')).toBe(true)
    expect(isWhisperNoise('hmm')).toBe(true)
    expect(isWhisperNoise('uhm')).toBe(true)
    expect(isWhisperNoise('ops')).toBe(true)
    expect(isWhisperNoise('...')).toBe(true)
  })

  it('não filtra palavras ou saudações legítimas', () => {
    expect(isWhisperNoise('oi')).toBe(false)
    expect(isWhisperNoise('tudo bom')).toBe(false)
    expect(isWhisperNoise('lançar nota')).toBe(false)
  })

  it('detecta alucinações comuns do Whisper', () => {
    expect(isWhisperNoise('Obrigado por assistir!')).toBe(true)
    expect(isWhisperNoise('Inscreva-se no canal')).toBe(true)
    expect(isWhisperNoise('[Música]')).toBe(true)
    expect(isWhisperNoise('(silêncio)')).toBe(true)
  })
})

describe('cleanAssistantPrefix & Barge-In', () => {
  it('remove prefixo da assistente', () => {
    expect(cleanAssistantPrefix('Rafinha, lance a nota 8')).toBe('lance a nota 8')
    expect(cleanAssistantPrefix('eva: tudo bem?')).toBe('tudo bem?')
    expect(cleanAssistantPrefix('rafa! crie uma prova')).toBe('crie uma prova')
  })

  it('detecta comandos puros de interrupção / parada', () => {
    expect(isPureStopCommand('para')).toBe(true)
    expect(isPureStopCommand('pare por favor')).toBe(true)
    expect(isPureStopCommand('cancela')).toBe(true)
    expect(isPureStopCommand('silêncio')).toBe(true)
    expect(isPureStopCommand('para e crie uma prova')).toBe(false)
  })
})
