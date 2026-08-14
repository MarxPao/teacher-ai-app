'use client';

import React, { useState, useEffect, CSSProperties, useRef, useCallback } from 'react';

// --- Types ---
interface Student {
 id: string;
 name: string;
 classId: string;
}

interface ClassData {
 id: string;
 name: string;
 level?: string;
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'none';

interface AttendanceRecord {
 status: AttendanceStatus;
}

interface ParticipationRecord {
 participated: number;
 correct: number;
 incorrect: number;
 help: number;
}

// --- Styles ---
const styles: Record<string, CSSProperties> = {
 container: {
 display: 'flex',
 flexDirection: 'column',
 height: '100%',
 background: '#fdf8f2',
 color: '#2c1a0e',
 fontFamily: "'Plus Jakarta Sans', sans-serif",
 padding: '28px 32px',
 boxSizing: 'border-box',
 gap: 20,
 overflowY: 'auto',
 },
 header: {
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 padding: '18px 24px',
 background: '#fffcf8',
 borderRadius: 14,
 border: '1px solid rgba(139,115,85,0.1)',
 boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
 marginBottom: 4,
 },
 title: {
 fontFamily: "'Fraunces', Georgia, serif",
 fontSize: '1.5rem',
 fontWeight: 700,
 color: '#2c1a0e',
 margin: 0,
 },
 select: {
 padding: '9px 14px',
 borderRadius: 9,
 background: '#f5efe6',
 color: '#2c1a0e',
 border: '1px solid rgba(139,115,85,0.18)',
 fontSize: 14,
 outline: 'none',
 cursor: 'pointer',
 minWidth: 200,
 fontFamily: "'Plus Jakarta Sans', sans-serif",
 },
 grid: {
 display: 'grid',
 gridTemplateColumns: '300px 1fr 300px',
 gap: 20,
 flex: 1,
 },
 card: {
 background: '#fffcf8',
 borderRadius: 14,
 padding: 20,
 border: '1px solid rgba(139,115,85,0.1)',
 display: 'flex',
 flexDirection: 'column',
 gap: 14,
 boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
 },
 cardTitle: {
 fontFamily: "'Fraunces', Georgia, serif",
 margin: '0 0 8px 0',
 fontSize: '1rem',
 fontWeight: 600,
 color: '#7a5c42',
 display: 'flex',
 alignItems: 'center',
 gap: 8,
 },
 timerDisplay: {
 fontSize: '80px',
 fontWeight: 800,
 textAlign: 'center',
 fontVariantNumeric: 'tabular-nums',
 margin: '20px 0',
 },
 timerControls: {
 display: 'flex',
 justifyContent: 'center',
 gap: '15px',
 },
 btnBase: {
 padding: '10px 20px',
 borderRadius: 9,
 border: 'none',
 cursor: 'pointer',
 fontWeight: 600,
 display: 'flex',
 alignItems: 'center',
 gap: 8,
 transition: 'opacity 0.2s, transform 0.1s',
 },
 btnPrimary: {
 background: '#8b5e3c',
 color: '#fffcf8',
 },
 btnSecondary: {
 background: '#f5efe6',
 color: '#7a5c42',
 border: '1px solid rgba(139,115,85,0.18)',
 },
 btnIcon: {
 width: '40px',
 height: '40px',
 borderRadius: '50%',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 border: 'none',
 cursor: 'pointer',
 color: 'white',
 },
 progressBar: {
 width: '100%',
 height: '10px',
 background: 'rgba(139,115,85,0.12)',
 borderRadius: '5px',
 overflow: 'hidden',
 display: 'flex',
 },
 progressSegment: {
 height: '100%',
 transition: 'width 0.3s',
 },
 studentList: {
 display: 'flex',
 flexDirection: 'column',
 gap: '10px',
 overflowY: 'auto',
 flex: 1,
 },
 studentItem: {
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 padding: '10px 14px',
 background: '#f5efe6',
 borderRadius: 10,
 border: '1px solid rgba(139,115,85,0.1)',
 },
 attendanceBtns: {
 display: 'flex',
 gap: '5px',
 },
 attendanceBtn: {
 width: '32px',
 height: '32px',
 borderRadius: '6px',
 border: 'none',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 cursor: 'pointer',
 transition: 'all 0.2s',
 },
 participationGrid: {
 display: 'grid',
 gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
 gap: '15px',
 overflowY: 'auto',
 },
 participationCard: {
 background: '#f5efe6',
 padding: 14,
 borderRadius: 10,
 border: '1px solid rgba(139,115,85,0.1)',
 display: 'flex',
 flexDirection: 'column',
 gap: '10px',
 },
 participationActions: {
 display: 'flex',
 justifyContent: 'space-between',
 gap: '5px',
 },
 actionBtn: {
 flex: 1,
 padding: '8px 0',
 borderRadius: 8,
 border: 'none',
 cursor: 'pointer',
 fontSize: 13,
 display: 'flex',
 flexDirection: 'column',
 alignItems: 'center',
 gap: 3,
 background: '#fffcf8',
 color: '#7a5c42',
 transition: 'background 0.2s',
 },
 rouletteBox: {
 height: 100,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 background: '#f5efe6',
 borderRadius: 10,
 fontSize: 22,
 fontWeight: 700,
 color: '#8b5e3c',
 border: '2px dashed rgba(139,115,85,0.25)',
 marginBottom: 10,
 overflow: 'hidden',
 position: 'relative',
 },
 energySlider: {
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 padding: '10px',
 background: '#f5efe6',
 borderRadius: '8px',
 },
 energyBtn: {
 background: 'none',
 border: 'none',
 fontSize: '24px',
 cursor: 'pointer',
 opacity: 0.5,
 transition: 'opacity 0.2s, transform 0.2s',
 },
 energyBtnActive: {
 opacity: 1,
 transform: 'scale(1.2)',
 },
 input: {
 padding: '8px 12px',
 borderRadius: 8,
 border: '1px solid rgba(139,115,85,0.18)',
 background: '#f5efe6',
 color: '#2c1a0e',
 width: 80,
 fontFamily: "'Plus Jakarta Sans', sans-serif",
 },
 toast: {
 position: 'fixed',
 bottom: '20px',
 right: '20px',
 padding: '12px 24px',
 background: '#8b5e3c',
 color: '#fffcf8',
 borderRadius: '8px',
 boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
 zIndex: 1000,
 transition: 'opacity 0.3s',
 },
 emptyState: {
 display: 'flex',
 flexDirection: 'column',
 alignItems: 'center',
 justifyContent: 'center',
 height: '100%',
 color: '#a08060',
 gap: '15px',
 gridColumn: '1 / -1',
 }
};

export default function ClassroomMode() {
 const [classes, setClasses] = useState<ClassData[]>([]);
 const [students, setStudents] = useState<Student[]>([]);
 const [selectedClass, setSelectedClass] = useState<string>('');
 const [classStudents, setClassStudents] = useState<Student[]>([]);
 
 // Attendance & Participation State
 const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
 const [participation, setParticipation] = useState<Record<string, ParticipationRecord>>({});
 
 // Timer State
 const [totalMinutes, setTotalMinutes] = useState(45);
 const [timeLeft, setTimeLeft] = useState(45 * 60);
 const [timerActive, setTimerActive] = useState(false);
 const [currentPhase, setCurrentPhase] = useState<'warmup'|'main'|'wrapup'>('warmup');
 
 // Roulette State
 const [rouletteStudent, setRouletteStudent] = useState<Student | null>(null);
 const [isSpinning, setIsSpinning] = useState(false);
 const [prioritizeZero, setPrioritizeZero] = useState(false);
 
 // Energy State
 const [classEnergy, setClassEnergy] = useState<number>(3); // 1-4

 // Toast
 const [toastMessage, setToastMessage] = useState('');

 const audioCtxRef = useRef<AudioContext | null>(null);

 useEffect(() => {
 // Load initial data
 const loadedClasses = JSON.parse(localStorage.getItem('teacher_classes') || '[]');
 const loadedStudents = JSON.parse(localStorage.getItem('teacher_students') || '[]');
 setClasses(loadedClasses);
 setStudents(loadedStudents);
 
 // Add some mock data if empty for demonstration
 if (loadedClasses.length === 0) {
 const mockClasses = [{ id: 'c1', name: 'English 101' }, { id: 'c2', name: 'Advanced Conversation' }];
 const mockStudents = [
 { id: 's1', name: 'Alice Smith', classId: 'c1' },
 { id: 's2', name: 'Bob Jones', classId: 'c1' },
 { id: 's3', name: 'Charlie Brown', classId: 'c1' },
 { id: 's4', name: 'Diana Prince', classId: 'c2' },
 ];
 setClasses(mockClasses);
 setStudents(mockStudents);
 localStorage.setItem('teacher_classes', JSON.stringify(mockClasses));
 localStorage.setItem('teacher_students', JSON.stringify(mockStudents));
 }
 }, []);

 useEffect(() => {
 if (selectedClass) {
 const filtered = students.filter(s => s.classId === selectedClass);
 setClassStudents(filtered);
 
 // Load or init today's attendance
 const today = new Date().toISOString().split('T')[0];
 const attKey = `teacher_attendance_${selectedClass}_${today}`;
 const savedAtt = JSON.parse(localStorage.getItem(attKey) || '{}');
 
 const initAtt: Record<string, AttendanceStatus> = {};
 const initPart: Record<string, ParticipationRecord> = {};
 
 filtered.forEach(s => {
 initAtt[s.id] = savedAtt[s.id] || 'none';
 initPart[s.id] = { participated: 0, correct: 0, incorrect: 0, help: 0 };
 });
 
 setAttendance(initAtt);
 setParticipation(initPart);
 setRouletteStudent(null);
 } else {
 setClassStudents([]);
 }
 }, [selectedClass, students]);

 // Audio Beep
 const playBeep = useCallback(() => {
 if (!audioCtxRef.current) {
 audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
 }
 const ctx = audioCtxRef.current;
 if (ctx.state === 'suspended') ctx.resume();
 
 const osc = ctx.createOscillator();
 const gainNode = ctx.createGain();
 
 osc.type = 'sine';
 osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
 gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
 gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
 
 osc.connect(gainNode);
 gainNode.connect(ctx.destination);
 
 osc.start();
 osc.stop(ctx.currentTime + 0.5);
 }, []);

 // Timer Logic
 useEffect(() => {
 let interval: NodeJS.Timeout;
 if (timerActive && timeLeft > 0) {
 interval = setInterval(() => {
 setTimeLeft(prev => {
 const newTime = prev - 1;
 
 // Phase check (15% warmup, 70% main, 15% wrapup)
 const totalSecs = totalMinutes * 60;
 const warmupThreshold = totalSecs * 0.85;
 const wrapupThreshold = totalSecs * 0.15;
 
 if (newTime === Math.floor(warmupThreshold) || newTime === Math.floor(wrapupThreshold)) {
 playBeep();
 }
 
 if (newTime > warmupThreshold) setCurrentPhase('warmup');
 else if (newTime > wrapupThreshold) setCurrentPhase('main');
 else setCurrentPhase('wrapup');
 
 if (newTime <= 0) {
 setTimerActive(false);
 playBeep();
 setTimeout(playBeep, 300);
 return 0;
 }
 return newTime;
 });
 }, 1000);
 }
 return () => clearInterval(interval);
 }, [timerActive, timeLeft, totalMinutes, playBeep]);

 const resetTimer = () => {
 setTimerActive(false);
 setTimeLeft(totalMinutes * 60);
 setCurrentPhase('warmup');
 };

 const formatTime = (secs: number) => {
 const m = Math.floor(secs / 60);
 const s = secs % 60;
 return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
 };

 const handleAttendance = (id: string, status: AttendanceStatus) => {
 setAttendance(prev => ({ ...prev, [id]: status }));
 };

 const saveAttendance = () => {
 if (!selectedClass) return;
 const today = new Date().toISOString().split('T')[0];
 localStorage.setItem(`teacher_attendance_${selectedClass}_${today}`, JSON.stringify(attendance));
 
 // Save participation
 localStorage.setItem(`teacher_participation_${selectedClass}_${today}`, JSON.stringify(participation));
 
 showToast('Aula salva com sucesso!');
 };

 const handleParticipation = (id: string, type: keyof ParticipationRecord) => {
 setParticipation(prev => ({
 ...prev,
 [id]: {
 ...prev[id],
 [type]: prev[id][type] + 1
 }
 }));
 };

 const spinRoulette = () => {
 if (classStudents.length === 0) return;
 
 const presentStudents = classStudents.filter(s => attendance[s.id] === 'present' || attendance[s.id] === 'late');
 
 if (presentStudents.length === 0) {
 showToast('Nenhum aluno presente para sortear');
 return;
 }

 setIsSpinning(true);
 let pool = presentStudents;
 
 if (prioritizeZero) {
 const zeros = presentStudents.filter(s => participation[s.id].participated === 0);
 if (zeros.length > 0) pool = zeros;
 }

 let spins = 0;
 const maxSpins = 20;
 const interval = setInterval(() => {
 const randomIdx = Math.floor(Math.random() * pool.length);
 setRouletteStudent(pool[randomIdx]);
 spins++;
 if (spins >= maxSpins) {
 clearInterval(interval);
 setIsSpinning(false);
 }
 }, 100);
 };

 const showToast = (msg: string) => {
 setToastMessage(msg);
 setTimeout(() => setToastMessage(''), 3000);
 };

 const presentCount = Object.values(attendance).filter(v => v === 'present' || v === 'late').length;
 const timerColor = currentPhase === 'warmup' ? '#3d7a4e' : currentPhase === 'main' ? '#8b5e3c' : '#a83232';

 return (
 <div style={styles.container}>
 {/* Header */}
 <div style={styles.header}>
 <h1 style={styles.title}><i className="ti ti-rocket" style={{ marginRight: '10px' }}></i>Live Classroom Cockpit</h1>
 <select 
 style={styles.select} 
 value={selectedClass} 
 onChange={(e) => setSelectedClass(e.target.value)}
 >
 <option value="">Selecione uma turma...</option>
 {classes.map(c => (
 <option key={c.id} value={c.id}>{c.name}</option>
 ))}
 </select>
 </div>

 {!selectedClass ? (
 <div style={styles.emptyState}>
 <i className="ti ti-chalkboard" style={{ fontSize: '64px', opacity: 0.5 }}></i>
 <h2>Selecione uma turma para iniciar a aula</h2>
 </div>
 ) : (
 <div style={styles.grid}>
 
 {/* Left Column: Attendance & Energy */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
 <div style={{ ...styles.card, flex: 1, overflow: 'hidden' }}>
 <h2 style={styles.cardTitle}>
 <i className="ti ti-users"></i> Chamada Rápida ({presentCount}/{classStudents.length})
 </h2>
 <div style={styles.studentList}>
 {classStudents.map(student => {
 const isPresent = attendance[student.id] === 'present';
 const isLate = attendance[student.id] === 'late';
 const isAbsent = attendance[student.id] === 'absent';
 
 return (
 <div key={student.id} style={styles.studentItem}>
 <span style={{ fontSize: '14px', fontWeight: 500 }}>{student.name}</span>
 <div style={styles.attendanceBtns}>
 <button 
 style={{ 
 ...styles.attendanceBtn, 
 backgroundColor: isPresent ? '#3d7a4e' : 'rgba(139,115,85,0.08)',
 color: isPresent ? '#fff' : '#a08060'
 }}
 onClick={() => handleAttendance(student.id, 'present')}
 title="Presente"
 ><i className="ti ti-check"></i></button>
 <button 
 style={{ 
 ...styles.attendanceBtn, 
 backgroundColor: isLate ? '#c87a1e' : 'rgba(139,115,85,0.08)',
 color: isLate ? '#fff' : '#a08060'
 }}
 onClick={() => handleAttendance(student.id, 'late')}
 title="Atrasado"
 ><i className="ti ti-clock"></i></button>
 <button 
 style={{ 
 ...styles.attendanceBtn, 
 backgroundColor: isAbsent ? '#a83232' : 'rgba(139,115,85,0.08)',
 color: isAbsent ? '#fff' : '#a08060'
 }}
 onClick={() => handleAttendance(student.id, 'absent')}
 title="Ausente"
 ><i className="ti ti-x"></i></button>
 </div>
 </div>
 );
 })}
 </div>
 <button style={{ ...styles.btnBase, ...styles.btnPrimary, justifyContent: 'center' }} onClick={saveAttendance}>
 <i className="ti ti-device-floppy"></i> Salvar Aula
 </button>
 </div>

 <div style={styles.card}>
 <h2 style={styles.cardTitle}><i className="ti ti-bolt"></i> Energia da Turma</h2>
 <div style={styles.energySlider}>
 {['', '', '', ''].map((emoji, idx) => (
 <button 
 key={idx}
 style={{ ...styles.energyBtn, ...(classEnergy === idx + 1 ? styles.energyBtnActive : {}) }}
 onClick={() => setClassEnergy(idx + 1)}
 >
 {emoji}
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* Center Column: Timer & Participation */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
 <div style={{ ...styles.card, alignItems: 'center' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
 <h2 style={styles.cardTitle}><i className="ti ti-clock-play"></i> Smart Timer</h2>
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
 <input 
 type="number" 
 style={styles.input} 
 value={totalMinutes} 
 onChange={e => {
 setTotalMinutes(Number(e.target.value));
 if(!timerActive) setTimeLeft(Number(e.target.value) * 60);
 }} 
 min="1"
 /> min
 </div>
 </div>

 <div style={{ ...styles.timerDisplay, color: timerColor }}>
 {formatTime(timeLeft)}
 </div>

 <div style={styles.progressBar}>
 <div style={{ ...styles.progressSegment, backgroundColor: '#3d7a4e', width: '15%' }} title="Warm-up (15%)"></div>
 <div style={{ ...styles.progressSegment, backgroundColor: '#8b5e3c', width: '70%' }} title="Main Activity (70%)"></div>
 <div style={{ ...styles.progressSegment, backgroundColor: '#a83232', width: '15%' }} title="Wrap-up (15%)"></div>
 </div>
 
 {/* Progress Indicator */}
 <div style={{ width: '100%', position: 'relative', marginTop: '-10px', height: '10px' }}>
 <div style={{ 
 position: 'absolute', 
 top: 0, 
 left: `${100 - (timeLeft / (totalMinutes * 60)) * 100}%`,
 width: '2px',
 height: '10px',
 backgroundColor: '#f5efe6',
 boxShadow: '0 0 5px rgba(245,239,230,0.8)',
 transition: 'left 1s linear'
 }}></div>
 </div>

 <div style={styles.timerControls}>
 <button 
 style={{ ...styles.btnIcon, background: timerActive ? '#c87a1e' : '#3d7a4e' }} 
 onClick={() => setTimerActive(!timerActive)}
 >
 <i className={timerActive ? "ti ti-player-pause" : "ti ti-player-play"} style={{ fontSize: '24px' }}></i>
 </button>
 <button style={{ ...styles.btnIcon, backgroundColor: '#a08060' }} onClick={resetTimer}>
 <i className="ti ti-refresh" style={{ fontSize: '24px' }}></i>
 </button>
 </div>
 <div style={{ fontSize: '12px', color: '#a08060', textTransform: 'uppercase', letterSpacing: '1px' }}>
 Fase Atual: <span style={{ color: timerColor, fontWeight: 'bold' }}>{currentPhase}</span>
 </div>
 </div>

 <div style={{ ...styles.card, flex: 1, overflow: 'hidden' }}>
 <h2 style={styles.cardTitle}><i className="ti ti-activity"></i> Participação ao Vivo (Presentes)</h2>
 <div style={styles.participationGrid}>
 {classStudents.filter(s => attendance[s.id] === 'present' || attendance[s.id] === 'late').map(student => (
 <div key={student.id} style={styles.participationCard}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <strong style={{ fontSize: '14px', color: '#2c1a0e' }}>{student.name}</strong>
 <span style={{ fontSize: '12px', background: '#8b5e3c', color: '#fffcf8', padding: '2px 6px', borderRadius: '10px' }}>
 {participation[student.id]?.participated || 0}
 </span>
 </div>
 <div style={styles.participationActions}>
 <button style={{ ...styles.actionBtn }} onClick={() => handleParticipation(student.id, 'participated')}>
 <i className="ti ti-hand-stop" style={{ color: '#8b5e3c', fontSize: '18px' }}></i>
 <span style={{ fontSize: '10px' }}>Part.</span>
 </button>
 <button style={{ ...styles.actionBtn }} onClick={() => handleParticipation(student.id, 'correct')}>
 <i className="ti ti-check" style={{ color: '#3d7a4e', fontSize: '18px' }}></i>
 <span style={{ fontSize: '10px' }}>Acerto</span>
 </button>
 <button style={{ ...styles.actionBtn }} onClick={() => handleParticipation(student.id, 'incorrect')}>
 <i className="ti ti-x" style={{ color: '#a83232', fontSize: '18px' }}></i>
 <span style={{ fontSize: '10px' }}>Erro</span>
 </button>
 <button style={{ ...styles.actionBtn }} onClick={() => handleParticipation(student.id, 'help')}>
 <i className="ti ti-help" style={{ color: '#c87a1e', fontSize: '18px' }}></i>
 <span style={{ fontSize: '10px' }}>Ajuda</span>
 </button>
 </div>
 </div>
 ))}
 {classStudents.filter(s => attendance[s.id] === 'present' || attendance[s.id] === 'late').length === 0 && (
 <div style={{ color: '#a08060', fontSize: '14px', gridColumn: '1/-1', textAlign: 'center', padding: '20px' }}>
 Marque alunos como presentes na chamada para habilitar a participação.
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Right Column: Roulette */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
 <div style={styles.card}>
 <h2 style={styles.cardTitle}><i className="ti ti-dice-5"></i> Sorteador de Alunos</h2>
 
 <div style={styles.rouletteBox}>
 {isSpinning ? (
 <span style={{ filter: 'blur(1px)', opacity: 0.7 }}>{rouletteStudent?.name || 'Sorteando...'}</span>
 ) : (
 <span>{rouletteStudent ? rouletteStudent.name : '?'}</span>
 )}
 </div>
 
 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#a08060', cursor: 'pointer' }}>
 <input 
 type="checkbox" 
 checked={prioritizeZero} 
 onChange={e => setPrioritizeZero(e.target.checked)}
 />
 Priorizar quem não participou
 </label>

 <button 
 style={{ ...styles.btnBase, ...styles.btnPrimary, justifyContent: 'center', fontSize: '16px', padding: '15px' }}
 onClick={spinRoulette}
 disabled={isSpinning}
 >
 <i className="ti ti-dice"></i> {isSpinning ? 'Sorteando...' : 'Sortear Aluno'}
 </button>
 </div>
 
 <div style={{ ...styles.card, flex: 1 }}>
 <h2 style={styles.cardTitle}><i className="ti ti-chart-bar"></i> Visão Geral da Aula</h2>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#a08060' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Total de Alunos:</span> <strong style={{ color: '#2c1a0e' }}>{classStudents.length}</strong>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Presentes:</span> <strong style={{ color: '#3d7a4e' }}>{presentCount}</strong>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Total Interações:</span> 
 <strong style={{ color: '#8b5e3c' }}>
 {Object.values(participation).reduce((acc, curr) => acc + curr.participated + curr.correct + curr.incorrect + curr.help, 0)}
 </strong>
 </div>
 </div>
 </div>
 </div>

 </div>
 )}

 {/* Toast Notification */}
 {toastMessage && (
 <div style={styles.toast}>
 <i className="ti ti-check" style={{ marginRight: '8px' }}></i>
 {toastMessage}
 </div>
 )}
 </div>
 );
}