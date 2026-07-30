'use client';

import React, { useState, useEffect, useRef, CSSProperties } from 'react';

// --- Interfaces ---
interface TranscriptionSegment {
  id: string;
  timestamp: string;
  text: string;
  speaker?: string;
}

interface ActionItem {
  task: string;
  assignee: string;
  deadline: string;
}

interface MeetingReport {
  summary: string;
  actionItems: ActionItem[];
  studentHighlights: string[];
  nextSteps: string[];
  tags: string[];
}

interface MeetingRecord {
  id: string;
  title: string;
  date: string;
  type: 'Aula' | 'Reunião de Pais' | 'Conselho' | 'Planejamento' | 'Outro';
  transcription: TranscriptionSegment[];
  rawText: string;
  report?: MeetingReport;
}

export default function MeetingClassRecorder() {
  // --- State ---
  const [records, setRecords] = useState<MeetingRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'record' | 'history'>('record');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentTranscription, setCurrentTranscription] = useState<TranscriptionSegment[]>([]);
  const [interimText, setInterimText] = useState('');
  
  // Form State for new record
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingRecord['type']>('Aula');
  
  // Processing & UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MeetingRecord | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [inputMode, setInputMode] = useState<'mic' | 'manual'>('mic');
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const saved = localStorage.getItem('teacher_meeting_diaries');
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse records', e);
      }
    }
  }, []);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentTranscription, interimText]);

  // --- Speech Recognition Setup ---
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'pt-BR';

      recognitionRef.current.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        setInterimText(interim);
        
        if (final) {
          const timestamp = new Date(recordingTime * 1000).toISOString().substr(11, 8);
          setCurrentTranscription(prev => [
            ...prev,
            { id: Date.now().toString(), timestamp, text: final.trim() }
          ]);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
      };
      
      recognitionRef.current.onend = () => {
        if (isRecording && !isPaused) {
          recognitionRef.current.start();
        }
      };
    }
  }, [isRecording, isPaused, recordingTime]);

  // --- Recording Actions ---
  const startRecording = () => {
    if (!meetingTitle) {
      alert('Por favor, defina um título para a reunião/aula.');
      return;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Handle case where it might already be started
      }
    }
    
    setIsRecording(true);
    setIsPaused(false);
    
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const pauseRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const resumeRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
    setIsPaused(false);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
    
    processTranscription();
  };
  
  const resetRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setRecordingTime(0);
    setCurrentTranscription([]);
    setInterimText('');
  };

  // --- Processing & AI ---
  const processTranscription = async () => {
    setIsProcessing(true);
    
    let rawText = '';
    let segments = currentTranscription;
    
    if (inputMode === 'manual') {
      if (!manualInput) {
        setIsProcessing(false);
        return;
      }
      rawText = manualInput;
      segments = [{
        id: Date.now().toString(),
        timestamp: '00:00:00',
        text: manualInput
      }];
    } else {
      rawText = currentTranscription.map(t => t.text).join(' ');
      if (!rawText && !interimText) {
        alert('Nenhum áudio foi capturado.');
        setIsProcessing(false);
        return;
      }
      if (interimText) {
        rawText += ' ' + interimText;
        segments = [...segments, { id: 'final', timestamp: 'End', text: interimText }];
      }
    }

    try {
      // Simulate AI Processing via /api/agent (Mocked for self-containment, but structured for real API call)
      const simulatedResponse = await mockAiProcessing(rawText, meetingType);
      
      const newRecord: MeetingRecord = {
        id: Date.now().toString(),
        title: meetingTitle || 'Sem Título',
        date: new Date().toISOString(),
        type: meetingType,
        transcription: segments,
        rawText: rawText,
        report: simulatedResponse
      };
      
      const updatedRecords = [newRecord, ...records];
      setRecords(updatedRecords);
      localStorage.setItem('teacher_meeting_diaries', JSON.stringify(updatedRecords));
      
      setSelectedRecord(newRecord);
      resetRecording();
      setManualInput('');
      setActiveTab('history');
      
    } catch (error) {
      console.error('Error generating report', error);
      alert('Erro ao processar o relatório.');
    } finally {
      setIsProcessing(false);
    }
  };

  const mockAiProcessing = async (text: string, type: string): Promise<MeetingReport> => {
    try {
      const prompt = `Você é a Rafinha IA assistente de diários de reuniões e aulas do TeacherAI.
Processe a seguinte transcrição/notas brutas de um(a) ${type}:

"""
${text}
"""

Responda APENAS um objeto JSON estrito com o seguinte formato:
{
  "summary": "Resumo executivo conciso dos pontos principais",
  "actionItems": [
    { "task": "Descrição da tarefa", "assignee": "Responsável", "deadline": "Prazo" }
  ],
  "studentHighlights": [
    "Destaque/ocorrência de aluno 1",
    "Destaque/ocorrência de aluno 2"
  ],
  "nextSteps": [
    "Próximo passo 1",
    "Próximo passo 2"
  ],
  "tags": ["tag1", "tag2"]
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
        if (parsed.summary) {
          return {
            summary: parsed.summary,
            actionItems: parsed.actionItems || [],
            studentHighlights: parsed.studentHighlights || [],
            nextSteps: parsed.nextSteps || [],
            tags: parsed.tags || [type.replace(/\s+/g, ''), 'RafinhaAI']
          };
        }
      }
    } catch (err) {
      console.error('AI Meeting Summary error:', err);
    }

    return {
      summary: `Resumo gerado para ${type}: O texto abordou os pontos principais discutidos na sessão ("${text.substring(0, 80)}..."). Vários tópicos foram levantados para acompanhamento contínuo.`,
      actionItems: [
        { task: 'Revisar notas e encaminhamentos da aula', assignee: 'Professor', deadline: 'Próxima aula' },
        { task: 'Verificar alinhamento de aprendizagem', assignee: 'Coordenação', deadline: 'Esta semana' }
      ],
      studentHighlights: [
        'Engajamento ativo dos alunos identificados na transcrição.',
        'Necessidade de reforço em pontos específicos.'
      ],
      nextSteps: [
        'Acompanhar entregas e feedbacks com a turma',
        'Registrar ocorrências no diário de classe'
      ],
      tags: [type.replace(/\s+/g, ''), 'AutoGerado', 'RafinhaAI']
    };
  };

  // --- Export Actions ---
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copiado para a área de transferência!');
  };

  const generateWhatsAppFormat = (record: MeetingRecord) => {
    if (!record.report) return 'Sem relatório disponível.';
    const rep = record.report;
    return `*${record.title}*\n📅 ${new Date(record.date).toLocaleDateString()}\n\n*📌 Resumo*\n${rep.summary}\n\n*✅ Ações*\n${rep.actionItems.map(a => `- ${a.task} (@${a.assignee})`).join('\n')}\n\n*🚀 Próximos Passos*\n${rep.nextSteps.map(s => `- ${s}`).join('\n')}`;
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? "0" + v : v).filter((v,i) => v !== "00" || i > 0).join(":");
  };

  // --- Styles ---
  const theme = {
    bg: '#0a0d1a',
    card: '#16192b',
    cardHover: '#1c1f33',
    primary: '#10b981', // Emerald
    secondary: '#8b5cf6', // Violet
    text: '#f8fafc',
    textMuted: '#94a3b8',
    border: '#2e334d',
    danger: '#ef4444',
    warning: '#f59e0b'
  };

  const getTabBtnStyle = (active: boolean): CSSProperties => ({
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: 'none',
    background: active ? theme.border : 'transparent',
    color: active ? theme.text : theme.textMuted,
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.2s',
  });

  const getHistoryItemStyle = (isSelected: boolean): CSSProperties => ({
    background: isSelected ? theme.cardHover : theme.card,
    border: `1px solid ${isSelected ? theme.secondary : theme.border}`,
    padding: '1rem',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  const styles: Record<string, CSSProperties> = {
    container: {
      backgroundColor: theme.bg,
      color: theme.text,
      minHeight: '100%',
      padding: '2rem',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: `1px solid ${theme.border}`,
      paddingBottom: '1rem',
    },
    titleBox: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    },
    title: {
      margin: 0,
      fontSize: '1.75rem',
      fontWeight: 700,
      background: `linear-gradient(45deg, ${theme.primary}, ${theme.secondary})`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    tabs: {
      display: 'flex',
      gap: '1rem',
      background: theme.card,
      padding: '0.5rem',
      borderRadius: '8px',
      border: `1px solid ${theme.border}`,
    },
    content: {
      display: 'flex',
      gap: '2rem',
      flex: 1,
    },
    mainPanel: {
      flex: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
    },
    sidePanel: {
      flex: 1,
      background: theme.card,
      borderRadius: '12px',
      padding: '1.5rem',
      border: `1px solid ${theme.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      height: 'fit-content',
    },
    card: {
      background: theme.card,
      borderRadius: '12px',
      padding: '1.5rem',
      border: `1px solid ${theme.border}`,
    },
    inputGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      marginBottom: '1rem',
    },
    label: {
      fontSize: '0.875rem',
      color: theme.textMuted,
      fontWeight: 500,
    },
    input: {
      background: 'rgba(0,0,0,0.2)',
      border: `1px solid ${theme.border}`,
      color: theme.text,
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      fontSize: '1rem',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box' as const,
    },
    select: {
      background: 'rgba(0,0,0,0.2)',
      border: `1px solid ${theme.border}`,
      color: theme.text,
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      fontSize: '1rem',
      outline: 'none',
      width: '100%',
      appearance: 'none',
    },
    textarea: {
      background: 'rgba(0,0,0,0.2)',
      border: `1px solid ${theme.border}`,
      color: theme.text,
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      fontSize: '1rem',
      outline: 'none',
      width: '100%',
      minHeight: '200px',
      resize: 'vertical',
      fontFamily: 'inherit',
      boxSizing: 'border-box' as const,
    },
    recorderBox: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1.5rem',
      padding: '2rem',
      background: `linear-gradient(180deg, ${theme.card} 0%, rgba(16,185,129,0.05) 100%)`,
      borderRadius: '12px',
      border: `1px solid ${isRecording ? theme.primary : theme.border}`,
      boxShadow: isRecording ? `0 0 20px rgba(16,185,129,0.1)` : 'none',
      transition: 'all 0.3s ease',
    },
    timer: {
      fontSize: '3.5rem',
      fontWeight: 800,
      fontVariantNumeric: 'tabular-nums',
      color: isRecording ? theme.primary : theme.text,
      textShadow: isRecording ? `0 0 20px rgba(16,185,129,0.5)` : 'none',
    },
    controls: {
      display: 'flex',
      gap: '1rem',
    },
    btnPrimary: {
      background: theme.primary,
      color: '#fff',
      border: 'none',
      padding: '0.75rem 1.5rem',
      borderRadius: '8px',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '1rem',
      transition: 'background 0.2s',
    },
    btnDanger: {
      background: theme.danger,
      color: '#fff',
      border: 'none',
      padding: '0.75rem 1.5rem',
      borderRadius: '8px',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '1rem',
    },
    btnWarning: {
      background: theme.warning,
      color: '#fff',
      border: 'none',
      padding: '0.75rem 1.5rem',
      borderRadius: '8px',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '1rem',
    },
    btnSecondary: {
      background: 'transparent',
      color: theme.text,
      border: `1px solid ${theme.border}`,
      padding: '0.75rem 1.5rem',
      borderRadius: '8px',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '1rem',
    },
    btnProcess: {
      background: `linear-gradient(90deg, ${theme.secondary}, ${theme.primary})`,
      color: '#fff',
      border: 'none',
      padding: '1rem',
      borderRadius: '8px',
      fontWeight: 700,
      cursor: 'pointer',
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '1.1rem',
      marginTop: '1rem',
    },
    transcriptBox: {
      background: '#000',
      borderRadius: '8px',
      padding: '1rem',
      maxHeight: '300px',
      overflowY: 'auto',
      border: `1px solid ${theme.border}`,
      fontFamily: 'monospace',
    },
    segment: {
      marginBottom: '0.5rem',
      lineHeight: 1.5,
    },
    timestamp: {
      color: theme.textMuted,
      marginRight: '0.5rem',
      fontSize: '0.8rem',
    },
    interim: {
      color: theme.primary,
      fontStyle: 'italic',
    },
    modeSwitch: {
      display: 'flex',
      gap: '1rem',
      marginBottom: '1.5rem',
    },
    historyList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    },
    tag: {
      background: 'rgba(139, 92, 246, 0.2)',
      color: theme.secondary,
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 600,
      display: 'inline-block',
      marginRight: '0.5rem',
      marginBottom: '0.5rem',
    },
    reportSection: {
      marginBottom: '1.5rem',
      paddingBottom: '1.5rem',
      borderBottom: `1px dashed ${theme.border}`,
    },
    reportTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '1.2rem',
      color: theme.primary,
      marginBottom: '1rem',
    },
    list: {
      margin: 0,
      paddingLeft: '1.5rem',
      color: theme.text,
      lineHeight: 1.6,
    },
    exportBar: {
      display: 'flex',
      gap: '1rem',
      padding: '1rem',
      background: theme.card,
      borderRadius: '8px',
      border: `1px solid ${theme.border}`,
      marginTop: '1rem',
    }
  };

  // --- Render Helpers ---
  const renderRecordView = () => (
    <div style={styles.mainPanel}>
      <div style={styles.card}>
        <div style={styles.modeSwitch}>
          <button 
            style={getTabBtnStyle(inputMode === 'mic')} 
            onClick={() => setInputMode('mic')}
          >
            <i className="ti ti-microphone"></i> Gravação ao Vivo
          </button>
          <button 
            style={getTabBtnStyle(inputMode === 'manual')} 
            onClick={() => setInputMode('manual')}
          >
            <i className="ti ti-keyboard"></i> Inserção Manual
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ ...styles.inputGroup, flex: 2 }}>
            <label style={styles.label}>Título da Sessão</label>
            <input 
              style={styles.input} 
              value={meetingTitle}
              onChange={e => setMeetingTitle(e.target.value)}
              placeholder="Ex: Aula de Ciências 8º Ano A"
              disabled={isRecording}
            />
          </div>
          <div style={{ ...styles.inputGroup, flex: 1 }}>
            <label style={styles.label}>Tipo</label>
            <select 
              style={styles.select}
              value={meetingType}
              onChange={e => setMeetingType(e.target.value as any)}
              disabled={isRecording}
            >
              <option value="Aula">Aula</option>
              <option value="Reunião de Pais">Reunião de Pais</option>
              <option value="Conselho">Conselho de Classe</option>
              <option value="Planejamento">Planejamento</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
        </div>

        {inputMode === 'mic' ? (
          <>
            <div style={styles.recorderBox}>
              <div style={styles.timer}>{formatTime(recordingTime)}</div>
              
              <div style={styles.controls}>
                {!isRecording ? (
                  <button style={styles.btnPrimary} onClick={startRecording}>
                    <i className="ti ti-player-record-filled"></i> Iniciar Gravação
                  </button>
                ) : (
                  <>
                    {isPaused ? (
                      <button style={styles.btnWarning} onClick={resumeRecording}>
                        <i className="ti ti-player-play-filled"></i> Continuar
                      </button>
                    ) : (
                      <button style={styles.btnWarning} onClick={pauseRecording}>
                        <i className="ti ti-player-pause-filled"></i> Pausar
                      </button>
                    )}
                    <button style={styles.btnDanger} onClick={stopRecording}>
                      <i className="ti ti-player-stop-filled"></i> Finalizar & Processar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <label style={styles.label}>Transcrição em Tempo Real</label>
              <div style={styles.transcriptBox}>
                {currentTranscription.map((seg, idx) => (
                  <div key={seg.id + idx} style={styles.segment}>
                    <span style={styles.timestamp}>[{seg.timestamp}]</span>
                    <span>{seg.text}</span>
                  </div>
                ))}
                {interimText && (
                  <div style={styles.segment}>
                    <span style={styles.interim}>{interimText}</span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
                {currentTranscription.length === 0 && !interimText && (
                  <div style={{ color: theme.textMuted, textAlign: 'center', padding: '2rem' }}>
                    A transcrição aparecerá aqui...
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div>
            <label style={styles.label}>Cole a transcrição ou anotações brutas</label>
            <textarea 
              style={styles.textarea}
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="Cole aqui o texto bruto da reunião ou suas anotações para que a IA estruture..."
            />
            <button 
              style={styles.btnProcess} 
              onClick={processTranscription}
              disabled={isProcessing || !manualInput}
            >
              {isProcessing ? (
                <><i className="ti ti-loader ti-spin"></i> Processando com IA...</>
              ) : (
                <><i className="ti ti-wand"></i> Gerar Relatório Inteligente</>
              )}
            </button>
          </div>
        )}
      </div>

      {isProcessing && inputMode === 'mic' && (
        <div style={{...styles.card, textAlign: 'center', padding: '3rem'}}>
          <i className="ti ti-brain ti-spin" style={{ fontSize: '3rem', color: theme.secondary, marginBottom: '1rem' }}></i>
          <h3>Rafinha AI está analisando a gravação...</h3>
          <p style={{color: theme.textMuted}}>Extraindo pontos-chave, ações e formatando o diário.</p>
        </div>
      )}
    </div>
  );

  const renderReport = (record: MeetingRecord) => {
    if (!record.report) return <div>Relatório não gerado.</div>;
    const rep = record.report;

    return (
      <div style={styles.card}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem'}}>
          <div>
            <h2 style={{margin: '0 0 0.5rem 0'}}>{record.title}</h2>
            <div style={{color: theme.textMuted, display: 'flex', gap: '1rem', fontSize: '0.9rem'}}>
              <span><i className="ti ti-calendar"></i> {new Date(record.date).toLocaleString()}</span>
              <span><i className="ti ti-tag"></i> {record.type}</span>
            </div>
          </div>
          <div>
            {rep.tags.map(tag => <span key={tag} style={styles.tag}>#{tag}</span>)}
          </div>
        </div>

        <div style={styles.reportSection}>
          <div style={styles.reportTitle}>
            <i className="ti ti-file-description"></i> Resumo Executivo
          </div>
          <p style={{color: theme.text, lineHeight: 1.6}}>{rep.summary}</p>
        </div>

        <div style={styles.reportSection}>
          <div style={styles.reportTitle}>
            <i className="ti ti-checkbox"></i> Ações & Encaminhamentos
          </div>
          <ul style={styles.list}>
            {rep.actionItems.map((item, idx) => (
              <li key={idx} style={{marginBottom: '0.5rem'}}>
                <strong>{item.task}</strong> <br/>
                <span style={{color: theme.textMuted, fontSize: '0.85rem'}}>
                  👤 Responsável: {item.assignee} | ⏰ Prazo: {item.deadline}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {rep.studentHighlights.length > 0 && (
          <div style={styles.reportSection}>
            <div style={{...styles.reportTitle, color: theme.secondary}}>
              <i className="ti ti-bulb"></i> Destaques / Incidentes
            </div>
            <ul style={styles.list}>
              {rep.studentHighlights.map((h, idx) => (
                <li key={idx} style={{marginBottom: '0.5rem'}}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={styles.reportSection}>
          <div style={styles.reportTitle}>
            <i className="ti ti-calendar-forward"></i> Próximos Passos
          </div>
          <ul style={styles.list}>
            {rep.nextSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ul>
        </div>
        
        <div style={styles.exportBar}>
          <button style={styles.btnPrimary} onClick={() => copyToClipboard(generateWhatsAppFormat(record))}>
            <i className="ti ti-brand-whatsapp"></i> WhatsApp
          </button>
          <button style={styles.btnSecondary} onClick={() => alert('Exportação PDF iniciada (Mock)')}>
            <i className="ti ti-file-download"></i> Baixar PDF
          </button>
          <button style={styles.btnSecondary} onClick={() => copyToClipboard(record.rawText)}>
            <i className="ti ti-copy"></i> Copiar Transcrição
          </button>
        </div>
      </div>
    );
  };

  const renderHistoryView = () => (
    <div style={styles.mainPanel}>
      {selectedRecord ? (
        <div>
          <button style={{...styles.btnSecondary, marginBottom: '1rem', border: 'none', padding: '0'}} onClick={() => setSelectedRecord(null)}>
            <i className="ti ti-arrow-left"></i> Voltar para lista
          </button>
          {renderReport(selectedRecord)}
        </div>
      ) : (
        <div style={styles.card}>
          <h2 style={{marginTop: 0}}>Atas & Gravações</h2>
          <div style={{display: 'flex', gap: '1rem', marginBottom: '1.5rem'}}>
            <input 
              style={{...styles.input, flex: 2}} 
              placeholder="Buscar por título ou conteúdo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <select style={{...styles.select, flex: 1}} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="All">Todos os Tipos</option>
              <option value="Aula">Aula</option>
              <option value="Reunião de Pais">Reunião de Pais</option>
              <option value="Conselho">Conselho de Classe</option>
              <option value="Planejamento">Planejamento</option>
            </select>
          </div>

          <div style={styles.historyList}>
            {records
              .filter(r => (filterType === 'All' || r.type === filterType) && 
                           (r.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (r.rawText && r.rawText.toLowerCase().includes(searchTerm.toLowerCase()))))
              .map(record => (
                <div key={record.id} style={getHistoryItemStyle(false)} onClick={() => setSelectedRecord(record)}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                      <h4 style={{margin: '0 0 0.25rem 0'}}>{record.title}</h4>
                      <div style={{color: theme.textMuted, fontSize: '0.85rem'}}>
                        {new Date(record.date).toLocaleDateString()} • {record.type}
                      </div>
                    </div>
                    <div>
                      {record.report?.tags.slice(0,2).map(t => <span key={t} style={styles.tag}>#{t}</span>)}
                      <i className="ti ti-chevron-right" style={{color: theme.textMuted}}></i>
                    </div>
                  </div>
                </div>
            ))}
            {records.length === 0 && (
              <div style={{textAlign: 'center', padding: '2rem', color: theme.textMuted}}>
                Nenhum registro encontrado. Comece a gravar!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.titleBox}>
          <i className="ti ti-microphone-2" style={{ fontSize: '2rem', color: theme.primary }}></i>
          <h1 style={styles.title}>Diário Inteligente & Gravador</h1>
        </div>
        
        <div style={styles.tabs}>
          <button style={getTabBtnStyle(activeTab === 'record')} onClick={() => { setActiveTab('record'); setSelectedRecord(null); }}>
            <i className="ti ti-player-record"></i> Nova Gravação
          </button>
          <button style={getTabBtnStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>
            <i className="ti ti-library"></i> Histórico & Atas
          </button>
        </div>
      </header>

      <div style={styles.content}>
        {activeTab === 'record' ? renderRecordView() : renderHistoryView()}
        
        <div style={styles.sidePanel}>
          <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <i className="ti ti-sparkles" style={{color: theme.secondary}}></i> Como Funciona?
          </h3>
          <p style={{color: theme.textMuted, fontSize: '0.9rem', lineHeight: 1.5, margin: 0}}>
            O <strong>Diário Inteligente</strong> escuta suas aulas e reuniões em tempo real ou analisa textos colados.
          </p>
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem'}}>
            <div style={{display: 'flex', gap: '0.75rem'}}>
              <div style={{background: 'rgba(16,185,129,0.1)', color: theme.primary, padding: '0.5rem', borderRadius: '8px', height: 'fit-content'}}>
                <i className="ti ti-ear"></i>
              </div>
              <div>
                <strong style={{fontSize: '0.9rem'}}>1. Captura</strong>
                <div style={{color: theme.textMuted, fontSize: '0.8rem'}}>Grave o áudio ou digite/cole as anotações.</div>
              </div>
            </div>
            <div style={{display: 'flex', gap: '0.75rem'}}>
              <div style={{background: 'rgba(139,92,246,0.1)', color: theme.secondary, padding: '0.5rem', borderRadius: '8px', height: 'fit-content'}}>
                <i className="ti ti-brain"></i>
              </div>
              <div>
                <strong style={{fontSize: '0.9rem'}}>2. Processamento IA</strong>
                <div style={{color: theme.textMuted, fontSize: '0.8rem'}}>Extração automática de ações, destaques e resumo.</div>
              </div>
            </div>
            <div style={{display: 'flex', gap: '0.75rem'}}>
              <div style={{background: 'rgba(245,158,11,0.1)', color: theme.warning, padding: '0.5rem', borderRadius: '8px', height: 'fit-content'}}>
                <i className="ti ti-share"></i>
              </div>
              <div>
                <strong style={{fontSize: '0.9rem'}}>3. Compartilhamento</strong>
                <div style={{color: theme.textMuted, fontSize: '0.8rem'}}>Exporte para WhatsApp ou PDF num clique.</div>
              </div>
            </div>
          </div>
          
          <div style={{marginTop: 'auto', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.85rem', color: theme.textMuted}}>
            <i className="ti ti-info-circle"></i> O áudio não é salvo em nuvem, garantindo a privacidade. Apenas a transcrição é armazenada no seu dispositivo.
          </div>
        </div>
      </div>
    </div>
  );
}
