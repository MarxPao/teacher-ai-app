'use client'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useCallback } from 'react'
import { checkOptionParallelism } from '@/lib/itemQualityChecker'
import { auditReadingLoad } from '@/lib/readingLoadAuditor'

export interface QuestionOption {
  letter: string
  text: string
}

export interface EditableQuestionItem {
  id: string
  number: number
  type: 'multiple_choice' | 'discursive' | 'true_false' | 'gap_fill' | 'matching' | 'reading_text' | 'other'
  typeLabel: string
  points: number
  stem: string
  contextText?: string
  options?: QuestionOption[]
  answerKey?: string
  parallelismWarning?: string
  readingLoadWarning?: string
}

interface EditableQuestionBoxesProps {
  initialContent: string
  onContentChange: (newContentHtml: string) => void
  onAskRafinhaForQuestion?: (questionIndex: number, currentQuestion: EditableQuestionItem, userInstruction: string) => Promise<string | void>
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER INTELIGENTE DE HTML / MARKDOWN PARA BOXES ESTRUTURADOS
// ─────────────────────────────────────────────────────────────────────────────

export function parseContentToQuestions(raw: string): EditableQuestionItem[] {
  if (!raw || !raw.trim()) return []

  const cleanText = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim()

  const lines = cleanText.split('\n')
  const questions: EditableQuestionItem[] = []

  let currentStem = ''
  let currentContext = ''
  let currentOpts: QuestionOption[] = []
  let currentAnswer = ''
  let currentType: EditableQuestionItem['type'] = 'discursive'
  let currentPoints = 1.0

  const flushQuestion = () => {
    if (!currentStem.trim() && currentOpts.length === 0) return

    let typeLabel = 'Dissertativa'
    if (currentOpts.length > 0) {
      if (currentOpts.length === 2 && currentOpts.some(o => o.text.toLowerCase().includes('verdadeiro') || o.text.toLowerCase().includes('falso') || o.letter === 'V' || o.letter === 'F')) {
        currentType = 'true_false'
        typeLabel = 'Verdadeiro / Falso'
      } else {
        currentType = 'multiple_choice'
        typeLabel = 'Múltipla Escolha'
      }
    } else if (/_{3,}|\(\s*\.\.\.\s*\)|\[\s*\.\.\.\s*\]|fill\s+in|complete/i.test(currentStem)) {
      currentType = 'gap_fill'
      typeLabel = 'Lacunas (Gap Fill)'
    } else if (/relacione|associe|match|coluna/i.test(currentStem)) {
      currentType = 'matching'
      typeLabel = 'Associação de Colunas'
    } else if (/leia o texto|read the text|com base no texto|interprete/i.test(currentStem) || currentContext) {
      currentType = 'reading_text'
      typeLabel = 'Interpretação de Texto'
    }

    let parallelismWarning: string | undefined
    if (currentOpts.length >= 2) {
      const check = checkOptionParallelism(currentOpts.map(o => `${o.letter}) ${o.text}`))
      if (!check.isParallel) {
        parallelismWarning = check.warning
      }
    }

    let readingLoadWarning: string | undefined
    const textToAudit = currentContext.trim() || (currentStem.length > 150 ? currentStem : '')
    if (textToAudit && textToAudit.split(/\s+/).length >= 35) {
      const loadAudit = auditReadingLoad(textToAudit)
      if (loadAudit.warning) {
        readingLoadWarning = `📊 Carga de Leitura: ${loadAudit.warning}`
      }
    }

    questions.push({
      id: `q_${Date.now()}_${questions.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
      number: questions.length + 1,
      type: currentType,
      typeLabel,
      points: currentPoints,
      stem: currentStem.trim(),
      contextText: currentContext.trim() || undefined,
      options: currentOpts.length > 0 ? [...currentOpts] : undefined,
      answerKey: currentAnswer.trim() || undefined,
      parallelismWarning,
      readingLoadWarning
    })

    currentStem = ''
    currentContext = ''
    currentOpts = []
    currentAnswer = ''
    currentType = 'discursive'
    currentPoints = 1.0
  }

  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return

    // Detecta início de questão (ex: "1.", "1)", "Questão 1:", "Question 1:")
    const qMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)$/i) || trimmed.match(/^(?:Questão|Question)\s*(\d+)[:\.\)]\s*(.*)$/i)
    if (qMatch) {
      flushQuestion()
      currentStem = qMatch[2] || ''
      return
    }

    // Detecta alternativas (ex: "a)", "A.", "(A)", "a -")
    const optMatch = trimmed.match(/^[\(\[]?([a-eA-E])[\)\]\.\-]\s*(.*)$/)
    if (optMatch && currentStem) {
      currentOpts.push({
        letter: optMatch[1].toUpperCase(),
        text: optMatch[2] || ''
      })
      return
    }

    // Detecta gabarito / resposta
    if (/^(?:Gabarito|Resposta|Answer|Chave|Feedback)[:\s]/i.test(trimmed)) {
      currentAnswer = trimmed.replace(/^(?:Gabarito|Resposta|Answer|Chave|Feedback)[:\s]*/i, '')
      return
    }

    // Continuação do enunciado ou contexto
    if (currentStem) {
      if (currentOpts.length > 0) {
        // Se já tem opções e vem texto, pode ser explicação/gabarito
        currentAnswer = (currentAnswer ? currentAnswer + '\n' : '') + trimmed
      } else {
        currentStem += '\n' + trimmed
      }
    } else {
      currentContext = (currentContext ? currentContext + '\n' : '') + trimmed
    }
  })

  flushQuestion()

  // Se o parser não encontrou padrão de questões estruturadas, cria uma única editável
  if (questions.length === 0 && cleanText.trim()) {
    questions.push({
      id: `q_${Date.now()}_1`,
      number: 1,
      type: 'reading_text',
      typeLabel: 'Atividade / Conteúdo',
      points: 10,
      stem: cleanText.trim(),
    })
  }

  return questions
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPILADOR DE QUESTÕES ESTRUTURADAS DE VOLTA PARA HTML FORMATADO
// ─────────────────────────────────────────────────────────────────────────────

export function compileQuestionsToHtml(questions: EditableQuestionItem[], customTitle?: string): string {
  if (!questions || questions.length === 0) return ''

  let html = '<div class="generated-exam-document" style="font-family: inherit; color: #2c1a0e; line-height: 1.6;">\n'
  if (customTitle) {
    html += `  <h2 style="font-size: 18px; font-weight: 700; color: #2c1a0e; margin-bottom: 16px; border-bottom: 2px solid #8b5e3c; padding-bottom: 6px;">${customTitle}</h2>\n`
  }

  questions.forEach((q, idx) => {
    const qNum = idx + 1
    html += `  <div class="exam-question-item" style="margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px dashed #e8e0d0;">\n`
    
    // Cabeçalho da Questão
    html += `    <div style="font-weight: 700; font-size: 15px; color: #2c1a0e; margin-bottom: 8px;">\n`
    html += `      <span style="display: inline-block; background: #8b5e3c; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 12px; margin-right: 8px;">${qNum}</span>\n`
    if (q.points) {
      html += `      <span style="float: right; font-size: 12px; color: #7a5c42; font-weight: 600;">(${q.points.toFixed(1)} pt${q.points !== 1 ? 's' : ''})</span>\n`
    }
    html += `    </div>\n`

    // Texto de Apoio / Contexto se houver
    if (q.contextText) {
      html += `    <div style="background: #faf6f0; border-left: 3px solid #8b5e3c; padding: 10px 14px; margin-bottom: 10px; font-style: italic; border-radius: 0 8px 8px 0; font-size: 13.5px;">\n`
      html += `      ${q.contextText.replace(/\n/g, '<br />')}\n`
      html += `    </div>\n`
    }

    // Enunciado
    html += `    <p style="margin: 0 0 12px 0; font-size: 14.5px; color: #2c1a0e;">${q.stem.replace(/\n/g, '<br />')}</p>\n`

    // Alternativas (se houver)
    if (q.options && q.options.length > 0) {
      html += `    <div class="exam-options-list" style="margin-left: 8px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">\n`
      q.options.forEach(opt => {
        html += `      <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 14px;">\n`
        html += `        <strong style="min-width: 24px; color: #8b5e3c;">${opt.letter})</strong>\n`
        html += `        <span>${opt.text}</span>\n`
        html += `      </div>\n`
      })
      html += `    </div>\n`
    } else if (q.type === 'discursive') {
      // Linhas para resposta do aluno
      html += `    <div style="margin-top: 14px; margin-bottom: 12px;">\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `    </div>\n`
    }

    // Gabarito / Chave de Correção
    if (q.answerKey) {
      html += `    <div class="exam-answer-key" style="margin-top: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; color: #166534;">\n`
      html += `      <strong>✓ Gabarito / Resolução:</strong> ${q.answerKey.replace(/\n/g, ' ')}\n`
      html += `    </div>\n`
    }

    html += `  </div>\n`
  })

  html += '</div>'
  return html
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: EDITABLE QUESTION BOXES
// ─────────────────────────────────────────────────────────────────────────────

export default function EditableQuestionBoxes({
  initialContent,
  onContentChange,
  onAskRafinhaForQuestion
}: EditableQuestionBoxesProps) {
  const [questions, setQuestions] = useState<EditableQuestionItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAnswerKeys, setShowAnswerKeys] = useState(true)
  const [rafinhaPromptModalQIndex, setRafinhaPromptModalQIndex] = useState<number | null>(null)
  const [rafinhaPromptText, setRafinhaPromptText] = useState('')
  const [rafinhaLoading, setRafinhaLoading] = useState(false)

  // Parse inicial quando o conteúdo muda
  useEffect(() => {
    if (initialContent) {
      const parsed = parseContentToQuestions(initialContent)
      setQuestions(parsed)
    }
  }, [initialContent])

  // Emite alterações de volta
  const triggerUpdate = useCallback((updated: EditableQuestionItem[]) => {
    setQuestions(updated)
    const compiled = compileQuestionsToHtml(updated)
    onContentChange(compiled)
  }, [onContentChange])

  // Reordenação: Mover para Cima
  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const updated = [...questions]
    const temp = updated[index - 1]
    updated[index - 1] = updated[index]
    updated[index] = temp
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
  }

  // Reordenação: Mover para Baixo
  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return
    const updated = [...questions]
    const temp = updated[index + 1]
    updated[index + 1] = updated[index]
    updated[index] = temp
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
  }

  // Excluir Questão
  const handleDelete = async (index: number) => {
    if (!(await showConfirm({ message: `Deseja realmente excluir a Questão #${index + 1}?` }))) return
    const updated = questions.filter((_, i) => i !== index)
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
  }

  // Duplicar Questão
  const handleDuplicate = (index: number) => {
    const target = questions[index]
    const copy: EditableQuestionItem = {
      ...target,
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      number: index + 2,
      stem: target.stem + ' (Cópia)',
      options: target.options ? target.options.map(o => ({ ...o })) : undefined
    }
    const updated = [...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)]
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
  }

  // Adicionar Nova Questão Manual
  const handleAddNewQuestion = () => {
    const newQ: EditableQuestionItem = {
      id: `q_${Date.now()}_${questions.length + 1}`,
      number: questions.length + 1,
      type: 'multiple_choice',
      typeLabel: 'Múltipla Escolha',
      points: 1.0,
      stem: 'Digite o enunciado da nova questão aqui...',
      options: [
        { letter: 'A', text: 'Primeira alternativa' },
        { letter: 'B', text: 'Segunda alternativa' },
        { letter: 'C', text: 'Terceira alternativa' },
        { letter: 'D', text: 'Quarta alternativa' }
      ],
      answerKey: 'A) Primeira alternativa'
    }
    const updated = [...questions, newQ]
    triggerUpdate(updated)
    setEditingId(newQ.id)
  }

  // Atualizar Campo Específico
  const handleFieldChange = (index: number, field: keyof EditableQuestionItem, value: any) => {
    const updated = [...questions]
    updated[index] = { ...updated[index], [field]: value }
    triggerUpdate(updated)
  }

  // Atualizar Opção Específica
  const handleOptionChange = (qIndex: number, optIndex: number, newText: string) => {
    const updated = [...questions]
    const opts = [...(updated[qIndex].options || [])]
    opts[optIndex] = { ...opts[optIndex], text: newText }
    updated[qIndex].options = opts
    triggerUpdate(updated)
  }

  // Adicionar Alternativa
  const handleAddOption = (qIndex: number) => {
    const updated = [...questions]
    const opts = [...(updated[qIndex].options || [])]
    const letters = ['A', 'B', 'C', 'D', 'E', 'F']
    const nextLetter = letters[opts.length] || String.fromCharCode(65 + opts.length)
    opts.push({ letter: nextLetter, text: 'Nova alternativa' })
    updated[qIndex].options = opts
    triggerUpdate(updated)
  }

  // Remover Alternativa
  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    const updated = [...questions]
    const opts = (updated[qIndex].options || []).filter((_, i) => i !== optIndex)
    updated[qIndex].options = opts
    triggerUpdate(updated)
  }

  // Chamar Rafinha para Reformular Questão
  const handleCallRafinha = async (index: number) => {
    if (!onAskRafinhaForQuestion) {
      toast.success('Assistente Rafinha IA não disponível neste modo.')
      return
    }
    setRafinhaLoading(true)
    try {
      const q = questions[index]
      await onAskRafinhaForQuestion(index, q, rafinhaPromptText || 'Reformule e aprimore o enunciado tornando-o mais desafiador e contextualizado.')
      setRafinhaPromptModalQIndex(null)
      setRafinhaPromptText('')
    } finally {
      setRafinhaLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de Ferramentas dos Boxes Editáveis */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#faf6f0',
        padding: '12px 18px',
        borderRadius: 14,
        border: '1px solid #ede8dc',
        flexWrap: 'wrap',
        gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-layout-cards" />
            <span>{questions.length} Questões em Boxes Editáveis</span>
          </span>
          <span style={{ fontSize: 12, color: '#8b5e3c', background: 'rgba(139,94,60,0.12)', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
            Total: {questions.reduce((acc, q) => acc + (q.points || 1), 0).toFixed(1)} pts
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowAnswerKeys(prev => !prev)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #d5c8bb',
              background: showAnswerKeys ? '#f0fdf4' : '#fff',
              color: showAnswerKeys ? '#166534' : '#665c54',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <i className={showAnswerKeys ? 'ti ti-eye-off' : 'ti ti-check'} />
            <span>{showAnswerKeys ? 'Ocultar Gabaritos' : 'Exibir Gabaritos'}</span>
          </button>

          <button
            type="button"
            onClick={handleAddNewQuestion}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#8b5e3c',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti ti-plus" /> + Nova Questão
          </button>
        </div>
      </div>

      {/* Lista de Boxes Editáveis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, index) => {
          const isFirst = index === 0
          const isLast = index === questions.length - 1

          return (
            <div
              key={q.id}
              style={{
                background: '#ffffff',
                border: '1px solid rgba(139,115,85,0.22)',
                borderRadius: 16,
                padding: '16px 20px',
                boxShadow: '0 4px 14px rgba(44,26,14,0.04)',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Header do Box da Questão */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: '1px solid #f5efe6'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Badge com Número */}
                  <span style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: '#8b5e3c',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13
                  }}>
                    #{q.number}
                  </span>

                  {/* Seletor de Tipo */}
                  <select
                    value={q.type}
                    onChange={e => {
                      const newType = e.target.value as EditableQuestionItem['type']
                      const typeLabelMap: Record<string, string> = {
                        multiple_choice: 'Múltipla Escolha',
                        discursive: 'Dissertativa',
                        true_false: 'Verdadeiro / Falso',
                        gap_fill: 'Lacunas (Gap Fill)',
                        matching: 'Associação de Colunas',
                        reading_text: 'Interpretação de Texto',
                        other: 'Outro'
                      }
                      handleFieldChange(index, 'type', newType)
                      handleFieldChange(index, 'typeLabel', typeLabelMap[newType] || 'Outro')
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: '1px solid #d5c8bb',
                      background: '#faf6f0',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#2c1a0e',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="multiple_choice">⭕ Múltipla Escolha</option>
                    <option value="discursive">✍️ Dissertativa / Aberta</option>
                    <option value="true_false">🔘 Verdadeiro / Falso (V/F)</option>
                    <option value="gap_fill">🔤 Lacunas (Gap Fill)</option>
                    <option value="matching">🔀 Associação de Colunas</option>
                    <option value="reading_text">📖 Leitura & Interpretação</option>
                  </select>

                  {/* Pontuação Editável */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
                    <span style={{ fontSize: 11.5, color: '#7a5c42', fontWeight: 600 }}>Valor:</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={q.points}
                      onChange={e => handleFieldChange(index, 'points', parseFloat(e.target.value) || 1.0)}
                      style={{
                        width: 54,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: '1px solid #d5c8bb',
                        fontSize: 12,
                        fontWeight: 700,
                        textAlign: 'center',
                        background: '#faf6f0'
                      }}
                    />
                    <span style={{ fontSize: 11.5, color: '#7a5c42' }}>pt</span>
                  </div>
                </div>

                {/* Botões de Ação e Reordenação */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Reordenar ⬆️ */}
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={isFirst}
                    title="Mover para cima"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #d5c8bb',
                      background: isFirst ? '#f5efe6' : '#fff',
                      color: isFirst ? '#a08060' : '#2c1a0e',
                      cursor: isFirst ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 800
                    }}
                  >
                    ⬆️
                  </button>

                  {/* Reordenar ⬇️ */}
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={isLast}
                    title="Mover para baixo"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #d5c8bb',
                      background: isLast ? '#f5efe6' : '#fff',
                      color: isLast ? '#a08060' : '#2c1a0e',
                      cursor: isLast ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 800
                    }}
                  >
                    ⬇️
                  </button>

                  {/* Rafinha IA Helper */}
                  <button
                    type="button"
                    onClick={() => {
                      setRafinhaPromptModalQIndex(index)
                      setRafinhaPromptText('')
                    }}
                    title="Pedir para a Rafinha IA ajustar esta questão"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #fde68a',
                      background: '#fef3c7',
                      color: '#b58900',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <i className="ti ti-sparkles" /> Rafinha
                  </button>

                  {/* Duplicar */}
                  <button
                    type="button"
                    onClick={() => handleDuplicate(index)}
                    title="Duplicar questão"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #d5c8bb',
                      background: '#fff',
                      color: '#2c1a0e',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <i className="ti ti-copy" />
                  </button>

                  {/* Excluir */}
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    title="Excluir questão"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #fecaca',
                      background: '#fee2e2',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>

              {/* Corpo do Box: Enunciado e Conteúdo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Texto de Apoio / Contexto Opcional */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Enunciado / Instrução:
                    </label>
                  </div>
                  <textarea
                    value={q.stem}
                    onChange={e => handleFieldChange(index, 'stem', e.target.value)}
                    rows={3}
                    placeholder="Digite o enunciado da questão..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #d5c8bb',
                      background: '#faf6f0',
                      fontSize: 14,
                      color: '#2c1a0e',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      resize: 'vertical',
                      outline: 'none'
                    }}
                  />
                  {q.readingLoadWarning && (
                    <div style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: 8,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 11.5,
                      color: '#1e40af',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <i className="ti ti-book" style={{ fontSize: 16, color: '#2563eb', flexShrink: 0 }} />
                      <span>{q.readingLoadWarning}</span>
                    </div>
                  )}
                </div>

                {/* Alternativas de Múltipla Escolha */}
                {(q.type === 'multiple_choice' || q.type === 'true_false' || (q.options && q.options.length > 0)) && (
                  <div style={{ background: '#faf6f0', padding: 12, borderRadius: 10, border: '1px solid #ede8dc' }}>
                    {q.parallelismWarning && (
                      <div style={{
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: 8,
                        padding: '6px 10px',
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11.5,
                        color: '#92400e',
                        fontWeight: 600,
                        lineHeight: 1.4
                      }}>
                        <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: '#d97706', flexShrink: 0 }} />
                        <span><strong>Item Writing Quality:</strong> {q.parallelismWarning}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                        Alternativas de Resposta:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddOption(index)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: '1px solid #d5c8bb',
                          background: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#2c1a0e',
                          cursor: 'pointer'
                        }}
                      >
                        + Alternativa
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(q.options || []).map((opt, optIdx) => (
                        <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: '#8b5e3c',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 800
                          }}>
                            {opt.letter}
                          </span>
                          <input
                            type="text"
                            value={opt.text}
                            onChange={e => handleOptionChange(index, optIdx, e.target.value)}
                            placeholder={`Texto da alternativa ${opt.letter}...`}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid #d5c8bb',
                              background: '#fff',
                              fontSize: 13,
                              color: '#2c1a0e',
                              outline: 'none'
                            }}
                          />
                          {(q.options || []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(index, optIdx)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: '4px'
                              }}
                              title="Remover alternativa"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gabarito / Chave de Resposta */}
                {showAnswerKeys && (
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      ✓ Gabarito / Resolução Comentada:
                    </label>
                    <input
                      type="text"
                      value={q.answerKey || ''}
                      onChange={e => handleFieldChange(index, 'answerKey', e.target.value)}
                      placeholder="Ex: Alternativa B — Explicação gramatical ou resposta esperada..."
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #bbf7d0',
                        background: '#f0fdf4',
                        fontSize: 13,
                        color: '#166534',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal / Prompt da Rafinha para Ajuste de Questão */}
      {rafinhaPromptModalQIndex !== null && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(44,26,14,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: '24px',
            maxWidth: 500,
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            border: '1px solid rgba(139,115,85,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>✨</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                  Ajustar Questão #{rafinhaPromptModalQIndex + 1} com Rafinha IA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRafinhaPromptModalQIndex(null)}
                style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#665c54' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#665c54', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              O que você gostaria de mudar nesta questão? (Ex: <em>"Torne mais difícil"</em>, <em>"Mude o tema para tecnologia"</em>, <em>"Transforme em Múltipla Escolha com 4 opções"</em>).
            </p>

            <textarea
              value={rafinhaPromptText}
              onChange={e => setRafinhaPromptText(e.target.value)}
              placeholder="Instrução para a Rafinha..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #d5c8bb',
                fontSize: 13.5,
                background: '#faf6f0',
                outline: 'none',
                marginBottom: 16
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setRafinhaPromptModalQIndex(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: '1px solid #d5c8bb',
                  background: '#fff',
                  color: '#665c54',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCallRafinha(rafinhaPromptModalQIndex)}
                disabled={rafinhaLoading}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#8b5e3c',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: rafinhaLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {rafinhaLoading ? <><i className="ti ti-loader-2 animate-spin" /> Ajustando...</> : <><i className="ti ti-sparkles" /> Aplicar Ajuste</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
