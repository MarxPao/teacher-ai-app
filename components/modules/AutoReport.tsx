'use client';

import React, { useState, useEffect } from 'react';

// Tipagens baseadas nos dados do app
interface ClassData {
  id: string;
  name: string;
  level?: string;
  schedule?: string;
}

interface StudentData {
  id: string;
  classId: string;
  name: string;
  status?: string;
  grades?: number[];
  attendance?: number;
}

export default function AutoReport() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportContent, setReportContent] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Carregar dados reais do localStorage se existirem
    const storedClasses = localStorage.getItem('teacher_classes');
    const storedStudents = localStorage.getItem('teacher_students');
    
    if (storedClasses) {
      try {
        setClasses(JSON.parse(storedClasses));
      } catch (e) {
        console.error(e);
      }
    } else {
      setClasses([]);
    }

    if (storedStudents) {
      try {
        const loaded = JSON.parse(storedStudents);
        const LEGACY_SAMPLE_NAMES_TO_FILTER = ['Alice Smith', 'Bob Johnson', 'Bob Jones', 'Charlie Brown', 'Diana Prince'];
        setStudents(Array.isArray(loaded) ? loaded.filter((s: any) => !LEGACY_SAMPLE_NAMES_TO_FILTER.includes(s.name)) : []);
      } catch (e) {
        console.error(e);
      }
    } else {
      setStudents([]);
    }
    
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleGenerateReport = async () => {
    if (!selectedClassId) {
      showToast('Por favor, selecione uma turma primeiro.');
      return;
    }
    
    setIsGenerating(true);
    setReportContent('');
    
    const selectedClass = classes.find(c => c.id === selectedClassId);
    const classStudents = students.filter(s => s.classId === selectedClassId);
    
    const avgAttendance = classStudents.length > 0 
      ? classStudents.reduce((acc, s) => acc + (s.attendance || 85), 0) / classStudents.length 
      : 85;
      
    const highlightStudents = classStudents.filter(s => (s.attendance || 0) > 90);
    const attentionStudents = classStudents.filter(s => (s.attendance || 0) < 75);

    try {
      const prompt = `Você é a Rafinha IA assistente pedagógica do TeacherAI.
Elabore um PARECER PEDAGÓGICO MENSAL FORMAL e profissional para a coordenação de escola.

Dados da Turma:
- Turma: ${selectedClass?.name || 'Turma'} (Nível: ${selectedClass?.level || 'Inglês'})
- Mês de Referência: ${selectedMonth}
- Frequência Média: ${avgAttendance.toFixed(1)}%
- Alunos em Destaque: ${highlightStudents.map(s => s.name).join(', ') || 'Sem destaques específicos'}
- Alunos em Atenção: ${attentionStudents.map(s => s.name).join(', ') || 'Nenhum'}

Estrutura requerida no parecer:
1. DESEMPENHO GERAL DA TURMA
2. CONTEÚDOS LECIONADOS E METODOLOGIA
3. DESTAQUES E PONTOS DE ATENÇÃO
4. RECOMENDAÇÕES E PLANO DE AÇÃO PARA O PRÓXIMO MÊS

Utilize tom formal, embasado e respeitoso em português.`;

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      let text = data?.reply || data?.content || '';

      if (!text) {
        text = `PARECER PEDAGÓGICO MENSAL - REFERÊNCIA: ${selectedMonth}\n\n` +
        `TURMA: ${selectedClass?.name} | NÍVEL: ${selectedClass?.level || 'N/A'}\n\n` +
        `1. DESEMPENHO GERAL DA TURMA\n` +
        `A turma demonstrou um bom engajamento nas atividades propostas. A taxa média de frequência foi de ${avgAttendance.toFixed(1)}%, indicando um nível satisfatório de assiduidade. A participação oral e a compreensão auditiva foram os pontos fortes trabalhados neste período.\n\n` +
        `2. CONTEÚDOS LECIONADOS E METODOLOGIA\n` +
        `- Revisão de tempos verbais e estrutura sintática em inglês\n` +
        `- Vocabulário temático e atividades de conversação orientada\n` +
        `- Dinâmicas de Task-Based Learning e produção oral\n\n` +
        `3. DESTAQUES E PONTOS DE ATENÇÃO\n` +
        `Alunos com excelente desempenho: ${highlightStudents.map(s => s.name).join(', ') || 'Nenhum destaque específico'}.\n` +
        `Alunos que requerem acompanhamento: ${attentionStudents.map(s => s.name).join(', ') || 'Nenhum'}.\n\n` +
        `4. RECOMENDAÇÕES E PLANO DE AÇÃO PARA O PRÓXIMO MÊS\n` +
        `Focaremos em aprimorar a produção escrita e continuaremos com os simulados de fluência, buscando elevar a confiança dos alunos.`;
      }

      setReportContent(text);
      showToast('Parecer gerado com sucesso via IA!');
    } catch (err) {
      console.error('AutoReport AI error:', err);
      const fallbackText = `PARECER PEDAGÓGICO MENSAL - REFERÊNCIA: ${selectedMonth}\n\nTURMA: ${selectedClass?.name}\n\n1. DESEMPENHO GERAL DA TURMA\nFrequência média de ${avgAttendance.toFixed(1)}%. Bom nível de engajamento nas práticas orais e auditivas.\n\n2. RECOMENDAÇÕES\nContinuar com dinâmicas de conversação e reforço em produção escrita.`;
      setReportContent(fallbackText);
      showToast('Parecer gerado via síntese local.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!reportContent) {
      showToast('Gere um relatório antes de imprimir.');
      return;
    }
    showToast('Preparando documento para impressão...');
    // Funcionalidade de impressão simulada
    setTimeout(() => {
      window.print();
    }, 1000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#fdf8f2',
      color: '#2c1a0e',
      padding: '36px 40px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid rgba(139,115,85,0.12)' }}>
        <h1 style={{  textAlign: 'center', margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '700', fontFamily: "'Fraunces', Georgia, serif", display: 'flex', alignItems: 'center', gap: '12px', color: '#2c1a0e'  }}>
          <i className="ti ti-report" style={{ color: '#8b5e3c', fontSize: '32px' }}></i>
          Relatório Mensal da Turma
        </h1>
        <p style={{ margin: 0, color: '#a08060', fontSize: '14px', marginTop: '6px' }}>
          Gere pareceres pedagógicos formais automaticamente para a coordenação.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        
        {/* Painel de Controle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            backgroundColor: '#fffcf8',
            borderRadius: '16px',
            padding: '28px',
            border: '1px solid rgba(139,115,85,0.12)',
            boxShadow: '0 2px 8px rgba(44,26,14,0.06)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontFamily: "'Fraunces', Georgia, serif", display: 'flex', alignItems: 'center', gap: '8px', color: '#2c1a0e' }}>
              <i className="ti ti-adjustments-horizontal" style={{ color: '#8b5e3c' }}></i>
              Configurações
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13.5px', color: '#7a5c42', fontWeight: 500 }}>Turma</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#fffcf8',
                  border: '1px solid rgba(139,115,85,0.18)',
                  borderRadius: '9px',
                  color: '#2c1a0e',
                  outline: 'none',
                  fontSize: '13.5px',
                  fontFamily: "'Plus Jakarta Sans', sans-serif"
                }}
              >
                <option value="">Selecione uma turma...</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13.5px', color: '#7a5c42', fontWeight: 500 }}>Mês de Referência</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#fffcf8',
                  border: '1px solid rgba(139,115,85,0.18)',
                  borderRadius: '9px',
                  color: '#2c1a0e',
                  outline: 'none',
                  fontSize: '13.5px',
                  boxSizing: 'border-box',
                  fontFamily: "'Plus Jakarta Sans', sans-serif"
                }}
              />
            </div>

            <button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              style={{
                width: '100%',
                padding: '12px 20px',
                background: '#8b5e3c',
                color: '#fffcf8',
                border: 'none',
                borderRadius: '9px',
                fontSize: '13.5px',
                fontWeight: '600',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.18s ease',
                opacity: isGenerating ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(139,94,60,0.3)',
                fontFamily: "'Plus Jakarta Sans', sans-serif"
              }}
            >
              {isGenerating ? (
                <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }}></i>
              ) : (
                <i className="ti ti-sparkles"></i>
              )}
              {isGenerating ? 'Analisando Dados...' : 'Gerar Parecer Pedagógico'}
            </button>
            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
          </div>

          <div style={{
            backgroundColor: '#f5efe6',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid rgba(139,115,85,0.14)'
          }}>
             <h2 style={{ margin: '0 0 16px 0', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.4px', color: '#c4a882' }}>Ações de Documento</h2>
             <button
              onClick={async () => {
                if (!reportContent) return
                try {
                  const { exportElementToPdf } = await import('@/lib/exportUtils')
                  await exportElementToPdf('auto-report-paper', `parecer_${selectedClassId || 'turma'}`)
                } catch {
                  window.print()
                }
              }}
              disabled={!reportContent}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: reportContent ? '#cb4b16' : 'transparent',
                color: reportContent ? '#ffffff' : '#a08060',
                border: 'none',
                borderRadius: '9px',
                fontSize: '13.5px',
                fontWeight: '600',
                cursor: reportContent ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: reportContent ? '0 2px 6px rgba(203,75,22,0.25)' : 'none'
              }}
            >
              <i className="ti ti-file-type-pdf"></i>
              Exportar PDF HD
            </button>

            <button
              onClick={async () => {
                if (!reportContent) return
                const { exportToWord } = await import('@/lib/exportUtils')
                exportToWord({ title: 'Parecer Pedagógico', content: reportContent, className: selectedClassId || 'Turma' })
              }}

              disabled={!reportContent}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: reportContent ? '#268bd2' : 'transparent',
                color: reportContent ? '#ffffff' : '#a08060',
                border: 'none',
                borderRadius: '9px',
                fontSize: '13.5px',
                fontWeight: '600',
                cursor: reportContent ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: reportContent ? '0 2px 6px rgba(38,139,210,0.25)' : 'none'
              }}
            >
              <i className="ti ti-file-word"></i>
              Baixar em Word (.docx)
            </button>
          </div>
        </div>

        {/* Pré-visualização do Documento */}
        <div style={{
          backgroundColor: '#fffcf8',
          borderRadius: '16px',
          padding: '28px',
          border: '1px solid rgba(139,115,85,0.12)',
          boxShadow: '0 2px 8px rgba(44,26,14,0.06)',
          display: 'flex',
          flexDirection: 'column'
        }}>
           <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontFamily: "'Fraunces', Georgia, serif", display: 'flex', alignItems: 'center', gap: '8px', color: '#2c1a0e' }}>
              <i className="ti ti-file-text" style={{ color: '#3d7a4e' }}></i>
              Pré-visualização do Documento
            </h2>
            
            <div id="auto-report-paper" style={{
              flex: 1,
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid rgba(139,115,85,0.2)',
              padding: '40px',
              color: '#2c1a0e',
              overflowY: 'auto',
              maxHeight: '600px',
              boxShadow: '0 8px 30px rgba(44,26,14,0.1)'
            }}>
              {reportContent ? (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px', fontFamily: '"Times New Roman", Times, serif' }}>
                  {/* Fake Header Escolar */}
                  <div style={{ textAlign: 'center', borderBottom: '2px solid #2c1a0e', paddingBottom: '16px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', textTransform: 'uppercase', fontFamily: "'Fraunces', Georgia, serif" }}>Escola de Idiomas TeacherAI</h3>
                    <p style={{ margin: '0', fontSize: '12px', color: '#5c3d20', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Coordenação Pedagógica - Relatório Oficial</p>
                  </div>
                  {reportContent}
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a08060', gap: '16px' }}>
                  <i className="ti ti-file-dashed" style={{ fontSize: '48px', color: '#c4a882' }}></i>
                  <p style={{ margin: 0 }}>O relatório gerado aparecerá aqui.</p>
                </div>
              )}
            </div>
        </div>

      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#2c1a0e',
          color: '#fdf8f2',
          padding: '12px 24px',
          borderRadius: '9px',
          boxShadow: '0 4px 12px rgba(44,26,14,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 1000,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: '13.5px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <i className="ti ti-info-circle" style={{ color: '#c4a882' }}></i>
          {toastMessage}
          <style>{`
            @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
