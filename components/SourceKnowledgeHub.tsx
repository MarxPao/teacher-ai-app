'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useRef } from 'react'
import { RepositoryItem } from '@/components/modules/Repository'
import { LooseFileItem } from '@/lib/supabaseClient'
import { searchWeb, WebSearchResult } from '@/lib/webSearch'

export interface SourceItem {
  id: string
  title: string
  sourceType: 'book' | 'loose_file' | 'uploaded' | 'web' | 'note'
  category?: string
  scopeInfo?: string // e.g. "Páginas 12-25", "Unit 1", "Recorte de Vocabulário"
  content: string
  fileType?: 'pdf' | 'docx' | 'image' | 'audio' | 'sheet' | 'slide' | 'text' | 'web' | 'note' | 'other'
  wordCount: number
  active: boolean // checkbox/toggle state
  date: string
  url?: string
}

export type KnowledgeMode = 'hybrid' | 'grounded' | 'web'

interface SourceKnowledgeHubProps {
  sources: SourceItem[]
  onChangeSources: (sources: SourceItem[]) => void
  knowledgeMode: KnowledgeMode
  onChangeKnowledgeMode: (mode: KnowledgeMode) => void
  title?: string
  description?: string
}

export function compileSourcesPrompt(sources: SourceItem[], mode: KnowledgeMode): {
  promptContext: string
  activeCount: number
  totalWords: number
} {
  const activeSources = sources.filter(s => s.active)
  if (activeSources.length === 0) {
    return { promptContext: '', activeCount: 0, totalWords: 0 }
  }

  let totalWords = 0
  const formattedSources = activeSources.map((s, idx) => {
    const words = s.wordCount || (s.content ? s.content.trim().split(/\s+/).length : 0)
    totalWords += words
    const scopeNote = s.scopeInfo ? `\nRecorte / Capítulo / Páginas: ${s.scopeInfo}` : ''
    const urlNote = s.url ? `\nLink da Fonte: ${s.url}` : ''
    return `[FONTE ${idx + 1}: ${s.title}]
Tipo: ${s.sourceType.toUpperCase()} | Formato: ${s.fileType || 'texto'}${scopeNote}${urlNote}
Conteúdo da Fonte:
${s.content.slice(0, 7000)}`
  }).join('\n----------------------------------------\n')

  let modeInstruction = ''
  if (mode === 'grounded') {
    modeInstruction = `DIRETRIZ DE CONHECIMENTO: MODO ESTRITO (GROUNDED RAG - 100% FIEL ÀS FONTES)
Todas as questões, vocabulários, interpretações de texto e estruturas gramaticais DEVEM ser fundamentadas EXCLUSIVAMENTE nas fontes fornecidas acima. NÃO invente vocabulário ou fatos externos.`
  } else if (mode === 'web') {
    modeInstruction = `DIRETRIZ DE CONHECIMENTO: MODO WEB & INTERNET ABERTA
Utilize as fontes fornecidas como âncora principal e complemente livremente com fatos atualizados, notícias reais da internet e contexto contemporâneo.`
  } else {
    modeInstruction = `DIRETRIZ DE CONHECIMENTO: MODO HÍBRIDO (RECOMENDADO)
Utilize as fontes fornecidas como base temático-conceitual, sintetizando o vocabulário e tópicos dos materiais com as metodologias pedagógicas, critérios CEFR/BNCC e elaboração de questões originais e inéditas da IA.`
  }

  const promptContext = `
=== BASE DE CONHECIMENTO MULTI-FONTES (ESTILO NOTEBOOKLM) ===
${modeInstruction}
TOTAL DE FONTES ATIVAS: ${activeSources.length} (${totalWords.toLocaleString()} palavras de referência)

${formattedSources}
=== FIM DA BASE DE CONHECIMENTO ===
`

  return {
    promptContext,
    activeCount: activeSources.length,
    totalWords
  }
}

export default function SourceKnowledgeHub({
  sources,
  onChangeSources,
  knowledgeMode,
  onChangeKnowledgeMode,
  title = 'Fontes de Conhecimento & Arquivos',
  description = 'Alimente a geração com múltiplos livros, apostilas, arquivos avulsos, PDFs, DOCXs, anotações ou pesquisa na Web (estilo NotebookLM).'
}: SourceKnowledgeHubProps) {
  // Modais de Seleção
  const [showAddBookModal, setShowAddBookModal] = useState(false)
  const [showAddLooseModal, setShowAddLooseModal] = useState(false)
  const [showAddWebModal, setShowAddWebModal] = useState(false)
  const [showAddNoteModal, setShowAddNoteModal] = useState(false)
  const [previewSource, setPreviewSource] = useState<SourceItem | null>(null)

  // Dados da Biblioteca carregados
  const [availableBooks, setAvailableBooks] = useState<RepositoryItem[]>([])
  const [availableLooseFiles, setAvailableLooseFiles] = useState<LooseFileItem[]>([])

  // Estado de Busca Web
  const [webQuery, setWebQuery] = useState('')
  const [webSearching, setWebSearching] = useState(false)
  const [webResults, setWebResults] = useState<WebSearchResult[]>([])
  const [selectedWebIndexes, setSelectedWebIndexes] = useState<number[]>([])

  // Estado de Nota Manual
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteScope, setNoteScope] = useState('')

  // Upload Progress
  const [uploadStatus, setUploadStatus] = useState('')
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null)

  // Carrega Livros e Arquivos Avulsos do localStorage
  useEffect(() => {
    try {
      const booksStr = localStorage.getItem('teacher_repo') || localStorage.getItem('teacher_repository') || '[]'
      const parsedBooks = JSON.parse(booksStr)
      if (Array.isArray(parsedBooks)) setAvailableBooks(parsedBooks)
    } catch {}

    try {
      const looseStr = localStorage.getItem('teacher_loose_files_v1') || '[]'
      const parsedLoose = JSON.parse(looseStr)
      if (Array.isArray(parsedLoose)) setAvailableLooseFiles(parsedLoose)
    } catch {}
  }, [])

  // Auto-seed: verifica se há texto vindo da biblioteca ('teacher_exam_seed_text')
  useEffect(() => {
    try {
      const seedText = localStorage.getItem('teacher_exam_seed_text')
      if (seedText && seedText.trim().length > 10) {
        localStorage.removeItem('teacher_exam_seed_text')
        const seedItem: SourceItem = {
          id: `source_seed_${Date.now()}`,
          title: 'Material Selecionado da Biblioteca',
          sourceType: 'loose_file',
          category: 'Biblioteca',
          content: seedText,
          wordCount: seedText.trim().split(/\s+/).length,
          active: true,
          date: new Date().toLocaleDateString('pt-BR'),
          fileType: 'pdf'
        }
        onChangeSources([seedItem, ...sources.filter(s => s.id !== seedItem.id)])
      }
    } catch {}
  }, [])

  // Ações sobre fontes
  const toggleSourceActive = (id: string) => {
    onChangeSources(sources.map(s => s.id === id ? { ...s, active: !s.active } : s))
  }

  const removeSource = (id: string) => {
    onChangeSources(sources.filter(s => s.id !== id))
  }

  const updateSourceScope = (id: string, scopeInfo: string) => {
    onChangeSources(sources.map(s => s.id === id ? { ...s, scopeInfo } : s))
  }

  const toggleAllSources = (activeState: boolean) => {
    onChangeSources(sources.map(s => ({ ...s, active: activeState })))
  }

  // Upload Direto de Arquivo
  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (uploadFileInputRef.current) uploadFileInputRef.current.value = ''

    const fileNameLower = file.name.toLowerCase()
    let fileType: SourceItem['fileType'] = 'other'
    if (fileNameLower.endsWith('.pdf')) fileType = 'pdf'
    else if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) fileType = 'docx'
    else if (fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || fileNameLower.endsWith('.webp')) fileType = 'image'
    else if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.csv')) fileType = 'sheet'
    else if (fileNameLower.endsWith('.pptx') || fileNameLower.endsWith('.ppt')) fileType = 'slide'
    else if (fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.md')) fileType = 'text'

    setUploadStatus(`Processando arquivo "${file.name}"...`)

    try {
      let text = ''
      if (fileType === 'pdf') {
        const { extractTextFromPdf } = await import('@/lib/pdfExtractor')
        text = await extractTextFromPdf(file, (curr, tot) => {
          setUploadStatus(`Extraindo PDF: página ${curr}/${tot}...`)
        })
      } else if (fileType === 'docx') {
        const { extractDocxWithImages } = await import('@/lib/pdfExtractor')
        const res = await extractDocxWithImages(file)
        text = res.text || ''
      } else if (fileType === 'image') {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/ocr', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          text = data.text || ''
        }
      } else if (fileType === 'text') {
        text = await file.text()
      } else {
        text = `Arquivo: ${file.name}\nTamanho: ${(file.size / 1024).toFixed(1)} KB`
      }

      if (!text || text.trim().length < 5) {
        throw new Error('Nenhum texto legível foi encontrado no arquivo.')
      }

      const newSource: SourceItem = {
        id: `upload_${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        sourceType: 'uploaded',
        category: 'Upload Direto',
        fileType,
        content: text,
        wordCount: text.trim().split(/\s+/).length,
        active: true,
        date: new Date().toLocaleDateString('pt-BR')
      }

      onChangeSources([newSource, ...sources])
      setUploadStatus('')
    } catch (err: unknown) {
      setUploadStatus('')
      toast.success(`Falha ao ler arquivo: ${err instanceof Error ? err.message : 'Erro na extração.'}`)
    }
  }

  // Executa Busca na Web
  const handleExecuteWebSearch = async () => {
    if (!webQuery.trim()) return
    setWebSearching(true)
    try {
      const res = await searchWeb(webQuery.trim())
      setWebResults(res)
      setSelectedWebIndexes(res.map((_, idx) => idx))
    } catch (e) {
      toast.success('Não foi possível realizar a pesquisa na web no momento.')
    } finally {
      setWebSearching(false)
    }
  }

  // Adiciona Resultados da Web selecionados como Fontes
  const handleAddWebResultsToSources = () => {
    if (selectedWebIndexes.length === 0) {
      toast.success('Selecione pelo menos um resultado da web.')
      return
    }

    const newSources: SourceItem[] = selectedWebIndexes.map(idx => {
      const r = webResults[idx]
      return {
        id: `web_${Date.now()}_${idx}`,
        title: r.title || `Pesquisa: ${webQuery}`,
        sourceType: 'web',
        category: 'Pesquisa na Web',
        fileType: 'web',
        content: `Pesquisa: ${webQuery}\nFonte URL: ${r.url || 'Web'}\nResumo / Fato:\n${r.snippet}`,
        wordCount: r.snippet.trim().split(/\s+/).length,
        active: true,
        date: new Date().toLocaleDateString('pt-BR'),
        url: r.url
      }
    })

    onChangeSources([...newSources, ...sources])
    setShowAddWebModal(false)
    setWebQuery('')
    setWebResults([])
    setSelectedWebIndexes([])
  }

  // Estatísticas
  const activeSourcesCount = sources.filter(s => s.active).length
  const totalActiveWords = sources.filter(s => s.active).reduce((acc, s) => acc + (s.wordCount || 0), 0)

  // Cores por tipo
  const getTypeBadge = (source: SourceItem) => {
    switch (source.sourceType) {
      case 'book':
        return { label: 'LIVRO DIDÁTICO', bg: '#fef3c7', text: '#92400e', icon: 'ti-book-2' }
      case 'loose_file':
        return { label: 'ARQUIVO AVULSO', bg: '#e0e7ff', text: '#3730a3', icon: 'ti-file-text' }
      case 'uploaded':
        return { label: `UPLOAD (${source.fileType?.toUpperCase() || 'ARQUIVO'})`, bg: '#dcfce7', text: '#166534', icon: 'ti-upload' }
      case 'web':
        return { label: 'PESQUISA WEB', bg: '#cffafe', text: '#155e75', icon: 'ti-world' }
      case 'note':
        return { label: 'ANOTAÇÃO MANUAL', bg: '#fae8ff', text: '#86198f', icon: 'ti-pencil' }
      default:
        return { label: 'FONTE', bg: '#f3f4f6', text: '#374151', icon: 'ti-file' }
    }
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 20, padding: 22,
      border: '1.5px solid rgba(139,115,85,0.22)',
      boxShadow: '0 4px 20px rgba(44,26,14,0.05)',
      display: 'flex', flexDirection: 'column', gap: 16
    }}>
      {/* Header & Status Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: RADIUS.md, background: 'linear-gradient(135deg, #8b5e3c, #b07d58)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              <i className="ti ti-brain" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif" }}>
                {title}
              </h3>
              <p style={{ margin: 0, fontSize: TEXT.caption, color: '#8b5e3c' }}>
                {description}
              </p>
            </div>
          </div>
        </div>

        {/* Seletor de Modo de Conhecimento RAG */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#faf8f5', padding: '4px 6px', borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', marginLeft: 4, marginRight: 2 }}>
            Modo IA:
          </span>
          {[
            { id: 'hybrid', label: '⚡ Híbrido (Fontes + Pedagogia)', desc: 'Combina suas fontes com o motor pedagógico da IA' },
            { id: 'grounded', label: '📌 Estrito (Fiel 100% às Fontes)', desc: 'Restringe estritamente às fontes (sem alucinações)' },
            { id: 'web', label: '🌐 Web & Aberto', desc: 'Permite enriquecimento com internet em tempo real' },
          ].map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChangeKnowledgeMode(m.id as KnowledgeMode)}
              title={m.desc}
              style={{
                padding: '6px 11px', borderRadius: RADIUS.md, border: 'none',
                fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer',
                background: knowledgeMode === m.id ? '#8b5e3c' : 'transparent',
                color: knowledgeMode === m.id ? '#fff' : '#665c54',
                transition: 'all 0.15s'
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Botões de Adicionar Fontes */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="file"
          ref={uploadFileInputRef}
          onChange={handleDirectFileUpload}
          accept=".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx,.pptx"
          style={{ display: 'none' }}
        />

        <button
          type="button"
          onClick={() => setShowAddBookModal(true)}
          style={{
            padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.3)',
            background: '#fffcf8', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <i className="ti ti-books" style={{ color: '#b45309' }} /> + Livro Didático / Apostila
        </button>

        <button
          type="button"
          onClick={() => setShowAddLooseModal(true)}
          style={{
            padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.3)',
            background: '#fffcf8', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <i className="ti ti-folders" style={{ color: '#4338ca' }} /> + Arquivo Avulso (Biblioteca)
        </button>

        <button
          type="button"
          onClick={() => uploadFileInputRef.current?.click()}
          style={{
            padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.3)',
            background: '#fffcf8', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <i className="ti ti-upload" style={{ color: '#15803d' }} /> + Upload Rápido (PDF, Word, Imagem)
        </button>

        <button
          type="button"
          onClick={() => setShowAddWebModal(true)}
          style={{
            padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.3)',
            background: '#fffcf8', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <i className="ti ti-world" style={{ color: '#0e7490' }} /> + Pesquisar na Web
        </button>

        <button
          type="button"
          onClick={() => { setNoteTitle(''); setNoteContent(''); setNoteScope(''); setShowAddNoteModal(true); }}
          style={{
            padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.3)',
            background: '#fffcf8', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <i className="ti ti-pencil" style={{ color: '#a21caf' }} /> + Nota / Texto Livre
        </button>

        {uploadStatus && (
          <span style={{ fontSize: 12, color: '#8b5e3c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-loader text-spin" /> {uploadStatus}
          </span>
        )}
      </div>

      {/* Resumo de Fontes Ativas & Ações em Lote */}
      {sources.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf8f5', padding: '8px 14px', borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#2c1a0e' }}>
            <span style={{ fontWeight: 800, color: '#8b5e3c' }}>
              📊 {activeSourcesCount} {activeSourcesCount === 1 ? 'fonte ativa' : 'fontes ativas'}
            </span>
            <span>·</span>
            <span style={{ color: '#7a5c42' }}>
              {totalActiveWords.toLocaleString()} palavras de referência prontas para a IA
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => toggleAllSources(true)}
              style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer' }}
            >
              Marcar Todas
            </button>
            <span style={{ color: '#d0c8b8' }}>|</span>
            <button
              type="button"
              onClick={() => toggleAllSources(false)}
              style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer' }}
            >
              Desmarcar Todas
            </button>
            <span style={{ color: '#d0c8b8' }}>|</span>
            <button
              type="button"
              onClick={() => onChangeSources([])}
              style={{ background: 'none', border: 'none', color: '#dc322f', fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer' }}
            >
              Limpar Hub
            </button>
          </div>
        </div>
      )}

      {/* Grid de Cards das Fontes ("Um box para cada um") */}
      {sources.length === 0 ? (
        <div style={{
          padding: '28px 20px', textAlign: 'center',
          background: '#faf8f5', borderRadius: RADIUS.xl, border: '1.5px dashed #ede8dc',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
        }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#8b5e3c', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <i className="ti ti-folders" />
          </div>
          <div style={{ fontSize: TEXT.body, fontWeight: 700, color: '#2c1a0e' }}>
            Nenhuma fonte selecionada no momento.
          </div>
          <div style={{ fontSize: 12, color: '#8b5e3c', maxWidth: 520, lineHeight: 1.5 }}>
            Clique nos botões acima para somar <strong>livros da biblioteca, PDFs avulsos, anotações ou buscas na Web</strong>. Se você gerar sem fontes, a IA usará seu repertório pedagógico geral baseado no tópico informado.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: 14
        }}>
          {sources.map(source => {
            const badge = getTypeBadge(source)
            return (
              <div
                key={source.id}
                style={{
                  background: source.active ? '#fffcf8' : '#f9f9f9',
                  borderRadius: RADIUS.lg,
                  border: source.active ? '1.5px solid #8b5e3c' : '1px solid #e5e7eb',
                  padding: '14px',
                  boxShadow: source.active ? '0 4px 14px rgba(139,94,60,0.08)' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 10,
                  opacity: source.active ? 1 : 0.65,
                  transition: 'all 0.15s'
                }}
              >
                {/* Header do Box */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    background: badge.bg, color: badge.text,
                    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase'
                  }}>
                    <i className={`ti ${badge.icon}`} /> {badge.label}
                  </span>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: source.active ? '#8b5e3c' : '#9ca3af' }}>
                    <input
                      type="checkbox"
                      checked={source.active}
                      onChange={() => toggleSourceActive(source.id)}
                      style={{ cursor: 'pointer', accentColor: '#8b5e3c' }}
                    />
                    {source.active ? 'Ativa' : 'Inativa'}
                  </label>
                </div>

                {/* Título e Categoria */}
                <div>
                  <div style={{ fontSize: TEXT.body, fontWeight: 700, color: '#2c1a0e', lineHeight: 1.3, marginBottom: 2 }}>
                    {source.title}
                  </div>
                  {source.category && (
                    <div style={{ fontSize: 11, color: '#8b5e3c' }}>
                      {source.category}
                    </div>
                  )}
                </div>

                {/* Campo de Recorte / Páginas / Unidade */}
                <div>
                  <input
                    type="text"
                    value={source.scopeInfo || ''}
                    onChange={e => updateSourceScope(source.id, e.target.value)}
                    placeholder="Capítulo / Páginas (ex: Págs 14-22, Unit 2)..."
                    style={{
                      width: '100%', padding: '6px 10px', borderRadius: RADIUS.md,
                      border: '1px solid #e8e0d0', background: source.active ? '#fff' : '#f3f4f6',
                      fontSize: TEXT.caption, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Footer do Box com Ações */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #ede8dc', paddingTop: 8, marginTop: 'auto' }}>
                  <span style={{ fontSize: 11, color: '#7a5c42', fontWeight: 600 }}>
                    {source.wordCount?.toLocaleString() || 0} palavras
                  </span>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setPreviewSource(source)}
                      style={{
                        background: '#f5efe6', border: 'none', color: '#8b5e3c',
                        padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4
                      }}
                      title="Visualizar texto completo"
                    >
                      <i className="ti ti-eye" /> Ver Texto
                    </button>

                    <button
                      type="button"
                      onClick={() => removeSource(source.id)}
                      style={{
                        background: '#fee2e2', border: 'none', color: '#dc2626',
                        padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                      }}
                      title="Remover fonte do gerador"
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL 1: ADICIONAR LIVRO DIDÁTICO / BIBLIOGRAFIA */}
      {showAddBookModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: 620, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid #ede8dc', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📚</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2c1a0e' }}>Selecionar Livros da Biblioteca</h3>
              </div>
              <button onClick={() => setShowAddBookModal(false)} style={{ background: '#f5f0e8', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>×</button>
            </div>

            <p style={{ fontSize: TEXT.bodyCompact, color: '#7a5c42', margin: 0 }}>
              Escolha livros didáticos completos ou apostilas para adicionar como fonte ao gerador:
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableBooks.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#8b5e3c' }}>
                  Nenhum livro cadastrado na Biblioteca.
                </div>
              ) : (
                availableBooks.map(b => {
                  const alreadyAdded = sources.some(s => s.id === `book_${b.id}`)
                  return (
                    <div
                      key={b.id}
                      style={{
                        padding: 12, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', background: '#faf8f5',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
                      }}
                    >
                      <div>
                        <div style={{ fontSize: TEXT.body, fontWeight: 700, color: '#2c1a0e' }}>{b.title}</div>
                        <div style={{ fontSize: 11, color: '#8b5e3c' }}>
                          {b.category || 'Livro'} · {b.wordCount?.toLocaleString() || 0} palavras
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => {
                          const item: SourceItem = {
                            id: `book_${b.id}`,
                            title: b.title,
                            sourceType: 'book',
                            category: b.category || 'Livro Didático',
                            content: b.content,
                            wordCount: b.wordCount || b.content.trim().split(/\s+/).length,
                            active: true,
                            date: new Date().toLocaleDateString('pt-BR')
                          }
                          onChangeSources([item, ...sources])
                          setShowAddBookModal(false)
                        }}
                        style={{
                          padding: '6px 12px', borderRadius: RADIUS.md, border: 'none',
                          background: alreadyAdded ? '#e5e7eb' : '#8b5e3c',
                          color: alreadyAdded ? '#9ca3af' : '#fff',
                          fontSize: 12, fontWeight: 700, cursor: alreadyAdded ? 'default' : 'pointer'
                        }}
                      >
                        {alreadyAdded ? 'Já Adicionado' : '+ Adicionar'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADICIONAR ARQUIVO AVULSO DA BIBLIOTECA */}
      {showAddLooseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: 620, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid #ede8dc', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📁</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2c1a0e' }}>Selecionar Arquivos Avulsos (Biblioteca)</h3>
              </div>
              <button onClick={() => setShowAddLooseModal(false)} style={{ background: '#f5f0e8', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>×</button>
            </div>

            <p style={{ fontSize: TEXT.bodyCompact, color: '#7a5c42', margin: 0 }}>
              Escolha PDFs, DOCXs, listas de vocabulário ou artigos salvos na Biblioteca:
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableLooseFiles.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#8b5e3c' }}>
                  Nenhum arquivo avulso cadastrado. Adicione em <strong>Biblioteca &gt; 4. Arquivos Avulsos</strong>.
                </div>
              ) : (
                availableLooseFiles.map(f => {
                  const alreadyAdded = sources.some(s => s.id === `loose_${f.id}`)
                  return (
                    <div
                      key={f.id}
                      style={{
                        padding: 12, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', background: '#faf8f5',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
                      }}
                    >
                      <div>
                        <div style={{ fontSize: TEXT.body, fontWeight: 700, color: '#2c1a0e' }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: '#8b5e3c' }}>
                          {f.category} · {f.fileType.toUpperCase()} {f.school ? `· ${f.school}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => {
                          const item: SourceItem = {
                            id: `loose_${f.id}`,
                            title: f.title,
                            sourceType: 'loose_file',
                            category: f.category,
                            fileType: f.fileType as SourceItem['fileType'],
                            content: f.extractedText || f.title,
                            wordCount: f.extractedText ? f.extractedText.trim().split(/\s+/).length : 0,
                            active: true,
                            date: f.date || new Date().toLocaleDateString('pt-BR')
                          }
                          onChangeSources([item, ...sources])
                          setShowAddLooseModal(false)
                        }}
                        style={{
                          padding: '6px 12px', borderRadius: RADIUS.md, border: 'none',
                          background: alreadyAdded ? '#e5e7eb' : '#8b5e3c',
                          color: alreadyAdded ? '#9ca3af' : '#fff',
                          fontSize: 12, fontWeight: 700, cursor: alreadyAdded ? 'default' : 'pointer'
                        }}
                      >
                        {alreadyAdded ? 'Já Adicionado' : '+ Adicionar'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PESQUISAR NA WEB */}
      {showAddWebModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: 680, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid #ede8dc', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🌐</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2c1a0e' }}>Pesquisar Artigos & Fatos na Web</h3>
              </div>
              <button onClick={() => setShowAddWebModal(false)} style={{ background: '#f5f0e8', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={webQuery}
                onChange={e => setWebQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleExecuteWebSearch() }}
                placeholder="Ex: Artificial intelligence in education 2026, Climate change facts..."
                style={{ flex: 1, padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, outline: 'none', color: '#2c1a0e' }}
              />
              <button
                type="button"
                onClick={handleExecuteWebSearch}
                disabled={webSearching}
                style={{ padding: '10px 18px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {webSearching ? <><i className="ti ti-loader text-spin" /> Buscando...</> : <><i className="ti ti-search" /> Pesquisar</>}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {webResults.length > 0 ? (
                webResults.map((res, idx) => {
                  const isChecked = selectedWebIndexes.includes(idx)
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedWebIndexes(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])
                      }}
                      style={{
                        padding: 12, borderRadius: RADIUS.lg, border: isChecked ? '1.5px solid #8b5e3c' : '1px solid #ede8dc',
                        background: isChecked ? '#fdf8f2' : '#faf8f5', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={{ marginTop: 3, accentColor: '#8b5e3c' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', marginBottom: 2 }}>{res.title}</div>
                        <div style={{ fontSize: 12, color: '#7a5c42', lineHeight: 1.5 }}>{res.snippet}</div>
                        {res.url && <div style={{ fontSize: 10.5, color: '#8b5e3c', marginTop: 4 }}>{res.url}</div>}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#8b5e3c', fontSize: 13 }}>
                  Digite um tema em inglês ou português e clique em <strong>Pesquisar</strong> para extrair artigos e fatos da internet.
                </div>
              )}
            </div>

            {webResults.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #ede8dc', paddingTop: 12 }}>
                <button type="button" onClick={() => setShowAddWebModal(false)} style={{ padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid #ede8dc', background: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddWebResultsToSources}
                  style={{ padding: '8px 18px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer' }}
                >
                  Adicionar {selectedWebIndexes.length} {selectedWebIndexes.length === 1 ? 'Fonte Selecionada' : 'Fontes Selecionadas'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: ADICIONAR NOTA MANUAL / TEXTO LIVRE */}
      {showAddNoteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: 620, maxWidth: '95vw', display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid #ede8dc', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>✍️</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2c1a0e' }}>Adicionar Nota / Texto de Referência</h3>
              </div>
              <button onClick={() => setShowAddNoteModal(false)} style={{ background: '#f5f0e8', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>×</button>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Título da Nota / Instrução</label>
              <input
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
                placeholder="Ex: Anotações da Turma 9º B, Lista de Vocabulário do Mês..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Recorte / Páginas (opcional)</label>
              <input
                value={noteScope}
                onChange={e => setNoteScope(e.target.value)}
                placeholder="Ex: Páginas 30 a 35, Unit 4..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Texto Completo de Apoio</label>
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Cole aqui o texto, regras gramaticais, vocabulário ou instruções detalhadas..."
                rows={8}
                style={{ width: '100%', padding: '10px 12px', borderRadius: RADIUS.md, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowAddNoteModal(false)} style={{ padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid #ede8dc', background: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!noteTitle.trim() || !noteContent.trim()) {
                    toast.success('Preencha o título e o texto da nota.')
                    return
                  }
                  const item: SourceItem = {
                    id: `note_${Date.now()}`,
                    title: noteTitle.trim(),
                    sourceType: 'note',
                    category: 'Anotação',
                    fileType: 'note',
                    scopeInfo: noteScope.trim() || undefined,
                    content: noteContent.trim(),
                    wordCount: noteContent.trim().split(/\s+/).length,
                    active: true,
                    date: new Date().toLocaleDateString('pt-BR')
                  }
                  onChangeSources([item, ...sources])
                  setShowAddNoteModal(false)
                }}
                style={{ padding: '8px 18px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer' }}
              >
                Adicionar Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: PREVIEW DO TEXTO COMPLETO DA FONTE */}
      {previewSource && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: 720, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid #ede8dc', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ede8dc', paddingBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2c1a0e' }}>{previewSource.title}</h3>
                <div style={{ fontSize: TEXT.caption, color: '#8b5e3c', marginTop: 2 }}>
                  {previewSource.sourceType.toUpperCase()} · {previewSource.wordCount?.toLocaleString() || 0} palavras
                  {previewSource.scopeInfo && ` · Recorte: ${previewSource.scopeInfo}`}
                </div>
              </div>
              <button onClick={() => setPreviewSource(null)} style={{ background: '#f5f0e8', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>×</button>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto', background: '#fdf8f2', borderRadius: RADIUS.lg, padding: 18,
              border: '1px solid #ede8dc', fontSize: 13, color: '#2c1a0e', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', fontFamily: "'Plus Jakarta Sans', sans-serif"
            }}>
              {previewSource.content}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(previewSource.content)
                  toast.success('Texto copiado para a área de transferência!')
                }}
                style={{ padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid #ede8dc', background: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-copy" /> Copiar Conteúdo
              </button>

              <button
                type="button"
                onClick={() => setPreviewSource(null)}
                style={{ padding: '8px 18px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
