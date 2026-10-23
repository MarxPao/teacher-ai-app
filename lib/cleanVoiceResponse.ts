/**
 * Módulo de Higienização de Respostas e Filtragem de Voz da Rafinha (Estilo EVA)
 * Garante que raciocínios internos (<think>), checklists de pensamento e formatações
 * Markdown pesadas nunca vazem para a síntese de voz (TTS) ou chat conversacional.
 */

export function cleanVoiceResponse(raw: string): string {
  if (!raw) return ''
  let text = raw

  // 1. Remove qualquer bloco explícito de raciocínio (<think>...</think>)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  text = text.replace(/<think>[\s\S]*/gi, '')

  // 2. Se houver marcador explícito de resposta final
  const directReplyMatch = text.match(/(?:Resposta(?:\s+final)?|Falar(?:\s+ao\s+usu[áa]rio)?|Assistente|Rafinha|EVA):\s*([\s\S]+)/i)
  if (directReplyMatch && directReplyMatch[1]?.trim()) {
    text = directReplyMatch[1]
  } else {
    // 3. Remove monólogos reflexivos do modelo
    text = text.replace(/O usuário está perguntando[^.]*\./gi, '')
    text = text.replace(/\s*\d+\.\s*\*?\*?(?:Verificar|Avaliar|Estratégia|Opção|Pensamento|Reflexão)[^:]*:\*?\*?[^.]*\./gi, '')
    text = text.replace(/\s*\*\s*Opção\s+[A-Z][^.\n]*\.?/gi, '')
  }

  // 4. Limpa formatações Markdown para áudio TTS fluido e natural
  text = text.replace(/```[\s\S]*?```/g, '')
  text = text.replace(/`([^`]+)`/g, '$1')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/^#+\s+/gm, '')
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // 5. Normaliza espaços e quebras de linha
  text = text.replace(/\r\n/g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/**
 * Filtro de Ruído e Alucinações de Reconhecimento de Voz (STT/Whisper)
 * Detecta se a transcrição recebida do microfone é ruído de fundo,
 * silêncio ou alucinação comum, evitando disparos falsos da assistente.
 */
export function isWhisperNoise(rawText: string): boolean {
  if (!rawText) return true
  const text = rawText.trim()
  const lower = text.toLowerCase()

  // 1. Strings sem caracteres alfanuméricos ou menores que 2 letras
  if (!/[a-záàâãéèêíïóôõöúçñ0-9]/i.test(text)) {
    return true
  }

  // 2. Interjeições e ruídos vocais sem intenção de diálogo
  const noiseInterjections = new Set([
    'hum', 'uhm', 'humm', 'ah', 'ahh', 'é', 'eh', 'oh', 'hm', 'hmm', 'shh', 'psst',
    'ãh', 'ãn', 'uh', 'uhh', 'ops', 'epa'
  ])
  if (noiseInterjections.has(lower.replace(/[.!?,]/g, ''))) {
    return true
  }

  // 3. Palavras isoladas de 1 ou 2 letras que não sejam comandos válidos
  const cleanWord = lower.replace(/[.!?,]/g, '')
  const validShortWords = new Set(['oi', 'ou', 'ir', 'pá', 'já', 'fé'])
  if (cleanWord.length <= 2 && !validShortWords.has(cleanWord)) {
    return true
  }

  // 4. Alucinações conhecidas causadas por silêncio/ruído estático
  const hallucinationPatterns = [
    /subt[íi]tulos/i,
    /legendas?\s+pela/i,
    /legendado\s+por/i,
    /obrigad[oa]\s+por\s+assistir/i,
    /inscreva-se/i,
    /deixe\s+(?:o\s+)?seu\s+like/i,
    /transmiss[ãa]o\s+finalizada/i,
    /fundo\s+musical/i,
    /m[úu]sica\s+ambiente/i,
    /som\s+ambiente/i,
    /\[m[úu]sica\]/i,
    /\[aplausos\]/i,
    /\[sil[êe]ncio\]/i,
    /\(sil[êe]ncio\)/i,
    /\(aplausos\)/i,
    /\(m[úu]sica\)/i,
  ]

  return hallucinationPatterns.some(pattern => pattern.test(lower))
}

/**
 * Remove o prefixo da assistente ('rafinha:', 'rafinha,', 'eva:', etc.) do início do comando
 */
export function cleanAssistantPrefix(text: string): string {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/^(?:rafinha|rafa|eva|éva|êva)\s*[:,\-!.]?\s*/iu, '').trim()
}

/**
 * Verifica se a entrada é um comando de parada imediata (barge-in)
 */
export function isPureStopCommand(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const clean = text
    .toLowerCase()
    .replace(/(?:^|[^\p{L}\p{N}])(?:rafinha|rafa|eva|éva)(?:$|[^\p{L}\p{N}])/iu, ' ')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'«»]/g, ' ')
    .replace(/\b(por\s+favor|agora|já|aí|logo)\b/gi, ' ')
    .trim()

  return /^(?:para|parar|pare|sil[êe]ncio|chega|cancela|cancelar|quiet[oa]|calad[oa]|stop|espera|espere|pausa|pausar)$/iu.test(clean)
}
