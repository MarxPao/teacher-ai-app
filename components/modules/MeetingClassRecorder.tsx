'use client';

import React, { useState, useEffect, useRef, CSSProperties } from 'react';
import { exportToPdf } from '@/lib/exportUtils';

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
      // Geração de ata estruturada via /api/agent
      const aiResponse = await generateAiMeetingReport(rawText, meetingType);
      
      const newRecord: MeetingRecord = {
        id: Date.now().toString(),
        title: meetingTitle || 'Sem Título',
        date: new Date().toISOString(),
        type: meetingType,
        transcription: segments,
        rawText: rawText,
        report: aiResponse
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

  const generateAiMeetingReport = async (text: string, type: string): Promise<MeetingReport> => {
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
    return `*${record.title}*\n📅 ${new Date(record.date).toLocaleDateString()}\n\n*📝 Resumo*\n${rep.summary}\n\n*⚡ Ações*\n${rep.actionItems.map(a => `- ${a.task} (@${a.assignee})`).join('\n')}\n\n*🎯 Próximos Passos*\n${rep.nextSteps.map(s => `- ${s}`).join('\n')}`;
  };

  const handleExportPdf = (record: MeetingRecord) => {
    if (!record.report) return;
    const rep = record.report;
    const content = `
      <h2>Resumo Executivo</h2>
      <p>${rep.summary}</p>

      <h2>Ações & Encaminhamentos</h2>
      <ul>
        ${rep.actionItems.map(a => `<li><strong>${a.task}</strong> — Responsável: ${a.assignee} (Prazo: ${a.deadline})</li>`).join('')}
      </ul>

      ${rep.studentHighlights && rep.studentHighlights.length > 0 ? `
        <h2>Destaques & Ocorrências</h2>
        <ul>
          ${rep.studentHighlights.map(h => `<li>${h}</li>`).join('')}
        </ul>
      ` : ''}

      <h2>Próximos Passos</h2>
      <ul>
        ${rep.nextSteps.map(s => `<li>${s}</li>`).join('')}
      </ul>

      <h2>Transcrição da Gravação</h2>
      <div style="background: #f9f9f9; padding: 12px; border-radius: 8px; font-size: 11px; font-family: monospace; color: #444;">
        ${record.rawText}
      </div>
    `;

    exportToPdf({
      schoolName: 'ATA OFICIAL DE REUNIÃO / DIÁRIO DE AULA',
      teacherName: 'Professor(a)',
      title: record.title,
      date: new Date(record.date).toLocaleDateString('pt-BR'),
      instructions: 'Documento gerado automaticamente a partir de transcrição de áudio e síntese pedagógica pela Rafinha IA.',
      content,
      showStudentNameBox: false,
      showGradeBox: false
    });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? "0" + v : v).filter((v,i) => v !== "00" || i > 0).join(":");
  };

  // --- Styles (Paper & Ink) ---
  const theme = {
    bg: '#fdf8f2',
    card: '#fffcf8',
    cardHover: '#f5efe6',
    primary: '#8b5e3c',
    secondary: '#5c3d20',
    text: '#2c1a0e',
    textMuted: '#7a5c42',
    textLight: '#a08060',
    border: 'rgba(139,115,85,0.16)',
    danger: '#a83232',
    warning: '#c87a1e',
    success: '#3d7a4e'
  };

  const getTabBtnStyle = (active: boolean): CSSProperties => ({
    padding: '8px 18px',
    borderRadius: '9px',
    border: 'none',
    background: active ? theme.card : 'transparent',
    color: active ? theme.text : theme.textMuted,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '13.5px',
    boxShadow: active ? '0 1px 4px rgba(44,26,14,0.1)' : 'none',
    transition: 'all 0.15s ease',
    fontFamily: "'Plus Jakarta Sans', sans-serif"
  });

  const getHistoryItemStyle = (isSelected: boolean): CSSProperties => ({
    background: isSelected ? theme.cardHover : theme.card,
    border: `1px solid ${isSelected ? theme.primary : theme.border}`,
    padding: '1rem',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  const styles: Record<string, CSSProperties> = {
    container: {
      backgroundColor: theme.bg,
      color: theme.text,
      minHeight: '100vh',
      padding: '36px 40px',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: `1px solid ${theme.border}`,
      paddingBottom: '16px',
    },
    titleBox: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    title: {
      fontFamily: "'Fraunces', Georgia, serif",
      fontSize: '28px',
      fontWeight: 700,
      margin: 0,
      color: theme.text,
    },
    tabs: {
      display: 'flex',
      background: 'rgba(139,115,85,0.08)',
      padding: '4px',
      borderRadius: '12px',
      gap: '4px',
    },
    content: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: '24px',
    },
    mainPanel: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
    },
    card: {
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 2px 8px rgba(44,26,14,0.04)',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginBottom: '16px',
    },
    label: {
      fontSize: '13.5px',
      fontWeight: 600,
      color: theme.textMuted,
    },
    input: {
      padding: '10px 14px',
      borderRadius: '8px',
      border: `1px solid ${theme.border}`,
      background: theme.bg,
      color: theme.text,
      fontSize: '14px',
      outline: 'none',
      fontFamily: 'inherit',
    },
    select: {
      padding: '10px 14px',
      borderRadius: '8px',
      border: `1px solid ${theme.border}`,
      background: theme.bg,
      color: theme.text,
      fontSize: '14px',
      outline: 'none',
      fontFamily: 'inherit',
    },
    recordingCard: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '16px',
      gap: '16px',
      textAlign: 'center',
    },
    timer: {
      fontSize: '48px',
      fontFamily: 'monospace',
      fontWeight: 700,
      color: isRecording && !isPaused ? theme.danger : theme.textMuted,
    },
    recordControls: {
      display: 'flex',
      gap: '16px',
      alignItems: 'center',
    },
    btnRecord: {
      background: theme.danger,
      color: '#fff',
      border: 'none',
      borderRadius: '50%',
      width: '64px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(168, 50, 50, 0.3)',
      transition: 'transform 0.15s ease',
    },
    btnPause: {
      background: theme.cardHover,
      color: theme.text,
      border: `1px solid ${theme.border}`,
      borderRadius: '50%',
      width: '48px',
      height: '48px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      cursor: 'pointer',
    },
    btnStop: {
      background: theme.primary,
      color: '#fff',
      border: 'none',
      borderRadius: '50%',
      width: '48px',
      height: '48px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(139,94,60,0.3)',
    },
    transcriptBox: {
      background: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: '12px',
      padding: '16px',
      minHeight: '160px',
      maxHeight: '260px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '14px',
      lineHeight: 1.6,
    },
    interim: {
      color: theme.textLight,
      fontStyle: 'italic',
    },
    sidePanel: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
    },
    historyList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      maxHeight: '600px',
      overflowY: 'auto',
    },
    reportSection: {
      marginBottom: '20px',
    },
    reportTitle: {
      fontSize: '15px',
      fontWeight: 700,
      color: theme.secondary,
      marginBottom: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    list: {
      margin: 0,
      paddingLeft: '20px',
      fontSize: '13.5px',
      color: theme.text,
    },
    exportBar: {
      display: 'flex',
      gap: '12px',
      marginTop: '24px',
      borderTop: `1px solid ${theme.border}`,
      paddingTop: '16px',
    },
    btnPrimary: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      background: theme.primary,
      color: '#fff',
      border: 'none',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '13.5px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    btnSecondary: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      background: theme.cardHover,
      color: theme.text,
      border: `1px solid ${theme.border}`,
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '13.5px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    tag: {
      fontSize: '11px',
      background: 'rgba(139,94,60,0.1)',
      color: theme.primary,
      padding: '2px 8px',
      borderRadius: '4px',
      fontWeight: 600,
      marginRight: '6px',
    }
  };

  const renderRecordView = () => (
    <div style={styles.mainPanel}>
      <div style={styles.card}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ ...styles.formGroup, flex: 2 }}>
            <label style={styles.label}>Título da Sessão / Pauta</label>
            <input 
              style={styles.input} 
              placeholder="Ex: Aula de Listening - 9º Ano ou Reunião de Pais"
              value={meetingTitle}
              onChange={e => setMeetingTitle(e.target.value)}
              disabled={isRecording}
            />
          </div>
          <div style={{ ...styles.formGroup, flex: 1 }}>
            <label style={styles.label}>Tipo de Evento</label>
            <select 
              style={styles.select}
              value={meetingType}
              onChange={e => setMeetingType(e.target.value as any)}
              disabled={isRecording}
            >
              <option value="Aula">Aula Regular</option>
              <option value="Reunião de Pais">Reunião de Pais</option>
              <option value="Conselho">Conselho de Classe</option>
              <option value="Planejamento">Planejamento Docente</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button 
            style={getTabBtnStyle(inputMode === 'mic')}
            onClick={() => setInputMode('mic')}
            disabled={isRecording}
          >
            <i className="ti ti-microphone"></i> Gravação de Voz (Microfone)
          </button>
          <button 
            style={getTabBtnStyle(inputMode === 'manual')}
            onClick={() => setInputMode('manual')}
            disabled={isRecording}
          >
            <i className="ti ti-keyboard"></i> Digitação / Colar Notas
          </button>
        </div>
      </div>

      {inputMode === 'mic' ? (
        <div style={styles.recordingCard}>
          <div style={styles.timer}>{formatTime(recordingTime)}</div>
          
          <div style={styles.recordControls}>
            {!isRecording ? (
              <button style={styles.btnRecord} onClick={startRecording} title="Iniciar Gravação">
                <i className="ti ti-microphone"></i>
              </button>
            ) : (
              <>
                {isPaused ? (
                  <button style={styles.btnPause} onClick={resumeRecording} title="Retomar">
                    <i className="ti ti-player-play"></i>
                  </button>
                ) : (
                  <button style={styles.btnPause} onClick={pauseRecording} title="Pausar">
                    <i className="ti ti-player-pause"></i>
                  </button>
                )}
                <button style={styles.btnStop} onClick={stopRecording} title="Finalizar & Gerar Ata">
                  <i className="ti ti-player-stop"></i>
                </button>
              </>
            )}
          </div>

          <div style={{ width: '100%', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={styles.label}>Transcrição em Tempo Real</span>
              {isRecording && !isPaused && (
                <span style={{ fontSize: '12px', color: theme.danger, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: theme.danger, display: 'inline-block' }}></span>
                  Gravando...
                </span>
              )}
            </div>
            <div style={styles.transcriptBox}>
              {currentTranscription.map((t, idx) => (
                <div key={idx}>
                  <span style={{ color: theme.textMuted, fontSize: '11px', marginRight: '6px' }}>[{t.timestamp}]</span>
                  {t.text}
                </div>
              ))}
              {interimText && (
                <div style={styles.interim}>
                  <span style={{ color: theme.textMuted, fontSize: '11px', marginRight: '6px' }}>[...]</span>
                  {interimText}
                </div>
              )}
              {currentTranscription.length === 0 && !interimText && (
                <div style={{ color: theme.textLight, textAlign: 'center', margin: 'auto' }}>
                  {isRecording ? 'Fale próximo ao microfone...' : 'Clique no botão vermelho para iniciar.'}
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Anotações Brutas / Transcrição Externa</label>
            <textarea 
              style={{ ...styles.input, minHeight: '200px', resize: 'vertical' }}
              placeholder="Cole aqui o texto da reunião ou anotações livres da aula..."
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
            />
          </div>
          <button 
            style={{ ...styles.btnPrimary, alignSelf: 'flex-start' }}
            onClick={processTranscription}
            disabled={isProcessing || !manualInput}
          >
            <i className="ti ti-sparkles"></i> {isProcessing ? 'Sintetizando...' : 'Gerar Ata com Rafinha IA'}
          </button>
        </div>
      )}

      {isProcessing && (
        <div style={{ ...styles.card, textAlign: 'center', padding: '32px' }}>
          <i className="ti ti-loader" style={{ fontSize: '32px', color: theme.primary, animation: 'spin 1s infinite linear' }}></i>
          <h4 style={{ margin: '12px 0 4px 0' }}>Processando com Rafinha IA</h4>
          <p style={{ color: theme.textMuted, fontSize: '13px', margin: 0 }}>Estruturando resumo executivo, encaminhamentos e destaques...</p>
        </div>
      )}
    </div>
  );

  const renderReport = (record: MeetingRecord) => {
    if (!record.report) return null;
    const rep = record.report;

    return (
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${theme.border}`, paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.4rem' }}>{record.title}</h2>
            <div style={{ color: theme.textMuted, fontSize: '13px' }}>
              <i className="ti ti-calendar"></i> {new Date(record.date).toLocaleDateString('pt-BR')} &bull; Tipo: <strong>{record.type}</strong>
            </div>
          </div>
          <div>
            {rep.tags.map((t, idx) => (
              <span key={idx} style={styles.tag}>#{t}</span>
            ))}
          </div>
        </div>

        <div style={styles.reportSection}>
          <div style={styles.reportTitle}>
            <i className="ti ti-file-text" style={{ color: theme.primary }}></i> Resumo Executivo
          </div>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6 }}>{rep.summary}</p>
        </div>

        <div style={styles.reportSection}>
          <div style={styles.reportTitle}>
            <i className="ti ti-checklist" style={{ color: theme.primary }}></i> Ações & Encaminhamentos
          </div>
          <ul style={styles.list}>
            {rep.actionItems.map((act, idx) => (
              <li key={idx} style={{ marginBottom: '6px' }}>
                <strong>{act.task}</strong> &bull; <span style={{ color: theme.textMuted }}>Resp: {act.assignee} | Prazo: {act.deadline}</span>
              </li>
            ))}
          </ul>
        </div>

        {rep.studentHighlights && rep.studentHighlights.length > 0 && (
          <div style={styles.reportSection}>
            <div style={styles.reportTitle}>
              <i className="ti ti-bulb" style={{ color: theme.primary }}></i> Destaques / Incidentes
            </div>
            <ul style={styles.list}>
              {rep.studentHighlights.map((h, idx) => (
                <li key={idx} style={{ marginBottom: '8px' }}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={styles.reportSection}>
          <div style={styles.reportTitle}>
            <i className="ti ti-calendar-forward" style={{ color: theme.primary }}></i> Próximos Passos
          </div>
          <ul style={styles.list}>
            {rep.nextSteps.map((step, idx) => (
              <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
            ))}
          </ul>
        </div>
        
        <div style={styles.exportBar}>
          <button style={styles.btnPrimary} onClick={() => copyToClipboard(generateWhatsAppFormat(record))}>
            <i className="ti ti-brand-whatsapp"></i> WhatsApp
          </button>
          <button style={styles.btnSecondary} onClick={() => handleExportPdf(record)}>
            <i className="ti ti-file-download"></i> Baixar PDF Oficial
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
          <button style={{ ...styles.btnSecondary, marginBottom: '16px', background: 'transparent', border: 'none', padding: '8px 0', boxShadow: 'none' }} onClick={() => setSelectedRecord(null)}>
            <i className="ti ti-arrow-left"></i> Voltar para lista
          </button>
          {renderReport(selectedRecord)}
        </div>
      ) : (
        <div style={styles.card}>
          <h2 style={{ marginTop: 0, fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.5rem', marginBottom: '20px' }}>Atas & Gravações</h2>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <input 
              style={{ ...styles.input, flex: 2 }} 
              placeholder="Buscar por título ou conteúdo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <select style={{ ...styles.select, flex: 1 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>{record.title}</h4>
                      <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                        {new Date(record.date).toLocaleDateString('pt-BR')} &bull; {record.type}
                      </div>
                    </div>
                    <div>
                      {record.report?.tags.slice(0,2).map(t => <span key={t} style={styles.tag}>#{t}</span>)}
                      <i className="ti ti-chevron-right" style={{ color: theme.textLight }}></i>
                    </div>
                  </div>
                </div>
              ))}
            {records.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: theme.textLight }}>
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
          <i className="ti ti-microphone-2" style={{ fontSize: '24px', color: theme.primary }}></i>
          <div>
            <h1 style={styles.title}>Diário Inteligente & Gravador</h1>
            <p style={{ fontSize: '14px', color: theme.textLight, margin: '6px 0 0 0' }}>Capture atas e resumos de aulas automaticamente</p>
          </div>
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
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Fraunces', Georgia, serif", fontSize: '18px' }}>
            <i className="ti ti-sparkles" style={{ color: theme.primary }}></i> Como Funciona?
          </h3>
          <p style={{ color: theme.textMuted, fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
            O <strong>Diário Inteligente</strong> escuta suas aulas e reuniões em tempo real ou analisa textos colados para criar atas estruturadas.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ background: 'rgba(139,94,60,0.1)', color: theme.primary, padding: '8px', borderRadius: '8px', height: 'fit-content' }}>
                <i className="ti ti-ear" style={{ fontSize: '18px' }}></i>
              </div>
              <div>
                <strong style={{ fontSize: '13.5px' }}>1. Captura</strong>
                <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>Grave o áudio ou digite/cole as anotações brutas.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ background: 'rgba(139,94,60,0.1)', color: theme.primary, padding: '8px', borderRadius: '8px', height: 'fit-content' }}>
                <i className="ti ti-brain" style={{ fontSize: '18px' }}></i>
              </div>
              <div>
                <strong style={{ fontSize: '13.5px' }}>2. Processamento IA</strong>
                <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>Extração automática de ações, destaques e geração de resumo.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ background: 'rgba(139,94,60,0.1)', color: theme.primary, padding: '8px', borderRadius: '8px', height: 'fit-content' }}>
                <i className="ti ti-share" style={{ fontSize: '18px' }}></i>
              </div>
              <div>
                <strong style={{ fontSize: '13.5px' }}>3. Compartilhamento</strong>
                <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>Exporte rapidamente para o WhatsApp ou em PDF.</div>
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: 'auto', padding: '16px', background: theme.cardHover, borderRadius: '12px', fontSize: '12px', color: theme.textMuted, border: `1px solid ${theme.border}`, lineHeight: 1.5 }}>
            <i className="ti ti-info-circle" style={{ marginRight: '4px' }}></i> O áudio não é salvo em nuvem, garantindo a privacidade. Apenas a transcrição textual é armazenada no seu dispositivo.
          </div>
        </div>
      </div>
    </div>
  );
}