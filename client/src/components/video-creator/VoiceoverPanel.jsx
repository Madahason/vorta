import { useState, useEffect, useRef } from 'react'
import { Mic, ChevronDown, ChevronUp, Play, Loader2, RefreshCw, CheckCircle } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const MODELS = [
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2',  desc: 'Best quality, multilingual (default)' },
  { id: 'eleven_flash_v2_5',      name: 'Flash v2.5',        desc: 'Fastest, lower cost' },
  { id: 'eleven_v3',              name: 'v3 (Alpha)',         desc: 'Most expressive, best for documentary' },
]

function StatusDot({ status }) {
  if (status === 'generating') return <Loader2 size={10} className="animate-spin" style={{ color: '#3b82f6', flexShrink: 0 }} />
  if (status === 'done')       return <span style={{ color: '#4ade80', fontSize: 10, flexShrink: 0 }}>●</span>
  if (status === 'error')      return <span style={{ color: '#f87171', fontSize: 10, flexShrink: 0 }}>●</span>
  return                              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10, flexShrink: 0 }}>●</span>
}

export default function VoiceoverPanel({
  scenes,
  projectId,
  selectedVoiceId,
  onSelectedVoiceChange,
  onScenesChange,
  onVoiceoverStatusChange,
}) {
  const [open,          setOpen]          = useState(false)
  const [voices,        setVoices]        = useState([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [voiceSearch,   setVoiceSearch]   = useState('')
  const [model,         setModel]         = useState('eleven_multilingual_v2')
  const [settings,      setSettings]      = useState({ stability: 0.5, similarityBoost: 0.75, style: 0.0 })
  const [generating,    setGenerating]    = useState(false)
  const [sceneStatuses, setSceneStatuses] = useState({}) // { [scene_id]: { status, duration, error } }
  const [previewLoading, setPreviewLoading] = useState({})

  const activeAudioRef = useRef(null)

  // Load voices when panel first opens
  useEffect(() => {
    if (!open || voices.length > 0) return
    setVoicesLoading(true)
    fetch(`${SERVER_URL}/api/voiceover/voices`)
      .then(r => r.json())
      .then(data => { setVoices(Array.isArray(data) ? data : []); setVoicesLoading(false) })
      .catch(() => setVoicesLoading(false))
  }, [open])

  useEffect(() => () => { activeAudioRef.current?.pause() }, [])

  // Scenes that can have voiceover (have script text)
  const realScenes = scenes.filter(s => s.script_excerpt?.trim())

  const doneCount = realScenes.filter(s => {
    const st = sceneStatuses[s.scene_id]
    return st?.status === 'done' || s.audio_path
  }).length

  const totalNarrationSec = realScenes.reduce((sum, s) => {
    const st = sceneStatuses[s.scene_id]
    return sum + (st?.duration || s.audio_duration || 0)
  }, 0)

  const handlePreview = async (voice) => {
    activeAudioRef.current?.pause()
    setPreviewLoading(p => ({ ...p, [voice.voice_id]: true }))
    try {
      const res  = await fetch(`${SERVER_URL}/api/voiceover/preview`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ voiceId: voice.voice_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const audio = new Audio(`${SERVER_URL}${data.preview_url}`)
      audio.play().catch(() => {})
      activeAudioRef.current = audio
    } catch (err) {
      console.error('[voiceover] preview failed:', err.message)
    } finally {
      setPreviewLoading(p => ({ ...p, [voice.voice_id]: false }))
    }
  }

  const handleSelectVoice = (voiceId) => {
    onSelectedVoiceChange(voiceId)
    localStorage.setItem('vorta_selected_voice', voiceId)
  }

  const handleGenerate = async (mode = 'full', targetSceneId = null) => {
    if (!selectedVoiceId || !projectId) return
    setGenerating(true)

    const toGenerate = mode === 'scene'
      ? realScenes.filter(s => s.scene_id === targetSceneId)
      : realScenes

    // Mark all as generating
    const initStatuses = { ...sceneStatuses }
    toGenerate.forEach(s => { initStatuses[s.scene_id] = { status: 'generating', duration: null, error: null } })
    setSceneStatuses(initStatuses)
    onVoiceoverStatusChange?.(initStatuses)

    try {
      const response = await fetch(`${SERVER_URL}/api/voiceover/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectId,
          scenes:        toGenerate,
          voiceId:       selectedVoiceId,
          modelId:       model,
          mode,
          sceneId:       targetSceneId,
          voiceSettings: settings,
        }),
      })

      if (!response.body) throw new Error('No response stream')

      const reader  = response.body.getReader()
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

            if (event.type === 'scene_done') {
              const { scene_id, audio_path, duration } = event
              setSceneStatuses(prev => {
                const next = { ...prev, [scene_id]: { status: 'done', duration, error: null } }
                onVoiceoverStatusChange?.(next)
                return next
              })
              onScenesChange(prev => prev.map(s =>
                s.scene_id !== scene_id ? s : {
                  ...s,
                  audio_path,
                  audio_duration:   duration,
                  duration_seconds: duration ? Math.ceil(duration + 0.5) : s.duration_seconds,
                }
              ))
            } else if (event.type === 'scene_error') {
              const { scene_id, error } = event
              setSceneStatuses(prev => {
                const next = { ...prev, [scene_id]: { status: 'error', duration: null, error } }
                onVoiceoverStatusChange?.(next)
                return next
              })
            }
          } catch { /* skip malformed events */ }
        }
      }
    } catch (err) {
      console.error('[voiceover] generation failed:', err.message)
      toGenerate.forEach(s => {
        setSceneStatuses(prev => {
          const next = { ...prev, [s.scene_id]: { status: 'error', duration: null, error: err.message } }
          onVoiceoverStatusChange?.(next)
          return next
        })
      })
    } finally {
      setGenerating(false)
    }
  }

  // Sync all scene durations to audio_duration + 0.5s buffer
  const handleSyncTimings = () => {
    let count = 0
    const updated = scenes.map(s => {
      if (!s.audio_duration) return s
      count++
      return { ...s, duration_seconds: Math.ceil(s.audio_duration + 0.5) }
    })
    onScenesChange(() => updated)
    const totalSec = updated.reduce((sum, s) => sum + (s.duration_seconds || 5), 0)
    console.log(`[voiceover] synced ${count} scene durations — total: ${totalSec}s`)
  }

  // Voice filter + group by category
  const filteredVoices = voices.filter(v => {
    const q = voiceSearch.toLowerCase()
    return !q || v.name.toLowerCase().includes(q) ||
      (v.labels && Object.values(v.labels).some(l => l?.toLowerCase().includes(q)))
  })

  const grouped = filteredVoices.reduce((acc, v) => {
    const cat = v.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(v)
    return acc
  }, {})

  const canGenerate = !!selectedVoiceId && !!projectId && !generating

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, marginTop: 8 }}>

      {/* ── Panel header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, marginBottom: open ? 20 : 0,
        }}
      >
        <Mic size={14} style={{ color: 'rgba(255,255,255,0.40)' }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Voiceover
        </span>
        {doneCount > 0 && (
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'rgba(74,222,128,0.10)', color: 'rgba(74,222,128,0.70)', border: '1px solid rgba(74,222,128,0.15)' }}>
            {doneCount} / {realScenes.length} ready
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)', display: 'flex' }}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Voice selector ── */}
          <div>
            <div style={sectionLabelStyle}>Voice</div>
            <input
              type="text"
              placeholder="Search voices…"
              value={voiceSearch}
              onChange={e => setVoiceSearch(e.target.value)}
              style={{
                width: '100%', marginBottom: 8, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 6, color: 'rgba(255,255,255,0.70)',
                fontSize: 12, padding: '6px 10px', outline: 'none',
              }}
            />
            {voicesLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.30)', fontSize: 12 }}>
                <Loader2 size={12} className="animate-spin" /> Loading voices…
              </div>
            )}
            {!voicesLoading && voices.length === 0 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
                No voices found — check your ElevenLabs API key in Settings.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 300, overflowY: 'auto' }}>
              {Object.entries(grouped).map(([category, catVoices]) => (
                <div key={category}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.10em', padding: '5px 0 3px' }}>
                    {category}
                  </div>
                  {catVoices.map(voice => (
                    <div
                      key={voice.voice_id}
                      onClick={() => handleSelectVoice(voice.voice_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                        background: selectedVoiceId === voice.voice_id ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${selectedVoiceId === voice.voice_id ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
                        marginBottom: 3,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 2 }}>{voice.name}</div>
                        {voice.labels && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {Object.values(voice.labels).filter(Boolean).slice(0, 4).map((label, i) => (
                              <span key={i} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' }}>
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedVoiceId === voice.voice_id && (
                        <CheckCircle size={12} style={{ color: '#3b82f6', flexShrink: 0 }} />
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handlePreview(voice) }}
                        disabled={previewLoading[voice.voice_id]}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 8px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                          color: 'rgba(255,255,255,0.45)', fontSize: 10, cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {previewLoading[voice.voice_id] ? <Loader2 size={9} className="animate-spin" /> : <Play size={9} />}
                        Preview
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Model selector ── */}
          <div>
            <div style={sectionLabelStyle}>Model</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {MODELS.map(m => (
                <label
                  key={m.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: model === m.id ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${model === m.id ? 'rgba(59,130,246,0.20)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <input
                    type="radio" name="voiceover-model" value={m.id}
                    checked={model === m.id}
                    onChange={() => setModel(m.id)}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)' }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── Voice settings ── */}
          <div>
            <div style={sectionLabelStyle}>Voice Settings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'stability',       label: 'Stability',           tip: 'Lower = more expressive · Higher = more consistent' },
                { key: 'similarityBoost', label: 'Similarity Boost',    tip: 'How closely to match the original voice sample' },
                { key: 'style',           label: 'Style Exaggeration',  tip: 'Amplify the voice style — increase cautiously' },
              ].map(({ key, label, tip }) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)', fontVariantNumeric: 'tabular-nums' }}>
                      {settings[key].toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={settings[key]}
                    onChange={e => setSettings(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#8b5cf6' }}
                    title={tip}
                  />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>{tip}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Scene status list ── */}
          {realScenes.length > 0 && (
            <div>
              <div style={sectionLabelStyle}>Scene Status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {realScenes.map(scene => {
                  const st       = sceneStatuses[scene.scene_id]
                  const status   = st?.status || (scene.audio_path ? 'done' : 'idle')
                  const duration = st?.duration ?? scene.audio_duration
                  return (
                    <div key={scene.scene_id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', borderRadius: 5,
                      background: 'rgba(255,255,255,0.02)',
                    }}>
                      <StatusDot status={status} />
                      <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {scene.script_excerpt?.slice(0, 55)}…
                      </span>
                      {duration > 0 && (
                        <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.60)', flexShrink: 0 }}>
                          {duration.toFixed(1)}s
                        </span>
                      )}
                      {status === 'error' && (
                        <button
                          onClick={() => handleGenerate('scene', scene.scene_id)}
                          disabled={generating}
                          style={{ fontSize: 10, color: 'rgba(239,68,68,0.60)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Generation controls ── */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleGenerate('full')}
              disabled={!canGenerate}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px',
                background: canGenerate ? '#7c3aed' : 'rgba(255,255,255,0.06)',
                color: canGenerate ? '#fff' : 'rgba(255,255,255,0.25)',
                border: 'none', borderRadius: 7,
                fontSize: 12, fontWeight: 500,
                cursor: canGenerate ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (canGenerate) e.currentTarget.style.background = '#6d28d9' }}
              onMouseLeave={e => { if (canGenerate) e.currentTarget.style.background = '#7c3aed' }}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
              {generating ? 'Generating…' : 'Generate all voiceovers'}
            </button>

            {doneCount > 0 && (
              <button
                onClick={handleSyncTimings}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 7, color: 'rgba(255,255,255,0.50)',
                  fontSize: 12, cursor: 'pointer',
                }}
                title="Set each scene's duration to its narration length + 0.5s buffer"
              >
                <RefreshCw size={11} /> Sync timings
              </button>
            )}
          </div>

          {!selectedVoiceId && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: -12, margin: 0 }}>
              Select a voice above to enable generation
            </p>
          )}
          {!projectId && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: -12, margin: 0 }}>
              Run analysis first to create a project
            </p>
          )}

          {doneCount > 0 && (
            <p style={{ fontSize: 11, color: 'rgba(74,222,128,0.55)', margin: 0 }}>
              {doneCount === realScenes.length ? '✓ All' : `${doneCount} /  ${realScenes.length}`} voiceovers ready
              {totalNarrationSec > 0 && ` — ${Math.floor(totalNarrationSec / 60)}m ${Math.round(totalNarrationSec % 60)}s total`}
            </p>
          )}

        </div>
      )}
    </div>
  )
}

const sectionLabelStyle = {
  fontSize: 11, color: 'rgba(255,255,255,0.35)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 8,
}
