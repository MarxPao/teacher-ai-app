'use client'

import { useState, useEffect } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { fillPortal, logPortalFill } from '@/lib/portalBridge'
import { getPortalProfiles, PortalProfileDef } from '@/lib/portalActionsEngine'
import { recordStudentGrade } from '@/lib/studentMemory'
import AutomationDiffModal from '@/components/modules/AutomationDiffModal'
import { createBrowserTask, BrowserAutomationTask, DiffItem } from '@/lib/browserAutomationClient'
import { sanitizeOutboundPayload } from '@/lib/portalSanitizer'
import { getTeacherCalibrations } from '@/lib/teacherCalibrations'
import ClassHeatmap from '@/components/charts/ClassHeatmap'

interface School { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string }
interface Student { id: string; name: string; classId: string; schoolId: string; grades: Record<string, string> }

export default function Gradebook() {
  const [schools, setSchools] = useState<School[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [cols, setCols] = useState<string[]>([])
  const [portals, setPortals] = useState<PortalProfileDef[]>([])
  
  const [filterSchool, setFilterSchool] = useState<string>('all')
  const [filterClass, setFilterClass] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'heatmap'>('table')

  // Modal de Espelhamento no Portal Escolar
  const [isMirrorModalOpen, setIsMirrorModalOpen] = useState(false)
  const [mirrorPortalId, setMirrorPortalId] = useState<string>(() => getTeacherCalibrations().gradebook.defaultPortalSync || 'machado')
  const [mirrorCol, setMirrorCol] = useState('')
  const [isMirroring, setIsMirroring] = useState(false)
  const [mirrorStatus, setMirrorStatus] = useState<string | null>(null)
  const [activeAutomationTask, setActiveAutomationTask] = useState<BrowserAutomationTask | null>(null)

  useEffect(() => {
    const sSchools = localStorage.getItem('teacher_schools')
    const sClasses = localStorage.getItem('teacher_classes')
    const sStudents = localStorage.getItem('teacher_students')
    const sGbConfig = localStorage.getItem('teacher_gbConfig')

    setSchools(sSchools ? JSON.parse(sSchools) : [])
    setClasses(sClasses ? JSON.parse(sClasses) : [])
    const parsedStudents = sStudents ? JSON.parse(sStudents) : []
    setStudents(parsedStudents.map((s: any) => ({ ...s, grades: s.grades || {} })))
    
    const loadedCols = sGbConfig ? JSON.parse(sGbConfig).cols : ['Teste 1', 'Teste 2', 'Participação']
    setCols(loadedCols)
    if (loadedCols.length > 0) setMirrorCol(loadedCols[0])

    const portalList = getPortalProfiles()
    setPortals(portalList)
    if (portalList.length > 0) setMirrorPortalId(portalList[0].id)
  }, [])

  const sync = (newStudents: Student[]) => {
    setStudents(newStudents)
    localStorage.setItem('teacher_students', JSON.stringify(newStudents))
  }

  const updateStudentField = (sid: string, field: keyof Student, val: string) => {
    const updated = students.map(s => s.id === sid ? { ...s, [field]: val } : s)
    sync(updated)
  }

  const updateGrade = (sid: string, col: string, val: string) => {
    const updated = students.map(s => {
      if (s.id === sid) {
        const numVal = parseFloat(val.replace(',', '.'))
        if (!isNaN(numVal)) {
          const className = classes.find(c => c.id === s.classId)?.name || ''
          recordStudentGrade(s.id, s.name, col, numVal, 10, className)
        }
        return { ...s, grades: { ...s.grades, [col]: val } }
      }
      return s
    })
    sync(updated)
  }

  const renameCol = (idx: number, newName: string) => {
    const oldName = cols[idx]
    if (oldName === newName) return

    const newCols = [...cols]
    newCols[idx] = newName
    setCols(newCols)
    localStorage.setItem('teacher_gbConfig', JSON.stringify({ cols: newCols }))
    
    const updatedStudents = students.map(s => {
      if (s.grades[oldName] !== undefined) {
        const newGrades = { ...s.grades, [newName]: s.grades[oldName] }
        delete newGrades[oldName]
        return { ...s, grades: newGrades }
      }
      return s
    })
    
    setStudents(updatedStudents)
    localStorage.setItem('teacher_students', JSON.stringify(updatedStudents))
  }

  const deleteCol = (idx: number) => {
    const colName = cols[idx]
    if (!confirm(`Deseja excluir a coluna "${colName}"? As notas desta coluna serão removidas.`)) return

    const newCols = cols.filter((_, i) => i !== idx)
    setCols(newCols)
    localStorage.setItem('teacher_gbConfig', JSON.stringify({ cols: newCols }))

    const updatedStudents = students.map(s => {
      const newGrades = { ...s.grades }
      delete newGrades[colName]
      return { ...s, grades: newGrades }
    })
    setStudents(updatedStudents)
    localStorage.setItem('teacher_students', JSON.stringify(updatedStudents))
  }

  const addCol = () => {
    const newCols = [...cols, `Nova Coluna ${cols.length + 1}`]
    setCols(newCols)
    localStorage.setItem('teacher_gbConfig', JSON.stringify({ cols: newCols }))
  }

  const calcAvg = (s: Student) => {
    const vals = cols.map(c => parseFloat(s.grades[c]?.replace(',', '.'))).filter(n => !isNaN(n))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const gradeColor = (n: number | null) => {
    if (n === null) return { text: '#93a1a1', bg: '#eee8d5', label: '' }
    if (n >= 9) return { text: '#16a34a', bg: '#dcfce7', label: n.toFixed(1) }
    if (n >= 7) return { text: '#b58900', bg: '#fef3c7', label: n.toFixed(1) }
    if (n >= 5) return { text: '#ea580c', bg: '#ffedd5', label: n.toFixed(1) }
    return { text: '#dc2626', bg: '#fee2e2', label: n.toFixed(1) }
  }

  const filtered = students.filter(s => {
    const matchSchool = filterSchool === 'all' || s.schoolId === filterSchool || (classes.find(c => c.id === s.classId)?.schoolId === filterSchool)
    const matchClass = filterClass === 'all' || s.classId === filterClass
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchSchool && matchClass && matchSearch
  })

  // Executa o espelhamento direto de notas no portal oficial
  const handleExecuteMirror = async () => {
    setIsMirroring(true)
    setMirrorStatus('Conectando à aba do portal no Google Chrome...')

    const studentGrades = filtered.map(s => {
      let g = 0
      if (mirrorCol === '__avg__') {
        const avg = calcAvg(s)
        g = avg !== null ? Number(avg.toFixed(1)) : 0
      } else {
        const rawG = parseFloat(s.grades[mirrorCol]?.replace(',', '.'))
        g = !isNaN(rawG) ? rawG : 0
      }
      return { name: s.name, grade: g, id: s.id }
    })

    const diff: DiffItem[] = studentGrades.map(s => ({
      studentName: s.name,
      field: mirrorCol === '__avg__' ? 'Média Final' : mirrorCol,
      beforeValue: '',
      afterValue: s.grade,
      approved: true
    }))

    const targetClass = classes.find(c => c.id === filterClass)?.name || 'Geral'

    const rawPayload = {
      platform: mirrorPortalId,
      actionType: 'grades',
      title: `Lançamento de Notas - ${mirrorCol === '__avg__' ? 'Média Final' : mirrorCol}`,
      date: new Date().toISOString().split('T')[0],
      classRef: targetClass,
      description: `Espelhamento de notas da coluna ${mirrorCol} para a turma ${targetClass}`,
      mode: 'supervised',
      studentGrades,
      diff,
      confidence_flag: 'seletor_mapeado' as const,
      evaluationName: mirrorCol === '__avg__' ? 'Média Final' : mirrorCol
    }

    const cleanPayload = sanitizeOutboundPayload(rawPayload)

    // Cria a tarefa de automação
    const createdTask = await createBrowserTask({
      portal: mirrorPortalId,
      actionType: 'write_grades',
      payload: cleanPayload,
      approvalMode: 'batch',
      classRef: targetClass,
      studentCount: studentGrades.length
    })

    setIsMirrorModalOpen(false)

    if (createdTask) {
      setActiveAutomationTask(createdTask)
    } else {
      const localTask: BrowserAutomationTask = {
        id: `task_${Date.now()}`,
        teacher_id: 'local_teacher',
        trace_id: `trace_${Date.now()}`,
        portal: mirrorPortalId,
        action_type: 'write_grades',
        status: 'drafted',
        payload: cleanPayload,
        approval_mode: 'batch',
        class_ref: targetClass,
        student_count: studentGrades.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      setActiveAutomationTask(localTask)
    }

    setIsMirroring(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#fdf6e3' }}>
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        <ModuleShell 
          title="Caderneta de Notas & Espelhamento nos Portais"
          subtitle="Lance notas no app e espelhe instantaneamente nas planilhas e diários oficiais das escolas sem retrabalho"
          maxWidth="100%"
          actions={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input placeholder="🔍 Buscar aluno..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={SearchInS} />
              
              <button 
                onClick={() => setIsMirrorModalOpen(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#16a34a',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(22,163,74,0.3)'
                }}
              >
                ⚡ Espelhar no Portal Oficial
              </button>

              <button onClick={addCol} style={ActionBtn}>+ Nova Coluna</button>
              
              <div style={{ display: 'inline-flex', background: '#f5efe6', borderRadius: 10, padding: 3, gap: 2 }}>
                <button
                  onClick={() => setViewMode('table')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: viewMode === 'table' ? '#8b5e3c' : 'transparent',
                    color: viewMode === 'table' ? '#fff' : '#586e75',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Tabela
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: viewMode === 'cards' ? '#8b5e3c' : 'transparent',
                    color: viewMode === 'cards' ? '#fff' : '#586e75',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('heatmap')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: viewMode === 'heatmap' ? '#8b5e3c' : 'transparent',
                    color: viewMode === 'heatmap' ? '#fff' : '#586e75',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>🔥</span> Heatmap
                </button>
              </div>
            </div>
          }
        >
          {/* Filtros por Escola & Turma */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', background: '#fffcf8', padding: '12px 16px', borderRadius: 16, border: '1px solid rgba(139,115,85,0.15)' }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', marginRight: 8 }}>🏫 Escola:</span>
              <select
                value={filterSchool}
                onChange={e => { setFilterSchool(e.target.value); setFilterClass('all') }}
                style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', background: '#fff', fontSize: 13, color: '#2c1a0e', outline: 'none', fontWeight: 600 }}
              >
                <option value="all">Todas as Escolas</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', marginRight: 8 }}>👥 Turma:</span>
              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', background: '#fff', fontSize: 13, color: '#2c1a0e', outline: 'none', fontWeight: 600 }}
              >
                <option value="all">Todas as Turmas</option>
                {classes.filter(c => filterSchool === 'all' || c.schoolId === filterSchool).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
              Total: {filtered.length} alunos
            </div>
          </div>

          {/* Modo Tabela */}
          {viewMode === 'table' ? (
            <div style={TableContainer}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#faf6f0', borderBottom: '1px solid #ede8dc' }}>
                    <th style={ThS}>Nome do Aluno</th>
                    {cols.map((c, idx) => (
                      <th key={c} style={{...ThS, textAlign: 'center'}}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <input 
                            defaultValue={c} 
                            onBlur={e => renameCol(idx, e.target.value)}
                            style={{ background: 'transparent', border: 'none', fontWeight: 800, color: '#8b5e3c', textAlign: 'center', outline: 'none', width: 90 }}
                          />
                          <button 
                            onClick={() => deleteCol(idx)} 
                            title="Remover coluna"
                            style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11 }}
                          >
                            ×
                          </button>
                        </div>
                      </th>
                    ))}
                    <th style={{...ThS, textAlign: 'right', width: 100}}>Média</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const avg = calcAvg(s); const gc = gradeColor(avg)
                    return (
                      <tr key={s.id} style={TrS}>
                        <td style={{ padding: '8px 16px' }}>
                          <input 
                            value={s.name} 
                            onChange={e => updateStudentField(s.id, 'name', e.target.value)} 
                            style={{ background: 'transparent', border: 'none', fontWeight: 700, color: '#2c1a0e', outline: 'none', width: '100%', padding: '8px' }}
                          />
                        </td>
                        {cols.map(c => (
                          <td key={c} style={{ padding: '8px 4px', textAlign: 'center' }}>
                            <input 
                              value={s.grades[c] || ''} 
                              onChange={e => updateGrade(s.id, c, e.target.value)} 
                              placeholder="-"
                              style={{ 
                                width: 50, textAlign: 'center', border: '1px solid #ede8dc', borderRadius: 8, 
                                padding: '8px 4px', fontWeight: 800, fontSize: 14, 
                                background: gradeColor(parseFloat(s.grades[c]?.replace(',','.'))).bg,
                                color: gradeColor(parseFloat(s.grades[c]?.replace(',','.'))).text,
                                outline: 'none'
                              }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '8px 24px', textAlign: 'right' }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: gc.text }}>{gc.label || '-'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : viewMode === 'cards' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filtered.map(s => {
                const avg = calcAvg(s); const gc = gradeColor(avg)
                return (
                  <ModuleCard key={s.id} padding={20}>
                    <input value={s.name} onChange={e => updateStudentField(s.id, 'name', e.target.value)} style={{ background: 'transparent', border: 'none', fontWeight: 800, color: '#2c1a0e', width: '100%', fontSize: 16, marginBottom: 16, outline: 'none' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {cols.map(c => (
                        <div key={c} style={{ background: '#faf6f0', padding: 8, borderRadius: 12 }}>
                          <div style={{ fontSize: 10, color: '#8b5e3c', fontWeight: 700, marginBottom: 4 }}>{c}</div>
                          <input value={s.grades[c] || ''} onChange={e => updateGrade(s.id, c, e.target.value)} style={{ background: 'transparent', border: 'none', fontWeight: 800, color: '#2c1a0e', width: '100%', outline: 'none' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>MÉDIA FINAL</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: gc.text }}>{gc.label || '-'}</span>
                    </div>
                  </ModuleCard>
                )
              })}
            </div>
          ) : (
            <div style={{ background: '#fffcf8', borderRadius: 16, padding: 10, border: '1px solid rgba(139,115,85,0.14)' }}>
              <ClassHeatmap
                students={filtered.map(s => ({ id: s.id, name: s.name }))}
                assessments={cols.map(c => ({ id: c, title: c }))}
                grades={filtered.reduce((acc, s) => {
                  acc[s.id] = {}
                  cols.forEach(c => {
                    const parsed = parseFloat(s.grades[c]?.replace(',', '.'))
                    if (!isNaN(parsed)) acc[s.id][c] = parsed
                  })
                  return acc
                }, {} as Record<string, Record<string, number>>)}
              />
            </div>
          )}

          {/* Modal de Espelhamento de Notas */}
          {isMirrorModalOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
              <div style={{ background: '#fff', borderRadius: 16, maxWidth: 500, width: '100%', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                <div style={{ padding: '16px 20px', background: '#2c1a0e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                    ⚡ Espelhar Notas no Portal Oficial
                  </h3>
                  <button onClick={() => { setIsMirrorModalOpen(false); setMirrorStatus(null) }} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#665c54', lineHeight: 1.5 }}>
                    Selecione o portal e a coluna que deseja enviar. A extensão preencherá a tabela de notas na aba aberta correspondente no Chrome com <strong>fuzzy matching de nomes</strong>.
                  </p>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>1. Escolha o Portal de Destino:</label>
                    <select
                      value={mirrorPortalId}
                      onChange={e => setMirrorPortalId(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, fontWeight: 700, outline: 'none' }}
                    >
                      {portals.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>2. Escolha a Avaliação / Coluna:</label>
                    <select
                      value={mirrorCol}
                      onChange={e => setMirrorCol(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, fontWeight: 700, outline: 'none' }}
                    >
                      {cols.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__avg__">📊 Média Final Calculada</option>
                    </select>
                  </div>

                  <div style={{ background: '#faf6f0', padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#2c1a0e' }}>
                    <strong>Alunos a enviar:</strong> {filtered.length} alunos da visualização atual.
                  </div>

                  {mirrorStatus && (
                    <div style={{ background: mirrorStatus.includes('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${mirrorStatus.includes('✅') ? '#86efac' : '#fca5a5'}`, padding: '10px 12px', borderRadius: 8, fontSize: 12.5, color: '#2c1a0e' }}>
                      {mirrorStatus}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                    <button 
                      onClick={() => { setIsMirrorModalOpen(false); setMirrorStatus(null) }}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12.5, cursor: 'pointer' }}
                    >
                      Fechar
                    </button>
                    <button 
                      onClick={handleExecuteMirror}
                      disabled={isMirroring}
                      style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                    >
                      {isMirroring ? 'Enviando...' : '🚀 Enviar Notas para o Portal'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeAutomationTask && (
            <AutomationDiffModal
              task={activeAutomationTask}
              onClose={() => setActiveAutomationTask(null)}
              onCompleted={() => setActiveAutomationTask(null)}
            />
          )}

        </ModuleShell>
      </div>
    </div>
  )
}

const SearchInS: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid #ede8dc', outline: 'none', fontSize: 13, width: 200, background: '#fff' }
const ActionBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const ToggleBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid #ede8dc', background: '#fff', color: '#2c1a0e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const TableContainer: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #ede8dc', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }
const ThS: React.CSSProperties = { textAlign: 'left', padding: '14px 16px', fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }
const TrS: React.CSSProperties = { borderBottom: '1px solid #faf6f0' }