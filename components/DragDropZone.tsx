'use client'

import React, { useState } from 'react'
import { RADIUS } from '@/styles/tokens'

interface DragDropZoneProps {
  onFilesDropped: (files: File[]) => void
  accept?: string
  title?: string
  subtitle?: string
  children?: React.ReactNode
}

/**
 * Zona de Drag & Drop para múltiplos arquivos (PDFs, fotos, documentos) (#14).
 */
export default function DragDropZone({
  onFilesDropped,
  accept = '.pdf,.docx,.txt,.png,.jpg,.jpeg',
  title = 'Arraste arquivos de redação ou provas aqui',
  subtitle = 'ou clique para selecionar do computador (PDF, Imagens, DOCX, TXT)',
  children,
}: DragDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = Array.from(e.dataTransfer.files)
      onFilesDropped(dropped)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files)
      onFilesDropped(selected)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${isDragOver ? '#8b5e3c' : 'rgba(139,115,85,0.25)'}`,
        background: isDragOver ? 'rgba(139,94,60,0.08)' : 'rgba(253,248,242,0.6)',
        borderRadius: RADIUS.lg,
        padding: '32px 24px',
        textAlign: 'center',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.2s ease',
      }}
    >
      <input
        type="file"
        multiple
        accept={accept}
        onChange={handleFileInput}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          cursor: 'pointer',
          width: '100%',
          height: '100%',
        }}
      />

      <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(139,94,60,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8b5e3c',
            fontSize: 22,
          }}
        >
          <i className="ti ti-cloud-upload" />
        </div>

        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2c1a0e' }}>
          {title}
        </h4>
        <p style={{ margin: 0, fontSize: 12.5, color: '#7a5c42' }}>
          {subtitle}
        </p>
      </div>

      {children}
    </div>
  )
}
