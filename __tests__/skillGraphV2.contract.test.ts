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

  // ─── 4. Verificação de Avisos Semânticos (Warnings) ──────────────────────────
  describe('Avisos Semânticos (Warnings)', () => {
    it('grafo com LOOP table_rows + WRITE sem skip_rows produz warning W_FOOTER_ROW_RISK e nenhum erro', () => {
      const graphWithRisk = {
        spec_version: '2.0',
        identity: {
          portal_id: 'synthetic_portal',
          domain: 'localhost:8899',
          task_id: 'custom:loop_risco_total',
          version: 1,
          name: 'Loop sobre Tabela sem skip_rows',
          description: 'Demonstra emissão do warning W_FOOTER_ROW_RISK ao alcançar WRITE sem skip_rows',
        },
        compat: {
          support_tier: 1,
          archetype_tags: ['table'],
          tested_archetypes: ['standard'],
          min_runner_version: '2.0.0',
        },
        params: {},
        entry_node: 'checkpoint_previo',
        nodes: {
          checkpoint_previo: {
            label: 'Aprovação prévia do lote',
            type: 'CHECKPOINT',
            summary: [{ label: 'Confirmação', value: { lit: true } }],
            scope: 'per_batch',
            on_reject: '$abort',
            retry: { max_attempts: 1, backoff_ms: 0 },
            timeout_ms: 5000,
            postconditions: [],
            on_success: 'loop_tabela',
            on_fail: '$abort',
          },
          loop_tabela: {
            label: 'Itera sobre linhas da tabela sem filtrar rodapé',
            type: 'LOOP',
            over: {
              kind: 'table_rows',
              table: {
                candidates: [{ strategy: 'css', selector: '#tabela-alunos' }],
                description: 'Tabela de alunos',
              },
            },
            as: 'linha',
            body_entry: 'escreve_linha',
            max_iterations: 30,
            retry: { max_attempts: 1, backoff_ms: 0 },
            timeout_ms: 5000,
            postconditions: [],
            on_success: '$end',
            on_fail: '$abort',
          },
          escreve_linha: {
            label: 'Preenche campo na linha',
            type: 'WRITE',
            anchor: {
              candidates: [{ strategy: 'css', selector: 'input.nota' }],
              description: 'Campo de nota',
            },
            value: { lit: '10' },
            method: 'type_native',
            semantic: 'grade',
            read_back: true,
            retry: { max_attempts: 1, backoff_ms: 0 },
            timeout_ms: 5000,
            postconditions: [],
            on_success: '$continue',
            on_fail: '$abort',
          },
        },
        canonical_mapping: {
          columns: [],
          grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: '.' },
          attendance: { polarity: 'not_applicable' },
          ambiguous_requires_confirmation: true,
        },
        safety: {
          side_effect_level: 'write',
          writes_require_checkpoint: true,
          max_writes_per_run: 50,
          rate_limit: { min_delay_ms: 100, jitter_ms: 50 },
          allowed_hosts: ['localhost:8899'],
        },
        provenance: {
          author: 'tester',
          created_at: '2026-10-10T19:00:00Z',
          updated_at: '2026-10-10T19:00:00Z',
          source: 'handwritten',
          has_self_healed: false,
        },
      }

      const parsed = SkillGraphV2Schema.safeParse(graphWithRisk)
      expect(parsed.success).toBe(true)

      if (parsed.success) {
        const report = validateGraph(parsed.data)
        expect(report.valid).toBe(true)
        expect(report.errors).toHaveLength(0)

        const hasFooterRisk = report.warnings.some(w => w.code === 'W_FOOTER_ROW_RISK')
        expect(hasFooterRisk).toBe(true)
      }
    })
  })
})
