import { useState, useRef, useEffect, useMemo } from 'react'
import { Loader2, Zap, Trash2, Play, Library, X, ChevronDown, ChevronUp } from 'lucide-react'
import ScriptInput from '../components/video-creator/ScriptInput'
import SceneGrid from '../components/video-creator/SceneGrid'
import { VideoPlayer } from '../components/video-creator/VideoPlayer'
import ClipLibrary from '../components/video-creator/ClipLibrary'
import VoiceoverPanel from '../components/video-creator/VoiceoverPanel'
import ExportPanel from '../components/video-creator/ExportPanel'

const SERVER_URL = 'http://localhost:3001'

const LS = {
  scenes:        'vorta_scenes',
  projectId:     'vorta_project_id',
  statuses:      'vorta_scene_statuses',
  metadata:      'vorta_script_metadata',
  motionComps:   'vorta_motion_components',
  clipMatches:   'vorta_clip_matches',
  selectedClips: 'vorta_selected_clips',
  sessionKey:    'vorta_session_key',
}

function lsRead(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function lsWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}
function lsClearAll() {
  Object.values(LS).forEach(k => localStorage.removeItem(k))
}

// Strip import lines and convert `export default` → `return` so code is
// compatible with the Function constructor evaluator in MotionGraphicScene.jsx.
// Old JSX components will still fail at eval (expected) — rebuild resolves it.
function cleanMotionComponent(code) {
  if (!code) return null
  return code
    .replace(/^import\s+[^\n]+from\s+['"][^'"]+['"];?\s*/gm, '')
    .replace(/^export default\s+/m, 'return ')
    .trim()
}

function formatError(msg) {
  if (!msg) return 'Something went wrong. Try again.'
  const m = msg.toLowerCase()
  if (m.includes('anthropic_api_key') || m.includes('not configured') || m.includes('api key not'))
    return 'API key missing. Add ANTHROPIC_API_KEY to your .env file and restart the server.'
  if (m.includes('invalid x-api-key') || m.includes('authentication_error') || m.includes('invalid api key'))
    return 'Invalid API key. Check ANTHROPIC_API_KEY in your .env file.'
  if (m.includes('rate_limit') || m.includes('overloaded'))
    return 'Claude API is overloaded. Wait 30 seconds and try again.'
  if (m.includes('econnrefused') || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed'))
    return 'Cannot reach the server. Is the backend running on port 3001?'
  if (m.includes('timeout') || m.includes('etimedout'))
    return 'Request timed out. Check your connection and try again.'
  if (m.includes('higgsfield'))
    return 'Higgsfield error. Run `higgsfield auth login` in your terminal and retry.'
  if (m.includes('unexpected token') || m.includes('unexpected end') || m.includes('syntaxerror'))
    return 'Unexpected server response. Check server logs and try again.'
  return msg
}

function saveProjectToList(key, title, scenes, sceneStatuses, selectedClips, clipMatches, projectId) {
  const thumbnail = Object.values(sceneStatuses || {}).find(s => s.status === 'done')?.image_path || null
  const entry = {
    key,
    title: title || 'Untitled',
    sceneCount: scenes.length,
    thumbnail,
    lastUpdated: Date.now(),
  }
  const existing = JSON.parse(localStorage.getItem('vorta_projects') || '[]')
  const updated  = [entry, ...existing.filter(p => p.key !== key)].slice(0, 20)
  localStorage.setItem('vorta_projects', JSON.stringify(updated))
  localStorage.setItem(`vorta_project_data_${key}`, JSON.stringify({
    scenes,
    sceneStatuses: sceneStatuses || {},
    selectedClips: selectedClips || {},
    clipMatches:   clipMatches   || {},
    projectId,
    metadata: lsRead(LS.metadata) || {},
  }))
}

function SkeletonCard() {
  return (
    <div
      className="animate-pulse rounded-xl overflow-hidden border border-white/[0.05]"
      style={{ background: 'rgba(255,255,255,0.025)' }}
    >
      <div className="w-full bg-white/[0.04]" style={{ paddingTop: '56.25%' }} />
      <div className="p-3 space-y-2">
        <div className="h-2.5 bg-white/[0.05] rounded-full w-3/5" />
        <div className="h-2 bg-white/[0.03] rounded-full w-11/12" />
        <div className="h-2 bg-white/[0.03] rounded-full w-4/5" />
        <div className="h-2 bg-white/[0.03] rounded-full w-2/3" />
      </div>
    </div>
  )
}

export default function VideoCreator() {
  // ─── State — lazy-initialised from localStorage ─────────────────────────
  const [scenes, setScenes] = useState(() => {
    const saved = lsRead(LS.scenes) || []
    return saved.map(s => s.motion_component
      ? { ...s, motion_component: cleanMotionComponent(s.motion_component) }
      : s
    )
  })
  const [projectId, setProjectId] = useState(() => lsRead(LS.projectId) || null)
  const [sceneStatuses, setSceneStatuses] = useState(() => lsRead(LS.statuses) || {})
  const [sessionKey, setSessionKey] = useState(() => lsRead(LS.sessionKey) || null)
  const [hasAnalyzed, setHasAnalyzed] = useState(() => {
    const s = lsRead(LS.scenes)
    return Array.isArray(s) && s.length > 0
  })
  const [generateDone, setGenerateDone] = useState(() => {
    const savedScenes   = lsRead(LS.scenes)   || []
    const savedStatuses = lsRead(LS.statuses) || {}
    const imageScenes   = savedScenes.filter(s => s.shot_type === 'image')
    if (!imageScenes.length) return false
    return imageScenes.every(s => {
      const st = savedStatuses[s.scene_id]?.status
      return st === 'done' || st === 'failed'
    })
  })

  // Per-scene motion component build status — not persisted (transient)
  const [motionStatuses, setMotionStatuses]   = useState({})
  const [isRebuildingAll, setIsRebuildingAll] = useState(false)

  // Clip matches — { [scene_id]: { matches: [], loading: bool } }
  const [clipMatches, setClipMatches] = useState(() => {
    const saved = lsRead(LS.clipMatches) || {}
    const clean = {}
    Object.entries(saved).forEach(([sid, v]) => {
      clean[sid] = { matches: v.matches || [], loading: false }
    })
    return clean
  })

  // Voiceover — selected voice (persisted to localStorage separately, not in LS map)
  const [selectedVoiceId,   setSelectedVoiceId]   = useState(() => localStorage.getItem('vorta_selected_voice') || null)
  const [voiceoverStatuses, setVoiceoverStatuses] = useState({})

  // Selected clips — { [scene_id]: clip_object }
  const [selectedClips, setSelectedClips] = useState(() => {
    const saved = lsRead(LS.selectedClips)
    if (saved) return saved
    const savedScenes = lsRead(LS.scenes) || []
    const migrated = {}
    savedScenes.forEach(s => { if (s.selected_clip) migrated[s.scene_id] = s.selected_clip })
    return migrated
  })

  const [showClipLibrary, setShowClipLibrary] = useState(false)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  const [sessionRestored, setSessionRestored] = useState(() => {
    const s = lsRead(LS.scenes)
    return Array.isArray(s) && s.length > 0
  })
  const [badgeFading, setBadgeFading] = useState(false)

  const [resetKey, setResetKey]         = useState(0)
  const [showPlayer, setShowPlayer]     = useState(false)
  const [playerStuck, setPlayerStuck]   = useState(false)
  const [playerMinimized, setPlayerMinimized] = useState(false)
  const [filmGrain, setFilmGrain]       = useState(true)
  const [previewScene, setPreviewScene] = useState(null)

  const eventSourceRef = useRef(null)
  const sentinelRef    = useRef(null)

  // ─── Session-restored fade-out ───────────────────────────────────────────
  useEffect(() => {
    if (!sessionRestored) return
    const fade   = setTimeout(() => setBadgeFading(true),      2500)
    const remove = setTimeout(() => setSessionRestored(false), 3000)
    return () => { clearTimeout(fade); clearTimeout(remove) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persist on every change ─────────────────────────────────────────────
  useEffect(() => { lsWrite(LS.scenes,        scenes)        }, [scenes])
  useEffect(() => { lsWrite(LS.projectId,     projectId)     }, [projectId])
  useEffect(() => { lsWrite(LS.statuses,      sceneStatuses) }, [sceneStatuses])
  useEffect(() => { lsWrite(LS.selectedClips, selectedClips) }, [selectedClips])
  useEffect(() => {
    const toSave = {}
    Object.entries(clipMatches).forEach(([sid, v]) => {
      if (!v.loading) toSave[sid] = v
    })
    lsWrite(LS.clipMatches, toSave)
  }, [clipMatches])

  // ─── Auto-save snapshot when generation completes (thumbnail available) ──
  useEffect(() => {
    if (!generateDone || !sessionKey || !scenes.length) return
    const title = lsRead(LS.metadata)?.title || 'Untitled'
    saveProjectToList(sessionKey, title, scenes, sceneStatuses, selectedClips, clipMatches, projectId)
  }, [generateDone]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (previewScene) { setPreviewScene(null); return }
        if (showClipLibrary) { setShowClipLibrary(false); return }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        if (hasAnalyzed && scenes.length > 0) {
          e.preventDefault()
          document.getElementById('vorta-export-panel')?.scrollIntoView({ behavior: 'smooth' })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewScene, showClipLibrary, hasAnalyzed, scenes.length])

  // ─── Derive imagePaths from sceneStatuses for the Remotion player ────────
  const imagePaths = useMemo(() => {
    const paths = {}
    Object.entries(sceneStatuses).forEach(([sid, st]) => {
      if (st.status === 'done' && st.image_path) paths[sid] = st.image_path
    })
    return paths
  }, [sceneStatuses])

  const globalSettings = useMemo(() => ({
    grainIntensity: filmGrain ? undefined : 0,
  }), [filmGrain])

  // ─── Sticky player — IntersectionObserver on sentinel div ─────────────────
  useEffect(() => {
    if (!sentinelRef.current || !showPlayer) {
      setPlayerStuck(false)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => setPlayerStuck(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [showPlayer])

  // ─── Re-run clip matching on load if scenes restored but matches missing ──
  useEffect(() => {
    const realScenes = scenes.filter(s => s.shot_type === 'real_footage')
    const unmatched  = realScenes.filter(s => !clipMatches[s.scene_id])
    if (unmatched.length > 0) matchClipsForScenes(unmatched)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── SSE cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => { return () => eventSourceRef.current?.close() }, [])

  // ─── Clear session ────────────────────────────────────────────────────────
  const handleClearSession = () => {
    eventSourceRef.current?.close()
    lsClearAll()
    setScenes([])
    setHasAnalyzed(false)
    setProjectId(null)
    setSessionKey(null)
    setSceneStatuses({})
    setGenerateDone(false)
    setGenerateError(null)
    setAnalyzeError(null)
    setIsGenerating(false)
    setMotionStatuses({})
    setClipMatches({})
    setSelectedClips({})
    setShowClipLibrary(false)
    setShowPlayer(false)
    setPlayerStuck(false)
    setPlayerMinimized(false)
    setPreviewScene(null)
    setSessionRestored(false)
    setBadgeFading(false)
    setResetKey(k => k + 1)
  }

  // ─── SSE subscription ─────────────────────────────────────────────────────
  const subscribeToProgress = (pid) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`${SERVER_URL}/api/generate/progress/${pid}`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.type === 'update') {
        setSceneStatuses(prev => ({
          ...prev,
          [event.scene_id]: {
            status:     event.status,
            image_path: event.image_path || prev[event.scene_id]?.image_path || null,
            error:      event.error || null,
          },
        }))
      } else if (event.type === 'done') {
        setIsGenerating(false)
        setGenerateDone(true)
        es.close()
      }
    }

    es.onerror = () => {
      setIsGenerating(false)
      es.close()
    }
  }

  // ─── Analyze ──────────────────────────────────────────────────────────────
  const handleAnalyze = async ({ script, metadata }) => {
    setIsAnalyzing(true)
    setAnalyzeError(null)
    setSceneStatuses({})
    setProjectId(null)
    setGenerateDone(false)
    try {
      const res  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ script, metadata }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setScenes(data.scenes)
      setHasAnalyzed(true)
      matchClipsForScenes(data.scenes)

      // Register in project list for project management
      const key = sessionKey || `proj_${Date.now()}`
      if (!sessionKey) {
        setSessionKey(key)
        lsWrite(LS.sessionKey, key)
      }
      saveProjectToList(key, metadata.title, data.scenes, {}, {}, {}, null)
    } catch (err) {
      setAnalyzeError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ─── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true)
    setGenerateError(null)
    setGenerateDone(false)

    const initialStatuses = {}
    scenes.forEach(s => {
      initialStatuses[s.scene_id] = {
        status:     s.shot_type === 'image' ? 'pending' : 'skipped',
        image_path: null,
        error:      null,
      }
    })
    setSceneStatuses(initialStatuses)

    try {
      const res  = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scenes, projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')

      const pid = data.projectId
      setProjectId(pid)
      subscribeToProgress(pid)
    } catch (err) {
      setGenerateError(err.message)
      setIsGenerating(false)
    }
  }

  // ─── Build motion component ───────────────────────────────────────────────
  const handleBuildComponent = async (scene) => {
    setMotionStatuses(prev => ({ ...prev, [scene.scene_id]: { status: 'generating', error: null } }))

    try {
      const res  = await fetch('/api/motion', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          scene_id:       scene.scene_id,
          script_excerpt: scene.script_excerpt,
          mood:           scene.mood,
          shot_type:      scene.shot_type,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Component generation failed')

      const cleaned = cleanMotionComponent(data.component_code)

      setScenes(prev => prev.map(s =>
        s.scene_id === scene.scene_id ? { ...s, motion_component: cleaned } : s
      ))

      const existing = lsRead(LS.motionComps) || {}
      lsWrite(LS.motionComps, { ...existing, [scene.scene_id]: cleaned })

      setMotionStatuses(prev => ({ ...prev, [scene.scene_id]: { status: 'done', error: null } }))
    } catch (err) {
      setMotionStatuses(prev => ({ ...prev, [scene.scene_id]: { status: 'failed', error: err.message } }))
    }
  }

  // ─── Rebuild all motion components (sequential, new format) ─────────────
  const handleRebuildAllComponents = async () => {
    const motionScenes = scenes.filter(s => s.shot_type === 'motion_graphic')
    if (!motionScenes.length) return

    setIsRebuildingAll(true)
    // Clear all stored components so the player shows "building…" placeholders
    setScenes(prev => prev.map(s =>
      s.shot_type === 'motion_graphic' ? { ...s, motion_component: null } : s
    ))

    for (const scene of motionScenes) {
      await handleBuildComponent(scene)
    }

    setIsRebuildingAll(false)
  }

  // ─── Clip matching ────────────────────────────────────────────────────────
  const matchClipsForScenes = async (allScenes) => {
    const realScenes = allScenes.filter(s => s.shot_type === 'real_footage')
    console.log('[MATCH DEBUG 1] auto-match triggered, scenes:', allScenes.length)
    console.log('[MATCH DEBUG 2] real_footage scenes:', realScenes.map(s => s.scene_id), 'tags sample:', realScenes[0]?.clip_search_tags)
    console.log('[CLIP DEBUG 1] matchClipsForScenes called, real scenes:', realScenes.length, 'tags sample:', realScenes[0]?.clip_search_tags)
    if (!realScenes.length) return

    setClipMatches(prev => {
      const next = { ...prev }
      realScenes.forEach(s => { next[s.scene_id] = { matches: [], loading: true } })
      return next
    })

    try {
      const res  = await fetch('/api/library/match-all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scenes: realScenes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Match failed')

      console.log('[MATCH DEBUG 3] match results from API:', data.results)
      console.log('[MATCH DEBUG 4] match counts:', Object.entries(data.results).map(([sid, m]) => `${sid}:${m.length}`))
      console.log('[CLIP DEBUG 2] match-all API response:', JSON.stringify(data.results).slice(0, 300))

      setClipMatches(prev => {
        const next = { ...prev }
        Object.entries(data.results).forEach(([sid, matches]) => {
          next[sid] = { matches, loading: false }
        })
        return next
      })

      console.log('[CLIP DEBUG 3] clipMatches updated for', Object.keys(data.results).length, 'scenes, first result:', JSON.stringify(Object.entries(data.results).slice(0, 1)))
    } catch (err) {
      console.log('[CLIP DEBUG 2] match-all FAILED:', err?.message)
      setClipMatches(prev => {
        const next = { ...prev }
        realScenes.forEach(s => { next[s.scene_id] = { matches: [], loading: false } })
        return next
      })
    }
  }

  // ─── Retry ────────────────────────────────────────────────────────────────
  const handleRetry = async (scene_id, higgsfield_prompt) => {
    setSceneStatuses(prev => ({
      ...prev,
      [scene_id]: { status: 'pending', image_path: null, error: null },
    }))
    setIsGenerating(true)

    try {
      await fetch('/api/generate/retry', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, scene_id, higgsfield_prompt }),
      })
      subscribeToProgress(projectId)
    } catch (err) {
      setSceneStatuses(prev => ({
        ...prev,
        [scene_id]: { status: 'failed', image_path: null, error: err.message },
      }))
      setIsGenerating(false)
    }
  }

  // ─── Clip selection ───────────────────────────────────────────────────────
  const handleSelectClip = (scene_id, clip) => {
    setSelectedClips(prev => {
      const next = { ...prev }
      if (clip === null) delete next[scene_id]
      else next[scene_id] = clip
      return next
    })
  }

  const handleConvertToImage = (scene_id) => {
    setScenes(prev => prev.map(s =>
      s.scene_id === scene_id ? { ...s, shot_type: 'image', real_footage_flag: false } : s
    ))
    setClipMatches(prev => { const n = { ...prev }; delete n[scene_id]; return n })
    setSelectedClips(prev => { const n = { ...prev }; delete n[scene_id]; return n })
  }

  // ─── Voiceover — regenerate single scene ─────────────────────────────────
  const handleRegenerateVoiceover = async (scene) => {
    if (!selectedVoiceId || !projectId) return
    setVoiceoverStatuses(prev => ({ ...prev, [scene.scene_id]: { status: 'generating', duration: null } }))
    try {
      const res = await fetch(`${SERVER_URL}/api/voiceover/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectId, scenes: [scene], voiceId: selectedVoiceId, mode: 'scene', sceneId: scene.scene_id,
        }),
      })
      if (!res.body) throw new Error('No response stream')
      const reader = res.body.getReader(), decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'scene_done') {
              setVoiceoverStatuses(prev => ({ ...prev, [ev.scene_id]: { status: 'done', duration: ev.duration } }))
              setScenes(prev => prev.map(s => s.scene_id !== ev.scene_id ? s : {
                ...s, audio_path: ev.audio_path, audio_duration: ev.duration,
                duration_seconds: ev.duration ? Math.ceil(ev.duration + 0.5) : s.duration_seconds,
              }))
            } else if (ev.type === 'scene_error') {
              setVoiceoverStatuses(prev => ({ ...prev, [ev.scene_id]: { status: 'error', duration: null } }))
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setVoiceoverStatuses(prev => ({ ...prev, [scene.scene_id]: { status: 'error', duration: null } }))
    }
  }

  // ─── Manual match for a single scene ─────────────────────────────────────
  const handleManualMatch = async (scene) => {
    setClipMatches(prev => ({ ...prev, [scene.scene_id]: { matches: [], loading: true } }))
    try {
      const res  = await fetch('/api/library/match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tags:     scene.clip_search_tags || [],
          scene_id: scene.scene_id,
          mood:     scene.mood,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setClipMatches(prev => ({ ...prev, [scene.scene_id]: { matches: data.matches || [], loading: false } }))
    } catch {
      setClipMatches(prev => ({ ...prev, [scene.scene_id]: { matches: [], loading: false } }))
    }
  }

  const imageSceneCount = scenes.filter(s => s.shot_type === 'image').length

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Video Creator</h1>
          <div className="flex items-center gap-4">
            {sessionRestored && (
              <span
                className={`text-xs text-green-400/60 transition-opacity duration-500 ${badgeFading ? 'opacity-0' : 'opacity-100'}`}
              >
                Session restored
              </span>
            )}
            {hasAnalyzed && (
              <button
                onClick={() => setShowClipLibrary(true)}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                <Library size={11} />
                Clip Library
              </button>
            )}
            {hasAnalyzed && scenes.some(s => s.shot_type === 'motion_graphic') && (
              <button
                onClick={handleRebuildAllComponents}
                disabled={isRebuildingAll}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Regenerate all motion graphic components in the new React.createElement format"
              >
                {isRebuildingAll ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {isRebuildingAll ? 'Rebuilding…' : 'Rebuild Components'}
              </button>
            )}
            {showPlayer && (
              <button
                onClick={() => setFilmGrain(g => !g)}
                className={`text-xs transition-colors ${
                  filmGrain ? 'text-white/30 hover:text-white/55' : 'text-white/15'
                }`}
                title="Toggle film grain in player"
              >
                Grain {filmGrain ? 'ON' : 'OFF'}
              </button>
            )}
            {hasAnalyzed && scenes.length > 0 && (
              <button
                onClick={() => setShowPlayer(p => !p)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  showPlayer ? 'text-blue-400' : 'text-white/30 hover:text-white/60'
                }`}
              >
                <Play size={11} />
                {showPlayer ? 'Hide Player' : 'Preview Video'}
              </button>
            )}
            <button
              onClick={handleClearSession}
              className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition-colors"
              title="Clear session and start a new project"
            >
              <Trash2 size={11} />
              Clear session
            </button>
          </div>
        </div>
        <p className="text-white/40 mt-1 text-sm">
          Transform a script into a fully assembled documentary video.
        </p>
      </div>

      <div className="space-y-10">
        <ScriptInput
          key={resetKey}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
        />

        {analyzeError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-400">
            {formatError(analyzeError)}
          </div>
        )}

        {/* Skeleton cards while analyzing */}
        {isAnalyzing && (
          <div>
            <p className="text-xs text-white/25 mb-4">Breaking script into scenes…</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </div>
        )}

        {hasAnalyzed && !isAnalyzing && scenes.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-8 py-12 text-center">
            <p className="text-white/30 text-sm mb-2">No scenes were generated.</p>
            <p className="text-white/20 text-xs">Try a longer script or check your API key in Settings.</p>
          </div>
        )}

        {hasAnalyzed && scenes.length > 0 && (
          <>
            {/* Generate button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || imageSceneCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isGenerating
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Zap size={14} />
                }
                {isGenerating
                  ? 'Generating…'
                  : generateDone
                    ? `Regenerate All (${imageSceneCount})`
                    : `Generate Images (${imageSceneCount})`
                }
              </button>
              {generateDone && (
                <span className="text-xs text-white/30">
                  Generation complete — images saved to project assets
                </span>
              )}
            </div>

            {generateError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-400">
                {formatError(generateError)}
              </div>
            )}

            {/* Sentinel — IntersectionObserver watches this to detect scroll-past */}
            {showPlayer && <div ref={sentinelRef} style={{ height: 0 }} />}

            {/* Normal inline player (only when not stuck) */}
            {showPlayer && !playerStuck && (
              <div className="rounded-xl overflow-hidden border border-white/[0.08]">
                <VideoPlayer
                  scenes={scenes}
                  imagePaths={imagePaths}
                  selectedClips={selectedClips}
                  globalSettings={globalSettings}
                />
              </div>
            )}

            {/* Spacer to hold layout when player is in fixed compact mode */}
            {showPlayer && playerStuck && (
              <div style={{ height: '36vw', maxHeight: 504 }} />
            )}

            {(() => { console.log('[CLIP DEBUG 4] SceneGrid render, clipMatches keys:', Object.keys(clipMatches), 'count:', Object.keys(clipMatches).length); return null })()}
            <SceneGrid
              scenes={scenes}
              onScenesChange={setScenes}
              sceneStatuses={sceneStatuses}
              onRetry={handleRetry}
              motionStatuses={motionStatuses}
              onBuildComponent={handleBuildComponent}
              clipMatches={clipMatches}
              selectedClips={selectedClips}
              onSelectClip={handleSelectClip}
              onConvertToImage={handleConvertToImage}
              onManualMatch={handleManualMatch}
              onOpenLibrary={() => setShowClipLibrary(true)}
              onPreviewScene={setPreviewScene}
              voiceoverStatuses={voiceoverStatuses}
              onRegenerateVoiceover={handleRegenerateVoiceover}
            />

            <VoiceoverPanel
              scenes={scenes}
              projectId={projectId}
              selectedVoiceId={selectedVoiceId}
              onSelectedVoiceChange={setSelectedVoiceId}
              onScenesChange={setScenes}
              onVoiceoverStatusChange={setVoiceoverStatuses}
            />

            <div id="vorta-export-panel">
              <ExportPanel
                scenes={scenes}
                sceneStatuses={sceneStatuses}
                selectedClips={selectedClips}
                voiceoverStatuses={voiceoverStatuses}
                projectId={projectId}
              />
            </div>
          </>
        )}
      </div>
    </div>

    {/* Single-scene compact preview modal */}
    {previewScene && (
      <div
        onClick={e => { if (e.target === e.currentTarget) setPreviewScene(null) }}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 680, position: 'relative' }}>
          <button
            onClick={() => setPreviewScene(null)}
            style={{
              position: 'absolute', top: -40, right: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'rgba(255,255,255,0.35)', background: 'none',
              border: 'none', cursor: 'pointer', fontSize: 13,
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.65)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
          >
            <X size={14} /> Close
          </button>
          <VideoPlayer
            scenes={[previewScene]}
            imagePaths={imagePaths}
            selectedClips={selectedClips}
            globalSettings={globalSettings}
            style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: '10px', overflow: 'hidden' }}
          />
          <p style={{
            marginTop: 12, fontSize: 12,
            color: 'rgba(255,255,255,0.25)', textAlign: 'center',
          }}>
            {previewScene.script_excerpt}
          </p>
        </div>
      </div>
    )}

    {/* Compact sticky player — appears when scrolled past the inline player */}
    {showPlayer && playerStuck && (
      <div style={{
        position: 'fixed', top: 16, right: 24, zIndex: 60,
        width: 320,
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(12px)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          cursor: playerMinimized ? 'pointer' : 'default',
        }}
          onClick={() => playerMinimized && setPlayerMinimized(false)}
        >
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Live Preview
          </span>
          <button
            onClick={e => { e.stopPropagation(); setPlayerMinimized(m => !m) }}
            style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
          >
            {playerMinimized ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {!playerMinimized && (
          <VideoPlayer
            scenes={scenes}
            imagePaths={imagePaths}
            selectedClips={selectedClips}
            globalSettings={globalSettings}
            style={{ width: '100%', aspectRatio: '16 / 9', display: 'block' }}
          />
        )}
      </div>
    )}

    {showClipLibrary && (
      <ClipLibrary onClose={() => setShowClipLibrary(false)} projectId={projectId} />
    )}
    </>
  )
}
