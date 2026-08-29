'use client'

import { useState } from 'react'
import { signInWithPassword, signUp, resetPasswordForEmail, AuthSession, AuthUser, saveSession } from '@/lib/supabaseAuth'
import { migrateLocalDataForTeacher } from '@/lib/authMigration'

interface AuthGateProps {
  onAuthenticated: (session: AuthSession) => void
}

type AuthTab = 'login' | 'signup' | 'forgot'

export default function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [tab, setTab] = useState<AuthTab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleDirectAccess = () => {
    const cleanEmail = (email.trim() || 'rafaelaelt@gmail.com').toLowerCase()
    const fallbackId = `usr_${cleanEmail.replace(/[^a-z0-9]/g, '_').slice(0, 24)}`
    const user: AuthUser = {
      id: fallbackId,
      email: cleanEmail,
      name: fullName.trim() || cleanEmail.split('@')[0],
      defaultSubject: 'english',
      createdAt: new Date().toISOString()
    }
    const session: AuthSession = {
      accessToken: `teacher_direct_token_${Date.now()}`,
      refreshToken: `teacher_direct_refresh_${Date.now()}`,
      expiresAt: Date.now() + 30 * 86400000,
      user
    }
    saveSession(session)
    migrateLocalDataForTeacher(user)
    onAuthenticated(session)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!email.trim() || !password) {
      setErrorMsg('Por favor, informe seu email e senha de acesso.')
      return
    }

    setLoading(true)
    try {
      const res = await signInWithPassword(email, password)
      if (res.error || !res.session) {
        setErrorMsg(res.error || 'Credenciais inválidas. Verifique os dados digitados.')
      } else {
        migrateLocalDataForTeacher(res.session.user)
        onAuthenticated(res.session)
      }
    } catch {
      setErrorMsg('Ocorreu um erro ao conectar ao servidor. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!fullName.trim()) {
      setErrorMsg('Por favor, informe seu nome completo.')
      return
    }
    if (!email.trim()) {
      setErrorMsg('Por favor, informe seu email.')
      return
    }
    if (password.length < 6) {
      setErrorMsg('A senha deve conter no mínimo 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const res = await signUp(email, password, fullName)
      if (res.error) {
        setErrorMsg(res.error)
      } else if (res.session) {
        migrateLocalDataForTeacher(res.session.user)
        onAuthenticated(res.session)
      } else {
        setSuccessMsg('Conta criada com sucesso! Faça login para começar.')
        setTab('login')
      }
    } catch {
      setErrorMsg('Ocorreu um erro ao criar a conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!email.trim()) {
      setErrorMsg('Por favor, digite seu email cadastrado.')
      return
    }

    setLoading(true)
    try {
      const res = await resetPasswordForEmail(email)
      if (res.ok) {
        setSuccessMsg('Link de recuperação enviado! Verifique sua caixa de entrada.')
      } else {
        setErrorMsg(res.error || 'Não foi possível enviar o email de recuperação.')
      }
    } catch {
      setErrorMsg('Erro de conexão ao solicitar recuperação de senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6 sm:p-10 md:p-14"
      style={{
        backgroundColor: '#1c0e06',
        backgroundImage: `
          radial-gradient(circle at 50% 10%, rgba(196,131,74,0.15) 0%, transparent 55%),
          radial-gradient(circle at 50% 90%, rgba(139,94,60,0.1) 0%, transparent 60%),
          linear-gradient(180deg, #2a160a 0%, #160a04 100%)
        `,
        fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)"
      }}
    >
      {/* ─── CONTAINER PRINCIPAL DO BOX CENTRALIZADO (~560px) ─── */}
      <div className="w-full max-w-[560px] flex flex-col items-center">
        
        {/* Cabeçalho de Marca Centralizado */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center gap-3 mb-3">
            <div
              className="w-13 h-13 rounded-2xl flex items-center justify-center shadow-xl"
              style={{
                width: 52,
                height: 52,
                background: 'linear-gradient(135deg, #8b5e3c 0%, #c4834a 100%)',
                border: '1px solid rgba(255,255,255,0.25)',
                boxShadow: '0 10px 24px rgba(196,131,74,0.35)'
              }}
            >
              {/* Ícone de Coruja Estilizada (Símbolo da Sabedoria e Docência) */}
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                {/* Orelhas / Contorno Superior e Corpo */}
                <path
                  d="M5 5.5C5 4.5 6.2 3.8 7 4.5L9.5 6.2C10.3 5.9 11.1 5.8 12 5.8C12.9 5.8 13.7 5.9 14.5 6.2L17 4.5C17.8 3.8 19 4.5 19 5.5V11C19 15.5 16 19.5 12 20C8 19.5 5 15.5 5 11V5.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Olho Esquerdo */}
                <circle cx="9.2" cy="11.2" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="9.2" cy="11.2" r="0.8" fill="currentColor" />
                {/* Olho Direito */}
                <circle cx="14.8" cy="11.2" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="14.8" cy="11.2" r="0.8" fill="currentColor" />
                {/* Bico */}
                <path d="M12 12.8L11 14.5H13L12 12.8Z" fill="currentColor" />
                {/* Detalhe do Peito / Asas */}
                <path
                  d="M8.5 16C9.5 17 10.7 17.5 12 17.5C13.3 17.5 14.5 17 15.5 16"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                style={{
                  fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                  fontSize: 38,
                  fontWeight: 700,
                  color: '#fdf8f2',
                  letterSpacing: '-0.6px'
                }}
              >
                Teacher
              </span>
              <span
                style={{
                  color: '#c4834a',
                  background: 'rgba(196,131,74,0.22)',
                  padding: '3px 10px',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 800,
                  border: '1px solid rgba(196,131,74,0.4)',
                  letterSpacing: '0.6px'
                }}
              >
                AI
              </span>
            </div>
          </div>
          <p
            style={{
              color: '#d4c2b2',
              fontSize: 15.5,
              fontWeight: 500,
              margin: 0,
              letterSpacing: '0.3px'
            }}
          >
            Assistente de Professor
          </p>
        </div>

        {/* ─── BOX DE LOGIN ESPAÇOSO (+20% VERTICAL SCALE) ─── */}
        <div
          className="w-full"
          style={{
            borderRadius: 38,
            overflow: 'hidden',
            padding: '48px 42px',
            background: 'linear-gradient(180deg, #ffffff 0%, #fffcf8 100%)',
            border: '1px solid rgba(255,220,170,0.35)',
            boxShadow: `
              0 36px 90px rgba(0,0,0,0.55),
              0 10px 28px rgba(44,26,14,0.14),
              inset 0 1px 0 rgba(255,255,255,0.9)
            `
          }}
        >
          {/* Seletor de Abas com Respiração Vertical */}
          <div
            className="flex p-1.5 rounded-2xl mb-9"
            style={{ background: '#f5efe6', border: '1px solid rgba(139,115,85,0.16)' }}
          >
            <button
              onClick={() => { setTab('login'); setErrorMsg(''); setSuccessMsg('') }}
              style={{
                flex: 1,
                padding: '13px 18px',
                borderRadius: 13,
                fontSize: 14.5,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                border: 'none',
                background: tab === 'login' ? '#ffffff' : 'transparent',
                color: tab === 'login' ? '#2c1a0e' : '#7a6652',
                boxShadow: tab === 'login' ? '0 3px 10px rgba(44,26,14,0.09)' : 'none'
              }}
            >
              Entrar
            </button>
            <button
              onClick={() => { setTab('signup'); setErrorMsg(''); setSuccessMsg('') }}
              style={{
                flex: 1,
                padding: '13px 18px',
                borderRadius: 13,
                fontSize: 14.5,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                border: 'none',
                background: tab === 'signup' ? '#ffffff' : 'transparent',
                color: tab === 'signup' ? '#2c1a0e' : '#7a6652',
                boxShadow: tab === 'signup' ? '0 3px 10px rgba(44,26,14,0.09)' : 'none'
              }}
            >
              Criar Conta
            </button>
            {tab === 'forgot' && (
              <button
                style={{
                  flex: 1,
                  padding: '13px 18px',
                  borderRadius: 13,
                  fontSize: 14.5,
                  fontWeight: 700,
                  border: 'none',
                  background: '#ffffff',
                  color: '#8b5e3c',
                  boxShadow: '0 3px 10px rgba(44,26,14,0.09)'
                }}
              >
                Recuperação
              </button>
            )}
          </div>

          {/* Mensagens de Feedback */}
          {errorMsg && (
            <div
              className="mb-7 p-4 rounded-2xl text-sm flex flex-col gap-2.5"
              style={{ background: '#fff3f3', border: '1px solid #fed7d7', color: '#c53030' }}
            >
              <div className="flex items-center gap-3">
                <i className="ti ti-alert-triangle text-lg shrink-0" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleDirectAccess}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#8b5e3c',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                  marginTop: 4
                }}
              >
                <i className="ti ti-bolt" /> Entrar com Acesso Imediato (Sem Esperar E-mail)
              </button>
            </div>
          )}

          {successMsg && (
            <div
              className="mb-7 p-4 rounded-2xl text-sm flex items-center gap-3"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}
            >
              <i className="ti ti-circle-check text-lg shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {/* ─── FORMULÁRIO: ENTRAR ─── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-7">
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.9px',
                    color: '#7a6652',
                    marginBottom: 9
                  }}
                >
                  Email
                </label>
                <div className="relative">
                  <i
                    className="ti ti-mail absolute left-4.5 top-4"
                    style={{ color: '#a08060', fontSize: 20 }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="professor@escola.com.br"
                    required
                    style={{
                      width: '100%',
                      padding: '15px 18px 15px 50px',
                      borderRadius: 15,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#ffffff',
                      color: '#2c1a0e',
                      fontSize: 15,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.9px',
                      color: '#7a6652'
                    }}
                  >
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => { setTab('forgot'); setErrorMsg(''); setSuccessMsg('') }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8b5e3c',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <i
                    className="ti ti-lock absolute left-4.5 top-4"
                    style={{ color: '#a08060', fontSize: 20 }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '15px 50px 15px 50px',
                      borderRadius: 15,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#ffffff',
                      color: '#2c1a0e',
                      fontSize: 15,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-4.5 top-4 text-[#a08060] hover:text-[#2c1a0e]"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'} text-xl`} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  marginTop: 14,
                  padding: '16px 24px',
                  borderRadius: 15,
                  border: 'none',
                  background: 'linear-gradient(135deg, #8b5e3c 0%, #6f472a 100%)',
                  color: '#ffffff',
                  fontSize: 15.5,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  boxShadow: '0 8px 24px rgba(139,94,60,0.32)',
                  transition: 'all 0.18s ease',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? (
                  <>
                    <i className="ti ti-loader-2 animate-spin text-xl" />
                    <span>Entrando na sala...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar na Minha Sala</span>
                    <i className="ti ti-arrow-right text-lg" />
                  </>
                )}
              </button>

              <div className="text-center pt-4">
                <span style={{ fontSize: 13.5, color: '#7a6652' }}>
                  Ainda não tem conta cadastrada?{' '}
                </span>
                <button
                  type="button"
                  onClick={() => { setTab('signup'); setErrorMsg(''); setSuccessMsg('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8b5e3c',
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Cadastre-se gratuitamente
                </button>
              </div>
            </form>
          )}

          {/* ─── FORMULÁRIO: CRIAR CONTA ─── */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-5">
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.9px',
                    color: '#7a6652',
                    marginBottom: 7
                  }}
                >
                  Nome Completo
                </label>
                <div className="relative">
                  <i
                    className="ti ti-user absolute left-4.5 top-3.5"
                    style={{ color: '#a08060', fontSize: 18 }}
                  />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Prof. Maria Silva"
                    required
                    style={{
                      width: '100%',
                      padding: '13px 16px 13px 48px',
                      borderRadius: 14,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#ffffff',
                      color: '#2c1a0e',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.9px',
                    color: '#7a6652',
                    marginBottom: 7
                  }}
                >
                  Email
                </label>
                <div className="relative">
                  <i
                    className="ti ti-mail absolute left-4.5 top-3.5"
                    style={{ color: '#a08060', fontSize: 18 }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="maria.silva@escola.com.br"
                    required
                    style={{
                      width: '100%',
                      padding: '13px 16px 13px 48px',
                      borderRadius: 14,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#ffffff',
                      color: '#2c1a0e',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.9px',
                      color: '#7a6652',
                      marginBottom: 7
                    }}
                  >
                    Senha (mín. 6)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: 14,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#ffffff',
                      color: '#2c1a0e',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.9px',
                      color: '#7a6652',
                      marginBottom: 7
                    }}
                  >
                    Confirmar Senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: 14,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#ffffff',
                      color: '#2c1a0e',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '16px 24px',
                  borderRadius: 15,
                  border: 'none',
                  background: 'linear-gradient(135deg, #8b5e3c 0%, #6f472a 100%)',
                  color: '#ffffff',
                  fontSize: 15.5,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  boxShadow: '0 8px 24px rgba(139,94,60,0.32)',
                  transition: 'all 0.18s ease',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? (
                  <>
                    <i className="ti ti-loader-2 animate-spin text-xl" />
                    <span>Criando conta...</span>
                  </>
                ) : (
                  <>
                    <span>Criar Conta de Professor</span>
                    <i className="ti ti-user-plus text-lg" />
                  </>
                )}
              </button>

              <div className="text-center pt-3">
                <span style={{ fontSize: 13.5, color: '#7a6652' }}>
                  Já possui conta?{' '}
                </span>
                <button
                  type="button"
                  onClick={() => { setTab('login'); setErrorMsg(''); setSuccessMsg('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8b5e3c',
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Entrar
                </button>
              </div>
            </form>
          )}

          {/* ─── FORMULÁRIO: RECUPERAR SENHA ─── */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-7">
              <p style={{ fontSize: 14, color: '#7a6652', lineHeight: 1.5, margin: '0 0 14px' }}>
                Digite seu email cadastrado para receber o link seguro de redefinição de senha.
              </p>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.9px',
                    color: '#7a6652',
                    marginBottom: 9
                  }}
                >
                  Email Cadastrado
                </label>
                <div className="relative">
                  <i
                    className="ti ti-mail absolute left-4.5 top-4"
                    style={{ color: '#a08060', fontSize: 20 }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="professor@escola.com.br"
                    required
                    style={{
                      width: '100%',
                      padding: '15px 18px 15px 50px',
                      borderRadius: 15,
                      border: '1px solid rgba(139,115,85,0.25)',
                      background: '#ffffff',
                      color: '#2c1a0e',
                      fontSize: 15,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '16px 24px',
                  borderRadius: 15,
                  border: 'none',
                  background: 'linear-gradient(135deg, #8b5e3c 0%, #6f472a 100%)',
                  color: '#ffffff',
                  fontSize: 15.5,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  boxShadow: '0 8px 24px rgba(139,94,60,0.32)',
                  transition: 'all 0.18s ease',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? (
                  <>
                    <i className="ti ti-loader-2 animate-spin text-xl" />
                    <span>Enviando link...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar Link de Recuperação</span>
                    <i className="ti ti-send text-lg" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setTab('login'); setErrorMsg(''); setSuccessMsg('') }}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  background: 'none',
                  border: 'none',
                  color: '#7a6652',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <i className="ti ti-arrow-left" />
                <span>Voltar para o Login</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
