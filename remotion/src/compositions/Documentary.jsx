import { useMemo }                                                                     from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, useVideoConfig } from 'remotion'
import { TransitionSeries, springTiming }                                       from '@remotion/transitions'
import { fade }                                                                 from '@remotion/transitions/fade'
import ImageScene             from '../components/ImageScene'
import FootageScene           from '../components/FootageScene'
import PlaceholderScene       from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'

const TRANSITION_FRAMES = 12 // 0.4 s at 30 fps — cross-fade overlap

// ── Duration helpers ──────────────────────────────────────────────────────────
export function calculateDocumentaryDuration(scenes, fps = 30) {
  if (!scenes?.length) return 30
  const base      = scenes.reduce((sum, s) => sum + Math.round((s.duration_seconds || 5) * fps), 0)
  const deduction = Math.max(0, scenes.length - 1) * TRANSITION_FRAMES
  return Math.max(base - deduction, 30)
}

// Kept for backward compat — Remotion Studio still imports it
export function computeLayout(scenes) {
  const startFrames = []
  let cursor = 0
  scenes.forEach((scene) => {
    startFrames.push(cursor)
    cursor += Math.round((scene.duration_seconds || 5) * 30)
  })
  return { startFrames, totalFrames: cursor }
}

// Accept relative URLs (/...), HTTP URLs, and absolute filesystem paths
// (Windows C:\... or Unix /abs/path) — render.js passes absolute paths in simple mode.
const isValidUrl = (src) => {
  if (!src) return false
  if (src.startsWith('http') || src.startsWith('/')) return true
  if (/^[A-Za-z]:[/\\]/.test(src)) return true // Windows absolute path
  return false
}

// ── SceneRenderer — per-scene dispatch ───────────────────────────────────────
function SceneRenderer({ scene, imagePath, selectedClip, globalSettings }) {
  if (!scene) return <PlaceholderScene scene={{ scene_id: 'unknown' }} />

  if (scene.shot_type === 'image') {
    if (!imagePath) return <PlaceholderScene scene={scene} />
    return <ImageScene scene={scene} imagePath={imagePath} globalSettings={globalSettings} />
  }
  if (scene.shot_type === 'motion_graphic') {
    if (!scene.motion_component) return <PlaceholderScene scene={scene} />
    return <MotionGraphicScene scene={scene} />
  }
  if (scene.shot_type === 'real_footage') {
    if (!selectedClip) return <PlaceholderScene scene={scene} />
    return <FootageScene clip={selectedClip} />
  }
  return <PlaceholderScene scene={scene} />
}

// ── Documentary composition ───────────────────────────────────────────────────
export function Documentary({
  scenes         = [],
  imagePaths     = {},
  selectedClips  = {},
  globalSettings = {},
  audioSpecs     = [],
}) {
  const { fps } = useVideoConfig()

  // Deduplicate scenes by scene_id
  const uniqueScenes = useMemo(() => {
    const seen = new Set()
    return scenes.filter(s => {
      if (!s?.scene_id || seen.has(s.scene_id)) return false
      seen.add(s.scene_id)
      return true
    })
  }, [scenes])

  // Build audioSpec lookup
  const validSceneIds = new Set(uniqueScenes.map(s => s.scene_id))
  const audioSpecMap  = {}
  audioSpecs.forEach(spec => {
    if (validSceneIds.has(spec.scene_id)) audioSpecMap[spec.scene_id] = spec
  })

  const narrationCount = audioSpecs.filter(s => s?.narration?.url).length
  console.log('[Documentary] scenes:', scenes.length, '→ unique:', uniqueScenes.length,
    '| audioSpecs:', audioSpecs.length, '| narration:', narrationCount)
  if (uniqueScenes[0]) {
    const s0  = uniqueScenes[0]
    const sp0 = audioSpecMap[s0.scene_id]
    console.log('[Documentary] scene 0 narration url:', sp0?.narration?.url || s0.audio_path || '(none)')
  }

  if (!uniqueScenes.length) {
    return (
      <AbsoluteFill style={{
        backgroundColor: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: 'white', fontSize: 24, fontFamily: 'sans-serif' }}>
          No scenes loaded
        </div>
      </AbsoluteFill>
    )
  }

  const seriesChildren = uniqueScenes.flatMap((scene, index) => {
    const durationFrames = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
    const spec           = audioSpecMap[scene.scene_id] || null
    const narrationUrl   = spec?.narration?.url || scene.audio_path || null

    const sequence = (
      <TransitionSeries.Sequence
        key={String(scene.scene_id)}
        durationInFrames={durationFrames}
      >
        <AbsoluteFill>
          <ErrorBoundaryScene scene={scene}>
            <SceneRenderer
              scene={scene}
              imagePath={imagePaths[scene.scene_id]}
              selectedClip={selectedClips[scene.scene_id] || null}
              globalSettings={globalSettings}
            />
          </ErrorBoundaryScene>

          {/* Per-scene narration — fades out in final 9 frames */}
          {isValidUrl(narrationUrl) && (
            <Audio
              src={narrationUrl}
              volume={(frame) => {
                const fadeStart = durationFrames - 9
                if (frame >= fadeStart) {
                  return interpolate(frame, [fadeStart, durationFrames], [1.0, 0], {
                    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                  })
                }
                return 1.0
              }}
            />
          )}
        </AbsoluteFill>
      </TransitionSeries.Sequence>
    )

    if (index < uniqueScenes.length - 1) {
      const transition = (
        <TransitionSeries.Transition
          key={`t-${scene.scene_id}`}
          timing={springTiming({ durationInFrames: TRANSITION_FRAMES, config: { damping: 200 } })}
          presentation={fade()}
        />
      )
      return [sequence, transition]
    }
    return [sequence]
  })

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <TransitionSeries>
        {seriesChildren}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
