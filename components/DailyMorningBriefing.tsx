'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import TeacherLogo, { TeacherOwlAvatar } from '@/components/TeacherLogo'
import { loadChecklistTodos, ChecklistTodo } from '@/lib/checklistManager'
import type { ModuleKey } from '@/app/page'

interface DailyMorningBriefingProps {
  onNavigate: (module: ModuleKey) => void
  currentClassesCount?: number
  nextClassInfo?: { className: string; time: string; room?: string; topic?: string } | null
}

const PEDAGOGICAL_DAILY_QUOTES = [
  '“Ensinar não é transferir conhecimento, mas criar as possibilidades para a sua própria produção ou a sua construção.” — Paulo Freire',
  '“A mente que se abre a uma nova ideia jamais voltará ao seu tamanho original.” — Albert Einstein',
  '“O principal objetivo da educação é criar pessoas capazes de fazer coisas novas e não simplesmente repetir o que outras gerações fizeram.” — Jean Piaget',
  '“Aprender é a única coisa de que a mente nunca se cansa, nunca tem medo e nunca se arrepende.” — Leonardo da Vinci',
  '“Educação não transforma o mundo. Educação muda as pessoas. Pessoas transformam o mundo.” — Paulo Freire',
  '“O educador se eterniza em cada ser que educa.” — Rubem Alves',
  '“A sala de aula viva é aquela onde o erro é acolhido como o início fecundo da aprendizagem.” — Celso Vasconcellos'
]

export default function DailyMorningBriefing({ onNavigate, currentClassesCount, nextClassInfo }: DailyMorningBriefingProps) {
  const [mounted, setMounted] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [greeting, setGreeting] = useState('Bom dia')
  const [dateFormatted, setDateFormatted] = useState('')
  const [dailyQuote, setDailyQuote] = useState('')
  const [portalPendenciesCount, setPortalPendenciesCount] = useState(0)
  const [highPriorityTodos, setHighPriorityTodos] = useState<ChecklistTodo[]>([])

  useEffect(() => {
    setMounted(true)

    // 1. Checa preferência de minimização na sessão atual
    const collapsedPref = sessionStorage.getItem('teacher_briefing_collapsed')
    if (collapsedPref === 'true') setIsCollapsed(true)

    // 2. Saudação baseada na hora
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) setGreeting('Bom dia')
    else if (hour >= 12 && hour < 18) setGreeting('Boa tarde')
    else setGreeting('Boa noite')

    // 3. Data por extenso
    try {
      const now = new Date()
      const str = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
      setDateFormatted(str.charAt(0).toUpperCase() + str.slice(1))
    } catch {
      setDateFormatted('Hoje')
    }

    // 4. Frase do dia baseada no dia do mês
    const dayOfMonth = new Date().getDate()
    setDailyQuote(PEDAGOGICAL_DAILY_QUOTES[dayOfMonth % PEDAGOGICAL_DAILY_QUOTES.length])

    // 5. Lê pendências do portal sincronizadas pela extensão
    try {
      const raw = localStorage.getItem('teacher_portal_pendencies')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setPortalPendenciesCount(parsed.length)
        }
      }
    } catch {}

    // 6. Lê tarefas de alta prioridade ou pendentes
    try {
      const allTodos = loadChecklistTodos()
      const urgent = allTodos.filter(t => !t.done && (t.priority === 'high' || t.category === 'imported' || t.category === 'system_ai'))
      setHighPriorityTodos(urgent.slice(0, 3))
    } catch {}
  }, [])

  const handleToggleCollapse = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    sessionStorage.setItem('teacher_briefing_collapsed', String(next))
  }

  const handleOpenRafinha = (promptText: string) => {
    window.dispatchEvent(new CustomEvent('rafinha:send_text', { detail: promptText }))
    window.dispatchEvent(new CustomEvent('teacher:focus_chat'))
  }

  if (!mounted || isDismissed) return null

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #fffcf7 0%, #faf3eb 100%)',
        border: '1px solid rgba(196, 131, 74, 0.28)',
        borderRadius: RADIUS.xl,
        padding: isCollapsed ? '12px 18px' : '20px 24px',
        marginBottom: 22,
        boxShadow: '0 4px 20px rgba(44, 26, 14, 0.05)',
        position: 'relative',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Barra de Topo do Briefing */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 3,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #e8a85c 0%, #c4834a 100%)',
            boxShadow: '0 2px 8px rgba(196, 131, 74, 0.35)'
          }}>
            <TeacherOwlAvatar size={42} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e', letterSpacing: '-0.01em' }}>
                {greeting}, Professora!
              </h2>
              <span style={{
                background: 'rgba(196, 131, 74, 0.15)',
                color: '#8b5e3c',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Daily Pedagogical Briefing
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7a5c42', fontWeight: 600 }}>
              📅 {dateFormatted}
            </p>
          </div>
        </div>

        {/* Controles de Minimização */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleToggleCollapse}
            title={isCollapsed ? 'Expandir Briefing Matinal' : 'Recolher Briefing'}
            style={{
              padding: '6px 10px',
              borderRadius: RADIUS.md,
              border: '1px solid rgba(139, 115, 85, 0.25)',
              background: '#fff',
              color: '#7a5c42',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <i className={isCollapsed ? 'ti ti-chevron-down' : 'ti ti-chevron-up'} />
            {isCollapsed ? 'Expandir' : 'Recolher'}
          </button>

          <button
            onClick={() => setIsDismissed(true)}
            title="Fechar por hoje"
            style={{
              background: 'none',
              border: 'none',
              color: '#a89078',
              cursor: 'pointer',
              padding: 4,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Conteúdo Expandido do Briefing */}
      {!isCollapsed && (
        <>
          {/* Frase / Insight Pedagógico */}
          <div style={{
            marginTop: 14,
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.75)',
            borderLeft: '3px solid #c4834a',
            borderRadius: '0 8px 8px 0',
            fontSize: 12,
            fontStyle: 'italic',
            color: '#5c3d20',
            lineHeight: 1.45,
          }}>
            {dailyQuote}
          </div>

          {/* Cards de Métricas e Destaques do Dia */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginTop: 14,
            marginBottom: 16,
          }}>
            {/* Card 1: Turmas e Próxima Aula */}
            <div style={{
              background: '#fff',
              border: '1px solid rgba(196, 131, 74, 0.2)',
              borderRadius: RADIUS.lg,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>🎓</span>
                  <strong style={{ fontSize: 13, color: '#2c1a0e' }}>Aulas de Hoje</strong>
                </div>
                {nextClassInfo ? (
                  <p style={{ margin: 0, fontSize: 12, color: '#68452b', lineHeight: 1.4 }}>
                    Próxima aula: <strong style={{ color: '#2c1a0e' }}>{nextClassInfo.className}</strong> às <strong>{nextClassInfo.time}</strong>
                    {nextClassInfo.room && ` (${nextClassInfo.room})`}.
                  </p>
                ) : currentClassesCount && currentClassesCount > 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: '#68452b' }}>
                    Você tem <strong>{currentClassesCount}</strong> {currentClassesCount === 1 ? 'aula agendada' : 'aulas agendadas'} para hoje.
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: '#7a5c42' }}>
                    Nenhuma aula marcada na grade para hoje. Dia ideal para planejamento e estudos!
                  </p>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => onNavigate('lessonstudio')}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#c4834a',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  Ver planos de aula &rarr;
                </button>
              </div>
            </div>

            {/* Card 2: Pendências do Portal Escolar */}
            <div style={{
              background: portalPendenciesCount > 0 ? 'rgba(239, 68, 68, 0.04)' : '#fff',
              border: portalPendenciesCount > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(196, 131, 74, 0.2)',
              borderRadius: RADIUS.lg,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{portalPendenciesCount > 0 ? '⚠️' : '🌐'}</span>
                  <strong style={{ fontSize: 13, color: portalPendenciesCount > 0 ? '#b91c1c' : '#2c1a0e' }}>
                    Portal Escolar
                  </strong>
                </div>
                {portalPendenciesCount > 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: '#991b1b', lineHeight: 1.4 }}>
                    Há <strong>{portalPendenciesCount}</strong> pendências sincronizadas (chamadas ou diários pendentes de envio).
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: '#3d7a4e', lineHeight: 1.4 }}>
                    Tudo em dia com os diários do portal escolar! Nenhuma pendência detectada.
                  </p>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => onNavigate('skills')}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: portalPendenciesCount > 0 ? '#b91c1c' : '#c4834a',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  Sincronizar portal &rarr;
                </button>
              </div>
            </div>

            {/* Card 3: Checklist Prioritário */}
            <div style={{
              background: '#fff',
              border: '1px solid rgba(196, 131, 74, 0.2)',
              borderRadius: RADIUS.lg,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <strong style={{ fontSize: 13, color: '#2c1a0e' }}>Checklist Prioritário</strong>
                </div>
                {highPriorityTodos.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#5c3d20', lineHeight: 1.4 }}>
                    {highPriorityTodos.map(todo => (
                      <li key={todo.id} style={{ marginBottom: 2 }}>
                        {todo.text.length > 38 ? `${todo.text.slice(0, 38)}...` : todo.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: '#7a5c42' }}>
                    Nenhuma tarefa de alta urgência no checklist hoje.
                  </p>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => onNavigate('checklist')}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#c4834a',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  Abrir checklist &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* Barra de Ações Rápidas de 1 Clique */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            paddingTop: 12,
            borderTop: '1px dashed rgba(196, 131, 74, 0.25)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#4a2f17', display: 'flex', alignItems: 'center', gap: 4 }}>
              ⚡ Ações de 1 Clique:
            </span>

            <button
              onClick={() => onNavigate('lessonstudio')}
              style={{
                padding: '7px 13px',
                borderRadius: RADIUS.md,
                border: '1px solid #c4834a',
                background: 'linear-gradient(135deg, #c4834a 0%, #a26432 100%)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: '0 2px 6px rgba(196, 131, 74, 0.25)',
              }}
            >
              <i className="ti ti-book" /> Preparar Próxima Aula
            </button>

            <button
              onClick={() => onNavigate('classroommode')}
              style={{
                padding: '7px 13px',
                borderRadius: RADIUS.md,
                border: '1px solid rgba(139, 115, 85, 0.3)',
                background: '#fff',
                color: '#2c1a0e',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <i className="ti ti-clipboard-check" /> Frequência & Presença
            </button>

            <button
              onClick={() => onNavigate('checklist')}
              style={{
                padding: '7px 13px',
                borderRadius: RADIUS.md,
                border: '1px solid rgba(139, 115, 85, 0.3)',
                background: '#fff',
                color: '#2c1a0e',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <i className="ti ti-checklist" /> Minhas Tarefas
            </button>


            <button
              onClick={() => handleOpenRafinha('Rafinha, faça um resumo pedagógico do meu dia e me ajude a organizar os planos das próximas aulas.')}
              style={{
                padding: '7px 13px',
                borderRadius: RADIUS.md,
                border: '1px solid rgba(196, 131, 74, 0.4)',
                background: 'rgba(196, 131, 74, 0.1)',
                color: '#7a4b22',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <i className="ti ti-sparkles" /> Orientação da Rafinha
            </button>
          </div>
        </>
      )}
    </div>
  )
}
