'use client'

import { useEffect } from 'react'

interface ContextMenuItem {
  label: string
  icon: string
  onClick: () => void
  danger?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

/**
 * Menu de clique direito contextual (#15).
 * Posiciona automaticamente ajustando para não sair da viewport.
 */
export default function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const MENU_WIDTH  = 220
  const ITEM_HEIGHT = 36
  const MENU_HEIGHT = items.length * ITEM_HEIGHT + 16

  // Ajusta posição para não sair da tela
  const adjustedX = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - MENU_WIDTH - 16)
  const adjustedY = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - MENU_HEIGHT - 16)

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      onClose()
      e.stopPropagation()
    }
    // Pequeno delay para evitar fechar imediatamente no click que abriu
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler)
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="animate-slide-down"
      onContextMenu={e => e.preventDefault()}
      style={{
        position: 'fixed',
        top: adjustedY,
        left: adjustedX,
        width: MENU_WIDTH,
        background: '#fffcf8',
        border: '1px solid rgba(139,115,85,0.20)',
        borderRadius: 12,
        padding: '6px',
        zIndex: 9999,
        boxShadow: '0 8px 32px rgba(44,26,14,0.18), 0 2px 8px rgba(44,26,14,0.10)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {items.map((item, i) => (
        item.separator ? (
          <div key={`sep-${i}`} style={{ height: 1, background: 'rgba(139,115,85,0.12)', margin: '4px 4px' }} />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose() }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              color: item.danger ? '#a83232' : '#2c1a0e',
              fontSize: 13.5,
              fontWeight: 500,
              cursor: 'pointer',
              borderRadius: 8,
              textAlign: 'left',
              transition: 'background 0.1s ease',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = item.danger
                ? 'rgba(168,50,50,0.08)'
                : 'rgba(139,94,60,0.07)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            <i className={`ti ${item.icon}`} style={{
              fontSize: 15,
              color: item.danger ? '#a83232' : '#8b5e3c',
              width: 18,
              flexShrink: 0,
            }} />
            {item.label}
          </button>
        )
      ))}
    </div>
  )
}

/**
 * Hook helper para gerenciar estado do context menu.
 */
export function useContextMenu() {
  return {
    // Usar em conjunto com useState no componente pai:
    // const [ctxMenu, setCtxMenu] = useState<{ x:number; y:number; items: ContextMenuItem[] } | null>(null)
    // onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, items: [...] }) }}
  }
}
