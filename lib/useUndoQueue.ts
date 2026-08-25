'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface UndoAction {
  id: string
  label: string
  undo: () => void
  timestamp: number
}

const QUEUE_LIMIT = 20

/**
 * Hook de fila de desfazer global com Ctrl+Z (#16).
 */
export function useUndoQueue() {
  const [queue, setQueue] = useState<UndoAction[]>([])

  const addAction = useCallback((label: string, undoFn: () => void): string => {
    const id = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const action: UndoAction = { id, label, undo: undoFn, timestamp: Date.now() }
    setQueue(prev => [action, ...prev].slice(0, QUEUE_LIMIT))
    return id
  }, [])

  const undo = useCallback(() => {
    setQueue(prev => {
      if (prev.length === 0) return prev
      const [last, ...rest] = prev
      try { last.undo() } catch (e) { console.error('[Undo] Error:', e) }
      return rest
    })
  }, [])

  const removeAction = useCallback((id: string) => {
    setQueue(prev => prev.filter(a => a.id !== id))
  }, [])

  // Listener global Ctrl+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        // Não interceptar em campos de texto (deixa o browser lidar)
        const tag = (document.activeElement as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo])

  return {
    addAction,
    undo,
    removeAction,
    lastAction: queue[0] ?? null,
    queueLength: queue.length,
    queue,
  }
}
