import { AbsoluteFill, Series, Audio, interpolate, useVideoConfig, useCurrentFrame } from 'remotion'
import ImageScene             from '../components/ImageScene'
import FootageScene           from '../components/FootageScene'
import PlaceholderScene       from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'
import { SafeAudio }          from '../components/SafeAudio'

// ── Duration helpers ──────────────────────────────────────────────────────────
export function calculateDocumentaryDuration(scenes) {
  if (!scenes?.length) return 30
  return Math.max(
    scenes.reduce((sum, s) => sum + Math.round((s.duration_seconds || 5) * 30), 0),
    30
  )
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
export function Documentary({
  scenes         = [],
  imagePaths     = {},
  selectedClips  = {},
  globalSettings = {},
  audio          = null,
  audioSpecs     = [],
}) {
  const { fps } = useVideoConfig()

  // Filter audioSpecs to only entries whose scene_id exists in the current scene list.
  // Stale specs from a previous analysis (different scene count) are silently dropped
  // so they never crash the Series sequencing.
  const validSceneIds = new Set(scenes.map(s => s.scene_id))
  const audioSpecMap  = {}
  audioSpecs.forEach(spec => {
    if (validSceneIds.has(spec.scene_id)) audioSpecMap[spec.scene_id] = spec
  })

  console.log('[Documentary] scenes:', scenes.length, 'audioSpecs valid:', Object.keys(audioSpecMap).length, '/', audioSpecs.length)

  if (!scenes.length) {
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
          const durationFrames = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
          const spec           = audioSpecMap[scene.scene_id] || null

          return (
            <Series.Sequence key={scene.scene_id} durationInFrames={durationFrames}>
              <AbsoluteFill>
                {/* ── Visual layer — isolated so one broken scene can't kill the rest ── */}
                <ErrorBoundaryScene scene={scene}>
                  <SceneRenderer
                    scene={scene}
                    imagePath={imagePaths[scene.scene_id]}
                    selectedClip={selectedClips[scene.scene_id] || null}
                    globalSettings={globalSettings}
                  />
                </ErrorBoundaryScene>

                {/* ── Audio layers — outside error boundary so audio errors are independent ── */}

                {/* Layer 1: Per-scene ElevenLabs narration (spec.narration.url preferred, fallback scene.audio_path) */}
                {(spec?.narration?.url || scene.audio_path) && (
                  <SafeAudio
                    src={spec?.narration?.url || scene.audio_path}
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

                {/* Layer 2: Background music (12% volume, cross-fade at boundaries) */}
                {spec?.music?.url && (
                  <SafeAudio
                    src={spec.music.url}
                    volume={(frame) => {
                      const fade    = 15
                      const fadeIn  = Math.min(frame / Math.max(fade, 1), 1)
                      const fadeOut = Math.min((durationFrames - frame) / Math.max(fade, 1), 1)
                      return (spec.music.volume || 0.12) * Math.min(fadeIn, fadeOut)
                    }}
                    loop
                  />
                )}

                {/* Layer 3: Ambient sound (6%, looping) */}
                {spec?.ambient?.url && (
                  <SafeAudio
                    src={spec.ambient.url}
                    volume={spec.ambient.volume || 0.06}
                    loop
                  />
                )}

                {/* Layer 4: Transition sting (skip scene 1 — no incoming transition) */}
                {spec?.sting?.url && index > 0 && (
                  <SafeAudio
                    src={spec.sting.url}
                    volume={spec.sting.volume || 0.45}
                  />
                )}
              </AbsoluteFill>
            </Series.Sequence>
          )
        })}
      </Series>
    </AbsoluteFill>
  )
}
