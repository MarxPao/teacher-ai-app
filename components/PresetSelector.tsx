'use client'

import React, { useState, useEffect } from 'react'
import { getPresets, savePreset, deletePreset, SavedPreset } from '@/lib/presetManager'

interface Props {
  module: 'exam' | 'quick' | 'lessonstudio'
  currentConfig: Record<string, any>
  onLoadPreset: (config: Record<string, any>) => void
}

export default function PresetSelector({ module, currentConfig, onLoadPreset }: Props) {
  const [presets, setPresets] = useState<SavedPreset[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [presetName, setPresetName] = useState('')

  const reload = () => {
    const list = getPresets(module)
    setPresets(list)
  }

  useEffect(() => {
    reload()
    window.addEventListener('storage', reload)
    return () => window.removeEventListener('storage', reload)
  }, [module])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    if (!id) return
    const found = presets.find(p => p.id === id)
    if (found) {
      onLoadPreset(found.config)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!presetName.trim()) return
    const created = savePreset(module, presetName, currentConfig)
    setShowSaveModal(false)
    setPresetName('')
    reload()
    setSelectedId(created.id)
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Deseja excluir esta configuração salva?')) {
      deletePreset(module, id)
      if (selectedId === id) setSelectedId('')
      reload()
    }
  }

  return (
    <div style={{ background: '#fcfbf9', border: '1px solid #ede8dc', borderRadius: 14, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-bookmark" style={{ color: '#b58900', fontSize: 18 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>Configurações Salvas (Presets):</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240, justifyContent: 'flex-end' }}>
          {/* Dropdown de Presets */}
          <select
            value={selectedId}
            onChange={e => handleSelect(e.target.value)}
            style={{
              flex: 1, maxWidth: 280, padding: '7px 12px', background: '#fff',
              border: '1px solid #e8e0d0', borderRadius: 8, fontSize: 13,
              color: '#073642', outline: 'none', fontWeight: 600, cursor: 'pointer'
            }}
          >
            <option value="">-- Carregar preset salvo... --</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.createdAt})
              </option>
            ))}
          </select>

          {/* Botão de Deletar Preset Selecionado */}
          {selectedId && (
            <button
              onClick={e => handleDelete(selectedId, e)}
              title="Excluir este preset"
              style={{
                padding: '7px 10px', borderRadius: 8, border: '1px solid #dc322f',
                background: '#dc322f12', color: '#dc322f', fontSize: 12, cursor: 'pointer'
              }}
            >
              <i className="ti ti-trash" />
            </button>
          )}

          {/* Botão Salvar Preset Atual */}
          <button
            onClick={() => setShowSaveModal(true)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: '#8b5e3c', color: '#fff', fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(139,94,60,0.2)'
            }}
          >
            <i className="ti ti-device-floppy" />
            Salvar Preset
          </button>
        </div>
      </div>

      {/* Modal de Digitar o Nome do Preset */}
      {showSaveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <form onSubmit={handleSave} style={{
            width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 22,
            boxShadow: '0 10px 30px rgba(0,43,54,0.2)', border: '1px solid #ede8dc'
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#073642', marginTop: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-device-floppy" style={{ color: '#8b5e3c' }} />
              Salvar Nova Configuração
            </h3>
            <p style={{ fontSize: 13, color: '#586e75', marginBottom: 14 }}>
              Dê um nome para este preset de parâmetros para carregar em 1 clique depois.
            </p>

            <input
              type="text"
              autoFocus
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              placeholder="Ex: Prova de Inglês 9º Ano B1 / Simulado ENEM"
              style={{
                width: '100%', padding: '10px 14px', background: '#f5f0e8',
                border: '1px solid #e8e0d0', borderRadius: 8, fontSize: 14,
                color: '#073642', outline: 'none', marginBottom: 16, fontFamily: 'inherit'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                style={{ padding: '8px 16px', background: '#f5f0e8', color: '#586e75', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ padding: '8px 18px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Salvar Preset
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
