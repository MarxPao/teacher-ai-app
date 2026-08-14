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
 'I didnt saw him yesterday.',
 'I havent seen him yet.',
 'I havent saw him yet.',
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
 { name: 'Ana Júlia ', score: 1850, streak: 3 },
 { name: 'Pedro ', score: 1720, streak: 2 },
 { name: 'Lucas ', score: 1540, streak: 1 },
 { name: 'Mariana ', score: 1490, streak: 2 },
 { name: 'Gabriel ', score: 1300, streak: 1 },
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
 alert(` Resultados do Quiz ao Vivo sincronizados com o Gradebook da Turma ${className}!`)
 }

 const q = SAMPLE_QUIZ[currentQIdx]

 return (
 <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%', background: '#fdf8f2', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
 {/* Header Paper & Ink */}
 <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14  }}>
 <div>
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', 'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 700, color: '#2c1a0e', margin: '0 auto'  }}>
 Live Quiz Gamificado 
 </h1>
 <span style={{ background: 'rgba(139,94,60,0.12)', color: '#8b5e3c', border: '1px solid rgba(139,94,60,0.2)', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
 Modo TV / Projetor de Sala
 </span>
 </div>
 <p style={{ color: '#a08060', fontSize: 14, marginTop: 4, margin: 0 }}>
 Projete o jogo na TV da sala de aula. Alunos entram pelo celular com PIN de 4 dígitos.
 </p>
 </div>

 {gameState === 'podium' && (
 <button
 onClick={handleSyncGradebook}
 style={{
 padding: '12px 22px', borderRadius: 12, border: 'none',
 background: '#3d7a4e', color: '#fffcf8', fontSize: 14, fontWeight: 700,
 cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
 boxShadow: '0 4px 14px rgba(61,122,78,0.25)', transition: 'all 0.15s ease'
 }}
 >
 <i className="ti ti-chart-bar" /> Lançar Pontos no Gradebook
 </button>
 )}
 </div>

 {/* LOBBY DO JOGO (TELA INICIAL DE ENTRADA) */}
 {gameState === 'lobby' && (
 <div style={{
 flex: 1, background: '#fffcf8', border: '1px solid rgba(139,115,85,0.15)',
 borderRadius: 24, padding: 48, display: 'flex', flexDirection: 'column',
 alignItems: 'center', justifyContent: 'center',
 boxShadow: '0 8px 30px rgba(44,26,14,0.06)', textAlign: 'center'
 }}>
 <span style={{
 background: 'rgba(212,148,74,0.12)', color: '#d4944a', border: '1px solid rgba(212,148,74,0.25)',
 fontSize: 12, fontWeight: 800, padding: '6px 18px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 20
 }}>
 ENTRE EM TEACHERAI.APP/GAME
 </span>

 <h2 style={{ fontSize: 46, fontWeight: 800, color: '#2c1a0e', margin: '0 0 12px 0', fontFamily: "'Fraunces', 'Fraunces', Georgia, serif" }}>
 PIN DO JOGO: <span style={{ color: '#8b5e3c', letterSpacing: '2px' }}>{pin}</span>
 </h2>

 <p style={{ fontSize: 17, color: '#8c7561', marginBottom: 36 }}>
 {quizTitle} <strong style={{ color: '#2c1a0e' }}>Turma {className}</strong>
 </p>

 {/* Lista de Alunos Conectados */}
 <div style={{ width: '100%', maxWidth: 720, background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.12)', borderRadius: 20, padding: 24, marginBottom: 36 }}>
 <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14, textAlign: 'center' }}>
 {players.length} Alunos Conectados no Lobby:
 </div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
 {players.map(p => (
 <span key={p.name} style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', color: '#2c1a0e', padding: '9px 18px', borderRadius: 24, fontSize: 14, fontWeight: 700, boxShadow: '0 2px 6px rgba(44,26,14,0.04)' }}>
 {p.name}
 </span>
 ))}
 </div>
 </div>

 <button
 onClick={handleStartGame}
 style={{
 padding: '16px 52px', borderRadius: 16, border: 'none',
 background: '#8b5e3c', color: '#fffcf8', fontSize: 19, fontWeight: 800,
 cursor: 'pointer', boxShadow: '0 6px 20px rgba(139,94,60,0.3)',
 transition: 'transform 0.15s ease',
 }}
 >
 INICIAR QUIZ NA TV
 </button>
 </div>
 )}

 {/* TELA DE PERGUNTA EM ANDAMENTO */}
 {gameState === 'question' && (
 <div style={{
 flex: 1, background: '#fffcf8', borderRadius: 24, padding: 40,
 border: '1px solid rgba(139,115,85,0.15)', display: 'flex',
 flexDirection: 'column', justifyContent: 'space-between',
 boxShadow: '0 8px 30px rgba(44,26,14,0.06)'
 }}>
 {/* Timer e Pergunta */}
 <div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
 <span style={{ fontSize: 14, fontWeight: 700, color: '#8c7561', background: '#f5efe6', padding: '4px 14px', borderRadius: 12 }}>
 Questão {currentQIdx + 1} de {SAMPLE_QUIZ.length}
 </span>
 <div style={{
 width: 60, height: 60, borderRadius: '50%',
 background: timeLeft <= 5 ? '#c2593f' : '#8b5e3c',
 color: '#fffcf8', display: 'flex', alignItems: 'center',
 justifyContent: 'center', fontSize: 22, fontWeight: 800,
 boxShadow: timeLeft <= 5 ? '0 0 18px rgba(194,89,63,0.4)' : '0 4px 12px rgba(139,94,60,0.2)'
 }}>
 {timeLeft}s
 </div>
 </div>

 <h2 style={{ fontSize: 32, fontWeight: 700, color: '#2c1a0e', textAlign: 'center', margin: '24px 0 44px 0', fontFamily: "'Fraunces', 'Fraunces', Georgia, serif", lineHeight: 1.3 }}>
 "{q.text}"
 </h2>
 </div>

 {/* As 4 Opções Coloridas (Paleta Warm Paper & Ink) */}
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
 <div style={{ background: '#c2593f', color: '#ffffff', padding: 26, borderRadius: 18, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 14px rgba(194,89,63,0.2)' }}>
 <span style={{ fontSize: 24 }}></span> A) {q.options[0]}
 </div>
 <div style={{ background: '#4b7b94', color: '#ffffff', padding: 26, borderRadius: 18, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 14px rgba(75,123,148,0.2)' }}>
 <span style={{ fontSize: 24 }}></span> B) {q.options[1]}
 </div>
 <div style={{ background: '#d4944a', color: '#ffffff', padding: 26, borderRadius: 18, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 14px rgba(212,148,74,0.2)' }}>
 <span style={{ fontSize: 24 }}></span> C) {q.options[2]}
 </div>
 <div style={{ background: '#3d7a4e', color: '#ffffff', padding: 26, borderRadius: 18, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 14px rgba(61,122,78,0.2)' }}>
 <span style={{ fontSize: 24 }}></span> D) {q.options[3]}
 </div>
 </div>
 </div>
 )}

 {/* LEADERBOARD PARCIAL DA RODADA */}
 {gameState === 'leaderboard' && (
 <div style={{
 flex: 1, background: '#fffcf8', borderRadius: 24, padding: 40,
 border: '1px solid rgba(139,115,85,0.15)', display: 'flex',
 flexDirection: 'column', justifyContent: 'space-between',
 boxShadow: '0 8px 30px rgba(44,26,14,0.06)'
 }}>
 <div>
 <div style={{ textAlign: 'center', marginBottom: 28 }}>
 <span style={{ background: 'rgba(61,122,78,0.12)', color: '#3d7a4e', border: '1px solid rgba(61,122,78,0.2)', fontSize: 13, fontWeight: 700, padding: '6px 16px', borderRadius: 16 }}>
 RESPOSTA CORRETA: {q.options[q.correctIdx]}
 </span>
 <h2 style={{ fontSize: 28, fontWeight: 700, color: '#2c1a0e', margin: '14px 0 0 0', fontFamily: "'Fraunces', 'Fraunces', Georgia, serif" }}>
 Placar Parcial da Turma
 </h2>
 </div>

 <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640, margin: '0 auto' }}>
 {players.map((p, i) => (
 <div key={p.name} style={{
 display: 'flex', justifyContent: 'space-between', alignItems: 'center',
 padding: '14px 22px',
 background: i === 0 ? '#fdf6eb' : '#fdf8f2',
 border: i === 0 ? '2px solid #d4944a' : '1px solid rgba(139,115,85,0.15)',
 borderRadius: 14, boxShadow: i === 0 ? '0 4px 12px rgba(212,148,74,0.15)' : 'none'
 }}>
 <span style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e' }}>
 {i + 1}º {p.name}
 </span>
 <span style={{ fontSize: 17, fontWeight: 800, color: '#8b5e3c' }}>
 {p.score + (i === 0 ? 350 : 200)} pts
 </span>
 </div>
 ))}
 </div>
 </div>

 <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
 <button
 onClick={handleNextQuestion}
 style={{
 padding: '14px 40px', borderRadius: 14, border: 'none',
 background: '#8b5e3c', color: '#fffcf8', fontSize: 16, fontWeight: 700,
 cursor: 'pointer', boxShadow: '0 4px 14px rgba(139,94,60,0.25)'
 }}
 >
 Próxima Questão 
 </button>
 </div>
 </div>
 )}

 {/* PODIUM FINAL DE VENCEDORES */}
 {gameState === 'podium' && (
 <div style={{
 flex: 1, background: '#fffcf8', border: '1px solid rgba(139,115,85,0.15)',
 borderRadius: 24, padding: 48, display: 'flex', flexDirection: 'column',
 alignItems: 'center', justifyContent: 'center',
 boxShadow: '0 8px 30px rgba(44,26,14,0.06)'
 }}>
 <h2 style={{ fontSize: 38, fontWeight: 800, color: '#8b5e3c', margin: '0 0 32px 0', fontFamily: "'Fraunces', 'Fraunces', Georgia, serif" }}>
 PÓDIO DOS CAMPEÕES DO QUIZ!
 </h2>

 <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 44 }}>
 {/* 2º Lugar */}
 <div style={{
 width: 150, background: '#a08060', height: 170, borderRadius: '18px 18px 0 0',
 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
 color: '#fffcf8', boxShadow: '0 4px 14px rgba(160,128,96,0.25)'
 }}>
 <span style={{ fontSize: 28 }}></span>
 <span style={{ fontSize: 15, fontWeight: 800 }}>Pedro</span>
 <span style={{ fontSize: 12, opacity: 0.9 }}>1.920 pts</span>
 </div>

 {/* 1º Lugar */}
 <div style={{
 width: 170, background: '#d4944a', height: 230, borderRadius: '18px 18px 0 0',
 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
 color: '#fffcf8', boxShadow: '0 0 32px rgba(212,148,74,0.45)'
 }}>
 <span style={{ fontSize: 40 }}></span>
 <span style={{ fontSize: 17, fontWeight: 800 }}>Ana Júlia</span>
 <span style={{ fontSize: 13, opacity: 0.95 }}>2.200 pts</span>
 </div>

 {/* 3º Lugar */}
 <div style={{
 width: 150, background: '#c2593f', height: 140, borderRadius: '18px 18px 0 0',
 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
 color: '#fffcf8', boxShadow: '0 4px 14px rgba(194,89,63,0.25)'
 }}>
 <span style={{ fontSize: 28 }}></span>
 <span style={{ fontSize: 15, fontWeight: 800 }}>Lucas</span>
 <span style={{ fontSize: 12, opacity: 0.9 }}>1.740 pts</span>
 </div>
 </div>

 <button
 onClick={() => setGameState('lobby')}
 style={{
 padding: '14px 32px', borderRadius: 14, border: '1px solid rgba(139,94,60,0.25)',
 background: '#f5efe6', color: '#8b5e3c', fontSize: 15, fontWeight: 800, cursor: 'pointer'
 }}
 >
 Jogar Novamente / Reiniciar Lobby
 </button>
 </div>
 )}
 </div>
 )
}