'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast, showConfirm } from '@/components/Toast'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import Button from '@/components/Button'
import { fillPortal, logPortalFill } from '@/lib/portalBridge'
import { getPortalProfiles, PortalProfileDef } from '@/lib/portalActionsEngine'
import { recordStudentGrade } from '@/lib/studentMemory'
import AutomationDiffModal from '@/components/modules/AutomationDiffModal'
import { createBrowserTask, BrowserAutomationTask, DiffItem } from '@/lib/browserAutomationClient'
import { sanitizeOutboundPayload } from '@/lib/portalSanitizer'
import { getTeacherCalibrations } from '@/lib/teacherCalibrations'
import ClassHeatmap from '@/components/charts/ClassHeatmap'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

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
    if (oldName === newName || !newName.trim()) return

    const newCols = [...cols]
    newCols[idx] = newName.trim()
    setCols(newCols)
    localStorage.setItem('teacher_gbConfig', JSON.stringify({ cols: newCols }))
    
    const updatedStudents = students.map(s => {
      if (s.grades[oldName] !== undefined) {
        const newGrades = { ...s.grades, [newName.trim()]: s.grades[oldName] }
        delete newGrades[oldName]
        return { ...s, grades: newGrades }
      }
      return s
    })
    
    setStudents(updatedStudents)
    localStorage.setItem('teacher_students', JSON.stringify(updatedStudents))
    toast.success(`Coluna renomeada para "${newName.trim()}"`)
  }

  const deleteCol = async (idx: number) => {
    const colName = cols[idx]
    const confirmed = await showConfirm({
      title: 'Excluir Coluna?',
      message: `Deseja excluir a coluna "${colName}"? Todas as notas lançadas nela serão removidas.`,
      danger: true,
    })
    if (!confirmed) return

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
    toast.info(`Coluna "${colName}" removida.`)
  }

  const addCol = () => {
    const newName = `Avaliação ${cols.length + 1}`
    const newCols = [...cols, newName]
    setCols(newCols)
    localStorage.setItem('teacher_gbConfig', JSON.stringify({ cols: newCols }))
    toast.success(`Nova coluna "${newName}" adicionada!`)
  }

  const calcAvg = (s: Student): number | null => {
    const vals = cols.map(c => parseFloat(s.grades[c]?.replace(',', '.'))).filter(n => !isNaN(n))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const gradeColor = (n: number | null) => {
    if (n === null || isNaN(n)) return { text: COLOR.paperMid, bg: COLOR.surface2, border: BORDER.soft, label: '-' }
    if (n >= 9.0) return { text: '#236e39', bg: 'rgba(61,122,78,0.12)', border: 'rgba(61,122,78,0.25)', label: n.toFixed(1) }
    if (n >= 7.0) return { text: '#8c5e1c', bg: 'rgba(200,122,30,0.12)', border: 'rgba(200,122,30,0.25)', label: n.toFixed(1) }
    if (n >= 5.0) return { text: '#a2521a', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.25)', label: n.toFixed(1) }
    return { text: '#a83232', bg: 'rgba(168,50,50,0.12)', border: 'rgba(168,50,50,0.25)', label: n.toFixed(1) }
  }

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchSchool = filterSchool === 'all' || s.schoolId === filterSchool || (classes.find(c => c.id === s.classId)?.schoolId === filterSchool)
      const matchClass = filterClass === 'all' || s.classId === filterClass
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase())
      return matchSchool && matchClass && matchSearch
    })
  }, [students, filterSchool, filterClass, searchTerm, classes])

  // Estatísticas da Turma
  const stats = useMemo(() => {
    const averages = filtered.map(s => calcAvg(s)).filter((n): n is number => n !== null)
    if (averages.length === 0) {
      return { classAvg: null, passRate: 0, highest: null, lowest: null, totalCount: filtered.length }
    }
    const sum = averages.reduce((a, b) => a + b, 0)
    const classAvg = sum / averages.length
    const passed = averages.filter(a => a >= 7.0).length
    const passRate = (passed / averages.length) * 100
    const highest = Math.max(...averages)
    const lowest = Math.min(...averages)

    return { classAvg, passRate, highest, lowest, totalCount: filtered.length }
  }, [filtered, cols])

  // Exportação CSV
  const exportToCSV = () => {
    if (filtered.length === 0) {
      toast.warning('Nenhum aluno para exportar.')
      return
    }

    const headers = ['Aluno', 'Escola', 'Turma', ...cols, 'Media Final']
    const rows = filtered.map(s => {
      const schName = schools.find(sc => sc.id === s.schoolId)?.name || ''
      const clsName = classes.find(c => c.id === s.classId)?.name || ''
      const avg = calcAvg(s)
      const gradeCells = cols.map(c => s.grades[c] || '')
      return [
        `"${s.name.replace(/"/g, '""')}"`,
        `"${schName.replace(/"/g, '""')}"`,
        `"${clsName.replace(/"/g, '""')}"`,
        ...gradeCells.map(g => `"${g}"`),
        avg !== null ? `"${avg.toFixed(1)}"` : '""'
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `caderneta_notas_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Arquivo CSV exportado com sucesso!')
  }

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

  // Obter iniciais do aluno para o avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 0 || !parts[0]) return 'A'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: COLOR.paperPage, fontFamily: FONT.sans }}>
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        <ModuleShell 
          title="Caderneta de Notas & Espelhamento"
          subtitle="Planilha interativa de notas com cálculo em tempo real e espelhamento oficial nos portais escolares"
          maxWidth="100%"
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Barra de busca */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 10, fontSize: 15, color: COLOR.paperMid, pointerEvents: 'none' }} />
                <input 
                  placeholder="Buscar aluno..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  style={{
                    padding: '8px 12px 8px 32px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${BORDER.medium}`,
                    background: COLOR.surface1,
                    color: COLOR.paperInk,
                    fontSize: TEXT.bodyCompact,
                    outline: 'none',
                    width: 180,
                    fontFamily: FONT.sans,
                  }} 
                />
              </div>

              {/* Botões de Ação */}
              <Button
                variant="primary"
                size="md"
                icon={<i className="ti ti-bolt" />}
                onClick={() => setIsMirrorModalOpen(true)}
              >
                Espelhar no Portal
              </Button>

              <Button
                variant="secondary"
                size="md"
                icon={<i className="ti ti-plus" />}
                onClick={addCol}
              >
                Nova Coluna
              </Button>

              <Button
                variant="ghost"
                size="md"
                icon={<i className="ti ti-file-spreadsheet" />}
                onClick={exportToCSV}
                title="Exportar planilha em CSV"
              >
                CSV
              </Button>

              {/* Alternador de Visualização */}
              <div style={{ display: 'inline-flex', background: COLOR.surface2, borderRadius: RADIUS.md, padding: 3, gap: 2, border: `1px solid ${BORDER.soft}` }}>
                <button
                  onClick={() => setViewMode('table')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.sm,
                    border: 'none',
                    background: viewMode === 'table' ? COLOR.accent : 'transparent',
                    color: viewMode === 'table' ? '#fff' : COLOR.paperWarm,
                    fontSize: TEXT.bodyCompact,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: TRANSITION.button,
                  }}
                >
                  <i className="ti ti-table" style={{ fontSize: 15 }} />
                  <span>Planilha</span>
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.sm,
                    border: 'none',
                    background: viewMode === 'cards' ? COLOR.accent : 'transparent',
                    color: viewMode === 'cards' ? '#fff' : COLOR.paperWarm,
                    fontSize: TEXT.bodyCompact,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: TRANSITION.button,
                  }}
                >
                  <i className="ti ti-layout-grid" style={{ fontSize: 15 }} />
                  <span>Cards</span>
                </button>
                <button
                  onClick={() => setViewMode('heatmap')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.sm,
                    border: 'none',
                    background: viewMode === 'heatmap' ? COLOR.accent : 'transparent',
                    color: viewMode === 'heatmap' ? '#fff' : COLOR.paperWarm,
                    fontSize: TEXT.bodyCompact,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: TRANSITION.button,
                  }}
                >
                  <i className="ti ti-flame" style={{ fontSize: 15 }} />
                  <span>Heatmap</span>
                </button>
              </div>
            </div>
          }
        >
          {/* Barra de Filtros desaninhada (sem box-in-box) */}
          <div style={{
            display: 'flex',
            gap: 16,
            marginBottom: 20,
            paddingBottom: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
            borderBottom: `1px solid ${BORDER.soft}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-school" style={{ fontSize: 16, color: COLOR.accent }} />
              <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: COLOR.paperWarm }}>Escola:</span>
              <select
                value={filterSchool}
                onChange={e => { setFilterSchool(e.target.value); setFilterClass('all') }}
                style={{
                  padding: '6px 12px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${BORDER.medium}`,
                  background: COLOR.surface1,
                  fontSize: TEXT.bodyCompact,
                  color: COLOR.paperInk,
                  outline: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: FONT.sans,
                }}
              >
                <option value="all">Todas as Escolas</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-users" style={{ fontSize: 16, color: COLOR.accent }} />
              <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: COLOR.paperWarm }}>Turma:</span>
              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${BORDER.medium}`,
                  background: COLOR.surface1,
                  fontSize: TEXT.bodyCompact,
                  color: COLOR.paperInk,
                  outline: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: FONT.sans,
                }}
              >
                <option value="all">Todas as Turmas</option>
                {classes.filter(c => filterSchool === 'all' || c.schoolId === filterSchool).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Contador e Badges de Resumo */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: RADIUS.sm,
                background: COLOR.surface2,
                fontSize: TEXT.caption,
                fontWeight: 700,
                color: COLOR.paperWarm,
                border: `1px solid ${BORDER.soft}`,
              }}>
                <i className="ti ti-user-check" style={{ marginRight: 5, fontSize: 13 }} />
                {filtered.length} {filtered.length === 1 ? 'aluno' : 'alunos'}
              </span>

              {stats.classAvg !== null && (
                <span style={{
                  padding: '4px 10px',
                  borderRadius: RADIUS.sm,
                  background: stats.classAvg >= 7.0 ? 'rgba(61,122,78,0.12)' : 'rgba(200,122,30,0.12)',
                  fontSize: TEXT.caption,
                  fontWeight: 800,
                  color: stats.classAvg >= 7.0 ? '#236e39' : '#8c5e1c',
                  border: `1px solid ${stats.classAvg >= 7.0 ? 'rgba(61,122,78,0.25)' : 'rgba(200,122,30,0.25)'}`,
                }}>
                  Média: {stats.classAvg.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {/* MODO 1: Planilha Interativa (Notion Style) */}
          {viewMode === 'table' ? (
            <div style={{
              background: COLOR.surface1,
              borderRadius: RADIUS.lg,
              border: `1px solid ${BORDER.soft}`,
              overflow: 'hidden',
              boxShadow: SHADOW.sm,
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: TEXT.bodyCompact }}>
                  <thead>
                    <tr style={{ background: COLOR.surface2, borderBottom: `1px solid ${BORDER.medium}` }}>
                      <th style={{ padding: '12px 18px', width: 40, color: COLOR.paperMid, fontSize: TEXT.micro, fontWeight: 700 }}>
                        #
                      </th>
                      <th style={{ padding: '12px 18px', color: COLOR.paperWarm, fontSize: TEXT.caption, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', minWidth: 220 }}>
                        Aluno
                      </th>
                      {cols.map((c, idx) => (
                        <th key={c} style={{ padding: '10px 8px', textAlign: 'center', minWidth: 110 }}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            background: COLOR.surface1,
                            padding: '4px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${BORDER.soft}`,
                          }}>
                            <input 
                              defaultValue={c} 
                              onBlur={e => renameCol(idx, e.target.value)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                fontWeight: 800,
                                color: COLOR.accent,
                                textAlign: 'center',
                                outline: 'none',
                                width: 80,
                                fontSize: TEXT.caption,
                                fontFamily: FONT.sans,
                              }}
                            />
                            <button 
                              onClick={() => deleteCol(idx)} 
                              title="Remover coluna"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: COLOR.danger,
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: 0,
                                lineHeight: 1,
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <i className="ti ti-x" />
                            </button>
                          </div>
                        </th>
                      ))}
                      
                      {/* Botão de Adicionar Coluna no Cabeçalho */}
                      <th style={{ padding: '10px 8px', width: 40, textAlign: 'center' }}>
                        <button
                          onClick={addCol}
                          title="Adicionar nova coluna de avaliação"
                          style={{
                            background: 'transparent',
                            border: `1px dashed ${BORDER.medium}`,
                            borderRadius: RADIUS.sm,
                            width: 26,
                            height: 26,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: COLOR.accent,
                            transition: TRANSITION.button,
                          }}
                        >
                          <i className="ti ti-plus" style={{ fontSize: 14 }} />
                        </button>
                      </th>

                      <th style={{ padding: '12px 20px', textAlign: 'right', width: 120, color: COLOR.paperWarm, fontSize: TEXT.caption, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Média Final
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={cols.length + 4} style={{ textAlign: 'center', padding: '48px 24px', color: COLOR.paperMid }}>
                          <i className="ti ti-users" style={{ fontSize: 36, opacity: 0.4, display: 'block', marginBottom: 8 }} />
                          <span style={{ fontSize: TEXT.body, fontWeight: 600 }}>Nenhum aluno encontrado para os filtros selecionados</span>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((s, sIdx) => {
                        const avg = calcAvg(s)
                        const gc = gradeColor(avg)
                        const clsObj = classes.find(c => c.id === s.classId)

                        return (
                          <tr 
                            key={s.id} 
                            style={{
                              borderBottom: `1px solid ${BORDER.soft}`,
                              background: sIdx % 2 === 0 ? COLOR.surface1 : 'rgba(253,248,242,0.4)',
                              transition: TRANSITION.fast,
                            }}
                          >
                            <td style={{ padding: '10px 18px', color: COLOR.paperMid, fontSize: TEXT.caption, fontWeight: 600 }}>
                              {sIdx + 1}
                            </td>

                            {/* Célula do Aluno com Avatar */}
                            <td style={{ padding: '10px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  background: COLOR.surface2,
                                  border: `1px solid ${BORDER.medium}`,
                                  color: COLOR.accent,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  {getInitials(s.name)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <input 
                                    value={s.name} 
                                    onChange={e => updateStudentField(s.id, 'name', e.target.value)} 
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      fontWeight: 700,
                                      color: COLOR.paperInk,
                                      outline: 'none',
                                      width: '100%',
                                      fontSize: TEXT.bodyCompact,
                                      fontFamily: FONT.sans,
                                    }}
                                  />
                                  {clsObj && (
                                    <span style={{ fontSize: 11, color: COLOR.paperMid, display: 'block' }}>
                                      {clsObj.name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Células de Notas */}
                            {cols.map(c => {
                              const rawVal = s.grades[c] || ''
                              const parsedVal = parseFloat(rawVal.replace(',', '.'))
                              const cellGc = gradeColor(parsedVal)

                              return (
                                <td key={c} style={{ padding: '8px 6px', textAlign: 'center' }}>
                                  <input 
                                    value={rawVal} 
                                    onChange={e => updateGrade(s.id, c, e.target.value)} 
                                    placeholder="-"
                                    style={{ 
                                      width: 52,
                                      textAlign: 'center',
                                      border: `1px solid ${cellGc.border}`,
                                      borderRadius: RADIUS.sm,
                                      padding: '6px 4px',
                                      fontWeight: 800,
                                      fontSize: TEXT.bodyCompact,
                                      background: cellGc.bg,
                                      color: cellGc.text,
                                      outline: 'none',
                                      fontFamily: FONT.sans,
                                      transition: TRANSITION.fast,
                                    }}
                                  />
                                </td>
                              )
                            })}

                            <td style={{ padding: '8px 6px' }} />

                            {/* Média Final */}
                            <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: RADIUS.sm,
                                background: gc.bg,
                                border: `1px solid ${gc.border}`,
                                fontSize: TEXT.bodyCompact,
                                fontWeight: 900,
                                color: gc.text,
                              }}>
                                {gc.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Rodapé com Estatísticas Consolidadas da Turma */}
              {filtered.length > 0 && stats.classAvg !== null && (
                <div style={{
                  padding: '14px 20px',
                  background: COLOR.surface2,
                  borderTop: `1px solid ${BORDER.medium}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                  fontSize: TEXT.caption,
                }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: COLOR.paperMid, fontWeight: 600 }}>Média da Turma:</span>
                      <strong style={{ color: COLOR.paperInk, fontSize: TEXT.bodyCompact }}>{stats.classAvg.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: COLOR.paperMid, fontWeight: 600 }}>Aprovação (≥7.0):</span>
                      <strong style={{ color: stats.passRate >= 70 ? '#236e39' : '#8c5e1c', fontSize: TEXT.bodyCompact }}>
                        {stats.passRate.toFixed(0)}%
                      </strong>
                    </div>
                    {stats.highest !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: COLOR.paperMid, fontWeight: 600 }}>Maior Nota:</span>
                        <strong style={{ color: '#236e39' }}>{stats.highest.toFixed(1)}</strong>
                      </div>
                    )}
                    {stats.lowest !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: COLOR.paperMid, fontWeight: 600 }}>Menor Nota:</span>
                        <strong style={{ color: '#a83232' }}>{stats.lowest.toFixed(1)}</strong>
                      </div>
                    )}
                  </div>
                  <span style={{ color: COLOR.paperMid, fontSize: 11 }}>
                    <i className="ti ti-info-circle" style={{ marginRight: 4 }} />
                    Dica: use a tecla Tab para navegar rapidamente entre as células de nota.
                  </span>
                </div>
              )}
            </div>
          ) : viewMode === 'cards' ? (
            /* MODO 2: Cards dos Alunos */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {filtered.map(s => {
                const avg = calcAvg(s)
                const gc = gradeColor(avg)
                return (
                  <ModuleCard key={s.id} padding={20}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: COLOR.surface2,
                        border: `1px solid ${BORDER.medium}`,
                        color: COLOR.accent,
                        fontSize: 13,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {getInitials(s.name)}
                      </div>
                      <input 
                        value={s.name} 
                        onChange={e => updateStudentField(s.id, 'name', e.target.value)} 
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontWeight: 800,
                          color: COLOR.paperInk,
                          width: '100%',
                          fontSize: TEXT.subtitle,
                          outline: 'none',
                          fontFamily: FONT.sans,
                        }} 
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {cols.map(c => (
                        <div key={c} style={{ background: COLOR.surface2, padding: '8px 10px', borderRadius: RADIUS.sm, border: `1px solid ${BORDER.soft}` }}>
                          <div style={{ fontSize: 11, color: COLOR.paperWarm, fontWeight: 700, marginBottom: 4 }}>{c}</div>
                          <input 
                            value={s.grades[c] || ''} 
                            onChange={e => updateGrade(s.id, c, e.target.value)} 
                            placeholder="-"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              fontWeight: 800,
                              color: COLOR.paperInk,
                              width: '100%',
                              outline: 'none',
                              fontSize: TEXT.body,
                            }} 
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER.soft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: COLOR.paperWarm }}>MÉDIA FINAL</span>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: RADIUS.sm,
                        background: gc.bg,
                        border: `1px solid ${gc.border}`,
                        fontSize: TEXT.bodyCompact,
                        fontWeight: 900,
                        color: gc.text,
                      }}>
                        {gc.label}
                      </span>
                    </div>
                  </ModuleCard>
                )
              })}
            </div>
          ) : (
            /* MODO 3: Heatmap Visual */
            <div style={{ background: COLOR.surface1, borderRadius: RADIUS.lg, padding: 14, border: `1px solid ${BORDER.soft}`, boxShadow: SHADOW.sm }}>
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
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,17,10,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
              <div style={{ background: COLOR.surface1, borderRadius: RADIUS.lg, maxWidth: 500, width: '100%', overflow: 'hidden', boxShadow: SHADOW.lg, border: `1px solid ${BORDER.medium}` }}>
                <div style={{ padding: '16px 20px', background: COLOR.paperInk, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: TEXT.subtitle, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-bolt" />
                    <span>Espelhar Notas no Portal Oficial</span>
                  </h3>
                  <button 
                    onClick={() => { setIsMirrorModalOpen(false); setMirrorStatus(null) }} 
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ margin: 0, fontSize: TEXT.bodyCompact, color: COLOR.paperWarm, lineHeight: 1.5 }}>
                    Selecione o portal e a coluna que deseja enviar. A extensão preencherá a tabela de notas na aba aberta correspondente no Chrome com <strong>fuzzy matching de nomes</strong>.
                  </p>

                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                      1. Escolha o Portal de Destino:
                    </label>
                    <select
                      value={mirrorPortalId}
                      onChange={e => setMirrorPortalId(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}`, background: COLOR.paperPage, fontSize: TEXT.body, fontWeight: 700, outline: 'none', color: COLOR.paperInk }}
                    >
                      {portals.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                      2. Escolha a Avaliação / Coluna:
                    </label>
                    <select
                      value={mirrorCol}
                      onChange={e => setMirrorCol(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}`, background: COLOR.paperPage, fontSize: TEXT.body, fontWeight: 700, outline: 'none', color: COLOR.paperInk }}
                    >
                      {cols.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__avg__">Média Final Calculada</option>
                    </select>
                  </div>

                  <div style={{ background: COLOR.surface2, padding: '10px 14px', borderRadius: RADIUS.md, fontSize: TEXT.caption, color: COLOR.paperInk, border: `1px solid ${BORDER.soft}` }}>
                    <strong>Alunos a enviar:</strong> {filtered.length} alunos da visualização atual.
                  </div>

                  {mirrorStatus && (
                    <div style={{ background: mirrorStatus.includes('Conectando') ? COLOR.warningBg : COLOR.successBg, border: `1px solid ${BORDER.medium}`, padding: '10px 14px', borderRadius: RADIUS.md, fontSize: TEXT.caption, color: COLOR.paperInk }}>
                      {mirrorStatus}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                    <Button 
                      variant="secondary"
                      size="md"
                      onClick={() => { setIsMirrorModalOpen(false); setMirrorStatus(null) }}
                    >
                      Fechar
                    </Button>
                    <Button 
                      variant="primary"
                      size="md"
                      icon={<i className="ti ti-send" />}
                      onClick={handleExecuteMirror}
                      loading={isMirroring}
                    >
                      {isMirroring ? 'Enviando...' : 'Enviar Notas para o Portal'}
                    </Button>
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