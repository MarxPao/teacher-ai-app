'use client'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import Button from '@/components/Button'
import { COLOR, RADIUS, SHADOW } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'
import { getValidAccessToken } from '@/lib/supabaseAuth'

export interface PortalSkillRecord {
  id: string
  portal_id: string
  task_id: string
  task_name: string
  skill_type: 'reading' | 'writing'
  description?: string
  turma_id?: string | null
  page_url?: string
  graph?: any
  created_at?: string
  updated_at?: string
}

export default function PortalSkillsModule() {
  const [skills, setSkills] = useState<PortalSkillRecord[]>([])
  const [executionsMap, setExecutionsMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'supabase' | 'local_disk'>('supabase')
  const [selectedPortal, setSelectedPortal] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<'all' | 'reading' | 'writing'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const [skillsRes, logsRes] = await Promise.all([
        fetch('/api/skills'),
        fetch('/api/skills/log-execution?limit=100').catch(() => null),
      ])

      if (!skillsRes.ok) throw new Error(`HTTP ${skillsRes.status}`)
      const data = await skillsRes.json()
      setSkills(data.skills || [])
      if (data.source) setSource(data.source)

      if (logsRes && logsRes.ok) {
        const logsData = await logsRes.json()
        const map: Record<string, any> = {}
        for (const log of (logsData.logs || [])) {
          if (log.skill_id && !map[log.skill_id]) {
            map[log.skill_id] = log
          }
          if (log.task_name && !map[log.task_name]) {
            map[log.task_name] = log
          }
        }
        setExecutionsMap(map)
      }
    } catch (err: any) {
      console.error('Erro ao buscar skills:', err)
      toast.error('Não foi possível carregar as skills dos portais.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  const handleDelete = async (skill: PortalSkillRecord) => {
    const confirmed = await showConfirm({
      message: `Tem certeza que deseja excluir a skill "${skill.task_name}" do portal "${skill.portal_id}"? Essa ação removerá o fluxo do Supabase e do disco.`,
    })
    if (!confirmed) return

    try {
      const token = await getValidAccessToken()
      const res = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 401) {
        toast.error(`⚠️ ${data.error || 'Acesso não autorizado: Faça login com sua conta de professora.'}`)
        return
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      toast.success(`Skill "${skill.task_name}" removida com sucesso.`)
      setSkills(prev => prev.filter(s => s.id !== skill.id))
      if (expandedSkillId === skill.id) setExpandedSkillId(null)
    } catch (err: any) {
      console.error('Erro ao excluir skill:', err)
      toast.error(`Falha ao excluir a skill: ${err.message}`)
    }
  }

  // Filtros
  const filteredSkills = skills.filter(s => {
    if (selectedPortal !== 'all' && s.portal_id !== selectedPortal) return false
    if (selectedType !== 'all' && s.skill_type !== selectedType) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = (s.task_name || '').toLowerCase().includes(q)
      const matchDesc = (s.description || '').toLowerCase().includes(q)
      const matchPortal = (s.portal_id || '').toLowerCase().includes(q)
      if (!matchName && !matchDesc && !matchPortal) return false
    }
    return true
  })

  // Métricas
  const totalCount = skills.length
  const readingCount = skills.filter(s => s.skill_type === 'reading').length
  const writingCount = skills.filter(s => s.skill_type === 'writing').length
  const uniquePortals = Array.from(new Set(skills.map(s => s.portal_id)))

  return (
    <ModuleShell
      title="Skills dos Portais Escolares"
      subtitle="Fluxos e trajetos aprendidos pela IA nos portais, sincronizados com a nuvem (Supabase) e validados com nós CHECKPOINT de segurança."
      maxWidth={1100}
    >
      {/* ── Barra de Métricas ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: RADIUS.lg, padding: '14px 18px', boxShadow: SHADOW.sm }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total de Skills</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{totalCount}</div>
          <div style={{ fontSize: 11, color: source === 'supabase' ? '#16a34a' : '#b45309', fontWeight: 600, marginTop: 4 }}>
            ● Fonte: {source === 'supabase' ? 'Supabase Cloud' : 'Disco Local'}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: RADIUS.lg, padding: '14px 18px', boxShadow: SHADOW.sm }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#0284c7' }}>Leitura Autônoma</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{readingCount}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Boletins, chamadas e notas</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: RADIUS.lg, padding: '14px 18px', boxShadow: SHADOW.sm }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#dc2626' }}>Escrita Segura</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>{writingCount}</div>
          <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 4 }}>🛡️ 100% com CHECKPOINT</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: RADIUS.lg, padding: '14px 18px', boxShadow: SHADOW.sm }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#8b5e3c' }}>Portais Mapeados</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5e3c', marginTop: 4 }}>{uniquePortals.length}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{uniquePortals.join(', ') || 'Nenhum'}</div>
        </div>
      </div>

      {/* ── Controles de Filtro e Busca ──────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: RADIUS.lg, padding: '14px 18px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: SHADOW.sm }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* Busca por texto */}
          <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: 11, color: '#94a3b8' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome da tarefa, portal ou descrição..."
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: RADIUS.md,
                border: '1px solid #cbd5e1',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSkills}
              disabled={loading}
              icon={loading ? 'ti-loader' : 'ti-refresh'}
            >
              {loading ? 'Atualizando...' : 'Recarregar'}
            </Button>
          </div>
        </div>

        {/* Filtros de Portal e Tipo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginRight: 4 }}>PORTAL:</span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'machado_sobrinho', label: 'Machado Sobrinho' },
              { id: 'redesantacatarina', label: 'Rede SC' },
              { id: 'plural', label: 'Plurall' },
              { id: 'cambridge', label: 'Cambridge One' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPortal(p.id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: RADIUS.md,
                  border: selectedPortal === p.id ? '1px solid #8b5e3c' : '1px solid #cbd5e1',
                  background: selectedPortal === p.id ? '#8b5e3c' : '#f8fafc',
                  color: selectedPortal === p.id ? '#fff' : '#475569',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginRight: 4 }}>TIPO:</span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'reading', label: 'Leitura' },
              { id: 'writing', label: 'Escrita' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id as any)}
                style={{
                  padding: '5px 10px',
                  borderRadius: RADIUS.md,
                  border: selectedType === t.id ? '1px solid #0f172a' : '1px solid #cbd5e1',
                  background: selectedType === t.id ? '#0f172a' : '#f8fafc',
                  color: selectedType === t.id ? '#fff' : '#475569',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Lista de Skills ─────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          <i className="ti ti-loader animate-spin" style={{ fontSize: 24, color: '#8b5e3c', display: 'block', marginBottom: 8 }} />
          Carregando skills gravadas do Supabase...
        </div>
      ) : filteredSkills.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: RADIUS.lg, padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="ti ti-sparkles" style={{ fontSize: 36, color: '#cbd5e1', display: 'block', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Nenhuma skill encontrada</div>
          <p style={{ fontSize: 13, marginTop: 6, maxWidth: 460, margin: '6px auto 16px', lineHeight: 1.5 }}>
            {skills.length === 0
              ? 'Abra o painel lateral da extensão Chrome em qualquer portal escolar e grave o primeiro trajeto ou leitura de alunos.'
              : 'Nenhuma skill corresponde aos filtros selecionados acima.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredSkills.map(skill => {
            const isWriting = skill.skill_type === 'writing'
            const isExpanded = expandedSkillId === skill.id
            const nodeCount = skill.graph?.nodes ? Object.keys(skill.graph.nodes).length : 0
            const hasCheckpoint = skill.graph?.nodes && Object.values(skill.graph.nodes).some((n: any) => n.type === 'CHECKPOINT')

            const latestExec = executionsMap[skill.id] || executionsMap[skill.task_id] || executionsMap[skill.task_name]
            let honestBadge = { label: 'Nunca executada', bg: '#f5f5f4', color: '#78716c', border: '#d6d3d1', icon: 'ti-minus' }
            if (latestExec) {
              if (latestExec.status === 'COMPLETED' && latestExec.verified) {
                honestBadge = { label: 'Comprovada', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', icon: 'ti-shield-check' }
              } else {
                honestBadge = { label: 'Falhando', bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: 'ti-alert-triangle' }
              }
            }

            return (
              <div
                key={skill.id}
                style={{
                  background: '#fff',
                  border: isWriting ? '1px solid #fed7aa' : '1px solid #e2e8f0',
                  borderRadius: RADIUS.lg,
                  padding: 16,
                  boxShadow: SHADOW.sm,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                        {skill.task_name}
                      </span>
                      {/* Badge de Honestidade de Execução (Item 4) */}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: RADIUS.full,
                          background: honestBadge.bg,
                          color: honestBadge.color,
                          border: `1px solid ${honestBadge.border}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <i className={`ti ${honestBadge.icon}`} /> {honestBadge.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: RADIUS.full,
                          background: isWriting ? '#fee2e2' : '#e0f2fe',
                          color: isWriting ? '#dc2626' : '#0369a1',
                        }}
                      >
                        {isWriting ? '✍️ Escrita' : '📖 Leitura'}
                      </span>
                      {hasCheckpoint && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: RADIUS.full,
                            background: '#dcfce7',
                            color: '#15803d',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <i className="ti ti-shield-check" /> Checkpoint Ativo
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '2px 8px',
                          borderRadius: RADIUS.sm,
                        }}
                      >
                        Portal: {skill.portal_id}
                      </span>
                    </div>

                    {skill.description && (
                      <p style={{ fontSize: 12, color: '#475569', marginTop: 6, lineHeight: 1.4 }}>
                        {skill.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b', marginTop: 8, flexWrap: 'wrap' }}>
                      <span><b>ID:</b> <code>{skill.id}</code></span>
                      {skill.turma_id && <span><b>Turma ID:</b> <code>{skill.turma_id}</code></span>}
                      <span><b>Nós do Grafo:</b> {nodeCount}</span>
                      {skill.created_at && (
                        <span><b>Criada em:</b> {new Date(skill.created_at).toLocaleDateString('pt-BR')}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                      icon={isExpanded ? 'ti-chevron-up' : 'ti-code'}
                    >
                      {isExpanded ? 'Fechar Grafo' : 'Inspecionar'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(skill)}
                      icon="ti-trash"
                    >
                      Excluir
                    </Button>
                  </div>
                </div>

                {/* ── Painel de Inspeção do Grafo ────────────────────── */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="ti ti-hierarchy-2" /> Estrutura do Grafo Executável (JSON):
                    </div>
                    <pre
                      style={{
                        background: '#0f172a',
                        color: '#f8fafc',
                        padding: 12,
                        borderRadius: RADIUS.md,
                        fontSize: 11,
                        maxHeight: 260,
                        overflowY: 'auto',
                        fontFamily: 'monospace',
                      }}
                    >
                      {JSON.stringify(skill.graph || skill, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </ModuleShell>
  )
}
