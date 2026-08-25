'use client'

import React from 'react'

interface ModuleTransitionProps {
  /** Unique key for the current module — changing it triggers the enter animation */
  moduleKey: string
  children: React.ReactNode
}

/**
 * Wrapper de animação entre módulos (#4).
 *
 * Usa a prop `key` do React para forçar desmontagem + remontagem do wrapper,
 * acionando a classe CSS `module-enter` (definida em globals.css como slideUp).
 *
 * Basta envolver o conteúdo de cada módulo com este componente e passar
 * o identificador do módulo ativo como `moduleKey`.
 */
export default function ModuleTransition({ moduleKey, children }: ModuleTransitionProps) {
  return (
    <div key={moduleKey} className="module-enter">
      {children}
    </div>
  )
}
