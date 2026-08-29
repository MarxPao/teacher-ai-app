'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  audioUrl: string
  title?: string
  accent?: string
  onDelete?: () => void
}

export default function AudioPlayerCard({ audioUrl, title = 'Listening Audio Track', accent = 'US', onDelete }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)
  const [speed, setSpeed]           = useState<number>(1.0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration || 0)
    const onEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audioUrl])

  function togglePlay() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = val
      setCurrentTime(val)
    }
  }

  function changeSpeed(newSpeed: number) {
    setSpeed(newSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed
    }
  }

  function fmtTime(sec: number) {
    if (isNaN(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2c1a0e 0%, #002b36 100%)',
      borderRadius: 16,
      padding: '16px 20px',
      color: '#fdf8f2',
      boxShadow: '0 8px 24px rgba(7,54,66,0.18)',
      margin: '16px 0',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#268bd2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-headphones" style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fdf8f2' }}>{title}</div>
            <div style={{ fontSize: 11, color: '#a08060' }}>
              🇬🇧 Sotaque: <b>{accent}</b> · ELT Audio Engine
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href={audioUrl} download="listening_track.mp3" style={{ color: '#2aa198', textDecoration: 'none', fontSize: 18 }} title="Baixar MP3">
            <i className="ti ti-download" />
          </a>
          {onDelete && (
            <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 18 }} title="Excluir áudio">
              <i className="ti ti-trash" />
            </button>
          )}
        </div>
      </div>

      {/* Controls Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Play/Pause Button */}
        <button onClick={togglePlay} style={{
          width: 40, height: 40, borderRadius: '50%', background: '#b58900', border: 'none',
          color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <i className={`ti ${isPlaying ? 'ti-pause' : 'ti-player-play-filled'}`} />
        </button>

        {/* Progress Bar */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            style={{ width: '100%', accentColor: '#b58900', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#a08060' }}>
            <span>{fmtTime(currentTime)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        {/* Speed Selector */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 2 }}>
          {[0.8, 1.0, 1.2].map(spd => (
            <button
              key={spd}
              onClick={() => changeSpeed(spd)}
              style={{
                padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700,
                background: speed === spd ? '#268bd2' : 'transparent',
                color: speed === spd ? '#fff' : '#a08060', cursor: 'pointer',
              }}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
