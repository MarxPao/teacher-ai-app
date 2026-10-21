/**
 * bench/autoImprove.ts
 * Gap 7 — Ciclo de auto-melhoria automática contra banco de bench
 *
 * Roda os casos falhos do bench, analisa o motivo da falha via LLM
 * e gera/atualiza o SkillGraph para corrigir o problema.
 *
 * Uso:
 *   npx tsx bench/autoImprove.ts --tasks T05,T12 --model gemini-2.0-flash
 *   npx tsx bench/autoImprove.ts --all-failing --model gemini-2.0-flash
 *
 * Saída: bench/improvements/<taskId>_<timestamp>.skillgraph.json
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface BenchResult {
  taskId: string
  passed: boolean
  steps: number
  llmCalls: number
  errorCode?: string
  tracePath?: string
}

interface ImprovementSuggestion {
  taskId: string
  rootCauseCategory:
    | 'anchor_drift'
    | 'missing_wait'
    | 'wrong_host'
    | 'iframe_not_handled'
    | 'shadow_dom'
    | 'cascading_select'
    | 'session_expired'
    | 'destructive_blocked'
    | 'other'
  suggestedFix: string
  updatedSkillGraphPatch?: Record<string, unknown>
}

// ─── Parsing de resultados do bench ──────────────────────────────────────────

function parseBenchResults(resultsDir: string): BenchResult[] {
  if (!fs.existsSync(resultsDir)) {
    console.warn(`[autoImprove] Diretório de resultados não encontrado: ${resultsDir}`)
    return []
  }

  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'))
  const results: BenchResult[] = []

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(resultsDir, file), 'utf-8'))
      if (Array.isArray(raw)) {
        results.push(...raw)
      } else if (raw.taskId) {
        results.push(raw)
      }
    } catch {
      // arquivo malformado — ignora
    }
  }

  return results
}

function getFailingTasks(results: BenchResult[], taskFilter?: string[]): BenchResult[] {
  const failing = results.filter(r => !r.passed)
  if (taskFilter && taskFilter.length > 0) {
    return failing.filter(r => taskFilter.includes(r.taskId))
  }
  return failing
}

// ─── Análise de causa raiz (heurística determinística) ───────────────────────

function analyzeRootCause(result: BenchResult, tracePath?: string): ImprovementSuggestion['rootCauseCategory'] {
  const error = result.errorCode?.toLowerCase() ?? ''
  const trace = tracePath && fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf-8').toLowerCase() : ''

  if (error.includes('anchor_not_found') || trace.includes('anchor_not_found')) return 'anchor_drift'
  if (error.includes('timeout') || trace.includes('ajaxdelay') || trace.includes('cascad')) return 'cascading_select'
  if (error.includes('host_not_allowed') || trace.includes('host_not_allowed')) return 'wrong_host'
  if (trace.includes('shadow') || trace.includes('shadowdom') || trace.includes('shadow-dom')) return 'shadow_dom'
  if (trace.includes('iframe') || trace.includes('cross-origin')) return 'iframe_not_handled'
  if (trace.includes('session') || trace.includes('sessão expirando')) return 'session_expired'
  if (trace.includes('wait') || trace.includes('modal') || trace.includes('animat')) return 'missing_wait'
  if (trace.includes('destrutiv') || trace.includes('bloqueado')) return 'destructive_blocked'
  return 'other'
}

// ─── Geração de patch de SkillGraph ─────────────────────────────────────────

function buildSkillGraphPatch(
  taskId: string,
  category: ImprovementSuggestion['rootCauseCategory']
): Record<string, unknown> {
  const patches: Record<string, Record<string, unknown>> = {
    anchor_drift: {
      _improvement: `${taskId}: adicionar candidatos alternativos de âncora (strategy: aria_label, placeholder) e aumentar retry.max_attempts para 3`,
      suggested_node_patch: {
        retry: { max_attempts: 3, backoff_ms: 800 },
        anchor: { candidates: [{ strategy: 'role_name' }, { strategy: 'aria_label' }, { strategy: 'placeholder' }] },
      },
    },
    cascading_select: {
      _improvement: `${taskId}: adicionar nó WAIT após cada select em cascata (turma→disciplina→mês→dia) antes do próximo WRITE`,
      suggested_node_patch: {
        wait_after_select_ms: 1200,
        note: 'Inserir WAIT(1200ms) entre cada select em cascata AJAX',
      },
    },
    shadow_dom: {
      _improvement: `${taskId}: ativar shadow_pierce:true no scope da âncora do bimestre`,
      suggested_node_patch: {
        anchor: { scope: { shadow_pierce: true } },
      },
    },
    iframe_not_handled: {
      _improvement: `${taskId}: especificar frame.match='url_pattern' com valor do host do iframe de outra origem`,
      suggested_node_patch: {
        anchor: { scope: { frame: { match: 'url_pattern', value: '<URL_DO_IFRAME>' } } },
      },
    },
    session_expired: {
      _improvement: `${taskId}: detectar modal de sessão expirando e adicionar nó CLICK para confirmar antes de prosseguir`,
      suggested_node_patch: {
        session_guard: { detect_selector: '.modal-sessao, [data-session-warning]', action: 'click_ok' },
      },
    },
    missing_wait: {
      _improvement: `${taskId}: adicionar WAIT(800ms) após navegação ou clique que abre modal`,
      suggested_node_patch: { wait_after_action_ms: 800 },
    },
    wrong_host: {
      _improvement: `${taskId}: expandir allowed_hosts para incluir o host do SSO/login`,
      suggested_node_patch: { allowed_hosts: ['<HOST_PRINCIPAL>', '<HOST_SSO>'] },
    },
    destructive_blocked: {
      _improvement: `${taskId}: marcar botões de ação final (Salvar, Publicar) como is_submit_action:true e adicionar CHECKPOINT antes`,
      suggested_node_patch: { is_submit_action: true, checkpoint_before: true },
    },
    other: {
      _improvement: `${taskId}: revisar manualmente o trace para identificar a causa raiz`,
      suggested_node_patch: {},
    },
  }

  return patches[category] ?? patches.other
}

// ─── Chamada LLM para sugestão refinada (opcional) ───────────────────────────

async function refineSuggestionWithLLM(
  suggestion: ImprovementSuggestion,
  traceSnippet: string,
  model: string,
  apiKey: string
): Promise<string> {
  // Usa apenas a API do Gemini (mais rápida e sem custo alto)
  const prompt = `Você é um especialista em automação de portais escolares.
Tarefa: ${suggestion.taskId}
Categoria de falha: ${suggestion.rootCauseCategory}
Sugestão inicial: ${suggestion.suggestedFix}
Trecho do trace de erro:
${traceSnippet.slice(0, 2000)}

Descreva em 3-5 linhas técnicas o patch mais provável para corrigir esse caso no SkillGraph v2.
Inclua: tipo do nó a modificar, campo a mudar, valor sugerido.
Responda APENAS com o patch em JSON puro (sem markdown).`

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
        }),
      }
    )
    if (!resp.ok) return suggestion.suggestedFix
    const data = await resp.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? suggestion.suggestedFix
  } catch {
    return suggestion.suggestedFix
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const taskFilterArg = args.find(a => a.startsWith('--tasks=') || a.startsWith('--tasks '))
  const allFailing = args.includes('--all-failing')
  const modelArg = args.find(a => a.startsWith('--model='))
  const model = modelArg ? modelArg.split('=')[1] : 'gemini-2.0-flash'

  const taskFilter = taskFilterArg
    ? taskFilterArg.replace(/--tasks[= ]/, '').split(',').map(s => s.trim())
    : undefined

  const resultsDir = path.resolve('bench/results')
  const outDir = path.resolve('bench/improvements')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const allResults = parseBenchResults(resultsDir)
  if (allResults.length === 0) {
    console.log('[autoImprove] Nenhum resultado de bench encontrado. Execute o bench primeiro.')
    process.exit(0)
  }

  const total = allResults.length
  const passed = allResults.filter(r => r.passed).length
  console.log(`[autoImprove] Resultados: ${passed}/${total} passaram (${Math.round(passed / total * 100)}%)`)

  const failing = getFailingTasks(allResults, allFailing ? undefined : taskFilter)
  if (failing.length === 0) {
    console.log('[autoImprove] Nenhum caso falho para melhorar. ✓')
    process.exit(0)
  }

  console.log(`[autoImprove] Analisando ${failing.length} caso(s) falho(s)...`)

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || ''
  const improvements: ImprovementSuggestion[] = []

  for (const result of failing) {
    const tracePath = result.tracePath ?? path.join(resultsDir, `${result.taskId}_trace.txt`)
    const category = analyzeRootCause(result, tracePath)
    const patch = buildSkillGraphPatch(result.taskId, category)

    const suggestion: ImprovementSuggestion = {
      taskId: result.taskId,
      rootCauseCategory: category,
      suggestedFix: patch._improvement as string,
      updatedSkillGraphPatch: patch,
    }

    // Refinamento via LLM (se chave disponível)
    if (apiKey && fs.existsSync(tracePath)) {
      const traceSnippet = fs.readFileSync(tracePath, 'utf-8')
      suggestion.suggestedFix = await refineSuggestionWithLLM(suggestion, traceSnippet, model, apiKey)
    }

    improvements.push(suggestion)

    const outFile = path.join(outDir, `${result.taskId}_${Date.now()}.improvement.json`)
    fs.writeFileSync(outFile, JSON.stringify(suggestion, null, 2))
    console.log(`  [${result.taskId}] ${category} → ${outFile}`)
  }

  // Resumo final
  const summaryFile = path.join(outDir, `summary_${Date.now()}.json`)
  fs.writeFileSync(summaryFile, JSON.stringify({ baseline: `${passed}/${total}`, improvements }, null, 2))
  console.log(`\n[autoImprove] Sugestões salvas em bench/improvements/`)
  console.log(`[autoImprove] Próximo passo: revise os arquivos .improvement.json e aplique os patches nos SkillGraphs correspondentes.`)
}

main().catch(err => {
  console.error('[autoImprove] Erro fatal:', err)
  process.exit(1)
})
