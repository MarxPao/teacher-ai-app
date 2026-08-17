'use client'

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
  'teacher_portal_consent_v1'
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'general' | 'formatting' | 'audit' | 'privacy'>('general')
  const [cfg, setCfg] = useState<Config>({ school: '', teacher: '', apikey: '', instructions: '', cloudSyncUrl: '' })
  const [docPrefs, setDocPrefs] = useState<DocumentStylePrefs>(getGlobalDocumentPrefs())
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')

  // Trilha de Auditoria
  const [auditLogs, setAuditLogs] = useState<PortalActionLogRecord[]>([])
  const [consentRecord, setConsentRecord] = useState<PortalConsentRecord | null>(null)
  const [selectedLogDetail, setSelectedLogDetail] = useState<{ id: string; decrypted: string } | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadAuditData = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const logs = await getPortalActionLogs()
      setAuditLogs(logs)
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
          alert(' Backup restaurado com sucesso! Recarregando dados...')
          window.location.reload()
        } catch (err) {
          alert(` Falha ao restaurar backup: ${err instanceof Error ? err.message : String(err)}`)
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

  /* Limpar Logs de Auditoria */
  async function handlePurgeAudit() {
    if (confirm('Deseja limpar todo o histórico da Trilha de Auditoria de Ações em Portais?')) {
      await purgePortalActionLogs()
      await loadAuditData()
      setSelectedLogDetail(null)
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
      alert(' Seus dados pessoais e registros foram excluídos com sucesso em conformidade com a LGPD. A aplicação será reiniciada.')
      window.location.reload()
    }
  }

  return (
    <ModuleShell 
      title="Configurações & Auditoria LGPD"
      subtitle="Identidade do professor, trilha de auditoria de agência em portais, retenção de dados e backup seguro."
      maxWidth={860}
    >
      {/* ─── BARRA DE NAVEGAÇÃO DE ABAS ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #d5c8bb', paddingBottom: 10, flexWrap: 'wrap' }}>
        {[
          { key: 'general', label: '⚙️ Geral & Identidade', icon: 'ti-settings' },
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

      {/* ─── ABA 1: GERAL & IDENTIDADE ─────────────────────────────────────── */}
      {activeTab === 'general' && (
        <>
          <ModuleCard title="Idioma do Aplicativo / Language" icon="ti-world" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 12px' }}>
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
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>{f.label}</div>
                  <input
                    value={cfg[f.key] || ''}
                    onChange={e => setCfg({ ...cfg, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  />
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>Instruções Padrão & Cabeçalhos</div>
              <textarea
                value={cfg.instructions || ''}
                onChange={e => setCfg({ ...cfg, instructions: e.target.value })}
                rows={2}
                placeholder="Cabeçalho padrão das provas, orientações metodológicas..."
                style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', resize: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.5 }}
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

      {/* ─── ABA DE FORMATAÇÃO DE DOCUMENTOS (BLOCO E) ────────────────────── */}
      {activeTab === 'formatting' && (
        <>
          <ModuleCard title="Preferências Globais de Documento & Impressão" icon="ti-typography" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 16px', lineHeight: 1.5 }}>
              Defina o padrão visual universal que será aplicado automaticamente a <strong>todos os Planos de Aula, Provas do ExamBuilder e Exercícios</strong> exportados pelo sistema.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#586e75', marginBottom: 6 }}>
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#586e75', marginBottom: 6 }}>
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#586e75', marginBottom: 6 }}>
                  Espaçamento entre Linhas
                </label>
                <select
                  value={docPrefs.lineHeight}
                  onChange={e => setDocPrefs({ ...docPrefs, lineHeight: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fffcf8', fontSize: 13, outline: 'none' }}
                >
                  <option value={1.2}>1.2x (Econômico)</option>
                  <option value={1.45}>1.45x (Equilibrado Padrão)</option>
                  <option value={1.6}>1.6x (Espaçoso / Anotações)</option>
                  <option value={1.85}>1.85x (Acessibilidade)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#586e75', marginBottom: 6 }}>
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

            <div style={{ background: '#fdf8f2', border: '1px dashed #d5c8bb', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Visualização Prévia do Estilo:
              </span>
              <div style={{
                fontFamily: docPrefs.fontFamily,
                fontSize: `${docPrefs.fontSizePt}pt`,
                lineHeight: docPrefs.lineHeight,
                color: '#2c1a0e',
                background: '#fff',
                padding: 12,
                borderRadius: 6,
                border: '1px solid #ede8dc'
              }}>
                <strong>Lesson Plan / Avaliação Demonstrativa:</strong> The students will interact in pairs using Simple Past to describe their weekend experiences. (EF07LI15)
              </div>
            </div>

            <button
              onClick={() => {
                saveGlobalDocumentPrefs(docPrefs)
                setSaved(true)
                setTimeout(() => setSaved(false), 2000)
              }}
              style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <i className="ti ti-device-floppy" /> {saved ? 'Preferências Salvas!' : 'Salvar Preferências Universais'}
            </button>
          </ModuleCard>
        </>
      )}

      {/* ─── ABA 2: AUDITORIA DE AÇÕES (PORTAIS ESCOLARES) ─────────────────── */}
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
                Aceite único registrado em {consentRecord ? new Date(consentRecord.acceptedAt).toLocaleString('pt-BR') : 'Uso ativo'}. Modo estritamente supervisionado (0-Tester).
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
            <p style={{ fontSize: 12.5, color: '#586e75', margin: '0 0 14px', lineHeight: 1.5 }}>
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
                      <div style={{ background: '#fff', border: '1px solid #d5c8bb', borderRadius: 8, padding: '10px 12px', marginTop: 6, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#073642', maxHeight: 180, overflowY: 'auto' }}>
                        {selectedLogDetail.decrypted}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ModuleCard>

          {/* Retenção de Dados & Expurgo (Decisão D3: B) */}
          <ModuleCard title="Política de Retenção & Expurgo de Logs" icon="ti-trash" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12.5, color: '#586e75', margin: '0 0 12px', lineHeight: 1.5 }}>
              <strong>Política Ativa:</strong> Retenção permanente local e no Supabase pessoal (BYOK) até exclusão manual pelo professor. Você pode limpar a trilha a qualquer momento.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handlePurgeAudit}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #dc2626', background: '#fee2e2', color: '#dc2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-trash" /> Limpar Histórico de Auditoria
              </button>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ─── ABA 3: PRIVACIDADE, LGPD & BACKUP ─────────────────────────────── */}
      {activeTab === 'privacy' && (
        <>
          <ModuleCard title="Backup & Transferência de Dados (.JSON)" icon="ti-database" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 16px' }}>
              Baixe um arquivo de backup completo com todas as suas escolas, turmas, alunos, notas, questões, provas e logs de auditoria.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={exportBackup} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#073642', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-download" /> Exportar Backup Completo (.JSON)
              </button>
              <button onClick={importBackup} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #8b5e3c', background: '#eee8d5', color: '#073642', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-upload" /> Restaurar Backup (.JSON)
              </button>
            </div>
          </ModuleCard>

          <ModuleCard title="Privacidade & Direitos do Titular (LGPD)" icon="ti-shield-lock" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 14px', lineHeight: 1.5 }}>
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
            <p style={{ fontSize: 13, color: '#586e75', margin: '0 0 12px' }}>
              Configuração de endpoint para sincronizar os dados entre múltiplos dispositivos via Supabase/Webhook.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={cfg.cloudSyncUrl || ''}
                onChange={e => setCfg({ ...cfg, cloudSyncUrl: e.target.value })}
                placeholder="https://seu-servidor.com/api/sync"
                style={{ flex: 1, minWidth: 240, border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13, background: '#fdf6e3', color: '#2c1a0e', outline: 'none' }}
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