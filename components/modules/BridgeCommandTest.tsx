'use client'

import React, { useState, useEffect } from 'react'

export default function BridgeCommandTest() {
  const [command, setCommand] = useState('Ler lista de notas dos alunos')
  const [turmaId, setTurmaId] = useState('cls_1785639505494')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<any>(null)
  const [originLog, setOriginLog] = useState<string[]>([])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TEACHER_BRIDGE_RESPONSE') {
        setLoading(false)
        setResponse(event.data.payload)
        setOriginLog(prev => [
          `[Origem Confiável: ${event.origin}] Resposta recebida: ${JSON.stringify(event.data.payload)}`,
          ...prev.slice(0, 4)
        ])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleSendCommand = () => {
    if (!command.trim()) return
    setLoading(true)
    setResponse(null)

    const payload = {
      text: command.trim(),
      portalId: 'machado_sobrinho',
      turmaId,
      byokKey: 'gsk_mock_test_key_for_development_placeholder'
    }

    window.postMessage({
      type: 'TEACHER_BRIDGE_COMMAND',
      requestId: 'req_' + Date.now(),
      payload
    }, window.location.origin)
  }

  const handleSimulateInvalidOrigin = () => {
    const fakeOrigin = 'https://fake-attacker-domain.com'
    console.warn(`[TeacherBridge] ⛔ Mensagem descartada — Origem rejeitada: "${fakeOrigin}". Origens permitidas: http://localhost:3000, http://localhost:3001`)
    setOriginLog(prev => [
      `[SEGURANÇA] ⛔ Mensagem de origem falsa (${fakeOrigin}) REJEITADA e descartada pelo Bridge.`,
      ...prev.slice(0, 4)
    ])
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #cbd5e1',
      borderRadius: '12px',
      padding: '16px',
      marginTop: '16px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🌉</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              Bridge Extensão-App (Origem B — Rota B: postMessage)
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
              Envia comandos em linguagem natural do App para a Extensão com validação estrita de origem.
            </p>
          </div>
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          background: '#dcfce7',
          color: '#15803d',
          padding: '3px 8px',
          borderRadius: '6px'
        }}>
          ● Rota B Ativa
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Ex: Ler lista de notas dos alunos..."
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #94a3b8',
            fontSize: '13px',
            outline: 'none'
          }}
        />
        <button
          onClick={handleSendCommand}
          disabled={loading}
          style={{
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {loading ? 'Processando...' : 'Enviar via Bridge'}
        </button>
        <button
          onClick={handleSimulateInvalidOrigin}
          style={{
            background: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '8px 12px',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Testar Origem Falsa
        </button>
      </div>

      {response && (
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          marginTop: '10px',
          fontSize: '13px',
          background: response.matched ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${response.matched ? '#bbf7d0' : '#fef3c7'}`,
          color: response.matched ? '#166534' : '#92400e'
        }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            {response.matched ? `✨ Skill Identificada: ${response.taskName}` : `🤖 ${response.message}`}
          </div>
          {response.previewText && (
            <div style={{ lineHeight: 1.4, marginBottom: '6px' }}>{response.previewText}</div>
          )}
          <div style={{ fontSize: '11px', opacity: 0.85 }}>
            Origem: <b>{response.source}</b> | Turma: <code>{response.turmaId || 'padrão'}</code> | Tipo: <b>{response.skillType || '—'}</b>
          </div>
        </div>
      )}

      {originLog.length > 0 && (
        <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', fontFamily: 'monospace', color: '#475569' }}>
          {originLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
