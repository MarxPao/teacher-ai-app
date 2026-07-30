'use client'

import { useState, useEffect } from 'react'

interface QuizQuestion {
  id: string
  text: string
  options: [string, string, string, string]
  correctIdx: number
}

interface PlayerScore {
  name: string
  score: number
  streak: number
}

const SAMPLE_QUIZ: QuizQuestion[] = [
  {
    id: 'q1',
    text: 'Have you ever _____ to London?',
    options: ['been', 'went', 'go', 'going'],
    correctIdx: 0,
  },
  {
    id: 'q2',
    text: 'She _____ English for five years.',
    options: ['is studying', 'has studied', 'study', 'studied'],
    correctIdx: 1,
  },
  {
    id: 'q3',
    text: 'Which sentence is CORRECT in Cambridge standard?',
    options: [
      'I didn’t saw him yesterday.',
      'I haven’t seen him yet.',
      'I haven’t saw him yet.',
      'I saw not him yesterday.'
    ],
    correctIdx: 1,
  },
]

export default function LiveQuizModule() {
  const [gameState, setGameState] = useState<'lobby' | 'question' | 'leaderboard' | 'podium'>('lobby')
  const [pin, setPin] = useState('8492')
  const [quizTitle, setQuizTitle] = useState('Present Perfect & Life Experiences Challenge')
  const [className, setClassName] = useState('9º Ano B')

  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(20)
  const [timerRunning, setTimerRunning] = useState(false)

  const [players, setPlayers] = useState<PlayerScore[]>([
    { name: 'Ana Júlia ⚡', score: 1850, streak: 3 },
    { name: 'Pedro 🎯', score: 1720, streak: 2 },
    { name: 'Lucas 🚀', score: 1540, streak: 1 },
    { name: 'Mariana 💡', score: 1490, streak: 2 },
    { name: 'Gabriel 🌟', score: 1300, streak: 1 },
  ])

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (timerRunning && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(t => t - 1), 1000)
    } else if (timeLeft === 0 && timerRunning) {
      setTimerRunning(false)
      setGameState('leaderboard')
    }
    return () => clearInterval(timer)
  }, [timerRunning, timeLeft])

  const handleStartGame = () => {
    setCurrentQIdx(0)
    setTimeLeft(20)
    setTimerRunning(true)
    setGameState('question')
  }

  const handleNextQuestion = () => {
    if (currentQIdx + 1 < SAMPLE_QUIZ.length) {
      setCurrentQIdx(q => q + 1)
      setTimeLeft(20)
      setTimerRunning(true)
      setGameState('question')
    } else {
      setGameState('podium')
    }
  }

  const handleSyncGradebook = () => {
    alert(`🎉 Resultados do Quiz ao Vivo sincronizados com o Gradebook da Turma ${className}!`)
  }

  const q = SAMPLE_QUIZ[currentQIdx]

  return (
    <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 600, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px', margin: 0 }}>
              Live Quiz Gamificado 🎮
            </h1>
            <span style={{ background: '#cb4b16', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase' }}>
              Modo TV / Projetor de Sala
            </span>
          </div>
          <p style={{ color: '#586e75', fontSize: 14, marginTop: 4 }}>
            Projete o jogo estilo Kahoot/Quizizz na TV da sala de aula. Alunos entram pelo celular com PIN de 4 dígitos.
          </p>
        </div>

        {gameState === 'podium' && (
          <button
            onClick={handleSyncGradebook}
            style={{
              padding: '12px 20px', borderRadius: 12, border: 'none',
              background: '#859900', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 14px rgba(133,153,0,0.25)',
            }}
          >
            <i className="ti ti-chart-bar" /> 📊 Lançar Pontos no Gradebook
          </button>
        )}
      </div>

      {/* ─── LOBBY DO JOGO (TELA INICIAL DE ENTRADA) ───────────────────────────── */}
      {gameState === 'lobby' && (
        <div style={{ flex: 1, background: '#073642', color: '#fdf6e3', borderRadius: 24, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 40px rgba(0,43,54,0.2)', textAlign: 'center' }}>
          <span style={{ background: '#b58900', color: '#073642', fontSize: 12, fontWeight: 800, padding: '4px 14px', borderRadius: 16, textTransform: 'uppercase', marginBottom: 16 }}>
            ENTRE EM TEACHERAI.APP/GAME
          </span>

          <h2 style={{ fontSize: 48, fontWeight: 800, margin: '0 0 10px 0', fontFamily: 'Georgia, serif' }}>
            PIN DO JOGO: <span style={{ color: '#b58900', textDecoration: 'underline' }}>{pin}</span>
          </h2>

          <p style={{ fontSize: 18, color: '#93a1a1', marginBottom: 32 }}>
            {quizTitle} — <strong>Turma {className}</strong>
          </p>

          {/* Lista de Alunos Conectados */}
          <div style={{ width: '100%', maxWidth: 700, background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#93a1a1', textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>
              👥 {players.length} Alunos Conectados no Lobby:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {players.map(p => (
                <span key={p.name} style={{ background: '#eee8d5', color: '#073642', padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700 }}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartGame}
            style={{
              padding: '16px 48px', borderRadius: 16, border: 'none',
              background: '#cb4b16', color: '#fff', fontSize: 20, fontWeight: 800,
              cursor: 'pointer', boxShadow: '0 6px 20px rgba(203,75,22,0.4)',
              transition: 'transform 0.2s',
            }}
          >
            🚀 INICIAR QUIZ NA TV
          </button>
        </div>
      )}

      {/* ─── TELA DE PERGUNTA EM ANDAMENTO ─────────────────────────────────────── */}
      {gameState === 'question' && (
        <div style={{ flex: 1, background: '#fff', borderRadius: 24, padding: 36, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(0,43,54,0.05)' }}>
          {/* Timer e Pergunta */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#586e75' }}>
                Questão {currentQIdx + 1} de {SAMPLE_QUIZ.length}
              </span>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: timeLeft <= 5 ? '#dc322f' : '#073642', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, animation: timeLeft <= 5 ? 'pulse 1s infinite' : 'none' }}>
                {timeLeft}s
              </div>
            </div>

            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#073642', textAlign: 'center', margin: '20px 0 40px 0', fontFamily: 'Georgia, serif' }}>
              "{q.text}"
            </h2>
          </div>

          {/* As 4 Opções Coloridas (Estilo Kahoot) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#dc322f', color: '#fff', padding: 24, borderRadius: 16, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>▲</span> A) {q.options[0]}
            </div>
            <div style={{ background: '#268bd2', color: '#fff', padding: 24, borderRadius: 16, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>◆</span> B) {q.options[1]}
            </div>
            <div style={{ background: '#b58900', color: '#fff', padding: 24, borderRadius: 16, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>●</span> C) {q.options[2]}
            </div>
            <div style={{ background: '#859900', color: '#fff', padding: 24, borderRadius: 16, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>■</span> D) {q.options[3]}
            </div>
          </div>
        </div>
      )}

      {/* ─── LEADERBOARD PARCIAL DA RODADA ─────────────────────────────────────── */}
      {gameState === 'leaderboard' && (
        <div style={{ flex: 1, background: '#fff', borderRadius: 24, padding: 36, border: '1px solid #ede8dc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <span style={{ background: '#eee8d5', color: '#586e75', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 12 }}>
                RESPOSTA CORRETA: {q.options[q.correctIdx]}
              </span>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: '#073642', margin: '8px 0 0 0' }}>
                Placar Parcial da Turma
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 600, margin: '0 auto' }}>
              {players.map((p, i) => (
                <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: i === 0 ? '#fff9e6' : '#f5f0e8', border: i === 0 ? '2px solid #b58900' : '1px solid #e8e0d0', borderRadius: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#073642' }}>
                    {i + 1}º {p.name}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#b58900' }}>
                    {p.score + (i === 0 ? 350 : 200)} pts
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button
              onClick={handleNextQuestion}
              style={{ padding: '14px 36px', borderRadius: 12, border: 'none', background: '#073642', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            >
              Próxima Questão ➔
            </button>
          </div>
        </div>
      )}

      {/* ─── PODIUM FINAL DE VENCEDORES ────────────────────────────────────────── */}
      {gameState === 'podium' && (
        <div style={{ flex: 1, background: '#073642', color: '#fdf6e3', borderRadius: 24, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: '#b58900', margin: '0 0 24px 0', fontFamily: 'Georgia, serif' }}>
            🏆 PÓDIO DOS CAMPEÕES DO QUIZ!
          </h2>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 40 }}>
            {/* 2º Lugar */}
            <div style={{ width: 140, background: '#93a1a1', height: 160, borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <span style={{ fontSize: 24 }}>🥈</span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Pedro</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>1.920 pts</span>
            </div>

            {/* 1º Lugar */}
            <div style={{ width: 160, background: '#b58900', height: 220, borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 0 30px rgba(181,137,0,0.5)' }}>
              <span style={{ fontSize: 36 }}>👑</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>Ana Júlia</span>
              <span style={{ fontSize: 13, opacity: 0.9 }}>2.200 pts</span>
            </div>

            {/* 3º Lugar */}
            <div style={{ width: 140, background: '#cb4b16', height: 130, borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <span style={{ fontSize: 24 }}>🥉</span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Lucas</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>1.740 pts</span>
            </div>
          </div>

          <button
            onClick={() => setGameState('lobby')}
            style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: '#fff', color: '#073642', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
          >
            Jogar Novamente / Reiniciar Lobby
          </button>
        </div>
      )}
    </div>
  )
}
