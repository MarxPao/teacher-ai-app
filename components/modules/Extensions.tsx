'use client'

import React from 'react'
import ConnectionsHub from './ConnectionsHub'
import BridgeCommandTest from './BridgeCommandTest'

export type ExtensionTabKey = 'mirror' | 'trello' | 'portals' | 'actions' | 'logs' | 'install'

export interface ExtensionsProps {
  initialTab?: ExtensionTabKey
}

export default function Extensions({ initialTab = 'portals' }: ExtensionsProps) {
  const hubTab = initialTab === 'actions' ? 'actions' : initialTab === 'logs' ? 'logs' : 'connections'
  return (
    <div className="flex flex-col gap-4 p-4">
      <BridgeCommandTest />
      <ConnectionsHub initialTab={hubTab} />
    </div>
  )
}
