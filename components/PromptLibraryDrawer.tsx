'use client'

import React, { useState } from 'react'
import { usePromptLibrary, SavedPrompt } from '@/lib/usePromptLibrary'
import { COLOR, FONT, RADIUS } from '@/styles/tokens'

interface PromptLibraryDrawerProps {
  open: boolean
  onClose: () => void
  onSelectPrompt: (promptText: string) => void
  currentModule?: string
}

/**
 * Drawer lateral da Biblioteca de Prompts Favoritos (#24).
 */
export default function PromptLibraryDrawer({
  open,
  onClose,
  onSelectPrompt,
  currentModule,
}: PromptLibraryDrawerProps) {
  const { prompts, savePrompt, deletePrompt, usePrompt, searchPrompts } = usePromptLibrary()
  const [query, setQuery] = useState('')
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPromptText, setNewPromptText] = useState('')
  const [newTag, setNewTag] = useState('')

  if (!open) return null

  const filtered = searchPrompts(query)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newPromptText.trim()) return
    const tags = newTag ? newTag.split(',').map((t) => t.trim()).filter(Boolean) : []
    savePrompt(newTitle.trim(), newPromptText.trim(), currentModule || 'general', tags)
    setNewTitle('')
    setNewPromptText('')
    setNewTag('')
    setIsAddingNew(false)
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,17,10,0.5)',
        backdropFilter: 'blur(6px)',
        zIndex: 9990,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        className="animate-slide-up"
        style={{
          width: 400,
          maxWidth: '100%',
          height: '100%',
          background: '#fffcf8',
          boxShadow: '-8px 0 32px rgba(44,26,14,0.2)',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid rgba(139,115,85,0.18)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(139,115,85,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fdf8f2',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>⭐</span>
            <h3
              style={{
                fontFamily: FONT.display,
                fontSize: 18,
                fontWeight: 700,
                color: '#2c1a0e',
                margin: 0,
              }}
            >
              Prompts Favoritos
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#7a5c42',
            }}
          >
            &times;
          </button>
        </div>

        {/* Search & Add New Toggle */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(139,115,85,0.08)' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Buscar por título, tag ou conteúdo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: 8,
                border: '1px solid rgba(139,115,85,0.25)',
                background: '#fcfaf7',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <i
              className="ti ti-search"
              style={{
                position: 'absolute',
                left: 10,
                top: 10,
                color: '#8b5e3c',
                fontSize: 15,
              }}
            />
          </div>

          <button
            onClick={() => setIsAddingNew((v) => !v)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 8,
              border: '1px dashed #8b5e3c',
              background: 'rgba(139,94,60,0.05)',
              color: '#8b5e3c',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <i className={isAddingNew ? 'ti ti-minus' : 'ti ti-plus'} />
            {isAddingNew ? 'Cancelar Novo Prompt' : 'Criar Novo Prompt Favorito'}
          </button>
        </div>

        {/* Formulário Novo Prompt */}
        {isAddingNew && (
          <form
            onSubmit={handleSave}
            style={{
              padding: '16px 24px',
              background: '#fbf7f0',
              borderBottom: '1px solid rgba(139,115,85,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <input
              type="text"
              placeholder="Título (ex: Prova B1 Present Perfect)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(139,115,85,0.2)',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <textarea
              placeholder="Conteúdo do prompt..."
              value={newPromptText}
              onChange={(e) => setNewPromptText(e.target.value)}
              required
              rows={3}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(139,115,85,0.2)',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <input
              type="text"
              placeholder="Tags separadas por vírgula (ex: gramática, 9ano)"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(139,115,85,0.2)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #8b5e3c, #6f4728)',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Salvar na Biblioteca ⭐
            </button>
          </form>
        )}

        {/* Lista de Prompts */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#7a5c42', padding: '40px 0', fontSize: 13 }}>
              Nenhum prompt encontrado. Crie o primeiro acima!
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                style={{
                  background: '#fff',
                  border: '1px solid rgba(139,115,85,0.14)',
                  borderRadius: RADIUS.md,
                  padding: 14,
                  boxShadow: '0 1px 4px rgba(44,26,14,0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>
                    {item.title}
                  </h4>
                  <button
                    onClick={() => deletePrompt(item.id)}
                    title="Excluir prompt"
                    style={{ background: 'none', border: 'none', color: '#a83232', cursor: 'pointer', fontSize: 13 }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>

                <p
                  style={{
                    fontSize: 12.5,
                    color: '#5c3d20',
                    margin: '0 0 10px',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.prompt}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {item.tags?.map((t, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          background: 'rgba(139,94,60,0.08)',
                          color: '#8b5e3c',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      usePrompt(item.id)
                      onSelectPrompt(item.prompt)
                      onClose()
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      background: '#8b5e3c',
                      color: '#fff',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Usar <i className="ti ti-arrow-right" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
