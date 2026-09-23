/**
 * __tests__/editableDocumentArchitecture.test.ts
 *
 * Suíte de Testes da Arquitetura Unificada de Documentos Editáveis:
 * - Schemas canônicos (PDI, PEI, Projetos)
 * - Persistência, migração e arquivos históricos (PDI, PEI, Projetos)
 * - Marcos e status de Projetos
 * - Exportação Fiel (DOCX/PDF) com cabeçalhos escolares, legendas HV/HED/HNV e assinaturas
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  PDI_SCHEMA,
  PEI_SCHEMA,
  PROJETO_SCHEMA,
  getSchemaForType
} from '../lib/editableDocumentTypes'
import {
  createDefaultPdi,
  saveStudentPdi,
  getStudentPdi,
  archiveStudentPdi,
  getStudentPdiArchive
} from '../lib/pdiManagement'
import {
  createDefaultPei,
  saveStudentPei,
  getStudentPei,
  archiveStudentPei,
  getStudentPeiArchive
} from '../lib/peiManagement'
import {
  createDefaultProject,
  saveProject,
  getProjectById,
  updateProjectMilestone,
  addProjectLogEntry
} from '../lib/projectManagement'
import { generateDocumentHtml } from '../lib/documentExportService'

describe('Arquitetura Unificada de Documentos Editáveis', () => {

  // ─── 1. SCHEMAS E ESTRUTURA DOS BOXES ──────────────────────────────────────
  describe('1. Schemas Canônicos e Validação Estrutural dos Boxes', () => {
    it('1.1 PDI_SCHEMA possui exatamente 8 boxes ordenados compatíveis com o modelo oficial', () => {
      expect(PDI_SCHEMA.type).toBe('pdi')
      expect(PDI_SCHEMA.boxes.length).toBe(8)

      const boxTypes = PDI_SCHEMA.boxes.map(b => b.boxType)
      expect(boxTypes).toEqual([
        'header_fields',         // 1. Dados da Escola
        'header_fields',         // 2. Identificação do Aluno
        'checklist_conditional', // 3. Relatório Circunstanciado (Laudo/CID-10)
        'rich_narrative',        // 4. Avaliação Inicial (Funções de Desenvolvimento)
        'rich_narrative',        // 5. Proposta Curricular
        'skills_matrix_table',   // 6. Matriz de Habilidades BNCC Adaptadas
        'strategy_list',         // 7. Plano de Intervenção Pedagógica & AEE
        'signature_block'        // 8. Assinaturas
      ])

      // Verifica as 6 subseções de funções cognitivas no box 4
      const avaliacaoBox = PDI_SCHEMA.boxes.find(b => b.id === 'avaliacao_inicial')
      const subKeys = avaliacaoBox?.config?.subsections.map((s: any) => s.key)
      expect(subKeys).toEqual(['percepcao', 'atencao', 'memoria', 'linguagem', 'raciocinio', 'emocional'])
    })

    it('1.2 PEI_SCHEMA possui 8 boxes incluindo flexibilizacao_curricular e metas_smart', () => {
      expect(PEI_SCHEMA.type).toBe('pei')
      expect(PEI_SCHEMA.boxes.length).toBe(8)

      const flexBox = PEI_SCHEMA.boxes.find(b => b.id === 'flexibilizacao_curricular')
      expect(flexBox?.boxType).toBe('skills_matrix_table')
      expect(flexBox?.config?.mode).toBe('pei')

      const metasBox = PEI_SCHEMA.boxes.find(b => b.id === 'metas_smart')
      expect(metasBox?.boxType).toBe('goal_tracker')
    })

    it('1.3 PROJETO_SCHEMA possui os 3 tipos exclusivos: milestone_tracker, rubric_builder e progress_log', () => {
      expect(PROJETO_SCHEMA.type).toBe('projeto')
      expect(PROJETO_SCHEMA.boxes.length).toBe(7)

      const milestoneBox = PROJETO_SCHEMA.boxes.find(b => b.id === 'cronograma_marcos')
      expect(milestoneBox?.boxType).toBe('milestone_tracker')

      const rubricBox = PROJETO_SCHEMA.boxes.find(b => b.id === 'rubrica_avaliativa')
      expect(rubricBox?.boxType).toBe('rubric_builder')

      const logBox = PROJETO_SCHEMA.boxes.find(b => b.id === 'registro_acompanhamento')
      expect(logBox?.boxType).toBe('progress_log')
    })

    it('1.4 getSchemaForType retorna o schema canônico correto', () => {
      expect(getSchemaForType('pdi')).toBe(PDI_SCHEMA)
      expect(getSchemaForType('pei')).toBe(PEI_SCHEMA)
      expect(getSchemaForType('projeto')).toBe(PROJETO_SCHEMA)
    })
  })

  // ─── 2. PERSISTÊNCIA, MIGRAÇÃO E ARQUIVO DO PEI ────────────────────────────
  describe('2. Gestão e Arquivo Histórico do PEI', () => {
    const studentId = 'st_pei_test_01'
    const studentName = 'Lucas Silveira Mendes'

    it('2.1 Cria PEI padrão com metas SMART e acomodações ativas', () => {
      const pei = createDefaultPei(studentId, studentName)
      expect(pei.studentId).toBe(studentId)
      expect(pei.studentName).toBe(studentName)
      expect(pei.goals.length).toBeGreaterThan(0)
      expect(pei.accommodations.length).toBeGreaterThan(0)
      expect(pei.flexibilizacaoCurricular?.length).toBeGreaterThan(0)
    })

    it('2.2 Salva e recupera PEI mantendo compatibilidade de dados', () => {
      const pei = createDefaultPei(studentId, studentName)
      pei.diagnosis = 'TEA Nível 1 de Suporte'
      saveStudentPei(pei)

      const retrieved = getStudentPei(studentId)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.diagnosis).toBe('TEA Nível 1 de Suporte')
    })

    it('2.3 Arquiva a versão atual do PEI e adiciona ao histórico', () => {
      const pei = createDefaultPei(studentId, studentName)
      saveStudentPei(pei)

      const archived = archiveStudentPei(studentId)
      expect(archived).toBe(true)

      const archiveList = getStudentPeiArchive(studentId)
      expect(archiveList.length).toBe(1)
      expect(archiveList[0].status).toBe('archived')
    })
  })

  // ─── 3. PERSISTÊNCIA E ARQUIVO DO PDI ──────────────────────────────────────
  describe('3. Gestão e Arquivo Histórico do PDI', () => {
    const studentId = 'st_pdi_test_01'
    const studentName = 'Mariana Lima Rocha'

    it('3.1 Cria PDI padrão com matriz de habilidades BNCC e legenda HV/HED', () => {
      const pdi = createDefaultPdi(studentId, studentName, 'cls_9b', 'Colégio Machado Sobrinho')
      expect(pdi.studentId).toBe(studentId)
      expect(pdi.studentName).toBe(studentName)
      expect(pdi.schoolName).toBe('Colégio Machado Sobrinho')
      expect(pdi.skillsMatrix.length).toBeGreaterThan(0)
      expect(pdi.developmentAssessment?.percepcao).toBeDefined()
    })

    it('3.2 Salva e recupera PDI preservando campos de funções cognitivas', () => {
      const pdi = createDefaultPdi(studentId, studentName)
      pdi.developmentAssessment = {
        ...pdi.developmentAssessment,
        percepcao: 'Excelente percepção visual e espacial.',
        linguagem: 'Expressão oral fluente e articulada.'
      }
      saveStudentPdi(pdi)

      const retrieved = getStudentPdi(studentId)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.developmentAssessment?.percepcao).toBe('Excelente percepção visual e espacial.')
      expect(retrieved?.developmentAssessment?.linguagem).toBe('Expressão oral fluente e articulada.')
    })

    it('3.3 Arquiva PDI no histórico do estudante', () => {
      const pdi = createDefaultPdi(studentId, studentName)
      saveStudentPdi(pdi)

      const success = archiveStudentPdi(studentId)
      expect(success).toBe(true)

      const archive = getStudentPdiArchive(studentId)
      expect(archive.length).toBe(1)
      expect(archive[0].status).toBe('archived')
    })
  })

  // ─── 4. GESTÃO DE PROJETOS (MARCOS E RUBRICAS) ─────────────────────────────
  describe('4. Gestão de Projetos Interdisciplinares', () => {
    it('4.1 Cria projeto padrão com marcos e rubricas', () => {
      const proj = createDefaultProject('8º Ano A', 'Colégio Machado Sobrinho')
      expect(proj.title).toBe('Novo Projeto Interdisciplinar')
      expect(proj.milestones.length).toBe(3)
      expect(proj.rubric.length).toBe(2)
      expect(proj.status).toBe('planejado')
    })

    it('4.2 Atualiza status de marco e recalcula status do projeto', () => {
      const proj = createDefaultProject('8º Ano A')
      saveProject(proj)

      const firstMilestoneId = proj.milestones[0].id
      updateProjectMilestone(proj.id, firstMilestoneId, 'concluido')

      const updated = getProjectById(proj.id)
      expect(updated?.milestones.find(m => m.id === firstMilestoneId)?.status).toBe('concluido')
    })

    it('4.3 Registra entrada no diário de bordo (progress log)', () => {
      const proj = createDefaultProject('8º Ano A')
      saveProject(proj)

      addProjectLogEntry(proj.id, {
        date: '2026-03-20',
        author: 'Prof. Rafael',
        milestoneRef: 'Marco 1',
        notes: 'Alunos organizados em equipes e pergunta-guia validada.',
        nextSteps: 'Definir materiais para o protótipo.'
      })

      const updated = getProjectById(proj.id)
      expect(updated?.progressLogs.length).toBe(1)
      expect(updated?.progressLogs[0].notes).toContain('pergunta-guia validada')
    })
  })

  // ─── 5. EXPORTAÇÃO FIEL PARA WORD / PDF ────────────────────────────────────
  describe('5. Exportação Oficial Fiel (DOCX e PDF)', () => {
    it('5.1 PDI exportado contém cabeçalho escolar, tabela de habilidades com legenda HV/HED/HNV e 4 assinaturas', () => {
      const pdi = createDefaultPdi('st_1', 'Bernardo Castro', '8º Ano B', 'Colégio Machado Sobrinho')
      const html = generateDocumentHtml({
        type: 'pdi',
        title: 'Plano de Desenvolvimento Individual (PDI)',
        schoolName: 'Colégio Machado Sobrinho',
        studentName: 'Bernardo Castro',
        data: pdi
      })

      // Cabeçalho da escola
      expect(html).toContain('COLÉGIO MACHADO SOBRINHO')
      expect(html).toContain('Bernardo Castro')

      // Funções cognitivas
      expect(html).toContain('Percepção:')
      expect(html).toContain('Atenção:')
      expect(html).toContain('Memória:')

      // Matriz de habilidades e legenda oficial
      expect(html).toContain('Matriz de Habilidades BNCC Adaptadas')
      expect(html).toContain('LEGENDA OFICIAL:')
      expect(html).toContain('HV:</strong> Habilidade Validada')
      expect(html).toContain('HED:</strong> Habilidade em Desenvolvimento')
      expect(html).toContain('HNV:</strong> Habilidade Não Validada')

      // Termo de assinaturas multiprofissional
      expect(html).toContain('Direção Pedagógica')
      expect(html).toContain('Professores Regentes')
      expect(html).toContain('Coordenação Pedagógica')
      expect(html).toContain('Orientação Educacional / AEE')
    })

    it('5.2 PEI exportado contém flexibilização curricular e metas SMART', () => {
      const pei = createDefaultPei('st_2', 'Alice Rodrigues')
      const html = generateDocumentHtml({
        type: 'pei',
        title: 'Plano Educacional Individualizado (PEI)',
        schoolName: 'Colégio Machado Sobrinho',
        studentName: 'Alice Rodrigues',
        data: pei
      })

      expect(html).toContain('Alice Rodrigues')
      expect(html).toContain('Flexibilização Curricular (Habilidades BNCC)')
      expect(html).toContain('Metas SMART Prioritárias')
      expect(html).toContain('Acomodações Curriculares & AEE')
    })

    it('5.3 Projeto exportado contém pergunta norteadora e rubrica avaliativa', () => {
      const proj = createDefaultProject('9º Ano B')
      const html = generateDocumentHtml({
        type: 'projeto',
        title: 'Projeto Sustentabilidade',
        schoolName: 'Colégio Machado Sobrinho',
        data: proj
      })

      expect(html).toContain('PERGUNTA NORTEADORA:')
      expect(html).toContain('Cronograma de Marcos & Entregáveis (Milestones)')
      expect(html).toContain('Rubrica Avaliativa do Projeto')
    })
  })
})
