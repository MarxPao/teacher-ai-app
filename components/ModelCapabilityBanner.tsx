'use client'
import React from 'react'

/**
 * ModelCapabilityBanner — Aviso de Capacidade de Modelo BYOK
 *
 * Detecta se o modelo configurado pelo professor e de tier leve (8B/mini/flash-lite)
 * e exibe um banner nao-bloqueante recomendando modelo mais robusto para tarefas
 * de avaliacao oficial (OmniGrader, BatchGrader).
 */

const LIGHT_MODEL_IDENTIFIERS = [
  'llama-3.1-8b', 'llama-3-8b', '8b-instant', 'llama-3.1-8b-instant',
  'glm-4-flash', 'glm-flash',
  'gemma-2-9b', 'gemma-9b', 'gemma-2-9b-it',
  'gpt-4o-mini', '4o-mini',
  'qwen-7b', 'qwen2.5-7b',
  'mistral-7b', 'mistral-small',
]

function isLightModel(modelId?: string, modelName?: string): boolean {
  if (!modelId && !modelName) return false
  const combined = `${(modelId || '')} ${(modelName || '')}`.toLowerCase()
  return LIGHT_MODEL_IDENTIFIERS.some(id => combined.includes(id))
}

function detectActiveModel(): { modelId: string; modelName: string; isLight: boolean } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('teacher_apis')
    if (!raw) return null
    const apis: Array<{ id?: string; name?: string; model?: string; active?: boolean; key?: string }> = JSON.parse(raw)
    const active = apis.find(a => a.active && a.key)
    if (!active) return null
    const modelId = active.model || active.id || ''
    const modelName = active.name || ''
    return { modelId, modelName, isLight: isLightModel(modelId, modelName) }
  } catch {
    return null
  }
}

interface ModelCapabilityBannerProps {
  taskLabel?: string   // Ex: "Correção de Redação" ou "Correção em Lote"
}

export default function ModelCapabilityBanner({ taskLabel = 'Avaliação Oficial' }: ModelCapabilityBannerProps) {
  const [dismissed, setDismissed] = React.useState(false)
  const [modelInfo, setModelInfo] = React.useState<{ modelId: string; modelName: string; isLight: boolean } | null>(null)

  React.useEffect(() => {
    setModelInfo(detectActiveModel())
  }, [])

  if (dismissed || !modelInfo || !modelInfo.isLight) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      background: 'linear-gradient(135deg, #fff8e1, #fffde7)',
      border: '1px solid #ffca28',
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 16,
      fontSize: 13,
      color: '#5c3d00',
    }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>💡</span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: 4, color: '#856404' }}>
          Dica Psicométrica — {taskLabel}
        </strong>
        <span>
          O modelo ativo (<code style={{ background: '#fff3cd', padding: '1px 5px', borderRadius: 4 }}>{modelInfo.modelName || modelInfo.modelId}</code>) é
          um modelo leve/rápido. Para <strong>{taskLabel}</strong> com fins de nota oficial,
          recomendamos modelos de alta capacidade: <strong>Claude 3.5 Sonnet</strong>, <strong>GPT-4o</strong> ou{' '}
          <strong>Gemini 2.0 Flash</strong> — eles produzem avaliações mais consistentes e calibradas.
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#856404', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
        title="Dispensar aviso"
      >
        ✕
      </button>
    </div>
  )
}
