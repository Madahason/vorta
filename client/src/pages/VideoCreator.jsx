import { useState } from 'react'
import ScriptInput from '../components/video-creator/ScriptInput'
import SceneGrid from '../components/video-creator/SceneGrid'

export default function VideoCreator() {
  const [scenes, setScenes] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  const handleAnalyze = async ({ script, metadata }) => {
    setIsAnalyzing(true)
    setError(null)
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
      setError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

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

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {hasAnalyzed && scenes.length > 0 && (
          <SceneGrid scenes={scenes} onScenesChange={setScenes} />
        )}
      </div>
    </div>
  )
}
