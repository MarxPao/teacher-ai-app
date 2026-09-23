import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('LessonStudio UX & Design Audit Verification Suite', () => {
  const lessonStudioPath = path.resolve(__dirname, '../components/modules/LessonStudio.tsx')
  const content = fs.readFileSync(lessonStudioPath, 'utf-8')

  describe('Item 1: Fim do Truncamento de Texto (Textarea & Quebra de Linha)', () => {
    it('utiliza textarea auto-ajustável para as Perguntas-Guia da coluna lateral', () => {
      expect(content).toContain('guidingQuestions.map((q, idx) => (')
      expect(content).toContain('<textarea')
      expect(content).toContain('wordBreak: \'break-word\'')
      expect(content).toContain('overflowWrap: \'break-word\'')
    })

    it('utiliza textarea para ações do professor e do aluno nas etapas do roteiro', () => {
      expect(content).toContain('value={stage.teacherAction}')
      expect(content).toContain('value={stage.studentAction}')
      expect(content).toMatch(/<textarea[\s\S]*?value=\{stage\.teacherAction\}/)
      expect(content).toMatch(/<textarea[\s\S]*?value=\{stage\.studentAction\}/)
    })

    it('adiciona tooltip e prevenção de corte rígido no seletor de habilidades BNCC', () => {
      expect(content).toContain('title={s.description}')
      expect(content).toContain('s.description.length > 55')
    })
  })

  describe('Item 2: Nomenclatura Pedagógica Humana (Remoção de BOX N)', () => {
    it('não contém mais títulos internos de BOX 1, 2, 3, 5, 6, 7, 8 para o professor', () => {
      expect(content).not.toContain('Box 1:')
      expect(content).not.toContain('Box 2:')
      expect(content).not.toContain('Box 3:')
      expect(content).not.toContain('Box 4:')
      expect(content).not.toContain('Box 5:')
      expect(content).not.toContain('Box 6:')
      expect(content).not.toContain('Box 7:')
      expect(content).not.toContain('Box 8:')
      expect(content).not.toContain('Edição (Boxes)')
      expect(content).not.toContain('Voltar para Edição nos Boxes')
    })

    it('exibe títulos amigáveis e pedagógicos', () => {
      expect(content).toContain('📦 Identificação da Aula')
      // Renomeado de "Conteúdo e Tópico" para "Tópico, Descrição & Objetivos" (evolução UX)
      expect(content).toContain('📦 Tópico, Descrição & Objetivos')
      // Renomeado para incluir matriz curricular
      expect(content).toContain('📦 Habilidades BNCC')
      expect(content).toContain('📦 Framework Pedagógico & Metodologia Ativa')
      expect(content).toContain('📦 Material de Referência')
      // Roteiro inclui cronômetro dinâmico — verifica prefixo
      expect(content).toContain('📦 Roteiro da Aula')
      expect(content).toContain('📦 Tarefa de Casa')
      expect(content).toContain('📦 Anotações Pós-Aula (Log Reflexivo)')
      expect(content).toContain('Edição do Plano')
      expect(content).toContain('Voltar para Edição do Plano')
    })
  })

  describe('Item 3: Hierarquia de Ações (Eliminação do Button Soup)', () => {
    it('possui dropdown flutuante de Exportação agrupando PDF, Word e Excel', () => {
      expect(content).toContain('showExportDropdown')
      expect(content).toContain('handleExportPdf')
      expect(content).toContain('handleExportWord')
      expect(content).toContain('handleExportExcel')
      expect(content).toContain('ti-printer')
      expect(content).toContain('ti-file-text')
      expect(content).toContain('ti-table')
    })

    it('possui dropdown flutuante de Salvamento agrupando Calendário, Banco e Ambos', () => {
      expect(content).toContain('showSaveDropdown')
      expect(content).toContain('handleSaveToCalendar')
      expect(content).toContain('handleSaveToBank')
      expect(content).toContain('handleSaveBoth')
      expect(content).toContain('Salvar em Ambos')
      expect(content).toContain('Recomendado')
    })

    it('mantém o botão Gerar Pacote da Aula como CTA dominante proeminente', () => {
      expect(content).toContain('📦 Gerar Pacote da Aula')
      expect(content).toContain('linear-gradient(135deg, #10b981 0%, #059669 100%)')
    })
  })

  describe('Item 4: Regeneração de Etapa Única (Single Stage Regeneration)', () => {
    it('implementa função handleRegenerateStage para regenerar apenas a etapa selecionada', () => {
      expect(content).toContain('const handleRegenerateStage = async (idx: number) =>')
      expect(content).toContain('REQUISITO OBRIGATÓRIO:')
      expect(content).toContain('Regenere APENAS a etapa atual')
      expect(content).toContain('regeneratingStageIndex')
    })

    it('renderiza o botão de regeneração com spinner e tooltip em cada etapa', () => {
      expect(content).toContain('onClick={() => handleRegenerateStage(idx)}')
      expect(content).toContain('title="Regenerar esta etapa com IA mantendo o restante do plano"')
      expect(content).toContain('ti ti-refresh')
      expect(content).toContain('animate-spin')
    })
  })

  describe('Item 5: Tooltip e Acessibilidade no Checkbox da Etapa', () => {
    it('adiciona aria-label e title explicativo ao checkbox de execução da etapa', () => {
      expect(content).toContain('title="Marcar etapa como executada em sala (atualiza o progresso e desbloqueia o log reflexivo)"')
      expect(content).toContain('aria-label="Marcar etapa como executada em sala"')
      expect(content).toContain('accentColor: \'#10b981\'')
    })
  })
})
