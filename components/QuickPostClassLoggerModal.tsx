'use client'

import React, { useState, useMemo, useRef } from 'react'
import {
  parseQuickPostClassNote,
  dispatchQuickPostClassLog,
  getSavedQuickPostClassLogs,
  type QuickPostClassLogSavedRecord
} from '@/lib/quickPostClassLog'
import { getAllPdiRecords } from '@/lib/pdiManagement'
import { toast } from '@/components/Toast'
import { RADIUS, SHADOW } from '@/styles/tokens'

interface QuickPostClassLoggerModalProps {
  isOpen: boolean
  onClose: () => void
  defaultClassLabel?: string
  onDispatched?: (record: QuickPostClassLogSavedRecord) => void
}

export default function QuickPostClassLoggerModal({
  isOpen,
  onClose,
  defaultClassLabel = '6º Ano',
  onDispatched
}: QuickPostClassLoggerModalProps) {
  const [noteText, setNoteText] = useState<string>('')
  const [selectedClass, setSelectedClass] = useState<string>(defaultClassLabel)
  const [explicitPdiStudentId, setExplicitPdiStudentId] = useState<string>('')
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [recentLogs, setRecentLogs] = useState<QuickPostClassLogSavedRecord[]>(() =>
    getSavedQuickPostClassLogs()
  )
  const recognitionRef = useRef<any>(null)

  const pdiStudents = useMemo(() => Object.values(getAllPdiRecords()), [isOpen])

  const livePreview = useMemo(() => {
    return parseQuickPostClassNote(noteText, selectedClass)
  }, [noteText, selectedClass])

  if (!isOpen) return null

  const toggleVoiceDictation = () => {
    if (isRecording) {
      try {
        recognitionRef.current?.stop()
      } catch {}
      setIsRecording(false)
      return
    }

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null

    if (!SpeechRecognitionCtor) {
      toast.info('Seu navegador não suporta ditado nativo Web Speech. Digite ou cole o relato abaixo.')
      return
    }

    try {
      const recognition = new SpeechRecognitionCtor()
      recognition.lang = 'pt-BR'
      recognition.continuous = true
      recognition.interimResults = false

      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript + ' '
          }
        }
        if (transcript.trim()) {
          setNoteText(prev => (prev ? `${prev.trim()} ${transcript.trim()}` : transcript.trim()))
        }
      }

      recognition.onerror = () => {
        setIsRecording(false)
      }
      recognition.onend = () => {
        setIsRecording(false)
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsRecording(true)
      toast.info('🎙️ Ouvindo relato pós-aula... Fale normalmente!')
    } catch {
      setIsRecording(false)
    }
  }

  const handleDispatch = () => {
    if (!noteText.trim()) {
      toast.error('Digite ou dite um breve relato da aula antes de registrar.')
      return
    }
    const saved = dispatchQuickPostClassLog(
      noteText,
      selectedClass,
      explicitPdiStudentId || undefined
    )
    setRecentLogs(getSavedQuickPostClassLogs())
    setNoteText('')
    toast.success(
      `Diário Pós-Aula distribuído! Lembrete salvo${
        saved.updatedPdiIds.length > 0
          ? ` + PDI atualizado (${saved.matchedPdiStudents.map(s => s.studentName).join(', ')})`
          : ''
      } + Sincronizado com o Supabase.`
    )
    onDispatched?.(saved)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        backgroundColor: 'rgba(44, 26, 14, 0.58)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 820,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#fdf8f2',
          border: '1.5px solid #8b5e3c',
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.lg,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: '#2c1a0e'
        }}
      >
        {/* Cabeçalho Editorial */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.7 }}>
              AUTOMAÇÃO DE FIM DE AULA &bull; 100% LOCAL (TRILHO 1 LGPD — ZERO EGRESS DE PII)
            </div>
            <h2
              style={{
                margin: '4px 0 0 0',
                fontSize: 21,
                fontWeight: 800,
                fontFamily: 'Fraunces, Georgia, serif',
                color: '#2c1a0e'
              }}
            >
              🎙️ Diário de Bordo de 30 Segundos Pós-Aula
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#5c3a21' }}>
              Dite ou escreva uma única nota rápida. O Teacher AI distribui automaticamente para a{' '}
              <strong>Sequência Didática</strong>, para a <strong>Seção 5 do PDI/PEI</strong> de alunos citados e cria o{' '}
              <strong>Lembrete da Próxima Aula</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: RADIUS.sm,
              border: '1px solid #d5c8bb',
              background: '#ffffff',
              color: '#2c1a0e',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✕ Fechar
          </button>
        </div>

        {/* Barra de Configuração Rápida */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 800, color: '#2c1a0e' }}>Turma Padrão:</label>
            <input
              type="text"
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: RADIUS.sm,
                border: '1px solid #dcd7cb',
                background: '#ffffff',
                color: '#2c1a0e',
                fontSize: 12.5,
                fontWeight: 700,
                width: 120
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 800, color: '#2c1a0e' }}>Vincular PDI (opcional):</label>
            <select
              value={explicitPdiStudentId}
              onChange={e => setExplicitPdiStudentId(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: RADIUS.sm,
                border: '1px solid #dcd7cb',
                background: '#ffffff',
                color: '#2c1a0e',
                fontSize: 12,
                fontWeight: 700
              }}
            >
              <option value="">Detecção Automática pelo Nome na Nota</option>
              {pdiStudents.map(st => (
                <option key={st.studentId} value={st.studentId}>
                  {st.studentName} ({st.identification?.gradeCycle || st.studentInfo?.gradeCycle || '6º ano'})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() =>
              setNoteText(
                '6º ano parou na página 34 da Unit 2, faltam os exercícios 4 e 5 para a próxima aula; a Carina participou muito bem do jogo de vocabulário em dupla com apoio visual.'
              )
            }
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              borderRadius: RADIUS.sm,
              border: '1px dashed #8b5e3c',
              background: '#fffcf8',
              color: '#8b5e3c',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✨ Preencher Exemplo Real (Carina + Pág. 34)
          </button>
        </div>

        {/* Área de Texto + Botão de Ditado por Voz */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={4}
            placeholder="Ex.: 6º A parou na página 34 da Unit 2, faltam os exercícios 4 e 5 para a próxima aula; a Carina participou bem da atividade oral em dupla..."
            style={{
              width: '100%',
              padding: 14,
              borderRadius: RADIUS.md,
              border: '1.5px solid #8b5e3c',
              background: '#ffffff',
              color: '#2c1a0e',
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={toggleVoiceDictation}
              style={{
                padding: '9px 16px',
                borderRadius: RADIUS.md,
                border: isRecording ? '1.5px solid #991b1b' : '1.5px solid #8b5e3c',
                background: isRecording ? '#fef2f2' : '#ffffff',
                color: isRecording ? '#991b1b' : '#2c1a0e',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {isRecording ? '⏹️ Parar Gravação de Voz' : '🎙️ Ditar por Voz (Web Speech)'}
            </button>

            <button
              type="button"
              onClick={handleDispatch}
              style={{
                padding: '10px 20px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: '#2c1a0e',
                color: '#fdf8f2',
                fontSize: 13.5,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(44,26,14,0.2)'
              }}
            >
              ⚡ Distribuir para Sequência + PDI + Lembrete (Salvar)
            </button>
          </div>
        </div>

        {/* Preview em Tempo Real da Tripla Distribuição */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #dcd7cb',
            borderRadius: RADIUS.md,
            padding: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12
          }}
        >
          <div style={{ background: '#fdf8f2', padding: 10, borderRadius: 8, border: '1px solid #ede8dc' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              1. Sequência Didática
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2c1a0e', marginTop: 4 }}>
              Turma: {livePreview.detectedClassLabel}
            </div>
            <div style={{ fontSize: 12, color: '#5c3a21', marginTop: 2 }}>
              Parada: {livePreview.detectedPageOrStopPoint || 'Registro geral da aula'}
              {livePreview.detectedUnitReference ? ` (${livePreview.detectedUnitReference})` : ''}
            </div>
          </div>

          <div style={{ background: '#fdf8f2', padding: 10, borderRadius: 8, border: '1px solid #ede8dc' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              2. PDI / PEI (Seção 5 — Evolução)
            </div>
            {livePreview.matchedPdiStudents.length > 0 ? (
              livePreview.matchedPdiStudents.map(st => (
                <div key={st.studentId} style={{ fontSize: 12, color: '#2c1a0e', marginTop: 4 }}>
                  <strong>✅ {st.studentName}:</strong> &ldquo;{st.observationSnippet}&rdquo;
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: '#7a5c42', marginTop: 4 }}>
                Cite o nome de um aluno com PDI (ex.: &ldquo;Carina&rdquo;) para gravar automaticamente na Seção 5 do PDI.
              </div>
            )}
          </div>

          <div style={{ background: '#fdf8f2', padding: 10, borderRadius: 8, border: '1px solid #ede8dc' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
              3. Lembrete da Próxima Aula
            </div>
            <div style={{ fontSize: 12, color: '#2c1a0e', marginTop: 4 }}>
              {livePreview.nextClassReminderText || 'Aguardando digitação...'}
            </div>
          </div>
        </div>

        {/* Histórico Recente de Diários Pós-Aula */}
        {recentLogs.length > 0 && (
          <div style={{ borderTop: '1px solid #dcd7cb', paddingTop: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 8 }}>
              Últimos Registros Pós-Aula ({recentLogs.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
              {recentLogs.slice(0, 5).map(log => (
                <div
                  key={log.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #ede8dc',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10
                  }}
                >
                  <div>
                    <strong>[{log.dateFormatted} &bull; {log.detectedClassLabel}]</strong> {log.rawNote}
                  </div>
                  {log.matchedPdiStudents.length > 0 && (
                    <span
                      style={{
                        background: '#f5efe6',
                        color: '#8b5e3c',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontWeight: 700,
                        fontSize: 11,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      PDI: {log.matchedPdiStudents.map(s => s.studentName.split(' ')[0]).join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
