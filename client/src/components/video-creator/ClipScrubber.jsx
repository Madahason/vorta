import { useRef, useState } from 'react'

function formatTime(seconds) {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function parseTimeInput(value) {
  const parts = value.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0)
  return parseFloat(value) || 0
}

export function ClipScrubber({ videoUrl, onSegmentSelected, maxDuration = 8 }) {
  const videoRef = useRef(null)
  const [currentTime,   setCurrentTime]   = useState(25)
  const [startTime,     setStartTime]     = useState(25)
  const [endTime,       setEndTime]       = useState(25 + maxDuration)
  const [isLoaded,      setIsLoaded]      = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [loadError,     setLoadError]     = useState(false)

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
  }

  const handleLoadedMetadata = () => {
    const dur = videoRef.current?.duration || 0
    setVideoDuration(dur)
    setIsLoaded(true)
    setLoadError(false)
    // Jump to default start position
    if (videoRef.current && dur > 25) {
      videoRef.current.currentTime = 25
    }
  }

  const handleSetStart = () => {
    if (!videoRef.current) return
    const start = videoRef.current.currentTime
    const end   = Math.min(start + maxDuration, videoDuration || start + maxDuration)
    setStartTime(start)
    setEndTime(end)
    onSegmentSelected({ startTime: start, endTime: end, duration: end - start })
  }

  const handleStartInputChange = (e) => {
    const s   = parseTimeInput(e.target.value)
    const end = Math.min(s + maxDuration, videoDuration || s + maxDuration)
    setStartTime(s)
    setEndTime(end)
    if (videoRef.current && isLoaded) videoRef.current.currentTime = s
    onSegmentSelected({ startTime: s, endTime: end, duration: end - s })
  }

  const handleEndInputChange = (e) => {
    const end        = parseTimeInput(e.target.value)
    const clampedEnd = Math.min(end, startTime + maxDuration)
    setEndTime(clampedEnd)
    onSegmentSelected({ startTime, endTime: clampedEnd, duration: clampedEnd - startTime })
  }

  const segmentWidth = videoDuration > 0
    ? `${Math.min(100, ((endTime - startTime) / videoDuration) * 100)}%`
    : '0%'
  const segmentLeft = videoDuration > 0
    ? `${Math.min(100, (startTime / videoDuration) * 100)}%`
    : '0%'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Video player */}
      <div style={{ position: 'relative', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ width: '100%', aspectRatio: '16/9', display: 'block' }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={() => setLoadError(true)}
          controls
        />
        {loadError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,0,0,0.75)', fontSize: 12,
            color: 'rgba(255,255,255,0.40)', flexDirection: 'column', gap: 6,
          }}>
            <span>Video preview not available</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Use time inputs below</span>
          </div>
        )}
      </div>

      {/* Segment track */}
      {isLoaded && videoDuration > 0 && (
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: segmentLeft, width: segmentWidth,
            height: '100%', background: '#3b82f6', borderRadius: 2, opacity: 0.8,
          }} />
        </div>
      )}

      {/* Set-start button + segment readout */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={handleSetStart}
          disabled={!isLoaded}
          style={{
            padding: '6px 12px', background: isLoaded ? '#3b82f6' : 'rgba(59,130,246,0.25)',
            border: 'none', borderRadius: 5, color: 'white',
            fontSize: 12, cursor: isLoaded ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
          }}
        >
          📍 Set start here
        </button>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
          {formatTime(startTime)} → {formatTime(endTime)}
          {' '}({(Math.max(0, endTime - startTime)).toFixed(1)}s)
        </div>
      </div>

      {/* Manual time inputs */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, width: 36 }}>Start</label>
        <input
          value={formatTime(startTime)}
          onChange={handleStartInputChange}
          style={{ width: 64, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'white', padding: '4px 7px', fontSize: 11 }}
        />
        <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, width: 26 }}>End</label>
        <input
          value={formatTime(endTime)}
          onChange={handleEndInputChange}
          style={{ width: 64, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'white', padding: '4px 7px', fontSize: 11 }}
        />
        <span style={{ color: '#eab308', fontSize: 10 }}>max {maxDuration}s</span>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10 }}>
        Tip: skip the first 20-30s to avoid title cards and intros
      </div>
    </div>
  )
}
