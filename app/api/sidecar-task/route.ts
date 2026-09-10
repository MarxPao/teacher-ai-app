import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const POLL_INTERVAL_MS = 1500
const MAX_WAIT_MS = 30_000

/**
 * GET /api/sidecar-task
 * Retorna o estado atual da conexão com o navegador (sem jargões):
 * - ready: Navegador conectado e pronto para leitura
 * - needs_activation: Chrome aberto normalmente (precisa preparar/conectar)
 * - closed: Chrome não está aberto
 */
export async function GET() {
  try {
    const cdpRes = await fetch('http://127.0.0.1:9222/json/version', {
      signal: AbortSignal.timeout(800)
    }).catch(() => null)

    if (cdpRes && cdpRes.ok) {
      return NextResponse.json({
        state: 'ready',
        message: 'Navegador conectado e pronto para leitura.'
      })
    }

    // Verifica se o processo chrome.exe está ativo no Windows
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq chrome.exe" /NH')
        if (stdout && stdout.toLowerCase().includes('chrome.exe')) {
          return NextResponse.json({
            state: 'needs_activation',
            message: 'O Chrome está aberto, mas precisa ser preparado para leitura com restauração de abas.'
          })
        }
      } catch {}
    }

    return NextResponse.json({
      state: 'closed',
      message: 'O Google Chrome não está aberto no momento.'
    })
  } catch {
    return NextResponse.json({
      state: 'closed',
      message: 'Não foi possível verificar o status do navegador.'
    })
  }
}

/**
 * POST /api/sidecar-task
 * Processa ações do navegador:
 * - 'prepare_chrome' / 'connect_browser': Reinicia o Chrome suavemente com --restore-last-session
 * - 'read_page_content': Extrai dados do portal/página via Sidecar
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, goal, pageHint, outputFormat } = body

    if (!action) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: action.' },
        { status: 400 }
      )
    }

    // ─── AÇÃO DE 1 CLIQUE: PREPARAR NAVEGADOR ──────────────────────────────
    if (action === 'prepare_chrome' || action === 'connect_browser' || action === 'reconnect_chrome') {
      try {
        const sidecarDir = path.resolve(process.cwd(), 'sidecar')
        const pyCmd = `python -c "import sys; sys.path.insert(0, r'${sidecarDir}'); from cdp_connector import CDPConnector; ok, msg = CDPConnector.relaunch_chrome_with_cdp('Profile 1'); print(msg); sys.exit(0 if ok else 1)"`

        const { stdout } = await execAsync(pyCmd, { cwd: sidecarDir, timeout: 15000 })
        const outputMsg = stdout.trim() || 'Navegador preparado com sucesso! Todas as suas abas foram restauradas.'

        return NextResponse.json({
          success: true,
          message: outputMsg,
          status: 'ready'
        })
      } catch (execErr: any) {
        console.error('[sidecar-task] Erro ao preparar Chrome:', execErr)
        return NextResponse.json({
          error: 'Não foi possível preparar o navegador automaticamente. Verifique se o Google Chrome está instalado e tente novamente.'
        }, { status: 500 })
      }
    }

    // ─── AÇÕES DE LEITURA / AUTOMAÇÃO VIA CDP DIRETO ──────────────────────────
    if (action === 'read_page_content' || action === 'read_roster' || action === 'rediscover_portal') {
      try {
        const sidecarDir = path.resolve(process.cwd(), 'sidecar')
        const scriptPath = path.join(sidecarDir, 'read_active_portal.py')
        const safeGoal = (goal || 'lista de alunos da turma').replace(/"/g, '\\"')
        const safeHint = (pageHint || '').replace(/"/g, '\\"')
        const safeFormat = (outputFormat || 'students').replace(/"/g, '\\"')
        const safeForce = (body.forceDiscovery || action === 'rediscover_portal') ? 'true' : 'false'

        const pyCmd = `python "${scriptPath}" "${safeGoal}" "${safeHint}" "${safeFormat}" "${safeForce}"`
        const { stdout } = await execAsync(pyCmd, {
          cwd: sidecarDir,
          timeout: 45000,
          encoding: 'utf-8',
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        })

        const lines = stdout.trim().split('\n')
        const jsonLine = lines.reverse().find(l => l.trim().startsWith('{') && l.trim().endsWith('}'))

        if (jsonLine) {
          const parsed = JSON.parse(jsonLine)
          if (parsed.success) {
            return NextResponse.json({
              success: true,
              message: `Leitura realizada com sucesso (${parsed.total || 0} alunos encontrados via ${parsed.layer_used || 'pipeline'}).`,
              students: parsed.students || [],
              total: parsed.total || 0,
              layer_used: parsed.layer_used || 'layer_1_deterministic',
              map_source: parsed.map_source || 'known_map',
              status: parsed.status || 'mapped_untested',
              discovered_map: parsed.discovered_map || null,
              structured_log: parsed.structured_log || [],
              immediate_verification_passed: parsed.immediate_verification_passed ?? true,
              page_title: parsed.page_title || '',
              page_url: parsed.page_url || '',
              section_used: parsed.section_used || '',
              result: parsed
            })
          } else {
            return NextResponse.json({
              error: parsed.error || parsed.failure_reason || 'Nenhum dado pôde ser extraído da página aberta no navegador.',
              layer_used: parsed.layer_used,
              map_source: parsed.map_source,
              status: parsed.status,
              validation_failures: parsed.validation_failures,
              structured_log: parsed.structured_log || [],
              immediate_verification_passed: parsed.immediate_verification_passed ?? false,
              page_title: parsed.page_title,
              page_url: parsed.page_url,
              result: parsed
            }, { status: 422 })
          }
        }
      } catch (directErr: any) {
        console.error('[sidecar-task] Erro na execução direta do PageReader:', directErr)

        // Se o processo produziu JSON antes de erro/saída, aproveita
        const rawOut = (directErr.stdout || '').trim()
        if (rawOut) {
          const lines = rawOut.split('\n')
          const jsonLine = lines.reverse().find((l: string) => l.trim().startsWith('{') && l.trim().endsWith('}'))
          if (jsonLine) {
            try {
              const parsed = JSON.parse(jsonLine)
              return NextResponse.json({
                error: parsed.error || 'Falha ao processar a página.',
                page_title: parsed.page_title,
                page_url: parsed.page_url,
                result: parsed
              }, { status: 422 })
            } catch {}
          }
        }

        const isTimeout = directErr.killed || directErr.signal === 'SIGTERM'
        const errorMsg = isTimeout
          ? 'Tempo limite excedido ao analisar a página no navegador. Certifique-se de que a planilha com os alunos está visível e tente novamente.'
          : (directErr.message || 'Falha ao executar o leitor no navegador dedicado. Verifique se o navegador está aberto com a turma visível.')

        return NextResponse.json({
          error: errorMsg
        }, { status: isTimeout ? 504 : 422 })
      }
    }

    // ─── AÇÕES DE LEITURA / AUTOMAÇÃO VIA FILA DO SIDECAR (FALLBACK) ───────────
    if (!goal) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: goal.' },
        { status: 400 }
      )
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json(
        { error: 'Configuração do servidor incompleta. SUPABASE_URL ou SUPABASE_ANON_KEY não definidos.' },
        { status: 503 }
      )
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    }

    // Tenta extrair teacher_id do header Authorization do request original
    const authHeader = req.headers.get('authorization') || ''
    let teacherId = 'sidecar_local'
    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7)
        const payloadB64 = token.split('.')[1]
        if (payloadB64) {
          const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
          const payload = JSON.parse(payloadJson)
          if (payload.sub) teacherId = payload.sub
        }
      } catch {
        // usa placeholder
      }
    }

    // Insere tarefa na fila do Sidecar via REST
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/browser_automation_tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        teacher_id: teacherId,
        action_type: action,
        portal: pageHint || 'any',
        status: 'drafted',
        payload: {
          action_type: action,
          extraction_goal: goal,
          page_hint: pageHint || '',
          output_format: outputFormat || 'students',
          ...(body.payload || {}),
        },
      }),
    })

    if (!insertRes.ok) {
      const errText = await insertRes.text()
      console.error('[sidecar-task] Erro ao inserir tarefa:', errText)
      return NextResponse.json(
        { error: 'O aplicativo de apoio (Sidecar Desktop) não está disponível. Certifique-se de que ele esteja aberto no seu computador.' },
        { status: 503 }
      )
    }

    const inserted = await insertRes.json()
    const task = Array.isArray(inserted) ? inserted[0] : inserted
    const taskId = task?.id

    if (!taskId) {
      return NextResponse.json(
        { error: 'Falha ao registrar a solicitação no aplicativo de apoio. ID não retornado.' },
        { status: 503 }
      )
    }

    // Polling aguarda o Sidecar completar a tarefa (max 30s)
    const deadline = Date.now() + MAX_WAIT_MS
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

      const pollRes = await fetch(
        `${SUPABASE_URL}/rest/v1/browser_automation_tasks?id=eq.${encodeURIComponent(taskId)}&select=status,payload`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      )

      if (!pollRes.ok) continue

      const pollData = await pollRes.json()
      const polledTask = Array.isArray(pollData) ? pollData[0] : null
      if (!polledTask) continue

      if (polledTask.status === 'done') {
        const p = polledTask.payload || {}
        return NextResponse.json({
          success: true,
          message: p.message || 'Leitura realizada com sucesso.',
          students: p.scraped_students || [],
          total: p.total_scraped || 0,
          page_title: p.page_title || '',
          page_url: p.page_url || '',
          result: p,
        })
      }

      if (polledTask.status === 'error') {
        const errMsg = polledTask.payload?.error_message || 'Erro durante a operação no navegador.'
        return NextResponse.json({ error: errMsg }, { status: 422 })
      }
    }

    // Timeout — marca task como erro
    await fetch(
      `${SUPABASE_URL}/rest/v1/browser_automation_tasks?id=eq.${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'error',
          payload: { error_message: 'Tempo limite excedido (30s).' },
        }),
      }
    )

    return NextResponse.json(
      { error: 'O aplicativo de apoio não respondeu a tempo (30s). Verifique se o navegador está aberto com a aba desejada.' },
      { status: 504 }
    )

  } catch (err) {
    console.error('[sidecar-task] Erro interno:', err)
    return NextResponse.json({ error: 'Erro interno ao processar tarefa.' }, { status: 500 })
  }
}
