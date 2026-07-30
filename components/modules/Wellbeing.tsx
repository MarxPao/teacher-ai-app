'use client';

import React, { useState, useEffect, CSSProperties } from 'react';

// --- TYPES ---
type MoodValue = 1 | 2 | 3 | 4 | 5;

interface CheckIn {
  date: string; // YYYY-MM-DD
  mood: MoodValue;
  note: string;
  timestamp: number;
}

interface PositiveMoment {
  id: string;
  date: string;
  text: string;
  timestamp: number;
}

// --- CONSTANTS & DATA ---
const MOODS: { value: MoodValue; emoji: string; label: string; color: string }[] = [
  { value: 1, emoji: '😔', label: 'Esgotado', color: '#ff6b6b' },
  { value: 2, emoji: '😕', label: 'Cansado', color: '#ffa94d' },
  { value: 3, emoji: '😐', label: 'Neutro', color: '#fcc419' },
  { value: 4, emoji: '😊', label: 'Bem', color: '#69db7c' },
  { value: 5, emoji: '🤩', label: 'Excelente', color: '#4dabf7' },
];

const WELLBEING_TIPS = [
  "Técnica 4-7-8: Inspire por 4s, segure por 7s, expire por 8s. Repita 4 vezes.",
  "Pomodoro de Planejamento: 25 min de foco total, 5 min longe da tela.",
  "Ritual de transição: ao fim das aulas, ouça uma música específica para 'desligar' o modo professor.",
  "Hidratação: Lembre-se de beber água entre uma aula e outra. Suas cordas vocais agradecem!",
  "Desconexão: Tente não responder mensagens de alunos/pais após as 19h.",
  "Micro-pausa: Feche os olhos e respire fundo 3 vezes antes de começar a próxima aula.",
  "Foque no positivo: Sempre anote uma vitória do seu dia, não importa quão pequena.",
  "Postura: Ajuste sua cadeira e tela para que seus olhos fiquem na altura do topo do monitor.",
  "Luz natural: Tente passar pelo menos 15 minutos sob luz solar direta hoje.",
  "Conexão: Converse com um colega professor sobre algo que NÃO seja trabalho."
];

// --- STYLES ---
const styles: Record<string, CSSProperties> = {
  container: {
    padding: '24px',
    backgroundColor: '#0f1117',
    color: '#e2e8f0',
    minHeight: '100vh',
    fontFamily: "'Inter', -apple-system, sans-serif",
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    animation: 'fadeIn 0.5s ease-out',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #b19cd9, #8e44ad)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
  },
  card: {
    backgroundColor: '#1a1d2e',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'transform 0.2s',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#b19cd9',
  },
  moodContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    marginTop: '12px',
  },
  moodBtn: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '12px 8px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    transition: 'all 0.2s',
  },
  moodBtnActive: {
    background: 'rgba(177, 156, 217, 0.1)',
    borderColor: '#b19cd9',
    transform: 'scale(1.05)',
  },
  moodEmoji: {
    fontSize: '32px',
    lineHeight: 1,
  },
  moodLabel: {
    fontSize: '12px',
    color: '#a0aec0',
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '12px',
    color: '#fff',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '80px',
  },
  button: {
    backgroundColor: '#8e44ad',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  buttonDisabled: {
    backgroundColor: '#4a5568',
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  burnoutBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    border: '1px solid rgba(255, 107, 107, 0.3)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    color: '#ff6b6b',
    animation: 'pulse 2s infinite',
  },
  achievementItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  momentItem: {
    borderLeft: '2px solid #b19cd9',
    paddingLeft: '16px',
    position: 'relative',
    marginBottom: '16px',
  },
  momentDot: {
    position: 'absolute',
    left: '-5px',
    top: '4px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#b19cd9',
  },
  momentDate: {
    fontSize: '12px',
    color: '#a0aec0',
    marginBottom: '4px',
  },
  momentText: {
    fontSize: '14px',
    color: '#e2e8f0',
    lineHeight: 1.5,
  },
  chartContainer: {
    height: '150px',
    width: '100%',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    marginTop: '16px',
    position: 'relative',
    paddingBottom: '20px',
  },
  chartBar: {
    flex: 1,
    borderRadius: '4px 4px 0 0',
    minHeight: '4px',
    position: 'relative',
    transition: 'height 0.3s ease',
  },
  chartLabel: {
    position: 'absolute',
    bottom: '-20px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '10px',
    color: '#a0aec0',
  },
  tipCard: {
    background: 'linear-gradient(135deg, rgba(142, 68, 173, 0.2), rgba(177, 156, 217, 0.1))',
    border: '1px solid rgba(177, 156, 217, 0.3)',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '16px',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    backgroundColor: '#69db7c',
    color: '#000',
    padding: '12px 24px',
    borderRadius: '8px',
    fontWeight: 600,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 1000,
    animation: 'slideUp 0.3s ease-out',
  },
  confetti: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 999,
    overflow: 'hidden',
  }
};

const getTodayString = () => new Date().toISOString().split('T')[0];

export default function Wellbeing() {
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [positiveMoments, setPositiveMoments] = useState<PositiveMoment[]>([]);
  const [planningHours, setPlanningHours] = useState<number>(0);
  const [achievements, setAchievements] = useState<string[]>([]);
  
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null);
  const [moodNote, setMoodNote] = useState('');
  const [momentText, setMomentText] = useState('');
  const [hoursInput, setHoursInput] = useState('');
  
  const [currentTip, setCurrentTip] = useState('');
  const [toast, setToast] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);

  const todayStr = getTodayString();
  const hasCheckedInToday = checkins.some(c => c.date === todayStr);

  // Initialization
  useEffect(() => {
    // Add global styles for animations
    if (!document.getElementById('wellbeing-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'wellbeing-styles';
      styleEl.innerHTML = `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.8; } 100% { opacity: 1; } }
      `;
      document.head.appendChild(styleEl);
    }

    // Load data
    try {
      const storedCheckins = localStorage.getItem('teacher_wellbeing_checkins');
      if (storedCheckins) setCheckins(JSON.parse(storedCheckins));

      const storedMoments = localStorage.getItem('teacher_wellbeing_moments');
      if (storedMoments) setPositiveMoments(JSON.parse(storedMoments));

      const storedHours = localStorage.getItem('teacher_wellbeing_hours');
      if (storedHours) {
        const parsed = JSON.parse(storedHours);
        if (parsed.week === getWeekNumber(new Date())) {
          setPlanningHours(parsed.hours);
        }
      }

      // Generate Tip
      const tipIndex = new Date().getDate() % WELLBEING_TIPS.length;
      setCurrentTip(WELLBEING_TIPS[tipIndex]);

      // Calculate Achievements based on mocked interop data
      calculateAchievements();

    } catch (e) {
      console.error("Error loading wellbeing data", e);
    }
  }, []);

  // Helper to get week number
  const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
  };

  const calculateAchievements = () => {
    const newAchievements: string[] = [];
    
    // Interop with other modules (mocking reads)
    const classes = JSON.parse(localStorage.getItem('teacher_classes') || '[]');
    const students = JSON.parse(localStorage.getItem('teacher_students') || '[]');
    
    if (classes.length > 0) newAchievements.push('🎉 Turmas configuradas e prontas!');
    if (students.length >= 10) newAchievements.push('⭐ Mais de 10 alunos sob sua tutela!');
    
    // Self achievements
    const storedCheckins = JSON.parse(localStorage.getItem('teacher_wellbeing_checkins') || '[]');
    if (storedCheckins.length >= 7) newAchievements.push('🧘‍♀️ 7 dias seguidos cuidando de você!');
    
    if (newAchievements.length === 0) {
      newAchievements.push('🌟 Bem-vindo à sua jornada de autocuidado!');
    }
    
    setAchievements(newAchievements);
    
    // Trigger confetti if this is the first time seeing these specific achievements
    const prevAchievements = localStorage.getItem('teacher_achievements_seen');
    if (prevAchievements !== JSON.stringify(newAchievements)) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      localStorage.setItem('teacher_achievements_seen', JSON.stringify(newAchievements));
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleCheckin = () => {
    if (!selectedMood) return;
    
    const newCheckin: CheckIn = {
      date: todayStr,
      mood: selectedMood,
      note: moodNote,
      timestamp: Date.now()
    };
    
    const updated = [...checkins, newCheckin];
    setCheckins(updated);
    localStorage.setItem('teacher_wellbeing_checkins', JSON.stringify(updated));
    showToast('Check-in salvo com sucesso!');
  };

  const handleSaveMoment = () => {
    if (!momentText.trim()) return;
    
    const newMoment: PositiveMoment = {
      id: Date.now().toString(),
      date: todayStr,
      text: momentText,
      timestamp: Date.now()
    };
    
    const updated = [newMoment, ...positiveMoments];
    setPositiveMoments(updated);
    localStorage.setItem('teacher_wellbeing_moments', JSON.stringify(updated));
    setMomentText('');
    showToast('Vitória registrada! 🎉');
  };

  const handleSaveHours = () => {
    const hours = parseInt(hoursInput);
    if (isNaN(hours) || hours < 0) return;
    
    const newTotal = planningHours + hours;
    setPlanningHours(newTotal);
    
    localStorage.setItem('teacher_wellbeing_hours', JSON.stringify({
      week: getWeekNumber(new Date()),
      hours: newTotal
    }));
    
    setHoursInput('');
    showToast('Horas registradas!');
  };

  // Burnout check
  const isBurnoutRisk = () => {
    if (checkins.length < 3) return false;
    const last3 = checkins.slice(-3);
    // If all last 3 checkins are mood 1 or 2
    return last3.every(c => c.mood <= 2);
  };

  // Weekly mood data
  const getWeeklyMoodData = () => {
    const last7Days = Array.from({length: 7}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    return last7Days.map(date => {
      const checkin = checkins.find(c => c.date === date);
      return {
        date: date.substring(5), // MM-DD
        mood: checkin ? checkin.mood : 0,
        color: checkin ? MOODS.find(m => m.value === checkin.mood)?.color || '#333' : '#2d3748'
      };
    });
  };

  const weeklyData = getWeeklyMoodData();

  return (
    <div style={styles.container}>
      {toast && <div style={styles.toast}>{toast}</div>}
      
      {showConfetti && (
        <div style={styles.confetti}>
          <div style={{ position: 'absolute', top: '10%', left: '50%', fontSize: '48px', animation: 'slideUp 2s ease-out forwards', opacity: 0 }}>🎉</div>
          <div style={{ position: 'absolute', top: '20%', left: '30%', fontSize: '32px', animation: 'slideUp 2s ease-out 0.2s forwards', opacity: 0 }}>✨</div>
          <div style={{ position: 'absolute', top: '15%', left: '70%', fontSize: '40px', animation: 'slideUp 2s ease-out 0.4s forwards', opacity: 0 }}>🏆</div>
        </div>
      )}

      <header style={styles.header}>
        <h1 style={styles.title}>Bem-Estar do Professor</h1>
      </header>

      {isBurnoutRisk() && (
        <div style={styles.burnoutBanner}>
          <i className="ti ti-alert-triangle-filled" style={{ fontSize: '24px' }}></i>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Alerta de Cuidado</h3>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
              Você parece cansado(a) há alguns dias. Lembre-se: professores que cuidam de si ensinam melhor. 
              Tente tirar um tempo extra para você hoje, delegue tarefas se possível ou converse com a coordenação.
            </p>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {/* CHECK-IN CARD */}
        <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
          <h2 style={styles.cardTitle}>
            <i className="ti ti-mood-smile"></i>
            Como você está hoje?
          </h2>
          
          {hasCheckedInToday ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#69db7c' }}>
              <i className="ti ti-check" style={{ fontSize: '32px', marginBottom: '8px' }}></i>
              <p style={{ margin: 0 }}>Check-in realizado hoje! Obrigado por cuidar de você.</p>
            </div>
          ) : (
            <>
              <div style={styles.moodContainer}>
                {MOODS.map(m => (
                  <button
                    key={m.value}
                    style={{
                      ...styles.moodBtn,
                      ...(selectedMood === m.value ? styles.moodBtnActive : {})
                    }}
                    onClick={() => setSelectedMood(m.value)}
                  >
                    <span style={styles.moodEmoji}>{m.emoji}</span>
                    <span style={styles.moodLabel}>{m.label}</span>
                  </button>
                ))}
              </div>
              
              <textarea
                style={{...styles.input, marginTop: '8px'}}
                placeholder="O que está pesando? (Opcional)"
                value={moodNote}
                onChange={e => setMoodNote(e.target.value)}
              />
              
              <button 
                style={{...styles.button, alignSelf: 'flex-end', ...( !selectedMood ? styles.buttonDisabled : {})}}
                disabled={!selectedMood}
                onClick={handleCheckin}
              >
                Salvar Check-in
              </button>
            </>
          )}
        </div>

        {/* WEEKLY DASHBOARD */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            <i className="ti ti-chart-line"></i>
            Sua semana em resumo
          </h2>
          <div style={styles.chartContainer}>
            {weeklyData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div 
                  style={{
                    width: '60%',
                    backgroundColor: d.color,
                    height: d.mood ? `${(d.mood / 5) * 100}%` : '4px',
                    borderRadius: '4px 4px 0 0',
                    transition: 'all 0.3s ease'
                  }}
                  title={`Humor: ${d.mood}/5`}
                />
                <span style={{ fontSize: '10px', color: '#a0aec0', marginTop: '8px' }}>{d.date}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: '#a0aec0', textAlign: 'center', margin: '8px 0 0 0' }}>
            {checkins.filter(c => c.mood >= 4).length} dias positivos nos últimos registros.
          </p>
        </div>

        {/* DAILY TIP */}
        <div style={styles.tipCard}>
          <div style={{ backgroundColor: 'rgba(142, 68, 173, 0.3)', padding: '12px', borderRadius: '50%' }}>
            <i className="ti ti-bulb" style={{ fontSize: '24px', color: '#b19cd9' }}></i>
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#e2e8f0' }}>Dica do Dia</h3>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#d5d6d9' }}>
            "{currentTip}"
          </p>
        </div>

        {/* POSITIVE MOMENTS */}
        <div style={{ ...styles.card, gridRow: 'span 2' }}>
          <h2 style={styles.cardTitle}>
            <i className="ti ti-star"></i>
            Registro de Vitórias
          </h2>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="text"
              style={{...styles.input, minHeight: 'auto'}}
              placeholder="Ex: Aluno usou Past Perfect espontaneamente!"
              value={momentText}
              onChange={e => setMomentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveMoment()}
            />
            <button style={styles.button} onClick={handleSaveMoment}>
              <i className="ti ti-plus"></i>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
            {positiveMoments.length === 0 ? (
              <p style={{ color: '#a0aec0', fontSize: '14px', textAlign: 'center', marginTop: '24px' }}>
                Nenhum momento registrado ainda. Celebre suas pequenas vitórias!
              </p>
            ) : (
              positiveMoments.slice(0, 10).map(moment => (
                <div key={moment.id} style={styles.momentItem}>
                  <div style={styles.momentDot} />
                  <div style={styles.momentDate}>
                    {new Date(moment.timestamp).toLocaleDateString('pt-BR')}
                  </div>
                  <div style={styles.momentText}>{moment.text}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PLANNING HOURS */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            <i className="ti ti-clock"></i>
            Horas Extras (Semana)
          </h2>
          
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '48px', fontWeight: 700, color: planningHours > 10 ? '#ff6b6b' : '#69db7c', lineHeight: 1 }}>
              {planningHours}h
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#a0aec0' }}>Adicionar horas hoje:</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  min="0"
                  style={{...styles.input, minHeight: 'auto', width: '80px'}}
                  value={hoursInput}
                  onChange={e => setHoursInput(e.target.value)}
                />
                <button style={styles.button} onClick={handleSaveHours}>Add</button>
              </div>
            </div>
          </div>

          {planningHours > 10 && (
            <div style={{ backgroundColor: 'rgba(255, 169, 77, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 169, 77, 0.3)', color: '#ffa94d', fontSize: '13px', lineHeight: 1.5 }}>
              <strong>Atenção:</strong> Você já passou de 10h extras esta semana. Que tal delegar a criação de atividades para a Rafinha (Assistente AI) e descansar?
            </div>
          )}
        </div>

        {/* ACHIEVEMENTS */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            <i className="ti ti-medal"></i>
            Suas Conquistas
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {achievements.map((ach, idx) => (
              <div key={idx} style={styles.achievementItem}>
                <span style={{ fontSize: '14px', color: '#e2e8f0' }}>{ach}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
