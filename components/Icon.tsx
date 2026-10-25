'use client'

/**
 * Icon — wrapper único para ícones no Teacher AI
 *
 * Usa Lucide React (lucide.dev) — visual mais refined que Tabler.
 * strokeWidth padrão: 1.5 (mais elegant que o default 2).
 *
 * REGRA: todo ícone de UI passa por aqui. Nunca emoji, nunca unicode cru.
 * Aceita nomes legados com prefixo "ti-" (mapeados automaticamente).
 */

import React from 'react'
import type { LucideIcon } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { ICON_SIZE } from '@/styles/tokens'

export type IconSizeToken = keyof typeof ICON_SIZE

export interface IconProps {
  /** Nome do ícone Lucide (ex: 'home') ou nome Tabler legado (ex: 'ti-home-2'). */
  name: string
  /** Token de tamanho (xs 14 / sm 16 / md 20 / lg 24) ou px exato. Default: 'sm'. */
  size?: IconSizeToken | number
  /** strokeWidth. Default: 1.5 (mais refined). */
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
  color?: string
}

// ── Mapeamento: nomes Tabler/semânticos → nome exato do componente Lucide ─────
const NAME_OVERRIDES: Record<string, string> = {
  'home-2': 'Home', 'user-circle': 'UserCircle2', 'user-circle-2': 'UserCircle2',
  'user-dollar': 'UserCog', 'building-community': 'Building2', 'building': 'Building2',
  'bulb': 'Lightbulb', 'list-check': 'ListChecks', 'books': 'LibraryBig',
  'certificate': 'Award', 'chalkboard': 'Presentation', 'layers-linked': 'Layers',
  'hierarchy-2': 'Network', 'hierarchy': 'Network', 'subtask': 'GitBranch',
  'file-certificate': 'FileText', 'file-report': 'FileBarChart2', 'file-pencil': 'FilePen',
  'device-gamepad-2': 'Gamepad2', 'device-analytics': 'BarChart3',
  'layout-dashboard': 'LayoutDashboard', 'layout-grid': 'Grid2X2',
  'chart-bar': 'BarChart3', 'chart-line': 'LineChart',
  'brand-whatsapp': 'MessageCircle', 'file-bar-chart': 'FileBarChart2',
  'plug-connected': 'Plug2', 'plug': 'Plug2',
  'sparkles': 'Sparkles', 'notebook': 'Notebook', 'book': 'BookOpen',
  'archive': 'Archive', 'palette': 'Palette', 'microphone': 'Mic',
  'heart': 'Heart', 'calendar': 'Calendar',
  'check-square': 'CheckSquare', 'sort-ascending': 'SortAsc', 'sort-descending': 'SortDesc',
  'dots': 'MoreHorizontal', 'dots-vertical': 'MoreVertical', 'loader': 'Loader2',
  'refresh': 'RefreshCw', 'external-link': 'ExternalLink', 'link-2': 'Link2',
  'alert-triangle': 'AlertTriangle', 'circle-check': 'CircleCheck', 'circle-x': 'CircleX',
  'help-circle': 'HelpCircle', 'menu-2': 'AlignJustify', 'chevron-up': 'ChevronUp',
  'arrow-left': 'ArrowLeft', 'arrow-up': 'ArrowUp', 'arrow-down': 'ArrowDown',
  'eye-off': 'EyeOff', 'zoom-in': 'ZoomIn', 'zoom-out': 'ZoomOut',
  'maximize-2': 'Maximize2', 'minimize-2': 'Minimize2', 'rotate-cw': 'RotateCw',
  'toggle-left': 'ToggleLeft', 'toggle-right': 'ToggleRight',
  'trash': 'Trash2', 'trash-2': 'Trash2', 'share': 'Share2',
  'trending-up': 'TrendingUp', 'trending-down': 'TrendingDown',
  'pie-chart': 'PieChart', 'bar-chart': 'BarChart3', 'area-chart': 'AreaChart',
  'line-chart': 'LineChart', 'git-branch': 'GitBranch', 'folder-open': 'FolderOpen',
  'log-in': 'LogIn', 'log-out': 'LogOut', 'map-pin': 'MapPin',
  'graduation-cap': 'GraduationCap', 'book-open': 'BookOpen', 'bookmark': 'Bookmark',
  'code-2': 'Code2', 'panel-left': 'PanelLeft', 'panel-right': 'PanelRight',
  'sidebar': 'PanelLeft', 'wand-2': 'Wand2', 'pen-tool': 'PenTool',
  'paint-bucket': 'PaintBucket', 'eraser': 'Eraser', 'highlighter': 'Highlighter',
  // Teacher IA — aliases semânticos
  'repo': 'LibraryBig', 'bncc': 'Award', 'maestro': 'GitBranch',
  'wellbeing': 'Heart', 'mindmap': 'Network', 'reflectivepractice': 'Lightbulb',
  'qbank': 'Archive', 'visualstudio': 'Palette', 'eventos': 'Sparkles',
  'rubric': 'ListChecks', 'editor': 'FilePen', 'flashcardmode': 'SquareStack',
  'livequiz': 'Gamepad2', 'classroommode': 'LayoutDashboard',
  'attendancelist': 'ListChecks', 'omnigrader': 'Camera', 'gradebook': 'BarChart3',
  'portfolio': 'Award', 'communications': 'MessageCircle', 'autoreport': 'FileBarChart2',
  'skills': 'Sparkles', 'api': 'Brain', 'extensions': 'Plug2',
  'lessonstudio': 'Presentation', 'didacticsequence': 'Layers',
  'privatetutoring': 'UserCog', 'classes': 'School', 'organization': 'Building2',
  'students': 'Users2', 'checklist': 'ListChecks', 'insights': 'TrendingUp',
  'classroomanalytics': 'BarChart3', 'meetingclassrecorder': 'Notebook',
  'classlog': 'BookOpen', 'test_and_worksheets': 'FileText',
  'audiopronunciation': 'Mic',
}

/** kebab-case → PascalCase: 'arrow-right' → 'ArrowRight' */
function toPascalCase(str: string): string {
  return str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

function resolveIcon(name: string): LucideIcon {
  const clean = name.startsWith('ti-') ? name.slice(3) : name
  const overrideName = NAME_OVERRIDES[clean] || NAME_OVERRIDES[clean.toLowerCase()]
  if (overrideName) {
    const comp = (LucideIcons as Record<string, unknown>)[overrideName]
    if (comp) return comp as LucideIcon
  }
  const pascal = toPascalCase(clean)
  const comp = (LucideIcons as Record<string, unknown>)[pascal]
  if (comp) return comp as LucideIcon
  return LucideIcons.HelpCircle
}

export default function Icon({
  name,
  size = 'sm',
  strokeWidth = 1.5,
  className,
  style,
  color,
}: IconProps) {
  const px = typeof size === 'number' ? size : ICON_SIZE[size]
  const Component = resolveIcon(name)
  return (
    <Component
      size={px}
      strokeWidth={strokeWidth}
      color={color || 'currentColor'}
      className={className}
      aria-hidden
      style={{ flexShrink: 0, display: 'inline-flex', ...style }}
    />
  )
}
