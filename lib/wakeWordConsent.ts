/**
 * wakeWordConsent.ts — Gerenciamento de Consentimento Transparente para Escuta Contínua
 *
 * Garante que a ativação da escuta contínua ("Modo Alexa" / Wake Word) NUNCA ocorra de forma silenciosa.
 * O professor é informado explicitamente de que a Web Speech API envia pacotes de áudio
 * para os servidores do Google para transcrição enquanto a escuta contínua estiver ligada.
 */

export interface ContinuousListeningConsentStatus {
  consented: boolean
  consentedAt?: string
}

const CONSENT_STORAGE_KEY = 'teacher_wake_word_continuous_consent_v1'

export function getContinuousListeningConsent(): ContinuousListeningConsentStatus {
  if (typeof localStorage === 'undefined') return { consented: false }
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return { consented: false }
    return JSON.parse(raw)
  } catch {
    return { consented: false }
  }
}

export function setContinuousListeningConsent(consented: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: ContinuousListeningConsentStatus = {
      consented,
      consentedAt: new Date().toISOString()
    }
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:wake_consent_changed', { detail: payload }))
      window.dispatchEvent(new Event('storage'))
    }
  } catch {}
}

export function requiresContinuousListeningConsent(): boolean {
  const { consented } = getContinuousListeningConsent()
  return !consented
}
