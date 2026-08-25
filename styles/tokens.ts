/**
 * Design Tokens — Teacher AI
 * Fonte única de verdade para todas as constantes visuais do app.
 * Use esses tokens em inline styles para consistência.
 */

// ─── Cores: Paleta Warm Leather ────────────────────────────────────────────
export const COLOR = {
  // Paper
  paperDeep:   '#1c110a',
  paperInk:    '#2c1a0e',
  paperSepia:  '#5c3d20',
  paperWarm:   '#7a5c42',
  paperMid:    '#a08060',
  paperLight:  '#c4a882',
  paperCream:  '#f5efe6',
  paperPage:   '#fdf8f2',
  paperWhite:  '#fffcf8',

  // Accent
  accent:      '#8b5e3c',
  accentLight: '#b5805a',
  accentGold:  '#c4834a',
  accentGlow:  'rgba(139,94,60,0.10)',

  // Status
  success:     '#3d7a4e',
  successBg:   'rgba(61,122,78,0.10)',
  warning:     '#c87a1e',
  warningBg:   'rgba(200,122,30,0.10)',
  danger:      '#a83232',
  dangerBg:    'rgba(168,50,50,0.10)',
  info:        '#2a6080',
  infoBg:      'rgba(42,96,128,0.10)',

  // Surfaces
  surface1: '#fffcf8',
  surface2: '#f7f0e8',
  surface3: '#ede4d6',

  // Sidebar
  sidebarBg:   '#2e1a0c',
  sidebarDeep: '#231408',
} as const

// ─── Temas por Disciplina ──────────────────────────────────────────────────
export const SUBJECT_THEMES: Record<string, { accent: string; accentBg: string; label: string }> = {
  english:    { accent: '#2a6080', accentBg: 'rgba(42,96,128,0.10)',   label: 'Inglês' },
  portuguese: { accent: '#7a3a2a', accentBg: 'rgba(122,58,42,0.10)',   label: 'Português' },
  math:       { accent: '#2d6e4e', accentBg: 'rgba(45,110,78,0.10)',   label: 'Matemática' },
  science:    { accent: '#4a7a2a', accentBg: 'rgba(74,122,42,0.10)',   label: 'Ciências' },
  history:    { accent: '#7a5c2a', accentBg: 'rgba(122,92,42,0.10)',   label: 'História' },
  geography:  { accent: '#2a6a5a', accentBg: 'rgba(42,106,90,0.10)',   label: 'Geografia' },
  arts:       { accent: '#6a2a7a', accentBg: 'rgba(106,42,122,0.10)',  label: 'Artes' },
  pe:         { accent: '#7a3a2a', accentBg: 'rgba(180,60,60,0.10)',   label: 'Ed. Física' },
  default:    { accent: '#8b5e3c', accentBg: 'rgba(139,94,60,0.10)',   label: 'Geral' },
}

// ─── Tipografia ─────────────────────────────────────────────────────────────
export const FONT = {
  sans:    "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif:   "'Newsreader', Georgia, serif",
  display: "'Fraunces', Georgia, serif",
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
} as const

export const TEXT = {
  xs:   11,
  sm:   12,
  base: 14,
  md:   15,
  lg:   17,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const

// ─── Espaçamento ────────────────────────────────────────────────────────────
export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const

// ─── Border Radius ──────────────────────────────────────────────────────────
export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
} as const

// ─── Sombras ────────────────────────────────────────────────────────────────
export const SHADOW = {
  flat: '0 1px 2px rgba(44,26,14,0.04)',
  sm:   '0 1px 3px rgba(44,26,14,0.06), 0 4px 10px rgba(44,26,14,0.05)',
  md:   '0 4px 12px rgba(44,26,14,0.08), 0 16px 28px -8px rgba(44,26,14,0.10)',
  lg:   '0 8px 24px rgba(44,26,14,0.10), 0 24px 48px -12px rgba(44,26,14,0.13)',
} as const

// ─── Bordas ─────────────────────────────────────────────────────────────────
export const BORDER = {
  soft:      'rgba(139,115,85,0.12)',
  medium:    'rgba(139,115,85,0.20)',
  strong:    'rgba(139,115,85,0.32)',
  highlight: 'rgba(255,255,255,0.75)',
} as const

// ─── Transições ─────────────────────────────────────────────────────────────
export const TRANSITION = {
  fast:   'all 0.12s ease',
  normal: 'all 0.20s ease',
  slow:   'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
} as const

// ─── Glassmorphism ──────────────────────────────────────────────────────────
export const GLASS = {
  light: {
    background: 'rgba(255,252,248,0.75)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 4px 24px rgba(44,26,14,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
  },
  dark: {
    background: 'rgba(28,17,10,0.72)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  warm: {
    background: 'rgba(253,248,242,0.82)',
    backdropFilter: 'blur(12px) saturate(160%)',
    WebkitBackdropFilter: 'blur(12px) saturate(160%)',
    border: '1px solid rgba(196,131,74,0.20)',
    boxShadow: '0 4px 20px rgba(139,94,60,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
  },
} as const

// ─── Inline Style Helpers ────────────────────────────────────────────────────
export const S = {
  card: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.lg,
    padding: SPACE[6],
    boxShadow: SHADOW.sm,
  } as React.CSSProperties,

  label: {
    display: 'block' as const,
    fontSize: TEXT.xs,
    fontWeight: 700,
    color: COLOR.paperWarm,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    marginBottom: SPACE[1] + 2,
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: `${SPACE[2] + 2}px ${SPACE[3] + 2}px`,
    borderRadius: RADIUS.md,
    border: `1px solid ${BORDER.medium}`,
    background: COLOR.paperPage,
    fontSize: TEXT.base,
    color: COLOR.paperInk,
    outline: 'none',
    fontFamily: FONT.sans,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  btnPrimary: {
    background: `linear-gradient(135deg, ${COLOR.accent} 0%, #6f4728 100%)`,
    color: '#fff',
    padding: `${SPACE[2] + 2}px ${SPACE[5]}px`,
    borderRadius: RADIUS.md,
    border: 'none',
    fontWeight: 700,
    fontSize: TEXT.base,
    cursor: 'pointer',
    display: 'flex' as const,
    alignItems: 'center',
    gap: SPACE[2],
    boxShadow: '0 2px 8px rgba(139,94,60,0.25)',
    transition: TRANSITION.fast,
    fontFamily: FONT.sans,
  } as React.CSSProperties,

  btnSecondary: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.medium}`,
    color: COLOR.paperSepia,
    padding: `${SPACE[2] + 2}px ${SPACE[4] + 2}px`,
    borderRadius: RADIUS.md,
    fontWeight: 700,
    fontSize: TEXT.sm + 1,
    cursor: 'pointer',
    display: 'flex' as const,
    alignItems: 'center',
    gap: SPACE[1] + 2,
    transition: TRANSITION.fast,
    fontFamily: FONT.sans,
  } as React.CSSProperties,
} as const

// Need React for CSSProperties type
import React from 'react'
