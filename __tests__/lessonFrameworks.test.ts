/**
 * __tests__/lessonFrameworks.test.ts
 * 
 * Testes Unitários e de Integração: Frameworks Pedagógicos Reais (Prioridade 2)
 * Valida:
 * 1. 5E Inquiry Model (Bybee) — 5 fases canônicas
 * 2. TBLT Autêntico (Jane Willis) — 6 etapas (Pre-Task, Task, Planning, Report, Analysis, Practice)
 * 3. Backward Design / UbD (Wiggins & McTighe) — Raciocínio reverso (Avaliação antes do plano)
 * 4. PPP (Presentation, Practice, Production) — 4 etapas clássicas
 * 5. Integração com pedagogicalMethodologies.ts (enriquecimento pedagógico)
 * 6. Instrução explícita de diferenciação de códigos BNCC por modalidade (leitura vs oralidade vs escrita)
 * 7. Auditoria estática de integração no LessonStudio.tsx
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  LESSON_FRAMEWORKS,
  getLessonFrameworkConfig,
  buildDynamicFrameworkPrompt
} from '../lib/lessonFrameworks'
import { PEDAGOGICAL_METHODOLOGIES } from '../lib/pedagogicalMethodologies'

describe('Motor de Frameworks Pedagógicos Reais (lessonFrameworks.ts)', () => {
  describe('1. Catálogo e Configurações de Frameworks', () => {
    it('inclui os frameworks exigidos: 5E, TBLT Willis, UbD e PPP', () => {
      const ids = LESSON_FRAMEWORKS.map(f => f.id)
      expect(ids).toContain('5e_inquiry')
      expect(ids).toContain('tblt_willis')
      expect(ids).toContain('ubd_backward')
      expect(ids).toContain('ppp')
    })

    it('5E Inquiry Model possui exatamente 5 etapas com nomes e papéis canônicos de Bybee', () => {
      const config = getLessonFrameworkConfig('5e_inquiry')
      expect(config.defaultStages).toHaveLength(5)
      const stageNames = config.defaultStages.map(s => s.name.toLowerCase())
      expect(stageNames[0]).toContain('engage')
      expect(stageNames[1]).toContain('explore')
      expect(stageNames[2]).toContain('explain')
      expect(stageNames[3]).toContain('elaborate')
      expect(stageNames[4]).toContain('evaluate')
    })

    it('TBLT Autêntico de Jane Willis possui 6 etapas refletindo a estrutura canônica de 1996', () => {
      const config = getLessonFrameworkConfig('tblt_willis')
      expect(config.defaultStages).toHaveLength(6)
      const stageNames = config.defaultStages.map(s => s.name.toLowerCase())
      expect(stageNames[0]).toContain('pre-task')
      expect(stageNames[1]).toContain('task')
      expect(stageNames[2]).toContain('planning')
      expect(stageNames[3]).toContain('report')
      expect(stageNames[4]).toContain('analysis')
      expect(stageNames[5]).toContain('practice')
    })

    it('Backward Design / UbD possui flag de reasoningOrder: "backward_design"', () => {
      const config = getLessonFrameworkConfig('ubd_backward')
      expect(config.reasoningOrder).toBe('backward_design')
      expect(config.promptDirective.toLowerCase()).toContain('backward design')
      expect(config.promptDirective.toLowerCase()).toContain('wiggins & mctighe')
    })

    it('PPP possui 4 etapas clássicas focadas em MFP e produção comunicativa', () => {
      const config = getLessonFrameworkConfig('ppp')
      expect(config.defaultStages).toHaveLength(4)
      const stageNames = config.defaultStages.map(s => s.name.toLowerCase())
      expect(stageNames[0]).toContain('warm-up')
      expect(stageNames[1]).toContain('presentation')
      expect(stageNames[2]).toContain('controlled practice')
      expect(stageNames[3]).toContain('free production')
    })
  })

  describe('2. Geração Dinâmica de Prompts e Schemas Estruturados', () => {
    const baseOptions = {
      activeProfileName: 'Língua Inglesa',
      className: '8º Ano A',
      gradeYear: '8º Fund.',
      topic: 'Present Perfect and life experiences',
      targetDurationMinutes: 50,
      bnccPromptString: 'EF08LI01 (Oralidade), EF08LI05 (Leitura), EF08LI19 (Gramática)',
      promptDirective: 'Foco em aprendizagem ativa',
      systemPrompt: 'Diretrizes do coordenador'
    }

    it('gera prompt do 5E com 5 etapas no schema JSON', () => {
      const prompt = buildDynamicFrameworkPrompt({
        ...baseOptions,
        methodologyId: '5e_inquiry'
      })

      expect(prompt).toContain('5E Inquiry Model')
      expect(prompt).toContain('1. Engage')
      expect(prompt).toContain('2. Explore')
      expect(prompt).toContain('3. Explain')
      expect(prompt).toContain('4. Elaborate')
      expect(prompt).toContain('5. Evaluate')
    })

    it('gera prompt do TBLT Willis com 6 etapas no schema JSON sem compressão genérica', () => {
      const prompt = buildDynamicFrameworkPrompt({
        ...baseOptions,
        methodologyId: 'tblt_willis'
      })

      expect(prompt).toContain('Jane Willis')
      expect(prompt).toContain('Pre-Task')
      expect(prompt).toContain('Task Cycle — Task')
      expect(prompt).toContain('Task Cycle — Planning')
      expect(prompt).toContain('Task Cycle — Report')
      expect(prompt).toContain('Language Focus — Analysis')
      expect(prompt).toContain('Language Focus — Practice')
    })

    it('gera prompt de Backward Design / UbD com ordem de raciocínio reverso explícita', () => {
      const prompt = buildDynamicFrameworkPrompt({
        ...baseOptions,
        methodologyId: 'ubd_backward'
      })

      expect(prompt).toContain('ORDEM DE RACIOCÍNIO BACKWARD DESIGN')
      expect(prompt).toContain('Primeiro, declare as Questões Essenciais e a Evidência Observável')
      expect(prompt).toContain('Em seguida, derive o Roteiro de Aprendizagem (Estágio 3)')
    })

    it('inclui instrução explícita de diferenciação de códigos BNCC por ação pedagógica', () => {
      const prompt = buildDynamicFrameworkPrompt({
        ...baseOptions,
        methodologyId: 'ppp'
      })

      expect(prompt).toContain('INSTRUÇÃO CRÍTICA SOBRE ATRIBUIÇÃO DE HABILIDADES BNCC POR ETAPA')
      expect(prompt).toContain('Analise a AÇÃO PEDAGÓGICA específica de CADA etapa')
      expect(prompt).toContain('NÃO repita o mesmo código em todas as etapas')
    })

    it('conecta com pedagogicalMethodologies.ts para enriquecimento', () => {
      const prompt = buildDynamicFrameworkPrompt({
        ...baseOptions,
        methodologyId: '5e_inquiry'
      })

      // Verifica enriquecimento do catálogo central
      expect(prompt).toContain('INSTRUÇÕES RÍGOROSAS DE METODOLOGIAS & MARCOS SELECIONADOS')
    })
  })

  describe('3. Integração Estática no LessonStudio.tsx', () => {
    it('verifica conformidade de imports e controles no LessonStudio.tsx', () => {
      const studioPath = path.resolve(__dirname, '../components/modules/LessonStudio.tsx')
      const code = fs.readFileSync(studioPath, 'utf8')

      // Importação e uso de LESSON_FRAMEWORKS
      expect(code).toContain('LESSON_FRAMEWORKS')
      expect(code).toContain('buildDynamicFrameworkPrompt')
      expect(code).toContain('getLessonFrameworkConfig')

      // Botão de aplicar estrutura canônica
      expect(code).toContain('Aplicar Estrutura Canônica')
    })
  })
})
