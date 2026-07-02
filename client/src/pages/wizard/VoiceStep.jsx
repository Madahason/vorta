import { useState } from 'react'
import VoiceoverPanel from '../../components/video-creator/VoiceoverPanel'

const SERVER_URL = 'http://localhost:3001'

export function VoiceStep({
  scenes, projectId,
  onAudioGenerated, voiceoverStatuses, onVoiceoverStatusChange, onScenesChange,
  wizard,
}) {
  const [isRepadding, setIsRepadding] = useState(false)
  const [repadStatus, setRepadStatus] = useState(null) // null | 'done' | 'error'

  const audioScenes = scenes.filter(s => s.audio_path)

  const handleRepad = async () => {
    setIsRepadding(true)
    setRepadStatus(null)
    try {
      const response = await fetch(`${SERVER_URL}/api/voiceover/repad`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scenes, projectId }),
      })

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const event = JSON.parse(line.slice(5).trim())
            if (event.type === 'complete') {
              if (onScenesChange && event.updatedScenes) {
                onScenesChange(event.updatedScenes)
                try { localStorage.setItem('vorta_scenes', JSON.stringify(event.updatedScenes)) } catch {}
              }
              setRepadStatus('done')
              console.log('[repad] complete:', event.repadded, 'files updated')
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('[repad] failed:', err)
      setRepadStatus('error')
    } finally {
      setIsRepadding(false)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Voice Generation</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            {scenes.length} scenes · ElevenLabs Multilingual v2 · Per-mood delivery
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={() => { wizard.markComplete('voice'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Fine-Tune →
          </button>
        </div>
      </div>

      {/* Fix narration timing button — shown only when audio files exist */}
      {audioScenes.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
              Fix narration start timing
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
              Re-pads existing audio with 500ms start silence. Run if words are cut off at scene starts.
            </div>
          </div>
          <button
            onClick={handleRepad}
            disabled={isRepadding}
            style={{
              padding: '6px 14px',
              background: isRepadding ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: isRepadding ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.70)',
              fontSize: 12,
              cursor: isRepadding ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {isRepadding ? '⟳ Fixing…' : repadStatus === 'done' ? '✓ Done' : '⏱ Fix timing'}
          </button>
        </div>
      )}

      {/* Always open in wizard context */}
      <VoiceoverPanel
        scenes={scenes}
        projectId={projectId}
        isOpen={true}
        onClose={() => {}}
        onAudioGenerated={onAudioGenerated}
        onVoiceoverStatusChange={onVoiceoverStatusChange}
        onScenesChange={onScenesChange}
      />
    </div>
  )
}
