import { describe, it, expect } from 'vitest'
import { formatInepCode, isValidInepCode } from '../lib/schoolUtils'

describe('Validação e Formatação de Código INEP (Modo B)', () => {
  it('valida códigos INEP válidos de 8 dígitos', () => {
    expect(isValidInepCode('12345678')).toBe(true)
    expect(isValidInepCode('35000123')).toBe(true)
    expect(isValidInepCode('35.000.123')).toBe(true)
  })

  it('rejeita códigos INEP inválidos (tamanho incorreto, letras ou vazio)', () => {
    expect(isValidInepCode('1234567')).toBe(false)
    expect(isValidInepCode('123456789')).toBe(false)
    expect(isValidInepCode('ABCDEFGH')).toBe(false)
    expect(isValidInepCode('')).toBe(false)
  })

  it('formata adequadamente código INEP para padrão numérico de 8 dígitos', () => {
    expect(formatInepCode('35.000.123')).toBe('35000123')
    expect(formatInepCode('  12345678  ')).toBe('12345678')
    expect(formatInepCode('inexistente')).toBe('')
  })
})
