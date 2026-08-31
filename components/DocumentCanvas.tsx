'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import { useRef, useEffect, useState, useCallback } from 'react'
import { 
  MediaLibraryItem, 
  fetchMediaLibraryFromSupabase, 
  uploadMediaFileToSupabase, 
  saveMediaItemToSupabase 
} from '@/lib/supabaseClient'

interface HeaderPatch { headerSchool?: string; headerTeacher?: string; headerTitle?: string }

export interface HeaderFields {
 date: string
 teacher: string
 classGroup: string
 student: string
 subject: string
 gradeValue: string
}

interface Props {
 content: string
 onContentChange?: (html: string) => void
 headerData?: { school: string; teacher: string; title: string }
 onHeaderChange?: (patch: HeaderPatch) => void
 hideHeader?: boolean
 onToggleHeader?: () => void
 headerFields?: Partial<HeaderFields>
 onHeaderFieldsChange?: (fields: Partial<HeaderFields>) => void
}

export default function DocumentCanvas({
 content,
 onContentChange,
 headerData,
 onHeaderChange,
 hideHeader,
 onToggleHeader,
 headerFields,
 onHeaderFieldsChange
}: Props) {
 const editorRef = useRef<HTMLDivElement>(null)
 const scrollRef = useRef<HTMLDivElement>(null)

 const [fontFamily, setFontFamily] = useState('Arial')
 const [fontSize, setFontSize] = useState('14')
 const [isDragOver, setIsDragOver] = useState(false)
 const [showHeaderForm, setShowHeaderForm] = useState(true)

 // Image Picker Modal State
 const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)
 const [imagePickerTab, setImagePickerTab] = useState<'library' | 'upload' | 'url'>('library')
 const [libraryImages, setLibraryImages] = useState<MediaLibraryItem[]>([])
 const [librarySearch, setLibrarySearch] = useState('')
 const [libraryCategory, setLibraryCategory] = useState('all')
 const [selectedImageForInsert, setSelectedImageForInsert] = useState<MediaLibraryItem | null>(null)
 const [customImageUrl, setCustomImageUrl] = useState('')
 const [imageAlign, setImageAlign] = useState<'left' | 'center' | 'right'>('center')
 const [imageWidthPercent, setImageWidthPercent] = useState<'25%' | '50%' | '75%' | '100%'>('50%')
 const [imageCaption, setImageCaption] = useState('')
 const [saveToLibraryCheckbox, setSaveToLibraryCheckbox] = useState(true)
 const [isUploadingImage, setIsUploadingImage] = useState(false)
 const uploadFileInputRef = useRef<HTMLInputElement | null>(null)

 // School Header Matching 
 const [matchedHeader, setMatchedHeader] = useState<{
 name?: string
 officialName?: string
 headerImageUrl?: string
 } | null>(null)

 const [localFields, setLocalFields] = useState<HeaderFields>({
 date: '',
 teacher: headerData?.teacher || '',
 classGroup: '',
 student: '',
 subject: '',
 gradeValue: ''
 })

 const fields = { ...localFields, ...headerFields }

 function updateField(key: keyof HeaderFields, value: string) {
 const updated = { ...localFields, ...headerFields, [key]: value }
 setLocalFields(updated)
 onHeaderFieldsChange?.(updated)
 }

 useEffect(() => {
 const school = headerData?.school
 if (!school) { setMatchedHeader(null); return }
 try {
 const raw = localStorage.getItem('teacher_custom_headers') || localStorage.getItem('teacher_school_headers')
 if (raw) {
 const arr = JSON.parse(raw)
 if (Array.isArray(arr)) {
 const found = arr.find((h: any) => h.name && h.name.toLowerCase().trim() === school.toLowerCase().trim())
 setMatchedHeader(found || null)
 return
 }
 }
 } catch {}
 setMatchedHeader(null)
 }, [headerData?.school])

 // Non-freezing contentEditable sync 
 useEffect(() => {
 if (editorRef.current && document.activeElement !== editorRef.current) {
 if (editorRef.current.innerHTML !== (content || '')) {
 editorRef.current.innerHTML = content || ''
 }
 }
 }, [content])

 const handleInput = useCallback(() => {
 if (editorRef.current) {
 onContentChange?.(editorRef.current.innerHTML)
 }
 }, [onContentChange])

 // Rich Formatting Commands 
 function exec(cmd: string, value: string | undefined = undefined) {
 document.execCommand(cmd, false, value)
 editorRef.current?.focus()
 handleInput()
 }

  // Open Image Picker Modal
  async function openImagePicker() {
    try {
      const local = localStorage.getItem('teacher_media_library')
      if (local) {
        const parsed = JSON.parse(local)
        if (Array.isArray(parsed)) setLibraryImages(parsed)
      }
    } catch {}

    fetchMediaLibraryFromSupabase().then(items => {
      if (items && items.length > 0) setLibraryImages(items)
    }).catch(() => {})

    setSelectedImageForInsert(null)
    setIsImagePickerOpen(true)
  }

  function insertImageIntoDocument(srcUrl: string, title?: string, caption?: string) {
    if (!srcUrl) return

    const alignStyle = imageAlign === 'center' ? 'margin-left: auto; margin-right: auto; display: block;' : imageAlign === 'right' ? 'margin-left: auto; display: block;' : 'display: block;'
    const containerAlign = imageAlign === 'center' ? 'text-align: center;' : imageAlign === 'right' ? 'text-align: right;' : 'text-align: left;'

    const imgHtml = `
      <div style="${containerAlign} margin: 16px 0;" data-teacher-image="true">
        <img 
          src="${srcUrl}" 
          alt="${title || caption || 'Imagem Didática'}" 
          style="max-width: ${imageWidthPercent}; height: auto; border-radius: 6px; ${alignStyle} box-shadow: 0 2px 8px rgba(0,0,0,0.08);" 
        />
        ${caption ? `<div style="font-size: 11.5px; color: #7a5c42; font-style: italic; margin-top: 4px;">${caption}</div>` : ''}
      </div>
      <p><br /></p>
    `

    editorRef.current?.focus()
    document.execCommand('insertHTML', false, imgHtml)
    handleInput()
    setIsImagePickerOpen(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(async (file) => {
      if (!file.type.startsWith('image/')) return
      const res = await uploadMediaFileToSupabase(file, 'documents')
      if (res.ok) {
        insertImageIntoDocument(res.url, file.name)
      }
    })
  }

  function pickImage() {
    openImagePicker()
  }

 // Export DOCX 
 function exportDocx() {
 const htmlContent = editorRef.current?.innerHTML || content || ''
 const schoolName = matchedHeader?.officialName || headerData?.school || 'Escola'
 const teacherName = fields.teacher || headerData?.teacher || 'Professor'
 const docTitle = headerData?.title || 'Documento'

 const headerHtml = !hideHeader ? (
 matchedHeader?.headerImageUrl ? `
 <div style="margin-bottom:16px;">
 <img src="${matchedHeader.headerImageUrl}" style="width:100%;height:auto;display:block;" />
 <table style="width:100%;border-collapse:collapse;font-size:10pt;border:1px solid #2c1a0e;margin-top:6px;">
 <tr>
 <td style="padding:4px 8px;border:1px solid #ccc;"><b>Data:</b> ${fields.date || '___/___/______'}</td>
 <td style="padding:4px 8px;border:1px solid #ccc;"><b>Professor(a):</b> ${fields.teacher || teacherName}</td>
 <td style="padding:4px 8px;border:1px solid #ccc;"><b>Disciplina:</b> ${fields.subject || '________'}</td>
 <td style="padding:4px 8px;border:1px solid #ccc;"><b>Turma:</b> ${fields.classGroup || '______'}</td>
 <td style="padding:4px 8px;border:1px solid #ccc;"><b>Valor:</b> ${fields.gradeValue || '____'}</td>
 </tr>
 <tr>
 <td colspan="5" style="padding:4px 8px;border:1px solid #ccc;"><b>Aluno(a):</b> ${fields.student || '__________________________________________________'}</td>
 </tr>
 </table>
 </div>
 ` : `
 <div style="border-bottom:2px solid #2c1a0e;padding-bottom:15px;margin-bottom:30px;font-family:'Times New Roman',serif;">
 <h2 style="margin:0;color:#2c1a0e;font-size:18pt;">${schoolName}</h2>
 <p style="margin:5px 0 0;font-size:11pt;">
 Professor(a): <b>${fields.teacher || teacherName}</b> | 
 Data: <b>${fields.date || '____/____/____'}</b> | 
 Turma: <b>${fields.classGroup || '______'}</b> | 
 Valor: <b>${fields.gradeValue || '____'}</b>
 </p>
 <p style="margin:3px 0 0;font-size:11pt;">Aluno(a): <b>${fields.student || '____________________________________________________'}</b></p>
 <h1 style="margin:20px 0 0;color:#2c1a0e;font-size:16pt;text-align:center;">${docTitle}</h1>
 </div>
 `
 ) : ''

 const docxHtml = `
 <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
 <head>
 <meta charset='utf-8'>
 <title>${docTitle}</title>
 <style>
 @page WordSection1 { size:21cm 29.7cm; margin:3cm 2cm 2cm 3cm; }
 div.WordSection1 { page:WordSection1; }
 body { font-family:Arial,sans-serif; font-size:12pt; line-height:1.6; color:#000; }
 h1, h2, h3 { color:#2c1a0e; }
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
 <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fdf9f3', borderRadius: 18, overflow: 'hidden', border: '1px solid #ede8dc' }}>

 {/* Rich Formatting Toolbar */}
 <div style={{
 background: '#fff', borderBottom: '1px solid #ede8dc', padding: '8px 14px',
 display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, flexShrink: 0, zIndex: 10
 }}>
 {/* Font Family */}
 <select value={fontFamily} onChange={e => { setFontFamily(e.target.value); exec('fontName', e.target.value) }} style={SS}>
 {['Arial', 'Georgia', 'Outfit', 'Times New Roman', 'Courier New', 'Verdana'].map(f => <option key={f} value={f}>{f}</option>)}
 </select>

 {/* Font Size */}
 <select value={fontSize} onChange={e => { setFontSize(e.target.value); exec('fontSize', e.target.value) }} style={SS}>
 <option value="1">10px</option>
 <option value="2">12px</option>
 <option value="3">14px</option>
 <option value="4">16px</option>
 <option value="5">18px</option>
 <option value="6">24px</option>
 <option value="7">36px</option>
 </select>

 <Div />

 {/* Formatting Buttons */}
 <TBtn icon="ti-bold" title="Negrito (Ctrl+B)" onClick={() => exec('bold')} />
 <TBtn icon="ti-italic" title="Itálico (Ctrl+I)" onClick={() => exec('italic')} />
 <TBtn icon="ti-underline" title="Sublinhado (Ctrl+U)" onClick={() => exec('underline')} />
 <TBtn icon="ti-strikethrough" title="Tachado" onClick={() => exec('strikethrough')} />

 <Div />

 {/* Alignment */}
 <TBtn icon="ti-align-left" title="Alinhar à Esquerda" onClick={() => exec('justifyLeft')} />
 <TBtn icon="ti-align-center" title="Centralizar" onClick={() => exec('justifyCenter')} />
 <TBtn icon="ti-align-right" title="Alinhar à Direita" onClick={() => exec('justifyRight')} />
 <TBtn icon="ti-align-justified" title="Justificar" onClick={() => exec('justifyFull')} />

 <Div />

 {/* Lists & Media */}
 <TBtn icon="ti-list" title="Lista com Marcadores" onClick={() => exec('insertUnorderedList')} />
 <TBtn icon="ti-list-numbers" title="Lista Numerada" onClick={() => exec('insertOrderedList')} />
 <TBtn icon="ti-photo" title="Inserir Imagem" onClick={pickImage} />
 <TBtn icon="ti-clear-formatting" title="Limpar Formatação" onClick={() => exec('removeFormat')} />

 <Div />

 {/* Header Toggle */}
 <button
 onClick={onToggleHeader}
 style={{ ...BtnStyle, background: hideHeader ? '#cb4b16' : '#f0e8d8', color: hideHeader ? '#fff' : '#2c1a0e' }}
 >
 <i className={hideHeader ? 'ti ti-eye-off' : 'ti ti-eye'} />
 {hideHeader ? 'Sem Cabeçalho' : 'Com Cabeçalho'}
 </button>

 {/* Toggle Form Inputs Bar */}
 {!hideHeader && (
 <button
 onClick={() => setShowHeaderForm(!showHeaderForm)}
 title="Mostrar/Ocultar campos de dados do cabeçalho"
 style={{ ...BtnStyle, background: showHeaderForm ? '#268bd2' : '#f5f0e8', color: showHeaderForm ? '#fff' : '#7a5c42' }}
 >
 <i className="ti ti-edit" />
 Campos do Cabeçalho
 </button>
 )}

 <div style={{ flex: 1 }} />

 {/* Export Buttons */}
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
 <i className="ti ti-file-type-pdf" /> PDF
 </button>
 </div>
 </div>

 {/* Interactive Header Edit Bar */}
 {!hideHeader && showHeaderForm && (
 <div style={{
 background: '#fffdf9', borderBottom: '1px solid #ede8dc', padding: '10px 16px',
 display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'center', fontSize: 13
 }}>
 <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
 Preencher Cabeçalho:
 </span>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2c1a0e', fontWeight: 600 }}>
 Data:
 <input
 type="text"
 value={fields.date}
 onChange={e => updateField('date', e.target.value)}
 placeholder="dd/mm/2026"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2c1a0e', fontWeight: 600 }}>
 Turma:
 <input
 type="text"
 value={fields.classGroup}
 onChange={e => updateField('classGroup', e.target.value)}
 placeholder="Ex: 6º Ano A"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2c1a0e', fontWeight: 600 }}>
 Disciplina:
 <input
 type="text"
 value={fields.subject}
 onChange={e => updateField('subject', e.target.value)}
 placeholder="Ex: Língua Inglesa"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2c1a0e', fontWeight: 600 }}>
 Valor:
 <input
 type="text"
 value={fields.gradeValue}
 onChange={e => updateField('gradeValue', e.target.value)}
 placeholder="Ex: 10,0 pts"
 style={{ ...FormInputStyle, width: 80 }}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2c1a0e', fontWeight: 600 }}>
 Professor(a):
 <input
 type="text"
 value={fields.teacher}
 onChange={e => updateField('teacher', e.target.value)}
 placeholder="Nome do professor"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2c1a0e', fontWeight: 600, flex: 1, minWidth: 220 }}>
 Aluno(a):
 <input
 type="text"
 value={fields.student}
 onChange={e => updateField('student', e.target.value)}
 placeholder="Nome do aluno(a)"
 style={{ ...FormInputStyle, flex: 1 }}
 />
 </label>
 </div>
 )}

 {/* Document Page Container */}
 <div
 ref={scrollRef}
 style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#f0e8d8', display: 'flex', justifyContent: 'center' }}
 >
 <div
 id="exam-document-page"
 onClick={e => {
 // Focus main editor when clicking anywhere on the document canvas unless interacting with standard controls
 const target = e.target as HTMLElement
 if (
 editorRef.current &&
 !target.closest('button, input, select, textarea, [contenteditable="true"]') &&
 document.activeElement !== editorRef.current
 ) {
 editorRef.current.focus()
 }
 }}
 style={{
 background: '#fff',
 width: '100%',
 maxWidth: 780,
 minHeight: 1100,
 borderRadius: 4,
 boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
 padding: '60px 70px',
 boxSizing: 'border-box',
 position: 'relative',
 cursor: 'text'
 }}
 >
 {/* School Header Section */}
 {!hideHeader && (
 <div className="header-section" style={{ marginBottom: 0 }}>
 {matchedHeader?.headerImageUrl ? (
 /* Mode A: Imagem limpa do cabeçalho oficial */
 <div style={{ width: '100%', marginBottom: 28, userSelect: 'none' }}>
 <img
 src={matchedHeader.headerImageUrl}
 alt={matchedHeader.name || headerData?.school}
 style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 2 }}
 />
 </div>
 ) : (
 /* Mode B: Full ContentEditable Academic Text Header */
 <div style={{ borderBottom: '2px solid #2c1a0e', paddingBottom: 18 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
 <div
 contentEditable
 suppressContentEditableWarning
 onBlur={e => onHeaderChange?.({ headerSchool: e.currentTarget.textContent || '' })}
 style={{ fontSize: 20, fontWeight: 800, color: '#2c1a0e', outline: 'none', fontFamily: 'Georgia, serif' }}
 >
 {matchedHeader?.officialName || headerData?.school || 'Nome da Escola'}
 </div>
 <div style={{ fontSize: 13, color: '#2c1a0e', fontWeight: 600 }}>
 Data: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('date', e.currentTarget.textContent || '')} style={{ outline: 'none', borderBottom: '1px dashed #2c1a0e', padding: '0 4px' }}>{fields.date || '____/____/____'}</span>
 </div>
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px', fontSize: 13, color: '#2c1a0e', marginBottom: 10 }}>
 <div>
 Professor(a): <span contentEditable suppressContentEditableWarning onBlur={e => updateField('teacher', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #2c1a0e', padding: '0 4px' }}>{fields.teacher || headerData?.teacher || 'Seu Nome'}</span>
 </div>
 <div>
 Turma: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('classGroup', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #2c1a0e', padding: '0 4px' }}>{fields.classGroup || '_________'}</span>
 </div>
 <div>
 Valor: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('gradeValue', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #2c1a0e', padding: '0 4px' }}>{fields.gradeValue || '____'}</span>
 </div>
 {fields.subject && (
 <div style={{ gridColumn: '1 / -1' }}>
 Disciplina: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('subject', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #2c1a0e', padding: '0 4px' }}>{fields.subject}</span>
 </div>
 )}
 <div style={{ gridColumn: '1 / -1' }}>
 Aluno(a): <span contentEditable suppressContentEditableWarning onBlur={e => updateField('student', e.currentTarget.textContent || '')} style={{ fontWeight: 500, outline: 'none', borderBottom: '1px dashed #2c1a0e', padding: '0 4px', display: 'inline-block', minWidth: 300 }}>{fields.student || '__________________________________________________________________'}</span>
 </div>
 </div>

 <div
 contentEditable
 suppressContentEditableWarning
 onBlur={e => onHeaderChange?.({ headerTitle: e.currentTarget.textContent || '' })}
 style={{ marginTop: 16, fontSize: 22, fontWeight: 800, color: '#2c1a0e', textAlign: 'center', outline: 'none' }}
 >
 {headerData?.title || 'Título do Documento'}
 </div>
 </div>
 )}
 </div>
 )}

 {/* Document Body Editor (Fluid, Non-Freezing) */}
 <div
 onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
 onDragLeave={() => setIsDragOver(false)}
 onDrop={handleDrop}
 style={{ position: 'relative', minHeight: 800, outline: 'none' }}
 >
 {isDragOver && (
 <div style={{
 position: 'absolute', inset: 0,
 background: 'rgba(7,54,66,0.05)', border: '2px dashed #2c1a0e',
 borderRadius: RADIUS.md, pointerEvents: 'none', zIndex: 10
 }} />
 )}

 <div
 ref={editorRef}
 contentEditable
 suppressContentEditableWarning
 onInput={handleInput}
 style={{
 minHeight: 800,
 outline: 'none',
 fontSize: 14,
 lineHeight: 1.8,
 color: '#2c1a0e',
 fontFamily: fontFamily + ', sans-serif',
 cursor: 'text',
 wordBreak: 'break-word'
 }}
 ></div>
 </div>

 </div>
 </div>

      {/* ================================================================= */}
      {/* MODAL SELETOR VISUAL DE IMAGENS                                   */}
      {/* ================================================================= */}
      {isImagePickerOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
        }}>
          <div style={{
            background: '#fffcf8', borderRadius: 20, border: '2px solid #8b5e3c', padding: 24,
            maxWidth: 780, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', gap: 16
          }}>
            {/* Cabeçalho do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(139,115,85,0.18)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🖼️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                    Inserir Imagem no Documento
                  </h3>
                  <span style={{ fontSize: 12, color: '#8b7355' }}>
                    Selecione da sua biblioteca, envie um novo arquivo ou use uma URL externa
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsImagePickerOpen(false)} 
                style={{ background: '#f5efe6', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}
              >
                ×
              </button>
            </div>

            {/* Abas do Seletor */}
            <div style={{ display: 'flex', gap: 8, background: '#f5efe6', padding: 4, borderRadius: RADIUS.md }}>
              <button
                onClick={() => setImagePickerTab('library')}
                style={{
                  flex: 1, padding: '8px 14px', borderRadius: RADIUS.md, border: 'none',
                  background: imagePickerTab === 'library' ? '#8b5e3c' : 'transparent',
                  color: imagePickerTab === 'library' ? '#fff' : '#665c54',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                <i className="ti ti-books" /> Da Biblioteca ({libraryImages.length})
              </button>
              <button
                onClick={() => setImagePickerTab('upload')}
                style={{
                  flex: 1, padding: '8px 14px', borderRadius: RADIUS.md, border: 'none',
                  background: imagePickerTab === 'upload' ? '#8b5e3c' : 'transparent',
                  color: imagePickerTab === 'upload' ? '#fff' : '#665c54',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                <i className="ti ti-upload" /> Enviar do Computador
              </button>
              <button
                onClick={() => setImagePickerTab('url')}
                style={{
                  flex: 1, padding: '8px 14px', borderRadius: RADIUS.md, border: 'none',
                  background: imagePickerTab === 'url' ? '#8b5e3c' : 'transparent',
                  color: imagePickerTab === 'url' ? '#fff' : '#665c54',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                <i className="ti ti-link" /> Link Web (URL)
              </button>
            </div>

            {/* CONTEÚDO DA ABA 1: BIBLIOTECA DE IMAGENS */}
            {imagePickerTab === 'library' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Busca e Categorias */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8b7355', fontSize: 14 }} />
                    <input
                      type="text"
                      placeholder="Buscar por título ou tag..."
                      value={librarySearch}
                      onChange={e => setLibrarySearch(e.target.value)}
                      style={{
                        width: '100%', padding: '7px 10px 7px 32px', borderRadius: RADIUS.md,
                        border: '1px solid rgba(139,115,85,0.25)', background: '#fff', fontSize: TEXT.bodyCompact, outline: 'none'
                      }}
                    />
                  </div>
                  <select
                    value={libraryCategory}
                    onChange={e => setLibraryCategory(e.target.value)}
                    style={{
                      padding: '7px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.25)',
                      background: '#fff', fontSize: TEXT.bodyCompact, outline: 'none', color: '#2c1a0e', fontWeight: 600
                    }}
                  >
                    <option value="all">Todas as Categorias</option>
                    <option value="Ilustrações Didáticas">Ilustrações Didáticas</option>
                    <option value="Mapas & Gráficos">Mapas & Gráficos</option>
                    <option value="Logos & Selos">Logos & Selos</option>
                    <option value="Questões & Exercícios">Questões & Exercícios</option>
                    <option value="Diagramas Científicos">Diagramas Científicos</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>

                {/* Grid de Seleção */}
                {libraryImages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, background: '#fdfaf5', borderRadius: RADIUS.lg, border: '1.5px dashed rgba(139,115,85,0.2)' }}>
                    <p style={{ margin: '0 0 10px', color: '#8b7355', fontSize: 13, fontWeight: 600 }}>Sua biblioteca de imagens ainda está vazia.</p>
                    <button
                      onClick={() => setImagePickerTab('upload')}
                      style={{ padding: '6px 14px', borderRadius: RADIUS.md, background: '#8b5e3c', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                    >
                      Enviar primeira imagem
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
                    gap: 10,
                    maxHeight: 240,
                    overflowY: 'auto',
                    padding: 4
                  }}>
                    {libraryImages
                      .filter(img => {
                        const matchCat = libraryCategory === 'all' || img.category === libraryCategory
                        const matchSearch = !librarySearch.trim() || 
                          img.title.toLowerCase().includes(librarySearch.toLowerCase()) ||
                          (img.tags && img.tags.some(t => t.toLowerCase().includes(librarySearch.toLowerCase())))
                        return matchCat && matchSearch
                      })
                      .map(img => {
                        const isSelected = selectedImageForInsert?.id === img.id
                        return (
                          <div
                            key={img.id}
                            onClick={() => setSelectedImageForInsert(img)}
                            style={{
                              border: isSelected ? '2.5px solid #8b5e3c' : '1.5px solid rgba(139,115,85,0.2)',
                              borderRadius: RADIUS.md,
                              background: isSelected ? '#fdf8f0' : '#fff',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              position: 'relative',
                              boxShadow: isSelected ? '0 0 0 2px rgba(139,115,85,0.2)' : 'none',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ height: 85, background: '#f7f2ea', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              <img src={img.fileUrl} alt={img.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                            <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#2c1a0e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {img.title}
                            </div>
                            {isSelected && (
                              <span style={{ position: 'absolute', top: 4, right: 4, background: '#8b5e3c', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                                ✓
                              </span>
                            )}
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: ENVIAR NOVO ARQUIVO */}
            {imagePickerTab === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="file"
                  ref={uploadFileInputRef}
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setIsUploadingImage(true)
                    try {
                      const res = await uploadMediaFileToSupabase(file, 'documents')
                      if (res.ok) {
                        const tempItem: MediaLibraryItem = {
                          id: `img_${Date.now()}`,
                          title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
                          fileUrl: res.url,
                          fileName: file.name,
                          fileType: file.type,
                          fileSize: file.size,
                          category: 'Ilustrações Didáticas',
                          tags: ['#documento'],
                          createdAt: new Date().toISOString()
                        }
                        if (saveToLibraryCheckbox) {
                          await saveMediaItemToSupabase(tempItem)
                          setLibraryImages(prev => [tempItem, ...prev.filter(x => x.id !== tempItem.id)])
                        }
                        setSelectedImageForInsert(tempItem)
                      }
                    } catch (err: any) {
                      toast.success('Erro ao carregar arquivo: ' + err.message)
                    } finally {
                      setIsUploadingImage(false)
                    }
                  }}
                  style={{ display: 'none' }}
                />

                <div
                  onClick={() => uploadFileInputRef.current?.click()}
                  style={{
                    border: '2px dashed #8b5e3c', borderRadius: RADIUS.lg, padding: 30, textAlign: 'center',
                    background: '#fdfaf5', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
                  }}
                >
                  <i className={isUploadingImage ? "ti ti-loader rotate" : "ti ti-cloud-upload"} style={{ fontSize: 32, color: '#8b5e3c' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>
                    {isUploadingImage ? 'Processando imagem...' : 'Clique para selecionar do computador'}
                  </span>
                  <span style={{ fontSize: 12, color: '#8b7355' }}>
                    Formatos suportados: PNG, JPG, JPEG, WEBP, SVG, GIF
                  </span>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c1a0e', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={saveToLibraryCheckbox}
                    onChange={e => setSaveToLibraryCheckbox(e.target.checked)}
                    style={{ accentColor: '#8b5e3c' }}
                  />
                  <span>Salvar também na <strong>Biblioteca de Imagens</strong> para reutilizar depois</span>
                </label>
              </div>
            )}

            {/* CONTEÚDO DA ABA 3: LINK WEB (URL) */}
            {imagePickerTab === 'url' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: TEXT.bodyCompact, fontWeight: 700, color: '#7a5c42' }}>URL Direta da Imagem:</label>
                <input
                  type="text"
                  placeholder="https://exemplo.com/imagem.png"
                  value={customImageUrl}
                  onChange={e => {
                    setCustomImageUrl(e.target.value)
                    if (e.target.value.trim()) {
                      setSelectedImageForInsert({
                        id: `url_${Date.now()}`,
                        title: 'Imagem Externa',
                        fileUrl: e.target.value.trim()
                      })
                    }
                  }}
                  style={{
                    padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.25)',
                    background: '#fff', fontSize: 13, outline: 'none'
                  }}
                />
              </div>
            )}

            {/* PAINEL DE FORMATAÇÃO E AJUSTES DE INSERÇÃO */}
            {selectedImageForInsert && (
              <div style={{
                background: '#f7f2ea', borderRadius: RADIUS.lg, padding: 14, border: '1px solid rgba(139,115,85,0.2)',
                display: 'flex', flexDirection: 'column', gap: 10
              }}>
                <div style={{ fontSize: TEXT.bodyCompact, fontWeight: 800, color: '#8b5e3c', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-adjustments" /> Configurações da Imagem no Documento
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {/* Tamanho */}
                  <div>
                    <label style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Largura / Tamanho</label>
                    <select
                      value={imageWidthPercent}
                      onChange={e => setImageWidthPercent(e.target.value as any)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid #c0a88a', background: '#fff', fontSize: 12 }}
                    >
                      <option value="25%">25% (Pequena)</option>
                      <option value="50%">50% (Média)</option>
                      <option value="75%">75% (Grande)</option>
                      <option value="100%">100% (Largura Total)</option>
                    </select>
                  </div>

                  {/* Alinhamento */}
                  <div>
                    <label style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Alinhamento</label>
                    <select
                      value={imageAlign}
                      onChange={e => setImageAlign(e.target.value as any)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid #c0a88a', background: '#fff', fontSize: 12 }}
                    >
                      <option value="center">Centralizado</option>
                      <option value="left">Alinhado à Esquerda</option>
                      <option value="right">Alinhado à Direita</option>
                    </select>
                  </div>

                  {/* Legenda */}
                  <div>
                    <label style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Legenda (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: Figura 1.1..."
                      value={imageCaption}
                      onChange={e => setImageCaption(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid #c0a88a', background: '#fff', fontSize: 12 }}
                    />
                  </div>
                </div>

                {/* Preview Mini */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: 8, borderRadius: RADIUS.md, border: '1px solid #ede8dc' }}>
                  <img src={selectedImageForInsert.fileUrl} alt="Preview" style={{ height: 44, width: 44, objectFit: 'cover', borderRadius: 6 }} />
                  <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{selectedImageForInsert.title || 'Imagem Selecionada'}</strong>
                  </div>
                  <span style={{ fontSize: 11, color: '#8b5e3c', fontWeight: 700 }}>Pronta para Inserir</span>
                </div>
              </div>
            )}

            {/* Rodapé de Ações */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid rgba(139,115,85,0.18)', paddingTop: 12 }}>
              <button
                onClick={() => setIsImagePickerOpen(false)}
                style={{
                  padding: '9px 18px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.35)',
                  background: '#fffcf8', color: '#7a5c42', fontSize: 13, fontWeight: 700, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                disabled={!selectedImageForInsert?.fileUrl}
                onClick={() => {
                  if (selectedImageForInsert?.fileUrl) {
                    insertImageIntoDocument(selectedImageForInsert.fileUrl, selectedImageForInsert.title, imageCaption)
                  }
                }}
                style={{
                  padding: '9px 22px', borderRadius: RADIUS.md, border: 'none',
                  background: selectedImageForInsert?.fileUrl ? '#8b5e3c' : '#ccc',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: selectedImageForInsert?.fileUrl ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <i className="ti ti-check" /> Inserir no Documento
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// Micro Components & Styles 
const Div = () => <div style={{ width: 1, height: 20, background: '#ede8dc', margin: '0 4px' }}></div>

function TBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
 return (
 <button
 onClick={onClick}
 title={title}
 style={{
 width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
 background: 'none', border: 'none', cursor: 'pointer', color: '#7a5c42', borderRadius: RADIUS.md,
 transition: 'background 0.15s'
 }}
 onMouseOver={e => (e.currentTarget.style.background = '#f5f0e8')}
 onMouseOut={e => (e.currentTarget.style.background = 'none')}
 >
 <i className={`ti ${icon}`} style={{ fontSize: 16 }} />
 </button>
 )
}

const OverlayInputStyle: React.CSSProperties = {
 background: 'rgba(255, 255, 255, 0.40)',
 border: '1px dashed rgba(7, 54, 66, 0.40)',
 borderRadius: 3,
 padding: '2px 6px',
 fontSize: '11px',
 fontWeight: 700,
 color: '#2c1a0e',
 fontFamily: 'Arial, sans-serif',
 outline: 'none',
 boxSizing: 'border-box',
 cursor: 'text'
}

const FormInputStyle: React.CSSProperties = {
 padding: '4px 8px', borderRadius: 6, border: '1px solid #c0a88a',
 background: '#fff', fontSize: 13, color: '#2c1a0e', outline: 'none',
 width: 130
}

const CellHeadStyle: React.CSSProperties = {
 padding: '4px 6px', border: '1px solid #2c1a0e', background: '#f5f0e8', color: '#2c1a0e', whiteSpace: 'nowrap'
}

const CellBodyStyle: React.CSSProperties = {
 padding: '4px 8px', border: '1px solid #2c1a0e', color: '#2c1a0e', outline: 'none', background: '#fff'
}

const SS: React.CSSProperties = {
 padding: '4px 8px', border: '1px solid #ede8dc', borderRadius: 6,
 fontSize: 12, background: '#fdf9f3', color: '#2c1a0e', outline: 'none', cursor: 'pointer'
}
const BtnStyle: React.CSSProperties = {
 padding: '6px 12px', borderRadius: RADIUS.md, border: 'none', fontSize: 11,
 fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
}
const ExportBtn: React.CSSProperties = {
 display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
 color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer'
}

