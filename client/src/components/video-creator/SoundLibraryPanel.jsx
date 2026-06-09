import { useState, useEffect } from 'react'

const SERVER_URL = 'http://localhost:3001'

const TYPE_LABELS = {
  sting:   { label: 'Transition Stings', icon: '⚡', color: '#8b5cf6' },
  ambient: { label: 'Ambient Loops',     icon: '🔊', color: '#06b6d4' },
  overlay: { label: 'Overlay Sounds',    icon: '✨', color: '#f59e0b' },
  music:   { label: 'Background Music',  icon: '🎵', color: '#3b82f6' },
}

export function SoundLibraryPanel({ isOpen, onClose }) {
  const [sounds, setSounds]                 = useState([])
  const [stats, setStats]                   = useState(null)
  const [activeType, setActiveType]         = useState('all')
  const [playingId, setPlayingId]           = useState(null)
  const [currentAudio, setCurrentAudio]     = useState(null)
  const [isPrewarming, setIsPrewarming]     = useState(false)
  const [prewarmProgress, setPrewarmProgress] = useState({ done: 0, total: 29 })
  const [prewarmLog, setPrewarmLog]         = useState('')

  useEffect(() => {
    if (isOpen) { fetchSounds(); fetchStats() }
  }, [isOpen])

  const fetchSounds = async () => {
    try {
      const res  = await fetch(`${SERVER_URL}/api/sound-library/all`)
      const data = await res.json()
      setSounds(Array.isArray(data) ? data : [])
    } catch {}
  }

  const fetchStats = async () => {
    try {
      const res  = await fetch(`${SERVER_URL}/api/sound-library/stats`)
      const data = await res.json()
      setStats(data)
    } catch {}
  }

  const handlePlay = (sound) => {
    if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0 }
    if (playingId === sound.id) { setPlayingId(null); setCurrentAudio(null); return }
    const audio = new Audio(`${SERVER_URL}${sound.url}`)
    audio.volume = Math.min((sound.volume || 0.3) * 3, 1)
    audio.play().catch(() => {})
    audio.onended = () => { setPlayingId(null); setCurrentAudio(null) }
    setPlayingId(sound.id)
    setCurrentAudio(audio)
  }

  const handleDelete = async (id) => {
    await fetch(`${SERVER_URL}/api/sound-library/${id}`, { method: 'DELETE' })
    setSounds(prev => prev.filter(s => s.id !== id))
    fetchStats()
  }

  const handlePrewarm = () => {
    setIsPrewarming(true)
    setPrewarmProgress({ done: 0, total: 29 })
    setPrewarmLog('Starting...')

    const es = new EventSource(`${SERVER_URL}/api/sound-library/prewarm`)
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.done !== undefined) setPrewarmProgress({ done: event.done, total: event.total || 29 })
        if (event.key) setPrewarmLog(`${event.type === 'cached' ? '✓ cached' : event.type === 'error' ? '✗ failed' : '⟳ generating'}: ${event.category}/${event.key}`)
        if (event.type === 'phase') setPrewarmLog(event.message)
        if (event.type === 'complete') {
          setIsPrewarming(false)
          setPrewarmLog('✓ Sound library complete')
          es.close()
          fetchSounds()
          fetchStats()
        }
      } catch {}
    }
    es.onerror = () => { setIsPrewarming(false); es.close() }
  }

  const filtered = activeType === 'all' ? sounds : sounds.filter(s => s.type === activeType)

  if (!isOpen) return null

  return (
    <div style={{
      position:       'fixed',
      inset:           0,
      background:     'rgba(0,0,0,0.92)',
      zIndex:          300,
      display:        'flex',
      flexDirection:  'column',
    }}>
      {/* Header */}
      <div style={{
        padding:        '16px 24px',
        borderBottom:   '1px solid rgba(255,255,255,0.08)',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        flexShrink:      0,
      }}>
        <div>
          <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>Sound Library</div>
          {stats && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
              {stats.total} sounds · {stats.totalGenerated} total generated · ElevenLabs AI
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handlePrewarm}
            disabled={isPrewarming}
            className="vorta-btn vorta-btn-secondary"
          >
            {isPrewarming
              ? `⟳ Building ${prewarmProgress.done}/${prewarmProgress.total}`
              : '⚡ Build full library (29 sounds)'}
          </button>
          <button onClick={onClose} className="vorta-btn vorta-btn-ghost">Close</button>
        </div>
      </div>

      {/* Pre-warm progress */}
      {isPrewarming && (
        <div style={{ padding: '8px 24px', background: 'rgba(59,130,246,0.06)', flexShrink: 0 }}>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 6 }}>
            <div style={{
              height:     '100%',
              width:      `${(prewarmProgress.done / prewarmProgress.total) * 100}%`,
              background: '#3b82f6',
              borderRadius: 2,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{prewarmLog}</div>
        </div>
      )}

      {/* Type filter cards */}
      {stats && (
        <div style={{
          display:      'flex',
          gap:           8,
          padding:      '12px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink:    0,
          overflowX:    'auto',
        }}>
          <div
            onClick={() => setActiveType('all')}
            style={{
              padding:    '8px 14px',
              background: activeType === 'all' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              border:     `1px solid ${activeType === 'all' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>All sounds</div>
            <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>{stats.total}</div>
          </div>
          {Object.entries(TYPE_LABELS).map(([type, config]) => (
            <div
              key={type}
              onClick={() => setActiveType(activeType === type ? 'all' : type)}
              style={{
                padding:    '8px 14px',
                background: activeType === type ? `${config.color}22` : 'rgba(255,255,255,0.03)',
                border:     `1px solid ${activeType === type ? config.color + '44' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8, cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{ color: config.color, fontSize: 11 }}>{config.icon} {config.label}</div>
              <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>{stats.byType[type] || 0}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sound grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {filtered.length === 0 && !isPrewarming && (
          <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.25)' }}>
            No sounds yet — click <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Build full library</strong> to generate all 29 sounds.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {filtered.map(sound => {
            const cfg      = TYPE_LABELS[sound.type] || TYPE_LABELS.ambient
            const isPlaying = playingId === sound.id
            return (
              <div key={sound.id} style={{
                padding:    '12px 14px',
                background: '#111',
                border:     `1px solid ${isPlaying ? cfg.color + '60' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                transition: 'border-color 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, padding: '1px 6px', background: cfg.color + '22', color: cfg.color, borderRadius: 3, flexShrink: 0 }}>
                        {cfg.icon} {sound.type}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sound.category}
                      </span>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                      {sound.duration ? `${sound.duration.toFixed(1)}s` : '—'}
                      {sound.usageCount > 0 && ` · used ${sound.usageCount}×`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <button
                      onClick={() => handlePlay(sound)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: isPlaying ? cfg.color : 'rgba(255,255,255,0.08)',
                        border: 'none', color: 'white', cursor: 'pointer', fontSize: 11,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button
                      onClick={() => handleDelete(sound.id)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: '#f87171', cursor: 'pointer', fontSize: 13,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {sound.tags?.slice(0, 4).map(tag => (
                    <span key={tag} style={{
                      fontSize: 9, padding: '1px 5px',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.3)',
                      borderRadius: 3,
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
