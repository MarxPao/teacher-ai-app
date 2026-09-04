# Arquitetura de Wake Word Nativa em Segundo Plano (Item 9)
**Teacher AI - Hotword Spotting Continuo em Baixo Nivel para Ambientes Multi-App e Mobile**

---

## 1. Problema e Limitacoes dos Navegadores Web

No ambiente web padrao (Chrome, Edge, Safari, Firefox), a escuta continua por palavras de ativacao (*Wake Word* como *"Hey Rafinha"*) sofre de tres gargalos estruturais impostos pelas politicas de sandbox dos navegadores:

1. **Suspensao de Audio em Segundo Plano:** Quando a aba do navegador perde o foco ou a tela do dispositivo e bloqueada, o navegador suspende a AudioContext da Web Audio API para economizar bateria e garantir privacidade, cessando o processamento do microfone.
2. **Consumo de CPU em WebAssembly (Wasm):** Rodar modelos continuos de inferencia de audio na thread principal ou mesmo em um Web Worker via Wasm mantem o motor JavaScript do navegador ativo em ciclos continuos de buffer de audio (16 kHz, 16-bit PCM), causando drenagem excessiva de bateria.
3. **Restricoes de Permissao do SO:** O navegador nao possui permissao para escuta global continua fora do contexto de uma janela aberta visivel pelo usuario.

---

## 2. Solucao Proposta: Sidecar Nativo Leve (Rust / Tauri v2)

A arquitetura enterprise implementa um **processo sidecar nativo desacoplado** empacotado via Tauri v2 ou executavel de sistema (Windows Service / macOS Menu Bar / Linux Daemon / Android Foreground Service):

`
┌─────────────────────────────────────────────────────────────┐
│                      SISTEMA OPERACIONAL                    │
│                                                             │
│   [ Microfone do Sistema ] (Hardware Audio In)              │
│               │                                             │
│               ▼                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │        Native Wake Word Daemon (Sidecar Rust)       │   │
│   │  • Low-level Audio Capture (CPAL / ALSA / CoreAudio)│   │
│   │  • Ring Buffer 512ms (16kHz mono)                   │   │
│   │  • Motor: Picovoice Porcupine / OpenWakeWord        │   │
│   │  • Consumo: < 1.2% CPU | < 18MB RAM                │   │
│   └──────────────────────┬──────────────────────────────┘   │
│                          │ IPC (Local WebSocket / Pipe)     │
│                          ▼                                  │
│   ┌─────────────────────────────────────────────────────┐   │
│   │          Teacher AI App (Tauri / Next.js)           │   │
│   │  • hooks/useNativeWakeWordBridge.ts                 │   │
│   │  • Ativa RafinhaChat instantaneamente               │   │
│   │  • Inicia Streaming de Reconhecimento de Fala (STT) │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
`

---

## 3. Comparativo de Motores de Wake Word Offline

| Criterio | Picovoice Porcupine | OpenWakeWord (ONNX Runtime) | Vosk / Kaldi |
| :--- | :--- | :--- | :--- |
| **Licenca** | Proprietaria (Tier Gratuito / Enterprise) | Apache 2.0 (Open Source) | Apache 2.0 (Open Source) |
| **Pegada de Memoria** | **~2.5 MB** | ~18 MB | ~50 MB |
| **Uso de CPU (Idle)** | **< 0.8%** | ~1.5% | ~3.8% |
| **Latencia de Disparo**| **< 80 ms** | < 120 ms | < 250 ms |
| **Suporte Multiplataforma**| Win, Mac, Linux, Android, iOS | Win, Mac, Linux, Android | Win, Mac, Linux, Android |
| **Recomendacao** | **Producao Comercial Enterprise** | **Alternativa 100% Self-Hosted** | Fallback STT Geral |

---

## 4. Protocolo de Comunicacao IPC (Inter-Process Communication)

O Daemon nativo escuta em uma porta loopback restrita (127.0.0.1:41892 com autenticacao por token de sessao efemero gerado na inicializacao) ou via canal IPC Tauri:

### Payload de Evento Emitido ao Detectar Palavra-Chave:
`json
{
  "event": "WAKE_WORD_DETECTED",
  "keyword": "HEY_RAFINHA",
  "confidence": 0.962,
  "timestamp": 1788543820100,
  "audioCaptureSampleRate": 16000,
  "snrDb": 18.4
}
`

---

## 5. Estrategia de Fallback Resiliente em Tres Camadas

1. **Camada 1 (Nativa / Tauri):** Se o Daemon local responder no handshake GET 127.0.0.1:41892/health, o app delega 100% da deteccao de wake word para o sidecar nativo de ultra-baixo consumo.
2. **Camada 2 (Web Browser com aba ativa):** Se rodando na web e a aba estiver em primeiro plano com consentimento do usuario, utiliza lib/wakeWordEngine.ts (Web Speech API / heuristica local de buffer de audio).
3. **Camada 3 (Push-to-Talk):** Atalho global de teclado (Alt + Shift + V ou Ctrl + Espaco) para acionamento manual instantaneo sem necessidade de microfone sempre aberto.

---

## 6. Conformidade com Privacidade e LGPD

- **Processamento 100% On-Device:** Nenhum dado de audio ambiente e gravado, salvo em disco ou transmitido para a nuvem durante a escuta da palavra-chave.
- **Buffer Circular Efemero:** O audio e processado em fatias de 512 milissegundos em memoria RAM volatil e imediatamente descartado se a palavra de ativacao nao for confirmada com limiar >= 0.85.
- **Indicador Visual Fisico:** Quando o sidecar detecta a palavra de ativacao e abre o canal de ditado, um icone flutuante de microfone ativo em cor de destaque e exibido na interface para garantir transparencia ao professor.