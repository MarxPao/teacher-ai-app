'use client'

import { useEffect, useRef, useState } from 'react'
import { TOOL_DISPLAY_NAMES } from '@/lib/agentTools'

export interface ToolCallItem {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  result?: string
  startedAt: number
}

interface AgentToolFeedbackProps {
  toolCalls: ToolCallItem[]
}

export default function AgentToolFeedback({ toolCalls }: AgentToolFeedbackProps) {
  if (toolCalls.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {toolCalls.map((tc) => {
        const display = TOOL_DISPLAY_NAMES[tc.name] || { label: tc.name, icon: 'ti-bolt', color: '#7a5c42' }
        const isRunning = tc.status === 'running'
        const isDone    = tc.status === 'done'
        const isError   = tc.status === 'error'

        return (
          <ToolCallBubble
            key={tc.id}
            display={display}
            toolCall={tc}
            isRunning={isRunning}
            isDone={isDone}
            isError={isError}
          />
        )
      })}
    </div>
  )
}

function ToolCallBubble({
  display,
  toolCall,
  isRunning,
  isDone,
  isError,
}: {
  display: { label: string; icon: string; color: string }
  toolCall: ToolCallItem
  isRunning: boolean
  isDone: boolean
  isError: boolean
}) {
  const [dots, setDots] = useState('.')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setDots(d => d.length >= 3 ? '.' : d + '.')
      }, 400)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning])

  // Resumo dos inputs para mostrar
  const inputSummary = Object.entries(toolCall.input)
    .slice(0, 3)
    .map(([k, v]) => `${v}`)
    .join(' · ')

  const statusBg    = isError ? 'rgba(220,50,47,0.08)' : isDone ? 'rgba(133,153,0,0.08)' : 'rgba(181,137,0,0.08)'
  const statusBorder = isError ? 'rgba(220,50,47,0.2)' : isDone ? 'rgba(133,153,0,0.2)' : 'rgba(181,137,0,0.25)'
  const iconColor   = isError ? '#dc322f' : isDone ? '#859900' : display.color

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 10,
        background: statusBg, border: `1px solid ${statusBorder}`,
        fontSize: 12, animation: 'toolSlideIn 0.25s ease',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes toolSlideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toolSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />

      {/* Ícone com spinner se rodando */}
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isRunning ? (
          <i className="ti ti-loader-2" style={{ fontSize: 14, color: iconColor, animation: 'toolSpin 1s linear infinite' }} />
        ) : isDone ? (
          <i className="ti ti-check" style={{ fontSize: 14, color: '#859900' }} />
        ) : (
          <i className="ti ti-alert-circle" style={{ fontSize: 14, color: '#dc322f' }} />
        )}
      </div>

      {/* Label + detalhe */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className={`ti ${display.icon}`} style={{ fontSize: 12, color: iconColor }} />
          {display.label}
          {isRunning && <span style={{ color: iconColor, letterSpacing: 2 }}>{dots}</span>}
        </div>
        {inputSummary && (
          <div style={{ color: '#a08060', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inputSummary}
          </div>
        )}
        {toolCall.result && isDone && (
          <div style={{ color: '#859900', marginTop: 1, fontWeight: 500 }}>{toolCall.result}</div>
        )}
        {isError && toolCall.result && (
          <div style={{ color: '#dc322f', marginTop: 1 }}>{toolCall.result}</div>
        )}
      </div>
    </div>
  )
}
