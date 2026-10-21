# Desenho de Arquitetura: Captura de Áudio, ASR e Diarização Local (Zero-Cloud)

Data: 2026-10-21  
Status: **SOMENTE DESENHO (Não instalar, não implementar)**  
Governança: LGPD / Privacidade Estrita / Zero PII na Nuvem

---

## 1. Visão Geral e Princípios Não-Negociáveis

Para transformar aulas e reuniões pedagógicas em dados consultáveis com conformidade irrestrita à LGPD:
1. **Nenhum áudio ou transcrição de aluno trafega pela internet**: Nem APIs em nuvem (Groq, OpenAI, Gemini), nem webhooks de terceiros. A inferência acústica e diarização devem ser 100% locais no dispositivo do professor.
2. **Sem biometria discente**: A diarização local utiliza agrupamento acústico não supervisionado (clustering de embeddings de voz), identificando clusters anônimos (`spk_0`, `spk_1`...). A atribuição de nomes nominais só ocorre via evidência verbal explícita do professor ("Muito bem, Arthur!") ou rotulagem manual pelo docente.
3. **Descarte imediato de áudio bruto**: O arquivo de áudio PCM/WAV reside temporariamente apenas em memória ou em diretório de cache efêmero (`tmp/`), sendo irrevogavelmente apagado após a transcrição e alinhamento dos turnos. Apenas a transcrição estruturada com horários é persistida no cofre SQLite local.

---

## 2. Onde Roda a Inferência: Desktop (Electron) vs. Extensão (Chrome MV3)

| Critério de Análise | Opção A: Desktop Core (Electron / Sidecar Local) [RECOMENDADO] | Opção B: Extensão Chrome (Manifest V3 + Offscreen Document) |
| :--- | :--- | :--- |
| **Capacidade de Execução** | Acesso nativo a C++ addons, ONNX Runtime nativo com DirectML/Vulkan/CUDA, e threads dedicadas sem restrição de memória do navegador. | Confinado à sandbox do WebAssembly (Wasm) dentro de um `chrome.offscreen` document. Limite rígido de alocação de memória (2GB máximo por aba). |
| **Permissões Exigidas** | Permissão de microfone padrão do sistema operacional (Windows/macOS/Linux). Nenhuma alteração no `manifest.json` da extensão. | Exige alterar `manifest.json`: `"permissions": ["tabCapture", "offscreen", "audioCapture"]` e declarar `reasons: ["USER_MEDIA", "DISPLAY_MEDIA"]`. |
| **Ciclo de Vida** | Processo persistente de background. Pode gravar aulas de 50 a 120 minutos sem suspensão. | Service Workers do MV3 são terminados a cada 30 segundos de inatividade; manter o `offscreen` document vivo durante 50 minutos exige mensagens de heartbeat contínuas e é sujeito a descarte pelo navegador em situações de pouca RAM. |
| **Performance e Latência** | **RTF < 0.15** (transcreve 10 segundos de áudio em menos de 1.5s via ONNX Runtime DirectML / AVX2). | **RTF ~ 0.60 a 1.10** (quase tempo real ou mais lento em máquinas escolares sem suporte a SIMD Wasm avançado). |
| **Veredito Arquitetural** | **ESCOLHA RECOMENDADA**: A captura e transcrição de sala de aula devem residir no Desktop Core / Sidecar Local, mantendo a extensão apenas como ponte de comando. | Inadequado para salas de aula reais devido a riscos de Out-of-Memory (OOM) e complexidade de permissões invasivas no Chrome Web Store. |

---

## 3. Matriz Comparativa de Modelos de ASR Locais

| Modelo / Engine | Idioma / Foco | Licença | Peso em Disco | Uso de RAM | Latência / RTF | Dependências |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Sherpa-ONNX (Zipformer)** | pt-BR Streaming e Offline | **Apache 2.0** | ~85 MB (int8 quantizado) | ~250 MB | **RTF ~ 0.08** (Tempo Real contínuo) | `onnxruntime` C++ / Node addon nativo |
| **Whisper.cpp (ggml-small-q5_1)** | pt-BR Robusto com pontuação | **MIT** | ~320 MB | ~650 MB | **RTF ~ 0.18** (Chunks de 15s processados em 2.7s) | Binário C++ ou binding Node.js (`node-whisper` / `whisper-node`) |
| **Whisper ONNX Turbo (int8)** | pt-BR de alta fidelidade | **MIT** | ~800 MB | ~1.4 GB | **RTF ~ 0.25** | ONNX Runtime com DirectML |
| **Vosk (vosk-model-small-pt-0.3)** | pt-BR ultraleve | **Apache 2.0** | ~45 MB | ~120 MB | **RTF ~ 0.05** | `vosk` lib nativa (Kaldi C++) |

---

## 4. Matriz Comparativa de Diarização Local de Locutores

| Solução de Diarização | Licença | Peso | Consumo de RAM | Precisão em Sala de Aula | Arquitetura de Execução |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sherpa-ONNX Speaker Diarization (3D-Speaker)** | **Apache 2.0** | ~90 MB | ~300 MB | Alta (separa professor de alunos com threshold de distância cosseno calibrável) | C++ / ONNX Runtime local |
| **PyAnnote Audio (Segmentation 3.0 + WeSpeaker)** | **MIT / OpenRAIL** (pesos no HF) | ~180 MB | ~800 MB | Estado da arte em sobreposição de vozes | Python Sidecar local (`sidecar/`) via PyTorch CPU/DirectML |
| **WhisperX Diarization Pipeline** | **BSD-2-Clause** | ~350 MB | ~1.2 GB | Muito Alta (alinhamento fonético por palavra + diarização) | Python Sidecar local |

---

## 5. Permissões de Manifesto Exigidas (Se rodasse na Extensão Chrome)

> [!IMPORTANT]
> Caso a captura fosse obrigatoriamente acoplada à extensão Chrome (`teacher-extension/manifest.json`), as seguintes permissões **teriam que ser adicionadas**:
> 1. `"tabCapture"`: Para interceptar streams de áudio vindos de abas de reuniões remotas (Google Meet, Microsoft Teams, Zoom Web).
> 2. `"offscreen"`: Obrigatório no MV3 para criar documentos DOM invisíveis com capacidade de instanciar `AudioContext`, `MediaStreamAudioSourceNode` e `navigator.mediaDevices.getUserMedia`.
> 3. `"audioCapture"` (ou declaração de permissão de mídia via `chrome.contentSettings`): Para solicitar autorização do microfone físico sem abrir pop-ups bloqueáveis.
>
> **Motivo da Decisão:** Como alterar o `manifest.json` com novas permissões é uma **Condição de Parada** bloqueante, **nenhuma permissão nova foi adicionada ao manifesto**. Toda a arquitetura de produção é desenhada para operar desacoplada através do Desktop Core e do Sidecar Local na porta de loopback segura `127.0.0.1:8765`.

---

## 6. Fluxo de Execução Recomendado (Desktop Core Pipeline)

```
[Microfone da Sala de Aula / Reunião]
                │
                ▼ (PCM 16kHz mono)
   [RingBuffer em Memória RAM] ─── (VAD: Silero-VAD local / Sherpa-VAD)
                │
     ┌──────────┴──────────┐
     ▼                     ▼
[Sherpa-ONNX ASR]     [3D-Speaker Embeddings]
 (Gera texto + tempo)  (Gera cluster spk_0..N)
     │                     │
     └──────────┬──────────┘
                ▼
  [Alinhador Temporal de Turnos]
  (Rotula: professor, aluno, desconhecido)
                │
                ▼
  [Cofre SQLite Local Cifrado] (lib/conversationData/schema.ts)
  (sessions, turns, events, speaker_map)
                │
                ▼
  [Descarte Imediato do Buffer de Áudio]
```

---

## 7. Banner de Gravação e Consentimento Pré-Captura

1. **Tela de Consentimento Pedagógico**:
   - Exibida antes do início da captura de cada aula/reunião.
   - Opções: "Gravar apenas voz docente" ou "Gravar aula completa com estudantes (Termo de Consentimento Escolar ativo)".
2. **Indicador Visual Pulsante**:
   - Tarja superior persistente (vermelho vivo `#dc322f`) com contador de tempo de gravação decorrido e botão de pausa/cancelamento imediato.
   - Estado de auditoria: grava metadado `consent_id` e termo de retenção configurável no cofre local.
