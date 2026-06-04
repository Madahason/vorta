import { useState, useRef, useEffect } from 'react'
import { Loader2, Zap, Trash2, Play, Library } from 'lucide-react'
import ScriptInput from '../components/video-creator/ScriptInput'
import SceneGrid from '../components/video-creator/SceneGrid'
import VideoPreviewPlayer from '../components/video-creator/VideoPreviewPlayer'
import ClipLibrary from '../components/video-creator/ClipLibrary'

// EventSource must connect directly to Express — Vite's proxy buffers text/event-stream
const SERVER_URL = 'http://localhost:3001'

const LS = {
  scenes:        'vorta_scenes',
  projectId:     'vorta_project_id',
  statuses:      'vorta_scene_statuses',
  metadata:      'vorta_script_metadata',
  motionComps:   'vorta_motion_components',
  clipMatches:   'vorta_clip_matches',
  selectedClips: 'vorta_selected_clips',
}

function lsRead(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function lsWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}
function lsClearAll() {
  Object.values(LS).forEach(k => localStorage.removeItem(k))
}

export default function VideoCreator() {
  // ─── State — lazy-initialised from localStorage ─────────────────────────
  const [scenes, setScenes] = useState(() => lsRead(LS.scenes) || [])
  const [projectId, setProjectId] = useState(() => lsRead(LS.projectId) || null)
  const [sceneStatuses, setSceneStatuses] = useState(() => lsRead(LS.statuses) || {})
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
  const [motionStatuses, setMotionStatuses] = useState({})

  // Clip matches — { [scene_id]: { matches: [], loading: bool } }
  // Rehydrate from localStorage, stripping any stale loading:true entries
  const [clipMatches, setClipMatches] = useState(() => {
    const saved = lsRead(LS.clipMatches) || {}
    // Ensure no stale loading states survive a refresh
    const clean = {}
    Object.entries(saved).forEach(([sid, v]) => {
      clean[sid] = { matches: v.matches || [], loading: false }
    })
    return clean
  })

  // Selected clips — { [scene_id]: clip_object } — separate from scene objects
  const [selectedClips, setSelectedClips] = useState(() => {
    const saved = lsRead(LS.selectedClips)
    if (saved) return saved
    // Migrate from old scene.selected_clip if present
    const savedScenes = lsRead(LS.scenes) || []
    const migrated = {}
    savedScenes.forEach(s => { if (s.selected_clip) migrated[s.scene_id] = s.selected_clip })
    return migrated
  })

  const [showClipLibrary, setShowClipLibrary] = useState(false)

  // Never persist these — always start false
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  // Session-restored badge
  const [sessionRestored, setSessionRestored] = useState(() => {
    const s = lsRead(LS.scenes)
    return Array.isArray(s) && s.length > 0
  })
  const [badgeFading, setBadgeFading] = useState(false)

  // Key to force ScriptInput remount when session is cleared
  const [resetKey, setResetKey] = useState(0)
  const [showVideoPlayer, setShowVideoPlayer] = useState(false)

  const eventSourceRef = useRef(null)

  // ─── Session-restored fade-out ───────────────────────────────────────────
  useEffect(() => {
    if (!sessionRestored) return
    const fade   = setTimeout(() => setBadgeFading(true),          2500)
    const remove = setTimeout(() => setSessionRestored(false),     3000)
    return () => { clearTimeout(fade); clearTimeout(remove) }
  }, []) // run once on mount only

  // ─── Persist on every change ─────────────────────────────────────────────
  useEffect(() => { lsWrite(LS.scenes,        scenes)        }, [scenes])
  useEffect(() => { lsWrite(LS.projectId,     projectId)     }, [projectId])
  useEffect(() => { lsWrite(LS.statuses,      sceneStatuses) }, [sceneStatuses])
  useEffect(() => { lsWrite(LS.selectedClips, selectedClips) }, [selectedClips])
  useEffect(() => {
    // Strip loading:true before writing — loading is always transient
    const toSave = {}
    Object.entries(clipMatches).forEach(([sid, v]) => {
      if (!v.loading) toSave[sid] = v
    })
    lsWrite(LS.clipMatches, toSave)
  }, [clipMatches])

  // ─── Re-run clip matching on load if scenes restored but matches missing ──
  useEffect(() => {
    const realScenes = scenes.filter(s => s.shot_type === 'real_footage')
    const unmatched  = realScenes.filter(s => !clipMatches[s.scene_id])
    if (unmatched.length > 0) matchClipsForScenes(unmatched)
  }, []) // runs once on mount

  // ─── SSE cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => { return () => eventSourceRef.current?.close() }, [])

  // ─── Clear session ────────────────────────────────────────────────────────
  const handleClearSession = () => {
    eventSourceRef.current?.close()
    lsClearAll()
    setScenes([])
    setHasAnalyzed(false)
    setProjectId(null)
    setSceneStatuses({})
    setGenerateDone(false)
    setGenerateError(null)
    setAnalyzeError(null)
    setIsGenerating(false)
    setMotionStatuses({})
    setClipMatches({})
    setSelectedClips({})
    setShowClipLibrary(false)
    setSessionRestored(false)
    setBadgeFading(false)
    setResetKey(k => k + 1)  // remounts ScriptInput → reads now-empty localStorage
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

      // Embed component code directly on the scene object (persisted via vorta_scenes)
      setScenes(prev => prev.map(s =>
        s.scene_id === scene.scene_id ? { ...s, motion_component: data.component_code } : s
      ))

      // Also write to the dedicated motion components key
      const existing = lsRead(LS.motionComps) || {}
      lsWrite(LS.motionComps, { ...existing, [scene.scene_id]: data.component_code })

      setMotionStatuses(prev => ({ ...prev, [scene.scene_id]: { status: 'done', error: null } }))
    } catch (err) {
      setMotionStatuses(prev => ({ ...prev, [scene.scene_id]: { status: 'failed', error: err.message } }))
    }
  }

  // ─── Clip matching ────────────────────────────────────────────────────────
  const matchClipsForScenes = async (allScenes) => {
    const realScenes = allScenes.filter(s => s.shot_type === 'real_footage')
    if (!realScenes.length) return

    // Set all real footage scenes to loading
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

      setClipMatches(prev => {
        const next = { ...prev }
        Object.entries(data.results).forEach(([sid, matches]) => {
          next[sid] = { matches, loading: false }
        })
        return next
      })
    } catch {
      // Clear loading states silently — scenes still work, just no auto-matches
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
  const hasAnyAsset = scenes.some(s =>
    (s.shot_type === 'image' && sceneStatuses[s.scene_id]?.status === 'done') ||
    (s.shot_type === 'motion_graphic' && !!s.motion_component)
  )

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
            {hasAnalyzed && hasAnyAsset && (
              <button
                onClick={() => setShowVideoPlayer(true)}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                <Play size={11} />
                Preview Video
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
            {analyzeError}
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
                {generateError}
              </div>
            )}

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
            />
          </>
        )}
      </div>
    </div>

    {showVideoPlayer && (
      <VideoPreviewPlayer
        scenes={scenes}
        sceneStatuses={sceneStatuses}
        onClose={() => setShowVideoPlayer(false)}
      />
    )}

    {showClipLibrary && (
      <ClipLibrary onClose={() => setShowClipLibrary(false)} />
    )}
    </>
  )
}
