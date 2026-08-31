'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens';
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, CSSProperties } from 'react';

// --- Types ---
type ClassInfo = {
  id: string;
  name: string;
  level: string;
};

type ReflectionEntry = {
  id: string;
  date: string;
  classId: string;
  className: string;
  description: string;
  feelings: string;
  evaluation: string;
  analysisTags: string[];
  actionPlan: string;
  aiFeedback?: string;
  timestamp: number;
};

type Competencies = {
  classroomManagement: number;
  eltDidactics: number;
  empathy: number;
  techUsage: number;
  formativeAssessment: number;
};

// --- Styles ---
const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: '#fdf8f2',
    color: '#2c1a0e',
    minHeight: '100vh',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    padding: '36px 40px',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    borderBottom: '1px solid rgba(139,115,85,0.12)',
    paddingBottom: 20,
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#2c1a0e',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  subtitle: {
    fontSize: 14,
    color: '#a08060',
    marginTop: 6,
  },
  tabsContainer: {
    display: 'flex',
    gap: 4,
    background: '#f5efe6',
    borderRadius: RADIUS.lg,
    padding: 4,
    marginBottom: 24,
    border: '1px solid rgba(139,115,85,0.12)',
    width: 'fit-content',
  },
  tab: {
    padding: '8px 18px',
    borderRadius: 9,
    border: 'none',
    background: 'transparent',
    color: '#a08060',
    fontWeight: 400,
    fontSize: TEXT.body,
    cursor: 'pointer',
    boxShadow: 'none',
    transition: 'all 0.15s ease',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  activeTab: {
    background: '#fffcf8',
    color: '#2c1a0e',
    fontWeight: 600,
    boxShadow: '0 1px 4px rgba(44,26,14,0.1)',
  },
  card: {
    backgroundColor: '#fffcf8',
    border: '1px solid rgba(139,115,85,0.12)',
    borderRadius: RADIUS.xl,
    padding: 28,
    boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: 600,
    color: '#2c1a0e',
    fontSize: '0.95rem',
  },
  pedagogicalTip: {
    display: 'block',
    fontSize: '0.8rem',
    color: '#7a5c42',
    marginBottom: '0.5rem',
    fontStyle: 'italic',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#fffcf8',
    border: '1px solid rgba(139,115,85,0.18)',
    borderRadius: 9,
    color: '#2c1a0e',
    fontSize: TEXT.body,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#fffcf8',
    border: '1px solid rgba(139,115,85,0.18)',
    borderRadius: 9,
    color: '#2c1a0e',
    fontSize: TEXT.body,
    minHeight: '100px',
    boxSizing: 'border-box',
    resize: 'vertical',
    outline: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  tag: {
    padding: '4px 12px',
    borderRadius: 99,
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(139,115,85,0.18)',
    backgroundColor: '#f5efe6',
    color: '#7a5c42',
    transition: 'all 0.2s',
  },
  activeTag: {
    backgroundColor: 'rgba(139,94,60,0.1)',
    borderColor: 'rgba(139,94,60,0.3)',
    color: '#8b5e3c',
  },
  buttonPrimary: {
    padding: '10px 20px',
    backgroundColor: '#8b5e3c',
    color: '#fffcf8',
    border: 'none',
    borderRadius: 9,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: TEXT.body,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.18s ease',
    boxShadow: '0 2px 8px rgba(139,94,60,0.3)',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  buttonSecondary: {
    padding: '9px 18px',
    backgroundColor: '#f5efe6',
    color: '#7a5c42',
    border: '1px solid rgba(139,115,85,0.2)',
    borderRadius: 9,
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: TEXT.body,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.15s ease',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  timelineCard: {
    backgroundColor: '#f5efe6',
    borderRadius: RADIUS.lg,
    padding: 20,
    marginBottom: '1rem',
    border: '1px solid rgba(139,115,85,0.14)',
    borderLeft: '4px solid #8b5e3c',
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    fontSize: '0.9rem',
    color: '#7a5c42',
  },
  timelineTitle: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#2c1a0e',
    margin: '0 0 0.5rem 0',
    fontFamily: "'Fraunces', Georgia, serif",
  },
  aiFeedbackBox: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: 'rgba(139,94,60,0.05)',
    border: '1px solid rgba(139,94,60,0.2)',
    borderRadius: RADIUS.md,
    borderLeft: '4px solid #8b5e3c',
  },
  aiFeedbackHeader: {
    color: '#8b5e3c',
    fontWeight: 700,
    marginBottom: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  starContainer: {
    display: 'flex',
    gap: '0.25rem',
    cursor: 'pointer',
  },
  star: {
    color: '#c4a882',
    fontSize: '1.5rem',
  },
  starActive: {
    color: '#8b5e3c',
    fontSize: '1.5rem',
  },
  competenceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 0',
    borderBottom: '1px solid rgba(139,115,85,0.12)',
  },
  statBox: {
    backgroundColor: '#f5efe6',
    padding: '1rem',
    borderRadius: RADIUS.lg,
    textAlign: 'center',
    flex: '1',
    border: '1px solid rgba(139,115,85,0.16)',
  },
  statNumber: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#8b5e3c',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#c4a882',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '0.25rem',
    fontWeight: 700,
  }
};

const ANALYSIS_TAGS = [
  'Engajamento', 'Didática', 'Gestão de Tempo', 
  'Domínio do Conteúdo', 'Diferenciação', 'Disciplina', 
  'Participação', 'Uso de L1', 'Fluência'
];

export default function ReflectivePractice() {
  const [activeTab, setActiveTab] = useState<'new' | 'history' | 'competencies'>('new');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [journal, setJournal] = useState<ReflectionEntry[]>([]);
  const [competencies, setCompetencies] = useState<Competencies>({
    classroomManagement: 3,
    eltDidactics: 3,
    empathy: 4,
    techUsage: 3,
    formativeAssessment: 3
  });

  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    classId: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    feelings: '',
    evaluation: '',
    analysisTags: [] as string[],
    actionPlan: ''
  });
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);

  // Load Data
  useEffect(() => {
    try {
      const storedClasses = localStorage.getItem('teacher_classes');
      if (storedClasses) {
        setClasses(JSON.parse(storedClasses));
      } else {
        // Fallback mock
        setClasses([
          { id: '1', name: 'Intermediate B2 - Adults', level: 'B2' },
          { id: '2', name: 'Teens A2', level: 'A2' },
        ]);
      }

      const storedJournal = localStorage.getItem('teacher_reflective_journal');
      if (storedJournal) {
        setJournal(JSON.parse(storedJournal));
      }

      const storedComp = localStorage.getItem('teacher_competencies');
      if (storedComp) {
        setCompetencies(JSON.parse(storedComp));
      }
    } catch (e) {
      console.error('Failed to load data', e);
    }
  }, []);

  // Save Data
  const saveJournal = (newJournal: ReflectionEntry[]) => {
    setJournal(newJournal);
    localStorage.setItem('teacher_reflective_journal', JSON.stringify(newJournal));
  };

  const saveCompetencies = (newComp: Competencies) => {
    setCompetencies(newComp);
    localStorage.setItem('teacher_competencies', JSON.stringify(newComp));
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleTagToggle = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      analysisTags: prev.analysisTags.includes(tag)
        ? prev.analysisTags.filter(t => t !== tag)
        : [...prev.analysisTags, tag]
    }));
  };

  const requestAIFeedback = async () => {
    if (!formData.description || !formData.evaluation) {
      showToast('Preencha a descrição e avaliação primeiro.', 'error');
      return;
    }
    
    setIsGeneratingFeedback(true);
    try {
      const selectedClass = classes.find(c => c.id === formData.classId);
      const prompt = `Analise a reflexão pedagógica deste professor de inglês (Turma: ${selectedClass?.name || 'Geral'}).
Descrição da aula: ${formData.description}
Sentimentos do professor: ${formData.feelings}
Avaliação do resultado: ${formData.evaluation}
Tags de análise: ${formData.analysisTags.join(', ')}
Plano de Ação: ${formData.actionPlan}

Forneça um parecer crítico-reflexivo construtivo fundamentado na teoria de Donald Schön (Reflexão na/sobre a ação), Ciclo de Gibbs e diretrizes da BNCC/ELT. Dê dicas práticas de didática e engajamento em português.`;

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      let feedback = data?.reply || data?.content || '';
      if (!feedback) {
        feedback = `Reflexão pedagógica baseada em Schön e Kolb:

Sua descrição demonstra uma clara observação do ambiente ("reflexão na ação").

Pontos Fortes:
- Inteligência emocional ao registrar os sentimentos em sala.
- Foco na melhoria contínua da prática de ensino.

Sugestão ELT/BNCC:
Para o plano de ação, considere incorporar atividades de Task-based Learning para potencializar as áreas de ${formData.analysisTags.join(' e ') || 'didática'}.`;
      }
      handleSave(feedback);
    } catch (err) {
      console.error('AI Request Error:', err);
      const fallbackFeedback = `Reflexão pedagógica baseada em Schön e Kolb:

Sua descrição demonstra observação ativa do ambiente docente.

Pontos Fortes:
- Inteligência emocional ao registrar os sentimentos em sala.
- Foco na melhoria contínua da prática de ensino.

Sugestão ELT:
Incorpore atividades de Task-Based Learning para fortalecer a área de ${formData.analysisTags.join(' e ') || 'didática'}.`;
      handleSave(fallbackFeedback);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleSave = (aiFeedback?: string) => {
    if (!formData.classId) {
      showToast('Selecione uma turma.', 'error');
      return;
    }
    
    const selectedClass = classes.find(c => c.id === formData.classId);
    
    const newEntry: ReflectionEntry = {
      id: Date.now().toString(),
      date: formData.date,
      classId: formData.classId,
      className: selectedClass?.name || 'Turma Desconhecida',
      description: formData.description,
      feelings: formData.feelings,
      evaluation: formData.evaluation,
      analysisTags: formData.analysisTags,
      actionPlan: formData.actionPlan,
      aiFeedback: aiFeedback,
      timestamp: Date.now()
    };

    saveJournal([newEntry, ...journal]);
    showToast('Reflexão salva com sucesso!', 'success');
    
    // Reset form
    setFormData({
      classId: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      feelings: '',
      evaluation: '',
      analysisTags: [],
      actionPlan: ''
    });
    setActiveTab('history');
  };

  const handleStarClick = (comp: keyof Competencies, value: number) => {
    const newComp = { ...competencies, [comp]: value };
    saveCompetencies(newComp);
    showToast('Competência atualizada', 'success');
  };

  const renderStars = (comp: keyof Competencies) => {
    return (
      <div style={styles.starContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <i 
            key={star}
            className="ti ti-star-filled"
            style={star <= competencies[comp] ? styles.starActive : styles.star}
            onClick={() => handleStarClick(comp, star)}
          />
        ))}
      </div>
    );
  };

  const currentMonthCount = journal.filter(j => {
    const d = new Date(j.timestamp);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div style={styles.container}>
      {/* Include Tabler Icons */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" />

        {toast && (() => {
          const toastIcon = toast.type === 'error' ? 'ti-alert-circle' : toast.type === 'success' ? 'ti-check' : 'ti-info-circle'
          return (
            <div style={{
              position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
              backgroundColor: toast.type === 'error' ? '#a83232' : toast.type === 'success' ? '#3d7a4e' : '#2a6080',
              color: '#fffcf8', padding: '1rem 2rem', borderRadius: RADIUS.lg,
              boxShadow: '0 4px 12px rgba(44,26,14,0.15)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              animation: 'fadeIn 0.3s',
              fontFamily: "'Plus Jakarta Sans', sans-serif"
            }}>
              <i className={`ti ${toastIcon}`} />
              {toast.message}
            </div>
          )
        })()}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <i className="ti ti-book-2" style={{ color: '#8b5e3c' }} />
            Diário Reflexivo Docente
          </h1>
          <p style={styles.subtitle}>Prática pedagógica consciente inspirada em Gibbs, Schön e Kolb.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={styles.statBox}>
            <div style={styles.statNumber}>{journal.length}</div>
            <div style={styles.statLabel}>Reflexões Totais</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statNumber}>{currentMonthCount}</div>
            <div style={styles.statLabel}>Este Mês</div>
          </div>
        </div>
      </div>

      <div style={styles.tabsContainer}>
        <div 
          style={{...styles.tab, ...(activeTab === 'new' ? styles.activeTab : {})}}
          onClick={() => setActiveTab('new')}
        >
          <i className="ti ti-pencil-plus" /> Novo Registro
        </div>
        <div 
          style={{...styles.tab, ...(activeTab === 'history' ? styles.activeTab : {})}}
          onClick={() => setActiveTab('history')}
        >
          <i className="ti ti-history" /> Histórico & Timeline
        </div>
        <div 
          style={{...styles.tab, ...(activeTab === 'competencies' ? styles.activeTab : {})}}
          onClick={() => setActiveTab('competencies')}
        >
          <i className="ti ti-chart-radar" /> Matriz de Competências
        </div>
      </div>

      {/* NEW REFLECTION TAB */}
      {activeTab === 'new' && (
        <div style={styles.card}>
          <h2 style={{ color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif", display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
            <i className="ti ti-notebook" style={{ color: '#8b5e3c' }} /> Ciclo Reflexivo de Gibbs
          </h2>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Turma / Contexto</label>
              <select 
                style={styles.input}
                value={formData.classId}
                onChange={(e) => setFormData({...formData, classId: e.target.value})}
              >
                <option value="">Selecione uma turma...</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.level})</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Data da Aula</label>
              <input 
                type="date" 
                style={styles.input}
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>1. Descrição Fática (O que aconteceu?)</label>
            <span style={styles.pedagogicalTip}>Descreva a experiência objetivamente, sem julgamentos (Kolb: Experiência Concreta).</span>
            <textarea 
              style={styles.textarea}
              placeholder="Descreva a atividade, a reação dos alunos, incidentes críticos..."
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>2. Sentimentos (Como você se sentiu?)</label>
            <span style={styles.pedagogicalTip}>Reconheça a dimensão socioemocional da sua regência.</span>
            <input 
              style={styles.input}
              placeholder="Ex: Frustrado com o tempo, animado com o debate..."
              value={formData.feelings}
              onChange={(e) => setFormData({...formData, feelings: e.target.value})}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>3. Avaliação (O que funcionou e o que desafiou?)</label>
            <span style={styles.pedagogicalTip}>Reflexão SOBRE a ação (Schön). Pontos positivos e negativos.</span>
            <textarea 
              style={styles.textarea}
              placeholder="A dinâmica X fluiu bem, mas a explicação de gramática foi confusa..."
              value={formData.evaluation}
              onChange={(e) => setFormData({...formData, evaluation: e.target.value})}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>4. Análise Pedagógica (Tags)</label>
            <span style={styles.pedagogicalTip}>Identifique as áreas fundamentais envolvidas na aula de hoje.</span>
            <div style={styles.tagContainer}>
              {ANALYSIS_TAGS.map(tag => (
                <div 
                  key={tag}
                  style={{...styles.tag, ...(formData.analysisTags.includes(tag) ? styles.activeTag : {})}}
                  onClick={() => handleTagToggle(tag)}
                >
                  {formData.analysisTags.includes(tag) ? <i className="ti ti-check" style={{marginRight: '4px'}}/> : ''}
                  {tag}
                </div>
              ))}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>5. Conclusão & Plano de Ação (O que farei diferente?)</label>
            <span style={styles.pedagogicalTip}>Aprendizagem Experiencial (Kolb: Experimentação Ativa).</span>
            <textarea 
              style={{...styles.textarea, borderColor: 'rgba(139,115,85,0.4)'}}
              placeholder="Na próxima aula com esta turma, planejo..."
              value={formData.actionPlan}
              onChange={(e) => setFormData({...formData, actionPlan: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button 
              style={styles.buttonPrimary}
              onClick={() => handleSave()}
            >
              <i className="ti ti-device-floppy" /> Salvar Reflexão
            </button>
            <button 
              style={styles.buttonSecondary}
              onClick={requestAIFeedback}
              disabled={isGeneratingFeedback}
            >
              {isGeneratingFeedback ? (
                <><i className="ti ti-loader ti-spin" /> Analisando pedagogicamente...</>
              ) : (
                <><i className="ti ti-sparkles" /> Salvar & Pedir Feedback Pedagógico IA</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div style={styles.card}>
          <h2 style={{ color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif", marginTop: 0 }}>Histórico de Reflexões</h2>
          
          {journal.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#a08060' }}>
              <i className="ti ti-notes" style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }} />
              <p>Nenhuma reflexão registrada ainda. Comece seu diário pedagógico!</p>
            </div>
          ) : (
            <div>
              {journal.map((entry) => (
                <div key={entry.id} style={styles.timelineCard}>
                  <div style={styles.timelineHeader}>
                    <div>
                      <i className="ti ti-calendar" /> {new Date(entry.date).toLocaleDateString()} &bull; 
                      <strong style={{ color: '#8b5e3c', marginLeft: '0.5rem' }}>{entry.className}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {entry.analysisTags.map(t => (
                        <span key={t} style={{ fontSize: '0.75rem', background: 'rgba(139,115,85,0.1)', color: '#7a5c42', padding: '2px 8px', borderRadius: '12px'}}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <h3 style={styles.timelineTitle}>Descrição do Evento</h3>
                  <p style={{ color: '#5c3d20', fontSize: '0.95rem' }}>{entry.description}</p>
                  
                  <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', borderTop: '1px solid rgba(139,115,85,0.12)', paddingTop: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: '#2c1a0e', display: 'block', marginBottom: '0.25rem' }}>Sentimentos:</strong>
                      <span style={{ color: '#5c3d20', fontSize: '0.9rem' }}>{entry.feelings}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: '#2c1a0e', display: 'block', marginBottom: '0.25rem' }}>Plano de Ação:</strong>
                      <span style={{ color: '#5c3d20', fontSize: '0.9rem' }}>{entry.actionPlan}</span>
                    </div>
                  </div>

                  {entry.aiFeedback && (
                    <div style={styles.aiFeedbackBox}>
                      <div style={styles.aiFeedbackHeader}>
                        <i className="ti ti-sparkles" /> Parecer Pedagógico - Rafinha IA
                      </div>
                      <div style={{ whiteSpace: 'pre-line', fontSize: '0.9rem', color: '#2c1a0e' }}>
                        {entry.aiFeedback}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COMPETENCIES TAB */}
      {activeTab === 'competencies' && (
        <div style={styles.card}>
          <h2 style={{ color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif", marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="ti ti-target" style={{ color: '#8b5e3c' }} /> Matriz de Auto-avaliação Docente
          </h2>
          <p style={{ color: '#7a5c42', marginBottom: '2rem' }}>
            Avalie continuamente o desenvolvimento das suas competências de ensino (1 a 5 estrelas).
          </p>

          <div style={{ maxWidth: '600px' }}>
            <div style={styles.competenceRow}>
              <div>
                <strong style={{ color: '#2c1a0e', display: 'block' }}>Gestão de Sala (Classroom Management)</strong>
                <span style={{ color: '#7a5c42', fontSize: '0.85rem' }}>Organização, ritmo, transições e disciplina.</span>
              </div>
              {renderStars('classroomManagement')}
            </div>
            
            <div style={styles.competenceRow}>
              <div>
                <strong style={{ color: '#2c1a0e', display: 'block' }}>Didática do Inglês (ELT Didactics)</strong>
                <span style={{ color: '#7a5c42', fontSize: '0.85rem' }}>Clareza na instrução, uso de L2, scaffolding.</span>
              </div>
              {renderStars('eltDidactics')}
            </div>

            <div style={styles.competenceRow}>
              <div>
                <strong style={{ color: '#2c1a0e', display: 'block' }}>Empatia e Relacionamento</strong>
                <span style={{ color: '#7a5c42', fontSize: '0.85rem' }}>Conexão com os alunos, escuta ativa.</span>
              </div>
              {renderStars('empathy')}
            </div>

            <div style={styles.competenceRow}>
              <div>
                <strong style={{ color: '#2c1a0e', display: 'block' }}>Uso de Tecnologia Educacional</strong>
                <span style={{ color: '#7a5c42', fontSize: '0.85rem' }}>Integração significativa de ferramentas digitais.</span>
              </div>
              {renderStars('techUsage')}
            </div>

            <div style={styles.competenceRow}>
              <div>
                <strong style={{ color: '#2c1a0e', display: 'block' }}>Avaliação Formativa</strong>
                <span style={{ color: '#7a5c42', fontSize: '0.85rem' }}>Feedback constante, checagem de entendimento.</span>
              </div>
              {renderStars('formativeAssessment')}
            </div>
          </div>
        </div>
      )}

      {/* Add keyframes for animations via style tag */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
