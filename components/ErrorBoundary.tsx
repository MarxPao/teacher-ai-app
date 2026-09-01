'use client'

import React from 'react'
import { COLOR, RADIUS, TEXT } from '@/styles/tokens'

interface Props {
  children: React.ReactNode
  moduleName?: string
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * ErrorBoundary — Catches runtime errors in any child component tree.
 * Prevents a single module crash from taking down the entire Teacher AI app.
 *
 * Usage (module-level):
 *   <ErrorBoundary moduleName="ExamBuilder">
 *     <ExamBuilder />
 *   </ErrorBoundary>
 *
 * Usage (global, in app/page.tsx):
 *   <ErrorBoundary moduleName={active}>
 *     <Module />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Only log in development — prevents student data leaking to production logs
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[ErrorBoundary:${this.props.moduleName || 'unknown'}]`, error, info)
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 24px',
            gap: 16,
            textAlign: 'center',
            height: '100%',
            minHeight: 300,
          }}
        >
          <i
            className="ti ti-alert-triangle"
            style={{ fontSize: 44, color: '#dc322f', opacity: 0.65 }}
            aria-hidden="true"
          />
          <div style={{ fontSize: TEXT.subtitle, fontWeight: 700, color: COLOR.paperInk }}>
            Algo deu errado neste módulo
          </div>
          {this.state.error?.message && (
            <div
              style={{
                fontSize: TEXT.bodyCompact,
                color: COLOR.paperMid,
                maxWidth: 440,
                fontFamily: 'monospace',
                background: 'rgba(220,50,47,0.06)',
                padding: '8px 14px',
                borderRadius: RADIUS.md,
                border: '1px solid rgba(220,50,47,0.15)',
              }}
            >
              {this.state.error.message}
            </div>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: 8,
              padding: '10px 28px',
              borderRadius: RADIUS.md,
              background: COLOR.accent,
              color: '#fff',
              border: 'none',
              fontSize: TEXT.body,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className="ti ti-refresh" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/** Convenience wrapper for module-level boundaries */
export function ModuleErrorBoundary({
  children,
  name,
}: {
  children: React.ReactNode
  name: string
}) {
  return <ErrorBoundary moduleName={name}>{children}</ErrorBoundary>
}
