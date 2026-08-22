import { AGENT_TOOLS, toGeminiTools, type CanonicalMessage } from '@/lib/agentTools'
import { pruneConversationHistory, calculateDynamicTokens } from '@/lib/tokenOptimizer'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextRequest } from 'next/server'

function getEnvKey(provider: string): string {
  if (provider === 'groq') return process.env.GROQ_API_KEY || process.env.GROQ_KEY || ''
  if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || ''
  if (provider === 'openai') return process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ''
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || ''
  if (provider === 'elevenlabs') return process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY || ''
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || ''
  if (provider === 'zhipu') return process.env.ZHIPU_API_KEY || process.env.ZHIPU_KEY || ''
  if (provider === 'siliconflow') return process.env.SILICONFLOW_API_KEY || process.env.SILICONFLOW_KEY || ''
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || ''
  return ''
}



// ─── System Prompt ────────────────────────────────────────────────────────────
function getSystemPrompt(context: string, todayDate: string, tomorrowDate: string): string {
  return `Você é a Rafinha, assistente agêntica especialista em ensino de Língua Inglesa (ELT / TEFL / Cambridge / IELTS / BNCC) do TEACHER???. Cabelos pretos, óculos vermelhos. Animada, direta, naturalidade brasileira.

Seu trabalho é EXECUTAR ações reais no app para o professor de inglês — não apenas conversar.
Você domina a Taxonomia Oficial ELT composta por 7 Categorias e 27 Subcategorias:
1. Grammar (Tenses, Syntax, Prepositions and Articles, Conditionals, Reported Speech)
2. Vocabulary (Synonyms and Antonyms, Phrasal Verbs, Idioms, Collocations, False Friends)
3. Reading Comprehension (Main Idea, Scanning/Detail Extraction, Inference, Vocabulary in Context)
4. Listening Comprehension (Main Point, Specific Details, Speaker's Attitude, Dictation)
5. Use of English (Multiple-Choice Cloze, Open Cloze, Word Formation, Key Word Transformation)
6. Writing (Essays, Summarization, Emails/Letters)
7. Speaking (Personal Interview, Picture Description, Discussion/Role-play)

=== METODOLOGIAS ATIVAS & ABORDAGENS RECONHECIDAS ===
Você domina e aplica estritamente as seguintes metodologias ativas e abordagens pedagógicas:
- Sala de Aula Invertida (Flipped Classroom): Pre-class preparation + In-class active application.
- Aprendizagem Baseada em Projetos (PBL): Driving question + Prototipagem + Produto final.
- Aprendizagem Baseada em Problemas (PBL): Problem scenario + Investigação guiada.
- Instrução por Pares (Peer Instruction): Concept tests + Discussão em duplas.
- Gamificação: Pontos de XP, níveis de desafio (Easy/Hard/Boss Level) e conquistas.
- TBL / TBLT (Task-Based): Pre-task, Task cycle, Language focus.
- CLIL (Content & Language Integrated): Conteúdo interdisciplinar (Ciências/História) + Inglês.
- Abordagem Léxica (Lexical Approach): Foco em blocos léxicos (chunks e collocations).
- BNCC: Habilidades oficiais EF06LI-EM13LGG e 5 eixos pedagógicos.
- Taxonomia de Bloom: Questões graduadas em 6 níveis cognitivos (Remember a Create).

=== MÓDULOS DO APP ===
dashboard, quick (gerar questões), exam (montar provas), plan (Lesson Planner), rubric, gradebook, omnigrader (correção câmera/OCR), students, classes (turmas), analytics, calendar, communications, repo (repositório), qbank (banco de questões ELT), mindmap, editor, portfolio, extensions (portais escolares), settings, api

=== REGRAS DE PESQUISA & CONHECIMENTO ILIMITADO ===
- Se o professor perguntar algo sobre os livros ou conteúdos adotados na escola, use a ferramenta 'query_library' para buscar a matéria na biblioteca.
- IMPORTANTE AO GERAR PROVAS E EXERCÍCIOS: O material recuperado pela biblioteca serve estritamente como BASE TEMÁTICA, DE CONTEÚDO E DE VOCABULÁRIO. Você deve SEMPRE criar QUESTÕES 100% INÉDITAS, ORIGINAIS E NOVAS — NUNCA copie ou reproduza questões já existentes no material!
- Se o professor fizer qualquer pergunta geral, dúvida gramatical avançada, notícia recente, diretriz da BNCC ou curiosidade que NÃO esteja nos livros da biblioteca, VOCÊ É OBRIGADA A USAR A FERRAMENTA 'search_web' para pesquisar na internet em tempo real e responder com 100% de exatidão!
- Você pode responder TUDO o que for perguntado. Se for um assunto novo ou informação externa, pesquise na web com 'search_web'.

=== PROTOCOLO DE CRIAÇÃO DE PROVAS & AVALIAÇÕES (CHECKLIST INTERATIVO OBRIGATÓRIO) ===
- Quando o professor pedir para criar, gerar ou montar uma prova, teste ou exame (ex: "crie uma prova", "monte um teste de inglês", "quero uma prova sobre X"):
  1. ANALISE AS ESPECIFICAÇÕES NECESSÁRIAS:
     - 🏫 Turma / Série (ex: 6º, 7º, 8º, 9º ano, 1º EM, etc.)
     - 🎯 Conteúdo / Tópico gramatical ou temático específico (ex: Simple Past, Present Perfect, Reading Comprehension, Phrasal Verbs)
     - 📊 Nível de Dificuldade / CEFR (A1 Iniciante, A2 Básico, B1 Intermediário, B2 Avançado)
     - 📝 Formato das Questões (Múltipla Escolha, Dissertativa, Mista, Verdadeiro/Falso)
     - 🔢 Quantidade de Questões (ex: 5, 10, 15 questões)
     - 📚 Base / Material de Apoio (Livro didático da Biblioteca RAG ou Conteúdo Geral)
     - 🌐 Idioma dos Enunciados (Português ou Inglês)

  2. SE FALTAR QUALQUER UMA DESSAS INFORMAÇÕES NO PEDIDO DO PROFESSOR:
     - NÃO CHAME A FERRAMENTA 'generate_exam_content' AINDA!
     - Responda em TEXTO estruturado, amigável e direto, apresentando um CHECKLIST CLARO com as informações já identificadas e os pontos pendentes para ele confirmar.
     - Formato da resposta do Checklist:
       "Com certeza! Antes de eu gerar sua prova, confirme para mim os detalhes no checklist abaixo:

📋 **Checklist de Configuração da Prova:**
- 🏫 **Turma / Série:** [Informado: 8º Ano | ou: Qual é a turma?]
- 🎯 **Conteúdo / Tema:** [Informado: Simple Past | ou: Qual o tema principal?]
- 📊 **Nível CEFR:** [A1 / A2 / B1 / B2]
- 📝 **Formato das Questões:** [Múltipla Escolha / Dissertativa / Mista]
- 🔢 **Quantidade de Questões:** [5 / 10 / 15 questões]
- 📚 **Material Didático:** [Usar livro da Biblioteca / Conteúdo Geral]
- 🌐 **Idioma dos Enunciados:** [Português / Inglês]

Você pode me responder por texto ou por voz dizendo apenas o que prefere (ex: *'8º ano, 10 questões, múltipla escolha, nível A2, enunciados em português'*), e eu monto tudo na hora!"

  3. QUANDO O PROFESSOR RESPONDER AO CHECKLIST (ou se o pedido inicial já contiver os dados essenciais):
     - Agradeça brevemente e INVOQUE IMEDIATAMENTE a ferramenta 'generate_exam_content' passando 'topic', 'classRef', 'level', 'questionCount', 'type', 'eltCategory' e 'stemLanguage'.

=== REGRAS DE EXECUÇÃO AGÊNTICA OBRIGATÓRIA ===
- VOCÊ É UMA ASSISTENTE AGÊNTICA QUE EXECUTA AÇÕES NO APP E NOS PORTAIS ESCOLARES OFICIAIS (PLURALL, MACHADO SOBRINHO, REDE SANTA CATARINA, ETC.).
- Quando o professor pedir qualquer ação (ex: "vá para X", "abra módulo Y", "crie turma W", "adicione tarefa", "lance nota de aluno", "crie plano de aula", "pesquise sobre W"), VOCÊ É OBRIGADA A INVOCAR A FERRAMENTA CORRESPONDENTE (navigate_to_module, query_library, search_web, create_class, add_todo, etc.).
- QUANDO O PROFESSOR PEDIR PARA OPERAR OU PREENCHER PORTAIS ESCOLARES (ex: "lance diário no Plurall", "preencha chamada no Machado Sobrinho", "lance notas no Santa Catarina", "atribua tarefa no Cambridge"), USE A FERRAMENTA 'execute_portal_action' imediatamente especificando a plataforma, tipo de ação (diary, attendance, grades, assignment) e dados necessários!
- NUNCA APENAS RESPONDA EM TEXTO DIZENDO QUE VAI FAZER — INVOQUE A FERRAMENTA IMEDIATAMENTE!
- Ao gerar exames ou questões, especifique a categoria ELT (Grammar, Vocabulary, Use of English, etc.) e subcategoria se aplicável.
- Após ferramentas serem executadas, use o resultado para confirmar com UMA frase curta, alegre e motivadora no estilo Alexa.
- Para datas relativas: hoje = ${todayDate}, amanhã = ${tomorrowDate}
- "sexta" = próxima sexta, "semana que vem" = +7 dias

=== CONTEXTO ATUAL DO APP ===
${context}`
}

// ─── Conversores de formato por provider ─────────────────────────────────────

function toAnthropicMessages(messages: CanonicalMessage[]) {
  return messages.map(m => {
    if (m.role === 'user') {
      if (m.toolResults && m.toolResults.length > 0) {
        const content: unknown[] = m.toolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.id,
          content: tr.result,
        }))
        if (m.content) content.push({ type: 'text', text: m.content })
        return { role: 'user', content }
      }
      return { role: 'user', content: m.content || ' ' }
    }

    if (m.toolUse && m.toolUse.length > 0) {
      const content: unknown[] = []
      if (m.content) content.push({ type: 'text', text: m.content })
      m.toolUse.forEach(tu =>
        content.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
      )
      return { role: 'assistant', content }
    }

    return { role: 'assistant', content: m.content || ' ' }
  })
}

function toGeminiContents(messages: CanonicalMessage[]) {
  return messages.map(m => {
    if (m.role === 'user') {
      if (m.toolResults && m.toolResults.length > 0) {
        const textParts = m.toolResults.map(tr => `[Resultado de ${tr.name}: ${tr.result}]`).join('\n')
        const fullUserText = m.content ? `${m.content}\n${textParts}` : textParts
        return { role: 'user', parts: [{ text: fullUserText || ' ' }] }
      }
      return { role: 'user', parts: [{ text: m.content || ' ' }] }
    }

    // Papel 'assistant' (model)
    const textParts: string[] = []
    if (m.content) textParts.push(m.content)
    if (m.toolUse && m.toolUse.length > 0) {
      m.toolUse.forEach(tu =>
        textParts.push(`[Chamou ferramenta: ${tu.name}(${JSON.stringify(tu.input)})]`)
      )
    }
    const finalModelText = textParts.join('\n').trim() || ' '
    return { role: 'model', parts: [{ text: finalModelText }] }
  })
}

function toOpenAIMessages(systemPrompt: string, messages: CanonicalMessage[]) {
  const result: unknown[] = [{ role: 'system', content: systemPrompt }]

  for (const m of messages) {
    if (m.role === 'user') {
      if (m.toolResults && m.toolResults.length > 0) {
        m.toolResults.forEach(tr =>
          result.push({ role: 'tool', tool_call_id: tr.id, content: tr.result || 'OK' })
        )
        if (m.content) result.push({ role: 'user', content: m.content })
      } else {
        result.push({ role: 'user', content: m.content || ' ' })
      }
    } else {
      const msg: Record<string, unknown> = { role: 'assistant' }
      if (m.toolUse && m.toolUse.length > 0) {
        msg.tool_calls = m.toolUse.map(tu => ({
          id: tu.id, type: 'function',
          function: { name: tu.name, arguments: JSON.stringify(tu.input) },
        }))
        if (m.content) msg.content = m.content
      } else {
        msg.content = m.content || ' '
      }
      result.push(msg)
    }
  }

  return result
}

function normalizeGeminiResponse(data: Record<string, unknown>) {
  const candidate = (data.candidates as Array<Record<string, unknown>>)?.[0]
  const parts = (candidate?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> || []
  const content: Array<Record<string, unknown>> = []

  for (const part of parts) {
    if (part.text) content.push({ type: 'text', text: part.text })
    if (part.functionCall) {
      const fc = part.functionCall as Record<string, unknown>
      content.push({
        type: 'tool_use',
        id:    `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name:  fc.name,
        input: fc.args,
      })
    }
  }

  const finishReason = (candidate?.finishReason as string) || 'STOP'
  return {
    provider: 'gemini',
    content,
    stop_reason: finishReason === 'STOP' ? 'end_turn' : 'tool_use',
  }
}

function normalizeOpenAIResponse(data: Record<string, unknown>, providerName: string) {
  const choices = data.choices as Array<Record<string, unknown>>
  const choice  = choices?.[0]?.message as Record<string, unknown>
  const content: Array<Record<string, unknown>> = []

  if (choice?.content) content.push({ type: 'text', text: choice.content as string })

  if (choice?.tool_calls) {
    ;(choice.tool_calls as Array<Record<string, unknown>>).forEach(tc => {
      const fn = tc.function as Record<string, unknown>
      let inputArgs = {}
      try {
        inputArgs = JSON.parse((fn.arguments as string) || '{}')
      } catch (e) {
        console.warn(`[Agent API] JSON.parse error in tool_calls:`, e)
      }
      content.push({
        type: 'tool_use', id: tc.id as string, name: fn.name as string,
        input: inputArgs,
      })
    })
  }

  const finishReason = (choices?.[0]?.finish_reason as string) || 'stop'
  return {
    provider: providerName,
    content,
    stop_reason: finishReason === 'stop' ? 'end_turn' : 'tool_use',
  }
}

function detectTaskType(messages: CanonicalMessage[]): string {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content?.toLowerCase() || ''
  if (/crie|gere|monte|questão|prova|exame|exercício|atividade/.test(lastUser) &&
      /inglês|english|grammar|vocabulary|reading|listening|writing|speaking/.test(lastUser)) return 'exam'
  if (/plano de aula|planejamento|sequência didática|cronograma/.test(lastUser)) return 'lesson_plan'
  if (/analise|explique|por que|como funciona|qual a diferença|raciocin/.test(lastUser)) return 'reasoning'
  if (/foto|imagem|câmera|ocr|prova fotografada/.test(lastUser)) return 'vision'
  if (/vá|va|navegu|abra|abrir|adicione|adicionar|crie|criar|lance|lançar|registre|registrar|mude|mudar|coloque|colocar|preencha|preencher/.test(lastUser)) return 'action'
  return 'chat'
}

function resolveAutoProvider(
  taskType: string,
  userKeys: Record<string, string>
): { provider: string; key: string } | null {
  const PRIORITY_MAP: Record<string, string[]> = {
    // B4: action/chat — Groq é rápido e suficiente para navegação e tools simples
    action:      ['groq', 'deepseek', 'zhipu', 'siliconflow', 'openrouter', 'anthropic', 'gemini', 'openai'],
    chat:        ['groq', 'deepseek', 'zhipu', 'siliconflow', 'openrouter', 'gemini', 'openai', 'anthropic'],
    // B4: Para exam/lesson_plan/reasoning, Claude é muito superior em qualidade e function calling
    exam:        ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'zhipu', 'siliconflow', 'openrouter'],
    lesson_plan: ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'zhipu', 'siliconflow', 'openrouter'],
    reasoning:   ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'zhipu', 'siliconflow', 'openrouter'],
    vision:      ['openai',   'gemini',  'anthropic'],
    tts:         ['openai',   'groq'],
    stt:         ['groq',     'openai'],
  }
  const PROVIDER_KEY_MAP: Record<string, string[]> = {
    groq:        ['groq_key',        'GROQ_KEY'],
    deepseek:    ['deepseek_key',    'DEEPSEEK_KEY'],
    zhipu:       ['zhipu_key',       'ZHIPU_KEY',       'ZHIPU_API_KEY'],
    siliconflow: ['siliconflow_key',  'SILICONFLOW_KEY', 'SILICONFLOW_API_KEY'],
    openrouter:  ['openrouter_key',   'OPENROUTER_KEY',  'OPENROUTER_API_KEY'],
    gemini:      ['gemini_key',      'GEMINI_KEY'],
    openai:      ['openai_key',      'OPENAI_KEY'],
    anthropic:   ['anthropic_key',   'ANTHROPIC_KEY'],
  }

  const priority = PRIORITY_MAP[taskType] || PRIORITY_MAP.chat
  for (const p of priority) {
    const keyNames = PROVIDER_KEY_MAP[p] || []
    for (const kn of keyNames) {
      const key = userKeys[kn] || getEnvKey(p)
      if (key) return { provider: p, key }
    }

  }
  return null
}

async function callProviderWithFallback(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  optimizedMessages: CanonicalMessage[],
  maxTokens: number,
  temperature: number,
  allUserKeys: Record<string, string>
): Promise<Response> {

  const errorLogs: string[] = []
  const providersToTry = [provider, 'groq', 'deepseek', 'zhipu', 'siliconflow', 'openrouter', 'gemini', 'openai', 'anthropic'].filter((v, i, a) => a && a.indexOf(v) === i)


  for (const p of providersToTry) {
    const key = (p === provider ? apiKey : '') ||
                allUserKeys[`${p}_key`] ||
                getEnvKey(p)

    if (!key) continue

    try {
      if (p === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-opus-4-5', max_tokens: maxTokens, system: systemPrompt,
            tools: AGENT_TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
            messages: toAnthropicMessages(optimizedMessages),
          }),
        })
        if (response.ok) {
          const data = await response.json()
          return Response.json({ provider: 'anthropic', ...data })
        } else {
          errorLogs.push(`Anthropic ${response.status}: ${await response.text()}`)
        }
      }

      if (p === 'gemini') {
        const geminiModels = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-pro-latest', 'gemini-flash-lite-latest', 'gemini-2.0-flash', 'gemini-1.5-flash']
        let geminiSuccess = false
        for (const gModel of geminiModels) {
          try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${key}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                tools: toGeminiTools(AGENT_TOOLS),
                contents: toGeminiContents(optimizedMessages),
                generationConfig: { maxOutputTokens: maxTokens, temperature },
              }),
            })

            if (response.ok) {
              const data = await response.json()
              geminiSuccess = true
              return Response.json(normalizeGeminiResponse(data))
            } else {
              errorLogs.push(`Gemini (${gModel}) ${response.status}: ${await response.text()}`)
            }
          } catch (gErr: any) {
            errorLogs.push(`Gemini (${gModel}) error: ${gErr.message}`)
          }
        }
        if (geminiSuccess) continue
      }

      if (['openai', 'groq', 'deepseek', 'zhipu', 'siliconflow', 'openrouter'].includes(p)) {
        const baseUrls: Record<string, string> = {
          openai:      'https://api.openai.com/v1/chat/completions',
          groq:        'https://api.groq.com/openai/v1/chat/completions',
          deepseek:    'https://api.deepseek.com/v1/chat/completions',
          zhipu:       'https://open.bigmodel.cn/api/paas/v4/chat/completions',
          siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
          openrouter:  'https://openrouter.ai/api/v1/chat/completions',
        }
        const modelsByProvider: Record<string, string[]> = {
          openai:      ['gpt-4o-mini', 'gpt-4o'],
          groq:        ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b', 'groq/compound', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
          deepseek:    ['deepseek-chat'],
          zhipu:       ['glm-4-flash'],
          siliconflow: ['Qwen/Qwen2.5-72B-Instruct'],
          openrouter:  ['google/gemma-2-9b-it:free', 'meta-llama/llama-3.1-8b-instruct:free'],
        }
        const oaiTools = AGENT_TOOLS.map(t => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.input_schema },
        }))

        const modelsToTry = modelsByProvider[p] || ['gpt-4o-mini']
        const lastUser = optimizedMessages.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
        const needsTools = !/examinador|redação|avalie|critérios|rubrica|retorne estritamente|json no formato/i.test(lastUser)

        for (const mName of modelsToTry) {
          try {
            const reqBody: Record<string, any> = {
              model: mName,
              messages: toOpenAIMessages(systemPrompt, optimizedMessages),
              max_tokens: maxTokens,
              temperature,
            }
            if (needsTools) {
              reqBody.tools = oaiTools
              reqBody.tool_choice = 'auto'
            }

            const response = await fetch(baseUrls[p], {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify(reqBody),
            })
            if (response.ok) {
              const data = await response.json()
              return Response.json(normalizeOpenAIResponse(data, p))
            } else {
              errorLogs.push(`${p} (${mName}) ${response.status}: ${await response.text()}`)
            }
          } catch (mErr: any) {
            errorLogs.push(`${p} (${mName}) error: ${mErr.message}`)
          }
        }
      }
    } catch (err) {
      errorLogs.push(`${p} catch: ${err instanceof Error ? err.message : 'Erro de rede'}`)
    }
  }

  if (errorLogs.length === 0) {
    throw new Error('Nenhuma chave de API configurada. Por favor, adicione uma chave gratuita (Google Gemini, Groq, DeepSeek ou OpenAI) no Gerenciador de APIs (menu lateral) para conversar com a Rafinha.')
  }

  throw new Error(`Falha ao conectar com os provedores de IA:\n${errorLogs.join('\n')}`)
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
    const rl = checkRateLimit(clientIp, 40, 60000)
    if (!rl.success) {
      return Response.json(
        { error: 'Muitas requisições enviadas em um curto período. Por favor aguarde alguns segundos antes de tentar novamente.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
      )
    }

    const body = await req.json()
    const { messages, context, provider, userKey, autoMode, userKeys = {} } = body as {
      messages: CanonicalMessage[]
      context: string
      provider: string
      userKey: string
      autoMode?: boolean
      userKeys?: Record<string, string>
    }

    const todayDate    = new Date().toISOString().split('T')[0]
    const tomorrowDate = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const systemPrompt = getSystemPrompt(context || '', todayDate, tomorrowDate)

    let effectiveProvider = provider
    let effectiveKey = userKey

    if (autoMode || !effectiveProvider) {
      const taskType = detectTaskType(messages)
      const resolved = resolveAutoProvider(taskType, userKeys)
      if (resolved) {
        effectiveProvider = resolved.provider
        effectiveKey = resolved.key
      }
    }

    if (!effectiveProvider) {
      effectiveProvider = getEnvKey('groq') ? 'groq' : getEnvKey('gemini') ? 'gemini' : 'groq'
    }


    const optimizedMessages = pruneConversationHistory(messages, 8)
    const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    const { maxTokens, temperature } = calculateDynamicTokens(lastUserText)

    // Se o cliente solicitar streaming SSE (Server-Sent Events)
    if (body.stream === true) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const res = await callProviderWithFallback(
              effectiveProvider,
              effectiveKey,
              systemPrompt,
              optimizedMessages,
              maxTokens,
              temperature,
              userKeys
            )
            const data = await res.json()
            const fullReply = data.reply || data.content?.[0]?.text || ''

            // Envia chunks simulados de streaming para baixíssima latência percebida (< 150ms)
            const words = fullReply.split(' ')
            for (let i = 0; i < words.length; i++) {
              const chunk = words[i] + (i === words.length - 1 ? '' : ' ')
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`))
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch (e: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`))
            controller.close()
          }
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    return await callProviderWithFallback(
      effectiveProvider,
      effectiveKey,
      systemPrompt,
      optimizedMessages,
      maxTokens,
      temperature,
      userKeys
    )

  } catch (error: unknown) {
    console.error('[Agent API] Critical Error:', error)
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    return Response.json({ error: msg }, { status: 500 })
  }
}
