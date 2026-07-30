'use client';

import React, { useState, useEffect, useMemo, CSSProperties } from 'react';

// --- Types ---
interface Student {
  id: string;
  name: string;
  classId: string;
  level: string;
}

interface Class {
  id: string;
  name: string;
  level: string;
}

interface SkillData {
  subject: string;
  A: number;
  fullMark: number;
}

interface TimelineData {
  month: string;
  grade: number;
  participation: number;
}

// --- Mock Data Generators (if no real data is found) ---
const generateMockSkills = (): SkillData[] => [
  { subject: 'Speaking', A: Math.floor(Math.random() * 40) + 60, fullMark: 100 },
  { subject: 'Listening', A: Math.floor(Math.random() * 40) + 60, fullMark: 100 },
  { subject: 'Reading', A: Math.floor(Math.random() * 40) + 60, fullMark: 100 },
  { subject: 'Writing', A: Math.floor(Math.random() * 40) + 60, fullMark: 100 },
  { subject: 'Grammar', A: Math.floor(Math.random() * 40) + 60, fullMark: 100 },
  { subject: 'Vocabulary', A: Math.floor(Math.random() * 40) + 60, fullMark: 100 },
];

const generateMockTimeline = (): TimelineData[] => {
  const months = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  return months.map((month) => ({
    month,
    grade: Math.floor(Math.random() * 30) + 70,
    participation: Math.floor(Math.random() * 40) + 60,
  }));
};

// --- Styles ---
const theme = {
  bg: '#0f1117',
  card: '#1a1d2e',
  text: '#ffffff',
  textMuted: '#94a3b8',
  primary: '#6366f1',
  primaryHover: '#4f46e5',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  border: '#2e334a',
};

const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: theme.bg,
    color: theme.text,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '24px',
    minHeight: '100vh',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: '12px',
    padding: '24px',
    border: `1px solid ${theme.border}`,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    marginBottom: '24px',
  },
  select: {
    padding: '10px 16px',
    backgroundColor: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '15px',
    outline: 'none',
    width: '300px',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '24px',
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: '16px',
    fontSize: '18px',
    fontWeight: 500,
    color: theme.text,
  },
  badge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
  },
  button: {
    padding: '10px 20px',
    backgroundColor: theme.primary,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background-color 0.2s',
  },
  alertCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderLeft: `4px solid ${theme.warning}`,
    padding: '16px',
    borderRadius: '0 8px 8px 0',
    marginBottom: '16px',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    backgroundColor: theme.success,
    color: 'white',
    padding: '12px 24px',
    borderRadius: '8px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    zIndex: 1000,
    animation: 'slideIn 0.3s ease-out',
  },
};

// --- Helper Components ---
const RadarChart = ({ data }: { data: SkillData[] }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 30;

  const getPoint = (value: number, index: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const distance = (value / 100) * radius;
    return {
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
    };
  };

  const points = data.map((d, i) => {
    const p = getPoint(d.A, i, data.length);
    return `${p.x},${p.y}`;
  }).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background circles */}
      {[1, 0.8, 0.6, 0.4, 0.2].map((scale, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={radius * scale}
          fill="none"
          stroke={theme.border}
          strokeWidth="1"
        />
      ))}
      
      {/* Axes and Labels */}
      {data.map((d, i) => {
        const endPoint = getPoint(100, i, data.length);
        const labelPoint = getPoint(115, i, data.length);
        return (
          <g key={i}>
            <line
              x1={center}
              y1={center}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke={theme.border}
              strokeWidth="1"
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              fill={theme.textMuted}
              fontSize="12"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {d.subject}
            </text>
          </g>
        );
      })}

      {/* Data Polygon */}
      <polygon
        points={points}
        fill="rgba(99, 102, 241, 0.2)"
        stroke={theme.primary}
        strokeWidth="2"
      />
      
      {/* Data Points */}
      {data.map((d, i) => {
        const p = getPoint(d.A, i, data.length);
        return (
          <circle
            key={`p-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill={theme.primary}
          />
        );
      })}
    </svg>
  );
};

const LineChart = ({ data }: { data: TimelineData[] }) => {
  const width = 400;
  const height = 200;
  const padding = 30;
  
  const maxX = data.length - 1;
  const maxY = 100;
  const minY = 50;
  
  const getX = (index: number) => padding + (index * (width - padding * 2)) / maxX;
  const getY = (value: number) => height - padding - ((value - minY) / (maxY - minY)) * (height - padding * 2);

  const gradePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.grade)}`).join(' ');
  const partPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.participation)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Grid */}
      {[50, 75, 100].map(val => (
        <g key={val}>
          <text x="0" y={getY(val)} fill={theme.textMuted} fontSize="10" dominantBaseline="middle">{val}</text>
          <line x1={padding} y1={getY(val)} x2={width} y2={getY(val)} stroke={theme.border} strokeDasharray="4 4" />
        </g>
      ))}

      {/* X Axis Labels */}
      {data.map((d, i) => (
        <text key={i} x={getX(i)} y={height - 10} fill={theme.textMuted} fontSize="10" textAnchor="middle">
          {d.month}
        </text>
      ))}

      {/* Paths */}
      <path d={gradePath} fill="none" stroke={theme.primary} strokeWidth="3" />
      <path d={partPath} fill="none" stroke={theme.success} strokeWidth="3" strokeDasharray="4 4" />
      
      {/* Points */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={getX(i)} cy={getY(d.grade)} r="4" fill={theme.primary} />
          <circle cx={getX(i)} cy={getY(d.participation)} r="4" fill={theme.success} />
        </g>
      ))}
    </svg>
  );
};

// --- Main Component ---
export default function ProgressTracker() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  const [skillsData, setSkillsData] = useState<SkillData[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineData[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    try {
      const storedStudents = localStorage.getItem('teacher_students');
      const storedClasses = localStorage.getItem('teacher_classes');
      
      if (storedStudents) {
        setStudents(JSON.parse(storedStudents));
      } else {
        setStudents([
          { id: '1', name: 'Alice Smith', classId: 'c1', level: 'Intermediate' },
          { id: '2', name: 'Bob Jones', classId: 'c1', level: 'Intermediate' },
        ]);
      }
      
      if (storedClasses) {
        setClasses(JSON.parse(storedClasses));
      }
    } catch (e) {
      console.error('Failed to parse local storage data', e);
    }
  }, []);

  // Update selected student data
  useEffect(() => {
    if (selectedStudentId) {
      // In a real app, this would fetch specific student data
      setSkillsData(generateMockSkills());
      setTimelineData(generateMockTimeline());
    } else {
      setSkillsData([]);
      setTimelineData([]);
    }
  }, [selectedStudentId]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  const handleExport = () => {
    setToastMessage('Relatório gerado com sucesso! Iniciando download...');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      
      <div style={styles.header}>
        <h1 style={styles.title}>
          <i className="ti ti-chart-radar" style={{ color: theme.primary, fontSize: '28px' }}></i>
          Evolução & Diagnóstico
        </h1>
        <button style={styles.button} onClick={handleExport} disabled={!selectedStudentId}>
          <i className="ti ti-download"></i> Exportar Relatório
        </button>
      </div>

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Selecionar Aluno</h2>
        <select 
          style={styles.select}
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
        >
          <option value="">Selecione um aluno...</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name} ({student.level})
            </option>
          ))}
        </select>
      </div>

      {selectedStudent && (
        <div style={styles.grid}>
          {/* Radar Chart Card */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>
              <i className="ti ti-chart-arcs" style={{ marginRight: '8px' }}></i>
              Habilidades
            </h2>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
              <RadarChart data={skillsData} />
            </div>
          </div>

          {/* Timeline Chart Card */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>
              <i className="ti ti-chart-line" style={{ marginRight: '8px' }}></i>
              Evolução Temporal
            </h2>
            <div style={{ marginBottom: '16px', display: 'flex', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: theme.textMuted }}>
                <span style={{ width: '12px', height: '3px', backgroundColor: theme.primary }}></span>
                Notas
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: theme.textMuted }}>
                <span style={{ width: '12px', height: '3px', borderTop: `2px dashed ${theme.success}` }}></span>
                Participação
              </div>
            </div>
            <div style={{ marginTop: '24px' }}>
              <LineChart data={timelineData} />
            </div>
          </div>

          {/* AI Diagnostic Card */}
          <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
            <h2 style={{ ...styles.sectionTitle, color: theme.primary }}>
              <i className="ti ti-robot" style={{ marginRight: '8px' }}></i>
              IA Diagnostic - Predição e Alertas
            </h2>
            
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '20px' }}>
              
              <div style={{ flex: '1 1 300px' }}>
                <div style={styles.alertCard}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: theme.warning, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-alert-triangle"></i> Atenção: Queda em Gramática
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: theme.textMuted }}>
                    Detectamos uma queda de 15% nas pontuações de gramática nos últimos 30 dias. 
                    A tendência indica dificuldade com os tópicos recentes (Past Perfect).
                  </p>
                </div>
                
                <div style={{ ...styles.alertCard, borderLeftColor: theme.success, backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: theme.success, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-trending-up"></i> Ponto Forte: Speaking
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: theme.textMuted }}>
                    Participação ativa nas aulas de conversação cresceu exponencialmente. 
                    Fluência acima da média da turma.
                  </p>
                </div>
              </div>

              <div style={{ flex: '1 1 300px', backgroundColor: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-bulb" style={{ color: theme.primary }}></i>
                  Plano de Intervenção Sugerido
                </h3>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: theme.textMuted, lineHeight: '1.8' }}>
                  <li>Designar exercícios extras de Past Perfect (disponíveis no módulo de atividades).</li>
                  <li>Incentivar leitura de contos curtos para exposição natural a tempos verbais passados.</li>
                  <li>Agendar 10 minutos de monitoria focada em estruturas frasais.</li>
                </ul>
                <button style={{ ...styles.button, width: '100%', justifyContent: 'center', marginTop: '16px', backgroundColor: 'transparent', border: `1px solid ${theme.primary}`, color: theme.primary }}>
                  Aplicar Intervenção
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div style={styles.toast}>
          <i className="ti ti-check" style={{ fontSize: '20px' }}></i>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
