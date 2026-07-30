'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioRecorder } from '@/lib/audioRecorder'

export interface WhisperFlowOptions {
  onFinalResult: (text: string, provider: string) => void
  onVolumeUpdate?: (volume: number) => void
  silenceVADMs?: number
}

export interface WhisperFlowReturn {
  isRecording: boolean
  isTranscribing: boolean
  error: string | null
  volume: number
  lastProvider: string
  durationMs: number
  startRecording: () => Promise<void>
  stopAndTranscribe: () => Promise<void>
  cancelRecording: () => void
  toggle: () => void
}

/**
 * useWhisperFlow — Motor de transcrição de voz estilo Wispr Flow para o TEACHER???
 *
 * Captura áudio Opus HD do microfone, envia para /api/transcribe (Groq Whisper ~150ms / OpenAI / Gemini),
 * realiza a limpeza de vícios de linguagem e retorna o texto formatado.
 */
export function useWhisperFlow(options: WhisperFlowOptions): WhisperFlowReturn {
  const { onFinalResult, onVolumeUpdate, silenceVADMs = 750 } = options

  const [isRecording,    setIsRecording]    = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [volume,         setVolume]         = useState(0)
  const [lastProvider,   setLastProvider]   = useState('')
  const [durationMs,     setDurationMs]     = useState(0)

  const recorderRef    = useRef<AudioRecorder | null>(null)
  const onFinalRef     = useRef(onFinalResult)
  const onVolRef       = useRef(onVolumeUpdate)
  const stopAndTranscribeRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => { onFinalRef.current = onFinalResult }, [onFinalResult])
  useEffect(() => { onVolRef.current   = onVolumeUpdate }, [onVolumeUpdate])

  const handleVolume = useCallback((vol: number) => {
    setVolume(vol)
    if (onVolRef.current) onVolRef.current(vol)
  }, [])

  const handleSilenceVAD = useCallback(() => {
    if (stopAndTranscribeRef.current) {
      stopAndTranscribeRef.current()
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return
    setError(null)

    try {
      const recorder = new AudioRecorder({
        onVolumeUpdate: handleVolume,
        onSilenceDetected: handleSilenceVAD,
        enableVAD: true,
        silenceThresholdMs: silenceVADMs,
      })
      recorderRef.current = recorder
      await recorder.start()
      setIsRecording(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao acessar microfone'
      setError(msg)
      setIsRecording(false)
    }
  }, [handleSilenceVAD, handleVolume, isRecording, isTranscribing, silenceVADMs])

  const stopAndTranscribe = useCallback(async () => {
    if (!recorderRef.current || !isRecording) return

    setIsRecording(false)
    setIsTranscribing(true)

    try {
      const audioBlob = await recorderRef.current.stop()
      recorderRef.current = null

      if (audioBlob.size < 1000) {
        setIsTranscribing(false)
        return
      }

      // Extrai vocabulário do localStorage (alunos, turmas)
      let contextTerms = ''
      try {
        const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
        const classes  = JSON.parse(localStorage.getItem('teacher_classes')  || '[]')
        const studentNames = students.map((s: { name: string }) => s.name).slice(0, 30).join(', ')
        const classNames   = classes.map((c: { name: string }) => c.name).slice(0, 10).join(', ')
        contextTerms = [studentNames, classNames].filter(Boolean).join(' | ')
      } catch {}

      const formData = new FormData()
      formData.append('file', audioBlob, 'voice.webm')
      if (contextTerms) formData.append('contextTerms', contextTerms)

      // Busca chaves customizadas se houver no localStorage
      const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
      const groqKey   = apis.find((a: { provider: string; key: string }) => a.provider === 'groq')?.key || ''
      const openaiKey = apis.find((a: { provider: string; key: string }) => a.provider === 'openai')?.key || ''

      const headers: Record<string, string> = {}
      if (groqKey)   headers['x-groq-key']   = groqKey
      if (openaiKey) headers['x-openai-key'] = openaiKey

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers,
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro na transcrição de áudio')
      }

      setLastProvider(data.provider || 'Wispr Flow Engine')
      setDurationMs(data.durationMs || 0)

      if (data.text) {
        onFinalRef.current(data.text, data.provider)
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na transcrição'
      console.warn('[useWhisperFlow] Error:', err)
      setError(msg)
    } finally {
      setIsTranscribing(false)
    }
  }, [isRecording])

  useEffect(() => {
    stopAndTranscribeRef.current = stopAndTranscribe
  }, [stopAndTranscribe])

  const cancelRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.cancel()
      recorderRef.current = null
    }
    setIsRecording(false)
    setIsTranscribing(false)
    setVolume(0)
  }, [])

  const toggle = useCallback(() => {
    if (isRecording) stopAndTranscribe()
    else startRecording()
  }, [isRecording, startRecording, stopAndTranscribe])

  return {
    isRecording,
    isTranscribing,
    error,
    volume,
    lastProvider,
    durationMs,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    toggle,
  }
}
