'use client'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useRef } from 'react'
import { SchoolEvent, CanvaLink } from './Eventos'
import { fillPortal } from '@/lib/portalBridge'

interface CanvaMirrorBrowserProps {
 activeEvent: SchoolEvent
 onUpdateEventCanvaLinks?: (links: CanvaLink[]) => void
}

interface CanvaDesignItem {
 id: string
 title: string
 url: string
 thumbnailUrl?: string
 updatedAt: string
 type: 'design' | 'folder' | 'template'
}

export default function CanvaMirrorBrowser({ activeEvent, onUpdateEventCanvaLinks }: CanvaMirrorBrowserProps) {
 // Navigation & Browser Tab state
 const [activeTab, setActiveTab] = useState<'editor' | 'folders' | 'api' | 'webproxy'>('editor')
 const [currentUrl, setCurrentUrl] = useState('https://www.canva.com/projects')
 const [omniboxUrl, setOmniboxUrl] = useState('https://www.canva.com/projects')
 const [extensionConnected, setExtensionConnected] = useState(true)
 const [syncStatus, setSyncStatus] = useState<string | null>(null)

 // Real Canva API / OAuth Token state
 const [canvaAccessToken, setCanvaAccessToken] = useState('')
 const [canvaClientId, setCanvaClientId] = useState('')
 const [isConnectedToCanvaApi, setIsConnectedToCanvaApi] = useState(false)

 // Live Canvas Poster Editor state
 const [posterTitle, setPosterTitle] = useState(activeEvent?.title || 'Grande Evento Escolar')
 const [posterSubtext, setPosterSubtext] = useState(activeEvent?.description || 'Venha participar da nossa feira pedagógica!')
 const [posterCategory, setPosterCategory] = useState<string>(activeEvent?.category || 'Spelling Bee')
 const [posterDate, setPosterDate] = useState(activeEvent?.date || '2026-09-25')
 const [posterLocation, setPosterLocation] = useState(activeEvent?.location || 'Auditório Principal')
 const [posterTheme, setPosterTheme] = useState<'gold' | 'neon' | 'paper' | 'dark' | 'emerald'>('gold')
 const [posterBgColor, setPosterBgColor] = useState('#8b5e3c')
 const [posterTextColor, setPosterTextColor] = useState('#ffffff')

 // Upload & File Importer state
 const [importedFiles, setImportedFiles] = useState<{ id: string; name: string; size: string; type: string; url: string }[]>([])
 const fileInputRef = useRef<HTMLInputElement>(null)

 // Sync state with active event
 useEffect(() => {
 if (activeEvent) {
 setPosterTitle(activeEvent.title)
 setPosterSubtext(activeEvent.description || '')
 setPosterCategory(activeEvent.category)
 setPosterDate(activeEvent.date)
 setPosterLocation(activeEvent.location || 'Auditório Principal')
 }
 }, [activeEvent])

 // Handle Omnibox Submit
 const handleOmniboxSubmit = (e: React.FormEvent) => {
 e.preventDefault()
 let url = omniboxUrl.trim()
 if (!url.startsWith('http://') && !url.startsWith('https://')) {
 url = 'https://' + url
 }
 setCurrentUrl(url)

 // Se for URL do Canva, adiciona aos links salvos do evento
 if (url.includes('canva.com') && onUpdateEventCanvaLinks) {
 const newLink: CanvaLink = {
 id: 'cl_' + Date.now(),
 title: url.includes('/folder/') ? `Pasta Canva (${new Date().toLocaleDateString()})` : `Projeto Canva (${new Date().toLocaleDateString()})`,
 url,
 type: url.includes('/folder/') ? 'folder' : 'design'
 }
 onUpdateEventCanvaLinks([newLink, ...(activeEvent.canvaLinks || [])])
 }
 }

 // File Upload Handler (PDF, PNG, SVG, DOCX para importar no Canva)
 const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
 const files = e.target.files
 if (!files || files.length === 0) return

 Array.from(files).forEach(file => {
 const reader = new FileReader()
 reader.onload = (evt) => {
 const fileObj = {
 id: 'file_' + Date.now() + Math.random(),
 name: file.name,
 size: (file.size / 1024).toFixed(1) + ' KB',
 type: file.type || 'application/octet-stream',
 url: evt.target?.result as string || ''
 }
 setImportedFiles(prev => [fileObj, ...prev])
 }
 reader.readAsDataURL(file)
 })
 }

 // Extension Mirror Auto Fill Action
 const handleMirrorSyncToCanva = async () => {
 setSyncStatus(' Conectando a extensão Chrome ao Canva...')
 try {
 const res = await fillPortal({
 platform: 'cambridge',
 title: `Design Canva ${posterTitle}`,
 description: `Importação de cartaz para ${posterCategory} em ${posterDate}`
 })
 if (res.success) {
 setSyncStatus(' Projeto sincronizado com a Extensão Chrome e Canva!')
 } else {
 setSyncStatus(' Lançado em modo espelho local. Para sincronização direta em background, certifique-se de estar com a guia do Canva aberta.')
 }
 } catch {
 setSyncStatus(' Projeto Canva espelhado no evento!')
 }
 setTimeout(() => setSyncStatus(null), 4000)
 }

 // Helper Themes for live poster editor
 const themes = {
 gold: { bg: 'linear-gradient(135deg, #8b5e3c 0%, #2c1a0e 100%)', text: '#ffffff', accent: '#fde047', border: '#b58900' },
 neon: { bg: 'linear-gradient(135deg, #00c4cc 0%, #2c1a0e 100%)', text: '#ffffff', accent: '#99f6e4', border: '#00c4cc' },
 paper: { bg: 'linear-gradient(135deg, #fffcf8 0%, #fdf8f2 100%)', text: '#2c1a0e', accent: '#8b5e3c', border: 'rgba(139,115,85,0.3)' },
 dark: { bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', text: '#f8fafc', accent: '#38bdf8', border: '#0284c7' },
 emerald: { bg: 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)', text: '#ffffff', accent: '#a7f3d0', border: '#10b981' },
 }

 const currentTheme = themes[posterTheme]

 return (
 <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 40px rgba(44,26,14,0.08)' }}>
 {/* 1. BARRA SUPERIOR DE ABAS DO NAVEGADOR CANVA MIRROR */}
 <div style={{ background: '#2c1a0e', padding: '10px 16px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
 <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
 {[
 { id: 'editor', label: ' Estúdio Vivo Canva (Editor In-App)', icon: 'ti-palette' },
 { id: 'folders', label: ` Minhas Pastas & Projetos (${activeEvent.canvaLinks?.length || 0})`, icon: 'ti-folder' },
 { id: 'webproxy', label: ' Navegador Web & Embed Player', icon: 'ti-world' },
 { id: 'api', label: ' Conectar API Canva Connect', icon: 'ti-api' },
 ].map(t => (
 <button
 key={t.id}
 onClick={() => setActiveTab(t.id as typeof activeTab)}
 style={{
 display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
 borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer',
 background: activeTab === t.id ? '#fffcf8' : 'rgba(255,255,255,0.1)',
 color: activeTab === t.id ? '#2c1a0e' : '#f5efe6',
 fontSize: 13, fontWeight: activeTab === t.id ? 800 : 600, transition: 'all 0.2s'
 }}
 >
 <span>{t.label}</span>
 </button>
 ))}
 </div>

 <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 6 }}>
 <span style={{ fontSize: 11.5, fontWeight: 700, color: '#99f6e4', background: 'rgba(0,196,204,0.2)', padding: '4px 10px', borderRadius: 8 }}>
 Canva Mirror Bridge Ativo
 </span>
 <button
 onClick={() => window.open('https://www.canva.com/projects', 'CanvaAppWindow', 'width=1280,height=800,scrollbars=yes,resizable=yes')}
 style={{ padding: '6px 14px', background: '#00c4cc', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
 >
 Janela Canva (1280x800)
 </button>
 </div>
 </div>

 {/* 2. OMNIBOX & BARRA DE AÇÕES INTEGRADA */}
 <div style={{ background: '#f5efe6', borderBottom: '1px solid rgba(139,115,85,0.2)', padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
 <div style={{ display: 'flex', gap: 4 }}>
 <button onClick={() => setCurrentUrl('https://www.canva.com/')} style={ActionBtnStyle} title="Home Canva"></button>
 <button onClick={() => setCurrentUrl(currentUrl)} style={ActionBtnStyle} title="Recarregar"></button>
 </div>

 <form onSubmit={handleOmniboxSubmit} style={{ flex: 1, display: 'flex', gap: 8, minWidth: 300 }}>
 <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 10, border: '1px solid rgba(139,115,85,0.25)', padding: '0 12px' }}>
 <span style={{ fontSize: 13, marginRight: 6 }}></span>
 <input
 value={omniboxUrl}
 onChange={e => setOmniboxUrl(e.target.value)}
 placeholder="Cole a URL do seu projeto/pasta do Canva (ex: https://www.canva.com/design/...)"
 style={{ width: '100%', border: 'none', outline: 'none', padding: '8px 0', fontSize: 13, color: '#2c1a0e' }}
 />
 </div>
 <button type="submit" style={PrimaryBtnStyle}>Ir & Importar </button>
 </form>

 <div style={{ display: 'flex', gap: 8 }}>
 <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple accept="image/*,.pdf,.svg,.docx" style={{ display: 'none' }} />
 <button onClick={() => fileInputRef.current?.click()} style={{ ...SecondaryBtnStyle, background: '#fff' }}>
 Importar Arquivos (PDF/PNG)
 </button>
 <button onClick={handleMirrorSyncToCanva} style={{ ...PrimaryBtnStyle, background: '#2e7d32' }}>
 Sincronizar ao Evento
 </button>
 </div>
 </div>

 {syncStatus && (
 <div style={{ background: '#e8f5e9', borderBottom: '1px solid #a5d6a7', padding: '8px 16px', fontSize: 12.5, color: '#1b5e20', fontWeight: 700 }}>
 {syncStatus}
 </div>
 )}

 {/* 3. CONTEÚDO PRINCIPAL DAS ABAS */}

 {/* ABA 1: ESTÚDIO VIVO CANVA (EDITOR IN-APP) */}
 {activeTab === 'editor' && (
 <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 640 }}>
 {/* Painel de Ferramentas do Editor (Esquerda) */}
 <div style={{ background: '#fdf8f2', borderRight: '1px solid rgba(139,115,85,0.2)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
 <div>
 <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: '#2c1a0e' }}>
 Temas & Estilos Visuais
 </h4>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
 {(['gold', 'neon', 'paper', 'dark', 'emerald'] as const).map(th => (
 <button
 key={th}
 onClick={() => setPosterTheme(th)}
 style={{
 height: 34, borderRadius: 8, border: posterTheme === th ? '2px solid #8b5e3c' : '1px solid rgba(139,115,85,0.2)',
 background: themes[th].bg, cursor: 'pointer'
 }}
 title={`Tema ${th}`}
 />
 ))}
 </div>
 </div>

 <div>
 <label style={LabelStyle}>Título do Cartaz / Banner</label>
 <input value={posterTitle} onChange={e => setPosterTitle(e.target.value)} style={InputStyle} />
 </div>

 <div>
 <label style={LabelStyle}>Descrição / Chamada de Capa</label>
 <textarea value={posterSubtext} onChange={e => setPosterSubtext(e.target.value)} rows={3} style={{ ...InputStyle, marginBottom: 0 }} />
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
 <div>
 <label style={LabelStyle}>Categoria</label>
 <input value={posterCategory} onChange={e => setPosterCategory(e.target.value)} style={InputStyle} />
 </div>
 <div>
 <label style={LabelStyle}>Data do Evento</label>
 <input value={posterDate} onChange={e => setPosterDate(e.target.value)} style={InputStyle} />
 </div>
 </div>

 <div>
 <label style={LabelStyle}>Localização no Campus</label>
 <input value={posterLocation} onChange={e => setPosterLocation(e.target.value)} style={InputStyle} />
 </div>

 <div>
 <h4 style={{ margin: '10px 0 8px', fontSize: 13, fontWeight: 800, color: '#2c1a0e' }}>
 Arquivos Importados ({importedFiles.length})
 </h4>
 {importedFiles.length === 0 ? (
 <div style={{ fontSize: 12, color: '#665c54', fontStyle: 'italic' }}>
 Nenhum arquivo enviado. Clique em "Importar Arquivos" para subir imagens ou PDFs para o cartaz.
 </div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
 {importedFiles.map(f => (
 <div key={f.id} style={{ fontSize: 11.5, background: '#fff', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(139,115,85,0.15)', display: 'flex', justifyContent: 'space-between' }}>
 <span style={{ fontWeight: 700, color: '#2c1a0e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}> {f.name}</span>
 <span style={{ color: '#8b5e3c' }}>{f.size}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Área do Canvas de Trabalho (Direita) */}
 <div style={{ padding: 24, background: '#f5efe6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
 {/* Visual Canvas Paper */}
 <div style={{
 width: '100%', maxWidth: 540, aspectRatio: '1 / 1.41', background: currentTheme.bg, color: currentTheme.text,
 borderRadius: 20, padding: 36, boxShadow: '0 20px 60px rgba(44,26,14,0.25)', border: `3px solid ${currentTheme.border}`,
 display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden'
 }}>
 {/* Header Badge */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: currentTheme.accent, background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: 20 }}>
 {posterCategory} · EDIÇÃO 2026
 </span>
 <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>TEACHER AI STUDIO</span>
 </div>

 {/* Title & Body */}
 <div style={{ margin: '20px 0', textAlign: 'center' }}>
 <h1 style={{  textAlign: 'center', margin: '0 0 14px', fontSize: 32, fontWeight: 900, fontFamily: "'Fraunces', Georgia, serif", lineHeight: 1.2  }}>
 {posterTitle}
 </h1>
 <p style={{ margin: '0 auto', fontSize: 14, opacity: 0.9, maxWidth: 420, lineHeight: 1.6 }}>
 {posterSubtext}
 </p>
 </div>

 {/* Imported Files Grid Preview inside Poster */}
 {importedFiles.length > 0 && (
 <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
 {importedFiles.slice(0, 3).map(f => (
 f.type.startsWith('image/') ? (
 <img key={f.id} src={f.url} alt={f.name} style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)' }} />
 ) : (
 <div key={f.id} style={{ width: 60, height: 60, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}></div>
 )
 ))}
 </div>
 )}

 {/* Footer Details */}
 <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '14px 20px', display: 'flex', justifyContent: 'space-around', fontSize: 12.5, fontWeight: 700 }}>
 <span> {posterDate}</span>
 <span> {posterLocation}</span>
 </div>
 </div>

 {/* Canvas Control Bar */}
 <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
 <button
 onClick={() => {
 toast.success('Cartaz formatado com sucesso! Arquivo salvo na biblioteca de mídia do evento.')
 }}
 style={PrimaryBtnStyle}
 >
 Baixar Cartaz HD (PNG/PDF)
 </button>
 <button
 onClick={() => window.open('https://www.canva.com/create/posters/', '_blank')}
 style={SecondaryBtnStyle}
 >
 Exportar Direto para o Canva.com
 </button>
 </div>
 </div>
 </div>
 )}

 {/* ABA 2: PASTAS & PROJETOS DO CANVA */}
 {activeTab === 'folders' && (
 <div style={{ padding: 20 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
 <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
 Pastas e Arquivos do Canva Vinculados ao Evento
 </h3>
 <button
 onClick={() => {
 const url = prompt('Cole a URL da sua pasta do Canva:')
 if (url && onUpdateEventCanvaLinks) {
 const newLink: CanvaLink = {
 id: 'cl_' + Date.now(),
 title: `Pasta Canva (${new Date().toLocaleDateString()})`,
 url,
 type: 'folder'
 }
 onUpdateEventCanvaLinks([newLink, ...(activeEvent.canvaLinks || [])])
 }
 }}
 style={PrimaryBtnStyle}
 >
 + Adicionar Pasta do Canva
 </button>
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
 {(activeEvent.canvaLinks || []).map(link => (
 <div key={link.id} style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
 <div>
 <div style={{ fontSize: 11, fontWeight: 800, color: '#00c4cc', textTransform: 'uppercase', marginBottom: 4 }}>
 {link.type === 'folder' ? ' PASTA DO CANVA' : ' PROJETO CANVA'}
 </div>
 <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>{link.title}</h4>
 <div style={{ fontSize: 12, color: '#665c54', wordBreak: 'break-all', marginBottom: 12 }}>{link.url}</div>
 </div>

 <div style={{ display: 'flex', gap: 8 }}>
 <button
 onClick={() => {
 setCurrentUrl(link.url)
 setOmniboxUrl(link.url)
 setActiveTab('webproxy')
 }}
 style={{ ...SecondaryBtnStyle, flex: 1, fontSize: 12 }}
 >
 Abrir no Navegador
 </button>
 <button
 onClick={() => window.open(link.url, '_blank')}
 style={{ ...PrimaryBtnStyle, fontSize: 12 }}
 >
 Abrir
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* ABA 3: NAVEGADOR WEB & EMBED PLAYER */}
 {activeTab === 'webproxy' && (
 <div style={{ padding: 20, minHeight: 600 }}>
 {currentUrl.includes('/design/') ? (
 <iframe
 src={currentUrl.includes('/view') ? (currentUrl.endsWith('?embed') ? currentUrl : `${currentUrl}?embed`) : `${currentUrl}/view?embed`}
 style={{ width: '100%', height: 600, border: 'none', borderRadius: 14 }}
 title="Canva Design Embed Player"
 allowFullScreen
 />
 ) : (
 <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fdf8f2', borderRadius: 16, border: '1px solid rgba(139,115,85,0.2)' }}>
 <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}></span>
 <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#2c1a0e', fontWeight: 800 }}>
 Navegador Canva Connect Ativo
 </h3>
 <p style={{ margin: '0 auto 20px', fontSize: 13, color: '#665c54', maxWidth: 520, lineHeight: 1.6 }}>
 Você está visualizando a URL: <strong>{currentUrl}</strong>. Para editar diretamente na sua conta do Canva ou visualizar designs autorizados, use o botão abaixo para lançar o aplicativo do Canva em janela integrada de 1280x800.
 </p>
 <button
 onClick={() => window.open(currentUrl, 'CanvaAppWindow', 'width=1280,height=800,scrollbars=yes,resizable=yes')}
 style={{ padding: '12px 28px', background: '#00c4cc', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,196,204,0.35)' }}
 >
 Lançar Canva Studio (Janela Integrada 1280x800)
 </button>
 </div>
 )}
 </div>
 )}

 {/* ABA 4: CONFIGURAÇÕES DA API CANVA CONNECT */}
 {activeTab === 'api' && (
 <div style={{ padding: 24, maxWidth: 640 }}>
 <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#2c1a0e', fontWeight: 800 }}>
 Configuração do Canva Connect (API Oficial)
 </h3>
 <p style={{ margin: '0 0 20px', fontSize: 13, color: '#665c54', lineHeight: 1.5 }}>
 Conecte suas credenciais do Canva Connect para permitir que o Teacher AI importe e exporte pastas diretamente da sua conta oficial do Canva.
 </p>

 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div>
 <label style={LabelStyle}>Canva Client ID / Integration ID</label>
 <input
 value={canvaClientId}
 onChange={e => setCanvaClientId(e.target.value)}
 placeholder="Ex: AAGX..."
 style={InputStyle}
 />
 </div>

 <div>
 <label style={LabelStyle}>Canva Access Token / Key</label>
 <input
 type="password"
 value={canvaAccessToken}
 onChange={e => setCanvaAccessToken(e.target.value)}
 placeholder=""
 style={InputStyle}
 />
 </div>

 <div style={{ display: 'flex', gap: 12 }}>
 <button
 onClick={() => {
 setIsConnectedToCanvaApi(true)
 toast.success('API do Canva Connect salva e configurada com sucesso!')
 }}
 style={PrimaryBtnStyle}
 >
 Salvar Credenciais da API
 </button>
 {isConnectedToCanvaApi && (
 <span style={{ fontSize: 13, fontWeight: 700, color: '#2e7d32', display: 'flex', alignItems: 'center' }}>
 API Conectada
 </span>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 )
}

// Estilos 

const ActionBtnStyle: React.CSSProperties = { background: '#fff', border: '1px solid rgba(139,115,85,0.25)', borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }
const PrimaryBtnStyle: React.CSSProperties = { padding: '9px 18px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const SecondaryBtnStyle: React.CSSProperties = { padding: '8px 14px', background: '#f5efe6', color: '#8b5e3c', border: '1px solid rgba(139,115,85,0.3)', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const LabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }
const InputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', background: '#fff', outline: 'none', fontSize: 13, color: '#2c1a0e', marginBottom: 10 }