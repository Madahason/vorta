import { useState, useEffect, useRef } from 'react'
import { Music, Volume2, ChevronDown, ChevronUp, Loader2, Play, RefreshCw, AlertTriangle, CheckCircle, ExternalLink, X, Zap, Download } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const dot = (available) => (
  <span style={{
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
    background: available ? '#4ade80' : 'rgba(255,255,255,0.15)',
  }} />
)

export default function AudioPanel({
  scenes,
  projectId,
  audioSpecs,
  onAudioSpecsChange,
  audioVolumes,
  onVolumesChange,
}) {
  const [open,                  setOpen]                  = useState(true)
  const [audioStatus,           setAudioStatus]           = useState(null)
  const [building,              setBuilding]              = useState(false)
  const [buildError,            setBuildError]            = useState(null)
  const [showDownloadGuide,     setShowDownloadGuide]     = useState(false)
  const [playingKey,            setPlayingKey]            = useState(null)
  const [downloadingMoods,      setDownloadingMoods]      = useState({})
  const [isDownloadingAmbient,  setIsDownloadingAmbient]  = useState(false)
  const [ambientDownloadStatus, setAmbientDownloadStatus] = useState({})

  const activeAudioRef = useRef(null)
  const panelRef       = useRef(null)
  const didMountRef    = useRef(false)

  // ── Load status on first open ────────────────────────────────────────────────
  useEffect(() => {
    if (!open || audioStatus !== null) return
    fetchStatus()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatus = () =>
    fetch(`${SERVER_URL}/api/audio/status`)
      .then(r => r.json())
      .then(setAudioStatus)
      .catch(() => setAudioStatus({ error: 'Cannot reach server' }))

  // ── Scroll only on manual open ───────────────────────────────────────────────
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (open) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [open])

  // ── Primary generate action ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!scenes?.length) return
    setBuilding(true)
    setBuildError(null)
    const download = !!audioStatus?.pixabayKeySet
    try {
      const res  = await fetch(`${SERVER_URL}/api/audio/build-specs${download ? '?download=1' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes, projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Build failed')
      onAudioSpecsChange?.(data.specs)
      await fetchStatus()
    } catch (err) {
      setBuildError(err.message)
    } finally {
      setBuilding(false)
    }
  }

  // ── Per-mood download ────────────────────────────────────────────────────────
  const handleDownloadMood = async (mood) => {
    setDownloadingMoods(p => ({ ...p, [mood]: true }))
    try {
      const res  = await fetch(`${SERVER_URL}/api/audio/download-music`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchStatus()
    } catch (err) {
      console.error('[audio] download mood failed:', err.message)
    } finally {
      setDownloadingMoods(p => ({ ...p, [mood]: false }))
    }
  }

  // ── Download all missing ambient files via yt-dlp SSE ────────────────────────
  const handleDownloadAllAmbient = () => {
    setIsDownloadingAmbient(true)
    setAmbientDownloadStatus({})

    const es = new EventSource(`${SERVER_URL}/api/audio/download-ambient`)
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'downloading') {
          setAmbientDownloadStatus(p => ({ ...p, [event.key]: 'downloading' }))
        } else if (event.type === 'done') {
          setAmbientDownloadStatus(p => ({ ...p, [event.key]: 'done' }))
        } else if (event.type === 'skipped') {
          setAmbientDownloadStatus(p => ({ ...p, [event.key]: 'exists' }))
        } else if (event.type === 'error') {
          setAmbientDownloadStatus(p => ({ ...p, [event.key]: 'error' }))
        } else if (event.type === 'complete') {
          setIsDownloadingAmbient(false)
          es.close()
          fetchStatus()
        }
      } catch {}
    }
    es.onerror = () => { setIsDownloadingAmbient(false); es.close() }
  }

  // ── Sting preview ────────────────────────────────────────────────────────────
  const handlePlaySting = (sting) => {
    if (playingKey === sting.key) {
      activeAudioRef.current?.pause()
      setPlayingKey(null)
      return
    }
    activeAudioRef.current?.pause()
    const audio = new Audio(`${SERVER_URL}/library/stings/${sting.filename}`)
    audio.onended = () => setPlayingKey(null)
    audio.play().catch(() => {})
    activeAudioRef.current = audio
    setPlayingKey(sting.key)
  }

  useEffect(() => () => { activeAudioRef.current?.pause() }, [])

  // ── Derived stats ────────────────────────────────────────────────────────────
  const musicCount   = audioSpecs?.filter(s => s.music).length  || 0
  const ambientCount = audioSpecs?.filter(s => s.ambient).length || 0
  const stingCount   = audioStatus?.stingsAvailable || 0
  const ambientAvail = audioStatus?.ambientAvailable || 0
  const sceneMoods   = [...new Set((scenes || []).map(s => s.mood || 'neutral'))]
  const hasSpecs     = audioSpecs?.length > 0
  const canGenerate  = !building && !!scenes?.length

  return (
    <div ref={panelRef} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24, marginTop: 8 }}>

      {/* ── Panel header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, marginBottom: open ? 20 : 0,
        }}
      >
        <Volume2 size={14} style={{ color: 'rgba(255,255,255,0.40)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.70)' }}>
          Background Music & Sound Effects
        </span>
        {hasSpecs && (
          <span style={{
            fontSize: 10, padding: '1px 8px', borderRadius: 10,
            background: 'rgba(74,222,128,0.10)', color: '#4ade80',
            border: '1px solid rgba(74,222,128,0.20)',
          }}>
            {musicCount} music · {ambientCount} ambient
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)', display: 'flex' }}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Primary generate button ── */}
          <div>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '11px 0',
                background: canGenerate ? '#7c3aed' : 'rgba(255,255,255,0.05)',
                color: canGenerate ? '#fff' : 'rgba(255,255,255,0.25)',
                border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600,
                cursor: canGenerate ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (canGenerate) e.currentTarget.style.background = '#6d28d9' }}
              onMouseLeave={e => { if (canGenerate) e.currentTarget.style.background = '#7c3aed' }}
            >
              {building
                ? <><Loader2 size={15} className="animate-spin" /> Generating music plan…</>
                : <><Zap size={15} /> Generate Music & Sounds</>
              }
            </button>

            {/* Sub-label describing what the button does */}
            {!building && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6, textAlign: 'center' }}>
                {audioStatus?.pixabayKeySet
                  ? 'Downloads background music from Pixabay + assigns ambient & stings per scene'
                  : 'Assigns ambient loops and stings from local library (add PIXABAY_API_KEY to .env for music download)'
                }
              </p>
            )}

            {buildError && (
              <p style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{buildError}</p>
            )}

            {/* Pixabay key missing warning */}
            {audioStatus !== null && !audioStatus.pixabayKeySet && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                marginTop: 10, padding: '9px 12px',
                background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)',
                borderRadius: 7, fontSize: 11, color: 'rgba(234,179,8,0.75)',
              }}>
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                No Pixabay key — add <code style={{ margin: '0 3px', fontSize: 10 }}>PIXABAY_API_KEY=your_key</code> to <code style={{ fontSize: 10 }}>.env</code> for background music. Free key at pixabay.com/api
              </div>
            )}

            {/* Success summary */}
            {hasSpecs && !building && (
              <div style={{
                display: 'flex', gap: 16, marginTop: 12,
                padding: '9px 12px',
                background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.12)',
                borderRadius: 7,
              }}>
                {[
                  { label: 'Music', val: `${musicCount}/${scenes?.length}`, ok: musicCount > 0 },
                  { label: 'Ambient', val: `${ambientCount}/${scenes?.length}`, ok: ambientCount > 0 },
                  { label: 'Stings', val: `${stingCount}/6 files`, ok: stingCount > 0 },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: item.ok ? '#4ade80' : 'rgba(255,255,255,0.35)' }}>
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Per-mood tracks ── */}
          {audioStatus?.pixabayKeySet && sceneMoods.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Music tracks by mood
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sceneMoods.map(mood => {
                  const cached = audioStatus?.musicIndex?.[mood]
                  return (
                    <div key={mood} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
                    }}>
                      {dot(!!cached)}
                      <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.55)', textTransform: 'capitalize' }}>{mood}</span>
                      {cached
                        ? <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.60)' }}>{cached.duration ? `${cached.duration}s` : 'cached'}</span>
                        : (
                          <button
                            onClick={() => handleDownloadMood(mood)}
                            disabled={downloadingMoods[mood]}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, padding: '2px 10px',
                              background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.30)',
                              borderRadius: 4, color: 'rgba(167,139,250,0.85)', fontSize: 11, cursor: 'pointer',
                            }}
                          >
                            {downloadingMoods[mood] ? <Loader2 size={9} className="animate-spin" /> : <Music size={9} />}
                            Download
                          </button>
                        )
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Scene assignments (after generate) ── */}
          {hasSpecs && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Scene assignments
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                {audioSpecs.map(spec => (
                  <div key={spec.scene_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                    borderRadius: 4, background: 'rgba(255,255,255,0.02)',
                  }}>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', flexShrink: 0, width: 28 }}>
                      {spec.scene_id}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {spec.music ? spec.music.filename || 'music' : <span style={{ color: 'rgba(255,255,255,0.15)' }}>no music</span>}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <span title="music">{dot(!!spec.music)}</span>
                      <span title="ambient">{dot(!!spec.ambient)}</span>
                      <span title="sting">{dot(!!spec.sting)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Volume controls ── */}
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Volume levels
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'music',   label: 'Background music', max: 0.30, step: 0.01, color: '#7c3aed', hint: '10–15% recommended' },
                { key: 'ambient', label: 'Ambient sound',     max: 0.15, step: 0.005, color: '#0ea5e9', hint: '4–8% recommended' },
                { key: 'sting',   label: 'Transition stings', max: 0.80, step: 0.01, color: '#f59e0b', hint: '40–50% recommended' },
              ].map(({ key, label, max, step, color, hint }) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>{hint}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.60)', fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>
                        {Math.round((audioVolumes?.[key] ?? (key === 'music' ? 0.12 : key === 'ambient' ? 0.06 : 0.45)) * 100)}%
                      </span>
                    </div>
                  </div>
                  <input type="range" min={0} max={max} step={step}
                    value={audioVolumes?.[key] ?? (key === 'music' ? 0.12 : key === 'ambient' ? 0.06 : 0.45)}
                    onChange={e => onVolumesChange?.(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                    className="vorta-slider"
                    style={{ accentColor: color }}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* ── Ambient sound status ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Ambient loops
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                  {ambientAvail} / {audioStatus?.ambientTotal || 13} files
                </span>
                {ambientAvail < (audioStatus?.ambientTotal || 13) && (
                  <button
                    onClick={handleDownloadAllAmbient}
                    disabled={isDownloadingAmbient}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
                      padding: '2px 8px', borderRadius: 4,
                      background: isDownloadingAmbient ? 'rgba(255,255,255,0.04)' : 'rgba(124,58,237,0.15)',
                      border: `1px solid ${isDownloadingAmbient ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.30)'}`,
                      color: isDownloadingAmbient ? 'rgba(255,255,255,0.25)' : 'rgba(167,139,250,0.90)',
                      cursor: isDownloadingAmbient ? 'not-allowed' : 'pointer',
                    }}
                    title="Auto-download missing ambient files using yt-dlp + Freesound"
                  >
                    {isDownloadingAmbient ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
                    {isDownloadingAmbient ? 'Downloading…' : 'Auto-download missing'}
                  </button>
                )}
                <button
                  onClick={() => setShowDownloadGuide(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
                    color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  Manual guide <ExternalLink size={9} />
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
              {(audioStatus?.ambientDetails || []).map(file => {
                const dlStatus = ambientDownloadStatus[file.key]
                const isDownloading = dlStatus === 'downloading'
                const isDone = dlStatus === 'done' || file.available
                const isError = dlStatus === 'error'
                return (
                  <div key={file.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                    {isDownloading
                      ? <Loader2 size={7} className="animate-spin" style={{ color: '#a78bfa', flexShrink: 0 }} />
                      : isError
                        ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171', display: 'inline-block', flexShrink: 0 }} />
                        : dot(isDone)
                    }
                    <span style={{ fontSize: 10, color: isDone ? 'rgba(255,255,255,0.50)' : isError ? 'rgba(248,113,113,0.70)' : 'rgba(255,255,255,0.20)' }}>
                      {file.key.replace(/_/g, ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Transition stings ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Transition stings
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                {stingCount} / 6 files
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(audioStatus?.stings || []).map(sting => (
                <div key={sting.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                  background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
                }}>
                  {dot(sting.available)}
                  <span style={{ flex: 1, fontSize: 11, color: sting.available ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.20)' }}>
                    {sting.description}
                  </span>
                  {sting.available
                    ? (
                      <button
                        onClick={() => handlePlaySting(sting)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3, padding: '2px 9px',
                          background: playingKey === sting.key ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${playingKey === sting.key ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 4,
                          color: playingKey === sting.key ? '#4ade80' : 'rgba(255,255,255,0.40)',
                          fontSize: 10, cursor: 'pointer',
                        }}
                      >
                        <Play size={8} /> {playingKey === sting.key ? 'Playing…' : 'Preview'}
                      </button>
                    )
                    : <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>missing</span>
                  }
                </div>
              ))}
            </div>
            {stingCount < 6 && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', marginTop: 8 }}>
                Place sting .mp3 files in <code style={{ fontSize: 9, background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>library/stings/</code>
              </p>
            )}
          </div>

        </div>
      )}

      {/* ── Ambient download guide modal ── */}
      {showDownloadGuide && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowDownloadGuide(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 560, maxHeight: '80vh',
            background: 'rgba(15,15,18,0.99)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.80)' }}>
                Ambient Loop Download Guide
              </span>
              <button onClick={() => setShowDownloadGuide(false)}
                style={{ color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginBottom: 16, lineHeight: 1.6 }}>
                Download CC0-licensed ambient loops from Freesound.org and save them to{' '}
                <code style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>
                  vorta/library/ambient/
                </code>. Rename each file exactly as shown below.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(audioStatus?.ambientDetails || []).map(file => (
                  <div key={file.key} style={{
                    padding: '10px 12px', borderRadius: 6,
                    background: file.available ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${file.available ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      {dot(file.available)}
                      <code style={{ fontSize: 11, color: 'rgba(255,255,255,0.70)' }}>{file.filename}</code>
                      {file.available && <span style={{ fontSize: 9, color: '#4ade80' }}>✓ present</span>}
                    </div>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: file.available ? 0 : 6 }}>
                      {file.description}
                    </p>
                    {!file.available && (
                      <a href={file.freesoundUrl} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#3b82f6', textDecoration: 'none' }}
                      >
                        Search Freesound.org <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: 6 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>Transition stings (6 files)</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                  Place in <code style={{ fontSize: 9 }}>vorta/library/stings/</code> with exact filenames:<br />
                  sting_low_drone.mp3 · sting_rise.mp3 · sting_neutral.mp3 · sting_impact.mp3 · sting_soft_fade.mp3 · sting_whoosh.mp3
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
