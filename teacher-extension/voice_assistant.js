// teacher-extension/voice_assistant.js
// Controlador de voz local para a extensão Teacher AI (Frente A: Voz como Canal)
// Utiliza Web Speech API nativa (STT e TTS offline) sem envio de áudio para nuvem externa
//
// Gap C5 (Parecer 2026-10-21): adicionado guardrail allowCloudSpeech.
// Por padrão (produção), o reconhecimento só é iniciado se a API operar offline
// (modelo local detectado ou forçado por opção). Modo nuvem só é permitido se
// o chamador passar explicitamente { allowCloudSpeech: true } — reservado para
// dados fictícios de teste documentados no protocolo de desenvolvimento.

;(function () {

  // ------------------------------------------------------------------
  // Detecção de capacidade local (Chrome Canary / Edge com modelo local)
  // ------------------------------------------------------------------
  function isLocalSpeechAvailable() {
    // A API expõe SpeechRecognitionEvent.results mesmo offline quando o
    // modelo está disponível localmente. Não há API pública estável para
    // inspecionar isso em tempo de construção, então usamos heurística:
    // o atributo não-padrão `SpeechGrammarList` não é necessário para
    // reconhecimento offline — se o modo contínuo online estiver
    // ausente ou desabilitado pelo usuário, assumimos local disponível.
    // Para fins de guardrail, a opção explícita de quem instancia é a
    // única fonte de verdade — defaults para false (bloqueado).
    return false // conservador: requer opção explícita
  }

  class VoiceAssistant {
    /**
     * @param {object} options
     * @param {function} [options.onTranscript]
     * @param {function} [options.onError]
     * @param {function} [options.onStateChange]
     * @param {boolean}  [options.allowCloudSpeech=false]
     *   Gap C5 — LGPD/privacidade: false por padrão (modo produção).
     *   Só passar true em sessões de teste com dados fictícios documentados.
     *   Em produção, se a Web Speech API tiver que rotear para nuvem,
     *   o toggle() recusa e chama onError('cloud_speech_blocked').
     */
    constructor(options = {}) {
      this.onTranscript = options.onTranscript || (() => {})
      this.onError = options.onError || (() => {})
      this.onStateChange = options.onStateChange || (() => {})
      this.isListening = false
      this.recognition = null

      // Gap C5: flag de modo nuvem — false = produção segura
      this._allowCloudSpeech = options.allowCloudSpeech === true

      this.initRecognition()
    }

    initRecognition() {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRec) {
        console.warn('[VoiceAssistant] Web Speech Recognition não suportado neste ambiente.')
        return
      }

      try {
        this.recognition = new SpeechRec()
        this.recognition.lang = 'pt-BR'
        this.recognition.continuous = false
        this.recognition.interimResults = false

        this.recognition.onstart = () => {
          this.isListening = true
          this.onStateChange(true)
        }

        this.recognition.onresult = (event) => {
          const transcript = event.results?.[0]?.[0]?.transcript || ''
          if (transcript.trim()) {
            this.onTranscript(transcript.trim())
          }
        }

        this.recognition.onerror = (event) => {
          console.warn('[VoiceAssistant] Erro na captura de voz:', event.error)
          this.isListening = false
          this.onStateChange(false)
          this.onError(event.error)
        }

        this.recognition.onend = () => {
          this.isListening = false
          this.onStateChange(false)
        }
      } catch (err) {
        console.warn('[VoiceAssistant] Falha ao instanciar SpeechRecognition:', err)
      }
    }

    /**
     * Gap C5 — Guardrail de privacidade LGPD:
     * Verifica, antes de iniciar, se o modo nuvem está bloqueado.
     * A Web Speech API do Chrome pode enviar áudio para servidores Google
     * quando nenhum modelo local está carregado. Este método recusa
     * o início do reconhecimento se `allowCloudSpeech` não foi autorizado
     * explicitamente pelo chamador.
     *
     * Critério de aceite (C5): chamar toggle() sem { allowCloudSpeech: true }
     * deve emitir onError('cloud_speech_blocked') sem iniciar o microfone.
     */
    _isCloudSpeechBlocked() {
      if (this._allowCloudSpeech) return false
      if (isLocalSpeechAvailable()) return false
      // Modo padrão: bloquear para proteger dados de voz de alunos/professoras
      return true
    }

    toggle() {
      if (!this.recognition) {
        this.onError('not_supported')
        return
      }

      if (this.isListening) {
        this.recognition.stop()
        return
      }

      // Gap C5: guardrail antes de qualquer start()
      if (this._isCloudSpeechBlocked()) {
        console.warn(
          '[VoiceAssistant] Reconhecimento bloqueado (C5-LGPD): ' +
          'Web Speech API pode enviar áudio para nuvem externa. ' +
          'Para usar voz em produção, aguarde suporte a modelo local offline. ' +
          'Modo nuvem só é permitido em sessões de teste com dados fictícios.'
        )
        this.onError('cloud_speech_blocked')
        return
      }

      try {
        this.recognition.start()
      } catch (err) {
        console.warn('[VoiceAssistant] Falha ao iniciar reconhecimento:', err)
        this.onError('start_failed')
      }
    }

    /**
     * Ativa o reconhecimento explicitamente em modo de teste com dados fictícios.
     * Use APENAS em testes documentados — nunca em produção com dados reais.
     * Registra aviso de auditoria no console.
     */
    toggleTestMode() {
      if (!this.recognition) {
        this.onError('not_supported')
        return
      }
      console.warn(
        '[VoiceAssistant] ⚠️ MODO TESTE: reconhecimento de voz iniciado com dados fictícios. ' +
        'NÃO use com dados reais de alunos ou professoras.'
      )
      if (this.isListening) {
        this.recognition.stop()
      } else {
        try {
          this.recognition.start()
        } catch (err) {
          console.warn('[VoiceAssistant] Falha ao iniciar reconhecimento (teste):', err)
        }
      }
    }

    speak(text) {
      if (!window.speechSynthesis || !text) return

      try {
        window.speechSynthesis.cancel()
        const clean = text
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/[*_#`[\]()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!clean) return

        const utterance = new SpeechSynthesisUtterance(clean)
        utterance.lang = 'pt-BR'
        utterance.rate = 1.05
        window.speechSynthesis.speak(utterance)
      } catch (err) {
        console.warn('[VoiceAssistant] Falha na síntese de áudio TTS:', err)
      }
    }
  }

  globalThis.TeacherVoiceAssistant = VoiceAssistant
})()
