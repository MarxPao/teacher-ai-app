'use client'

import React, { useState } from 'react'
import { FONT, RADIUS } from '@/styles/tokens'

interface DiffViewerProps {
  original: string
  corrected: string
  title?: string
}

interface DiffToken {
  type: 'added' | 'removed' | 'neutral'
  text: string
}

function computeWordDiff(orig: string, corr: string): DiffToken[] {
  const origWords = orig.split(/(\s+)/)
  const corrWords = corr.split(/(\s+)/)

  const diff: DiffToken[] = []
  let i = 0
  let j = 0

  while (i < origWords.length || j < corrWords.length) {
    if (i < origWords.length && j < corrWords.length) {
      if (origWords[i] === corrWords[j]) {
        diff.push({ type: 'neutral', text: origWords[i] })
        i++
        j++
      } else {
        diff.push({ type: 'removed', text: origWords[i] })
        diff.push({ type: 'added', text: corrWords[j] })
        i++
        j++
      }
    } else if (i < origWords.length) {
      diff.push({ type: 'removed', text: origWords[i] })
      i++
    } else if (j < corrWords.length) {
      diff.push({ type: 'added', text: corrWords[j] })
      j++
    }
  }

  return diff
}

/**
 * Visualizador de Diff para Redações e Textos Corrigidos (#25).
 */
export default function DiffViewer({
  original,
  corrected,
  title = 'Comparação de Alterações (Original vs. Corrigido)',
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('inline')
  const diffTokens = computeWordDiff(original, corrected)

  return (
    <div
      style={{
        background: '#fffcf8',
        border: '1px solid rgba(139,115,85,0.16)',
        borderRadius: RADIUS.lg,
        padding: 20,
        boxShadow: '0 2px 8px rgba(44,26,14,0.05)',
      }}
    >
      {/* Header com Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(139,115,85,0.12)',
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-git-compare" style={{ fontSize: 18, color: '#8b5e3c' }} />
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2c1a0e' }}>
            {title}
          </h4>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Legenda */}
          <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 600 }}>
            <span style={{ color: '#a83232', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: 'rgba(168,50,50,0.3)', borderRadius: 2 }} />
              Removido / Incorreto
            </span>
            <span style={{ color: '#3d7a4e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: 'rgba(61,122,78,0.3)', borderRadius: 2 }} />
              Sugerido / Adicionado
            </span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              background: '#f4ede4',
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            <button
              onClick={() => setViewMode('inline')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: viewMode === 'inline' ? '#fff' : 'transparent',
                color: viewMode === 'inline' ? '#2c1a0e' : '#7a5c42',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Inline
            </button>
            <button
              onClick={() => setViewMode('split')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: viewMode === 'split' ? '#fff' : 'transparent',
                color: viewMode === 'split' ? '#2c1a0e' : '#7a5c42',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Lado a Lado
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo Diff */}
      {viewMode === 'inline' ? (
        <div
          style={{
            padding: 16,
            background: '#faf7f2',
            borderRadius: 8,
            border: '1px solid rgba(139,115,85,0.1)',
            lineHeight: 1.8,
            fontSize: 14,
            fontFamily: FONT.serif,
            color: '#2c1a0e',
            whiteSpace: 'pre-wrap',
          }}
        >
          {diffTokens.map((token, idx) => {
            if (token.type === 'added') {
              return (
                <span
                  key={idx}
                  style={{
                    background: 'rgba(61,122,78,0.18)',
                    color: '#2b5a38',
                    padding: '1px 3px',
                    borderRadius: 3,
                    fontWeight: 600,
                  }}
                >
                  {token.text}
                </span>
              )
            }
            if (token.type === 'removed') {
              return (
                <span
                  key={idx}
                  style={{
                    background: 'rgba(168,50,50,0.15)',
                    color: '#8a2424',
                    textDecoration: 'line-through',
                    padding: '1px 3px',
                    borderRadius: 3,
                    opacity: 0.8,
                  }}
                >
                  {token.text}
                </span>
              )
            }
            return <span key={idx}>{token.text}</span>
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', marginBottom: 6 }}>
              Texto Original:
            </div>
            <div
              style={{
                padding: 14,
                background: '#fff9f9',
                border: '1px solid rgba(168,50,50,0.15)',
                borderRadius: 8,
                fontSize: 13.5,
                lineHeight: 1.6,
                fontFamily: FONT.serif,
                whiteSpace: 'pre-wrap',
                color: '#4a2020',
              }}
            >
              {original}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3d7a4e', marginBottom: 6 }}>
              Texto Aperfeiçoado:
            </div>
            <div
              style={{
                padding: 14,
                background: '#f6fbf7',
                border: '1px solid rgba(61,122,78,0.18)',
                borderRadius: 8,
                fontSize: 13.5,
                lineHeight: 1.6,
                fontFamily: FONT.serif,
                whiteSpace: 'pre-wrap',
                color: '#1e4828',
              }}
            >
              {corrected}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
