import { useState, useEffect, useRef } from 'react'
import { Music, ChevronDown, ChevronUp, Loader2, Play, RefreshCw, AlertTriangle, CheckCircle, ExternalLink, X } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const sectionLabel = {
  fontSize: 11, color: 'rgba(255,255,255,0.35)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
}

const dot = (available) => (
  <span style={{
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
    background: available ? 'rgba(74,222,128,0.70)' : 'rgba(255,255,255,0.15)',
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
  const [open,              setOpen]              = useState(false)
  const [audioStatus,       setAudioStatus]       = useState(null)
  const [building,          setBuilding]          = useState(false)
  const [buildError,        setBuildError]        = useState(null)
  const [showDownloadGuide, setShowDownloadGuide] = useState(false)
  const [playingKey,        setPlayingKey]        = useState(null)
  const [downloadingMoods,  setDownloadingMoods]  = useState({})

  const activeAudioRef = useRef(null)
  const panelRef       = useRef(null)

  // ── Load status on first open ────────────────────────────────────────────────
  useEffect(() => {
    if (!open || audioStatus !== null) return
    fetch(`${SERVER_URL}/api/audio/status`)
      .then(r => r.json())
      .then(setAudioStatus)
      .catch(() => setAudioStatus({ error: 'Cannot reach server' }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll into view on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [open])

  // ── Build Music Plan ─────────────────────────────────────────────────────────
  const handleBuildPlan = async (downloadFromPixabay = false) => {
    if (!scenes?.length) return
    setBuilding(true)
    setBuildError(null)

    try {
      const url = `${SERVER_URL}/api/audio/build-specs${downloadFromPixabay ? '?download=1' : ''}`
      const res  = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes, projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Build failed')

      onAudioSpecsChange?.(data.specs)

      // Refresh status after build
      const statusRes = await fetch(`${SERVER_URL}/api/audio/status`)
      setAudioStatus(await statusRes.json())
    } catch (err) {
      setBuildError(err.message)
    } finally {
      setBuilding(false)
    }
  }

  // ── Download music for a specific mood ───────────────────────────────────────
  const handleDownloadMood = async (mood, query) => {
    setDownloadingMoods(p => ({ ...p, [mood]: true }))
    try {
      const res  = await fetch(`${SERVER_URL}/api/audio/download-music`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood, query }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Refresh status
      const statusRes = await fetch(`${SERVER_URL}/api/audio/status`)
      setAudioStatus(await statusRes.json())
    } catch (err) {
      console.error('[audio] download mood failed:', err.message)
    } finally {
      setDownloadingMoods(p => ({ ...p, [mood]: false }))
    }
  }

  // ── Play a sting preview ─────────────────────────────────────────────────────
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
  const stingCount   = audioStatus?.stingsAvailable             || 0
  const ambientAvail = audioStatus?.ambientAvailable             || 0

  // Unique moods in the current scene set
  const sceneMoods = [...new Set((scenes || []).map(s => s.mood || 'neutral'))]

  return (
    <div ref={panelRef} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, marginTop: 8 }}>

      {/* ── Panel header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, marginBottom: open ? 20 : 0,
        }}
      >
        <Music size={14} style={{ color: 'rgba(255,255,255,0.40)' }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Background Music & Sound Effects
        </span>
        {(musicCount > 0 || ambientCount > 0) && (
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'rgba(74,222,128,0.10)', color: 'rgba(74,222,128,0.70)', border: '1px solid rgba(74,222,128,0.15)' }}>
            {musicCount > 0 && `${musicCount} music`}
            {musicCount > 0 && ambientCount > 0 && ' · '}
            {ambientCount > 0 && `${ambientCount} ambient`}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)', display: 'flex' }}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Pixabay connection status ── */}
          {audioStatus !== null && (
            audioStatus.pixabayKeySet ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 11, color: 'rgba(74,222,128,0.65)',
              }}>
                <CheckCircle size={11} />
                Pixabay API connected — {audioStatus.cachedMusicTracks} track{audioStatus.cachedMusicTracks !== 1 ? 's' : ''} cached
              </div>
            ) : (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.20)',
                borderRadius: 8, fontSize: 12, color: 'rgba(234,179,8,0.80)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Add your Pixabay API key to <code style={{ fontSize: 10 }}>.env</code> to enable music download.
                  Get a free key at pixabay.com/api/docs/ — music search is free with no attribution required.
                </span>
              </div>
            )
          )}

          {/* ── Music Plan section ── */}
          <div>
            <div style={sectionLabel}>Background Music</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => handleBuildPlan(false)}
                disabled={building || !scenes?.length}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                  background: (!building && scenes?.length) ? '#7c3aed' : 'rgba(255,255,255,0.05)',
                  color: (!building && scenes?.length) ? '#fff' : 'rgba(255,255,255,0.25)',
                  border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  cursor: (!building && scenes?.length) ? 'pointer' : 'not-allowed',
                }}
              >
                {building ? <Loader2 size={11} className="animate-spin" /> : <Music size={11} />}
                {building ? 'Building plan…' : 'Build Music Plan (cached)'}
              </button>

              {audioStatus?.pixabayKeySet && (
                <button
                  onClick={() => handleBuildPlan(true)}
                  disabled={building || !scenes?.length}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 6, color: (!building && scenes?.length) ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.20)',
                    fontSize: 12, cursor: (!building && scenes?.length) ? 'pointer' : 'not-allowed',
                  }}
                  title="Search Pixabay and download tracks for any uncached moods"
                >
                  <RefreshCw size={11} /> Download from Pixabay
                </button>
              )}
            </div>

            {buildError && (
              <p style={{ fontSize: 11, color: '#f87171', marginBottom: 10 }}>{buildError}</p>
            )}

            {/* Volume slider */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>Music volume</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round((audioVolumes?.music ?? 0.12) * 100)}%
                </span>
              </div>
              <input type="range" min={0} max={0.30} step={0.01}
                value={audioVolumes?.music ?? 0.12}
                onChange={e => onVolumesChange?.(p => ({ ...p, music: parseFloat(e.target.value) }))}
                style={{ width: '100%', accentColor: '#7c3aed' }}
              />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>Recommended: 10–15% under narration</span>
            </label>

            {/* Per-mood download buttons */}
            {sceneMoods.length > 0 && audioStatus?.pixabayKeySet && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>
                  Moods in this project
                </div>
                {sceneMoods.map(mood => {
                  const cached = audioStatus?.musicIndex?.[mood]
                  return (
                    <div key={mood} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', borderRadius: 5,
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      {dot(!!cached)}
                      <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>{mood}</span>
                      {cached ? (
                        <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.55)' }}>
                          {cached.duration ? `${cached.duration}s` : 'cached'}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDownloadMood(mood)}
                          disabled={downloadingMoods[mood]}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                            background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)',
                            borderRadius: 4, color: 'rgba(167,139,250,0.80)', fontSize: 10, cursor: 'pointer',
                          }}
                        >
                          {downloadingMoods[mood] ? <Loader2 size={9} className="animate-spin" /> : null}
                          Download
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Per-scene music assignments */}
            {audioSpecs?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 6 }}>
                  Scene assignments
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
                  {audioSpecs.map(spec => (
                    <div key={spec.scene_id} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.02)',
                    }}>
                      <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.30)', flexShrink: 0 }}>
                        {spec.scene_id}
                      </span>
                      {dot(!!spec.music)}
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {spec.music
                          ? spec.music.filename || 'music cached'
                          : <span style={{ color: 'rgba(255,255,255,0.18)' }}>no music</span>
                        }
                      </span>
                      {dot(!!spec.ambient)}
                      {dot(!!spec.sting)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Ambient Sound section ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={sectionLabel}>Ambient Sound</span>
              <button
                onClick={() => setShowDownloadGuide(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                  color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                Download guide <ExternalLink size={9} />
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>Ambient volume</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round((audioVolumes?.ambient ?? 0.06) * 100)}%
                </span>
              </div>
              <input type="range" min={0} max={0.15} step={0.005}
                value={audioVolumes?.ambient ?? 0.06}
                onChange={e => onVolumesChange?.(p => ({ ...p, ambient: parseFloat(e.target.value) }))}
                style={{ width: '100%', accentColor: '#0ea5e9' }}
              />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>Barely audible texture — recommended: 4–8%</span>
            </label>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
            }}>
              {(audioStatus?.ambientDetails || []).map(file => (
                <div key={file.key} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 0',
                }}>
                  {dot(file.available)}
                  <span style={{ fontSize: 10, color: file.available ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.22)' }}>
                    {file.key.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>

            {ambientAvail < (audioStatus?.ambientTotal || 13) && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                {ambientAvail} / {audioStatus?.ambientTotal} ambient files present.{' '}
                <button onClick={() => setShowDownloadGuide(true)}
                  style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10 }}>
                  Download guide →
                </button>
              </p>
            )}
          </div>

          {/* ── Transition Stings section ── */}
          <div>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Transition Stings</div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>Sting volume</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round((audioVolumes?.sting ?? 0.45) * 100)}%
                </span>
              </div>
              <input type="range" min={0} max={0.80} step={0.01}
                value={audioVolumes?.sting ?? 0.45}
                onChange={e => onVolumesChange?.(p => ({ ...p, sting: parseFloat(e.target.value) }))}
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(audioStatus?.stings || []).map(sting => (
                <div key={sting.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', borderRadius: 5,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  {dot(sting.available)}
                  <span style={{ flex: 1, fontSize: 11, color: sting.available ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)' }}>
                    {sting.description}
                  </span>
                  {sting.available && (
                    <button
                      onClick={() => handlePlaySting(sting)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                        background: playingKey === sting.key ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${playingKey === sting.key ? 'rgba(74,222,128,0.20)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 4, color: playingKey === sting.key ? 'rgba(74,222,128,0.80)' : 'rgba(255,255,255,0.40)',
                        fontSize: 10, cursor: 'pointer',
                      }}
                    >
                      <Play size={8} /> Preview
                    </button>
                  )}
                  {!sting.available && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>missing</span>
                  )}
                </div>
              ))}
            </div>

            {stingCount < 6 && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                Place sting files in <code style={{ fontSize: 9 }}>vorta/library/stings/</code>
              </p>
            )}
          </div>

          {/* ── Status summary ── */}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', lineHeight: 1.7 }}>
            {musicCount}/{scenes?.length || 0} scenes with music ·{' '}
            {ambientCount}/{scenes?.length || 0} with ambient ·{' '}
            {stingCount}/6 stings ready
          </div>

        </div>
      )}

      {/* ── Download guide modal ── */}
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
                Ambient Sound Download Guide
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
                </code>.
                Any CC0 or Attribution file works — download as MP3.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(audioStatus?.ambientDetails || []).map(file => (
                  <div key={file.key} style={{
                    padding: '10px 12px', borderRadius: 6,
                    background: file.available ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${file.available ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {dot(file.available)}
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.70)' }}>
                        {file.filename}
                      </span>
                      {file.available && <span style={{ fontSize: 9, color: 'rgba(74,222,128,0.60)' }}>✓ present</span>}
                    </div>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
                      {file.description}
                    </p>
                    {!file.available && (
                      <a
                        href={file.freesoundUrl}
                        target="_blank" rel="noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 10, color: '#3b82f6', textDecoration: 'none',
                        }}
                      >
                        Search Freesound.org <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 16, padding: '10px 12px',
                background: 'rgba(255,255,255,0.025)', borderRadius: 6,
              }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                  Transition stings (6 files)
                </p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                  Place in <code style={{ fontSize: 9 }}>vorta/library/stings/</code>. Filename must match exactly:
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
