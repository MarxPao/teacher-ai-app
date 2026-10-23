'use client'

import { useState, useRef, useEffect } from 'react'
import { useTheme, ThemeMode, FontScale } from '@/lib/useTheme'
import { COLOR, FONT, TEXT, SPACE, RADIUS, TRANSITION, BORDER } from '@/styles/tokens'
import AskRafinhaBar from '@/components/AskRafinhaBar'
import TeacherLogo from '@/components/TeacherLogo'
import { ModuleKey } from '@/app/page'

import { useGlobalVoice } from '@/lib/useGlobalVoice'
import { getAllSubjectProfiles, getSubjectProfile } from '@/lib/subjectProfile'
import { saveTeacherStyleProfile } from '@/lib/teacherStyleProfile'
import { toast } from '@/components/Toast'
import '@/lib/subjects'

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
  const { isListening, startListening, stopListening, isSupported: isVoiceSupported } = useGlobalVoice('pt-BR')
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

  // Gestão de Disciplina Ativa (Multi-Disciplinas)
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false)
  const [currentSubjectId, setCurrentSubjectId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('teacher_settings')
        if (raw) {
          const s = JSON.parse(raw)
          if (s.defaultSubject) return s.defaultSubject
        }
      } catch {}
    }
    return 'english'
  })
  const subjectMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncSubject = () => {
      try {
        const raw = localStorage.getItem('teacher_settings')
        if (raw) {
          const s = JSON.parse(raw)
          if (s.defaultSubject && s.defaultSubject !== currentSubjectId) {
            setCurrentSubjectId(s.defaultSubject)
          }
        }
      } catch {}
    }
    window.addEventListener('teacher:data_changed', syncSubject)
    window.addEventListener('teacher:subject_changed', syncSubject)
    return () => {
      window.removeEventListener('teacher:data_changed', syncSubject)
      window.removeEventListener('teacher:subject_changed', syncSubject)
    }
  }, [currentSubjectId])

  useEffect(() => {
    if (!subjectMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (subjectMenuRef.current && !subjectMenuRef.current.contains(e.target as Node)) {
        setSubjectMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [subjectMenuOpen])

  useEffect(() => {
    if (!subjectMenuOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSubjectMenuOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [subjectMenuOpen])

  const getSubjectMeta = (id: string) => {
    switch (id) {
      case 'portuguese': return { icon: 'ti-book', color: '#c4834a', bg: '#fffaf5' }
      case 'math': return { icon: 'ti-math-symbols', color: '#059669', bg: '#ecfdf5' }
      case 'history': return { icon: 'ti-hourglass-empty', color: '#d97706', bg: '#fffbeb' }
      case 'geography': return { icon: 'ti-map-2', color: '#0891b2', bg: '#ecfeff' }
      case 'physics': return { icon: 'ti-bolt', color: '#4f46e5', bg: '#eef2ff' }
      case 'chemistry': return { icon: 'ti-flask', color: '#7c3aed', bg: '#f5f3ff' }
      case 'biology': return { icon: 'ti-dna', color: '#0d9488', bg: '#f0fdfa' }
      case 'science': return { icon: 'ti-atom-2', color: '#16a34a', bg: '#f0fdf4' }
      case 'english':
      default: return { icon: 'ti-world', color: '#8b5e3c', bg: '#fffcf8' }
    }
  }

  const handleSelectSubject = (id: string) => {
    try {
      const raw = localStorage.getItem('teacher_settings')
      const s = raw ? JSON.parse(raw) : {}
      s.defaultSubject = id
      localStorage.setItem('teacher_settings', JSON.stringify(s))
      localStorage.setItem('teacher_active_class_subject', id)
      saveTeacherStyleProfile({ defaultSubject: id })
    } catch {}
    setCurrentSubjectId(id)
    setSubjectMenuOpen(false)
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
    window.dispatchEvent(new CustomEvent('teacher:subject_changed', { detail: id }))
    const prof = getSubjectProfile(id)
    toast.success(`Matéria ativa: ${prof.name}!`)
  }

  const allSubjects = getAllSubjectProfiles()
  const activeProfile = getSubjectProfile(currentSubjectId)
  const activeMeta = getSubjectMeta(activeProfile.id)

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
        <TeacherLogo size={24} variant="badge" rounded={6} />
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
        {/* Seletor de Disciplina Ativa (Multi-Disciplinas) */}
        <div ref={subjectMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setSubjectMenuOpen(prev => !prev)}
            title={`Disciplina ativa: ${activeProfile.name}. Clique para alternar.`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px',
              borderRadius: RADIUS.md,
              border: `1px solid ${activeMeta.color}40`,
              background: activeMeta.bg,
              color: activeMeta.color,
              cursor: 'pointer', fontSize: TEXT.xs, fontWeight: 700,
              fontFamily: FONT.sans, transition: TRANSITION.fast,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}
          >
            <i className={`ti ${activeMeta.icon}`} style={{ fontSize: 13 }} />
            <span className="hidden sm:inline">{activeProfile.nameShort || activeProfile.name}</span>
            <i className="ti ti-chevron-down" style={{ fontSize: 10, opacity: 0.7 }} />
          </button>

          {subjectMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: 250,
                background: '#fff',
                borderRadius: RADIUS.lg,
                boxShadow: '0 10px 28px rgba(44,26,14,0.18)',
                border: '1px solid rgba(88,110,117,0.2)',
                padding: 6,
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              <div style={{ padding: '6px 10px', fontSize: 10.5, fontWeight: 800, color: '#a08060', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: 4 }}>
                Alternar Matéria Ativa
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {allSubjects.map(sub => {
                  const meta = getSubjectMeta(sub.id)
                  const isSel = sub.id === currentSubjectId
                  return (
                    <button
                      key={sub.id}
                      onClick={() => handleSelectSubject(sub.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px',
                        borderRadius: RADIUS.md,
                        background: isSel ? '#f5efe6' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: FONT.sans,
                        fontSize: 12.5,
                        fontWeight: isSel ? 700 : 500,
                        color: isSel ? '#2c1a0e' : '#4b382a',
                        transition: 'background 0.12s ease'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`ti ${meta.icon}`} style={{ color: meta.color, fontSize: 14 }} />
                        <span>{sub.name}</span>
                      </span>
                      {isSel && (
                        <i className="ti ti-check" style={{ color: '#8b5e3c', fontSize: 14 }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        {/* Botão Rafinha IA */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('teacher:open_rafinha'))}
          title="Abrir assistente Rafinha IA"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            borderRadius: RADIUS.md,
            border: '1px solid rgba(30, 53, 55, 0.25)',
            background: '#fbf7f0',
            color: '#1e3537',
            cursor: 'pointer', fontSize: TEXT.xs, fontWeight: 700,
            fontFamily: FONT.sans, transition: TRANSITION.fast,
            boxShadow: '0 2px 6px rgba(30, 53, 55, 0.06)'
          }}
        >
          <TeacherLogo size={18} variant="badge" rounded={4} />
          <span className="hidden sm:inline">Rafinha IA</span>
        </button>

        {/* Botão Ditado por Voz */}
        {isVoiceSupported && (
          <button
            onClick={isListening ? stopListening : startListening}
            title={isListening ? 'Parar gravação de voz' : 'Iniciar ditado por voz'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px',
              borderRadius: RADIUS.md,
              border: isListening ? '1px solid #dc2626' : `1px solid ${BORDER.soft}`,
              background: isListening ? 'rgba(220,38,38,0.1)' : 'transparent',
              color: isListening ? '#dc2626' : COLOR.paperWarm,
              cursor: 'pointer', fontSize: TEXT.xs, fontWeight: 600,
              fontFamily: FONT.sans, transition: TRANSITION.fast,
            }}
          >
            <i className={`ti ${isListening ? 'ti-microphone-filled text-red-600 animate-pulse' : 'ti-microphone'}`} style={{ fontSize: 15 }} />
            <span className="hidden md:inline">{isListening ? 'Ouvindo...' : 'Voz'}</span>
          </button>
        )}

        {/* Botão Busca Rápida (Ctrl+K) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('teacher:toggle_command_palette'))}
          title="Busca Rápida e Ações (Ctrl+K)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: RADIUS.md,
            border: `1px solid ${BORDER.soft}`,
            background: 'transparent',
            color: COLOR.paperWarm, cursor: 'pointer', transition: TRANSITION.fast,
          }}
        >
          <i className="ti ti-search" style={{ fontSize: 16 }} />
        </button>

        {/* Botão Bloco de Notas Rápido */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('teacher:toggle_scratchpad'))}
          title="Bloco de Notas Rápido"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: RADIUS.md,
            border: `1px solid ${BORDER.soft}`,
            background: 'transparent',
            color: COLOR.paperWarm, cursor: 'pointer', transition: TRANSITION.fast,
          }}
        >
          <i className="ti ti-notebook" style={{ fontSize: 16 }} />
        </button>

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
