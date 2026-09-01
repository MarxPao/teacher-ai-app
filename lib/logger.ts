/**
 * logger.ts — Structured logging that only emits in development.
 * Replace all direct console.log/warn/error calls with these functions
 * to prevent sensitive data (student grades, personal info) from appearing
 * in production server/browser logs (LGPD compliance).
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.log('StudentMemory', 'Loaded', data)
 *   logger.error('OCR', 'Failed to parse', err)
 */

const isDev = process.env.NODE_ENV !== 'production'

type LogLevel = 'log' | 'warn' | 'error' | 'info'

function emit(level: LogLevel, tag: string, ...args: unknown[]) {
  if (!isDev) return
  const prefix = `[${tag}]`
  // eslint-disable-next-line no-console
  console[level](prefix, ...args)
}

export const logger = {
  /** Informational log — only in development */
  log:  (tag: string, ...args: unknown[]) => emit('log',   tag, ...args),
  /** Warning — only in development */
  warn: (tag: string, ...args: unknown[]) => emit('warn',  tag, ...args),
  /** Error — only in development. Use toast.error() to show user-facing errors */
  error:(tag: string, ...args: unknown[]) => emit('error', tag, ...args),
  /** Info — only in development */
  info: (tag: string, ...args: unknown[]) => emit('info',  tag, ...args),
}
