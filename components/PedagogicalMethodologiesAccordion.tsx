'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'

import React, { useState } from 'react'
import { PEDAGOGICAL_METHODOLOGIES, MethodologyDefinition, MethodologyCategory } from '@/lib/pedagogicalMethodologies'
import CollapsibleAccordion from '@/components/CollapsibleAccordion'

interface PedagogicalMethodologiesAccordionProps {
  selectedIds: string[]
  onChange: (newSelectedIds: string[]) => void
  // Bloom sliders opcionais
  bloomRemember?: number
  setBloomRemember?: (v: number) => void
  bloomApply?: number
  setBloomApply?: (v: number) => void
  bloomAnalyze?: number
  setBloomAnalyze?: (v: number) => void
  bloomEvaluate?: number
  setBloomEvaluate?: (v: number) => void
}

export default function PedagogicalMethodologiesAccordion({
  selectedIds,
  onChange,
  bloomRemember = 25,
  setBloomRemember,
  bloomApply = 30,
  setBloomApply,
  bloomAnalyze = 25,
  setBloomAnalyze,
  bloomEvaluate = 20,
  setBloomEvaluate,
}: PedagogicalMethodologiesAccordionProps) {
  const [methodologySubFilter, setMethodologySubFilter] = useState<'all' | 'elt' | 'scientific'>('all')

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  // Agrupa metodologias por categoria
  const eltMethodologies = PEDAGOGICAL_METHODOLOGIES.filter(m => m.category === 'Metodologias do Inglês (ELT)')
  const scientificMethodologies = PEDAGOGICAL_METHODOLOGIES.filter(m => m.category === 'Metodologias Científicas & Cognitivas')
  const approaches = PEDAGOGICAL_METHODOLOGIES.filter(m => m.category === 'Abordagens Pedagógicas')
  const frameworks = PEDAGOGICAL_METHODOLOGIES.filter(m => m.category === 'Marcos & Certificações')
  const taxonomies = PEDAGOGICAL_METHODOLOGIES.filter(m => m.category === 'Taxonomia Cognitiva')

  // Contadores de selecionados por categoria
  const countSelected = (items: MethodologyDefinition[]) => {
    return items.filter(i => selectedIds.includes(i.id)).length
  }

  const renderChipList = (items: MethodologyDefinition[]) => {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
        {items.map(m => {
          const isSelected = selectedIds.includes(m.id)

          return (
            <div
              key={m.id}
              onClick={() => toggleItem(m.id)}
              style={{
                background: isSelected ? '#fdf8f2' : '#fafafa',
                border: isSelected ? '1.5px solid #8b5e3c' : '1px solid #e8e0d0',
                borderRadius: RADIUS.md,
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                transition: 'all 0.15s ease'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}} // Gerenciado pelo onClick da div
                style={{ marginTop: 3, accentColor: '#8b5e3c', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: TEXT.bodyCompact, fontWeight: isSelected ? 800 : 600, color: isSelected ? '#8b5e3c' : '#2c1a0e' }}>
                  {m.name}
                </div>
                <div style={{ fontSize: 11, color: '#665c54', marginTop: 2, lineHeight: 1.3 }}>
                  {m.description}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const selectedMethodologiesCount = countSelected([...eltMethodologies, ...scientificMethodologies])
  const selectedApproachesCount = countSelected(approaches)
  const selectedFrameworksCount = countSelected(frameworks)
  const selectedTaxonomiesCount = countSelected(taxonomies)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 1. METODOLOGIAS (CIENTÍFICAS & DO INGLÊS / ELT) */}
      <CollapsibleAccordion
        title="Metodologias (Científicas & do Inglês / ELT)"
        subtitle="CLT, TBLT, Inquiry-Based, Recuperação Ativa, PBL, Sala Invertida"
        icon="🎓"
        badgeText={selectedMethodologiesCount > 0 ? `${selectedMethodologiesCount} selecionada(s)` : undefined}
        badgeColor="#268bd2"
        defaultOpen={false}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, borderBottom: '1px solid #ede8dc', paddingBottom: 8 }}>
          <button
            type="button"
            onClick={() => setMethodologySubFilter('all')}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              border: methodologySubFilter === 'all' ? '1px solid #8b5e3c' : '1px solid #d5c8bb',
              background: methodologySubFilter === 'all' ? '#8b5e3c' : '#fff',
              color: methodologySubFilter === 'all' ? '#fff' : '#2c1a0e',
              fontSize: TEXT.caption,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Todas ({eltMethodologies.length + scientificMethodologies.length})
          </button>
          <button
            type="button"
            onClick={() => setMethodologySubFilter('elt')}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              border: methodologySubFilter === 'elt' ? '1px solid #268bd2' : '1px solid #d5c8bb',
              background: methodologySubFilter === 'elt' ? '#268bd2' : '#fff',
              color: methodologySubFilter === 'elt' ? '#fff' : '#2c1a0e',
              fontSize: TEXT.caption,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            🇬🇧 Metodologias do Inglês / ELT ({eltMethodologies.length})
          </button>
          <button
            type="button"
            onClick={() => setMethodologySubFilter('scientific')}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              border: methodologySubFilter === 'scientific' ? '1px solid #2aa198' : '1px solid #d5c8bb',
              background: methodologySubFilter === 'scientific' ? '#2aa198' : '#fff',
              color: methodologySubFilter === 'scientific' ? '#fff' : '#2c1a0e',
              fontSize: TEXT.caption,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            🔬 Metodologias Científicas & Cognitivas ({scientificMethodologies.length})
          </button>
        </div>

        {methodologySubFilter === 'all' && renderChipList([...eltMethodologies, ...scientificMethodologies])}
        {methodologySubFilter === 'elt' && renderChipList(eltMethodologies)}
        {methodologySubFilter === 'scientific' && renderChipList(scientificMethodologies)}
      </CollapsibleAccordion>

      {/* 2. ABORDAGENS PEDAGÓGICAS & DIFERENCIAÇÃO */}
      <CollapsibleAccordion
        title="Abordagens Pedagógicas & Diferenciação"
        subtitle="Sociointeracionismo, Andaimes (Scaffolding), Gamificação, Design Thinking"
        icon="🎯"
        badgeText={selectedApproachesCount > 0 ? `${selectedApproachesCount} selecionada(s)` : undefined}
        badgeColor="#cb4b16"
        defaultOpen={false}
      >
        {renderChipList(approaches)}
      </CollapsibleAccordion>

      {/* 3. MARCOS CURRICULARES & CERTIFICAÇÕES */}
      <CollapsibleAccordion
        title="Marcos Curriculares & Certificações"
        subtitle="BNCC, Cambridge CEFR, ENEM / Vestibulares TRI, IB English, US Common Core, IGCSE"
        icon="🏆"
        badgeText={selectedFrameworksCount > 0 ? `${selectedFrameworksCount} selecionado(s)` : undefined}
        badgeColor="#859900"
        defaultOpen={false}
      >
        {renderChipList(frameworks)}
      </CollapsibleAccordion>

      {/* 4. TAXONOMIA COGNITIVA & NÍVEIS BLOOM */}
      <CollapsibleAccordion
        title="Taxonomia Cognitiva & Níveis de Dificuldade"
        subtitle="Taxonomia de Bloom Revisada, DOK de Webb e Distribuição Cognitiva"
        icon="🧠"
        badgeText={selectedTaxonomiesCount > 0 ? `${selectedTaxonomiesCount} selecionada(s)` : undefined}
        badgeColor="#d33682"
        defaultOpen={false}
      >
        <div style={{ marginBottom: 14 }}>
          {renderChipList(taxonomies)}
        </div>

        {/* Sliders de Distribuição Cognitiva de Bloom */}
        {setBloomRemember && setBloomApply && setBloomAnalyze && setBloomEvaluate && (
          <div style={{ background: '#faf6f0', padding: 12, borderRadius: RADIUS.md, border: '1px solid #ede8dc', marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', marginBottom: 8 }}>
              📊 Distribuição de Esforço Cognitivo (Bloom):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#7a5c42', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Lembrar/Entender:</span>
                  <strong>{bloomRemember}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bloomRemember}
                  onChange={e => setBloomRemember(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#8b5e3c' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#7a5c42', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Aplicar:</span>
                  <strong>{bloomApply}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bloomApply}
                  onChange={e => setBloomApply(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#8b5e3c' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#7a5c42', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Analisar:</span>
                  <strong>{bloomAnalyze}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bloomAnalyze}
                  onChange={e => setBloomAnalyze(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#8b5e3c' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#7a5c42', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Avaliar/Criar:</span>
                  <strong>{bloomEvaluate}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bloomEvaluate}
                  onChange={e => setBloomEvaluate(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#8b5e3c' }}
                />
              </div>
            </div>
          </div>
        )}
      </CollapsibleAccordion>
    </div>
  )
}
