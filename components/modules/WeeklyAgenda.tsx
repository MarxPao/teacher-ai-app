'use client';
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useMemo, CSSProperties } from 'react';
import { syncToSupabase, loadFromSupabase } from '@/lib/supabaseClient';

// --- Interfaces & Types ---
export interface ClassRecord {
  id: string;
  name: string;
  schoolId?: string;
  grade?: string;
  color?: string;
}

export type PrepStatus = 'unplanned' | 'draft' | 'ready';

export interface ScheduleItem {
  id: string;
  dayOfWeek: number; // 1 (Mon) to 6 (Sat), 0 (Sun)
  timeStart: string;
  timeEnd: string;
  classId: string;
  className?: string;
  topic: string;
  status: PrepStatus;
  notes?: string;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

const DAYS = [
  { id: 1, name: 'Segunda-feira', short: 'Seg' },
  { id: 2, name: 'Terça-feira', short: 'Ter' },
  { id: 3, name: 'Quarta-feira', short: 'Qua' },
  { id: 4, name: 'Quinta-feira', short: 'Qui' },
  { id: 5, name: 'Sexta-feira', short: 'Sex' },
  { id: 6, name: 'Sábado', short: 'Sáb' },
];

const PALETTE = ['#8b5e3c', '#268bd2', '#859900', '#b58900', '#d33682', '#6c71c4', '#2aa198', '#dc322f'];

export default function WeeklyAgenda() {
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters
  const [filterClass, setFilterClass] = useState<string>('all');
  const [searchTopic, setSearchTopic] = useState<string>('');

  // Modal State (Add / Edit Schedule Post)
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduleItem | null>(null);

  // Form Fields
  const [formTopic, setFormTopic] = useState('');
  const [formClassId, setFormClassId] = useState('');
  const [formCustomClassName, setFormCustomClassName] = useState('');
  const [formDay, setFormDay] = useState<number>(1);
  const [formTimeStart, setFormTimeStart] = useState('07:30');
  const [formTimeEnd, setFormTimeEnd] = useState('08:20');
  const [formStatus, setFormStatus] = useState<PrepStatus>('unplanned');
  const [formNotes, setFormNotes] = useState('');
  const [formColor, setFormColor] = useState(PALETTE[0]);

  // Delete Confirmation Modal
  const [postToDelete, setPostToDelete] = useState<ScheduleItem | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Load Initial Data (LocalStorage + Supabase)
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load Real Classes
        const savedClasses = localStorage.getItem('teacher_classes');
        let loadedClasses: ClassRecord[] = [];
        if (savedClasses) {
          loadedClasses = JSON.parse(savedClasses);
          setClasses(loadedClasses);
        }

        // Load Real Schedule Posts (NO fake dummy items)
        const savedSchedule = localStorage.getItem('teacher_agenda_schedule');
        if (savedSchedule) {
          try {
            const parsed = JSON.parse(savedSchedule);
            if (Array.isArray(parsed)) {
              setSchedule(parsed);
            }
          } catch {}
        }

        // Load Real Checklist
        const savedChecklist = localStorage.getItem('teacher_agenda_checklist');
        if (savedChecklist) {
          try {
            const parsed = JSON.parse(savedChecklist);
            if (Array.isArray(parsed)) {
              setChecklist(parsed);
            }
          } catch {}
        }

        // Check Supabase Config
        const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const cfgStorage = localStorage.getItem('teacher_supabase_config');
        if (envUrl || cfgStorage) {
          setSupabaseConnected(true);
          // Attempt background pull from Supabase
          try {
            const res = await loadFromSupabase();
            if (res.ok) {
              const freshSchedule = localStorage.getItem('teacher_agenda_schedule');
              if (freshSchedule) setSchedule(JSON.parse(freshSchedule));
              const freshChecklist = localStorage.getItem('teacher_agenda_checklist');
              if (freshChecklist) setChecklist(JSON.parse(freshChecklist));
            }
          } catch (e) {
            console.log('Supabase sync background notice:', e);
          }
        }

        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading agenda data', error);
        setIsLoaded(true);
      }
    };

    loadData();
  }, []);

  // Save Schedule automatically to LocalStorage & Supabase
  const persistSchedule = async (newSchedule: ScheduleItem[]) => {
    setSchedule(newSchedule);
    try {
      localStorage.setItem('teacher_agenda_schedule', JSON.stringify(newSchedule));
      if (supabaseConnected) {
        syncToSupabase({ teacher_agenda_schedule: newSchedule });
      }
    } catch (e) {
      console.error('Error persisting schedule:', e);
    }
  };

  // Save Checklist automatically
  const persistChecklist = async (newChecklist: ChecklistItem[]) => {
    setChecklist(newChecklist);
    try {
      localStorage.setItem('teacher_agenda_checklist', JSON.stringify(newChecklist));
      if (supabaseConnected) {
        syncToSupabase({ teacher_agenda_checklist: newChecklist });
      }
    } catch (e) {
      console.error('Error persisting checklist:', e);
    }
  };

  // Manual Sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncToSupabase({
        teacher_agenda_schedule: schedule,
        teacher_agenda_checklist: checklist,
      });
      if (res.ok) {
        showToast('☁️ Agenda sincronizada com o Supabase com sucesso!');
      } else {
        showToast(res.error ? `Erro: ${res.error}` : 'Não foi possível conectar ao Supabase.');
      }
    } catch {
      showToast('Erro ao sincronizar com o banco.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Open Add Modal
  const handleOpenAddModal = (defaultDay = 1) => {
    setEditingPost(null);
    setFormTopic('');
    setFormClassId(classes[0]?.id || 'custom');
    setFormCustomClassName('');
    setFormDay(defaultDay);
    setFormTimeStart('07:30');
    setFormTimeEnd('08:20');
    setFormStatus('unplanned');
    setFormNotes('');
    setFormColor(PALETTE[0]);
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item: ScheduleItem) => {
    setEditingPost(item);
    setFormTopic(item.topic || '');
    setFormClassId(item.classId || 'custom');
    setFormCustomClassName(item.className || '');
    setFormDay(item.dayOfWeek);
    setFormTimeStart(item.timeStart);
    setFormTimeEnd(item.timeEnd);
    setFormStatus(item.status);
    setFormNotes(item.notes || '');
    setFormColor(item.color || PALETTE[0]);
    setShowModal(true);
  };

  // Save Post Form (Create or Update)
  const handleSavePost = () => {
    if (!formTopic.trim()) {
      toast.success('Por favor, informe o tópico/título da postagem.');
      return;
    }

    const selectedCls = classes.find(c => c.id === formClassId);
    const resolvedClassName = selectedCls ? selectedCls.name : (formCustomClassName.trim() || 'Turma Geral');

    if (editingPost) {
      // Update existing post
      const updated = schedule.map(item => {
        if (item.id === editingPost.id) {
          return {
            ...item,
            topic: formTopic.trim(),
            classId: formClassId,
            className: resolvedClassName,
            dayOfWeek: formDay,
            timeStart: formTimeStart,
            timeEnd: formTimeEnd,
            status: formStatus,
            notes: formNotes.trim(),
            color: formColor,
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      });
      persistSchedule(updated);
      showToast('Postagem da agenda atualizada com sucesso!');
    } else {
      // Create new post
      const newPost: ScheduleItem = {
        id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        topic: formTopic.trim(),
        classId: formClassId,
        className: resolvedClassName,
        dayOfWeek: formDay,
        timeStart: formTimeStart,
        timeEnd: formTimeEnd,
        status: formStatus,
        notes: formNotes.trim(),
        color: formColor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      persistSchedule([...schedule, newPost]);
      showToast('Nova postagem agendada com sucesso!');
    }

    setShowModal(false);
  };

  // Delete Post
  const handleConfirmDelete = () => {
    if (!postToDelete) return;
    const filtered = schedule.filter(item => item.id !== postToDelete.id);
    persistSchedule(filtered);
    showToast(`Postagem "${postToDelete.topic}" excluída.`);
    setPostToDelete(null);
  };

  // Cycle Status
  const cycleStatus = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = schedule.map(item => {
      if (item.id === id) {
        const next: Record<PrepStatus, PrepStatus> = {
          unplanned: 'draft',
          draft: 'ready',
          ready: 'unplanned',
        };
        const nextStatus = next[item.status];
        return { ...item, status: nextStatus, updatedAt: new Date().toISOString() };
      }
      return item;
    });
    persistSchedule(updated);
  };

  // Checklist Actions
  const toggleChecklist = (id: string) => {
    const updated = checklist.map(item => item.id === id ? { ...item, completed: !item.completed } : item);
    persistChecklist(updated);
  };

  const handleAddChecklist = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
      const newItem: ChecklistItem = {
        id: `chk_${Date.now()}`,
        text: e.currentTarget.value.trim(),
        completed: false,
      };
      persistChecklist([...checklist, newItem]);
      e.currentTarget.value = '';
      showToast('Tarefa adicionada à checklist!');
    }
  };

  const handleDeleteChecklistItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = checklist.filter(item => item.id !== id);
    persistChecklist(updated);
  };

  // Computed Stats on Real Data
  const filteredSchedule = useMemo(() => {
    return schedule.filter(item => {
      const matchesClass = filterClass === 'all' || item.classId === filterClass;
      const matchesSearch = !searchTopic.trim() || 
        item.topic.toLowerCase().includes(searchTopic.toLowerCase()) ||
        (item.className && item.className.toLowerCase().includes(searchTopic.toLowerCase())) ||
        (item.notes && item.notes.toLowerCase().includes(searchTopic.toLowerCase()));
      return matchesClass && matchesSearch;
    });
  }, [schedule, filterClass, searchTopic]);

  const totalPosts = schedule.length;
  const preppedPosts = schedule.filter(s => s.status === 'ready').length;
  const prepPercentage = totalPosts === 0 ? 0 : Math.round((preppedPosts / totalPosts) * 100);
  const uniqueClassesCount = new Set(schedule.map(s => s.className || s.classId)).size;

  if (!isLoaded) {
    return (
      <div style={{ color: '#2c1a0e', padding: '3rem', fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'center' }}>
        <i className="ti ti-loader ti-spin" style={{ fontSize: '2rem', color: '#8b5e3c', marginBottom: '1rem', display: 'block' }} />
        Carregando Agenda Semanal...
      </div>
    );
  }

  const renderStatusBadge = (status: PrepStatus) => {
    switch (status) {
      case 'unplanned':
        return (
          <span style={{ ...styles.badge, backgroundColor: 'rgba(168,50,50,0.12)', color: '#a83232' }} title="Clique para alterar status">
            <i className="ti ti-circle-x" style={{ marginRight: '4px' }} /> Não Planejado
          </span>
        );
      case 'draft':
        return (
          <span style={{ ...styles.badge, backgroundColor: 'rgba(200,122,30,0.12)', color: '#c87a1e' }} title="Clique para alterar status">
            <i className="ti ti-pencil" style={{ marginRight: '4px' }} /> Rascunho
          </span>
        );
      case 'ready':
        return (
          <span style={{ ...styles.badge, backgroundColor: 'rgba(61,122,78,0.12)', color: '#3d7a4e' }} title="Clique para alterar status">
            <i className="ti ti-check" style={{ marginRight: '4px' }} /> Pronta!
          </span>
        );
    }
  };

  return (
    <div style={styles.container}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={styles.toast}>
          <i className="ti ti-info-circle" /> {toastMessage}
        </div>
      )}

      {/* Header & Controles */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={styles.title}>
              <i className="ti ti-calendar-time" style={{ marginRight: '8px', color: '#8b5e3c' }} />
              Agenda Semanal
            </h1>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: supabaseConnected ? '#e8f7ee' : '#f5efe6',
              color: supabaseConnected ? '#2d7a00' : '#7a5c42',
              border: `1px solid ${supabaseConnected ? 'rgba(45,122,0,0.2)' : 'rgba(139,115,85,0.15)'}`
            }}>
              <i className={supabaseConnected ? 'ti ti-cloud-check' : 'ti ti-device-floppy'} />
              {supabaseConnected ? 'Supabase Conectado' : 'Modo Local'}
            </span>
          </div>
          <p style={styles.subtitle}>
            Planejamento, agendamento de aulas e tarefas da semana sincronizados em tempo real.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleOpenAddModal(1)}
            style={styles.primaryBtn}
          >
            <i className="ti ti-plus" /> Nova Postagem / Aula
          </button>

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            style={styles.secondaryBtn}
            title="Sincronizar com o Supabase"
          >
            <i className={isSyncing ? 'ti ti-loader ti-spin' : 'ti ti-refresh'} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Nuvem'}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        {/* KPI Badges */}
        <div style={styles.summaryContainer}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryIconWrapper}>
              <i className="ti ti-calendar-event" style={{ color: '#8b5e3c', fontSize: '1.4rem' }} />
            </div>
            <div style={styles.summaryContent}>
              <span style={styles.summaryValue}>{totalPosts}</span>
              <span style={styles.summaryLabel}>Aulas Agendadas</span>
            </div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.summaryIconWrapper}>
              <i className="ti ti-circle-check" style={{ color: '#3d7a4e', fontSize: '1.4rem' }} />
            </div>
            <div style={styles.summaryContent}>
              <span style={styles.summaryValue}>{prepPercentage}%</span>
              <span style={styles.summaryLabel}>Aulas Preparadas</span>
            </div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.summaryIconWrapper}>
              <i className="ti ti-users" style={{ color: '#2a6080', fontSize: '1.4rem' }} />
            </div>
            <div style={styles.summaryContent}>
              <span style={styles.summaryValue}>{uniqueClassesCount}</span>
              <span style={styles.summaryLabel}>Turmas Atendidas</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filter by Class */}
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            style={styles.selectFilter}
          >
            <option value="all">Todas as Turmas ({schedule.length})</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Search Topic */}
          <div style={{ position: 'relative' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a08060', fontSize: 14 }} />
            <input
              type="text"
              placeholder="Buscar tópico ou conteúdo..."
              value={searchTopic}
              onChange={e => setSearchTopic(e.target.value)}
              style={styles.searchInput}
            />
          </div>
        </div>
      </div>

      {/* Main Layout: Grid + Checklist */}
      <div style={styles.layout}>
        {/* Weekly Grid (Columns) */}
        <div style={styles.mainContent}>
          <div style={styles.gridContainer}>
            {DAYS.map(day => {
              const daySchedule = filteredSchedule
                .filter(s => s.dayOfWeek === day.id)
                .sort((a, b) => a.timeStart.localeCompare(b.timeStart));

              return (
                <div key={day.id} style={styles.dayColumn}>
                  {/* Column Header */}
                  <div style={styles.dayHeader}>
                    <span style={styles.dayTitle}>{day.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={styles.dayCount}>{daySchedule.length} aulas</span>
                      <button
                        onClick={() => handleOpenAddModal(day.id)}
                        style={styles.inlineAddBtn}
                        title={`Adicionar aula na ${day.name}`}
                      >
                        <i className="ti ti-plus" />
                      </button>
                    </div>
                  </div>

                  {/* Day Posts */}
                  <div style={styles.dayContent}>
                    {daySchedule.length === 0 ? (
                      <div style={styles.emptyDay}>
                        <i className="ti ti-calendar-plus" style={{ fontSize: '1.3rem', marginBottom: 4, display: 'block', opacity: 0.6 }} />
                        <span>Nenhuma aula</span>
                        <button
                          onClick={() => handleOpenAddModal(day.id)}
                          style={{
                            background: 'none', border: 'none', color: '#8b5e3c',
                            fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginTop: 6,
                            textDecoration: 'underline'
                          }}
                        >
                          + Agendar
                        </button>
                      </div>
                    ) : (
                      daySchedule.map(item => {
                        const cls = classes.find(c => c.id === item.classId);
                        const cardColor = item.color || cls?.color || '#8b5e3c';

                        return (
                          <div
                            key={item.id}
                            style={{ ...styles.lessonCard, borderLeftColor: cardColor }}
                            onClick={() => handleOpenEditModal(item)}
                          >
                            {/* Card Header: Time + Status Badge */}
                            <div style={styles.lessonHeader}>
                              <span style={styles.lessonTime}>
                                <i className="ti ti-clock" style={{ fontSize: 11, marginRight: 3 }} />
                                {item.timeStart} - {item.timeEnd}
                              </span>
                              <div onClick={(e) => cycleStatus(item.id, e)} style={{ cursor: 'pointer' }}>
                                {renderStatusBadge(item.status)}
                              </div>
                            </div>

                            {/* Card Body: Class & Topic */}
                            <div style={styles.lessonBody}>
                              <div style={{ ...styles.lessonClassName, color: cardColor }}>
                                {item.className || cls?.name || 'Turma Geral'}
                              </div>
                              <div style={styles.lessonTopic} title={item.topic}>
                                {item.topic}
                              </div>
                              {item.notes && (
                                <p style={styles.lessonNotes} title={item.notes}>
                                  📝 {item.notes}
                                </p>
                              )}
                            </div>

                            {/* Card Actions: Edit & Delete (Self-Contained inside Weekly Agenda) */}
                            <div style={styles.lessonFooter} onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                style={styles.actionBtnEdit}
                                title="Editar esta postagem da agenda"
                              >
                                <i className="ti ti-pencil" /> Editar
                              </button>
                              <button
                                onClick={() => setPostToDelete(item)}
                                style={styles.actionBtnDelete}
                                title="Excluir esta postagem"
                              >
                                <i className="ti ti-trash" /> Excluir
                              </button>
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

        {/* Sidebar: Checklist Semanal */}
        <div style={styles.sidebar}>
          <div style={styles.checklistCard}>
            <div style={styles.checklistHeader}>
              <h2 style={styles.checklistTitle}>
                <i className="ti ti-list-check" style={{ marginRight: '8px', color: '#8b5e3c' }} />
                Checklist Semanal
              </h2>
              <span style={{ fontSize: 12, color: '#7a5c42', fontWeight: 600 }}>
                {checklist.filter(c => c.completed).length}/{checklist.length} concluídas
              </span>
            </div>

            <div style={styles.checklistInputContainer}>
              <i className="ti ti-plus" style={{ position: 'absolute', left: '12px', top: '12px', color: '#a08060' }} />
              <input
                type="text"
                placeholder="Nova tarefa... (Pressione Enter)"
                style={styles.checklistInput}
                onKeyDown={handleAddChecklist}
              />
            </div>

            <div style={styles.checklistItems}>
              {checklist.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 8px', color: '#a08060', fontSize: '0.85rem' }}>
                  <i className="ti ti-clipboard-check" style={{ fontSize: 24, display: 'block', marginBottom: 6, opacity: 0.5 }} />
                  Nenhuma tarefa pendente na checklist semanal.
                </div>
              ) : (
                checklist.map(item => (
                  <div
                    key={item.id}
                    style={{
                      ...styles.checklistItem,
                      backgroundColor: item.completed ? '#f9f5ef' : '#fff',
                    }}
                    onClick={() => toggleChecklist(item.id)}
                  >
                    <div style={{
                      ...styles.checkbox,
                      backgroundColor: item.completed ? '#8b5e3c' : 'transparent',
                      borderColor: item.completed ? '#8b5e3c' : '#c4a882',
                    }}>
                      {item.completed && <i className="ti ti-check" style={{ color: '#fffcf8', fontSize: '0.75rem' }} />}
                    </div>
                    <span style={{
                      ...styles.checklistText,
                      textDecoration: item.completed ? 'line-through' : 'none',
                      color: item.completed ? '#a08060' : '#2c1a0e',
                    }}>
                      {item.text}
                    </span>
                    <button
                      onClick={(e) => handleDeleteChecklistItem(item.id, e)}
                      style={{
                        background: 'none', border: 'none', color: '#a83232', cursor: 'pointer',
                        padding: 4, fontSize: 13, opacity: 0.6,
                      }}
                      title="Excluir tarefa"
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE POSTAGEM */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0, fontFamily: "'Fraunces', Georgia, serif" }}>
                <i className={editingPost ? 'ti ti-pencil' : 'ti ti-calendar-plus'} style={{ marginRight: 8, color: '#8b5e3c' }} />
                {editingPost ? 'Editar Postagem da Agenda' : 'Nova Postagem / Agendar Aula'}
              </h2>
              <button onClick={() => setShowModal(false)} style={styles.closeBtn}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Tópico / Conteúdo Principal */}
              <div>
                <label style={styles.formLabel}>Tópico / Assunto da Aula *</label>
                <input
                  type="text"
                  value={formTopic}
                  onChange={e => setFormTopic(e.target.value)}
                  placeholder="Ex: Simple Present vs. Present Continuous"
                  style={styles.formInput}
                />
              </div>

              {/* Turma & Dia */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={styles.formLabel}>Turma</label>
                  <select
                    value={formClassId}
                    onChange={e => setFormClassId(e.target.value)}
                    style={styles.formInput}
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value="custom">Outra / Turma Avulsa</option>
                  </select>
                </div>

                <div>
                  <label style={styles.formLabel}>Dia da Semana</label>
                  <select
                    value={formDay}
                    onChange={e => setFormDay(Number(e.target.value))}
                    style={styles.formInput}
                  >
                    {DAYS.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formClassId === 'custom' && (
                <div>
                  <label style={styles.formLabel}>Nome da Turma Avulsa</label>
                  <input
                    type="text"
                    value={formCustomClassName}
                    onChange={e => setFormCustomClassName(e.target.value)}
                    placeholder="Ex: Turma Particular VIP / Reforço"
                    style={styles.formInput}
                  />
                </div>
              )}

              {/* Horários & Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12 }}>
                <div>
                  <label style={styles.formLabel}>Início</label>
                  <input
                    type="time"
                    value={formTimeStart}
                    onChange={e => setFormTimeStart(e.target.value)}
                    style={styles.formInput}
                  />
                </div>

                <div>
                  <label style={styles.formLabel}>Fim</label>
                  <input
                    type="time"
                    value={formTimeEnd}
                    onChange={e => setFormTimeEnd(e.target.value)}
                    style={styles.formInput}
                  />
                </div>

                <div>
                  <label style={styles.formLabel}>Status do Preparo</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as PrepStatus)}
                    style={styles.formInput}
                  >
                    <option value="unplanned">Não Planejado</option>
                    <option value="draft">Em Rascunho</option>
                    <option value="ready">Pronta!</option>
                  </select>
                </div>
              </div>

              {/* Anotações Pedagógicas / Materiais */}
              <div>
                <label style={styles.formLabel}>Anotações / Recursos / Observações</label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Ex: Trazer cópias da folha de exercícios, projetar slide 4, levar flashcards."
                  style={{ ...styles.formInput, minHeight: 65, resize: 'vertical' }}
                />
              </div>

              {/* Cor de Identificação */}
              <div>
                <label style={styles.formLabel}>Cor de Destaque</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {PALETTE.map(hex => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setFormColor(hex)}
                      style={{
                        width: 24, height: 24, borderRadius: '50%', background: hex,
                        border: formColor === hex ? '3px solid #2c1a0e' : 'none',
                        cursor: 'pointer', transition: 'transform 0.15s',
                        transform: formColor === hex ? 'scale(1.15)' : 'scale(1)'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, borderTop: '1px solid rgba(139,115,85,0.14)', paddingTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={styles.secondaryBtn}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePost}
                style={styles.primaryBtn}
              >
                <i className="ti ti-device-floppy" /> {editingPost ? 'Salvar Alterações' : 'Agendar Postagem'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {postToDelete && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: 400 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(220,50,47,0.1)', color: '#dc322f', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>
                <i className="ti ti-alert-triangle" />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#2c1a0e' }}>
                Excluir Postagem da Agenda?
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#7a5c42', lineHeight: 1.5 }}>
                Tem certeza que deseja remover a aula <strong>"{postToDelete.topic}"</strong> da turma <strong>{postToDelete.className}</strong>?
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setPostToDelete(null)}
                style={styles.secondaryBtn}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{ ...styles.primaryBtn, background: '#dc322f' }}
              >
                <i className="ti ti-trash" /> Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Styles ---
const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: '#fdf8f2',
    color: '#2c1a0e',
    minHeight: '100%',
    padding: '32px 48px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    position: 'relative',
    boxSizing: 'border-box',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    backgroundColor: '#8b5e3c',
    color: '#fffcf8',
    padding: '12px 20px',
    borderRadius: '10px',
    boxShadow: '0 4px 16px rgba(44,26,14,0.2)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 9999,
    fontWeight: 600,
    fontSize: '0.88rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '28px',
    borderBottom: '1px solid rgba(139,115,85,0.14)',
    paddingBottom: '20px',
  },
  titleSection: {
    flex: '1 1 320px',
  },
  title: {
    fontSize: '1.9rem',
    fontWeight: 700,
    margin: 0,
    color: '#2c1a0e',
    fontFamily: "'Fraunces', Georgia, serif",
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    margin: '6px 0 0',
    color: '#7a5c42',
    fontSize: '0.92rem',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 18px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    background: '#8b5e3c',
    color: '#fffcf8',
    boxShadow: '0 2px 6px rgba(139,94,60,0.25)',
    transition: 'opacity 0.2s',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 16px',
    borderRadius: 10,
    border: '1px solid rgba(139,115,85,0.25)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    background: '#fffcf8',
    color: '#7a5c42',
  },
  summaryContainer: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  summaryCard: {
    backgroundColor: '#fffcf8',
    border: '1px solid rgba(139,115,85,0.14)',
    borderRadius: '12px',
    padding: '12px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    minWidth: '150px',
    boxShadow: '0 2px 6px rgba(44,26,14,0.04)',
  },
  summaryIconWrapper: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    backgroundColor: '#f5efe6',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    border: '1px solid rgba(139,115,85,0.08)',
  },
  summaryContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  summaryValue: {
    fontSize: '1.35rem',
    fontWeight: 800,
    color: '#2c1a0e',
    lineHeight: 1.2,
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#a08060',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 700,
  },
  selectFilter: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid rgba(139,115,85,0.22)',
    background: '#fffcf8',
    fontSize: 13,
    color: '#2c1a0e',
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
  },
  searchInput: {
    padding: '8px 12px 8px 32px',
    borderRadius: 10,
    border: '1px solid rgba(139,115,85,0.22)',
    background: '#fffcf8',
    fontSize: 13,
    color: '#2c1a0e',
    width: 200,
    outline: 'none',
  },
  layout: {
    display: 'flex',
    gap: '20px',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainContent: {
    flex: '1 1 0%',
    minWidth: 0,
    backgroundColor: '#fffcf8',
    borderRadius: '16px',
    border: '1px solid rgba(139,115,85,0.14)',
    boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
    overflow: 'hidden',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '1px',
    backgroundColor: 'rgba(139,115,85,0.14)',
  },
  dayColumn: {
    backgroundColor: '#fffcf8',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '440px',
  },
  dayHeader: {
    padding: '14px 10px',
    backgroundColor: '#f5efe6',
    borderBottom: '1px solid rgba(139,115,85,0.12)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  dayTitle: {
    fontWeight: 700,
    color: '#2c1a0e',
    fontSize: '0.9rem',
  },
  dayCount: {
    fontSize: '0.72rem',
    color: '#7a5c42',
    backgroundColor: '#fffcf8',
    padding: '2px 7px',
    borderRadius: '10px',
    border: '1px solid rgba(139,115,85,0.1)',
    fontWeight: 600,
  },
  inlineAddBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#8b5e3c',
    color: '#fff',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 700,
  },
  dayContent: {
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
  },
  emptyDay: {
    textAlign: 'center',
    color: '#a08060',
    fontSize: '0.8rem',
    marginTop: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  lessonCard: {
    backgroundColor: '#fff',
    border: '1px solid rgba(139,115,85,0.16)',
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    borderRadius: '10px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    boxShadow: '0 1px 4px rgba(44,26,14,0.04)',
    transition: 'transform 0.15s, box-shadow 0.15s',
    cursor: 'pointer',
  },
  lessonHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  },
  lessonTime: {
    fontSize: '0.72rem',
    color: '#7a5c42',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
  },
  badge: {
    fontSize: '0.62rem',
    padding: '2px 6px',
    borderRadius: '99px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
  },
  lessonBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  lessonClassName: {
    margin: 0,
    fontSize: '0.85rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  lessonTopic: {
    margin: 0,
    fontSize: '0.82rem',
    color: '#2c1a0e',
    fontWeight: 600,
    lineHeight: 1.3,
  },
  lessonNotes: {
    margin: '2px 0 0',
    fontSize: '0.72rem',
    color: '#7a5c42',
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  lessonFooter: {
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px solid rgba(139,115,85,0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  actionBtnEdit: {
    background: 'none',
    border: 'none',
    color: '#8b5e3c',
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 4px',
    borderRadius: 4,
  },
  actionBtnDelete: {
    background: 'none',
    border: 'none',
    color: '#a83232',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 4px',
    borderRadius: 4,
  },
  sidebar: {
    width: '300px',
    flexShrink: 0,
  },
  checklistCard: {
    backgroundColor: '#fffcf8',
    borderRadius: '16px',
    border: '1px solid rgba(139,115,85,0.14)',
    boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
  },
  checklistHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  checklistTitle: {
    margin: 0,
    fontSize: '1.1rem',
    color: '#2c1a0e',
    display: 'flex',
    alignItems: 'center',
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: 700,
  },
  checklistInputContainer: {
    position: 'relative',
    marginBottom: '16px',
  },
  checklistInput: {
    width: '100%',
    backgroundColor: '#f5efe6',
    border: '1px solid rgba(139,115,85,0.18)',
    borderRadius: '8px',
    padding: '9px 12px 9px 34px',
    color: '#2c1a0e',
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  checklistItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  checklistItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(139,115,85,0.08)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    borderWidth: '2px',
    borderStyle: 'solid',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    transition: 'all 0.2s',
  },
  checklistText: {
    fontSize: '0.83rem',
    flex: 1,
    lineHeight: 1.35,
    transition: 'color 0.2s',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(44,26,14,0.45)',
    backdropFilter: 'blur(2px)',
    zIndex: 9998,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    background: '#fffcf8',
    border: '1px solid rgba(139,115,85,0.2)',
    borderRadius: 16,
    padding: '24px 28px',
    width: '100%',
    maxWidth: 520,
    boxShadow: '0 8px 32px rgba(44,26,14,0.2)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
    color: '#a08060',
  },
  formLabel: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#7a5c42',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 5,
  },
  formInput: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    border: '1px solid rgba(139,115,85,0.22)',
    background: '#fff',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
};
