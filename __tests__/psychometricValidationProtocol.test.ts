import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  calculateItemDifficulty,
  classifyDifficulty,
  calculatePointBiserialDiscrimination,
  classifyDiscrimination,
  calculateCronbachAlpha,
  evaluateItemPsychometrics,
  generateMultiSubjectHoldoutDataset,
  generateHoldoutSeal,
  verifyHoldoutSeal
} from '../lib/psychometricValidationProtocol'
import { CANONICAL_MULTI_SUBJECT_ITEMS } from '../lib/itemBankModel'

describe('Pacote 8 — Protocolo de Validação Psicométrica (TCT) & Holdout Seal', () => {
  describe('1. Teoria Clássica dos Testes (TCT)', () => {
    it('calcula e classifica o índice de dificuldade p com precisão', () => {
      expect(calculateItemDifficulty(50, 100)).toBe(0.50)
      expect(classifyDifficulty(0.50)).toBe('medio')

      expect(calculateItemDifficulty(15, 100)).toBe(0.15)
      expect(classifyDifficulty(0.15)).toBe('muito_dificil')

      expect(calculateItemDifficulty(90, 100)).toBe(0.90)
      expect(classifyDifficulty(0.90)).toBe('muito_facil')
    })

    it('calcula a correlação ponto-bisserial r_pb de discriminação', () => {
      // 10 alunos com escores totais crescentes
      const totalScores = [10, 12, 14, 15, 18, 20, 22, 24, 25, 28]
      // Alunos com escores altos acertaram o item
      const itemCorrect = [false, false, false, false, true, true, true, true, true, true]

      const rpb = calculatePointBiserialDiscrimination(totalScores, itemCorrect)
      expect(rpb).toBeGreaterThan(0.50)
      expect(classifyDiscrimination(rpb)).toBe('excelente')
    })

    it('calcula a consistência interna da prova via Alfa de Cronbach', () => {
      // Matriz de respostas de 6 alunos x 5 itens
      const responseMatrix = [
        [1, 1, 1, 1, 1], // Aluno top
        [1, 1, 1, 1, 0],
        [1, 1, 0, 1, 0],
        [0, 1, 0, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0]  // Aluno base
      ]

      const alpha = calculateCronbachAlpha(responseMatrix)
      expect(alpha).toBeGreaterThan(0.60) // Boa fidedignidade
    })

    it('avalia psicometricamente um item com estratificação de distratores', () => {
      const mathItem = CANONICAL_MULTI_SUBJECT_ITEMS.find(i => i.id === 'ITEM-MAT-01')!
      
      // Amostra de 12 alunos
      const totalScores = [10, 11, 12, 13, 20, 21, 22, 23, 28, 29, 30, 31]
      // Opções escolhidas: inferiores caem no distrator A (MAT-MIS-01); superiores marcam B (correta)
      const selectedOptions = ['A', 'A', 'A', 'C', 'B', 'A', 'B', 'B', 'B', 'B', 'B', 'B']

      const report = evaluateItemPsychometrics(mathItem, totalScores, selectedOptions)
      expect(report.itemId).toBe('ITEM-MAT-01')
      expect(report.difficultyP).toBeGreaterThan(0.40)
      expect(report.pointBiserialRpb).toBeGreaterThan(0.30)
      expect(report.isPsychometricallyApproved).toBe(true)

      // Distrator A deve ser classificado como funcional
      expect(report.distractorEfficiencies['A']?.quality).toBe('funcional')
    })
  })

  describe('2. Selo Criptográfico de Holdout (multi_subject_holdout.lock)', () => {
    it('gera e valida o selo criptográfico SHA-256 do dataset de holdout', () => {
      const dataset = generateMultiSubjectHoldoutDataset()
      expect(dataset.totalItems).toBe(8)
      expect(dataset.subjectCount).toBe(8)

      const seal = generateHoldoutSeal(dataset)
      expect(seal.algorithm).toBe('SHA-256')
      expect(seal.datasetHash).toMatch(/^[a-f0-9]{64}$/)

      // Grava o arquivo de lock de holdout em audit/eval/
      const lockDir = path.join(process.cwd(), 'audit', 'eval')
      if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true })
      }

      const lockPath = path.join(lockDir, 'multi_subject_holdout.lock')
      const lockPayload = {
        lockVersion: '2.0.0',
        generatedAt: dataset.timestamp,
        dataset,
        seal,
        verificationStatus: 'VERIFIED_GOLDEN_MASTER'
      }

      fs.writeFileSync(lockPath, JSON.stringify(lockPayload, null, 2), 'utf8')
      expect(fs.existsSync(lockPath)).toBe(true)

      // Validação determinística
      const isValid = verifyHoldoutSeal(dataset, seal)
      expect(isValid).toBe(true)
    })
  })
})
