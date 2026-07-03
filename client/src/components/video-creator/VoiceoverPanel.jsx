import { useState, useEffect, useRef } from 'react'
import { Mic, ChevronDown, ChevronUp, Play, Pause, Loader2, RefreshCw, CheckCircle, AlertTriangle, Settings, Eye, EyeOff, Sparkles } from 'lucide-react'
import { preprocessForTTSDisplay } from '../../utils/voiceoverPreprocessorClient'

const SERVER_URL = 'http://localhost:3001'

const MODELS = [
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2',  desc: 'Best quality, multilingual (default)' },
  { id: 'eleven_flash_v2_5',      name: 'Flash v2.5',        desc: 'Fastest, lower cost' },
  { id: 'eleven_v3',              name: 'v3 (Alpha)',         desc: 'Most expressive, best for documentary' },
]

const MOODS = [
  { id: 'tense',         emoji: '⚡', label: 'Tense',         desc: 'Urgent, clipped' },
  { id: 'dramatic',      emoji: '🎭', label: 'Dramatic',      desc: 'Peaks and valleys' },
  { id: 'triumphant',    emoji: '🏆', label: 'Triumphant',    desc: 'Rising confidence' },
  { id: 'somber',        emoji: '🌧', label: 'Somber',        desc: 'Weight, mourning' },
  { id: 'reflective',    emoji: '🌙', label: 'Reflective',    desc: 'Quiet, introspective' },
  { id: 'neutral',       emoji: '📖', label: 'Neutral',       desc: 'Clear, professional' },
  { id: 'anticipatory',  emoji: '🔍', label: 'Anticipatory',  desc: 'Breath-held tension' },
  { id: 'institutional', emoji: '🏛', label: 'Institutional', desc: 'Authoritative' },
]

const sectionLabel = {
  fontSize: 11, color: 'rgba(255,255,255,0.35)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 8,
}

const DEFAULT_VOICE_PROFILE = {
  useMoodSettings:  true,
  usePreprocessing: true,
  normaliseVolume:  false,
}

// ── SettingRow ────────────────────────────────────────────────────────────────
function SettingRow({ label, description, checked, onChange, badge }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
      cursor: 'pointer',
    }}>
      <div style={{ paddingTop: 1 }}>
        <input
          type="checkbox" checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ accentColor: '#7c3aed', width: 13, height: 13 }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{label}</span>
          {badge && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(124,58,237,0.15)', color: 'rgba(124,58,237,0.80)', border: '1px solid rgba(124,58,237,0.20)' }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{description}</div>
      </div>
    </label>
  )
}

// ── VoiceoverPanel ────────────────────────────────────────────────────────────
export default function VoiceoverPanel({
  scenes,
  projectId,
  isOpen,
  onClose,
  focusSceneId,
  onAudioGenerated,
  onVoiceoverStatusChange,
  onScenesChange,
}) {
  const [open,            setOpen]            = useState(false)
  const [selectedVoiceId, setSelectedVoiceId] = useState(() => localStorage.getItem('vorta_selected_voice') || null)
  const [voices,          setVoices]          = useState([])
  const [voicesLoading,   setVoicesLoading]   = useState(false)
  const [voiceSearch,     setVoiceSearch]     = useState('')
  const [model,           setModel]           = useState('eleven_multilingual_v2')
  const [settings,        setSettings]        = useState({ stability: 0.71, similarityBoost: 0.75, style: 0.0, speed: 1.0 })
  const [generating,      setGenerating]      = useState(false)
  const [genProgress,     setGenProgress]     = useState({ current: 0, total: 0, startTime: null })
  const [sceneStatuses,   setSceneStatuses]   = useState({})
  const [previewLoading,  setPreviewLoading]  = useState({})
  const [playingSceneId,  setPlayingSceneId]  = useState(null)
  const [elStatus,        setElStatus]        = useState(null) // null = not checked

  // Professional settings
  const [voiceProfile, setVoiceProfile] = useState(() => {
    try {
      const stored = localStorage.getItem('vorta_voice_profile')
      if (!stored) return DEFAULT_VOICE_PROFILE
      const parsed = JSON.parse(stored)
      if (!parsed || typeof parsed !== 'object') return DEFAULT_VOICE_PROFILE
      // Merge with defaults so missing keys are always present
      return { ...DEFAULT_VOICE_PROFILE, ...parsed }
    } catch {
      return DEFAULT_VOICE_PROFILE
    }
  })
  const [showSettings,   setShowSettings]   = useState(false)
  const [processedTexts, setProcessedTexts] = useState({})  // { [scene_id]: string }
  const [showProcessed,  setShowProcessed]  = useState({})  // { [scene_id]: bool }
  const [isAddingPauses, setIsAddingPauses] = useState(false)

  const activeAudioRef = useRef(null)
  const panelRef       = useRef(null)
  const sceneRefs      = useRef({})

  // ── Persist voice profile whenever it changes ─────────────────────────────
  useEffect(() => {
    if (voiceProfile && typeof voiceProfile === 'object') {
      try { localStorage.setItem('vorta_voice_profile', JSON.stringify(voiceProfile)) } catch {}
    }
  }, [voiceProfile])

  const updateVoiceProfile = (patch) => {
    setVoiceProfile(prev => ({ ...(prev || DEFAULT_VOICE_PROFILE), ...patch }))
  }

  // ── Sync when parent opens panel ──────────────────────────────────────────
  useEffect(() => { if (isOpen) setOpen(true) }, [isOpen])

  const handleClose = () => { setOpen(false); onClose?.() }

  // ── ElevenLabs connection check ───────────────────────────────────────────
  useEffect(() => {
    if (!open || elStatus !== null) return
    fetch(`${SERVER_URL}/api/voiceover/status`)
      .then(r => r.json())
      .then(data => setElStatus(data))
      .catch(() => setElStatus({ connected: false, error: 'Cannot reach server' }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load voices on first open ─────────────────────────────────────────────
  useEffect(() => {
    if (!open || voices.length > 0) return
    setVoicesLoading(true)
    fetch(`${SERVER_URL}/api/voiceover/voices`)
      .then(r => r.json())
      .then(data => { setVoices(Array.isArray(data) ? data : []); setVoicesLoading(false) })
      .catch(() => setVoicesLoading(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll panel into view when opened ───────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
  }, [open])

  // ── Scroll to focused scene ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || !focusSceneId) return
    const el = sceneRefs.current[focusSceneId]
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120)
  }, [open, focusSceneId])

  // ── Stop audio on unmount ─────────────────────────────────────────────────
  useEffect(() => () => { activeAudioRef.current?.pause() }, [])

  const realScenes = scenes.filter(s => s.script_excerpt?.trim())

  const doneCount = realScenes.filter(s => {
    const st = sceneStatuses[s.scene_id]
    return st?.status === 'done' || !!s.audio_path
  }).length

  const totalNarrationSec = realScenes.reduce((sum, s) => {
    const st = sceneStatuses[s.scene_id]
    return sum + (st?.duration || s.audio_duration || 0)
  }, 0)

  const estimatedRemaining = (() => {
    if (!generating || !genProgress.startTime || genProgress.current === 0) return null
    const elapsed = (Date.now() - genProgress.startTime) / 1000
    const rate    = genProgress.current / elapsed
    if (rate <= 0) return null
    return Math.max(0, (genProgress.total - genProgress.current) / rate)
  })()

  const newToGenerate = realScenes.filter(s => {
    const st = sceneStatuses[s.scene_id]
    return !s.audio_path && st?.status !== 'done'
  })

  const canGenerate = !!selectedVoiceId && !!projectId && !generating && elStatus?.connected !== false

  // Count scenes by mood for the mood distribution display
  const moodCounts = realScenes.reduce((acc, s) => {
    const m = s.mood || 'neutral'
    acc[m] = (acc[m] || 0) + 1
    return acc
  }, {})

  // ── Preview processed text (local, instant) ───────────────────────────────
  const handlePreviewProcessed = (scene) => {
    const processed = preprocessForTTSDisplay(scene.script_excerpt, {
      expandNums: true,
      addPauses:  voiceProfile.usePreprocessing,
    })
    setProcessedTexts(prev => ({ ...prev, [scene.scene_id]: processed }))
    setShowProcessed(prev => ({ ...prev, [scene.scene_id]: !prev[scene.scene_id] }))
  }

  // ── Add pauses via server endpoint ────────────────────────────────────────
  const handleAddPauses = async () => {
    setIsAddingPauses(true)
    try {
      const res = await fetch(`${SERVER_URL}/api/voiceover/add-pauses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: realScenes.map(s => ({ scene_id: s.scene_id, script_excerpt: s.script_excerpt, mood: s.mood })),
        }),
      })
      const data = await res.json()
      if (data.scenes) {
        const map      = {}
        const openMap  = {}
        data.scenes.forEach(s => {
          map[s.scene_id]     = s.processed_text
          openMap[s.scene_id] = true
        })
        setProcessedTexts(map)
        setShowProcessed(openMap)
      }
    } catch (err) {
      console.error('[voiceover] add-pauses failed:', err.message)
    } finally {
      setIsAddingPauses(false)
    }
  }

  // ── Voice preview ─────────────────────────────────────────────────────────
  const handlePreview = async (voice) => {
    activeAudioRef.current?.pause()
    setPreviewLoading(p => ({ ...p, [voice.voice_id]: true }))
    try {
      const res  = await fetch(`${SERVER_URL}/api/voiceover/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: voice.voice_id }),
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
    setSelectedVoiceId(voiceId)
    localStorage.setItem('vorta_selected_voice', voiceId)
  }

  // ── Play scene audio ──────────────────────────────────────────────────────
  const handlePlayScene = (scene) => {
    if (playingSceneId === scene.scene_id) {
      activeAudioRef.current?.pause()
      setPlayingSceneId(null)
      return
    }
    activeAudioRef.current?.pause()
    const src = scene.audio_path
    if (!src) return
    const fullSrc = src.startsWith('/') ? `${SERVER_URL}${src}` : src
    const audio = new Audio(fullSrc)
    audio.onended = () => setPlayingSceneId(null)
    audio.play().catch(() => {})
    activeAudioRef.current = audio
    setPlayingSceneId(scene.scene_id)
  }

  // ── Generate voiceover ────────────────────────────────────────────────────
  const handleGenerate = async (mode = 'new', scenesToProcess = null) => {
    if (!selectedVoiceId || !projectId) return

    let toGenerate
    if (scenesToProcess) {
      toGenerate = scenesToProcess
    } else if (mode === 'full') {
      toGenerate = realScenes
    } else {
      toGenerate = newToGenerate
    }
    if (!toGenerate.length) return

    setGenerating(true)
    const startTime = Date.now()
    setGenProgress({ current: 0, total: toGenerate.length, startTime })

    const initStatuses = { ...sceneStatuses }
    toGenerate.forEach(s => { initStatuses[s.scene_id] = { status: 'generating', duration: null, error: null } })
    setSceneStatuses(initStatuses)
    onVoiceoverStatusChange?.(initStatuses)

    try {
      const response = await fetch(`${SERVER_URL}/api/voiceover/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          scenes:           toGenerate,
          voiceId:          selectedVoiceId,
          modelId:          model,
          mode:             scenesToProcess ? 'scene' : 'full',
          voiceSettings:    settings,
          useMoodSettings:  voiceProfile.useMoodSettings,
          usePreprocessing: voiceProfile.usePreprocessing,
          normaliseVolume:  voiceProfile.normaliseVolume,
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
              const { scene_id, audio_path, audio_duration, scene_duration } = event
              console.log('[voiceover] scene_done received:', scene_id, 'audio_path:', audio_path)

              // Keep setState updaters pure — never call external setState inside an updater.
              // React 18 throws when you do, and the inner catch would silently swallow it,
              // preventing onAudioGenerated from ever being called.
              const doneEntry = { status: 'done', duration: audio_duration, error: null }
              setSceneStatuses(prev => ({ ...prev, [scene_id]: doneEntry }))
              setGenProgress(p => ({ ...p, current: p.current + 1 }))
              onVoiceoverStatusChange?.(prev => ({ ...prev, [scene_id]: doneEntry }))

              if (onAudioGenerated) {
                onAudioGenerated(scene_id, audio_path, audio_duration, scene_duration)
              } else {
                console.error('[voiceover] onAudioGenerated is undefined — prop not passed to VoiceoverPanel!')
              }
            } else if (event.type === 'scene_error') {
              const { scene_id, error } = event
              const errEntry = { status: 'error', duration: null, error }
              setSceneStatuses(prev => ({ ...prev, [scene_id]: errEntry }))
              setGenProgress(p => ({ ...p, current: p.current + 1 }))
              onVoiceoverStatusChange?.(prev => ({ ...prev, [scene_id]: errEntry }))
            }
          } catch (parseErr) {
            console.warn('[voiceover] SSE parse error:', parseErr.message)
          }
        }
      }
    } catch (err) {
      console.error('[voiceover] generation failed:', err.message)
      toGenerate.forEach(s => {
        const errEntry = { status: 'error', duration: null, error: err.message }
        setSceneStatuses(prev => ({ ...prev, [s.scene_id]: errEntry }))
        onVoiceoverStatusChange?.(prev => ({ ...prev, [s.scene_id]: errEntry }))
      })
    } finally {
      setGenerating(false)
      // After generation completes, re-measure all audio files from disk and sync
      // scene.duration_seconds to the real audio length + 0.8s tail buffer.
      if (projectId && onScenesChange) {
        try {
          const syncRes = await fetch(`${SERVER_URL}/api/voiceover/sync-timings`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ scenes, projectId }),
          })
          const syncData = await syncRes.json()
          if (syncData.updatedScenes) {
            // Merge sync-timings results into current state (which already has audio_path
            // set by the per-scene SSE handlers). Always prefer audio_path from prev so
            // a failed ffprobe in sync-timings can't erase a path that was already saved.
            onScenesChange(prev => {
              const syncMap = {}
              syncData.updatedScenes.forEach(s => { syncMap[s.scene_id] = s })
              const result = prev.map(s => {
                const synced = syncMap[s.scene_id]
                if (!synced) return s
                return {
                  ...s,
                  ...synced,
                  audio_path:     synced.audio_path     || s.audio_path,
                  audio_duration: synced.audio_duration ?? s.audio_duration,
                }
              })
              try { localStorage.setItem('vorta_scenes', JSON.stringify(result)) } catch {}
              const audioCount = result.filter(s => s.audio_path).length
              console.log('[voiceover] timings synced — audio scenes:', audioCount, '/', result.length)
              return result
            })
          }
        } catch (err) {
          console.warn('[voiceover] sync-timings failed:', err.message)
        }
      }
    }
  }

  // ── Sync all scene durations to audio length ──────────────────────────────
  const handleSyncTimings = async () => {
    if (!onScenesChange) return
    if (projectId) {
      try {
        const res = await fetch(`${SERVER_URL}/api/voiceover/sync-timings`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ scenes, projectId }),
        })
        const data = await res.json()
        if (data.updatedScenes) {
          onScenesChange(prev => {
            const syncMap = {}
            data.updatedScenes.forEach(s => { syncMap[s.scene_id] = s })
            const result = prev.map(s => {
              const synced = syncMap[s.scene_id]
              if (!synced) return s
              return {
                ...s,
                ...synced,
                audio_path:     synced.audio_path     || s.audio_path,
                audio_duration: synced.audio_duration ?? s.audio_duration,
              }
            })
            try { localStorage.setItem('vorta_scenes', JSON.stringify(result)) } catch {}
            return result
          })
          const count = data.updatedScenes.filter(s => s.audio_duration).length
          console.log('[voiceover] sync-timings — synced', count, 'scenes')
          if (data.durationWarnings?.length > 0) {
            console.warn('[voiceover] duration warnings:', data.durationWarnings)
            data.durationWarnings.forEach(w => {
              console.warn(`  scene ${w.scene_id}: narration ${w.audio_duration}s → scene ${w.duration_seconds}s exceeds the ${w.exceeds_style_target}s style target (narration preserved) — consider splitting this scene's script excerpt`)
            })
          }
          return
        }
      } catch (err) {
        console.warn('[voiceover] sync-timings failed, falling back to local sync:', err.message)
      }
    }
    // Local fallback when endpoint unavailable or no projectId
    let count = 0
    onScenesChange(prev => prev.map(s => {
      const duration = sceneStatuses[s.scene_id]?.duration ?? s.audio_duration
      if (!duration) return s
      count++
      return { ...s, duration_seconds: parseFloat((duration + 0.8).toFixed(2)) }
    }))
    console.log(`[voiceover] local sync — ${count} scenes`)
  }

  // ── Voice filter + group by category ─────────────────────────────────────
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

  // Null guard — should never happen after the fixed initializer, but prevents
  // crashes from any stale null value that survived a page reload mid-session.
  if (!voiceProfile) {
    setVoiceProfile(DEFAULT_VOICE_PROFILE)
    return null
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={panelRef} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, marginTop: 8 }}>

      {/* ── Panel header ── */}
      <button
        onClick={() => open ? handleClose() : setOpen(true)}
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
        {(voiceProfile.useMoodSettings || voiceProfile.usePreprocessing || voiceProfile.normaliseVolume) && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(124,58,237,0.12)', color: 'rgba(124,58,237,0.70)', border: '1px solid rgba(124,58,237,0.18)' }}>
            PRO
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)', display: 'flex' }}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── ElevenLabs not connected warning ── */}
          {elStatus !== null && !elStatus.connected && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.20)',
              borderRadius: 8, fontSize: 12, color: 'rgba(234,179,8,0.80)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span>
                ElevenLabs not connected. Add your API key in Settings.
                <a href="/settings" style={{ marginLeft: 8, color: '#3b82f6', textDecoration: 'none', fontSize: 11 }}>
                  Go to Settings →
                </a>
              </span>
            </div>
          )}

          {/* ── Professional settings panel ── */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '10px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: showSettings ? '1px solid rgba(255,255,255,0.07)' : 'none',
              }}
            >
              <Settings size={11} style={{ color: 'rgba(255,255,255,0.35)' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>Production Settings</span>
              {(voiceProfile.useMoodSettings || voiceProfile.usePreprocessing || voiceProfile.normaliseVolume) && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(124,58,237,0.15)', color: 'rgba(124,58,237,0.80)' }}>
                  {[voiceProfile.useMoodSettings && 'mood', voiceProfile.usePreprocessing && 'preprocessing', voiceProfile.normaliseVolume && 'loudnorm'].filter(Boolean).join(' · ')}
                </span>
              )}
              <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.20)', display: 'flex' }}>
                {showSettings ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </span>
            </button>

            {showSettings && (
              <div style={{ padding: '4px 14px 14px' }}>

                {/* Toggles */}
                <SettingRow
                  label="Per-mood voice delivery"
                  description="Adjusts stability, style, and pace based on each scene's mood tag (tense, somber, triumphant, etc.)"
                  badge="AI"
                  checked={voiceProfile.useMoodSettings}
                  onChange={v => updateVoiceProfile({ useMoodSettings: v })}
                />
                <SettingRow
                  label="Smart text preprocessing"
                  description="Expands $2.4B → '2.4 billion dollars', inserts natural pause markers at em-dashes and ellipses"
                  checked={voiceProfile.usePreprocessing}
                  onChange={v => updateVoiceProfile({ usePreprocessing: v })}
                />
                <SettingRow
                  label="Loudness normalisation"
                  description="Applies ffmpeg loudnorm to -16 LUFS (YouTube standard) after generation. Adds ~2s per scene."
                  badge="-16 LUFS"
                  checked={voiceProfile.normaliseVolume}
                  onChange={v => updateVoiceProfile({ normaliseVolume: v })}
                />

                {/* Mood distribution */}
                {voiceProfile.useMoodSettings && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ ...sectionLabel, marginBottom: 10 }}>Scene mood distribution</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                      {MOODS.map(mood => {
                        const count    = moodCounts[mood.id] || 0
                        const hasScenes = count > 0
                        return (
                          <div
                            key={mood.id}
                            title={mood.desc}
                            style={{
                              padding: '6px 8px', borderRadius: 6, textAlign: 'center',
                              background: hasScenes ? 'rgba(124,58,237,0.10)' : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${hasScenes ? 'rgba(124,58,237,0.20)' : 'rgba(255,255,255,0.06)'}`,
                            }}
                          >
                            <div style={{ fontSize: 13, marginBottom: 2 }}>{mood.emoji}</div>
                            <div style={{ fontSize: 9, color: hasScenes ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)', fontWeight: 500 }}>
                              {mood.label}
                            </div>
                            {hasScenes && (
                              <div style={{ fontSize: 9, color: 'rgba(124,58,237,0.75)', marginTop: 1 }}>
                                {count} scene{count > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {Object.keys(moodCounts).length === 0 && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: '8px 0 0' }}>
                        No mood tags found on scenes. Add a <code style={{ fontSize: 10, background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3 }}>mood</code> field to each scene object to enable per-mood delivery.
                      </p>
                    )}
                  </div>
                )}

                {/* Preview preprocessing button */}
                {voiceProfile.usePreprocessing && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={handleAddPauses}
                      disabled={isAddingPauses || realScenes.length === 0}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 6, color: 'rgba(255,255,255,0.55)', fontSize: 11, cursor: 'pointer',
                      }}
                    >
                      {isAddingPauses ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      Preview processed text for all scenes
                    </button>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', margin: '5px 0 0' }}>
                      Shows how text will be transformed before sending to ElevenLabs. Toggle per scene with the eye icon.
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* ── Scene rows ── */}
          {realScenes.length > 0 && (
            <div>
              <div style={{ ...sectionLabel, marginBottom: 12 }}>Scenes</div>

              {/* Generate All / Regenerate All */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleGenerate('new')}
                  disabled={!canGenerate || newToGenerate.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px',
                    background: (canGenerate && newToGenerate.length > 0) ? '#7c3aed' : 'rgba(255,255,255,0.05)',
                    color: (canGenerate && newToGenerate.length > 0) ? '#fff' : 'rgba(255,255,255,0.25)',
                    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    cursor: (canGenerate && newToGenerate.length > 0) ? 'pointer' : 'not-allowed',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (canGenerate && newToGenerate.length > 0) e.currentTarget.style.background = '#6d28d9' }}
                  onMouseLeave={e => { if (canGenerate && newToGenerate.length > 0) e.currentTarget.style.background = '#7c3aed' }}
                >
                  {generating ? <Loader2 size={11} className="animate-spin" /> : <Mic size={11} />}
                  {generating ? 'Generating…' : `Generate All (${newToGenerate.length})`}
                </button>

                {doneCount > 0 && (
                  <button
                    onClick={() => handleGenerate('full')}
                    disabled={!canGenerate}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 12px',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 6, color: canGenerate ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.20)',
                      fontSize: 12, cursor: canGenerate ? 'pointer' : 'not-allowed',
                    }}
                    title="Regenerate audio for all scenes"
                  >
                    <RefreshCw size={11} /> Regenerate All
                  </button>
                )}

                {doneCount > 0 && (
                  <button
                    onClick={handleSyncTimings}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 12px',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 6, color: 'rgba(255,255,255,0.40)', fontSize: 12, cursor: 'pointer',
                    }}
                    title="Set each scene's duration to its narration length + 0.5s buffer"
                  >
                    <RefreshCw size={11} /> Sync timings
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {generating && genProgress.total > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, (genProgress.current / genProgress.total) * 100)}%`,
                      background: '#7c3aed', borderRadius: 2, transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontVariantNumeric: 'tabular-nums' }}>
                    Generating scene {Math.min(genProgress.current + 1, genProgress.total)} of {genProgress.total}
                    {estimatedRemaining !== null && ` — ${Math.ceil(estimatedRemaining)}s remaining (est.)`}
                  </span>
                </div>
              )}

              {/* Per-scene rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {realScenes.map(scene => {
                  const st           = sceneStatuses[scene.scene_id]
                  const status       = st?.status || (scene.audio_path ? 'done' : 'idle')
                  const duration     = st?.duration ?? scene.audio_duration
                  const isPlaying    = playingSceneId === scene.scene_id
                  const isGenerating = status === 'generating'
                  const hasAudio     = status === 'done' || !!scene.audio_path
                  const isFocused    = focusSceneId === scene.scene_id
                  const isProcessedOpen = showProcessed[scene.scene_id]

                  return (
                    <div key={scene.scene_id}>
                      <div
                        ref={el => { sceneRefs.current[scene.scene_id] = el }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', borderRadius: isProcessedOpen ? '6px 6px 0 0' : 6,
                          background: isFocused ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isFocused ? 'rgba(124,58,237,0.20)' : 'rgba(255,255,255,0.04)'}`,
                          borderBottom: isProcessedOpen ? 'none' : undefined,
                          transition: 'background 0.2s, border-color 0.2s',
                        }}
                      >
                        {/* Scene badge */}
                        <span style={{
                          fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                          color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                          padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.05)',
                        }}>
                          {scene.scene_id}
                        </span>

                        {/* Mood badge */}
                        {scene.mood && (
                          <span style={{
                            fontSize: 9, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                            background: 'rgba(124,58,237,0.08)', color: 'rgba(124,58,237,0.65)',
                            border: '1px solid rgba(124,58,237,0.15)', fontStyle: 'italic',
                          }}>
                            {scene.mood}
                          </span>
                        )}

                        {/* Excerpt */}
                        <span style={{
                          flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.40)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {scene.script_excerpt?.slice(0, 65)}
                        </span>

                        {/* Preview processed text toggle */}
                        {voiceProfile.usePreprocessing && (
                          <button
                            onClick={() => handlePreviewProcessed(scene)}
                            title={isProcessedOpen ? 'Hide processed text' : 'Preview processed text'}
                            style={{
                              display: 'flex', alignItems: 'center', flexShrink: 0,
                              padding: '3px 5px', borderRadius: 4,
                              background: isProcessedOpen ? 'rgba(124,58,237,0.12)' : 'none',
                              border: `1px solid ${isProcessedOpen ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.08)'}`,
                              color: isProcessedOpen ? 'rgba(124,58,237,0.80)' : 'rgba(255,255,255,0.25)',
                              cursor: 'pointer',
                            }}
                          >
                            {isProcessedOpen ? <EyeOff size={9} /> : <Eye size={9} />}
                          </button>
                        )}

                        {/* Status actions */}
                        {isGenerating && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <Loader2 size={11} className="animate-spin" style={{ color: '#3b82f6' }} />
                            <span style={{ fontSize: 10, color: 'rgba(59,130,246,0.70)' }}>Generating…</span>
                          </div>
                        )}

                        {!isGenerating && hasAudio && (
                          <>
                            <button
                              onClick={() => handlePlayScene(scene)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                                padding: '3px 8px', borderRadius: 4,
                                background: isPlaying ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${isPlaying ? 'rgba(74,222,128,0.20)' : 'rgba(255,255,255,0.10)'}`,
                                color: isPlaying ? 'rgba(74,222,128,0.80)' : 'rgba(255,255,255,0.45)',
                                fontSize: 10, cursor: 'pointer',
                              }}
                            >
                              {isPlaying ? <Pause size={9} /> : <Play size={9} />}
                              {duration ? `${duration.toFixed(1)}s` : '●'}
                            </button>
                            <button
                              onClick={() => handleGenerate('scene', [scene])}
                              disabled={generating}
                              style={{
                                padding: '3px 6px', borderRadius: 4, flexShrink: 0,
                                background: 'none', border: '1px solid rgba(255,255,255,0.08)',
                                color: generating ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.30)',
                                cursor: generating ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center',
                              }}
                              title="Regenerate audio for this scene"
                            >
                              <RefreshCw size={9} />
                            </button>
                          </>
                        )}

                        {!isGenerating && !hasAudio && (
                          <button
                            onClick={() => handleGenerate('scene', [scene])}
                            disabled={!canGenerate}
                            style={{
                              padding: '3px 10px', borderRadius: 4, flexShrink: 0, fontSize: 10,
                              background: canGenerate ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${canGenerate ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)'}`,
                              color: canGenerate ? 'rgba(124,58,237,0.90)' : 'rgba(255,255,255,0.20)',
                              cursor: canGenerate ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Generate
                          </button>
                        )}

                        {status === 'error' && !isGenerating && (
                          <span style={{ fontSize: 9, color: 'rgba(248,113,113,0.60)', flexShrink: 0 }} title={st?.error}>
                            error
                          </span>
                        )}
                      </div>

                      {/* Processed text preview */}
                      {isProcessedOpen && processedTexts[scene.scene_id] && (
                        <div style={{
                          padding: '8px 10px',
                          background: 'rgba(124,58,237,0.05)',
                          border: '1px solid rgba(124,58,237,0.15)',
                          borderTop: 'none',
                          borderRadius: '0 0 6px 6px',
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.50)',
                          fontFamily: 'monospace',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {processedTexts[scene.scene_id]}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {doneCount > 0 && totalNarrationSec > 0 && (
                <p style={{ fontSize: 11, color: 'rgba(74,222,128,0.55)', margin: '10px 0 0' }}>
                  {doneCount === realScenes.length ? '✓ All' : `${doneCount} / ${realScenes.length}`} voiceovers ready
                  {totalNarrationSec > 0 && ` — ${Math.floor(totalNarrationSec / 60)}m ${Math.round(totalNarrationSec % 60)}s total`}
                </p>
              )}
            </div>
          )}

          {/* ── Voice selector ── */}
          <div>
            <div style={sectionLabel}>Voice</div>
            <input
              type="text"
              placeholder="Search voices…"
              value={voiceSearch}
              onChange={e => setVoiceSearch(e.target.value)}
              className="vorta-input"
              style={{ marginBottom: 8, fontSize: 12 }}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
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
            <div style={sectionLabel}>Model</div>
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
                    checked={model === m.id} onChange={() => setModel(m.id)}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={sectionLabel}>Voice Settings</div>
              {voiceProfile.useMoodSettings && (
                <span style={{ fontSize: 9, color: 'rgba(124,58,237,0.55)' }}>
                  Sliders override mood defaults
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'stability',       label: 'Stability',          min: 0, max: 1, step: 0.01, tip: 'Lower = more expressive · Higher = more consistent' },
                { key: 'similarityBoost', label: 'Similarity Boost',   min: 0, max: 1, step: 0.01, tip: 'How closely to match the original voice sample' },
                { key: 'style',           label: 'Style Exaggeration', min: 0, max: 1, step: 0.01, tip: 'Amplify the voice style — increase cautiously' },
                { key: 'speed',           label: 'Speed',              min: 0.7, max: 1.3, step: 0.01, tip: 'Speaking pace (1.0 = normal)' },
              ].map(({ key, label, min, max, step, tip }) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)', fontVariantNumeric: 'tabular-nums' }}>
                      {settings[key].toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={settings[key]}
                    onChange={e => setSettings(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                    className="vorta-slider"
                    title={tip}
                  />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>{tip}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Hints ── */}
          {!selectedVoiceId && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
              Select a voice above to enable generation
            </p>
          )}
          {!projectId && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
              Run analysis first to create a project
            </p>
          )}

        </div>
      )}
    </div>
  )
}
