'use client'

import React, { useState, useEffect } from 'react'
import { ChecklistTodo, RecurrenceRule, RecurrenceType, formatRecurrenceText } from '@/lib/checklistManager'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

interface ChecklistEditModalProps {
  isOpen: boolean
  todo: ChecklistTodo | null
  onClose: () => void
  onSave: (updated: ChecklistTodo) => void
}

const DAYS_SHORT = [
  { id: 0, label: 'Dom', full: 'Domingo' },
  { id: 1, label: 'Seg', full: 'Segunda-feira' },
  { id: 2, label: 'Ter', full: 'Terça-feira' },
  { id: 3, label: 'Qua', full: 'Quarta-feira' },
  { id: 4, label: 'Qui', full: 'Quinta-feira' },
  { id: 5, label: 'Sex', full: 'Sexta-feira' },
  { id: 6, label: 'Sáb', full: 'Sábado' },
]

const TAG_SUGGESTIONS = ['Rotina Diária', 'Planejamento', 'Coordenação', 'Avaliação', 'Turma', 'Geral']

export default function ChecklistEditModal({ isOpen, todo, onClose, onSave }: ChecklistEditModalProps) {
  const [text, setText] = useState('')
  const [tag, setTag] = useState('')
  const [priority, setPriority] = useState<ChecklistTodo['priority']>('medium')
  
  // Recurrence State
  const [recType, setRecType] = useState<RecurrenceType>('none')
  const [specificDay, setSpecificDay] = useState<number>(2) // 2 = Terça
  const [customDays, setCustomDays] = useState<number[]>([1, 3, 5]) // Seg, Qua, Sex
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)

  useEffect(() => {
    if (todo) {
      setText(todo.text || '')
      setTag(todo.tag || '')
      setPriority(todo.priority || 'medium')

      if (todo.recurrence) {
        setRecType(todo.recurrence.type)
        if (todo.recurrence.type === 'specific_day' && todo.recurrence.daysOfWeek && todo.recurrence.daysOfWeek.length > 0) {
          setSpecificDay(todo.recurrence.daysOfWeek[0])
        }
        if (todo.recurrence.type === 'custom_days' && todo.recurrence.daysOfWeek) {
          setCustomDays(todo.recurrence.daysOfWeek)
        }
        if (todo.recurrence.type === 'monthly' && todo.recurrence.dayOfMonth) {
          setDayOfMonth(todo.recurrence.dayOfMonth)
        }
      } else if (todo.category === 'recurrent') {
        setRecType('daily')
      } else {
        setRecType('none')
      }
    }
  }, [todo])

  if (!isOpen || !todo) return null

  const toggleCustomDay = (d: number) => {
    setCustomDays(prev => {
      if (prev.includes(d)) {
        const next = prev.filter(x => x !== d)
        return next.length > 0 ? next : [d]
      } else {
        return [...prev, d].sort((a, b) => a - b)
      }
    })
  }

  const handleSave = () => {
    if (!text.trim()) return

    let recurrenceRule: RecurrenceRule | undefined = undefined
    let category: ChecklistTodo['category'] = 'one_off'

    if (recType !== 'none') {
      category = 'recurrent'
      if (recType === 'daily') {
        recurrenceRule = { type: 'daily' }
      } else if (recType === 'weekdays') {
        recurrenceRule = { type: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5] }
      } else if (recType === 'specific_day') {
        recurrenceRule = { type: 'specific_day', daysOfWeek: [specificDay] }
      } else if (recType === 'custom_days') {
        recurrenceRule = { type: 'custom_days', daysOfWeek: customDays }
      } else if (recType === 'monthly') {
        recurrenceRule = { type: 'monthly', dayOfMonth }
      }
    }

    const updated: ChecklistTodo = {
      ...todo,
      text: text.trim(),
      tag: tag.trim() || (category === 'recurrent' ? 'Rotina Diária' : 'Geral'),
      priority,
      category,
      recurrence: recurrenceRule
    }

    onSave(updated)
  }

  // Gera texto explicativo da UX
  const getExplanationText = () => {
    switch (recType) {
      case 'none':
        return 'Tarefa pontual única. Quando você marcar como concluída, ela ficará visível por 24 horas e depois será arquivada no histórico permanente.'
      case 'daily':
        return 'Rotina diária. A cada novo dia, a tarefa reseta automaticamente para pendente no seu painel para você executar novamente.'
      case 'weekdays':
        return 'Rotina de dias úteis. Reseta para pendente de Segunda a Sexta-feira e descansa nos fins de semana.'
      case 'specific_day': {
        const dayName = DAYS_SHORT.find(d => d.id === specificDay)?.full || 'Terça-feira'
        return `Rotina semanal. Esta tarefa é ativada toda ${dayName} na sua checklist.`
      }
      case 'custom_days': {
        const names = customDays.map(cd => DAYS_SHORT.find(d => d.id === cd)?.label).join(', ')
        return `Rotina personalizada. Esta tarefa repete nos dias selecionados: ${names}.`
      }
      case 'monthly':
        return `Rotina mensal. Esta tarefa reseta todo dia ${dayOfMonth} do mês.`
      default:
        return ''
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(44,26,14,0.55)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      animation: 'fadeIn 0.2s ease',
      fontFamily: FONT.sans,
    }}>
      <div style={{
        background: COLOR.surface1,
        border: `1px solid ${BORDER.medium}`,
        borderRadius: RADIUS.xl,
        padding: '24px 28px',
        maxWidth: 580,
        width: '100%',
        boxShadow: SHADOW.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Header do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER.soft}`, paddingBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLOR.paperInk, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-edit" style={{ color: COLOR.accent }} />
              Editar Post / Tarefa da Checklist
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: TEXT.caption, color: COLOR.paperWarm }}>
              Ajuste o texto, contexto e configure a frequência de repetição.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, color: COLOR.paperMid, cursor: 'pointer', padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* 1. Texto da Tarefa */}
        <div>
          <label style={LabelStyle}>Descrição da Tarefa *</label>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Ex: Conferir frequência dos alunos no portal..."
            style={InputStyle}
            autoFocus
          />
        </div>

        {/* 2. Tag & Prioridade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={LabelStyle}>Tag / Contexto</label>
            <input
              type="text"
              value={tag}
              onChange={e => setTag(e.target.value)}
              placeholder="Ex: Rotina, Turma 8A..."
              style={InputStyle}
            />
            {/* Sugestões rápidas de Tag */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {TAG_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTag(s)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${BORDER.soft}`,
                    background: tag === s ? 'rgba(139,94,60,0.15)' : COLOR.surface2,
                    color: tag === s ? COLOR.accent : COLOR.paperWarm,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={LabelStyle}>Prioridade</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
              {[
                { key: 'high', label: 'Alta', color: '#dc322f', bg: '#fef2f2' },
                { key: 'medium', label: 'Média', color: '#b58900', bg: '#fefce8' },
                { key: 'low', label: 'Baixa', color: '#2aa198', bg: '#f0fdfa' },
              ].map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPriority(p.key as any)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: RADIUS.md,
                    border: priority === p.key ? `2px solid ${p.color}` : `1px solid ${BORDER.medium}`,
                    background: priority === p.key ? p.bg : COLOR.surface2,
                    color: priority === p.key ? p.color : COLOR.paperWarm,
                    fontSize: TEXT.caption,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. A Pergunta de Recorrência (Excelente UX) */}
        <div style={{
          background: COLOR.surface2,
          borderRadius: RADIUS.lg,
          padding: 16,
          border: `1px solid ${BORDER.medium}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: COLOR.paperInk, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-repeat" style={{ color: COLOR.accent, fontSize: 16 }} />
              Esta tarefa é recorrente?
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: RADIUS.sm,
              background: recType === 'none' ? COLOR.surface1 : 'rgba(139,94,60,0.15)',
              color: recType === 'none' ? COLOR.paperWarm : COLOR.accent
            }}>
              {formatRecurrenceText({ type: recType, daysOfWeek: recType === 'specific_day' ? [specificDay] : customDays, dayOfMonth })}
            </span>
          </div>

          {/* Grid de Opções de Recorrência */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { id: 'none', label: 'Pontual', sub: 'Sem repetição', icon: 'ti-pin' },
              { id: 'daily', label: 'Diária', sub: 'Todo dia', icon: 'ti-sun' },
              { id: 'weekdays', label: 'Dias Úteis', sub: 'Seg a Sex', icon: 'ti-briefcase' },
              { id: 'specific_day', label: 'Dia Fixo', sub: 'Toda Terça...', icon: 'ti-calendar-event' },
              { id: 'custom_days', label: 'Personalizado', sub: 'Escolher dias', icon: 'ti-calendar-week' },
              { id: 'monthly', label: 'Mensal', sub: 'Todo dia X', icon: 'ti-calendar' },
            ].map(opt => {
              const isSelected = recType === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRecType(opt.id as RecurrenceType)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: RADIUS.md,
                    border: isSelected ? `2px solid ${COLOR.accent}` : `1px solid ${BORDER.soft}`,
                    background: isSelected ? 'rgba(139,94,60,0.12)' : COLOR.surface1,
                    color: isSelected ? COLOR.paperInk : COLOR.paperWarm,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    transition: TRANSITION.fast,
                    textAlign: 'center'
                  }}
                >
                  <i className={`ti ${opt.icon}`} style={{ fontSize: 18, color: isSelected ? COLOR.accent : COLOR.paperMid }} />
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{opt.label}</span>
                  <span style={{ fontSize: 10, color: COLOR.paperWarm }}>{opt.sub}</span>
                </button>
              )
            })}
          </div>

          {/* Sub-painel para Dia Específico (ex: Toda Terça) */}
          {recType === 'specific_day' && (
            <div style={{ background: COLOR.surface1, padding: 12, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperWarm, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Selecione o dia da semana:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {DAYS_SHORT.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSpecificDay(d.id)}
                    style={{
                      padding: '8px 0',
                      borderRadius: RADIUS.sm,
                      border: specificDay === d.id ? `2px solid ${COLOR.accent}` : `1px solid ${BORDER.soft}`,
                      background: specificDay === d.id ? COLOR.accent : COLOR.surface2,
                      color: specificDay === d.id ? '#fff' : COLOR.paperInk,
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sub-painel para Dias Personalizados (ex: Seg, Qua, Sex) */}
          {recType === 'custom_days' && (
            <div style={{ background: COLOR.surface1, padding: 12, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperWarm, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Marque os dias em que a tarefa deve rodar:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {DAYS_SHORT.map(d => {
                  const active = customDays.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleCustomDay(d.id)}
                      style={{
                        padding: '8px 0',
                        borderRadius: RADIUS.sm,
                        border: active ? `2px solid ${COLOR.accent}` : `1px solid ${BORDER.soft}`,
                        background: active ? COLOR.accent : COLOR.surface2,
                        color: active ? '#fff' : COLOR.paperInk,
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sub-painel para Mensal */}
          {recType === 'monthly' && (
            <div style={{ background: COLOR.surface1, padding: 12, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperInk }}>Todo dia</span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={e => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                style={{ width: 64, padding: '6px 10px', borderRadius: RADIUS.sm, border: `1px solid ${BORDER.medium}`, fontSize: 13, fontWeight: 800, textAlign: 'center' }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperInk }}>de cada mês</span>
            </div>
          )}

          {/* Box Explicativa da UX */}
          <div style={{
            background: 'rgba(139,94,60,0.08)',
            border: '1px solid rgba(139,94,60,0.2)',
            borderRadius: RADIUS.md,
            padding: '10px 14px',
            fontSize: 12,
            color: COLOR.paperWarm,
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <i className="ti ti-bulb" style={{ color: COLOR.accent, fontSize: 15, marginTop: 2, flexShrink: 0 }} />
            <span><strong>Como funcionará:</strong> {getExplanationText()}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${BORDER.soft}`, paddingTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: RADIUS.md,
              border: `1px solid ${BORDER.medium}`,
              background: COLOR.surface2,
              color: COLOR.paperWarm,
              fontSize: TEXT.bodyCompact,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: FONT.sans,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '9px 22px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLOR.accent,
              color: '#fff',
              fontSize: TEXT.bodyCompact,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(139,94,60,0.3)',
              fontFamily: FONT.sans,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <i className="ti ti-check" />
            <span>Salvar Alterações</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const LabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#7a5c42',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  display: 'block',
  marginBottom: 4,
}

const InputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #ede8dc',
  fontSize: 13,
  outline: 'none',
  background: '#fff',
  color: '#2c1a0e',
}
