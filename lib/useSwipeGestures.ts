'use client'

import { useRef, useState, useCallback, useEffect, RefObject } from 'react'

export interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** Minimum horizontal displacement in px to trigger a swipe. Default: 60 */
  threshold?: number
}

export interface SwipeGestureState {
  isSwiping: boolean
  direction: 'left' | 'right' | null
}

/**
 * Hook de gestos de swipe para mobile (#43).
 * Detecta swipe horizontal e previne scroll acidental durante o gesto.
 *
 * @param ref - Referência ao elemento DOM alvo.
 * @param options - Callbacks e threshold de disparo.
 */
export function useSwipeGestures(
  ref: RefObject<HTMLElement | null>,
  options: SwipeGestureOptions = {}
): SwipeGestureState {
  const { onSwipeLeft, onSwipeRight, threshold = 60 } = options

  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchCurrentX = useRef<number>(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right' | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchCurrentX.current = e.touches[0].clientX
    setDirection(null)
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    touchCurrentX.current = currentX

    const deltaX = Math.abs(currentX - touchStartX.current)
    const deltaY = Math.abs(currentY - touchStartY.current)

    // Only lock to horizontal swipe if horizontal movement is dominant
    if (deltaX > deltaY && deltaX > 10) {
      setIsSwiping(true)
      setDirection(currentX < touchStartX.current ? 'left' : 'right')
      // Prevent vertical scroll during horizontal swipe
      e.preventDefault()
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    const deltaX = touchCurrentX.current - touchStartX.current

    if (Math.abs(deltaX) >= threshold) {
      if (deltaX < 0) {
        onSwipeLeft?.()
      } else {
        onSwipeRight?.()
      }
    }

    setIsSwiping(false)
    setDirection(null)
  }, [threshold, onSwipeLeft, onSwipeRight])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd])

  return { isSwiping, direction }
}
