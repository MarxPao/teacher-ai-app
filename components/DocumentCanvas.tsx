'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface HeaderPatch { headerSchool?: string; headerTeacher?: string; headerTitle?: string }

interface Props {
  content: string
  onContentChange?: (html: string) => void
  headerData?: { school: string; teacher: string; title: string }
  onHeaderChange?: (patch: HeaderPatch) => void
  hideHeader?: boolean
  onToggleHeader?: () => void
}

export default function DocumentCanvas({ content, onContentChange, headerData, onHeaderChange, hideHeader, onToggleHeader }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const [isDragOver, setIsDragOver] = useState(false)
  const [fontSize, setFontSize] = useState('14')
  const [fontFamily, setFontFamily] = useState('Outfit')

  // Image Resizer State
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null)
  const [imgRect, setImgRect] = useState({ top: 0, left: 0, width: 0, height: 0 })
  const [resizing, setResizing] = useState<string | null>(null)
  const [initialPos, setInitialPos] = useState({ x: 0, y: 0, w: 0, h: 0 })

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content || ''
    }
  }, [content])

  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    onContentChange?.(editorRef.current?.innerHTML || '')
    setSelectedImg(null)
  }

  function handleInput() {
    onContentChange?.(editorRef.current?.innerHTML || '')
    updateRect()
  }

  const updateRect = useCallback(() => {
    if (!selectedImg || !scrollRef.current) return
    const rect = selectedImg.getBoundingClientRect()
    const parentRect = scrollRef.current.getBoundingClientRect()
    setImgRect({
      top: rect.top - parentRect.top + scrollRef.current.scrollTop,
      left: rect.left - parentRect.left + scrollRef.current.scrollLeft,
      width: rect.width,
      height: rect.height
    })
  }, [selectedImg])

  useEffect(() => {
    if (selectedImg) {
      updateRect()
      window.addEventListener('resize', updateRect)
      scrollRef.current?.addEventListener('scroll', updateRect)
      return () => {
        window.removeEventListener('resize', updateRect)
        scrollRef.current?.removeEventListener('scroll', updateRect)
      }
    }
  }, [selectedImg, updateRect])

  function handleEditorClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      setSelectedImg(target as HTMLImageElement)
    } else {
      setSelectedImg(null)
    }
  }

  function startResize(e: React.MouseEvent, dir: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedImg) return
    setResizing(dir)
    setInitialPos({ x: e.clientX, y: e.clientY, w: selectedImg.offsetWidth, h: selectedImg.offsetHeight })
  }

  useEffect(() => {
    if (!resizing || !selectedImg) return
    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - initialPos.x
      const dy = e.clientY - initialPos.y
      let newW = initialPos.w
      let newH = initialPos.h
      
      if (resizing.includes('e')) newW += dx
      if (resizing.includes('s')) newH += dy
      if (resizing.includes('w')) newW -= dx
      if (resizing.includes('n')) newH -= dy
      
      if (resizing.length === 2) {
         const ratio = initialPos.w / initialPos.h
         if (Math.abs(dx) > Math.abs(dy)) newH = newW / ratio
         else newW = newH * ratio
      }

      selectedImg.style.width = Math.max(20, newW) + 'px'
      selectedImg.style.height = Math.max(20, newH) + 'px'
      updateRect()
    }
    const onMouseUp = () => {
      setResizing(null)
      onContentChange?.(editorRef.current?.innerHTML || '')
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [resizing, selectedImg, initialPos, updateRect, onContentChange])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const src = ev.target?.result as string
          const imgHtml = `<img src="${src}" style="width:300px;height:auto;border-radius:8px;margin:12px 0;display:inline-block;" alt="${file.name}" />`
          editorRef.current?.focus()
          document.execCommand('insertHTML', false, imgHtml)
          onContentChange?.(editorRef.current?.innerHTML || '')
        }
        reader.readAsDataURL(file)
      }
    })
  }

  function pickImage() {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true
    inp.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      files.forEach(file => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const src = ev.target?.result as string
          const imgHtml = `<img src="${src}" style="width:300px;height:auto;border-radius:8px;margin:12px 0;display:inline-block;" alt="${file.name}" />`
          editorRef.current?.focus()
          document.execCommand('insertHTML', false, imgHtml)
          onContentChange?.(editorRef.current?.innerHTML || '')
        }
        reader.readAsDataURL(file)
      })
    }
    inp.click()
  }

  function exportDocx() {
    const htmlContent = editorRef.current?.innerHTML || content || ''
    const schoolName = headerData?.school || 'Escola'
    const teacherName = headerData?.teacher || 'Professor'
    const docTitle = headerData?.title || 'Documento'

    const headerHtml = !hideHeader ? `
      <div style="border-bottom: 2px solid #073642; padding-bottom: 15px; margin-bottom: 30px; font-family: 'Times New Roman', serif;">
        <h2 style="margin: 0; color: #073642; font-size: 18pt; text-align: left;">${schoolName}</h2>
        <p style="margin: 5px 0 0; font-size: 11pt;">Professor(a): <b>${teacherName}</b> | Data: ____/____/____</p>
        <p style="margin: 3px 0 0; font-size: 11pt;">Aluno(a): ____________________________________________________</p>
        <h1 style="margin: 20px 0 0; color: #073642; font-size: 16pt; text-align: center;">${docTitle}</h1>
      </div>
    ` : ''

    const docxHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${docTitle}</title>
        <style>
          @page WordSection1 {
            size: 21cm 29.7cm;
            margin: 3cm 2cm 2cm 3cm;
            mso-header-margin: 35.4pt;
            mso-footer-margin: 35.4pt;
            mso-paper-source: 0;
          }
          div.WordSection1 { page: WordSection1; }
          body { font-family: 'Arial', 'Times New Roman', sans-serif; font-size: 12pt; line-height: 1.5; color: #000; }
          p { margin-bottom: 10pt; text-indent: 1.25cm; }
          h1, h2, h3 { color: #073642; text-indent: 0; }
        </style>
      </head>
      <body>
        <div class="WordSection1">
          ${headerHtml}
          ${htmlContent}
        </div>
      </body>
      </html>
    `

    const blob = new Blob(['\ufeff', docxHtml], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${docTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fdf9f3', borderRadius: 18, overflow: 'hidden', border: '1px solid #ede8dc' }} onClick={() => setSelectedImg(null)}>
      {/* Toolbar */}
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderBottom: '1px solid #ede8dc', padding: '8px 14px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, flexShrink: 0, position: 'relative', zIndex: 10 }}>
        <select value={fontFamily} onChange={e => { setFontFamily(e.target.value); exec('fontName', e.target.value) }} style={SS}>
          {['Outfit','Georgia','Arial','Times New Roman'].map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={fontSize} onChange={e => { setFontSize(e.target.value); exec('fontSize', '7'); /* dummy */ }} style={SS}>
          {['12','14','16','18','24','32'].map(s => <option key={s} value={s}>{s}px</option>)}
        </select>
        <Div />
        <Btn icon="ti-bold" onClick={() => exec('bold')} title="Negrito" />
        <Btn icon="ti-italic" onClick={() => exec('italic')} title="Itálico" />
        <Btn icon="ti-underline" onClick={() => exec('underline')} title="Sublinhado" />
        <Div />
        <Btn icon="ti-align-left" onClick={() => exec('justifyLeft')} title="Esquerda" />
        <Btn icon="ti-align-center" onClick={() => exec('justifyCenter')} title="Centro" />
        <Btn icon="ti-align-right" onClick={() => exec('justifyRight')} title="Direita" />
        <Div />
        <Btn icon="ti-photo" onClick={pickImage} title="Inserir Imagem" />
        <Div />
        <button 
          onClick={onToggleHeader} 
          style={{ ...BtnStyle, background: hideHeader ? '#cb4b16' : '#eee8d5', color: hideHeader ? '#fff' : '#073642' }}
        >
          <i className={hideHeader ? "ti ti-eye-off" : "ti ti-eye"} /> {hideHeader ? 'Sem Cabeçalho' : 'Com Cabeçalho'}
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportDocx} style={{ ...ExportBtn, background: '#268bd2' }}>
            <i className="ti ti-file-word" /> .DOCX (Word)
          </button>
          <button 
            onClick={async () => {
              try {
                const { exportElementToPdf } = await import('@/lib/exportUtils')
                await exportElementToPdf('exam-document-page', (headerData?.title || 'prova').replace(/\s+/g, '_'))
              } catch {
                window.print()
              }
            }} 
            style={{ ...ExportBtn, background: '#cb4b16' }}
          >
            <i className="ti ti-file-type-pdf" /> Exportar PDF
          </button>
        </div>
      </div>

      {/* Page Scroll Container */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#eee8d5', display: 'flex', justifyContent: 'center', position: 'relative' }}>
        
        {/* Image Resizer Overlay */}
        {selectedImg && (
          <div style={{ position: 'absolute', top: imgRect.top, left: imgRect.left, width: imgRect.width, height: imgRect.height, border: '2px solid #268bd2', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 5 }}>
            <div style={{...HS, top: -5, left: -5, cursor: 'nwse-resize'}} onMouseDown={e => startResize(e, 'nw')} />
            <div style={{...HS, top: -5, right: -5, cursor: 'nesw-resize'}} onMouseDown={e => startResize(e, 'ne')} />
            <div style={{...HS, bottom: -5, left: -5, cursor: 'nesw-resize'}} onMouseDown={e => startResize(e, 'sw')} />
            <div style={{...HS, bottom: -5, right: -5, cursor: 'nwse-resize'}} onMouseDown={e => startResize(e, 'se')} />
          </div>
        )}

        {/* Paper Document */}
        <div id="exam-document-page" style={{ background: '#fff', width: '100%', maxWidth: 780, minHeight: 1100, borderRadius: 4, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: '60px 70px', boxSizing: 'border-box' }}>
          
          {!hideHeader && (
            <div style={{ borderBottom: '2px solid #073642', paddingBottom: 20, marginBottom: 40 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div contentEditable suppressContentEditableWarning onBlur={e => onHeaderChange?.({ headerSchool: e.currentTarget.textContent || '' })} style={{ fontSize: 20, fontWeight: 800, color: '#073642', outline: 'none', fontFamily: 'Georgia, serif' }}>
                  {headerData?.school || 'Nome da Escola'}
                </div>
                <div style={{ fontSize: 12, color: '#586e75' }}>Data: ____/____/____</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13, color: '#073642' }}>
                <div>Professor(a): <span contentEditable suppressContentEditableWarning onBlur={e => onHeaderChange?.({ headerTeacher: e.currentTarget.textContent || '' })} style={{ fontWeight: 600, outline: 'none' }}>{headerData?.teacher || 'Seu Nome'}</span></div>
                <div>Turma: _________________</div>
                <div style={{ gridColumn: '1 / -1' }}>Aluno(a): __________________________________________________________________</div>
              </div>
              <div contentEditable suppressContentEditableWarning onBlur={e => onHeaderChange?.({ headerTitle: e.currentTarget.textContent || '' })} style={{ marginTop: 20, fontSize: 22, fontWeight: 800, color: '#073642', textAlign: 'center', outline: 'none' }}>
                {headerData?.title || 'Título do Documento'}
              </div>
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            style={{ position: 'relative', minHeight: 800, outline: 'none' }}
          >
            {isDragOver && <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,54,66,0.05)', border: '2px dashed #073642', borderRadius: 8 }} />}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onClick={handleEditorClick}
              style={{ minHeight: 800, outline: 'none', fontSize: 14, lineHeight: 1.8, color: '#073642', fontFamily: fontFamily + ', sans-serif' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const Div = () => <div style={{ width: 1, height: 20, background: '#ede8dc', margin: '0 4px' }} />
const Btn = ({ icon, onClick, title }: any) => (
  <button onClick={onClick} title={title} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#586e75', borderRadius: 8 }} onMouseOver={e => (e.currentTarget.style.background = '#f5f0e8')} onMouseOut={e => (e.currentTarget.style.background = 'none')}>
    <i className={`ti ${icon}`} style={{ fontSize: 16 }} />
  </button>
)
const SS: React.CSSProperties = { padding: '4px 8px', border: '1px solid #ede8dc', borderRadius: 6, fontSize: 12, background: '#fdf9f3', color: '#073642', outline: 'none', cursor: 'pointer' }
const BtnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }
const ExportBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#073642', color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const HS: React.CSSProperties = { position: 'absolute', width: 10, height: 10, background: '#fff', border: '2px solid #268bd2', borderRadius: '50%', pointerEvents: 'auto', zIndex: 6 }
