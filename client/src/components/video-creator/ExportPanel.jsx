import { useState, useEffect, useRef } from 'react'
import { Download, Loader2, X, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from 'lucide-react'

// SSE must connect directly to Express — Vite proxy buffers text/event-stream
const SERVER_URL = 'http://localhost:3001'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ExportPanel({ scenes, sceneStatuses, selectedClips, projectId }) {
  const [renderState, setRenderState] = useState('idle') // idle | rendering | done | error
  const [progress, setProgress]       = useState({ percent: 0, frame: 0, totalFrames: 0 })
  const [elapsed, setElapsed]         = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorLogs, setErrorLogs]     = useState('')
  const [showLogs, setShowLogs]       = useState(false)
  const [outputPath, setOutputPath]   = useState(null)
  const [fileSize, setFileSize]       = useState(null)
  const [totalRenderTime, setTotalRenderTime] = useState(null)

  const startTimeRef    = useRef(null)
  const elapsedRef      = useRef(null)
  const sseRef          = useRef(null)

  // ─── computed checklist values ──────────────────────────────────────────────
  const imageScenes    = scenes.filter(s => s.shot_type === 'image')
  const motionScenes   = scenes.filter(s => s.shot_type === 'motion_graphic')
  const footageScenes  = scenes.filter(s => s.shot_type === 'real_footage')

  const imageReady     = imageScenes.filter(s => sceneStatuses[s.scene_id]?.status === 'done').length
  const footageMatched = footageScenes.filter(s => selectedClips?.[s.scene_id]).length
  const footageUnmatched = footageScenes.length - footageMatched

  const totalDurationSec  = scenes.reduce((sum, s) => sum + (s.duration_seconds || 5), 0)
  const totalFrames       = totalDurationSec * 30
  const estRenderMinutes  = Math.max(1, Math.ceil(totalFrames / 30 / 10))

  const readyCount   = imageReady + motionScenes.length + footageMatched
  const readyPercent = scenes.length > 0 ? (readyCount / scenes.length) * 100 : 0
  const canRender    = scenes.length > 0 && readyPercent >= 50 && !!projectId

  // estimated remaining during render
  const estRemaining = (() => {
    if (progress.percent <= 0 || elapsed <= 0) return null
    const totalEst = elapsed / (progress.percent / 100)
    const rem = Math.max(0, Math.round(totalEst - elapsed))
    return rem
  })()

  // ─── cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      sseRef.current?.close()
      clearInterval(elapsedRef.current)
    }
  }, [])

  // ─── start render ────────────────────────────────────────────────────────────
  const handleRender = async () => {
    if (!canRender) return

    setRenderState('rendering')
    setProgress({ percent: 0, frame: 0, totalFrames: 0 })
    setElapsed(0)
    setErrorMessage('')
    setErrorLogs('')
    setShowLogs(false)
    setOutputPath(null)
    setFileSize(null)
    setTotalRenderTime(null)

    startTimeRef.current = Date.now()
    clearInterval(elapsedRef.current)
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    // Merge image_path from sceneStatuses onto each scene for the render backend
    const scenesWithPaths = scenes.map(s => ({
      ...s,
      image_path: sceneStatuses[s.scene_id]?.image_path || null,
    }))

    try {
      const res  = await fetch(`${SERVER_URL}/api/render`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, scenes: scenesWithPaths, selectedClips }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start render')
      subscribeToProgress(projectId)
    } catch (err) {
      setRenderState('error')
      setErrorMessage(err.message)
      clearInterval(elapsedRef.current)
    }
  }

  // ─── SSE subscription ────────────────────────────────────────────────────────
  const subscribeToProgress = (pid) => {
    sseRef.current?.close()
    const es = new EventSource(`${SERVER_URL}/api/render/progress/${pid}`)
    sseRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)

      if (event.type === 'progress') {
        setProgress({ percent: event.percent, frame: event.frame, totalFrames: event.totalFrames })
      } else if (event.type === 'done') {
        const rt = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setTotalRenderTime(rt)
        setOutputPath(event.outputPath)
        setFileSize(event.fileSize || null)
        setRenderState('done')
        clearInterval(elapsedRef.current)
        es.close()
      } else if (event.type === 'error') {
        setErrorMessage(event.message || 'Render failed')
        setErrorLogs(event.message || '')
        setRenderState('error')
        clearInterval(elapsedRef.current)
        es.close()
      }
    }

    es.onerror = () => {
      // Connection dropped after render completed is normal — only flag error if still rendering
      es.close()
    }
  }

  // ─── cancel ──────────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    sseRef.current?.close()
    clearInterval(elapsedRef.current)
    try {
      await fetch(`${SERVER_URL}/api/render/${projectId}`, { method: 'DELETE' })
    } catch {}
    setRenderState('idle')
    setProgress({ percent: 0, frame: 0, totalFrames: 0 })
    setElapsed(0)
  }

  // ─── reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setRenderState('idle')
    setProgress({ percent: 0, frame: 0, totalFrames: 0 })
    setElapsed(0)
    setErrorMessage('')
    setErrorLogs('')
    setShowLogs(false)
    setOutputPath(null)
    setFileSize(null)
    setTotalRenderTime(null)
  }

  // ─── UI helpers ──────────────────────────────────────────────────────────────
  const statusDot = (status) => {
    if (status === 'ok')   return <span style={{ color: '#4ade80', fontSize: 10 }}>●</span>
    if (status === 'warn') return <span style={{ color: '#fbbf24', fontSize: 10 }}>●</span>
    return                        <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>●</span>
  }

  const checklist = [
    {
      label:  'Total scenes',
      value:  scenes.length.toString(),
      status: 'neutral',
    },
    {
      label:  'Image scenes ready',
      value:  `${imageReady} / ${imageScenes.length}`,
      status: imageScenes.length === 0 ? 'neutral' : imageReady === imageScenes.length ? 'ok' : 'warn',
    },
    {
      label:  'Motion graphic scenes',
      value:  motionScenes.length.toString(),
      status: 'neutral',
    },
    {
      label:  'Real footage scenes',
      value:  footageUnmatched > 0
        ? `${footageMatched} matched · ${footageUnmatched} will use placeholder`
        : footageScenes.length > 0 ? `${footageScenes.length} matched` : '0',
      status: footageScenes.length === 0 ? 'neutral' : footageUnmatched > 0 ? 'warn' : 'ok',
    },
    {
      label:  'Estimated duration',
      value:  `${Math.floor(totalDurationSec / 60)}m ${totalDurationSec % 60}s`,
      status: 'neutral',
    },
    {
      label:  'Estimated render time',
      value:  `~${estRenderMinutes} minute${estRenderMinutes !== 1 ? 's' : ''}`,
      status: 'neutral',
    },
  ]

  // ─── styles ──────────────────────────────────────────────────────────────────
  const panelStyle = {
    marginTop: 40,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: 32,
  }

  const labelStyle = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 16,
  }

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Export</div>

      {/* Pre-render checklist */}
      {renderState === 'idle' && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px 24px',
            marginBottom: 24,
          }}>
            {checklist.map(item => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.025)',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                {statusDot(item.status)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', marginBottom: 1 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', fontVariantNumeric: 'tabular-nums' }}>
                    {item.value}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Warnings */}
          {imageScenes.length > 0 && imageReady < imageScenes.length && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 16, padding: '8px 12px',
              background: 'rgba(251,191,36,0.06)',
              border: '1px solid rgba(251,191,36,0.15)',
              borderRadius: 6, fontSize: 12,
              color: 'rgba(251,191,36,0.80)',
            }}>
              <AlertCircle size={13} />
              {imageScenes.length - imageReady} image scene{imageScenes.length - imageReady !== 1 ? 's' : ''} not yet generated — will render as placeholder
            </div>
          )}

          {/* Render button */}
          <button
            onClick={handleRender}
            disabled={!canRender}
            title={!projectId ? 'Run analysis first' : !canRender ? 'At least 50% of scenes must be ready' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px',
              background: canRender ? '#2563eb' : 'rgba(255,255,255,0.06)',
              color: canRender ? '#fff' : 'rgba(255,255,255,0.25)',
              border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 500,
              cursor: canRender ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (canRender) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { if (canRender) e.currentTarget.style.background = '#2563eb' }}
          >
            <Download size={14} />
            Render MP4
          </button>

          {!projectId && (
            <p style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              Run analysis first to enable rendering
            </p>
          )}
        </>
      )}

      {/* Progress UI */}
      {renderState === 'rendering' && (
        <div style={{ maxWidth: 560 }}>
          {/* Progress bar */}
          <div style={{
            height: 6, background: 'rgba(255,255,255,0.08)',
            borderRadius: 3, overflow: 'hidden', marginBottom: 12,
          }}>
            <div style={{
              height: '100%',
              width: `${progress.percent}%`,
              background: '#3b82f6',
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }} />
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', fontVariantNumeric: 'tabular-nums' }}>
              {progress.percent > 0
                ? `${progress.percent}%${progress.frame > 0 ? ` — Frame ${progress.frame}${progress.totalFrames > 0 ? ` / ${progress.totalFrames}` : ''}` : ''}`
                : 'Starting render…'}
            </div>
            <button
              onClick={handleCancel}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 6, color: '#f87171',
                fontSize: 12, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
            >
              <X size={11} /> Cancel render
            </button>
          </div>

          {/* Time row */}
          <div style={{ display: 'flex', gap: 24, fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>
            <span>Elapsed: {formatTime(elapsed)}</span>
            {estRemaining !== null && (
              <span>Est. remaining: ~{formatTime(estRemaining)}</span>
            )}
          </div>
        </div>
      )}

      {/* Done state */}
      {renderState === 'done' && (
        <div style={{ maxWidth: 560 }}>
          {/* Filled progress bar */}
          <div style={{
            height: 6, background: 'rgba(255,255,255,0.08)',
            borderRadius: 3, overflow: 'hidden', marginBottom: 16,
          }}>
            <div style={{ height: '100%', width: '100%', background: '#22c55e', borderRadius: 3 }} />
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, color: '#4ade80' }}>
              Render complete{totalRenderTime ? ` in ${formatTime(totalRenderTime)}` : ''}
            </span>
            {fileSize > 0 && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>
                {formatFileSize(fileSize)}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <a
              href={`${SERVER_URL}${outputPath}`}
              download="documentary.mp4"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px',
                background: '#16a34a',
                color: '#fff',
                borderRadius: 8, textDecoration: 'none',
                fontSize: 13, fontWeight: 500,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#15803d' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#16a34a' }}
            >
              <Download size={14} />
              Download MP4
            </a>
            <button
              onClick={handleReset}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8, color: 'rgba(255,255,255,0.50)',
                fontSize: 13, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.50)' }}
            >
              <RefreshCw size={13} /> Render again
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {renderState === 'error' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{
            padding: '12px 14px',
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.18)',
            borderRadius: 8, marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: errorLogs ? 10 : 0 }}>
              <AlertCircle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#fca5a5' }}>
                {errorMessage || 'Render failed'}
              </span>
            </div>

            {errorLogs && (
              <>
                <button
                  onClick={() => setShowLogs(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'none', border: 'none',
                    color: 'rgba(255,255,255,0.35)', fontSize: 11,
                    cursor: 'pointer', padding: 0, marginTop: 6,
                  }}
                >
                  {showLogs ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {showLogs ? 'Hide logs' : 'View logs'}
                </button>
                {showLogs && (
                  <pre style={{
                    marginTop: 8, padding: 10,
                    background: 'rgba(0,0,0,0.40)',
                    borderRadius: 4, fontSize: 10,
                    color: 'rgba(255,255,255,0.45)',
                    overflowX: 'auto', maxHeight: 160,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {errorLogs}
                  </pre>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleRender}
              disabled={!canRender}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 18px',
                background: canRender ? '#2563eb' : 'rgba(255,255,255,0.06)',
                border: 'none', borderRadius: 8,
                color: canRender ? '#fff' : 'rgba(255,255,255,0.25)',
                fontSize: 13, fontWeight: 500,
                cursor: canRender ? 'pointer' : 'not-allowed',
              }}
            >
              <RefreshCw size={13} /> Retry render
            </button>
            <button
              onClick={handleReset}
              style={{
                padding: '9px 14px',
                background: 'none',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8, color: 'rgba(255,255,255,0.35)',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
