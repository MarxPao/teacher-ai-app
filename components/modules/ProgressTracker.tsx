'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens';

import React, { useState, useEffect, useMemo, CSSProperties } from 'react';
import { exportToPdf } from '@/lib/exportUtils';
import { getStudentMemory } from '@/lib/studentMemory';

// --- Types ---
interface Student {
  id: string;
  name: string;
  classId: string;
  schoolId?: string;
  level?: string;
  grades?: Record<string, string | number>;
}

interface Class {
  id: string;
  name: string;
  level?: string;
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

// --- Styles ---
const theme = {
  bg: '#fdf8f2',
  card: '#fffcf8',
  text: '#2c1a0e',
  textMuted: '#7a5c42',
  primary: '#8b5e3c',
  primaryHover: '#b5805a',
  success: '#3d7a4e',
  warning: '#c87a1e',
  danger: '#a83232',
  border: 'rgba(139,115,85,0.12)',
};

const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: theme.bg,
    color: theme.text,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    padding: '36px 40px',
    minHeight: '100vh',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
    paddingBottom: '20px',
    borderBottom: `1px solid ${theme.border}`,
  },
  title: {
    margin: 0,
    fontSize: '1.8rem',
    fontWeight: 700,
    fontFamily: "'Fraunces', Georgia, serif",
    color: theme.text,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: '16px',
    padding: '28px',
    border: `1px solid ${theme.border}`,
    boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
    marginBottom: '24px',
  },
  select: {
    padding: '10px 14px',
    backgroundColor: theme.card,
    color: theme.text,
    border: '1px solid rgba(139,115,85,0.18)',
    borderRadius: '9px',
    fontSize: TEXT.body,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    outline: 'none',
    width: '320px',
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
    fontSize: '1.4rem',
    fontWeight: 700,
    fontFamily: "'Fraunces', Georgia, serif",
    color: theme.text,
  },
  badge: {
    padding: '3px 10px',
    borderRadius: '99px',
    fontSize: '11px',
    fontWeight: 600,
  },
  button: {
    padding: '10px 20px',
    backgroundColor: theme.primary,
    color: '#fffcf8',
    border: 'none',
    borderRadius: '9px',
    fontSize: TEXT.body,
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 2px 8px rgba(139,94,60,0.3)',
    transition: 'all 0.18s ease',
  },
  alertCard: {
    backgroundColor: 'rgba(200, 122, 30, 0.1)',
    borderLeft: `4px solid ${theme.warning}`,
    padding: '16px',
    borderRadius: '0 12px 12px 0',
    marginBottom: '16px',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    backgroundColor: theme.success,
    color: '#fffcf8',
    padding: '12px 24px',
    borderRadius: '9px',
    boxShadow: '0 4px 12px rgba(44,26,14,0.15)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    zIndex: 1000,
    animation: 'slideIn 0.3s ease-out',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
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
          strokeDasharray={scale === 1 ? "none" : "2,2"}
        />
      ))}

      {/* Axis lines and labels */}
      {data.map((d, i) => {
        const point = getPoint(100, i, data.length);
        const labelPoint = getPoint(115, i, data.length);
        return (
          <g key={i}>
            <line
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke={theme.border}
              strokeWidth="1"
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              fill={theme.textMuted}
              fontSize="11"
              fontWeight="600"
              fontFamily="'Plus Jakarta Sans', sans-serif"
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
        fill="rgba(139, 94, 60, 0.2)"
        stroke={theme.primary}
        strokeWidth="2"
      />

      {/* Data Points */}
      {data.map((d, i) => {
        const p = getPoint(d.A, i, data.length);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill={theme.primary}
            stroke="#fffcf8"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
};

const LineChart = ({ data }: { data: TimelineData[] }) => {
  const width = 450;
  const height = 220;
  const padding = 35;

  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted, fontSize: '13px' }}>
        Sem dados de evolução histórica suficientes para gerar o gráfico de linha.
      </div>
    );
  }

  const getX = (index: number) => padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
  const getY = (value: number) => height - padding - ((value - 40) / 60) * (height - padding * 2);

  const gradePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.grade)}`).join(' ');
  const partPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.participation)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Grid lines */}
      {[40, 60, 80, 100].map((val) => (
        <g key={val}>
          <text x="0" y={getY(val)} fill={theme.textMuted} fontSize="10" dominantBaseline="middle" fontFamily="'Plus Jakarta Sans', sans-serif">
            {val}
          </text>
          <line
            x1={padding}
            y1={getY(val)}
            x2={width}
            y2={getY(val)}
            stroke={theme.border}
            strokeDasharray="3,3"
          />
        </g>
      ))}

      {/* Axis */}
      {data.map((d, i) => (
        <text
          key={i}
          x={getX(i)}
          y={height - 10}
          fill={theme.textMuted}
          fontSize="10"
          textAnchor="middle"
          fontFamily="'Plus Jakarta Sans', sans-serif"
        >
          {d.month}
        </text>
      ))}

      {/* Paths */}
      <path d={gradePath} fill="none" stroke={theme.primary} strokeWidth="3" />
      <path d={partPath} fill="none" stroke={theme.success} strokeWidth="2" strokeDasharray="4,4" />

      {/* Data points */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={getX(i)} cy={getY(d.grade)} r="4" fill={theme.primary} />
          <circle cx={getX(i)} cy={getY(d.participation)} r="3" fill={theme.success} />
        </g>
      ))}
    </svg>
  );
};

export default function ProgressTracker() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  const [skillsData, setSkillsData] = useState<SkillData[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [aiDiagnosis, setAiDiagnosis] = useState<{
    warning: string;
    strength: string;
    interventions: string[];
  }>({
    warning: 'Carregando dados reais do aluno...',
    strength: 'Aguardando seleção...',
    interventions: []
  });

  // Load initial real data
  useEffect(() => {
    try {
      const storedStudents = localStorage.getItem('teacher_students');
      const storedClasses = localStorage.getItem('teacher_classes');
      
      const parsedStudents: Student[] = storedStudents ? JSON.parse(storedStudents) : [];
      const parsedClasses: Class[] = storedClasses ? JSON.parse(storedClasses) : [];

      setStudents(parsedStudents);
      setClasses(parsedClasses);

      if (parsedStudents.length > 0) {
        setSelectedStudentId(parsedStudents[0].id);
      }
    } catch (e) {
      console.error('Failed to parse student data', e);
    }
  }, []);

  // Compute real skill data and timeline when a student is selected
  useEffect(() => {
    if (!selectedStudentId) {
      setSkillsData([]);
      setTimelineData([]);
      return;
    }

    const currentStudent = students.find(s => s.id === selectedStudentId);
    if (!currentStudent) return;

    // 1. Carrega métricas individuais salvas em teacher_student_metrics
    let customMetricsScores: Record<string, number> = {};
    try {
      const allMetrics = JSON.parse(localStorage.getItem('teacher_student_metrics') || '[]');
      const match = allMetrics.find((m: { entityId?: string; studentId?: string }) => (m.entityId === selectedStudentId || m.studentId === selectedStudentId));
      if (match?.scores) {
        customMetricsScores = match.scores;
      }
    } catch {}

    // 2. Extrai e calcula notas reais cadastradas no Gradebook
    const gradeEntries = currentStudent.grades 
      ? Object.entries(currentStudent.grades).map(([k, v]) => ({ name: k.toLowerCase(), val: Number(v) })).filter(g => !isNaN(g.val) && g.val >= 0)
      : [];

    const hasGrades = gradeEntries.length > 0;
    const hasScores = Object.keys(customMetricsScores).length > 0;
    const hasAnyData = hasGrades || hasScores;

    let avgGradePct = 0;
    if (hasGrades) {
      const sum = gradeEntries.reduce((acc, curr) => acc + curr.val, 0);
      avgGradePct = Math.round((sum / gradeEntries.length) * 10); // 0-10 -> 0-100
    } else if (hasScores) {
      const scoreVals = Object.values(customMetricsScores);
      avgGradePct = Math.round((scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length) * 10);
    }

    // Helper para buscar nota por palavra-chave na avaliação
    const findGradeByKeyword = (keywords: string[]): number | null => {
      const match = gradeEntries.find(g => keywords.some(k => g.name.includes(k)));
      return match ? Math.round(match.val * 10) : null;
    };

    // 3. Monta as 6 habilidades estritamente a partir de dados reais (0 se ausente)
    if (!hasAnyData) {
      setSkillsData([
        { subject: 'Speaking', A: 0, fullMark: 100 },
        { subject: 'Listening', A: 0, fullMark: 100 },
        { subject: 'Reading', A: 0, fullMark: 100 },
        { subject: 'Writing', A: 0, fullMark: 100 },
        { subject: 'Grammar', A: 0, fullMark: 100 },
        { subject: 'Vocabulary', A: 0, fullMark: 100 },
      ]);
      setTimelineData([]);
      setAiDiagnosis({
        strength: 'Aguardando Lançamentos: Aluno cadastrado no sistema.',
        warning: 'Sem Dados Suficientes: Nenhuma nota ou métrica registrada para este aluno ainda. Lance notas no Gradebook ou no OmniGrader para gerar o diagnóstico.',
        interventions: [
          'Lançar notas de avaliações no Gradebook',
          'Avaliar competências individuais no menu Analytics'
        ]
      });
      return;
    }

    const speaking = customMetricsScores.oral != null ? customMetricsScores.oral * 10 : (findGradeByKeyword(['speaking', 'oral', 'apresentacao']) ?? avgGradePct);
    const listening = customMetricsScores.oral != null ? customMetricsScores.oral * 10 : (findGradeByKeyword(['listening', 'audio', 'compreensao']) ?? avgGradePct);
    const reading = customMetricsScores.academic != null ? customMetricsScores.academic * 10 : (findGradeByKeyword(['reading', 'leitura', 'texto']) ?? avgGradePct);
    const writing = customMetricsScores.writing != null ? customMetricsScores.writing * 10 : (findGradeByKeyword(['writing', 'redacao', 'escrita']) ?? avgGradePct);
    const grammar = customMetricsScores.grammar != null ? customMetricsScores.grammar * 10 : (findGradeByKeyword(['grammar', 'gramatica']) ?? avgGradePct);
    const vocabulary = customMetricsScores.vocabulary != null ? customMetricsScores.vocabulary * 10 : (findGradeByKeyword(['vocab', 'vocabulario', 'quiz']) ?? avgGradePct);

    const realSkills: SkillData[] = [
      { subject: 'Speaking', A: speaking, fullMark: 100 },
      { subject: 'Listening', A: listening, fullMark: 100 },
      { subject: 'Reading', A: reading, fullMark: 100 },
      { subject: 'Writing', A: writing, fullMark: 100 },
      { subject: 'Grammar', A: grammar, fullMark: 100 },
      { subject: 'Vocabulary', A: vocabulary, fullMark: 100 },
    ];
    setSkillsData(realSkills);

    // 4. Monta linha do tempo a partir de notas reais
    const realTimeline: TimelineData[] = [];
    if (gradeEntries.length > 0) {
      gradeEntries.forEach(g => {
        realTimeline.push({
          month: g.name.slice(0, 10),
          grade: Math.round(g.val * 10),
          participation: customMetricsScores.engagement ? customMetricsScores.engagement * 10 : 80
        });
      });
    } else {
      realTimeline.push({
        month: 'Atual',
        grade: avgGradePct,
        participation: customMetricsScores.engagement ? customMetricsScores.engagement * 10 : 80
      });
    }
    setTimelineData(realTimeline);

    // 5. Diagnóstico pedagógico baseado estritamente nos dados reais
    const memory = getStudentMemory(selectedStudentId);
    const obsNotes = memory?.observations?.map(o => o.note).join(', ') || '';

    if (avgGradePct >= 80) {
      setAiDiagnosis({
        strength: 'Alto Rendimento: Demonstra consistência nas avaliações e domínio dos tópicos trabalhados.',
        warning: obsNotes ? `Observação ativa: ${obsNotes.slice(0, 120)}` : 'Manter desafios avançados e leitura autônoma.',
        interventions: ['Indicar leituras graduadas nível B1/B2', 'Propor liderança em atividades orais em grupo']
      });
    } else if (avgGradePct >= 60) {
      setAiDiagnosis({
        strength: 'Evolução Estável: Bom aproveitamento geral com oportunidades pontuais de aprofundamento.',
        warning: obsNotes ? `Atenção: ${obsNotes.slice(0, 120)}` : 'Reforçar fixação de vocabulário e tempos verbais.',
        interventions: ['Prática com flashcards de vocabulário', 'Exercícios estruturados de gramática aplicada']
      });
    } else {
      setAiDiagnosis({
        strength: 'Participação: Demonstra interesse nas dinâmicas de sala de aula.',
        warning: 'Alerta Pedagógico: Média avaliativa abaixo de 6,0. Recomenda-se plano de recuperação contínua.',
        interventions: ['Agendar sessão de reforço individual', 'Revisar estruturas básicas e aplicar simulado formativo']
      });
    }
  }, [selectedStudentId, students]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  const selectedClass = useMemo(() => {
    return classes.find(c => c.id === selectedStudent?.classId);
  }, [classes, selectedStudent]);

  // Handle Real AI Diagnosis Refresh
  const handleAiDiagnosis = async () => {
    if (!selectedStudent) return;
    setIsAnalyzing(true);

    try {
      const prompt = `Você é a Rafinha IA assistente pedagógica do TeacherAI.
Analise os dados REAIS do aluno de inglês a seguir:
- Nome: ${selectedStudent.name}
- Turma: ${selectedClass?.name || 'Turma'} (${selectedStudent.level || 'Geral'})
- Habilidades: ${skillsData.map(s => `${s.subject}: ${s.A}%`).join(', ')}
- Histórico de Notas: ${JSON.stringify(selectedStudent.grades || {})}

Retorne um JSON estrito:
{
  "warningTitle": "Ponto de Atenção",
  "warningText": "Descrição clara em 1 frase",
  "strengthTitle": "Ponto Forte",
  "strengthText": "Descrição em 1 frase",
  "interventions": ["Intervenção prática 1", "Intervenção prática 2"]
}`;

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      const rawReply = data?.reply || data?.content || '';
      const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setAiDiagnosis({
          warning: `${parsed.warningTitle || 'Atenção'}: ${parsed.warningText || 'Reforço recomendado em estruturas gramaticais.'}`,
          strength: `${parsed.strengthTitle || 'Ponto Forte'}: ${parsed.strengthText || 'Excelente participação oral e engajamento.'}`,
          interventions: parsed.interventions || []
        });
        setToastMessage('Diagnóstico atualizado pela Rafinha IA!');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error('AI Diagnosis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Real PDF Export
  const handleExport = () => {
    if (!selectedStudent) return;

    const content = `
      <h2>Relatório de Evolução & Diagnóstico Individual</h2>
      <p><strong>Aluno(a):</strong> ${selectedStudent.name} &bull; <strong>Turma:</strong> ${selectedClass?.name || 'Geral'} &bull; <strong>Nível:</strong> ${selectedStudent.level || 'Inglês'}</p>

      <h3>Desempenho por Habilidade Pedagógica</h3>
      <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background:#f5f0eb;">
            <th>Habilidade</th>
            <th>Aproveitamento (%)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${skillsData.map(s => `
            <tr>
              <td><strong>${s.subject}</strong></td>
              <td>${s.A}%</td>
              <td>${s.A >= 80 ? 'Excelente' : s.A >= 60 ? 'Satisfatório' : 'Atenção / Reforço'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h3>Parecer & Diagnóstico da Rafinha IA</h3>
      <p><strong>${aiDiagnosis.strength}</strong></p>
      <p><strong>${aiDiagnosis.warning}</strong></p>

      <h3>Plano de Ação e Intervenções Sugeridas</h3>
      <ul>
        ${aiDiagnosis.interventions.map(i => `<li>${i}</li>`).join('')}
      </ul>
    `;

    exportToPdf({
      schoolName: 'RELATÓRIO DE EVOLUÇÃO & PROGRESSO PEDAGÓGICO',
      teacherName: 'Professor(a)',
      title: `Evolução de ${selectedStudent.name}`,
      className: selectedClass?.name || 'Turma',
      content,
      showStudentNameBox: false,
      showGradeBox: false
    });
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
          <i className="ti ti-download"></i> Exportar Relatório Oficial (PDF)
        </button>
      </div>

      {students.length === 0 ? (
        <div style={{ ...styles.card, textAlign: 'center', padding: '40px 20px', color: theme.textMuted }}>
          <i className="ti ti-users" style={{ fontSize: '32px', marginBottom: '12px', display: 'block', color: theme.primary }}></i>
          <h3 style={{ margin: '0 0 8px 0', color: theme.text }}>Nenhum Aluno Encontrado</h3>
          <p style={{ margin: 0, fontSize: TEXT.body }}>Cadastre suas turmas e alunos no menu <strong>Alunos & Turmas</strong> para visualizar o progresso e o radar de habilidades com dados reais.</p>
        </div>
      ) : (
        <>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Selecionar Aluno</h2>
            <select 
              style={styles.select}
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} {student.level ? `(${student.level})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedStudent && (
            <div style={styles.grid}>
              {/* Radar de Habilidades */}
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Radar de Habilidades</h2>
                  <span style={{ fontSize: '11px', color: theme.textMuted, background: '#f5efe6', padding: '3px 8px', borderRadius: '6px' }}>
                    Dados Reais da Caderneta
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RadarChart data={skillsData} />
                </div>
              </div>

              {/* Linha do Tempo */}
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Evolução Histórica</h2>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '3px', backgroundColor: theme.primary }}></div>
                    <span>Média de Notas</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '3px', backgroundColor: theme.success }}></div>
                    <span>Participação</span>
                  </div>
                </div>
                <LineChart data={timelineData} />
              </div>

              {/* Diagnóstico da IA */}
              <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Diagnóstico Pedagógico da Rafinha</h2>
                  <button 
                    style={{ ...styles.button, padding: '6px 14px', fontSize: '12px' }}
                    onClick={handleAiDiagnosis}
                    disabled={isAnalyzing}
                  >
                    <i className="ti ti-refresh"></i> {isAnalyzing ? 'Analisando...' : 'Reavaliar com IA'}
                  </button>
                </div>

                <div style={styles.alertCard}>
                  <strong style={{ color: theme.warning, display: 'block', marginBottom: '4px' }}>⚠️ Ponto de Atenção:</strong>
                  <span style={{ fontSize: TEXT.body }}>{aiDiagnosis.warning}</span>
                </div>

                <div style={{ ...styles.alertCard, backgroundColor: 'rgba(61, 122, 78, 0.1)', borderLeft: `4px solid ${theme.success}` }}>
                  <strong style={{ color: theme.success, display: 'block', marginBottom: '4px' }}>✨ Ponto Forte:</strong>
                  <span style={{ fontSize: TEXT.body }}>{aiDiagnosis.strength}</span>
                </div>

                {aiDiagnosis.interventions.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <strong style={{ fontSize: '13px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Intervenções Recomendadas:</strong>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: TEXT.body }}>
                      {aiDiagnosis.interventions.map((intv, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{intv}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {toastMessage && (
        <div style={styles.toast}>
          <i className="ti ti-check"></i>
          {toastMessage}
        </div>
      )}
    </div>
  );
}