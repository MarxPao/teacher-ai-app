'use client'

import React, { useState } from 'react'
import { FONT, RADIUS } from '@/styles/tokens'

interface OnboardingWizardProps {
  open: boolean
  onComplete: () => void
}

/**
 * Onboarding Interativo Passo a Passo (#18).
 * 4 passos: Escola → Turma → Alunos → Primeira Ação.
 */
export default function OnboardingWizard({ open, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1)
  const [schoolName, setSchoolName] = useState('')
  const [className, setClassName] = useState('')
  const [subject, setSubject] = useState('Língua Inglesa')
  const [studentsText, setStudentsText] = useState('Ana Santos\nPedro Henrique\nMariana Lima')

  if (!open) return null

  const handleNext = () => {
    if (step < 4) {
      setStep((s) => s + 1)
    } else {
      // Salva dados iniciais
      try {
        if (schoolName) {
          const cfg = JSON.parse(localStorage.getItem('teacher_cfg') || '{}')
          cfg.school = schoolName
          localStorage.setItem('teacher_cfg', JSON.stringify(cfg))
        }
        if (className) {
          const classes = JSON.parse(localStorage.getItem('teacher_classes') || '[]')
          classes.push({ id: `cls_${Date.now()}`, name: className, subject })
          localStorage.setItem('teacher_classes', JSON.stringify(classes))
        }
        if (studentsText) {
          const names = studentsText.split('\n').map((n) => n.trim()).filter(Boolean)
          const students = names.map((name, i) => ({
            id: `std_${Date.now()}_${i}`,
            name,
            className: className || 'Turma A',
            avgGrade: 8.0,
          }))
          localStorage.setItem('teacher_students', JSON.stringify(students))
        }
        localStorage.setItem('teacher_onboarding_wizard_completed', 'true')
      } catch {}
      onComplete()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,17,10,0.7)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          background: '#fffcf8',
          borderRadius: RADIUS.xl,
          padding: '36px 40px',
          maxWidth: 580,
          width: '100%',
          boxShadow: '0 24px 64px rgba(28,17,10,0.3)',
          border: '1px solid rgba(139,115,85,0.2)',
        }}
      >
        {/* Progress Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                width: i === step ? 28 : 8,
                height: 8,
                borderRadius: 4,
                background: i === step ? '#8b5e3c' : i < step ? '#3d7a4e' : 'rgba(139,115,85,0.2)',
                transition: 'all 0.25s ease',
              }}
            />
          ))}
        </div>

        {/* Step 1: Escola */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <span style={{ fontSize: 40 }}>🏫</span>
              <h3 style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 700, color: '#2c1a0e', margin: '8px 0 4px' }}>
                Bem-vindo(a) ao Teacher AI!
              </h3>
              <p style={{ fontSize: 13.5, color: '#7a5c42', margin: 0 }}>
                Em qual escola ou instituição você leciona?
              </p>
            </div>
            <input
              type="text"
              placeholder="Ex: Colégio Santo Agostinho"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid #d5c8bb',
                fontSize: 14,
                outline: 'none',
                marginBottom: 20,
              }}
            />
          </div>
        )}

        {/* Step 2: Turma e Disciplina */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <span style={{ fontSize: 40 }}>👥</span>
              <h3 style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 700, color: '#2c1a0e', margin: '8px 0 4px' }}>
                Sua Primeira Turma
              </h3>
              <p style={{ fontSize: 13.5, color: '#7a5c42', margin: 0 }}>
                Qual turma você gostaria de cadastrar primeiro?
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <input
                type="text"
                placeholder="Nome da Turma (ex: 9º Ano B)"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #d5c8bb', fontSize: 14 }}
              />
              <input
                type="text"
                placeholder="Disciplina (ex: Língua Inglesa)"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #d5c8bb', fontSize: 14 }}
              />
            </div>
          </div>
        )}

        {/* Step 3: Alunos */}
        {step === 3 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <span style={{ fontSize: 40 }}>📝</span>
              <h3 style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 700, color: '#2c1a0e', margin: '8px 0 4px' }}>
                Lista de Alunos
              </h3>
              <p style={{ fontSize: 13.5, color: '#7a5c42', margin: 0 }}>
                Cole ou digite os nomes dos alunos (um por linha):
              </p>
            </div>
            <textarea
              rows={4}
              value={studentsText}
              onChange={(e) => setStudentsText(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid #d5c8bb',
                fontSize: 13.5,
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                marginBottom: 20,
              }}
            />
          </div>
        )}

        {/* Step 4: Pronto para começar */}
        {step === 4 && (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 48 }}>🎉</span>
            <h3 style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 700, color: '#2c1a0e', margin: '12px 0 6px' }}>
              Tudo pronto para transformar suas aulas!
            </h3>
            <p style={{ fontSize: 13.5, color: '#7a5c42', lineHeight: 1.5, margin: 0 }}>
              Sua estrutura foi configurada com sucesso. Você já pode criar provas com gabarito, corrigir redações por foto e enviar comunicados em 1 clique.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid #d5c8bb',
                background: '#fff',
                color: '#7a5c42',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Voltar
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleNext}
            style={{
              padding: '12px 28px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #8b5e3c, #5c3a21)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(139,94,60,0.3)',
            }}
          >
            {step === 4 ? 'Explorar Meu App 🚀' : 'Próximo →'}
          </button>
        </div>
      </div>
    </div>
  )
}
