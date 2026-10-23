import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPeiPdiFolders,
  createPeiPdiFolder,
  deletePeiPdiFolder,
  assignDocumentToFolder,
  getDocumentFolderMapping,
  inferFolderForDocument,
  getAllPeiPdiCards,
  DEFAULT_PEI_PDI_FOLDERS,
  type PeiPdiFolder
} from '../lib/peiPdiFolderStore'
import {
  saveStudentPdi,
  getAllPdiRecords,
  createDefaultPdi,
  normalizePdiSkillStatus,
  buildBnccSkillsMatrixForGrade,
  type PdiRecord
} from '../lib/pdiManagement'
import {
  saveStudentPei,
  getAllPeiRecords,
  createDefaultPei,
  type PeiRecord
} from '../lib/peiManagement'
import { getBnccForGrade, ALL_SUBJECTS_CATALOG } from '../lib/bnccStore'
import type { SkillsMatrixRow } from '../lib/editableDocumentTypes'

describe('PEI & PDI Trimester, Folder Store and BNCC Batch Selection Suite', () => {
  beforeEach(() => {
    // Reset de estado se necessário
  })

  describe('1. Gestão de Pastas (peiPdiFolderStore)', () => {
    it('deve carregar as pastas padrão contendo turmas e trimestres', () => {
      const folders = getPeiPdiFolders()
      expect(folders.length).toBeGreaterThanOrEqual(7)

      const classFolders = folders.filter(f => f.type === 'class')
      const termFolders = folders.filter(f => f.type === 'term')

      expect(classFolders.some(f => f.id === 'folder_6ano')).toBe(true)
      expect(classFolders.some(f => f.id === 'folder_7ano')).toBe(true)
      expect(classFolders.some(f => f.id === 'folder_8ano')).toBe(true)
      expect(classFolders.some(f => f.id === 'folder_9ano')).toBe(true)

      expect(termFolders.some(f => f.id === 'folder_1tri')).toBe(true)
      expect(termFolders.some(f => f.id === 'folder_2tri')).toBe(true)
      expect(termFolders.some(f => f.id === 'folder_3tri')).toBe(true)
    })

    it('deve permitir criar nova pasta personalizada', () => {
      const initialCount = getPeiPdiFolders().length
      const created = createPeiPdiFolder({
        name: 'Turma de Apoio Específico 2026',
        description: 'Pasta personalizada de teste',
        type: 'custom',
        color: '#8b5cf6',
        icon: 'ti ti-folder'
      })

      expect(created.id).toBeDefined()
      expect(created.name).toBe('Turma de Apoio Específico 2026')
      expect(getPeiPdiFolders().length).toBe(initialCount + 1)

      // Teste de exclusão de pasta personalizada
      const deleted = deletePeiPdiFolder(created.id)
      expect(deleted).toBe(true)
    })

    it('não deve permitir excluir pastas padrão do sistema', () => {
      const deleted = deletePeiPdiFolder('folder_6ano')
      expect(deleted).toBe(false)
      expect(getPeiPdiFolders().some(f => f.id === 'folder_6ano')).toBe(true)
    })

    it('deve inferir corretamente a pasta por trimestre ou turma', () => {
      const folders = DEFAULT_PEI_PDI_FOLDERS

      // 1º Trimestre deve cair na pasta de 1º Tri
      expect(inferFolderForDocument('6º Ano A', '1º Trimestre', folders)).toBe('folder_1tri')
      // 2º Trimestre deve cair na pasta de 2º Tri
      expect(inferFolderForDocument('7º Ano B', '2º Trimestre', folders)).toBe('folder_2tri')
      // 3º Trimestre deve cair na pasta de 3º Tri
      expect(inferFolderForDocument('8º Ano C', '3º Trimestre', folders)).toBe('folder_3tri')

      // Sem trimestre explícito, deve inferir pela turma
      expect(inferFolderForDocument('6º Ano A', 'Anual', folders)).toBe('folder_6ano')
      expect(inferFolderForDocument('9º Ano B', '', folders)).toBe('folder_9ano')
    })

    it('deve atribuir e persistir mapeamento de documento em pasta', () => {
      assignDocumentToFolder('aluno_teste_123', 'folder_1tri')
      const mapping = getDocumentFolderMapping()
      expect(mapping['aluno_teste_123']).toBe('folder_1tri')
    })
  })

  describe('2. Divisão por Trimestre e Cálculo de Habilidades', () => {
    it('deve permitir definir trimestre em SkillsMatrixRow e filtrar habilidades por trimestre', () => {
      const mockSkills: SkillsMatrixRow[] = [
        {
          id: 'sk_1',
          code: 'EF06LI01',
          skillDescription: 'Interagir em situações de intercâmbio oral',
          status: 'Sim',
          term: '1º Trimestre'
        },
        {
          id: 'sk_2',
          code: 'EF06LI02',
          skillDescription: 'Coletar informações do grupo',
          status: 'Em desenvolvimento',
          term: '1º Trimestre'
        },
        {
          id: 'sk_3',
          code: 'EF06LI03',
          skillDescription: 'Solicitar esclarecimentos em língua inglesa',
          status: 'Sim',
          term: '2º Trimestre'
        },
        {
          id: 'sk_4',
          code: 'EF06LI04',
          skillDescription: 'Reconhecer semelhanças e diferenças na pronúncia',
          status: 'Não',
          term: '2º Trimestre'
        },
        {
          id: 'sk_5',
          code: 'EF06LI05',
          skillDescription: 'Aplicar conhecimentos da língua inglesa',
          status: 'Sim',
          term: '3º Trimestre'
        }
      ]

      // Habilidades do 1º Trimestre
      const tri1 = mockSkills.filter(s => s.term === '1º Trimestre')
      expect(tri1.length).toBe(2)
      const tri1Sim = tri1.filter(s => normalizePdiSkillStatus(s.status) === 'Sim').length
      expect(tri1Sim).toBe(1)
      expect(Math.round((tri1Sim / tri1.length) * 100)).toBe(50)

      // Habilidades do 2º Trimestre
      const tri2 = mockSkills.filter(s => s.term === '2º Trimestre')
      expect(tri2.length).toBe(2)
      const tri2Sim = tri2.filter(s => normalizePdiSkillStatus(s.status) === 'Sim').length
      expect(tri2Sim).toBe(1)

      // Habilidades do 3º Trimestre
      const tri3 = mockSkills.filter(s => s.term === '3º Trimestre')
      expect(tri3.length).toBe(1)
      expect(tri3[0].status).toBe('Sim')
    })

    it('deve salvar e carregar PDI com academicTerm e folderId', () => {
      const pdi = createDefaultPdi('student_tri_test', 'Lucas Silva', undefined, 'Colégio Machado Sobrinho', '6º ano do Ensino Fundamental')
      pdi.academicTerm = '2º Trimestre'
      pdi.folderId = 'folder_2tri'

      saveStudentPdi(pdi)
      const all = getAllPdiRecords()
      expect(all['student_tri_test']).toBeDefined()
      expect(all['student_tri_test'].academicTerm).toBe('2º Trimestre')
      expect(all['student_tri_test'].folderId).toBe('folder_2tri')
    })
  })

  describe('3. Seleção em Lote da BNCC por Ano Escolar e Matéria', () => {
    it('deve retornar exatamente todas as 106 habilidades de Língua Inglesa sem omissões', () => {
      // 6º Ano: EF06LI01 a EF06LI26 (26 habilidades)
      const skills6Ano = getBnccForGrade('6', 'english')
      expect(skills6Ano.length).toBe(26)
      expect(skills6Ano.every(s => s.code.startsWith('EF06LI'))).toBe(true)

      // 7º Ano: EF07LI01 a EF07LI23 (23 habilidades)
      const skills7Ano = getBnccForGrade('7', 'english')
      expect(skills7Ano.length).toBe(23)
      expect(skills7Ano.every(s => s.code.startsWith('EF07LI'))).toBe(true)

      // 8º Ano: EF08LI01 a EF08LI20 (20 habilidades)
      const skills8Ano = getBnccForGrade('8', 'english')
      expect(skills8Ano.length).toBe(20)
      expect(skills8Ano.every(s => s.code.startsWith('EF08LI'))).toBe(true)

      // 9º Ano: EF09LI01 a EF09LI19 (19 habilidades)
      const skills9Ano = getBnccForGrade('9', 'english')
      expect(skills9Ano.length).toBe(19)
      expect(skills9Ano.every(s => s.code.startsWith('EF09LI'))).toBe(true)

      // Ensino Médio: 18 habilidades (EM13LGG...)
      const skillsMedio = getBnccForGrade('Médio', 'english')
      expect(skillsMedio.length).toBe(18)
      expect(skillsMedio.every(s => s.code.startsWith('EM13LGG'))).toBe(true)

      // Total acumulado de Língua Inglesa no catálogo: 26 + 23 + 20 + 19 + 18 = 106 habilidades
      const allEnglish = getBnccForGrade('all', 'english')
      expect(allEnglish.length).toBe(106)
    })

    it('deve resolver dinamicamente rótulos reais de documentos (ano do aluno e matéria)', () => {
      // Formato longo vindo de docData.identification.gradeCycle
      const pdiGrade6 = getBnccForGrade('6º ano do Ensino Fundamental', 'Língua Inglesa')
      expect(pdiGrade6.length).toBe(26)

      const pdiGrade7 = getBnccForGrade('7º Ano B', 'Inglês')
      expect(pdiGrade7.length).toBe(23)

      const pdiGrade8 = getBnccForGrade('8º ano do Ensino Fundamental', 'Língua Inglesa')
      expect(pdiGrade8.length).toBe(20)

      const pdiGrade9 = getBnccForGrade('9º Ano', 'english')
      expect(pdiGrade9.length).toBe(19)

      const pdiMedio = getBnccForGrade('Ensino Médio', 'Língua Inglesa')
      expect(pdiMedio.length).toBe(18)

      // Outras matérias como Língua Portuguesa
      const pdiPort6 = getBnccForGrade('6º ano do Ensino Fundamental', 'Língua Portuguesa')
      expect(pdiPort6.length).toBeGreaterThan(0)
      expect(pdiPort6.every(s => s.subject === 'EF_LP')).toBe(true)
    })

    it('deve gerar matriz inicial completa via buildBnccSkillsMatrixForGrade para cada ano', () => {
      // 6º ano padrão oficial
      const m6 = buildBnccSkillsMatrixForGrade('6º ano do Ensino Fundamental', true)
      expect(m6.length).toBe(26)

      // 7º ano
      const m7 = buildBnccSkillsMatrixForGrade('7º ano do Ensino Fundamental', false)
      expect(m7.length).toBe(23)
      expect(m7.every(r => r.skillCode.startsWith('EF07LI'))).toBe(true)

      // 8º ano
      const m8 = buildBnccSkillsMatrixForGrade('8º ano do Ensino Fundamental', false)
      expect(m8.length).toBe(20)
      expect(m8.every(r => r.skillCode.startsWith('EF08LI'))).toBe(true)

      // 9º ano
      const m9 = buildBnccSkillsMatrixForGrade('9º ano do Ensino Fundamental', false)
      expect(m9.length).toBe(19)
      expect(m9.every(r => r.skillCode.startsWith('EF09LI'))).toBe(true)

      // Ensino Médio
      const mEM = buildBnccSkillsMatrixForGrade('Ensino Médio', false)
      expect(mEM.length).toBe(18)
      expect(mEM.every(r => r.skillCode.startsWith('EM13LGG'))).toBe(true)
    })

    it('deve conter catálogo de componentes curriculares no bnccStore', () => {
      expect(ALL_SUBJECTS_CATALOG.length).toBeGreaterThan(5)
      expect(ALL_SUBJECTS_CATALOG.some(c => c.subject === 'EF_LI')).toBe(true)
    })
  })

  describe('4. Consolidação de Cards PEI/PDI para o Repositório', () => {
    it('deve gerar cards consolidados com status de superação e pasta associada', () => {
      const cards = getAllPeiPdiCards()
      expect(Array.isArray(cards)).toBe(true)
      // Carina Miranda ou alunos padrão devem ser descobertos
      if (cards.length > 0) {
        const first = cards[0]
        expect(first.id).toBeDefined()
        expect(first.studentName).toBeDefined()
        expect(first.documentType).toBeDefined()
        expect(first.folderId).toBeDefined()
        expect(first.folderName).toBeDefined()
        expect(typeof first.totalSkills).toBe('number')
        expect(typeof first.masteredSkills).toBe('number')
      }
    })
  })
})
