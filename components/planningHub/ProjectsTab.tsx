'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, RADIUS, SHADOW } from '@/styles/tokens'
import {
  getAllProjects,
  saveProject,
  deleteProject,
  ProjectRecord,
  createDefaultProject
} from '@/lib/projectManagement'
import EditableDocumentModal from '@/components/editableDocument/EditableDocumentModal'
import { PROJETO_SCHEMA } from '@/lib/editableDocumentTypes'
import { exportDocumentToWord, exportDocumentToPdf } from '@/lib/documentExportService'
import { toast, showConfirm } from '@/components/Toast'

export default function ProjectsTab() {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  const loadData = () => {
    setProjects(getAllProjects())
  }

  useEffect(() => {
    loadData()
    const handleProjChanged = () => loadData()
    window.addEventListener('teacher:project_changed', handleProjChanged)
    return () => window.removeEventListener('teacher:project_changed', handleProjChanged)
  }, [])

  const filteredProjects = useMemo(() => {
    return projects.filter(p =>
      p.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.drivingQuestion.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.subjects.some(s => s.toLowerCase().includes(searchFilter.toLowerCase()))
    )
  }, [projects, searchFilter])

  // Estatísticas
  const totalProjects = projects.length
  const activeProjects = projects.filter(p => p.status === 'em_andamento').length
  const completedProjects = projects.filter(p => p.status === 'concluido').length

  const handleCreateNew = () => {
    const newProj = createDefaultProject()
    saveProject(newProj)
    setEditingProjectId(newProj.id)
    loadData()
  }

  const handleDelete = async (id: string, title: string) => {
    const confirmed = await showConfirm(`Tem certeza que deseja excluir o projeto "${title}"?`)
    if (confirmed) {
      deleteProject(id)
      toast.success('Projeto excluído com sucesso.')
      loadData()
    }
  }

  const activeProject = editingProjectId ? projects.find(p => p.id === editingProjectId) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── CARDS DE ESTATÍSTICAS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm }}>Projetos Ativos</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5e3c', marginTop: 4 }}>{activeProjects}</div>
          <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 2 }}>De um total de {totalProjects} projetos cadastrados</div>
        </div>

        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm }}>Projetos Concluídos</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#166534', marginTop: 4 }}>{completedProjects}</div>
          <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 2 }}>Com entregas e avaliações finalizadas</div>
        </div>

        <div style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: SHADOW.flat, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleCreateNew}
            style={{
              padding: '10px 18px',
              background: 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
              color: '#fff',
              border: 'none',
              borderRadius: RADIUS.md,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(139, 94, 60, 0.3)'
            }}
          >
            <i className="ti ti-plus" /> + Novo Projeto
          </button>
        </div>
      </div>

      {/* ─── FILTRO DE BUSCA ─── */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          placeholder="Buscar projeto por título, pergunta norteadora ou disciplina..."
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: RADIUS.md,
            border: '1px solid #dcd7cb',
            background: '#fff',
            fontSize: 13
          }}
        />
      </div>

      {/* ─── LISTA DE PROJETOS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {filteredProjects.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', background: '#fff', border: '1px solid #ede8dc', borderRadius: RADIUS.lg, color: COLOR.paperMid }}>
            Nenhum projeto encontrado. Clique em "+ Novo Projeto" para estruturar um projeto interdisciplinar.
          </div>
        ) : (
          filteredProjects.map(proj => {
            const completedMilestones = proj.milestones?.filter(m => m.status === 'concluido').length || 0
            const totalMilestones = proj.milestones?.length || 0
            const milestonePct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0

            return (
              <div
                key={proj.id}
                style={{
                  background: '#fff',
                  borderRadius: RADIUS.lg,
                  border: '1px solid #ede8dc',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  boxShadow: SHADOW.flat,
                  transition: 'all 0.2s'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#8b5e3c', letterSpacing: 0.5 }}>
                        PROJETO &bull; {proj.durationWeeks || 6} SEMANAS
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: COLOR.paperInk, marginTop: 2 }}>
                        {proj.title}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background:
                          proj.status === 'concluido'
                            ? '#dcfce7'
                            : proj.status === 'atrasado'
                            ? '#fee2e2'
                            : '#fef3c7',
                        color:
                          proj.status === 'concluido'
                            ? '#166534'
                            : proj.status === 'atrasado'
                            ? '#991b1b'
                            : '#b45309'
                      }}
                    >
                      {proj.status.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: COLOR.paperWarm, marginTop: 8 }}>
                    <strong>Pergunta Norteadora:</strong> {proj.drivingQuestion}
                  </div>

                  {/* Barra de Progresso dos Marcos */}
                  <div style={{ marginTop: 12, background: '#faf7f2', padding: 10, borderRadius: RADIUS.md, border: '1px solid #ede8dc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      <span>Progresso dos Marcos (Milestones):</span>
                      <span style={{ color: '#8b5e3c' }}>{milestonePct}% ({completedMilestones}/{totalMilestones})</span>
                    </div>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${milestonePct}%`, height: '100%', background: '#8b5e3c', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 6 }}>
                      Disciplinas: {Array.isArray(proj.subjects) ? proj.subjects.join(', ') : proj.subjects} &bull; Turmas: {Array.isArray(proj.classes) ? proj.classes.join(', ') : proj.classes}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setEditingProjectId(proj.id)}
                    style={{
                      flex: 1,
                      minWidth: 100,
                      padding: '8px 12px',
                      background: '#8b5e3c',
                      color: '#fff',
                      border: 'none',
                      borderRadius: RADIUS.md,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <i className="ti ti-edit" /> Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => exportDocumentToWord({ type: 'projeto', title: proj.title, schoolName: proj.schoolName || 'Colégio Machado Sobrinho', data: proj })}
                    style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Exportar DOCX"
                  >
                    <i className="ti ti-file-text" />
                  </button>

                  <button
                    type="button"
                    onClick={() => exportDocumentToPdf({ type: 'projeto', title: proj.title, schoolName: proj.schoolName || 'Colégio Machado Sobrinho', data: proj })}
                    style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Imprimir / PDF"
                  >
                    <i className="ti ti-printer" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(proj.id, proj.title)}
                    style={{ padding: '8px 10px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: RADIUS.md, fontSize: 12, cursor: 'pointer' }}
                    title="Excluir Projeto"
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ─── MODAL DE EDIÇÃO UNIFICADO ─── */}
      {editingProjectId && activeProject && (
        <EditableDocumentModal
          isOpen={true}
          documentType="projeto"
          schema={PROJETO_SCHEMA}
          initialData={activeProject}
          onSave={data => {
            saveProject({ ...activeProject, ...data })
            setEditingProjectId(null)
            loadData()
          }}
          onClose={() => setEditingProjectId(null)}
        />
      )}
    </div>
  )
}
