'use client'

import React, { useRef, useState, useEffect } from 'react'
import { RADIUS } from '@/styles/tokens'

interface NativeCameraCaptureProps {
  onCapture: (imageDataUri: string) => void
  onClose: () => void
  title?: string
}

/**
 * Captura nativa de fotos com guia de enquadramento para correção de provas (#45).
 */
export default function NativeCameraCapture({
  onCapture,
  onClose,
  title = 'Fotografar Prova / Folha de Respostas',
}: NativeCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')

  useEffect(() => {
    let activeStream: MediaStream | null = null

    async function startCamera() {
      try {
        setError(null)
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        activeStream = mediaStream
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      } catch (err: any) {
        setError('Não foi possível acessar a câmera. Verifique as permissões do navegador.')
      }
    }

    startCamera()

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [facingMode])

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUri = canvas.toDataURL('image/jpeg', 0.9)

    // Stop tracks
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }

    onCapture(dataUri)
    onClose()
  }

  const toggleCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Controls */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.6)',
          zIndex: 10,
        }}
      >
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{title}</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={toggleCamera}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-switch-camera" />
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              color: '#fff',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Viewport with Alignment Guide */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {error ? (
          <div style={{ color: '#fff', textAlign: 'center', padding: 20 }}>{error}</div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />

            {/* Retângulo Guia de Alinhamento */}
            <div
              style={{
                position: 'absolute',
                width: '85%',
                height: '75%',
                border: '2px dashed rgba(255,255,255,0.7)',
                borderRadius: 16,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 12,
              }}
            >
              <span
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  padding: '4px 12px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Enquadre a folha de prova neste retângulo
              </span>
            </div>
          </>
        )}
      </div>

      {/* Bottom Shutter */}
      <div
        style={{
          padding: '24px 20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.7)',
          zIndex: 10,
        }}
      >
        <button
          onClick={handleCapture}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: '#fff',
            border: '4px solid rgba(255,255,255,0.4)',
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(255,255,255,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#8b5e3c' }} />
        </button>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
