'use client'

import { useState, useEffect, useCallback } from 'react'

export interface SavedPrompt {
  id: string
  title: string
  prompt: string
  module: string
  tags: string[]
  createdAt: number
  usageCount: number
}

const STORAGE_KEY = 'teacher_prompt_library'

function loadPrompts(): SavedPrompt[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function persistPrompts(prompts: SavedPrompt[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts)) } catch {}
}

export function usePromptLibrary() {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([])

  useEffect(() => {
    setPrompts(loadPrompts())
  }, [])

  const savePrompt = useCallback((
    title: string,
    prompt: string,
    module: string,
    tags: string[] = []
  ): SavedPrompt => {
    const newPrompt: SavedPrompt = {
      id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      prompt,
      module,
      tags,
      createdAt: Date.now(),
      usageCount: 0,
    }
    setPrompts(prev => {
      const updated = [newPrompt, ...prev]
      persistPrompts(updated)
      return updated
    })
    return newPrompt
  }, [])

  const deletePrompt = useCallback((id: string) => {
    setPrompts(prev => {
      const updated = prev.filter(p => p.id !== id)
      persistPrompts(updated)
      return updated
    })
  }, [])

  const usePrompt = useCallback((id: string) => {
    setPrompts(prev => {
      const updated = prev.map(p =>
        p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p
      )
      persistPrompts(updated)
      return updated
    })
  }, [])

  const searchPrompts = useCallback((query: string, module?: string): SavedPrompt[] => {
    const q = query.toLowerCase()
    return prompts.filter(p => {
      const matchesQuery = !q ||
        p.title.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      const matchesModule = !module || p.module === module
      return matchesQuery && matchesModule
    }).sort((a, b) => b.usageCount - a.usageCount || b.createdAt - a.createdAt)
  }, [prompts])

  return { prompts, savePrompt, deletePrompt, usePrompt, searchPrompts }
}
