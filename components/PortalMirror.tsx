'use client'

import { useState, useEffect } from 'react'
import { ALL_PORTALS, getRecentFills, onExtensionMessage, logPortalFill, fillPortal } from '@/lib/portalBridge'

interface FillLog {
  platform: string
  platformName: string
  title: string
  date: string
  classRef: string
  timestamp: number
}

export default function PortalMirror() {
  const [recentFills, setRecentFills] = useState<FillLog[]>([])
  const [extensionDetected, setExtensionDetected] = useState(false)
  const [fillingPortal, setFillingPortal] = useState<string | null>(null)
  const [lastTask, setLastTask] = useState<{
    title: string; date: string; classRef: string; platform: string
  } | null>(null)

  // Detecta extensão e carrega histórico
  useEffect(() => {
    setRecentFills(getRecentFills())

    // Detecta se a extensão está instalada via mensagem de handshake
    const timeout = setTimeout(() => {
      window.postMessage({ action: 'TEACHER_APP_READY' }, '*')
    }, 500)

    // Carrega última tarefa para replay
    try {
      const raw = localStorage.getItem('teacher_last_portal_task')
      if (raw) setLastTask(JSON.parse(raw))
    } catch { /* ignore */ }

    // Ouve confirmações da extensão
    const unsub = onExtensionMessage((msg) => {
      if (msg.action === 'EXTENSION_CONNECTED') {
        setExtensionDetected(true)
      }
      if (msg.action === 'FILL_RESULT') {
        setFillingPortal(null)
        setRecentFills(getRecentFills())
      }
    })

    return () => { clearTimeout(timeout); unsub() }
  }, [])

  function replayLastTask() {
    if (!lastTask) return
    setFillingPortal(lastTask.platform)
    fillPortal({
      platform: lastTask.platform as never,
      title: lastTask.title,
      date: lastTask.date,
      classRef: lastTask.classRef,
    }).then(() => {
      logPortalFill({
        platform: lastTask.platform as never,
        title: lastTask.title,
        date: lastTask.date,
        classRef: lastTask.classRef,
      })
      setRecentFills(getRecentFills())
      setFillingPortal(null)
    })
  }

  const PORTAL_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
    machado:       { bg: '#fef9c3', color: '#b58900', icon: 'ti-chalkboard' },
    santacatarina: { bg: '#fee2e2', color: '#dc322f', icon: 'ti-shield-check' },
    plural:        { bg: '#fff7ed', color: '#cb4b16', icon: 'ti-notebook' },
    cambridge:     { bg: '#f0f9ff', color: '#268bd2', icon: 'ti-book-2' },
    teams:         { bg: '#f5f3ff', color: '#6c71c4', icon: 'ti-brand-teams' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Status da Extensão */}
      <div style={{
        padding: '14px 18px', borderRadius: 14,
        background: extensionDetected ? 'rgba(133,153,0,0.08)' : 'rgba(181,137,0,0.06)',
        border: `1px solid ${extensionDetected ? 'rgba(133,153,0,0.25)' : 'rgba(181,137,0,0.2)'}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: extensionDetected ? '#eef2d5' : '#f5edcc',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <i className={`ti ${extensionDetected ? 'ti-plug-connected' : 'ti-plug'}`}
            style={{ fontSize: 18, color: extensionDetected ? '#859900' : '#b58900' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ${extensionDetected ? 'ti-circle-check text-green-600' : 'ti-alert-circle text-amber-600'}`} />
            <span>{extensionDetected ? 'Extensão Teacher AI ativa' : 'Extensão não detectada'}</span>
          </div>
          <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
            {extensionDetected
              ? 'Preenchimento automático de portais disponível'
              : 'Instale a extensão no Chrome para autopreenchimento dos portais'
            }
          </div>
        </div>
        {!extensionDetected && (
          <a
            href="chrome://extensions"
            target="_blank"
            style={{
              fontSize: 11, fontWeight: 700, color: '#b58900',
              textDecoration: 'none', padding: '6px 12px',
              background: '#f5edcc', borderRadius: 8, whiteSpace: 'nowrap',
            }}
          >
            Instalar →
          </a>
        )}
      </div>

      {/* Portais */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#a08060', marginBottom: 12 }}>
          Portais Escolares
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {ALL_PORTALS.map((portal) => {
            const style = PORTAL_COLORS[portal.id] || { bg: '#f0e8d8', color: '#7a5c42', icon: 'ti-world' }
            const isFilling = fillingPortal === portal.id
            return (
              <div
                key={portal.id}
                style={{
                  background: style.bg, borderRadius: 12,
                  padding: '14px 16px', border: `1px solid ${style.color}22`,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className={`ti ${style.icon}`} style={{ fontSize: 18, color: style.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>{portal.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => window.open(portal.url, '_blank', 'noopener')}
                    style={{
                      flex: 1, padding: '6px 0', border: 'none', borderRadius: 8,
                      background: `${style.color}18`, color: style.color,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <i className="ti ti-external-link" /> Abrir
                  </button>
                  {lastTask?.platform === portal.id && (
                    <button
                      onClick={replayLastTask}
                      disabled={isFilling}
                      style={{
                        flex: 1, padding: '6px 0', border: 'none', borderRadius: 8,
                        background: isFilling ? '#f0e8d8' : style.color, color: isFilling ? '#a08060' : '#fff',
                        fontSize: 11, fontWeight: 600, cursor: isFilling ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isFilling ? <i className="ti ti-loader-2" /> : <i className="ti ti-player-play" />}
                      {isFilling ? ' ...' : ' Relançar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Log de preenchimentos recentes */}
      {recentFills.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#a08060', marginBottom: 12 }}>
            Lançamentos Recentes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentFills.slice(0, 8).map((fill, i) => {
              const style = PORTAL_COLORS[fill.platform] || { color: '#7a5c42', icon: 'ti-world' }
              const ts = new Date(fill.timestamp)
              const timeLabel = ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
                ' ' + ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', background: '#fff', borderRadius: 10,
                    border: '1px solid rgba(88,110,117,0.1)',
                  }}
                >
                  <i className={`ti ${style.icon}`} style={{ color: style.color, fontSize: 16, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2c1a0e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fill.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#a08060' }}>
                      {fill.platformName}{fill.classRef ? ` · ${fill.classRef}` : ''}{fill.date ? ` · ${fill.date.split('-').reverse().join('/')}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: '#a08060', flexShrink: 0 }}>{timeLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
