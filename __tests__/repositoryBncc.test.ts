import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Repository BNCC Partition Verification Suite', () => {
  const repoPath = path.resolve(__dirname, '../components/modules/Repository.tsx')
  const content = fs.readFileSync(repoPath, 'utf-8')

  it('declara e renderiza a partição 6 de Competências BNCC no corpo principal', () => {
    expect(content).toContain("activePartition === 'competencies'")
    expect(content).toContain('6. Competências BNCC ({competencies.length})')
    expect(content).toContain('PARTIÇÃO 6: COMPETÊNCIAS & HABILIDADES BNCC')
  })

  it('inclui barra de busca e contadores de habilidades filtradas', () => {
    expect(content).toContain('value={compSearch}')
    expect(content).toContain('{filteredCompetencies.length} de {competencies.length} habilidades')
  })

  it('permite filtrar por Série/Ano e por Eixo Temático da BNCC', () => {
    expect(content).toContain('setCompGradeFilter(grade.id)')
    expect(content).toContain('setCompAxisFilter(axis.id)')
    expect(content).toContain('Oralidade')
    expect(content).toContain('Leitura')
    expect(content).toContain('Escrita')
    expect(content).toContain('Conhecimentos Linguísticos')
    expect(content).toContain('Dimensão Intercultural')
  })

  it('renderiza os cards com código, série, eixo, unidade e ações de cópia/edição', () => {
    expect(content).toContain('{comp.code}')
    expect(content).toContain('{comp.gradeYear}')
    expect(content).toContain('{comp.axis}')
    expect(content).toContain('{comp.description}')
    expect(content).toContain('Copiar Habilidade')
    expect(content).toContain('handleDeleteCompetency(comp.id)')
  })

  it('renderiza o modal de cadastro e edição de competências personalizadas', () => {
    expect(content).toContain('{isAddCompModalOpen && (')
    expect(content).toContain('Nova Competência / Habilidade BNCC')
    expect(content).toContain('handleSaveCompetency')
  })
})
