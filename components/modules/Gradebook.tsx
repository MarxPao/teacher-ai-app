'use client'

import { useState, useEffect } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'

interface School { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string }
interface Student { id: string; name: string; classId: string; schoolId: string; grades: Record<string, string> }

export default function Gradebook() {
  const [schools, setSchools] = useState<School[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [cols, setCols] = useState<string[]>([])
  
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [filterClass, setFilterClass] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  useEffect(() => {
    const sSchools = localStorage.getItem('teacher_schools')
    const sClasses = localStorage.getItem('teacher_classes')
    const sStudents = localStorage.getItem('teacher_students')
    const sGbConfig = localStorage.getItem('teacher_gbConfig')

    setSchools(sSchools ? JSON.parse(sSchools) : [])
    setClasses(sClasses ? JSON.parse(sClasses) : [])
    const parsedStudents = sStudents ? JSON.parse(sStudents) : []
    setStudents(parsedStudents.map((s: any) => ({ ...s, grades: s.grades || {} })))
    setCols(sGbConfig ? JSON.parse(sGbConfig).cols : ['Teste 1', 'Teste 2', 'Participação'])
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
    const updated = students.map(s => s.id === sid ? { ...s, grades: { ...s.grades, [col]: val } } : s)
    sync(updated)
  }

  const renameCol = (idx: number, newName: string) => {
    const oldName = cols[idx]
    const newCols = [...cols]
    newCols[idx] = newName
    setCols(newCols)
    localStorage.setItem('teacher_gbConfig', JSON.stringify({ cols: newCols }))
    
    // Migrate grades key if needed? Maybe only on blur to avoid mass updates on every key
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
    if (n === null) return { text: '#93a1a1', bg: '#eee8d5', label: '—' }
    if (n >= 9) return { text: '#859900', bg: '#eef2d5', label: n.toFixed(1) }
    if (n >= 7) return { text: '#b58900', bg: '#f5edcc', label: n.toFixed(1) }
    if (n >= 5) return { text: '#cb4b16', bg: '#fce9e0', label: n.toFixed(1) }
    return { text: '#dc322f', bg: '#fce8e8', label: n.toFixed(1) }
  }

  const filtered = students.filter(s => {
    const matchClass = filterClass === 'all' || s.classId === filterClass
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchClass && matchSearch
  })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#fdf6e3' }}>
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        <ModuleShell 
          title="Gradebook Editável"
          subtitle="Clique em qualquer caixa para editar nomes, colunas ou notas diretamente."
          maxWidth="100%"
          actions={
            <div style={{ display: 'flex', gap: 12 }}>
              <input placeholder="🔍 Buscar aluno..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={SearchInS} />
              <button onClick={addCol} style={ActionBtn}>+ Nova Coluna</button>
              <button onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')} style={ToggleBtn}>
                {viewMode === 'table' ? 'Visualização em Cards' : 'Visualização em Tabela'}
              </button>
            </div>
          }
        >
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', padding: '4px 0' }}>
            <button onClick={() => setFilterClass('all')} style={{ ...TabS, background: filterClass === 'all' ? '#073642' : '#fff', color: filterClass === 'all' ? '#fff' : '#586e75' }}>Tudo</button>
            {classes.map(c => (
              <button key={c.id} onClick={() => setFilterClass(c.id)} style={{ ...TabS, background: filterClass === c.id ? '#073642' : '#fff', color: filterClass === c.id ? '#fff' : '#586e75', borderLeft: `4px solid ${schools.find(s => s.id === c.schoolId)?.color}` }}>{c.name}</button>
            ))}
          </div>

          {viewMode === 'table' ? (
            <div style={TableContainer}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fdf6e3', borderBottom: '2px solid #073642' }}>
                    <th style={{...ThS, width: 250}}>Nome do Aluno</th>
                    {cols.map((c, idx) => (
                      <th key={idx} style={{...ThS, textAlign: 'center', padding: '8px 4px'}}>
                        <input 
                          value={c} 
                          onChange={e => renameCol(idx, e.target.value)} 
                          style={{ background: 'rgba(181, 137, 0, 0.05)', border: 'none', textAlign: 'center', fontWeight: 800, color: '#b58900', width: '100%', outline: 'none', padding: '8px 4px', borderRadius: 6 }} 
                        />
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
                            style={{ background: 'transparent', border: 'none', fontWeight: 700, color: '#073642', outline: 'none', width: '100%', padding: '8px' }}
                          />
                        </td>
                        {cols.map(c => (
                          <td key={c} style={{ padding: '8px 4px', textAlign: 'center' }}>
                            <input 
                              value={s.grades[c] || ''} 
                              onChange={e => updateGrade(s.id, c, e.target.value)} 
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
                          <span style={{ fontSize: 18, fontWeight: 900, color: gc.text }}>{gc.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {filtered.map(s => {
                const avg = calcAvg(s); const gc = gradeColor(avg)
                return (
                  <ModuleCard key={s.id} padding={20}>
                    <input value={s.name} onChange={e => updateStudentField(s.id, 'name', e.target.value)} style={{ background: 'transparent', border: 'none', fontWeight: 800, color: '#073642', width: '100%', fontSize: 16, marginBottom: 16, outline: 'none' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                       {cols.map(c => (
                         <div key={c} style={{ background: '#fdf6e3', padding: 8, borderRadius: 12 }}>
                            <div style={{ fontSize: 9, color: '#93a1a1', fontWeight: 700, marginBottom: 4 }}>{c}</div>
                            <input value={s.grades[c] || ''} onChange={e => updateGrade(s.id, c, e.target.value)} style={{ background: 'transparent', border: 'none', fontWeight: 800, color: '#073642', width: '100%', outline: 'none' }} />
                         </div>
                       ))}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eee8d5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <span style={{ fontSize: 12, fontWeight: 700, color: '#93a1a1' }}>MÉDIA FINAL</span>
                       <span style={{ fontSize: 20, fontWeight: 900, color: gc.text }}>{gc.label}</span>
                    </div>
                  </ModuleCard>
                )
              })}
            </div>
          )}
        </ModuleShell>
      </div>
    </div>
  )
}

const SearchInS: React.CSSProperties = { padding: '10px 16px', borderRadius: 12, border: '1px solid #ede8dc', outline: 'none', fontSize: 13, width: 220, background: '#fff' }
const ActionBtn: React.CSSProperties = { padding: '8px 16px', borderRadius: 12, border: 'none', background: '#b58900', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const ToggleBtn: React.CSSProperties = { padding: '8px 16px', borderRadius: 12, border: '1px solid #ede8dc', background: '#fff', color: '#073642', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const TabS: React.CSSProperties = { padding: '8px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }
const TableContainer: React.CSSProperties = { background: '#fff', borderRadius: 24, border: '1px solid rgba(88,110,117,0.08)', overflow: 'hidden' }
const ThS: React.CSSProperties = { textAlign: 'left', padding: '16px 24px', fontSize: 11, fontWeight: 700, color: '#93a1a1', textTransform: 'uppercase' }
const TrS: React.CSSProperties = { borderBottom: '1px solid #fdf6e3' }
