import { AbsoluteFill, Series } from 'remotion'
import ImageScene      from '../components/ImageScene'
import FootageScene    from '../components/FootageScene'
import PlaceholderScene from '../components/PlaceholderScene'
import AnimatedCounter from '../components/AnimatedCounter'
import TimelineBar     from '../components/TimelineBar'
import ComparisonChart from '../components/ComparisonChart'
import QuoteCard       from '../components/QuoteCard'
import MapHighlight    from '../components/MapHighlight'

const FPS = 30

// ── Duration helpers ──────────────────────────────────────────────────────────
// Simple sum — Series lays scenes out sequentially (no overlap).
// Transitions (dissolve/dip) will be layered on top in Phase 5.
export function calculateDocumentaryDuration(scenes) {
  if (!scenes?.length) return 30
  return Math.max(
    scenes.reduce((sum, s) => sum + (s.duration_seconds || 5) * FPS, 0),
    30
  )
}

// Kept for backward compat — Remotion Studio still imports it
export function computeLayout(scenes) {
  const startFrames = []
  let cursor = 0
  scenes.forEach((scene, i) => {
    startFrames.push(cursor)
    cursor += (scene.duration_seconds || 5) * FPS
  })
  return { startFrames, totalFrames: cursor }
}

// ── MotionGraphicScene ────────────────────────────────────────────────────────
function MotionGraphicScene({ scene }) {
  const type  = scene.motion_graphic_type
  const props = scene.motion_graphic_props || {}

  if (type === 'AnimatedCounter') return <AnimatedCounter {...props} />
  if (type === 'TimelineBar')     return <TimelineBar     {...props} />
  if (type === 'ComparisonChart') return <ComparisonChart {...props} />
  if (type === 'QuoteCard')       return <QuoteCard       {...props} />
  if (type === 'MapHighlight')    return <MapHighlight    {...props} />

  return (
    <AbsoluteFill style={{ background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#666', fontSize: 16, fontFamily: 'sans-serif' }}>{type || 'motion graphic'}</div>
    </AbsoluteFill>
  )
}

// ── SceneRenderer — per-scene dispatch ───────────────────────────────────────
function SceneRenderer({ scene, imagePath, selectedClip }) {
  if (scene.shot_type === 'image') {
    if (!imagePath) return <PlaceholderScene scene={scene} />
    return <ImageScene scene={scene} imagePath={imagePath} />
  }
  if (scene.shot_type === 'motion_graphic') {
    return <MotionGraphicScene scene={scene} />
  }
  if (scene.shot_type === 'real_footage') {
    if (selectedClip) return <FootageScene clip={selectedClip} />
    return <PlaceholderScene scene={scene} />
  }
  return <PlaceholderScene scene={scene} />
}

// ── Documentary composition ───────────────────────────────────────────────────
export function Documentary({ scenes = [], imagePaths = {}, selectedClips = {} }) {
  console.log('[Documentary] received scenes:', scenes?.length, scenes)

  if (!scenes || scenes.length === 0) {
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

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        {scenes.map((scene) => (
          <Series.Sequence
            key={scene.scene_id}
            durationInFrames={(scene.duration_seconds || 5) * FPS}
          >
            <AbsoluteFill>
              {(() => {
                try {
                  return (
                    <SceneRenderer
                      scene={scene}
                      imagePath={imagePaths[scene.scene_id]}
                      selectedClip={selectedClips[scene.scene_id] || null}
                    />
                  )
                } catch (e) {
                  console.error('[Documentary] scene render error:', scene.scene_id, e)
                  return <PlaceholderScene scene={scene} />
                }
              })()}
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  )
}
