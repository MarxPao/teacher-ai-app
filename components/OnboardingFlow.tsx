'use client'

import { useState } from 'react'
import { getAllSubjectProfiles } from '@/lib/subjectProfile'
import { updateUserProfile } from '@/lib/supabaseAuth'
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'

interface OnboardingFlowProps {
  teacherName?: string
  onComplete: (subjectId: string) => void
}

const AVAILABLE_SUBJECT_OPTIONS = [
  {
    id: 'english',
    name: 'Língua Inglesa',
    badge: 'Ativo • Cambridge & CEFR',
    icon: 'ti-world',
    color: '#8b5e3c',
    bgLight: '#fffcf8',
    desc: 'Taxonomia ELT oficial (7 categorias), CEFR Gating (A1 a C2), 8 distratores diagnósticos de L1 e rubrica Cambridge 4D.',
    ready: true
  },
  {
    id: 'portuguese',
    name: 'Língua Portuguesa',
    badge: 'Ativo • BNCC & ENEM',
    icon: 'ti-book',
    color: '#c4834a',
    bgLight: '#fffcf8',
    desc: '4 eixos BNCC (Leitura, Produção, Oralidade, Análise), 18 distratores diagnósticos conceituais e rubrica ENEM/EF.',
    ready: true
  },
  {
    id: 'math',
    name: 'Matemática',
    badge: 'Em Breve • Beta',
    icon: 'ti-math-symbols',
    color: '#a08060',
    bgLight: '#faf6f0',
    desc: 'Álgebra, Geometria, Estatística e Probabilidade alinhados à BNCC com resolução passo a passo.',
    ready: false
  },
  {
    id: 'science',
    name: 'Ciências da Natureza',
    badge: 'Em Breve',
    icon: 'ti-atom-2',
    color: '#7a6652',
    bgLight: '#faf6f0',
    desc: 'Física, Química e Biologia contextualizadas para Ensino Fundamental e Médio.',
    ready: false
  }
]

export default function OnboardingFlow({ teacherName, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedSubject, setSelectedSubject] = useState<string>('english')
  
  // Step 2: Primeira Turma (Opcional)
  const [className, setClassName] = useState('')
  const [classGrade, setClassGrade] = useState('6º Fund.')
  const [classSubject, setClassSubject] = useState('english')

  const handleFinish = (createClass: boolean) => {
    try {
      // 1. Gravar configurações principais do professor
      const rawSettings = localStorage.getItem('teacher_settings')
      const settings = rawSettings ? JSON.parse(rawSettings) : {}
      settings.defaultSubject = selectedSubject
      settings.onboardingCompleted = true
      settings.onboardingCompletedAt = new Date().toISOString()
      localStorage.setItem('teacher_settings', JSON.stringify(settings))

      // 2. Se optou por criar a turma inicial
      if (createClass && className.trim()) {
        const rawClasses = localStorage.getItem('teacher_classes')
        const classes = rawClasses ? JSON.parse(rawClasses) : []
        const newClass = {
          id: `class_${Date.now()}`,
          name: className.trim(),
          grade: classGrade,
          subject: classSubject || selectedSubject,
          year: new Date().getFullYear().toString(),
          createdAt: Date.now()
        }
        classes.push(newClass)
        localStorage.setItem('teacher_classes', JSON.stringify(classes))
        localStorage.setItem('teacher_active_class_subject', newClass.subject)
      }

      // 3. Sincroniza com o perfil no Supabase
      updateUserProfile({ defaultSubject: selectedSubject }).catch(() => {})

      window.dispatchEvent(new Event('teacher:data_changed'))
      onComplete(selectedSubject)
    } catch {
      onComplete(selectedSubject)
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-10"
      style={{
        backgroundColor: '#fdf8f2',
        backgroundImage: `
          radial-gradient(circle at 10% 15%, rgba(196,131,74,0.07) 0%, transparent 40%),
          radial-gradient(circle at 90% 85%, rgba(139,94,60,0.06) 0%, transparent 45%)
        `,
        fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
        color: '#2c1a0e'
      }}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-8 md:p-12"
        style={{
          border: '1px solid rgba(139,115,85,0.2)',
          boxShadow: '0 16px 48px rgba(44,26,14,0.09)'
        }}
      >
        {/* Header do Onboarding */}
        <div className="text-center max-w-xl mx-auto mb-8">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold mb-3"
            style={{
              background: 'rgba(139,94,60,0.1)',
              color: '#8b5e3c',
              border: '1px solid rgba(139,94,60,0.2)'
            }}
          >
            <i className="ti ti-sparkles" />
            <span>Passo {step} de 2 — Configuração Inicial</span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: 28,
              fontWeight: 600,
              color: '#2c1a0e',
              lineHeight: 1.2
            }}
          >
            {step === 1 ? `Boas-vindas, ${teacherName || 'Professor(a)'}!` : 'Configure sua Primeira Turma'}
          </h2>
          <p style={{ fontSize: 13.5, color: '#7a6652', marginTop: 6, lineHeight: 1.5 }}>
            {step === 1
              ? 'Qual é a sua matéria principal de ensino? A Rafinha e os geradores pedagógicos serão calibrados com base na sua disciplina.'
              : 'Você pode cadastrar uma turma agora ou pular e organizar tudo diretamente pelo módulo de Turmas.'}
          </p>
        </div>

        {/* ETAPA 1: ESCOLHA DA MATÉRIA */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {AVAILABLE_SUBJECT_OPTIONS.map((sub) => {
                const isSelected = selectedSubject === sub.id
                return (
                  <div
                    key={sub.id}
                    onClick={() => {
                      if (sub.ready) {
                        setSelectedSubject(sub.id)
                        setClassSubject(sub.id)
                      }
                    }}
                    className={`p-5 rounded-2xl transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? 'shadow-md scale-[1.01]'
                        : sub.ready
                        ? 'hover:border-[#8b5e3c]/50'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                    style={{
                      background: isSelected ? '#fffcf8' : sub.bgLight,
                      border: isSelected
                        ? '2px solid #8b5e3c'
                        : '1px solid rgba(139,115,85,0.2)'
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                          style={{
                            background: isSelected
                              ? 'linear-gradient(135deg, #8b5e3c 0%, #6f472a 100%)'
                              : 'rgba(139,115,85,0.2)',
                            color: isSelected ? '#fff' : '#8b5e3c'
                          }}
                        >
                          <i className={`ti ${sub.icon} text-xl`} />
                        </div>
                        <span
                          className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                          style={{
                            background: sub.ready ? 'rgba(139,94,60,0.1)' : '#f0e8d8',
                            color: sub.ready ? '#8b5e3c' : '#a08060',
                            border: sub.ready ? '1px solid rgba(139,94,60,0.2)' : 'none'
                          }}
                        >
                          {sub.badge}
                        </span>
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e' }}>
                        {sub.name}
                      </h3>
                      <p style={{ fontSize: 12, color: '#7a6652', marginTop: 4, lineHeight: 1.45 }}>
                        {sub.desc}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#8b5e3c]">
                        <i className="ti ti-check" />
                        <span>Matéria Selecionada</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div
              className="p-4 rounded-xl text-xs flex items-start gap-3"
              style={{
                background: '#fdf8f2',
                border: '1px solid rgba(139,115,85,0.2)',
                color: '#5c3d24'
              }}
            >
              <i className="ti ti-info-circle text-base text-[#8b5e3c] shrink-0 mt-0.5" />
              <span>
                <strong>Flexibilidade Docente:</strong> Se você leciona mais de uma disciplina (ex: Inglês e Língua Portuguesa), poderá alternar ou definir matérias diferentes para cada turma a qualquer momento.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: '13px 28px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, #8b5e3c 0%, #6f472a 100%)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 6px 20px rgba(139,94,60,0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Avançar para Turmas</span>
                <i className="ti ti-arrow-right" />
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 2: PRIMEIRA TURMA (OPCIONAL) */}
        {step === 2 && (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="space-y-4">
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: '#7a6652',
                    marginBottom: 6
                  }}
                >
                  Nome da Turma
                </label>
                <input
                  type="text"
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder="Ex: 6º Ano A, 9º Ano B, Turma Avançada..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(139,115,85,0.25)',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 13.5,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: '#7a6652',
                      marginBottom: 6
                    }}
                  >
                    Série / Ano
                  </label>
                  <select
                    value={classGrade}
                    onChange={e => setClassGrade(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#fff',
                      color: '#2c1a0e',
                      fontSize: 13.5,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="6º Fund.">6º Ano (Fund.)</option>
                    <option value="7º Fund.">7º Ano (Fund.)</option>
                    <option value="8º Fund.">8º Ano (Fund.)</option>
                    <option value="9º Fund.">9º Ano (Fund.)</option>
                    <option value="1º Médio">1º Ano (Médio)</option>
                    <option value="2º Médio">2º Ano (Médio)</option>
                    <option value="3º Médio">3º Ano (Médio)</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: '#7a6652',
                      marginBottom: 6
                    }}
                  >
                    Matéria desta Turma
                  </label>
                  <select
                    value={classSubject}
                    onChange={e => setClassSubject(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#fff',
                      color: '#2c1a0e',
                      fontSize: 13.5,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="english">Língua Inglesa</option>
                    <option value="portuguese">Língua Portuguesa</option>
                  </select>
                </div>
              </div>
            </div>

            <div
              className="flex items-center justify-between pt-6"
              style={{ borderTop: '1px solid rgba(139,115,85,0.15)' }}
            >
              <button
                onClick={() => setStep(1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#7a6652',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <i className="ti ti-arrow-left" />
                <span>Voltar</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleFinish(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: '1px solid rgba(139,115,85,0.2)',
                    background: '#f5efe6',
                    color: '#5c3d24',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Pular por enquanto
                </button>
                <button
                  onClick={() => handleFinish(true)}
                  style={{
                    padding: '11px 22px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #8b5e3c 0%, #6f472a 100%)',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 14px rgba(139,94,60,0.2)'
                  }}
                >
                  <span>Concluir & Entrar</span>
                  <i className="ti ti-check" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
