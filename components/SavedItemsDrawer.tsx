'use client'
import { toast, showConfirm } from '@/components/Toast'
import { useState, useEffect } from 'react'

export interface SavedItem {
  id: string
  title: string
  subtitle?: string
  content: string
  createdAt: string
  tags?: string[]
  type?: string
}

interface SavedItemsDrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  storageKey: string
  onSelect: (item: SavedItem) => void
}

export default function SavedItemsDrawer({
  isOpen,
  onClose,
  title,
  storageKey,
  onSelect,
}: SavedItemsDrawerProps) {
  const [items, setItems] = useState<SavedItem[]>([])
  const [filter, setFilter] = useState('')

  const loadItems = () => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setItems(JSON.parse(raw))
      else setItems([])
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    if (isOpen) loadItems()
  }, [isOpen, storageKey])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!(await showConfirm({ message: 'Deseja excluir este item salvo?' }))) return
    const upd = items.filter(i => i.id !== id)
    setItems(upd)
    localStorage.setItem(storageKey, JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
  }

  const filtered = items.filter(i =>
    i.title.toLowerCase().includes(filter.toLowerCase()) ||
    (i.subtitle || '').toLowerCase().includes(filter.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(7,54,66,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'flex-end',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      <div style={{
        width: 440, maxWidth: '90vw', height: '100%',
        background: '#fdf8f2', borderLeft: '1px solid #ede8dc',
        boxShadow: '-12px 0 40px rgba(44,26,14,0.18)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideLeft 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <style>{`
          @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
          @keyframes slideLeft { from { transform: translateX(100%) } to { transform: translateX(0) } }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '20px 24px', background: '#2c1a0e', color: '#fdf8f2',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-bookmark" style={{ fontSize: 22, color: '#b58900' }} />
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
              <span style={{ fontSize: 11, color: '#a08060' }}>
                {items.length} {items.length === 1 ? 'item salvo' : 'itens salvos'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#a08060',
              fontSize: 24, cursor: 'pointer', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '14px 20px', background: '#f0e8d8', borderBottom: '1px solid #e4ddd0' }}>
          <div style={{ position: 'relative' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a08060', fontSize: 14 }} />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Buscar nos salvos..."
              style={{
                width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10,
                border: '1px solid #d3cbbd', background: '#fff', fontSize: 13,
                outline: 'none', boxSizing: 'border-box', color: '#2c1a0e',
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a08060' }}>
              <i className="ti ti-folder-off" style={{ fontSize: 44, opacity: 0.4, marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: 14, margin: 0 }}>Nenhum item salvo encontrado.</p>
              <span style={{ fontSize: 12, color: '#657b83', display: 'block', marginTop: 4 }}>
                Crie um novo conteúdo e clique em "Salvar" para listá-lo aqui.
              </span>
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.id}
                onClick={() => { onSelect(item); onClose() }}
                style={{
                  background: '#fff', borderRadius: 14, padding: '14px 16px',
                  border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.04)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#2c1a0e')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#ede8dc')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#2c1a0e', lineHeight: 1.3 }}>
                    {item.title}
                  </div>
                  <button
                    onClick={e => handleDelete(item.id, e)}
                    title="Excluir item salvo"
                    style={{
                      background: 'none', border: 'none', color: '#dc322f',
                      cursor: 'pointer', fontSize: 15, padding: 2, marginLeft: 8,
                    }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>

                {item.subtitle && (
                  <div style={{ fontSize: 12, color: '#7a5c42' }}>
                    {item.subtitle}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: '#a08060' }}>
                    📅 {new Date(item.createdAt).toLocaleDateString('pt-BR')} às {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#268bd2', display: 'flex', alignItems: 'center', gap: 3 }}>
                    Abrir <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/** Helper para salvar um item no localStorage de qualquer módulo */
export function saveItemToStorage(storageKey: string, item: Omit<SavedItem, 'id' | 'createdAt'>) {
  try {
    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]')
    const newItem: SavedItem = {
      ...item,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    }
    const upd = [newItem, ...existing]
    localStorage.setItem(storageKey, JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
    return newItem
  } catch {
    return null
  }
}
