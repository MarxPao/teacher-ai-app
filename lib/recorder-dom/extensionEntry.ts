// lib/recorder-dom/extensionEntry.ts
// Entrypoint do Gravador de Demonstrações DOM para a extensão Chrome MV3

import { DomRecorder } from './recorderCore'
import type { Trace } from '../recorder/traceSchema'

declare const chrome: any

declare global {
  interface Window {
    __TEACHER_AI_RECORDING_ACTIVE__?: boolean
    __TEACHER_AI_STOP_RECORDING__?: () => Trace | null
    __TEACHER_AI_TASK_ID__?: string
    __TEACHER_AI_DOM_RECORDER__?: DomRecorder
  }
}

;(function () {
  if (window.__TEACHER_AI_RECORDING_ACTIVE__) {
    console.log('[TeacherAI Recorder] Gravação já ativa nesta página.')
    return
  }

  window.__TEACHER_AI_RECORDING_ACTIVE__ = true
  const taskId = window.__TEACHER_AI_TASK_ID__ || 'custom_skill'

  function initRecorder(initialStepSeq = 0) {
    const recorder = new DomRecorder(document, {
      taskId,
      initialUrl: window.location.href,
      mountOverlay: true,
      initialStepSeq,
      onStepCaptured: (step) => {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ action: 'SKILLGRAPH_STEP_CAPTURED', step }).catch(() => {})
          }
        } catch {}
      },
    })

    window.__TEACHER_AI_DOM_RECORDER__ = recorder
    recorder.start()

    window.__TEACHER_AI_STOP_RECORDING__ = function (): Trace | null {
      if (!window.__TEACHER_AI_RECORDING_ACTIVE__) return null
      window.__TEACHER_AI_RECORDING_ACTIVE__ = false
      const trace = recorder.stop()

      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          chrome.storage.session.set({ skillgraph_last_trace: trace })
        } catch (_) {
          // Silencioso em caso de contexto isolado
        }
      }

      return trace
    }

    console.log('[TeacherAI Recorder] DomRecorder inicializado com sucesso via lib/recorder-dom.')
  }

  // Tenta sincronizar a sequência de passos acumulada com a sessão da extensão
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
      chrome.storage.session.get(['skillgraph_recording'], (res: any) => {
        if (chrome.runtime?.lastError) {
          initRecorder(0)
          return
        }
        const steps = res?.skillgraph_recording?.steps
        const startSeq = Array.isArray(steps) ? steps.length : 0
        initRecorder(startSeq)
      })
    } else {
      initRecorder(0)
    }
  } catch {
    initRecorder(0)
  }
})()
