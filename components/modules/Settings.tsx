'use client'
import { toast, showConfirm } from '@/components/Toast'

import { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import LanguageSelector from '@/components/LanguageSelector'
import {
  getPortalActionLogs,
  purgePortalActionLogs,
  exportPortalActionLogsCSV,
  getPortalConsentRecord,
  decryptSensitiveText,
  PortalActionLogRecord,
  PortalConsentRecord
} from '@/lib/portalSanitizer'

import { getGlobalDocumentPrefs, saveGlobalDocumentPrefs, DocumentStylePrefs } from '@/lib/exportUtils'
import { getCurrentUser, signOut } from '@/lib/supabaseAuth'
import { getAllSubjectProfiles, getSubjectProfile } from '@/lib/subjectProfile'
import { saveTeacherStyleProfile } from '@/lib/teacherStyleProfile'
import { getAuditLog, clearAuditLog, AiAuditEntry } from '@/lib/aiAuditLog'
import DatabaseStatusBadge from '@/components/DatabaseStatusBadge'
import SharedDatabaseConsentModal from '@/components/SharedDatabaseConsentModal'
import { isCustomSupabaseConfigured } from '@/lib/databaseConsent'
import TeacherCalibrationsManager from '@/components/modules/TeacherCalibrationsManager'
import ConnectedPortalsPanel from '@/components/modules/ConnectedPortalsPanel'
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'

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
  'teacher_document_style_prefs',
  'teacher_portal_action_logs_v1',
  'teacher_portal_consent_v1',
  'teacher_app_calibrations_v1',
  'teacher_discovered_portal_maps'
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'general' | 'portals' | 'calibrations' | 'formatting' | 'audit' | 'privacy'>('general')
  const [cfg, setCfg] = useState<Config>({ school: '', teacher: '', apikey: '', instructions: '', cloudSyncUrl: '' })
  const [docPrefs, setDocPrefs] = useState<DocumentStylePrefs>(getGlobalDocumentPrefs())
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')

  // Supabase BYOK & Transparência
  const [showTransparencyModal, setShowTransparencyModal] = useState(false)
  const [supabaseCustomUrl, setSupabaseCustomUrl] = useState(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem('teacher_supabase_config') : null
      return s ? JSON.parse(s).url || '' : ''
    } catch { return '' }
  })
  const [supabaseCustomKey, setSupabaseCustomKey] = useState(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem('teacher_supabase_config') : null
      return s ? JSON.parse(s).anonKey || '' : ''
    } catch { return '' }
  })

  // Trilha de Auditoria
  const [auditLogs, setAuditLogs] = useState<PortalActionLogRecord[]>([])
  const [aiAuditLogs, setAiAuditLogs] = useState<AiAuditEntry[]>([])
  const [consentRecord, setConsentRecord] = useState<PortalConsentRecord | null>(null)
  const [selectedLogDetail, setSelectedLogDetail] = useState<{ id: string; decrypted: string } | null>(null)
  const [selectedAiLogDetail, setSelectedAiLogDetail] = useState<string | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadAuditData = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const logs = await getPortalActionLogs()
      setAuditLogs(logs)
      const aiLogs = getAuditLog()
      setAiAuditLogs(aiLogs)
      const consent = getPortalConsentRecord()
      setConsentRecord(consent)
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    const s = localStorage.getItem('teacher_cfg')
    if (s) setCfg(JSON.parse(s))
    loadAuditData()

    const handleLogged = () => loadAuditData()
    window.addEventListener('teacher:action_logged', handleLogged)
    window.addEventListener('teacher:consent_updated', handleLogged)
    return () => {
      window.removeEventListener('teacher:action_logged', handleLogged)
      window.removeEventListener('teacher:consent_updated', handleLogged)
    }
  }, [loadAuditData])

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
          toast.success(' Backup restaurado com sucesso! Recarregando dados...')
          window.location.reload()
        } catch (err) {
          toast.success(` Falha ao restaurar backup: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  /* Exportar Auditoria CSV */
  async function handleExportAuditCSV() {
    const csv = await exportPortalActionLogsCSV()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trilha_auditoria_portais_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /* Limpar Logs de Auditoria de Portais */
  async function handlePurgeAudit() {
    if ((await showConfirm({ message: 'Deseja limpar todo o histórico da Trilha de Auditoria de Ações em Portais?' }))) {
      await purgePortalActionLogs()
      await loadAuditData()
      setSelectedLogDetail(null)
    }
  }

  /* Limpar Logs de Auditoria de Chamadas IA */
  async function handlePurgeAiAudit() {
    if ((await showConfirm({ message: 'Deseja limpar todo o registro de auditoria de chamadas de IA?' }))) {
      clearAuditLog()
      await loadAuditData()
      setSelectedAiLogDetail(null)
    }
  }

  /* Descriptografar e Exibir Detalhes */
  async function handleViewDetail(log: PortalActionLogRecord) {
    if (selectedLogDetail?.id === log.id) {
      setSelectedLogDetail(null)
      return
    }
    if (log.detailsEncrypted) {
      const decrypted = await decryptSensitiveText(log.detailsEncrypted)
      setSelectedLogDetail({ id: log.id, decrypted })
    } else {
      setSelectedLogDetail({ id: log.id, decrypted: log.summary })
    }
  }

  /* Sincronização Cloud Opcional */
  async function triggerCloudSync() {
    if (!cfg.cloudSyncUrl) {
      toast.success('Insira a URL do seu servidor/endpoint Cloud Sync ou Supabase.')
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
        setSyncStatus(' Sincronizado com sucesso!')
      } else {
        setSyncStatus(' Servidor retornou erro')
      }
    } catch {
      setSyncStatus(' Erro de conexão com o servidor')
    } finally {
      setSyncing(false)
    }
  }

  /* Exclusão Efetiva de Dados (Direito ao Esquecimento LGPD) */
  function eraseAllDataLGPD() {
    const confirmation = prompt(' ATENÇÃO LGPD - DIREITO AO ESQUECIMENTO:\nEsta ação apagará EFETIVAMENTE e IRREVERSIVELMENTE todos os seus dados pessoais, escolas, turmas, alunos, cadernetas, trilha de auditoria e provas salvas neste dispositivo.\n\nPara confirmar a exclusão definitiva, digite EXCLUIR:')
    if (confirmation === 'EXCLUIR') {
      STORAGE_KEYS.forEach(key => localStorage.removeItem(key))
      localStorage.removeItem('teacher_cfg')
      localStorage.removeItem('teacher_private_students')
      localStorage.removeItem('teacher_saved_exams')
      localStorage.removeItem('teacher_saved_lessons')
      localStorage.removeItem('teacher_crypto_salt_v1')

      window.dispatchEvent(new Event('storage'))
      toast.success(' Seus dados pessoais e registros foram excluídos com sucesso em conformidade com a LGPD. A aplicação será reiniciada.')
      window.location.reload()
    }
  }

  return (
    <ModuleShell 
      title="Configurações & Auditoria LGPD"
      subtitle="Identidade do professor, trilha de auditoria de agência em portais, retenção de dados e backup seguro."
      maxWidth={860}
    >
      {/* -- BARRA DE NAVEGAÇÃO DE ABAS -- */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #d5c8bb', paddingBottom: 10, flexWrap: 'wrap' }}>
        {[
          { key: 'general', label: '⚙️ Geral & Identidade', icon: 'ti-settings' },
          { key: 'portals', label: '🏫 Portais Conectados', icon: 'ti-plug-connected' },
          { key: 'calibrations', label: '🎛️ Calibrações & Padrões', icon: 'ti-adjustments-horizontal' },
          { key: 'formatting', label: '🎨 Formatação de Documentos', icon: 'ti-typography' },
          { key: 'audit', label: '🛡️ Auditoria de Ações', icon: 'ti-shield-check', badge: auditLogs.length },
          { key: 'privacy', label: '🔒 Privacidade, LGPD & Backup', icon: 'ti-lock' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: activeTab === tab.key ? '1px solid #8b5e3c' : '1px solid transparent',
              background: activeTab === tab.key ? '#8b5e3c' : '#f5f0eb',
              color: activeTab === tab.key ? '#fff' : '#2c1a0e',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s'
            }}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{ background: activeTab === tab.key ? 'rgba(255,255,255,0.25)' : '#d5c8bb', padding: '2px 7px', borderRadius: 12, fontSize: 11, fontWeight: 800 }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* -- ABA 0: PORTAIS CONECTADOS -- */}
      {activeTab === 'portals' && (
        <ConnectedPortalsPanel
          onNavigateToAiSettings={() => {
            setActiveTab('general')
          }}
        />
      )}

      {/* -- ABA 1: GERAL & IDENTIDADE -- */}
      {activeTab === 'general' && (
        <>
          {/* Conta de Professor & Matéria Principal */}
          <ModuleCard title="Conta de Professor & Matéria Principal" icon="ti-user-check" style={{ marginBottom: 20 }}>
            {(() => {
              const user = getCurrentUser()
              const rawSettings = typeof window !== 'undefined' ? localStorage.getItem('teacher_settings') : null
              const settings = rawSettings ? JSON.parse(rawSettings) : {}
              const currentDefaultSub = settings.defaultSubject || 'english'
              const subjects = getAllSubjectProfiles()

              return (
                <div className="space-y-4">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fdf8f2', borderRadius: 12, border: '1px solid rgba(88,110,117,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#2c1a0e', color: '#fdf8f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        <i className="ti ti-user" />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>
                          {user?.name || cfg.teacher || 'Professor(a)'}
                        </div>
                        <div style={{ fontSize: 12, color: '#7a5c42' }}>
                          {user?.email || 'Sessão Docente Ativa'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        if ((await showConfirm({ message: 'Deseja realmente sair da sua conta?' }))) {
                          await signOut()
                          window.location.reload()
                        }
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: '1px solid #dc322f',
                        background: '#fff', color: '#dc322f', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <i className="ti ti-logout" />
                      <span>Sair da Conta</span>
                    </button>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#a08060', marginBottom: 6 }}>
                      Matéria Principal Padrão
                    </label>
                    <select
                      value={currentDefaultSub}
                      onChange={e => {
                        const newSub = e.target.value
                        const s = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('teacher_settings') || '{}') : {}
                        s.defaultSubject = newSub
                        localStorage.setItem('teacher_settings', JSON.stringify(s))
                        saveTeacherStyleProfile({ defaultSubject: newSub })
                        window.dispatchEvent(new Event('teacher:data_changed'))
                        setSaved(true)
                        setTimeout(() => setSaved(false), 2000)
                      }}
                      style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf8f2', color: '#2c1a0e', outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.id === 'english' ? 'Cambridge / CEFR' : 'BNCC / ENEM'})
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: 11.5, color: '#7a5c42', marginTop: 6, margin: '6px 0 0' }}>
                      Define a taxonomia e o gerador padrão quando nenhuma turma específica estiver selecionada.
                    </p>
                  </div>
                </div>
              )
            })()}
          </ModuleCard>

          {/* Armazenamento de Dados & Banco de Dados (Supabase) */}
          <ModuleCard title="Armazenamento de Dados & Banco de Dados (Supabase)" icon="ti-database" style={{ marginBottom: 20 }}>
            <div className="space-y-4">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 16px', background: '#fdf8f2', borderRadius: 12, border: '1px solid rgba(88,110,117,0.2)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Status da Infraestrutura:</span>
                    <DatabaseStatusBadge />
                  </div>
                  <p style={{ fontSize: 12, color: '#7a5c42', margin: 0 }}>
                    {isCustomSupabaseConfigured()
                      ? 'Conectado ao seu próprio projeto Supabase (BYOK). Seus dados estão 100% sob seu controle direto.'
                      : 'Utilizando o banco compartilhado padrão da plataforma com isolamento por usuário. Você pode conectar seu próprio banco Supabase a qualquer momento.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTransparencyModal(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #d5c0b0',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-info-circle" /> Ver Termos de Transparência
                </button>
              </div>

              <div style={{ borderTop: '1px solid #ede8dc', paddingTop: 14 }}>
                <h4 style={{ fontSize: 12, fontWeight: 800, color: '#2c1a0e', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 10px' }}>
                  Configurar Supabase Próprio (BYOK — Opcional)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#a08060', marginBottom: 5 }}>
                      URL do Projeto Supabase
                    </label>
                    <input
                      value={supabaseCustomUrl}
                      onChange={e => setSupabaseCustomUrl(e.target.value)}
                      placeholder="https://seu-projeto.supabase.co"
                      style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13, background: '#fdf8f2', color: '#2c1a0e', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#a08060', marginBottom: 5 }}>
                      Chave Anônima (Anon Key)
                    </label>
                    <input
                      type="password"
                      value={supabaseCustomKey}
                      onChange={e => setSupabaseCustomKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13, background: '#fdf8f2', color: '#2c1a0e', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  {isCustomSupabaseConfigured() && (
                    <button
                      type="button"
                      onClick={async () => {
                        if ((await showConfirm({ message: 'Deseja remover sua conexão personalizada e voltar ao banco compartilhado padrão?' }))) {
                          localStorage.removeItem('teacher_supabase_config')
                          setSupabaseCustomUrl('')
                          setSupabaseCustomKey('')
                          window.dispatchEvent(new CustomEvent('teacher:data_changed'))
                          setSaved(true)
                          setTimeout(() => setSaved(false), 2000)
                        }
                      }}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #dc322f', background: '#fff', color: '#dc322f', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Restaurar Banco Padrão
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!supabaseCustomUrl.trim() || !supabaseCustomKey.trim()) {
                        toast.success('Preencha a URL e a Anon Key do seu projeto Supabase.')
                        return
                      }
                      localStorage.setItem('teacher_supabase_config', JSON.stringify({
                        url: supabaseCustomUrl.trim(),
                        anonKey: supabaseCustomKey.trim()
                      }))
                      window.dispatchEvent(new CustomEvent('teacher:data_changed'))
                      setSaved(true)
                      setTimeout(() => setSaved(false), 2000)
                    }}
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <i className="ti ti-check" /> Salvar Conexão BYOK
                  </button>
                </div>
              </div>
            </div>
          </ModuleCard>

          <SharedDatabaseConsentModal
            isOpen={showTransparencyModal}
            onConsented={() => setShowTransparencyModal(false)}
            onConfigureCustom={() => setShowTransparencyModal(false)}
          />

          <ModuleCard title="Idioma do Aplicativo / Language" icon="ti-world" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 12px' }}>
              Escolha o idioma de preferência para a interface do Teacher AI.
            </p>
            <LanguageSelector />
          </ModuleCard>

          <ModuleCard title="Identidade" icon="ti-building-community" style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {[
                { label: 'Nome da Escola Principal', key: 'school' as const, placeholder: 'Ex: Colégio Machado Sobrinho' },
                { label: 'Professor(a)', key: 'teacher' as const, placeholder: 'Seu nome completo' }
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#a08060', marginBottom: 6 }}>{f.label}</div>
                  <input
                    value={cfg[f.key] || ''}
                    onChange={e => setCfg({ ...cfg, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf8f2', color: '#2c1a0e', outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  />
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#a08060', marginBottom: 6 }}>Instruções Padrão & Cabeçalhos</div>
              <textarea
                value={cfg.instructions || ''}
                onChange={e => setCfg({ ...cfg, instructions: e.target.value })}
                rows={2}
                placeholder="Cabeçalho padrão das provas, orientações metodológicas..."
                style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf8f2', color: '#2c1a0e', outline: 'none', resize: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.5 }}
              />
            </div>
          </ModuleCard>

          <button
            onClick={save}
            style={{
              width: '100%', padding: '15px 32px', borderRadius: 14, border: 'none',
              background: saved ? '#859900' : '#8b5e3c', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s',
              boxShadow: saved ? '0 8px 20px rgba(133,153,0,0.2)' : '0 8px 20px rgba(139,94,60,0.15)'
            }}
          >
            <i className={`ti ${saved ? 'ti-check' : 'ti-device-floppy'} text-xl`} />
            {saved ? 'Configurações Salvas!' : 'Salvar Identidade'}
          </button>
        </>
      )}

      {/* -- ABA DE CALIBRAÇÕES E PADRÕES DOS MÓDULOS -- */}
      {activeTab === 'calibrations' && (
        <TeacherCalibrationsManager />
      )}

      {/* -- ABA DE FORMATAÇÃO DE DOCUMENTOS (BLOCO E) -- */}
      {activeTab === 'formatting' && (
        <>
          <ModuleCard title="Preferências Globais de Documento & Impressão" icon="ti-typography" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 16px', lineHeight: 1.5 }}>
              Defina o padrão visual universal que será aplicado automaticamente a <strong>todos os Planos de Aula, Provas do ExamBuilder e Exercícios</strong> exportados pelo sistema.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#7a5c42', marginBottom: 6 }}>
                  Tipografia Padrão
                </label>
                <select
                  value={docPrefs.fontFamily}
                  onChange={e => setDocPrefs({ ...docPrefs, fontFamily: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fffcf8', fontSize: 13, outline: 'none' }}
                >
                  <option value="'Times New Roman', Times, serif">Times New Roman (Acadêmico Tradicional)</option>
                  <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans (Moderno & Claro)</option>
                  <option value="'Lexend', sans-serif">Lexend (Alta Legibilidade / Dislexia)</option>
                  <option value="Arial, Helvetica, sans-serif">Arial / Sans-Serif</option>
                  <option value="'Calibri', sans-serif">Calibri / Padrão Office</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#7a5c42', marginBottom: 6 }}>
                  Tamanho de Fonte do Corpo
                </label>
                <select
                  value={docPrefs.fontSizePt}
                  onChange={e => setDocPrefs({ ...docPrefs, fontSizePt: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fffcf8', fontSize: 13, outline: 'none' }}
                >
                  <option value={10}>10 pt (Compacto / Mais conteúdo por folha)</option>
                  <option value={11}>11 pt (Padrão Recomendado)</option>
                  <option value={12}>12 pt (Grande / Fácil Leitura)</option>
                  <option value={14}>14 pt (Ampliado)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#7a5c42', marginBottom: 6 }}>
                  Espaçamento entre Linhas
                </label>
                <select
                  value={docPrefs.lineHeight}
                  onChange={e => setDocPrefs({ ...docPrefs, lineHeight: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fffcf8', fontSize: 13, outline: 'none' }}
                >
                  <option value={1.15}>1.15 (Compacto)</option>
                  <option value={1.25}>1.25 (Recomendado)</option>
                  <option value={1.5}>1.5 (Espaçado / Tradicional)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#7a5c42', marginBottom: 6 }}>
                  Esquema de Cores do Documento
                </label>
                <select
                  value={docPrefs.primaryColor}
                  onChange={e => setDocPrefs({ ...docPrefs, primaryColor: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fffcf8', fontSize: 13, outline: 'none' }}
                >
                  <option value="#2c1a0e">Azul Escuro Sobrancelha (#2c1a0e)</option>
                  <option value="#8b5e3c">Tons de Terra / Caramelo (#8b5e3c)</option>
                  <option value="#2aa198">Turquesa Pedagógico (#2aa198)</option>
                  <option value="#268bd2">Azul Clássico (#268bd2)</option>
                  <option value="#000000">Monocromático Puro (#000000)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#7a5c42', marginBottom: 6 }}>
                  Margens da Página (A4)
                </label>
                <select
                  value={docPrefs.marginMm}
                  onChange={e => setDocPrefs({ ...docPrefs, marginMm: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fffcf8', fontSize: 13, outline: 'none' }}
                >
                  <option value={10}>10 mm (Margens Estreitas)</option>
                  <option value={15}>15 mm (Margens Médias / Padrão ABNT)</option>
                  <option value={20}>20 mm (Margens Largas)</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                saveGlobalDocumentPrefs(docPrefs)
                setSaved(true)
                setTimeout(() => setSaved(false), 2000)
              }}
              style={{
                marginTop: 20, width: '100%', padding: '14px 28px', borderRadius: 12, border: 'none',
                background: saved ? '#859900' : '#8b5e3c', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s'
              }}
            >
              <i className={`ti ${saved ? 'ti-check' : 'ti-device-floppy'} text-lg`} />
              {saved ? 'Padrão Visual Salvo!' : 'Salvar Padrão Visual de Documentos'}
            </button>
          </ModuleCard>
        </>
      )}

      {/* -- ABA 2: AUDITORIA DE AÇÕES (PORTAIS ESCOLARES) -- */}
      {activeTab === 'audit' && (
        <div>
          {/* Status do Consentimento */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }}></span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#166534' }}>
                  Consentimento de Agência Ativo (LGPD)
                </span>
                <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
                  {consentRecord?.termsVersion || 'v1.0_2026-08'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#14532d' }}>
                Aceite único registrado em {consentRecord ? new Date(consentRecord.acceptedAt).toLocaleString('pt-BR') : 'Uso ativo'}. Modo estritamente supervisionado.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleExportAuditCSV}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #16a34a', background: '#fff', color: '#16a34a', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-file-spreadsheet" /> Exportar CSV
              </button>
              <button
                onClick={loadAuditData}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#fff', color: '#15803d', fontSize: 12.5, cursor: 'pointer' }}
                title="Atualizar lista"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Histórico de Ações */}
          <ModuleCard title="Trilha de Auditoria de Ações Agênticas" icon="ti-list-check" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12.5, color: '#7a5c42', margin: '0 0 14px', lineHeight: 1.5 }}>
              Registro formal de todas as injeções e preenchimentos assistidos realizados em portais escolares (Machado Sobrinho, Plurall, Santa Catarina, Cambridge One). Os dados sensíveis são protegidos por criptografia local AES-GCM em repouso.
            </p>

            {loadingLogs ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#8b5e3c' }}>Carregando trilha de auditoria...</div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#665c54', background: '#faf6f0', borderRadius: 10, fontSize: 13 }}>
                🛡️ Nenhuma ação registrada ainda. Quando a Rafinha ou você disparar um preenchimento em portal, ele será auditado aqui.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {auditLogs.map(log => (
                  <div
                    key={log.id}
                    style={{
                      background: '#faf6f0',
                      border: '1px solid #d5c8bb',
                      borderRadius: 10,
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                      <div>
                        <span style={{ fontWeight: 800, color: '#2c1a0e', fontSize: 13.5 }}>
                          {log.platformName || log.platform}
                        </span>
                        <span style={{ color: '#8b5e3c', fontWeight: 600, fontSize: 13 }}> · {log.actionType}</span>
                        <span style={{ fontSize: 12, color: '#665c54', marginLeft: 8 }}>Turma: <strong>{log.classRef}</strong></span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: log.status === 'injected_visual' || log.status === 'confirmed' ? '#dcfce7' : '#fee2e2',
                          color: log.status === 'injected_visual' || log.status === 'confirmed' ? '#15803d' : '#b91c1c'
                        }}>
                          {log.status === 'injected_visual' ? '✓ Injetado (Supervisionado)' : log.status}
                        </span>
                        <span style={{ fontSize: 11, color: '#665c54' }}>{log.dateFormatted}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: 12.5, color: '#2c1a0e' }}>
                      {log.summary}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#665c54' }}>
                        🔒 Criptografia AES-GCM Ativa · Alunos afetados: {log.studentCount}
                      </span>
                      <button
                        onClick={() => handleViewDetail(log)}
                        style={{ background: 'transparent', border: 'none', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        {selectedLogDetail?.id === log.id ? '▲ Ocultar Detalhes' : '▼ Ver Detalhes Seguros'}
                      </button>
                    </div>

                    {selectedLogDetail?.id === log.id && (
                      <div style={{ background: '#fff', border: '1px solid #d5c8bb', borderRadius: 8, padding: '10px 12px', marginTop: 6, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#2c1a0e', maxHeight: 180, overflowY: 'auto' }}>
                        {selectedLogDetail.decrypted}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ModuleCard>

          {/* Trilha de Auditoria de Chamadas de IA (Domesticação) */}
          <ModuleCard title="Trilha de Auditoria IA (Chamadas Críticas)" icon="ti-brain" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12.5, color: '#7a5c42', margin: '0 0 14px', lineHeight: 1.5 }}>
              Registro de todas as chamadas de IA classificadas como críticas (OmniGrader, BatchGrader, AutoReport, MeetingClassRecorder). Armazena metadados, temperatura utilizada, validações determinísticas e respostas brutas resumidas para inspeção pós-fato sem expor dados integrais do aluno.
            </p>

            {aiAuditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#665c54', background: '#faf6f0', borderRadius: 10, fontSize: 13 }}>
                🤖 Nenhuma chamada crítica de IA auditada ainda nesta sessão. Conforme você corrigir redações ou gerar pareceres, os registros aparecerão aqui.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {aiAuditLogs.map(log => (
                  <div
                    key={log.id}
                    style={{
                      background: '#faf6f0',
                      border: log.flagged ? '1px solid #f59e0b' : '1px solid #d5c8bb',
                      borderRadius: 10,
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, color: '#2c1a0e', fontSize: 13.5 }}>
                          {log.module}
                        </span>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 6,
                          background: '#e0e7ff',
                          color: '#3730a3'
                        }}>
                          Temp: {log.temperatureUsed}
                        </span>
                        {log.flagged && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fcd34d'
                          }}>
                            ⚠️ Revisão / Flag
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: 11, color: '#665c54' }}>
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div style={{ fontSize: 12.5, color: '#2c1a0e' }}>
                      <strong>Contexto:</strong> {log.promptSummary}
                    </div>

                    {log.flagReason && (
                      <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: 6 }}>
                        <strong>Motivo do Flag:</strong> {log.flagReason}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#665c54' }}>
                        Resultado: <code style={{ background: '#e8ded4', padding: '1px 5px', borderRadius: 4 }}>{log.parsedResult}</code>
                      </span>
                      <button
                        onClick={() => setSelectedAiLogDetail(selectedAiLogDetail === log.id ? null : log.id)}
                        style={{ background: 'transparent', border: 'none', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        {selectedAiLogDetail === log.id ? '▲ Ocultar Resposta' : '▼ Ver Resposta Bruta'}
                      </button>
                    </div>

                    {selectedAiLogDetail === log.id && (
                      <div style={{ background: '#fff', border: '1px solid #d5c8bb', borderRadius: 8, padding: '10px 12px', marginTop: 6, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#2c1a0e', maxHeight: 180, overflowY: 'auto' }}>
                        {log.rawResponseSummary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ModuleCard>

          {/* Retenção de Dados & Expurgo (Decisão D3: B) */}
          <ModuleCard title="Política de Retenção & Expurgo de Logs" icon="ti-trash" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12.5, color: '#7a5c42', margin: '0 0 12px', lineHeight: 1.5 }}>
              <strong>Política Ativa:</strong> Retenção permanente local e no Supabase pessoal (BYOK) até exclusão manual pelo professor. Você pode limpar a trilha a qualquer momento.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handlePurgeAudit}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #dc2626', background: '#fee2e2', color: '#dc2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-trash" /> Limpar Auditoria de Portais
              </button>
              <button
                onClick={handlePurgeAiAudit}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #b45309', background: '#fef3c7', color: '#92400e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-trash" /> Limpar Auditoria IA
              </button>
            </div>
          </ModuleCard>
        </div>
      )}


      {/* -- ABA 3: PRIVACIDADE, LGPD & BACKUP -- */}
      {activeTab === 'privacy' && (
        <>
          <ModuleCard title="Backup & Transferência de Dados (.JSON)" icon="ti-database" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 16px' }}>
              Baixe um arquivo de backup completo com todas as suas escolas, turmas, alunos, notas, questões, provas e logs de auditoria.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={exportBackup} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#2c1a0e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-download" /> Exportar Backup Completo (.JSON)
              </button>
              <button onClick={importBackup} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #8b5e3c', background: '#f0e8d8', color: '#2c1a0e', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-upload" /> Restaurar Backup (.JSON)
              </button>
            </div>
          </ModuleCard>

          <ModuleCard title="Privacidade & Direitos do Titular (LGPD)" icon="ti-shield-lock" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 14px', lineHeight: 1.5 }}>
              Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem controle total sobre a portabilidade e eliminação dos seus dados pessoais e de seus alunos.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={exportBackup} style={{ padding: '9px 16px', borderRadius: 9, borderWidth: '1px', borderStyle: 'solid', borderColor: '#2b6cb0', background: '#ebf8ff', color: '#2b6cb0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-file-export" /> Portabilidade LGPD (Exportar JSON)
              </button>
              <button onClick={eraseAllDataLGPD} style={{ padding: '9px 16px', borderRadius: 9, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e53e3e', background: '#fff5f5', color: '#e53e3e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-trash" /> Excluir Todos os Dados (Esquecimento LGPD)
              </button>
            </div>
          </ModuleCard>

          <ModuleCard title="Sincronização Cloud (Opcional)" icon="ti-cloud-upload" style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 12px' }}>
              Configuração de endpoint para sincronizar os dados entre múltiplos dispositivos via Supabase/Webhook.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={cfg.cloudSyncUrl || ''}
                onChange={e => setCfg({ ...cfg, cloudSyncUrl: e.target.value })}
                placeholder="https://seu-servidor.com/api/sync"
                style={{ flex: 1, minWidth: 240, border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13, background: '#fdf8f2', color: '#2c1a0e', outline: 'none' }}
              />
              <button onClick={triggerCloudSync} disabled={syncing} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {syncing ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Sincronizando...</> : <><i className="ti ti-cloud-upload" /> Sincronizar Agora</>}
              </button>
            </div>
            {syncStatus && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: '#2c1a0e' }}>{syncStatus}</div>}
          </ModuleCard>
        </>
      )}
    </ModuleShell>
  )
}