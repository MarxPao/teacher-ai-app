import { useEffect, useRef } from 'react'

/**
 * useModalA11y — Hook de Acessibilidade para Modais (WCAG 2.1 AA)
 * 
 * Garante:
 * 1. Focus Trap: Ao pressionar Tab / Shift+Tab, o foco nunca escapa para trás do modal.
 * 2. Fechamento por Teclado: Tecla 'Escape' fecha o modal imediatamente.
 * 3. Restauração de Foco: Ao fechar o modal, retorna o foco para o elemento disparador original.
 * 4. Foco Inicial: Foca automaticamente no primeiro input/botão do modal ao abrir.
 */
export function useModalA11y({
  isOpen,
  onClose,
  modalRef
}: {
  isOpen: boolean
  onClose: () => void
  modalRef: React.RefObject<HTMLElement | null>
}) {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    // 1. Salva o elemento com foco atual para restaurar depois
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement
    }

    const modalElement = modalRef.current
    if (!modalElement) return

    // 2. Procura elementos focáveis dentro do modal
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const getFocusableElements = () => {
      if (!modalRef.current) return []
      return Array.from(modalRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
    }

    // Foca no primeiro elemento interativo
    const focusables = getFocusableElements()
    if (focusables.length > 0) {
      setTimeout(() => {
        focusables[0]?.focus()
      }, 50)
    }

    // 3. Listener de Teclado (Escape e Focus Trap com Tab)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const currentFocusables = getFocusableElements()
        if (currentFocusables.length === 0) return

        const firstElement = currentFocusables[0]
        const lastElement = currentFocusables[currentFocusables.length - 1]

        if (e.shiftKey) {
          // Shift + Tab: se estiver no primeiro elemento, vai para o último
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement?.focus()
          }
        } else {
          // Tab normal: se estiver no último elemento, vai para o primeiro
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement?.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // 4. Cleanup: restaura listener e foco original
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen, onClose, modalRef])
}
