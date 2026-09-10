import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-byok-key, x-byok-provider',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const headerKey = req.headers.get('x-byok-key')
    const headerProvider = req.headers.get('x-byok-provider')

    const byokKey = (headerKey || body.byokKey || body.userKey || body.apiKey || '').trim()
    const provider = (headerProvider || body.provider || body.byokProvider || (byokKey.startsWith('gsk_') ? 'groq' : 'gemini')).toLowerCase()

    if (!byokKey) {
      return NextResponse.json({
        ok: false,
        error: 'Nenhuma chave de API (BYOK) informada para validação semântica.',
      }, { status: 400, headers: corsHeaders })
    }

    const records = body.records || []
    const expectedColumns = body.columns || body.expectedColumns || []
    const taskName = body.taskName || 'Extração de Dados'

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({
        ok: true,
        valid: false,
        confidence: 0,
        reasoning: 'Nenhum registro foi fornecido para validação.',
      }, { headers: corsHeaders })
    }

    // Amostra dos primeiros 10 registros para validação pelo LLM
    const sampleRecords = records.slice(0, 10)
    const sampleJsonStr = JSON.stringify(sampleRecords, null, 2)
    const colsStr = JSON.stringify(expectedColumns, null, 2)

    const prompt = `Você é o Validador Semântico de Plausibilidade do Teacher AI.
Sua função é analisar dados extraídos de um portal escolar web e determinar se eles correspondem a dados escolares válidos (como nomes de alunos, matrículas, notas de verdade) ou se são lixo/elementos de UI/itens de menu que foram capturados por engano (ex: "Sair", "Alterar Senha", "Início", "Menu", "Configurações").

Tarefa executada: "${taskName}"
Colunas semânticas esperadas:
${colsStr}

Primeiros registros extraídos da página (Amostra):
${sampleJsonStr}

REGRAS DE JULGAMENTO:
1. Se os valores contiverem itens de navegação do portal (ex: "Sair", "Minha Conta", "Alterar Senha", "Professores", "Ajuda", "Home") ou termos genéricos de interface, o resultado É INVÁLIDO. Defina valid=false e confidence < 0.4.
2. Se os valores forem nomes próprios de pessoas reais (ex: "Alice Silva", "Bruno Souza", "João Pedro") ou tabelas de notas reais, o resultado É VÁLIDO. Defina valid=true e confidence entre 0.85 e 1.0.
3. Se os dados forem muito curtos, ambíguos ou incompletos, defina confidence proporcional (ex: 0.5 a 0.65).

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "valid": boolean,
  "confidence": number, // entre 0.0 e 1.0
  "reasoning": "Breve justificativa em português de 1 frase explicando a avaliação"
}`

    let llmResponseJson: any = null

    if (provider === 'groq' || byokKey.startsWith('gsk_')) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${byokKey}`,
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: 'Você responde apenas com JSON válido e puro.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      })

      if (groqRes.ok) {
        const data = await groqRes.json()
        const content = data.choices?.[0]?.message?.content || '{}'
        llmResponseJson = JSON.parse(content)
      } else {
        const errText = await groqRes.text()
        console.warn(`[ValidateResult] Groq retornou HTTP ${groqRes.status}: ${errText}`)
      }
    } else {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${byokKey}`
      try {
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        })

        if (geminiRes.ok) {
          const data = await geminiRes.json()
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
          llmResponseJson = JSON.parse(rawText)
        } else {
          const errText = await geminiRes.text()
          console.warn(`[ValidateResult] Gemini retornou HTTP ${geminiRes.status}: ${errText}`)
        }
      } catch (gemErr) {
        console.warn('[ValidateResult] Exceção na chamada Gemini:', gemErr)
      }
    }

    // Fallback heurístico determinístico caso o LLM falhe ou não responda
    if (!llmResponseJson) {
      const firstNames = sampleRecords.map((r: any) => String(r.name || r.aluno_nome || Object.values(r)[0] || '')).join(' ')
      const containsNavKeywords = /sair|senha|inicio|menu|configura/i.test(firstNames)
      if (containsNavKeywords) {
        llmResponseJson = {
          valid: false,
          confidence: 0.2,
          reasoning: 'Registros contêm palavras-chave de navegação do portal (fallback heurístico).'
        }
      } else {
        llmResponseJson = {
          valid: true,
          confidence: 0.85,
          reasoning: 'Registros parecem válidos com base na estrutura da amostra (fallback heurístico).'
        }
      }
    }

    return NextResponse.json({
      ok: true,
      valid: Boolean(llmResponseJson.valid),
      confidence: Number(llmResponseJson.confidence ?? 0.5),
      reasoning: llmResponseJson.reasoning || 'Validação concluída.'
    }, { headers: corsHeaders })

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message || 'Erro ao validar resultado semântico'
    }, { status: 500, headers: corsHeaders })
  }
}
