'use client'

import React from 'react'
import { ModuleKey } from '@/app/page'

const TABS = [
  { key: 'dashboard' as ModuleKey,       icon: 'ti-home-2',          label: 'Início' },
  { key: 'students' as ModuleKey,        icon: 'ti-users',            label: 'Alunos' },
  { key: 'test_and_worksheets' as ModuleKey, icon: 'ti-file-certificate', label: 'Criar' },
  { key: 'omnigrader' as ModuleKey,      icon: 'ti-camera',           label: 'Corrigir' },
  { key: 'communications' as ModuleKey,  icon: 'ti-brand-whatsapp',   label: 'Comunicação' },
]

interface BottomTabBarProps {
  active: ModuleKey
  onNavigate: (key: ModuleKey) => void
}

/**
 * Barra de navegação inferior para telas ≤768px (#42).
 * Visível apenas em mobile via CSS (display:none em desktop).
 */
export default function BottomTabBar({ active, onNavigate }: BottomTabBarProps) {
  return (
    <nav className="bottom-tab-bar">
      {TABS.map(tab => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onNavigate(tab.key)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '8px 4px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isActive ? '#c4834a' : 'rgba(196,160,120,0.55)',
              transition: 'color 0.15s ease',
            }}
          >
            <i
              className={`ti ${tab.icon}`}
              style={{
                fontSize: 22,
                color: isActive ? '#c4834a' : 'rgba(196,160,120,0.55)',
              }}
            />
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 700 : 500,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              lineHeight: 1,
            }}>
              {tab.label}
            </span>
            {isActive && (
              <div style={{
                position: 'absolute',
                top: 0,
                width: 28,
                height: 2,
                background: '#c4834a',
                borderRadius: '0 0 2px 2px',
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
