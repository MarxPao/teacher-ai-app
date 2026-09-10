'use client'

import React from 'react'
import ConnectionsHub from '@/components/modules/ConnectionsHub'

export interface ConnectedPortalsPanelProps {
  onNavigateToAiSettings?: () => void
  onPortalConnected?: (portalName: string) => void
}

/**
 * ConnectedPortalsPanel.tsx — Consolidado no ConnectionsHub (Fase 4 - Connector Engine)
 *
 * Módulo unificado de conexões: substitui o painel isolado de portais,
 * delegando para a Central de Conexões única (ConnectionsHub.tsx).
 * Mantido como adaptador de compatibilidade retroativa para evitar breaking changes.
 */
export default function ConnectedPortalsPanel({
  onNavigateToAiSettings,
}: ConnectedPortalsPanelProps) {
  return <ConnectionsHub embedded onNavigateToAiSettings={onNavigateToAiSettings} />
}
