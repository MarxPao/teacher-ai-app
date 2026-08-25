'use client'

import { useState, useCallback, useRef } from 'react'

export interface StreamingOptions {
  onToken?: (token: string) => void
  onDone?: (full: string) => void
  onError?: (err: Error) => void
}

/**
 * Hook para geração de texto em streaming token-a-token (#28).
 * Wrappa executeUnifiedAiCall e simula streaming se a API não suportar natively.
 */
export function useStreamingGeneration() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const abortRef = useRef(false)

  const generate = useCallback(async (
    prompt: string,
    options: StreamingOptions = {}
  ) => {
    setIsStreaming(true)
    setStreamedText('')
    abortRef.current = false

    try {
      const { executeUnifiedAiCall, getAvailableApisForSelect } = await import('@/lib/autoApiSelector')
      const apis = getAvailableApisForSelect()
      const api = apis[0] || { id: 'auto', name: 'Auto', provider: 'auto', key: '', model: '', active: true }

      // Tenta streaming nativo primeiro
      let fullText = ''

      // Se a resposta suportar ReadableStream (Gemini/OpenAI streaming)
      try {
        const response = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, apiId: api.id }),
          signal: AbortSignal.timeout(30000),
        })

        if (response.ok && response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            if (abortRef.current) break
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            fullText += chunk
            setStreamedText(prev => prev + chunk)
            options.onToken?.(chunk)
          }

          options.onDone?.(fullText)
          return fullText
        }
      } catch {
        // Fallback: simulação de streaming com a resposta completa
      }

      // Fallback: obtém texto completo e simula streaming
      const fullResponse = await executeUnifiedAiCall(api, prompt)
      const words = fullResponse.split(' ')
      const CHUNK_SIZE = 3 // palavras por "token"
      const DELAY_MS = 25  // ms entre chunks

      for (let i = 0; i < words.length; i += CHUNK_SIZE) {
        if (abortRef.current) break
        const chunk = words.slice(i, i + CHUNK_SIZE).join(' ') + ' '
        fullText += chunk
        setStreamedText(prev => prev + chunk)
        options.onToken?.(chunk)
        await new Promise(r => setTimeout(r, DELAY_MS))
      }

      options.onDone?.(fullText.trim())
      return fullText.trim()
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      options.onError?.(error)
      throw error
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current = true
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    setStreamedText('')
    abortRef.current = false
  }, [])

  return { generate, abort, reset, isStreaming, streamedText }
}
