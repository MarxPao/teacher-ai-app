'use client'

import React, { useState, useMemo } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import EditableQuestionBoxes, { EditableQuestionItem, parseContentToQuestions } from '@/components/EditableQuestionBoxes'
import AudioPlayerCard from '@/components/AudioPlayerCard'
import { exportToPdf, exportToWord } from '@/lib/exportUtils'
import { DEFAULT_BNCC_SKILLS, PORTUGUESE_BNCC_SKILLS, BnccSkill } from '@/lib/bnccData'
import { SourceItem } from '@/components/SourceKnowledgeHub'
import { QuestionTypeCountMap, computeTotalQuestions } from '@/components/QuestionCountByTypeList'
import { FactCheckResult } from '@/lib/factCheck'
import { COLOR, RADIUS, TEXT, SHADOW } from '@/styles/tokens'

export type ResultTabKey = 'document' | 'topics' | 'rationale'

export interface ExamResultThreeTabsProps {
  result: string
  onContentChange: (newHtml: string) => void
  mode: 'exam' | 'worksheet'
  topic: string
  grade: string
  level: string
  subjectName?: string
  subjectId?: string
  sections?: string[]
  skill?: string
  sources?: SourceItem[]
  questionCounts?: QuestionTypeCountMap
  header: {
    school: string
    teacher: string
    classGroup: string
    title: string
  }
  onHeaderChange?: (patch: any) => void
  hideHeader?: boolean
  onToggleHeader?: () => void
  bloomDistribution?: {
    remember: number
    apply: number
    analyze: number
    evaluate: number
  }
  difficultyDistribution?: {
    easy: number
    medium: number
    hard: number
    challenge: number
  }
  approach?: string[]
  neeProfile?: string
  factCheck?: FactCheckResult | null
  onAskRafinhaForQuestion?: (idx: number, q: EditableQuestionItem, instruction: string) => Promise<string | void>
  audioUrl?: string | null
  audioLoading?: boolean
  accent?: 'US' | 'UK'
  onAccentChange?: (accent: 'US' | 'UK') => void
  onGenerateAudio?: () => void
  onDeleteAudio?: () => void
  onOpenOnlinePlayer?: () => void
  initialTab?: ResultTabKey
}

export default function ExamResultThreeTabs({
  result,
  onContentChange,
  mode,
  topic,
  grade,
  level,
  subjectName = 'Língua Inglesa',
  subjectId = 'english',
  sections = ['Grammar', 'Vocabulary', 'Reading Comprehension'],
  skill = 'Reading Comprehension',
  sources = [],
  questionCounts,
  header,
  onHeaderChange,
  hideHeader = false,
  onToggleHeader,
  bloomDistribution = { remember: 25, apply: 30, analyze: 25, evaluate: 20 },
  difficultyDistribution = { easy: 20, medium: 50, hard: 25, challenge: 5 },
  approach = ['Cambridge Assessment', 'Bloom'],
  neeProfile = '',
  factCheck,
  onAskRafinhaForQuestion,
  audioUrl,
  audioLoading = false,
  accent = 'US',
  onAccentChange,
  onGenerateAudio,
  onDeleteAudio,
  onOpenOnlinePlayer,
  initialTab = 'document',
}: ExamResultThreeTabsProps) {
  const [activeTab, setActiveTab] = useState<ResultTabKey>(initialTab)
  const [activeViewMode, setActiveViewMode] = useState<'boxes' | 'canvas'>('boxes')

  // Extrai total de questões parsed
  const parsedQuestions = useMemo(() => {
    if (!result) return []
    return parseContentToQuestions(result)
  }, [result])

  const totalQuestions = parsedQuestions.length || (questionCounts ? computeTotalQuestions(questionCounts) : 10)

  // Mapeia habilidades BNCC da matéria e série
  const matchingBnccSkills = useMemo<BnccSkill[]>(() => {
    const list = subjectId === 'portuguese' ? PORTUGUESE_BNCC_SKILLS : DEFAULT_BNCC_SKILLS
    const normGrade = grade.toLowerCase().replace(/º|\s+|fund\.|médio/g, '')
    return list.filter(sk => {
      const skGrade = sk.gradeYear.toLowerCase().replace(/º|\s+|fund\.|médio/g, '')
      return skGrade.includes(normGrade) || normGrade.includes(skGrade)
    }).slice(0, 6)
  }, [subjectId, grade])

  // Fontes ativas com páginas/trechos
  const activeSources = useMemo(() => {
    return sources.filter(s => s.active)
  }, [sources])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      {/* ─── BARRA SUPERIOR DE 3 ABAS PRINCIPAIS ─────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff',
          borderRadius: RADIUS.lg,
          padding: '6px 10px',
          border: '1.5px solid #ede8dc',
          boxShadow: SHADOW.sm,
          flexShrink: 0,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            {
              key: 'document',
              label: '📄 1. Documento Gerado',
              badge: parsedQuestions.length > 0 ? `${parsedQuestions.length} itens` : undefined,
              desc: 'Editor e Folha Oficial',
            },
            {
              key: 'topics',
              label: '📚 2. Tópicos & Fontes/Páginas',
              badge: activeSources.length > 0 ? `${activeSources.length} fontes` : 'BNCC',
              desc: 'Matriz e Materiais-Base',
            },
            {
              key: 'rationale',
              label: '🧠 3. Raciocínio Pedagógico da IA',
              badge: 'Bloom & TRI',
              desc: 'Psicometria e Distratores',
            },
          ].map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as ResultTabKey)}
                style={{
                  padding: '8px 14px',
                  borderRadius: RADIUS.md,
                  border: isActive ? '1.5px solid #8b5e3c' : '1px solid transparent',
                  background: isActive ? '#fdf8f2' : 'transparent',
                  color: isActive ? '#5c3a21' : '#7a5c42',
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 12,
                      background: isActive ? '#8b5e3c' : '#ede8dc',
                      color: isActive ? '#fff' : '#7a5c42',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#a08060', paddingRight: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: result ? '#3d7a4e' : '#c87a1e' }} />
          <span style={{ fontWeight: 700 }}>{result ? (mode === 'exam' ? 'Prova Pronta' : 'Worksheet Pronta') : 'Aguardando Geração'}</span>
        </div>
      </div>

      {/* ─── ABA 1: DOCUMENTO GERADO (EDITOR & PREVIEW) ────────────────────── */}
      {activeTab === 'document' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
          {/* Listening Track (se houver) */}
          {mode === 'exam' && onGenerateAudio && (
            <div
              style={{
                background: '#fff',
                padding: '10px 16px',
                borderRadius: RADIUS.lg,
                border: '1px solid #ede8dc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
                boxShadow: SHADOW.sm,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🎧</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Listening Track Audio</span>
                {onAccentChange && (
                  <select
                    value={accent}
                    onChange={e => onAccentChange(e.target.value as any)}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, background: '#faf6f0' }}
                  >
                    <option value="US">🇺🇸 US (American)</option>
                    <option value="UK">🇬🇧 UK (British)</option>
                  </select>
                )}
              </div>
              <button
                type="button"
                onClick={onGenerateAudio}
                disabled={audioLoading}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#8b5e3c',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: audioLoading ? 'wait' : 'pointer',
                }}
              >
                {audioLoading ? '⏳ Gerando Áudio MP3...' : '🔊 Gerar Áudio da Prova'}
              </button>
            </div>
          )}

          {audioUrl && (
            <AudioPlayerCard
              audioUrl={audioUrl}
              title={`Listening Track - ${topic || 'Exam'}`}
              accent={accent}
              onDelete={onDeleteAudio || (() => {})}
            />
          )}

          {/* Toolbar de Exportação & Alternador de Visualização */}
          {result && (
            <div
              style={{
                background: '#fdf8f2',
                padding: '10px 16px',
                borderRadius: RADIUS.lg,
                border: '1.5px solid #ede8dc',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}
            >
              {/* Botões de Exportação */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() =>
                    exportToPdf({
                      schoolName: header.school || 'ESCOLA DE ENSINO & IDIOMAS',
                      teacherName: header.teacher || 'Professor(a)',
                      className: grade || '9º Ano',
                      title:
                        header.title ||
                        (topic ? `${mode === 'exam' ? 'PROVA' : 'ATIVIDADE'} ${topic.toUpperCase()}` : 'AVALIAÇÃO'),
                      content: result,
                    })
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: 'none',
                    background: '#8b5e3c',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(139,94,60,0.2)',
                  }}
                >
                  <i className="ti ti-printer" /> Exportar PDF Oficial
                </button>

                <button
                  type="button"
                  onClick={() =>
                    exportToWord({
                      schoolName: header.school || 'ESCOLA DE ENSINO & IDIOMAS',
                      teacherName: header.teacher || 'Professor(a)',
                      className: grade || '9º Ano',
                      title:
                        header.title ||
                        (topic ? `${mode === 'exam' ? 'PROVA' : 'ATIVIDADE'} ${topic.toUpperCase()}` : 'AVALIAÇÃO'),
                      content: result,
                    })
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: '1px solid #c0a080',
                    background: '#fffcf8',
                    color: '#8b5e3c',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="ti ti-file-text" /> Exportar Word (.docx)
                </button>

                {mode === 'exam' && onOpenOnlinePlayer && (
                  <button
                    type="button"
                    onClick={onOpenOnlinePlayer}
                    style={{
                      padding: '8px 14px',
                      borderRadius: RADIUS.md,
                      border: 'none',
                      background: '#2d9d5d',
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 8px rgba(45,157,93,0.2)',
                    }}
                  >
                    🚀 Testar Prova Online
                  </button>
                )}
              </div>

              {/* Sub-visualização: Boxes vs Canvas */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setActiveViewMode('boxes')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.md,
                    border: activeViewMode === 'boxes' ? '1.5px solid #8b5e3c' : '1px solid #d5c8bb',
                    background: activeViewMode === 'boxes' ? '#8b5e3c' : '#fff',
                    color: activeViewMode === 'boxes' ? '#fff' : '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  📑 Boxes Editáveis
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewMode('canvas')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.md,
                    border: activeViewMode === 'canvas' ? '1.5px solid #8b5e3c' : '1px solid #d5c8bb',
                    background: activeViewMode === 'canvas' ? '#8b5e3c' : '#fff',
                    color: activeViewMode === 'canvas' ? '#fff' : '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  📄 Folha Formatada (A4)
                </button>
              </div>
            </div>
          )}

          {/* Container do Documento */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              borderRadius: RADIUS.xl,
              border: '1px solid #ede8dc',
              boxShadow: SHADOW.md,
              background: '#fff',
              minHeight: 0,
            }}
          >
            {!result ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a08060',
                  gap: 16,
                  padding: 40,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 56, opacity: 0.3 }}>📝</span>
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: 16, color: '#5c3a21', fontWeight: 800 }}>
                    {mode === 'exam' ? 'Sua Prova Oficial Aparecerá Aqui' : 'Sua Lista de Exercícios Aparecerá Aqui'}
                  </h4>
                  <p style={{ margin: 0, fontSize: 13, color: '#a08060' }}>
                    Configure os parâmetros e clique em <strong>Gerar</strong> para construir a avaliação com psicometria e didática.
                  </p>
                </div>
              </div>
            ) : activeViewMode === 'boxes' ? (
              <div style={{ padding: 18 }}>
                <EditableQuestionBoxes
                  initialContent={result}
                  onContentChange={onContentChange}
                  onAskRafinhaForQuestion={onAskRafinhaForQuestion}
                />
              </div>
            ) : (
              <DocumentCanvas
                content={result}
                onContentChange={onContentChange}
                hideHeader={hideHeader}
                onToggleHeader={onToggleHeader || (() => {})}
                headerData={{
                  school: header.school || 'Nome da Escola',
                  teacher: header.teacher || 'Professor(a)',
                  title:
                    header.title ||
                    (topic ? `${mode === 'exam' ? 'Prova' : 'Exercício'} ${topic}` : 'Documento Oficial'),
                }}
                onHeaderChange={
                  onHeaderChange ||
                  (() => {})
                }
              />
            )}
          </div>
        </div>
      )}

      {/* ─── ABA 2: TÓPICOS ABORDADOS & PÁGINAS / FONTES UTILIZADAS ─────────── */}
      {activeTab === 'topics' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            borderRadius: RADIUS.xl,
            border: '1px solid #ede8dc',
            background: '#faf6f0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: 0,
          }}
        >
          {/* Header de Metadados Curriculares */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#8b5e3c',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {subjectName} · {grade} · Nível {level}
                </span>
                <h3 style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  📌 {topic || (mode === 'exam' ? 'Conteúdo Bimestral Avaliativo' : 'Exercícios de Fixação')}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#7a5c42' }}>
                  {mode === 'exam' ? 'Avaliação oficial de competências com matriz de referência' : 'Prática guiada e contextualizada de aprendizagem'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', borderRadius: 8, background: '#fdf8f2', border: '1px solid #ede8dc', fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                  🎯 {totalQuestions} Questões
                </span>
                <span style={{ padding: '4px 10px', borderRadius: 8, background: '#f0fff4', border: '1px solid #b7eb8f', fontSize: 12, fontWeight: 700, color: '#2d9d5d' }}>
                  ⏱️ ~{totalQuestions * 4} minutos
                </span>
                {neeProfile && (
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: '#e6f7ff', border: '1px solid #91d5ff', fontSize: 12, fontWeight: 700, color: '#096dd9' }}>
                    ♿ Adaptado: {neeProfile.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Eixos & Seções Contempladas */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0e8d8', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', alignSelf: 'center' }}>
                Seções Avaliadas:
              </span>
              {sections.map(sec => (
                <span
                  key={sec}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 6,
                    background: '#f5efe6',
                    border: '1px solid #e0d5c5',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#5c3a21',
                  }}
                >
                  ✓ {sec}
                </span>
              ))}
            </div>
          </div>

          {/* Livros, Páginas & Materiais-Base Utilizados */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>📖</span>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                Livros, Apostilas & Páginas / Fontes Utilizadas
              </h4>
            </div>

            {activeSources.length === 0 ? (
              <div
                style={{
                  background: '#fdf8f2',
                  border: '1px dashed #d5c8bb',
                  borderRadius: RADIUS.md,
                  padding: 16,
                  fontSize: 13,
                  color: '#7a5c42',
                  lineHeight: 1.6,
                }}
              >
                💡 <strong>Base Curricular Padrão Aplicada:</strong> As questões foram elaboradas a partir do corpus oficial da disciplina para a faixa etária de <strong>{grade}</strong> (Nível <strong>{level}</strong>).
                <br />
                <span style={{ fontSize: 12, color: '#a08060' }}>
                  (Para embasar em um livro didático ou PDF específico com páginas numeradas, anexe o arquivo na barra lateral esquerda em <em>Fontes de Conhecimento</em>).
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeSources.map(src => (
                  <div
                    key={src.id}
                    style={{
                      background: '#fdf8f2',
                      border: '1.5px solid #ede8dc',
                      borderRadius: RADIUS.md,
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>
                          {src.fileType === 'pdf' ? '📑' : src.sourceType === 'book' ? '📘' : src.sourceType === 'web' ? '🌐' : '📝'}
                        </span>
                        <strong style={{ fontSize: 13.5, color: '#2c1a0e' }}>{src.title}</strong>
                        {src.category && <span style={{ fontSize: 12, color: '#7a5c42' }}>({src.category})</span>}
                      </div>

                      {(src.scopeInfo || src.category) && (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#8b5e3c',
                            color: '#fff',
                            fontSize: 11.5,
                            fontWeight: 800,
                          }}
                        >
                          📄 {src.scopeInfo || 'Páginas / Escopo Selecionado'}
                        </span>
                      )}
                    </div>

                    {src.content && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: '#665c54',
                          background: '#fff',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid #ede8dc',
                          lineHeight: 1.5,
                        }}
                      >
                        <strong>Trecho / Vocabulário Extraído:</strong> {src.content.slice(0, 220)}...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matriz BNCC Mapeada */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🏛️</span>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                Matriz de Habilidades BNCC ({grade})
              </h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
              {matchingBnccSkills.map(sk => (
                <div
                  key={sk.id}
                  style={{
                    background: '#fdf8f2',
                    border: '1px solid #ede8dc',
                    borderRadius: RADIUS.md,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', fontFamily: 'monospace' }}>
                      {sk.code}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ede8dc', color: '#5c3a21' }}>
                      {sk.axis}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#4a3b32', lineHeight: 1.45 }}>
                    {sk.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 3: LINHA DE RACIOCÍNIO PEDAGÓGICO DA IA ─────────────────── */}
      {activeTab === 'rationale' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            borderRadius: RADIUS.xl,
            border: '1px solid #ede8dc',
            background: '#faf6f0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: 0,
          }}
        >
          {/* Banner de Apresentação Psicométrica */}
          <div
            style={{
              background: 'linear-gradient(135deg, #5c3a21, #8b5e3c)',
              borderRadius: RADIUS.lg,
              padding: '18px 22px',
              color: '#fff',
              boxShadow: SHADOW.md,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 24 }}>🧠</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                Linha de Raciocínio & Justificativa Psicométrica da IA
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.92, lineHeight: 1.5 }}>
              Transparência total sobre os critérios cognitivos de Bloom, calibração de dificuldade da TRI e engenharia de distratores diagnósticos aplicados na elaboração deste documento.
            </p>
          </div>

          {/* 1. Matriz da Taxonomia de Bloom */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                📊 1. Distribuição Cognitiva (Taxonomia de Bloom)
              </h4>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8b5e3c' }}>Total: 100% calibrado</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                { label: 'Lembrar & Compreender', pct: bloomDistribution.remember, color: '#3d7a4e', desc: 'Identificação de fatos, vocabulário e regras explícitas.' },
                { label: 'Aplicar', pct: bloomDistribution.apply, color: '#c87a1e', desc: 'Emprego ativo das estruturas em novas situações e enunciados.' },
                { label: 'Analisar', pct: bloomDistribution.analyze, color: '#2a6080', desc: 'Inferência textual, dedução de propósito e comparação crítica.' },
                { label: 'Avaliar & Criar', pct: bloomDistribution.evaluate, color: '#8b5e3c', desc: 'Produção escrita autoral e julgamento argumentativo.' },
              ].map(b => (
                <div
                  key={b.label}
                  style={{
                    background: '#fdf8f2',
                    borderRadius: RADIUS.md,
                    padding: 12,
                    border: '1px solid #ede8dc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>{b.label}</span>
                    <strong style={{ fontSize: 14, color: b.color }}>{b.pct}%</strong>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: '#e8e0d0', overflow: 'hidden' }}>
                    <div style={{ width: `${b.pct}%`, height: '100%', background: b.color, borderRadius: 3 }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: '#7a5c42', lineHeight: 1.4 }}>
                    {b.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Calibração Psicométrica de Dificuldade */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
              ⚖️ 2. Calibração Psicométrica de Dificuldade (Curva Normal)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Fácil', pct: difficultyDistribution.easy, color: '#3d7a4e', desc: 'Garante confiança inicial' },
                { label: 'Médio', pct: difficultyDistribution.medium, color: '#2a6080', desc: 'Faixa esperada do nível' },
                { label: 'Difícil', pct: difficultyDistribution.hard, color: '#c87a1e', desc: 'Discriminação de excelência' },
                { label: 'Desafio', pct: difficultyDistribution.challenge, color: '#a83232', desc: 'Ponto de inflexão' },
              ].map(d => (
                <div key={d.label} style={{ background: '#fdf8f2', borderRadius: RADIUS.md, padding: 10, border: '1px solid #ede8dc', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42' }}>{d.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: d.color, margin: '4px 0' }}>{d.pct}%</div>
                  <div style={{ fontSize: 10, color: '#a08060' }}>{d.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Engenharia de Distratores Pedagógicos & Erros L1 */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>🎯</span>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                3. Engenharia de Distratores Pedagógicos & Diagnóstico de Erros
              </h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#fdf8f2', borderRadius: RADIUS.md, padding: 12, border: '1px solid #ede8dc' }}>
                <h5 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: '#8b5e3c' }}>
                  🛡️ Erros de L1 / Falsos Cognatos Mapeados
                </h5>
                <p style={{ margin: 0, fontSize: 12, color: '#665c54', lineHeight: 1.5 }}>
                  Alternativas incorretas foram formuladas a partir de armadilhas mentais reais do aprendiz brasileiro (omissão de sujeito, regência preposicional traduzida ao pé da letra e falsos amigos).
                </p>
              </div>

              <div style={{ background: '#fdf8f2', borderRadius: RADIUS.md, padding: 12, border: '1px solid #ede8dc' }}>
                <h5 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: '#3d7a4e' }}>
                  ✨ Valor Diagnóstico & Sem Pegadinhas
                </h5>
                <p style={{ margin: 0, fontSize: 12, color: '#665c54', lineHeight: 1.5 }}>
                  Cada erro cometido pelo aluno aponta para uma lacuna pedagógica específica que pode ser recuperada no Gabarito Comentado gerado ao final da avaliação.
                </p>
              </div>
            </div>
          </div>

          {/* 4. Metodologias Didáticas Aplicadas & Fact-Check */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
              📐 4. Metodologias Didáticas & Auditoria de Precisão
            </h4>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {approach.map(app => (
                <span
                  key={app}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    background: '#f5efe6',
                    border: '1.5px solid #8b5e3c',
                    color: '#5c3a21',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  🎓 {app}
                </span>
              ))}
            </div>

            {factCheck && (
              <div
                style={{
                  background: factCheck.score >= 80 ? '#f0fff4' : '#fffbe6',
                  border: `1px solid ${factCheck.score >= 80 ? '#b7eb8f' : '#ffe58f'}`,
                  borderRadius: RADIUS.md,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 20 }}>{factCheck.level === 'ok' ? '✅' : '⚠️'}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>
                    Auditoria Fact-Check: Nota {factCheck.score}/100 ({factCheck.level.toUpperCase()})
                  </div>
                  <div style={{ fontSize: 11.5, color: '#665c54' }}>
                    {factCheck.issues.length > 0 ? factCheck.issues.join('; ') : 'Conteúdo aprovado sem contradições factuais ou conceituais.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
