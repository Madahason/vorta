import { AbsoluteFill, Series, Audio, interpolate, useVideoConfig, useCurrentFrame } from 'remotion'
import ImageScene             from '../components/ImageScene'
import FootageScene           from '../components/FootageScene'
import PlaceholderScene       from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'

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

// Only render Audio when the src is a routable URL (not a bare filesystem path)
const isValidUrl = (src) => !!src && (src.startsWith('/') || src.startsWith('http'))

// Return the most frequently occurring value in an array (picks one music/ambient URL for the whole video)
function mostCommon(arr) {
  if (!arr.length) return null
  const freq = arr.reduce((map, val) => { map[val] = (map[val] || 0) + 1; return map }, {})
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
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

  // Filter audioSpecs to only entries whose scene_id exists in the current scene list
  const validSceneIds = new Set(scenes.map(s => s.scene_id))
  const audioSpecMap  = {}
  audioSpecs.forEach(spec => {
    if (validSceneIds.has(spec.scene_id)) audioSpecMap[spec.scene_id] = spec
  })

  // Derive a single music and ambient URL to play continuously under the whole video.
  // Music and ambient loop — they don't need to remount per scene. Using one global
  // track per layer reduces audio tags from 4×N down to N+2 (narration per scene + 2 global).
  const allSpecs      = Object.values(audioSpecMap)
  const musicUrls     = allSpecs.map(s => s.music?.url).filter(Boolean)
  const ambientUrls   = allSpecs.map(s => s.ambient?.url).filter(Boolean)
  const primaryMusic  = mostCommon(musicUrls)
  const primaryAmbient = mostCommon(ambientUrls)
  const musicVolume   = allSpecs.find(s => s.music?.volume)?.music?.volume  || 0.12
  const ambientVolume = allSpecs.find(s => s.ambient?.volume)?.ambient?.volume || 0.06

  console.log('[Documentary] scenes:', scenes.length,
    'audioSpecs valid:', allSpecs.length, '/', audioSpecs.length,
    'music:', !!primaryMusic, 'ambient:', !!primaryAmbient)

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

      {/* Continuous background music — single track under the entire video.
          Avoids remounting an Audio tag on every scene transition. */}
      {isValidUrl(primaryMusic) && (
        <Audio src={primaryMusic} volume={musicVolume} loop startFrom={0} />
      )}

      {/* Continuous ambient sound — single looping track under the entire video. */}
      {isValidUrl(primaryAmbient) && (
        <Audio src={primaryAmbient} volume={ambientVolume} loop startFrom={0} />
      )}

      {/* Scene sequences — visual layer + per-scene narration only.
          Total audio tags = scenes.length + 2 (music + ambient), well within any limit. */}
      <Series>
        {scenes.map((scene) => {
          const durationFrames = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
          const spec           = audioSpecMap[scene.scene_id] || null
          const narrationUrl   = spec?.narration?.url || scene.audio_path || null

          return (
            <Series.Sequence key={scene.scene_id} durationInFrames={durationFrames}>
              <AbsoluteFill>
                {/* ── Visual layer ── */}
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
            </Series.Sequence>
          )
        })}
      </Series>
    </AbsoluteFill>
  )
}
