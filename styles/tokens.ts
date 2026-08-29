/**
 * Design Tokens — Teacher AI (v2, unified)
 * Fonte única de verdade para todas as constantes visuais do app.
 * REGRA: Todo inline style deve referenciar estes tokens — nunca hardcode.
 */

// ─── Cores: Paleta Warm Leather ────────────────────────────────────────────
export const COLOR = {
  // Paper scale (ink → page)
  paperDeep:   '#1c110a',
  paperInk:    '#2c1a0e',   // texto primário
  paperSepia:  '#5c3d20',
  paperWarm:   '#7a5c42',   // texto secundário / labels
  paperMid:    '#a08060',   // ícones / metadados
  paperLight:  '#c4a882',
  paperCream:  '#f5efe6',
  paperPage:   '#fdf8f2',   // fundo creme quente
  paperAlt:    '#f0e8d8',   // fundo suave
  paperWhite:  '#fffcf8',

  // Accent
  accent:      '#8b5e3c',
  accentLight: '#b5805a',
  accentGold:  '#c4834a',
  accentGlow:  'rgba(139,94,60,0.10)',

  // Status (semantic)
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

// ─── Tipografia (escala modular, sem frações de pixel) ───────────────────
export const FONT = {
  sans:    "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif:   "'Newsreader', Georgia, serif",
  display: "'Fraunces', Georgia, serif",
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
} as const

/**
 * Escala tipográfica aprovada — todos os font-sizes devem ser um destes valores.
 * Sem frações de pixel (ex: 11.5px, 13.5px são proibidos).
 */
export const TEXT = {
  micro:        11,   // rótulos internos de badges/chips
  caption:      12,   // legendas e metadados secundários
  bodyCompact:  13,   // texto compacto (tabelas, sidebars, dropdowns)
  body:         14,   // corpo de texto padrão
  subtitle:     16,   // subtítulos de seção e tabs ativas
  cardTitle:    20,   // títulos de card
  pageTitle:    28,   // títulos de página (h1 em ModuleShell)
  // Aliases para compatibilidade retroativa
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

// ─── Espaçamento (grade de 4px) ─────────────────────────────────────────
/**
 * REGRA: todos os paddings, margins e gaps devem ser múltiplos de 4px.
 * Use os aliases nomeados para clareza semântica.
 */
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

// ─── Border Radius (3 níveis apenas) ─────────────────────────────────────
/**
 * REGRA: Apenas 3 valores permitidos + full.
 * - radiusSm: tags, chips, badges, ícones pequenos
 * - radiusMd: inputs, botões, dropdowns, pequenos cards internos
 * - radiusLg: cards, modais, drawers, painéis
 */
export const RADIUS = {
  sm:   8,      // tags/chips/badges
  md:   10,     // inputs/botões
  lg:   14,     // cards/modais
  xl:   18,     // cards maiores / especiais (usar raramente)
  full: 9999,   // circular
} as const

// ─── Sombras (baseadas em warm leather, sem azul) ──────────────────────
export const SHADOW = {
  flat: '0 1px 2px rgba(44,26,14,0.04)',
  sm:   '0 1px 3px rgba(44,26,14,0.06), 0 4px 10px rgba(44,26,14,0.05)',
  md:   '0 4px 12px rgba(44,26,14,0.08), 0 16px 28px -8px rgba(44,26,14,0.10)',
  lg:   '0 8px 24px rgba(44,26,14,0.10), 0 24px 48px -12px rgba(44,26,14,0.13)',
} as const

// ─── Bordas ─────────────────────────────────────────────────────────────
export const BORDER = {
  soft:      'rgba(139,115,85,0.12)',
  medium:    'rgba(139,115,85,0.20)',
  strong:    'rgba(139,115,85,0.32)',
  highlight: 'rgba(255,255,255,0.75)',
} as const

// ─── Tamanhos de Botão ────────────────────────────────────────────────────
/**
 * REGRA: Todo botão deve usar um destes 3 tamanhos.
 * height é a altura total — não ajuste manualmente padding vertical.
 */
export const BUTTON_SIZE = {
  sm: { height: 32, paddingX: 12, paddingY: 6,  fontSize: TEXT.bodyCompact },
  md: { height: 40, paddingX: 16, paddingY: 10, fontSize: TEXT.body },
  lg: { height: 48, paddingX: 20, paddingY: 14, fontSize: TEXT.subtitle },
} as const

// ─── Tamanhos de Ícone ────────────────────────────────────────────────────
/**
 * REGRA: Ícone SEMPRE dentro de container com display:flex + alignItems:center + gap.
 * NUNCA usar marginRight manual.
 */
export const ICON_SIZE = {
  xs: 14,   // ao lado de caption/micro (12px)
  sm: 16,   // ao lado de body (14px)
  md: 20,   // ao lado de subtitle/cardTitle (16-20px)
  lg: 24,   // standalone ou em headers
} as const

// ─── Transições ─────────────────────────────────────────────────────────
export const TRANSITION = {
  fast:   'all 0.12s ease',
  normal: 'all 0.20s ease',
  slow:   'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
  button: 'all 0.15s ease',  // padrão para botões (hover/active)
} as const

// ─── Glassmorphism ──────────────────────────────────────────────────────
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

// ─── Inline Style Helpers (Blocos pré-construídos reutilizáveis) ──────────
export const S = {
  // Card padrão: 1 nível, sem aninhamento
  card: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.lg,
    padding: SPACE[6],
    boxShadow: SHADOW.sm,
  } as React.CSSProperties,

  // Card compacto
  cardCompact: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE[3]}px ${SPACE[4]}px`,
    boxShadow: SHADOW.flat,
  } as React.CSSProperties,

  // Label de campo
  label: {
    display: 'block' as const,
    fontSize: TEXT.caption,
    fontWeight: 700,
    color: COLOR.paperWarm,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.7px',
    marginBottom: SPACE[1],
  } as React.CSSProperties,

  // Input / Textarea
  input: {
    width: '100%',
    padding: `${SPACE[2]}px ${SPACE[3]}px`,
    borderRadius: RADIUS.md,
    border: `1px solid ${BORDER.medium}`,
    background: COLOR.paperPage,
    fontSize: TEXT.body,
    color: COLOR.paperInk,
    outline: 'none',
    fontFamily: FONT.sans,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  // Select (mesmo que input mas com cursor pointer)
  select: {
    width: '100%',
    padding: `${SPACE[2]}px ${SPACE[3]}px`,
    borderRadius: RADIUS.md,
    border: `1px solid ${BORDER.medium}`,
    background: COLOR.paperPage,
    fontSize: TEXT.body,
    color: COLOR.paperInk,
    outline: 'none',
    fontFamily: FONT.sans,
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
    appearance: 'none' as const,
  } as React.CSSProperties,

  // Botão primário inline (use <Button> quando possível)
  btnPrimary: {
    background: `linear-gradient(135deg, ${COLOR.accent} 0%, #6f4728 100%)`,
    color: '#fff',
    padding: `${BUTTON_SIZE.md.paddingY}px ${BUTTON_SIZE.md.paddingX}px`,
    height: BUTTON_SIZE.md.height,
    borderRadius: RADIUS.md,
    border: 'none',
    fontWeight: 700,
    fontSize: BUTTON_SIZE.md.fontSize,
    cursor: 'pointer',
    display: 'flex' as const,
    alignItems: 'center',
    gap: SPACE[2],
    boxShadow: '0 2px 8px rgba(139,94,60,0.25)',
    transition: TRANSITION.button,
    fontFamily: FONT.sans,
  } as React.CSSProperties,

  // Botão secundário inline
  btnSecondary: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.medium}`,
    color: COLOR.paperSepia,
    padding: `${BUTTON_SIZE.md.paddingY}px ${BUTTON_SIZE.md.paddingX}px`,
    height: BUTTON_SIZE.md.height,
    borderRadius: RADIUS.md,
    fontWeight: 600,
    fontSize: BUTTON_SIZE.md.fontSize,
    cursor: 'pointer',
    display: 'flex' as const,
    alignItems: 'center',
    gap: SPACE[2],
    transition: TRANSITION.button,
    fontFamily: FONT.sans,
  } as React.CSSProperties,

  // Divisor de seção (substitui caixa intermediária)
  divider: {
    borderTop: `1px solid ${BORDER.soft}`,
    margin: `${SPACE[5]}px 0`,
  } as React.CSSProperties,
} as const

// Need React for CSSProperties type
import React from 'react'
