'use client'

import React, { useState, useEffect, useRef } from 'react'
import { toast } from '@/components/Toast'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { COLOR, FONT, TEXT, RADIUS } from '@/styles/tokens'

export type VisualPieceType = 'poster' | 'certificate' | 'cover' | 'flashcard' | 'banner'

export interface VisualPiece {
  id: string
  type: VisualPieceType
  title: string
  subtitle: string
  schoolName: string
  date: string
  locationOrTarget: string
  signatureLeft?: string
  signatureRight?: string
  theme: 'gold' | 'neon' | 'paper' | 'dark' | 'emerald' | 'crimson'
  imageUrl?: string
  aiPrompt?: string
  createdAt: string
}

const STORAGE_KEY = 'teacher_saved_visuals'

const PRESET_PIECES: VisualPiece[] = [
  {
    id: 'vp-1',
    type: 'poster',
    title: 'Annual ELT Spelling Bee 2026',
    subtitle: 'Competição escolar de soletração em inglês com premiação de medalhas e certificados.',
    schoolName: 'Colégio Futuro & Excelência',
    date: '25 de Setembro de 2026 · 14:00',
    locationOrTarget: 'Auditório Principal · Entrada Franca',
    theme: 'gold',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vp-2',
    type: 'certificate',
    title: 'CERTIFICADO DE MÉRITO ACADÊMICO',
    subtitle: 'Certificamos com louvor a dedicação e o excelente desempenho pedagógico no ano letivo.',
    schoolName: 'Coordenação Pedagógica de Idiomas',
    date: 'Dezembro de 2026',
    locationOrTarget: 'Ensino Fundamental II',
    signatureLeft: 'Professor(a) Regente',
    signatureRight: 'Diretoria Escolar',
    theme: 'emerald',
    createdAt: new Date().toISOString()
  }
]

const THEMES: Record<string, { bg: string; text: string; accent: string; border: string }> = {
  gold: { bg: 'linear-gradient(135deg, #2c1a0e 0%, #4a2c16 50%, #8b5e3c 100%)', text: '#ffffff', accent: '#fde047', border: '#b58900' },
  neon: { bg: 'linear-gradient(135deg, #002b36 0%, #073642 60%, #00c4cc 100%)', text: '#ffffff', accent: '#99f6e4', border: '#00c4cc' },
  paper: { bg: 'linear-gradient(135deg, #fffcf8 0%, #fdf8f2 50%, #f5efe6 100%)', text: '#2c1a0e', accent: '#8b5e3c', border: '#d5c0b0' },
  dark: { bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', text: '#f8fafc', accent: '#38bdf8', border: '#0284c7' },
  emerald: { bg: 'linear-gradient(135deg, #064e3b 0%, #065f46 60%, #047857 100%)', text: '#ffffff', accent: '#a7f3d0', border: '#10b981' },
  crimson: { bg: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 60%, #991b1b 100%)', text: '#ffffff', accent: '#fecaca', border: '#ef4444' }
}

const CANVA_LINKS: Record<VisualPieceType, { label: string; url: string }> = {
  poster: { label: 'Modelos de Cartazes no Canva', url: 'https://www.canva.com/pt_br/criar/cartazes/' },
  certificate: { label: 'Modelos de Certificados no Canva', url: 'https://www.canva.com/pt_br/criar/certificados/' },
  cover: { label: 'Capas de Documentos no Canva', url: 'https://www.canva.com/pt_br/criar/capas-de-livro/' },
  flashcard: { label: 'Flashcards Educacionais no Canva', url: 'https://www.canva.com/pt_br/criar/flashcards/' },
  banner: { label: 'Banners Escolares no Canva', url: 'https://www.canva.com/pt_br/criar/banners/' }
}

export default function VisualStudio() {
  const [pieces, setPieces] = useState<VisualPiece[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  
  // Editor State
  const [type, setType] = useState<VisualPieceType>('poster')
  const [title, setTitle] = useState('Grande Feira de Ciências 2026')
  const [subtitle, setSubtitle] = useState('Venha explorar experimentos, projetos de robótica e descobertas científicas com nossos alunos!')
  const [schoolName, setSchoolName] = useState('Colégio Futuro & Excelência')
  const [date, setDate] = useState('15 de Outubro de 2026 · 09:00 às 13:00')
  const [locationOrTarget, setLocationOrTarget] = useState('Quadra Coberta · Pátio Central')
  const [signatureLeft, setSignatureLeft] = useState('Prof. Regente')
  const [signatureRight, setSignatureRight] = useState('Coordenação Pedagógica')
  const [theme, setTheme] = useState<VisualPiece['theme']>('gold')
  const [imageUrl, setImageUrl] = useState<string>('')
  
  // AI Prompt Generator
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Carrega peças salvas
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setPieces(parsed)
        if (parsed.length > 0) {
          loadPiece(parsed[0])
        }
      } else {
        setPieces(PRESET_PIECES)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(PRESET_PIECES))
        loadPiece(PRESET_PIECES[0])
      }
    } catch {
      setPieces(PRESET_PIECES)
    }
  }, [])

  function loadPiece(p: VisualPiece) {
    setSelectedId(p.id)
    setType(p.type)
    setTitle(p.title)
    setSubtitle(p.subtitle)
    setSchoolName(p.schoolName)
    setDate(p.date)
    setLocationOrTarget(p.locationOrTarget)
    setSignatureLeft(p.signatureLeft || '')
    setSignatureRight(p.signatureRight || '')
    setTheme(p.theme)
    setImageUrl(p.imageUrl || '')
  }

  function handleSavePiece() {
    const updatedPiece: VisualPiece = {
      id: selectedId || 'vp_' + Date.now(),
      type,
      title,
      subtitle,
      schoolName,
      date,
      locationOrTarget,
      signatureLeft,
      signatureRight,
      theme,
      imageUrl,
      aiPrompt,
      createdAt: new Date().toISOString()
    }

    const nextList = pieces.some(p => p.id === updatedPiece.id)
      ? pieces.map(p => p.id === updatedPiece.id ? updatedPiece : p)
      : [updatedPiece, ...pieces]

    setPieces(nextList)
    setSelectedId(updatedPiece.id)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList))
      window.dispatchEvent(new CustomEvent('teacher:data_changed'))
      toast.success('Peça visual salva com sucesso!')
    } catch {}
  }

  function handleNewPiece(newType: VisualPieceType = 'poster') {
    setSelectedId('')
    setType(newType)
    if (newType === 'poster') {
      setTitle('Feira Cultural & Científica 2026')
      setSubtitle('Apresentações interativas, estandes temáticos e trabalhos práticos dos estudantes.')
      setLocationOrTarget('Pátio Central da Escola')
      setTheme('gold')
    } else if (newType === 'certificate') {
      setTitle('CERTIFICADO DE DESTAQUE ESCOLAR')
      setSubtitle('Conferido em reconhecimento à excelência, assiduidade e dedicação pedagógica.')
      setLocationOrTarget('Turma 8º Ano A')
      setTheme('emerald')
    } else if (newType === 'cover') {
      setTitle('CADERNO DE ATIVIDADES E AVALIAÇÕES')
      setSubtitle('Língua Inglesa · 3º Trimestre Letivo')
      setLocationOrTarget('Ensino Fundamental II')
      setTheme('dark')
    } else {
      setTitle('VOCABULARY FLASHCARD')
      setSubtitle('Key terms, definitions and contextual examples for English learners.')
      setLocationOrTarget('Unit 4: Climate & Nature')
      setTheme('neon')
    }
    setImageUrl('')
  }

  async function handleGenerateAiArt() {
    if (!aiPrompt.trim()) {
      toast.error('Descreva o tema da arte antes de gerar.')
      return
    }

    setIsGeneratingAi(true)
    try {
      const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
      const openAiKey = apis.find((a: any) => a.provider === 'openai' && a.key)?.key

      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          userKey: openAiKey,
          size: type === 'certificate' ? '1024x1024' : '1024x1792'
        })
      })

      const data = await res.json()
      if (data.imageUrl) {
        setImageUrl(data.imageUrl)
        toast.success(data.isFallback ? 'Arte temática gerada!' : 'Ilustração IA gerada com DALL-E 3!')
      } else {
        toast.error('Não foi possível gerar a imagem.')
      }
    } catch {
      toast.error('Erro de conexão ao gerar imagem.')
    } finally {
      setIsGeneratingAi(false)
    }
  }

  const currentTheme = THEMES[theme] || THEMES.gold

  return (
    <ModuleShell
      title="Estúdio de Imagens & Peças Visuais"
      subtitle="Geração de cartazes de eventos, certificados, capas e flashcards com ilustrações IA e tipografia vetorial nítida."
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => handleNewPiece('poster')}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-plus" /> Novo Cartaz
          </button>
          <button
            onClick={() => handleNewPiece('certificate')}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #8b5e3c', background: '#fff', color: '#2c1a0e', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-certificate" /> Novo Certificado
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Painel Esquerdo de Edição */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Seletor de Tipo */}
          <ModuleCard title="1. Tipo & Formato da Peça" icon="ti-layout-grid" padding={16}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { key: 'poster', label: 'Cartaz A3/A4', icon: 'ti-sparkles' },
                { key: 'certificate', label: 'Certificado', icon: 'ti-certificate' },
                { key: 'cover', label: 'Capa de Prova', icon: 'ti-book' },
                { key: 'flashcard', label: 'Flashcard', icon: 'ti-cards' },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => handleNewPiece(item.key as VisualPieceType)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: type === item.key ? '2px solid #8b5e3c' : '1px solid #ede8dc',
                    background: type === item.key ? '#fdf8f2' : '#fff',
                    color: '#2c1a0e',
                    fontSize: 12.5,
                    fontWeight: type === item.key ? 800 : 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className={`ti ${item.icon}`} style={{ color: '#8b5e3c' }} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </ModuleCard>

          {/* Gerador de Imagem IA */}
          <ModuleCard title="2. Ilustração de Fundo com IA" icon="ti-wand" padding={16}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Descreva a arte (ex: Feira de Ciências com planetas, tubos de ensaio e robôs em estilo aquarela)..."
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ede8dc', fontSize: 13, outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleGenerateAiArt}
                  disabled={isGeneratingAi}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, #8b5e3c 0%, #2c1a0e 100%)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isGeneratingAi ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  {isGeneratingAi ? (
                    <>
                      <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Gerando Ilustração...</span>
                    </>
                  ) : (
                    <>
                      <i className="ti ti-sparkles" />
                      <span>Gerar Imagem com IA</span>
                    </>
                  )}
                </button>
                {imageUrl && (
                  <button
                    onClick={() => setImageUrl('')}
                    title="Remover Imagem de Fundo"
                    style={{ padding: '0 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc322f', cursor: 'pointer' }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                )}
              </div>
            </div>
          </ModuleCard>

          {/* Dados e Textos da Peça */}
          <ModuleCard title="3. Textos & Tipografia" icon="ti-text-size" padding={16}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Nome da Escola / Instituição</label>
                <input value={schoolName} onChange={e => setSchoolName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Título Principal</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Subtítulo / Descrição</label>
                <textarea value={subtitle} onChange={e => setSubtitle(e.target.value)} rows={2} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Data / Horário</label>
                  <input value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Local / Público</label>
                  <input value={locationOrTarget} onChange={e => setLocationOrTarget(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {type === 'certificate' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Assinatura Esquerda</label>
                    <input value={signatureLeft} onChange={e => setSignatureLeft(e.target.value)} placeholder="Ex: Professor Regente" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Assinatura Direita</label>
                    <input value={signatureRight} onChange={e => setSignatureRight(e.target.value)} placeholder="Ex: Direção Escolar" style={inputStyle} />
                  </div>
                </div>
              )}

              {/* Seletor de Tema */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Paleta de Cores</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                  {(['gold', 'neon', 'paper', 'dark', 'emerald', 'crimson'] as const).map(th => (
                    <button
                      key={th}
                      onClick={() => setTheme(th)}
                      style={{
                        height: 32,
                        borderRadius: 6,
                        border: theme === th ? '2px solid #8b5e3c' : '1px solid rgba(0,0,0,0.1)',
                        background: THEMES[th].bg,
                        cursor: 'pointer'
                      }}
                      title={`Tema ${th}`}
                    />
                  ))}
                </div>
              </div>

              {/* Botões de Ação */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={handleSavePiece}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2c1a0e',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-device-floppy" />
                  <span>Salvar Peça</span>
                </button>
                <button
                  onClick={() => window.print()}
                  style={{
                    padding: '11px 16px',
                    borderRadius: 8,
                    border: '1px solid #8b5e3c',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-printer" />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
            </div>
          </ModuleCard>

          {/* Atalho Inteligente Canva */}
          <div style={{ background: '#fdf8f2', border: '1px solid #ede8dc', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#2c1a0e' }}>Prefere desenhar no Canva?</div>
                <div style={{ fontSize: 11, color: '#7a5c42' }}>Abra a categoria oficial do Canva em tela cheia.</div>
              </div>
              <button
                onClick={() => window.open(CANVA_LINKS[type].url, '_blank')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#00c4cc',
                  color: '#fff',
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span>Canva.com</span>
                <i className="ti ti-external-link" />
              </button>
            </div>
          </div>
        </div>

        {/* Painel Direito de Visualização ao Vivo (Canvas A3/A4) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f5efe6', padding: 24, borderRadius: 18, border: '1px solid #ede8dc' }}>
          <div
            ref={previewRef}
            style={{
              width: '100%',
              maxWidth: type === 'certificate' ? 680 : 480,
              aspectRatio: type === 'certificate' ? '1.41 / 1' : '1 / 1.41',
              background: imageUrl ? `url(${imageUrl}) center/cover no-repeat` : currentTheme.bg,
              color: currentTheme.text,
              borderRadius: 18,
              padding: type === 'certificate' ? '36px 48px' : '40px 36px',
              boxShadow: '0 16px 48px rgba(44,26,14,0.18)',
              border: `4px solid ${currentTheme.border}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Overlay sutil para legibilidade do texto quando houver imagem */}
            {imageUrl && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1 }} />
            )}

            {/* Top Bar Header */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase', color: currentTheme.accent }}>
                {schoolName.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8, letterSpacing: 1 }}>
                TEACHER AI STUDIO
              </span>
            </div>

            {/* Conteúdo Central */}
            <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', margin: '20px 0' }}>
              <h1 style={{
                fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                fontSize: type === 'certificate' ? 28 : 30,
                fontWeight: 900,
                lineHeight: 1.2,
                margin: '0 0 14px',
                textShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}>
                {title}
              </h1>
              <p style={{
                fontSize: 13.5,
                lineHeight: 1.6,
                maxWidth: 480,
                margin: '0 auto',
                opacity: 0.95,
                textShadow: '0 1px 4px rgba(0,0,0,0.3)'
              }}>
                {subtitle}
              </p>
            </div>

            {/* Footer / Assinaturas / Detalhes */}
            <div style={{ position: 'relative', zIndex: 2 }}>
              {type === 'certificate' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30, paddingTop: 16 }}>
                  <div style={{ textAlign: 'center', width: 180 }}>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.4)', paddingTop: 4, fontSize: 11, fontWeight: 700 }}>
                      {signatureLeft || 'Professor Regente'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', width: 180 }}>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.4)', paddingTop: 4, fontSize: 11, fontWeight: 700 }}>
                      {signatureRight || 'Diretoria Escolar'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '12px 18px', display: 'flex', justifyContent: 'space-around', fontSize: 12, fontWeight: 700 }}>
                  <span><i className="ti ti-calendar" style={{ marginRight: 5 }} />{date}</span>
                  <span><i className="ti ti-map-pin" style={{ marginRight: 5 }} />{locationOrTarget}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModuleShell>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #ede8dc',
  fontSize: 13,
  outline: 'none',
  marginTop: 4
}
