import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  sanitizeTextForFormalDoc,
  formatMarkdownToHtml,
  formatInlineMarkdown
} from '@/lib/exportUtils'

describe('FASE 5 — Correção de Exportação e Impressão Limpa (Feedback Usuária 0)', () => {

  // ─── 5.1 Sanitização de Emojis para Documentos Formais ───────────────────────
  describe('5.1 sanitizeTextForFormalDoc — Remoção de Emojis em Exportação Formal', () => {
    it('deve remover todos os emojis de textos formais', () => {
      const textWithEmojis = '📦 Tópico da Aula: Simple Past 🏆 Meta: 90% de acerto ⚠️ Cuidado com verbos irregulares'
      const sanitized = sanitizeTextForFormalDoc(textWithEmojis)
      expect(sanitized).toBe('Tópico da Aula: Simple Past  Meta: 90% de acerto  Cuidado com verbos irregulares')
      expect(sanitized).not.toMatch(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u)
    })

    it('deve preservar pontuação, acentuação em português e caracteres pedagógicos legítimos', () => {
      const text = 'Objetivos Específicos: Compreensão auditiva, produção oral em pares & consolidação de vocabulário (A1-A2).'
      const sanitized = sanitizeTextForFormalDoc(text)
      expect(sanitized).toBe(text)
    })
  })

  // ─── 5.2 Diagramação Limpa de Tabelas Markdown para HTML ─────────────────────
  describe('5.2 formatMarkdownToHtml — Conversão de Tabelas e Diagramação Profissional', () => {
    it('deve converter blocos de tabela markdown em tabelas HTML com classe content-table e tags thead/tbody', () => {
      const markdownTable = `
## Roteiro da Aula
| Etapa | Duração | Dinâmica | Ref. Material | Ação do Professor | Ação do Aluno |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Warm-up** | 5 min | Dupla | Página 12 | Apresenta imagens | Discutem em pares |
| **Presentation** | 15 min | Turma Toda | Slide 3 | Explica a estrutura | Fazem anotações |
`
      const html = formatMarkdownToHtml(markdownTable)

      expect(html).toContain('<table class="content-table">')
      expect(html).toContain('<thead>')
      expect(html).toContain('<th>Etapa</th>')
      expect(html).toContain('<th>Duração</th>')
      expect(html).toContain('<th>Dinâmica</th>')
      expect(html).toContain('<tbody>')
      expect(html).toContain('<td><strong>Warm-up</strong></td>')
      expect(html).toContain('<td>5 min</td>')
      expect(html).toContain('<td>Dupla</td>')
      expect(html).toContain('<td>Apresenta imagens</td>')
      expect(html).toContain('<td>Discutem em pares</td>')
      expect(html).toContain('</table>')
    })

    it('deve converter divisores --- em <hr class="content-divider" />', () => {
      const markdown = `
Texto anterior
---
Texto posterior
`
      const html = formatMarkdownToHtml(markdown)
      expect(html).toContain('<hr class="content-divider" />')
    })

    it('deve converter listas não ordenadas em <ul><li>...</li></ul>', () => {
      const markdown = `
- **[EF09LI01]** Fazer uso da língua inglesa
- **[EF09LI02]** Compreender textos orais
`
      const html = formatMarkdownToHtml(markdown)
      expect(html).toContain('<ul><li><strong>[EF09LI01]</strong> Fazer uso da língua inglesa</li></ul>')
      expect(html).toContain('<ul><li><strong>[EF09LI02]</strong> Compreender textos orais</li></ul>')
    })

    it('deve adaptar ênfase para dislexia sem itálicos quando solicitado', () => {
      const markdown = 'Palavra *destacada*'
      const htmlStandard = formatInlineMarkdown(markdown, 'standard')
      const htmlDyslexia = formatInlineMarkdown(markdown, 'dyslexia')

      expect(htmlStandard).toContain('<em>destacada</em>')
      expect(htmlDyslexia).toContain('<strong>destacada</strong>')
      expect(htmlDyslexia).not.toContain('<em>')
    })
  })

  // ─── 5.3 Auditoria da Aba Preview e Ausência de Emojis Formais ──────────────
  describe('5.3 Auditoria de LessonStudio.tsx — Preview Formal sem Emojis Desnecessários', () => {
    const studioPath = path.resolve(__dirname, '../components/modules/LessonStudio.tsx')
    const content = fs.readFileSync(studioPath, 'utf-8')

    it('não deve conter emojis nos cabeçalhos da folha formal na aba preview', () => {
      // Localiza o bloco da aba preview
      const previewBlockMatch = content.match(/\{activeTab === 'preview' && \([\s\S]*?\{activeTab === 'bank' && \(/)
      expect(previewBlockMatch).not.toBeNull()
      const previewBlock = previewBlockMatch![0]

      // Cabeçalhos de seções no preview não devem ter emojis
      expect(previewBlock).not.toContain('🧩 Adaptação Curricular')
      expect(previewBlock).toContain('Adaptação Curricular Individual (PDI / PEI):')

      expect(previewBlock).not.toContain('🏆 Meta da Aula')
      expect(previewBlock).toContain('Meta da Aula (Critério de Sucesso)')

      expect(previewBlock).not.toContain('💡 Conhecimento Prévio')
      expect(previewBlock).toContain('Conhecimento Prévio')

      expect(previewBlock).not.toContain('⚠️ Problemas Antecipados')
      expect(previewBlock).toContain('Problemas Antecipados')

      expect(previewBlock).not.toContain('🔤 Vocabulário')
      expect(previewBlock).toContain('Vocabulário e Conceitos Prévios (Pre-teach)')

      expect(previewBlock).not.toContain('👥 Dupla')
      expect(previewBlock).not.toContain('🏛️ Turma Toda')

      expect(previewBlock).not.toContain('🪜 Andaimes Pedagógicos')
      expect(previewBlock).toContain('Andaimes Pedagógicos &amp; Perguntas de Checagem (CCQs) do Roteiro:')
    })
  })
})
