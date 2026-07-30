'use client'

import ModuleShell from '@/components/ModuleShell'
import PortalMirror from '@/components/PortalMirror'

export default function PortalMirrorModule() {
  return (
    <ModuleShell
      title="Portal Mirror"
      subtitle="Preencha uma vez no TEACHER??? — os portais escolares são preenchidos automaticamente via extensão Chrome."
    >
      <PortalMirror />
    </ModuleShell>
  )
}
