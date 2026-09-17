'use client'

import React from 'react'
import { RADIUS, SHADOW, TRANSITION } from '@/styles/tokens'
import { type PortalData } from './PortalDetailsModal'

interface PortalCardProps {
  portal: PortalData
  onOpenDetails: (portal: PortalData) => void
}

export default function PortalCard({ portal, onOpenDetails }: PortalCardProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #e7dfd5',
        borderRadius: RADIUS.lg,
        padding: '20px 24px',
        boxShadow: SHADOW.sm,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 16,
        transition: TRANSITION.fast,
      }}
    >
      <div>
        {/* ── Header do Card (Nome, Ícone, Categoria) ────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.md,
                background: '#faf6f0',
                border: '1px solid #d5c8bb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: portal.color || '#8b5e3c',
                fontSize: 22,
              }}
            >
              <i className="ti ti-school" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                {portal.name}
              </h3>
              <span style={{ fontSize: 12, color: '#8c7e73' }}>
                {portal.domain}
              </span>
            </div>
          </div>

          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 6,
              background: '#faf6f0',
              border: '1px solid #e7dfd5',
              color: '#8b5e3c',
            }}
          >
            {portal.category}
          </span>
        </div>

        {/* ── Status de Mapeamento (Item 2) ─────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: RADIUS.md,
              background: portal.isMapped ? '#f0fdf4' : '#f5f5f4',
              border: `1px solid ${portal.isMapped ? '#bbf7d0' : '#e7e5e4'}`,
              color: portal.isMapped ? '#16a34a' : '#78716c',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <i className={`ti ${portal.isMapped ? 'ti-check' : 'ti-x'}`} />
            {portal.isMapped
              ? `Mapeado (${portal.mappingStrategy || 'layout auto'})`
              : 'Não mapeado'}
          </div>
          {/* NOTA DE HONESTIDADE (Item 0): Status de conexão atual OMITIDO deliberadamente */}
        </div>

        {/* ── Indicadores Honestos de Skills (Item 2) ────────────────────────── */}
        <div
          style={{
            background: '#faf6f0',
            border: '1px solid #e7dfd5',
            borderRadius: RADIUS.md,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: '#665c54', fontWeight: 600 }}>Total de Skills Cadastradas:</span>
            <span style={{ fontWeight: 800, color: '#2c1a0e', background: '#ffffff', padding: '1px 7px', borderRadius: 4, border: '1px solid #d5c8bb' }}>
              {portal.totalSkills}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-shield-check" />
              Comprovadas no DOM:
            </span>
            <span
              style={{
                fontWeight: 800,
                color: '#16a34a',
                background: '#f0fdf4',
                padding: '1px 7px',
                borderRadius: 4,
                border: '1px solid #bbf7d0',
              }}
            >
              {portal.provenSkillsCount}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: portal.unprovenOrBrokenSkillsCount > 0 ? '#b45309' : '#78716c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-alert-circle" />
              Não Comprovadas / Quebradas:
            </span>
            <span
              style={{
                fontWeight: 800,
                color: portal.unprovenOrBrokenSkillsCount > 0 ? '#b45309' : '#78716c',
                background: portal.unprovenOrBrokenSkillsCount > 0 ? '#fffbeb' : '#ffffff',
                padding: '1px 7px',
                borderRadius: 4,
                border: `1px solid ${portal.unprovenOrBrokenSkillsCount > 0 ? '#fde68a' : '#d5c8bb'}`,
              }}
            >
              {portal.unprovenOrBrokenSkillsCount}
            </span>
          </div>
        </div>
      </div>

      {/* ── Ação Principal do Card (Item 2) ─────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #f2ede4', paddingTop: 14 }}>
        <button
          onClick={() => onOpenDetails(portal)}
          style={{
            width: '100%',
            background: '#8b5e3c',
            color: '#ffffff',
            border: 'none',
            borderRadius: RADIUS.md,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: SHADOW.sm,
            transition: TRANSITION.fast,
          }}
        >
          <i className="ti ti-layout-sidebar-right-expand" />
          Ver Detalhes & Histórico
        </button>
      </div>
    </div>
  )
}
