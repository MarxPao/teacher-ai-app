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
      setClasses([
        { id: '1', name: 'English 101', level: 'Beginner' },
        { id: '2', name: 'Advanced Conversation', level: 'Advanced' }
      ]);
    }

    if (storedStudents) {
      try {
        setStudents(JSON.parse(storedStudents));
      } catch (e) {
        console.error(e);
      }
    } else {
      setStudents([
        { id: 's1', classId: '1', name: 'Alice Smith', grades: [8, 9, 8.5], attendance: 95 },
        { id: 's2', classId: '1', name: 'Bob Johnson', grades: [6, 5.5, 6], attendance: 70 },
        { id: 's3', classId: '2', name: 'Charlie Brown', grades: [9, 9.5, 10], attendance: 100 },
      ]);
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
    
    // Simulando compilação de dados
    const avgAttendance = classStudents.length > 0 
      ? classStudents.reduce((acc, s) => acc + (s.attendance || 85), 0) / classStudents.length 
      : 0;
      
    const highlightStudents = classStudents.filter(s => (s.attendance || 0) > 90);
    const attentionStudents = classStudents.filter(s => (s.attendance || 0) < 75);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Você é uma coordenadora e professora de inglês de elite.
Elabore um Parecer Pedagógico Mensal formal da turma para entrega à Coordenação da Escola.

Dados da Turma:
- Nome da Turma: ${selectedClass?.name || 'Turma'} (Nível: ${selectedClass?.level || 'N/A'})
- Mês de Referência: ${selectedMonth}
- Frequência Média: ${avgAttendance.toFixed(1)}%
- Alunos em Destaque: ${highlightStudents.map(s => s.name).join(', ') || 'Sem destaques isolados'}
- Alunos Necessitando Acompanhamento: ${attentionStudents.map(s => s.name).join(', ') || 'Nenhum'}

Estruture com o cabeçalho formal, 1. Desempenho Geral e Frequência, 2. Conteúdos Lecionados e Objetivos BNCC/ELT, 3. Destaques e Acompanhamento Individualizado, 4. Plano de Ação para o Próximo Mês, e assinatura.`
            }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const generated = data.reply || data.text;
        if (generated) {
          setReportContent(generated);
          setIsGenerating(false);
          showToast('Parecer gerado com sucesso com Rafinha IA!');
          return;
        }
      }
    } catch (err) {
      console.warn('Real AI report fallback:', err);
    }

    // Fallback inteligente
    const generatedText = `PARECER PEDAGÓGICO MENSAL - REFERÊNCIA: ${selectedMonth}\n\n` +
      `TURMA: ${selectedClass?.name} | NÍVEL: ${selectedClass?.level || 'N/A'}\n\n` +
      `1. DESEMPENHO GERAL DA TURMA\n` +
      `Durante o mês de referência, a turma demonstrou um bom engajamento nas atividades propostas. A taxa média de frequência foi de ${avgAttendance.toFixed(1)}%, indicando um nível satisfatório de assiduidade. A participação oral e a compreensão auditiva foram os pontos fortes trabalhados neste período.\n\n` +
      `2. CONTEÚDOS LECIONADOS E OBJETIVOS BNCC/ELT\n` +
      `- Prática intensiva de estruturas gramaticais em contexto significativo\n` +
      `- Expansão lexical e consolidação da pronúncia e entonação\n` +
      `- Dinâmicas de conversação e dramatização voltadas à fluência oral\n\n` +
      `3. DESTAQUES E ACOMPANHAMENTO INDIVIDUALIZADO\n` +
      `Alunos com excelente desempenho e participação ativa: ${highlightStudents.map(s => s.name).join(', ') || 'Turma homogênea com boa participação geral'}.\n` +
      `Alunos que requerem maior acompanhamento pedagógico devido a faltas ou dificuldades: ${attentionStudents.map(s => s.name).join(', ') || 'Nenhum'}.\n\n` +
      `4. PLANO DE AÇÃO PARA O PRÓXIMO MÊS\n` +
      `Focaremos em aprimorar a produção escrita e continuaremos com os simulados de fluência, buscando elevar a confiança dos alunos nas apresentações individuais.\n\n` +
      `Assinado,\n[Nome do Professor]\nProfessor(a) de Inglês`;
      
    setReportContent(generatedText);
    setIsGenerating(false);
    showToast('Parecer gerado com sucesso!');
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
      minHeight: '100%',
      backgroundColor: '#0f1117',
      color: '#e2e8f0',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="ti ti-report" style={{ color: '#8b5cf6', fontSize: '32px' }}></i>
          Relatório Mensal da Turma
        </h1>
        <p style={{ margin: 0, color: '#94a3b8' }}>
          Gere pareceres pedagógicos formais automaticamente para a coordenação.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        
        {/* Painel de Controle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            backgroundColor: '#1a1d2e',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #2e334a'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-adjustments-horizontal" style={{ color: '#3b82f6' }}></i>
              Configurações
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#cbd5e1' }}>Turma</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#0f1117',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  outline: 'none',
                  fontSize: '14px'
                }}
              >
                <option value="">Selecione uma turma...</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#cbd5e1' }}>Mês de Referência</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#0f1117',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  outline: 'none',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              style={{
                width: '100%',
                padding: '14px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'opacity 0.2s',
                opacity: isGenerating ? 0.7 : 1
              }}
            >
              {isGenerating ? (
                <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }}></i>
              ) : (
                <i className="ti ti-sparkles"></i>
              )}
              {isGenerating ? 'Analisando Dados...' : 'Gerar Parecer Pedagógico Completo'}
            </button>
            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
          </div>

          <div style={{
            backgroundColor: '#1a1d2e',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #2e334a'
          }}>
             <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#94a3b8' }}>Ações de Documento</h2>
             <button
              onClick={handlePrint}
              disabled={!reportContent}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'transparent',
                color: reportContent ? '#38bdf8' : '#475569',
                border: `1px solid ${reportContent ? '#38bdf8' : '#334155'}`,
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: reportContent ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <i className="ti ti-printer"></i>
              Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        {/* Pré-visualização do Documento */}
        <div style={{
          backgroundColor: '#1a1d2e',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #2e334a',
          display: 'flex',
          flexDirection: 'column'
        }}>
           <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-file-text" style={{ color: '#10b981' }}></i>
              Pré-visualização do Documento
            </h2>
            
            <div style={{
              flex: 1,
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '40px',
              color: '#000000',
              overflowY: 'auto',
              maxHeight: '600px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
              {reportContent ? (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px', fontFamily: '"Times New Roman", Times, serif' }}>
                  {/* Fake Header Escolar */}
                  <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '16px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', textTransform: 'uppercase' }}>Escola de Idiomas TeacherAI</h3>
                    <p style={{ margin: '0', fontSize: '12px', color: '#444' }}>Coordenação Pedagógica - Relatório Oficial</p>
                  </div>
                  {reportContent}
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '16px' }}>
                  <i className="ti ti-file-dashed" style={{ fontSize: '48px', color: '#cbd5e1' }}></i>
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
          backgroundColor: '#3b82f6',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 1000,
          animation: 'slideIn 0.3s ease-out'
        }}>
          <i className="ti ti-info-circle"></i>
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
