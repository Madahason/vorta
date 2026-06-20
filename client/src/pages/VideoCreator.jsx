import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Library, X } from 'lucide-react'
import { VideoPlayer } from '../components/video-creator/VideoPlayer'
import ClipLibrary from '../components/video-creator/ClipLibrary'
import { WizardNav } from '../components/video-creator/WizardNav'
import { useWizardState } from '../hooks/useWizardState'
import { ScriptStep }  from './wizard/ScriptStep'
import { ScenesStep }  from './wizard/ScenesStep'
import { VisualsStep } from './wizard/VisualsStep'
import { VoiceStep }   from './wizard/VoiceStep'
import { ExportStep }  from './wizard/ExportStep'
import { PreviewPlayer } from '../components/video-creator/PreviewPlayer'

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
  const wizard = useWizardState()

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

  // Voiceover
  const [voiceoverStatuses,   setVoiceoverStatuses]   = useState({})
  const [voiceoverPanelOpen,  setVoiceoverPanelOpen]  = useState(false)
  const [voiceoverFocusScene, setVoiceoverFocusScene] = useState(null)

  // Generate progress — { done, total }
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 })

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
  const [showPreview, setShowPreview]       = useState(false)
  const [showPreviewHint, setShowPreviewHint] = useState(false)
  const [filmGrain, setFilmGrain]       = useState(true)
  const [previewScene, setPreviewScene] = useState(null)
  // Stable array ref — prevents the preview VideoPlayer from re-initialising
  // on every parent render when a scene is previewed.
  const previewScenes = useMemo(() => previewScene ? [previewScene] : [], [previewScene])

  const eventSourceRef       = useRef(null)
  const prevGeneratingRef    = useRef(false)

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
      // Space — toggle full-screen preview (not in inputs/textareas)
      if (e.code === 'Space' &&
          e.target.tagName !== 'INPUT' &&
          e.target.tagName !== 'TEXTAREA' &&
          e.target.tagName !== 'SELECT') {
        if (scenes.length > 0) {
          e.preventDefault()
          setShowPreview(prev => !prev)
          return
        }
      }
      if (e.key === 'Escape') {
        if (showPreview)      { setShowPreview(false); return }
        if (previewScene)     { setPreviewScene(null); return }
        if (showClipLibrary)  { setShowClipLibrary(false); return }
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
  }, [showPreview, previewScene, showClipLibrary, hasAnalyzed, scenes.length])

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

  // ─── Re-run clip matching on load if scenes restored but matches missing ──
  useEffect(() => {
    const realScenes = scenes.filter(s => s.shot_type === 'real_footage')
    const unmatched  = realScenes.filter(s => !clipMatches[s.scene_id])
    if (unmatched.length > 0) matchClipsForScenes(unmatched)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── SSE cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => { return () => eventSourceRef.current?.close() }, [])

  // ─── Preview hint — show after generation finishes ────────────────────────
  useEffect(() => {
    if (prevGeneratingRef.current && !isGenerating && generateDone && scenes.length > 0) {
      setShowPreviewHint(true)
      const t = setTimeout(() => setShowPreviewHint(false), 4000)
      return () => clearTimeout(t)
    }
    prevGeneratingRef.current = isGenerating
  }, [isGenerating]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setShowPreview(false)
    setShowPreviewHint(false)
    setPreviewScene(null)
    setSessionRestored(false)
    setBadgeFading(false)
    setResetKey(k => k + 1)
    wizard.resetWizard()
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
      // Advance wizard to Scenes step
      wizard.markComplete('script')
      wizard.goNext()

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

  // ─── Generate — image scenes (promise-based for parallel coordination) ───
  const generateImageScenes = async (imageScenes, tick) => {
    if (!imageScenes.length) return

    setSceneStatuses(prev => {
      const next = { ...prev }
      imageScenes.forEach(s => {
        next[s.scene_id] = { status: 'pending', image_path: null, error: null }
      })
      return next
    })

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

      await new Promise(resolve => {
        eventSourceRef.current?.close()
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
            if (event.status === 'done' || event.status === 'failed') tick()
          } else if (event.type === 'done') {
            es.close()
            resolve()
          }
        }
        es.onerror = () => { es.close(); resolve() }
      })
    } catch (err) {
      setGenerateError(err.message)
      imageScenes.forEach(() => tick())
    }
  }

  // ─── Generate — motion graphic components (sequential to avoid rate limits)
  const generateMotionGraphicsScenes = async (motionScenes, tick) => {
    for (const scene of motionScenes) {
      await handleBuildComponent(scene)
      tick()
    }
  }

  // ─── Generate — real footage clip matching ────────────────────────────────
  const generateRealFootageMatches = async (realScenes, tick) => {
    if (!realScenes.length) return
    await matchClipsForScenes(realScenes)
    realScenes.forEach(() => tick())
  }

  // ─── Unified Generate Assets ──────────────────────────────────────────────
  const handleGenerateAll = async () => {
    const imageScenes   = scenes.filter(s => s.shot_type === 'image')
    const motionScenes  = scenes.filter(s => s.shot_type === 'motion_graphic' && !s.motion_component)
    const realScenes    = scenes.filter(s => s.shot_type === 'real_footage'   && !clipMatches[s.scene_id]?.matches?.length)
    const total = imageScenes.length + motionScenes.length + realScenes.length

    setIsGenerating(true)
    setGenerateError(null)
    setGenerateDone(false)
    setGenerateProgress({ done: 0, total })

    const tick = () => setGenerateProgress(p => ({ ...p, done: p.done + 1 }))

    await Promise.allSettled([
      generateImageScenes(imageScenes, tick),
      generateMotionGraphicsScenes(motionScenes, tick),
      generateRealFootageMatches(realScenes, tick),
    ])

    setIsGenerating(false)
    setGenerateDone(true)
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

  // ─── Voiceover — open panel + focus scene ────────────────────────────────
  const handleOpenVoiceover = (scene) => {
    setVoiceoverPanelOpen(true)
    setVoiceoverFocusScene(scene.scene_id)
  }

  // ─── Voiceover — called by VoiceoverPanel on scene_done SSE event ────────
  const handleAudioGenerated = (sceneId, audioPath, audioDuration, sceneDuration) => {
    console.log('[voiceover] handleAudioGenerated called — scene:', sceneId, 'path:', audioPath)
    setScenes(prev => {
      const updated = prev.map(s => {
        if (s.scene_id !== sceneId) return s
        const base = { ...s, audio_path: audioPath, audio_duration: audioDuration }
        if (sceneDuration) {
          base.duration_seconds = sceneDuration
        } else if (audioDuration && audioDuration > 0) {
          base.duration_seconds = parseFloat((audioDuration + 0.8).toFixed(2))
        }
        return base
      })
      const audioCount = updated.filter(s => s.audio_path).length
      console.log('[voiceover] scenes with audio_path:', audioCount, '/', updated.length)
      // Persist immediately so audio_path survives a page refresh before the useEffect fires
      try { localStorage.setItem(LS.scenes, JSON.stringify(updated)) } catch { /* quota */ }
      return updated
    })
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

  const imageSceneCount   = scenes.filter(s => s.shot_type === 'image').length
  const motionSceneCount  = scenes.filter(s => s.shot_type === 'motion_graphic').length
  const footageSceneCount = scenes.filter(s => s.shot_type === 'real_footage').length

  const breakdownParts = [
    imageSceneCount   > 0 && `${imageSceneCount} image${imageSceneCount   !== 1 ? 's' : ''}`,
    motionSceneCount  > 0 && `${motionSceneCount} motion graphic${motionSceneCount  !== 1 ? 's' : ''}`,
    footageSceneCount > 0 && `${footageSceneCount} footage match${footageSceneCount !== 1 ? 'es' : ''}`,
  ].filter(Boolean)

  // ─── Step renderer ───────────────────────────────────────────────────────
  const renderStep = () => {
    switch (wizard.currentStep) {
      case 'script':
        return (
          <ScriptStep
            scenes={scenes}
            isAnalyzing={isAnalyzing}
            analyzeError={analyzeError}
            onAnalyze={handleAnalyze}
            wizard={wizard}
            resetKey={resetKey}
          />
        )
      case 'scenes':
        return (
          <ScenesStep
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
            onOpenVoiceover={handleOpenVoiceover}
            wizard={wizard}
          />
        )
      case 'visuals':
        return (
          <VisualsStep
            scenes={scenes}
            sceneStatuses={sceneStatuses}
            isGenerating={isGenerating}
            generateDone={generateDone}
            generateProgress={generateProgress}
            generateError={generateError}
            onGenerateAll={handleGenerateAll}
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
            onOpenVoiceover={handleOpenVoiceover}
            projectId={projectId}
            wizard={wizard}
          />
        )
      case 'voice':
        return (
          <VoiceStep
            scenes={scenes}
            projectId={projectId}
            onAudioGenerated={handleAudioGenerated}
            voiceoverStatuses={voiceoverStatuses}
            onVoiceoverStatusChange={setVoiceoverStatuses}
            onScenesChange={setScenes}
            wizard={wizard}
          />
        )
      case 'export':
        return (
          <ExportStep
            scenes={scenes}
            sceneStatuses={sceneStatuses}
            selectedClips={selectedClips}
            imagePaths={imagePaths}
            globalSettings={globalSettings}
            voiceoverStatuses={voiceoverStatuses}

            projectId={projectId}
            wizard={wizard}
          />
        )
      default:
        return null
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Wizard layout ── */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>

        {/* Top bar: wizard nav + utility actions */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
          overflow: 'hidden', minWidth: 0,
        }}>
          <WizardNav
            wizard={wizard}
            scenes={scenes}
            onPreview={() => setShowPreview(true)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', flexShrink: 0 }}>
            {sessionRestored && (
              <span style={{
                fontSize: 11, color: 'rgba(134,239,172,0.6)',
                opacity: badgeFading ? 0 : 1, transition: 'opacity 0.5s',
              }}>
                Session restored
              </span>
            )}
            {hasAnalyzed && (
              <button
                onClick={() => setShowClipLibrary(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
              >
                <Library size={11} /> Clip Library
              </button>
            )}
            <button
              onClick={handleClearSession}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
              title="Clear session"
            >
              <Trash2 size={11} /> Clear
            </button>
          </div>
        </div>

        {/* Sticky mini player — visible on all steps except Script */}
        {wizard.currentStep !== 'script' && scenes.length > 0 && (
          <div style={{
            display:        'flex',
            alignItems:     'center',
            gap:             16,
            padding:        '8px 24px',
            background:     'rgba(10,10,10,0.96)',
            backdropFilter: 'blur(12px)',
            borderBottom:   '1px solid rgba(255,255,255,0.06)',
            flexShrink:      0,
          }}>
            <div style={{ width: 320, flexShrink: 0 }}>
              <VideoPlayer
                scenes={scenes}
                imagePaths={imagePaths}
                selectedClips={selectedClips}
                globalSettings={globalSettings}
    
                style={{ width: '100%', aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden' }}
              />
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 2 }}>
                {scenes.length} scene{scenes.length !== 1 ? 's' : ''} ·{' '}
                {scenes.reduce((s, sc) => s + (sc.duration_seconds || 5), 0).toFixed(0)}s total
              </div>
              {Object.values(sceneStatuses).filter(s => s.status === 'done').length > 0 && (
                <div style={{ color: 'rgba(74,222,128,0.7)', fontSize: 11 }}>
                  ✓ {Object.values(sceneStatuses).filter(s => s.status === 'done').length} visuals ready
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step content — Framer Motion slide transition between wizard steps */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={wizard.currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ height: '100%' }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Global modals (persist across all steps) ── */}

      {/* Single-scene preview modal */}
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
              scenes={previewScenes}
              imagePaths={imagePaths}
              selectedClips={selectedClips}
              globalSettings={globalSettings}
              style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: '10px', overflow: 'hidden' }}
            />
            <p style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
              {previewScene.script_excerpt}
            </p>
          </div>
        </div>
      )}

      {/* Legacy sticky player removed — header mini player (line 832) already provides
         continuous preview on all non-script steps. Two simultaneous VideoPlayers mounting
         the same scenes caused duplicate <Audio> elements for narration. */}

      {showClipLibrary && (
        <ClipLibrary onClose={() => setShowClipLibrary(false)} projectId={projectId} />
      )}

      {/* Full-screen preview player */}
      <PreviewPlayer
        scenes={scenes}
        imagePaths={imagePaths}
        selectedClips={selectedClips}
        globalSettings={globalSettings}
        sceneStatuses={sceneStatuses}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onRegenerateImage={(sceneId) => {
          setShowPreview(false)
          wizard.goTo('visuals')
          // Trigger retry for this scene using its current prompt
          const scene = scenes.find(s => s.scene_id === sceneId)
          if (scene) handleRetry(sceneId, scene.higgsfield_prompt)
        }}
        onRegenerateVoice={() => {
          setShowPreview(false)
          wizard.goTo('voice')
        }}
        onShotTypeChange={(sceneId, newType) => {
          setScenes(prev => prev.map(s =>
            s.scene_id === sceneId
              ? { ...s, shot_type: newType, real_footage_flag: newType === 'real_footage' }
              : s
          ))
        }}
      />

      {/* Preview hint — shown briefly after visuals generation completes */}
      {showPreviewHint && (
        <div style={{
          position:   'fixed',
          bottom:      24,
          right:       24,
          zIndex:      100,
          padding:    '10px 16px',
          background: 'rgba(59,130,246,0.15)',
          border:     '1px solid rgba(59,130,246,0.3)',
          borderRadius: 8,
          display:    'flex',
          alignItems: 'center',
          gap:         10,
          animation:  'slideIn 0.2s ease',
        }}>
          <span style={{ color: '#60a5fa', fontSize: 13 }}>
            ▶ Press Space or click Preview to check your video
          </span>
          <button
            onClick={() => { setShowPreviewHint(false); setShowPreview(true) }}
            style={{
              padding:      '4px 10px',
              borderRadius:  5,
              background:   '#3b82f6',
              border:       'none',
              color:        'white',
              cursor:       'pointer',
              fontSize:      12,
            }}
          >
            Preview now
          </button>
        </div>
      )}
    </>
  )
}
