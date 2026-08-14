'use client';

import React, { useState, useEffect, CSSProperties } from 'react';

// --- Types ---
interface ClassItem {
  id: string;
  name: string;
  level: string;
  color?: string;
}

type PrepStatus = 'unplanned' | 'draft' | 'ready';

interface ScheduleItem {
  id: string;
  dayOfWeek: number; // 1 (Mon) to 6 (Sat)
  timeStart: string;
  timeEnd: string;
  classId: string;
  status: PrepStatus;
  topic?: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

// --- Constants ---
const DAYS = [
  { id: 1, name: 'Segunda-feira' },
  { id: 2, name: 'Terça-feira' },
  { id: 3, name: 'Quarta-feira' },
  { id: 4, name: 'Quinta-feira' },
  { id: 5, name: 'Sexta-feira' },
  { id: 6, name: 'Sábado' },
];

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { id: '1', text: 'Corrigir redações do 8º Ano', completed: false },
  { id: '2', text: 'Lançar notas no portal', completed: true },
  { id: '3', text: 'Preparar Quiz de Vocabulary', completed: false },
];

export default function WeeklyAgenda() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    try {
      // 1. Load Classes
      const savedClasses = localStorage.getItem('teacher_classes');
      let loadedClasses: ClassItem[] = [];
      if (savedClasses) {
        loadedClasses = JSON.parse(savedClasses);
      } else {
        // Fallback fake classes
        loadedClasses = [
          { id: 'c1', name: '7º Ano A', level: 'Básico', color: COLORS[0] },
          { id: 'c2', name: '8º Ano B', level: 'Intermediário', color: COLORS[1] },
          { id: 'c3', name: '9º Ano C', level: 'Avançado', color: COLORS[2] },
        ];
        localStorage.setItem('teacher_classes', JSON.stringify(loadedClasses));
      }
      setClasses(loadedClasses);

      // 2. Load Schedule
      const savedSchedule = localStorage.getItem('teacher_agenda_schedule');
      if (savedSchedule) {
        setSchedule(JSON.parse(savedSchedule));
      } else {
        const defaultSchedule: ScheduleItem[] = [
          { id: 's1', dayOfWeek: 1, timeStart: '07:30', timeEnd: '08:20', classId: 'c1', status: 'ready', topic: 'Verb To Be' },
          { id: 's2', dayOfWeek: 1, timeStart: '08:20', timeEnd: '09:10', classId: 'c2', status: 'draft', topic: 'Simple Past' },
          { id: 's3', dayOfWeek: 2, timeStart: '10:00', timeEnd: '10:50', classId: 'c3', status: 'unplanned' },
        ];
        setSchedule(defaultSchedule);
        localStorage.setItem('teacher_agenda_schedule', JSON.stringify(defaultSchedule));
      }

      // 3. Load Checklist
      const savedChecklist = localStorage.getItem('teacher_agenda_checklist');
      if (savedChecklist) {
        setChecklist(JSON.parse(savedChecklist));
      } else {
        setChecklist(INITIAL_CHECKLIST);
        localStorage.setItem('teacher_agenda_checklist', JSON.stringify(INITIAL_CHECKLIST));
      }

      setIsLoaded(true);
    } catch (error) {
      console.error('Error loading agenda data', error);
      setIsLoaded(true);
    }
  }, []);

  // Save Schedule automatically
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('teacher_agenda_schedule', JSON.stringify(schedule));
    }
  }, [schedule, isLoaded]);

  // Save Checklist automatically
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('teacher_agenda_checklist', JSON.stringify(checklist));
    }
  }, [checklist, isLoaded]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const cycleStatus = (id: string) => {
    setSchedule(prev => prev.map(item => {
      if (item.id === id) {
        const nextStatus: Record<PrepStatus, PrepStatus> = {
          unplanned: 'draft',
          draft: 'ready',
          ready: 'unplanned'
        };
        const newStatus = nextStatus[item.status];
        showToast(`Status atualizado para: ${newStatus === 'unplanned' ? 'Não Planejada' : newStatus === 'draft' ? 'Rascunho' : 'Pronta'}`);
        return { ...item, status: newStatus };
      }
      return item;
    }));
  };

  const handleLessonPlanClick = (item: ScheduleItem, cls?: ClassItem) => {
    showToast(`Abrindo plano de aula para ${cls?.name || 'Turma'} (${item.timeStart})...`);
    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'plan' }))
  };

  const toggleChecklist = (id: string) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, completed: !item.completed } : item));
  };

  const handleAddChecklist = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
      const newItem: ChecklistItem = {
        id: Date.now().toString(),
        text: e.currentTarget.value.trim(),
        completed: false
      };
      setChecklist([...checklist, newItem]);
      e.currentTarget.value = '';
      showToast('Tarefa adicionada à checklist!');
    }
  };

  const totalClasses = schedule.length;
  const preppedClasses = schedule.filter(s => s.status === 'ready').length;
  const prepPercentage = totalClasses === 0 ? 0 : Math.round((preppedClasses / totalClasses) * 100);
  const uniqueClassesAttended = new Set(schedule.map(s => s.classId)).size;

  if (!isLoaded) return <div style={{ color: '#2c1a0e', padding: '2rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Carregando Agenda...</div>;

  // --- Render Helpers ---
  const renderStatusBadge = (status: PrepStatus) => {
    switch (status) {
      case 'unplanned':
        return <span style={{ ...styles.badge, backgroundColor: 'rgba(168,50,50,0.12)', color: '#a83232' }} title="Não Planejada"><i className="ti ti-circle-x" style={{ marginRight: '4px' }}></i>Não Planejado</span>;
      case 'draft':
        return <span style={{ ...styles.badge, backgroundColor: 'rgba(200,122,30,0.12)', color: '#c87a1e' }} title="Em Rascunho"><i className="ti ti-pencil" style={{ marginRight: '4px' }}></i>Rascunho</span>;
      case 'ready':
        return <span style={{ ...styles.badge, backgroundColor: 'rgba(61,122,78,0.12)', color: '#3d7a4e' }} title="Pronta!"><i className="ti ti-check" style={{ marginRight: '4px' }}></i>Pronta!</span>;
    }
  };

  return (
    <div style={styles.container}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={styles.toast}>
          <i className="ti ti-info-circle"></i> {toastMessage}
        </div>
      )}

      {/* Header & Summary */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <h1 style={styles.title}><i className="ti ti-calendar-stats" style={{ marginRight: '8px' }}></i>Agenda Semanal</h1>
          <p style={styles.subtitle}>Visão geral de aulas, planejamento e tarefas da semana.</p>
        </div>

        <div style={styles.summaryContainer}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryIconWrapper}><i className="ti ti-books" style={{ color: '#8b5e3c', fontSize: '1.5rem' }}></i></div>
            <div style={styles.summaryContent}>
              <span style={styles.summaryValue}>{totalClasses}</span>
              <span style={styles.summaryLabel}>Total de Aulas</span>
            </div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryIconWrapper}><i className="ti ti-chart-pie" style={{ color: '#3d7a4e', fontSize: '1.5rem' }}></i></div>
            <div style={styles.summaryContent}>
              <span style={styles.summaryValue}>{prepPercentage}%</span>
              <span style={styles.summaryLabel}>Aulas Preparadas</span>
            </div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryIconWrapper}><i className="ti ti-users" style={{ color: '#2a6080', fontSize: '1.5rem' }}></i></div>
            <div style={styles.summaryContent}>
              <span style={styles.summaryValue}>{uniqueClassesAttended}</span>
              <span style={styles.summaryLabel}>Turmas Atendidas</span>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.layout}>
        {/* Main Grid */}
        <div style={styles.mainContent}>
          <div style={styles.gridContainer}>
            {DAYS.map(day => {
              const daySchedule = schedule
                .filter(s => s.dayOfWeek === day.id)
                .sort((a, b) => a.timeStart.localeCompare(b.timeStart));
              
              return (
                <div key={day.id} style={styles.dayColumn}>
                  <div style={styles.dayHeader}>
                    <span style={styles.dayTitle}>{day.name}</span>
                    <span style={styles.dayCount}>{daySchedule.length} aulas</span>
                  </div>
                  
                  <div style={styles.dayContent}>
                    {daySchedule.length === 0 ? (
                      <div style={styles.emptyDay}>Livre</div>
                    ) : (
                      daySchedule.map(item => {
                        const cls = classes.find(c => c.id === item.classId);
                        const cardColor = cls?.color || '#8b5e3c';
                        
                        return (
                          <div key={item.id} style={{ ...styles.lessonCard, borderLeftColor: cardColor }}>
                            <div style={styles.lessonHeader}>
                              <span style={styles.lessonTime}>{item.timeStart} - {item.timeEnd}</span>
                              <div onClick={(e) => { e.stopPropagation(); cycleStatus(item.id); }} style={{ cursor: 'pointer' }}>
                                {renderStatusBadge(item.status)}
                              </div>
                            </div>
                            
                            <div style={styles.lessonBody} onClick={() => handleLessonPlanClick(item, cls)}>
                              <h3 style={{ ...styles.lessonClassName, color: cardColor }}>{cls?.name || 'Turma Desconhecida'}</h3>
                              {item.topic && <p style={styles.lessonTopic}>{item.topic}</p>}
                            </div>
                            
                            <div style={styles.lessonFooter} onClick={(e) => { e.stopPropagation(); handleLessonPlanClick(item, cls); }}>
                              <span style={styles.planLink}><i className="ti ti-file-text"></i> Abrir Plano de Aula</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar - Checklist */}
        <div style={styles.sidebar}>
          <div style={styles.checklistCard}>
            <div style={styles.checklistHeader}>
              <h2 style={styles.checklistTitle}><i className="ti ti-list-check" style={{ marginRight: '8px', color: '#8b5e3c' }}></i>Checklist Semanal</h2>
            </div>
            
            <div style={styles.checklistInputContainer}>
              <i className="ti ti-plus" style={{ position: 'absolute', left: '12px', top: '10px', color: '#a08060' }}></i>
              <input 
                type="text" 
                placeholder="Adicionar nova tarefa... (Enter)" 
                style={styles.checklistInput}
                onKeyDown={handleAddChecklist}
              />
            </div>

            <div style={styles.checklistItems}>
              {checklist.length === 0 ? (
                <p style={{ color: '#a08060', fontSize: '0.9rem', textAlign: 'center', marginTop: '1rem' }}>Nenhuma tarefa pendente.</p>
              ) : (
                checklist.map(item => (
                  <div key={item.id} style={styles.checklistItem} onClick={() => toggleChecklist(item.id)}>
                    <div style={{
                      ...styles.checkbox,
                      backgroundColor: item.completed ? '#8b5e3c' : 'transparent',
                      borderColor: item.completed ? '#8b5e3c' : '#c4a882'
                    }}>
                      {item.completed && <i className="ti ti-check" style={{ color: '#fffcf8', fontSize: '0.8rem' }}></i>}
                    </div>
                    <span style={{
                      ...styles.checklistText,
                      textDecoration: item.completed ? 'line-through' : 'none',
                      color: item.completed ? '#a08060' : '#2c1a0e'
                    }}>{item.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Inline Styles ---
const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: '#fdf8f2',
    color: '#2c1a0e',
    minHeight: '100%',
    padding: '24px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    position: 'relative'
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    backgroundColor: '#8b5e3c',
    color: '#fffcf8',
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(44,26,14,0.15)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 1000,
    fontWeight: 600,
    animation: 'fadeIn 0.3s ease-out',
    fontFamily: "'Plus Jakarta Sans', sans-serif"
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '32px',
    borderBottom: '1px solid rgba(139,115,85,0.12)',
    paddingBottom: '24px'
  },
  titleSection: {
    flex: '1 1 300px'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    margin: '0 0 8px 0',
    color: '#2c1a0e',
    fontFamily: "'Fraunces', Georgia, serif",
    display: 'flex',
    alignItems: 'center'
  },
  subtitle: {
    margin: 0,
    color: '#7a5c42',
    fontSize: '1rem'
  },
  summaryContainer: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap'
  },
  summaryCard: {
    backgroundColor: '#fffcf8',
    border: '1px solid rgba(139,115,85,0.12)',
    borderRadius: '12px',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    minWidth: '160px',
    boxShadow: '0 2px 8px rgba(44,26,14,0.04)'
  },
  summaryIconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: '#f5efe6',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    border: '1px solid rgba(139,115,85,0.08)'
  },
  summaryContent: {
    display: 'flex',
    flexDirection: 'column'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#2c1a0e',
    lineHeight: 1.2
  },
  summaryLabel: {
    fontSize: '0.8rem',
    color: '#a08060',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600
  },
  layout: {
    display: 'flex',
    gap: '24px',
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  mainContent: {
    flex: '1 1 0%',
    minWidth: 0,
    backgroundColor: '#fffcf8',
    borderRadius: '16px',
    border: '1px solid rgba(139,115,85,0.12)',
    boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
    overflow: 'hidden'
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '1px',
    backgroundColor: 'rgba(139,115,85,0.12)', // grid lines
  },
  dayColumn: {
    backgroundColor: '#fffcf8',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '400px'
  },
  dayHeader: {
    padding: '16px 12px',
    backgroundColor: '#f5efe6',
    borderBottom: '1px solid rgba(139,115,85,0.12)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center'
  },
  dayTitle: {
    fontWeight: 600,
    color: '#2c1a0e',
    fontSize: '0.95rem',
    marginBottom: '6px'
  },
  dayCount: {
    fontSize: '0.75rem',
    color: '#7a5c42',
    backgroundColor: '#fffcf8',
    padding: '2px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(139,115,85,0.08)'
  },
  dayContent: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1
  },
  emptyDay: {
    textAlign: 'center',
    color: '#a08060',
    fontSize: '0.9rem',
    marginTop: '20px',
    fontStyle: 'italic'
  },
  lessonCard: {
    backgroundColor: '#f5efe6',
    border: '1px solid rgba(139,115,85,0.16)',
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'pointer'
  },
  lessonHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  lessonTime: {
    fontSize: '0.75rem',
    color: '#7a5c42',
    fontWeight: 600
  },
  badge: {
    fontSize: '0.65rem',
    padding: '3px 8px',
    borderRadius: '99px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none'
  },
  lessonBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  lessonClassName: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700
  },
  lessonTopic: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#5c3d20',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  lessonFooter: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px dashed rgba(139,115,85,0.2)',
    display: 'flex',
    justifyContent: 'flex-start'
  },
  planLink: {
    fontSize: '0.8rem',
    color: '#8b5e3c',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  sidebar: {
    width: '320px',
    flexShrink: 0
  },
  checklistCard: {
    backgroundColor: '#fffcf8',
    borderRadius: '16px',
    border: '1px solid rgba(139,115,85,0.12)',
    boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  },
  checklistHeader: {
    marginBottom: '20px'
  },
  checklistTitle: {
    margin: 0,
    fontSize: '1.25rem',
    color: '#2c1a0e',
    display: 'flex',
    alignItems: 'center',
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: 700
  },
  checklistInputContainer: {
    position: 'relative',
    marginBottom: '20px'
  },
  checklistInput: {
    width: '100%',
    backgroundColor: '#f5efe6',
    border: '1px solid rgba(139,115,85,0.18)',
    borderRadius: '8px',
    padding: '10px 12px 10px 36px',
    color: '#2c1a0e',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: "'Plus Jakarta Sans', sans-serif"
  },
  checklistItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  checklistItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    backgroundColor: '#fffcf8',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(44,26,14,0.04)'
  },
  checkbox: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    borderWidth: '2px',
    borderStyle: 'solid',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    transition: 'all 0.2s'
  },
  checklistText: {
    fontSize: '0.9rem',
    flex: 1,
    lineHeight: 1.4,
    transition: 'color 0.2s'
  }
};
