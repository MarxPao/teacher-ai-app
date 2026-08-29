'use client'

/**
 * Toast — sistema de notificações inline do Teacher AI
 *
 * Substitui alert() e confirm() nativos do navegador.
 *
 * API:
 *   import { toast } from '@/components/Toast'
 *   toast.success('Prova salva com sucesso!')
 *   toast.error('Erro ao salvar.')
 *   toast.warning('Atenção: campo obrigatório.')
 *   toast.info('Dica: você pode exportar em PDF.')
 *
 * Para confirmação (substitui confirm()):
 *   import { showConfirm } from '@/components/Toast'
 *   const ok = await showConfirm({ title: 'Remover tarefa?', message: 'Esta ação não pode ser desfeita.' })
 *   if (ok) { ... }
 */

import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import type { ReactNode } from 'react'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, TRANSITION, BORDER } from '@/styles/tokens'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<ToastType, { bg: string; border: string; icon: string; iconColor: string }> = {
  success: { bg: COLOR.successBg,  border: 'rgba(61,122,78,0.25)',  icon: 'ti-circle-check',    iconColor: COLOR.success },
  error:   { bg: COLOR.dangerBg,   border: 'rgba(168,50,50,0.25)',  icon: 'ti-circle-x',         iconColor: COLOR.danger },
  warning: { bg: COLOR.warningBg,  border: 'rgba(200,122,30,0.25)', icon: 'ti-alert-triangle',   iconColor: COLOR.warning },
  info:    { bg: COLOR.infoBg,     border: 'rgba(42,96,128,0.25)',  icon: 'ti-info-circle',      iconColor: COLOR.info },
}

// ─── Context + Provider ───────────────────────────────────────────────────────

interface ToastContextValue {
  addToast: (type: ToastType, message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let _addToast: ((type: ToastType, message: string, duration?: number) => void) | null = null

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, message, duration }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  // Expose to imperative API
  useEffect(() => {
    _addToast = addToast
    return () => { _addToast = null }
  }, [addToast])

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast container */}
      <div style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
        maxWidth: 380,
        width: '100%',
      }}>
        {toasts.map(t => {
          const cfg = TOAST_CONFIG[t.type]
          return (
            <div
              key={t.id}
              style={{
                background: COLOR.surface1,
                border: `1px solid ${cfg.border}`,
                borderLeft: `4px solid ${cfg.iconColor}`,
                borderRadius: RADIUS.md,
                padding: '12px 16px',
                boxShadow: SHADOW.md,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                pointerEvents: 'all',
                fontFamily: FONT.sans,
                animation: 'tai-toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <i
                className={`ti ${cfg.icon}`}
                style={{ fontSize: 18, color: cfg.iconColor, flexShrink: 0, marginTop: 1 }}
              />
              <span style={{ fontSize: TEXT.body, color: COLOR.paperInk, flex: 1, lineHeight: 1.45 }}>
                {t.message}
              </span>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: COLOR.paperMid, fontSize: 14, padding: 2, flexShrink: 0,
                  display: 'flex', alignItems: 'center', lineHeight: 1,
                }}
                aria-label="Fechar"
              >
                <i className="ti ti-x" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Global animation */}
      <style>{`
        @keyframes tai-toast-in {
          from { opacity: 0; transform: translateX(20px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ─── API Imperativa (usa-se sem hooks — substitui alert() direto) ─────────────

export const toast = {
  success: (msg: string, duration?: number) => _addToast?.('success', msg, duration),
  error:   (msg: string, duration?: number) => _addToast?.('error',   msg, duration),
  warning: (msg: string, duration?: number) => _addToast?.('warning', msg, duration),
  info:    (msg: string, duration?: number) => _addToast?.('info',    msg, duration),
}

// ─── Modal de Confirmação (substitui confirm()) ───────────────────────────────

interface ConfirmState extends ConfirmOptions {
  resolve: (v: boolean) => void
}

let _showConfirmModal: ((opts: ConfirmOptions) => Promise<boolean>) | null = null

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)

  const showConfirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ ...opts, resolve })
    })
  }, [])

  useEffect(() => {
    _showConfirmModal = showConfirm
    return () => { _showConfirmModal = null }
  }, [showConfirm])

  const handle = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }

  if (!state) return <>{children}</>

  return (
    <>
      {children}

      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(28,17,10,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'tai-overlay-in 0.18s ease',
      }}>
        <div style={{
          background: COLOR.surface1,
          borderRadius: RADIUS.lg,
          padding: '28px 32px',
          maxWidth: 420,
          width: 'calc(100% - 40px)',
          boxShadow: SHADOW.lg,
          border: `1px solid ${BORDER.soft}`,
          fontFamily: FONT.sans,
          animation: 'tai-modal-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {state.title && (
            <h3 style={{
              margin: '0 0 10px',
              fontSize: TEXT.cardTitle,
              fontWeight: 700,
              color: COLOR.paperInk,
              fontFamily: FONT.display,
            }}>
              {state.title}
            </h3>
          )}
          <p style={{
            margin: '0 0 24px',
            fontSize: TEXT.body,
            color: COLOR.paperWarm,
            lineHeight: 1.55,
          }}>
            {state.message}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => handle(false)}
              style={{
                padding: '8px 18px', borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}`,
                background: COLOR.surface1, color: COLOR.paperWarm, fontSize: TEXT.body,
                fontWeight: 600, cursor: 'pointer', fontFamily: FONT.sans,
                transition: TRANSITION.button,
              }}
            >
              {state.cancelLabel ?? 'Cancelar'}
            </button>
            <button
              onClick={() => handle(true)}
              style={{
                padding: '8px 18px', borderRadius: RADIUS.md, border: 'none',
                background: state.danger ? COLOR.danger : COLOR.accent,
                color: '#fff', fontSize: TEXT.body,
                fontWeight: 700, cursor: 'pointer', fontFamily: FONT.sans,
                transition: TRANSITION.button,
              }}
            >
              {state.confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tai-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tai-modal-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </>
  )
}

/**
 * Substituto de confirm() nativo. Uso:
 *   const ok = await showConfirm({ title: 'Remover?', message: 'Não pode ser desfeito.', danger: true })
 */
export async function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (!_showConfirmModal) {
    // Fallback se o ConfirmProvider não estiver montado
    return window.confirm(opts.message)
  }
  return _showConfirmModal(opts)
}

/**
 * Substituto completo de alert(). Uso:
 *   import { showAlert } from '@/components/Toast'
 *   showAlert('Operação concluída!')
 */
export function showAlert(message: string, type: ToastType = 'info') {
  toast[type]?.(message)
}
