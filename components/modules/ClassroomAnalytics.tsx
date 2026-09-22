'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'
import {
  ClassroomSegment,
  HeuristicHighlight,
  ClassroomObjectiveMetrics,
  computeClassroomTalkMetrics,
  detectTemporalOverlapsAndBursts,
  detectWaitTimeAnomalies
} from '@/lib/classroomHeuristics'
import {
  bridgeClassroomHighlightToMemory,
  ClassroomHighlightMemoryCandidate
} from '@/lib/classroomMemoryBridge'
import {
  validateConsentBeforeRecord,
  initClassroomSession,
  uploadSessionChunk
} from '@/lib/classroomAudioClient'
import { LongSessionAudioRecorder, AudioChunkPayload } from '@/lib/audioRecorder'

export default function ClassroomAnalytics() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'record' | 'consents'>('analytics')
  const [selectedSchool, setSelectedSchool] = useState('Machado Sobrinho')
  const [selectedClass, setSelectedClass] = useState('9º Ano B')
  
  // Estados de Gravação Ativa
  const [isRecording, setIsRecording] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recorderInstance, setRecorderInstance] = useState<LongSessionAudioRecorder | null>(null)
  const [uploadedChunksCount, setUploadedChunksCount] = useState(0)

  // Estado dos Dados de Análise da Sessão Selecionada
  const [segments, setSegments] = useState<ClassroomSegment[]>([
    { id: '1', speaker: 'professor', startMs: 0, endMs: 25000, durationMs: 25000, text: 'Bom dia turma! Hoje vamos explorar a diferença entre since e for.' },
    { id: '2', speaker: 'professor', startMs: 26000, endMs: 31000, durationMs: 5000, text: 'Quem pode me dar um exemplo usando since para falar de algo do passado?' },
    { id: '3', speaker: 'aluno_1', startMs: 36000, endMs: 40000, durationMs: 4000, text: 'I have studied English since 2022.' },
    { id: '4', speaker: 'aluno_2', startMs: 41000, endMs: 44000, durationMs: 3000, text: 'And for three years!' },
    { id: '5', speaker: 'aluno_3', startMs: 44500, endMs: 47000, durationMs: 2500, text: 'Eu viajei for yesterday?' },
    { id: '6', speaker: 'aluno_4', startMs: 47500, endMs: 50000, durationMs: 2500, text: 'Não, yesterday é ponto fixo, usa since!' },
    { id: '7', speaker: 'aluno_1', startMs: 50500, endMs: 53000, durationMs: 2500, text: 'Isso aí, since yesterday!' },
    { id: '8', speaker: 'aluno_2', startMs: 53500, endMs: 56000, durationMs: 2500, text: 'Muito bem lembrado.' },
    { id: '9', speaker: 'professor', startMs: 57000, endMs: 80000, durationMs: 23000, text: 'Excelente debate! Observem que since marca o ponto de partida e for a duração total.' },
  ])

  // Highlights e Métricas calculados em tempo real
  const highlights = useMemo(() => {
    const bursts = detectTemporalOverlapsAndBursts(segments)
    const waitTimes = detectWaitTimeAnomalies(segments)
    return [...bursts, ...waitTimes]
  }, [segments])

  const metrics: ClassroomObjectiveMetrics = useMemo(() => {
    return computeClassroomTalkMetrics(segments)
  }, [segments])

  // Modal Human-in-the-Loop para envio ao Memory Engine
  const [modalCandidate, setModalCandidate] = useState<ClassroomHighlightMemoryCandidate | null>(null)
  const [modalStudentName, setModalStudentName] = useState('')
  const [modalContext, setModalContext] = useState<'planning' | 'assessment' | 'general'>('planning')

  // Timer de gravação
  useEffect(() => {
    let timer: any = null
    if (isRecording) {
      timer = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    }
    return () => clearInterval(timer)
  }, [isRecording])

  // Iniciar Gravação com Guarda de Consentimento
  const handleStartRecording = async () => {
    // 1. Guard de Consentimento
    const consent = await validateConsentBeforeRecord(selectedSchool, selectedClass)
    if (!consent.hasConsent) {
      toast.error(consent.reason || 'Gravação bloqueada: Consentimento ausente.')
      return
    }

    try {
      // 2. Inicializar Sessão no Servidor
      const sessionRes = await initClassroomSession({
        schoolId: selectedSchool,
        classId: selectedClass,
        subject: 'Língua Inglesa',
        topic: 'Aula Regular Gravada',
        consentId: consent.consentId!
      })

      if (!sessionRes.ok || !sessionRes.sessionId) {
        toast.error('Erro ao abrir sessão de gravação no servidor.')
        return
      }

      const sessionId = sessionRes.sessionId
      setActiveSessionId(sessionId)
      setRecordingSeconds(0)
      setUploadedChunksCount(0)

      // 3. Iniciar Gravador Contínuo com Chunks de 3 minutos
      const recorder = new LongSessionAudioRecorder({
        chunkDurationMs: 180000, // 3 min
        onChunkReady: async (chunk: AudioChunkPayload) => {
          const upRes = await uploadSessionChunk(sessionId, chunk)
          if (upRes.ok) {
            setUploadedChunksCount(prev => prev + 1)
          }
        },
        onStatusChange: (status) => {
          if (status === 'stopped') setIsRecording(false)
        }
      })

      await recorder.startSession()
      setRecorderInstance(recorder)
      setIsRecording(true)
      toast.success('🎙️ Gravação de aula iniciada! Chunks de áudio protegidos localmente.')
    } catch (err) {
      toast.error('Não foi possível acessar o microfone para gravação da aula.')
    }
  }

  // Parar Gravação
  const handleStopRecording = async () => {
    if (!recorderInstance) return
    const finalChunk = await recorderInstance.stopSession()
    if (activeSessionId && finalChunk) {
      await uploadSessionChunk(activeSessionId, finalChunk)
    }
    setIsRecording(false)
    toast.success('✅ Aula finalizada! Fila assíncrona de transcrição e analytics acionada.')
    setActiveTab('analytics')
  }

  // Abertura do Modal Human-in-the-Loop
  const handleOpenMemoryModal = (h: HeuristicHighlight) => {
    setModalCandidate({
      sessionId: activeSessionId || 'sessao_demonstrativa',
      highlightId: `h_${h.startMs}_${h.endMs}`,
      pedagogicalInsight: h.pedagogicalInsight,
      title: h.title,
      schoolId: selectedSchool,
      confidence: h.heuristicScore,
      operationalContext: 'planning'
    })
    setModalStudentName('')
    setModalContext('planning')
  }

  // Confirmação Human-in-the-Loop e Envio ao Memory Engine
  const handleConfirmMemoryBridge = async () => {
    if (!modalCandidate) return

    const candidateWithMeta: ClassroomHighlightMemoryCandidate = {
      ...modalCandidate,
      targetStudentName: modalStudentName.trim() || undefined,
      targetStudentId: modalStudentName.trim() ? `st_${modalStudentName.toLowerCase().replace(/\s+/g, '_')}` : undefined,
      operationalContext: modalContext
    }

    const res = await bridgeClassroomHighlightToMemory(
      candidateWithMeta,
      'default_teacher',
      true // Aprovação explícita da professora
    )

    if (res.ok) {
      toast.success(`🧠 ${res.message}`)
      setModalCandidate(null)
    } else {
      toast.error(res.message)
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const formatMs = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000)
    return formatTime(totalSecs)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      padding: '24px 32px',
      background: '#fdf8f2',
      color: '#2c1a0e',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      minHeight: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fffcf8',
        padding: '18px 24px',
        borderRadius: RADIUS.lg,
        border: '1px solid rgba(139,115,85,0.12)',
        boxShadow: SHADOW.sm
      }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.6rem', color: '#3d2314' }}>
            📊 Classroom Analytics Engine
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#7a604d' }}>
            Métricas acústicas em tempo real, detecção heurística de momentos de aula e ponte com o Memory Engine.
          </p>
        </div>

        {/* Seletores & Abas */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select 
            value={selectedClass} 
            onChange={e => setSelectedClass(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d4c5b9', background: '#fff' }}
          >
            <option value="9º Ano B">9º Ano B (Inglês)</option>
            <option value="8º Ano A">8º Ano A (Inglês)</option>
            <option value="1º Médio">1º Médio (Redação)</option>
          </select>

          <div style={{ display: 'flex', background: '#f0e6dc', borderRadius: RADIUS.md, padding: 3 }}>
            <button
              onClick={() => setActiveTab('analytics')}
              style={{
                padding: '6px 14px',
                borderRadius: RADIUS.sm,
                border: 'none',
                background: activeTab === 'analytics' ? '#fff' : 'transparent',
                fontWeight: activeTab === 'analytics' ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('record')}
              style={{
                padding: '6px 14px',
                borderRadius: RADIUS.sm,
                border: 'none',
                background: activeTab === 'record' ? '#fff' : 'transparent',
                fontWeight: activeTab === 'record' ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              🎙️ Gravador
            </button>
            <button
              onClick={() => setActiveTab('consents')}
              style={{
                padding: '6px 14px',
                borderRadius: RADIUS.sm,
                border: 'none',
                background: activeTab === 'consents' ? '#fff' : 'transparent',
                fontWeight: activeTab === 'consents' ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              🛡️ Consentimentos
            </button>
          </div>
        </div>
      </div>

      {/* ABA: DASHBOARD */}
      {activeTab === 'analytics' && (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {/* Card TTT vs STT */}
            <div style={{
              background: '#fffcf8',
              padding: '16px 20px',
              borderRadius: RADIUS.md,
              border: '1px solid rgba(139,115,85,0.12)',
              boxShadow: SHADOW.sm
            }}>
              <span style={{ fontSize: '0.8rem', color: '#7a604d', textTransform: 'uppercase', fontWeight: 600 }}>
                Tempo de Fala (TTT vs STT)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3d2314' }}>
                  {metrics.teacherTalkRatio}%
                </span>
                <span style={{ fontSize: '0.85rem', color: '#8c6d58' }}>Prof / {metrics.studentTalkRatio}% Alunos</span>
              </div>
              <div style={{ marginTop: 10, height: 8, background: '#e2d5c8', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${metrics.teacherTalkRatio}%`, background: '#8b5e3c' }} />
                <div style={{ width: `${metrics.studentTalkRatio}%`, background: '#48a970' }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: '#a08573', display: 'block', marginTop: 6 }}>
                Meta Scrivener: Prof &le; 50% em aulas interativas.
              </span>
            </div>

            {/* Card Wait-Time */}
            <div style={{
              background: '#fffcf8',
              padding: '16px 20px',
              borderRadius: RADIUS.md,
              border: '1px solid rgba(139,115,85,0.12)',
              boxShadow: SHADOW.sm
            }}>
              <span style={{ fontSize: '0.8rem', color: '#7a604d', textTransform: 'uppercase', fontWeight: 600 }}>
                Wait Time Médio (Pausa Reflexiva)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#2c6b4f' }}>
                  {(metrics.avgWaitTimeMs / 1000).toFixed(1)}s
                </span>
                <span style={{ fontSize: '0.85rem', color: '#2c6b4f' }}>Zona Ideal (3-5s)</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#7a604d', display: 'block', marginTop: 12 }}>
                Mary Budd Rowe: Pausas acima de 3s aumentam respostas cognitivas profundas.
              </span>
            </div>

            {/* Card Vozes & Gini */}
            <div style={{
              background: '#fffcf8',
              padding: '16px 20px',
              borderRadius: RADIUS.md,
              border: '1px solid rgba(139,115,85,0.12)',
              boxShadow: SHADOW.sm
            }}>
              <span style={{ fontSize: '0.8rem', color: '#7a604d', textTransform: 'uppercase', fontWeight: 600 }}>
                Dispersão de Turnos (Gini)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3d2314' }}>
                  {metrics.giniIndex.toFixed(2)}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#7a604d' }}>{metrics.uniqueStudentVoicesCount} vozes ativas</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: metrics.giniIndex < 0.4 ? '#2c6b4f' : '#b25e29', display: 'block', marginTop: 12 }}>
                {metrics.giniIndex < 0.4 ? '✨ Participação bem distribuída na turma.' : '⚠️ Falas concentradas em poucos alunos.'}
              </span>
            </div>
          </div>

          {/* Highlights & Linha do Tempo */}
          <div style={{
            background: '#fffcf8',
            padding: 24,
            borderRadius: RADIUS.lg,
            border: '1px solid rgba(139,115,85,0.12)',
            boxShadow: SHADOW.sm
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontFamily: "'Fraunces', Georgia, serif", color: '#3d2314' }}>
                  🎯 Highlights Pedagógicos Detectados (Filtro Heurístico Two-Pointer O(N))
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#7a604d' }}>
                  Momentos de hesitação, pico de debate coletivo e sobreposição acústica.
                </p>
              </div>
              <span style={{ padding: '4px 10px', background: '#f0e6dc', borderRadius: RADIUS.sm, fontSize: '0.8rem', fontWeight: 600 }}>
                {highlights.length} momentos identificados
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {highlights.map((h, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 18px',
                    borderRadius: RADIUS.md,
                    background: '#fff',
                    border: '1px solid #ebdcd0'
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      background: '#3d2314',
                      color: '#fff',
                      borderRadius: RADIUS.sm,
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      fontWeight: 600
                    }}>
                      {formatMs(h.startMs)}
                    </span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#3d2314' }}>{h.title}</h4>
                      <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#68503e' }}>{h.summary}</p>
                      <span style={{ fontSize: '0.75rem', color: '#91725d', fontStyle: 'italic' }}>
                        💡 Insight: {h.pedagogicalInsight}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenMemoryModal(h)}
                    style={{
                      padding: '8px 14px',
                      background: '#fdf5eb',
                      border: '1px solid #c9a584',
                      color: '#70421e',
                      borderRadius: RADIUS.md,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    🧠 Consolidar na Memória
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ABA: GRAVADOR */}
      {activeTab === 'record' && (
        <div style={{
          background: '#fffcf8',
          padding: 36,
          borderRadius: RADIUS.lg,
          border: '1px solid rgba(139,115,85,0.12)',
          boxShadow: SHADOW.sm,
          textAlign: 'center',
          maxWidth: 600,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#3d2314', margin: '0 0 8px 0' }}>
            🎙️ Gravação Contínua de Aula (Chunking 3 min)
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#7a604d', marginBottom: 28 }}>
            Gera blocos Opus/WebM a cada 3 minutos, com tolerância total a instabilidade de rede e backup local no dispositivo.
          </p>

          <div style={{
            fontFamily: 'monospace',
            fontSize: '3rem',
            fontWeight: 700,
            color: isRecording ? '#b53b26' : '#6b4d38',
            marginBottom: 20
          }}>
            {formatTime(recordingSeconds)}
          </div>

          {isRecording && (
            <div style={{ marginBottom: 20, fontSize: '0.85rem', color: '#2c6b4f' }}>
              ● Gravando aula ao vivo... ({uploadedChunksCount} blocos de áudio enviados)
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            {!isRecording ? (
              <button
                onClick={handleStartRecording}
                style={{
                  padding: '12px 28px',
                  background: '#8b5e3c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: RADIUS.md,
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: SHADOW.md
                }}
              >
                ▶️ Iniciar Gravação da Aula
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                style={{
                  padding: '12px 28px',
                  background: '#a83232',
                  color: '#fff',
                  border: 'none',
                  borderRadius: RADIUS.md,
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: SHADOW.md
                }}
              >
                ⏹️ Finalizar e Processar Aula
              </button>
            )}
          </div>
        </div>
      )}

      {/* ABA: CONSENTIMENTOS */}
      {activeTab === 'consents' && (
        <div style={{
          background: '#fffcf8',
          padding: 24,
          borderRadius: RADIUS.lg,
          border: '1px solid rgba(139,115,85,0.12)',
          boxShadow: SHADOW.sm
        }}>
          <h2 style={{ margin: 0, fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.2rem', color: '#3d2314' }}>
            🛡️ Gestão de Consentimento Escolar de Voz (LGPD Menores)
          </h2>
          <p style={{ margin: '4px 0 16px 0', fontSize: '0.85rem', color: '#7a604d' }}>
            O app bloqueia deterministicamente qualquer gravação sem termo de consentimento pedagógico ativo.
          </p>

          <div style={{
            padding: 16,
            background: '#f4ede6',
            borderRadius: RADIUS.md,
            border: '1px solid #d8c7ba'
          }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#3d2314' }}>Termo Institucional: Machado Sobrinho (9º Ano B)</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#594030' }}>
              ● <strong>Status:</strong> Ativo até 31/12/2026<br />
              ● <strong>Autorizado por:</strong> Coordenação Pedagógica (Mariana Duarte)<br />
              ● <strong>Alunos Opt-outs (Excluídos):</strong> Nenhum aluno com recusa de imagem/voz cadastrada.
            </p>
          </div>
        </div>
      )}

      {/* MODAL HUMAN-IN-THE-LOOP (Aprovação de Memória) */}
      {modalCandidate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            borderRadius: RADIUS.lg,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            boxShadow: SHADOW.lg
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontFamily: "'Fraunces', Georgia, serif", color: '#3d2314' }}>
              🧠 Consolidar Insight no Memory Engine
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#7a604d', margin: '0 0 16px 0' }}>
              Inferências de sala de aula nunca alteram o histórico do aluno sem a sua aprovação explícita.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#3d2314', marginBottom: 4 }}>
                Texto do Fato / Insight:
              </label>
              <textarea
                value={modalCandidate.pedagogicalInsight}
                onChange={e => setModalCandidate({ ...modalCandidate, pedagogicalInsight: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: 8, borderRadius: RADIUS.md, border: '1px solid #d4c5b9', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#3d2314', marginBottom: 4 }}>
                Vincular a Aluno Específico (Opcional - deixe vazio para Turma):
              </label>
              <input
                type="text"
                placeholder="Ex: Pedro Henrique"
                value={modalStudentName}
                onChange={e => setModalStudentName(e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: RADIUS.md, border: '1px solid #d4c5b9', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#3d2314', marginBottom: 4 }}>
                Contexto Operacional (taskBinding):
              </label>
              <select
                value={modalContext}
                onChange={e => setModalContext(e.target.value as any)}
                style={{ width: '100%', padding: 8, borderRadius: RADIUS.md, border: '1px solid #d4c5b9' }}
              >
                <option value="planning">Planejamento de Aulas (lesson_planner)</option>
                <option value="assessment">Correção de Provas (omnigrader)</option>
                <option value="general">Geral / Multiuso (general)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setModalCandidate(null)}
                style={{ padding: '8px 16px', background: '#f0e6dc', border: 'none', borderRadius: RADIUS.md, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmMemoryBridge}
                style={{
                  padding: '8px 16px',
                  background: '#8b5e3c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: RADIUS.md,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Aprovar e Gravar na Memória
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
