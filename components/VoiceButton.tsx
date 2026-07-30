'use client'
import { useSpeechInput } from '@/hooks/useSpeechInput'

interface Props {
  onResult: (text: string) => void
  style?: React.CSSProperties
}

export default function VoiceButton({ onResult, style }: Props) {
  const { isListening, error, start, stop } = useSpeechInput(onResult)

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={isListening ? stop : start}
        title={error || (isListening ? 'Clique para parar' : 'Clique e fale em português')}
        style={{
          width: 30, height: 30, borderRadius: '50%', border: 'none',
          background: error ? '#dc322f' : isListening ? '#cb4b16' : '#2aa198',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: isListening ? '0 0 0 4px rgba(203,75,22,0.25)' : '0 2px 8px rgba(42,161,152,0.3)',
          transition: 'all 0.2s',
          ...style
        }}
      >
        <i className={`ti ${error ? 'ti-microphone-off' : isListening ? 'ti-player-stop' : 'ti-microphone'}`} style={{ fontSize: 13 }} />
      </button>
      {isListening && (
        <span style={{
          position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
          background: '#cb4b16', color: '#fff', fontSize: 10, fontWeight: 700,
          padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', pointerEvents: 'none'
        }}>
          🎙 Ouvindo...
        </span>
      )}
    </div>
  )
}
