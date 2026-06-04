import { useState, useEffect, useRef } from 'react'
import { X, Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { buildPreviewHTML } from '../../utils/buildPreviewHTML'

export default function VideoPreviewPlayer({ scenes, sceneStatuses, onClose }) {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [isPlaying, setIsPlaying]   = useState(false)
  const [displayElapsed, setDisplayElapsed] = useState(0)

  // All values read inside the interval are stored in refs to avoid stale closures
  const intervalRef  = useRef(null)
  const elapsedRef   = useRef(0)
  const startTimeRef = useRef(null)
  const isPlayingRef = useRef(false)
  const sceneIdxRef  = useRef(0)
  const scenesRef    = useRef(scenes)
  scenesRef.current  = scenes  // always fresh

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => () => clearInterval(intervalRef.current), [])

  // Single tick function — reads all dynamic values from refs
  const tick = () => {
    const elapsed    = Date.now() - startTimeRef.current
    const idx        = sceneIdxRef.current
    const allScenes  = scenesRef.current
    const durationMs = (allScenes[idx]?.duration_seconds || 5) * 1000

    elapsedRef.current = elapsed
    setDisplayElapsed(elapsed)

    if (elapsed >= durationMs) {
      if (idx < allScenes.length - 1) {
        const next = idx + 1
        sceneIdxRef.current  = next
        elapsedRef.current   = 0
        startTimeRef.current = Date.now()
        setSceneIndex(next)
        setDisplayElapsed(0)
      } else {
        // Reached end — loop back to start, stopped
        clearInterval(intervalRef.current)
        intervalRef.current  = null
        isPlayingRef.current = false
        sceneIdxRef.current  = 0
        elapsedRef.current   = 0
        setSceneIndex(0)
        setDisplayElapsed(0)
        setIsPlaying(false)
      }
    }
  }

  const play = () => {
    if (isPlayingRef.current) return
    startTimeRef.current = Date.now() - elapsedRef.current
    intervalRef.current  = setInterval(tick, 50)
    isPlayingRef.current = true
    setIsPlaying(true)
  }

  const pause = () => {
    clearInterval(intervalRef.current)
    intervalRef.current  = null
    elapsedRef.current   = Date.now() - (startTimeRef.current ?? Date.now())
    isPlayingRef.current = false
    setIsPlaying(false)
  }

  const goToScene = index => {
    const wasPlaying = isPlayingRef.current
    clearInterval(intervalRef.current)
    intervalRef.current  = null
    isPlayingRef.current = false

    sceneIdxRef.current = index
    elapsedRef.current  = 0
    setSceneIndex(index)
    setDisplayElapsed(0)

    if (wasPlaying) {
      startTimeRef.current = Date.now()
      intervalRef.current  = setInterval(tick, 50)
      isPlayingRef.current = true
      setIsPlaying(true)
    }
  }

  const currentScene    = scenes[sceneIndex]
  const currentDuration = (currentScene?.duration_seconds || 5) * 1000
  const genStatus       = sceneStatuses[currentScene?.scene_id] || null
  const imageUrl        = genStatus?.status === 'done' ? genStatus.image_path : null
  const kbAnim          = sceneIndex % 2 === 0 ? 'kenBurnsIn' : 'kenBurnsOut'

  const progressPct = Math.min(100, (displayElapsed / currentDuration) * 100)

  const totalMs       = scenes.reduce((s, sc) => s + (sc.duration_seconds || 5) * 1000, 0)
  const elapsedBefore = scenes.slice(0, sceneIndex).reduce((s, sc) => s + (sc.duration_seconds || 5) * 1000, 0)
  const overallPct    = Math.min(100, ((elapsedBefore + displayElapsed) / totalMs) * 100)
  const timeLeft      = Math.max(0, Math.ceil((currentDuration - displayElapsed) / 1000))

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      <style>{`
        @keyframes kenBurnsIn  { from { transform: scale(1);    } to { transform: scale(1.08); } }
        @keyframes kenBurnsOut { from { transform: scale(1.08); } to { transform: scale(1);    } }
        @keyframes sceneFadeIn { from { opacity: 0; }             to { opacity: 1; }             }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
        <span className="text-xs text-white/30">Video Preview</span>
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono text-white/20">
            {sceneIndex + 1} / {scenes.length}
          </span>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
        <div
          key={sceneIndex}
          style={{
            width: '100%',
            maxWidth: 'min(100vw, calc((100vh - 140px) * 16 / 9))',
            aspectRatio: '16 / 9',
            animation: 'sceneFadeIn 0.4s ease forwards',
          }}
        >
          {currentScene?.shot_type === 'image' && (
            imageUrl
              ? <div className="w-full h-full overflow-hidden">
                  <img
                    src={imageUrl}
                    alt={`Scene ${sceneIndex + 1}`}
                    className="w-full h-full object-cover"
                    style={{ animation: `${kbAnim} 8s ease-in-out infinite alternate` }}
                  />
                </div>
              : <div className="w-full h-full flex items-center justify-center bg-white/[0.02]">
                  <p className="text-sm text-white/15">No image generated</p>
                </div>
          )}

          {currentScene?.shot_type === 'motion_graphic' && (
            currentScene.motion_component
              ? <div className="w-full h-full">
                  <iframe
                    srcDoc={buildPreviewHTML(currentScene.motion_component, currentScene.motion_graphic_type)}
                    title={`player-${currentScene.scene_id}`}
                    sandbox="allow-scripts"
                    className="w-full h-full border-0"
                  />
                </div>
              : <div className="w-full h-full flex items-center justify-center bg-teal-500/[0.02]">
                  <p className="text-sm text-teal-400/20">No component built</p>
                </div>
          )}

          {currentScene?.shot_type === 'real_footage' && (
            <div className="w-full h-full flex items-center justify-center bg-amber-500/[0.02]">
              <p className="text-sm text-amber-400/20">Real footage</p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-5 py-3 border-t border-white/[0.06] shrink-0 space-y-2.5">

        {/* Per-scene progress bar */}
        <div className="h-0.5 bg-white/[0.07] rounded-full overflow-hidden">
          <div className="h-full bg-white/25 rounded-full transition-none" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Playback row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => goToScene(Math.max(0, sceneIndex - 1))}
              disabled={sceneIndex === 0}
              className="p-1.5 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={() => { if (isPlaying) pause(); else play() }}
              className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white transition-colors"
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              onClick={() => goToScene(Math.min(scenes.length - 1, sceneIndex + 1))}
              disabled={sceneIndex === scenes.length - 1}
              className="p-1.5 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <SkipForward size={14} />
            </button>
          </div>

          {/* Overall progress + script excerpt */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="h-0.5 bg-white/[0.04] rounded-full overflow-hidden">
              <div className="h-full bg-blue-500/40 rounded-full transition-none" style={{ width: `${overallPct}%` }} />
            </div>
            <p className="text-[11px] text-white/20 truncate">{currentScene?.script_excerpt}</p>
          </div>

          <span className="text-[11px] font-mono text-white/20 shrink-0 w-6 text-right">
            {timeLeft}s
          </span>
        </div>

        {/* Scene thumbnail strip */}
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {scenes.map((s, i) => {
            const st       = sceneStatuses[s.scene_id]
            const isActive = i === sceneIndex
            return (
              <button
                key={s.scene_id}
                onClick={() => goToScene(i)}
                title={`Scene ${i + 1}`}
                className={`shrink-0 rounded overflow-hidden transition-all border ${
                  isActive
                    ? 'border-white/30 opacity-100'
                    : 'border-transparent opacity-35 hover:opacity-60'
                }`}
                style={{ width: 56, height: 32 }}
              >
                {st?.status === 'done' && st?.image_path
                  ? <img src={st.image_path} alt="" className="w-full h-full object-cover" />
                  : <div className={`w-full h-full flex items-center justify-center text-[9px] font-mono ${
                      s.shot_type === 'image'          ? 'bg-blue-500/[0.08] text-blue-400/40'
                      : s.shot_type === 'motion_graphic' ? 'bg-teal-500/[0.08] text-teal-400/40'
                      : 'bg-amber-500/[0.08] text-amber-400/40'
                    }`}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                }
              </button>
            )
          })}
        </div>

      </div>
    </div>
  )
}
