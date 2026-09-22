import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('FASE 7 — Editor de Documento Tipo Word na Aba Doc (Feedback Usuária 0)', () => {
  let studioContent: string

  beforeEach(() => {
    studioContent = fs.readFileSync(
      path.resolve(__dirname, '../components/modules/LessonStudio.tsx'),
      'utf-8'
    )
  })

  it('1. Deve declarar activeTab com suporte a doc e estado docContent', () => {
    expect(studioContent).toContain("const [activeTab, setActiveTab] = useState<'editor' | 'doc' | 'preview' | 'bank'>('editor')")
    expect(studioContent).toContain("const [docContent, setDocContent] = useState<string>('')")
  })

  it('2. Deve incluir campo opcional docContent no schema LessonPlanDocument', () => {
    expect(studioContent).toContain('docContent?: string')
  })

  it('3. Deve renderizar o botão da aba "Editor Doc (Word)" na barra de navegação', () => {
    expect(studioContent).toContain('Editor Doc (Word)')
    expect(studioContent).toContain("setActiveTab('doc')")
    expect(studioContent).toContain('formatMarkdownToHtml(md)')
  })

  it('4. Deve renderizar DocumentCanvas dentro da aba doc', () => {
    expect(studioContent).toContain("{activeTab === 'doc' && (")
    expect(studioContent).toContain('<DocumentCanvas')
    expect(studioContent).toContain('content={docContent}')
    expect(studioContent).toContain('setDocContent(html)')
  })

  it('5. Deve disponibilizar ações de sincronização e exportação na aba doc', () => {
    expect(studioContent).toContain('Recarregar dos Boxes')
    expect(studioContent).toContain('Salvar no Banco')
    expect(studioContent).toContain('Exportar PDF')
    expect(studioContent).toContain('Exportar Word')
  })

  it('6. Deve persistir docContent no autosave de rascunho', () => {
    expect(studioContent).toContain('docContent,')
    expect(studioContent).toContain("localStorage.setItem('teacher_lesson_studio_draft'")
  })

  it('7. Deve restaurar docContent do rascunho e de planos do banco', () => {
    expect(studioContent).toContain('if (foundPlan.docContent) setDocContent(foundPlan.docContent)')
    expect(studioContent).toContain('if (draft.docContent) setDocContent(draft.docContent)')
  })

  it('8. Deve priorizar docContent na exportação para PDF e Word se disponível', () => {
    expect(studioContent).toContain('content: docContent || generatePlanMarkdown()')
  })
})
