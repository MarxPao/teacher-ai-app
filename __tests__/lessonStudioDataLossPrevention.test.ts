import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('FASE 0 — Prevenção de Perda de Dados no LessonStudio', () => {
  const studioPath = path.resolve(__dirname, '../components/modules/LessonStudio.tsx')
  const content = fs.readFileSync(studioPath, 'utf-8')

  describe('1. Causa Raiz: Seleção de Metodologia Não Deve Sobrescrever Roteiro de Etapas Silenciosamente', () => {
    it('clicar em card de metodologia NÃO deve resetar stages se já houver etapas ou se o usuário estiver editando', () => {
      // O bug original fazia:
      // onClick={() => {
      //   setSelectedMethodology(m.id)
      //   const fw = getLessonFrameworkConfig(m.id)
      //   if (!isPlanEditedByUser.current) {
      //     setStages(fw.defaultStages.map(...))
      //   }
      // }}
      // onde isPlanEditedByUser nunca era setado, destruindo todo o roteiro do professor.
      expect(content).not.toMatch(/setSelectedMethodology\(m\.id\)[\s\S]*?if\s*\(!isPlanEditedByUser\.current\)\s*\{\s*setStages\(fw\.defaultStages/)
    })

    it('substituição canônica de etapas possui confirmação explícita via botão dedicado', () => {
      expect(content).toContain('showConfirm')
      expect(content).toContain('Substituir Roteiro?')
      expect(content).toContain('🔄 Aplicar Estrutura Canônica')
    })
  })

  describe('2. Cenário A: Edição de Texto Livre (Tópico, Observações, Dever de Casa, UbD)', () => {
    it('inputs de texto livre marcam isPlanEditedByUser como true', () => {
      // Topic
      expect(content).toMatch(/onChange=\{e\s*=>\s*\{[\s\S]*?isPlanEditedByUser\.current\s*=\s*true[\s\S]*?setTopic\(e\.target\.value\)/)
      // Homework
      expect(content).toMatch(/onChange=\{e\s*=>\s*\{[\s\S]*?isPlanEditedByUser\.current\s*=\s*true[\s\S]*?setHomework\(e\.target\.value\)/)
      // PostLessonNotes
      expect(content).toMatch(/onChange=\{e\s*=>\s*\{[\s\S]*?isPlanEditedByUser\.current\s*=\s*true[\s\S]*?setPostLessonNotes\(e\.target\.value\)/)
      // AssessmentEvidence
      expect(content).toMatch(/onChange=\{e\s*=>\s*\{[\s\S]*?isPlanEditedByUser\.current\s*=\s*true[\s\S]*?setAssessmentEvidence\(e\.target\.value\)/)
    })
  })

  describe('3. Cenário B: Seleção em Dropdown/Select (Turma, Duração, Disciplina)', () => {
    it('dropdowns marcam isPlanEditedByUser como true e preservam o estado global', () => {
      // ClassId
      expect(content).toMatch(/onChange=\{e\s*=>\s*\{[\s\S]*?isPlanEditedByUser\.current\s*=\s*true[\s\S]*?setSelectedClassId\(e\.target\.value\)/)
      // Duration
      expect(content).toMatch(/onChange=\{e\s*=>\s*\{[\s\S]*?isPlanEditedByUser\.current\s*=\s*true[\s\S]*?setTargetDurationMinutes/)
    })
  })

  describe('4. Cenário C: Checkbox / Toggle / Botão de Estado (Etapa Concluída, BNCC)', () => {
    it('atualizações de etapas usam updater funcional setStages(prev => ...) com cópia imutável', () => {
      // Checkbox completed
      expect(content).toMatch(/setStages\(\s*(?:prev|oldStages)\s*=>/)
      // Não deve ter mutação direta updated[idx].completed = ... seguido de setStages(updated)
      expect(content).not.toMatch(/const updated = \[\.\.\.stages\];\s*updated\[idx\]\.completed =/)
      expect(content).not.toMatch(/const updated = \[\.\.\.stages\];\s*updated\[idx\]\.teacherAction =/)
      expect(content).not.toMatch(/const updated = \[\.\.\.stages\];\s*updated\[idx\]\.studentAction =/)
    })

    it('toggleSkill e setSkillStatus usam updater funcional setSelectedSkills(prev => ...)', () => {
      expect(content).toMatch(/const toggleSkill\s*=\s*\(skill:\s*BnccSkill\)\s*=>\s*\{[\s\S]*?setSelectedSkills\(\s*prev\s*=>/)
      expect(content).toMatch(/const setSkillStatus\s*=\s*\(code:\s*string,\s*status:[\s\S]*?setSelectedSkills\(\s*prev\s*=>/)
    })
  })

  describe('5. Trava de Inicialização no Autosave (Prevenção de Race Condition)', () => {
    it('autosave possui trava isInitialized para não sobrescrever rascunho com estado vazio inicial', () => {
      expect(content).toContain('isInitialized')
      expect(content).toMatch(/if\s*\(!isInitialized\.current\)\s*return/)
    })
  })

  describe('6. Reutilização Completa de Planos do Banco e Histórico', () => {
    it('carregamento do Banco restaura todos os campos (habilidades, metodologia, livro, evidências)', () => {
      const btnIdx = content.indexOf('Reutilizar / Editar')
      const startIdx = content.lastIndexOf('setPlanId(plan.id)', btnIdx)
      const bankLoadSection = content.substring(startIdx, btnIdx)
      expect(bankLoadSection).toContain('setSelectedSkills')
      expect(bankLoadSection).toContain('setSelectedMethodology')
      expect(bankLoadSection).toContain('setAssessmentEvidence')
      expect(bankLoadSection).toContain('setTargetDurationMinutes')
    })
  })
})
