import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { SkillGraphV2Schema, validateGraph } from '../lib/contracts/skillgraph'

describe('SkillGraph v2 Contract Tests', () => {
  const examplesDir = path.resolve(__dirname, '../contracts/examples')
  const invalidExamplesDir = path.resolve(__dirname, '../contracts/examples-invalid')
  const schemaPath = path.resolve(__dirname, '../contracts/skillgraph-v2.schema.json')

  // ─── 1. Exemplos Válidos ───────────────────────────────────────────────────
  describe('Exemplos Válidos (Zod Schema & Semantic Validator)', () => {
    const validFiles = ['read_roster.json', 'lancar_falta.json', 'lancar_nota.json', 'diario_grade.json']

    validFiles.forEach(file => {
      it(`deve validar com sucesso o exemplo "${file}"`, () => {
        const filePath = path.join(examplesDir, file)
        const rawJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

        // Validação estrutural estrita via Zod
        const parsed = SkillGraphV2Schema.safeParse(rawJson)
        expect(parsed.success).toBe(true)

        if (parsed.success) {
          // Validação semântica de integridade de grafo
          const report = validateGraph(parsed.data)
          expect(report.valid).toBe(true)
          expect(report.errors).toHaveLength(0)
        }
      })
    })
  })

  // ─── 2. Exemplos Inválidos e Códigos de Erro Esperados ──────────────────────
  describe('Exemplos Inválidos (Falhas Seguras Esperadas)', () => {
    it('(a) escrita sem checkpoint deve falhar com E_WRITE_WITHOUT_CHECKPOINT', () => {
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(invalidExamplesDir, 'invalid_write_no_checkpoint.json'), 'utf-8')
      )
      const parsed = SkillGraphV2Schema.parse(rawJson)
      const report = validateGraph(parsed)

      expect(report.valid).toBe(false)
      const hasExpectedCode = report.errors.some(e => e.code === 'E_WRITE_WITHOUT_CHECKPOINT')
      expect(hasExpectedCode).toBe(true)
    })

    it('(b) campo desconhecido deve falhar no schema Zod estrito (P2 Estrito)', () => {
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(invalidExamplesDir, 'invalid_unknown_field.json'), 'utf-8')
      )
      const result = SkillGraphV2Schema.safeParse(rawJson)

      expect(result.success).toBe(false)
      if (!result.success) {
        const hasUnrecognized = result.error.issues.some(
          issue => issue.code === 'unrecognized_keys' || (issue as any).message?.includes('unrecognized')
        )
        expect(hasUnrecognized).toBe(true)
      }
    })

    it('(c) parâmetro não declarado deve falhar com E_UNDECLARED_PARAM', () => {
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(invalidExamplesDir, 'invalid_undeclared_param.json'), 'utf-8')
      )
      const parsed = SkillGraphV2Schema.parse(rawJson)
      const report = validateGraph(parsed)

      expect(report.valid).toBe(false)
      const hasExpectedCode = report.errors.some(e => e.code === 'E_UNDECLARED_PARAM')
      expect(hasExpectedCode).toBe(true)
    })

    it('(d) literal contendo CPF deve falhar com E_PII_LITERAL (P3 Sem PII)', () => {
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(invalidExamplesDir, 'invalid_pii_cpf.json'), 'utf-8')
      )
      const parsed = SkillGraphV2Schema.parse(rawJson)
      const report = validateGraph(parsed)

      expect(report.valid).toBe(false)
      const hasExpectedCode = report.errors.some(e => e.code === 'E_PII_LITERAL')
      expect(hasExpectedCode).toBe(true)
    })

    it('(e) seletor CSS parametrizado deve falhar no schema Zod ou com E_CSS_PARAM', () => {
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(invalidExamplesDir, 'invalid_param_in_css.json'), 'utf-8')
      )
      const parsed = SkillGraphV2Schema.safeParse(rawJson)
      expect(parsed.success).toBe(false)
      const report = validateGraph(rawJson as any)
      const hasCssParam = report.errors.some(e => e.code === 'E_CSS_PARAM')
      expect(hasCssParam).toBe(true)
    })

    it('(f) parâmetro não declarado em âncora deve falhar com E_UNDECLARED_PARAM', () => {
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(invalidExamplesDir, 'invalid_undeclared_param_in_anchor.json'), 'utf-8')
      )
      const parsed = SkillGraphV2Schema.parse(rawJson)
      const report = validateGraph(parsed)

      expect(report.valid).toBe(false)
      const hasExpectedCode = report.errors.some(e => e.code === 'E_UNDECLARED_PARAM')
      expect(hasExpectedCode).toBe(true)
    })
  })

  // ─── 3. Guarda Contra Drift do JSON Schema ──────────────────────────────────
  describe('Guarda Contra Drift do JSON Schema', () => {
    it('o schema em contracts/skillgraph-v2.schema.json deve ser idêntico à geração atual do Zod', () => {
      const committedSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'))
      const generatedSchema = z.toJSONSchema(SkillGraphV2Schema, {
        target: 'jsonSchema7',
      })

      expect(generatedSchema).toEqual(committedSchema)
    })
  })
})
