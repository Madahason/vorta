import { useState, useEffect, useRef } from 'react'
import { VideoPlayer } from '../../components/video-creator/VideoPlayer'

export function ExportStep({
  scenes, sceneStatuses, selectedClips, voiceoverStatuses, projectId, wizard,
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [renderState, setRenderState] = useState('idle') // idle | rendering | done | error
  const [renderPercent, setRenderPercent] = useState(0)
  const [outputUrl, setOutputUrl] = useState(null)
  const [renderError, setRenderError] = useState(null)
  const esRef = useRef(null)

  useEffect(() => () => esRef.current?.close(), [])

  // Checklist
  const imageScenes   = scenes.filter(s => s.shot_type === 'image')
  const voiceScenes   = scenes.filter(s => s.audio_path)
  const imageReady    = imageScenes.every(s => sceneStatuses[s.scene_id]?.status === 'done')
  const voiceReady    = voiceScenes.length > 0
  const canRender     = scenes.length > 0 && imageReady

  const handleRender = async () => {
    if (!canRender) return
    esRef.current?.close()
    setRenderState('rendering')
    setRenderPercent(0)
    setOutputUrl(null)
    setRenderError(null)

    try {
      const res = await fetch('/api/render', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, scenes, selectedClips }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Render failed (${res.status})`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress' && event.percent != null) {
              setRenderPercent(event.percent)
            } else if (event.type === 'done') {
              setRenderState('done')
              setRenderPercent(100)
              setOutputUrl(event.outputPath)
            } else if (event.type === 'error') {
              setRenderState('error')
              setRenderError(event.message)
            }
          } catch {}
        }
      }
    } catch (err) {
      setRenderState('error')
      setRenderError(err.message)
    }
  }

  const Check = ({ ok, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 14, color: ok ? '#4ade80' : 'rgba(255,255,255,0.25)' }}>
        {ok ? '✓' : '○'}
      </span>
      <span style={{ fontSize: 13, color: ok ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}>
        {label}
      </span>
    </div>
  )

  return (
    <div style={{ padding: '24px', maxWidth: 780 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Export Video</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Render your documentary as an MP4 file.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {scenes.length > 0 && (
            <button
              onClick={() => setShowPreview(v => !v)}
              className="vorta-btn vorta-btn-secondary"
            >
              {showPreview ? 'Hide Preview' : '▶ Preview'}
            </button>
          )}
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
        </div>
      </div>

      {showPreview && scenes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <VideoPlayer
            scenes={scenes}
            selectedClips={selectedClips}
            style={{
              width: '100%',
              maxWidth: 900,
              aspectRatio: '16 / 9',
              borderRadius: 10,
              overflow: 'hidden',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* Checklist */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 20,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Checklist
        </div>
        <Check ok={scenes.length > 0}   label={`${scenes.length} scene${scenes.length !== 1 ? 's' : ''} loaded`} />
        <Check ok={imageReady}           label={`Visuals ready (${imageScenes.filter(s => sceneStatuses[s.scene_id]?.status === 'done').length}/${imageScenes.length} images)`} />
        <Check ok={voiceReady}           label={`Narration recorded (${voiceScenes.length}/${scenes.length} scenes)`} />
      </div>

      {/* Render button */}
      {renderState === 'idle' && (
        <button
          onClick={handleRender}
          disabled={!canRender}
          className="vorta-btn vorta-btn-primary"
          style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 600, opacity: canRender ? 1 : 0.4 }}
        >
          Render MP4
        </button>
      )}

      {renderState === 'rendering' && (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 10 }}>
            Rendering… {renderPercent}%
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
            <div style={{
              height: '100%',
              width: `${renderPercent}%`,
              background: 'linear-gradient(90deg, #818cf8, #a78bfa)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {renderState === 'done' && outputUrl && (
        <div>
          <div style={{ color: '#4ade80', fontSize: 14, marginBottom: 14 }}>
            ✓ Render complete
          </div>
          <a
            href={outputUrl}
            download="documentary.mp4"
            className="vorta-btn vorta-btn-primary"
            style={{ display: 'inline-block', padding: '11px 24px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
          >
            ↓ Download MP4
          </a>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 14 }}>
            Import into CapCut or Premiere for music, colour grading, and final export.
          </p>
          <button
            onClick={() => { setRenderState('idle'); setOutputUrl(null); setRenderPercent(0) }}
            style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Re-render
          </button>
        </div>
      )}

      {renderState === 'error' && (
        <div>
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>
            {renderError || 'Render failed. Check server logs.'}
          </div>
          <button
            onClick={() => setRenderState('idle')}
            className="vorta-btn vorta-btn-ghost"
            style={{ fontSize: 13 }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
