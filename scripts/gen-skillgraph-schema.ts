import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { SkillGraphV2Schema } from '../lib/contracts/skillgraph'

export function generateSkillGraphSchema() {
  const jsonSchema = z.toJSONSchema(SkillGraphV2Schema, {
    target: 'jsonSchema7',
  })
  const outDir = path.resolve(__dirname, '../contracts')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
  const outFile = path.join(outDir, 'skillgraph-v2.schema.json')
  fs.writeFileSync(outFile, JSON.stringify(jsonSchema, null, 2) + '\n', 'utf-8')
  console.log(`[OK] JSON Schema gerado com sucesso em: ${outFile}`)
  return jsonSchema
}

generateSkillGraphSchema()
