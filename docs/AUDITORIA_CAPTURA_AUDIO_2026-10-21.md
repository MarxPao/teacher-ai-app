# Auditoria de Captura de Áudio, Transcrição e Dados Conversacionais

Data: 2026-10-21  
Escopo: Investigação completa de L1 a L7, sondas de código, análise de permissões e auditoria das 12 perguntas de capacidade.

---

## 1. Escala de Maturidade e Degraus de Capacidade (L1 a L7)

**Escala Aplicada:**
- `0`: Não existe no código.
- `1`: Código existe mas sem teste ou com mock isolado.
- `2`: Testado com fixture determinística automatizada.
- `PENDENTE (dono)`: Exige áudio real de sala de aula, Chrome real ou gravação em ambiente escolar.
- `NÃO VERIFICADO`: Citações sem evidência ou inferências não provadas.

| Degrau | Capacidade Auditada | Nota Atual | Situação / Evidência no Código |
| :--- | :--- | :---: | :--- |
| **L1** | **Captura** (microfone, áudio da aba, consentimento, indicador, desktop/extensão) | **1** | Microfone capturado via `navigator.mediaDevices.getUserMedia` (`lib/audioRecorder.ts:58`, `hooks/useVoiceCommand.ts:86`). Captura de aba (`tabCapture` / `offscreen`) **não existe** (0). Extensão (`teacher-extension/manifest.json`) **não tem** permissões de áudio. Indicador de gravação básico existe (`components/WisprFlowOverlay.tsx:126`, `MeetingClassRecorder.tsx:49`), mas **tela de consentimento e banner de sala não existem** (0). |
| **L2** | **Transcrição com tempo** (pt-BR, local ou nuvem, destino do áudio) | **1** | Web Speech API usada com `lang = 'pt-BR'` (`MeetingClassRecorder.tsx:95`). Rota de transcrição de arquivo (`app/api/transcribe/route.ts:71,98`) envia áudio para Groq Whisper e OpenAI Whisper na **nuvem** (violando diretriz LGPD se áudio for de alunos). ASR local (ex. Whisper WASM / ONNX local) **não existe**. |
| **L3** | **Diarização e papéis** (professor/aluno/grupo, falante desconhecido) | **1** | `lib/classroomPipeline.ts:188-218` simula diarização fatiando 60% professor e 40% aluno com strings estáticas. Diarização acústica real **não existe**. Falante desconhecido não é modelado formalmente. |
| **L4** | **Eventos estruturados** (pergunta, aberta/fechada, resposta, instrução, wait time, retomada) | **1** | Wait-time e detecção de pergunta docente via regex básica testados com fixture (`lib/classroomHeuristics.ts:140`, `__tests__/classroomHeuristics.test.ts:80`) [Nota 2 para wait-time isolado]. Aberta/fechada, resposta, instrução e retomada **não existem** (0). Média geral do degrau: 1. |
| **L5** | **Consulta** (linguagem natural -> primitiva determinística com horários e definições) | **0** | **Não existe**. Não há camada de despacho determinístico nem respostas auditáveis com horários de origem. |
| **L6** | **Resumo estruturado** (tópicos, dúvidas, pendências, decisões/ações com responsável e horários) | **1** | `components/modules/MeetingClassRecorder.tsx:285-325` gera resumo e itens de ação invocando `/api/agent` (LLM nuvem), **sem horários de origem** e **sem map-reduce** para sessões longas. |
| **L7** | **Persistência, retenção e exclusão** (cofre local SQLite, prazo, apagar) | **1** | `desktop/db/nodeSqliteDriver.ts` suporta SQLite local, mas transcrições são salvas em `localStorage.setItem('teacher_meeting_diaries')` (`MeetingClassRecorder.tsx:241`) em texto plano. Sem política de retenção temporal e sem exclusão segura (0). |

---

## 2. Saída Literal das Sondas (`git grep` nos fontes)

### Sonda 1: `getUserMedia`
```
components/NativeCameraCapture.tsx:32: const mediaStream = await navigator.mediaDevices.getUserMedia({
hooks/useVoiceCommand.ts:86: const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
lib/audioRecorder.ts:58: if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
lib/audioRecorder.ts:59: throw new Error('Seu navegador não suporta captura de microfone (getUserMedia).')
lib/audioRecorder.ts:63: const stream = await navigator.mediaDevices.getUserMedia({
lib/audioRecorder.ts:224: if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
lib/audioRecorder.ts:225: throw new Error('Navegador não suporta captura de microfone (getUserMedia).')
lib/audioRecorder.ts:228: const stream = await navigator.mediaDevices.getUserMedia({
```

### Sonda 2: `MediaRecorder`
```
lib/audioRecorder.ts:14: private mediaRecorder: MediaRecorder | null = null
lib/audioRecorder.ts:47: if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
lib/audioRecorder.ts:115: // Configura MediaRecorder
lib/audioRecorder.ts:117: const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
lib/audioRecorder.ts:118: const recorder = new MediaRecorder(stream, options)
lib/audioRecorder.ts:207: private mediaRecorder: MediaRecorder | null = null
lib/audioRecorder.ts:246: const recOptions: MediaRecorderOptions = mimeType ? { mimeType } : {}
lib/audioRecorder.ts:247: const recorder = new MediaRecorder(stream, recOptions)
```

### Sonda 3: `tabCapture`
```
(Saída vazia — código de saída 1. Ocorrências: 0)
```

### Sonda 4: `offscreen`
```
audit/test_safewriter.js:6: * 2. Detecção e Bloqueio de Honeypots (aria-hidden, coordenadas offscreen, nomes armadilha).
audit/test_safewriter_hardening.js:6: * occlusão por elementFromPoint, ancestral oculto, position + translate offscreen).
audit/test_safewriter_hardening_a.js:6: * occlusão por elementFromPoint, ancestral oculto, position + translate offscreen) [H01 a H14].
(Nenhuma ocorrência de chrome.offscreen ou API de áudio offscreen)
```

### Sonda 5: `SpeechRecognition`
```
components/RafinhaChat.tsx:1993: if ((window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
components/modules/MeetingClassRecorder.tsx:90: if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
components/modules/MeetingClassRecorder.tsx:91: const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
components/modules/MeetingClassRecorder.tsx:92: recognitionRef.current = new SpeechRecognition();
hooks/useGlobalWakeWord.ts:24: const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
hooks/useSpeechInput.ts:19: const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
hooks/useVoiceCommand.ts:151: const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
teacher-extension/side_panel.js:3332: if (window.webkitSpeechRecognition || window.SpeechRecognition) {
```

### Sonda 6: `whisper`
```
app/api/transcribe/route.ts:54: const whisperPrompt = contextTerms
app/api/transcribe/route.ts:66: groqFormData.append('model', 'whisper-large-v3-turbo')
app/api/transcribe/route.ts:94: oaiFormData.append('model', 'whisper-1')
components/RafinhaChat.tsx:1949: const whisper = useWhisperFlow({
components/WisprFlowOverlay.tsx:58: const whisper = useWhisperFlow({
```

### Sonda 7: `deepgram`
```
(Saída vazia — código de saída 1. Ocorrências: 0)
```

### Sonda 8: `diariz`
```
lib/classroomPipeline.ts:6: * 2. diarizing: Segmentação e rotulação de locutores (professor vs. aluno_1..aluno_N).
lib/classroomPipeline.ts:28: status: 'uploading' | 'queued' | 'transcribing' | 'diarizing' | 'extracting_highlights' | 'computing_analytics' | 'ready' | 'failed'
lib/classroomPipeline.ts:143: // 2. Estágio: Diarizing
lib/classroomPipeline.ts:150: session.segments = generateDiarizedSegments(session.chunks)
lib/classroomPipeline.ts:188:function generateDiarizedSegments(chunks: ClassroomSession['chunks']): ClassroomSegment[] {
```

### Sonda 9: Permissões de `teacher-extension/manifest.json`
```json
"permissions": [
  "activeTab",
  "storage",
  "tabs",
  "sidePanel",
  "scripting",
  "nativeMessaging",
  "alarms",
  "webNavigation"
],
"optional_permissions": [
  "downloads",
  "debugger"
]
```
*Conclusão da sonda:* `tabCapture`, `offscreen`, `audioCapture` **não** constam nas permissões da extensão.

### Sonda 10: Pontos de Saída de Rede e Armazenamento
- **Saídas de Rede:**
  - `app/api/transcribe/route.ts:71`: `POST https://api.groq.com/openai/v1/audio/transcriptions`
  - `app/api/transcribe/route.ts:98`: `POST https://api.openai.com/v1/audio/transcriptions`
  - `components/modules/MeetingClassRecorder.tsx:302`: `fetch('/api/agent')` enviando transcrição para nuvem.
- **Armazenamento:**
  - `components/modules/MeetingClassRecorder.tsx:241`: `localStorage.setItem('teacher_meeting_diaries', JSON.stringify(updatedRecords))`
  - `lib/classroomPipeline.ts:48`: `const SESSIONS_STORE = new Map<string, ClassroomSession>()`

---

## 3. Teste de Capacidade — As 12 Perguntas

| Nº | Pergunta | Situação Hoje | Arquivo : Linha | Justificativa |
| :---: | :--- | :---: | :--- | :--- |
| **1** | Quantas vezes eu falei? | **RESPONDE SEM EVIDÊNCIA** | [lib/classroomHeuristics.ts:241](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/classroomHeuristics.ts#L241) | Calcula internamente turnos do professor em `computeClassroomTalkMetrics`, mas não há interface de consulta determinística com horários. |
| **2** | Quanto tempo falei vs. alunos? | **RESPONDE SEM EVIDÊNCIA** | [lib/classroomHeuristics.ts:259-260](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/classroomHeuristics.ts#L259-L260) | Calcula `teacherTalkRatio` e `studentTalkRatio`, mas não há query em linguagem natural nem lista de trechos. |
| **3** | Quantas perguntas eu fiz? | **RESPONDE SEM EVIDÊNCIA** | [lib/classroomHeuristics.ts:243-244](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/classroomHeuristics.ts#L243-L244) | Incrementa `questionsCount` por regex básica (`seg.text.includes('?')`), sem filtro semântico e sem horários. |
| **4** | Quantas eram abertas? | **NÃO RESPONDE** | — | Não há classificação aberta vs. fechada no repositório. |
| **5** | Quantas perguntas os alunos fizeram? | **NÃO RESPONDE** | [lib/classroomHeuristics.ts:253](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/classroomHeuristics.ts#L253) | O código atual só conta perguntas quando o locutor é o professor (`isTeacher`). Alunos só somam tempo de fala. |
| **6** | Quem fez cada pergunta? | **NÃO RESPONDE** | — | Não há mapeamento de autoria individual de perguntas no código existente. |
| **7** | Qual foi o maior trecho de fala só minha? | **NÃO RESPONDE** | — | Não há cálculo de maior monólogo ininterrupto. |
| **8** | Quanto tempo esperei após perguntar? | **RESPONDE SEM EVIDÊNCIA** | [lib/classroomHeuristics.ts:160,262](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/classroomHeuristics.ts#L160) | Calcula média (`avgWaitTimeMs`) e anomalia > 4.5s, mas não há consulta determinística de lista de esperas por pergunta. |
| **9** | Dúvidas dos alunos que ficaram sem resposta? | **NÃO RESPONDE** | — | Não há rastreamento de dúvidas em aberto ou pareamento pergunta/resposta. |
| **10** | Resumo da aula. | **RESPONDE SEM EVIDÊNCIA** | [components/modules/MeetingClassRecorder.tsx:287](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/MeetingClassRecorder.tsx#L287) | Gera resumo executivo livre via LLM na nuvem (`/api/agent`), sem horários de ancoragem por item. |
| **11** | Decisões e responsáveis desta reunião. | **RESPONDE SEM EVIDÊNCIA** | [components/modules/MeetingClassRecorder.tsx:289](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/components/modules/MeetingClassRecorder.tsx#L289) | Extrai `actionItems` via LLM na nuvem, sem horários e gravado em localStorage desprotegido. |
| **12** | Compare com a aula anterior. | **NÃO RESPONDE** | — | Inexistente qualquer suporte à comparação analítica entre sessões. |
