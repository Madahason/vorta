import { AbsoluteFill, Series, Audio, interpolate, useVideoConfig, useCurrentFrame } from 'remotion'
import ImageScene          from '../components/ImageScene'
import FootageScene        from '../components/FootageScene'
import PlaceholderScene    from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'

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

// ── SceneRenderer — per-scene dispatch ───────────────────────────────────────
function SceneRenderer({ scene, imagePath, selectedClip, globalSettings }) {
  if (scene.shot_type === 'image') {
    if (!imagePath) return <PlaceholderScene scene={scene} />
    return <ImageScene scene={scene} imagePath={imagePath} globalSettings={globalSettings} />
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

// ── NarrationTrack ────────────────────────────────────────────────────────────
function NarrationTrack({ audio }) {
  const { durationInFrames, fps } = useVideoConfig()
  const frame = useCurrentFrame()

  const startFrom  = Math.round((audio.startFrom  || 0) * fps)
  const vol        = audio.volume  !== undefined ? audio.volume  : 0.85
  const fadeInF    = Math.round((audio.fadeIn  || 0.5) * fps)
  const fadeOutF   = Math.round((audio.fadeOut || 2.0) * fps)
  const fadeStart  = durationInFrames - fadeOutF

  const volume = (f) => {
    if (f < fadeInF)           return interpolate(f, [0, Math.max(fadeInF, 1)], [0, vol], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    if (f > fadeStart)         return interpolate(f, [fadeStart, durationInFrames], [vol, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return vol
  }

  return (
    <Audio
      src={audio.path}
      startFrom={startFrom}
      volume={volume}
    />
  )
}

// ── Documentary composition ───────────────────────────────────────────────────
// globalSettings: { grainIntensity?: number } — 0 disables grain across all scenes
export function Documentary({ scenes = [], imagePaths = {}, selectedClips = {}, globalSettings = {}, audio = null }) {
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
      {audio?.path && <NarrationTrack audio={audio} />}
      <Series>
        {scenes.map((scene) => (
          <Series.Sequence
            key={scene.scene_id}
            durationInFrames={(scene.duration_seconds || 5) * FPS}
          >
            <AbsoluteFill>
              {scene.audio_path && (
                <Audio
                  src={scene.audio_path}
                  volume={(frame) => {
                    // Fade out the last 9 frames (300ms at 30fps) to prevent hard-cut
                    // click/pop artifacts at scene boundaries.
                    const durationFrames = (scene.duration_seconds || 5) * FPS
                    const fadeStart = durationFrames - 9
                    if (frame >= fadeStart) {
                      return interpolate(frame, [fadeStart, durationFrames], [1.0, 0], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      })
                    }
                    return 1.0
                  }}
                />
              )}
              {(() => {
                try {
                  return (
                    <SceneRenderer
                      scene={scene}
                      imagePath={imagePaths[scene.scene_id]}
                      selectedClip={selectedClips[scene.scene_id] || null}
                      globalSettings={globalSettings}
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
