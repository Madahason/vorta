import { useMemo }                                                            from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, useVideoConfig, useCurrentFrame } from 'remotion'
import { TransitionSeries, springTiming, linearTiming }                      from '@remotion/transitions'
import { fade }                                                              from '@remotion/transitions/fade'
import ImageScene             from '../components/ImageScene'
import FootageScene           from '../components/FootageScene'
import PlaceholderScene       from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'

// ── Transition frame constants ────────────────────────────────────────────────
const TRANSITION_FRAMES = 12  // dissolve — crossfade overlap (0.4 s at 30 fps)
const CUT_FRAMES        = 1   // cut — near-instant (1 frame avoids TransitionSeries edge cases)
const DIP_FRAMES        = 18  // dip_black / dip_white — total overlap budget (both fade arms)
const DIP_FADE          = Math.round(DIP_FRAMES / 2) // 9 — each fade arm (to/from solid color)
const DIP_MID           = 8   // frames of solid color plate between the two fade arms

// ── getTransition(scene) ──────────────────────────────────────────────────────
// Pure function — reads scene.transition_out and returns a descriptor used by
// both the duration calculator and the flatMap renderer.
//
//   frames       — overlap eaten from this scene's tail (for the Transition element)
//   outgoingFade — frames eaten from this scene's end (same as frames for non-dip)
//   narrationIn  — frames to delay the NEXT scene's narration (incoming perspective)
//
// For dip types: the overlap in TransitionSeries is DIP_FADE (9 fr) not DIP_FRAMES (18 fr)
// because there are TWO Transition elements each of DIP_FADE, sandwiching a solid plate.
function getTransition(scene) {
  const type = scene?.transition_out || 'dissolve'
  switch (type) {
    case 'cut':
      return { type: 'cut', frames: CUT_FRAMES, outgoingFade: CUT_FRAMES, narrationIn: CUT_FRAMES }
    case 'dip_black':
      return { type: 'dip_black', frames: DIP_FADE, outgoingFade: DIP_FADE, narrationIn: DIP_FADE, color: '#000000' }
    case 'dip_white':
      return { type: 'dip_white', frames: DIP_FADE, outgoingFade: DIP_FADE, narrationIn: DIP_FADE, color: '#ffffff' }
    case 'dissolve':
    default:
      return { type: 'dissolve', frames: TRANSITION_FRAMES, outgoingFade: TRANSITION_FRAMES, narrationIn: TRANSITION_FRAMES }
  }
}

// ── Duration helpers ──────────────────────────────────────────────────────────
export function calculateDocumentaryDuration(scenes, fps = 30) {
  if (!scenes?.length) return 30
  const base = scenes.reduce((sum, s) => sum + Math.round((s.duration_seconds || 5) * fps), 0)

  // Per boundary: deduct the net frame cost of the transition.
  // For dip: two DIP_FADE overlaps remove frames, but the solid plate adds DIP_MID back.
  // Net dip cost = DIP_FADE + DIP_FADE - DIP_MID = 9 + 9 - 8 = 10.
  let deduction = 0
  for (let i = 0; i < scenes.length - 1; i++) {
    const t = getTransition(scenes[i])
    if (t.type === 'dip_black' || t.type === 'dip_white') {
      deduction += DIP_FADE + DIP_FADE - DIP_MID
    } else {
      deduction += t.frames
    }
  }

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

// Accept relative URLs (/...) and HTTP URLs — Windows absolute paths are not
// supported by Remotion headless Chrome; render.js always converts to HTTP URLs.
const isValidUrl = (src) => !!src && (src.startsWith('/') || src.startsWith('http'))

// ── SceneRenderer — per-scene dispatch ───────────────────────────────────────
function SceneRenderer({ scene, imagePath, selectedClip, globalSettings }) {
  if (!scene) return <PlaceholderScene scene={{ scene_id: 'unknown' }} />

  if (scene.shot_type === 'image') {
    const sceneWithImage = imagePath ? { ...scene, image_path: imagePath } : scene
    if (!sceneWithImage.image_path) return <PlaceholderScene scene={scene} />
    return <ImageScene scene={sceneWithImage} />
  }
  if (scene.shot_type === 'motion_graphic') {
    if (!scene.motion_component) return <PlaceholderScene scene={scene} />
    return <MotionGraphicScene scene={scene} />
  }
  if (scene.shot_type === 'real_footage') {
    if (!selectedClip) return <PlaceholderScene scene={scene} />
    return <FootageScene clip={selectedClip} scene={scene} />
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

  // Deduplicate scenes by scene_id — duplicate IDs cause TransitionSeries to render
  // extra sequences, making scenes replay multiple times.
  const uniqueScenes = useMemo(() => {
    const seen = new Set()
    return scenes.filter(s => {
      if (!s?.scene_id || seen.has(s.scene_id)) return false
      seen.add(s.scene_id)
      return true
    })
  }, [scenes])

  // Build narration spec map
  const validSceneIds = new Set(uniqueScenes.map(s => s.scene_id))
  const audioSpecMap  = {}
  audioSpecs.forEach(spec => {
    if (validSceneIds.has(spec.scene_id)) audioSpecMap[spec.scene_id] = spec
  })

  const narrationCount = Object.values(audioSpecMap).filter(s => s.narration?.url).length
  console.log('[Documentary] scenes:', scenes.length, '→ unique:', uniqueScenes.length,
    '| narration:', narrationCount, '/', audioSpecs.length)

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

  // Build flat array of Sequences and Transitions for TransitionSeries.
  // TransitionSeries requires direct children — no wrapping fragments.
  //
  // For dissolve / cut:
  //   [scene] → [Transition] → [next scene]
  //
  // For dip_black / dip_white:
  //   [scene] → [Transition fade DIP_FADE] → [solid plate DIP_MID] → [Transition fade DIP_FADE] → [next scene]
  //
  const seriesChildren = uniqueScenes.flatMap((scene, index) => {
    const durationFrames = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
    const spec           = audioSpecMap[scene.scene_id] || null
    const narrationUrl   = spec?.narration?.url || scene.audio_path || null

    // Outgoing transition descriptor — how this scene exits
    const outT = getTransition(scene)

    // Incoming transition descriptor — how the previous scene exited (determines narration delay)
    // Scene 0 has no incoming transition; delay = 0.
    const inT = index === 0 ? null : getTransition(uniqueScenes[index - 1])
    const narrationDelay = index === 0 ? 0 : inT.narrationIn

    const sequence = (
      <TransitionSeries.Sequence
        key={String(scene.scene_id)}
        durationInFrames={durationFrames}
      >
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

          {/* Per-scene narration.
              Delayed by the incoming transition's narrationIn so words don't start
              while the previous scene is still fading out / the dip color plate
              is still visible.
              Scene 0 → narrationDelay = 0 (no incoming transition).
              After dissolve → narrationDelay = 12 (after fade completes).
              After cut → narrationDelay = 1.
              After dip_black/dip_white → narrationDelay = 9 (after fade-in arm). */}
          {isValidUrl(narrationUrl) && (
            <Sequence from={narrationDelay}>
              <Audio
                src={narrationUrl}
                volume={(frame) => {
                  // Fade narration out ahead of the outgoing transition.
                  // outT.outgoingFade is how many frames this scene overlaps with what follows.
                  // Extra 9-frame buffer ensures the narration is silent before the visual cut.
                  const fadeStart = durationFrames - outT.outgoingFade - 9
                  if (frame >= fadeStart) {
                    return interpolate(frame, [fadeStart, durationFrames], [1.0, 0], {
                      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                    })
                  }
                  return 1.0
                }}
              />
            </Sequence>
          )}
        </AbsoluteFill>
      </TransitionSeries.Sequence>
    )

    // ── Build transition element(s) after this scene ──────────────────────────
    if (index < uniqueScenes.length - 1) {
      if (outT.type === 'dip_black' || outT.type === 'dip_white') {
        // Dip: two fade arms sandwiching a solid color plate.
        // Each Transition element overlaps its adjacent Sequence by DIP_FADE frames.
        const dipTiming = linearTiming({ durationInFrames: DIP_FADE })
        const dipFade1  = (
          <TransitionSeries.Transition
            key={`t1-${scene.scene_id}`}
            timing={dipTiming}
            presentation={fade()}
          />
        )
        const dipPlate  = (
          <TransitionSeries.Sequence
            key={`dip-${scene.scene_id}`}
            durationInFrames={DIP_MID}
          >
            <AbsoluteFill style={{ backgroundColor: outT.color }} />
          </TransitionSeries.Sequence>
        )
        const dipFade2  = (
          <TransitionSeries.Transition
            key={`t2-${scene.scene_id}`}
            timing={dipTiming}
            presentation={fade()}
          />
        )
        return [sequence, dipFade1, dipPlate, dipFade2]
      }

      if (outT.type === 'cut') {
        return [
          sequence,
          <TransitionSeries.Transition
            key={`t-${scene.scene_id}`}
            timing={linearTiming({ durationInFrames: CUT_FRAMES })}
            presentation={fade()}
          />,
        ]
      }

      // dissolve (default)
      return [
        sequence,
        <TransitionSeries.Transition
          key={`t-${scene.scene_id}`}
          timing={springTiming({ durationInFrames: TRANSITION_FRAMES, config: { damping: 200 } })}
          presentation={fade()}
        />,
      ]
    }

    return [sequence]
  })

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Global uploaded narration track (from ExportPanel audio upload) */}
      {audio?.path && <NarrationTrack audio={audio} />}

      <TransitionSeries>
        {seriesChildren}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
