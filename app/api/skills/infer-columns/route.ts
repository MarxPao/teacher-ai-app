import { NextRequest, NextResponse } from 'next/server'
import { ColumnMetadata, SemanticType } from '@/lib/skills/skillGraphSchema'

const VALID_SEMANTIC_TYPES: SemanticType[] = [
  'identifier',
  'name',
  'numeric_grade',
  'date',
  'status',
  'free_text_message',
  'other',
]

function fallbackInferColumn(header: string, samples: string[]): SemanticType {
  const h = (header || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (/nome|aluno|estudante|student/i.test(h)) return 'name'
  if (/matr[ií]cul|c[oó]d|registro|\bra\b|\bid\b/i.test(h)) return 'identifier'
  if (/nota|ponto|bim|rec|media|m[eé]dia|aval|prova|teste/i.test(h)) return 'numeric_grade'
  if (/data|date|dia|prazo|vencimento|entrega/i.test(h)) return 'date'
  if (/situa[cç]|status|estado|frequencia|presen[cç]|falta/i.test(h)) return 'status'
  if (/msg|mensag|obs|observa|coment|recado|pauta/i.test(h)) return 'free_text_message'

  if (samples.length > 0) {
    const isNum = samples.every(s => !isNaN(parseFloat(s.replace(',', '.'))))
    if (isNum) return 'numeric_grade'
    const isDate = samples.every(s => /\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}/.test(s))
    if (isDate) return 'date'
  }

  return 'other'
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const body = await req.json()
    const { headers = [], sampleRows = [] } = body

    if (!Array.isArray(headers) || headers.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Lista de cabeçalhos (headers) é obrigatória.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const samplesPerCol: Record<string, string[]> = {}
    headers.forEach((h: string, colIdx: number) => {
      const colSamples: string[] = []
      for (const row of sampleRows) {
        if (Array.isArray(row) && row[colIdx] !== undefined && row[colIdx] !== null) {
          const val = String(row[colIdx]).trim()
          if (val && !colSamples.includes(val)) {
            colSamples.push(val.slice(0, 50))
          }
          if (colSamples.length >= 3) break
        }
      }
      samplesPerCol[h] = colSamples
    })

    const groqKey = process.env.GROQ_API_KEY || ''
    const geminiKey = process.env.GEMINI_API_KEY || ''
    let llmInferred: Record<string, SemanticType> | null = null
    let modelUsed: string = 'deterministic_fallback'

    if (groqKey) {
      try {
        const prompt = `Você é um especialista em análise de dados pedagógicos e tabelas escolares.
Analise cada cabeçalho de coluna e suas amostras de valores e classifique seu tipo semântico estritamente em uma das seguintes opções:
- identifier: código único, matrícula, ID, RA
- name: nome de pessoa, aluno, responsável, professor
- numeric_grade: nota numérica, pontos, média, avaliação parcial/final
- date: data de entrega, nascimento, limite, aula
- status: situação de matrícula (matriculado, evadido), presença/falta, estado
- free_text_message: observações, pauta, texto livre longo, comentários
- other: qualquer coluna que não se enquadre nas anteriores

Dados para análise:
${headers.map((h: string, i: number) => `${i + 1}. Coluna "${h}" — Amostras: [${(samplesPerCol[h] || []).join(', ')}]`).join('\n')}

Responda ESTRITAMENTE em formato JSON com o formato:
{
  "classifications": [
    { "header": "Nome da Coluna", "semantic_type": "name" }
  ]
}`

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-20b',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          }),
        })

        if (groqRes.ok) {
          const data = await groqRes.json()
          const content = data.choices?.[0]?.message?.content
          if (content) {
            const parsed = JSON.parse(content)
            const list = parsed.classifications || []
            llmInferred = {}
            for (const item of list) {
              if (item.header && VALID_SEMANTIC_TYPES.includes(item.semantic_type)) {
                llmInferred[item.header] = item.semantic_type
              }
            }
            modelUsed = 'groq/openai/gpt-oss-20b'
          }
        }
      } catch (err) {
        console.warn('[InferColumns] Erro no Groq, tentando Gemini ou fallback:', err)
      }
    }

    if (!llmInferred && geminiKey) {
      try {
        const prompt = `Analise os cabeçalhos e amostras escolares e classifique em: identifier, name, numeric_grade, date, status, free_text_message, other.
Colunas:
${headers.map((h: string, i: number) => `${i + 1}. "${h}": [${(samplesPerCol[h] || []).join(', ')}]`).join('\n')}

Responda estritamente com JSON: { "classifications": [ { "header": string, "semantic_type": string } ] }`

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
          }),
        })

        if (geminiRes.ok) {
          const data = await geminiRes.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            const parsed = JSON.parse(text)
            const list = parsed.classifications || []
            llmInferred = {}
            for (const item of list) {
              if (item.header && VALID_SEMANTIC_TYPES.includes(item.semantic_type)) {
                llmInferred[item.header] = item.semantic_type
              }
            }
            modelUsed = 'gemini/gemini-3.6-flash'
          }
        }
      } catch (err) {
        console.warn('[InferColumns] Erro no Gemini:', err)
      }
    }

    const columns: ColumnMetadata[] = headers.map((header: string, idx: number) => {
      const variableName = header
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `col_${idx}`
      const key = `col_${idx}_${variableName.slice(0, 20)}`
      const isLlm = Boolean(llmInferred && llmInferred[header])
      const semanticType = (llmInferred && llmInferred[header]) || fallbackInferColumn(header, samplesPerCol[header] || [])
      return {
        key,
        label: header,
        original_header: header,
        semantic_type: semanticType,
        variable_name: variableName,
        sample_values: samplesPerCol[header] || [],
        confidence: isLlm ? 0.95 : 0.75,
        reasoning: isLlm
          ? `Classificado como ${semanticType} via LLM (${modelUsed})`
          : `Classificado como ${semanticType} via heurística determinística`,
        included: true,
      }
    })

    return NextResponse.json({
      ok: true,
      columns,
      modelUsed,
      headersCount: headers.length,
    }, { headers: corsHeaders })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: 'Erro ao inferir colunas semânticas: ' + err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
