'use client'

import { useState, useRef, useEffect } from 'react'
import { useTheme, ThemeMode, FontScale } from '@/lib/useTheme'
import { COLOR, FONT, TEXT, SPACE, RADIUS, TRANSITION, BORDER } from '@/styles/tokens'
import AskRafinhaBar from '@/components/AskRafinhaBar'
import TeacherLogo from '@/components/TeacherLogo'
import { ModuleKey } from '@/app/page'

interface TopbarProps {
  module: string
  submodule?: string
  isAiLoading?: boolean
  onNavigate?: (module: ModuleKey) => void
}

const FONT_SCALES: { value: FontScale; label: string }[] = [
  { value: 85,  label: '85%' },
  { value: 100, label: '100%' },
  { value: 115, label: '115%' },
  { value: 130, label: '130%' },
]

const THEME_MODES: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'default',       label: 'Padrão',         icon: 'ti-sun' },
  { value: 'high-contrast', label: 'Alto Contraste',  icon: 'ti-contrast' },
  { value: 'colorblind',    label: 'Daltônico',       icon: 'ti-eye' },
]

export default function Topbar({ module, submodule, isAiLoading = false, onNavigate }: TopbarProps) {
  const { theme, toggleFocusMode, setMode, setFontScale } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [focusHover, setFocusHover] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSettingsOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settingsOpen])

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 80,
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: SPACE[4],
        paddingRight: SPACE[4],
        background: 'rgba(255,252,248,0.92)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        borderBottom: `1px solid ${BORDER.soft}`,
        fontFamily: FONT.sans,
        gap: SPACE[3],
      }}
    >
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <TeacherLogo size={20} color={COLOR.accent} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: TEXT.sm + 1, fontWeight: 700, color: COLOR.paperSepia, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {module}
        </span>
        {submodule && (
          <>
            <i className="ti ti-chevron-right" style={{ fontSize: 12, color: COLOR.paperLight, flexShrink: 0 }} />
            <span style={{ fontSize: TEXT.sm + 1, fontWeight: 500, color: COLOR.paperWarm, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {submodule}
            </span>
          </>
        )}
      </nav>

      {/* Barra Global de Linguagem Natural Ask Rafinha (#12) */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <AskRafinhaBar onNavigate={onNavigate || (() => {})} />
      </div>

      {isAiLoading && (
        <div aria-live="polite" aria-label="IA processando" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div className="ai-indicator-dot" />
          <span style={{ fontSize: TEXT.xs, color: COLOR.accentGold, fontWeight: 600, letterSpacing: '0.3px' }}>
            IA processando…
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexShrink: 0 }}>
        <button
          onClick={toggleFocusMode}
          onMouseEnter={() => setFocusHover(true)}
          onMouseLeave={() => setFocusHover(false)}
          title={theme.focusMode ? 'Sair do Modo Foco' : 'Entrar no Modo Foco'}
          aria-pressed={theme.focusMode}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px',
            borderRadius: RADIUS.md,
            border: theme.focusMode ? `1px solid ${COLOR.accent}` : `1px solid ${BORDER.soft}`,
            background: theme.focusMode ? 'rgba(139,94,60,0.10)' : focusHover ? 'rgba(139,94,60,0.06)' : 'transparent',
            color: theme.focusMode ? COLOR.accent : COLOR.paperWarm,
            cursor: 'pointer', fontSize: TEXT.xs, fontWeight: 600,
            fontFamily: FONT.sans, transition: TRANSITION.fast,
          }}
        >
          <i className="ti ti-focus-2" style={{ fontSize: 15 }} />
        </button>

        <div ref={settingsRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            title="Configurações de acessibilidade"
            aria-expanded={settingsOpen}
            aria-haspopup="true"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: RADIUS.md,
              border: settingsOpen ? `1px solid ${BORDER.medium}` : `1px solid ${BORDER.soft}`,
              background: settingsOpen ? 'rgba(139,94,60,0.08)' : 'transparent',
              color: COLOR.paperWarm, cursor: 'pointer', transition: TRANSITION.fast,
            }}
          >
            <i className="ti ti-settings-2" style={{ fontSize: 16 }} />
          </button>

          {settingsOpen && (
            <div
              className="animate-slide-down"
              role="menu"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 220,
                background: COLOR.paperWhite, border: `1px solid ${BORDER.medium}`,
                borderRadius: RADIUS.lg,
                boxShadow: '0 8px 24px rgba(44,26,14,0.12), 0 2px 6px rgba(44,26,14,0.06)',
                padding: `${SPACE[2]}px`, zIndex: 100,
              }}
            >
              <div style={{ padding: `${SPACE[1]}px ${SPACE[2]}px`, marginBottom: 4 }}>
                <span style={{ display: 'block', fontSize: TEXT.xs, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: COLOR.paperLight, marginBottom: SPACE[1] }}>
                  Escala de Fonte
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {FONT_SCALES.map(({ value, label }) => (
                    <button
                      key={value}
                      role="menuitemradio"
                      aria-checked={theme.fontScale === value}
                      onClick={() => { setFontScale(value); setSettingsOpen(false) }}
                      style={{
                        flex: 1, padding: '5px 4px', borderRadius: RADIUS.sm,
                        border: theme.fontScale === value ? `1px solid ${COLOR.accent}` : `1px solid ${BORDER.soft}`,
                        background: theme.fontScale === value ? 'rgba(139,94,60,0.12)' : COLOR.surface2,
                        color: theme.fontScale === value ? COLOR.accent : COLOR.paperWarm,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        fontFamily: FONT.sans, transition: TRANSITION.fast,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: 1, background: BORDER.soft, margin: `${SPACE[1]}px ${SPACE[2]}px` }} />

              <div style={{ padding: `${SPACE[1]}px ${SPACE[2]}px` }}>
                <span style={{ display: 'block', fontSize: TEXT.xs, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: COLOR.paperLight, marginBottom: SPACE[1] }}>
                  Modo de Tema
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {THEME_MODES.map(({ value, label, icon }) => (
                    <button
                      key={value}
                      role="menuitemradio"
                      aria-checked={theme.mode === value}
                      onClick={() => { setMode(value); setSettingsOpen(false) }}
                      onMouseEnter={e => { if (theme.mode !== value) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,94,60,0.05)' }}
                      onMouseLeave={e => { if (theme.mode !== value) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '7px 10px', borderRadius: RADIUS.sm, border: 'none',
                        background: theme.mode === value ? 'rgba(139,94,60,0.10)' : 'transparent',
                        color: theme.mode === value ? COLOR.accent : COLOR.paperWarm,
                        fontSize: TEXT.sm + 1, fontWeight: theme.mode === value ? 700 : 500,
                        cursor: 'pointer', fontFamily: FONT.sans, textAlign: 'left',
                        transition: TRANSITION.fast,
                      }}
                    >
                      <i className={`ti ${icon}`} style={{ fontSize: 14, width: 16, flexShrink: 0 }} />
                      {label}
                      {theme.mode === value && (
                        <i className="ti ti-check" style={{ marginLeft: 'auto', fontSize: 13 }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
