import { useState, useEffect, useRef } from 'react'
import { Volume2, ChevronDown, ChevronUp, Loader2, Zap, Sparkles } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const dot = (available) => (
  <span style={{
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
    background: available ? '#4ade80' : 'rgba(255,255,255,0.15)',
  }} />
)

const SourceBadge = ({ label, color }) => (
  <span style={{
    fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 500,
    background: `${color}18`, color, border: `1px solid ${color}35`,
  }}>{label}</span>
)

export default function AudioPanel({
  scenes,
  projectId,
  audioSpecs,
  onBuildSpecs,
  onApplySpecs,
  audioVolumes,
  onVolumesChange,
}) {
  const [open,              setOpen]              = useState(true)
  const [audioStatus,       setAudioStatus]       = useState(null)
  const [building,          setBuilding]          = useState(false)
  const [buildError,        setBuildError]        = useState(null)
  const [playingKey,        setPlayingKey]        = useState(null)
  const [soundLibraryStats, setSoundLibraryStats] = useState(null)
  const [isPrewarming,      setIsPrewarming]      = useState(false)
  const [prewarmProgress,   setPrewarmProgress]   = useState({ done: 0, total: 8, current: null, errors: [] })

  const activeAudioRef = useRef(null)
  const panelRef       = useRef(null)
  const didMountRef    = useRef(false)

  useEffect(() => {
    if (!open || audioStatus !== null) return
    fetchStatus()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatus = () =>
    fetch(`${SERVER_URL}/api/audio/status`)
      .then(r => r.json())
      .then(data => { setAudioStatus(data); setSoundLibraryStats(data.soundLibrary || null) })
      .catch(() => setAudioStatus({ error: 'Cannot reach server' }))

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (open) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [open])

  const handleGenerate = async () => {
    if (!scenes?.length) return
    setBuilding(true)
    setBuildError(null)
    console.log('[AudioPanel] Generate clicked — scenes:', scenes?.length)
    try {
      await onBuildSpecs?.()
      console.log('[AudioPanel] onBuildSpecs resolved — audioSpecs prop after build:', audioSpecs?.length)
      await fetchStatus()
    } catch (err) {
      console.error('[AudioPanel] Generate failed:', err.message)
      setBuildError(err.message)
    } finally {
      setBuilding(false)
    }
  }

  const handlePrewarmMusic = () => {
    if (isPrewarming) return
    setIsPrewarming(true)
    setPrewarmProgress({ done: 0, total: 8, current: null, errors: [] })

    const es = new EventSource(`/api/audio/prewarm-music`)
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'generating') {
          setPrewarmProgress(p => ({ ...p, current: event.mood, done: event.done, total: event.total }))
        } else if (event.type === 'done') {
          setPrewarmProgress(p => ({ ...p, done: event.done, total: event.total, current: null }))
        } else if (event.type === 'error') {
          setPrewarmProgress(p => ({ ...p, done: event.done, total: event.total, current: null, errors: [...p.errors, event.mood] }))
        } else if (event.type === 'complete') {
          setIsPrewarming(false)
          es.close()
          fetchStatus()
        }
      } catch {}
    }
    es.onerror = () => { setIsPrewarming(false); es.close() }
  }

  const handlePlayPreview = (url) => {
    activeAudioRef.current?.pause()
    const audio = new Audio(`${SERVER_URL}${url}`)
    audio.onended = () => setPlayingKey(null)
    audio.play().catch(() => {})
    activeAudioRef.current = audio
  }

  useEffect(() => () => { activeAudioRef.current?.pause() }, [])

  const musicCount   = audioSpecs?.filter(s => s.music).length   || 0
  const ambientCount = audioSpecs?.filter(s => s.ambient).length  || 0
  const stingCount   = soundLibraryStats?.byType?.sting || 0
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

          {/* ── Audio source cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Background Music', source: 'ElevenLabs AI', color: '#a78bfa', count: audioStatus?.cachedMusicTracks || 0, unit: 'moods' },
              { label: 'Ambient Sound',    source: 'ElevenLabs AI', color: '#38bdf8', count: audioStatus?.cachedAmbientTracks || 0, unit: 'scenes' },
              { label: 'Transition Stings',source: 'ElevenLabs AI', color: '#fbbf24', count: stingCount, unit: '/ 6' },
            ].map(({ label, source, color, count, unit }) => (
              <div key={label} style={{
                padding: '8px 10px', borderRadius: 7,
                background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)' }}>{unit}</span>
                </div>
                <SourceBadge label={source} color={color} />
              </div>
            ))}
          </div>

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
                ? <><Loader2 size={15} className="animate-spin" /> Generating with ElevenLabs AI…</>
                : <><Zap size={15} /> Generate Music & Sounds</>
              }
            </button>

            {!building && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6, textAlign: 'center' }}>
                Generates AI music per mood and ambient sound per scene via ElevenLabs
              </p>
            )}

            {buildError && (
              <p style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{buildError}</p>
            )}

            {audioStatus !== null && !audioStatus.elevenlabsConnected && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, padding: '9px 12px',
                background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)',
                borderRadius: 7, fontSize: 11, color: 'rgba(234,179,8,0.75)',
              }}>
                No ElevenLabs key — add <code style={{ margin: '0 3px', fontSize: 10 }}>ELEVENLABS_API_KEY</code> to <code style={{ fontSize: 10 }}>.env</code>.
              </div>
            )}

            {hasSpecs && !building && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)',
                borderRadius: 8,
              }}>
                <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  ✓ Audio plan ready — {audioSpecs?.length} scenes · saved to video
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>🎵 Music: {musicCount} scenes</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>🔊 Ambient: {ambientCount} scenes</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>🎤 Narration: {audioSpecs?.filter(s => s.narration)?.length || 0} scenes</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Pre-warm all music moods ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Music library
              </span>
              <button
                onClick={handlePrewarmMusic}
                disabled={isPrewarming}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                  padding: '2px 10px', borderRadius: 4,
                  background: isPrewarming ? 'rgba(255,255,255,0.04)' : 'rgba(167,139,250,0.12)',
                  border: `1px solid ${isPrewarming ? 'rgba(255,255,255,0.08)' : 'rgba(167,139,250,0.30)'}`,
                  color: isPrewarming ? 'rgba(255,255,255,0.25)' : 'rgba(167,139,250,0.90)',
                  cursor: isPrewarming ? 'not-allowed' : 'pointer',
                }}
              >
                {isPrewarming
                  ? <><Loader2 size={9} className="animate-spin" /> Generating {prewarmProgress.done}/{prewarmProgress.total}…</>
                  : <><Sparkles size={9} /> Pre-generate all moods</>
                }
              </button>
            </div>

            {isPrewarming && prewarmProgress.current && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{
                    height: '100%',
                    width: `${(prewarmProgress.done / prewarmProgress.total) * 100}%`,
                    background: '#a78bfa', transition: 'width 0.4s',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>
                  Generating: <span style={{ color: 'rgba(167,139,250,0.70)', textTransform: 'capitalize' }}>{prewarmProgress.current}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
              {['tense', 'triumphant', 'somber', 'neutral', 'dramatic', 'reflective', 'anticipatory', 'institutional'].map(mood => {
                const cached  = audioStatus?.musicIndex?.[`music_${mood}`]
                const isScene = sceneMoods.includes(mood)
                return (
                  <div key={mood} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                    {dot(!!cached)}
                    <span style={{
                      fontSize: 10, textTransform: 'capitalize',
                      color: cached ? 'rgba(255,255,255,0.50)' : isScene ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)',
                    }}>
                      {mood}
                    </span>
                    {cached && <span style={{ fontSize: 9, color: 'rgba(74,222,128,0.50)', marginLeft: 'auto' }}>✓</span>}
                    {!cached && isScene && <span style={{ fontSize: 9, color: 'rgba(167,139,250,0.40)', marginLeft: 'auto' }}>needed</span>}
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)', marginTop: 6 }}>
              ElevenLabs AI — one 60s track per mood, cached in library/music/
            </p>
          </div>

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

          {/* ── Sound library summary ── */}
          {soundLibraryStats !== null && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Sound library
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
                {[
                  { label: 'Transition stings', count: soundLibraryStats.byType?.sting   || 0, total: 6,  color: '#fbbf24' },
                  { label: 'Ambient loops',     count: soundLibraryStats.byType?.ambient || 0, total: 12, color: '#38bdf8' },
                  { label: 'Overlay sounds',    count: soundLibraryStats.byType?.overlay || 0, total: 11, color: '#f59e0b' },
                  { label: 'Music tracks',      count: soundLibraryStats.byType?.music   || 0, total: 8,  color: '#a78bfa' },
                ].map(({ label, count, total, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                    {dot(count >= total)}
                    <span style={{ fontSize: 10, color: count > 0 ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.22)' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 9, color, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                      {count}/{total}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)', marginTop: 6 }}>
                ElevenLabs AI — use the Sound Library button to pre-generate all 29 sounds
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
