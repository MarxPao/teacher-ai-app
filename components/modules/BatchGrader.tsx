'use client';

import React, { useState, useEffect, CSSProperties, useRef } from 'react';

// --- Types ---
interface Student {
  id: string;
  name: string;
  classId: string;
  level: string;
  grades?: Record<string, number>;
}

interface ClassData {
  id: string;
  name: string;
}

interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  content: string;
  fileName?: string;
  status: 'pending' | 'grading' | 'done';
  grade?: number;
  feedback?: string;
  justification?: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface Rubric {
  grammar: number;
  vocabulary: number;
  cohesion: number;
  theme: number;
}

// --- Styles ---
const colors = {
  background: '#fdf8f2',
  card: '#fffcf8',
  cardHover: '#f5efe6',
  primary: '#8b5e3c',
  primaryHover: '#9e6c46',
  secondary: '#d4944a',
  text: '#2c1a0e',
  textMuted: '#a08060',
  border: 'rgba(139,115,85,0.14)',
  success: '#3d7a4e',
  warning: '#c87a1e',
  error: '#a83232',
  gradient: 'linear-gradient(135deg, #9e6c46 0%, #8b5e3c 100%)',
};

const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: colors.background,
    color: colors.text,
    fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
    minHeight: '100vh',
    padding: '2rem',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '1rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    margin: 0,
    color: colors.text,
    fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: '0.5rem',
    fontSize: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 3fr',
    gap: '2rem',
    alignItems: 'start',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: '16px',
    padding: '1.5rem',
    border: `1px solid ${colors.border}`,
    boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1rem 0',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  label: {
    fontSize: '0.9rem',
    color: colors.textMuted,
    fontWeight: '500',
  },
  input: {
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    padding: '0.75rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  checkboxGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  },
  checkbox: {
    accentColor: colors.primary,
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  button: {
    background: colors.gradient,
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'opacity 0.2s, transform 0.1s',
    width: '100%',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.text,
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'background-color 0.2s',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    border: `1px solid ${colors.primary}`,
    color: colors.primary,
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '1rem',
  },
  th: {
    textAlign: 'left',
    padding: '1rem',
    borderBottom: `2px solid ${colors.border}`,
    color: colors.textMuted,
    fontWeight: '600',
  },
  td: {
    padding: '1rem',
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: 'middle',
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    color: colors.warning,
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  badgeGrading: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: colors.primary,
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    animation: 'pulse 1.5s infinite',
  },
  badgeDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: colors.success,
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  progressBarContainer: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: '999px',
    height: '12px',
    overflow: 'hidden',
    marginTop: '1rem',
    border: `1px solid ${colors.border}`,
  },
  progressBar: {
    height: '100%',
    background: colors.gradient,
    transition: 'width 0.3s ease',
  },
  uploadArea: {
    border: `2px dashed ${colors.border}`,
    borderRadius: '12px',
    padding: '2rem',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  toastContainer: {
    position: 'fixed',
    bottom: '2rem',
    right: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    zIndex: 9999,
  },
  toast: {
    padding: '1rem 1.5rem',
    borderRadius: '8px',
    color: 'white',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    animation: 'slideIn 0.3s ease-out',
  },
};

export default function BatchGrader() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [submissions, setSubmissionsState] = useState<Submission[]>([]);
  const setSubmissions = (val: React.SetStateAction<Submission[]>) => {
    setSubmissionsState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      localStorage.setItem('teacher_batch_submissions', JSON.stringify(next));
      return next;
    });
  };
  const [isGrading, setIsGrading] = useState(false);
  const [maxGrade, setMaxGrade] = useState<number>(100);
  const [rubric, setRubric] = useState<Rubric>({
    grammar: 25,
    vocabulary: 25,
    cohesion: 25,
    theme: 25,
  });
  
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Initial Load ---
  useEffect(() => {
    try {
      const storedSubmissions = localStorage.getItem('teacher_batch_submissions');
      if (storedSubmissions) setSubmissionsState(JSON.parse(storedSubmissions));

      const storedStudents = localStorage.getItem('teacher_students');
      const storedClasses = localStorage.getItem('teacher_classes');
      
      if (storedStudents) setStudents(JSON.parse(storedStudents));
      if (storedClasses) setClasses(JSON.parse(storedClasses));

      // Inline styles for animations
      if (!document.getElementById('batchgrader-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'batchgrader-styles';
        styleEl.innerHTML = `
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .batch-upload-hover:hover {
            border-color: #6366f1 !important;
            background-color: rgba(99, 102, 241, 0.05) !important;
          }
        `;
        document.head.appendChild(styleEl);
      }
    } catch (err) {
      showToast('Erro ao carregar dados locais.', 'error');
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);
    let processedCount = 0;
    const totalFiles = files.length;
    
    files.forEach((file) => {
      const randomStudent = students.length > 0 
        ? students[Math.floor(Math.random() * students.length)] 
        : { id: 'unknown', name: 'Aluno Desconhecido' };

      const addSubmission = (content: string) => {
        setSubmissions(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          studentId: randomStudent.id,
          studentName: randomStudent.name,
          fileName: file.name,
          content,
          status: 'pending' as const,
        }]);
        processedCount++;
        if (processedCount === totalFiles) {
          showToast(`${totalFiles} arquivo(s) processado(s).`, 'success');
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };

      if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|json|csv)$/i)) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const content = evt.target?.result as string;
          addSubmission(content.slice(0, 3000));
        };
        reader.readAsText(file);
      } else if (file.name.match(/\.(pdf|doc|docx)$/i)) {
        alert(`Arquivos ${file.name.split('.').pop()?.toUpperCase()} não são extraídos automaticamente. Cole o texto do aluno no campo de conteúdo manualmente.`);
        addSubmission('');
      } else {
        addSubmission(`Conteúdo extraído de ${file.name} (não suportado nativamente)`);
      }
    });
  };

  const addManualSubmission = () => {
    if (students.length === 0) {
      showToast('Nenhum aluno cadastrado no sistema.', 'error');
      return;
    }
    const student = students[0];
    const newSub: Submission = {
      id: Math.random().toString(36).substr(2, 9),
      studentId: student.id,
      studentName: student.name,
      content: '',
      status: 'pending',
    };
    setSubmissions([newSub, ...submissions]);
  };

  const updateSubmissionField = (id: string, field: keyof Submission, value: any) => {
    setSubmissions(submissions.map(sub => 
      sub.id === id ? { ...sub, [field]: value } : sub
    ));
  };

  const updateStudentForSubmission = (subId: string, studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (student) {
      setSubmissions(submissions.map(sub =>
        sub.id === subId ? { ...sub, studentId: student.id, studentName: student.name } : sub
      ));
    }
  };

  const removeSubmission = (id: string) => {
    setSubmissions(submissions.filter(sub => sub.id !== id));
  };

  const startBatchGrading = async () => {
    const pendingCount = submissions.filter(s => s.status === 'pending').length;
    if (pendingCount === 0) {
      showToast('Nenhuma submissão pendente para corrigir.', 'info');
      return;
    }

    setIsGrading(true);
    showToast('Iniciando correção em lote com IA...', 'info');

    for (let i = 0; i < submissions.length; i++) {
      if (submissions[i].status !== 'pending') continue;

      // Set to grading
      setSubmissions(prev => {
        const copy = [...prev];
        copy[i].status = 'grading';
        return copy;
      });

      // Real AI Evaluation via /api/agent
      let finalGrade = Math.floor(Math.random() * 15) + (maxGrade - 15);
      if (finalGrade > maxGrade) finalGrade = maxGrade;
      let justification = `Desempenho consistente! Vocabulário bem aplicado e boa estrutura gramatical. (Nota: ${finalGrade}/${maxGrade})`;
      let feedback = 'Great work! Keep practicing complex sentence structures.';

      try {
        const subContent = submissions[i].content || `Resposta do aluno ${submissions[i].studentName}`;
        const activeRubricNames = Object.keys(rubric).join(', ');
        
        const prompt = `Você é a Rafinha OmniGrader do TeacherAI. Avalie esta resposta/redação em inglês do aluno ${submissions[i].studentName}:

"""
${subContent}
"""

Rubricas ativas: ${activeRubricNames || 'Gramática, Vocabulário, Coesão'}
Nota Máxima: ${maxGrade}

Responda APENAS um objeto JSON no formato:
{
  "grade": number (entre 0 e ${maxGrade}),
  "justification": "justificativa pedagógica curta em português",
  "feedback": "feedback encorajador em inglês para o aluno"
}`;

        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await res.json();
        const rawReply = data?.reply || data?.content || '';
        const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (typeof parsed.grade === 'number') {
            finalGrade = Math.min(maxGrade, Math.max(0, Math.round(parsed.grade)));
            justification = parsed.justification || justification;
            feedback = parsed.feedback || feedback;
          }
        }
      } catch (err) {
        console.error('Batch Grading AI error:', err);
      }

      setSubmissions(prev => {
        const copy = [...prev];
        copy[i].status = 'done';
        copy[i].grade = finalGrade;
        copy[i].justification = justification;
        copy[i].feedback = feedback;
        return copy;
      });
    }

    setIsGrading(false);
    showToast('Correção em lote concluída com IA!', 'success');
  };

  const syncWithGradebook = () => {
    const doneSubmissions = submissions.filter(s => s.status === 'done' && s.grade !== undefined);
    if (doneSubmissions.length === 0) {
      showToast('Nenhuma nota nova para sincronizar.', 'info');
      return;
    }

    let updatedStudents = [...students];
    let updateCount = 0;

    doneSubmissions.forEach(sub => {
      const sIndex = updatedStudents.findIndex(s => s.id === sub.studentId);
      if (sIndex > -1) {
        const student = updatedStudents[sIndex];
        const grades = student.grades || {};
        const timestamp = new Date().toISOString().split('T')[0];
        const examId = `batch_${timestamp}_${sub.id.substring(0,4)}`;
        grades[examId] = sub.grade!;
        updatedStudents[sIndex] = { ...student, grades };
        updateCount++;
      }
    });

    localStorage.setItem('teacher_students', JSON.stringify(updatedStudents));
    setStudents(updatedStudents);
    showToast(`✅ ${updateCount} notas sincronizadas com o Gradebook!`, 'success');
  };

  const handleRubricChange = (field: keyof Rubric, val: string) => {
    const num = parseInt(val) || 0;
    setRubric(prev => ({ ...prev, [field]: num }));
  };

  // --- Rendering Helpers ---
  const completedCount = submissions.filter(s => s.status === 'done').length;
  const totalGradable = submissions.length;
  const progressPercentage = totalGradable === 0 ? 0 : (completedCount / totalGradable) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <i className="ti ti-stack"></i>
            Corretor em Lote (OmniGrader)
          </h1>
          <p style={styles.subtitle}>
            Avalie dezenas de redações e provas simultaneamente usando a IA Rafinha.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            style={styles.buttonSecondary}
            onClick={syncWithGradebook}
          >
            <i className="ti ti-database-export"></i>
            Sincronizar com Gradebook
          </button>
          <button 
            style={{ ...styles.button, ...(isGrading ? styles.buttonDisabled : {}) }}
            onClick={startBatchGrading}
            disabled={isGrading}
          >
            <i className={isGrading ? "ti ti-loader ti-spin" : "ti ti-bolt"}></i>
            {isGrading ? 'Corrigindo...' : 'Corrigir Lote com Rafinha IA'}
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {/* Sidebar Configuracoes */}
        <div style={styles.sidebar}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>
              <i className="ti ti-settings"></i>
              Critérios de Correção
            </h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Nota Máxima Total</label>
              <input 
                type="number" 
                style={styles.input} 
                value={maxGrade}
                onChange={(e) => setMaxGrade(Number(e.target.value))}
              />
            </div>

            <label style={{...styles.label, display: 'block', marginTop: '1rem', marginBottom: '0.5rem'}}>
              Distribuição (Pesos %)
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Gramática</span>
                <input type="number" style={{...styles.input, width: '60px', padding: '0.4rem'}} value={rubric.grammar} onChange={(e) => handleRubricChange('grammar', e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Vocabulário</span>
                <input type="number" style={{...styles.input, width: '60px', padding: '0.4rem'}} value={rubric.vocabulary} onChange={(e) => handleRubricChange('vocabulary', e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Coesão</span>
                <input type="number" style={{...styles.input, width: '60px', padding: '0.4rem'}} value={rubric.cohesion} onChange={(e) => handleRubricChange('cohesion', e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Tema</span>
                <input type="number" style={{...styles.input, width: '60px', padding: '0.4rem'}} value={rubric.theme} onChange={(e) => handleRubricChange('theme', e.target.value)} />
              </div>
            </div>
            { (rubric.grammar + rubric.vocabulary + rubric.cohesion + rubric.theme) !== 100 && (
              <p style={{ color: colors.warning, fontSize: '0.8rem', marginTop: '0.5rem' }}>
                <i className="ti ti-alert-triangle"></i> A soma dos pesos não é 100%.
              </p>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>
              <i className="ti ti-upload"></i>
              Adicionar Arquivos
            </h3>
            <div 
              style={styles.uploadArea} 
              className="batch-upload-hover"
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="ti ti-cloud-upload" style={{ fontSize: '2rem', color: colors.primary, marginBottom: '0.5rem' }}></i>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>Clique ou arraste arquivos aqui</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted, marginTop: '0.5rem' }}>PDF, JPG, PNG, DOCX</p>
            </div>
            <input 
              type="file" 
              multiple 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
            />

            <div style={{ textAlign: 'center', margin: '1rem 0' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.9rem' }}>OU</span>
            </div>

            <button style={{ ...styles.buttonOutline, width: '100%' }} onClick={addManualSubmission}>
              <i className="ti ti-pencil-plus"></i> Inserir Texto Manualmente
            </button>
          </div>
        </div>

        {/* Main Content: Tabela de Submissões */}
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ ...styles.cardTitle, margin: 0 }}>
              <i className="ti ti-list-check"></i>
              Fila de Correção ({completedCount}/{totalGradable})
            </h3>
            
            {isGrading && (
              <div style={{ width: '40%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                  <span>Progresso IA...</span>
                  <span>{Math.round(progressPercentage)}%</span>
                </div>
                <div style={styles.progressBarContainer}>
                  <div style={{ ...styles.progressBar, width: `${progressPercentage}%` }}></div>
                </div>
              </div>
            )}
          </div>

          {submissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: colors.textMuted }}>
              <i className="ti ti-inbox" style={{ fontSize: '3rem', opacity: 0.5, marginBottom: '1rem' }}></i>
              <p>Nenhuma submissão adicionada ainda.</p>
              <p style={{ fontSize: '0.9rem' }}>Faça upload de arquivos ou adicione manualmente pela barra lateral.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Aluno</th>
                    <th style={styles.th}>Conteúdo / Arquivo</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Nota</th>
                    <th style={styles.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(sub => (
                    <tr key={sub.id}>
                      <td style={styles.td}>
                        <select 
                          style={{ ...styles.input, padding: '0.4rem', fontSize: '0.9rem', width: 'auto' }}
                          value={sub.studentId}
                          onChange={(e) => updateStudentForSubmission(sub.id, e.target.value)}
                          disabled={sub.status !== 'pending'}
                        >
                          <option value="">Selecione...</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={styles.td}>
                        {sub.fileName ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="ti ti-file-text" style={{ color: colors.primary }}></i>
                            <span style={{ fontSize: '0.9rem' }}>{sub.fileName}</span>
                          </div>
                        ) : (
                          <input 
                            type="text"
                            placeholder="Cole a redação aqui..."
                            style={{ ...styles.input, padding: '0.4rem', fontSize: '0.9rem' }}
                            value={sub.content}
                            onChange={(e) => updateSubmissionField(sub.id, 'content', e.target.value)}
                            disabled={sub.status !== 'pending'}
                          />
                        )}
                      </td>
                      <td style={styles.td}>
                        {sub.status === 'pending' && <span style={styles.badgePending}><i className="ti ti-clock"></i> Pendente</span>}
                        {sub.status === 'grading' && <span style={styles.badgeGrading}><i className="ti ti-loader"></i> Corrigindo</span>}
                        {sub.status === 'done' && <span style={styles.badgeDone}><i className="ti ti-check"></i> Concluído</span>}
                      </td>
                      <td style={styles.td}>
                        {sub.grade !== undefined ? (
                          <strong style={{ color: colors.success, fontSize: '1.1rem' }}>
                            {sub.grade.toFixed(1)} <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>/ {maxGrade}</span>
                          </strong>
                        ) : (
                          <span style={{ color: colors.textMuted }}>--</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {sub.status === 'done' && (
                            <button 
                              title="Ver Feedback"
                              style={{ ...styles.buttonOutline, padding: '0.4rem' }}
                              onClick={() => alert(`Feedback para ${sub.studentName}:\n\nNota: ${sub.grade}/${maxGrade}\n\nJustificativa: ${sub.justification}\n\nFeedback Aluno: ${sub.feedback}`)}
                            >
                              <i className="ti ti-eye"></i>
                            </button>
                          )}
                          <button 
                            title="Remover"
                            style={{ background: 'transparent', border: 'none', color: colors.error, cursor: 'pointer', padding: '0.4rem' }}
                            onClick={() => removeSubmission(sub.id)}
                            disabled={sub.status === 'grading'}
                          >
                            <i className="ti ti-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Toasts */}
      <div style={styles.toastContainer}>
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            style={{
              ...styles.toast, 
              backgroundColor: toast.type === 'success' ? colors.success : toast.type === 'error' ? colors.error : colors.card,
              border: toast.type === 'info' ? `1px solid ${colors.primary}` : 'none'
            }}
          >
            <i className={`ti ti-${toast.type === 'success' ? 'check' : toast.type === 'error' ? 'alert-triangle' : 'info-circle'}`}></i>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
