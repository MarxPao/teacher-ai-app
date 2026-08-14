'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

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

 function handleImageUpload(file: File) {
 if (!file.type.startsWith('image/')) return
 const reader = new FileReader()
 reader.onload = (e) => {
 const src = e.target?.result as string
 const imgHtml = `<img src="${src}" style="max-width:100%; height:auto; border-radius:6px; margin:12px 0; display:block;" alt="${file.name}" />`
 editorRef.current?.focus()
 document.execCommand('insertHTML', false, imgHtml)
 handleInput()
 }
 reader.readAsDataURL(file)
 }

 function handleDrop(e: React.DragEvent) {
 e.preventDefault()
 setIsDragOver(false)
 const files = Array.from(e.dataTransfer.files)
 files.forEach(handleImageUpload)
 }

 function pickImage() {
 const input = document.createElement('input')
 input.type = 'file'
 input.accept = 'image/*'
 input.onchange = (e) => {
 const file = (e.target as HTMLInputElement).files?.[0]
 if (file) handleImageUpload(file)
 }
 input.click()
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
 <table style="width:100%;border-collapse:collapse;font-size:10pt;border:1px solid #073642;margin-top:6px;">
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
 <div style="border-bottom:2px solid #073642;padding-bottom:15px;margin-bottom:30px;font-family:'Times New Roman',serif;">
 <h2 style="margin:0;color:#073642;font-size:18pt;">${schoolName}</h2>
 <p style="margin:5px 0 0;font-size:11pt;">
 Professor(a): <b>${fields.teacher || teacherName}</b> | 
 Data: <b>${fields.date || '____/____/____'}</b> | 
 Turma: <b>${fields.classGroup || '______'}</b> | 
 Valor: <b>${fields.gradeValue || '____'}</b>
 </p>
 <p style="margin:3px 0 0;font-size:11pt;">Aluno(a): <b>${fields.student || '____________________________________________________'}</b></p>
 <h1 style="margin:20px 0 0;color:#073642;font-size:16pt;text-align:center;">${docTitle}</h1>
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
 h1, h2, h3 { color:#073642; }
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
 style={{ ...BtnStyle, background: hideHeader ? '#cb4b16' : '#eee8d5', color: hideHeader ? '#fff' : '#073642' }}
 >
 <i className={hideHeader ? 'ti ti-eye-off' : 'ti ti-eye'} />
 {hideHeader ? 'Sem Cabeçalho' : 'Com Cabeçalho'}
 </button>

 {/* Toggle Form Inputs Bar */}
 {!hideHeader && (
 <button
 onClick={() => setShowHeaderForm(!showHeaderForm)}
 title="Mostrar/Ocultar campos de dados do cabeçalho"
 style={{ ...BtnStyle, background: showHeaderForm ? '#268bd2' : '#f5f0e8', color: showHeaderForm ? '#fff' : '#586e75' }}
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
 <span style={{ fontSize: 11, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
 Preencher Cabeçalho:
 </span>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#073642', fontWeight: 600 }}>
 Data:
 <input
 type="text"
 value={fields.date}
 onChange={e => updateField('date', e.target.value)}
 placeholder="dd/mm/2026"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#073642', fontWeight: 600 }}>
 Turma:
 <input
 type="text"
 value={fields.classGroup}
 onChange={e => updateField('classGroup', e.target.value)}
 placeholder="Ex: 6º Ano A"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#073642', fontWeight: 600 }}>
 Disciplina:
 <input
 type="text"
 value={fields.subject}
 onChange={e => updateField('subject', e.target.value)}
 placeholder="Ex: Língua Inglesa"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#073642', fontWeight: 600 }}>
 Valor:
 <input
 type="text"
 value={fields.gradeValue}
 onChange={e => updateField('gradeValue', e.target.value)}
 placeholder="Ex: 10,0 pts"
 style={{ ...FormInputStyle, width: 80 }}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#073642', fontWeight: 600 }}>
 Professor(a):
 <input
 type="text"
 value={fields.teacher}
 onChange={e => updateField('teacher', e.target.value)}
 placeholder="Nome do professor"
 style={FormInputStyle}
 />
 </label>

 <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#073642', fontWeight: 600, flex: 1, minWidth: 220 }}>
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
 style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#eee8d5', display: 'flex', justifyContent: 'center' }}
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
 <div style={{ borderBottom: '2px solid #073642', paddingBottom: 18 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
 <div
 contentEditable
 suppressContentEditableWarning
 onBlur={e => onHeaderChange?.({ headerSchool: e.currentTarget.textContent || '' })}
 style={{ fontSize: 20, fontWeight: 800, color: '#073642', outline: 'none', fontFamily: 'Georgia, serif' }}
 >
 {matchedHeader?.officialName || headerData?.school || 'Nome da Escola'}
 </div>
 <div style={{ fontSize: 13, color: '#073642', fontWeight: 600 }}>
 Data: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('date', e.currentTarget.textContent || '')} style={{ outline: 'none', borderBottom: '1px dashed #073642', padding: '0 4px' }}>{fields.date || '____/____/____'}</span>
 </div>
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px', fontSize: 13, color: '#073642', marginBottom: 10 }}>
 <div>
 Professor(a): <span contentEditable suppressContentEditableWarning onBlur={e => updateField('teacher', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #073642', padding: '0 4px' }}>{fields.teacher || headerData?.teacher || 'Seu Nome'}</span>
 </div>
 <div>
 Turma: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('classGroup', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #073642', padding: '0 4px' }}>{fields.classGroup || '_________'}</span>
 </div>
 <div>
 Valor: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('gradeValue', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #073642', padding: '0 4px' }}>{fields.gradeValue || '____'}</span>
 </div>
 {fields.subject && (
 <div style={{ gridColumn: '1 / -1' }}>
 Disciplina: <span contentEditable suppressContentEditableWarning onBlur={e => updateField('subject', e.currentTarget.textContent || '')} style={{ fontWeight: 600, outline: 'none', borderBottom: '1px dashed #073642', padding: '0 4px' }}>{fields.subject}</span>
 </div>
 )}
 <div style={{ gridColumn: '1 / -1' }}>
 Aluno(a): <span contentEditable suppressContentEditableWarning onBlur={e => updateField('student', e.currentTarget.textContent || '')} style={{ fontWeight: 500, outline: 'none', borderBottom: '1px dashed #073642', padding: '0 4px', display: 'inline-block', minWidth: 300 }}>{fields.student || '__________________________________________________________________'}</span>
 </div>
 </div>

 <div
 contentEditable
 suppressContentEditableWarning
 onBlur={e => onHeaderChange?.({ headerTitle: e.currentTarget.textContent || '' })}
 style={{ marginTop: 16, fontSize: 22, fontWeight: 800, color: '#073642', textAlign: 'center', outline: 'none' }}
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
 background: 'rgba(7,54,66,0.05)', border: '2px dashed #073642',
 borderRadius: 8, pointerEvents: 'none', zIndex: 10
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
 color: '#073642',
 fontFamily: fontFamily + ', sans-serif',
 cursor: 'text',
 wordBreak: 'break-word'
 }}
 ></div>
 </div>

 </div>
 </div>
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
 background: 'none', border: 'none', cursor: 'pointer', color: '#586e75', borderRadius: 8,
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
 color: '#073642',
 fontFamily: 'Arial, sans-serif',
 outline: 'none',
 boxSizing: 'border-box',
 cursor: 'text'
}

const FormInputStyle: React.CSSProperties = {
 padding: '4px 8px', borderRadius: 6, border: '1px solid #c0a88a',
 background: '#fff', fontSize: 13, color: '#073642', outline: 'none',
 width: 130
}

const CellHeadStyle: React.CSSProperties = {
 padding: '4px 6px', border: '1px solid #073642', background: '#f5f0e8', color: '#073642', whiteSpace: 'nowrap'
}

const CellBodyStyle: React.CSSProperties = {
 padding: '4px 8px', border: '1px solid #073642', color: '#073642', outline: 'none', background: '#fff'
}

const SS: React.CSSProperties = {
 padding: '4px 8px', border: '1px solid #ede8dc', borderRadius: 6,
 fontSize: 12, background: '#fdf9f3', color: '#073642', outline: 'none', cursor: 'pointer'
}
const BtnStyle: React.CSSProperties = {
 padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11,
 fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
}
const ExportBtn: React.CSSProperties = {
 display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
 color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer'
}
