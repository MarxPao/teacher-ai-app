'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import VoiceButton from '@/components/VoiceButton'
import { ApiConfig } from '@/components/modules/ApiManager'
import { runFactCheck, FactCheckResult } from '@/lib/factCheck'

export type CommunicationTab = 'parents' | 'official'

interface StudentItem {
  id: string
  name: string
  parentName: string
  parentPhone: string
  className: string
  performance: 'Excelente' | 'Bom' | 'Atenção Necessária'
  lastGrade: number
}

const SAMPLE_STUDENTS: StudentItem[] = [
  { id: '1', name: 'Ana Júlia Santos', parentName: 'Dra. Carla Santos', parentPhone: '31998877665', className: '9º Ano B', performance: 'Excelente', lastGrade: 9.5 },
  { id: '2', name: 'Pedro Henrique', parentName: 'Sr. Roberto Henrique', parentPhone: '31987654321', className: '9º Ano B', performance: 'Atenção Necessária', lastGrade: 6.0 },
  { id: '3', name: 'Lucas Oliveira', parentName: 'Sra. Márcia Oliveira', parentPhone: '31976543210', className: '9º Ano B', performance: 'Bom', lastGrade: 8.2 },
  { id: '4', name: 'Mariana Lima', parentName: 'Sr. Fernando Lima', parentPhone: '31965432109', className: '9º Ano B', performance: 'Excelente', lastGrade: 9.0 },
]

const TEMPLATES = [
  { label: 'Bilhete para Pais', icon: 'ti-mail', color: '#268bd2' },
  { label: 'Ata de Reunião', icon: 'ti-clipboard', color: '#2aa198' },
  { label: 'Comunicado de Evento', icon: 'ti-calendar-event', color: '#b58900' },
  { label: 'Boletim Narrativo', icon: 'ti-chart-bar', color: '#859900' },
  { label: 'Carta de Recomendação', icon: 'ti-award', color: '#6c71c4' },
  { label: 'Advertência / Ocorrência', icon: 'ti-alert-circle', color: '#cb4b16' },
  { label: 'Relatório de Progresso', icon: 'ti-user-check', color: '#2aa198' },
  { label: 'Comunicado Geral da Turma', icon: 'ti-speakerphone', color: '#7a5c42' },
]

const TONES = ['Acolhedor & Positivo', 'Formal & Institucional', 'Direto & Objetivo', 'Motivacional', 'Urgente']

const SL: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 6 }
const SI: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: RADIUS.md, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit' }
const CARD: React.CSSProperties = { background: '#fff', borderRadius: RADIUS.xl, padding: 18, boxShadow: '0 2px 12px rgba(44,26,14,0.05)', border: '1px solid #ede8dc' }

function loadApis(): ApiConfig[] {
  try {
    const { getAvailableApisForSelect } = require('@/lib/autoApiSelector')
    return getAvailableApisForSelect()
  } catch { return [] }
}

function loadConfig() {
  try { return JSON.parse(localStorage.getItem('teacher_cfg') || '{}') } catch { return {} }
}

async function callApi(api: ApiConfig, prompt: string): Promise<string> {
  const { executeUnifiedAiCall } = await import('@/lib/autoApiSelector')
  return executeUnifiedAiCall(api, prompt)
}

interface CommunicationsProps {
  initialTab?: CommunicationTab
}

export default function Communications({ initialTab = 'parents' }: CommunicationsProps) {
  const [activeTab, setActiveTab] = useState<CommunicationTab>(initialTab)

  // Mensagens aos Pais (WhatsApp/Email)
  const [students, setStudents] = useState<StudentItem[]>(SAMPLE_STUDENTS)
  const [selectedStudentId, setSelectedStudentId] = useState<string>('1')
  const [period, setPeriod] = useState('2º Trimestre 2026')
  const [parentTone, setParentTone] = useState('Acolhedor & Positivo')
  const [teacherNotes, setTeacherNotes] = useState('')
  const [parentMessage, setParentMessage] = useState('')
  const [generatingParent, setGeneratingParent] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Comunicados Oficiais
  const [template, setTemplate] = useState('Bilhete para Pais')
  const [officialTone, setOfficialTone] = useState('Formal & Institucional')
  const [studentName, setStudentName] = useState('')
  const [className, setClassName] = useState('')
  const [subject, setSubject] = useState('')
  const [context, setContext] = useState('')
  const [officialResult, setOfficialResult] = useState('')
  const [loadingOfficial, setLoadingOfficial] = useState(false)
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null)

  // APIs & Config
  const [apis, setApis] = useState<ApiConfig[]>([])
  const [selectedApiId, setSelectedApiId] = useState('')
  const [config, setConfig] = useState<{ school?: string; teacher?: string }>({})

  useEffect(() => {
    const a = loadApis()
    setApis(a)
    if (a.length > 0) setSelectedApiId(a[0].id)
    setConfig(loadConfig())

    // Carrega alunos cadastrados em teacher_students se houver
    try {
      const stored = localStorage.getItem('teacher_students')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mapped: StudentItem[] = parsed.map((s: any, idx: number) => ({
            id: s.id || String(idx + 1),
            name: s.name || `Aluno ${idx + 1}`,
            parentName: s.parentName || `Resp. de ${s.name || 'Aluno'}`,
            parentPhone: s.parentPhone || s.phone || '31999998888',
            className: s.className || s.classId || 'Turma A',
            performance: s.performance || (s.avgGrade >= 8 ? 'Excelente' : s.avgGrade >= 6 ? 'Bom' : 'Atenção Necessária'),
            lastGrade: s.avgGrade || s.lastGrade || 8.0
          }))
          setStudents(mapped)
          setSelectedStudentId(mapped[0].id)
        }
      }
    } catch {}
  }, [])

  const selectedApi = apis.find(a => a.id === selectedApiId) || apis[0] || { id: 'auto', name: '⚡ IA Automática', provider: 'auto', key: '', model: '', active: true }
  const selectedStudent = students.find(s => s.id === selectedStudentId) || students[0]

  // Geração de Mensagem aos Pais (WhatsApp/Email)
  const handleGenerateParentMessage = async () => {
    if (!selectedStudent) return
    setGeneratingParent(true)
    try {
      const prompt = `Você é a assistente pedagógica Rafinha IA.
Redija uma mensagem personalizada de acompanhamento pedagógico para os pais do(a) aluno(a) "${selectedStudent.name}".
Responsável: ${selectedStudent.parentName}
Turma: ${selectedStudent.className}
Período: ${period}
Desempenho Atual: ${selectedStudent.performance} (Nota/Média recente: ${selectedStudent.lastGrade}/10)
Tom de Voz: ${parentTone}
${teacherNotes ? `Observações Adicionais do Professor: "${teacherNotes}"` : ''}

Estrutura ideal para envio via WhatsApp:
1. Saudação cordial e afetuosa aos pais.
2. Destaques dos avanços e pontos fortes do aluno.
3. Orientações práticas e encorajadoras para apoio em casa.
4. Conclusão amigável reiterando a parceria família-escola.
Use formatação leve com emojis adequados e negritos para leitura dinâmica.`

      const text = await callApi(selectedApi, prompt)
      setParentMessage(text)
    } catch (e: any) {
      toast.success(`Erro ao gerar mensagem: ${e?.message || 'Falha na IA'}`)
    } finally {
      setGeneratingParent(false)
    }
  }

  // Geração de Comunicado Oficial (DocumentCanvas)
  const handleGenerateOfficialDocument = async () => {
    setLoadingOfficial(true); setOfficialResult(''); setFactCheck(null)
    const prompt = `Você é um secretário e gestor escolar experiente. Redija um documento oficial do tipo "${template}" com tom "${officialTone}".

DADOS DO DOCUMENTO:
- Escola: ${config.school || 'Nome da Escola'}
- Professor(a): ${config.teacher || 'Professor(a)'}
- Aluno(a): ${studentName || (selectedStudent ? selectedStudent.name : 'Não especificado')}
- Turma: ${className || (selectedStudent ? selectedStudent.className : 'Não especificada')}
- Disciplina: ${subject || 'Língua Inglesa'}
- Contexto / Pauta: ${context || 'Elabore conforme a finalidade do comunicado'}

INSTRUÇÕES:
- Use HTML semântico limpo (h2, p, strong, em, table)
- Inclua espaço para data, carimbo e assinatura formal
- Clareza, cortesia e respaldo pedagógico institucional

Gere o documento completo em HTML agora:`

    try {
      const text = await callApi(selectedApi, prompt)
      setOfficialResult(text)
      try {
        const fc = await runFactCheck(text, 'Comunicado escolar', template, selectedApi)
        setFactCheck(fc)
      } catch {}
    } catch (e: any) {
      toast.success(`Erro: ${e?.message || 'Falha na geração'}`)
    } finally {
      setLoadingOfficial(false)
    }
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleOpenWhatsApp = () => {
    if (!parentMessage || !selectedStudent) return
    const phone = selectedStudent.parentPhone.replace(/\D/g, '')
    const url = `https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(parentMessage)}`
    window.open(url, '_blank')
  }

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(parentMessage)
    showToast('Mensagem copiada para a área de transferência!')
  }

  return (
    <div style={{ padding: '24px 36px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>

      {/* HEADER & SELETOR DE ABAS */}
      <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <h1 style={{ textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
          Comunicação
        </h1>

        {/* Chave de Abas Amalgamadas */}
        <div style={{
          display: 'inline-flex',
          background: '#ede8dc',
          padding: '4px',
          borderRadius: RADIUS.lg,
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.06)',
          gap: 4
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('parents')}
            style={{
              padding: '8px 22px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: activeTab === 'parents' ? '#8b5e3c' : 'transparent',
              color: activeTab === 'parents' ? '#fff' : '#7a5c42',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            💬 Mensagens aos Pais (WhatsApp & Email)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('official')}
            style={{
              padding: '8px 22px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: activeTab === 'official' ? '#8b5e3c' : 'transparent',
              color: activeTab === 'official' ? '#fff' : '#7a5c42',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            📢 Comunicados Oficiais, Circulares & Atas
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#2aa198', color: '#fff', padding: '12px 20px', borderRadius: RADIUS.lg, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 9999 }}>
          ✓ {toastMessage}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          ABA 1: MENSAGENS AOS PAIS (WHATSAPP & EMAIL)
          ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'parents' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 28, flex: 1, minHeight: 0 }}>
          
          {/* Painel Esquerdo: Seleção do Aluno e Parâmetros */}
          <div style={{ overflowY: 'auto', paddingRight: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
            
            <div style={CARD}>
              <label style={SL}>👤 Selecione o Aluno(a):</label>
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                style={SI}
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} &bull; {s.className} ({s.performance})
                  </option>
                ))}
              </select>

              {selectedStudent && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#faf6f0', borderRadius: RADIUS.md, border: '1px solid #ede4d8', fontSize: TEXT.bodyCompact, color: '#7a5c42', lineHeight: 1.5 }}>
                  <div><strong>Responsável:</strong> {selectedStudent.parentName}</div>
                  <div><strong>WhatsApp:</strong> {selectedStudent.parentPhone}</div>
                  <div><strong>Desempenho:</strong> <span style={{ color: selectedStudent.performance === 'Excelente' ? '#2aa198' : selectedStudent.performance === 'Bom' ? '#268bd2' : '#cb4b16', fontWeight: 700 }}>{selectedStudent.performance} (Nota {selectedStudent.lastGrade}/10)</span></div>
                </div>
              )}
            </div>

            <div style={CARD}>
              <label style={SL}>📅 Período de Referência:</label>
              <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="Ex: 2º Trimestre 2026, Mês de Maio" style={{ ...SI, marginBottom: 10 }} />

              <label style={SL}>🎨 Tom da Mensagem:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {TONES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setParentTone(t)}
                    style={{
                      padding: '5px 12px', borderRadius: RADIUS.xl,
                      border: parentTone === t ? '1.5px solid #8b5e3c' : '1px solid #e8e0d0',
                      background: parentTone === t ? '#8b5e3c' : '#faf8f5',
                      color: parentTone === t ? '#fff' : '#7a5c42',
                      fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <label style={SL}>✍️ Observações do Professor (Opcional):</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <textarea
                  value={teacherNotes}
                  onChange={e => setTeacherNotes(e.target.value)}
                  placeholder="Ex: Teve ótimo destaque na apresentação oral, mas precisa revisar os verbos irregulares em casa..."
                  rows={3}
                  style={{ ...SI, resize: 'vertical' }}
                />
                <VoiceButton onResult={t => setTeacherNotes(p => p ? `${p} ${t}` : t)} />
              </div>
            </div>

            <button
              onClick={handleGenerateParentMessage}
              disabled={generatingParent}
              style={{
                padding: '14px',
                borderRadius: RADIUS.lg,
                border: 'none',
                background: generatingParent ? '#a08060' : 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
                color: '#fff',
                fontSize: TEXT.body,
                fontWeight: 800,
                cursor: generatingParent ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(139,94,60,0.3)'
              }}
            >
              {generatingParent ? '⚡ Elaborando Mensagem...' : '✨ Gerar Mensagem com IA'}
            </button>
          </div>

          {/* Painel Direito: Preview & Envio 1-Clique */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
            <div style={{ ...CARD, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ede8dc', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>💬</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e' }}>
                    Pré-visualização para WhatsApp & Email
                  </span>
                </div>
                {parentMessage && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleCopyMessage}
                      style={{ padding: '6px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12, fontWeight: 700, color: '#7a5c42', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      📋 Copiar
                    </button>
                    <button
                      onClick={handleOpenWhatsApp}
                      style={{ padding: '6px 14px', borderRadius: RADIUS.md, border: 'none', background: '#25D366', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(37,211,102,0.3)' }}
                    >
                      📲 Enviar WhatsApp Web
                    </button>
                  </div>
                )}
              </div>

              <textarea
                value={parentMessage}
                onChange={e => setParentMessage(e.target.value)}
                placeholder="Clique em 'Gerar Mensagem com IA' para criar uma comunicação acolhedora e personalizada para os pais..."
                style={{
                  flex: 1,
                  width: '100%',
                  padding: 16,
                  borderRadius: RADIUS.lg,
                  border: '1px solid #ede8dc',
                  background: '#faf8f5',
                  color: '#2c1a0e',
                  fontSize: 14,
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  resize: 'none',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────────────────────
           ABA 2: COMUNICADOS OFICIAIS, CIRCULARES & ATAS
           ───────────────────────────────────────────────────────────────────────────── */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 28, flex: 1, minHeight: 0 }}>
          
          {/* Painel Esquerdo: Parâmetros do Documento */}
          <div style={{ overflowY: 'auto', paddingRight: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
            
            <div style={CARD}>
              <label style={SL}>📑 Tipo de Comunicado:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {TEMPLATES.map(t => {
                  const sel = template === t.label
                  return (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setTemplate(t.label)}
                      style={{
                        padding: '8px 10px', borderRadius: RADIUS.md,
                        border: sel ? `1.5px solid ${t.color}` : '1px solid #e8e0d0',
                        background: sel ? t.color : '#faf8f5',
                        color: sel ? '#fff' : '#7a5c42',
                        cursor: 'pointer', fontSize: TEXT.caption, textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700
                      }}
                    >
                      <i className={`ti ${t.icon}`} /> {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={CARD}>
              <label style={SL}>🎨 Tom Institucional:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {TONES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOfficialTone(t)}
                    style={{
                      padding: '5px 12px', borderRadius: RADIUS.xl,
                      border: officialTone === t ? '1.5px solid #8b5e3c' : '1px solid #e8e0d0',
                      background: officialTone === t ? '#8b5e3c' : '#faf8f5',
                      color: officialTone === t ? '#fff' : '#7a5c42',
                      fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={SL}>Aluno(a):</label>
                  <input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Ex: João Silva" style={SI} />
                </div>
                <div>
                  <label style={SL}>Turma:</label>
                  <input value={className} onChange={e => setClassName(e.target.value)} placeholder="Ex: 9º Ano A" style={SI} />
                </div>
              </div>

              <label style={SL}>Contexto / Pauta:</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="Descreva detalhes, datas, convocações ou orientações..."
                  rows={3}
                  style={{ ...SI, resize: 'vertical' }}
                />
                <VoiceButton onResult={t => setContext(p => p ? `${p} ${t}` : t)} />
              </div>
            </div>

            <button
              onClick={handleGenerateOfficialDocument}
              disabled={loadingOfficial}
              style={{
                padding: '14px',
                borderRadius: RADIUS.lg,
                border: 'none',
                background: loadingOfficial ? '#a08060' : 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
                color: '#fff',
                fontSize: TEXT.body,
                fontWeight: 800,
                cursor: loadingOfficial ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(139,94,60,0.3)'
              }}
            >
              {loadingOfficial ? '⚡ Gerando Documento...' : '✨ Gerar Comunicado Oficial'}
            </button>
          </div>

          {/* Painel Direito: DocumentCanvas Oficial */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            {factCheck && (
              <div style={{ padding: '8px 14px', background: '#fdf8f2', borderRadius: RADIUS.md, border: '1px solid #ede8dc', fontSize: 12, color: '#7a5c42' }}>
                ✓ <strong>Qualidade:</strong> {factCheck.score}/100 &bull; {factCheck.level === 'ok' ? 'Texto claro e polido.' : factCheck.issues.join('; ')}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, borderRadius: RADIUS.xl, overflow: 'hidden', border: '1px solid #ede8dc', background: '#fff' }}>
              <DocumentCanvas
                content={officialResult}
                onContentChange={setOfficialResult}
                headerData={{ school: config.school || 'Nome da Escola', teacher: config.teacher || 'Professor(a)', title: template }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}