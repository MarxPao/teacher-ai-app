import { describe, it, expect, beforeEach } from 'vitest'
import {
  isCloudVoiceTestEnabled,
  setCloudVoiceTestEnabled,
  guardCloudVoiceEgress,
  spokenText,
  CloudVoiceSecurityError,
  CANARY_STUDENT_NAMES,
} from '../lib/cloudVoiceGuard'

describe('CloudVoiceGuard — Segurança e Governança de Voz em Nuvem', () => {
  beforeEach(() => {
    // Garante que a flag inicie DESLIGADA por padrão
    setCloudVoiceTestEnabled(false)
  })

  it('1. Roster canário + flag desligada => bloqueia chamada de voz em nuvem', () => {
    expect(isCloudVoiceTestEnabled()).toBe(false)

    const canaryRoster = [{ name: 'Bernardo Silva' }, { name: 'Carolina Souza' }]
    const text = 'Nota lançada para o aluno com sucesso.'

    expect(() => guardCloudVoiceEgress(text, canaryRoster)).toThrowError(CloudVoiceSecurityError)
    expect(() => guardCloudVoiceEgress(text, canaryRoster)).toThrow(
      /Voz em nuvem bloqueada: O modo de teste de voz em nuvem está desligado/
    )
  })

  it('2. Roster com nome real + flag ligada => bloqueia categoricamente', () => {
    setCloudVoiceTestEnabled(true)
    expect(isCloudVoiceTestEnabled()).toBe(true)

    // Roster contendo aluno real (fora da lista canário)
    const realRoster = [{ name: 'Enzo Gabriel Fagundes' }, { name: 'Valentina da Silva' }]
    const text = 'Nota lançada para o aluno com sucesso.'

    expect(() => guardCloudVoiceEgress(text, realRoster)).toThrowError(CloudVoiceSecurityError)
    expect(() => guardCloudVoiceEgress(text, realRoster)).toThrow(
      /Voz em nuvem bloqueada: Detectado roster de alunos reais/
    )
  })

  it('3. Roster canário + flag ligada, mas texto contém nome nominal => bloqueia vazamento de PII', () => {
    setCloudVoiceTestEnabled(true)

    const canaryRoster = [{ name: 'Pedro Santos' }]
    const textWithRealName = 'Lancei a nota 9 para o Pedro Santos.'

    expect(() => guardCloudVoiceEgress(textWithRealName, canaryRoster)).toThrowError(CloudVoiceSecurityError)
    expect(() => guardCloudVoiceEgress(textWithRealName, canaryRoster)).toThrow(
      /Texto contém nomes de alunos \(Pedro Santos/
    )
  })

  it('4. spokenText(display, roster) NUNCA contém o nome do roster e protege a voz', () => {
    const canaryRoster = [
      { name: 'Pedro Santos' },
      { name: 'Carolina Souza' },
      { name: 'Bernardo Silva' },
    ]

    const displayText = 'Lançamento de nota 9.5 para Pedro Santos e presença para Carolina Souza.'
    const sanitizedAudioText = spokenText(displayText, canaryRoster)

    // Verifica que nenhum nome nominal existe no texto a ser falado
    expect(sanitizedAudioText).not.toContain('Pedro')
    expect(sanitizedAudioText).not.toContain('Santos')
    expect(sanitizedAudioText).not.toContain('Carolina')
    expect(sanitizedAudioText).not.toContain('Souza')

    // Verifica substituição por pronomes genéricos
    expect(sanitizedAudioText).toContain('o aluno')
    expect(sanitizedAudioText).toContain('a aluna')

    // Com o texto sanitizado via spokenText, a guarda de egress autoriza
    setCloudVoiceTestEnabled(true)
    expect(() => guardCloudVoiceEgress(sanitizedAudioText, canaryRoster)).not.toThrow()
  })

  it('5. spokenText funciona com nomes canários e femininos/masculinos', () => {
    const roster = [
      { name: 'Mariana Lima' },
      { name: 'Daniel Oliveira' }
    ]

    const text = 'Parabéns para Mariana Lima pelo trabalho, e falta para Daniel.'
    const speech = spokenText(text, roster)

    expect(speech).toBe('Parabéns para a aluna pelo trabalho, e falta para o aluno.')
    expect(speech).not.toContain('Mariana')
    expect(speech).not.toContain('Daniel')
  })
})
