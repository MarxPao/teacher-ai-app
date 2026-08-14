import { describe, it, expect } from 'vitest'
import { DEFAULT_APIS, API_GUIDE, ELEVEN_VOICES } from '../components/modules/api-manager/types'

describe('ApiManager Modular Data Test', () => {
  it('contains expected DEFAULT_APIS providers', () => {
    expect(DEFAULT_APIS.length).toBeGreaterThan(5)
    const providers = DEFAULT_APIS.map(a => a.provider)
    expect(providers).toContain('groq')
    expect(providers).toContain('gemini')
    expect(providers).toContain('openai')
    expect(providers).toContain('elevenlabs')
  })

  it('contains valid API_GUIDE items with step by step instructions', () => {
    expect(API_GUIDE.length).toBeGreaterThan(0)
    API_GUIDE.forEach(guide => {
      expect(guide.id).toBeDefined()
      expect(guide.label).toBeDefined()
      expect(guide.steps.length).toBeGreaterThan(0)
    })
  })

  it('has brazilian Portuguese voices in ELEVEN_VOICES', () => {
    expect(ELEVEN_VOICES.length).toBeGreaterThan(0)
    const voiceNames = ELEVEN_VOICES.map(v => v.name)
    expect(voiceNames.some(n => n.includes('Elli') || n.includes('Bella'))).toBe(true)
  })
})
