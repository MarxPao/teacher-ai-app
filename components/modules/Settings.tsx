'use client'

import { useState, useEffect } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'

interface Config { school: string; teacher: string; apikey: string; instructions: string; cloudSyncUrl?: string }

const STORAGE_KEYS = [
  'teacher_schools',
  'teacher_classes',
  'teacher_students',
  'teacher_apis',
  'teacher_question_bank',
  'teacher_editor_docs_v2',
  'teacher_school_headers',
  'teacher_calendar_tasks',
  'teacher_dashboard_todos',
  'teacher_communications',
  'teacher_pedagogic_metrics',
  'teacher_school_metrics',
  'teacher_class_metrics',
  'teacher_student_metrics',
  'teacher_cfg',
]

export default function Settings() {
  const [cfg, setCfg]         = useState<Config>({ school: '', teacher: '', apikey: '', instructions: '', cloudSyncUrl: '' })
  const [saved, setSaved]     = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')

  useEffect(() => {
    const s = localStorage.getItem('teacher_cfg')
    if (s) setCfg(JSON.parse(s))
  }, [])

  function save() {
    localStorage.setItem('teacher_cfg', JSON.stringify(cfg))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  /* Exportar Backup JSON */
  function exportBackup() {
    const backup: Record<string, unknown> = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      data: {} as Record<string, unknown>
    }

    STORAGE_KEYS.forEach(key => {
      const val = localStorage.getItem(key)
      if (val) (backup.data as Record<string, unknown>)[key] = JSON.parse(val)
    })

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teacher_ai_backup_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /* Importar Backup JSON */
  function importBackup() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string)
          if (!parsed.data) throw new Error('Formato de backup inválido')
          
          Object.entries(parsed.data).forEach(([key, val]) => {
            localStorage.setItem(key, JSON.stringify(val))
          })

          window.dispatchEvent(new Event('storage'))
          alert('✅ Backup restaurado com sucesso! Recarregando dados...')
          window.location.reload()
        } catch (err) {
          alert(`❌ Falha ao restaurar backup: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  /* Sincronização Cloud Opcional */
  async function triggerCloudSync() {
    if (!cfg.cloudSyncUrl) {
      alert('Insira a URL do seu servidor/endpoint Cloud Sync ou Supabase.')
      return
    }
    setSyncing(true)
    setSyncStatus('Sincronizando com a nuvem...')
    try {
      const payload: Record<string, unknown> = {}
      STORAGE_KEYS.forEach(key => {
        const val = localStorage.getItem(key)
        if (val) payload[key] = JSON.parse(val)
      })

      const res = await fetch(cfg.cloudSyncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, timestamp: Date.now() }),
      })
      if (res.ok) {
        setSyncStatus('✅ Sincronizado com sucesso!')
      } else {
        setSyncStatus('❌ Servidor retornou erro')
      }
    } catch {
      setSyncStatus('❌ Erro de conexão com o servidor')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <ModuleShell 
      title="Settings & Cloud Sync"
      subtitle="Configurações gerais, backup completo em JSON e sincronização cloud."
      maxWidth={780}
    >
      {/* Identidade */}
      <ModuleCard title="Identidade" icon="ti-building-school" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {[{ label: 'Nome da Escola', key: 'school' as const, placeholder: 'Ex: Colégio São João' }, { label: 'Professor(a)', key: 'teacher' as const, placeholder: 'Seu nome completo' }].map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>{f.label}</div>
              <input
                value={cfg[f.key] || ''}
                onChange={e => setCfg({ ...cfg, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: 'Outfit, sans-serif' }}
              />
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>Instruções Padrão</div>
          <textarea
            value={cfg.instructions || ''}
            onChange={e => setCfg({ ...cfg, instructions: e.target.value })}
            rows={2}
            placeholder="Cabeçalho padrão das provas, instruções gerais..."
            style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', resize: 'none', fontFamily: 'Outfit, sans-serif', lineHeight: 1.5 }}
          />
        </div>
      </ModuleCard>

      {/* Backup & Restauração Completa */}
      <ModuleCard title="Backup & Transferência de Dados (.JSON)" icon="ti-database" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 16px' }}>
          Baixe um arquivo de backup com todas as suas escolas, turmas, alunos, notas, questões e provas para restaurar em qualquer computador.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={exportBackup} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#073642', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-download" /> Exportar Backup (.JSON)
          </button>
          <button onClick={importBackup} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #073642', background: '#eee8d5', color: '#073642', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-upload" /> Restaurar Backup (.JSON)
          </button>
        </div>
      </ModuleCard>

      {/* Cloud Sync Opcional */}
      <ModuleCard title="Sincronização Cloud (Opcional)" icon="ti-cloud-upload" style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 12px' }}>
          Configuração de endpoint para sincronizar os dados entre múltiplos dispositivos via Supabase/Webhook.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={cfg.cloudSyncUrl || ''}
            onChange={e => setCfg({ ...cfg, cloudSyncUrl: e.target.value })}
            placeholder="https://seu-servidor.com/api/sync"
            style={{ flex: 1, minWidth: 240, border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13, background: '#fdf6e3', color: '#073642', outline: 'none' }}
          />
          <button onClick={triggerCloudSync} disabled={syncing} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#268bd2', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {syncing ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Sincronizando...</> : <><i className="ti ti-cloud-upload" /> Sincronizar Agora</>}
          </button>
        </div>
        {syncStatus && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: '#073642' }}>{syncStatus}</div>}
      </ModuleCard>

      {/* Salvar */}
      <button
        onClick={save}
        style={{
          width: '100%', padding: '16px 32px', borderRadius: 16, border: 'none',
          background: saved ? '#859900' : '#073642', color: '#fdf6e3',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s',
          boxShadow: saved ? '0 8px 20px rgba(133,153,0,0.2)' : '0 8px 20px rgba(7,54,66,0.15)'
        }}
      >
        <i className={`ti ${saved ? 'ti-check' : 'ti-device-floppy'} text-xl`} />
        {saved ? 'Configurações Salvas!' : 'Salvar Configurações'}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </ModuleShell>
  )
}
