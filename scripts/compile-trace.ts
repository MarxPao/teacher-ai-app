// scripts/compile-trace.ts
// CLI determinística para compilação de traces gravados em SkillGraph v2

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../lib/compiler/compile'
import { analyzeTrace } from '../lib/compiler/analyze'
import { CompilerError } from '../lib/compiler/report'
import type { CompilerDecisions } from '../lib/compiler/decisions'

function run() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Uso: npx tsx scripts/compile-trace.ts <trace.json> [decisions.json] [output.json]')
    process.exit(1)
  }

  const tracePath = path.resolve(process.cwd(), args[0])
  if (!fs.existsSync(tracePath)) {
    console.error(`[ERRO] Arquivo de trace não encontrado: ${tracePath}`)
    process.exit(1)
  }

  const traceRaw = JSON.parse(fs.readFileSync(tracePath, 'utf-8'))

  let decisions: CompilerDecisions
  if (args[1] && fs.existsSync(path.resolve(process.cwd(), args[1]))) {
    decisions = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args[1]), 'utf-8'))
  } else {
    // Infere decisões padrão através do analyzeTrace
    const analysis = analyzeTrace(traceRaw)
    decisions = {
      task_id: traceRaw.task_id || 'read_roster',
      portal_id: analysis.defaultDecisions.portal_id || 'portal_escolar',
      task_name: `Execução de ${traceRaw.task_id || 'tarefa'}`,
      allowed_hosts: analysis.detections.detectedHosts.length > 0 ? analysis.detections.detectedHosts : ['localhost'],
      row_key_column: analysis.defaultDecisions.row_key_column,
      attendance_polarity: analysis.detections.suggestedPolarity || undefined,
      grade_scale: analysis.detections.suggestedGradeScale
        ? { type: 'numeric', min: analysis.detections.suggestedGradeScale.min, max: analysis.detections.suggestedGradeScale.max, decimal_separator: ',' }
        : undefined,
    }
  }

  try {
    const result = compile(traceRaw, decisions)
    const jsonStr = JSON.stringify(result.graph, null, 2)

    const outputPath = args[2] ? path.resolve(process.cwd(), args[2]) : null
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, jsonStr, 'utf-8')
      console.log(`[OK] SkillGraph compilado com sucesso salvo em: ${outputPath}`)
    } else {
      console.log(jsonStr)
    }

    if (result.report.warnings.length > 0) {
      console.warn(`[AVISO] Compilado com ${result.report.warnings.length} aviso(s):`)
      for (const w of result.report.warnings) {
        console.warn(` - [${w.code}] ${w.message}`)
      }
    }
  } catch (err) {
    if (err instanceof CompilerError) {
      console.error(`[FALHA_COMPILACAO] [${err.code}] ${err.message}`)
      process.exit(2)
    }
    console.error('[ERRO_INESPERADO]', err)
    process.exit(3)
  }
}

run()
