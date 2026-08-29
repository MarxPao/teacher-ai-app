'use client'

import React, { useState } from 'react'
import { FONT, RADIUS } from '@/styles/tokens'

export interface LessonTemplate {
  id: string
  title: string
  subject: string
  gradeLevel: string
  duration: string
  bnccCode?: string
  description: string
  tags: string[]
}

const TEMPLATES: LessonTemplate[] = [
  {
    id: 'tmpl_1',
    title: 'Desvendando o Present Perfect através de Notícias',
    subject: 'Língua Inglesa',
    gradeLevel: '9º Ano',
    duration: '50 min',
    bnccCode: 'EF09LI01',
    description: 'Atividade dinâmica onde os alunos analisam manchetes reais para identificar o uso do Present Perfect e Simple Past.',
    tags: ['Gramática', 'Mídia', 'BNCC', 'Interativo'],
  },
  {
    id: 'tmpl_2',
    title: 'Produção de Texto Argumentativo: Redação Estilo Cambridge',
    subject: 'Língua Inglesa',
    gradeLevel: 'Ensino Médio',
    duration: '100 min (Aula Dupla)',
    bnccCode: 'EM13LGG102',
    description: 'Estruturação de introdução, argumentos de sustentação e conclusão com conectivos formais e autoavaliação.',
    tags: ['Redação', 'Cambridge B2', 'Argumentação'],
  },
  {
    id: 'tmpl_3',
    title: 'Quiz Gamificado & Estações de Aprendizagem',
    subject: 'Geral',
    gradeLevel: '6º ao 9º Ano',
    duration: '50 min',
    description: 'Metodologia ativa dividindo a sala em 4 estações de rotação com flashcards, quiz em duplas e produção oral.',
    tags: ['Metodologias Ativas', 'Gamificação', 'Rotação'],
  },
  {
    id: 'tmpl_4',
    title: 'Oral Presentation: Pitch de Ideias Sustentáveis',
    subject: 'Língua Inglesa / Interdisciplinar',
    gradeLevel: '8º Ano',
    duration: '50 min',
    bnccCode: 'EF08LI03',
    description: 'Apresentação oral rápida de 2 minutos sobre sustentabilidade na escola com rubrica de pronúncia e vocabulário.',
    tags: ['Speaking', 'Pronúncia', 'Sustentabilidade'],
  },
]

interface TemplateGalleryProps {
  onUseTemplate: (template: LessonTemplate) => void
}

/**
 * Galeria de Templates de Aula BNCC-Alinhados (#27).
 */
export default function TemplateGallery({ onUseTemplate }: TemplateGalleryProps) {
  const [query, setQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const allTags = Array.from(new Set(TEMPLATES.flatMap((t) => t.tags)))

  const filtered = TEMPLATES.filter((t) => {
    const matchesQuery =
      !query ||
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.description.toLowerCase().includes(query.toLowerCase()) ||
      t.bnccCode?.toLowerCase().includes(query.toLowerCase())
    const matchesTag = !selectedTag || t.tags.includes(selectedTag)
    return matchesQuery && matchesTag
  })

  return (
    <div
      style={{
        background: '#fffcf8',
        border: '1px solid rgba(139,115,85,0.16)',
        borderRadius: RADIUS.lg,
        padding: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#2c1a0e', fontFamily: FONT.display }}>
            📚 Galeria de Templates Pedagógicos
          </h3>
          <span style={{ fontSize: 12.5, color: '#7a5c42' }}>
            Planos prontos e validados com habilidades BNCC para clonar e customizar
          </span>
        </div>
      </div>

      {/* Busca e Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar template por tema, BNCC ou conteúdo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: 240,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #d5c8bb',
            fontSize: 13,
            outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedTag(null)}
            style={{
              padding: '6px 12px',
              borderRadius: 16,
              border: selectedTag === null ? '1.5px solid #8b5e3c' : '1px solid #e8e0d0',
              background: selectedTag === null ? '#8b5e3c' : '#fff',
              color: selectedTag === null ? '#fff' : '#7a5c42',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Todos
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                border: selectedTag === tag ? '1.5px solid #8b5e3c' : '1px solid #e8e0d0',
                background: selectedTag === tag ? '#8b5e3c' : '#fff',
                color: selectedTag === tag ? '#fff' : '#7a5c42',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Templates */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {filtered.map((tmpl) => (
          <div
            key={tmpl.id}
            style={{
              background: '#fcfaf7',
              border: '1px solid rgba(139,115,85,0.14)',
              borderRadius: RADIUS.md,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 2px 6px rgba(44,26,14,0.03)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase' }}>
                  {tmpl.gradeLevel} &bull; {tmpl.duration}
                </span>
                {tmpl.bnccCode && (
                  <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(42,96,128,0.1)', color: '#2a6080', borderRadius: 4, fontWeight: 700 }}>
                    {tmpl.bnccCode}
                  </span>
                )}
              </div>

              <h4 style={{ margin: '0 0 8px', fontSize: 14.5, fontWeight: 700, color: '#2c1a0e', lineHeight: 1.3 }}>
                {tmpl.title}
              </h4>

              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#5c3d20', lineHeight: 1.4 }}>
                {tmpl.description}
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                {tmpl.tags.map((tag, i) => (
                  <span key={i} style={{ fontSize: 10, color: '#7a5c42', background: 'rgba(139,115,85,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                    {tag}
                  </span>
                ))}
              </div>

              <button
                onClick={() => onUseTemplate(tmpl)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #8b5e3c, #6f4728)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <i className="ti ti-copy" /> Clonar & Personalizar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
