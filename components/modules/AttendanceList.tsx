'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { fillPortal, logPortalFill } from '@/lib/portalBridge'
import { syncToSupabase } from '@/lib/supabaseClient'
import { recordAttendanceObservation } from '@/lib/studentMemory'

// ─── Interfaces ─────────────────────────────────────────────────────────────
export interface School {
  id: string
  name: string
  color?: string
}

export interface ClassRecord {
  id: string
  name: string
  schoolId?: string
  level?: string
  subject?: string
  year?: string
}

export interface StudentRecord {
  id: string
  name: string
  classId: string
  schoolId?: string
  email?: string
  notes?: string
}

export type BinaryAttendanceStatus = 'present' | 'absent' | 'none'

export interface AttendanceStudentDetail {
  status: BinaryAttendanceStatus
  note?: string
  timeMarked?: string
}

export interface ClassAttendanceSession {
  id: string
  schoolId?: string
  schoolName?: string
  classId: string
  className: string
  date: string
  dayOfWeekName: string
  timeSlot: string
  totalStudents: number
  presentCount: number
  absentCount: number
  attendanceRate: number
  records: Record<string, AttendanceStudentDetail>
  savedAt: string
}

const DEFAULT_TIME_SLOTS = [
  '07:30 - 08:20 (1ª Aula)',
  '08:20 - 09:10 (2ª Aula)',
  '09:30 - 10:20 (3ª Aula)',
  '10:30 - 11:20 (4ª Aula)',
  '11:20 - 12:10 (5ª Aula)',
  '13:30 - 14:20 (Tarde 1)',
  '14:20 - 15:10 (Tarde 2)',
  '15:30 - 16:20 (Tarde 3)',
  '16:20 - 17:10 (Tarde 4)',
  '18:30 - 19:20 (Noite 1)',
  '19:20 - 20:10 (Noite 2)',
]

const WEEK_DAYS_NAMES = [
  { id: 0, full: 'Domingo',       short: 'Dom' },
  { id: 1, full: 'Segunda-feira', short: 'Seg' },
  { id: 2, full: 'Terça-feira',   short: 'Ter' },
  { id: 3, full: 'Quarta-feira',  short: 'Qua' },
  { id: 4, full: 'Quinta-feira',  short: 'Qui' },
  { id: 5, full: 'Sexta-feira',   short: 'Sex' },
  { id: 6, full: 'Sábado',        short: 'Sáb' },
]

export default function AttendanceList() {
  // 1. Dados de Entidades
  const [schools, setSchools] = useState<School[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [scheduleClasses, setScheduleClasses] = useState<any[]>([])

  // 2. Filtros Hierárquicos (Escola -> Turma -> Aluno)
  const [selectedSchool, setSelectedSchool] = useState<string>('all')
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [studentSearch, setStudentSearch] = useState<string>('')

  // 3. Data & Horário da Aula (Dia da Semana + Horário)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(DEFAULT_TIME_SLOTS[0])
  const [isCustomTime, setIsCustomTime] = useState<boolean>(false)
  const [customTime, setCustomTime] = useState<string>('08:00 - 08:50')

  // 4. Estado de Presença da Aula (2 Pontos: Presente ou Falta)
  const [attendance, setAttendance] = useState<Record<string, AttendanceStudentDetail>>({})
  const [attendanceHistory, setAttendanceHistory] = useState<ClassAttendanceSession[]>([])

  // 5. Abas do Módulo: 'daily' (Chamada Diária), 'report' (Relatório de Frequência), 'history' (Histórico)
  const [activeTab, setActiveTab] = useState<'daily' | 'report' | 'history'>('daily')

  // 6. Espelhamento em Portais
  const [isMirrorModalOpen, setIsMirrorModalOpen] = useState(false)
  const [selectedMirrorPortal, setSelectedMirrorPortal] = useState('plural')

  // 7. Notificações Toast
  const [toastMessage, setToastMessage] = useState('')

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // ─── Carregamento de Dados ──────────────────────────────────────────────────
  const loadEntities = useCallback(() => {
    try {
      const rawSchools = localStorage.getItem('teacher_schools')
      const rawClasses = localStorage.getItem('teacher_classes')
      const rawStudents = localStorage.getItem('teacher_students')
      const rawHistory = localStorage.getItem('teacher_attendance_records_v1')
      const rawSchedule = localStorage.getItem('teacher_weekly_schedule_v2')

      let loadedSchools: School[] = rawSchools ? JSON.parse(rawSchools) : []
      let loadedClasses: ClassRecord[] = rawClasses ? JSON.parse(rawClasses) : []
      let loadedStudents: StudentRecord[] = rawStudents ? JSON.parse(rawStudents) : []
      let loadedHistory: ClassAttendanceSession[] = rawHistory ? JSON.parse(rawHistory) : []
      let loadedSchedule: any[] = rawSchedule ? JSON.parse(rawSchedule) : []

      if (loadedSchools.length === 0 && loadedClasses.length > 0) {
        loadedSchools = [
          { id: 'sch_1', name: 'Colégio Integral', color: '#8b5e3c' },
          { id: 'sch_2', name: 'Escola Modelo', color: '#0284c7' }
        ]
        localStorage.setItem('teacher_schools', JSON.stringify(loadedSchools))
      }

      setSchools(loadedSchools)
      setClasses(loadedClasses)
      setStudents(loadedStudents)
      setAttendanceHistory(loadedHistory)
      setScheduleClasses(loadedSchedule)

      if (!selectedClass && loadedClasses.length > 0) {
        setSelectedClass(loadedClasses[0].id)
        if (loadedClasses[0].schoolId) {
          setSelectedSchool(loadedClasses[0].schoolId)
        }
      }
    } catch (e) {
      console.error('Erro ao carregar dados em Lista de Presença:', e)
    }
  }, [selectedClass])

  useEffect(() => {
    loadEntities()
    window.addEventListener('storage', loadEntities)
    return () => window.removeEventListener('storage', loadEntities)
  }, [loadEntities])

  // ─── Cálculo de Dia da Semana da Data Selecionada ────────────────────────────
  const dateObj = useMemo(() => {
    const parts = selectedDate.split('-')
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    }
    return new Date()
  }, [selectedDate])

  const dayOfWeekIndex = dateObj.getDay()
  const dayOfWeekObj = WEEK_DAYS_NAMES[dayOfWeekIndex] || WEEK_DAYS_NAMES[1]

  const formattedFullDate = useMemo(() => {
    return dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }, [dateObj])

  // Ajustar data ao clicar no botão de dia da semana (Seg, Ter, Qua, Qui, Sex, Sáb)
  const handleSelectDayOfWeek = (targetDay: number) => {
    const current = new Date(dateObj)
    const currentDay = current.getDay()
    const diff = targetDay - currentDay
    current.setDate(current.getDate() + diff)
    const y = current.getFullYear()
    const m = String(current.getMonth() + 1).padStart(2, '0')
    const d = String(current.getDate()).padStart(2, '0')
    setSelectedDate(`${y}-${m}-${d}`)
  }

  // ─── Filtragem Hierárquica ───────────────────────────────────────────────────
  const filteredClasses = useMemo(() => {
    if (selectedSchool === 'all') return classes
    return classes.filter(c => c.schoolId === selectedSchool)
  }, [classes, selectedSchool])

  const classStudents = useMemo(() => {
    if (!selectedClass) return []
    return students.filter(s => s.classId === selectedClass)
  }, [students, selectedClass])

  const displayedStudents = useMemo(() => {
    if (!studentSearch.trim()) return classStudents
    const q = studentSearch.toLowerCase()
    return classStudents.filter(s => s.name.toLowerCase().includes(q))
  }, [classStudents, studentSearch])

  const selectedClassObj = useMemo(() => {
    return classes.find(c => c.id === selectedClass)
  }, [classes, selectedClass])

  const selectedSchoolObj = useMemo(() => {
    if (!selectedClassObj) return null
    return schools.find(s => s.id === selectedClassObj.schoolId || s.id === selectedSchool)
  }, [schools, selectedClassObj, selectedSchool])

  // Horários disponíveis para a turma
  const availableTimeSlots = useMemo(() => {
    if (!selectedClassObj) return DEFAULT_TIME_SLOTS
    const matched = scheduleClasses.filter(s =>
      (s.className && s.className.toLowerCase() === selectedClassObj.name.toLowerCase()) ||
      (s.classId === selectedClassObj.id)
    )
    if (matched.length > 0) {
      const customSlots = matched.map((m: any) => `${m.timeStart} - ${m.timeEnd} (${m.room || 'Aula'})`)
      return Array.from(new Set([...customSlots, ...DEFAULT_TIME_SLOTS]))
    }
    return DEFAULT_TIME_SLOTS
  }, [selectedClassObj, scheduleClasses])

  // ─── Carregar Chamada da Data e Turma Selecionadas ──────────────────────────
  useEffect(() => {
    if (selectedClass) {
      const attKey = `teacher_attendance_${selectedClass}_${selectedDate}`
      const savedRaw = localStorage.getItem(attKey)
      const savedAtt: Record<string, any> = savedRaw ? JSON.parse(savedRaw) : {}

      const initAtt: Record<string, AttendanceStudentDetail> = {}

      classStudents.forEach(s => {
        const val = savedAtt[s.id]
        if (typeof val === 'string') {
          // Converte para binário (present vs absent)
          initAtt[s.id] = { status: (val === 'absent' ? 'absent' : val === 'present' || val === 'late' ? 'present' : 'none') }
        } else if (val && typeof val === 'object') {
          const st = val.status === 'absent' ? 'absent' : val.status === 'present' || val.status === 'late' ? 'present' : 'none'
          initAtt[s.id] = {
            status: st,
            note: val.note || '',
            timeMarked: val.timeMarked
          }
        } else {
          // Por padrão se não marcado, inicia como 'present' para facilitar a chamada rápida
          initAtt[s.id] = { status: 'present' }
        }
      })

      setAttendance(initAtt)
    } else {
      setAttendance({})
    }
  }, [selectedClass, selectedDate, classStudents])

  // ─── Dados de Presença Gerados no Topo da Função (KPIs) ──────────────────────
  const metrics = useMemo(() => {
    const total = classStudents.length
    let present = 0
    let absent = 0
    let unassigned = 0

    classStudents.forEach(s => {
      const st = attendance[s.id]?.status
      if (st === 'present') present++
      else if (st === 'absent') absent++
      else unassigned++
    })

    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0
    const presentPct = total > 0 ? Math.round((present / total) * 100) : 0
    const absentPct = total > 0 ? Math.round((absent / total) * 100) : 0

    return {
      total,
      present,
      presentPct,
      absent,
      absentPct,
      unassigned,
      attendanceRate,
    }
  }, [classStudents, attendance])

  // ─── Ações de 1 Clique: Presença (Ponto 1) vs Falta (Ponto 2) ────────────────
  const setStudentStatus = (studentId: string, status: BinaryAttendanceStatus) => {
    setAttendance(prev => {
      const current = prev[studentId] || { status: 'none' }
      const updated = {
        ...prev,
        [studentId]: {
          ...current,
          status,
          timeMarked: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }
      }
      if (selectedClass) {
        localStorage.setItem(`teacher_attendance_${selectedClass}_${selectedDate}`, JSON.stringify(updated))
      }
      return updated
    })
  }

  // Alternar com 1 clique direto na linha
  const toggleStudentStatus = (studentId: string) => {
    const current = attendance[studentId]?.status || 'none'
    const nextStatus: BinaryAttendanceStatus = current === 'present' ? 'absent' : 'present'
    setStudentStatus(studentId, nextStatus)
  }

  const setStudentNote = (studentId: string, note: string) => {
    setAttendance(prev => {
      const current = prev[studentId] || { status: 'none' }
      const updated = {
        ...prev,
        [studentId]: {
          ...current,
          note
        }
      }
      if (selectedClass) {
        localStorage.setItem(`teacher_attendance_${selectedClass}_${selectedDate}`, JSON.stringify(updated))
      }
      return updated
    })
  }

  // Marcar todos como PRESENÇA (1 clique)
  const handleMarkAllPresent = () => {
    const updated: Record<string, AttendanceStudentDetail> = {}
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    classStudents.forEach(s => {
      updated[s.id] = {
        status: 'present',
        note: attendance[s.id]?.note || '',
        timeMarked: time
      }
    })
    setAttendance(updated)
    if (selectedClass) {
      localStorage.setItem(`teacher_attendance_${selectedClass}_${selectedDate}`, JSON.stringify(updated))
    }
    showToast('✓ Todos os alunos marcados com PRESENÇA!')
  }

  // Marcar todos como FALTA (1 clique)
  const handleMarkAllAbsent = () => {
    const updated: Record<string, AttendanceStudentDetail> = {}
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    classStudents.forEach(s => {
      updated[s.id] = {
        status: 'absent',
        note: attendance[s.id]?.note || '',
        timeMarked: time
      }
    })
    setAttendance(updated)
    if (selectedClass) {
      localStorage.setItem(`teacher_attendance_${selectedClass}_${selectedDate}`, JSON.stringify(updated))
    }
    showToast('✕ Todos os alunos marcados com FALTA!')
  }

  // Inverter seleção (1 clique)
  const handleInvertAttendance = () => {
    const updated: Record<string, AttendanceStudentDetail> = {}
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    classStudents.forEach(s => {
      const current = attendance[s.id]?.status || 'present'
      updated[s.id] = {
        status: current === 'present' ? 'absent' : 'present',
        note: attendance[s.id]?.note || '',
        timeMarked: time
      }
    })
    setAttendance(updated)
    if (selectedClass) {
      localStorage.setItem(`teacher_attendance_${selectedClass}_${selectedDate}`, JSON.stringify(updated))
    }
    showToast('🔄 Seleção de presenças invertida!')
  }

  // Salvar sessão e histórico
  const handleSaveAttendanceSession = () => {
    if (!selectedClass || !selectedClassObj) return

    const actualTime = isCustomTime ? customTime : selectedTimeSlot

    const session: ClassAttendanceSession = {
      id: `att_sess_${selectedClass}_${selectedDate}_${Date.now()}`,
      schoolId: selectedSchoolObj?.id,
      schoolName: selectedSchoolObj?.name || 'Escola Principal',
      classId: selectedClass,
      className: selectedClassObj.name,
      date: selectedDate,
      dayOfWeekName: dayOfWeekObj.full,
      timeSlot: actualTime,
      totalStudents: metrics.total,
      presentCount: metrics.present,
      absentCount: metrics.absent,
      attendanceRate: metrics.attendanceRate,
      records: attendance,
      savedAt: new Date().toISOString()
    }

    const updatedHistory = [
      session,
      ...attendanceHistory.filter(h => !(h.classId === selectedClass && h.date === selectedDate))
    ]

    setAttendanceHistory(updatedHistory)
    localStorage.setItem('teacher_attendance_records_v1', JSON.stringify(updatedHistory))
    localStorage.setItem(`teacher_attendance_${selectedClass}_${selectedDate}`, JSON.stringify(attendance))

    // Gravação automática na memória viva dos alunos para faltas relevantes
    try {
      classStudents.forEach(s => {
        const currentRec = attendance[s.id]
        if (currentRec && (currentRec.status === 'absent' || currentRec.note)) {
          // Conta total de faltas no histórico
          let totalAbsences = 0
          let consecutiveAbsences = 0
          let countingConsecutive = true

          // Ordena sessões por data decrescente
          const sortedSessions = [...updatedHistory]
            .filter(h => h.classId === selectedClass)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

          for (const sess of sortedSessions) {
            const stRec = sess.records[s.id]
            if (stRec && stRec.status === 'absent') {
              totalAbsences++
              if (countingConsecutive) consecutiveAbsences++
            } else if (stRec && stRec.status === 'present') {
              countingConsecutive = false
            }
          }

          const specificNote = currentRec.note 
            ? `Observação de presença (${selectedDate}): ${currentRec.note}`
            : undefined

          recordAttendanceObservation(
            s.id,
            s.name,
            totalAbsences,
            consecutiveAbsences,
            selectedClassObj.name,
            specificNote
          )
        }
      })
    } catch {}

    syncToSupabase().catch(() => {})
    showToast('💾 Lista de presença salva com sucesso!')
  }

  // Exportar CSV
  const handleExportCSV = () => {
    if (!selectedClass || classStudents.length === 0) return

    const actualTime = isCustomTime ? customTime : selectedTimeSlot
    let csvContent = 'data:text/csv;charset=utf-8,'
    csvContent += 'Numero,Aluno,Escola,Turma,Data,DiaSemana,Horario,Status,HorarioRegistro,Observacao\n'

    displayedStudents.forEach((s, idx) => {
      const rec = attendance[s.id] || { status: 'none' }
      const statusLabel = rec.status === 'present' ? 'PRESENCA' : rec.status === 'absent' ? 'FALTA' : 'NAO_INFORMADO'

      csvContent += `"${idx + 1}","${s.name}","${selectedSchoolObj?.name || ''}","${selectedClassObj?.name || ''}","${selectedDate}","${dayOfWeekObj.full}","${actualTime}","${statusLabel}","${rec.timeMarked || ''}","${rec.note || ''}"\n`
    })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `chamada_${selectedClassObj?.name}_${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('📥 Arquivo CSV exportado!')
  }

  // Espelhar no Portal
  const handleExecuteMirrorAttendance = async () => {
    if (!selectedClass) return
    const targetClassObj = classes.find(c => c.id === selectedClass)
    const absentStudents = classStudents.filter(s => attendance[s.id]?.status === 'absent').map(s => s.name)
    const presentStudents = classStudents.filter(s => attendance[s.id]?.status === 'present').map(s => s.name)

    const payload = {
      platform: selectedMirrorPortal,
      actionType: 'attendance',
      classRef: targetClassObj?.name || '',
      date: selectedDate,
      absentStudents,
      presentStudents,
      mode: 'supervised'
    }

    logPortalFill(payload as any)
    const res = await fillPortal(payload as any)
    if (res.success) {
      showToast(`✅ Presença transferida para o portal ${selectedMirrorPortal}!`)
      setIsMirrorModalOpen(false)
    } else {
      alert(`⚠️ Certifique-se de que a página de chamada do portal "${selectedMirrorPortal}" está aberta no navegador Chrome.`)
    }
  }

  // Relatório de Assiduidade Consolidada
  const studentAttendanceStats = useMemo(() => {
    if (!selectedClass) return []
    const classSessions = attendanceHistory.filter(h => h.classId === selectedClass)
    const totalSessions = classSessions.length

    return classStudents.map(s => {
      let attended = 0
      let absents = 0

      classSessions.forEach(sess => {
        const rec = sess.records?.[s.id]
        if (rec?.status === 'present') attended++
        else if (rec?.status === 'absent') absents++
      })

      const rate = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 100
      return {
        student: s,
        totalSessions,
        attended,
        absents,
        rate
      }
    })
  }, [selectedClass, classStudents, attendanceHistory])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#fdf6e3' }}>
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        <ModuleShell
          title="Lista de Presença 📋"
          subtitle="Controle rápido de frequência: clique único para marcar Presença ou Falta, com visualização de Dia da Semana e Horário."
        >

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 1: SELETOR HIERÁRQUICO + SELEÇÃO VISUAL DE DIA DA SEMANA & HORÁRIO
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: '#fff',
            borderRadius: 18,
            padding: '16px 20px',
            border: '1px solid #ede8dc',
            boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            {/* Header com Abas e Ações */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', background: '#faf6f0', padding: 3, borderRadius: 10, border: '1px solid #ede8dc', gap: 4 }}>
                <button
                  onClick={() => setActiveTab('daily')}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: activeTab === 'daily' ? '#2c1a0e' : 'transparent',
                    color: activeTab === 'daily' ? '#fff' : '#665c54',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  📝 Chamada Rápida (1 Clique)
                </button>
                <button
                  onClick={() => setActiveTab('report')}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: activeTab === 'report' ? '#2c1a0e' : 'transparent',
                    color: activeTab === 'report' ? '#fff' : '#665c54',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  📊 Relatório de Frequência
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: activeTab === 'history' ? '#2c1a0e' : 'transparent',
                    color: activeTab === 'history' ? '#fff' : '#665c54',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  📜 Histórico
                </button>
              </div>

              {selectedClass && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleExportCSV}
                    style={{
                      padding: '7px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff',
                      color: '#2c1a0e', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                    }}
                  >
                    <i className="ti ti-file-spreadsheet" /> Exportar CSV
                  </button>
                  <button
                    onClick={() => setIsMirrorModalOpen(true)}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none', background: '#16a34a',
                      color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                      boxShadow: '0 2px 8px rgba(22,163,74,0.2)'
                    }}
                  >
                    ⚡ Espelhar no Portal
                  </button>
                  <button
                    onClick={handleSaveAttendanceSession}
                    style={{
                      padding: '7px 16px', borderRadius: 8, border: 'none', background: '#8b5e3c',
                      color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                    }}
                  >
                    <i className="ti ti-device-floppy" /> Salvar Chamada
                  </button>
                </div>
              )}
            </div>

            {/* Linha 1: Filtros de Escola, Turma e Busca */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, paddingTop: 6 }}>
              {/* Escola */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 4 }}>
                  🏫 Escola:
                </label>
                <select
                  value={selectedSchool}
                  onChange={e => {
                    const sch = e.target.value
                    setSelectedSchool(sch)
                    const matching = sch === 'all' ? classes : classes.filter(c => c.schoolId === sch)
                    if (matching.length > 0) setSelectedClass(matching[0].id)
                    else setSelectedClass('')
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 12.5, fontWeight: 600, outline: 'none', color: '#2c1a0e' }}
                >
                  <option value="all">🏫 Todas as Escolas</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>🏫 {s.name}</option>
                  ))}
                </select>
              </div>

              {/* Turma */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 4 }}>
                  👥 Turma:
                </label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 12.5, fontWeight: 700, outline: 'none', color: '#2c1a0e' }}
                >
                  <option value="">Selecione uma turma...</option>
                  {filteredClasses.map(c => {
                    const schName = schools.find(s => s.id === c.schoolId)?.name
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} {schName ? `(${schName})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Busca de Aluno */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 4 }}>
                  🔍 Filtrar Aluno:
                </label>
                <input
                  placeholder="Buscar pelo nome do aluno..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 12.5, outline: 'none', color: '#2c1a0e' }}
                />
              </div>
            </div>

            {/* Linha 2: Barra de Dia da Semana & Horário da Aula */}
            <div style={{
              background: '#faf6f0',
              borderRadius: 14,
              padding: '12px 16px',
              border: '1px solid #ede8dc',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                {/* Seletor Visual de Dias da Semana (Seg a Sáb) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', marginRight: 4 }}>
                    📅 Dia da Semana:
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { id: 1, label: 'Seg' },
                      { id: 2, label: 'Ter' },
                      { id: 3, label: 'Qua' },
                      { id: 4, label: 'Qui' },
                      { id: 5, label: 'Sex' },
                      { id: 6, label: 'Sáb' },
                    ].map(d => {
                      const isSel = dayOfWeekIndex === d.id
                      return (
                        <button
                          key={d.id}
                          onClick={() => handleSelectDayOfWeek(d.id)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: isSel ? '2px solid #8b5e3c' : '1px solid #d5c8bb',
                            background: isSel ? '#2c1a0e' : '#fff',
                            color: isSel ? '#fff' : '#665c54',
                            fontSize: 11.5,
                            fontWeight: isSel ? 800 : 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>

                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 11.5, fontWeight: 700, color: '#2c1a0e', outline: 'none', marginLeft: 4 }}
                  />
                </div>

                {/* Seletor de Horário da Aula */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                    🕒 Horário da Aula:
                  </span>
                  {!isCustomTime ? (
                    <select
                      value={selectedTimeSlot}
                      onChange={e => {
                        if (e.target.value === 'custom') {
                          setIsCustomTime(true)
                        } else {
                          setSelectedTimeSlot(e.target.value)
                        }
                      }}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12, fontWeight: 700, color: '#2c1a0e', outline: 'none' }}
                    >
                      {availableTimeSlots.map((slot, i) => (
                        <option key={i} value={slot}>{slot}</option>
                      ))}
                      <option value="custom">✍️ Outro horário...</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        value={customTime}
                        onChange={e => setCustomTime(e.target.value)}
                        placeholder="Ex: 08:00 - 08:50"
                        style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12, fontWeight: 700, color: '#2c1a0e', width: 120, outline: 'none' }}
                      />
                      <button
                        onClick={() => setIsCustomTime(false)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#d5c8bb', fontSize: 10, cursor: 'pointer' }}
                      >
                        Padrão
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Banner de Contexto Ativo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#2c1a0e', fontWeight: 600 }}>
                <span style={{ background: '#fff', padding: '3px 8px', borderRadius: 6, border: '1px solid #ede8dc' }}>
                  🗓️ <strong>{formattedFullDate}</strong>
                </span>
                <span style={{ background: '#fff', padding: '3px 8px', borderRadius: 6, border: '1px solid #ede8dc' }}>
                  ⏰ <strong>{isCustomTime ? customTime : selectedTimeSlot}</strong>
                </span>
                {selectedClassObj && (
                  <span style={{ background: '#2c1a0e', color: '#fff', padding: '3px 8px', borderRadius: 6 }}>
                    👥 <strong>{selectedClassObj.name}</strong> {selectedSchoolObj ? `(${selectedSchoolObj.name})` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 2: DADOS DE PRESENÇA GERADOS NO TOPO DA FUNÇÃO (KPIS)
             ══════════════════════════════════════════════════════════════════════ */}
          {selectedClass && (
            <div style={{
              background: '#fff',
              borderRadius: 18,
              padding: '16px 20px',
              border: '1px solid #ede8dc',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📊 Estatísticas de Presença em Tempo Real
                  </span>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#2c1a0e', marginTop: 1 }}>
                    {dayOfWeekObj.full} · {isCustomTime ? customTime : selectedTimeSlot} · {selectedClassObj?.name}
                  </div>
                </div>

                {/* Ações em Lote de 1 Clique */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleMarkAllPresent}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: 'none', background: '#dcfce7',
                      color: '#16a34a', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <i className="ti ti-check" /> Todos PRESENÇA
                  </button>
                  <button
                    onClick={handleMarkAllAbsent}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fee2e2',
                      color: '#dc2626', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <i className="ti ti-x" /> Todos FALTA
                  </button>
                  <button
                    onClick={handleInvertAttendance}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid #ede8dc', background: '#faf6f0',
                      color: '#665c54', fontSize: 11.5, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    🔄 Inverter
                  </button>
                </div>
              </div>

              {/* Cards de Métricas Principais */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                {/* Total */}
                <div style={{ background: '#faf6f0', borderRadius: 12, padding: '10px 14px', border: '1px solid #ede8dc' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#665c54', textTransform: 'uppercase' }}>👥 Total de Alunos</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#2c1a0e', marginTop: 2 }}>{metrics.total}</div>
                </div>

                {/* Ponto 1: Presenças */}
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '10px 14px', border: '1.5px solid #86efac' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase' }}>🟢 Presenças</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginTop: 2 }}>
                    {metrics.present} <span style={{ fontSize: 12, fontWeight: 700 }}>({metrics.presentPct}%)</span>
                  </div>
                </div>

                {/* Ponto 2: Faltas */}
                <div style={{ background: '#fef2f2', borderRadius: 12, padding: '10px 14px', border: '1.5px solid #fca5a5' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#dc2626', textTransform: 'uppercase' }}>🔴 Faltas</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c', marginTop: 2 }}>
                    {metrics.absent} <span style={{ fontSize: 12, fontWeight: 700 }}>({metrics.absentPct}%)</span>
                  </div>
                </div>

                {/* Taxa Global de Frequência */}
                <div style={{ background: '#2c1a0e', borderRadius: 12, padding: '10px 14px', color: '#fff' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#fef3c7', textTransform: 'uppercase' }}>📈 Taxa da Aula</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 2 }}>{metrics.attendanceRate}%</div>
                </div>
              </div>

              {/* Barra Multicor Visual de Frequência */}
              <div style={{ width: '100%', height: 10, background: '#ede8dc', borderRadius: 99, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${metrics.presentPct}%`, background: '#16a34a', transition: 'width 0.25s ease' }} title={`Presenças: ${metrics.presentPct}%`} />
                <div style={{ width: `${metrics.absentPct}%`, background: '#dc2626', transition: 'width 0.25s ease' }} title={`Faltas: ${metrics.absentPct}%`} />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 3: TABELA DE 1 CLIQUE COM 2 PONTOS (PRESENÇA vs FALTA)
             ══════════════════════════════════════════════════════════════════════ */}
          {!selectedClass ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '60px 20px', background: '#fff', borderRadius: 18, border: '1px solid #ede8dc', color: '#8b5e3c', gap: 12
            }}>
              <i className="ti ti-checklist" style={{ fontSize: 54, opacity: 0.6 }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                Selecione uma turma para iniciar a lista de presença
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#665c54' }}>
                Escolha a escola e turma nos campos acima para marcar presenças e faltas com apenas 1 clique.
              </p>
            </div>
          ) : activeTab === 'daily' ? (
            /* 1. TABELA DE 2 PONTOS: PRESENÇA OU FALTA */
            <div style={{
              background: '#fff',
              borderRadius: 18,
              padding: '18px 22px',
              border: '1px solid #ede8dc',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#2c1a0e' }}>
                    Chamada Rápida — 2 Pontos por Aluno ({displayedStudents.length} alunos)
                  </h3>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#665c54', marginTop: 2 }}>
                    Dica: Clique diretamente no botão <strong>PRESENÇA</strong> ou <strong>FALTA</strong> com 1 clique para alterar o estado do aluno.
                  </p>
                </div>
              </div>

              {/* Grid / Tabela de Alunos com 2 Pontos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayedStudents.map((student, idx) => {
                  const record = attendance[student.id] || { status: 'present' }
                  const isPresent = record.status === 'present'
                  const isAbsent = record.status === 'absent'

                  return (
                    <div
                      key={student.id}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 12,
                        background: isPresent ? '#f0fdf4' : isAbsent ? '#fef2f2' : '#faf6f0',
                        border: `1.5px solid ${isPresent ? '#86efac' : isAbsent ? '#fca5a5' : '#ede8dc'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Identificação do Aluno */}
                      <div
                        onClick={() => toggleStudentStatus(student.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220, cursor: 'pointer' }}
                      >
                        <span style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: isPresent ? '#15803d' : isAbsent ? '#b91c1c' : '#8b5e3c',
                          width: 24
                        }}>
                          #{idx + 1}
                        </span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>
                            {student.name}
                          </div>
                          <div style={{ fontSize: 11, color: isPresent ? '#16a34a' : isAbsent ? '#dc2626' : '#665c54', fontWeight: 600 }}>
                            {isPresent ? '🟢 Presente' : isAbsent ? '🔴 Falta' : 'Não Marcado'}
                            {record.timeMarked ? ` · ${record.timeMarked}` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Observação / Justificativa Opcional */}
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <input
                          placeholder="Adicionar observação..."
                          value={record.note || ''}
                          onChange={e => setStudentNote(student.id, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid #d5c8bb',
                            background: '#fff',
                            fontSize: 12,
                            outline: 'none',
                            color: '#2c1a0e'
                          }}
                        />
                      </div>

                      {/* 2 PONTOS NA TABELA: [ PRESENÇA ] vs [ FALTA ] */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {/* Ponto 1: PRESENÇA */}
                        <button
                          onClick={() => setStudentStatus(student.id, 'present')}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 10,
                            border: isPresent ? '2px solid #16a34a' : '1px solid #d5c8bb',
                            background: isPresent ? '#16a34a' : '#fff',
                            color: isPresent ? '#fff' : '#16a34a',
                            fontWeight: 800,
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: isPresent ? '0 2px 8px rgba(22,163,74,0.3)' : 'none',
                            transform: isPresent ? 'scale(1.03)' : 'scale(1)',
                            transition: 'all 0.15s ease'
                          }}
                          title="Marcar Presença"
                        >
                          <i className="ti ti-check" style={{ fontSize: 14 }} />
                          PRESENÇA
                        </button>

                        {/* Ponto 2: FALTA */}
                        <button
                          onClick={() => setStudentStatus(student.id, 'absent')}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 10,
                            border: isAbsent ? '2px solid #dc2626' : '1px solid #d5c8bb',
                            background: isAbsent ? '#dc2626' : '#fff',
                            color: isAbsent ? '#fff' : '#dc2626',
                            fontWeight: 800,
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: isAbsent ? '0 2px 8px rgba(220,38,38,0.3)' : 'none',
                            transform: isAbsent ? 'scale(1.03)' : 'scale(1)',
                            transition: 'all 0.15s ease'
                          }}
                          title="Marcar Falta"
                        >
                          <i className="ti ti-x" style={{ fontSize: 14 }} />
                          FALTA
                        </button>
                      </div>
                    </div>
                  )
                })}

                {displayedStudents.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#665c54', fontSize: 13 }}>
                    Nenhum aluno encontrado para os critérios de busca.
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'report' ? (
            /* 2. RELATÓRIO DE ASSIDUIDADE */
            <div style={{
              background: '#fff',
              borderRadius: 18,
              padding: '18px 22px',
              border: '1px solid #ede8dc',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)'
            }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: 15.5, fontWeight: 800, color: '#2c1a0e' }}>
                📊 Relatório de Assiduidade Acumulada — {selectedClassObj?.name}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {studentAttendanceStats.map(stat => (
                  <div
                    key={stat.student.id}
                    style={{
                      padding: '12px 14px', borderRadius: 12, background: '#faf6f0', border: '1px solid #ede8dc',
                      display: 'flex', flexDirection: 'column', gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13.5, color: '#2c1a0e' }}>{stat.student.name}</strong>
                      <span style={{
                        fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                        background: stat.rate >= 75 ? '#dcfce7' : '#fee2e2',
                        color: stat.rate >= 75 ? '#16a34a' : '#dc2626'
                      }}>
                        {stat.rate}% Frequência
                      </span>
                    </div>

                    <div style={{ fontSize: 11.5, color: '#665c54', display: 'flex', gap: 14 }}>
                      <span>Presenças: <strong style={{ color: '#16a34a' }}>{stat.attended}</strong></span>
                      <span>Faltas: <strong style={{ color: '#dc2626' }}>{stat.absents}</strong></span>
                      <span>Total Aulas: <strong>{stat.totalSessions}</strong></span>
                    </div>

                    <div style={{ width: '100%', height: 6, background: '#ede8dc', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${stat.rate}%`, height: '100%', background: stat.rate >= 75 ? '#16a34a' : '#dc2626' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* 3. HISTÓRICO DE SESSÕES */
            <div style={{
              background: '#fff',
              borderRadius: 18,
              padding: '18px 22px',
              border: '1px solid #ede8dc',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)'
            }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: 15.5, fontWeight: 800, color: '#2c1a0e' }}>
                📜 Histórico de Sessões de Chamada — {selectedClassObj?.name}
              </h3>

              {attendanceHistory.filter(h => h.classId === selectedClass).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#665c54', fontSize: 13 }}>
                  Nenhuma sessão anterior gravada para esta turma.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {attendanceHistory.filter(h => h.classId === selectedClass).map(session => (
                    <div
                      key={session.id}
                      style={{
                        padding: '12px 16px', borderRadius: 12, background: '#faf6f0', border: '1px solid #ede8dc',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2c1a0e' }}>
                          📅 {session.dayOfWeekName || 'Dia'} · {session.date.split('-').reverse().join('/')} · {session.timeSlot || 'Horário Padrão'}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#665c54', marginTop: 2 }}>
                          Presenças: <strong style={{ color: '#16a34a' }}>{session.presentCount}</strong> · Faltas: <strong style={{ color: '#dc2626' }}>{session.absentCount}</strong> · Total: {session.totalStudents} alunos
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '4px 10px', borderRadius: 8 }}>
                          {session.attendanceRate}% Presença
                        </span>
                        <button
                          onClick={() => {
                            setSelectedDate(session.date)
                            if (session.timeSlot) setSelectedTimeSlot(session.timeSlot)
                            setActiveTab('daily')
                          }}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', color: '#2c1a0e', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Abrir Chamada
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              MODAL: ESPELHAR NO PORTAL ESCOLAR
             ══════════════════════════════════════════════════════════════════════ */}
          {isMirrorModalOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ background: '#fff', borderRadius: 20, padding: 26, width: 480, maxWidth: '95vw', border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2c1a0e' }}>
                    ⚡ Espelhar Lista de Presença no Portal
                  </h2>
                  <button onClick={() => setIsMirrorModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <p style={{ fontSize: 12.5, color: '#665c54', margin: 0, lineHeight: 1.4 }}>
                  Transfira a lista de presença da turma <strong>{selectedClassObj?.name}</strong> para o portal oficial no Chrome sem digitação manual.
                </p>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#2c1a0e', display: 'block', marginBottom: 4 }}>
                    Portal de Destino:
                  </label>
                  <select
                    value={selectedMirrorPortal}
                    onChange={e => setSelectedMirrorPortal(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 12.5 }}
                  >
                    <option value="plural">Plurall (SOMOS Educação)</option>
                    <option value="machado">Portal Machado Sobrinho</option>
                    <option value="santacatarina">Rede Santa Catarina</option>
                    <option value="google_classroom">Google Classroom</option>
                  </select>
                </div>

                <div style={{ background: '#faf6f0', padding: 12, borderRadius: 10, fontSize: 12, color: '#2c1a0e' }}>
                  <div><strong>Presentes ({metrics.present}):</strong> {classStudents.filter(s => attendance[s.id]?.status === 'present').length} alunos</div>
                  <div><strong>Ausentes ({metrics.absent}):</strong> {classStudents.filter(s => attendance[s.id]?.status === 'absent').map(s => s.name).join(', ') || 'Nenhum'}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <button onClick={() => setIsMirrorModalOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={handleExecuteMirrorAttendance} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Preencher Portal Agora
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {toastMessage && (
            <div style={{
              position: 'fixed', bottom: 20, right: 20, padding: '12px 20px', background: '#2c1a0e', color: '#fff',
              borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 999999, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <i className="ti ti-check" />
              {toastMessage}
            </div>
          )}

        </ModuleShell>
      </div>
    </div>
  )
}
