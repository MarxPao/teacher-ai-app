'use client'

import ModuleShell from '@/components/ModuleShell'

export default function ComingSoon() {
  return (
    <ModuleShell 
      title="Em Breve"
      subtitle="Estamos trabalhando nesta funcionalidade para você."
    >
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '100px 0',
        color: '#93a1a1'
      }}>
        <div style={{ 
          width: 120, 
          height: 120, 
          borderRadius: 40, 
          background: '#fff', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          boxShadow: '0 10px 30px rgba(0,43,54,0.05)',
          marginBottom: 32,
          border: '1px solid rgba(88,110,117,0.1)'
        }}>
          <i className="ti ti-rocket text-6xl text-sol-yellow opacity-40" />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#073642', marginBottom: 12 }}>Novidades a caminho!</h2>
        <p style={{ fontSize: 16, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          Esta funcionalidade está sendo desenvolvida com foco em produtividade e elegância. Fique atento às próximas atualizações.
        </p>
      </div>
    </ModuleShell>
  )
}
