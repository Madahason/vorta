import { useState, useRef, useEffect } from 'react'
import { Loader2, Zap } from 'lucide-react'
import ScriptInput from '../components/video-creator/ScriptInput'
import SceneGrid from '../components/video-creator/SceneGrid'

export default function VideoCreator() {
  const [scenes, setScenes] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  const [projectId, setProjectId] = useState(null)
  const [sceneStatuses, setSceneStatuses] = useState({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [generateDone, setGenerateDone] = useState(false)

  const eventSourceRef = useRef(null)

  // Clean up SSE on unmount
  useEffect(() => {
    return () => eventSourceRef.current?.close()
  }, [])

  const subscribeToProgress = (pid) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/api/generate/progress/${pid}`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.type === 'update') {
        setSceneStatuses(prev => ({
          ...prev,
          [event.scene_id]: {
            status: event.status,
            image_path: event.image_path || prev[event.scene_id]?.image_path || null,
            error: event.error || null,
          },
        }))
      } else if (event.type === 'done') {
        setIsGenerating(false)
        setGenerateDone(true)
        es.close()
      }
    }

    es.onerror = () => {
      // 404 = server restarted, or stream genuinely closed
      setIsGenerating(false)
      es.close()
    }
  }

  const handleAnalyze = async ({ script, metadata }) => {
    setIsAnalyzing(true)
    setAnalyzeError(null)
    // Reset any previous generation state
    setSceneStatuses({})
    setProjectId(null)
    setGenerateDone(false)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, metadata }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setScenes(data.scenes)
      setHasAnalyzed(true)
    } catch (err) {
      setAnalyzeError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setGenerateError(null)
    setGenerateDone(false)

    // Seed pending/skipped statuses immediately so the UI updates right away
    const initialStatuses = {}
    scenes.forEach(s => {
      initialStatuses[s.scene_id] = {
        status: s.shot_type === 'image' ? 'pending' : 'skipped',
        image_path: null,
        error: null,
      }
    })
    setSceneStatuses(initialStatuses)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes, projectId }),
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

  const handleRetry = async (scene_id, higgsfield_prompt) => {
    setSceneStatuses(prev => ({
      ...prev,
      [scene_id]: { status: 'pending', image_path: null, error: null },
    }))
    setIsGenerating(true)

    try {
      await fetch('/api/generate/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, scene_id, higgsfield_prompt }),
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

  const imageSceneCount = scenes.filter(s => s.shot_type === 'image').length

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Video Creator</h1>
        <p className="text-white/40 mt-1 text-sm">
          Transform a script into a fully assembled documentary video.
        </p>
      </div>

      <div className="space-y-10">
        <ScriptInput onAnalyze={handleAnalyze} isAnalyzing={isAnalyzing} />

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
            />
          </>
        )}
      </div>
    </div>
  )
}
