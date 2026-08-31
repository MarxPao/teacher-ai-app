'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens';
import { toast, showConfirm } from '@/components/Toast'
import { logAiCall, summarize } from '@/lib/aiAuditLog'
import { getAnchorExemplarsPrompt } from '@/lib/rubrics/anchorExemplars'
import ModelCapabilityBanner from '@/components/ModelCapabilityBanner'

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
  status: 'pending' | 'grading' | 'done' | 'needs_review';
  grade?: number;
  feedback?: string;
  justification?: string;
  rawAiResponse?: string;    // Resposta bruta da IA — trilha de auditoria
  reviewReason?: string;     // Motivo pelo qual foi sinalizado para revisão manual
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
    fontFamily: "'Plus Jakarta Sans', sans-serif",
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
    fontFamily: "'Fraunces', Georgia, serif",
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
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
    backgroundColor: 'rgba(200, 122, 30, 0.15)',
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
    backgroundColor: 'rgba(139, 94, 60, 0.15)',
    color: colors.primary,
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  badgeDone: {
    backgroundColor: 'rgba(61, 122, 78, 0.15)',
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
    backgroundColor: colors.cardHover,
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

  const [blindMode, setBlindMode] = useState(false)
  const [blindMap, setBlindMap] = useState<Record<string, string>>({}) // codigo -> nome real
  const [identitiesRevealed, setIdentitiesRevealed] = useState(false)

  const activateBlindMode = () => {
    const map: Record<string, string> = {}
    submissions.forEach((sub, i) => {
      map[`Aluno #${i + 1}`] = sub.studentName
    })
    setBlindMap(map)
    setBlindMode(true)
    setIdentitiesRevealed(false)
  }

  const getDisplayName = (studentName: string): string => {
    if (!blindMode || identitiesRevealed) return studentName
    const entry = Object.entries(blindMap).find(([_, name]) => name === studentName)
    return entry ? entry[0] : studentName
  }

  const revealIdentities = () => setIdentitiesRevealed(true)
  const allDone = submissions.length > 0 && submissions.every(s => s.status === 'done')

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
    } catch (err) {
      showToast('Erro ao carregar dados locais.', 'error');
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
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
      const targetStudent = students.length > 0 ? students[0] : { id: 'unknown', name: 'Aluno Desconhecido' };

      const addSubmission = (content: string) => {
        setSubmissions(prev => [...prev, {
          id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
          studentId: targetStudent.id,
          studentName: targetStudent.name,
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
        toast.success(`Arquivos ${file.name.split('.').pop()?.toUpperCase()} requerem extração de texto. Cole a resposta do aluno no campo correspondente.`);
        addSubmission('');
      } else {
        addSubmission(`Conteúdo de ${file.name}`);
      }
    });
  };

  const addManualSubmission = () => {
    if (students.length === 0) {
      showToast('Cadastre alunos no menu Alunos & Turmas para iniciar correções.', 'error');
      return;
    }
    const student = students[0];
    const newSub: Submission = {
      id: Date.now().toString(),
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
    showToast('Iniciando correção em lote com IA (2 passos)...', 'info');

    for (let i = 0; i < submissions.length; i++) {
      if (submissions[i].status !== 'pending') continue;

      setSubmissions(prev => {
        const copy = [...prev];
        copy[i].status = 'grading';
        return copy;
      });

      let finalGrade: number | undefined = undefined;
      let justification = 'Aguardando avaliação manual do professor.';
      let feedback = 'Feedback pendente.';
      let rawAiResponse = '';
      let needsReview = false;
      let reviewReason = '';

      try {
        const subContent = submissions[i].content?.trim() || '';

        // ── PASSO A: Extração Determinística da Resposta do Aluno ──────────────
        const promptPassA = `Você é um sistema de extração de dados pedagógicos.
Analise o texto abaixo (resposta de aluno, pode conter OCR de manuscrito):

"""
${subContent || '(texto vazio — sem resposta detectada)'}
"""

Sua única tarefa: extraia APENAS o conteúdo substantivo da resposta do aluno (remova cabeçalhos, nome, turma, data, gabarito impresso).
Se o texto estiver vazio, ilegível ou for impossível identificar a resposta, responda APENAS: {"extractedAnswer": null, "confidence": "low", "reason": "texto vazio ou ilegível"}

Responda APENAS um JSON válido:
{"extractedAnswer": "resposta limpa do aluno ou null", "confidence": "high" | "medium" | "low", "reason": "breve justificativa"}`;

        const resA = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: promptPassA }],
            temperatureMode: 'deterministic'
          })
        });
        const dataA = await resA.json();
        const rawA = dataA?.reply || dataA?.content || '';
        rawAiResponse += `[PASSO A]\n${rawA}\n\n`;

        const matchA = rawA.match(/\{[\s\S]*\}/);
        if (!matchA) {
          needsReview = true;
          reviewReason = 'Passo A: resposta da IA fora do formato JSON esperado.';
        } else {
          const parsedA = JSON.parse(matchA[0]);

          if (!parsedA.extractedAnswer || parsedA.confidence === 'low') {
            needsReview = true;
            reviewReason = `Passo A: conteúdo ambíguo ou ilegível (confiança: ${parsedA.confidence}). Motivo: ${parsedA.reason || 'desconhecido'}`;
          } else {
            // ── PASSO B: Pontuação com Âncoras e Rubrica ────────────────────────
            const activeRubricNames = Object.keys(rubric).join(', ');
            const anchorSection = getAnchorExemplarsPrompt('english', 'macro');

            const promptPassB = `Você é a Rafinha OmniGrader do TeacherAI — avaliador especialista em produção textual em inglês.

RESPOSTA EXTRAÍDA DO ALUNO ${submissions[i].studentName}:
"""
${parsedA.extractedAnswer}
"""

RUBRICAS ATIVAS: ${activeRubricNames || 'Gramática, Vocabulário, Coesão, Tema'}
NOTA MÁXIMA: ${maxGrade}

${anchorSection}

REGRAS OBRIGATÓRIAS:
1. Use as âncoras acima para calibrar sua régua avaliativa — NÃO derive da escala estabelecida.
2. "grade" DEVE ser um número entre 0 e ${maxGrade}, com no máximo 1 casa decimal.
3. "justification" deve citar especificamente o que foi observado na resposta do aluno.
4. "feedback" deve ser encorajador, em inglês, dirigido ao aluno.
5. Responda APENAS JSON válido, sem markdown, sem texto fora do objeto.

{"grade": number, "justification": "justificativa pedagógica em português", "feedback": "feedback em inglês para o aluno"}`;

            const resB = await fetch('/api/agent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ role: 'user', content: promptPassB }],
                temperatureMode: 'deterministic'
              })
            });
            const dataB = await resB.json();
            const rawB = dataB?.reply || dataB?.content || '';
            rawAiResponse += `[PASSO B]\n${rawB}`;

            const matchB = rawB.match(/\{[\s\S]*\}/);
            if (!matchB) {
              needsReview = true;
              reviewReason = 'Passo B: resposta da IA fora do formato JSON esperado.';
            } else {
              const parsedB = JSON.parse(matchB[0]);
              const rawGrade = Number(parsedB.grade);

              if (isNaN(rawGrade) || rawGrade < 0 || rawGrade > maxGrade) {
                needsReview = true;
                reviewReason = `Passo B: nota retornada (${parsedB.grade}) fora do range esperado (0–${maxGrade}).`;
              } else {
                finalGrade = Math.round(rawGrade * 10) / 10;
                justification = parsedB.justification || justification;
                feedback = parsedB.feedback || feedback;
              }
            }
          }
        }
      } catch (err) {
        console.error('Batch Grading AI error:', err);
        needsReview = true;
        reviewReason = `Erro de rede ou parse: ${err instanceof Error ? err.message : 'desconhecido'}`;
      }

      logAiCall({
        module: 'BatchGrader',
        temperatureUsed: 0.05,
        promptSummary: summarize(`Aluno: ${submissions[i].studentName} | Nota máx: ${maxGrade}`),
        rawResponseSummary: summarize(rawAiResponse, 200),
        parsedResult: JSON.stringify({ grade: finalGrade, needsReview, reviewReason }),
        flagged: needsReview,
        flagReason: reviewReason || undefined,
      });

      setSubmissions(prev => {
        const copy = [...prev];
        copy[i].status = needsReview ? 'needs_review' : 'done';
        copy[i].grade = finalGrade;
        copy[i].justification = justification;
        copy[i].feedback = feedback;
        copy[i].rawAiResponse = rawAiResponse.slice(0, 500);
        copy[i].reviewReason = reviewReason || undefined;
        return copy;
      });
    }

    const reviewCount = submissions.filter(s => s.status === 'needs_review').length;
    setIsGrading(false);
    if (reviewCount > 0) {
      showToast(`Correção concluída. ⚠️ ${reviewCount} submissão(ões) requerem revisão manual.`, 'info');
    } else {
      showToast('Correção em lote concluída com IA!', 'success');
    }
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
    showToast(`${updateCount} notas sincronizadas com o Gradebook!`, 'success');
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
      <ModelCapabilityBanner taskLabel="Correção em Lote" />
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <i className="ti ti-stack"></i>
            Corretor em Lote (OmniGrader)
          </h1>
          <p style={styles.subtitle}>
            Avalie redações e tarefas de múltiplos alunos simultaneamente com a Rafinha IA.
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
            <i className={isGrading ? "ti ti-loader" : "ti ti-bolt"}></i>
            {isGrading ? 'Corrigindo...' : 'Corrigir Lote com Rafinha IA'}
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {/* Sidebar Configurações */}
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

            <label style={{ ...styles.label, display: 'block', marginTop: '1rem', marginBottom: '0.5rem' }}>
              Distribuição (Pesos %)
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Gramática</span>
                <input type="number" style={{ ...styles.input, width: '60px', padding: '0.4rem' }} value={rubric.grammar} onChange={(e) => handleRubricChange('grammar', e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Vocabulário</span>
                <input type="number" style={{ ...styles.input, width: '60px', padding: '0.4rem' }} value={rubric.vocabulary} onChange={(e) => handleRubricChange('vocabulary', e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Coesão</span>
                <input type="number" style={{ ...styles.input, width: '60px', padding: '0.4rem' }} value={rubric.cohesion} onChange={(e) => handleRubricChange('cohesion', e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: colors.text }}>Tema</span>
                <input type="number" style={{ ...styles.input, width: '60px', padding: '0.4rem' }} value={rubric.theme} onChange={(e) => handleRubricChange('theme', e.target.value)} />
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>
              <i className="ti ti-upload"></i>
              Adicionar Arquivos
            </h3>
            <div 
              style={styles.uploadArea} 
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="ti ti-cloud-upload" style={{ fontSize: '2rem', color: colors.primary, marginBottom: '0.5rem' }}></i>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>Clique ou arraste arquivos aqui</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted, marginTop: '0.5rem' }}>TXT, MD, CSV</p>
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
                            placeholder="Cole a resposta aqui..."
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
                        {sub.status === 'needs_review' && (
                          <span title={sub.reviewReason || 'Revisar manualmente'} style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#fff3cd', color:'#856404', border:'1px solid #ffc107', borderRadius: RADIUS.md, padding:'2px 8px', fontSize:'0.78rem', fontWeight:700, cursor:'help' }}>
                            <i className="ti ti-alert-triangle"></i> Revisão Manual
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {sub.grade !== undefined ? (
                          <strong style={{ color: colors.success, fontSize: '1.1rem' }}>
                            {sub.grade.toFixed(1)} <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>/ {maxGrade}</span>
                          </strong>
                        ) : sub.status === 'needs_review' ? (
                          <span style={{ color: colors.warning, fontSize: '0.8rem' }}>⚠️ Ver motivo</span>
                        ) : (
                          <span style={{ color: colors.textMuted }}>--</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {(sub.status === 'done' || sub.status === 'needs_review') && (
                            <button 
                              title={sub.status === 'needs_review' ? `Motivo: ${sub.reviewReason}` : 'Ver Feedback'}
                              style={{ ...styles.buttonOutline, padding: '0.4rem' }}
                              onClick={() => toast.success(sub.status === 'needs_review'
                                ? `⚠️ Revisão Manual — ${getDisplayName(sub.studentName)}\n\nMotivo: ${sub.reviewReason}\n\nResponda bruta (truncada): ${sub.rawAiResponse?.slice(0,200) || 'N/A'}`
                                : `Feedback para ${getDisplayName(sub.studentName)}:\n\nNota: ${sub.grade}/${maxGrade}\n\nJustificativa: ${sub.justification}\n\nFeedback Aluno: ${sub.feedback}`)}
                            >
                              <i className={sub.status === 'needs_review' ? 'ti ti-alert-circle' : 'ti ti-eye'}></i>
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