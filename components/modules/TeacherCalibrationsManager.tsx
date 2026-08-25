'use client'

import React, { useState, useEffect } from 'react'
import {
  getTeacherCalibrations,
  saveTeacherCalibrations,
  TeacherAppCalibrations,
  DEFAULT_CALIBRATIONS
} from '@/lib/teacherCalibrations'

export default function TeacherCalibrationsManager() {
  const [calibrations, setCalibrations] = useState<TeacherAppCalibrations>(getTeacherCalibrations())
  const [savedToast, setSavedToast] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'exam' | 'grading' | 'gradebook' | 'attendance' | 'planner' | 'communication' | 'agent'>('exam')

  useEffect(() => {
    const handleUpdate = () => {
      setCalibrations(getTeacherCalibrations())
    }
    window.addEventListener('teacher:calibrations_changed', handleUpdate)
    return () => window.removeEventListener('teacher:calibrations_changed', handleUpdate)
  }, [])

  const handleSave = (newCalibrations: Partial<TeacherAppCalibrations>) => {
    const updated = saveTeacherCalibrations(newCalibrations)
    setCalibrations(updated)
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2500)
  }

  const subTabs = [
    { id: 'exam', label: '📝 Provas & Questões', icon: 'ti-file-text' },
    { id: 'grading', label: '✍️ Correção & Rubricas', icon: 'ti-checklist' },
    { id: 'gradebook', label: '📊 Caderneta de Notas', icon: 'ti-calculator' },
    { id: 'attendance', label: '📋 Frequência & Chamada', icon: 'ti-calendar' },
    { id: 'planner', label: '📅 Planejador de Aulas', icon: 'ti-notes' },
    { id: 'communication', label: '💬 Comunicados aos Pais', icon: 'ti-message-circle' },
    { id: 'agent', label: '🦉 Assistente Rafinha', icon: 'ti-robot' }
  ]

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #d5c8bb', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-adjustments-horizontal" style={{ color: '#854d0e' }} />
            Calibrações e Padrões dos Módulos
          </h2>
          <p style={{ fontSize: 13, color: '#786555', margin: '4px 0 0' }}>
            Configure aqui seus valores padrão. O Teacher AI preencherá automaticamente todos os formulários e módulos com suas preferências.
          </p>
        </div>

        <button
          onClick={() => {
            if (confirm('Deseja restaurar todas as calibrações para os padrões recomendados de fábrica?')) {
              handleSave(DEFAULT_CALIBRATIONS)
            }
          }}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #e7dcd1',
            background: '#faf6f0',
            color: '#786555',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          Restaurar Padrões
        </button>
      </div>

      {/* Subtabs horizontais */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e7dcd1', paddingBottom: 10, marginBottom: 20, overflowX: 'auto' }}>
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: activeSubTab === tab.id ? '1px solid #854d0e' : '1px solid transparent',
              background: activeSubTab === tab.id ? '#fef9c3' : 'transparent',
              color: activeSubTab === tab.id ? '#854d0e' : '#5c4838',
              fontWeight: activeSubTab === tab.id ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Provas e Questões */}
      {activeSubTab === 'exam' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Nível CEFR Padrão
            </label>
            <select
              value={calibrations.exam.defaultLevel}
              onChange={e => handleSave({ exam: { ...calibrations.exam, defaultLevel: e.target.value } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="A1">A1 — Iniciante</option>
              <option value="A2">A2 — Básico</option>
              <option value="B1">B1 — Intermediário</option>
              <option value="B2">B2 — Intermediário Superior</option>
              <option value="C1">C1 — Avançado</option>
              <option value="C2">C2 — Fluente / Domínio Pleno</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Quantidade de Questões Padrão
            </label>
            <select
              value={calibrations.exam.defaultQuestionCount}
              onChange={e => handleSave({ exam: { ...calibrations.exam, defaultQuestionCount: e.target.value } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="5">5 Questões (Avaliação Curta)</option>
              <option value="10">10 Questões (Padrão Oficial)</option>
              <option value="15">15 Questões (Exame Bimestral)</option>
              <option value="20">20 Questões (Simulado Extensivo)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Formato de Questão Padrão
            </label>
            <select
              value={calibrations.exam.defaultQuestionType}
              onChange={e => handleSave({ exam: { ...calibrations.exam, defaultQuestionType: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="multiple_choice">Apenas Múltipla Escolha (A, B, C, D)</option>
              <option value="open">Apenas Dissertativas / Abertas</option>
              <option value="mixed">Misto (Múltipla Escolha + Abertas)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Idioma dos Enunciados
            </label>
            <select
              value={calibrations.exam.defaultStemLanguage}
              onChange={e => handleSave({ exam: { ...calibrations.exam, defaultStemLanguage: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="pt">Português (Enunciados em PT e conteúdo em EN)</option>
              <option value="en">Inglês Total (100% Imersivo)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Pontuação Total Padrão da Prova
            </label>
            <input
              type="number"
              value={calibrations.exam.defaultTotalScore}
              onChange={e => handleSave({ exam: { ...calibrations.exam, defaultTotalScore: Number(e.target.value) } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Duração da Prova (Minutos)
            </label>
            <input
              type="number"
              value={calibrations.exam.defaultDurationMinutes}
              onChange={e => handleSave({ exam: { ...calibrations.exam, defaultDurationMinutes: Number(e.target.value) } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            />
          </div>
        </div>
      )}

      {/* 2. Correção & Rubricas */}
      {activeSubTab === 'grading' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Rubrica de Redação / Produção Textual Padrão
            </label>
            <select
              value={calibrations.grading.defaultRubricPreset}
              onChange={e => handleSave({ grading: { ...calibrations.grading, defaultRubricPreset: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="cambridge_4d">Cambridge 4D (Content, Communicative Achievement, Organisation, Language)</option>
              <option value="enem">ENEM (5 Competências Oficiais)</option>
              <option value="bncc">BNCC (Eixos de Leitura, Escrita e Conhecimentos Linguísticos)</option>
              <option value="general">Rubrica Geral (Gramática, Vocabulário, Coesão)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Rigor da Correção Automática (1 a 5)
            </label>
            <select
              value={calibrations.grading.gradingRigor}
              onChange={e => handleSave({ grading: { ...calibrations.grading, gradingRigor: Number(e.target.value) as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value={1}>1 — Altamente Tolerante (Iniciantes / Foco em Fluência)</option>
              <option value={2}>2 — Tolerante com Erros Leves</option>
              <option value={3}>3 — Equilibrado (Padrão Escolar)</option>
              <option value={4}>4 — Rigoroso (Preparatório Exames)</option>
              <option value={5}>5 — Estritamente Preciso (Cambridge / TOEFL C2)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c1a0e', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={calibrations.grading.autoGenerateStudentFeedback}
                onChange={e => handleSave({ grading: { ...calibrations.grading, autoGenerateStudentFeedback: e.target.checked } })}
                style={{ width: 18, height: 18 }}
              />
              Gerar feedback textual individual para o aluno em cada correção
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c1a0e', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={calibrations.grading.autoSaveToMemory}
                onChange={e => handleSave({ grading: { ...calibrations.grading, autoSaveToMemory: e.target.checked } })}
                style={{ width: 18, height: 18 }}
              />
              Salvar notas e observações automaticamente na Memória Viva do Aluno
            </label>
          </div>
        </div>
      )}

      {/* 3. Caderneta de Notas */}
      {activeSubTab === 'gradebook' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Nota de Corte para Aprovação
            </label>
            <input
              type="number"
              step="0.5"
              value={calibrations.gradebook.passingScore}
              onChange={e => handleSave({ gradebook: { ...calibrations.gradebook, passingScore: Number(e.target.value) } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Método de Cálculo da Média
            </label>
            <select
              value={calibrations.gradebook.calculationMethod}
              onChange={e => handleSave({ gradebook: { ...calibrations.gradebook, calculationMethod: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="arithmetic">Média Aritmética Simples</option>
              <option value="weighted">Média Ponderada por Pesos</option>
              <option value="points">Soma Cumulativa de Pontos</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Portal Escolar Padrão para Sincronização
            </label>
            <select
              value={calibrations.gradebook.defaultPortalSync}
              onChange={e => handleSave({ gradebook: { ...calibrations.gradebook, defaultPortalSync: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="machado">Portal Machado Sobrinho</option>
              <option value="plural">Plurall (SOMOS Educação)</option>
              <option value="santacatarina">Rede Santa Catarina</option>
              <option value="google_classroom">Google Classroom</option>
            </select>
          </div>
        </div>
      )}

      {/* 4. Frequência & Chamada */}
      {activeSubTab === 'attendance' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Horário de Aula Padrão
            </label>
            <input
              type="text"
              value={calibrations.attendance.defaultTimeSlot}
              onChange={e => handleSave({ attendance: { ...calibrations.attendance, defaultTimeSlot: e.target.value } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Alerta de Faltas Consecutivas (Gatilho)
            </label>
            <input
              type="number"
              value={calibrations.attendance.consecutiveAbsenceAlertThreshold}
              onChange={e => handleSave({ attendance: { ...calibrations.attendance, consecutiveAbsenceAlertThreshold: Number(e.target.value) } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            />
            <span style={{ fontSize: 11, color: '#786555' }}>Gera aviso automático na memória se o aluno faltar N aulas seguidas.</span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Portal Padrão para Espelhar Chamada
            </label>
            <select
              value={calibrations.attendance.defaultPortalMirror}
              onChange={e => handleSave({ attendance: { ...calibrations.attendance, defaultPortalMirror: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="machado">Portal Machado Sobrinho</option>
              <option value="plural">Plurall (SOMOS Educação)</option>
              <option value="santacatarina">Rede Santa Catarina</option>
            </select>
          </div>
        </div>
      )}

      {/* 5. Planejador de Aulas */}
      {activeSubTab === 'planner' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Metodologia Ativa Favorita
            </label>
            <select
              value={calibrations.planner.defaultMethodology}
              onChange={e => handleSave({ planner: { ...calibrations.planner, defaultMethodology: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="TBL">TBL / TBLT (Task-Based Language Teaching)</option>
              <option value="Flipped Classroom">Sala de Aula Invertida (Flipped Classroom)</option>
              <option value="CLIL">CLIL (Content and Language Integrated Learning)</option>
              <option value="PBL">PBL (Aprendizagem Baseada em Projetos)</option>
              <option value="Gamificação">Gamificação Educacional</option>
              <option value="Tradicional">Apresentação + Prática + Produção (PPP)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Duração Padrão da Aula (Minutos)
            </label>
            <input
              type="number"
              value={calibrations.planner.defaultDurationMinutes}
              onChange={e => handleSave({ planner: { ...calibrations.planner, defaultDurationMinutes: Number(e.target.value) } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c1a0e', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={calibrations.planner.autoIncludeBncc}
                onChange={e => handleSave({ planner: { ...calibrations.planner, autoIncludeBncc: e.target.checked } })}
                style={{ width: 18, height: 18 }}
              />
              Vincular códigos de habilidades da BNCC automaticamente aos planos de aula
            </label>
          </div>
        </div>
      )}

      {/* 6. Comunicados aos Pais */}
      {activeSubTab === 'communication' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Canal de Envio Preferido
            </label>
            <select
              value={calibrations.communication.preferredChannel}
              onChange={e => handleSave({ communication: { ...calibrations.communication, preferredChannel: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="whatsapp">WhatsApp (Mensagens diretas e grupos)</option>
              <option value="email">E-mail Formal</option>
              <option value="portal">Mural do Portal Escolar</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Assinatura Padrão do Professor
            </label>
            <input
              type="text"
              value={calibrations.communication.teacherSignature}
              onChange={e => handleSave({ communication: { ...calibrations.communication, teacherSignature: e.target.value } })}
              placeholder="Ex: Prof. Rafael — Língua Inglesa"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            />
          </div>
        </div>
      )}

      {/* 7. Assistente Rafinha */}
      {activeSubTab === 'agent' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Provedor de IA Padrão (BYOK)
            </label>
            <select
              value={calibrations.agent.preferredProvider}
              onChange={e => handleSave({ agent: { ...calibrations.agent, preferredProvider: e.target.value as any } })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#faf6f0', fontSize: 13 }}
            >
              <option value="auto">Seleção Automática Inteligente (Groq / DeepSeek / Gemini)</option>
              <option value="groq">Groq (Ultra-rápido Llama 3.3)</option>
              <option value="gemini">Google Gemini 2.0 Flash</option>
              <option value="deepseek">DeepSeek V3 / R1</option>
              <option value="openai">OpenAI GPT-4o</option>
              <option value="anthropic">Anthropic Claude 3.5 Sonnet</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5c4838', marginBottom: 6 }}>
              Velocidade de Fala da Rafinha (TTS): {calibrations.agent.voiceSpeed}x
            </label>
            <input
              type="range"
              min="0.8"
              max="1.3"
              step="0.05"
              value={calibrations.agent.voiceSpeed}
              onChange={e => handleSave({ agent: { ...calibrations.agent, voiceSpeed: Number(e.target.value) } })}
              style={{ width: '100%', marginTop: 8 }}
            />
          </div>
        </div>
      )}

      {savedToast && (
        <div style={{
          marginTop: 16,
          padding: '10px 16px',
          background: '#dcfce7',
          color: '#166534',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <i className="ti ti-check" />
          Calibrações salvas com sucesso! Todos os módulos do Teacher AI já estão sincronizados com seus padrões.
        </div>
      )}
    </div>
  )
}
