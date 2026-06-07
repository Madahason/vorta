import { AbsoluteFill, Series, Audio, interpolate, useVideoConfig, useCurrentFrame } from 'remotion'
import ImageScene          from '../components/ImageScene'
import FootageScene        from '../components/FootageScene'
import PlaceholderScene    from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'

const FPS = 30

// ── Duration helpers ──────────────────────────────────────────────────────────
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
  scenes.forEach((scene) => {
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

// ── NarrationTrack — global uploaded audio from ExportPanel ──────────────────
function NarrationTrack({ audio }) {
  const { durationInFrames, fps } = useVideoConfig()
  const frame = useCurrentFrame()

  const startFrom = Math.round((audio.startFrom || 0) * fps)
  const vol       = audio.volume !== undefined ? audio.volume : 0.85
  const fadeInF   = Math.round((audio.fadeIn  || 0.5) * fps)
  const fadeOutF  = Math.round((audio.fadeOut || 2.0) * fps)
  const fadeStart = durationInFrames - fadeOutF

  const volume = (f) => {
    if (f < fadeInF)   return interpolate(f, [0, Math.max(fadeInF, 1)], [0, vol], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    if (f > fadeStart) return interpolate(f, [fadeStart, durationInFrames], [vol, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return vol
  }

  return <Audio src={audio.path} startFrom={startFrom} volume={volume} />
}

// ── Documentary composition ───────────────────────────────────────────────────
// audioSpecs: [{ scene_id, narration, music, ambient, sting }] — from AudioPanel
// globalSettings: { grainIntensity?: number }
export function Documentary({
  scenes        = [],
  imagePaths    = {},
  selectedClips = {},
  globalSettings = {},
  audio          = null,
  audioSpecs     = [],
}) {
  console.log('[Documentary] received scenes:', scenes?.length, 'audioSpecs:', audioSpecs?.length)

  // Build a fast lookup map from the audioSpecs array
  const audioSpecMap = {}
  audioSpecs.forEach(spec => { audioSpecMap[spec.scene_id] = spec })

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
      {/* Global uploaded narration track (from ExportPanel audio upload) */}
      {audio?.path && <NarrationTrack audio={audio} />}

      <Series>
        {scenes.map((scene, index) => {
          const durationFrames = (scene.duration_seconds || 5) * FPS
          const audioSpec      = audioSpecMap[scene.scene_id]

          return (
            <Series.Sequence
              key={scene.scene_id}
              durationInFrames={durationFrames}
            >
              <AbsoluteFill>
                {/* ── Audio Layer 1: Per-scene ElevenLabs narration ── */}
                {scene.audio_path && (
                  <Audio
                    src={scene.audio_path}
                    volume={(frame) => {
                      // Fade out the last 9 frames (300ms at 30fps) to prevent click
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

                {/* ── Audio Layer 2: Background music (12%) ── */}
                {audioSpec?.music?.url && (
                  <Audio
                    src={audioSpec.music.url}
                    volume={(frame) => {
                      // Cross-fade in/out over 15 frames (500ms) at each boundary
                      const fadeFrames = 15
                      const fadeIn  = Math.min(frame / Math.max(fadeFrames, 1), 1)
                      const fadeOut = Math.min((durationFrames - frame) / Math.max(fadeFrames, 1), 1)
                      return audioSpec.music.volume * Math.min(fadeIn, fadeOut)
                    }}
                    loop
                  />
                )}

                {/* ── Audio Layer 3: Ambient sound (6%) ── */}
                {audioSpec?.ambient?.url && (
                  <Audio
                    src={audioSpec.ambient.url}
                    volume={audioSpec.ambient.volume}
                    loop
                  />
                )}

                {/* ── Audio Layer 4: Transition sting (plays once at scene start, skip first scene) ── */}
                {audioSpec?.sting?.url && index > 0 && (
                  <Audio
                    src={audioSpec.sting.url}
                    volume={audioSpec.sting.volume}
                  />
                )}

                {/* ── Visual layer ── */}
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
          )
        })}
      </Series>
    </AbsoluteFill>
  )
}
